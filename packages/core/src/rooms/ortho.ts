// Orthogonal preference: rooms are nearly always bounded by walls at right angles. The outline of
// a fill has small errors: door frames cut corners, edges lean by a degree or two, short slanted
// pieces appear where two wall faces meet. This pass turns every edge that is nearly parallel to
// an axis of the plan into an exact axis-parallel line and replaces short slanted pieces by a
// right-angle corner or a straight jog. A slanted edge stays when a kept wall line runs along it
// (a real slanted wall). Without walls, only short slanted edges are replaced. A plan with few
// axis-parallel edges is not touched. Plan: .claude/plans/room-detection.md.

import type { Vec2 } from '../geometry.js';
import { nearKeptSegments, simplifyRing } from './outline-snap.js';
import { polygonAreaPt2 } from './room.js';
import type { FilteredWalls, RoomPolygon } from './types.js';

export interface OrthoOptions {
  axisTolDeg?: number; // an edge within this angle of an axis becomes axis-parallel, default 8
  minSlantMm?: number; // without walls: a slanted edge shorter than this is replaced by a right-angle corner, default 500
  maxFreeMm?: number; // with walls: a slanted edge without a wall line along it is replaced when shorter than this, default 4000
  supportMm?: number; // a wall line supports an edge when it lies within this distance, default 100
  mergeMm?: number; // parallel neighbours closer than this become one line, default 60
  maxMoveMm?: number; // a new corner must lie within this distance of the removed edges (or of the old corner), default 400
  minShare?: number; // share of the outline length that runs along an axis before the pass acts, default 0.6
  maxAreaChange?: number; // the result is dropped when its area differs more than this fraction, default 0.08
}

interface Line {
  p: Vec2;
  ux: number;
  uy: number;
  len: number;
  axis: boolean;
  gap: Vec2[]; // vertices of the removed slanted edges between the previous line and this one, both ends included
}

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

