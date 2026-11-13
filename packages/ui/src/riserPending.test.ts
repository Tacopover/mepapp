import { calibrationFromScale, mmToPt, type BuildingFile, type BuildingSheet, type NetworkType, type Riser, type SheetSummary } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  dropPendingOps,
  hasPendingMove,
  hasPendingOps,
  hasPendingScale,
  pendingLinkOf,
  pendingNotices,
  type PendingFrame,
  type PendingPlan,
  planPendingOps,
  summaryFrameOf,
} from './riserPending.js';

const ppmm = calibrationFromScale(100).pageUnitsPerRealUnit;
const scene: PendingFrame = { heightPt: 842, pageUnitsPerRealUnit: ppmm, source: 'scene' };

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

const water: NetworkType = { ...vent, id: 'water', name: 'Cold water', discipline: 'plumbing' };

function baseFile(): BuildingFile {
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
    risers: [],
  };
}

function sheetOf(file: BuildingFile, sheetId: string): BuildingSheet {
  const sheet = file.sheets.find((candidate) => candidate.id === sheetId);
  if (sheet === undefined) throw new Error(`no sheet ${sheetId}`);
  return sheet;
}

function withMintedSheet(file: BuildingFile, sheetId: string, projectUuid: string, location: BuildingSheet['location']): BuildingFile {
  return {
    ...file,
    sheets: file.sheets.map((sheet) => (sheet.id === sheetId ? { ...sheet, projectUuid, idMinted: true as const, location } : sheet)),
  };
}

function riserMember(sheetId: string, levelId: string, fittingId: string): Riser['members'][number] {
  return { levelId, sheetId, pageIndex: 0, fittingId };
}

function riserOf(id: string, name: string, networkType: NetworkType, members: Riser['members'], pending: Riser['pending']): Riser {
  return {
    id,
    name,
    networkTypeId: networkType.id,
    networkType,
    anchorMm: { xMm: 1000, yMm: 2000 },
    flow: 'up',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending,
  };
}

function fileWith(risers: Riser[]): BuildingFile {
  return { ...baseFile(), risers };
}

const calibratedPage = { calibrated: true, pageUnitsPerRealUnit: ppmm, widthPt: 595, heightPt: 842, rotationDegrees: 0 };

function summariesWith(pages: SheetSummary['pages']): ReadonlyMap<string, SheetSummary> {
  return new Map<string, SheetSummary>([
    [
      'u1',
      { version: 2, projectUuid: 'u1', savedAt: '2026-11-01T00:00:00Z', sourceSizeBytes: 1000, sourceModifiedMs: 0, pages, tables: [], warnings: [] },
    ],
  ]);
}

describe('pendingLinkOf', () => {
  it('returns id when the file holds the id', () => {
    const file = baseFile();
    expect(pendingLinkOf(file, { projectUuid: 'u1', projectUuidInFile: true, fileName: 'plan.pdf', sizeBytes: 1000 }, sheetOf(file, 's1'))).toBe('id');
  });

  it('returns weak for a minted sheet matched by file name and size only', () => {
    const file = withMintedSheet(baseFile(), 's1', 'm1', { fileName: 'plan.pdf', sizeBytes: 1000 });
    const doc = { projectUuid: null, projectUuidInFile: false, fileName: 'plan.pdf', sizeBytes: 1000 };
    expect(pendingLinkOf(file, doc, sheetOf(file, 's1'))).toBe('weak');
  });

  it('returns ambiguous when two minted sheets match by file name and size', () => {
    const location = { fileName: 'plan.pdf', sizeBytes: 1000 };
    const file = withMintedSheet(withMintedSheet(baseFile(), 's1', 'm1', location), 's2', 'm2', location);
    const doc = { projectUuid: null, projectUuidInFile: false, fileName: 'plan.pdf', sizeBytes: 1000 };
    expect(pendingLinkOf(file, doc, sheetOf(file, 's1'))).toBe('ambiguous');
  });

  it('returns id for a minted sheet whose path equals the document path', () => {
    const file = withMintedSheet(baseFile(), 's1', 'm1', { fileName: 'plan.pdf', path: 'C:/plans/plan.pdf', sizeBytes: 1000 });
    const doc = { projectUuid: null, projectUuidInFile: false, path: 'C:/plans/plan.pdf', fileName: 'plan.pdf', sizeBytes: 1000 };
    expect(pendingLinkOf(file, doc, sheetOf(file, 's1'))).toBe('id');
  });

  it('returns id when the document size is unknown', () => {
    const file = withMintedSheet(baseFile(), 's1', 'm1', { fileName: 'plan.pdf', sizeBytes: 1000 });
    const doc = { projectUuid: null, projectUuidInFile: false, fileName: 'plan.pdf', sizeBytes: null };
    expect(pendingLinkOf(file, doc, sheetOf(file, 's1'))).toBe('id');
  });
});

