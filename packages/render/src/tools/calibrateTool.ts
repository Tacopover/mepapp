import type { FederatedPointerEvent } from 'pixi.js';
import { calibrateFromKnownDistance, type Vec2 } from '@mepapp/core';
import { resolveLineSnap, type SnapLineHighlight } from './lineSnap.js';
import type { Tool, ToolContext } from './types.js';

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
  private snapLine: SnapLineHighlight | null = null;

  getPreview(): Vec2 | null {
    return this.preview;
  }

  getSnapLine(): SnapLineHighlight | null {
    return this.snapLine;
  }

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const { point } = resolveLineSnap(ctx, world, event.shiftKey, 'orthogonal');
    const pendingPoints = [...ctx.getPendingPoints(), point];
    if (pendingPoints.length === 2 && pendingPoints[0].x === point.x && pendingPoints[0].y === point.y) return;
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
    const { point, snapLine } = resolveLineSnap(ctx, world, event.shiftKey, 'orthogonal');
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
}
