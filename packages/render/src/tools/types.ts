import type { FederatedPointerEvent, Sprite, Texture } from 'pixi.js';
import type { AnnotationGeometry, ConnectionPoint, PlacedStamp, Transaction, Transform2D, Vec2 } from '@mepapp/core';
import type { AlignmentGuide } from './alignmentGuides.js';
import type { DrawingState, SketchDocument } from '../document.js';
import type { StampInfo, TerminalAssignmentResult } from '../scene.js';

/** A world-space axis-aligned bounding box. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type SketchTool =
  | 'select'
  | 'pan'
  | 'place-terminal'
  | 'place-equipment'
  | 'calibrate'
  | 'measure'
  | 'draw-segment'
  | 'draw-freehand'
  | 'draw-line'
  | 'draw-shape'
  | 'draw-textbox'
  | 'draw-sticky-note'
  | 'draw-highlight'
  | 'draw-polyline'
  | 'circuit-add-terminals';

/** The terminal the Add-to-Circuit tool's pointer is over, and what clicking it would do — 'free' joins the circuit, 'move' takes it out of another circuit first, 'member' is already in the target circuit. Drawn by SketchScene.redrawOverlay. */
export interface CircuitToolHover {
  stampId: string;
  status: 'free' | 'move' | 'member';
}

/** A selectable object is a placed stamp, a fitting, a drawn segment, or a drawn annotation — see ToolContext.hitTest. */
export type SelectableRef = { kind: 'stamp'; id: string } | { kind: 'fitting'; id: string } | { kind: 'segment'; id: string } | { kind: 'annotation'; id: string };

/** Original per-annotation geometry captured at gesture start, so move/rotate can recompute the whole gesture's delta from a fixed origin on every pointermove rather than drifting by accumulating per-frame deltas. */
export type AnnotationSnapshot = Record<string, AnnotationGeometry>;

export type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; startScreen: Vec2; startWorldPos: Vec2 }
  | {
      kind: 'move-selection';
      startPointerWorld: Vec2;
      /** Selected stamps' positions at gesture start (from ctx.getSelection(), so stamp-only) — the stamp counterpart to annotationSnapshot/fittingSnapshot below. */
      snapshot: Array<{ id: string; position: Vec2 }>;
      annotationSnapshot: AnnotationSnapshot;
      /** Fitting positions at gesture start, keyed by fitting id — the fitting counterpart to annotationSnapshot above. */
      fittingSnapshot: Record<string, Vec2>;
      /** Undoable transaction covering snapshot's/annotationSnapshot's/fittingSnapshot's moves, plus the cascaded recompute of any segment attached to a moved fitting — null when none of the three is present in the selection. */
      drawingTx: Transaction<DrawingState> | null;
      /** Set when this gesture began on an already-sole-selected textbox/stickyNote — a click with no drag reopens its text editor instead of committing a zero-length move. */
      reopenTextEditId: string | null;
      /** True once onPointerMove has actually applied a delta — a plain click never sets this, since a real pointermove never fires for zero on-screen movement. Gates whether onPointerUp commits anything. */
      moved: boolean;
      /** The selection's own bounds at gesture start, captured once — snap-to-object shifts this by the frame's raw delta rather than recomputing per-element every frame. Null when the selection has nothing with resolvable bounds. */
      selectionBoundsAtStart: Bounds | null;
      /** Alignment guide line(s) matched on the current frame, for redrawOverlay to draw — mutated in place each onMove, same pattern as `moved`. Empty when nothing is currently snapped. */
      guides: AlignmentGuide[];
    }
  | {
      kind: 'rotate-selection';
      pivot: Vec2;
      startPointerAngleDeg: number;
      /** Selected stamps' transforms at gesture start (from ctx.getSelection(), so stamp-only). */
      snapshot: Array<{ id: string; transform: Transform2D }>;
      annotationSnapshot: AnnotationSnapshot;
      /** Undoable transaction covering both snapshot's stamp rotations and annotationSnapshot's — null when neither is present in the selection. */
      drawingTx: Transaction<DrawingState> | null;
      moved: boolean;
    }
  | { kind: 'resize-rect'; id: string; corner: 'x0y0' | 'x1y0' | 'x1y1' | 'x0y1'; original: AnnotationGeometry; tx: Transaction<DrawingState>; moved: boolean }
  | { kind: 'resize-circle'; id: string; center: Vec2; tx: Transaction<DrawingState>; moved: boolean }
  | { kind: 'rubber-band'; startWorld: Vec2; currentWorld: Vec2; additive: boolean }
  | { kind: 'draw-freehand'; points: Vec2[] }
  | { kind: 'draw-shape'; shapeKind: 'rectangle' | 'circle'; startWorld: Vec2; currentWorld: Vec2 }
  | { kind: 'draw-highlight'; startWorld: Vec2; currentWorld: Vec2 };

/**
 * The seam between `SketchScene` (the thin coordinator) and each tool: shared scene
 * services and state a tool needs, without holding a `SketchScene` reference directly.
 * `SketchScene` builds one of these (getters/setters closing over itself) and passes it
 * to every tool call.
 */
