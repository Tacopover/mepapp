# Chained segment drawing + ports + custom element editor — spec

Three atlas items that are one coupled feature: a user cannot draw a
connected run of segments to real equipment until equipment can carry
ports, and equipment cannot carry ports until there is a dialog to place
them. This document scopes all three together and gives a build order that
lets the first slice ship without waiting on the last.

## 1. Source investigated

`/root/MepSketcher` (legacy WPF app), read via two research passes:
- Ports: `MepSketcherTools/MEP/MepElementPort.cs`, `MepPortConnection.cs`,
  `Terminal.cs`, `Equipment.cs`, `Fitting.cs`, `Segment.cs`, `Node.cs`;
  `MepSketcherTools/Schematics/MepElementConfigLibrary.cs`;
  `MepSketcherTools/Utilities/ConnectionValidator.cs`, `PortGroupResolver.cs`,
  `HighLighter.cs`.
- Chained segment drawing: `MepSketcherTools/Tools/MepSegmentCreate.cs`,
  `StartEndPointCreate.cs`, `ToolManager.cs`;
  `MepSketcherTools/Commands/CreateHiddenSegmentCommand.cs`,
  `DeleteSegmentWithCleanupCommand.cs`, `DeleteFittingWithMergeCommand.cs`.
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

### 2.2 Chained segment drawing

Tool: `MepSegmentCreate` (subclass of `StartEndPointCreate`). Click 1 sets
the start point (creating a free `Fitting` there if nothing was hit,
snapping to a port if a ported element was hit). Every subsequent click
places one segment from the current start to the new point, **then sets
the new endpoint as the next start** (`_startNode = endNode`,
`MepSegmentCreate.cs:1067`) — that reassignment is the entire chaining
mechanism.

**Chain ends** when: the endpoint just connected to is a **Terminal**
(`CompleteConnectionToTerminal()` → `EndCurrentTool`), the user presses
**Escape** (global handler, `ToolManager.cs:1409`), or right-click →
Cancel. Connecting to **Equipment** or a **Fitting** does *not* end the
chain — the loop continues from there.

**Snap resolution per click**, in priority order: (1) a nearby port on a
hovered Terminal/Equipment; (2) if the click is anywhere on a ported
element's body but *not* within the normal snap radius of a specific port,
it still **force-snaps to the nearest port** — `HasUserDefinedPorts`
elements never accept an unconnected click, per `HighLighter.TrySnapToPort`
with an effectively unlimited threshold in that case; (3) an existing
fitting; (4) a point on an existing segment's interior, which breaks that
segment and inserts a new fitting at the break; (5) otherwise, empty space
→ new free-floating `Fitting`.

Angle snapping (`AngularSnapService`, default 90°, user-selectable
15/30/45/60/90/120° via a separate toolbar control) layers alignment and
intersection snapping on top, with Shift disabling it for one move, plus a
type-a-distance numeric entry. This is real but orthogonal machinery — the
atlas already lists a "Snap Angle selector" as its own rail flyout item,
separate from the segment tool itself.

Deletion cleanup: deleting a segment removes any endpoint fitting left with
zero remaining segments (`DeleteSegmentWithCleanupCommand`); deleting a
fitting that has exactly two segments merges them into one continuous
segment carrying the correct port references through
(`DeleteFittingWithMergeCommand`).

"Hidden segment" (`CreateHiddenSegmentCommand`, `Segment.IsHidden`) is a
segment with no drawn PDF geometry — dashed overlay only, for logical
connections like a plenum return path. A separate creation path, not part
of the interactive chain tool.

### 2.3 Custom element dialog

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

What's actually missing:

- **Segment drawing is strictly two-click**, not a chain. `scene.ts:2008`
  (`onDrawSegmentClick`) unconditionally does
  `this.pendingSegmentStart = null` after building one segment
  (`scene.ts:2025`) — there is no re-arming from the just-placed endpoint,
  no chain-termination rule, and the doc comment at `scene.ts:2001` calls
  this out explicitly as "Two-click segment drawing."
- **No force-snap-to-nearest-port when clicking a ported stamp's body.**
  `resolveSegmentEndpoint` only checks literal distance to each port
  (`segmentTool.ts:38-44`) — it has no concept of "inside this stamp's
  bounds but far from any specific port," so a click on a ported element's
  body but away from its one port would currently fall through to
  fitting/new-fitting logic instead of snapping, unlike the old app.
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

### 5.1 Chained segment drawing (`packages/render/src/scene.ts`)

Replace the unconditional reset at `scene.ts:2025` with a rule mirroring
§2.2:

- After committing a segment, inspect `resolved.point` (the endpoint just
  connected to).
- `{ kind: 'fitting' }` → **continue**: `this.pendingSegmentStart =
  resolved`.
- `{ kind: 'port', elementId }` → look up that stamp's `category`
  (`stamp.ts`'s `StampCategory`). `'terminal'` → **end chain**
  (`this.pendingSegmentStart = null`). `'equipment'` → **continue**.
- Escape cancels an in-progress chain: clear `pendingSegmentStart`, drop
  any preview overlay, leave the Segment tool active (don't force a tool
  switch — MepApp's rail-based tool model doesn't have the old app's
  auto-revert-to-pan convention, and there's no reason to invent one here).
  **Verify first**: MepApp's current global-key-handling location (not
  confirmed by this research) before wiring this in.
- Force-snap fix: before falling through to fitting/break/new-fitting
  logic, `resolveSegmentEndpoint` needs a new check — if the click lands
  inside a ported stamp's hit-bounds (reuse whatever `pointInRotatedRect`-
  style check the render layer already uses for stamp hit-testing) and
  that stamp has `ports.length > 0`, snap to its nearest port regardless of
  the normal snap radius. Add this as a new branch before the existing
  port-distance loop in `segmentTool.ts:38-44`, using the built-in stamps
  (Supply Grille, Luminaire, Switch already have one port each) as test
  material — this does **not** need to wait on the custom element dialog.

