import { describe, expect, it } from 'vitest';
import { polygonAreaPt2 } from './rooms/room.js';
import type { RoomPolygon } from './rooms/types.js';
import { rasterizePolygon, thinMask, type RasterMask } from './route-skeleton.js';

const rect = (x0: number, y0: number, x1: number, y1: number): RoomPolygon => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});

const L: RoomPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 100 },
    { x: 0, y: 100 },
  ],
  holes: [],
};

const ring: RoomPolygon = { outer: rect(0, 0, 100, 100).outer, holes: [rect(30, 30, 70, 70).outer] };

function setCount(r: RasterMask): number {
  let n = 0;
  for (let i = 0; i < r.mask.length; i++) n += r.mask[i]!;
  return n;
}

// Number of 8-connected components of the set pixels.
function componentCount(r: RasterMask): number {
  const seen = new Uint8Array(r.mask.length);
  let comps = 0;
  for (let start = 0; start < r.mask.length; start++) {
    if (!r.mask[start] || seen[start]) continue;
    comps++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % r.w;
      const y = (p - x) / r.w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
          const q = ny * r.w + nx;
          if (r.mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
  }
  return comps;
}

// Smallest number of set 8-neighbors over all set pixels.
function minSetNeighbors(r: RasterMask): number {
  let min = Infinity;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!r.mask[y * r.w + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
          n += r.mask[ny * r.w + nx]!;
        }
      }
      if (n < min) min = n;
    }
  }
  return min;
}

// Set pixels with exactly one set 8-neighbor.
function endCount(r: RasterMask): number {
  let ends = 0;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!r.mask[y * r.w + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
          n += r.mask[ny * r.w + nx]!;
        }
      }
      if (n === 1) ends++;
    }
  }
  return ends;
}

describe('rasterizePolygon', () => {
  it('gives an area within 3 % of the polygon area for a rectangle, an L and a ring', () => {
    for (const poly of [rect(0, 0, 100, 20), L, ring]) {
      const r = rasterizePolygon(poly, 1);
      const area = setCount(r) * 1 * 1;
      const want = polygonAreaPt2(poly);
      expect(Math.abs(area - want) / want).toBeLessThan(0.03);
    }
  });

  it('leaves every border pixel empty', () => {
    for (const poly of [rect(0, 0, 100, 20), L, ring]) {
      const r = rasterizePolygon(poly, 1);
      for (let x = 0; x < r.w; x++) {
        expect(r.mask[x]).toBe(0);
        expect(r.mask[(r.h - 1) * r.w + x]).toBe(0);
      }
      for (let y = 0; y < r.h; y++) {
        expect(r.mask[y * r.w]).toBe(0);
        expect(r.mask[y * r.w + r.w - 1]).toBe(0);
      }
    }
  });

  it('leaves the middle of the hole empty', () => {
    const r = rasterizePolygon(ring, 1);
    const px = Math.floor((50 - r.x0) / r.pixelPt);
    const py = Math.floor((50 - r.y0) / r.pixelPt);
    expect(r.mask[py * r.w + px]).toBe(0);
  });

  it('gives an empty 3 by 3 mask for a 2-point outer ring', () => {
    const r = rasterizePolygon({ outer: [{ x: 0, y: 0 }, { x: 10, y: 10 }], holes: [] }, 1);
    expect(r.w).toBe(3);
    expect(r.h).toBe(3);
    expect(setCount(r)).toBe(0);
  });

  it('gives an empty 3 by 3 mask for pixelPt 0', () => {
    const r = rasterizePolygon(rect(0, 0, 100, 20), 0);
    expect(r.w).toBe(3);
    expect(r.h).toBe(3);
    expect(setCount(r)).toBe(0);
  });

  it('keeps w * h within maxPixels and grows pixelPt', () => {
    const r = rasterizePolygon(rect(0, 0, 1000, 1000), 1, 10_000);
    expect(r.w * r.h).toBeLessThanOrEqual(10_000);
    expect(r.pixelPt).toBeGreaterThan(1);
  });
});

describe('thinMask', () => {
  it('thins a 100 by 20 rectangle to one centered chain', () => {
    const r = rasterizePolygon(rect(0, 0, 100, 20), 1);
    thinMask(r);
    expect(componentCount(r)).toBe(1);
    const mid = 10;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        if (!r.mask[y * r.w + x]) continue;
        const cy = r.y0 + (y + 0.5) * r.pixelPt;
        expect(Math.abs(cy - mid)).toBeLessThanOrEqual(1);
      }
    }
    expect(setCount(r)).toBeGreaterThanOrEqual(70);
  });

  it('thins an L to one component with 2 to 4 end pixels', () => {
    const r = rasterizePolygon(L, 1);
    thinMask(r);
    expect(componentCount(r)).toBe(1);
    expect(endCount(r)).toBe(2);
  });

  it('thins a ring with a hole to one component with no end pixel', () => {
    const r = rasterizePolygon(ring, 1);
    thinMask(r);
    expect(componentCount(r)).toBe(1);
    expect(endCount(r)).toBe(0);
    expect(setCount(r)).toBeGreaterThan(0);
    expect(minSetNeighbors(r)).toBeGreaterThanOrEqual(2);
  });

  it('known weakness: a 2 by 2 blob can vanish', () => {
    const r = rasterizePolygon(rect(0, 0, 2, 2), 1);
    thinMask(r);
    expect(setCount(r)).toBe(0);
  });

  it('does not change w, h, x0, y0 or pixelPt', () => {
    const r = rasterizePolygon(rect(0, 0, 100, 20), 1);
    const before = { w: r.w, h: r.h, x0: r.x0, y0: r.y0, pixelPt: r.pixelPt };
    thinMask(r);
    expect({ w: r.w, h: r.h, x0: r.x0, y0: r.y0, pixelPt: r.pixelPt }).toEqual(before);
  });
});
