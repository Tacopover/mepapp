import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from './building.js';
import { duplicateVerdict, findSheets, withMovedLocation, withProjectUuid } from './building-identity.js';

function sheet(id: string, projectUuid: string | null, pageIndex: number, location: BuildingSheet['location']): BuildingSheet {
  return { id, levelId: 'l0', projectUuid, pageIndex, displayName: id, location };
}

function sample(): BuildingFile {
  return {
    ...emptyBuilding('b', 'B'),
    levels: [{ id: 'l0', name: 'Ground', elevationMm: 0 }],
    sheets: [
      sheet('weak', null, 0, { fileName: 'plan.pdf', sizeBytes: 100 }),
      sheet('path', null, 0, { fileName: 'other.pdf', path: 'C:\\Proj\\Plan.pdf', sizeBytes: 5 }),
      sheet('id-p1', 'u-1', 0, { fileName: 'plan.pdf', path: '/old/plan.pdf', sizeBytes: 100 }),
      sheet('id-p2', 'u-1', 1, { fileName: 'plan.pdf', path: '/old/plan.pdf', sizeBytes: 100 }),
      sheet('other-id', 'u-2', 0, { fileName: 'plan.pdf', path: 'c:/proj/plan.pdf', sizeBytes: 100 }),
    ],
  };
}

describe('findSheets', () => {
  it('matches by id first, then path, then file name with size', () => {
    const result = findSheets(sample(), { projectUuid: 'u-1', path: 'C:/proj/plan.pdf', fileName: 'plan.pdf', sizeBytes: 100 });
    expect(result.map((m) => [m.sheet.id, m.strength])).toEqual([
      ['id-p1', 'id'],
      ['id-p2', 'id'],
      ['path', 'path'],
      ['weak', 'weak'],
    ]);
  });

  it('matches by path with no id, ignoring case and slash style', () => {
    const result = findSheets(sample(), { projectUuid: null, path: 'c:/proj/plan.pdf', fileName: 'x.pdf', sizeBytes: 1 });
    expect(result.map((m) => [m.sheet.id, m.strength])).toEqual([
      ['path', 'path'],
      ['other-id', 'path'],
    ]);
  });

  it('matches weakly by file name and size, after the stronger matches', () => {
    const result = findSheets(sample(), { projectUuid: null, path: '/old/plan.pdf', fileName: 'plan.pdf', sizeBytes: 100 });
    expect(result.map((m) => [m.sheet.id, m.strength])).toEqual([
      ['id-p1', 'path'],
      ['id-p2', 'path'],
      ['weak', 'weak'],
      ['other-id', 'weak'],
    ]);
  });

  it('does not match a sheet with another id by path or size', () => {
    const result = findSheets(sample(), { projectUuid: 'u-3', path: '/old/plan.pdf', fileName: 'plan.pdf', sizeBytes: 100 });
    expect(result.map((m) => m.sheet.id)).toEqual(['weak']);
  });

  it('returns nothing when nothing matches', () => {
    expect(findSheets(sample(), { projectUuid: null, fileName: 'zzz.pdf', sizeBytes: 1 })).toEqual([]);
  });
});

describe('duplicateVerdict', () => {
  const base = { openPath: '/new/a.pdf', storedPath: '/old/a.pdf', storedState: 'ok' as const, sameSizeAndTime: false };

  it('is none when nothing is stored', () => {
    expect(duplicateVerdict({ ...base, storedPath: undefined })).toBe('none');
  });

  it('is none for the same path in another spelling', () => {
    expect(duplicateVerdict({ ...base, openPath: 'C:\\Proj\\A.pdf', storedPath: 'c:/proj/a.pdf' })).toBe('none');
  });

  it('is moved when the stored file is gone', () => {
    expect(duplicateVerdict({ ...base, storedState: 'missing' })).toBe('moved');
  });

  it('is unclear, never moved, when the app has no access to the stored file', () => {
    expect(duplicateVerdict({ ...base, storedState: 'no-access' })).toBe('unclear');
  });

  it('is copy when both files exist and differ', () => {
    expect(duplicateVerdict(base)).toBe('copy');
  });

  it('is unclear when both files exist with the same size and time', () => {
    expect(duplicateVerdict({ ...base, sameSizeAndTime: true })).toBe('unclear');
  });

  it('is unclear when the open document has no path', () => {
    expect(duplicateVerdict({ ...base, openPath: undefined })).toBe('unclear');
  });
});

describe('withProjectUuid', () => {
  it('sets the id on one sheet and does not change the input', () => {
    const file = sample();
    const next = withProjectUuid(file, 'weak', 'u-9');
    expect(next.sheets.find((s) => s.id === 'weak')!.projectUuid).toBe('u-9');
    expect(next.sheets.find((s) => s.id === 'path')!.projectUuid).toBeNull();
    expect(file.sheets[0]!.projectUuid).toBeNull();
  });

  it('returns the same file for an unknown sheet', () => {
    const file = sample();
    expect(withProjectUuid(file, 'nope', 'u-9')).toBe(file);
  });
});

describe('withMovedLocation', () => {
  it('moves every sheet of the document and keeps the other fields of the location', () => {
    const file = sample();
    const next = withMovedLocation(file, 'u-1', { fileName: 'plan.pdf', path: '/new/plan.pdf' });
    for (const id of ['id-p1', 'id-p2']) {
      expect(next.sheets.find((s) => s.id === id)!.location).toEqual({ fileName: 'plan.pdf', path: '/new/plan.pdf', sizeBytes: 100 });
    }
    expect(next.sheets.find((s) => s.id === 'other-id')!.location.path).toBe('c:/proj/plan.pdf');
    expect(file.sheets[2]!.location.path).toBe('/old/plan.pdf');
  });

  it('returns the same file when no sheet has the id', () => {
    const file = sample();
    expect(withMovedLocation(file, 'u-404', { fileName: 'x.pdf' })).toBe(file);
  });
});
