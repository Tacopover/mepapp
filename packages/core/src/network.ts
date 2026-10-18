// Segment/fitting/network domain model. Pure data + pure connectivity
// derivation — no rendering, no I/O. Network membership is derived from
// graph adjacency on every call rather than stamped on elements, unlike the
// old app, whose SegmentLifecycleManager had to hand-sync a mutable
// NetworkId across four separate collections and ship a dedicated
// NetworkConnectivityService just to detect when that state drifted
// (SegmentLifecycleManager.cs:11-22). Call computeNetworks again after any
// topology edit instead of mutating stored membership.

import type { Vec2 } from './geometry.js';
import type { FlowUnitId } from './flow-units.js';
import type { SizingMethod } from './sizing-settings.js';

export type Discipline =
  | 'heatingAndCooling'
  | 'ventilation'
  | 'plumbing'
  | 'fireProtection'
  | 'electrical'
  | 'other';

export type LinePattern = 'solid' | 'dashed' | 'dotted' | 'dashDot' | 'longDash' | 'dashDotDot';

export interface NetworkType {
  id: string;
  name: string;
  discipline: Discipline;
  /** Display-only label (e.g. "CFM", "GPM"). Never consulted by flow solve — see flow.ts. */
  units: string;
  defaultCapacity: number;
  /** Hex color (e.g. '#2196f3') a drawn segment of this type is stroked with — see render's syncDrawingLayer. */
  color: string;
  lineWidthPt: number;
  linePattern: LinePattern;
  /** The unit of the capacity numbers of this type (flow-units.ts). Absent = not set. */
  flowUnit?: FlowUnitId;
  /** The method to size a network of this type with. Absent = not sized. The limits are in ProjectDocument.networkSizing. */
  sizingMethod?: SizingMethod;
}

export type SegmentShape = 'round' | 'rectangular';

/**
 * One end of a segment: either a bare junction (a Fitting) or a named port
 * on a placed element (Terminal/Equipment, see stamp.ts's PlacedStamp).
 * Replaces the old app's two separate connectivity mechanisms — plain
 * shared-Node adjacency, and a parallel MepElementPort/MepPortConnection
 * port-group system — with one shape.
 */
export type ConnectionPoint =
  | { kind: 'fitting'; fittingId: string }
  | { kind: 'port'; elementId: string; portId: string };

/** The route command made this item (auto-routing-r6.md section 4.1). Absent = drawn by hand. */
export type RoutedMark = 'route';
export const ROUTED_MARK: RoutedMark = 'route';

export interface Segment {
  id: string;
  pageIndex: number;
  networkTypeId: string;
  shape: SegmentShape;
  /** Present when shape === 'round'. */
  diameter?: number;
  /** Present when shape === 'rectangular'. */
  width?: number;
  height?: number;
  /** Duct/pipe/conduit material. New field — the old app never had one. */
  material?: string;
  /** The route command made this segment (auto-routing-r6.md section 4.1). Absent = drawn by hand. */
  routedBy?: RoutedMark;
  endpointA: ConnectionPoint;
  endpointB: ConnectionPoint;
  /** Polyline in page space; first point is endpointA's world position, last is endpointB's. */
  geometry: Vec2[];
}

export type FittingKind = 'junction' | 'elbow' | 'tee' | 'reducer' | 'cross';

export interface Fitting {
  id: string;
  pageIndex: number;
  position: Vec2;
  /** The old app tried and abandoned a fitting-type field (Fitting.cs:99, commented out); the new app keeps it. */
  kind: FittingKind;
  /** The route command made this fitting (auto-routing-r6.md section 4.1). Absent = drawn by hand. */
  routedBy?: RoutedMark;
}

/**
 * Ports on the same element that are internally linked. A segment between
 * two grouped ports joins them when both ends have one network type. A group
 * alone never joins segments of different network types. A port with no
 * matching group entry is its own singleton group.
 */
export interface PortGroup {
  elementId: string;
  portIds: string[];
}

export interface NetworkGraphInput {
  segments: Segment[];
  fittings: Fitting[];
  portGroups: PortGroup[];
}

