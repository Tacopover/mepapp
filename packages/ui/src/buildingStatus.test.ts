import { calibrationFromScale, type BuildingFile, type BuildingSheet, type SheetSummary } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  currentSheetLabel,
  noSummaryText,
  notPlacedAskText,
  otherNoSummaryText,
  readableNoSummaryText,
  rebuildResultText,
  sheetsWithoutSummary,
  shortText,
  sheetStatusOf,
  sheetSummaryInfo,
  statusHint,
  statusLabel,
  statusTone,
  summaryCountText,
  summaryText,
  type SheetStatus,
} from './buildingStatus.js';

function sheet(overrides: Partial<BuildingSheet> = {}): BuildingSheet {
  return {
    id: 's-1',
    levelId: 'L1',
    projectUuid: 'u-1',
    pageIndex: 0,
    displayName: 'A-101',
    location: { fileName: 'A-101.pdf', path: '/plans/A-101.pdf' },
    ...overrides,
  };
}

const summary = { savedAt: '2026-10-01T10:00:00.000Z', sourceSizeBytes: 500 };

function building(sheets: BuildingSheet[]): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b-1',
    name: 'Tower',
    levels: [
      { id: 'L1', name: 'Ground', elevationMm: 0 },
      { id: 'L2', name: 'First', elevationMm: 3000 },
    ],
    sheets,
    risers: [],
  };
}

describe('currentSheetLabel', () => {
  it('gives the building, level and display name of the matching sheet', () => {
    expect(currentSheetLabel(building([sheet()]), 'u-1', 0)).toBe('Tower / Ground / A-101');
  });

  it('gives null for a page that is not a sheet of the building', () => {
    expect(currentSheetLabel(building([sheet()]), 'u-1', 1)).toBeNull();
  });

  it('gives null for a projectUuid that is not a sheet of the building', () => {
    expect(currentSheetLabel(building([sheet()]), 'u-2', 0)).toBeNull();
  });

  it('gives null when no building is open', () => {
    expect(currentSheetLabel(null, 'u-1', 0)).toBeNull();
  });

  it('gives null when no document is open', () => {
    expect(currentSheetLabel(building([sheet()]), null, 0)).toBeNull();
  });

  it('gives null for an unstamped sheet', () => {
    expect(currentSheetLabel(building([sheet({ projectUuid: null })]), 'u-1', 0)).toBeNull();
  });

  it('uses the name of the level of the sheet', () => {
    expect(currentSheetLabel(building([sheet({ id: 's-2', levelId: 'L2', projectUuid: 'u-2', displayName: 'A-201' })]), 'u-2', 0)).toBe('Tower / First / A-201');
  });

  it('gives null for a sheet whose level is not in the building', () => {
    expect(currentSheetLabel(building([sheet({ levelId: 'L9' })]), 'u-1', 0)).toBeNull();
  });
});

describe('sheetStatusOf', () => {
  it('gives ok for a found file with a summary of the same size', () => {
    expect(sheetStatusOf(sheet(), { state: 'ok', sizeBytes: 500 }, summary)).toBe('ok');
  });

  it('gives old-summary when the file size differs from the summary', () => {
    expect(sheetStatusOf(sheet(), { state: 'ok', sizeBytes: 501 }, summary)).toBe('old-summary');
  });

  it('gives ok when the file size is not known', () => {
    expect(sheetStatusOf(sheet(), { state: 'ok' }, summary)).toBe('ok');
  });

  it('gives pdf-missing for a missing file', () => {
    expect(sheetStatusOf(sheet(), { state: 'missing' }, summary)).toBe('pdf-missing');
  });

  it('gives no-access for a file the app cannot read', () => {
    expect(sheetStatusOf(sheet(), { state: 'no-access' }, summary)).toBe('no-access');
  });

  it('gives not-stamped when the sheet has no projectUuid', () => {
    expect(sheetStatusOf(sheet({ projectUuid: null }), { state: 'ok', sizeBytes: 500 }, undefined)).toBe('not-stamped');
  });

  it('gives no-summary when the sheet has no stored summary', () => {
    expect(sheetStatusOf(sheet(), { state: 'ok', sizeBytes: 500 }, undefined)).toBe('no-summary');
  });

  it('gives ok for an unknown probe with a summary', () => {
    expect(sheetStatusOf(sheet(), { state: 'unknown' }, summary)).toBe('ok');
  });

  it('gives not-stamped for an unknown probe with no projectUuid', () => {
    expect(sheetStatusOf(sheet({ projectUuid: null }), { state: 'unknown' }, undefined)).toBe('not-stamped');
  });

  it('gives no-summary for an unknown probe with no summary', () => {
    expect(sheetStatusOf(sheet(), { state: 'unknown' }, undefined)).toBe('no-summary');
  });

  it('gives pdf-missing before not-stamped when the sheet has no projectUuid', () => {
    expect(sheetStatusOf(sheet({ projectUuid: null }), { state: 'missing' }, undefined)).toBe('pdf-missing');
  });

  it('gives no-access before not-stamped when the sheet has no projectUuid', () => {
    expect(sheetStatusOf(sheet({ projectUuid: null }), { state: 'no-access' }, undefined)).toBe('no-access');
  });

  it('gives not-opened for a sheet with a minted id and no summary', () => {
    expect(sheetStatusOf(sheet({ idMinted: true }), { state: 'ok', sizeBytes: 500 }, undefined)).toBe('not-opened');
  });

  it('gives no-summary for a sheet without a minted id and no summary', () => {
    expect(sheetStatusOf(sheet({ idMinted: undefined }), { state: 'ok', sizeBytes: 500 }, undefined)).toBe('no-summary');
  });

  it('gives ok for a sheet with a minted id and a summary', () => {
    expect(sheetStatusOf(sheet({ idMinted: true }), { state: 'ok', sizeBytes: 500 }, summary)).toBe('ok');
  });

  it('gives pdf-missing before not-opened for a sheet with a minted id', () => {
    expect(sheetStatusOf(sheet({ idMinted: true }), { state: 'missing' }, undefined)).toBe('pdf-missing');
  });

  it('never gives copy-suspected', () => {
    const statuses = [
      sheetStatusOf(sheet(), { state: 'ok', sizeBytes: 1 }, summary),
      sheetStatusOf(sheet({ projectUuid: null }), { state: 'ok', sizeBytes: 1 }, undefined),
    ];
    expect(statuses).not.toContain('copy-suspected');
  });
});

