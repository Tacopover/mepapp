// Raster helpers shared by the wall filter and the room fill.
// Grid units: 1 px = pxMm millimetres. Pixel i covers page coordinates
// [i - 0.5, i + 0.5] / s + origin, because lines are drawn at rounded pixel positions.

import { KIND_MASK, SEGMENT_STRIDE } from './types.js';

export interface LineRaster {
  w: number;
  h: number;
  mask: Uint8Array; // 1 = pixel of a kept line
  s: number; // pixels per page point
  x0: number; // page x of pixel column 0
  y0: number;
}

// Bresenham line into a 0/1 mask. Coordinates are rounded to pixels.
export function drawLine(mask: Uint8Array, w: number, h: number, ax: number, ay: number, bx: number, by: number): void {
  let x0 = Math.round(ax);
  let y0 = Math.round(ay);
  const x1 = Math.round(bx);
  const y1 = Math.round(by);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  for (;;) {
    if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) mask[y0 * w + x0] = 1;
    if ((x0 === x1 && y0 === y1) || ++guard > 20000) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Draws every kept segment inside the roi [x0, y0, x1, y1] (page points), 1 px wide.
export function rasterizeKept(
  segs: Float64Array,
  count: number,
  keep: Uint8Array,
  roi: readonly [number, number, number, number],
  pxMm: number,
  mmPerPt: number,
): LineRaster {
  const [x0, y0, x1, y1] = roi;
  const s = mmPerPt / pxMm;
  const w = Math.max(1, Math.ceil((x1 - x0) * s));
  const h = Math.max(1, Math.ceil((y1 - y0) * s));
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    const o = i * SEGMENT_STRIDE;
    const a = (segs[o]! - x0) * s;
    const b = (segs[o + 1]! - y0) * s;
    const c = (segs[o + 2]! - x0) * s;
    const d = (segs[o + 3]! - y0) * s;
    if (Math.max(a, c) < 0 || Math.min(a, c) > w || Math.max(b, d) < 0 || Math.min(b, d) > h) continue;
    drawLine(mask, w, h, a, b, c, d);
  }
  return { w, h, mask, s, x0, y0 };
}

// Exact Euclidean distance (px) from every pixel to the nearest mask pixel
// (Felzenszwalb and Huttenlocher, two 1-D passes).
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const m = Math.max(w, h);
  const f = new Float32Array(m);
  const v = new Int32Array(m);
  const z = new Float32Array(m + 1);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  const pass = (len: number, base: number, stride: number): void => {
    for (let q = 0; q < len; q++) f[q] = g[base + q * stride]!;
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let sx: number;
      for (;;) {
        sx = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
        if (sx <= z[k]! && k > 0) k--;
        else break;
      }
      if (sx <= z[k]!) {
        v[k] = q;
        z[k + 1] = INF;
        continue;
      }
      k++;
      v[k] = q;
      z[k] = sx;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      g[base + q * stride] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
    }
  };
  for (let x = 0; x < w; x++) pass(h, x, w);
  for (let y = 0; y < h; y++) pass(w, y * w, 1);
  for (let i = 0; i < w * h; i++) g[i] = Math.sqrt(g[i]!);
  return g;
}

export interface Component {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  count: number;
}

// 8-connected component labels of a 0/1 mask. label is -1 for background.
export function labelComponents(mask: Uint8Array, w: number, h: number): { label: Int32Array; comps: Component[] } {
  const label = new Int32Array(w * h).fill(-1);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]! >= 0) continue;
    const id = comps.length;
    const c: Component = { minx: w, miny: h, maxx: 0, maxy: 0, count: 0 };
    comps.push(c);
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    while (sp) {
      const p = stack[--sp]!;
      const x = p % w;
      const y = (p / w) | 0;
      c.count++;
      if (x < c.minx) c.minx = x;
      if (x > c.maxx) c.maxx = x;
      if (y < c.miny) c.miny = y;
      if (y > c.maxy) c.maxy = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && label[q]! < 0) {
            label[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
  }
  return { label, comps };
}

// Bounding box of all segment end points, as a fallback page rectangle.
export function segmentBounds(segs: Float64Array, count: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * SEGMENT_STRIDE;
    for (let k = 0; k < 4; k += 2) {
      const x = segs[o + k]!;
      const y = segs[o + k + 1]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return count ? [x0, y0, x1, y1] : [0, 0, 1, 1];
}

export const isLineKind = (kind: number): boolean => (kind & KIND_MASK) <= 1;
