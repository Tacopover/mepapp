// Route marks: which segments and fittings the route command made, and which of
// them a re-run removes. Pure functions over the segment and fitting lists, no I/O.

import { ROUTED_MARK, type ConnectionPoint, type Fitting, type Segment } from './network.js';
import { segmentsAtFitting } from './segmentTool.js';

function isPortEnd(point: ConnectionPoint, stampId: string, portId: string): boolean {
  return point.kind === 'port' && point.elementId === stampId && point.portId === portId;
}

function isFittingEnd(point: ConnectionPoint, fittingId: string): boolean {
  return point.kind === 'fitting' && point.fittingId === fittingId;
}

/**
 * The walk of auto-routing-r6.md section 4.3 step 2. Starts at the one segment that ends on the
 * start port. With two or more segments at the start port, it starts when at least one is marked
 * (a drag cleared the mark of the others): the marked ones go and each unmarked one is passed
 * like a stub. It follows marked segments through marked fittings, and stops at every stamp port.
 * A hand-drawn stub at the start port is passed through once, when it ends on a fitting. Returns
 * sorted ids. A fitting is returned only when it is marked and no segment outside the run uses it.
 */
export function routedRunOf(
  state: { segments: readonly Segment[]; fittings: readonly Fitting[] },
  startStampId: string,
  startPortId: string,
): { segmentIds: string[]; fittingIds: string[] } {
  const empty = { segmentIds: [], fittingIds: [] };
  const segments = state.segments as Segment[];
  const atStart = segments.filter((s) => isPortEnd(s.endpointA, startStampId, startPortId) || isPortEnd(s.endpointB, startStampId, startPortId));
  const anyMarked = atStart.some((s) => s.routedBy === ROUTED_MARK);
  if (atStart.length !== 1 && !anyMarked) return empty;

  const runIds = new Set<string>();
  const pending: ConnectionPoint[] = [];
  for (const first of atStart) {
    const otherEnd = isPortEnd(first.endpointA, startStampId, startPortId) ? first.endpointB : first.endpointA;
    if (first.routedBy === ROUTED_MARK) {
      runIds.add(first.id);
      pending.push(otherEnd);
    } else if (otherEnd.kind === 'fitting') {
      pending.push(otherEnd);
    } else {
      return empty;
    }
  }

  const visited = new Set<string>();
  while (pending.length > 0) {
    const point = pending.pop()!;
    if (point.kind === 'port' || visited.has(point.fittingId)) continue;
    visited.add(point.fittingId);
    for (const segment of segmentsAtFitting(point.fittingId, segments)) {
      if (segment.routedBy !== ROUTED_MARK || runIds.has(segment.id)) continue;
      runIds.add(segment.id);
      pending.push(isFittingEnd(segment.endpointA, point.fittingId) ? segment.endpointB : segment.endpointA);
    }
  }

  const fittingIds = new Set<string>();
  for (const segment of segments) {
    if (!runIds.has(segment.id)) continue;
    for (const end of [segment.endpointA, segment.endpointB]) {
      if (end.kind === 'fitting') fittingIds.add(end.fittingId);
    }
  }
  const removableFittingIds = [...fittingIds].filter((fittingId) => {
    const fitting = state.fittings.find((f) => f.id === fittingId);
    if (fitting?.routedBy !== ROUTED_MARK) return false;
    return !segments.some((s) => !runIds.has(s.id) && (isFittingEnd(s.endpointA, fittingId) || isFittingEnd(s.endpointB, fittingId)));
  });

  return { segmentIds: [...runIds].sort(), fittingIds: removableFittingIds.sort() };
}

/** Copies of the items with the given ids without the mark. Items with other ids, and items with no mark, are returned as the same object. */
export function clearRoutedMarks<T extends { id: string; routedBy?: unknown }>(items: readonly T[], ids: ReadonlySet<string>): T[] {
  return items.map((item) => {
    if (!ids.has(item.id) || !Object.prototype.hasOwnProperty.call(item, 'routedBy')) return item;
    const copy = { ...item };
    delete copy.routedBy;
    return copy;
  });
}
