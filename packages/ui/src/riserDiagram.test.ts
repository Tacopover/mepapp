import { emptyBuilding, type BuildingFile, type LinePattern, type NetworkType, type Riser, type RiserPendingOp } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { layoutLevels, layoutRisers, memberStatus, riserNumber, typeFilters } from './riserDiagram.js';

function networkType(id: string, name: string, color: string, linePattern: LinePattern): NetworkType {
  return { id, name, discipline: 'ventilation', units: 'CFM', defaultCapacity: 0, color, lineWidthPt: 1, linePattern };
}

const SUPPLY = networkType('sup', 'Supply air', '#2196f3', 'solid');
const EXHAUST = networkType('exh', 'Exhaust air', '#ff9800', 'dashed');
const CHILLED = networkType('cw', 'Chilled water', '#4caf50', 'dotted');

function riser(
  id: string,
  name: string,
  type: NetworkType,
  members: Array<[levelId: string, sheetId: string]>,
  pending: RiserPendingOp[] = [],
): Riser {
  return {
    id,
    name,
    networkTypeId: type.id,
    networkType: type,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members: members.map(([levelId, sheetId]) => ({ levelId, sheetId, pageIndex: 0, fittingId: `${id}-${levelId}` })),
    pending,
  };
}

function building(levels: Array<[id: string, elevationMm: number]>, risers: Riser[]): BuildingFile {
  return {
    ...emptyBuilding('b1', 'Test'),
    levels: levels.map(([id, elevationMm]) => ({ id, name: `Level ${id}`, elevationMm })),
    risers,
  };
}

const THREE_LEVELS: Array<[string, number]> = [
  ['L0', 0],
  ['L1', 3000],
  ['L2', 6000],
];

function lanesOf(file: BuildingFile, hidden: ReadonlySet<string> = new Set(), conflictKeys: ReadonlySet<string> = new Set()) {
  return layoutRisers(file, layoutLevels(file.levels), hidden, conflictKeys).lanes;
}

describe('layoutLevels', () => {
  it('spaces even levels by gapPx and puts the highest level at the top', () => {
    const layout = layoutLevels([
      { id: 'L0', name: 'L0', elevationMm: 0 },
      { id: 'L1', name: 'L1', elevationMm: 3000 },
      { id: 'L2', name: 'L2', elevationMm: 6000 },
      { id: 'L3', name: 'L3', elevationMm: 9000 },
    ]);
    expect(layout.levels.map((level) => level.id)).toEqual(['L3', 'L2', 'L1', 'L0']);
    expect(layout.levels.map((level) => level.yPx)).toEqual([32, 96, 160, 224]);
    expect(layout.heightPx).toBe(256);
    expect(layout.levelLinesPx).toEqual([64, 128, 192]);
  });

  it('gives each level a band from the line above to the line below', () => {
    const layout = layoutLevels([
      { id: 'L0', name: 'L0', elevationMm: 0 },
      { id: 'L1', name: 'L1', elevationMm: 3000 },
      { id: 'L2', name: 'L2', elevationMm: 6000 },
      { id: 'L3', name: 'L3', elevationMm: 9000 },
    ]);
    expect(layout.levels.map((level) => [level.bandTopPx, level.bandBottomPx])).toEqual([
      [0, 64],
      [64, 128],
      [128, 192],
      [192, 256],
    ]);
  });

  it('gives proportional y for uneven elevations', () => {
    const layout = layoutLevels([
      { id: 'a', name: 'A', elevationMm: 0 },
      { id: 'b', name: 'B', elevationMm: 9000 },
      { id: 'c', name: 'C', elevationMm: 15000 },
    ]);
    expect(layout.levels.map((level) => level.yPx)).toEqual([32, 83.2, 160]);
    expect(layout.heightPx).toBe(192);
    expect(layout.levelLinesPx).toEqual([57.6, 121.6]);
  });

  it('forces minGapPx between two close levels and keeps the file order for equal elevations', () => {
    const layout = layoutLevels([
      { id: 'A', name: 'A', elevationMm: 0 },
      { id: 'B', name: 'B', elevationMm: 0 },
      { id: 'C', name: 'C', elevationMm: 3000 },
    ]);
    expect(layout.levels.map((level) => level.id)).toEqual(['C', 'A', 'B']);
    expect(layout.levels.map((level) => level.yPx)).toEqual([32, 112, 160]);
    expect(layout.levels[2]!.yPx - layout.levels[1]!.yPx).toBe(48);
  });

  it('writes the elevation text with a plus, a sign-free zero and a true minus', () => {
    const layout = layoutLevels([
      { id: 'a', name: 'A', elevationMm: 6000 },
      { id: 'b', name: 'B', elevationMm: 0 },
      { id: 'c', name: 'C', elevationMm: -3000 },
    ]);
    expect(layout.levels.map((level) => level.elevationText)).toEqual(['floor +6.00 m', 'floor ±0.00 m', 'floor −3.00 m']);
  });

  it('gives one level one band of the full height', () => {
    const layout = layoutLevels([{ id: 'a', name: 'A', elevationMm: 5000 }]);
    expect(layout.levels).toHaveLength(1);
    expect(layout.levels[0]!.yPx).toBe(32);
    expect(layout.heightPx).toBe(64);
    expect(layout.levelLinesPx).toEqual([]);
    expect([layout.levels[0]!.bandTopPx, layout.levels[0]!.bandBottomPx]).toEqual([0, 64]);
  });

  it('gives an empty frame for no level', () => {
    expect(layoutLevels([])).toEqual({ levels: [], heightPx: 64, levelLinesPx: [] });
  });
});

