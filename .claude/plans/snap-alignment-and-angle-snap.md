# Snap-to-object alignment guides + angle-snap for segment drawing

**Status: DONE (2026-09-17).** Implemented on branch `worktree-snap-alignment-and-angle-snap`,
commit `df696d9`. Built exactly as specced below, no deviations. `resolveSnappedPoint`
now dispatches by `kind`: draw-segment routes through the new `angleSnap.ts`
(`resolveAngleSnap`, anchor + increment + shiftKey-disables), move-selection routes
through the new `alignmentGuides.ts` (`resolveAlignmentSnap`, edges+centers, independent
X/Y). The one implementation detail not spelled out below: the alignment guide state
(matched line(s) to render, plus the selection's bounds captured once at gesture start)
lives as two new fields directly on `move-selection`'s `DragState` variant
(`selectionBoundsAtStart`, `guides`) rather than new `ToolContext` methods — mutated in
place each frame, the same pattern the existing `moved` flag already uses; `redrawOverlay`
reads `this.drag.guides` directly, same as its other `this.drag.kind === '...'` branches.
Verification: `pnpm build` (root, all 9 workspace packages) passes clean.
`pnpm --filter @mepapp/core test` (134 tests, unmodified) passes — no core package
changes were needed, since both new helpers depend on render-only types (`ToolContext`,
`DrawingState`) and correctly live in `packages/render/src/tools/`, not `packages/core`.
**Not verified**: actual in-browser interaction (dragging, drawing, watching a guide line
render, Shift behavior) — no browser was available this session. See "Verification" below
for the manual checklist still to run in `apps/web` before merging.

**Follow-on (2026-09-17, same branch, commit TBD after this edit):** extended
snap-to-object alignment guides to stamp placement (`place-terminal`/`place-equipment`),
per user request after trying the first cut. `resolveSnappedPoint` gained a third `kind`,
`'place-stamp'`: computes a virtual bounding box for the not-yet-placed stamp (new
`computeStampBoundsWorld` in `alignmentGuides.ts`, same corner/rotation math as
`SketchScene`'s private `stampCornersWorld` but against a candidate center instead of an
existing `PlacedStamp`) and runs it through the same `resolveAlignmentSnap` used by
move-selection — no new alignment logic, just a new bounds source. `SketchScene`'s
ghost-sprite positioning (`onPointerMove`) now snaps the ghost through this path and
stores the matched guides in a new `stampGhostGuides` field, rendered in `redrawOverlay`
identically to `move-selection`'s guides. `PlaceStampTool.onPointerDown` places at the
same snapped point the ghost showed, so click position matches what was previewed.
`pnpm build` passes clean (9/9). Not verified in-browser — add "place a stamp near
another element's edge/center, confirm the ghost snaps and a guide renders" to the manual
checklist below.

## Context

The feature atlas has no dedicated "snapping guides/gridlines" entry. Its only related
item is an unbuilt "Snap Angle selector" for the segment-drawing tool. We scoped this
work in discussion: skip grid-based snapping entirely, and build two independent
features instead — angle-snapping while drawing segments, and Figma/Illustrator-style
"snap-to-object" alignment guides while moving a selection.

Before this work could start cleanly, `packages/render/src/scene.ts` was a single
~3100-line class with per-tool logic inlined into `if/else` chains, with no shared place
to inject snap logic. That blocker is now resolved: `SketchScene`'s dispatch was
refactored into 13 per-tool modules under `packages/render/src/tools/`, merged to
`origin/master` at commit `dd2edfa` (2026-09-17). The refactor already added the exact
seam this work needs: `resolveSnappedPoint()` in `packages/render/src/tools/dragSnap.ts`,
a pass-through function already wired into every relevant call site — this plan replaces
that pass-through with real logic instead of adding new call sites.

## Decisions made

- **Angle-snap key convention**: Shift *disables* the constraint (angle-snap is on by
  default while drawing a segment; hold Shift for free-angle). This matches the existing
  rotate-handle convention (`ROTATE_SNAP_DEGREES`, `scene.ts`), not the more common
  Illustrator/Figma "Shift enables" convention — chosen for internal consistency.
- **Angle increment**: defaults to 45°, user-configurable in Settings (not hardcoded).
- **Alignment guides**: edges + centers only (no equal-spacing/distribution guides).
- **Alignment guide scope**: `move-selection` drags only (not resize, not rotate).

## Part 1 — Angle-snap while drawing segments

**Where**: `packages/render/src/tools/drawSegmentTool.ts`. Both call sites already route
through `resolveSnappedPoint(world, { ctx, kind: 'draw-segment' })` — in
`onPointerMoveIdle` (rubber-band preview cursor) and in `onDrawSegmentClick` (the actual
placed point). No new call sites needed.

**Logic** (new function in `packages/render/src/tools/dragSnap.ts`, or a sibling
`angleSnap.ts` if `dragSnap.ts` gets too crowded):
- Needs the segment's start point (`this.pendingStart.worldPosition`, already tracked by
  `DrawSegmentTool`) to compute the raw angle from start to the raw cursor point, snap
  that angle to the nearest multiple of the configured increment, and project the raw
  point back onto the snapped ray at the same distance from start.
