import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import { dist, distanceToPath } from './route-feed-helpers.js';
import { insideRouteArea } from './route-layout.js';
import { roomEntryCandidates, type EntryCandidate } from './route-room-entry.js';
import { ROOM_STUB_MM, doorAllowed, roomRunFor, type RoomRun, type RoomRunInput } from './route-room-runs.js';
import { manualScenario, seededShuffle } from './route-scenario.testutil.js';
import { runsOverOtherPort } from './route-topology.js';

const rectRing = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const ROOM: Pick<Room, 'id' | 'polygon'> = { id: 'room-test', polygon: { outer: rectRing(0, 0, 6000, 4000), holes: [] } };

const U_ROOM: Pick<Room, 'id' | 'polygon'> = {
  id: 'room-u',
  polygon: {
    outer: [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 4000, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    holes: [],
  },
};

const top = (x: number): EntryCandidate => ({ pointMm: { x, y: 0 }, outward: { x: 0, y: -1 }, source: 'port-line' });

const at = (id: string, x: number, y: number): { id: string; point: Vec2 } => ({ id, point: { x, y } });

const scene = (ports: { id: string; point: Vec2 }[], overrides: Partial<RoomRunInput> = {}): RoomRunInput => ({
  room: ROOM,
  mmPerPt: 1,
  door: top(3000),
  ports,
  blockers: [],
  clearanceMm: 150,
  doorMarginMm: 200,
  ...overrides,
});

const one = (input: RoomRunInput): RoomRun => {
  const runs = roomRunFor(input);
  expect(runs).toHaveLength(1);
  return runs[0]!;
};

const piecesOf = (run: RoomRun): Vec2[][] => [run.lead, run.stem, ...run.teeth].filter((p) => p.length >= 2);

const keysOf = (points: readonly Vec2[]): string[] => points.map((p) => `${p.x},${p.y}`).sort();

const sampled = (path: readonly Vec2[], stepMm: number): Vec2[] => {
  const out: Vec2[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / stepMm));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
};

const endsAt = (run: RoomRun, p: Vec2): number =>
  piecesOf(run).filter((piece) => dist(piece[0]!, p) <= 1 || dist(piece[piece.length - 1]!, p) <= 1).length;

const singleIn = scene([at('T', 3000, 2000)]);
const singleOff = scene([at('T', 4000, 2000)]);
const singleAligned = scene([at('T', 3030, 2000)]);
const rowPair = scene([at('A', 2000, 2000), at('B', 4000, 2000)]);
const sixRows = scene([
  at('A', 2000, 1000),
  at('B', 4000, 1000),
  at('C', 2000, 2000),
  at('D', 4000, 2000),
  at('E', 2000, 3000),
  at('F', 4000, 3000),
]);
const deepStub = scene([at('A', 3000, 3000), at('B', 2000, 2000), at('C', 4000, 2000)]);

