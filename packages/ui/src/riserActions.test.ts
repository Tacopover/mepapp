import {
  attachMember,
  calibrationFromScale,
  makeRiser,
  type BuildingFile,
  type BuildingSheet,
  type NetworkType,
  type PageFrame,
  type QuantityTable,
  type Riser,
  type RiserError,
  type RiserPendingOp,
  type SheetSummary,
} from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  activeSheetOf,
  applyRiserTypeChange,
  attachAction,
  buildRiserAnchors,
  buildRiserMarks,
  deleteRiserAction,
  detachAction,
  firstMemberFrame,
  HINT_NO_SCALE,
  HINT_NOT_IN_BUILDING,
  HINT_TWO_TYPES,
  LINE_UP_NOTE,
  makeRiserAction,
  NO_RISER_MENU,
  removalRefusedText,
  riserMenuModel,
  riserOfFitting,
  type ShownPage,
} from './riserActions.js';

const ppmm = calibrationFromScale(100).pageUnitsPerRealUnit;
const frame: PageFrame = { widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: ppmm };
const page: ShownPage = { widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: ppmm };
const noScalePage: ShownPage = { widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: null };

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

function ok<T>(value: T | RiserError): T {
  if (typeof value === 'string') throw new Error(`unexpected riser error ${value}`);
  return value;
}

function riserById(file: BuildingFile, riserId: string): Riser {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) throw new Error(`no riser ${riserId}`);
  return riser;
}

function addRiser(file: BuildingFile, id: string, name: string, sheetId: string, fittingId: string, networkType: NetworkType = vent): BuildingFile {
  return ok(makeRiser(file, { id, name, networkType, sheetId, fittingId, fittingPt: { x: 100, y: 200 }, frame }));
}

function fittingsTable(rows: [number, string, string | null][]): QuantityTable {
  return {
    name: 'Fittings',
    headers: ['Page', 'Id', 'Network', 'Kind', 'Routed', 'X (pt)', 'Y (pt)'],
    rows: rows.map(([pageNo, id, network]) => [pageNo, id, network, 'fitting', true, 0, 0]),
  };
}

function summaryWith(tables: QuantityTable[]): SheetSummary {
  return {
    version: 1,
    projectUuid: 'u1',
    savedAt: '2026-11-02T10:00:00Z',
    sourceSizeBytes: 10,
    sourceModifiedMs: 0,
    pages: { '0': { calibrated: true, pageUnitsPerRealUnit: ppmm, widthPt: 595, heightPt: 842, rotationDegrees: 0 } },
    tables,
    warnings: [],
  };
}

const segmentRun = { segmentCount: 2, networkTypeIds: ['vent'] };

describe('activeSheetOf', () => {
  it('returns the sheet with the projectUuid and the page index', () => {
    const file = baseFile();
    expect(activeSheetOf(file, 'u1', 0)?.id).toBe('s1');
  });

  it('returns null for a null file, a null projectUuid or no match', () => {
    const file = baseFile();
    expect(activeSheetOf(null, 'u1', 0)).toBeNull();
    expect(activeSheetOf(file, null, 0)).toBeNull();
    expect(activeSheetOf(file, 'u1', 3)).toBeNull();
    expect(activeSheetOf(file, 'other', 0)).toBeNull();
  });
});

