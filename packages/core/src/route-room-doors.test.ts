import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import { dist, distanceToPath } from './route-feed-helpers.js';
import { manualScenario } from './route-scenario.testutil.js';
import { insideRouteArea } from './route-layout.js';
import {
  MAX_OWN_DOORS,
  roomBlockRuns,
  roomDoorCandidates,
  segmentsMeet,
  roomDoorRuns,
  wallStretches,
  type RoomBlockInput,
  type RoomBlockPlan,
  type RoomDoorInput,
  type RoomDoorRun,
  type RoomDoorRunsInput,
  type WallStretch,
} from './route-room-doors.js';
import type { EntryCandidate } from './route-room-entry.js';
import { roomFeed, type RoomFeed } from './route-room-feed.js';
import type { RoomRun } from './route-room-runs.js';
import { BEND_PENALTY_MM } from './route-hanan.js';

const rectRing = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const ROOM: Pick<Room, 'id' | 'polygon'> = { id: 'room-test', polygon: { outer: rectRing(0, 0, 6000, 4000), holes: [] } };

const DIAGONAL_ROOM: Pick<Room, 'id' | 'polygon'> = {
  id: 'room-diagonal',
  polygon: {
    outer: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3900 },
      { x: 5900, y: 4000 },
      { x: 0, y: 4000 },
    ],
    holes: [],
  },
};

const WIDE_ROOM: Pick<Room, 'id' | 'polygon'> = { id: 'room-wide', polygon: { outer: rectRing(0, 0, 200000, 4000), holes: [] } };

const SQUARE: Pick<Room, 'id' | 'polygon'> = { id: 'room-square', polygon: { outer: rectRing(0, 0, 6000, 6000), holes: [] } };

const WEST_ONLY = (p: Vec2): boolean => p.x < 0;

const SOUTH_ONLY = (p: Vec2): boolean => p.y > 6000;

const CORNERS: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 0, y: 4000 },
  { x: 6000, y: 4000 },
];

const band = (p: Vec2): boolean => p.y >= -3000 && p.y <= -300;

const scene = (overrides: Partial<RoomDoorInput> = {}): RoomDoorInput => ({
  room: ROOM,
  mmPerPt: 1,
  corridorAt: band,
  portsMm: [],
  blockers: [],
  clearanceMm: 150,
  doorMarginMm: 200,
  ...overrides,
});

const at = (id: string, x: number, y: number): { id: string; point: Vec2 } => ({ id, point: { x, y } });

const runScene = (ports: { id: string; point: Vec2 }[], overrides: Partial<RoomDoorRunsInput> = {}): RoomDoorRunsInput => ({
  ...scene({ portsMm: ports.map((p) => p.point) }),
  ports,
  ...overrides,
});

const bestOf = (input: RoomDoorRunsInput): RoomDoorRun => {
  const runs = roomDoorRuns(input);
  expect(runs.length).toBeGreaterThan(0);
  return runs[0]!;
};

const piecesOf = (run: RoomRun): Vec2[][] => [run.lead, run.stem, ...run.teeth].filter((p) => p.length >= 2);

const endsAt = (run: RoomRun, p: Vec2): number =>
  piecesOf(run).filter((piece) => dist(piece[0]!, p) <= 1 || dist(piece[piece.length - 1]!, p) <= 1).length;

const projectionOf = (stretch: WallStretch, p: Vec2): number => {
  const len = dist(stretch.a, stretch.b);
  return ((p.x - stretch.a.x) * (stretch.b.x - stretch.a.x) + (p.y - stretch.a.y) * (stretch.b.y - stretch.a.y)) / len;
};

const sampledOf = (piece: readonly Vec2[]): Vec2[] =>
  piece.flatMap((p, i) => (i === 0 ? [p] : [{ x: (piece[i - 1]!.x + p.x) / 2, y: (piece[i - 1]!.y + p.y) / 2 }, p]));

const segmentCrossing = (p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null => {
  const rx = r.x - p.x;
  const ry = r.y - p.y;
  const sx = s.x - q.x;
  const sy = s.y - q.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
  const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p.x + t * rx, y: p.y + t * ry };
};

