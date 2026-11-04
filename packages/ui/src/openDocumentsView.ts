import { findSheets, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { DocumentSummary } from '@mepapp/render';
import type { FileTarget } from '@mepapp/platform';
import { sheetDisplayName } from './buildingSheets.js';

export interface OpenDocumentPage {
  pageIndex: number;
  sheet: BuildingSheet | null;
  levelName: string | null;
  displayName: string;
}

export interface OpenDocumentRow {
  doc: DocumentSummary & { active: boolean; currentPage: number | null };
  path: string | undefined;
  displayName: string;
  pages: OpenDocumentPage[];
  state: 'placed' | 'partly' | 'not-placed';
  needsSave: boolean;
  sheetProjectUuid: string | null;
}

/** Ids of the sheets whose PDF is open in the viewer (any page of an open document that is matched to a sheet). */
export function openedSheetIds(rows: readonly OpenDocumentRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const page of row.pages) {
      if (page.sheet !== null) ids.add(page.sheet.id);
    }
  }
  return ids;
}

/** One row per open document that holds a PDF, in the order of docs. A page takes the strongest sheet match for its page index. A name-and-size match counts only when the document has no path. An id counts only when the file holds it (projectUuidInFile); a minted id never matches a sheet, and needsSave is true until a Save writes it. */
export function openDocumentRows(
  docs: readonly DocumentSummary[],
  targets: ReadonlyMap<string, FileTarget>,
  file: BuildingFile | null,
  active: { documentId: string | null; pageIndex: number | null } = { documentId: null, pageIndex: null },
): OpenDocumentRow[] {
  return docs.filter((doc) => doc.hasPdf && doc.pageCount > 0).map((doc) => {
    const path = targets.get(doc.id)?.path;
    const isActive = doc.id === active.documentId;
    const sheetProjectUuid = doc.projectUuidInFile ? doc.projectUuid : null;
    const matches =
      file === null
        ? []
        : findSheets(file, {
            projectUuid: sheetProjectUuid,
            ...(path !== undefined ? { path } : {}),
            fileName: doc.fileName,
            sizeBytes: doc.sizeBytes ?? Number.NaN,
          }).filter((match) => !(match.strength === 'weak' && path !== undefined));
    const pages: OpenDocumentPage[] = Array.from({ length: doc.pageCount }, (_, pageIndex) => {
      const sheet = matches.find((match) => match.sheet.pageIndex === pageIndex)?.sheet ?? null;
      const levelName = sheet === null ? null : (file?.levels.find((level) => level.id === sheet.levelId)?.name ?? null);
      return { pageIndex, sheet, levelName, displayName: sheetDisplayName(doc.fileName, pageIndex, doc.pageCount) };
    });
    const placed = pages.filter((page) => page.sheet !== null).length;
    const state: OpenDocumentRow['state'] = placed === 0 ? 'not-placed' : placed === pages.length ? 'placed' : 'partly';
    return {
      doc: { ...doc, active: isActive, currentPage: isActive ? active.pageIndex : null },
      path,
      displayName: doc.fileName,
      pages,
      state,
      needsSave: !doc.projectUuidInFile,
      sheetProjectUuid,
    };
  });
}
