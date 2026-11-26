import type { BuildingFile, BuildingFlowResult, BuildingLevel, BuildingSheet, NetworkType, Riser, RiserMember } from '@mepapp/core';
import type { RiserMark } from '@mepapp/render';
import { describe, expect, it } from 'vitest';
import { EMPTY_FLOW, rememberFlow, riserNetworkTypeLookup, withRiserArrows } from './riserArrowMarks.js';

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply air',
  discipline: 'ventilation',
  units: 'm³/h',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
  flowUnit: 'm³/h',
};

const ventReturn: NetworkType = { ...vent, flowSense: 'return' };

const LEVELS: BuildingLevel[] = [
  { id: 'l0', name: 'Level 0', elevationMm: 0 },
  { id: 'l1', name: 'Level 1', elevationMm: 3000 },
  { id: 'l2', name: 'Level 2', elevationMm: 6000 },
];

function fileWith(risers: Riser[]): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: LEVELS,
    sheets: LEVELS.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: `p${index}`,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function memberOf(index: number): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId: `f${index}` };
}

function riserOf(name: string, members: RiserMember[], type: NetworkType = vent): Riser {
  return {
    id: name,
    name,
    networkTypeId: type.id,
    networkType: type,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
  };
}

/** One mark per member of the riser, keyed by the fitting id. */
function marksOf(riser: Riser, extra: Partial<RiserMark> = {}): Map<string, RiserMark> {
  return new Map(
    riser.members.map((member) => [
      member.fittingId,
      { riserId: riser.id, name: riser.name, networkTypeId: riser.networkTypeId, anchorPt: { x: 10, y: 20 }, ...extra },
    ]),
  );
}

function spanOf(from: number, to: number, towardSource: 'from' | 'to' | undefined): BuildingFlowResult['risers'][string]['spans'][number] {
  return {
    riserId: 'R1',
    fromLevelId: `l${from}`,
    toLevelId: `l${to}`,
    fromFittingId: `f${from}`,
    toFittingId: `f${to}`,
    capacity: null,
    state: 'ok',
    complete: true,
    towardSource,
  };
}

/** Source on the given level, two spans of R1 with the given towardSource values (l0-l1, l1-l2). */
function flowOf(sourceLevelId: string | undefined, towardSourceLow: 'from' | 'to', towardSourceHigh: 'from' | 'to'): BuildingFlowResult {
  return {
    risers: { R1: { spans: [spanOf(0, 1, towardSourceLow), spanOf(1, 2, towardSourceHigh)], members: [] } },
    groups: [
      {
        riserIds: ['R1'],
        total: 0,
        complete: true,
        state: 'ok',
        ...(sourceLevelId === undefined ? {} : { sourceLevelId }),
      },
    ],
    warnings: [],
  };
}

/** Source on l0: both spans point away from the source toward Level 2. */
function supplyFromL0(): BuildingFlowResult {
  return flowOf('l0', 'from', 'from');
}

const threeMembers = (): RiserMember[] => [memberOf(0), memberOf(1), memberOf(2)];

function listOf(marks: ReadonlyMap<string, RiserMark>): RiserMark[] {
  return [...marks.values()];
}

/** The mark of fitting `f<index>` from the call for sheet `index`, the sheet of member `index`. */
function markAt(index: number, marks: ReadonlyMap<string, RiserMark>, file: BuildingFile, flow: BuildingFlowResult | null, types: readonly NetworkType[]): RiserMark | undefined {
  return withRiserArrows(marks, file, file.sheets[index], flow, types).get(`f${index}`);
}