const HOLE_CLUSTER_MM = 300;

describe('wallStretches', () => {
  it('gives one stretch on the top edge with the thickness of the corridor wall', () => {
    const stretches = wallStretches(scene());
    expect(stretches).toHaveLength(1);
    const [stretch] = stretches;
    expect(stretch!.edgeIndex).toBe(0);
    expect(stretch!.outward).toEqual({ x: 0, y: -1 });
    expect(stretch!.loMm).toBe(0);
    expect(stretch!.hiMm).toBe(6000);
    expect(stretch!.thicknessMm).toBe(300);
  });

  it('cuts the stretch to the part of the top edge that faces the corridor', () => {
    const narrow = (p: Vec2): boolean => p.x >= 1000 && p.x <= 5000 && band(p);
    const [stretch] = wallStretches(scene({ corridorAt: narrow }));
    expect(stretch).toBeDefined();
    expect(Math.abs(stretch!.loMm - 1000)).toBeLessThanOrEqual(50);
    expect(Math.abs(stretch!.hiMm - 5000)).toBeLessThanOrEqual(50);
  });

  it('gives no stretch on a slanted edge', () => {
    const stretches = wallStretches(scene({ room: DIAGONAL_ROOM, corridorAt: () => true }));
    expect(stretches.some((s) => s.edgeIndex === 2)).toBe(false);
    expect(stretches.some((s) => s.edgeIndex === 0)).toBe(true);
  });

  it('hides the stretch when another room lies in the probe ray', () => {
    const otherRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    expect(wallStretches(scene({ otherRoomAt }))).toEqual([]);
    expect(wallStretches(scene())).toHaveLength(1);
  });

  it('passes a room in the probe ray when passableRoomAt is true there', () => {
    const otherRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    const passableRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    const [stretch] = wallStretches(scene({ otherRoomAt, passableRoomAt }));
    expect(stretch).toBeDefined();
    expect(stretch!.thicknessMm).toBe(300);
  });

  it('still hides the stretch when passableRoomAt is absent', () => {
    const otherRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    expect(wallStretches(scene({ otherRoomAt }))).toEqual([]);
  });

  it('still hides the stretch when passableRoomAt is false in the probe ray', () => {
    const otherRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    const passableRoomAt = (): boolean => false;
    expect(wallStretches(scene({ otherRoomAt, passableRoomAt }))).toEqual([]);
  });
});

describe('roomDoorCandidates', () => {
  it('puts a port-line door on the ring in line with the terminal', () => {
    const candidates = roomDoorCandidates(scene({ portsMm: [{ x: 2500, y: 2000 }] }));
    const line = candidates.find((c) => c.door.source === 'port-line' && c.door.pointMm.x === 2500);
    expect(line).toBeDefined();
    expect(line!.door.pointMm).toEqual({ x: 2500, y: 0 });
    for (const c of candidates) {
      expect(c.door.pointMm.y).toBe(0);
      expect(c.door.pointMm.x).toBeGreaterThanOrEqual(200);
      expect(c.door.pointMm.x).toBeLessThanOrEqual(5800);
      for (const corner of CORNERS) expect(dist(c.door.pointMm, corner)).toBeGreaterThanOrEqual(200);
    }
  });

  it('clamps a door of a terminal near the corner to the door margin', () => {
    const xs = roomDoorCandidates(scene({ portsMm: [{ x: 50, y: 2000 }] })).map((c) => c.door.pointMm.x);
    expect(xs).toContain(200);
    expect(xs.filter((x) => x < 200)).toEqual([]);
  });

  it('gives no door when no corridor is found', () => {
    expect(roomDoorCandidates(scene({ corridorAt: () => false, portsMm: [{ x: 2500, y: 2000 }] }))).toEqual([]);
  });

  it('removes every door within the clearance of a blocker', () => {
    const blocker = [
      { x: 2400, y: -400 },
      { x: 2400, y: 400 },
    ];
    const ports = [{ x: 2500, y: 2000 }];
    const without = roomDoorCandidates(scene({ portsMm: ports }));
    const withBlocker = roomDoorCandidates(scene({ portsMm: ports, blockers: [blocker] }));
    expect(without.some((c) => distanceToPath(c.door.pointMm, blocker) < 150)).toBe(true);
    for (const c of withBlocker) expect(distanceToPath(c.door.pointMm, blocker)).toBeGreaterThanOrEqual(150);
  });

  it('never returns more than the cap of own doors', () => {
    const doors = roomDoorCandidates(scene({ room: WIDE_ROOM, stepMm: 10 }));
    expect(doors.length).toBe(MAX_OWN_DOORS);
  });

  it('does not hang on a zero step and falls back to the default step', () => {
    const doors = roomDoorCandidates(scene({ portsMm: [{ x: 2500, y: 2000 }], stepMm: 0 }));
    expect(doors.length).toBeGreaterThan(0);
  });
});

