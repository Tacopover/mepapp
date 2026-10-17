import { describe, expect, it } from 'vitest';
import { routeAreaWarnings } from './route-area-warnings.js';
import type { RouteArea, RouteAreaRoom, RouteEntry, RouteLink } from './route-area.js';

function makeArea(partial: Partial<RouteArea> = {}): RouteArea {
  return {
    status: 'ok',
    rooms: [],
    nodes: [],
    edges: [],
    entries: [],
    links: [],
    unreached: [],
    parts: 1,
    ...partial,
  };
}

function room(roomId: string, over: Partial<RouteAreaRoom> = {}): RouteAreaRoom {
  return { roomId, kind: 'path', typeId: 'corridor', open: false, name: null, ...over };
}

function entry(id: string, over: Partial<RouteEntry> = {}): RouteEntry {
  return {
    id,
    roomId: `served-${id}`,
    areaRoomId: 'a',
    nodeId: `n-${id}`,
    point: { x: 1, y: 2 },
    runMm: 1000,
    gapMm: 0,
    primary: true,
    shaft: false,
    ...over,
  };
}

function link(id: string, over: Partial<RouteLink> = {}): RouteLink {
  return {
    id,
    roomIds: ['a', 'b'],
    nodeId: `n-${id}`,
    point: { x: 3, y: 4 },
    runMm: 800,
    gapMm: 0,
    shaft: false,
    ...over,
  };
}

