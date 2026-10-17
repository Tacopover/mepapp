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
import { centerLineOf } from './route-skeleton.js';
import { roomLabelPoint, type Room } from './rooms/room.js';

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

function rect(id: string, x0: number, y0: number, x1: number, y1: number, typeId?: string): Room {
  return {
    ...room(id, 0, typeId),
    polygon: {
      outer: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      holes: [],
    },
  };
}

const ROUTE_OPTIONS = { roomTypeIds: ['corridor', 'shaft'], pageIndex: 0, mmPerPt: 1 };

describe('computeRouteArea', () => {
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

  it('gives no-rooms for an empty room list', () => {
    expect(computeRouteArea([], ROUTE_OPTIONS).status).toBe('no-rooms');
  });

  it('gives no-route-rooms when a listed id matches no room type', () => {
    const area = computeRouteArea([rect('a', 0, 0, 10000, 2000, 'corridor')], { ...ROUTE_OPTIONS, roomTypeIds: ['hall'] });
    expect(area.status).toBe('no-route-rooms');
  });

  it('builds a 10 m corridor as two end nodes and one center edge', () => {
    const area = computeRouteArea([rect('c', 0, 0, 10000, 2000, 'corridor')], ROUTE_OPTIONS);
    expect(area.status).toBe('ok');
    expect(area.nodes.map((n) => n.kind)).toEqual(['end', 'end']);
    expect(area.edges).toHaveLength(1);
    expect(area.edges[0]!.kind).toBe('center');
    expect(area.edges[0]!.roomId).toBe('c');
    expect(area.edges[0]!.lengthMm).toBeGreaterThan(7000);
    expect(area.edges[0]!.lengthMm).toBeLessThan(10000);
    expect(area.parts).toBe(1);
    expect(area.entries).toEqual([]);
    expect(area.links).toEqual([]);
    expect(area.unreached).toEqual([]);
  });

  it('builds a T-shaped corridor with three end nodes and one junction', () => {
    const tShape: Room = {
      ...room('t', 0, 'corridor'),
      polygon: {
        outer: [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 2000 },
          { x: 6000, y: 2000 },
          { x: 6000, y: 8000 },
          { x: 4000, y: 8000 },
          { x: 4000, y: 2000 },
          { x: 0, y: 2000 },
        ],
        holes: [],
      },
    };
    const area = computeRouteArea([tShape], ROUTE_OPTIONS);
    expect(area.nodes.map((n) => n.kind).sort()).toEqual(['end', 'end', 'end', 'junction']);
  });

  it('builds a shaft room as one shaft node at its label point, with no edge', () => {
    const shaft = rect('s', 0, 0, 2000, 2000, 'shaft');
    const area = computeRouteArea([shaft], ROUTE_OPTIONS);
    expect(area.nodes).toEqual([{ id: 'rn-s-0', point: roomLabelPoint(shaft), kind: 'shaft', roomId: 's' }]);
    expect(area.edges).toEqual([]);
    expect(area.parts).toBe(1);
  });

  it('builds a path room of 200 mm as one end node at its label point, with no edge', () => {
    const narrow = rect('n', 0, 0, 10000, 200, 'corridor');
    const area = computeRouteArea([narrow], ROUTE_OPTIONS);
    expect(area.nodes).toEqual([{ id: 'rn-n-0', point: roomLabelPoint(narrow), kind: 'end', roomId: 'n' }]);
    expect(area.edges).toEqual([]);
    expect(area.parts).toBe(1);
  });

  it('gives a path room of 250 mm one end node at its label point, through the fallback', () => {
    const narrow = rect('n', 0, 0, 10000, 250, 'corridor');
    expect(centerLineOf(narrow.polygon, 1).nodes).toHaveLength(0);
    const area = computeRouteArea([narrow], ROUTE_OPTIONS);
    expect(area.status).toBe('ok');
    expect(area.nodes).toEqual([{ id: 'rn-n-0', point: roomLabelPoint(narrow), kind: 'end', roomId: 'n' }]);
    expect(area.edges).toEqual([]);
  });

  it('counts two far corridors as two parts', () => {
    const rooms2 = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('b', 50000, 0, 60000, 2000, 'corridor')];
    expect(computeRouteArea(rooms2, ROUTE_OPTIONS).parts).toBe(2);
  });

  it('copies the open flag and the name of each route-area room', () => {
    const named: Room = { ...rect('a', 0, 0, 10000, 2000, 'corridor'), open: true, name: 'Gang' };
    const area = computeRouteArea([named], ROUTE_OPTIONS);
    expect(area.rooms).toEqual([{ roomId: 'a', kind: 'path', typeId: 'corridor', open: true, name: 'Gang' }]);
  });

  it('gives the same result for the same input, with unique node and edge ids', () => {
    const input = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('s', 20000, 0, 22000, 2000, 'shaft')];
    const first = computeRouteArea(input, ROUTE_OPTIONS);
    const second = computeRouteArea(input, ROUTE_OPTIONS);
    expect(second).toEqual(first);
    const nodeIds = first.nodes.map((n) => n.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    const edgeIds = first.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it('does not change its input rooms', () => {
    const input = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('s', 20000, 0, 22000, 2000, 'shaft')];
    const before = structuredClone(input);
    computeRouteArea(input, ROUTE_OPTIONS);
    expect(input).toEqual(before);
  });
});
