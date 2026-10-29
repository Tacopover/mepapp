import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { planRoute, type RouteBuildInput, type RouteTrace } from './route-build.js';
import type { ConnectionPoint, Fitting, Segment } from './network.js';
import type { RouteLayoutOptions } from './route-layout.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';
import { manualRoom, roomContainsPoint, roomLabelPoint, type Room } from './rooms/room.js';
import { computeRouteArea, DEFAULT_ROUTE_AREA_TYPE_IDS } from './route-area.js';
import { findRoutePorts, type RoutePort, type RouteStamp } from './route-ports.js';
import { buildScenario, firstFloorDrawing, makeIdFactories, manualScenario, planHash, runScenario, type Scenario, shuffledScenario, type ScenarioKind } from './route-scenario.testutil.js';
import { terminalRoomIdsOf } from './route-two-level.js';
import { getStampWorldPorts } from './stamp.js';

const KINDS: readonly ScenarioKind[] = ['A', 'B'];

function scenarioOf(kind: ScenarioKind) {
  const s = buildScenario(firstFloorDrawing(), kind, 0);
  if (s === null) throw new Error(`no path room for kind ${kind}`);
  return s;
}

describe.each(KINDS)('two-level plan, kind %s', (kind) => {
  it('plans ok with no internal-join or free-angle warning and counts every target port', () => {
    const s = scenarioOf(kind);
    const trace: RouteTrace = { paths: [] };
    const run = runScenario(s, makeIdFactories(), { twoLevel: {} }, trace);
    expect(run.status).toBe('ok');
    const codes = run.plan.warnings.map((warning) => warning.code);
    expect(codes).not.toContain('internal-join');
    expect(codes).not.toContain('free-angle');
    expect(run.plan.stats.ports + run.plan.stats.portsLeft).toBe(s.targetPorts.length);
    const leftWarning = run.plan.warnings.find((warning) => warning.code === 'ports-left');
    expect(run.plan.stats.portsLeft).toBe(leftWarning?.count ?? 0);
    for (const leg of trace.paths) expect(['trunk', 'branch', 'spine', 'link']).toContain(leg.origin);
    expect(trace.paths.some((leg) => leg.origin === 'trunk')).toBe(true);
  });

  it('gives the same plan for the same input twice and the same counts for shuffled input', () => {
    const s = scenarioOf(kind);
    const first = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const again = runScenario(s, makeIdFactories(), { twoLevel: {} });
    expect(planHash(again.plan)).toBe(planHash(first.plan));
    for (const seed of [1, 2]) {
      const shuffled = shuffledScenario(firstFloorDrawing(), kind, 0, seed);
      if (shuffled === null) throw new Error(`no path room after shuffle, seed ${seed}`);
      const actual = runScenario(shuffled, makeIdFactories(), { twoLevel: {} });
      expect(actual.plan.stats.segments, `seed ${seed} segments`).toBe(first.plan.stats.segments);
      expect(actual.plan.stats.fittings, `seed ${seed} fittings`).toBe(first.plan.stats.fittings);
      expect(actual.plan.stats.bends90, `seed ${seed} bends90`).toBe(first.plan.stats.bends90);
      expect(actual.plan.stats.portsLeft, `seed ${seed} portsLeft`).toBe(first.plan.stats.portsLeft);
      expect(actual.plan.stats.rooms, `seed ${seed} rooms`).toBe(first.plan.stats.rooms);
      expect(Math.abs(actual.plan.stats.lengthMm - first.plan.stats.lengthMm) / first.plan.stats.lengthMm, `seed ${seed} lengthMm`).toBeLessThanOrEqual(0.001);
    }
  });

  it('ignores the old layout options when twoLevel is set', () => {
    const s = scenarioOf(kind);
    const oldOptions: RouteLayoutOptions = {
      twoLevel: {},
      exactSpine: { maxPorts: 6 },
      linkSearch: { bendMm: 500, wallMm: 3000 },
      entryRule: 'shortest-branch',
      jogSmallJumpMm: 0,
      bridgeParts: { penaltyMm: 1000 },
      trunkBends: { bendMm: 500, fittingMm: 200 },
    };
    const plain = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const withOld = runScenario(s, makeIdFactories(), oldOptions);
    expect(planHash(withOld.plan)).toBe(planHash(plain.plan));
  });

  it('gives no room-chained warning with maxChainDepth 0 and stays ok', () => {
    const s = scenarioOf(kind);
    const run = runScenario(s, makeIdFactories(), { twoLevel: { maxChainDepth: 0 } });
    expect(run.status).toBe('ok');
    expect(run.plan.warnings.map((warning) => warning.code)).not.toContain('room-chained');
  });
});

