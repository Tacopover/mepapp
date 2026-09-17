import type { FederatedPointerEvent } from 'pixi.js';
import type { Annotation, Vec2 } from '@mepapp/core';
import { createAnnotationCommand } from '../drawingCommands.js';
import type { Tool, ToolContext } from './types.js';

export class DrawStickyNoteTool implements Tool {
  readonly id = 'draw-sticky-note' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2, screen: Vec2): void {
    // Same floating-textarea event draw-textbox uses — a point instead of a rect is the only difference.
    ctx.emit('textboxRequested', screen, '', (text: string | null) => {
      const trimmed = text?.trim();
      if (trimmed) {
        const annotation: Annotation = {
          id: `annotation-${ctx.doc.nextAnnotationSeq++}`,
          pageIndex: 0,
          geometry: { kind: 'stickyNote', position: world, text: trimmed },
        };
        ctx.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        ctx.syncDrawingLayer();
        ctx.markDirty();
        ctx.setTool('select'); // one-shot, matching placeStamp/draw-textbox's revert-after-place convention
      }
      ctx.redrawOverlay();
    });
  }
}