describe('summaryFrameOf', () => {
  it('returns the frame of a calibrated page', () => {
    const file = baseFile();
    expect(summaryFrameOf(summariesWith({ '0': calibratedPage }), sheetOf(file, 's1'))).toEqual({
      heightPt: 842,
      pageUnitsPerRealUnit: ppmm,
      source: 'summary',
    });
  });

  it('returns null for an uncalibrated page', () => {
    const file = baseFile();
    const page = { ...calibratedPage, calibrated: false, pageUnitsPerRealUnit: null };
    expect(summaryFrameOf(summariesWith({ '0': page }), sheetOf(file, 's1'))).toBeNull();
  });

  it('returns null when the sheet has no projectUuid', () => {
    const file = baseFile();
    expect(summaryFrameOf(summariesWith({ '0': calibratedPage }), { ...sheetOf(file, 's1'), projectUuid: null })).toBeNull();
  });

  it('returns null when the summary has no page entry', () => {
    const file = baseFile();
    expect(summaryFrameOf(summariesWith({}), sheetOf(file, 's1'))).toBeNull();
  });
});

describe('planPendingOps', () => {
  const moveTo = { xMm: 1000, yMm: 2000 };

  it('makes one move edit at the building position with a scene frame', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s0', 'l0', 'f0'), riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo },
      ]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([
      {
        key: { riserId: 'r1', seq: 1 },
        riserId: 'r1',
        label: 'Supply air riser 1',
        kind: 'move',
        fittingId: 'f1',
        toPt: mmToPt(moveTo, { heightPt: 842, ppmm }),
      },
    ]);
    expect(plan.obsolete).toEqual([]);
    expect(plan.waiting).toBeNull();
    expect(plan.frameSource).toBe('scene');
  });

  it('waits for the scale and changes nothing without a frame', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: null });
    expect(plan.edits).toEqual([]);
    expect(plan.obsolete).toEqual([]);
    expect(plan.waiting).toEqual({ reason: 'no-scale', labels: ['Supply air riser 1'] });
    expect(plan.frameSource).toBeNull();
  });

  it('applies only the last of two moves and drops the first', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'move', toMm: { xMm: 100, yMm: 100 } },
        { seq: 2, sheetId: 's1', kind: 'move', toMm: { xMm: 3000, yMm: 500 } },
      ]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits.map((edit) => edit.key)).toEqual([{ riserId: 'r1', seq: 2 }]);
    expect(plan.edits[0]?.toPt).toEqual(mmToPt({ xMm: 3000, yMm: 500 }, { heightPt: 842, ppmm }));
    expect(plan.obsolete).toEqual([{ riserId: 'r1', seq: 1 }]);
  });

  it('applies a retag when the riser already has the type', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'vent' }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: null });
    expect(plan.edits).toEqual([
      { key: { riserId: 'r1', seq: 1 }, riserId: 'r1', label: 'Supply air riser 1', kind: 'retag', fittingId: 'f1', networkType: vent },
    ]);
    expect(plan.obsolete).toEqual([]);
  });

  it('drops a retag when the riser has another type', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'water' }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.obsolete).toEqual([{ riserId: 'r1', seq: 1 }]);
  });

  it('drops the ops of a riser that has no member on the sheet', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s0', 'l0', 'f0')], [{ seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.obsolete).toEqual([{ riserId: 'r1', seq: 1 }]);
  });

  it('waits for every riser when the link is ambiguous', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'ambiguous', frame: scene });
    expect(plan).toEqual({ edits: [], obsolete: [], waiting: { reason: 'ambiguous', labels: ['Supply air riser 1'] }, scale: null, frameSource: 'scene' });
  });

  it('applies a retag without a frame', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'vent' }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: null });
    expect(plan.edits).toEqual([
      { key: { riserId: 'r1', seq: 1 }, riserId: 'r1', label: 'Supply air riser 1', kind: 'retag', fittingId: 'f1', networkType: vent },
    ]);
    expect(plan.waiting).toBeNull();
  });

  it('drops a move that has no target', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'move' }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.obsolete).toEqual([{ riserId: 'r1', seq: 1 }]);
  });

  it('does not apply a retag while the link is ambiguous', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'vent' }]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'ambiguous', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.waiting).toEqual({ reason: 'ambiguous', labels: ['Supply air riser 1'] });
  });

  it('returns an empty plan when the sheet has no ops', () => {
    const file = baseFile();
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's2'), link: 'id', frame: scene });
    expect(plan).toEqual({ edits: [], obsolete: [], waiting: null, scale: null, frameSource: 'scene' });
  });
});

