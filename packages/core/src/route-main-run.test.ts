import { beforeAll, describe, expect, it } from 'vitest';
import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import { insideRouteArea, withWallGaps } from './route-layout.js';
import { mainRunLines, planMainRun, type MainDemand, type MainLine, type MainLineInput } from './route-main-run.js';
import { roomEntryCandidates } from './route-room-entry.js';
import { manualScenario } from './route-scenario.testutil.js';
import { roomContainsPoint } from './rooms/room.js';
import { pointInRing } from './rooms/polygon.js';
import { getStampWorldPorts } from './stamp.js';

const rectRing = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const rect = (roomId: string, x0: number, y0: number, x1: number, y1: number) => ({
  roomId,
  ringMm: rectRing(x0, y0, x1, y1),
});

type Box = [number, number, number, number];

const insideRects = (boxes: readonly Box[]) => (p: Vec2): boolean =>
  boxes.some(([x0, y0, x1, y1]) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1);

const inRing = (ring: readonly Vec2[], p: Vec2): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const far: Vec2 = { x: 50000, y: 50000 };

const input = (overrides: Partial<MainLineInput>): MainLineInput => ({
  areaRooms: [],
  inside: () => false,
  startMm: far,
  offsetMm: 1000,
  blockers: [],
  shaftRoomIds: new Set(),
  ductWidthMm: 400,
  clearanceMm: 150,
  ...overrides,
});

const horizontal = (lines: ReturnType<typeof mainRunLines>) => lines.filter((l) => l.a.y === l.b.y);
const vertical = (lines: ReturnType<typeof mainRunLines>) => lines.filter((l) => l.a.x === l.b.x);

