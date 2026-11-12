import { calibrationFromScale, type BuildingFile, type BuildingSheet, type NetworkType, type Riser } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  makeRiserScaleHint,
  planScaleChange,
  scaleCancelMessage,
  scaleDialogBody,
  scaleDialogTitle,
  scaleDisconnectHint,
  scaleDisconnectLabel,
  scaleDisconnectMessage,
  scaleMismatchText,
  scaleRowChange,
  scaleSetAllHint,
  scaleSetAllLabel,
  scaleSetAllMessage,
  scaleSetFailedText,
  type ScaleChangePlan,
  type ScaleRow,
} from './riserScale.js';

const ppmm100 = calibrationFromScale(100).pageUnitsPerRealUnit;
const ppmm50 = calibrationFromScale(50).pageUnitsPerRealUnit;

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

function baseFile(risers: Riser[] = []): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: [
      { id: 'l0', name: 'Basement', elevationMm: 0 },
      { id: 'l1', name: 'Ground', elevationMm: 3000 },
      { id: 'l2', name: 'First', elevationMm: 6000 },
    ],
    sheets: [0, 1, 2].map((index) => ({
      id: `s${index}`,
      levelId: `l${index}`,
      projectUuid: `u${index}`,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function riserOn(id: string, name: string, sheetIds: string[]): Riser {
  return {
    id,
    name,
    networkTypeId: vent.id,
    networkType: vent,
    anchorMm: { xMm: 1000, yMm: 2000 },
    flow: 'up',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members: sheetIds.map((sheetId) => ({ levelId: `l${sheetId.slice(1)}`, sheetId, pageIndex: 0, fittingId: `f-${id}-${sheetId}` })),
    pending: [],
  };
}

function sheetOf(file: BuildingFile, sheetId: string): BuildingSheet {
  const sheet = file.sheets.find((candidate) => candidate.id === sheetId);
  if (sheet === undefined) throw new Error(`no sheet ${sheetId}`);
  return sheet;
}

function planFor(
  file: BuildingFile,
  sheetId: string,
  scaleOf: (sheet: BuildingSheet) => number | null,
  isOpen: (sheet: BuildingSheet) => boolean = () => true,
): ScaleChangePlan {
  const plan = planScaleChange(file, { sheet: sheetOf(file, sheetId), nextPageUnitsPerRealUnit: ppmm100, scaleOf, isOpen });
  if (plan === null) throw new Error('expected a plan');
  return plan;
}

const allAt50 = (): number => ppmm50;

describe('planScaleChange', () => {
  it('returns null when the shown sheet has no riser', () => {
    const file = baseFile([]);
    const plan = planScaleChange(file, { sheet: sheetOf(file, 's0'), nextPageUnitsPerRealUnit: ppmm100, scaleOf: allAt50, isOpen: () => true });
    expect(plan).toBeNull();
  });

  it('returns null when every other sheet of the group already has the new scale', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const plan = planScaleChange(file, { sheet: sheetOf(file, 's0'), nextPageUnitsPerRealUnit: ppmm100, scaleOf: () => ppmm100, isOpen: () => true });
    expect(plan).toBeNull();
  });

  it('treats a scale equal within 1e-6 relative as equal', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const plan = planScaleChange(file, {
      sheet: sheetOf(file, 's0'),
      nextPageUnitsPerRealUnit: ppmm100,
      scaleOf: () => ppmm100 * (1 + 1e-9),
      isOpen: () => true,
    });
    expect(plan).toBeNull();
  });

  it('counts an unknown scale as different', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const plan = planFor(file, 's0', (sheet) => (sheet.id === 's0' ? ppmm50 : null));
    expect(plan.rows[1]?.changes).toBe(true);
    expect(plan.rows[1]?.nowDenominator).toBeNull();
  });

  it('reads the previous and new denominators and marks the shown row', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1', 's2'])]);
    const plan = planFor(file, 's0', (sheet) => (sheet.id === 's1' ? ppmm100 : ppmm50));
    expect(plan.previousDenominator).toBe(50);
    expect(plan.newDenominator).toBe(100);
    expect(plan.levelName).toBe('Basement');
    expect(plan.rows[0]).toEqual({ sheetId: 's0', levelName: 'Basement', isCurrent: true, nowDenominator: 50, newDenominator: 100, changes: true, open: true });
    expect(plan.rows[1]?.changes).toBe(false);
    expect(plan.rows[2]?.changes).toBe(true);
  });

  it('lists the risers that touch the shown sheet in file order', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s2', 's0']), riserOn('r2', 'R2', ['s0', 's1']), riserOn('r3', 'R3', ['s1', 's2'])]);
    const plan = planFor(file, 's0', allAt50);
    expect(plan.riserIds).toEqual(['r1', 'r2']);
    expect(plan.riserNames).toEqual(['R1', 'R2']);
  });

  it('orders the rows by the index of the level in the file', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s2', 's0'])]);
    const plan = planFor(file, 's2', allAt50);
    expect(plan.rows.map((row) => row.sheetId)).toEqual(['s0', 's2']);
    expect(plan.rows.map((row) => row.levelName)).toEqual(['Basement', 'First']);
  });

  it('splits the other sheets into not open and open', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1', 's2'])]);
    const plan = planFor(file, 's0', allAt50, (sheet) => sheet.id === 's1');
    expect(plan.setSheetIds).toEqual(['s2']);
    expect(plan.liveSheetIds).toEqual(['s1']);
    expect(plan.rows.map((row) => row.open)).toEqual([true, true, false]);
  });
});

