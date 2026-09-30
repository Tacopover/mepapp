import { describe, expect, it } from 'vitest';
import { insertVertex, mergePolygons, moveVertex, moveVertices, nearestEdge, nearestVertex, polygonAreaPt2, removeVertex, removeVertices, splitPolygon, verticesInBox } from './index.js';

const square = (x: number, y: number, s: number) => ({
  outer: [
    { x, y },
    { x: x + s, y },
    { x: x + s, y: y + s },
    { x, y: y + s },
  ],
  holes: [],
});
const area = polygonAreaPt2;

describe('vertex edits', () => {
  const p = square(0, 0, 100);

  it('finds the nearest vertex and edge within a distance', () => {
    expect(nearestVertex(p, { x: 98, y: 3 }, 5)).toEqual({ ring: 0, index: 1 });
    expect(nearestVertex(p, { x: 50, y: 50 }, 5)).toBeNull();
    const edge = nearestEdge(p, { x: 50, y: 3 }, 5)!;
    expect(edge).toMatchObject({ ring: 0, index: 0 });
    expect(edge.point).toEqual({ x: 50, y: 0 });
    expect(nearestEdge(p, { x: 50, y: 50 }, 5)).toBeNull();
  });

  it('moves, inserts and removes a vertex without changing the input', () => {
    const moved = moveVertex(p, { ring: 0, index: 2 }, { x: 150, y: 100 });
    expect(moved.outer[2]).toEqual({ x: 150, y: 100 });
    expect(p.outer[2]).toEqual({ x: 100, y: 100 });
    const inserted = insertVertex(p, 0, 0, { x: 50, y: -10 });
    expect(inserted.outer).toHaveLength(5);
    expect(inserted.outer[1]).toEqual({ x: 50, y: -10 });
    const removed = removeVertex(inserted, { ring: 0, index: 1 })!;
    expect(removed.outer).toEqual(p.outer);
    expect(removeVertex(p, { ring: 0, index: 0 })!.outer).toHaveLength(3);
    expect(removeVertex(removeVertex(p, { ring: 0, index: 0 })!, { ring: 0, index: 0 })).toBeNull();
  });

  it('edits a hole ring', () => {
    const withHole = { outer: p.outer, holes: [square(40, 40, 20).outer] };
    expect(nearestVertex(withHole, { x: 60, y: 40 }, 3)).toEqual({ ring: 1, index: 1 });
    const moved = moveVertex(withHole, { ring: 1, index: 1 }, { x: 70, y: 40 });
    expect(moved.holes[0]![1]).toEqual({ x: 70, y: 40 });
  });
});

describe('multi-vertex edits', () => {
  const p = square(0, 0, 100);
  const withHole = { outer: p.outer, holes: [square(40, 40, 20).outer] };

  it('moves a set of vertices by one delta without changing the input', () => {
    const moved = moveVertices(withHole, [{ ring: 0, index: 1 }, { ring: 0, index: 2 }, { ring: 1, index: 0 }], { x: 10, y: -5 });
    expect(moved.outer).toEqual([{ x: 0, y: 0 }, { x: 110, y: -5 }, { x: 110, y: 95 }, { x: 0, y: 100 }]);
    expect(moved.holes[0]![0]).toEqual({ x: 50, y: 35 });
    expect(moved.holes[0]![1]).toEqual({ x: 60, y: 40 });
    expect(withHole.outer[1]).toEqual({ x: 100, y: 0 });
    expect(moveVertices(p, [{ ring: 0, index: 9 }], { x: 1, y: 1 }).outer).toEqual(p.outer);
  });

  it('finds the vertices in a box, holes included', () => {
    expect(verticesInBox(withHole, { x: 90, y: -5 }, { x: 105, y: 105 })).toEqual([{ ring: 0, index: 1 }, { ring: 0, index: 2 }]);
    expect(verticesInBox(withHole, { x: 35, y: 35 }, { x: 65, y: 65 })).toHaveLength(4);
    expect(verticesInBox(withHole, { x: 10, y: 10 }, { x: 20, y: 20 })).toEqual([]);
  });

  it('removes a set of vertices and keeps at least 3 per ring', () => {
    const six = insertVertex(insertVertex(p, 0, 0, { x: 50, y: -10 }), 0, 2, { x: 110, y: 50 });
    expect(six.outer).toHaveLength(6);
    const removed = removeVertices(six, [{ ring: 0, index: 1 }, { ring: 0, index: 3 }])!;
    expect(removed.outer).toEqual(p.outer);
    expect(removeVertices(p, [{ ring: 0, index: 0 }, { ring: 0, index: 1 }])).toBeNull();
    expect(removeVertices(p, [])).toBeNull();
    expect(removeVertices(withHole, [{ ring: 1, index: 0 }])!.holes[0]).toHaveLength(3);
    expect(removeVertices(withHole, [{ ring: 1, index: 0 }, { ring: 1, index: 2 }])).toBeNull();
    expect(removeVertices(withHole, [{ ring: 0, index: 0 }])!.outer).toHaveLength(3);
  });
});

