import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import { steinerTreeWithTurns, type SteinerTurnEdge, type SteinerTurnGraph } from './route-steiner.js';

export interface MainLine { id: string; a: Vec2; b: Vec2; bridge?: boolean; crossedRoomId?: string; crossedRoomIds?: string[] }   // axis aligned, a to b, a before b along the axis; crossedRoomId = first crossed room, crossedRoomIds = all, from the corridor end

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

/** Price per wall crossing. Same value as DEFAULT_WALL_MM of route-room-reach.ts (copied, not imported). */
export const BRIDGE_WALL_MM = 3000;
export const BRIDGE_MAX_LENGTH_MM = 25000;
export const DEFAULT_NEVER_CROSS_WORDS: readonly string[] = ['stair', 'lift', 'elevator', 'kitchen', 'shaft', 'residential', 'bedroom', 'apartment'];

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
const NODE_TOL_MM = 200;
const ON_TRACK_MM = 1;
const DOOR_SPAN_MM = 50;
const STUB_MIN_MM = 1;
const SWITCH_EPS_MM = 1e-6;
const SWITCH_ROUNDS = 2;
const STRAIGHT_DOT = -0.99;   // below this dot, two edges run opposite ways
const JOIN_PENALTY_MM = 5000;
const WALL_SAMPLE_MM = 100;
const BRIDGE_STEP_MM = 50;

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

export interface MainDemand { roomId: string; doorsMm: readonly { pointMm: Vec2; outward: Vec2 }[] }   // outward = unit axis vector
export interface MainJoin { path: Vec2[]; crossesWall: boolean; roomIds: string[] }   // straight path of 2 points
export interface MainRun { lines: MainLine[]; paths: Vec2[][]; rootPointMm: Vec2; unreachedRoomIds: string[]; chosenHitByRoom: Map<string, Vec2>; stubCrossesWall: boolean; stubRoomIds: string[]; joins: MainJoin[] }

interface Track extends Span { orient: Orient; coord: number; bridgeRoomIds?: string[] }
interface Hit { lineIdx: number; d: number; point: Vec2 }
interface Edge { a: number; b: number; cost: number; dir: Vec2; bridgeRoomIds?: string[] }   // node indices; dir = unit direction from a to b
interface TreeSolve { edgeIds: string[]; unreached: Set<number> }
type Adj = { to: number; cost: number }[][];

const alongOf = (p: Vec2, orient: Orient): number => (orient === 'h' ? p.x : p.y);
const acrossOf = (p: Vec2, orient: Orient): number => (orient === 'h' ? p.y : p.x);
const keyOf = (p: Vec2): string => `${Math.round(p.x)},${Math.round(p.y)}`;
const nodeId = (i: number): string => `n-${i}`;
const within = (v: number, t: Span): boolean => v >= t.lo - NODE_TOL_MM && v <= t.hi + NODE_TOL_MM;
const lexLess = (p: Vec2, q: Vec2): boolean => p.x < q.x || (p.x === q.x && p.y < q.y);

function trackOf(line: MainLine): Track {
  const orient: Orient = line.a.y === line.b.y ? 'h' : 'v';
  const s = alongOf(line.a, orient);
  const e = alongOf(line.b, orient);
  const bridgeRoomIds = line.bridge ? (line.crossedRoomIds ?? (line.crossedRoomId ? [line.crossedRoomId] : [])) : undefined;
  return { orient, coord: acrossOf(line.a, orient), lo: Math.min(s, e), hi: Math.max(s, e), bridgeRoomIds };
}

function sortTracks(tracks: readonly Track[]): Track[] {
  return [...tracks].sort((p, q) =>
    (p.orient === q.orient ? 0 : p.orient === 'h' ? -1 : 1) || p.coord - q.coord || p.lo - q.lo || p.hi - q.hi ||
    Number(p.bridgeRoomIds !== undefined) - Number(q.bridgeRoomIds !== undefined),
  );
}

function nearestOnTrack(p: Vec2, t: Track): Vec2 {
  return at(t.orient, t.coord, Math.min(t.hi, Math.max(t.lo, alongOf(p, t.orient))));
}

