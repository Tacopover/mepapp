import { statusHint, type SheetStatus } from './buildingStatus.js';
import { CHANGED_ROW_LINE } from './changedFile.js';

export interface RowLineInput {
  /** True in the web app (no readPath). A desktop row keeps the old lines. */
  web: boolean;
  status: SheetStatus | undefined;
  /** The sheet is open in the viewer. */
  opened: boolean;
  /** 1-based page number when the last open found that the page is not in the file, else null. */
  missingPage: number | null;
  /** The sheet is in ChangedFiles.changedSheetIds. */
  changed: boolean;
  /** The app can open the PDF now (canOpenCached: in the tab or stored). */
  canOpen: boolean;
}

/** The one line under a row, or null for none. Order of spec 6.3: opened none; page missing; changed; needs the file; then the identity line. */
export function sheetRowLine(input: RowLineInput): string | null {
  const { web, status, opened, missingPage, changed, canOpen } = input;
  if (!web) return status === 'not-stamped' || status === 'not-opened' ? statusHint(status) : null;
  if (opened) return null;
  if (missingPage !== null) return `Page ${missingPage} is not in the file. Remove this sheet, or choose another file.`;
  if (changed) return CHANGED_ROW_LINE;
  if (!canOpen) return 'The browser needs this PDF file again. Click Choose file…';
  if (status === 'not-stamped' || status === 'not-opened') return statusHint(status);
  return null;
}

export function chooseFileTitle(changed: boolean, web: boolean): string {
  if (changed) return 'The PDF changed. Choose the new file to use it.';
  if (web) return 'This browser cannot open the PDF by itself. Choose the file again.';
  return 'Choose the PDF file to open this sheet';
}