describe('roomDoorRuns', () => {
  it('runs one straight lead to a single terminal in line with the door', () => {
    const best = bestOf(runScene([at('T', 2500, 2000)]));
    expect(best.run.pattern).toBe('single');
    expect(best.run.bends).toBe(0);
    expect(best.run.lead).toHaveLength(2);
    expect(best.door.pointMm).toEqual({ x: 2500, y: 0 });
    const [stretch] = wallStretches(scene());
    const expected = (2500 - stretch!.loMm) / (stretch!.hiMm - stretch!.loMm);
    expect(Math.abs(best.fraction - expected)).toBeLessThan(0.01);
  });

  it('gives one bend to a single terminal at the margin corner', () => {
    const best = bestOf(runScene([at('T', 50, 2000)]));
    expect(best.run.pattern).toBe('single');
    expect(best.run.bends).toBe(1);
    expect(best.door.pointMm.x).toBe(200);
  });

  it('joins six terminals in three rows to one comb with the stem at the middle', () => {
    const ports = [
      at('A', 1500, 1000),
      at('B', 2500, 1000),
      at('C', 1500, 2000),
      at('D', 2500, 2000),
      at('E', 1500, 3000),
      at('F', 2500, 3000),
    ];
    const best = bestOf(runScene(ports));
    expect(best.run.pattern).toBe('comb');
    expect(best.run.bends).toBe(0);
    expect(best.run.teeth).toHaveLength(6);
    expect(best.run.leftPortIds).toEqual([]);
    expect(Math.abs(best.door.pointMm.x - 2000)).toBeLessThanOrEqual(1);
    expect(best.door.source).toBe('port-line');
    for (const p of ports) expect(endsAt(best.run, p.point)).toBe(1);
  });

  it('joins two terminals on one side of the middle to a comb at the pair middle', () => {
    const best = bestOf(runScene([at('A', 2000, 2000), at('B', 2800, 2000)]));
    expect(best.run.pattern).toBe('comb');
    expect(best.run.teeth).toHaveLength(2);
    expect(Math.abs(best.door.pointMm.x - 2400)).toBeLessThanOrEqual(1);
    expect(best.door.source).toBe('port-line');
  });

  it('keeps a terminal on the wall line in fallback for every door', () => {
    const input = runScene([at('T', 3000, 0)]);
    const runs = roomDoorRuns(input);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.run.pattern).toBe('fallback');
    expect(runs).toHaveLength(roomDoorCandidates(input).length);
  });

  it('gives the same runs when the terminals are reversed', () => {
    const ports = [at('A', 2000, 2000), at('B', 2800, 2000), at('C', 1000, 3000)];
    expect(roomDoorRuns(runScene([...ports].reverse()))).toEqual(roomDoorRuns(runScene(ports)));
  });

  it('sorts the runs by cost with the cheapest first', () => {
    const runs = roomDoorRuns(runScene([at('T', 2500, 2000)]));
    expect(runs.length).toBeGreaterThan(1);
    for (let i = 1; i < runs.length; i++) expect(runs[i]!.costMm).toBeGreaterThanOrEqual(runs[i - 1]!.costMm);
    expect(runs[0]!.costMm).toBe(Math.min(...runs.map((r) => r.costMm)));
  });

  it('gives no run when the corridor is missing', () => {
    expect(roomDoorRuns(runScene([at('T', 2500, 2000)], { corridorAt: () => false }))).toEqual([]);
  });

  it('gives no run and no door when another room lies in the probe ray', () => {
    const otherRoomAt = (p: Vec2): boolean => p.y >= -200 && p.y <= -100;
    expect(roomDoorCandidates(scene({ otherRoomAt, portsMm: [{ x: 2500, y: 2000 }] }))).toEqual([]);
    expect(roomDoorRuns(runScene([at('T', 2500, 2000)], { otherRoomAt }))).toEqual([]);
  });

  it('gives the cost of a single run as length plus the bend penalty', () => {
    const best = bestOf(runScene([at('T', 2500, 2000)]));
    expect(best.run.pattern).toBe('single');
    expect(best.costMm).toBeCloseTo(best.run.lengthMm + best.run.bends * BEND_PENALTY_MM, 6);
  });

  it('gives the cost of a fallback run as one left terminal', () => {
    const best = bestOf(runScene([at('T', 3000, 0)]));
    expect(best.run.pattern).toBe('fallback');
    expect(best.costMm).toBeCloseTo(5000, 6);
  });

  it('keeps the door of the run when the run moves it onto the terminal line', () => {
    const best = bestOf(runScene([at('T', 2530, 2000)]));
    expect(best.run.pattern).toBe('single');
    expect(best.run.lead[0]).toEqual(best.door.pointMm);
    expect(best.run.bends).toBe(0);
  });
});

