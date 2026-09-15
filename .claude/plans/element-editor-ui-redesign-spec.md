# Element Editor — UI redesign (canvas-first, zoom/pan, handles, tabs, unsaved-changes)

Requested 2026-09-15: a full UI/UX rework of `ElementEditorDialog` (the dialog
that authors a custom `StampDefinition` — artwork + ports). Scope is the
dialog's UI only, not `SymbolShape`/`PortSpec` (`@mepapp/core`) or the
stamp-library generator, unless a UI feature genuinely needs a model change
(none does — checked below).

An interactive HTML mockup was built and reviewed the same day before any
real code was written, and went through two rounds of feedback. Several
items below (the icon-button convention, `ColorPicker` reuse, angle snap,
object snap, and both bug-class warnings in §5) come directly from problems
found or decisions made while building/reviewing that mockup, not from the
original request — cited inline where relevant.

## 1. Reconciliation with [[element-editor-snapping-clipboard-spec]]

That plan (not started) covers two independent features:

- **Grid snap** — touches the exact same pointer-handling code this redesign
  is rewriting anyway: `fractionFromEvent`, `handleShapesCanvasPointerDown`'s
  drag branches, `handlePortPointerDown`. Doing grid snap after this redesign
  would mean re-touching freshly-rewritten code a second time. **Folded into
  this plan** (§6) — built once, against the final pointer-handling shape.
  Its own scope grew during mockup review: an editable **angle snap** and an
  **object/endpoint snap** are now folded in alongside it (§6.2, §6.3) —
  the second of these directly reverses that plan's own §4 decision to defer
  object/endpoint snap "until real usage shows grid snap isn't enough";
  mockup review supplied that signal early.
- **Copy/paste (clipboard)** — pure keyboard-shortcut + array-splice logic,
  no dependency on canvas rendering, zoom/pan, or pointer math. **Not folded
  in** — no code collision. Note it now has partial overlap with this plan's
  new **Duplicate** toolbar command (§4.2): Duplicate is a simpler one-click
  "clone with fixed offset" satisfying the everyday case; the original
  plan's Ctrl+C/Ctrl+V still stands as a separate, still-unbuilt addition
  (keyboard-driven, no toolbar button) — build either independently of the
  other.

## 2. Layout redesign

Header strip (always visible, compact — one dense row, smaller controls than
today) holds: Name, Discipline, Category segmented control, and the
Import/Draw-shapes artwork-mode toggle + W/H fields. It stays outside the tab
system because it's relevant no matter which tab is active (e.g. a
raster-import user still needs W/H before placing ports).

Below that, a `Shapes | Ports | Labels` tab bar (reusing the existing
`.mep-subtabs` segmented-button CSS already used by `GlobalPropertiesDialog`
— no new tab-bar visual language needed). This mirrors the old app's
`ElementCreatorWindow.xaml` structure: **not a WPF `TabControl`**, but
mutually-exclusive mode buttons toggling panel visibility around one
persistent, shared canvas that's never re-created per tab (confirmed at
`/root/MepSketcher/MEPSketcher2/Views/SymbolCreator/ElementCreatorWindow.xaml`
lines 26-49 for the mode buttons, line 660 for the single shared
`DrawingCanvas`). "Shapes" only shows when artwork mode is `'shapes'` (no
vector geometry to edit in `'import'` mode, same as the old app's
`IsShapesTabVisible`). "Labels" is present but disabled with a "Coming soon"
tooltip — structurally reserved, no content, per requirement 4.

