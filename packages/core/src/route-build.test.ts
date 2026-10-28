import { describe, expect, it, vi } from 'vitest';
import { groupTargetPorts, planRoute, reducedState, resolveStart, type RouteBuildInput } from './route-build.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';
import { computeNetworks, type ConnectionPoint, type Fitting, type Segment } from './network.js';
import type { RoutePort, RouteStamp } from './route-ports.js';
import type { RouteArea, RouteAreaRoom, RouteEdge, RouteEntry, RouteNode } from './route-area.js';
import { distance, type Vec2 } from './geometry.js';
import { nearestOnEdges, splitEdgeAt, type GraphData } from './route-graph.js';
import { DEFAULT_LAYOUT_OPTIONS, isLayoutPath, legClass, SMALL_JUMP_MM } from './route-layout.js';
import { BEND_PENALTY_MM, CROSSING_PENALTY_MM } from './route-hanan.js';
import type { Room } from './rooms/room.js';
import { sizeNetwork } from './sizing-network.js';
import { SUGGESTED_AIR_SIZING } from './sizing-settings.js';
import {
  buildScenario,
  firstFloorDrawing,
  localDrawing,
  makeIdFactories,
  measureScenario,
  planHash,
  runScenario,
  shuffledScenario,
  type Drawing,
} from './route-scenario.testutil.js';
import * as trunk from './route-trunk.js';
import * as branch from './route-branch.js';
import * as topology from './route-topology.js';

vi.mock('./route-trunk.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./route-trunk.js')>();
  return { ...actual, buildTrunk: vi.fn(actual.buildTrunk) };
});
vi.mock('./route-branch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./route-branch.js')>();
  return { ...actual, planBranches: vi.fn(actual.planBranches) };
});
vi.mock('./route-topology.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./route-topology.js')>();
  return { ...actual, connectLoosePorts: vi.fn(actual.connectLoosePorts) };
});

const OUT = { id: 'out', name: 'Out', fractionX: 0, fractionY: 0 };
const OUT2 = { id: 'out2', name: 'Out 2', fractionX: 1, fractionY: 0 };
const IN = { id: 'in', name: 'In', fractionX: 1, fractionY: 1 };

