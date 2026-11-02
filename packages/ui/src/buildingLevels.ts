import type { BuildingFile, BuildingLevel } from '@mepapp/core';

/** Elevation step between a new level and the highest level, in mm. */
const NEXT_LEVEL_STEP_MM = 3000;

/** Number of sheets that use the level. */
export function sheetCount(file: BuildingFile, levelId: string): number {
  return file.sheets.filter((sheet) => sheet.levelId === levelId).length;
}

/** null when the level can be deleted; otherwise the reason for the tooltip. */
export function deleteBlockedReason(file: BuildingFile, levelId: string): string | null {
  const count = sheetCount(file, levelId);
  if (count === 0) return null;
  return count === 1
    ? 'This level has 1 sheet. Move or remove the sheet first.'
    : `This level has ${count} sheets. Move or remove the sheets first.`;
}

/** Name for a new level: "Level N", N = levels.length + 1 (same as addLevel with a blank name). */
export function defaultLevelName(file: BuildingFile): string {
  return `Level ${file.levels.length + 1}`;
}

/** null when the level can be deleted; else "Remove its 2 sheets first" / "Remove its 1 sheet first". */
export function deleteBlockedText(file: BuildingFile, levelId: string): string | null {
  const count = sheetCount(file, levelId);
  if (count === 0) return null;
  return `Remove its ${countLabel(count, 'sheet')} first`;
}

/** null when sorting changes the order; else "Levels are already in order of elevation." (also when there are fewer than 2 levels). */
export function sortBlockedText(file: BuildingFile): string | null {
  const inOrder = file.levels.every((level, index) => index === 0 || file.levels[index - 1]!.elevationMm <= level.elevationMm);
  return inOrder ? 'Levels are already in order of elevation.' : null;
}

/** Puts a deleted level back at index (clamped). Returns the file unchanged when a level with that id exists. */
export function restoreLevel(file: BuildingFile, level: BuildingLevel, index: number): BuildingFile {
  if (file.levels.some((item) => item.id === level.id)) return file;
  const at = Math.min(Math.max(index, 0), file.levels.length);
  const levels = [...file.levels];
  levels.splice(at, 0, level);
  return { ...file, levels };
}

/** Elevation of a new level: the highest elevation + 3000, or 0 when there is no level. */
export function nextLevelElevation(file: BuildingFile): number {
  if (file.levels.length === 0) return 0;
  return Math.max(...file.levels.map((level) => level.elevationMm)) + NEXT_LEVEL_STEP_MM;
}

export function countLabel(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
