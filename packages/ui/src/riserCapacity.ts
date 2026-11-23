import { ROUTE_GRAVITY_TYPE_IDS, type BuildingFile, type BuildingFlowGroup, type BuildingFlowResult, type FlowUnitId, type NetworkType, type Riser, type RiserNetworksLive, type SheetSummary } from '@mepapp/core';
import { rebuildResultText } from './buildingStatus.js';
import type { RebuildResult } from './rebuildSummaries.js';

/** The unit of the capacity numbers of the riser: riser.networkType.flowUnit. Never the unit of an open level. */
export function riserFlowUnit(riser: Pick<Riser, 'networkType'>): FlowUnitId | undefined {
  return riser.networkType.flowUnit;
}

/** True for a drain (id in ROUTE_GRAVITY_TYPE_IDS), a fire protection type (discipline 'fireProtection') and an electrical type (discipline 'electrical'). */
export function isNotDesignFlow(type: Pick<NetworkType, 'id' | 'discipline'>): boolean {
  return ROUTE_GRAVITY_TYPE_IDS.includes(type.id) || type.discipline === 'fireProtection' || type.discipline === 'electrical';
}

/** Round to 2 decimals; text `[at least ]<n>[ <unit>]`. Example: capacityNumberText(650, 'm³/h', false) = '650 m³/h'; (150, 'm³/h', true) = 'at least 150 m³/h'; (650, undefined, false) = '650'; (12.345, 'l/s', false) = '12.35 l/s' (Math.round(v * 100) / 100 then String). */
export function capacityNumberText(value: number, unit: FlowUnitId | undefined, atLeast: boolean): string {
  const number = String(Math.round(value * 100) / 100);
  const text = unit === undefined ? number : `${number} ${unit}`;
  return atLeast ? `at least ${text}` : text;
}

export type UnknownReason = 'no-source' | 'many-sources' | 'loop' | 'hand-conflict';

const REASON_PHRASES: [string, UnknownReason][] = [
  ['no source level', 'no-source'],
  ['more than one source level', 'many-sources'],
  ['a loop', 'loop'],
  ['different main levels set by hand', 'hand-conflict'],
];

const REASON_TEXT: Record<UnknownReason, string> = {
  'no-source': 'no source level',
  'many-sources': 'more than one source level',
  loop: 'the risers make a loop',
  'hand-conflict': 'two main levels set by hand',
};

export const MAIN_LEVEL_LABEL = 'Main level';
export const CONNECTED_TOTAL_LABEL = 'Connected total';

const DESIGN_FLOW_HINT = 'These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type.';
const INCOMPLETE_HINT = 'Some levels have no data, so some numbers read "at least". The warnings above name each level.';
const LOOP_HINT = 'See the warnings above.';
const UNKNOWN_HINT = 'Click Set by hand and choose a source level.';
const UNKNOWN_SELECT_HINT = 'Choose a level in the list "Source level".';
const NO_UNIT_HINT = 'This network type has no flow unit, so the numbers have no unit.';
const ONE_MEMBER_HINT = 'This riser has one level. A capacity needs two levels.';
const RISER_INCOMPLETE_HINT = 'Some levels have no data, so a number reads "at least". Solved capacity counts only the levels that have data. Open Manage Buildings, tab Risers, to see which levels.';
const RISER_UNKNOWN_HINT = 'Solved capacity counts this level only until the main level is known. Open Manage Buildings, tab Risers, to set it.';
const RISER_LOOP_HINT = 'Solved capacity counts this level only. The risers make a loop. Open Manage Buildings, tab Risers, for details.';
const NOT_DESIGN_FLOW_TAG = 'Not a design flow';

