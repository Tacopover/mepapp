// The warning codes of the route planner (auto-routing-r6.md §4.2).

import type { Vec2 } from './geometry.js';

export const ROUTE_GRAVITY_TYPE_IDS: readonly string[] = ['sanitary-waste'];

export type RoutePlanWarningCode =
  | 'multi-page' | 'no-calibration' | 'area-empty' | 'gravity-not-routed' | 'start-error' | 'foreign-start' | 'no-targets' | 'start-unreachable' | 'internal-join'
  | 'free-angle' | 'wall-crossings' | 'shaft-crossing' | 'room-off-graph' | 'ports-left' | 'existing-crossings' | 'existing-overlap'
  | 'same-type-join' | 'short-leg' | 'capacity-over' | 'capacity-unit' | 'no-limits'
  | 'removes-routed' | 'extends-stub' | 'rooms-skipped' | 'shares-lane' | 'hand-kept-size' | 'held-by-hand' | 'draft-2d';

export interface RoutePlanWarning {
  code: RoutePlanWarningCode;
  severity: 'error' | 'warning' | 'info';
  count?: number; ids?: string[]; points?: Vec2[]; numbers?: Record<string, number>;
}
