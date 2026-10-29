import type { Vec2 } from './geometry.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { MIN_LEG_MM } from './route-layout.js';
import { placeTapPosition } from './route-branch.js';
import type { EntryCandidate } from './route-room-entry.js';

export interface ReachCarrier { id: string; a: Vec2; b: Vec2; freeA?: boolean; freeB?: boolean }   // axis leg; a equal to b is a junction point; freeA / freeB = no other carrier touches that end
export interface PlacedTapAt { carrierId: string; sMm: number }  // sMm = distance from carrier.a along the leg
export interface RoomReach { entry: EntryCandidate; carrierId: string; tapMm: Vec2; branch: Vec2[]; costMm: number }   // branch = tap to entry
export const DEFAULT_WALL_MM = 3000;

const EPS = 1e-6;
const ALIGN_TOL_MM = 1;

type CarrierKind = 'horizontal' | 'vertical' | 'junction';

interface Reach extends RoomReach { sMm: number; variant: number }

const SOURCE_RANK: Record<EntryCandidate['source'], number> = { 'area-entry': 0, ring: 1, 'port-line': 2 };

const dist = (p: Vec2, q: Vec2): number => Math.hypot(q.x - p.x, q.y - p.y);

function cleanPath(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > EPS) out.push({ x: p.x, y: p.y });
  }
  return out;
}

function unitOf(from: Vec2, to: Vec2): Vec2 {
  const len = dist(from, to);
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= EPS * EPS) return dist(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function pathVariants(tap: Vec2, entry: EntryCandidate, kind: CarrierKind): Vec2[][] {
  const e = entry.pointMm;
  if (Math.abs(tap.x - e.x) <= ALIGN_TOL_MM || Math.abs(tap.y - e.y) <= ALIGN_TOL_MM) return [cleanPath([tap, e])];
  const horizontalFirst = cleanPath([tap, { x: e.x, y: tap.y }, e]);
  const verticalFirst = cleanPath([tap, { x: tap.x, y: e.y }, e]);
  if (kind === 'vertical') return [verticalFirst, horizontalFirst];
  return [horizontalFirst, verticalFirst];
}

function pathLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
}

function bendCount(path: readonly Vec2[]): number {
  let bends = 0;
  let prev: Vec2 | null = null;
  for (let i = 1; i < path.length; i++) {
    const u = unitOf(path[i - 1]!, path[i]!);
    if (prev && (Math.abs(u.x - prev.x) > EPS || Math.abs(u.y - prev.y) > EPS)) bends++;
    prev = u;
  }
  return bends;
}

function entryBend(path: readonly Vec2[], entry: EntryCandidate): number {
  const u = unitOf(path[path.length - 2]!, path[path.length - 1]!);
  return Math.abs(u.x * entry.outward.y - u.y * entry.outward.x) > EPS ? 1 : 0;
}

function portPenalty(path: readonly Vec2[], entry: EntryCandidate, portsMm: readonly Vec2[], bendMm: number): number {
  const last = unitOf(path[path.length - 2]!, path[path.length - 1]!);
  let penalty = 0;
  for (const p of portsMm) {
    const off = Math.abs((p.x - entry.pointMm.x) * last.y - (p.y - entry.pointMm.y) * last.x);
    if (off > ALIGN_TOL_MM) penalty += 0.5 * bendMm;
  }
  return penalty;
}

function beats(p: Reach, q: Reach | null): boolean {
  if (!q) return true;
  if (Math.abs(p.costMm - q.costMm) > EPS) return p.costMm < q.costMm;
  const pReal = p.entry.source === 'area-entry' ? 0 : 1;
  const qReal = q.entry.source === 'area-entry' ? 0 : 1;
  if (pReal !== qReal) return pReal < qReal;
  if (p.entry.pointMm.x !== q.entry.pointMm.x) return p.entry.pointMm.x < q.entry.pointMm.x;
  if (p.entry.pointMm.y !== q.entry.pointMm.y) return p.entry.pointMm.y < q.entry.pointMm.y;
  if (p.entry.outward.x !== q.entry.outward.x) return p.entry.outward.x < q.entry.outward.x;
  if (p.entry.outward.y !== q.entry.outward.y) return p.entry.outward.y < q.entry.outward.y;
  if (SOURCE_RANK[p.entry.source] !== SOURCE_RANK[q.entry.source]) return SOURCE_RANK[p.entry.source] < SOURCE_RANK[q.entry.source];
  if (p.carrierId !== q.carrierId) return p.carrierId < q.carrierId;
  if (p.sMm !== q.sMm) return p.sMm < q.sMm;
  return p.variant < q.variant;
}

