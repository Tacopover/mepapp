// Vertex snapping: moves the edges of a traced room ring onto the kept wall lines and rebuilds the corners
// as intersections of neighbouring snapped edges, see .claude/plans/room-detection-algorithm.md section B.
// The ring comes from a pixel mask, so its edges lie up to half a pixel beside the drawn lines and its
// corners may be cut. Rings are flat arrays [x0, y0, x1, y1, ...] in page points.

import { SEGMENT_STRIDE } from './types.js';
import type { Ring } from './polygon.js';

export interface SnapOptions {
  tolPt: number; // an edge snaps to a wall line at most this far away; a vertex moves at most this far
  angTolDeg: number; // an edge snaps to a wall line that differs in direction by at most this angle
}

interface Line {
  px: number; // point on the line
  py: number;
  ux: number; // unit direction
  uy: number;
}

// True when the closed ring has no two edges that cross or touch (neighbours may share their vertex).
export function isSimpleFlatRing(ring: readonly number[]): boolean {
  const n = ring.length >> 1;
  if (n < 3) return false;
  const eps = 1e-9;
  const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const on = (x0: number, y0: number, x1: number, y1: number, x: number, y: number): boolean =>
    x >= Math.min(x0, x1) - eps && x <= Math.max(x0, x1) + eps && y >= Math.min(y0, y1) - eps && y <= Math.max(y0, y1) + eps;
  for (let i = 0; i < n; i++) {
    const ax = ring[2 * i]!;
    const ay = ring[2 * i + 1]!;
    const bx = ring[2 * ((i + 1) % n)]!;
    const by = ring[2 * ((i + 1) % n) + 1]!;
    if (ax === bx && ay === by) return false;
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const cx = ring[2 * j]!;
      const cy = ring[2 * j + 1]!;
      const dx = ring[2 * ((j + 1) % n)]!;
      const dy = ring[2 * ((j + 1) % n) + 1]!;
      const o1 = orient(ax, ay, bx, by, cx, cy);
      const o2 = orient(ax, ay, bx, by, dx, dy);
      const o3 = orient(cx, cy, dx, dy, ax, ay);
      const o4 = orient(cx, cy, dx, dy, bx, by);
      if (o1 * o2 < 0 && o3 * o4 < 0) return false;
      if (Math.abs(o1) < eps && on(ax, ay, bx, by, cx, cy)) return false;
      if (Math.abs(o2) < eps && on(ax, ay, bx, by, dx, dy)) return false;
      if (Math.abs(o3) < eps && on(cx, cy, dx, dy, ax, ay)) return false;
      if (Math.abs(o4) < eps && on(cx, cy, dx, dy, bx, by)) return false;
    }
  }
  return true;
}

function flatArea(r: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    s += r[i]! * r[j + 1]! - r[j]! * r[i + 1]!;
  }
  return s / 2;
}

/**
 * Snaps one ring to the kept wall segments. An edge snaps to the nearest kept segment that is nearly parallel,
 * lies within `tolPt` of both edge end points and overlaps at least half of the edge. A vertex between two
 * snapped edges moves to their intersection, a vertex next to one snapped edge moves onto that edge line, and
 * every other vertex stays. A vertex that would move more than `tolPt` stays. When the result is not a simple
 * ring, or changes the area by more than 10%, the input ring is returned.
 */
