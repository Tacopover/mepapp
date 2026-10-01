// Click-to-fill: finds the room around a seed point in the kept wall lines.
// Port of the round 3/4 prototype, see .claude/plans/room-detection-algorithm.md
// section B, plus polygon output (contour tracing, simplification, exact area).

import type { Vec2 } from '../geometry.js';
import { distanceTransform, rasterizeKept, segmentBounds, type LineRaster } from './raster.js';
import { snapRingToWalls } from './snap.js';
import { pointInRing, signedRingArea, simplifyRing, traceMaskBoundaries, type Ring } from './polygon.js';
import { DEFAULT_ROOM_DETECTION_PARAMS, type FilteredWalls, type RoomDetectionParams, type RoomFillResult, type RoomPolygon } from './types.js';

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Neighbours of the bounded flood. The step cost is the same for a diagonal step, so equal cost forms squares along the axes (with 4 neighbours it forms diamonds).
const NB: readonly (readonly [number, number])[] = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Nearest pixel to (sx, sy) whose distance-to-wall is above r, by growing square rings. -1 when none.
function nearestWide(d: Float32Array, w: number, h: number, sx: number, sy: number, r: number): number {
  for (let rr = 0; rr < 200; rr++) {
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (d[y * w + x]! > r) return y * w + x;
      }
    }
  }
  return -1;
}

// Geodesic dilation of the pixel set `seeds` (0/1 map `set`) by `steps` steps into non-wall pixels.
// alternate: 4-neighbour and 8-neighbour steps take turns (octagon-shaped growth). Otherwise every step is 8-neighbour (square growth).
function growBack(set: Uint8Array, seeds: ArrayLike<number>, mask: Uint8Array, w: number, h: number, steps: number, alternate: boolean): Uint8Array {
  const G = set.slice();
  // Only pixels of the set that touch a pixel outside the set can add anything.
  let frontier: number[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const p = seeds[i]!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !set[p - 1] || !set[p + 1] || !set[p - w] || !set[p + w] || !set[p - w - 1] || !set[p - w + 1] || !set[p + w - 1] || !set[p + w + 1]) frontier.push(p);
  }
  for (let s = 0; s < steps; s++) {
    const next: number[] = [];
    const eight = !alternate || s % 2 === 1;
    for (const p of frontier) {
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!eight && dx && dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!G[k] && !mask[k]) {
            G[k] = 1;
            next.push(k);
          }
        }
      }
    }
    frontier = next;
  }
  return G;
}

// A pocket may touch free pixels outside S when they are this close to a wall (px): slivers between wall line pieces.
const POCKET_LEAK_PX = 3;
const POCKET_MIN_CONTACT = 2; // pixels of wall contact per axis

// A room corner touches a wall on the left or right (a vertical wall) and a wall above or below (a horizontal wall).
// A pocket beside a door jamb touches the two jamb lines only, so it is not a corner.
function touchesBothAxes(comp: readonly number[], mask: Uint8Array, w: number): boolean {
  let hc = 0;
  let vc = 0;
  for (const p of comp) {
    if (mask[p - 1] || mask[p + 1]) hc++;
    if (mask[p - w] || mask[p + w]) vc++;
  }
  return hc >= POCKET_MIN_CONTACT && vc >= POCKET_MIN_CONTACT;
}

// Corner pockets: the grow back rounds the room corners. A pocket is a 4-connected group of free pixels outside the
// fill that lies completely inside the square growth `S`. Such a group is a dead end next to the fill (a room corner),
// so it joins the fill when it also touches walls on both axes. A door opening or a neighbour room leads to free
// pixels outside S, so it stays out. Free pixels outside S that lie within POCKET_LEAK_PX of a wall do not count.
// Only the band S minus G is walked, inside the box x0..x1, y0..y1 (the box of S).
function fillCornerPockets(G: Uint8Array, S: Uint8Array, d: Float32Array, mask: Uint8Array, w: number, h: number, box: readonly [number, number, number, number]): void {
  const [x0, y0, x1, y1] = box;
  const seen = new Uint8Array(w * h);
  const comp: number[] = [];
  const stack: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!S[i] || G[i] || mask[i] || seen[i]) continue;
      comp.length = 0;
      let inside = true;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        comp.push(p);
        const px = p % w;
        const py = (p / w) | 0;
        for (const [dx, dy] of N4) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            inside = false;
            continue;
          }
          const k = ny * w + nx;
          if (G[k] || mask[k]) continue;
          if (!S[k]) {
            if (d[k]! > POCKET_LEAK_PX) inside = false;
          }
          else if (!seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      if (inside && touchesBothAxes(comp, mask, w)) for (const p of comp) G[p] = 1;
    }
  }
}

