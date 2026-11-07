import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { DocumentSummary } from '@mepapp/render';
import type { FileTarget } from '@mepapp/platform';
import { openDocumentRows, type OpenDocumentRow } from './openDocumentsView.js';
import { addOpenDocumentPages, openDocumentNewPage } from './openDocumentAdd.js';

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
  levels: [
    { id: 'L1', name: 'Ground', elevationMm: 0 },
    { id: 'L2', name: 'First', elevationMm: 3000 },
  ],
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

const targetsFor = (id: string): Map<string, FileTarget> => new Map([[id, { name: 'a.pdf', path: '/x/a.pdf' }]]);

const rowOf = (file: BuildingFile, doc: DocumentSummary, targets: Map<string, FileTarget>): OpenDocumentRow => {
  const [row] = openDocumentRows([doc], targets, file);
  return row!;
};

describe('addOpenDocumentPages', () => {
  it('adds one page of a 3-page document with an id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const result = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [1], false);
    expect(result.file.sheets).toHaveLength(1);
    const sheet = result.file.sheets[0]!;
    expect(sheet.levelId).toBe('L1');
    expect(sheet.projectUuid).toBe('u1');
    expect(sheet.pageIndex).toBe(1);
    expect(sheet.displayName).toBe('a.pdf p2');
    expect(sheet.location).toEqual({ fileName: 'a.pdf', path: '/x/a.pdf', sizeBytes: 1000 });
    expect(result.added).toBe(1);
  });

  it('adds all 3 pages of a 3-page document', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const result = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    expect(result.file.sheets).toHaveLength(3);
    expect(result.added).toBe(3);
  });

  it('adds nothing when the pages are already placed on the level', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const first = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    const second = addOpenDocumentPages(first.file, rowOf(first.file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    expect(second.added).toBe(0);
    expect(second.moved).toBe(0);
    expect(second.file).toEqual(first.file);
    expect(second.file.sheets).toHaveLength(3);
  });

  it('moves a page from another level only when move is true', () => {
    const file = buildingOf([sheetOf('s1', 1, 'a.pdf', { projectUuid: 'u1', path: '/x/a.pdf', sizeBytes: 1000, levelId: 'L2' })]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const row = rowOf(file, doc, targetsFor('d1'));
    const kept = addOpenDocumentPages(file, row, 'L1', [1], false);
    expect(kept.file).toEqual(file);
    expect(kept.moved).toBe(0);
    expect(kept.added).toBe(0);
    const moved = addOpenDocumentPages(file, row, 'L1', [1], true);
    expect(moved.file.sheets).toHaveLength(1);
    expect(moved.file.sheets[0]!.levelId).toBe('L1');
    expect(moved.moved).toBe(1);
    expect(moved.added).toBe(0);
  });

  it('adds a sheet with the runtime id as minted and a path when the document has no id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'minted', projectUuidInFile: false, pageCount: 1 });
    const result = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [0], false);
    expect(result.file.sheets).toHaveLength(1);
    expect(result.file.sheets[0]!.projectUuid).toBe('minted');
    expect(result.file.sheets[0]!.idMinted).toBe(true);
    expect(result.file.sheets[0]!.location.path).toBe('/x/a.pdf');
  });

  it('adds the sheets of all pages with the runtime id as minted, and adds nothing on a second call', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'minted', projectUuidInFile: false, pageCount: 3 });
    const first = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    expect(first.added).toBe(3);
    expect(first.file.sheets).toHaveLength(3);
    expect(first.file.sheets.every((sheet) => sheet.projectUuid === 'minted' && sheet.idMinted === true)).toBe(true);
    const second = addOpenDocumentPages(first.file, rowOf(first.file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    expect(second.added).toBe(0);
    expect(second.file).toEqual(first.file);
  });

  it('adds a sheet with no path key and adds nothing on a second call when the document has no id and no path', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'minted', projectUuidInFile: false, pageCount: 1 });
    const originalRow = rowOf(file, doc, new Map());
    const first = addOpenDocumentPages(file, originalRow, 'L1', [0], false);
    expect(first.file.sheets).toHaveLength(1);
    expect(first.file.sheets[0]!.projectUuid).toBe('minted');
    expect('path' in first.file.sheets[0]!.location).toBe(false);
    const second = addOpenDocumentPages(first.file, originalRow, 'L1', [0], false);
    expect(second.added).toBe(0);
    expect(second.file.sheets).toHaveLength(1);
  });

  it('adds nothing on a second call in a row when the document has an id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const first = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    const second = addOpenDocumentPages(first.file, rowOf(first.file, doc, targetsFor('d1')), 'L1', [0, 1, 2], false);
    expect(second.file.sheets).toHaveLength(first.file.sheets.length);
    expect(second.added).toBe(0);
  });

  it('returns the same file and adds nothing for an unknown level', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const result = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L9', [0], false);
    expect(result.file).toBe(file);
    expect(result.added).toBe(0);
  });

  it('adds one sheet for a document with no id, no path and no size, and adds nothing on a second call', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', sizeBytes: null, pageCount: 1 });
    const row = rowOf(file, doc, new Map());
    const first = addOpenDocumentPages(file, row, 'L1', [0], false);
    expect(first.added).toBe(1);
    expect(first.file.sheets).toHaveLength(1);
    const second = addOpenDocumentPages(first.file, rowOf(first.file, doc, new Map()), 'L1', [0], false);
    expect(second.added).toBe(0);
    expect(second.file.sheets).toHaveLength(1);
  });

  it('moves all 3 sheets of a 3-page document to another level when move is true', () => {
    const file = buildingOf([
      sheetOf('s0', 0, 'a.pdf', { projectUuid: 'u1', path: '/x/a.pdf', sizeBytes: 1000 }),
      sheetOf('s1', 1, 'a.pdf', { projectUuid: 'u1', path: '/x/a.pdf', sizeBytes: 1000 }),
      sheetOf('s2', 2, 'a.pdf', { projectUuid: 'u1', path: '/x/a.pdf', sizeBytes: 1000 }),
    ]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true, pageCount: 3 });
    const result = addOpenDocumentPages(file, rowOf(file, doc, targetsFor('d1')), 'L2', [0, 1, 2], true);
    expect(result.moved).toBe(3);
    expect(result.added).toBe(0);
    expect(result.file.sheets).toHaveLength(3);
    expect(result.file.sheets.every((sheet) => sheet.levelId === 'L2')).toBe(true);
  });
});

