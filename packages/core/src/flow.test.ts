import { describe, expect, it } from 'vitest';
import { computeNetworks, type Fitting, type Segment } from './network.js';
import { solveFlow } from './flow.js';

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

describe('solveFlow — capacity accumulation (not physics)', () => {
  it('passes a single terminal capacity straight through to the trunk segment', () => {
    const segments = [
      segment('trunk', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const [network] = computeNetworks({ segments, fittings: [], portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings: [],
      portGroups: [],
      terminalCapacities: { diffuser: 150 },
    });

    expect(result.resolved).toBe(true);
    expect(result.segmentCapacity.trunk).toBe(150);
    expect(result.totalCapacity).toBe(150);
    // Root is the ahu end (the diffuser is the only capacity source, so it's never
    // picked as root) — trunk's endpointB is the ahu, so flow runs A (diffuser) to B (ahu).
    expect(result.segmentDirection.trunk).toBe('AtoB');
  });

  it('sums capacities from two branches at a tee, additive with no loss', () => {
    const segments = [
      segment('branchA', { kind: 'port', elementId: 'diffuserA', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('branchB', { kind: 'port', elementId: 'diffuserB', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('trunk', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const [network] = computeNetworks({ segments, fittings: [fitting('tee')], portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings: [fitting('tee')],
      portGroups: [],
      terminalCapacities: { diffuserA: 100, diffuserB: 75 },
    });

    expect(result.segmentCapacity.branchA).toBe(100);
    expect(result.segmentCapacity.branchB).toBe(75);
    expect(result.segmentCapacity.trunk).toBe(175);
    expect(result.fittingCapacity.tee).toBe(175);
    // Not 100 + 75 + 175: summing every segment's own value would over-count, since trunk's
    // 175 already includes both branches — the network's real total is the root's own demand.
    expect(result.totalCapacity).toBe(175);
  });

  it('flips segmentDirection when an explicit rootElementId puts the root on the other physical endpoint', () => {
    const segments = [
      segment('trunk', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const [network] = computeNetworks({ segments, fittings: [], portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings: [],
      portGroups: [],
      terminalCapacities: { diffuser: 150 },
      rootElementId: 'diffuser',
    });

    // Root forced to endpointA (diffuser) this time, so the direction flips relative
    // to the default-root test above, which resolves endpointB (ahu) as root.
    expect(result.segmentDirection.trunk).toBe('BtoA');
  });

  it('leaves a cycle-closing segment unresolved rather than guessing a split', () => {
    // A loop of three fittings — no source, no capacity input, out of scope for this solver
    // (matching NetworkFlowProcessor.cs:319-324, which also declines to solve loops).
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'f1' }, { kind: 'fitting', fittingId: 'f2' }),
      segment('s2', { kind: 'fitting', fittingId: 'f2' }, { kind: 'fitting', fittingId: 'f3' }),
      segment('s3', { kind: 'fitting', fittingId: 'f3' }, { kind: 'fitting', fittingId: 'f1' }),
    ];
    const fittings = [fitting('f1'), fitting('f2'), fitting('f3')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });

    const result = solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities: {} });

    const capacities = Object.values(result.segmentCapacity);
    expect(capacities.filter((c) => c === null)).toHaveLength(1);
    expect(capacities.filter((c) => c !== null)).toHaveLength(2);
  });
});