const emptyResult = (seedPt: Vec2, touches: boolean): RoomFillResult => ({
  polygon: { outer: [], holes: [] },
  areaM2: 0,
  pixelAreaM2: 0,
  seedPt,
  flags: { touchesRoiBorder: touches, open: false, fillEmpty: true },
});

interface RasterCache {
  keep: Uint8Array;
  segs: Float64Array;
  key: string;
  R: LineRaster;
  d: Float32Array;
}
let rasterCache: RasterCache | null = null;

// Repairs of one label fill the same window several times (gap widths, bounded fill): the wall raster and its distance transform are reused. fillRoomAt does not change them. The cache key holds the keep array by identity: pass a new array when the keep flags change.
function rasterAndDistance(walls: FilteredWalls, roi: readonly number[], pxMm: number, mm: number): { R: LineRaster; d: Float32Array } {
  const key = `${roi.join(',')}|${pxMm}|${mm}|${walls.walls.segmentCount}`;
  if (rasterCache && rasterCache.keep === walls.keep && rasterCache.segs === walls.walls.segments && rasterCache.key === key) return rasterCache;
  const R = rasterizeKept(walls.walls.segments, walls.walls.segmentCount, walls.keep, roi as [number, number, number, number], pxMm, mm);
  const d = distanceTransform(R.mask, R.w, R.h);
  rasterCache = { keep: walls.keep, segs: walls.walls.segments, key, R, d };
  return rasterCache;
}

/**
 * Finds the room that contains `seedPt` (page points). `walls` is the input
 * segments plus the keep flags from filterWallSegments. The result polygon is
 * in page points. Open rooms (no closed wall) are flagged, not fixed.
 */
