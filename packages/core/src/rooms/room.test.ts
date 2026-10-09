import { describe, expect, it } from 'vitest';
import {
  manualRoom,
  mergeDetectedRooms,
  polygonAreaPt2,
  roomAreaM2,
  roomBounds,
  roomContainsPoint,
  roomFromFill,
  roomLabelPoint,
  roomsAtPoint,
  translateRoom,
  updateRoom,
  type Room,
  type RoomFillResult,
  type RoomInput,
} from './index.js';
import { loadProject, serializeProject } from '../project.js';

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

const inputRoom = (x: number, y: number, s: number, extra: Partial<RoomInput> = {}): RoomInput => ({
  pageIndex: 0,
  polygon: { outer: square(x, y, s), holes: [] },
  name: null,
  number: null,
  source: 'detected',
  locked: false,
  open: false,
  ...extra,
});
const withId = (r: RoomInput, id: string): Room => ({ ...r, id });

describe('room geometry', () => {
  it('computes the area with holes subtracted', () => {
    expect(polygonAreaPt2({ outer: square(0, 0, 10), holes: [square(2, 2, 2)] })).toBeCloseTo(96, 9);
    expect(polygonAreaPt2({ outer: square(0, 0, 10).reverse(), holes: [] })).toBeCloseTo(100, 9); // orientation does not matter
  });

  it('converts the area to m2 with the calibration (points per mm)', () => {
    // 200 pt = 5000 mm at 0.04 pt/mm: a 200 x 200 pt square is 5 m x 5 m.
    const room = withId(inputRoom(0, 0, 200), 'r');
    expect(roomAreaM2(room, { pageUnitsPerRealUnit: 0.04 })).toBeCloseTo(25, 9);
  });

  it('tests points against the outer ring and the holes', () => {
    const room = { polygon: { outer: square(0, 0, 10), holes: [square(4, 4, 2)] } };
    expect(roomContainsPoint(room, { x: 1, y: 1 })).toBe(true);
    expect(roomContainsPoint(room, { x: 5, y: 5 })).toBe(false);
    expect(roomContainsPoint(room, { x: 11, y: 5 })).toBe(false);
  });

  it('gives the bounds', () => {
    expect(roomBounds({ polygon: { outer: square(3, 4, 5), holes: [] } })).toEqual({ minX: 3, minY: 4, maxX: 8, maxY: 9 });
  });

  it('gives a label point inside a concave (L-shaped) room even when the centroid lies outside', () => {
    // A thin U: the centroid falls in the notch.
    const outer = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 24, y: 30 },
      { x: 24, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 30 },
      { x: 0, y: 30 },
    ];
    const room = { polygon: { outer, holes: [] } };
    expect(roomContainsPoint(room, roomLabelPoint(room))).toBe(true);
  });

  it('returns the smallest room first for a point in nested rooms on one page', () => {
    const big = withId(inputRoom(0, 0, 100), 'big');
    const small = withId(inputRoom(40, 40, 10), 'small');
    const other = withId(inputRoom(40, 40, 10, { pageIndex: 1 }), 'other');
    expect(roomsAtPoint([big, small, other], { x: 45, y: 45 }, 0).map((r) => r.id)).toEqual(['small', 'big']);
    expect(roomsAtPoint([big, small, other], { x: 45, y: 45 }, 1).map((r) => r.id)).toEqual(['other']);
  });

  it('translates a room and locks it', () => {
    const moved = translateRoom(withId(inputRoom(0, 0, 10), 'r'), 5, -2);
    expect(moved.polygon.outer[0]).toEqual({ x: 5, y: -2 });
    expect(moved.locked).toBe(true);
  });
});

