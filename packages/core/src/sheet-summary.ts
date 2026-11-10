import { riserFittingFlow, type RiserFittingFlow } from './flow.js';
import { computeNetworks } from './network.js';
import { buildQuantityTables, type QuantityTable } from './quantities.js';
import type { ProjectDocument } from './project.js';
import { migrateToLatest, SchemaMigrationError, validateDocument } from './schema.js';
import type { JsonRecord, MigrationStep, ValidationIssue, Validator } from './schema.js';
import type { StampCategory } from './stamp-library.js';

export const SHEET_SUMMARY_VERSION = 2;

export interface SheetSummaryPage {
  calibrated: boolean;
  pageUnitsPerRealUnit: number | null;
  widthPt: number;
  heightPt: number;
  rotationDegrees: number;
}

export interface SheetSummary {
  version: number;
  projectUuid: string;
  /** ISO time of the save that wrote this summary. */
  savedAt: string;
  sourceSizeBytes: number;
  sourceModifiedMs: number;
  /** Key = page index as text. Width and height are the DISPLAYED size after the page's own /Rotate. */
  pages: Record<string, SheetSummaryPage>;
  tables: QuantityTable[];
  warnings: string[];
  /** Flow at each riser fitting of this sheet that exists in the project, merged over all networks: fitting id -> 'out' | 'in' | 'none'. Absent when no riser fitting ids were given, and in a v1 summary (unknown). */
  riserFittingFlow?: Record<string, RiserFittingFlow>;
}

export class SheetSummaryError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[],
  ) {
    super(message);
  }
}

function riserFittingFlowOf(project: ProjectDocument, riserIds: ReadonlySet<string>): Record<string, RiserFittingFlow> {
  const segmentById = new Map(project.segments.map((segment) => [segment.id, segment]));
  const flow = new Map<string, RiserFittingFlow>(
    project.fittings.filter((fitting) => riserIds.has(fitting.id)).map((fitting): [string, RiserFittingFlow] => [fitting.id, 'none']),
  );
  const networks = computeNetworks({ segments: project.segments, fittings: project.fittings, portGroups: project.portGroups });
  for (const network of networks) {
    if (!network.fittingIds.some((id) => riserIds.has(id))) continue;
    const elementIds = new Set<string>();
    for (const segmentId of network.segmentIds) {
      const segment = segmentById.get(segmentId);
      for (const endpoint of [segment?.endpointA, segment?.endpointB]) {
        if (endpoint?.kind === 'port') elementIds.add(endpoint.elementId);
      }
    }
    const elementCategories: Record<string, StampCategory> = {};
    for (const stamp of project.stamps) {
      if (elementIds.has(stamp.id)) elementCategories[stamp.id] = stamp.category;
    }
    const result = riserFittingFlow({
      network,
      segments: project.segments,
      fittings: project.fittings,
      portGroups: project.portGroups,
      terminalCapacities: project.terminalCapacities,
      elementCategories,
      riserFittingIds: riserIds,
    });
    for (const [id, value] of Object.entries(result)) {
      if (value !== 'none') flow.set(id, value);
    }
  }
  return Object.fromEntries([...flow.keys()].sort().map((id) => [id, flow.get(id)!]));
}

export function buildSheetSummary(args: {
  project: ProjectDocument;
  savedAt: string;
  sourceSizeBytes: number;
  sourceModifiedMs: number;
  /** Page sizes as displayed (post-rotation), index = 0-based page. Same shape as PageInfo of @mepapp/pdf-engine. */
  pageInfos: readonly { widthPt: number; heightPt: number; rotationDegrees: number }[];
  stampTypeName: (id: string) => string | null;
  stampImageName: (id: string) => string | null;
  /** Ids of the riser fittings on this sheet. */
  riserFittingIds?: readonly string[];
}): SheetSummary {
  const { project } = args;
  const projectUuid = project.projectUuid;
  if (projectUuid === undefined) {
    throw new SheetSummaryError('project has no projectUuid', [{ path: 'projectUuid', message: 'the project needs a projectUuid for a sheet summary' }]);
  }
  const riserIds = new Set(args.riserFittingIds ?? []);

  const calibrationOf = (pageIndex: number) => project.calibrations[String(pageIndex)] ?? null;
  const quantities = buildQuantityTables({
    segments: project.segments,
    fittings: project.fittings,
    portGroups: project.portGroups,
    stamps: project.stamps,
    networkTypes: project.networkTypes,
    circuits: project.circuits,
    panels: project.panels,
    capacities: project.terminalCapacities,
    calibrationOf,
    stampTypeName: args.stampTypeName,
    stampImageName: args.stampImageName,
  });

  const pages: Record<string, SheetSummaryPage> = {};
  args.pageInfos.forEach((info, pageIndex) => {
    const calibration = calibrationOf(pageIndex);
    pages[String(pageIndex)] = {
      calibrated: calibration !== null,
      pageUnitsPerRealUnit: calibration?.pageUnitsPerRealUnit ?? null,
      widthPt: info.widthPt,
      heightPt: info.heightPt,
      rotationDegrees: info.rotationDegrees,
    };
  });
  for (const [key, calibration] of Object.entries(project.calibrations)) {
    if (key in pages) continue;
    pages[key] = { calibrated: true, pageUnitsPerRealUnit: calibration.pageUnitsPerRealUnit, widthPt: 0, heightPt: 0, rotationDegrees: 0 };
  }

  return {
    version: SHEET_SUMMARY_VERSION,
    projectUuid,
    savedAt: args.savedAt,
    sourceSizeBytes: args.sourceSizeBytes,
    sourceModifiedMs: args.sourceModifiedMs,
    pages,
    tables: quantities.tables,
    warnings: quantities.warnings,
    ...(riserIds.size > 0 ? { riserFittingFlow: riserFittingFlowOf(project, riserIds) } : {}),
  };
}

