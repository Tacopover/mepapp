// Geometry for correcting room polygons by hand: move, insert and remove vertices,
// split a room by a cut line, merge two rooms. Plan: .claude/plans/room-detection.md phase 8.

import type { Vec2 } from '../geometry.js';
import { pointInRing, simplifyRing, signedRingArea, traceMaskBoundaries } from './polygon.js';
import type { RoomPolygon } from './types.js';

/** A vertex of a polygon: ring 0 is the outer ring, ring k + 1 is holes[k]. */
export interface VertexRef {
  ring: number;
  index: number;
}

/** An edge of a polygon: the edge from vertex `index` to vertex `index + 1` of the ring. */
export interface EdgeHit {
  ring: number;
  index: number;
  point: Vec2; // the nearest point on the edge
  distance: number;
}

const ringsOf = (p: RoomPolygon): Vec2[][] => [p.outer, ...p.holes];

function withRings(rings: Vec2[][]): RoomPolygon {
  return { outer: rings[0]!, holes: rings.slice(1) };
}

const flat = (ring: readonly Vec2[]): number[] => ring.flatMap((p) => [p.x, p.y]);

function ringArea(ring: readonly Vec2[]): number {
  return Math.abs(signedRingArea(flat(ring)));
}

function pointSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** The vertex nearest to `p` within `maxDist`, or null. */
export function nearestVertex(polygon: RoomPolygon, p: Vec2, maxDist: number): VertexRef | null {
  let best: VertexRef | null = null;
  let bestDist = maxDist;
  ringsOf(polygon).forEach((ring, r) => {
    ring.forEach((v, i) => {
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = { ring: r, index: i };
      }
    });
  });
  return best;
}

/** The edge nearest to `p` within `maxDist`, or null. */
export function nearestEdge(polygon: RoomPolygon, p: Vec2, maxDist: number): EdgeHit | null {
  let best: EdgeHit | null = null;
  ringsOf(polygon).forEach((ring, r) => {
    for (let i = 0; i < ring.length; i++) {
      const hit = pointSegment(p, ring[i]!, ring[(i + 1) % ring.length]!);
      if (hit.distance <= maxDist && (best === null || hit.distance < best.distance)) best = { ring: r, index: i, ...hit };
    }
  });
  return best;
}

export function moveVertex(polygon: RoomPolygon, ref: VertexRef, to: Vec2): RoomPolygon {
  const rings = ringsOf(polygon).map((ring, r) => (r === ref.ring ? ring.map((v, i) => (i === ref.index ? { ...to } : v)) : ring));
  return withRings(rings);
}

/** Inserts a vertex on the edge that starts at `afterIndex`. The new vertex gets index `afterIndex + 1`. */
export function insertVertex(polygon: RoomPolygon, ring: number, afterIndex: number, at: Vec2): RoomPolygon {
  const rings = ringsOf(polygon).map((rg, r) => (r === ring ? [...rg.slice(0, afterIndex + 1), { ...at }, ...rg.slice(afterIndex + 1)] : rg));
  return withRings(rings);
}

/** Removes a vertex. A ring keeps at least 3 vertices: returns null when the ring would get smaller. */
export function removeVertex(polygon: RoomPolygon, ref: VertexRef): RoomPolygon | null {
  const rings = ringsOf(polygon);
  const target = rings[ref.ring];
  if (!target || target.length <= 3) return null;
  return withRings(rings.map((rg, r) => (r === ref.ring ? rg.filter((_, i) => i !== ref.index) : rg)));
}

