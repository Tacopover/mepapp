import { describe, expect, it } from 'vitest';
import type { Fitting, Segment } from './network.js';
import { polygonAreaPt2, roomLabelPoint, type Room } from './rooms/room.js';
import { loadFirstFloorRooms } from './rooms/route-area-fixture.testutil.js';
import { DEFAULT_ROUTE_AREA_TYPE_IDS, computeRouteArea, type RouteArea } from './route-area.js';
import { planRoute, type PlannedRoute, type RouteBuildInput } from './route-build.js';
import { findRoutePorts, type RoutePort, type RouteStamp } from './route-ports.js';
import { DEFAULT_SCORE_WEIGHTS, routeMetrics, scoreRoute } from './route-metrics.js';

const room = (id: string, x0: number, y0: number, x1: number, y1: number, pageIndex = 0): Room => ({
  id,
  pageIndex,
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

const segment = (id: string, a: Segment['endpointA'], b: Segment['endpointB'], geometry: Segment['geometry'], networkTypeId = 'supply'): Segment => ({
  id,
  pageIndex: 0,
  networkTypeId,
  shape: 'round',
  endpointA: a,
  endpointB: b,
  geometry,
});

const elbow = (id: string, x: number, y: number): Fitting => ({ id, pageIndex: 0, position: { x, y }, kind: 'elbow' });

// Start port S:out at (0, 0). Three legs of 1000, 2000 and 1000 mm, two 90 degree elbows, target port T:in.
function threeLegPlan(): PlannedRoute {
  return {
    segments: [
      segment('s1', { kind: 'port', elementId: 'S', portId: 'out' }, { kind: 'fitting', fittingId: 'e1' }, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]),
      segment('s2', { kind: 'fitting', fittingId: 'e1' }, { kind: 'fitting', fittingId: 'e2' }, [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }]),
      segment('s3', { kind: 'fitting', fittingId: 'e2' }, { kind: 'port', elementId: 'T', portId: 'in' }, [{ x: 1000, y: 2000 }, { x: 2000, y: 2000 }]),
    ],
    fittings: [elbow('e1', 1000, 0), elbow('e2', 1000, 2000)],
    removeSegmentIds: [],
    removeFittingIds: [],
    warnings: [],
    stats: { segments: 3, fittings: 2, lengthMm: 4000, bends90: 2, bends45: 0, freeLegs: 0, rooms: 0, ports: 1, portsLeft: 0, wallCrossings: 0, existingCrossings: 0, removedSegments: 0, removedFittings: 0 },
    sizes: [],
  };
}

const threeLegInput = (plan: PlannedRoute, rooms: Room[] = [], area: RouteArea = EMPTY_AREA) => ({
  plan,
  rooms,
  area,
  mmPerPt: 1,
  pageIndex: 0,
  startStampId: 'S',
  startPortId: 'out',
});

