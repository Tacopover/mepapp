import { describe, expect, it } from 'vitest';
import { snapOutlineToWalls, type FilteredWalls } from './index.js';

const MM_PER_PT = 25;

function walls(lines: [number, number, number, number][]): FilteredWalls {
  const segments = new Float64Array(lines.length * 8);
  lines.forEach((l, i) => segments.set([l[0], l[1], l[2], l[3], 0.5, 0, 0, i], i * 8));
  return { walls: { segments, segmentCount: lines.length, bounds: [-100, -100, 500, 500] }, keep: new Uint8Array(lines.length).fill(1) };
}
const square = { outer: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], holes: [] };

describe('snapOutlineToWalls', () => {
  it('moves an outline edge onto a wall line that runs along it', () => {
    const r = snapOutlineToWalls(square, walls([[210, -50, 210, 250]]), MM_PER_PT);
    const right = r.outer.filter((p) => p.x > 100);
    expect(right.length).toBeGreaterThanOrEqual(2);
    expect(right.filter((p) => Math.abs(p.x - 210) < 0.5).length).toBeGreaterThanOrEqual(2);
    expect(r.outer.some((p) => Math.abs(p.x - 200) < 0.5 && p.y > 20 && p.y < 180)).toBe(false);
  });

  it('leaves the outline alone when the wall is out of reach or runs across it', () => {
    expect(snapOutlineToWalls(square, walls([[300, -50, 300, 250]]), MM_PER_PT)).toBe(square);
    const across = snapOutlineToWalls(square, walls([[100, 190, 100, 400]]), MM_PER_PT);
    expect(across.outer.some((p) => Math.abs(p.x - 100) < 0.5 && p.y > 150 && p.y < 199)).toBe(false);
  });
});
