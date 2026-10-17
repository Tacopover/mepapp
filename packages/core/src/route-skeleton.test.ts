import { describe, expect, it } from 'vitest';
import { polygonAreaPt2 } from './rooms/room.js';
import type { RoomPolygon } from './rooms/types.js';
import {
  crossingNumber,
  halfWidthAt,
  pixelGraphOf,
  pruneGraph,
  rasterizePolygon,
  roomDistances,
  thinMask,
  type PixelGraph,
  type RasterMask,
} from './route-skeleton.js';

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

function maskFrom(pts: [number, number][]): RasterMask {
  const w = 40;
  const h = 40;
  const mask = new Uint8Array(w * h);
  for (const [x, y] of pts) mask[y * w + x] = 1;
  return { mask, w, h, x0: 0, y0: 0, pixelPt: 1 };
}

function hline(x0: number, x1: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

function vline(x: number, y0: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

function countKind(g: PixelGraph, kind: string): number {
  return g.nodes.filter((n) => n.kind === kind).length;
}

// Number of distinct pixels that the edges of the graph cover.
function coveredPixels(g: PixelGraph): number {
  return new Set(g.edges.flatMap((e) => e.pixels.map((p) => `${p.x},${p.y}`))).size;
}

describe('pixelGraphOf', () => {
  it('gives one edge of 10 pixels for a straight chain of 10 pixels', () => {
    const r = maskFrom(hline(5, 14, 10));
    const g = pixelGraphOf(r);
    expect(countKind(g, 'end')).toBe(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.pixels).toHaveLength(10);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives 4 ends, 1 junction and 4 edges for a plus', () => {
    const r = maskFrom([...hline(5, 15, 10), ...vline(10, 5, 15).filter(([, y]) => y !== 10)]);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'end')).toBe(4);
    expect(countKind(g, 'junction')).toBe(1);
    expect(g.edges).toHaveLength(4);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives 3 ends, 1 junction and 3 edges for a T', () => {
    const r = maskFrom([...hline(5, 15, 10), ...vline(10, 11, 15)]);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'end')).toBe(3);
    expect(countKind(g, 'junction')).toBe(1);
    expect(g.edges).toHaveLength(3);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives one junction node for two touching junction pixels', () => {
    const r = maskFrom([...hline(5, 16, 10), ...vline(10, 11, 15), ...vline(11, 5, 9)]);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'junction')).toBe(1);
    expect(countKind(g, 'end')).toBe(4);
    expect(g.nodes).toHaveLength(5);
    expect(g.edges).toHaveLength(4);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives one bend node and one loop edge for a hand-built square ring', () => {
    const r = maskFrom([...hline(2, 7, 2), ...hline(2, 7, 7), ...vline(2, 3, 6), ...vline(7, 3, 6)]);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'bend')).toBe(1);
    expect(countKind(g, 'end')).toBe(0);
    expect(g.edges).toHaveLength(1);
    const e = g.edges[0]!;
    expect(e.from).toBe(e.to);
    expect(e.pixels[0]).toEqual(e.pixels[e.pixels.length - 1]);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives one bend node and one loop edge for a thinned ring', () => {
    const r = rasterizePolygon(ring, 2);
    thinMask(r);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'bend')).toBe(1);
    expect(countKind(g, 'end')).toBe(0);
    expect(g.edges).toHaveLength(1);
    const e = g.edges[0]!;
    expect(e.from).toBe(e.to);
    expect(e.pixels[0]).toEqual(e.pixels[e.pixels.length - 1]);
  });

  it('gives 2 ends and 1 edge for a hand-built 45 degree staircase', () => {
    const r = maskFrom([
      [5, 5],
      [6, 5],
      [6, 6],
      [7, 6],
      [7, 7],
      [8, 7],
      [8, 8],
      [9, 8],
    ]);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'end')).toBe(2);
    expect(countKind(g, 'junction')).toBe(0);
    expect(g.edges).toHaveLength(1);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('gives 2 ends and 1 edge for a thinned parallelogram', () => {
    const r = rasterizePolygon(
      {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 120, y: 100 },
          { x: 100, y: 100 },
        ],
        holes: [],
      },
      2,
    );
    thinMask(r);
    const g = pixelGraphOf(r);
    expect(countKind(g, 'end')).toBe(2);
    expect(countKind(g, 'junction')).toBe(0);
    expect(g.edges).toHaveLength(1);
    expect(coveredPixels(g)).toBe(setCount(r));
  });

  it('measures a thinned 100 by 20 rectangle', () => {
    const r = rasterizePolygon(rect(0, 0, 100, 20), 1);
    thinMask(r);
    const g = pixelGraphOf(r);
    // no spurs for a plain rectangle
    expect(countKind(g, 'end')).toBe(2);
    expect(g.edges).toHaveLength(1);
  });

  it('gives CN 2 for a staircase pixel with 3 set neighbors and CN 1 for an end', () => {
    const r = maskFrom([
      [5, 5],
      [6, 5],
      [6, 6],
      [7, 6],
      [7, 7],
      [8, 7],
      [8, 8],
      [9, 8],
    ]);
    const b = r.mask[5 * r.w + 5]! + r.mask[6 * r.w + 6]! + r.mask[6 * r.w + 7]!;
    expect(b).toBe(3);
    expect(crossingNumber(r.mask, r.w, 6, 5)).toBe(2);
    expect(crossingNumber(r.mask, r.w, 5, 5)).toBe(1);
  });

  it('gives CN 4 for the center of a plus', () => {
    const r = maskFrom([...hline(5, 15, 10), ...vline(10, 5, 15).filter(([, y]) => y !== 10)]);
    expect(crossingNumber(r.mask, r.w, 10, 10)).toBe(4);
  });

  it('gives no node and no edge for an empty raster', () => {
    expect(pixelGraphOf(maskFrom([]))).toEqual({ nodes: [], edges: [] });
  });

  it('gives one end and no edge for a lone pixel', () => {
    const g = pixelGraphOf(maskFrom([[5, 5]]));
    expect(g.nodes).toHaveLength(1);
    expect(countKind(g, 'end')).toBe(1);
    expect(g.edges).toHaveLength(0);
  });

  it('does not change the raster', () => {
    const r = maskFrom([...hline(5, 15, 10), ...vline(10, 11, 15)]);
    const before = Array.from(r.mask);
    pixelGraphOf(r);
    expect(Array.from(r.mask)).toEqual(before);
  });
});

