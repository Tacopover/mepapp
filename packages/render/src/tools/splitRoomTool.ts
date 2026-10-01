import type { FederatedPointerEvent } from 'pixi.js';
import type { Vec2 } from '@mepapp/core';
import type { Tool, ToolContext } from './types.js';

/** Two clicks draw a cut line; the room under the line is split in two along it. */
export class SplitRoomTool implements Tool {
  readonly id = 'split-room' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    const points = [...ctx.getPendingPoints(), world];
    if (points.length < 2) {
      ctx.setPendingPoints(points);
    } else {
      ctx.setPendingPoints([]);
      ctx.splitRoomByLine(points[0]!, points[1]!);
    }
    ctx.redrawOverlay();
  }
}
