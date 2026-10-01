import { describe, expect, it } from 'vitest';
import { orthogonalizeOutline, polygonAreaPt2, type FilteredWalls, type RoomPolygon } from './index.js';

const MM_PER_PT = 25; // 40 pt = 1 m
const M = 40;
const wallsOf = (...lines: [number, number, number, number][]): FilteredWalls => {
  const segments = new Float64Array(lines.length * 8);
  lines.forEach((l, i) => segments.set([...l, 0.5, 0, 0, 0], i * 8));
  return { walls: { segments, segmentCount: lines.length }, keep: new Uint8Array(lines.length).fill(1) };
};
const poly = (...pts: [number, number][]): RoomPolygon => ({ outer: pts.map(([x, y]) => ({ x, y })), holes: [] });

describe('orthogonalizeOutline', () => {
  it('replaces a small chamfer at a corner by a right-angle corner', () => {
    const p = poly([0, 0], [6 * M, 0], [6 * M, 3 * M], [0.2 * M, 3 * M], [0, 2.8 * M]);
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(4);
    expect(polygonAreaPt2(r)).toBeCloseTo(6 * M * 3 * M, 0);
    expect(r.outer.some((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.y - 3 * M) < 1e-6)).toBe(true);
  });

  it('makes an edge that leans by two degrees axis-parallel', () => {
    const lean = Math.tan((2 * Math.PI) / 180) * 3 * M;
    const p = poly([0, 0], [6 * M, 0], [6 * M + lean, 3 * M], [0, 3 * M]);
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(4);
    const xs = r.outer.map((v) => v.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6 * M + lean / 2, 3);
    for (let i = 0; i < 4; i++) {
      const a = r.outer[i]!;
      const b = r.outer[(i + 1) % 4]!;
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6);
    }
  });

  it('keeps a long slanted wall', () => {
    const p = poly([0, 0], [6 * M, 0], [6 * M, 1 * M], [4 * M, 3 * M], [0, 3 * M]);
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(5);
    expect(r.outer.some((v) => Math.abs(v.x - 6 * M) < 1e-6 && Math.abs(v.y - M) < 1e-6)).toBe(true);
    expect(r.outer.some((v) => Math.abs(v.x - 4 * M) < 1e-6 && Math.abs(v.y - 3 * M) < 1e-6)).toBe(true);
  });

  it('squares a slanted edge that no wall line supports, and keeps one that a wall line follows', () => {
    const p = poly([0, 0], [6 * M, 0], [6 * M, 2 * M], [5 * M, 3 * M], [0, 3 * M]);
    const free = orthogonalizeOutline(p, wallsOf([0, 0, 6 * M, 0], [0, 3 * M, 5 * M, 3 * M]), MM_PER_PT);
    expect(free.outer).toHaveLength(4);
    const supported = orthogonalizeOutline(p, wallsOf([0, 0, 6 * M, 0], [6 * M, 2 * M + 1, 5 * M, 3 * M + 1]), MM_PER_PT);
    expect(supported.outer).toHaveLength(5);
  });

  it('turns a short slanted step between two parallel walls into a straight jog', () => {
    const p = poly([0, 0], [3 * M, 0], [3 * M + 0.2 * M, 0.2 * M], [6 * M, 0.2 * M], [6 * M, 3 * M], [0, 3 * M]);
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const a = r.outer[i]!;
      const b = r.outer[(i + 1) % 6]!;
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6);
    }
  });

  it('joins two lines that differ by less than the merge distance into one', () => {
    const p = poly([0, 0], [3 * M, 0], [3 * M, 0.05 * M], [6 * M, 0.05 * M], [6 * M, 3 * M], [0, 3 * M]);
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(4);
  });

  it('leaves a plan that is turned against the page axes as it is', () => {
    const c = Math.cos(0.5);
    const s = Math.sin(0.5);
    const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    const p = poly(rot(0, 0), rot(6 * M, 0), rot(6 * M, 3 * M), rot(0.2 * M, 3 * M), rot(0, 2.8 * M));
    const r = orthogonalizeOutline(p, null, MM_PER_PT);
    expect(r.outer).toHaveLength(4);
    expect(polygonAreaPt2(r)).toBeCloseTo(6 * M * 3 * M, 0);
  });

  it('leaves an outline with few axis-parallel edges as it is', () => {
    const p = poly([0, 0], [4 * M, M], [5 * M, 3 * M], [2 * M, 4 * M], [-M, 2 * M]);
    expect(orthogonalizeOutline(p, null, MM_PER_PT)).toBe(p);
  });
});
