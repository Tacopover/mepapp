import { snapAngle, snapOrthogonal, snapToNearestLine, type Vec2 } from '@mepapp/core';
import type { ToolContext } from './types.js';

/** A PDF line a point is currently snapped to, for redrawOverlay to highlight. */
export interface SnapLineHighlight {
  from: Vec2;
  to: Vec2;
}

export interface LineSnapResult {
  point: Vec2;
  snapLine: SnapLineHighlight | null;
}

/**
 * The two-click tools' shared snapping (calibrate, measure): the first point snaps to the
 * nearest PDF line; the second is locked to a heading from the first — orthogonal, or a
 * multiple of `angleDegrees` — then snaps to the PDF line crossing that heading. With Shift
 * held the heading lock is off and the second point snaps like the first.
 */
export function resolveLineSnap(ctx: ToolContext, world: Vec2, shiftKey: boolean, constraint: 'orthogonal' | { angleDegrees: number }): LineSnapResult {
  const lines = ctx.getSnapLines();
  const radius = ctx.getSnapRadiusScreenPx() / ctx.getZoomScale();
  const [anchor] = ctx.getPendingPoints();
  const lineAt = (index: number | null): SnapLineHighlight | null =>
    lines && index !== null ? { from: { x: lines[4 * index], y: lines[4 * index + 1] }, to: { x: lines[4 * index + 2], y: lines[4 * index + 3] } } : null;

  if (anchor && !shiftKey) {
    const snap = constraint === 'orthogonal' ? snapOrthogonal(anchor, world, lines, radius) : snapAngle(anchor, world, lines, radius, constraint.angleDegrees);
    return { point: snap.point, snapLine: lineAt(snap.lineIndex) };
  }
  const snap = lines ? snapToNearestLine(world, lines, radius) : null;
  return snap ? { point: snap.point, snapLine: lineAt(snap.lineIndex) } : { point: world, snapLine: null };
}
