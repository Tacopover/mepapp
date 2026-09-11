# Element Editor — selection & transform overhaul

Priority 1 of three plans that came out of a 2026-09-10 investigation
comparing the new `ElementEditorDialog`'s Shapes-mode canvas against the old
MEPSketcher app's `ElementCreatorWindow`/`DrawingCanvas`. Covers investigation
findings #2 (multi-select + group operations) and #3 (single-shape rotate) —
bundled because group rotate is a direct extension of single-shape rotate,
and because most group operations (move, delete, mirror, scale) share one
foundation: a selection model that holds more than one shape id.

See also [[element-editor-drawing-tools-spec]] (new draw tools — independent
of this plan, can be built in either order) and
[[element-editor-snapping-clipboard-spec]] (snapping + clipboard — soft
dependency on this plan's multi-select model, see its own §4).

Two items already investigated and **deliberately out of scope** here (from
[[ports-custom-element-editor-spec]] §10, don't re-scope): shape **resize**
(no resize handles — this plan adds move/delete/rotate/mirror/scale only,
not resize) and a **keyboard-accessible shapes list** (unrelated to
selection mechanics).

## 1. Source investigated

Old app, `/root/MepSketcher/MEPSketcher2/Views/SymbolCreator/`:
`DrawingCanvas.Selection.cs` (~810 lines).

New app, `/root/MepApp/packages/ui/src/`:
`components/ElementEditorDialog.tsx` (645 lines — read in full),
`symbolShapeCanvas.ts` (188 lines — read in full),
`/root/MepApp/packages/core/src/symbol-shapes.ts` (32 lines — read in full).

## 2. What the old app does

- **Multi-select**: Ctrl-click toggles a shape into/out of `_selectedIndices`
  (`CtrlToggleSelect`); rubber-band/marquee select via
  `StartRubberBand`/`UpdateRubberBand`/`FinishRubberBand` — a shape is
  included if its bounds **midpoint** falls inside the drawn rectangle (not
  a full-overlap test).
- **Group move**: `_isMultiDrag` + `_multiDragSnapshots`, driven by
  `UpdateMultiDrag`/`FinishMultiDrag`.
- **Group delete**: `DeleteMultipleShapes()` — removes every selected index
  in one batch, single undo/redo pair for the whole operation.
- **Single-shape rotate**: a dedicated rotate handle (`_rotHandle` an
  `Ellipse`, `_rotStem` a connecting `Line`), offset `RotHandleOffset = 40.0`
  canvas units above the shape's bounding box; drag tracked via
  `_rotHandleDragStartAngle`, pivot `_rotCentroidDocX/Y`, snapshot
  `_rotDragSnapshot`, committed by `DragRotHandle`/`FinishRotHandleDrag`.
  No angle-snap increment found for this handle specifically (the
  `AngleSnapDegrees = 15.0` constant is for line/arrow angle snap while
  drawing, unrelated).
- **Group rotate**: `_isGroupRotating`, shared pivot
  `_groupRotPivotDocX/Y`, driven by
  `DragGroupRotHandle`/`FinishGroupRotHandleDrag` — same handle mechanics,
  applied to every selected shape around one shared pivot instead of each
  shape's own center.
- **Mirror**: `MirrorSelection(bool horizontal)` — single shape mirrors
  around its own centroid; multi-selection mirrors around the combined
  bounding-box center.
- **Scale**: `ScaleSelection(double factor)` — same single-vs-multi pivot
  rule as mirror. (The UI that calls this — button, keyboard shortcut, or
  numeric field — was not in the three files read for the original
  investigation; not confirmed. See §8.)
- **Not present in the old app either** (so this plan doesn't need to exceed
  it): keyboard arrow-key nudge, align/distribute commands. Resize handles
  exist in the old app but are explicitly out of scope here (see header).

## 3. What the new app does today

`ElementEditorDialog.tsx`: `selectedShapeId: string | null` (line 109) —
single selection only. The `'select'` branch of
`handleShapesCanvasPointerDown` (lines 245–264) hit-tests one shape
(`hitTestSymbolShape`) and, if hit, drags it via `translateShape` (in
`symbolShapeCanvas.ts`) on pointermove, committing on pointerup.
`deleteSelectedShape()` (line 154) removes the one selected shape. The
highlight-drawing effect (lines 161–179) draws a single dashed bounding-box
outline around `selectedShapeId`. No rotate, no mirror, no scale, no
marquee, no multi-select exist anywhere in this file or
`symbolShapeCanvas.ts`.

## 4. Decisions / recommended scope

- Build move, delete, rotate, mirror, scale, and multi-select (click +
  marquee). Do **not** add resize handles (already scoped out) or keyboard
  nudge / align-distribute (old app doesn't have them, no reason to exceed
  it here).
- Rotate needs a real design fork on the data model — see §6. Recommended:
  add a `rotation` field to `SymbolShape` rather than baking rotation into
  each shape's raw coordinates, so a rotated rect stays representable
  without becoming a polygon.

## 5. Implementation scope

### 5.1 Multi-select state model

Change `selectedShapeId: string | null` to a set of ids (e.g.
`selectedShapeIds: Set<string>`) throughout `ElementEditorDialog.tsx`.
Update the highlight effect (lines 161–179) to draw one dashed outline per
selected id. `deleteSelectedShape` becomes `deleteSelectedShapes` — filter
out every selected id and call `commitShapes` once, so a multi-delete is one
undo step (matching `DeleteMultipleShapes`'s batching). The style row
(stroke/width/fill controls, lines 485–512) needs a decision for the
multi-select case: recommend extending `updateActiveStyle`'s existing
single-shape branch (line 146) to loop over every selected id and apply the
same patch to each, rather than disabling style editing when more than one
shape is selected.

### 5.2 Click-to-add and marquee select

Click on empty canvas clears the selection (current behavior via
`hit?.id ?? null`, line 247) unless the pointerdown started a marquee drag.
Shift-click (or Ctrl-click — confirm against whatever modifier the rest of
the app already uses for multi-select elsewhere, e.g. placed-stamp
selection in `packages/render/src/scene.ts`, and match it for consistency;
not confirmed in this investigation, see §8) adds/removes a shape from
`selectedShapeIds` instead of replacing it. Marquee: pointerdown on empty
canvas with no modifier starts a rubber-band rectangle; on pointerup, select
every shape whose `symbolShapeBounds` midpoint falls inside it — same rule
as the old app's `FinishRubberBand`, simplest correct one to port.

### 5.3 Group move

When `selectedShapeIds.size > 1` and the pointerdown hit one of the selected
shapes, drag every selected shape by the same delta (parallel structure to
today's single-shape `translateShape` drag in the `'select'` branch,
lines 249–260) — snapshot each selected shape's pre-drag position, apply
`dx/dy` to all of them on move, one `commitShapes` call on pointerup.

### 5.4 Rotate (single and group)

Render a rotate handle above the selection's dashed outline (or above each
shape's own outline in single-select). Drag angle is measured from the
shape's centroid (single) or the combined bounding-box center (group,
matching `_groupRotPivotDocX/Y`). Apply the angle by updating each shape's
`rotation` field (see §6) — no need to transform raw coordinates. **Open
question to resolve before building**: should the Shapes-mode `text` kind
rotate with its group, or stay upright? The old app's *Labels* mode
explicitly keeps label text horizontal regardless of element rotation, but
Shapes-mode `SymbolText` is a different, unrelated model in the old app —
not confirmed whether it rotates. Default recommendation: let it rotate
like every other shape, since Shapes-mode text is decorative artwork, not a
live label (see [[ports-custom-element-editor-spec]] §5.3 vs. the separate,
not-yet-built Labels-mode concept).

### 5.5 Mirror and scale

Two new toolbar actions ("Mirror ↔", "Mirror ↕") operating on the current
selection (single or multi), pivoting around its own or the combined
bounding-box center — direct port of `MirrorSelection`/`ScaleSelection`
semantics. Scale: since the old app's actual triggering UI wasn't
confirmed (see §8), recommend a simple numeric "Scale %" field next to the
toolbar that applies on Enter/blur to the current selection, rather than
inventing a drag-handle gesture with no old-app precedent to match.

## 6. Data model changes (`@mepapp/core`)

Add `rotation: number` (radians, default `0` when absent) to the shared
shape or per-variant in `SymbolShape` (`symbol-shapes.ts`). Update every
function in `symbolShapeCanvas.ts` that reads geometry to account for it:
- `drawSymbolShapes` — `ctx.save()`/`ctx.translate(center)`/`ctx.rotate()`/
  `ctx.translate(-center)` around each shape's own center before drawing it.
- `hitTestSymbolShape` — rotate the test point into the shape's local
  (unrotated) space before running the existing per-kind hit test, rather
  than rotating the shape's geometry.
- `symbolShapeBounds` — needs to return the *rotated* bounding box (used
  for the selection highlight and marquee test), not the shape's unrotated
  local bounds.
- `createDraftShape` — default `rotation: 0` for every new shape.
- `translateShape` — unaffected (translation is independent of rotation).
- `rasterizeSymbolShapes` — no change needed; it just calls
  `drawSymbolShapes`, which already handles rotation once updated above.

No schema version bump needed — `rotation` is optional/defaultable, same
reasoning as `shapes?` itself (`ports-custom-element-editor-spec.md` §10).

## 7. Recommended build order

1. **Multi-select + marquee + group move/delete** — foundation, no schema
   change, unblocks everything else in this plan.
2. **Mirror + scale selection** — small, builds directly on multi-select.
3. **Single + group rotate** — the schema change (§6) and the most
   render/hit-test code touched; do last so it doesn't block 1–2.

## 8. Open items for whoever picks this up

- ~~Confirm the multi-select modifier key (Shift vs. Ctrl)~~ — resolved,
  see §9: Shift, matching `scene.ts`'s placed-stamp/annotation selection.
- ~~Confirm whether Shapes-mode `text` shapes should rotate with the
  selection or stay upright~~ — resolved, see §9 part 3: rotates with
  the rest of the selection, the plan's own stated default, and nothing
  in the implementation special-cases `'text'` so this was automatic.
- Old app's actual `ScaleSelection` trigger UI (button/shortcut/field)
  wasn't found in the three files read for this plan — the numeric-field
  recommendation in §5.5 has no old-app precedent to match exactly, it's a
  reasonable default, not a port. Shipped as specified in part 2 (§9).

## 9. Status

**All three parts done** — 2026-09-11, branch
`worktree-element-editor-plans` (not yet merged to master).

### Part 1 — multi-select, marquee, group move/delete

Commit `7d9d0e3`. Shipped exactly §5.1–5.3's scope: `selectedShapeId: string | null` →
`selectedShapeIds: Set<string>` throughout `ElementEditorDialog.tsx`,
one dashed outline per selected id, `deleteSelectedShapes` batches the
whole selection into one `commitShapes` call (one undo step), and
`updateActiveStyle` loops over every selected id instead of disabling
for multi-select (as recommended, not the disable alternative).

Modifier key (§8's open item): **Shift**, confirmed against
`scene.ts`'s `onPointerDown` (`event.shiftKey` toggles membership in
`selectedIds`, and gates additive-vs-replacing rubber-band) — used the
same convention here for consistency, no reason found to diverge.

Marquee: bounds-midpoint-inside test per §5.2's explicit recommendation
(not `scene.ts`'s own full-overlap `rectIntersectsRotatedRect` test,
which is a different rule solving a different problem — rotated stamp
bounds vs. these axis-aligned fractional shape bounds).

Group move: clicking a shape already in the current multi-selection
(no Shift) keeps the whole group selected and drags all of it —
clicking a shape outside the current selection replaces it with just
that shape, same rule `scene.ts`'s own hit-test branch already uses.

One implementation note beyond the plan text: the dialog's old
`draftShape: SymbolShape | null` (doing double duty for both the
in-progress drag-to-create preview and the single-shape select-drag
preview) became `draftShapes: SymbolShape[] | null` to carry a whole
dragged group; the redraw effect merges it into the committed `shapes`
list by id (replacing dragged originals, appending any not-yet-committed
new shape), rather than the old single-id swap.

Verified with a scratch Playwright driver against `apps/web`'s dev
server (not committed, per the existing Playwright-verification-
gotchas pattern): drew two rects, Shift-clicked both (outline on each,
confirmed via a cropped/zoomed screenshot — the 1px dashed line doesn't
read at full-page screenshot scale), dragged the group by one shape's
edge (both moved by the same delta, both stayed selected), clicked
empty canvas to deselect, marquee-selected both back, deleted both in
one keypress, then Undo restored both in one step — confirming the
batched-commit requirement from §5.1/§5.3. No console errors during the
run.

### Part 2 — mirror + scale selection

Commit `ae6303f`. Shipped §5.5 as specified: two toolbar buttons
("Mirror ↔" horizontal, "Mirror ↕" vertical) and a "Scale %" numeric
field (Enter/blur applies), all operating on the current selection,
disabled when nothing is selected. `symbolShapeCanvas.ts` gained
`mirrorShape`/`scaleShape` (per-kind geometry transforms) and
`selectionPivot` (own bounds center for a single shape, combined
bounding-box center for multi — same rule for both actions, exported
early because part 3's group-rotate pivot needed the identical rule).
Style/geometry only — stroke width is not scaled (a visual-thickness
convention independent of shape size, not stated in the plan either
way; picked as the less-surprising default).

Verified with a scratch Playwright driver: single-shape mirror
(asymmetric arrow, both axes — head flips to the correct side each
time), multi-selection mirror (rect top-left + circle bottom-right,
mirrored horizontally around their combined bbox center — positions
swap left/right as a rigid pair), and scale (a rect at 200% doubles in
size around its own center, position unchanged). No console errors.

### Part 3 — single + group rotate

Commit `9c2a6c1`. Shipped §5.4/§6 as specified: `@mepapp/core`'s
`SymbolShape` gained an optional `rotation` (radians, on every
variant, no schema bump), and `symbolShapeCanvas.ts`'s
draw/hit-test/bounds functions were updated per §6's checklist exactly
(`createDraftShape` sets `rotation: 0`; `translateShape` and
`rasterizeSymbolShapes` needed no change, as predicted).

One deviation from §6's literal wording, judged an improvement: rather
than separate single-shape and group-rotate code paths (mirroring the
old app's `_rotHandle` vs. `_groupRotPivot` split), a single
`rotateShapeAround(shape, deltaRotation, pivotX, pivotY)` handles both
— it revolves the shape's own center around the given pivot *and* adds
the delta to `rotation`. For single-select the pivot (via
`selectionPivot`) equals the shape's own center, so the revolve is a
no-op and only `rotation` changes; for group-select the shared pivot
makes every shape both revolve and spin together. One rotate handle
(stem + circle) renders above the selection's combined bounds
(`selectionBounds`, factored out of `selectionPivot`), hit-tested ahead
of normal shape hit-testing in the `'select'` tool.

`mirrorShape` (part 2) needed a retroactive fix once `rotation` existed:
a reflection reverses handedness, so mirroring now also negates a
shape's `rotation` field (same sign flip for either axis, since the
axis itself is already handled by the position mirror) — visually
confirmed coherent (not garbled) on a rotated-then-mirrored arrow.

§5.4's open question (text rotate-with-group vs. stay upright) resolved
itself: nothing in `drawSymbolShapes`/`hitTestSymbolShape`/
`symbolShapeBounds` special-cases `'text'`, so it rotates with
everything else — the plan's own stated default, now moot.

Verified with a scratch Playwright driver: single-shape rotate (wide
rect → 90° → tall rect, same center, handle re-renders correctly) with
Undo restoring the original; group rotate (rect + "AB" text, 90°
around their combined center) — both shapes revolved position *and*
the text's own glyphs visibly rotated 90° together with the rect. No
console errors in any run.

### Cross-cutting

All three parts type-check (`tsc --noEmit`) clean in `core` and `ui`,
the full `pnpm build` (turbo, all 9 workspace tasks) succeeds, and
`@mepapp/core`'s existing 129-test vitest suite still passes unchanged
(the `rotation` field is additive/optional, no existing test touches
`SymbolShape` construction). Not yet merged to `master` — this branch
(`worktree-element-editor-plans`) also carries the drawing-tools-spec
work from earlier in the day (see git log), so a merge should bundle
both or be split, whichever the person merging prefers.
