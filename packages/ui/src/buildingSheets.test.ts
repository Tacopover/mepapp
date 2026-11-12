import { describe, expect, it } from 'vitest';
import { emptyBuilding, removeSheet, type BuildingFile, type BuildingSheet, type Riser } from '@mepapp/core';
import {
  addResultText,
  alreadyAssignedText,
  COLLAPSE_AFTER_PAGES,
  groupPdfs,
  isSamePdf,
  newSheetPage,
  pdfGroupKey,
  placeEntriesOnLevel,
  relinkWouldDuplicate,
  resolveEntryIds,
  sheetDisplayName,
  sheetGroupsOfLevel,
  sheetPdfKey,
  sheetRemoveRefusal,
  sheetsOfSamePdf,
  type PendingPdf,
} from './buildingSheets.js';

const sheetOf = (id: string, pageIndex: number, fileName: string, options: { projectUuid?: string | null; path?: string; sizeBytes?: number } = {}): BuildingSheet => ({
  id,
  levelId: 'L1',
  projectUuid: options.projectUuid ?? null,
  pageIndex,
  displayName: `Sheet ${id}`,
  location: { fileName, path: options.path, sizeBytes: options.sizeBytes },
});

const buildingOf = (sheets: BuildingSheet[]): BuildingFile => ({ ...emptyBuilding('b1', 'Block'), sheets });

const pendingOf = (overrides: Partial<PendingPdf> & Pick<PendingPdf, 'fileName' | 'pageCount'>): PendingPdf => ({
  sizeBytes: 1000,
  projectUuid: null,
  ...overrides,
});

describe('pdfGroupKey', () => {
  it('prefers the project id', () => {
    expect(pdfGroupKey('uuid-a', 'C:/a.pdf', 'a.pdf')).toBe('u:uuid-a');
  });

  it('uses the path when the id is unknown', () => {
    expect(pdfGroupKey(null, 'C:/a.pdf', 'a.pdf')).toBe('p:C:/a.pdf');
  });

  it('uses the file name when the id and the path are unknown', () => {
    expect(pdfGroupKey(null, undefined, 'a.pdf')).toBe('f:a.pdf');
  });
});

describe('groupPdfs', () => {
  it('puts a pending PDF with 3 pages and a sheet on page index 1 into 3 rows with the sheet on row 1', () => {
    const sheet = sheetOf('s1', 1, 'a.pdf', { path: 'C:/a.pdf' });
    const groups = groupPdfs(buildingOf([sheet]), [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 3 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pending).toBe(true);
    expect(groups[0]!.pageCount).toBe(3);
    expect(groups[0]!.rows.map((row) => row.pageIndex)).toEqual([0, 1, 2]);
    expect(groups[0]!.rows.map((row) => row.sheet?.id ?? null)).toEqual([null, 's1', null]);
  });

  it('gives a sheets-only PDF one row per sheet, sorted by pageIndex, with pageCount = highest pageIndex + 1', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s2', 2, 'b.pdf', { path: 'C:/b.pdf' }), sheetOf('s1', 0, 'b.pdf', { path: 'C:/b.pdf' })]),
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pending).toBe(false);
    expect(groups[0]!.pageCount).toBe(3);
    expect(groups[0]!.rows.map((row) => row.sheet?.id)).toEqual(['s1', 's2']);
    expect(groups[0]!.rows.map((row) => row.pageIndex)).toEqual([0, 2]);
  });

  it('lists the pending PDFs first, then the sheets-only PDFs in the order of their first sheet', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s1', 0, 'x.pdf', { path: 'C:/x.pdf' }), sheetOf('s2', 0, 'y.pdf', { path: 'C:/y.pdf' })]),
      [pendingOf({ fileName: 'p.pdf', path: 'C:/p.pdf', pageCount: 1 })],
    );
    expect(groups.map((group) => group.fileName)).toEqual(['p.pdf', 'x.pdf', 'y.pdf']);
    expect(groups.map((group) => group.pending)).toEqual([true, false, false]);
  });

  it('joins a sheet to the pending PDF with the same project id even when the path differs', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'uuid-a', path: 'D:/moved/a.pdf' })]),
      [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 2, projectUuid: 'uuid-a' })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pending).toBe(true);
    expect(groups[0]!.rows[0]!.sheet?.id).toBe('s1');
  });

  it('keeps the pending PDF and a sheet with the same path as one group when there is no id', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' })]),
      [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 1 })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows[0]!.sheet?.id).toBe('s1');
  });

  it('keeps the first of two pending entries with the same key', () => {
    const groups = groupPdfs(buildingOf([]), [
      pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 2 }),
      pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 5 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pageCount).toBe(2);
    expect(groups[0]!.rows).toHaveLength(2);
  });

  it('does not show a sheet whose pageIndex is beyond the pending pageCount', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s1', 5, 'a.pdf', { path: 'C:/a.pdf' })]),
      [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 2 })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((row) => row.pageIndex)).toEqual([0, 1]);
    expect(groups[0]!.rows.every((row) => row.sheet === null)).toBe(true);
  });

  it('keys a sheet with no project id and no path by its file name', () => {
    const groups = groupPdfs(buildingOf([sheetOf('s1', 0, 'a.pdf')]), []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('f:a.pdf');
  });

  it('marks collapsedByDefault false at 20 pages and true at 21', () => {
    const at20 = groupPdfs(buildingOf([]), [pendingOf({ fileName: 'a.pdf', pageCount: COLLAPSE_AFTER_PAGES })]);
    const at21 = groupPdfs(buildingOf([]), [pendingOf({ fileName: 'b.pdf', pageCount: COLLAPSE_AFTER_PAGES + 1 })]);
    expect(at20[0]!.collapsedByDefault).toBe(false);
    expect(at21[0]!.collapsedByDefault).toBe(true);
  });
});

