import { addSheets, moveSheet, type BuildingFile, type NewSheetPage, type SheetLocation } from '@mepapp/core';
import { openDocumentRows, type OpenDocumentRow } from './openDocumentsView.js';

export interface OpenDocumentAddResult {
  file: BuildingFile;
  added: number;
  moved: number;
}

/**
 * The NewSheetPage of one page of an open document. projectUuid is the row field sheetProjectUuid when the PDF holds its id.
 * A PDF without an id in the file takes the runtime id of the document with idMinted, the same as "Add PDFs…". A document with no runtime id gets projectUuid null.
 */
export function openDocumentNewPage(row: OpenDocumentRow, pageIndex: number): NewSheetPage {
  const location: SheetLocation = { fileName: row.doc.fileName };
  if (row.path !== undefined) location.path = row.path;
  if (row.doc.sizeBytes !== null) location.sizeBytes = row.doc.sizeBytes;
  const minted = row.sheetProjectUuid === null && row.doc.projectUuid !== null;
  return {
    projectUuid: row.sheetProjectUuid ?? row.doc.projectUuid,
    ...(minted ? { idMinted: true as const } : {}),
    pageIndex,
    displayName: row.pages[pageIndex]?.displayName ?? row.doc.fileName,
    location,
  };
}

/**
 * Puts the pages of one open document on a level. The row state is read again from `file`, so a second call with the same pages changes nothing.
 * A page with no sheet becomes a new sheet. A page that has a sheet on another level moves to this level when `move` is true. A page already on this level stays.
 * An unknown level returns the file unchanged.
 */
export function addOpenDocumentPages(
  file: BuildingFile,
  row: OpenDocumentRow,
  levelId: string,
  pageIndexes: readonly number[],
  move: boolean,
): OpenDocumentAddResult {
  if (!file.levels.some((level) => level.id === levelId)) return { file, added: 0, moved: 0 };
  const targets = new Map(row.path !== undefined ? [[row.doc.id, { name: row.doc.fileName, path: row.path }]] : []);
  if (row.sheetProjectUuid === null && row.path === undefined && row.doc.sizeBytes === null && file.sheets.some((sheet) => sheet.location.path === undefined && sheet.location.fileName === row.doc.fileName)) {
    return { file, added: 0, moved: 0 };
  }
  const fresh = openDocumentRows([row.doc], targets, file)[0]!;
  const wanted = new Set(pageIndexes);
  const pages = fresh.pages.filter((page) => wanted.has(page.pageIndex));
  const toAdd = pages.filter((page) => page.sheet === null).map((page) => openDocumentNewPage(fresh, page.pageIndex));
  const toMove = move ? pages.filter((page) => page.sheet !== null && page.sheet.levelId !== levelId) : [];
  let next = file;
  for (const page of toMove) next = moveSheet(next, page.sheet!.id, levelId);
  let added = 0;
  if (toAdd.length > 0) {
    const result = addSheets(next, levelId, toAdd);
    if (result.ok) {
      next = result.file;
      added = toAdd.length - result.skipped.length;
    }
  }
  return { file: next, added, moved: toMove.length };
}