describe('splitPolygon', () => {
  it('splits a square into two halves', () => {
    const pieces = splitPolygon(square(0, 0, 100), { x: 50, y: -10 }, { x: 50, y: 110 })!;
    expect(pieces).not.toBeNull();
    expect(area(pieces[0]) + area(pieces[1])).toBeCloseTo(10000, 6);
    expect(area(pieces[0])).toBeCloseTo(5000, 6);
  });

  it('works when the cut line is drawn inside the polygon only', () => {
    const pieces = splitPolygon(square(0, 0, 100), { x: 30, y: 25 }, { x: 30, y: 75 })!;
    expect(area(pieces[0]) + area(pieces[1])).toBeCloseTo(10000, 6);
    expect(Math.min(area(pieces[0]), area(pieces[1]))).toBeCloseTo(3000, 6);
  });

  it('returns null when the line misses the polygon', () => {
    expect(splitPolygon(square(0, 0, 100), { x: 200, y: 0 }, { x: 200, y: 100 })).toBeNull();
  });

  it('cuts the chord nearest to the drawn segment in an L shape', () => {
    // L shape: 0..100 wide, 0..40 high at the bottom, 0..40 wide up to 100 high on the left.
    const l = {
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 60 },
        { x: 100, y: 60 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      holes: [],
    };
    // Vertical line x = 70 crosses the L only in its wide top arm (y 60..100).
    const pieces = splitPolygon(l, { x: 70, y: 70 }, { x: 70, y: 90 })!;
    expect(pieces).not.toBeNull();
    expect(area(pieces[0]) + area(pieces[1])).toBeCloseTo(area(l), 6);
  });

  it('gives a hole to the piece that contains it and refuses a cut through a hole', () => {
    const withHole = { outer: square(0, 0, 100).outer, holes: [square(10, 40, 10).outer] };
    const pieces = splitPolygon(withHole, { x: 70, y: -5 }, { x: 70, y: 105 })!;
    const holed = pieces.filter((q) => q.holes.length === 1);
    expect(holed).toHaveLength(1);
    expect(splitPolygon(withHole, { x: 15, y: -5 }, { x: 15, y: 105 })).toBeNull();
  });
});

describe('mergePolygons', () => {
  // 1 pt = 25 mm: a 100 pt square is 2.5 m x 2.5 m.
  const MM_PER_PT = 25;

  it('bridges the wall between two rooms and includes it in the area', () => {
    const a = square(0, 0, 100);
    const b = square(108, 0, 100); // 8 pt = 200 mm wall between
    const merged = mergePolygons(a, b, MM_PER_PT)!;
    expect(merged).not.toBeNull();
    const expected = 100 * 100 * 2 + 8 * 100;
    expect(area(merged) / expected).toBeGreaterThan(0.97);
    expect(area(merged) / expected).toBeLessThan(1.03);
    expect(merged.holes).toHaveLength(0);
  });

  it('returns null for two rooms that are too far apart', () => {
    expect(mergePolygons(square(0, 0, 100), square(400, 0, 100), MM_PER_PT)).toBeNull();
  });

  it('keeps a hole that lies inside both rooms', () => {
    const a = { outer: square(0, 0, 100).outer, holes: [square(35, 35, 30).outer] };
    const merged = mergePolygons(a, square(104, 0, 100), MM_PER_PT)!;
    expect(merged.holes).toHaveLength(1);
  });
});
