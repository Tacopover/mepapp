import { emptyBuilding } from '@mepapp/core';
import type { BuildingFile, BuildingSheet, BuildingLevel as CoreBuildingLevel } from '@mepapp/core';

export interface BuildingLevel {
  id: string;
  name: string;
  /** File name of the document currently assigned to this level, or null if none. */
  documentFileName: string | null;
}

export interface Building {
  id: string;
  name: string;
  levels: BuildingLevel[];
}

const BUILDINGS_STORAGE_KEY = 'mepapp.buildings.v1';
export const IMPORTED_OLD_BUILDINGS_KEY = 'mepapp.buildings.imported.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadBuildings(storage?: StorageLike): Building[] {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(BUILDINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Building[]) : [];
  } catch {
    return [];
  }
}

/** Ids of old buildings that were imported. Bad JSON gives []. */
export function loadImportedOldIds(storage?: StorageLike): string[] {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(IMPORTED_OLD_BUILDINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markOldImported(ids: string[], storage?: StorageLike): void {
  const merged = [...new Set([...loadImportedOldIds(storage), ...ids])];
  try {
    (storage ?? globalThis.localStorage).setItem(IMPORTED_OLD_BUILDINGS_KEY, JSON.stringify(merged));
  } catch {
    // Storage can be full or blocked; the old building then shows as pending again.
  }
}

/** Old buildings whose id is not in importedIds. Pure. */
export function pendingOldBuildings(all: Building[], importedIds: string[]): Building[] {
  return all.filter((building) => !importedIds.includes(building.id));
}

/** Each old Building becomes an empty BuildingFile with the same id and name. Each old level keeps its id and name with elevationMm = 0. A level with documentFileName becomes one sheet: id `${level.id}-sheet`, levelId, projectUuid null, pageIndex 0, displayName = documentFileName, location { fileName: documentFileName }. Pure; does not touch localStorage. */
export function importOldRegistry(v1: Building[]): BuildingFile[] {
  return v1.map((building) => {
    const file = emptyBuilding(building.id, building.name);
    file.levels = building.levels.map((level): CoreBuildingLevel => ({ id: level.id, name: level.name, elevationMm: 0 }));
    file.sheets = building.levels.flatMap((level): BuildingSheet[] => {
      if (!level.documentFileName) return [];
      return [
        {
          id: `${level.id}-sheet`,
          levelId: level.id,
          projectUuid: null,
          pageIndex: 0,
          displayName: level.documentFileName,
          location: { fileName: level.documentFileName },
        },
      ];
    });
    return file;
  });
}
