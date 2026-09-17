import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, AnnotationGeometry, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import { resolveSnappedPoint } from './dragSnap.js';
import type { Tool, ToolContext } from './types.js';

// A draw-shape drag shorter than this (screen px, zoom-independent) is treated as a stray
// click, not a zero-size rectangle/circle nobody meant to create — matches scene.ts's
// MIN_SHAPE_DRAG_SCREEN_PX constant of the same name.
const MIN_SHAPE_DRAG_SCREEN_PX = 3;

/**
 * The 'draw-shape' tool: plain drag draws a rectangle (opposite corners), Shift+drag draws
 * a circle (start point is the center, drag distance is the radius) — one tool covering
 * both shapes, disambiguated by shiftKey the same way rotate-selection uses it as a
 * modifier. Ported unchanged from scene.ts's onPointerDown/onPointerMove/onPointerUp
 * 'draw-shape' cases.
 */
export class DrawShapeTool implements Tool {
  readonly id = 'draw-shape' as const;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    ctx.drag = { kind: 'draw-shape', shapeKind: event.shiftKey ? 'circle' : 'rectangle', startWorld: world, currentWorld: world };
    ctx.redrawOverlay();
  }

  dragKinds: Tool['dragKinds'] = {
    'draw-shape': {
      onMove: (ctx, _event, rawWorld) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-shape') return;
        const world = resolveSnappedPoint(rawWorld, { ctx, kind: 'draw-shape' });
        ctx.drag = { ...drag, currentWorld: world };
        ctx.redrawOverlay();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-shape') return;
        const { shapeKind, startWorld, currentWorld } = drag;
        const dx = currentWorld.x - startWorld.x;
        const dy = currentWorld.y - startWorld.y;
        const dragScreenPx = Math.hypot(dx, dy) * ctx.getZoomScale();
        if (dragScreenPx < MIN_SHAPE_DRAG_SCREEN_PX) return;
        const geometry: AnnotationGeometry =
          shapeKind === 'circle'
            ? { kind: 'circle', center: startWorld, radius: Math.hypot(dx, dy) }
            : {
                kind: 'rectangle',
                rect: {
                  x0: Math.min(startWorld.x, currentWorld.x),
                  y0: Math.min(startWorld.y, currentWorld.y),
                  x1: Math.max(startWorld.x, currentWorld.x),
                  y1: Math.max(startWorld.y, currentWorld.y),
                },
              };
        const annotation: Annotation = { id: `annotation-${ctx.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
      },
    },
  };
}