describe('planPendingOps with a scale', () => {
  const moveTo = { xMm: 1000, yMm: 2000 };
  const ppmm50 = calibrationFromScale(50).pageUnitsPerRealUnit;
  const scaleOp = (seq: number, sheetId: string, value: number) => ({ seq, sheetId, kind: 'setScale' as const, pageUnitsPerRealUnit: value });

  it('converts a move with the scale of a setScale op on the same sheet', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo },
        scaleOp(2, 's1', ppmm50),
      ]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([
      {
        key: { riserId: 'r1', seq: 1 },
        riserId: 'r1',
        label: 'Supply air riser 1',
        kind: 'move',
        fittingId: 'f1',
        toPt: mmToPt(moveTo, { heightPt: 842, ppmm: ppmm50 }),
      },
    ]);
    expect(plan.scale).toEqual({ pageUnitsPerRealUnit: ppmm50, keys: [{ riserId: 'r1', seq: 2 }] });
    expect(plan.obsolete).toEqual([]);
  });

  it('does not move a riser that has only a setScale op', () => {
    const file = fileWith([riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [scaleOp(3, 's1', ppmm50)])]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.scale).toEqual({ pageUnitsPerRealUnit: ppmm50, keys: [{ riserId: 'r1', seq: 3 }] });
    expect(plan.obsolete).toEqual([]);
  });

  it('keeps two risers in place when the sheet has a setScale op', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], []),
      riserOf('r2', 'Supply air riser 2', vent, [riserMember('s1', 'l1', 'f2')], [scaleOp(3, 's1', ppmm50)]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([]);
    expect(plan.scale).toEqual({ pageUnitsPerRealUnit: ppmm50, keys: [{ riserId: 'r2', seq: 3 }] });
  });

  it('gives one edit for a riser with a move and a setScale op on the same sheet', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo },
        scaleOp(2, 's1', ppmm50),
      ]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.edits).toEqual([
      {
        key: { riserId: 'r1', seq: 1 },
        riserId: 'r1',
        label: 'Supply air riser 1',
        kind: 'move',
        fittingId: 'f1',
        toPt: mmToPt(moveTo, { heightPt: 842, ppmm: ppmm50 }),
      },
    ]);
  });

  it('changes nothing and waits quietly without a frame', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'move', toMm: moveTo },
        scaleOp(2, 's1', ppmm50),
      ]),
    ]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: null });
    expect(plan).toEqual({ edits: [], obsolete: [], waiting: null, scale: null, frameSource: null });
  });

  it('makes a setScale op with an invalid value obsolete and gives no scale', () => {
    const file = fileWith([riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [scaleOp(1, 's1', 0)])]);
    const plan = planPendingOps(file, { sheet: sheetOf(file, 's1'), link: 'id', frame: scene });
    expect(plan.obsolete).toEqual([{ riserId: 'r1', seq: 1 }]);
    expect(plan.edits).toEqual([]);
    expect(plan.scale).toBeNull();
  });
});

