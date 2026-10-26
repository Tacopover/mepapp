import type { Vec2 } from './geometry.js';
import { exactRoomSpine, spineScore } from './route-exact.js';
import { BEND_PENALTY_MM, roomSpine, type SpineInput, type SpineResult } from './route-hanan.js';
import { applyJogRule, elbowPath, jogPath, legClass, MIN_LEG_MM, type LegClass, type RouteLayoutOptions } from './route-layout.js';

export interface BranchTrunkEdge {
  id: string;
  path: readonly Vec2[];
}

export interface BranchRoomInput {
  roomId: string;
  /** E: the wall point of the entry, mm. */
  entryPointMm: Vec2;
  /** The target ports of the room, mm. */
  ports: readonly { id: string; point: Vec2 }[];
  /** The region test of the room in mm (tolerant at the wall). */
  inside: (p: Vec2) => boolean;
}

export interface BranchInput {
  trunk: readonly BranchTrunkEdge[];
  /** The tap when the trunk has no leg (the root point). */
  rootPointMm: Vec2;
  rooms: readonly BranchRoomInput[];
  crossesExisting?: (a: Vec2, b: Vec2) => number;
  stepMm?: number;
  /** The region test of the route-area rooms in mm (tolerant at the wall). Off when absent. */
  insideCorridor?: (p: Vec2) => boolean;
  /** Layout options, passed on by planRoute. This step reads exactSpine. */
  options?: RouteLayoutOptions;
}

export interface RoomBranch {
  roomId: string;
  /** T. */
  tapMm: Vec2;
  /** The trunk edge of the tap, null when the trunk has no leg. */
  tapEdgeId: string | null;
  /** From T to E. */
  branch: Vec2[];
  /** Unit axis vector of the last leg of the branch (into the room). */
  entryDir: Vec2;
  /** The paths of roomSpine (root = E). */
  spine: Vec2[][];
  /** Ports that the spine cannot reach. T12 joins them with the off-graph connection (free orthogonal connection with warnings, Q-R6-04 A). */
  offGraphPortIds: string[];
  /** Length of the branch (real length) plus the length of the spine. */
  lengthMm: number;
}

interface Leg {
  edgeId: string;
  index: number;
  a: Vec2;
  b: Vec2;
  cls: LegClass;
}

interface PlacedTap {
  edgeId: string;
  index: number;
  s: number;
}

const EPS = 1e-9;
const SAME_LINE_TOL = 1e-6;
const SCORE_TOL = 1e-6;
const REACH_EXTRA_MM = 2000;
const REACH_MAX_EXTRA = 4;
const REACH_SAMPLE_MM = 100;

interface ReachCandidate {
  tapMm: Vec2;
  tapLeg: Leg | null;
  s: number;
  branch: Vec2[];
}

function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { point, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

function nearestLeg(legs: readonly Leg[], e: Vec2): Leg | null {
  let best: Leg | null = null;
  let bestDistance = Infinity;
  for (const leg of legs) {
    const d = nearestOnSegment(e, leg.a, leg.b).distance;
    if (d < bestDistance) {
      best = leg;
      bestDistance = d;
    }
  }
  return best;
}

function collectLegs(trunk: readonly BranchTrunkEdge[]): Leg[] {
  const legs: Leg[] = [];
  for (const edge of trunk) {
    for (let i = 1; i < edge.path.length; i++) {
      const a = edge.path[i - 1]!;
      const b = edge.path[i]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue;
      legs.push({ edgeId: edge.id, index: i - 1, a, b, cls: legClass(a, b) });
    }
  }
  return legs;
}

function legLength(leg: Leg): number {
  return Math.hypot(leg.b.x - leg.a.x, leg.b.y - leg.a.y);
}

function pointAt(leg: Leg, s: number): Vec2 {
  const len = legLength(leg);
  const t = s / len;
  return { x: leg.a.x + (leg.b.x - leg.a.x) * t, y: leg.a.y + (leg.b.y - leg.a.y) * t };
}

/** Position along a leg of length len (0..len) for a tap that wants `preferred`. Keeps minGap from every blocker and from both ends when len >= 2*minGap. */
export function placeTapPosition(len: number, preferred: number, blockers: readonly number[], minGap: number): number {
  if (len < 2 * minGap) return preferred <= len / 2 ? 0 : len;
  const clamped = Math.min(Math.max(preferred, minGap), len - minGap);
  const candidates = [clamped];
  for (const b of blockers) candidates.push(b + minGap, b - minGap);
  let best = clamped;
  let bestDistance = Infinity;
  let found = false;
  for (const c of candidates) {
    if (c < minGap - EPS || c > len - minGap + EPS) continue;
    if (blockers.some((b) => Math.abs(c - b) < minGap - EPS)) continue;
    const d = Math.abs(c - clamped);
    if (!found || d < bestDistance - EPS || (Math.abs(d - bestDistance) <= EPS && c > best)) {
      best = c;
      bestDistance = d;
      found = true;
    }
  }
  return found ? best : clamped;
}

function placeOnAxisLeg(leg: Leg, e: Vec2, placed: readonly PlacedTap[]): number {
  const len = legLength(leg);
  const horizontal = Math.abs(leg.b.y - leg.a.y) <= Math.abs(leg.b.x - leg.a.x);
  const sign = horizontal ? Math.sign(leg.b.x - leg.a.x) : Math.sign(leg.b.y - leg.a.y);
  let s = horizontal ? (e.x - leg.a.x) * sign : (e.y - leg.a.y) * sign;
  s = Math.min(Math.max(s, 0), len);
  const blockers = placed.filter((tap) => tap.edgeId === leg.edgeId && tap.index === leg.index).map((tap) => tap.s);
  return placeTapPosition(len, s, blockers, MIN_LEG_MM);
}

function unitDirOf(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy >= 0 ? 1 : -1 };
}

function pathLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return total;
}

function branchPath(t: Vec2, e: Vec2, tapLeg: Leg | null): Vec2[] {
  if (Math.abs(t.x - e.x) <= SAME_LINE_TOL || Math.abs(t.y - e.y) <= SAME_LINE_TOL) {
    return [{ x: t.x, y: t.y }, { x: e.x, y: e.y }];
  }
  let p = jogPath(t, e);
  if (tapLeg && tapLeg.cls === 'axis') {
    const horizontalLeg = Math.abs(tapLeg.b.y - tapLeg.a.y) <= Math.abs(tapLeg.b.x - tapLeg.a.x);
    const first = p[0]!;
    const second = p[1]!;
    const firstHorizontal = first.y === second.y;
    if (horizontalLeg === firstHorizontal) {
      p = elbowPath(t, e, horizontalLeg ? 'y' : 'x');
    }
  }
  return applyJogRule(p).map((q) => ({ x: q.x, y: q.y }));
}

function lastDir(path: readonly Vec2[]): Vec2 | null {
  for (let i = path.length - 1; i >= 1; i--) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) > EPS) return unitDirOf(a, b);
  }
  return null;
}

function nearestTapLeg(legs: readonly Leg[], e: Vec2): Leg {
  const leg = nearestLeg(legs, e)!;
  if (leg.cls !== 'diagonal') return leg;
  const sameEdge = legs.filter((l) => l.edgeId === leg.edgeId && l.cls === 'axis');
  return nearestLeg(sameEdge, e) ?? nearestLeg(legs.filter((l) => l.cls === 'axis'), e) ?? leg;
}

function reachCandidate(leg: Leg, e: Vec2, placed: readonly PlacedTap[]): ReachCandidate {
  const s = leg.cls === 'axis' ? placeOnAxisLeg(leg, e, placed) : 0;
  const tapMm = leg.cls === 'axis' ? pointAt(leg, s) : nearestOnSegment(e, leg.a, leg.b).point;
  return { tapMm, tapLeg: leg, s, branch: branchPath(tapMm, e, leg) };
}

function branchInside(branch: readonly Vec2[], inside: (p: Vec2) => boolean): boolean {
  for (let i = 1; i < branch.length; i++) {
    const a = branch[i - 1]!;
    const b = branch[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / REACH_SAMPLE_MM));
    for (let k = 0; k <= n; k++) {
      if (!inside({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })) return false;
    }
  }
  return true;
}

function branchBendCost(branch: readonly Vec2[], bendMm: number): number {
  let cost = 0;
  for (let i = 1; i < branch.length - 1; i++) {
    const a = branch[i - 1]!;
    const b = branch[i]!;
    const c = branch[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 <= EPS || l2 <= EPS) continue;
    const cos = Math.min(1, Math.max(-1, ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2)));
    const angle = (Math.acos(cos) * 180) / Math.PI;
    if (angle >= 67.5) cost += bendMm;
    else if (angle >= 22.5) cost += bendMm / 2;
  }
  return cost;
}

