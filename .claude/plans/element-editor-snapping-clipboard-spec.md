# Element Editor — snapping & clipboard

Priority 3 of three plans from a 2026-09-10 investigation comparing the new
`ElementEditorDialog`'s Shapes-mode canvas against the old MEPSketcher app's
`ElementCreatorWindow`/`DrawingCanvas`. Covers investigation findings #5
(snapping) and #6 (clipboard) — bundled because both are self-contained
precision/productivity additions to the existing pointer-drag pipeline,
each individually medium-sized, and neither requires
[[element-editor-selection-transform-spec]]'s multi-select rewrite to ship
first (see §4's sequencing note).

## 1. Source investigated

Old app: `/root/MepSketcher/MEPSketcher2/Views/SymbolCreator/`
`DrawingCanvas.Selection.cs` (`ApplyGridSnap`, `SnapToNearestTarget`,
`GetSnapPoints`, `AngleSnapDegrees`, `SnapIndicator`) and
`DrawingCanvas.Clipboard.cs` (~330 lines, read in full — `_clipboard`,
`CopySelectedToClipboard`, `PasteFromClipboard`, `StartCopyPlacementMode`,
`HandleCopyPlacementClick`, `MaxShapes`).

New app: `/root/MepApp/packages/ui/src/components/ElementEditorDialog.tsx`
(645 lines, read in full — `handleShapesCanvasPointerDown` lines 227–287,
`handlePortPointerDown` lines 309–332, `fractionFromEvent` lines 211–214,
the keydown effect lines 182–202), `symbolShapeCanvas.ts` (188 lines, read
in full — no snap or clipboard code present).

## 2. What the old app does

**Snapping**: two independently toggleable modes, both driven by
`_canvasVm.SnapToGrid`/`SnapToObjects`, applied in the shared pointer-move
pipeline used by *both* drawing new shapes and dragging/resizing selected
ones:
- Grid snap: `ApplyGridSnap(Point)` rounds to `GridSpacing = 10.0` canvas
  units.
- Object/endpoint snap: `SnapToNearestTarget(Point)` snaps to per-shape-type
  snap points from `GetSnapPoints(shape)` (endpoints, midpoints, corners,
  centers) within `SnapThreshold = 12.0` px, zoom-adjusted.
- A `SnapIndicator` visual shows whenever either mode moves the cursor
  point.

**Clipboard**: `_clipboard` is a **static** list — copy in one
`ElementCreatorWindow` and paste in another window both work, and the
clipboard survives the source window closing. `CopySelectedToClipboard()`
(Ctrl+C) clones the full multi-selection or single shape.
`PasteFromClipboard()` (Ctrl+V) enters a **paste-placement mode**: cloned
shapes follow the cursor as a ghost preview (opacity 0.55) until a click
commits them, offset from the click point relative to the clipboard's
average centroid — a "click to place" model, not an automatic small offset
from the original. Separately, `StartCopyPlacementMode`/
`HandleCopyPlacementClick` implement a repeatable CAD-style "copy with base
point" — first click sets an anchor, each further click stamps another copy
without re-copying, until Esc/right-click. Shape count capped at
`MaxShapes = 200` (paste/copy refuse past the cap). Each placement is one
undoable action.

## 3. What the new app does today

No snapping code anywhere in `symbolShapeCanvas.ts` or
`ElementEditorDialog.tsx` — positions are raw fractional pointer
coordinates from `fractionFromEvent` (lines 211–214), unmodified. No grid
display exists in this dialog. No clipboard code at all for this dialog's
own canvas — confirmed by a full read of both files (this is separate from
the app's unrelated Ctrl+C/V for *placed stamps* elsewhere in the app,
which this dialog doesn't share or reuse).

## 4. Decisions / recommended scope

Deliberately trim ambition below the old app for a first pass, consistent
with the original investigation report's recommendation:

- **Snapping**: build **grid snap only** in this pass. Skip object/endpoint
  snap — it needs a `GetSnapPoints`-equivalent per shape kind (meaningfully
  more work than one rounding function), and grid snap alone covers most of
  the day-to-day precision need for drawing straight/aligned symbol
  geometry. Treat object/endpoint snap as a fast-follow once real usage
  shows grid snap isn't enough, not part of this pass's scope. One toggle
  button is sufficient (no need for a second toggle when only one mode
  exists).
- **Clipboard**: build simple **copy + paste-with-fixed-offset** (e.g.
  +0.03/+0.03 fractional units from the original), matching the pattern the
  app already uses elsewhere for placed-stamp paste, rather than the old
  app's click-to-place ghost-preview mode or repeat-copy-with-base-point.
  Smaller, more consistent with how the rest of the app already handles
  paste, and still covers the core "duplicate this shape" need. Cross-window
  paste and the 200-shape cap don't obviously apply here (this dialog isn't
  multi-instance, and 200 shapes was a WPF-canvas-performance concern with
  no confirmed equivalent constraint in this app) — skip both unless a real
  perf problem shows up.
- **Sequencing relative to [[element-editor-selection-transform-spec]]**:
  both features should operate against whichever selection model exists
  when this plan is picked up — today's single-select, or that plan's
  multi-select if it's landed first. Not a hard dependency either way: if
  this plan ships first, build copy/paste and drag-snap against
  `selectedShapeId: string | null` and extend to the set-based model later;
  if that plan ships first, target `selectedShapeIds` directly and skip the
  rework.

## 5. Implementation scope

### 5.1 Grid snap

A `gridSnap(value: number, spacing: number): number` helper in
`symbolShapeCanvas.ts` — fractional-space equivalent of the old app's
`GridSpacing = 10` canvas units (recommend a fractional spacing like `0.02`,
~2% of the artwork box; tune against real fixture-scale symbols, see §8).
Apply it inside `fractionFromEvent`'s callers in
`handleShapesCanvasPointerDown` wherever a fraction feeds shape
creation/drag (the drag-to-create branch's `start`/`current` points, and
the select-tool's move-drag), gated by a new toggle button in the shape
toolbar next to the existing Undo/Redo buttons (lines 478–483). Also apply
the same snap in `handlePortPointerDown` (lines 309–332) and
`handlePreviewClick`'s `addPortAt` call, since ports are the most
position-sensitive elements in this dialog and the old app's grid snap
applies uniformly to shapes and ports alike.

### 5.2 Copy/paste

New `copySelected()` / `pasteClipboard()` functions in
`ElementEditorDialog.tsx`. Local component state,
`clipboard: SymbolShape[]` (not cross-window/static — no confirmed need for
the old app's process-wide sharing in this dialog's single-window use).
Add Ctrl/Cmd+C and Ctrl/Cmd+V handling to the existing keydown effect
(lines 182–202, alongside the current Delete/Undo/Redo handling — same
"no INPUT/TEXTAREA/SELECT focused" guard already there). Paste clones each
copied shape with a fresh `crypto.randomUUID()` id, applies the fixed
fractional offset from §4, commits via `commitShapes` (one undo step,
consistent with every other mutation in this file), and selects the newly
pasted shape(s) afterward.

## 6. Data model changes

None. Both features operate purely on existing `SymbolShape`/`PortSpec`
data — no changes to `@mepapp/core`.

## 7. Recommended build order

1. **Grid snap** — small, standalone, immediately useful for every
   existing tool and for ports.
2. **Copy/paste** — small, standalone, no dependency on snap.

## 8. Open items for whoever picks this up

- Confirm the fractional grid-spacing default (`0.02` suggested here,
  untested against real symbol artwork scale) and the paste offset amount
  by trying both against real fixture-scale stamps once built.
- Decide whether object/endpoint snap becomes a second phase of this same
  plan, or its own follow-up spec, once real dialog usage shows grid snap
  alone is insufficient.
