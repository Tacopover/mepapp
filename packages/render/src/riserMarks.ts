import { clearRoutedMarks, recomputeAttachedSegments, segmentIdsOfNetworks, type PortGroup, type Segment, type Vec2 } from '@mepapp/core';
import type { DrawingState } from './document.js';

/** One marked fitting. The UI builds it from the building file; anchorPt is the riser anchor in pt on the shown page. */
export interface RiserMark {
  riserId: string;
  name: string;
  networkTypeId: string;
  anchorPt: Vec2;
  /** true: the user chose "Decide later" for a conflict of this fitting. The ring is drawn amber. */
  undecided?: boolean;
}

export interface RiserConflict { fittingId: string; fittingPt: Vec2; anchorPt: Vec2 }

export interface FittingContext {
  position: Vec2;
  /** Number of segments with an endpoint at the fitting. */
  segmentCount: number;
  /** Distinct networkTypeId of those segments, in first-seen order of Object.values(state.segments). */
  networkTypeIds: string[];
}

/** Riser ids (deduped, first-seen order) of the marked fittings that the given segments end at. */
export function riserIdsTouchedBySegments(segments: readonly Segment[], marks: ReadonlyMap<string, RiserMark>): string[] {
  const riserIds: string[] = [];
  for (const segment of segments) {
    for (const end of [segment.endpointA, segment.endpointB]) {
      if (end.kind !== 'fitting') continue;
      const mark = marks.get(end.fittingId);
      if (mark && !riserIds.includes(mark.riserId)) riserIds.push(mark.riserId);
    }
  }
  return riserIds;
}

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

/** Sets networkTypeId on every segment of the connected run(s) that end at `fittingId` (segmentIdsOfNetworks with the given portGroups, seeds = the segments with endpointA or endpointB { kind:'fitting', fittingId }). Null when the fitting does not exist. The same state object when the fitting has no segment, or when every segment of the run has the type already. */
export function retagRunInState(state: DrawingState, fittingId: string, networkTypeId: string, portGroups: readonly PortGroup[]): DrawingState | null {
  if (!state.fittings[fittingId]) return null;
  const seedIds = Object.values(state.segments)
    .filter((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === fittingId))
    .map((s) => s.id);
  if (seedIds.length === 0) return state;
  const runIds = segmentIdsOfNetworks({ segments: Object.values(state.segments), fittings: Object.values(state.fittings), portGroups: [...portGroups] }, seedIds);

  const segments = { ...state.segments };
  let changed = false;
  for (const id of runIds) {
    const segment = state.segments[id];
    if (!segment || segment.networkTypeId === networkTypeId) continue;
    segments[id] = { ...segment, networkTypeId };
    changed = true;
  }
  return changed ? { ...state, segments } : state;
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

/** Null when the fitting does not exist. Counts every segment of the state that has endpointA or endpointB `{ kind: 'fitting', fittingId }` (a segment with both ends at the fitting counts once). */
export function fittingContextIn(state: DrawingState, fittingId: string): FittingContext | null {
  const fitting = state.fittings[fittingId];
  if (!fitting) return null;
  let segmentCount = 0;
  const networkTypeIds: string[] = [];
  for (const segment of Object.values(state.segments)) {
    const atFitting = [segment.endpointA, segment.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === fittingId);
    if (!atFitting) continue;
    segmentCount += 1;
    if (!networkTypeIds.includes(segment.networkTypeId)) networkTypeIds.push(segment.networkTypeId);
  }
  return { position: fitting.position, segmentCount, networkTypeIds };
}