describe('roomRunFor', () => {
  it('runs a straight lead to one terminal in line with the door', () => {
    const run = one(singleIn);
    expect(run.pattern).toBe('single');
    expect(run.bends).toBe(0);
    expect(run.lead).toHaveLength(2);
    expect(run.lead[1]).toEqual({ x: 3000, y: 2000 });
  });

  it('runs an L lead to one terminal off the door line', () => {
    const run = one(singleOff);
    expect(run.pattern).toBe('single');
    expect(run.bends).toBe(1);
    expect(run.lead).toHaveLength(3);
    expect(run.lead[2]).toEqual({ x: 4000, y: 2000 });
  });

  it('moves the door onto the terminal line when the terminal is 30 mm off it', () => {
    const run = one(singleAligned);
    expect(run.pattern).toBe('single');
    expect(run.bends).toBe(0);
    expect(run.door.pointMm.x).toBe(3030);
  });

  it('joins two terminals in a row to a stem with a tee at the middle', () => {
    const run = one(rowPair);
    expect(run.pattern).toBe('comb');
    expect(run.bends).toBe(0);
    expect(run.teeth).toHaveLength(2);
    const tee = run.stem[run.stem.length - 1]!;
    expect(dist(tee, { x: 3000, y: 2000 })).toBeLessThanOrEqual(50);
    for (const tooth of run.teeth) {
      expect(tooth).toHaveLength(2);
      expect(dist(tooth[0]!, tee)).toBeLessThan(1);
      expect(dist(tooth[0]!, tooth[1]!)).toBeGreaterThan(1);
    }
    expect(keysOf(run.teeth.map((t) => t[1]!))).toEqual(keysOf([{ x: 2000, y: 2000 }, { x: 4000, y: 2000 }]));
  });

  it('gives six terminals in three rows a comb with six teeth and one door', () => {
    const runs = roomRunFor(sixRows);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.pattern).toBe('comb');
    expect(run.teeth).toHaveLength(6);
    expect(run.bends).toBe(0);
    expect(run.door.pointMm).toEqual({ x: 3000, y: 0 });
  });

  it('keeps every piece of the runs inside the room', () => {
    const inside = insideRouteArea([ROOM], 1);
    for (const input of [singleIn, singleOff, singleAligned, rowPair, sixRows]) {
      for (const piece of piecesOf(one(input))) {
        expect(sampled(piece, 100).filter((p) => !inside(p))).toEqual([]);
      }
    }
  });

  it('gives a stub to a terminal on the stem in the deepest row', () => {
    const run = one(deepStub);
    expect(run.pattern).toBe('comb');
    const stub = run.teeth.find((t) => dist(t[1]!, { x: 3000, y: 3000 }) < 1e-6)!;
    expect(dist(stub[0]!, stub[1]!)).toBeCloseTo(ROOM_STUB_MM, 6);
    expect(dist(run.stem[run.stem.length - 1]!, { x: 3000, y: 3000 })).toBeCloseTo(ROOM_STUB_MM, 6);
    expect(runsOverOtherPort(run.stem, deepStub.ports.map((p) => p.point))).toBe(false);
  });

  it('falls back when a terminal on the stem is not in the deepest row', () => {
    const run = one(scene([at('A', 3000, 2000), at('B', 2000, 3000), at('C', 4000, 3000)]));
    expect(run.pattern).toBe('fallback');
    expect(run.leftPortIds).toEqual(['A', 'B', 'C']);
  });

  it('falls back when two terminals on one side of the stem share a depth', () => {
    const run = one(scene([at('A', 2000, 2000), at('B', 1000, 2000)]));
    expect(run.pattern).toBe('fallback');
    expect(run.leftPortIds).toEqual(['A', 'B']);
  });

  it('gives each port exactly one connected end', () => {
    for (const input of [rowPair, sixRows, deepStub]) {
      const run = one(input);
      for (const port of input.ports) expect(endsAt(run, port.point)).toBe(1);
    }
  });

  it('gives each terminal of six rows the end of exactly one piece', () => {
    const run = one(sixRows);
    for (const port of sixRows.ports) {
      const ending = piecesOf(run).filter((piece) => dist(piece[piece.length - 1]!, port.point) < 1e-6);
      expect(ending).toHaveLength(1);
      expect(distanceToPath(port.point, ending[0]!)).toBeLessThan(1e-6);
    }
  });

  it('falls back when a blocker crosses a planned tooth', () => {
    const run = one(scene(rowPair.ports, { blockers: [[{ x: 2500, y: 2000 }, { x: 2600, y: 2000 }]] }));
    expect(run.pattern).toBe('fallback');
  });

  it('takes the other L when a blocker crosses the first L', () => {
    expect(one(singleOff).lead[1]).toEqual({ x: 3000, y: 2000 });
    const run = one(scene([at('T', 4000, 2000)], { blockers: [[{ x: 3000, y: 500 }, { x: 3000, y: 1500 }]] }));
    expect(run.pattern).toBe('single');
    expect(run.bends).toBe(1);
    expect(run.lead[1]).toEqual({ x: 4000, y: 0 });
  });

  it('returns no run when a blocker is within the clearance of the door', () => {
    const blocked = scene([at('T', 3000, 2000)], { blockers: [[{ x: 3100, y: -100 }, { x: 3100, y: 100 }]] });
    expect(roomRunFor(blocked)).toEqual([]);
    expect(doorAllowed(blocked)).toBe(false);
  });

  it('changes nothing when a blocker is 300 mm away and the clearance is 150 mm', () => {
    const far = scene(rowPair.ports, { blockers: [[{ x: 2000, y: 2300 }, { x: 4000, y: 2300 }]], clearanceMm: 150 });
    expect(roomRunFor(far)).toEqual(roomRunFor(rowPair));
  });

  it('returns no run when the door is nearer than the door margin to a corner', () => {
    expect(roomRunFor(scene([at('T', 100, 2000)], { door: top(100), doorMarginMm: 200 }))).toEqual([]);
  });

  it('returns one run when the door is 250 mm from a corner and the margin is 200 mm', () => {
    const runs = roomRunFor(scene([at('T', 250, 2000)], { door: top(250), doorMarginMm: 200 }));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.pattern).toBe('single');
  });

  it('falls back when no straight or L lead stays in a U-shaped room', () => {
    const run = roomRunFor(scene([at('T', 5000, 1000)], { room: U_ROOM, door: top(1000) }))[0]!;
    expect(run.pattern).toBe('fallback');
    expect(run.leftPortIds).toEqual(['T']);
    expect(run.stem).toEqual([]);
    expect(run.teeth).toEqual([]);
    expect(run.lead).toEqual([]);
    expect(run.lengthMm).toBe(0);
  });

  it('gives the same run when the ports are reversed or shuffled with a seed', () => {
    expect(roomRunFor(scene([...sixRows.ports].reverse()))).toEqual(roomRunFor(sixRows));
    expect(roomRunFor(scene(seededShuffle(sixRows.ports, 7)))).toEqual(roomRunFor(sixRows));
  });

  it('returns no door when a door is within the margin of a hole vertex', () => {
    const holed: Pick<Room, 'id' | 'polygon'> = {
      id: 'room-hole',
      polygon: { outer: rectRing(0, 0, 6000, 4000), holes: [rectRing(2000, 1000, 2500, 1500)] },
    };
    const near: EntryCandidate = { pointMm: { x: 2100, y: 1000 }, outward: { x: 0, y: -1 }, source: 'port-line' };
    const far: EntryCandidate = { pointMm: { x: 3000, y: 1000 }, outward: { x: 0, y: -1 }, source: 'port-line' };
    expect(doorAllowed(scene([at('T', 3000, 2000)], { room: holed, door: near }))).toBe(false);
    expect(doorAllowed(scene([at('T', 3000, 2000)], { room: holed, door: far }))).toBe(true);
  });

  it('gives a stub of the custom length on a terminal on the stem', () => {
    const run = one({ ...deepStub, stubMm: 300 });
    expect(run.pattern).toBe('comb');
    const stub = run.teeth.find((t) => dist(t[1]!, { x: 3000, y: 3000 }) < 1e-6)!;
    expect(dist(stub[0]!, stub[1]!)).toBeCloseTo(300, 6);
  });

  it('keeps the door point of a single terminal with a 100 mm lateral offset and gives one bend', () => {
    const run = one(scene([at('T', 3100, 2000)]));
    expect(run.pattern).toBe('single');
    expect(run.door.pointMm).toEqual({ x: 3000, y: 0 });
    expect(run.bends).toBe(1);
  });

  it('falls back when the terminal of a single lead is on the wall line', () => {
    const run = one(scene([at('T', 4000, 0)]));
    expect(run.pattern).toBe('fallback');
  });

  it('gives no run without ports', () => {
    expect(roomRunFor(scene([]))).toEqual([]);
  });
});

