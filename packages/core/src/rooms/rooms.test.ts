import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROOM_DETECTION_PARAMS,
  KIND_CLOSED_FLAG,
  REJECT_REASON,
  SEGMENT_STRIDE,
  SEG_COLOR,
  SEG_KIND,
  SEG_PATH_ID,
  SEG_WIDTH,
  detectRoomAt,
  fillRoomAt,
  filterWallSegments,
  type FilteredWalls,
  type RoomDetectionCache,
  type WallCandidateSegments,
} from './index.js';
import { isSimpleRing, ringArea } from './polygon-check.testutil.js';

// Test drawing: 1 pt = 25 mm. A room of 240 x 160 pt is 6000 x 4000 mm = 24 m2.
const MM = 25;
const W = 240;
const H = 160;
const T = 8; // wall thickness: 200 mm
const ROOM_M2 = 24;

interface Seg {
  a: [number, number];
  b: [number, number];
  width?: number;
  kind?: number;
  id?: number;
}

function build(list: Seg[], bounds?: [number, number, number, number]): WallCandidateSegments {
  const segments = new Float64Array(list.length * SEGMENT_STRIDE);
  list.forEach((s, i) => {
    const o = i * SEGMENT_STRIDE;
    segments.set([s.a[0], s.a[1], s.b[0], s.b[1], s.width ?? 0.5, 0x000000, s.kind ?? 0, s.id ?? i + 1], o);
  });
  return { segments, segmentCount: list.length, bounds };
}

const line = (x0: number, y0: number, x1: number, y1: number, extra: Partial<Seg> = {}): Seg => ({ a: [x0, y0], b: [x1, y1], ...extra });

// Double-line walls around the rectangle (0,0)-(W,H). `gap` cuts a door opening of the given
// height (pt) into the right wall, starting at y = gapY.
function rectWalls(opts: { gapY?: number; gap?: number; ticks?: boolean } = {}): Seg[] {
  const s: Seg[] = [];
  s.push(line(0, 0, W, 0), line(-T, -T, W + T, -T));
  s.push(line(0, H, W, H), line(-T, H + T, W + T, H + T));
  s.push(line(0, 0, 0, H), line(-T, -T, -T, H + T));
  if (opts.gap && opts.gapY !== undefined) {
    const g0 = opts.gapY;
    const g1 = opts.gapY + opts.gap;
    s.push(line(W, 0, W, g0), line(W, g1, W, H));
    s.push(line(W + T, -T, W + T, g0), line(W + T, g1, W + T, H + T));
  } else {
    s.push(line(W, 0, W, H), line(W + T, -T, W + T, H + T));
  }
  if (opts.ticks) {
    // Hatch ticks between the two lines of the top and bottom wall, 5 pt (125 mm) apart.
    for (let x = 2; x < W; x += 5) {
      s.push(line(x, -T, x, 0, { width: 0.2 }), line(x, H, x, H + T, { width: 0.2 }));
    }
  }
  return s;
}

// A table drawn as two nested closed outlines 100 mm apart (they pair up like a thin wall). 8 segments.
function tableOutline(): Seg[] {
  const rect = (x0: number, y0: number, x1: number, y1: number, id: number): Seg[] => [
    line(x0, y0, x1, y0, { kind: 4, id }),
    line(x1, y0, x1, y1, { kind: 4, id }),
    line(x1, y1, x0, y1, { kind: 4, id }),
    line(x0, y1, x0, y0, { kind: 4, id }),
  ];
  return [...rect(100, 60, 140, 84, 500), ...rect(104, 64, 136, 80, 501)];
}

const BIG = [-400, -400, 700, 600] as [number, number, number, number];
const CENTER = { x: W / 2, y: H / 2 };

function fill(input: WallCandidateSegments, params = {}, seed = CENTER) {
  const f = filterWallSegments(input, MM, params);
  return { f, res: fillRoomAt({ walls: input, keep: f.keep }, seed, MM, params) };
}

