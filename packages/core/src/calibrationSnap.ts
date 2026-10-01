// Snapping for the calibration tool: points snap to the PDF's own vector lines so two
// calibration points land exactly on drawn geometry. Pure math, no rendering, no I/O.

import type { Vec2 } from './geometry.js';

/** Flat line list: line i occupies 4 numbers at [4*i ..] — x0, y0, x1, y1. */
export type SnapLines = Float64Array;

export interface LineSnap {
  point: Vec2;
  /** Index of the line the point snapped to. */
  lineIndex: number;
  /** True when the point snapped to a line end point rather than the middle of a line. */
  atEndpoint: boolean;
}

/** Closest point on any line to `point`, within `radius`. A line end point wins over a nearby middle point. */
export function snapToNearestLine(point: Vec2, lines: SnapLines, radius: number): LineSnap | null {
  let best: LineSnap | null = null;
  let bestDist = radius;
  let bestEnd: LineSnap | null = null;
  let bestEndDist = radius;
  const count = lines.length / 4;
  for (let i = 0; i < count; i++) {
    const x0 = lines[4 * i];
    const y0 = lines[4 * i + 1];
    const x1 = lines[4 * i + 2];
    const y1 = lines[4 * i + 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((point.x - x0) * dx + (point.y - y0) * dy) / lenSq));
    const px = x0 + t * dx;
    const py = y0 + t * dy;
    const dist = Math.hypot(point.x - px, point.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      best = { point: { x: px, y: py }, lineIndex: i, atEndpoint: t === 0 || t === 1 };
    }
    const dist0 = Math.hypot(point.x - x0, point.y - y0);
    if (dist0 < bestEndDist) {
      bestEndDist = dist0;
      bestEnd = { point: { x: x0, y: y0 }, lineIndex: i, atEndpoint: true };
    }
    const dist1 = Math.hypot(point.x - x1, point.y - y1);
    if (dist1 < bestEndDist) {
      bestEndDist = dist1;
      bestEnd = { point: { x: x1, y: y1 }, lineIndex: i, atEndpoint: true };
    }
  }
  return bestEnd ?? best;
}

export interface OrthogonalSnap {
  point: Vec2;
  axis: 'x' | 'y';
  /** Set when the point also snapped to a line crossing the horizontal/vertical ray. */
  lineIndex: number | null;
}

/**
 * Constrains `raw` to the horizontal or vertical ray through `anchor` (whichever axis the
 * pointer is closer to), then snaps it to the nearest PDF line that crosses that ray within
 * `radius`. With no crossing line close enough the point stays on the ray at the pointer's position.
 */
export function snapOrthogonal(anchor: Vec2, raw: Vec2, lines: SnapLines | null, radius: number): OrthogonalSnap {
  const horizontal = Math.abs(raw.x - anchor.x) >= Math.abs(raw.y - anchor.y);
  const projected: Vec2 = horizontal ? { x: raw.x, y: anchor.y } : { x: anchor.x, y: raw.y };
  const result: OrthogonalSnap = { point: projected, axis: horizontal ? 'x' : 'y', lineIndex: null };
  if (!lines) return result;

  // Ray space: `a` runs along the ray, `b` across it. `fixed` is the ray's own b coordinate.
  const along = horizontal ? raw.x : raw.y;
  const fixed = horizontal ? anchor.y : anchor.x;
  let bestDist = radius;
  const count = lines.length / 4;
  for (let i = 0; i < count; i++) {
    const a0 = horizontal ? lines[4 * i] : lines[4 * i + 1];
    const b0 = horizontal ? lines[4 * i + 1] : lines[4 * i];
    const a1 = horizontal ? lines[4 * i + 2] : lines[4 * i + 3];
    const b1 = horizontal ? lines[4 * i + 3] : lines[4 * i + 2];
    if (b0 === b1) continue; // parallel to the ray (or a point): never crosses it
    const t = (fixed - b0) / (b1 - b0);
    if (t < 0 || t > 1) continue;
    const crossing = a0 + t * (a1 - a0);
    const dist = Math.abs(crossing - along);
    if (dist < bestDist) {
      bestDist = dist;
      result.point = horizontal ? { x: crossing, y: fixed } : { x: fixed, y: crossing };
      result.lineIndex = i;
    }
  }
  return result;
}

export interface AngleSnap {
  point: Vec2;
  /** Set when the point also snapped to a line crossing the angle ray. */
  lineIndex: number | null;
}

/**
 * Like snapOrthogonal, for any angle step: constrains `raw` to the ray through `anchor` whose
 * heading is the multiple of `incrementDegrees` nearest the pointer's, then snaps it to the
 * nearest PDF line crossing that ray within `radius`.
 */
export function snapAngle(anchor: Vec2, raw: Vec2, lines: SnapLines | null, radius: number, incrementDegrees: number): AngleSnap {
  const dx = raw.x - anchor.x;
  const dy = raw.y - anchor.y;
  if (incrementDegrees <= 0 || (dx === 0 && dy === 0)) return { point: raw, lineIndex: null };
  const incrementRad = (incrementDegrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / incrementRad) * incrementRad;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const along = dx * ux + dy * uy; // pointer's distance along the ray (negative: behind the anchor)
  const result: AngleSnap = { point: { x: anchor.x + ux * along, y: anchor.y + uy * along }, lineIndex: null };
  if (!lines) return result;

  let bestDist = radius;
  const count = lines.length / 4;
  for (let i = 0; i < count; i++) {
    const ex = lines[4 * i + 2] - lines[4 * i];
    const ey = lines[4 * i + 3] - lines[4 * i + 1];
    const denom = ux * ey - uy * ex; // u × e — zero when the line runs parallel to the ray
    if (Math.abs(denom) < 1e-9 * Math.hypot(ex, ey)) continue;
    const wx = lines[4 * i] - anchor.x;
    const wy = lines[4 * i + 1] - anchor.y;
    const s = (wx * ey - wy * ex) / denom; // distance along the ray at the crossing
    const t = (wx * uy - wy * ux) / denom; // position along the line at the crossing
    if (t < 0 || t > 1) continue;
    const dist = Math.abs(s - along);
    if (dist < bestDist) {
      bestDist = dist;
      result.point = { x: anchor.x + ux * s, y: anchor.y + uy * s };
      result.lineIndex = i;
    }
  }
  return result;
}
