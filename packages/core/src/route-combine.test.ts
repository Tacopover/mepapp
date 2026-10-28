import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { insideRouteArea, withWallGaps } from './route-layout.js';
import { bridgeRoomAllowed, mainBridgeLines, mainRunLines, planMainRun, type BridgeRoom, type MainDemand } from './route-main-run.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import { dist, distanceToPath } from './route-feed-helpers.js';
import {
  roomBlockRuns,
  roomDoorCandidates,
  roomDoorRuns,
  type RoomBlockInput,
  type RoomBlockPlan,
  type RoomDoorInput,
  type RoomDoorRun,
  type RoomDoorRunsInput,
} from './route-room-doors.js';
import type { EntryCandidate } from './route-room-entry.js';
import { roomFeed, type RoomFeed } from './route-room-feed.js';
import type { RoomRun } from './route-room-runs.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { manualScenario, seededShuffle } from './route-scenario.testutil.js';
import { getStampWorldPorts } from './stamp.js';
import { combineRoomRuns, runCostMm, type CombineInput, type CombineRoom, type RoomDoorPlan, type RoomFeedMulti } from './route-combine.js';

const rectRing = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const roomOf = (id: string, x0: number, y0: number, x1: number, y1: number): Room => ({
  id,
  pageIndex: 0,
  polygon: { outer: rectRing(x0, y0, x1, y1), holes: [] },
  name: null,
  number: null,
  source: 'manual',
  locked: false,
  open: false,
});

const lengthOf = (path: readonly Vec2[]): number => {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += dist(path[i - 1]!, path[i]!);
  return sum;
};

const topDoor = (x: number): EntryCandidate => ({ pointMm: { x, y: 0 }, outward: { x: 0, y: -1 }, source: 'ring' });

const westDoor = (y: number): EntryCandidate => ({ pointMm: { x: 0, y }, outward: { x: -1, y: 0 }, source: 'ring' });

const runOf = (room: Room, door: EntryCandidate, lead: Vec2[], extra: Partial<RoomRun> = {}): RoomRun => ({
  roomId: room.id,
  door,
  stem: [],
  teeth: [],
  lead,
  bends: Math.max(0, lead.length - 2),
  lengthMm: lengthOf(lead),
  leftPortIds: [],
  pattern: 'single',
  ...extra,
});

const doorRunOf = (room: Room, door: EntryCandidate, lead: Vec2[], extra: Partial<RoomRun> = {}): RoomDoorRun => {
  const run = runOf(room, door, lead, extra);
  return { door, fraction: 0.5, edgeIndex: 0, run, costMm: runCostMm(run, BEND_PENALTY_MM) };
};

const planOf = (blocks: RoomDoorRun[]): RoomBlockPlan => ({
  outward: { x: 0, y: -1 },
  blocks,
  costMm: blocks.reduce((sum, b) => sum + b.costMm, 0),
  holes: blocks.length,
});

const LEG_Y1000: Vec2[][] = [[{ x: 0, y: -1000 }, { x: 6000, y: -1000 }]];
const LEG_Y500: Vec2[][] = [[{ x: 0, y: -500 }, { x: 6000, y: -500 }]];

const combine = (rooms: CombineRoom[], overrides: Partial<CombineInput> = {}): ReturnType<typeof combineRoomRuns> =>
  combineRoomRuns({
    tree: LEG_Y1000,
    startMm: { x: 0, y: -1000 },
    rooms,
    allRooms: rooms.map((cr) => cr.room),
    mmPerPt: 1,
    blockers: [],
    clearanceMm: 150,
    doorMarginMm: 200,
    ...overrides,
  });

const rowOf = (rows: RoomFeedMulti[], roomId: string): RoomFeedMulti => {
  const row = rows.find((r) => r.roomId === roomId);
  expect(row).toBeDefined();
  return row!;
};

const expectNoBranchAlongCarrier = (rows: RoomFeedMulti[], tree: readonly (readonly Vec2[])[]): void => {
  for (const row of rows) {
    for (const d of row.doors) {
      const [pathIndex, legIndex] = d.carrierId.split('#').map(Number);
      const a = tree[pathIndex!]![legIndex!]!;
      const b = tree[pathIndex!]![legIndex! + 1]!;
      const p = d.branch[0]!;
      const q = d.branch[1]!;
      const cross = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
      expect(Math.abs(cross), `${row.roomId} first segment on ${d.carrierId}`).toBeGreaterThan(1e-6);
    }
  }
};

const ROOM_A = roomOf('room-a', 0, 0, 6000, 4000);

