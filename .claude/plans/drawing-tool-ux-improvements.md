# Drawing-tool and panel usability improvements

## Context

MepApp's stamp and segment placement tools give no visual feedback before an
element is committed to the canvas, network types carry a leftover
"Unassigned" concept that should never really exist, fitting visibility on a
network lags behind selection, several panel affordances (Quick Access
Toolbar, network-type swatches, Properties panel) don't behave the way users
expect, and two data-model gaps (multi-select editing, per-stamp color/scale)
block workflows the old MEPSketcher already supported. This plan implements
nine related UX/engineering fixes across `@mepapp/core`, `@mepapp/render`,
and `@mepapp/ui`, ordered so data-model changes land before the UI that
depends on them.

User decisions already made (do not re-litigate during implementation):
- Stamp ghost rotation (Space = +45°) persists across placements until tool
  switch, Escape, or a different stamp is picked — not reset after every
  placement.
- "Unassigned" network type: no data migration. It stays only as an internal
  fallback constant for old/corrupt data; it's removed from the picker and
  can never be newly assigned. New documents/segments default to
  `NETWORK_TYPE_LIBRARY[0]` (Supply Air).
- Multi-select property editing excludes position (X/Y stays single-select
  only). Every other shared field: same value shown if all selected elements
  agree, "Varies" if not; editing writes one undo step across the whole
  selection.
- New stamp Color + Scale fields are both per-instance (editable in the
  Properties panel) and remembered per stamp-definition (localStorage,
  `@mepapp/ui`), so the next placement of that same stamp type starts with
  the last-used appearance. Scale is a single uniform factor (matches the
  old app), not independent X/Y.

Two implementation-detail defaults chosen while planning (each is a small,
reversible engineering call, not a UX decision worth re-asking):
- Network-type edit dialog (Part 7): clicking a non-adopted type's swatch
  adopts it into the document on Save (small `updateNetworkType` extension),
  so the new Discipline field is actually usable before a type has ever been
  picked — not just view-only.
- Capacity is not undo-tracked today (`setTerminalCapacity` is a direct,
  non-transactional map write). Multi-select capacity editing keeps this
  existing behavior as-is; making capacity undoable is a separate, larger
  change and out of scope here.

## Parts (implement in this order)

### Part 1 — Default network type: drop "Unassigned" from the picker
Files: `packages/render/src/document.ts`, `packages/render/src/scene.ts`,
`packages/ui/src/components/StampsPanel.tsx`

- `document.ts`: seed `SketchDocument.networkTypes` with `NETWORK_TYPE_LIBRARY[0]`
  instead of `DEFAULT_NETWORK_TYPE`. Keep `DEFAULT_NETWORK_TYPE` exported,
  unchanged, as the internal fallback used when a segment's `networkTypeId`
  doesn't resolve (scene.ts's `resolveNetworkTypeVisuals`/`getNetworkSummaries`,
  and the load-time `doc.networkTypes.length > 0 ? ... : [DEFAULT_NETWORK_TYPE]`
  fallback) — leave all of that fallback logic untouched.
- `scene.ts`: change `activeNetworkTypeId`'s default and its per-document reset
  from `DEFAULT_NETWORK_TYPE.id` to `NETWORK_TYPE_LIBRARY[0].id`.
- `StampsPanel.tsx`: the custom/adopted-types filter that excludes library
  types (`networkTypes.filter(t => !NETWORK_TYPE_LIBRARY.some(...))`) must
  also exclude `DEFAULT_NETWORK_TYPE.id` (`'default'`), so a stray legacy
  "Unassigned" entry loaded from an old project never renders as a pickable
  tile.
- No schema migration — only the seed for brand-new documents/segments
  changes, per the user decision above.

### Part 2 — Fix fitting visibility to refresh on plain click-select
Files: `packages/render/src/scene.ts`

