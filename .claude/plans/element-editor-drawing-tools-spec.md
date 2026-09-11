# Element Editor — additional drawing tools

Priority 2 of three plans from a 2026-09-10 investigation comparing the new
`ElementEditorDialog`'s Shapes-mode canvas against the old MEPSketcher app's
`ElementCreatorWindow`. Covers investigation finding #4 (missing tools).
Independent of [[element-editor-selection-transform-spec]] — can be built
before, after, or in parallel with it, since it only adds new shape kinds
and draw gestures, and doesn't touch selection state.

## 1. Source investigated

Old app: `/root/MepSketcher/MEPSketcher2/ViewModels/SymbolCreator/ElementCreatorViewModel.cs`
(`CreatorToolMode` and `ArcSubMode` enums, tool commands).

New app: `/root/MepApp/packages/ui/src/symbolShapeCanvas.ts` (188 lines,
read in full — `createDraftShape`, `updateDraftShape`, `isDraftLargeEnough`,
`drawSymbolShapes`, `hitTestSymbolShape`, `symbolShapeBounds`,
`translateShape`), `components/ElementEditorDialog.tsx`
(`SHAPE_TOOLS` array lines 44–52, `ShapeTool`/`ShapeDrawTool` types,
`handleShapesCanvasPointerDown` lines 227–287), and
`/root/MepApp/packages/core/src/symbol-shapes.ts` (`SymbolShape` union).

## 2. What the old app does

`CreatorToolMode`: `Select, Line, Rect, Circle, Arrow, Arc, Arc3Point,
Ellipse, Polygon, Text` — all nine drawing tools are live, wired to toolbar
`RadioButton`s and keyboard shortcuts (L/R/C/A/U/E/P/T), no dead commands.
`ArcSubMode`: `CenterStartEnd` (drag out a radius, matches the new app's
existing single Arc tool) vs. `StartEndThrough` (click three points — start,
end, a point the arc passes through — and the app computes the circle
through all three), switched via a dropdown on the Arc toolbar button, not
a separate top-level tool.

## 3. What the new app does today

`ShapeDrawTool = 'line' | 'rect' | 'circle' | 'arc'` (symbolShapeCanvas.ts:113).
All four are **drag-to-create**: `createDraftShape` seeds a zero-size shape
at the drag start, `updateDraftShape` grows it as the pointer moves,
`isDraftLargeEnough` gates whether it commits on release. No Arrow, no
Ellipse (Circle only, single radius), no Polygon, no Arc 3-point sub-mode.

## 4. Decisions / recommended scope per tool

- **Arrow** (smallest): new `SymbolShape` variant, same two-point shape as
  `line` (`x1,y1,x2,y2`), distinguished only by `drawSymbolShapes` rendering
  an arrowhead at `(x2,y2)`. Reuses the Line tool's exact drag gesture —
  `createDraftShape`/`updateDraftShape` need one more `case` each that
  mirrors the `'line'` case.
- **Ellipse**: new variant `{ kind: 'ellipse', cx, cy, radiusX, radiusY,
  style }`. Needs a **different** drag gesture than Circle — Circle derives
  a single radius from drag distance (`Math.hypot`); Ellipse needs two
  independent dimensions, so recommend a bounding-box-style drag like
  Rect's (`x,y,width,height` internally, converted to `cx/cy/radiusX/
  radiusY` on commit) rather than a radial drag.
- **Arc 3-point**: a second Arc sub-mode/toolbar entry ("Arc (3-pt)"),
  click-click-click instead of drag-then-adjust-angles. Needs new geometry:
  compute the circle's center and radius from three points (standard
  circumcenter formula), then derive `startAngle`/`endAngle` from the
  three points' angles around that center. Produces the **same** `arc`
  `SymbolShape` variant already in `symbol-shapes.ts` — no data model
  change, just a second construction path feeding the existing shape.
- **Polygon** (largest): genuinely new interaction model — click to place
  each vertex, double-click (or Enter) to close/finish, Escape to cancel —
  unlike every other tool here, which is a single continuous
  pointerdown-drag-pointerup gesture. New variant
  `{ kind: 'polygon', points: { x: number; y: number }[], style }`. Needs
  new state in `ElementEditorDialog.tsx` (a `polygonDraft: {x,y}[]`
  accumulator, separate from the existing single-shape `draftShape` pattern
  used by every drag tool) and a new branch in
  `handleShapesCanvasPointerDown` that doesn't fit the current
  pointerdown/move/up closure shape — it needs to persist across multiple
  separate clicks, not one drag.

## 5. Implementation scope

For each new shape kind, the same five functions in
`symbolShapeCanvas.ts` need a new `case`:
- `drawSymbolShapes` — render it (arrowhead triangle for Arrow; standard
  ellipse arc for Ellipse using different `radiusX`/`radiusY` instead of a
  single `radius`; closed polyline + optional fill for Polygon).
- `hitTestSymbolShape` — hit test (Arrow: same as Line's
  `distanceToSegment`; Ellipse: same as Circle's distance check but
  normalized by `radiusX`/`radiusY` independently; Polygon: point-in-polygon
  test, or edge-distance test for the unfilled case, matching the
  fill-vs-stroke branching pattern `rect` already uses at lines 68–75).
- `symbolShapeBounds` — bounding box per kind (Polygon: min/max over all
  `points`).
- `translateShape` — shift all coordinates by `dx/dy` (Polygon: map over
  `points`).
- `createDraftShape` / `updateDraftShape` / `isDraftLargeEnough` — per
  §4's gesture for each (skip for Polygon, which needs its own
  accumulator-based flow instead of the draft-shape pattern).

`ElementEditorDialog.tsx`: add each new tool to `SHAPE_TOOLS` (lines 44–52)
and `ShapeTool`/`ShapeDrawTool` types, and extend
`handleShapesCanvasPointerDown`'s tool dispatch (currently: `port` → add
port, `text` → place+rename, `select` → hit-test+drag, else → drag-to-create
via `createDraftShape`/`updateDraftShape`) with the Polygon click-accumulate
branch and the Arc-3-point click-accumulate branch (3 clicks, not
continuous).

## 6. Data model changes (`@mepapp/core`)

`SymbolShape` union (`symbol-shapes.ts`) gains three variants: `arrow`
(same shape as `line`), `ellipse` (`cx, cy, radiusX, radiusY`), `polygon`
(`points: { x: number; y: number }[]`). No schema version bump — `shapes`
is already optional with no migration needed, same reasoning as
`ports-custom-element-editor-spec.md` §10's note for the original `arc`/
`text` variants. Arc 3-point needs no new variant — it produces the
existing `arc` shape via a different construction path.

## 7. Recommended build order

1. **Ellipse** — smallest new gesture, reuses Rect's bounding-box drag
   pattern almost directly.
2. **Arrow** — smallest new render logic, reuses Line's gesture exactly.
3. **Arc 3-point** — new math but no new data variant, isolated to one
   construction path.
4. **Polygon** — largest, new interaction state machine; do last so it
   doesn't block the three smaller, more self-contained additions.

## 8. Open items for whoever picks this up

- Arrowhead visual proportions (length/width relative to stroke width)
  have no spec to port from — the old app's WPF rendering wasn't inspected
  in this investigation pass. Pick a simple fixed-proportion triangle and
  eyeball it against the fixture stamp art.
- Polygon's minimum-vertex-count and self-intersection handling (if any)
  weren't investigated on the old-app side — recommend the simplest rule
  (3+ points, no self-intersection check) unless real usage shows it's
  needed.
