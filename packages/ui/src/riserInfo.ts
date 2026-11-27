import { deriveRiserFlow, flowSenseOf, type BuildingFile, type BuildingFlowResult, type BuildingSheet, type DerivedRiserFlow, type PerSheetRiserFittingFlow, type Riser, type RiserEndKind, type RiserSpanArrow, type SheetSummary } from '@mepapp/core';
import { capacityViewOf } from './riserCapacity.js';
import type { DotStatus } from './riserDiagram.js';

export type RowStatus = DotStatus | 'gone';

export interface RiserLevelRow {
  sheetId: string;
  /** The sheet of the member; null when the sheet is not in file.sheets. */
  sheet: BuildingSheet | null;
  levelId: string;
  /** The level name; 'Deleted level' when the level is not in file.levels. */
  levelName: string;
  status: RowStatus;
  /** '✓ OK' | '◔ Waiting' | '⚠ Not at position' | 'Level is gone' */
  statusText: string;
  connectionHeightMm: number | undefined;
  /** true when the member has a hand-set arrows pair (member.arrows !== undefined). */
  arrowsByHand: boolean;
}

const STATUS_TEXT: Record<RowStatus, string> = {
  ok: '✓ OK',
  waiting: '◔ Waiting',
  off: '⚠ Not at position',
  gone: 'Level is gone',
};

const DIR_WORD: Record<'up' | 'down' | 'both', string> = {
  up: 'Up',
  down: 'Down',
  both: 'Both',
};

/** One row for each member. Members on known levels first, highest elevation first (equal elevation: file order of the members); members on unknown levels last (status 'gone'). Status: 'gone' when the level is unknown; else 'off' when conflictKeys has `${riser.id}|${member.sheetId}`; else 'waiting' when riser.pending has an op with that sheetId; else 'ok'. */
export function riserRows(file: BuildingFile, riser: Riser, conflictKeys: ReadonlySet<string>): RiserLevelRow[] {
  const levelById = new Map(file.levels.map((level) => [level.id, level]));
  const elevationOf = (levelId: string): number => levelById.get(levelId)!.elevationMm;
  const known = riser.members
    .filter((member) => levelById.has(member.levelId))
    .sort((a, b) => elevationOf(b.levelId) - elevationOf(a.levelId));
  const gone = riser.members.filter((member) => !levelById.has(member.levelId));
  return [...known, ...gone].map((member) => {
    const level = levelById.get(member.levelId);
    let status: RowStatus;
    if (level === undefined) status = 'gone';
    else if (conflictKeys.has(`${riser.id}|${member.sheetId}`)) status = 'off';
    else if (riser.pending.some((op) => op.sheetId === member.sheetId)) status = 'waiting';
    else status = 'ok';
    return {
      sheetId: member.sheetId,
      sheet: file.sheets.find((sheet) => sheet.id === member.sheetId) ?? null,
      levelId: member.levelId,
      levelName: level?.name ?? 'Deleted level',
      status,
      statusText: STATUS_TEXT[status],
      connectionHeightMm: member.connectionHeightMm,
      arrowsByHand: member.arrows !== undefined,
    };
  });
}

/** `<lowest level> to <highest level> · <N> levels · <X.XX> m`. N counts the members on known levels. X = (highest elevation - lowest elevation) / 1000 with 2 decimals (floor to floor, no allowance, no connection height). One known level: `<level> · 1 level · Length unknown`. Two members on known levels with equal elevation: X is 0.00 (the text is still `A to B · 2 levels · 0.00 m`). No member on a known level: `No level left`. The separator is ' · ' (space, U+00B7, space). */
export function riserLineText(file: BuildingFile, riser: Riser): string {
  const levelById = new Map(file.levels.map((level) => [level.id, level]));
  const known = riser.members
    .filter((member) => levelById.has(member.levelId))
    .map((member) => levelById.get(member.levelId)!)
    .sort((a, b) => a.elevationMm - b.elevationMm);
  if (known.length === 0) return 'No level left';
  if (known.length === 1) return `${known[0].name} · 1 level · Length unknown`;
  const lowest = known[0];
  const highest = known[known.length - 1];
  const lengthM = ((highest.elevationMm - lowest.elevationMm) / 1000).toFixed(2);
  return `${lowest.name} to ${highest.name} · ${known.length} levels · ${lengthM} m`;
}

export interface RiserFlowText {
  /** Line 1 of the box. */
  text: string;
  /** True when the file holds a hand-set direction or source level (unchanged rule: riser.flow !== 'unknown' || riser.sourceLevelId !== undefined). */
  byHand: boolean;
  /** Grey lines under the text, in this order, each only when it applies. */
  notes: string[];
}

