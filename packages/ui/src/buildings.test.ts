import { describe, expect, it } from 'vitest';
import { BUILDING_SCHEMA_VERSION, parseBuildingFile, serializeBuildingFile } from '@mepapp/core';
import {
  IMPORTED_OLD_BUILDINGS_KEY,
  importOldRegistry,
  loadBuildings,
  loadImportedOldIds,
  markOldImported,
  pendingOldBuildings,
  type Building,
} from './buildings.js';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe('importOldRegistry', () => {
  const old: Building[] = [
    {
      id: 'bld-1',
      name: 'Tower',
      levels: [
        { id: 'lvl-1', name: 'Ground', documentFileName: 'ground.pdf' },
        { id: 'lvl-2', name: 'First', documentFileName: null },
      ],
    },
  ];

  it('gives one BuildingFile per old building with the same id and name', () => {
    const [file] = importOldRegistry(old);
    expect(file.id).toBe('bld-1');
    expect(file.name).toBe('Tower');
    expect(file.schemaVersion).toBe(BUILDING_SCHEMA_VERSION);
    expect(file.risers).toEqual([]);
  });

  it('keeps the level ids and names and sets elevationMm to 0', () => {
    const [file] = importOldRegistry(old);
    expect(file.levels).toEqual([
      { id: 'lvl-1', name: 'Ground', elevationMm: 0 },
      { id: 'lvl-2', name: 'First', elevationMm: 0 },
    ]);
  });

  it('makes one sheet only for the level that has a document', () => {
    const [file] = importOldRegistry(old);
    expect(file.sheets).toEqual([
      {
        id: 'lvl-1-sheet',
        levelId: 'lvl-1',
        projectUuid: null,
        pageIndex: 0,
        displayName: 'ground.pdf',
        location: { fileName: 'ground.pdf' },
      },
    ]);
  });

  it('gives an empty BuildingFile for an old building with no levels', () => {
    const [file] = importOldRegistry([{ id: 'bld-2', name: 'Empty', levels: [] }]);
    expect(file.levels).toEqual([]);
    expect(file.sheets).toEqual([]);
  });

  it('gives a file that parseBuildingFile accepts after a serialize round trip', () => {
    const [file] = importOldRegistry(old);
    expect(() => parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).not.toThrow();
  });
});

describe('loadBuildings', () => {
  it('reads the old list from the given storage', () => {
    const storage = fakeStorage({ 'mepapp.buildings.v1': JSON.stringify([{ id: 'bld-1', name: 'Tower', levels: [] }]) });
    expect(loadBuildings(storage)).toEqual([{ id: 'bld-1', name: 'Tower', levels: [] }]);
  });

  it('gives [] for bad JSON', () => {
    expect(loadBuildings(fakeStorage({ 'mepapp.buildings.v1': '{bad' }))).toEqual([]);
  });
});

describe('loadImportedOldIds and markOldImported', () => {
  it('gives [] when nothing was imported', () => {
    expect(loadImportedOldIds(fakeStorage())).toEqual([]);
  });

  it('gives [] for bad JSON', () => {
    expect(loadImportedOldIds(fakeStorage({ [IMPORTED_OLD_BUILDINGS_KEY]: '{bad' }))).toEqual([]);
  });

  it('gives [] for a value that is not an array', () => {
    expect(loadImportedOldIds(fakeStorage({ [IMPORTED_OLD_BUILDINGS_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('adds the ids to the stored list without duplicates', () => {
    const storage = fakeStorage();
    markOldImported(['bld-1'], storage);
    markOldImported(['bld-1', 'bld-2'], storage);
    expect(loadImportedOldIds(storage)).toEqual(['bld-1', 'bld-2']);
    expect(JSON.parse(storage.data.get(IMPORTED_OLD_BUILDINGS_KEY) ?? '[]')).toEqual(['bld-1', 'bld-2']);
  });
});

describe('pendingOldBuildings', () => {
  it('gives the old buildings whose id is not imported', () => {
    const all: Building[] = [
      { id: 'bld-1', name: 'Tower', levels: [] },
      { id: 'bld-2', name: 'Annex', levels: [] },
    ];
    expect(pendingOldBuildings(all, ['bld-1'])).toEqual([{ id: 'bld-2', name: 'Annex', levels: [] }]);
    expect(pendingOldBuildings(all, [])).toEqual(all);
    expect(pendingOldBuildings(all, ['bld-1', 'bld-2'])).toEqual([]);
  });
});
