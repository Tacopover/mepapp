import type { Vec2 } from './geometry.js';
import { StateHeap } from './route-heap.js';

export const BEND_PENALTY_MM = 500;
export const CROSSING_PENALTY_MM = 1000;

export interface SpineInput {
  root: Vec2;
  entryDir: Vec2;
  ports: readonly { id: string; point: Vec2 }[];
  inside: (p: Vec2) => boolean;
  crossesExisting: (a: Vec2, b: Vec2) => number;
  stepMm?: number;
  /** Cost of one bend, mm. Default BEND_PENALTY_MM. */
  bendPenaltyMm?: number;
  /** Cost of one crossing, mm. Default CROSSING_PENALTY_MM. */
  crossingPenaltyMm?: number;
  /** Extra grid lines in x, mm. */
  gridXs?: readonly number[];
  /** Extra grid lines in y, mm. */
  gridYs?: readonly number[];
}

export interface SpineResult {
  paths: Vec2[][];
  unreachedPortIds: string[];
  lengthMm: number;
}

export interface SpineGrid {
  xs: number[];
  ys: number[];
  nx: number;
  ny: number;
  nodeCount: number;
  rootNode: number;
  portNodes: number[];
  isPortNode: Uint8Array;
  nodeAt(p: Vec2): number;
  pointOf(n: number): Vec2;
  edgeInfo(u: number, v: number): { blocked: boolean; crossings: number };
  neighbour(n: number, h: number): number;
}

const DEFAULT_STEP_MM = 100;

