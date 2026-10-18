import { describe, expect, it } from 'vitest';
import { resolveAngleSnap } from './angle-snap.js';

const origin = { x: 0, y: 0 };

describe('resolveAngleSnap', () => {
  it('snaps a shallow heading to 0 degrees and keeps the distance', () => {
    const r = resolveAngleSnap(origin, { x: 10, y: 1 }, 45);
    expect(r.x).toBeCloseTo(10.0499, 4);
    expect(r.y).toBeCloseTo(0, 4);
  });

  it('returns the raw point itself when the increment is 0', () => {
    const raw = { x: 10, y: 1 };
    expect(resolveAngleSnap(origin, raw, 0)).toBe(raw);
  });

  it('returns the raw point itself when it equals the anchor', () => {
    const raw = { x: 0, y: 0 };
    expect(resolveAngleSnap(origin, raw, 45)).toBe(raw);
  });

  it('snaps a 50.19 degree heading to 45 degrees', () => {
    const r = resolveAngleSnap(origin, { x: 5, y: 6 }, 45);
    expect(r.x).toBeCloseTo(5.5227, 4);
    expect(r.y).toBeCloseTo(5.5227, 4);
  });

  it('snaps a near-180 degree heading to 180 degrees on a 90 degree increment', () => {
    const r = resolveAngleSnap(origin, { x: -3, y: 0.2 }, 90);
    expect(r.x).toBeCloseTo(-3.0067, 4);
    expect(r.y).toBeCloseTo(0, 4);
  });

  it('snaps a near -90 degree heading to -90 degrees on a 90 degree increment', () => {
    const r = resolveAngleSnap(origin, { x: 0.1, y: -8 }, 90);
    expect(r.x).toBeCloseTo(0, 4);
    expect(r.y).toBeCloseTo(-8.0006, 4);
  });

  it('leaves a point already on a 45 degree heading unchanged', () => {
    const r = resolveAngleSnap(origin, { x: 10, y: 10 }, 45);
    expect(r.x).toBeCloseTo(10, 4);
    expect(r.y).toBeCloseTo(10, 4);
  });

  it('leaves a point already on a -45 degree heading unchanged', () => {
    const r = resolveAngleSnap(origin, { x: 7, y: -7 }, 45);
    expect(r.x).toBeCloseTo(7, 4);
    expect(r.y).toBeCloseTo(-7, 4);
  });
});
