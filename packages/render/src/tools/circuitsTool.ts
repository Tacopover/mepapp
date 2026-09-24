import type { FederatedPointerEvent } from 'pixi.js';
import type { Vec2 } from '@mepapp/core';
import type { SelectTool } from './selectTool.js';
import type { Tool, ToolContext } from './types.js';

/**
 * Circuits mode (electrical-circuits-model.md Phase E4): a select tool the Circuits toolbar
 * hangs off. Clicks, Shift-clicks and rubber bands select terminals and panels exactly as
 * 'select' does — this class delegates every pointer event to the same SelectTool instance, so a
 * drag that starts here finishes through SelectTool's own dragKinds (dispatched by drag kind, see
 * Tool.dragKinds). Escape leaves the mode.
 */
export class CircuitsTool implements Tool {
  readonly id = 'circuits' as const;

  constructor(private readonly select: SelectTool) {}

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    this.select.onPointerDown(ctx, event, world);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    ctx.setTool('select');
    return true;
  }
}
