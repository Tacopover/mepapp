import type { BuildingFile } from '@mepapp/core';

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

/** Elevation of a new level: the highest elevation + 3000, or 0 when there is no level. */
export function nextLevelElevation(file: BuildingFile): number {
  if (file.levels.length === 0) return 0;
  return Math.max(...file.levels.map((level) => level.elevationMm)) + NEXT_LEVEL_STEP_MM;
}

export function countLabel(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