describe('riserMenuModel', () => {
  const sheet = baseFile().sheets[0] ?? null;

  it('is hidden for no file or no fitting', () => {
    expect(riserMenuModel({ file: null, sheet, hasScale: true, fittingContext: segmentRun, markedRiserId: null })).toBe(NO_RISER_MENU);
    expect(riserMenuModel({ file: baseFile(), sheet, hasScale: true, fittingContext: null, markedRiserId: null })).toBe(NO_RISER_MENU);
  });

  it('shows detach and delete for a marked fitting, before the segment count is read', () => {
    const model = riserMenuModel({
      file: baseFile(),
      sheet,
      hasScale: false,
      fittingContext: { segmentCount: 0, networkTypeIds: [] },
      markedRiserId: 'r1',
    });
    expect(model).toEqual({ makeRiser: null, detach: true, deleteRiser: true });
  });

  it('is hidden for a fitting with no segment', () => {
    expect(riserMenuModel({ file: baseFile(), sheet, hasScale: true, fittingContext: { segmentCount: 0, networkTypeIds: [] }, markedRiserId: null })).toBe(
      NO_RISER_MENU,
    );
  });

  it('greys make riser with the not-in-building hint first', () => {
    const model = riserMenuModel({ file: baseFile(), sheet: null, hasScale: false, fittingContext: segmentRun, markedRiserId: null });
    expect(model).toEqual({ makeRiser: { disabledHint: HINT_NOT_IN_BUILDING }, detach: false, deleteRiser: false });
  });

  it('greys make riser with the no-scale hint second', () => {
    const model = riserMenuModel({ file: baseFile(), sheet, hasScale: false, fittingContext: segmentRun, markedRiserId: null });
    expect(model).toEqual({ makeRiser: { disabledHint: HINT_NO_SCALE }, detach: false, deleteRiser: false });
  });

  it('greys make riser with the two-types hint third', () => {
    const model = riserMenuModel({
      file: baseFile(),
      sheet,
      hasScale: true,
      fittingContext: { segmentCount: 2, networkTypeIds: ['vent', 'water'] },
      markedRiserId: null,
    });
    expect(model).toEqual({ makeRiser: { disabledHint: HINT_TWO_TYPES }, detach: false, deleteRiser: false });
  });

  it('enables make riser when every check passes', () => {
    const model = riserMenuModel({ file: baseFile(), sheet, hasScale: true, fittingContext: segmentRun, markedRiserId: null });
    expect(model).toEqual({ makeRiser: { disabledHint: null }, detach: false, deleteRiser: false });
  });

  it('greys make riser with the no-scale hint before the two-types hint', () => {
    const model = riserMenuModel({
      file: baseFile(),
      sheet,
      hasScale: false,
      fittingContext: { segmentCount: 2, networkTypeIds: ['vent', 'water'] },
      markedRiserId: null,
    });
    expect(model).toEqual({ makeRiser: { disabledHint: HINT_NO_SCALE }, detach: false, deleteRiser: false });
  });

  it('greys make riser with the not-in-building hint before the two-types hint', () => {
    const model = riserMenuModel({
      file: baseFile(),
      sheet: null,
      hasScale: true,
      fittingContext: { segmentCount: 2, networkTypeIds: ['vent', 'water'] },
      markedRiserId: null,
    });
    expect(model).toEqual({ makeRiser: { disabledHint: HINT_NOT_IN_BUILDING }, detach: false, deleteRiser: false });
  });
});

describe('makeRiserAction', () => {
  it('makes the riser with the label of the app and the level in the message', () => {
    const file = baseFile();
    const result = makeRiserAction(file, {
      id: 'r1',
      networkType: vent,
      sheet: sheetOf(file, 's1'),
      fittingId: 'f1',
      fittingPt: { x: 100, y: 200 },
      page,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(riserById(result.file, 'r1').name).toBe('Supply riser 1');
    expect(riserById(result.file, 'r1').members).toEqual([{ levelId: 'l1', sheetId: 's1', pageIndex: 0, fittingId: 'f1' }]);
    expect(result.message).toBe(`Supply riser 1 made on Ground. ${LINE_UP_NOTE}`);
  });

  it('takes the next free number for the type', () => {
    const file = addRiser(baseFile(), 'r0', 'Supply riser 1', 's0', 'f0');
    const result = makeRiserAction(file, { id: 'r2', networkType: vent, sheet: sheetOf(file, 's1'), fittingId: 'f1', fittingPt: { x: 1, y: 1 }, page });
    expect(result.ok && riserById(result.file, 'r2').name).toBe('Supply riser 2');
  });

  it('refuses with the no-scale hint when the page has no scale', () => {
    const file = baseFile();
    const result = makeRiserAction(file, { id: 'r1', networkType: vent, sheet: sheetOf(file, 's1'), fittingId: 'f1', fittingPt: { x: 1, y: 1 }, page: noScalePage });
    expect(result).toEqual({ ok: false, text: HINT_NO_SCALE });
  });

  it('refuses with the not-in-building hint for a sheet that is not in the file', () => {
    const file = baseFile();
    const stranger: BuildingSheet = { ...sheetOf(file, 's1'), id: 'missing' };
    const result = makeRiserAction(file, { id: 'r1', networkType: vent, sheet: stranger, fittingId: 'f1', fittingPt: { x: 1, y: 1 }, page });
    expect(result).toEqual({ ok: false, text: HINT_NOT_IN_BUILDING });
  });

  it('refuses with the generic text for a duplicate id', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = makeRiserAction(file, { id: 'r1', networkType: vent, sheet: sheetOf(file, 's1'), fittingId: 'f1', fittingPt: { x: 1, y: 1 }, page });
    expect(result).toEqual({ ok: false, text: 'Could not make the riser. Try again.' });
  });

  it('uses this level as the level name when the level is not in the file', () => {
    const file = { ...baseFile(), levels: [] };
    const result = makeRiserAction(file, { id: 'r1', networkType: vent, sheet: sheetOf(file, 's1'), fittingId: 'f1', fittingPt: { x: 1, y: 1 }, page });
    expect(result.ok && result.message).toBe(`Supply riser 1 made on this level. ${LINE_UP_NOTE}`);
  });
});

describe('riserOfFitting', () => {
  it('finds the riser whose member is the sheet and fitting', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's1', 'f1');
    expect(riserOfFitting(file, 's1', 'f1')?.id).toBe('r1');
    expect(riserOfFitting(file, 's1', 'other')).toBeNull();
    expect(riserOfFitting(file, 's0', 'f1')).toBeNull();
  });
});