export function fillRoomAt(walls: FilteredWalls, seedPt: Vec2, mmPerPt: number, params: Partial<RoomDetectionParams> = {}, boundM2?: number): RoomFillResult {
  const F: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  const mm = mmPerPt;
  const segs = walls.walls.segments;
  const count = walls.walls.segmentCount;
  const b = walls.walls.bounds ?? segmentBounds(segs, count);
  const rad = F.roiMm / mm;
  const roi: [number, number, number, number] = [
    Math.max(b[0], seedPt.x - rad),
    Math.max(b[1], seedPt.y - rad),
    Math.min(b[2], seedPt.x + rad),
    Math.min(b[3], seedPt.y + rad),
  ];
  if (roi[2] <= roi[0] || roi[3] <= roi[1]) return emptyResult(seedPt, false);
  const { R, d } = rasterAndDistance(walls, roi, F.pxMm, mm);
  const { w, h, mask } = R;
  const r = F.gapMm / 2 / F.pxMm;
  const sx = Math.round((seedPt.x - R.x0) * R.s);
  const sy = Math.round((seedPt.y - R.y0) * R.s);

  // 1. Anchor: nearest pixel that is not a wall line pixel.
  let anchor = -1;
  for (let rr = 0; rr < 200 && anchor < 0; rr++) {
    for (let dy = -rr; dy <= rr && anchor < 0; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (!mask[y * w + x]) {
          anchor = y * w + x;
          break;
        }
      }
    }
  }
  if (anchor < 0) return emptyResult(seedPt, false);

  // 2. Auto seed: the pixel with the largest wall distance near the click.
  let found = anchor;
  if (F.autoSeed) {
    const Rpx = F.seedRadiusMm / F.pxMm;
    const seen = new Uint8Array(w * h);
    let start = anchor;
    let cx = anchor % w;
    let cy = (anchor / w) | 0;
    let passable = (k: number): boolean => !mask[k];
    if (F.seedClosed) {
      // Start at the nearest pixel wider than the gap and walk only through such pixels: door gaps stay closed.
      const f2 = nearestWide(d, w, h, sx, sy, r);
      if (f2 >= 0) {
        start = f2;
        cx = sx;
        cy = sy;
        passable = (k) => d[k]! > r;
      }
    }
    const q: number[] = [start];
    seen[start] = 1;
    let best = start;
    for (let qi = 0; qi < q.length; qi++) {
      const p = q[qi]!;
      const x = p % w;
      const y = (p / w) | 0;
      if (d[p]! > d[best]! + 0.5) best = p;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k] || !passable(k) || Math.hypot(nx - cx, ny - cy) > Rpx) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    found = best;
  }
  if (d[found]! <= r) {
    // Narrow cell: fall back to the nearest pixel wider than the gap radius.
    const f2 = nearestWide(d, w, h, sx, sy, r);
    if (f2 < 0) return emptyResult(seedPt, false);
    found = f2;
  }
  const seedOut: Vec2 = { x: R.x0 + (found % w) / R.s, y: R.y0 + ((found / w) | 0) / R.s };

  if (boundM2 !== undefined && boundM2 > 0) {
    // Bounded fill: flood from the seed by cost (cheap far from walls) and stop at the wanted area, so a room with a wide opening is filled before the flood leaves through the opening.
    const targetPx = (boundM2 * 1e6) / (F.pxMm * F.pxMm);
    let limit = targetPx * 0.5;
    let best: RoomFillResult | null = null;
    for (let iter = 0; iter < 5; iter++) {
      const Fb = new Uint8Array(w * h);
      const qb = new Int32Array(w * h);
      let qtb = 0;
      let touchesB = false;
      // Dijkstra from the seed: a pixel far from the walls is cheap, a pixel near a wall or in a narrow opening is expensive. The flood fills the room around the seed before it crosses an opening.
      const dist = new Float32Array(w * h).fill(Infinity);
      const heap: number[] = [];
      const wide = 1300 / F.pxMm;
      const cost = (k: number): number => 1 + 6 * Math.max(0, Math.min(1, 1 - (d[k]! - r) / wide));
      const push = (k: number): void => {
        let i = heap.length;
        heap.push(k);
        while (i > 0) {
          const up = (i - 1) >> 1;
          if (dist[heap[up]!]! <= dist[k]!) break;
          heap[i] = heap[up]!;
          i = up;
        }
        heap[i] = k;
      };
      const pop = (): number => {
        const top = heap[0]!;
        const last = heap.pop()!;
        if (heap.length > 0) {
          let i = 0;
          for (;;) {
            let c = 2 * i + 1;
            if (c >= heap.length) break;
            if (c + 1 < heap.length && dist[heap[c + 1]!]! < dist[heap[c]!]!) c++;
            if (dist[heap[c]!]! >= dist[last]!) break;
            heap[i] = heap[c]!;
            i = c;
          }
          heap[i] = last;
        }
        return top;
      };
      dist[found] = 0;
      push(found);
      while (heap.length > 0 && qtb < limit) {
        const p = pop();
        if (Fb[p]) continue;
        Fb[p] = 1;
        qb[qtb++] = p;
        const x = p % w;
        const y = (p / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesB = true;
        for (const [dx, dy] of NB) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (Fb[k] || d[k]! <= r) continue;
          // A diagonal step needs both side pixels free, so the flood cannot slip through the corner of two wall pixels.
          if (dx !== 0 && dy !== 0 && (d[y * w + nx]! <= r || d[ny * w + x]! <= r)) continue;
          const nd = dist[p]! + cost(k);
          if (nd < dist[k]!) {
            dist[k] = nd;
            push(k);
          }
        }
      }
      const res = finishRoom({ mask, d, w, h, R, r, Fm: Fb, q: qb, qt: qtb, touches: touchesB, seedOut }, walls, mm, F);
      if (!best || Math.abs(res.areaM2 / boundM2 - 1) < Math.abs(best.areaM2 / boundM2 - 1)) best = res;
      if (res.areaM2 <= 0 || Math.abs(res.areaM2 / boundM2 - 1) < 0.04) break;
      limit = Math.max(50, limit * Math.pow(boundM2 / res.areaM2, 0.7));
    }
    return best!;
  }

  // 3. Flood fill (4-neighbour) over pixels wider than the gap radius.
  const Fm = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  let touches = false;
  q[qt++] = found;
  Fm[found] = 1;
  while (qh < qt) {
    const p = q[qh++]!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (!Fm[k] && d[k]! > r) {
        Fm[k] = 1;
        q[qt++] = k;
      }
    }
  }

  return finishRoom({ mask, d, w, h, R, r, Fm, q, qt, touches, seedOut }, walls, mm, F);
}

// Stages 4 to 7 of the fill: grow back, corner pockets, wall grow, hole fill, contour, snap and area.
// `Fm` is the flood fill (core) map and q[0..qt) its pixel list; both are indexed in the raster `R`.
export interface FillStage {
  mask: Uint8Array;
  d: Float32Array;
  w: number;
  h: number;
  R: LineRaster;
  r: number;
  Fm: Uint8Array;
  q: Int32Array;
  qt: number;
  touches: boolean;
  seedOut: Vec2;
  detectEnclosing?: boolean; // detect-all: do not fill holes that contain the core of another region
}

