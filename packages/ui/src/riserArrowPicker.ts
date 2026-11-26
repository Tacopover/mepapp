import { clearMemberArrows, riserRingArrows, riserWarnings, RISER_ARROW_PICTOGRAMS, setMemberArrows, type BuildingFile, type BuildingFlowResult, type RiserArrowPair, type RiserPictogramNumber } from '@mepapp/core';
import { EMPTY_FLOW } from './riserArrowMarks.js';

export const RISER_ARROWS_LABEL = 'Riser arrows';
export const ARROWS_ROW_LABEL = 'Arrows';
export const ARROWS_HINT = 'Up and down mean higher and lower levels.';
export const ARROWS_TAG = 'Arrows set by hand';
export const NO_ARROWS_TEXT = 'No arrows';
export const NO_ARROWS_TITLE = 'Show no arrows on this ring.';
export const USE_SOLVE_TEXT = 'Use the flow solve';
export const USE_SOLVE_TITLE = 'Show the arrows that the flow solve gives.';
export const ARROWS_RISER_GONE_TEXT = 'This riser does not exist any more.';

export interface ArrowChoice {
  /** 'p1' to 'p8' for the pictograms, 'none' for no arrows. */
  id: string;
  pair: RiserArrowPair;
  pictogram: RiserPictogramNumber | null;
  /** Tooltip and aria-label. For 'none': NO_ARROWS_TITLE for the tooltip is used by the component; `text` is NO_ARROWS_TEXT. */
  title: string;
}

const PICTOGRAM_TITLES: readonly string[] = [
  'Comes up, goes up',
  'Goes up',
  'Comes up',
  'Comes down, goes down',
  'Comes down',
  'Goes down',
  'Goes up, goes down',
  'Comes up, comes down',
];

/** Nine entries, in this order: the eight pictograms of RISER_ARROW_PICTOGRAMS (number 1 to 8, same pair), then 'none' with the pair { below: 'none', above: 'none' }. */
export const ARROW_CHOICES: readonly ArrowChoice[] = [
  ...RISER_ARROW_PICTOGRAMS.map((pictogram, index) => ({
    id: `p${pictogram.number}`,
    pair: { below: pictogram.below, above: pictogram.above },
    pictogram: pictogram.number,
    title: PICTOGRAM_TITLES[index]!,
  })),
  { id: 'none', pair: { below: 'none', above: 'none' }, pictogram: null, title: NO_ARROWS_TEXT },
];

/** The choice that has this pair. Always found for a valid pair (nine pairs, nine choices). */
export function arrowChoiceOf(pair: RiserArrowPair): ArrowChoice {
  return ARROW_CHOICES.find((choice) => choice.pair.below === pair.below && choice.pair.above === pair.above)!;
}

function clampArrowIndex(index: number): number {
  return Math.min(Math.max(index, 0), ARROW_CHOICES.length - 1);
}

/** The index (0 to 8 in ARROW_CHOICES) that the key moves to, from index `from`, or null for a key that is not handled.
 *  ArrowLeft: from - 1. ArrowRight: from + 1. ArrowUp: from - 4. ArrowDown: from + 4. The result is clamped to 0..8 (no wrap). Keys 'Home' and 'End': 0 and 8. */
export function nextArrowIndex(from: number, key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampArrowIndex(from - 1);
    case 'ArrowRight':
      return clampArrowIndex(from + 1);
    case 'ArrowUp':
      return clampArrowIndex(from - 4);
    case 'ArrowDown':
      return clampArrowIndex(from + 4);
    case 'Home':
      return 0;
    case 'End':
      return ARROW_CHOICES.length - 1;
    default:
      return null;
  }
}

export interface RingArrowsView {
  riserId: string;
  riserName: string;
  levelId: string;
  /** The pair that the ring shows now (hand-set or from the flow solve). */
  pair: RiserArrowPair;
  /** riserPictogramOf(pair): 1 to 8, or null for (none, none). */
  pictogram: RiserPictogramNumber | null;
  handSet: boolean;
}

/** The view of the ring of the fitting `fittingId` on the sheet `sheetId`. null when file or sheetId is null, when no riser has a member with that sheetId and fittingId, or when riserRingArrows has no entry for the level of that member (a level that is not in file.levels). The pair comes from `riserRingArrows(file, flow ?? EMPTY_FLOW, (riser) => riser.networkType)[riser.id]?.[member.levelId]` (pair, pictogram, handSet). */
export function ringArrowsViewOf(file: BuildingFile | null, sheetId: string | null, fittingId: string, flow: BuildingFlowResult | null): RingArrowsView | null {
  if (file === null || sheetId === null) return null;
  for (const riser of file.risers) {
    const member = riser.members.find((item) => item.sheetId === sheetId && item.fittingId === fittingId);
    if (member === undefined) continue;
    const ring = riserRingArrows(file, flow ?? EMPTY_FLOW, (item) => item.networkType)[riser.id]?.[member.levelId];
    if (ring === undefined) return null;
    return { riserId: riser.id, riserName: riser.name, levelId: member.levelId, pair: ring.pair, pictogram: ring.pictogram, handSet: ring.handSet };
  }
  return null;
}

/** 'Set by hand' when view.handSet; else 'From the flow solve' when view.pictogram !== null; else 'None yet'. */
export function arrowsValueText(view: RingArrowsView): string {
  if (view.handSet) return 'Set by hand';
  if (view.pictogram !== null) return 'From the flow solve';
  return 'None yet';
}

/** The id of the choice that shows as chosen: arrowChoiceOf(view.pair).id when view.handSet, else null. */
export function chosenArrowId(view: RingArrowsView): string | null {
  return view.handSet ? arrowChoiceOf(view.pair).id : null;
}

export type ArrowsEdit = { ok: true; file: BuildingFile; warning: string | null } | { ok: false; text: string };

/** The write. pair null = "Use the flow solve" (clearMemberArrows), else setMemberArrows. text = ARROWS_RISER_GONE_TEXT when no riser with that id has a member with that levelId. An unchanged file (same pair, or nothing to clear) gives ok true with the same `file` object and warning null. warning: the lines of riserWarnings(next) that start with `Arrows of ` and are not in riserWarnings(file), joined with one space; null when there is none. */
export function editRingArrows(file: BuildingFile, riserId: string, levelId: string, pair: RiserArrowPair | null): ArrowsEdit {
  const riser = file.risers.find((item) => item.id === riserId);
  if (riser === undefined || !riser.members.some((member) => member.levelId === levelId)) return { ok: false, text: ARROWS_RISER_GONE_TEXT };
  const next = pair === null ? clearMemberArrows(file, riserId, levelId) : setMemberArrows(file, riserId, levelId, pair);
  if (next === file) return { ok: true, file, warning: null };
  const before = riserWarnings(file);
  const added = riserWarnings(next).filter((line) => line.startsWith('Arrows of ') && !before.includes(line));
  return { ok: true, file: next, warning: added.length > 0 ? added.join(' ') : null };
}