- `DragSnapContext` currently only carries `{ ctx, kind }` — extend it with an optional
  field for the gesture's anchor point (e.g. `anchor?: Vec2`), since angle-snap has no
  other way to reach the segment's start point from inside `resolveSnappedPoint`.
  `DrawSegmentTool` passes `this.pendingStart?.worldPosition` as `anchor` at both call
  sites; `resolveSnappedPoint` does nothing angle-related when `pendingStart` is null
  (first click of a chain — nothing to measure an angle from yet).
- Shift-disables convention: `resolveSnappedPoint` needs the pointer event's
  `event.shiftKey` to decide whether to apply the angle snap at all. Today's signature is
  `resolveSnappedPoint(rawWorldPoint, context)` with no event — thread `shiftKey: boolean`
  into `DragSnapContext` (or take the raw `FederatedPointerEvent`) the same way
  `rotate-selection`'s handler already reads `event.shiftKey` in `selectTool.ts`.
  `onPointerMoveIdle`'s current signature already receives `event`, so this is a
  same-shape change, not new plumbing.
- Increment source: a new `angleSnapDegrees` field on `ToolContext` (getter, following
  the existing `getSnapRadiusScreenPx()` pattern), backed by a new `SketchScene` field
  wired the same way `snapRadiusScreenPx` is (see Part 3 below).

**Do not touch**: `resolveSegmentEndpoint` in `packages/core/src/segmentTool.ts` — that
function's job (snapping to ports/fittings/existing segments) runs on the
already-angle-snapped point in `onDrawSegmentClick`, exactly as it runs on the plain
point today. No change needed there; angle-snap and port/fitting-snap are two independent
passes over the same point, applied in sequence.

## Part 2 — Snap-to-object alignment guides

**Where**: `packages/render/src/tools/selectTool.ts`, the `move-selection` branch of
`dragKinds` (`onMove` at the `resolveSnappedPoint(rawWorld, { ctx, kind: 'move-selection'
})` call site). No new call site needed.

**Candidate elements**: every stamp/fitting/annotation currently in
`ctx.doc.drawingHistory.getState()` (`state.stamps`, `state.fittings`,
`state.annotations`) *except* the ones in the current selection/drag snapshot. Bounds for
each candidate come from the existing `ctx.resolveSelectableBoundsWorld(ref, state)` —
already used for rotate-pivot and handle placement, works for any ref/state pair, not
just the selection, so no new bounds logic is needed.

**Logic** (new file `packages/render/src/tools/alignmentGuides.ts`):
- Compute the dragged selection's own bounding box at the candidate drag position (using
  the existing move-selection delta math already in `selectTool.ts`: apply `dx`/`dy` to
  the snapshot's bounds, not to each element individually — cheaper and sufficient for
  edge/center comparison).
- For each candidate's bounds, compare the dragged selection's `{minX, maxX, centerX}`
  against the candidate's `{minX, maxX, centerX}` (and same for Y), within a screen-px
  tolerance converted to world units via `ctx.getZoomScale()` — the same
  "screen-px-radius-converted-to-world" pattern as `snapRadiusScreenPx` in
  `segmentTool.ts`/`scene.ts`.
