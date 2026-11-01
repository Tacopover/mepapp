import { migrateToLatest, SchemaMigrationError, validateDocument } from './schema.js';
import type { JsonRecord, MigrationStep, ValidationIssue, Validator } from './schema.js';
import type { Riser } from './riser.js';

export const BUILDING_SCHEMA_VERSION = 1;

export interface BuildingLevel {
  id: string;
  name: string;
  /** Height of the finished floor above a common datum, in mm. Negative is allowed (a basement). */
  elevationMm: number;
}

export interface SheetLocation {
  fileName: string;
  /** Desktop: absolute path. Web: absent (the handle is in the browser store). */
  path?: string;
  /** Path relative to the folder of the building file. A hint when the whole folder moves. */
  relativePath?: string;
  /** Size at the last save, a weak check for "the file changed". */
  sizeBytes?: number;
}

export interface BuildingSheet {
  id: string;
  levelId: string;
  /** null until the document has been saved by MepApp with an id. */
  projectUuid: string | null;
  pageIndex: number;
  displayName: string;
  location: SheetLocation;
}

export interface BuildingFile {
  schemaVersion: number;
  id: string;
  name: string;
  /** Order = display order. */
  levels: BuildingLevel[];
  sheets: BuildingSheet[];
  risers: Riser[];
}

export class BuildingFileError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[],
  ) {
    super(message);
  }
}

export function emptyBuilding(id: string, name: string): BuildingFile {
  return { schemaVersion: BUILDING_SCHEMA_VERSION, id, name, levels: [], sheets: [], risers: [] };
}

export function serializeBuildingFile(file: BuildingFile): string {
  return JSON.stringify({ ...file, schemaVersion: BUILDING_SCHEMA_VERSION }, null, 2);
}

const buildingMigrationSteps: MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate(data) {
      return { ...data, schemaVersion: 1 };
    },
  },
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const validateTopLevel: Validator = (data) => {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(data.id)) issues.push({ path: 'id', message: 'building id must be a non-empty string' });
  if (typeof data.name !== 'string') issues.push({ path: 'name', message: 'building name must be a string' });
  for (const key of ['levels', 'sheets', 'risers']) {
    if (!Array.isArray(data[key])) issues.push({ path: key, message: `${key} must be an array` });
  }
  return issues;
};

const validateLevels: Validator = (data) => {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(data.levels)) return issues;
  const seen = new Set<string>();
  data.levels.forEach((level: unknown, index) => {
    const path = `levels[${index}]`;
    if (!isRecord(level)) {
      issues.push({ path, message: 'level must be an object' });
      return;
    }
    if (!isNonEmptyString(level.id)) {
      issues.push({ path: `${path}.id`, message: 'level id must be a non-empty string' });
    } else if (seen.has(level.id)) {
      issues.push({ path: `${path}.id`, message: `duplicate level id ${level.id}` });
    } else {
      seen.add(level.id);
    }
    if (typeof level.name !== 'string') issues.push({ path: `${path}.name`, message: 'level name must be a string' });
    if (typeof level.elevationMm !== 'number' || !Number.isFinite(level.elevationMm)) {
      issues.push({ path: `${path}.elevationMm`, message: 'elevationMm must be a finite number' });
    }
  });
  return issues;
};

const validateSheets: Validator = (data) => {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(data.sheets)) return issues;
  const levelIds = new Set<string>();
  if (Array.isArray(data.levels)) {
    for (const level of data.levels) if (isRecord(level) && typeof level.id === 'string') levelIds.add(level.id);
  }
  const sheetIds = new Set<string>();
  const keys = new Set<string>();
  data.sheets.forEach((sheet: unknown, index) => {
    const path = `sheets[${index}]`;
    if (!isRecord(sheet)) {
      issues.push({ path, message: 'sheet must be an object' });
      return;
    }
    if (!isNonEmptyString(sheet.id)) {
      issues.push({ path: `${path}.id`, message: 'sheet id must be a non-empty string' });
    } else if (sheetIds.has(sheet.id)) {
      issues.push({ path: `${path}.id`, message: `duplicate sheet id ${sheet.id}` });
    } else {
      sheetIds.add(sheet.id);
    }
    if (typeof sheet.levelId !== 'string' || !levelIds.has(sheet.levelId)) {
      issues.push({ path: `${path}.levelId`, message: `levelId ${String(sheet.levelId)} does not name a level` });
    }
    if (sheet.projectUuid !== null && !isNonEmptyString(sheet.projectUuid)) {
      issues.push({ path: `${path}.projectUuid`, message: 'projectUuid must be a string or null' });
    }
    const pageOk = typeof sheet.pageIndex === 'number' && Number.isInteger(sheet.pageIndex) && sheet.pageIndex >= 0;
    if (!pageOk) issues.push({ path: `${path}.pageIndex`, message: 'pageIndex must be a whole number from 0' });
    if (typeof sheet.displayName !== 'string') {
      issues.push({ path: `${path}.displayName`, message: 'displayName must be a string' });
    }
    const location = sheet.location;
    if (!isRecord(location) || typeof location.fileName !== 'string') {
      issues.push({ path: `${path}.location`, message: 'location must be an object with a fileName' });
    } else if (pageOk) {
      const owner = typeof sheet.projectUuid === 'string' ? `u:${sheet.projectUuid}` : typeof location.path === 'string' ? `p:${location.path}` : null;
      if (owner !== null) {
        const key = `${owner}#${String(sheet.pageIndex)}`;
        if (keys.has(key)) {
          issues.push({ path: path, message: `a second sheet names the same document page (page ${String(sheet.pageIndex)})` });
        }
        keys.add(key);
      }
    }
  });
  return issues;
};

const buildingValidators: Validator[] = [validateTopLevel, validateLevels, validateSheets];

/** Migrates raw JSON (any prior schema version) to the current shape and validates it. Throws BuildingFileError if the file is malformed or newer than this app. Fields that this app does not know stay in the result. */
export function parseBuildingFile(raw: unknown): BuildingFile {
  if (!isRecord(raw)) throw new BuildingFileError('building file is not an object', [{ path: '', message: 'building file must be a JSON object' }]);
  let migrated: JsonRecord;
  try {
    migrated = migrateToLatest(raw, { steps: buildingMigrationSteps, latestVersion: BUILDING_SCHEMA_VERSION });
  } catch (error) {
    if (error instanceof SchemaMigrationError) {
      throw new BuildingFileError(error.message, [{ path: 'schemaVersion', message: error.message }]);
    }
    throw error;
  }
  const issues = validateDocument(migrated, buildingValidators);
  if (issues.length > 0) throw new BuildingFileError('building file failed validation', issues);
  return migrated as unknown as BuildingFile;
}

/** Warnings for a valid building file (not errors): two levels with the same elevation. */
export function levelWarnings(file: BuildingFile): string[] {
  const byElevation = new Map<number, BuildingLevel[]>();
  for (const level of file.levels) {
    const group = byElevation.get(level.elevationMm);
    if (group) group.push(level);
    else byElevation.set(level.elevationMm, [level]);
  }
  const warnings: string[] = [];
  for (const [elevationMm, group] of byElevation) {
    if (group.length > 1) {
      warnings.push(`Levels ${group.map((level) => level.name).join(', ')} have the same elevation (${elevationMm} mm).`);
    }
  }
  return warnings;
}