describe('pdfGroupKey and isSamePdf', () => {
  it('treats two pending entries with the same id as the same PDF', () => {
    expect(isSamePdf(pendingOf({ fileName: 'a.pdf', pageCount: 1, projectUuid: 'u1' }), pendingOf({ fileName: 'other.pdf', pageCount: 2, projectUuid: 'u1' }))).toBe(true);
  });

  it('treats two entries with different paths and no id as different PDFs', () => {
    expect(isSamePdf(pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 1 }), pendingOf({ fileName: 'a.pdf', path: 'D:/a.pdf', pageCount: 1 }))).toBe(false);
  });
});

describe('newSheetPage', () => {
  it('leaves out path and sizeBytes when they are undefined', () => {
    const [group] = groupPdfs(buildingOf([sheetOf('s1', 0, 'A101.pdf', { projectUuid: 'u1' })]), []);
    const page = newSheetPage(group!, 0);
    expect(page).toEqual({ projectUuid: 'u1', pageIndex: 0, displayName: 'A101.pdf', location: { fileName: 'A101.pdf' } });
    expect('path' in page.location).toBe(false);
    expect('sizeBytes' in page.location).toBe(false);
  });

  it('copies path and sizeBytes when they are defined, with the multi-page display name', () => {
    const [group] = groupPdfs(buildingOf([]), [pendingOf({ fileName: 'A101.pdf', path: 'C:/A101.pdf', sizeBytes: 2048, pageCount: 3 })]);
    expect(newSheetPage(group!, 1)).toEqual({
      projectUuid: null,
      pageIndex: 1,
      displayName: 'A101.pdf p2',
      location: { fileName: 'A101.pdf', path: 'C:/A101.pdf', sizeBytes: 2048 },
    });
  });
});

describe('sheetDisplayName', () => {
  it('returns the file name for a single-page PDF', () => {
    expect(sheetDisplayName('A101.pdf', 0, 1)).toBe('A101.pdf');
  });

  it('adds the page number for a multi-page PDF', () => {
    expect(sheetDisplayName('A101.pdf', 1, 3)).toBe('A101.pdf p2');
  });
});

describe('relinkWouldDuplicate', () => {
  it('returns false when the document id is undefined or null', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 0, 'b.pdf')]);
    expect(relinkWouldDuplicate(file, ['s2'], undefined)).toBe(false);
    expect(relinkWouldDuplicate(file, ['s2'], null)).toBe(false);
  });

  it('returns true when a sheet outside the set has the id and the same page', () => {
    const file = buildingOf([sheetOf('s1', 2, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 2, 'b.pdf')]);
    expect(relinkWouldDuplicate(file, ['s2'], 'u1')).toBe(true);
  });

  it('returns false when a sheet outside the set has the id but another page', () => {
    const file = buildingOf([sheetOf('s1', 1, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 2, 'b.pdf')]);
    expect(relinkWouldDuplicate(file, ['s2'], 'u1')).toBe(false);
  });

  it('returns true when two sheets of the relinked set share a page index', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf'), sheetOf('s2', 0, 'a.pdf', { path: 'C:/a.pdf' }), sheetOf('s3', 1, 'b.pdf')]);
    expect(relinkWouldDuplicate(file, ['s1', 's2'], 'u1')).toBe(true);
  });

  it('does not count a sheet that already has the id and is in the set against itself', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 1, 'b.pdf')]);
    expect(relinkWouldDuplicate(file, ['s1'], 'u1')).toBe(false);
  });
});

