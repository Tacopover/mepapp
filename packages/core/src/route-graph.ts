// Helpers on a route graph: the nearest point on an edge, the split of an edge at a
// point, and the connected parts. Pure functions. No room data is read.

import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import type { RouteEdge, RouteNode } from './route-area.js';

const SAME_POINT_PT = 1e-6;

export interface GraphData {
  nodes: RouteNode[];
  edges: RouteEdge[];
}

/** The nearest point on the edges that pass `filter`: { edgeId, segment, point, distance } or null. */
export function nearestOnEdges(
  graph: GraphData,
  point: Vec2,
  filter?: (edge: RouteEdge) => boolean,
): { edgeId: string; segment: number; point: Vec2; distance: number } | null {
  let best: { edgeId: string; segment: number; point: Vec2; distance: number } | null = null;
  for (const edge of graph.edges) {
    if (filter && !filter(edge)) continue;
    if (edge.points.length === 1) {
      const d = distance(point, edge.points[0]!);
      if (!best || d < best.distance) best = { edgeId: edge.id, segment: 0, point: edge.points[0]!, distance: d };
      continue;
    }
    for (let i = 0; i + 1 < edge.points.length; i++) {
      const p = closestPointOnSegment(point, edge.points[i]!, edge.points[i + 1]!).point;
      const d = distance(point, p);
      if (!best || d < best.distance) best = { edgeId: edge.id, segment: i, point: p, distance: d };
    }
  }
  return best;
}

/**
 * Splits the edge at the point (on segment `segment`) and returns the id of the new `tap` node.
 * Returns the id of an end node of the edge when the point is within 1e-6 of it.
 * The graph is changed only when the point is not at an end: the node is pushed to
 * `graph.nodes`, and the edge is replaced in place by two edges. The first keeps the
 * edge id, the second gets the id `edge.id + '~' + nodeId`.
 */
export function splitEdgeAt(graph: GraphData, edgeId: string, segment: number, point: Vec2, nodeId: string): string {
  const index = graph.edges.findIndex((e) => e.id === edgeId);
  if (index < 0) throw new Error('route-graph: unknown edge ' + edgeId);
  const edge = graph.edges[index]!;
  if (!Number.isInteger(segment) || segment < 0 || segment > edge.points.length - 2) {
    throw new Error('route-graph: bad segment ' + segment + ' of edge ' + edgeId);
  }
  if (distance(point, edge.points[0]!) <= SAME_POINT_PT) return edge.from;
  if (distance(point, edge.points[edge.points.length - 1]!) <= SAME_POINT_PT) return edge.to;

  const fromNode = graph.nodes.find((n) => n.id === edge.from);
  graph.nodes.push({ id: nodeId, point: { ...point }, kind: 'tap', roomId: edge.roomId ?? fromNode?.roomId ?? '' });

  const head = edge.points.slice(0, segment + 1);
  if (distance(head[segment]!, point) <= SAME_POINT_PT) head.pop();
  head.push({ ...point });
  const tail = edge.points.slice(segment + 1);
  if (distance(tail[0]!, point) <= SAME_POINT_PT) tail.shift();
  tail.unshift({ ...point });

  const headLength = polylineLength(head);
  const tailLength = polylineLength(tail);
  const sum = headLength + tailLength;
  const headMm = sum > 0 ? (edge.lengthMm * headLength) / sum : edge.lengthMm / 2;
  const tailMm = edge.lengthMm - headMm;

  const first: RouteEdge = { ...edge, to: nodeId, points: head, lengthMm: headMm };
  const second: RouteEdge = { ...edge, id: edge.id + '~' + nodeId, from: nodeId, points: tail, lengthMm: tailMm };
  graph.edges.splice(index, 1, first, second);
  return nodeId;
}

/** The connected parts of the graph as arrays of node ids. An edge with an unknown end is ignored. The graph is not changed. */
export function connectedParts(graph: GraphData): string[][] {
  const parent = new Map<string, string>(graph.nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const edge of graph.edges) {
    if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
    const a = find(edge.from);
    const b = find(edge.to);
    if (a !== b) parent.set(b, a);
  }
  const parts = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const root = find(node.id);
    let part = parts.get(root);
    if (!part) {
      part = [];
      parts.set(root, part);
    }
    part.push(node.id);
  }
  return [...parts.values()];
}

function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += distance(points[i]!, points[i + 1]!);
  return total;
}
