import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';

export interface MainLine { id: string; a: Vec2; b: Vec2; bridge?: boolean; crossedRoomId?: string }   // axis aligned, a to b, a before b along the axis

export interface MainLineInput {
  /** Rings of the route-area rooms, mm. Shaft rooms (ids in shaftRoomIds) give no line. */
  areaRooms: readonly { roomId: string; ringMm: readonly Vec2[] }[];
  inside: (p: Vec2) => boolean;
  startMm: Vec2;
  /** Wanted distance of a line from the wall, mm (TwoLevelOptions.mainOffsetMm, default 1000). */
  offsetMm: number;
  blockers: readonly (readonly Vec2[])[];   // polylines of segments of other networks, mm
  shaftRoomIds: ReadonlySet<string>;
  ductWidthMm: number;                      // default 400 is the caller's job
  clearanceMm: number;                      // default 150 is the caller's job
}

export const MAIN_LINE_MIN_EDGE_MM = 2000;
export const MAIN_LINE_MERGE_MM = 200;

const AXIS_DELTA_MM = 400;
const AXIS_DELTA_RATIO = 0.02;
const WIDTH_STEP_MM = 500;
const CUT_STEP_MM = 100;
const BISECT_TOL_MM = 1;
const MIN_PIECE_MM = 500;
const START_REACH_MM = 100;
const DUCT_OVERLAP_MM = 500;
const RAY_EPS_MM = 1e-6;
const MAX_PASSES = 1000;

type Orient = 'h' | 'v';

interface Span { lo: number; hi: number }

interface Line extends Span { orient: Orient; coord: number; fromStart: boolean }

interface Seg { a: Vec2; b: Vec2 }

interface Ctx {
  inside: (p: Vec2) => boolean;
  blockers: readonly (readonly Vec2[])[];
  clearanceMm: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function axisOf(a: Vec2, b: Vec2): Orient | null {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx >= dy) return dy <= AXIS_DELTA_MM && dy <= AXIS_DELTA_RATIO * dx ? 'h' : null;
  return dx <= AXIS_DELTA_MM && dx <= AXIS_DELTA_RATIO * dy ? 'v' : null;
}

function shoelace(ring: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum;
}

function at(orient: Orient, coord: number, t: number): Vec2 {
  return orient === 'h' ? { x: t, y: coord } : { x: coord, y: t };
}

function pathDistance(p: Vec2, path: readonly Vec2[]): number {
  if (path.length === 1) return distance(p, path[0]!);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    best = Math.min(best, distance(p, closestPointOnSegment(p, path[i - 1]!, path[i]!).point));
  }
  return best;
}

function isFree(p: Vec2, ctx: Ctx): boolean {
  return ctx.inside(p) && ctx.blockers.every((path) => pathDistance(p, path) >= ctx.clearanceMm);
}

function refine(freeAt: number, blockedAt: number, isFreeAt: (t: number) => boolean): number {
  let good = freeAt;
  let other = blockedAt;
  while (Math.abs(other - good) > BISECT_TOL_MM) {
    const mid = (good + other) / 2;
    if (isFreeAt(mid)) good = mid;
    else other = mid;
  }
  return good;
}

function cutLine(orient: Orient, coord: number, fromStart: boolean, ctx: Ctx, keep: (piece: Span) => boolean): Line[] {
  const from = orient === 'h' ? ctx.minX : ctx.minY;
  const to = orient === 'h' ? ctx.maxX : ctx.maxY;
  const ts: number[] = [];
  for (let k = 0; from + k * CUT_STEP_MM < to; k++) ts.push(from + k * CUT_STEP_MM);
  ts.push(to);
  const isFreeAt = (t: number): boolean => isFree(at(orient, coord, t), ctx);
  const flags = ts.map(isFreeAt);
  const pieces: Span[] = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    const first = i;
    while (i + 1 < flags.length && flags[i + 1]) i++;
    const last = i;
    const lo = first > 0 ? refine(ts[first]!, ts[first - 1]!, isFreeAt) : ts[first]!;
    const hi = last < flags.length - 1 ? refine(ts[last]!, ts[last + 1]!, isFreeAt) : ts[last]!;
    pieces.push({ lo, hi });
  }
  return pieces
    .filter((piece) => keep(piece) && piece.hi - piece.lo >= MIN_PIECE_MM)
    .map((piece) => ({ orient, coord, fromStart, lo: piece.lo, hi: piece.hi }));
}