describe('combineRoomRuns: tree legs and tee spacing', () => {
  it('takes a straight branch to a door whose foot lies on a tree leg', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [{ id: 'a1', point: { x: 2500, y: 2000 } }],
        singles: [doorRunOf(ROOM_A, topDoor(2500), [{ x: 2500, y: 0 }, { x: 2500, y: 2000 }])],
        blockPlans: [],
      },
    ];
    const result = combine(rooms);
    expect(result.unfedRoomIds).toEqual([]);
    const [door] = rowOf(result.rooms, 'room-a').doors;
    expect(door!.branch).toEqual([{ x: 2500, y: -1000 }, { x: 2500, y: 0 }]);
    expect(door!.tapMm.x).toBe(2500);
    expect(door!.carrierId).toBe('0#0');
  });

  it('keeps 600 mm between the tees of two rooms on one leg by default and the duct width when it is larger', () => {
    const roomA = roomOf('room-a', 0, 0, 1100, 4000);
    const roomB = roomOf('room-b', 1200, 0, 5000, 4000);
    const rooms: CombineRoom[] = [
      {
        room: roomA,
        ports: [{ id: 'a1', point: { x: 1000, y: 2000 } }],
        singles: [doorRunOf(roomA, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }])],
        blockPlans: [],
      },
      {
        room: roomB,
        ports: [{ id: 'b1', point: { x: 1800, y: 2000 } }],
        singles: [doorRunOf(roomB, topDoor(1200), [{ x: 1200, y: 0 }, { x: 1200, y: 2000 }, { x: 1800, y: 2000 }])],
        blockPlans: [],
      },
    ];
    const result = combine(rooms);
    const tapA = rowOf(result.rooms, 'room-a').doors[0]!.tapMm;
    const tapB = rowOf(result.rooms, 'room-b').doors[0]!.tapMm;
    expect(dist(tapA, tapB)).toBeGreaterThanOrEqual(600 - 1e-6);
    expectNoBranchAlongCarrier(result.rooms, LEG_Y1000);

    const wide = combine(rooms, { teeSpacingMm: 300, ductWidthMm: 900 });
    const wideA = rowOf(wide.rooms, 'room-a').doors[0]!.tapMm;
    const wideB = rowOf(wide.rooms, 'room-b').doors[0]!.tapMm;
    expect(dist(wideA, wideB)).toBeGreaterThanOrEqual(900 - 1e-6);
    expectNoBranchAlongCarrier(wide.rooms, LEG_Y1000);
  });

  it('does not serve a room from a line that is not in the tree', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [{ id: 'a1', point: { x: 2500, y: 2000 } }],
        singles: [doorRunOf(ROOM_A, topDoor(2500), [{ x: 2500, y: 0 }, { x: 2500, y: 2000 }])],
        blockPlans: [],
      },
    ];
    const near = combine(rooms, { tree: LEG_Y500, searchMm: 3000, maxChainDepth: 0 });
    expect(rowOf(near.rooms, 'room-a').doors).toHaveLength(1);
    const result = combine(rooms, { tree: [[{ x: 0, y: -5000 }, { x: 6000, y: -5000 }]], searchMm: 3000, maxChainDepth: 0 });
    expect(result.rooms).toEqual([]);
    expect(result.unfedRoomIds).toEqual(['room-a']);
  });

  it('refuses a branch that crosses another room with terminals', () => {
    const roomB = roomOf('room-b', 0, -900, 2000, -100);
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [{ id: 'a1', point: { x: 1000, y: 2000 } }],
        singles: [doorRunOf(ROOM_A, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }])],
        blockPlans: [],
      },
      { room: roomB, ports: [{ id: 'b1', point: { x: 500, y: -500 } }], singles: [], blockPlans: [] },
    ];
    const blocked = combine(rooms, { maxChainDepth: 0 });
    expect(blocked.rooms).toEqual([]);
    expect(blocked.unfedRoomIds).toEqual(['room-a', 'room-b']);

    const free = combine([rooms[0]!], { maxChainDepth: 0 });
    expect(rowOf(free.rooms, 'room-a').doors).toHaveLength(1);
  });
});

describe('combineRoomRuns: the cheapest door', () => {
  it('takes the door with the lower total cost when one door needs an L', () => {
    const leg: Vec2[][] = [[{ x: 0, y: -1000 }, { x: 2000, y: -1000 }]];
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [{ id: 'a1', point: { x: 1000, y: 2000 } }],
        singles: [
          doorRunOf(ROOM_A, topDoor(3000), [{ x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }]),
          doorRunOf(ROOM_A, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }]),
        ],
        blockPlans: [],
      },
    ];
    const result = combine(rooms, { tree: leg });
    const [door] = rowOf(result.rooms, 'room-a').doors;
    expect(door!.door.pointMm).toEqual({ x: 1000, y: 0 });
    expect(door!.branch).toHaveLength(2);
  });

  it('does not offer a single run that leaves all its terminals and serves none', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [{ id: 'a1', point: { x: 2500, y: 2000 } }],
        singles: [doorRunOf(ROOM_A, topDoor(2500), [{ x: 2500, y: 0 }], { pattern: 'fallback', leftPortIds: ['a1'], lengthMm: 0, bends: 0 })],
        blockPlans: [],
      },
    ];
    const result = combine(rooms, { maxChainDepth: 0 });
    expect(result.rooms).toEqual([]);
    expect(result.unfedRoomIds).toEqual(['room-a']);
  });

  it('charges LEFT_PORT_MM for a left terminal and takes the farther door that serves both', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: [
          { id: 'a1', point: { x: 2500, y: 2000 } },
          { id: 'a2', point: { x: 2500, y: 3000 } },
        ],
        singles: [
          doorRunOf(ROOM_A, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }], { leftPortIds: ['a2'] }),
          doorRunOf(ROOM_A, topDoor(2500), [{ x: 2500, y: 0 }, { x: 2500, y: 3000 }], { pattern: 'comb' }),
        ],
        blockPlans: [],
      },
    ];
    const result = combine(rooms);
    const row = rowOf(result.rooms, 'room-a');
    expect(row.doors[0]!.door.pointMm).toEqual({ x: 2500, y: 0 });
    expect(row.leftPortIds).toEqual([]);
  });
});

