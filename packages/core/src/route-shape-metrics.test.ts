import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { Fitting, Segment } from './network.js';
import type { Room } from './rooms/room.js';
import type { RouteArea } from './route-area.js';
import type { PlannedRoute } from './route-build.js';
import { routeMetrics } from './route-metrics.js';
import { polylinesOfPlan, shapeMetrics } from './route-shape-metrics.js';
import { buildScenario, firstFloorDrawing, manualScenario, runScenario, type Scenario } from './route-scenario.testutil.js';
import { getStampWorldPorts } from './stamp.js';

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): Room => ({
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
  source: 'manual',
  locked: false,
  open: false,
});

const EMPTY_AREA: RouteArea = { status: 'ok', rooms: [], nodes: [], edges: [], entries: [], links: [], unreached: [], parts: 0 };

const terminal = (id: string, x: number, y: number, roomId: string | null = null) => ({ id, point: { x, y }, roomId });

function measure(
  polylines: Vec2[][],
  options: { terminals?: ReturnType<typeof terminal>[]; rooms?: Room[]; area?: RouteArea; start?: Vec2 } = {},
) {
  return shapeMetrics({
    polylines,
    terminalsMm: options.terminals ?? [],
    startMm: options.start ?? { x: 0, y: 0 },
    rooms: options.rooms ?? [],
    area: options.area ?? EMPTY_AREA,
    mmPerPt: 1,
    pageIndex: 0,
  });
}

const segment = (id: string, a: Segment['endpointA'], b: Segment['endpointB'], geometry: Segment['geometry']): Segment => ({
  id,
  pageIndex: 0,
  networkTypeId: 'supply',
  shape: 'round',
  endpointA: a,
  endpointB: b,
  geometry,
});