`computeVisibleFittingIds` already reads live `selectedIds` correctly; the
bug is that `syncDrawingLayer()` (which applies that visibility) is only
called during an active drag, not on a plain click. Add a `syncDrawingLayer()`
call (before the existing `redrawOverlay()`) at every place `selectedIds` is
mutated outside of a drag:
- `onPointerDown`'s hit-select branch (both the shift-click add/remove path
  and the plain-click path).
- The empty-space deselect click (clears `selectedIds` with no shift).
- The rubber-band marquee-selection commit in `onPointerUp`.

This is safe perf-wise: `syncDrawingLayer()` already runs on every mousemove
frame during a drag, so calling it once per discrete click is cheaper, not a
new perf class. Don't add it to the hover/mousemove path — only at these
discrete selection-mutating points.

### Part 3 — Remove Quick Access Toolbar; add Select/Copy/Delete to the Rail
Files: `packages/ui/src/components/QuickAccessStrip.tsx` (delete),
`packages/ui/src/components/Rail.tsx`, `packages/ui/src/toolRegistry.ts`,
`packages/ui/src/App.tsx`

- Delete `QuickAccessStrip.tsx` and its render call + import in `App.tsx`
  (its state — MRU list, capacity, drag position — is entirely local to the
  component, nothing else in `App.tsx` reads it).
- `toolRegistry.ts`: remove the `copy`, `rotate` (90°), and `delete` entries
  from the `select-edit` row's flyout in `RAIL_ROWS`. Keep the `select` main
  button and the disabled `move` placeholder. If `ToolAction`/the `action`
  field on `ToolEntry` becomes fully unused after this (confirm via grep),
  remove it as the direct consequence of this change — not a separate
  refactor.
- `Rail.tsx`: add three fixed buttons directly below the existing Undo/Redo
  pair, same icon-button styling: **Select** (switches active tool to
  `'select'`), **Copy** (`sceneRef.current?.copySelection()`, disabled when
  nothing selected), **Delete** (`sceneRef.current?.deleteSelection()`,
  disabled when nothing selected). Reuse existing `hasSelection`/`sceneRef`/
  `tool` props — no new props needed.
- If `TOOL_META` in `toolRegistry.ts` has no consumer left after
  `QuickAccessStrip` is deleted, remove it too (grep to confirm first).

### Part 4 — Stamp color + scale: data model, migration, rendering
Files: `packages/core/src/stamp.ts`, `packages/core/src/project.ts`,
`packages/render/src/scene.ts`, new `packages/ui/src/stampAppearanceDefaults.ts`

- `stamp.ts`: add `color?: string` (hex) to `PlacedStamp`. Scale reuses the
  existing `Transform2D.scale: Vec2` field — just start exposing/writing it
  as a uniform factor (`{x: factor, y: factor}`), no model change needed.
- `project.ts`: bump `CURRENT_SCHEMA_VERSION` to `6`, add a `5 → 6` migration
  step that only sets `schemaVersion: 6` (no backfill needed — `color` is
  optional and every reader already treats "absent" as "no tint", the same
  way `definitionId?` needed no migration step).
- `scene.ts`:
  - `placeStamp()`: apply `sprite.tint` from `data.color` if present (reuse
    the existing `hexColorToPixi` helper, already used for network-type
    colors). Read the per-definition remembered appearance (passed in via an
    extended `setStampTexture(bitmap, definitionId?, appearanceDefault?)`,
    stashed on `pendingStampTexture`) to seed the new stamp's initial color
    and scale, and its rotation from the ghost's persisted rotation (Part 5).
  - `syncStampSprites()`: set `sprite.tint` from `data.color` on every sync
    (undo/redo, drag-commit, property edits), alongside the existing
    `applyTransformToSprite` call, so color changes/undo are picked up the
    same way transform changes already are. Apply the same tint line in the
    copy/paste sprite-construction path.
  - Add `setSelectedColor(color)` and `setSelectedScale(factor)` (single- and
    multi-select variants — see Part 8) via a small shared "patch arbitrary
    `PlacedStamp` fields in one undo transaction" helper, generalized from
    the existing `applyStampTransform` pattern.
  - Add `color?: string` to `StampInfo`/`toStampInfo()` so the Properties
    panel can read it.
