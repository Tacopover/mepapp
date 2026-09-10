import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, loadProject, ProjectLoadError, serializeProject } from './project.js';
import type { Annotation } from './annotation.js';
import type { Fitting, NetworkType, Segment } from './network.js';

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
    const libraryStamp = { ...bareStamp, id: 'st2', definitionId: 'fire-hose-reel' }; // stamp-library.ts: category 'equipment'
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

  it('throws ProjectLoadError with the specific issue when a required array is missing', () => {
    const doc = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      networkTypes: [],
      fittings: [],
      stamps: [],
      portGroups: [],
      annotations: [],
      customStampDefinitions: [],
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
