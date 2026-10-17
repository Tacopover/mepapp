// Wall between two room polygons. The rings of room A are sampled every stepMm.
// A sample is a wall sample when the nearest boundary point of room B is close and
// lies across the edge of A, not along it. The longest run of wall samples on one
// ring of A gives the wall. Known limit: a wall narrower than the sampling step can
// be missed.

import type { Vec2 } from './geometry.js';
import type { RoomPolygon } from './rooms/types.js';
import { DEFAULT_MAX_WALL_MM, DEFAULT_MIN_WALL_RUN_MM } from './route-area.js';

const DEFAULT_STEP_MM = 100;

export interface WallStretch { point: Vec2; onA: Vec2; onB: Vec2; runMm: number; gapMm: number }

interface Sample { p: Vec2; pos: number; dir: Vec2[] }

interface Nearest { point: Vec2; dist: number }

/** The outer ring and the holes of a polygon. Rings with fewer than 2 points are skipped. */
function boundaryRings(poly: RoomPolygon): Vec2[][] {
  const rings: Vec2[][] = [];
  if (poly.outer.length >= 2) rings.push(poly.outer);
  for (const hole of poly.holes) {
    if (hole.length >= 2) rings.push(hole);
  }
  return rings;
}

function boundsOf(rings: Vec2[][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (rings.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function unitOf(a: Vec2, b: Vec2): Vec2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : null;
}

/** Length of a closed ring in pt. The last point connects to the first. */
function ringLength(ring: Vec2[]): number {
  const n = ring.length;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/**
 * Samples a closed ring every stepPt, starting at the first point. A sample on a
 * vertex lists the edges before and after that vertex in dir. Other samples list
 * the unit direction of their edge.
 */
function sampleRing(ring: Vec2[], stepPt: number): Sample[] {
  const samples: Sample[] = [];
  if (!(stepPt > 0)) return samples;
  const n = ring.length;
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    cum.push(cum[i]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n]!;
  let edge = 0;
  for (let k = 0; k * stepPt < total; k++) {
    const pos = k * stepPt;
    while (edge < n - 1 && cum[edge + 1]! <= pos) edge++;
    const a = ring[edge]!;
    const b = ring[(edge + 1) % n]!;
    const len = cum[edge + 1]! - cum[edge]!;
    const t = len > 0 ? (pos - cum[edge]!) / len : 0;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const dir: Vec2[] = [];
    const vertex = [edge, (edge + 1) % n].find((j) => Math.hypot(ring[j]!.x - p.x, ring[j]!.y - p.y) < 1e-6);
    if (vertex !== undefined) {
      for (const e of [(vertex - 1 + n) % n, vertex]) {
        const u = unitOf(ring[e]!, ring[(e + 1) % n]!);
        if (u) dir.push(u);
      }
    } else {
      const u = unitOf(a, b);
      if (u) dir.push(u);
    }
    samples.push({ p, pos, dir });
  }
  return samples;
}

/** The nearest point on the boundary of the polygon, and its distance in pt. */
function nearestOnBoundary(poly: RoomPolygon, p: Vec2): Nearest {
  let best: Nearest = { point: p, dist: Infinity };
  for (const ring of boundaryRings(poly)) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < best.dist) best = { point: q, dist };
    }
  }
  return best;
}

/** A sample is a wall sample when B is within maxWallMm and lies across the edge, not along it. */
function isWallSample(s: Sample, near: Nearest, mmPerPt: number, maxWallMm: number): boolean {
  const distMm = near.dist * mmPerPt;
  if (distMm > maxWallMm) return false;
  if (distMm < 1e-6) return true;
  const vx = (near.point.x - s.p.x) / near.dist;
  const vy = (near.point.y - s.p.y) / near.dist;
  return s.dir.some((d) => Math.abs(d.x * vx + d.y * vy) <= 0.5);
}

/**
 * Finds the longest wall between room A and room B. The wall is the run of wall
 * samples on one ring of A with the largest arc length. Returns null when the
 * longest run is shorter than minWallRunMm, or when the rooms do not touch within
 * maxWallMm. The inputs are not changed.
 */