describe('statusLabel', () => {
  it('gives the label of every status', () => {
    const labels: Record<SheetStatus, string> = {
      ok: 'OK',
      'pdf-missing': 'Missing',
      'no-access': 'No access',
      'not-stamped': 'Not linked yet',
      'no-summary': 'No summary',
      'not-opened': 'Not opened yet',
      'old-summary': 'Out of date',
      'copy-suspected': 'May be a copy',
    };
    for (const [status, label] of Object.entries(labels)) {
      expect(statusLabel(status as SheetStatus)).toBe(label);
    }
  });
});

describe('statusHint', () => {
  it('gives the hint of every status', () => {
    const hints: Record<SheetStatus, string> = {
      ok: '',
      'pdf-missing': 'The PDF is not at its saved place. Use Relink.',
      'no-access': 'MepApp has no access to the folder of this PDF.',
      'not-stamped': 'MepApp cannot link this PDF to the sheet yet. Open the PDF in MepApp and save it once.',
      'no-summary': 'MepApp has not saved a summary for this sheet yet.',
      'not-opened': 'Open this PDF in MepApp to read its summary.',
      'old-summary': 'The PDF changed after the summary was saved.',
      'copy-suspected': 'This PDF may be a copy of another file.',
    };
    for (const [status, hint] of Object.entries(hints)) {
      expect(statusHint(status as SheetStatus)).toBe(hint);
    }
  });
});

describe('summaryCountText', () => {
  const sheets = [sheet({ id: 's-1' }), sheet({ id: 's-2' }), sheet({ id: 's-3' })];

  it('counts the sheets that have a summary entry', () => {
    expect(summaryCountText(sheets, { 's-1': {}, 's-3': {} })).toBe('2 of 3 sheets have a summary');
  });

  it('gives 0 of M when no sheet has a summary', () => {
    expect(summaryCountText(sheets, {})).toBe('0 of 3 sheets have a summary');
  });

  it('ignores summary keys of sheets that are not in the list', () => {
    expect(summaryCountText(sheets, { 'gone': {} })).toBe('0 of 3 sheets have a summary');
  });

  it('uses the singular for one sheet', () => {
    expect(summaryCountText([sheet({ id: 's-1' })], { 's-1': {} })).toBe('1 of 1 sheet has a summary');
    expect(summaryCountText([sheet({ id: 's-1' })], {})).toBe('0 of 1 sheet has a summary');
  });

  it('gives No sheets for an empty list', () => {
    expect(summaryCountText([], {})).toBe('No sheets');
  });
});

describe('statusTone', () => {
  it('gives the tone of every status', () => {
    expect(statusTone('ok')).toBe('ok');
    expect(statusTone('no-summary')).toBe('warn');
    expect(statusTone('not-opened')).toBe('warn');
    expect(statusTone('not-stamped')).toBe('warn');
    expect(statusTone('old-summary')).toBe('warn');
    expect(statusTone('copy-suspected')).toBe('warn');
    expect(statusTone('pdf-missing')).toBe('bad');
    expect(statusTone('no-access')).toBe('bad');
  });
});

function summaryWith(pages: SheetSummary['pages'], savedAt = '2026-11-02T08:30:00.000Z'): SheetSummary {
  return { version: 1, projectUuid: 'u-1', savedAt, sourceSizeBytes: 500, sourceModifiedMs: 5000, pages, tables: [], warnings: [] };
}

