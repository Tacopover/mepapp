import type { BuildingFile, BuildingSheet, SheetLocation } from './building.js';

export type BuildingEditError = 'unknown-level' | 'level-has-sheets' | 'duplicate-sheet';

export interface NewSheetPage {
  projectUuid: string | null;
  idMinted?: true;
  pageIndex: number;
  displayName: string;
  location: SheetLocation;
}

function sheetKey(projectUuid: string | null, path: string | undefined, pageIndex: number): string | null {
  const owner = typeof projectUuid === 'string' ? `u:${projectUuid}` : typeof path === 'string' ? `p:${path}` : null;
  return owner === null ? null : `${owner}#${String(pageIndex)}`;
}

/** A blank (after trim) name returns the file unchanged. The id stays. */
export function renameBuilding(file: BuildingFile, name: string): BuildingFile {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === file.name) return file;
  return { ...file, name: trimmed };
}

/** New level at the end. name is trimmed; a blank name becomes 'Level N' where N = levels.length + 1. elevationMm defaults to 0; a value that is not finite becomes 0. id defaults to crypto.randomUUID() (the optional last argument exists for tests). */
export function addLevel(file: BuildingFile, name: string, elevationMm?: number, id?: string): BuildingFile {
  const trimmed = name.trim();
  const label = trimmed === '' ? `Level ${file.levels.length + 1}` : trimmed;
  const elevation = elevationMm !== undefined && Number.isFinite(elevationMm) ? elevationMm : 0;
  return { ...file, levels: [...file.levels, { id: id ?? crypto.randomUUID(), name: label, elevationMm: elevation }] };
}

/** A blank (after trim) name or an unknown id returns the file unchanged. */
export function renameLevel(file: BuildingFile, levelId: string, name: string): BuildingFile {
  const trimmed = name.trim();
  if (trimmed === '' || !file.levels.some((level) => level.id === levelId)) return file;
  return { ...file, levels: file.levels.map((level) => (level.id === levelId ? { ...level, name: trimmed } : level)) };
}

/** A value that is not finite, or an unknown id, returns the file unchanged. Negative is allowed. */
export function setLevelElevation(file: BuildingFile, levelId: string, elevationMm: number): BuildingFile {
  if (!Number.isFinite(elevationMm) || !file.levels.some((level) => level.id === levelId)) return file;
  return { ...file, levels: file.levels.map((level) => (level.id === levelId ? { ...level, elevationMm } : level)) };
}

/** Refuses when a sheet or a riser member uses the level. */
export function deleteLevel(
  file: BuildingFile,
  levelId: string,
): { ok: true; file: BuildingFile } | { ok: false; error: BuildingEditError } {
  if (!file.levels.some((level) => level.id === levelId)) return { ok: false, error: 'unknown-level' };
  if (file.sheets.some((sheet) => sheet.levelId === levelId)) return { ok: false, error: 'level-has-sheets' };
  if (file.risers.some((riser) => riser.members.some((member) => member.levelId === levelId))) {
    return { ok: false, error: 'level-has-sheets' };
  }
  return { ok: true, file: { ...file, levels: file.levels.filter((level) => level.id !== levelId) } };
}

/** Adds one sheet per page at the end of sheets (sheet id = crypto.randomUUID()). A page whose document-page key (see CONTEXT) already has a sheet in the file, or appears twice in pages, is skipped and returned in skipped (the later one is skipped). A page with no key (projectUuid null and no location.path) is never skipped by the key rule. A page whose pageIndex is not a whole number >= 0 is always skipped, before the key rule. Unknown levelId: error 'unknown-level'. */
export function addSheets(
  file: BuildingFile,
  levelId: string,
  pages: NewSheetPage[],
): { ok: true; file: BuildingFile; skipped: NewSheetPage[] } | { ok: false; error: BuildingEditError } {
  if (!file.levels.some((level) => level.id === levelId)) return { ok: false, error: 'unknown-level' };
  const keys = new Set<string>();
  for (const sheet of file.sheets) {
    const key = sheetKey(sheet.projectUuid, sheet.location.path, sheet.pageIndex);
    if (key !== null) keys.add(key);
  }
  const added: BuildingSheet[] = [];
  const skipped: NewSheetPage[] = [];
  for (const page of pages) {
    if (!Number.isInteger(page.pageIndex) || page.pageIndex < 0) {
      skipped.push(page);
      continue;
    }
    const key = sheetKey(page.projectUuid, page.location.path, page.pageIndex);
    if (key !== null && keys.has(key)) {
      skipped.push(page);
      continue;
    }
    if (key !== null) keys.add(key);
    added.push({
      id: crypto.randomUUID(),
      levelId,
      projectUuid: page.projectUuid,
      ...(page.idMinted === true && page.projectUuid !== null ? { idMinted: true as const } : {}),
      pageIndex: page.pageIndex,
      displayName: page.displayName,
      location: structuredClone(page.location),
    });
  }
  return { ok: true, file: { ...file, sheets: [...file.sheets, ...added] }, skipped };
}

/** 'Detach the riser first.' text, or null when the sheet is not a riser member. */
export function sheetRemovalBlock(file: BuildingFile, sheetId: string): string | null {
  const isMember = file.risers.some((riser) => riser.members.some((member) => member.sheetId === sheetId));
  return isMember ? 'Detach the riser first.' : null;
}

