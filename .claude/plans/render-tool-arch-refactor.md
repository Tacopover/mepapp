# Refactor SketchScene into a modular tool architecture

**Status: DONE (2026-09-17).** Implemented on branch `worktree-render-tool-arch-refactor`.
`scene.ts` went from 3098 -> 2366 lines; 15 new files added under `packages/render/src/`
(`tools/*.ts`, `drawingCommands.ts`, `stampSprite.ts`). `pnpm build` passes clean for every
workspace package. Manual runtime smoke test (Playwright driver against a real PDF
fixture, not just the automated checklist below) covered: draw-segment, select+drag-move,
draw-shape, rotate-handle drag, pan, zoom — zero console/page errors. The full manual
checklist below was not exhaustively re-run item-by-item; the user should still spot-check
on Windows before merging, per repo convention.

## Context

`packages/render/src/scene.ts` is one 3098-line class, `SketchScene`. The active tool is
a string union (`SketchTool`, scene.ts:307-321). `onPointerDown`/`onPointerMove`/
`onPointerUp` (scene.ts:1854/2134/2290) are long if/else chains keyed on `this.tool` or
`this.drag.kind`, each mutating a `DragState` discriminated union (scene.ts:417-451).

Two features are planned next: snap-to-object alignment guides during drag, and angle
snapping while drawing segments. Both need to inject snap logic into six drag branches
(move-selection, resize-rect, resize-circle, rotate-selection, draw-segment, draw-shape).
Today that means editing 6+ if/else branches by hand with no shared seam. This refactor
creates that seam before those features are built, so they land as one small addition
instead of six scattered edits.

**This session is refactor-only.** No snapping/grid/new-feature logic is added — the hook
is a pass-through. Every existing interactive behavior (selection, move, resize, rotate
with its 45° Shift-disables-snap convention, pan, zoom, segment/shape/stamp/polyline
drawing, keyboard shortcuts, undo/redo) must work identically afterward.

**Safety net (user-selected):** packages/render has no test coverage today (no vitest
config, no `*.test.ts`). Approach is a **manual verification checklist**, run once before
touching code to capture baseline behavior, then re-run after each tool's extraction —
see Verification section.

## Design

### Why dispatch is split by drag-kind, not by active tool

Reading `onPointerMove`/`onPointerUp` closely: **neither dispatches on `this.tool` at
all** — both dispatch purely on `this.drag.kind`. `setTool()` never resets `this.drag`.
This means if the active tool changes mid-gesture (e.g. a keyboard shortcut fires while a
mouse button is still down), the in-progress drag still completes correctly today, driven
by whichever tool originally set `this.drag`. The new architecture preserves this exactly:
drag continuation is dispatched by a **drag-kind → handler map**, built once from each
tool's declared kinds — independent of which tool is currently active. `onPointerDown`
(which genuinely does dispatch on `this.tool`) is the only place routed through "the
currently active tool."

### `Tool` interface (`packages/render/src/tools/types.ts`)

```ts
export interface ToolDragHandlers {
  onMove(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void;
  onEnd(ctx: ToolContext, event: FederatedPointerEvent | null): void;
}

export interface Tool {
  readonly id: SketchTool;
  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2, screen: Vec2): void;
  /** Called every pointermove while this tool is active AND drag.kind === 'none' — e.g. segment/polyline rubber-band cursor tracking. */
  onPointerMoveIdle?(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2, screen: Vec2): void;
  /** Drag kinds this tool's onPointerDown can produce. Dispatched by drag.kind, not by active tool (see above). */
  dragKinds?: Partial<Record<DragState['kind'], ToolDragHandlers>>;
  /** Returns true if handled (matches original early-return-per-branch shape) — used for Escape/Space special cases. */
  onKeyDown?(ctx: ToolContext, event: KeyboardEvent): boolean;
  /** Resets this tool's own pending/transient state — called on the outgoing tool by setTool(), and on every tool during a document switch. */
  onDeactivate?(ctx: ToolContext): void;
}
```

`DragState` and `SketchTool` move from `scene.ts` into `tools/types.ts` unchanged.

### `ToolContext` — the seam between `SketchScene` and tools

A narrow interface exposing exactly the shared services/state a tool needs (active
document, drag state, screen/world conversion, hit-testing, selection-bounds helpers,
connectivity-cascade helpers, shared pending-points scratch, stamp-ghost service, plus
`setTool`/`markDirty`/`syncDrawingLayer`/`redrawOverlay`/`emit`/`openTextEditor`).
`SketchScene` builds one `ctx` object (getters/setters closing over `this`) in its
constructor and passes it to every tool call — tools never hold a `SketchScene` reference
directly. Full member list goes in `tools/types.ts`'s doc comment when implemented; it is
a straightforward promotion of existing private methods/fields SketchScene already has,
not new logic.

