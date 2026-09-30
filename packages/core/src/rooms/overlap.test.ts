import { describe, expect, it } from 'vitest';
import { overlapAreaPt2, planRoomOverlaps, polygonAreaPt2, polygonContainsPoint, rectPolygon, resolveRoomOverlaps, roomConfidence, splitRectangular, type Room } from './index.js';

const MM_PER_PT = 25; // 40 pt = 1 m
const M = 40;
const toM2 = (pt2: number): number => (pt2 * MM_PER_PT * MM_PER_PT) / 1e6;

describe('splitRectangular', () => {
  it('cuts a rectangular region into rectangles that follow the printed areas', () => {
    const region = rectPolygon(0, 0, 12 * M, 4 * M); // 48 m2
    const targets = [
      { anchor: { x: 2 * M, y: 2 * M }, targetM2: 12 },
      { anchor: { x: 6 * M, y: 2 * M }, targetM2: 24 },
      { anchor: { x: 10.5 * M, y: 2 * M }, targetM2: 12 },
    ];
    const pieces = splitRectangular(region, targets, MM_PER_PT)!;
    expect(pieces).toHaveLength(3);
    pieces.forEach((p, i) => {
      expect(p.outer).toHaveLength(4);
      expect(polygonContainsPoint(p, targets[i]!.anchor)).toBe(true);
      expect(toM2(polygonAreaPt2(p))).toBeCloseTo(targets[i]!.targetM2, 0);
    });
    expect(overlapAreaPt2(pieces[0]!, pieces[1]!)).toBeLessThan(1);
    expect(overlapAreaPt2(pieces[1]!, pieces[2]!)).toBeLessThan(1);
  });

  it('makes a grid of rectangles for labels in two rows and two columns', () => {
    const region = rectPolygon(0, 0, 8 * M, 8 * M);
    const anchors = [
      { x: 2 * M, y: 2 * M },
      { x: 6 * M, y: 2 * M },
      { x: 2 * M, y: 6 * M },
      { x: 6 * M, y: 6 * M },
    ];
    const pieces = splitRectangular(region, anchors.map((anchor) => ({ anchor, targetM2: 16 })), MM_PER_PT)!;
    expect(pieces).toHaveLength(4);
    pieces.forEach((p, i) => {
      expect(p.outer).toHaveLength(4);
      expect(polygonContainsPoint(p, anchors[i]!)).toBe(true);
      expect(toM2(polygonAreaPt2(p))).toBeCloseTo(16, 0);
    });
  });

  it('gives a label without a printed area the rest of the region', () => {
    const region = rectPolygon(0, 0, 10 * M, 4 * M); // 40 m2
    const pieces = splitRectangular(region, [{ anchor: { x: 2 * M, y: 2 * M }, targetM2: 10 }, { anchor: { x: 8 * M, y: 2 * M }, targetM2: null }], MM_PER_PT)!;
    expect(toM2(polygonAreaPt2(pieces[0]!))).toBeCloseTo(10, 0);
    expect(toM2(polygonAreaPt2(pieces[1]!))).toBeCloseTo(30, 0);
  });

  it('needs two labels', () => {
    expect(splitRectangular(rectPolygon(0, 0, 100, 100), [{ anchor: { x: 10, y: 10 }, targetM2: 5 }], MM_PER_PT)).toBeNull();
  });
});