/** The reason that a group has state 'unknown'. Looks in `warnings` for a warning that starts with the same subject as the solve builds: `Riser <name>` for one riser, `Risers <name>, <name>` for several (names of group.riserIds in the order of group.riserIds, found in file.risers; unknown id skipped), followed by a space, and then contains: 'no source level' -> 'no-source'; 'more than one source level' -> 'many-sources'; 'a loop' -> 'loop'; 'different main levels set by hand' -> 'hand-conflict'. Undefined when the group is not 'unknown' or no warning matches. */
export function unknownReasonOf(file: BuildingFile, group: BuildingFlowGroup, warnings: readonly string[]): UnknownReason | undefined {
  if (group.state !== 'unknown') return undefined;
  const names = group.riserIds
    .map((id) => file.risers.find((item) => item.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  const subject = names.length === 1 ? `Riser ${names[0]}` : `Risers ${names.join(', ')}`;
  for (const warning of warnings) {
    if (!warning.startsWith(`${subject} `)) continue;
    const rest = warning.slice(subject.length + 1);
    const match = REASON_PHRASES.find(([phrase]) => rest.includes(phrase));
    if (match !== undefined) return match[1];
  }
  return undefined;
}

export interface CapacityRow {
  /** `${fromLevelId}|${toLevelId}|${index}`, index of the span in the list of the riser. Fitting ids are not unique across levels, so they cannot make the key. */
  key: string;
  /** `Level 0 to Level 1` (names of the levels; the id when the level is not in file.levels) */
  levelsText: string;
  /** `650 m³/h`, `at least 150 m³/h`, `not known yet (no source level)`, `not known yet` */
  valueText: string;
  known: boolean;
  /** `${levelsText}: ${valueText}` */
  ariaLabel: string;
}

export interface CapacityView {
  /** 'one-member': the riser has no span (it has no group in the result). */
  kind: 'one-member' | 'solved';
  notDesignFlow: boolean;
  /** `Main level: Level 0` or `Main level: not known yet` (group.sourceLevelId is undefined or the level is unknown). '' for one-member. */
  mainLine: string;
  /** `Connected total: 750 m³/h (no concurrency factor)`, `Connected total: at least 750 m³/h (no concurrency factor)`, `Connected total: 750 (no concurrency factor)` (no unit). null for one-member. */
  totalLine: string | null;
  rows: CapacityRow[];
  /** One other riser in the group: `The total also covers R2. It shares a network with this riser.` Several: `The total also covers R2, R3. They share a network with this riser.` null when the group has only this riser. */
  sharedLine: string | null;
  /** The hint paragraphs in this order, each only when it applies: (1) not complete (group.complete false): `Some levels have no data, so some numbers read "at least". The warnings above name each level.`; (2) group state unknown: reason 'loop' -> `See the warnings above.`; any other reason, and no reason -> `Choose a level in the list "Source level".` when options.selectsShown is true, else `Click Set by hand and choose a source level.`; (3) unit not set: `This network type has no flow unit, so the numbers have no unit.`; (4) one-member: `This riser has one level. A capacity needs two levels.` (only hint of a one-member view). */
  hints: string[];
  /** Only for notDesignFlow: `These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type.` else null. */
  designFlowHint: string | null;
  /** The text after `Main level: ` in mainLine: `Level 0` or `not known yet`. '' for one-member. */
  mainValue: string;
  /** The text after `Connected total: ` in totalLine. null for one-member. */
  totalValue: string | null;
  /** The reason text of an unknown group (`no source level`), else null. */
  unknownReasonText: string | null;
  /** group.complete. false for one-member. */
  complete: boolean;
  /** group.state is 'unknown'. false for one-member. */
  unknown: boolean;
  /** The reason of the unknown group is 'loop'. false for one-member. */
  loop: boolean;
  /** The riser network type has no flow unit. false for one-member. */
  noUnit: boolean;
}

export interface FittingRiserLines {
  /** `Riser R1` (the name of the riser). */
  heading: string;
  /** 'Not a design flow' when view.notDesignFlow, else null. */
  tag: string | null;
  /** Always two rows: Main level, Connected total. title = `${label}: ${value}`. */
  rows: { label: string; value: string; title: string }[];
  /** In this order, each only when it applies: D, E, F, G, H below. */
  hints: string[];
}

function levelNameOf(file: BuildingFile, levelId: string): string {
  return file.levels.find((level) => level.id === levelId)?.name ?? levelId;
}

export function capacityViewOf(file: BuildingFile, riser: Riser, flow: BuildingFlowResult, options: { selectsShown?: boolean } = {}): CapacityView {
  const spans = flow.risers[riser.id]?.spans ?? [];
  const group = flow.groups.find((item) => item.riserIds.includes(riser.id));
  const notDesignFlow = isNotDesignFlow(riser.networkType);
  const designFlowHint = notDesignFlow ? DESIGN_FLOW_HINT : null;
  if (group === undefined || spans.length === 0) {
    return {
      kind: 'one-member',
      notDesignFlow,
      mainLine: '',
      totalLine: null,
      rows: [],
      sharedLine: null,
      hints: [ONE_MEMBER_HINT],
      designFlowHint,
      mainValue: '',
      totalValue: null,
      unknownReasonText: null,
      complete: false,
      unknown: false,
      loop: false,
      noUnit: false,
    };
  }
  const unit = riserFlowUnit(riser);
  const reason = unknownReasonOf(file, group, flow.warnings);
  const sourceLevel = group.sourceLevelId === undefined ? undefined : file.levels.find((level) => level.id === group.sourceLevelId);
  const mainValue = sourceLevel === undefined ? 'not known yet' : sourceLevel.name;
  const mainLine = `${MAIN_LEVEL_LABEL}: ${mainValue}`;
  const totalValue = `${capacityNumberText(group.total, unit, !group.complete)} (no concurrency factor)`;
  const totalLine = `${CONNECTED_TOTAL_LABEL}: ${totalValue}`;
  const unknownReasonText = reason === undefined ? null : REASON_TEXT[reason];
  const rows = spans.map((span, index): CapacityRow => {
    const levelsText = `${levelNameOf(file, span.fromLevelId)} to ${levelNameOf(file, span.toLevelId)}`;
    let valueText: string;
    let known = false;
    if (span.state === 'ok' && span.capacity !== null) {
      valueText = capacityNumberText(span.capacity, unit, !span.complete);
      known = true;
    } else {
      valueText = reason === undefined ? 'not known yet' : `not known yet (${REASON_TEXT[reason]})`;
    }
    return {
      key: `${span.fromLevelId}|${span.toLevelId}|${index}`,
      levelsText,
      valueText,
      known,
      ariaLabel: `${levelsText}: ${valueText}`,
    };
  });
  const others = group.riserIds
    .filter((id) => id !== riser.id)
    .map((id) => file.risers.find((item) => item.id === id)?.name ?? id);
  let sharedLine: string | null = null;
  if (others.length === 1) {
    sharedLine = `The total also covers ${others[0]!}. It shares a network with this riser.`;
  } else if (others.length > 1) {
    sharedLine = `The total also covers ${others.join(', ')}. They share a network with this riser.`;
  }
  const hints: string[] = [];
  if (!group.complete) hints.push(INCOMPLETE_HINT);
  if (group.state === 'unknown') {
    if (reason === 'loop') hints.push(LOOP_HINT);
    else hints.push(options.selectsShown ? UNKNOWN_SELECT_HINT : UNKNOWN_HINT);
  }
  if (unit === undefined) hints.push(NO_UNIT_HINT);
  return {
    kind: 'solved',
    notDesignFlow,
    mainLine,
    totalLine,
    rows,
    sharedLine,
    hints,
    designFlowHint,
    mainValue,
    totalValue,
    unknownReasonText,
    complete: group.complete,
    unknown: group.state === 'unknown',
    loop: reason === 'loop',
    noUnit: unit === undefined,
  };
}

/** null for a view of kind 'one-member'. Rows: label MAIN_LEVEL_LABEL, value `Level 0` or `not known yet` or `not known yet (<unknownReasonText>)` (when the reason is known); label CONNECTED_TOTAL_LABEL, value = view.totalValue. */
export function fittingRiserLinesOf(view: CapacityView, riserName: string): FittingRiserLines | null {
  if (view.kind === 'one-member') return null;
  const noData = view.unknown && !view.complete && view.unknownReasonText === REASON_TEXT['no-source'];
  let mainValue = view.mainValue === 'not known yet' && view.unknownReasonText !== null ? `not known yet (${view.unknownReasonText})` : view.mainValue;
  if (noData) mainValue = 'not known yet (a level has no data)';
  const totalValue = view.totalValue ?? '';
  const hints: string[] = [];
  if (view.sharedLine !== null) hints.push(view.sharedLine);
  if (!view.complete) hints.push(RISER_INCOMPLETE_HINT);
  if (view.unknown && !noData) hints.push(view.loop ? RISER_LOOP_HINT : RISER_UNKNOWN_HINT);
  if (view.noUnit) hints.push(NO_UNIT_HINT);
  if (view.designFlowHint !== null) hints.push(view.designFlowHint);
  return {
    heading: `Riser ${riserName}`,
    tag: view.notDesignFlow ? NOT_DESIGN_FLOW_TAG : null,
    rows: [
      { label: MAIN_LEVEL_LABEL, value: mainValue, title: `${MAIN_LEVEL_LABEL}: ${mainValue}` },
      { label: CONNECTED_TOTAL_LABEL, value: totalValue, title: `${CONNECTED_TOTAL_LABEL}: ${totalValue}` },
    ],
    hints,
  };
}

/** True when a member sheet of any riser of the group of `riser` has a projectUuid that is not in `live`, and has no stored summary or a stored summary with no `riserNetworks`. False for one-member and when there is no group. The pane then shows the link "Read summaries now". */
export function needsSummaryRead(
  file: BuildingFile,
  riser: Riser,
  flow: BuildingFlowResult,
  summaries: ReadonlyMap<string, SheetSummary>,
  live?: readonly RiserNetworksLive[],
): boolean {
  const spans = flow.risers[riser.id]?.spans ?? [];
  const group = flow.groups.find((item) => item.riserIds.includes(riser.id));
  if (group === undefined || spans.length === 0) return false;
  const members = file.risers.filter((item) => group.riserIds.includes(item.id)).flatMap((item) => item.members);
  return members.some((member) => {
    const projectUuid = file.sheets.find((sheet) => sheet.id === member.sheetId)?.projectUuid ?? null;
    if (projectUuid === null || live?.some((item) => item.projectUuid === projectUuid)) return false;
    const stored = summaries.get(projectUuid);
    return stored === undefined || stored.riserNetworks === undefined;
  });
}

/** The notice after a run of "Read summaries now". undefined result: the run did not start. A failed PDF is named with its reason and the notice is an error; at most 3 failures are named, then `and N more`. */
export function rebuildNoticeText(result: RebuildResult | undefined): { text: string; error: boolean } {
  if (result === undefined) return { text: 'The rebuild did not run. See the message in the header.', error: false };
  if (result.failed.length === 0) return { text: rebuildResultText(result), error: false };
  const named = result.failed
    .slice(0, 3)
    .map((failure) => `${failure.sheet.location.fileName}: ${failure.reason}`)
    .join('; ');
  const more = result.failed.length > 3 ? ` and ${result.failed.length - 3} more` : '';
  return { text: `${rebuildResultText(result)} Failed: ${named}${more}.`, error: true };
}
