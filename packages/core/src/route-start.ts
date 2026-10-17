// The start check of the route dialog (auto-routing-r3.md §3.5). Reads its input and writes nothing.

import { computeNetworks, nodeKeyOf } from './network.js';
import type { ConnectionPoint, Fitting, PortGroup, Segment } from './network.js';
import { getStampPorts } from './stamp.js';
import type { RouteStamp } from './route-ports.js';

export type StartProblemCode =
  | 'unknown-start'       // the start stamp or the start port does not exist
  | 'not-equipment'       // the start stamp has a category other than 'equipment'
  | 'port-segments'       // before: the start port has more than one segment. after: it has none, or more than one
  | 'port-foreign-type'   // a segment on the start port has a network type other than the chosen type
  | 'group-other-type'    // a group mate of the start port has a segment of another type (the group keeps it apart)
  | 'group-same-type'     // a group mate of the start port has a segment of the chosen type (the run joins that network)
  | 'second-equipment';   // the network that the run joins holds another equipment stamp

export type StartSeverity = 'error' | 'warning' | 'info';

export interface StartProblem {
  code: StartProblemCode;
  severity: StartSeverity;
  /** port-segments: the number of segments on the start port. */
  count?: number;
  /** port-foreign-type, group-other-type: the foreign network type ids, sorted, no repeat. */
  typeIds?: string[];
  /** group-other-type, group-same-type: the group mates (port ids of the start stamp) that have such a segment, in port order. */
  portIds?: string[];
  /** second-equipment: the other equipment stamps in the network, sorted by id. */
  stampIds?: string[];
}

export interface StartCheckInput {
  stamps: readonly RouteStamp[];
  segments: readonly Segment[];
  fittings: readonly Fitting[];
  portGroups: readonly PortGroup[];
  startStampId: string;
  startPortId: string;
  networkTypeId: string;
  /** Default 'before'. */
  phase?: 'before' | 'after';
}

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function isPortEndpoint(point: ConnectionPoint, stampId: string, portId: string): boolean {
  return point.kind === 'port' && point.elementId === stampId && point.portId === portId;
}

/** The problems of a start, errors first, then warnings, then info, each group in the order of the union above. An empty list means no problem found. */
export function checkRouteStart(input: StartCheckInput): StartProblem[] {
  const stamp = input.stamps.find((candidate) => candidate.id === input.startStampId);
  if (!stamp || !getStampPorts(stamp).some((port) => port.id === input.startPortId)) return [{ code: 'unknown-start', severity: 'error' }];

  const { startStampId, startPortId, networkTypeId } = input;
  const phase = input.phase ?? 'before';
  const segments: Segment[] = [...input.segments];
  const fittings: Fitting[] = [...input.fittings];
  const portGroups: PortGroup[] = [...input.portGroups];
  const errors: StartProblem[] = [];
  const warnings: StartProblem[] = [];
  const infos: StartProblem[] = [];

  if (stamp.category !== 'equipment') errors.push({ code: 'not-equipment', severity: 'error' });

  const startKey = nodeKeyOf({ kind: 'port', elementId: startStampId, portId: startPortId }, portGroups);
  const segmentsOn = (portId: string): Segment[] =>
    segments.filter((segment) => isPortEndpoint(segment.endpointA, startStampId, portId) || isPortEndpoint(segment.endpointB, startStampId, portId));

  const ownSegments = segmentsOn(startPortId);
  const count = ownSegments.length;
  if (phase === 'after' && count === 0) errors.push({ code: 'port-segments', severity: 'error', count: 0 });
  else if (count > 1) warnings.push({ code: 'port-segments', severity: 'warning', count });

  const foreignTypeIds = sortedUnique(ownSegments.map((segment) => segment.networkTypeId).filter((typeId) => typeId !== networkTypeId));
  if (foreignTypeIds.length > 0) errors.push({ code: 'port-foreign-type', severity: 'error', typeIds: foreignTypeIds });

  const mateIds = getStampPorts(stamp)
    .map((port) => port.id)
    .filter((portId) => portId !== startPortId && nodeKeyOf({ kind: 'port', elementId: startStampId, portId }, portGroups) === startKey);
  const otherMateIds = mateIds.filter((portId) => segmentsOn(portId).some((segment) => segment.networkTypeId !== networkTypeId));
  const sameMateIds = mateIds.filter((portId) => segmentsOn(portId).some((segment) => segment.networkTypeId === networkTypeId));
  if (otherMateIds.length > 0) {
    const typeIds = sortedUnique(otherMateIds.flatMap((portId) => segmentsOn(portId).map((segment) => segment.networkTypeId)).filter((typeId) => typeId !== networkTypeId));
    infos.push({ code: 'group-other-type', severity: 'info', typeIds, portIds: otherMateIds });
  }
  if (sameMateIds.length > 0) warnings.push({ code: 'group-same-type', severity: 'warning', portIds: sameMateIds });

  const touching = segments.filter(
    (segment) =>
      segment.networkTypeId === networkTypeId &&
      (nodeKeyOf(segment.endpointA, portGroups) === startKey || nodeKeyOf(segment.endpointB, portGroups) === startKey),
  );
  if (touching.length > 0) {
    const touchingIds = new Set(touching.map((segment) => segment.id));
    const networks = computeNetworks({ segments, fittings, portGroups });
    const networkSegmentIds = new Set(
      networks.filter((network) => network.segmentIds.some((id) => touchingIds.has(id))).flatMap((network) => network.segmentIds),
    );
    const equipmentIds = new Set(input.stamps.filter((candidate) => candidate.category === 'equipment').map((candidate) => candidate.id));
    const stampIds = sortedUnique(
      segments
        .filter((segment) => networkSegmentIds.has(segment.id))
        .flatMap((segment) => [segment.endpointA, segment.endpointB])
        .flatMap((point) => (point.kind === 'port' ? [point.elementId] : [])),
    ).filter((id) => id !== startStampId && equipmentIds.has(id));
    if (stampIds.length > 0) infos.push({ code: 'second-equipment', severity: 'info', stampIds });
  }

  return [...errors, ...warnings, ...infos];
}
