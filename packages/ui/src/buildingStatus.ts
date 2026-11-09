import { scaleDenominatorFromCalibration, type BuildingFile, type BuildingSheet, type SheetSummary } from '@mepapp/core';
import type { PathState } from '@mepapp/platform';
import type { RebuildResult } from './rebuildSummaries.js';

/** "<Building> / <Level> / <display name>" for the sheet with this projectUuid and pageIndex. Null when building is null, projectUuid is null, no sheet matches, or the level is missing. */
export function currentSheetLabel(building: BuildingFile | null, projectUuid: string | null, pageIndex: number): string | null {
  if (building === null || projectUuid === null) return null;
  const sheet = building.sheets.find((s) => s.projectUuid === projectUuid && s.pageIndex === pageIndex);
  if (sheet === undefined) return null;
  const level = building.levels.find((l) => l.id === sheet.levelId);
  if (level === undefined) return null;
  return `${building.name} / ${level.name} / ${sheet.displayName}`;
}

export type SheetStatus = 'ok' | 'pdf-missing' | 'no-access' | 'not-stamped' | 'no-summary' | 'not-opened' | 'old-summary' | 'copy-suspected';

/** state 'unknown' = the platform cannot probe the file (no path, or no statPath). */
export interface SheetProbe {
  state: PathState | 'unknown';
  sizeBytes?: number;
}

/** missing -> 'pdf-missing'; no-access -> 'no-access'; else projectUuid null -> 'not-stamped'; no summary -> 'not-opened' when the sheet has idMinted, else 'no-summary'; probe.sizeBytes known and different from summary.sourceSizeBytes -> 'old-summary'; else 'ok'. 'copy-suspected' is never returned here (reserved). */
export function sheetStatusOf(
  sheet: BuildingSheet,
  probe: SheetProbe,
  summary: { savedAt: string; sourceSizeBytes: number } | undefined,
): SheetStatus {
  if (probe.state === 'missing') return 'pdf-missing';
  if (probe.state === 'no-access') return 'no-access';
  if (sheet.projectUuid === null) return 'not-stamped';
  if (summary === undefined) return sheet.idMinted === true ? 'not-opened' : 'no-summary';
  if (probe.sizeBytes !== undefined && probe.sizeBytes !== summary.sourceSizeBytes) return 'old-summary';
  return 'ok';
}

export function statusLabel(status: SheetStatus): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'pdf-missing':
      return 'Missing';
    case 'no-access':
      return 'No access';
    case 'not-stamped':
      return 'Not linked yet';
    case 'no-summary':
      return 'No summary';
    case 'not-opened':
      return 'Not opened yet';
    case 'old-summary':
      return 'Out of date';
    case 'copy-suspected':
      return 'May be a copy';
  }
}

/** A longer plain sentence for the title or hint of a chip. Empty string when the chip word is enough. */
export function statusHint(status: SheetStatus): string {
  switch (status) {
    case 'ok':
      return '';
    case 'pdf-missing':
      return 'The PDF is not at its saved place. Use Relink.';
    case 'no-access':
      return 'MepApp has no access to the folder of this PDF.';
    case 'not-stamped':
      return 'MepApp cannot link this PDF to the sheet yet. Open the PDF in MepApp and save it once.';
    case 'no-summary':
      return 'MepApp has not saved a summary for this sheet yet.';
    case 'not-opened':
      return 'Open this PDF in MepApp to read its summary.';
    case 'old-summary':
      return 'The PDF changed after the summary was saved.';
    case 'copy-suspected':
      return 'This PDF may be a copy of another file.';
  }
}

export function statusTone(status: SheetStatus): 'ok' | 'warn' | 'bad' {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'pdf-missing':
    case 'no-access':
      return 'bad';
    case 'not-stamped':
    case 'no-summary':
    case 'not-opened':
    case 'old-summary':
    case 'copy-suspected':
      return 'warn';
  }
}

/** What the dialog shows about the saved summary of one sheet. scale is "1:N" (N rounded to an integer), or null when the page of the sheet is not calibrated or the summary has no entry for the page. */
export interface SheetSummaryInfo {
  savedAt: string;
  scale: string | null;
}

