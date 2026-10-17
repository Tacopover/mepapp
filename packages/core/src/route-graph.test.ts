import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { RouteEdge, RouteNode, RouteNodeKind } from './route-area.js';
import { connectedParts, nearestOnEdges, splitEdgeAt, type GraphData } from './route-graph.js';

function node(id: string, x: number, y: number, kind: RouteNodeKind = 'end'): RouteNode {
  return { id, point: { x, y }, kind, roomId: 'r1' };
}

function edge(id: string, from: string, to: string, points: Vec2[]): RouteEdge {
  let lengthMm = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    lengthMm += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
  }
  return { id, from, to, kind: 'center', points, lengthMm, roomId: 'r1' };
}

describe('nearestOnEdges', () => {
  it('gives the foot point on a straight edge and clamps to the end', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 100, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
    };
    const above = nearestOnEdges(graph, { x: 40, y: -5 });
    expect(above?.edgeId).toBe('E');
    expect(above?.segment).toBe(0);
    expect(above?.point.x).toBeCloseTo(40);
    expect(above?.point.y).toBeCloseTo(0);
    expect(above?.distance).toBeCloseTo(5);

    const before = nearestOnEdges(graph, { x: -30, y: 4 });
    expect(before?.point.x).toBeCloseTo(0);
    expect(before?.point.y).toBeCloseTo(0);
    expect(before?.distance).toBeCloseTo(Math.hypot(30, 4));
  });

  it('finds the right segment of a bent edge', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 10)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])],
    };
    const first = nearestOnEdges(graph, { x: 3, y: 2 });
    expect(first?.segment).toBe(0);
    expect(first?.point.x).toBeCloseTo(3);
    expect(first?.point.y).toBeCloseTo(0);

    const second = nearestOnEdges(graph, { x: 12, y: 6 });
    expect(second?.segment).toBe(1);
    expect(second?.point.x).toBeCloseTo(10);
    expect(second?.point.y).toBeCloseTo(6);
    expect(second?.distance).toBeCloseTo(2);
  });

  it('skips the edges that the filter rejects', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 0), node('c', 0, 5), node('d', 10, 5)],
      edges: [
        edge('A', 'a', 'b', [{ x: 0, y: 1 }, { x: 10, y: 1 }]),
        edge('B', 'c', 'd', [{ x: 0, y: 5 }, { x: 10, y: 5 }]),
      ],
    };
    expect(nearestOnEdges(graph, { x: 5, y: 0 })?.edgeId).toBe('A');
    const filtered = nearestOnEdges(graph, { x: 5, y: 0 }, (e) => e.id === 'B');
    expect(filtered?.edgeId).toBe('B');
    expect(filtered?.distance).toBeCloseTo(5);
    expect(nearestOnEdges(graph, { x: 5, y: 0 }, () => false)).toBeNull();
  });

  it('gives null for an empty graph', () => {
    expect(nearestOnEdges({ nodes: [], edges: [] }, { x: 0, y: 0 })).toBeNull();
  });

  it('does not change the graph', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }])],
    };
    const before = JSON.parse(JSON.stringify(graph));
    nearestOnEdges(graph, { x: 4, y: 3 });
    expect(graph).toEqual(before);
  });
});