export interface Network {
  /** Stable only within one computeNetworks call — recomputed from topology, never persisted as identity. */
  id: string;
  networkTypeId: string;
  segmentIds: string[];
  fittingIds: string[];
}

/** The connectivity-graph node a connection point belongs to. Exported so flow.ts can build the same graph. */
export function nodeKeyOf(point: ConnectionPoint, portGroups: PortGroup[]): string {
  if (point.kind === 'fitting') {
    return `fitting:${point.fittingId}`;
  }
  const group = portGroups.find((g) => g.elementId === point.elementId && g.portIds.includes(point.portId));
  return group
    ? `port-group:${point.elementId}:${[...group.portIds].sort().join(',')}`
    : `port:${point.elementId}:${point.portId}`;
}

/** The key of a connection point for the union in computeNetworks. A group node is split by the network type of the segment, so a port group never joins segments of different types. */
function unionKeyOf(point: ConnectionPoint, networkTypeId: string, portGroups: PortGroup[]): string {
  const key = nodeKeyOf(point, portGroups);
  return key.startsWith('port-group:') ? `${key}@${networkTypeId}` : key;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) {
      return x;
    }
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

/**
 * Derives connected networks from segment/fitting topology. A fitting with
 * no connected segments is orphaned and excluded from the result, matching
 * the old app's Fitting (a fitting whose last segment is removed clears its
 * NetworkId — Fitting.cs:256-260). Two segments are connected when they share
 * a fitting or a plain port, or when their ends sit in one port group and both
 * segments have the same networkTypeId. Two limits: (1) air only: water flow
 * and return share one type, so a group over them still joins both pipes;
 * (2) a fitting or port that two segments of different types share still
 * joins them, and the first segment wins the type. A mismatch is a UI and
 * validation concern, not this function's job.
 */
export function computeNetworks(input: NetworkGraphInput): Network[] {
  const uf = new UnionFind();

  for (const segment of input.segments) {
    const keyA = unionKeyOf(segment.endpointA, segment.networkTypeId, input.portGroups);
    const keyB = unionKeyOf(segment.endpointB, segment.networkTypeId, input.portGroups);
    uf.union(keyA, keyB);
  }

  const rootToSegmentIds = new Map<string, Set<string>>();
  const rootToNetworkType = new Map<string, string>();

  for (const segment of input.segments) {
    const root = uf.find(unionKeyOf(segment.endpointA, segment.networkTypeId, input.portGroups));
    if (!rootToSegmentIds.has(root)) {
      rootToSegmentIds.set(root, new Set());
      rootToNetworkType.set(root, segment.networkTypeId);
    }
    rootToSegmentIds.get(root)!.add(segment.id);
  }

  const rootToFittingIds = new Map<string, Set<string>>();
  for (const fitting of input.fittings) {
    const root = uf.find(`fitting:${fitting.id}`);
    if (!rootToSegmentIds.has(root)) {
      continue; // orphaned: no connected segments
    }
    if (!rootToFittingIds.has(root)) {
      rootToFittingIds.set(root, new Set());
    }
    rootToFittingIds.get(root)!.add(fitting.id);
  }

  return Array.from(rootToSegmentIds.entries()).map(([root, segmentIds], index) => ({
    id: `net-${index}`,
    networkTypeId: rootToNetworkType.get(root)!,
    segmentIds: Array.from(segmentIds),
    fittingIds: Array.from(rootToFittingIds.get(root) ?? []),
  }));
}

/** The ids of all segments in the networks that hold any of `segmentIds`. An id that is no segment of `input` is left out. */
export function segmentIdsOfNetworks(input: NetworkGraphInput, segmentIds: readonly string[]): Set<string> {
  const seeds = new Set(segmentIds);
  const result = new Set<string>();
  for (const network of computeNetworks(input)) {
    if (network.segmentIds.some((id) => seeds.has(id))) {
      for (const id of network.segmentIds) {
        result.add(id);
      }
    }
  }
  return result;
}