export function headingOf(dir: Vec2): number {
  if (Math.abs(dir.x) >= Math.abs(dir.y)) return dir.x >= 0 ? 0 : 1;
  return dir.y >= 0 ? 2 : 3;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

interface EdgeInfo {
  blocked: boolean;
  crossings: number;
}

export function makeSpineGrid(input: SpineInput): SpineGrid {
  const { root, ports, inside, crossesExisting } = input;
  const stepMm = input.stepMm && input.stepMm > 0 ? input.stepMm : DEFAULT_STEP_MM;

  const xs = uniqueSorted([root.x, ...ports.map((p) => p.point.x), ...(input.gridXs ?? [])]);
  const ys = uniqueSorted([root.y, ...ports.map((p) => p.point.y), ...(input.gridYs ?? [])]);
  const nx = xs.length;
  const ny = ys.length;
  const nodeCount = nx * ny;
  const xIndex = new Map(xs.map((x, i) => [x, i]));
  const yIndex = new Map(ys.map((y, j) => [y, j]));
  const nodeAt = (p: Vec2): number => xIndex.get(p.x)! * ny + yIndex.get(p.y)!;
  const pointOf = (n: number): Vec2 => ({ x: xs[Math.floor(n / ny)]!, y: ys[n % ny]! });

  const rootNode = nodeAt(root);
  const portNodes = ports.map((p) => nodeAt(p.point));
  const isPortNode = new Uint8Array(nodeCount);
  for (const n of portNodes) if (n !== rootNode) isPortNode[n] = 1;

  const edgeCache = new Map<number, EdgeInfo>();
  const edgeInfo = (u: number, v: number): EdgeInfo => {
    const key = u < v ? u * nodeCount + v : v * nodeCount + u;
    let info = edgeCache.get(key);
    if (info) return info;
    const a = pointOf(u);
    const b = pointOf(v);
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const parts = Math.max(1, Math.ceil(len / stepMm));
    let blocked = false;
    for (let k = 0; k <= parts && !blocked; k++) {
      const t = k / parts;
      if (!inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) blocked = true;
    }
    info = { blocked, crossings: blocked ? 0 : crossesExisting(a, b) };
    edgeCache.set(key, info);
    return info;
  };

  const neighbour = (n: number, h: number): number => {
    const i = Math.floor(n / ny);
    const j = n % ny;
    if (h === 0) return i + 1 < nx ? (i + 1) * ny + j : -1;
    if (h === 1) return i > 0 ? (i - 1) * ny + j : -1;
    if (h === 2) return j + 1 < ny ? i * ny + j + 1 : -1;
    return j > 0 ? i * ny + j - 1 : -1;
  };

  return {
    xs,
    ys,
    nx,
    ny,
    nodeCount,
    rootNode,
    portNodes,
    isPortNode,
    nodeAt,
    pointOf,
    edgeInfo,
    neighbour,
  };
}

export function treeLengthMm(grid: SpineGrid, treeAdj: Map<number, Set<number>>): number {
  let lengthMm = 0;
  for (const [u, set] of treeAdj) {
    for (const v of set) {
      if (u < v) {
        const a = grid.pointOf(u);
        const b = grid.pointOf(v);
        lengthMm += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      }
    }
  }
  return lengthMm;
}

export function spinePaths(
  grid: SpineGrid,
  treeAdj: Map<number, Set<number>>,
  reachedPortNode: Uint8Array,
): Vec2[][] {
  const { nodeCount, rootNode, pointOf } = grid;
  const paths: Vec2[][] = [];
  const isBreak = (n: number): boolean =>
    n === rootNode || reachedPortNode[n] === 1 || (treeAdj.get(n)?.size ?? 0) !== 2;
  const usedEdges = new Set<number>();
  const edgeKey = (u: number, v: number): number =>
    u < v ? u * nodeCount + v : v * nodeCount + u;

  const walk = (start: number): void => {
    const neighbours = [...(treeAdj.get(start) ?? [])].sort((a, b) => a - b);
    for (const first of neighbours) {
      if (usedEdges.has(edgeKey(start, first))) continue;
      const chain = [start];
      let prev = start;
      let cur = first;
      usedEdges.add(edgeKey(prev, cur));
      chain.push(cur);
      while (!isBreak(cur)) {
        let nextNode = -1;
        for (const m of treeAdj.get(cur)!) if (m !== prev) nextNode = m;
        usedEdges.add(edgeKey(cur, nextNode));
        prev = cur;
        cur = nextNode;
        chain.push(cur);
      }
      const pts: Vec2[] = [];
      for (let idx = 0; idx < chain.length; idx++) {
        const p = pointOf(chain[idx]!);
        if (idx > 0 && idx < chain.length - 1) {
          const a = pointOf(chain[idx - 1]!);
          const b = pointOf(chain[idx + 1]!);
          const straight = (a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y);
          if (straight) continue;
        }
        pts.push(p);
      }
      paths.push(pts);
      walk(cur);
    }
  };
  walk(rootNode);
  return paths;
}

export function roomSpine(input: SpineInput): SpineResult {
  const { ports } = input;
  const grid = makeSpineGrid(input);
  const { nodeCount, rootNode, portNodes, isPortNode, neighbour, pointOf, edgeInfo } = grid;

  const inTree = new Uint8Array(nodeCount);
  const isTreeSource = new Uint8Array(nodeCount);
  inTree[rootNode] = 1;
  isTreeSource[rootNode] = 1;
  const treeAdj = new Map<number, Set<number>>();
  const reached = new Array<boolean>(ports.length).fill(false);
  let firstIteration = true;
  const entryHeading = headingOf(input.entryDir);
  const bendMm = input.bendPenaltyMm ?? BEND_PENALTY_MM;
  const crossingMm = input.crossingPenaltyMm ?? CROSSING_PENALTY_MM;

  const settleCoincident = (): void => {
    for (let k = 0; k < ports.length; k++) {
      if (reached[k]) continue;
      const n = portNodes[k]!;
      if (n === rootNode || (inTree[n] && isPortNode[n])) reached[k] = true;
    }
  };

  const addEdge = (u: number, v: number): void => {
    if (!treeAdj.has(u)) treeAdj.set(u, new Set());
    if (!treeAdj.has(v)) treeAdj.set(v, new Set());
    treeAdj.get(u)!.add(v);
    treeAdj.get(v)!.add(u);
  };

  for (;;) {
    settleCoincident();
    if (reached.every((r) => r)) break;

    const dist = new Float64Array(nodeCount * 4).fill(Infinity);
    const pred = new Int32Array(nodeCount * 4).fill(-1);
    const done = new Uint8Array(nodeCount * 4);
    const heap = new StateHeap();
    if (firstIteration) {
      const s = rootNode * 4 + entryHeading;
      dist[s] = 0;
      heap.push(0, s);
    } else {
      for (let n = 0; n < nodeCount; n++) {
        if (!isTreeSource[n]) continue;
        for (let h = 0; h < 4; h++) {
          dist[n * 4 + h] = 0;
          heap.push(0, n * 4 + h);
        }
      }
    }

    while (heap.size > 0) {
      const { cost, state } = heap.pop();
      if (done[state]) continue;
      done[state] = 1;
      const u = state >> 2;
      const h = state & 3;
      if (isPortNode[u]) continue;
      for (let h2 = 0; h2 < 4; h2++) {
        if (h2 === (h ^ 1)) continue;
        const v = neighbour(u, h2);
        if (v < 0 || inTree[v]) continue;
        const info = edgeInfo(u, v);
        if (info.blocked) continue;
        const a = pointOf(u);
        const b = pointOf(v);
        const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        const next =
          cost + len + (h2 !== h ? bendMm : 0) + crossingMm * info.crossings;
        const ns = v * 4 + h2;
        if (next < dist[ns]!) {
          dist[ns] = next;
          pred[ns] = state;
          heap.push(next, ns);
        }
      }
    }

    let bestPort = -1;
    let bestState = -1;
    let bestCost = Infinity;
    let bestNode = Infinity;
    for (let k = 0; k < ports.length; k++) {
      if (reached[k]) continue;
      const n = portNodes[k]!;
      let cost = Infinity;
      let st = -1;
      for (let h = 0; h < 4; h++) {
        if (dist[n * 4 + h]! < cost) {
          cost = dist[n * 4 + h]!;
          st = n * 4 + h;
        }
      }
      if (st < 0) continue;
      if (cost < bestCost || (cost === bestCost && n < bestNode)) {
        bestCost = cost;
        bestNode = n;
        bestPort = k;
        bestState = st;
      }
    }
    if (bestPort < 0) break;

    let s = bestState;
    while (pred[s]! >= 0) {
      const p = pred[s]!;
      const u = p >> 2;
      const v = s >> 2;
      addEdge(u, v);
      inTree[v] = 1;
      if (!isPortNode[v]) isTreeSource[v] = 1;
      s = p;
    }
    reached[bestPort] = true;
    firstIteration = false;
  }

  const unreachedPortIds: string[] = [];
  for (let k = 0; k < ports.length; k++) if (!reached[k]) unreachedPortIds.push(ports[k]!.id);

  const reachedPortNode = new Uint8Array(nodeCount);
  for (let k = 0; k < ports.length; k++) if (reached[k]) reachedPortNode[portNodes[k]!] = 1;
  const paths = treeAdj.size > 0 ? spinePaths(grid, treeAdj, reachedPortNode) : [];

  return { paths, unreachedPortIds, lengthMm: treeLengthMm(grid, treeAdj) };
}
