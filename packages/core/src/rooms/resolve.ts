// Label-guided room fill. A room label (name plus, often, the printed area) tells which region
// is the room and how large it must be. When the plain fill at the label gives an area that differs
// from the printed one, two repairs are tried:
//   - too small: the fill stopped at furniture. Free-standing wall components (tables, cabinets)
//     next to the outline are dissolved, then the fill is repeated.
//   - too large: the fill leaked through a wide opening. The door gap width is raised step by step.
// Plan: .claude/plans/room-detection.md, section 8d.

import type { Vec2 } from '../geometry.js';
import { fillRoomAt } from './fill.js';
import { DEFAULT_ROOM_DETECTION_PARAMS, SEGMENT_STRIDE, type FilteredWalls, type RoomDetectionParams, type RoomFillResult } from './types.js';

export type ResolveMethod = 'direct' | 'dissolved' | 'gap' | 'bounded';

export interface ResolveOptions {
  tolerance?: number; // accept a fill whose area is within this fraction of the printed area, default 0.15
  gapsMm?: readonly number[]; // door gap widths to try when the fill is too large, default [1500, 2000, 3000]
  maxFurnitureMm?: number; // a wall component is furniture when its bounding box is at most this large, default 6000
  maxDissolveRounds?: number; // default 3
}

export interface ResolveResult {
  fill: RoomFillResult;
  method: ResolveMethod;
  deviation: number | null; // fill area / printed area - 1, null without a printed area
  gapMm: number; // door gap width of the accepted fill
  dissolvedComponents: number;
}

interface WallComponents {
  comp: Int32Array; // component id per segment, -1 for a segment that is not kept
  count: number;
  bounds: Float64Array; // x0, y0, x1, y1 per component
}

const componentCache = new WeakMap<Uint8Array, WallComponents>();

/** Groups the kept segments into connected components: segments whose end points lie within `tolPt` of each other. Cached per keep array. */
export function wallComponents(walls: FilteredWalls, tolPt: number): WallComponents {
  const cached = componentCache.get(walls.keep);
  if (cached) return cached;
  const segs = walls.walls.segments;
  const n = walls.walls.segmentCount;
  const comp = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const cell = Math.max(tolPt * 2, 1e-6);
  const grid = new Map<number, number[]>();
  const key = (ix: number, iy: number): number => ix * 73856093 + iy * 19349663;
  const visit = (seg: number, x: number, y: number): void => {
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = grid.get(key(ix + dx, iy + dy));
        if (!list) continue;
        for (const other of list) {
          const o = other * SEGMENT_STRIDE;
          for (const [px, py] of [
            [segs[o]!, segs[o + 1]!],
            [segs[o + 2]!, segs[o + 3]!],
          ] as const) {
            if (Math.abs(px - x) <= tolPt && Math.abs(py - y) <= tolPt) {
              parent[find(seg)] = find(other);
              break;
            }
          }
        }
      }
    }
    const k = key(ix, iy);
    const list = grid.get(k);
    if (list) list.push(seg);
    else grid.set(k, [seg]);
  };
  for (let i = 0; i < n; i++) {
    if (!walls.keep[i]) continue;
    const o = i * SEGMENT_STRIDE;
    visit(i, segs[o]!, segs[o + 1]!);
    visit(i, segs[o + 2]!, segs[o + 3]!);
  }
  const ids = new Map<number, number>();
  const boxes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!walls.keep[i]) continue;
    const root = find(i);
    let id = ids.get(root);
    if (id === undefined) {
      id = ids.size;
      ids.set(root, id);
      boxes.push(Infinity, Infinity, -Infinity, -Infinity);
    }
    comp[i] = id;
    const o = i * SEGMENT_STRIDE;
    const b = id * 4;
    boxes[b] = Math.min(boxes[b]!, segs[o]!, segs[o + 2]!);
    boxes[b + 1] = Math.min(boxes[b + 1]!, segs[o + 1]!, segs[o + 3]!);
    boxes[b + 2] = Math.max(boxes[b + 2]!, segs[o]!, segs[o + 2]!);
    boxes[b + 3] = Math.max(boxes[b + 3]!, segs[o + 1]!, segs[o + 3]!);
  }
  const result: WallComponents = { comp, count: ids.size, bounds: Float64Array.from(boxes) };
  componentCache.set(walls.keep, result);
  return result;
}

function distToRing(px: number, py: number, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)));
  }
  return best;
}

