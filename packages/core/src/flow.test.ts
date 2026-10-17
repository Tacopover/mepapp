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

  it('records fittingCapacity for a bare fitting that resolves as the root itself, not just as someone else\'s child', () => {
    // A terminal wired straight to an open trunk end (a bare junction) — the fitting is
    // degree-1 with no capacity of its own, so it's picked as root (see solveFlow's root
    // heuristic), meaning it's never visited as anyone's "child" edge.
    const segments = [segment('trunk', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'end' })];
    const [network] = computeNetworks({ segments, fittings: [fitting('end')], portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings: [fitting('end')],
      portGroups: [],
      terminalCapacities: { diffuser: 50 },
    });

    expect(result.totalCapacity).toBe(50);
    expect(result.fittingCapacity.end).toBe(50);
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

  it('roots at the equipment, not at a loose duct end whose key sorts first', () => {
    const segments = [
      segment('trunk', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
      segment('branchA', { kind: 'port', elementId: 'diffuserA', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('branchB', { kind: 'port', elementId: 'diffuserB', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('stub', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'end' }),
    ];
    const fittings = [fitting('tee'), fitting('end')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities: { diffuserA: 100, diffuserB: 75 },
      elementCategories: { ahu: 'equipment', diffuserA: 'terminal', diffuserB: 'terminal' },
    });

    expect(result.segmentCapacity.trunk).toBe(175);
    expect(result.segmentCapacity.stub).toBe(0);
    expect(result.fittingCapacity.end).toBe(0);
    expect(result.totalCapacity).toBe(175);
  });

  it('roots at an equipment with two connections when every open end is a terminal', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'diffuserA', portId: 'p1' }, { kind: 'port', elementId: 'fcu', portId: 'in' }),
      segment('b', { kind: 'port', elementId: 'diffuserB', portId: 'p1' }, { kind: 'port', elementId: 'fcu', portId: 'out' }),
    ];
    const portGroups = [{ elementId: 'fcu', portIds: ['in', 'out'] }];
    const [network] = computeNetworks({ segments, fittings: [], portGroups });

    const result = solveFlow({
      network,
      segments,
      fittings: [],
      portGroups,
      terminalCapacities: { diffuserA: 100, diffuserB: 75 },
      elementCategories: { fcu: 'equipment', diffuserA: 'terminal', diffuserB: 'terminal' },
    });

    expect(result.segmentCapacity.a).toBe(100);
    expect(result.segmentCapacity.b).toBe(75);
    expect(result.totalCapacity).toBe(175);
  });
});