describe('two-level plan options', () => {
  it('gives the twoLevel plan when roomBranches is also set', () => {
    const s = scenarioOf('A');
    const plain = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const both = runScenario(s, makeIdFactories(), { twoLevel: {}, roomBranches: { searchMm: 30000 } });
    expect(planHash(both.plan)).toBe(planHash(plain.plan));
  });
});

describe('terminalRoomIdsOf', () => {
  it('returns the room of a routing target port for any route type', () => {
    const room = firstFloorDrawing().rooms[0]!;
    const at = roomLabelPoint(room);
    const stamp: RouteStamp = {
      id: 'term-1',
      category: 'terminal',
      transform: { position: { x: at.x, y: at.y }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 20,
      nativeHeight: 20,
      ports: [{ id: 'in', name: 'in', fractionX: 0.5, fractionY: 0.5 }],
      routingTargets: { in: 'return-air' },
    };
    expect([...terminalRoomIdsOf([stamp], [room], room.pageIndex)]).toEqual([room.id]);
  });
});

const CLEARANCE_MM = 150;

interface Request {
  startStampId: string;
  startPortId: string;
  networkTypeId: string;
  targetPorts: RoutePort[];
  stamps: RouteStamp[];
  segments: Segment[];
  fittings: Fitting[];
}

function supplyRequest(s: Scenario): Request {
  return { startStampId: s.startStampId, startPortId: s.startPortId, networkTypeId: s.networkTypeId, targetPorts: s.targetPorts, stamps: s.stamps, segments: [], fittings: [] };
}

function prefixedIds(prefix: string): { newSegmentId: () => string; newFittingId: () => string } {
  let counter = 0;
  return {
    newSegmentId: () => `${prefix}-s${counter++}`,
    newFittingId: () => `${prefix}-f${counter++}`,
  };
}

function planRequest(s: Scenario, req: Request, options: RouteLayoutOptions, trace?: RouteTrace, prefix = 'n') {
  const ids = prefixedIds(prefix);
  const input: RouteBuildInput = {
    startStampId: req.startStampId,
    startPortId: req.startPortId,
    networkTypeId: req.networkTypeId,
    targetPorts: req.targetPorts,
    state: { stamps: req.stamps, segments: req.segments, fittings: req.fittings, portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt: s.drawing.mmPerPt,
    pageIndex: s.pageIndex,
    newSegmentId: ids.newSegmentId,
    newFittingId: ids.newFittingId,
  };
  return planRoute(input, options, trace);
}

function stampAt(id: string, category: RouteStamp['category'], portId: string, at: Vec2, routingTargets?: Record<string, string>): RouteStamp {
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

function portMmOf(stamps: readonly RouteStamp[], stampId: string, portId: string, mmPerPt: number): Vec2 {
  const stamp = stamps.find((candidate) => candidate.id === stampId);
  const world = stamp ? getStampWorldPorts(stamp).find((port) => port.id === portId)?.world : undefined;
  if (!world) throw new Error(`no port ${stampId} ${portId}`);
  return { x: world.x * mmPerPt, y: world.y * mmPerPt };
}

function distanceMm(p: Vec2, q: Vec2): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function pointToPieceMm(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function piecesMm(segments: readonly Segment[], mmPerPt: number): [Vec2, Vec2][] {
  const pieces: [Vec2, Vec2][] = [];
  for (const segment of segments) {
    for (let i = 1; i < segment.geometry.length; i++) {
      const a = segment.geometry[i - 1]!;
      const b = segment.geometry[i]!;
      pieces.push([{ x: a.x * mmPerPt, y: a.y * mmPerPt }, { x: b.x * mmPerPt, y: b.y * mmPerPt }]);
    }
  }
  return pieces;
}

function acrossLinkOffsetsMm(at: Vec2, pieces: readonly [Vec2, Vec2][], gapMm: number): Vec2[] {
  const piece = pieces.find(([a, b]) => distanceMm(a, at) <= 1 || distanceMm(b, at) <= 1);
  if (!piece) return [];
  const [a, b] = piece;
  const len = distanceMm(a, b);
  if (len === 0) return [];
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  return [
    { x: nx * gapMm, y: ny * gapMm },
    { x: -nx * gapMm, y: -ny * gapMm },
  ];
}

function samplesOf(path: readonly Vec2[], stepMm: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < path.length; i++) {
    out.push(path[i]!);
    if (i + 1 === path.length) break;
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = distanceMm(a, b);
    const n = Math.floor(len / stepMm);
    for (let k = 1; k <= n; k++) {
      const t = (k * stepMm) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function worstClearanceMm(paths: readonly (readonly Vec2[])[], pieces: readonly [Vec2, Vec2][]): number {
  let worst = Infinity;
  for (const path of paths) {
    for (const p of samplesOf(path, 200)) {
      for (const [a, b] of pieces) worst = Math.min(worst, pointToPieceMm(p, a, b));
    }
  }
  return worst;
}

function intervalOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function collinearOverlapMm(a: [Vec2, Vec2], b: [Vec2, Vec2]): number {
  const [a1, a2] = a;
  const [b1, b2] = b;
  const horizontal = (p: Vec2, q: Vec2): boolean => Math.abs(p.y - q.y) < 1e-6;
  const vertical = (p: Vec2, q: Vec2): boolean => Math.abs(p.x - q.x) < 1e-6;
  if (horizontal(a1, a2) && horizontal(b1, b2) && Math.abs(a1.y - b1.y) < 1) return intervalOverlap(a1.x, a2.x, b1.x, b2.x);
  if (vertical(a1, a2) && vertical(b1, b2) && Math.abs(a1.x - b1.x) < 1) return intervalOverlap(a1.y, a2.y, b1.y, b2.y);
  return 0;
}

function longestAxisTrunkPiece(trace: RouteTrace): [Vec2, Vec2] {
  let best: [Vec2, Vec2] | null = null;
  let bestLen = 0;
  for (const leg of trace.paths) {
    if (leg.origin !== 'trunk') continue;
    for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1]!;
      const b = leg.path[i]!;
      const axis = Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
      const len = distanceMm(a, b);
      if (axis && len > bestLen) {
        best = [a, b];
        bestLen = len;
      }
    }
  }
  if (best === null) throw new Error('no axis-aligned trunk piece in the trace');
  return best;
}

function refusedMessage(warnings: readonly RoutePlanWarning[]): string {
  return warnings.map((warning) => `${warning.severity}:${warning.code}`).join(', ');
}

describe('two-level plan stats and warnings', () => {
  it('reports the holes per room and the corridor gap crossings with twoLevel only', () => {
    const s = scenarioOf('A');
    const run = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const holes = run.plan.stats.holesPerRoom;
    expect(holes).toBeDefined();
    const servedIds = new Set(s.servedRooms.map((room) => room.id));
    for (const [roomId, count] of Object.entries(holes ?? {})) {
      expect(servedIds.has(roomId), roomId).toBe(true);
      expect(count, roomId).toBeGreaterThanOrEqual(1);
    }
    const gaps = run.plan.stats.corridorGapCrossings;
    expect(gaps).toBeGreaterThanOrEqual(0);
    const gapWarning = run.plan.warnings.find((warning) => warning.code === 'corridor-gap-crossed');
    if ((gaps ?? 0) > 0) expect(gapWarning?.count).toBe(gaps);
    else expect(gapWarning).toBeUndefined();
    const plain = runScenario(s, makeIdFactories());
    expect('holesPerRoom' in plain.plan.stats).toBe(false);
    expect('corridorGapCrossings' in plain.plan.stats).toBe(false);
  }, 120000);
});

describe('two-level plan with a segment of another network', () => {
  it('keeps the new run off the foreign segment', () => {
    const s = scenarioOf('A');
    const mmPerPt = s.drawing.mmPerPt;
    const baseTrace: RouteTrace = { paths: [] };
    planRequest(s, supplyRequest(s), { twoLevel: {} }, baseTrace);
    const [a, b] = longestAxisTrunkPiece(baseTrace);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const p1 = { x: a.x + dx * 0.25, y: a.y + dy * 0.25 };
    const p2 = { x: a.x + dx * 0.75, y: a.y + dy * 0.75 };
    const normal = Math.abs(dy) < 1e-6 ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const toSidePt = (p: Vec2): Vec2 => ({ x: (p.x + normal.x * 100) / mmPerPt, y: (p.y + normal.y * 100) / mmPerPt });
    const fa = toSidePt(p1);
    const fb = toSidePt(p2);
    const f1: Fitting = { id: 'foreign-f1', pageIndex: s.pageIndex, position: fa, kind: 'junction' };
    const f2: Fitting = { id: 'foreign-f2', pageIndex: s.pageIndex, position: fb, kind: 'junction' };
    const foreign: Segment = {
      id: 'foreign-s1',
      pageIndex: s.pageIndex,
      networkTypeId: 'foreign-type',
      shape: 'round',
      diameter: 200,
      endpointA: { kind: 'fitting', fittingId: f1.id },
      endpointB: { kind: 'fitting', fittingId: f2.id },
      geometry: [fa, fb],
    };
    const trace: RouteTrace = { paths: [] };
    const run = planRequest(s, { ...supplyRequest(s), segments: [foreign], fittings: [f1, f2] }, { twoLevel: {} }, trace);
    if (run.status === 'refused') {
      expect(run.plan.warnings.some((warning) => warning.severity === 'error'), refusedMessage(run.plan.warnings)).toBe(true);
      return;
    }
    expect(run.plan.warnings.map((warning) => warning.code)).not.toContain('internal-join');
    const foreignFittingIds = new Set([f1.id, f2.id]);
    for (const seg of run.plan.segments) {
      expect(seg.networkTypeId).toBe(s.networkTypeId);
      for (const end of [seg.endpointA, seg.endpointB]) {
        if (end.kind === 'fitting') expect(foreignFittingIds.has(end.fittingId)).toBe(false);
      }
    }
    const startMm = portMmOf(s.stamps, s.startStampId, s.startPortId, mmPerPt);
    const paths = trace.paths.filter((leg) => leg.origin === 'trunk' && distanceMm(leg.path[0]!, startMm) > 1).map((leg) => leg.path);
    expect(worstClearanceMm(paths, piecesMm([foreign], mmPerPt)), 'trunk clearance mm').toBeGreaterThanOrEqual(CLEARANCE_MM);
  }, 120000);
});

describe('two-level plan of a return network after the supply', () => {
  it('plans the return without overlap, with clearance and one segment per port', () => {
    const s = scenarioOf('A');
    const mmPerPt = s.drawing.mmPerPt;
    const supply = planRequest(s, supplyRequest(s), { twoLevel: {} });
    expect(supply.status).toBe('ok');
    const supplyPieces = piecesMm(supply.plan.segments, mmPerPt);

    // the return start must not lie on the supply stub, and a return terminal is offset across the supply link, else the first leg of any run lies on the supply pipe
    const startAt = roomLabelPoint(s.startRoom);
    const retStart: Vec2 = { x: startAt.x, y: startAt.y + 1000 / mmPerPt };
    const retStamps: RouteStamp[] = [stampAt('ret-ahu', 'equipment', 'out', retStart)];
    const retTerminalIds = new Set<string>();
    const alongOffsets = [
      { x: 0, y: 500 / mmPerPt },
      { x: 0, y: -500 / mmPerPt },
    ];
    const gapMm = Math.max(500, CLEARANCE_MM + 100);
    for (const room of s.servedRooms) {
      const supplyTerminal = s.stamps.find((stamp) => stamp.id === `term-${room.id}`);
      if (!supplyTerminal) continue;
      const base = supplyTerminal.transform.position;
      const terminalMm = portMmOf(s.stamps, supplyTerminal.id, 'in', mmPerPt);
      const acrossOffsets = acrossLinkOffsetsMm(terminalMm, supplyPieces, gapMm).map((o) => ({ x: o.x / mmPerPt, y: o.y / mmPerPt }));
      const offsets = acrossOffsets.length > 0 ? acrossOffsets : alongOffsets;
      const at = offsets.map((o) => ({ x: base.x + o.x, y: base.y + o.y })).find((p) => roomContainsPoint(room, p));
      if (!at) continue;
      const id = `ret-${room.id}`;
      retStamps.push(stampAt(id, 'terminal', 'in', at, { in: 'return-air' }));
      retTerminalIds.add(id);
    }
    const retPorts = findRoutePorts({
      stamps: retStamps,
      networkTypeId: 'return-air',
      scope: { kind: 'stamps', stampIds: retTerminalIds },
      startStampId: 'ret-ahu',
      startPortId: 'out',
      rooms: s.drawing.rooms,
      pageIndex: s.pageIndex,
      portChoice: 'order',
    }).ports;
    expect(retPorts.length).toBeGreaterThan(0);

    const trace: RouteTrace = { paths: [] };
    const ret = planRequest(
      s,
      { startStampId: 'ret-ahu', startPortId: 'out', networkTypeId: 'return-air', targetPorts: retPorts, stamps: [...s.stamps, ...retStamps], segments: supply.plan.segments, fittings: supply.plan.fittings },
      { twoLevel: {} },
      trace,
      'r',
    );
    if (ret.status === 'refused') expect.fail(`return plan refused: ${refusedMessage(ret.plan.warnings)}`);

    const returnPieces = piecesMm(ret.plan.segments, mmPerPt);
    let worstOverlap = 0;
    for (const piece of returnPieces) {
      for (const other of supplyPieces) worstOverlap = Math.max(worstOverlap, collinearOverlapMm(piece, other));
    }
    expect(worstOverlap, 'collinear overlap mm').toBeLessThanOrEqual(1);

    const startMm = portMmOf(retStamps, 'ret-ahu', 'out', mmPerPt);
    const paths = trace.paths.filter((leg) => leg.origin === 'trunk' && distanceMm(leg.path[0]!, startMm) > 1).map((leg) => leg.path);
    expect(paths.length, 'return trunk legs').toBeGreaterThan(0);
    expect(worstClearanceMm(paths, supplyPieces), 'return trunk clearance mm').toBeGreaterThanOrEqual(CLEARANCE_MM);

    const portCounts = new Map<string, number>();
    for (const seg of ret.plan.segments) {
      for (const end of [seg.endpointA, seg.endpointB] as ConnectionPoint[]) {
        if (end.kind !== 'port') continue;
        const key = `${end.elementId}:${end.portId}`;
        portCounts.set(key, (portCounts.get(key) ?? 0) + 1);
      }
    }
    expect(Math.max(0, ...portCounts.values()), 'segment ends per port').toBeLessThanOrEqual(1);
  }, 120000);
});

describe('two-level plan with a terminal in a room', () => {
  it('never bridges a room that holds a terminal of another routing target', () => {
    const m = manualScenario();
    if (m === null) return;
    const s = m.scenario;
    const options: RouteLayoutOptions = { twoLevel: { crossRooms: { maxRooms: 2 } } };
    const first = runScenario(s, makeIdFactories(), options);
    const crossedIds = (warnings: readonly RoutePlanWarning[]): string[] => warnings.find((warning) => warning.code === 'main-crosses-room')?.ids ?? [];
    const ids = crossedIds(first.plan.warnings);
    if (ids.length === 0) {
      console.log('D3 test: no bridge on the fixture');
      return;
    }
    const roomId = ids[0]!;
    const room = s.drawing.rooms.find((candidate) => candidate.id === roomId);
    if (!room) throw new Error(`crossed room ${roomId} is not in the drawing`);
    const terminal = stampAt('d3-return-terminal', 'terminal', 'in', roomLabelPoint(room), { in: 'return-air' });
    const again = runScenario({ ...s, stamps: [...s.stamps, terminal] }, makeIdFactories(), options);
    expect(crossedIds(again.plan.warnings)).not.toContain(roomId);
  }, 120000);
});

const D3_MM_PER_PT = 10;
const D3_OPTIONS: RouteLayoutOptions = { twoLevel: { crossRooms: { maxRooms: 1 }, neverCrossTypeIds: [] } };

function d3Room(id: string, x0: number, y0: number, x1: number, y1: number, roomTypeId?: string): Room {
  const outer = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return { id, ...manualRoom(0, outer), ...(roomTypeId ? { roomTypeId } : {}) };
}

function d3Rooms(): Room[] {
  return [d3Room('corr', 0, 1000, 2000, 1200, 'corridor'), d3Room('mid', 800, 600, 1200, 1000), d3Room('far', 800, 200, 1200, 600)];
}

function d3Scenario(stamps: RouteStamp[], rooms: Room[]): Scenario {
  const pageIndex = 0;
  const area = computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt: D3_MM_PER_PT, pageIndex });
  const areaIds = new Set(area.rooms.map((room) => room.roomId));
  const targetPorts = findRoutePorts({
    stamps,
    networkTypeId: 'supply-air',
    scope: { kind: 'stamps', stampIds: new Set(stamps.filter((stamp) => stamp.id !== 'd3-ahu').map((stamp) => stamp.id)) },
    startStampId: 'd3-ahu',
    startPortId: 'out',
    rooms,
    pageIndex,
    portChoice: 'order',
  }).ports;
  return {
    drawing: { name: 'd3', mmPerPt: D3_MM_PER_PT, rooms },
    kind: 'A',
    pageIndex,
    area,
    startRoom: rooms.find((room) => room.id === 'corr')!,
    servedRooms: rooms.filter((room) => !areaIds.has(room.id)),
    stamps,
    targetPorts,
    startStampId: 'd3-ahu',
    startPortId: 'out',
    networkTypeId: 'supply-air',
  };
}

describe('two-level plan that bridges a room between the corridor and a served room', () => {
  const supplyStamps = (): RouteStamp[] => [
    stampAt('d3-ahu', 'equipment', 'out', { x: 100, y: 1100 }),
    stampAt('d3-term-far', 'terminal', 'in', { x: 1000, y: 400 }, { in: 'supply-air' }),
  ];

  it('feeds the far room through the middle room only when the middle room holds no terminal', () => {
    const rooms = d3Rooms();
    const s = d3Scenario(supplyStamps(), rooms);
    const first = planRequest(s, supplyRequest(s), D3_OPTIONS);
    expect(first.status, refusedMessage(first.plan.warnings)).toBe('ok');
    expect(first.plan.stats.holesPerRoom?.far).toBe(1);
    expect(first.plan.stats.portsLeft).toBe(0);

    const midTerminal = stampAt('d3-ret-mid', 'terminal', 'in', { x: 1000, y: 800 }, { in: 'return-air' });
    expect([...terminalRoomIdsOf([midTerminal], rooms, 0)]).toEqual(['mid']);
    const again = d3Scenario([...supplyStamps(), midTerminal], rooms);
    const second = planRequest(again, supplyRequest(again), D3_OPTIONS);
    expect(second.status, refusedMessage(second.plan.warnings)).toBe('ok');
    // D3 rule: a room with a terminal of any routing target is not passable, so the far room is not fed through the middle room.
    expect(second.plan.stats.holesPerRoom ?? {}).not.toHaveProperty('far');
    const offGraph = second.plan.warnings.find((warning) => warning.code === 'room-off-graph');
    expect(offGraph?.ids).toContain('far');
  }, 120000);
});
