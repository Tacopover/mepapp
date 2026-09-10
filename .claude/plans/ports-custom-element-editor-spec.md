# Ports + custom element editor — spec

Priority 2 of two split specs — see
[[segment-fitting-connectivity-spec]] (priority 1, built first) for
chained segment drawing and drag/undo propagation between segments,
fittings, and elements. That spec doesn't wait on this one: it bridges
with a synthetic center connection point on any port-less stamp, so
segments can already connect to (and drag with) any Terminal/Equipment
before real ports exist. This document scopes the part that bridge stands
in for: real, user-authored ports, and the dialog to place them.

## 1. Source investigated

`/root/MepSketcher` (legacy WPF app), read via two research passes:
- Ports: `MepSketcherTools/MEP/MepElementPort.cs`, `MepPortConnection.cs`,
  `Terminal.cs`, `Equipment.cs`, `Fitting.cs`, `Segment.cs`, `Node.cs`;
  `MepSketcherTools/Schematics/MepElementConfigLibrary.cs`;
  `MepSketcherTools/Utilities/ConnectionValidator.cs`, `PortGroupResolver.cs`,
  `HighLighter.cs`.
- Custom element dialog: `MEPSketcher2/Views/SymbolCreator/ElementCreatorWindow.xaml[.cs]`,
  `MEPSketcher2/ViewModels/SymbolCreator/ElementCreatorViewModel.cs`,
  `MEPSketcher2/Views/SymbolCreator/DrawingCanvas.xaml.cs` (+ partials).

`/root/MepApp` current state, read directly:
`packages/core/src/network.ts`, `stamp.ts`, `stamp-library.ts`,
`segmentTool.ts`, `project.ts`; `packages/render/src/scene.ts`
(`onDrawSegmentClick`, `resolveDrawTarget`, lines ~2000-2070).

## 2. What the old app actually does

### 2.1 Ports

A port (`MepElementPort`: `Id`, `Name`, `FractionX`, `FractionY`,
`IsDefault`) is **per-image-path**, not per-instance — every Terminal/
Equipment using the same image shares one `<image>.mepconfig.json` sidecar
via the `MepElementConfigLibrary` singleton, so editing ports on one
instance edits them for every placed instance of that image. World position
is never stored — `GetWorldPortPositions()` re-derives it from the current
`Position`/`Rotation`/`Scale` every time it's needed.

`MepPortConnection` links two ports **on the same element** into a group
(`PortGroupResolver`, union-find) — this models internal pass-through/
junction behavior (e.g. two ports on one device that are internally wired
together), not a segment-to-port link. The actual segment↔port link is
`Segment.StartPortId`/`EndPortId`, independent of `MepPortConnection`. A
port has no cardinality limit and no type/discipline/direction field —
compatibility is enforced at the *network* level (`ConnectionValidator`),
never per-port.

### 2.2 Custom element dialog

