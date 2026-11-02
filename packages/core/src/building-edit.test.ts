import { describe, expect, it } from 'vitest';
import { emptyBuilding, parseBuildingFile, serializeBuildingFile, type BuildingFile } from './building.js';
import {
  addLevel,
  addSheets,
  deleteLevel,
  moveLevel,
  moveSheet,
  relinkSheet,
  removeSheet,
  renameLevel,
  setLevelElevation,
  sortLevelsByElevation,
  type BuildingEditError,
  type NewSheetPage,
} from './building-edit.js';

function unwrap(result: { ok: true; file: BuildingFile } | { ok: false; error: BuildingEditError }): BuildingFile {
  if (!result.ok) throw new Error(`relink failed: ${result.error}`);
  return result.file;
}

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

function fourLevels(): BuildingFile {
  return {
    ...emptyBuilding('b-1', 'Tower'),
    levels: ['l0', 'l1', 'l2', 'l3'].map((id, index) => ({ id, name: id, elevationMm: index * 3000 })),
  };
}

function page(pageIndex: number, projectUuid: string | null = 'u-2'): NewSheetPage {
  return { projectUuid, pageIndex, displayName: `Page ${pageIndex}`, location: { fileName: 'other.pdf', path: '/a/other.pdf' } };
}

describe('building edit', () => {
  it('adds a level at the end with a default name and zero elevation', () => {
    const file = sample();
    const result = addLevel(file, '   ', undefined, 'l2');
    expect(result.levels[2]).toEqual({ id: 'l2', name: 'Level 3', elevationMm: 0 });
    expect(file.levels).toHaveLength(2);
  });

  it('trims the name of a new level', () => {
    expect(addLevel(sample(), '  Roof  ', 9000, 'l2').levels[2]).toEqual({ id: 'l2', name: 'Roof', elevationMm: 9000 });
  });

  it('sets elevation 0 when the elevation is not finite', () => {
    expect(addLevel(sample(), 'Roof', Number.NaN, 'l2').levels[2]!.elevationMm).toBe(0);
    expect(addLevel(sample(), 'Roof', Number.POSITIVE_INFINITY, 'l2').levels[2]!.elevationMm).toBe(0);
  });

  it('gives a new level a generated id when none is given', () => {
    const id = addLevel(sample(), 'Roof').levels[2]!.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('renames a level and trims the name', () => {
    expect(renameLevel(sample(), 'l1', '  Mezzanine ').levels[1]!.name).toBe('Mezzanine');
  });

  it('returns the same file for a blank name and an unknown id when it renames', () => {
    const file = sample();
    expect(renameLevel(file, 'l1', '   ')).toBe(file);
    expect(renameLevel(file, 'nope', 'Roof')).toBe(file);
  });

  it('allows a negative elevation', () => {
    expect(setLevelElevation(sample(), 'l1', -500).levels[1]!.elevationMm).toBe(-500);
  });

  it('returns the same file for an elevation that is not finite and an unknown id', () => {
    const file = sample();
    expect(setLevelElevation(file, 'l1', Number.NaN)).toBe(file);
    expect(setLevelElevation(file, 'nope', 1000)).toBe(file);
  });

  it('moves a level to the front', () => {
    expect(moveLevel(fourLevels(), 'l2', 0).levels.map((level) => level.id)).toEqual(['l2', 'l0', 'l1', 'l3']);
  });

  it('moves a level to the end', () => {
    expect(moveLevel(fourLevels(), 'l0', 3).levels.map((level) => level.id)).toEqual(['l1', 'l2', 'l3', 'l0']);
  });

  it('clamps the target index of a move', () => {
    expect(moveLevel(fourLevels(), 'l1', 99).levels.map((level) => level.id)).toEqual(['l0', 'l2', 'l3', 'l1']);
    expect(moveLevel(fourLevels(), 'l2', -5).levels.map((level) => level.id)).toEqual(['l2', 'l0', 'l1', 'l3']);
  });

  it('keeps the order of the other levels when it moves one', () => {
    expect(moveLevel(fourLevels(), 'l1', 2).levels.map((level) => level.id)).toEqual(['l0', 'l2', 'l1', 'l3']);
  });

  it('returns the same file for an unknown id', () => {
    const file = fourLevels();
    expect(moveLevel(file, 'nope', 0)).toBe(file);
  });

  it('returns the same file for a target index that is not finite', () => {
    const file = fourLevels();
    expect(moveLevel(file, 'l1', Number.NaN)).toBe(file);
    expect(moveLevel(file, 'l1', Number.POSITIVE_INFINITY)).toBe(file);
  });

  it('refuses to delete a level that a sheet uses', () => {
    expect(deleteLevel(sample(), 'l0')).toEqual({ ok: false, error: 'level-has-sheets' });
  });

  it('deletes a level that no sheet uses', () => {
    const file = addLevel(sample(), 'Roof', 9000, 'l2');
    const result = deleteLevel(file, 'l2');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('delete failed');
    expect(result.file.levels.map((level) => level.id)).toEqual(['l0', 'l1']);
  });

  it('refuses to delete an unknown level', () => {
    expect(deleteLevel(sample(), 'nope')).toEqual({ ok: false, error: 'unknown-level' });
  });

  it('does not change the input of a delete', () => {
    const file = addLevel(sample(), 'Roof', 9000, 'l2');
    const before = serializeBuildingFile(file);
    deleteLevel(file, 'l2');
    expect(serializeBuildingFile(file)).toBe(before);
  });

  it('adds two pages in order', () => {
    const file = addLevel(sample(), 'Roof', 9000, 'l2');
    const result = addSheets(file, 'l2', [page(0), page(1)]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('add failed');
    expect(result.skipped).toEqual([]);
    const added = result.file.sheets.slice(2);
    expect(added.map((sheet) => sheet.pageIndex)).toEqual([0, 1]);
    expect(added.every((sheet) => sheet.levelId === 'l2' && sheet.projectUuid === 'u-2')).toBe(true);
    expect(added[0]!.displayName).toBe('Page 0');
  });

  it('skips a page that appears twice in one call and returns the later one', () => {
    const result = addSheets(sample(), 'l1', [page(0), page(0)]);
    if (!result.ok) throw new Error('add failed');
    expect(result.file.sheets).toHaveLength(3);
    expect(result.skipped).toEqual([page(0)]);
  });

  it('skips a page without a uuid when its path and pageIndex match an existing sheet', () => {
    const file: BuildingFile = {
      ...sample(),
      sheets: [{ id: 's2', levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: 'Loose', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } }],
    };
    const same: NewSheetPage = { projectUuid: null, pageIndex: 0, displayName: 'Same', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } };
    const other: NewSheetPage = { projectUuid: null, pageIndex: 1, displayName: 'Other', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } };
    const result = addSheets(file, 'l1', [same, other]);
    if (!result.ok) throw new Error('add failed');
    expect(result.skipped).toEqual([same]);
    expect(result.file.sheets).toHaveLength(2);
    expect(result.file.sheets[1]!.pageIndex).toBe(1);
  });

  it('skips a page whose pageIndex is not a whole number >= 0', () => {
    const file = sample();
    const result = addSheets(file, 'l1', [page(1.5), page(-1), page(Number.NaN), page(Number.POSITIVE_INFINITY), page(2)]);
    if (!result.ok) throw new Error('add failed');
    expect(result.skipped.map((skippedPage) => skippedPage.pageIndex)).toEqual([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]);
    expect(result.file.sheets.slice(2).map((sheet) => sheet.pageIndex)).toEqual([2]);
  });

  it('skips a page that already has a sheet and returns it', () => {
    const result = addSheets(sample(), 'l1', [page(0, 'u-1'), page(5, 'u-1')]);
    if (!result.ok) throw new Error('add failed');
    expect(result.skipped).toEqual([page(0, 'u-1')]);
    expect(result.file.sheets).toHaveLength(3);
    expect(result.file.sheets[2]!.pageIndex).toBe(5);
  });

  it('refuses an unknown level', () => {
    expect(addSheets(sample(), 'nope', [page(0)])).toEqual({ ok: false, error: 'unknown-level' });
  });

  it('does not change the input of an add', () => {
    const file = addLevel(sample(), 'Roof', 9000, 'l2');
    const before = serializeBuildingFile(file);
    addSheets(file, 'l2', [page(0), page(1)]);
    expect(serializeBuildingFile(file)).toBe(before);
  });

  it('never skips a page with no key', () => {
    const loose: NewSheetPage = { projectUuid: null, pageIndex: 0, displayName: 'Loose', location: { fileName: 'x.pdf' } };
    const result = addSheets(sample(), 'l1', [loose, loose]);
    if (!result.ok) throw new Error('add failed');
    expect(result.skipped).toEqual([]);
    expect(result.file.sheets).toHaveLength(4);
  });

  it('moves a sheet to another level', () => {
    expect(moveSheet(sample(), 's0', 'l1').sheets[0]!.levelId).toBe('l1');
  });

  it('returns the same file for an unknown sheet or level', () => {
    const file = sample();
    expect(moveSheet(file, 'nope', 'l1')).toBe(file);
    expect(moveSheet(file, 's0', 'nope')).toBe(file);
  });

  it('removes a sheet', () => {
    expect(removeSheet(sample(), 's0').sheets.map((sheet) => sheet.id)).toEqual(['s1']);
  });

  it('returns the same file for an unknown sheet on remove', () => {
    const file = sample();
    expect(removeSheet(file, 'nope')).toBe(file);
  });

  it('relinks a sheet and keeps its projectUuid when none is given', () => {
    const location = { fileName: 'new.pdf', path: '/b/new.pdf' };
    const sheet = unwrap(relinkSheet(sample(), 's0', location)).sheets[0]!;
    expect(sheet.location).toEqual(location);
    expect(sheet.projectUuid).toBe('u-1');
  });

  it('relinks a sheet and replaces its projectUuid when one is given', () => {
    const location = { fileName: 'new.pdf' };
    expect(unwrap(relinkSheet(sample(), 's0', location, 'u-3')).sheets[0]!.projectUuid).toBe('u-3');
    expect(unwrap(relinkSheet(sample(), 's0', location, null)).sheets[0]!.projectUuid).toBeNull();
  });

  it('returns the same file for an unknown sheet on relink', () => {
    const file = sample();
    const result = relinkSheet(file, 'nope', { fileName: 'new.pdf' }, 'u-3');
    expect(result).toEqual({ ok: true, file });
    if (!result.ok) throw new Error('relink failed');
    expect(result.file).toBe(file);
  });

  it('does not change the input of a relink', () => {
    const file = sample();
    const before = serializeBuildingFile(file);
    relinkSheet(file, 's0', { fileName: 'new.pdf', path: '/b/new.pdf' }, 'u-3');
    expect(serializeBuildingFile(file)).toBe(before);
  });

  it('refuses a relink that gives a sheet the projectUuid and page of another sheet', () => {
    const file: BuildingFile = {
      ...sample(),
      sheets: [...sample().sheets, { id: 's2', levelId: 'l1', projectUuid: 'u-2', pageIndex: 0, displayName: 'Plan p1 b', location: { fileName: 'b.pdf' } }],
    };
    expect(relinkSheet(file, 's2', { fileName: 'plan.pdf' }, 'u-1')).toEqual({ ok: false, error: 'duplicate-sheet' });
  });

  it('does not change the file when it refuses a relink', () => {
    const file: BuildingFile = {
      ...sample(),
      sheets: [...sample().sheets, { id: 's2', levelId: 'l1', projectUuid: 'u-2', pageIndex: 0, displayName: 'Plan p1 b', location: { fileName: 'b.pdf' } }],
    };
    const before = serializeBuildingFile(file);
    relinkSheet(file, 's2', { fileName: 'plan.pdf' }, 'u-1');
    expect(serializeBuildingFile(file)).toBe(before);
  });

  it('does not refuse a relink that gives the projectUuid of another sheet on a different page', () => {
    const file: BuildingFile = {
      ...sample(),
      sheets: [...sample().sheets, { id: 's2', levelId: 'l1', projectUuid: 'u-2', pageIndex: 2, displayName: 'Plan p3', location: { fileName: 'b.pdf' } }],
    };
    expect(unwrap(relinkSheet(file, 's2', { fileName: 'plan.pdf' }, 'u-1')).sheets[2]!.projectUuid).toBe('u-1');
  });

  it('does not refuse a relink to null or to no projectUuid', () => {
    const file: BuildingFile = {
      ...sample(),
      sheets: [...sample().sheets, { id: 's2', levelId: 'l1', projectUuid: 'u-2', pageIndex: 0, displayName: 'Plan p1 b', location: { fileName: 'b.pdf' } }],
    };
    expect(unwrap(relinkSheet(file, 's2', { fileName: 'plan.pdf' }, null)).sheets[2]!.projectUuid).toBeNull();
    expect(unwrap(relinkSheet(file, 's2', { fileName: 'plan.pdf' })).sheets[2]!.projectUuid).toBe('u-2');
  });

  it('does not refuse a sheet relinked to its own projectUuid and page', () => {
    expect(unwrap(relinkSheet(sample(), 's0', { fileName: 'plan.pdf' }, 'u-1')).sheets[0]!.projectUuid).toBe('u-1');
  });

  it('sorts levels by elevation', () => {
    const file: BuildingFile = {
      ...emptyBuilding('b-1', 'Tower'),
      levels: [
        { id: 'a', name: 'A', elevationMm: 3000 },
        { id: 'b', name: 'B', elevationMm: 0 },
        { id: 'c', name: 'C', elevationMm: -3000 },
      ],
    };
    expect(sortLevelsByElevation(file).levels.map((level) => level.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps the order of levels with equal elevation', () => {
    const file: BuildingFile = {
      ...emptyBuilding('b-1', 'Tower'),
      levels: [
        { id: 'x', name: 'X', elevationMm: 0 },
        { id: 'y', name: 'Y', elevationMm: 3000 },
        { id: 'z', name: 'Z', elevationMm: 0 },
      ],
    };
    expect(sortLevelsByElevation(file).levels.map((level) => level.id)).toEqual(['x', 'z', 'y']);
  });

  it('keeps a file valid after a sequence of edits', () => {
    let file = addLevel(sample(), 'Roof', 9000, 'l2');
    const added = addSheets(file, 'l2', [page(0), page(1)]);
    if (!added.ok) throw new Error('add failed');
    file = moveSheet(added.file, added.file.sheets[2]!.id, 'l1');
    file = moveLevel(file, 'l2', 0);
    file = setLevelElevation(file, 'l1', -200);
    file = renameLevel(file, 'l0', 'Cellar');
    file = sortLevelsByElevation(file);
    file = unwrap(relinkSheet(file, 's0', { fileName: 'plan.pdf', path: '/c/plan.pdf' }));
    expect(() => parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).not.toThrow();
    expect(parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).toEqual(file);
  });
});
