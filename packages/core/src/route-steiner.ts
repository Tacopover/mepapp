// Steiner tree heuristic (Takahashi-Matsuyama) on an undirected weighted graph. Pure function.
// The same input gives the same output, and the order of the terminals does not change it.
// Edge costs must be zero or more. Equal-cost paths to a node keep the edge with the smaller id.

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