describe('openDocumentNewPage', () => {
  it('omits sizeBytes when the document has no size', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', sizeBytes: null });
    const page = openDocumentNewPage(rowOf(file, doc, new Map()), 0);
    expect('sizeBytes' in page.location).toBe(false);
    expect(page.location.fileName).toBe('a.pdf');
  });

  it('gives the runtime id with idMinted when the file holds no id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'minted', projectUuidInFile: false });
    const page = openDocumentNewPage(rowOf(file, doc, new Map()), 0);
    expect(page.projectUuid).toBe('minted');
    expect(page.idMinted).toBe(true);
  });

  it('gives the id of the file without idMinted when the file holds the id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: 'u1', projectUuidInFile: true });
    const page = openDocumentNewPage(rowOf(file, doc, new Map()), 0);
    expect(page.projectUuid).toBe('u1');
    expect('idMinted' in page).toBe(false);
  });

  it('gives projectUuid null without idMinted when the document has no runtime id', () => {
    const file = buildingOf([]);
    const doc = docOf({ id: 'd1', fileName: 'a.pdf', projectUuid: null, projectUuidInFile: false });
    const page = openDocumentNewPage(rowOf(file, doc, new Map()), 0);
    expect(page.projectUuid).toBeNull();
    expect('idMinted' in page).toBe(false);
  });
});