describe('detachAction', () => {
  it('deletes the riser when the detached member is the last one', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's1', 'f1');
    const result = detachAction(file, 'r1', sheetOf(file, 's1'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.risers).toEqual([]);
    expect(result.message).toBe('Supply riser 1 deleted. Its fittings stay on the sheets.');
  });

  it('detaches only the member when other members stay', () => {
    const first = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const file = ok(attachMember(first, 'r1', { levelId: 'l1', sheetId: 's1', pageIndex: 0, fittingId: 'f1' }, { first: frame, this: frame })).file;
    const result = detachAction(file, 'r1', sheetOf(file, 's1'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(riserById(result.file, 'r1').members.map((member) => member.sheetId)).toEqual(['s0']);
    expect(result.message).toBe('Supply riser 1 detached from Ground.');
  });

  it('refuses for an unknown riser or a sheet without a member', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    expect(detachAction(file, 'nope', sheetOf(file, 's0'))).toEqual({ ok: false, text: 'This fitting is not part of a riser.' });
    expect(detachAction(file, 'r1', sheetOf(file, 's2'))).toEqual({ ok: false, text: 'This fitting is not part of a riser.' });
  });
});

describe('deleteRiserAction and removalRefusedText', () => {
  it('deletes the riser and names it in the message', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = deleteRiserAction(file, 'r1');
    expect(result.ok && result.file.risers).toEqual([]);
    expect(result.ok && result.message).toBe('Supply riser 1 deleted. Its fittings stay on the sheets.');
  });

  it('refuses for an unknown riser', () => {
    expect(deleteRiserAction(baseFile(), 'nope')).toEqual({ ok: false, text: 'This riser does not exist any more.' });
  });

  it('builds the refused-removal text from the label', () => {
    expect(removalRefusedText('Supply riser 1')).toBe('This fitting belongs to Supply riser 1. Detach the riser first, or use Delete riser.');
  });
});

describe('firstMemberFrame', () => {
  const summaries = new Map<string, SheetSummary>([['u0', summaryWith([])]]);

  it('reads the displayed size and the scale of the first member', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    expect(firstMemberFrame(file, riserById(file, 'r1'), summaries)).toEqual({ widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: ppmm });
  });

  it('returns null when the sheet is unknown, has no projectUuid, has no summary or has no page entry', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const riser = riserById(file, 'r1');
    expect(firstMemberFrame(file, riser, new Map())).toBeNull();
    const unknown = { ...riser, members: riser.members.map((member) => ({ ...member, sheetId: 'missing' })) };
    expect(firstMemberFrame(file, unknown, summaries)).toBeNull();
    const unlinked = { ...file, sheets: file.sheets.map((sheet) => (sheet.id === 's0' ? { ...sheet, projectUuid: null } : sheet)) };
    expect(firstMemberFrame(unlinked, riser, summaries)).toBeNull();
    const noPage = new Map<string, SheetSummary>([['u0', { ...summaryWith([]), pages: {} }]]);
    expect(firstMemberFrame(file, riser, noPage)).toBeNull();
  });

  it('returns null for a size that is not positive, a page without calibration or without a scale', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const riser = riserById(file, 'r1');
    const base = summaryWith([]);
    const pageOf = (overrides: Partial<SheetSummary['pages'][string]>) => new Map([['u0', { ...base, pages: { '0': { ...base.pages['0']!, ...overrides } } }]]);
    expect(firstMemberFrame(file, riser, pageOf({ widthPt: 0 }))).toBeNull();
    expect(firstMemberFrame(file, riser, pageOf({ heightPt: -1 }))).toBeNull();
    expect(firstMemberFrame(file, riser, pageOf({ calibrated: false }))).toBeNull();
    expect(firstMemberFrame(file, riser, pageOf({ pageUnitsPerRealUnit: null }))).toBeNull();
  });
});

