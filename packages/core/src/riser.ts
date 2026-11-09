import type { NetworkType } from './network.js';

// Types for risers (buildings-levels-sheets-spec.md section 3.4). Validation is in building.ts, the warnings are riserWarnings in building.ts.

export type RiserFlow = 'up' | 'down' | 'both' | 'unknown';

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
}

export interface RiserPendingOp {
  /** Unique in the riser, grows in array order. */
  seq: number;
  sheetId: string;
  kind: 'move' | 'retag';
  toMm?: { xMm: number; yMm: number };
  networkTypeId?: string;
}
