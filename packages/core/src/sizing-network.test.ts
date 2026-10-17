import { describe, expect, it } from 'vitest';
import type { Fitting, Segment } from './network.js';
import { networkOfStartPort, flowsOfNetwork, type SizeNetworkInput } from './sizing-network.js';
import { computeNetworks } from './network.js';
import { convertFlow, toBaseFlow, type FlowUnitId } from './flow-units.js';
import { waterFlowFromPowerM3s } from './sizing-water.js';

function seg(id: string, a: Segment['endpointA'], b: Segment['endpointB'], networkTypeId = 'supply-air'): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId,
    shape: 'round',
    diameter: 200,
    endpointA: a,
    endpointB: b,
    geometry: [],
  };
}

function fit(id: string): Fitting {
  return { id, pageIndex: 0, position: { x: 0, y: 0 }, kind: 'tee' };
}

function input(overrides: Partial<SizeNetworkInput>): SizeNetworkInput {
  return {
    segments: [],
    fittings: [],
    portGroups: [],
    terminalCapacities: {},
    capacityUnitOf: () => 'dm³/s',
    startStampId: 'ahu',
    startPortId: 'out',
    networkType: { id: 'supply-air', discipline: 'ventilation', flowUnit: 'dm³/s' },
    ...overrides,
  };
}

function networkOf(segments: Segment[], fittings: Fitting[], segmentId: string) {
  const network = computeNetworks({ segments, fittings, portGroups: [] }).find((n) => n.segmentIds.includes(segmentId));
  if (!network) throw new Error(`no network holds ${segmentId}`);
  return network;
}

const ahuOut = { kind: 'port', elementId: 'ahu', portId: 'out' } as const;