export function finishRoom(st: FillStage, walls: FilteredWalls, mm: number, F: RoomDetectionParams): RoomFillResult {
  const { mask, d, w, h, R, r, Fm, q, qt, touches, seedOut, detectEnclosing } = st;
  const segs = walls.walls.segments;
  const count = walls.walls.segmentCount;
  // 4. Grow back: r steps of dilation (4-, then 8-neighbour), only into non-wall pixels.
  const seedList = q.subarray(0, qt);
  const G = growBack(Fm, seedList, mask, w, h, Math.round(r), true);
  let minx = w;
  let maxx = 0;
  let miny = h;
  let maxy = 0;
  for (let i = 0; i < qt; i++) {
    const p = q[i]!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  if (F.squareCorners) {
    const steps = Math.round(r);
    const pad = steps + 2;
    fillCornerPockets(G, growBack(Fm, seedList, mask, w, h, steps, false), d, mask, w, h, [Math.max(0, minx - pad), Math.max(0, miny - pad), Math.min(w - 1, maxx + pad), Math.min(h - 1, maxy + pad)]);
  }

  // 5. Wall grow: steps of 4-neighbour dilation into wall pixels next to the fill.
  const growSteps = Math.round(F.wallGrowMm / F.pxMm);
  if (growSteps > 0) {
    // The fill grew by at most r pixels beyond its flood fill box, and grows by growSteps more.
    const pad = Math.round(r) + growSteps + 2;
    const x0 = Math.max(1, minx - pad);
    const x1 = Math.min(w - 2, maxx + pad);
    const y0 = Math.max(1, miny - pad);
    const y1 = Math.min(h - 2, maxy + pad);
    for (let s = 0; s < growSteps; s++) {
      const add: number[] = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * w + x;
          if (G[p] || !mask[p]) continue;
          if (G[p - 1] || G[p + 1] || G[p - w] || G[p + w]) add.push(p);
        }
      }
      for (const p of add) G[p] = 1;
    }
  }

  let enclosing = false;
  // 6. Fill holes: pixels not reachable from the raster border without crossing the fill are inside the room.
  if (F.fillHoles) {
    const O = new Uint8Array(w * h);
    const st: number[] = [];
    const push = (k: number): void => {
      if (!G[k] && !O[k]) {
        O[k] = 1;
        st.push(k);
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (st.length) {
      const p = st.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    if (detectEnclosing) {
      // Free core pixels of another region inside the holes: this region wraps other rooms (the outside of a building).
      for (let i = 0; i < w * h && !enclosing; i++) if (!O[i] && !G[i] && d[i]! > r && !Fm[i]) enclosing = true;
    }
    if (!enclosing) for (let i = 0; i < w * h; i++) if (!O[i]) G[i] = 1;
  }
  let cnt = 0;
  for (let i = 0; i < w * h; i++) cnt += G[i]!;
  const pixelAreaM2 = (cnt * F.pxMm * F.pxMm) / 1e6;

  // 7. Polygon: trace the boundaries, simplify, convert to page points.
  const rings = traceMaskBoundaries(G, w, h);
  const toPt = (ring: Ring): Ring => {
    const out: Ring = [];
    for (let i = 0; i < ring.length; i += 2) out.push(R.x0 + (ring[i]! - 0.5) / R.s, R.y0 + (ring[i + 1]! - 0.5) / R.s);
    return out;
  };
  const snapOpt = { tolPt: F.snapTolPx / R.s, angTolDeg: F.snapAngDeg };
  // Snapping puts the boundary on the drawn wall line. It does not run when wallGrowMm moves the boundary into the wall on purpose.
  const snap = F.snapToWalls && growSteps === 0;
  const simple = rings.map((rg) => {
    const ring = toPt(simplifyRing(rg, F.simplifyTolPx));
    return snap ? snapRingToWalls(ring, segs, count, walls.keep, snapOpt) : ring;
  });
  let outer: Ring = [];
  let outerArea = 0;
  for (const rg of simple) {
    const a = signedRingArea(rg);
    if (a > outerArea) {
      outerArea = a;
      outer = rg;
    }
  }
  const holes: Ring[] = [];
  let holeArea = 0;
  for (const rg of simple) {
    const a = signedRingArea(rg);
    if (a < 0 && outer.length && pointInRing(rg[0]!, rg[1]!, outer)) {
      holes.push(rg);
      holeArea += -a;
    }
  }
  const toVecs = (rg: Ring): Vec2[] => {
    const v: Vec2[] = [];
    for (let i = 0; i < rg.length; i += 2) v.push({ x: rg[i]!, y: rg[i + 1]! });
    return v;
  };
  const polygon: RoomPolygon = { outer: toVecs(outer), holes: holes.map(toVecs) };
  const areaM2 = ((outerArea - holeArea) * mm * mm) / 1e6;
  const label = F.labelAreaM2;
  return {
    polygon,
    areaM2,
    pixelAreaM2,
    seedPt: seedOut,
    flags: {
      touchesRoiBorder: touches,
      open: touches || (label !== undefined && label > 0 && pixelAreaM2 > F.openRatio * label),
      fillEmpty: cnt === 0,
      ...(enclosing ? { enclosing } : {}),
    },
  };
}
