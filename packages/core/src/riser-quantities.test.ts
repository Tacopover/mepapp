import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel } from './building.js';
import type { NetworkType } from './network.js';
import type { QuantityTable } from './quantities.js';
import type { Riser, RiserMember } from './riser.js';
import {
  buildingNetworkLabels,
  buildingNetworkRollup,
  riserGraphReach,
  riserSpans,
  riserTable,
  riserTakeoffWarnings,
  type RiserSpan,
} from './riser-quantities.js';

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply',
  discipline: 'ventilation',
  units: 'CFM',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
};

const water: NetworkType = { ...vent, id: 'water', name: 'Return' };

const levels: BuildingLevel[] = [
  { id: 'l0', name: 'Basement', elevationMm: 0 },
  { id: 'l1', name: 'Ground', elevationMm: 3000 },
  { id: 'l2', name: 'First', elevationMm: 6000 },
];

function fileWith(risers: Riser[], levelList: BuildingLevel[] = levels): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: levelList,
    sheets: levelList.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: null,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function member(index: number, extra: Partial<RiserMember> = {}): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId: 'f', ...extra };
}

function makeRiser(
  id: string,
  members: RiserMember[],
  ends: Partial<Pick<Riser, 'topEnd' | 'bottomEnd' | 'endAllowanceMm'>> = {},
  networkType: NetworkType = vent,
): Riser {
  return {
    id,
    name: id,
    networkTypeId: networkType.id,
    networkType,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    ...ends,
    members,
    pending: [],
  };
}

function cellOf(table: QuantityTable, row: number, header: string): unknown {
  return table.rows[row]![table.headers.indexOf(header)];
}

