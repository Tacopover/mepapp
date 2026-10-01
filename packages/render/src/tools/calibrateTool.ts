import type { FederatedPointerEvent } from 'pixi.js';
import { calibrateFromKnownDistance, snapOrthogonal, snapToNearestLine, type Vec2 } from '@mepapp/core';
import type { Tool, ToolContext } from './types.js';

/** A PDF line the calibration cursor is currently snapped to, for redrawOverlay to highlight. */
export interface CalibrateSnapLine {
  from: Vec2;
  to: Vec2;
}

/**
 * Click-to-calibrate tool: two clicks capture a known-distance segment, then prompts for
 * its real-world length via the 'calibrationNeeded' event before setting the document's
 * calibration. Both points snap to the PDF's own vector lines (see ToolContext.getSnapLines).
 * The second point is also locked orthogonal (horizontal/vertical) to the first, unless Shift
 * is held, and then snaps to the nearest PDF line crossing that ray.
 */
export class CalibrateTool implements Tool {
  readonly id = 'calibrate' as const;

  /** Where the next click would land — drawn as the preview point. Null until the pointer has moved. */
  private preview: Vec2 | null = null;
  private snapLine: CalibrateSnapLine | null = null;

  getPreview(): Vec2 | null {
    return this.preview;
  }

  getSnapLine(): CalibrateSnapLine | null {
    return this.snapLine;
  }

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const { point } = this.resolve(ctx, world, event.shiftKey);
    const pendingPoints = [...ctx.getPendingPoints(), point];
    ctx.setPendingPoints(pendingPoints);
    this.preview = null;
    this.snapLine = null;
    if (pendingPoints.length === 2) {
      const [p1, p2] = pendingPoints;
      ctx.setPendingPoints([]);
      ctx.emit('calibrationNeeded', p1, p2, (mm: number | null) => {
        if (mm !== null && mm > 0) {
          ctx.doc.calibration = calibrateFromKnownDistance(p1, p2, mm);
          ctx.emit('calibrationSet', ctx.doc.calibration);
          ctx.setTool('select');
        }
        ctx.redrawOverlay();
      });
    }
    ctx.redrawOverlay();
  }

  onPointerMoveIdle(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const { point, snapLine } = this.resolve(ctx, world, event.shiftKey);
    this.preview = point;
    this.snapLine = snapLine;
    ctx.redrawOverlay();
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (ctx.getPendingPoints().length > 0) {
      ctx.setPendingPoints([]);
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
  }

  private resolve(ctx: ToolContext, world: Vec2, shiftKey: boolean): { point: Vec2; snapLine: CalibrateSnapLine | null } {
    const lines = ctx.getSnapLines();
    const radius = ctx.getSnapRadiusScreenPx() / ctx.getZoomScale();
    const [anchor] = ctx.getPendingPoints();
    const lineAt = (index: number): CalibrateSnapLine | null =>
      lines ? { from: { x: lines[4 * index], y: lines[4 * index + 1] }, to: { x: lines[4 * index + 2], y: lines[4 * index + 3] } } : null;

    if (anchor && !shiftKey) {
      const snap = snapOrthogonal(anchor, world, lines, radius);
      return { point: snap.point, snapLine: snap.lineIndex === null ? null : lineAt(snap.lineIndex) };
    }
    const snap = lines ? snapToNearestLine(world, lines, radius) : null;
    return snap ? { point: snap.point, snapLine: lineAt(snap.lineIndex) } : { point: world, snapLine: null };
  }
}