describe('shapeMetrics', () => {
  it('counts one 90 degree bend in an L and places it outside any room', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]]);
    expect(m.lengthMm).toBe(2000);
    expect(m.bends).toBe(1);
    expect(m.bends90).toBe(1);
    expect(m.bends45).toBe(0);
    expect(m.bendsOther).toBe(1);
  });

  it('places the bend of an L in a served room and in a corridor', () => {
    const L = [[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]];
    const served = measure(L, { rooms: [rect('R', 900, -100, 1100, 100)], terminals: [terminal('t', 1000, 1000, 'R')] });
    expect(served.bendsServedRooms).toBe(1);
    expect(served.bendsOther).toBe(0);
    const area: RouteArea = { ...EMPTY_AREA, rooms: [{ roomId: 'C', kind: 'path', typeId: 'corridor', open: false, name: null }] };
    const corridor = measure(L, { rooms: [rect('C', 900, -100, 1100, 100)], area });
    expect(corridor.bendsCorridors).toBe(1);
  });

  it('counts two 90 degree bends in a Z', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 2000, y: 1000 }]]);
    expect(m.bends).toBe(2);
    expect(m.bends90).toBe(2);
  });

  it('counts a tee on a straight line and keeps the main line as one straight piece', () => {
    const m = measure([
      [{ x: 0, y: 0 }, { x: 6000, y: 0 }],
      [{ x: 3000, y: 0 }, { x: 3000, y: 1000 }],
    ]);
    expect(m.tees).toBe(1);
    expect(m.crosses).toBe(0);
    expect(m.bends).toBe(0);
    expect(m.longestStraightMm).toBe(6000);
    expect(m.straightPieces5m).toBe(1);
  });

  it('counts a cross where two lines meet inside both', () => {
    const m = measure([
      [{ x: 0, y: 0 }, { x: 2000, y: 0 }],
      [{ x: 1000, y: -1000 }, { x: 1000, y: 1000 }],
    ]);
    expect(m.crosses).toBe(1);
    expect(m.tees).toBe(0);
    expect(m.bends).toBe(0);
  });

  it('counts the teeth of a comb as tees and finds no bend', () => {
    const m = measure([
      [{ x: 0, y: 0 }, { x: 4000, y: 0 }],
      [{ x: 1000, y: 0 }, { x: 1000, y: 500 }],
      [{ x: 2000, y: 0 }, { x: 2000, y: 500 }],
      [{ x: 3000, y: 0 }, { x: 3000, y: 500 }],
    ]);
    expect(m.tees).toBe(3);
    expect(m.bends).toBe(0);
  });

  it('counts a 45 degree bend as bends45', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 1000 }]]);
    expect(m.bends).toBe(1);
    expect(m.bends45).toBe(1);
    expect(m.bends90).toBe(0);
  });

  it('does not count a 10 degree turn as a bend', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 173.6 }]]);
    expect(m.bends).toBe(0);
  });

  it('measures a bent branch with a tee offset of 500 mm and a perpendicular branch with 0', () => {
    const main = [{ x: 0, y: 0 }, { x: 4000, y: 0 }];
    const bent = measure([main, [{ x: 2000, y: 0 }, { x: 2000, y: 500 }, { x: 3000, y: 500 }]], {
      rooms: [rect('R', 2500, 400, 3500, 1000)],
      terminals: [terminal('t', 3000, 800, 'R')],
    });
    expect(bent.teeOffsetMm.max).toBe(500);
    expect(bent.teeOffsetMm.median).toBe(500);
    expect(bent.branchLengthP90Mm).toBe(1000);
    const perpendicular = measure([main, [{ x: 2000, y: 0 }, { x: 2000, y: 1000 }]], {
      rooms: [rect('R2', 1500, 400, 2500, 1000)],
      terminals: [terminal('t', 2000, 800, 'R2')],
    });
    expect(perpendicular.teeOffsetMm.max).toBe(0);
    expect(perpendicular.teeOffsetMm.median).toBe(0);
  });

  it('gives a path-to-Manhattan ratio of 1 for a monotone L and more than 1 for a detour', () => {
    const L = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]], { terminals: [terminal('t', 1000, 1000)] });
    expect(L.pathToManhattan).toBeCloseTo(1);
    expect(L.meanBendsToTerminal).toBe(1);
    const detour = measure([[{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }]], {
      terminals: [terminal('t', 1000, 0)],
    });
    expect(detour.pathToManhattan).toBeCloseTo(3);
    expect(detour.longestPathFromStartMm).toBe(3000);
  });

  it('counts a chained room when the path to its terminal passes through another served room', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 3000, y: 0 }], [{ x: 1500, y: 0 }, { x: 1500, y: 300 }]], {
      rooms: [rect('B', 1000, -500, 2000, 500), rect('A', 2500, -500, 3500, 500)],
      terminals: [terminal('tB', 1500, 300, 'B'), terminal('tA', 3000, 0, 'A')],
    });
    expect(m.chainedRooms).toBe(1);
    expect(m.longestPathFromStartMm).toBe(3000);
    expect(Number.isFinite(m.meanBendsToTerminal)).toBe(true);
    expect(m.pathToManhattan).toBeGreaterThan(0);
  });

  it('merges two legs with 2 mm jitter into one straight piece only when snapping', () => {
    const legs = [
      [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      [{ x: 1000, y: 2 }, { x: 2000, y: 2 }],
    ];
    const snapped = shapeMetrics({
      polylines: legs,
      terminalsMm: [],
      startMm: { x: 0, y: 0 },
      rooms: [],
      area: EMPTY_AREA,
      mmPerPt: 1,
      pageIndex: 0,
      snapMm: 4,
    });
    expect(snapped.bends).toBe(0);
    expect(snapped.longestStraightMm).toBe(2000);
    const unsnapped = measure(legs);
    expect(unsnapped.bends).toBe(0);
    expect(unsnapped.longestStraightMm).toBe(1000);
  });

  it('gives all zeros and no NaN for empty input', () => {
    const m = measure([]);
    const values = [m.lengthMm, m.bends, m.bends90, m.bends45, m.bendsServedRooms, m.bendsCorridors, m.bendsOther, m.tees, m.crosses, m.straightPieces5m, m.longestStraightMm, m.meanBendsToTerminal, m.maxBendsToTerminal, m.pathToManhattan, m.multiEntryRooms, m.chainedRooms, m.singleTerminalStraight.rooms, m.singleTerminalStraight.straight, m.teeOffsetMm.max, m.teeOffsetMm.median, m.longestPathFromStartMm, m.branchLengthP90Mm, m.portsWithManyEnds];
    expect(values.every((v) => v === 0)).toBe(true);
  });

  it('drops non-finite vertices', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]]);
    expect(m.bends).toBe(1);
    expect(Number.isFinite(m.lengthMm)).toBe(true);
    expect(m.lengthMm).toBe(2000);
  });

  it('counts an overlapping stroke once', () => {
    const same = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }], [{ x: 0, y: 0 }, { x: 1000, y: 0 }]]);
    expect(same.lengthMm).toBe(1000);
    const partial = measure([[{ x: 0, y: 0 }, { x: 2000, y: 0 }], [{ x: 1000, y: 0 }, { x: 3000, y: 0 }]]);
    expect(partial.lengthMm).toBe(3000);
  });

  it('gives no tee offset when the branch never reaches a served room', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ x: 2000, y: 0 }, { x: 2000, y: 1000 }]], {
      rooms: [rect('far', 5000, 5000, 6000, 6000)],
      terminals: [terminal('t', 5500, 5500, 'far')],
    });
    expect(m.tees).toBe(1);
    expect(m.teeOffsetMm).toEqual({ max: 0, median: 0 });
    expect(m.branchLengthP90Mm).toBe(0);
  });

  it('counts a room entered twice as multi-entry', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 3000, y: 0 }]], {
      rooms: [rect('R', 1000, -500, 2000, 500)],
      terminals: [terminal('t', 1500, 300, 'R')],
    });
    expect(m.multiEntryRooms).toBe(1);
    expect(m.singleTerminalStraight).toEqual({ rooms: 1, straight: 1 });
  });

  it('a run along a wall that touches a corner is not an entry', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1500, y: 0 }], [{ x: 1000, y: -3000 }, { x: 1000, y: -500 }]], {
      rooms: [rect('R', 1000, -500, 2000, 500)],
      terminals: [terminal('t', 1500, 300, 'R')],
    });
    expect(m.multiEntryRooms).toBe(0);
    expect(m.multiEntryRoomIds).toEqual([]);
  });

  it('a run along a wall that passes a corner is not an entry', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1500, y: 0 }], [{ x: 1000, y: -3000 }, { x: 1000, y: -200 }]], {
      rooms: [rect('R', 1000, -500, 2000, 500)],
      terminals: [terminal('t', 1500, 300, 'R')],
    });
    expect(m.multiEntryRooms).toBe(0);
    expect(m.multiEntryRoomIds).toEqual([]);
  });

  it('counts a terminal on a degree 2 node as a port with many ends', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }]], {
      terminals: [terminal('t1', 1000, 0), terminal('t2', 2000, 0)],
    });
    expect(m.portsWithManyEnds).toBe(1);
  });

  it('lists the multi-entry room', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 3000, y: 0 }]], {
      rooms: [rect('R', 1000, -500, 2000, 500)],
      terminals: [terminal('t', 1500, 300, 'R')],
    });
    expect(m.multiEntryRoomIds).toEqual(['R']);
    expect(m.multiEntryPointsMm.R).toHaveLength(2);
  });

  it('lists a tee with its door', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 2000, y: 1600 }]], {
      rooms: [rect('R', 1500, 1000, 2500, 2000)],
      terminals: [terminal('t', 2000, 1800, 'R')],
    });
    expect(m.branches).toHaveLength(1);
    const [b] = m.branches;
    expect(b!.roomId).toBe('R');
    expect(b!.teeMm.x).toBeCloseTo(2000);
    expect(b!.teeMm.y).toBeCloseTo(0);
    expect(b!.doorMm.y).toBeCloseTo(1000, 0);
    expect(b!.offsetMm).toBeCloseTo(0);
    expect(b!.lengthMm).toBeCloseTo(1000, 0);
  });

  it('lists a bent single-terminal room and the bend place', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]], {
      rooms: [rect('R', 900, -100, 1100, 100)],
      terminals: [terminal('t', 1050, 50, 'R')],
    });
    expect(m.singleTerminalBentRoomIds).toEqual(['R']);
    expect(m.bendPlaces.R).toBe(1);
  });

  it('names the room that a path passes (chained)', () => {
    const m = measure([[{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 3000, y: 0 }]], {
      rooms: [rect('A', 1000, -500, 2000, 500), rect('B', 2500, -500, 3500, 500)],
      terminals: [terminal('tA', 1500, 0, 'A'), terminal('tB', 3000, 0, 'B')],
    });
    expect(m.chainedRoomIds).toEqual(['B']);
    expect(m.chainedVia.B).toBe('A');
    expect(m.chainedRooms).toBe(1);
  });
});

