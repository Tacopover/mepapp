// Takeoff of a building: the saved sheet summaries of the sheets in one scope, merged into one set of tables.
// Pure data, no I/O: the caller reads the summaries and the status of each PDF.

import type { BuildingFile, BuildingSheet } from './building.js';
import { mergeQuantityTables } from './quantities-merge.js';
import type { QuantityCell, QuantityProvenance, QuantityTable } from './quantities.js';
import type { SheetSummary } from './sheet-summary.js';

export type TakeoffScope = { kind: 'building' } | { kind: 'level'; levelId: string };

export interface TakeoffSheetStatus {
  sheetId: string;
  state: 'ok' | 'no-summary' | 'old-summary' | 'pdf-missing-using-summary' | 'pdf-no-access-using-summary' | 'unreadable';
}

const tablesOfPage = (tables: readonly QuantityTable[], pageNumber: number): QuantityTable[] => {
  const result: QuantityTable[] = [];
  for (const table of tables) {
    const column = table.headers.indexOf('Page');
    if (column < 0) continue;
    const rows = table.rows.filter((row) => row[column] === pageNumber);
    if (rows.length > 0) result.push({ name: table.name, headers: table.headers, rows });
  }
  return result;
};

export function buildBuildingTakeoff(args: {
  building: BuildingFile;
  scope: TakeoffScope;
  summaryOf: (projectUuid: string) => SheetSummary | undefined;
  statusOf: (sheet: BuildingSheet) => { state: 'ok' | 'missing' | 'no-access'; sizeBytes?: number; modifiedMs?: number };
}): { tables: QuantityTable[]; warnings: string[]; sheets: TakeoffSheetStatus[] } {
  const { building, scope, summaryOf, statusOf } = args;
  const levelIndex = (levelId: string): number => {
    const index = building.levels.findIndex((level) => level.id === levelId);
    return index < 0 ? building.levels.length : index;
  };
  const levelName = (levelId: string): string => building.levels.find((level) => level.id === levelId)?.name ?? '';
  const levelRankOfName = (name: string): number => {
    const index = building.levels.findIndex((level) => level.name === name);
    return index < 0 ? building.levels.length : index;
  };

  const sheets = building.sheets
    .map((sheet, index) => ({ sheet, index }))
    .filter(({ sheet }) => scope.kind === 'building' || sheet.levelId === scope.levelId)
    .sort((a, b) => levelIndex(a.sheet.levelId) - levelIndex(b.sheet.levelId) || a.index - b.index)
    .map(({ sheet }) => sheet);

  const warnings: string[] = [];
  const statuses: TakeoffSheetStatus[] = [];
  const parts: { provenance: QuantityProvenance; tables: QuantityTable[] }[] = [];

  for (const sheet of sheets) {
    const label = sheet.displayName;
    if (sheet.projectUuid === null) {
      warnings.push(`${label}: the document has no id yet. Open it in MepApp and save it.`);
      statuses.push({ sheetId: sheet.id, state: 'no-summary' });
      continue;
    }
    const summary = summaryOf(sheet.projectUuid);
    if (!summary) {
      warnings.push(`${label}: no saved summary. Open the file in MepApp and save it, or use Rebuild summaries. Left out.`);
      statuses.push({ sheetId: sheet.id, state: 'no-summary' });
      continue;
    }

    const date = summary.savedAt.slice(0, 10);
    const status = statusOf(sheet);
    let state: TakeoffSheetStatus['state'];
    if (status.state === 'missing') {
      state = 'pdf-missing-using-summary';
      warnings.push(`${label}: PDF not found. Using the summary saved ${date}.`);
    } else if (status.state === 'no-access') {
      state = 'pdf-no-access-using-summary';
      warnings.push(`${label}: MepApp may not read the PDF (no access). Using the summary saved ${date}. Use Grant access in Manage Buildings.`);
    } else if (
      (typeof status.sizeBytes === 'number' && status.sizeBytes !== summary.sourceSizeBytes) ||
      (typeof status.modifiedMs === 'number' && status.modifiedMs > summary.sourceModifiedMs)
    ) {
      state = 'old-summary';
      warnings.push(`${label}: the PDF changed after the summary was saved (${date}). The rows may be old.`);
    } else {
      state = 'ok';
    }
    statuses.push({ sheetId: sheet.id, state });

    const pageNumber = sheet.pageIndex + 1;
    for (const warning of summary.warnings) {
      const page = /^Page (\d+) /.exec(warning);
      if (page && Number(page[1]) !== pageNumber) continue;
      warnings.push(`${label}: ${warning}`);
    }

    parts.push({
      provenance: { building: building.name, level: levelName(sheet.levelId), sheet: label, document: sheet.location.fileName },
      tables: tablesOfPage(summary.tables, pageNumber),
    });
  }

  const tables = mergeQuantityTables(parts);

  const terminals = tables.find((table) => table.name === 'Terminals');
  if (terminals) {
    const circuitColumn = terminals.headers.indexOf('Circuit');
    const documentColumn = terminals.headers.indexOf('Document');
    const levelColumn = terminals.headers.indexOf('Level');
    if (circuitColumn >= 0 && documentColumn >= 0 && levelColumn >= 0) {
      const groups = new Map<string, { circuit: string; levels: Set<string> }>();
      for (const row of terminals.rows) {
        const circuit: QuantityCell = row[circuitColumn] ?? null;
        if (typeof circuit !== 'string') continue;
        const key = JSON.stringify([row[documentColumn], circuit]);
        const group = groups.get(key) ?? { circuit, levels: new Set<string>() };
        group.levels.add(String(row[levelColumn]));
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        if (group.levels.size < 2) continue;
        const names = [...group.levels].sort((a, b) => levelRankOfName(a) - levelRankOfName(b));
        warnings.push(`Circuit ${group.circuit} has terminals on levels ${names.join(', ')}. No vertical cable length is counted.`);
      }
    }
  }

  return { tables, warnings, sheets: statuses };
}
