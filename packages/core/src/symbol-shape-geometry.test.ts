import { describe, expect, it } from 'vitest';
import type { SymbolShape, SymbolShapeStyle } from './symbol-shapes.js';
import {
  angleSnap,
  applyHandleDrag,
  arcFromThreePoints,
  collectSnapPoints,
  createDraftShape,
  findNearestSnapPoint,
  gridSnap,
  hitTestSymbolShape,
  isDraftLargeEnough,
  mirrorShape,
  normalizeAngle,
  rescaleShapeForCanvasResize,
  rotatePoint,
  rotateShapeAround,
  scaleShape,
  selectionBounds,
  selectionPivot,
  shapeCenter,
  shapeHandles,
  symbolShapeBounds,
  translatePoint,
  translateShape,
  updateDraftShape,
} from './symbol-shape-geometry.js';

const style: SymbolShapeStyle = { stroke: '#000000', strokeWidth: 0.01, fill: null };

const rect: SymbolShape = { id: 'r1', kind: 'rect', x: 0.2, y: 0.3, width: 0.1, height: 0.05, style, rotation: 0 };
const line: SymbolShape = { id: 'l1', kind: 'line', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.1, style, rotation: 0 };
const circle: SymbolShape = { id: 'c1', kind: 'circle', cx: 0.5, cy: 0.5, radius: 0.1, style, rotation: 0 };
const polygon: SymbolShape = {
  id: 'p1',
  kind: 'polygon',
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.1 },
    { x: 0.15, y: 0.2 },
  ],
  style,
  rotation: 0,
};

// A non-square pixel size, so a test that got the width/height axis backwards would fail.
const WIDTH_PX = 200;
const HEIGHT_PX = 100;

describe('normalizeAngle', () => {
  it('reduces a negative angle to its [0, 2π) representative', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 10);
  });

  it('reduces an angle past 2π back into range', () => {
    expect(normalizeAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5, 10);
  });
});