function planReachRoom(
  room: BranchRoomInput,
  legs: readonly Leg[],
  input: BranchInput,
  placed: PlacedTap[],
  crossesExisting: (a: Vec2, b: Vec2) => number,
  maxPorts: number,
): RoomBranch {
  const e = room.entryPointMm;
  const candidates: ReachCandidate[] = [];
  if (legs.length === 0) {
    const root = { x: input.rootPointMm.x, y: input.rootPointMm.y };
    candidates.push({ tapMm: root, tapLeg: null, s: 0, branch: branchPath(root, e, null) });
  } else {
    const first = nearestTapLeg(legs, e);
    candidates.push(reachCandidate(first, e, placed));
    const inside = input.insideCorridor;
    if (inside) {
      const limit = nearestOnSegment(e, first.a, first.b).distance + REACH_EXTRA_MM;
      const extras = legs
        .filter((leg) => leg !== first && leg.cls === 'axis')
        .map((leg) => ({ leg, distance: nearestOnSegment(e, leg.a, leg.b).distance }))
        .filter((x) => x.distance <= limit)
        .sort((x, y) => x.distance - y.distance)
        .slice(0, REACH_MAX_EXTRA);
      for (const { leg } of extras) {
        const candidate = reachCandidate(leg, e, placed);
        if (branchInside(candidate.branch, inside)) candidates.push(candidate);
      }
    }
  }

  const spineCache = new Map<string, SpineResult>();
  const spineOf = (entryDir: Vec2): SpineResult => {
    if (room.ports.length === 0) return { paths: [], unreachedPortIds: [], lengthMm: 0 };
    const key = `${entryDir.x},${entryDir.y}`;
    let spine = spineCache.get(key);
    if (!spine) {
      const spineInput: SpineInput = {
        root: e,
        entryDir,
        ports: room.ports,
        inside: room.inside,
        crossesExisting,
        ...(input.stepMm !== undefined ? { stepMm: input.stepMm } : {}),
      };
      spine = room.ports.length <= maxPorts ? exactRoomSpine(spineInput) : roomSpine(spineInput);
      spineCache.set(key, spine);
    }
    return spine;
  };
  const entryOf = (branch: readonly Vec2[]): Vec2 =>
    lastDir(branch) ?? (room.ports.length > 0 ? unitDirOf(e, room.ports[0]!.point) : { x: 0, y: 1 });

  let best = 0;
  let bestScore = Infinity;
  candidates.forEach((candidate, i) => {
    const entryDir = entryOf(candidate.branch);
    const spine = spineOf(entryDir);
    const score =
      pathLength(candidate.branch) +
      branchBendCost(candidate.branch, BEND_PENALTY_MM) +
      spineScore(spine.paths, spine.lengthMm, { root: e, entryDir, crossesExisting });
    if (i === 0 || score < bestScore - SCORE_TOL) {
      best = i;
      bestScore = score;
    }
  });

  const chosen = candidates[best]!;
  if (chosen.tapLeg && chosen.tapLeg.cls === 'axis') {
    placed.push({ edgeId: chosen.tapLeg.edgeId, index: chosen.tapLeg.index, s: chosen.s });
  }
  const entryDir = entryOf(chosen.branch);
  const spine = spineOf(entryDir);
  return {
    roomId: room.roomId,
    tapMm: chosen.tapMm,
    tapEdgeId: chosen.tapLeg ? chosen.tapLeg.edgeId : null,
    branch: chosen.branch,
    entryDir,
    spine: spine.paths,
    offGraphPortIds: spine.unreachedPortIds,
    lengthMm: pathLength(chosen.branch) + spine.lengthMm,
  };
}

export function planBranches(input: BranchInput): { rooms: RoomBranch[] } {
  const legs = collectLegs(input.trunk);
  const crossesExisting = input.crossesExisting ?? (() => 0);
  const rooms = [...input.rooms].sort((a, b) => (a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0));
  const placed: PlacedTap[] = [];
  const result: RoomBranch[] = [];
  const exactSpine = input.options?.exactSpine;

  for (const room of rooms) {
    if (exactSpine) {
      result.push(planReachRoom(room, legs, input, placed, crossesExisting, exactSpine.maxPorts));
      continue;
    }
    const e = room.entryPointMm;
    let tapMm: Vec2;
    let tapEdgeId: string | null = null;
    let tapLeg: Leg | null = null;

    if (legs.length === 0) {
      tapMm = { x: input.rootPointMm.x, y: input.rootPointMm.y };
    } else {
      let leg = nearestLeg(legs, e)!;
      if (leg.cls === 'diagonal') {
        const sameEdge = legs.filter((l) => l.edgeId === leg.edgeId && l.cls === 'axis');
        const axisLeg = nearestLeg(sameEdge, e) ?? nearestLeg(legs.filter((l) => l.cls === 'axis'), e);
        if (axisLeg) leg = axisLeg;
      }
      tapLeg = leg;
      tapEdgeId = leg.edgeId;
      if (leg.cls === 'axis') {
        const s = placeOnAxisLeg(leg, e, placed);
        placed.push({ edgeId: leg.edgeId, index: leg.index, s });
        tapMm = pointAt(leg, s);
      } else {
        tapMm = nearestOnSegment(e, leg.a, leg.b).point;
      }
    }

    const branch = branchPath(tapMm, e, tapLeg);
    const entryDir = lastDir(branch) ?? (room.ports.length > 0 ? unitDirOf(e, room.ports[0]!.point) : { x: 0, y: 1 });

    let spine: Vec2[][] = [];
    let offGraphPortIds: string[] = [];
    let spineLength = 0;
    if (room.ports.length > 0) {
      const spineResult = roomSpine({
        root: e,
        entryDir,
        ports: room.ports,
        inside: room.inside,
        crossesExisting,
        ...(input.stepMm !== undefined ? { stepMm: input.stepMm } : {}),
      });
      spine = spineResult.paths;
      offGraphPortIds = spineResult.unreachedPortIds;
      spineLength = spineResult.lengthMm;
    }

    result.push({
      roomId: room.roomId,
      tapMm,
      tapEdgeId,
      branch,
      entryDir,
      spine,
      offGraphPortIds,
      lengthMm: pathLength(branch) + spineLength,
    });
  }

  return { rooms: result };
}
