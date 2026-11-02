import type { BuildingFile, BuildingSheet } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { currentSheetLabel, sheetStatusOf, statusLabel, statusTone, type SheetStatus } from './buildingStatus.js';

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
      'pdf-missing': 'PDF missing',
      'no-access': 'No access to the PDF',
      'not-stamped': 'Not stamped yet. Open and save it in MepApp.',
      'no-summary': 'No summary yet',
      'old-summary': 'Summary is out of date',
      'copy-suspected': 'May be a copy of another file',
    };
    for (const [status, label] of Object.entries(labels)) {
      expect(statusLabel(status as SheetStatus)).toBe(label);
    }
  });
});

describe('statusTone', () => {
  it('gives the tone of every status', () => {
    expect(statusTone('ok')).toBe('ok');
    expect(statusTone('no-summary')).toBe('warn');
    expect(statusTone('not-stamped')).toBe('warn');
    expect(statusTone('old-summary')).toBe('warn');
    expect(statusTone('copy-suspected')).toBe('warn');
    expect(statusTone('pdf-missing')).toBe('bad');
    expect(statusTone('no-access')).toBe('bad');
  });
});