const T: RoomPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 20 },
    { x: 70, y: 20 },
    { x: 70, y: 100 },
    { x: 50, y: 100 },
    { x: 50, y: 20 },
    { x: 0, y: 20 },
  ],
  holes: [],
};

function skeletonOf(room: RasterMask): PixelGraph {
  const skel = { ...room, mask: room.mask.slice() };
  thinMask(skel);
  return pixelGraphOf(skel);
}

function halfWidthOf(room: RasterMask): (x: number, y: number) => number {
  const d = roomDistances(room);
  return (x, y) => halfWidthAt(d, room.w, room.h, x, y);
}

function pixelRun(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k <= n; k++) out.push({ x: x0 + Math.sign(x1 - x0) * k, y: y0 + Math.sign(y1 - y0) * k });
  return out;
}

// Junction j with a leg to e0, a leg to e1 (both along x) and a leg to e2 (down along y).
function tee(legA: number, legB: number, legC: number): PixelGraph {
  return {
    nodes: [
      { id: 'e0', x: 0, y: 0, kind: 'end' },
      { id: 'j', x: legA, y: 0, kind: 'junction' },
      { id: 'e1', x: legA + legB, y: 0, kind: 'end' },
      { id: 'e2', x: legA, y: legC, kind: 'end' },
    ],
    edges: [
      { from: 'e0', to: 'j', pixels: pixelRun(0, 0, legA, 0) },
      { from: 'j', to: 'e1', pixels: pixelRun(legA, 0, legA + legB, 0) },
      { from: 'j', to: 'e2', pixels: pixelRun(legA, 0, legA, legC) },
    ],
  };
}

