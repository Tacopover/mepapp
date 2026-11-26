import { RISER_ARROW_PICTOGRAMS, type BuildingFile, type BuildingFlowResult, type BuildingLevel, type NetworkType, type Riser, type RiserMember } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { ARROW_CHOICES, arrowChoiceOf, arrowsValueText, chosenArrowId, editRingArrows, nextArrowIndex, ringArrowsViewOf } from './riserArrowPicker.js';

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
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId: 'rf' };
}

function riserOf(id: string, name: string, members: RiserMember[] = [0, 1, 2].map(memberOf)): Riser {
  return {
    id,
    name,
    networkTypeId: vent.id,
    networkType: vent,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
  };
}

function spanOf(from: number, to: number, towardSource: 'from' | 'to'): BuildingFlowResult['risers'][string]['spans'][number] {
  return {
    riserId: 'r1',
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

/** Source on l0: both spans point away from the source toward Level 2. */
function supplyFromL0(): BuildingFlowResult {
  return {
    risers: { r1: { spans: [spanOf(0, 1, 'from'), spanOf(1, 2, 'from')], members: [] } },
    groups: [{ riserIds: ['r1'], total: 0, complete: true, state: 'ok', sourceLevelId: 'l0' }],
    warnings: [],
  };
}

describe('ARROW_CHOICES', () => {
  it('has nine entries: the eight pictograms in order, then none', () => {
    expect(ARROW_CHOICES).toHaveLength(9);
    for (let index = 0; index < 8; index++) {
      const { number, below, above } = RISER_ARROW_PICTOGRAMS[index]!;
      expect(ARROW_CHOICES[index]!.pictogram).toBe(number);
      expect(ARROW_CHOICES[index]!.pair).toEqual({ below, above });
      expect(ARROW_CHOICES[index]!.id).toBe(`p${number}`);
    }
  });

  it('has the titles of the eight pictograms, word for word', () => {
    expect(ARROW_CHOICES.slice(0, 8).map((choice) => choice.title)).toEqual([
      'Comes up, goes up',
      'Goes up',
      'Comes up',
      'Comes down, goes down',
      'Comes down',
      'Goes down',
      'Goes up, goes down',
      'Comes up, comes down',
    ]);
  });

  it('ends with none, the pair (none, none) and no pictogram', () => {
    expect(ARROW_CHOICES[8]).toMatchObject({ id: 'none', pictogram: null, pair: { below: 'none', above: 'none' } });
    expect(ARROW_CHOICES[8]!.title).toBe('No arrows');
  });
});

describe('arrowChoiceOf', () => {
  it('maps each of the nine pairs back to its own choice', () => {
    for (const choice of ARROW_CHOICES) {
      expect(arrowChoiceOf(choice.pair)).toBe(choice);
    }
  });
});

describe('nextArrowIndex', () => {
  it('moves by one step left and right, and by one row up and down, clamped to 0..8', () => {
    expect(nextArrowIndex(0, 'ArrowRight')).toBe(1);
    expect(nextArrowIndex(0, 'ArrowLeft')).toBe(0);
    expect(nextArrowIndex(1, 'ArrowDown')).toBe(5);
    expect(nextArrowIndex(5, 'ArrowDown')).toBe(8);
    expect(nextArrowIndex(5, 'ArrowUp')).toBe(1);
    expect(nextArrowIndex(2, 'ArrowUp')).toBe(0);
    expect(nextArrowIndex(8, 'ArrowRight')).toBe(8);
  });

  it('moves to the first and the last choice with Home and End', () => {
    expect(nextArrowIndex(5, 'Home')).toBe(0);
    expect(nextArrowIndex(2, 'End')).toBe(8);
  });

  it('gives null for a key that is not handled', () => {
    expect(nextArrowIndex(3, 'a')).toBeNull();
  });
});

describe('ringArrowsViewOf', () => {
  it('gives null for a file that is null', () => {
    expect(ringArrowsViewOf(null, 's0', 'rf', null)).toBeNull();
  });

  it('gives null for a fitting that no member has on the sheet', () => {
    const file = fileWith([riserOf('r1', 'R1')]);
    expect(ringArrowsViewOf(file, 's0', 'unknown', supplyFromL0())).toBeNull();
    expect(ringArrowsViewOf(file, 's9', 'rf', supplyFromL0())).toBeNull();
  });

  it('gives the flow pair of the ring when the riser has a source', () => {
    const file = fileWith([riserOf('r1', 'R1')]);
    expect(ringArrowsViewOf(file, 's0', 'rf', supplyFromL0())).toEqual({
      riserId: 'r1',
      riserName: 'R1',
      levelId: 'l0',
      pair: { below: 'none', above: 'up' },
      pictogram: 2,
      handSet: false,
    });
  });

  it('gives the hand-set pair over the flow pair', () => {
    const members = [memberOf(0), { ...memberOf(1), arrows: { below: 'down' as const, above: 'down' as const } }, memberOf(2)];
    const file = fileWith([riserOf('r1', 'R1', members)]);
    expect(ringArrowsViewOf(file, 's1', 'rf', supplyFromL0())).toEqual({
      riserId: 'r1',
      riserName: 'R1',
      levelId: 'l1',
      pair: { below: 'down', above: 'down' },
      pictogram: 4,
      handSet: true,
    });
  });

  it('gives the hand-set ring with a null flow, and no pictogram for a ring without a hand-set pair', () => {
    const members = [memberOf(0), { ...memberOf(1), arrows: { below: 'down' as const, above: 'down' as const } }, memberOf(2)];
    const file = fileWith([riserOf('r1', 'R1', members)]);
    expect(ringArrowsViewOf(file, 's1', 'rf', null)).toMatchObject({ pictogram: 4, handSet: true });
    expect(ringArrowsViewOf(file, 's0', 'rf', null)).toMatchObject({ pair: { below: 'none', above: 'none' }, pictogram: null, handSet: false });
  });
});

describe('arrowsValueText and chosenArrowId', () => {
  const base = { riserId: 'r1', riserName: 'R1', levelId: 'l0' };

  it('gives the three texts of the value', () => {
    expect(arrowsValueText({ ...base, pair: { below: 'down', above: 'down' }, pictogram: 4, handSet: true })).toBe('Set by hand');
    expect(arrowsValueText({ ...base, pair: { below: 'none', above: 'up' }, pictogram: 2, handSet: false })).toBe('From the flow solve');
    expect(arrowsValueText({ ...base, pair: { below: 'none', above: 'none' }, pictogram: null, handSet: false })).toBe('None yet');
  });

  it('gives null when the ring is not set by hand', () => {
    expect(chosenArrowId({ ...base, pair: { below: 'none', above: 'up' }, pictogram: 2, handSet: false })).toBeNull();
  });

  it('gives the choice id when the ring is set by hand', () => {
    expect(chosenArrowId({ ...base, pair: { below: 'down', above: 'down' }, pictogram: 4, handSet: true })).toBe('p4');
    expect(chosenArrowId({ ...base, pair: { below: 'none', above: 'none' }, pictogram: null, handSet: true })).toBe('none');
  });
});

describe('editRingArrows', () => {
  it('sets a pair and leaves the input file unchanged', () => {
    const file = fileWith([riserOf('r1', 'R1')]);
    const result = editRingArrows(file, 'r1', 'l1', { below: 'down', above: 'down' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file).not.toBe(file);
    expect(result.file.risers[0]!.members[1]!.arrows).toEqual({ below: 'down', above: 'down' });
    expect(file.risers[0]!.members[1]!.arrows).toBeUndefined();
  });

  it('gives the same file object and no warning for the same pair again', () => {
    const first = editRingArrows(fileWith([riserOf('r1', 'R1')]), 'r1', 'l1', { below: 'down', above: 'down' });
    if (!first.ok) throw new Error('first write failed');
    const again = editRingArrows(first.file, 'r1', 'l1', { below: 'down', above: 'down' });
    expect(again).toEqual({ ok: true, file: first.file, warning: null });
    expect(again.ok && again.file).toBe(first.file);
  });

  it('clears the pair with null, and gives the same file object when no pair is set', () => {
    const set = editRingArrows(fileWith([riserOf('r1', 'R1')]), 'r1', 'l1', { below: 'down', above: 'down' });
    if (!set.ok) throw new Error('set failed');
    const cleared = editRingArrows(set.file, 'r1', 'l1', null);
    expect(cleared.ok && cleared.file.risers[0]!.members[1]!.arrows).toBeUndefined();
    const plain = fileWith([riserOf('r1', 'R1')]);
    expect(editRingArrows(plain, 'r1', 'l1', null)).toEqual({ ok: true, file: plain, warning: null });
  });

  it('gives the riser text for an unknown riser id and an unknown level id', () => {
    const file = fileWith([riserOf('r1', 'R1')]);
    const gone = { ok: false, text: 'This riser does not exist any more.' };
    expect(editRingArrows(file, 'r9', 'l1', { below: 'down', above: 'down' })).toEqual(gone);
    expect(editRingArrows(file, 'r1', 'l9', { below: 'down', above: 'down' })).toEqual(gone);
  });
});

describe('editRingArrows warning', () => {
  it('warns once when two neighbouring rings disagree on their span, and not for the same warning again', () => {
    const first = editRingArrows(fileWith([riserOf('r1', 'R1')]), 'r1', 'l0', { below: 'none', above: 'up' });
    if (!first.ok) throw new Error('first write failed');
    expect(first.warning).toBeNull();
    const second = editRingArrows(first.file, 'r1', 'l1', { below: 'down', above: 'none' });
    if (!second.ok) throw new Error('second write failed');
    expect(second.warning).toBe('Arrows of R1 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.');
    const third = editRingArrows(second.file, 'r1', 'l1', { below: 'down', above: 'up' });
    expect(third.ok && third.warning).toBeNull();
  });

  it('names the riser of the warning when a second riser disagrees', () => {
    const file = fileWith([riserOf('r1', 'R1'), riserOf('r2', 'R2')]);
    const r1Low = editRingArrows(file, 'r1', 'l0', { below: 'none', above: 'up' });
    if (!r1Low.ok) throw new Error('write failed');
    const r1High = editRingArrows(r1Low.file, 'r1', 'l1', { below: 'down', above: 'none' });
    if (!r1High.ok) throw new Error('write failed');
    const r2Low = editRingArrows(r1High.file, 'r2', 'l0', { below: 'none', above: 'up' });
    if (!r2Low.ok) throw new Error('write failed');
    expect(r2Low.warning).toBeNull();
    const r2High = editRingArrows(r2Low.file, 'r2', 'l1', { below: 'down', above: 'none' });
    expect(r2High.ok && r2High.warning).toBe('Arrows of R2 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.');
  });
});