describe('hasPendingScale', () => {
  it('is true for a setScale op on the sheet and counts it as a pending move', () => {
    const ppmm50 = calibrationFromScale(50).pageUnitsPerRealUnit;
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
        { seq: 1, sheetId: 's1', kind: 'setScale', pageUnitsPerRealUnit: ppmm50 },
      ]),
    ]);
    expect(hasPendingScale(file, 's1')).toBe(true);
    expect(hasPendingScale(file, 's2')).toBe(false);
    expect(hasPendingMove(file, 's1')).toBe(true);
  });
});

describe('hasPendingOps and hasPendingMove', () => {
  it('reports the ops of a sheet by kind', () => {
    const file = fileWith([
      riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'water' }]),
    ]);
    expect(hasPendingOps(file, 's1')).toBe(true);
    expect(hasPendingMove(file, 's1')).toBe(false);
    expect(hasPendingOps(file, 's2')).toBe(false);
  });
});

describe('dropPendingOps', () => {
  const file = fileWith([
    riserOf('r1', 'Supply air riser 1', vent, [riserMember('s1', 'l1', 'f1')], [
      { seq: 1, sheetId: 's1', kind: 'move', toMm: { xMm: 1, yMm: 1 } },
      { seq: 2, sheetId: 's1', kind: 'move', toMm: { xMm: 2, yMm: 2 } },
    ]),
    riserOf('r2', 'Supply air riser 2', vent, [riserMember('s1', 'l1', 'f2')], [{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'vent' }]),
  ]);

  it('drops only the ops of the keys', () => {
    const next = dropPendingOps(file, [{ riserId: 'r1', seq: 1 }]);
    expect(next.risers[0]?.pending.map((op) => op.seq)).toEqual([2]);
    expect(next.risers[1]).toBe(file.risers[1]);
    expect(file.risers[0]?.pending.map((op) => op.seq)).toEqual([1, 2]);
  });

  it('returns the same object when the keys are empty or match nothing', () => {
    expect(dropPendingOps(file, [])).toBe(file);
    expect(dropPendingOps(file, [{ riserId: 'r9', seq: 1 }])).toBe(file);
  });
});

