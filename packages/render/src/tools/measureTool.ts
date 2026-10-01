import type { FederatedPointerEvent } from 'pixi.js';
import { measureRealDistance, type Vec2 } from '@mepapp/core';
import { resolveLineSnap, type SnapLineHighlight } from './lineSnap.js';
import type { Tool, ToolContext } from './types.js';

const MEASURE_ANGLE_STEP_DEGREES = 45;

/** The temporary dimension line left on the canvas after a measurement. */
export interface MeasureDimension {
  from: Vec2;
  to: Vec2;
  distanceMm: number;
}

/**
 * Click-to-measure tool: two clicks capture a segment and emit its real-world distance,
 * using the document's existing calibration. Warns instead of measuring when no
 * calibration has been set yet. Both points snap to the PDF's vector lines like the
 * calibrate tool; the second point also locks to 45° headings from the first (Shift frees
 * it). The finished measurement stays on the canvas as a temporary dimension line until the
 * next measurement starts, Escape is pressed, or another tool is chosen.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure' as const;

  private preview: Vec2 | null = null;
  private snapLine: SnapLineHighlight | null = null;
  private dimension: MeasureDimension | null = null;

  getPreview(): Vec2 | null {
    return this.preview;
  }

  getSnapLine(): SnapLineHighlight | null {
    return this.snapLine;
  }

  getDimension(): MeasureDimension | null {
    return this.dimension;
  }

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const { point } = resolveLineSnap(ctx, world, event.shiftKey, { angleDegrees: MEASURE_ANGLE_STEP_DEGREES });
    this.dimension = null;
    this.preview = null;
    this.snapLine = null;
    const pendingPoints = [...ctx.getPendingPoints(), point];
    ctx.setPendingPoints(pendingPoints);
    if (pendingPoints.length === 2) {
      const [p1, p2] = pendingPoints;
      ctx.setPendingPoints([]);
      if (ctx.doc.calibration) {
        const distanceMm = measureRealDistance(p1, p2, ctx.doc.calibration);
        this.dimension = { from: p1, to: p2, distanceMm };
        ctx.emit('measurement', distanceMm);
      } else {
        console.warn('[render] measure tool used with no calibration set yet.');
      }
    }
    ctx.redrawOverlay();
  }

  onPointerMoveIdle(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const { point, snapLine } = resolveLineSnap(ctx, world, event.shiftKey, { angleDegrees: MEASURE_ANGLE_STEP_DEGREES });
    this.preview = point;
    this.snapLine = snapLine;
    ctx.redrawOverlay();
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (ctx.getPendingPoints().length > 0 || this.dimension) {
      ctx.setPendingPoints([]);
      this.dimension = null;
      this.snapLine = null;
      ctx.redrawOverlay();
    } else {
      ctx.setTool('select');
    }
    return true;
  }

  onDeactivate(): void {
    this.preview = null;
    this.snapLine = null;
    this.dimension = null;
  }
}
