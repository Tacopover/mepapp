import { rotatePointAround, type Vec2 } from '@mepapp/core';
import type { DrawingState } from '../document.js';
import type { Bounds, SelectableRef, ToolContext } from './types.js';

export interface AlignmentGuide {
  axis: 'x' | 'y';
  /** World-space coordinate the guide line sits at along its axis. */
  value: number;
  /** Perpendicular span the guide line is drawn across (world units) — covers both the dragged selection's bounds and the matched candidate's bounds, not the whole canvas. */
  from: number;
  to: number;
}

export interface AlignmentSnapResult {
  point: Vec2;
  guides: AlignmentGuide[];
}

/** Screen-px tolerance for a guide to trigger, converted to world units at drag time — same pattern as `snapRadiusScreenPx` (segment endpoint snap). */
const GUIDE_SNAP_SCREEN_PX = 6;

/**
 * Unions the world-space bounds of every id in `ids` — the dragged selection's bounds at
 * gesture start, captured once so per-frame snapping can shift it by the frame's raw
 * delta instead of recomputing element-by-element. Mirrors SketchScene's private
 * getSelectionBoundsWorld, implemented against ToolContext instead.
 */
export function computeSelectionBoundsWorld(ctx: ToolContext, ids: Iterable<string>, state: DrawingState): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const bounds = ctx.resolveSelectableBoundsWorld(ctx.selectableRefForId(id, state), state);
    if (!bounds) continue;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * Snaps a dragged selection's bounding box (`draggedBounds`, at the raw unsnapped drag
 * position) to the nearest edge/center alignment with any other stamp/fitting/annotation
 * on the page, independently per axis — the Figma/Illustrator "smart guide" behavior.
 * `excludeIds` is every id already part of the drag, so a selection never aligns to
 * itself. `originBounds` (move-selection only) is the selection's own bounds at drag
 * start, matched like any other candidate so an element snaps back onto its starting
 * x or y and can be dragged purely orthogonally. Returns `rawPoint` adjusted by
 * whichever axis matched (either, both, or neither), plus the guide line(s) to render
 * for visual feedback.
 */
export function resolveAlignmentSnap(
  ctx: ToolContext,
  state: DrawingState,
  rawPoint: Vec2,
  draggedBounds: Bounds,
  excludeIds: ReadonlySet<string>,
  originBounds?: Bounds | null,
): AlignmentSnapResult {
  const tolerance = GUIDE_SNAP_SCREEN_PX / ctx.getZoomScale();
  const draggedCenterX = (draggedBounds.minX + draggedBounds.maxX) / 2;
  const draggedCenterY = (draggedBounds.minY + draggedBounds.maxY) / 2;

  let bestDx = 0;
  let bestDxDistance = tolerance;
  let guideX: AlignmentGuide | null = null;
  let bestDy = 0;
  let bestDyDistance = tolerance;
  let guideY: AlignmentGuide | null = null;

  const candidateBounds: Bounds[] = [];
  for (const ref of candidateRefs(state, excludeIds)) {
    const bounds = ctx.resolveSelectableBoundsWorld(ref, state);
    if (bounds) candidateBounds.push(bounds);
  }
  if (originBounds) candidateBounds.push(originBounds);

  for (const bounds of candidateBounds) {
    const candidateCenterX = (bounds.minX + bounds.maxX) / 2;
    const candidateCenterY = (bounds.minY + bounds.maxY) / 2;

    const xPairs: Array<[number, number]> = [
      [draggedBounds.minX, bounds.minX],
      [draggedBounds.minX, bounds.maxX],
      [draggedBounds.maxX, bounds.minX],
      [draggedBounds.maxX, bounds.maxX],
      [draggedCenterX, candidateCenterX],
    ];
    for (const [draggedValue, candidateValue] of xPairs) {
      const distance = Math.abs(candidateValue - draggedValue);
      if (distance < bestDxDistance) {
        bestDxDistance = distance;
        bestDx = candidateValue - draggedValue;
        guideX = { axis: 'x', value: candidateValue, from: Math.min(draggedBounds.minY, bounds.minY), to: Math.max(draggedBounds.maxY, bounds.maxY) };
      }
    }

    const yPairs: Array<[number, number]> = [
      [draggedBounds.minY, bounds.minY],
      [draggedBounds.minY, bounds.maxY],
      [draggedBounds.maxY, bounds.minY],
      [draggedBounds.maxY, bounds.maxY],
      [draggedCenterY, candidateCenterY],
    ];
    for (const [draggedValue, candidateValue] of yPairs) {
      const distance = Math.abs(candidateValue - draggedValue);
      if (distance < bestDyDistance) {
        bestDyDistance = distance;
        bestDy = candidateValue - draggedValue;
        guideY = { axis: 'y', value: candidateValue, from: Math.min(draggedBounds.minX, bounds.minX), to: Math.max(draggedBounds.maxX, bounds.maxX) };
      }
    }
  }

  const guides: AlignmentGuide[] = [];
  if (guideX) guides.push(guideX);
  if (guideY) guides.push(guideY);
  return { point: { x: rawPoint.x + bestDx, y: rawPoint.y + bestDy }, guides };
}

/**
 * World-space bounds of a stamp not yet placed (the placement-preview ghost), given the
 * center it would land at — same corner/rotation math as SketchScene's private
 * stampCornersWorld, but against a candidate center instead of an already-placed
 * PlacedStamp, since the ghost has no id/state entry to look up bounds for.
 */
export function computeStampBoundsWorld(center: Vec2, nativeWidth: number, nativeHeight: number, scale: number, rotationDegrees: number): Bounds {
  const halfWidth = (nativeWidth / 2) * scale;
  const halfHeight = (nativeHeight / 2) * scale;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((local) => {
    const r = rotationDegrees === 0 ? local : rotatePointAround(local, { x: 0, y: 0 }, rotationDegrees);
    return { x: r.x + center.x, y: r.y + center.y };
  });
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

function candidateRefs(state: DrawingState, excludeIds: ReadonlySet<string>): SelectableRef[] {
  const refs: SelectableRef[] = [];
  for (const id of Object.keys(state.stamps)) if (!excludeIds.has(id)) refs.push({ kind: 'stamp', id });
  for (const id of Object.keys(state.fittings)) if (!excludeIds.has(id)) refs.push({ kind: 'fitting', id });
  for (const id of Object.keys(state.annotations)) if (!excludeIds.has(id)) refs.push({ kind: 'annotation', id });
  return refs;
}
