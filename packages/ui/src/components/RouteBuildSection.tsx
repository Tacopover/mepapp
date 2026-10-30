import { useEffect, useState, type RefObject } from 'react';
import type { RoutePlanView, RouteRequest, SketchScene } from '@mepapp/render';
import { buildText, countPhrase, routeBuildLines, routeBuildSeverityLabel, routeBuildSummary } from './routeBuildPlan.js';

export interface RouteBuildSectionProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The inputs of the run. null hides the section. */
  request: RouteRequest | null;
  roomName: (roomId: string) => string;
  stampName?: (stampId: string) => string;
}

const DEBOUNCE_MS = 300;

/** A stable text for a request, so the section plans again only when an input changes. */
export function routeRequestKey(request: RouteRequest): string {
  const ids = [...(request.scope.kind === 'rooms' ? request.scope.roomIds : request.scope.stampIds)].sort();
  return JSON.stringify([request.startStampId, request.startPortId, request.networkTypeId, request.scope.kind, ids, request.includeOutsideRooms, request.portsPerStamp, request.layout?.twoLevel ? 'two-level' : '']);
}

export function RouteBuildSection({ sceneRef, request, roomName, stampName }: RouteBuildSectionProps) {
  const scene = sceneRef.current;
  const [view, setView] = useState<RoutePlanView | null>(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState(true);
  const [result, setResult] = useState<{ segments: number; fittings: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [twoLevel, setTwoLevel] = useState(false);
  const effective = request && twoLevel ? { ...request, layout: { twoLevel: {} } } : request;
  const key = effective ? routeRequestKey(effective) : null;

  useEffect(() => {
    if (!scene) return;
    const bump = () => setTick((n) => n + 1);
    const events = ['drawingChanged', 'pageChanged', 'documentActivated', 'roomsChanged', 'routeAreaChanged', 'networkSizingChanged', 'flowSolved'] as const;
    for (const event of events) scene.on(event, bump);
    return () => {
      for (const event of events) scene.off(event, bump);
    };
  }, [scene]);

  useEffect(() => {
    if (!scene || !effective) {
      setView(null);
      setPending(false);
      return;
    }
    setPending(true);
    const timer = window.setTimeout(() => {
      setView(scene.planRoute(effective));
      setPending(false);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [scene, key, tick]);

  useEffect(() => {
    setResult(null);
    setFailed(false);
  }, [key]);

  useEffect(() => {
    if (!scene) return;
    scene.setRoutePreview(view && view.status === 'ok' && view.plan.segments.length > 0 ? view.plan : null);
  }, [scene, view]);

  useEffect(() => {
    if (!scene) return;
    return () => scene.setRoutePreview(null);
  }, [scene]);

  if (!scene || !request) return null;

  const lines = view ? routeBuildLines(view.plan, { room: roomName, stamp: stampName, unit: view.flowUnit ?? '' }) : [];
  const hasNoLimitsLine = view?.plan.warnings.some((w) => w.code === 'no-limits') ?? false;
  const sizeAvailable = !!view && view.status === 'ok' && view.hasLimits && !hasNoLimitsLine;
  const canPlace = !!view && view.status === 'ok' && view.plan.segments.length > 0 && !pending;

  const place = () => {
    if (!view || !effective) return;
    const useSize = sizeAvailable && size;
    let done = scene.applyRoute(view.plan, { size: useSize });
    if (done === null) done = scene.applyRoute(scene.planRoute(effective).plan, { size: useSize });
    setFailed(done === null);
    setResult(done);
  };

  return (
    <div className="mep-route-build" data-testid="route-build">
      <p className="mep-route-text mep-route-build-title">{buildText('buildTitle')}</p>
      <label className="mep-route-check" title={buildText('buildTwoLevelHint')}>
        <input type="checkbox" data-testid="route-build-two-level" checked={twoLevel} onChange={(event) => setTwoLevel(event.target.checked)} />
        <span>{buildText('buildTwoLevel')}</span>
      </label>
      {pending && <p className="mep-route-text mep-route-note" data-testid="route-build-pending">{buildText('buildPending')}</p>}
      {view && view.status === 'ok' && (
        <div data-testid="route-build-summary" aria-live="polite">
          {routeBuildSummary(view.plan.stats).map((line, index) => (
            <p key={index} className={index === 0 ? 'mep-route-text mep-route-main' : 'mep-route-text'}>{line}</p>
          ))}
        </div>
      )}
      {view && view.plan.warnings.some((w) => w.code === 'removes-routed') && view.status === 'ok' && (
        <p className="mep-route-text" data-testid="route-build-ports-after">{view.portsAfterRemoval === 1 ? buildText('buildPortsAfter_one') : buildText('buildPortsAfter', { n: view.portsAfterRemoval })}</p>
      )}
      {lines.length > 0 && (
        <div className="mep-route-checks" data-testid="route-build-lines">
          {lines.map((line) => (
            <div key={line.code} className="mep-route-check-line">
              <p className={`mep-route-text mep-route-check-${line.severity}`} data-testid={line.code === 'removes-routed' ? 'route-build-remove' : `route-build-line-${line.code}`} data-severity={line.severity}><strong className="mep-route-severity">{routeBuildSeverityLabel(line.severity)}</strong>{' '}{line.text}</p>
              {line.hint !== '' && <p className="mep-route-text mep-route-hint">{line.hint}</p>}
            </div>
          ))}
        </div>
      )}
      {sizeAvailable && (
        <label className="mep-route-check">
          <input type="checkbox" data-testid="route-build-size" checked={size} onChange={(event) => setSize(event.target.checked)} />
          <span>{buildText('buildSizeAfter')}</span>
        </label>
      )}
      <div className="mep-route-build-actions">
        <button type="button" data-testid="route-place" disabled={!canPlace} onClick={place}>{buildText('buildPlace')}</button>
      </div>
      {result && (
        <p className="mep-route-text mep-route-main" data-testid="route-build-result" aria-live="polite">{buildText('buildPlaced', { segments: countPhrase('nSegments', result.segments), fittings: countPhrase('nFittings', result.fittings) })}</p>
      )}
      {failed && <p className="mep-route-text mep-route-check-error" data-testid="route-build-failed">{buildText('buildPlaceFailed')}</p>}
    </div>
  );
}