const twoLevels = (sheets: BuildingSheet[]): BuildingFile => ({
  ...emptyBuilding('b1', 'Block'),
  levels: [
    { id: 'L1', name: 'Ground', elevationMm: 0 },
    { id: 'L2', name: 'First', elevationMm: 3000 },
  ],
  sheets,
});

describe('sheetPdfKey', () => {
  it('gives the key of the project id when the sheet has one', () => {
    expect(sheetPdfKey(sheetOf('s1', 0, 'a.pdf', { projectUuid: 'uuid-a', path: 'C:/a.pdf' }))).toBe('u:uuid-a');
  });

  it('gives the key of the path when the sheet has no project id', () => {
    expect(sheetPdfKey(sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }))).toBe('p:C:/a.pdf');
  });
});

describe('sheetGroupsOfLevel', () => {
  it('gives only the sheets of the level', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
      { ...sheetOf('s2', 0, 'b.pdf', { path: 'C:/b.pdf' }), levelId: 'L2' },
    ]);
    const groups = sheetGroupsOfLevel(file, 'L2');
    expect(groups.map((group) => group.sheets.map((sheet) => sheet.id))).toEqual([['s2']]);
  });

  it('splits a 2-page PDF over two levels into one group per level', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
      { ...sheetOf('s2', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' },
    ]);
    expect(sheetGroupsOfLevel(file, 'L1').map((group) => group.sheets.map((sheet) => sheet.id))).toEqual([['s1']]);
    expect(sheetGroupsOfLevel(file, 'L2').map((group) => group.sheets.map((sheet) => sheet.id))).toEqual([['s2']]);
  });

  it('keeps the sheets of one PDF next to each other on a level', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
      { ...sheetOf('s2', 0, 'b.pdf', { path: 'C:/b.pdf' }), levelId: 'L1' },
      { ...sheetOf('s3', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
    ]);
    const groups = sheetGroupsOfLevel(file, 'L1');
    expect(groups.map((group) => group.key)).toEqual(['p:C:/a.pdf', 'p:C:/b.pdf']);
    expect(groups[0]!.sheets.map((sheet) => sheet.id)).toEqual(['s1', 's3']);
  });

  it('orders the sheets of a PDF on a level by page, not by the order they were added', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 2, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
      { ...sheetOf('s2', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
      { ...sheetOf('s3', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' },
    ]);
    expect(sheetGroupsOfLevel(file, 'L1')[0]!.sheets.map((sheet) => sheet.id)).toEqual(['s2', 's3', 's1']);
  });

  it('gives all sheets for a null level, in the level order of the file', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' },
      { ...sheetOf('s2', 0, 'b.pdf', { path: 'C:/b.pdf' }), levelId: 'L1' },
    ]);
    const groups = sheetGroupsOfLevel(file, null);
    expect(groups.map((group) => group.sheets.map((sheet) => sheet.id))).toEqual([['s2'], ['s1']]);
  });

  it('gives the sheets of an unknown level last for a null level', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L9' },
      { ...sheetOf('s2', 0, 'b.pdf', { path: 'C:/b.pdf' }), levelId: 'L2' },
    ]);
    const groups = sheetGroupsOfLevel(file, null);
    expect(groups.map((group) => group.sheets.map((sheet) => sheet.id))).toEqual([['s2'], ['s1']]);
  });

  it('gives no groups when the file has no sheets', () => {
    expect(sheetGroupsOfLevel(twoLevels([]), null)).toEqual([]);
    expect(sheetGroupsOfLevel(twoLevels([]), 'L1')).toEqual([]);
  });
});