describe('withRiserArrows', () => {
  it('gives the supply pairs of a source on Level 0', () => {
    const riser = riserOf('R1', threeMembers());
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect(markAt(0, marks, file, supplyFromL0(), [vent])?.arrows).toEqual({ below: 'none', above: 'up' });
    expect(markAt(1, marks, file, supplyFromL0(), [vent])?.arrows).toEqual({ below: 'up', above: 'up' });
    expect(markAt(2, marks, file, supplyFromL0(), [vent])?.arrows).toEqual({ below: 'up', above: 'none' });
    expect(withRiserArrows(marks, file, file.sheets[0], supplyFromL0(), [vent]).get('f1')).toEqual(marks.get('f1'));
    for (const index of [0, 1, 2]) {
      expect(markAt(index, marks, file, supplyFromL0(), [vent])?.arrowColor).toBe('#2196f3');
      expect(markAt(index, marks, file, supplyFromL0(), [vent])?.arrowPattern).toBe('solid');
    }
  });

  it('flips the pairs for a return type', () => {
    const riser = riserOf('R1', threeMembers(), ventReturn);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect(markAt(0, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'none', above: 'down' });
    expect(markAt(1, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'down', above: 'down' });
    expect(markAt(2, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'down', above: 'none' });
  });

  it('gives the pairs of a source on Level 1 for a return type and for a supply type', () => {
    const riser = riserOf('R1', threeMembers(), ventReturn);
    const flow = flowOf('l1', 'to', 'from');
    const returnResult = markAt(1, marksOf(riser), fileWith([riser]), flow, [ventReturn]);
    expect(returnResult?.arrows).toEqual({ below: 'up', above: 'down' });
    const supplyRiser = riserOf('R1', threeMembers(), vent);
    const supplyResult = markAt(1, marksOf(supplyRiser), fileWith([supplyRiser]), flow, [vent]);
    expect(supplyResult?.arrows).toEqual({ below: 'down', above: 'up' });
  });

  it('takes the color and the pattern from the live type with the same id', () => {
    const riser = riserOf('R1', threeMembers());
    const live: NetworkType = { ...vent, color: '#ff0000', linePattern: 'dashed' };
    const mark = markAt(0, marksOf(riser), fileWith([riser]), supplyFromL0(), [live]);
    expect(mark?.arrowColor).toBe('#ff0000');
    expect(mark?.arrowPattern).toBe('dashed');
  });

  it('takes the flow sense from the riser copy when the live list does not have the id', () => {
    const riser = riserOf('R1', threeMembers(), ventReturn);
    const other: NetworkType = { ...vent, id: 'other' };
    const mark = markAt(0, marksOf(riser), fileWith([riser]), supplyFromL0(), [other]);
    expect(mark?.arrows).toEqual({ below: 'none', above: 'down' });
    expect(mark?.arrowColor).toBe('#2196f3');
    expect(mark?.arrowPattern).toBe('solid');
  });

  it('reads the flow sense from the riser copy, not from the live type: live supply, copy return gives return arrows', () => {
    const riser = riserOf('R1', threeMembers(), ventReturn);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    const live: NetworkType = { ...vent, color: '#00ff00' };
    expect(markAt(0, marks, file, supplyFromL0(), [live])?.arrows).toEqual({ below: 'none', above: 'down' });
    expect(markAt(1, marks, file, supplyFromL0(), [live])?.arrows).toEqual({ below: 'down', above: 'down' });
    expect(markAt(2, marks, file, supplyFromL0(), [live])?.arrows).toEqual({ below: 'down', above: 'none' });
    expect(markAt(0, marks, file, supplyFromL0(), [live])?.arrowColor).toBe('#00ff00');
  });

  it('reads the flow sense from the riser copy, not from the live type: live return, copy supply gives supply arrows', () => {
    const riser = riserOf('R1', threeMembers(), vent);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect(markAt(0, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'none', above: 'up' });
    expect(markAt(1, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'up', above: 'up' });
    expect(markAt(2, marks, file, supplyFromL0(), [ventReturn])?.arrows).toEqual({ below: 'up', above: 'none' });
  });

  it('gives no arrows and no arrow keys when the flow is null and no pair is set by hand', () => {
    const riser = riserOf('R1', threeMembers());
    const marks = marksOf(riser);
    const result = withRiserArrows(marks, fileWith([riser]), fileWith([riser]).sheets[0], null, [vent]);
    expect(listOf(result)).toEqual(listOf(marks));
    for (const mark of result.values()) {
      expect('arrows' in mark).toBe(false);
      expect('arrowColor' in mark).toBe(false);
    }
  });

  it('gives the hand-set pair of one member when the flow is null', () => {
    const riser = riserOf('R1', [memberOf(0), { ...memberOf(1), arrows: { below: 'none', above: 'up' } }, memberOf(2)]);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    const mark = markAt(1, marks, file, null, [vent]);
    expect(mark?.arrows).toEqual({ below: 'none', above: 'up' });
    expect(mark?.arrowColor).toBe('#2196f3');
    expect('arrows' in markAt(0, marks, file, null, [vent])!).toBe(false);
    expect('arrows' in markAt(2, marks, file, null, [vent])!).toBe(false);
  });

  it('gives no arrows for a hand-set pair (none, none), even when the flow gives one', () => {
    const riser = riserOf('R1', [memberOf(0), { ...memberOf(1), arrows: { below: 'none', above: 'none' } }, memberOf(2)]);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect('arrows' in markAt(1, marks, file, supplyFromL0(), [vent])!).toBe(false);
    expect('arrowColor' in markAt(1, marks, file, supplyFromL0(), [vent])!).toBe(false);
    expect(markAt(0, marks, file, supplyFromL0(), [vent])?.arrows).toEqual({ below: 'none', above: 'up' });
  });

  it('gives the hand-set pair over the flow', () => {
    const riser = riserOf('R1', [{ ...memberOf(0), arrows: { below: 'none', above: 'down' } }, memberOf(1), memberOf(2)]);
    const mark = markAt(0, marksOf(riser), fileWith([riser]), supplyFromL0(), [vent]);
    expect(mark?.arrows).toEqual({ below: 'none', above: 'down' });
  });

  it('copies unchanged the marks of an unknown riser and of a fitting that is not a member', () => {
    const riser = riserOf('R1', threeMembers());
    const file = fileWith([riser]);
    const marks = new Map<string, RiserMark>([
      ['f0', { riserId: 'R1', name: 'R1', networkTypeId: 'vent', anchorPt: { x: 1, y: 2 } }],
      ['f9', { riserId: 'R9', name: 'R9', networkTypeId: 'vent', anchorPt: { x: 3, y: 4 } }],
      ['fX', { riserId: 'R1', name: 'R1', networkTypeId: 'vent', anchorPt: { x: 5, y: 6 } }],
    ]);
    const result = withRiserArrows(marks, file, file.sheets[0], supplyFromL0(), [vent]);
    expect(result.get('f9')).toEqual(marks.get('f9'));
    expect(result.get('fX')).toEqual(marks.get('fX'));
    expect('arrows' in result.get('f9')!).toBe(false);
    expect('arrows' in result.get('fX')!).toBe(false);
    expect(result.get('f0')?.arrows).toEqual({ below: 'none', above: 'up' });
  });

  it('copies unchanged a mark whose member level is not in the file', () => {
    const riser = riserOf('R1', [memberOf(0), { levelId: 'l9', sheetId: 's0', pageIndex: 0, fittingId: 'f9' }]);
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect(file.sheets.map((item) => item.id)).toContain('s0');
    expect(riser.members.some((member) => member.fittingId === 'f9' && member.sheetId === 's0')).toBe(true);
    expect(file.levels.map((level) => level.id)).not.toContain('l9');
    expect(() => withRiserArrows(marks, file, file.sheets[0], supplyFromL0(), [vent])).not.toThrow();
    const result = withRiserArrows(marks, file, file.sheets[0], supplyFromL0(), [vent]);
    expect(result.get('f9')).toEqual(marks.get('f9'));
    expect('arrows' in result.get('f9')!).toBe(false);
  });

  it('keeps the other mark fields and does not change the input map or its marks', () => {
    const riser = riserOf('R1', threeMembers());
    const file = fileWith([riser]);
    const marks = marksOf(riser, { undecided: true });
    const before = structuredClone(marks);
    const result = withRiserArrows(marks, file, file.sheets[0], supplyFromL0(), [vent]);
    expect(result.get('f0')).toMatchObject({ undecided: true, name: 'R1', anchorPt: { x: 10, y: 20 } });
    expect(marks).toEqual(before);
    expect(result).not.toBe(marks);
    expect(result.get('f0')).not.toBe(marks.get('f0'));
  });

  it('gives no arrows when the group has no source', () => {
    const riser = riserOf('R1', threeMembers());
    const file = fileWith([riser]);
    const flow = flowOf(undefined, 'from', 'from');
    const result = withRiserArrows(marksOf(riser), file, file.sheets[0], flow, [vent]);
    for (const mark of result.values()) expect('arrows' in mark).toBe(false);
  });

  it('treats a null flow the same as the empty flow', () => {
    const riser = riserOf('R1', threeMembers());
    const file = fileWith([riser]);
    const marks = marksOf(riser);
    expect(listOf(withRiserArrows(marks, file, file.sheets[0], null, [vent]))).toEqual(listOf(withRiserArrows(marks, file, file.sheets[0], EMPTY_FLOW, [vent])));
  });

  it('the same fitting id on three levels: each shown sheet gets the arrows of its own level', () => {
    const riser = riserOf('R1', threeMembers().map((member) => ({ ...member, fittingId: 'rf' })));
    const file = fileWith([riser]);
    const sheetOf = (id: string): BuildingSheet => ({ ...file.sheets[0], id });
    const mark: RiserMark = { riserId: 'R1', name: 'R1', networkTypeId: 'vent', anchorPt: { x: 10, y: 20 } };
    const pairs = ['s0', 's1', 's2'].map((id) => withRiserArrows(new Map([['rf', mark]]), file, sheetOf(id), supplyFromL0(), [vent]).get('rf')?.arrows);
    expect(pairs).toEqual([
      { below: 'none', above: 'up' },
      { below: 'up', above: 'up' },
      { below: 'up', above: 'none' },
    ]);
  });

  it('copies unchanged the mark when the shown sheet matches no member', () => {
    const riser = riserOf('R1', threeMembers().map((member) => ({ ...member, fittingId: 'rf' })));
    const file = fileWith([riser]);
    const mark: RiserMark = { riserId: 'R1', name: 'R1', networkTypeId: 'vent', anchorPt: { x: 10, y: 20 } };
    const result = withRiserArrows(new Map([['rf', mark]]), file, { ...file.sheets[0], id: 's9' }, supplyFromL0(), [vent]);
    expect(result.get('rf')).toEqual(mark);
    expect('arrows' in result.get('rf')!).toBe(false);
  });
});

