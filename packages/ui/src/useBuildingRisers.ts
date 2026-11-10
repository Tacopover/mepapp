import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BuildingFile, BuildingSheet, Calibration } from '@mepapp/core';
import type { CanvasContextMenuTarget, DocumentSummary, SceneNotice, SketchScene } from '@mepapp/render';
import type { OpenBuilding } from './buildingController.js';
import { readSummaries } from './quantitiesScope.js';
import {
  activeSheetOf,
  applyRiserTypeChange,
  attachAction,
  buildRiserAnchors,
  buildRiserMarks,
  deleteRiserAction,
  detachAction,
  firstMemberFrame,
  HINT_NOT_IN_BUILDING,
  HINT_NO_SCALE,
  makeRiserAction,
  removalRefusedText,
  riserMenuModel,
  type RiserActionResult,
  type RiserMenuModel,
  type ShownPage,
} from './riserActions.js';

export interface RiserMenuState {
  model: RiserMenuModel;
  fittingId: string | null;
  riserId: string | null;
}

interface Outcome {
  file: BuildingFile;
  notice: SceneNotice | null;
}

interface LiveValues {
  building: OpenBuilding | null;
  sheet: BuildingSheet | null;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  pushToast: (notice: SceneNotice) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fromResult(file: BuildingFile, result: RiserActionResult): Outcome {
  if (result.ok) return { file: result.file, notice: { kind: 'info', message: result.message } };
  return { file, notice: { kind: 'warning', message: result.text } };
}

function shownPageOf(scene: SketchScene): ShownPage | null {
  const size = scene.getDisplayedPageSize();
  if (size === null) return null;
  return { ...size, pageUnitsPerRealUnit: scene.getCalibration()?.pageUnitsPerRealUnit ?? null };
}

function hasScaleOf(page: ShownPage | null): boolean {
  return page !== null && page.pageUnitsPerRealUnit !== null && page.pageUnitsPerRealUnit > 0;
}

function sheetOnShownPage(file: BuildingFile | null, documents: DocumentSummary[], activeDocumentId: string | null, pageIndex: number): BuildingSheet | null {
  const projectUuid = documents.find((doc) => doc.id === activeDocumentId)?.projectUuid ?? null;
  return activeSheetOf(file, projectUuid, pageIndex);
}

export function useBuildingRisers(args: {
  sceneRef: RefObject<SketchScene | null>;
  ready: boolean;
  building: OpenBuilding | null;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  documents: DocumentSummary[];
  activeDocumentId: string | null;
  pageIndex: number;
  calibration: Calibration | null;
  pushToast: (notice: SceneNotice) => void;
}) {
  const { sceneRef, ready, building, update, documents, activeDocumentId, pageIndex, calibration, pushToast } = args;
  const file = building?.file ?? null;
  const sheet = sheetOnShownPage(file, documents, activeDocumentId, pageIndex);
  const [pendingDelete, setPendingDelete] = useState<{ riserId: string; label: string } | null>(null);
  const [sceneTick, setSceneTick] = useState(0);
  const live = useRef<LiveValues>({ building, sheet, update, pushToast });
  live.current = { building, sheet, update, pushToast };

  const commit = async (build: (current: BuildingFile) => Outcome): Promise<void> => {
    let outcome = null as Outcome | null;
    await live.current.update((current) => {
      const next = build(current);
      outcome = next;
      return next.file;
    });
    if (outcome !== null && outcome.notice !== null) live.current.pushToast(outcome.notice);
  };

  const guard = (task: () => Promise<void>): void => {
    task().catch((error: unknown) => live.current.pushToast({ kind: 'warning', message: `Could not update the riser: ${messageOf(error)}` }));
  };

  const menuStateFor = (target: CanvasContextMenuTarget): RiserMenuState => {
    const scene = sceneRef.current;
    const fittingId = target.drawFrom?.point.kind === 'fitting' ? target.drawFrom.point.fittingId : null;
    const fittingContext = scene && fittingId !== null ? scene.getFittingContext(fittingId) : null;
    const riserId = scene && fittingId !== null ? (scene.getRiserMarks().get(fittingId)?.riserId ?? null) : null;
    const page = scene ? shownPageOf(scene) : null;
    const model = riserMenuModel({ file, sheet, hasScale: hasScaleOf(page), fittingContext, markedRiserId: riserId });
    return { model, fittingId, riserId };
  };

  const makeRiser = (fittingId: string): void => {
    const scene = sceneRef.current;
    if (!scene) return;
    const context = scene.getFittingContext(fittingId);
    const networkType = context ? scene.getNetworkTypes().find((candidate) => candidate.id === context.networkTypeIds[0]) : undefined;
    if (!context || !networkType) {
      pushToast({ kind: 'warning', message: 'Could not find the network type of this fitting.' });
      return;
    }
    if (building === null || sheet === null) {
      pushToast({ kind: 'warning', message: HINT_NOT_IN_BUILDING });
      return;
    }
    const page = shownPageOf(scene);
    if (page === null) {
      pushToast({ kind: 'warning', message: HINT_NO_SCALE });
      return;
    }
    guard(() =>
      commit((current) =>
        fromResult(current, makeRiserAction(current, { id: crypto.randomUUID(), networkType, sheet, fittingId, fittingPt: context.position, page })),
      ),
    );
  };

  const detach = (riserId: string): void => {
    if (building === null || sheet === null) {
      pushToast({ kind: 'warning', message: HINT_NOT_IN_BUILDING });
      return;
    }
    guard(() => commit((current) => fromResult(current, detachAction(current, riserId, sheet))));
  };

  const askDelete = (riserId: string): void => {
    const riser = file?.risers.find((candidate) => candidate.id === riserId);
    if (riser === undefined) return;
    setPendingDelete({ riserId, label: riser.name });
  };

  const confirmDelete = (): void => {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (pending === null) return;
    guard(() => commit((current) => fromResult(current, deleteRiserAction(current, pending.riserId))));
  };

  const cancelDelete = (): void => setPendingDelete(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const bump = () => setSceneTick((tick) => tick + 1);
    scene.on('documentActivated', bump);
    scene.on('pageChanged', bump);
    scene.on('calibrationSet', bump);
    return () => {
      scene.off('documentActivated', bump);
      scene.off('pageChanged', bump);
      scene.off('calibrationSet', bump);
    };
  }, [ready, sceneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const shown = shownPageOf(scene);
    scene.setRiserMarks(
      file && sheet ? buildRiserMarks(file, sheet, shown, (fittingId) => scene.getFittingContext(fittingId)?.position ?? null) : new Map(),
    );
    scene.setRiserAnchors(file && sheet ? buildRiserAnchors(file, sheet, shown) : []);
  }, [ready, sceneRef, file, sheet, calibration, sceneTick]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const onAttach = (info: { riserId: string; fittingId: string }) => {
      guard(async () => {
        const active = sceneRef.current;
        const open = live.current.building;
        const onSheet = live.current.sheet;
        if (!active) return;
        if (open === null || onSheet === null) {
          live.current.pushToast({ kind: 'warning', message: HINT_NOT_IN_BUILDING });
          return;
        }
        const page = shownPageOf(active);
        if (page === null) {
          live.current.pushToast({ kind: 'warning', message: HINT_NO_SCALE });
          return;
        }
        const { summaries } = await readSummaries(open.store);
        const after = live.current;
        if (after.building?.file.id !== open.file.id || after.sheet === null || after.sheet.id !== onSheet.id) return;
        const riser = open.file.risers.find((candidate) => candidate.id === info.riserId);
        const firstFrame = riser === undefined ? null : firstMemberFrame(open.file, riser, summaries);
        const segmentNetworkTypeId = active.getFittingContext(info.fittingId)?.networkTypeIds[0] ?? null;
        await commit((current) =>
          fromResult(current, attachAction(current, { riserId: info.riserId, sheet: onSheet, fittingId: info.fittingId, segmentNetworkTypeId, page, firstFrame })),
        );
      });
    };
    const onTypeChange = (info: { riserIds: string[]; networkTypeId: string }) => {
      guard(async () => {
        const active = sceneRef.current;
        const open = live.current.building;
        const onSheet = live.current.sheet;
        if (!active || open === null) return;
        const networkType = active.getNetworkTypes().find((candidate) => candidate.id === info.networkTypeId);
        if (networkType === undefined) return;
        const { summaries } = await readSummaries(open.store);
        const after = live.current;
        if (after.building?.file.id !== open.file.id || after.sheet?.id !== onSheet?.id) return;
        await commit((current): Outcome => {
          const result = applyRiserTypeChange(current, {
            eventRiserIds: info.riserIds,
            networkType,
            activeSheetId: onSheet?.id ?? '',
            summaries,
          });
          return { file: result.file, notice: result.message === null ? null : { kind: 'info', message: result.message } };
        });
      });
    };
    const onRefused = (info: { fittingId: string }) => {
      const label = sceneRef.current?.getRiserMarks().get(info.fittingId)?.name;
      live.current.pushToast({ kind: 'warning', message: removalRefusedText(label ?? 'a riser') });
    };
    scene.on('riserAttachRequested', onAttach);
    scene.on('riserTypeChangeRequested', onTypeChange);
    scene.on('fittingRemovalRefused', onRefused);
    return () => {
      scene.off('riserAttachRequested', onAttach);
      scene.off('riserTypeChangeRequested', onTypeChange);
      scene.off('fittingRemovalRefused', onRefused);
    };
  }, [ready, sceneRef]);

  return { menuStateFor, makeRiser, detach, askDelete, pendingDelete, confirmDelete, cancelDelete };
}