/** The nearest track ahead of the door along its ray, when the hit lies within reachMm. */
function hitOf(door: { pointMm: Vec2; outward: Vec2 }, tracks: readonly Track[], reachMm: number): Hit | null {
  const axis: Orient = Math.abs(door.outward.x) >= Math.abs(door.outward.y) ? 'h' : 'v';
  const perp: Orient = axis === 'h' ? 'v' : 'h';
  const sign = Math.sign(alongOf(door.outward, axis));
  let best: { lineIdx: number; d: number } | null = null;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    if (t.orient !== perp || t.bridgeRoomIds !== undefined) continue;
    const d = (t.coord - alongOf(door.pointMm, axis)) * sign;
    const s = alongOf(door.pointMm, perp);
    if (d <= RAY_EPS_MM || s < t.lo - DOOR_SPAN_MM || s > t.hi + DOOR_SPAN_MM) continue;
    if (best === null || d < best.d) best = { lineIdx: i, d };
  }
  if (best === null || best.d > reachMm) return null;
  const { d, lineIdx } = best;
  return { lineIdx, d, point: { x: door.pointMm.x + door.outward.x * d, y: door.pointMm.y + door.outward.y * d } };
}

/** The hits of a door: each bridge track that ends at the door point, or else the nearest corridor track ahead. */
function hitsOfDoor(door: { pointMm: Vec2; outward: Vec2 }, tracks: readonly Track[], reachMm: number): Hit[] {
  const bridgeHits: Hit[] = [];
  tracks.forEach((t, i) => {
    if (t.bridgeRoomIds === undefined) return;
    const ends = [at(t.orient, t.coord, t.lo), at(t.orient, t.coord, t.hi)];
    if (ends.some((e) => distance(e, door.pointMm) <= ON_TRACK_MM)) bridgeHits.push({ lineIdx: i, d: 0, point: { ...door.pointMm } });
  });
  if (bridgeHits.length > 0) return bridgeHits;
  const hit = hitOf(door, tracks, reachMm);
  return hit === null ? [] : [hit];
}

function unitOf(p: Vec2, q: Vec2): Vec2 {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

function distancesFrom(sources: readonly number[], adj: Adj): number[] {
  const dist = new Array<number>(adj.length).fill(Infinity);
  for (const s of sources) dist[s] = 0;
  const done = new Array<boolean>(adj.length).fill(false);
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) {
      if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    }
    if (u < 0) return dist;
    done[u] = true;
    for (const { to, cost } of adj[u]!) {
      if (dist[u]! + cost < dist[to]!) dist[to] = dist[u]! + cost;
    }
  }
}