export function snapRingToWalls(ring: Ring, segs: Float64Array, count: number, keep: Uint8Array, opt: SnapOptions): Ring {
  const n = ring.length >> 1;
  if (n < 3) return ring;
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < n; i++) {
    minx = Math.min(minx, ring[2 * i]!);
    maxx = Math.max(maxx, ring[2 * i]!);
    miny = Math.min(miny, ring[2 * i + 1]!);
    maxy = Math.max(maxy, ring[2 * i + 1]!);
  }
  const pad = opt.tolPt + 1;
  // Kept segments near the ring, as [ax, ay, bx, by, ux, uy].
  const near: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    const o = i * SEGMENT_STRIDE;
    const ax = segs[o]!;
    const ay = segs[o + 1]!;
    const bx = segs[o + 2]!;
    const by = segs[o + 3]!;
    if (Math.max(ax, bx) < minx - pad || Math.min(ax, bx) > maxx + pad || Math.max(ay, by) < miny - pad || Math.min(ay, by) > maxy + pad) continue;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    near.push(ax, ay, bx, by, (bx - ax) / len, (by - ay) / len);
  }
  if (!near.length) return ring;
  const sinTol = Math.sin((opt.angTolDeg * Math.PI) / 180);

  const lines: (Line | null)[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = ring[2 * j]! - ring[2 * i]!;
    const ey = ring[2 * j + 1]! - ring[2 * i + 1]!;
    const len = Math.hypot(ex, ey);
    let best: Line | null = null;
    let bestD = Infinity;
    if (len > 1e-9) {
      const ux = ex / len;
      const uy = ey / len;
      for (let k = 0; k < near.length; k += 6) {
        const sux = near[k + 4]!;
        const suy = near[k + 5]!;
        if (Math.abs(ux * suy - uy * sux) > sinTol) continue;
        const ax = near[k]!;
        const ay = near[k + 1]!;
        // Perpendicular distances of the two edge end points to the segment line.
        const d0 = Math.abs((ring[2 * i]! - ax) * suy - (ring[2 * i + 1]! - ay) * sux);
        const d1 = Math.abs((ring[2 * j]! - ax) * suy - (ring[2 * j + 1]! - ay) * sux);
        const dist = Math.max(d0, d1);
        if (dist > opt.tolPt || dist >= bestD) continue;
        // Overlap of the segment and the edge along the edge direction.
        const t0 = (ax - ring[2 * i]!) * ux + (ay - ring[2 * i + 1]!) * uy;
        const t1 = (near[k + 2]! - ring[2 * i]!) * ux + (near[k + 3]! - ring[2 * i + 1]!) * uy;
        const overlap = Math.min(Math.max(t0, t1), len) - Math.max(Math.min(t0, t1), 0);
        if (overlap < 0.5 * len) continue;
        bestD = dist;
        best = { px: ax, py: ay, ux: sux, uy: suy };
      }
    }
    lines.push(best);
  }
  if (!lines.some((l) => l)) return ring;

  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const px = ring[2 * i]!;
    const py = ring[2 * i + 1]!;
    const prev = lines[(i + n - 1) % n]!;
    const next = lines[i]!;
    let vx = px;
    let vy = py;
    const project = (l: Line): void => {
      const t = (px - l.px) * l.ux + (py - l.py) * l.uy;
      vx = l.px + t * l.ux;
      vy = l.py + t * l.uy;
    };
    if (prev && next) {
      const den = prev.ux * next.uy - prev.uy * next.ux;
      if (Math.abs(den) > 0.17) {
        const t = ((next.px - prev.px) * next.uy - (next.py - prev.py) * next.ux) / den;
        vx = prev.px + t * prev.ux;
        vy = prev.py + t * prev.uy;
      } else project(next);
    } else if (next) project(next);
    else if (prev) project(prev);
    if (Math.hypot(vx - px, vy - py) > opt.tolPt) {
      vx = px;
      vy = py;
    }
    out.push(vx, vy);
  }
  // Drop vertices that snapping made duplicate.
  const clean: Ring = [];
  for (let i = 0; i < out.length; i += 2) {
    const l = clean.length;
    if (l >= 2 && Math.hypot(out[i]! - clean[l - 2]!, out[i + 1]! - clean[l - 1]!) < 1e-6) continue;
    clean.push(out[i]!, out[i + 1]!);
  }
  if (clean.length >= 6 && Math.hypot(clean[0]! - clean[clean.length - 2]!, clean[1]! - clean[clean.length - 1]!) < 1e-6) clean.length -= 2;
  if (clean.length < 6 || !isSimpleFlatRing(clean)) return ring;
  const a0 = flatArea(ring);
  const a1 = flatArea(clean);
  if (a0 * a1 <= 0 || Math.abs(a1 - a0) > 0.1 * Math.abs(a0)) return ring;
  return clean;
}
