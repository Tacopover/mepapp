import type { FederatedPointerEvent } from 'pixi.js';
import {
  CompositeCommand,
  getStampPorts,
  resolveSegmentEndpoint,
  splitSegmentAtFitting,
  SYNTHETIC_CENTER_PORT_ID,
  type Command,
  type ConnectionPoint,
  type Fitting,
  type PlacedStamp,
  type Segment,
  type Vec2,
} from '@mepapp/core';
import type { DrawingState } from '../document.js';
import { createFittingCommand, createSegmentCommand, deleteSegmentCommand } from '../drawingCommands.js';
import { resolveSnappedPoint } from './dragSnap.js';
import type { Tool, ToolContext } from './types.js';

export interface DrawEndpointResolution {
  point: Segment['endpointA'];
  worldPosition: Vec2;
  /** Present when resolving this endpoint requires new state (a bare new fitting, or breaking an existing segment) — bundled into the draw's single undo step rather than applied on its own. */
  setupCommand?: Command<DrawingState>;
}

/**
 * Click-to-draw segment tool: the first click resolves and remembers a start endpoint
 * (without mutating anything yet — see DrawEndpointResolution), the next click resolves
 * the end endpoint and applies both endpoints' setup plus the new segment as one
 * CompositeCommand, so each individual segment is always exactly one undo step. After
 * committing, the run chains on automatically: connecting to a fitting or an Equipment's
 * port re-arms the pending start from the endpoint just placed, so the very next click
 * continues the run; connecting to a Terminal's port ends the chain (an end-use device,
 * not a pass-through node). Escape cancels an in-progress chain early. Ported unchanged
 * from scene.ts's onDrawSegmentClick/resolveDrawTarget/chainContinuationFrom.
 */
export class DrawSegmentTool implements Tool {
  readonly id = 'draw-segment' as const;

  private pendingStart: DrawEndpointResolution | null = null;
  /** Live cursor position while a segment's start point is pending — draws the rubber-band preview line to where the segment would land if clicked now. */
  private pendingCursor: Vec2 | null = null;
  /** Id of the most recently committed segment in the chain currently being drawn — governs fitting visibility alongside the current selection. Cleared whenever the chain stops being "in progress": natural end, Escape-finish, or switching tools. */
  private activeChainAnchorId: string | null = null;

  getPendingStart(): DrawEndpointResolution | null {
    return this.pendingStart;
  }

  getPendingCursor(): Vec2 | null {
    return this.pendingCursor;
  }

