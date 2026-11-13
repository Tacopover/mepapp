import type { BuildingSheet } from '@mepapp/core';
import { SheetFileCache } from './sheetFileCache.js';

export interface PdfNeed {
  fileName: string;
  sizeBytes: number;
  sheet: BuildingSheet;
}

/** Distinct fileName+size among `sheets` that have a size, are not opened in the viewer and for which canOpen(sheet) is false. Order of first appearance. */
export function pdfsNeedingFile(
  sheets: BuildingSheet[],
  canOpen: (sheet: BuildingSheet) => boolean,
  openedSheetIds: ReadonlySet<string> = new Set(),
): PdfNeed[] {
  const seen = new Set<string>();
  const needed: PdfNeed[] = [];
  for (const sheet of sheets) {
    const size = sheet.location.sizeBytes;
    if (size === undefined || openedSheetIds.has(sheet.id) || canOpen(sheet)) continue;
    const key = SheetFileCache.key(sheet.location.fileName, size);
    if (seen.has(key)) continue;
    seen.add(key);
    needed.push({ fileName: sheet.location.fileName, sizeBytes: size, sheet });
  }
  return needed;
}

export function reconnectHint(count: number): string {
  if (count === 1) return '1 PDF needs a file before it opens. Choose it again.';
  return `${count} PDFs need a file before they open. Choose them all in one step.`;
}

export function reconnectTooltip(levelScope: boolean): string {
  return `Choose the PDF files of this ${levelScope ? 'level' : 'building'}. The app finds the sheets by file name and size. No sheet is added or changed.`;
}

export interface ReconnectInput {
  needed: PdfNeed[];
  picked: { name: string; size: number }[];
  scopeKeys: ReadonlySet<string>;
  buildingKeys: ReadonlySet<string>;
  isFound: (need: PdfNeed) => boolean;
  isAmbiguous: (need: PdfNeed) => boolean;
  levelScope: boolean;
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names)];
}

function namesList(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

function foundText(found: number, total: number): string {
  if (found === total) return total === 1 ? 'Found the PDF.' : `Found all ${total} PDFs.`;
  return total === 1 ? `Found ${found} of 1 PDF.` : `Found ${found} of ${total} PDFs.`;
}

/** The notice after a pick of files. Parts join with one space, in this order: found, missing, two files, other levels, not used. */
export function reconnectResult(input: ReconnectInput): { text: string; error: boolean } {
  const { needed, picked, scopeKeys, buildingKeys, isFound, isAmbiguous, levelScope } = input;
  const total = needed.length;
  const found = needed.filter(isFound).length;
  const neededKeys = new Set(needed.map((need) => SheetFileCache.key(need.fileName, need.sizeBytes)));
  const pickedKeys = picked.map((file) => SheetFileCache.key(file.name, file.size));
  const pickedKeySet = new Set(pickedKeys);
  const parts: string[] = [];

  if (total > 0) parts.push(foundText(found, total));
  if (total > 0 && found === 0 && !pickedKeys.some((key) => neededKeys.has(key))) {
    parts.push(
      picked.length === 1
        ? 'The file you chose does not have the same name and size as a PDF of the sheets here.'
        : `None of the ${picked.length} files you chose has the same name and size as a PDF of the sheets here.`,
    );
  }
  if (found < total) {
    const missing = uniqueNames(needed.filter((need) => !isFound(need)).map((need) => need.fileName));
    parts.push(`Missing: ${namesList(missing)}.`);
  }

  const twoFiles = uniqueNames(
    needed
      .filter((need) => !isFound(need) && isAmbiguous(need) && pickedKeySet.has(SheetFileCache.key(need.fileName, need.sizeBytes)))
      .map((need) => need.fileName),
  );
  if (twoFiles.length > 0) {
    parts.push(
      `For ${twoFiles.join(', ')} you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.`,
    );
  }

  if (levelScope) {
    const other = picked.filter((file) => {
      const key = SheetFileCache.key(file.name, file.size);
      return !scopeKeys.has(key) && buildingKeys.has(key);
    }).length;
    if (other > 0) parts.push(other === 1 ? '1 file is for another level.' : `${other} files are for other levels.`);
  }

  const unused = picked.filter((file) => !buildingKeys.has(SheetFileCache.key(file.name, file.size))).length;
  if (unused > 0) parts.push(unused === 1 ? '1 file was not used.' : `${unused} files were not used.`);

  return { text: parts.join(' '), error: found === 0 && total >= 1 };
}