- `@mepapp/render` stays free of any localStorage/`@mepapp/ui` dependency:
  the new `packages/ui/src/stampAppearanceDefaults.ts` module
  (`getStampAppearanceDefault(definitionId)` /
  `setStampAppearanceDefault(definitionId, {color, scale})`, keyed by
  `definition.id` — stable and unique across library stamps and custom
  stamps per `stamp-library.ts`'s lookup) is read by `StampsPanel.tsx` at
  pick-time and passed through the extended `setStampTexture(...)` call;
  after a Properties-panel color/scale edit, `App.tsx` writes the new default
  back for each edited stamp's `definitionId` (skip stamps with no
  `definitionId`, i.e. one-off uploads).

### Part 5 — Stamp placement ghost preview + Space-to-rotate 45°
Files: `packages/render/src/scene.ts`

- Add a dedicated `Container` ghost layer (not the `overlay` `Graphics`
  object) added to `this.world` just below `overlay`, so the ghost sprite's
  lifecycle is isolated from `overlay`'s per-frame `.clear()`.
- Build the ghost sprite from the same texture/`baseScale` math as
  `placeStamp()` (extract a small shared `computeStampBaseScale()` helper so
  the two never drift apart), alpha ~0.5, `eventMode = 'none'` so it never
  intercepts pointer/hit-testing.
- `onPointerMove`: while `tool` is `place-terminal`/`place-equipment` and a
  ghost exists, move it to the live world cursor position and apply the
  current ghost rotation.
- `onKeyDown`: while in a stamp-placement tool and not typing in an input,
  Space (`event.preventDefault()`, since Space otherwise scrolls the page)
  advances `stampGhostRotationDegrees` by 45° (wrapping at 360°) and updates
  the ghost immediately.
- `placeStamp()`: use `stampGhostRotationDegrees` (not a hardcoded 0) as the
  new stamp's initial `transform.rotationDegrees` — this is what makes the
  rotation "stick" across repeated placements.
- Reset `stampGhostRotationDegrees` to 0 on: Escape (existing
  stamp-tool Escape branch), tool switch away from stamp placement, a new
  `setStampTexture()` call (covers "different stamp picked"; re-picking the
  same stamp also resets — an acceptable simplification), and per-document
  activation reset.
- Destroy the ghost sprite (without destroying its shared `Texture`) on
  texture change, tool switch, and scene teardown.

### Part 6 — Segment rubber-band preview line
Files: `packages/render/src/scene.ts`

Mirrors the existing polyline-tool cursor-preview pattern exactly:
- Add `pendingSegmentCursor: Vec2 | null`, updated in `onPointerMove` while
  `tool === 'draw-segment'` and `pendingSegmentStart` is set (triggers
  `redrawOverlay()`).
- In `redrawOverlay()`, next to the existing pending-start dot marker, draw a
  line from the pending start to `pendingSegmentCursor`, styled with the
  currently-active network type's resolved color (`resolveNetworkTypeVisuals`)
  so the preview matches what the committed segment will actually look like.
- Clear `pendingSegmentCursor` everywhere `pendingSegmentStart` is cleared
  (commit, Escape, tool switch, per-document reset) so no stale line can
  render.

### Part 7 — Network-type swatches always show color; add Discipline field
Files: `packages/ui/src/components/StampsPanel.tsx`,
`packages/ui/src/components/NetworkTypeEditorDialog.tsx`,
`packages/render/src/scene.ts`

- `StampsPanel.tsx`: render the color-swatch button unconditionally (drop the
  `isAdopted &&` guard), using `effective.color` (already resolves to the
  library color when not yet adopted).