function selfIntersects(ring: readonly Vec2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
      const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
      const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
      const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

/** Returns the outer outline with axis-parallel edges. Holes stay. Returns the polygon itself when nothing applies or the result is not safe. */
export function orthogonalizeOutline(polygon: RoomPolygon, walls: FilteredWalls | null, mmPerPt: number, options: OrthoOptions = {}): RoomPolygon {
  const outer = polygon.outer;
  const n = outer.length;
  if (n < 4) return polygon;
  const tol = ((options.axisTolDeg ?? 8) * Math.PI) / 180;
  const minSlant = (options.minSlantMm ?? 500) / mmPerPt;
  const mergeLen = (options.mergeMm ?? 60) / mmPerPt;
  const maxFree = (options.maxFreeMm ?? 4000) / mmPerPt;
  const support = (options.supportMm ?? 100) / mmPerPt;
  const maxMove = (options.maxMoveMm ?? 400) / mmPerPt;
  const near = walls ? nearKeptSegments(outer, walls, support) : [];
  const cosSupport = Math.cos(((options.axisTolDeg ?? 8) * Math.PI) / 180);
  // A kept wall line that runs along the edge for at least half of its length.
  const supported = (a: Vec2, b: Vec2, len: number): boolean => {
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let covered = 0;
    for (let k = 0; k < near.length; k += 4) {
      const dx = near[k + 2]! - near[k]!;
      const dy = near[k + 3]! - near[k + 1]!;
      const sl = Math.hypot(dx, dy);
      if (sl === 0 || Math.abs((dx * ux + dy * uy) / sl) < cosSupport) continue;
      if (Math.abs(cross(ux, uy, near[k]! - a.x, near[k + 1]! - a.y)) > support || Math.abs(cross(ux, uy, near[k + 2]! - a.x, near[k + 3]! - a.y)) > support) continue;
      const t0 = (near[k]! - a.x) * ux + (near[k + 1]! - a.y) * uy;
      const t1 = (near[k + 2]! - a.x) * ux + (near[k + 3]! - a.y) * uy;
      covered += Math.max(0, Math.min(len, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)));
    }
    return covered >= len / 2;
  };

  // Dominant direction of the outline, weighted by edge length (angles folded to a quarter turn).
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    sx += len * Math.cos(4 * ang);
    sy += len * Math.sin(4 * ang);
    total += len;
  }
  if (total === 0) return polygon;
  let theta = Math.atan2(sy, sx) / 4;
  // A plan drawn along the page edges has exact axes; a tilt of a few degrees comes from the estimate.
  if (Math.abs(theta) < (4 * Math.PI) / 180) theta = 0;
  const quarter = Math.PI / 2;
  const snapDir = (dx: number, dy: number): { dev: number; ux: number; uy: number } => {
    const ang = Math.atan2(dy, dx);
    const k = Math.round((ang - theta) / quarter);
    const snapped = theta + k * quarter;
    return { dev: Math.abs(ang - snapped), ux: Math.cos(snapped), uy: Math.sin(snapped) };
  };
  let axisLen = 0;
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    if (snapDir(b.x - a.x, b.y - a.y).dev <= tol) axisLen += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (axisLen / total < (options.minShare ?? 0.6)) return polygon;

  // Lines: axis edges snap to an exact axis line through their midpoint, long slanted edges stay,
  // short slanted edges and tiny edges are removed and remembered as the gap between two lines.
  const lines: Line[] = [];
  let pending: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const sd = snapDir(dx, dy);
    const axis = sd.dev <= tol;
    const free = !axis && (walls ? len < maxFree && !supported(a, b, len) : len < minSlant);
    if (free || len < mergeLen) {
      if (pending.length === 0) pending.push(a);
      pending.push(b);
      continue;
    }
    const gap = pending.length > 0 ? pending : [a];
    pending = [];
    lines.push(axis ? { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ux: sd.ux, uy: sd.uy, len, axis, gap } : { p: a, ux: dx / len, uy: dy / len, len, axis, gap });
  }
  if (lines.length < 3) return polygon;
  // Removed edges after the last kept edge belong to the gap before the first line.
  if (pending.length > 0) lines[0]!.gap = [...pending, ...lines[0]!.gap.slice(1)];

  // Parallel neighbours that lie within mergeMm of each other are one line.
  for (let changed = true; changed && lines.length > 3; ) {
    changed = false;
    for (let j = 0; j < lines.length && lines.length > 3; j++) {
      const k = (j + 1) % lines.length;
      const l1 = lines[j]!;
      const l2 = lines[k]!;
      if (!l1.axis || !l2.axis || Math.abs(cross(l1.ux, l1.uy, l2.ux, l2.uy)) > 1e-6 || l1.ux * l2.ux + l1.uy * l2.uy < 0) continue;
      const off1 = cross(l1.ux, l1.uy, l1.p.x, l1.p.y);
      const off2 = cross(l1.ux, l1.uy, l2.p.x, l2.p.y);
      if (Math.abs(off1 - off2) > mergeLen) continue;
      const off = (off1 * l1.len + off2 * l2.len) / (l1.len + l2.len);
      const shift = off - off1;
      l1.p = { x: l1.p.x - l1.uy * shift, y: l1.p.y + l1.ux * shift };
      l1.len += l2.len;
      lines.splice(k, 1);
      changed = true;
      break;
    }
  }
  if (lines.length < 3) return polygon;

  // Corners: intersection of two lines that meet, a straight jog for two parallel lines.
  const ring: Vec2[] = [];
  for (let j = 0; j < lines.length; j++) {
    const l1 = lines[(j + lines.length - 1) % lines.length]!;
    const l2 = lines[j]!;
    const gap = l2.gap;
    const mid: Vec2 = { x: gap.reduce((s, g) => s + g.x, 0) / gap.length, y: gap.reduce((s, g) => s + g.y, 0) / gap.length };
    const c = cross(l1.ux, l1.uy, l2.ux, l2.uy);
    if (Math.abs(c) > 0.05) {
      const t = cross(l2.p.x - l1.p.x, l2.p.y - l1.p.y, l2.ux, l2.uy) / c;
      const x = { x: l1.p.x + t * l1.ux, y: l1.p.y + t * l1.uy };
      let run = 0;
      for (let g = 1; g < gap.length; g++) run += Math.hypot(gap[g]!.x - gap[g - 1]!.x, gap[g]!.y - gap[g - 1]!.y);
      if (Math.hypot(x.x - mid.x, x.y - mid.y) <= Math.max(maxMove, run)) ring.push(x);
      else ring.push(...gap);
    } else if (l1.ux * l2.ux + l1.uy * l2.uy > 0) {
      const t1 = (mid.x - l1.p.x) * l1.ux + (mid.y - l1.p.y) * l1.uy;
      const t2 = (mid.x - l2.p.x) * l2.ux + (mid.y - l2.p.y) * l2.uy;
      ring.push({ x: l1.p.x + t1 * l1.ux, y: l1.p.y + t1 * l1.uy }, { x: l2.p.x + t2 * l2.ux, y: l2.p.y + t2 * l2.uy });
    } else {
      ring.push(...gap);
    }
  }
  const clean = simplifyRing(ring, 20 / mmPerPt);
  if (clean.length < 3 || clean.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)) || selfIntersects(clean)) return polygon;
  const before = polygonAreaPt2({ outer, holes: [] });
  const after = polygonAreaPt2({ outer: clean, holes: [] });
  if (before <= 0 || Math.abs(after / before - 1) > (options.maxAreaChange ?? 0.08)) return polygon;
  return { outer: clean, holes: polygon.holes };
}
