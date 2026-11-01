import {
  buildBuildingTakeoff,
  parseSheetSummary,
  type BuildingFile,
  type BuildingSheet,
  type QuantityResult,
  type QuantityTable,
  type SheetSummary,
} from '@mepapp/core';

export type ExportScope =
  | { kind: 'sheet' }
  | { kind: 'document' }
  | { kind: 'level'; levelId: string }
  | { kind: 'building' };

export interface SheetStat {
  state: 'ok' | 'missing' | 'no-access';
  sizeBytes?: number;
  modifiedMs?: number;
}

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|]/g;

const safeFilePart = (text: string): string => text.replace(UNSAFE_FILE_CHARS, '-');

/** document/sheet: `<document name without .pdf, or 'quantities'>-quantities.xlsx` (as today). building: `<building name>-all-quantities.xlsx`. level: `<building name>-<level name>-quantities.xlsx` (level name 'level' when the id is unknown). Characters \ / : * ? " < > | become '-'. */
export function scopeFileName(args: { documentName: string | undefined; scope: ExportScope; building: BuildingFile | undefined }): string {
  const { documentName, scope, building } = args;
  if (scope.kind === 'building') {
    return safeFilePart(`${building?.name ?? 'building'}-all-quantities.xlsx`);
  }
  if (scope.kind === 'level') {
    const levelName = building?.levels.find((level) => level.id === scope.levelId)?.name ?? 'level';
    return safeFilePart(`${building?.name ?? 'building'}-${levelName}-quantities.xlsx`);
  }
  return safeFilePart(`${(documentName ?? 'quantities').replace(/\.pdf$/i, '')}-quantities.xlsx`);
}

export function withWarningsSheet(tables: QuantityTable[], warnings: string[]): QuantityTable[] {
  return warnings.length > 0 ? [...tables, { name: 'Warnings', headers: ['Warning'], rows: warnings.map((w) => [w]) }] : tables;
}

/** One stat per sheet id. No statPath, or no sheet.location.path -> { state: 'no-access' }. A throw from statPath -> 'no-access'. */
export async function statSheets(
  sheets: readonly BuildingSheet[],
  statPath: ((path: string) => Promise<SheetStat>) | undefined,
): Promise<Map<string, SheetStat>> {
  const stats = new Map<string, SheetStat>();
  for (const sheet of sheets) {
    const path = sheet.location.path;
    if (!statPath || !path) {
      stats.set(sheet.id, { state: 'no-access' });
      continue;
    }
    try {
      stats.set(sheet.id, await statPath(path));
    } catch {
      stats.set(sheet.id, { state: 'no-access' });
    }
  }
  return stats;
}

/** Reads and parses every stored summary. A summary that fails to parse goes to `problems` (key = projectUuid, value = error message) and is not in `summaries`. */
export async function readSummaries(
  store: { listSummaries(): Promise<string[]>; readSummary(projectUuid: string): Promise<string | undefined> },
): Promise<{ summaries: Map<string, SheetSummary>; problems: Map<string, string> }> {
  const summaries = new Map<string, SheetSummary>();
  const problems = new Map<string, string>();
  for (const projectUuid of await store.listSummaries()) {
    const raw = await store.readSummary(projectUuid);
    if (raw === undefined) continue;
    try {
      summaries.set(projectUuid, parseSheetSummary(JSON.parse(raw)));
    } catch (error) {
      problems.set(projectUuid, error instanceof Error ? error.message : String(error));
    }
  }
  return { summaries, problems };
}

/** Level or Building takeoff. `live` is a fresh summary of the open document: it replaces the stored one for that projectUuid, and that sheet counts as state 'ok' (no stale check). A sheet with no stat entry is 'no-access'. After the takeoff warnings, for each sheet in scope whose projectUuid is in `problems` add `<displayName>: the saved summary cannot be read (<message>). Left out.` */
export function buildBuildingScopeTables(args: {
  building: BuildingFile;
  scope: { kind: 'level'; levelId: string } | { kind: 'building' };
  summaries: ReadonlyMap<string, SheetSummary>;
  problems: ReadonlyMap<string, string>;
  stats: ReadonlyMap<string, SheetStat>;
  live?: SheetSummary;
}): QuantityResult {
  const { building, scope, summaries, problems, stats, live } = args;
  const summaryOf = (projectUuid: string): SheetSummary | undefined => (live && live.projectUuid === projectUuid ? live : summaries.get(projectUuid));
  const statusOf = (sheet: BuildingSheet): SheetStat => {
    if (live && sheet.projectUuid === live.projectUuid) return { state: 'ok' };
    return stats.get(sheet.id) ?? { state: 'no-access' };
  };
  const isUnreadable = (sheet: BuildingSheet): boolean =>
    (scope.kind === 'building' || sheet.levelId === scope.levelId) &&
    sheet.projectUuid !== null &&
    live?.projectUuid !== sheet.projectUuid &&
    problems.has(sheet.projectUuid);

  const result = buildBuildingTakeoff({ building, scope, summaryOf, statusOf });
  const warnings = result.warnings.filter((warning) => !building.sheets.some((sheet) => isUnreadable(sheet) && warning.startsWith(`${sheet.displayName}: no saved summary.`)));
  for (const sheet of building.sheets) {
    if (scope.kind === 'level' && sheet.levelId !== scope.levelId) continue;
    if (sheet.projectUuid === null || live?.projectUuid === sheet.projectUuid) continue;
    const message = problems.get(sheet.projectUuid);
    if (message !== undefined) warnings.push(`${sheet.displayName}: the saved summary cannot be read (${message}). Left out.`);
  }
  return { tables: result.tables, warnings };
}
