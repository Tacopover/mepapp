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

- Confirm the multi-select modifier key (Shift vs. Ctrl) against whatever
  convention placed-stamp selection already uses elsewhere in the app, for
  consistency.
- Confirm whether Shapes-mode `text` shapes should rotate with the
  selection or stay upright (§5.4).
- Old app's actual `ScaleSelection` trigger UI (button/shortcut/field)
  wasn't found in the three files read for this plan — the numeric-field
  recommendation in §5.5 has no old-app precedent to match exactly, it's a
  reasonable default, not a port.