describe('sheetsOfSamePdf', () => {
  it('gives the sheets of the same PDF on every level, including the sheet itself', () => {
    const first = { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' };
    const file = twoLevels([
      first,
      { ...sheetOf('s2', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' },
      { ...sheetOf('s3', 0, 'b.pdf', { path: 'C:/b.pdf' }), levelId: 'L1' },
    ]);
    expect(sheetsOfSamePdf(file, first).map((sheet) => sheet.id)).toEqual(['s1', 's2']);
  });

  it('gives only the sheet itself when no other sheet shares its PDF', () => {
    const only = sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' });
    expect(sheetsOfSamePdf(twoLevels([only]), only).map((sheet) => sheet.id)).toEqual(['s1']);
  });
});

describe('placeEntriesOnLevel', () => {
  it('puts every page of a new PDF on the level', () => {
    const file = twoLevels([]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'c.pdf', path: 'C:/c.pdf', pageCount: 3 })], 'L1');
    expect(result.placed).toBe(3);
    expect(result.already).toBe(0);
    expect(result.file.sheets.map((sheet) => sheet.levelId)).toEqual(['L1', 'L1', 'L1']);
  });

  it('mints one id for all pages of a PDF without an id and flags the new sheets', () => {
    const result = placeEntriesOnLevel(twoLevels([]), [pendingOf({ fileName: 'n.pdf', path: 'C:/n.pdf', pageCount: 3 })], 'L1', () => 'mint-1');
    expect(result.placed).toBe(3);
    expect(result.file.sheets.map((sheet) => sheet.projectUuid)).toEqual(['mint-1', 'mint-1', 'mint-1']);
    expect(result.file.sheets.every((sheet) => sheet.idMinted === true)).toBe(true);
  });

  it('a second add of the same PDF reuses the minted id and counts its pages as already on the level', () => {
    const first = placeEntriesOnLevel(twoLevels([]), [pendingOf({ fileName: 'n.pdf', path: 'C:/n.pdf', pageCount: 3 })], 'L1', () => 'mint-1');
    const second = placeEntriesOnLevel(first.file, [pendingOf({ fileName: 'n.pdf', path: 'C:/n.pdf', pageCount: 3 })], 'L1', () => 'mint-2');
    expect(second.placed).toBe(0);
    expect(second.sameLevel).toBe(3);
    expect(second.file.sheets).toHaveLength(3);
    expect(second.file.sheets.every((sheet) => sheet.projectUuid === 'mint-1')).toBe(true);
  });

  it('gives two different PDFs two different minted ids', () => {
    const ids = ['mint-a', 'mint-b'];
    const result = placeEntriesOnLevel(
      twoLevels([]),
      [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 1 }), pendingOf({ fileName: 'b.pdf', path: 'C:/b.pdf', pageCount: 1 })],
      'L1',
      () => ids.shift()!,
    );
    expect(result.file.sheets.map((sheet) => sheet.projectUuid)).toEqual(['mint-a', 'mint-b']);
  });

  it('does not give an id to an old sheet with no id, and keeps the entry unlinked', () => {
    let calls = 0;
    const file = buildingOf([sheetOf('s1', 0, 'old.pdf', { path: 'C:/old.pdf' })]);
    const resolved = resolveEntryIds(file, [pendingOf({ fileName: 'old.pdf', path: 'C:/old.pdf', pageCount: 1 })], () => {
      calls += 1;
      return 'mint-x';
    });
    expect(calls).toBe(0);
    expect(resolved.entries[0]!.projectUuid).toBeNull();
    expect(resolved.entries[0]).not.toHaveProperty('idMinted');
  });

  it('the id in the PDF replaces a minted id of the same document', () => {
    const minted = { ...sheetOf('s1', 0, 'e.pdf', { projectUuid: 'mint-1', path: 'C:/e.pdf' }), idMinted: true as const };
    const resolved = resolveEntryIds(buildingOf([minted]), [pendingOf({ fileName: 'e.pdf', path: 'C:/e.pdf', pageCount: 1, projectUuid: 'real-1' })], () => 'unused');
    expect(resolved.file.sheets[0]!.projectUuid).toBe('real-1');
    expect(resolved.file.sheets[0]).not.toHaveProperty('idMinted');
    expect(resolved.entries[0]!.projectUuid).toBe('real-1');
  });

  it('a PDF with an id in the file is unchanged and gets no flag', () => {
    let calls = 0;
    const entry = pendingOf({ fileName: 'f.pdf', path: 'C:/f.pdf', pageCount: 1, projectUuid: 'real-2' });
    const resolved = resolveEntryIds(buildingOf([]), [entry], () => {
      calls += 1;
      return 'mint-y';
    });
    expect(calls).toBe(0);
    expect(resolved.entries).toEqual([entry]);
    expect(resolved.entries[0]).not.toHaveProperty('idMinted');
  });

  it('counts the pages that are already sheets on another level and leaves them where they are', () => {
    const old = { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' };
    const file = twoLevels([old]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 3 })], 'L1');
    expect(result.placed).toBe(2);
    expect(result.already).toBe(1);
    expect(result.sameLevel).toBe(0);
    expect(result.elsewhere).toEqual([{ levelName: 'First', count: 1 }]);
    expect(result.file.sheets.find((sheet) => sheet.id === 's1')).toEqual(old);
  });

  it('counts the pages that are already sheets on the target level as same level', () => {
    const old = { ...sheetOf('s1', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L1' };
    const file = twoLevels([old]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 3 })], 'L1');
    expect(result.placed).toBe(2);
    expect(result.already).toBe(1);
    expect(result.sameLevel).toBe(1);
    expect(result.elsewhere).toEqual([]);
  });

  it('groups the elsewhere pages by level in order of first appearance and names an unknown level', () => {
    const file = twoLevels([
      { ...sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' },
      { ...sheetOf('s2', 1, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L9' },
      { ...sheetOf('s3', 2, 'a.pdf', { path: 'C:/a.pdf' }), levelId: 'L2' },
    ]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 4 })], 'L1');
    expect(result.placed).toBe(1);
    expect(result.already).toBe(3);
    expect(result.elsewhere).toEqual([
      { levelName: 'First', count: 2 },
      { levelName: 'another level', count: 1 },
    ]);
  });

  it('changes nothing for an unknown level', () => {
    const file = twoLevels([]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'c.pdf', path: 'C:/c.pdf', pageCount: 2 })], 'missing');
    expect(result).toEqual({ file, placed: 0, already: 0, sameLevel: 0, elsewhere: [] });
  });

  it('names the new sheets from the PDF', () => {
    const file = twoLevels([]);
    const result = placeEntriesOnLevel(file, [pendingOf({ fileName: 'c.pdf', path: 'C:/c.pdf', pageCount: 2 })], 'L1');
    expect(result.file.sheets[1]?.displayName).toBe('c.pdf p2');
    expect(result.file.sheets[1]?.location.fileName).toBe('c.pdf');
  });
});

