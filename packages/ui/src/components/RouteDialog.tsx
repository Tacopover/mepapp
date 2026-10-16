import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';
import { getNetworkTypeFromLibrary, routePageProblem, type RoomType } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { looksLikeLoad, presetStart, routeText, startCandidates, startPortChoices, typeChoices, typeNameInText } from './routePlan.js';

export interface RouteDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  stampName: (definitionId: string) => string | null;
  onClose: () => void;
}

function uniqueLabels(stamps: readonly StampInfo[], labelOf: (stamp: StampInfo) => string): Map<string, string> {
  const totals = new Map<string, number>();
  for (const stamp of stamps) {
    const label = labelOf(stamp);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const stamp of stamps) {
    const label = labelOf(stamp);
    if ((totals.get(label) ?? 0) < 2) {
      labels.set(stamp.id, label);
      continue;
    }
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    labels.set(stamp.id, `${label} (${n})`);
  }
  return labels;
}

export function RouteDialog({ sceneRef, language, stampName, onClose }: RouteDialogProps) {
  const scene = sceneRef.current;
  const [pageCount, setPageCount] = useState(() => scene?.getPageCount() ?? 1);
  const [stamps, setStamps] = useState(() => scene?.listStamps() ?? []);
  const [selectionStart] = useState(() => (scene ? presetStart(scene.getSelection()) : null));
  const [startId, setStartId] = useState<string | null>(null);
  const [portId, setPortId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  useEffect(() => {
    if (!scene) return;
    const refresh = () => {
      setPageCount(scene.getPageCount());
      setStamps(scene.listStamps());
    };
    refresh();
    scene.on('pageChanged', refresh);
    scene.on('documentActivated', refresh);
    return () => {
      scene.off('pageChanged', refresh);
      scene.off('documentActivated', refresh);
    };
  }, [scene]);

  const problem = routePageProblem(pageCount, language);

  const candidates = startCandidates(stamps);
  const selectedStart = candidates.some((c) => c.stamp.id === startId)
    ? startId
    : candidates.some((c) => c.stamp.id === selectionStart)
      ? selectionStart
      : (candidates[0]?.stamp.id ?? null);
  const startStamp = candidates.find((c) => c.stamp.id === selectedStart)?.stamp;
  const choices = typeChoices(stamps);
  const selectedType = choices.some((c) => c.networkTypeId === typeId) ? typeId : (choices[0]?.networkTypeId ?? null);
  const portChoices = startStamp && selectedType ? startPortChoices(startStamp, selectedType) : [];
  const selectedPort = portChoices.some((p) => p.portId === portId) ? portId : (portChoices[0]?.portId ?? null);
  const port = portChoices.find((p) => p.portId === selectedPort);

  const nameOf = (id: string) => scene?.getNetworkTypes().find((t) => t.id === id)?.name ?? getNetworkTypeFromLibrary(id)?.name ?? id;
  const labelOf = (stamp: StampInfo) => (stamp.definitionId ? stampName(stamp.definitionId) : null) ?? stamp.definitionId ?? stamp.id;
  const startLabels = uniqueLabels(candidates.map((c) => c.stamp), labelOf);
  const sources = candidates.filter((c) => c.likelySource);
  const waiting = candidates.filter((c) => !c.likelySource);

  return (
    <Dialog
      title={routeText(language, 'title')}
      className="mep-modal--route"
      closeOnBackdropClick={false}
      onClose={onClose}
      actions={
        <button type="button" onClick={onClose}>
          {routeText(language, 'close')}
        </button>
      }
    >
      {problem ? (
        <p className="mep-route-text" data-testid="route-refusal">{problem}</p>
      ) : (
        <div data-testid="route-body">
          {candidates.length === 0 ? (
            <p className="mep-route-text">{routeText(language, 'noEquipment')}</p>
          ) : (
            <>
              <label className="mep-route-field">
                <span>{routeText(language, 'startStamp')}</span>
                <select
                  data-testid="route-start"
                  value={selectedStart ?? ''}
                  onChange={(event) => {
                    setStartId(event.target.value);
                    setPortId(null);
                  }}
                >
                  {sources.length > 0 && (
                    <optgroup label={routeText(language, 'groupSources')}>
                      {sources.map((c) => (
                        <option key={c.stamp.id} value={c.stamp.id}>{startLabels.get(c.stamp.id)}</option>
                      ))}
                    </optgroup>
                  )}
                  {waiting.length > 0 && (
                    <optgroup label={routeText(language, 'groupWaiting')}>
                      {waiting.map((c) => (
                        <option key={c.stamp.id} value={c.stamp.id}>{startLabels.get(c.stamp.id)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {startStamp && selectedType && looksLikeLoad(startStamp, selectedType) && (
                <p className="mep-route-text mep-route-note" data-testid="route-start-warning">
                  {routeText(language, 'startWarning', { type: typeNameInText(selectedType, nameOf(selectedType), language) })}
                </p>
              )}
              <label className="mep-route-field">
                <span>{routeText(language, 'startPort')}</span>
                <select
                  data-testid="route-port"
                  value={selectedPort ?? ''}
                  onChange={(event) => setPortId(event.target.value)}
                >
                  {portChoices.map((p) => (
                    <option key={p.portId} value={p.portId}>{p.name}</option>
                  ))}
                </select>
              </label>
              {selectedType && port && port.routingTarget !== null && !port.matches && (
                <p className="mep-route-text mep-route-note" data-testid="route-port-note">
                  {routeText(language, 'portNote', {
                    target: typeNameInText(port.routingTarget, nameOf(port.routingTarget), language),
                    type: typeNameInText(selectedType, nameOf(selectedType), language),
                  })}
                </p>
              )}
              <label className="mep-route-field">
                <span>{routeText(language, 'networkType')}</span>
                <select
                  data-testid="route-type"
                  value={selectedType ?? ''}
                  disabled={choices.length === 0}
                  onChange={(event) => {
                    setTypeId(event.target.value);
                    setPortId(null);
                  }}
                >
                  {choices.map((c) => (
                    <option key={c.networkTypeId} value={c.networkTypeId}>{`${nameOf(c.networkTypeId)} (${c.count})`}</option>
                  ))}
                </select>
              </label>
              {choices.length === 0 && (
                <p className="mep-route-text" data-testid="route-no-ports">{routeText(language, 'noOpenPorts')}</p>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
