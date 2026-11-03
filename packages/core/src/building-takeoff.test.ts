import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel, BuildingSheet } from './building.js';
import type { QuantityTable } from './quantities.js';
import { buildBuildingTakeoff, type TakeoffScope } from './building-takeoff.js';
import type { SheetSummary } from './sheet-summary.js';

type StatusOf = Parameters<typeof buildBuildingTakeoff>[0]['statusOf'];

const levels: BuildingLevel[] = [
  { id: 'L1', name: 'Ground', elevationMm: 0 },
  { id: 'L2', name: 'First', elevationMm: 3000 },
];

const sheet = (id: string, levelId: string, pageIndex: number, projectUuid: string | null, displayName: string, fileName: string): BuildingSheet => ({
  id,
  levelId,
  projectUuid,
  pageIndex,
  displayName,
  location: { fileName },
});

const building = (sheets: BuildingSheet[]): BuildingFile => ({ schemaVersion: 1, id: 'b1', name: 'Tower', levels, sheets, risers: [] });

const summary = (projectUuid: string, tables: QuantityTable[], warnings: string[] = []): SheetSummary => ({
  version: 1,
  projectUuid,
  savedAt: '2026-10-01T10:00:00.000Z',
  sourceSizeBytes: 100,
  sourceModifiedMs: 1000,
  pages: {},
  tables,
  warnings,
});

const okStatus: StatusOf = () => ({ state: 'ok', sizeBytes: 100, modifiedMs: 1000 });

const takeoff = (file: BuildingFile, summaries: SheetSummary[], scope: TakeoffScope = { kind: 'building' }, statusOf: StatusOf = okStatus) =>
  buildBuildingTakeoff({
    building: file,
    scope,
    summaryOf: (uuid) => summaries.find((s) => s.projectUuid === uuid),
    statusOf,
  });

const segments = (rows: (string | number)[][]): QuantityTable => ({ name: 'Segments', headers: ['Page', 'Id', 'Length (m)'], rows });

