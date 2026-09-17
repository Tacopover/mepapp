import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

/**
 * Click-to-draw line/arrow tool: plain two-click draws a line, Shift+(either click) draws
 * an arrow — pdf-engine already models arrow as the same {from,to} shape as line. Ported
 * unchanged from scene.ts's onPointerDown 'draw-line' branch.
 */
export class DrawLineTool implements Tool {
  readonly id = 'draw-line' as const;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    // Plain two-click = line; Shift+(either click) = arrow.
    const isArrow = event.shiftKey;
    const pendingPoints = [...ctx.getPendingPoints(), world];
    ctx.setPendingPoints(pendingPoints);
    if (pendingPoints.length === 2) {
      const [from, to] = pendingPoints;
      ctx.setPendingPoints([]);
      const annotation: Annotation = { id: `annotation-${ctx.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: isArrow ? 'arrow' : 'line', from, to } };
      ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
      ctx.syncDrawingLayer();
      ctx.markDirty();
    }
    ctx.redrawOverlay();
  }
}