`ElementCreatorWindow` (modeless, multiple instances allowed) has three
modes: **Shapes** (a real vector drawing tool — line/rect/circle/arc/
polygon/text, stroke/fill styling, select/move/resize — for authoring a
symbol's artwork from scratch, or opening an existing image), **Ports**
(click empty canvas to drop a port at that fractional position; click-drag
an existing port dot to reposition; double-click to rename; a link-mode
toggle for two-click port-to-port grouping), **Labels** (property-display
overlays — out of scope here, not requested).

Persistence: writes `<name>.svg` + `<name>.mepshapes.json` (artwork) and
`<name>.mepconfig.json` (ports/labels/connections) to a **permanent
filesystem folder** shared across all projects — element type
(Terminal/Equipment) is *inferred* from which folder the image lives in,
not set explicitly in the dialog; there is no discipline field in the
dialog either.

## 3. What already exists in MepApp — more than expected

Ports are **not** greenfield. `packages/core/src/geometry.ts`'s `PortSpec`
(`{ id, name, fractionX, fractionY }`) and `getWorldPortPosition` already
implement the old app's exact model: local fractional coordinates, resolved
live through the element's current transform, never stored as world
coordinates. `StampDefinition.ports` (`stamp-library.ts:22`) and
`PlacedStamp.ports` (`stamp.ts:15`) already carry them through definition
→ instance. `network.ts`'s `PortGroup` (`elementId` + `portIds[]`) already
models the old app's `MepPortConnection` groups, with a working checkbox UI
for editing `linkedPortIds` in `PropertiesPanel.tsx:75-88`. `ConnectionPoint`
(`network.ts:38-40`, tagged union of `fitting` or `port`) already replaces
`Segment.StartPortId`/`EndPortId` with a cleaner shape. `segmentTool.ts`'s
`resolveSegmentEndpoint` already snaps in the same priority order as
`HighLighter.TrySnapToPort`: port, then fitting, then segment-interior
break, then new fitting.

What's actually missing (chain-drawing and force-snap gaps are scoped in
[[segment-fitting-connectivity-spec]] instead, not repeated here):

- **No custom element authoring path.** The existing "Custom terminal…" /
  "Custom equipment…" upload (`StampsPanel.tsx:118-135`,
  `App.tsx:283-292` `handleCustomStampFile`) loads a bitmap straight into
  `setStampTexture` with no `definitionId`, no name, **no ports**
  (`scene.ts:1901`: `definitionId ? [...] : []`), and no persistence — it's
  placed once and forgotten, gone on reload.
- **No shared Dialog component exists yet.** `grep -rni dialog
  packages/ui/src` returns nothing but a comment. The atlas's "D2" Dialog
  component is a plan, not shipped code.

## 4. Decisions (asked and answered this session)

- **Custom element authoring scope: full vector drawing tool**, matching
  the old app 1:1 (not upload-only). The dialog will support both drawing
  artwork from scratch (Shapes mode) and importing an existing raster image
  — real fixture art still needs an import path regardless (per the
  fixtures policy: genuine CAD-exported art, not synthetic).
- **Persistence: embedded in the project file.** Custom `StampDefinition`s
  (artwork + ports + metadata) live inside the project document itself, not
  a separate app-wide library. Fully portable with the file; not
  automatically shared across separate projects — that's a possible future
  enhancement, not in scope now.
- **Port linking ships in the new dialog**, not deferred to the existing
  per-instance Properties-panel checkbox. `PortGroup` already exists at the
  instance level; the dialog needs a *definition*-level equivalent (see
  §5.3) that gets instantiated into a real `PortGroup` at placement time.

## 5. Implementation scope

### 5.1 Shared Dialog component

Smallest possible build: modal shell (backdrop, title, close button,
content slot), reused for the Element Editor below and for every other
dialog already listed in `ui-atlas-layout-mapping.md` §5 (Settings,
Network Type Editor, etc.) — build against the simplest target first per
that doc's D2 resolution, which this spec doesn't need to re-litigate.

### 5.2 Element Editor dialog — Ports mode (unblocks custom ported elements)

New component in `packages/ui`, opened either as "Create custom element"
(new action — natural home is the Stamps dock tab, next to the existing
upload buttons) or "Edit ports…" from a placed stamp's Properties panel
(only for `source: 'custom'` definitions — the four hardcoded
`STAMP_LIBRARY` entries stay read-only; there's no old-app equivalent of a
"built-in" library to preserve parity with, so this is a new, low-stakes
default).

Fields: name, discipline (dropdown — the old app inferred this from folder
location, but MepApp has no folder concept, so this needs an explicit
field), category (terminal/equipment radio). Artwork: raster import (reuse
the existing upload bitmap-loading code from `App.tsx`'s
`handleCustomStampFile`) for this phase; Shapes-mode vector authoring is
§5.4.

