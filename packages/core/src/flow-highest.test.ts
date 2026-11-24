import { describe, expect, it } from 'vitest';
import { highestFlow, type HighestEdge, type HighestNode } from './flow-highest.js';

interface Graph {
  nodes: HighestNode[];
  edges: HighestEdge[];
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomTree(rand: () => number, size: number): Graph {
  const nodes: HighestNode[] = [];
  for (let i = 0; i < size; i++) {
    nodes.push({
      id: `n${i}`,
      own: Math.floor(rand() * 51),
      roots: rand() < 0.6 ? 0 : Math.floor(rand() * 3),
    });
  }
  const edges: HighestEdge[] = [];
  for (let i = 1; i < size; i++) {
    const parent = Math.floor(rand() * i);
    const flip = rand() < 0.5;
    edges.push({
      id: `e${i}`,
      a: flip ? `n${parent}` : `n${i}`,
      b: flip ? `n${i}` : `n${parent}`,
    });
  }
  return { nodes, edges };
}

function levelOne(): Graph {
  return {
    nodes: [
      { id: 'RF1', own: 0, roots: 0 },
      { id: 'F', own: 0, roots: 0 },
      { id: 'Tm300', own: 300, roots: 0 },
      { id: 'Tm200', own: 200, roots: 0 },
      { id: 'O1', own: 0, roots: 1 },
      { id: 'below', own: 100, roots: 1 },
      { id: 'above', own: 150, roots: 1 },
    ],
    edges: [
      { id: 's1', a: 'RF1', b: 'F' },
      { id: 'sa', a: 'F', b: 'Tm300' },
      { id: 'sb', a: 'F', b: 'Tm200' },
      { id: 'so', a: 'F', b: 'O1' },
      { id: 'eb', a: 'RF1', b: 'below' },
      { id: 'ea', a: 'RF1', b: 'above' },
    ],
  };
}

function higher(current: number | null, value: number): number {
  return current === null || value > current ? value : current;
}

function oracle(nodes: HighestNode[], edges: HighestEdge[]) {
  const total = nodes.reduce((sum, n) => sum + n.own, 0);
  const roots = nodes.reduce((sum, n) => sum + n.roots, 0);
  const own = new Map<string, number>();
  const adj = new Map<string, { other: string }[]>();
  for (const n of nodes) {
    own.set(n.id, n.own);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.a)?.push({ other: e.b });
    adj.get(e.b)?.push({ other: e.a });
  }
  const edgeValue: Record<string, number | null> = {};
  const nodeValue: Record<string, number | null> = {};
  for (const e of edges) edgeValue[e.id] = null;
  for (const n of nodes) nodeValue[n.id] = null;

  for (const source of nodes) {
    if (source.roots <= 0) continue;
    const parent = new Map<string, string | null>([[source.id, null]]);
    const sub = new Map<string, number>();
    const down = (id: string): number => {
      let sum = own.get(id) ?? 0;
      for (const step of adj.get(id) ?? []) {
        if (step.other === parent.get(id)) continue;
        parent.set(step.other, id);
        sum += down(step.other);
      }
      sub.set(id, sum);
      return sum;
    };
    down(source.id);
    for (const e of edges) {
      const child = parent.get(e.a) === e.b ? e.a : e.b;
      edgeValue[e.id] = higher(edgeValue[e.id], sub.get(child) ?? 0);
    }
    for (const n of nodes) {
      nodeValue[n.id] = higher(nodeValue[n.id], sub.get(n.id) ?? 0);
    }
  }
  return { total, roots, edge: edgeValue, node: nodeValue };
}

