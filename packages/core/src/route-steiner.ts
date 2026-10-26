// Steiner tree heuristic (Takahashi-Matsuyama) on an undirected weighted graph. Pure function.
// The same input gives the same output, and the order of the terminals does not change it.
// Edge costs must be zero or more. Equal-cost paths to a node keep the edge with the smaller id.

import { StateHeap } from './route-heap.js';

export interface SteinerGraph {
  nodeIds: readonly string[]; // fixed order = tie-break order
  edges: readonly { id: string; from: string; to: string; cost: number }[];
}

interface Arc {
  edgeId: string;
  other: number;
  cost: number;
}

/** Takahashi-Matsuyama. Returns the edge ids of the tree and the terminals that no path reached. */
export function steinerTree(
  graph: SteinerGraph,
  root: string,
  terminals: readonly string[],
): { edgeIds: string[]; unreached: string[] } {
  const count = graph.nodeIds.length;
  const index = new Map<string, number>(graph.nodeIds.map((id, i) => [id, i]));
  const incident: Arc[][] = graph.nodeIds.map(() => []);
  for (const edge of graph.edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a === undefined || b === undefined) continue;
    incident[a]!.push({ edgeId: edge.id, other: b, cost: edge.cost });
    incident[b]!.push({ edgeId: edge.id, other: a, cost: edge.cost });
  }

  const inTree = new Array<boolean>(count).fill(false);
  const rootIndex = index.get(root);
  if (rootIndex !== undefined) inTree[rootIndex] = true;

  const unknown: string[] = [];
  const remaining = new Set<number>();
  for (const id of new Set(terminals)) {
    if (id === root) continue;
    const i = index.get(id);
    if (i === undefined) unknown.push(id);
    else if (!inTree[i]) remaining.add(i);
  }

  const edgeIds: string[] = [];
  const unreachedIndex: number[] = [];
  while (remaining.size > 0) {
    const dist = new Array<number>(count).fill(Infinity);
    const predEdge = new Array<string | undefined>(count).fill(undefined);
    const predNode = new Array<number>(count).fill(-1);
    const done = new Array<boolean>(count).fill(false);
    for (let i = 0; i < count; i++) if (inTree[i]) dist[i] = 0;

    for (;;) {
      let u = -1;
      for (let i = 0; i < count; i++) {
        if (done[i] || dist[i] === Infinity) continue;
        if (u < 0 || dist[i]! < dist[u]!) u = i;
      }
      if (u < 0) break;
      done[u] = true;
      for (const arc of incident[u]!) {
        const v = arc.other;
        if (done[v] || inTree[v]) continue;
        const nd = dist[u]! + arc.cost;
        if (nd < dist[v]! || (nd === dist[v] && arc.edgeId < predEdge[v]!)) {
          dist[v] = nd;
          predEdge[v] = arc.edgeId;
          predNode[v] = u;
        }
      }
    }

    let best = -1;
    for (const i of remaining) {
      if (dist[i] === Infinity) continue;
      if (best < 0 || dist[i]! < dist[best]! || (dist[i] === dist[best] && i < best)) best = i;
    }
    if (best < 0) {
      for (const i of remaining) unreachedIndex.push(i);
      remaining.clear();
      break;
    }

    let cur = best;
    while (!inTree[cur]) {
      edgeIds.push(predEdge[cur]!);
      inTree[cur] = true;
      cur = predNode[cur]!;
    }
    for (const i of remaining) if (inTree[i]) remaining.delete(i);
  }

  unreachedIndex.sort((a, b) => a - b);
  const unreached = [...unreachedIndex.map((i) => graph.nodeIds[i]!), ...unknown.sort()];
  edgeIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { edgeIds, unreached };
}

export interface SteinerTurnEdge {
  id: string;
  from: string;
  to: string;
  cost: number;
  /** Unit direction of the first leg, from `from` towards `to`. null when unknown. */
  startDir: { x: number; y: number } | null;
  /** Unit direction of the last leg, in the same orientation. */
  endDir: { x: number; y: number } | null;
}

export interface SteinerTurnGraph {
  nodeIds: readonly string[];
  edges: readonly SteinerTurnEdge[];
}

export interface TurnCosts {
  bendMm: number;
  fittingMm: number;
}

type Heading = { x: number; y: number } | null;

interface TurnArc {
  edgeId: string;
  from: number;
  to: number;
  cost: number;
  dirIn: Heading;
  dirOut: Heading;
}

const STRAIGHT_COS = Math.cos((20 * Math.PI) / 180);

function isTurn(d1: Heading, d2: Heading): boolean {
  if (!d1 || !d2) return false;
  return d1.x * d2.x + d1.y * d2.y < STRAIGHT_COS;
}

