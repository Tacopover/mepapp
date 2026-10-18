// The route planner, step 10 and step 12 (auto-routing-r6.md §4.3): checks against existing segments, the foreign check and the invariant. All geometry in mm.

import type { Vec2 } from './geometry.js';
import { computeNetworks, nodeKeyOf } from './network.js';
import type { ConnectionPoint, Fitting, Network, PortGroup, Segment } from './network.js';

export const NEAR_ITEM_MM = 50;
export const MIN_OVERLAP_MM = 300;

const CROSS_EPS_MM = 1e-6;
const LINE_EPS_MM = 1e-3;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canJoinPoint(
  graph: { segments: readonly Segment[]; fittings: readonly Fitting[]; portGroups: readonly PortGroup[] },
  point: ConnectionPoint,
  typeId: string,
  precomputed?: readonly Network[],
): { ok: true; sameTypeJoinIds: string[]; atNodeIds: string[] } | { ok: false; hits: string[] } {
  const portGroups = [...graph.portGroups];
  const key = nodeKeyOf(point, portGroups);
  const atNode = graph.segments.filter((segment) => nodeKeyOf(segment.endpointA, portGroups) === key || nodeKeyOf(segment.endpointB, portGroups) === key);
  const atNodeIds = new Set(atNode.map((segment) => segment.id));
  const reach = new Set(atNodeIds);
  const networks = precomputed ?? computeNetworks({ segments: [...graph.segments], fittings: [...graph.fittings], portGroups });
  for (const network of networks) {
    if (network.segmentIds.some((id) => atNodeIds.has(id))) for (const id of network.segmentIds) reach.add(id);
  }
  const typeById = new Map(graph.segments.map((segment) => [segment.id, segment.networkTypeId] as const));
  const hits = [...reach].filter((id) => typeById.get(id) !== typeId).sort(compareText);
  if (hits.length > 0) return { ok: false, hits };
  const inGroup = point.kind === 'port' && portGroups.some((group) => group.elementId === point.elementId && group.portIds.includes(point.portId) && group.portIds.length > 1);
  return { ok: true, sameTypeJoinIds: inGroup ? [...atNodeIds].sort(compareText) : [], atNodeIds: [...atNodeIds].sort(compareText) };
}

export interface ExistingCheckInput {
  newSegments: readonly Segment[]; newFittings: readonly Fitting[];
  existingSegments: readonly Segment[];     // the segments of OTHER networks (the caller removes the start network)
  existingFittings: readonly Fitting[];
  existingPortPoints: readonly Vec2[];      // page points of the ports that have a segment of another network (may be empty)
  mmPerPt: number;
}
export interface ExistingCheckResult { crossings: number; crossingPoints: Vec2[]; overlaps: number; overlapIds: string[]; lane: number; laneIds: string[]; nearItems: number; nearPoints: Vec2[] }

interface PieceHit { crossing: Vec2 | null; overlapMm: number }

function toMm(p: Vec2, mmPerPt: number): Vec2 {
  return { x: p.x * mmPerPt, y: p.y * mmPerPt };
}

/** Compares two pieces (mm). A crossing is a single interior point of both. An overlap is the length of the collinear shared part. */
function comparePieces(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): PieceHit {
  const rx = a1.x - a0.x;
  const ry = a1.y - a0.y;
  const sx = b1.x - b0.x;
  const sy = b1.y - b0.y;
  const lenA = Math.hypot(rx, ry);
  const lenB = Math.hypot(sx, sy);
  if (lenA <= CROSS_EPS_MM || lenB <= CROSS_EPS_MM) return { crossing: null, overlapMm: 0 };
  const denom = rx * sy - ry * sx;
  const qx = b0.x - a0.x;
  const qy = b0.y - a0.y;
  if (Math.abs(denom) <= 1e-9 * lenA * lenB) {
    const dx = rx / lenA;
    const dy = ry / lenA;
    const off0 = Math.abs(qx * dy - qy * dx);
    const off1 = Math.abs((b1.x - a0.x) * dy - (b1.y - a0.y) * dx);
    if (off0 > LINE_EPS_MM || off1 > LINE_EPS_MM) return { crossing: null, overlapMm: 0 };
    const s0 = qx * dx + qy * dy;
    const s1 = (b1.x - a0.x) * dx + (b1.y - a0.y) * dy;
    const overlap = Math.min(lenA, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1));
    return { crossing: null, overlapMm: Math.max(0, overlap) };
  }
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t * lenA <= CROSS_EPS_MM || (1 - t) * lenA <= CROSS_EPS_MM || u * lenB <= CROSS_EPS_MM || (1 - u) * lenB <= CROSS_EPS_MM) return { crossing: null, overlapMm: 0 };
  return { crossing: { x: a0.x + t * rx, y: a0.y + t * ry }, overlapMm: 0 };
}

function polylineMm(segment: Segment, mmPerPt: number): Vec2[] {
  return segment.geometry.map((p) => toMm(p, mmPerPt));
}

