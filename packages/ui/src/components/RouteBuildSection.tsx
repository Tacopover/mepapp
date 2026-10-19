import { useEffect, useState, type RefObject } from 'react';
import type { RoutePlanView, RouteRequest, SketchScene } from '@mepapp/render';
import { buildText, routeBuildLines, routeBuildSeverityLabel, routeBuildSummary } from './routeBuildPlan.js';

export interface RouteBuildSectionProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The inputs of the run. null hides the section. */
  request: RouteRequest | null;
  roomName: (roomId: string) => string;
}

const DEBOUNCE_MS = 300;

/** A stable text for a request, so the section plans again only when an input changes. */
export function routeRequestKey(request: RouteRequest): string {
  const ids = [...(request.scope.kind === 'rooms' ? request.scope.roomIds : request.scope.stampIds)].sort();
  return JSON.stringify([request.startStampId, request.startPortId, request.networkTypeId, request.scope.kind, ids, request.includeOutsideRooms, request.portsPerStamp]);
}

export function RouteBuildSection({ sceneRef, request, roomName }: RouteBuildSectionProps) {
  const scene = sceneRef.current;
  const [view, setView] = useState<RoutePlanView | null>(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const key = request ? routeRequestKey(request) : null;

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
    if (!scene || !request) {
      setView(null);
      setPending(false);
      return;
    }
    setPending(true);
    const timer = window.setTimeout(() => {
      setView(scene.planRoute(request));
      setPending(false);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [scene, key, tick]);

  useEffect(() => {
    if (!scene) return;
    scene.setRoutePreview(view && view.status === 'ok' && view.plan.segments.length > 0 ? view.plan : null);
  }, [scene, view]);

  useEffect(() => {
    if (!scene) return;
    return () => scene.setRoutePreview(null);
  }, [scene]);

  if (!scene || !request) return null;

  const lines = view ? routeBuildLines(view.plan, { room: roomName, unit: view.flowUnit ?? '' }) : [];

  return (
    <div className="mep-route-build" data-testid="route-build">
      <p className="mep-route-text mep-route-build-title">{buildText('buildTitle')}</p>
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
    </div>
  );
}
