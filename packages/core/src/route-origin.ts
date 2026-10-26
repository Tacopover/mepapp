// The origin split of a planned route: which stage of planRoute made each segment, fitting and bend. Read-only. Not exported from index.ts.

import type { Vec2 } from './geometry.js';
import type { Fitting, Segment } from './network.js';
import type { PlannedRoute, RouteLegOrigin, RouteTrace } from './route-build.js';

/** Lowest priority first. A fitting takes the origin of the highest priority. */
export const ORIGINS: readonly RouteLegOrigin[] = ['trunk', 'bridge', 'branch', 'spine', 'link'];

export interface OriginPart { lengthMm: number; segments: number; fittings: number; bends90: number; bends45: number; tees: number; crosses: number }
export interface OriginSplit { byOrigin: Record<RouteLegOrigin, OriginPart>; unassignedSegments: number; unassignedFittings: number }

const TOLERANCE_MM = 0.01;

function emptyPart(): OriginPart {
  return { lengthMm: 0, segments: 0, fittings: 0, bends90: 0, bends45: 0, tees: 0, crosses: 0 };
}

function toMm(p: Vec2, mmPerPt: number): Vec2 {
  return { x: p.x * mmPerPt, y: p.y * mmPerPt };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The parts of [lo, hi] that no interval of covered reaches. */
function uncoveredParts(lo: number, hi: number, covered: readonly [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[lo, hi]];
  for (const [a, b] of covered) {
    const next: [number, number][] = [];
    for (const [x, y] of pieces) {
      if (b <= x || a >= y) {
        next.push([x, y]);
        continue;
      }
      if (a > x) next.push([x, a]);
      if (b < y) next.push([b, y]);
    }
    pieces = next;
  }
  return pieces;
}

function legsOf(path: readonly Vec2[]): [Vec2, Vec2][] {
  const legs: [Vec2, Vec2][] = [];
  for (let i = 1; i < path.length; i++) legs.push([path[i - 1]!, path[i]!]);
  return legs;
}

/** The deflection (degrees) of an elbow fitting, computed as in route-topology.ts. Page points. Null when a neighbour is missing. */
function elbowDeflection(fitting: Fitting, segments: readonly Segment[], positionOf: ReadonlyMap<string, Vec2>): number | null {
  const ends: Vec2[] = [];
  for (const segment of segments) {
    const isA = segment.endpointA.kind === 'fitting' && segment.endpointA.fittingId === fitting.id;
    const other = isA ? segment.endpointB : segment.endpointA;
    if (other.kind === 'fitting') {
      const position = positionOf.get(other.fittingId);
      if (position) ends.push(position);
      continue;
    }
    const first = segment.geometry[0]!;
    const last = segment.geometry[segment.geometry.length - 1]!;
    ends.push(distance(first, fitting.position) >= distance(last, fitting.position) ? first : last);
  }
  if (ends.length < 2) return null;
  const v = fitting.position;
  const p1 = ends[0]!;
  const p2 = ends[1]!;
  const ux = v.x - p1.x;
  const uy = v.y - p1.y;
  const wx = p2.x - v.x;
  const wy = p2.y - v.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
}

export function splitByOrigin(plan: PlannedRoute, trace: RouteTrace, mmPerPt: number): OriginSplit {
  const byOrigin = {} as Record<RouteLegOrigin, OriginPart>;
  for (const origin of ORIGINS) byOrigin[origin] = emptyPart();
  let unassignedSegments = 0;
  let unassignedFittings = 0;

  for (const segment of plan.segments) {
    const first = toMm(segment.geometry[0]!, mmPerPt);
    const last = toMm(segment.geometry[segment.geometry.length - 1]!, mmPerPt);
    const length = distance(first, last);
    const dir = { x: (last.x - first.x) / length, y: (last.y - first.y) / length };
    const covered: [number, number][] = [];
    const coveredByOrigin = new Map<RouteLegOrigin, number>();
    for (const entry of trace.paths) {
      for (const [p, q] of legsOf(entry.path)) {
        const offsetP = Math.abs((p.x - first.x) * dir.y - (p.y - first.y) * dir.x);
        const offsetQ = Math.abs((q.x - first.x) * dir.y - (q.y - first.y) * dir.x);
        if (offsetP > TOLERANCE_MM || offsetQ > TOLERANCE_MM) continue;
        const along = (p.x - first.x) * dir.x + (p.y - first.y) * dir.y;
        const alongQ = (q.x - first.x) * dir.x + (q.y - first.y) * dir.y;
        const lo = Math.max(0, Math.min(along, alongQ));
        const hi = Math.min(length, Math.max(along, alongQ));
        if (hi <= lo) continue;
        for (const [a, b] of uncoveredParts(lo, hi, covered)) {
          covered.push([a, b]);
          byOrigin[entry.origin].lengthMm += b - a;
          coveredByOrigin.set(entry.origin, (coveredByOrigin.get(entry.origin) ?? 0) + (b - a));
        }
      }
    }
    let owner: RouteLegOrigin | null = null;
    let best = 0;
    for (const [origin, lengthMm] of coveredByOrigin) {
      if (lengthMm > best) {
        best = lengthMm;
        owner = origin;
      }
    }
    if (owner !== null) byOrigin[owner].segments++;
    const coveredMm = covered.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (length - coveredMm > TOLERANCE_MM) unassignedSegments++;
  }

  const positionOf = new Map(plan.fittings.map((fitting) => [fitting.id, fitting.position] as const));
  const adjacent = new Map<string, Segment[]>();
  for (const segment of plan.segments) {
    for (const end of [segment.endpointA, segment.endpointB]) {
      if (end.kind !== 'fitting') continue;
      const list = adjacent.get(end.fittingId) ?? [];
      list.push(segment);
      adjacent.set(end.fittingId, list);
    }
  }

  for (const fitting of plan.fittings) {
    const at = toMm(fitting.position, mmPerPt);
    let owner: RouteLegOrigin | null = null;
    let rank = -1;
    for (const entry of trace.paths) {
      if (!entry.path.some((vertex) => distance(vertex, at) <= TOLERANCE_MM)) continue;
      const priority = ORIGINS.indexOf(entry.origin);
      if (priority > rank) {
        rank = priority;
        owner = entry.origin;
      }
    }
    if (owner === null) {
      unassignedFittings++;
      continue;
    }
    const part = byOrigin[owner];
    part.fittings++;
    if (fitting.kind === 'tee') part.tees++;
    else if (fitting.kind === 'cross') part.crosses++;
    else if (fitting.kind === 'elbow') {
      const deflection = elbowDeflection(fitting, adjacent.get(fitting.id) ?? [], positionOf);
      if (deflection === null) continue;
      if (Math.abs(deflection - 90) <= 1) part.bends90++;
      else if (Math.abs(deflection - 45) <= 1) part.bends45++;
    }
  }

  return { byOrigin, unassignedSegments, unassignedFittings };
}
