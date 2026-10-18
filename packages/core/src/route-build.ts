// The route planner, steps 1 to 4 (auto-routing-r6.md §4.3). Reads its input and writes nothing. All work is in mm.

import type { Vec2 } from './geometry.js';
import { computeNetworks } from './network.js';
import type { ConnectionPoint, Fitting, PortGroup, Segment } from './network.js';
import { getStampWorldPorts } from './stamp.js';
import { checkRouteStart } from './route-start.js';
import type { RoutePort, RouteStamp } from './route-ports.js';
import type { RouteArea } from './route-area.js';
import type { Room } from './rooms/room.js';
import type { SizingSettings } from './sizing-settings.js';
import { ROUTE_GRAVITY_TYPE_IDS } from './route-plan-warnings.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';

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
  includeOffGraph: boolean;
  limits?: SizingSettings;
  newSegmentId: () => string; newFittingId: () => string;
}

export interface RouteStats { segments: number; fittings: number; lengthMm: number; bends90: number; bends45: number; freeLegs: number; rooms: number; ports: number; portsLeft: number; wallCrossings: number; existingCrossings: number; removedSegments: number; removedFittings: number }
export interface PlannedRoute { segments: Segment[]; fittings: Fitting[]; removeSegmentIds: string[]; removeFittingIds: string[]; warnings: RoutePlanWarning[]; stats: RouteStats }

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

  const grouped = groupTargetPorts(input.targetPorts, new Set(input.area.rooms.map((room) => room.roomId)));

  warnings.push({ code: 'draft-2d', severity: 'info' });
  return {
    status: 'ok',
    plan: {
      segments: [],
      fittings: [],
      removeSegmentIds: [...input.removal.segmentIds].sort(),
      removeFittingIds: [...input.removal.fittingIds].sort(),
      warnings,
      stats: {
        ...emptyStats(),
        removedSegments: input.removal.segmentIds.length,
        removedFittings: input.removal.fittingIds.length,
        rooms: grouped.byRoom.size,
        ports: input.targetPorts.length,
      },
    },
  };
}
