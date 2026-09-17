import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

// Placeholder rect size in PDF points (a textbox has no drag-to-size gesture, just a click) — matches DEFAULT_TEXTBOX_WIDTH_PT/DEFAULT_TEXTBOX_HEIGHT_PT in scene.ts.
const DEFAULT_TEXTBOX_WIDTH_PT = 160;
const DEFAULT_TEXTBOX_HEIGHT_PT = 40;

export class DrawTextboxTool implements Tool {
  readonly id = 'draw-textbox' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2, screen: Vec2): void {
    ctx.emit('textboxRequested', screen, '', (text: string | null) => {
      const trimmed = text?.trim();
      if (trimmed) {
        const annotation: Annotation = {
          id: `annotation-${ctx.doc.nextAnnotationSeq++}`,
          pageIndex: 0,
          geometry: { kind: 'textbox', rect: { x0: world.x, y0: world.y, x1: world.x + DEFAULT_TEXTBOX_WIDTH_PT, y1: world.y + DEFAULT_TEXTBOX_HEIGHT_PT }, text: trimmed, rotationDegrees: 0 },
        };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
        ctx.setTool('select'); // one-shot, matching placeStamp's revert-after-place convention
      }
      ctx.redrawOverlay();
    });
  }
}
