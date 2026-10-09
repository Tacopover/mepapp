import { describe, expect, it } from 'vitest';
import { computeRoomValues, manualRoom, resolveCeilingHeight, roomMinBoundingRect, roomPeople, roomPerimeterM, roomVolumeM3, updateRoom, type Room } from './index.js';
import type { Vec2 } from '../geometry.js';

// 1 pt = 25 mm.
const CAL = { pageUnitsPerRealUnit: 0.04 };
const rect = (x: number, y: number, w: number, h: number): Vec2[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const rotate = (ring: Vec2[], deg: number): Vec2[] => {
  const a = (deg * Math.PI) / 180;
  return ring.map((p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));
};
const room = (outer: Vec2[], patch: Partial<Room> = {}): Room => ({ ...manualRoom(0, outer), id: 'room-1', ...patch });

describe('resolveCeilingHeight', () => {
  const ctx = { globalMm: 2700, pdfMm: 3000, roomTypeMm: { toilet: 2400 } };

  it('takes the room value first', () => {
    expect(resolveCeilingHeight({ ceilingHeightMm: 2500, roomTypeId: 'toilet' }, ctx)).toEqual({ mm: 2500, level: 'room' });
  });

  it('then the room type value of the drawing', () => {
    expect(resolveCeilingHeight({ roomTypeId: 'toilet' }, ctx)).toEqual({ mm: 2400, level: 'roomType' });
  });

  it('then the drawing value, for a type without a height or a room without a type', () => {
    expect(resolveCeilingHeight({ roomTypeId: 'office' }, ctx)).toEqual({ mm: 3000, level: 'pdf' });
    expect(resolveCeilingHeight({}, ctx)).toEqual({ mm: 3000, level: 'pdf' });
  });

  it('then the global value', () => {
    expect(resolveCeilingHeight({ roomTypeId: 'toilet' }, { globalMm: 2700 })).toEqual({ mm: 2700, level: 'global' });
  });

  it('skips a value that is not a positive number', () => {
    expect(resolveCeilingHeight({ ceilingHeightMm: 0, roomTypeId: 'toilet' }, { globalMm: 2700, pdfMm: Number.NaN, roomTypeMm: { toilet: -1 } })).toEqual({ mm: 2700, level: 'global' });
  });
});

describe('roomPerimeterM', () => {
  it('adds the outer ring and the holes', () => {
    // 200 x 100 pt = 5 x 2.5 m (15 m), hole 40 x 40 pt = 1 x 1 m (4 m).
    const r = room(rect(0, 0, 200, 100));
    expect(roomPerimeterM(r, CAL)).toBeCloseTo(15);
    expect(roomPerimeterM({ polygon: { outer: r.polygon.outer, holes: [rect(50, 30, 40, 40)] } }, CAL)).toBeCloseTo(19);
  });
});

describe('roomMinBoundingRect', () => {
  it('gives length, width and axis of an axis-aligned room', () => {
    const r = roomMinBoundingRect(room(rect(10, 20, 100, 300)))!;
    expect(r.lengthPt).toBeCloseTo(300);
    expect(r.widthPt).toBeCloseTo(100);
    expect(r.angleDeg).toBeCloseTo(90);
    expect(r.center.x).toBeCloseTo(60);
    expect(r.center.y).toBeCloseTo(170);
  });

  it('follows a rotated room', () => {
    for (const deg of [30, 120, 165]) {
      const r = roomMinBoundingRect(room(rotate(rect(0, 0, 400, 100), deg)))!;
      expect(r.lengthPt).toBeCloseTo(400);
      expect(r.widthPt).toBeCloseTo(100);
      expect(r.angleDeg).toBeCloseTo(deg);
    }
  });

  it('gives an angle of 0, not 180, for a room along +x', () => {
    const r = roomMinBoundingRect(room(rotate(rect(0, 0, 400, 100), 180)))!;
    expect(r.angleDeg).toBeCloseTo(0);
  });

  it('puts an L-shaped room in its smallest rectangle', () => {
    const l: Vec2[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    const r = roomMinBoundingRect(room(l))!;
    expect(r.lengthPt * r.widthPt).toBeCloseTo(300 * 200);
    expect(r.corners).toHaveLength(4);
  });

  it('is null for a degenerate polygon', () => {
    expect(roomMinBoundingRect(room([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]))).toBeNull();
  });
});

describe('roomPeople', () => {
  it('uses the room value, also 0', () => {
    expect(roomPeople({ people: 0 }, 50, { areaPerPersonM2: 10 })).toEqual({ count: 0, source: 'room' });
  });

  it('divides the area by the area per person and rounds up', () => {
    expect(roomPeople({}, 20, { areaPerPersonM2: 10 })).toEqual({ count: 2, source: 'roomType' });
    expect(roomPeople({}, 20.0000000001, { areaPerPersonM2: 10 })).toEqual({ count: 2, source: 'roomType' });
    expect(roomPeople({}, 21, { areaPerPersonM2: 10 })).toEqual({ count: 3, source: 'roomType' });
  });

  it('is null without a type value or without an area', () => {
    expect(roomPeople({}, 20, undefined)).toBeNull();
    expect(roomPeople({}, 20, {})).toBeNull();
    expect(roomPeople({}, null, { areaPerPersonM2: 10 })).toBeNull();
  });
});

describe('computeRoomValues', () => {
  it('gives every value of a calibrated room', () => {
    // 200 x 100 pt = 5 x 2.5 m = 12.5 m².
    const v = computeRoomValues(room(rect(0, 0, 200, 100), { roomTypeId: 'office' }), CAL, { globalMm: 2700, roomTypeMm: { office: 3000 } }, { id: 'office', name: 'Office', keywords: [], areaPerPersonM2: 5 });
    expect(v.areaM2).toBeCloseTo(12.5);
    expect(v.perimeterM).toBeCloseTo(15);
    expect(v.lengthM).toBeCloseTo(5);
    expect(v.widthM).toBeCloseTo(2.5);
    expect(v.axisDeg).toBeCloseTo(0);
    expect(v.ceilingHeight).toEqual({ mm: 3000, level: 'roomType' });
    expect(v.volumeM3).toBeCloseTo(37.5);
    expect(v.people).toEqual({ count: 3, source: 'roomType' });
  });

  it('leaves the scale values empty without a calibration, but keeps the height', () => {
    const v = computeRoomValues(room(rect(0, 0, 200, 100), { people: 4 }), null, { globalMm: 2700 }, undefined);
    expect([v.areaM2, v.perimeterM, v.lengthM, v.widthM, v.volumeM3]).toEqual([null, null, null, null, null]);
    expect(v.ceilingHeight).toEqual({ mm: 2700, level: 'global' });
    expect(v.people).toEqual({ count: 4, source: 'room' });
  });

  it('computes the volume from area and height', () => {
    expect(roomVolumeM3(10, 2500)).toBeCloseTo(25);
  });
});

describe('updateRoom with room values', () => {
  it('locks the room for a ceiling height or a number of people', () => {
    const before = { ...room(rect(0, 0, 10, 10)), locked: false, source: 'detected' as const };
    expect(updateRoom(before, { ceilingHeightMm: 2400 }).locked).toBe(true);
    expect(updateRoom(before, { people: 2 }).locked).toBe(true);
  });

  it('removes the value when the patch gives undefined', () => {
    const after = updateRoom(room(rect(0, 0, 10, 10), { ceilingHeightMm: 2400, people: 2 }), { ceilingHeightMm: undefined, people: undefined });
    expect('ceilingHeightMm' in after).toBe(false);
    expect('people' in after).toBe(false);
  });
});
