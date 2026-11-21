import { describe, expect, it } from 'vitest';
import { computeNetworks, solveFlow, type Fitting, type RiserFlowInput, type Segment } from '@mepapp/core';
import { riserSolveOptionsFor } from './riserFlowInputs.js';

function segment(id: string, endpointA: Segment['endpointA'], endpointB: Segment['endpointB']): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId: 'supply-air',
    shape: 'round',
    diameter: 200,
    endpointA,
    endpointB,
    geometry: [],
  };
}

function fitting(id: string): Fitting {
  return { id, pageIndex: 0, position: { x: 0, y: 0 }, kind: 'tee' };
}

describe('riserSolveOptionsFor', () => {
  const segments = [
    segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
    segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x1' }),
    segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x2' }),
  ];
  const fittings = [fitting('e'), fitting('tee'), fitting('x1'), fitting('x2')];
  const [network] = computeNetworks({ segments, fittings, portGroups: [] });

  it('returns null when the inputs are empty', () => {
    expect(riserSolveOptionsFor(network, new Map())).toBeNull();
  });

  it('returns null when the input fitting is in another network', () => {
    const [other] = computeNetworks({
      segments: [segment('s9', { kind: 'port', elementId: 'a', portId: 'p1' }, { kind: 'port', elementId: 'b', portId: 'p1' })],
      fittings: [],
      portGroups: [],
    });
    const inputs = new Map<string, RiserFlowInput>([['e', { role: 'entry', demandBeyond: 150 }]]);
    expect(riserSolveOptionsFor(other, inputs)).toBeNull();
  });

  it('maps the entry and the exits, with the entry as entryFittingId', () => {
    const inputs = new Map<string, RiserFlowInput>([
      ['e', { role: 'entry', demandBeyond: 150 }],
      ['x1', { role: 'exit', demandBeyond: 200 }],
      ['x2', { role: 'exit', demandBeyond: 300 }],
    ]);
    const result = riserSolveOptionsFor(network, inputs);
    expect(result?.riserFittingIds).toEqual(new Set(['e', 'x1', 'x2']));
    expect(result?.entryFittingId).toBe('e');
    expect(result?.riserDemand).toEqual({ e: 150, x1: 200, x2: 300 });
  });

  it('omits entryFittingId when there is no entry', () => {
    const inputs = new Map<string, RiserFlowInput>([
      ['x1', { role: 'exit', demandBeyond: 200 }],
      ['x2', { role: 'exit', demandBeyond: 300 }],
    ]);
    const result = riserSolveOptionsFor(network, inputs);
    expect('entryFittingId' in (result ?? {})).toBe(false);
    expect(result?.riserDemand).toEqual({ x1: 200, x2: 300 });
  });

  it('does not treat a fitting of the network without an input as a boundary', () => {
    const inputs = new Map<string, RiserFlowInput>([['x1', { role: 'exit', demandBeyond: 200 }]]);
    const result = riserSolveOptionsFor(network, inputs);
    expect(result?.riserFittingIds).toEqual(new Set(['x1']));
    expect(result?.riserFittingIds.has('tee')).toBe(false);
  });

  it('solves the worked example, level 1 with the source on level 0', () => {
    const levelSegments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't300', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't200', portId: 'p1' }),
    ];
    const levelFittings = [fitting('e'), fitting('tee')];
    const [levelNetwork] = computeNetworks({ segments: levelSegments, fittings: levelFittings, portGroups: [] });
    const inputs = new Map<string, RiserFlowInput>([['e', { role: 'entry', demandBeyond: 150 }]]);
    const options = riserSolveOptionsFor(levelNetwork, inputs);

    const result = solveFlow({
      network: levelNetwork,
      segments: levelSegments,
      fittings: levelFittings,
      portGroups: [],
      terminalCapacities: { t300: 300, t200: 200 },
      ...options,
    });
    expect(result.fittingCapacity.e).toBe(650);
    expect(result.totalCapacity).toBe(650);
    expect(result.segmentCapacity.s2).toBe(300);
    expect(result.segmentCapacity.s3).toBe(200);
    expect(result.segmentCapacity.s1).toBe(500);
    expect(result.riserCapacity).toBe(150);
  });

  it('solves the worked example, source level with an exit riser', () => {
    const levelSegments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x' }),
    ];
    const levelFittings = [fitting('tee'), fitting('x')];
    const [levelNetwork] = computeNetworks({ segments: levelSegments, fittings: levelFittings, portGroups: [] });
    const inputs = new Map<string, RiserFlowInput>([['x', { role: 'exit', demandBeyond: 650 }]]);
    const options = riserSolveOptionsFor(levelNetwork, inputs);

    const result = solveFlow({
      network: levelNetwork,
      segments: levelSegments,
      fittings: levelFittings,
      portGroups: [],
      terminalCapacities: { d1: 100 },
      elementCategories: { ahu: 'equipment' },
      ...options,
    });
    expect(result.totalCapacity).toBe(750);
    expect(result.segmentCapacity.s3).toBe(650);
    expect(result.fittingCapacity.x).toBe(650);
    expect(result.riserCapacity).toBe(650);
  });

  it('solves exactly as without riser fields when the inputs are empty', () => {
    const levelSegments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't300', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't200', portId: 'p1' }),
    ];
    const levelFittings = [fitting('e'), fitting('tee')];
    const [levelNetwork] = computeNetworks({ segments: levelSegments, fittings: levelFittings, portGroups: [] });
    const options = riserSolveOptionsFor(levelNetwork, new Map());

    const withOptions = solveFlow({
      network: levelNetwork,
      segments: levelSegments,
      fittings: levelFittings,
      portGroups: [],
      terminalCapacities: { t300: 300, t200: 200 },
      ...options,
    });
    const withoutOptions = solveFlow({
      network: levelNetwork,
      segments: levelSegments,
      fittings: levelFittings,
      portGroups: [],
      terminalCapacities: { t300: 300, t200: 200 },
    });
    expect(withOptions).toEqual(withoutOptions);
    expect('riserCapacity' in withOptions).toBe(false);
  });
});
