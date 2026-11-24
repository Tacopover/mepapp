// Highest flow over all possible sources of one tree. An edge or a node takes
// the largest value it gets from any source. Iterative (no recursion), so a
// long chain works. The result does not depend on the order of the input.

export interface HighestNode {
  id: string;
  own: number;
  /** The number of possible sources at this node. */
  roots: number;
}

export interface HighestEdge {
  id: string;
  a: string;
  b: string;
}

export interface HighestSide {
  demand: number;
  roots: number;
}

export interface HighestResult {
  /** Sum of `own` over all nodes. */
  total: number;
  /** Sum of `roots` over all nodes (K). */
  roots: number;
  /** Highest value of each edge: the demand of the side that holds no source. Null when K is 0. */
  edge: Record<string, number | null>;
  /** Highest value of each node. Null when none. */
  node: Record<string, number | null>;
  /** The two sides of each edge. `a` is the side that holds node `a`. */
  sides: Record<string, { a: HighestSide; b: HighestSide }>;
}

interface Vertex {
  id: string;
  own: number;
  roots: number;
  adj: { vertex: Vertex; edge: HighestEdge }[];
  parent: Vertex | null;
  parentEdge: HighestEdge | null;
  sub: number;
  rootsSub: number;
  best: number | null;
}

function byId(x: { id: string }, y: { id: string }): number {
  if (x.id === y.id) return 0;
  return x.id < y.id ? -1 : 1;
}

function raise(vertex: Vertex, value: number): void {
  if (vertex.best === null || value > vertex.best) vertex.best = value;
}

/** Null unless the graph is one tree: exactly one connected component and edges = nodes - 1. No recursion. The result does not depend on the order of the input. */
export function highestFlow(
  nodes: readonly HighestNode[],
  edges: readonly HighestEdge[],
): HighestResult | null {
  if (nodes.length === 0 || edges.length !== nodes.length - 1) return null;

  const vertices = new Map<string, Vertex>();
  for (const node of nodes) {
    if (vertices.has(node.id)) return null;
    vertices.set(node.id, {
      id: node.id,
      own: node.own,
      roots: node.roots,
      adj: [],
      parent: null,
      parentEdge: null,
      sub: node.own,
      rootsSub: node.roots,
      best: null,
    });
  }
  for (const edge of edges) {
    const a = vertices.get(edge.a);
    const b = vertices.get(edge.b);
    if (!a || !b) return null;
    a.adj.push({ vertex: b, edge });
    b.adj.push({ vertex: a, edge });
  }

  const list = [...vertices.values()];
  for (const v of list) {
    v.adj.sort((x, y) => byId(x.vertex, y.vertex) || byId(x.edge, y.edge));
  }

  const first = list.reduce((low, v) => (byId(v, low) < 0 ? v : low));
  const order: Vertex[] = [];
  const seen = new Set<Vertex>([first]);
  const stack = [first];
  let current = stack.pop();
  while (current) {
    order.push(current);
    for (const { vertex, edge } of current.adj) {
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      vertex.parent = current;
      vertex.parentEdge = edge;
      stack.push(vertex);
    }
    current = stack.pop();
  }
  if (order.length !== vertices.size) return null;

  let total = 0;
  let roots = 0;
  for (const v of list) {
    total += v.own;
    roots += v.roots;
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const { parent, sub, rootsSub } = order[i];
    if (!parent) continue;
    parent.sub += sub;
    parent.rootsSub += rootsSub;
  }

  for (const v of order) {
    if (v.roots > 0) raise(v, total);
  }

  const edge: Record<string, number | null> = {};
  const sides: Record<string, { a: HighestSide; b: HighestSide }> = {};
  for (const v of order) {
    const { parent, parentEdge } = v;
    if (!parent || !parentEdge) continue;
    const child: HighestSide = { demand: v.sub, roots: v.rootsSub };
    const up: HighestSide = { demand: total - v.sub, roots: roots - v.rootsSub };
    let value: number | null = null;
    if (up.roots > 0) value = child.demand;
    if (child.roots > 0 && (value === null || up.demand > value)) value = up.demand;
    edge[parentEdge.id] = value;
    sides[parentEdge.id] = parentEdge.a === v.id ? { a: child, b: up } : { a: up, b: child };
    if (up.roots > 0) raise(v, child.demand);
    if (child.roots > 0) raise(parent, up.demand);
  }

  const node: Record<string, number | null> = {};
  for (const v of order) node[v.id] = v.best;

  return { total, roots, edge, node, sides };
}