export function wallStretch(
  a: RoomPolygon,
  b: RoomPolygon,
  mmPerPt: number,
  options: { maxWallMm?: number; minWallRunMm?: number; stepMm?: number } = {},
): WallStretch | null {
  if (!(mmPerPt > 0)) return null;
  const maxWallMm = options.maxWallMm ?? DEFAULT_MAX_WALL_MM;
  const minWallRunMm = options.minWallRunMm ?? DEFAULT_MIN_WALL_RUN_MM;
  const stepPt = (options.stepMm ?? DEFAULT_STEP_MM) / mmPerPt;
  const maxPt = maxWallMm / mmPerPt;
  const ringsA = boundaryRings(a);
  const boxA = boundsOf(ringsA);
  const boxB = boundsOf(boundaryRings(b));
  if (!boxA || !boxB) return null;
  if (
    boxA.minX > boxB.maxX + maxPt ||
    boxB.minX - maxPt > boxA.maxX ||
    boxA.minY > boxB.maxY + maxPt ||
    boxB.minY - maxPt > boxA.maxY
  ) {
    return null;
  }

  let best: { runMm: number; onA: Vec2; onB: Vec2; gapMm: number } | null = null;
  for (const ring of ringsA) {
    const samples = sampleRing(ring, stepPt);
    const n = samples.length;
    if (n === 0) continue;
    const near = samples.map((s) => nearestOnBoundary(b, s.p));
    const hit = samples.map((s, i) => isWallSample(s, near[i]!, mmPerPt, maxWallMm));
    const ringLenPt = ringLength(ring);

    const runs: Array<{ first: number; count: number; runPt: number }> = [];
    if (hit.every(Boolean)) {
      runs.push({ first: 0, count: n, runPt: ringLenPt });
    } else {
      for (let i = 0; i < n; i++) {
        if (!hit[i] || hit[(i - 1 + n) % n]) continue;
        let count = 0;
        let j = i;
        while (hit[j]) {
          count++;
          j = (j + 1) % n;
        }
        const last = (i + count - 1) % n;
        let runPt = samples[last]!.pos - samples[i]!.pos;
        if (runPt < 0) runPt += ringLenPt;
        runs.push({ first: i, count, runPt });
      }
    }

    for (const run of runs) {
      const runMm = run.runPt * mmPerPt;
      if (best && runMm <= best.runMm) continue;
      const mid = (run.first + Math.floor((run.count - 1) / 2)) % n;
      best = {
        runMm,
        onA: samples[mid]!.p,
        onB: near[mid]!.point,
        gapMm: near[mid]!.dist * mmPerPt,
      };
    }
  }

  if (!best || best.runMm < minWallRunMm - 1e-6) return null;
  return {
    point: { x: (best.onA.x + best.onB.x) / 2, y: (best.onA.y + best.onB.y) / 2 },
    onA: best.onA,
    onB: best.onB,
    runMm: best.runMm,
    gapMm: best.gapMm,
  };
}

/** The smallest distance in pt from a sample of a ring of `from` to the boundary of `to`. */
function minBoundaryDistPt(from: RoomPolygon, to: RoomPolygon, stepPt: number): number {
  let min = Infinity;
  for (const ring of boundaryRings(from)) {
    const points = [...sampleRing(ring, stepPt).map((s) => s.p), ...ring];
    for (const p of points) {
      const d = nearestOnBoundary(to, p).dist;
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * The smallest distance in mm between the boundaries of A and B, checked from both
 * sides. Returns Infinity when a polygon has no ring with 2 or more points, or when
 * mmPerPt is not positive.
 */
export function boundaryGapMm(a: RoomPolygon, b: RoomPolygon, mmPerPt: number, stepMm = DEFAULT_STEP_MM): number {
  if (!(mmPerPt > 0)) return Infinity;
  if (boundaryRings(a).length === 0 || boundaryRings(b).length === 0) return Infinity;
  const stepPt = stepMm / mmPerPt;
  return Math.min(minBoundaryDistPt(a, b, stepPt), minBoundaryDistPt(b, a, stepPt)) * mmPerPt;
}
