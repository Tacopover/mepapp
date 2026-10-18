import { describe, expect, it } from 'vitest';
import type { Fitting, Segment } from './network.js';
import { networkOfStartPort, flowsOfNetwork, sizeNetwork, type SizeNetworkInput, type SizeNetworkResult } from './sizing-network.js';
import { computeNetworks } from './network.js';
import { convertFlow, toBaseFlow, type FlowUnitId } from './flow-units.js';
import { waterFlowFromPowerM3s } from './sizing-water.js';
import { SUGGESTED_AIR_SIZING, SUGGESTED_WATER_SIZING } from './sizing-settings.js';

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

describe('sizeNetwork - refusals', () => {
  const airType = (): SizeNetworkInput['networkType'] => ({
    id: 'supply-air',
    discipline: 'ventilation',
    flowUnit: 'dm³/s',
    sizingMethod: 'air',
  });

  const teeSegments = (networkTypeId = 'supply-air'): Segment[] => [
    seg('main', ahuOut, { kind: 'fitting', fittingId: 'f1' }, networkTypeId),
    seg('b1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't1', portId: 'in' }, networkTypeId),
    seg('b2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 't2', portId: 'in' }, networkTypeId),
  ];

  const teeInput = (overrides: Partial<SizeNetworkInput> = {}): SizeNetworkInput =>
    input({
      segments: teeSegments(),
      fittings: [fit('f1')],
      terminalCapacities: { t1: 40, t2: 60 },
      networkType: airType(),
      sizing: { ...SUGGESTED_AIR_SIZING },
      ...overrides,
    });

  const dataOf = (i: SizeNetworkInput) => ({
    segments: i.segments,
    fittings: i.fittings,
    portGroups: i.portGroups,
    terminalCapacities: i.terminalCapacities,
    startStampId: i.startStampId,
    startPortId: i.startPortId,
    networkType: i.networkType,
    sizing: i.sizing,
  });

  function expectRefusal(result: SizeNetworkResult, code: string): void {
    expect(result.status).toBe('refused');
    expect(result.problems).toEqual([{ code, severity: 'error' }]);
    expect(result.sizes).toEqual([]);
  }

  it('sizes the tree with the air type', () => {
    const result = sizeNetwork(teeInput());
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    expect(result.totalFlowM3s).toBeCloseTo(0.1, 10);
    expect(result.segmentCount).toBe(3);
  });

  it('refuses an empty stamp id or an empty port id', () => {
    expectRefusal(sizeNetwork(teeInput({ startStampId: '' })), 'no-start');
    expectRefusal(sizeNetwork(teeInput({ startPortId: '' })), 'no-start');
  });

  it('refuses a port with no segment', () => {
    expectRefusal(sizeNetwork(teeInput({ startPortId: 'nope' })), 'no-segment-at-port');
  });

  it('refuses a discipline that is not sized, with no fallback to another method', () => {
    for (const discipline of ['plumbing', 'fireProtection', 'electrical', 'other'] as const) {
      const air = teeInput({ networkType: { id: 'supply-air', discipline, flowUnit: 'dm³/s', sizingMethod: 'air' }, sizing: { ...SUGGESTED_AIR_SIZING } });
      expectRefusal(sizeNetwork(air), 'discipline-not-sized');
      const water = teeInput({ networkType: { id: 'supply-air', discipline, flowUnit: 'dm³/s', sizingMethod: 'water' }, sizing: { ...SUGGESTED_WATER_SIZING } });
      expectRefusal(sizeNetwork(water), 'discipline-not-sized');
    }
  });

  it('refuses a plumbing type with no sizing as discipline-not-sized', () => {
    const plumbing = teeInput({
      segments: teeSegments('sanitary-waste'),
      networkType: { id: 'sanitary-waste', discipline: 'plumbing', flowUnit: 'dm³/s' },
      sizing: undefined,
    });
    expectRefusal(sizeNetwork(plumbing), 'discipline-not-sized');
  });

  it('refuses a plumbing type with a method and limits as discipline-not-sized', () => {
    const plumbing = teeInput({
      networkType: { id: 'supply-air', discipline: 'plumbing', flowUnit: 'dm³/s', sizingMethod: 'air' },
    });
    expectRefusal(sizeNetwork(plumbing), 'discipline-not-sized');
  });

  it('refuses a method that does not fit the discipline', () => {
    const airOnHeating = teeInput({ networkType: { id: 'supply-air', discipline: 'heatingAndCooling', flowUnit: 'dm³/s', sizingMethod: 'air' } });
    expectRefusal(sizeNetwork(airOnHeating), 'method-discipline');
    const waterOnVentilation = teeInput({
      networkType: { id: 'supply-air', discipline: 'ventilation', flowUnit: 'dm³/s', sizingMethod: 'water' },
      sizing: { ...SUGGESTED_WATER_SIZING, deltaTK: 10 },
    });
    expectRefusal(sizeNetwork(waterOnVentilation), 'method-discipline');
  });

  it('refuses a type with no flow unit', () => {
    const noUnit = teeInput({ networkType: { id: 'supply-air', discipline: 'ventilation', sizingMethod: 'air' } });
    expectRefusal(sizeNetwork(noUnit), 'no-flow-unit');
  });

  it('refuses a ventilation type with no sizing method', () => {
    const noMethod = teeInput({ networkType: { id: 'supply-air', discipline: 'ventilation', flowUnit: 'dm³/s' } });
    expectRefusal(sizeNetwork(noMethod), 'no-method');
  });

  it('refuses a network with no saved limits', () => {
    expectRefusal(sizeNetwork(teeInput({ sizing: undefined })), 'no-sizing');
  });

  it('refuses limits that are saved for the other method', () => {
    const waterType: SizeNetworkInput['networkType'] = { id: 'heat-water', discipline: 'heatingAndCooling', flowUnit: 'm³/h', sizingMethod: 'water' };
    expectRefusal(sizeNetwork(teeInput({ networkType: waterType, sizing: { ...SUGGESTED_AIR_SIZING } })), 'no-sizing');
  });

  it('refuses an air type with a power unit', () => {
    const powerUnit = teeInput({ networkType: { id: 'supply-air', discipline: 'ventilation', flowUnit: 'kW', sizingMethod: 'air' } });
    expectRefusal(sizeNetwork(powerUnit), 'unit-kind');
  });

  it('refuses a water type with a power unit and no positive delta T', () => {
    const waterType = (sizing: SizeNetworkInput['sizing']): SizeNetworkInput =>
      teeInput({
        segments: teeSegments('heat-water'),
        terminalCapacities: { t1: 5, t2: 5 },
        capacityUnitOf: () => 'kW',
        networkType: { id: 'heat-water', discipline: 'heatingAndCooling', flowUnit: 'kW', sizingMethod: 'water' },
        sizing,
      });
    expectRefusal(sizeNetwork(waterType({ ...SUGGESTED_WATER_SIZING })), 'no-delta-t');
    expectRefusal(sizeNetwork(waterType({ ...SUGGESTED_WATER_SIZING, deltaTK: 0 })), 'no-delta-t');
    expectRefusal(sizeNetwork(waterType({ ...SUGGESTED_WATER_SIZING, deltaTK: NaN })), 'no-delta-t');
  });

  it('passes a water type with a power unit and a delta T', () => {
    const result = sizeNetwork(
      teeInput({
        segments: teeSegments('heat-water'),
        terminalCapacities: { t1: 5, t2: 5 },
        capacityUnitOf: () => 'kW',
        networkType: { id: 'heat-water', discipline: 'heatingAndCooling', flowUnit: 'kW', sizingMethod: 'water' },
        sizing: { ...SUGGESTED_WATER_SIZING, deltaTK: 10 },
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    expect(result.totalFlowM3s).toBeGreaterThan(0);
  });

  it('passes a water type with a volume unit and no delta T', () => {
    const result = sizeNetwork(
      teeInput({
        segments: teeSegments('heat-water'),
        capacityUnitOf: () => 'm³/h',
        networkType: { id: 'heat-water', discipline: 'heatingAndCooling', flowUnit: 'm³/h', sizingMethod: 'water' },
        sizing: { ...SUGGESTED_WATER_SIZING },
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
  });

  it('refuses a network with no capacity', () => {
    expectRefusal(sizeNetwork(teeInput({ terminalCapacities: { t1: 0, t2: 0 } })), 'no-flow');
  });

  it('refuses a network whose segments are all of another network type', () => {
    expectRefusal(sizeNetwork(teeInput({ segments: teeSegments('return-air') })), 'no-flow');
  });

  it('passes with a unit-unknown warning when one capacity has no unit', () => {
    const result = sizeNetwork(teeInput({ capacityUnitOf: (id) => (id === 't2' ? null : 'dm³/s') }));
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([
      { code: 'unit-unknown', severity: 'warning', ids: ['t2'] },
      { code: 'zero-flow', severity: 'warning', ids: ['b2'] },
    ]);
    expect(result.totalFlowM3s).toBeCloseTo(0.04, 10);
  });

  it('does not change its input', () => {
    const data = teeInput();
    const before = structuredClone(dataOf(data));
    sizeNetwork(data);
    expect(dataOf(data)).toEqual(before);
  });
});

describe('sizeNetwork - sizes and warnings', () => {
  const airType = (): SizeNetworkInput['networkType'] => ({
    id: 'supply-air',
    discipline: 'ventilation',
    flowUnit: 'dm³/s',
    sizingMethod: 'air',
  });

  const waterType = (): SizeNetworkInput['networkType'] => ({
    id: 'heating-water',
    discipline: 'heatingAndCooling',
    flowUnit: 'kW',
    sizingMethod: 'water',
  });

  const f1 = { kind: 'fitting', fittingId: 'f1' } as const;
  const f2 = { kind: 'fitting', fittingId: 'f2' } as const;
  const portOf = (elementId: string, portId = 'in'): Segment['endpointB'] => ({ kind: 'port', elementId, portId });

  const airTree = (): Segment[] => [
    seg('main', ahuOut, f1),
    seg('b1', f1, portOf('t1')),
    seg('b2', f1, portOf('t2')),
  ];

  const airInput = (overrides: Partial<SizeNetworkInput> = {}): SizeNetworkInput =>
    input({
      segments: airTree(),
      fittings: [fit('f1')],
      terminalCapacities: { t1: 40, t2: 60 },
      networkType: airType(),
      sizing: { ...SUGGESTED_AIR_SIZING },
      ...overrides,
    });

  const waterTree = (): Segment[] => [
    seg('main', ahuOut, f1, 'heating-water'),
    seg('b1', f1, portOf('t1'), 'heating-water'),
    seg('b2', f1, portOf('t2'), 'heating-water'),
    seg('b3', f1, portOf('t3'), 'heating-water'),
    seg('b4', f1, portOf('t4'), 'heating-water'),
  ];

  const waterInput = (overrides: Partial<SizeNetworkInput> = {}): SizeNetworkInput =>
    input({
      segments: waterTree(),
      fittings: [fit('f1')],
      terminalCapacities: { t1: 5, t2: 5, t3: 5, t4: 5 },
      capacityUnitOf: () => 'kW',
      networkType: waterType(),
      sizing: { ...SUGGESTED_WATER_SIZING, deltaTK: 10 },
      ...overrides,
    });

  const dataOf = (i: SizeNetworkInput) => ({
    segments: i.segments,
    fittings: i.fittings,
    portGroups: i.portGroups,
    terminalCapacities: i.terminalCapacities,
    startStampId: i.startStampId,
    startPortId: i.startPortId,
    networkType: i.networkType,
    sizing: i.sizing,
  });

  const pickOf = (result: SizeNetworkResult, id: string) => result.sizes.find((s) => s.segmentId === id);

  function expectWithin(actual: number | undefined, expected: number, tolerance = 0.03): void {
    expect(Math.abs((actual ?? NaN) - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance);
  }

  it('sizes the air tree with the suggested settings', () => {
    const result = sizeNetwork(airInput());
    expect(result.status).toBe('ok');
    expect(result.sizes).toHaveLength(3);
    expect(result.unsized).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.totalFlowM3s).toBeCloseTo(0.1, 10);

    const main = pickOf(result, 'main');
    expect(main?.diameterMm).toBe(200);
    expect(main?.shape).toBe('round');
    expectWithin(main?.pressureDropPaPerM, 0.7025);
    expect(main?.flowM3s).toBeCloseTo(0.1, 12);
    expect(pickOf(result, 'b1')?.flowM3s).toBeCloseTo(0.04, 12);
    expect(pickOf(result, 'b2')?.flowM3s).toBeCloseTo(0.06, 12);
    for (const id of ['b1', 'b2']) {
      expect(main?.diameterMm ?? 0).toBeGreaterThanOrEqual(pickOf(result, id)?.diameterMm ?? 0);
    }
  });

  it('sizes the water tree with the suggested settings', () => {
    const result = sizeNetwork(waterInput());
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    expect(result.unsized).toEqual([]);

    const main = pickOf(result, 'main');
    expect(main?.diameterMm).toBe(32);
    expect(main?.governedBy).toBe('pressure');
    expectWithin(main?.pressureDropPaPerM, 161);
    for (const id of ['b1', 'b2', 'b3', 'b4']) {
      const branch = pickOf(result, id);
      expect([20, 25]).toContain(branch?.diameterMm);
      expect(main?.diameterMm ?? 0).toBeGreaterThanOrEqual(branch?.diameterMm ?? 0);
    }
  });

  it('sizes the same flow with two limit sets of the same type', () => {
    const segments = [seg('s1', ahuOut, portOf('t1'))];
    const sizeWith = (sizing: SizeNetworkInput['sizing']) =>
      pickOf(sizeNetwork(input({ segments, terminalCapacities: { t1: 100 }, networkType: airType(), sizing })), 's1');

    const suggested = sizeWith({ ...SUGGESTED_AIR_SIZING });
    expect(suggested?.diameterMm).toBe(200);

    const velocity = sizeWith({ ...SUGGESTED_AIR_SIZING, maxVelocityMs: 3 });
    expect(velocity?.diameterMm).toBe(250);
    expect(velocity?.governedBy).toBe('velocity');

    const pressure = sizeWith({ ...SUGGESTED_AIR_SIZING, maxPressureDropPaPerM: 0.5 });
    expect(pressure?.diameterMm).toBe(250);
    expect(pressure?.governedBy).toBe('pressure');
    expectWithin(pressure?.pressureDropPaPerM, 0.24, 0.15);
  });

  it('sizes a water type with a volume unit and needs no delta T', () => {
    const result = sizeNetwork(
      waterInput({
        capacityUnitOf: () => 'm³/h',
        networkType: { id: 'heating-water', discipline: 'heatingAndCooling', flowUnit: 'm³/h', sizingMethod: 'water' },
        sizing: { ...SUGGESTED_WATER_SIZING },
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.sizes.length).toBeGreaterThan(0);
    expect(result.problems).toEqual([]);
  });

  it('warns zero-flow for a branch with no capacity and sizes the rest', () => {
    const result = sizeNetwork(airInput({ terminalCapacities: { t1: 40, t2: 0 } }));
    expect(result.status).toBe('ok');
    expect(result.unsized).toEqual([{ segmentId: 'b2', reason: 'zero-flow' }]);
    expect(result.sizes.map((s) => s.segmentId).sort()).toEqual(['b1', 'main']);
    expect(result.problems).toEqual([{ code: 'zero-flow', severity: 'warning', ids: ['b2'] }]);
  });

  it('marks the segments too large for every series size as too-large', () => {
    const result = sizeNetwork(airInput({ terminalCapacities: { t1: 1_000_000, t2: 40 } }));
    expect(result.status).toBe('ok');
    expect(result.unsized.filter((u) => u.reason === 'too-large').map((u) => u.segmentId).sort()).toEqual(['b1', 'main']);
    expect(result.sizes.map((s) => s.segmentId)).toEqual(['b2']);
    expect(result.problems).toEqual([{ code: 'too-large', severity: 'warning', ids: ['b1', 'main'] }]);
  });

  it('leaves the unresolved loop segments unsized with not-resolved, and does not throw', () => {
    const segments = [
      seg('l1', ahuOut, { kind: 'fitting', fittingId: 'f1' }),
      seg('l2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'fitting', fittingId: 'f2' }),
      seg('l3', { kind: 'fitting', fittingId: 'f2' }, { kind: 'fitting', fittingId: 'f1' }),
      seg('b1', { kind: 'fitting', fittingId: 'f1' }, portOf('t1')),
    ];
    const fittings = [fit('f1'), fit('f2')];
    const loopInput = input({ segments, fittings, terminalCapacities: { t1: 40 }, networkType: airType(), sizing: { ...SUGGESTED_AIR_SIZING } });
    const network = networkOf(segments, fittings, 'l1');
    const { flow } = flowsOfNetwork(loopInput, network);
    const nullIds = network.segmentIds.filter((id) => flow.segmentCapacity[id] === null || flow.segmentCapacity[id] === undefined).sort();
    expect(nullIds.length).toBeGreaterThan(0);

    const result = sizeNetwork(loopInput);
    expect(result.status).toBe('ok');
    expect(result.unsized.filter((u) => u.reason === 'not-resolved').map((u) => u.segmentId).sort()).toEqual(nullIds);
    expect(result.problems).toContainEqual({ code: 'not-resolved', severity: 'warning', ids: nullIds });
    expect(pickOf(result, 'b1')).toBeDefined();
  });

  it('lists unit-unknown first when another warning exists', () => {
    const segments = [...airTree(), seg('b3', f1, portOf('t3'))];
    const result = sizeNetwork(
      airInput({
        segments,
        terminalCapacities: { t1: 40, t2: 60, t3: 0 },
        capacityUnitOf: (id) => (id === 't2' ? null : 'dm³/s'),
      }),
    );
    expect(result.problems.map((p) => p.code)).toEqual(['unit-unknown', 'zero-flow']);
  });

  it('marks the segments of another network type as mixed-type and counts their terminals', () => {
    const f2Port = { kind: 'fitting', fittingId: 'f2' } as const;
    const segments = [
      seg('main', ahuOut, f1, 'supply-air'),
      seg('b1', f1, portOf('t1'), 'supply-air'),
      seg('r1', f1, f2Port, 'return-air'),
      seg('r2', f2Port, portOf('t3'), 'return-air'),
    ];
    const fittings = [fit('f1'), fit('f2')];
    expect(networkOf(segments, fittings, 'main').segmentIds).toEqual(expect.arrayContaining(['r1', 'r2']));

    const result = sizeNetwork(airInput({ segments, fittings, terminalCapacities: { t1: 40, t3: 30 } }));
    expect(result.status).toBe('ok');
    expect(result.unsized.filter((u) => u.reason === 'mixed-type').map((u) => u.segmentId).sort()).toEqual(['r1', 'r2']);
    expect(result.sizes.map((s) => s.segmentId).sort()).toEqual(['b1', 'main']);
    expect(result.problems).toEqual([{ code: 'mixed-type', severity: 'warning', ids: ['r1', 'r2'] }]);
    expect(pickOf(result, 'main')?.flowM3s).toBeCloseTo(0.07, 10);
  });

  it('warns start-two-ports when the start stamp has two ports on the network', () => {
    const segments = [
      seg('s1', ahuOut, portOf('t1'), 'heating-water'),
      seg('s2', portOf('ahu', 'in'), portOf('t2'), 'heating-water'),
    ];
    const result = sizeNetwork(
      input({
        segments,
        portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }],
        terminalCapacities: { t1: 5, t2: 5 },
        capacityUnitOf: () => 'kW',
        networkType: waterType(),
        sizing: { ...SUGGESTED_WATER_SIZING, deltaTK: 10 },
      }),
    );
    const joined = computeNetworks({ segments, fittings: [], portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] });
    expect(joined.find((n) => n.segmentIds.includes('s1'))?.segmentIds).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([{ code: 'start-two-ports', severity: 'warning', ids: ['in', 'out'] }]);
  });

  it('does not warn start-two-ports for an air network with two ports on the start stamp', () => {
    const segments = [
      seg('s1', ahuOut, portOf('t1')),
      seg('s2', portOf('ahu', 'in'), portOf('t2')),
    ];
    const result = sizeNetwork(
      input({
        segments,
        portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }],
        terminalCapacities: { t1: 40, t2: 60 },
        networkType: airType(),
        sizing: { ...SUGGESTED_AIR_SIZING },
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.problems.map((p) => p.code)).not.toContain('start-two-ports');
  });

  it('never sizes a segment outside the network', () => {
    const segments = [...airTree(), seg('x', { kind: 'port', elementId: 'other', portId: 'out' }, portOf('t9'))];
    const result = sizeNetwork(airInput({ segments, terminalCapacities: { t1: 40, t2: 60, t9: 50 } }));
    expect(result.sizes.map((s) => s.segmentId)).not.toContain('x');
    expect(result.unsized.map((u) => u.segmentId)).not.toContain('x');
    expect(result.segmentCount).toBe(3);
  });

  it('gives the same sizes when the segments are in another order', () => {
    const base = sizeNetwork(airInput());
    const tree = airTree();
    const reversed = sizeNetwork(airInput({ segments: [...tree].reverse() }));
    const shuffled = sizeNetwork(airInput({ segments: [tree[1], tree[2], tree[0]] }));
    expect(reversed.sizes).toEqual(base.sizes);
    expect(shuffled.sizes).toEqual(base.sizes);
  });

  it('does not change its input', () => {
    const data = airInput({ terminalCapacities: { t1: 40, t2: 0 } });
    const before = structuredClone(dataOf(data));
    sizeNetwork(data);
    expect(dataOf(data)).toEqual(before);
  });

  it('lists an Infinity capacity as unit-unknown and never sizes a non-finite value', () => {
    const result = sizeNetwork(airInput({ terminalCapacities: { t1: 40, t2: Infinity } }));
    expect(result.status).toBe('ok');
    expect(result.problems).toContainEqual({ code: 'unit-unknown', severity: 'warning', ids: ['t2'] });
    expect(result.sizes.length).toBeGreaterThan(0);
    for (const s of result.sizes) {
      expect(Number.isFinite(s.pressureDropPaPerM)).toBe(true);
      expect(Number.isFinite(s.velocityMs)).toBe(true);
    }
  });
});
