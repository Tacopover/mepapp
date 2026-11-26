import type { NetworkType } from './network.js';

// Types for risers (buildings-levels-sheets-spec.md section 3.4). Validation is in building.ts, the warnings are riserWarnings in building.ts.

export type RiserFlow = 'up' | 'down' | 'both' | 'unknown';

export type RiserArrowDirection = 'up' | 'down' | 'none';

/** The hand-set arrows of one ring. `below` is the arrow for the span to the next lower member level, `above` for the span to the next higher member level. */
export interface RiserArrowPair {
  below: RiserArrowDirection;
  above: RiserArrowDirection;
}

export type RiserPictogramNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RiserArrowPictogram extends RiserArrowPair {
  number: RiserPictogramNumber;
}

export const RISER_ARROW_DIRECTIONS: readonly RiserArrowDirection[] = ['up', 'down', 'none'];

/** The eight pictograms of risers.png, in the order 1 to 8. The pair (none, none) is not a pictogram. */
export const RISER_ARROW_PICTOGRAMS: readonly RiserArrowPictogram[] = [
  { number: 1, below: 'up', above: 'up' },
  { number: 2, below: 'none', above: 'up' },
  { number: 3, below: 'up', above: 'none' },
  { number: 4, below: 'down', above: 'down' },
  { number: 5, below: 'none', above: 'down' },
  { number: 6, below: 'down', above: 'none' },
  { number: 7, below: 'down', above: 'up' },
  { number: 8, below: 'up', above: 'down' },
];

/** The number 1 to 8 of the pictogram that has this pair, or null for (none, none). */
export function riserPictogramOf(pair: RiserArrowPair): RiserPictogramNumber | null {
  const hit = RISER_ARROW_PICTOGRAMS.find((p) => p.below === pair.below && p.above === pair.above);
  return hit ? hit.number : null;
}

/** true when value is an object whose `below` and `above` are each 'up', 'down' or 'none'. Extra keys are allowed. */
export function isRiserArrowPair(value: unknown): value is RiserArrowPair {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    RISER_ARROW_DIRECTIONS.includes(v.below as RiserArrowDirection) &&
    RISER_ARROW_DIRECTIONS.includes(v.above as RiserArrowDirection)
  );
}

/**
 * `member`: the riser continues on a member level at this end.
 * `open`: the riser ends open (for example through the roof).
 * `capped`: the riser ends in a cap (a dead end).
 */
export type RiserEndKind = 'member' | 'open' | 'capped';

export interface Riser {
  id: string;
  name: string;
  shaftName?: string;
  networkTypeId: string;
  /** Copy of the network type, equal id to networkTypeId. A document that opens the riser adopts it. */
  networkType: NetworkType;
  /** Real-world mm, origin = bottom-left of the displayed page, y up. */
  anchorMm: { xMm: number; yMm: number };
  flow: RiserFlow;
  sourceLevelId?: string;
  topEnd: RiserEndKind;
  bottomEnd: RiserEndKind;
  /** Extra length at ONE end, counted once for each `open` or `capped` end. Not used for a `member` end. */
  endAllowanceMm: number;
  members: RiserMember[];
  pending: RiserPendingOp[];
}

export interface RiserMember {
  levelId: string;
  sheetId: string;
  /** Must equal the pageIndex of the sheet. */
  pageIndex: number;
  fittingId: string;
  connectionHeightMm?: number;
  /** Arrows set by hand for the ring of this member. Absent: the arrows come from the flow solve. A pair (none, none) is a value: no arrow by hand. A pair can point to a span that does not exist (the top member with above 'up'): it is drawn anyway, and a detach does not clear the pairs of the neighbors. */
  arrows?: RiserArrowPair;
}

export interface RiserPendingOp {
  /** Unique in the riser, grows in array order. */
  seq: number;
  sheetId: string;
  kind: 'move' | 'retag' | 'setScale';
  toMm?: { xMm: number; yMm: number };
  networkTypeId?: string;
  /** setScale: pt per real mm, the same unit as Calibration.pageUnitsPerRealUnit. */
  pageUnitsPerRealUnit?: number;
}