describe('typeFilters', () => {
  const risers = [
    riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 's']]),
    riser('r2', 'Supply air riser 2', SUPPLY, [['L0', 's']]),
    riser('r3', 'Chilled water riser 1', CHILLED, [['L0', 's']]),
    riser('r4', 'Exhaust air riser 1', EXHAUST, [['L0', 's']]),
  ];

  it('lists each type once, sorted by name, with its count', () => {
    expect(typeFilters(risers, new Set())).toEqual([
      { networkTypeId: 'cw', name: 'Chilled water', color: '#4caf50', linePattern: 'dotted', count: 1, shown: true },
      { networkTypeId: 'exh', name: 'Exhaust air', color: '#ff9800', linePattern: 'dashed', count: 1, shown: true },
      { networkTypeId: 'sup', name: 'Supply air', color: '#2196f3', linePattern: 'solid', count: 2, shown: true },
    ]);
  });

  it('marks a hidden type as not shown', () => {
    const filters = typeFilters(risers, new Set(['exh']));
    expect(filters.map((filter) => [filter.networkTypeId, filter.shown])).toEqual([
      ['cw', true],
      ['exh', false],
      ['sup', true],
    ]);
  });
});

describe('layoutRisers', () => {
  it('puts risers of one type side by side and adds typeGapPx at a type change', () => {
    const file = building(THREE_LEVELS, [
      riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 's']]),
      riser('r2', 'Supply air riser 2', SUPPLY, [['L0', 's']]),
      riser('r3', 'Chilled water riser 1', CHILLED, [['L0', 's']]),
    ]);
    const lanes = lanesOf(file);
    expect(lanes.map((lane) => lane.label)).toEqual(['Chilled water riser 1', 'Supply air riser 1', 'Supply air riser 2']);
    expect(lanes.map((lane) => lane.xPx)).toEqual([44, 152, 236]);
    expect(lanes[2]!.xPx - lanes[1]!.xPx).toBe(84);
    expect(lanes[1]!.xPx - lanes[0]!.xPx).toBe(108);
  });

  it('orders the risers of one type by the number in the label', () => {
    const file = building(THREE_LEVELS, [
      riser('r10', 'Supply air riser 10', SUPPLY, [['L0', 's']]),
      riser('r2', 'Supply air riser 2', SUPPLY, [['L0', 's']]),
    ]);
    expect(lanesOf(file).map((lane) => lane.label)).toEqual(['Supply air riser 2', 'Supply air riser 10']);
  });

  it('gives no lane to a hidden type and does not count it in the type gap', () => {
    const file = building(THREE_LEVELS, [
      riser('r1', 'Chilled water riser 1', CHILLED, [['L0', 's']]),
      riser('r2', 'Supply air riser 1', SUPPLY, [['L0', 's']]),
    ]);
    const lanes = lanesOf(file, new Set(['cw']));
    expect(lanes.map((lane) => lane.label)).toEqual(['Supply air riser 1']);
    expect(lanes[0]!.xPx).toBe(44);
  });

  it('starts and stops a lane at the highest and lowest member level, and gives no dot to a level without a member', () => {
    const file = building(THREE_LEVELS, [riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 'sheet-L0'], ['L2', 'sheet-L2']])]);
    const [lane] = lanesOf(file);
    expect(lane!.topPx).toBe(32);
    expect(lane!.bottomPx).toBe(160);
    expect(lane!.dots.map((dot) => [dot.levelId, dot.yPx])).toEqual([
      ['L2', 32],
      ['L0', 160],
    ]);
  });

  it('skips a member whose level is unknown to the layout', () => {
    const file = building(THREE_LEVELS, [riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 'a'], ['L1', 'b'], ['L2', 'c']])]);
    const layout = layoutLevels(file.levels.filter((level) => level.id !== 'L1'));
    const [lane] = layoutRisers(file, layout, new Set(), new Set()).lanes;
    expect(lane!.dots.map((dot) => dot.levelId)).toEqual(['L2', 'L0']);
  });

  it('has no lane for a riser whose members are all on unknown levels', () => {
    const file = building([], [riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 'a']])]);
    expect(layoutRisers(file, layoutLevels(file.levels), new Set(), new Set())).toEqual({ lanes: [], widthPx: 320 });
  });

  it('gives the dots the status of each member', () => {
    const pending: RiserPendingOp[] = [{ seq: 1, sheetId: 'sheet-L0', kind: 'retag', networkTypeId: 'exh' }];
    const file = building(THREE_LEVELS, [riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 'sheet-L0'], ['L2', 'sheet-L2']], pending)]);
    const [lane] = lanesOf(file, new Set(), new Set(['r1|sheet-L2']));
    expect(lane!.dots.map((dot) => [dot.levelId, dot.status])).toEqual([
      ['L2', 'off'],
      ['L0', 'waiting'],
    ]);
  });

  it('grows the width with the last lane and keeps minWidthPx for a short diagram', () => {
    const short = building(THREE_LEVELS, [riser('r1', 'Supply air riser 1', SUPPLY, [['L0', 's']])]);
    expect(layoutRisers(short, layoutLevels(short.levels), new Set(), new Set()).widthPx).toBe(320);
    const wide = building(
      THREE_LEVELS,
      [1, 2, 3, 4, 5].map((n) => riser(`r${n}`, `Supply air riser ${n}`, SUPPLY, [['L0', 's']])),
    );
    expect(layoutRisers(wide, layoutLevels(wide.levels), new Set(), new Set()).widthPx).toBe(424);
  });
});

