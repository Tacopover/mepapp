// Flow solve: capacity accumulation, not physics. Ports the old app's model
// (NetworkFlowProcessor.cs:11-41, "deterministic subtree-sum over PORT-GROUP
// junctions") — a single bottom-up sum of a user-entered, unitless capacity
// number per terminal, propagated through fittings and segments toward a
// root. There is no pressure drop, velocity, or duct/pipe sizing computed
// anywhere here; NetworkType.units (network.ts) is a display label only and
// is never read by this module, matching the old app's FlowResult doc
// comment ("unitless") confirmed by investigation.

import type { Fitting, Network, PortGroup, Segment } from './network.js';
import { nodeKeyOf } from './network.js';

export interface FlowSolveInput {
  network: Network;
  segments: Segment[];
  fittings: Fitting[];
  portGroups: PortGroup[];
  /** User-entered capacity per element (typically terminals only — equipment/fittings contribute 0 of their own, same as the old app). */
  terminalCapacities: Record<string, number>;
  /** Optional explicit source; when omitted a degree-1 node is preferred, same heuristic family as the old app's FindRoot (NetworkFlowProcessor.cs:227-276), simplified since this layer has no Equipment/MainEquipment concept of its own. */
  rootElementId?: string;
}

export interface FlowResult {
  /** null means unresolved — either no root could be determined, or the segment closes a loop (loops are out of scope, matching the old app: NetworkFlowProcessor.cs:319-324). */
  segmentCapacity: Record<string, number | null>;
  fittingCapacity: Record<string, number | null>;
  resolved: boolean;
}

interface Edge {
  neighborKey: string;
  segmentId: string;
}

function ownCapacityOf(nodeKey: string, terminalCapacities: Record<string, number>): number {
  const match = /^port(?:-group)?:([^:]+)/.exec(nodeKey);
  if (!match) {
    return 0; // fitting nodes contribute nothing of their own
  }
  return terminalCapacities[match[1]] ?? 0;
}

export function solveFlow(input: FlowSolveInput): FlowResult {
  const segmentById = new Map(input.segments.map((s) => [s.id, s]));
  const segments = input.network.segmentIds.map((id) => segmentById.get(id)).filter((s): s is Segment => s != null);

  const adjacency = new Map<string, Edge[]>();
  const addEdge = (from: string, to: string, segmentId: string) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ neighborKey: to, segmentId });
  };
  for (const segment of segments) {
    const keyA = nodeKeyOf(segment.endpointA, input.portGroups);
    const keyB = nodeKeyOf(segment.endpointB, input.portGroups);
    addEdge(keyA, keyB, segment.id);
    addEdge(keyB, keyA, segment.id);
  }

  const nodeKeys = Array.from(adjacency.keys()).sort();
  const segmentCapacity: Record<string, number | null> = Object.fromEntries(segments.map((s) => [s.id, null]));
  const fittingCapacity: Record<string, number | null> = Object.fromEntries(
    input.network.fittingIds.map((id) => [id, null]),
  );

  if (nodeKeys.length === 0) {
    return { segmentCapacity, fittingCapacity, resolved: false };
  }

  const rootKey =
    (input.rootElementId &&
      nodeKeys.find((k) => k.includes(`:${input.rootElementId}`) || k.startsWith(`fitting:${input.rootElementId}`))) ||
    nodeKeys.find((k) => (adjacency.get(k)?.length ?? 0) === 1 && ownCapacityOf(k, input.terminalCapacities) === 0) ||
    nodeKeys.find((k) => (adjacency.get(k)?.length ?? 0) === 1) ||
    nodeKeys[0];

  // Post-order DFS: each node's demand = its own capacity + the sum of its children's subtree demand.
  const visited = new Set<string>();
  const demandOf = (nodeKey: string): number => {
    visited.add(nodeKey);
    let demand = ownCapacityOf(nodeKey, input.terminalCapacities);
    for (const edge of adjacency.get(nodeKey) ?? []) {
      if (visited.has(edge.neighborKey)) {
        continue; // already visited: either the parent, or a cycle-closing edge — left unresolved either way
      }
      const childDemand = demandOf(edge.neighborKey);
      segmentCapacity[edge.segmentId] = childDemand;
      demand += childDemand;
      const fittingMatch = /^fitting:(.+)$/.exec(edge.neighborKey);
      if (fittingMatch && fittingMatch[1] in fittingCapacity) {
        fittingCapacity[fittingMatch[1]] = childDemand;
      }
    }
    return demand;
  };

  demandOf(rootKey);

  return { segmentCapacity, fittingCapacity, resolved: true };
}
