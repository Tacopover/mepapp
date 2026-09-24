import { findCircuitForTerminal, type Vec2 } from '@mepapp/core';
import type { CircuitToolHover, Tool, ToolContext } from './types.js';

/**
 * Click-terminals-to-fill-a-circuit tool (electrical-circuits-model.md Phase E2), ported from the
 * old app's CircuitSelectionTool AddTerminals mode with one deliberate change: a terminal that
 * already belongs to another circuit is moved, not rejected. The circuit being filled is scene
 * state (see SketchScene.beginAddTerminalsToCircuit), reached through `ToolContext`. Never
 * touches the canvas selection: circuit selection and canvas selection are mutually exclusive
 * app-side, and this tool runs with a circuit selected.
 */
export class AddToCircuitTool implements Tool {
  readonly id = 'circuit-add-terminals' as const;

  onPointerDown(ctx: ToolContext, _event: unknown, world: Vec2): void {
    const circuitId = ctx.getCircuitToolTarget();
    if (!circuitId) return;
    const hit = ctx.hitTest(world);
    if (!hit || hit.kind !== 'stamp') return;
    ctx.assignTerminalToCircuit(circuitId, hit.id);
    ctx.setCircuitToolHover(this.hoverFor(ctx, circuitId, hit.id));
  }

  onPointerMoveIdle(ctx: ToolContext, _event: unknown, world: Vec2): void {
    const circuitId = ctx.getCircuitToolTarget();
    const hit = circuitId ? ctx.hitTest(world) : null;
    ctx.setCircuitToolHover(circuitId && hit && hit.kind === 'stamp' ? this.hoverFor(ctx, circuitId, hit.id) : null);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    ctx.leaveCircuitTool();
    return true;
  }

  /** Null for anything that is not a terminal stamp (equipment gets no highlight, so it reads as not clickable). */
  private hoverFor(ctx: ToolContext, circuitId: string, stampId: string): CircuitToolHover | null {
    const state = ctx.doc.drawingHistory.getState();
    if (state.stamps[stampId]?.category !== 'terminal') return null;
    const current = findCircuitForTerminal(Object.values(state.circuits), stampId);
    return { stampId, status: !current ? 'free' : current.id === circuitId ? 'member' : 'move' };
  }
}