describe('buildBuildingTakeoff', () => {
  const file = building([
    sheet('s2', 'L2', 0, 'u2', 'First A', 'first.pdf'),
    sheet('s1', 'L1', 0, 'u1', 'Ground A', 'ground.pdf'),
    sheet('s3', 'L1', 1, 'u1', 'Ground B', 'ground.pdf'),
  ]);
  const summaries = [
    summary('u1', [segments([[1, 'seg1', 3.5], [2, 'seg2', 4], [3, 'segX', 9]])]),
    summary('u2', [segments([[1, 'seg3', 6]])]),
  ];

  it('builds Building scope rows with the right provenance, in level and sheet order', () => {
    const result = takeoff(file, summaries);
    expect(result.tables).toEqual([
      {
        name: 'Segments',
        headers: ['Building', 'Level', 'Sheet', 'Document', 'Page', 'Id', 'Length (m)'],
        rows: [
          ['Tower', 'Ground', 'Ground A', 'ground.pdf', 1, 'seg1', 3.5],
          ['Tower', 'Ground', 'Ground B', 'ground.pdf', 2, 'seg2', 4],
          ['Tower', 'First', 'First A', 'first.pdf', 1, 'seg3', 6],
        ],
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.sheets).toEqual([
      { sheetId: 's1', state: 'ok' },
      { sheetId: 's3', state: 'ok' },
      { sheetId: 's2', state: 'ok' },
    ]);
  });

  it('leaves out a page that no sheet has', () => {
    const result = takeoff(file, summaries);
    expect(result.tables[0]!.rows.map((row) => row[5])).not.toContain('segX');
  });

  it('counts only the sheets of one level in Level scope', () => {
    const result = takeoff(file, summaries, { kind: 'level', levelId: 'L2' });
    expect(result.tables[0]!.rows).toEqual([['Tower', 'First', 'First A', 'first.pdf', 1, 'seg3', 6]]);
    expect(result.sheets).toEqual([{ sheetId: 's2', state: 'ok' }]);
  });

  it('gives no sheets for an unknown level', () => {
    const result = takeoff(file, summaries, { kind: 'level', levelId: 'L9' });
    expect(result).toEqual({ tables: [], warnings: [], sheets: [] });
  });

  it('warns and leaves out a sheet whose document has no id', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, null, 'Ground A', 'ground.pdf')]), summaries);
    expect(result.warnings).toEqual(['Ground A: the document has no id yet. Open it in MepApp and save it.']);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'no-summary' }]);
    expect(result.tables).toEqual([]);
  });

  it('warns and leaves out a sheet without a saved summary', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, 'u9', 'Ground A', 'ground.pdf')]), summaries);
    expect(result.warnings).toEqual([
      'Ground A: no saved summary. Open the file in MepApp and save it, or use Read summaries now. Left out.',
    ]);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'no-summary' }]);
    expect(result.tables).toEqual([]);
  });

  it('warns that the PDF changed when the size differs', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, 'u1', 'Ground A', 'ground.pdf')]), summaries, { kind: 'building' }, () => ({
      state: 'ok',
      sizeBytes: 150,
      modifiedMs: 1000,
    }));
    expect(result.warnings).toEqual(['Ground A: the PDF changed after the summary was saved (2026-10-01). The rows may be old.']);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'old-summary' }]);
    expect(result.tables[0]!.rows).toHaveLength(1);
  });

  it('warns that the PDF changed when the modified time is newer', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, 'u1', 'Ground A', 'ground.pdf')]), summaries, { kind: 'building' }, () => ({
      state: 'ok',
      sizeBytes: 100,
      modifiedMs: 2000,
    }));
    expect(result.warnings).toEqual(['Ground A: the PDF changed after the summary was saved (2026-10-01). The rows may be old.']);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'old-summary' }]);
  });

  it('warns that the PDF is missing and uses the summary', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, 'u1', 'Ground A', 'ground.pdf')]), summaries, { kind: 'building' }, () => ({ state: 'missing' }));
    expect(result.warnings).toEqual(['Ground A: PDF missing. Using the summary saved 2026-10-01.']);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'pdf-missing-using-summary' }]);
    expect(result.tables[0]!.rows).toHaveLength(1);
  });

  it('warns that MepApp may not read the PDF and uses the summary', () => {
    const result = takeoff(building([sheet('s1', 'L1', 0, 'u1', 'Ground A', 'ground.pdf')]), summaries, { kind: 'building' }, () => ({ state: 'no-access' }));
    expect(result.warnings).toEqual([
      'Ground A: no access to the PDF. Using the summary saved 2026-10-01. Use Grant access in Manage Buildings.',
    ]);
    expect(result.sheets).toEqual([{ sheetId: 's1', state: 'pdf-no-access-using-summary' }]);
    expect(result.tables[0]!.rows).toHaveLength(1);
  });

  it('copies a summary warning for the sheet of its page only', () => {
    const warning = 'Page 2 has no scale set, so segment lengths on it were left blank. Set its scale and export again.';
    const result = takeoff(file, [summary('u1', [segments([[1, 'seg1', 3.5], [2, 'seg2', 4]])], [warning]), summaries[1]!]);
    expect(result.warnings).toEqual([`Ground B: ${warning}`]);
  });

  it('warns about a circuit with terminals on two levels of one document', () => {
    const crossFile = building([
      sheet('s1', 'L1', 0, 'u1', 'Ground A', 'riser.pdf'),
      sheet('s3', 'L2', 1, 'u1', 'First B', 'riser.pdf'),
      sheet('s2', 'L2', 0, 'u2', 'First A', 'other.pdf'),
      sheet('s4', 'L1', 0, 'u3', 'Ground C', 'third.pdf'),
    ]);
    const terminals = (rows: (string | number)[][]): QuantityTable => ({ name: 'Terminals', headers: ['Page', 'Id', 'Circuit'], rows });
    const result = takeoff(crossFile, [
      summary('u1', [terminals([[1, 't1', 'C2'], [2, 't2', 'C2']])]),
      summary('u2', [terminals([[1, 't3', 'C1']])]),
      summary('u3', [terminals([[1, 't4', 'C1']])]),
    ]);
    expect(result.warnings).toEqual(['Circuit C2 has terminals on levels Ground, First. No vertical cable length is counted.']);
  });

  it('gives no circuit warning inside one level', () => {
    const crossFile = building([sheet('s1', 'L1', 0, 'u1', 'Ground A', 'riser.pdf'), sheet('s3', 'L2', 1, 'u1', 'First B', 'riser.pdf')]);
    const result = takeoff(
      crossFile,
      [summary('u1', [{ name: 'Terminals', headers: ['Page', 'Id', 'Circuit'], rows: [[1, 't1', 'C2'], [2, 't2', 'C2']] }])],
      { kind: 'level', levelId: 'L1' },
    );
    expect(result.warnings).toEqual([]);
  });
});
