import type { Vec2 } from '@mepapp/core';
import type { CircuitToolHover, Tool, ToolContext } from './types.js';

/**
 * Click-a-panel tool (electrical-circuits-model.md Phase E4), ported from the old app's
 * CircuitSelectionTool SelectPanel mode. A click on a panel's equipment stamp assigns the
 * circuit to it; a click on plain equipment converts it to a panel first, in the same undo step
 * (SketchScene.assignCircuitToPanelStamp). One click ends the tool. The circuit is scene state,
 * see SketchScene.beginAssignPanelToCircuit.
 */
export class AssignPanelTool implements Tool {
  readonly id = 'circuit-assign-panel' as const;

  onPointerDown(ctx: ToolContext, _event: unknown, world: Vec2): void {
    const circuitId = ctx.getCircuitToolTarget();
    if (!circuitId) return;
    const hit = ctx.hitTest(world);
    if (!hit || hit.kind !== 'stamp') return;
    ctx.assignCircuitToPanelStamp(circuitId, hit.id);
  }

  onPointerMoveIdle(ctx: ToolContext, _event: unknown, world: Vec2): void {
    const hit = ctx.getCircuitToolTarget() ? ctx.hitTest(world) : null;
    ctx.setCircuitToolHover(hit && hit.kind === 'stamp' ? this.hoverFor(ctx, hit.id) : null);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    ctx.leaveCircuitTool();
    return true;
  }

  /** Null for anything that is not an equipment stamp, so a terminal reads as not clickable. */
  private hoverFor(ctx: ToolContext, stampId: string): CircuitToolHover | null {
    const state = ctx.doc.drawingHistory.getState();
    if (state.stamps[stampId]?.category !== 'equipment') return null;
    const isPanel = Object.values(state.panels).some((p) => p.equipmentStampId === stampId);
    return { stampId, status: isPanel ? 'panel' : 'equipment' };
  }
}