  getActiveChainAnchorId(): string | null {
    return this.activeChainAnchorId;
  }

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    this.onDrawSegmentClick(ctx, world, event.shiftKey);
  }

  onPointerMoveIdle(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    if (!this.pendingStart) return;
    const { point } = resolveSnappedPoint(world, { ctx, kind: 'draw-segment', anchor: this.pendingStart.worldPosition, shiftKey: event.shiftKey });
    this.pendingCursor = point;
    ctx.redrawOverlay();
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (this.pendingStart) {
      this.pendingStart = null;
      this.pendingCursor = null;
      this.activeChainAnchorId = null;
      ctx.syncDrawingLayer();
      ctx.redrawOverlay();
      return true;
    }
    ctx.setTool('select');
    return true;
  }

  onDeactivate(): void {
    this.pendingStart = null;
    this.pendingCursor = null;
    this.activeChainAnchorId = null;
  }

  private onDrawSegmentClick(ctx: ToolContext, world: Vec2, shiftKey: boolean): void {
    const snapRadius = ctx.getSnapRadiusScreenPx() / ctx.getZoomScale();
    const state = ctx.doc.drawingHistory.getState();
    const stamps = Object.values(state.stamps);
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);

    const { point: snappedWorld } = resolveSnappedPoint(world, { ctx, kind: 'draw-segment', anchor: this.pendingStart?.worldPosition, shiftKey });
    const target = resolveSegmentEndpoint(snappedWorld, stamps, fittings, segments, { radius: snapRadius });
    const resolved = this.resolveDrawTarget(ctx, target);

    if (!this.pendingStart) {
      this.pendingStart = resolved;
      ctx.redrawOverlay();
      return;
    }

    const start = this.pendingStart;
    this.pendingStart = null;

    const newSegment: Segment = {
      id: `segment-${ctx.doc.nextSegmentSeq++}`,
      pageIndex: 0,
      networkTypeId: ctx.getActiveNetworkTypeId(),
      shape: 'round',
      diameter: 200,
      endpointA: start.point,
      endpointB: resolved.point,
      geometry: [start.worldPosition, resolved.worldPosition],
    };

    const subCommands: Command<DrawingState>[] = [];
    if (start.setupCommand) subCommands.push(start.setupCommand);
    if (resolved.setupCommand) subCommands.push(resolved.setupCommand);
    subCommands.push(createSegmentCommand(newSegment));

    ctx.doc.drawingHistory.execute(new CompositeCommand('Draw segment', subCommands));
    this.pendingStart = this.chainContinuationFrom(resolved, state.stamps);
    this.pendingCursor = null;
    this.activeChainAnchorId = this.pendingStart ? newSegment.id : null;
    ctx.syncDrawingLayer();
    ctx.markDirty();
    ctx.redrawOverlay();
  }

  /** Whether a just-placed segment endpoint continues the chain: a bare fitting always continues; a stamp's port continues only for Equipment (a pass-through node), not Terminal (an end-use device that should end the run). */
  private chainContinuationFrom(resolved: DrawEndpointResolution, stamps: Record<string, PlacedStamp>): DrawEndpointResolution | null {
    if (resolved.point.kind === 'fitting') return resolved;
    const stamp = stamps[resolved.point.elementId];
    return stamp?.category === 'equipment' ? resolved : null;
  }

  private resolveDrawTarget(ctx: ToolContext, target: ReturnType<typeof resolveSegmentEndpoint>): DrawEndpointResolution {
    if (target.kind === 'existing') {
      return { point: target.point, worldPosition: target.worldPosition };
    }

    if (target.kind === 'new-fitting') {
      const fitting: Fitting = { id: `fitting-${ctx.doc.nextFittingSeq++}`, pageIndex: 0, position: target.worldPosition, kind: 'junction' };
      return {
        point: { kind: 'fitting', fittingId: fitting.id },
        worldPosition: target.worldPosition,
        setupCommand: createFittingCommand(fitting),
      };
    }

    // target.kind === 'break': auto-generates a junction at the click point on an existing run.
    const newFitting: Fitting = {
      id: `fitting-${ctx.doc.nextFittingSeq++}`,
      pageIndex: target.original.pageIndex,
      position: target.breakPoint,
      kind: 'junction',
    };
    const { segmentA, segmentB } = splitSegmentAtFitting(target.original, newFitting, target.breakPoint, {
      segmentA: `segment-${ctx.doc.nextSegmentSeq++}`,
      segmentB: `segment-${ctx.doc.nextSegmentSeq++}`,
    });
    const setupCommand = new CompositeCommand(`Break segment ${target.original.id} into a junction`, [
      deleteSegmentCommand(target.original),
      createFittingCommand(newFitting),
      createSegmentCommand(segmentA),
      createSegmentCommand(segmentB),
    ]);
    return { point: { kind: 'fitting', fittingId: newFitting.id }, worldPosition: target.breakPoint, setupCommand };
  }

  /** Right-click "Draw from" menu's item text — names the specific port when the target is a real authored one, otherwise the generic "Draw from" (bare fitting, or a stamp's synthetic center point). */
  drawFromMenuLabel(point: ConnectionPoint, state: DrawingState): string {
    if (point.kind === 'fitting' || point.portId === SYNTHETIC_CENTER_PORT_ID) return 'Draw from';
    const stamp = state.stamps[point.elementId];
    const port = stamp && getStampPorts(stamp).find((p) => p.id === point.portId);
    return port ? `Draw from Port: ${port.name}` : 'Draw from';
  }

  /**
   * Arms the pending start from an already-existing port/fitting (the right-click "Draw
   * from" menu's action) without creating anything new — unlike resolveDrawTarget's
   * 'new-fitting'/'break' cases, this always targets an element that's already there, so
   * there's no setupCommand to bundle. Switches into draw-segment with the start already
   * pending, so the very next canvas click finishes the segment through
   * onDrawSegmentClick's existing second-click path.
   */
  armStartFromTarget(ctx: ToolContext, point: ConnectionPoint, worldPosition: Vec2): void {
    this.activeChainAnchorId = null;
    this.pendingStart = { point, worldPosition };
    this.pendingCursor = null;
    ctx.syncDrawingLayer();
    ctx.redrawOverlay();
  }
}
