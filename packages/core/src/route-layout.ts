import type { Vec2 } from './geometry.js';
import { resolveAngleSnap } from './angle-snap.js';
import { polygonContainsPoint, type Room } from './rooms/room.js';
import { distanceToRing } from './route-wall.js';
import { BEND_PENALTY_MM, CROSSING_PENALTY_MM } from './route-hanan.js';

export const ROUTE_ANGLE_INCREMENT_DEGREES = 45;
export const SMALL_JUMP_MM = 1000;
export type CornerMode = 'both' | 'right' | 'diagonal';
export interface RouteLayoutOptions {
  /** Cost of one turn in the room search, mm. Default BEND_PENALTY_MM. */
  bendPenaltyMm?: number;
  /** Cost of one crossing of an existing foreign segment in the room search, mm. Default CROSSING_PENALTY_MM. */
  crossingPenaltyMm?: number;
  /** Largest jump that uses a pair of 45 degree bends, mm. Default SMALL_JUMP_MM. 0 = no 45 degree jumps. */
  jogSmallJumpMm?: number;
  /** Which corners a leg may make: 'both' = 90 and 45 degrees, 'right' = 90 degrees only, 'diagonal' = 45 degrees (chamfer). Default 'both'. */
  corners?: CornerMode;
  /** Which entry of a room the trunk tries first. Default 'primary-longest'. */
  entryRule?: 'primary-longest' | 'shortest-branch';
  /** Which axis an off-graph link tries first. 'perpendicular' = the perpendicular axis of the tap, then the longer side (default); 'longer' = the longer side first. */
  offGraphAxis?: 'perpendicular' | 'longer';
  /** Idea 0: bridge edges between graph parts. Off when absent. */
  bridgeParts?: { penaltyMm: number };
  /** Idea 1a: trunk bends. Off when absent. */
  trunkBends?: { bendMm: number; fittingMm: number };
  /** Idea 1b: link search. Off when absent. */
  linkSearch?: { bendMm: number; wallMm: number };
  /** Idea 2: exact spine. Off when absent. */
  exactSpine?: { maxPorts: number };
  /** Idea 4: rip-up rounds. Off when absent. */
  ripUp?: { rounds: number };
  /** P1-T19a. Room feed. Off when absent. */
  roomBranches?: { searchMm: number; maxChainDepth?: number; slideRun?: boolean };
}
type PrototypeLayoutKey = 'bridgeParts' | 'trunkBends' | 'linkSearch' | 'exactSpine' | 'ripUp' | 'roomBranches';
export const DEFAULT_LAYOUT_OPTIONS: Readonly<Required<Omit<RouteLayoutOptions, PrototypeLayoutKey>>> = {
  bendPenaltyMm: BEND_PENALTY_MM,
  crossingPenaltyMm: CROSSING_PENALTY_MM,
  jogSmallJumpMm: SMALL_JUMP_MM,
  corners: 'both',
  entryRule: 'primary-longest',
  offGraphAxis: 'perpendicular',
};
export const MIN_LEG_MM = 300;
export const MIN_JOG_MM = 150;
export const MAX_DRIFT_MM = 300;
export type LegClass = 'axis' | 'diagonal' | 'free';

export function legClass(a: Vec2, b: Vec2): LegClass {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 'axis';
  const snapped = resolveAngleSnap(a, b, ROUTE_ANGLE_INCREMENT_DEGREES);
  if (Math.hypot(snapped.x - b.x, snapped.y - b.y) > 1e-6 * len) return 'free';
  return Math.min(Math.abs(dx), Math.abs(dy)) <= 1e-6 * len ? 'axis' : 'diagonal';
}

export function isLayoutPath(path: readonly Vec2[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const cls = legClass(path[i - 1]!, path[i]!);
    if (cls !== 'axis' && cls !== 'diagonal') return false;
  }
  return true;
}

