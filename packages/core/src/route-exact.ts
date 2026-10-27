import type { Vec2 } from './geometry.js';
import { StateHeap } from './route-heap.js';
import type { SpineGrid, SpineInput, SpineResult } from './route-hanan.js';
import {
  BEND_PENALTY_MM,
  CROSSING_PENALTY_MM,
  headingOf,
  makeSpineGrid,
  roomSpine,
  spinePaths,
  treeLengthMm,
} from './route-hanan.js';

const MAX_TERMINALS = 12;
const MAX_BEND_ROUNDS = 50;
const KIND_BASE = 1;
const KIND_MERGE = 2;
const KIND_EDGE = 3;

type TreeAdj = Map<number, Set<number>>;

function cloneTree(tree: TreeAdj): TreeAdj {
  return new Map([...tree].map(([n, set]) => [n, new Set(set)]));
}

function replaceTree(tree: TreeAdj, next: TreeAdj): void {
  tree.clear();
  for (const [n, set] of next) tree.set(n, set);
}

function addTreeEdge(tree: TreeAdj, u: number, v: number): void {
  if (!tree.has(u)) tree.set(u, new Set());
  if (!tree.has(v)) tree.set(v, new Set());
  tree.get(u)!.add(v);
  tree.get(v)!.add(u);
}

function removeTreeEdge(tree: TreeAdj, u: number, v: number): void {
  tree.get(u)?.delete(v);
  if (tree.get(u)?.size === 0) tree.delete(u);
  tree.get(v)?.delete(u);
  if (tree.get(v)?.size === 0) tree.delete(v);
}

export function spineScore(
  paths: readonly (readonly Vec2[])[],
  lengthMm: number,
  input: Pick<SpineInput, 'root' | 'entryDir' | 'crossesExisting' | 'crossingPenaltyMm'>,
  bendMm: number = BEND_PENALTY_MM,
): number {
  const entryHeading = headingOf(input.entryDir);
  let crossings = 0;
  let bends = 0;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      crossings += input.crossesExisting(path[i - 1]!, path[i]!);
    }
    bends += Math.max(0, path.length - 2);
    const first: Vec2 = path[0]!;
    const leg: Vec2 | undefined = path[1];
    if (leg && first.x === input.root.x && first.y === input.root.y) {
      if (headingOf({ x: leg.x - first.x, y: leg.y - first.y }) !== entryHeading) bends++;
    }
  }
  return lengthMm + (input.crossingPenaltyMm ?? CROSSING_PENALTY_MM) * crossings + bendMm * bends;
}

