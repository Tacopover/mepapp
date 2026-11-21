import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BuildingFlowResult, SheetSummary } from '@mepapp/core';
import { buildRiserNetworks } from '@mepapp/core';
import type { SketchScene } from '@mepapp/render';
import type { OpenBuilding } from './buildingController.js';
import { readSummaries } from './quantitiesScope.js';
import { computeRiserFlow, RiserFlowSender } from './riserFlowSync.js';

export interface RiserFlowState {
  /** Id of the sheet of the shown page. */
  sheetId: string;
  flow: BuildingFlowResult;
}

/** The delay after a drawing edit. A drag emits many edits. */
export const EDIT_DELAY_MS = 200;
/** The delay after a page change, a document change, a change of the building file or of the stored summaries. */
export const SWITCH_DELAY_MS = 60;

export function useRiserFlowInputs(args: { sceneRef: RefObject<SketchScene | null>; ready: boolean; building: OpenBuilding | null }): RiserFlowState | null {
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

  const run = (): void => {
    try {
      const scene = sceneRef.current;
      if (!scene) return;
      const { file: current } = live.current;
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
              liveNetworksOf: (ids) => buildRiserNetworks(scene.exportProject(), ids),
            });
      const toSend = sender.current.next(computed?.inputs ?? {});
      if (toSend !== null) scene.setRiserFlowInputs(toSend);
      const key = computed ? JSON.stringify([computed.sheetId, computed.flow]) : '';
      if (key !== stateKey.current) {
        stateKey.current = key;
        setState(computed ? { sheetId: computed.sheetId, flow: computed.flow } : null);
      }
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
    const onEdit = () => schedule(EDIT_DELAY_MS);
    const onSwitch = () => {
      sender.current.reset();
      stateKey.current = '';
      setState(null);
      schedule(SWITCH_DELAY_MS);
    };
    scene.on('drawingChanged', onEdit);
    // A capacity edit emits selectionChanged, not drawingChanged.
    scene.on('selectionChanged', onEdit);
    scene.on('documentActivated', onSwitch);
    scene.on('pageChanged', onSwitch);
    return () => {
      scene.off('drawingChanged', onEdit);
      scene.off('selectionChanged', onEdit);
      scene.off('documentActivated', onSwitch);
      scene.off('pageChanged', onSwitch);
      clearTimeout(timer.current);
    };
  }, [ready, sceneRef]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return state;
}