describe('attachAction', () => {
  it('joins the riser and names the level', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: 'vent', page, firstFrame: frame });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(riserById(result.file, 'r1').members.map((member) => member.sheetId)).toEqual(['s0', 's1']);
    expect(result.message).toBe('Supply riser 1 attached on Ground.');
    expect(result.warning).toBeUndefined();
  });

  it('adds the page size warning to the message when the sheets differ by more than 1 percent', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const wide: ShownPage = { ...page, widthPt: 620 };
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: null, page: wide, firstFrame: frame });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toMatch(/^Page sizes differ by /);
    expect(result.message).toBe(`Supply riser 1 attached on Ground. ${result.warning}`);
  });

  it('gives no warning for a difference of 1 percent or less', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const near: ShownPage = { ...page, widthPt: 600 };
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: null, page: near, firstFrame: frame });
    expect(result.ok && result.message).toBe('Supply riser 1 attached on Ground.');
  });

  it('refuses with the level-taken text', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's0'), fittingId: 'f9', segmentNetworkTypeId: null, page, firstFrame: frame });
    expect(result).toEqual({ ok: false, text: 'Supply riser 1 already has a part on this level.' });
  });

  it('refuses with the no-scale hint when the drawn page has no scale', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: null, page: noScalePage, firstFrame: frame });
    expect(result).toEqual({ ok: false, text: HINT_NO_SCALE });
  });

  it('names the first sheet when its page size is not known', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: null, page, firstFrame: null });
    expect(result).toEqual({
      ok: false,
      text: 'The page size of Sheet 0 is not known yet. Save that sheet, then draw into the ring again.',
    });
  });

  it('refuses with the type text when the segment has another type', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = attachAction(file, { riserId: 'r1', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: 'water', page, firstFrame: frame });
    expect(result).toEqual({ ok: false, text: 'Supply riser 1 takes only Supply.' });
  });

  it('refuses with the gone text for an unknown riser', () => {
    const file = baseFile();
    const result = attachAction(file, { riserId: 'nope', sheet: sheetOf(file, 's1'), fittingId: 'f1', segmentNetworkTypeId: null, page, firstFrame: frame });
    expect(result).toEqual({ ok: false, text: 'This riser does not exist any more.' });
  });
});

describe('buildRiserMarks', () => {
  it('places the anchor from mm with the known scale, for the members of the sheet only', () => {
    const file = addRiser(addRiser(baseFile(), 'r1', 'Supply riser 1', 's1', 'f1'), 'r2', 'Supply riser 2', 's0', 'f0');
    const marks = buildRiserMarks(file, sheetOf(file, 's1'), page, () => null);
    expect([...marks.keys()]).toEqual(['f1']);
    const mark = marks.get('f1');
    expect(mark?.riserId).toBe('r1');
    expect(mark?.name).toBe('Supply riser 1');
    expect(mark?.networkTypeId).toBe('vent');
    expect(mark?.anchorPt.x).toBeCloseTo(100, 1);
    expect(mark?.anchorPt.y).toBeCloseTo(200, 1);
  });

  it('uses the fallback point when the scale is unknown, and the origin when there is none', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's1', 'f1');
    const fromFallback = buildRiserMarks(file, sheetOf(file, 's1'), noScalePage, (id) => (id === 'f1' ? { x: 7, y: 8 } : null));
    expect(fromFallback.get('f1')?.anchorPt).toEqual({ x: 7, y: 8 });
    const origin = buildRiserMarks(file, sheetOf(file, 's1'), null, () => null);
    expect(origin.get('f1')?.anchorPt).toEqual({ x: 0, y: 0 });
  });
});

