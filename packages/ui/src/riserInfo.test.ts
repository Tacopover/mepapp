import type { BuildingFile, BuildingLevel, DerivedRiserFlow, NetworkType, Riser, RiserMember, SheetSummary } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { derivedFlowOf, detachedText, END_OPTIONS, riserFlowText, riserLineText, riserRows } from './riserInfo.js';

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply air',
  discipline: 'ventilation',
  units: 'CFM',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
};

const levels: BuildingLevel[] = [
  { id: 'l0', name: 'Basement', elevationMm: 0 },
  { id: 'l1', name: 'Level 1', elevationMm: 3000 },
  { id: 'l2', name: 'Level 2', elevationMm: 6000 },
  { id: 'l3', name: 'Level 3', elevationMm: 9000 },
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
      projectUuid: `uuid-${index}`,
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

function makeRiser(id: string, members: RiserMember[], extra: Partial<Riser> = {}): Riser {
  return {
    id,
    name: `Supply air riser ${id}`,
    networkTypeId: vent.id,
    networkType: vent,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
    ...extra,
  };
}

function summaryWith(riserFittingFlow: SheetSummary['riserFittingFlow']): SheetSummary {
  return {
    version: 2,
    projectUuid: 'uuid',
    savedAt: '2026-11-10T00:00:00.000Z',
    sourceSizeBytes: 0,
    sourceModifiedMs: 0,
    pages: {},
    tables: [],
    warnings: [],
    riserFittingFlow,
  };
}

const derivedUp: DerivedRiserFlow = { flow: 'up', sourceLevelId: 'l0', fromSolve: true };

describe('riserRows', () => {
  it('orders the members from the highest level down', () => {
    const file = fileWith([makeRiser('1', [member(0), member(2), member(1)])]);
    const rows = riserRows(file, file.risers[0], new Set());
    expect(rows.map((row) => row.levelName)).toEqual(['Level 2', 'Level 1', 'Basement']);
  });

  it('gives ok, waiting, off and gone with off over waiting', () => {
    const file = fileWith([
      makeRiser(
        '1',
        [member(0), member(1), member(2), { levelId: 'lX', sheetId: 's9', pageIndex: 0, fittingId: 'g' }],
        {
          pending: [
            { seq: 0, sheetId: 's1', kind: 'move', toMm: { xMm: 1, yMm: 1 } },
            { seq: 1, sheetId: 's2', kind: 'move', toMm: { xMm: 1, yMm: 1 } },
          ],
        },
      ),
    ]);
    const rows = riserRows(file, file.risers[0], new Set(['1|s2']));
    expect(rows.map((row) => [row.levelName, row.status, row.statusText])).toEqual([
      ['Level 2', 'off', '⚠ Not at position'],
      ['Level 1', 'waiting', '◔ Waiting'],
      ['Basement', 'ok', '✓ OK'],
      ['Deleted level', 'gone', 'Level is gone'],
    ]);
  });

  it('keeps the file order for two members on one elevation', () => {
    const twin: BuildingLevel[] = [{ id: 'l0', name: 'Basement', elevationMm: 0 }, { id: 'lA', name: 'Shaft A', elevationMm: 0 }];
    const file = fileWith(
      [makeRiser('1', [member(0), { levelId: 'lA', sheetId: 's1', pageIndex: 0, fittingId: 'h' }])],
      twin,
    );
    const rows = riserRows(file, file.risers[0], new Set());
    expect(rows.map((row) => row.levelName)).toEqual(['Basement', 'Shaft A']);
  });

  it('returns the sheet of the member and its connection height', () => {
    const file = fileWith([makeRiser('1', [member(1, { connectionHeightMm: 900 })])]);
    const [row] = riserRows(file, file.risers[0], new Set());
    expect(row.sheet?.id).toBe('s1');
    expect(row.connectionHeightMm).toBe(900);
  });
});

describe('riserLineText', () => {
  it('gives the first and last level, the count and the length for four levels', () => {
    const riser = makeRiser('1', [member(0), member(1), member(2), member(3)]);
    expect(riserLineText(fileWith([riser]), riser)).toBe('Basement to Level 3 · 4 levels · 9.00 m');
  });

  it('gives the length of the members only when the members are on Basement and Level 2', () => {
    const riser = makeRiser('1', [member(0), member(2)]);
    expect(riserLineText(fileWith([riser]), riser)).toBe('Basement to Level 2 · 2 levels · 6.00 m');
  });

  it('gives the one level text with no length', () => {
    const riser = makeRiser('1', [member(1)]);
    expect(riserLineText(fileWith([riser]), riser)).toBe('Level 1 · 1 level · Length unknown');
  });

  it('gives No level left when every member is on an unknown level', () => {
    const riser = makeRiser('1', [{ levelId: 'lX', sheetId: 's9', pageIndex: 0, fittingId: 'g' }]);
    expect(riserLineText(fileWith([riser]), riser)).toBe('No level left');
  });

  it('gives 3.00 m for levels from -3000 to 0', () => {
    const negative: BuildingLevel[] = [
      { id: 'l0', name: 'Basement', elevationMm: -3000 },
      { id: 'l1', name: 'Ground', elevationMm: 0 },
    ];
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserLineText(fileWith([riser], negative), riser)).toBe('Basement to Ground · 2 levels · 3.00 m');
  });

  it('gives 0.00 m for two members on equal elevation', () => {
    const twin: BuildingLevel[] = [{ id: 'l0', name: 'Basement', elevationMm: 0 }, { id: 'lA', name: 'Shaft A', elevationMm: 0 }];
    const riser = makeRiser('1', [member(0), { levelId: 'lA', sheetId: 's1', pageIndex: 0, fittingId: 'h' }]);
    expect(riserLineText(fileWith([riser], twin), riser)).toBe('Basement to Shaft A · 2 levels · 0.00 m');
  });
});