export function bestRoomReach(input: {
  candidates: readonly EntryCandidate[];
  carriers: readonly ReachCarrier[];
  placedTaps: readonly PlacedTapAt[];
  pathOk: (path: readonly Vec2[], carrierId: string, entry: EntryCandidate) => boolean;
  bendMm?: number;          // default BEND_PENALTY_MM
  searchMm: number;
  portsMm: readonly Vec2[];
  wallMm?: number;          // default DEFAULT_WALL_MM
  roomPenaltyMm?: number;   // default 0
  pathPenaltyMm?: (path: readonly Vec2[], carrierId: string, entry: EntryCandidate) => number;   // default 0, added after pathOk
  extraCostMm?: (reach: RoomReach) => number;   // >= 0, called only for a pair that passed pathOk; when given, the half-bend portPenalty proxy is NOT added
  tapAtFreeEnd?: boolean;   // default false; a tap may sit at a free end of a carrier (s = 0 or len)
}): RoomReach | null {
  const bendMm = input.bendMm ?? BEND_PENALTY_MM;
  const wallMm = input.wallMm ?? DEFAULT_WALL_MM;
  const roomPenaltyMm = input.roomPenaltyMm ?? 0;
  const pathPenaltyMm = input.pathPenaltyMm ?? (() => 0);
  const pairs: Reach[] = [];
  for (const carrier of input.carriers) {
    const dx = carrier.b.x - carrier.a.x;
    const dy = carrier.b.y - carrier.a.y;
    const isPoint = Math.abs(dx) <= EPS && Math.abs(dy) <= EPS;
    if (!isPoint && Math.abs(dx) > EPS && Math.abs(dy) > EPS) continue;
    const kind: CarrierKind = isPoint ? 'junction' : Math.abs(dy) <= Math.abs(dx) ? 'horizontal' : 'vertical';
    const len = Math.hypot(dx, dy);
    const blockers = input.placedTaps.filter((t) => t.carrierId === carrier.id).map((t) => t.sMm);
    for (const entry of input.candidates) {
      if (segmentDistance(entry.pointMm, carrier.a, carrier.b) > input.searchMm) continue;
      let sMm = 0;
      if (kind !== 'junction') {
        const sign = kind === 'horizontal' ? Math.sign(dx) : Math.sign(dy);
        const along = kind === 'horizontal' ? (entry.pointMm.x - carrier.a.x) * sign : (entry.pointMm.y - carrier.a.y) * sign;
        if (input.tapAtFreeEnd && carrier.freeB && along >= len - ALIGN_TOL_MM) sMm = len;
        else if (input.tapAtFreeEnd && carrier.freeA && along <= ALIGN_TOL_MM) sMm = 0;
        else sMm = placeTapPosition(len, Math.min(Math.max(along, 0), len), blockers, MIN_LEG_MM);
        if (blockers.some((b) => Math.abs(b - sMm) < MIN_LEG_MM - EPS)) continue;
      }
      const tap: Vec2 =
        kind === 'junction' ? { x: carrier.a.x, y: carrier.a.y }
        : kind === 'horizontal' ? { x: carrier.a.x + Math.sign(dx) * sMm, y: carrier.a.y }
        : { x: carrier.a.x, y: carrier.a.y + Math.sign(dy) * sMm };
      for (const [variant, path] of pathVariants(tap, entry, kind).entries()) {
        if (path.length < 2) continue;
        const costMm =
          pathLength(path) + bendCount(path) * bendMm + entryBend(path, entry) * bendMm + (entry.source === 'area-entry' ? 0 : wallMm)
          + roomPenaltyMm + (input.extraCostMm ? 0 : portPenalty(path, entry, input.portsMm, bendMm)) + pathPenaltyMm(path, carrier.id, entry);
        pairs.push({ entry, carrierId: carrier.id, tapMm: tap, branch: path, costMm, sMm, variant });
      }
    }
  }
  pairs.sort((p, q) => (beats(p, q) ? -1 : beats(q, p) ? 1 : 0));
  let best: Reach | null = null;
  for (const pair of pairs) {
    if (best && pair.costMm > best.costMm + EPS) break;
    if (!input.pathOk(pair.branch, pair.carrierId, pair.entry)) continue;
    const total: Reach = input.extraCostMm ? { ...pair, costMm: pair.costMm + input.extraCostMm(pair) } : pair;
    if (beats(total, best)) best = total;
    if (!input.extraCostMm) break;
  }
  if (!best) return null;
  const won: Reach = best;
  return { entry: won.entry, carrierId: won.carrierId, tapMm: won.tapMm, branch: won.branch, costMm: won.costMm };
}