describe('solveFlow — exact root element, root port and the fallback', () => {
  it('roots at stamp-1 and not at stamp-12, whose id starts with the same text', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'stamp-1', portId: 'p1' }, { kind: 'port', elementId: 'stamp-12', portId: 'p1' }),
    ];
    const [network] = computeNetworks({ segments, fittings: [], portGroups: [] });
    const terminalCapacities = { 'stamp-1': 10, 'stamp-12': 40 };

    const root1 = solveFlow({ network, segments, fittings: [], portGroups: [], terminalCapacities, rootElementId: 'stamp-1' });
    expect(root1.segmentCapacity.a).toBe(40);
    expect(root1.segmentDirection.a).toBe('BtoA');
    expect(root1.totalCapacity).toBe(50);

    const root12 = solveFlow({ network, segments, fittings: [], portGroups: [], terminalCapacities, rootElementId: 'stamp-12' });
    expect(root12.segmentCapacity.a).toBe(10);
    expect(root12.segmentDirection.a).toBe('AtoB');
    expect(root12.totalCapacity).toBe(50);
  });

  it('roots at fit-1 and not at fit-12, whose id starts with the same text', () => {
    const segments = [
      segment('a', { kind: 'fitting', fittingId: 'fit-1' }, { kind: 'fitting', fittingId: 'fit-12' }),
      segment('d1', { kind: 'port', elementId: 'diffuser1', portId: 'p1' }, { kind: 'fitting', fittingId: 'fit-1' }),
      segment('d2', { kind: 'port', elementId: 'diffuser2', portId: 'p1' }, { kind: 'fitting', fittingId: 'fit-12' }),
    ];
    const fittings = [fitting('fit-1'), fitting('fit-12')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const terminalCapacities = { diffuser1: 10, diffuser2: 40 };

    const root1 = solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities, rootElementId: 'fit-1' });
    expect(root1.segmentCapacity.a).toBe(40);
    expect(root1.segmentDirection.a).toBe('BtoA');
    expect(root1.totalCapacity).toBe(50);

    const root12 = solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities, rootElementId: 'fit-12' });
    expect(root12.segmentCapacity.a).toBe(10);
    expect(root12.segmentDirection.a).toBe('AtoB');
    expect(root12.totalCapacity).toBe(50);

    const lonely = [segment('d2', { kind: 'port', elementId: 'diffuser2', portId: 'p1' }, { kind: 'fitting', fittingId: 'fit-12' })];
    const lonelyFittings = [fitting('fit-12')];
    const [lonelyNetwork] = computeNetworks({ segments: lonely, fittings: lonelyFittings, portGroups: [] });
    const withAbsent = solveFlow({
      network: lonelyNetwork,
      segments: lonely,
      fittings: lonelyFittings,
      portGroups: [],
      terminalCapacities: { diffuser2: 40 },
      rootElementId: 'fit-1',
    });
    const withoutAbsent = solveFlow({
      network: lonelyNetwork,
      segments: lonely,
      fittings: lonelyFittings,
      portGroups: [],
      terminalCapacities: { diffuser2: 40 },
    });
    expect(withAbsent).toEqual(withoutAbsent);
  });

  it('roots at an air handling unit with a degree-2 start port, not at a loose duct end', () => {
    const segments = [
      segment('sA', { kind: 'port', elementId: 'ahu', portId: 'out' }, { kind: 'fitting', fittingId: 'j1' }),
      segment('sB', { kind: 'port', elementId: 'ahu', portId: 'out' }, { kind: 'fitting', fittingId: 'j2' }),
      segment('sC', { kind: 'fitting', fittingId: 'j1' }, { kind: 'port', elementId: 't1', portId: 'p1' }),
      segment('sD', { kind: 'fitting', fittingId: 'j2' }, { kind: 'port', elementId: 't2', portId: 'p1' }),
      segment('sE', { kind: 'fitting', fittingId: 'j1' }, { kind: 'fitting', fittingId: 'end1' }),
      segment('sG', { kind: 'fitting', fittingId: 'j2' }, { kind: 'fitting', fittingId: 'end2' }),
    ];
    const fittings = [fitting('j1'), fitting('j2'), fitting('end1'), fitting('end2')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const terminalCapacities = { t1: 30, t2: 20 };
    const elementCategories = { ahu: 'equipment' as const, t1: 'terminal' as const, t2: 'terminal' as const };

    const withRoot = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities,
      elementCategories,
      rootElementId: 'ahu',
    });
    expect(withRoot.totalCapacity).toBe(50);
    expect(withRoot.segmentCapacity.sA).toBe(30);
    expect(withRoot.segmentCapacity.sB).toBe(20);
    expect(withRoot.segmentDirection.sA).toBe('BtoA');
    expect(withRoot.segmentDirection.sB).toBe('BtoA');

    const withoutRoot = solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities, elementCategories });
    expect(withoutRoot.totalCapacity).toBe(50);
    expect(withoutRoot.segmentCapacity.sE).toBe(50);
    expect(withoutRoot.segmentDirection.sE).toBe('AtoB');
  });

  it('roots at the air handling unit and not at a second equipment stamp in the same network', () => {
    const segments = [
      segment('sA', { kind: 'port', elementId: 'ahu', portId: 'out' }, { kind: 'fitting', fittingId: 'j1' }),
      segment('sB', { kind: 'port', elementId: 'ahu', portId: 'out' }, { kind: 'fitting', fittingId: 'j2' }),
      segment('sC', { kind: 'fitting', fittingId: 'j1' }, { kind: 'port', elementId: 't1', portId: 'p1' }),
      segment('sD', { kind: 'fitting', fittingId: 'j2' }, { kind: 'port', elementId: 't2', portId: 'p1' }),
      segment('sE', { kind: 'fitting', fittingId: 'j1' }, { kind: 'fitting', fittingId: 'end1' }),
      segment('sF', { kind: 'fitting', fittingId: 'j2' }, { kind: 'port', elementId: 'fcu', portId: 'p1' }),
    ];
    const fittings = [fitting('j1'), fitting('j2'), fitting('end1')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const terminalCapacities = { t1: 30, t2: 20 };
    const elementCategories = { ahu: 'equipment' as const, fcu: 'equipment' as const, t1: 'terminal' as const, t2: 'terminal' as const };

    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities,
      elementCategories,
      rootElementId: 'ahu',
    });
    expect(result.totalCapacity).toBe(50);
    expect(result.segmentCapacity.sA).toBe(30);
    expect(result.segmentCapacity.sB).toBe(20);
    expect(result.segmentDirection.sF).toBe('BtoA');
  });

  it('roots at the port named by rootPortId: out, then in, of one stamp', () => {
    const segments = [
      segment('sIn', { kind: 'port', elementId: 'fcu', portId: 'in' }, { kind: 'fitting', fittingId: 'j' }),
      segment('sOut', { kind: 'port', elementId: 'fcu', portId: 'out' }, { kind: 'fitting', fittingId: 'j' }),
      segment('sT', { kind: 'fitting', fittingId: 'j' }, { kind: 'port', elementId: 't1', portId: 'p1' }),
    ];
    const fittings = [fitting('j')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const terminalCapacities = { t1: 30 };

    const rootOut = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities,
      rootElementId: 'fcu',
      rootPortId: 'out',
    });
    expect(rootOut.segmentCapacity.sOut).toBe(30);
    expect(rootOut.segmentCapacity.sIn).toBe(0);
    expect(rootOut.segmentDirection.sOut).toBe('BtoA');

    const rootIn = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities,
      rootElementId: 'fcu',
      rootPortId: 'in',
    });
    expect(rootIn.segmentCapacity.sIn).toBe(30);
    expect(rootIn.segmentCapacity.sOut).toBe(0);
    expect(rootIn.segmentDirection.sIn).toBe('BtoA');
  });

  it('roots at the port group node when rootPortId names a port in a group', () => {
    const segments = [
      segment('sA', { kind: 'port', elementId: 'ahu', portId: 'out' }, { kind: 'port', elementId: 't1', portId: 'p1' }),
      segment('sE', { kind: 'port', elementId: 'ahu', portId: 'in' }, { kind: 'fitting', fittingId: 'end1' }),
    ];
    const fittings = [fitting('end1')];
    const portGroups = [{ elementId: 'ahu', portIds: ['in', 'out'] }];
    const [network] = computeNetworks({ segments, fittings, portGroups });

    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups,
      terminalCapacities: { t1: 30 },
      rootElementId: 'ahu',
      rootPortId: 'out',
    });
    expect(result.totalCapacity).toBe(30);
    expect(result.segmentCapacity.sA).toBe(30);
    expect(result.segmentCapacity.sE).toBe(0);
    expect(result.segmentDirection.sE).toBe('BtoA');
  });

  it('roots at the first node in sorted order when rootPortId names a port that is not in the network', () => {
    const segments = [
      segment('sIn', { kind: 'port', elementId: 'fcu', portId: 'in' }, { kind: 'fitting', fittingId: 'j' }),
      segment('sMid', { kind: 'port', elementId: 'fcu', portId: 'mid' }, { kind: 'fitting', fittingId: 'j' }),
      segment('sT', { kind: 'fitting', fittingId: 'j' }, { kind: 'port', elementId: 't1', portId: 'p1' }),
      segment('sLoose', { kind: 'port', elementId: 'fcu', portId: 'in' }, { kind: 'fitting', fittingId: 'end' }),
    ];
    const fittings = [fitting('j'), fitting('end')];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });

    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities: { t1: 30 },
      rootElementId: 'fcu',
      rootPortId: 'out',
    });
    expect(result.segmentCapacity.sIn).toBe(30);
    expect(result.segmentCapacity.sMid).toBe(0);
    expect(result.segmentCapacity.sLoose).toBe(0);
  });

  it('gives the same result as no root when rootElementId is not in the network', () => {
    const segments = [
      segment('trunk', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const [network] = computeNetworks({ segments, fittings: [], portGroups: [] });
    const terminalCapacities = { diffuser: 150 };

    const withGhost = solveFlow({ network, segments, fittings: [], portGroups: [], terminalCapacities, rootElementId: 'ghost' });
    const withoutRoot = solveFlow({ network, segments, fittings: [], portGroups: [], terminalCapacities });
    expect(withGhost).toEqual(withoutRoot);
  });
});
