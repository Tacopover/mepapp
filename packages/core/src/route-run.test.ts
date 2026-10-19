import { describe, expect, it } from 'vitest';
import type { Fitting, Segment } from './network.js';
import { polygonAreaPt2, polygonContainsPoint, roomLabelPoint, type Room } from './rooms/room.js';
import { loadFirstFloorRooms } from './rooms/route-area-fixture.testutil.js';
import { DEFAULT_ROUTE_AREA_TYPE_IDS, computeRouteArea, type RouteArea } from './route-area.js';
import { planRoute, reducedState, type PlannedRoute, type RouteBuildInput } from './route-build.js';
import { legClass } from './route-layout.js';
import { routedRunOf } from './route-marks.js';
import { findRoutePorts, type RoutePort, type RouteStamp } from './route-ports.js';
import { getStampWorldPorts } from './stamp.js';

const { mmPerPt, rooms } = loadFirstFloorRooms();
const PAGE = rooms[0]!.pageIndex;
const TYPE = 'supply-air';
const START_ID = 'start-ahu';
// Measured share of free legs by length is printed by the test. The floor is the plan limit of 5 %.
const MAX_FREE_LENGTH_SHARE = 0.05;

function roomById(id: string): Room {
  const room = rooms.find((r) => r.id === id);
  if (!room) throw new Error(`room ${id} is not in the fixture`);
  return room;
}

const area: RouteArea = computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex: PAGE });
const areaRoomIds = new Set(area.rooms.map((r) => r.roomId));
const startRoom = area.rooms
  .filter((r) => r.kind === 'path')
  .map((r) => roomById(r.roomId))
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

function buildStamps(): RouteStamp[] {
  const stamps: RouteStamp[] = [pointStamp(START_ID, 'equipment', 'out', roomLabelPoint(startRoom))];
  for (const room of servedRooms) stamps.push(pointStamp(`term-${room.id}`, 'terminal', 'in', roomLabelPoint(room), { in: TYPE }));
  return stamps;
}

const baseStamps = buildStamps();
const terminalIds = new Set(baseStamps.filter((s) => s.id !== START_ID).map((s) => s.id));
const roomOfStamp = new Map(servedRooms.map((r) => [`term-${r.id}`, r.id] as const));

function withSegmentTypes(stamps: readonly RouteStamp[], segments: readonly Segment[]): RouteStamp[] {
  return stamps.map((stamp) => {
    const types: Record<string, string> = {};
    for (const s of segments) {
      for (const end of [s.endpointA, s.endpointB]) if (end.kind === 'port' && end.elementId === stamp.id) types[end.portId] = s.networkTypeId;
    }
    return Object.keys(types).length > 0 ? { ...stamp, portSegmentTypes: types } : stamp;
  });
}

function targetPortsOf(stamps: readonly RouteStamp[]): RoutePort[] {
  return findRoutePorts({
    stamps,
    networkTypeId: TYPE,
    scope: { kind: 'stamps', stampIds: terminalIds },
    startStampId: START_ID,
    startPortId: 'out',
    rooms,
    pageIndex: PAGE,
    portChoice: 'order',
  }).ports;
}

interface State { stamps: RouteStamp[]; segments: Segment[]; fittings: Fitting[]; portGroups: never[] }

let idCounter = 0;
function runPlan(state: State, removal: { segmentIds: string[]; fittingIds: string[] }, targetPorts: RoutePort[]): { status: 'ok' | 'refused'; plan: PlannedRoute; ms: number } {
  const input: RouteBuildInput = {
    startStampId: START_ID,
    startPortId: 'out',
    networkTypeId: TYPE,
    targetPorts,
    state,
    removal,
    rooms,
    area,
    mmPerPt,
    pageIndex: PAGE,
    newSegmentId: () => `n-s${idCounter++}`,
    newFittingId: () => `n-f${idCounter++}`,
  };
  const start = performance.now();
  const result = planRoute(input);
  return { ...result, ms: performance.now() - start };
}

function apply(state: State, plan: PlannedRoute): State {
  const removedS = new Set(plan.removeSegmentIds);
  const removedF = new Set(plan.removeFittingIds);
  return {
    stamps: state.stamps,
    segments: [...state.segments.filter((s) => !removedS.has(s.id)), ...plan.segments],
    fittings: [...state.fittings.filter((f) => !removedF.has(f.id)), ...plan.fittings],
    portGroups: [],
  };
}

