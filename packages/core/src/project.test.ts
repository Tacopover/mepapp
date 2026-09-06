import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, loadProject, ProjectLoadError, serializeProject } from './project.js';
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

describe('serializeProject / loadProject round trip', () => {
  it('round-trips a document at the current schema version unchanged', () => {
    const serialized = serializeProject({ networkTypes: [networkType], segments: [segment], fittings: [fitting], stamps: [] });
    expect(serialized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const loaded = loadProject(serialized);
    expect(loaded).toEqual({ ...serialized });
  });

  it('migrates a pre-material (v0) save, defaulting the missing field rather than dropping the segment', () => {
    const legacySegment = { ...segment } as Record<string, unknown>;
    delete legacySegment.material;
    const legacyDoc = { networkTypes: [networkType], segments: [legacySegment], fittings: [fitting], stamps: [] }; // no schemaVersion field at all

    const loaded = loadProject(legacyDoc);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.segments[0].material).toBeNull();
    expect(loaded.segments[0].id).toBe('s1'); // nothing else about the segment was disturbed
  });

  it('throws ProjectLoadError with the specific issue when a required array is missing', () => {
    expect(() => loadProject({ schemaVersion: CURRENT_SCHEMA_VERSION, networkTypes: [], fittings: [], stamps: [] })).toThrow(
      ProjectLoadError,
    );
    try {
      loadProject({ schemaVersion: CURRENT_SCHEMA_VERSION, networkTypes: [], fittings: [], stamps: [] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect((error as ProjectLoadError).issues).toEqual([{ path: 'segments', message: 'expected an array' }]);
    }
  });
});