describe('scale dialog texts', () => {
  it('builds the title from the level and the new denominator', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    expect(scaleDialogTitle(planFor(file, 's0', allAt50))).toBe('Change the scale of Basement to 1:100?');
  });

  it('builds the body for one riser', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    expect(scaleDialogBody(planFor(file, 's0', allAt50))).toBe('R1 touches Basement. PDFs that share a riser must have the same scale.');
  });

  it('builds the body for two risers', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1']), riserOn('r2', 'R2', ['s0', 's2'])]);
    expect(scaleDialogBody(planFor(file, 's0', allAt50))).toBe('R1 and R2 touch Basement. PDFs that share a riser must have the same scale.');
  });

  it('builds the body for three risers', () => {
    const file = baseFile([riserOn('r1', 'A', ['s0', 's1']), riserOn('r2', 'B', ['s0', 's2']), riserOn('r3', 'C', ['s0', 's1'])]);
    expect(scaleDialogBody(planFor(file, 's0', allAt50))).toBe('A, B and C touch Basement. PDFs that share a riser must have the same scale.');
  });

  it('builds the row change text for a row not set, a row without change and a changing row', () => {
    const base: ScaleRow = { sheetId: 's1', levelName: 'Ground', isCurrent: false, nowDenominator: null, newDenominator: 100, changes: true, open: true };
    expect(scaleRowChange(base)).toBe('now not set, new 1:100');
    expect(scaleRowChange({ ...base, nowDenominator: 100, changes: false })).toBe('now 1:100, no change');
    expect(scaleRowChange({ ...base, nowDenominator: 50, changes: true })).toBe('now 1:50, new 1:100');
  });

  it('builds the set-all label and the hint with and without a PDF that is not open', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const allOpen = planFor(file, 's0', allAt50);
    expect(scaleSetAllLabel(allOpen)).toBe('Set 1:100 on all 2 PDFs');
    expect(scaleSetAllHint(allOpen)).toBe('Set 1:100 on all 2 PDFs: the risers keep their positions in real-world units.');
    const oneClosed = planFor(file, 's0', allAt50, () => false);
    expect(scaleSetAllHint(oneClosed)).toBe(
      'Set 1:100 on all 2 PDFs: the risers keep their positions in real-world units. A PDF that is not open gets the new scale when you open it.',
    );
  });

  it('builds the disconnect label and hint for one riser and for two', () => {
    const one = planFor(baseFile([riserOn('r1', 'R1', ['s0', 's1'])]), 's0', allAt50);
    expect(scaleDisconnectLabel(one)).toBe('Disconnect the riser');
    expect(scaleDisconnectHint(one)).toBe(
      'Disconnect the riser: R1 is deleted and its fittings become normal fittings. Basement gets 1:100. The other PDFs keep their scale.',
    );
    const two = planFor(baseFile([riserOn('r1', 'R1', ['s0', 's1']), riserOn('r2', 'R2', ['s0', 's2'])]), 's0', allAt50);
    expect(scaleDisconnectLabel(two)).toBe('Disconnect the risers');
    expect(scaleDisconnectHint(two)).toBe(
      'Disconnect the risers: R1 and R2 are deleted and their fittings become normal fittings. Basement gets 1:100. The other PDFs keep their scale.',
    );
  });

  it('builds the set-all and disconnect messages', () => {
    expect(scaleSetAllMessage(100, 2)).toBe('The scale is 1:100 on 2 PDFs. The risers stay at the same real-world positions.');
    expect(scaleDisconnectMessage(1)).toBe('1 riser disconnected. Its fittings are normal fittings now.');
    expect(scaleDisconnectMessage(2)).toBe('2 risers disconnected. Their fittings are normal fittings now.');
  });

  it('builds the cancel message for a set and for a not set scale, and the failure text', () => {
    expect(scaleCancelMessage('Basement', 50)).toBe('The scale of Basement stays 1:50.');
    expect(scaleCancelMessage('Basement', null)).toBe('The scale of Basement stays not set.');
    expect(scaleSetFailedText('Basement')).toBe('The scale could not be set on Basement. Nothing was changed.');
  });
});

