import type { NetworkType } from './network.js';

// Types only. The riser tools and checks come with B4 (buildings-levels-sheets-spec.md section 3.4).

export interface Riser {
  id: string;
  name: string;
  shaftName?: string;
  networkTypeId: string;
  networkType: NetworkType;
  anchorMm: { xMm: number; yMm: number };
  flow: 'up' | 'down' | 'both' | 'unknown';
  sourceLevelId?: string;
  topEnd: 'member' | 'open';
  bottomEnd: 'member' | 'open';
  endAllowanceMm: number;
  members: RiserMember[];
  pending: RiserPendingOp[];
}

export interface RiserMember {
  levelId: string;
  sheetId: string;
  fittingId: string;
  connectionHeightMm?: number;
}

export interface RiserPendingOp {
  seq: number;
  sheetId: string;
  kind: 'move' | 'retag';
  toMm?: { xMm: number; yMm: number };
  networkTypeId?: string;
}
