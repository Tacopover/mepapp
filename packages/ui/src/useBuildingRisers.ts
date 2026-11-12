import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BuildingFile, BuildingSheet, Calibration, SheetSummary, Vec2 } from '@mepapp/core';
import type { CanvasContextMenuTarget, DocumentSummary, RiserMark, SceneNotice, SketchScene } from '@mepapp/render';
import type { OpenBuilding } from './buildingController.js';
import { readSummaries } from './quantitiesScope.js';
import {
  dropPendingOps,
  hasPendingMove,
  hasPendingOps,
  pendingLinkOf,
  pendingNotices,
  planPendingOps,
  summaryFrameOf,
  type PendingEdit,
  type PendingFrame,
} from './riserPending.js';
import {
  activeSheetOf,
  applyRiserTypeChange,
  attachAction,
  buildRiserAnchors,
  buildRiserMarks,
  conflictLaterText,
  conflictTolerancePt,
  deleteRiserAction,
  detachAction,
  firstMemberFrame,
  HINT_NOT_IN_BUILDING,
  HINT_NO_SCALE,
  HINT_TWO_TYPES,
  makeRiserAction,
  planRiserMove,
  removalRefusedText,
  riserConflictInfo,
  riserMenuModel,
  riserOfFitting,
  type LiveTarget,
  type RiserActionResult,
  type RiserConflictInfo,
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
  after?: () => void;
}