describe('roomBlockRuns', () => {
  const EIGHT_IN_FOUR_ROWS = [
    at('A', 2000, 700),
    at('B', 4400, 700),
    at('C', 2000, 2500),
    at('D', 4400, 2500),
    at('E', 2000, 3500),
    at('F', 4400, 3500),
    at('G', 2000, 5300),
    at('H', 4400, 5300),
  ];
  const SIX_IN_THREE_ROWS = [at('A', 2000, 700), at('B', 4400, 700), at('C', 2000, 2500), at('D', 4400, 2500), at('E', 2000, 5300), at('F', 4400, 5300)];

  const blockScene = (ports: { id: string; point: Vec2 }[], overrides: Partial<RoomBlockInput> = {}): RoomBlockInput => ({
    ...runScene(ports, { room: SQUARE, corridorAt: WEST_ONLY }),
    splitFromTerminals: 6,
    ...overrides,
  });

  const servedBy = (plan: RoomBlockPlan, ports: { id: string; point: Vec2 }[]): number[] =>
    plan.blocks.map((block) => ports.filter((p) => endsAt(block.run, p.point) === 1).length);

  it('splits eight terminals in 4 rows of 2 into 2 blocks of 4 with one door each', () => {
    const plans = roomBlockRuns(blockScene(EIGHT_IN_FOUR_ROWS));
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    expect(plan!.holes).toBe(2);
    expect(plan!.blocks).toHaveLength(2);
    expect(dist(plan!.blocks[0]!.door.pointMm, plan!.blocks[1]!.door.pointMm)).toBeGreaterThanOrEqual(800);
    for (const block of plan!.blocks) {
      expect(block.run.pattern).toBe('blocks');
      expect(block.run.bends).toBe(0);
    }
    expect(servedBy(plan!, EIGHT_IN_FOUR_ROWS).sort((p, q) => p - q)).toEqual([4, 4]);
    const served = plan!.blocks.flatMap((block) => EIGHT_IN_FOUR_ROWS.filter((p) => endsAt(block.run, p.point) === 1));
    expect(new Set(served.map((p) => p.id)).size).toBe(8);
  });

  it('splits six terminals in 3 rows into a block of 4 and a block of 2', () => {
    const plans = roomBlockRuns(blockScene(SIX_IN_THREE_ROWS));
    expect(plans).toHaveLength(1);
    expect(servedBy(plans[0]!, SIX_IN_THREE_ROWS).sort((p, q) => p - q)).toEqual([2, 4]);
    for (const block of plans[0]!.blocks) expect(block.run.pattern).toBe('blocks');
  });

  it('gives no plan when the split is off', () => {
    expect(roomBlockRuns(blockScene(SIX_IN_THREE_ROWS, { splitFromTerminals: Infinity }))).toEqual([]);
  });

  it('gives no plan when the door wall is perpendicular to the columns', () => {
    expect(roomBlockRuns(blockScene(SIX_IN_THREE_ROWS, { corridorAt: SOUTH_ONLY }))).toEqual([]);
  });

  it('calls the fallback hook for every door when the comb and the L fail', () => {
    const calls: EntryCandidate[] = [];
    const feed: RoomFeed = { stub: [], junctionMm: { x: 0, y: 0 }, spine: [], leftPortIds: ['A', 'B'], lengthMm: 0, bends: 0 };
    const input = runScene([at('A', 2000, 0), at('B', 2800, 2000)], {
      roomFeedFallback: (door) => {
        calls.push(door);
        return feed;
      },
    });
    const runs = roomDoorRuns(input);
    expect(runs.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(roomDoorCandidates(input).length);
    for (const r of runs) {
      expect(r.run.pattern).toBe('fallback');
      expect(r.run.leftPortIds).toEqual(['A', 'B']);
    }
  });

  it('keeps every block piece inside the room and shares no piece between two blocks', () => {
    const [plan] = roomBlockRuns(blockScene(EIGHT_IN_FOUR_ROWS));
    expect(plan).toBeDefined();
    const inside = insideRouteArea([SQUARE], 1);
    for (const block of plan!.blocks) {
      for (const piece of piecesOf(block.run)) {
        for (const p of sampledOf(piece)) expect(inside(p)).toBe(true);
      }
    }
    const [first, second] = plan!.blocks;
    for (const piece of piecesOf(first!.run)) {
      for (const other of piecesOf(second!.run)) {
        for (let i = 1; i < piece.length; i++) {
          for (let j = 1; j < other.length; j++) {
            expect(segmentsMeet(piece[i - 1]!, piece[i]!, other[j - 1]!, other[j]!)).toBe(false);
          }
        }
      }
    }
  });

  it('gives no plan when one block has no door', () => {
    const ports = [at('A', 2000, 700), at('B', 4400, 700), at('C', 2000, 2500), at('D', 4400, 2500), at('F', 0, 3500), at('G', 2000, 5300), at('H', 4400, 5300)];
    expect(roomBlockRuns(blockScene(ports))).toEqual([]);
  });

  it('gives no plan when no two doors of the blocks are far enough apart', () => {
    expect(roomBlockRuns(blockScene(EIGHT_IN_FOUR_ROWS, { minDoorGapMm: 10000 }))).toEqual([]);
  });

  it('keeps the doors of the blocks at least minDoorGapMm apart when a plan is found', () => {
    const plans = roomBlockRuns(blockScene(EIGHT_IN_FOUR_ROWS, { minDoorGapMm: 2000 }));
    for (const plan of plans) {
      expect(dist(plan.blocks[0]!.door.pointMm, plan.blocks[1]!.door.pointMm)).toBeGreaterThanOrEqual(2000);
    }
  });

  it('takes the comb with no bend for two terminals in a row', () => {
    const best = bestOf(runScene([at('A', 2000, 2000), at('B', 2800, 2000)]));
    expect(best.run.pattern).toBe('comb');
    expect(best.run.bends).toBe(0);
    expect(best.costMm).toBeCloseTo(best.run.lengthMm, 6);
  });
});

describe('segmentsMeet', () => {
  const p = (x: number, y: number): Vec2 => ({ x, y });

  it('finds a crossing of two segments', () => {
    expect(segmentsMeet(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });

  it('finds a touch at an end point', () => {
    expect(segmentsMeet(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBe(true);
  });

  it('finds an overlap of two parallel segments on one line', () => {
    expect(segmentsMeet(p(0, 0), p(10, 0), p(5, 0), p(20, 0))).toBe(true);
  });

  it('gives no meeting for parallel segments on two lines and for disjoint segments', () => {
    expect(segmentsMeet(p(0, 0), p(10, 0), p(0, 5), p(10, 5))).toBe(false);
    expect(segmentsMeet(p(0, 0), p(10, 0), p(11, -5), p(11, 5))).toBe(false);
    expect(segmentsMeet(p(0, 0), p(10, 0), p(20, 0), p(30, 0))).toBe(false);
  });
});

describe('roomDoorRuns on the manual fixture', () => {
  it('plans the served rooms with their own doors and prints the report', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s, manual } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const toPt = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
    const areaIds = new Set(s.area.rooms.map((a) => a.roomId));
    const areaRoomObjects = s.drawing.rooms.filter((r) => areaIds.has(r.id));
    const corridorAt = (p: Vec2): boolean => areaRoomObjects.some((r) => roomContainsPoint(r, toPt(p)));
    const otherRoomFor =
      (room: Room) =>
      (p: Vec2): boolean =>
        s.drawing.rooms.some((r) => r.id !== room.id && !areaIds.has(r.id) && roomContainsPoint(r, toPt(p)));
    const handLengthMm = (room: Room): number => {
      let sum = 0;
      for (const path of manual.room) {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          if (roomContainsPoint(room, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) sum += dist(a, b) * mmPerPt;
        }
      }
      return sum;
    };

    const inputOf = (room: Room): RoomDoorRunsInput => {
      const ports = s.targetPorts.filter((p) => p.roomId === room.id);
      return {
        room,
        mmPerPt,
        corridorAt,
        otherRoomAt: otherRoomFor(room),
        portsMm: ports.map((p) => toMm(p.world)),
        ports: ports.map((p) => ({ id: `${p.stampId}/${p.portId}`, point: toMm(p.world) })),
        blockers: [],
        clearanceMm: 150,
        doorMarginMm: 200,
      };
    };
    const planRoom = (room: Room) => {
      const ports = s.targetPorts.filter((p) => p.roomId === room.id);
      const input = inputOf(room);
      return {
        room,
        ports,
        stretches: wallStretches(input),
        candidates: roomDoorCandidates(input),
        runs: roomDoorRuns(input),
      };
    };
    type Planned = ReturnType<typeof planRoom>;
    const nonFallbackOf = (runs: readonly RoomDoorRun[]): number => runs.filter((r) => r.run.pattern !== 'fallback').length;

    const served = s.servedRooms.map(planRoom);
    const planned = (id: string): Planned | null => {
      const hit = served.find((p) => p.room.id === id);
      if (hit) return hit;
      const room = s.drawing.rooms.find((r) => r.id === id);
      return room ? planRoom(room) : null;
    };

    const rowOf = ({ room, ports, stretches, candidates, runs }: Planned): string => {
      const label = `${room.id} (${room.number ?? '-'})`;
      const hand = (handLengthMm(room) / 1000).toFixed(2);
      const best = runs[0];
      if (!best) {
        return [label, String(ports.length), `no door (${stretches.length} stretches)`, '-', '-', '-', '-', hand, String(candidates.length), '0'].join(' | ');
      }
      return [
        label,
        String(ports.length),
        best.run.pattern,
        `${best.door.pointMm.x.toFixed(0)},${best.door.pointMm.y.toFixed(0)}`,
        best.fraction.toFixed(2),
        String(best.run.bends),
        (best.run.lengthMm / 1000).toFixed(2),
        hand,
        String(candidates.length),
        String(nonFallbackOf(runs)),
      ].join(' | ');
    };
    console.log(
      [
        `P2 T08b: roomDoorRuns on the manual fixture (${s.servedRooms.length} served rooms)`,
        'room | terminals | pattern | door x,y mm | wall fraction | bends | branch m | hand route m | candidates | non-fallback doors',
        ...served.map(rowOf),
      ].join('\n'),
    );

    const SINGLE_ROOMS = ['room-6', 'room-27', 'room-30', 'room-32', 'room-33', 'room-34', 'room-36', 'room-37', 'room-39', 'room-42', 'room-43', 'room-44'];
    const MARGIN_MM = 200;
    const kindOf = (best: RoomDoorRun | undefined): string => {
      if (!best || best.run.pattern === 'fallback') return 'none/fallback';
      if (best.run.pattern === 'single') return best.run.bends === 0 ? 'straight' : 'L';
      return best.run.pattern;
    };
    const singleLines: string[] = [];
    let straight = 0;
    for (const id of SINGLE_ROOMS) {
      const p = planned(id);
      if (!p) {
        singleLines.push(`${id}: not in the fixture`);
        continue;
      }
      const kind = kindOf(p.runs[0]);
      if (kind === 'straight') straight++;
      singleLines.push(`${id} (${p.room.number ?? '-'}): ${kind}`);
      if (kind === 'straight') continue;
      if (p.stretches.length === 0) {
        singleLines.push('  no stretch');
        continue;
      }
      const ports = p.ports.map((q) => toMm(q.world));
      for (const st of p.stretches) {
        const lo = st.loMm + MARGIN_MM;
        const hi = st.hiMm - MARGIN_MM;
        const cells = ports.map((q) => {
          const v = projectionOf(st, q);
          return `${v.toFixed(0)} ${v >= lo && v <= hi ? 'inside' : 'outside'}`;
        });
        singleLines.push(
          `  edge ${st.edgeIndex}, stretch ${st.loMm.toFixed(0)}-${st.hiMm.toFixed(0)} mm, usable ${lo.toFixed(0)}-${hi.toFixed(0)} mm: terminal projections ${cells.join(', ') || 'none'}`,
        );
      }
    }
    console.log(['P2 T08b single rooms', `straight ${straight} of ${SINGLE_ROOMS.length}`, ...singleLines].join('\n'));

    const COMB_ROOMS = ['room-5', 'room-24', 'room-29', 'room-7', 'room-8', 'room-9', 'room-26', 'room-31', 'room-20', 'room-22'];
    const combLines = COMB_ROOMS.map((id) => {
      const p = planned(id);
      if (!p) return `${id}: not in the fixture`;
      const best = p.runs[0];
      const label = `${id} (${p.room.number ?? '-'})`;
      if (!best) return `${label}: no door, ${p.stretches.length} stretches`;
      return `${label}: pattern ${best.run.pattern}, doors ${p.runs.length} (non-fallback ${nonFallbackOf(p.runs)}), bends ${best.run.bends}, branch ${(best.run.lengthMm / 1000).toFixed(2)} m, hand route ${(handLengthMm(p.room) / 1000).toFixed(2)} m`;
    });
    console.log(['P2 T08b comb rooms', ...combLines].join('\n'));

    const room33 = s.drawing.rooms.find((r) => r.id === 'room-33');
    const room33Lines: string[] = [];
    if (!room33) room33Lines.push('room-33: not in the fixture');
    else {
      for (const probeMm of [450, 1000]) {
        for (const withOther of [true, false]) {
          const base = { room: room33, mmPerPt, corridorAt, probeMm };
          const stretches = wallStretches(withOther ? { ...base, otherRoomAt: otherRoomFor(room33) } : base);
          const head = `probe ${probeMm} mm, other rooms ${withOther ? 'on' : 'off'}`;
          if (stretches.length === 0) room33Lines.push(`${head}: no stretch`);
          for (const st of stretches) {
            room33Lines.push(
              `${head}: edge ${st.edgeIndex}, lo ${st.loMm.toFixed(0)}, hi ${st.hiMm.toFixed(0)}, thickness ${st.thicknessMm.toFixed(0)}, outward (${st.outward.x}, ${st.outward.y})`,
            );
          }
        }
      }
    }
    console.log(['P2 T08b room-33', ...room33Lines].join('\n'));

    const handHolesOf = (room: Room): number => {
      const ringMm = room.polygon.outer.map(toMm);
      const crossings: Vec2[] = [];
      for (const path of manual.room) {
        for (let i = 1; i < path.length; i++) {
          const a = toMm(path[i - 1]!);
          const b = toMm(path[i]!);
          for (let e = 0; e < ringMm.length; e++) {
            const p = segmentCrossing(a, b, ringMm[e]!, ringMm[(e + 1) % ringMm.length]!);
            if (p) crossings.push(p);
          }
        }
      }
      const clusters: Vec2[][] = [];
      for (const p of crossings) {
        const hit = clusters.find((k) => dist(k[0]!, p) <= HOLE_CLUSTER_MM);
        if (hit) hit.push(p);
        else clusters.push([p]);
      }
      return clusters.length;
    };
    const feedFallbackOf = (room: Room, input: RoomDoorRunsInput) => (door: EntryCandidate): RoomFeed =>
      roomFeed({
        entry: door,
        ports: input.ports,
        ringMm: [...room.polygon.outer.map(toMm), toMm(room.polygon.outer[0]!)],
        inside: insideRouteArea([room], mmPerPt),
        roomContains: (p) => roomContainsPoint(room, toPt(p)),
        crossesExisting: () => 0,
      });
    const blockPlanById = new Map<string, RoomBlockPlan | undefined>(
      served.map(({ room }) => {
        const input = inputOf(room);
        const plan = roomBlockRuns({ ...input, splitFromTerminals: 6, roomFeedFallback: feedFallbackOf(room, input) })[0];
        return [room.id, plan];
      }),
    );
    const hookedRunsOf = (room: Room): RoomDoorRun[] => {
      const input = inputOf(room);
      return roomDoorRuns({ ...input, roomFeedFallback: feedFallbackOf(room, input) });
    };
    const blockRows = served.map(({ room, ports }) => {
      const label = `${room.id} (${room.number ?? '-'})`;
      const best = hookedRunsOf(room)[0];
      const plan = blockPlanById.get(room.id);
      const blockCell = plan
        ? `(${plan.outward.x}, ${plan.outward.y}), holes ${plan.holes}, branch ${(plan.blocks.reduce((sum, b) => sum + b.run.lengthMm, 0) / 1000).toFixed(2)} m, bends ${plan.blocks.reduce((sum, b) => sum + b.run.bends, 0)}`
        : '-';
      return [
        label,
        String(ports.length),
        best ? best.run.pattern : 'no door',
        best ? '1' : '0',
        best ? String(best.run.bends) : '-',
        best ? (best.run.lengthMm / 1000).toFixed(2) : '-',
        best ? String(best.run.leftPortIds.length) : '-',
        String(handHolesOf(room)),
        (handLengthMm(room) / 1000).toFixed(2),
        blockCell,
      ].join(' | ');
    });
    console.log(
      [
        'P2 T09 rooms',
        'room | terminals | best single-door pattern | holes | bends | branch m | left ports | hand holes | hand route m | block plan (outward, holes, branch m, bends)',
        ...blockRows,
      ].join('\n'),
    );

    expect(blockPlanById.get('room-26')?.blocks).toHaveLength(2);
    for (const { room, runs } of served) {
      const inside = insideRouteArea([room], mmPerPt);
      const runsToCheck = runs.filter((r) => r.run.pattern !== 'fallback').map((r) => r.run);
      const plan = blockPlanById.get(room.id);
      if (plan) runsToCheck.push(...plan.blocks.map((b) => b.run));
      for (const run of runsToCheck) {
        for (const piece of piecesOf(run)) {
          for (const p of sampledOf(piece)) expect(inside(p)).toBe(true);
        }
      }
    }

    expect(s.servedRooms.length).toBeGreaterThan(0);
    expect(served.some((p) => p.runs.length > 0)).toBe(true);
    for (const { room, ports, runs } of served) {
      const best = runs[0];
      if (!best) continue;
      const ringMm = [...room.polygon.outer.map(toMm), toMm(room.polygon.outer[0]!)];
      expect(distanceToPath(best.door.pointMm, ringMm)).toBeLessThanOrEqual(2);
      if (best.run.pattern === 'fallback') continue;
      const pieces = piecesOf(best.run);
      for (const port of ports) {
        expect(pieces.some((piece) => dist(piece[piece.length - 1]!, toMm(port.world)) <= 1)).toBe(true);
      }
    }
  }, 120000);
});