describe('routeMetrics', () => {
  it('measures a three leg route with two elbows', () => {
    const metrics = routeMetrics(threeLegInput(threeLegPlan()));
    expect(metrics.lengthMm).toBe(4000);
    expect(metrics.lengthBranchMm).toBe(4000);
    expect(metrics.lengthTrunkMm).toBe(0);
    expect(metrics.lengthRoomMm).toBe(0);
    expect(metrics.segments).toBe(3);
    expect(metrics.fittings).toBe(2);
    expect(metrics.fittingsByKind).toEqual({ junction: 0, elbow: 2, tee: 0, reducer: 0, cross: 0 });
    expect(metrics.bends90).toBe(2);
    expect(metrics.bends45).toBe(0);
    expect(metrics.freeLegs).toBe(0);
    expect(metrics.wallCrossings).toBe(0);
    expect(metrics.openRuns).toBe(0);
    expect(metrics.shaftCrossings).toBe(0);
    expect(metrics.longestPathMm).toBe(4000);
    expect(metrics.meanPathMm).toBe(4000);
    expect(metrics.branchLengthSpreadMm).toBe(0);
    expect(metrics.corridorShare).toBe(0);
    expect(metrics.freeLegsShare).toBe(0);
  });

  it('counts one wall crossing between two rooms', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2200, 0, 4200, 1000)];
    const plan: PlannedRoute = {
      ...threeLegPlan(),
      segments: [segment('w1', { kind: 'port', elementId: 'S', portId: 'out' }, { kind: 'port', elementId: 'T', portId: 'in' }, [{ x: 500, y: 500 }, { x: 3800, y: 500 }])],
    };
    const area: RouteArea = { ...EMPTY_AREA, rooms: [{ roomId: 'A', kind: 'path', typeId: 'corridor', open: false, name: null }] };
    const metrics = routeMetrics(threeLegInput(plan, rooms, area));
    expect(metrics.wallCrossings).toBe(1);
    expect(metrics.shaftCrossings).toBe(0);
  });

  it('counts a wall crossing into a shaft room as a shaft crossing', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2200, 0, 4200, 1000)];
    const plan: PlannedRoute = {
      ...threeLegPlan(),
      segments: [segment('w1', { kind: 'port', elementId: 'S', portId: 'out' }, { kind: 'port', elementId: 'T', portId: 'in' }, [{ x: 500, y: 500 }, { x: 3800, y: 500 }])],
    };
    const area: RouteArea = { ...EMPTY_AREA, rooms: [{ roomId: 'B', kind: 'shaft', typeId: 'shaft', open: false, name: null }] };
    const metrics = routeMetrics(threeLegInput(plan, rooms, area));
    expect(metrics.wallCrossings).toBe(1);
    expect(metrics.shaftCrossings).toBe(1);
  });

  it('takes the spread inside one network type, not across types', () => {
    // Start port S:out, one segment to fitting j, then to two target ports.
    const start = { kind: 'port', elementId: 'S', portId: 'out' } as const;
    const j = { kind: 'fitting', fittingId: 'j' } as const;
    const t1 = { kind: 'port', elementId: 'T1', portId: 'in' } as const;
    const t2 = { kind: 'port', elementId: 'T2', portId: 'in' } as const;
    const base = threeLegPlan();
    const tree = (secondType: string): PlannedRoute => ({
      ...base,
      segments: [
        segment('a', start, j, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]),
        segment('b', j, t1, [{ x: 1000, y: 0 }, { x: 2000, y: 0 }]),
        segment('c', j, t2, [{ x: 1000, y: 0 }, { x: 1000, y: 3000 }], secondType),
      ],
      fittings: [elbow('j', 1000, 0)],
    });

    const sameType = routeMetrics(threeLegInput(tree('supply')));
    expect(sameType.longestPathMm).toBe(4000);
    expect(sameType.meanPathMm).toBe(3000);
    expect(sameType.branchLengthSpreadMm).toBe(2000);

    const twoTypes = routeMetrics(threeLegInput(tree('return')));
    expect(twoTypes.longestPathMm).toBe(4000);
    expect(twoTypes.branchLengthSpreadMm).toBe(0);
  });

  it('does not count the start port as a target when the start is a stub fitting', () => {
    // The stub segment S:out to fitting stub is in the plan, so the start port is a port node of the graph.
    const plan: PlannedRoute = {
      ...threeLegPlan(),
      segments: [
        segment('st', { kind: 'port', elementId: 'S', portId: 'out' }, { kind: 'fitting', fittingId: 'stub' }, [{ x: 0, y: 0 }, { x: 500, y: 0 }]),
        segment('t', { kind: 'fitting', fittingId: 'stub' }, { kind: 'port', elementId: 'T', portId: 'in' }, [{ x: 500, y: 0 }, { x: 1500, y: 0 }]),
      ],
      fittings: [],
    };
    const metrics = routeMetrics({ ...threeLegInput(plan), startFittingId: 'stub' });
    expect(metrics.meanPathMm).toBe(1000);
    expect(metrics.longestPathMm).toBe(1000);
    expect(metrics.branchLengthSpreadMm).toBe(0);
  });

  const defectArea: RouteArea = { ...EMPTY_AREA, rooms: [{ roomId: 'C', kind: 'path', typeId: 'corridor', open: false, name: null }] };
  const defectRooms = [room('C', 0, 0, 2000, 1000), room('A', 2200, 0, 4200, 1000), room('B', 4400, 0, 6400, 1000)];
  const S = { kind: 'port', elementId: 'S', portId: 'out' } as const;
  const T = { kind: 'port', elementId: 'T', portId: 'in' } as const;

  it('counts a room that a segment enters directly from another served room, and a second entry', () => {
    const plan: PlannedRoute = {
      ...threeLegPlan(),
      segments: [
        segment('w1', S, T, [{ x: 500, y: 500 }, { x: 5800, y: 500 }]),
        segment('w2', { kind: 'port', elementId: 'U', portId: 'in' }, T, [{ x: 4000, y: -500 }, { x: 4000, y: 500 }]),
      ],
      fittings: [],
    };
    const metrics = routeMetrics(threeLegInput(plan, defectRooms, defectArea));
    expect(metrics.chainedRooms).toBe(1);
    expect(metrics.multiEntryRooms).toBe(1);
  });

  it('splits the bends by place and angle and counts long diagonal legs', () => {
    const plan: PlannedRoute = {
      ...threeLegPlan(),
      segments: [
        segment('s1', S, { kind: 'fitting', fittingId: 'e1' }, [{ x: 500, y: 500 }, { x: 2500, y: 500 }]),
        segment('s2', { kind: 'fitting', fittingId: 'e1' }, { kind: 'fitting', fittingId: 'e2' }, [{ x: 2500, y: 500 }, { x: 2500, y: 900 }]),
        segment('s3', { kind: 'fitting', fittingId: 'e2' }, { kind: 'fitting', fittingId: 'e3' }, [{ x: 2500, y: 900 }, { x: 3000, y: 1400 }]),
        segment('s4', { kind: 'fitting', fittingId: 'e3' }, T, [{ x: 3000, y: 1400 }, { x: 7000, y: 5400 }]),
      ],
      fittings: [elbow('e1', 2500, 500), elbow('e2', 2500, 900), elbow('e3', 3000, 1400)],
    };
    const metrics = routeMetrics(threeLegInput(plan, defectRooms, defectArea));
    expect(metrics.bendsRoom90).toBe(1);
    expect(metrics.bendsRoom45).toBe(1);
    expect(metrics.bendsOutside).toBe(0);
    expect(metrics.bendsArea90 + metrics.bendsArea45).toBe(0);
    expect(metrics.roomsWithBends).toBe(1);
    expect(metrics.diagonalLegs).toBe(2);
    expect(metrics.longDiagonalLegs).toBe(1);
  });

  it('gives zeros and no NaN for an empty plan', () => {
    const plan: PlannedRoute = { ...threeLegPlan(), segments: [], fittings: [] };
    const metrics = routeMetrics(threeLegInput(plan));
    expect(metrics.lengthMm).toBe(0);
    expect(metrics.corridorShare).toBe(0);
    expect(metrics.freeLegsShare).toBe(0);
    expect(metrics.meanPathMm).toBe(0);
    expect(metrics.longestPathMm).toBe(0);
    expect(metrics.branchLengthSpreadMm).toBe(0);
    for (const value of Object.values(metrics)) {
      if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('scores a route with the default weights and with a wall crossing weight', () => {
    const base = routeMetrics(threeLegInput(threeLegPlan()));
    const walled = { ...base, wallCrossings: 5 };
    expect(scoreRoute(walled)).toBe(scoreRoute(base));
    const custom = { ...DEFAULT_SCORE_WEIGHTS, wallCrossing: 3000 };
    expect(scoreRoute(walled, custom) - scoreRoute(base, custom)).toBe(15000);
    expect(scoreRoute({ ...base, lengthMm: base.lengthMm - 1000 })).toBeLessThan(scoreRoute(base));
  });
});

describe('routeMetrics on the first floor', () => {
  const { mmPerPt, rooms } = loadFirstFloorRooms();
  const PAGE = rooms[0]!.pageIndex;
  const TYPE = 'supply-air';
  const START_ID = 'start-ahu';
  const area = computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex: PAGE });
  const areaRoomIds = new Set(area.rooms.map((r) => r.roomId));
  const startRoom = area.rooms
    .filter((r) => r.kind === 'path')
    .map((r) => rooms.find((candidate) => candidate.id === r.roomId)!)
    .sort((a, b) => polygonAreaPt2(b.polygon) - polygonAreaPt2(a.polygon))[0]!;
  const servedRooms = rooms.filter((r) => r.pageIndex === PAGE && !areaRoomIds.has(r.id));

  function pointStamp(id: string, category: RouteStamp['category'], portId: string, at: { x: number; y: number }, routingTargets?: Record<string, string>): RouteStamp {
    return {
      id,
      category,
      transform: { position: { x: at.x, y: at.y }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 20,
      nativeHeight: 20,
      ports: [{ id: portId, name: portId, fractionX: 0.5, fractionY: 0.5 }],
      ...(routingTargets ? { routingTargets } : {}),
    };
  }

  const stamps: RouteStamp[] = [pointStamp(START_ID, 'equipment', 'out', roomLabelPoint(startRoom))];
  for (const room of servedRooms) stamps.push(pointStamp(`term-${room.id}`, 'terminal', 'in', roomLabelPoint(room), { in: TYPE }));
  const terminalIds = new Set(stamps.filter((s) => s.id !== START_ID).map((s) => s.id));

  const targetPorts: RoutePort[] = findRoutePorts({
    stamps,
    networkTypeId: TYPE,
    scope: { kind: 'stamps', stampIds: terminalIds },
    startStampId: START_ID,
    startPortId: 'out',
    rooms,
    pageIndex: PAGE,
    portChoice: 'order',
  }).ports;

  let idCounter = 0;
  const input: RouteBuildInput = {
    startStampId: START_ID,
    startPortId: 'out',
    networkTypeId: TYPE,
    targetPorts,
    state: { stamps, segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms,
    area,
    mmPerPt,
    pageIndex: PAGE,
    newSegmentId: () => `m-s${idCounter++}`,
    newFittingId: () => `m-f${idCounter++}`,
  };
  const result = planRoute(input);
  const plan = result.plan;
  const metrics = routeMetrics({ plan, rooms, area, mmPerPt, pageIndex: PAGE, startStampId: START_ID, startPortId: 'out' });

  it('agrees with the plan stats', () => {
    expect(result.status).toBe('ok');
    expect(metrics.segments).toBe(plan.stats.segments);
    expect(metrics.fittings).toBe(plan.fittings.length);
    expect(metrics.fittings).toBe(plan.stats.fittings);
    expect(metrics.bends90).toBe(plan.stats.bends90);
    expect(metrics.bends45).toBe(plan.stats.bends45);
    expect(metrics.freeLegs).toBe(plan.stats.freeLegs);
    expect(metrics.existingCrossings).toBe(plan.stats.existingCrossings);
    expect(metrics.portsLeft).toBe(plan.stats.portsLeft);
    expect(metrics.wallCrossings).toBe(plan.stats.wallCrossings);
    expect(metrics.lengthMm).toBeCloseTo(plan.stats.lengthMm, 3);
    expect(metrics.offGraphRooms).toBe(plan.warnings.find((w) => w.code === 'room-off-graph')?.count ?? 0);
  });

  it('splits the length into trunk, branch and room parts', () => {
    expect(metrics.lengthTrunkMm + metrics.lengthBranchMm + metrics.lengthRoomMm).toBeCloseTo(metrics.lengthMm, 3);
    expect(metrics.corridorShare).toBeGreaterThanOrEqual(0);
    expect(metrics.corridorShare).toBeLessThanOrEqual(1);
  });

  it('gives path lengths in order', () => {
    expect(metrics.meanPathMm).toBeGreaterThan(0);
    expect(metrics.longestPathMm).toBeGreaterThanOrEqual(metrics.meanPathMm);
  });
});
