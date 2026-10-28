import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { RouteEntry } from './route-area.js';
import { planRoomFeeds, type RoomFeedsInput } from './route-feeds.js';
import type { Room } from './rooms/room.js';

const box = (id: string, x0: number, y0: number, x1: number, y1: number): Room => ({
  id,
  pageIndex: 0,
  polygon: { outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] },
  name: null,
  number: null,
  source: 'manual',
  locked: false,
  open: false,
});

const wallEntry = (roomId: string, point: Vec2): RouteEntry => ({
  id: `e-${roomId}`, roomId, areaRoomId: 'corridor', nodeId: `n-${roomId}`, point, runMm: 1000, gapMm: 0, primary: true, shaft: false,
});

const served = (roomId: string) => ({ roomId, entryId: `e-${roomId}`, wallNodeId: `n-${roomId}`, tapNodeId: 't', entryPointMm: { x: 0, y: 0 } });

const always = (): boolean => true;

function feedInput(over: Partial<RoomFeedsInput>): RoomFeedsInput {
  return {
    rooms: [],
    servedRooms: [],
    portsByRoom: new Map(),
    areaEntries: [],
    areaRoomIds: new Set(),
    trunkEdges: [{ id: 'e1', path: [{ x: 0, y: -1000 }, { x: 9000, y: -1000 }] }],
    rootPointMm: { x: 0, y: -1000 },
    startPointMm: { x: -1000, y: -1000 },
    mmPerPt: 1,
    accepts: always,
    targetPointsMm: [],
    crossesExisting: () => 0,
    options: { roomBranches: { searchMm: 30000 } },
    ...over,
  };
}

describe('planRoomFeeds', () => {
  it('keeps two taps on one carrier leg at least 300 mm apart', () => {
    const rooms = [box('A', 0, 0, 4000, 3000), box('B', 4000, 0, 8000, 3000)];
    const out = planRoomFeeds(
      feedInput({
        rooms,
        servedRooms: [served('A'), served('B')],
        portsByRoom: new Map([
          ['A', [{ id: 'a1', point: { x: 1000, y: 1500 } }]],
          ['B', [{ id: 'b1', point: { x: 6000, y: 1500 } }]],
        ]),
        areaEntries: [wallEntry('A', { x: 3950, y: 0 }), wallEntry('B', { x: 4050, y: 0 })],
      }),
    );
    expect(out.unfedRoomIds).toEqual([]);
    expect(out.rooms.map((r) => r.roomId)).toEqual(['A', 'B']);
    const [tapA, tapB] = out.rooms.map((r) => r.branch[0]!);
    expect(Math.abs(tapA!.x - tapB!.x)).toBeGreaterThanOrEqual(300);
  });

  it('does not feed a room through another room that has ports', () => {
    const rooms = [box('R', 0, 0, 4000, 3000), box('X', -5000, -900, 20000, -100)];
    const out = planRoomFeeds(
      feedInput({
        rooms,
        servedRooms: [served('R')],
        portsByRoom: new Map([
          ['R', [{ id: 'r1', point: { x: 1000, y: 1500 } }]],
          ['X', [{ id: 'x1', point: { x: 0, y: -500 } }]],
        ]),
        areaEntries: [wallEntry('R', { x: 2000, y: 0 })],
      }),
    );
    expect(out.rooms).toEqual([]);
    expect(out.unfedRoomIds).toEqual(['R']);
  });

  it('leaves a room unfed when accepts refuses its path', () => {
    const out = planRoomFeeds(
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([['R', [{ id: 'r1', point: { x: 1000, y: 1500 } }]]]),
        areaEntries: [wallEntry('R', { x: 2000, y: 0 })],
        accepts: () => false,
      }),
    );
    expect(out.rooms).toEqual([]);
    expect(out.unfedRoomIds).toEqual(['R']);
  });

  it('keeps the feed path clear of a point that accepts refuses', () => {
    const P = { x: 2000, y: -1000 };
    const input = (point: Vec2) =>
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([['R', [{ id: 'r1', point: { x: 1000, y: 1500 } }]]]),
        areaEntries: [wallEntry('R', { x: 2000, y: 0 })],
        accepts: (path: Vec2[]) => path.every((v) => Math.hypot(v.x - point.x, v.y - point.y) > 100),
      });
    expect(planRoomFeeds(input({ x: 99999, y: 99999 })).unfedRoomIds).toEqual([]);
    const near = planRoomFeeds(input(P));
    const branchPoints = near.rooms.flatMap((r) => r.branch);
    expect(branchPoints.filter((p) => Math.hypot(p.x - P.x, p.y - P.y) <= 100)).toEqual([]);
  });

  it('does not run a tap-to-entry path over another target port', () => {
    const out = planRoomFeeds(
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([['R', [{ id: 'r1', point: { x: 1000, y: 1500 } }]]]),
        areaEntries: [wallEntry('R', { x: 2000, y: 0 })],
        targetPointsMm: [{ x: 2000, y: -500 }],
      }),
    );
    expect(out.rooms).toEqual([]);
    expect(out.unfedRoomIds).toEqual(['R']);
  });

  it('leaves a room unfed when it has no real entry', () => {
    const out = planRoomFeeds(
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([['R', [{ id: 'r1', point: { x: 1000, y: 1500 } }]]]),
      }),
    );
    expect(out.rooms).toEqual([]);
    expect(out.unfedRoomIds).toEqual(['R']);
  });
});