describe('routeAreaWarnings', () => {
  it('gives only the status line and draft-2d for each non-ok status', () => {
    const openRoom = room('a', { open: true });
    expect(routeAreaWarnings(makeArea({ status: 'no-calibration', rooms: [openRoom] }))).toEqual([
      { code: 'no-calibration', severity: 'error' },
      { code: 'draft-2d', severity: 'info' },
    ]);
    expect(routeAreaWarnings(makeArea({ status: 'no-rooms', rooms: [openRoom] }))).toEqual([
      { code: 'no-rooms', severity: 'warning' },
      { code: 'draft-2d', severity: 'info' },
    ]);
    expect(routeAreaWarnings(makeArea({ status: 'no-types', rooms: [openRoom] }))).toEqual([
      { code: 'no-types', severity: 'warning' },
      { code: 'draft-2d', severity: 'info' },
    ]);
    expect(routeAreaWarnings(makeArea({ status: 'no-route-rooms', rooms: [openRoom] }))).toEqual([
      { code: 'no-route-rooms', severity: 'warning' },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('gives an open-room line with the count and ids of the open rooms', () => {
    const area = makeArea({ rooms: [room('a', { open: true }), room('b'), room('c', { open: true })] });
    expect(routeAreaWarnings(area)).toEqual([
      { code: 'open-room', severity: 'warning', count: 2, roomIds: ['a', 'c'] },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('gives no open-room line when no room is open', () => {
    const area = makeArea({ rooms: [room('a'), room('b')] });
    expect(routeAreaWarnings(area).map((w) => w.code)).toEqual(['draft-2d']);
  });

  it('gives a parts warning for two parts', () => {
    const lines = routeAreaWarnings(makeArea({ parts: 2 }));
    expect(lines).toEqual([
      { code: 'parts', severity: 'warning', count: 2 },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('gives no parts line for one part or zero parts', () => {
    expect(routeAreaWarnings(makeArea({ parts: 1 })).map((w) => w.code)).toEqual(['draft-2d']);
    expect(routeAreaWarnings(makeArea({ parts: 0 })).map((w) => w.code)).toEqual(['draft-2d']);
  });

  it('counts only primary non-shaft entries and non-shaft links in wall-crossings', () => {
    const area = makeArea({
      entries: [
        entry('e1', { point: { x: 10, y: 11 } }),
        entry('e2', { primary: false, point: { x: 20, y: 21 } }),
        entry('e3', { shaft: true, point: { x: 30, y: 31 } }),
      ],
      links: [link('l1', { point: { x: 40, y: 41 } }), link('l2', { shaft: true, point: { x: 50, y: 51 } })],
    });
    expect(routeAreaWarnings(area)).toEqual([
      {
        code: 'wall-crossings',
        severity: 'warning',
        count: 2,
        points: [
          { x: 10, y: 11 },
          { x: 40, y: 41 },
        ],
      },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('counts a served room once when one of its entries is primary and the other is not', () => {
    const area = makeArea({
      entries: [
        entry('e1', { roomId: 'served', areaRoomId: 'a', primary: true }),
        entry('e2', { roomId: 'served', areaRoomId: 'b', primary: false }),
      ],
    });
    const wall = routeAreaWarnings(area).find((w) => w.code === 'wall-crossings');
    expect(wall?.count).toBe(1);
  });

  it('lists wall-crossings points in entry order, then link order', () => {
    const area = makeArea({
      entries: [entry('e1', { point: { x: 1, y: 1 } }), entry('e2', { point: { x: 2, y: 2 } })],
      links: [link('l1', { point: { x: 3, y: 3 } }), link('l2', { point: { x: 4, y: 4 } })],
    });
    const wall = routeAreaWarnings(area).find((w) => w.code === 'wall-crossings');
    expect(wall).toEqual({
      code: 'wall-crossings',
      severity: 'warning',
      count: 4,
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ],
    });
  });

  it('gives no wall-crossings line when the count is 0', () => {
    const area = makeArea({
      entries: [entry('e1', { primary: false }), entry('e2', { shaft: true })],
      links: [link('l1', { shaft: true })],
    });
    expect(routeAreaWarnings(area).map((w) => w.code)).toEqual(['draft-2d']);
  });

  it('gives one shaft-crossing line per shaft room, counting shaft entries and shaft links', () => {
    const area = makeArea({
      rooms: [room('s1', { kind: 'shaft', typeId: 'shaft' }), room('s2', { kind: 'shaft', typeId: 'shaft' })],
      entries: [
        entry('e1', { areaRoomId: 's1', shaft: true, point: { x: 5, y: 6 } }),
        entry('e2', { areaRoomId: 's2', shaft: true, point: { x: 7, y: 8 } }),
      ],
      links: [link('l1', { roomIds: ['s1', 'a'], shaft: true, point: { x: 9, y: 10 } })],
    });
    expect(routeAreaWarnings(area)).toEqual([
      {
        code: 'shaft-crossing',
        severity: 'warning',
        roomIds: ['s1'],
        count: 2,
        points: [
          { x: 5, y: 6 },
          { x: 9, y: 10 },
        ],
      },
      {
        code: 'shaft-crossing',
        severity: 'warning',
        roomIds: ['s2'],
        count: 1,
        points: [{ x: 7, y: 8 }],
      },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('keeps shaft places out of wall-crossings', () => {
    const area = makeArea({
      rooms: [room('s1', { kind: 'shaft', typeId: 'shaft' })],
      entries: [entry('e1', { areaRoomId: 's1', shaft: true })],
      links: [link('l1', { shaft: true })],
    });
    const codes = routeAreaWarnings(area).map((w) => w.code);
    expect(codes).not.toContain('wall-crossings');
    expect(codes).toContain('shaft-crossing');
  });

  it('gives an unreached info line with count and ids', () => {
    const area = makeArea({
      unreached: [
        { roomId: 'u1', distanceMm: null },
        { roomId: 'u2', distanceMm: 4200 },
      ],
    });
    expect(routeAreaWarnings(area)).toEqual([
      { code: 'unreached', severity: 'info', count: 2, roomIds: ['u1', 'u2'] },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('gives a stair-name info line for names that contain "trap" in any case', () => {
    const area = makeArea({
      rooms: [
        room('r1', { name: 'Trappenhuis' }),
        room('r2', { name: 'trap' }),
        room('r3', { name: 'TRAP 2' }),
        room('r4', { name: 'Gang' }),
        room('r5', { name: null }),
      ],
    });
    expect(routeAreaWarnings(area)).toEqual([
      { code: 'stair-name', severity: 'info', count: 3, roomIds: ['r1', 'r2', 'r3'] },
      { code: 'draft-2d', severity: 'info' },
    ]);
  });

  it('gives no stair-name line for a room named "Gang" or with a null name', () => {
    const area = makeArea({ rooms: [room('r1', { name: 'Gang' }), room('r2', { name: null })] });
    expect(routeAreaWarnings(area).map((w) => w.code)).toEqual(['draft-2d']);
  });

  it('gives draft-2d last and always', () => {
    expect(routeAreaWarnings(makeArea()).map((w) => w.code)).toEqual(['draft-2d']);
  });

  it('orders the lines open-room, parts, wall-crossings, unreached, stair-name, draft-2d', () => {
    const area = makeArea({
      rooms: [room('a', { open: true }), room('r1', { name: 'Trap' })],
      parts: 2,
      entries: [entry('e1')],
      unreached: [{ roomId: 'u1', distanceMm: null }],
    });
    expect(routeAreaWarnings(area).map((w) => w.code)).toEqual([
      'open-room',
      'parts',
      'wall-crossings',
      'unreached',
      'stair-name',
      'draft-2d',
    ]);
  });

  it('orders the error and warning lines before the info lines', () => {
    const area = makeArea({
      rooms: [room('s1', { kind: 'shaft', typeId: 'shaft' }), room('r1', { name: 'Trap' })],
      entries: [entry('e1', { areaRoomId: 's1', shaft: true })],
      unreached: [{ roomId: 'u1', distanceMm: null }],
      parts: 2,
    });
    const severities = routeAreaWarnings(area).map((w) => w.severity);
    expect(severities).toEqual(['warning', 'warning', 'info', 'info', 'info']);
  });

  it('does not change the input and gives equal output for the same input', () => {
    const area = makeArea({
      rooms: [room('a', { open: true }), room('s1', { kind: 'shaft', typeId: 'shaft', name: 'Trap' })],
      parts: 2,
      entries: [entry('e1', { point: { x: 1, y: 2 } }), entry('e2', { areaRoomId: 's1', shaft: true, point: { x: 3, y: 4 } })],
      links: [link('l1', { point: { x: 5, y: 6 } })],
      unreached: [{ roomId: 'u1', distanceMm: 100 }],
    });
    const before = JSON.parse(JSON.stringify(area));
    const first = routeAreaWarnings(area);
    expect(area).toEqual(before);
    expect(routeAreaWarnings(area)).toEqual(first);
  });

  it('copies point objects instead of returning the input points', () => {
    const area = makeArea({ entries: [entry('e1', { point: { x: 1, y: 2 } })] });
    const wall = routeAreaWarnings(area).find((w) => w.code === 'wall-crossings');
    expect(wall?.points?.[0]).toEqual({ x: 1, y: 2 });
    expect(wall?.points?.[0]).not.toBe(area.entries[0].point);
  });
});