interface Crossing {
  edge: number; // edge index: from vertex edge to vertex edge + 1
  s: number; // position along the cut line, in units of the cut length
  point: Vec2;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * Splits a polygon along the line through `a` and `b`. The chord of the polygon that lies
 * on this line and is nearest to the middle of a-b is the cut. Returns the two pieces, or null
 * when the line does not cross the polygon, the cut touches a hole, or a piece would be empty.
 * Holes go to the piece that contains them.
 */
export function splitPolygon(polygon: RoomPolygon, a: Vec2, b: Vec2): [RoomPolygon, RoomPolygon] | null {
  const ring = polygon.outer;
  const n = ring.length;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (n < 3 || len2 === 0) return null;
  const crossings: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    // Solve a + s * d = p + t * e with cross products: s on the line (0 = a, 1 = b), t on the edge (0..1).
    const s = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
    const t = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t < 0 || t >= 1) continue;
    crossings.push({ edge: i, s, point: { x: p.x + t * ex, y: p.y + t * ey } });
  }
  if (crossings.length < 2 || crossings.length % 2 !== 0) return null;
  crossings.sort((x, y) => x.s - y.s);
  // The chords of the polygon on the line are the pairs (0,1), (2,3), ...: pick the one nearest to the middle of a-b.
  let best: [Crossing, Crossing] | null = null;
  let bestGap = Infinity;
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    const c1 = crossings[k]!;
    const c2 = crossings[k + 1]!;
    const gap = 0.5 < c1.s ? c1.s - 0.5 : 0.5 > c2.s ? 0.5 - c2.s : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = [c1, c2];
    }
  }
  if (!best) return null;
  let [c1, c2] = best;
  if (c1.edge === c2.edge) return null;
  if (c1.edge > c2.edge) [c1, c2] = [c2, c1];
  for (const hole of polygon.holes) {
    for (let i = 0; i < hole.length; i++) if (segmentsCross(c1.point, c2.point, hole[i]!, hole[(i + 1) % hole.length]!)) return null;
  }
  const first = [c1.point, ...ring.slice(c1.edge + 1, c2.edge + 1), c2.point];
  const second = [c2.point, ...ring.slice(c2.edge + 1), ...ring.slice(0, c1.edge + 1), c1.point];
  if (ringArea(first) < 1e-6 || ringArea(second) < 1e-6) return null;
  const pieces: [RoomPolygon, RoomPolygon] = [
    { outer: first, holes: [] },
    { outer: second, holes: [] },
  ];
  for (const hole of polygon.holes) {
    const probe = hole[0]!;
    const home = pointInRing(probe.x, probe.y, flat(first)) ? pieces[0] : pieces[1];
    home.holes.push(hole);
  }
  return pieces;
}

export interface MergeOptions {
  pxMm?: number; // raster cell size, default 50 mm
  bridgeMm?: number; // walls up to this thickness between the two rooms are bridged, default 500 mm
  minHoleM2?: number; // smaller holes are dropped, default 0.25 m2
}

// Even-odd scanline fill of a polygon (outer ring and holes) into a mask, pixel centres.
function fillPolygon(mask: Uint8Array, w: number, h: number, polygon: RoomPolygon, x0: number, y0: number, cell: number): void {
  const rings = ringsOf(polygon);
  for (let y = 0; y < h; y++) {
    const yc = y0 + (y + 0.5) * cell;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        if ((p.y <= yc) === (q.y <= yc)) continue;
        xs.push(p.x + ((yc - p.y) / (q.y - p.y)) * (q.x - p.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k]! - x0) / cell - 0.5));
      const to = Math.min(w - 1, Math.floor((xs[k + 1]! - x0) / cell - 0.5));
      for (let x = from; x <= to; x++) mask[y * w + x] = 1;
    }
  }
}

// Chessboard dilation by k pixels, separable; `value` 1 dilates the set, 0 erodes it (dilates the background).
function grow(mask: Uint8Array, w: number, h: number, k: number, value: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = false;
      for (let d = -k; d <= k && !hit; d++) {
        const xx = x + d;
        // Outside the raster counts as background.
        const v = xx < 0 || xx >= w ? 0 : mask[y * w + xx]!;
        if (v === value) hit = true;
      }
      tmp[y * w + x] = hit ? value : 1 - value;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = false;
      for (let d = -k; d <= k && !hit; d++) {
        const yy = y + d;
        const v = yy < 0 || yy >= h ? 0 : tmp[yy * w + x]!;
        if (v === value) hit = true;
      }
      out[y * w + x] = hit ? value : 1 - value;
    }
  }
  return out;
}

