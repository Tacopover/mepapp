import type { BuildingFile, BuildingFlowGroup, BuildingFlowResult, BuildingFlowSpan, BuildingLevel, NetworkType, Riser, RiserMember, RiserSpanArrow, SheetSummary } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { derivedFlowOf, detachedText, END_OPTIONS, flowTailOf, riserFlowText, riserLineText, riserRows } from './riserInfo.js';

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

  it('marks the row of a member with hand-set arrows as arrowsByHand', () => {
    const file = fileWith([makeRiser('1', [member(0), member(1, { arrows: { below: 'none', above: 'up' } }), member(2)])]);
    const rows = riserRows(file, file.risers[0], new Set());
    expect(rows.map((row) => [row.levelName, row.arrowsByHand])).toEqual([
      ['Level 2', false],
      ['Level 1', true],
      ['Basement', false],
    ]);
  });

  it('gives arrowsByHand false for a row of a member on an unknown level', () => {
    const file = fileWith([makeRiser('1', [member(0), { levelId: 'lX', sheetId: 's9', pageIndex: 0, fittingId: 'g' }])]);
    const rows = riserRows(file, file.risers[0], new Set());
    expect(rows.map((row) => row.arrowsByHand)).toEqual([false, false]);
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

describe('riserFlowText and flowTailOf', () => {
  const upSpan = (fromLevelId: string, toLevelId: string): RiserSpanArrow => ({ fromLevelId, toLevelId, direction: 'up' });
  const unknownSpan = (fromLevelId: string, toLevelId: string): RiserSpanArrow => ({ fromLevelId, toLevelId, direction: 'unknown' });
  const spanOf = (fromLevelId: string, toLevelId: string): BuildingFlowSpan => ({
    riserId: '1',
    fromLevelId,
    toLevelId,
    fromFittingId: 'f',
    toFittingId: 'g',
    capacity: 50,
    state: 'ok',
    complete: true,
    towardSource: 'from',
  });
  function flowOf(spans: BuildingFlowSpan[], group: Partial<BuildingFlowGroup> = {}, warnings: string[] = []): BuildingFlowResult {
    return {
      risers: { '1': { spans, members: [] } },
      groups: [{ riserIds: ['1'], total: 100, complete: true, state: 'ok', ...group }],
      warnings,
    };
  }
  const solved = flowOf([spanOf('l0', 'l1')], { sourceLevelId: 'l0' });
  const returnType: NetworkType = { ...vent, flowSense: 'return' };

  it('reads the saved summaries while the flow is not loaded', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(fileWith([riser]), riser, null, [])).toEqual({ text: 'Reading the saved summaries…', byHand: false, notes: [] });
  });

  it('gives the one-level text when the riser has no span', () => {
    const riser = makeRiser('1', [member(1)]);
    expect(riserFlowText(fileWith([riser]), riser, flowOf([]), []).text).toBe('No arrows. This riser has one level.');
  });

  it('gives Away from the source with the flow solve origin for a supply riser', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')])).toEqual({
      text: 'Away from Basement · from the flow solve',
      byHand: false,
      notes: [],
    });
  });

  it('gives Toward the source for a return riser', () => {
    const riser = makeRiser('1', [member(0), member(1)], { networkType: returnType });
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')]).text).toBe('Toward Basement · from the flow solve');
  });

  it('gives the Set by hand origin when the riser source is the main level', () => {
    const riser = makeRiser('1', [member(0), member(1)], { sourceLevelId: 'l0' });
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')])).toEqual({
      text: 'Away from Basement · Set by hand',
      byHand: true,
      notes: [],
    });
  });

  it('gives the no-arrow text when every span has the same height', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(riserFlowText(fileWith([riser]), riser, solved, [unknownSpan('l0', 'l1')]).text).toBe(
      'No arrows. The levels of this riser have the same height.',
    );
  });

  it('gives the reason of the unknown group when there is no main level', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { state: 'unknown' }, ['Riser Supply air riser 1 is part of a loop.']);
    expect(riserFlowText(fileWith([riser]), riser, flow, [unknownSpan('l0', 'l1')]).text).toBe('No arrows yet: the risers make a loop.');
  });

  it('gives the main level of the group when it is a level of the other riser', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const other = makeRiser('2', [member(2), member(3)]);
    const flow: BuildingFlowResult = {
      risers: { '1': { spans: [spanOf('l0', 'l1')], members: [] } },
      groups: [{ riserIds: ['1', '2'], total: 100, complete: true, state: 'ok', sourceLevelId: 'l2' }],
      warnings: [],
    };
    expect(riserFlowText(fileWith([riser, other]), riser, flow, [upSpan('l0', 'l1')]).text).toBe('Away from Level 2 · from the flow solve');
  });

  it('gives from the flow solve when the riser source differs from the main level', () => {
    const riser = makeRiser('1', [member(0), member(1)], { sourceLevelId: 'l1' });
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')]).text).toBe('Away from Basement · from the flow solve');
  });

  it('gives no source level when the main level is not a known level and every span is unknown', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { sourceLevelId: 'lX' });
    expect(riserFlowText(fileWith([riser]), riser, flow, [unknownSpan('l0', 'l1')]).text).toBe('No arrows yet: no source level.');
  });

  it('gives no source level for an at-most group even when a warning names another reason', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { state: 'unknown', atMost: true }, ['Riser Supply air riser 1 is part of a loop.']);
    expect(riserFlowText(fileWith([riser]), riser, flow, [unknownSpan('l0', 'l1')]).text).toBe('No arrows yet: no source level.');
  });

  it('gives the more-than-one-source reason of the unknown group', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { state: 'unknown' }, ['Riser Supply air riser 1 has more than one source level.']);
    expect(riserFlowText(fileWith([riser]), riser, flow, [unknownSpan('l0', 'l1')]).text).toBe(
      'No arrows yet: more than one source level.',
    );
  });

  it('gives no source level when the unknown group has no reason text', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { state: 'unknown' });
    expect(riserFlowText(fileWith([riser]), riser, flow, [unknownSpan('l0', 'l1')]).text).toBe('No arrows yet: no source level.');
  });

  it('adds the grey line for a direction set by hand', () => {
    const riser = makeRiser('1', [member(0), member(1)], { flow: 'up' });
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')])).toEqual({
      text: 'Away from Basement · from the flow solve',
      byHand: true,
      notes: ['Direction set by hand: Up. The arrows do not use it.'],
    });
  });

  it('adds the grey line for rings with arrows set by hand, after the direction line', () => {
    const riser = makeRiser('1', [member(0), member(1, { arrows: { below: 'none', above: 'up' } })], { flow: 'down' });
    expect(riserFlowText(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')]).notes).toEqual([
      'Direction set by hand: Down. The arrows do not use it.',
      'Some rings use arrows set by hand. The diagram shows the flow solve.',
    ]);
  });

  it('gives no tail when the group has no source', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    const flow = flowOf([spanOf('l0', 'l1')], { state: 'unknown' });
    expect(flowTailOf(fileWith([riser]), riser, flow, [upSpan('l0', 'l1')])).toBe('');
  });

  it('gives no tail with no flow', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(flowTailOf(fileWith([riser]), riser, null, [upSpan('l0', 'l1')])).toBe('');
  });

  it('gives the away-from tail for a supply riser', () => {
    const riser = makeRiser('1', [member(0), member(1)]);
    expect(flowTailOf(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')])).toBe(', flow away from Basement');
  });

  it('gives the toward tail for a return riser', () => {
    const riser = makeRiser('1', [member(0), member(1)], { networkType: returnType });
    expect(flowTailOf(fileWith([riser]), riser, solved, [upSpan('l0', 'l1')])).toBe(', flow toward Basement');
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
