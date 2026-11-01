import type { BuildingFile, BuildingSheet, SheetLocation } from './building.js';

export type DuplicateVerdict = 'none' | 'moved' | 'copy' | 'unclear';

export interface SheetMatch {
  sheet: BuildingSheet;
  strength: 'id' | 'path' | 'weak';
}

export interface SheetDocument {
  projectUuid: string | null;
  path?: string;
  fileName: string;
  sizeBytes: number;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function strengthOf(sheet: BuildingSheet, doc: SheetDocument): SheetMatch['strength'] | null {
  if (doc.projectUuid !== null && sheet.projectUuid === doc.projectUuid) return 'id';
  // Two different ids name two different documents, whatever the path or the size say.
  if (doc.projectUuid !== null && sheet.projectUuid !== null) return null;
  const storedPath = sheet.location.path;
  if (doc.path !== undefined && storedPath !== undefined && normalizePath(doc.path) === normalizePath(storedPath)) return 'path';
  if (sheet.location.fileName === doc.fileName && sheet.location.sizeBytes === doc.sizeBytes) return 'weak';
  return null;
}

const STRENGTH_ORDER: Record<SheetMatch['strength'], number> = { id: 0, path: 1, weak: 2 };

/** The sheets of the building file that can belong to an open document, strongest match first (id, then path, then file name with size). The order inside one strength follows the sheet order of the file. */
export function findSheets(file: BuildingFile, doc: SheetDocument): SheetMatch[] {
  const matches: SheetMatch[] = [];
  for (const sheet of file.sheets) {
    const strength = strengthOf(sheet, doc);
    if (strength !== null) matches.push({ sheet, strength });
  }
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => STRENGTH_ORDER[a.match.strength] - STRENGTH_ORDER[b.match.strength] || a.index - b.index)
    .map((entry) => entry.match);
}

/**
 * Decides whether an open document that carries a known id is the stored document relocated, or a copy of it.
 * Port of DocumentIdentityService.CheckForDuplicate (DocumentIdentityService.cs:153-178). A stored file that
 * the app cannot read ('no-access') is never called 'moved'.
 */
export function duplicateVerdict(args: {
  openPath: string | undefined;
  storedPath: string | undefined;
  storedState: 'ok' | 'missing' | 'no-access';
  sameSizeAndTime: boolean;
}): DuplicateVerdict {
  if (args.storedPath === undefined || args.storedPath === '') return 'none';
  if (args.openPath === undefined || args.openPath === '') return 'unclear';
  if (normalizePath(args.openPath) === normalizePath(args.storedPath)) return 'none';
  if (args.storedState === 'no-access') return 'unclear';
  if (args.storedState === 'missing') return 'moved';
  return args.sameSizeAndTime ? 'unclear' : 'copy';
}

/** The file with the id set on one sheet. The same file when no sheet has that id. */
export function withProjectUuid(file: BuildingFile, sheetId: string, projectUuid: string): BuildingFile {
  if (!file.sheets.some((sheet) => sheet.id === sheetId)) return file;
  return {
    ...file,
    sheets: file.sheets.map((sheet) => (sheet.id === sheetId ? { ...sheet, projectUuid } : sheet)),
  };
}

/** The file with a new location on every sheet of one document. Fields that the new location leaves out keep their old value. */
export function withMovedLocation(file: BuildingFile, projectUuid: string, location: SheetLocation): BuildingFile {
  if (!file.sheets.some((sheet) => sheet.projectUuid === projectUuid)) return file;
  return {
    ...file,
    sheets: file.sheets.map((sheet) =>
      sheet.projectUuid === projectUuid ? { ...sheet, location: { ...sheet.location, ...location } } : sheet,
    ),
  };
}
