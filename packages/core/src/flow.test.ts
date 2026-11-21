import { describe, expect, it } from 'vitest';
import { computeNetworks, type Fitting, type Segment } from './network.js';
import { riserFittingFlow, solveFlow, type FlowSolveInput } from './flow.js';

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

function inputOf(
  segments: Segment[],
  fittings: Fitting[],
  terminalCapacities: Record<string, number>,
  extra: Partial<FlowSolveInput> = {},
): FlowSolveInput {
  const [network] = computeNetworks({ segments, fittings, portGroups: [] });
  return { network, segments, fittings, portGroups: [], terminalCapacities, ...extra };
}

describe('solveFlow — riser fittings as boundaries', () => {
  it('gives the same result with no marks, an empty set, or an unused id', () => {
    const teeSegments = [
      segment('branchA', { kind: 'port', elementId: 'diffuserA', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('branchB', { kind: 'port', elementId: 'diffuserB', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('trunk', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const cases: Array<[Segment[], Fitting[], Record<string, number>]> = [
      [[segment('trunk', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'port', elementId: 'ahu', portId: 'p1' })], [], { diffuser: 150 }],
      [teeSegments, [fitting('tee')], { diffuserA: 100, diffuserB: 75 }],
      [[segment('s', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'end' })], [fitting('end')], { diffuser: 50 }],
    ];
    for (const [segments, fittings, terminalCapacities] of cases) {
      const base = inputOf(segments, fittings, terminalCapacities);
      const plain = JSON.stringify(solveFlow(base));
      expect(JSON.stringify(solveFlow({ ...base, riserFittingIds: new Set() }))).toBe(plain);
      expect(JSON.stringify(solveFlow({ ...base, riserFittingIds: new Set(['unused']) }))).toBe(plain);
    }
  });

  it('never roots at a marked fitting, even when it is the first open end in sort order', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'r' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const fittings = [fitting('r'), fitting('tee')];
    const terminalCapacities = { diffuser: 100 };

    const unmarked = solveFlow(inputOf(segments, fittings, terminalCapacities));
    expect(unmarked.fittingCapacity.r).toBe(unmarked.totalCapacity);

    const marked = solveFlow(inputOf(segments, fittings, terminalCapacities, { riserFittingIds: new Set(['r']) }));
    expect(marked.resolved).toBe(true);
    expect(marked.totalCapacity).toBe(100);
    expect(marked.fittingCapacity.r).toBe(0);
  });

  it('does not continue past a marked fitting', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' }),
      segment('b', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const fittings = [fitting('m')];
    const terminalCapacities = { diffuser: 100 };

    const unmarked = solveFlow(inputOf(segments, fittings, terminalCapacities));
    expect(unmarked.segmentCapacity.b).toBe(100);

    const marked = solveFlow(inputOf(segments, fittings, terminalCapacities, { riserFittingIds: new Set(['m']) }));
    expect(marked.resolved).toBe(true);
    expect(marked.segmentCapacity.a).toBe(0);
    expect(marked.segmentCapacity.b).toBeNull();
  });

  it('ignores an explicit root that is a marked fitting', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'r' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const fittings = [fitting('r'), fitting('tee')];
    const terminalCapacities = { diffuser: 100 };

    const unmarked = solveFlow(inputOf(segments, fittings, terminalCapacities, { rootElementId: 'r' }));
    expect(unmarked.fittingCapacity.r).toBe(100);

    const marked = solveFlow(
      inputOf(segments, fittings, terminalCapacities, { rootElementId: 'r', riserFittingIds: new Set(['r']) }),
    );
    expect(marked.resolved).toBe(true);
    expect(marked.fittingCapacity.r).toBe(0);
  });

  it('is unresolved when every node is a marked fitting', () => {
    const segments = [segment('s', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 'b' })];
    const fittings = [fitting('a'), fitting('b')];

    const result = solveFlow(inputOf(segments, fittings, {}, { riserFittingIds: new Set(['a', 'b']) }));
    expect(result.resolved).toBe(false);
    expect(result.totalCapacity).toBeNull();
  });
});

describe('riserFittingFlow', () => {
  const trunkSegments = [
    segment('trunk', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    segment('branch', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' }),
  ];

  it('gives out when the level has an equipment and the solve reaches the marked fitting', () => {
    const input = inputOf([...trunkSegments], [fitting('m')], { diffuser: 100 }, {
      elementCategories: { ahu: 'equipment', diffuser: 'terminal' },
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'out' });
  });

  it('gives in when there is no source and the reached fitting has a demand above 0', () => {
    const segments = [segment('a', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' })];
    const input = inputOf(segments, [fitting('m')], { diffuser: 100 }, { riserFittingIds: new Set(['m']) });
    expect(riserFittingFlow(input)).toEqual({ m: 'in' });
  });

  it('gives none when there is no source and no demand', () => {
    const segments = [segment('a', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' })];
    const input = inputOf(segments, [fitting('m')], {}, { riserFittingIds: new Set(['m']) });
    expect(riserFittingFlow(input)).toEqual({ m: 'none' });
  });

  it('gives none for a marked fitting that the solve does not reach', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'm1' }),
      segment('s2', { kind: 'fitting', fittingId: 'm1' }, { kind: 'fitting', fittingId: 'm2' }),
      segment('s3', { kind: 'fitting', fittingId: 'm2' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const input = inputOf(segments, [fitting('m1'), fitting('m2')], { diffuser: 100 }, {
      elementCategories: { ahu: 'equipment', diffuser: 'terminal' },
      riserFittingIds: new Set(['m1', 'm2']),
    });
    expect(riserFittingFlow(input)).toEqual({ m1: 'out', m2: 'none' });
  });

  it('gives out for an explicit root that is in the network, without elementCategories', () => {
    const input = inputOf([...trunkSegments], [fitting('m')], { diffuser: 100 }, {
      rootElementId: 'ahu',
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'out' });
  });

  it('gives in for a stale explicit root that is not in the network', () => {
    const segments = [segment('a', { kind: 'port', elementId: 'diffuser', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' })];
    const input = inputOf(segments, [fitting('m')], { diffuser: 100 }, {
      rootElementId: 'ghost',
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'in' });
  });

  it('gives in for a riser between a zero-capacity and a capacity terminal, whichever id sorts first', () => {
    const forward = [
      segment('a', { kind: 'port', elementId: 'T1', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' }),
      segment('b', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'T2', portId: 'p1' }),
    ];
    const swapped = [
      segment('a', { kind: 'port', elementId: 'T2', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' }),
      segment('b', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'T1', portId: 'p1' }),
    ];
    expect(riserFittingFlow(inputOf(forward, [fitting('m')], { T1: 0, T2: 50 }, { riserFittingIds: new Set(['m']) }))).toEqual({ m: 'in' });
    expect(riserFittingFlow(inputOf(swapped, [fitting('m')], { T1: 50, T2: 0 }, { riserFittingIds: new Set(['m']) }))).toEqual({ m: 'in' });
  });

  it('gives in, not out, when the only equipment has a capacity above 0 (a fan coil unit)', () => {
    const segments = [segment('a', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'fcu', portId: 'p1' })];
    const input = inputOf(segments, [fitting('m')], { fcu: 150 }, {
      elementCategories: { fcu: 'equipment' },
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'in' });
  });

  it('gives out when the equipment has capacity 0', () => {
    const segments = [segment('a', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'fcu', portId: 'p1' })];
    const input = inputOf(segments, [fitting('m')], { fcu: 0 }, {
      elementCategories: { fcu: 'equipment' },
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'out' });
  });

  it('gives out when an equipment with no capacity and an equipment with a capacity are in the network', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'm' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'fcu', portId: 'p1' }),
    ];
    const input = inputOf(segments, [fitting('m'), fitting('tee')], { fcu: 150 }, {
      elementCategories: { ahu: 'equipment', fcu: 'equipment' },
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'out' });
  });

  it('an explicit root still gives out when the equipment has a capacity', () => {
    const segments = [segment('a', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'fcu', portId: 'p1' })];
    const input = inputOf(segments, [fitting('m')], { fcu: 150 }, {
      elementCategories: { fcu: 'equipment' },
      rootElementId: 'fcu',
      riserFittingIds: new Set(['m']),
    });
    expect(riserFittingFlow(input)).toEqual({ m: 'out' });
  });
});

describe('solveFlow — riser fittings as entry and with demand beyond', () => {
  const networkA = [
    segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
    segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
    segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x' }),
  ];
  const fittingsA = [fitting('e'), fitting('tee'), fitting('x')];

  it('roots at the entry, and a drain behind another marked fitting is a boundary', () => {
    const result = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
      entryFittingId: 'e',
      riserDemand: { x: 25 },
    }));
    expect(result.resolved).toBe(true);
    expect(result.totalCapacity).toBe(65);
    expect(result.segmentCapacity.s1).toBe(65);
    expect(result.segmentCapacity.s2).toBe(40);
    expect(result.segmentCapacity.s3).toBe(25);
    expect(result.fittingCapacity.e).toBe(65);
    expect(result.fittingCapacity.tee).toBe(65);
    expect(result.fittingCapacity.x).toBe(25);
    expect(result.riserCapacity).toBe(25);
  });

  it('counts 0 beyond a marked fitting that has no key, and sets no riserCapacity when riserDemand is absent', () => {
    const result = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
      entryFittingId: 'e',
    }));
    expect(result.totalCapacity).toBe(40);
    expect(result.segmentCapacity.s3).toBe(0);
    expect(result.fittingCapacity.x).toBe(0);
    expect('riserCapacity' in result).toBe(false);
  });

  it('prefers the entry over the old chain (a loose duct end)', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'open' }),
    ];
    const fittings = [fitting('e'), fitting('tee'), fitting('open')];
    const terminalCapacities = { d1: 40 };

    const withEntry = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
    }));
    expect(withEntry.fittingCapacity.e).toBe(40);
    expect(withEntry.fittingCapacity.open).toBe(0);
    expect(withEntry.totalCapacity).toBe(40);

    const withoutEntry = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      riserFittingIds: new Set(['e']),
    }));
    expect(withoutEntry.fittingCapacity.open).toBe(40);
    expect(withoutEntry.fittingCapacity.e).toBe(0);
    expect(withoutEntry.totalCapacity).toBe(40);
  });

  it('lets an explicit root win over the entry; the entry then acts as a boundary with its demand', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'e' }),
    ];
    const fittings = [fitting('tee'), fitting('e')];
    const terminalCapacities = { d1: 40 };
    const elementCategories = { ahu: 'equipment' as const };

    const ahuRoot = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      elementCategories,
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      rootElementId: 'ahu',
      riserDemand: { e: 7 },
    }));
    expect(ahuRoot.totalCapacity).toBe(47);
    expect(ahuRoot.segmentCapacity.s3).toBe(7);
    expect(ahuRoot.fittingCapacity.e).toBe(7);
    expect(ahuRoot.segmentCapacity.s1).toBe(47);
    expect(ahuRoot.riserCapacity).toBe(7);

    const entryRoot = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      elementCategories,
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      rootElementId: 'e',
      riserDemand: { e: 7 },
    }));
    expect(entryRoot.segmentCapacity.s3).toBe(40);
    expect(entryRoot.fittingCapacity.e).toBe(47);
    expect(entryRoot.totalCapacity).toBe(47);
    expect(entryRoot.riserCapacity).toBe(7);
  });

  it('ignores an explicit root that is a marked fitting other than the entry, and roots at the entry', () => {
    const result = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
      entryFittingId: 'e',
      rootElementId: 'x',
    }));
    expect(result.fittingCapacity.e).toBe(40);
    expect(result.totalCapacity).toBe(40);
  });

  it('roots at an equipment with exits that carry riserDemand', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x1' }),
      segment('s4', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x2' }),
    ];
    const fittings = [fitting('tee'), fitting('x1'), fitting('x2')];

    const result = solveFlow(inputOf(segments, fittings, { d1: 100 }, {
      elementCategories: { ahu: 'equipment', d1: 'terminal' },
      riserFittingIds: new Set(['x1', 'x2']),
      riserDemand: { x1: 650, x2: 50 },
    }));
    expect(result.totalCapacity).toBe(800);
    expect(result.segmentCapacity.s1).toBe(800);
    expect(result.segmentCapacity.s2).toBe(100);
    expect(result.segmentCapacity.s3).toBe(650);
    expect(result.segmentCapacity.s4).toBe(50);
    expect(result.fittingCapacity.tee).toBe(800);
    expect(result.fittingCapacity.x1).toBe(650);
    expect(result.fittingCapacity.x2).toBe(50);
    expect(result.riserCapacity).toBe(700);
  });

  it('gives the entry its own terminals plus the demand beyond, and the segments only the terminals behind them', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't300', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 't200', portId: 'p1' }),
    ];
    const fittings = [fitting('e'), fitting('tee')];

    const result = solveFlow(inputOf(segments, fittings, { t300: 300, t200: 200 }, {
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      riserDemand: { e: 150 },
    }));
    expect(result.fittingCapacity.e).toBe(650);
    expect(result.totalCapacity).toBe(650);
    expect(result.segmentCapacity.s2).toBe(300);
    expect(result.segmentCapacity.s3).toBe(200);
    expect(result.segmentCapacity.s1).toBe(500);
    expect(result.riserCapacity).toBe(150);
  });

  it('worked example, source level (row 1, level 0)', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'x' }),
    ];
    const fittings = [fitting('tee'), fitting('x')];

    const result = solveFlow(inputOf(segments, fittings, { d1: 100 }, {
      elementCategories: { ahu: 'equipment' },
      riserFittingIds: new Set(['x']),
      riserDemand: { x: 650 },
    }));
    expect(result.totalCapacity).toBe(750);
    expect(result.segmentCapacity.s3).toBe(650);
    expect(result.fittingCapacity.x).toBe(650);
    expect(result.riserCapacity).toBe(650);
  });

  it('lets the entry win over an equipment on the same network', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
    ];
    const fittings = [fitting('e'), fitting('tee')];
    const terminalCapacities = { d1: 50 };
    const elementCategories = { ahu: 'equipment' as const };

    const withEntry = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      elementCategories,
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      riserDemand: { e: 20 },
    }));
    expect(withEntry.totalCapacity).toBe(70);
    expect(withEntry.fittingCapacity.e).toBe(70);
    expect(withEntry.segmentCapacity.s1).toBe(50);
    expect(withEntry.segmentCapacity.s2).toBe(0);
    expect(withEntry.segmentCapacity.s3).toBe(50);

    const withoutEntry = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      elementCategories,
      riserFittingIds: new Set(['e']),
      riserDemand: { e: 20 },
    }));
    expect(withoutEntry.totalCapacity).toBe(70);
    expect(withoutEntry.segmentCapacity.s1).toBe(20);
    expect(withoutEntry.segmentCapacity.s2).toBe(70);
    expect(withoutEntry.fittingCapacity.e).toBe(20);
  });

  it('ignores an entry that is not in the network or not marked', () => {
    const base = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
      riserDemand: { x: 25 },
    }));

    const ghostEntry = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x', 'ghost']),
      entryFittingId: 'ghost',
      riserDemand: { x: 25 },
    }));
    expect(ghostEntry).toEqual(base);

    const networkWithAhu = [
      ...networkA,
      segment('s4', { kind: 'fitting', fittingId: 'tee' }, { kind: 'port', elementId: 'ahu', portId: 'p1' }),
    ];
    const elementCategories = { ahu: 'equipment' as const };
    const unmarkedEntry = solveFlow(inputOf(networkWithAhu, fittingsA, { d1: 40 }, {
      elementCategories,
      riserFittingIds: new Set(['x']),
      entryFittingId: 'e',
      riserDemand: { x: 25 },
    }));
    const unmarkedNoEntry = solveFlow(inputOf(networkWithAhu, fittingsA, { d1: 40 }, {
      elementCategories,
      riserFittingIds: new Set(['x']),
      riserDemand: { x: 25 },
    }));
    expect(unmarkedEntry).toEqual(unmarkedNoEntry);
    expect(unmarkedEntry.segmentCapacity.s4).toBe(65);
  });

  it('ignores a riserDemand key of a fitting that is not marked or not in the network', () => {
    const result = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['x']),
      riserDemand: { x: 25, tee: 99, ghost: 5 },
    }));
    expect(result.segmentCapacity.s3).toBe(25);
    expect(result.riserCapacity).toBe(25);
    expect(result.totalCapacity).toBe(65);
  });

  it('counts a boundary that sits in the middle of a run, and not the terminal behind it', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'm' }),
      segment('b', { kind: 'fitting', fittingId: 'm' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const fittings = [fitting('m')];
    const terminalCapacities = { diffuser: 100 };

    const withDemand = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      riserFittingIds: new Set(['m']),
      riserDemand: { m: 30 },
    }));
    expect(withDemand.segmentCapacity.a).toBe(30);
    expect(withDemand.segmentCapacity.b).toBeNull();
    expect(withDemand.totalCapacity).toBe(30);
    expect(withDemand.riserCapacity).toBe(30);

    const withoutDemand = solveFlow(inputOf(segments, fittings, terminalCapacities, {
      riserFittingIds: new Set(['m']),
    }));
    expect(withoutDemand.segmentCapacity.a).toBe(0);
    expect(withoutDemand.segmentCapacity.b).toBeNull();
  });

  it('follows a loop closing edge as unresolved and counts the entry demand once', () => {
    const segments = [
      segment('s1', { kind: 'fitting', fittingId: 'e' }, { kind: 'fitting', fittingId: 'a' }),
      segment('s2', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 'b' }),
      segment('s3', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 'b' }),
      segment('s4', { kind: 'fitting', fittingId: 'a' }, { kind: 'port', elementId: 'd1', portId: 'p1' }),
    ];
    const fittings = [fitting('e'), fitting('a'), fitting('b')];

    const result = solveFlow(inputOf(segments, fittings, { d1: 40 }, {
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      riserDemand: { e: 10 },
    }));
    expect(result.segmentCapacity.s1).toBe(40);
    expect(result.segmentCapacity.s2).toBe(0);
    expect(result.segmentCapacity.s3).toBeNull();
    expect(result.segmentCapacity.s4).toBe(40);
    expect(result.totalCapacity).toBe(50);
    expect(result.fittingCapacity.e).toBe(50);
    expect(result.riserCapacity).toBe(10);
  });

  it('sums only the riserDemand that the walk reached', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'm1' }),
      segment('b', { kind: 'fitting', fittingId: 'm1' }, { kind: 'fitting', fittingId: 'm2' }),
    ];
    const fittings = [fitting('m1'), fitting('m2')];

    const result = solveFlow(inputOf(segments, fittings, {}, {
      elementCategories: { ahu: 'equipment' },
      riserFittingIds: new Set(['m1', 'm2']),
      riserDemand: { m1: 30, m2: 40 },
    }));
    expect(result.segmentCapacity.a).toBe(30);
    expect(result.riserCapacity).toBe(30);
    expect(result.totalCapacity).toBe(30);
  });

  it('gives riserCapacity 0 for an empty riserDemand and for an unresolved network', () => {
    const empty = solveFlow(inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
      entryFittingId: 'e',
      riserDemand: {},
    }));
    expect('riserCapacity' in empty).toBe(true);
    expect(empty.riserCapacity).toBe(0);

    const segments = [segment('s', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 'b' })];
    const fittings = [fitting('a'), fitting('b')];
    const unresolved = solveFlow(inputOf(segments, fittings, {}, {
      riserFittingIds: new Set(['a', 'b']),
      riserDemand: {},
    }));
    expect(unresolved.resolved).toBe(false);
    expect(unresolved.riserCapacity).toBe(0);
  });

  it('gives the same result as before when neither input is given', () => {
    const base = inputOf(networkA, fittingsA, { d1: 40 }, {
      riserFittingIds: new Set(['e', 'x']),
    });
    const explicitUndefined = solveFlow({ ...base, entryFittingId: undefined, riserDemand: undefined });
    expect(JSON.stringify(solveFlow(base))).toBe(JSON.stringify(explicitUndefined));
  });

  it('counts the demand of a boundary once when two segments reach it', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'tee' }),
      segment('s2', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'e' }),
      segment('s3', { kind: 'fitting', fittingId: 'tee' }, { kind: 'fitting', fittingId: 'e' }),
    ];
    const fittings = [fitting('tee'), fitting('e')];

    const result = solveFlow(inputOf(segments, fittings, {}, {
      elementCategories: { ahu: 'equipment' as const },
      riserFittingIds: new Set(['e']),
      entryFittingId: 'e',
      rootElementId: 'ahu',
      riserDemand: { e: 7 },
    }));
    expect(result.riserCapacity).toBe(7);
    expect(result.totalCapacity).toBe(7);
    expect(result.segmentCapacity.s1).toBe(7);
    expect(result.segmentCapacity.s2).toBe(7);
    expect(result.segmentCapacity.s3).toBeNull();
  });

  it('ignores inherited keys of riserDemand', () => {
    const segments = [
      segment('a', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'constructor' }),
    ];
    const fittings = [fitting('constructor')];

    const result = solveFlow(inputOf(segments, fittings, {}, {
      elementCategories: { ahu: 'equipment' as const },
      riserFittingIds: new Set(['constructor']),
      riserDemand: {},
    }));
    expect(result.segmentCapacity.a).toBe(0);
    expect(result.totalCapacity).toBe(0);
    expect(result.riserCapacity).toBe(0);
  });
});