describe('sheetSummaryInfo', () => {
  it('gives undefined when there is no summary', () => {
    expect(sheetSummaryInfo(sheet(), undefined)).toBeUndefined();
  });

  it('gives the scale of a calibrated page', () => {
    const summary = summaryWith({ '0': { calibrated: true, pageUnitsPerRealUnit: calibrationFromScale(100).pageUnitsPerRealUnit, widthPt: 842, heightPt: 595, rotationDegrees: 0 } });
    expect(sheetSummaryInfo(sheet(), summary)).toEqual({ savedAt: '2026-11-02T08:30:00.000Z', scale: '1:100' });
  });

  it('gives no scale for an uncalibrated page', () => {
    const summary = summaryWith({ '0': { calibrated: false, pageUnitsPerRealUnit: null, widthPt: 842, heightPt: 595, rotationDegrees: 0 } });
    expect(sheetSummaryInfo(sheet(), summary)).toEqual({ savedAt: '2026-11-02T08:30:00.000Z', scale: null });
  });

  it('gives no scale when the summary has no entry for the page', () => {
    const summary = summaryWith({ '1': { calibrated: true, pageUnitsPerRealUnit: calibrationFromScale(100).pageUnitsPerRealUnit, widthPt: 842, heightPt: 595, rotationDegrees: 0 } });
    expect(sheetSummaryInfo(sheet(), summary)).toEqual({ savedAt: '2026-11-02T08:30:00.000Z', scale: null });
  });
});

describe('summaryText', () => {
  it('gives no summary for undefined', () => {
    expect(summaryText(undefined)).toBe('No summary');
  });

  it('gives the date and the scale of a calibrated sheet', () => {
    expect(summaryText({ savedAt: '2026-11-02T08:30:00.000Z', scale: '1:100' })).toBe('Summary saved 2026-11-02, scale 1:100');
  });

  it('gives the date and no scale for an uncalibrated sheet', () => {
    expect(summaryText({ savedAt: '2026-11-02T08:30:00.000Z', scale: null })).toBe('Summary saved 2026-11-02, no scale');
  });

  it('gives the savedAt text as is when it is not a date', () => {
    expect(summaryText({ savedAt: 'yesterday', scale: null })).toBe('Summary saved yesterday, no scale');
  });
});

describe('summary repair helpers', () => {
  it('counts only probed sheets with no summary', () => {
    const sheets = [sheet({ id: 'a' }), sheet({ id: 'b' }), sheet({ id: 'c' })];
    const status: Record<string, SheetStatus> = { a: 'no-summary', b: 'ok', d: 'pdf-missing' };
    sheets.push(sheet({ id: 'd' }));
    const found = sheetsWithoutSummary(sheets, status, { b: {} });
    expect(found.map((item) => item.id)).toEqual(['a']);
  });

  it('does not count a not-opened sheet as readable', () => {
    const sheets = [sheet({ id: 'a' }), sheet({ id: 'b' })];
    const status: Record<string, SheetStatus> = { a: 'not-opened', b: 'no-summary' };
    expect(sheetsWithoutSummary(sheets, status, {}).map((item) => item.id)).toEqual(['b']);
  });

  it('writes the count with the right verb', () => {
    expect(noSummaryText(1)).toBe('1 sheet has no summary');
    expect(noSummaryText(2)).toBe('2 sheets have no summary');
  });

  it('says which sheets can be read now', () => {
    expect(readableNoSummaryText(1)).toBe('1 sheet has no summary and can be read now.');
    expect(readableNoSummaryText(2)).toBe('2 sheets have no summary and can be read now.');
  });

  it('says how many PDFs need to be opened first after a rebuild', () => {
    expect(rebuildResultText({ ok: 2, failed: [], skipped: 0, cancelled: false })).toBe('Read 2 of 2 summaries.');
    expect(rebuildResultText({ ok: 2, failed: [{ sheet: sheet(), reason: 'PDF missing' }], skipped: 1, cancelled: false })).toBe(
      'Read 2 of 3 summaries. 1 PDF needs to be opened first.',
    );
    expect(rebuildResultText({ ok: 0, failed: [], skipped: 2, cancelled: false })).toBe('Read 0 of 0 summaries. 2 PDFs need to be opened first.');
    expect(rebuildResultText({ ok: 1, failed: [], skipped: 0, cancelled: true })).toBe('Read 1 of 1 summaries. Cancelled before the end.');
  });

  it('says which sheets cannot be read now', () => {
    expect(otherNoSummaryText(0)).toBe('');
    expect(otherNoSummaryText(1)).toBe(
      '1 more sheet has no summary and cannot be read now: its PDF is missing, has no access, is not opened yet, or is not checked yet.',
    );
    expect(otherNoSummaryText(3)).toBe(
      '3 more sheets have no summary and cannot be read now: their PDFs are missing, have no access, are not opened yet, or are not checked yet.',
    );
  });

  it('adapts the question to the action', () => {
    expect(notPlacedAskText('close', 1)).toBe('1 page is not placed. Close anyway?');
    expect(notPlacedAskText('switch', 2)).toBe('2 pages are not placed. Switch building anyway?');
  });

  it('shortens a long text', () => {
    expect(shortText('short', 10)).toBe('short');
    expect(shortText('a long failure text here', 10)).toBe('a long fa…');
  });
});
