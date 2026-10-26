import type { Vec2 } from './geometry.js';
import { StateHeap } from './route-heap.js';

export const LINK_STEP_MM = 100;
export const LINK_INSET_MM = 200;
export const LINK_MAX_CORNER_LINES = 20;

const LINK_BOX_MM = 2000;
const EPS = 1e-6;

export interface LinkTap {
  point: Vec2;
  perpendicular: 'x' | 'y' | null;
}

export interface LinkSearchInput {
  port: Vec2;
  taps: readonly LinkTap[];
  built: readonly (readonly Vec2[])[];
  corners: readonly Vec2[];
  roomAt: (p: Vec2) => string | null;
  bendMm: number;
  wallMm: number;
  roomCache?: Map<string, string | null>;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function nearly(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

/** Common part of the closed segments a-b and c-d: one point, 'overlap' or null. */
function sharedPoint(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | 'overlap' | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) > EPS) {
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * ry - qy * rx) / denom;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { x: a.x + rx * t, y: a.y + ry * t };
  }
  if (Math.abs(qx * ry - qy * rx) > EPS) return null;
  const useX = Math.abs(rx) >= Math.abs(ry);
  const key = (p: Vec2): number => (useX ? p.x : p.y);
  const lo = Math.max(Math.min(key(a), key(b)), Math.min(key(c), key(d)));
  const hi = Math.min(Math.max(key(a), key(b)), Math.max(key(c), key(d)));
  if (lo > hi + EPS) return null;
  if (hi - lo > EPS) return 'overlap';
  return [a, b, c, d].find((p) => Math.abs(key(p) - lo) <= EPS)!;
}

function nearestLines(values: number[], lo: number, hi: number): number[] {
  const distance = (v: number): number => Math.max(0, lo - v, v - hi);
  return uniqueSorted(values)
    .sort((a, b) => distance(a) - distance(b) || a - b)
    .slice(0, LINK_MAX_CORNER_LINES);
}