describe('riserSpans and riserTable', () => {
  it('gives one span of 6000 mm with 2 crossings for members on l0 and l2', () => {
    const riser = makeRiser('R1', [member(0), member(2)]);
    const { spans, warnings } = riserSpans(fileWith([riser]), riser);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ fromLevelId: 'l0', toLevelId: 'l2', lengthMm: 6000, crossings: 2 });
    expect(warnings).toEqual([]);
  });

  it('writes the Risers table row with the length in m and the crossings twice', () => {
    const file = fileWith([makeRiser('R1', [member(0), member(2)])]);
    const table = riserTable(file, () => null);
    expect(table.name).toBe('Risers');
    expect(table.headers).toEqual([
      'Building',
      'Riser',
      'Shaft',
      'Network type',
      'From level',
      'To level',
      'Floor-to-floor length (m)',
      'Floor crossings',
      'Fire crossings to check',
      'Size',
      'Flow direction',
      'Source level',
    ]);
    expect(table.rows).toHaveLength(1);
    expect(cellOf(table, 0, 'Floor-to-floor length (m)')).toBe(6);
    expect(cellOf(table, 0, 'Floor crossings')).toBe(2);
    expect(cellOf(table, 0, 'Fire crossings to check')).toBe(2);
  });

  it('gives one span of 3000 mm each for members on l0, l1 and l2', () => {
    const riser = makeRiser('R1', [member(0), member(1), member(2)]);
    const { spans, warnings } = riserSpans(fileWith([riser]), riser);
    expect(spans.map((span) => [span.lengthMm, span.crossings])).toEqual([
      [3000, 1],
      [3000, 1],
    ]);
    expect(warnings).toEqual([]);
  });

  it('adds the connection heights: upper adds, lower subtracts', () => {
    const riser = makeRiser('R1', [member(0, { connectionHeightMm: 300 }), member(2, { connectionHeightMm: 500 })]);
    const file = fileWith([riser]);
    expect(riserSpans(file, riser).spans[0]!.lengthMm).toBe(6200);
    expect(cellOf(riserTable(file, () => null), 0, 'Floor-to-floor length (m)')).toBe(6.2);
  });

  it('gives one row with no length for a riser with one member', () => {
    const riser = makeRiser('R1', [member(0)]);
    const file = fileWith([riser]);
    const table = riserTable(file, () => null);
    expect(table.rows).toHaveLength(1);
    expect(cellOf(table, 0, 'From level')).toBe('Basement');
    expect(cellOf(table, 0, 'To level')).toBe('');
    expect(cellOf(table, 0, 'Floor-to-floor length (m)')).toBeNull();
    expect(cellOf(table, 0, 'Floor crossings')).toBeNull();
    expect(cellOf(table, 0, 'Fire crossings to check')).toBeNull();
    const { spans, warnings } = riserSpans(file, riser);
    expect(spans).toEqual([]);
    expect(warnings).toEqual(['Riser R1 has one member. Length unknown.']);
  });

  it('adds an end row of the end allowance for an open top end', () => {
    const riser = makeRiser('R1', [member(0), member(2)], { topEnd: 'open', endAllowanceMm: 500 });
    const file = fileWith([riser]);
    const { spans } = riserSpans(file, riser);
    expect(spans).toHaveLength(2);
    expect(spans[1]).toMatchObject({ lengthMm: 500, endLabel: 'to roof/ground', crossings: 0, toLevelId: '' });
    const table = riserTable(file, () => null);
    expect(table.rows).toHaveLength(2);
    expect(cellOf(table, 1, 'To level')).toBe('to roof/ground');
  });

  it('adds an end row labelled to cap for a capped bottom end', () => {
    const riser = makeRiser('R1', [member(0), member(2)], { bottomEnd: 'capped', endAllowanceMm: 400 });
    const { spans } = riserSpans(fileWith([riser]), riser);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ lengthMm: 400, endLabel: 'to cap', crossings: 0 });
  });

  it('adds no end row and warns for an open end with no end allowance', () => {
    const riser = makeRiser('R1', [member(0), member(2)], { topEnd: 'open', endAllowanceMm: 0 });
    const { spans, warnings } = riserSpans(fileWith([riser]), riser);
    expect(spans).toHaveLength(1);
    expect(warnings).toEqual(['Riser R1 has an open end with no end allowance.']);
  });

  it('gives the length across basement and ground levels', () => {
    const basement: BuildingLevel[] = [
      { id: 'l0', name: 'Basement', elevationMm: -3000 },
      { id: 'l1', name: 'Ground', elevationMm: 0 },
    ];
    const riser = makeRiser('R1', [member(0), member(1)]);
    const file = fileWith([riser], basement);
    expect(riserSpans(file, riser).spans[0]!.lengthMm).toBe(3000);
    expect(cellOf(riserTable(file, () => null), 0, 'Floor-to-floor length (m)')).toBe(3);
  });

  it('gives a span of length 0 and a warning for two levels of equal elevation', () => {
    const equal: BuildingLevel[] = [
      { id: 'l0', name: 'Basement', elevationMm: 0 },
      { id: 'l1', name: 'Ground', elevationMm: 0 },
    ];
    const riser = makeRiser('R1', [member(0), member(1)]);
    const { spans, warnings } = riserSpans(fileWith([riser], equal), riser);
    expect(spans[0]!.lengthMm).toBe(0);
    expect(spans[0]!.crossings).toBe(1);
    expect(warnings).toEqual(['Levels Basement, Ground have the same elevation (0 mm). Riser R1 has a span of length 0.']);
  });

  it('joins two different sizes with a slash', () => {
    const file = fileWith([makeRiser('R1', [member(0), member(2)])]);
    const table = riserTable(file, (m) => (m.levelId === 'l0' ? '200' : '160'));
    expect(cellOf(table, 0, 'Size')).toBe('200 / 160');
  });

  it('gives one size when both sizes are equal', () => {
    const file = fileWith([makeRiser('R1', [member(0), member(2)])]);
    expect(cellOf(riserTable(file, () => '200'), 0, 'Size')).toBe('200');
  });

  it('gives the known size when the other size is unknown', () => {
    const file = fileWith([makeRiser('R1', [member(0), member(2)])]);
    expect(cellOf(riserTable(file, (m) => (m.levelId === 'l0' ? '200' : null)), 0, 'Size')).toBe('200');
  });
});

describe('riserTakeoffWarnings', () => {
  it('gives no warnings without risers', () => {
    expect(riserTakeoffWarnings(fileWith([]))).toEqual([]);
  });

  it('gives the flow and fire warnings after the riser warnings', () => {
    const warnings = riserTakeoffWarnings(fileWith([makeRiser('R1', [member(0), member(2)])]));
    expect(warnings.slice(-2)).toEqual([
      'Flow is not summed across levels.',
      'Each floor crossing of a duct needs a fire damper or a fire-stopped penetration. Check the local rules.',
    ]);
  });
});