describe('combineRoomRuns: block plans', () => {
  const EIGHT_IN_FOUR_ROWS = [
    { id: 'A', point: { x: 2000, y: 700 } },
    { id: 'B', point: { x: 4400, y: 700 } },
    { id: 'C', point: { x: 2000, y: 2500 } },
    { id: 'D', point: { x: 4400, y: 2500 } },
    { id: 'E', point: { x: 2000, y: 3500 } },
    { id: 'F', point: { x: 4400, y: 3500 } },
    { id: 'G', point: { x: 2000, y: 5300 } },
    { id: 'H', point: { x: 4400, y: 5300 } },
  ];
  const SQUARE = roomOf('room-sq', 0, 0, 6000, 6000);
  const WEST_ONLY = (p: Vec2): boolean => p.x < 0;

  const planFor = (): RoomBlockPlan => {
    const input: RoomBlockInput = {
      room: SQUARE,
      mmPerPt: 1,
      corridorAt: WEST_ONLY,
      portsMm: EIGHT_IN_FOUR_ROWS.map((p) => p.point),
      ports: EIGHT_IN_FOUR_ROWS,
      blockers: [],
      clearanceMm: 150,
      doorMarginMm: 200,
      splitFromTerminals: 6,
    };
    const [plan] = roomBlockRuns(input);
    expect(plan).toBeDefined();
    return plan!;
  };

  const endsAt = (run: RoomRun, p: Vec2): number =>
    [run.lead, run.stem, ...run.teeth]
      .filter((piece) => piece.length >= 2)
      .filter((piece) => dist(piece[0]!, p) <= 1 || dist(piece[piece.length - 1]!, p) <= 1).length;

  it('gives two doors at least 2 x doorMarginMm + 400 apart when the tree reaches both', () => {
    const plan = planFor();
    const rooms: CombineRoom[] = [{ room: SQUARE, ports: EIGHT_IN_FOUR_ROWS, singles: [], blockPlans: [plan] }];
    const tree: Vec2[][] = [[{ x: -900, y: -200 }, { x: -900, y: 5000 }]];
    const result = combine(rooms, { tree, maxChainDepth: 0 });
    const row = rowOf(result.rooms, 'room-sq');
    expect(row.doors).toHaveLength(2);
    expect(result.unfedRoomIds).toEqual([]);
    expect(dist(row.doors[0]!.door.pointMm, row.doors[1]!.door.pointMm)).toBeGreaterThanOrEqual(2 * 200 + 400);
  });

  it('keeps block 1 served and lists the terminals of block 2 as left when only block 1 has a leg', () => {
    const plan = planFor();
    const block1 = plan.blocks[0]!;
    const block2 = plan.blocks[1]!;
    const yd0 = block1.run.door.pointMm.y;
    const rooms: CombineRoom[] = [{ room: SQUARE, ports: EIGHT_IN_FOUR_ROWS, singles: [], blockPlans: [plan] }];
    const tree: Vec2[][] = [[{ x: -900, y: yd0 - 400 }, { x: -900, y: yd0 + 400 }]];
    const result = combine(rooms, { tree, searchMm: 950, maxChainDepth: 0 });
    const row = rowOf(result.rooms, 'room-sq');
    expect(row.doors).toHaveLength(1);
    expect(row.doors[0]!.door.pointMm).toEqual(block1.run.door.pointMm);
    expect(result.unfedRoomIds).toEqual([]);
    const block2Ids = EIGHT_IN_FOUR_ROWS.filter((p) => endsAt(block2.run, p.point) === 1).map((p) => p.id).sort();
    expect(block2Ids).toHaveLength(4);
    expect(row.leftPortIds).toEqual(block2Ids);
  });
});

describe('combineRoomRuns: single door against block plan', () => {
  const planA = (): RoomBlockPlan =>
    planOf([
      doorRunOf(ROOM_A, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }]),
      doorRunOf(ROOM_A, topDoor(3000), [{ x: 3000, y: 0 }, { x: 3000, y: 1000 }]),
    ]);
  const PORTS = [
    { id: 'a1', point: { x: 1000, y: 2000 } },
    { id: 'a2', point: { x: 3000, y: 2000 } },
  ];

  it('takes the single door when the second wall price makes the plan dearer', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: PORTS,
        singles: [doorRunOf(ROOM_A, topDoor(2000), [{ x: 2000, y: 0 }, { x: 2000, y: 2000 }], { pattern: 'comb' })],
        blockPlans: [planA()],
      },
    ];
    const result = combine(rooms, { tree: LEG_Y500, maxChainDepth: 0 });
    const row = rowOf(result.rooms, 'room-a');
    expect(row.doors).toHaveLength(1);
    expect(row.doors[0]!.door.pointMm).toEqual({ x: 2000, y: 0 });
  });

  it('takes the block plan when the single run leaves a terminal to the left', () => {
    const rooms: CombineRoom[] = [
      {
        room: ROOM_A,
        ports: PORTS,
        singles: [doorRunOf(ROOM_A, topDoor(2000), [{ x: 2000, y: 0 }, { x: 2000, y: 2000 }], { leftPortIds: ['a2'] })],
        blockPlans: [
          planOf([
            doorRunOf(ROOM_A, topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 500 }]),
            doorRunOf(ROOM_A, topDoor(3000), [{ x: 3000, y: 0 }, { x: 3000, y: 500 }]),
          ]),
        ],
      },
    ];
    const result = combine(rooms, { tree: LEG_Y500, maxChainDepth: 0 });
    const row = rowOf(result.rooms, 'room-a');
    expect(row.doors.map((d) => d.door.pointMm)).toEqual([
      { x: 1000, y: 0 },
      { x: 3000, y: 0 },
    ]);
    expect(row.leftPortIds).toEqual([]);
  });
});

