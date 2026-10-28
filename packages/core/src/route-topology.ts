// The topology of the planned paths (auto-routing-r6.md §4.3 steps 8 and 11): the off-graph connection and the
// segments and fittings that the paths make. Pure, no scene. All input is in mm. The page points go out.

import type { Vec2 } from './geometry.js';
import { ROUTED_MARK, type ConnectionPoint, type Discipline, type Fitting, type FittingKind, type Segment } from './network.js';
import { placeTapPosition } from './route-branch.js';
import { elbowPath, legClass, MIN_LEG_MM, type RouteLayoutOptions } from './route-layout.js';
import { searchLink } from './route-link.js';

export const PLACEHOLDER_DIAMETER_MM: Record<Discipline, number> =
  { ventilation: 200, heatingAndCooling: 25, plumbing: 25, fireProtection: 50, electrical: 25, other: 50 };

export interface TopologyPort { point: Vec2; /* mm */ pagePoint: Vec2; stampId: string; portId: string }
export interface TopologyInput {
  paths: readonly (readonly Vec2[])[];
  /** Vertices that are stamp ports (start port and target ports). A port is a terminal: never a fitting. */
  ports: readonly TopologyPort[];
  /** The existing fitting where the route starts. Terminal, not created. */
  stubFitting: { point: Vec2; pagePoint: Vec2; fittingId: string } | null;
  /** mm. Segments are oriented away from this vertex (endpointA = parent, endpointB = child). */
  startPoint: Vec2;
  networkTypeId: string; discipline: Discipline; pageIndex: number; mmPerPt: number;
  newSegmentId: () => string; newFittingId: () => string;
}
export interface TopologyResult { segments: Segment[]; fittings: Fitting[]; lengthMm: number; bends90: number; bends45: number; freeLegs: number; freePoints: Vec2[] }

const KEY_SCALE = 1e4;
const NEAR_MM = 1e-6;
const LINK_TAP_LIMIT = 8;

interface Vertex { x: number; y: number; rx: number; ry: number }