- On a match within tolerance, adjust the returned point so the selection's matching edge
  or center lands exactly on the candidate's, and record which guide line(s) matched (for
  drawing — see below). No match: return the raw point unchanged.
- Independent X and Y snapping (a drag can snap horizontally and vertically to two
  different candidates at once, as in Figma).

**Rendering the guide lines**: a full-length line across the canvas (or across the
overlapping span of the two elements — either is acceptable, but check which reads
better once built) at each matched X/Y coordinate, drawn in `ctx.redrawOverlay()`'s
existing `Graphics` overlay (`scene.ts`'s `overlay`), the same layer used for selection
outlines/handles/rubber-band. Store the active guide match(es) as transient state
returned alongside the snapped point (e.g. `resolveSnappedPoint` returns
`{ point: Vec2; guides: AlignmentGuide[] }` instead of a bare `Vec2` — this changes the
function's return shape, so update all six existing call sites to destructure `.point`,
even though only `move-selection` populates `.guides`). Guides clear when the drag ends
or moves off-match — don't persist them.

**Do not touch**: `resize-rect`/`resize-circle`/`rotate-selection`/`draw-shape` call
sites — explicitly out of scope per the "move only" decision. They keep calling
`resolveSnappedPoint` and get back `.point` with an empty `.guides` array; no visible
change for them.

## Part 3 — UI: Settings

**Where**: `packages/ui/src/components/SettingsDialog.tsx`, which already has one
numeric field (`snapRadiusPx`). Add:
- "Angle snap" numeric input (degrees) — following the exact pattern of the existing
  `snapRadiusPx` field (label, input, validation range).
- No toggle needed for angle-snap itself (Shift already provides the escape hatch) or for
  alignment guides (always-on, like segment endpoint snapping already is) — per the scope
  decided, this is not a grid feature with an on/off switch, so don't add one unless you
  find while building this that users need to disable it.

**Wiring** (`packages/ui`'s `App.tsx`, following the existing `snapRadiusPx` →
`localStorage` → `useEffect(() => scene.setSnapRadius(px), ...)` pattern):
- New `angleSnapDegrees` state, persisted to `localStorage` under a new key (sibling to
  `SNAP_RADIUS_STORAGE_KEY`), pushed into the scene via a new `scene.setAngleSnapDegrees(deg)`
  method (mirrors `setSnapRadius`/`getSnapRadius` at `scene.ts:1083-1091`) which
  `ToolContext.getAngleSnapDegrees()` reads from.

## Verification

- `pnpm build` at repo root — confirms `@mepapp/render`/`@mepapp/ui`/`@mepapp/core`
  compile with the new `resolveSnappedPoint` return-shape change propagated everywhere.
- `packages/core` has real vitest coverage — if any new geometry helper (angle-snap
  projection, bounds-overlap comparison) lands in `packages/core`, add a unit test there
  following existing `geometry.ts` test conventions.
- Manual verification in `apps/web` (no automated test coverage exists for
  `packages/render` interactive behavior):
  - Draw a segment, confirm it snaps to 0/45/90° increments by default, confirm Shift
    frees the angle, confirm changing the Settings angle-snap value changes the increment.
  - Confirm a segment's endpoint still snaps to a port/fitting even when angle-snap is
    also active (both should apply — port/fitting-snap wins for the final placed point,
    matching current chain-drawing usability).
  - Move a stamp/annotation near another one's edge/center, confirm a guide line appears
    and the drag snaps to it; confirm it does *not* appear while resizing or rotating.
  - Confirm undo/redo still works correctly for a snapped move (single undo step, as
    today).

## Sequencing

Both parts are independent (different files, different `dragKinds` branches) and can be
built in either order or in parallel branches — no shared code beyond the
`DragSnapContext` type extension in `dragSnap.ts`, which is additive (new optional
fields) and safe for both to land on top of. Per repo convention, use `EnterWorktree` and
push to a branch (not `master`) for this work; the user tests on Windows before merging.