function overlaps(lo: number, hi: number): (piece: Span) => boolean {
  return (piece) => piece.hi > lo && piece.lo < hi;
}

function startKeep(s: number): (piece: Span) => boolean {
  return (piece) => piece.lo - START_REACH_MM <= s && s <= piece.hi + START_REACH_MM;
}

function rayDistance(p: Vec2, orient: Orient, sign: number, wall: Seg): number | null {
  const along = (q: Vec2): number => (orient === 'h' ? q.x : q.y);
  const across = (q: Vec2): number => (orient === 'h' ? q.y : q.x);
  const u0 = along(wall.a);
  const u1 = along(wall.b);
  if (u0 === u1) return null;
  const u = along(p);
  if (u < Math.min(u0, u1) || u > Math.max(u0, u1)) return null;
  const w = across(wall.a) + ((u - u0) * (across(wall.b) - across(wall.a))) / (u1 - u0);
  const d = (w - across(p)) * sign;
  return d > RAY_EPS_MM ? d : null;
}

function corridorWidth(orient: Orient, coord: number, lo: number, hi: number, sign: number, walls: readonly Seg[], edge: Seg): number | null {
  const n = Math.max(1, Math.round((hi - lo) / WIDTH_STEP_MM));
  const hits: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = at(orient, coord, lo + ((hi - lo) * (k + 0.5)) / n);
    let best = Infinity;
    for (const wall of walls) {
      if (wall === edge) continue;
      const d = rayDistance(p, orient, sign, wall);
      if (d !== null && d < best) best = d;
    }
    if (best < Infinity) hits.push(best);
  }
  if (hits.length === 0) return null;
  hits.sort((x, y) => x - y);
  const mid = hits.length >> 1;
  return hits.length % 2 ? hits[mid]! : (hits[mid - 1]! + hits[mid]!) / 2;
}

function sortLines(lines: readonly Line[]): Line[] {
  return [...lines].sort((p, q) =>
    (p.orient === q.orient ? 0 : p.orient === 'h' ? -1 : 1) ||
    p.coord - q.coord ||
    Number(p.fromStart) - Number(q.fromStart) ||
    p.lo - q.lo,
  );
}

function firstPair(lines: readonly Line[], test: (a: Line, b: Line) => boolean): [number, number] | null {
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (test(lines[i]!, lines[j]!)) return [i, j];
    }
  }
  return null;
}

function lineKey(l: Line): string {
  return `${l.orient}:${l.coord}:${l.lo}:${l.hi}:${Number(l.fromStart)}`;
}

function pairKey(a: Line, b: Line): string {
  return [lineKey(a), lineKey(b)].sort().join('|');
}

function mergeNear(lines: readonly Line[], ctx: Ctx): Line[] {
  let list = sortLines(lines);
  const rejected = new Set<string>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const pair = firstPair(list, (a, b) =>
      a.orient === b.orient &&
      Math.abs(a.coord - b.coord) <= MAIN_LINE_MERGE_MM &&
      Math.max(a.lo, b.lo) - Math.min(a.hi, b.hi) <= MAIN_LINE_MERGE_MM &&
      !rejected.has(pairKey(a, b)));
    if (!pair) break;
    const [i, j] = pair;
    const a = list[i]!;
    const b = list[j]!;
    const start = a.fromStart ? a : b.fromStart ? b : null;
    const longer = a.hi - a.lo >= b.hi - b.lo ? a : b;
    const coord = start ? start.coord : longer.coord;
    const fromStart = a.fromStart || b.fromStart;
    const pieces = cutLine(a.orient, coord, fromStart, ctx, overlaps(Math.min(a.lo, b.lo), Math.max(a.hi, b.hi)));
    if (pieces.length !== 1) {
      rejected.add(pairKey(a, b));
      continue;
    }
    list = sortLines([...list.filter((_, k) => k !== i && k !== j), ...pieces]);
  }
  return list;
}