/** Text when moveSheet would be refused because of a riser, else null. */
export function sheetMoveBlock(file: BuildingFile, sheetId: string, levelId: string): string | null {
  for (const riser of file.risers) {
    const own = riser.members.find((member) => member.sheetId === sheetId);
    if (own === undefined) continue;
    if (riser.members.some((member) => member !== own && member.levelId === levelId)) {
      return `Riser ${riser.name} already has a member on that level.`;
    }
  }
  return null;
}

/** Unknown ids: unchanged. A riser refusal (see sheetMoveBlock): unchanged. A riser member moves with its sheet. */
export function moveSheet(file: BuildingFile, sheetId: string, levelId: string): BuildingFile {
  if (!file.sheets.some((sheet) => sheet.id === sheetId) || !file.levels.some((level) => level.id === levelId)) {
    return file;
  }
  if (sheetMoveBlock(file, sheetId, levelId) !== null) return file;
  return {
    ...file,
    sheets: file.sheets.map((sheet) => (sheet.id === sheetId ? { ...sheet, levelId } : sheet)),
    risers: file.risers.map((riser) =>
      riser.members.some((member) => member.sheetId === sheetId)
        ? { ...riser, members: riser.members.map((member) => (member.sheetId === sheetId ? { ...member, levelId } : member)) }
        : riser,
    ),
  };
}

export function removeSheet(file: BuildingFile, sheetId: string): BuildingFile {
  if (!file.sheets.some((sheet) => sheet.id === sheetId) || sheetRemovalBlock(file, sheetId) !== null) return file;
  return { ...file, sheets: file.sheets.filter((sheet) => sheet.id !== sheetId) };
}

/** Replaces location; when projectUuid is given (not undefined) also replaces projectUuid. Unknown sheet: `{ ok: true }` with the same file. A string projectUuid is refused with 'duplicate-sheet' when another sheet (other id) has that projectUuid and the same pageIndex. null or undefined never refuses. A refusal leaves the file unchanged. */
export function relinkSheet(
  file: BuildingFile,
  sheetId: string,
  location: SheetLocation,
  projectUuid?: string | null,
): { ok: true; file: BuildingFile } | { ok: false; error: BuildingEditError } {
  const target = file.sheets.find((sheet) => sheet.id === sheetId);
  if (target === undefined) return { ok: true, file };
  if (typeof projectUuid === 'string') {
    const duplicate = file.sheets.some(
      (sheet) => sheet.id !== sheetId && sheet.projectUuid === projectUuid && sheet.pageIndex === target.pageIndex,
    );
    if (duplicate) return { ok: false, error: 'duplicate-sheet' };
  }
  return {
    ok: true,
    file: {
      ...file,
      sheets: file.sheets.map((sheet) =>
        sheet.id === sheetId
          ? { ...sheet, location: structuredClone(location), ...(projectUuid === undefined ? {} : { projectUuid }) }
          : sheet,
      ),
    },
  };
}

/** The file with idMinted removed from every sheet that has projectUuid. The same file when no sheet has the flag with that id. */
export function withIdInFile(file: BuildingFile, projectUuid: string): BuildingFile {
  if (!file.sheets.some((sheet) => sheet.projectUuid === projectUuid && sheet.idMinted === true)) return file;
  return {
    ...file,
    sheets: file.sheets.map((sheet) => {
      if (sheet.projectUuid !== projectUuid || sheet.idMinted !== true) return sheet;
      const next: BuildingSheet = { ...sheet };
      delete next.idMinted;
      return next;
    }),
  };
}

/** The file with projectUuid set to toUuid on the sheets that have fromUuid and idMinted, and idMinted removed from them. The same file when no sheet has both, when fromUuid equals toUuid, or when a sheet outside those sheets already has toUuid on a pageIndex they use. */
export function replaceMintedId(file: BuildingFile, fromUuid: string, toUuid: string): BuildingFile {
  if (fromUuid === toUuid) return file;
  const renamed = new Set(file.sheets.filter((sheet) => sheet.projectUuid === fromUuid && sheet.idMinted === true));
  if (renamed.size === 0) return file;
  const pages = new Set([...renamed].map((sheet) => sheet.pageIndex));
  if (file.sheets.some((sheet) => sheet.projectUuid === toUuid && pages.has(sheet.pageIndex))) return file;
  return {
    ...file,
    sheets: file.sheets.map((sheet) => {
      if (!renamed.has(sheet)) return sheet;
      const next: BuildingSheet = { ...sheet, projectUuid: toUuid };
      delete next.idMinted;
      return next;
    }),
  };
}

/** Sorts levels by elevationMm ascending. Equal elevations sort by name (case-insensitive), then keep their order. The same file object is returned when the levels are already in order. */
export function sortLevelsByElevation(file: BuildingFile): BuildingFile {
  const compare = (a: BuildingFile['levels'][number], b: BuildingFile['levels'][number]): number =>
    a.elevationMm - b.elevationMm || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const inOrder = file.levels.every((level, index) => index === 0 || compare(file.levels[index - 1]!, level) <= 0);
  if (inOrder) return file;
  return { ...file, levels: [...file.levels].sort(compare) };
}