Port placement: click on the rendered artwork preview to add a port at
that fractional position (mirrors `DrawingCanvas.HandlePortMouseDown`'s
`fx`/`fy` computation); drag an existing port to reposition; double-click
to rename. Port linking: a link-mode toggle, click two ports to group them
— stored as a **definition-level** group list (new field, see §6) since
there's no `elementId` yet at authoring time; converted to a real
`PortGroup` (with the new instance's `elementId`) at placement, the same
way [[segment-fitting-connectivity-spec]]'s synthetic center port gets
replaced by a real one — alongside the existing ports-copy step at
`scene.ts:1899-1921`.

**Verify before starting**: how (if at all) an uploaded raster image is
currently persisted. The current upload flow only sets a runtime texture
(`setStampTexture`) with no evidence of it surviving a save/reload — this
phase needs real persistence (embedded bytes, or a project-level asset
table), which is new work either way, but the exact mechanism should be
confirmed against `project.ts`'s save/load path before designing the
field.

### 5.3 Element Editor dialog — Shapes mode (vector artwork authoring)

Added on top of §5.2's dialog shell once that ships and is validated: a
drawing canvas with a tool palette (Select/Line/Rect/Circle/Arc/Text),
stroke color/width and fill controls, and undo/redo for shape edits (reuse
the existing `Command`/history pattern rather than inventing a second
undo system). Persisted as a new `SymbolShape[]` list on the custom
`StampDefinition` (§6). Needs a render-side rasterizer to turn the shape
list into an actual PixiJS display object / palette thumbnail — likely a
PixiJS `Graphics` built from the shape list, or an offscreen-canvas render
to texture. This is the largest single piece of new work in this whole
spec — a small vector editor in its own right — and should stay a distinct
phase rather than be built inline with §5.2.

## 6. Data model / schema changes (`@mepapp/core`)

- New field on the project document: `customStampDefinitions:
  StampDefinition[]` — kept separate from the hardcoded `STAMP_LIBRARY`
  (fixture-backed, code-shipped) and merged at read time by
  `stampDefinitionsForDiscipline`/`getStampDefinition` (small change:
  accept an optional custom-list argument, or have the palette query both
  and concatenate).
- `StampDefinition` needs a `source: 'library' | 'custom'` marker (gates
  the read-only distinction in §5.2) and an artwork field: `artwork: {
  kind: 'raster'; assetRef: string } | { kind: 'vector'; shapes:
  SymbolShape[] }` replacing/extending today's `iconRef` for custom
  entries — `iconRef` stays as-is for the fixture-backed built-ins.
- New `definitionPortGroups?: string[][]` field on `StampDefinition` (or
  equivalent) — groups of port ids at authoring time, converted to a real
  instance-level `PortGroup` at placement (§5.2).
- New `SymbolShape` type (line/rect/circle/arc/text primitives + style) for
  §5.3 — design this once §5.3 actually starts, not speculatively now.
- Bump `CURRENT_SCHEMA_VERSION` (currently `4`, `project.ts:13`) and add
  one `MigrationStep` (`project.ts:25`) per the existing pattern,
  initializing `customStampDefinitions: []` on older documents.

## 7. Recommended build order

1. **Shared Dialog component** (§5.1) — small, unblocks everything below.
2. **Element Editor, Ports mode** (§5.2) — real custom ported elements
   become possible; needs the schema bump (§6, minus `SymbolShape`) and
   the raster-persistence question resolved first.
3. **Element Editor, Shapes mode** (§5.3) — vector authoring, its own
   multi-session effort.
4. **Deferred / future, not scoped further here**: whether MepApp needs
   an old-app-style `ConnectionValidator` (NetworkType-level compatibility
   check on connect) — not confirmed either way whether this exists today;
   worth a follow-up check but doesn't block steps 1–3.

This spec has no hard dependency on
[[segment-fitting-connectivity-spec]] finishing first — the two can be
built in either order or in parallel — but building connectivity first
(as agreed) means real ports, once they land here, immediately get full
drag/rotate cascade behavior for free, instead of that wiring being new
work at this spec's completion.

## 8. Open verification items for whoever picks this up

- How/whether uploaded raster images persist today, if at all (§5.2).
- Whether a NetworkType-level connection-compatibility check exists in
  MepApp today (§7 item 4).

Neither blocks starting step 1.

## 9. §5.1 + §5.2 status

**Done** — 2026-09-10, commit `c9385ce`, branch
`worktree-ports-custom-element-editor` (not yet merged to master).

Shipped: §5.1 turned out to already exist (`Dialog.tsx`, in production
use by `SettingsDialog`/`GlobalPropertiesDialog`/`ManageBuildingsDialog`)
— the §3 investigation was stale, so this step was skipped as redundant
rather than rebuilt. §5.2 shipped in full: schema bumped v4→v5 with
`customStampDefinitions: StampDefinition[]` on `ProjectDocument`;
`StampDefinition` gained `source: 'library' | 'custom'` and
`definitionPortGroups?: string[][]`; new `ElementEditorDialog.tsx`
(name/discipline/category fields, raster import, click-to-add/drag-to-
reposition/double-click-to-rename ports, link-mode for grouping ports);
wired into `StampsPanel` ("Create custom element…") and
`PropertiesPanel` ("Edit ports…", gated to `source: 'custom'`);
`SketchDocument`/`SketchScene` carry `customStampDefinitions` per open
document, and `placeStamp` instantiates a definition's authoring-time
port groups into real `PortGroup` entries at placement.

One deliberate deviation from §6: instead of the spec'd
`artwork: { kind: 'raster' | 'vector'; ... }` field, custom artwork is
stored as a `data:` URL directly in the existing `iconRef` field,
distinguished from library entries via `source`. Avoids introducing a
schema branch for the not-yet-built `SymbolShape` vector variant (§5.3)
and needs no change to the `IconBitmapResolver` signature — only a
`data:`-prefix check at the two call sites that build a fetchable URL
from an `iconRef`. Revisit when §5.3 starts vector authoring.

Two real bugs found and fixed during live verification (not present at
initial implementation, both are shared-component/UX correctness fixes):
a port dot's click handler let clicks bubble to the preview's add-port
handler, spawning duplicate ports; and the shared `Dialog` component had
no scroll handling, so a tall dialog's action buttons could be pushed
off-screen — `.mep-modal-body` now scrolls independently of the
title/actions, fixed for every dialog in the app.

Verified: `pnpm build` clean across all 9 workspace packages (turbo,
root). `pnpm vitest run` in `packages/core` — 129/129 passing across 14
test files (5 new tests for the schema/library changes). `tsc --noEmit`
clean in `@mepapp/render` and `@mepapp/ui`. Live Playwright walkthrough
against the real dev server (`apps/web`, fixture PDF + fixture stamp
art): created a custom Fire Hose Reel element with two linked ports,
placed it on the sheet, confirmed the Properties panel's existing
"Linked ports" checkboxes reflected the auto-created `PortGroup`,
reopened via "Edit ports…" and confirmed full pre-fill (name,
discipline, category, artwork, ports, groups) round-tripped correctly.
Zero console errors throughout.

## 10. §5.3 status (Shapes mode)

**Done** — 2026-09-10, commit `41cb4f9`, branch
`worktree-ports-custom-element-editor` (not yet merged to master).

Shipped: a vector drawing canvas inside the same Element Editor dialog,
toggled via an "Import image" / "Draw shapes" mode switch. Tools:
Select (click to select/move, Delete to remove), Port (click to place a
port, same as the always-on Ports-mode behavior), Line, Rect, Circle,
Arc (drag to set radius, then Start°/End° number inputs on the selected
arc for the sweep — a deliberate simplification over a drag-handle
sweep gesture), and Text (click to place, inline rename same pattern as
port renaming). Stroke color/width and optional fill are editable per
selected shape or as defaults for the next shape drawn. Local undo/redo
via a `CommandManager<SymbolShape[]>` scoped to just this dialog's
canvas, wired to Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Ctrl+Y and on-canvas
buttons — reuses `@mepapp/core`'s existing Command/CommandManager
primitive per §5.3's own instruction, rather than inventing a second
undo system.

New `SymbolShape` union in `@mepapp/core` (`symbol-shapes.ts`) — line,
rect, circle, arc, text, each with a `style: { stroke, strokeWidth,
fill }`. Coordinates are fractional over the definition's own bounding
box (0..1), the same convention `PortSpec.fractionX/fractionY` already
uses, so a shape stays correctly placed regardless of the definition's
final `nativeWidth`/`nativeHeight`. `StampDefinition.shapes?:
SymbolShape[]` is the editable source — reopening "Edit ports…" on a
Shapes-authored element re-populates the canvas from it. No schema
version bump: the field is optional and needs no migration for older
saves.

One deliberate deviation, consistent with §5.2's already-recorded one:
rather than the spec's `artwork: { kind: 'vector'; shapes: SymbolShape[]
}` union member, the canvas is rasterized to a `data:` URL at save time
and stored in the existing `iconRef` field (same as the raster-import
path) — `shapes` is carried alongside purely as the editable source.
This means every render/placement call site in `@mepapp/render` and
`App.tsx` needed zero changes; they keep treating artwork as "an image"
with no vector-aware branch. The rasterizer (`packages/ui/src/
symbolShapeCanvas.ts`) is a plain `<canvas>` 2D-context draw routine,
shared by both the live editing canvas and the final save-time
rasterize step, matching this section's own suggestion ("a PixiJS
Graphics built from the shape list, or an offscreen-canvas render to
texture") — the offscreen-canvas option, not a PixiJS-side renderer, to
avoid touching `@mepapp/render` at all.

One real bug found and fixed during live verification: placing a text
shape opened its rename input with `autoFocus` from inside the same
`pointerdown` that created the shape — this raced the browser's own
post-mousedown focus handling (mousedown targets the canvas, which
isn't focusable, so the browser blurs whatever the app just focused),
silently discarding the rename before it was visible. Fixed by
deferring the focus call via `setTimeout(..., 0)`, the same fix already
present in `App.tsx` for the floating textbox-annotation prompt —
found by grepping for that exact pattern once the race was diagnosed,
not reinvented.

Two explicit scope trims, not built: shape **resize** (select tool
supports move + delete only, no resize handles) and a **shapes list**
for keyboard-only access (ports already have one via the existing Ports
section; shapes do not). Worth picking up if this dialog sees real use
and resize/keyboard access turns out to matter.

Verified: `pnpm build` clean across all 9 workspace packages (turbo,
root). `pnpm vitest run` in `packages/core` — 129/129 passing (no new
tests needed — `symbol-shapes.ts` is a pure type with no runtime logic,
and `packages/ui` has no test harness of its own, consistent with the
rest of that package). `tsc --noEmit` clean via `pnpm --filter
@mepapp/ui build`. Live Playwright walkthrough against the real dev
server: drew a rect, circle, line, and text label; selected and dragged
the rect; changed stroke color; exercised undo/redo; placed a port via
the Port tool; saved (name "Shape Test Valve", Plumbing, Equipment);
confirmed the new tile appeared in the Stamps grid; placed an instance
on the sheet (rasterized artwork + port render correctly); reopened via
"Edit ports…" and confirmed full pre-fill (name, discipline, category,
Draw-shapes mode active, W/H, all four shapes, the port) round-tripped
correctly. Zero console errors throughout.

This closes every part of ports-custom-element-editor-spec.md (§5.1
skipped as already-shipped, §5.2 and §5.3 both done this session). Per
this repo's CLAUDE.md, `/session-handoff` is the point at which this
plan file gets deleted, after confirming a summary lands in
Decisions-Log — not done by hand mid-session.
