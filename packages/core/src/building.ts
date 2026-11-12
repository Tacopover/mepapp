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
  /** true: the app made projectUuid and the PDF does not hold it yet. Absent once a save wrote the id into the PDF. */
  idMinted?: true;
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

const RISER_FLOWS: readonly unknown[] = ['up', 'down', 'both', 'unknown'];
const RISER_END_KINDS: readonly unknown[] = ['member', 'open', 'capped'];

const validateRisers: Validator = (data) => {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(data.risers)) return issues;
  const levelIds = new Set<string>();
  if (Array.isArray(data.levels)) {
    for (const level of data.levels) if (isRecord(level) && typeof level.id === 'string') levelIds.add(level.id);
  }
  const sheetsById = new Map<string, JsonRecord>();
  if (Array.isArray(data.sheets)) {
    for (const sheet of data.sheets) {
      if (isRecord(sheet) && typeof sheet.id === 'string' && !sheetsById.has(sheet.id)) sheetsById.set(sheet.id, sheet);
    }
  }
  const riserIds = new Set<string>();
  data.risers.forEach((riser: unknown, index) => {
    const path = `risers[${index}]`;
    if (!isRecord(riser)) {
      issues.push({ path, message: 'riser must be an object' });
      return;
    }
    if (!isNonEmptyString(riser.id)) {
      issues.push({ path: `${path}.id`, message: 'riser id must be a non-empty string' });
    } else if (riserIds.has(riser.id)) {
      issues.push({ path: `${path}.id`, message: `duplicate riser id ${riser.id}` });
    } else {
      riserIds.add(riser.id);
    }
    if (typeof riser.name !== 'string') issues.push({ path: `${path}.name`, message: 'riser name must be a string' });
    if (riser.shaftName !== undefined && typeof riser.shaftName !== 'string') {
      issues.push({ path: `${path}.shaftName`, message: 'shaftName must be a string' });
    }
    if (!isNonEmptyString(riser.networkTypeId)) {
      issues.push({ path: `${path}.networkTypeId`, message: 'networkTypeId must be a non-empty string' });
    }
    const networkType = riser.networkType;
    if (!isRecord(networkType) || !isNonEmptyString(networkType.id) || networkType.id !== riser.networkTypeId) {
      issues.push({ path: `${path}.networkType`, message: 'networkType must be an object whose id equals networkTypeId' });
    }
    const anchor: JsonRecord = isRecord(riser.anchorMm) ? riser.anchorMm : {};
    if (typeof anchor.xMm !== 'number' || !Number.isFinite(anchor.xMm)) {
      issues.push({ path: `${path}.anchorMm.xMm`, message: 'anchorMm.xMm must be a finite number' });
    }
    if (typeof anchor.yMm !== 'number' || !Number.isFinite(anchor.yMm)) {
      issues.push({ path: `${path}.anchorMm.yMm`, message: 'anchorMm.yMm must be a finite number' });
    }
    if (!RISER_FLOWS.includes(riser.flow)) issues.push({ path: `${path}.flow`, message: 'flow must be up, down, both or unknown' });
    if (!RISER_END_KINDS.includes(riser.topEnd)) {
      issues.push({ path: `${path}.topEnd`, message: 'topEnd must be member, open or capped' });
    }
    if (!RISER_END_KINDS.includes(riser.bottomEnd)) {
      issues.push({ path: `${path}.bottomEnd`, message: 'bottomEnd must be member, open or capped' });
    }
    if (typeof riser.endAllowanceMm !== 'number' || !Number.isFinite(riser.endAllowanceMm) || riser.endAllowanceMm < 0) {
      issues.push({ path: `${path}.endAllowanceMm`, message: 'endAllowanceMm must be a finite number from 0' });
    }
    const memberLevelIds = new Set<string>();
    const memberSheetIds = new Set<string>();
    if (!Array.isArray(riser.members)) {
      issues.push({ path: `${path}.members`, message: 'members must be an array' });
    } else {
      riser.members.forEach((member: unknown, memberIndex) => {
        const memberPath = `${path}.members[${memberIndex}]`;
        if (!isRecord(member)) {
          issues.push({ path: memberPath, message: 'member must be an object' });
          return;
        }
        if (typeof member.levelId !== 'string' || !levelIds.has(member.levelId)) {
          issues.push({ path: `${memberPath}.levelId`, message: `levelId ${String(member.levelId)} does not name a level` });
        } else if (memberLevelIds.has(member.levelId)) {
          issues.push({ path: `${memberPath}.levelId`, message: `riser has two members on level ${member.levelId}` });
        } else {
          memberLevelIds.add(member.levelId);
        }
        const sheet = typeof member.sheetId === 'string' ? sheetsById.get(member.sheetId) : undefined;
        if (sheet === undefined) {
          issues.push({ path: `${memberPath}.sheetId`, message: `sheetId ${String(member.sheetId)} does not name a sheet` });
        } else {
          if (sheet.levelId !== member.levelId) {
            issues.push({ path: `${memberPath}.levelId`, message: 'member levelId must equal the levelId of its sheet' });
          }
          if (member.pageIndex !== sheet.pageIndex) {
            issues.push({ path: `${memberPath}.pageIndex`, message: 'member pageIndex must equal the pageIndex of its sheet' });
          }
          if (typeof member.sheetId === 'string') memberSheetIds.add(member.sheetId);
        }
        if (!isNonEmptyString(member.fittingId)) {
          issues.push({ path: `${memberPath}.fittingId`, message: 'fittingId must be a non-empty string' });
        }
        if (
          member.connectionHeightMm !== undefined &&
          (typeof member.connectionHeightMm !== 'number' || !Number.isFinite(member.connectionHeightMm) || member.connectionHeightMm < 0)
        ) {
          issues.push({ path: `${memberPath}.connectionHeightMm`, message: 'connectionHeightMm must be a finite number from 0' });
        }
      });
    }
    if (riser.sourceLevelId !== undefined && (typeof riser.sourceLevelId !== 'string' || !memberLevelIds.has(riser.sourceLevelId))) {
      issues.push({ path: `${path}.sourceLevelId`, message: 'sourceLevelId must name a level of a member of this riser' });
    }
    if (!Array.isArray(riser.pending)) {
      issues.push({ path: `${path}.pending`, message: 'pending must be an array' });
    } else {
      let previousSeq: number | undefined;
      riser.pending.forEach((op: unknown, opIndex) => {
        const opPath = `${path}.pending[${opIndex}]`;
        if (!isRecord(op)) {
          issues.push({ path: opPath, message: 'pending operation must be an object' });
          return;
        }
        if (typeof op.seq !== 'number' || !Number.isInteger(op.seq)) {
          issues.push({ path: `${opPath}.seq`, message: 'seq must be a whole number' });
        } else {
          if (previousSeq !== undefined && op.seq <= previousSeq) {
            issues.push({ path: `${opPath}.seq`, message: 'seq must grow along the pending list' });
          }
          previousSeq = op.seq;
        }
        if (typeof op.sheetId !== 'string' || !memberSheetIds.has(op.sheetId)) {
          issues.push({ path: `${opPath}.sheetId`, message: 'sheetId must name a member sheet of this riser' });
        }
        if (op.kind === 'move') {
          const to: JsonRecord = isRecord(op.toMm) ? op.toMm : {};
          if (typeof to.xMm !== 'number' || !Number.isFinite(to.xMm) || typeof to.yMm !== 'number' || !Number.isFinite(to.yMm)) {
            issues.push({ path: `${opPath}.toMm`, message: 'a move needs a finite toMm.xMm and toMm.yMm' });
          }
        } else if (op.kind === 'retag') {
          if (!isNonEmptyString(op.networkTypeId)) {
            issues.push({ path: `${opPath}.networkTypeId`, message: 'a retag needs a non-empty networkTypeId' });
          }
        } else if (op.kind === 'setScale') {
          const scale = op.pageUnitsPerRealUnit;
          if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
            issues.push({ path: `${opPath}.pageUnitsPerRealUnit`, message: 'a setScale needs a positive pageUnitsPerRealUnit' });
          }
        } else {
          issues.push({ path: `${opPath}.kind`, message: 'kind must be move, retag or setScale' });
        }
      });
    }
  });
  return issues;
};