/** Ids of the small components (furniture) that touch the outline of the fill, or the holes of it. */
function furnitureNextTo(fill: RoomFillResult, walls: FilteredWalls, comps: WallComponents, maxExtentPt: number, nearPt: number): Set<number> {
  const segs = walls.walls.segments;
  const found = new Set<number>();
  const rings = [fill.polygon.outer, ...fill.polygon.holes];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of fill.polygon.outer) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const small: boolean[] = [];
  for (let c = 0; c < comps.count; c++) {
    const b = c * 4;
    small.push(comps.bounds[b + 2]! - comps.bounds[b]! <= maxExtentPt && comps.bounds[b + 3]! - comps.bounds[b + 1]! <= maxExtentPt);
  }
  for (let i = 0; i < walls.walls.segmentCount; i++) {
    const c = comps.comp[i]!;
    if (c < 0 || !small[c] || found.has(c)) continue;
    const o = i * SEGMENT_STRIDE;
    const ax = segs[o]!;
    const ay = segs[o + 1]!;
    const bx = segs[o + 2]!;
    const by = segs[o + 3]!;
    if (Math.max(ax, bx) < x0 - nearPt || Math.min(ax, bx) > x1 + nearPt || Math.max(ay, by) < y0 - nearPt || Math.min(ay, by) > y1 + nearPt) continue;
    for (const [px, py] of [
      [ax, ay],
      [bx, by],
      [(ax + bx) / 2, (ay + by) / 2],
    ] as const) {
      if (rings.some((ring) => distToRing(px, py, ring) <= nearPt)) {
        found.add(c);
        break;
      }
    }
  }
  return found;
}

const deviationOf = (fill: RoomFillResult, printed: number | null): number | null => (printed !== null && printed > 0 ? fill.areaM2 / printed - 1 : null);

/**
 * Fills the room of a label. `printedM2` is the area printed in the drawing, or null. Without a
 * printed area the plain fill is returned. With one, the plain fill is repaired when its area
 * differs by more than the tolerance; the fill closest to the printed area is returned.
 */
export function resolveRoomAt(
  walls: FilteredWalls,
  anchor: Vec2,
  printedM2: number | null,
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
  options: ResolveOptions = {},
): ResolveResult {
  const base: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  // The printed area limits the raster: a room fits in a window a few times its own size. A fill that leaks reaches the window edge and is flagged.
  const P: RoomDetectionParams = printedM2 !== null && printedM2 > 0 ? { ...base, roiMm: Math.min(base.roiMm, 4000 + 3500 * Math.sqrt(printedM2)) } : base;
  const tol = options.tolerance ?? 0.15;
  const direct = fillRoomAt(walls, anchor, mmPerPt, P);
  let best: ResolveResult = { fill: direct, method: 'direct', deviation: deviationOf(direct, printedM2), gapMm: P.gapMm, dissolvedComponents: 0 };
  // Printed areas of small rooms often include the wall: allow 2 m2 next to the relative tolerance.
  const ok = (r: ResolveResult): boolean => r.deviation !== null && !r.fill.flags.fillEmpty && (Math.abs(r.deviation) <= tol || Math.abs(r.fill.areaM2 - printedM2!) <= 2);
  const consider = (r: ResolveResult): boolean => {
    if (r.fill.flags.fillEmpty || r.deviation === null) return false;
    if (best.fill.flags.fillEmpty || best.deviation === null || Math.abs(r.deviation) < Math.abs(best.deviation)) best = r;
    return ok(r);
  };
  if (printedM2 === null || printedM2 <= 0 || ok(best)) return best;

  const tooSmall = best.deviation !== null && best.deviation < 0;
  if (tooSmall || best.fill.flags.fillEmpty) {
    const comps = wallComponents(walls, (P.pxMm * 1.5) / mmPerPt);
    const dissolved = new Set<number>();
    const keep = new Uint8Array(walls.keep);
    let current = direct;
    for (let round = 0; round < (options.maxDissolveRounds ?? 3); round++) {
      if (current.flags.fillEmpty) break;
      const next = furnitureNextTo(current, walls, comps, (options.maxFurnitureMm ?? 6000) / mmPerPt, (P.pxMm * 3) / mmPerPt);
      let added = 0;
      for (const c of next) {
        if (dissolved.has(c)) continue;
        dissolved.add(c);
        added++;
      }
      if (added === 0) break;
      for (let i = 0; i < walls.walls.segmentCount; i++) if (dissolved.has(comps.comp[i]!)) keep[i] = 0;
      const refill = fillRoomAt({ walls: walls.walls, keep }, anchor, mmPerPt, P);
      current = refill;
      if (consider({ fill: refill, method: 'dissolved', deviation: deviationOf(refill, printedM2), gapMm: P.gapMm, dissolvedComponents: dissolved.size })) return best;
      if (refill.areaM2 > printedM2 * (1 + tol)) break;
    }
    return best;
  }

  for (const gapMm of options.gapsMm ?? [1500, 2000, 3000]) {
    if (gapMm <= P.gapMm) continue;
    const wider = fillRoomAt(walls, anchor, mmPerPt, { ...P, gapMm });
    if (consider({ fill: wider, method: 'gap', deviation: deviationOf(wider, printedM2), gapMm, dissolvedComponents: 0 })) return best;
  }
  // Still too large: flood the widest free space first and stop at the printed area.
  const bounded = fillRoomAt(walls, anchor, mmPerPt, P, printedM2);
  consider({ fill: bounded, method: 'bounded', deviation: deviationOf(bounded, printedM2), gapMm: P.gapMm, dissolvedComponents: 0 });
  return best;
}