describe('polylinesOfPlan', () => {
  it('converts to mm and merges a collinear vertex', () => {
    const plan: PlannedRoute = {
      segments: [segment('s1', { kind: 'port', elementId: 'S', portId: 'out' }, { kind: 'port', elementId: 'T', portId: 'in' }, [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }])],
      fittings: [] as Fitting[],
      removeSegmentIds: [],
      removeFittingIds: [],
      warnings: [],
      stats: { segments: 1, fittings: 0, lengthMm: 0, bends90: 0, bends45: 0, freeLegs: 0, rooms: 0, ports: 0, portsLeft: 0, wallCrossings: 0, wallCrossingsRoom: 0, wallCrossingsCorridor: 0, existingCrossings: 0, removedSegments: 0, removedFittings: 0 },
      sizes: [],
    };
    expect(polylinesOfPlan(plan, 2)).toEqual([[{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }]]);
  });
});

describe('shapeMetrics on the real plan', () => {
  const startMmOf = (s: Scenario): Vec2 => {
    const stamp = s.stamps.find((st) => st.id === s.startStampId);
    const world = stamp ? getStampWorldPorts(stamp).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!world) throw new Error(`no start port ${s.startStampId} ${s.startPortId}`);
    return { x: world.x * s.drawing.mmPerPt, y: world.y * s.drawing.mmPerPt };
  };

  it('agrees with routeMetrics on the bend count of the planned route', () => {
    const s = buildScenario(firstFloorDrawing(), 'A');
    expect(s).not.toBeNull();
    if (!s) return;
    const mmPerPt = s.drawing.mmPerPt;
    const run = runScenario(s);
    const legacy = routeMetrics({
      plan: run.plan,
      rooms: s.drawing.rooms,
      area: s.area,
      mmPerPt,
      pageIndex: s.pageIndex,
      startStampId: s.startStampId,
      startPortId: s.startPortId,
    });
    const shape = shapeMetrics({
      polylines: polylinesOfPlan(run.plan, mmPerPt),
      terminalsMm: s.targetPorts.map((p) => ({ id: `${p.stampId}:${p.portId}`, point: { x: p.world.x * mmPerPt, y: p.world.y * mmPerPt }, roomId: p.roomId })),
      startMm: startMmOf(s),
      rooms: s.drawing.rooms,
      area: s.area,
      mmPerPt,
      pageIndex: s.pageIndex,
    });
    const legacyBends = legacy.bendsArea90 + legacy.bendsArea45 + legacy.bendsRoom90 + legacy.bendsRoom45 + legacy.bendsOutside;
    // An elbow fitting where three or more segment ends meet is a junction in the graph (degree 3 or more), not a bend.
    const tolMm = 1.5 * mmPerPt;
    const junctionElbows = run.plan.fittings.filter((f) => {
      if (f.kind !== 'elbow') return false;
      const p = { x: f.position.x * mmPerPt, y: f.position.y * mmPerPt };
      const ends = run.plan.segments.filter((seg) => [seg.geometry[0]!, seg.geometry[seg.geometry.length - 1]!].some((q) => Math.hypot(q.x * mmPerPt - p.x, q.y * mmPerPt - p.y) <= tolMm)).length;
      return ends > 2;
    }).length;
    const twoEndElbows = run.plan.fittings.filter((f) => {
      if (f.kind !== 'elbow') return false;
      const p = { x: f.position.x * mmPerPt, y: f.position.y * mmPerPt };
      const aways = run.plan.segments.flatMap((seg) => {
        const g = seg.geometry.map((q) => ({ x: q.x * mmPerPt, y: q.y * mmPerPt }));
        const out: { x: number; y: number }[] = [];
        if (Math.hypot(g[0]!.x - p.x, g[0]!.y - p.y) <= tolMm) out.push({ x: g[1]!.x - g[0]!.x, y: g[1]!.y - g[0]!.y });
        const last = g[g.length - 1]!;
        if (Math.hypot(last.x - p.x, last.y - p.y) <= tolMm) out.push({ x: g[g.length - 2]!.x - last.x, y: g[g.length - 2]!.y - last.y });
        return out;
      });
      if (aways.length !== 2) return false;
      const u = { x: -aways[0]!.x, y: -aways[0]!.y };
      const w = aways[1]!;
      const deflection = (Math.atan2(Math.abs(u.x * w.y - u.y * w.x), u.x * w.x + u.y * w.y) * 180) / Math.PI;
      return Math.abs(deflection - 90) <= 1 || Math.abs(deflection - 45) <= 1;
    }).length;
    console.log('CROSS-CHECK bends shape', shape.bends, 'legacy', legacyBends, 'junction elbows', junctionElbows, 'two-end 90/45 elbows (geometry)', twoEndElbows, 'portsWithManyEnds', shape.portsWithManyEnds);
    expect(shape.bends).toBe(legacyBends - junctionElbows);
    expect(typeof shape.portsWithManyEnds).toBe('number');
  });
});

