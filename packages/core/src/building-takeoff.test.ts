import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel, BuildingSheet } from './building.js';
import type { NetworkType } from './network.js';
import type { QuantityTable } from './quantities.js';
import type { Riser, RiserMember } from './riser.js';
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

describe('buildBuildingTakeoff with risers', () => {
  const supply: NetworkType = {
    id: 'supply',
    name: 'Supply',
    discipline: 'ventilation',
    units: 'CFM',
    defaultCapacity: 100,
    color: '#2196f3',
    lineWidthPt: 1,
    linePattern: 'solid',
  };
  const towerLevels: BuildingLevel[] = [
    { id: 'l0', name: 'Ground', elevationMm: 0 },
    { id: 'l1', name: 'First', elevationMm: 3000 },
    { id: 'l2', name: 'Second', elevationMm: 6000 },
    { id: 'l3', name: 'Roof', elevationMm: 9000 },
  ];
  const towerSheets = [
    sheet('s0', 'l0', 0, 'u0', 'Ground A', 'tower.pdf'),
    sheet('s1', 'l1', 0, 'u1', 'First A', 'tower.pdf'),
    sheet('s2', 'l2', 0, 'u2', 'Second A', 'tower.pdf'),
    sheet('s3', 'l3', 0, 'u3', 'Roof A', 'tower.pdf'),
  ];
  const tower = (sheets: BuildingSheet[], risers: Riser[]): BuildingFile => ({
    schemaVersion: 1,
    id: 'b2',
    name: 'Tower',
    levels: towerLevels,
    sheets,
    risers,
  });
  const towerRiser = (id: string, name: string, members: RiserMember[], extra: Partial<Riser> = {}): Riser => ({
    id,
    name,
    networkTypeId: supply.id,
    networkType: supply,
    anchorMm: { xMm: 100, yMm: 100 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
    ...extra,
  });
  const member = (level: number, fittingId: string): RiserMember => ({ levelId: `l${level}`, sheetId: `s${level}`, pageIndex: 0, fittingId });
  const pages = { '0': { calibrated: true, pageUnitsPerRealUnit: 1, widthPt: 1000, heightPt: 1000, rotationDegrees: 0 } };
  const towerSummary = (projectUuid: string, tables: QuantityTable[], extra: Partial<SheetSummary> = {}): SheetSummary => ({
    ...summary(projectUuid, tables),
    pages,
    ...extra,
  });
  const fittingsOf = (rows: (string | number)[][]): QuantityTable => ({
    name: 'Fittings',
    headers: ['Page', 'Id', 'Network', 'Kind', 'Routed', 'X (pt)', 'Y (pt)'],
    rows,
  });
  const segmentsOf = (rows: (string | number | null)[][]): QuantityTable => ({
    name: 'Segments',
    headers: ['Page', 'Id', 'Network', 'Network type', 'Diameter (mm)', 'Width (mm)', 'Height (mm)', 'Length (m)', 'Start fitting', 'End fitting'],
    rows,
  });
  const tableNamed = (tables: QuantityTable[], name: string): QuantityTable | undefined => tables.find((table) => table.name === name);
  const columnOf = (table: QuantityTable, header: string): number => table.headers.indexOf(header);
  const cellById = (table: QuantityTable, id: string, header: string): unknown =>
    table.rows.find((row) => row[columnOf(table, 'Id')] === id)![columnOf(table, header)];
  const twoLevelSummaries = (first: Partial<SheetSummary> = {}, second: Partial<SheetSummary> = {}): SheetSummary[] => [
    towerSummary(
      'u0',
      [
        fittingsOf([
          [1, 'f0', 'NetA', 'fitting', 'no', 100, 900],
          [1, 'k0', '', 'fitting', 'no', 300, 900],
        ]),
        segmentsOf([[1, 'seg0', 'NetA', 'Supply', 200, null, null, 3.5, 'k0', 'f0']]),
      ],
      first,
    ),
    towerSummary(
      'u1',
      [
        fittingsOf([
          [1, 'f1', 'NetB', 'fitting', 'no', 100, 900],
          [1, 'k1', '', 'fitting', 'no', 300, 900],
        ]),
        segmentsOf([[1, 'seg1', 'NetB', 'Supply', 160, null, null, 3, 'f1', 'k1']]),
      ],
      second,
    ),
  ];
  const twoLevelRiser = towerRiser('r1', 'Supply air riser 1', [member(0, 'f0'), member(1, 'f1')]);
  const twoLevelFile = tower([towerSheets[0]!, towerSheets[1]!], [twoLevelRiser]);

  it('gives the old tables when the building has no risers', () => {
    const file = tower([towerSheets[0]!], []);
    const result = takeoff(file, [
      towerSummary('u0', [
        fittingsOf([[1, 'f0', 'NetA', 'fitting', 'no', 100, 900]]),
        segmentsOf([[1, 'seg0', 'NetA', 'Supply', 200, null, null, 3.5, 'k0', 'f0']]),
      ]),
    ]);
    expect(result.tables).toEqual([
      {
        name: 'Segments',
        headers: ['Building', 'Level', 'Sheet', 'Document', 'Page', 'Id', 'Network', 'Network type', 'Diameter (mm)', 'Width (mm)', 'Height (mm)', 'Length (m)', 'Start fitting', 'End fitting'],
        rows: [['Tower', 'Ground', 'Ground A', 'tower.pdf', 1, 'seg0', 'NetA', 'Supply', 200, null, null, 3.5, 'k0', 'f0']],
      },
      {
        name: 'Fittings',
        headers: ['Building', 'Level', 'Sheet', 'Document', 'Page', 'Id', 'Network', 'Kind', 'Routed', 'X (pt)', 'Y (pt)'],
        rows: [['Tower', 'Ground', 'Ground A', 'tower.pdf', 1, 'f0', 'NetA', 'fitting', 'no', 100, 900]],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('adds the Risers and Building networks tables and the riser columns', () => {
    const result = takeoff(twoLevelFile, twoLevelSummaries());
    const risers = tableNamed(result.tables, 'Risers')!;
    expect(risers.rows).toHaveLength(1);
    expect(risers.rows[0]![columnOf(risers, 'Floor-to-floor length (m)')]).toBe(3);
    expect(risers.headers.some((header) => header.includes('(pt)'))).toBe(false);
    expect(tableNamed(result.tables, 'Building networks')!.rows).toHaveLength(1);
    const fittings = tableNamed(result.tables, 'Fittings')!;
    expect(cellById(fittings, 'f0', 'Riser')).toBe('Supply air riser 1');
    expect(cellById(fittings, 'k0', 'Riser')).toBeNull();
    const segments = tableNamed(result.tables, 'Segments')!;
    const label = cellById(segments, 'seg0', 'Building network');
    expect(label).toBe('Building network Supply 1');
    expect(cellById(segments, 'seg1', 'Building network')).toBe(label);
    expect(result.warnings).toContain('Flow is not summed across levels.');
  });

  it('lists the riser span only on the levels it touches in Level scope', () => {
    const riserA = towerRiser('ra', 'Supply air riser 1', [member(0, 'f0'), member(1, 'f1')]);
    const riserB = towerRiser('rb', 'Supply air riser 2', [member(1, 'g1'), member(2, 'g2')]);
    const file = tower(towerSheets, [riserA, riserB]);
    const summaries = [
      towerSummary('u0', [fittingsOf([[1, 'f0', 'NetA', 'fitting', 'no', 100, 900]])]),
      towerSummary('u1', [
        fittingsOf([
          [1, 'f1', 'NetB', 'fitting', 'no', 100, 900],
          [1, 'g1', 'NetC', 'fitting', 'no', 300, 900],
        ]),
      ]),
      towerSummary('u2', [fittingsOf([[1, 'g2', 'NetD', 'fitting', 'no', 100, 900]])]),
      towerSummary('u3', [segmentsOf([[1, 'seg3', 'NetE', 'Supply', 100, null, null, 2, 'h1', 'h2']])]),
    ];
    const ground = takeoff(file, summaries, { kind: 'level', levelId: 'l0' });
    const groundRisers = tableNamed(ground.tables, 'Risers')!;
    expect(groundRisers.rows.map((row) => row[columnOf(groundRisers, 'Riser')])).toEqual(['Supply air riser 1']);
    const second = takeoff(file, summaries, { kind: 'level', levelId: 'l2' });
    const secondRisers = tableNamed(second.tables, 'Risers')!;
    expect(secondRisers.rows.map((row) => row[columnOf(secondRisers, 'Riser')])).toEqual(['Supply air riser 2']);
    const roof = takeoff(file, summaries, { kind: 'level', levelId: 'l3' });
    expect(tableNamed(roof.tables, 'Risers')).toBeUndefined();
    expect(tableNamed(roof.tables, 'Building networks')).toBeUndefined();
    expect(roof.warnings).toEqual([]);
  });

  it('gives the size of both ends of a span joined with " / "', () => {
    const result = takeoff(twoLevelFile, twoLevelSummaries());
    const risers = tableNamed(result.tables, 'Risers')!;
    expect(risers.rows[0]![columnOf(risers, 'Size')]).toBe('200 / 160');
  });

  it('takes the flow direction from the flow solve when no flow is set by hand', () => {
    const result = takeoff(twoLevelFile, twoLevelSummaries({ riserFittingFlow: { f0: 'out' } }));
    const risers = tableNamed(result.tables, 'Risers')!;
    expect(risers.rows[0]![columnOf(risers, 'Flow direction')]).toBe('up');
    expect(risers.rows[0]![columnOf(risers, 'Flow set by')]).toBe('From the flow solve');
  });

  it('takes the flow direction set by hand over the flow solve', () => {
    const file = tower([towerSheets[0]!, towerSheets[1]!], [{ ...twoLevelRiser, flow: 'down' }]);
    const result = takeoff(file, twoLevelSummaries());
    const risers = tableNamed(result.tables, 'Risers')!;
    expect(risers.rows[0]![columnOf(risers, 'Flow direction')]).toBe('down');
    expect(risers.rows[0]![columnOf(risers, 'Flow set by')]).toBe('Set by hand');
  });

  it('keeps the flow direction unknown when no fitting has a source', () => {
    const result = takeoff(twoLevelFile, twoLevelSummaries({ riserFittingFlow: { f0: 'none' } }, { riserFittingFlow: { f1: 'none' } }));
    const risers = tableNamed(result.tables, 'Risers')!;
    expect(risers.rows[0]![columnOf(risers, 'Flow direction')]).toBe('unknown');
    expect(risers.rows[0]![columnOf(risers, 'Flow set by')]).toBe('Not known yet');
  });

  it('warns once for a sheet with pending riser changes', () => {
    const file = tower(
      [towerSheets[0]!, towerSheets[1]!],
      [
        towerRiser('r1', 'Supply air riser 1', [member(0, 'f0'), member(1, 'f1')], {
          pending: [
            { seq: 1, sheetId: 's1', kind: 'move', toMm: { xMm: 1, yMm: 1 } },
            { seq: 2, sheetId: 's1', kind: 'retag', networkTypeId: 'supply' },
          ],
        }),
      ],
    );
    const result = takeoff(file, twoLevelSummaries());
    expect(result.warnings.filter((warning) => warning.includes('pending change'))).toEqual([
      'First A: pending change for riser Supply air riser 1',
    ]);
  });

  it('warns for a fitting that is more than 0.5 mm from the riser anchor', () => {
    const summaries = twoLevelSummaries();
    summaries[1] = towerSummary('u1', [
      fittingsOf([
        [1, 'f1', 'NetB', 'fitting', 'no', 110, 900],
        [1, 'k1', '', 'fitting', 'no', 300, 900],
      ]),
      segmentsOf([[1, 'seg1', 'NetB', 'Supply', 160, null, null, 3, 'f1', 'k1']]),
    ]);
    const result = takeoff(twoLevelFile, summaries);
    expect(result.warnings).toContain('First A: pending change for riser Supply air riser 1');
  });

  it('gives no conflict warning for a fitting at the riser anchor', () => {
    const result = takeoff(twoLevelFile, twoLevelSummaries());
    expect(result.warnings.filter((warning) => warning.includes('pending change'))).toEqual([]);
  });
});
