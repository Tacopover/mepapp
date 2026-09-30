import { describe, expect, it } from 'vitest';
import { detectLabelledRooms, overlapAreaPt2, polygonAreaPt2, resolveRoomAt, splitByTargets, wallComponents, type FilteredWalls } from './index.js';

const MM_PER_PT = 25; // 1 pt = 25 mm: 40 pt = 1 m
const M = 40; // points per metre
const toM2 = (pt2: number) => (pt2 * MM_PER_PT * MM_PER_PT) / 1e6;

type Line = [number, number, number, number];
function walls(lines: Line[], bounds: [number, number, number, number]): FilteredWalls {
  const segments = new Float64Array(lines.length * 8);
  lines.forEach((l, i) => segments.set([l[0], l[1], l[2], l[3], 0.5, 0, 0, i], i * 8));
  return { walls: { segments, segmentCount: lines.length, bounds }, keep: new Uint8Array(lines.length).fill(1) };
}
const rect = (x: number, y: number, w: number, h: number): Line[] => [
  [x, y, x + w, y],
  [x + w, y, x + w, y + h],
  [x + w, y + h, x, y + h],
  [x, y + h, x, y],
];

describe('wallComponents', () => {
  it('groups connected lines and keeps separate loops apart', () => {
    const w = walls([...rect(0, 0, 200, 200), ...rect(50, 50, 40, 20)], [0, 0, 300, 300]);
    const c = wallComponents(w, 1);
    expect(c.count).toBe(2);
    expect(c.comp[0]).toBe(c.comp[3]);
    expect(c.comp[0]).not.toBe(c.comp[4]);
  });
});

describe('resolveRoomAt', () => {
  it('returns the plain fill when its area matches the printed area', () => {
    const w = walls(rect(0, 0, 6 * M, 6 * M), [-40, -40, 300, 300]);
    const r = resolveRoomAt(w, { x: 60, y: 60 }, 36, MM_PER_PT);
    expect(r.method).toBe('direct');
    expect(Math.abs(r.deviation!)).toBeLessThan(0.15);
  });

  it('dissolves a free-standing table when the label lies inside it', () => {
    // Room 6 m x 6 m with a 3 m x 1.5 m table in the middle; the label lies in the table.
    const w = walls([...rect(0, 0, 6 * M, 6 * M), ...rect(60, 90, 3 * M, 1.5 * M)], [-40, -40, 300, 300]);
    const seed = { x: 120, y: 120 };
    const direct = resolveRoomAt(w, seed, null, MM_PER_PT);
    expect(direct.fill.areaM2).toBeLessThan(6);
    const r = resolveRoomAt(w, seed, 36, MM_PER_PT);
    expect(r.method).toBe('dissolved');
    expect(r.dissolvedComponents).toBe(1);
    expect(Math.abs(r.deviation!)).toBeLessThan(0.15);
  });

  it('stops at the printed area when the room is open to a much larger space', () => {
    // A 5 m x 5 m room whose right wall has a 3 m opening into a 20 m x 20 m hall.
    const room: Line[] = [
      [0, 0, 200, 0],
      [200, 0, 200, 40],
      [200, 160, 200, 200],
      [200, 200, 0, 200],
      [0, 200, 0, 0],
    ];
    const hall: Line[] = [
      [200, -300, 1000, -300],
      [1000, -300, 1000, 500],
      [1000, 500, 200, 500],
      [200, 500, 200, 200],
      [200, 0, 200, -300],
    ];
    const w = walls([...room, ...hall], [-40, -340, 1040, 540]);
    const r = resolveRoomAt(w, { x: 100, y: 100 }, 25, MM_PER_PT);
    expect(r.method).toBe('bounded');
    expect(Math.abs(r.deviation!)).toBeLessThan(0.25);
  });
});

describe('splitByTargets', () => {
  const square = { outer: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 200 }, { x: 0, y: 200 }], holes: [] }; // 8 m x 5 m = 40 m2

  it('divides a region among labels by their wanted areas', () => {
    const pieces = splitByTargets(square, [{ anchor: { x: 30, y: 100 }, targetM2: 10 }, { anchor: { x: 290, y: 100 }, targetM2: 30 }], MM_PER_PT)!;
    expect(pieces).toHaveLength(2);
    const a = toM2(polygonAreaPt2(pieces[0]!));
    const b = toM2(polygonAreaPt2(pieces[1]!));
    expect(a + b).toBeCloseTo(40, 0);
    expect(b / a).toBeGreaterThan(2.4);
    expect(b / a).toBeLessThan(3.6);
  });

  it('needs at least two labels', () => {
    expect(splitByTargets(square, [{ anchor: { x: 10, y: 10 }, targetM2: 5 }], MM_PER_PT)).toBeNull();
  });
});

