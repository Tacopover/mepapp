import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { RouteMarker, SketchScene, StampInfo } from '@mepapp/render';
import { checkRouteStart, findRoutePorts, getNetworkTypeFromLibrary, getStampWorldPorts, roomTypeLabel, routePageProblem, type RoomType } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { includeOutsideText, looksLikeLoad, presetStart, roomLabel, routeSummaryLines, routeText, startCandidates, startCheckLines, startPortChoices, typeChoices, typeNameInText, typeOptionText } from './routePlan.js';

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

export function RouteDialog({ sceneRef, roomTypes, language, stampName, onClose }: RouteDialogProps) {
  const scene = sceneRef.current;
  const [pageCount, setPageCount] = useState(() => scene?.getPageCount() ?? 1);
  const [stamps, setStamps] = useState(() => scene?.listStamps() ?? []);
  const [connectivity, setConnectivity] = useState(() => scene?.getConnectivity() ?? { segments: [], fittings: [], portGroups: [] });
  const [rooms, setRooms] = useState(() => (scene ? scene.listRooms().filter((r) => r.pageIndex === scene.getPageIndex()) : []));
  const [selectionIds] = useState<string[]>(() => (scene ? scene.getSelection().map((s) => s.id) : []));
  const [selectionStart] = useState(() => (scene ? presetStart(scene.getSelection()) : null));
  const [startId, setStartId] = useState<string | null>(null);
  const [portId, setPortId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [scopeKind, setScopeKind] = useState<'rooms' | 'stamps'>('rooms');
  const [unchecked, setUncheckedRooms] = useState<ReadonlySet<string>>(() => new Set());
  const [includeOutside, setIncludeOutside] = useState(true);
  const [allPorts, setAllPorts] = useState(false);
  useEffect(() => {
    if (!scene) return;
    const refresh = () => {
      setPageCount(scene.getPageCount());
      setStamps(scene.listStamps());
      setConnectivity(scene.getConnectivity());
      setRooms(scene.listRooms().filter((r) => r.pageIndex === scene.getPageIndex()));
    };
    refresh();
    scene.on('pageChanged', refresh);
    scene.on('documentActivated', refresh);
    scene.on('drawingChanged', refresh);
    scene.on('roomsChanged', refresh);
    return () => {
      scene.off('pageChanged', refresh);
      scene.off('documentActivated', refresh);
      scene.off('drawingChanged', refresh);
      scene.off('roomsChanged', refresh);
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
  const problems = useMemo(
    () => (startStamp && selectedPort && selectedType
      ? checkRouteStart({ stamps, ...connectivity, startStampId: startStamp.id, startPortId: selectedPort, networkTypeId: selectedType })
      : []),
    [stamps, connectivity, startStamp?.id, selectedPort, selectedType],
  );
  const selectionOthers = selectionIds.filter((id) => id !== selectedStart && stamps.some((s) => s.id === id));
  const stampsEnabled = selectionOthers.length > 0;
  const effectiveScope = scopeKind === 'stamps' && stampsEnabled ? 'stamps' : 'rooms';
  const result = startStamp && selectedType
    ? findRoutePorts({
      stamps,
      networkTypeId: selectedType,
      scope: effectiveScope === 'rooms'
        ? { kind: 'rooms', roomIds: new Set(rooms.filter((r) => !unchecked.has(r.id)).map((r) => r.id)) }
        : { kind: 'stamps', stampIds: new Set(selectionOthers) },
      startStampId: startStamp.id,
      startPortId: selectedPort ?? undefined,
      rooms,
      pageIndex: scene?.getPageIndex() ?? 0,
      includeOutsideRooms: includeOutside,
      portsPerStamp: allPorts ? 'all' : 'one',
    })
    : null;
  const checkedRoomCount = rooms.filter((r) => !unchecked.has(r.id)).length;
  useEffect(() => {
    if (!scene) return;
    const markers: RouteMarker[] = [];
    if (!problem && result && startStamp) {
      const startWorld = getStampWorldPorts(startStamp).find((p) => p.id === selectedPort)?.world;
      if (startWorld) markers.push({ world: startWorld, kind: 'start' });
      for (const p of result.ports) markers.push({ world: p.world, kind: 'target' });
    }
    scene.setRouteMarkers(markers);
  }, [scene, problem, result, startStamp, selectedPort]);
  useEffect(() => {
    if (!scene) return;
    return () => scene.clearRouteMarkers();
  }, [scene]);

  const nameOf = (id: string) => scene?.getNetworkTypes().find((t) => t.id === id)?.name ?? getNetworkTypeFromLibrary(id)?.name ?? id;
  const labelOf = (stamp: StampInfo) => (stamp.definitionId ? stampName(stamp.definitionId) : null) ?? stamp.definitionId ?? stamp.id;
  const startLabels = uniqueLabels(candidates.map((c) => c.stamp), labelOf);
  const stampNameOf = (id: string) => startLabels.get(id) ?? (() => { const s = stamps.find((x) => x.id === id); return s ? labelOf(s) : id; })();
  const portNameOf = (id: string) => startStamp ? (startPortChoices(startStamp, selectedType ?? '').find((p) => p.portId === id)?.name ?? id) : id;
  const checkLines = startCheckLines(problems, { type: (id) => typeNameInText(id, nameOf(id), language), stamp: stampNameOf, port: portNameOf }, language);
  const selectedOnly = selectionIds.length === 1 ? stamps.find((s) => s.id === selectionIds[0]) : undefined;
  const selectionNote = selectionStart === null && selectedOnly && selectedOnly.category !== 'equipment' ? selectedOnly : null;
  const selectionNoteBlock = selectionNote && (
    <div data-testid="route-selection-note">
      <p className="mep-route-text mep-route-note">{routeText(language, 'selectionNotEquipment', { stamp: labelOf(selectionNote) })}</p>
      <p className="mep-route-text mep-route-hint">{routeText(language, 'selectionRiserNote')}</p>
    </div>
  );
  const sources = candidates.filter((c) => c.likelySource);
  const waiting = candidates.filter((c) => !c.likelySource);
  const lines = result && selectedType
    ? routeSummaryLines(result, effectiveScope, typeNameInText(selectedType, nameOf(selectedType), language), checkedRoomCount, language, {
      portsPerStamp: allPorts ? 'all' : 'one',
      includeOutsideRooms: includeOutside,
    })
    : [];

  return (
    <Dialog
      title={routeText(language, 'title')}
      className="mep-modal--route"
      backdropClassName="mep-modal-backdrop--route"
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
            <>
              <p className="mep-route-text">{routeText(language, 'noEquipment')}</p>
              {selectionNoteBlock}
            </>
          ) : (
            <>
              {selectionNoteBlock}
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
                  {choices.length === 0 ? (
                    <option value="">{routeText(language, 'noChoice')}</option>
                  ) : choices.map((c) => (
                    <option key={c.networkTypeId} value={c.networkTypeId}>{typeOptionText(language, nameOf(c.networkTypeId), c.count)}</option>
                  ))}
                </select>
              </label>
              <label className="mep-route-field">
                <span>{routeText(language, 'startPort')}</span>
                <select
                  data-testid="route-port"
                  value={selectedPort ?? ''}
                  disabled={portChoices.length === 0}
                  onChange={(event) => setPortId(event.target.value)}
                >
                  {portChoices.length === 0 ? (
                    <option value="">{routeText(language, 'noChoice')}</option>
                  ) : portChoices.map((p) => (
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
              {checkLines.length > 0 && (
                <div className="mep-route-checks" data-testid="route-checks">
                  {checkLines.map((line) => (
                    <div key={line.code} className="mep-route-check-line">
                      <p className={`mep-route-text mep-route-check-${line.severity}`} data-testid={`route-check-${line.code}`} data-severity={line.severity}><strong className="mep-route-severity">{routeText(language, line.severity === 'error' ? 'severityError' : line.severity === 'warning' ? 'severityWarning' : 'severityInfo')}</strong>{' '}{line.text}</p>
                      {line.hint !== '' && <p className="mep-route-text mep-route-hint">{line.hint}</p>}
                    </div>
                  ))}
                </div>
              )}
              {choices.length === 0 && (
                <p className="mep-route-text" data-testid="route-no-ports">{routeText(language, 'noOpenPorts')}</p>
              )}
              {choices.length > 0 && startStamp && result && (
                <>
                  <fieldset className="mep-route-scope" data-testid="route-scope">
                    <legend>{routeText(language, 'scope')}</legend>
                    <label className="mep-route-radio">
                      <input
                        type="radio"
                        name="route-scope"
                        data-testid="route-scope-rooms"
                        checked={effectiveScope === 'rooms'}
                        onChange={() => setScopeKind('rooms')}
                      />
                      <span>{routeText(language, 'scopeRooms')}</span>
                    </label>
                    <label className={`mep-route-radio${stampsEnabled ? '' : ' mep-route-radio--disabled'}`}>
                      <input
                        type="radio"
                        name="route-scope"
                        data-testid="route-scope-stamps"
                        disabled={!stampsEnabled}
                        checked={effectiveScope === 'stamps'}
                        onChange={() => setScopeKind('stamps')}
                      />
                      <span>{routeText(language, 'scopeStamps')}</span>
                    </label>
                  </fieldset>
                  {effectiveScope === 'stamps' && (
                    <p className="mep-route-text mep-route-hint" data-testid="route-stamps-note">{routeText(language, 'scopeStampsNote')}</p>
                  )}
                  {!stampsEnabled && (
                    <p className="mep-route-text mep-route-hint" data-testid="route-stamps-hint">{routeText(language, 'scopeStampsHint')}</p>
                  )}
                  {effectiveScope === 'rooms' && (
                    rooms.length === 0 ? (
                      <p className="mep-route-text" data-testid="route-no-rooms">{routeText(language, 'noRooms')}</p>
                    ) : (
                      <>
                        <div className="mep-route-room-actions">
                          <button type="button" data-testid="route-rooms-all" onClick={() => setUncheckedRooms(new Set())}>
                            {routeText(language, 'roomsAll')}
                          </button>
                          <button
                            type="button"
                            data-testid="route-rooms-none"
                            onClick={() => setUncheckedRooms(new Set(rooms.map((r) => r.id)))}
                          >
                            {routeText(language, 'roomsNone')}
                          </button>
                        </div>
                        <div className="mep-route-room mep-route-room-head" data-testid="route-rooms-head">
                          <span className="mep-route-room-spacer" />
                          <span className="mep-route-room-name">{routeText(language, 'roomsColRoom')}</span>
                          <span className="mep-route-room-type">{routeText(language, 'roomsColType')}</span>
                          <span className="mep-route-room-count" title={routeText(language, 'roomsColPortsTitle')}>{routeText(language, 'roomsColPorts')}</span>
                        </div>
                        <div className="mep-route-rooms" data-testid="route-rooms">
                          {rooms.map((room, index) => {
                            const type = roomTypes.find((t) => t.id === room.roomTypeId);
                            return (
                              <label key={room.id} className="mep-route-room">
                                <input
                                  type="checkbox"
                                  data-testid="route-room"
                                  data-room-id={room.id}
                                  checked={!unchecked.has(room.id)}
                                  onChange={() => setUncheckedRooms((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(room.id)) next.delete(room.id);
                                    else next.add(room.id);
                                    return next;
                                  })}
                                />
                                <span className="mep-route-room-name">{roomLabel(room, index, language)}</span>
                                <span className="mep-route-room-type">{type ? roomTypeLabel(type, language) : ''}</span>
                                <span className="mep-route-room-count">{result.perRoom.find((p) => p.roomId === room.id)?.count ?? 0}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )
                  )}
                  {effectiveScope === 'rooms' && (
                    <label className="mep-route-check">
                      <input
                        type="checkbox"
                        data-testid="route-outside"
                        checked={includeOutside}
                        onChange={(event) => setIncludeOutside(event.target.checked)}
                      />
                      <span>{includeOutsideText(language, result.outsideRooms)}</span>
                    </label>
                  )}
                  {result.multiPortStamps > 0 && (
                    <label className="mep-route-check">
                      <input
                        type="checkbox"
                        data-testid="route-all-ports"
                        checked={allPorts}
                        onChange={(event) => setAllPorts(event.target.checked)}
                      />
                      <span>{routeText(language, 'useAllPorts')}</span>
                    </label>
                  )}
                  <div data-testid="route-summary" aria-live="polite">
                    {lines.map((line, index) => (
                      <p key={index} className={index === 0 ? 'mep-route-text mep-route-main' : 'mep-route-text'}>{line}</p>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