function stamp(id: string, category: RouteStamp['category'], ports: RouteStamp['ports']): RouteStamp {
  return {
    id,
    category,
    transform: { position: { x: 100, y: 100 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 100,
    nativeHeight: 50,
    ports,
  };
}

const ahu = stamp('ahu', 'equipment', [OUT, OUT2, IN]);
const grille = stamp('grille', 'terminal', [OUT]);

function port(elementId: string, portId: string): ConnectionPoint {
  return { kind: 'port', elementId, portId };
}

function segment(id: string, networkTypeId: string, endpointA: ConnectionPoint, endpointB: ConnectionPoint): Segment {
  return { id, pageIndex: 0, networkTypeId, shape: 'round', diameter: 200, endpointA, endpointB, geometry: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
}

function fitting(id: string, x = 50, y = 0): Fitting {
  return { id, pageIndex: 0, position: { x, y }, kind: 'junction' };
}

function target(stampId: string, roomId: string | null): RoutePort {
  return { stampId, portId: 'out', networkTypeId: 'supply-air', world: { x: 0, y: 0 }, roomId };
}

const AREA: RouteArea = {
  status: 'ok',
  rooms: [{ roomId: 'corr', kind: 'path', typeId: 'corridor', open: false, name: null }],
  nodes: [],
  edges: [],
  entries: [],
  links: [],
  unreached: [],
  parts: 1,
};

let counter = 0;

function input(overrides: Partial<RouteBuildInput> = {}): RouteBuildInput {
  return {
    startStampId: 'ahu',
    startPortId: 'out',
    networkTypeId: 'supply-air',
    targetPorts: [target('grille', 'r1')],
    state: { stamps: [ahu, grille], segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: [],
    area: AREA,
    mmPerPt: 10,
    pageIndex: 0,
    newSegmentId: () => `new-s${counter++}`,
    newFittingId: () => `new-f${counter++}`,
    ...overrides,
  };
}

function withState(state: Partial<RouteBuildInput['state']>): RouteBuildInput['state'] {
  return { stamps: [ahu, grille], segments: [], fittings: [], portGroups: [], ...state };
}

function codes(result: ReturnType<typeof planRoute>): string[] {
  return result.plan.warnings.map((warning) => warning.code);
}

function expectRefused(result: ReturnType<typeof planRoute>, code: string): void {
  expect(result.status).toBe('refused');
  expect(result.plan.segments).toEqual([]);
  expect(result.plan.fittings).toEqual([]);
  expect(result.plan.removeSegmentIds).toEqual([]);
  expect(result.plan.removeFittingIds).toEqual([]);
  expect(result.plan.warnings).toContainEqual(expect.objectContaining({ code, severity: 'error' }));
}

describe('planRoute preconditions', () => {
  it('refuses a file with more than one page', () => {
    expectRefused(planRoute(input({ pageCount: 2 })), 'multi-page');
  });

  it('refuses a drawing with no calibration', () => {
    expectRefused(planRoute(input({ mmPerPt: null })), 'no-calibration');
  });

  it('refuses an empty route area', () => {
    expectRefused(planRoute(input({ area: { ...AREA, status: 'no-rooms', rooms: [] } })), 'area-empty');
  });

  it('refuses a gravity network type', () => {
    expectRefused(planRoute(input({ networkTypeId: 'sanitary-waste' })), 'gravity-not-routed');
  });

  it('refuses an unknown start stamp', () => {
    const result = planRoute(input({ startStampId: 'nope' }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['unknown-start']);
  });

  it('refuses a start port with two segments', () => {
    const segments = [
      segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
      segment('s2', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
    ];
    const result = planRoute(input({ state: withState({ segments }) }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['port-segments']);
  });

  it('refuses a start stamp that is not equipment', () => {
    const result = planRoute(input({ state: withState({ stamps: [stamp('ahu', 'terminal', [OUT, OUT2, IN]), grille] }) }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['not-equipment']);
  });

  it('refuses a stub network that holds a segment of another type', () => {
    const segments = [
      segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' }),
      segment('r1', 'return-air', { kind: 'fitting', fittingId: 'f1' }, port('grille', 'out')),
    ];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1')] }) }));
    expectRefused(result, 'foreign-start');
    expect(result.plan.warnings.find((warning) => warning.code === 'foreign-start')!.ids).toEqual(['r1']);
  });

  it('refuses a run with no target port', () => {
    expectRefused(planRoute(input({ targetPorts: [] })), 'no-targets');
  });

  it('collects all errors of step 1 in order', () => {
    const result = planRoute(input({ pageCount: 2, targetPorts: [] }));
    expect(codes(result)).toEqual(['multi-page', 'no-targets', 'draft-2d']);
  });

  it('puts draft-2d last in a refused result', () => {
    const result = planRoute(input({ pageCount: 2 }));
    expect(codes(result).at(-1)).toBe('draft-2d');
    expect(result.plan.stats.ports).toBe(0);
  });
});

describe('planRoute start', () => {
  it('extends a hand-drawn stub', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1', 30, 40)] }) }));
    expect(result.status).toBe('ok');
    expect(result.plan.warnings).toContainEqual({ code: 'extends-stub', severity: 'info', ids: ['s1', 'f1'] });
  });

  it('counts the marked segments that stay joined to the start through a hand-drawn segment', () => {
    const marked = (id: string, a: ConnectionPoint, b: ConnectionPoint): Segment => ({ ...segment(id, 'supply-air', a, b), routedBy: 'route' });
    const f1: ConnectionPoint = { kind: 'fitting', fittingId: 'f1' };
    const f2: ConnectionPoint = { kind: 'fitting', fittingId: 'f2' };
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), f1), marked('m1', f1, f2), marked('m2', f2, port('grille', 'out'))];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1'), fitting('f2')] }), targetPorts: [] }));
    expect(result.plan.warnings).toContainEqual({ code: 'held-by-hand', severity: 'info', count: 2 });
    expectRefused(result, 'no-targets');
  });

  it('counts the marked segments behind a hand-edited segment when the start segment is removed', () => {
    const marked = (id: string, a: ConnectionPoint, b: ConnectionPoint): Segment => ({ ...segment(id, 'supply-air', a, b), routedBy: 'route' });
    const f1: ConnectionPoint = { kind: 'fitting', fittingId: 'f1' };
    const f2: ConnectionPoint = { kind: 'fitting', fittingId: 'f2' };
    const segments = [marked('m0', port('ahu', 'out'), f1), segment('h1', 'supply-air', f1, f2), marked('m2', f2, port('grille', 'out'))];
    const removal = { segmentIds: ['m0'], fittingIds: [] };
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1'), fitting('f2')] }), removal, targetPorts: [] }));
    expect(result.plan.warnings).toContainEqual({ code: 'held-by-hand', severity: 'info', count: 1 });
  });

  it('gives no held-by-hand line for a plain stub', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1', 30, 40)] }) }));
    expect(codes(result)).not.toContain('held-by-hand');
  });

  it('refuses a stub whose far end is a port', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out'))];
    expectRefused(planRoute(input({ state: withState({ segments }) })), 'start-unreachable');
  });

  it('warns about a same-type join through a port group', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out2'), port('grille', 'out'))];
    const portGroups = [{ elementId: 'ahu', portIds: ['out', 'out2'] }];
    const result = planRoute(input({ state: withState({ segments, portGroups }) }));
    expect(result.status).toBe('ok');
    expect(result.plan.warnings).toContainEqual({ code: 'same-type-join', severity: 'warning', ids: ['out2'] });
  });

  it('puts draft-2d last in an ok result', () => {
    expect(codes(planRoute(input())).at(-1)).toBe('draft-2d');
  });
});

describe('planRoute removal', () => {
  const segments = [segment('s2', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f2' })];
  const state = withState({ segments, fittings: [fitting('f2')] });

  it('treats a start port whose segment is removed as free', () => {
    const result = planRoute(input({ state, removal: { segmentIds: ['s2'], fittingIds: ['f2'] } }));
    expect(result.status).toBe('ok');
    expect(codes(result)).not.toContain('extends-stub');
  });

  it('reports the removal and sorts the removal ids', () => {
    const removal = { segmentIds: ['s9', 's2'], fittingIds: ['f2'] };
    const result = planRoute(input({ state, removal }));
    expect(result.plan.warnings).toContainEqual({ code: 'removes-routed', severity: 'info', numbers: { segments: 2, fittings: 1 } });
    expect(result.plan.removeSegmentIds).toEqual(['s2', 's9']);
    expect(result.plan.removeFittingIds).toEqual(['f2']);
    expect(result.plan.stats.removedSegments).toBe(2);
    expect(result.plan.stats.removedFittings).toBe(1);
  });

  it('removes exactly the removal ids in reducedState and keeps its input', () => {
    const value = withState({
      segments: [segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')), segments[0]!],
      fittings: [fitting('f1'), fitting('f2')],
    });
    const before = structuredClone(value);
    const reduced = reducedState(value, { segmentIds: ['s2'], fittingIds: ['f1'] });
    expect(reduced.segments.map((s) => s.id)).toEqual(['s1']);
    expect(reduced.fittings.map((f) => f.id)).toEqual(['f2']);
    expect(value).toEqual(before);
  });
});

describe('groupTargetPorts', () => {
  it('groups ports by room, outside and in the area', () => {
    const ports = [target('a', 'r2'), target('b', null), target('c', 'corr'), target('d', 'r1'), target('e', 'r2')];
    const grouped = groupTargetPorts(ports, new Set(['corr']));
    expect([...grouped.byRoom.keys()]).toEqual(['r1', 'r2']);
    expect(grouped.byRoom.get('r2')!.map((p) => p.stampId)).toEqual(['a', 'e']);
    expect(grouped.outside.map((p) => p.stampId)).toEqual(['b']);
    expect(grouped.inArea.map((p) => p.stampId)).toEqual(['c']);
  });
});

describe('planRoute multi-port stamps', () => {
  const rad = { ...stamp('rad', 'terminal', [{ id: 'a', name: 'A', fractionX: 0, fractionY: 0 }, { id: 'b', name: 'B', fractionX: 1, fractionY: 1 }]), routingTargets: { a: 'supply-air', b: 'supply-air' } };
  const radTarget: RoutePort = { stampId: 'rad', portId: 'a', networkTypeId: 'supply-air', world: { x: 0, y: 0 }, roomId: 'r1' };

  it('gives an info line with the used port and the open ports of a stamp with two open ports', () => {
    const result = planRoute(input({ state: withState({ stamps: [ahu, rad] }), targetPorts: [radTarget] }));
    expect(result.status).toBe('ok');
    expect(result.plan.warnings).toContainEqual({ code: 'multi-port-stamps', severity: 'info', count: 1, ids: ['rad'], stamps: [{ id: 'rad', used: 1, open: 2 }] });
    expect(codes(result).at(-1)).toBe('draft-2d');
  });

  it('gives no line when the other port of the stamp already has a segment', () => {
    const held = { ...rad, portSegmentTypes: { a: 'supply-air' } };
    const second: RoutePort = { ...radTarget, portId: 'b' };
    const result = planRoute(input({ state: withState({ stamps: [ahu, held] }), targetPorts: [second] }));
    expect(codes(result)).not.toContain('multi-port-stamps');
  });

  it('gives no line for a stamp with one open port', () => {
    const result = planRoute(input());
    expect(codes(result)).not.toContain('multi-port-stamps');
  });
});

describe('planRoute result', () => {
  it('counts rooms and ports in the stats', () => {
    const targetPorts = [target('a', 'r1'), target('b', 'r1'), target('c', 'r2'), target('d', null)];
    const result = planRoute(input({ targetPorts }));
    expect(result.status).toBe('ok');
    expect(result.plan.stats.rooms).toBe(2);
    expect(result.plan.stats.ports).toBe(4);
  });

  it('does not change its input', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const value = input({
      state: withState({ segments, fittings: [fitting('f1')] }),
      removal: { segmentIds: ['s9', 's8'], fittingIds: [] },
      targetPorts: [target('b', 'r2'), target('a', 'r1')],
    });
    const { newSegmentId, newFittingId, ...data } = value;
    const before = { ...structuredClone(data), newSegmentId, newFittingId };
    planRoute(value);
    expect(value).toEqual(before);
  });
});

const MM_PER_PT = 10;

function pt(p: Vec2): Vec2 {
  return { x: p.x / MM_PER_PT, y: p.y / MM_PER_PT };
}

function rect(id: string, x0: number, y0: number, x1: number, y1: number): Room {
  const outer = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map(pt);
  return { id, pageIndex: 0, polygon: { outer, holes: [] }, name: null, number: null, source: 'manual', locked: false, open: false };
}

function pathNode(roomId: string, k: number, xMm: number, yMm: number): RouteNode {
  return { id: `rn-${roomId}-${k}`, point: pt({ x: xMm, y: yMm }), kind: 'end', roomId };
}

function pathEdge(roomId: string, k: number, fromId: string, toId: string, pointsMm: Vec2[]): RouteEdge {
  const points = pointsMm.map(pt);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  return { id: `re-${roomId}-${k}`, from: fromId, to: toId, kind: 'center', points, lengthMm: length * MM_PER_PT, roomId };
}

function addEntry(graph: GraphData, servedRoomId: string, areaRoomId: string, wallMm: Vec2): RouteEntry {
  const entryId = `ry-${servedRoomId}-${areaRoomId}`;
  const wallNode: RouteNode = { id: `rw-${servedRoomId}-${areaRoomId}`, point: pt(wallMm), kind: 'wall', roomId: servedRoomId };
  graph.nodes.push(wallNode);
  const near = nearestOnEdges(graph, wallNode.point, (e) => e.kind === 'center' && e.roomId === areaRoomId)!;
  const targetId = splitEdgeAt(graph, near.edgeId, near.segment, near.point, `rt-${entryId}-0`);
  const target = graph.nodes.find((n) => n.id === targetId)!;
  graph.edges.push({
    id: `rc-${entryId}-0`,
    from: wallNode.id,
    to: target.id,
    kind: 'connector',
    points: [{ ...wallNode.point }, { ...target.point }],
    lengthMm: distance(wallNode.point, target.point) * MM_PER_PT,
    roomId: null,
  });
  return { id: entryId, roomId: servedRoomId, areaRoomId, nodeId: wallNode.id, point: pt(wallMm), runMm: 1000, gapMm: 0, primary: true, shaft: false };
}

function makeArea(rooms: RouteAreaRoom[], graph: GraphData, entries: RouteEntry[]): RouteArea {
  return { status: 'ok', rooms, nodes: graph.nodes, edges: graph.edges, entries, links: [], unreached: [], parts: 1 };
}

function placed(id: string, category: RouteStamp['category'], xMm: number, yMm: number): RouteStamp {
  return {
    id,
    category,
    transform: { position: pt({ x: xMm, y: yMm }), rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 10,
    nativeHeight: 10,
    ports: [{ id: 'out', name: 'Out', fractionX: 0.5, fractionY: 0.5 }],
  };
}

function targetAt(stampId: string, xMm: number, yMm: number, roomId: string | null, networkTypeId = 'supply-air'): RoutePort {
  return { stampId, portId: 'out', networkTypeId, world: pt({ x: xMm, y: yMm }), roomId };
}

/** A corridor c1 from (0,0) to (20000,0). r1 and r2 have an entry. r3 has none. The start stamp is at (0,-300). */
function corridorScene(networkTypeId = 'supply-air'): RouteBuildInput {
  const graph: GraphData = {
    nodes: [pathNode('c1', 0, 0, 0), pathNode('c1', 1, 20000, 0)],
    edges: [pathEdge('c1', 0, 'rn-c1-0', 'rn-c1-1', [{ x: 0, y: 0 }, { x: 20000, y: 0 }])],
  };
  const entries = [addEntry(graph, 'r1', 'c1', { x: 5000, y: -1000 }), addEntry(graph, 'r2', 'c1', { x: 12000, y: 1000 })];
  const area = makeArea([{ roomId: 'c1', kind: 'path', typeId: 'corridor', open: false, name: null }], graph, entries);
  const rooms = [rect('c1', 0, -1000, 20000, 1000), rect('r1', 4000, -5000, 8000, -1000), rect('r2', 10000, 1000, 14000, 5000), rect('r3', 16000, 3000, 20000, 7000)];
  const stamps = [placed('ahu', 'equipment', 0, -300), placed('t1', 'terminal', 6000, -3000), placed('t2', 'terminal', 12000, 3000), placed('t3', 'terminal', 18000, 5000), placed('t4', 'terminal', 15000, 500)];
  const targetPorts = [
    targetAt('t1', 6000, -3000, 'r1', networkTypeId),
    targetAt('t2', 12000, 3000, 'r2', networkTypeId),
    targetAt('t3', 18000, 5000, 'r3', networkTypeId),
    targetAt('t4', 15000, 500, 'c1', networkTypeId),
  ];
  let seg = 0;
  let fit = 0;
  return {
    startStampId: 'ahu',
    startPortId: 'out',
    networkTypeId,
    targetPorts,
    state: { stamps, segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms,
    area,
    mmPerPt: MM_PER_PT,
    pageIndex: 0,
    newSegmentId: () => `n-s${++seg}`,
    newFittingId: () => `n-f${++fit}`,
  };
}

function segmentMm(s: Segment): number {
  return Math.hypot(s.geometry[1]!.x - s.geometry[0]!.x, s.geometry[1]!.y - s.geometry[0]!.y) * MM_PER_PT;
}

function onPort(s: Segment, stampId: string): boolean {
  return [s.endpointA, s.endpointB].some((end) => end.kind === 'port' && end.elementId === stampId);
}

describe('planRoute items', () => {
  it('builds marked segments and fittings for a corridor with two served rooms', () => {
    const data = corridorScene();
    const existing = { ...data.state, segments: [segment('old-s1', 'supply-air', port('ahu', 'in'), port('ahu', 'out2'))], fittings: [fitting('old-f1')] };
    const result = planRoute({ ...data, state: existing });
    expect(result.status).toBe('ok');
    const { segments, fittings, stats, warnings } = result.plan;
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.routedBy === 'route')).toBe(true);
    expect(fittings.every((f) => f.routedBy === 'route')).toBe(true);
    const ids = [...segments.map((s) => s.id), ...fittings.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('old-s1');
    expect(ids).not.toContain('old-f1');
    const fromStart = segments.filter((s) => onPort(s, 'ahu'));
    expect(fromStart).toHaveLength(1);
    expect(fromStart[0]!.endpointA).toEqual({ kind: 'port', elementId: 'ahu', portId: 'out' });
    expect(fromStart[0]!.geometry[0]).toEqual({ x: 0, y: -30 });
    const endsOn = (stampId: string): number => segments.reduce((n, s) => n + [s.endpointA, s.endpointB].filter((e) => e.kind === 'port' && e.elementId === stampId).length, 0);
    for (const stampId of ['ahu', 't1', 't2', 't3', 't4']) expect(endsOn(stampId)).toBe(1);
    for (const s of segments) {
      expect(['axis', 'diagonal']).toContain(legClass({ x: s.geometry[0]!.x * MM_PER_PT, y: s.geometry[0]!.y * MM_PER_PT }, { x: s.geometry[1]!.x * MM_PER_PT, y: s.geometry[1]!.y * MM_PER_PT }));
    }
    expect(segments.reduce((sum, s) => sum + segmentMm(s), 0)).toBeCloseTo(stats.lengthMm, 3);
    expect(stats).toMatchObject({ segments: segments.length, fittings: fittings.length, rooms: 3, ports: 4, portsLeft: 0 });
    expect(warnings.find((w) => w.code === 'room-off-graph')).toEqual({ code: 'room-off-graph', severity: 'warning', ids: ['r3'], count: 1 });
    expect(warnings.some((w) => w.code === 'ports-left')).toBe(false);
    expect(warnings.at(-1)!.code).toBe('draft-2d');
  });

  it('gives the placeholder diameter of the discipline', () => {
    const water = planRoute(corridorScene('heating-water'));
    expect(water.plan.segments.length).toBeGreaterThan(0);
    expect(water.plan.segments.every((s) => s.diameter === 25 && s.networkTypeId === 'heating-water')).toBe(true);
    const air = planRoute(corridorScene('supply-air'));
    expect(air.plan.segments.every((s) => s.diameter === 200)).toBe(true);
    const typed = planRoute({ ...corridorScene('unknown-type'), networkType: { id: 'unknown-type', discipline: 'plumbing' } });
    expect(typed.plan.segments.every((s) => s.diameter === 25)).toBe(true);
    const unknown = planRoute(corridorScene('unknown-type'));
    expect(unknown.plan.segments.every((s) => s.diameter === 50)).toBe(true);
  });

  it('does not change its input and gives the same result twice', () => {
    const data = corridorScene();
    const { newSegmentId, newFittingId, ...plain } = data;
    const before = structuredClone(plain);
    const first = planRoute(data);
    expect({ ...plain }).toEqual(before);
    const second = planRoute(corridorScene());
    expect(second).toEqual(first);
  });

  it('connects a port that lies in a route-area room through the off-graph step', () => {
    const result = planRoute(corridorScene());
    expect(result.plan.segments.some((s) => onPort(s, 't4'))).toBe(true);
    expect(result.plan.warnings.find((w) => w.code === 'room-off-graph')!.ids).not.toContain('c1');
  });
});

describe('resolveStart', () => {
  const own = (): Segment => segment('stub', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'g' });
  it('gives the world position of the start port in mm when there is no segment', () => {
    const warnings: RoutePlanWarning[] = [];
    const data = input();
    expect(resolveStart(data, reducedState(data.state, data.removal), warnings)).toEqual({ ok: true, pointMm: { x: 500, y: 750 }, stubSegmentId: null, stubFittingId: null });
  });
  it('gives the stub fitting position in mm', () => {
    const warnings: RoutePlanWarning[] = [];
    const data = input({ state: withState({ segments: [own()], fittings: [fitting('g', 30, 40)] }) });
    expect(resolveStart(data, reducedState(data.state, data.removal), warnings)).toEqual({ ok: true, pointMm: { x: 300, y: 400 }, stubSegmentId: 'stub', stubFittingId: 'g' });
  });
  it('refuses a stub whose fitting is missing', () => {
    const result = planRoute(input({ state: withState({ segments: [own()] }) }));
    expectRefused(result, 'start-unreachable');
  });
  it('reads foreign-start from S, so a removed foreign segment does not count', () => {
    const foreign = segment('f1', 'return-air', { kind: 'fitting', fittingId: 'g' }, port('grille', 'out'));
    const state = withState({ segments: [own(), foreign], fittings: [fitting('g', 30, 40)] });
    expectRefused(planRoute(input({ state })), 'foreign-start');
    const result = planRoute(input({ state, removal: { segmentIds: ['f1'], fittingIds: [] } }));
    expect(result.status).toBe('ok');
  });
});

function foreignLine(id: string, xMm0: number, yMm0: number, xMm1: number, yMm1: number): { segment: Segment; fittings: Fitting[] } {
  const a = pt({ x: xMm0, y: yMm0 });
  const b = pt({ x: xMm1, y: yMm1 });
  return {
    segment: { ...segment(id, 'return-air', { kind: 'fitting', fittingId: `${id}-a` }, { kind: 'fitting', fittingId: `${id}-b` }), geometry: [a, b] },
    fittings: [fitting(`${id}-a`, a.x, a.y), fitting(`${id}-b`, b.x, b.y)],
  };
}

function withForeign(data: RouteBuildInput, foreign: { segment: Segment; fittings: Fitting[] }): RouteBuildInput {
  return { ...data, state: { ...data.state, segments: [...data.state.segments, foreign.segment], fittings: [...data.state.fittings, ...foreign.fittings] } };
}

describe('planRoute existing segments', () => {
  it('reports a foreign segment across an off-graph connection and still plans the route', () => {
    const result = planRoute(withForeign(corridorScene(), foreignLine('fx', 14000, 2500, 16000, 2500)));
    expect(result.status).toBe('ok');
    expect(result.plan.segments.some((s) => onPort(s, 't3'))).toBe(true);
    expect(result.plan.warnings.find((w) => w.code === 'existing-crossings')).toEqual({ code: 'existing-crossings', severity: 'warning', count: 1, points: [pt({ x: 15000, y: 2500 })] });
    expect(result.plan.stats.existingCrossings).toBe(1);
    expect(codes(result)).not.toContain('existing-overlap');
    expect(codes(result)).not.toContain('internal-join');
  });

  it('leaves an off-graph port when both layouts end within 50 mm of a foreign fitting', () => {
    const result = planRoute(withForeign(corridorScene(), foreignLine('fx', 18000, 5030, 19000, 5030)));
    expect(result.status).toBe('ok');
    expect(result.plan.segments.some((s) => onPort(s, 't3'))).toBe(false);
    expect(result.plan.warnings).toContainEqual({ code: 'ports-left', severity: 'warning', count: 1 });
    expect(result.plan.warnings).toContainEqual({ code: 'rooms-skipped', severity: 'info', ids: ['r3'], count: 1 });
    expect(result.plan.stats).toMatchObject({ portsLeft: 1, ports: 3 });
  });

  it('leaves a target port that already holds a segment of another type', () => {
    const data = corridorScene();
    const onT1 = { segment: segment('fx', 'return-air', port('t1', 'out'), { kind: 'fitting', fittingId: 'fx-b' }), fittings: [fitting('fx-b', 700, -300)] };
    const result = planRoute(withForeign(data, onT1));
    expect(result.status).toBe('ok');
    expect(result.plan.segments.some((s) => onPort(s, 't1'))).toBe(false);
    expect(result.plan.warnings).toContainEqual({ code: 'ports-left', severity: 'warning', count: 1 });
    expect(result.plan.warnings).toContainEqual({ code: 'rooms-skipped', severity: 'info', ids: ['r1'], count: 1 });
    expect(result.plan.stats.portsLeft).toBe(1);
  });

  it('leaves a target port that already holds a segment of the run type', () => {
    const data = corridorScene();
    const onT1 = { segment: segment('same', 'supply-air', port('t1', 'out'), { kind: 'fitting', fittingId: 'same-b' }), fittings: [fitting('same-b', 700, -300)] };
    const result = planRoute(withForeign(data, onT1));
    expect(result.status).toBe('ok');
    expect(result.plan.segments.some((s) => onPort(s, 't1'))).toBe(false);
    expect(result.plan.warnings).toContainEqual({ code: 'ports-left', severity: 'warning', count: 1 });
    expect(result.plan.warnings).toContainEqual({ code: 'rooms-skipped', severity: 'info', ids: ['r1'], count: 1 });
    expect(codes(result)).not.toContain('internal-join');
  });

  it('reports an overlap with a foreign segment once and puts a routed overlap into shares-lane', () => {
    const plain = planRoute(withForeign(corridorScene(), foreignLine('fx', 1000, 0, 6000, 0)));
    expect(plain.plan.warnings.find((w) => w.code === 'existing-overlap')).toEqual({ code: 'existing-overlap', severity: 'warning', count: 1, ids: ['fx'] });
    expect(codes(plain)).not.toContain('shares-lane');
    const routed = foreignLine('fx', 1000, 0, 6000, 0);
    routed.segment.routedBy = 'route';
    const lane = planRoute(withForeign(corridorScene(), routed));
    expect(lane.plan.warnings.find((w) => w.code === 'shares-lane')).toEqual({ code: 'shares-lane', severity: 'info', count: 1, ids: ['fx'] });
    expect(codes(lane)).not.toContain('existing-overlap');
  });

  it('keeps old foreign networks unchanged and builds networks of one type', () => {
    const data = withForeign(corridorScene(), foreignLine('fx', 14000, 2500, 16000, 2500));
    const result = planRoute(data);
    expect(codes(result)).not.toContain('internal-join');
    const graph = {
      segments: [...data.state.segments, ...result.plan.segments],
      fittings: [...data.state.fittings, ...result.plan.fittings],
      portGroups: [],
    };
    const networks = computeNetworks(graph);
    const newIds = new Set(result.plan.segments.map((s) => s.id));
    const typeOf = new Map(graph.segments.map((s) => [s.id, s.networkTypeId] as const));
    for (const network of networks) {
      const types = new Set(network.segmentIds.map((id) => typeOf.get(id)));
      expect(types.size).toBe(1);
      if (network.segmentIds.some((id) => newIds.has(id))) expect(network.segmentIds.every((id) => newIds.has(id))).toBe(true);
    }
    expect(networks.find((network) => network.segmentIds.includes('fx'))!.segmentIds).toEqual(['fx']);
  });
});

const AIR_TYPE = { id: 'supply-air', discipline: 'ventilation', flowUnit: 'dm³/s', sizingMethod: 'air' } as const;
const NO_UNIT_TYPE = { id: 'supply-air', discipline: 'ventilation' } as const;

function capacityScene(overrides: Partial<RouteBuildInput> = {}): RouteBuildInput {
  return { ...corridorScene(), networkType: AIR_TYPE, terminalCapacities: { t1: 100, t2: 100, t3: 100, t4: 100, ahu: 300 }, ...overrides };
}

describe('planRoute capacity', () => {
  it('warns when the terminals need more than the start stamp gives', () => {
    const result = planRoute(capacityScene());
    expect(result.plan.stats.ports).toBe(4);
    expect(result.plan.warnings).toContainEqual({ code: 'capacity-over', severity: 'warning', numbers: { total: 400, cap: 300 } });
  });

  it('gives no warning when the start stamp has enough capacity', () => {
    const result = planRoute(capacityScene({ terminalCapacities: { t1: 100, t2: 100, t3: 100, t4: 100, ahu: 500 } }));
    expect(codes(result)).not.toContain('capacity-over');
    expect(codes(result)).not.toContain('capacity-unit');
  });

  it('gives no warning when the start stamp has no capacity', () => {
    const result = planRoute(capacityScene({ terminalCapacities: { t1: 100, t2: 100, t3: 100, t4: 100 } }));
    expect(codes(result)).not.toContain('capacity-over');
    expect(codes(result)).not.toContain('capacity-unit');
  });

  it('gives the note capacity-unit when the type has no flow unit', () => {
    const result = planRoute(capacityScene({ networkType: NO_UNIT_TYPE }));
    expect(result.plan.warnings).toContainEqual({ code: 'capacity-unit', severity: 'info', numbers: { total: 400, cap: 300 } });
    expect(codes(result)).not.toContain('capacity-over');
  });
});

describe('planRoute sizes', () => {
  const limits = SUGGESTED_AIR_SIZING;
  const units = { capacityUnitOf: () => 'dm³/s' as const };

  it('shows no-limits and no sizes without limits', () => {
    const result = planRoute(capacityScene(units));
    expect(result.plan.sizes).toEqual([]);
    expect(result.plan.warnings).toContainEqual({ code: 'no-limits', severity: 'warning' });
  });

  it('keeps the sizes of sizeNetwork for the new segments', () => {
    const data = capacityScene({ ...units, limits });
    const result = planRoute(data);
    expect(codes(result)).not.toContain('no-limits');
    expect(result.plan.sizes.length).toBeGreaterThan(0);
    const expected = sizeNetwork({
      segments: [...data.state.segments, ...result.plan.segments],
      fittings: [...data.state.fittings, ...result.plan.fittings],
      portGroups: [],
      terminalCapacities: data.terminalCapacities!,
      capacityUnitOf: units.capacityUnitOf,
      startStampId: 'ahu',
      startPortId: 'out',
      networkType: AIR_TYPE,
      sizing: limits,
    });
    expect(expected.status).toBe('ok');
    const newIds = new Set(result.plan.segments.map((s) => s.id));
    expect(result.plan.sizes).toEqual(expected.sizes.filter((size) => newIds.has(size.segmentId)));
    expect(result.plan.segments.every((s) => s.diameter === 200)).toBe(true);
  });

  it('keeps the hand-drawn stub segments out of the sizes and counts them', () => {
    const data = capacityScene({ ...units, limits });
    const stubs = [
      segment('h1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'hf1' }),
      segment('h2', 'supply-air', { kind: 'fitting', fittingId: 'hf1' }, { kind: 'fitting', fittingId: 'hf2' }),
    ];
    const state = { ...data.state, segments: stubs, fittings: [fitting('hf1', 50, -30), fitting('hf2', 100, -30)] };
    const result = planRoute({ ...data, state });
    expect(result.status).toBe('ok');
    expect(codes(result)).toContain('extends-stub');
    expect(result.plan.sizes.length).toBeGreaterThan(0);
    expect(result.plan.sizes.some((size) => size.segmentId === 'h1' || size.segmentId === 'h2')).toBe(false);
    expect(result.plan.warnings).toContainEqual({ code: 'hand-kept-size', severity: 'info', count: 2 });
  });

  it('shows no-limits when the type has no sizing method', () => {
    const result = planRoute(capacityScene({ ...units, limits, networkType: NO_UNIT_TYPE }));
    expect(result.plan.sizes).toEqual([]);
    expect(codes(result)).toContain('no-limits');
  });
});

describe('planRoute real crossings', () => {
  function pair(gapMm: number, areaKind: 'path' | 'shaft' = 'path'): RouteBuildInput {
    const stamps = [placed('ahu', 'equipment', 500, 500), placed('t1', 'terminal', 5500, 500)];
    const rooms = [rect('A', 0, 0, 1000, 1000), rect('B', 1000 + gapMm, 0, 6000, 1000)];
    const area: RouteArea = { ...AREA, rooms: [...AREA.rooms, ...(areaKind === 'shaft' ? [{ roomId: 'B', kind: 'shaft' as const, typeId: 'shaft', open: false, name: null }] : [])] };
    return input({ state: { stamps, segments: [], fittings: [], portGroups: [] }, rooms, area, mmPerPt: MM_PER_PT, targetPorts: [targetAt('t1', 5500, 500, 'B')] });
  }

  function corridorPair(gapMm: number): RouteBuildInput {
    const data = pair(gapMm);
    return { ...data, area: { ...data.area, rooms: [...data.area.rooms, { roomId: 'A', kind: 'path', typeId: 'corridor', open: false, name: null }] } };
  }

  it('counts one wall between two rooms', () => {
    const result = planRoute(pair(200));
    expect(result.status).toBe('ok');
    const wall = result.plan.warnings.find((w) => w.code === 'wall-crossings')!;
    expect(wall).toMatchObject({ severity: 'warning', count: 1 });
    expect(wall.points).toHaveLength(1);
    expect(codes(result)).not.toContain('shaft-crossing');
    expect(result.plan.stats.wallCrossings).toBe(1);
    expect(result.plan.stats.wallCrossingsRoom).toBe(1);
    expect(result.plan.stats.wallCrossingsCorridor).toBe(0);
  });

  it('counts a wall next to a route-area room as a corridor crossing', () => {
    const result = planRoute(corridorPair(200));
    expect(result.status).toBe('ok');
    expect(result.plan.stats.wallCrossings).toBe(1);
    expect(result.plan.stats.wallCrossingsCorridor).toBe(1);
    expect(result.plan.stats.wallCrossingsRoom).toBe(0);
  });

  it('reports a shaft crossing and no wall crossing', () => {
    const result = planRoute(pair(200, 'shaft'));
    const shaft = result.plan.warnings.find((w) => w.code === 'shaft-crossing')!;
    expect(shaft).toMatchObject({ severity: 'warning', count: 1, ids: ['B'] });
    expect(codes(result)).not.toContain('wall-crossings');
    expect(result.plan.stats.wallCrossings).toBe(1);
  });

  it('does not count an open run as a crossing', () => {
    const result = planRoute(pair(1500));
    expect(result.status).toBe('ok');
    expect(codes(result)).not.toContain('wall-crossings');
    expect(codes(result)).not.toContain('shaft-crossing');
    expect(result.plan.stats.wallCrossings).toBe(0);
  });
});

describe('planRoute order of the lines', () => {
  it('puts warnings before info and draft-2d last', () => {
    const result = planRoute(capacityScene({ terminalCapacities: { t1: 100, t2: 100, t3: 100, t4: 100, ahu: 300 } }));
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const ranks = result.plan.warnings.map((w) => rank[w.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(codes(result).at(-1)).toBe('draft-2d');
  });

  it('does not change its input', () => {
    const data = capacityScene({ capacityUnitOf: () => 'dm³/s', limits: SUGGESTED_AIR_SIZING });
    const { newSegmentId, newFittingId, capacityUnitOf, ...plain } = data;
    const before = structuredClone(plain);
    planRoute(data);
    expect(plain).toEqual(before);
  });
});

describe('planRoute layout options', () => {
  it('gives the same plan with no options, the default options and an empty object', () => {
    const plain = planRoute(corridorScene());
    expect(planRoute(corridorScene(), DEFAULT_LAYOUT_OPTIONS)).toEqual(plain);
    expect(planRoute(corridorScene(), {})).toEqual(plain);
  });

  it('plans with the link search and gives the same plan with absent options and an empty object', () => {
    const plain = planRoute(corridorScene());
    expect(planRoute(corridorScene(), {})).toEqual(plain);
    const linked = planRoute(corridorScene(), { linkSearch: { bendMm: 500, wallMm: 0 } });
    expect(linked.status).toBe('ok');
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const absent = runScenario(scenario!, makeIdFactories());
    const walled = runScenario(scenario!, makeIdFactories(), { linkSearch: { bendMm: 500, wallMm: 3000 } });
    expect(walled.status).toBe('ok');
    expect(walled.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(walled.plan).not.toEqual(absent.plan);
  });

  it('does not change its input when options are given', () => {
    const value = corridorScene();
    const { newSegmentId, newFittingId, ...data } = value;
    const before = { ...structuredClone(data), newSegmentId, newFittingId };
    planRoute(value, DEFAULT_LAYOUT_OPTIONS);
    expect(value).toEqual(before);
  });

  it('defaults to the penalties and the small jump of the module constants', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.bendPenaltyMm).toBe(BEND_PENALTY_MM);
    expect(DEFAULT_LAYOUT_OPTIONS.crossingPenaltyMm).toBe(CROSSING_PENALTY_MM);
    expect(DEFAULT_LAYOUT_OPTIONS.jogSmallJumpMm).toBe(SMALL_JUMP_MM);
    expect(DEFAULT_LAYOUT_OPTIONS.corners).toBe('both');
    expect('orthogonalOnly' in DEFAULT_LAYOUT_OPTIONS).toBe(false);
  });

  it('gives the same first floor plan with the prototype fields absent and set', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    expect(scenario).not.toBeNull();
    const absent = runScenario(scenario!, makeIdFactories());
    const empty = runScenario(scenario!, makeIdFactories(), {});
    const defaults = runScenario(scenario!, makeIdFactories(), DEFAULT_LAYOUT_OPTIONS);
    const both = runScenario(scenario!, makeIdFactories(), { corners: 'both' });
    const prototype = runScenario(scenario!, makeIdFactories(), {
      trunkBends: { bendMm: 1, fittingMm: 1 },
      ripUp: { rounds: 1 },
    });
    expect(empty.plan).toEqual(absent.plan);
    expect(defaults.plan).toEqual(absent.plan);
    expect(both.plan).toEqual(absent.plan);
    expect(prototype.plan).toEqual(absent.plan);
    expect(absent.plan.stats.segments).toBe(109);
    expect(Math.round(absent.plan.stats.lengthMm)).toBe(151366);
  });

  it('leaves no more off-graph rooms with bridgeParts and no penalty on the first floor', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const absent = runScenario(scenario!, makeIdFactories());
    const bridged = runScenario(scenario!, makeIdFactories(), { bridgeParts: { penaltyMm: 0 } });
    const offGraph = (run: typeof absent) => run.plan.warnings.find((w) => w.code === 'room-off-graph')?.count ?? 0;
    expect(offGraph(bridged)).toBeLessThanOrEqual(offGraph(absent));
  });

  it('gives no free leg with bridgeParts and no penalty on the first floor', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const bridged = runScenario(scenario!, makeIdFactories(), { bridgeParts: { penaltyMm: 0 } });
    expect(bridged.plan.stats.freeLegs).toBe(0);
    expect(bridged.plan.warnings.some((w) => w.code === 'free-angle')).toBe(false);
  });

  it('plans the first floor with the exact spine and keeps the ports left of the absent option', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const absent = runScenario(scenario!, makeIdFactories());
    const exact = runScenario(scenario!, makeIdFactories(), { exactSpine: { maxPorts: 6 } });
    expect(exact.status).toBe('ok');
    expect(exact.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(exact.plan.stats.freeLegs).toBe(0);
    expect(exact.plan.stats.portsLeft).toBe(absent.plan.stats.portsLeft);
  });
});

describe('planRoute option reach', () => {
  it('passes the layout options to the trunk, branch and topology helpers', () => {
    planRoute(corridorScene(), { bendPenaltyMm: 123 });
    expect(vi.mocked(trunk.buildTrunk).mock.calls.at(-1)![0].options).toEqual({ bendPenaltyMm: 123 });
    expect(vi.mocked(branch.planBranches).mock.calls.at(-1)![0].options).toEqual({ bendPenaltyMm: 123 });
    expect(vi.mocked(topology.connectLoosePorts).mock.calls.at(-1)![0].options).toEqual({ bendPenaltyMm: 123 });
  });
});

describe('planRoute room feed', () => {
  it('gives the same first floor plan with the room feed absent, undefined and empty', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const absent = runScenario(scenario!, makeIdFactories());
    expect(runScenario(scenario!, makeIdFactories(), {}).plan).toEqual(absent.plan);
    expect(runScenario(scenario!, makeIdFactories(), { roomBranches: undefined }).plan).toEqual(absent.plan);
    expect(planHash(absent.plan).slice(0, 12)).toBe('03b3135ca4c7');   // hash recorded at the commit before P1-T19a
  });

  for (const kind of ['A', 'B'] as const) {
    it(`feeds the first floor scenario ${kind} and leaves no port unplaced without a count`, () => {
      const scenario = buildScenario(firstFloorDrawing(), kind, 0);
      const run = runScenario(scenario!, makeIdFactories(), { roomBranches: { searchMm: 30000 } });
      expect(run.status).toBe('ok');
      expect(run.plan.stats.portsLeft).toBeLessThanOrEqual(run.plan.stats.ports);
      expect(run.plan.warnings.find((w) => w.code === 'ports-left')?.count ?? 0).toBe(run.plan.stats.portsLeft);
    });
  }

  it('gives the same plan hash for the same input and the same counts for a shuffled port order', () => {
    const options = { roomBranches: { searchMm: 30000 } };
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const first = runScenario(scenario!, makeIdFactories(), options);
    const again = runScenario(scenario!, makeIdFactories(), options);
    expect(planHash(again.plan)).toBe(planHash(first.plan));
    const shuffled = shuffledScenario(firstFloorDrawing(), 'A', 0, 7);
    const other = runScenario(shuffled!, makeIdFactories(), options);
    expect(other.plan.stats.segments).toBe(first.plan.stats.segments);
    expect(other.plan.stats.portsLeft).toBe(first.plan.stats.portsLeft);
  });

  it('plans the first floor with the room feed and the exact spine', () => {
    const scenario = buildScenario(firstFloorDrawing(), 'A', 0);
    const run = runScenario(scenario!, makeIdFactories(), { roomBranches: { searchMm: 30000 }, exactSpine: { maxPorts: 8 } });
    expect(run.status).toBe('ok');
  });
});

describe('planRoute room feed report', () => {
  const local = (() => {
    try {
      return localDrawing('ground-floor-w-rooms-2', 'w_rooms-2');
    } catch {
      return null;
    }
  })();
  for (const kind of ['A', 'B'] as const) {
    it.skipIf(local === null)(`prints the room feed numbers on w_rooms-2 scenario ${kind}, start 0`, () => {
      const scenario = buildScenario(local!, kind, 0);
      expect(scenario).not.toBeNull();
      const cases = [
        { label: 'absent', options: {} },
        { label: 'room feed', options: { roomBranches: { searchMm: 30000 } } },
      ];
      for (const { label, options } of cases) {
        const run = runScenario(scenario!, makeIdFactories(), options);
        const row = measureScenario(scenario!, run, label);
        console.log(`${kind} ${label} ms=${run.ms} portsLeft=${run.plan.stats.portsLeft} lengthMm=${run.plan.stats.lengthMm}`, row.metrics);
        expect(run.status).toBe('ok');
      }
    });
  }
});

describe('planRoute corner mode right', () => {
  const sources: [string, () => Drawing | null][] = [
    ['first floor', () => firstFloorDrawing()],
    [
      'ground floor w_rooms',
      () => {
        try {
          return localDrawing('ground-floor-w-rooms', 'ground floor w_rooms');
        } catch {
          return null;
        }
      },
    ],
  ];
  for (const [name, load] of sources) {
    const drawing = load();
    it.skipIf(drawing === null)(
      `${name}: no 45 degree leg or bend, same result for both and absent, deterministic`,
      () => {
        const scenario = buildScenario(drawing!, 'A', 0);
        expect(scenario).not.toBeNull();
        const s = scenario!;
        const absent = runScenario(s, makeIdFactories());
        const both = runScenario(s, makeIdFactories(), { corners: 'both' });
        const right = runScenario(s, makeIdFactories(), { corners: 'right' });
        const rightAgain = runScenario(s, makeIdFactories(), { corners: 'right' });
        expect(both.plan).toEqual(absent.plan);
        expect(right.status).toBe('ok');
        expect(rightAgain.plan).toEqual(right.plan);

        const bothMetrics = measureScenario(s, both, 'both').metrics;
        const rightMetrics = measureScenario(s, right, 'right').metrics;
        expect(rightMetrics.freeLegs).toBeLessThanOrEqual(bothMetrics.freeLegs);
        expect(rightMetrics.portsLeft).toBeLessThanOrEqual(bothMetrics.portsLeft);
        const freeAngle = right.plan.warnings.some((w) => w.code === 'free-angle');
        if (freeAngle) {
          expect(rightMetrics.bends45).toBeLessThanOrEqual(bothMetrics.bends45);
          expect(rightMetrics.diagonalLegs).toBeLessThanOrEqual(bothMetrics.diagonalLegs);
        } else {
          expect(rightMetrics.bends45).toBe(0);
          expect(rightMetrics.diagonalLegs).toBe(0);
        }
        for (const segment of right.plan.segments) {
          const path = segment.geometry;
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1]!;
            const b = path[i]!;
            const cls = legClass(a, b);
            if (cls !== 'free') expect(isLayoutPath([a, b])).toBe(true);
            // A diagonal leg is allowed only with a free-angle warning, because a free edge keeps its polyline.
            if (!freeAngle) expect(cls).toBe('axis');
          }
        }
        console.log(
          `corners right vs both: bends90 ${rightMetrics.bends90}/${bothMetrics.bends90}, lengthMm ${Math.round(rightMetrics.lengthMm)}/${Math.round(bothMetrics.lengthMm)}, wallCrossings ${rightMetrics.wallCrossings}/${bothMetrics.wallCrossings}`,
        );
      },
      60000,
    );
  }
});