function collapseDuctPairs(lines: readonly Line[], ctx: Ctx, ductWidthMm: number): Line[] {
  let list = sortLines(lines);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const pair = firstPair(list, (a, b) => {
      const gap = Math.abs(a.coord - b.coord);
      return a.orient === b.orient &&
        gap > MAIN_LINE_MERGE_MM &&
        gap < 2 * ductWidthMm &&
        Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) >= DUCT_OVERLAP_MM;
    });
    if (!pair) break;
    const [i, j] = pair;
    const a = list[i]!;
    const b = list[j]!;
    const rest = list.filter((_, k) => k !== i && k !== j);
    if (a.fromStart || b.fromStart) {
      const start = a.fromStart ? a : b;
      list = sortLines([...rest, start]);
      continue;
    }
    const lo = Math.min(a.lo, b.lo);
    const hi = Math.max(a.hi, b.hi);
    const replaced = cutLine(a.orient, (a.coord + b.coord) / 2, false, ctx, overlaps(lo, hi));
    list = sortLines([...rest, ...replaced]);
  }
  return list;
}

export function mainRunLines(input: MainLineInput): MainLine[] {
  const rings = [...input.areaRooms].sort((p, q) => (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0));
  const walls: Seg[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const room of rings) {
    room.ringMm.forEach((p, i) => {
      const q = room.ringMm[(i + 1) % room.ringMm.length]!;
      walls.push({ a: p, b: q });
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
  }
  if (walls.length === 0) return [];

  const ctx: Ctx = {
    inside: input.inside,
    blockers: input.blockers,
    clearanceMm: input.clearanceMm,
    minX,
    maxX,
    minY,
    maxY,
  };

  let lines: Line[] = [
    ...cutLine('h', input.startMm.y, true, ctx, startKeep(input.startMm.x)),
    ...cutLine('v', input.startMm.x, true, ctx, startKeep(input.startMm.y)),
  ];

  for (const room of rings) {
    if (input.shaftRoomIds.has(room.roomId)) continue;
    const ring = room.ringMm;
    const sign = Math.sign(shoelace(ring)) || 1;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const orient = axisOf(a, b);
      if (!orient || distance(a, b) < MAIN_LINE_MIN_EDGE_MM) continue;
      const coord = orient === 'h' ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
      const lo = orient === 'h' ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = orient === 'h' ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const normal = sign > 0 ? { x: -dy, y: dx } : { x: dy, y: -dx };
      const side = Math.sign(orient === 'h' ? normal.y : normal.x);
      const edge = walls.find((wall) => wall.a === a && wall.b === b)!;
      const width = corridorWidth(orient, coord, lo, hi, side, walls, edge);
      if (width === null) continue;
      const offset = Math.max(0, Math.min(input.offsetMm, width / 2 - input.ductWidthMm / 2));
      lines.push(...cutLine(orient, coord + side * offset, false, ctx, overlaps(lo, hi)));
    }
  }

  lines = mergeNear(collapseDuctPairs(mergeNear(lines, ctx), ctx, input.ductWidthMm), ctx);

  return sortLines(lines).map((line, i) => ({
    id: `ml-${i}`,
    a: at(line.orient, line.coord, line.lo),
    b: at(line.orient, line.coord, line.hi),
  }));
}
