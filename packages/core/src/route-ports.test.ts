import { describe, expect, it } from 'vitest';
import { findRoutePorts, openPortsOf, type RoutePort, type RoutePortsInput, type RoutePortsResult, type RouteScope, type RouteStamp } from './route-ports.js';
import type { Room } from './rooms/room.js';
import { SYNTHETIC_CENTER_PORT_ID } from './stamp.js';

function stamp(id: string, rotationDegrees: number, ports: RouteStamp['ports'], routingTargets: RouteStamp['routingTargets']): RouteStamp {
  return {
    id,
    category: 'terminal',
    transform: { position: { x: 100, y: 100 }, rotationDegrees, scale: { x: 1, y: 1 } },
    nativeWidth: 100,
    nativeHeight: 50,
    ports,
    routingTargets,
  };
}

const P1 = { id: 'p1', name: 'Supply', fractionX: 0, fractionY: 0 };
const P2 = { id: 'p2', name: 'Return', fractionX: 1, fractionY: 1 };

describe('openPortsOf', () => {
  it('lists both ports of an unrotated stamp and the port of a rotated stamp at their world positions', () => {
    const plain = stamp('a', 0, [P1, P2], { p1: 'supply-air', p2: 'exhaust-air' });
    const rotated = stamp('b', 90, [P1], { p1: 'supply-air' });
    const open = openPortsOf([rotated, plain]);
    expect(open).toEqual([
      { stampId: 'b', portId: 'p1', networkTypeId: 'supply-air', world: { x: 125, y: 50 } },
      { stampId: 'a', portId: 'p1', networkTypeId: 'supply-air', world: { x: 50, y: 75 } },
      { stampId: 'a', portId: 'p2', networkTypeId: 'exhaust-air', world: { x: 150, y: 125 } },
    ]);
  });

  it('skips a port that has a segment and keeps the other port open', () => {
    const plain = stamp('a', 0, [P1, P2], { p1: 'supply-air', p2: 'exhaust-air' });
    plain.portSegmentTypes = { p1: 'supply-air' };
    const open = openPortsOf([plain]);
    expect(open.map((port) => port.portId)).toEqual(['p2']);
  });

  it('gives one open port at the center for a stamp without ports of its own', () => {
    const bare = stamp('c', 0, [], { [SYNTHETIC_CENTER_PORT_ID]: 'supply-air' });
    expect(openPortsOf([bare])).toEqual([
      { stampId: 'c', portId: SYNTHETIC_CENTER_PORT_ID, networkTypeId: 'supply-air', world: { x: 100, y: 100 } },
    ]);
  });

  it('gives no open port for a stamp without routing targets', () => {
    expect(openPortsOf([stamp('d', 0, [P1, P2], undefined)])).toEqual([]);
  });

  it('gives no open port for a routing target on a port id the stamp does not have', () => {
    expect(openPortsOf([stamp('e', 0, [P1], { ghost: 'supply-air' })])).toEqual([]);
  });

  it('keeps the order of the stamps, then the order of their ports', () => {
    const first = stamp('f', 0, [P2, P1], { p1: 'supply-air', p2: 'exhaust-air' });
    const second = stamp('g', 0, [P1], { p1: 'supply-air' });
    expect(openPortsOf([first, second]).map((port) => `${port.stampId}:${port.portId}`)).toEqual(['f:p2', 'f:p1', 'g:p1']);
  });
});

function room(id: string, x0: number, y0: number, x1: number, y1: number): Room {
  const outer = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return { id, pageIndex: 0, polygon: { outer, holes: [] }, name: id, number: null, source: 'manual', locked: false, open: false };
}

