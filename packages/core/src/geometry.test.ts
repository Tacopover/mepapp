import { describe, expect, it } from 'vitest';
import {
  centroid,
  composeTransform,
  multiRotate,
  normalizeDegrees,
  rectIntersectsRotatedRect,
  rotateBy,
  rotatePointAround,
  type Transform2D,
} from './geometry.js';

describe('check 1 — no cumulative drift across repeated rotations', () => {
  it('returns the exact original transform after four 90-degree rotations', () => {
    const original: Transform2D = {
      position: { x: 120.5, y: -47.25 },
      rotationDegrees: 37,
      scale: { x: 1.5, y: 0.75 },
    };

    let current = original;
    for (let i = 0; i < 4; i++) {
      current = rotateBy(current, 90);
    }

    expect(current.rotationDegrees).toBe(original.rotationDegrees);
    expect(composeTransform(current)).toEqual(composeTransform(original));
  });

  it('normalizes to the same absolute angle regardless of starting angle', () => {
    for (const start of [0, 15, 90, 179.5, 359]) {
      let angle = start;
      for (let i = 0; i < 4; i++) {
        angle = normalizeDegrees(angle + 90);
      }
      expect(angle).toBe(normalizeDegrees(start));
    }
  });

  it('contrast: naive incremental matrix composition drifts, motivating the scalar design', () => {
    // Composing four 90-degree rotation matrices by repeated multiplication
    // accumulates floating-point error, because cos/sin of 90 degrees are not
    // exactly 1/0 in IEEE 754. This is why rotation is stored as an absolute
    // scalar and the matrix is rebuilt fresh from it, never accumulated.
    let m = { a: 1, b: 0, c: 0, d: 1 };
    const radians = (90 * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    for (let i = 0; i < 4; i++) {
      m = {
        a: m.a * cos - m.b * sin,
        b: m.a * sin + m.b * cos,
        c: m.c * cos - m.d * sin,
        d: m.c * sin + m.d * cos,
      };
    }
    const isExactIdentity = m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1;
    expect(isExactIdentity).toBe(false);
  });
});

describe('check 4 — multi-rotate preserves relative position and own rotation', () => {
  const elements: Transform2D[] = [
    { position: { x: 0, y: 0 }, rotationDegrees: 10, scale: { x: 1, y: 1 } },
    { position: { x: 100, y: 0 }, rotationDegrees: 200, scale: { x: 1, y: 1 } },
    { position: { x: 40, y: 80 }, rotationDegrees: 350, scale: { x: 2, y: 2 } },
  ];

  it('advances each element own rotation by exactly the delta, mod 360', () => {
    const delta = 137;
    const result = multiRotate(elements, delta);
    result.forEach((el, i) => {
      expect(el.rotationDegrees).toBeCloseTo(normalizeDegrees(elements[i].rotationDegrees + delta), 10);
    });
  });

  it('preserves every pairwise relative position exactly, up to floating precision', () => {
    const delta = 137;
    const result = multiRotate(elements, delta);
    for (let i = 0; i < elements.length; i++) {
      for (let j = 0; j < elements.length; j++) {
        if (i === j) continue;
        const oldRelative = {
          x: elements[j].position.x - elements[i].position.x,
          y: elements[j].position.y - elements[i].position.y,
        };
        const expectedNewRelative = rotatePointAround(oldRelative, { x: 0, y: 0 }, delta);
        const actualNewRelative = {
          x: result[j].position.x - result[i].position.x,
          y: result[j].position.y - result[i].position.y,
        };
        expect(actualNewRelative.x).toBeCloseTo(expectedNewRelative.x, 10);
        expect(actualNewRelative.y).toBeCloseTo(expectedNewRelative.y, 10);
      }
    }
  });

  it('preserves the selection centroid, since the group orbits its own center', () => {
    const before = centroid(elements.map((e) => e.position));
    const after = centroid(multiRotate(elements, 137).map((e) => e.position));
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('returns an empty array for an empty selection', () => {
    expect(multiRotate([], 90)).toEqual([]);
  });
});

describe('check 2 — rubber-band selection tests the rotated shape, not a center point', () => {
  const stamp: Transform2D = { position: { x: 100, y: 100 }, rotationDegrees: 0, scale: { x: 1, y: 1 } };

  it('detects an unrotated stamp fully enclosed by the drag rectangle', () => {
    expect(rectIntersectsRotatedRect({ x: 50, y: 50 }, { x: 150, y: 150 }, stamp, 20, 20)).toBe(true);
  });

  it('does not select a stamp far outside the drag rectangle', () => {
    expect(rectIntersectsRotatedRect({ x: 50, y: 50 }, { x: 150, y: 150 }, { ...stamp, position: { x: 500, y: 500 } }, 20, 20)).toBe(
      false,
    );
  });

  it('rejects a drag rectangle whose corner lies in the rotated stamp AABB but misses its true rotated extent', () => {
    // A stamp rotated 45 degrees has a diamond-shaped footprint; a small drag
    // rectangle placed in the AABB's corner, outside the diamond, must miss —
    // a center-point-only or AABB-only test would get this wrong.
    const rotated: Transform2D = { position: { x: 0, y: 0 }, rotationDegrees: 45, scale: { x: 1, y: 1 } };
    const halfWidth = 10;
    const halfHeight = 10;
    // AABB half-extent of a 45-degree-rotated 10x10 half-extent square is 10*sqrt(2) ~= 14.14
    expect(rectIntersectsRotatedRect({ x: 12, y: 12 }, { x: 14, y: 14 }, rotated, halfWidth, halfHeight)).toBe(false);
  });

  it('accepts a drag rectangle that overlaps the rotated diamond', () => {
    const rotated: Transform2D = { position: { x: 0, y: 0 }, rotationDegrees: 45, scale: { x: 1, y: 1 } };
    expect(rectIntersectsRotatedRect({ x: 8, y: -1 }, { x: 12, y: 1 }, rotated, 10, 10)).toBe(true);
  });
});
