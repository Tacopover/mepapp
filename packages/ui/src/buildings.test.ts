import { describe, expect, it } from 'vitest';
import { BUILDING_SCHEMA_VERSION, parseBuildingFile, serializeBuildingFile } from '@mepapp/core';
import { importOldRegistry, type Building } from './buildings.js';

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