describe('room creation and editing', () => {
  const fill: RoomFillResult = {
    polygon: { outer: square(0, 0, 10), holes: [] },
    areaM2: 1,
    pixelAreaM2: 1,
    seedPt: { x: 5, y: 5 },
    flags: { touchesRoiBorder: false, open: true, fillEmpty: false },
  };

  it('makes an unlocked room from a fill result, copying the polygon and the open flag', () => {
    const r = roomFromFill(fill, 2, 'click');
    expect(r).toMatchObject({ pageIndex: 2, source: 'click', locked: false, open: true, name: null, number: null });
    r.polygon.outer[0]!.x = 99;
    expect(fill.polygon.outer[0]!.x).toBe(0);
  });

  it('makes a manual room locked', () => {
    expect(manualRoom(0, square(0, 0, 4))).toMatchObject({ source: 'manual', locked: true });
  });

  it('locks a room when the name, number or polygon changes, and not for the open flag', () => {
    const r = withId(inputRoom(0, 0, 10), 'r');
    expect(updateRoom(r, { name: 'Office' }).locked).toBe(true);
    expect(updateRoom(r, { number: '1.02' }).locked).toBe(true);
    expect(updateRoom(r, { polygon: { outer: square(0, 0, 5), holes: [] } }).locked).toBe(true);
    expect(updateRoom(r, { open: true }).locked).toBe(false);
    expect(updateRoom(updateRoom(r, { name: 'A' }), { open: false }).locked).toBe(true);
  });

  it('locks a room for a room type the user chose, not for a matched one, and removes a field set to undefined', () => {
    const r = withId(inputRoom(0, 0, 10), 'r');
    expect(updateRoom(r, { roomTypeId: 'toilet', roomTypeSource: 'matched' }).locked).toBe(false);
    const chosen = updateRoom(r, { roomTypeId: 'toilet', roomTypeSource: 'user' });
    expect(chosen.locked).toBe(true);
    const none = updateRoom(chosen, { roomTypeId: undefined });
    expect('roomTypeId' in none).toBe(false);
    expect(none.roomTypeSource).toBe('user');
  });
});

describe('mergeDetectedRooms', () => {
  let n = 100;
  const newId = (): string => `room-${n++}`;

  it('replaces unlocked detected rooms of the page and keeps the rest', () => {
    const oldDetected = withId(inputRoom(0, 0, 50), 'old');
    const named = withId(inputRoom(200, 0, 50, { name: 'Hall', locked: true }), 'named');
    const manual = withId(manualRoom(0, square(400, 0, 50)), 'manual');
    const click = withId(inputRoom(600, 0, 50, { source: 'click' }), 'click');
    const otherPage = withId(inputRoom(0, 0, 50, { pageIndex: 3 }), 'other');
    const plan = mergeDetectedRooms([oldDetected, named, manual, click, otherPage], [inputRoom(0, 0, 52)], 0, newId);
    expect(plan.remove.sort()).toEqual(['old']);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.id).toBe('room-100');
  });

  it('drops a new detected room that lies inside a kept room', () => {
    const named = withId(inputRoom(0, 0, 100, { name: 'Hall', locked: true }), 'named');
    const plan = mergeDetectedRooms([named], [inputRoom(10, 10, 20), inputRoom(300, 0, 50)], 0, newId);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.polygon.outer[0]).toEqual({ x: 300, y: 0 });
  });

  it('ignores detected rooms for another page', () => {
    const plan = mergeDetectedRooms([], [inputRoom(0, 0, 10, { pageIndex: 1 })], 0, newId);
    expect(plan.add).toEqual([]);
  });
});

describe('room save format', () => {
  it('round-trips rooms through serializeProject and loadProject', () => {
    const room = withId(inputRoom(0, 0, 10, { name: 'WC', number: '0.03', locked: true, labelAreaM2: 3.2 }), 'room-1');
    const empty = { networkTypes: [], segments: [], fittings: [], stamps: [], portGroups: [], annotations: [], customStampDefinitions: [], terminalCapacities: {}, circuits: [], panels: [], panelSections: [], circuitTypes: [], stampLabelLayouts: {}, schematics: [], schematicProjectFields: {}, calibrations: {}, roomTypes: [], roomTypeCeilingHeightsMm: {} };
    const loaded = loadProject(JSON.parse(JSON.stringify(serializeProject({ ...empty, rooms: [room] }))));
    expect(loaded.rooms).toEqual([room]);
  });

  it('loads a version 12 save with no rooms', () => {
    const v12 = { schemaVersion: 12, networkTypes: [], segments: [], fittings: [], stamps: [], portGroups: [], annotations: [], customStampDefinitions: [], terminalCapacities: {}, circuits: [], panels: [], panelSections: [], circuitTypes: [], stampLabelLayouts: {}, schematics: [], schematicProjectFields: {} };
    expect(loadProject(v12).rooms).toEqual([]);
  });
});
