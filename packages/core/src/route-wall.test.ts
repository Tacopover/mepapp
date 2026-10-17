import { describe, expect, it } from 'vitest';
import type { RoomPolygon } from './rooms/types.js';
import { boundaryGapMm, wallStretch } from './route-wall.js';

function rect(x0: number, y0: number, x1: number, y1: number): RoomPolygon {
  return {
    outer: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    holes: [],
  };
}

function circle(cx: number, cy: number, r: number, n: number): RoomPolygon {
  const outer = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    outer.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return { outer, holes: [] };
}

describe('wallStretch', () => {
  it('finds a shared edge with gap 0', () => {
    const s = wallStretch(rect(0, 0, 1000, 1000), rect(1000, 0, 2000, 1000), 1);
    expect(s).not.toBeNull();
    expect(s!.gapMm).toBeCloseTo(0, 6);
    expect(Math.abs(s!.runMm - 1000)).toBeLessThanOrEqual(100);
    expect(Math.abs(s!.point.x - 1000)).toBeLessThanOrEqual(1);
    expect(s!.point.y).toBeGreaterThanOrEqual(0);
    expect(s!.point.y).toBeLessThanOrEqual(1000);
  });

  it('finds a wall with a gap of 300', () => {
    const s = wallStretch(rect(0, 0, 1000, 1000), rect(1300, 0, 2300, 1000), 1);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.gapMm - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(s!.point.x - 1150)).toBeLessThanOrEqual(20);
    expect(Math.abs(s!.runMm - 1000)).toBeLessThanOrEqual(100);
  });

  it('returns null for a gap of 700', () => {
    expect(wallStretch(rect(0, 0, 1000, 1000), rect(1700, 0, 2700, 1000), 1)).toBeNull();
  });

  it('returns null for a shared run of 400', () => {
    expect(wallStretch(rect(0, 0, 1000, 1000), rect(1000, 0, 2000, 400), 1)).toBeNull();
  });

  it('finds a shared run of 600', () => {
    const s = wallStretch(rect(0, 0, 1000, 1000), rect(1000, 0, 2000, 600), 1);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.runMm - 600)).toBeLessThanOrEqual(100);
  });

  it('keeps a run equal to minWallRunMm despite float error', () => {
    const a = rect(0, 0, 1000, 1000);
    const b = rect(1000, 0, 2000, 600);
    const run = wallStretch(a, b, 1, { minWallRunMm: 0 })!.runMm;
    expect(wallStretch(a, b, 1, { minWallRunMm: run + 1e-9 })).not.toBeNull();
  });

  it('takes the longer of two runs', () => {
    const a = rect(0, 0, 4000, 1000);
    const b: RoomPolygon = {
      outer: [
        { x: 0, y: 1000 },
        { x: 1000, y: 1000 },
        { x: 1000, y: 2000 },
        { x: 2500, y: 2000 },
        { x: 2500, y: 1000 },
        { x: 4000, y: 1000 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      holes: [],
    };
    const s = wallStretch(a, b, 1);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.runMm - 1500)).toBeLessThanOrEqual(100);
    expect(s!.point.x).toBeGreaterThanOrEqual(2500);
    expect(s!.point.x).toBeLessThanOrEqual(4000);
    expect(Math.abs(s!.point.y - 1000)).toBeLessThanOrEqual(1);
  });

  it('finds a room inside a hole of the other room', () => {
    const b: RoomPolygon = { outer: rect(0, 0, 3000, 3000).outer, holes: [rect(1000, 1000, 2000, 2000).outer] };
    const s = wallStretch(rect(1300, 1300, 1700, 1700), b, 1);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.runMm - 1600)).toBeLessThanOrEqual(1);
    expect(Math.abs(s!.gapMm - 300)).toBeLessThanOrEqual(1);
  });

  it('joins a run that wraps over the first vertex of the ring', () => {
    const a: RoomPolygon = {
      outer: [
        { x: 1000, y: 500 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
      holes: [],
    };
    const s = wallStretch(a, rect(1000, 0, 2000, 1000), 1);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.runMm - 1000)).toBeLessThanOrEqual(100);
  });

  it('returns null for two rooms far apart and is fast', () => {
    const a = circle(0, 0, 1000, 200);
    const b = circle(100000, 0, 1000, 200);
    const t0 = performance.now();
    const s = wallStretch(a, b, 1);
    const ms = performance.now() - t0;
    expect(s).toBeNull();
    expect(ms).toBeLessThan(5);
  });

  it('does not change its input', () => {
    const a = rect(0, 0, 1000, 1000);
    const b = rect(1300, 0, 2300, 1000);
    const copyA = JSON.parse(JSON.stringify(a));
    const copyB = JSON.parse(JSON.stringify(b));
    wallStretch(a, b, 1);
    expect(a).toEqual(copyA);
    expect(b).toEqual(copyB);
  });

  it('converts pt to mm with mmPerPt', () => {
    const s = wallStretch(rect(0, 0, 1000, 1000), rect(1030, 0, 2030, 1000), 10);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.gapMm - 300)).toBeLessThanOrEqual(1);
  });
});

describe('boundaryGapMm', () => {
  it('is 0 for touching rooms', () => {
    expect(boundaryGapMm(rect(0, 0, 1000, 1000), rect(1000, 0, 2000, 1000), 1)).toBeCloseTo(0, 5);
  });

  it('is 300 for a gap of 300, from both sides', () => {
    const a = rect(0, 0, 1000, 1000);
    const b = rect(1300, 0, 2300, 1000);
    expect(Math.abs(boundaryGapMm(a, b, 1) - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(boundaryGapMm(b, a, 1) - 300)).toBeLessThanOrEqual(1);
  });

  it('is Infinity for an empty ring', () => {
    const empty: RoomPolygon = { outer: [], holes: [] };
    expect(boundaryGapMm(empty, rect(0, 0, 1000, 1000), 1)).toBe(Infinity);
    expect(boundaryGapMm(rect(0, 0, 1000, 1000), empty, 1)).toBe(Infinity);
  });

  it('is symmetric for a tilted second rectangle', () => {
    const a = rect(0, 0, 1000, 1000);
    const b: RoomPolygon = {
      outer: [
        { x: 1300, y: 0 },
        { x: 2300, y: 100 },
        { x: 2300, y: 1100 },
        { x: 1300, y: 1000 },
      ],
      holes: [],
    };
    const ab = boundaryGapMm(a, b, 1);
    const ba = boundaryGapMm(b, a, 1);
    expect(Math.abs(ab - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(ab - ba)).toBeLessThanOrEqual(1);
  });
});