function mainLevelOf(file: BuildingFile, riser: Riser, flow: BuildingFlowResult): { id: string; name: string } | undefined {
  const group = flow.groups.find((item) => item.riserIds.includes(riser.id));
  const levelId = group?.sourceLevelId;
  if (levelId === undefined) return undefined;
  const level = file.levels.find((item) => item.id === levelId);
  return level === undefined ? undefined : { id: level.id, name: level.name };
}

function lineOneOf(file: BuildingFile, riser: Riser, flow: BuildingFlowResult | null, directions: readonly RiserSpanArrow[]): string {
  if (flow === null) return 'Reading the saved summaries…';
  const view = capacityViewOf(file, riser, flow);
  if (view.kind === 'one-member') return 'No arrows. This riser has one level.';
  const main = mainLevelOf(file, riser, flow);
  if (main !== undefined && directions.some((span) => span.direction !== 'unknown')) {
    const word = flowSenseOf(riser.networkType) === 'return' ? 'Toward' : 'Away from';
    const origin = riser.sourceLevelId !== undefined && riser.sourceLevelId === main.id ? 'Set by hand' : 'from the flow solve';
    return `${word} ${main.name} · ${origin}`;
  }
  if (main !== undefined && directions.every((span) => span.direction === 'unknown')) {
    return 'No arrows. The levels of this riser have the same height.';
  }
  const atMost = flow.groups.find((item) => item.riserIds.includes(riser.id))?.atMost === true;
  return `No arrows yet: ${atMost ? 'no source level' : (view.unknownReasonText ?? 'no source level')}.`;
}

/** Line 1 and the grey notes of the box "Flow direction". Line 1 is built by lineOneOf. */
export function riserFlowText(file: BuildingFile, riser: Riser, flow: BuildingFlowResult | null, directions: readonly RiserSpanArrow[]): RiserFlowText {
  const byHand = riser.flow !== 'unknown' || riser.sourceLevelId !== undefined;
  const notes: string[] = [];
  if (riser.flow !== 'unknown') notes.push(`Direction set by hand: ${DIR_WORD[riser.flow]}. The arrows do not use it.`);
  if (riser.members.some((member) => member.arrows !== undefined)) {
    notes.push('Some rings use arrows set by hand. The diagram shows the flow solve.');
  }
  return { text: lineOneOf(file, riser, flow, directions), byHand, notes };
}

/** '' or `, flow away from <main level name>` / `, flow toward <main level name>`. Not '' only when the group of the riser has a sourceLevelId that is a known level and at least one entry of `directions` is not 'unknown'. Same sense rule as the text: flowSenseOf(riser.networkType) 'supply' -> away from, 'return' -> toward. flow null -> ''. */
export function flowTailOf(file: BuildingFile, riser: Riser, flow: BuildingFlowResult | null, directions: readonly RiserSpanArrow[]): string {
  if (flow === null) return '';
  const main = mainLevelOf(file, riser, flow);
  if (main === undefined || !directions.some((span) => span.direction !== 'unknown')) return '';
  const word = flowSenseOf(riser.networkType) === 'return' ? 'toward' : 'away from';
  return `, flow ${word} ${main.name}`;
}

/** Derived flow of every riser. perLevelFlow[sheet.id] = summaries.get(sheet.projectUuid)?.riserFittingFlow ?? {} for each sheet that has a projectUuid (a sheet with projectUuid null gets {}). Then deriveRiserFlow(file, perLevelFlow). */
export function derivedFlowOf(file: BuildingFile, summaries: ReadonlyMap<string, SheetSummary>): Record<string, DerivedRiserFlow> {
  const perLevelFlow: PerSheetRiserFittingFlow = {};
  for (const sheet of file.sheets) {
    const summary = sheet.projectUuid === null ? undefined : summaries.get(sheet.projectUuid);
    perLevelFlow[sheet.id] = summary?.riserFittingFlow ?? {};
  }
  return deriveRiserFlow(file, perLevelFlow);
}

export const END_OPTIONS: ReadonlyArray<{ value: RiserEndKind; label: string }> = [
  { value: 'member', label: 'Next level' },
  { value: 'open', label: 'Open' },
  { value: 'capped', label: 'Capped' },
];

/** `<label> detached from <level name>.`  (level name of the sheet's level, 'this level' when unknown) */
export function detachedText(label: string, levelName: string): string {
  return `${label} detached from ${levelName}.`;
}
