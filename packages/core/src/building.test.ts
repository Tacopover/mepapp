import { describe, expect, it } from 'vitest';
import {
  BUILDING_SCHEMA_VERSION,
  BuildingFileError,
  emptyBuilding,
  levelWarnings,
  parseBuildingFile,
  serializeBuildingFile,
  type BuildingFile,
} from './building.js';

function sample(): BuildingFile {
  return {
    ...emptyBuilding('b-1', 'Tower'),
    levels: [
      { id: 'l0', name: 'Basement', elevationMm: -3000 },
      { id: 'l1', name: 'Ground', elevationMm: 0 },
    ],
    sheets: [
      { id: 's0', levelId: 'l0', projectUuid: 'u-1', pageIndex: 0, displayName: 'Plan p1', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } },
      { id: 's1', levelId: 'l1', projectUuid: 'u-1', pageIndex: 1, displayName: 'Plan p2', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } },
    ],
  };
}

function issuesOf(raw: unknown): string[] {
  try {
    parseBuildingFile(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(BuildingFileError);
    return (error as BuildingFileError).issues.map((issue) => issue.path);
  }
  throw new Error('parse did not throw');
}

describe('building file', () => {
  it('makes an empty building at the current version', () => {
    const file = emptyBuilding('b', 'Name');
    expect(file).toEqual({ schemaVersion: BUILDING_SCHEMA_VERSION, id: 'b', name: 'Name', levels: [], sheets: [], risers: [] });
  });

  it('round-trips through serialize and parse', () => {
    const file = sample();
    expect(parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).toEqual(file);
  });

  it('upgrades a file with no version through the identity step', () => {
    const { schemaVersion, ...rest } = sample();
    expect(schemaVersion).toBe(1);
    expect(parseBuildingFile(rest).schemaVersion).toBe(1);
  });

  it('keeps a field that it does not know', () => {
    const raw = { ...sample(), futureField: { a: 1 } };
    const parsed = parseBuildingFile(raw) as unknown as Record<string, unknown>;
    expect(parsed.futureField).toEqual({ a: 1 });
  });

  it('refuses a newer version', () => {
    expect(issuesOf({ ...sample(), schemaVersion: BUILDING_SCHEMA_VERSION + 1 })).toEqual(['schemaVersion']);
  });

  it('refuses a value that is not an object', () => {
    expect(issuesOf('text')).toEqual(['']);
    expect(issuesOf(null)).toEqual(['']);
  });

  it('refuses a sheet whose levelId does not exist', () => {
    const file = sample();
    file.sheets[0]!.levelId = 'nope';
    expect(issuesOf(file)).toEqual(['sheets[0].levelId']);
  });

  it('refuses two sheets for one document page', () => {
    const file = sample();
    file.sheets[1]!.pageIndex = 0;
    expect(issuesOf(file)).toEqual(['sheets[1]']);
  });

  it('refuses two sheets for one path and page when there is no id', () => {
    const file = sample();
    for (const sheet of file.sheets) {
      sheet.projectUuid = null;
      sheet.pageIndex = 0;
    }
    expect(issuesOf(file)).toEqual(['sheets[1]']);
  });

  it('allows the same page of two documents', () => {
    const file = sample();
    file.sheets[1] = { ...file.sheets[1]!, projectUuid: 'u-2', pageIndex: 0 };
    expect(() => parseBuildingFile(file)).not.toThrow();
  });

  it('refuses a page index that is negative or not whole', () => {
    const negative = sample();
    negative.sheets[0]!.pageIndex = -1;
    expect(issuesOf(negative)).toEqual(['sheets[0].pageIndex']);
    const fraction = sample();
    fraction.sheets[0]!.pageIndex = 0.5;
    expect(issuesOf(fraction)).toEqual(['sheets[0].pageIndex']);
  });

  it('refuses an elevation that is not finite and allows a negative one', () => {
    const file = sample();
    file.levels[1]!.elevationMm = Number.NaN;
    expect(issuesOf(JSON.parse(JSON.stringify({ ...file, levels: [{ id: 'l1', name: 'x', elevationMm: 'high' }] })))).toContain('levels[0].elevationMm');
    expect(issuesOf({ ...file, levels: [{ id: 'l1', name: 'x', elevationMm: Number.POSITIVE_INFINITY }], sheets: [] })).toEqual(['levels[0].elevationMm']);
    expect(() => parseBuildingFile(sample())).not.toThrow();
  });

  it('refuses two levels with one id', () => {
    const file = sample();
    file.levels[1]!.id = 'l0';
    file.sheets = [];
    expect(issuesOf(file)).toEqual(['levels[1].id']);
  });

  it('refuses a missing array', () => {
    const { sheets, ...rest } = sample();
    expect(sheets.length).toBe(2);
    expect(issuesOf(rest)).toContain('sheets');
  });

  it('warns about two levels with the same elevation and not otherwise', () => {
    expect(levelWarnings(sample())).toEqual([]);
    const file = sample();
    file.levels[0]!.elevationMm = 0;
    const warnings = levelWarnings(file);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Basement');
    expect(warnings[0]).toContain('Ground');
  });
});