describe('alreadyAssignedText', () => {
  it('gives an empty text when nothing was already assigned', () => {
    expect(alreadyAssignedText(0, [])).toBe('');
  });

  it('names the other level in the plural and the singular', () => {
    expect(alreadyAssignedText(0, [{ levelName: 'Level 1', count: 2 }])).toBe('2 pages are already on Level 1 and were not moved.');
    expect(alreadyAssignedText(0, [{ levelName: 'Level 1', count: 1 }])).toBe('1 page is already on Level 1 and was not moved.');
  });

  it('names the same level in the plural and the singular', () => {
    expect(alreadyAssignedText(3, [])).toBe('3 pages are already on this level.');
    expect(alreadyAssignedText(1, [])).toBe('1 page is already on this level.');
  });

  it('puts the other levels first, one sentence each', () => {
    expect(
      alreadyAssignedText(1, [
        { levelName: 'Level 1', count: 2 },
        { levelName: 'Roof', count: 1 },
      ]),
    ).toBe('2 pages are already on Level 1 and were not moved. 1 page is already on Roof and was not moved. 1 page is already on this level.');
  });
});

describe('addResultText', () => {
  const none = { sameLevel: 0, elsewhere: [] };

  it('names the count of added pages and the level', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 3, pdfCount: 1, ...none })).toBe('Added 3 pages to Ground floor.');
  });

  it('adds the already-assigned sentence after a placed count', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 1, pdfCount: 1, sameLevel: 0, elsewhere: [{ levelName: 'Level 1', count: 2 }] })).toBe(
      'Added 1 page to Ground floor. 2 pages are already on Level 1 and were not moved.',
    );
  });

  it('says nothing was added when no page was placed', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 0, pdfCount: 1, sameLevel: 0, elsewhere: [{ levelName: 'Level 1', count: 2 }] })).toBe(
      'Nothing added. 2 pages are already on Level 1 and were not moved.',
    );
  });

  it('names the folder and the PDF count when a source is given', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 5, pdfCount: 2, source: 'Plans', ...none })).toBe(
      'Added 5 pages from Plans (2 PDFs) to Ground floor.',
    );
  });

  it('names the PDF count when several PDFs were picked without a source', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 5, pdfCount: 2, ...none })).toBe('Added 5 pages (2 PDFs) to Ground floor.');
  });

  it('leaves out the PDF count when some pages were already assigned, with a source', () => {
    expect(
      addResultText({ levelName: 'Level 1', placed: 1, pdfCount: 1, source: 'Plans', sameLevel: 0, elsewhere: [{ levelName: 'First', count: 1 }] }),
    ).toBe('Added 1 page from Plans to Level 1. 1 page is already on First and was not moved.');
  });

  it('leaves out the PDF count when some pages were already assigned, without a source', () => {
    expect(addResultText({ levelName: 'Level 1', placed: 5, pdfCount: 2, sameLevel: 1, elsewhere: [] })).toBe(
      'Added 5 pages to Level 1. 1 page is already on this level.',
    );
  });

  it('keeps the PDF count when the picked pages were all new', () => {
    expect(addResultText({ levelName: 'Level 1', placed: 1, pdfCount: 1, source: 'Plans', ...none })).toBe('Added 1 page from Plans (1 PDF) to Level 1.');
  });

  it('counts the duplicates that were skipped in the singular and the plural', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 1, pdfCount: 1, skippedDuplicates: 1, ...none })).toBe(
      'Added 1 page to Ground floor. 1 PDF was picked twice and skipped.',
    );
    expect(addResultText({ levelName: 'Ground floor', placed: 1, pdfCount: 1, skippedDuplicates: 2, ...none })).toBe(
      'Added 1 page to Ground floor. 2 PDFs were picked twice and skipped.',
    );
  });

  it('names the files that could not be read', () => {
    expect(addResultText({ levelName: 'Ground floor', placed: 1, pdfCount: 1, failed: ['x.pdf'], ...none })).toBe(
      'Added 1 page to Ground floor. Could not read x.pdf.',
    );
  });
});