/** undefined when summary is undefined. */
export function sheetSummaryInfo(sheet: BuildingSheet, summary: SheetSummary | undefined): SheetSummaryInfo | undefined {
  if (summary === undefined) return undefined;
  const page = summary.pages[String(sheet.pageIndex)];
  const unitsPerReal = page?.pageUnitsPerRealUnit;
  const scale =
    page?.calibrated === true && typeof unitsPerReal === 'number' && Number.isFinite(unitsPerReal) && unitsPerReal > 0
      ? `1:${Math.round(scaleDenominatorFromCalibration({ pageUnitsPerRealUnit: unitsPerReal }))}`
      : null;
  return { savedAt: summary.savedAt, scale };
}

/** "No summary" for undefined; "Summary saved 2026-11-02, scale 1:100" or "Summary saved 2026-11-02, no scale". The date is the first 10 characters of savedAt when savedAt parses as a date, else the savedAt text as is. */
export function summaryText(info: SheetSummaryInfo | undefined): string {
  if (info === undefined) return 'No summary';
  const date = Number.isNaN(Date.parse(info.savedAt)) ? info.savedAt : info.savedAt.slice(0, 10);
  return info.scale === null ? `Summary saved ${date}, no scale` : `Summary saved ${date}, scale ${info.scale}`;
}

/** "N of M sheets have a summary". N = sheets whose id is a key of `summaries`. M = sheets.length. "1 of 1 sheet has a summary" for M = 1 (singular: "sheet has"). "No sheets" for M = 0. */
export function summaryCountText(sheets: readonly BuildingSheet[], summaries: Record<string, unknown>): string {
  const total = sheets.length;
  if (total === 0) return 'No sheets';
  const withSummary = sheets.filter((sheet) => Object.prototype.hasOwnProperty.call(summaries, sheet.id)).length;
  return total === 1 ? `${withSummary} of 1 sheet has a summary` : `${withSummary} of ${total} sheets have a summary`;
}

/** The sheets that have a probed status and no summary. A missing, no-access or not-opened PDF is not counted: a read cannot fix it. A sheet with no status yet is not counted (the probe has not run). */
export function sheetsWithoutSummary(sheets: readonly BuildingSheet[], status: Record<string, SheetStatus>, summaries: Record<string, unknown>): BuildingSheet[] {
  return sheets.filter(
    (sheet) =>
      status[sheet.id] !== undefined &&
      status[sheet.id] !== 'pdf-missing' &&
      status[sheet.id] !== 'no-access' &&
      status[sheet.id] !== 'not-opened' &&
      !Object.prototype.hasOwnProperty.call(summaries, sheet.id),
  );
}

/** "1 sheet has no summary" or "N sheets have no summary". */
export function noSummaryText(count: number): string {
  return count === 1 ? '1 sheet has no summary' : `${count} sheets have no summary`;
}

/** "1 sheet has no summary and can be read now." or "N sheets have no summary and can be read now.". */
export function readableNoSummaryText(count: number): string {
  return `${noSummaryText(count)} and can be read now.`;
}

/** "Read 2 of 3 summaries." The "of" count is the documents read and failed. Adds "1 PDF needs to be opened first." (or "N PDFs need ...") when skipped is above 0, and " Cancelled before the end." when cancelled. */
export function rebuildResultText(result: Pick<RebuildResult, 'ok' | 'failed' | 'skipped' | 'cancelled'>): string {
  const skippedText = result.skipped > 0 ? ` ${result.skipped} ${result.skipped === 1 ? 'PDF needs' : 'PDFs need'} to be opened first.` : '';
  const cancelledText = result.cancelled ? ' Cancelled before the end.' : '';
  return `Read ${result.ok} of ${result.ok + result.failed.length} summaries.${skippedText}${cancelledText}`;
}

/** The sheets without a summary that cannot be read now. Empty string for 0. */
export function otherNoSummaryText(count: number): string {
  if (count === 0) return '';
  if (count === 1) return '1 more sheet has no summary and cannot be read now: its PDF is missing, has no access, is not opened yet, or is not checked yet.';
  return `${count} more sheets have no summary and cannot be read now: their PDFs are missing, have no access, are not opened yet, or are not checked yet.`;
}

/** The text of the in-dialog question when an action drops the pages that wait for a level. */
export function notPlacedAskText(action: 'close' | 'switch', pages: number): string {
  const lead = `${pages} ${pages === 1 ? 'page is' : 'pages are'} not placed.`;
  switch (action) {
    case 'close':
      return `${lead} Close anyway?`;
    case 'switch':
      return `${lead} Switch building anyway?`;
  }
}

/** A short form of a long text for the status bar: the first `max` characters, then an ellipsis. */
export function shortText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
