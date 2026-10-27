// Measures a planned route and scores it (route quality research, part Q1). Reads the plan and the rooms and writes nothing. Lengths are mm; geometry is page points.

import type { Vec2 } from './geometry.js';
import type { ConnectionPoint, FittingKind } from './network.js';
import type { RouteArea } from './route-area.js';
import type { PlannedRoute } from './route-build.js';
import { roomsAtPoint, type Room } from './rooms/room.js';
import { crossingsAlongPath } from './route-crossings.js';
import { legClass } from './route-layout.js';
import type { RoutePlanWarning, RoutePlanWarningCode } from './route-plan-warnings.js';

/**
 * The numbers of one planned route. A leg is the part of a segment between two
 * consecutive geometry points. There is no link length: a link cannot be told
 * from a branch by geometry. Path metrics use the planned segments only: a target
 * that is reached only through an existing segment is not counted.
 */
export interface RouteMetrics {
  lengthMm: number;
  lengthTrunkMm: number;
  lengthBranchMm: number;
  lengthRoomMm: number;
  segments: number;
  fittings: number;
  fittingsByKind: Record<FittingKind, number>;
  bends90: number;
  bends45: number;
  freeLegs: number;
  wallCrossings: number;
  openRuns: number;
  shaftCrossings: number;
  existingCrossings: number;
  existingOverlaps: number;
  offGraphRooms: number;
  noEntryRooms: number;
  portsLeft: number;
  corridorShare: number;
  longestPathMm: number;
  meanPathMm: number;
  branchLengthSpreadMm: number;
  freeLegsShare: number;
  /** Elbows by place and angle. A bend is an elbow fitting; its place is the room that holds it (route area, served room, or no room). */
  bendsArea90: number;
  bendsArea45: number;
  bendsRoom90: number;
  bendsRoom45: number;
  bendsOutside: number;
  /** Served rooms with at least one bend inside. */
  roomsWithBends: number;
  /** Served rooms that a segment enters directly from another served room (a chain). */
  chainedRooms: number;
  /** Served rooms with more than one entry point (entry points less than ENTRY_CLUSTER_MM apart count once). */
  multiEntryRooms: number;
  /** Legs at 45 degrees, and those longer than LONG_DIAGONAL_MM. */
  diagonalLegs: number;
  longDiagonalLegs: number;
}

/** A diagonal leg longer than this is a long diagonal. */
export const LONG_DIAGONAL_MM = 3000;
/** Entry points into one room closer than this count as one entry. */
export const ENTRY_CLUSTER_MM = 1000;

function legLengthMm(a: Vec2, b: Vec2, mmPerPt: number): number {
  return Math.hypot(b.x - a.x, b.y - a.y) * mmPerPt;
}

function deflectionDegrees(u: Vec2, w: Vec2): number {
  return (Math.atan2(Math.abs(u.x * w.y - u.y * w.x), u.x * w.x + u.y * w.y) * 180) / Math.PI;
}

function entryPoints(rooms: readonly Room[], path: readonly Vec2[], mmPerPt: number, pageIndex: number): { roomId: string; point: Vec2 }[] {
  const out: { roomId: string; point: Vec2 }[] = [];
  const stepPt = 100 / mmPerPt;
  let previous: string | null = null;
  let previousPoint: Vec2 | null = null;
  const sample = (p: Vec2): void => {
    const roomId = roomsAtPoint(rooms, p, pageIndex)[0]?.id ?? null;
    if (roomId !== null && roomId !== previous && previousPoint !== null) out.push({ roomId, point: p });
    previous = roomId;
    previousPoint = p;
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepPt));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) sample({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function endpointKey(point: ConnectionPoint): string {
  return point.kind === 'fitting' ? `f:${point.fittingId}` : `p:${point.elementId}:${point.portId}`;
}

function shortestPaths(adjacency: ReadonlyMap<string, readonly { to: string; mm: number }[]>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const [key, d] of dist) {
      if (!done.has(key) && d < best) {
        best = d;
        current = key;
      }
    }
    if (current === null) return dist;
    done.add(current);
    for (const edge of adjacency.get(current) ?? []) {
      const next = best + edge.mm;
      const prev = dist.get(edge.to);
      if (prev === undefined || next < prev) dist.set(edge.to, next);
    }
  }
}

