import type { FederatedPointerEvent } from 'pixi.js';
import type { Vec2 } from '@mepapp/core';
import type { Tool, ToolContext } from './types.js';

/** Click-to-fill room tool: a click inside a closed area makes a room of that area. The work is in SketchScene.fillRoomAtPoint. */
export class FillRoomTool implements Tool {
  readonly id = 'fill-room' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    ctx.fillRoomAtPoint(world);
  }
}
