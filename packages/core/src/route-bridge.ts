// Bridge edges between the separate parts of a route graph. A bridge joins a node of one part
// to the nearest centre edge of another part with an axis aligned elbow. Pure functions.

import type { Vec2 } from './geometry.js';
import { connectedParts, nearestOnEdges, polylineLength, splitEdgeAt, type GraphData } from './route-graph.js';
import { elbowPath } from './route-layout.js';

interface BridgeCandidate {
  nodeId: string;
  edgeId: string;
  segment: number;
  point: Vec2;
  lengthPt: number;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The candidates from the nodes of `side` to the centre edges that start in `other`. */
function sideCandidates(graph: GraphData, side: readonly string[], other: ReadonlySet<string>): BridgeCandidate[] {
  const found: BridgeCandidate[] = [];
  for (const nodeId of side) {
    const node = graph.nodes.find((n) => n.id === nodeId)!;
    if (node.kind === 'wall') continue;
    const hit = nearestOnEdges(graph, node.point, (e) => e.kind === 'center' && other.has(e.from));
    if (hit) found.push({ nodeId, edgeId: hit.edgeId, segment: hit.segment, point: hit.point, lengthPt: hit.distance });
  }
  return found;
}

/**
 * Adds bridge edges, id 'rb-<k>', until no part can join the part of `rootId`.
 * Each step joins the root part to the nearest part that a bridge can reach. A part whose
 * nodes are all walls is ignored. The graph is changed: bridge edges and split nodes are added.
 * Returns the ids of the bridge edges in creation order.
 */
export function bridgeParts(
  graph: GraphData,
  rootId: string,
  mmPerPt: number,
  accepts?: (pathMm: Vec2[]) => boolean,
): string[] {
  const added: string[] = [];
  for (;;) {
    const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]));
    const steiner: GraphData = { nodes: graph.nodes, edges: graph.edges.filter((e) => !e.id.startsWith('rc-ry-')) };
    const parts = connectedParts(steiner).filter((part) => part.some((id) => kindById.get(id) !== 'wall'));
    const rootPart = parts.find((part) => part.includes(rootId))!;
    const rootSet = new Set(rootPart);
    const candidates: BridgeCandidate[] = [];
    for (const part of parts) {
      if (part === rootPart) continue;
      const partSet = new Set(part);
      candidates.push(...sideCandidates(graph, rootPart, partSet), ...sideCandidates(graph, part, rootSet));
    }
    candidates.sort(
      (a, b) =>
        a.lengthPt - b.lengthPt ||
        compareText(a.nodeId, b.nodeId) ||
        compareText(a.edgeId, b.edgeId) ||
        a.segment - b.segment,
    );

    let bridged = false;
    for (const candidate of candidates) {
      const from = graph.nodes.find((n) => n.id === candidate.nodeId)!;
      const axis = Math.abs(candidate.point.x - from.point.x) >= Math.abs(candidate.point.y - from.point.y) ? 'x' : 'y';
      const points = elbowPath(from.point, candidate.point, axis);
      const pathMm = points.map((p) => ({ x: p.x * mmPerPt, y: p.y * mmPerPt }));
      if (accepts && !accepts(pathMm)) continue;
      const k = added.length;
      const end = splitEdgeAt(graph, candidate.edgeId, candidate.segment, candidate.point, 'rb-n' + k);
      const edgeId = 'rb-' + k;
      graph.edges.push({
        id: edgeId,
        from: from.id,
        to: end,
        kind: 'connector',
        points,
        lengthMm: polylineLength(points) * mmPerPt,
        roomId: null,
      });
      added.push(edgeId);
      bridged = true;
      break;
    }
    if (!bridged) return added;
  }
}
