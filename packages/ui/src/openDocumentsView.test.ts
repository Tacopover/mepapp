import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { DocumentSummary } from '@mepapp/render';
import type { FileTarget } from '@mepapp/platform';
import { openDocumentRows, openedSheetIds } from './openDocumentsView.js';

const sheetOf = (id: string, pageIndex: number, fileName: string, options: { projectUuid?: string | null; path?: string; sizeBytes?: number; levelId?: string } = {}): BuildingSheet => ({
  id,
  levelId: options.levelId ?? 'L1',
  projectUuid: options.projectUuid ?? null,
  pageIndex,
  displayName: `Sheet ${id}`,
  location: { fileName, path: options.path, sizeBytes: options.sizeBytes },
});

const buildingOf = (sheets: BuildingSheet[]): BuildingFile => ({
  ...emptyBuilding('b1', 'Block'),
  levels: [{ id: 'L1', name: 'Ground', elevationMm: 0 }],
  sheets,
});

const docOf = (overrides: Partial<DocumentSummary> & Pick<DocumentSummary, 'id' | 'fileName'>): DocumentSummary => ({
  isDirty: false,
  hasPdf: true,
  projectUuid: null,
  projectUuidInFile: false,
  pageCount: 1,
  sizeBytes: 1000,
  ...overrides,
});

const NO_ACTIVE = { documentId: null, pageIndex: null };