const buildingValidators: Validator[] = [validateTopLevel, validateLevels, validateSheets, validateRisers];

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

export const RISER_MIN_ANCHOR_SPACING_MM = 150;

/** Warnings for the risers of a valid building file (not errors). */
export function riserWarnings(file: BuildingFile): string[] {
  const warnings: string[] = [];
  const risersByLevel = new Map<string, Riser[]>();
  for (const riser of file.risers) {
    if (riser.members.length === 1) warnings.push(`${riser.name} has one level.`);
    const hasFreeEnd = riser.topEnd !== 'member' || riser.bottomEnd !== 'member';
    if (hasFreeEnd && riser.endAllowanceMm === 0) {
      warnings.push(`${riser.name} has an open or capped end and no end allowance.`);
    }
    if (riser.endAllowanceMm > 0 && riser.topEnd === 'member' && riser.bottomEnd === 'member') {
      warnings.push(`${riser.name} has an end allowance but both ends continue on a level.`);
    }
    for (const member of riser.members) {
      const group = risersByLevel.get(member.levelId);
      if (group) {
        if (!group.includes(riser)) group.push(riser);
      } else {
        risersByLevel.set(member.levelId, [riser]);
      }
    }
  }
  const levelNames = new Map(file.levels.map((level) => [level.id, level.name]));
  for (const [levelId, group] of risersByLevel) {
    const levelName = levelNames.get(levelId) ?? levelId;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const distance = Math.hypot(a.anchorMm.xMm - b.anchorMm.xMm, a.anchorMm.yMm - b.anchorMm.yMm);
        if (distance < RISER_MIN_ANCHOR_SPACING_MM) {
          warnings.push(`${a.name} and ${b.name} are closer than ${RISER_MIN_ANCHOR_SPACING_MM} mm on level ${levelName}.`);
        }
      }
    }
  }
  return warnings;
}