describe('mainRunLines', () => {
  it('puts lines 1000 mm from each long wall of a rectangle corridor, and one through the start', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 20000, 3000)],
        inside: insideRects([[0, 0, 20000, 3000]]),
        startMm: { x: 5000, y: 1000 },
      }),
    );
    const h = horizontal(lines);
    expect(h.map((l) => l.a.y)).toEqual([1000, 2000]);
    expect(h.every((l) => l.a.x <= 100 && l.b.x >= 19900)).toBe(true);
    expect(vertical(lines).some((l) => l.a.x === 5000)).toBe(true);
  });

  it('gives one centre line for a corridor 1500 mm wide', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 20000, 1500)],
        inside: insideRects([[0, 0, 20000, 1500]]),
      }),
    );
    expect(horizontal(lines).map((l) => l.a.y)).toEqual([750]);
  });

  it('collapses two parallel lines closer than two duct widths to one line at the mean', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 20000, 2000)],
        inside: insideRects([[0, 0, 20000, 2000]]),
        ductWidthMm: 600,
      }),
    );
    expect(horizontal(lines).map((l) => l.a.y)).toEqual([1000]);
  });

  it('clamps the offset to half the corridor minus half a duct, then collapses the pair', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 20000, 1800)],
        inside: insideRects([[0, 0, 20000, 1800]]),
      }),
    );
    expect(horizontal(lines).map((l) => l.a.y)).toEqual([900]);
  });

  it('gives no line from a shaft room', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('shaft-1', 0, 0, 20000, 3000)],
        inside: insideRects([[0, 0, 20000, 3000]]),
        shaftRoomIds: new Set(['shaft-1']),
      }),
    );
    expect(lines).toEqual([]);
  });

  it('cuts a line at a blocker with the clearance on both sides', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 20000, 3000)],
        inside: insideRects([[0, 0, 20000, 3000]]),
        blockers: [[{ x: 10000, y: -1000 }, { x: 10000, y: 4000 }]],
      }),
    );
    const h = horizontal(lines);
    expect(h).toHaveLength(4);
    expect(h.every((l) => l.b.x <= 9851 || l.a.x >= 10149)).toBe(true);
  });

  it('cuts the line where inside ends', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('corridor', 0, 0, 15000, 3000)],
        inside: insideRects([[0, 0, 15000, 3000]]),
      }),
    );
    const h = horizontal(lines);
    expect(h.map((l) => l.a.y)).toEqual([1000, 2000]);
    expect(h.every((l) => Math.abs(l.b.x - 15000) <= 1)).toBe(true);
  });

  it('runs one line across a wall gap between two rooms', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('left', 0, 0, 10000, 3000), rect('right', 10000, 0, 20000, 3000)],
        inside: insideRects([
          [0, 0, 10000, 3000],
          [9625, 0, 10375, 3000],
          [10000, 0, 20000, 3000],
        ]),
      }),
    );
    const h = horizontal(lines);
    expect(h.map((l) => l.a.y)).toEqual([1000, 2000]);
    expect(h.every((l) => l.a.x <= 100 && l.b.x >= 19900)).toBe(true);
  });

  it('merges lines whose wall coordinates differ by 100 mm', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('a', 0, 0, 20000, 3000), rect('b', 20000, 0, 30000, 3100)],
        inside: insideRects([
          [0, 0, 20000, 3000],
          [20000, 0, 30000, 3100],
        ]),
      }),
    );
    const h = horizontal(lines);
    expect(h).toHaveLength(2);
    expect(h[1]!.a.y).toBeGreaterThanOrEqual(2000);
    expect(h[1]!.a.y).toBeLessThanOrEqual(2100);
  });

  it('gives the same result for a shuffled room order and a rotated ring', () => {
    const left = rect('left', 0, 0, 10000, 3000);
    const right = rect('right', 10000, 0, 20000, 3000);
    const boxes: Box[] = [
      [0, 0, 10000, 3000],
      [9625, 0, 10375, 3000],
      [10000, 0, 20000, 3000],
    ];
    const first = mainRunLines(
      input({ areaRooms: [left, right], inside: insideRects(boxes), startMm: { x: 5000, y: 1000 } }),
    );
    const rotated = {
      roomId: 'left',
      ringMm: [...left.ringMm.slice(2), ...left.ringMm.slice(0, 2)],
    };
    const second = mainRunLines(
      input({ areaRooms: [right, rotated], inside: insideRects(boxes), startMm: { x: 5000, y: 1000 } }),
    );
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it('gives no line from an edge shorter than 2000 mm', () => {
    const notch: Vec2[] = [
      { x: 0, y: 0 },
      { x: 20000, y: 0 },
      { x: 20000, y: 3000 },
      { x: 10000, y: 3000 },
      { x: 10000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    const lines = mainRunLines(
      input({
        areaRooms: [{ roomId: 'notch', ringMm: notch }],
        inside: (p) => inRing(notch, p),
      }),
    );
    expect(vertical(lines).filter((l) => l.a.x > 9000 && l.a.x <= 11000)).toEqual([]);
  });

  it('gives a line along a long wall that drifts 200 mm over 20 m', () => {
    const drift: Vec2[] = [
      { x: 0, y: 0 },
      { x: 20000, y: 200 },
      { x: 20000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const lines = mainRunLines(
      input({
        areaRooms: [{ roomId: 'drift', ringMm: drift }],
        inside: (p) => inRing(drift, p),
      }),
    );
    const h = horizontal(lines);
    expect(h.some((l) => Math.abs(l.a.y - 1100) <= 150 && l.b.x - l.a.x >= 19000)).toBe(true);
  });

  it('keeps two rooms apart across a plain 150 mm wall without a wall gap', () => {
    const lines = mainRunLines(
      input({
        areaRooms: [rect('left', 0, 0, 10000, 3000), rect('right', 10150, 0, 20150, 3000)],
        inside: insideRects([
          [0, 0, 10000, 3000],
          [10150, 0, 20150, 3000],
        ]),
      }),
    );
    const h = horizontal(lines);
    expect(h.some((l) => l.a.x <= 100 && l.b.x <= 10001)).toBe(true);
    expect(h.some((l) => l.a.x >= 10149 && l.b.x >= 19900)).toBe(true);
    expect(h.every((l) => !(l.a.x < 10000 && l.b.x > 10150))).toBe(true);
  });
});

/** The analysis numbers are in PDF points. The fixture uses 17.6389 mm per point; the analysis uses 17.64. */
const ANALYSIS_MM_PER_PT = 17.64;

/** The main lines of the hand route in the analysis, in PDF points. `orient` is 'v' for a vertical line at x = pt. */
const HAND_LINES: { name: string; orient: 'h' | 'v'; pt: number }[] = [
  { name: 'west', orient: 'v', pt: 821.5 },
  { name: 'north', orient: 'h', pt: 916 },
  { name: 'cross', orient: 'h', pt: 2260 },
  { name: 'east', orient: 'v', pt: 1634 },
];

const orientOf = (l: MainLine): 'h' | 'v' => (l.a.y === l.b.y ? 'h' : 'v');
const coordOf = (l: MainLine): number => (orientOf(l) === 'h' ? l.a.y : l.a.x);
const lengthOf = (l: MainLine): number => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

interface ManualRun { input: MainLineInput; shaftRoomIds: Set<string>; lines: MainLine[] }
let manualRun: ManualRun | null = null;

describe('mainRunLines on the manual fixture', () => {
  beforeAll(() => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const areaRoomObjects = s.drawing.rooms.filter((r) => s.area.rooms.some((a) => a.roomId === r.id));
    const areaRooms = areaRoomObjects.map((room) => ({ roomId: room.id, ringMm: room.polygon.outer.map(toMm) }));
    const shaftRoomIds = new Set(s.area.rooms.filter((r) => r.kind === 'shaft').map((r) => r.roomId));
    const linkPointsMm = s.area.links.filter((l) => !l.shaft).map((l) => toMm(l.point));
    const startStamp = s.stamps.find((st) => st.id === s.startStampId);
    const startPort = startStamp ? getStampWorldPorts(startStamp).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!startPort) throw new Error('manual fixture: no start port');
    const input: MainLineInput = {
      areaRooms,
      inside: withWallGaps(insideRouteArea(areaRoomObjects, mmPerPt), linkPointsMm),
      startMm: toMm(startPort),
      offsetMm: 1000,
      blockers: [],
      shaftRoomIds,
      ductWidthMm: 400,
      clearanceMm: 150,
    };
    manualRun = { input, shaftRoomIds, lines: mainRunLines(input) };
  });

  it('has a line of the same orientation within 500 mm of each hand main line, at least 5000 mm long', () => {
    if (manualRun === null) return;
    for (const hand of HAND_LINES) {
      const wantMm = hand.pt * ANALYSIS_MM_PER_PT;
      const near = manualRun.lines.filter(
        (l) => orientOf(l) === hand.orient && Math.abs(coordOf(l) - wantMm) <= 500 && lengthOf(l) >= 5000,
      );
      expect(near.length, `hand ${hand.name} line at ${hand.pt} pt`).toBeGreaterThan(0);
    }
  });

  it('gives no line outside the start lines whose midpoint lies in a shaft room', () => {
    if (manualRun === null) return;
    const { lines, input, shaftRoomIds } = manualRun;
    const { startMm } = input;
    const shaftRings = input.areaRooms
      .filter((r) => shaftRoomIds.has(r.roomId))
      .map((r) => r.ringMm.flatMap((p) => [p.x, p.y]));
    const inShaft = lines.filter((l) => {
      const startCoord = orientOf(l) === 'h' ? startMm.y : startMm.x;
      if (Math.abs(coordOf(l) - startCoord) <= 1) return false;
      const mx = (l.a.x + l.b.x) / 2;
      const my = (l.a.y + l.b.y) / 2;
      return shaftRings.some((ring) => pointInRing(mx, my, ring));
    });
    expect(inShaft.map((l) => l.id)).toEqual([]);
  });

  it('gives deep-equal lines on a second call', () => {
    if (manualRun === null) return;
    expect(mainRunLines(manualRun.input)).toEqual(manualRun.lines);
  });

  it('prints the output lines and the nearest output line to each hand line', () => {
    if (manualRun === null) return;
    const { lines } = manualRun;
    const rows = lines.map(
      (l) =>
        `${l.id}  ${orientOf(l)}  coord ${(coordOf(l) / ANALYSIS_MM_PER_PT).toFixed(1)} pt  length ${(lengthOf(l) / 1000).toFixed(2)} m`,
    );
    const nearest = HAND_LINES.map((hand) => {
      const wantMm = hand.pt * ANALYSIS_MM_PER_PT;
      let best: { line: MainLine; dist: number } | null = null;
      for (const l of lines) {
        if (orientOf(l) !== hand.orient) continue;
        const dist = Math.abs(coordOf(l) - wantMm);
        if (best === null || dist < best.dist) best = { line: l, dist };
      }
      if (best === null) return `${hand.name}  hand ${hand.pt} pt  no line of orientation ${hand.orient}`;
      return `${hand.name}  hand ${hand.pt} pt  nearest ${(coordOf(best.line) / ANALYSIS_MM_PER_PT).toFixed(1)} pt  distance ${best.dist.toFixed(0)} mm`;
    });
    console.log(['P2 T05-2: mainRunLines on the manual fixture', ...rows, 'nearest to each hand line:', ...nearest].join('\n'));
  });
});

type PlanInput = Parameters<typeof planMainRun>[0];

const hLine = (id: string, y: number, x0: number, x1: number): MainLine => ({ id, a: { x: x0, y }, b: { x: x1, y } });
const vLine = (id: string, x: number, y0: number, y1: number): MainLine => ({ id, a: { x, y: y0 }, b: { x, y: y1 } });
const door = (x: number, y: number, outward: Vec2): MainDemand['doorsMm'][number] => ({ pointMm: { x, y }, outward });
const demand = (roomId: string, doorsMm: MainDemand['doorsMm']): MainDemand => ({ roomId, doorsMm });
const planInput = (over: Partial<PlanInput>): PlanInput => ({
  lines: [],
  startMm: far,
  demands: [],
  inside: () => true,
  bendMm: 500,
  reachMm: 4800,
  ...over,
});

const keyOfPt = (p: Vec2): string => `${Math.round(p.x)},${Math.round(p.y)}`;

/** Count the pieces of the paths after splitting each path at every end of another path that touches it, and the distinct points. */
function treeCounts(paths: readonly Vec2[][]): { pieces: number; points: number } {
  const ends = paths.flatMap((p) => [p[0]!, p[1]!]);
  const points = new Set<string>();
  let pieces = 0;
  for (const [a, b] of paths as Vec2[][]) {
    const horizontal = a!.y === b!.y;
    const along = (p: Vec2): number => (horizontal ? p.x : p.y);
    const across = (p: Vec2): number => (horizontal ? p.y : p.x);
    const lo = Math.min(along(a!), along(b!));
    const hi = Math.max(along(a!), along(b!));
    const cuts = [lo, hi, ...ends.filter((e) => Math.abs(across(e) - across(a!)) <= 1 && along(e) > lo + 1 && along(e) < hi - 1).map(along)];
    const ts = [...new Set(cuts.map((t) => Math.round(t)))].sort((p, q) => p - q);
    pieces += ts.length - 1;
    for (const t of ts) points.add(keyOfPt(horizontal ? { x: t, y: across(a!) } : { x: across(a!), y: t }));
  }
  return { pieces, points: points.size };
}

/** Count the points where exactly two path ends meet at a right angle. */
function countBends(paths: readonly Vec2[][]): number {
  const dirsAt = new Map<string, Vec2[]>();
  const add = (p: Vec2, dir: Vec2): void => {
    dirsAt.set(keyOfPt(p), [...(dirsAt.get(keyOfPt(p)) ?? []), dir]);
  };
  for (const [a, b] of paths as Vec2[][]) {
    const len = distance(a!, b!);
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

const summary = (run: ReturnType<typeof planMainRun>) => ({
  paths: run.paths,
  lines: run.lines,
  unreachedRoomIds: run.unreachedRoomIds,
  chosen: [...run.chosenHitByRoom].sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)),
});

const TEE_START: Vec2 = { x: 0, y: 1000 };
const teeScene = (): PlanInput =>
  planInput({
    lines: [hLine('h', 1000, 0, 10000), vLine('v', 5000, 1000, 5000)],
    startMm: TEE_START,
    demands: [
      demand('A', [door(8000, 1500, { x: 0, y: -1 })]),
      demand('B', [door(4000, 3000, { x: 1, y: 0 })]),
      demand('C', [door(3000, 1500, { x: 0, y: -1 })]),
    ],
  });

describe('planMainRun', () => {
  it('gives one straight path for two rooms whose doors face one line', () => {
    const run = planMainRun(
      planInput({
        lines: [hLine('h', 1000, 0, 10000)],
        startMm: TEE_START,
        demands: [demand('A', [door(2000, 1500, { x: 0, y: -1 })]), demand('B', [door(6000, 1500, { x: 0, y: -1 })])],
      }),
    );
    expect(run.paths).toEqual([[{ x: 0, y: 1000 }, { x: 6000, y: 1000 }]]);
    expect(run.unreachedRoomIds).toEqual([]);
    expect([...run.chosenHitByRoom]).toEqual([
      ['A', { x: 2000, y: 1000 }],
      ['B', { x: 6000, y: 1000 }],
    ]);
  });

  it('adds one tee path when a door hits a second perpendicular line', () => {
    const run = planMainRun(teeScene());
    expect(run.paths).toHaveLength(2);
    expect(run.paths[1]).toEqual([{ x: 5000, y: 1000 }, { x: 5000, y: 3000 }]);
    expect(run.unreachedRoomIds).toEqual([]);
    expect(countBends(run.paths)).toBe(0);
  });

  it('keeps one hit for a room with two doors and no branch to the far hit', () => {
    const run = planMainRun(
      planInput({
        lines: [hLine('h', 1000, 0, 10000)],
        startMm: TEE_START,
        demands: [demand('R', [door(2000, 1500, { x: 0, y: -1 }), door(9000, 1500, { x: 0, y: -1 })])],
      }),
    );
    expect(run.chosenHitByRoom.size).toBe(1);
    expect(run.chosenHitByRoom.get('R')).toEqual({ x: 2000, y: 1000 });
    expect(run.paths.flat().some((p) => p.x === 9000)).toBe(false);
  });

  it('moves a room to its second hit when the first hit lies off the tree of the other rooms', () => {
    const base = planInput({
      lines: [hLine('main', 1000, 0, 10000), vLine('spine', 0, 1000, 5000), hLine('far', 5000, 0, 10000)],
      startMm: TEE_START,
      demands: [
        demand('A', [door(1000, 4500, { x: 0, y: 1 }), door(6000, 1700, { x: 0, y: -1 })]),
        demand('B', [door(6000, 1500, { x: 0, y: -1 })]),
      ],
    });
    const run = planMainRun(base);
    expect(run.chosenHitByRoom.get('A')).toEqual({ x: 6000, y: 1000 });
    expect(run.paths.some((p) => p.some((q) => q.x === 1000 && q.y === 5000))).toBe(false);
    const shuffled = planInput({ ...base, lines: [...base.lines].reverse(), demands: [...base.demands].reverse() });
    expect(summary(planMainRun(shuffled))).toEqual(summary(run));
  });

  it('puts a room in unreachedRoomIds when its hits stop beyond reachMm or hit no line', () => {
    const run = planMainRun(
      planInput({
        lines: [hLine('h', 1000, 0, 10000)],
        startMm: TEE_START,
        reachMm: 1000,
        demands: [
          demand('far', [door(2000, 3000, { x: 0, y: -1 })]),
          demand('none', [door(2000, 1500, { x: 0, y: 1 })]),
        ],
      }),
    );
    expect(run.unreachedRoomIds).toEqual(['far', 'none']);
    expect(run.chosenHitByRoom.size).toBe(0);
    expect(run.paths).toEqual([]);
  });

  it('gives a tree whose distinct points are its pieces plus one', () => {
    const run = planMainRun(teeScene());
    const counts = treeCounts(run.paths);
    expect(counts.points).toBe(counts.pieces + 1);
  });

  it('gives the same output for shuffled demands and lines', () => {
    const base = teeScene();
    const shuffled = planInput({ ...base, lines: [...base.lines].reverse(), demands: [...base.demands].reverse() });
    expect(summary(planMainRun(shuffled))).toEqual(summary(planMainRun(base)));
  });

  it('gives the same output on a second call', () => {
    expect(planMainRun(teeScene())).toEqual(planMainRun(teeScene()));
  });

  it('prefers the 1-turn route to an equal-length 2-turn route when a bend has a price', () => {
    const staircase = (bendMm: number): PlanInput =>
      planInput({
        lines: [hLine('h0', 0, 0, 10000), vLine('vT', 10000, 0, 5000), vLine('v4', 4000, 0, 5000), hLine('h5', 5000, 4000, 10000)],
        startMm: { x: 0, y: 0 },
        demands: [demand('T', [door(11000, 5000, { x: -1, y: 0 })])],
        bendMm,
      });
    const lengthOf = (paths: readonly Vec2[][]): number => paths.reduce((sum, p) => sum + distance(p[0]!, p[1]!), 0);
    for (const bendMm of [500, 10000]) {
      const run = planMainRun(staircase(bendMm));
      expect(countBends(run.paths)).toBe(1);
      expect(lengthOf(run.paths)).toBe(15000);
      expect(run.paths.flat().some((p) => p.x === 4000)).toBe(false);
    }
    expect(lengthOf(planMainRun(staircase(0)).paths)).toBe(15000);
  });

  it('keeps the 1-turn way and does not take a longer detour that the graph offers', () => {
    const run = planMainRun(
      planInput({
        lines: [hLine('h0', 0, 0, 12000), vLine('vT', 10000, 0, 8000), vLine('vD', 12000, 0, 8000), hLine('hD', 8000, 10000, 12000)],
        startMm: { x: 0, y: 0 },
        demands: [demand('T', [door(11000, 4000, { x: -1, y: 0 })])],
      }),
    );
    expect(countBends(run.paths)).toBe(1);
    expect(run.paths.reduce((sum, p) => sum + distance(p[0]!, p[1]!), 0)).toBe(14000);
    expect(run.paths.flat().some((p) => p.x === 12000)).toBe(false);
    expect(run.paths.flat().some((p) => p.y === 8000)).toBe(false);
  });

  it('gives no path and every room unreached when there are no lines', () => {
    const run = planMainRun(planInput({ demands: [demand('B', []), demand('A', [])] }));
    expect(run.lines).toEqual([]);
    expect(run.paths).toEqual([]);
    expect(run.rootPointMm).toEqual(far);
    expect(run.unreachedRoomIds).toEqual(['A', 'B']);
  });
});

describe('planMainRun across a wall gap', () => {
  const gapInside = insideRects([
    [0, 0, 10000, 2000],
    [11000, 0, 21000, 2000],
  ]);
  const gapScene = (demands: MainDemand[], startMm: Vec2 = { x: 1000, y: 1000 }): PlanInput =>
    planInput({
      lines: [hLine('a', 1000, 0, 10000), hLine('b', 1000, 11000, 21000)],
      startMm,
      demands,
      inside: gapInside,
    });
  const r1 = demand('R1', [door(5000, 1500, { x: 0, y: -1 })]);
  const r2 = demand('R2', [door(15000, 1500, { x: 0, y: -1 })]);

  it('joins the second component when a room needs it, across the gap', () => {
    const run = planMainRun(gapScene([r1, r2]));
    expect(run.unreachedRoomIds).toEqual([]);
    expect(run.joins).toHaveLength(1);
    expect(run.joins[0]!.crossesWall).toBe(true);
    expect(run.joins[0]!.path).toEqual([
      { x: 10000, y: 1000 },
      { x: 11000, y: 1000 },
    ]);
  });

  it('gives no join and no point beyond the gap when no room needs the second component', () => {
    const run = planMainRun(gapScene([r1]));
    expect(run.joins).toEqual([]);
    expect(run.paths.flat().some((p) => p.x >= 11000)).toBe(false);
  });

  it('takes the root on the second component when the start lies there and that component is nearer', () => {
    const run = planMainRun(gapScene([r1, r2], { x: 15000, y: 1000 }));
    expect(run.rootPointMm).toEqual({ x: 15000, y: 1000 });
    expect(run.stubCrossesWall).toBe(false);
  });

  it('gives a stub across the gap to the first component when the start lies in the gap', () => {
    const run = planMainRun(gapScene([r1], { x: 10500, y: 1000 }));
    expect(run.rootPointMm).toEqual({ x: 10000, y: 1000 });
    expect(run.stubCrossesWall).toBe(true);
    expect(run.paths[run.paths.length - 1]).toEqual([
      { x: 10500, y: 1000 },
      { x: 10000, y: 1000 },
    ]);
  });

  it('takes the root on the component with more rooms, although the other is nearer', () => {
    const run = planMainRun(
      gapScene(
        [
          demand('R1', [door(2000, 1500, { x: 0, y: -1 })]),
          demand('R2', [door(4000, 1500, { x: 0, y: -1 })]),
          demand('R3', [door(7000, 1500, { x: 0, y: -1 })]),
          demand('R4', [door(15000, 1500, { x: 0, y: -1 })]),
        ],
        { x: 10600, y: 1000 },
      ),
    );
    expect(run.rootPointMm).toEqual({ x: 10000, y: 1000 });
    expect(run.unreachedRoomIds).toEqual([]);
    expect(run.joins).toHaveLength(1);
  });

  it('gives the same joins and root when the lines and demands are reversed', () => {
    const base = gapScene([r1, r2]);
    const shuffled = planInput({ ...base, lines: [...base.lines].reverse(), demands: [...base.demands].reverse() });
    const run = planMainRun(base);
    const again = planMainRun(shuffled);
    expect(summary(again)).toEqual(summary(run));
    expect(again.joins).toEqual(run.joins);
    expect(again.rootPointMm).toEqual(run.rootPointMm);
  });

  it('reports the rooms that the join passes through', () => {
    const roomIdAt = (p: Vec2): string | null => (p.x <= 10000 ? 'left' : p.x >= 11000 ? 'right' : null);
    const run = planMainRun({ ...gapScene([r1, r2]), roomIdAt });
    expect(run.joins[0]!.roomIds).toEqual(['left', 'right']);
  });

  it('reports the rooms that the stub passes through', () => {
    const roomIdAt = (p: Vec2): string | null => (p.x <= 10000 ? 'left' : p.x >= 11000 ? 'right' : null);
    const run = planMainRun({ ...gapScene([r1], { x: 10500, y: 1000 }), roomIdAt });
    expect(run.stubRoomIds).toEqual(['left']);
  });

  it('gives no room ids when no roomIdAt is passed', () => {
    const run = planMainRun(gapScene([r1, r2]));
    expect(run.joins[0]!.roomIds).toEqual([]);
    expect(run.stubRoomIds).toEqual([]);
  });
});

describe('planMainRun on the manual fixture', () => {
  it('builds one tree within the bend and length gates', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const areaRoomObjects = s.drawing.rooms.filter((r) => s.area.rooms.some((a) => a.roomId === r.id));
    const areaRooms = areaRoomObjects.map((room) => ({ roomId: room.id, ringMm: room.polygon.outer.map(toMm) }));
    const shaftRoomIds = new Set(s.area.rooms.filter((r) => r.kind === 'shaft').map((r) => r.roomId));
    const linkPointsMm = s.area.links.filter((l) => !l.shaft).map((l) => toMm(l.point));
    const inside = withWallGaps(insideRouteArea(areaRoomObjects, mmPerPt), linkPointsMm);
    const startStamp = s.stamps.find((st) => st.id === s.startStampId);
    const startPort = startStamp ? getStampWorldPorts(startStamp).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!startPort) throw new Error('manual fixture: no start port');
    const startMm = toMm(startPort);
    const lines = mainRunLines({
      areaRooms,
      inside,
      startMm,
      offsetMm: 1000,
      blockers: [],
      shaftRoomIds,
      ductWidthMm: 400,
      clearanceMm: 150,
    });
    const corridorAt = (p: Vec2): boolean =>
      areaRoomObjects.some((r) => roomContainsPoint(r, { x: p.x / mmPerPt, y: p.y / mmPerPt }));
    const demands: MainDemand[] = s.servedRooms.map((room) => {
      const candidates = roomEntryCandidates({
        room,
        mmPerPt,
        areaEntries: s.area.entries.filter((e) => e.roomId === room.id),
        corridorAt,
        portsMm: s.targetPorts.filter((p) => p.roomId === room.id).map((p) => toMm(p.world)),
        alignedInGap: true,
      });
      return { roomId: room.id, doorsMm: candidates.map((c) => ({ pointMm: c.pointMm, outward: c.outward })) };
    });
    const roomIdAt = (p: Vec2): string | null =>
      areaRoomObjects.find((r) => roomContainsPoint(r, { x: p.x / mmPerPt, y: p.y / mmPerPt }))?.id ?? null;
    const run = planMainRun({ lines, startMm, demands, inside, bendMm: 500, reachMm: 4800, roomIdAt });

    const hasStub = distance(startMm, run.rootPointMm) > 1;
    const tree = hasStub ? run.paths.slice(0, -1) : run.paths;
    const treeLength = tree.reduce((sum, p) => sum + distance(p[0]!, p[1]!), 0);
    const bends = countBends(tree);
    const reached = demands.length - run.unreachedRoomIds.length;
    const pt = (p: Vec2): string => `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;
    const nearestLine = (p: Vec2): { id: string; dist: number } => {
      let best = { id: 'none', dist: Infinity };
      for (const l of lines) {
        const dist = distance(p, closestPointOnSegment(p, l.a, l.b).point);
        if (dist < best.dist) best = { id: l.id, dist };
      }
      return best;
    };
    const stubLength = hasStub ? distance(startMm, run.rootPointMm) : 0;
    const stubPath = hasStub ? run.paths[run.paths.length - 1]! : null;
    console.log(
      [
        `P2 T06-1: planMainRun on the manual fixture (${lines.length} input lines, ${demands.length} served rooms)`,
        ...run.lines.map((l) => `${l.id}  (${l.a.x.toFixed(0)}, ${l.a.y.toFixed(0)}) -> (${l.b.x.toFixed(0)}, ${l.b.y.toFixed(0)})`),
        `tree length ${(treeLength / 1000).toFixed(2)} m`,
        `bends ${bends}`,
        `rooms reached ${reached} of ${demands.length}`,
        `unreached rooms ${run.unreachedRoomIds.length}: ${run.unreachedRoomIds.join(' ')}`,
        'chosen hit per room (nearest input line):',
        ...[...run.chosenHitByRoom].map(([id, p]) => {
          const near = nearestLine(p);
          return `${id}: ${pt(p)} on ${near.id} at ${near.dist.toFixed(0)} mm`;
        }),
        `stub crosses wall ${run.stubCrossesWall}`,
        `stub rooms: ${run.stubRoomIds.join(' ') || 'none'}`,
        `joins ${run.joins.length}`,
        ...run.joins.map(
          (j) => `join ${pt(j.path[0]!)} -> ${pt(j.path[1]!)} crosses wall ${j.crossesWall} rooms ${j.roomIds.join(' ') || 'none'}`,
        ),
        `stub length ${(stubLength / 1000).toFixed(2)} m: ${stubPath ? `${pt(stubPath[0]!)} -> ${pt(stubPath[1]!)}` : 'none'}`,
      ].join('\n'),
    );

    expect(tree.length).toBeGreaterThan(0);
    expect(treeLength).toBeGreaterThan(0);
    expect(reached).toBeGreaterThanOrEqual(18);
    expect(bends).toBeLessThanOrEqual(8);
    expect(treeLength).toBeLessThanOrEqual(1.1 * 89300);
    for (const [roomId, p] of run.chosenHitByRoom) {
      expect(run.unreachedRoomIds).not.toContain(roomId);
      const doors = demands.find((d) => d.roomId === roomId)!.doorsMm;
      expect(Math.min(...doors.map((d) => distance(d.pointMm, p)))).toBeLessThanOrEqual(4800);
    }
    expect(run.chosenHitByRoom.size + run.unreachedRoomIds.length).toBe(demands.length);
    expect(run.stubRoomIds.length).toBeGreaterThanOrEqual(2);
  }, 60000);
});
