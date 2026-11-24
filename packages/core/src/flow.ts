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
import { highestFlow } from './flow-highest.js';
import type { StampCategory } from './stamp-library.js';

export interface RiserSide {
  /** Terminal capacity on the far side of one span, seen from this level. */
  demand: number;
  /** The number of open ends on the far side. */
  openEnds: number;
}

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
  /** Ids of the fittings that carry a riser mark. Such a fitting is a boundary: it is never the root unless it is `entryFittingId`, an explicit root that is marked is ignored unless it is the entry, and the solve does not continue past it. When omitted, nothing changes. */
  riserFittingIds?: ReadonlySet<string>;
  /** A marked riser fitting that feeds this network. It is the root right after an explicit root and before the old root order; every other marked fitting stays a boundary. Ignored when it is not in `riserFittingIds` or not in the network. */
  entryFittingId?: string;
  /** Capacity beyond each marked fitting (fitting id to number). A boundary fitting counts it as child demand; the entry, as the root, adds it to its total. A key for an unmarked fitting or a fitting outside the network is ignored. When omitted, nothing changes. */
  riserDemand?: Record<string, number>;
  /** With no source and no valid entry or explicit root, treat every open end as a possible source and give each segment and fitting the highest value over all choices. Opt in; sizing and routing do not set it. */
  highestWhenNoSource?: boolean;
  /** Fittings that are never a root and never an open end in the highest rule: riser fittings that have no input. Ignored by the old rule. */
  notOpenEndIds?: ReadonlySet<string>;
  /** For a marked riser fitting with one segment: one entry for each span at the fitting. Used only by the highest rule. A key for an unmarked fitting or a fitting outside the network is ignored. */
  riserSides?: Record<string, ReadonlyArray<RiserSide>>;
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
  /** The sum of the `riserDemand` values this solve used (the exits it reached, plus the entry when it is the root). Set only when `riserDemand` is given. */
  riserCapacity?: number;
  /** The network has no source. 'highest': the highest rule gave the numbers (K is 2 or more). 'loop': a loop kept the old rule. Absent otherwise. */
  noSource?: 'highest' | 'loop';
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

function networkSegmentsOf(input: FlowSolveInput): Segment[] {
  const segmentById = new Map(input.segments.map((s) => [s.id, s]));
  return input.network.segmentIds.map((id) => segmentById.get(id)).filter((s): s is Segment => s != null);
}

function isOpenEndKey(nodeKey: string, degree: number, input: FlowSolveInput): boolean {
  if (degree !== 1 || !nodeKey.startsWith('fitting:')) return false;
  const fittingId = nodeKey.slice('fitting:'.length);
  return !input.riserFittingIds?.has(fittingId) && !input.notOpenEndIds?.has(fittingId);
}

