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

  it('picks the entry with the cheaper room feed, not the entry with the cheaper branch', () => {
    const out = planRoomFeeds(
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([
          [
            'R',
            [
              { id: 'r1', point: { x: 1000, y: 1500 } },
              { id: 'r2', point: { x: 3000, y: 1000 } },
              { id: 'r3', point: { x: 3000, y: 2200 } },
            ],
          ],
        ]),
        areaEntries: [
          { ...wallEntry('R', { x: 500, y: 0 }), id: 'e-R-a', nodeId: 'n-R-a' },
          { ...wallEntry('R', { x: 2000, y: 0 }), id: 'e-R-b', nodeId: 'n-R-b' },
        ],
        options: { roomBranches: { searchMm: 30000, fewRoomBends: true } },
      }),
    );
    expect(out.unfedRoomIds).toEqual([]);
    expect(out.rooms.map((r) => r.roomId)).toEqual(['R']);
    expect(out.rooms[0]!.branch[1]).toEqual({ x: 2000, y: 0 });
  });

  it('picks the entry with the cheaper branch when fewRoomBends is absent', () => {
    const out = planRoomFeeds(
      feedInput({
        rooms: [box('R', 0, 0, 4000, 3000)],
        servedRooms: [served('R')],
        portsByRoom: new Map([
          [
            'R',
            [
              { id: 'r1', point: { x: 1000, y: 1500 } },
              { id: 'r2', point: { x: 3000, y: 1000 } },
              { id: 'r3', point: { x: 3000, y: 2200 } },
            ],
          ],
        ]),
        areaEntries: [
          { ...wallEntry('R', { x: 500, y: 0 }), id: 'e-R-a', nodeId: 'n-R-a' },
          { ...wallEntry('R', { x: 2000, y: 0 }), id: 'e-R-b', nodeId: 'n-R-b' },
        ],
      }),
    );
    expect(out.unfedRoomIds).toEqual([]);
    expect(out.rooms[0]!.branch[1]).toEqual({ x: 500, y: 0 });
  });

  describe('chain pass', () => {
    const legDist = (p: Vec2, a: Vec2, b: Vec2): number => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    };
    const chainInput = (over: Partial<RoomFeedsInput> = {}, extra: Room[] = [], servedExtra: string[] = [], ports: [string, Vec2][] = []) =>
      feedInput({
        rooms: [box('N', 0, 0, 4000, 3000), box('F', 4000, 0, 8000, 3000), ...extra],
        servedRooms: [served('N'), served('F'), ...servedExtra.map(served)],
        portsByRoom: new Map<string, { id: string; point: Vec2 }[]>([
          ['N', [{ id: 'n1', point: { x: 1000, y: 1500 } }]],
          ['F', [{ id: 'f1', point: { x: 6000, y: 2500 } }]],
          ...ports.map(([id, point]) => [id, [{ id: `${id}-p`, point }]] as const),
        ]),
        areaEntries: [wallEntry('N', { x: 2000, y: 0 })],
        ...over,
      });

    it('feeds a far room by a chain from a fed neighbour', () => {
      const out = planRoomFeeds(chainInput());
      expect(out.unfedRoomIds).toEqual([]);
      const n = out.rooms.find((r) => r.roomId === 'N')!;
      const f = out.rooms.find((r) => r.roomId === 'F')!;
      expect(f.chain).toEqual({ viaRoomId: 'N', depth: 1 });
      expect(f.branch[0]).toEqual(n.branch[n.branch.length - 1]);
      expect(f.branch.slice(0, -1).length - 1).toBeLessThanOrEqual(2);
      expect(f.leftPortIds).toEqual([]);
    });

    it('starts the chain at the junction of the neighbour and not on its spine', () => {
      const out = planRoomFeeds(chainInput());
      const n = out.rooms.find((r) => r.roomId === 'N')!;
      const f = out.rooms.find((r) => r.roomId === 'F')!;
      const hostLegs = [...n.spine, n.branch];
      const chainPoints = f.branch.slice(1);
      for (const p of chainPoints) {
        for (const path of hostLegs) {
          for (let i = 1; i < path.length; i++) expect(legDist(p, path[i - 1]!, path[i]!)).toBeGreaterThan(60);
        }
      }
    });

    it('stops the chain at the depth limit', () => {
      const extra = [box('G', 8000, 0, 12000, 3000)];
      const withG = (over: Partial<RoomFeedsInput> = {}) => chainInput(over, extra, ['G'], [['G', { x: 10000, y: 2500 }]]);
      const one = planRoomFeeds(withG({ options: { roomBranches: { searchMm: 30000, maxChainDepth: 1 } } }));
      expect(one.unfedRoomIds).toEqual(['G']);
      const two = planRoomFeeds(withG({ options: { roomBranches: { searchMm: 30000, maxChainDepth: 2 } } }));
      expect(two.unfedRoomIds).toEqual([]);
      expect(two.rooms.find((r) => r.roomId === 'G')!.chain).toEqual({ viaRoomId: 'F', depth: 2 });
      const zero = planRoomFeeds(withG({ options: { roomBranches: { searchMm: 30000, maxChainDepth: 0 } } }));
      expect(zero.unfedRoomIds).toEqual(['F', 'G']);
    });

    it('leaves the far room unfed when accepts refuses every chain path', () => {
      const out = planRoomFeeds(chainInput({ accepts: (path: Vec2[]) => path.every((v) => v.x <= 3500) }));
      expect(out.unfedRoomIds).toEqual(['F']);
      expect(out.rooms.map((r) => r.roomId)).toEqual(['N']);
    });

    it('leaves the far room unfed when the spine of its neighbour cuts every chain path', () => {
      const out = planRoomFeeds(
        chainInput({
          portsByRoom: new Map([
            ['N', [{ id: 'n1', point: { x: 1000, y: 1500 } }, { id: 'n2', point: { x: 3500, y: 250 } }]],
            ['F', [{ id: 'f1', point: { x: 6000, y: 2500 } }]],
          ]),
        }),
      );
      expect(out.unfedRoomIds).toEqual(['F']);
      const control = planRoomFeeds(chainInput());
      expect(control.rooms.find((r) => r.roomId === 'F')!.chain).toEqual({ viaRoomId: 'N', depth: 1 });
    });

    it('does not chain the far room through a served room that has ports next to the shared wall', () => {
      const out = planRoomFeeds(chainInput({}, [box('T', 3750, 0, 4250, 3000)], ['T'], [['T', { x: 4000, y: 1500 }]]));
      expect(out.unfedRoomIds).toEqual(['F']);
      expect(planRoomFeeds(chainInput()).unfedRoomIds).toEqual([]);
    });

    it('chains an off-graph room that has ports and is not served', () => {
      const out = planRoomFeeds(chainInput({ servedRooms: [served('N')], offGraphRoomIds: ['F'] }));
      expect(out.unfedRoomIds).toEqual([]);
      expect(out.rooms.find((r) => r.roomId === 'F')!.chain).toEqual({ viaRoomId: 'N', depth: 1 });
    });

    it('ignores an off-graph room that has no ports', () => {
      const out = planRoomFeeds(chainInput({ servedRooms: [served('N')], offGraphRoomIds: ['Q'] }, [box('Q', 20000, 0, 24000, 3000)]));
      expect(out.unfedRoomIds).toEqual([]);
      expect(out.rooms.map((r) => r.roomId)).toEqual(['N']);
    });

    it('gives the same result for the same input and for another order of served rooms', () => {
      const input = chainInput();
      expect(planRoomFeeds(input)).toEqual(planRoomFeeds(input));
      const reversed = planRoomFeeds({ ...input, servedRooms: [...input.servedRooms].reverse() });
      expect(reversed.rooms.filter((r) => r.chain).map((r) => r.roomId)).toEqual(['F']);
    });

    it('uses a chain depth of 1 when maxChainDepth is absent', () => {
      const extra = [box('G', 8000, 0, 12000, 3000)];
      const build = (maxChainDepth?: number) =>
        planRoomFeeds(chainInput({ options: { roomBranches: maxChainDepth === undefined ? { searchMm: 30000 } : { searchMm: 30000, maxChainDepth } } }, extra, ['G'], [['G', { x: 10000, y: 2500 }]]));
      expect(build()).toEqual(build(1));
    });

    it('feeds a far room whose wall gives more candidate entries than the feed cap', () => {
      const out = planRoomFeeds(
        feedInput({
          rooms: [box('N', 0, -2000, 4000, 5000), box('F', 4000, -1500, 10000, 4500)],
          servedRooms: [served('N'), served('F')],
          portsByRoom: new Map([
            ['N', [{ id: 'n1', point: { x: 1000, y: 1500 } }]],
            ['F', [{ id: 'f1', point: { x: 6000, y: 1500 } }]],
          ]),
          areaEntries: [wallEntry('N', { x: 500, y: 0 })],
          options: { roomBranches: { searchMm: 30000, fewRoomBends: true } },
        }),
      );
      expect(out.unfedRoomIds).toEqual([]);
      const f = out.rooms.find((r) => r.roomId === 'F')!;
      expect(f.chain).toEqual({ viaRoomId: 'N', depth: 1 });
      expect(f.branch.flatMap((p) => [p.x, p.y]).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(f.lengthMm)).toBe(true);
    });

    it('chains a far room with fewRoomBends and leaves no terminal unreached', () => {
      const out = planRoomFeeds(chainInput({ options: { roomBranches: { searchMm: 30000, fewRoomBends: true } } }));
      expect(out.unfedRoomIds).toEqual([]);
      expect(out.rooms.find((r) => r.roomId === 'F')!.chain).toEqual({ viaRoomId: 'N', depth: 1 });
    });
  });
});
