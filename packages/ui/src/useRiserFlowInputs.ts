import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BuildingFile, BuildingFlowResult, RiserNetworksLive, SheetSummary } from '@mepapp/core';
import { buildRiserNetworks, riserFittingIdsForSheets } from '@mepapp/core';
import type { SketchScene } from '@mepapp/render';
import type { OpenBuilding } from './buildingController.js';
import { readSummaries } from './quantitiesScope.js';
import { computeRiserFlow, LiveRiserOverlay, RiserFlowSender } from './riserFlowSync.js';

export interface RiserFlowState {
  /** Id of the sheet of the shown page. */
  sheetId: string;
  flow: BuildingFlowResult;
}

export interface RiserFlowInputsResult {
  flow: RiserFlowState | null;
  /** The live riser networks of the open documents of the building. */
  live: RiserNetworksLive[];
}

/** The delay after a drawing edit. A drag emits many edits. */
export const EDIT_DELAY_MS = 200;
/** The delay after a page change, a document change, a change of the building file or of the stored summaries. */
export const SWITCH_DELAY_MS = 60;

const NO_LIVE: RiserNetworksLive[] = [];

export function useRiserFlowInputs(args: { sceneRef: RefObject<SketchScene | null>; ready: boolean; building: OpenBuilding | null }): RiserFlowInputsResult {
  const { sceneRef, ready, building } = args;
  const file = building?.file ?? null;
  const store = building?.store;
  const summarySignature = JSON.stringify(Object.entries(building?.sheetSummary ?? {}).map(([id, info]) => [id, info.savedAt]));
  const [state, setState] = useState<RiserFlowState | null>(null);
  const summaries = useRef<ReadonlyMap<string, SheetSummary> | null>(null);
  const summaryRequest = useRef(0);
  const sender = useRef(new RiserFlowSender());
  const timer = useRef<number | undefined>(undefined);
  const stateKey = useRef('');
  const lastStore = useRef(store);
  const live =useRef({ file, store });
  live.current = { file, store };
  const overlay = useRef(new LiveRiserOverlay());
  const [liveNetworks, setLiveNetworks] = useState<RiserNetworksLive[]>(NO_LIVE);
  const published = useRef(0);
  const activeDoc = useRef<{ id: string; projectUuid: string | null } | null>(null);
  const capturedFile = useRef<BuildingFile | null | undefined>(undefined);

  const publishLive = (): void => {
    if (overlay.current.version === published.current) return;
    published.current = overlay.current.version;
    setLiveNetworks(overlay.current.list());
  };

  const captureDocument = (scene: SketchScene, documentId: string, projectUuid: string | null): void => {
    const current = live.current.file;
    if (current === null || current.risers.length === 0 || projectUuid === null) return;
    const sheetIds = current.sheets.filter((sheet) => sheet.projectUuid === projectUuid).map((sheet) => sheet.id);
    const ids = riserFittingIdsForSheets(current, sheetIds);
    if (ids.length === 0) {
      overlay.current.delete(projectUuid);
      return;
    }
    const project = scene.exportProjectOf(documentId);
    if (project) overlay.current.set(projectUuid, buildRiserNetworks(project, ids));
  };

  const run = (): void => {
    try {
      const scene = sceneRef.current;
      if (!scene) return;
      activeDoc.current = { id: scene.getActiveDocumentId(), projectUuid: scene.getProjectUuid() };
      const { file: current } = live.current;
      if (capturedFile.current !== current) {
        capturedFile.current = current;
        if (current === null || current.risers.length === 0) {
          overlay.current.clear();
        } else {
          const docs = scene.getDocuments();
          for (const doc of docs) captureDocument(scene, doc.id, doc.projectUuid);
          overlay.current.retain(new Set(docs.flatMap((doc) => (doc.projectUuid ? [doc.projectUuid] : []))));
        }
        publishLive();
      }
      const uuid = scene.getProjectUuid();
      captureDocument(scene, scene.getActiveDocumentId(), uuid);
      publishLive();
      const own = uuid === null ? undefined : overlay.current.list().find((item) => item.projectUuid === uuid)?.riserNetworks;
      const read = summaries.current;
      if (current !== null && current.risers.length > 0 && read === null) return;
      const computed =
        read === null
          ? null
          : computeRiserFlow({
              file: current,
              projectUuid: scene.getProjectUuid(),
              pageIndex: scene.getPageIndex(),
              summaries: read,
              liveNetworksOf: (ids) => own ?? buildRiserNetworks(scene.exportProject(), ids),
              others: overlay.current.list(),
            });
      const toSend = sender.current.next(computed?.inputs ?? {});
      if (toSend !== null) scene.setRiserFlowInputs(toSend);
      const key = computed ? JSON.stringify([computed.sheetId, computed.flow]) : '';
      if (key !== stateKey.current) {
        stateKey.current = key;
        setState(computed ? { sheetId: computed.sheetId, flow: computed.flow } : null);
      }
      publishLive();
    } catch (error: unknown) {
      console.warn('Riser flow inputs failed', error);
    }
  };

  const schedule = (delay: number): void => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(run, delay);
  };

  useEffect(() => {
    if (lastStore.current !== store) {
      lastStore.current = store;
      stateKey.current = '';
      setState(null);
    }
    const request = ++summaryRequest.current;
    summaries.current = null;
    if (store) {
      readSummaries(store)
        .then(
          ({ summaries: read }) => read,
          () => new Map<string, SheetSummary>(),
        )
        .then((read) => {
          if (request !== summaryRequest.current) return;
          summaries.current = read;
          schedule(SWITCH_DELAY_MS);
        });
    } else {
      schedule(SWITCH_DELAY_MS);
    }
    return () => {
      summaryRequest.current += 1;
    };
  }, [store, summarySignature]);

  useEffect(() => {
    schedule(SWITCH_DELAY_MS);
  }, [ready, building?.file]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    activeDoc.current = { id: scene.getActiveDocumentId(), projectUuid: scene.getProjectUuid() };
    const onEdit = () => schedule(EDIT_DELAY_MS);
    const onSwitch = () => {
      const previous = activeDoc.current;
      try {
        if (previous && previous.id !== scene.getActiveDocumentId()) {
          const leaving = scene.getDocuments().find((doc) => doc.id === previous.id);
          if (leaving) captureDocument(scene, leaving.id, leaving.projectUuid);
        }
        activeDoc.current = { id: scene.getActiveDocumentId(), projectUuid: scene.getProjectUuid() };
        publishLive();
      } catch (error: unknown) {
        console.warn('Riser flow inputs failed', error);
      }
      sender.current.reset();
      stateKey.current = '';
      setState(null);
      schedule(SWITCH_DELAY_MS);
    };
    const onDocuments = (docs: ReturnType<SketchScene['getDocuments']>) => {
      try {
        if (overlay.current.retain(new Set(docs.flatMap((doc) => (doc.projectUuid ? [doc.projectUuid] : []))))) {
          publishLive();
          schedule(SWITCH_DELAY_MS);
        }
        const active = docs.find((doc) => doc.id === scene.getActiveDocumentId());
        if (active && active.projectUuid !== activeDoc.current?.projectUuid) {
          activeDoc.current = { id: active.id, projectUuid: active.projectUuid };
          schedule(SWITCH_DELAY_MS);
        }
      } catch (error: unknown) {
        console.warn('Riser flow inputs failed', error);
      }
    };
    scene.on('drawingChanged', onEdit);
    // A capacity edit emits selectionChanged, not drawingChanged.
    scene.on('selectionChanged', onEdit);
    scene.on('documentActivated', onSwitch);
    scene.on('pageChanged', onSwitch);
    scene.on('documentsChanged', onDocuments);
    return () => {
      scene.off('drawingChanged', onEdit);
      scene.off('selectionChanged', onEdit);
      scene.off('documentActivated', onSwitch);
      scene.off('pageChanged', onSwitch);
      scene.off('documentsChanged', onDocuments);
      clearTimeout(timer.current);
    };
  }, [ready, sceneRef]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { flow: state, live: liveNetworks };
}
