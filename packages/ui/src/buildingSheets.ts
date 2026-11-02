import type { BuildingFile, BuildingSheet, NewSheetPage, SheetLocation } from '@mepapp/core';

export const COLLAPSE_AFTER_PAGES = 20;

export interface PendingPdf {
  fileName: string;
  path?: string;
  sizeBytes: number;
  pageCount: number;
  projectUuid: string | null;
}

export interface PageRow {
  pageIndex: number;
  sheet: BuildingSheet | null;
}

export interface PdfGroup {
  key: string;
  fileName: string;
  path?: string;
  projectUuid: string | null;
  sizeBytes?: number;
  /** Pages in the PDF when known (a pending PDF); for a PDF known only from sheets: highest assigned pageIndex + 1. */
  pageCount: number;
  /** Pending PDF: one row per page 0..pageCount-1 (sheet null when unassigned). Sheets-only PDF: one row per sheet, sorted by pageIndex. */
  rows: PageRow[];
  pending: boolean;
  /** True when pageCount > COLLAPSE_AFTER_PAGES. */
  collapsedByDefault: boolean;
}

/** 'u:<projectUuid>' when the id is known, else 'p:<path>' when the path is known, else 'f:<fileName>'. */
export function pdfGroupKey(projectUuid: string | null, path: string | undefined, fileName: string): string {
  if (projectUuid !== null) return `u:${projectUuid}`;
  if (path !== undefined) return `p:${path}`;
  return `f:${fileName}`;
}

/** Pending PDFs first (in the order given), then the PDFs that only the sheets know (in the order of first sheet). A sheet joins the group with the same key; a pending PDF and sheets with the same key are one group (pending: true). */
export function groupPdfs(file: BuildingFile, pending: readonly PendingPdf[]): PdfGroup[] {
  const groups = new Map<string, PdfGroup>();
  for (const pdf of pending) {
    const key = pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName);
    if (groups.has(key)) continue;
    const rows: PageRow[] = Array.from({ length: pdf.pageCount }, (_, pageIndex) => ({ pageIndex, sheet: null }));
    groups.set(key, {
      key,
      fileName: pdf.fileName,
      path: pdf.path,
      projectUuid: pdf.projectUuid,
      sizeBytes: pdf.sizeBytes,
      pageCount: pdf.pageCount,
      rows,
      pending: true,
      collapsedByDefault: pdf.pageCount > COLLAPSE_AFTER_PAGES,
    });
  }
  const sheetsOnly = new Map<string, BuildingSheet[]>();
  for (const sheet of file.sheets) {
    const key = pdfGroupKey(sheet.projectUuid, sheet.location.path, sheet.location.fileName);
    const group = groups.get(key);
    if (group !== undefined) {
      if (group.rows[sheet.pageIndex] !== undefined) group.rows[sheet.pageIndex] = { pageIndex: sheet.pageIndex, sheet };
      continue;
    }
    const list = sheetsOnly.get(key);
    if (list !== undefined) list.push(sheet);
    else sheetsOnly.set(key, [sheet]);
  }
  for (const [key, sheets] of sheetsOnly) {
    const first = sheets[0]!;
    const sorted = [...sheets].sort((a, b) => a.pageIndex - b.pageIndex);
    groups.set(key, {
      key,
      fileName: first.location.fileName,
      path: first.location.path,
      projectUuid: first.projectUuid,
      sizeBytes: first.location.sizeBytes,
      pageCount: sorted[sorted.length - 1]!.pageIndex + 1,
      rows: sorted.map((sheet) => ({ pageIndex: sheet.pageIndex, sheet })),
      pending: false,
      collapsedByDefault: sorted[sorted.length - 1]!.pageIndex + 1 > COLLAPSE_AFTER_PAGES,
    });
  }
  return [...groups.values()];
}

/** The file name as it is when pageCount is 1 ('A101.pdf'), else '<fileName> p<pageIndex+1>' ('A101.pdf p2'). */
export function sheetDisplayName(fileName: string, pageIndex: number, pageCount: number): string {
  return pageCount === 1 ? fileName : `${fileName} p${pageIndex + 1}`;
}

/** The NewSheetPage for addSheets: projectUuid and location { fileName, path (only when defined), sizeBytes (only when defined) } from the group, displayName from sheetDisplayName. */
export function newSheetPage(group: PdfGroup, pageIndex: number): NewSheetPage {
  const location: SheetLocation = { fileName: group.fileName };
  if (group.path !== undefined) location.path = group.path;
  if (group.sizeBytes !== undefined) location.sizeBytes = group.sizeBytes;
  return {
    projectUuid: group.projectUuid,
    pageIndex,
    displayName: sheetDisplayName(group.fileName, pageIndex, group.pageCount),
    location,
  };
}

/** True when two pending entries name the same PDF (same pdfGroupKey). */
export function isSamePdf(a: PendingPdf, b: PendingPdf): boolean {
  return pdfGroupKey(a.projectUuid, a.path, a.fileName) === pdfGroupKey(b.projectUuid, b.path, b.fileName);
}

/** How many pages in total and how many assigned over the groups, for a hint line: { pdfs, pages, assigned }. Pages of a sheets-only group count as assigned pages. */
export function pdfTotals(groups: readonly PdfGroup[]): { pdfs: number; pages: number; assigned: number } {
  let pages = 0;
  let assigned = 0;
  for (const group of groups) {
    pages += group.pending ? group.pageCount : group.rows.length;
    assigned += group.rows.filter((row) => row.sheet !== null).length;
  }
  return { pdfs: groups.length, pages, assigned };
}