/** Path from the tap (first point) to the port (last point), collinear points removed. null = no path. */
export function searchLink(input: LinkSearchInput): Vec2[] | null {
  const { port, taps, built, corners, roomAt, bendMm, wallMm } = input;
  const roomCache = input.roomCache ?? new Map<string, string | null>();

  let minX = port.x;
  let maxX = port.x;
  let minY = port.y;
  let maxY = port.y;
  for (const tap of taps) {
    minX = Math.min(minX, tap.point.x);
    maxX = Math.max(maxX, tap.point.x);
    minY = Math.min(minY, tap.point.y);
    maxY = Math.max(maxY, tap.point.y);
  }
  minX -= LINK_BOX_MM;
  maxX += LINK_BOX_MM;
  minY -= LINK_BOX_MM;
  maxY += LINK_BOX_MM;

  const cornerXs: number[] = [];
  const cornerYs: number[] = [];
  for (const c of corners) {
    if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue;
    cornerXs.push(c.x - LINK_INSET_MM, c.x + LINK_INSET_MM);
    cornerYs.push(c.y - LINK_INSET_MM, c.y + LINK_INSET_MM);
  }

  const xs = uniqueSorted([
    port.x,
    ...taps.map((t) => t.point.x),
    ...nearestLines(cornerXs, minX, maxX),
  ]);
  const ys = uniqueSorted([
    port.y,
    ...taps.map((t) => t.point.y),
    ...nearestLines(cornerYs, minY, maxY),
  ]);
  const nx = xs.length;
  const ny = ys.length;
  const nodeCount = nx * ny;
  const xIndex = new Map(xs.map((x, i) => [x, i]));
  const yIndex = new Map(ys.map((y, j) => [y, j]));
  const nodeAt = (p: Vec2): number => xIndex.get(p.x)! * ny + yIndex.get(p.y)!;
  const pointOf = (n: number): Vec2 => ({ x: xs[Math.floor(n / ny)]!, y: ys[n % ny]! });

  const neighbour = (n: number, h: number): number => {
    const i = Math.floor(n / ny);
    const j = n % ny;
    if (h === 0) return i + 1 < nx ? (i + 1) * ny + j : -1;
    if (h === 1) return i > 0 ? (i - 1) * ny + j : -1;
    if (h === 2) return j + 1 < ny ? i * ny + j + 1 : -1;
    return j > 0 ? i * ny + j - 1 : -1;
  };

  const portNode = nodeAt(port);
  const tapNodes = taps.map((t) => nodeAt(t.point));
  const isTapNode = new Uint8Array(nodeCount);
  for (const n of tapNodes) isTapNode[n] = 1;

  const isTarget = (node: number, h: number): boolean =>
    taps.some((tap, k) => {
      if (tapNodes[k] !== node) return false;
      if (tap.perpendicular === null) return true;
      return tap.perpendicular === 'x' ? h < 2 : h >= 2;
    });

  const legStarts: Vec2[] = [];
  const legEnds: Vec2[] = [];
  const legBox: number[] = [];
  for (const leg of built) {
    const segments = leg.length === 1 ? 1 : leg.length - 1;
    for (let i = 0; i < segments; i++) {
      const c = leg[i]!;
      const d = leg[Math.min(i + 1, leg.length - 1)]!;
      legStarts.push(c);
      legEnds.push(d);
      legBox.push(Math.min(c.x, d.x), Math.min(c.y, d.y), Math.max(c.x, d.x), Math.max(c.y, d.y));
    }
  }

  const blockedByLegs = (u: number, v: number): boolean => {
    const a = pointOf(u);
    const b = pointOf(v);
    const uIsTap = isTapNode[u] === 1;
    const vIsTap = isTapNode[v] === 1;
    const x0 = Math.min(a.x, b.x) - EPS;
    const x1 = Math.max(a.x, b.x) + EPS;
    const y0 = Math.min(a.y, b.y) - EPS;
    const y1 = Math.max(a.y, b.y) + EPS;
    for (let i = 0; i < legStarts.length; i++) {
      if (legBox[4 * i + 2]! < x0 || legBox[4 * i]! > x1 || legBox[4 * i + 3]! < y0 || legBox[4 * i + 1]! > y1) continue;
      const shared = sharedPoint(a, b, legStarts[i]!, legEnds[i]!);
      if (shared === null) continue;
      if (
        shared !== 'overlap' &&
        ((uIsTap && nearly(shared, a)) || (vIsTap && nearly(shared, b)))
      ) {
        continue;
      }
      return true;
    }
    return false;
  };

  const roomOf = (p: Vec2): string | null => {
    const key = `${p.x},${p.y}`;
    let room = roomCache.get(key);
    if (room === undefined) {
      room = roomAt(p);
      roomCache.set(key, room);
    }
    return room;
  };

  const blockedCache = new Map<number, boolean>();
  const isBlocked = (u: number, v: number): boolean => {
    const key = u < v ? u * nodeCount + v : v * nodeCount + u;
    let blocked = blockedCache.get(key);
    if (blocked === undefined) {
      blocked = blockedByLegs(u, v);
      blockedCache.set(key, blocked);
    }
    return blocked;
  };

  const exitCache = new Map<number, number>();
  const wallExits = (u: number, v: number): number => {
    const key = u * nodeCount + v;
    let exits = exitCache.get(key);
    if (exits === undefined) {
      const a = pointOf(u);
      const b = pointOf(v);
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      exits = 0;
      let previous = roomOf(a);
      for (let d = LINK_STEP_MM; d < len; d += LINK_STEP_MM) {
        const current = roomOf({ x: a.x + dx * d, y: a.y + dy * d });
        if (previous !== null && previous !== current) exits++;
        previous = current;
      }
      if (previous !== null && previous !== roomOf(b)) exits++;
      exitCache.set(key, exits);
    }
    return exits;
  };

  const dist = new Float64Array(nodeCount * 4).fill(Infinity);
  const pred = new Int32Array(nodeCount * 4).fill(-1);
  const done = new Uint8Array(nodeCount * 4);
  const heap = new StateHeap();
  for (let h = 0; h < 4; h++) {
    dist[portNode * 4 + h] = 0;
    heap.push(0, portNode * 4 + h);
  }

  while (heap.size > 0) {
    const { cost, state } = heap.pop();
    if (done[state]) continue;
    done[state] = 1;
    const u = state >> 2;
    const h = state & 3;
    if (isTapNode[u]) {
      if (!isTarget(u, h)) continue;
      const pts: Vec2[] = [];
      for (let s = state; s >= 0; s = pred[s]!) pts.push(pointOf(s >> 2));
      return pts.filter((p, i) => {
        if (i === 0 || i === pts.length - 1) return true;
        const a = pts[i - 1]!;
        const b = pts[i + 1]!;
        return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
      });
    }
    for (let h2 = 0; h2 < 4; h2++) {
      if (h2 === (h ^ 1)) continue;
      const v = neighbour(u, h2);
      if (v < 0 || isBlocked(u, v)) continue;
      const a = pointOf(u);
      const b = pointOf(v);
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const next =
        cost + len + (h2 !== h ? bendMm : 0) + wallMm * wallExits(u, v);
      const ns = v * 4 + h2;
      if (next < dist[ns]!) {
        dist[ns] = next;
        pred[ns] = state;
        heap.push(next, ns);
      }
    }
  }
  return null;
}
