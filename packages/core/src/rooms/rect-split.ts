// Rectangular split: several room labels lie in one region (one room drawn with dashed or no
// partitions, for example server room, archive and storage in one space). The region is cut
// with straight, axis-aligned lines (guillotine cuts) so that each label gets its own piece and
// the pieces follow the printed areas. For a rectangular region the pieces are rectangles.
// Plan: .claude/plans/room-detection.md, section 8i.

import type { Vec2 } from '../geometry.js';
import { polygonIntersection, rectPolygon } from './clip.js';
import { polygonAreaPt2, polygonContainsPoint } from './room.js';
import type { RoomPolygon } from './types.js';

export interface RectSplitTarget {
  anchor: Vec2;
  targetM2: number | null; // printed area; null when the label has none
}

const areaOf = (polys: readonly RoomPolygon[]): number => polys.reduce((s, p) => s + polygonAreaPt2(p), 0);

function bounds(p: RoomPolygon): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of p.outer) {
    x0 = Math.min(x0, v.x);
    y0 = Math.min(y0, v.y);
    x1 = Math.max(x1, v.x);
    y1 = Math.max(y1, v.y);
  }
  return { x0, y0, x1, y1 };
}

/** The part of `poly` on one side of the line `axis = c`; `low` selects the side with the smaller coordinate. */
function side(poly: RoomPolygon, axis: 'x' | 'y', c: number, low: boolean, b: ReturnType<typeof bounds>): RoomPolygon[] {
  const pad = 10;
  const half = axis === 'x' ? (low ? rectPolygon(b.x0 - pad, b.y0 - pad, c, b.y1 + pad) : rectPolygon(c, b.y0 - pad, b.x1 + pad, b.y1 + pad)) : low ? rectPolygon(b.x0 - pad, b.y0 - pad, b.x1 + pad, c) : rectPolygon(b.x0 - pad, c, b.x1 + pad, b.y1 + pad);
  return polygonIntersection(poly, half);
}

/** The piece (of several) that holds the most anchors, then the largest. */
function pick(pieces: readonly RoomPolygon[], anchors: readonly Vec2[]): RoomPolygon | null {
  if (pieces.length === 0) return null;
  const score = (p: RoomPolygon): number => anchors.filter((a) => polygonContainsPoint(p, a)).length * 1e12 + polygonAreaPt2(p);
  return [...pieces].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Splits `region` among the targets. Returns one polygon per target (same order), or null when
 * there are fewer than two targets or a cut fails. The wanted area of a target is its printed
 * area; a target without one gets an equal share of the area the others leave.
 */
export function splitRectangular(region: RoomPolygon, targets: readonly RectSplitTarget[], mmPerPt: number): RoomPolygon[] | null {
  if (targets.length < 2) return null;
  const total = polygonAreaPt2(region);
  if (total <= 0) return null;
  const known = targets.reduce((s, t) => s + (t.targetM2 ?? 0), 0);
  const knownPt2 = (known * 1e6) / (mmPerPt * mmPerPt);
  const unknown = targets.filter((t) => t.targetM2 === null).length;
  const rest = Math.max(total - knownPt2, total * 0.1);
  const weight = targets.map((t) => (t.targetM2 !== null ? (t.targetM2 * 1e6) / (mmPerPt * mmPerPt) : rest / Math.max(unknown, 1)));
  const out: (RoomPolygon | null)[] = targets.map(() => null);

  const part = (poly: RoomPolygon, idx: number[]): boolean => {
    if (idx.length === 1) {
      out[idx[0]!] = poly;
      return true;
    }
    const xs = idx.map((i) => targets[i]!.anchor.x);
    const ys = idx.map((i) => targets[i]!.anchor.y);
    const axis: 'x' | 'y' = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
    const coord = (i: number): number => targets[i]!.anchor[axis];
    const sorted = [...idx].sort((p, q) => coord(p) - coord(q));
    // Cut at the largest gap between neighbouring labels.
    let cutAt = 1;
    let gap = -1;
    for (let s = 1; s < sorted.length; s++) {
      const g = coord(sorted[s]!) - coord(sorted[s - 1]!);
      if (g > gap) {
        gap = g;
        cutAt = s;
      }
    }
    const left = sorted.slice(0, cutAt);
    const right = sorted.slice(cutAt);
    const lo = Math.max(...left.map(coord));
    const hi = Math.min(...right.map(coord));
    const b = bounds(poly);
    const polyArea = polygonAreaPt2(poly);
    const wantFrac = left.reduce((s, i) => s + weight[i]!, 0) / idx.reduce((s, i) => s + weight[i]!, 0);
    // Bisection on the cut coordinate: the low side must hold the wanted share of the area.
    let a = axis === 'x' ? b.x0 : b.y0;
    let z = axis === 'x' ? b.x1 : b.y1;
    for (let it = 0; it < 28; it++) {
      const mid = (a + z) / 2;
      if (areaOf(side(poly, axis, mid, true, b)) / polyArea < wantFrac) a = mid;
      else z = mid;
    }
    // Each label keeps its own side of the cut.
    const margin = Math.min(gap / 4, 3);
    const c = Math.min(Math.max((a + z) / 2, lo + margin), hi - margin);
    const lowPiece = pick(side(poly, axis, c, true, b), left.map((i) => targets[i]!.anchor));
    const highPiece = pick(side(poly, axis, c, false, b), right.map((i) => targets[i]!.anchor));
    if (!lowPiece || !highPiece) return false;
    return part(lowPiece, left) && part(highPiece, right);
  };
  if (!part(region, targets.map((_, i) => i))) return null;
  return out as RoomPolygon[];
}