export function checkExisting(input: ExistingCheckInput): ExistingCheckResult {
  const { mmPerPt } = input;
  const existing = input.existingSegments.map((segment) => ({ segment, line: polylineMm(segment, mmPerPt) }));
  const crossingPoints: Vec2[] = [];
  const overlapIds = new Set<string>();
  const laneIds = new Set<string>();

  for (const added of input.newSegments) {
    const newLine = polylineMm(added, mmPerPt);
    for (const other of existing) {
      let crossing: Vec2 | null = null;
      for (let i = 1; i < newLine.length; i++) {
        for (let j = 1; j < other.line.length; j++) {
          const hit = comparePieces(newLine[i - 1]!, newLine[i]!, other.line[j - 1]!, other.line[j]!);
          if (hit.crossing && !crossing) crossing = hit.crossing;
          if (hit.overlapMm > MIN_OVERLAP_MM) (other.segment.routedBy ? laneIds : overlapIds).add(other.segment.id);
        }
      }
      if (crossing) crossingPoints.push({ x: crossing.x / mmPerPt, y: crossing.y / mmPerPt });
    }
  }

  const foreignPoints: Vec2[] = [...input.existingFittings.map((fitting) => fitting.position), ...input.existingPortPoints].map((p) => toMm(p, mmPerPt));
  const candidates: Vec2[] = input.newFittings.map((fitting) => fitting.position);
  for (const added of input.newSegments) {
    if (added.endpointA.kind === 'port' && added.geometry.length > 0) candidates.push(added.geometry[0]!);
    if (added.endpointB.kind === 'port' && added.geometry.length > 0) candidates.push(added.geometry[added.geometry.length - 1]!);
  }
  const nearPoints: Vec2[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.x * 1e6)},${Math.round(candidate.y * 1e6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mm = toMm(candidate, mmPerPt);
    if (foreignPoints.some((p) => Math.hypot(p.x - mm.x, p.y - mm.y) <= NEAR_ITEM_MM)) nearPoints.push({ x: candidate.x, y: candidate.y });
  }

  return {
    crossings: crossingPoints.length,
    crossingPoints,
    overlaps: overlapIds.size,
    overlapIds: [...overlapIds].sort(compareText),
    lane: laneIds.size,
    laneIds: [...laneIds].sort(compareText),
    nearItems: nearPoints.length,
    nearPoints,
  };
}

export function makeCrossesExisting(existingSegments: readonly Segment[], mmPerPt: number): (a: Vec2, b: Vec2) => number {
  const lines = existingSegments.map((segment) => polylineMm(segment, mmPerPt));
  return (a, b) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) <= CROSS_EPS_MM) return 0;
    let count = 0;
    for (const line of lines) {
      for (let j = 1; j < line.length; j++) {
        if (comparePieces(a, b, line[j - 1]!, line[j]!).crossing) {
          count++;
          break;
        }
      }
    }
    return count;
  };
}

/** The distance in mm from a point to a piece. */
export function distanceToPiece(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 <= 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface InvariantInput {
  reducedSegments: readonly Segment[]; reducedFittings: readonly Fitting[];
  newSegments: readonly Segment[]; newFittings: readonly Fitting[];
  portGroups: readonly PortGroup[];
  networkTypeId: string;
  /** Segment ids of old networks that may grow: the start network and the networks of a same-type join through a port group. */
  growableSegmentIds: readonly string[];
}

/** Step 12. Returns the sorted ids that break the invariant. Empty = the invariant holds. */
export function checkInvariant(input: InvariantInput): string[] {
  const portGroups = [...input.portGroups];
  const oldNetworks = computeNetworks({ segments: [...input.reducedSegments], fittings: [...input.reducedFittings], portGroups });
  const newNetworks = computeNetworks({ segments: [...input.reducedSegments, ...input.newSegments], fittings: [...input.reducedFittings, ...input.newFittings], portGroups });
  const newIds = new Set(input.newSegments.map((segment) => segment.id));
  const typeById = new Map([...input.reducedSegments, ...input.newSegments].map((segment) => [segment.id, segment.networkTypeId] as const));
  const growable = new Set(input.growableSegmentIds);
  const broken = new Set<string>();

  for (const network of newNetworks) {
    if (!network.segmentIds.some((id) => newIds.has(id))) continue;
    for (const id of network.segmentIds) if (typeById.get(id) !== input.networkTypeId) broken.add(id);
  }

  const newBySegment = new Map<string, Set<string>>();
  for (const network of newNetworks) {
    const ids = new Set(network.segmentIds);
    for (const id of network.segmentIds) newBySegment.set(id, ids);
  }
  for (const network of oldNetworks) {
    if (network.segmentIds.some((id) => growable.has(id))) continue;
    const after = newBySegment.get(network.segmentIds[0]!);
    const before = new Set(network.segmentIds);
    if (!after) {
      for (const id of before) broken.add(id);
      continue;
    }
    for (const id of after) if (!before.has(id)) broken.add(id);
    for (const id of before) if (!after.has(id)) broken.add(id);
  }
  return [...broken].sort(compareText);
}
