import { describe, expect, it } from 'vitest';
import { computeRouteArea } from './route-area.js';
import type { Room } from './rooms/room.js';

function rect(id: string, x0: number, y0: number, x1: number, y1: number, typeId?: string): Room {
  return {
    id,
    pageIndex: 0,
    polygon: {
      outer: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      holes: [],
    },
    name: null,
    number: null,
    source: 'detected',
    locked: false,
    open: false,
    ...(typeId === undefined ? {} : { roomTypeId: typeId }),
  };
}

const ROUTE_OPTIONS = { roomTypeIds: ['corridor', 'shaft'], pageIndex: 0, mmPerPt: 1 };

describe('computeRouteArea with a shaft', () => {
  it('gives one shaft node and no entry, link or edge for a shaft that touches no room', () => {
    const area = computeRouteArea([rect('s', 0, 0, 2000, 2000, 'shaft')], ROUTE_OPTIONS);
    expect(area.nodes.map((n) => n.kind)).toEqual(['shaft']);
    expect(area.entries).toEqual([]);
    expect(area.links).toEqual([]);
    expect(area.edges).toEqual([]);
    expect(area.parts).toBe(1);
    expect(area.unreached).toEqual([]);
  });

  it('links a shaft to a corridor and gives an office next to the shaft a shaft entry', () => {
    const rooms = [
      rect('c', 0, 0, 10000, 2000, 'corridor'),
      rect('s', 10000, 0, 12000, 2000, 'shaft'),
      rect('o', 12000, 0, 15000, 2000, 'office'),
    ];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.links).toHaveLength(1);
    expect(area.links[0]!.shaft).toBe(true);
    expect(area.links[0]!.roomIds).toEqual(['c', 's']);
    expect(area.entries).toHaveLength(1);
    expect(area.entries[0]!.roomId).toBe('o');
    expect(area.entries[0]!.shaft).toBe(true);
    expect(area.entries[0]!.areaRoomId).toBe('s');
    expect(area.parts).toBe(1);
  });

  it('gives an office next to a lone shaft one shaft entry and no link', () => {
    const rooms = [rect('s', 10000, 0, 12000, 2000, 'shaft'), rect('o', 12000, 0, 15000, 2000, 'office')];
    const area = computeRouteArea(rooms, ROUTE_OPTIONS);
    expect(area.parts).toBe(1);
    expect(area.entries).toHaveLength(1);
    expect(area.entries[0]!.shaft).toBe(true);
    expect(area.links).toEqual([]);
  });
});
