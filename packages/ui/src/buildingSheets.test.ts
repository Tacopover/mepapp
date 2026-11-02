import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import {
  COLLAPSE_AFTER_PAGES,
  groupPdfs,
  isSamePdf,
  newSheetPage,
  pdfGroupKey,
  pdfTotals,
  relinkWouldDuplicate,
  sheetDisplayName,
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

describe('pdfTotals', () => {
  it('counts the pending pages and the assigned pages, and the pages of a sheets-only PDF as assigned', () => {
    const groups = groupPdfs(
      buildingOf([sheetOf('s1', 1, 'a.pdf', { path: 'C:/a.pdf' }), sheetOf('s2', 0, 'b.pdf', { path: 'C:/b.pdf' }), sheetOf('s3', 1, 'b.pdf', { path: 'C:/b.pdf' })]),
      [pendingOf({ fileName: 'a.pdf', path: 'C:/a.pdf', pageCount: 3 })],
    );
    expect(pdfTotals(groups)).toEqual({ pdfs: 2, pages: 5, assigned: 3 });
  });

  it('returns zeros for no groups', () => {
    expect(pdfTotals([])).toEqual({ pdfs: 0, pages: 0, assigned: 0 });
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