describe('segment layout', () => {
  it('mirrors the layout of the pdf-engine VectorPageData', () => {
    expect(SEGMENT_STRIDE).toBe(8);
    expect([SEG_WIDTH, SEG_COLOR, SEG_KIND, SEG_PATH_ID]).toEqual([4, 5, 6, 7]);
    expect(KIND_CLOSED_FLAG).toBe(4);
    const input = build([line(1, 2, 3, 4, { width: 0.36, kind: 4, id: 9 })]);
    expect(Array.from(input.segments)).toEqual([1, 2, 3, 4, 0.36, 0, 4, 9]);
  });

  it('has the study defaults for the decided configuration', () => {
    const d = DEFAULT_ROOM_DETECTION_PARAMS;
    expect([d.gapMm, d.wallGrowMm, d.seedClosed, d.hatchEvidence, d.stairMinSteps, d.coverFrac, d.stairBox]).toEqual([1000, 0, true, false, 4, 0.1, true]);
  });
});

describe('filterWallSegments', () => {
  it('keeps the double-line walls of a room', () => {
    const input = build(rectWalls(), BIG);
    const { keep, stats, reason } = filterWallSegments(input, MM);
    expect(Array.from(keep)).toEqual(new Array(8).fill(1));
    expect(stats.kept).toBe(8);
    expect(Array.from(reason)).toEqual(new Array(8).fill(REJECT_REASON.kept));
  });

  it('drops a single line with no partner', () => {
    const input = build([...rectWalls(), line(20, 60, 100, 60)], BIG);
    const { keep, reason } = filterWallSegments(input, MM);
    expect(keep[8]).toBe(0);
    expect(reason[8]).toBe(REJECT_REASON.noPartner);
  });

  it('drops hatch ticks between the wall lines and keeps the wall lines', () => {
    const list = rectWalls({ ticks: true });
    const { keep, reason } = filterWallSegments(build(list, BIG), MM);
    for (let i = 0; i < 8; i++) expect(keep[i]).toBe(1);
    for (let i = 8; i < list.length; i++) {
      expect(keep[i]).toBe(0);
      expect(reason[i]).toBe(REJECT_REASON.hatch);
    }
  });

  it('drops a furniture rectangle (closed loop) inside the room', () => {
    const table = tableOutline();
    const list = [...rectWalls(), ...table];
    const { keep, reason } = filterWallSegments(build(list, BIG), MM);
    for (let i = 8; i < 16; i++) {
      expect(keep[i]).toBe(0);
      expect(reason[i]).toBe(REJECT_REASON.loop);
    }
  });

  it('keeps a column that bridges the ends of a wall', () => {
    // A wall of two double-line pieces with a square column between them.
    const list: Seg[] = [
      line(0, 0, 100, 0),
      line(0, -T, 100, -T),
      line(116, 0, 216, 0),
      line(116, -T, 216, -T),
      line(100, -T, 116, -T, { kind: 4, id: 900 }),
      line(116, -T, 116, 0, { kind: 4, id: 900 }),
      line(116, 0, 100, 0, { kind: 4, id: 900 }),
      line(100, 0, 100, -T, { kind: 4, id: 900 }),
    ];
    const { stats } = filterWallSegments(build(list), MM);
    // The column is 16 x 8 pt = 400 x 200 mm: a loop candidate that touches wall ends on two opposite sides.
    expect(stats.loopBridged).toBe(1);
  });

  it('removes a stair chain and reports the stair rule as the reason', () => {
    const treads: Seg[] = [];
    for (let k = 0; k < 6; k++) treads.push(line(0, 20 + 10 * k, 48, 20 + 10 * k)); // 1200 mm long, 250 mm pitch
    const input = build([...rectWalls(), ...treads], BIG);
    const on = filterWallSegments(input, MM);
    for (let i = 8; i < 14; i++) {
      expect(on.keep[i]).toBe(0);
      expect(on.reason[i]).toBe(REJECT_REASON.stair);
    }
    expect(on.stats.stairDropped).toBe(6);
    for (let i = 0; i < 8; i++) expect(on.keep[i]).toBe(1);
    const off = filterWallSegments(input, MM, { stairMinSteps: 0 });
    for (let i = 8; i < 14; i++) expect(off.keep[i]).toBe(1);
  });

  it('removes a dashed grid line (two rows of equal dashes)', () => {
    const dashes: Seg[] = [];
    for (let k = 0; k < 6; k++) {
      dashes.push(line(20 + 60 * k, 60, 60 + 60 * k, 60), line(20 + 60 * k, 64, 60 + 60 * k, 64)); // 1000 mm dash, 500 mm gap
    }
    const { keep, reason } = filterWallSegments(build([...rectWalls(), ...dashes], [-400, -400, 900, 600]), MM);
    for (let i = 8; i < 8 + dashes.length; i++) {
      expect(keep[i]).toBe(0);
      expect(reason[i]).toBe(REJECT_REASON.dash);
    }
  });

  it('drops a small free-standing pair by the component rule', () => {
    const list = [...rectWalls(), line(400, 40, 440, 40), line(400, 44, 440, 44)];
    const { keep, reason } = filterWallSegments(build(list, [-400, -400, 900, 600]), MM);
    expect(keep[8]).toBe(0);
    expect(reason[8]).toBe(REJECT_REASON.component);
    for (let i = 0; i < 8; i++) expect(keep[i]).toBe(1);
  });

  it('keeps two concentric arcs (curved wall) and drops a single arc', () => {
    const arc = (r: number, id: number): Seg[] => {
      const out: Seg[] = [];
      const n = 42;
      for (let k = 0; k < n; k++) {
        const a0 = (Math.PI * k) / n;
        const a1 = (Math.PI * (k + 1)) / n;
        out.push(line(200 + r * Math.cos(a0), 200 - r * Math.sin(a0), 200 + r * Math.cos(a1), 200 - r * Math.sin(a1), { kind: 2, id }));
      }
      return out;
    };
    const pair = build([...arc(100, 1), ...arc(108, 2), ...arc(300, 3)]);
    const { keep } = filterWallSegments(pair, MM);
    for (let i = 0; i < 84; i++) expect(keep[i]).toBe(1);
    for (let i = 84; i < 126; i++) expect(keep[i]).toBe(0);
  });
});