export interface ToolContext {
  /** The active document — every per-document read/mutation goes through this, same as SketchScene's own `this.doc`. */
  readonly doc: SketchDocument;

  drag: DragState;

  setTool(tool: SketchTool): void;
  markDirty(): void;
  syncDrawingLayer(): void;
  redrawOverlay(): void;
  emit<K extends string>(event: K, ...args: unknown[]): void;
  /** Reopens the floating textarea for an already-placed textbox/stickyNote annotation — see SketchScene.openTextEditor. */
  openTextEditor(id: string): void;

  /** Current world scale (1 = 100%) — for converting screen-px thresholds (handle hit radius, min-drag distance) to world units. */
  getZoomScale(): number;

  hitTest(worldPoint: Vec2): SelectableRef | null;
  selectableRefForId(id: string, state: DrawingState): SelectableRef;
  resolveSelectableBoundsWorld(ref: SelectableRef, state: DrawingState): { minX: number; minY: number; maxX: number; maxY: number } | null;
  getResizeHandlesWorld(): Array<{ id: string; corner: 'x0y0' | 'x1y0' | 'x1y1' | 'x0y1'; position: Vec2 } | { id: string; role: 'radius'; position: Vec2 }>;
  getRotationHandleWorld(): Vec2 | null;

  /** Every currently-selected placed stamp, mapped to its read-model — see SketchScene.getSelection. Stamp-only, same scoping as the original. */
  getSelection(): StampInfo[];

  applyConnectivityCascade(state: DrawingState, changed: ConnectionPoint[]): DrawingState;
  stampPortConnectionPoints(ids: Iterable<string>, stamps: Record<string, PlacedStamp>): ConnectionPoint[];

  /** Shared two-click scratch used by calibrate/measure/draw-line — see the original's comment at their declaration site. */
  getPendingPoints(): Vec2[];
  setPendingPoints(points: Vec2[]): void;

  getActiveNetworkTypeId(): string;
  getSnapRadiusScreenPx(): number;
  /** Degrees a segment's heading snaps to while drawing (0/45/90° by default) — Settings-configurable, Shift disables it for the current drag. */
  getAngleSnapDegrees(): number;

  /** The stamp-placement preview sprite/state, shared across place-terminal/place-equipment — see SketchScene's stamp-ghost fields. */
  getPendingStampTexture(): {
    texture: Texture;
    nativeWidth: number;
    nativeHeight: number;
    definitionId?: string;
    appearanceDefault?: { color?: string; scale?: number };
  } | null;
  getStampGhostSprite(): Sprite | null;
  getStampGhostRotationDegrees(): number;
  setStampGhostRotationDegrees(degrees: number): void;
  /** The circuit the Add-to-Circuit tool is filling (SketchScene.beginAddTerminalsToCircuit), or null when that tool is not active. */
  getCircuitToolTarget(): string | null;
  setCircuitToolHover(hover: CircuitToolHover | null): void;
  /** Adds or moves a terminal into a circuit and raises the user-facing notice — see SketchScene.assignTerminalToCircuit. */
  assignTerminalToCircuit(circuitId: string, terminalId: string): TerminalAssignmentResult;

  /** Hides the ghost sprite, if one exists — leaving a place-* tool without resetting `pendingStampTexture` itself (a re-pick, not a tool switch, is what clears that — see setStampTexture). */
  hideStampGhost(): void;
}

export interface ToolDragHandlers {
  onMove(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void;
  onEnd(ctx: ToolContext, event: FederatedPointerEvent | null): void;
}

/**
 * One tool's interactive behavior — SketchScene dispatches pointer/keyboard events to
 * whichever tool is active (by `id`, matching the current `SketchTool`), except drag
 * continuation, which dispatches by `drag.kind` regardless of the active tool (see
 * `dragKinds`'s doc comment).
 */
export interface Tool {
  readonly id: SketchTool;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2, screen: Vec2): void;

  /** Called on every pointermove while this tool is active — e.g. segment/polyline rubber-band cursor tracking. Called unconditionally alongside any `dragKinds` continuation (the original code's own checks were independent of one another, not mutually exclusive — preserved here for the same edge case: a drag begun under a different tool keeps updating even after the active tool changes). */
  onPointerMoveIdle?(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2, screen: Vec2): void;

  /**
   * Drag kinds this tool's `onPointerDown` can produce, each with its own move/end
   * continuation. Dispatched by `drag.kind`, not by the currently active tool: the
   * original code's `onPointerMove`/`onPointerUp` never checked `this.tool` for drag
   * continuation, only `this.drag.kind` — so a drag begun under one tool still finishes
   * correctly even if the active tool changes before pointerup. This map preserves that.
   */
  dragKinds?: Partial<Record<DragState['kind'], ToolDragHandlers>>;

  /** Returns true if the key was handled (mirrors the original's per-branch early return). */
  onKeyDown?(ctx: ToolContext, event: KeyboardEvent): boolean;

  /** Resets this tool's own pending/transient state — called on the outgoing tool by setTool(), and on every registered tool during a document switch. */
  onDeactivate?(ctx: ToolContext): void;
}
