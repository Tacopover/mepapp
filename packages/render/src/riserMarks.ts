import { clearRoutedMarks, recomputeAttachedSegments, type PortGroup, type Vec2 } from '@mepapp/core';
import type { DrawingState } from './document.js';

/** One marked fitting. The UI builds it from the building file; anchorPt is the riser anchor in pt on the shown page. */
export interface RiserMark { riserId: string; name: string; networkTypeId: string; anchorPt: Vec2 }

export interface RiserConflict { fittingId: string; fittingPt: Vec2; anchorPt: Vec2 }

/** Moves one fitting to `to` and re-seats the attached segments (recomputeAttachedSegments with the given portGroups). Clears the route mark (routedBy) of the moved fitting and of the segments that end at it, like a hand drag does. Returns the new state, or null when the fitting does not exist. Returns the same state object when the position is already equal. */
export function moveFittingInState(state: DrawingState, fittingId: string, to: Vec2, portGroups: readonly PortGroup[]): DrawingState | null {
  const fitting = state.fittings[fittingId];
  if (!fitting) return null;
  if (fitting.position.x === to.x && fitting.position.y === to.y) return state;

  const fittings = { ...state.fittings, [fittingId]: { ...fitting, position: { x: to.x, y: to.y } } };
  const segmentUpdates = recomputeAttachedSegments(
    { segments: state.segments, fittings, stamps: state.stamps, portGroups: [...portGroups] },
    [{ kind: 'fitting', fittingId }],
  );
  const next: DrawingState = { ...state, fittings, segments: { ...state.segments, ...segmentUpdates } };

  const segmentIds = new Set(
    Object.values(next.segments)
      .filter((s) => s.routedBy !== undefined && [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === fittingId))
      .map((s) => s.id),
  );
  const fittingIds = new Set(fitting.routedBy !== undefined ? [fittingId] : []);
  if (segmentIds.size === 0 && fittingIds.size === 0) return next;
  return {
    ...next,
    fittings: Object.fromEntries(clearRoutedMarks(Object.values(next.fittings), fittingIds).map((f) => [f.id, f])),
    segments: Object.fromEntries(clearRoutedMarks(Object.values(next.segments), segmentIds).map((s) => [s.id, s])),
  };
}

/** The marked fittings on `pageIndex` whose distance to the anchor of their mark is greater than `tolerancePt`. A mark whose fitting is missing or on another page is skipped. */
export function riserConflictsIn(state: DrawingState, marks: ReadonlyMap<string, RiserMark>, pageIndex: number, tolerancePt: number): RiserConflict[] {
  const conflicts: RiserConflict[] = [];
  for (const [fittingId, mark] of marks) {
    const fitting = state.fittings[fittingId];
    if (!fitting || (fitting.pageIndex ?? 0) !== pageIndex) continue;
    if (Math.hypot(fitting.position.x - mark.anchorPt.x, fitting.position.y - mark.anchorPt.y) <= tolerancePt) continue;
    conflicts.push({ fittingId, fittingPt: fitting.position, anchorPt: mark.anchorPt });
  }
  return conflicts;
}