describe('shapeMetrics on the manual fixture', () => {
  it('runs on the hand route and prints the result', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s, manual } = fixture;
    const mmPerPt = s.drawing.mmPerPt;
    const toMm = (strokes: Vec2[][]): Vec2[][] => strokes.map((stroke) => stroke.map((p) => ({ x: p.x * mmPerPt, y: p.y * mmPerPt })));
    const startWorld = s.stamps.find((st) => st.id === s.startStampId);
    const startPort = startWorld ? getStampWorldPorts(startWorld).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!startPort) throw new Error('manual fixture: no start port');
    const result = shapeMetrics({
      polylines: toMm([...manual.main, ...manual.room]),
      terminalsMm: s.targetPorts.map((p) => ({ id: `${p.stampId}:${p.portId}`, point: { x: p.world.x * mmPerPt, y: p.world.y * mmPerPt }, roomId: p.roomId })),
      startMm: { x: startPort.x * mmPerPt, y: startPort.y * mmPerPt },
      rooms: s.drawing.rooms,
      area: s.area,
      mmPerPt,
      pageIndex: s.pageIndex,
      snapMm: 4 * mmPerPt,
    });
    console.log('MANUAL shapeMetrics', JSON.stringify(result, null, 1));
    for (const value of [result.lengthMm, result.bends, result.bends90, result.bends45, result.bendsServedRooms, result.bendsCorridors, result.bendsOther, result.tees, result.crosses, result.straightPieces5m, result.longestStraightMm, result.meanBendsToTerminal, result.maxBendsToTerminal, result.pathToManhattan, result.multiEntryRooms, result.chainedRooms, result.longestPathFromStartMm, result.branchLengthP90Mm, result.portsWithManyEnds]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
