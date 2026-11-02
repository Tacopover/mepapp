import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import { checkOpenedDocument, type OpenedDocumentInfo } from './documentIdentity.js';

const sheetOf = (id: string, options: { projectUuid?: string | null; path?: string; fileName?: string; sizeBytes?: number } = {}): BuildingSheet => ({
  id,
  levelId: 'L1',
  projectUuid: options.projectUuid === undefined ? 'uuid-1' : options.projectUuid,
  pageIndex: 0,
  displayName: `Sheet ${id}`,
  location: { fileName: options.fileName ?? 'plan.pdf', path: options.path, sizeBytes: options.sizeBytes },
});

const buildingOf = (sheets: BuildingSheet[]): BuildingFile => ({
  ...emptyBuilding('b1', 'Block'),
  levels: [{ id: 'L1', name: 'Level 1', elevationMm: 0 }],
  sheets,
});

const docOf = (overrides: Partial<OpenedDocumentInfo> = {}): OpenedDocumentInfo => ({
  projectUuid: 'uuid-1',
  path: 'C:/work/plan.pdf',
  fileName: 'plan.pdf',
  sizeBytes: 1000,
  modifiedMs: 5000,
  ...overrides,
});

const statOk = (sizeBytes: number, modifiedMs: number) => async () => ({ state: 'ok' as const, sizeBytes, modifiedMs });

describe('checkOpenedDocument', () => {
  it('returns none when the document has no id', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/work/plan.pdf' })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf({ projectUuid: null }) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns none when no sheet has the id', async () => {
    const building = buildingOf([sheetOf('s1', { projectUuid: 'other', path: 'C:/work/old.pdf' })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: async () => ({ state: 'missing' }) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns none when the stored path equals the open path', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/work/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: async () => ({ state: 'missing' }) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns moved when the stored file is missing and the open path differs', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: async () => ({ state: 'missing' }) });
    expect(outcome).toEqual({
      kind: 'moved',
      projectUuid: 'uuid-1',
      location: { fileName: 'plan.pdf', path: 'C:/work/plan.pdf', sizeBytes: 1000 },
      sheetName: 'Sheet s1',
    });
  });

  it('asks copy when the stored file is ok, the paths differ and the size differs', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 900 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: statOk(900, 4000) });
    expect(outcome).toEqual({
      kind: 'ask',
      verdict: 'copy',
      projectUuid: 'uuid-1',
      location: { fileName: 'plan.pdf', path: 'C:/work/plan.pdf', sizeBytes: 1000 },
      storedName: 'plan.pdf',
      storedPath: 'C:/old/plan.pdf',
    });
  });

  it('asks unclear when the stored file is ok, the paths differ and size and time match', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: statOk(1000, 5000) });
    expect(outcome).toMatchObject({ kind: 'ask', verdict: 'unclear', storedName: 'plan.pdf', storedPath: 'C:/old/plan.pdf' });
  });

  it('asks unclear when the stored file cannot be accessed', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: async () => ({ state: 'no-access' }) });
    expect(outcome).toMatchObject({ kind: 'ask', verdict: 'unclear' });
  });

  it('asks unclear when statPath throws', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({
      building,
      doc: docOf(),
      statPath: async () => {
        throw new Error('denied');
      },
    });
    expect(outcome).toMatchObject({ kind: 'ask', verdict: 'unclear' });
  });

  it('treats the stored state as ok when statPath is not given, so the paths differ and the verdict is copy', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf() });
    expect(outcome).toMatchObject({ kind: 'ask', verdict: 'copy' });
  });

  it('web: returns none for the same file name and size when the open document has no path', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', fileName: 'plan.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf({ path: undefined }) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('web: asks unclear for another file name when the open document has no path', async () => {
    const building = buildingOf([sheetOf('s1', { path: 'C:/old/plan.pdf', fileName: 'old.pdf', sizeBytes: 1000 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf({ path: undefined }) });
    expect(outcome).toMatchObject({ kind: 'ask', verdict: 'unclear', storedName: 'old.pdf', storedPath: 'C:/old/plan.pdf' });
  });

  it('returns none when the sheet has no stored path', async () => {
    const building = buildingOf([sheetOf('s1', { fileName: 'other.pdf', sizeBytes: 500 })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: statOk(1000, 5000) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns none when the sheet matches by path only and has another id', async () => {
    const building = buildingOf([sheetOf('s1', { projectUuid: 'uuid-other', path: 'C:/old/plan.pdf' })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf({ path: 'C:/old/plan.pdf' }), statPath: async () => ({ state: 'missing' }) });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns none when the sheet has no id and matches the open document by path only', async () => {
    const building = buildingOf([sheetOf('s1', { projectUuid: null, path: 'C:/work/plan.pdf' })]);
    const outcome = await checkOpenedDocument({ building, doc: docOf(), statPath: async () => ({ state: 'missing' }) });
    expect(outcome).toEqual({ kind: 'none' });
  });
});
