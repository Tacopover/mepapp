// Measures the shape of a set of polylines: a planned route or a hand route. Bends, tees, straight pieces, paths to the terminals and room entries. Pure: reads its inputs and writes nothing. Lengths and positions are mm; room polygons are page points (mm / mmPerPt).

import { distance, type Vec2 } from './geometry.js';
import type { RouteArea } from './route-area.js';
import type { PlannedRoute } from './route-build.js';
import { roomsAtPoint, type Room } from './rooms/room.js';

export interface ShapeMetrics {
  lengthMm: number;
  bends: number; bends90: number; bends45: number;
  bendsServedRooms: number; bendsCorridors: number; bendsOther: number;
  tees: number; crosses: number;
  straightPieces5m: number; longestStraightMm: number;
  meanBendsToTerminal: number; maxBendsToTerminal: number;
  pathToManhattan: number;                       // mean over terminals
  multiEntryRooms: number; chainedRooms: number;
  chainedRoomIds: string[];                      // sorted
  chainedVia: Record<string, string>;            // own room id -> id of the first other served room the path passes
  multiEntryRoomIds: string[];
  multiEntryPointsMm: Record<string, Vec2[]>;    // room id -> the crossings that made the count > 1
  singleTerminalStraight: { rooms: number; straight: number };
  singleTerminalBentRoomIds: string[];
  bendPlaces: Record<string, number>;            // room id -> number of bends whose node lies in it
  teeOffsetMm: { max: number; median: number };
  branches: { roomId: string; teeMm: Vec2; alongMm: Vec2; doorMm: Vec2; offsetMm: number; lengthMm: number }[];
  longestPathFromStartMm: number;
  branchLengthP90Mm: number;
  portsWithManyEnds: number;
}

/** A deflection of this many degrees or more makes a bend. The analysis used more than 5 degrees; no hand-route node has a deflection between 5 and 20 degrees. */
const BEND_DEG = 20;
/** A bend of this many degrees or more is a 90 degree bend. A smaller bend is a 45 degree bend. */
const BEND_90_DEG = 70;
/** Two edges that meet at a node join one straight piece when their deflection is below this many degrees. */
const STRAIGHT_DEG = 20;
/** A straight piece of this length or more counts as a long straight. */
const LONG_STRAIGHT_MM = 5000;
/** Vertices closer than this many page points make one node. */
const NODE_TOL_PT = 1.5;
/** A terminal or the start matches the nearest node within this many page points. */
const MATCH_TOL_PT = 10;
/** Spacing of the samples along a path that test for a chained room. */
const SAMPLE_PT = 5;
/** Room boundary crossings closer than this many page points count as one entry. */
const ENTRY_TOL_PT = 8;
/** Distance past a door, along the branch, where the walk tests for a served room. */
const ENTER_PT = 1;
/** A polyline vertex with a deflection below this many degrees is removed. */
const COLLINEAR_DEG = 1;

interface Edge { a: number; b: number; mm: number }
interface Graph { pos: Vec2[]; edges: Edge[]; inc: number[][] }

/** Replaces each value by the mean of its cluster. A value joins the cluster when it lies at most gap above the previous value. */
function snapAxis(values: readonly number[], gap: number): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const last = groups[groups.length - 1];
    if (last !== undefined && v - last[last.length - 1]! <= gap) last.push(v);
    else groups.push([v]);
  }
  const out = new Map<number, number>();
  for (const group of groups) {
    const mean = group.reduce((sum, v) => sum + v, 0) / group.length;
    for (const v of group) out.set(v, mean);
  }
  return out;
}

/** The turn in degrees from the direction a to b, then to c. A straight line gives 0, a U-turn gives 180. */
function deflectionDeg(a: Vec2, b: Vec2, c: Vec2): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const wx = c.x - b.x;
  const wy = c.y - b.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
}

/** The crossing of the segments p-q and a-b, both ends included. Null when the segments are parallel or do not meet. */
function intersect(p: Vec2, q: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } | null {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: p.x + t * rx, y: p.y + t * ry }, t };
}