describe('roomRunFor on the manual fixture', () => {
  it('plans the served rooms and prints the report', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s, manual } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const areaRoomObjects = s.drawing.rooms.filter((r) => s.area.rooms.some((a) => a.roomId === r.id));
    const corridorAt = (p: Vec2): boolean =>
      areaRoomObjects.some((r) => roomContainsPoint(r, { x: p.x / mmPerPt, y: p.y / mmPerPt }));
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

    const planned = s.servedRooms.map((room) => {
      const ports = s.targetPorts.filter((p) => p.roomId === room.id);
      const candidates = roomEntryCandidates({
        room,
        mmPerPt,
        areaEntries: s.area.entries.filter((e) => e.roomId === room.id),
        corridorAt,
        portsMm: ports.map((p) => toMm(p.world)),
        alignedInGap: true,
      });
      const runs = candidates.flatMap((door, index) =>
        roomRunFor({
          room,
          mmPerPt,
          door,
          ports: ports.map((p) => ({ id: `${p.stampId}/${p.portId}`, point: toMm(p.world) })),
          blockers: [],
          clearanceMm: 150,
          doorMarginMm: 200,
        }).map((run) => ({ door, index, run, cost: run.lengthMm + 5000 * run.leftPortIds.length })),
      );
      const best = runs.reduce<(typeof runs)[number] | null>((acc, r) => (acc === null || r.cost < acc.cost ? r : acc), null);
      const nonFallback = runs.filter((r) => r.run.pattern !== 'fallback').length;
      return { room, ports, candidates, best, nonFallback };
    });

    const lines = planned.map(({ room, ports, candidates, best, nonFallback }) => {
      const head = `${room.id} (${room.number ?? '-'}): ${ports.length} terminals`;
      if (best === null) return `${head}, no door, ${candidates.length} candidates`;
      const { door, run } = best;
      return [
        head,
        `pattern ${run.pattern}`,
        `door (${door.pointMm.x.toFixed(0)}, ${door.pointMm.y.toFixed(0)}) mm`,
        `source ${door.source}`,
        `bends ${run.bends}`,
        `length ${(run.lengthMm / 1000).toFixed(2)} m`,
        `${candidates.length} candidates`,
        `${nonFallback} doors with a non-fallback run`,
      ].join(', ');
    });
    console.log(
      [`P2 T08-1: roomRunFor on the manual fixture (${s.servedRooms.length} served rooms)`, ...lines].join('\n'),
    );

    const handLine = (id: string): string => {
      const room = s.drawing.rooms.find((r) => r.id === id);
      if (!room) return `${id}: not in the fixture`;
      const entry = planned.find((p) => p.room.id === id);
      const planner = entry?.best
        ? `planner ${entry.best.run.pattern}, bends ${entry.best.run.bends}, branch ${(entry.best.run.lengthMm / 1000).toFixed(2)} m`
        : 'planner none';
      const terminals = s.targetPorts.filter((p) => p.roomId === id).length;
      return `${id} (${room.number ?? '-'}): ${terminals} terminals, ${planner}, hand route ${(handLengthMm(room) / 1000).toFixed(2)} m`;
    };
    const singleRooms = ['room-6', 'room-27', 'room-30', 'room-32', 'room-33', 'room-34', 'room-36', 'room-37', 'room-39', 'room-42', 'room-43', 'room-44'];
    const combRooms = ['room-5', 'room-24', 'room-29', 'room-7', 'room-8', 'room-9'];
    console.log(
      [
        'P2 T08-2: single and comb rooms of the hand route (room ids as in the fixture)',
        'single rooms:',
        ...singleRooms.map(handLine),
        'comb rooms:',
        ...combRooms.map(handLine),
      ].join('\n'),
    );

    expect(s.servedRooms.length).toBeGreaterThan(0);
    const chosen = planned.filter((p) => p.best !== null);
    expect(chosen.length).toBeGreaterThan(0);
    for (const { ports, best } of chosen) {
      const { run } = best!;
      const portIds = ports.map((p) => `${p.stampId}/${p.portId}`);
      for (const id of run.leftPortIds) expect(portIds).toContain(id);
      if (run.pattern === 'fallback') continue;
      const pieces = piecesOf(run);
      for (const port of ports) {
        expect(pieces.some((piece) => dist(piece[piece.length - 1]!, toMm(port.world)) <= 1)).toBe(true);
      }
    }
  }, 60000);
});
