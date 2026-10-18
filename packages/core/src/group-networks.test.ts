import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, loadProject, serializeProject, type ProjectDocument } from './project.js';
import { computeNetworks, nodeKeyOf, type NetworkType, type PortGroup, type Segment } from './network.js';
import { solveFlow } from './flow.js';
import type { PlacedStamp } from './stamp.js';

const supplyAir: NetworkType = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 0 };
const returnAir: NetworkType = { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 0 };

function stamp(id: string, category: PlacedStamp['category'], portIds: string[]): PlacedStamp {
  return {
    id,
    category,
    transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 10,
    nativeHeight: 10,
    ports: portIds.map((portId) => ({ id: portId, name: portId, fractionX: 0.5, fractionY: 0.5 })),
  };
}

const segmentSupply: Segment = {
  id: 's-supply',
  pageIndex: 0,
  networkTypeId: 'supply-air',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'port', elementId: 'ahu', portId: 'out' },
  endpointB: { kind: 'port', elementId: 'grille-supply', portId: 'p1' },
  geometry: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
};

const segmentReturn: Segment = {
  id: 's-return',
  pageIndex: 0,
  networkTypeId: 'return-air',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'port', elementId: 'ahu', portId: 'in' },
  endpointB: { kind: 'port', elementId: 'grille-return', portId: 'p1' },
  geometry: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
};

const group: PortGroup = { elementId: 'ahu', portIds: ['out', 'in'] };

const doc: Omit<ProjectDocument, 'schemaVersion'> = {
  networkTypes: [supplyAir, returnAir],
  segments: [segmentSupply, segmentReturn],
  fittings: [],
  stamps: [stamp('ahu', 'equipment', ['out', 'in']), stamp('grille-supply', 'terminal', ['p1']), stamp('grille-return', 'terminal', ['p1'])],
  portGroups: [group],
  annotations: [],
  customStampDefinitions: [],
  terminalCapacities: { 'grille-supply': 300, 'grille-return': 250 },
  networkSizing: [],
  circuits: [],
  panels: [],
  panelSections: [],
  circuitTypes: [],
  stampLabelLayouts: {},
  schematics: [],
  schematicProjectFields: {},
  rooms: [],
  calibrations: {},
  roomTypes: [],
  roomNeeds: [],
  roomTypeCeilingHeightsMm: {},
};

describe('port group over two network types in a saved file', () => {
  const v18File = { ...serializeProject(doc), schemaVersion: 18 };

  it('loads a v18 file through the step to 19, at the current version 21', () => {
    const loaded = loadProject(v18File);
    expect(loaded.schemaVersion).toBe(21);
    expect(CURRENT_SCHEMA_VERSION).toBe(21);
  });

  it('keeps ahu.out and ahu.in in one port group node', () => {
    const loaded = loadProject(v18File);
    const keyOut = nodeKeyOf({ kind: 'port', elementId: 'ahu', portId: 'out' }, loaded.portGroups);
    const keyIn = nodeKeyOf({ kind: 'port', elementId: 'ahu', portId: 'in' }, loaded.portGroups);
    expect(keyOut).toBe(keyIn);
  });

  it('computes two networks, each with its own segment and network type', () => {
    const loaded = loadProject(v18File);
    const networks = computeNetworks({ segments: loaded.segments, fittings: loaded.fittings, portGroups: loaded.portGroups });

    expect(networks).toHaveLength(2);
    const supply = networks.find((n) => n.segmentIds.includes('s-supply'));
    const ret = networks.find((n) => n.segmentIds.includes('s-return'));
    expect(supply?.networkTypeId).toBe('supply-air');
    expect(supply?.segmentIds).toEqual(['s-supply']);
    expect(ret?.networkTypeId).toBe('return-air');
    expect(ret?.segmentIds).toEqual(['s-return']);
  });

  it('solves flow on each network from the ahu root with its own terminal capacity', () => {
    const loaded = loadProject(v18File);
    const networks = computeNetworks({ segments: loaded.segments, fittings: loaded.fittings, portGroups: loaded.portGroups });
    const expected: Record<string, { ownSegment: string; total: number }> = {
      'supply-air': { ownSegment: 's-supply', total: 300 },
      'return-air': { ownSegment: 's-return', total: 250 },
    };

    for (const network of networks) {
      const result = solveFlow({
        network,
        segments: loaded.segments,
        fittings: loaded.fittings,
        portGroups: loaded.portGroups,
        terminalCapacities: loaded.terminalCapacities,
        rootElementId: 'ahu',
      });
      const want = expected[network.networkTypeId];
      expect(result.resolved).toBe(true);
      expect(result.totalCapacity).toBe(want.total);
      expect(Object.keys(result.segmentCapacity)).toEqual([want.ownSegment]);
    }
  });

  it('round-trips through serializeProject and loadProject unchanged', () => {
    const loaded = loadProject(v18File);
    const again = loadProject(serializeProject(loaded));

    expect(again).toEqual(loaded);
    expect(again.portGroups).toEqual([group]);
    expect(again.segments).toEqual([segmentSupply, segmentReturn]);
  });
});
