import { describe, expect, it, vi } from 'vitest';
import { emptyBuilding, serializeBuildingFile, type BuildingFile, type BuildingSheet, type SheetSummary } from '@mepapp/core';
import { MemoryBuildingStore } from '@mepapp/platform';
import { buildBuildingScopeTables, readSummaries, scopeFileName, statSheets, withWarningsSheet, type SheetStat } from './quantitiesScope.js';

const summaryOf = (projectUuid: string, length: number): SheetSummary => ({
  version: 1,
  projectUuid,
  savedAt: '2026-10-01T09:00:00.000Z',
  sourceSizeBytes: 1000,
  sourceModifiedMs: 5000,
  pages: {},
  tables: [{ name: 'Segments', headers: ['Page', 'Length'], rows: [[1, length]] }],
  warnings: [],
});

const sheetOf = (overrides: Partial<BuildingSheet> & Pick<BuildingSheet, 'id' | 'levelId' | 'projectUuid' | 'displayName'>): BuildingSheet => ({
  pageIndex: 0,
  location: { fileName: `${overrides.id}.pdf`, path: `C:/w/${overrides.id}.pdf`, sizeBytes: 1000 },
  ...overrides,
});

const twoLevelBuilding = (): BuildingFile => ({
  ...emptyBuilding('b1', 'Block'),
  levels: [
    { id: 'L1', name: 'Ground', elevationMm: 0 },
    { id: 'L2', name: 'First', elevationMm: 3000 },
  ],
  sheets: [
    sheetOf({ id: 's1', levelId: 'L1', projectUuid: 'p1', displayName: 'Plan A' }),
    sheetOf({ id: 's2', levelId: 'L2', projectUuid: 'p2', displayName: 'Plan B' }),
  ],
});

const goodStats = (): Map<string, SheetStat> =>
  new Map<string, SheetStat>([
    ['s1', { state: 'ok', sizeBytes: 1000, modifiedMs: 4000 }],
    ['s2', { state: 'ok', sizeBytes: 1000, modifiedMs: 4000 }],
  ]);

const summaries = (): Map<string, SheetSummary> =>
  new Map<string, SheetSummary>([
    ['p1', summaryOf('p1', 5)],
    ['p2', summaryOf('p2', 7)],
  ]);

describe('scopeFileName', () => {
  it('names a document and a sheet from the PDF name', () => {
    expect(scopeFileName({ documentName: 'Ground.pdf', scope: { kind: 'document' }, building: undefined })).toBe('Ground-quantities.xlsx');
    expect(scopeFileName({ documentName: 'Ground.PDF', scope: { kind: 'sheet' }, building: undefined })).toBe('Ground-quantities.xlsx');
  });

  it('uses quantities as the base when no document is open', () => {
    expect(scopeFileName({ documentName: undefined, scope: { kind: 'document' }, building: undefined })).toBe('quantities-quantities.xlsx');
  });

  it('names a building and a level', () => {
    const building = twoLevelBuilding();
    expect(scopeFileName({ documentName: 'Ground.pdf', scope: { kind: 'building' }, building })).toBe('Block-all-quantities.xlsx');
    expect(scopeFileName({ documentName: 'Ground.pdf', scope: { kind: 'level', levelId: 'L2' }, building })).toBe('Block-First-quantities.xlsx');
  });

  it('uses level as the level name when the id is unknown', () => {
    const building = twoLevelBuilding();
    expect(scopeFileName({ documentName: undefined, scope: { kind: 'level', levelId: 'gone' }, building })).toBe('Block-level-quantities.xlsx');
  });

  it('replaces unsafe characters with a dash', () => {
    const building = { ...twoLevelBuilding(), name: 'A/B:C' };
    expect(scopeFileName({ documentName: undefined, scope: { kind: 'building' }, building })).toBe('A-B-C-all-quantities.xlsx');
    expect(scopeFileName({ documentName: 'x"y<z>.pdf', scope: { kind: 'document' }, building: undefined })).toBe('x-y-z--quantities.xlsx');
  });
});

describe('withWarningsSheet', () => {
  const tables = [{ name: 'Terminals', headers: ['Count'], rows: [[2]] }];

  it('returns the tables unchanged without warnings', () => {
    expect(withWarningsSheet(tables, [])).toEqual(tables);
  });

  it('appends a Warnings sheet with the warnings', () => {
    expect(withWarningsSheet(tables, ['first', 'second'])).toEqual([
      ...tables,
      { name: 'Warnings', headers: ['Warning'], rows: [['first'], ['second']] },
    ]);
  });
});