The tool rail (left of canvas, Shapes tab only) is **icon-only, 32×32
buttons with a `title` tooltip each** — not the text-label buttons the
original mockup draft started with. This reuses the app's own existing
convention for exactly this kind of control: the main canvas's `Rail.tsx` /
`.mep-rail-btn` / `.mep-rail-divider` (`packages/ui/src/theme.css` lines
323-424) and its `icons.tsx` inline-SVG icon set (24×24 viewBox, `stroke:
currentColor`, `stroke-width: 1.8`). At 32px square instead of the old
172px-wide text-button column, the rail also shrinks from 172px to 44px —
one more increment toward the canvas being the dominant element (requirement
1). See §4 for the full icon inventory.

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Name______] [Discipline▾] (Terminal|Equipment)  (Import|Draw) W[_] H[_]│ header (always visible)
├───┬────────────────────────────────────────────────────┬─────────────────┤
│(S)│(Ports)(Labels∅)                                      │                 │
├───┤                                                       │  Ports panel:  │
│▤▤ │                                                       │  Add / list /  │
│▤▤ │           CANVAS                                      │  link-ports    │
│▤▤ │        (dominant element)                              │  (Ports tab)   │
│▤▤ │      zoom + pan + handles                              │                │
│▤▤ │                                                       │  or: disabled  │
│▤▤ │                                                       │  "Labels —     │
│ ⎯ │                                                       │  coming soon"  │
│↺↻│                                                       │  (Labels tab)  │
├───┴────────────────────────────────────────────────────┴─────────────────┤
│ [🎨 stroke][width][fill] │ [Duplicate][Rotate90][Mirror↔][Mirror↕][Scale%]│
│ [Front][Back][Delete]              [−][100%][+][Fit] │ [⊞][⌖][∠][45°]   │ ← one row, icon buttons + dividers
├──────────────────────────────────────────────────────────────────────────┤
│                                                        [Cancel] [Save]   │ Dialog's existing actions
└──────────────────────────────────────────────────────────────────────────┘
```

Canvas gets a fixed viewport size independent of the artwork's own aspect
ratio (unlike today's `shapeCanvasSize`, which forces the canvas element
itself to the artwork's aspect) — the artwork is drawn *inside* that viewport
at the current zoom/pan, same relationship the main PDF canvas has to the
page it displays. `.mep-modal` gets a wide-mode modifier (new
`.mep-modal--wide` class, applied via a new optional `className` prop on
`Dialog`) sized around `min(1040px, 95vw)` × `min(720px, 90vh)`, with the
canvas column flexing to fill whatever the header/rails/footer leave.

**Bottom bar is one row, not two.** The original draft gave zoom controls
(`−` / percent / `+` / `Fit`) their own dedicated row below the
selection-properties bar — reviewed and rejected: three-to-four buttons
don't justify a whole row's height on a dialog whose entire point is
maximizing canvas space. Zoom controls fold into the same
selection-properties bar as Style/Modify/Snap, as one more icon-button
cluster separated by the same thin vertical dividers already used between
the other clusters (`.spacer-line` in the mockup, a 1.5px `var(--line)`
rule) — see §3 and §4 for what's actually in that row.

### 2.1 A real CSS Grid bug caught during mockup review

Hiding the rail for the Ports/Labels tabs (`display: none`) while relying on
implicit grid auto-placement (three DOM children, no `grid-column` set on
any of them) caused the canvas to visually vanish — `display: none` removes
an element from grid placement entirely, so with the rail gone, the
canvas-column child got auto-placed into the rail's now-empty first track
(which is sized `0px` for those tabs) and the sidebar shifted into the
canvas's track. **Fix, and a hard requirement for the real
implementation:** give `.rail`, the canvas column, and `.sidebar` explicit
`grid-column: 1 / 2 / 3` each, never rely on source-order auto-placement
when any sibling in that grid can be conditionally hidden.

## 3. Zoom & pan

Mirrors `packages/render/src/scene.ts`'s conventions exactly, so the two
canvases feel consistent (confirmed via research: `MIN_ZOOM`/`MAX_ZOOM` at
lines 239-240, wheel handler at line 2382, pivot math
`applyZoomAtScreenPoint` at lines 2389-2397, pan on middle/right mouse button
at line 1849, no space+drag anywhere in this app):

- State: `view: { scale: number; panX: number; panY: number }` (screen-px
  pan offset, uniform scale) — same shape as `scene.ts`'s `world` transform,
  just plain state instead of a PixiJS `Container`.
- Wheel-to-zoom, no modifier key, ×1.1 per notch, pivoted on the cursor so
  the artwork point under the pointer stays fixed (same formula as
  `applyZoomAtScreenPoint`). Range **0.25–8** (tighter than the main
  canvas's 0.05–32 — symbol artwork is small, a full page's range doesn't
  apply). `preventDefault()` on the wheel event so the page doesn't scroll.
- Pan on middle-mouse-button or right-mouse-button drag (adds the raw
  screen-space pointer delta to `panX/panY`, no scale division — same as
  `scene.ts`'s `onPointerMove` pan branch). `contextmenu` is prevented on the
  canvas so right-drag doesn't pop the browser menu.
- Zoom controls (`−` / percent readout / `+` / `Fit`, icon buttons per §2.1's
  "one row" decision) sit in the selection-properties bar, not a dedicated
  row. `Fit` recomputes the same "contain artwork in viewport" scale
  `shapeCanvasSize` already computes today, and resets pan to center it.
- Because shapes are redrawn from their fractional data every frame (never
  rasterized until Save), there's no blur-at-high-zoom problem — the canvas
  backing store is sized to `viewportCSSSize × devicePixelRatio` plus the
  live `view.scale` baked into the draw transform, so lines stay crisp at
  8×.
- `fractionFromEvent` is rewritten to invert the view transform: screen px →
  (subtract pan, divide by scale) → artwork px (in the same fixed
  "base artwork size" space `shapeCanvasSize` already computes, e.g.
  520px-long-side) → divide by that base size → fraction. Every existing
  caller (shape creation, drag, marquee, port placement, handle drag) keeps
  using the same 0–1 fraction space untouched — only the screen→fraction
  conversion changes, not the fraction space itself. `clamp01` stays, so a
  click while zoomed past the artwork edge still can't place geometry
  outside 0–1 (matches every existing assumption downstream, e.g.
  rasterize-to-iconRef).

## 4. Shape handles

New `shapeHandles(shape, widthPx, heightPx): { id: string; x: number; y: number }[]`
and `applyHandleDrag(shape, handleId, currentFraction, widthPx, heightPx): SymbolShape`
in `symbolShapeCanvas.ts`, in the same artwork-px space `hitTestSymbolShape`
already uses (so no new coordinate convention). Per kind:

- **Line / arrow**: two handles, at `(x1,y1)` and `(x2,y2)`.
- **Rect**: four corner handles; dragging one resizes, keeping the
  *opposite* corner fixed (same min/abs normalization `updateDraftShape`'s
  rect branch already uses for drag-to-create, reused here).
- **Circle / arc**: one radius handle, placed at radius distance from center
  — for arc, at the sweep's midpoint angle `(startAngle + endAngle) / 2` so
  it always sits on the visible arc. Dragging sets `radius` from the
  pointer's distance to center, converted through the same
  `Math.min(widthPx, heightPx)` convention `drawSymbolShapes`/
  `hitTestSymbolShape` already use for this kind (never independently
  scaled per axis, per the existing doc comment on `drawSymbolShapes`'s
  circle case).
- **Ellipse**: two handles, at the cardinal points on the x-radius and
  y-radius (natural per-axis equivalent of the circle's single radius
  handle).
- **Polygon**: one handle per vertex, dragging sets that point directly.
- **Text**: no new handles (drag-to-move already exists via the shape-body
  hit test; no natural resize handle for a text anchor).

All handle math inverse-rotates the pointer into the shape's local
(unrotated) space by `shape.rotation` before computing the update, then
re-applies `rotation` for on-screen handle placement — the same convention
`hitTestSymbolShape` already uses (`rotatePoint(..., -rotation)`).
`handleShapesCanvasPointerDown`'s `'select'`-tool hit-test order becomes:
**rotate handle → geometry handle (only when exactly one shape is selected)
→ shape-body drag → marquee** (geometry handle inserted between the two
existing checks).

### 4.1 A real drag-math bug caught during mockup review

The mockup's first corner-drag implementation recomputed the "fixed
opposite corner" from the shape's own **current** (already-mutated) x/y/
width/height on every `pointermove`, instead of capturing it once at
drag-start. That's fine as long as the dragged corner never crosses the
fixed one — but once it did (dragging past the opposite edge, a normal thing
to do while resizing), the anchor silently jumped to wherever the pointer
happened to be at the moment of crossing, and the handle visibly stopped
tracking the cursor. **Hard requirement for the real implementation:**
capture every drag's fixed reference point (opposite corner for rect
resize, center for radius, the *other* endpoint for line/arrow) once in the
`pointerdown` handler, before `pointermove` fires at all — never re-derive
it from live state inside the move handler. Also call
`element.setPointerCapture(event.pointerId)` on drag-start (and release on
drag-end) so a fast drag can't lose the handle if the cursor briefly leaves
its small hit area.

### 4.2 Modify command group

A second icon-button cluster in the selection-properties bar, separate from
Style (stroke/width/fill) and Snap, grouping shape-editing commands that
existed before only as scattered text buttons (Mirror, Scale) or didn't
exist yet:

- **Duplicate** (new) — clones the selection with a fixed offset (same
  `+0.03/+0.03` fractional convention [[element-editor-snapping-clipboard-spec]]
  §5.2 already settled on for its Ctrl+V), one click, no keyboard shortcut
  needed (the shortcut still exists separately if that plan gets built).
- **Rotate 90°** (new) — a discrete quarter-turn, using the existing
  `rotateShapeAround` helper with `deltaRotation = Math.PI / 2` and the
  selection's own pivot (`selectionPivot`). Supplements, doesn't replace,
  the existing free-drag rotate handle — for the common case of "just turn
  it a quarter turn," dragging precisely to 90° by eye is unnecessarily
  fiddly.
- **Mirror ↔ / Mirror ↕** (existing — `mirrorSelection`) — re-iconified,
  regrouped here instead of standing alone.
- **Scale %** (existing — `applyScalePercent`) — regrouped here, control
  itself unchanged (a numeric field, not an icon button).
- **Bring to front / Send to back** (new) — reorders the shape within the
  `shapes` array (`z`-order is array order, per `drawSymbolShapes`' own
  paint-order convention); a small, previously-missing gap once artwork has
  overlapping shapes.
- **Delete** (existing — `deleteSelectedShapes`) — re-iconified.

**No separate "Move" button** — drag-to-move already exists via the
shape-body hit test in `handleShapesCanvasPointerDown`; a redundant
mode-switch button for something already always-available would be clutter,
not a gap. (Confirmed with the user during mockup review — flag if this
should be revisited.)

Icons: reuse existing `packages/ui/src/icons.tsx` components directly where
they already exist and fit — `IconSelect`, `IconSegment` (Line tool),
`IconLineArrow` (Arrow tool), `IconTextbox` (Text tool), `IconUndo`,
`IconRedo`, `IconCopy` (Duplicate), `IconRotate` (Rotate 90°), `IconTrash`
(Delete), `IconSnapAngle` (angle-snap toggle, §6.2 — already exists,
already named for this exact purpose, currently unused). New icons needed,
same 24×24/`stroke: currentColor`/`stroke-width: 1.8` house style: Port,
Rect tool, Circle tool, Ellipse tool, Arc tool, Arc (3-pt) tool, Polygon
tool, Mirror (horizontal; vertical is the same icon rotated 90° in CSS, no
second icon needed), Scale, Grid-snap (dot grid), Object-snap (crosshair-in-
circle), Bring-to-front / Send-to-back (overlapping-rects pair), Zoom-fit
(corner brackets). All were prototyped in the mockup and can be copied
directly into `icons.tsx`.

### 4.3 Two known non-square-canvas issues (per the task's prior-context notes)

- **`symbolShapeBounds`'s circle/arc case is imprecise on non-square
  canvases** (uses `radius` as if uniform per axis, when it's actually
  scaled by `Math.min(widthPx, heightPx)` at draw time). This directly
  affects the dashed selection-box the new bigger canvas makes more
  visible, and is a small, local, no-model-change fix (correct per-axis
  half-extents: `radius * Math.min(w,h) / w` and `radius * Math.min(w,h) / h`
  instead of `radius, radius`). **Fixing this in-scope** — small, and the
  redesign's bigger canvas surfaces it more.
- **Rotation math (`shapeCenter`/`rotatePoint` in `symbolShapeCanvas.ts`,
  used by `symbolShapeBounds`, `hitTestSymbolShape`, `rotateShapeAround`,
  `mirrorShape`) operates in raw fraction space, not pixel space** — correct
  only when `widthPx === heightPx`. (`drawSymbolShapes`'s own rotation is
  fine, since `ctx.rotate` runs in real pixel space.) The new handle-drag
  code for rotated shapes reuses this same fraction-space convention for
  consistency with existing hit-testing, so it **inherits this existing
  imprecision** for rotated shapes on non-square artwork (common — most
  equipment symbols aren't square). Properly fixing it means threading
  `widthPx`/`heightPx` through `shapeCenter`, `rotatePoint`,
  `rotateShapeAround`, `mirrorShape`'s signatures — a real refactor touching
  every geometry helper, not a UI change. **Deferred**, as the task's own
  notes anticipated — flagged here as an explicit open item (§8), not
  silently fixed or silently left undocumented.

## 5. Same `ColorPicker` everywhere

`ElementEditorDialog.tsx` currently uses a bare `<input type="color">` for
both stroke and fill (lines 793 and 811 in the pre-redesign file) — an
existing inconsistency with the rest of the app, caught during mockup
review. Every other color field in the app (stamp appearance, network-type
color — `PropertiesPanel.tsx` lines 145 and 260) goes through the shared
`packages/ui/src/components/ColorPicker.tsx`: a swatch button opening a
popover with a fixed basic-color grid, a per-browser "last used" list
(persisted to `localStorage`), and a native color input for anything else.
**In scope for this redesign:** replace both raw color inputs with
`<ColorPicker>`, matching the exact usage pattern `PropertiesPanel.tsx`
already establishes. No changes needed to `ColorPicker.tsx` itself — it's
already generic.

## 6. Grid, angle, and object snap (absorbed + expanded from [[element-editor-snapping-clipboard-spec]] §5.1)

### 6.1 Grid snap

`gridSnap(value, spacing)` in `symbolShapeCanvas.ts`, applied inside the
rewritten `fractionFromEvent`'s callers (shape create/drag, port place/drag,
and now handle-drag, §4) behind a toggle button in the selection-properties
bar. Same fractional spacing recommendation (`0.02`, tune against real
fixture symbols) from the original plan.

### 6.2 Angle snap (new — not in the original plan)

An editable-degrees toggle (default 45°, numeric input next to the toggle)
constraining a directional two-point drag (line/arrow endpoint, and any
future handle with the same "fixed point + moving point" shape) to the
nearest multiple of the configured angle, measured from the drag's fixed
point. Standard CAD ortho/polar-tracking behavior; came up during mockup
review as a named, explicit ask (draw orthogonally or at a specified angle
like 45°), not something the original snapping-clipboard investigation
considered. Implementation: `angleSnap(from, to, incrementDegrees)` in
`symbolShapeCanvas.ts` — project `to`'s distance from `from` onto the
nearest angle multiple. `IconSnapAngle` already exists in `icons.tsx`
(currently an unused placeholder for the main canvas's own draw-network
flyout) — reuse it here.

### 6.3 Object/endpoint snap (new — reverses the original plan's deferral)

[[element-editor-snapping-clipboard-spec]] §4 explicitly deferred this:
"skip object/endpoint snap... treat as a fast-follow once real usage shows
grid snap isn't enough." Mockup review supplied that signal immediately, so
it's pulled into this pass. `collectSnapPoints(shapes, excludeId)` in
`symbolShapeCanvas.ts` returns per-shape candidate points (line/arrow: both
endpoints + midpoint; rect: four corners + center; circle/arc: center;
ellipse: center; polygon: each vertex) excluding the shape currently being
dragged; `findNearestSnapPoint(point, candidates, thresholdPx)` returns the
closest one inside a small pixel threshold, or null. Wired into handle-drag
with **priority over grid snap** (an exact geometric match beats a
rounded-to-grid guess) — grid snap only applies when no object-snap match is
in range. A visual snap indicator (small marker circle, distinct accent
color so it doesn't get lost against the selection-blue `#2f6fed` or the
grid-dot grey) shows what point is currently snapped-to, matching the old
app's own `SnapIndicator` concept from
`DrawingCanvas.Selection.cs`. One combined toggle per §4's icon inventory
(grid, angle, object — three separate toggles, since a user may want any
one without the others).

