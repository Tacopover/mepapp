import { describe, expect, it } from 'vitest';
import { steinerTree, type SteinerGraph } from './route-steiner.js';

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
      expect(steinerTree(graph, root, [...terminals].reverse())).toEqual(result);
      expect(steinerTree({ nodeIds, edges: [...edges].reverse() }, root, terminals)).toEqual(result);
    }
  });
});
