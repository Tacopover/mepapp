import type { Fitting, Network, NetworkGraphInput, NetworkType, PortGroup, Segment } from './network.js';
import { computeNetworks } from './network.js';
import { solveFlow, type FlowResult } from './flow.js';
import type { StampCategory } from './stamp-library.js';
import { toBaseFlow, flowUnitOf, type FlowUnitId } from './flow-units.js';
import { sizeWaterSegment, waterFlowFromPowerM3s } from './sizing-water.js';
import { sizeAirSegment, type SizePick } from './sizing-air.js';

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

const refused = (problem: SizingProblem, segmentCount = 0): SizeNetworkResult => ({
  status: 'refused',
  problems: [problem],
  sizes: [],
  unsized: [],
  totalFlowM3s: null,
  segmentCount,
});

/** Sizes the network of the start port. A refusal returns the first failing check only. */
export function sizeNetwork(input: SizeNetworkInput): SizeNetworkResult {
  if (input.startStampId === '' || input.startPortId === '') return refused({ code: 'no-start', severity: 'error' });
  const network = networkOfStartPort(
    { segments: input.segments, fittings: input.fittings, portGroups: input.portGroups },
    input.startStampId,
    input.startPortId,
  );
  if (!network) return refused({ code: 'no-segment-at-port', severity: 'error' });
  const segmentCount = network.segmentIds.length;
  const fail = (code: SizingProblemCode): SizeNetworkResult => refused({ code, severity: 'error' }, segmentCount);

  const type = input.networkType;
  if (type.discipline !== 'ventilation' && type.discipline !== 'heatingAndCooling') return fail('discipline-not-sized');
  const sizing = type.sizing;
  if (!sizing) return fail('no-sizing');
  if (
    (sizing.method === 'air' && type.discipline === 'heatingAndCooling') ||
    (sizing.method === 'water' && type.discipline === 'ventilation')
  ) {
    return fail('method-discipline');
  }
  if (!type.flowUnit) return fail('no-flow-unit');
  const unitKind = flowUnitOf(type.flowUnit).kind;
  if (sizing.method === 'air' && unitKind === 'power') return fail('unit-kind');
  const deltaTK = sizing.method === 'water' ? sizing.deltaTK : undefined;
  const hasDeltaT = typeof deltaTK === 'number' && Number.isFinite(deltaTK) && deltaTK > 0;
  if (sizing.method === 'water' && unitKind === 'power' && !hasDeltaT) return fail('no-delta-t');

  const { flow, unknownUnit } = flowsOfNetwork(input, network, deltaTK);
  const segmentById = new Map(input.segments.map((s) => [s.id, s]));
  const carryingCount = network.segmentIds.filter((id) => {
    const capacity = flow.segmentCapacity[id];
    return segmentById.get(id)?.networkTypeId === type.id && typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0;
  }).length;
  if (carryingCount === 0) return fail('no-flow');

  const sizes: SizedSegment[] = [];
  const unsized: SizeNetworkResult['unsized'] = [];
  for (const id of [...network.segmentIds].sort()) {
    const segment = segmentById.get(id);
    if (!segment) continue;
    if (segment.networkTypeId !== type.id) {
      unsized.push({ segmentId: id, reason: 'mixed-type' });
      continue;
    }
    const q = flow.segmentCapacity[id];
    if (q === null || q === undefined || !Number.isFinite(q)) {
      unsized.push({ segmentId: id, reason: 'not-resolved' });
      continue;
    }
    if (q <= 0) {
      unsized.push({ segmentId: id, reason: 'zero-flow' });
      continue;
    }
    const pick = sizing.method === 'air' ? sizeAirSegment(q, sizing) : sizeWaterSegment(q, sizing);
    if (pick === null) {
      unsized.push({ segmentId: id, reason: 'too-large' });
      continue;
    }
    sizes.push({ ...pick, segmentId: id, flowM3s: q });
  }

  const problems: SizingProblem[] = [];
  if (unknownUnit.length > 0) problems.push({ code: 'unit-unknown', severity: 'warning', ids: unknownUnit });
  const idsWithReason = (reason: SizeNetworkResult['unsized'][number]['reason']): string[] =>
    unsized.filter((u) => u.reason === reason).map((u) => u.segmentId).sort();
  for (const [code, reason] of [
    ['mixed-type', 'mixed-type'],
    ['not-resolved', 'not-resolved'],
    ['zero-flow', 'zero-flow'],
    ['too-large', 'too-large'],
  ] as const) {
    const ids = idsWithReason(reason);
    if (ids.length > 0) problems.push({ code, severity: 'warning', ids });
  }
  if (sizing.method === 'water') {
    const startPortIds = new Set<string>();
    for (const id of network.segmentIds) {
      const segment = segmentById.get(id);
      if (!segment) continue;
      for (const point of [segment.endpointA, segment.endpointB]) {
        if (point.kind === 'port' && point.elementId === input.startStampId) startPortIds.add(point.portId);
      }
    }
    if (startPortIds.size >= 2) problems.push({ code: 'start-two-ports', severity: 'warning', ids: [...startPortIds].sort() });
  }

  return {
    status: 'ok',
    problems,
    sizes,
    unsized,
    totalFlowM3s: flow.totalCapacity,
    segmentCount,
  };
}
