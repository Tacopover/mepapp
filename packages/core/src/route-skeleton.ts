// Raster skeleton of a room polygon: the polygon is drawn into a 0/1 mask, then
// Zhang-Suen thinning reduces the mask to a 1 pixel wide center line. Known
// limits: a 2 by 2 blob can disappear, and a diagonal of two pixels can blur.

import type { RoomPolygon } from './rooms/types.js';
import { polygonContainsPoint } from './rooms/room.js';

/** A room drawn as a mask. Pixel (x, y) is at index y * w + x and covers the page rectangle starting at (x0 + x * pixelPt, y0 + y * pixelPt). */
export interface RasterMask {
  mask: Uint8Array;
  w: number;
  h: number;
  x0: number;
  y0: number;
  pixelPt: number;
}

/**
 * Draws the polygon into a mask. A pixel is set when its center is inside the
 * outer ring and outside every hole. The mask has one empty pixel border. When
 * the mask would hold more than maxPixels, the pixel size grows until it fits.
 */
export function rasterizePolygon(polygon: RoomPolygon, pixelPt: number, maxPixels = 4_000_000): RasterMask {
  if (polygon.outer.length < 3 || !(pixelPt > 0)) return { mask: new Uint8Array(9), w: 3, h: 3, x0: 0, y0: 0, pixelPt };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon.outer) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  let pt = pixelPt;
  let w = Math.ceil((maxX - minX) / pt) + 2;
  let h = Math.ceil((maxY - minY) / pt) + 2;
  const limit = Math.max(maxPixels, 9);
  while (w * h > limit) {
    pt *= Math.sqrt((w * h) / limit) * 1.02;
    w = Math.ceil((maxX - minX) / pt) + 2;
    h = Math.ceil((maxY - minY) / pt) + 2;
  }
  const x0 = minX - pt;
  const y0 = minY - pt;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = { x: x0 + (x + 0.5) * pt, y: y0 + (y + 0.5) * pt };
      if (polygonContainsPoint(polygon, c)) mask[y * w + x] = 1;
    }
  }
  return { mask, w, h, x0, y0, pixelPt: pt };
}

/**
 * Thins the mask in place with the Zhang-Suen algorithm. Each sub-iteration
 * collects its deletions first and then applies them. The loop stops when a
 * whole pass deletes nothing. The border pixels stay 0, so the loop covers the
 * interior only.
 */
export function thinMask(raster: RasterMask): void {
  const { mask, w, h } = raster;
  const seq = new Uint8Array(9);
  const del: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let sub = 1; sub <= 2; sub++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!mask[p]) continue;
          const p2 = mask[p - w]!;
          const p3 = mask[p - w + 1]!;
          const p4 = mask[p + 1]!;
          const p5 = mask[p + w + 1]!;
          const p6 = mask[p + w]!;
          const p7 = mask[p + w - 1]!;
          const p8 = mask[p - 1]!;
          const p9 = mask[p - w - 1]!;
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          seq[0] = p2;
          seq[1] = p3;
          seq[2] = p4;
          seq[3] = p5;
          seq[4] = p6;
          seq[5] = p7;
          seq[6] = p8;
          seq[7] = p9;
          seq[8] = p2;
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          const removable =
            sub === 1 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
          if (removable) del.push(p);
        }
      }
      for (const p of del) mask[p] = 0;
      if (del.length) changed = true;
    }
  }
}