describe('shapeCenter', () => {
  it('is the midpoint of a rect', () => {
    expect(shapeCenter(rect)).toEqual({ x: 0.25, y: 0.325 });
  });

  it('is a circle/arc/ellipse shape\'s own cx/cy', () => {
    expect(shapeCenter(circle)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('rotatePoint', () => {
  it('rotates a point 90 degrees about the origin', () => {
    const result = rotatePoint(1, 0, 0, 0, Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('leaves the pivot itself unchanged', () => {
    const result = rotatePoint(5, 5, 5, 5, 1.234);
    expect(result).toEqual({ x: 5, y: 5 });
  });
});

describe('translatePoint', () => {
  it('adds the delta to both coordinates', () => {
    expect(translatePoint(2, 3, 1, -1)).toEqual({ x: 3, y: 2 });
  });
});

describe('hitTestSymbolShape', () => {
  const shapes = [rect, circle];

  it('finds a shape under the given fraction-space point', () => {
    // Inside the filled test would need style.fill set; rect here is unfilled, so test its edge.
    const hit = hitTestSymbolShape(shapes, 0.2, 0.3, WIDTH_PX, HEIGHT_PX);
    expect(hit?.id).toBe('r1');
  });

  it('returns null when no shape is near the point', () => {
    expect(hitTestSymbolShape(shapes, 0.9, 0.9, WIDTH_PX, HEIGHT_PX)).toBeNull();
  });

  it('hit-tests topmost shape first when shapes overlap', () => {
    const overlappingCircle: SymbolShape = { ...circle, id: 'c-top', cx: 0.2, cy: 0.3, radius: 0.2, style: { ...style, fill: '#fff' } };
    const hit = hitTestSymbolShape([rect, overlappingCircle], 0.2, 0.3, WIDTH_PX, HEIGHT_PX);
    expect(hit?.id).toBe('c-top');
  });
});

describe('symbolShapeBounds', () => {
  it('returns the exact box for an unrotated rect', () => {
    expect(symbolShapeBounds(rect, WIDTH_PX, HEIGHT_PX)).toEqual({ x: 0.2, y: 0.3, width: 0.1, height: 0.05 });
  });

  it('returns a rotated bounding box that is at least as large as the unrotated one', () => {
    const rotated = { ...rect, rotation: Math.PI / 4 };
    const bounds = symbolShapeBounds(rotated, WIDTH_PX, HEIGHT_PX);
    expect(bounds.width).toBeGreaterThan(rect.kind === 'rect' ? rect.width : 0);
  });
});

describe('shapeHandles', () => {
  it('gives a rect four corner handles at its corners when unrotated', () => {
    const handles = shapeHandles(rect, WIDTH_PX, HEIGHT_PX);
    expect(handles.map((h) => h.id).sort()).toEqual(['bl', 'br', 'tl', 'tr']);
    const tl = handles.find((h) => h.id === 'tl')!;
    expect(tl.x).toBeCloseTo(0.2, 10);
    expect(tl.y).toBeCloseTo(0.3, 10);
  });

  it('gives text shapes no handles', () => {
    const text: SymbolShape = { id: 't1', kind: 'text', x: 0.1, y: 0.1, text: 'AB', fontSize: 0.05, style, rotation: 0 };
    expect(shapeHandles(text, WIDTH_PX, HEIGHT_PX)).toEqual([]);
  });
});

describe('applyHandleDrag', () => {
  it('resizes a rect from its br handle, keeping tl fixed', () => {
    const dragged = applyHandleDrag(rect, 'br', { x: 0.35, y: 0.4 }, WIDTH_PX, HEIGHT_PX);
    expect(dragged.kind).toBe('rect');
    if (dragged.kind !== 'rect') return;
    expect(dragged.x).toBeCloseTo(0.2, 10);
    expect(dragged.y).toBeCloseTo(0.3, 10);
    expect(dragged.width).toBeCloseTo(0.15, 10);
    expect(dragged.height).toBeCloseTo(0.1, 10);
  });

  it('resizes a rect from its tl handle, keeping br fixed', () => {
    const dragged = applyHandleDrag(rect, 'tl', { x: 0.25, y: 0.3 }, WIDTH_PX, HEIGHT_PX);
    // Original br corner is (0.3, 0.35).
    expect(dragged.kind).toBe('rect');
    if (dragged.kind !== 'rect') return;
    expect(dragged.x).toBeCloseTo(0.25, 10);
    expect(dragged.y).toBeCloseTo(0.3, 10);
    expect(dragged.width).toBeCloseTo(0.05, 10);
    expect(dragged.height).toBeCloseTo(0.05, 10);
  });
});

describe('createDraftShape / updateDraftShape / isDraftLargeEnough', () => {
  it('creates a zero-size rect at the start point and grows it as the pointer moves', () => {
    const draft = createDraftShape('rect', 'draft-1', { fractionX: 0.1, fractionY: 0.1 }, style);
    expect(isDraftLargeEnough(draft)).toBe(false);

    const updated = updateDraftShape(draft, { fractionX: 0.1, fractionY: 0.1 }, { fractionX: 0.3, fractionY: 0.2 });
    expect(updated.kind).toBe('rect');
    if (updated.kind === 'rect') {
      expect(updated.x).toBeCloseTo(0.1, 10);
      expect(updated.y).toBeCloseTo(0.1, 10);
      expect(updated.width).toBeCloseTo(0.2, 10);
      expect(updated.height).toBeCloseTo(0.1, 10);
    }
    expect(isDraftLargeEnough(updated)).toBe(true);
  });

  it('grows a circle draft to the drag distance', () => {
    const draft = createDraftShape('circle', 'draft-2', { fractionX: 0.5, fractionY: 0.5 }, style);
    const updated = updateDraftShape(draft, { fractionX: 0.5, fractionY: 0.5 }, { fractionX: 0.6, fractionY: 0.5 });
    expect(updated.kind === 'circle' && updated.radius).toBeCloseTo(0.1, 10);
  });
});

describe('selectionBounds / selectionPivot', () => {
  it('combines the bounds of two shapes and returns the combined center as pivot', () => {
    const bounds = selectionBounds([rect, circle], WIDTH_PX, HEIGHT_PX);
    // rect spans x:[0.2,0.3] y:[0.3,0.35]; circle (radius 0.1, non-square canvas) spans x:[0.4,0.6] roughly.
    expect(bounds.x).toBeCloseTo(0.2, 10);
    const pivot = selectionPivot([rect, circle], WIDTH_PX, HEIGHT_PX);
    expect(pivot.x).toBeCloseTo(bounds.x + bounds.width / 2, 10);
    expect(pivot.y).toBeCloseTo(bounds.y + bounds.height / 2, 10);
  });
});

describe('mirrorShape', () => {
  it('mirrors a rect horizontally about a pivot', () => {
    const mirrored = mirrorShape(rect, 'horizontal', 0.25, 0);
    // pivot 0.25: x=0.2 -> 0.3, x+width=0.3 -> 0.2, so new x = min = 0.2, width unchanged.
    expect(mirrored.kind).toBe('rect');
    if (mirrored.kind !== 'rect') return;
    expect(mirrored.x).toBeCloseTo(0.2, 10);
    expect(mirrored.y).toBeCloseTo(0.3, 10);
    expect(mirrored.width).toBeCloseTo(0.1, 10);
    expect(mirrored.height).toBeCloseTo(0.05, 10);
  });

  it('flips the sign of rotation on mirror', () => {
    const rotated = { ...rect, rotation: 0.5 };
    const mirrored = mirrorShape(rotated, 'vertical', 0, 0.5);
    expect(mirrored.rotation).toBeCloseTo(-0.5, 10);
  });
});

describe('scaleShape', () => {
  it('doubles a circle radius and accumulates the scale field', () => {
    const scaled = scaleShape(circle, 2, circle.kind === 'circle' ? circle.cx : 0, circle.kind === 'circle' ? circle.cy : 0);
    expect(scaled).toMatchObject({ kind: 'circle', radius: 0.2, scale: 2 });
    const scaledAgain = scaleShape(scaled, 1.5, 0.5, 0.5);
    expect(scaledAgain.scale).toBeCloseTo(3, 10);
  });
});

describe('rescaleShapeForCanvasResize', () => {
  it('scales a rect independently on x and y, and strokeWidth by sMin', () => {
    const resized = rescaleShapeForCanvasResize(rect, 2, 3, 2);
    expect(resized.kind).toBe('rect');
    if (resized.kind === 'rect') {
      expect(resized.x).toBeCloseTo(0.4, 10);
      expect(resized.y).toBeCloseTo(0.9, 10);
      expect(resized.width).toBeCloseTo(0.2, 10);
      expect(resized.height).toBeCloseTo(0.15, 10);
    }
    expect(resized.style.strokeWidth).toBeCloseTo(0.02, 10);
  });
});

describe('translateShape (generalized via translatePoint)', () => {
  it('translates a rect by adding dx/dy to x/y, matching plain point translation', () => {
    const moved = translateShape(rect, 0.05, -0.02);
    const expected = translatePoint(rect.x as number, rect.y as number, 0.05, -0.02);
    expect(moved).toMatchObject({ kind: 'rect', x: expected.x, y: expected.y, width: rect.width, height: rect.height });
  });

  it('translates every point of a polygon', () => {
    const moved = translateShape(polygon, 0.1, 0.1);
    expect(moved.kind).toBe('polygon');
    if (moved.kind !== 'polygon') return;
    const expected = [
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.2 },
      { x: 0.25, y: 0.3 },
    ];
    moved.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 10);
      expect(p.y).toBeCloseTo(expected[i].y, 10);
    });
  });

  it('translates a line by moving both endpoints', () => {
    const moved = translateShape(line, 0.1, -0.05);
    expect(moved).toMatchObject({ kind: 'line', x1: 0.2, y1: 0.05, x2: 0.5, y2: 0.05 });
  });
});

describe('rotateShapeAround (uses rotatePoint internally)', () => {
  it('only changes rotation, not position, when the pivot is the shape\'s own center', () => {
    const center = shapeCenter(rect);
    const rotated = rotateShapeAround(rect, Math.PI / 2, center.x, center.y);
    expect(rotated.rotation).toBeCloseTo(Math.PI / 2, 10);
    // Rect's own x/y (top-left, pre-rotation) stay put — only the rotation field records the spin.
    expect(rotated).toMatchObject({ kind: 'rect', x: rect.x, y: rect.y });
  });

  it('revolves the shape around an external pivot and advances rotation', () => {
    // Revolve the rect's center (0.25, 0.325) by 180 degrees around the origin.
    const rotated = rotateShapeAround(rect, Math.PI, 0, 0);
    const newCenter = shapeCenter(rotated);
    expect(newCenter.x).toBeCloseTo(-0.25, 10);
    expect(newCenter.y).toBeCloseTo(-0.325, 10);
    expect(rotated.rotation).toBeCloseTo(Math.PI, 10);
  });
});

describe('arcFromThreePoints', () => {
  it('fits the circle through three points on a known circle', () => {
    // Circle centered at fraction (0.5, 0.5) with pixel radius 40 on a 200x100 canvas —
    // fraction radius 40/min(200,100) = 0.4.
    const cx = 0.5;
    const cy = 0.5;
    const rPx = 40;
    const angleStart = 0;
    const angleEnd = Math.PI / 2;
    const angleThrough = Math.PI / 4;
    const toFraction = (angle: number) => ({
      fractionX: cx + (rPx * Math.cos(angle)) / WIDTH_PX,
      fractionY: cy + (rPx * Math.sin(angle)) / HEIGHT_PX,
    });
    const arc = arcFromThreePoints(toFraction(angleStart), toFraction(angleEnd), toFraction(angleThrough), style, WIDTH_PX, HEIGHT_PX);
    expect(arc).not.toBeNull();
    expect(arc!.kind).toBe('arc');
    expect(arc!.kind === 'arc' && arc!.cx).toBeCloseTo(cx, 6);
    expect(arc!.kind === 'arc' && arc!.cy).toBeCloseTo(cy, 6);
    expect(arc!.kind === 'arc' && arc!.radius).toBeCloseTo(rPx / Math.min(WIDTH_PX, HEIGHT_PX), 6);
  });

  it('returns null for (near-)collinear points', () => {
    const arc = arcFromThreePoints({ fractionX: 0.1, fractionY: 0.1 }, { fractionX: 0.2, fractionY: 0.1 }, { fractionX: 0.3, fractionY: 0.1 }, style, WIDTH_PX, HEIGHT_PX);
    expect(arc).toBeNull();
  });
});

describe('gridSnap (already plain-value, moved as-is)', () => {
  it('rounds to the nearest multiple of spacing', () => {
    expect(gridSnap(0.033, 0.02)).toBeCloseTo(0.04, 10);
    expect(gridSnap(0.021, 0.02)).toBeCloseTo(0.02, 10);
  });
});

describe('angleSnap (already plain-value, moved as-is)', () => {
  it('snaps a near-horizontal drag to exactly horizontal at a 90-degree increment', () => {
    const snapped = angleSnap({ x: 0, y: 0 }, { x: 1, y: 0.05 }, 90);
    expect(snapped.y).toBeCloseTo(0, 6);
    expect(snapped.x).toBeCloseTo(Math.hypot(1, 0.05), 6);
  });

  it('preserves the original distance from the fixed point', () => {
    const from = { x: 2, y: 2 };
    const to = { x: 5, y: 2.1 };
    const snapped = angleSnap(from, to, 45);
    const originalDistance = Math.hypot(to.x - from.x, to.y - from.y);
    const snappedDistance = Math.hypot(snapped.x - from.x, snapped.y - from.y);
    expect(snappedDistance).toBeCloseTo(originalDistance, 10);
  });
});

describe('collectSnapPoints', () => {
  it('collects a rect\'s corners and center, excluding the dragged shape', () => {
    const points = collectSnapPoints([rect, line], 'l1');
    expect(points).toHaveLength(5); // 4 corners + center, line excluded
    expect(points).toContainEqual({ x: 0.2, y: 0.3 });
    expect(points).toContainEqual({ x: 0.25, y: 0.325 });
  });

  it('collects a line\'s endpoints and midpoint', () => {
    const points = collectSnapPoints([line], 'unrelated-id');
    expect(points).toContainEqual({ x: 0.1, y: 0.1 });
    expect(points).toContainEqual({ x: 0.4, y: 0.1 });
    expect(points).toContainEqual({ x: 0.25, y: 0.1 });
  });
});

describe('findNearestSnapPoint (already plain-value, moved as-is)', () => {
  const candidates = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }];

  it('returns the closest candidate within threshold', () => {
    const nearest = findNearestSnapPoint({ x: 0.21, y: 0.2 }, candidates, WIDTH_PX, HEIGHT_PX, 20);
    expect(nearest).toEqual({ x: 0.2, y: 0.2 });
  });

  it('returns null when nothing is within threshold', () => {
    const nearest = findNearestSnapPoint({ x: 0.5, y: 0.5 }, candidates, WIDTH_PX, HEIGHT_PX, 5);
    expect(nearest).toBeNull();
  });
});