describe('splitEdgeAt', () => {
  it('returns the end node when the point is at an end and changes nothing', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }])],
    };
    const before = JSON.parse(JSON.stringify(graph));
    expect(splitEdgeAt(graph, 'E', 0, { x: 0, y: 0 }, 'tap1')).toBe('a');
    expect(splitEdgeAt(graph, 'E', 0, { x: 10, y: 0 }, 'tap2')).toBe('b');
    expect(graph).toEqual(before);
  });

  it('splits a bent edge in the middle of segment 1', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 10), node('x', 0, 9)],
      edges: [
        edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]),
        edge('F', 'x', 'a', [{ x: 0, y: 9 }, { x: 0, y: 0 }]),
      ],
    };
    graph.edges[0] = { ...graph.edges[0]!, lengthMm: 40 };
    const oldLength = 40;
    const result = splitEdgeAt(graph, 'E', 1, { x: 10, y: 5 }, 'tap1');
    expect(result).toBe('tap1');

    const tap = graph.nodes.find((n) => n.id === 'tap1');
    expect(tap?.kind).toBe('tap');
    expect(tap?.point).toEqual({ x: 10, y: 5 });
    expect(tap?.roomId).toBe('r1');

    expect(graph.edges.map((e) => e.id)).toEqual(['E', 'E~tap1', 'F']);
    const [first, second] = graph.edges as [RouteEdge, RouteEdge];
    expect(first.from).toBe('a');
    expect(first.to).toBe('tap1');
    expect(second.from).toBe('tap1');
    expect(second.to).toBe('b');
    expect(first.kind).toBe('center');
    expect(second.kind).toBe('center');
    expect(first.roomId).toBe('r1');
    expect(second.roomId).toBe('r1');

    expect(first.points[first.points.length - 1]).toEqual({ x: 10, y: 5 });
    expect(second.points[0]).toEqual({ x: 10, y: 5 });
    expect(first.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(second.points).toEqual([{ x: 10, y: 5 }, { x: 10, y: 10 }]);

    expect(first.lengthMm + second.lengthMm).toBeCloseTo(oldLength, 9);
    expect(Math.abs(first.lengthMm + second.lengthMm - oldLength)).toBeLessThan(1);
    expect(first.lengthMm).toBeCloseTo(30, 9);
    expect(second.lengthMm).toBeCloseTo(10, 9);
  });

  it('takes the room id of the from node for a connector', () => {
    const connector: RouteEdge = { ...edge('C', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }]), kind: 'connector', roomId: null };
    const graph: GraphData = {
      nodes: [{ id: 'a', point: { x: 0, y: 0 }, kind: 'end', roomId: 'r9' }, node('b', 10, 0)],
      edges: [connector],
    };
    splitEdgeAt(graph, 'C', 0, { x: 4, y: 0 }, 'tap1');
    expect(graph.nodes.find((n) => n.id === 'tap1')?.roomId).toBe('r9');
    expect(graph.edges[0]!.roomId).toBeNull();
    expect(graph.edges[1]!.roomId).toBeNull();
    expect(graph.edges[0]!.kind).toBe('connector');
    expect(graph.edges[1]!.kind).toBe('connector');
  });

  it('does not repeat an interior vertex', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 20, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])],
    };
    splitEdgeAt(graph, 'E', 0, { x: 10, y: 0 }, 'tap1');
    expect(graph.edges[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(graph.edges[1]!.points).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  });

  it('does not repeat an interior vertex on segment 1', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 20, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])],
    };
    splitEdgeAt(graph, 'E', 1, { x: 10, y: 0 }, 'tap1');
    expect(graph.edges[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(graph.edges[1]!.points).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  });

  it('throws for an unknown edge id', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }])],
    };
    expect(() => splitEdgeAt(graph, 'nope', 0, { x: 5, y: 0 }, 'tap1')).toThrow('route-graph: unknown edge nope');
  });

  it('throws for a bad segment index', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      edges: [edge('E', 'a', 'b', [{ x: 0, y: 0 }, { x: 10, y: 0 }])],
    };
    expect(() => splitEdgeAt(graph, 'E', 1, { x: 5, y: 0 }, 'tap1')).toThrow();
    expect(() => splitEdgeAt(graph, 'E', -1, { x: 5, y: 0 }, 'tap1')).toThrow();
    expect(() => splitEdgeAt(graph, 'E', 0.5, { x: 5, y: 0 }, 'tap1')).toThrow();
  });
});

describe('connectedParts', () => {
  it('gives two parts for two separate edges', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 1, 0), node('c', 5, 0), node('d', 6, 0)],
      edges: [edge('E1', 'a', 'b', [{ x: 0, y: 0 }, { x: 1, y: 0 }]), edge('E2', 'c', 'd', [{ x: 5, y: 0 }, { x: 6, y: 0 }])],
    };
    expect(connectedParts(graph)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('gives one part for a chain', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 1, 0), node('c', 2, 0)],
      edges: [edge('E1', 'a', 'b', [{ x: 0, y: 0 }, { x: 1, y: 0 }]), edge('E2', 'b', 'c', [{ x: 1, y: 0 }, { x: 2, y: 0 }])],
    };
    expect(connectedParts(graph)).toEqual([['a', 'b', 'c']]);
  });

  it('gives an isolated node a part of its own', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 1, 0), node('c', 5, 5)],
      edges: [edge('E1', 'a', 'b', [{ x: 0, y: 0 }, { x: 1, y: 0 }])],
    };
    expect(connectedParts(graph)).toEqual([['a', 'b'], ['c']]);
  });

  it('gives an empty list for an empty graph', () => {
    expect(connectedParts({ nodes: [], edges: [] })).toEqual([]);
  });

  it('orders the parts by the first node and keeps the node order inside a part', () => {
    const graph: GraphData = {
      nodes: [node('n1', 0, 0), node('n2', 5, 5), node('n3', 1, 0)],
      edges: [edge('E1', 'n3', 'n1', [{ x: 1, y: 0 }, { x: 0, y: 0 }])],
    };
    expect(connectedParts(graph)).toEqual([['n1', 'n3'], ['n2']]);
  });

  it('ignores an edge with an unknown node id', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 1, 0)],
      edges: [edge('E1', 'a', 'zz', [{ x: 0, y: 0 }, { x: 1, y: 0 }])],
    };
    expect(connectedParts(graph)).toEqual([['a'], ['b']]);
  });

  it('does not change the graph', () => {
    const graph: GraphData = {
      nodes: [node('a', 0, 0), node('b', 1, 0), node('c', 5, 5)],
      edges: [edge('E1', 'a', 'b', [{ x: 0, y: 0 }, { x: 1, y: 0 }])],
    };
    const before = JSON.parse(JSON.stringify(graph));
    connectedParts(graph);
    expect(graph).toEqual(before);
  });
});