/** The graph of the polylines. Legs are split at vertices that lie on them and at their crossings. Edges are unique by node pair. */
function buildGraph(input: readonly (readonly Vec2[])[], snapMm: number, mmPerPt: number): Graph {
  const polylines = input.map((pl) => pl.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const all = polylines.flatMap((pl) => [...pl]);
  const snapX = snapMm > 0 ? snapAxis(all.map((p) => p.x), snapMm) : null;
  const snapY = snapMm > 0 ? snapAxis(all.map((p) => p.y), snapMm) : null;
  const at = (p: Vec2): Vec2 => ({ x: snapX?.get(p.x) ?? p.x, y: snapY?.get(p.y) ?? p.y });
  const tol = NODE_TOL_PT * mmPerPt;

  const pos: Vec2[] = [];
  const nodeAt = (p: Vec2): number => {
    const found = pos.findIndex((q) => distance(q, p) <= tol);
    if (found >= 0) return found;
    pos.push(p);
    return pos.length - 1;
  };
  const legs: [number, number][] = [];
  for (const pl of polylines) {
    for (let i = 1; i < pl.length; i++) {
      const a = nodeAt(at(pl[i - 1]!));
      const b = nodeAt(at(pl[i]!));
      if (a !== b) legs.push([a, b]);
    }
  }

  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const [a, b] = legs[i]!;
      const [c, d] = legs[j]!;
      const hit = intersect(pos[a]!, pos[b]!, pos[c]!, pos[d]!);
      if (hit !== null && pos.every((q) => distance(q, hit.point) > tol)) pos.push(hit.point);
    }
  }

  const edges: Edge[] = [];
  const keys = new Set<string>();
  const addEdge = (a: number, b: number): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (lo === hi || keys.has(key)) return;
    keys.add(key);
    edges.push({ a: lo, b: hi, mm: distance(pos[lo]!, pos[hi]!) });
  };
  for (const [a, b] of legs) {
    const A = pos[a]!;
    const B = pos[b]!;
    const L = distance(A, B);
    const ux = (B.x - A.x) / L;
    const uy = (B.y - A.y) / L;
    const on: [number, number][] = [];
    pos.forEach((P, k) => {
      if (k === a || k === b) return;
      const t = (P.x - A.x) * ux + (P.y - A.y) * uy;
      if (t <= tol || t >= L - tol) return;
      if (Math.abs((P.x - A.x) * uy - (P.y - A.y) * ux) <= tol) on.push([t, k]);
    });
    on.sort((x, y) => x[0] - y[0]);
    const chain = [a, ...on.map(([, k]) => k), b];
    for (let i = 1; i < chain.length; i++) addEdge(chain[i - 1]!, chain[i]!);
  }

  const inc: number[][] = pos.map(() => []);
  edges.forEach((e, i) => {
    inc[e.a]!.push(i);
    inc[e.b]!.push(i);
  });
  return { pos, edges, inc };
}

function otherEnd(g: Graph, e: number, n: number): number {
  const edge = g.edges[e]!;
  return edge.a === n ? edge.b : edge.a;
}