Explicitly **out of scope for this phase** (flagged, not forgotten):
angle/alignment/intersection snapping (own atlas rail item), hidden
segments, fitting-merge-on-delete parity, right-click cancel (Escape
covers the "cancel" case; right-click is a nice-to-have, not required).

**Verify before starting**: whether deleting a segment today already
cleans up an orphaned endpoint fitting (zero remaining segments) — not
confirmed either way by this research; check `commands.ts`/wherever
segment deletion lives.

### 5.2 Shared Dialog component

Smallest possible build: modal shell (backdrop, title, close button,
content slot), reused for the Element Editor below and for every other
dialog already listed in `ui-atlas-layout-mapping.md` §5 (Settings,
Network Type Editor, etc.) — build against the simplest target first per
that doc's D2 resolution, which this spec doesn't need to re-litigate.

### 5.3 Element Editor dialog — Ports mode (unblocks custom ported elements)

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
`PortGroup` (with the new instance's `elementId`) at placement, alongside
the existing ports-copy step at `scene.ts:1899-1921`.

**Verify before starting**: how (if at all) an uploaded raster image is
currently persisted. The current upload flow only sets a runtime texture
(`setStampTexture`) with no evidence of it surviving a save/reload — this
phase needs real persistence (embedded bytes, or a project-level asset
table), which is new work either way, but the exact mechanism should be
confirmed against `project.ts`'s save/load path before designing the
field.

### 5.4 Element Editor dialog — Shapes mode (vector artwork authoring)

Added on top of §5.3's dialog shell once that ships and is validated: a
drawing canvas with a tool palette (Select/Line/Rect/Circle/Arc/Text),
stroke color/width and fill controls, and undo/redo for shape edits (reuse
the existing `Command`/history pattern rather than inventing a second
undo system). Persisted as a new `SymbolShape[]` list on the custom
`StampDefinition` (§6). Needs a render-side rasterizer to turn the shape
list into an actual PixiJS display object / palette thumbnail — likely a
PixiJS `Graphics` built from the shape list, or an offscreen-canvas render
to texture. This is the largest single piece of new work in this whole
spec — a small vector editor in its own right — and should stay a distinct
phase rather than be built inline with §5.3.

## 6. Data model / schema changes (`@mepapp/core`)

- New field on the project document: `customStampDefinitions:
  StampDefinition[]` — kept separate from the hardcoded `STAMP_LIBRARY`
  (fixture-backed, code-shipped) and merged at read time by
  `stampDefinitionsForDiscipline`/`getStampDefinition` (small change:
  accept an optional custom-list argument, or have the palette query both
  and concatenate).
- `StampDefinition` needs a `source: 'library' | 'custom'` marker (gates
  the read-only distinction in §5.3) and an artwork field: `artwork: {
  kind: 'raster'; assetRef: string } | { kind: 'vector'; shapes:
  SymbolShape[] }` replacing/extending today's `iconRef` for custom
  entries — `iconRef` stays as-is for the fixture-backed built-ins.
- New `definitionPortGroups?: string[][]` field on `StampDefinition` (or
  equivalent) — groups of port ids at authoring time, converted to a real
  instance-level `PortGroup` at placement (§5.3).
- New `SymbolShape` type (line/rect/circle/arc/text primitives + style) for
  §5.4 — design this once §5.4 actually starts, not speculatively now.
- Bump `CURRENT_SCHEMA_VERSION` (currently `4`, `project.ts:13`) and add
  one `MigrationStep` (`project.ts:25`) per the existing pattern,
  initializing `customStampDefinitions: []` on older documents.

## 7. Recommended build order

1. **Chained segment drawing** (§5.1) — independent, no schema change, no
   new dialog. Testable today against the four built-in stamps. Smallest,
   ships first.
2. **Shared Dialog component** (§5.2) — small, unblocks everything below.
3. **Element Editor, Ports mode** (§5.3) — real custom ported elements
   become possible; needs the schema bump (§6, minus `SymbolShape`) and
   the raster-persistence question resolved first.
4. **Element Editor, Shapes mode** (§5.4) — vector authoring, its own
   multi-session effort.
5. **Deferred / future, not scoped further here**: angle/alignment
   snapping during chain draw, hidden segments, fitting-merge-on-delete,
   and whether MepApp needs an old-app-style `ConnectionValidator`
   (NetworkType-level compatibility check on connect) — not confirmed
   either way whether this exists today; worth a follow-up check but
   doesn't block phases 1–4.

## 8. Open verification items for whoever picks this up

- Global key-handling location for Escape-to-cancel (§5.1).
- Whether segment deletion already cleans up orphaned fittings (§5.1).
- How/whether uploaded raster images persist today, if at all (§5.3).
- Whether a NetworkType-level connection-compatibility check exists in
  MepApp today (§7 item 5).

None of these block starting phase 1.
