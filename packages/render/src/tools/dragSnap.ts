import type { Vec2 } from '@mepapp/core';
import { computeStampBoundsWorld, resolveAlignmentSnap, resolveRayAlignmentSnap, type AlignmentGuide } from './alignmentGuides.js';
import type { ToolContext } from './types.js';

export interface DragSnapContext {
  ctx: ToolContext;
  /** Which gesture is calling — a DragState['kind'] for the five drag-based branches, or a tool-specific label (e.g. 'draw-segment') for a click-based one. */
  kind: string;
  /** World-space point angle-snap measures its heading from (a segment's pending start). Undefined when there's nothing to measure an angle from yet (the first click of a chain) — angle-snap is skipped in that case, and the point only snaps to alignment guides. */
  anchor?: Vec2;
  /** Pointer event's Shift state — angle-snap reads this to decide whether to apply: Shift *disables* the constraint for the current drag, matching this app's existing rotate-handle convention. */
  shiftKey?: boolean;
}

export interface SnappedPoint {
  point: Vec2;
  /** Alignment guide line(s) to render for the current frame — only populated for 'move-selection', 'place-stamp' and 'draw-segment'; every other kind gets an empty array. */
  guides: AlignmentGuide[];
}

/**
 * Adjusts a raw world-space point derived from the pointer, before a tool applies it to
 * geometry — the shared seam for snap-to-object alignment guides (move-selection,
 * place-stamp, draw-segment) and angle-snap-while-drawing-segments (draw-segment). Every
 * other call site gets back the point unchanged and an empty guides list.
 */
export function resolveSnappedPoint(rawWorldPoint: Vec2, context: DragSnapContext): SnappedPoint {
  if (context.kind === 'draw-segment') {
    const state = context.ctx.doc.drawingHistory.getState();
    const angleSnapDegrees = context.ctx.getAngleSnapDegrees();
    if (context.anchor && !context.shiftKey && angleSnapDegrees > 0) {
      return resolveRayAlignmentSnap(context.ctx, state, context.anchor, rawWorldPoint, angleSnapDegrees);
    }
    // A start point, or an end point with angle-snap off (Shift): the cursor is a zero-size dragged box, so each axis snaps to its nearest guide and the point lands on the closest spot of it.
    const cursorBounds = { minX: rawWorldPoint.x, minY: rawWorldPoint.y, maxX: rawWorldPoint.x, maxY: rawWorldPoint.y };
    return resolveAlignmentSnap(context.ctx, state, rawWorldPoint, cursorBounds, new Set(), null, true);
  }

  if (context.kind === 'move-selection') {
    const drag = context.ctx.drag;
    if (drag.kind !== 'move-selection' || !drag.selectionBoundsAtStart) return { point: rawWorldPoint, guides: [] };
    const dx = rawWorldPoint.x - drag.startPointerWorld.x;
    const dy = rawWorldPoint.y - drag.startPointerWorld.y;
    const draggedBounds = {
      minX: drag.selectionBoundsAtStart.minX + dx,
      minY: drag.selectionBoundsAtStart.minY + dy,
      maxX: drag.selectionBoundsAtStart.maxX + dx,
      maxY: drag.selectionBoundsAtStart.maxY + dy,
    };
    const excludeIds = new Set<string>([...drag.snapshot.map((s) => s.id), ...Object.keys(drag.annotationSnapshot), ...Object.keys(drag.fittingSnapshot)]);
    const state = context.ctx.doc.drawingHistory.getState();
    const selectedIds = context.ctx.doc.selectedIds;
    const isLoneFitting = selectedIds.size === 1 && [...selectedIds].every((id) => state.fittings[id]);
    return resolveAlignmentSnap(context.ctx, state, rawWorldPoint, draggedBounds, excludeIds, drag.selectionBoundsAtStart, isLoneFitting);
  }

  if (context.kind === 'place-stamp') {
    const pending = context.ctx.getPendingStampTexture();
    if (!pending) return { point: rawWorldPoint, guides: [] };
    const draggedBounds = computeStampBoundsWorld(
      rawWorldPoint,
      pending.nativeWidth,
      pending.nativeHeight,
      pending.appearanceDefault?.scale ?? 1,
      context.ctx.getStampGhostRotationDegrees(),
    );
    const state = context.ctx.doc.drawingHistory.getState();
    return resolveAlignmentSnap(context.ctx, state, rawWorldPoint, draggedBounds, new Set());
  }

  return { point: rawWorldPoint, guides: [] };
}
