import { describe, expect, it } from 'vitest';
import {
  computeRouteArea,
  DEFAULT_MAX_WALL_MM,
  DEFAULT_MIN_WALL_RUN_MM,
  DEFAULT_ROUTE_AREA_TYPE_IDS,
  DEFAULT_SKELETON_PIXEL_MM,
  SHAFT_ROOM_TYPE_ID,
  selectRouteAreaRooms,
} from './route-area.js';
import type { Room } from './rooms/room.js';

function room(id: string, pageIndex: number, roomTypeId?: string, open = false): Room {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  return {
    id,
    pageIndex,
    polygon: { outer: square, holes: [] },
    name: null,
    number: null,
    source: 'detected',
    locked: false,
    open,
    ...(roomTypeId === undefined ? {} : { roomTypeId }),
  };
}

const OPTIONS = { roomTypeIds: ['corridor', 'shaft', 'office'], pageIndex: 0 };

describe('route area defaults', () => {
  it('uses the corridor and shaft types and the default distances', () => {
    expect(DEFAULT_ROUTE_AREA_TYPE_IDS).toEqual(['corridor', 'shaft']);
    expect(SHAFT_ROOM_TYPE_ID).toBe('shaft');
    expect(DEFAULT_MAX_WALL_MM).toBe(600);
    expect(DEFAULT_MIN_WALL_RUN_MM).toBe(500);
    expect(DEFAULT_SKELETON_PIXEL_MM).toBe(100);
  });
});

describe('selectRouteAreaRooms', () => {
  it('keeps rooms of the page with a listed type and sets the kind by type', () => {
    const rooms = [room('a', 0, 'corridor'), room('b', 0, 'shaft', true), room('c', 0, 'office')];
    expect(selectRouteAreaRooms(rooms, OPTIONS)).toEqual([
      { roomId: 'a', kind: 'path', typeId: 'corridor', open: false, name: null },
      { roomId: 'b', kind: 'shaft', typeId: 'shaft', open: true, name: null },
      { roomId: 'c', kind: 'path', typeId: 'office', open: false, name: null },
    ]);
  });

  it('leaves out a room of another page', () => {
    const rooms = [room('a', 1, 'corridor')];
    expect(selectRouteAreaRooms(rooms, OPTIONS)).toEqual([]);
  });

  it('leaves out a room with no room type', () => {
    const rooms = [room('a', 0)];
    expect(selectRouteAreaRooms(rooms, OPTIONS)).toEqual([]);
  });

  it('keeps the order of the input', () => {
    const rooms = [room('z', 0, 'office'), room('m', 0, 'corridor'), room('a', 0, 'shaft')];
    const ids = selectRouteAreaRooms(rooms, OPTIONS).map((r) => r.roomId);
    expect(ids).toEqual(['z', 'm', 'a']);
  });

  it('changes nothing for a listed id that no room has', () => {
    const rooms = [room('a', 0, 'corridor')];
    const withExtra = selectRouteAreaRooms(rooms, { roomTypeIds: ['corridor', 'hall'], pageIndex: 0 });
    expect(withExtra).toEqual(selectRouteAreaRooms(rooms, { roomTypeIds: ['corridor'], pageIndex: 0 }));
  });

  it('gives an empty result for an empty list', () => {
    const rooms = [room('a', 0, 'corridor')];
    expect(selectRouteAreaRooms(rooms, { roomTypeIds: [], pageIndex: 0 })).toEqual([]);
  });

  it('does not change its input', () => {
    const rooms = [room('a', 0, 'corridor'), room('b', 0, 'shaft')];
    const before = structuredClone(rooms);
    selectRouteAreaRooms(rooms, OPTIONS);
    expect(rooms).toEqual(before);
  });
});

describe('computeRouteArea stub', () => {
  const rooms = [room('a', 0, 'corridor'), room('b', 0, 'office')];

  it('gives no-calibration when the page has no scale', () => {
    expect(computeRouteArea(rooms, { ...OPTIONS, mmPerPt: null }).status).toBe('no-calibration');
  });

  it('gives no-rooms when the page has no room', () => {
    expect(computeRouteArea([room('a', 1, 'corridor')], { ...OPTIONS, mmPerPt: 0.5 }).status).toBe('no-rooms');
  });

  it('gives no-types when the type list is empty', () => {
    expect(computeRouteArea(rooms, { ...OPTIONS, roomTypeIds: [], mmPerPt: 0.5 }).status).toBe('no-types');
  });

  it('gives no-route-rooms when no room has a listed type', () => {
    expect(computeRouteArea([room('b', 0, 'office')], { roomTypeIds: ['corridor'], pageIndex: 0, mmPerPt: 0.5 }).status).toBe(
      'no-route-rooms',
    );
  });

  it('gives ok with the rooms filled and the other lists empty', () => {
    const area = computeRouteArea(rooms, { ...OPTIONS, mmPerPt: 0.5 });
    expect(area.status).toBe('ok');
    expect(area.rooms).toEqual(selectRouteAreaRooms(rooms, OPTIONS));
    expect(area.nodes).toEqual([]);
    expect(area.edges).toEqual([]);
    expect(area.entries).toEqual([]);
    expect(area.links).toEqual([]);
    expect(area.unreached).toEqual([]);
    expect(area.parts).toBe(0);
  });

  it('does not change its input', () => {
    const before = structuredClone(rooms);
    computeRouteArea(rooms, { ...OPTIONS, mmPerPt: 0.5 });
    expect(rooms).toEqual(before);
  });
});
