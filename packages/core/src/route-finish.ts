// Pure helpers for the last steps of the route planner (auto-routing-r6.md §4.3 steps 13 to 16).

import type { Vec2 } from './geometry.js';
import type { Segment } from './network.js';
import type { SizedSegment } from './sizing-network.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';

const SEVERITY_RANK: Record<RoutePlanWarning['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Errors first, then warnings, then info. The order inside one severity stays. The lines `draft-2d` go last. */
export function orderWarnings(warnings: readonly RoutePlanWarning[]): RoutePlanWarning[] {
  const draft = warnings.filter((warning) => warning.code === 'draft-2d');
  const rest = warnings
    .map((warning, index) => ({ warning, index }))
    .filter(({ warning }) => warning.code !== 'draft-2d')
    .sort((a, b) => SEVERITY_RANK[a.warning.severity] - SEVERITY_RANK[b.warning.severity] || a.index - b.index)
    .map(({ warning }) => warning);
  return [...rest, ...draft];
}

/**
 * The capacity line of a run, or null. `terminalTotal` is the total of the network minus the capacity of the start stamp.
 * It is `capacity-over` when the type has a flow unit and `capacity-unit` (a Note, no claim) when it has none.
 */
export function capacityWarnings(startCapacity: number, totalCapacity: number | null, hasFlowUnit: boolean): RoutePlanWarning | null {
  if (!(startCapacity > 0) || typeof totalCapacity !== 'number' || !Number.isFinite(totalCapacity)) return null;
  const terminalTotal = totalCapacity - startCapacity;
  if (!(terminalTotal > startCapacity)) return null;
  return { code: hasFlowUnit ? 'capacity-over' : 'capacity-unit', severity: hasFlowUnit ? 'warning' : 'info', numbers: { total: terminalTotal, cap: startCapacity } };
}

function sizeMm(size: SizedSegment): number {
  return size.shape === 'round' ? size.diameterMm ?? 0 : Math.max(size.widthMm ?? 0, size.heightMm ?? 0);
}

function lengthMm(geometry: readonly Vec2[], mmPerPt: number): number {
  let sum = 0;
  for (let i = 1; i < geometry.length; i++) sum += Math.hypot(geometry[i]!.x - geometry[i - 1]!.x, geometry[i]!.y - geometry[i - 1]!.y);
  return sum * mmPerPt;
}

/** The number of segments with a size whose length in mm is below 2 sizes (the larger side of a rectangle). */
export function shortLegCount(segments: readonly Segment[], sizes: readonly SizedSegment[], mmPerPt: number): number {
  const sizeById = new Map(sizes.map((size) => [size.segmentId, size] as const));
  let count = 0;
  for (const segment of segments) {
    const size = sizeById.get(segment.id);
    if (size && lengthMm(segment.geometry, mmPerPt) < 2 * sizeMm(size)) count++;
  }
  return count;
}