function keyOf(p: Vec2): string {
  return `${Math.round(p.x * KEY_SCALE)},${Math.round(p.y * KEY_SCALE)}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareVertex(a: Vertex, b: Vertex): number {
  return a.rx !== b.rx ? a.rx - b.rx : a.ry - b.ry;
}

function edgeKey(a: string, b: string): string {
  return compareText(a, b) <= 0 ? `${a}|${b}` : `${b}|${a}`;
}

export function buildRouteItems(input: TopologyInput): TopologyResult {
  const vertices = new Map<string, Vertex>();
  const addVertex = (p: Vec2): string => {
    const key = keyOf(p);
    if (!vertices.has(key)) vertices.set(key, { x: p.x, y: p.y, rx: Math.round(p.x * KEY_SCALE), ry: Math.round(p.y * KEY_SCALE) });
    return key;
  };

  const rawLegs: [string, string][] = [];
  for (const path of input.paths) {
    for (let i = 1; i < path.length; i++) {
      const a = addVertex(path[i - 1]!);
      const b = addVertex(path[i]!);
      rawLegs.push([a, b]);
    }
  }
  const portByKey = new Map<string, TopologyPort>();
  for (const port of input.ports) {
    const key = keyOf(port.point);
    if (!portByKey.has(key)) portByKey.set(key, port);
  }
  const stubKey = input.stubFitting ? keyOf(input.stubFitting.point) : null;
  const startKey = keyOf(input.startPoint);

  // Split every leg at the vertices that lie inside it.
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (a === b) return;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  const all = [...vertices.entries()];
  for (const [ka, kb] of rawLegs) {
    if (ka === kb) continue;
    const a = vertices.get(ka)!;
    const b = vertices.get(kb)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const inner: { t: number; key: string }[] = [];
    for (const [key, v] of all) {
      if (key === ka || key === kb) continue;
      const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      const offset = Math.abs((v.x - a.x) * dy - (v.y - a.y) * dx) / len;
      if (offset < NEAR_MM) inner.push({ t, key });
    }
    inner.sort((p, q) => p.t - q.t);
    let previous = ka;
    for (const { key } of inner) {
      link(previous, key);
      previous = key;
    }
    link(previous, kb);
  }

  const isTerminal = (key: string): boolean => portByKey.has(key) || key === stubKey || key === startKey;

  // Delete a dangling leg: a leg whose end has degree 1 and is not a terminal. Repeat until stable.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [key, neighbours] of [...adjacency]) {
      if (neighbours.size !== 1 || isTerminal(key)) continue;
      const other = [...neighbours][0]!;
      adjacency.get(other)!.delete(key);
      adjacency.delete(key);
      changed = true;
    }
  }

  // Remove a degree-2 node on a straight line. Repeat until stable.
  for (let changed = true; changed; ) {
    changed = false;
    const keys = [...adjacency.keys()].sort((p, q) => compareVertex(vertices.get(p)!, vertices.get(q)!));
    for (const key of keys) {
      const neighbours = adjacency.get(key);
      if (!neighbours || neighbours.size !== 2 || isTerminal(key)) continue;
      const [n1, n2] = [...neighbours] as [string, string];
      if (adjacency.get(n1)!.has(n2)) continue;
      const v = vertices.get(key)!;
      const p1 = vertices.get(n1)!;
      const p2 = vertices.get(n2)!;
      const ux = p1.x - v.x;
      const uy = p1.y - v.y;
      const wx = p2.x - v.x;
      const wy = p2.y - v.y;
      const cross = ux * wy - uy * wx;
      const dot = ux * wx + uy * wy;
      if (Math.abs(cross) > 1e-6 * Math.hypot(ux, uy) * Math.hypot(wx, wy) || dot >= 0) continue;
      adjacency.get(n1)!.delete(key);
      adjacency.get(n2)!.delete(key);
      adjacency.delete(key);
      link(n1, n2);
      changed = true;
    }
  }

  const nodeKeys = [...adjacency.keys()].filter((key) => adjacency.get(key)!.size > 0).sort((p, q) => compareVertex(vertices.get(p)!, vertices.get(q)!));
  const toPage = (v: Vertex): Vec2 => ({ x: v.x / input.mmPerPt, y: v.y / input.mmPerPt });

  // Fittings: ids in the order of position (x, then y).
  const fittingKinds = new Map<string, FittingKind>();
  const fittings: Fitting[] = [];
  const fittingIdByKey = new Map<string, string>();
  for (const key of nodeKeys) {
    if (portByKey.has(key) || key === stubKey) continue;
    const degree = adjacency.get(key)!.size;
    const kind: FittingKind = degree === 2 ? 'elbow' : degree === 3 ? 'tee' : degree >= 4 ? 'cross' : 'junction';
    fittingKinds.set(key, kind);
    const id = input.newFittingId();
    fittingIdByKey.set(key, id);
    fittings.push({ id, pageIndex: input.pageIndex, position: toPage(vertices.get(key)!), kind, routedBy: ROUTED_MARK });
  }
  if (stubKey !== null && input.stubFitting) fittingIdByKey.set(stubKey, input.stubFitting.fittingId);

  const endOf = (key: string): { point: ConnectionPoint; sort: string; page: Vec2 } => {
    const port = portByKey.get(key);
    if (port) return { point: { kind: 'port', elementId: port.stampId, portId: port.portId }, sort: `port:${port.stampId}:${port.portId}`, page: { x: port.pagePoint.x, y: port.pagePoint.y } };
    if (key === stubKey && input.stubFitting) {
      const stub = input.stubFitting;
      return { point: { kind: 'fitting', fittingId: stub.fittingId }, sort: stub.fittingId, page: { x: stub.pagePoint.x, y: stub.pagePoint.y } };
    }
    const id = fittingIdByKey.get(key)!;
    return { point: { kind: 'fitting', fittingId: id }, sort: id, page: toPage(vertices.get(key)!) };
  };

  // Orientation: breadth first from the start vertex, neighbours in the order of position.
  const order = new Map<string, number>();
  const walk = (root: string): void => {
    if (order.has(root)) return;
    const queue = [root];
    order.set(root, order.size);
    for (let head = 0; head < queue.length; head++) {
      const next = [...adjacency.get(queue[head]!)!].sort((p, q) => compareVertex(vertices.get(p)!, vertices.get(q)!));
      for (const key of next) {
        if (order.has(key)) continue;
        order.set(key, order.size);
        queue.push(key);
      }
    }
  };
  if (adjacency.has(startKey)) walk(startKey);
  for (const key of nodeKeys) walk(key);

  interface Planned { a: string; b: string; ea: ReturnType<typeof endOf>; eb: ReturnType<typeof endOf> }
  const planned: Planned[] = [];
  const seen = new Set<string>();
  for (const key of nodeKeys) {
    for (const other of adjacency.get(key)!) {
      const id = edgeKey(key, other);
      if (seen.has(id)) continue;
      seen.add(id);
      const oa = order.get(key)!;
      const ob = order.get(other)!;
      const firstIsParent = oa !== ob ? oa < ob : compareVertex(vertices.get(key)!, vertices.get(other)!) <= 0;
      const a = firstIsParent ? key : other;
      const b = firstIsParent ? other : key;
      planned.push({ a, b, ea: endOf(a), eb: endOf(b) });
    }
  }
  planned.sort((p, q) => compareText(p.ea.sort, q.ea.sort) || compareText(p.eb.sort, q.eb.sort));

  const diameter = PLACEHOLDER_DIAMETER_MM[input.discipline];
  const segments: Segment[] = [];
  let lengthMm = 0;
  let freeLegs = 0;
  const freePoints: Vec2[] = [];
  for (const item of planned) {
    const va = vertices.get(item.a)!;
    const vb = vertices.get(item.b)!;
    lengthMm += Math.hypot(vb.x - va.x, vb.y - va.y);
    if (legClass(va, vb) === 'free') {
      freeLegs++;
      freePoints.push({ x: (item.ea.page.x + item.eb.page.x) / 2, y: (item.ea.page.y + item.eb.page.y) / 2 });
    }
    segments.push({
      id: input.newSegmentId(),
      pageIndex: input.pageIndex,
      networkTypeId: input.networkTypeId,
      shape: 'round',
      diameter,
      routedBy: ROUTED_MARK,
      endpointA: item.ea.point,
      endpointB: item.eb.point,
      geometry: [item.ea.page, item.eb.page],
    });
  }

  let bends90 = 0;
  let bends45 = 0;
  for (const [key, kind] of fittingKinds) {
    if (kind !== 'elbow') continue;
    const [n1, n2] = [...adjacency.get(key)!] as [string, string];
    const v = vertices.get(key)!;
    const p1 = vertices.get(n1)!;
    const p2 = vertices.get(n2)!;
    const ux = v.x - p1.x;
    const uy = v.y - p1.y;
    const wx = p2.x - v.x;
    const wy = p2.y - v.y;
    const deflection = (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
    if (Math.abs(deflection - 90) <= 1) bends90++;
    else if (Math.abs(deflection - 45) <= 1) bends45++;
  }

  return { segments, fittings, lengthMm, bends90, bends45, freeLegs, freePoints };
}

export interface LoosePort { id: string; point: Vec2 }
export interface ConnectLooseInput {
  /** The route built so far, mm. */
  paths: readonly (readonly Vec2[])[];
  startPoint: Vec2;
  loose: readonly LoosePort[];
  /** Every target port point. A target port is a leaf: never a tap. */
  targetPoints: readonly Vec2[];
  /** More points that are never a tap, for example the start port. */
  noTapPoints?: readonly Vec2[];
  /** The collision hook of T13. Default: accept all. */
  accepts?: (path: Vec2[], portId: string) => boolean;
  /** Layout options, passed on by planRoute. This step reads linkSearch and offGraphAxis. */
  options?: RouteLayoutOptions;
  /** Room id at a point (mm), or null in a wall or outside. Used by the link search. Absent: no room, so no wall price. */
  roomAt?: (p: Vec2) => string | null;
  /** Room corner points (mm) for the link search. */
  roomCorners?: readonly Vec2[];
}
export interface ConnectLooseResult { paths: Vec2[][]; connectedIds: string[]; left: string[] }

interface Tap { point: Vec2; distance: number; perpendicular: 'x' | 'y' | null }

function copyPoint(p: Vec2): Vec2 {
  return { x: p.x, y: p.y };
}

function cleanPath(path: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) <= NEAR_MM) continue;
    out.push(copyPoint(p));
  }
  return out;
}

function distanceToPieceMm(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const OVER_PORT_MM = 1;

/** True when another target port point lies within 1 mm of a leg of the path. The end point of the path is the port itself. */
function runsOverOtherPort(path: readonly Vec2[], targetPoints: readonly Vec2[]): boolean {
  const end = path[path.length - 1]!;
  return targetPoints.some((t) => {
    if (Math.hypot(t.x - end.x, t.y - end.y) <= OVER_PORT_MM) return false;
    for (let i = 1; i < path.length; i++) if (distanceToPieceMm(t, path[i - 1]!, path[i]!) <= OVER_PORT_MM) return true;
    return false;
  });
}

/** All tap candidates for a loose port, nearest first (tie: leg order). The vertices of the route count only when it has no axis leg. */
function tapCandidates(port: Vec2, paths: readonly (readonly Vec2[])[], startPoint: Vec2, targetKeys: ReadonlySet<string>): Tap[] {
  const points: Vec2[] = [startPoint];
  for (const path of paths) points.push(...path);
  const axisTaps: Tap[] = [];
  const vertexTaps: Tap[] = [];
  const consider = (list: Tap[], point: Vec2, perpendicular: 'x' | 'y' | null): void => {
    list.push({ point, distance: Math.hypot(port.x - point.x, port.y - point.y), perpendicular });
  };
  const byDistance = (a: Tap, b: Tap): number => (Math.abs(a.distance - b.distance) <= 1e-9 ? 0 : a.distance - b.distance);

  let hasAxisLeg = false;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= NEAR_MM || legClass(a, b) !== 'axis') continue;
      hasAxisLeg = true;
      if (len < 2 * MIN_LEG_MM) {
        for (const end of [a, b]) {
          if (!targetKeys.has(keyOf(end))) consider(axisTaps, copyPoint(end), null);
        }
        continue;
      }
      const horizontal = Math.abs(b.y - a.y) <= Math.abs(b.x - a.x);
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      const preferred = Math.min(Math.max((port.x - a.x) * dx + (port.y - a.y) * dy, 0), len);
      const blockers: number[] = [];
      for (const p of points) {
        const s = (p.x - a.x) * dx + (p.y - a.y) * dy;
        if (s <= NEAR_MM || s >= len - NEAR_MM) continue;
        if (Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) < NEAR_MM) blockers.push(s);
      }
      const s = placeTapPosition(len, preferred, blockers, MIN_LEG_MM);
      const point = horizontal ? { x: a.x + dx * s, y: a.y } : { x: a.x, y: a.y + dy * s };
      consider(axisTaps, point, horizontal ? 'y' : 'x');
    }
  }
  for (const p of points) {
    if (!targetKeys.has(keyOf(p))) consider(vertexTaps, copyPoint(p), null);
  }
  const ordered = hasAxisLeg && axisTaps.length > 0 ? axisTaps.sort(byDistance) : vertexTaps.sort(byDistance);
  if (ordered.length > 0) return ordered;
  return [{ point: copyPoint(startPoint), distance: Math.hypot(port.x - startPoint.x, port.y - startPoint.y), perpendicular: null }];
}

/** Joins each loose port to the nearest point of the built route, one port at a time (nearest first, tie: lower id). */
export function connectLoosePorts(input: ConnectLooseInput): ConnectLooseResult {
  const accepts = input.accepts ?? (() => true);
  const targetKeys = new Set([...input.targetPoints, ...(input.noTapPoints ?? [])].map(keyOf));
  const built: Vec2[][] = input.paths.map((path) => path.map(copyPoint));
  const added: Vec2[][] = [];
  const connectedIds: string[] = [];
  const left: string[] = [];
  const pending = [...input.loose];
  const roomCache = new Map<string, string | null>();

  while (pending.length > 0) {
    let bestIndex = -1;
    let bestCandidates: Tap[] = [];
    for (let i = 0; i < pending.length; i++) {
      const candidates = tapCandidates(pending[i]!.point, built, input.startPoint, targetKeys);
      const tap = candidates[0]!;
      const bestTap = bestCandidates[0];
      const better = !bestTap || tap.distance < bestTap.distance - 1e-9 || (Math.abs(tap.distance - bestTap.distance) <= 1e-9 && pending[i]!.id < pending[bestIndex]!.id);
      if (better) {
        bestIndex = i;
        bestCandidates = candidates;
      }
    }
    const port = pending.splice(bestIndex, 1)[0]!;

    let chosen: Vec2[] | null = null;
    const linkSearch = input.options?.linkSearch;
    if (linkSearch) {
      const found = searchLink({
        port: port.point,
        taps: bestCandidates.slice(0, LINK_TAP_LIMIT).map((t) => ({ point: t.point, perpendicular: t.perpendicular })),
        built,
        corners: input.roomCorners ?? [],
        roomAt: input.roomAt ?? (() => null),
        bendMm: linkSearch.bendMm,
        wallMm: linkSearch.wallMm,
        roomCache,
      });
      if (found) {
        const path = cleanPath(found);
        if (path.length >= 2 && accepts(path, port.id) && !runsOverOtherPort(path, input.targetPoints)) chosen = path;
      }
    }
    if (!chosen) {
      const axisMode = input.options?.offGraphAxis ?? 'perpendicular';
      const tried: string[] = [];
      for (const tap of bestCandidates) {
        const dx = port.point.x - tap.point.x;
        const dy = port.point.y - tap.point.y;
        const longer: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        const first = axisMode === 'longer' ? longer : (tap.perpendicular ?? longer);
        const second: 'x' | 'y' = first === 'x' ? 'y' : 'x';
        for (const axis of [first, second]) {
          const path = cleanPath(elbowPath(tap.point, port.point, axis));
          const signature = path.map(keyOf).join(';');
          if (tried.includes(signature)) continue;
          tried.push(signature);
          if (path.length >= 2 && accepts(path, port.id) && !runsOverOtherPort(path, input.targetPoints)) {
            chosen = path;
            break;
          }
        }
        if (chosen) break;
      }
    }
    if (!chosen) {
      left.push(port.id);
      continue;
    }
    connectedIds.push(port.id);
    built.push(chosen);
    added.push(chosen);
  }
  return { paths: added, connectedIds, left: left.sort(compareText) };
}