function hasLoop(segments: Segment[], portGroups: PortGroup[]): boolean {
  const parent = new Map<string, string>();
  const rootOf = (key: string): string => {
    let root = key;
    while (parent.has(root)) root = parent.get(root)!;
    return root;
  };
  for (const segment of segments) {
    const a = rootOf(nodeKeyOf(segment.endpointA, portGroups));
    const b = rootOf(nodeKeyOf(segment.endpointB, portGroups));
    if (a === b) return true;
    parent.set(a, b);
  }
  return false;
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

  const riserDemand = input.riserDemand;
  const withRiserCapacity = (result: FlowResult, riserCapacity: number): FlowResult =>
    riserDemand ? { ...result, riserCapacity } : result;

  if (nodeKeys.length === 0) {
    return withRiserCapacity({ segmentCapacity, fittingCapacity, resolved: false, totalCapacity: null, segmentDirection }, 0);
  }

  const riserFittingIds = input.riserFittingIds;
  const isMarked = (k: string): boolean =>
    riserFittingIds !== undefined && k.startsWith('fitting:') && riserFittingIds.has(k.slice('fitting:'.length));
  const entryKey =
    input.entryFittingId !== undefined &&
    adjacency.has(`fitting:${input.entryFittingId}`) &&
    isMarked(`fitting:${input.entryFittingId}`)
      ? `fitting:${input.entryFittingId}`
      : undefined;
  const rootCandidates = riserFittingIds ? nodeKeys.filter((k) => !isMarked(k) || k === entryKey) : nodeKeys;
  if (rootCandidates.length === 0) {
    return withRiserCapacity({ segmentCapacity, fittingCapacity, resolved: false, totalCapacity: null, segmentDirection }, 0);
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
    if (explicitRootKey !== undefined && isMarked(explicitRootKey) && explicitRootKey !== entryKey) explicitRootKey = undefined;
  }

  let noSource: FlowResult['noSource'];
  if (input.highestWhenNoSource && explicitRootKey === undefined && entryKey === undefined && !networkHasSource(input)) {
    if (hasLoop(segments, input.portGroups)) {
      noSource = 'loop';
    } else {
      const rootsOf = (k: string): number => (isOpenEndKey(k, degreeOf(k), input) ? 1 : 0);
      const openEnds = nodeKeys.reduce((sum, k) => sum + rootsOf(k), 0);
      const sidesOf = (id: string): ReadonlyArray<RiserSide> => {
        if (input.riserSides && Object.hasOwn(input.riserSides, id)) return input.riserSides[id];
        if (riserDemand && Object.hasOwn(riserDemand, id)) return [{ demand: riserDemand[id], openEnds: 0 }];
        return [];
      };
      const sides = nodeKeys.filter(isMarked).flatMap((k) => {
        const id = k.slice('fitting:'.length);
        return sidesOf(id).map((side, i) => ({ k, id, i, side }));
      });
      const possibleSources = openEnds + sides.reduce((sum, s) => sum + s.side.openEnds, 0);
      if (possibleSources >= 1 && nodeKeys.every((k) => !isMarked(k) || degreeOf(k) === 1)) {
        const highest = highestFlow(
          [
            ...nodeKeys.map((k) => ({ id: k, own: ownCapacityOf(k, input.terminalCapacities), roots: rootsOf(k) })),
            ...sides.map(({ id, i, side }) => ({ id: `riser-side:${id}:${i}`, own: side.demand, roots: side.openEnds })),
          ],
          [
            ...segments.map((s) => ({ id: s.id, a: nodeKeyOf(s.endpointA, input.portGroups), b: nodeKeyOf(s.endpointB, input.portGroups) })),
            ...sides.map(({ k, id, i }) => ({ id: `riser-side-edge:${id}:${i}`, a: k, b: `riser-side:${id}:${i}` })),
          ],
        );
        if (highest) {
          for (const segment of segments) segmentCapacity[segment.id] = highest.edge[segment.id] ?? null;
          for (const id of input.network.fittingIds) fittingCapacity[id] = highest.node[`fitting:${id}`] ?? null;
          const result: FlowResult = { segmentCapacity, fittingCapacity, resolved: true, totalCapacity: highest.total, segmentDirection };
          const withNoSource: FlowResult = highest.roots >= 2 ? { ...result, noSource: 'highest' } : result;
          const riserCapacity = sides.reduce((sum, s) => sum + s.side.demand, 0);
          return riserDemand !== undefined || input.riserSides !== undefined ? { ...withNoSource, riserCapacity } : withNoSource;
        }
      }
    }
  }

  const rootKey =
    explicitRootKey ||
    entryKey ||
    rootCandidates.find((k) => degreeOf(k) === 1 && categoryOf(k) === 'equipment') ||
    rootCandidates.find((k) => degreeOf(k) === 1 && !isTerminal(k)) ||
    rootCandidates.find((k) => categoryOf(k) === 'equipment') ||
    rootCandidates.find((k) => degreeOf(k) === 1) ||
    rootCandidates[0];
  const isBoundary = (k: string): boolean => isMarked(k) && k !== rootKey;

  // Post-order DFS: each node's demand = its own capacity + the sum of its children's subtree demand.
  const visited = new Set<string>();
  let usedRiserDemand = 0;
  const takeRiserDemand = (nodeKey: string): number => {
    const id = nodeKey.slice('fitting:'.length);
    const beyond = riserDemand && Object.hasOwn(riserDemand, id) ? riserDemand[id] : 0;
    usedRiserDemand += beyond;
    return beyond;
  };
  const demandOf = (nodeKey: string): number => {
    visited.add(nodeKey);
    let demand = ownCapacityOf(nodeKey, input.terminalCapacities);
    for (const edge of adjacency.get(nodeKey) ?? []) {
      if (visited.has(edge.neighborKey)) {
        continue; // already visited: either the parent, or a cycle-closing edge — left unresolved either way
      }
      if (isBoundary(edge.neighborKey)) visited.add(edge.neighborKey); // a riser fitting ends the walk: nothing beyond it is followed
      const childDemand = isBoundary(edge.neighborKey) ? takeRiserDemand(edge.neighborKey) : demandOf(edge.neighborKey);
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

  const totalCapacity = demandOf(rootKey) + (rootKey === entryKey ? takeRiserDemand(rootKey) : 0);

  // The loop above only records a fitting's capacity when it's visited as someone else's
  // child edge — the root itself is never anyone's child, so a fitting that happens to BE
  // the root (the common case: a bare open trunk end) would otherwise stay null forever
  // even though totalCapacity already holds its correct subtree demand right here.
  const rootFittingMatch = /^fitting:(.+)$/.exec(rootKey);
  if (rootFittingMatch && rootFittingMatch[1] in fittingCapacity) {
    fittingCapacity[rootFittingMatch[1]] = totalCapacity;
  }

  return withRiserCapacity(
    { segmentCapacity, fittingCapacity, resolved: true, totalCapacity, segmentDirection, ...(noSource ? { noSource } : {}) },
    usedRiserDemand,
  );
}

/** The number of open ends of the network: bare fitting nodes with one segment that are not in `input.riserFittingIds` or `input.notOpenEndIds`. */
export function countOpenEnds(input: FlowSolveInput): number {
  const degrees = new Map<string, number>();
  for (const segment of networkSegmentsOf(input)) {
    for (const endpoint of [segment.endpointA, segment.endpointB]) {
      const key = nodeKeyOf(endpoint, input.portGroups);
      degrees.set(key, (degrees.get(key) ?? 0) + 1);
    }
  }
  return Array.from(degrees).filter(([key, degree]) => isOpenEndKey(key, degree, input)).length;
}

/** True when an element of category 'equipment' with own capacity not above 0 has a port in this network (only this network's elements count). */
export function networkHasSource(input: FlowSolveInput): boolean {
  return networkSegmentsOf(input).some((segment) =>
    [segment.endpointA, segment.endpointB].some(
      (endpoint) =>
        endpoint.kind === 'port' &&
        input.elementCategories?.[endpoint.elementId] === 'equipment' &&
        !((input.terminalCapacities[endpoint.elementId] ?? 0) > 0),
    ),
  );
}

/** For each marked fitting of the network: `out` when the level has a source and the solve reaches the fitting; `in` when there is no source and the solve reaches the fitting and the network has a total terminal capacity above 0; else `none`. A source is an element of category 'equipment' whose own capacity in `terminalCapacities` is 0 or absent, or the explicit `rootElementId` when it is not a marked fitting and one of its ports or fittings ends a segment of the network. A stale root id gives no source. Needs `input.riserFittingIds`. */
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
  const hasSource =
    rootInNetwork ||
    Object.entries(input.elementCategories ?? {}).some(([id, category]) => category === 'equipment' && !((input.terminalCapacities[id] ?? 0) > 0));
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