describe('D-B-65 refusals', () => {
  it('refuses when a riser member on another sheet has a different known scale', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const text = scaleMismatchText(file, {
      sheet: sheetOf(file, 's0'),
      riser: file.risers[0]!,
      thisPageUnitsPerRealUnit: ppmm100,
      scaleOf: (sheet) => (sheet.id === 's1' ? ppmm50 : null),
    });
    expect(text).toBe('Basement has the scale 1:100. R1 is on 1:50. Set the same scale first.');
  });

  it('ignores an unknown scale and an equal scale', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const args = { sheet: sheetOf(file, 's0'), riser: file.risers[0]!, thisPageUnitsPerRealUnit: ppmm100 };
    expect(scaleMismatchText(file, { ...args, scaleOf: () => null })).toBeNull();
    expect(scaleMismatchText(file, { ...args, scaleOf: () => ppmm100 })).toBeNull();
  });

  it('refuses a make riser for a riser of the given type with a different known scale on another level', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const args = { sheet: sheetOf(file, 's0'), thisPageUnitsPerRealUnit: ppmm100, scaleOf: () => ppmm50 };
    expect(makeRiserScaleHint(file, { ...args, networkTypeIds: ['vent'] })).toBe('Make riser is not possible here: the scale of Basement differs from Ground.');
  });

  it('gives no make riser refusal for another type, an unknown scale or an equal scale', () => {
    const file = baseFile([riserOn('r1', 'R1', ['s0', 's1'])]);
    const base = { sheet: sheetOf(file, 's0'), thisPageUnitsPerRealUnit: ppmm100 };
    expect(makeRiserScaleHint(file, { ...base, networkTypeIds: ['water'], scaleOf: () => ppmm50 })).toBeNull();
    expect(makeRiserScaleHint(file, { ...base, networkTypeIds: ['vent'], scaleOf: () => null })).toBeNull();
    expect(makeRiserScaleHint(file, { ...base, networkTypeIds: ['vent'], scaleOf: () => ppmm100 })).toBeNull();
  });
});