describe('buildingNetworkLabels', () => {
  it('gives one label to the network of two members of one riser', () => {
    const networks: Record<string, string[]> = { a0: ['Supply 1'], a1: ['Supply 1'] };
    const file = fileWith([makeRiser('R1', [member(0, { fittingId: 'a0' }), member(1, { fittingId: 'a1' })])]);
    const labels = buildingNetworkLabels(file, (m) => networks[m.fittingId] ?? []);
    expect(labels.get('s0|Supply 1')).toBe('Building network Supply 1');
    expect(labels.get('s1|Supply 1')).toBe('Building network Supply 1');
    expect(labels.has('s0|Supply 2')).toBe(false);
  });

  it('gives one label to the networks of two risers that share a network', () => {
    const networks: Record<string, string[]> = { a0: ['A'], a1: ['Main'], b1: ['Main'] };
    const file = fileWith([
      makeRiser('R1', [member(0, { fittingId: 'a0' }), member(1, { fittingId: 'a1' })]),
      makeRiser('R2', [member(1, { fittingId: 'b1' })]),
    ]);
    const labels = buildingNetworkLabels(file, (m) => networks[m.fittingId] ?? []);
    expect(labels.get('s0|A')).toBe('Building network Supply 1');
    expect(labels.get('s1|Main')).toBe('Building network Supply 1');
    expect(labels.size).toBe(2);
  });

  it('numbers two separate networks of one type 1 and 2', () => {
    const networks: Record<string, string[]> = { a0: ['X'], a1: ['X'], c2: ['Y'] };
    const file = fileWith([
      makeRiser('R1', [member(0, { fittingId: 'a0' }), member(1, { fittingId: 'a1' })]),
      makeRiser('R2', [member(2, { fittingId: 'c2' })]),
    ]);
    const labels = buildingNetworkLabels(file, (m) => networks[m.fittingId] ?? []);
    expect(labels.get('s0|X')).toBe('Building network Supply 1');
    expect(labels.get('s2|Y')).toBe('Building network Supply 2');
  });
});

describe('riserGraphReach', () => {
  const networks: Record<string, string[]> = { r1a: ['A'], r2b: ['B'], r1s1: ['Main'], r2s1: ['Main'] };
  const networksOf = (m: RiserMember) => networks[m.fittingId] ?? [];

  it('reaches the other riser and its networks through a shared network', () => {
    const file = fileWith([
      makeRiser('R1', [member(0, { fittingId: 'r1a' }), member(1, { fittingId: 'r1s1' })]),
      makeRiser('R2', [member(0, { fittingId: 'r2b' }), member(1, { fittingId: 'r2s1' })]),
    ]);
    const result = riserGraphReach(file, { riserIds: ['R1'] }, networksOf);
    expect(result.riserIds).toEqual(['R1', 'R2']);
    expect(result.networks).toEqual([
      { sheetId: 's0', networkLabel: 'A' },
      { sheetId: 's0', networkLabel: 'B' },
      { sheetId: 's1', networkLabel: 'Main' },
    ]);
  });

  it('returns only the seed network when no riser touches it', () => {
    const file = fileWith([makeRiser('R1', [member(0, { fittingId: 'r1a' }), member(1, { fittingId: 'r1s1' })])]);
    const lonely = { sheetId: 's0', networkLabel: 'Lonely' };
    expect(riserGraphReach(file, { network: lonely }, networksOf)).toEqual({ riserIds: [], networks: [lonely] });
    expect(riserGraphReach(file, { riserIds: ['R1'] }, networksOf).networks).not.toContainEqual(lonely);
  });
});

describe('buildingNetworkRollup', () => {
  const headers = ['Building', 'Network type', 'Length (m)'];

  function spansOf(file: BuildingFile): RiserSpan[] {
    return file.risers.flatMap((riser) => riserSpans(file, riser).spans);
  }

  it('sums the segment lengths and the riser lengths per network type', () => {
    const file = fileWith([makeRiser('S1', [member(0), member(2)]), makeRiser('T1', [member(0), member(1)], {}, water)]);
    const segmentRows: QuantityTable = {
      name: 'Segments',
      headers,
      rows: [
        ['B', 'Supply', 10],
        ['B', 'Supply', 5.5],
        ['B', 'Return', 2],
        ['B', 'Supply', null],
      ],
    };
    const rollup = buildingNetworkRollup({ segmentRows, spans: spansOf(file) });
    expect(rollup.name).toBe('Building networks');
    expect(rollup.headers).toEqual(['Network type', 'Segment length (m)', 'Riser floor-to-floor length (m)', 'Risers']);
    expect(rollup.rows).toEqual([
      ['Supply', 15.5, 6, 1],
      ['Return', 2, 3, 1],
    ]);
  });

  it('gives segment length 0 for a network type that has only risers', () => {
    const file = fileWith([makeRiser('S1', [member(0), member(2)]), makeRiser('T1', [member(0), member(1)], {}, water)]);
    const segmentRows: QuantityTable = { name: 'Segments', headers, rows: [['B', 'Supply', 10]] };
    const rollup = buildingNetworkRollup({ segmentRows, spans: spansOf(file) });
    expect(rollup.rows).toEqual([
      ['Supply', 10, 6, 1],
      ['Return', 0, 3, 1],
    ]);
  });
});