- `scene.ts`'s `updateNetworkType`: when the id isn't found in the document's
  adopted `networkTypes` yet, adopt it first (push a copy of the library
  entry, same pattern `setActiveNetworkType` already uses) before applying
  the patch, so editing a never-picked type's properties (including the new
  Discipline field) actually persists.
- `NetworkTypeEditorDialog.tsx`: widen `NetworkTypeEditPatch` to include
  `discipline`; add a `<select>` of all 6 `Discipline` values (with a small
  local label map — the existing `DISCIPLINE_GROUP_LABEL` only covers the
  4-value UI grouping, not the full 6-value core union) next to the Name
  field; include `discipline` in the patch passed to `onSave`.
- No further wiring needed for the discipline-filter buttons to pick this
  up — `StampsPanel`'s existing `disciplineGroupOf(t.discipline)` filters
  already read the live (now-mutated) `networkTypes` entry.

### Part 8 — Multi-select property editing ("varies" support)
Files: `packages/render/src/scene.ts`,
`packages/ui/src/components/PropertiesPanel.tsx`, `packages/ui/src/App.tsx`

- `scene.ts`: add batch-write methods, each wrapping its whole selection in
  **one** undo transaction (`applyToSelectedStamps` helper): `setRotationForSelection`
  (absolute value, distinct from the existing `rotateSelectionBy` delta/orbit
  behavior used by the ±90° nudge buttons — keep both, they serve different
  UI affordances), `setCapacityForSelection` (loops the existing
  non-transactional `terminalCapacities.set`, keeping today's non-undoable
  behavior as-is per the decision above), `setStampPropertyForSelection`,
  `setColorForSelection`, `setScaleForSelection`. Network type is out of
  scope for stamp multi-select — it's a segment/network-level concept in the
  current model, not a `PlacedStamp` field.
- `PropertiesPanel.tsx`: replace the `selection.length > 1` early-return with
  a real multi-select rendering branch:
  - No X/Y position fields (single-selection only, per the decision).
  - Rotation, Capacity, Custom Properties, Color, Scale: compute the set of
    distinct values across `selection`; if size 1, show/edit that value
    normally; if >1, show a "Varies" placeholder/label instead of a value.
    Editing any field calls the corresponding `...ForSelection` scene method,
    applying to every selected element in one step.
  - When selection mixes stamp categories (terminal + equipment), Custom
    Properties should only show fields valid for all selected categories
    (mirror the existing single-selection category gating, generalized to
    an intersection/union check).
  - Linked-ports checkboxes and "Edit ports…" stay single-selection-only
    (not in the decision's multi-editable list) — keep them out of the new
    multi-select branch.
  - Trace where `capacityInput`'s local text state is keyed/reset in
    `App.tsx` (currently presumably on `selection[0]?.id`) and generalize it
    to the full selection id-set, so it doesn't show a stale value right
    after a multi-select capacity edit or selection change.

## Verification

- `@mepapp/core`: `pnpm --filter @mepapp/core test` — extend
  `project.test.ts` with a case exercising the new 5→6 migration step (old
  document without `color` loads cleanly, `schemaVersion` becomes 6), and
  `schema.test.ts` coverage for the chain still validating with 6 steps.
- Build the whole workspace: `pnpm build` (root, via turbo) — must succeed
  with no TypeScript errors across core/render/ui/apps/web.
- Manual verification in the running web app (`pnpm --filter @mepapp/web dev`,
  or the `run` skill), covering each part:
  1. Pick a stamp tool: a translucent ghost of the stamp follows the cursor;
     pressing Space rotates it by 45° increments; placing it commits at that
     rotation; the next placement (same or different stamp) behaves per the
     reset rules above.
  2. Draw-segment tool: after the first click, a line follows the cursor to
     the second click; disappears correctly on Escape/tool switch.
  3. Start a fresh document, draw a segment: it's tagged with "Supply Air"
     (or whatever `NETWORK_TYPE_LIBRARY[0]` is), never "Unassigned"; the
     Network Types picker never shows an "Unassigned" tile.
  4. Click-select a segment (no drag): that network's fittings appear
     immediately, not only after a drag.
  5. Stamps tab → Network Types sub-tab: every tile shows its color swatch
     immediately, adopted or not. Click a swatch (including one never
     adopted) → dialog opens with a Discipline dropdown; changing discipline
     and saving moves the tile to the correct filter group.
  6. Left rail: no floating Quick Access Toolbar; Select/Copy/Delete appear
     as fixed buttons below Undo/Redo; the top dropdown flyout no longer
     offers Copy/Delete/Rotate-90°; rotation is still reachable via the
     rotation-anchor handle and the Properties panel's ±90° buttons.
  7. Select 2+ stamps with differing rotation/capacity/color/scale: fields
     show "Varies"; typing a new value applies it to all selected, as one
     undo step (single Ctrl+Z reverts the whole batch).
  8. Place a stamp, set a custom color and scale in the Properties panel;
     place another stamp of the *same* definition — it starts with that
     color/scale already applied.

## Progress

### Parts 1-6 (+ Part 4's data model/migration/rendering, minus the
Properties-panel write-back of remembered appearance)

