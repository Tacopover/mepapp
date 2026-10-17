import type { Fitting, Network, NetworkGraphInput, NetworkType, PortGroup, Segment } from './network.js';
import { computeNetworks } from './network.js';
import { solveFlow, type FlowResult } from './flow.js';
import type { StampCategory } from './stamp-library.js';
import { toBaseFlow, flowUnitOf, type FlowUnitId } from './flow-units.js';
import { waterFlowFromPowerM3s } from './sizing-water.js';
import type { SizePick } from './sizing-air.js';

export type SizingProblemCode =
  | 'no-start' | 'no-segment-at-port' | 'discipline-not-sized' | 'method-discipline' | 'no-flow-unit' | 'no-sizing'
  | 'unit-kind' | 'no-delta-t' | 'no-flow'
  | 'unit-unknown' | 'not-resolved' | 'zero-flow' | 'too-large' | 'mixed-type' | 'start-two-ports';
export interface SizingProblem {
  code: SizingProblemCode;
  severity: 'error' | 'warning' | 'info';
  /** Segment ids (too-large, zero-flow, not-resolved, mixed-type) or element ids (unit-unknown) or port ids (start-two-ports). */
  ids?: string[];
}
export interface SizedSegment extends SizePick { segmentId: string; flowM3s: number }
export interface SizeNetworkInput {
  segments: Segment[]; fittings: Fitting[]; portGroups: PortGroup[];
  terminalCapacities: Record<string, number>;
  /** The unit of the capacity of one element, or null when it has none. */
  capacityUnitOf: (elementId: string) => FlowUnitId | null;
  elementCategories?: Record<string, StampCategory>;
  startStampId: string; startPortId: string;
  networkType: Pick<NetworkType, 'id' | 'discipline' | 'flowUnit' | 'sizing'>;
}
export interface SizeNetworkResult {
  /** 'refused' when an error problem exists. Then `sizes` is empty. */
  status: 'ok' | 'refused';
  problems: SizingProblem[];
  sizes: SizedSegment[];
  /** Segments of the network that get no size, with the reason. They keep their old size. */
  unsized: { segmentId: string; reason: 'zero-flow' | 'not-resolved' | 'too-large' | 'mixed-type' }[];
  /** The whole network, in m3/s, or null when it is not resolved. */
  totalFlowM3s: number | null;
  segmentCount: number;
}

/** The network that holds a segment with an endpoint on exactly this stamp id and port id, or null. A port group is not followed. */
export function networkOfStartPort(graph: NetworkGraphInput, startStampId: string, startPortId: string): Network | null {
  const isStartPort = (point: Segment['endpointA']): boolean =>
    point.kind === 'port' && point.elementId === startStampId && point.portId === startPortId;
  const segment = graph.segments.find((s) => isStartPort(s.endpointA) || isStartPort(s.endpointB));
  if (!segment) return null;
  return computeNetworks(graph).find((network) => network.segmentIds.includes(segment.id)) ?? null;
}

export interface NetworkFlows { flow: FlowResult; unknownUnit: string[] }
/**
 * Flows of one network in m3/s. `deltaTK` is the water delta T in K; when it is absent or not a finite number above 0, a power unit (kind 'power') is NOT converted: that capacity is left out (the caller reports the problem).
 */
export function flowsOfNetwork(input: SizeNetworkInput, network: Network, deltaTK?: number): NetworkFlows {
  const segmentById = new Map(input.segments.map((s) => [s.id, s]));
  const elementIds = new Set<string>();
  for (const segmentId of network.segmentIds) {
    const segment = segmentById.get(segmentId);
    if (!segment) continue;
    for (const point of [segment.endpointA, segment.endpointB]) {
      if (point.kind === 'port') elementIds.add(point.elementId);
    }
  }

  const waterDeltaT = typeof deltaTK === 'number' && Number.isFinite(deltaTK) && deltaTK > 0 ? deltaTK : null;
  const siMap: Record<string, number> = {};
  const unknownUnit: string[] = [];
  for (const elementId of elementIds) {
    if (!(elementId in input.terminalCapacities)) continue;
    const value = input.terminalCapacities[elementId];
    if (!Number.isFinite(value)) {
      unknownUnit.push(elementId);
      continue;
    }
    const unit = input.capacityUnitOf(elementId);
    if (unit === null) {
      if (value !== 0) unknownUnit.push(elementId);
      continue;
    }
    const kind = flowUnitOf(unit).kind;
    if (kind === 'volume') {
      siMap[elementId] = toBaseFlow(value, unit);
    } else if (waterDeltaT !== null) {
      siMap[elementId] = waterFlowFromPowerM3s(toBaseFlow(value, unit), waterDeltaT);
    }
  }

  const flow = solveFlow({
    network,
    segments: input.segments,
    fittings: input.fittings,
    portGroups: input.portGroups,
    terminalCapacities: siMap,
    rootElementId: input.startStampId,
    rootPortId: input.startPortId,
    elementCategories: input.elementCategories,
  });
  return { flow, unknownUnit: unknownUnit.sort() };
}
