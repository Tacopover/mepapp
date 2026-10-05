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
import type { StampCategory } from './stamp-library.js';

export interface FlowSolveInput {
  network: Network;
  segments: Segment[];
  fittings: Fitting[];
  portGroups: PortGroup[];
  /** User-entered capacity per element (typically terminals only — equipment/fittings contribute 0 of their own, same as the old app). */
  terminalCapacities: Record<string, number>;
  /** Optional explicit source; when omitted the root follows the old app's FindRoot order (NetworkFlowProcessor.cs:227-276) — see solveFlow — without its MainEquipment step, which this layer has no concept of. */
  rootElementId?: string;
  /** The stamp category of each element whose ports are in the network — what tells an equipment (the source) apart from a terminal and a loose duct end. An element missing here counts as a terminal only when it has a capacity. */
  elementCategories?: Record<string, StampCategory>;
}

export interface FlowResult {
  /** null means unresolved — either no root could be determined, or the segment closes a loop (loops are out of scope, matching the old app: NetworkFlowProcessor.cs:319-324). */
  segmentCapacity: Record<string, number | null>;
  fittingCapacity: Record<string, number | null>;
  resolved: boolean;
  /** The root's own total subtree demand — the whole network's total capacity. Not the sum of segmentCapacity's values: each of those is already a subtree total on its own, so summing them over-counts everything except the leaf segments. Null when unresolved. */
  totalCapacity: number | null;
  /** Which physical endpoint is upstream (toward the resolved root): 'AtoB' means flow travels from endpointA to endpointB. A purely structural direction (leaf-to-root), not a supply/return distinction — this layer has no such concept. Null wherever segmentCapacity is null. */
  segmentDirection: Record<string, 'AtoB' | 'BtoA' | null>;
}

interface Edge {
  neighborKey: string;
  segmentId: string;
}

function elementIdOf(nodeKey: string): string | null {
  return /^port(?:-group)?:([^:]+)/.exec(nodeKey)?.[1] ?? null;
}

function ownCapacityOf(nodeKey: string, terminalCapacities: Record<string, number>): number {
  const elementId = elementIdOf(nodeKey);
  if (elementId === null) {
    return 0; // fitting nodes contribute nothing of their own
  }
  return terminalCapacities[elementId] ?? 0;
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
  const segmentDirection: Record<string, 'AtoB' | 'BtoA' | null> = Object.fromEntries(segments.map((s) => [s.id, null]));
  const fittingCapacity: Record<string, number | null> = Object.fromEntries(
    input.network.fittingIds.map((id) => [id, null]),
  );

  if (nodeKeys.length === 0) {
    return { segmentCapacity, fittingCapacity, resolved: false, totalCapacity: null, segmentDirection };
  }

  // Root order, as the old app's FindRoot: an equipment with one connection
  // (a single-trunk AHU), then an open end that is not a terminal (a loose
  // duct end, or a collector's discharge), then any equipment. Without the
  // equipment steps a loose duct end won over the AHU, since `fitting:` keys
  // sort before `port:` keys.
  const degreeOf = (nodeKey: string): number => adjacency.get(nodeKey)?.length ?? 0;
  const categoryOf = (nodeKey: string): StampCategory | undefined => {
    const elementId = elementIdOf(nodeKey);
    return elementId === null ? undefined : input.elementCategories?.[elementId];
  };
  const isTerminal = (nodeKey: string): boolean =>
    categoryOf(nodeKey) === 'terminal' || ownCapacityOf(nodeKey, input.terminalCapacities) !== 0;
  const rootKey =
    (input.rootElementId &&
      nodeKeys.find((k) => k.includes(`:${input.rootElementId}`) || k.startsWith(`fitting:${input.rootElementId}`))) ||
    nodeKeys.find((k) => degreeOf(k) === 1 && categoryOf(k) === 'equipment') ||
    nodeKeys.find((k) => degreeOf(k) === 1 && !isTerminal(k)) ||
    nodeKeys.find((k) => categoryOf(k) === 'equipment') ||
    nodeKeys.find((k) => degreeOf(k) === 1) ||
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
      const segment = segmentById.get(edge.segmentId);
      if (segment) {
        // nodeKey is the parent (toward-root) end of this edge — whichever of the
        // segment's two endpoints resolves to nodeKey is the upstream one.
        segmentDirection[edge.segmentId] = nodeKeyOf(segment.endpointA, input.portGroups) === nodeKey ? 'BtoA' : 'AtoB';
      }
      demand += childDemand;
      const fittingMatch = /^fitting:(.+)$/.exec(edge.neighborKey);
      if (fittingMatch && fittingMatch[1] in fittingCapacity) {
        fittingCapacity[fittingMatch[1]] = childDemand;
      }
    }
    return demand;
  };

  const totalCapacity = demandOf(rootKey);

  // The loop above only records a fitting's capacity when it's visited as someone else's
  // child edge — the root itself is never anyone's child, so a fitting that happens to BE
  // the root (the common case: a bare open trunk end) would otherwise stay null forever
  // even though totalCapacity already holds its correct subtree demand right here.
  const rootFittingMatch = /^fitting:(.+)$/.exec(rootKey);
  if (rootFittingMatch && rootFittingMatch[1] in fittingCapacity) {
    fittingCapacity[rootFittingMatch[1]] = totalCapacity;
  }

  return { segmentCapacity, fittingCapacity, resolved: true, totalCapacity, segmentDirection };
}
