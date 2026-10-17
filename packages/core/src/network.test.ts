import { describe, expect, it } from 'vitest';
import { computeNetworks, type Fitting, type PortGroup, type Segment } from './network.js';

function segment(
  id: string,
  endpointA: Segment['endpointA'],
  endpointB: Segment['endpointB'],
  networkTypeId = 'supply-air',
): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId,
    shape: 'round',
    diameter: 200,
    endpointA,
    endpointB,
    geometry: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function fitting(id: string, kind: Fitting['kind'] = 'junction'): Fitting {
  return { id, pageIndex: 0, position: { x: 0, y: 0 }, kind };
}

describe('computeNetworks', () => {
  it('merges a fitting and its two segments into one network', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p1' }, { kind: 'fitting', fittingId: 'f1' }),
      segment('s2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
    ];
    const networks = computeNetworks({ segments, fittings: [fitting('f1')], portGroups: [] });

    expect(networks).toHaveLength(1);
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's2']);
    expect(networks[0].fittingIds).toEqual(['f1']);
  });

  it('keeps two disconnected runs as separate networks', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'a', portId: 'p1' }, { kind: 'port', elementId: 'b', portId: 'p1' }),
      segment('s2', { kind: 'port', elementId: 'c', portId: 'p1' }, { kind: 'port', elementId: 'd', portId: 'p1' }),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups: [] });

    expect(networks).toHaveLength(2);
    expect(networks.map((n) => n.segmentIds)).toEqual([['s1'], ['s2']]);
  });

  it('excludes a fitting with no connected segments (orphaned)', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'a', portId: 'p1' }, { kind: 'fitting', fittingId: 'f1' }),
    ];
    const networks = computeNetworks({
      segments,
      fittings: [fitting('f1'), fitting('f2')],
      portGroups: [],
    });

    expect(networks).toHaveLength(1);
    expect(networks[0].fittingIds).toEqual(['f1']);
  });

  it('treats linked ports on the same element as one node, joining networks that touch either port', () => {
    // ahu's supply (p-out) and return (p-in) ports are linked into one group — a segment on
    // either port belongs to the same network, matching MepPortConnection.cs:6-9's port-group rule.
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(1);
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's2']);
  });

  it('does NOT join two unlinked ports on the same element into one network', () => {
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }),
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups: [] });

    expect(networks).toHaveLength(2);
  });

  it('keeps segments of different network types on one port group in two networks', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }, 'supply-air'),
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }, 'return-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(2);
    expect(networks.map((n) => [n.segmentIds, n.networkTypeId])).toEqual([
      [['s1'], 'supply-air'],
      [['s2'], 'return-air'],
    ]);
  });

  it('joins only the same-type segments of a port group into one network', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in', 'p-x'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }, 'supply-air'),
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }, 'return-air'),
      segment('s3', { kind: 'port', elementId: 'ahu', portId: 'p-x' }, { kind: 'port', elementId: 'valve', portId: 'p1' }, 'supply-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(2);
    expect(networks[0].networkTypeId).toBe('supply-air');
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's3']);
    expect(networks[1].networkTypeId).toBe('return-air');
    expect(networks[1].segmentIds).toEqual(['s2']);
  });

  it('keeps a fitting between two same-type segments in the network of one type', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'fitting', fittingId: 'f1' }, 'supply-air'),
      segment('s2', { kind: 'fitting', fittingId: 'f1' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }, 'supply-air'),
      segment('s3', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }, 'return-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [fitting('f1')], portGroups });

    expect(networks).toHaveLength(2);
    const supply = networks.find((n) => n.networkTypeId === 'supply-air')!;
    expect(supply.segmentIds.sort()).toEqual(['s1', 's2']);
    expect(supply.fittingIds).toEqual(['f1']);
    const ret = networks.find((n) => n.networkTypeId === 'return-air')!;
    expect(ret.segmentIds).toEqual(['s3']);
    expect(ret.fittingIds).toEqual([]);
  });

  it('joins a segment with both ends in one port group when both ends share its type', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'ahu', portId: 'p-in' }),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(1);
    expect(networks[0].segmentIds).toEqual(['s1']);
  });

  it('numbers networks in the order of their first segment in the input', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }, 'return-air'),
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }, 'supply-air'),
      segment('s3', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'port', elementId: 'valve', portId: 'p1' }, 'supply-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks.map((n) => n.id)).toEqual(['net-0', 'net-1']);
    expect(networks[0].networkTypeId).toBe('return-air');
    expect(networks[0].segmentIds).toEqual(['s2']);
    expect(networks[1].networkTypeId).toBe('supply-air');
    expect(networks[1].segmentIds).toEqual(['s1', 's3']);
  });

  it('splits each port group by network type on its own, for two stamps', () => {
    const portGroups: PortGroup[] = [
      { elementId: 'ahu1', portIds: ['p-out', 'p-in'] },
      { elementId: 'ahu2', portIds: ['p-out', 'p-in'] },
    ];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu1', portId: 'p-out' }, { kind: 'port', elementId: 'ahu2', portId: 'p-out' }, 'supply-air'),
      segment('s2', { kind: 'port', elementId: 'ahu1', portId: 'p-in' }, { kind: 'port', elementId: 'ahu2', portId: 'p-in' }, 'return-air'),
      segment('s3', { kind: 'port', elementId: 'ahu1', portId: 'p-out' }, { kind: 'port', elementId: 'diffuser', portId: 'p1' }, 'supply-air'),
      segment('s4', { kind: 'port', elementId: 'ahu2', portId: 'p-in' }, { kind: 'port', elementId: 'grille', portId: 'p1' }, 'return-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(2);
    expect(networks[0].networkTypeId).toBe('supply-air');
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's3']);
    expect(networks[1].networkTypeId).toBe('return-air');
    expect(networks[1].segmentIds.sort()).toEqual(['s2', 's4']);
  });

  it('known hole (Q-R3-01): a shared fitting still joins different types', () => {
    const portGroups: PortGroup[] = [{ elementId: 'ahu', portIds: ['p-out', 'p-in'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'ahu', portId: 'p-out' }, { kind: 'fitting', fittingId: 'f1' }, 'supply-air'),
      segment('s2', { kind: 'port', elementId: 'ahu', portId: 'p-in' }, { kind: 'fitting', fittingId: 'f1' }, 'return-air'),
    ];
    const networks = computeNetworks({ segments, fittings: [fitting('f1')], portGroups });

    expect(networks).toHaveLength(1);
    expect(networks[0].networkTypeId).toBe('supply-air');
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's2']);
  });

  it('water is not split: a group over flow and return ports joins both pipes', () => {
    const portGroups: PortGroup[] = [{ elementId: 'boiler', portIds: ['flow', 'return'] }];
    const segments = [
      segment('s1', { kind: 'port', elementId: 'boiler', portId: 'flow' }, { kind: 'port', elementId: 'coil1', portId: 'in' }, 'heating-water'),
      segment('s2', { kind: 'port', elementId: 'boiler', portId: 'return' }, { kind: 'port', elementId: 'coil2', portId: 'out' }, 'heating-water'),
    ];
    const networks = computeNetworks({ segments, fittings: [], portGroups });

    expect(networks).toHaveLength(1);
    expect(networks[0].networkTypeId).toBe('heating-water');
    expect(networks[0].segmentIds.sort()).toEqual(['s1', 's2']);
  });
});
