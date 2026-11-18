import type { BuildingFile, BuildingSheet } from '@mepapp/core';
import type { OpenedFile } from '@mepapp/platform';
import { sheetPdfKey } from './buildingSheets.js';

/** True when some sheet has this file name with a size, and no sheet has this file name and this size. */
export function isChangedFile(file: BuildingFile, name: string, size: number): boolean {
  let sameName = false;
  for (const sheet of file.sheets) {
    const sheetSize = sheet.location.sizeBytes;
    if (sheet.location.fileName !== name || sheetSize === undefined) continue;
    if (sheetSize === size) return false;
    sameName = true;
  }
  return sameName;
}

/** Groups of sheets (by sheetPdfKey) that carry this file name and have a size. One group = one PDF. */
export function sheetGroupsOfName(file: BuildingFile, name: string): BuildingSheet[][] {
  const groups = new Map<string, BuildingSheet[]>();
  for (const sheet of file.sheets) {
    if (sheet.location.fileName !== name || sheet.location.sizeBytes === undefined) continue;
    const key = sheetPdfKey(sheet);
    const list = groups.get(key) ?? [];
    list.push(sheet);
    groups.set(key, list);
  }
  return [...groups.values()];
}

/** 1-based, sorted, unique page numbers of the sheets with pageIndex >= pageCount. */
export function lostPageNumbers(sheets: readonly BuildingSheet[], pageCount: number): number[] {
  const pages = new Set<number>();
  for (const sheet of sheets) {
    if (sheet.pageIndex >= pageCount) pages.add(sheet.pageIndex + 1);
  }
  return [...pages].sort((a, b) => a - b);
}

export interface ChangedItem {
  fileName: string;
  /** The new file. */
  opened: OpenedFile;
  /** All sheets of the PDF, all levels. */
  sheetIds: string[];
  /** From readPdfInfo of the new file. */
  projectUuid: string | null;
  /** From readPdfInfo. Null when the engine is missing. */
  pageCount: number | null;
  /** lostPageNumbers. Empty when pageCount is null. */
  lostPages: number[];
}

/**
 * Splits the picked files into changed files and dropped files.
 * A changed file has the name of a sheet and another size. It is dropped when the same pick holds a file with the same name and an exact size of a sheet (the exact file wins).
 */
export function splitChangedPicks<T extends { file: { name: string; size: number } }>(
  file: BuildingFile,
  picked: readonly T[],
): { changed: T[]; dropped: T[] } {
  const exactNames = new Set(
    picked
      .filter((item) => file.sheets.some((sheet) => sheet.location.fileName === item.file.name && sheet.location.sizeBytes === item.file.size))
      .map((item) => item.file.name),
  );
  const changed: T[] = [];
  const dropped: T[] = [];
  for (const item of picked) {
    if (!isChangedFile(file, item.file.name, item.file.size)) continue;
    (exactNames.has(item.file.name) ? dropped : changed).push(item);
  }
  return { changed, dropped };
}

/** The sheet with the preferred id when it is one of the ids and still in the file, else the first sheet of the ids that is still in the file. */
export function sheetChoice(file: BuildingFile, sheetIds: readonly string[], preferredId: string | null): BuildingSheet | undefined {
  if (preferredId !== null && sheetIds.includes(preferredId)) {
    const preferred = file.sheets.find((sheet) => sheet.id === preferredId);
    if (preferred !== undefined) return preferred;
  }
  for (const id of sheetIds) {
    const sheet = file.sheets.find((item) => item.id === id);
    if (sheet !== undefined) return sheet;
  }
  return undefined;
}

/** The sheet with the file name and size of the new file. It keeps its project id unless the item has one. */
export function sheetWithNewFile(sheet: BuildingSheet, item: ChangedItem): BuildingSheet {
  return {
    ...sheet,
    projectUuid: item.projectUuid ?? sheet.projectUuid,
    location: { ...sheet.location, fileName: item.opened.file.name, sizeBytes: item.opened.file.size },
  };
}

export const CHANGED_ROW_LINE = 'The PDF changed after it was added. Click Choose file… and use the new file.';

export function changedRowLine(): string {
  return CHANGED_ROW_LINE;
}

function sheetsText(count: number): string {
  return count === 1 ? '1 sheet' : `${count} sheets`;
}

function namesList(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

function sumOf(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function lostPagesSentence(item: ChangedItem): string {
  const pages = item.lostPages;
  const have = item.pageCount ?? 0;
  const count = `The new file has ${have === 1 ? '1 page' : `${have} pages`}.`;
  return pages.length === 1
    ? `${count} The sheet for page ${pages[0]} cannot open.`
    : `${count} The sheets for pages ${pages.join(', ')} cannot open.`;
}

export function changedPromptText(items: readonly ChangedItem[]): string {
  const sheets = sumOf(items.map((item) => item.sheetIds.length));
  if (items.length === 1) {
    const item = items[0]!;
    const base = `${item.fileName} changed. Use the new file for ${sheets === 1 ? 'this sheet' : `${sheets} sheets`}?`;
    return item.lostPages.length > 0 ? `${base} ${lostPagesSentence(item)}` : base;
  }
  const names = namesList(items.map((item) => item.fileName));
  const base = `${items.length} PDFs changed: ${names}. Use the new files for ${sheets} sheets?`;
  const lost = sumOf(items.map((item) => item.lostPages.length));
  if (lost === 0) return base;
  return lost === 1
    ? `${base} 1 sheet is for a page that is not in the new file.`
    : `${base} ${lost} sheets are for pages that are not in the new files.`;
}

function cannotOpenSentence(item: ChangedItem): string {
  const pages = item.lostPages;
  return pages.length === 1
    ? `The sheet for page ${pages[0]} of ${item.fileName} cannot open. Remove it, or choose another file.`
    : `The sheets for pages ${pages.join(', ')} of ${item.fileName} cannot open. Remove them, or choose another file.`;
}

export function changedUseNotice(item: ChangedItem): string {
  const base = `Using the new ${item.fileName} for ${sheetsText(item.sheetIds.length)}.`;
  return item.lostPages.length > 0 ? `${base} ${cannotOpenSentence(item)}` : base;
}

export function changedManyUseText(items: readonly ChangedItem[]): string {
  const pdfs = items.length === 1 ? '1 PDF' : `${items.length} PDFs`;
  const base = `Using the new files for ${pdfs} (${sheetsText(sumOf(items.map((item) => item.sheetIds.length)))}).`;
  const lost = items.filter((item) => item.lostPages.length > 0).map(cannotOpenSentence);
  return lost.length > 0 ? `${base} ${lost.join(' ')}` : base;
}

export function changedCancelText(items: readonly ChangedItem[]): string {
  if (items.length === 1) return `${items[0]!.fileName} changed and was not used.`;
  return `${items.length} PDFs changed and were not used: ${namesList(items.map((item) => item.fileName))}.`;
}

export function twoChangedText(names: readonly string[], source: 'folder' | 'picked'): string {
  const who = source === 'folder' ? 'the folder has' : 'you chose';
  return `For ${names.join(', ')} ${who} two different files with another size. The app cannot tell which one to use. Use Choose file… on its row.`;
}