function placed(id: string, x: number, y: number, routingTargets: RouteStamp['routingTargets'], category: RouteStamp['category'] = 'terminal', ports: RouteStamp['ports'] = []): RouteStamp {
  return { id, category, transform: { position: { x, y }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 100, nativeHeight: 50, ports, routingTargets };
}

function find(stamps: RouteStamp[], scope: RouteScope, extra: Partial<RoutePortsInput> = {}): RoutePortsResult {
  return findRoutePorts({ stamps, networkTypeId: 'supply-air', scope, rooms: ROOMS, ...extra });
}

const roomScope = (...roomIds: string[]): RouteScope => ({ kind: 'rooms', roomIds: new Set(roomIds) });
const stampScope = (...stampIds: string[]): RouteScope => ({ kind: 'stamps', stampIds: new Set(stampIds) });
const keys = (ports: readonly RoutePort[]): string[] => ports.map((port) => `${port.stampId}:${port.portId}`);
const countIn = (result: RoutePortsResult, roomId: string): number | undefined => result.perRoom.find((entry) => entry.roomId === roomId)?.count;

const CENTER = SYNTHETIC_CENTER_PORT_ID;
const WEST_1 = room('west-1', 0, 0, 300, 300);
const WEST_2 = room('west-2', 0, 300, 300, 600);
const EAST_1 = room('east-1', 300, 0, 600, 300);
const EAST_2 = room('east-2', 300, 300, 600, 600);
const ROOMS = [WEST_1, WEST_2, EAST_1, EAST_2];
const ALL_ROOMS = roomScope('west-1', 'west-2', 'east-1', 'east-2');

function office(): RouteStamp[] {
  return [
    placed('g-w1', 150, 150, { [CENTER]: 'supply-air' }),
    placed('g-w2', 150, 450, { [CENTER]: 'supply-air' }),
    placed('g-e1', 450, 150, { p1: 'supply-air' }, 'terminal', [P1]),
    placed('g-e2', 450, 450, { [CENTER]: 'supply-air' }),
    placed('x-w1', 250, 250, { [CENTER]: 'exhaust-air' }),
    placed('x-e2', 550, 550, { [CENTER]: 'exhaust-air' }),
  ];
}

const RADIATOR = placed('rad', 450, 450, { p1: 'heating-water', p2: 'heating-water' }, 'terminal', [P2, P1]);
const boiler = (x: number, y: number): RouteStamp => placed('boiler', x, y, { p1: 'heating-water' }, 'equipment', [P1]);
const HEATING = { networkTypeId: 'heating-water', startStampId: 'boiler', startPortId: 'p1' };

describe('findRoutePorts', () => {
  it('takes every supply port of the office floor when all rooms are checked', () => {
    const result = find(office(), ALL_ROOMS);
    expect(result.ports).toHaveLength(4);
    expect(keys(result.ports)).toEqual(['g-w1:__center__', 'g-w2:__center__', 'g-e1:p1', 'g-e2:__center__']);
    expect(result.leftOut).toBe(0);
    expect(result.perRoom.map((entry) => entry.count)).toEqual([1, 1, 1, 1]);
  });

  it('moves the ports of the unchecked east wing to leftOut and lists all rooms in perRoom', () => {
    const result = find(office(), roomScope('west-1', 'west-2'));
    expect(keys(result.ports)).toEqual(['g-w1:__center__', 'g-w2:__center__']);
    expect(result.leftOut).toBe(2);
    expect(result.perRoom).toEqual([
      { roomId: 'west-1', count: 1, checked: true },
      { roomId: 'west-2', count: 1, checked: true },
      { roomId: 'east-1', count: 1, checked: false },
      { roomId: 'east-2', count: 1, checked: false },
    ]);
  });

  it('counts a port in two nested rooms for the smallest room only', () => {
    const floor = room('floor', 0, 0, 600, 600);
    const result = find([placed('g-w1', 150, 150, { [CENTER]: 'supply-air' })], roomScope('floor'), { rooms: [floor, WEST_1] });
    expect(result.ports).toEqual([]);
    expect(result.leftOut).toBe(1);
    expect(result.perRoom).toEqual([
      { roomId: 'floor', count: 0, checked: true },
      { roomId: 'west-1', count: 1, checked: false },
    ]);
  });

  it('makes a port outside every room a target when includeOutsideRooms is on', () => {
    const stamps = [...office(), placed('out', 900, 900, { [CENTER]: 'supply-air' })];
    const result = find(stamps, ALL_ROOMS);
    expect(keys(result.ports)).toContain('out:__center__');
    expect(result.outsideRooms).toBe(1);
    expect(result.leftOut).toBe(0);
  });

  it('keeps a port outside every room out of the targets when includeOutsideRooms is off', () => {
    const stamps = [...office(), placed('out', 900, 900, { [CENTER]: 'supply-air' })];
    const result = find(stamps, ALL_ROOMS, { includeOutsideRooms: false });
    expect(keys(result.ports)).not.toContain('out:__center__');
    expect(result.outsideRooms).toBe(1);
    expect(result.leftOut).toBe(0);
  });

  it('uses only the selected stamps when the scope is stamps and sets roomId from rooms', () => {
    const result = find(office(), stampScope('g-w1', 'g-e1'));
    expect(keys(result.ports)).toEqual(['g-w1:__center__', 'g-e1:p1']);
    expect(result.ports.map((port) => port.roomId)).toEqual(['west-1', 'east-1']);
    expect(result.leftOut).toBe(2);
    expect(result.outsideRooms).toBe(0);
    expect(result.perRoom).toEqual([]);
  });

  it('sets roomId to null for stamps scope without rooms', () => {
    const result = find(office(), stampScope('g-w1'), { rooms: undefined });
    expect(result.ports.map((port) => port.roomId)).toEqual([null]);
    expect(result.perRoom).toEqual([]);
  });

  it('never counts the own ports of the start stamp and counts them in startStampPorts', () => {
    const stamps = [...office(), placed('boiler', 250, 450, { [CENTER]: 'supply-air' }, 'equipment')];
    const result = find(stamps, ALL_ROOMS, { startStampId: 'boiler' });
    expect(keys(result.ports)).not.toContain('boiler:__center__');
    expect(result.ports).toHaveLength(4);
    expect(result.startStampPorts).toBe(1);
  });

  it('ignores a port with another network type and a port with a segment', () => {
    const stamps = [
      placed('ww', 150, 150, { [CENTER]: 'heating-water' }),
      { ...placed('segged', 450, 450, { [CENTER]: 'supply-air' }), portSegmentTypes: { [CENTER]: 'supply-air' } },
      placed('ok', 150, 450, { [CENTER]: 'supply-air' }),
    ];
    const result = find(stamps, ALL_ROOMS);
    expect(keys(result.ports)).toEqual(['ok:__center__']);
    expect(result.leftOut).toBe(0);
  });

  it('gives one of two grilles in one room when only one stamp is selected', () => {
    const stamps = [placed('g-a', 100, 100, { [CENTER]: 'supply-air' }), placed('g-b', 200, 200, { [CENTER]: 'supply-air' })];
    const result = find(stamps, stampScope('g-a'));
    expect(keys(result.ports)).toEqual(['g-a:__center__']);
    expect(result.leftOut).toBe(1);
  });

  it('keeps equipment ports out of a rooms scope and counts them in equipmentPorts', () => {
    const fc = placed('fc', 150, 150, { p1: 'supply-air' }, 'equipment', [P1]);
    const rooms = find([...office(), fc], ALL_ROOMS);
    expect(keys(rooms.ports)).not.toContain('fc:p1');
    expect(rooms.equipmentPorts).toBe(1);
    const stamps = find([...office(), fc], stampScope('fc'));
    expect(keys(stamps.ports)).toEqual(['fc:p1']);
    expect(stamps.equipmentPorts).toBe(0);
  });

  it('gives one target port of a multi-port radiator, the one nearest to the start port', () => {
    const result = find([boiler(250, 450), RADIATOR], ALL_ROOMS, HEATING);
    expect(keys(result.ports)).toEqual(['rad:p1']);
    expect(result.multiPortStamps).toBe(1);
    expect(result.droppedExtraPorts).toBe(1);
  });

  it('keeps the first port by port order when two ports are equally near', () => {
    const result = find([boiler(500, 475), RADIATOR], ALL_ROOMS, HEATING);
    expect(keys(result.ports)).toEqual(['rad:p2']);
  });

  it('keeps the first port by port order when the start port is missing', () => {
    const result = find([boiler(250, 450), RADIATOR], ALL_ROOMS, { ...HEATING, startPortId: undefined });
    expect(keys(result.ports)).toEqual(['rad:p2']);
  });

  it('keeps both ports and drops none when portsPerStamp is all', () => {
    const result = find([boiler(250, 450), RADIATOR], ALL_ROOMS, { ...HEATING, portsPerStamp: 'all' });
    expect(keys(result.ports)).toEqual(['rad:p2', 'rad:p1']);
    expect(result.multiPortStamps).toBe(1);
    expect(result.droppedExtraPorts).toBe(0);
  });

  it('keeps the count of the radiator room when another room is unchecked', () => {
    const stamps = [boiler(250, 450), RADIATOR, placed('heat-w1', 150, 150, { [CENTER]: 'heating-water' })];
    const all = find(stamps, ALL_ROOMS, HEATING);
    const less = find(stamps, roomScope('west-2', 'east-1', 'east-2'), HEATING);
    expect(countIn(all, 'east-2')).toBe(1);
    expect(countIn(less, 'east-2')).toBe(countIn(all, 'east-2'));
  });

  it('gives one port of a fan coil unit next to a boiler, never both', () => {
    const fcu = placed('fcu', 330, 450, { p1: 'heating-water', p2: 'heating-water' }, 'terminal', [P2, P1]);
    const result = find([boiler(250, 450), fcu], stampScope('fcu'), HEATING);
    expect(keys(result.ports)).toEqual(['fcu:p1']);
    expect(result.multiPortStamps).toBe(1);
    expect(result.droppedExtraPorts).toBe(1);
  });

  it('does not change its input', () => {
    const input: RoutePortsInput = { stamps: [...office(), boiler(250, 450), RADIATOR], networkTypeId: 'supply-air', scope: ALL_ROOMS, rooms: ROOMS, startStampId: 'boiler', startPortId: 'p1', includeOutsideRooms: false };
    const before = structuredClone(input);
    findRoutePorts(input);
    expect(input).toEqual(before);
  });
});
