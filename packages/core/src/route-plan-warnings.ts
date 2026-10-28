// The warning codes of the route planner (auto-routing-r6.md §4.2).

import type { Vec2 } from './geometry.js';

export const ROUTE_GRAVITY_TYPE_IDS: readonly string[] = ['sanitary-waste'];

export type RoutePlanWarningCode =
  | 'multi-page' | 'no-calibration' | 'area-empty' | 'gravity-not-routed' | 'start-error' | 'foreign-start' | 'no-targets' | 'start-unreachable' | 'internal-join'
  | 'free-angle' | 'wall-crossings' | 'shaft-crossing' | 'room-off-graph' | 'room-chained' | 'ports-left' | 'existing-crossings' | 'existing-overlap'
  | 'same-type-join' | 'short-leg' | 'capacity-over' | 'capacity-unit' | 'no-limits'
  | 'removes-routed' | 'extends-stub' | 'rooms-skipped' | 'shares-lane' | 'hand-kept-size' | 'held-by-hand' | 'multi-port-stamps' | 'draft-2d'
  | 'main-crosses-room';

/** A target stamp with more than one open port of the routed type: the run used port `used` (1 is the first in port order) of the `open` open ports. */
export interface MultiPortStamp { id: string; used: number; open: number }

export interface RoutePlanWarning {
  code: RoutePlanWarningCode;
  severity: 'error' | 'warning' | 'info';
  count?: number; ids?: string[]; points?: Vec2[]; numbers?: Record<string, number>; stamps?: MultiPortStamp[];
}

/** Warning for the rooms that bridge lines of the main run cross. Null when there is no bridge. */
export function mainCrossesRoomWarning(lines: readonly { bridge?: boolean; crossedRoomId?: string; crossedRoomIds?: readonly string[] }[]): RoutePlanWarning | null {
  const bridges = lines.filter((line) => line.bridge === true);
  if (bridges.length === 0) return null;
  const lists = bridges.map((line) => line.crossedRoomIds ?? (line.crossedRoomId ? [line.crossedRoomId] : []));
  const ids = [...new Set(lists.flat())].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
  const wallCrossings = lists.reduce((sum, list) => sum + list.length + 1, 0);
  return { code: 'main-crosses-room', severity: 'warning', count: ids.length, ids, numbers: { bridges: bridges.length, wallCrossings } };
}