Fields that are read by SketchScene's own shared rendering code (`redrawOverlay`,
`computeVisibleFittingIds`) but are logically tool-owned (`pendingSegmentStart/Cursor`,
`activeChainAnchorId` for draw-segment; `pendingPolylinePoints/Cursor` for draw-polyline)
stay on their concrete tool instances with readonly getters; `SketchScene` holds typed
references to those specific tool instances (not just a generic `Tool`) to read them.
`pendingPoints` stays a shared scratch array on `SketchScene`/`ctx` since three tools
(calibrate, measure, draw-line) genuinely share it today, matching the existing comment
at scene.ts:496.

**Explicitly out of scope for this refactor:** `redrawOverlay`, `syncDrawingLayer`,
`drawAnnotation`, and the other rendering-sync methods stay as shared methods on
`SketchScene`. They read tool-owned pending-state through the typed getters above. The
task's ask ("SketchScene ... no longer contains per-tool branching logic") targets the
pointer/keyboard event *dispatch* chains, not every rendering helper — splitting a
cohesive ~300-line rendering routine across 9 tool files would fragment it for no benefit
and add diff risk. Flagging this as a deliberate scope call, not an oversight.

### The snap hook seam

One function, one signature, called at the top of each of the six branches' move-handler,
wrapping the raw world-space pointer position before it's used to derive a delta, rect,
radius, or angle:

```ts
// packages/render/src/tools/dragSnap.ts
export interface DragSnapContext {
  ctx: ToolContext;
  kind: DragState['kind'];
}

/**
 * Adjusts a raw world-space point derived from the pointer, before a tool applies it to
 * geometry — the shared seam for the planned snap-to-object and angle-snap features.
 * Pass-through until those land.
 */
export function resolveSnappedPoint(rawWorldPoint: Vec2, context: DragSnapContext): Vec2 {
  return rawWorldPoint;
}
```

Call sites (all six preserve today's exact math, just reading `resolveSnappedPoint(world, ...)`
instead of `world` directly):
- `SelectTool` move-selection: wraps `world` before computing `dx`/`dy` from `startPointerWorld`.
- `SelectTool` rotate-selection: wraps `world` before `angleDegrees(pivot, world)` (existing
  `ROTATE_SNAP_DEGREES`/Shift-disables convention at scene.ts:2198 stays untouched downstream).
- `SelectTool` resize-rect / resize-circle: wraps `world` before computing the new rect/radius.
- `DrawShapeTool`: wraps `currentWorld` before computing the preview/committed rect or circle.
- `DrawSegmentTool`: wraps `world` before calling `resolveSegmentEndpoint` (core's existing
  port/fitting snap logic is untouched — this hook is a separate, additional seam upstream of it).

### File layout

```
packages/render/src/
  scene.ts                 # thin coordinator: doc/lifecycle mgmt, PDF sync, network types,
                            #   rendering sync (syncDrawingLayer/redrawOverlay/drawAnnotation),
                            #   public API surface, ctx construction, tool registry + dispatch
  document.ts, colorize.ts, texture.ts   # unchanged
  tools/
    types.ts               # SketchTool, DragState, Tool, ToolContext, ToolDragHandlers
    dragSnap.ts             # resolveSnappedPoint seam
    selectTool.ts            # move-selection/rotate-selection/resize-rect/resize-circle/rubber-band + hit-test-driven onPointerDown
    placeStampTool.ts        # place-terminal & place-equipment (one class, category param) + ghost Escape/Space handling
    drawSegmentTool.ts       # onDrawSegmentClick/resolveDrawTarget/chainContinuationFrom/armSegmentStartFromTarget/Escape two-stage
    drawPolylineTool.ts      # click-to-add-vertex + hand-rolled double-click-finish
    drawFreehandTool.ts
    drawShapeTool.ts         # rectangle/circle via Shift
    drawHighlightTool.ts
    drawLineTool.ts          # line/arrow via Shift
    drawTextboxTool.ts
    drawStickyNoteTool.ts
    calibrateTool.ts
    measureTool.ts
```
(`pan` needs no tool file — the button-1/2-or-tool==='pan' bypass at the top of
`onPointerDown`, and the trivial world.x/y update in the drag-kind map, both stay as a few
lines directly in `scene.ts`, matching how the original code never routes pan through a
per-tool branch either.)

### `SketchScene` changes

- `onPointerDown`: keep the pan bypass, then `this.toolMap.get(this.tool)!.onPointerDown(ctx, event, world, screen)`.
- `onPointerMove`: keep the pan-kind early return, compute `world`, keep the shared
  stamp-ghost-follow update, call `activeTool.onPointerMoveIdle?.(...)`, then
  `this.dragHandlers.get(this.drag.kind)?.onMove(ctx, event, world)`.
