import { describe, expect, it } from 'vitest';
import { calibrationFromScale, scaleDenominatorFromCalibration } from './calibration.js';
import { snapOrthogonal, snapToNearestLine } from './calibrationSnap.js';

// One horizontal line (0,0)-(100,0) and one vertical line (50,-50)-(50,50).
const lines = new Float64Array([0, 0, 100, 0, 50, -50, 50, 50]);

describe('snapToNearestLine', () => {
  it('snaps to the closest point on a line', () => {
    const snap = snapToNearestLine({ x: 20, y: 3 }, lines, 5);
    expect(snap?.point).toEqual({ x: 20, y: 0 });
    expect(snap?.lineIndex).toBe(0);
    expect(snap?.atEndpoint).toBe(false);
  });
  it('prefers a nearby end point', () => {
    const snap = snapToNearestLine({ x: 98, y: 1 }, lines, 5);
    expect(snap?.point).toEqual({ x: 100, y: 0 });
    expect(snap?.atEndpoint).toBe(true);
  });
  it('returns null outside the radius', () => {
    expect(snapToNearestLine({ x: 20, y: 30 }, lines, 5)).toBeNull();
  });
});

describe('snapOrthogonal', () => {
  it('locks to the dominant axis and snaps to a crossing line', () => {
    const snap = snapOrthogonal({ x: 0, y: 0 }, { x: 47, y: 9 }, lines, 5);
    expect(snap.axis).toBe('x');
    expect(snap.point).toEqual({ x: 50, y: 0 });
    expect(snap.lineIndex).toBe(1);
  });
  it('keeps the projected point when no line is close enough', () => {
    const snap = snapOrthogonal({ x: 0, y: 0 }, { x: 30, y: 9 }, lines, 5);
    expect(snap.point).toEqual({ x: 30, y: 0 });
    expect(snap.lineIndex).toBeNull();
  });
  it('works vertically', () => {
    const snap = snapOrthogonal({ x: 20, y: -30 }, { x: 22, y: 2 }, lines, 5);
    expect(snap.axis).toBe('y');
    expect(snap.point).toEqual({ x: 20, y: 0 });
    expect(snap.lineIndex).toBe(0);
  });
});

describe('scale calibration', () => {
  it('maps 1:100 to 72/25.4/100 pt per real mm', () => {
    expect(calibrationFromScale(100).pageUnitsPerRealUnit).toBeCloseTo(72 / 25.4 / 100, 9);
  });
  it('round-trips the denominator', () => {
    expect(scaleDenominatorFromCalibration(calibrationFromScale(50))).toBeCloseTo(50, 9);
  });
  it('rejects a non-positive denominator', () => {
    expect(() => calibrationFromScale(0)).toThrow();
  });
});
