import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, customStampDefinitionsToSave, loadProject, ProjectLoadError, serializeProject } from './project.js';
import type { Annotation } from './annotation.js';
import type { Fitting, NetworkType, Segment } from './network.js';
import type { PlacedStamp } from './stamp.js';
import type { StampDefinition } from './stamp-library.js';

const networkType: NetworkType = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 0 };
const segment: Segment = {
  id: 's1',
  pageIndex: 0,
  networkTypeId: 'supply-air',
  shape: 'round',
  diameter: 200,
  material: 'galvanizedSteel',
  endpointA: { kind: 'fitting', fittingId: 'f1' },
  endpointB: { kind: 'fitting', fittingId: 'f2' },
  geometry: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};
const fitting: Fitting = { id: 'f1', pageIndex: 0, position: { x: 0, y: 0 }, kind: 'junction' };
const annotation: Annotation = { id: 'a1', pageIndex: 0, geometry: { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } } };

describe('serializeProject / loadProject round trip', () => {
  it('round-trips a document at the current schema version unchanged', () => {
    const serialized = serializeProject({
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
      annotations: [annotation],
      customStampDefinitions: [],
      terminalCapacities: { 'stamp-1': 400 },
      circuits: [],
      panels: [],
      panelSections: [],
      circuitTypes: [],
      stampLabelLayouts: { 'fire-hose-reel': [{ id: 'l1', propertyKey: 'stamp:name', anchorX: 0.5, anchorY: 1, fontSize: 9, textColor: '#282828' }] },
      schematics: [],
      schematicProjectFields: {},
      rooms: [{ id: 'room-1', pageIndex: 0, polygon: { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], holes: [] }, name: 'Kitchen', number: '0.12', source: 'click', locked: true, open: false }],
      calibrations: { '0': { pageUnitsPerRealUnit: 0.0283 }, '2': { pageUnitsPerRealUnit: 0.0567 } },
    });
    expect(serialized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const loaded = loadProject(serialized);
    expect(loaded).toEqual({ ...serialized });
  });

  it('migrates a pre-material (v0) save, defaulting the missing field rather than dropping the segment', () => {
    const legacySegment = { ...segment } as Record<string, unknown>;
    delete legacySegment.material;
    const legacyDoc = { networkTypes: [networkType], segments: [legacySegment], fittings: [fitting], stamps: [] }; // no schemaVersion field at all

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // v0 resumes through every later step, not just v0->v1
    expect(loaded.segments[0].material).toBeNull();
    expect(loaded.segments[0].id).toBe('s1'); // nothing else about the segment was disturbed
  });

  it('migrates a pre-category (v1) save, defaulting bare stamps to terminal and resolving known definitions', () => {
    const bareStamp = {
      id: 'st1',
      transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 10,
      nativeHeight: 10,
      ports: [],
    };
    const libraryStamp = { ...bareStamp, id: 'st2', definitionId: 'air-handling-unit' }; // stamp-library.generated.ts: category 'equipment' — differs from the 'terminal' default, so this proves the lookup actually ran rather than just falling through
    const legacyDoc = {
      schemaVersion: 1,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [bareStamp, libraryStamp],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // v1 resumes through every later step, not just v1->v2
    expect(loaded.stamps[0].category).toBe('terminal');
    expect(loaded.stamps[1].category).toBe('equipment');
    expect(loaded.portGroups).toEqual([]);
  });

  it('migrates a pre-portGroups (v2) save, defaulting to an empty array', () => {
    const legacyDoc = {
      schemaVersion: 2,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // v2 resumes through every later step, not just v2->v3
    expect(loaded.portGroups).toEqual([]);
    expect(loaded.annotations).toEqual([]);
  });

  it('migrates a pre-annotations (v3) save, defaulting to an empty array', () => {
    const legacyDoc = {
      schemaVersion: 3,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // v3 resumes through every later step, not just v3->v4
    expect(loaded.annotations).toEqual([]);
    expect(loaded.customStampDefinitions).toEqual([]);
  });

  it('migrates a pre-customStampDefinitions (v4) save, defaulting to an empty array', () => {
    const legacyDoc = {
      schemaVersion: 4,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
      annotations: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.customStampDefinitions).toEqual([]);
  });

  it('migrates a pre-color (v5) save, leaving stamps without a color field untouched', () => {
    const bareStamp = {
      id: 'st1',
      category: 'terminal',
      transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 10,
      nativeHeight: 10,
      ports: [],
    };
    const legacyDoc = {
      schemaVersion: 5,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [bareStamp],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.stamps[0].color).toBeUndefined();
  });

  it('migrates a pre-electrical-merge (v6) save, remapping the old electricalPathways/electricalCircuits disciplines to electrical', () => {
    const legacyDoc = {
      schemaVersion: 6,
      networkTypes: [
        { ...networkType, id: 'conduit', discipline: 'electricalPathways' },
        { ...networkType, id: 'branch-circuit', discipline: 'electricalCircuits' },
      ],
      segments: [],
      fittings: [],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [
        { id: 'switch', label: 'Switch', discipline: 'electricalCircuits', category: 'terminal', nativeWidth: 10, nativeHeight: 10, ports: [], iconRef: 'x', source: 'custom' },
      ],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.networkTypes.map((t) => t.discipline)).toEqual(['electrical', 'electrical']);
    expect(loaded.customStampDefinitions[0].discipline).toBe('electrical');
  });

  it('migrates a pre-terminalCapacities (v7) save, defaulting to an empty object', () => {
    const legacyDoc = {
      schemaVersion: 7,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.terminalCapacities).toEqual({});
  });

  it('migrates a pre-circuit-model (v8) save, defaulting circuits/panels/panelSections/circuitTypes to empty arrays', () => {
    const legacyDoc = {
      schemaVersion: 8,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
      terminalCapacities: {},
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.circuits).toEqual([]);
    expect(loaded.panels).toEqual([]);
    expect(loaded.panelSections).toEqual([]);
    expect(loaded.circuitTypes).toEqual([]);
    expect(loaded.stampLabelLayouts).toEqual({}); // later steps (v8->v9, v10->v11, v11->v12) all run in sequence
    expect(loaded.schematics).toEqual([]);
    expect(loaded.schematicProjectFields).toEqual({});
    expect(loaded.rooms).toEqual([]); // v12->v13
    expect(loaded.calibrations).toEqual({}); // v13->v14
  });

  it('migrates a pre-circuit-defaults (v9) save unchanged, since the new fields are all optional', () => {
    const legacyDoc = {
      schemaVersion: 9,
      networkTypes: [networkType],
      segments: [segment],
      fittings: [fitting],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
      terminalCapacities: {},
      circuits: [],
      panels: [],
      panelSections: [],
      circuitTypes: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.panels).toEqual([]);
    expect(loaded.stampLabelLayouts).toEqual({});
    expect(loaded.schematics).toEqual([]);
    expect(loaded.schematicProjectFields).toEqual({});
  });

  it('migrates a pre-labels (v10) save, defaulting stampLabelLayouts, schematics and shared project fields', () => {
    const legacyDoc = {
      schemaVersion: 10,
      networkTypes: [],
      segments: [],
      fittings: [],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
      terminalCapacities: {},
      circuits: [],
      panels: [],
      panelSections: [],
      circuitTypes: [],
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.stampLabelLayouts).toEqual({});
    expect(loaded.schematics).toEqual([]);
    expect(loaded.schematicProjectFields).toEqual({});
  });

  it('migrates a v11 save (already has labels) by adding empty schematics and shared project fields', () => {
    const legacyDoc = {
      schemaVersion: 11,
      networkTypes: [],
      segments: [],
      fittings: [],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
      terminalCapacities: {},
      circuits: [],
      panels: [],
      panelSections: [],
      circuitTypes: [],
      stampLabelLayouts: { 'fire-hose-reel': [{ id: 'l1', propertyKey: 'stamp:name', anchorX: 0.5, anchorY: 1, fontSize: 9, textColor: '#282828' }] },
    };

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.stampLabelLayouts).toEqual(legacyDoc.stampLabelLayouts); // untouched by the v11->v12 step
    expect(loaded.schematics).toEqual([]);
    expect(loaded.schematicProjectFields).toEqual({});
  });

  it('throws ProjectLoadError with the specific issue when a required array is missing', () => {
    const doc = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      networkTypes: [],
      fittings: [],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
      terminalCapacities: {},
      circuits: [],
      panels: [],
      panelSections: [],
      circuitTypes: [],
      stampLabelLayouts: {},
      schematics: [],
      schematicProjectFields: {},
      rooms: [],
      calibrations: {},
    };
    expect(() => loadProject(doc)).toThrow(ProjectLoadError);
    try {
      loadProject(doc);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect((error as ProjectLoadError).issues).toEqual([{ path: 'segments', message: 'expected an array' }]);
    }
  });
});

describe('calibrations in the save format', () => {
  const v13 = {
    schemaVersion: 13, networkTypes: [], segments: [], fittings: [], stamps: [], portGroups: [], annotations: [], customStampDefinitions: [], terminalCapacities: {},
    circuits: [], panels: [], panelSections: [], circuitTypes: [], stampLabelLayouts: {}, schematics: [], schematicProjectFields: {}, rooms: [],
  };

  it('loads a version 13 save with no calibrated page', () => {
    expect(loadProject(v13).calibrations).toEqual({});
  });

  it('rejects a calibration that is not a positive number or a key that is not a page index', () => {
    const bad = { ...v13, schemaVersion: CURRENT_SCHEMA_VERSION, calibrations: { '0': { pageUnitsPerRealUnit: 0 }, page1: { pageUnitsPerRealUnit: 1 }, '3': null } };
    try {
      loadProject(bad);
      expect.unreachable();
    } catch (error) {
      expect((error as ProjectLoadError).issues).toEqual([
        { path: 'calibrations.0.pageUnitsPerRealUnit', message: 'expected a positive number' },
        { path: 'calibrations.3.pageUnitsPerRealUnit', message: 'expected a positive number' },
        { path: 'calibrations.page1', message: 'expected a page index' },
      ]);
    }
  });
});

describe('customStampDefinitionsToSave', () => {
  const definition = (id: string, source: StampDefinition['source']): StampDefinition => ({
    id, label: id, discipline: 'other', category: 'terminal', nativeWidth: 40, nativeHeight: 40, ports: [], iconRef: 'data:image/png;base64,AAAA', source,
  });
  const stamp = (id: string, definitionId?: string): PlacedStamp => ({
    id, category: 'terminal', transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 40, nativeHeight: 40, ports: [], definitionId,
  });

  it('drops a user-library copy that no placed stamp uses', () => {
    expect(customStampDefinitionsToSave([definition('user-a', 'user')], [stamp('stamp-1', 'other-id'), stamp('stamp-2')])).toEqual([]);
  });

  it('keeps a user-library copy that a placed stamp uses', () => {
    const copy = definition('user-a', 'user');
    expect(customStampDefinitionsToSave([copy], [stamp('stamp-1', 'user-a')])).toEqual([copy]);
  });

  it('keeps custom elements, edited library stamps and entries with no source when no stamp uses them', () => {
    const custom = definition('custom-1', 'custom');
    const edited = definition('fire-hose-reel', 'library');
    const legacy = { ...definition('old-1', 'custom'), source: undefined } as unknown as StampDefinition;
    expect(customStampDefinitionsToSave([custom, edited, legacy], [])).toEqual([custom, edited, legacy]);
  });

  it('does not change the list in memory, so the copy is saved again after an undo brings its stamp back', () => {
    const copy = definition('user-a', 'user');
    const definitions = [copy];
    expect(customStampDefinitionsToSave(definitions, [])).toEqual([]);
    expect(definitions).toEqual([copy]);
    expect(customStampDefinitionsToSave(definitions, [stamp('stamp-1', 'user-a')])).toEqual([copy]);
  });

  it('keeps the input order', () => {
    const a = definition('custom-a', 'custom');
    const b = definition('user-b', 'user');
    const c = definition('custom-c', 'custom');
    const d = definition('user-d', 'user');
    expect(customStampDefinitionsToSave([a, b, c, d], [stamp('stamp-1', 'user-b')])).toEqual([a, b, c]);
  });
});
