import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

// A draw-highlight drag shorter than this (screen px, zoom-independent) is treated as a
// stray click, not a zero-size highlight nobody meant to create — matches scene.ts's
// MIN_SHAPE_DRAG_SCREEN_PX constant of the same name.
const MIN_SHAPE_DRAG_SCREEN_PX = 3;

/**
 * The 'draw-highlight' tool: drag draws a rectangle marking a highlighted region. Not one
 * of the six planned snap-hook branches — the dragged point is stored as-is, no
 * resolveSnappedPoint call. Ported unchanged from scene.ts's
 * onPointerDown/onPointerMove/onPointerUp 'draw-highlight' cases.
 */
export class DrawHighlightTool implements Tool {
  readonly id = 'draw-highlight' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    ctx.drag = { kind: 'draw-highlight', startWorld: world, currentWorld: world };
    ctx.redrawOverlay();
  }

  dragKinds: Tool['dragKinds'] = {
    'draw-highlight': {
      onMove: (ctx, _event, world) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-highlight') return;
        ctx.drag = { ...drag, currentWorld: world };
        ctx.redrawOverlay();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-highlight') return;
        const { startWorld, currentWorld } = drag;
        const dragScreenPx = Math.hypot(currentWorld.x - startWorld.x, currentWorld.y - startWorld.y) * ctx.getZoomScale();
        if (dragScreenPx < MIN_SHAPE_DRAG_SCREEN_PX) return;
        const rect = {
          x0: Math.min(startWorld.x, currentWorld.x),
          y0: Math.min(startWorld.y, currentWorld.y),
          x1: Math.max(startWorld.x, currentWorld.x),
          y1: Math.max(startWorld.y, currentWorld.y),
        };
        const annotation: Annotation = { id: `annotation-${ctx.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: 'highlight', rect } };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
      },
    },
  };
}