describe('statSheets', () => {
  const sheets = [sheetOf({ id: 's1', levelId: 'L1', projectUuid: 'p1', displayName: 'Plan A' })];

  it('gives no-access for every sheet when there is no statPath', async () => {
    const stats = await statSheets(sheets, undefined);
    expect(stats.get('s1')).toEqual({ state: 'no-access' });
  });

  it('gives no-access for a sheet without a path and does not call statPath', async () => {
    const statPath = vi.fn(async () => ({ state: 'ok' as const }));
    const noPath = [sheetOf({ id: 's1', levelId: 'L1', projectUuid: 'p1', displayName: 'Plan A', location: { fileName: 'a.pdf' } })];
    const stats = await statSheets(noPath, statPath);
    expect(stats.get('s1')).toEqual({ state: 'no-access' });
    expect(statPath).not.toHaveBeenCalled();
  });

  it('gives no-access when statPath throws', async () => {
    const stats = await statSheets(sheets, async () => {
      throw new Error('denied');
    });
    expect(stats.get('s1')).toEqual({ state: 'no-access' });
  });

  it('returns the stat from statPath', async () => {
    const stats = await statSheets(sheets, async () => ({ state: 'ok', sizeBytes: 1000, modifiedMs: 4000 }));
    expect(stats.get('s1')).toEqual({ state: 'ok', sizeBytes: 1000, modifiedMs: 4000 });
  });
});

describe('readSummaries', () => {
  it('parses a good summary and puts a bad one in problems', async () => {
    const store = new MemoryBuildingStore({
      json: serializeBuildingFile(twoLevelBuilding()),
      summaries: { p1: JSON.stringify(summaryOf('p1', 5)), p2: '{not json' },
    });
    const result = await readSummaries(store);
    expect(result.summaries.get('p1')?.projectUuid).toBe('p1');
    expect(result.summaries.has('p2')).toBe(false);
    expect(result.problems.has('p2')).toBe(true);
    expect(result.problems.get('p2')).toBeTruthy();
  });
});

describe('buildBuildingScopeTables', () => {
  it('level scope has only the rows of that level', () => {
    const result = buildBuildingScopeTables({
      building: twoLevelBuilding(),
      scope: { kind: 'level', levelId: 'L1' },
      summaries: summaries(),
      problems: new Map(),
      stats: goodStats(),
    });
    const table = result.tables.find((t) => t.name === 'Segments');
    expect(table?.headers.slice(0, 4)).toEqual(['Building', 'Level', 'Sheet', 'Document']);
    expect(table?.rows.map((row) => row[row.length - 1])).toEqual([5]);
    expect(result.warnings).toEqual([]);
  });

  it('building scope has the rows of both levels', () => {
    const result = buildBuildingScopeTables({
      building: twoLevelBuilding(),
      scope: { kind: 'building' },
      summaries: summaries(),
      problems: new Map(),
      stats: goodStats(),
    });
    const table = result.tables.find((t) => t.name === 'Segments');
    expect(table?.rows.map((row) => row[row.length - 1])).toEqual([5, 7]);
  });

  it('a missing PDF gives the warning and keeps the rows', () => {
    const stats = goodStats();
    stats.set('s1', { state: 'missing' });
    const result = buildBuildingScopeTables({
      building: twoLevelBuilding(),
      scope: { kind: 'level', levelId: 'L1' },
      summaries: summaries(),
      problems: new Map(),
      stats,
    });
    expect(result.warnings.some((w) => w.includes('PDF not found. Using the summary'))).toBe(true);
    const table = result.tables.find((t) => t.name === 'Segments');
    expect(table?.rows.map((row) => row[row.length - 1])).toEqual([5]);
  });

  it('a live summary replaces the stored one and suppresses the stale warning', () => {
    const stats = goodStats();
    stats.set('s1', { state: 'ok', sizeBytes: 2222, modifiedMs: 9999 });
    const base = {
      building: twoLevelBuilding(),
      scope: { kind: 'level' as const, levelId: 'L1' },
      summaries: summaries(),
      problems: new Map<string, string>(),
      stats,
    };
    expect(buildBuildingScopeTables(base).warnings.some((w) => w.includes('changed after the summary was saved'))).toBe(true);

    const result = buildBuildingScopeTables({ ...base, live: summaryOf('p1', 9) });
    expect(result.warnings.some((w) => w.includes('changed after the summary was saved'))).toBe(false);
    const table = result.tables.find((t) => t.name === 'Segments');
    expect(table?.rows.map((row) => row[row.length - 1])).toEqual([9]);
  });

  it('adds the warning for a summary that cannot be read', () => {
    const result = buildBuildingScopeTables({
      building: twoLevelBuilding(),
      scope: { kind: 'building' },
      summaries: new Map([['p1', summaryOf('p1', 5)]]),
      problems: new Map([['p2', 'Unexpected token']]),
      stats: goodStats(),
    });
    expect(result.warnings).toEqual(['Plan B: the saved summary cannot be read (Unexpected token). Left out.']);
  });
});
