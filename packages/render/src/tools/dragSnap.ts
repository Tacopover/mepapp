import type { Vec2 } from '@mepapp/core';
import { computeStampBoundsWorld, resolveAlignmentSnap, type AlignmentGuide } from './alignmentGuides.js';
import { resolveAngleSnap } from './angleSnap.js';
import type { ToolContext } from './types.js';

export interface DragSnapContext {
  ctx: ToolContext;
  /** Which gesture is calling — a DragState['kind'] for the five drag-based branches, or a tool-specific label (e.g. 'draw-segment') for a click-based one. */
  kind: string;
  /** World-space point angle-snap measures its heading from (a segment's pending start). Undefined when there's nothing to measure an angle from yet (the first click of a chain) — angle-snap is skipped in that case. */
  anchor?: Vec2;
  /** Pointer event's Shift state — angle-snap reads this to decide whether to apply: Shift *disables* the constraint for the current drag, matching this app's existing rotate-handle convention. */
  shiftKey?: boolean;
}

export interface SnappedPoint {
  point: Vec2;
  /** Alignment guide line(s) to render for the current frame — only populated for 'move-selection' and 'place-stamp'; every other kind gets an empty array. */
  guides: AlignmentGuide[];
}

/**
 * Adjusts a raw world-space point derived from the pointer, before a tool applies it to
 * geometry — the shared seam for snap-to-object alignment guides (move-selection,
 * place-stamp) and angle-snap-while-drawing-segments (draw-segment). Every other call
 * site gets back the point unchanged and an empty guides list.
 */
export function resolveSnappedPoint(rawWorldPoint: Vec2, context: DragSnapContext): SnappedPoint {
  if (context.kind === 'draw-segment') {
    if (!context.anchor || context.shiftKey) return { point: rawWorldPoint, guides: [] };
    return { point: resolveAngleSnap(context.anchor, rawWorldPoint, context.ctx.getAngleSnapDegrees()), guides: [] };
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
    return resolveAlignmentSnap(context.ctx, state, rawWorldPoint, draggedBounds, excludeIds, drag.selectionBoundsAtStart);
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
