// Click-to-fill: finds the room around a seed point in the kept wall lines.
// Port of the round 3/4 prototype, see .claude/plans/room-detection-algorithm.md
// section B, plus polygon output (contour tracing, simplification, exact area).

import type { Vec2 } from '../geometry.js';
import { distanceTransform, rasterizeKept, segmentBounds } from './raster.js';
import { pointInRing, signedRingArea, simplifyRing, traceMaskBoundaries, type Ring } from './polygon.js';
import { DEFAULT_ROOM_DETECTION_PARAMS, type FilteredWalls, type RoomDetectionParams, type RoomFillResult, type RoomPolygon } from './types.js';

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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

const emptyResult = (seedPt: Vec2, touches: boolean): RoomFillResult => ({
  polygon: { outer: [], holes: [] },
  areaM2: 0,
  pixelAreaM2: 0,
  seedPt,
  flags: { touchesRoiBorder: touches, open: false, fillEmpty: true },
});

/**
 * Finds the room that contains `seedPt` (page points). `walls` is the input
 * segments plus the keep flags from filterWallSegments. The result polygon is
 * in page points. Open rooms (no closed wall) are flagged, not fixed.
 */
export function fillRoomAt(walls: FilteredWalls, seedPt: Vec2, mmPerPt: number, params: Partial<RoomDetectionParams> = {}): RoomFillResult {
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
  const R = rasterizeKept(segs, count, walls.keep, roi, F.pxMm, mm);
  const { w, h, mask } = R;
  const r = F.gapMm / 2 / F.pxMm;
  const d = distanceTransform(mask, w, h);
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

  // 4. Grow back: r steps of dilation (4-, then 8-neighbour), only into non-wall pixels.
  const G = Uint8Array.from(Fm);
  let frontier: number[] = [];
  let minx = w;
  let maxx = 0;
  let miny = h;
  let maxy = 0;
  for (let i = 0; i < qt; i++) {
    const p = q[i]!;
    frontier.push(p);
    const x = p % w;
    const y = (p / w) | 0;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  for (let s = 0, steps = Math.round(r); s < steps; s++) {
    const next: number[] = [];
    const eight = s % 2 === 1;
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
    for (let i = 0; i < w * h; i++) if (!O[i]) G[i] = 1;
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
  const simple = rings.map((rg) => toPt(simplifyRing(rg, F.simplifyTolPx)));
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
    },
  };
}