describe('fillRoomAt', () => {
  it('finds a rectangular room with double-line walls, inner face, exact polygon area', () => {
    const { res } = fill(build(rectWalls({ ticks: true }), BIG));
    expect(res.flags).toEqual({ touchesRoiBorder: false, open: false, fillEmpty: false });
    expect(res.areaM2).toBeGreaterThan(ROOM_M2 * 0.95);
    expect(res.areaM2).toBeLessThanOrEqual(ROOM_M2 * 1.005);
    expect(res.polygon.holes).toHaveLength(0);
    expect(res.polygon.outer.length).toBeGreaterThanOrEqual(4);
    expect(res.polygon.outer.length).toBeLessThanOrEqual(12);
    // Every polygon vertex lies on the inner face of the walls (0..W, 0..H), within a pixel or two.
    for (const p of res.polygon.outer) {
      expect(p.x).toBeGreaterThan(-3);
      expect(p.x).toBeLessThan(W + 3);
      expect(p.y).toBeGreaterThan(-3);
      expect(p.y).toBeLessThan(H + 3);
    }
    expect(isSimpleRing(res.polygon.outer)).toBe(true);
  });

  for (const pxMm of [20, 33.3, 50, 100]) {
    it(`polygon area matches the analytic area at ${pxMm} mm per pixel`, () => {
      const { res } = fill(build(rectWalls(), BIG), { pxMm });
      // The line pixel of each wall (one pixel per side) and the rounded corners of the grow-back are the expected loss.
      const tol = 0.012 + pxMm / 1200;
      expect(Math.abs(res.areaM2 - ROOM_M2) / ROOM_M2).toBeLessThan(tol);
      expect(Math.abs(res.areaM2 - res.pixelAreaM2) / res.pixelAreaM2).toBeLessThan(0.01);
      // The reported area is the shoelace area of the returned ring.
      expect(res.areaM2).toBeCloseTo((ringArea(res.polygon.outer) * MM * MM) / 1e6, 6);
      expect(isSimpleRing(res.polygon.outer)).toBe(true);
    });
  }

  it('grows into the wall line with wallGrowMm', () => {
    const input = build(rectWalls(), BIG);
    const a0 = fill(input, { wallGrowMm: 0 }).res.areaM2;
    const a1 = fill(input, { wallGrowMm: 100 }).res.areaM2;
    expect(a1).toBeGreaterThan(a0);
    // 100 mm on each side: about (W + H) * 2 * 100 mm = 1 m2 more.
    expect(a1 - a0).toBeGreaterThan(0.5);
    expect(a1 - a0).toBeLessThan(1.5);
  });

  it('closes a door gap up to the gap width', () => {
    const input = build(rectWalls({ gap: 32, gapY: 60 }), BIG); // 800 mm opening
    const { res } = fill(input);
    expect(res.flags.open).toBe(false);
    expect(res.flags.touchesRoiBorder).toBe(false);
    expect(res.areaM2).toBeGreaterThan(ROOM_M2 * 0.9);
    expect(res.areaM2).toBeLessThan(ROOM_M2 * 1.1);
  });

  it('flags a door gap wider than the gap width as a leak', () => {
    const input = build(rectWalls({ gap: 60, gapY: 50 }), BIG); // 1500 mm opening
    const { res } = fill(input);
    expect(res.flags.touchesRoiBorder).toBe(true);
    expect(res.flags.open).toBe(true);
  });

  it('follows a configurable gap width', () => {
    const input = build(rectWalls({ gap: 60, gapY: 50 }), BIG);
    const { res } = fill(input, { gapMm: 2000 });
    expect(res.flags.open).toBe(false);
    expect(res.areaM2).toBeGreaterThan(ROOM_M2 * 0.9);
  });

  it('is not disturbed by furniture inside the room', () => {
    const table = tableOutline();
    const base = fill(build(rectWalls(), BIG)).res.areaM2;
    const withTable = fill(build([...rectWalls(), ...table], BIG)).res;
    expect(withTable.areaM2).toBeCloseTo(base, 1);
    expect(withTable.polygon.holes).toHaveLength(0);
  });

  it('finds an L-shaped room', () => {
    const inner: [number, number][] = [[0, 0], [240, 0], [240, 80], [120, 80], [120, 160], [0, 160]];
    const outer: [number, number][] = [[-8, -8], [248, -8], [248, 88], [128, 88], [128, 168], [-8, 168]];
    const list: Seg[] = [];
    for (const ring of [inner, outer]) {
      for (let i = 0; i < ring.length; i++) list.push(line(ring[i]![0], ring[i]![1], ring[(i + 1) % ring.length]![0], ring[(i + 1) % ring.length]![1]));
    }
    const { res } = fill(build(list, BIG), {}, { x: 60, y: 40 });
    const exact = ((240 * 80 + 120 * 80) * MM * MM) / 1e6; // 18 m2
    expect(Math.abs(res.areaM2 - exact) / exact).toBeLessThan(0.05);
    expect(res.polygon.outer.length).toBeGreaterThanOrEqual(6);
    expect(res.polygon.outer.length).toBeLessThanOrEqual(14);
    expect(isSimpleRing(res.polygon.outer)).toBe(true);
    expect(res.flags.open).toBe(false);
  });

  it('returns the same L-shaped room when the click is in the other arm', () => {
    const inner: [number, number][] = [[0, 0], [240, 0], [240, 80], [120, 80], [120, 160], [0, 160]];
    const outer: [number, number][] = [[-8, -8], [248, -8], [248, 88], [128, 88], [128, 168], [-8, 168]];
    const list: Seg[] = [];
    for (const ring of [inner, outer]) {
      for (let i = 0; i < ring.length; i++) list.push(line(ring[i]![0], ring[i]![1], ring[(i + 1) % ring.length]![0], ring[(i + 1) % ring.length]![1]));
    }
    const input = build(list, BIG);
    const a = fill(input, {}, { x: 60, y: 40 }).res.areaM2;
    const b = fill(input, {}, { x: 60, y: 130 }).res.areaM2;
    expect(b).toBeCloseTo(a, 1);
  });

  it('gives a hole ring for a column when fillHoles is off, and none when it is on', () => {
    const col = [line(100, 60, 116, 60), line(116, 60, 116, 76), line(116, 76, 100, 76), line(100, 76, 100, 60)];
    const input = build([...rectWalls(), ...col], BIG);
    // Keep every segment: the column is a wall element here (bypass the loop rule).
    const walls: FilteredWalls = { walls: input, keep: new Uint8Array(input.segmentCount).fill(1) };
    const withHole = fillRoomAt(walls, CENTER, MM, { fillHoles: false });
    expect(withHole.polygon.holes).toHaveLength(1);
    expect(isSimpleRing(withHole.polygon.holes[0]!)).toBe(true);
    const columnM2 = (16 * 16 * MM * MM) / 1e6; // 0.4 x 0.4 m = 0.16 m2
    const full = fillRoomAt(walls, CENTER, MM, { fillHoles: true });
    expect(full.polygon.holes).toHaveLength(0);
    expect(full.areaM2 - withHole.areaM2).toBeGreaterThan(columnM2 * 0.6);
    expect(full.areaM2 - withHole.areaM2).toBeLessThan(columnM2 * 2.5);
    expect(isSimpleRing(withHole.polygon.outer)).toBe(true);
  });

  it('moves the seed off a wall line or furniture (auto seed)', () => {
    const input = build(rectWalls(), BIG);
    const onWall = fill(input, {}, { x: 0, y: 80 }).res; // click exactly on the inner wall line
    expect(onWall.areaM2).toBeGreaterThan(ROOM_M2 * 0.9);
    expect(onWall.seedPt.x).toBeGreaterThan(20);
    expect(onWall.seedPt.x).toBeLessThan(W - 20);
  });

  it('sets the open flag from the label area', () => {
    const input = build(rectWalls(), BIG);
    expect(fill(input, { labelAreaM2: ROOM_M2 }).res.flags.open).toBe(false);
    expect(fill(input, { labelAreaM2: 10 }).res.flags.open).toBe(true);
    expect(fill(input, { labelAreaM2: 10, openRatio: 3 }).res.flags.open).toBe(false);
  });

  it('flags an empty fill when the seed is outside the page bounds', () => {
    const input = build(rectWalls(), [0, 0, 300, 300]);
    const f = filterWallSegments(input, MM);
    const res = fillRoomAt({ walls: input, keep: f.keep }, { x: 5000, y: 5000 }, MM);
    expect(res.flags.fillEmpty).toBe(true);
    expect(res.areaM2).toBe(0);
    expect(res.polygon.outer).toHaveLength(0);
  });
});

describe('detectRoomAt', () => {
  it('filters once and reuses the keep flags for repeated clicks', () => {
    const input = build(rectWalls({ ticks: true }), BIG);
    const cache: RoomDetectionCache = {};
    const a = detectRoomAt(input, CENTER, MM, {}, cache);
    const first = cache.filtered;
    expect(first).toBeDefined();
    const b = detectRoomAt(input, { x: 50, y: 50 }, MM, { wallGrowMm: 100 }, cache); // fill parameters keep the cache
    expect(cache.filtered).toBe(first);
    expect(b.areaM2).toBeGreaterThan(a.areaM2);
    detectRoomAt(input, CENTER, MM, { minLenMm: 300 }, cache); // a filter parameter refreshes it
    expect(cache.filtered).not.toBe(first);
    const second = cache.filtered;
    detectRoomAt(input, CENTER, 26, {}, cache); // a new scale refreshes it too
    expect(cache.filtered).not.toBe(second);
  });

  it('works without a cache', () => {
    const res = detectRoomAt(build(rectWalls(), BIG), CENTER, MM);
    expect(res.areaM2).toBeGreaterThan(ROOM_M2 * 0.95);
  });
});