export function exactRoomSpine(
  input: SpineInput,
  bendMm: number = input.bendPenaltyMm ?? BEND_PENALTY_MM,
): SpineResult {
  const heuristic = roomSpine(input);
  if (heuristic.unreachedPortIds.length > 0 || input.ports.length === 0) return heuristic;

  const grid: SpineGrid = makeSpineGrid(input);
  const { nodeCount, ny, rootNode, portNodes, isPortNode, neighbour, pointOf, edgeInfo } = grid;
  const entryHeading = headingOf(input.entryDir);
  const crossingMm = input.crossingPenaltyMm ?? CROSSING_PENALTY_MM;

  const terminals = [...new Set(portNodes.filter((n) => n !== rootNode))].sort((a, b) => a - b);
  const k = terminals.length;
  if (k === 0 || k > MAX_TERMINALS) return heuristic;
  const termBit = new Int32Array(nodeCount).fill(-1);
  terminals.forEach((n, i) => {
    termBit[n] = i;
  });

  const edgeCost = (u: number, v: number): number => {
    const a = pointOf(u);
    const b = pointOf(v);
    return Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + crossingMm * edgeInfo(u, v).crossings;
  };

  const adj: { v: number; w: number }[][] = [];
  for (let u = 0; u < nodeCount; u++) {
    const list: { v: number; w: number }[] = [];
    for (let h = 0; h < 4; h++) {
      const v = neighbour(u, h);
      if (v < 0 || edgeInfo(u, v).blocked) continue;
      list.push({ v, w: edgeCost(u, v) });
    }
    adj.push(list);
  }

  const full = (1 << k) - 1;
  const size = (full + 1) * nodeCount;
  const f = new Float64Array(size).fill(Infinity);
  const kind = new Uint8Array(size);
  const link = new Int32Array(size);
  for (let i = 0; i < k; i++) {
    const idx = (1 << i) * nodeCount + terminals[i]!;
    f[idx] = 0;
    kind[idx] = KIND_BASE;
  }

  for (let S = 1; S <= full; S++) {
    const base = S * nodeCount;
    if (S & (S - 1)) {
      const low = S & -S;
      for (let v = 0; v < nodeCount; v++) {
        if (isPortNode[v]) continue;
        let best = Infinity;
        let bestA = -1;
        for (let A = (S - 1) & S; A > 0; A = (A - 1) & S) {
          if (!(A & low)) continue;
          const cost = f[A * nodeCount + v]! + f[(S ^ A) * nodeCount + v]!;
          if (cost < best) {
            best = cost;
            bestA = A;
          }
        }
        if (bestA >= 0 && best < f[base + v]!) {
          f[base + v] = best;
          kind[base + v] = KIND_MERGE;
          link[base + v] = bestA;
        }
      }
    }

    const done = new Uint8Array(nodeCount);
    const heap = new StateHeap();
    for (let v = 0; v < nodeCount; v++) {
      if (f[base + v]! < Infinity) heap.push(f[base + v]!, v);
    }
    while (heap.size > 0) {
      const { state: u } = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (isPortNode[u] && S !== 1 << termBit[u]!) continue;
      const cu = f[base + u]!;
      for (const { v, w } of adj[u]!) {
        const next = cu + w;
        if (next < f[base + v]!) {
          f[base + v] = next;
          kind[base + v] = KIND_EDGE;
          link[base + v] = u;
          heap.push(next, v);
        }
      }
    }
  }

  if (!Number.isFinite(f[full * nodeCount + rootNode]!)) return heuristic;

  const treeAdj: TreeAdj = new Map();
  const stack: number[] = [full, rootNode];
  while (stack.length > 0) {
    const v = stack.pop()!;
    const S = stack.pop()!;
    const idx = S * nodeCount + v;
    if (kind[idx] === KIND_MERGE) {
      const A = link[idx]!;
      stack.push(A, v, S ^ A, v);
    } else if (kind[idx] === KIND_EDGE) {
      const u = link[idx]!;
      addTreeEdge(treeAdj, u, v);
      stack.push(S, u);
    }
  }

  let treeEdges = 0;
  for (const set of treeAdj.values()) treeEdges += set.size;
  if (!treeAdj.has(rootNode) || terminals.some((n) => !treeAdj.has(n)) || treeEdges / 2 !== treeAdj.size - 1) {
    return heuristic;
  }

  const sameX = (u: number, v: number): boolean => pointOf(u).x === pointOf(v).x;
  const isPerpendicular = (tree: TreeAdj, c: number): boolean => {
    const [p, q] = [...tree.get(c)!];
    return sameX(c, p!) !== sameX(c, q!);
  };
  const isBend = (tree: TreeAdj, c: number): boolean =>
    c !== rootNode && tree.get(c)?.size === 2 && isPerpendicular(tree, c);
  const isStraightInterior = (tree: TreeAdj, n: number): boolean =>
    n !== rootNode && !isPortNode[n] && tree.get(n)?.size === 2 && !isPerpendicular(tree, n);

  const bendsOf = (tree: TreeAdj): number => {
    let count = 0;
    for (const [n, set] of tree) {
      if (n === rootNode) {
        for (const m of set) {
          const a = pointOf(n);
          const b = pointOf(m);
          if (headingOf({ x: b.x - a.x, y: b.y - a.y }) !== entryHeading) count++;
        }
      } else if (set.size === 2 && isPerpendicular(tree, n)) {
        count++;
      }
    }
    return count;
  };

  const runFrom = (tree: TreeAdj, c: number, first: number): number[] => {
    const seq = [c, first];
    let prev = c;
    let cur = first;
    while (isStraightInterior(tree, cur)) {
      const nb = [...tree.get(cur)!];
      const next = nb[0] === prev ? nb[1]! : nb[0]!;
      prev = cur;
      cur = next;
      seq.push(cur);
    }
    return seq;
  };

  const lineBetween = (p: number, q: number): number[] => {
    let i = Math.floor(p / ny);
    let j = p % ny;
    const qi = Math.floor(q / ny);
    const qj = q % ny;
    const out = [p];
    while (i !== qi || j !== qj) {
      if (i !== qi) i += Math.sign(qi - i);
      else j += Math.sign(qj - j);
      out.push(i * ny + j);
    }
    return out;
  };

  const tryFlip = (tree: TreeAdj, c: number): boolean => {
    const [n1, n2] = [...tree.get(c)!] as [number, number];
    const runA = runFrom(tree, c, n1);
    const runB = runFrom(tree, c, n2);
    const a = runA[runA.length - 1]!;
    const b = runB[runB.length - 1]!;
    const pa = pointOf(a);
    const pb = pointOf(b);
    const pc = pointOf(c);
    const c2 = pa.y === pc.y ? grid.nodeAt({ x: pa.x, y: pb.y }) : grid.nodeAt({ x: pb.x, y: pa.y });
    const route = [...lineBetween(a, c2), ...lineBetween(c2, b).slice(1)];

    let oldCost = 0;
    for (const run of [runA, runB]) {
      for (let i = 1; i < run.length; i++) oldCost += edgeCost(run[i - 1]!, run[i]!);
    }
    let newCost = 0;
    for (let i = 1; i < route.length; i++) {
      const u = route[i - 1]!;
      const v = route[i]!;
      if (edgeInfo(u, v).blocked) return false;
      newCost += edgeCost(u, v);
    }
    if (newCost > oldCost) return false;
    for (const n of route.slice(1, -1)) if (tree.has(n) || isPortNode[n]) return false;

    const next = cloneTree(tree);
    for (const run of [runA, runB]) {
      for (let i = 1; i < run.length; i++) removeTreeEdge(next, run[i - 1]!, run[i]!);
    }
    for (let i = 1; i < route.length; i++) addTreeEdge(next, route[i - 1]!, route[i]!);
    if (bendsOf(next) >= bendsOf(tree)) return false;
    replaceTree(tree, next);
    return true;
  };

  for (let round = 0; round < MAX_BEND_ROUNDS; round++) {
    let flipped = false;
    const centres = [...treeAdj.keys()].sort((a, b) => a - b);
    for (const c of centres) {
      if (!isBend(treeAdj, c)) continue;
      if (tryFlip(treeAdj, c)) flipped = true;
    }
    if (!flipped) break;
  }

  const reachedPortNode = new Uint8Array(nodeCount);
  for (const n of terminals) reachedPortNode[n] = 1;
  const exact: SpineResult = {
    paths: spinePaths(grid, treeAdj, reachedPortNode),
    unreachedPortIds: [],
    lengthMm: treeLengthMm(grid, treeAdj),
  };

  const scoreOf = (result: SpineResult): number =>
    spineScore(result.paths, result.lengthMm, input, bendMm);

  return scoreOf(exact) < scoreOf(heuristic) ? exact : heuristic;
}
