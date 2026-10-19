import { Container, Graphics } from 'pixi.js';
import type { Room, RouteArea, RouteAreaWarning, Vec2 } from '@mepapp/core';

const AREA_FILL_COLOR = 0x00897b;
const CENTER_COLOR = 0x6a1b9a;
const BRANCH_COLOR = 0xffab00;
const SHAFT_COLOR = 0xd50000;
const DASH_PX = 6;
const GAP_PX = 4;
const CROSS_ARM_PX = 5;

export interface RouteAreaView { area: RouteArea; warnings: RouteAreaWarning[] }

const flat = (ring: readonly Vec2[]): number[] => ring.flatMap((p) => [p.x, p.y]);

export function dashedPolyline(g: Graphics, points: readonly Vec2[], dashPt: number, gapPt: number): void {
  let on = true;
  let left = dashPt;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let pos = 0;
    while (pos < len) {
      const step = Math.min(left, len - pos);
      const t0 = pos / len;
      const t1 = (pos + step) / len;
      if (on) g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      pos += step;
      left -= step;
      if (left <= 0) {
        on = !on;
        left = on ? dashPt : gapPt;
      }
    }
  }
}

function cross(g: Graphics, p: Vec2, armPt: number): void {
  g.moveTo(p.x - armPt, p.y - armPt).lineTo(p.x + armPt, p.y + armPt);
  g.moveTo(p.x - armPt, p.y + armPt).lineTo(p.x + armPt, p.y - armPt);
}

/** Redraws the route-area overlay into `layer`: a tinted fill of the area rooms, center lines, dashed connectors, and crosses at the entries and links. Line widths are in screen pixels times `pxPt`. */
export function drawRouteArea(layer: Container, view: RouteAreaView | null, rooms: readonly Room[], pxPt: number): void {
  for (const child of layer.removeChildren()) child.destroy();
  if (view === null || view.area.status !== 'ok') return;
  const area = view.area;

  const byId = new Map(rooms.map((r) => [r.id, r]));
  const fill = new Graphics();
  const outline = new Graphics();
  for (const areaRoom of area.rooms) {
    const room = byId.get(areaRoom.roomId);
    if (!room) continue;
    fill.poly(flat(room.polygon.outer)).fill({ color: AREA_FILL_COLOR, alpha: 0.18 });
    for (const hole of room.polygon.holes) fill.poly(flat(hole)).cut();
    outline.poly(flat(room.polygon.outer)).stroke({ width: 1.5 * pxPt, color: AREA_FILL_COLOR, alpha: 0.85 });
    for (const hole of room.polygon.holes) outline.poly(flat(hole)).stroke({ width: 1.5 * pxPt, color: AREA_FILL_COLOR, alpha: 0.85 });
  }
  layer.addChild(fill, outline);

  const center = new Graphics();
  const connectors = new Graphics();
  for (const edge of area.edges) {
    if (edge.kind !== 'center') continue;
    const [first, ...rest] = edge.points;
    if (!first) continue;
    center.moveTo(first.x, first.y);
    for (const p of rest) center.lineTo(p.x, p.y);
  }
  center.stroke({ width: 2 * pxPt, color: CENTER_COLOR, alpha: 0.95, cap: 'round', join: 'round' });
  for (const edge of area.edges) {
    if (edge.kind === 'connector') dashedPolyline(connectors, edge.points, DASH_PX * pxPt, GAP_PX * pxPt);
  }
  connectors.stroke({ width: 1.5 * pxPt, color: CENTER_COLOR, alpha: 0.9 });
  layer.addChild(center, connectors);

  const halo = new Graphics();
  const branch = new Graphics();
  const shaft = new Graphics();
  const armPt = CROSS_ARM_PX * pxPt;
  for (const entry of area.entries) {
    if (entry.primary && !entry.shaft) cross(branch, entry.point, armPt);
    if (entry.shaft) cross(shaft, entry.point, armPt);
    if ((entry.primary && !entry.shaft) || entry.shaft) cross(halo, entry.point, armPt);
  }
  for (const link of area.links) {
    if (!link.shaft) cross(branch, link.point, armPt);
    if (link.shaft) cross(shaft, link.point, armPt);
    cross(halo, link.point, armPt);
  }
  halo.stroke({ width: 3.5 * pxPt, color: 0xffffff, alpha: 0.9 });
  branch.stroke({ width: 1.5 * pxPt, color: BRANCH_COLOR, alpha: 1 });
  shaft.stroke({ width: 1.5 * pxPt, color: SHAFT_COLOR, alpha: 1 });
  layer.addChild(halo, branch, shaft);
}