describe('combineRoomRuns: chain', () => {
  const ROOM_H = roomOf('room-h', 0, 0, 6000, 4000);
  const ROOM_F = roomOf('room-f', 6000, 0, 8000, 4000);
  const hostRun: RoomDoorRun = {
    door: topDoor(1000),
    fraction: 0.5,
    edgeIndex: 0,
    run: {
      roomId: 'room-h',
      door: topDoor(1000),
      stem: [{ x: 1000, y: 0 }, { x: 1000, y: 1500 }],
      teeth: [[{ x: 1000, y: 500 }, { x: 2000, y: 500 }]],
      lead: [],
      bends: 0,
      lengthMm: 2500,
      leftPortIds: [],
      pattern: 'comb',
    },
    costMm: 2500,
  };
  const hostRooms = (): CombineRoom[] => [
    { room: ROOM_H, ports: [{ id: 'h1', point: { x: 2000, y: 500 } }], singles: [hostRun], blockPlans: [] },
    { room: ROOM_F, ports: [{ id: 'f1', point: { x: 7000, y: 3000 } }], singles: [], blockPlans: [] },
  ];

  it('chains a far room to a fed host at depth 1 and starts the branch at the stem end of the host', () => {
    const result = combine(hostRooms(), { tree: LEG_Y500, maxChainDepth: 1 });
    expect(result.unfedRoomIds).toEqual([]);
    const row = rowOf(result.rooms, 'room-f');
    expect(row.chain).toEqual({ viaRoomId: 'room-h', depth: 1 });
    const branch = row.doors[0]!.branch;
    expect(branch[0]).toEqual({ x: 1000, y: 1500 });
    const tooth: Vec2[] = [{ x: 1000, y: 500 }, { x: 2000, y: 500 }];
    for (const p of branch) expect(distanceToPath(p, tooth)).toBeGreaterThan(60);
  });

  it('leaves the far room unfed when the chain depth is 0', () => {
    const result = combine(hostRooms(), { tree: LEG_Y500, maxChainDepth: 0 });
    expect(result.unfedRoomIds).toEqual(['room-f']);
    expect(result.rooms.map((r) => r.roomId)).toEqual(['room-h']);
  });

  it('chains a room through a chained host at depth 2 and leaves it unfed at depth 1', () => {
    const ROOM_M = roomOf('room-m', 6000, 0, 8000, 4000);
    const ROOM_FAR = roomOf('room-far', 8000, 0, 10000, 4000);
    const chainRooms = (): CombineRoom[] => [
      { room: ROOM_H, ports: [{ id: 'h1', point: { x: 2000, y: 500 } }], singles: [hostRun], blockPlans: [] },
      { room: ROOM_M, ports: [{ id: 'm1', point: { x: 7000, y: 500 } }], singles: [], blockPlans: [] },
      { room: ROOM_FAR, ports: [{ id: 'f1', point: { x: 9000, y: 3000 } }], singles: [], blockPlans: [] },
    ];
    const deep = combine(chainRooms(), { tree: LEG_Y500, maxChainDepth: 2 });
    expect(deep.unfedRoomIds).toEqual([]);
    expect(rowOf(deep.rooms, 'room-m').chain).toEqual({ viaRoomId: 'room-h', depth: 1 });
    expect(rowOf(deep.rooms, 'room-far').chain).toEqual({ viaRoomId: 'room-m', depth: 2 });

    const shallow = combine(chainRooms(), { tree: LEG_Y500, maxChainDepth: 1 });
    expect(shallow.unfedRoomIds).toEqual(['room-far']);
    expect(rowOf(shallow.rooms, 'room-m').chain).toEqual({ viaRoomId: 'room-h', depth: 1 });
  });
});

describe('combineRoomRuns: order and determinism', () => {
  const roomB = roomOf('room-b', 1200, 0, 5000, 4000);
  const scene = (): CombineRoom[] => [
    {
      room: roomOf('room-a', 0, 0, 1100, 4000),
      ports: [{ id: 'a1', point: { x: 1000, y: 2000 } }],
      singles: [doorRunOf(roomOf('room-a', 0, 0, 1100, 4000), topDoor(1000), [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }])],
      blockPlans: [],
    },
    {
      room: roomB,
      ports: [{ id: 'b1', point: { x: 1800, y: 2000 } }],
      singles: [doorRunOf(roomB, topDoor(1200), [{ x: 1200, y: 0 }, { x: 1200, y: 2000 }, { x: 1800, y: 2000 }])],
      blockPlans: [],
    },
  ];

  it('gives deep-equal output for the same input twice', () => {
    expect(combine(scene())).toEqual(combine(scene()));
  });

  it('gives deep-equal output when the rooms are shuffled', () => {
    const rooms = scene();
    expect(combine([...rooms].reverse())).toEqual(combine(rooms));
  });
});

