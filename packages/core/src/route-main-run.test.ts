import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { insideRouteArea, withWallGaps } from './route-layout.js';
import { mainRunLines, type MainLine, type MainLineInput } from './route-main-run.js';
import { manualScenario } from './route-scenario.testutil.js';
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
