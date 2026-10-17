import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { RouteAreaView, SketchScene } from '@mepapp/render';
import type { RoomType } from '@mepapp/core';
import { roomLabel, routeAreaLines, routeAreaSummaryLine, routeAreaTypeChoices, routeText } from './routePlan.js';

export interface RouteAreaSectionProps {
  sceneRef: RefObject<SketchScene | null>;
  roomTypes: RoomType[];
  language: 'en' | 'nl';
}

const legendSwatches = ['fill', 'center', 'branch', 'shaft'] as const;

export function RouteAreaSection({ sceneRef, roomTypes, language }: RouteAreaSectionProps) {
  const scene = sceneRef.current;
  const [view, setView] = useState<RouteAreaView | null>(() => scene?.getRouteArea() ?? null);
  const [rooms, setRooms] = useState(() => (scene ? scene.listRooms().filter((r) => r.pageIndex === scene.getPageIndex()) : []));
  const [typeIds, setTypeIds] = useState<string[]>(() => scene?.getRouteAreaRoomTypes() ?? []);
  const [visible, setVisible] = useState(() => scene?.isRouteAreaVisible() ?? false);
  const [pending, setPending] = useState(() => scene?.isRouteAreaPending() ?? false);
  const refreshAll = useCallback(() => {
    if (!scene) return;
    setView(scene.getRouteArea());
    setRooms(scene.listRooms().filter((r) => r.pageIndex === scene.getPageIndex()));
    setTypeIds(scene.getRouteAreaRoomTypes());
    setVisible(scene.isRouteAreaVisible());
    setPending(scene.isRouteAreaPending());
  }, [scene]);
  useEffect(() => {
    if (!scene) return;
    const refreshRooms = () => setRooms(scene.listRooms().filter((r) => r.pageIndex === scene.getPageIndex()));
    const refreshPending = () => setPending(scene.isRouteAreaPending());
    refreshAll();
    scene.on('routeAreaChanged', refreshAll);
    scene.on('routeAreaVisibleChanged', refreshAll);
    scene.on('routeAreaPendingChanged', refreshPending);
    scene.on('pageChanged', refreshAll);
    scene.on('documentActivated', refreshAll);
    scene.on('roomsChanged', refreshRooms);
    return () => {
      scene.off('routeAreaChanged', refreshAll);
      scene.off('routeAreaVisibleChanged', refreshAll);
      scene.off('routeAreaPendingChanged', refreshPending);
      scene.off('pageChanged', refreshAll);
      scene.off('documentActivated', refreshAll);
      scene.off('roomsChanged', refreshRooms);
    };
  }, [scene, refreshAll]);
  useEffect(() => {
    if (!scene) return;
    const old = scene.isRouteAreaVisible();
    scene.setRouteAreaVisible(true);
    return () => scene.setRouteAreaVisible(old);
  }, [scene]);

  if (!scene || !view) return null;

  const roomNameOf = (id: string) => {
    const index = rooms.findIndex((r) => r.id === id);
    return index < 0 ? id : roomLabel(rooms[index], index, language);
  };
  const lines = routeAreaLines(view.warnings, { room: roomNameOf }, language);
  const allTypeChoices = routeAreaTypeChoices(roomTypes, typeIds, language);
  const typeChoices = allTypeChoices.filter((c) => c.inList);
  const legendLabels = routeText(language, 'areaLegend').split(', ');

  return (
    <details open className="mep-route-area" data-testid="route-area">
      <summary className="mep-route-area-title">{routeText(language, 'areaTitle')}</summary>
      <label className="mep-route-check">
        <input type="checkbox" data-testid="route-area-show" checked={visible} onChange={(e) => scene.setRouteAreaVisible(e.target.checked)} />
        <span>{routeText(language, 'areaShow')}</span>
      </label>
      {pending && <p className="mep-route-text mep-route-note" data-testid="route-area-calculating">{routeText(language, 'areaCalculating')}</p>}
      <p className="mep-route-text mep-route-main" data-testid="route-area-summary">{routeAreaSummaryLine(view.area, language)}</p>
      <div data-testid="route-area-types-block">
        <p className="mep-route-text">{routeText(language, 'areaTypes')}</p>
        <ul className="mep-route-area-types" data-testid="route-area-types">
          {typeChoices.map((c) => (
            <li key={c.id} data-testid="route-area-type" data-type-id={c.id}>{c.label}</li>
          ))}
        </ul>
      </div>
      {lines.length > 0 && (
        <div className="mep-route-checks" data-testid="route-area-lines">
          {lines.map((line, index) => (
            <div key={`${line.code}-${index}`} className="mep-route-check-line">
              <p className={`mep-route-text mep-route-check-${line.severity}`} data-testid={`route-area-line-${line.code}`} data-severity={line.severity}><strong className="mep-route-severity">{routeText(language, line.severity === 'error' ? 'severityError' : line.severity === 'warning' ? 'severityWarning' : 'severityInfo')}</strong>{' '}{line.text}</p>
              {line.hint !== '' && <p className="mep-route-text mep-route-hint">{line.hint}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mep-route-area-legend" data-testid="route-area-legend">
        {legendSwatches.map((kind, index) => (
          <span key={kind} className="mep-route-area-legend-item">
            <span className={`mep-route-area-swatch mep-route-area-swatch--${kind}`} />
            <span>{legendLabels[index]}</span>
          </span>
        ))}
      </div>
      <p className="mep-route-text mep-route-hint mep-route-area-guide">{routeText(language, 'areaLegendGuide')}</p>
    </details>
  );
}
