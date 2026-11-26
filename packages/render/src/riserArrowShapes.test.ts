import { describe, expect, it } from 'vitest';
import { RISER_ARROW_PICTOGRAMS, type RiserArrowPair, type Vec2 } from '@mepapp/core';
import { RISER_ARROW_SHAFT_LENGTH_PT, RISER_ARROW_STYLE, riserArrowShaftPattern, riserArrowShapes, type RiserArrowShape } from './riserArrowShapes.js';

const ORIGIN: Vec2 = { x: 0, y: 0 };

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function ringRadius(kind: 'marked' | 'free', scale: number): number {
  return kind === 'marked' ? 6 + 3 / scale : 6 + 8 / scale;
}

function expectPoint(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe('riser arrow shapes', () => {
  it('draws the eight pictograms with the expected sides, directions and head ends', () => {
    const table: Record<number, { below: 'ring' | 'far' | '-'; above: 'ring' | 'far' | '-' }> = {
      1: { below: 'ring', above: 'far' },
      2: { below: '-', above: 'far' },
      3: { below: 'ring', above: '-' },
      4: { below: 'far', above: 'ring' },
      5: { below: '-', above: 'ring' },
      6: { below: 'far', above: '-' },
      7: { below: 'far', above: 'far' },
      8: { below: 'ring', above: 'ring' },
    };
    for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const pictogram = RISER_ARROW_PICTOGRAMS.find((p) => p.number === number);
      expect(pictogram).toBeDefined();
      if (!pictogram) continue;
      const shapes = riserArrowShapes(pictogram, ORIGIN, 10);
      for (const side of ['below', 'above'] as const) {
        const want = table[number][side];
        const shape = shapes.find((s) => s.side === side);
        if (want === '-') {
          expect(shape, `pictogram ${number} ${side}`).toBeUndefined();
          continue;
        }
        expect(shape, `pictogram ${number} ${side}`).toBeDefined();
        if (!shape) continue;
        expect(shape.direction, `pictogram ${number} ${side}`).toBe(pictogram[side]);
        expect(shape.headAtRing, `pictogram ${number} ${side}`).toBe(want === 'ring');
      }
      expect(shapes.length, `pictogram ${number}`).toBe(Object.values(table[number]).filter((v) => v !== '-').length);
    }
  });

  it('puts the below arrow first when both sides have an arrow', () => {
    const shapes = riserArrowShapes({ below: 'up', above: 'down' }, ORIGIN, 10);
    expect(shapes.map((s) => s.side)).toEqual(['below', 'above']);
  });

  it('returns no shapes for undefined and for the pair (none, none)', () => {
    expect(riserArrowShapes(undefined, ORIGIN, 10)).toEqual([]);
    expect(riserArrowShapes({ below: 'none', above: 'none' }, ORIGIN, 10)).toEqual([]);
  });

  it('keeps the arrow size fixed in world points at every scale', () => {
    for (const scale of [0.05, 1, 4, 32]) {
      for (const kind of ['marked', 'free'] as const) {
        const R = ringRadius(kind, scale);
        const [shape] = riserArrowShapes({ below: 'none', above: 'up' }, ORIGIN, R);
        expect(dist(shape.ringPoint, ORIGIN)).toBeCloseTo(R, 9);
        expect(dist(shape.ringPoint, shape.farPoint)).toBeCloseTo(RISER_ARROW_STYLE.lengthPt, 9);
        expect(dist(shape.shaftTail, shape.shaftEnd)).toBeCloseTo(50, 9);
        expect(dist(shape.head.tip, mid(shape.head.baseA, shape.head.baseB))).toBeCloseTo(14, 9);
        expect(dist(shape.head.baseA, shape.head.baseB)).toBeCloseTo(9, 9);
      }
    }
  });

  it('points the axis at 60 degrees and places the tip on the correct end', () => {
    const [above] = riserArrowShapes({ below: 'none', above: 'up' }, ORIGIN, 10);
    const [below] = riserArrowShapes({ below: 'down', above: 'none' }, ORIGIN, 10);
    expect((above.farPoint.x - above.ringPoint.x) / RISER_ARROW_STYLE.lengthPt).toBeCloseTo(0.5, 9);
    expect((above.farPoint.y - above.ringPoint.y) / RISER_ARROW_STYLE.lengthPt).toBeCloseTo(-Math.sqrt(3) / 2, 9);
    expect((below.farPoint.x - below.ringPoint.x) / RISER_ARROW_STYLE.lengthPt).toBeCloseTo(-0.5, 9);
    expect((below.farPoint.y - below.ringPoint.y) / RISER_ARROW_STYLE.lengthPt).toBeCloseTo(Math.sqrt(3) / 2, 9);
    expect(above.headAtRing).toBe(false);
    expectPoint(above.head.tip, above.farPoint);
    expect(below.headAtRing).toBe(false);
    expectPoint(below.head.tip, below.farPoint);

    const [toward] = riserArrowShapes({ below: 'none', above: 'down' }, ORIGIN, 10);
    expect(toward.headAtRing).toBe(true);
    expectPoint(toward.head.tip, toward.ringPoint);
    expectPoint(toward.shaftTail, toward.farPoint);
    expectPoint(toward.shaftEnd, mid(toward.head.baseA, toward.head.baseB));
  });

  it('shifts every point by a center that is not the origin and changes nothing else', () => {
    const center: Vec2 = { x: 100, y: 200 };
    const pair: RiserArrowPair = { below: 'up', above: 'down' };
    const origin = riserArrowShapes(pair, ORIGIN, 12);
    const shifted = riserArrowShapes(pair, center, 12);
    const shiftPt = (p: Vec2): Vec2 => ({ x: p.x + center.x, y: p.y + center.y });
    const shiftShape = (s: RiserArrowShape): RiserArrowShape => ({
      ...s,
      ringPoint: shiftPt(s.ringPoint),
      farPoint: shiftPt(s.farPoint),
      shaftTail: shiftPt(s.shaftTail),
      shaftEnd: shiftPt(s.shaftEnd),
      head: { tip: shiftPt(s.head.tip), baseA: shiftPt(s.head.baseA), baseB: shiftPt(s.head.baseB) },
    });
    expect(shifted.length).toBe(origin.length);
    origin.map(shiftShape).forEach((expected, i) => {
      const actual = shifted[i];
      expectPoint(actual.ringPoint, expected.ringPoint);
      expectPoint(actual.farPoint, expected.farPoint);
      expectPoint(actual.shaftTail, expected.shaftTail);
      expectPoint(actual.shaftEnd, expected.shaftEnd);
      expectPoint(actual.head.tip, expected.head.tip);
      expectPoint(actual.head.baseA, expected.head.baseA);
      expectPoint(actual.head.baseB, expected.head.baseB);
      expect(actual.side).toBe(expected.side);
      expect(actual.direction).toBe(expected.direction);
      expect(actual.headAtRing).toBe(expected.headAtRing);
    });
  });

  it('gives only finite coordinates at every scale and ring kind', () => {
    for (const scale of [0.05, 0.25, 1, 4, 32]) {
      for (const kind of ['marked', 'free'] as const) {
        for (const shape of riserArrowShapes({ below: 'up', above: 'down' }, { x: 50, y: 60 }, ringRadius(kind, scale))) {
          const points = [shape.ringPoint, shape.farPoint, shape.shaftTail, shape.shaftEnd, shape.head.tip, shape.head.baseA, shape.head.baseB];
          for (const p of points) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
          }
        }
      }
    }
  });

  it('returns the shaft length as lengthPt minus headLengthPt', () => {
    expect(RISER_ARROW_SHAFT_LENGTH_PT).toBe(50);
  });

  it('gives no dash pattern for null, undefined or an empty pattern', () => {
    expect(riserArrowShaftPattern(null)).toBeNull();
    expect(riserArrowShaftPattern(undefined)).toBeNull();
    expect(riserArrowShaftPattern([])).toBeNull();
  });

  it('returns a copy of the dashed pattern at the default shaft length', () => {
    const pattern = [8, 5];
    const result = riserArrowShaftPattern(pattern);
    expect(result).toEqual([8, 5]);
    expect(result).not.toBe(pattern);
  });

  it('gives a pattern at the default shaft length for the scene dash patterns', () => {
    // Copy of DASH_PATTERN_WORLD in scene.ts (not exported; scene.ts imports pixi).
    const patterns = [[8, 5], [1.5, 4], [8, 4, 1.5, 4], [14, 6], [8, 4, 1.5, 4, 1.5, 4]];
    for (const pattern of patterns) {
      expect(riserArrowShaftPattern(pattern, 50)).toEqual(pattern);
    }
  });

  it('gives null when the shaft is shorter than 2 periods and a pattern otherwise', () => {
    expect(riserArrowShaftPattern([8, 5], 25)).toBeNull();
    expect(riserArrowShaftPattern([8, 5], 26)).toEqual([8, 5]);
  });

  it('uses the default style when no style is given', () => {
    const pictograms = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => RISER_ARROW_PICTOGRAMS.find((p) => p.number === number));
    const pairs: (RiserArrowPair | undefined)[] = [...pictograms, { below: 'none', above: 'none' }];
    for (const pair of pairs) {
      expect(riserArrowShapes(pair, ORIGIN, 10)).toEqual(riserArrowShapes(pair, ORIGIN, 10, RISER_ARROW_STYLE));
    }
  });

  it('takes a smaller picture style with the same angle', () => {
    const style = { lengthPt: 13, shaftWidthPt: 1.5, headLengthPt: 5, headWidthPt: 4, angleDeg: 60 };
    const center: Vec2 = { x: 18, y: 18 };
    const [above] = riserArrowShapes({ below: 'none', above: 'up' }, center, 4.5, style);
    expect(dist(above.ringPoint, center)).toBeCloseTo(4.5, 9);
    expect(dist(above.farPoint, center)).toBeCloseTo(17.5, 9);
    expect(above.headAtRing).toBe(false);
    expectPoint(above.head.tip, above.farPoint);
  });

  it('keeps the pictogram 1 arrows inside a 36 px picture with the smaller style', () => {
    const style = { lengthPt: 13, shaftWidthPt: 1.5, headLengthPt: 5, headWidthPt: 4, angleDeg: 60 };
    const shapes = riserArrowShapes({ below: 'up', above: 'up' }, { x: 18, y: 18 }, 4.5, style);
    expect(shapes.length).toBe(2);
    const below = shapes.find((s) => s.side === 'below');
    const above = shapes.find((s) => s.side === 'above');
    expect(below?.headAtRing).toBe(true);
    expect(above?.headAtRing).toBe(false);
    for (const shape of shapes) {
      const points = [shape.ringPoint, shape.farPoint, shape.shaftTail, shape.shaftEnd, shape.head.tip, shape.head.baseA, shape.head.baseB];
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(36);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(36);
      }
    }
  });

  it('turns the above arrow straight up at 90 degrees', () => {
    const style = { lengthPt: 13, shaftWidthPt: 1.5, headLengthPt: 5, headWidthPt: 4, angleDeg: 90 };
    const center: Vec2 = { x: 18, y: 18 };
    const [above] = riserArrowShapes({ below: 'none', above: 'up' }, center, 4.5, style);
    expect(above.farPoint.x).toBeCloseTo(center.x, 9);
    expect(above.farPoint.y).toBeLessThan(center.y);
  });
});