- `onPointerUp`: `this.dragHandlers.get(this.drag.kind)?.onEnd(ctx, event)`, then the
  existing unconditional `this.drag = { kind: 'none' }; this.redrawOverlay();` tail.
- `onKeyDown`: unchanged input-focus guard; Escape always routes to
  `activeTool.onKeyDown?.(ctx, event)` then returns (matches today's always-return);
  Space routes the same way but only returns if handled; Delete/Copy/Paste stay exactly
  where they are today (genuinely tool-agnostic globals).
- `setTool()`: call the outgoing tool's `onDeactivate?.(ctx)`, reset the shared
  `pendingPoints`, then proceed as today.
- `activateInternal()` (document switch): call every registered tool's `onDeactivate?.(ctx)`
  for a full reset, same as today's explicit field-by-field reset.
- `armSegmentStartFromTarget` (public API, called from the canvas contextmenu listener)
  delegates to the `DrawSegmentTool` instance's own method.
- `dragHandlers: Map<DragState['kind'], ToolDragHandlers>` and `toolMap: Map<SketchTool, Tool>`
  built once in the constructor from the tool instances.

## Execution order

1. **Design + `tools/types.ts` + `tools/dragSnap.ts` + `SelectTool` extraction — done by me
   directly** (most complex tool, exercises every part of the new seam: hit-testing,
   5 drag kinds, resize/rotate handles, the snap hook). This becomes the template.
2. **Delegate remaining tool extractions to subagents**, one Agent call per tool (or small
   logical group, e.g. calibrate+measure together since they're near-identical two-click
   flows), each briefed with: the exact source line ranges in the current `scene.ts`, the
   `SelectTool` file as the pattern to follow, and the constraint that behavior must not
   change. Run these sequentially where they touch shared registry wiring, or in parallel
   where they're purely additive new files — I'll decide per-batch once `SelectTool` lands
   and the registry shape is concrete.
3. **I personally wire the registry** (`toolMap`/`dragHandlers` construction, the rewritten
   `onPointerDown`/`onPointerMove`/`onPointerUp`/`onKeyDown`/`setTool`/`activateInternal`)
   after all tool files exist, since that's the part where a subtle ordering mistake would
   silently change behavior.
4. Final pass: `pnpm typecheck` / `pnpm build` at repo root, then the manual verification
   checklist below, comparing against the pre-refactor baseline run.

## Verification (manual checklist — no automated tests exist for this package)

Run once **before** starting (baseline) and once **after** the full refactor, via the
`run` skill against `apps/web`, on a real opened PDF fixture:

- Select: click-select, Shift-click add/remove, rubber-band (plain + Shift-additive)
- Move: drag a stamp, a segment (via its fitting endpoints), an annotation, multi-select move
- Resize: rectangle/highlight annotation (all 4 corners), circle annotation
- Rotate: drag rotate handle with and without Shift (confirm Shift *disables* the 45° snap),
  rail's ±90° rotate button
- Pan: middle-click drag, right-click drag, Pan tool left-click drag
- Zoom: wheel in/out, status-bar +/-/reset buttons
- Segment drawing: chain continuation through a fitting, ending on a Terminal vs continuing
  through Equipment, snap-to-existing-port, breaking an existing segment mid-run, right-click
  "Draw from" menu → armSegmentStartFromTarget
- Shape/line/freehand/highlight/polyline drawing, including Shift-modifiers (circle, arrow)
  and polyline's double-click-to-finish
- Textbox/sticky-note: create, reopen-to-edit on second click
- Stamp placement: place-terminal and place-equipment, Space to rotate the ghost, Escape to
  cancel
- Keyboard: Delete, Ctrl/Cmd+C / +V, Escape (both draw-segment's two-stage and place-*'s
  direct-to-select), undo/redo after each gesture type above
- Multi-document: switch documents mid-gesture-free, confirm tool/ghost/pending-state resets

`pnpm build` (root, via turbo) must also pass cleanly for every workspace package.

## Notes

- `packages/core/src/segmentTool.ts`'s `resolveSegmentEndpoint` is reused as-is by
  `DrawSegmentTool` — not reimplemented.
- `Transaction`/`CommandManager` usage (`packages/core/src/commands.ts`) is preserved
  exactly: `update()` per frame while dragging, `commit()` once on pointer-up.
- Work happens on the worktree branch `worktree-render-tool-arch-refactor` (already
  created via `EnterWorktree`) — push there, not to `master`, for the user to pull down
  and test on Windows first.