export function jogPath(from: Vec2, to: Vec2): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return [from, to];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mx = (from.x + to.x) / 2;
    return [from, { x: mx, y: from.y }, { x: mx, y: to.y }, to];
  }
  const my = (from.y + to.y) / 2;
  return [from, { x: from.x, y: my }, { x: to.x, y: my }, to];
}

export function elbowPath(from: Vec2, to: Vec2, firstAxis: 'x' | 'y'): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return [from, to];
  if (firstAxis === 'x') return [from, { x: to.x, y: from.y }, to];
  return [from, { x: from.x, y: to.y }, to];
}

function zStep(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): { dir: Vec2; j: number; lenA: number; lenB: number } | null {
  const aDx = a1.x - a0.x;
  const aDy = a1.y - a0.y;
  const jDx = b0.x - a1.x;
  const jDy = b0.y - a1.y;
  const bDx = b1.x - b0.x;
  const bDy = b1.y - b0.y;
  if (
    aDy === 0 &&
    bDy === 0 &&
    jDx === 0 &&
    aDx !== 0 &&
    bDx !== 0 &&
    Math.sign(aDx) === Math.sign(bDx) &&
    jDy !== 0
  ) {
    return { dir: { x: Math.sign(aDx), y: 0 }, j: Math.abs(jDy), lenA: Math.abs(aDx), lenB: Math.abs(bDx) };
  }
  if (
    aDx === 0 &&
    bDx === 0 &&
    jDy === 0 &&
    aDy !== 0 &&
    bDy !== 0 &&
    Math.sign(aDy) === Math.sign(bDy) &&
    jDx !== 0
  ) {
    return { dir: { x: 0, y: Math.sign(aDy) }, j: Math.abs(jDx), lenA: Math.abs(aDy), lenB: Math.abs(bDy) };
  }
  return null;
}

export function applyJogRule(path: readonly Vec2[], smallJumpMm: number = SMALL_JUMP_MM): Vec2[] {
  const p = [...path];
  let i = 0;
  while (i + 3 < p.length) {
    const z = zStep(p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!);
    if (
      z &&
      z.j <= smallJumpMm &&
      z.lenA >= z.j / 2 + MIN_LEG_MM &&
      z.lenB >= z.j / 2 + MIN_LEG_MM
    ) {
      const h = z.j / 2;
      const p1 = p[i + 1]!;
      const p2 = p[i + 2]!;
      p[i + 1] = { x: p1.x - z.dir.x * h, y: p1.y - z.dir.y * h };
      p[i + 2] = { x: p2.x + z.dir.x * h, y: p2.y + z.dir.y * h };
      i += 2;
    } else {
      i += 1;
    }
  }
  return p;
}

export const REGION_TOL_MM = 150;
export const WALL_GAP_MM = 750;
export const ROUTE_SAMPLE_STEP_MM = 100;

/** Region test in millimetres. `rooms` are the route-area rooms in page points; mmPerPt converts. A point is inside when a polygon holds it or its boundary is within toleranceMm. */
export function insideRouteArea(
  rooms: readonly Pick<Room, 'polygon'>[],
  mmPerPt: number,
  toleranceMm = REGION_TOL_MM,
): (p: Vec2) => boolean {
  return (p) => {
    const pt = { x: p.x / mmPerPt, y: p.y / mmPerPt };
    return rooms.some(
      (room) =>
        polygonContainsPoint(room.polygon, pt) || distanceToRing(room.polygon, pt) * mmPerPt <= toleranceMm,
    );
  };
}

/** Adds the wall gaps of the link edges: a point within gapMm of any wall node also counts as inside. */
export function withWallGaps(
  inside: (p: Vec2) => boolean,
  wallNodesMm: readonly Vec2[],
  gapMm = WALL_GAP_MM,
): (p: Vec2) => boolean {
  return (p) => inside(p) || wallNodesMm.some((w) => Math.hypot(p.x - w.x, p.y - w.y) <= gapMm);
}