const riserWith = (name: string, sheetId: string): Riser => ({
  id: `r-${name}`,
  name,
  networkTypeId: 'vent',
  networkType: { id: 'vent', name: 'Supply', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#2196f3', lineWidthPt: 1, linePattern: 'solid' },
  anchorMm: { xMm: 0, yMm: 0 },
  flow: 'down',
  topEnd: 'member',
  bottomEnd: 'member',
  endAllowanceMm: 0,
  members: [{ levelId: 'L1', sheetId, pageIndex: 0, fittingId: `f-${sheetId}` }],
  pending: [],
});

describe('sheetRemoveRefusal', () => {
  const oneLevel = (sheets: BuildingSheet[], risers: Riser[]): BuildingFile => ({
    ...buildingOf(sheets),
    levels: [{ id: 'L1', name: 'Ground', elevationMm: 0 }],
    risers,
  });
  const sheetA = sheetOf('A', 0, 'a.pdf', { projectUuid: 'u-a' });
  const sheetB = sheetOf('B', 0, 'b.pdf', { projectUuid: 'u-b' });

  it('names the riser that uses the sheet and lets the other sheet go', () => {
    const file = oneLevel([sheetA, sheetB], [riserWith('R1', 'A')]);
    expect(sheetRemoveRefusal(file, 'A')).toBe('Detach R1 first.');
    expect(sheetRemoveRefusal(file, 'B')).toBeNull();
    expect(removeSheet(file, 'B').sheets.map((sheet) => sheet.id)).toEqual(['A']);
    expect(removeSheet(file, 'A')).toBe(file);
  });

  it('allows the removal once the riser has no member', () => {
    const file = oneLevel([sheetA, sheetB], []);
    expect(sheetRemoveRefusal(file, 'A')).toBeNull();
    expect(removeSheet(file, 'A').sheets.map((sheet) => sheet.id)).toEqual(['B']);
  });

  it('names both risers joined by and when two risers use the sheet', () => {
    const file = oneLevel([sheetA, sheetB], [riserWith('R1', 'A'), riserWith('R2', 'A')]);
    expect(sheetRemoveRefusal(file, 'A')).toBe('Detach R1 and R2 first.');
  });
});