**Done** — 2026-09-13, commit `b009504` on `worktree-drawing-tool-ux-improvements`.

Shipped: default network type is now `NETWORK_TYPE_LIBRARY[0]` (Supply Air)
for new documents/segments, with `DEFAULT_NETWORK_TYPE`/`'default'` kept only
as an internal fallback and excluded from the Stamps tab's picker; fitting
visibility now recomputes on every plain click-select/shift-click/rubber-band/
deselect, not only during a drag; `QuickAccessStrip` removed, replaced by
fixed Select/Copy/Delete buttons in `Rail.tsx` below Undo/Redo, with
Copy/Delete/Rotate-90° dropped from the rail's top flyout and the now-dead
`ToolAction`/`TOOL_META`/quick-access CSS removed; `PlacedStamp.color`
(optional per-instance tint) added to core's model with a `5→6` schema
migration step (version-bump only, no backfill needed); `scene.ts` applies
the tint (`sprite.tint`) on placement, sync, copy/paste, and project-load
restore, and exposes `setColorForSelection`/`setScaleForSelection`/
`setRotationForSelection`/`setStampPropertyForSelection`/
`setCapacityForSelection` (all selection-wide, built on a new shared
`applyToSelectedStamps` one-undo-step helper) for Part 8's multi-select UI;
new `packages/ui/src/stampAppearanceDefaults.ts` (localStorage, keyed by
`definitionId`) is read at pick-time in `StampsPanel.handlePick` and threaded
through an extended `setStampTexture(bitmap, definitionId?, appearanceDefault?)`
— the write-back after a Properties-panel edit is still pending, landing with
Part 8's UI; stamp placement now shows a translucent ghost sprite that
follows the cursor and rotates 45°/Space-press (persisting across placements,
resetting on Escape/tool-switch/re-pick), and the segment tool draws a
rubber-band preview line (in the active network type's color) from the
pending start point to the cursor.

Verified: `pnpm build` clean across all 9 workspace tasks; `pnpm --filter
@mepapp/core test` — 130 tests passing, including a new migration test for
the `5→6` schema step. Not yet manually verified in the running app — that
pass is deferred to the end, once Parts 7-8 also land, per this plan's
Verification section.

### Parts 7-8

**Done** — 2026-09-13, commit `3b49197` on `worktree-drawing-tool-ux-improvements`.

Shipped: `StampsPanel.tsx`'s network-type swatch button renders
unconditionally (no more `isAdopted &&` guard); `scene.ts`'s
`updateNetworkType` now adopts a never-picked library type into the
document before applying its patch, so the editor dialog works even
for a type nobody has drawn a segment with yet; `NetworkTypeEditorDialog.tsx`
gained a Discipline `<select>` (all 6 core `Discipline` values, own
label map) wired through a widened `NetworkTypeEditPatch`; no extra
wiring needed for the discipline filter buttons to pick up a change,
since they already read the live (mutated) `networkTypes` entry.
`PropertiesPanel.tsx`'s `selection.length > 1` branch is now a real
multi-select UI: a `commonValue()` helper drives "same value vs
Varies" for Rotation, Color, Scale %, Capacity, and Custom Properties
(intersected across mixed terminal/equipment categories); each edit
calls one of `scene.ts`'s new `set*ForSelection` methods, all built on
a shared `applyToSelectedStamps` helper that writes every selected
stamp inside one `Transaction` (one undo step for the whole batch).
Position (X/Y) stays single-selection-only per the decision. Added
`PlacedStamp`/`StampInfo.capacity` (read from `terminalCapacities`) so
multi-select capacity has something to diff against — capacity itself
stays non-undoable, a pre-existing gap called out in Context, not
fixed here. Also added the single-selection Appearance section
(Color, Scale %) to `PropertiesPanel.tsx`, completing Part 4's
per-stamp-definition remembered-appearance write-back
(`rememberAppearance()`, called from both the single- and multi-select
color/scale handlers).

Verified: `pnpm exec turbo run build --force` clean across all 9
workspace tasks (forced, not cache-served); `pnpm --filter @mepapp/core
test` — 130 tests passing. Live headless-Chromium Playwright
walkthrough against `fixtures/pdfs/arch_simple_A4.pdf` covering every
item in this plan's Verification section: stamp ghost preview visibly
rotates 45° per Space-press and the placed stamp's rotation matches;
a second placement (same definition) starts at the same persisted
angle; the segment tool's rubber-band line follows the cursor in the
active network type's color; a fresh document's first segment is
tagged "Supply Air", never "Unassigned", and the picker never shows an
"Unassigned" tile; clicking a segment (no drag) shows its fitting
markers immediately; every Network Types tile shows a color swatch
whether adopted or not, and clicking one (including a never-adopted
type) opens a working Discipline dropdown; the rail shows fixed
Select/Copy/Delete below Undo/Redo with no floating Quick Access strip;
and a genuine two-stamp color mismatch (`#ff0000`/`#0000ff`) showed
"Color (Varies)", a multi-set to green landed on both stamps, and one
Undo — confirmed directly at the `CommandManager` level via temporary
debug logging (removed after use) — cleanly restored each stamp's own
prior color in a single step. One color/scale scenario surfaced a
pre-existing, unrelated app behavior worth noting: clicking an already
multi-selected element does not collapse the selection to that one
element (by design, so the group can still be dragged as a whole) —
not a bug, but something to know when testing selection state by
clicking a member of an existing multi-selection.

All 8 parts (9 requested features) are now complete.

### Follow-up fixes (post-merge user review, 2026-09-14)

**Done** — 2026-09-14, on `worktree-drawing-tool-ux-improvements` (branch
already fast-forward-merged to `origin/master` once at `1aef9fd`; these are
additional commits on top, to be merged the same way when requested).

After the merge above, the user reviewed the running app and reported four
issues:

1. **Merge the two electrical disciplines.** `Discipline` (core/network.ts)
   had `electricalPathways`/`electricalCircuits` as separate values even
   though `disciplineGroupOf` already folded both into one `'electrical'` UI
   group. Collapsed the union to a single `'electrical'` value; updated
   `network-type-library.ts` (4 entries), `stamp-library.ts` (2 entries),
   `disciplineGroups.ts`, `NetworkTypeEditorDialog.tsx`, `ElementEditorDialog.tsx`,
   and `NetworkTreePanel.tsx`'s label/order maps. Added schema migration
   6→7 (`project.ts`) remapping any saved `NetworkType`/`customStampDefinitions`
   entry still carrying either old string to `'electrical'`, with a new
   `project.test.ts` case covering it.

2. **Stamp color changes didn't update the canvas.** Root cause, confirmed
   by placing a real fixture stamp and forcing a color edit through
   Playwright: PixiJS `Sprite.tint` is multiplicative
   (`result = pixel * tint / 255`), and the fixture stamps (real CAD symbols,
   per the fixtures policy) are drawn in pure black (`#000000`) — black
   times any tint is still black, so the on-canvas art never visibly
   changed even though the Properties panel's own value updated correctly.
   The old MEPSketcher hit the identical wall (see
   `MepSketcherTools/Utilities/ImageColorizer.cs`) and fixed it by replacing
   each non-transparent pixel with the target color, blended by the
   source pixel's luminance — not tinting. Ported that approach as
   `packages/render/src/colorize.ts`: `getColorizedTexture(baseTexture, colorHex)`
   rasterizes the base texture to a canvas, recolors it pixel-by-pixel with
   the same luminance-blend formula, and caches the result per
   (texture, color) pair so `syncStampSprites` (called on every drawing-layer
   sync, including every mousemove frame of an unrelated drag) doesn't
   rebuild it repeatedly. `StampEntry` gained a `baseTexture` field (the
   pristine, never-recolored texture); `placeStamp`/`syncStampSprites`/
   `pasteClipboard`/`loadProjectFromJson`'s restore path all switched from
   `sprite.tint = hexColorToPixi(...)` to `applyStampColor(sprite, baseTexture, color)`.
   Texture teardown (`SketchDocument.destroy`, `loadProjectFromJson`'s
   reset-before-reload) moved to a new `destroyStampEntries()` helper that
   dedupes shared base textures (consecutive placements of one stamp
   definition share a texture object), releases cached colorized variants,
   and never destroys the shared `Texture.WHITE` singleton
   (`debugPopulateForBenchmark`'s placeholder art) — fixing a latent
   would-be-shared-texture-destroy bug as a side effect of doing the new
   lifecycle correctly, not a separate task.

3. **More elaborate color picker.** Added `packages/ui/src/components/ColorPicker.tsx`:
   a swatch button that opens a popover with a fixed 20-color basic
   palette, a "Last Used" row (up to 8, persisted in `localStorage` under
   `mepapp.colorPicker.lastUsed.v1`), and a native `<input type="color">`
   for anything else. Wired into both stamp Color fields in
   `PropertiesPanel.tsx` (single- and multi-select, the latter showing a
   "?" placeholder swatch for "Varies") and `NetworkTypeEditorDialog.tsx`'s
   Color field. `ElementEditorDialog.tsx`'s Shapes-mode stroke/fill color
   inputs were left as plain native color inputs — out of scope, not
   mentioned by the user.

4. **Stamp placement ghost preview ignored the remembered scale.**
   `rebuildStampGhost()` only ever applied `computeStampBaseScale(...)`
   (the art's native 1:1 size), never `pendingStampTexture.appearanceDefault?.scale`
   — so after changing a stamp's scale, the next same-definition
   placement started at the right (remembered) scale, but its ghost
   preview still showed the original size while aiming. Fixed by
   multiplying the ghost's scale by `appearanceDefault?.scale ?? 1`,
   matching `placeStamp`'s own scale-factor logic. Ghost color intentionally
   left untinted — the user's remark was specifically about size, not color.

Verified: `pnpm --filter @mepapp/core test` — 131 tests passing (one new
migration test added). `pnpm exec turbo run build --force` clean across all
9 workspace tasks. Live headless-Chromium Playwright walkthrough: (a) forced
a stamp's Properties-panel color to red via the panel's own React state
(not just DOM manipulation, to rule out a test artifact) and confirmed the
placed stamp visibly turns red on a deselected canvas screenshot, where it
previously stayed black; (b) opened the new color-picker popover, picked a
basic-palette swatch, confirmed the canvas art updated and the swatch then
appeared under "Last Used" on reopen; (c) set a stamp's scale to 250%,
re-picked the same stamp tile, and confirmed the ghost preview rendered
visibly larger than the already-placed 100%-scale stamp.