function copyVec(p: Vec2): Vec2 {
  return { x: p.x, y: p.y };
}

/** Walks the vertices. A free leg is drift-fixed or replaced by the points that jogLeg returns, which end at the next vertex. With replaceDiagonal a 45 degree leg is handled like a free leg. */
function walkPolyline(
  points: readonly Vec2[],
  jogLeg: (cur: Vec2, b: Vec2) => Vec2[],
  replaceDiagonal = false,
): Vec2[] {
  const out: Vec2[] = [copyVec(points[0]!)];
  let cur = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!;
    const cls = legClass(cur, b);
    if (cls !== 'free' && !(replaceDiagonal && cls === 'diagonal')) {
      out.push(copyVec(b));
      cur = b;
      continue;
    }
    const dx = b.x - cur.x;
    const dy = b.y - cur.y;
    const drift = Math.min(Math.abs(dx), Math.abs(dy));
    // The moved vertex shifts by the drift, below MIN_JOG_MM, so the MAX_DRIFT_MM test never fails.
    if (drift < MIN_JOG_MM && drift <= MAX_DRIFT_MM) {
      cur = Math.abs(dx) >= Math.abs(dy) ? { x: b.x, y: cur.y } : { x: cur.x, y: b.y };
      out.push(copyVec(cur));
    } else {
      for (const p of jogLeg(cur, b)) out.push(copyVec(p));
      cur = b;
    }
  }
  return out;
}

/** Drops a repeated vertex and a middle vertex of two collinear legs that run the same way. */
function joinLegs(path: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(copyVec(p));
    while (out.length >= 3) {
      const a = out[out.length - 3]!;
      const m = out[out.length - 2]!;
      const c = out[out.length - 1]!;
      const ux = m.x - a.x;
      const uy = m.y - a.y;
      const vx = c.x - m.x;
      const vy = c.y - m.y;
      const cross = ux * vy - uy * vx;
      const dot = ux * vx + uy * vy;
      if (Math.abs(cross) > 1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy) || dot <= 0) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** True when every sample on every leg of the path is inside the region. Samples are ROUTE_SAMPLE_STEP_MM apart at most. */
function legsInside(path: readonly Vec2[], insideRegion: (p: Vec2) => boolean): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / ROUTE_SAMPLE_STEP_MM));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!insideRegion({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
  }
  return true;
}

/** Straightens a corridor centre line into axis and 45 degree legs (axis only with corners 'right'). free is true when no such path stays inside the region; then the path is a copy of the input. */
export function straightenPolyline(
  points: readonly Vec2[],
  insideRegion: (p: Vec2) => boolean,
  corners?: CornerMode,
): { path: Vec2[]; free: boolean } {
  if (points.length < 2) return { path: points.map(copyVec), free: false };
  const right = corners === 'right';
  const jog = (cur: Vec2, b: Vec2): Vec2[] => applyJogRule(jogPath(cur, b), right ? 0 : undefined).slice(1);
  const shortJog = (cur: Vec2, b: Vec2): Vec2[] => {
    const dx = b.x - cur.x;
    const dy = b.y - cur.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) / 2 < MIN_LEG_MM) {
      return elbowPath(cur, b, Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y').slice(1);
    }
    return jog(cur, b);
  };
  const first = joinLegs(walkPolyline(points, shortJog, right));
  if (legsInside(first, insideRegion)) return { path: first, free: false };
  const second = joinLegs(
    walkPolyline(
      points,
      (cur, b) => {
        const alternatives = [jog(cur, b), elbowPath(cur, b, 'x').slice(1), elbowPath(cur, b, 'y').slice(1)];
        return alternatives.find((alt) => legsInside([cur, ...alt], insideRegion)) ?? alternatives[0]!;
      },
      right,
    ),
  );
  if (legsInside(second, insideRegion)) return { path: second, free: false };
  return { path: points.map(copyVec), free: true };
}
