// The route planner, steps 1 to 4 (auto-routing-r6.md §4.3). Reads its input and writes nothing. All work is in mm.

import type { Vec2 } from './geometry.js';
import { computeNetworks } from './network.js';
import type { ConnectionPoint, Fitting, NetworkType, PortGroup, Segment } from './network.js';
import { getNetworkTypeFromLibrary } from './network-type-library.js';
import { getStampWorldPorts } from './stamp.js';
import { buildTrunk } from './route-trunk.js';
import { planBranches, type BranchRoomInput } from './route-branch.js';
import { elbowPath, insideRouteArea } from './route-layout.js';
import { buildRouteItems, connectLoosePorts, type TopologyPort } from './route-topology.js';
import { checkRouteStart } from './route-start.js';
import { canJoinPoint, checkExisting, checkInvariant, distanceToPiece, makeCrossesExisting, NEAR_ITEM_MM } from './route-checks.js';
import type { RoutePort, RouteStamp } from './route-ports.js';
import type { RouteArea } from './route-area.js';
import type { Room } from './rooms/room.js';
import type { SizingSettings } from './sizing-settings.js';
import { ROUTE_GRAVITY_TYPE_IDS } from './route-plan-warnings.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';
import { crossingsAlongPath } from './route-crossings.js';
import { solveFlow } from './flow.js';
import { sizeNetwork, type SizedSegment } from './sizing-network.js';
import type { FlowUnitId } from './flow-units.js';
import type { StampCategory } from './stamp-library.js';
import { capacityWarnings, orderWarnings, shortLegCount } from './route-finish.js';

export interface RouteBuildInput {
  startStampId: string; startPortId: string; networkTypeId: string;
  targetPorts: readonly RoutePort[];          // computed by the caller on S'
  state: { stamps: readonly RouteStamp[]; segments: readonly Segment[]; fittings: readonly Fitting[]; portGroups: readonly PortGroup[] };
  removal: { segmentIds: readonly string[]; fittingIds: readonly string[] };
  rooms: readonly Room[];
  area: RouteArea;
  mmPerPt: number | null; pageIndex: number;
  /** The number of pages of the file. Default 1. More than 1 gives the error multi-page. */
  pageCount?: number;
  limits?: SizingSettings;
  /** The network type of the run. Default: the type of the library with `networkTypeId`; none found gives discipline 'other'. */
  networkType?: Pick<NetworkType, 'id' | 'discipline' | 'flowUnit' | 'sizingMethod'>;
  /** The capacity of each element by id. Default {}. */
  terminalCapacities?: Record<string, number>;
  /** The unit of the capacity of one element, or null. Default: always null. */
  capacityUnitOf?: (elementId: string) => FlowUnitId | null;
  elementCategories?: Record<string, StampCategory>;
  newSegmentId: () => string; newFittingId: () => string;
}

export interface RouteStats { segments: number; fittings: number; lengthMm: number; bends90: number; bends45: number; freeLegs: number; rooms: number; ports: number; portsLeft: number; wallCrossings: number; existingCrossings: number; removedSegments: number; removedFittings: number }
export interface PlannedRoute { segments: Segment[]; fittings: Fitting[]; removeSegmentIds: string[]; removeFittingIds: string[]; warnings: RoutePlanWarning[]; stats: RouteStats; sizes: SizedSegment[] }

export interface GroupedPorts {
  /** Ports in a served room (a room that is not in the route area). Key = room id. Map insertion order = room ids sorted. Ports keep the input order. */
  byRoom: Map<string, RoutePort[]>;
  /** Ports with roomId null (in no room). */
  outside: RoutePort[];
  /** Ports in a room that is itself in the route area (a corridor or shaft). The plan has no rule for them yet. */
  inArea: RoutePort[];
}

export type StartResolution =
  | { ok: true; pointMm: Vec2; stubSegmentId: string | null; stubFittingId: string | null }
  | { ok: false };

/** S' = state minus the removal set. Returns new arrays, never changes the input. */
export function reducedState(state: RouteBuildInput['state'], removal: RouteBuildInput['removal']): { segments: Segment[]; fittings: Fitting[] } {
  const segmentIds = new Set(removal.segmentIds);
  const fittingIds = new Set(removal.fittingIds);
  return {
    segments: state.segments.filter((segment) => !segmentIds.has(segment.id)),
    fittings: state.fittings.filter((fitting) => !fittingIds.has(fitting.id)),
  };
}

