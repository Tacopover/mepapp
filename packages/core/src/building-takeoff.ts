// Takeoff of a building: the saved sheet summaries of the sheets in one scope, merged into one set of tables.
// Pure data, no I/O: the caller reads the summaries and the status of each PDF.

import type { BuildingFile, BuildingSheet } from './building.js';
import { mergeQuantityTables } from './quantities-merge.js';
import type { QuantityCell, QuantityProvenance, QuantityTable } from './quantities.js';
import { inConflict } from './riser-coords.js';
import { deriveRiserFlow, type PerSheetRiserFittingFlow } from './riser-flow.js';
import { buildingNetworkLabels, buildingNetworkRollup, riserSpans, riserTable, riserTakeoffWarnings } from './riser-quantities.js';
import type { Riser, RiserMember } from './riser.js';
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

  const hasRisers = building.risers.length > 0;
  const sheetTables = new Map<string, { sheet: BuildingSheet; summary: SheetSummary; tables: QuantityTable[] }>();
  if (hasRisers) {
    for (const sheet of building.sheets) {
      if (sheet.projectUuid === null) continue;
      const summary = summaryOf(sheet.projectUuid);
      if (summary) sheetTables.set(sheet.id, { sheet, summary, tables: tablesOfPage(summary.tables, sheet.pageIndex + 1) });
    }
  }
  const cellIn = (table: QuantityTable, row: QuantityCell[], header: string): QuantityCell => {
    const column = table.headers.indexOf(header);
    return column < 0 ? null : (row[column] ?? null);
  };
  const fittingRowOf = (sheetId: string, fittingId: string): { table: QuantityTable; row: QuantityCell[] } | undefined => {
    const table = sheetTables.get(sheetId)?.tables.find((candidate) => candidate.name === 'Fittings');
    if (!table) return undefined;
    const row = table.rows.find((candidate) => cellIn(table, candidate, 'Id') === fittingId);
    return row ? { table, row } : undefined;
  };
  const networksOf = (member: RiserMember): string[] => {
    const found = fittingRowOf(member.sheetId, member.fittingId);
    const network = found ? cellIn(found.table, found.row, 'Network') : null;
    return typeof network === 'string' && network !== '' ? [network] : [];
  };
  const labels = buildingNetworkLabels(building, networksOf);
  const sizeOf = (member: RiserMember): string | null => {
    const segments = sheetTables.get(member.sheetId)?.tables.find((table) => table.name === 'Segments');
    if (!segments) return null;
    const sizes: string[] = [];
    for (const row of segments.rows) {
      if (cellIn(segments, row, 'Start fitting') !== member.fittingId && cellIn(segments, row, 'End fitting') !== member.fittingId) continue;
      const diameter = cellIn(segments, row, 'Diameter (mm)');
      const width = cellIn(segments, row, 'Width (mm)');
      const height = cellIn(segments, row, 'Height (mm)');
      const size =
        typeof diameter === 'number' ? String(diameter) : typeof width === 'number' && typeof height === 'number' ? `${width} x ${height}` : null;
      if (size !== null && !sizes.includes(size)) sizes.push(size);
    }
    return sizes.length > 0 ? sizes.join(' / ') : null;
  };
  const perLevelFlow: PerSheetRiserFittingFlow = {};
  for (const { sheet, summary } of sheetTables.values()) perLevelFlow[sheet.id] = summary.riserFittingFlow ?? {};
  const derived = deriveRiserFlow(building, perLevelFlow);
  const buildingNetworkCell = (sheet: BuildingSheet, table: QuantityTable, row: QuantityCell[]): QuantityCell => {
    const network = cellIn(table, row, 'Network');
    return typeof network === 'string' ? (labels.get(`${sheet.id}|${network}`) ?? null) : null;
  };
  const riserNameOf = (sheet: BuildingSheet, fittingId: QuantityCell, page: QuantityCell): string | null =>
    building.risers.find((riser) =>
      riser.members.some((member) => member.sheetId === sheet.id && member.fittingId === fittingId && member.pageIndex + 1 === page),
    )?.name ?? null;
  const withRiserColumns = (sheet: BuildingSheet, tables: QuantityTable[]): QuantityTable[] =>
    tables.map((table) => {
      if (table.name === 'Segments') {
        return {
          name: table.name,
          headers: [...table.headers, 'Building network'],
          rows: table.rows.map((row) => [...row, buildingNetworkCell(sheet, table, row)]),
        };
      }
      if (table.name === 'Fittings') {
        return {
          name: table.name,
          headers: [...table.headers, 'Building network', 'Riser'],
          rows: table.rows.map((row) => [
            ...row,
            buildingNetworkCell(sheet, table, row),
            riserNameOf(sheet, cellIn(table, row, 'Id'), cellIn(table, row, 'Page')),
          ]),
        };
      }
      return table;
    });
  const inConflictOn = (riser: Riser, member: RiserMember): boolean => {
    const found = fittingRowOf(member.sheetId, member.fittingId);
    const page = sheetTables.get(member.sheetId)?.summary.pages[String(member.pageIndex)];
    if (!found || !page) return false;
    const x = cellIn(found.table, found.row, 'X (pt)');
    const y = cellIn(found.table, found.row, 'Y (pt)');
    const ppmm = page.pageUnitsPerRealUnit;
    if (typeof x !== 'number' || typeof y !== 'number' || ppmm === null || !(ppmm > 0) || !(page.heightPt > 0)) return false;
    return inConflict({ x, y }, riser.anchorMm, { heightPt: page.heightPt, ppmm });
  };

  for (const sheet of sheets) {
    const label = sheet.displayName;
    if (sheet.projectUuid === null) {
      warnings.push(`${label}: the document has no id yet. Open it in MepApp and save it.`);
      statuses.push({ sheetId: sheet.id, state: 'no-summary' });
      continue;
    }
    const summary = summaryOf(sheet.projectUuid);
    if (!summary) {
      warnings.push(`${label}: no saved summary. Open the file in MepApp and save it, or use Read summaries now. Left out.`);
      statuses.push({ sheetId: sheet.id, state: 'no-summary' });
      continue;
    }

    const date = summary.savedAt.slice(0, 10);
    const status = statusOf(sheet);
    let state: TakeoffSheetStatus['state'];
    if (status.state === 'missing') {
      state = 'pdf-missing-using-summary';
      warnings.push(`${label}: PDF missing. Using the summary saved ${date}.`);
    } else if (status.state === 'no-access') {
      state = 'pdf-no-access-using-summary';
      warnings.push(`${label}: no access to the PDF. Using the summary saved ${date}. Use Grant access in Manage Buildings.`);
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

    const pageTables = tablesOfPage(summary.tables, pageNumber);
    parts.push({
      provenance: { building: building.name, level: levelName(sheet.levelId), sheet: label, document: sheet.location.fileName },
      tables: hasRisers ? withRiserColumns(sheet, pageTables) : pageTables,
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

  if (hasRisers) {
    const scopedLevelId = scope.kind === 'level' ? scope.levelId : undefined;
    const scopedRisers = building.risers.filter(
      (riser) => scopedLevelId === undefined || riser.members.some((member) => member.levelId === scopedLevelId),
    );
    const riserRows = riserTable(building, sizeOf, { derived, ...(scope.kind === 'level' ? { levelId: scope.levelId } : {}) });
    if (riserRows.rows.length > 0) tables.push(riserRows);
    const spans = building.risers
      .flatMap((riser) => riserSpans(building, riser).spans)
      .filter((span) => scopedLevelId === undefined || span.fromLevelId === scopedLevelId || span.toLevelId === scopedLevelId);
    const segmentRows = tables.find((table) => table.name === 'Segments') ?? { name: 'Segments', headers: [], rows: [] };
    const rollup = buildingNetworkRollup({ segmentRows, spans });
    if (spans.length > 0 && rollup.rows.length > 0) tables.push(rollup);
    for (const riser of scopedRisers) {
      const flagged = new Set<string>();
      for (const member of riser.members) {
        const sheet = sheets.find((candidate) => candidate.id === member.sheetId);
        if (!sheet || flagged.has(sheet.id)) continue;
        if (riser.pending.some((op) => op.sheetId === member.sheetId) || inConflictOn(riser, member)) {
          flagged.add(sheet.id);
          warnings.push(`${sheet.displayName}: pending change for riser ${riser.name}`);
        }
      }
    }
    warnings.push(...riserTakeoffWarnings({ ...building, risers: scopedRisers }));
  }

  return { tables, warnings, sheets: statuses };
}