function samplesOf(a: Vec2, b: Vec2): Vec2[] {
  const len = distance(a, b);
  const out: Vec2[] = [];
  for (let s = 0; s < len; s += WALL_SAMPLE_MM) {
    const t = s / len;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push({ x: b.x, y: b.y });
  return out;
}

function pathCrossesWall(a: Vec2, b: Vec2, inside: (p: Vec2) => boolean): boolean {
  return samplesOf(a, b).some((p) => !inside(p));
}

function roomIdsOf(a: Vec2, b: Vec2, roomIdAt: ((p: Vec2) => string | null) | undefined): string[] {
  if (!roomIdAt) return [];
  const ids: string[] = [];
  for (const p of samplesOf(a, b)) {
    const id = roomIdAt(p);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function sameRooms(p: string[] | undefined, q: string[] | undefined): boolean {
  return p === undefined || q === undefined ? p === q : p.join('|') === q.join('|');
}

/** Joins the tree edges that meet straight through a node, and returns one path per joined chain. */
function straightPaths(edgeIds: readonly string[], info: ReadonlyMap<string, Edge>, nodePts: readonly Vec2[]): { path: Vec2[]; bridgeRoomIds?: string[] }[] {
  const parent = edgeIds.map((_, k) => k);
  const find = (k: number): number => {
    let r = k;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const incident = new Map<number, { k: number; out: Vec2; rooms?: string[] }[]>();
  const attach = (node: number, item: { k: number; out: Vec2; rooms?: string[] }): void => {
    incident.set(node, [...(incident.get(node) ?? []), item]);
  };
  edgeIds.forEach((id, k) => {
    const e = info.get(id)!;
    attach(e.a, { k, out: e.dir, rooms: e.bridgeRoomIds });
    attach(e.b, { k, out: { x: -e.dir.x, y: -e.dir.y }, rooms: e.bridgeRoomIds });
  });
  for (const list of incident.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i]!;
        const q = list[j]!;
        if (p.out.x * q.out.x + p.out.y * q.out.y < STRAIGHT_DOT && sameRooms(p.rooms, q.rooms)) parent[find(p.k)] = find(q.k);
      }
    }
  }
  const chains = new Map<number, { pts: Vec2[]; dir: Vec2; rooms?: string[] }>();
  edgeIds.forEach((id, k) => {
    const e = info.get(id)!;
    const r = find(k);
    const chain = chains.get(r) ?? { pts: [], dir: e.dir, rooms: e.bridgeRoomIds };
    chain.pts.push(nodePts[e.a]!, nodePts[e.b]!);
    chains.set(r, chain);
  });
  return [...chains.values()]
    .map(({ pts, dir, rooms }) => {
      const axis: Orient = dir.x !== 0 ? 'h' : 'v';
      const lo = pts.reduce((m, p) => (alongOf(p, axis) < alongOf(m, axis) ? p : m));
      const hi = pts.reduce((m, p) => (alongOf(p, axis) > alongOf(m, axis) ? p : m));
      const path = lexLess(hi, lo) ? [{ ...hi }, { ...lo }] : [{ ...lo }, { ...hi }];
      return rooms === undefined ? { path } : { path, bridgeRoomIds: rooms };
    })
    .sort((p, q) => p.path[0]!.x - q.path[0]!.x || p.path[0]!.y - q.path[0]!.y || p.path[1]!.x - q.path[1]!.x || p.path[1]!.y - q.path[1]!.y);
}

export function planMainRun(input: {
  lines: readonly MainLine[];
  startMm: Vec2;
  demands: readonly MainDemand[];
  inside: (p: Vec2) => boolean;
  bendMm: number;
  reachMm: number;
  roomIdAt?: (p: Vec2) => string | null;
}): MainRun {
  const { startMm } = input;
  const demands = [...input.demands].sort((p, q) => (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0));
  const tracks = sortTracks(input.lines.map(trackOf));
  if (!tracks.some((t) => t.bridgeRoomIds === undefined)) {
    return {
      lines: [],
      paths: [],
      rootPointMm: { ...startMm },
      unreachedRoomIds: demands.map((d) => d.roomId),
      chosenHitByRoom: new Map(),
      stubCrossesWall: false,
      stubRoomIds: [],
      joins: [],
    };
  }

  const hitsOf = new Map<string, Hit[]>();
  for (const demand of demands) {
    const hits = demand.doorsMm.flatMap((door) => hitsOfDoor(door, tracks, input.reachMm));
    hitsOf.set(demand.roomId, hits);
  }
  const parent = tracks.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const link = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  tracks.forEach((p, i) =>
    tracks.forEach((q, j) => {
      if (p.orient === 'h' && q.orient === 'v' && within(q.coord, p) && within(p.coord, q)) link(i, j);
      if (i !== j && p.orient === q.orient && Math.abs(p.coord - q.coord) <= ON_TRACK_MM && q.lo >= p.hi && q.lo - p.hi <= NODE_TOL_MM) link(i, j);
    }),
  );
  const compOf: number[] = [];
  const compIdx = new Map<number, number>();
  tracks.forEach((_, i) => {
    const r = find(i);
    if (!compIdx.has(r)) compIdx.set(r, compIdx.size);
    compOf.push(compIdx.get(r)!);
  });
  const nearOf = tracks.map((t) => nearestOnTrack(startMm, t));
  const nearPt: Vec2[] = [];
  tracks.forEach((t, i) => {
    if (t.bridgeRoomIds !== undefined) return;
    const c = compOf[i]!;
    if (nearPt[c] === undefined || distance(startMm, nearOf[i]!) < distance(startMm, nearPt[c]!)) nearPt[c] = nearOf[i]!;
  });
  const roomCount = new Array<number>(compIdx.size).fill(0);
  for (const demand of demands) {
    for (const c of new Set(hitsOf.get(demand.roomId)!.map((h) => compOf[h.lineIdx]!))) roomCount[c]!++;
  }
  const rootComp = nearPt.reduce((best, _, c) => {
    if (roomCount[c] !== roomCount[best]) return roomCount[c]! > roomCount[best]! ? c : best;
    return distance(startMm, nearPt[c]!) < distance(startMm, nearPt[best]!) ? c : best;
  }, nearPt.findIndex((p) => p !== undefined));
  const rootPt = nearPt[rootComp]!;

  const onTrack: Vec2[][] = tracks.map((t) => [at(t.orient, t.coord, t.lo), at(t.orient, t.coord, t.hi)]);
  const gaps: [Vec2, Vec2, number, number][] = [];
  tracks.forEach((p, i) =>
    tracks.forEach((q, j) => {
      if (p.orient === 'h' && q.orient === 'v') {
        const cross = { x: q.coord, y: p.coord };
        if (within(cross.x, p) && within(cross.y, q)) {
          onTrack[i]!.push(cross);
          onTrack[j]!.push(cross);
        }
      }
      if (i !== j && p.orient === q.orient && Math.abs(p.coord - q.coord) <= ON_TRACK_MM && q.lo >= p.hi && q.lo - p.hi <= NODE_TOL_MM) {
        gaps.push([at(p.orient, p.coord, p.hi), at(q.orient, q.coord, q.lo), i, j]);
      }
    }),
  );
  for (const hits of hitsOf.values()) for (const h of hits) onTrack[h.lineIdx]!.push(h.point);
  tracks.forEach((t, i) => {
    if (Math.abs(acrossOf(rootPt, t.orient) - t.coord) <= ON_TRACK_MM && within(alongOf(rootPt, t.orient), t)) onTrack[i]!.push(rootPt);
  });

  const connectors: { pa: Vec2; pb: Vec2 }[] = [];
  for (let p = 0; p < nearPt.length; p++) {
    for (let q = p + 1; q < nearPt.length; q++) {
      let best: { d: number; ta: number; tb: number; pa: Vec2; pb: Vec2 } | null = null;
      for (let i = 0; i < tracks.length; i++) {
        if (compOf[i] !== p || tracks[i]!.bridgeRoomIds !== undefined) continue;
        for (let j = 0; j < tracks.length; j++) {
          if (compOf[j] !== q || tracks[j]!.bridgeRoomIds !== undefined) continue;
          const ta = tracks[i]!;
          const tb = tracks[j]!;
          const cands: [Vec2, Vec2][] = [];
          for (const e of [at(ta.orient, ta.coord, ta.lo), at(ta.orient, ta.coord, ta.hi)]) cands.push([e, nearestOnTrack(e, tb)]);
          for (const e of [at(tb.orient, tb.coord, tb.lo), at(tb.orient, tb.coord, tb.hi)]) cands.push([nearestOnTrack(e, ta), e]);
          for (const [pa, pb] of cands) {
            if (Math.abs(pa.x - pb.x) > ON_TRACK_MM && Math.abs(pa.y - pb.y) > ON_TRACK_MM) continue;
            const d = distance(pa, pb);
            if (best === null || d < best.d) best = { d, ta: i, tb: j, pa, pb };
          }
        }
      }
      if (best === null || distance(best.pa, best.pb) <= STUB_MIN_MM) continue;
      onTrack[best.ta]!.push(best.pa);
      onTrack[best.tb]!.push(best.pb);
      connectors.push({ pa: best.pa, pb: best.pb });
    }
  }

  const reps = new Map<string, Vec2>();
  for (const pts of onTrack) {
    for (const p of pts) {
      const cur = reps.get(keyOf(p));
      if (!cur || lexLess(p, cur)) reps.set(keyOf(p), p);
    }
  }
  const nodePts = [...reps.values()].sort((p, q) => p.x - q.x || p.y - q.y);
  const nodeOf = new Map<string, number>(nodePts.map((p, i) => [keyOf(p), i] as const));

  const pairs: [number, number, number[]][] = [];
  tracks.forEach((t, i) => {
    const idx = [...new Set(onTrack[i]!.map((p) => nodeOf.get(keyOf(p))!))].sort(
      (x, y) => alongOf(nodePts[x]!, t.orient) - alongOf(nodePts[y]!, t.orient),
    );
    for (let k = 1; k < idx.length; k++) pairs.push([idx[k - 1]!, idx[k]!, [i]]);
  });
  for (const [p, q, i, j] of gaps) pairs.push([nodeOf.get(keyOf(p))!, nodeOf.get(keyOf(q))!, [i, j]]);
  const unique = new Map<string, [number, number, number[]]>();
  for (const [a, b, src] of pairs) {
    const k = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (a === b) continue;
    const cur = unique.get(k);
    if (cur) cur[2].push(...src);
    else unique.set(k, [a, b, [...src]]);
  }
  const ordered = [...unique.values()].sort(
    ([a, b], [c, d]) => Math.min(a, b) - Math.min(c, d) || Math.max(a, b) - Math.max(c, d),
  );
  const edges: SteinerTurnEdge[] = [];
  const info = new Map<string, Edge>();
  ordered.forEach(([a, b, src], k) => {
    const id = `e-${k}`;
    const dir = unitOf(nodePts[a]!, nodePts[b]!);
    const len = distance(nodePts[a]!, nodePts[b]!);
    const bridge = src.every((t) => tracks[t]!.bridgeRoomIds !== undefined) ? tracks[src[0]!]! : undefined;
    const bridgeRoomIds = bridge?.bridgeRoomIds;
    const cost = bridge && bridgeRoomIds
      ? len + (BRIDGE_WALL_MM * (bridgeRoomIds.length + 1) * len) / (bridge.hi - bridge.lo)
      : len;
    edges.push({ id, from: nodeId(a), to: nodeId(b), cost, startDir: dir, endDir: dir });
    info.set(id, { a, b, cost, dir, bridgeRoomIds });
  });
  const joinIds: string[] = [];
  connectors.forEach(({ pa, pb }, j) => {
    const id = `e-${ordered.length + j}`;
    const a = nodeOf.get(keyOf(pa))!;
    const b = nodeOf.get(keyOf(pb))!;
    const dir = unitOf(pa, pb);
    const cost = distance(pa, pb) + JOIN_PENALTY_MM;
    edges.push({ id, from: nodeId(a), to: nodeId(b), cost, startDir: dir, endDir: dir });
    info.set(id, { a, b, cost, dir });
    joinIds.push(id);
  });
  const graph: SteinerTurnGraph = { nodeIds: nodePts.map((_, i) => nodeId(i)), edges };
  const adj: Adj = nodePts.map(() => []);
  for (const e of info.values()) {
    adj[e.a]!.push({ to: e.b, cost: e.cost });
    adj[e.b]!.push({ to: e.a, cost: e.cost });
  }

  const rootI = nodeOf.get(keyOf(rootPt))!;
  const rootDist = distancesFrom([rootI], adj);
  const solve = (picked: readonly number[]): TreeSolve => {
    const r = steinerTreeWithTurns(graph, nodeId(rootI), picked.map(nodeId), { bendMm: input.bendMm, fittingMm: 0 });
    return { edgeIds: r.edgeIds, unreached: new Set(r.unreached.map((id) => Number(id.slice(2)))) };
  };
  const treeNodes = (edgeIds: readonly string[]): number[] => [
    rootI,
    ...edgeIds.flatMap((id) => [info.get(id)!.a, info.get(id)!.b]),
  ];

  const hitNodes = new Map<string, Map<number, number>>();
  const picks = new Map<string, number>();
  const lost = new Set<string>();
  for (const demand of demands) {
    const m = new Map<number, number>();
    for (const h of hitsOf.get(demand.roomId)!) {
      const n = nodeOf.get(keyOf(h.point))!;
      if (!m.has(n) || h.d < m.get(n)!) m.set(n, h.d);
    }
    if (m.size === 0) {
      lost.add(demand.roomId);
      continue;
    }
    hitNodes.set(demand.roomId, m);
    const costOf = (n: number): number => rootDist[n]! + m.get(n)!;
    picks.set(demand.roomId, [...m.keys()].sort((x, y) => x - y).reduce((best, n) => (costOf(n) < costOf(best) ? n : best)));
  }

  const reconcile = (): TreeSolve => {
    for (;;) {
      const solved = solve([...picks.values()]);
      const gone = [...picks].filter(([, n]) => solved.unreached.has(n)).map(([roomId]) => roomId);
      if (gone.length === 0) return solved;
      for (const roomId of gone) {
        picks.delete(roomId);
        lost.add(roomId);
      }
    }
  };

  let solved = reconcile();
  for (let round = 0; round < SWITCH_ROUNDS; round++) {
    const changes: [string, number][] = [];
    for (const [roomId, pick] of picks) {
      const m = hitNodes.get(roomId)!;
      if (m.size < 2) continue;
      const others = [...picks].filter(([r]) => r !== roomId).map(([, n]) => n);
      const dist = distancesFrom(treeNodes(solve(others).edgeIds), adj);
      const score = (n: number): number => dist[n]! + m.get(n)!;
      let best = -1;
      for (const n of [...m.keys()].sort((x, y) => x - y)) {
        if (n !== pick && (best < 0 || score(n) < score(best))) best = n;
      }
      if (best >= 0 && score(best) < score(pick) - SWITCH_EPS_MM) changes.push([roomId, best]);
    }
    if (changes.length === 0) break;
    for (const [roomId, n] of changes) picks.set(roomId, n);
    solved = reconcile();
  }

  const joins: MainJoin[] = connectors
    .filter((_, j) => solved.edgeIds.includes(joinIds[j]!))
    .map(({ pa, pb }) => ({
      path: [{ ...pa }, { ...pb }],
      crossesWall: pathCrossesWall(pa, pb, input.inside),
      roomIds: roomIdsOf(pa, pb, input.roomIdAt),
    }));
  const treePaths = straightPaths(solved.edgeIds, info, nodePts);
  const lines: MainLine[] = treePaths.map(({ path: p, bridgeRoomIds: ids }, i): MainLine => {
    if (ids === undefined) return { id: `mr-${i}`, a: p[0]!, b: p[1]! };
    return ids.length > 0
      ? { id: `mr-${i}`, a: p[0]!, b: p[1]!, bridge: true, crossedRoomId: ids[0], crossedRoomIds: ids }
      : { id: `mr-${i}`, a: p[0]!, b: p[1]!, bridge: true, crossedRoomIds: ids };
  });
  const paths = treePaths.map(({ path }) => path);
  if (distance(startMm, rootPt) > STUB_MIN_MM) paths.push([{ ...startMm }, { ...rootPt }]);
  const chosenHitByRoom = new Map<string, Vec2>();
  for (const [roomId, n] of [...picks].sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) {
    chosenHitByRoom.set(roomId, { ...nodePts[n]! });
  }
  return {
    lines,
    paths,
    rootPointMm: { ...rootPt },
    unreachedRoomIds: [...lost].sort(),
    chosenHitByRoom,
    stubCrossesWall: distance(startMm, rootPt) > STUB_MIN_MM && pathCrossesWall(startMm, rootPt, input.inside),
    stubRoomIds: distance(startMm, rootPt) > STUB_MIN_MM ? roomIdsOf(startMm, rootPt, input.roomIdAt) : [],
    joins,
  };
}

export interface BridgeRoom {
  roomId: string;
  name: string | null;
  typeId: string | null;
  typeName: string | null;
  hasTerminal: boolean;   // the room has a terminal of ANY routing target (D3)
  inRouteArea: boolean;
  isShaft: boolean;
}

export interface MainBridgeInput {
  lines: readonly MainLine[];                  // the corridor lines (no bridges)
  demands: readonly MainDemand[];              // MainDemand is defined later in the file; fine in TS
  rooms: readonly BridgeRoom[];                // all rooms of the page
  roomIdAt: (p: Vec2) => string | null;        // any room, area rooms too
  crossRooms: { maxRooms: number };
  neverCrossTypeIds?: readonly string[];
  blockers: readonly (readonly Vec2[])[];
  clearanceMm: number;
  maxLengthMm?: number;                        // default BRIDGE_MAX_LENGTH_MM
}

const wordsOf = (text: string | null): string[] => (text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);

/** A room may be crossed when it has no terminal, is not in the route area, is not a shaft, and is not banned. */
export function bridgeRoomAllowed(room: BridgeRoom, neverCrossTypeIds?: readonly string[]): boolean {
  if (room.hasTerminal || room.inRouteArea || room.isShaft) return false;
  if (neverCrossTypeIds !== undefined) return room.typeId === null || !neverCrossTypeIds.includes(room.typeId);
  const banned = (text: string | null): boolean =>
    wordsOf(text).some((w) => DEFAULT_NEVER_CROSS_WORDS.some((word) => w.startsWith(word)));
  return !banned(room.name) && !banned(room.typeName);
}

function pointAlong(door: { pointMm: Vec2; outward: Vec2 }, t: number): Vec2 {
  return { x: door.pointMm.x + door.outward.x * t, y: door.pointMm.y + door.outward.y * t };
}

/** The rooms that a bridge from the door crosses, in order from the corridor end. Null when the bridge is not allowed. */
function bridgeCrossings(
  demandRoomId: string,
  door: { pointMm: Vec2; outward: Vec2 },
  lengthMm: number,
  input: MainBridgeInput,
  roomsById: ReadonlyMap<string, BridgeRoom>,
  maxRooms: number,
): string[] | null {
  const ids: string[] = [];
  for (let t = BRIDGE_STEP_MM / 2; t < lengthMm; t += BRIDGE_STEP_MM) {
    const id = input.roomIdAt(pointAlong(door, t));
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  const crossed: string[] = [];
  for (const id of ids) {
    if (id === demandRoomId) continue;
    const room = roomsById.get(id);
    if (room === undefined) return null;
    if (room.inRouteArea) continue;
    if (!bridgeRoomAllowed(room, input.neverCrossTypeIds)) return null;
    crossed.push(id);
  }
  return crossed.length === 0 || crossed.length > maxRooms ? null : crossed.reverse();
}

function bridgeClear(door: { pointMm: Vec2; outward: Vec2 }, lengthMm: number, input: MainBridgeInput): boolean {
  const ts: number[] = [];
  for (let t = 0; t < lengthMm; t += BRIDGE_STEP_MM) ts.push(t);
  ts.push(lengthMm);
  return ts.every((t) => {
    const p = pointAlong(door, t);
    return input.blockers.every((path) => pathDistance(p, path) >= input.clearanceMm);
  });
}

/** Bridge lines from the corridor lines to the doors. The caller passes only doors that may get a bridge. Deterministic. */
export function mainBridgeLines(input: MainBridgeInput): MainLine[] {
  const tracks = sortTracks(input.lines.map(trackOf));
  const roomsById = new Map(input.rooms.map((room) => [room.roomId, room] as const));
  const maxLengthMm = input.maxLengthMm ?? BRIDGE_MAX_LENGTH_MM;
  const maxRooms = Number.isFinite(input.crossRooms.maxRooms) ? Math.max(0, Math.floor(input.crossRooms.maxRooms)) : 0;
  const demands = [...input.demands].sort((p, q) => (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0));
  const found: { orient: Orient; a: Vec2; b: Vec2; crossed: string[] }[] = [];
  const keys = new Set<string>();
  for (const demand of demands) {
    for (const door of demand.doorsMm) {
      const hit = hitOf(door, tracks, maxLengthMm);
      if (hit === null) continue;
      const crossed = bridgeCrossings(demand.roomId, door, hit.d, input, roomsById, maxRooms);
      if (crossed === null || !bridgeClear(door, hit.d, input)) continue;
      const orient: Orient = Math.abs(door.outward.x) >= Math.abs(door.outward.y) ? 'h' : 'v';
      const coord = acrossOf(door.pointMm, orient);
      const p0 = alongOf(door.pointMm, orient);
      const p1 = alongOf(hit.point, orient);
      const a = at(orient, coord, Math.min(p0, p1));
      const b = at(orient, coord, Math.max(p0, p1));
      const key = JSON.stringify([keyOf(a), keyOf(b), crossed]);
      if (keys.has(key)) continue;
      keys.add(key);
      found.push({ orient, a, b, crossed });
    }
  }
  found.sort((p, q) =>
    (p.orient === q.orient ? 0 : p.orient === 'h' ? -1 : 1) ||
    acrossOf(p.a, p.orient) - acrossOf(q.a, q.orient) ||
    alongOf(p.a, p.orient) - alongOf(q.a, q.orient),
  );
  return found.map(({ a, b, crossed }, i) => ({
    id: `bridge-${i}`,
    a,
    b,
    bridge: true,
    crossedRoomId: crossed[0],
    crossedRoomIds: crossed,
  }));
}