describe('buildRiserAnchors', () => {
  it('returns no anchors without a scale', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    expect(buildRiserAnchors(file, sheetOf(file, 's1'), noScalePage)).toEqual([]);
    expect(buildRiserAnchors(file, sheetOf(file, 's1'), null)).toEqual([]);
  });

  it('skips a riser with a member on the level of the sheet, even on another sheet of that level', () => {
    const withSecondSheet: BuildingFile = {
      ...baseFile(),
      sheets: [...baseFile().sheets, { id: 's1b', levelId: 'l1', projectUuid: 'u9', pageIndex: 1, displayName: 'Sheet 1b', location: { fileName: 'b.pdf' } }],
    };
    const onLevel = addRiser(withSecondSheet, 'r1', 'Supply riser 1', 's1b', 'f1');
    const elsewhere = addRiser(onLevel, 'r2', 'Supply riser 2', 's0', 'f0');
    const anchors = buildRiserAnchors(elsewhere, sheetOf(elsewhere, 's1'), page);
    expect(anchors.map((anchor) => anchor.riserId)).toEqual(['r2']);
  });

  it('returns the free anchors with their label, type and point', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0', water);
    const anchors = buildRiserAnchors(file, sheetOf(file, 's1'), page);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.label).toBe('Supply riser 1');
    expect(anchors[0]?.networkTypeName).toBe('Cold water');
    expect(anchors[0]?.networkTypeId).toBe('water');
    expect(anchors[0]?.anchorPt.x).toBeCloseTo(100, 1);
  });

  it('skips a riser without members', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const empty = { ...file, risers: file.risers.map((riser) => ({ ...riser, members: [] })) };
    expect(buildRiserAnchors(empty, sheetOf(empty, 's1'), page)).toEqual([]);
  });
});