describe('resolveRoomOverlaps', () => {
  const a = rectPolygon(0, 0, 200, 200);
  const b = rectPolygon(100, 0, 300, 200); // overlaps the right half of a

  it('trims the room with the lower priority and leaves no overlap', () => {
    const r = resolveRoomOverlaps(
      [
        { key: 'low', polygon: a, priority: 0.5, existing: false },
        { key: 'high', polygon: b, priority: 0.9, existing: false },
      ],
      MM_PER_PT,
    );
    expect(r.changed).toEqual(['low']);
    expect(polygonAreaPt2(r.polygons.get('low')!)).toBeCloseTo(100 * 200, 0);
    expect(polygonAreaPt2(r.polygons.get('high')!)).toBeCloseTo(200 * 200, 0);
    expect(overlapAreaPt2(r.polygons.get('low')!, r.polygons.get('high')!)).toBeLessThan(1);
  });

  it('cuts a hole in the larger room for a room that lies inside it', () => {
    const inner = rectPolygon(20, 20, 180, 180);
    const r = resolveRoomOverlaps(
      [
        { key: 'inner', polygon: inner, priority: 0.5, existing: false },
        { key: 'outer', polygon: a, priority: 0.9, existing: false },
      ],
      MM_PER_PT,
    );
    expect(r.dropped).toEqual([]);
    expect(r.polygons.get('inner')).toBe(inner);
    expect(r.polygons.get('outer')!.holes).toHaveLength(1);
    expect(polygonAreaPt2(r.polygons.get('outer')!)).toBeCloseTo(200 * 200 - 160 * 160, 0);
  });

  it('drops a room that copies a room of the same size, or lies inside a locked room', () => {
    const copy = resolveRoomOverlaps(
      [
        { key: 'first', polygon: a, priority: 0.9, existing: false },
        { key: 'copy', polygon: rectPolygon(0, 0, 200, 200), priority: 0.8, existing: false },
      ],
      MM_PER_PT,
    );
    expect(copy.dropped).toEqual(['copy']);
    const locked = resolveRoomOverlaps(
      [
        { key: 'inner', polygon: rectPolygon(20, 20, 180, 180), priority: 0.9, existing: false },
        { key: 'locked', polygon: a, priority: 2, existing: true },
      ],
      MM_PER_PT,
    );
    expect(locked.dropped).toEqual(['inner']);
    expect(locked.polygons.get('locked')).toBe(a);
  });

  it('lets an existing room keep its area when the newcomer would take most of it', () => {
    const near = rectPolygon(20, 0, 300, 200); // covers 90 % of a
    const r = resolveRoomOverlaps(
      [
        { key: 'old', polygon: a, priority: 0.5, existing: true },
        { key: 'new', polygon: near, priority: 0.9, existing: false },
      ],
      MM_PER_PT,
    );
    expect(r.polygons.get('old')).toBe(a);
    expect(polygonAreaPt2(r.polygons.get('new')!)).toBeCloseTo(100 * 200, -2);
  });
});

const room = (id: string, polygon: Room['polygon'], extra: Partial<Room> = {}): Room => ({ id, pageIndex: 0, polygon, name: null, number: null, source: 'detected', locked: false, open: false, ...extra });

describe('planRoomOverlaps', () => {
  const a = rectPolygon(0, 0, 200, 200);
  const b = rectPolygon(100, 0, 300, 200);

  it('trims an existing detected room for a more confident newcomer', () => {
    const plan = planRoomOverlaps([room('old', a, { confidence: 0.4 })], [room('new', b, { confidence: 0.95 })], MM_PER_PT);
    expect(plan.update.map((r) => r.id)).toEqual(['old']);
    expect(polygonAreaPt2(plan.update[0]!.polygon)).toBeCloseTo(100 * 200, 0);
    expect(plan.add[0]!.polygon).toBe(b);
  });

  it('never trims a locked room, the newcomer gives way', () => {
    const plan = planRoomOverlaps([room('old', a, { locked: true })], [room('new', b, { confidence: 0.99 })], MM_PER_PT);
    expect(plan.update).toHaveLength(0);
    expect(polygonAreaPt2(plan.add[0]!.polygon)).toBeCloseTo(100 * 200, 0);
  });

  it('trims the newcomer on a tie', () => {
    const plan = planRoomOverlaps([room('old', a, { confidence: 0.7 })], [room('new', b, { confidence: 0.7 })], MM_PER_PT);
    expect(plan.update).toHaveLength(0);
    expect(plan.add[0]!.polygon).not.toBe(b);
  });
});

describe('roomConfidence', () => {
  it('falls with the deviation and is lower without a printed area', () => {
    expect(roomConfidence('detected', 0)).toBeGreaterThan(roomConfidence('detected', 0.3));
    expect(roomConfidence('detected', 0)).toBeGreaterThan(roomConfidence('bounded', 0));
    expect(roomConfidence('detected', null)).toBeLessThan(roomConfidence('detected', 0));
  });
});