## 7. Unsaved-changes warning

`Dialog`'s `onClose` is currently wired to three triggers that all mean
"discard and close" today with no warning: Escape (`Dialog.tsx` line 22),
backdrop click (`Dialog.tsx` line 27), and the dialog's own Cancel button.
All three go through one new guarded handler:

```
function requestClose() {
  if (isDirty) setPendingClose(true);
  else onClose();
}
```

`isDirty` is a snapshot diff: on mount, capture a JSON snapshot of every
saveable field (name, discipline, category, mode, artworkDataUrl,
nativeWidth/Height, ports, groups, shapes) into a `ref`; `isDirty` re-derives
the same JSON on each render and compares. Chosen over a scattered
`dirty = true` flag touched by every setter (~15 call sites) — one snapshot
comparison is less invasive and correctly treats "moved a shape back to
where it started" as still dirty, matching normal unsaved-changes UX.

`pendingClose` renders a small inline confirm block ("Discard unsaved
changes?" / Keep editing / Discard) inside the existing modal body — not a
second nested `<Dialog>`, to avoid the known
[[project-dialog-escape-listener-conflict]] issue (`Dialog`'s own Escape
listener runs on `document` at bubble phase; stacking a second `Dialog`'s
listener on top of it is exactly the kind of thing that bug came from). A
capture-phase Escape handler, same pattern the existing
polygon/arc-3pt-draft-cancel handler already uses
(`ElementEditorDialog.tsx` lines 343-350), closes the confirm block itself
(not the whole dialog) when `pendingClose` is true, `stopPropagation`-ing so
`Dialog`'s own Escape-closes-everything listener never sees it.

## 8. Open items

- Fraction-space rotation imprecision on non-square canvases (§4.3) is
  real, pre-existing, and now reachable via handle-drag too — not fixed
  this pass. Worth its own follow-up if a rotated non-square symbol shows
  visibly wrong handle behavior in practice.
- Grid-spacing default (`0.02`), zoom range (`0.25–8`), object-snap pixel
  threshold, and the 45° angle-snap default are all reasonable starting
  guesses, untested against real fixture-scale symbols — tune once built.
- Copy/paste (Ctrl+C/V) from [[element-editor-snapping-clipboard-spec]]
  remains unbuilt and unblocked, distinct from the new Duplicate button
  (§4.2) — can ship independently, before or after this work.
- Considered and explicitly deferred during mockup review (not built,
  no plan-file scope yet, revisit if wanted): a right-click context menu
  on a selected shape (conflicts with right-drag-to-pan unless
  short-click-vs-drag is distinguished — a real design tension, not a
  trivial add), an editable-numeric-coordinates property inspector for the
  selected shape (typed-value alternative to dragging), and multi-select
  align/distribute commands.

## 9. New/changed files

- `packages/ui/src/components/ElementEditorDialog.tsx` — layout restructure
  (header strip, tab bar, icon-only rail, canvas region, one-row
  selection-properties/modify/snap/zoom bar), zoom/pan state + wheel/pointer
  handlers, handle-based dragging in `handleShapesCanvasPointerDown` (with
  the anchor-capture-once fix from §4.1 and explicit `grid-column`s from
  §2.1), dirty-tracking + guarded-close flow, grid/angle/object snap
  toggles + application, `<ColorPicker>` in place of raw color inputs,
  Modify command handlers (Duplicate, Rotate 90°, front/back order).
- `packages/ui/src/symbolShapeCanvas.ts` — `shapeHandles`, `applyHandleDrag`,
  `gridSnap`, `angleSnap`, `collectSnapPoints`, `findNearestSnapPoint`; fix
  to `symbolShapeBounds`'s circle/arc per-axis half-extents.
- `packages/ui/src/icons.tsx` — new icon components (§4.2's list); reuse
  existing ones where they already fit.
- `packages/ui/src/theme.css` — `.mep-modal--wide` (or equivalent) sizing,
  rail/sidebar/canvas explicit grid-column rules, one-row
  properties/modify/snap/zoom bar styling (reusing `.mep-rail-btn`/
  `.mep-rail-divider` for every icon button in the dialog, not a new button
  style), snap-indicator styling, confirm-block styling; tab bar itself
  reuses existing `.mep-subtabs`.
- `packages/ui/src/components/Dialog.tsx` — new optional `className` prop
  to carry the wide-mode modifier without a one-off dialog-specific fork.
- `.claude/plans/element-editor-snapping-clipboard-spec.md` — amended: grid
  snap tracked here instead; clipboard scope unchanged; note the new
  Duplicate button's partial overlap.

## 10. Build order

1. **Done** (commit `7558fd6`, see below). Layout restructure + wide modal
   + icon-only rail (no drag/zoom behavior change yet) — get the
   canvas-dominant shell in place first, with explicit `grid-column`s from
   day one (§2.1), so every later step is built/tested against the final
   layout, not the old cramped one.
   Verification: `pnpm --filter @mepapp/ui build` and root `pnpm build` both
   clean. Exercised in a real browser (Vite dev server + Playwright,
   headless chromium) — Create Custom Element dialog opens at the new wide
   size; header row (Name/Discipline/Category/Import-Draw/W/H/Import button)
   renders in one line; Shapes tab is absent in Import mode and appears the
   moment Draw is picked (with an added auto-jump to the Shapes tab on that
   click, not in the original spec text, needed so switching artwork mode
   immediately shows the relevant controls — matches the pre-redesign
   dialog's own immediacy); switching to Ports/Labels tabs correctly hides
   the rail without the canvas or sidebar shifting track (§2.1's fix
   verified working); drawing a Rect and selecting it shows the rotate
   handle, the dashed selection box, and populates the one-row bottom bar's
   Style (stroke/width/fill) and Modify (mirror h/v, scale, delete) clusters
   with icon buttons from `.mep-rail-btn`/`icons.tsx`.
2. **Done** (commit `75ff95d`). `<ColorPicker>` swap-in — small, fully
   independent of everything else, good early win.
   Verification: `pnpm build` clean. Exercised in browser — opening the
   Stroke swatch's popover in the new bottom bar revealed a real clipping
   bug not anticipated by the spec text: `ColorPicker`'s popover opens
   downward by default (fine in a side dock), but the bar sits directly
   above the modal's own action buttons inside a scrolling
   `.mep-modal-body`, so the popover was cut off. Fixed with a scoped CSS
   override (`.mep-ee-bar .mep-color-picker-popover`) flipping it to open
   upward into the canvas area — `ColorPicker.tsx` itself stays untouched,
   per §5. Confirmed the basic-colors grid, last-used row, and custom input
   all render fully visible after the fix.
3. **Done** (commit `558070a`). Zoom & pan (rewrite `fractionFromEvent` +
   wheel/pan handlers), folded into the one-row bottom bar per §2.1/§3.
   Implementation split the preview area into a fixed-size viewport
   (`.mep-element-editor-preview`, the coordinate reference, independent of
   artwork aspect) and an inner `.mep-ee-artwork` layer sized to the
   artwork's own world box (`canvasWidthPx`/`canvasHeightPx`) carrying a CSS
   `translate()/scale()` for pan/zoom — used for the import-mode `<img>`
   and, in both modes, the ports overlay (so port dot positions stay
   correctly anchored to the artwork through pan/zoom). The Shapes-mode
   `<canvas>` does NOT use a CSS transform (would blur its rasterized
   lines at high zoom) — instead its backing buffer is sized to the
   viewport's CSS size × devicePixelRatio, with pan/scale baked into the
   2D context transform before each draw, per §3's explicit "no blur"
   requirement. `zoomAtScreenPoint` is shared between the wheel handler and
   the new Zoom cluster's −/%/+/Fit buttons (mirrors scene.ts's own
   `applyZoomAtScreenPoint` convention). A known interim imprecision, not a
   regression: the rotate handle's fixed-pixel offset/radius (and
   `hitTestSymbolShape`'s fixed tolerancePx) are still "world px", so they
   visually grow/shrink with zoom instead of staying constant on screen —
   deferred to step 4, which reworks this exact hit-test/handle code
   together (per the plan's own build-order rationale) rather than fixing
   it twice.
   Verification: `pnpm build` clean. Exercised in browser — wheel-zoomed to
   173% pivoted on the cursor, right-drag-panned (no browser context menu
   popped), and Fit correctly returned to the initial centered/contained
   view (81% for the default 48×48pt artwork in the 420×420 viewport, which
   is the mathematically correct contain-scale, not 100%) — all with crisp,
   unblurred lines throughout. Also verified in Import mode with a real
   fixture PNG (`fixtures/stamps/D5_Switch.png`): placing a port and then
   zooming in kept the port dot correctly anchored to the artwork.
4. **Done** (commit `69cbd0b`). Shape handles (depends on zoom/pan's
   coordinate rewrite being settled) — built with the anchor-capture-once
   discipline from §4.1 from the start, not as a retrofit.
   New `shapeHandles`/`applyHandleDrag` in `symbolShapeCanvas.ts`, per-kind
   as speced. `applyHandleDrag` takes the ORIGINAL shape (captured once at
   pointerdown, passed unchanged on every pointermove) rather than a
   mutable captured anchor variable — structurally the same fix as §4.1
   asks for, since every fixed reference point is re-derived from that same
   untouched original shape on every call. `hitTestSymbolShape` gained an
   optional `tolerancePx` parameter (default 6, unchanged for non-dialog
   callers) so the dialog can pass a zoom-adjusted `6 / view.scale`.
   Also fixed §4.3's named bug: `symbolShapeBounds`'s circle/arc case now
   takes `widthPx`/`heightPx` and corrects the half-extents per axis
   (`radius * Math.min(w,h) / w` and `/ h`) instead of using `radius,
   radius` uniformly — required threading `widthPx`/`heightPx` through
   `selectionBounds`/`selectionPivot` too, updating all 8 call sites.
   Also resolved step 3's noted interim imprecision in the same pass (per
   the plan's own build-order rationale for grouping this work): rotate
   handle offset/radius and the new geometry handles are now divided by
   `view.scale` wherever drawn or hit-tested in the zoomed world-space
   transform, so they stay a constant size on screen regardless of zoom —
   same "screen px, zoom-independent" convention as scene.ts's own handle
   constants. Selection dashed-outline/marquee/polygon-draft chrome got the
   same treatment (`chromeScale = 1 / view.scale`) for consistency.
   Verification: `pnpm build` clean. Exercised in browser — a single-
   selected rect shows 4 corner handles (white-filled circles) alongside
   the existing rotate handle; dragging a corner handle past its opposite
   corner tracked the cursor exactly with no anchor jump (the exact bug
   class §4.1 describes), confirmed both mid-drag and after release.
5. Grid + angle + object snap (§6) — small, same pointer-code area as
   step 4, do last of the pointer work so it doesn't get rebased across
   handle changes.
6. Modify command group (§4.2) — mostly independent, can slot in anytime
   after step 1's shell and step 4's handles (Rotate 90° reuses
   `rotateShapeAround`, already exists).
7. Tabs (Shapes/Ports/Labels) — mostly independent, can slot in anytime
   after step 1's shell exists.
8. Unsaved-changes warning — fully independent of 2-7, can be built first
   or last.
