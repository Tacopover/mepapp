import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

/**
 * The 'draw-freehand' tool: pointerdown starts the stroke, every pointermove appends the
 * raw world point, pointerup commits the whole stroke as a single annotation (so undo is
 * one step, never one step per point). Not one of the six planned snap-hook branches —
 * points are stored as-is, no resolveSnappedPoint call. Ported unchanged from scene.ts's
 * onPointerDown/onPointerMove/onPointerUp 'draw-freehand' cases.
 */
export class DrawFreehandTool implements Tool {
  readonly id = 'draw-freehand' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    ctx.drag = { kind: 'draw-freehand', points: [world] };
    ctx.redrawOverlay();
  }

  dragKinds: Tool['dragKinds'] = {
    'draw-freehand': {
      onMove: (ctx, _event, world) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-freehand') return;
        ctx.drag = { ...drag, points: [...drag.points, world] };
        ctx.redrawOverlay();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'draw-freehand' || drag.points.length < 2) return;
        const annotation: Annotation = { id: `annotation-${ctx.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: 'freehand', points: drag.points } };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
      },
    },
  };
}