/**
 * Merges two rooms into one polygon by raster closing: both rooms are drawn into a raster, the
 * wall between them is bridged, and the boundary is traced again. The result follows the raster
 * (default 50 mm) and includes the wall between the rooms. Returns null when the two rooms are
 * not within the bridge distance of each other.
 */
export function mergePolygons(a: RoomPolygon, b: RoomPolygon, mmPerPt: number, options: MergeOptions = {}): RoomPolygon | null {
  const bridgeMm = options.bridgeMm ?? 500;
  let pxMm = options.pxMm ?? 50;
  const all = [...a.outer, ...b.outer];
  const bx0 = Math.min(...all.map((p) => p.x));
  const by0 = Math.min(...all.map((p) => p.y));
  const bx1 = Math.max(...all.map((p) => p.x));
  const by1 = Math.max(...all.map((p) => p.y));
  const maxSide = 3000;
  const spanMm = Math.max(bx1 - bx0, by1 - by0) * mmPerPt;
  pxMm = Math.max(pxMm, (spanMm + 2 * bridgeMm) / maxSide);
  const cell = pxMm / mmPerPt; // pt per pixel
  const k = Math.max(1, Math.ceil(bridgeMm / 2 / pxMm));
  const pad = k + 2;
  const x0 = bx0 - pad * cell;
  const y0 = by0 - pad * cell;
  const w = Math.ceil((bx1 - bx0) / cell) + 2 * pad;
  const h = Math.ceil((by1 - by0) / cell) + 2 * pad;
  const mask = new Uint8Array(w * h);
  fillPolygon(mask, w, h, a, x0, y0, cell);
  fillPolygon(mask, w, h, b, x0, y0, cell);
  const closed = grow(grow(mask, w, h, k, 1), w, h, k, 0);
  const rings = traceMaskBoundaries(closed, w, h);
  const toPt = (ring: readonly number[]): Vec2[] => {
    const s = simplifyRing(ring, 1);
    const pts: Vec2[] = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push({ x: x0 + s[i]! * cell, y: y0 + s[i + 1]! * cell });
    return pts;
  };
  const outers = rings.filter((r) => signedRingArea(r) > 0).sort((p, q) => signedRingArea(q) - signedRingArea(p));
  if (outers.length === 0) return null;
  // Two separate outer rings of noticeable size: the rooms do not touch, nothing was merged.
  if (outers.length > 1 && signedRingArea(outers[1]!) > 0.05 * signedRingArea(outers[0]!)) return null;
  const outer = toPt(outers[0]!);
  const minHolePt2 = ((options.minHoleM2 ?? 0.25) * 1e6) / (mmPerPt * mmPerPt);
  const holes = rings
    .filter((r) => signedRingArea(r) < 0)
    .map(toPt)
    .filter((h2) => ringArea(h2) >= minHolePt2 && pointInRing(h2[0]!.x, h2[0]!.y, flat(outer)));
  if (outer.length < 3) return null;
  return { outer, holes };
}

export interface SplitTarget {
  anchor: Vec2; // a point of the room, page points (the label position)
  targetM2: number | null; // the wanted area, null when unknown
}

/**
 * Divides one region among several labels: each label grows from its anchor, one pixel at a time,
 * and the label that is furthest below its wanted area grows next. The pieces have about the wanted
 * areas; the borders between them are not wall lines, so the user must check them. Labels without a
 * wanted area share what the others leave. Returns null when a piece would be empty.
 */