/** Measures one planned route. The inputs are not changed. */
export function routeMetrics(input: {
  plan: PlannedRoute; rooms: readonly Room[]; area: RouteArea; mmPerPt: number; pageIndex: number;
  startStampId: string; startPortId: string;
  /** Set when the start port has an existing stub: the plan segments then start at this fitting, not at the port. */
  startFittingId?: string;
}): RouteMetrics {
  const { plan, rooms, area, mmPerPt, pageIndex } = input;
  const areaRoomIds = new Set(area.rooms.map((r) => r.roomId));
  const shaftRoomIds = new Set(area.rooms.filter((r) => r.kind === 'shaft').map((r) => r.roomId));

  let lengthMm = 0;
  let lengthTrunkMm = 0;
  let lengthBranchMm = 0;
  let lengthRoomMm = 0;
  let freeLengthMm = 0;
  let wallCrossings = 0;
  let openRuns = 0;
  let shaftCrossings = 0;
  for (const segment of plan.segments) {
    const path = segment.geometry;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const mm = legLengthMm(a, b, mmPerPt);
      lengthMm += mm;
      if (legClass(a, b) === 'free') freeLengthMm += mm;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const roomId = roomsAtPoint(rooms, midpoint, pageIndex)[0]?.id ?? null;
      if (roomId === null) lengthBranchMm += mm;
      else if (areaRoomIds.has(roomId)) lengthTrunkMm += mm;
      else lengthRoomMm += mm;
    }
    const walked = crossingsAlongPath(rooms, path, { mmPerPt, pageIndex });
    wallCrossings += walked.crossings.length;
    openRuns += walked.openRuns.length;
    for (const crossing of walked.crossings) {
      if ([crossing.fromRoomId, crossing.toRoomId].some((id) => id !== null && shaftRoomIds.has(id))) shaftCrossings++;
    }
  }

  const servedRoomOf = (id: string | null): id is string => id !== null && !areaRoomIds.has(id);
  const chained = new Set<string>();
  const entriesByRoom = new Map<string, Vec2[]>();
  let diagonalLegs = 0;
  let longDiagonalLegs = 0;
  for (const segment of plan.segments) {
    const path = segment.geometry;
    for (let i = 1; i < path.length; i++) {
      if (legClass(path[i - 1]!, path[i]!) === 'diagonal') {
        diagonalLegs++;
        if (legLengthMm(path[i - 1]!, path[i]!, mmPerPt) > LONG_DIAGONAL_MM) longDiagonalLegs++;
      }
    }
    for (const crossing of crossingsAlongPath(rooms, path, { mmPerPt, pageIndex }).crossings) {
      if (servedRoomOf(crossing.fromRoomId) && servedRoomOf(crossing.toRoomId) && crossing.fromRoomId !== crossing.toRoomId) chained.add(crossing.toRoomId);
    }
    for (const entry of entryPoints(rooms, path, mmPerPt, pageIndex)) {
      if (!servedRoomOf(entry.roomId)) continue;
      const list = entriesByRoom.get(entry.roomId);
      if (list) list.push(entry.point);
      else entriesByRoom.set(entry.roomId, [entry.point]);
    }
  }
  let multiEntryRooms = 0;
  for (const points of entriesByRoom.values()) {
    const clusters: Vec2[] = [];
    for (const p of points) {
      if (!clusters.some((c) => legLengthMm(c, p, mmPerPt) < ENTRY_CLUSTER_MM)) clusters.push(p);
    }
    if (clusters.length > 1) multiEntryRooms++;
  }

  const ends = new Map<string, Vec2[]>();
  for (const segment of plan.segments) {
    const g = segment.geometry;
    if (g.length < 2) continue;
    for (const [end, from, next] of [[segment.endpointA, g[0]!, g[1]!], [segment.endpointB, g[g.length - 1]!, g[g.length - 2]!]] as const) {
      if (end.kind !== 'fitting') continue;
      const list = ends.get(end.fittingId);
      const away = { x: next.x - from.x, y: next.y - from.y };
      if (list) list.push(away);
      else ends.set(end.fittingId, [away]);
    }
  }
  let bendsArea90 = 0;
  let bendsArea45 = 0;
  let bendsRoom90 = 0;
  let bendsRoom45 = 0;
  let bendsOutside = 0;
  const bentRooms = new Set<string>();
  for (const fitting of plan.fittings) {
    if (fitting.kind !== 'elbow') continue;
    const away = ends.get(fitting.id);
    if (!away || away.length !== 2) continue;
    const deflection = deflectionDegrees({ x: -away[0]!.x, y: -away[0]!.y }, away[1]!);
    const is90 = Math.abs(deflection - 90) <= 1;
    const is45 = Math.abs(deflection - 45) <= 1;
    if (!is90 && !is45) continue;
    const roomId = roomsAtPoint(rooms, fitting.position, pageIndex)[0]?.id ?? null;
    if (roomId === null) bendsOutside++;
    else if (areaRoomIds.has(roomId)) {
      if (is90) bendsArea90++;
      else bendsArea45++;
    } else {
      bentRooms.add(roomId);
      if (is90) bendsRoom90++;
      else bendsRoom45++;
    }
  }

  const fittingsByKind: Record<FittingKind, number> = { junction: 0, elbow: 0, tee: 0, reducer: 0, cross: 0 };
  for (const fitting of plan.fittings) fittingsByKind[fitting.kind]++;

  const countOf = (code: RoutePlanWarningCode): number => plan.warnings.find((w: RoutePlanWarning) => w.code === code)?.count ?? 0;

  const adjacency = new Map<string, { to: string; mm: number }[]>();
  const addEdge = (from: string, to: string, mm: number): void => {
    const list = adjacency.get(from);
    if (list) list.push({ to, mm });
    else adjacency.set(from, [{ to, mm }]);
  };
  const portNodes = new Set<string>();
  const networkOfNode = new Map<string, string>();
  for (const segment of plan.segments) {
    let mm = 0;
    for (let i = 1; i < segment.geometry.length; i++) mm += legLengthMm(segment.geometry[i - 1]!, segment.geometry[i]!, mmPerPt);
    const ka = endpointKey(segment.endpointA);
    const kb = endpointKey(segment.endpointB);
    addEdge(ka, kb, mm);
    addEdge(kb, ka, mm);
    for (const [key, end] of [[ka, segment.endpointA], [kb, segment.endpointB]] as const) {
      if (end.kind === 'port') portNodes.add(key);
      networkOfNode.set(key, segment.networkTypeId);
    }
  }

  const startKey = input.startFittingId !== undefined ? `f:${input.startFittingId}` : `p:${input.startStampId}:${input.startPortId}`;
  const dist = adjacency.has(startKey) ? shortestPaths(adjacency, startKey) : new Map<string, number>();
  const startPortKey = `p:${input.startStampId}:${input.startPortId}`;
  const pathsByNetwork = new Map<string, number[]>();
  for (const key of portNodes) {
    if (key === startKey || key === startPortKey) continue;
    const d = dist.get(key);
    if (d === undefined) continue;
    const networkTypeId = networkOfNode.get(key) ?? '';
    const list = pathsByNetwork.get(networkTypeId);
    if (list) list.push(d);
    else pathsByNetwork.set(networkTypeId, [d]);
  }
  const allPaths = [...pathsByNetwork.values()].flat();
  let branchLengthSpreadMm = 0;
  for (const paths of pathsByNetwork.values()) {
    branchLengthSpreadMm = Math.max(branchLengthSpreadMm, Math.max(...paths) - Math.min(...paths));
  }

  return {
    lengthMm,
    lengthTrunkMm,
    lengthBranchMm,
    lengthRoomMm,
    segments: plan.stats.segments,
    fittings: plan.fittings.length,
    fittingsByKind,
    bends90: plan.stats.bends90,
    bends45: plan.stats.bends45,
    freeLegs: plan.stats.freeLegs,
    wallCrossings,
    openRuns,
    shaftCrossings,
    existingCrossings: plan.stats.existingCrossings,
    existingOverlaps: countOf('existing-overlap'),
    offGraphRooms: countOf('room-off-graph'),
    noEntryRooms: area.unreached.length,
    portsLeft: plan.stats.portsLeft,
    corridorShare: lengthMm > 0 ? lengthTrunkMm / lengthMm : 0,
    longestPathMm: allPaths.length > 0 ? Math.max(...allPaths) : 0,
    meanPathMm: allPaths.length > 0 ? allPaths.reduce((sum, d) => sum + d, 0) / allPaths.length : 0,
    branchLengthSpreadMm,
    freeLegsShare: lengthMm > 0 ? freeLengthMm / lengthMm : 0,
    bendsArea90,
    bendsArea45,
    bendsRoom90,
    bendsRoom45,
    bendsOutside,
    roomsWithBends: bentRooms.size,
    chainedRooms: chained.size,
    multiEntryRooms,
    diagonalLegs,
    longDiagonalLegs,
  };
}