describe('halfWidthAt', () => {
  it('gives about 10 pixels at the middle line of a 20 pixel corridor', () => {
    const room = rasterizePolygon(rect(0, 0, 100, 20), 1);
    const d = roomDistances(room);
    const x = Math.round((50 - room.x0) / room.pixelPt);
    const y = Math.round((10 - room.y0) / room.pixelPt);
    const v = halfWidthAt(d, room.w, room.h, x, y);
    expect(v).toBeGreaterThan(9);
    expect(v).toBeLessThan(11);
  });

  it('clamps x and y to the raster', () => {
    const room = rasterizePolygon(rect(0, 0, 100, 20), 1);
    const d = roomDistances(room);
    expect(halfWidthAt(d, room.w, room.h, -3, 1000)).toBe(d[(room.h - 1) * room.w]);
  });
});

describe('pruneGraph', () => {
  it('keeps the skeleton of a rectangle with no spurs', () => {
    const room = rasterizePolygon(rect(0, 0, 100, 20), 1);
    const g = skeletonOf(room);
    const p = pruneGraph(g, halfWidthOf(room));
    expect(p).toEqual(g);
    expect(countKind(p, 'end')).toBe(2);
    expect(p.edges).toHaveLength(1);
  });

  it('keeps the skeleton of a T with no spurs', () => {
    const room = rasterizePolygon(T, 1);
    const g = skeletonOf(room);
    const p = pruneGraph(g, halfWidthOf(room));
    expect(p).toEqual(g);
    expect(countKind(p, 'end')).toBe(3);
    expect(countKind(p, 'junction')).toBe(1);
    expect(p.edges).toHaveLength(3);
  });

  it('removes the 11 step spur of a 100 by 20 rectangle with a 3 pixel bump', () => {
    const bump: RoomPolygon = {
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: -3 },
        { x: 43, y: -3 },
        { x: 43, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 20 },
        { x: 0, y: 20 },
      ],
      holes: [],
    };
    const room = rasterizePolygon(bump, 1);
    const g = skeletonOf(room);
    expect(g.edges).toHaveLength(3);
    expect(countKind(g, 'junction')).toBe(1);
    const p = pruneGraph(g, halfWidthOf(room));
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]!.pixels).toHaveLength(80);
    expect(countKind(p, 'end')).toBe(2);
    expect(countKind(p, 'junction')).toBe(0);
  });

  it('turns a junction with a loop edge only into a bend', () => {
    const loop = pixelRun(0, 0, 4, 0).concat(pixelRun(4, 0, 4, 4), pixelRun(4, 4, 0, 4), pixelRun(0, 4, 0, 0));
    const g: PixelGraph = {
      nodes: [
        { id: 'j', x: 0, y: 0, kind: 'junction' },
        { id: 's', x: 0, y: 2, kind: 'end' },
      ],
      edges: [
        { from: 'j', to: 'j', pixels: loop },
        { from: 'j', to: 's', pixels: pixelRun(0, 0, 0, 2) },
      ],
    };
    const p = pruneGraph(g, () => 5, 1.5);
    expect(p.nodes).toEqual([{ id: 'j', x: 0, y: 0, kind: 'bend' }]);
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]!.from).toBe('j');
    expect(p.edges[0]!.to).toBe('j');
  });

  it('turns a junction that keeps one edge into an end', () => {
    const g: PixelGraph = {
      nodes: [
        { id: 'j', x: 0, y: 0, kind: 'junction' },
        { id: 's1', x: 0, y: 2, kind: 'end' },
        { id: 's2', x: 2, y: 0, kind: 'end' },
        { id: 'e0', x: 20, y: 0, kind: 'end' },
      ],
      edges: [
        { from: 'j', to: 's1', pixels: pixelRun(0, 0, 0, 2) },
        { from: 'j', to: 's2', pixels: pixelRun(0, 0, 2, 0) },
        { from: 'j', to: 'e0', pixels: pixelRun(0, 0, 20, 0) },
      ],
    };
    const p = pruneGraph(g, () => 5, 1.5);
    expect(p.nodes.find((n) => n.id === 'j')!.kind).toBe('end');
    expect(countKind(p, 'junction')).toBe(0);
    expect(p.edges).toHaveLength(1);
  });

  it('cuts a second spur in round 2 after a join of round 1', () => {
    const halfWidth = (x: number, y: number) => (x === 0 ? 2 : 100);
    const g: PixelGraph = {
      nodes: [
        { id: 'J', x: 0, y: 0, kind: 'junction' },
        { id: 's', x: 3, y: 0, kind: 'end' },
        { id: 'e0', x: 4, y: 0, kind: 'end' },
        { id: 'K', x: 50, y: 0, kind: 'junction' },
        { id: 'e5', x: 202, y: 0, kind: 'end' },
      ],
      edges: [
        { from: 'J', to: 's', pixels: pixelRun(0, 0, 3, 0) },
        { from: 'J', to: 'e0', pixels: pixelRun(0, 0, 4, 0) },
        { from: 'J', to: 'K', pixels: pixelRun(0, 0, 2, 0) },
        { from: 'K', to: 'e5', pixels: pixelRun(2, 0, 202, 0) },
      ],
    };
    const p = pruneGraph(g, halfWidth, 1.5);
    expect(p.nodes.map((n) => n.id)).toEqual(['K', 'e5']);
    expect(p.nodes.find((n) => n.id === 'K')!.kind).toBe('end');
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]!.pixels).toHaveLength(201);
  });

  it('joins a junction with its two edges stored in both directions without a repeated pixel', () => {
    const g: PixelGraph = {
      nodes: [
        { id: 'e0', x: 0, y: 0, kind: 'end' },
        { id: 'j', x: 9, y: 0, kind: 'junction' },
        { id: 'e1', x: 18, y: 0, kind: 'end' },
        { id: 'e2', x: 9, y: 3, kind: 'end' },
      ],
      edges: [
        { from: 'j', to: 'e0', pixels: pixelRun(9, 0, 0, 0) },
        { from: 'e1', to: 'j', pixels: pixelRun(18, 0, 9, 0) },
        { from: 'j', to: 'e2', pixels: pixelRun(9, 0, 9, 3) },
      ],
    };
    const p = pruneGraph(g, () => 5, 1.5);
    expect(countKind(p, 'end')).toBe(2);
    expect(countKind(p, 'junction')).toBe(0);
    expect(p.edges).toHaveLength(1);
    const e = p.edges[0]!;
    expect(e.from).toBe('e0');
    expect(e.to).toBe('e1');
    expect(e.pixels).toHaveLength(19);
    expect(new Set(e.pixels.map((q) => `${q.x},${q.y}`)).size).toBe(19);
    expect(e.pixels[0]).toEqual({ x: 0, y: 0 });
    expect(e.pixels[9]).toEqual({ x: 9, y: 0 });
    expect(e.pixels[e.pixels.length - 1]).toEqual({ x: 18, y: 0 });
  });

  it('joins the two long edges of a junction that keeps two edges into one edge', () => {
    const g = tee(9, 9, 3);
    const p = pruneGraph(g, () => 5, 1.5);
    expect(countKind(p, 'end')).toBe(2);
    expect(countKind(p, 'junction')).toBe(0);
    expect(p.edges).toHaveLength(1);
    const e = p.edges[0]!;
    expect(e.pixels).toHaveLength(19);
    expect(new Set(e.pixels.map((q) => `${q.x},${q.y}`)).size).toBe(19);
    expect(e.pixels[0]).toEqual({ x: 0, y: 0 });
    expect(e.pixels[e.pixels.length - 1]).toEqual({ x: 18, y: 0 });
  });

  it('keeps a branch longer than 1.5 times the half-width', () => {
    const g = tee(12, 12, 12);
    const p = pruneGraph(g, () => 5, 1.5);
    expect(p).toEqual(g);
  });

  it('never removes the last edge', () => {
    const g: PixelGraph = {
      nodes: [
        { id: 'j', x: 0, y: 0, kind: 'junction' },
        { id: 'e', x: 2, y: 0, kind: 'end' },
      ],
      edges: [{ from: 'j', to: 'e', pixels: pixelRun(0, 0, 2, 0) }],
    };
    const p = pruneGraph(g, () => 100);
    expect(p).toEqual(g);
  });

  it('does not change the input graph', () => {
    const g = tee(9, 9, 3);
    const before = JSON.parse(JSON.stringify(g));
    pruneGraph(g, () => 5);
    expect(g).toEqual(before);
  });
});
