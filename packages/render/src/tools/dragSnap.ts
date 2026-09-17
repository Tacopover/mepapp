import type { Vec2 } from '@mepapp/core';
import type { ToolContext } from './types.js';

export interface DragSnapContext {
  ctx: ToolContext;
  /** Which gesture is calling — a DragState['kind'] for the five drag-based branches, or a tool-specific label (e.g. 'draw-segment') for a click-based one. Informational only until snap-to-object/angle-snap logic reads it. */
  kind: string;
}

/**
 * Adjusts a raw world-space point derived from the pointer, before a tool applies it to
 * geometry — the shared seam for the planned snap-to-object alignment guides and
 * angle-snap-while-drawing-segments features. Pass-through until those land; every call
 * site threads its raw pointer world point through here rather than using it directly, so
 * those features become one change here instead of edits scattered across six branches.
 */
export function resolveSnappedPoint(rawWorldPoint: Vec2, _context: DragSnapContext): Vec2 {
  return rawWorldPoint;
}
