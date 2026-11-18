import { describe, expect, it } from 'vitest';
import { statusHint, type SheetStatus } from './buildingStatus.js';
import { CHANGED_ROW_LINE } from './changedFile.js';
import { chooseFileTitle, sheetRowLine, type RowLineInput } from './sheetRowLine.js';

const base: RowLineInput = { web: true, status: 'ok', opened: false, missingPage: null, changed: false, canOpen: true };
const line = (over: Partial<RowLineInput>) => sheetRowLine({ ...base, ...over });

describe('sheetRowLine (web)', () => {
  it('shows nothing for an opened row, whatever else is true', () => {
    expect(line({ opened: true, missingPage: 3, changed: true, canOpen: false, status: 'not-stamped' })).toBeNull();
  });
  it('names the missing page', () => {
    expect(line({ missingPage: 4 })).toBe('Page 4 is not in the file. Remove this sheet, or choose another file.');
  });
  it('shows the changed line', () => {
    expect(line({ changed: true })).toBe(CHANGED_ROW_LINE);
  });
  it('asks for the file when the app cannot open it', () => {
    expect(line({ canOpen: false })).toBe('The browser needs this PDF file again. Click Choose file…');
  });
  it('shows the identity line for not-stamped and not-opened', () => {
    expect(line({ status: 'not-stamped' })).toBe(statusHint('not-stamped'));
    expect(line({ status: 'not-opened' })).toBe(statusHint('not-opened'));
  });
  it('shows nothing for other statuses or no status', () => {
    expect(line({ status: 'ok' })).toBeNull();
    expect(line({ status: undefined })).toBeNull();
  });
  it('orders page missing, changed, needs file, identity', () => {
    const all = { missingPage: 2, changed: true, canOpen: false, status: 'not-stamped' as SheetStatus };
    expect(line(all)).toMatch(/^Page 2 is not in the file/);
    expect(line({ ...all, missingPage: null })).toBe(CHANGED_ROW_LINE);
    expect(line({ ...all, missingPage: null, changed: false })).toMatch(/^The browser needs/);
    expect(line({ ...all, missingPage: null, changed: false, canOpen: true })).toBe(statusHint('not-stamped'));
  });
});

describe('sheetRowLine (desktop)', () => {
  const desktop = (over: Partial<RowLineInput>) => line({ web: false, ...over });
  it('keeps the old lines', () => {
    expect(desktop({ status: 'not-stamped' })).toBe(statusHint('not-stamped'));
    expect(desktop({ status: 'not-opened' })).toBe(statusHint('not-opened'));
    expect(desktop({ status: 'ok' })).toBeNull();
    expect(desktop({ status: undefined })).toBeNull();
  });
  it('ignores the web inputs', () => {
    expect(desktop({ status: 'ok', missingPage: 2, changed: true, canOpen: false, opened: true })).toBeNull();
    expect(desktop({ status: 'not-opened', missingPage: 2, changed: true, canOpen: false, opened: true })).toBe(statusHint('not-opened'));
  });
});

describe('chooseFileTitle', () => {
  it('gives the three texts', () => {
    expect(chooseFileTitle(true, true)).toBe('The PDF changed. Choose the new file to use it.');
    expect(chooseFileTitle(false, true)).toBe('This browser cannot open the PDF by itself. Choose the file again.');
    expect(chooseFileTitle(false, false)).toBe('Choose the PDF file to open this sheet');
  });
});
