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

describe('computeRouteArea links and entries', () => {
  const threeOffices = [
    rect('c', 0, 0, 10000, 2000, 'corridor'),
    rect('o0', 0, 2300, 3000, 6000, 'office'),
    rect('o1', 3300, 2300, 6300, 6000, 'office'),
    rect('o2', 6600, 2300, 9600, 6000, 'office'),
  ];

  it('gives one entry per office on the corridor side, all primary', () => {
    const area = computeRouteArea(threeOffices, ROUTE_OPTIONS);
    expect(area.entries.map((e) => e.id)).toEqual(['ry-o0-c', 'ry-o1-c', 'ry-o2-c']);
    expect(area.entries.every((e) => e.primary && !e.shaft && e.areaRoomId === 'c')).toBe(true);
    area.entries.forEach((entry, k) => {
      expect(entry.point.y).toBeGreaterThanOrEqual(2000);
      expect(entry.point.y).toBeLessThanOrEqual(2300);
      expect(entry.point.x).toBeGreaterThanOrEqual(k * 3300);
      expect(entry.point.x).toBeLessThanOrEqual(k * 3300 + 3000);
      const connectors = area.edges.filter((e) => e.kind === 'connector' && e.from === entry.nodeId);
      expect(connectors).toHaveLength(1);
      const tap = area.nodes.find((n) => n.id === connectors[0]!.to)!;
      expect(tap.kind).toBe('tap');
      // The center line lies on the 100 mm pixel grid: y 950 measured for a 2000 mm corridor.
      expect(Math.abs(tap.point.y - 1000)).toBeLessThanOrEqual(100);
      expect(area.edges.some((e) => e.kind === 'center' && (e.from === tap.id || e.to === tap.id))).toBe(true);
    });
  });

  it('marks the entry of the longer run as primary for an office on two corridors', () => {
    const rooms = [
      rect('c1', 0, 0, 10000, 2000, 'corridor'),
      rect('c2', 0, 6300, 4000, 8300, 'corridor'),
      rect('o', 0, 2300, 6000, 6000, 'office'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries).toHaveLength(2);
    const primary = area.entries.filter((e) => e.primary);
    expect(primary).toHaveLength(1);
    expect(primary[0]!.areaRoomId).toBe('c1');
  });

  it('marks the entry of the first corridor primary when two corridors have equal runs', () => {
    const rooms = [
      rect('c1', 0, 0, 10000, 2000, 'corridor'),
      rect('c2', 0, 6300, 10000, 8300, 'corridor'),
      rect('o', 3000, 2300, 5000, 6000, 'office'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries.map((e) => e.id)).toEqual(['ry-o-c1', 'ry-o-c2']);
    const [first, second] = area.entries;
    expect(Math.abs(first!.runMm - second!.runMm)).toBeLessThanOrEqual(1);
    expect(first!.primary).toBe(true);
    expect(second!.primary).toBe(false);
  });

  it('joins two touching corridors with one link and two connectors', () => {
    const rooms = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('b', 10000, 0, 20000, 2000, 'corridor')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.links).toHaveLength(1);
    const link = area.links[0]!;
    expect(link.id).toBe('rk-a-b');
    expect(link.roomIds).toEqual(['a', 'b']);
    expect(link.nodeId).toBe('rl-a-b');
    expect(link.shaft).toBe(false);
    expect(area.entries).toEqual([]);
    const connectors = area.edges.filter((e) => e.kind === 'connector');
    expect(connectors.map((e) => e.id).sort()).toEqual(['rc-rk-a-b-0', 'rc-rk-a-b-1']);
    expect(connectors.every((e) => e.from === 'rl-a-b')).toBe(true);
    expect(area.parts).toBe(1);
  });

  it('ends the two connectors of a link at the tap nodes of the link', () => {
    const rooms = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('b', 10000, 0, 20000, 2000, 'corridor')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    // Measured: no tap node is made for a touching link. Each connector ends at the end node of one room.
    const ends = area.edges.filter((e) => e.kind === 'connector' && e.from === 'rl-a-b').map((e) => e.to);
    expect(ends.sort()).toEqual(['rn-a-1', 'rn-b-0']);
    expect(area.nodes.find((n) => n.id === 'rn-a-1')).toMatchObject({ kind: 'end', roomId: 'a' });
    expect(area.nodes.find((n) => n.id === 'rn-b-0')).toMatchObject({ kind: 'end', roomId: 'b' });
    expect(area.nodes.some((n) => n.kind === 'tap')).toBe(false);
  });

  it('marks a link to a shaft room as shaft and ends one connector at the shaft node', () => {
    const rooms = [rect('c', 0, 0, 10000, 2000, 'corridor'), rect('s', 10000, 0, 12000, 2000, 'shaft')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.links).toHaveLength(1);
    expect(area.links[0]!.shaft).toBe(true);
    const ends = area.edges.filter((e) => e.kind === 'connector' && e.from === 'rl-c-s').map((e) => e.to);
    expect(ends).toContain('rn-s-0');
  });

  it('gives a shaft room an entry marked shaft when only an office touches it', () => {
    const rooms = [
      rect('far', 50000, 0, 60000, 2000, 'corridor'),
      rect('o', 0, 2300, 6000, 6000, 'office'),
      rect('s', 6000, 2300, 8000, 4000, 'shaft'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries).toHaveLength(1);
    expect(area.entries[0]!.shaft).toBe(true);
    expect(area.entries[0]!.areaRoomId).toBe('s');
    expect(area.links).toEqual([]);
  });

  it('ends the connector of a fallback entry at the end node of a path room', () => {
    const rooms = [rect('n', 0, 0, 10000, 250, 'corridor'), rect('o', 0, 550, 3000, 4000, 'office')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries).toHaveLength(1);
    const entry = area.entries[0]!;
    expect(entry.primary).toBe(true);
    const connectors = area.edges.filter((e) => e.kind === 'connector' && e.from === entry.nodeId);
    expect(connectors).toHaveLength(1);
    expect(connectors[0]!.to).toBe('rn-n-0');
    expect(area.nodes.some((n) => n.kind === 'tap')).toBe(false);
    expect(area.parts).toBe(1);
  });

  it('gives no entry and no link across a gap of 800 mm', () => {
    const rooms = [rect('c', 0, 0, 10000, 2000, 'corridor'), rect('o', 0, 2800, 3000, 6000, 'office')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries).toEqual([]);
    expect(area.links).toEqual([]);
  });

  it('names the entry, wall, tap and connector ids by the rule', () => {
    const area = computeRouteArea(threeOffices, ROUTE_OPTIONS);
    for (const k of [0, 1, 2]) {
      const entryId = `ry-o${k}-c`;
      expect(area.nodes.find((n) => n.id === `rw-o${k}-c`)?.kind).toBe('wall');
      expect(area.nodes.find((n) => n.id === `rt-${entryId}-0`)?.kind).toBe('tap');
      expect(area.edges.find((e) => e.id === `rc-${entryId}-0`)?.kind).toBe('connector');
    }
  });

  it('names each split edge after the edge it splits and the tap node', () => {
    const area = computeRouteArea(threeOffices, ROUTE_OPTIONS);
    const split = area.edges.filter((e) => e.id.includes('~'));
    expect(split).toHaveLength(3);
    for (const edge of split) {
      const cut = edge.id.lastIndexOf('~');
      const first = edge.id.slice(0, cut);
      const tap = edge.id.slice(cut + 1);
      const firstEdge = area.edges.find((e) => e.id === first);
      expect(firstEdge).toBeDefined();
      expect(firstEdge!.to).toBe(tap);
      expect(edge.from).toBe(tap);
      expect(area.nodes.find((n) => n.id === tap)?.kind).toBe('tap');
    }
  });

  it('gives the same result twice, with unique node and edge ids', () => {
    const input = [...threeOffices, rect('b', 10000, 0, 20000, 2000, 'corridor')];
    const first = computeRouteArea(input, ROUTE_OPTIONS);
    expect(computeRouteArea(input, ROUTE_OPTIONS)).toEqual(first);
    const nodeIds = first.nodes.map((n) => n.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    const edgeIds = first.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it('does not change its input rooms', () => {
    const input = [...threeOffices, rect('b', 10000, 0, 20000, 2000, 'corridor')];
    const before = structuredClone(input);
    computeRouteArea(input, ROUTE_OPTIONS);
    expect(input).toEqual(before);
  });
});

describe('computeRouteArea unreached and parts', () => {
  const corridor = rect('c', 0, 0, 10000, 2000, 'corridor');

  it('leaves no unreached room when three offices touch the corridor', () => {
    const rooms = [
      corridor,
      rect('o0', 0, 2300, 3000, 6000, 'office'),
      rect('o1', 3300, 2300, 6300, 6000, 'office'),
      rect('o2', 6600, 2300, 9600, 6000, 'office'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.unreached).toEqual([]);
    expect(area.parts).toBe(1);
  });

  it('gives an office behind another office as unreached, with its gap to the corridor', () => {
    const rooms = [
      corridor,
      rect('o1', 0, 2300, 3000, 6000, 'office'),
      rect('o2', 0, 6800, 3000, 9000, 'office'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.entries.map((e) => e.roomId)).toEqual(['o1']);
    expect(area.unreached).toHaveLength(1);
    const [entry] = area.unreached;
    expect(entry!.roomId).toBe('o2');
    expect(entry!.distanceMm).not.toBeNull();
    expect(Math.abs(entry!.distanceMm! - 4800)).toBeLessThanOrEqual(20);
    expect(entry!.distanceMm! % 10).toBe(0);
  });

  it('gives parts 1 for two corridors that touch', () => {
    const rooms = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('b', 10000, 0, 20000, 2000, 'corridor')];
    expect(computeRouteArea(rooms, ROUTE_OPTIONS).parts).toBe(1);
  });

  it('gives parts 2 for two corridors 800 mm apart', () => {
    const rooms = [rect('a', 0, 0, 10000, 2000, 'corridor'), rect('b', 10800, 0, 20800, 2000, 'corridor')];
    expect(computeRouteArea(rooms, ROUTE_OPTIONS).parts).toBe(2);
  });

  it('gives unreached [] and parts 0 for each status other than ok', () => {
    const rooms = [corridor, rect('o', 0, 6800, 3000, 9000, 'office')];
    const results = [
      computeRouteArea(rooms, { ...ROUTE_OPTIONS, mmPerPt: null }),
      computeRouteArea([rect('o', 0, 0, 3000, 3000, 'office')], { ...ROUTE_OPTIONS, pageIndex: 1 }),
      computeRouteArea(rooms, { ...ROUTE_OPTIONS, roomTypeIds: [] }),
      computeRouteArea([rect('o', 0, 0, 3000, 3000, 'office')], ROUTE_OPTIONS),
    ];
    expect(results.map((r) => r.status)).toEqual(['no-calibration', 'no-rooms', 'no-types', 'no-route-rooms']);
    for (const area of results) {
      expect(area.unreached).toEqual([]);
      expect(area.parts).toBe(0);
    }
  });

  it('gives the same result for the same input and does not change the input', () => {
    const input = [corridor, rect('o1', 0, 2300, 3000, 6000, 'office'), rect('o2', 0, 6800, 3000, 9000, 'office')];
    const before = structuredClone(input);
    const first = computeRouteArea(input, ROUTE_OPTIONS);
    expect(computeRouteArea(input, ROUTE_OPTIONS)).toEqual(first);
    expect(input).toEqual(before);
  });
});