export function groupTargetPorts(ports: readonly RoutePort[], areaRoomIds: ReadonlySet<string>): GroupedPorts {
  const outside: RoutePort[] = [];
  const inArea: RoutePort[] = [];
  const rooms = new Map<string, RoutePort[]>();
  for (const port of ports) {
    if (port.roomId === null) outside.push(port);
    else if (areaRoomIds.has(port.roomId)) inArea.push(port);
    else {
      const list = rooms.get(port.roomId);
      if (list) list.push(port);
      else rooms.set(port.roomId, [port]);
    }
  }
  const byRoom = new Map<string, RoutePort[]>();
  for (const roomId of [...rooms.keys()].sort()) byRoom.set(roomId, rooms.get(roomId)!);
  return { byRoom, outside, inArea };
}

function emptyStats(): RouteStats {
  return { segments: 0, fittings: 0, lengthMm: 0, bends90: 0, bends45: 0, freeLegs: 0, rooms: 0, ports: 0, portsLeft: 0, wallCrossings: 0, existingCrossings: 0, removedSegments: 0, removedFittings: 0 };
}

function isPortEndpoint(point: ConnectionPoint, stampId: string, portId: string): boolean {
  return point.kind === 'port' && point.elementId === stampId && point.portId === portId;
}

function segmentsOnPort(segments: readonly Segment[], stampId: string, portId: string): Segment[] {
  return segments.filter((segment) => isPortEndpoint(segment.endpointA, stampId, portId) || isPortEndpoint(segment.endpointB, stampId, portId));
}

function existingPortPoints(stamps: readonly RouteStamp[], segments: readonly Segment[]): Vec2[] {
  const used = new Set<string>();
  for (const s of segments) {
    for (const end of [s.endpointA, s.endpointB]) if (end.kind === 'port') used.add(`${end.elementId}:${end.portId}`);
  }
  const points: Vec2[] = [];
  for (const stamp of stamps) {
    for (const stampPort of getStampWorldPorts(stamp)) if (used.has(`${stamp.id}:${stampPort.id}`)) points.push(stampPort.world);
  }
  return points;
}

function refused(warnings: RoutePlanWarning[]): { status: 'refused'; plan: PlannedRoute } {
  return {
    status: 'refused',
    plan: {
      segments: [],
      fittings: [],
      removeSegmentIds: [],
      removeFittingIds: [],
      warnings: [...warnings, { code: 'draft-2d', severity: 'info' }],
      stats: emptyStats(),
      sizes: [],
    },
  };
}

export function resolveStart(input: RouteBuildInput, reduced: { segments: Segment[]; fittings: Fitting[] }, warnings: RoutePlanWarning[]): StartResolution {
  const { startStampId, startPortId, networkTypeId } = input;
  const mmPerPt = input.mmPerPt ?? 0;
  const own = segmentsOnPort(reduced.segments, startStampId, startPortId);

  if (own.length === 0) {
    const stamp = input.state.stamps.find((candidate) => candidate.id === startStampId);
    const world = stamp ? getStampWorldPorts(stamp).find((port) => port.id === startPortId)?.world : undefined;
    if (!world) return { ok: false };
    return { ok: true, pointMm: { x: world.x * mmPerPt, y: world.y * mmPerPt }, stubSegmentId: null, stubFittingId: null };
  }

  const stub = own[0]!;
  const far = isPortEndpoint(stub.endpointA, startStampId, startPortId) ? stub.endpointB : stub.endpointA;
  if (far.kind !== 'fitting') {
    warnings.push({ code: 'start-unreachable', severity: 'error' });
    return { ok: false };
  }
  const fitting = reduced.fittings.find((candidate) => candidate.id === far.fittingId);
  if (!fitting) {
    warnings.push({ code: 'start-unreachable', severity: 'error' });
    return { ok: false };
  }
  warnings.push({ code: 'extends-stub', severity: 'info', ids: [stub.id, fitting.id] });

  const networks = computeNetworks({ segments: [...reduced.segments], fittings: [...reduced.fittings], portGroups: [...input.state.portGroups] });
  const segmentById = new Map(reduced.segments.map((segment) => [segment.id, segment] as const));
  const networkSegmentIds = new Set(networks.filter((network) => network.segmentIds.includes(stub.id)).flatMap((network) => network.segmentIds));
  const foreignIds = [...networkSegmentIds].filter((id) => segmentById.get(id)?.networkTypeId !== networkTypeId).sort();
  if (foreignIds.length > 0) {
    warnings.push({ code: 'foreign-start', severity: 'error', ids: foreignIds });
    return { ok: false };
  }
  return { ok: true, pointMm: { x: fitting.position.x * mmPerPt, y: fitting.position.y * mmPerPt }, stubSegmentId: stub.id, stubFittingId: fitting.id };
}