describe('pendingNotices', () => {
  const file = baseFile();
  const sheet = sheetOf(file, 's1');
  const moveEdit = (label: string) => ({
    key: { riserId: label, seq: 1 },
    riserId: label,
    label,
    kind: 'move' as const,
    fittingId: 'f1',
    toPt: { x: 1, y: 1 },
  });
  const retagEdit = (label: string, type: NetworkType) => ({
    key: { riserId: label, seq: 2 },
    riserId: label,
    label,
    kind: 'retag' as const,
    fittingId: 'f1',
    networkType: type,
  });
  const idPlan: PendingPlan = { edits: [], obsolete: [], waiting: null, scale: null, frameSource: 'scene' };

  it('reports the applied scale and leaves out the moved part', () => {
    const notices = pendingNotices({ file, sheet, link: 'id', plan: idPlan, applied: [moveEdit('Supply air riser 1')], scaleApplied: 50 });
    expect(notices).toEqual([
      { kind: 'info', message: 'The scale of Ground is 1:50 now, to match the building. Nothing moved on the page.' },
    ]);
  });

  it('reports a move applied from the scene scale', () => {
    const notices = pendingNotices({ file, sheet, link: 'id', plan: idPlan, applied: [moveEdit('Supply air riser 1')] });
    expect(notices).toEqual([{ kind: 'info', message: 'Supply air riser 1 moved on Ground to match the building.' }]);
  });

  it('reports a move applied from the saved sheet scale', () => {
    const plan: PendingPlan = { ...idPlan, frameSource: 'summary' };
    const notices = pendingNotices({ file, sheet, link: 'id', plan, applied: [moveEdit('Supply air riser 1')] });
    expect(notices).toEqual([
      { kind: 'info', message: 'Supply air riser 1 moved on Ground to match the building (scale from the saved sheet).' },
    ]);
  });

  it('reports one type change with the type name', () => {
    const notices = pendingNotices({ file, sheet, link: 'id', plan: idPlan, applied: [retagEdit('Supply air riser 1', water)] });
    expect(notices).toEqual([{ kind: 'info', message: 'Supply air riser 1 changed to Cold water on Ground.' }]);
  });

  it('reports several type changes in one sentence', () => {
    const notices = pendingNotices({
      file,
      sheet,
      link: 'id',
      plan: idPlan,
      applied: [retagEdit('Supply air riser 1', water), retagEdit('Supply air riser 2', water)],
    });
    expect(notices).toEqual([
      { kind: 'info', message: 'Supply air riser 1 and Supply air riser 2 changed type on Ground to match the building.' },
    ]);
  });

  it('joins a move and a type change in one notice', () => {
    const notices = pendingNotices({
      file,
      sheet,
      link: 'id',
      plan: idPlan,
      applied: [moveEdit('Supply air riser 1'), retagEdit('Supply air riser 2', water)],
    });
    expect(notices).toEqual([
      {
        kind: 'info',
        message: 'Supply air riser 1 moved on Ground to match the building. Supply air riser 2 changed to Cold water on Ground.',
      },
    ]);
  });

  it('adds the weak link note after the applied text', () => {
    const notices = pendingNotices({ file, sheet, link: 'weak', plan: idPlan, applied: [moveEdit('Supply air riser 1')] });
    expect(notices).toEqual([
      {
        kind: 'info',
        message: 'Supply air riser 1 moved on Ground to match the building. Sheet 1 is linked to the building by file name and size only.',
      },
    ]);
  });

  it('names two moved risers with and', () => {
    const notices = pendingNotices({
      file,
      sheet,
      link: 'id',
      plan: idPlan,
      applied: [moveEdit('Supply air riser 1'), moveEdit('Supply air riser 2')],
    });
    expect(notices).toEqual([{ kind: 'info', message: 'Supply air riser 1 and Supply air riser 2 moved on Ground to match the building.' }]);
  });

  it('counts three or more moved risers', () => {
    const notices = pendingNotices({
      file,
      sheet,
      link: 'id',
      plan: idPlan,
      applied: [moveEdit('A'), moveEdit('B'), moveEdit('C')],
    });
    expect(notices).toEqual([{ kind: 'info', message: '3 risers moved on Ground to match the building.' }]);
  });

  it('warns that the scale is missing', () => {
    const plan: PendingPlan = { edits: [], obsolete: [], waiting: { reason: 'no-scale', labels: ['Supply air riser 1'] }, scale: null, frameSource: null };
    const notices = pendingNotices({ file, sheet, link: 'id', plan, applied: [] });
    expect(notices).toEqual([{ kind: 'warning', message: 'Set the scale of Sheet 1 to move Supply air riser 1.' }]);
  });

  it('warns that one riser waits for the link', () => {
    const plan: PendingPlan = { edits: [], obsolete: [], waiting: { reason: 'ambiguous', labels: ['Supply air riser 1'] }, scale: null, frameSource: null };
    const notices = pendingNotices({ file, sheet, link: 'ambiguous', plan, applied: [] });
    expect(notices).toEqual([
      { kind: 'warning', message: 'Sheet 1: Supply air riser 1 waits. Open this sheet from the building to apply it.' },
    ]);
  });

  it('warns that two risers wait for the link', () => {
    const plan: PendingPlan = {
      edits: [],
      obsolete: [],
      waiting: { reason: 'ambiguous', labels: ['Supply air riser 1', 'Supply air riser 2'] },
      scale: null,
      frameSource: null,
    };
    const notices = pendingNotices({ file, sheet, link: 'ambiguous', plan, applied: [] });
    expect(notices).toEqual([
      { kind: 'warning', message: 'Sheet 1: Supply air riser 1 and Supply air riser 2 wait. Open this sheet from the building to apply it.' },
    ]);
  });

  it('puts the info notice before the warning', () => {
    const plan: PendingPlan = { edits: [], obsolete: [], waiting: { reason: 'no-scale', labels: ['Supply air riser 2'] }, scale: null, frameSource: 'scene' };
    const notices = pendingNotices({ file, sheet, link: 'id', plan, applied: [moveEdit('Supply air riser 1')] });
    expect(notices).toEqual([
      { kind: 'info', message: 'Supply air riser 1 moved on Ground to match the building.' },
      { kind: 'warning', message: 'Set the scale of Sheet 1 to move Supply air riser 2.' },
    ]);
  });

  it('returns no notice when nothing applies or waits', () => {
    expect(pendingNotices({ file, sheet, link: 'id', plan: idPlan, applied: [] })).toEqual([]);
  });
});