describe('applyRiserTypeChange', () => {
  it('returns the file and no message when no event riser exists', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = applyRiserTypeChange(file, { eventRiserIds: ['nope'], networkType: water, activeSheetId: 's0', summaries: new Map() });
    expect(result).toEqual({ file, message: null });
  });

  it('changes a single riser and gives retag ops only for the members off the active sheet', () => {
    const first = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const file = ok(attachMember(first, 'r1', { levelId: 'l1', sheetId: 's1', pageIndex: 0, fittingId: 'f1' }, { first: frame, this: frame })).file;
    const result = applyRiserTypeChange(file, { eventRiserIds: ['r1'], networkType: water, activeSheetId: 's0', summaries: new Map() });
    const riser = riserById(result.file, 'r1');
    expect(riser.networkTypeId).toBe('water');
    expect(riser.networkType).toEqual(water);
    expect(riser.name).toBe('Cold water riser 1');
    expect(riser.pending).toEqual([{ seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'water' }]);
    expect(result.message).toBe('Type changed on 2 levels for Cold water riser 1.');
  });

  it('retags every riser that shares a network label on a sheet, with ops for the other sheets', () => {
    const withA = addRiser(baseFile(), 'rA', 'Supply riser 1', 's1', 'f1a');
    const withB = addRiser(withA, 'rB', 'Supply riser 2', 's1', 'f1b');
    const file = ok(attachMember(withB, 'rB', { levelId: 'l0', sheetId: 's0', pageIndex: 0, fittingId: 'f0b' }, { first: frame, this: frame })).file;
    const summaries = new Map<string, SheetSummary>([
      ['u1', summaryWith([fittingsTable([[1, 'f1a', 'N'], [1, 'f1b', 'N']])])],
    ]);
    const result = applyRiserTypeChange(file, { eventRiserIds: ['rA'], networkType: water, activeSheetId: 's1', summaries });
    expect(riserById(result.file, 'rA').networkType.id).toBe('water');
    expect(riserById(result.file, 'rB').networkType.id).toBe('water');
    expect(riserById(result.file, 'rA').pending).toEqual([]);
    expect(riserById(result.file, 'rB').pending).toEqual([
      { seq: 1, sheetId: 's1', kind: 'retag', networkTypeId: 'water' },
      { seq: 2, sheetId: 's0', kind: 'retag', networkTypeId: 'water' },
    ]);
    expect(riserById(result.file, 'rB').name).toBe('Cold water riser 2');
    expect(result.message).toBe('Type changed on 1 level for Cold water riser 1.');
  });

  it('does not reach a riser through a network label that the summary does not have', () => {
    const withA = addRiser(baseFile(), 'rA', 'Supply riser 1', 's1', 'f1a');
    const file = addRiser(withA, 'rB', 'Supply riser 2', 's1', 'f1b');
    const summaries = new Map<string, SheetSummary>([['u1', summaryWith([fittingsTable([[1, 'f1a', 'N'], [1, 'f1b', null]])])]]);
    const result = applyRiserTypeChange(file, { eventRiserIds: ['rA'], networkType: water, activeSheetId: 's1', summaries });
    expect(riserById(result.file, 'rA').networkTypeId).toBe('water');
    expect(riserById(result.file, 'rB').networkTypeId).toBe('vent');
  });

  it('renames only a name with the old pattern', () => {
    const file = addRiser(baseFile(), 'r1', 'Main', 's0', 'f0');
    const result = applyRiserTypeChange(file, { eventRiserIds: ['r1'], networkType: water, activeSheetId: 's0', summaries: new Map() });
    expect(riserById(result.file, 'r1').name).toBe('Main');
    expect(riserById(result.file, 'r1').networkTypeId).toBe('water');
  });

  it('gives no ops and keeps the riser when its type is already equal', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = applyRiserTypeChange(file, { eventRiserIds: ['r1'], networkType: vent, activeSheetId: 's1', summaries: new Map() });
    expect(result.file.risers).toEqual(file.risers);
    expect(riserById(result.file, 'r1').pending).toEqual([]);
  });

  it('numbers the new op after the pending ops of the riser', () => {
    const first = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const pending: RiserPendingOp = { seq: 4, sheetId: 's0', kind: 'retag', networkTypeId: 'vent' };
    const file: BuildingFile = { ...first, risers: first.risers.map((riser) => ({ ...riser, pending: [pending] })) };
    const result = applyRiserTypeChange(file, { eventRiserIds: ['r1'], networkType: water, activeSheetId: 's1', summaries: new Map() });
    expect(riserById(result.file, 'r1').pending).toEqual([pending, { seq: 5, sheetId: 's0', kind: 'retag', networkTypeId: 'water' }]);
  });

  it('returns no message and keeps the known riser when the first event id is unknown', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const result = applyRiserTypeChange(file, { eventRiserIds: ['nope', 'r1'], networkType: water, activeSheetId: 's1', summaries: new Map() });
    expect(result.message).toBeNull();
    expect(riserById(result.file, 'r1').networkTypeId).toBe('water');
  });

  it('adds no reach and does not throw when the summary has no Fittings table or no matching row', () => {
    const withA = addRiser(baseFile(), 'rA', 'Supply riser 1', 's1', 'f1a');
    const file = addRiser(withA, 'rB', 'Supply riser 2', 's1', 'f1b');
    const noTable = applyRiserTypeChange(file, { eventRiserIds: ['rA'], networkType: water, activeSheetId: 's1', summaries: new Map() });
    expect(riserById(noTable.file, 'rB').networkTypeId).toBe('vent');
    const noRow = new Map<string, SheetSummary>([['u1', summaryWith([fittingsTable([[1, 'other', 'N']])])]]);
    const noMatch = applyRiserTypeChange(file, { eventRiserIds: ['rA'], networkType: water, activeSheetId: 's1', summaries: noRow });
    expect(riserById(noMatch.file, 'rB').networkTypeId).toBe('vent');
  });

  it('does not rename a riser whose name does not match the old pattern', () => {
    const air = addRiser(baseFile(), 'r1', 'Supply air riser 01', 's0', 'f0');
    const airResult = applyRiserTypeChange(air, { eventRiserIds: ['r1'], networkType: water, activeSheetId: 's0', summaries: new Map() });
    expect(riserById(airResult.file, 'r1').name).toBe('Supply air riser 01');
    const leadingZero = addRiser(baseFile(), 'r2', 'Supply riser 01', 's0', 'f0');
    const zeroResult = applyRiserTypeChange(leadingZero, { eventRiserIds: ['r2'], networkType: water, activeSheetId: 's0', summaries: new Map() });
    expect(riserById(zeroResult.file, 'r2').name).toBe('Supply riser 01');
  });

  it('keeps the number when the new type has the same name as the old type', () => {
    const file = addRiser(baseFile(), 'r1', 'Supply riser 1', 's0', 'f0');
    const sameName: NetworkType = { ...vent, id: 'vent-2' };
    const result = applyRiserTypeChange(file, { eventRiserIds: ['r1'], networkType: sameName, activeSheetId: 's0', summaries: new Map() });
    expect(riserById(result.file, 'r1').name).toBe('Supply riser 1');
    expect(riserById(result.file, 'r1').networkTypeId).toBe('vent-2');
  });
});
