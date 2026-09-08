import { describe, expect, it } from 'vitest';
import { annotationBoundsWorld, rotateAnnotationGeometry, translateAnnotationGeometry, type AnnotationGeometry } from './annotation.js';

describe('translateAnnotationGeometry', () => {
  it('shifts every point of a freehand stroke', () => {
    const g: AnnotationGeometry = {
      kind: 'freehand',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
    };
    const moved = translateAnnotationGeometry(g, 3, -2);
    expect(moved).toEqual({
      kind: 'freehand',
      points: [
        { x: 3, y: -2 },
        { x: 13, y: 3 },
      ],
    });
  });

  it('shifts both endpoints of a line', () => {
    const g: AnnotationGeometry = { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(translateAnnotationGeometry(g, 5, 5)).toEqual({ kind: 'line', from: { x: 5, y: 5 }, to: { x: 15, y: 5 } });
  });

  it('shifts every corner of a rectangle by moving its rect', () => {
    const g: AnnotationGeometry = { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 10, y1: 20 } };
    expect(translateAnnotationGeometry(g, 1, 2)).toEqual({ kind: 'rectangle', rect: { x0: 1, y0: 2, x1: 11, y1: 22 } });
  });

  it('shifts a circle by moving its center, leaving radius untouched', () => {
    const g: AnnotationGeometry = { kind: 'circle', center: { x: 0, y: 0 }, radius: 7 };
    expect(translateAnnotationGeometry(g, 4, 4)).toEqual({ kind: 'circle', center: { x: 4, y: 4 }, radius: 7 });
  });

  it('shifts a stickyNote by moving its position, leaving its text untouched', () => {
    const g: AnnotationGeometry = { kind: 'stickyNote', position: { x: 0, y: 0 }, text: 'note' };
    expect(translateAnnotationGeometry(g, 2, 3)).toEqual({ kind: 'stickyNote', position: { x: 2, y: 3 }, text: 'note' });
  });
});

describe('rotateAnnotationGeometry', () => {
  it('rotates a line endpoint-by-endpoint around the pivot', () => {
    const g: AnnotationGeometry = { kind: 'line', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } };
    const rotated = rotateAnnotationGeometry(g, { x: 0, y: 0 }, 90) as Extract<AnnotationGeometry, { kind: 'line' }>;
    expect(rotated.from.x).toBeCloseTo(0, 9);
    expect(rotated.from.y).toBeCloseTo(1, 9);
    expect(rotated.to.x).toBeCloseTo(0, 9);
    expect(rotated.to.y).toBeCloseTo(2, 9);
  });

  it('rotates a circle by moving its center only', () => {
    const g: AnnotationGeometry = { kind: 'circle', center: { x: 1, y: 0 }, radius: 5 };
    const rotated = rotateAnnotationGeometry(g, { x: 0, y: 0 }, 90) as Extract<AnnotationGeometry, { kind: 'circle' }>;
    expect(rotated.center.x).toBeCloseTo(0, 9);
    expect(rotated.center.y).toBeCloseTo(1, 9);
    expect(rotated.radius).toBe(5);
  });

  it('repositions a rectangle around the pivot but keeps it axis-aligned with the same width/height (resolved decision: reposition only, no tilt)', () => {
    const g: AnnotationGeometry = { kind: 'rectangle', rect: { x0: 0, y0: -5, x1: 10, y1: 5 } };
    const width = g.rect.x1 - g.rect.x0;
    const height = g.rect.y1 - g.rect.y0;
    const rotated = rotateAnnotationGeometry(g, { x: 0, y: 0 }, 90) as Extract<AnnotationGeometry, { kind: 'rectangle' }>;
    expect(rotated.rect.x1 - rotated.rect.x0).toBeCloseTo(width, 9);
    expect(rotated.rect.y1 - rotated.rect.y0).toBeCloseTo(height, 9);
    // The rect's own center (5, 0) orbits 90 degrees around the origin to (0, 5).
    expect((rotated.rect.x0 + rotated.rect.x1) / 2).toBeCloseTo(0, 9);
    expect((rotated.rect.y0 + rotated.rect.y1) / 2).toBeCloseTo(5, 9);
  });
});

describe('annotationBoundsWorld', () => {
  it('bounds a circle by its center +/- radius', () => {
    const g: AnnotationGeometry = { kind: 'circle', center: { x: 10, y: 10 }, radius: 3 };
    expect(annotationBoundsWorld(g, 16)).toEqual({ minX: 7, minY: 7, maxX: 13, maxY: 13 });
  });

  it('bounds a freehand stroke by its points min/max', () => {
    const g: AnnotationGeometry = {
      kind: 'freehand',
      points: [
        { x: 5, y: -2 },
        { x: -1, y: 8 },
        { x: 3, y: 3 },
      ],
    };
    expect(annotationBoundsWorld(g, 16)).toEqual({ minX: -1, minY: -2, maxX: 5, maxY: 8 });
  });

  it('bounds a stickyNote by its fixed icon size', () => {
    const g: AnnotationGeometry = { kind: 'stickyNote', position: { x: 0, y: 0 }, text: 'x' };
    expect(annotationBoundsWorld(g, 16)).toEqual({ minX: 0, minY: 0, maxX: 16, maxY: 16 });
  });
});