function walk(segments: readonly Segment[], startKey: string): { reached: Set<string>; components: number } {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  const keyOf = (p: Segment['endpointA']): string => (p.kind === 'fitting' ? `f:${p.fittingId}` : `p:${p.elementId}:${p.portId}`);
  for (const s of segments) parent.set(find(keyOf(s.endpointA)), find(keyOf(s.endpointB)));
  const roots = new Set([...parent.keys()].map(find));
  const startRoot = find(startKey);
  return { reached: new Set([...parent.keys()].filter((k) => find(k) === startRoot)), components: roots.size };
}

function codeCounts(plan: PlannedRoute): string {
  return plan.warnings.map((w) => `${w.code}=${w.count ?? 1}`).join(' ');
}

function baseState(extraSegments: Segment[] = [], extraFittings: Fitting[] = []): State {
  return { stamps: baseStamps, segments: extraSegments, fittings: extraFittings, portGroups: [] };
}

function stubOf(): { stub: Segment; g: Fitting } {
  const start = getStampWorldPorts(baseStamps[0]!)[0]!.world;
  const g: Fitting = { id: 'stub-g', pageIndex: PAGE, position: { x: start.x + 1000 / mmPerPt, y: start.y }, kind: 'junction' };
  const stub: Segment = {
    id: 'stub-s',
    pageIndex: PAGE,
    networkTypeId: TYPE,
    shape: 'round',
    diameter: 200,
    endpointA: { kind: 'port', elementId: START_ID, portId: 'out' },
    endpointB: { kind: 'fitting', fittingId: g.id },
    geometry: [start, g.position],
  };
  return { stub, g };
}

function counts(plan: PlannedRoute): { segments: number; fittings: number; ports: number } {
  return { segments: plan.stats.segments, fittings: plan.stats.fittings, ports: plan.stats.ports };
}

let first: { status: 'ok' | 'refused'; plan: PlannedRoute; ms: number } | undefined;
function firstRun(): { status: 'ok' | 'refused'; plan: PlannedRoute; ms: number } {
  first ??= runPlan(baseState(), { segmentIds: [], fittingIds: [] }, targetPortsOf(baseStamps));
  return first;
}

