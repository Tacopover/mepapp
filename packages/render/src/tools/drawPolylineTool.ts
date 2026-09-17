import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_SCREEN_PX = 6;

/**
 * Click-to-draw polyline tool: each click adds a vertex, a double-click finishes the
 * shape. Chromium leaves PointerEvent.detail at 0 on every 'pointerdown' regardless of
 * click count, so double-clicks are detected by hand: two pointerdowns close together in
 * time and screen position. Ported unchanged from scene.ts's onPointerDown/onPointerMove
 * draw-polyline branches.
 */
export class DrawPolylineTool implements Tool {
  readonly id = 'draw-polyline' as const;

  private pendingPoints: Vec2[] = [];
  /** Live cursor position while a polyline is pending — draws the rubber-band preview line to where the next vertex would land if clicked now. */
  private pendingCursor: Vec2 | null = null;
  private lastClickAt = 0;
  private lastClickScreen: Vec2 | null = null;

  getPendingVertices(): Vec2[] {
    return this.pendingPoints;
  }

  getPendingCursor(): Vec2 | null {
    return this.pendingCursor;
  }

  onPointerDown(ctx: ToolContext, _event: unknown, world: Vec2, screen: Vec2): void {
    const now = performance.now();
    const isDoubleClick =
      this.lastClickScreen !== null &&
      now - this.lastClickAt <= DOUBLE_CLICK_MS &&
      Math.hypot(screen.x - this.lastClickScreen.x, screen.y - this.lastClickScreen.y) <= DOUBLE_CLICK_SCREEN_PX;
    this.lastClickAt = now;
    this.lastClickScreen = screen;
    if (isDoubleClick) {
      // The first click of this double-click already added its vertex below on the
      // previous pointerdown — this one only ever closes the shape out.
      if (this.pendingPoints.length >= 2) {
        const annotation: Annotation = {
          id: `annotation-${ctx.doc.nextAnnotationSeq++}`,
          pageIndex: 0,
          geometry: { kind: 'polyline', points: this.pendingPoints },
        };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
      }
      this.pendingPoints = [];
      this.pendingCursor = null;
      this.lastClickScreen = null;
      ctx.redrawOverlay();
      return;
    }
    this.pendingPoints.push(world);
    this.pendingCursor = world;
    ctx.redrawOverlay();
  }

  onPointerMoveIdle(ctx: ToolContext, _event: unknown, world: Vec2): void {
    if (this.pendingPoints.length === 0) return;
    this.pendingCursor = world;
    ctx.redrawOverlay();
  }

  onDeactivate(): void {
    this.pendingPoints = [];
    this.pendingCursor = null;
    this.lastClickScreen = null;
  }
}