describe('highestFlow', () => {
  it('Example 1: two sources behind one terminal', () => {
    const result = highestFlow(
      [
        { id: 'Tm', own: 100, roots: 0 },
        { id: 'T', own: 0, roots: 0 },
        { id: 'O1', own: 0, roots: 1 },
        { id: 'O2', own: 0, roots: 1 },
      ],
      [
        { id: 'main', a: 'Tm', b: 'T' },
        { id: 's1', a: 'T', b: 'O1' },
        { id: 's2', a: 'T', b: 'O2' },
      ],
    );
    expect(result?.edge).toEqual({ main: 100, s1: 100, s2: 100 });
    expect(result?.node).toEqual({ Tm: 100, T: 100, O1: 100, O2: 100 });
    expect(result?.total).toBe(100);
    expect(result?.roots).toBe(2);
  });

  it('Example 4b: a chain of two floors with terminals', () => {
    const result = highestFlow(
      [
        { id: 'O1', own: 0, roots: 1 },
        { id: 'F1', own: 0, roots: 0 },
        { id: 'F2', own: 0, roots: 0 },
        { id: 'O2', own: 0, roots: 1 },
        { id: 'Tm1', own: 60, roots: 0 },
        { id: 'Tm2', own: 40, roots: 0 },
      ],
      [
        { id: 'p1', a: 'O1', b: 'F1' },
        { id: 'p2', a: 'F1', b: 'F2' },
        { id: 'p3', a: 'F2', b: 'O2' },
        { id: 'q1', a: 'Tm1', b: 'F1' },
        { id: 'q2', a: 'Tm2', b: 'F2' },
      ],
    );
    expect(result?.edge).toEqual({ p1: 100, p2: 60, p3: 100, q1: 60, q2: 40 });
    expect(result?.node).toEqual({ O1: 100, F1: 100, F2: 100, O2: 100, Tm1: 60, Tm2: 40 });
  });

  it('Example 4a: two terminals behind a fitting, one source', () => {
    const result = highestFlow(
      [
        { id: 'Tm1', own: 60, roots: 0 },
        { id: 'Tm2', own: 40, roots: 0 },
        { id: 'T', own: 0, roots: 0 },
        { id: 'O', own: 0, roots: 1 },
      ],
      [
        { id: 's1', a: 'Tm1', b: 'T' },
        { id: 's2', a: 'Tm2', b: 'T' },
        { id: 's3', a: 'T', b: 'O' },
      ],
    );
    expect(result?.edge).toEqual({ s1: 60, s2: 40, s3: 100 });
    expect(result?.node).toEqual({ Tm1: 60, Tm2: 40, T: 100, O: 100 });
  });

  it('Example 3 at building level', () => {
    const result = highestFlow(
      [
        { id: 'L0', own: 100, roots: 0 },
        { id: 'L1', own: 0, roots: 1 },
        { id: 'L2', own: 50, roots: 0 },
      ],
      [
        { id: 'l01', a: 'L0', b: 'L1' },
        { id: 'l12', a: 'L1', b: 'L2' },
      ],
    );
    expect(result?.edge).toEqual({ l01: 100, l12: 50 });
    expect(result?.node).toEqual({ L0: 100, L1: 150, L2: 50 });
  });

  it('Example 5 at building level', () => {
    const result = highestFlow(
      [
        { id: 'L0', own: 100, roots: 1 },
        { id: 'L1', own: 500, roots: 1 },
        { id: 'L2', own: 150, roots: 1 },
      ],
      [
        { id: 'l01', a: 'L0', b: 'L1' },
        { id: 'l12', a: 'L1', b: 'L2' },
      ],
    );
    expect(result?.edge).toEqual({ l01: 650, l12: 600 });
    expect(result?.node).toEqual({ L0: 750, L1: 750, L2: 750 });
  });

  it('Example 5 level 1 as a graph', () => {
    const graph = levelOne();
    const result = highestFlow(graph.nodes, graph.edges);
    expect(result?.edge).toEqual({ s1: 500, sa: 300, sb: 200, so: 750, eb: 650, ea: 600 });
    expect(result?.node).toEqual({
      RF1: 650,
      F: 750,
      Tm300: 300,
      Tm200: 200,
      O1: 750,
      below: 750,
      above: 750,
    });
    expect(result?.sides.s1).toEqual({
      a: { demand: 250, roots: 2 },
      b: { demand: 500, roots: 1 },
    });
    expect(result?.total).toBe(750);
    expect(result?.roots).toBe(3);
  });

  it('no possible source: every value is null', () => {
    const result = highestFlow(
      [
        { id: 'A', own: 1, roots: 0 },
        { id: 'B', own: 2, roots: 0 },
        { id: 'C', own: 3, roots: 0 },
      ],
      [
        { id: 'ab', a: 'A', b: 'B' },
        { id: 'bc', a: 'B', b: 'C' },
      ],
    );
    expect(result?.edge).toEqual({ ab: null, bc: null });
    expect(result?.node).toEqual({ A: null, B: null, C: null });
    expect(result?.total).toBe(6);
    expect(result?.roots).toBe(0);
  });

  it('one possible source: each edge is the subtree sum on the side without it', () => {
    const nodes: HighestNode[] = [
      { id: 'A', own: 5, roots: 0 },
      { id: 'B', own: 7, roots: 1 },
      { id: 'C', own: 11, roots: 0 },
      { id: 'D', own: 13, roots: 0 },
    ];
    const edges: HighestEdge[] = [
      { id: 'ab', a: 'A', b: 'B' },
      { id: 'bc', a: 'B', b: 'C' },
      { id: 'cd', a: 'C', b: 'D' },
    ];
    const result = highestFlow(nodes, edges);
    expect(result?.edge).toEqual({ ab: 5, bc: 24, cd: 13 });
    expect(result?.node).toEqual({ A: 5, B: 36, C: 24, D: 13 });
    const expected = oracle(nodes, edges);
    expect(result?.edge).toEqual(expected.edge);
    expect(result?.node).toEqual(expected.node);
  });

  it('returns null for an empty input, a loop, two components, an unknown node or a duplicate node id', () => {
    expect(highestFlow([], [])).toBeNull();
    expect(
      highestFlow(
        [
          { id: 'A', own: 1, roots: 1 },
          { id: 'B', own: 1, roots: 0 },
          { id: 'C', own: 1, roots: 0 },
          { id: 'D', own: 1, roots: 0 },
        ],
        [
          { id: 'ab', a: 'A', b: 'B' },
          { id: 'bc', a: 'B', b: 'C' },
          { id: 'ca', a: 'C', b: 'A' },
        ],
      ),
    ).toBeNull();
    expect(
      highestFlow(
        [
          { id: 'A', own: 1, roots: 1 },
          { id: 'B', own: 1, roots: 0 },
          { id: 'C', own: 1, roots: 0 },
          { id: 'D', own: 1, roots: 0 },
          { id: 'E', own: 1, roots: 0 },
        ],
        [
          { id: 'ab', a: 'A', b: 'B' },
          { id: 'bc', a: 'B', b: 'C' },
          { id: 'de', a: 'D', b: 'E' },
          { id: 'ed', a: 'E', b: 'D' },
        ],
      ),
    ).toBeNull();
    expect(
      highestFlow(
        [
          { id: 'A', own: 1, roots: 1 },
          { id: 'B', own: 1, roots: 0 },
        ],
        [{ id: 'ab', a: 'A', b: 'X' }],
      ),
    ).toBeNull();
    expect(
      highestFlow(
        [
          { id: 'A', own: 1, roots: 1 },
          { id: 'A', own: 1, roots: 0 },
        ],
        [{ id: 'aa', a: 'A', b: 'A' }],
      ),
    ).toBeNull();
  });

  it('matches a naive oracle on 200 random trees', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const size = 2 + Math.floor(rand() * 11);
      const graph = randomTree(rand, size);
      const result = highestFlow(graph.nodes, graph.edges);
      const expected = oracle(graph.nodes, graph.edges);
      expect(result).not.toBeNull();
      expect(result?.edge).toEqual(expected.edge);
      expect(result?.node).toEqual(expected.node);
    }
  });

  it('handles a chain of 20000 nodes without recursion', () => {
    const size = 20000;
    const nodes: HighestNode[] = [];
    const edges: HighestEdge[] = [];
    for (let i = 0; i < size; i++) {
      nodes.push({ id: `n${i}`, own: 1, roots: i === 0 || i === size - 1 ? 1 : 0 });
    }
    for (let i = 0; i < size - 1; i++) {
      edges.push({ id: `e${i}`, a: `n${i}`, b: `n${i + 1}` });
    }
    const result = highestFlow(nodes, edges);
    expect(result?.total).toBe(size);
    expect(result?.roots).toBe(2);
    expect(result?.edge.e4999).toBe(15000);
    expect(result?.edge.e9999).toBe(10000);
    expect(result?.node.n0).toBe(size);
  });

  it('does not depend on the order of the input or on the a and b of an edge', () => {
    const rand = mulberry32(99);
    const graphs: Graph[] = [levelOne(), randomTree(rand, 12)];
    for (const graph of graphs) {
      const base = highestFlow(graph.nodes, graph.edges);
      const turned = shuffled(graph.edges, rand).map((e) =>
        rand() < 0.5 ? { id: e.id, a: e.b, b: e.a } : e,
      );
      const other = highestFlow(shuffled(graph.nodes, rand), turned);
      expect(base).not.toBeNull();
      expect(other?.edge).toEqual(base?.edge);
      expect(other?.node).toEqual(base?.node);
      expect(other?.total).toBe(base?.total);
      expect(other?.roots).toBe(base?.roots);
    }
  });
});