describe('detectLabelledRooms', () => {
  it('places one room per label and drops regions without a label', () => {
    // Two closed rooms side by side, only the left one has a label.
    const w = walls([...rect(0, 0, 6 * M, 6 * M), ...rect(6 * M + 8, 0, 6 * M, 6 * M)], [-40, -40, 600, 300]);
    const r = detectLabelledRooms(w, [{ anchor: { x: 100, y: 100 }, printedM2: 36 }], MM_PER_PT);
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0]!.target).toBe(0);
    expect(Math.abs(r.rooms[0]!.deviation!)).toBeLessThan(0.15);
  });

  it('splits a region that holds two labels whose printed areas add up to its area', () => {
    const w = walls(rect(0, 0, 8 * M, 5 * M), [-40, -40, 400, 300]); // 40 m2, no wall between the labels
    const r = detectLabelledRooms(w, [{ anchor: { x: 50, y: 100 }, printedM2: 10 }, { anchor: { x: 270, y: 100 }, printedM2: 30 }], MM_PER_PT);
    expect(r.rooms).toHaveLength(2);
    expect(r.rooms.every((x) => x.method === 'split')).toBe(true);
    expect(r.rooms[1]!.areaM2 / r.rooms[0]!.areaM2).toBeGreaterThan(2.2);
  });

  it('gives a room that is open to a hall an outline of axis-parallel edges', () => {
    const room: Line[] = [
      [0, 0, 200, 0],
      [200, 0, 200, 40],
      [200, 160, 200, 200],
      [200, 200, 0, 200],
      [0, 200, 0, 0],
    ];
    const hall: Line[] = [
      [200, -300, 1000, -300],
      [1000, -300, 1000, 500],
      [1000, 500, 200, 500],
      [200, 500, 200, 200],
      [200, 0, 200, -300],
    ];
    const w = walls([...room, ...hall], [-40, -340, 1040, 540]);
    const r = detectLabelledRooms(w, [{ anchor: { x: 100, y: 100 }, printedM2: 25 }], MM_PER_PT);
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0]!.method).toBe('bounded');
    const o = r.rooms[0]!.polygon.outer;
    for (let i = 0; i < o.length; i++) {
      const a = o[i]!;
      const b = o[(i + 1) % o.length]!;
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6);
    }
  });

  it('cuts three labels in one closed room into rectangles that do not overlap', () => {
    const w = walls(rect(0, 0, 12 * M, 4 * M), [-40, -40, 600, 300]); // 48 m2, no walls between the labels
    const targets = [
      { anchor: { x: 2 * M, y: 2 * M }, printedM2: 12 },
      { anchor: { x: 6 * M, y: 2 * M }, printedM2: 24 },
      { anchor: { x: 10.5 * M, y: 2 * M }, printedM2: 12 },
    ];
    const r = detectLabelledRooms(w, targets, MM_PER_PT);
    expect(r.rooms).toHaveLength(3);
    for (const room of r.rooms) {
      expect(room.method).toBe('split');
      expect(room.polygon.outer).toHaveLength(4);
      expect(Math.abs(room.deviation!)).toBeLessThan(0.1);
      expect(room.confidence).toBeGreaterThan(0.5);
    }
    expect(overlapAreaPt2(r.rooms[0]!.polygon, r.rooms[1]!.polygon)).toBeLessThan(1);
    expect(overlapAreaPt2(r.rooms[1]!.polygon, r.rooms[2]!.polygon)).toBeLessThan(1);
  });

  it('reports a label that lies where no free space exists', () => {
    const w = walls(rect(0, 0, 6 * M, 6 * M), [-40, -40, 300, 300]);
    const r = detectLabelledRooms(w, [{ anchor: { x: 100, y: 100 }, printedM2: 36 }, { anchor: { x: 5000, y: 5000 }, printedM2: null }], MM_PER_PT);
    expect(r.rooms.map((x) => x.target)).toContain(0);
    expect(r.missing.length + r.rooms.length).toBe(2);
  });
});
