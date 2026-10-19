import type { Graphics } from 'pixi.js';
import type { Vec2 } from '@mepapp/core';
import { dashedPolyline } from './routeAreaLayer.js';

const REMOVED_COLOR = 0xff8a80;
const FREE_COLOR = 0xe6007e;
const WALL_COLOR = 0xffab00;
const SHAFT_COLOR = 0xd50000;
const DASH_PX = 8;
const GAP_PX = 5;

export interface RoutePreviewView {
  color: number;                 // the network type color
  paths: Vec2[][];               // the planned segments (page points)
  removed: Vec2[][];             // the geometry of the old routed segments that the run removes
  freePoints: Vec2[];            // free-angle warning points
  wallPoints: Vec2[];            // wall-crossings points
  shaftPoints: Vec2[];           // shaft-crossing points
}

function cross(g: Graphics, p: Vec2, armPt: number): void {
  g.moveTo(p.x - armPt, p.y - armPt).lineTo(p.x + armPt, p.y + armPt);
  g.moveTo(p.x - armPt, p.y + armPt).lineTo(p.x + armPt, p.y - armPt);
}

/** Draws a route preview into `g`: removed runs in light red, planned runs dashed in the network color, and warning marks. Line widths and sizes are in screen pixels times `px`. */
export function drawRoutePreview(g: Graphics, view: RoutePreviewView, px: number): void {
  for (const path of view.removed) {
    const [first, ...rest] = path;
    if (!first) continue;
    g.moveTo(first.x, first.y);
    for (const p of rest) g.lineTo(p.x, p.y);
  }
  g.stroke({ width: 3 * px, color: REMOVED_COLOR });

  for (const path of view.paths) dashedPolyline(g, path, DASH_PX * px, GAP_PX * px);
  g.stroke({ width: 3 * px, color: view.color });

  for (const p of view.freePoints) g.circle(p.x, p.y, 8 * px);
  g.stroke({ width: 2 * px, color: FREE_COLOR });

  for (const p of view.wallPoints) cross(g, p, 6 * px);
  g.stroke({ width: 2 * px, color: WALL_COLOR });

  for (const p of view.shaftPoints) cross(g, p, 6 * px);
  g.stroke({ width: 2 * px, color: SHAFT_COLOR });
}