const sheetSummaryMigrationSteps: MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate(data) {
      return { ...data, version: 1 };
    },
  },
  {
    fromVersion: 1,
    toVersion: 2,
    migrate(data) {
      return { ...data, version: 2 };
    },
  },
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const validateTopLevel: Validator = (data) => {
  const issues: ValidationIssue[] = [];
  if (typeof data.projectUuid !== 'string' || data.projectUuid.length === 0) {
    issues.push({ path: 'projectUuid', message: 'projectUuid must be a non-empty string' });
  }
  if (typeof data.savedAt !== 'string') issues.push({ path: 'savedAt', message: 'savedAt must be a string' });
  if (!isFiniteNumber(data.sourceSizeBytes)) issues.push({ path: 'sourceSizeBytes', message: 'sourceSizeBytes must be a finite number' });
  if (!isFiniteNumber(data.sourceModifiedMs)) issues.push({ path: 'sourceModifiedMs', message: 'sourceModifiedMs must be a finite number' });
  if (!Array.isArray(data.warnings) || !data.warnings.every((w) => typeof w === 'string')) {
    issues.push({ path: 'warnings', message: 'warnings must be an array of strings' });
  }
  return issues;
};

const validatePages: Validator = (data) => {
  const pages = data.pages;
  if (!isRecord(pages)) return [{ path: 'pages', message: 'pages must be an object' }];
  const issues: ValidationIssue[] = [];
  for (const [key, page] of Object.entries(pages)) {
    const path = `pages.${key}`;
    if (!isRecord(page)) {
      issues.push({ path, message: 'page must be an object' });
      continue;
    }
    if (typeof page.calibrated !== 'boolean') issues.push({ path: `${path}.calibrated`, message: 'calibrated must be a boolean' });
    if (page.pageUnitsPerRealUnit !== null && !isFiniteNumber(page.pageUnitsPerRealUnit)) {
      issues.push({ path: `${path}.pageUnitsPerRealUnit`, message: 'pageUnitsPerRealUnit must be a finite number or null' });
    }
    for (const field of ['widthPt', 'heightPt', 'rotationDegrees']) {
      if (!isFiniteNumber(page[field])) issues.push({ path: `${path}.${field}`, message: `${field} must be a finite number` });
    }
  }
  return issues;
};

const validateTables: Validator = (data) => {
  const tables = data.tables;
  if (!Array.isArray(tables)) return [{ path: 'tables', message: 'tables must be an array' }];
  const issues: ValidationIssue[] = [];
  tables.forEach((table: unknown, index) => {
    const path = `tables[${index}]`;
    if (!isRecord(table)) {
      issues.push({ path, message: 'table must be an object' });
      return;
    }
    if (typeof table.name !== 'string') issues.push({ path: `${path}.name`, message: 'table name must be a string' });
    if (!Array.isArray(table.headers) || !table.headers.every((h) => typeof h === 'string')) {
      issues.push({ path: `${path}.headers`, message: 'headers must be an array of strings' });
    }
    if (!Array.isArray(table.rows) || !table.rows.every((row) => Array.isArray(row))) {
      issues.push({ path: `${path}.rows`, message: 'rows must be an array of arrays' });
    }
  });
  return issues;
};

const validateRiserFlow: Validator = (data) => {
  if (data.riserFittingFlow === undefined) return [];
  if (!isRecord(data.riserFittingFlow)) return [{ path: 'riserFittingFlow', message: 'riserFittingFlow must be an object' }];
  const issues: ValidationIssue[] = [];
  for (const [id, flow] of Object.entries(data.riserFittingFlow)) {
    if (flow !== 'out' && flow !== 'in' && flow !== 'none') {
      issues.push({ path: `riserFittingFlow.${id}`, message: "riserFittingFlow values must be 'out', 'in' or 'none'" });
    }
  }
  return issues;
};

const sheetSummaryValidators: Validator[] = [validateTopLevel, validatePages, validateTables, validateRiserFlow];

/** Migrates raw JSON (any prior summary version) to the current shape and validates it. Throws SheetSummaryError if the summary is malformed or newer than this app. */
export function parseSheetSummary(raw: unknown): SheetSummary {
  if (!isRecord(raw)) throw new SheetSummaryError('sheet summary is not an object', [{ path: '', message: 'sheet summary must be a JSON object' }]);
  let migrated: JsonRecord;
  try {
    migrated = migrateToLatest(raw, { steps: sheetSummaryMigrationSteps, latestVersion: SHEET_SUMMARY_VERSION, versionField: 'version' });
  } catch (error) {
    if (error instanceof SchemaMigrationError) {
      throw new SheetSummaryError(error.message, [{ path: 'version', message: error.message }]);
    }
    throw error;
  }
  const issues = validateDocument(migrated, sheetSummaryValidators);
  if (issues.length > 0) throw new SheetSummaryError('sheet summary failed validation', issues);
  return migrated as unknown as SheetSummary;
}