describe('riserFlowText', () => {
  const file = fileWith([]);

  it('gives the derived direction with the source', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(file, riser, derivedUp)).toEqual({
      text: 'Up · source: Basement · from the flow solve',
      byHand: false,
    });
  });

  it('gives Not known yet as source when the solve has no source', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(file, riser, { flow: 'down', fromSolve: true })).toEqual({
      text: 'Down · source: Not known yet · from the flow solve',
      byHand: false,
    });
  });

  it('gives Not known yet when nothing is solved', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(file, riser, undefined)).toEqual({ text: 'Not known yet', byHand: false });
  });

  it('gives both direction and source when both are set by hand', () => {
    const riser = makeRiser('1', [member(0), member(1)], { flow: 'both', sourceLevelId: 'l1' });
    expect(riserFlowText(file, riser, derivedUp)).toEqual({
      text: 'Both · source: Level 1 · Set by hand',
      byHand: true,
    });
  });

  it('gives the derived direction with the hand source when only the source is set', () => {
    const riser = makeRiser('1', [member(0), member(1)], { sourceLevelId: 'l1' });
    expect(riserFlowText(file, riser, derivedUp)).toEqual({
      text: 'Up · source: Level 1 · Set by hand',
      byHand: true,
    });
  });

  it('gives the hand direction with the flow solve source when only the direction is set', () => {
    const riser = makeRiser('1', [member(0), member(1)], { flow: 'down' });
    expect(riserFlowText(file, riser, derivedUp)).toEqual({
      text: 'Down · source: from the flow solve · Set by hand',
      byHand: true,
    });
  });

  it('gives the source part alone when the direction is not known', () => {
    const riser = makeRiser('1', [member(0), member(1)], { sourceLevelId: 'l1' });
    expect(riserFlowText(file, riser, undefined)).toEqual({
      text: 'source: Level 1 · Set by hand',
      byHand: true,
    });
  });
});

describe('derivedFlowOf', () => {
  it('gives up with the bottom level as source for an out fitting on the bottom level', () => {
    const file = fileWith([makeRiser('r', [member(0, { fittingId: 'f1' }), member(1), member(2)])]);
    const summaries = new Map([['uuid-0', summaryWith({ f1: 'out' })]]);
    expect(derivedFlowOf(file, summaries)).toEqual({
      r: { flow: 'up', sourceLevelId: 'l0', fromSolve: true },
    });
  });

  it('gives unknown for a sheet with no projectUuid', () => {
    const file = fileWith([makeRiser('r', [member(0, { fittingId: 'f1' }), member(1)])]);
    file.sheets[0] = { ...file.sheets[0], projectUuid: null };
    const summaries = new Map([['uuid-0', summaryWith({ f1: 'out' })]]);
    expect(derivedFlowOf(file, summaries)).toEqual({
      r: { flow: 'unknown', fromSolve: false },
    });
  });
});

describe('END_OPTIONS', () => {
  it('gives the three end kinds with their labels', () => {
    expect(END_OPTIONS).toEqual([
      { value: 'member', label: 'Next level' },
      { value: 'open', label: 'Open' },
      { value: 'capped', label: 'Capped' },
    ]);
  });
});

describe('detachedText', () => {
  it('names the riser and the level', () => {
    expect(detachedText('Supply air riser 1', 'Level 2')).toBe('Supply air riser 1 detached from Level 2.');
  });
});