describe('memberStatus', () => {
  const member = (sheetId: string) => ({ levelId: 'L0', sheetId, pageIndex: 0, fittingId: 'f1' });
  const pending: RiserPendingOp[] = [{ seq: 1, sheetId: 'sheet-a', kind: 'move', toMm: { xMm: 1, yMm: 2 } }];

  it('is ok with no pending op and no conflict', () => {
    expect(memberStatus(riser('r1', 'R', SUPPLY, [['L0', 'sheet-a']]), member('sheet-a'), new Set())).toBe('ok');
  });

  it('is waiting when a pending op names the sheet', () => {
    expect(memberStatus(riser('r1', 'R', SUPPLY, [['L0', 'sheet-a']], pending), member('sheet-a'), new Set())).toBe('waiting');
  });

  it('is off when the conflict key is set', () => {
    expect(memberStatus(riser('r1', 'R', SUPPLY, [['L0', 'sheet-a']]), member('sheet-a'), new Set(['r1|sheet-a']))).toBe('off');
  });

  it('is off rather than waiting when both apply', () => {
    expect(memberStatus(riser('r1', 'R', SUPPLY, [['L0', 'sheet-a']], pending), member('sheet-a'), new Set(['r1|sheet-a']))).toBe('off');
  });
});

describe('riserNumber', () => {
  it('reads the number at the end of a label', () => {
    expect(riserNumber('Supply air riser 12')).toBe(12);
    expect(riserNumber('Supply air riser 007')).toBe(7);
  });

  it('gives null when the label does not end in digits', () => {
    expect(riserNumber('Supply air')).toBeNull();
    expect(riserNumber('riser 3a')).toBeNull();
    expect(riserNumber('')).toBeNull();
  });
});
