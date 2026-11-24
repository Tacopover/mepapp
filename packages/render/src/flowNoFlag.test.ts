import { describe, expect, it } from 'vitest';
import { computeNetworks, solveFlow, type Fitting, type Segment } from '@mepapp/core';

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

describe('solveFlow without the highest rule fields', () => {
  it('gives the same result for a network with an equipment, with the new fields set to off', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 't' }),
      segment('s2', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'eq', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'term', portId: 'p1' }),
    ];
    const fittings = [fitting('a'), fitting('t')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const elementCategories = { eq: 'equipment' as const, term: 'terminal' as const };
    const terminalCapacities = { term: 100 };

    const before = solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities, elementCategories });
    const after = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities,
      elementCategories,
      highestWhenNoSource: true,
      notOpenEndIds: undefined,
    });

    expect(after).toEqual(before);
    expect('noSource' in after).toBe(false);
  });

  it('gives the highest value over every open end when the network has no source', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 't' }, { kind: 'fitting', fittingId: 'oa' }),
      segment('s2', { kind: 'fitting', fittingId: 't' }, { kind: 'fitting', fittingId: 'ob' }),
      segment('s3', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'term', portId: 'p1' }),
    ];
    const fittings = [fitting('t'), fitting('oa'), fitting('ob')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities: { term: 100 },
      elementCategories: { term: 'terminal' },
      highestWhenNoSource: true,
    });

    expect(result.segmentCapacity).toEqual({ s1: 100, s2: 100, s3: 100 });
    expect(Object.values(result.segmentDirection).every((direction) => direction === null)).toBe(true);
    expect(result.noSource).toBe('highest');
  });
});
