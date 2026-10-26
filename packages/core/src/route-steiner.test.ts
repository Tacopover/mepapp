import { describe, expect, it } from 'vitest';
import { steinerTree, steinerTreeWithTurns, type SteinerGraph, type SteinerTurnEdge, type SteinerTurnGraph } from './route-steiner.js';

const square: SteinerGraph = {
  nodeIds: ['s', 'a', 'b', 'c'],
  edges: [
    { id: 'e1', from: 's', to: 'a', cost: 10 },
    { id: 'e2', from: 'a', to: 'b', cost: 10 },
    { id: 'e3', from: 's', to: 'c', cost: 10 },
    { id: 'e4', from: 'b', to: 'c', cost: 10 },
  ],
};

function treeCost(graph: SteinerGraph, edgeIds: string[]): number {
  return edgeIds.reduce((sum, id) => sum + graph.edges.find((e) => e.id === id)!.cost, 0);
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const SHUFFLE_SEEDS = [1, 2, 3, 4, 5];

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = lcg(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function bruteForceOptimum(graph: SteinerGraph, root: string, terminals: string[]): number {
  const required = new Set([root, ...terminals]);
  const optional = graph.nodeIds.filter((id) => !required.has(id));
  let best = Infinity;
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const nodes = new Set(required);
    optional.forEach((id, i) => {
      if (mask & (1 << i)) nodes.add(id);
    });
    const parent = new Map<string, string>([...nodes].map((id) => [id, id]));
    const find = (id: string): string => {
      let r = id;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    const induced = graph.edges
      .filter((e) => nodes.has(e.from) && nodes.has(e.to))
      .slice()
      .sort((x, y) => x.cost - y.cost);
    let cost = 0;
    let joined = 0;
    for (const e of induced) {
      const a = find(e.from);
      const b = find(e.to);
      if (a === b) continue;
      parent.set(b, a);
      cost += e.cost;
      joined++;
    }
    if (joined === nodes.size - 1 && cost < best) best = cost;
  }
  return best;
}

describe('steinerTree', () => {
  it('joins the square with three edges of total cost 30', () => {
    const result = steinerTree(square, 's', ['a', 'b', 'c']);
    expect(result.edgeIds).toEqual(['e1', 'e2', 'e3']);
    expect(result.unreached).toEqual([]);
    expect(treeCost(square, result.edgeIds)).toBe(30);
  });

  it('gives the same result for any terminal order', () => {
    const forward = steinerTree(square, 's', ['a', 'b', 'c']);
    expect(steinerTree(square, 's', ['c', 'b', 'a'])).toEqual(forward);
    expect(steinerTree(square, 's', ['b', 'a', 'c'])).toEqual(forward);
  });

  it('connects a path graph with all edges', () => {
    const path: SteinerGraph = {
      nodeIds: ['s', 'a', 'b', 'c'],
      edges: [
        { id: 'p1', from: 's', to: 'a', cost: 5 },
        { id: 'p2', from: 'a', to: 'b', cost: 5 },
        { id: 'p3', from: 'b', to: 'c', cost: 5 },
      ],
    };
    const result = steinerTree(path, 's', ['c']);
    expect(result.edgeIds).toEqual(['p1', 'p2', 'p3']);
    expect(result.unreached).toEqual([]);
  });

  it('connects a star from a leaf root to two leaves', () => {
    const star: SteinerGraph = {
      nodeIds: ['o', 'x', 'y', 'z'],
      edges: [
        { id: 'xo', from: 'x', to: 'o', cost: 1 },
        { id: 'oy', from: 'o', to: 'y', cost: 1 },
        { id: 'oz', from: 'o', to: 'z', cost: 1 },
      ],
    };
    const result = steinerTree(star, 'x', ['y', 'z']);
    expect(result.edgeIds).toEqual(['oy', 'oz', 'xo']);
    expect(result.unreached).toEqual([]);
  });

  it('reports a terminal in another part as unreached and connects the reachable one', () => {
    const parts: SteinerGraph = {
      nodeIds: ['s', 'a', 'x', 'y'],
      edges: [
        { id: 'e1', from: 's', to: 'a', cost: 1 },
        { id: 'e2', from: 'x', to: 'y', cost: 1 },
      ],
    };
    const result = steinerTree(parts, 's', ['x', 'a']);
    expect(result.edgeIds).toEqual(['e1']);
    expect(result.unreached).toEqual(['x']);
  });

  it('ignores the root as a terminal, collapses duplicates and reports unknown ids as unreached', () => {
    const result = steinerTree(square, 's', ['s', 'a', 'a', 'zz', 'c']);
    expect(result.edgeIds).toEqual(['e1', 'e3']);
    expect(result.unreached).toEqual(['zz']);
  });

  it('returns nothing when there are no terminals', () => {
    expect(steinerTree(square, 's', [])).toEqual({ edgeIds: [], unreached: [] });
  });

  it('gives deep-equal output for the same input', () => {
    expect(steinerTree(square, 's', ['a', 'b', 'c'])).toEqual(steinerTree(square, 's', ['a', 'b', 'c']));
  });

  it('keeps the cost within twice the brute-force optimum on random graphs', () => {
    const random = lcg(20261018);
    const pick = (n: number): number => Math.floor(random() * n);
    for (let trial = 0; trial < 100; trial++) {
      const n = 4 + pick(5);
      const nodeIds = Array.from({ length: n }, (_, i) => 'n' + i);
      const order = nodeIds.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = pick(i + 1);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const edges: SteinerGraph['edges'] = [];
      const addEdge = (from: string, to: string): void => {
        edges.push({ id: 'e' + edges.length, from, to, cost: 1 + pick(9) });
      };
      for (let i = 0; i + 1 < n; i++) addEdge(order[i]!, order[i + 1]!);
      const extra = pick(n + 1);
      for (let k = 0; k < extra; k++) {
        const a = pick(n);
        const b = pick(n);
        if (a !== b) addEdge(nodeIds[a]!, nodeIds[b]!);
      }
      const graph: SteinerGraph = { nodeIds, edges };
      const root = nodeIds[0]!;
      const candidates = nodeIds.slice(1);
      const terminalCount = Math.min(2 + pick(3), candidates.length);
      const terminals: string[] = [];
      while (terminals.length < terminalCount) {
        const id = candidates[pick(candidates.length)]!;
        if (!terminals.includes(id)) terminals.push(id);
      }

      const result = steinerTree(graph, root, terminals);
      expect(result.unreached).toEqual([]);

      const parent = new Map<string, string>(nodeIds.map((id) => [id, id]));
      const find = (id: string): string => {
        let r = id;
        while (parent.get(r) !== r) r = parent.get(r)!;
        return r;
      };
      for (const id of result.edgeIds) {
        const e = edges.find((x) => x.id === id)!;
        const a = find(e.from);
        const b = find(e.to);
        expect(a).not.toBe(b);
        parent.set(b, a);
      }
      for (const t of terminals) expect(find(t)).toBe(find(root));

      const optimum = bruteForceOptimum(graph, root, terminals);
      expect(treeCost(graph, result.edgeIds)).toBeGreaterThanOrEqual(optimum);
      expect(treeCost(graph, result.edgeIds)).toBeLessThanOrEqual(2 * optimum);
      for (const seed of SHUFFLE_SEEDS) {
        expect(steinerTree(graph, root, shuffled(terminals, seed))).toEqual(result);
        expect(steinerTree({ nodeIds, edges: shuffled(edges, seed) }, root, terminals)).toEqual(result);
      }
    }
  });
});

const EAST = { x: 1, y: 0 };
const NORTH = { x: 0, y: 1 };

function leg(id: string, from: string, to: string, cost: number, dir: { x: number; y: number }): SteinerTurnEdge {
  return { id, from, to, cost, startDir: dir, endDir: dir };
}

const bendGraph: SteinerTurnGraph = {
  nodeIds: ['s', 'a', 'b', 'c', 't', 'm'],
  edges: [
    leg('e1', 's', 'a', 100, EAST),
    leg('e2', 'a', 'b', 100, NORTH),
    leg('e3', 'b', 'c', 100, EAST),
    leg('e4', 'c', 't', 100, NORTH),
    leg('l1', 's', 'm', 210, EAST),
    leg('l2', 'm', 't', 210, NORTH),
  ],
};

const fittingGraph: SteinerTurnGraph = {
  nodeIds: ['s', 'm', 't1', 't2'],
  edges: [leg('sm', 's', 'm', 10, EAST), leg('mt1', 'm', 't1', 10, EAST), leg('mt2', 'm', 't2', 10, EAST), leg('st2', 's', 't2', 20, EAST)],
};

describe('steinerTreeWithTurns', () => {
  it('takes the path with fewer turns when a turn costs more than the length difference', () => {
    expect(steinerTree(bendGraph, 's', ['t']).edgeIds).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(steinerTreeWithTurns(bendGraph, 's', ['t'], { bendMm: 40, fittingMm: 0 }).edgeIds).toEqual(['l1', 'l2']);
    expect(steinerTreeWithTurns(bendGraph, 's', ['t'], { bendMm: 0, fittingMm: 0 })).toEqual(steinerTree(bendGraph, 's', ['t']));
  });

  it('attaches a new path at the root rather than at a node of degree two when a fitting costs more', () => {
    expect(steinerTreeWithTurns(fittingGraph, 's', ['t1', 't2'], { bendMm: 0, fittingMm: 0 }).edgeIds).toEqual(['mt1', 'mt2', 'sm']);
    expect(steinerTreeWithTurns(fittingGraph, 's', ['t1', 't2'], { bendMm: 0, fittingMm: 50 }).edgeIds).toEqual(['mt1', 'sm', 'st2']);
  });

  it('matches the cost and the unreached list of steinerTree with zero costs on random graphs', () => {
    const random = lcg(20261026);
    const pick = (n: number): number => Math.floor(random() * n);
    const dirs = [EAST, NORTH, { x: -1, y: 0 }, { x: 0, y: -1 }];
    for (let trial = 0; trial < 100; trial++) {
      const n = 4 + pick(6);
      const nodeIds = Array.from({ length: n }, (_, i) => 'n' + i);
      const edges: SteinerTurnEdge[] = [];
      const addEdge = (from: string, to: string): void => {
        const dir = dirs[pick(dirs.length)]!;
        edges.push({ id: 'e' + edges.length, from, to, cost: 1 + random() * 100, startDir: dir, endDir: dir });
      };
      for (let i = 0; i + 1 < n; i++) if (pick(4) > 0) addEdge(nodeIds[i]!, nodeIds[i + 1]!);
      const extra = pick(n + 1);
      for (let k = 0; k < extra; k++) {
        const a = pick(n);
        const b = pick(n);
        if (a !== b) addEdge(nodeIds[a]!, nodeIds[b]!);
      }
      const graph: SteinerTurnGraph = { nodeIds, edges };
      const terminalCount = 1 + pick(3);
      const terminals: string[] = [];
      while (terminals.length < terminalCount) {
        const id = nodeIds[1 + pick(n - 1)]!;
        if (!terminals.includes(id)) terminals.push(id);
      }

      const plain = steinerTree(graph, 'n0', terminals);
      const turns = steinerTreeWithTurns(graph, 'n0', terminals, { bendMm: 0, fittingMm: 0 });
      expect(treeCost(graph, turns.edgeIds)).toBeCloseTo(treeCost(graph, plain.edgeIds), 9);
      expect(turns.unreached).toEqual(plain.unreached);
    }
  });

  it('gives the same edge ids for a reversed edge and node order when no costs tie', () => {
    const base: SteinerTurnGraph = {
      nodeIds: ['s', 'a', 'b', 'c', 'd'],
      edges: [
        leg('e1', 's', 'a', 3, EAST),
        leg('e2', 'a', 'b', 5, NORTH),
        leg('e3', 's', 'c', 7, EAST),
        leg('e4', 'c', 'b', 11, NORTH),
        leg('e5', 'b', 'd', 13, EAST),
        leg('e6', 'c', 'd', 17, NORTH),
      ],
    };
    const costs = { bendMm: 0.5, fittingMm: 0.25 };
    const first = steinerTreeWithTurns(base, 's', ['d', 'b'], costs);
    const reversedGraph: SteinerTurnGraph = { nodeIds: [...base.nodeIds].reverse(), edges: [...base.edges].reverse() };
    expect(steinerTreeWithTurns(reversedGraph, 's', ['b', 'd'], costs)).toEqual(first);
  });

  it('does not repeat an edge when the cheapest path loops back through a node', () => {
    const WEST = { x: -1, y: 0 };
    const loopGraph: SteinerTurnGraph = {
      nodeIds: ['r', 'b', 'c', 'd', 't'],
      edges: [
        leg('e1', 'r', 'b', 1, EAST),
        leg('e2', 'b', 'c', 1, EAST),
        leg('e3', 'c', 'd', 1, EAST),
        { id: 'e4', from: 'd', to: 'c', cost: 1, startDir: EAST, endDir: WEST },
        leg('e5', 'b', 't', 1, WEST),
      ],
    };
    const result = steinerTreeWithTurns(loopGraph, 'r', ['t'], { bendMm: 1e6, fittingMm: 0 });
    expect(result.edgeIds).toEqual(['e1', 'e5']);
    expect(result.unreached).toEqual([]);
    const touched = new Set(loopGraph.edges.filter((e) => result.edgeIds.includes(e.id)).flatMap((e) => [e.from, e.to]));
    expect(result.edgeIds.length).toBe(touched.size - 1);
  });

  it('builds a tree that reaches every reachable terminal on random graphs with bends', () => {
    const random = lcg(20261027);
    const pick = (n: number): number => Math.floor(random() * n);
    const dirs = [EAST, NORTH, { x: -1, y: 0 }, { x: 0, y: -1 }];
    for (let trial = 0; trial < 200; trial++) {
      const n = 4 + pick(6);
      const nodeIds = Array.from({ length: n }, (_, i) => 'n' + i);
      const edges: SteinerTurnEdge[] = [];
      const addEdge = (from: string, to: string): void => {
        const startDir = dirs[pick(dirs.length)]!;
        const endDir = dirs[pick(dirs.length)]!;
        edges.push({ id: 'e' + edges.length, from, to, cost: 1 + random() * 100, startDir, endDir });
      };
      for (let i = 0; i + 1 < n; i++) if (pick(4) > 0) addEdge(nodeIds[i]!, nodeIds[i + 1]!);
      const extra = pick(n + 1);
      for (let k = 0; k < extra; k++) {
        const a = pick(n);
        const b = pick(n);
        if (a !== b) addEdge(nodeIds[a]!, nodeIds[b]!);
      }
      const graph: SteinerTurnGraph = { nodeIds, edges };
      const terminalCount = 1 + pick(3);
      const terminals: string[] = [];
      while (terminals.length < terminalCount) {
        const id = nodeIds[1 + pick(n - 1)]!;
        if (!terminals.includes(id)) terminals.push(id);
      }
      const costs = { bendMm: random() * 1e6, fittingMm: random() * 50 };

      const result = steinerTreeWithTurns(graph, 'n0', terminals, costs);

      const touched = new Set<string>(['n0']);
      for (const id of result.edgeIds) {
        const e = edges.find((x) => x.id === id)!;
        touched.add(e.from);
        touched.add(e.to);
      }
      expect(result.edgeIds.length).toBe(touched.size - 1);

      const treeParent = new Map<string, string>([...touched].map((id) => [id, id]));
      const graphParent = new Map<string, string>(nodeIds.map((id) => [id, id]));
      const findIn = (parent: Map<string, string>, id: string): string => {
        let r = id;
        while (parent.get(r) !== r) r = parent.get(r)!;
        return r;
      };
      for (const id of result.edgeIds) {
        const e = edges.find((x) => x.id === id)!;
        const a = findIn(treeParent, e.from);
        const b = findIn(treeParent, e.to);
        expect(a).not.toBe(b);
        treeParent.set(b, a);
      }
      for (const id of touched) expect(findIn(treeParent, id)).toBe(findIn(treeParent, 'n0'));

      for (const e of edges) graphParent.set(findIn(graphParent, e.from), findIn(graphParent, e.to));
      const reachable = terminals.filter((t) => findIn(graphParent, t) === findIn(graphParent, 'n0'));
      for (const t of reachable) expect(touched.has(t)).toBe(true);
      expect(result.unreached.length).toBe(terminals.length - reachable.length);
    }
  });
});