/** The cost of each unit of a route metric. A lower score is a better route. */
export interface ScoreWeights {
  lengthPerMm: number; bend90: number; bend45: number; fitting: number; wallCrossing: number; openRun: number;
  offGraphRoom: number; existingCrossing: number; existingOverlap: number; freeLeg: number; spreadPerMm: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  lengthPerMm: 1, bend90: 500, bend45: 250, fitting: 300, wallCrossing: 0, openRun: 3000, offGraphRoom: 1500,
  existingCrossing: 1000, existingOverlap: 2000, freeLeg: 2000, spreadPerMm: 0.2,
};

/** The weighted sum of the metrics. Lower is better. */
export function scoreRoute(metrics: RouteMetrics, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): number {
  return (
    metrics.lengthMm * weights.lengthPerMm +
    metrics.bends90 * weights.bend90 +
    metrics.bends45 * weights.bend45 +
    metrics.fittings * weights.fitting +
    metrics.wallCrossings * weights.wallCrossing +
    metrics.openRuns * weights.openRun +
    metrics.offGraphRooms * weights.offGraphRoom +
    metrics.existingCrossings * weights.existingCrossing +
    metrics.existingOverlaps * weights.existingOverlap +
    metrics.freeLegs * weights.freeLeg +
    metrics.branchLengthSpreadMm * weights.spreadPerMm
  );
}
