import { describe, expect, it } from 'vitest';
import { computeNetworks, type Fitting, type PortGroup, type Segment } from './network.js';

function segment(id: string, endpointA: Segment['endpointA'], endpointB: Segment['endpointB']): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId: 'supply-air',
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
});