/** Measures the shape of the polylines. Terminals and the start are mm. Rooms are page points. */
export function shapeMetrics(input: {
  polylines: readonly (readonly Vec2[])[];       // mm
  terminalsMm: readonly { id: string; point: Vec2; roomId: string | null }[];   // mm
  startMm: Vec2;                                  // mm
  rooms: readonly Room[]; area: RouteArea; mmPerPt: number; pageIndex: number;
  /** Optional: snap vertex coordinates that differ by at most this on one axis to their mean (analysis used 4 pt). Default 0 = off. */
  snapMm?: number;
}): ShapeMetrics {
  const { rooms, area, mmPerPt, pageIndex } = input;
  const g = buildGraph(input.polylines, input.snapMm ?? 0, mmPerPt);
  const pt = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const deg = (n: number): number => g.inc[n]!.length;
  const turnAt = (n: number, e1: number, e2: number): number => deflectionDeg(g.pos[otherEnd(g, e1, n)]!, g.pos[n]!, g.pos[otherEnd(g, e2, n)]!);
  const placeOf = (n: number): string | null => roomsAtPoint(rooms, pt(g.pos[n]!), pageIndex)[0]?.id ?? null;

  const servedIds = new Set(input.terminalsMm.flatMap((t) => (t.roomId === null ? [] : [t.roomId])));
  const corridorIds = new Set(area.rooms.map((r) => r.roomId));

  const lengthMm = g.edges.reduce((sum, e) => sum + e.mm, 0);

  let tees = 0;
  let crosses = 0;
  const bends: { node: number; deflection: number }[] = [];
  for (let n = 0; n < g.pos.length; n++) {
    const d = deg(n);
    if (d === 2) {
      const deflection = turnAt(n, g.inc[n]![0]!, g.inc[n]![1]!);
      if (deflection >= BEND_DEG) bends.push({ node: n, deflection });
    } else if (d === 3) tees++;
    else if (d >= 4) crosses++;
  }
  const bends90 = bends.filter((b) => b.deflection >= BEND_90_DEG).length;
  const bendPlaces = bends.map((b) => placeOf(b.node));
  let bendsServedRooms = 0;
  let bendsCorridors = 0;
  let bendsOther = 0;
  for (const id of bendPlaces) {
    if (id !== null && servedIds.has(id)) bendsServedRooms++;
    else if (id !== null && corridorIds.has(id)) bendsCorridors++;
    else bendsOther++;
  }

  const parent = g.edges.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    return root;
  };
  for (let n = 0; n < g.pos.length; n++) {
    const inc = g.inc[n]!;
    for (let x = 0; x < inc.length; x++) {
      for (let y = x + 1; y < inc.length; y++) {
        if (turnAt(n, inc[x]!, inc[y]!) < STRAIGHT_DEG) parent[find(inc[x]!)] = find(inc[y]!);
      }
    }
  }
  const pieceMm = new Map<number, number>();
  g.edges.forEach((e, i) => pieceMm.set(find(i), (pieceMm.get(find(i)) ?? 0) + e.mm));
  const pieces = [...pieceMm.values()];

  const nearestNode = (p: Vec2): number | null => {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let n = 0; n < g.pos.length; n++) {
      if (deg(n) === 0) continue;
      const d = distance(g.pos[n]!, p);
      if (d < bestDistance) {
        bestDistance = d;
        best = n;
      }
    }
    return best !== null && bestDistance <= MATCH_TOL_PT * mmPerPt ? best : null;
  };
  const startNode = nearestNode(input.startMm);
  const terminals = input.terminalsMm.map((t) => ({ ...t, node: nearestNode(t.point) }));

  const shortest = (src: number): { cost: number[]; prev: number[] } => {
    const n = g.pos.length;
    const cost = new Array<number>(n).fill(Infinity);
    const prev = new Array<number>(n).fill(-1);
    const done = new Array<boolean>(n).fill(false);
    cost[src] = 0;
    for (;;) {
      let cur = -1;
      for (let i = 0; i < n; i++) {
        if (!done[i] && cost[i]! < Infinity && (cur < 0 || cost[i]! < cost[cur]!)) cur = i;
      }
      if (cur < 0) break;
      done[cur] = true;
      for (const e of g.inc[cur]!) {
        const m = otherEnd(g, e, cur);
        const c = cost[cur]! + g.edges[e]!.mm;
        if (c < cost[m]!) {
          cost[m] = c;
          prev[m] = cur;
        }
      }
    }
    return { cost, prev };
  };
  const pathTo = (prev: number[], target: number): number[] => {
    const out = [target];
    while (prev[out[out.length - 1]!]! >= 0) out.push(prev[out[out.length - 1]!]!);
    return out.reverse();
  };
  const reached: { terminal: (typeof terminals)[number]; path: number[]; length: number }[] = [];
  if (startNode !== null) {
    const { cost, prev } = shortest(startNode);
    for (const terminal of terminals) {
      if (terminal.node === null || !Number.isFinite(cost[terminal.node]!)) continue;
      reached.push({ terminal, path: pathTo(prev, terminal.node), length: cost[terminal.node]! });
    }
  }

  const pathBends = (path: number[]): number => {
    let count = 0;
    for (let i = 1; i + 1 < path.length; i++) {
      if (deflectionDeg(g.pos[path[i - 1]!]!, g.pos[path[i]!]!, g.pos[path[i + 1]!]!) >= BEND_DEG) count++;
    }
    return count;
  };
  const bendCounts = reached.map((r) => pathBends(r.path));

  const manhattanRatios: number[] = [];
  for (const r of reached) {
    const manhattan = Math.abs(r.terminal.point.x - input.startMm.x) + Math.abs(r.terminal.point.y - input.startMm.y);
    if (manhattan > 0) manhattanRatios.push(r.length / manhattan);
  }

  const step = SAMPLE_PT * mmPerPt;
  const passesOtherServed = (path: number[], own: string): string | null => {
    for (let i = 1; i < path.length; i++) {
      const a = g.pos[path[i - 1]!]!;
      const b = g.pos[path[i]!]!;
      const k = Math.max(1, Math.floor(distance(a, b) / step));
      for (let s = 0; s <= k; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / k, y: a.y + ((b.y - a.y) * s) / k };
        const id = roomsAtPoint(rooms, pt(q), pageIndex)[0]?.id;
        if (id !== undefined && id !== own && servedIds.has(id)) return id;
      }
    }
    return null;
  };
  const chained = new Set<string>();
  const chainedVia: Record<string, string> = {};
  for (const r of reached) {
    const own = r.terminal.roomId;
    if (own === null || chained.has(own)) continue;
    const via = passesOtherServed(r.path, own);
    if (via !== null) {
      chained.add(own);
      chainedVia[own] = via;
    }
  }

  const edgesPt = g.edges.map((e) => [pt(g.pos[e.a]!), pt(g.pos[e.b]!)] as [Vec2, Vec2]);
  const servedRooms = rooms.filter((r) => servedIds.has(r.id));
  const ringSegments = (room: Room): [Vec2, Vec2][] =>
    [room.polygon.outer, ...room.polygon.holes].flatMap((ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as [Vec2, Vec2]));
  const multiEntryPointsMm: Record<string, Vec2[]> = {};
  for (const room of servedRooms) {
    const crossings: Vec2[] = [];
    for (const [p, q] of edgesPt) {
      for (const [a, b] of ringSegments(room)) {
        const hit = intersect(p, q, a, b);
        if (hit !== null && !crossings.some((c) => distance(c, hit.point) < ENTRY_TOL_PT)) crossings.push(hit.point);
      }
    }
    if (crossings.length > 1) multiEntryPointsMm[room.id] = crossings.map((c) => ({ x: c.x * mmPerPt, y: c.y * mmPerPt }));
  }
  const multiEntryRoomIds = Object.keys(multiEntryPointsMm).sort();

  const terminalsPerRoom = new Map<string, number>();
  for (const t of input.terminalsMm) {
    if (t.roomId !== null) terminalsPerRoom.set(t.roomId, (terminalsPerRoom.get(t.roomId) ?? 0) + 1);
  }
  const bendRoomIds = new Set(bendPlaces.filter((id): id is string => id !== null));
  const bendPlaceCounts: Record<string, number> = {};
  for (const id of bendPlaces) {
    if (id !== null) bendPlaceCounts[id] = (bendPlaceCounts[id] ?? 0) + 1;
  }
  let singleRooms = 0;
  let singleStraight = 0;
  const singleTerminalBentRoomIds: string[] = [];
  for (const [id, count] of terminalsPerRoom) {
    if (count !== 1) continue;
    singleRooms++;
    if (!bendRoomIds.has(id)) singleStraight++;
    else singleTerminalBentRoomIds.push(id);
  }
  singleTerminalBentRoomIds.sort();

  const servedSegments = servedRooms.flatMap(ringSegments);
  const entryOnLeg = (A: Vec2, B: Vec2): { point: Vec2; roomId: string } | null => {
    const pa = pt(A);
    const pb = pt(B);
    const len = distance(pa, pb);
    const hits = servedSegments
      .map(([a, b]) => intersect(pa, pb, a, b))
      .filter((h): h is { point: Vec2; t: number } => h !== null)
      .sort((x, y) => x.t - y.t);
    for (const hit of hits) {
      const after = {
        x: hit.point.x + ((pb.x - pa.x) / len) * ENTER_PT,
        y: hit.point.y + ((pb.y - pa.y) / len) * ENTER_PT,
      };
      const found = roomsAtPoint(rooms, after, pageIndex).find((r) => servedIds.has(r.id));
      if (found !== undefined) {
        return { point: { x: hit.point.x * mmPerPt, y: hit.point.y * mmPerPt }, roomId: found.id };
      }
    }
    return null;
  };
  const doorOf = (tee: number, first: number): { point: Vec2; length: number; roomId: string } | null => {
    let from = tee;
    let edge = first;
    let walked = 0;
    for (let step = 0; step <= g.edges.length; step++) {
      const to = otherEnd(g, edge, from);
      const hit = entryOnLeg(g.pos[from]!, g.pos[to]!);
      if (hit !== null) return { point: hit.point, length: walked + distance(g.pos[from]!, hit.point), roomId: hit.roomId };
      walked += g.edges[edge]!.mm;
      if (deg(to) !== 2) return null;
      from = to;
      edge = g.inc[to]!.find((e) => e !== edge)!;
    }
    return null;
  };
  const offsets: number[] = [];
  const doorLengths: number[] = [];
  const branches: ShapeMetrics['branches'] = [];
  for (let n = 0; n < g.pos.length; n++) {
    const inc = g.inc[n]!;
    if (inc.length !== 3) continue;
    let x = 0;
    let y = 1;
    let best = Infinity;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
      const d = turnAt(n, inc[i]!, inc[j]!);
      if (d < best) {
        best = d;
        x = i;
        y = j;
      }
    }
    if (best >= STRAIGHT_DEG) continue;
    const door = doorOf(n, inc[3 - x - y]!);
    if (door === null) continue;
    const T = g.pos[n]!;
    const along = g.pos[otherEnd(g, inc[x]!, n)]!;
    const L = distance(T, along);
    const ux = (along.x - T.x) / L;
    const uy = (along.y - T.y) / L;
    const offset = Math.abs((door.point.x - T.x) * ux + (door.point.y - T.y) * uy);
    offsets.push(offset);
    doorLengths.push(door.length);
    branches.push({ roomId: door.roomId, teeMm: T, alongMm: { x: ux, y: uy }, doorMm: door.point, offsetMm: offset, lengthMm: door.length });
  }
  const sortedOffsets = [...offsets].sort((a, b) => a - b);
  const mid = Math.floor(sortedOffsets.length / 2);
  const medianOffset =
    sortedOffsets.length === 0 ? 0 : sortedOffsets.length % 2 === 1 ? sortedOffsets[mid]! : (sortedOffsets[mid - 1]! + sortedOffsets[mid]!) / 2;
  const sortedLengths = [...doorLengths].sort((a, b) => a - b);

  const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length);
  return {
    lengthMm,
    bends: bends.length,
    bends90,
    bends45: bends.length - bends90,
    bendsServedRooms,
    bendsCorridors,
    bendsOther,
    tees,
    crosses,
    straightPieces5m: pieces.filter((m) => m >= LONG_STRAIGHT_MM).length,
    longestStraightMm: pieces.length === 0 ? 0 : Math.max(...pieces),
    meanBendsToTerminal: mean(bendCounts),
    maxBendsToTerminal: bendCounts.length === 0 ? 0 : Math.max(...bendCounts),
    pathToManhattan: mean(manhattanRatios),
    multiEntryRooms: multiEntryRoomIds.length,
    chainedRooms: chained.size,
    chainedRoomIds: [...chained].sort(),
    chainedVia,
    multiEntryRoomIds,
    multiEntryPointsMm,
    singleTerminalStraight: { rooms: singleRooms, straight: singleStraight },
    singleTerminalBentRoomIds,
    bendPlaces: bendPlaceCounts,
    teeOffsetMm: { max: offsets.length === 0 ? 0 : Math.max(...offsets), median: medianOffset },
    branches,
    longestPathFromStartMm: reached.length === 0 ? 0 : Math.max(...reached.map((r) => r.length)),
    branchLengthP90Mm: sortedLengths.length === 0 ? 0 : sortedLengths[Math.ceil(0.9 * sortedLengths.length) - 1]!,
    portsWithManyEnds: terminals.filter((t) => t.node !== null && deg(t.node) > 1).length,
  };
}

/** One polyline per segment of the plan, in mm. A vertex with a deflection below 1 degree is removed. */
export function polylinesOfPlan(plan: PlannedRoute, mmPerPt: number): Vec2[][] {
  const out: Vec2[][] = [];
  for (const segment of plan.segments) {
    if (segment.geometry.length < 2) continue;
    const pts = segment.geometry.map((p) => ({ x: p.x * mmPerPt, y: p.y * mmPerPt }));
    const line: Vec2[] = [pts[0]!];
    for (let i = 1; i + 1 < pts.length; i++) {
      if (deflectionDeg(line[line.length - 1]!, pts[i]!, pts[i + 1]!) >= COLLINEAR_DEG) line.push(pts[i]!);
    }
    line.push(pts[pts.length - 1]!);
    out.push(line);
  }
  return out;
}