describe('planRoute on the first floor', () => {
  it('puts every stamp port on its label point', () => {
    const start = getStampWorldPorts(baseStamps[0]!)[0]!.world;
    const startLabel = roomLabelPoint(startRoom);
    expect(Math.abs(start.x - startLabel.x)).toBeLessThan(1e-6);
    expect(Math.abs(start.y - startLabel.y)).toBeLessThan(1e-6);
    for (const room of servedRooms) {
      const stamp = baseStamps.find((s) => s.id === `term-${room.id}`)!;
      const world = getStampWorldPorts(stamp)[0]!.world;
      const label = roomLabelPoint(room);
      expect(Math.abs(world.x - label.x), `room ${room.id}`).toBeLessThan(1e-6);
      expect(Math.abs(world.y - label.y), `room ${room.id}`).toBeLessThan(1e-6);
    }
    console.log(`start room ${startRoom.id} (${startRoom.name ?? 'no name'}), served rooms ${servedRooms.length}`);
  });

  it('plans a route: layout legs, one network, all connected ports reached, no internal join', () => {
    const targets = targetPortsOf(baseStamps);
    expect(targets).toHaveLength(servedRooms.length);
    const { status, plan, ms } = firstRun();
    const s = plan.stats;
    console.log(`status ${status}`);
    console.log(
      `stats segments ${s.segments} fittings ${s.fittings} lengthMm ${s.lengthMm.toFixed(0)} bends90 ${s.bends90} bends45 ${s.bends45} freeLegs ${s.freeLegs} rooms ${s.rooms} ports ${s.ports} portsLeft ${s.portsLeft} wallCrossings ${s.wallCrossings} existingCrossings ${s.existingCrossings}`,
    );
    console.log(`warnings ${codeCounts(plan)}`);
    const offGraph = plan.warnings.find((w) => w.code === 'room-off-graph');
    const offGraphCount = offGraph?.ids?.length ?? 0;
    console.log(`served rooms ${servedRooms.length}, off-graph rooms ${offGraphCount}, off-graph share ${((100 * offGraphCount) / servedRooms.length).toFixed(1)} %`);
    console.log(`planRoute time ${ms.toFixed(0)} ms`);
    expect(status).toBe('ok');
    expect(plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(ms).toBeLessThan(500);

    let freeLen = 0;
    let totalLen = 0;
    let freeLegCount = 0;
    for (const seg of plan.segments) {
      for (let i = 1; i < seg.geometry.length; i++) {
        const a = { x: seg.geometry[i - 1]!.x * mmPerPt, y: seg.geometry[i - 1]!.y * mmPerPt };
        const b = { x: seg.geometry[i]!.x * mmPerPt, y: seg.geometry[i]!.y * mmPerPt };
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        totalLen += len;
        if (legClass(a, b) === 'free') {
          freeLen += len;
          freeLegCount++;
        }
      }
    }
    const share = totalLen > 0 ? freeLen / totalLen : 0;
    console.log(`free legs ${freeLegCount} (stats.freeLegs ${s.freeLegs}), free length ${freeLen.toFixed(0)} of ${totalLen.toFixed(0)} mm, share ${(100 * share).toFixed(2)} %`);
    expect(share).toBeLessThanOrEqual(MAX_FREE_LENGTH_SHARE);

    const { reached, components } = walk(plan.segments, `p:${START_ID}:out`);
    const reachedTerminals = [...terminalIds].filter((id) => reached.has(`p:${id}:in`));
    const missing = [...terminalIds].filter((id) => !reached.has(`p:${id}:in`)).map((id) => roomOfStamp.get(id)!);
    console.log(`walk reached ${reachedTerminals.length} target ports, components ${components}, not reached rooms ${missing.join(' ')}`);
    const portDegree = new Map<string, number>();
    for (const seg of plan.segments) {
      for (const end of [seg.endpointA, seg.endpointB]) if (end.kind === 'port') portDegree.set(`${end.elementId}:${end.portId}`, (portDegree.get(`${end.elementId}:${end.portId}`) ?? 0) + 1);
    }
    const multi = [...portDegree].filter(([, n]) => n > 1);
    console.log(`ports with more than one segment ${multi.length}: ${multi.map(([k, n]) => `${k}=${n}`).join(' ')}`);
    expect(components).toBe(1);
    expect(reachedTerminals).toHaveLength(s.ports);
    expect(s.ports + s.portsLeft).toBe(servedRooms.length);
  }, 60000);

  it('prints the wall crossings against the served rooms with an entry', () => {
    const { plan } = firstRun();
    const withEntry = new Set(area.entries.filter((e) => e.primary).map((e) => e.roomId));
    const servedWithEntry = servedRooms.filter((r) => withEntry.has(r.id)).length;
    const ratio = servedWithEntry > 0 ? plan.stats.wallCrossings / servedWithEntry : NaN;
    console.log(`wallCrossings ${plan.stats.wallCrossings}, served rooms with an entry ${servedWithEntry}, ratio ${ratio.toFixed(2)}`);
    expect(Number.isFinite(plan.stats.wallCrossings)).toBe(true);
  }, 60000);

  it('re-runs: the removal set equals the first plan and the counts are the same', () => {
    const { plan } = firstRun();
    const state1 = apply(baseState(), plan);
    const removal = routedRunOf(state1, START_ID, 'out');
    const atStart = state1.segments.filter((x) => [x.endpointA, x.endpointB].some((e) => e.kind === 'port' && e.elementId === START_ID));
    console.log(`segments at the start port ${atStart.length}, removal ${removal.segmentIds.length}`);
    const reduced = reducedState(state1, removal);
    const stamps2 = withSegmentTypes(baseStamps, reduced.segments);
    const second = runPlan({ ...state1, stamps: stamps2 }, removal, targetPortsOf(stamps2));
    console.log(`re-run status ${second.status}, counts ${JSON.stringify(counts(second.plan))} against ${JSON.stringify(counts(plan))}, ms ${second.ms.toFixed(0)}`);
    expect(second.status).toBe('ok');
    expect(counts(second.plan)).toEqual(counts(plan));
    expect(removal.segmentIds).toEqual(plan.segments.map((x) => x.id).sort());
    expect(removal.fittingIds).toEqual(plan.fittings.map((x) => x.id).sort());
    expect(second.plan.removeSegmentIds).toEqual(removal.segmentIds);
    expect(second.plan.removeFittingIds).toEqual(removal.fittingIds);
  }, 60000);

  it('re-runs with a hand-drawn stub: the routed items go, the stub and its fitting stay', () => {
    const { stub, g } = stubOf();
    expect(polygonContainsPoint(startRoom.polygon, g.position), 'G lies in the start room').toBe(true);
    const base = baseState([stub], [g]);
    const run1 = runPlan(base, { segmentIds: [], fittingIds: [] }, targetPortsOf(baseStamps));
    console.log(`stub run status ${run1.status}, counts ${JSON.stringify(counts(run1.plan))}, warnings ${codeCounts(run1.plan)}, ms ${run1.ms.toFixed(0)}`);
    expect(run1.ms).toBeLessThan(1000);
    expect(run1.status).toBe('ok');
    expect(run1.plan.warnings.some((w) => w.code === 'extends-stub')).toBe(true);
    const state1 = apply(base, run1.plan);
    const { reached, components } = walk([stub, ...run1.plan.segments], `p:${START_ID}:out`);
    expect(components).toBe(1);
    expect([...terminalIds].filter((id) => reached.has(`p:${id}:in`))).toHaveLength(run1.plan.stats.ports);
    const removal = routedRunOf(state1, START_ID, 'out');
    expect(removal.segmentIds).not.toContain(stub.id);
    expect(removal.fittingIds).not.toContain(g.id);
    const reduced = reducedState(state1, removal);
    const stamps2 = withSegmentTypes(baseStamps, reduced.segments);
    const leftMarked = reduced.segments.filter((x) => x.routedBy === 'route');
    console.log(`stub removal ${removal.segmentIds.length}/${removal.fittingIds.length} of plan ${run1.plan.segments.length}/${run1.plan.fittings.length}, marked segments left ${JSON.stringify(leftMarked.map((x) => [x.id, x.endpointA, x.endpointB]))}`);
    const run2 = runPlan({ ...state1, stamps: stamps2 }, removal, targetPortsOf(stamps2));
    console.log(`stub re-run status ${run2.status}, counts ${JSON.stringify(counts(run2.plan))}, warnings ${codeCounts(run2.plan)}`);
    expect(run2.status).toBe('ok');
    expect(counts(run2.plan)).toEqual(counts(run1.plan));
    expect(removal.segmentIds).toEqual(run1.plan.segments.map((x) => x.id).sort());
    expect(removal.fittingIds).toEqual(run1.plan.fittings.map((x) => x.id).sort());
  }, 60000);

  it('keeps a hand-drawn segment on a routed fitting and the fitting itself', () => {
    const { plan } = firstRun();
    const routedFitting = plan.fittings[0]!;
    const hand: Fitting = { id: 'hand-h', pageIndex: PAGE, position: { x: routedFitting.position.x + 50, y: routedFitting.position.y + 50 }, kind: 'junction' };
    const handSegment: Segment = {
      id: 'hand-s',
      pageIndex: PAGE,
      networkTypeId: TYPE,
      shape: 'round',
      diameter: 200,
      endpointA: { kind: 'fitting', fittingId: routedFitting.id },
      endpointB: { kind: 'fitting', fittingId: hand.id },
      geometry: [routedFitting.position, hand.position],
    };
    const state1 = apply(baseState(), plan);
    const withHand: State = { ...state1, segments: [...state1.segments, handSegment], fittings: [...state1.fittings, hand] };
    const removal = routedRunOf(withHand, START_ID, 'out');
    console.log(`hand segment on routed fitting ${routedFitting.id}: removal segments ${removal.segmentIds.length}, fittings ${removal.fittingIds.length}`);
    expect(removal.segmentIds).not.toContain(handSegment.id);
    expect(removal.fittingIds).not.toContain(routedFitting.id);
    expect(removal.fittingIds).not.toContain(hand.id);
    expect(removal.segmentIds).toEqual(plan.segments.map((x) => x.id).sort());
  }, 60000);

  it('does not change its input', () => {
    const state = baseState();
    const targets = targetPortsOf(baseStamps);
    const snapshot = structuredClone({ state, rooms, area, targets });
    runPlan(state, { segmentIds: [], fittingIds: [] }, targets);
    expect({ state, rooms, area, targets }).toEqual(snapshot);
  }, 60000);
});
