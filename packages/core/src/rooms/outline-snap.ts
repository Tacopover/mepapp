// Outline snapping: the outline of a bounded fill is an estimate that ends in round shapes where
// no wall exists. Points of the outline that lie near a wall line, and run along it, move onto the
// wall line. The outline then follows the walls that do exist. Plan: .claude/plans/room-detection.md.

import type { Vec2 } from '../geometry.js';
import { polygonAreaPt2 } from './room.js';
import { SEGMENT_STRIDE, type FilteredWalls, type RoomPolygon } from './types.js';

export interface OutlineSnapOptions {
  radiusMm?: number; // wall lines further away than this do not attract the outline, default 600
  stepMm?: number; // distance between the tested outline points, default 150
  maxAngleDeg?: number; // a wall line must run within this angle of the outline, default 30
  simplifyMm?: number; // tolerance for removing points on a straight line afterwards, default 40
  maxAreaChange?: number; // the snapped outline is dropped when its area differs more than this fraction, default 0.25
}

function resample(ring: readonly Vec2[], stepPt: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / stepPt));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function simplifyRing(ring: Vec2[], tolPt: number): Vec2[] {
  let pts = ring;
  for (let pass = 0; pass < 3; pass++) {
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length]!;
      const c = pts[i]!;
      const n = pts[(i + 1) % pts.length]!;
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      const len = Math.hypot(dx, dy);
      const off = len === 0 ? Math.hypot(c.x - p.x, c.y - p.y) : Math.abs((c.x - p.x) * dy - (c.y - p.y) * dx) / len;
      if (off > tolPt) next.push(c);
    }
    if (next.length < 3 || next.length === pts.length) return next.length < 3 ? pts : next;
    pts = next;
  }
  return pts;
}

/** Moves the outer outline onto nearby wall lines. Holes stay. Returns the polygon unchanged when snapping changes the area too much. */
export function snapOutlineToWalls(polygon: RoomPolygon, walls: FilteredWalls, mmPerPt: number, options: OutlineSnapOptions = {}): RoomPolygon {
  const radius = (options.radiusMm ?? 600) / mmPerPt;
  const step = (options.stepMm ?? 150) / mmPerPt;
  const cosMin = Math.cos(((options.maxAngleDeg ?? 30) * Math.PI) / 180);
  const outer = polygon.outer;
  if (outer.length < 3) return polygon;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of outer) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const segs = walls.walls.segments;
  const near: number[] = [];
  for (let i = 0; i < walls.walls.segmentCount; i++) {
    if (!walls.keep[i]) continue;
    const o = i * SEGMENT_STRIDE;
    const ax = segs[o]!;
    const ay = segs[o + 1]!;
    const bx = segs[o + 2]!;
    const by = segs[o + 3]!;
    if (Math.max(ax, bx) < x0 - radius || Math.min(ax, bx) > x1 + radius || Math.max(ay, by) < y0 - radius || Math.min(ay, by) > y1 + radius) continue;
    near.push(ax, ay, bx, by);
  }
  if (near.length === 0) return polygon;

  const pts = resample(outer, step);
  const snapped: Vec2[] = pts.map((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length]!;
    const next = pts[(i + 1) % pts.length]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let best: Vec2 | null = null;
    let bestD = radius;
    for (let k = 0; k < near.length; k += 4) {
      const ax = near[k]!;
      const ay = near[k + 1]!;
      const dx = near[k + 2]! - ax;
      const dy = near[k + 3]! - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const len = Math.sqrt(len2);
      if (Math.abs((dx * tx + dy * ty) / len) < cosMin) continue;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < bestD) {
        bestD = d;
        best = { x: qx, y: qy };
      }
    }
    return best ?? p;
  });
  const ring = simplifyRing(snapped, (options.simplifyMm ?? 40) / mmPerPt);
  if (ring.length < 3) return polygon;
  const result: RoomPolygon = { outer: ring, holes: polygon.holes };
  const before = polygonAreaPt2({ outer, holes: [] });
  const after = polygonAreaPt2({ outer: ring, holes: [] });
  if (before <= 0 || Math.abs(after / before - 1) > (options.maxAreaChange ?? 0.25)) return polygon;
  return result;
}
