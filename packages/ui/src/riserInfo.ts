import { deriveRiserFlow, type BuildingFile, type BuildingSheet, type DerivedRiserFlow, type PerSheetRiserFittingFlow, type Riser, type RiserEndKind, type SheetSummary } from '@mepapp/core';
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
  /** The text of the derived box. */
  text: string;
  /** True when the file holds a hand-set direction or source level. */
  byHand: boolean;
}

/** derived is the entry of deriveRiserFlow for this riser (undefined = nothing solved). Dir words: 'Up', 'Down', 'Both'. Source word: the name of the level, 'Not known yet' when there is no source.
 * Not by hand and derived.flow is up/down/both: `${Dir} · source: ${source or 'Not known yet'} · from the flow solve`.
 * Not by hand and the direction is unknown: `Not known yet`.
 * By hand: direction = riser.flow when it is not 'unknown', else derived.flow when known (the source set by hand gives the direction), else none. The source part is `source: ${level name}` when riser.sourceLevelId is set and is a known level, else `source: from the flow solve`. Result: `${Dir} · ${sourcePart} · Set by hand`, or `${sourcePart} · Set by hand` when no direction. */
export function riserFlowText(file: BuildingFile, riser: Riser, derived: DerivedRiserFlow | undefined): RiserFlowText {
  const byHand = riser.flow !== 'unknown' || riser.sourceLevelId !== undefined;
  const levelName = (levelId: string | undefined): string | undefined => file.levels.find((level) => level.id === levelId)?.name;
  if (!byHand) {
    if (derived === undefined || derived.flow === 'unknown') return { text: 'Not known yet', byHand };
    const source = levelName(derived.sourceLevelId) ?? 'Not known yet';
    return { text: `${DIR_WORD[derived.flow]} · source: ${source} · from the flow solve`, byHand };
  }
  const direction = riser.flow !== 'unknown' ? riser.flow : derived !== undefined && derived.flow !== 'unknown' ? derived.flow : undefined;
  const handSource = levelName(riser.sourceLevelId);
  const sourcePart = handSource !== undefined ? `source: ${handSource}` : 'source: from the flow solve';
  const text = direction !== undefined ? `${DIR_WORD[direction]} · ${sourcePart} · Set by hand` : `${sourcePart} · Set by hand`;
  return { text, byHand };
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