function reversed(d: Heading): Heading {
  return d ? { x: -d.x, y: -d.y } : null;
}

function chainTouches(arcs: TurnArc[], pred: number[], state: number, node: number): boolean {
  for (let cur = state; cur >= 0; cur = pred[cur]!) {
    if (arcs[cur]!.from === node || arcs[cur]!.to === node) return true;
  }
  return false;
}

/** Takahashi-Matsuyama on heading states. A turn costs bendMm, and a new path that attaches at a node of degree 2 or more costs fittingMm. */
export function steinerTreeWithTurns(
  graph: SteinerTurnGraph,
  root: string,
  terminals: readonly string[],
  costs: TurnCosts,
): { edgeIds: string[]; unreached: string[] } {
  const count = graph.nodeIds.length;
  const index = new Map<string, number>(graph.nodeIds.map((id, i) => [id, i]));
  const arcs: TurnArc[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a === undefined || b === undefined) continue;
    arcs.push({ edgeId: edge.id, from: a, to: b, cost: edge.cost, dirIn: edge.startDir, dirOut: edge.endDir });
    arcs.push({ edgeId: edge.id, from: b, to: a, cost: edge.cost, dirIn: reversed(edge.endDir), dirOut: reversed(edge.startDir) });
  }
  arcs.sort((x, y) => {
    if (x.edgeId !== y.edgeId) return x.edgeId < y.edgeId ? -1 : 1;
    return x.from - y.from || x.to - y.to;
  });
  const outArcs: number[][] = graph.nodeIds.map(() => []);
  for (let ai = 0; ai < arcs.length; ai++) outArcs[arcs[ai]!.from]!.push(ai);

  const inTree = new Array<boolean>(count).fill(false);
  const degree = new Array<number>(count).fill(0);
  const rootIndex = index.get(root);
  if (rootIndex !== undefined) inTree[rootIndex] = true;

  const unknown: string[] = [];
  const remaining = new Set<number>();
  for (const id of new Set(terminals)) {
    if (id === root) continue;
    const i = index.get(id);
    if (i === undefined) unknown.push(id);
    else if (!inTree[i]) remaining.add(i);
  }

  const edgeIds: string[] = [];
  const unreachedIndex: number[] = [];
  while (remaining.size > 0) {
    const dist = new Array<number>(arcs.length).fill(Infinity);
    const pred = new Array<number>(arcs.length).fill(-1);
    const heap = new StateHeap();
    for (let ai = 0; ai < arcs.length; ai++) {
      const arc = arcs[ai]!;
      if (!inTree[arc.from] || inTree[arc.to]) continue;
      const cost = arc.cost + (degree[arc.from]! >= 2 ? costs.fittingMm : 0);
      if (cost < dist[ai]!) {
        dist[ai] = cost;
        heap.push(cost, ai);
      }
    }

    while (heap.size > 0) {
      const top = heap.pop();
      if (top.cost > dist[top.state]!) continue;
      const arc = arcs[top.state]!;
      for (const bi of outArcs[arc.to]!) {
        const next = arcs[bi]!;
        if (inTree[next.to] || next.edgeId === arc.edgeId || chainTouches(arcs, pred, top.state, next.to)) continue;
        const nd = dist[top.state]! + next.cost + (isTurn(arc.dirOut, next.dirIn) ? costs.bendMm : 0);
        if (nd < dist[bi]!) {
          dist[bi] = nd;
          pred[bi] = top.state;
          heap.push(nd, bi);
        }
      }
    }

    let best = -1;
    for (let ai = 0; ai < arcs.length; ai++) {
      const to = arcs[ai]!.to;
      if (!remaining.has(to) || dist[ai] === Infinity) continue;
      if (best < 0 || dist[ai]! < dist[best]! || (dist[ai] === dist[best] && to < arcs[best]!.to)) best = ai;
    }
    if (best < 0) {
      for (const i of remaining) unreachedIndex.push(i);
      remaining.clear();
      break;
    }

    const path: TurnArc[] = [];
    for (let cur = best; cur >= 0; cur = pred[cur]!) path.push(arcs[cur]!);
    for (const arc of path) {
      inTree[arc.to] = true;
      if (edgeIds.includes(arc.edgeId)) continue;
      degree[arc.from] = degree[arc.from]! + 1;
      degree[arc.to] = degree[arc.to]! + 1;
      edgeIds.push(arc.edgeId);
    }
    for (const i of remaining) if (inTree[i]) remaining.delete(i);
  }

  unreachedIndex.sort((a, b) => a - b);
  const unreached = [...unreachedIndex.map((i) => graph.nodeIds[i]!), ...unknown.sort()];
  edgeIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { edgeIds, unreached };
}