describe('networkOfStartPort', () => {
  const segments = [seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' })];
  const fittings = [fit('f1')];

  it('returns the network that holds the segment at the start port', () => {
    const network = networkOfStartPort({ segments: [...segments, seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' })], fittings, portGroups: [] }, 'ahu', 'out');
    expect(network?.segmentIds).toContain('main');
  });

  it('returns null for a port id or a stamp id with no segment', () => {
    const graph = { segments, fittings, portGroups: [] };
    expect(networkOfStartPort(graph, 'ahu', 'nope')).toBeNull();
    expect(networkOfStartPort(graph, 'nobody', 'out')).toBeNull();
  });

  it('does not return the network of another stamp that has a port with the same name', () => {
    const graph = {
      segments: [
        ...segments,
        seg('x', { kind: 'port', elementId: 'other', portId: 'out' }, { kind: 'port', elementId: 't9', portId: 'in' }),
      ],
      fittings,
      portGroups: [],
    };
    expect(networkOfStartPort(graph, 'ahu', 'out')?.segmentIds).not.toContain('x');
    expect(networkOfStartPort(graph, 'other', 'out')?.segmentIds).toEqual(['x']);
  });
});

describe('flowsOfNetwork', () => {
  it('splits a tree at a tee into the subtree sums', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const result = flowsOfNetwork(input({ segments, fittings, terminalCapacities: { t1: 40, t2: 60 } }), network);

    expect(result.flow.segmentCapacity.main).toBeCloseTo(0.1, 12);
    expect(result.flow.segmentCapacity.b1).toBeCloseTo(0.04, 12);
    expect(result.flow.segmentCapacity.b2).toBeCloseTo(0.06, 12);
    expect(result.unknownUnit).toEqual([]);
  });

  it('sizes two segments that both start at the root port', () => {
    const segments = [
      seg('s1', ahuOut, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('s2', ahuOut, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const network = networkOf(segments, [], 's1');
    const result = flowsOfNetwork(input({ segments, terminalCapacities: { t1: 40, t2: 60 } }), network);

    expect(result.flow.segmentCapacity.s1).toBeCloseTo(0.04, 12);
    expect(result.flow.segmentCapacity.s2).toBeCloseTo(0.06, 12);
  });

  it('does not take a second equipment as the root', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('e2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 'ahu2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const result = flowsOfNetwork(
      input({
        segments,
        fittings,
        terminalCapacities: { t1: 40 },
        elementCategories: { ahu: 'equipment', ahu2: 'equipment', t1: 'terminal' },
      }),
      network,
    );

    expect(result.flow.segmentCapacity.main).toBeCloseTo(0.04, 12);
    expect(result.flow.segmentCapacity.b1).toBeCloseTo(0.04, 12);
    expect(result.flow.segmentCapacity.e2).toBeCloseTo(0, 12);
  });

  it('matches stamp ids exactly, not by prefix', () => {
    const start = { kind: 'port', elementId: 'stamp-1', portId: 'out' } as const;
    const segments = [
      seg('main', start, { kind: 'fitting', fittingId: 'f1' }),
      seg('a', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 'stamp-12', portId: 'in' }),
      seg('b', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 'stamp-3', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const result = flowsOfNetwork(
      input({
        segments,
        fittings,
        startStampId: 'stamp-1',
        startPortId: 'out',
        terminalCapacities: { 'stamp-12': 50, 'stamp-3': 30 },
      }),
      network,
    );

    expect(result.flow.segmentCapacity.main).toBeCloseTo(0.08, 12);
    expect(result.flow.segmentCapacity.a).toBeCloseTo(0.05, 12);
    expect(result.flow.segmentCapacity.b).toBeCloseTo(0.03, 12);
  });

  it('converts each capacity to m3/s before the sum when the units differ', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const unitOf = (id: string): FlowUnitId => (id === 't1' ? 'cfm' : 'dm³/s');
    const mixed = flowsOfNetwork(
      input({ segments, fittings, terminalCapacities: { t1: 100, t2: 50 }, capacityUnitOf: unitOf }),
      network,
    );
    expect(mixed.flow.segmentCapacity.main).toBeCloseTo(toBaseFlow(100, 'cfm') + 0.05, 12);

    const t1Dm3s = convertFlow(100, 'cfm', 'dm³/s');
    expect(t1Dm3s).not.toBeNull();
    const same = flowsOfNetwork(
      input({ segments, fittings, terminalCapacities: { t1: t1Dm3s as number, t2: 50 } }),
      network,
    );
    expect(mixed.flow.segmentCapacity.main).toBeCloseTo(same.flow.segmentCapacity.main as number, 10);
  });

  it('lists a capacity with no unit, and leaves it out of the sum', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const unitOf = (id: string): FlowUnitId | null => (id === 't2' ? null : 'dm³/s');
    const result = flowsOfNetwork(
      input({ segments, fittings, terminalCapacities: { t1: 40, t2: 60 }, capacityUnitOf: unitOf }),
      network,
    );

    expect(result.unknownUnit).toEqual(['t2']);
    expect(result.flow.segmentCapacity.main).toBeCloseTo(0.04, 12);
  });

  it('does not list a zero capacity with no unit, and lists a NaN capacity', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const unitOf = (id: string): FlowUnitId | null => (id === 't2' ? null : 'dm³/s');

    const zero = flowsOfNetwork(
      input({ segments, fittings, terminalCapacities: { t1: 40, t2: 0 }, capacityUnitOf: unitOf }),
      network,
    );
    expect(zero.unknownUnit).toEqual([]);

    const nan = flowsOfNetwork(
      input({ segments, fittings, terminalCapacities: { t1: 40, t2: NaN } }),
      network,
    );
    expect(nan.unknownUnit).toEqual(['t2']);
  });

  it('ignores a capacity of an element that is not in the network', () => {
    const segments = [seg('s1', ahuOut, { kind: 'port', elementId: 't1', portId: 'in' })];
    const network = networkOf(segments, [], 's1');
    const result = flowsOfNetwork(
      input({
        segments,
        terminalCapacities: { t1: 40, other: 99 },
        capacityUnitOf: (id) => (id === 'other' ? null : 'dm³/s'),
      }),
      network,
    );

    expect(result.unknownUnit).toEqual([]);
    expect(result.flow.segmentCapacity.s1).toBeCloseTo(0.04, 12);
  });

  it('leaves a power unit out when there is no water delta T', () => {
    const segments = [
      seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
      seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }),
    ];
    const fittings = [fit('f1')];
    const network = networkOf(segments, fittings, 'main');
    const base = { segments, fittings, terminalCapacities: { t1: 5, t2: 5 }, capacityUnitOf: () => 'kW' as FlowUnitId };

    const none = flowsOfNetwork(input(base), network);
    expect(none.flow.segmentCapacity.main).toBeCloseTo(0, 12);
    expect(none.unknownUnit).toEqual([]);

    const withDeltaT = flowsOfNetwork(input(base), network, 10);
    expect(withDeltaT.flow.segmentCapacity.main).toBeCloseTo(waterFlowFromPowerM3s(10000, 10), 12);

    expect(flowsOfNetwork(input(base), network, 0).flow.segmentCapacity.main).toBeCloseTo(0, 12);
    expect(flowsOfNetwork(input(base), network, NaN).flow.segmentCapacity.main).toBeCloseTo(0, 12);
  });

  it('does not throw on a loop and leaves one loop segment unresolved', () => {
    const segments = [
      seg('l1', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('l2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'fitting', fittingId: 'f2' }),
      seg('l3', { kind: 'fitting', fittingId: 'f2' }, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }),
    ];
    const fittings = [fit('f1'), fit('f2')];
    const network = networkOf(segments, fittings, 'l1');

    const result = flowsOfNetwork(input({ segments, fittings, terminalCapacities: { t1: 40 } }), network);
    expect(result.flow.segmentCapacity.l2 === null || result.flow.segmentCapacity.l3 === null).toBe(true);
  });
});