interface LiveValues {
  building: OpenBuilding | null;
  sheet: BuildingSheet | null;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  pushToast: (notice: SceneNotice) => void;
  pathOfDocument: (documentId: string) => string | undefined;
  isLoading: () => boolean;
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

function sameConflict(a: RiserConflictInfo | null, b: RiserConflictInfo | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.riserId === b.riserId &&
    a.fittingId === b.fittingId &&
    a.distanceMm === b.distanceMm &&
    a.fittingPt.x === b.fittingPt.x &&
    a.fittingPt.y === b.fittingPt.y &&
    a.anchorPt.x === b.anchorPt.x &&
    a.anchorPt.y === b.anchorPt.y
  );
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
  pathOfDocument: (documentId: string) => string | undefined;
  isLoading: () => boolean;
}) {
  const { sceneRef, ready, building, update, documents, activeDocumentId, pageIndex, calibration, pushToast, pathOfDocument, isLoading } = args;
  const file = building?.file ?? null;
  const sheet = sheetOnShownPage(file, documents, activeDocumentId, pageIndex);
  const [pendingDelete, setPendingDelete] = useState<{ riserId: string; label: string } | null>(null);
  const [sceneTick, setSceneTick] = useState(0);
  const [conflict, setConflict] = useState<RiserConflictInfo | null>(null);
  const [conflictKeys, setConflictKeys] = useState<ReadonlySet<string>>(() => new Set<string>());
  const conflictKeysJoined = useRef('');
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set<string>());
  const syncing = useRef(0);
  const pendingQueue = useRef<Promise<void>>(Promise.resolve());
  const notified = useRef(new Set<string>());
  const live = useRef<LiveValues>({ building, sheet, update, pushToast, pathOfDocument, isLoading });
  live.current = { building, sheet, update, pushToast, pathOfDocument, isLoading };

  const commit = async (build: (current: BuildingFile) => Outcome): Promise<void> => {
    let outcome = null as Outcome | null;
    let failure: unknown = null;
    try {
      await live.current.update((current) => {
        const next = build(current);
        outcome = next;
        return next.file;
      });
    } catch (error: unknown) {
      failure = error;
    }
    if (outcome !== null && outcome.notice !== null) live.current.pushToast(outcome.notice);
    if (outcome !== null && outcome.after) outcome.after();
    if (failure !== null && outcome === null) throw failure;
    if (failure !== null && outcome !== null) live.current.pushToast({ kind: 'warning', message: `The building file was not saved: ${messageOf(failure)}` });
  };

  const guard = (task: () => Promise<void>): void => {
    task().catch((error: unknown) => live.current.pushToast({ kind: 'warning', message: `Could not update the riser: ${messageOf(error)}` }));
  };

  const runPending = async (only: string | null): Promise<void> => {
    const scene = sceneRef.current;
    const start = live.current.building;
    if (!scene || start === null) return;
    let summaries: ReadonlyMap<string, SheetSummary> | null = null;
    for (const doc of scene.getDocuments()) {
      if (only !== null && doc.id !== only) continue;
      if (doc.projectUuid === null) continue;
      for (const sheet of start.file.sheets) {
        if (sheet.projectUuid !== doc.projectUuid) continue;
        const open = live.current.building;
        if (open === null || open.file.id !== start.file.id) return;
        let file = open.file;
        if (!hasPendingOps(file, sheet.id)) {
          for (const token of notified.current) {
            if (token.startsWith(`${sheet.id}|`)) notified.current.delete(token);
          }
          continue;
        }
        const path = live.current.pathOfDocument(doc.id);
        const link = pendingLinkOf(
          file,
          { projectUuid: doc.projectUuid, projectUuidInFile: doc.projectUuidInFile, ...(path === undefined ? {} : { path }), fileName: doc.fileName, sizeBytes: doc.sizeBytes },
          sheet,
        );
        const sceneFrame = scene.getDocumentPageFrame(doc.id, sheet.pageIndex);
        let frame: PendingFrame | null =
          sceneFrame === null ? null : { heightPt: sceneFrame.heightPt, pageUnitsPerRealUnit: sceneFrame.pageUnitsPerRealUnit, source: 'scene' };
        if (frame === null && link !== 'ambiguous' && hasPendingMove(file, sheet.id)) {
          if (summaries === null) {
            try {
              summaries = (await readSummaries(start.store)).summaries;
            } catch {
              summaries = new Map<string, SheetSummary>();
            }
          }
          frame = summaryFrameOf(summaries, sheet);
          const after = live.current.building;
          if (after === null || after.file.id !== start.file.id) return;
          file = after.file;
        }
        const plan = planPendingOps(file, { sheet, link, frame });
        const applied: PendingEdit[] = [];
        for (const edit of plan.edits) {
          if (edit.kind === 'move') {
            if (edit.toPt !== undefined && scene.applyRemoteFittingMoveIn(doc.id, edit.fittingId, edit.toPt)) applied.push(edit);
          } else if (edit.networkType !== undefined && scene.applyRemoteRetagIn(doc.id, edit.fittingId, edit.networkType)) {
            applied.push(edit);
          }
        }
        const keys = [...plan.obsolete, ...applied.map((edit) => edit.key)];
        if (keys.length > 0) await commit((current) => ({ file: dropPendingOps(current, keys), notice: null }));
        for (const notice of pendingNotices({ file, sheet, link, plan, applied })) {
          if (notice.kind === 'info') {
            live.current.pushToast(notice);
            continue;
          }
          const token = `${sheet.id}|${notice.message}`;
          if (notified.current.has(token)) continue;
          notified.current.add(token);
          live.current.pushToast(notice);
        }
        if (plan.waiting === null) {
          for (const token of notified.current) {
            if (token.startsWith(`${sheet.id}|`)) notified.current.delete(token);
          }
        }
        if (applied.length > 0) setSceneTick((tick) => tick + 1);
      }
    }
  };

  const enqueuePending = (only: string | null): void => {
    pendingQueue.current = pendingQueue.current
      .then(() => runPending(only))
      .catch((error: unknown) => live.current.pushToast({ kind: 'warning', message: `Could not apply the riser changes: ${messageOf(error)}` }));
  };

  const applyPendingForDocument = (documentId: string): void => {
    notified.current.clear();
    enqueuePending(documentId);
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

  const drawFromRing = (riserId: string): void => {
    const scene = sceneRef.current;
    if (!scene) return;
    const anchor = scene.getRiserAnchors().find((candidate) => candidate.riserId === riserId);
    if (anchor === undefined) {
      pushToast({ kind: 'warning', message: 'This riser does not exist any more.' });
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
    guard(async () => {
      const open = live.current.building;
      const onSheet = live.current.sheet;
      if (open === null || onSheet === null) {
        live.current.pushToast({ kind: 'warning', message: HINT_NOT_IN_BUILDING });
        return;
      }
      const { summaries } = await readSummaries(open.store);
      const after = live.current;
      if (after.building?.file.id !== open.file.id || after.sheet === null || after.sheet.id !== onSheet.id) return;
      const riser = open.file.risers.find((candidate) => candidate.id === riserId);
      const firstFrame = riser === undefined ? null : firstMemberFrame(open.file, riser, summaries);
      const fittingId = scene.riserAnchorFittingId(anchor);
      const context = scene.getFittingContext(fittingId);
      if (context !== null && context.networkTypeIds.length > 1) {
        live.current.pushToast({ kind: 'warning', message: HINT_TWO_TYPES });
        return;
      }
      const segmentNetworkTypeId = context?.networkTypeIds[0] ?? anchor.networkTypeId;
      await commit((current): Outcome => {
        const result = attachAction(current, { riserId, sheet: onSheet, fittingId, segmentNetworkTypeId, page, firstFrame });
        const outcome = fromResult(current, result);
        if (!result.ok) return outcome;
        return {
          ...outcome,
          after: () => {
            if (live.current.sheet?.id === onSheet.id) scene.drawFromRiserAnchor(anchor, fittingId);
            setSceneTick((tick) => tick + 1);
          },
        };
      });
    });
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

  const syncMove = (fittingId: string, toPt: Vec2): void => {
    const scene = sceneRef.current;
    const open = live.current.building;
    const onSheet = live.current.sheet;
    if (!scene || open === null || onSheet === null) return;
    const riser = riserOfFitting(open.file, onSheet.id, fittingId);
    if (riser === null) return;
    const fromPage = shownPageOf(scene);
    if (fromPage === null) {
      live.current.pushToast({ kind: 'warning', message: HINT_NO_SCALE });
      return;
    }
    const liveTargetOf = (target: BuildingSheet): LiveTarget | null => {
      const doc = target.projectUuid === null ? undefined : scene.getDocuments().find((candidate) => candidate.projectUuid === target.projectUuid);
      if (doc === undefined) return null;
      const frame = scene.getDocumentPageFrame(doc.id, target.pageIndex);
      if (frame === null) return null;
      return { docId: doc.id, heightPt: frame.heightPt, pageUnitsPerRealUnit: frame.pageUnitsPerRealUnit };
    };
    syncing.current += 1;
    guard(async () => {
      try {
        await commit((current): Outcome => {
          const result = planRiserMove(current, { riserId: riser.id, fromSheet: onSheet, toPt, fromPage, liveTargetOf });
          if (!result.ok) return { file: current, notice: { kind: 'warning', message: result.text } };
          return {
            file: result.file,
            notice: result.message === null ? null : { kind: 'info', message: result.message },
            after: () => {
              for (const move of result.live) scene.applyRemoteFittingMoveIn(move.docId, move.fittingId, move.toPt);
            },
          };
        });
      } finally {
        syncing.current -= 1;
        if (syncing.current === 0) setSceneTick((tick) => tick + 1);
      }
    });
  };

  const resolveConflictMoveHere = (): void => {
    const pending = conflict;
    setConflict(null);
    if (pending !== null) syncMove(pending.fittingId, pending.fittingPt);
  };

  const resolveConflictSnapBack = (): void => {
    const pending = conflict;
    setConflict(null);
    if (pending === null) return;
    sceneRef.current?.moveFittingTo(pending.fittingId, pending.anchorPt, { source: 'riser-sync' });
    setSceneTick((tick) => tick + 1);
  };

  const applyConflictKeys = (keys: string[]): void => {
    const unique = [...new Set(keys)].sort();
    const joined = unique.join('\n');
    if (joined === conflictKeysJoined.current) return;
    conflictKeysJoined.current = joined;
    setConflictKeys(new Set(unique));
  };

  const decideConflictLater = (): void => {
    const pending = conflict;
    setConflict(null);
    if (pending === null) return;
    setDismissed((set) => new Set(set).add(pending.fittingId));
    live.current.pushToast({ kind: 'warning', message: conflictLaterText(pending.label) });
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const bump = () => {
      setDismissed((set) => (set.size === 0 ? set : new Set<string>()));
      setSceneTick((tick) => tick + 1);
    };
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
    const marks = file && sheet ? buildRiserMarks(file, sheet, shown, (fittingId) => scene.getFittingContext(fittingId)?.position ?? null) : new Map<string, RiserMark>();
    scene.setRiserMarks(marks);
    scene.setRiserAnchors(file && sheet ? buildRiserAnchors(file, sheet, shown) : []);
    if (syncing.current > 0) return;
    if (file && sheet && hasPendingMove(file, sheet.id)) {
      setConflict(null);
      applyConflictKeys([]);
      return;
    }
    if (!file || !sheet) {
      setConflict(null);
      applyConflictKeys([]);
      return;
    }
    const tolerance = conflictTolerancePt(shown);
    const found = tolerance === null ? [] : scene.riserConflicts(tolerance);
    let changed = false;
    for (const candidate of found) {
      const mark = marks.get(candidate.fittingId);
      if (!dismissed.has(candidate.fittingId) || mark === undefined) continue;
      marks.set(candidate.fittingId, { ...mark, undecided: true });
      changed = true;
    }
    if (changed) scene.setRiserMarks(marks);
    const keys: string[] = [];
    for (const candidate of found) {
      const riser = riserOfFitting(file, sheet.id, candidate.fittingId);
      if (riser !== null) keys.push(`${riser.id}|${sheet.id}`);
    }
    applyConflictKeys(keys);
    const first = found.find((candidate) => !dismissed.has(candidate.fittingId)) ?? null;
    const next = first === null ? null : riserConflictInfo(file, sheet, first, shown);
    setConflict((previous) => (sameConflict(previous, next) ? previous : next));
  }, [ready, sceneRef, file, sheet, calibration, sceneTick, dismissed]);

  useEffect(() => {
    if (!ready || live.current.isLoading()) return;
    enqueuePending(null);
  }, [ready, file, documents, activeDocumentId, pageIndex, calibration, sceneTick]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const onMoved = (info: { fittingId: string; to: Vec2 }) => syncMove(info.fittingId, info.to);
    const onChanged = (info: { fittingId: string; to: Vec2 | null }) => {
      if (info.to !== null) syncMove(info.fittingId, info.to);
    };
    scene.on('riserFittingMoved', onMoved);
    scene.on('riserFittingChanged', onChanged);
    return () => {
      scene.off('riserFittingMoved', onMoved);
      scene.off('riserFittingChanged', onChanged);
    };
  }, [ready, sceneRef]);

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

  return {
    menuStateFor,
    makeRiser,
    drawFromRing,
    detach,
    askDelete,
    pendingDelete,
    confirmDelete,
    cancelDelete,
    conflict,
    conflictKeys,
    resolveConflictMoveHere,
    resolveConflictSnapBack,
    decideConflictLater,
    applyPendingForDocument,
  };
}