describe('rememberFlow', () => {
  const building = { id: 'b1' };
  const other = { id: 'b2' };
  const flowA: BuildingFlowResult = supplyFromL0();
  const flowB: BuildingFlowResult = flowOf('l1', 'to', 'from');

  it('stores a current flow when there is no memory', () => {
    expect(rememberFlow(null, building, flowA)).toEqual({ building, flow: flowA });
  });

  it('keeps the memory when the flow is null and the building is the same', () => {
    const previous = { building, flow: flowA };
    expect(rememberFlow(previous, building, null)).toBe(previous);
  });

  it('clears the memory when the flow is null and the building is another one', () => {
    expect(rememberFlow({ building, flow: flowA }, other, null)).toBeNull();
  });

  it('replaces the memory with a new flow of the same building', () => {
    expect(rememberFlow({ building, flow: flowA }, building, flowB)).toEqual({ building, flow: flowB });
  });

  it('keeps the same memory object when the current flow is the same object', () => {
    const previous = { building, flow: flowA };
    expect(rememberFlow(previous, building, flowA)).toBe(previous);
  });

  it('gives null when there is no memory and no flow', () => {
    expect(rememberFlow(null, building, null)).toBeNull();
  });
});

describe('riserNetworkTypeLookup', () => {
  it('gives the live type found by id, as the same object', () => {
    const live: NetworkType = { ...vent, color: '#ff0000' };
    const riser = riserOf('R1', threeMembers());
    expect(riserNetworkTypeLookup([live])(riser)).toBe(live);
  });

  it('gives riser.networkType when the id is not in the live list', () => {
    const other: NetworkType = { ...vent, id: 'other' };
    const riser = { ...riserOf('R1', threeMembers(), ventReturn), networkTypeId: 'other', networkType: other };
    expect(riserNetworkTypeLookup([vent])(riser)).toBe(other);
  });
});
