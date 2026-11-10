// Flow solve: capacity accumulation, not physics. Ports the old app's model
// (NetworkFlowProcessor.cs:11-41, "deterministic subtree-sum over PORT-GROUP
// junctions") — a single bottom-up sum of a user-entered, unitless capacity
// number per terminal, propagated through fittings and segments toward a
// root. There is no pressure drop, velocity, or duct/pipe sizing computed
// anywhere here; NetworkType.units (network.ts) is a display label only and
// is never read by this module, matching the old app's FlowResult doc
// comment ("unitless") confirmed by investigation.
// Sizing is in sizing-network.ts; this module still has no unit.

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
  /** Optional explicit source: the exact element id. Its port nodes, group nodes and fitting nodes can be the root. When omitted the root follows the old app's FindRoot order (NetworkFlowProcessor.cs:227-276) — see solveFlow — without its MainEquipment step, which this layer has no concept of. */
  rootElementId?: string;
  /** With `rootElementId`: the start port. It picks one node when the element has more than one node in the network. A port in a port group gives the group node. */
  rootPortId?: string;
  /** The stamp category of each element whose ports are in the network — what tells an equipment (the source) apart from a terminal and a loose duct end. An element missing here counts as a terminal only when it has a capacity. */
  elementCategories?: Record<string, StampCategory>;
  /** Ids of the fittings that carry a riser mark. Such a fitting is a boundary: it is never the root (an explicit root that is marked is ignored), and the solve does not continue past it. When omitted, nothing changes. */
  riserFittingIds?: ReadonlySet<string>;
}

/** `out`: flow arrives at the riser fitting (this level feeds the riser). `in`: flow leaves it (the riser feeds this level). `none`: neither. */
export type RiserFittingFlow = 'out' | 'in' | 'none';

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

  const riserFittingIds = input.riserFittingIds;
  const isBoundary = (k: string): boolean =>
    riserFittingIds !== undefined && k.startsWith('fitting:') && riserFittingIds.has(k.slice('fitting:'.length));
  const rootCandidates = riserFittingIds ? nodeKeys.filter((k) => !isBoundary(k)) : nodeKeys;
  if (rootCandidates.length === 0) {
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
  const isRootNode = (k: string): boolean =>
    elementIdOf(k) === input.rootElementId || k === `fitting:${input.rootElementId}`;
  let explicitRootKey: string | undefined;
  if (input.rootElementId) {
    if (input.rootPortId) {
      const portKey = nodeKeyOf({ kind: 'port', elementId: input.rootElementId, portId: input.rootPortId }, input.portGroups);
      if (adjacency.has(portKey)) explicitRootKey = portKey;
    }
    explicitRootKey ??= rootCandidates.find(isRootNode);
    if (explicitRootKey !== undefined && isBoundary(explicitRootKey)) explicitRootKey = undefined;
  }
  const rootKey =
    explicitRootKey ||
    rootCandidates.find((k) => degreeOf(k) === 1 && categoryOf(k) === 'equipment') ||
    rootCandidates.find((k) => degreeOf(k) === 1 && !isTerminal(k)) ||
    rootCandidates.find((k) => categoryOf(k) === 'equipment') ||
    rootCandidates.find((k) => degreeOf(k) === 1) ||
    rootCandidates[0];

  // Post-order DFS: each node's demand = its own capacity + the sum of its children's subtree demand.
  const visited = new Set<string>();
  const demandOf = (nodeKey: string): number => {
    visited.add(nodeKey);
    let demand = ownCapacityOf(nodeKey, input.terminalCapacities);
    for (const edge of adjacency.get(nodeKey) ?? []) {
      if (visited.has(edge.neighborKey)) {
        continue; // already visited: either the parent, or a cycle-closing edge — left unresolved either way
      }
      if (isBoundary(edge.neighborKey)) visited.add(edge.neighborKey); // a riser fitting ends the walk: nothing beyond it is followed
      const childDemand = isBoundary(edge.neighborKey) ? 0 : demandOf(edge.neighborKey);
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

/** For each marked fitting of the network: `out` when the level has a source and the solve reaches the fitting; `in` when there is no source and the solve reaches the fitting and the network has a total terminal capacity above 0; else `none`. A source is an element of category 'equipment' in `elementCategories`, or the explicit `rootElementId` when it is not a marked fitting and one of its ports or fittings ends a segment of the network. A stale root id gives no source. Needs `input.riserFittingIds`. */
export function riserFittingFlow(input: FlowSolveInput): Record<string, RiserFittingFlow> {
  const marks = input.riserFittingIds ?? new Set<string>();
  const markedIds = input.network.fittingIds.filter((id) => marks.has(id));
  const flow: Record<string, RiserFittingFlow> = Object.fromEntries(markedIds.map((id) => [id, 'none' as const]));
  const result = solveFlow(input);
  if (!result.resolved) return flow;
  const root = input.rootElementId;
  const rootInNetwork =
    root !== undefined &&
    root !== '' &&
    !marks.has(root) &&
    input.segments.some(
      (segment) =>
        input.network.segmentIds.includes(segment.id) &&
        [segment.endpointA, segment.endpointB].some((endpoint) =>
          endpoint.kind === 'port' ? endpoint.elementId === root : endpoint.fittingId === root,
        ),
    );
  const hasSource = rootInNetwork || Object.values(input.elementCategories ?? {}).includes('equipment');
  const networkElementIds = Array.from(
    new Set(
      input.segments
        .filter((segment) => input.network.segmentIds.includes(segment.id))
        .flatMap((segment) => [segment.endpointA, segment.endpointB])
        .flatMap((endpoint) => (endpoint.kind === 'port' ? [endpoint.elementId] : [])),
    ),
  );
  const networkCapacity = networkElementIds.reduce((sum, id) => sum + (input.terminalCapacities[id] ?? 0), 0);
  for (const id of markedIds) {
    if (result.fittingCapacity[id] == null) continue;
    flow[id] = hasSource ? 'out' : networkCapacity > 0 ? 'in' : 'none';
  }
  return flow;
}