describe('openDocumentRows', () => {
  it('reports placed when all pages match a sheet by id', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 1, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s3', 2, 'a.pdf', { projectUuid: 'u1' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
    expect(row!.pages.map((page) => page.sheet?.id)).toEqual(['s1', 's2', 's3']);
  });

  it('reports partly when 2 of 3 pages have a sheet', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' }), sheetOf('s2', 2, 'a.pdf', { projectUuid: 'u1' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('partly');
    expect(row!.pages.map((page) => page.sheet?.id ?? null)).toEqual(['s1', null, 's2']);
  });

  it('reports not-placed when no sheet matches', () => {
    const file = buildingOf([sheetOf('s1', 0, 'other.pdf', { projectUuid: 'u9' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1' })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
    expect(row!.pages.every((page) => page.sheet === null)).toBe(true);
  });

  it('reports not-placed and no sheet when there is no building', () => {
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', pageCount: 2 })], new Map(), null, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
    expect(row!.pages.map((page) => page.sheet)).toEqual([null, null]);
    expect(row!.pages.map((page) => page.levelName)).toEqual([null, null]);
  });

  it('matches a document with no id by its path', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { path: 'C:/plans/a.pdf' })]);
    const targets = new Map<string, FileTarget>([['d1', { name: 'a.pdf', path: 'C:/plans/a.pdf' }]]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf' })], targets, file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
    expect(row!.pages[0]!.sheet?.id).toBe('s1');
  });

  it('makes the path match case and backslash tolerant', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { path: 'c:/plans/a.pdf' })]);
    const targets = new Map<string, FileTarget>([['d1', { name: 'a.pdf', path: 'C:\\Plans\\A.pdf' }]]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf' })], targets, file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
  });

  it('matches by file name and size when the path is unset', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { sizeBytes: 1000 })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', sizeBytes: 1000 })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
  });

  it('refuses a name and size match when the document path differs from the stored path', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { path: 'C:/a.pdf', sizeBytes: 1000 })]);
    const targets = new Map<string, FileTarget>([['d1', { name: 'a.pdf', path: 'D:/other/a.pdf' }]]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', sizeBytes: 1000 })], targets, file, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
  });

  it('reports not-placed for a document with no id, no path and no size', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { sizeBytes: 1000 })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', sizeBytes: null })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
  });

  it('never matches two different ids, even when the name matches', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1', sizeBytes: 1000 })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u2', projectUuidInFile: true, sizeBytes: 1000 })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
  });

  it('fills levelName from the level of the sheet, and null when the level is unknown', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1', levelId: 'L1' }), sheetOf('s2', 1, 'a.pdf', { projectUuid: 'u1', levelId: 'LX' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 2 })], new Map(), file, NO_ACTIVE);
    expect(row!.pages.map((page) => page.levelName)).toEqual(['Ground', null]);
  });

  it('gives a 1-page document the plain file name and a 3-page document the page numbers', () => {
    const rows = openDocumentRows(
      [docOf({ id: 'd1', fileName: 'A101.pdf', pageCount: 1 }), docOf({ id: 'd2', fileName: 'A102.pdf', pageCount: 3 })],
      new Map(),
      null,
      NO_ACTIVE,
    );
    expect(rows[0]!.displayName).toBe('A101.pdf');
    expect(rows[0]!.pages[0]!.displayName).toBe('A101.pdf');
    expect(rows[1]!.displayName).toBe('A102.pdf');
    expect(rows[1]!.pages.map((page) => page.displayName)).toEqual(['A102.pdf p1', 'A102.pdf p2', 'A102.pdf p3']);
  });

  it('sets needsSave true when the document has no id and false when it has one', () => {
    const rows = openDocumentRows(
      [docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: null }), docOf({ id: 'd2', fileName: 'b.pdf', projectUuid: 'u2', projectUuidInFile: true })],
      new Map(),
      null,
      NO_ACTIVE,
    );
    expect(rows.map((row) => row.needsSave)).toEqual([true, false]);
  });

  it('reads the path from the targets by document id', () => {
    const targets = new Map<string, FileTarget>([
      ['d1', { name: 'a.pdf', path: 'C:/a.pdf' }],
      ['d2', { name: 'b.pdf' }],
    ]);
    const rows = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf' }), docOf({ id: 'd2', fileName: 'b.pdf' })], targets, null, NO_ACTIVE);
    expect(rows.map((row) => row.path)).toEqual(['C:/a.pdf', undefined]);
  });

  it('marks the active document and gives it the current page, and gives the others null', () => {
    const rows = openDocumentRows(
      [docOf({ id: 'd1', fileName: 'a.pdf', pageCount: 3 }), docOf({ id: 'd2', fileName: 'b.pdf', pageCount: 2 })],
      new Map(),
      null,
      { documentId: 'd2', pageIndex: 1 },
    );
    expect(rows.map((row) => row.doc.active)).toEqual([false, true]);
    expect(rows.map((row) => row.doc.currentPage)).toEqual([null, 1]);
  });

  it('keeps the rows in the order of the documents', () => {
    const rows = openDocumentRows([docOf({ id: 'd2', fileName: 'b.pdf' }), docOf({ id: 'd1', fileName: 'a.pdf' })], new Map(), null, NO_ACTIVE);
    expect(rows.map((row) => row.doc.id)).toEqual(['d2', 'd1']);
  });

  it('skips a document with no PDF', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' })]);
    const rows = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', hasPdf: false, pageCount: 0 })], new Map(), file, NO_ACTIVE);
    expect(rows).toEqual([]);
  });

  it('skips a document with zero pages', () => {
    const rows = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', hasPdf: true, pageCount: 0 })], new Map(), null, NO_ACTIVE);
    expect(rows).toEqual([]);
  });

  it('keeps the documents with a PDF in order when a document with no PDF sits between them', () => {
    const rows = openDocumentRows(
      [docOf({ id: 'd2', fileName: 'b.pdf' }), docOf({ id: 'd3', fileName: 'c.pdf', hasPdf: false, pageCount: 0 }), docOf({ id: 'd1', fileName: 'a.pdf' })],
      new Map(),
      null,
      NO_ACTIVE,
    );
    expect(rows.map((row) => row.doc.id)).toEqual(['d2', 'd1']);
  });

  it('does not match a minted id to a sheet of the same id when the path is unset', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: false })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('not-placed');
    expect(row!.sheetProjectUuid).toBeNull();
    expect(row!.needsSave).toBe(true);
  });

  it('still matches a minted id document by its path', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1', path: 'C:/plans/a.pdf' })]);
    const targets = new Map<string, FileTarget>([['d1', { name: 'a.pdf', path: 'C:/plans/a.pdf' }]]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: false })], targets, file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
    expect(row!.sheetProjectUuid).toBeNull();
  });

  it('matches by id when the file holds the id, and clears needsSave', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true })], new Map(), file, NO_ACTIVE);
    expect(row!.state).toBe('placed');
    expect(row!.sheetProjectUuid).toBe('u1');
    expect(row!.needsSave).toBe(false);
  });

  it('lets an id match win over a name and size match on one page', () => {
    const file = buildingOf([sheetOf('s1', 0, 'a.pdf', { sizeBytes: 1000 }), sheetOf('s2', 0, 'a.pdf', { projectUuid: 'u1' })]);
    const [row] = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, sizeBytes: 1000 })], new Map(), file, NO_ACTIVE);
    expect(row!.pages[0]!.sheet?.id).toBe('s2');
  });
});

describe('openedSheetIds', () => {
  it('gives no ids when no document is open', () => {
    expect(openedSheetIds([])).toEqual(new Set());
  });

  it('gives the ids of the sheets matched on every page of every open document', () => {
    const file = buildingOf([
      sheetOf('s1', 0, 'a.pdf', { projectUuid: 'u1' }),
      sheetOf('s2', 2, 'a.pdf', { projectUuid: 'u1' }),
      sheetOf('s3', 0, 'b.pdf', { projectUuid: 'u2' }),
    ]);
    const rows = openDocumentRows(
      [
        docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 }),
        docOf({ id: 'd2', fileName: 'b.pdf', projectUuid: 'u2', projectUuidInFile: true, pageCount: 1 }),
        docOf({ id: 'd3', fileName: 'c.pdf', pageCount: 1 }),
      ],
      new Map(),
      file,
      NO_ACTIVE,
    );
    expect(openedSheetIds(rows)).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('gives nothing for an open document that has no sheet', () => {
    const rows = openDocumentRows([docOf({ id: 'd1', fileName: 'a.pdf' })], new Map(), buildingOf([]), NO_ACTIVE);
    expect(openedSheetIds(rows).size).toBe(0);
  });
});