export function planRoute(input: RouteBuildInput): { status: 'ok' | 'refused'; plan: PlannedRoute } {
  const warnings: RoutePlanWarning[] = [];
  const errors: RoutePlanWarning[] = [];
  const reduced = reducedState(input.state, input.removal);

  if ((input.pageCount ?? 1) > 1) errors.push({ code: 'multi-page', severity: 'error' });
  if (input.mmPerPt === null || !(input.mmPerPt > 0)) errors.push({ code: 'no-calibration', severity: 'error' });
  if (input.area.status !== 'ok') errors.push({ code: 'area-empty', severity: 'error' });
  if (ROUTE_GRAVITY_TYPE_IDS.includes(input.networkTypeId)) errors.push({ code: 'gravity-not-routed', severity: 'error' });

  const problems = checkRouteStart({
    stamps: input.state.stamps,
    segments: reduced.segments,
    fittings: reduced.fittings,
    portGroups: input.state.portGroups,
    startStampId: input.startStampId,
    startPortId: input.startPortId,
    networkTypeId: input.networkTypeId,
    phase: 'before',
  });
  const startCodes: string[] = problems.filter((problem) => problem.severity === 'error').map((problem) => problem.code);
  if (segmentsOnPort(reduced.segments, input.startStampId, input.startPortId).length > 1) startCodes.push('port-segments');
  if (startCodes.length > 0) errors.push({ code: 'start-error', severity: 'error', ids: startCodes });
  const sameType = problems.find((problem) => problem.code === 'group-same-type');
  if (sameType) errors.push({ code: 'same-type-join', severity: 'warning', ids: sameType.portIds ?? [] });
  if (input.targetPorts.length === 0) errors.push({ code: 'no-targets', severity: 'error' });
  if (errors.some((warning) => warning.severity === 'error')) return refused(errors);
  warnings.push(...errors);

  const removedCount = input.removal.segmentIds.length + input.removal.fittingIds.length;
  if (removedCount > 0) {
    warnings.push({ code: 'removes-routed', severity: 'info', numbers: { segments: input.removal.segmentIds.length, fittings: input.removal.fittingIds.length } });
  }

  const start = resolveStart(input, reduced, warnings);
  if (!start.ok) return refused(warnings);

  const mmPerPt = input.mmPerPt ?? 0;
  const reducedGraph = { segments: reduced.segments, fittings: reduced.fittings, portGroups: input.state.portGroups };
  const reducedNetworks = computeNetworks({ segments: [...reduced.segments], fittings: [...reduced.fittings], portGroups: [...input.state.portGroups] });
  const startNetwork = new Set<string>();
  const startFittings = new Set<string>();
  if (start.stubSegmentId !== null) {
    for (const network of reducedNetworks) {
      if (!network.segmentIds.includes(start.stubSegmentId)) continue;
      for (const id of network.segmentIds) startNetwork.add(id);
      for (const id of network.fittingIds) startFittings.add(id);
    }
  }
  const existing = { segments: reduced.segments.filter((s) => !startNetwork.has(s.id)), fittings: reduced.fittings.filter((f) => !startFittings.has(f.id)) };

  const growable = new Set<string>(startNetwork);
  const startJoin = canJoinPoint(reducedGraph, { kind: 'port', elementId: input.startStampId, portId: input.startPortId }, input.networkTypeId, reducedNetworks);
  if (startJoin.ok) for (const id of startJoin.sameTypeJoinIds) growable.add(id);
  const sameTypeJoinIds = new Set<string>();
  const refusedPorts: RoutePort[] = [];
  const targetPorts: RoutePort[] = [];
  for (const port of input.targetPorts) {
    const join = canJoinPoint(reducedGraph, { kind: 'port', elementId: port.stampId, portId: port.portId }, input.networkTypeId, reducedNetworks);
    if (!join.ok || (join.sameTypeJoinIds.length === 0 && join.atNodeIds.length > 0)) {
      refusedPorts.push(port);
      continue;
    }
    targetPorts.push(port);
    for (const id of join.sameTypeJoinIds) {
      sameTypeJoinIds.add(id);
      growable.add(id);
    }
  }
  if (sameTypeJoinIds.size > 0) {
    const at = warnings.findIndex((warning) => warning.code === 'same-type-join');
    const ids = [...new Set([...(at >= 0 ? warnings[at]!.ids ?? [] : []), ...sameTypeJoinIds])].sort();
    if (at >= 0) warnings[at] = { ...warnings[at]!, ids };
    else warnings.push({ code: 'same-type-join', severity: 'warning', ids });
  }

  const grouped = groupTargetPorts(targetPorts, new Set(input.area.rooms.map((room) => room.roomId)));

  const discipline = (input.networkType ?? getNetworkTypeFromLibrary(input.networkTypeId))?.discipline ?? 'other';
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
  const toPage = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const portKey = (port: RoutePort): string => `${port.stampId}:${port.portId}`;

  const servedRoomIds = [...grouped.byRoom.keys()];
  const trunk = buildTrunk({ area: input.area, rooms: input.rooms, mmPerPt, startPointMm: start.pointMm, servedRoomIds });

  const paths: Vec2[][] = [];
  if (trunk.rootPointMm) {
    const dx = trunk.rootPointMm.x - start.pointMm.x;
    const dy = trunk.rootPointMm.y - start.pointMm.y;
    if (Math.hypot(dx, dy) > 1e-6) paths.push(elbowPath(start.pointMm, trunk.rootPointMm, Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'));
  }
  for (const edge of trunk.edges) paths.push(edge.path);

  // A port in a route-area room (inArea) is treated like an outside port: it gets the off-graph connection. Provisional rule, the plan has none yet.
  const loosePorts: RoutePort[] = [];
  for (const roomId of trunk.offGraphRoomIds) loosePorts.push(...(grouped.byRoom.get(roomId) ?? []));
  loosePorts.push(...grouped.outside, ...grouped.inArea);

  const roomById = new Map(input.rooms.map((room) => [room.id, room] as const));
  const branchRooms: BranchRoomInput[] = trunk.served.map((served) => {
    const room = roomById.get(served.roomId);
    return {
      roomId: served.roomId,
      entryPointMm: served.entryPointMm,
      ports: grouped.byRoom.get(served.roomId)!.map((port) => ({ id: portKey(port), point: toMm(port.world) })),
      inside: room ? insideRouteArea([room], mmPerPt) : () => false,
    };
  });
  const portById = new Map(input.targetPorts.map((port) => [portKey(port), port] as const));
  for (const branch of planBranches({
    crossesExisting: makeCrossesExisting(existing.segments, mmPerPt),
    trunk: trunk.edges.map((edge) => ({ id: edge.id, path: edge.path })),
    rootPointMm: trunk.rootPointMm ?? start.pointMm,
    rooms: branchRooms,
  }).rooms) {
    paths.push(branch.branch, ...branch.spine);
    for (const id of branch.offGraphPortIds) loosePorts.push(portById.get(id)!);
  }

  // Provisional: "would join an item of another network type" is read as a geometric nearness (NEAR_ITEM_MM) to a foreign item. It checks vertices only; a leg along a foreign segment is reported by checkExisting.
  const foreignSegments = existing.segments.filter((s) => s.networkTypeId !== input.networkTypeId);
  const foreignFittingIds = new Set<string>();
  const foreignPortKeys = new Set<string>();
  for (const s of foreignSegments) {
    for (const end of [s.endpointA, s.endpointB]) {
      if (end.kind === 'fitting') foreignFittingIds.add(end.fittingId);
      else foreignPortKeys.add(`${end.elementId}:${end.portId}`);
    }
  }
  const foreignPoints: Vec2[] = existing.fittings.filter((f) => foreignFittingIds.has(f.id)).map((f) => toMm(f.position));
  for (const stampItem of input.state.stamps) {
    for (const stampPort of getStampWorldPorts(stampItem)) {
      if (foreignPortKeys.has(`${stampItem.id}:${stampPort.id}`)) foreignPoints.push(toMm(stampPort.world));
    }
  }
  const foreignPieces: [Vec2, Vec2][] = [];
  for (const s of foreignSegments) {
    for (let i = 1; i < s.geometry.length; i++) foreignPieces.push([toMm(s.geometry[i - 1]!), toMm(s.geometry[i]!)]);
  }

  const connected = connectLoosePorts({
    paths,
    startPoint: start.pointMm,
    loose: loosePorts.map((port) => ({ id: portKey(port), point: toMm(port.world) })),
    targetPoints: targetPorts.map((port) => toMm(port.world)),
    noTapPoints: start.stubFittingId === null ? [start.pointMm] : [],
    accepts: (path) => path.every((vertex, index) => {
      if (foreignPoints.some((p) => Math.hypot(p.x - vertex.x, p.y - vertex.y) <= NEAR_ITEM_MM)) return false;
      if (index === 0) return true;
      return !foreignPieces.some(([a, b]) => distanceToPiece(vertex, a, b) <= NEAR_ITEM_MM);
    }),
  });
  paths.push(...connected.paths);
  const leftIds = new Set(connected.left);
  const connectedPorts = targetPorts.filter((port) => !leftIds.has(portKey(port)));

  const stubFitting = start.stubFittingId === null ? undefined : reduced.fittings.find((fitting) => fitting.id === start.stubFittingId);
  const topologyPorts: TopologyPort[] = connectedPorts.map((port) => ({ point: toMm(port.world), pagePoint: port.world, stampId: port.stampId, portId: port.portId }));
  if (!stubFitting) {
    const startStamp = input.state.stamps.find((stamp) => stamp.id === input.startStampId);
    const world = startStamp ? getStampWorldPorts(startStamp).find((port) => port.id === input.startPortId)?.world : undefined;
    topologyPorts.push({ point: start.pointMm, pagePoint: world ?? toPage(start.pointMm), stampId: input.startStampId, portId: input.startPortId });
  }
  const items = buildRouteItems({
    paths,
    ports: topologyPorts,
    stubFitting: stubFitting ? { point: start.pointMm, pagePoint: stubFitting.position, fittingId: stubFitting.id } : null,
    startPoint: start.pointMm,
    networkTypeId: input.networkTypeId,
    discipline,
    pageIndex: input.pageIndex,
    mmPerPt,
    newSegmentId: input.newSegmentId,
    newFittingId: input.newFittingId,
  });

  if (trunk.freeEdges.length > 0) warnings.push({ code: 'free-angle', severity: 'warning', count: trunk.freeEdges.length, points: trunk.freeEdges.map((edge) => toPage(edge.pointMm)) });
  if (trunk.offGraphRoomIds.length > 0) warnings.push({ code: 'room-off-graph', severity: 'warning', ids: [...trunk.offGraphRoomIds].sort(), count: trunk.offGraphRoomIds.length });
  const leftCount = connected.left.length + refusedPorts.length;
  if (leftCount > 0) {
    warnings.push({ code: 'ports-left', severity: 'warning', count: leftCount });
    const leftPorts = [...connected.left.map((id) => portById.get(id)!), ...refusedPorts];
    const skipped = [...new Set(leftPorts.map((port) => port.roomId).filter((id): id is string => id !== null))].sort();
    if (skipped.length > 0) warnings.push({ code: 'rooms-skipped', severity: 'info', ids: skipped, count: skipped.length });
  }

  const checked = checkExisting({
    newSegments: items.segments,
    newFittings: items.fittings,
    existingSegments: existing.segments,
    existingFittings: existing.fittings,
    existingPortPoints: existingPortPoints(input.state.stamps, existing.segments),
    mmPerPt,
  });
  const existingCrossings = checked.crossings + checked.nearItems;
  if (existingCrossings > 0) warnings.push({ code: 'existing-crossings', severity: 'warning', count: existingCrossings, points: [...checked.crossingPoints, ...checked.nearPoints] });
  if (checked.overlaps > 0) warnings.push({ code: 'existing-overlap', severity: 'warning', count: checked.overlaps, ids: checked.overlapIds });
  if (checked.lane > 0) warnings.push({ code: 'shares-lane', severity: 'info', count: checked.lane, ids: checked.laneIds });

  const targetKeys = new Set(connectedPorts.map(portKey));
  const endpointCount = new Map<string, number>();
  for (const planned of items.segments) {
    for (const end of [planned.endpointA, planned.endpointB]) {
      if (end.kind !== 'port') continue;
      const key = `${end.elementId}:${end.portId}`;
      if (targetKeys.has(key)) endpointCount.set(key, (endpointCount.get(key) ?? 0) + 1);
    }
  }
  const crowded = [...endpointCount].filter(([, count]) => count > 1).map(([key]) => key).sort();
  if (crowded.length > 0) return refused([...warnings, { code: 'internal-join', severity: 'error', ids: crowded }]);

  const broken = checkInvariant({
    reducedSegments: reduced.segments,
    reducedFittings: reduced.fittings,
    newSegments: items.segments,
    newFittings: items.fittings,
    portGroups: input.state.portGroups,
    networkTypeId: input.networkTypeId,
    growableSegmentIds: [...growable],
  });
  if (broken.length > 0) return refused([...warnings, { code: 'internal-join', severity: 'error', ids: broken }]);

  const shaftRoomIds = new Set(input.area.rooms.filter((room) => room.kind === 'shaft').map((room) => room.roomId));
  const wallPoints: Vec2[] = [];
  const shaftPoints: Vec2[] = [];
  const shaftIds = new Set<string>();
  for (const planned of items.segments) {
    for (const crossing of crossingsAlongPath(input.rooms, planned.geometry, { mmPerPt, pageIndex: input.pageIndex }).crossings) {
      const shaftSides = [crossing.fromRoomId, crossing.toRoomId].filter((id): id is string => id !== null && shaftRoomIds.has(id));
      if (shaftSides.length > 0) {
        for (const id of shaftSides) shaftIds.add(id);
        shaftPoints.push(crossing.point);
      } else wallPoints.push(crossing.point);
    }
  }
  if (wallPoints.length > 0) warnings.push({ code: 'wall-crossings', severity: 'warning', count: wallPoints.length, points: wallPoints });
  if (shaftPoints.length > 0) warnings.push({ code: 'shaft-crossing', severity: 'warning', count: shaftPoints.length, ids: [...shaftIds].sort(), points: shaftPoints });

  const terminalCapacities = input.terminalCapacities ?? {};
  const capacityUnitOf = input.capacityUnitOf ?? (() => null);
  const planState = {
    segments: [...reduced.segments, ...items.segments],
    fittings: [...reduced.fittings, ...items.fittings],
    portGroups: [...input.state.portGroups],
  };
  const newSegmentIds = new Set(items.segments.map((s) => s.id));
  const runNetwork = computeNetworks(planState).find((network) => network.segmentIds.some((id) => newSegmentIds.has(id)));
  const runType = input.networkType ?? getNetworkTypeFromLibrary(input.networkTypeId);
  if (runNetwork) {
    const flow = solveFlow({
      network: runNetwork,
      ...planState,
      terminalCapacities,
      rootElementId: input.startStampId,
      rootPortId: input.startPortId,
      elementCategories: input.elementCategories,
    });
    const capacity = capacityWarnings(terminalCapacities[input.startStampId] ?? 0, flow.totalCapacity, Boolean(runType?.flowUnit));
    if (capacity) warnings.push(capacity);
  }

  let sizes: SizedSegment[] = [];
  let sized = false;
  if (runNetwork && input.limits && runType?.flowUnit && runType.sizingMethod) {
    const result = sizeNetwork({
      ...planState,
      terminalCapacities,
      capacityUnitOf,
      elementCategories: input.elementCategories,
      startStampId: input.startStampId,
      startPortId: input.startPortId,
      networkType: runType,
      sizing: input.limits,
    });
    if (result.status === 'ok') {
      sized = true;
      sizes = result.sizes.filter((size) => newSegmentIds.has(size.segmentId));
      const handKept = runNetwork.segmentIds.filter((id) => !newSegmentIds.has(id)).length;
      if (handKept > 0) warnings.push({ code: 'hand-kept-size', severity: 'info', count: handKept });
    }
  }
  if (!sized) warnings.push({ code: 'no-limits', severity: 'warning' });
  const shortLegs = shortLegCount(items.segments, sizes, mmPerPt);
  if (shortLegs > 0) warnings.push({ code: 'short-leg', severity: 'warning', count: shortLegs });
  warnings.push({ code: 'draft-2d', severity: 'info' });

  const roomsWithPorts = new Set(connectedPorts.map((port) => port.roomId).filter((id): id is string => id !== null && grouped.byRoom.has(id)));
  return {
    status: 'ok',
    plan: {
      segments: items.segments,
      fittings: items.fittings,
      removeSegmentIds: [...input.removal.segmentIds].sort(),
      removeFittingIds: [...input.removal.fittingIds].sort(),
      warnings: orderWarnings(warnings),
      sizes,
      stats: {
        ...emptyStats(),
        segments: items.segments.length,
        fittings: items.fittings.length,
        lengthMm: items.lengthMm,
        bends90: items.bends90,
        bends45: items.bends45,
        freeLegs: items.freeLegs,
        rooms: roomsWithPorts.size,
        ports: connectedPorts.length,
        portsLeft: leftCount,
        wallCrossings: wallPoints.length + shaftPoints.length,
        existingCrossings,
        removedSegments: input.removal.segmentIds.length,
        removedFittings: input.removal.fittingIds.length,
      },
    },
  };
}
