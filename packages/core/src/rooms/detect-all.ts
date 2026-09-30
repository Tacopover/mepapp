// Detect all rooms on a page: one page raster and distance transform, then every
// free-space component wider than the gap is one room. Each component gets the
// same finishing steps as click-to-fill (finishRoom), on a crop around it.
// Decision and measurements: .claude/plans/room-detection.md, Phase 4.

import type { Vec2 } from '../geometry.js';
import { distanceTransform, rasterizeKept, segmentBounds, type LineRaster } from './raster.js';
import { finishRoom } from './fill.js';
import { DEFAULT_ROOM_DETECTION_PARAMS, type DetectAllOptions, type DetectAllResult, type FilteredWalls, type LeakRegion, type RoomDetectionParams, type RoomFillResult } from './types.js';

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Finds every closed room on the page. `walls` is the input segments plus the
 * keep flags from filterWallSegments. Free-space components that touch the page
 * raster edge (the outside, and rooms that leak into it) are returned as
 * `leaks`, not as rooms. Rooms with an area below `minRoomM2` (default 1.5) are
 * dropped: slivers and gaps between walls.
 */
export function detectAllRooms(walls: FilteredWalls, mmPerPt: number, params: Partial<RoomDetectionParams> = {}, options: DetectAllOptions = {}): DetectAllResult {
  const F: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  const { segments: segs, segmentCount: count } = walls.walls;
  const b = walls.walls.bounds ?? segmentBounds(segs, count);
  const result: DetectAllResult = { rooms: [], leaks: [], pxMm: F.pxMm, componentsDropped: 0, cancelled: false };
  const widthPt = b[2] - b[0];
  const heightPt = b[3] - b[1];
  if (!(widthPt > 0 && heightPt > 0)) return result;

  // A page above maxPixels gets a coarser raster (the gap radius stays in mm).
  const maxPixels = options.maxPixels ?? 60e6;
  let pxMm = F.pxMm;
  const pixels = (widthPt * mmPerPt * heightPt * mmPerPt) / (pxMm * pxMm);
  if (pixels > maxPixels) pxMm *= Math.sqrt(pixels / maxPixels);
  result.pxMm = pxMm;
  const FF: RoomDetectionParams = { ...F, pxMm };
  const report = options.onProgress ?? ((): void => undefined);
  const cancelled = options.shouldCancel ?? ((): boolean => false);

  report(0, 'raster');
  const P = rasterizeKept(segs, count, walls.keep, b, pxMm, mmPerPt);
  const { w, h, mask } = P;
  report(0.1, 'distance');
  const d = distanceTransform(mask, w, h);
  const r = FF.gapMm / 2 / pxMm;
  const minCore = 0.1 * 1e6 / (pxMm * pxMm);
  const pxToPt = (x: number, y: number): Vec2 => ({ x: P.x0 + x / P.s, y: P.y0 + y / P.s });
  const growSteps = Math.round(FF.wallGrowMm / pxMm);
  const pad = Math.round(r) + growSteps + 4;

  // Flood the free-space cores (4-neighbour, d > r) and finish each closed one.
  report(0.3, 'rooms');
  const visited = new Uint8Array(w * h);
  const total = w * h;
  for (let i = 0; i < total; i++) {
    if (visited[i] || d[i]! <= r) continue;
    if (cancelled()) {
      result.cancelled = true;
      return result;
    }
    report(0.3 + 0.7 * (i / total), 'rooms');
    const comp: number[] = [i];
    visited[i] = 1;
    let touches = false;
    let minx = w;
    let maxx = 0;
    let miny = h;
    let maxy = 0;
    let best = i;
    for (let qi = 0; qi < comp.length; qi++) {
      const p = comp[qi]!;
      const x = p % w;
      const y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      if (d[p]! > d[best]! + 0.5) best = p;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!visited[k] && d[k]! > r) {
          visited[k] = 1;
          comp.push(k);
        }
      }
    }
    const coreM2 = (comp.length * pxMm * pxMm) / 1e6;
    if (touches) {
      const a = pxToPt(minx, miny);
      const c = pxToPt(maxx + 1, maxy + 1);
      const leak: LeakRegion = { kind: 'border', bounds: [a.x, a.y, c.x, c.y], coreAreaM2: coreM2, seedPt: pxToPt(best % w, (best / w) | 0) };
      result.leaks.push(leak);
      continue;
    }
    if (comp.length < minCore) {
      result.componentsDropped++;
      continue;
    }
    // Crop: the fill grows at most `pad` pixels beyond the core box.
    const cx0 = Math.max(0, minx - pad);
    const cy0 = Math.max(0, miny - pad);
    const cx1 = Math.min(w - 1, maxx + pad);
    const cy1 = Math.min(h - 1, maxy + pad);
    const cw = cx1 - cx0 + 1;
    const ch = cy1 - cy0 + 1;
    const cmask = new Uint8Array(cw * ch);
    const cd = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const src = (cy0 + y) * w + cx0;
      cmask.set(mask.subarray(src, src + cw), y * cw);
      cd.set(d.subarray(src, src + cw), y * cw);
    }
    const q = new Int32Array(comp.length);
    const Fm = new Uint8Array(cw * ch);
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k]!;
      const k2 = (((p / w) | 0) - cy0) * cw + ((p % w) - cx0);
      q[k] = k2;
      Fm[k2] = 1;
    }
    const R: LineRaster = { w: cw, h: ch, mask: cmask, s: P.s, x0: P.x0 + cx0 / P.s, y0: P.y0 + cy0 / P.s };
    const room: RoomFillResult = finishRoom({ mask: cmask, d: cd, w: cw, h: ch, R, r, Fm, q, qt: q.length, touches: false, seedOut: pxToPt(best % w, (best / w) | 0), detectEnclosing: true }, walls, mmPerPt, FF);
    if (room.flags.enclosing) {
      const bx = room.polygon.outer.reduce((m, p) => [Math.min(m[0], p.x), Math.min(m[1], p.y), Math.max(m[2], p.x), Math.max(m[3], p.y)], [Infinity, Infinity, -Infinity, -Infinity]);
      result.leaks.push({ kind: 'enclosing', bounds: [bx[0]!, bx[1]!, bx[2]!, bx[3]!], coreAreaM2: coreM2, seedPt: room.seedPt });
    } else if (!room.flags.fillEmpty && room.polygon.outer.length >= 3 && room.areaM2 >= (options.minRoomM2 ?? 1.5)) result.rooms.push(room);
    else result.componentsDropped++;
  }
  report(1, 'done');
  return result;
}