describe('combineRoomRuns on the manual fixture', () => {
  const keyOfPt = (p: Vec2): string => `${Math.round(p.x)},${Math.round(p.y)}`;

  /** Count the points where exactly two path ends meet at a right angle. */
  function countBends(paths: readonly Vec2[][]): number {
    const dirsAt = new Map<string, Vec2[]>();
    const add = (p: Vec2, dir: Vec2): void => {
      dirsAt.set(keyOfPt(p), [...(dirsAt.get(keyOfPt(p)) ?? []), dir]);
    };
    for (const [a, b] of paths as Vec2[][]) {
      const len = dist(a!, b!);
      const dir = { x: (b!.x - a!.x) / len, y: (b!.y - a!.y) / len };
      add(a!, dir);
      add(b!, { x: -dir.x, y: -dir.y });
    }
    let bends = 0;
    for (const dirs of dirsAt.values()) {
      if (dirs.length !== 2) continue;
      if (Math.abs(dirs[0]!.x * dirs[1]!.x + dirs[0]!.y * dirs[1]!.y) < 0.5) bends++;
    }
    return bends;
  }

  const polyBendsOf = (path: readonly Vec2[]): number => {
    let n = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const c = path[i + 1]!;
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const vx = c.x - b.x;
      const vy = c.y - b.y;
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      if (lu === 0 || lv === 0) continue;
      if ((ux * vx + uy * vy) / (lu * lv) < 1 - 1e-9) n++;
    }
    return n;
  };

  const runPiecesOf = (run: RoomRun): Vec2[][] => [run.lead, run.stem, ...run.teeth];

  const medianOf = (xs: readonly number[]): number => {
    const sorted = [...xs].sort((p, q) => p - q);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };

  it('runs the pipeline with the default probe and with the passable probe and prints the report', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s, manual } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const toPt = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
    const m = (mm: number): string => (mm / 1000).toFixed(2);
    const ringMmOf = (room: Room): Vec2[] => [...room.polygon.outer.map(toMm), toMm(room.polygon.outer[0]!)];
    const served = s.servedRooms;
    const servedById = new Map(served.map((room) => [room.id, room] as const));
    const areaIds = new Set(s.area.rooms.map((a) => a.roomId));
    const areaRoomObjects = s.drawing.rooms.filter((r) => areaIds.has(r.id));
    const corridorAt = (p: Vec2): boolean => areaRoomObjects.some((r) => roomContainsPoint(r, toPt(p)));
    const roomIdAt = (p: Vec2): string | null => s.drawing.rooms.find((r) => roomContainsPoint(r, toPt(p)))?.id ?? null;
    const otherRoomFor =
      (room: Room) =>
      (p: Vec2): boolean =>
        s.drawing.rooms.some((r) => r.id !== room.id && !areaIds.has(r.id) && roomContainsPoint(r, toPt(p)));
    const bridgeRoomOf = (room: Room): BridgeRoom => ({
      roomId: room.id,
      name: room.name,
      typeId: room.roomTypeId ?? null,
      typeName: room.roomTypeId ?? null,
      hasTerminal: s.targetPorts.some((p) => p.roomId === room.id),
      inRouteArea: areaIds.has(room.id),
      isShaft: s.area.rooms.some((r) => r.roomId === room.id && r.kind === 'shaft'),
    });
    const bridgeRooms: BridgeRoom[] = s.drawing.rooms.map(bridgeRoomOf);
    const bridgeById = new Map(bridgeRooms.map((r) => [r.roomId, r] as const));
    const passableRoomAt = (p: Vec2): boolean => {
      const room = s.drawing.rooms.find((r) => roomContainsPoint(r, toPt(p)));
      return room !== undefined && !areaIds.has(room.id) && bridgeRoomAllowed(bridgeById.get(room.id)!);
    };
    const portsOf = (room: Room): { id: string; point: Vec2 }[] =>
      s.targetPorts.filter((p) => p.roomId === room.id).map((p) => ({ id: `${p.stampId}/${p.portId}`, point: toMm(p.world) }));
    const inputOf = (room: Room): RoomDoorRunsInput => {
      const ports = portsOf(room);
      return {
        room,
        mmPerPt,
        corridorAt,
        otherRoomAt: otherRoomFor(room),
        portsMm: ports.map((p) => p.point),
        ports,
        blockers: [],
        clearanceMm: 150,
        doorMarginMm: 200,
      };
    };
    const feedHookOf = (room: Room): ((door: EntryCandidate) => RoomFeed) => {
      const ports = portsOf(room);
      const inside = insideRouteArea([room], mmPerPt);
      return (door) =>
        roomFeed({
          entry: door,
          ports,
          ringMm: ringMmOf(room),
          inside,
          roomContains: (p) => roomContainsPoint(room, toPt(p)),
          crossesExisting: () => 0,
        });
    };
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
    const segmentCrossing = (p: Vec2, r: Vec2, q: Vec2, w: Vec2): Vec2 | null => {
      const rx = r.x - p.x;
      const ry = r.y - p.y;
      const sx = w.x - q.x;
      const sy = w.y - q.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) return null;
      const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
      const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return { x: p.x + t * rx, y: p.y + t * ry };
    };
    const HOLE_CLUSTER_MM = 300;
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

    const startStamp = s.stamps.find((st) => st.id === s.startStampId);
    const startPort = startStamp ? getStampWorldPorts(startStamp).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!startPort) throw new Error('manual fixture: no start port');
    const startMm = toMm(startPort);
    const areaRooms = areaRoomObjects.map((room) => ({ roomId: room.id, ringMm: room.polygon.outer.map(toMm) }));
    const shaftRoomIds = new Set(s.area.rooms.filter((r) => r.kind === 'shaft').map((r) => r.roomId));
    const linkPointsMm = s.area.links.filter((l) => !l.shaft).map((l) => toMm(l.point));
    const inside = withWallGaps(insideRouteArea(areaRoomObjects, mmPerPt), linkPointsMm);
    const lines = mainRunLines({ areaRooms, inside, startMm, offsetMm: 1000, blockers: [], shaftRoomIds, ductWidthMm: 400, clearanceMm: 150 });

    const runConfig = (name: string, passable: boolean): Set<string> => {
      const doorInputOf = (room: Room): RoomDoorRunsInput =>
        passable ? { ...inputOf(room), probeMm: 15000, passableRoomAt } : inputOf(room);
      const bridgeInputOf = (room: Room): RoomDoorInput =>
        passable
          ? doorInputOf(room)
          : {
              room,
              mmPerPt,
              corridorAt,
              portsMm: portsOf(room).map((p) => p.point),
              blockers: [],
              clearanceMm: 150,
              doorMarginMm: 200,
              probeMm: 15000,
            };
      const hooks = new Map(served.map((room) => [room.id, feedHookOf(room)] as const));

      const doorsT0 = Date.now();
      const singlesOf = new Map<string, RoomDoorRun[]>();
      const plansOf = new Map<string, RoomBlockPlan[]>();
      for (const room of served) {
        const input = doorInputOf(room);
        const roomFeedFallback = hooks.get(room.id)!;
        singlesOf.set(room.id, roomDoorRuns({ ...input, roomFeedFallback }));
        plansOf.set(room.id, roomBlockRuns({ ...input, splitFromTerminals: 6, roomFeedFallback }));
      }
      const doorsSeconds = (Date.now() - doorsT0) / 1000;

      const mainT0 = Date.now();
      const demandOf = (room: Room): MainDemand => {
        const doors = new Map<string, { pointMm: Vec2; outward: Vec2 }>();
        const add = (run: RoomRun): void => {
          const key = `${Math.round(run.door.pointMm.x)},${Math.round(run.door.pointMm.y)},${run.door.outward.x},${run.door.outward.y}`;
          if (!doors.has(key)) doors.set(key, { pointMm: run.door.pointMm, outward: run.door.outward });
        };
        for (const d of singlesOf.get(room.id)!) if (d.run.pattern !== 'fallback') add(d.run);
        for (const plan of plansOf.get(room.id)!) for (const block of plan.blocks) add(block.run);
        return { roomId: room.id, doorsMm: [...doors.values()] };
      };
      const demands = served.map(demandOf);
      const before = planMainRun({ lines, startMm, demands, inside, bendMm: 500, reachMm: 4800, roomIdAt });
      const needy = new Set(before.unreachedRoomIds);
      const bridgeCands: MainDemand[] = served
        .filter((room) => needy.has(room.id))
        .map((room) => ({
          roomId: room.id,
          doorsMm: roomDoorCandidates(bridgeInputOf(room)).map((c) => ({ pointMm: c.door.pointMm, outward: c.door.outward })),
        }));
      const bridges = mainBridgeLines({
        lines,
        demands: bridgeCands,
        rooms: bridgeRooms,
        roomIdAt,
        crossRooms: { maxRooms: 2 },
        blockers: [],
        clearanceMm: 150,
      });
      const isBridgeEnd = (door: Vec2): boolean => bridges.some((b) => dist(b.a, door) <= 1 || dist(b.b, door) <= 1);
      const afterDemands: MainDemand[] = demands.map((d) => {
        const cand = bridgeCands.find((c) => c.roomId === d.roomId);
        if (!cand) return d;
        return { roomId: d.roomId, doorsMm: [...d.doorsMm, ...cand.doorsMm.filter((door) => isBridgeEnd(door.pointMm))] };
      });
      const main = planMainRun({ lines: [...lines, ...bridges], startMm, demands: afterDemands, inside, bendMm: 500, reachMm: 4800, roomIdAt });
      const mainSeconds = (Date.now() - mainT0) / 1000;

      const hasStub = dist(startMm, main.rootPointMm) > 1;
      const mainTree = hasStub ? main.paths.slice(0, -1) : main.paths;
      const combineInput: CombineInput = {
        tree: main.paths,
        startMm,
        rooms: served.map((room) => ({ room, ports: portsOf(room), singles: singlesOf.get(room.id)!, blockPlans: plansOf.get(room.id)! })),
        allRooms: s.drawing.rooms,
        mmPerPt,
        bendMm: 500,
        blockers: [],
        clearanceMm: 150,
        doorMarginMm: 200,
        ductWidthMm: 400,
        roomFeedFallback: (room, door) => hooks.get(room.id)!(door),
      };
      const result = combineRoomRuns(combineInput);

      const treeRows = result.rooms.filter((r) => r.chain === undefined);
      const chainRows = result.rooms.filter((r) => r.chain !== undefined);
      const rowById = new Map(result.rooms.map((r) => [r.roomId, r] as const));
      const servedIds = new Set(result.rooms.map((r) => r.roomId));
      const treeIds = new Set(treeRows.map((r) => r.roomId));
      const unfed = result.unfedRoomIds;
      const unfedRooms = unfed.map((id) => servedById.get(id)!);

      const carrierIds = new Set<string>();
      main.paths.forEach((path, pathIndex) => {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          if (dist(a, b) <= 0 || (Math.abs(b.x - a.x) > 1e-6 && Math.abs(b.y - a.y) > 1e-6)) continue;
          carrierIds.add(`${pathIndex}#${i - 1}`);
        }
      });
      for (const row of treeRows) {
        for (const d of row.doors) {
          expect(carrierIds.has(d.carrierId), `${row.roomId} carrier ${d.carrierId}`).toBe(true);
          expect(
            main.paths.some((p) => distanceToPath(d.tapMm, p) <= 1),
            `${row.roomId} tap ${d.tapMm.x},${d.tapMm.y} on the tree`,
          ).toBe(true);
        }
      }

      const taps = treeRows.flatMap((r) => r.doors.map((d) => d.tapMm));
      let minTap = Infinity;
      for (let i = 0; i < taps.length; i++) {
        for (let j = i + 1; j < taps.length; j++) minTap = Math.min(minTap, dist(taps[i]!, taps[j]!));
      }
      expect(minTap).toBeGreaterThanOrEqual(600 - 1);

      expect(combineRoomRuns(combineInput)).toEqual(result);
      const counts = (r: ReturnType<typeof combineRoomRuns>): number[] => [
        r.rooms.length,
        r.unfedRoomIds.length,
        r.rooms.reduce((n, row) => n + row.doors.length, 0),
      ];
      const reversed = combineRoomRuns({ ...combineInput, rooms: [...combineInput.rooms].reverse() });
      const shuffled = combineRoomRuns({ ...combineInput, rooms: seededShuffle(combineInput.rooms, 7) });
      expect(counts(reversed)).toEqual(counts(result));
      expect(counts(shuffled)).toEqual(counts(result));

      for (const row of chainRows) {
        expect(treeIds.has(row.roomId)).toBe(false);
        expect(servedIds.has(row.chain!.viaRoomId), `${row.roomId} via ${row.chain!.viaRoomId}`).toBe(true);
        expect(row.chain!.depth).toBeGreaterThanOrEqual(1);
        expect(row.chain!.depth).toBeLessThanOrEqual(2);
      }

      for (const row of result.rooms) {
        const room = servedById.get(row.roomId)!;
        for (const d of row.doors) {
          expect(distanceToPath(d.door.pointMm, ringMmOf(room)), `${row.roomId} door on the ring`).toBeLessThanOrEqual(2);
          expect(dist(d.branch[0]!, d.tapMm), `${row.roomId} branch starts at the tap`).toBeLessThanOrEqual(1e-6);
          expect(dist(d.branch[d.branch.length - 1]!, d.run.door.pointMm), `${row.roomId} branch ends at the door`).toBeLessThanOrEqual(1);
        }
      }

      const seen = [...result.rooms.map((r) => r.roomId), ...unfed];
      expect(new Set(seen).size).toBe(seen.length);
      for (const id of seen) expect(servedById.has(id), `${id} is a served room`).toBe(true);

      const violating = unfed.filter((id) =>
        singlesOf.get(id)!.some(
          (d) => d.run.pattern !== 'fallback' && mainTree.some((p) => distanceToPath(d.run.door.pointMm, p) <= 800),
        ),
      );

      const legOf = (carrierId: string): [Vec2, Vec2] => {
        const parts = carrierId.split('#').map(Number);
        const path = main.paths[parts[0]!]!;
        const si = parts[1]!;
        return [path[si]!, path[si + 1]!];
      };
      const offsetOf = (d: RoomDoorPlan): number => {
        const [a, b] = legOf(d.carrierId);
        const len = dist(a, b);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        let sum = 0;
        for (let i = 1; i < d.branch.length; i++) {
          const p = d.branch[i - 1]!;
          const q = d.branch[i]!;
          const l = dist(p, q);
          if (l > 0 && Math.abs(((q.x - p.x) * uy - (q.y - p.y) * ux) / l) < 1e-6) sum += l;
        }
        return sum;
      };
      const offsets = treeRows.flatMap((r) => r.doors.map(offsetOf));
      const bent = offsets.filter((o) => o > 1e-6).sort((p, q) => p - q);
      const straight = offsets.length - bent.length;
      const offsetText =
        bent.length === 0
          ? 'none'
          : `min ${bent[0]!.toFixed(0)}, median ${medianOf(bent).toFixed(0)}, max ${bent[bent.length - 1]!.toFixed(0)} mm`;

      const roomBends = result.rooms.reduce((n, r) => n + r.doors.reduce((k, d) => k + d.run.bends + polyBendsOf(d.branch), 0), 0);
      const leftTotal =
        result.rooms.reduce((n, r) => n + r.leftPortIds.length, 0) + unfedRooms.reduce((n, r) => n + portsOf(r).length, 0);
      const pathsLengthMm = (paths: readonly (readonly Vec2[])[]): number =>
        paths.reduce((sum, p) => sum + p.slice(1).reduce((acc, q, i) => acc + dist(p[i]!, q), 0), 0);
      const mainNoStubMm = pathsLengthMm(mainTree);
      const mainWithStubMm = pathsLengthMm(main.paths);
      const roomsMm = result.rooms.reduce(
        (n, r) =>
          n +
          r.doors.reduce(
            (k, d) => k + pathsLengthMm([d.branch, ...runPiecesOf(d.run).filter((p) => p.length >= 2)]),
            0,
          ),
        0,
      );
      const multi = result.rooms.filter((r) => r.doors.length > 1).map((r) => r.roomId).sort();

      const tableRows = [...served]
        .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))
        .map((room) => {
          const row = rowById.get(room.id);
          const ports = portsOf(room);
          const label = `${room.id} (${room.number ?? '-'})`;
          const hand = m(handLengthMm(room));
          const holes = String(handHolesOf(room));
          if (!row) return [label, String(ports.length), 'unfed', '0', '-', '-', String(ports.length), 'unfed', holes, hand].join(' | ');
          const patterns = [...new Set(row.doors.map((d) => d.run.pattern))].join('+');
          const bends = row.doors.reduce((n, d) => n + d.run.bends + polyBendsOf(d.branch), 0);
          const lengthMm = row.doors.reduce(
            (n, d) => n + pathsLengthMm([d.branch, ...runPiecesOf(d.run).filter((p) => p.length >= 2)]),
            0,
          );
          const chained = row.chain ? `yes via ${row.chain.viaRoomId} depth ${row.chain.depth}` : 'no';
          return [
            label,
            String(ports.length),
            patterns,
            String(row.doors.length),
            String(bends),
            m(lengthMm),
            String(row.leftPortIds.length),
            chained,
            holes,
            hand,
          ].join(' | ');
        });

      const report = [
        `P2 T10-3: combineRoomRuns on the manual fixture, config ${name}`,
        `seconds: doors step ${doorsSeconds.toFixed(1)}, main-run step ${mainSeconds.toFixed(1)}`,
        `rooms served by the tree ${treeRows.length}, chained ${chainRows.length}, unfed ${unfed.length}, served in fixture ${served.length}`,
        `chained: ${chainRows.map((r) => `${r.roomId} via ${r.chain!.viaRoomId} depth ${r.chain!.depth}`).join('; ') || 'none'}`,
        `unfed: ${unfed.join(' ') || 'none'}`,
        `left terminals ${leftTotal}`,
        `bends in served rooms ${roomBends} (hand 6)`,
        `bends in corridor ${countBends(mainTree)} (hand 5), total main bends with stub ${countBends(main.paths)}`,
        `lengths m: main without stub ${m(mainNoStubMm)}, main with stub ${m(mainWithStubMm)}, rooms ${m(roomsMm)}, total ${m(mainWithStubMm + roomsMm)} (hand total 234.0, hand main 89.3)`,
        `tee offsets of tree doors: straight ${straight} of ${offsets.length}, others ${offsetText}`,
        `smallest distance between two taps ${minTap.toFixed(0)} mm over ${taps.length} taps (tree doors only)`,
        `rooms with more than one entry ${multi.length}: ${multi.join(' ') || 'none'} (hand 2: room-22 room-26)`,
        `rooms 22 and 31 served: room-22 ${servedIds.has('room-22')}, room-31 ${servedIds.has('room-31')} (hand: both served)`,
        `chained rooms ${chainRows.length} (hand 0)`,
        `unfed rooms with a non-fallback single run within 800 mm of the tree: ${violating.join(' ') || 'none'}`,
        'room | terminals | pattern(s) | doors | bends | branch+run m | left ports | chained? | hand holes | hand m',
        ...tableRows,
      ];
      console.log(report.join('\n'));
      return servedIds;
    };

    const configA = runConfig('A (default doors)', false);
    const configB = runConfig('B (probeMm 15000, passable rooms)', true);
    const onlyB = [...configB].filter((id) => !configA.has(id)).sort();
    const onlyA = [...configA].filter((id) => !configB.has(id)).sort();
    console.log(
      [
        'P2 T10-3: served rooms, config B against config A',
        `served only in B: ${onlyB.join(' ') || 'none'}`,
        `served only in A: ${onlyA.join(' ') || 'none'}`,
        `room-22 served: A ${configA.has('room-22')}, B ${configB.has('room-22')}`,
        `room-31 served: A ${configA.has('room-31')}, B ${configB.has('room-31')}`,
      ].join('\n'),
    );
  }, 300000);
});