export function splitByTargets(polygon: RoomPolygon, targets: readonly SplitTarget[], mmPerPt: number, pxMm = 50): RoomPolygon[] | null {
  const k = targets.length;
  if (k < 2) return null;
  const xs = polygon.outer.map((p) => p.x);
  const ys = polygon.outer.map((p) => p.y);
  const bx0 = Math.min(...xs);
  const by0 = Math.min(...ys);
  const spanMm = Math.max(Math.max(...xs) - bx0, Math.max(...ys) - by0) * mmPerPt;
  const px = Math.max(pxMm, spanMm / 3000);
  const cell = px / mmPerPt;
  const pad = 2;
  const x0 = bx0 - pad * cell;
  const y0 = by0 - pad * cell;
  const w = Math.ceil((Math.max(...xs) - bx0) / cell) + 2 * pad;
  const h = Math.ceil((Math.max(...ys) - by0) / cell) + 2 * pad;
  const mask = new Uint8Array(w * h);
  fillPolygon(mask, w, h, polygon, x0, y0, cell);
  let total = 0;
  for (let i = 0; i < mask.length; i++) total += mask[i]!;
  const pxM2 = (px * px) / 1e6;
  const known = targets.reduce((s, t) => s + (t.targetM2 ?? 0), 0);
  const unknown = targets.filter((t) => t.targetM2 === null).length;
  const rest = Math.max(total * pxM2 - known, 0.1 * total * pxM2);
  const goal = targets.map((t) => Math.max(1, (t.targetM2 ?? rest / unknown) / pxM2));

  const owner = new Int16Array(w * h).fill(-1);
  const queues: number[][] = targets.map(() => []);
  const heads = new Array<number>(k).fill(0);
  const counts = new Array<number>(k).fill(0);
  const claim = (i: number, pixel: number): void => {
    owner[pixel] = i;
    counts[i]!++;
    const x = pixel % w;
    const y = (pixel / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (mask[n] && owner[n] === -1) queues[i]!.push(n);
    }
  };
  // Seeds: the mask pixel nearest to each anchor that no other label has taken.
  targets.forEach((t, i) => {
    const sx = Math.round((t.anchor.x - x0) / cell - 0.5);
    const sy = Math.round((t.anchor.y - y0) / cell - 0.5);
    for (let r = 0; r < Math.max(w, h); r++) {
      let hit = -1;
      for (let dy = -r; dy <= r && hit < 0; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = sx + dx;
          const y = sy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const p = y * w + x;
          if (mask[p] && owner[p] === -1) {
            hit = p;
            break;
          }
        }
      }
      if (hit >= 0) {
        claim(i, hit);
        return;
      }
    }
  });
  if (counts.some((c) => c === 0)) return null;
  for (;;) {
    let pick = -1;
    let ratio = Infinity;
    for (let i = 0; i < k; i++) {
      while (heads[i]! < queues[i]!.length && owner[queues[i]![heads[i]!]!] !== -1) heads[i]!++;
      if (heads[i]! >= queues[i]!.length) continue;
      const r = counts[i]! / goal[i]!;
      if (r < ratio) {
        ratio = r;
        pick = i;
      }
    }
    if (pick < 0) break;
    claim(pick, queues[pick]![heads[pick]!++]!);
  }
  const pieces: RoomPolygon[] = [];
  for (let i = 0; i < k; i++) {
    const m = new Uint8Array(w * h);
    for (let p = 0; p < m.length; p++) if (owner[p] === i) m[p] = 1;
    const outers = traceMaskBoundaries(m, w, h)
      .filter((r) => signedRingArea(r) > 0)
      .sort((a, b) => signedRingArea(b) - signedRingArea(a));
    if (outers.length === 0) return null;
    const s = simplifyRing(outers[0]!, 1);
    const pts: Vec2[] = [];
    for (let j = 0; j + 1 < s.length; j += 2) pts.push({ x: x0 + s[j]! * cell, y: y0 + s[j + 1]! * cell });
    if (pts.length < 3) return null;
    pieces.push({ outer: pts, holes: [] });
  }
  return pieces;
}
