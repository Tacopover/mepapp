# Shared drawing-tool component — plan

Status: **Phases 1, 2, 3, 4 and 5 done; Phase 6 closed without code (2026-09-25).** Written 2026-09-23, resolving open question 9 of [[electrical-schematic-templates]]. Revised 2026-09-23 after user review: stamp editor moves to SVG too, ports become a shared module, thumbnail and ports open questions resolved.

## 1. Goal

Three parts of the app need the same free-form drawing tool: place and edit a line, a rectangle, a circle, an ellipse, an arc, a polygon, a text label, or an image, with select, move, rotate, scale, and undo.

1. The custom-stamp editor (`ElementEditorDialog.tsx`). Shipped and working today, Canvas2D-based.
2. The electrical schematic template editor's free items (frame, title block, free text). Not built yet. The Phase 0 mockup reserves a disabled toolbar strip for this.
3. A "create your own symbol" flow for the schematic symbol library. Not built yet. The mockup has a disabled "+ Draw your own symbol…" button with no code behind it.

This plan designs one shared tool for all three, instead of three separate builds. It follows [[electrical-schematic-templates]] open question 9.

## 2. Sources

- `packages/core/src/symbol-shapes.ts` — the `SymbolShape` union type.
- `packages/ui/src/symbolShapeCanvas.ts` — geometry and drawing functions for `SymbolShape`.
- `packages/ui/src/components/ElementEditorDialog.tsx` — the stamp editor dialog. ~1700 lines.
- `.claude/plans/electrical-schematic-templates.md` — open question 9.
- `.claude/plans/electrical-schematic-mockup/mockup.html` — the Phase 0 mockup. The reserved toolbar strip is near line 438. The symbol library modal is near line 989.

## 3. What already exists, and where the line falls

`symbol-shapes.ts` has no stamp-specific fields. It is already generic. Only `StampDefinition` (in `stamp-library.ts`) points to it, one way.

`symbolShapeCanvas.ts` has about 24 exported functions. Only three touch a canvas or the DOM: `drawSymbolShapes` (draws to a `CanvasRenderingContext2D`), `loadShapeImages` (loads images with the browser `Image` API), and `rasterizeSymbolShapes` (makes an offscreen canvas and calls `canvas.toDataURL`). The other ~21 functions are pure math: hit-testing, bounds, handles, handle-drag, draft creation, selection, mirror, scale, rotate, translate, and snapping. They take numbers and `SymbolShape` objects and return numbers and `SymbolShape` objects. They do not touch a canvas or the DOM.

`ElementEditorDialog.tsx` splits the same way. The tool palette, the view (pan/zoom), the draft/handle/marquee/select interactions, the undo stack, and the style toolbar are all generic — they call only the pure functions above. The stamp-specific parts: the ports tab, `StampDefinition` save and name-collision logic, the `name`/`discipline`/`category`/`nativeWidth`/`nativeHeight` fields, and the rescale-on-physical-size-edit effect.

The mockup's template editor canvas is a different thing altogether. It is raw SVG with hand-written `pointerdown`/`pointermove` drag and rotate math, working in fixed pixel coordinates (a 640×400 `viewBox`), with no undo and no fractional coordinate convention. Its "blocks" (`mkBlock`: `{id, type, x, y, rotation}`) are a separate data shape from `SymbolShape` — each block type (breaker, busbar, frame, …) has its own hardcoded multi-element draw function and a text-binding string. **This plan does not fold that semantic block system into the shared tool's data model.** Only the free-item toolbar strip (line/rect/circle/text/symbol — the mockup's reserved, disabled row) uses the shared tool directly. See §7 for what the block system reuses instead.

## 4. The rendering-target decision

**Decision: all three interactive editing surfaces render live as SVG. Canvas2D is kept only as a save-time bake step for the stamp editor.**

The first pass of this plan kept the stamp editor on Canvas2D, reasoning that stamps need a rasterized `iconRef` because they end up as PixiJS sprites on the main drawing canvas. On review, that reasoning conflated two different things: the *output format* the stamp editor must produce (a raster image, unchanged) and the *surface the user interacts with while drawing* (which does not need to match the output format). `rasterizeSymbolShapes` already creates its own offscreen `<canvas>` and does not depend on whatever is on screen — so the live editing canvas is free to be SVG, and the bake step still runs once, at save time, calling the same unchanged `drawSymbolShapes`/`rasterizeSymbolShapes`/`loadShapeImages` functions against that offscreen canvas.

With that resolved, one SVG renderer now serves all three surfaces:

1. **The three dialogs converge on nearly the same interface.** The stamp editor and the schematic symbol editor differ only in their save step (bake to raster `iconRef` plus `StampDefinition` fields, versus a plain `SymbolShape[]` entry) — ports are no longer a difference, since schematic symbols need them too (§6). One shared drawing surface, one shared interaction feel, across all three.
2. **The mockup's SVG choice for the template editor stands**, for the reasons already established: schematics are print documents headed toward PDF export ([[electrical-schematic-templates]] open question 2), and bound text (`{cable.type} {cable.cores}G …`) fits SVG's document model better than a raster canvas.
3. **SVG thumbnails work directly** for the schematic symbol library picker — no raster step needed there either (resolves former open question 1, §9).

Canvas2D's only remaining job: the stamp editor's save-time bake to a raster `iconRef`, because stamps are placed as PixiJS sprites on the main drawing canvas. That requirement is real and stays. Nothing else in the app needs a raster form of a `SymbolShape[]` artwork.

## 5. Package placement

Move the ~21 pure-geometry functions from `packages/ui/src/symbolShapeCanvas.ts` into `@mepapp/core` (for example `packages/core/src/symbol-shape-geometry.ts`), next to `symbol-shapes.ts`. This matches `@mepapp/core`'s existing role: headless domain math with vitest coverage, no rendering. These functions have no tests today; moving them is also the chance to add vitest coverage, the same bar the rest of `@mepapp/core` holds.

While moving them, generalize the handful that currently take a whole `SymbolShape` but only actually need its position/rotation (`translateShape`, `rotateShapeAround`, and the snap helpers `gridSnap`/`angleSnap`/`findNearestSnapPoint`) to operate on plain `{x, y}`/`rotation` values where practical, with thin `SymbolShape`-typed wrappers kept for the existing call sites. This is what makes §7's block-catalogue reuse possible without those functions caring what a "block" is.

`packages/ui/src/symbolShapeCanvas.ts` keeps only the three Canvas2D-coupled functions (`drawSymbolShapes`, `loadShapeImages`, `rasterizeSymbolShapes`). Its role narrows to "stamp save-time raster bake" — worth a rename (for example `stampArtworkRasterizer.ts`) when Phase 2 touches it, so the filename doesn't imply it's still the live renderer.

A new SVG renderer adapter (draws `SymbolShape[]` to real SVG elements, reusing the same hit-test/bounds/handle functions from `@mepapp/core` unchanged) lives in `packages/ui`, alongside the bake module — not in `@mepapp/render`. `@mepapp/render` is the PixiJS scene graph for the main PDF canvas; none of the three editing surfaces draws into that scene — all three are separate editing surfaces, the same way `ElementEditorDialog` is today. [[electrical-schematic-templates]] §5's package-placement note ("`@mepapp/render` — draws … the template editor canvas") is marked a proposal, not settled; this plan supersedes it for the template editor's canvas ownership.

## 6. Shared component design

Extract a shared editor hook (working name `useShapeDrawEditor`) from `ElementEditorDialog.tsx`'s generic half: tool selection, draft shape create/update, selected-id set, marquee rectangle, multi-click polygon/arc-three-point accumulation, handle-drag, undo/redo (`CommandManager<SymbolShape[]>` from `@mepapp/core`, already generic), view pan/zoom, and keyboard shortcuts. The hook takes a `SymbolShape[]` and returns the same shape list plus editor state and event handlers, and pairs with the one SVG renderer adapter (§4). It does not know about ports, `StampDefinition`, or schematic blocks.

**Ports become a second shared module**, not a stamp-only feature. Schematic symbols need ports for the same reason stamps do: fixed connection points that annotations (lines) snap to, matching how the old MEPSketcher app behaves. Extract the ports tool (place/rename/link/remove a `PortSpec`) and the port overlay rendering into a shared piece (working name `usePortEditor`, plus its overlay) used by both the stamp dialog and the schematic symbol dialog. The template editor's free-item tools do **not** get this module: a symbol placed there is a reference to an already-drawn library symbol, whose ports were fixed when it was created — the template editor places and rotates the symbol, it doesn't re-edit its ports.

With both the drawing surface and ports shared, the stamp dialog and the schematic symbol dialog differ only in:
- The save step: stamp saves `StampDefinition` (metadata fields, raster bake, name-collision check against `STAMP_LIBRARY`); schematic symbol saves a plain `SymbolShape[]` + ports entry (name, no raster, no `StampDefinition` fields).
- `labelLanguage` handling, which only matters for stamps (the Labels tab is currently an unimplemented "Coming soon" stub either way — nothing to share there yet).

Given how small that remaining difference is, **Phase 2 should evaluate building one shared dialog shell with a pluggable save step**, rather than two separately-maintained dialogs that both wrap the same hooks. Decide this concretely once Phase 2 is scoped — it may turn out the metadata-field differences (discipline/category/native size, which schematic symbols don't have) are enough to keep two thin dialog shells around one shared body. Either way, the shared hook, the SVG adapter, and the ports module are single implementations.

Concretely:
1. `ElementEditorDialog.tsx` is refactored to call the shared hook, the SVG adapter, and the shared ports module. Its `StampDefinition` save logic and metadata fields stay as they are. This is a real rendering migration (Canvas2D → SVG for the live canvas), not a no-op refactor — see Phase 2's verification note.
2. A new dialog (or the same shared shell, per the note above) for the "create your own symbol" flow wraps the shared hook, the SVG adapter, and the shared ports module. Its save step writes a `SymbolShape[]` + ports artwork entry to the schematic symbol library.
3. The schematic template editor mounts the shared hook's free-item tools (line/rect/circle/text/symbol-placement) as an extra layer inside its existing SVG canvas — the mockup's reserved toolbar strip becomes real. Free items produced this way are stored as `SymbolShape[]` inside the template's static-blocks section (§8 of [[electrical-schematic-templates]]), separate from the semantic block-catalogue list. No ports module here (see above).

## 7. What does not get unified, and what it reuses instead

The schematic template editor's semantic, bound blocks (breaker, busbar, frame, cable text, table cell, …) keep their own bespoke SVG draw functions, their own `mkBlock` data model, and their own binding-string system, per §3. They are not `SymbolShape`s: they carry a catalogue role and a data binding, not raw geometry the user free-draws. Folding them into `SymbolShape` later is a real possible direction — flagged in §9 as an open question — but this plan does not do it now.

What the block system *should* reuse: the low-level interaction math, not the data model. Today the mockup hand-writes its own drag delta and rotate-handle angle math (`attachDrag`, `attachRotateDrag`) with a hardcoded 5° rotate snap and no other snapping. Once §5's generalized `translateShape`/`rotateShapeAround`/`gridSnap`/`angleSnap`/`findNearestSnapPoint` primitives exist in `@mepapp/core` taking plain position/rotation values, the block system's drag and rotate handlers can call the same primitives the shape editor uses, instead of their own copy. That gets the block-catalogue system the same drag feel, the same configurable angle snap, and the same snap-to-other-objects behavior as the shared drawing tool, without requiring blocks to become `SymbolShape`s or routing through the full `useShapeDrawEditor` hook (which is shape-kind-specific: draft creation, resize handles, and hit-testing for line/rect/circle/etc. don't apply to a catalogue block). This reuse is small and optional — if it turns out awkward when Phase 6 (below) is scoped, building the block system's interactions separately, as the mockup already does, remains an acceptable fallback.

## 8. Phases

### Phase 1 — Move pure geometry into `@mepapp/core`, generalize the transform primitives

**Done** — 2026-09-23, commit `df4fb7c` on `worktree-shared-drawing-tool-plan`.

Shipped: moved the ~21 renderer-agnostic functions (hit-test, bounds,
handles, handle-drag, draft create/update, selection, mirror, scale,
rotate, translate, snapping — plus their private helpers and the types
`ShapeHandle`/`ShapeDrawTool`/`SnapPoint`) from
`packages/ui/src/symbolShapeCanvas.ts` into
`packages/core/src/symbol-shape-geometry.ts`, exported from
`@mepapp/core`'s barrel. `symbolShapeCanvas.ts` re-exports them from
`@mepapp/core`, so `ElementEditorDialog.tsx` needed zero changes; it
now keeps only the three Canvas2D/DOM-coupled functions
(`drawSymbolShapes`, `loadShapeImages`, `rasterizeSymbolShapes`).

Generalized `translateShape` and `rotateShapeAround` by extracting
plain-value `translatePoint`/`rotatePoint` primitives that a later
phase can reuse for the template editor's block-catalogue drag system
without it adopting `SymbolShape` (§7, Phase 6). `gridSnap`,
`angleSnap`, and `findNearestSnapPoint` were already plain-value —
moved as-is. Note: the extracted rotation primitive is named
`rotatePoint`, not `rotatePointAround` as originally planned in §5 —
`packages/core/src/geometry.ts` already exports a differently-shaped
`rotatePointAround` (degrees, `Vec2`) that the name would have
collided with.

Verified: `packages/core` vitest suite 188/188 passing (37 new tests
in `symbol-shape-geometry.test.ts`, no regressions in the other 15
files), independently re-run, not just taken from the implementing
agent's report. Root `pnpm build` (turbo, all 9 workspace tasks)
passes, confirming `ElementEditorDialog.tsx` and the rest of
`@mepapp/web` typecheck unchanged against the new re-exports. No
in-browser check yet — nothing user-visible changed in this phase.

### Phase 2 — Extract the shared editor hook and ports module; migrate the stamp editor to SVG

**Done** — 2026-09-23, commits `62e2cf6` (step 1/2: extraction) and
`fa15afb` (step 2/2: the renderer swap) on
`worktree-shared-drawing-tool-plan`.

Shipped in two checkpoints, deliberately kept separable so the
state-extraction and the render-target change could each be verified
on their own:

Step 1 pulled `ElementEditorDialog.tsx`'s generic half into
`useShapeDrawEditor` (tool palette, draft/marquee/handle/select, undo,
view pan/zoom, keyboard shortcuts) and its ports tab/overlay into
`usePortEditor`, as pure refactors — the Canvas2D draw effect stayed
untouched, only reading from the hooks' state instead of local state.
Confirmed behavior-preserving by diffing the draw effect's dependency
array against `HEAD`: byte-for-byte identical, including a
pre-existing `snapIndicator` omission that predates this change (not
introduced by it). Also built the SVG renderer adapter
(`symbolShapeSvg.tsx`), unwired.

Step 2 replaced the `<canvas>` with the SVG adapter for live editing.
The interaction model is unchanged: a full-viewport transparent
hit-rect on the root `<svg>` (outside the pan/zoom `<g>`) catches
every pointer event, while shapes and all chrome are
`pointer-events: none` (inherited from one wrapping `<g>`), so
everything still funnels through `fractionFromEvent` +
`hitTestSymbolShape` — never native SVG per-element hit-testing. Same
pattern the schematic mockup's own SVG editor already uses for its
block drag handles. All chrome (bounds rect, selection outlines,
marquee, rotate/scale/geometry handles, snap indicator, polygon/arc
preview) became render-time JSX, a 1:1 translation of the old
Canvas2D calls' colors, dash patterns, and the
`chromeScale = 1/view.scale` convention. Canvas2D's only remaining job
is the stamp editor's save-time raster bake
(`rasterizeSymbolShapes`, textually unchanged — it already loaded its
own images independent of the live canvas). Deleted the now-dead
`imageCacheRef`/`loadShapeImages` live-loading effect.

Verified beyond build/test, per this repo's own bar for UI changes
(see `feedback-verify-ui-wiring-via-real-dom-not-scene-api` — drive
real DOM, not just the scene API): a Playwright walkthrough against a
running build (production `vite preview`, since the dev server's file
watcher hit this container's inotify limit) — opened the custom
element editor, drew a rectangle, selected it through the new
hit-testing path, dragged it (position changed), undid the drag
(reverted), dragged the rotate handle (`transform="rotate(...)"`
applied), dragged a corner resize handle (width changed), placed a
port (overlay div appeared), and saved (dialog closed cleanly, no
console/page errors at any point). A mid-walkthrough screenshot
confirms the selection outline, all four corner handles, and the
rotate handle render correctly. 188 core + 13 ui tests pass; root
build passes.

Not resolved here (as anticipated in §6/§9 open question 5): whether
the stamp dialog and the schematic symbol dialog end up as one shared
shell or two thin shells around the same hooks — there is still only
one real consumer (the stamp editor) until Phase 4 builds the second,
so that evaluation stays deferred to Phase 4, where it can be made
with both consumers' actual shapes in view.

### Phase 3 — Wire the schematic template editor's free-item tools — **Done** (2026-09-25)

**Done** — 2026-09-25, commits `2d16143` and `4178964`. Free items are `drawing` blocks in the template (sheet or per circuit); the drawing surface is shared with the stamp editor (`ShapeDrawSurface`, `ShapeDrawToolbar`). Browser-verified, including a stamp editor regression pass. Details and gaps: [[electrical-schematic-templates]] Phase 5 done-note.

Mount the shared hook plus the SVG adapter inside the schematic template editor canvas (built as part of [[electrical-schematic-templates]] Phase 5). Replace the mockup's disabled toolbar strip with real line/rect/circle/text/symbol-placement tools, writing to the template's static-blocks section.

Depends on [[electrical-schematic-templates]] Phase 5 (the template editor itself) existing to mount into.

### Phase 4 — "Create your own symbol" flow — **Done** (2026-09-25)

**Done** — 2026-09-25, commits `5397030` (core), `92b985f` (storage, shared port parts) and `eb90c95` (UI) on `worktree-shared-drawing-tool-plan`, built on top of `worktree-electrical-schematic-templates-plan`.

Shipped:
- Core: `SchematicSymbol` (`id`, `name`, `widthMm`, `heightMm`, `shapes`, `ports`, `portGroups`), `validateSchematicSymbol`, `countSymbolUses`, `addSymbolBlock`, `detachBlockSymbol`. `validateSchematicTemplate` accepts `symbolId` only on a `drawing` block.
- Storage: `schematicSymbolStorage.ts`, per installation in localStorage (`mepapp.schematicSymbols`), beside the template storage. It moves with templates when templates plan Phase 6 decides where both live.
- UI: `SchematicSymbolEditor` (name, size in mm, all shape tools, Port tool, ports sidebar), `SchematicSymbolLibrary` (SVG thumbnails, "+ Draw your own symbol…", Edit, Copy, Delete with a used-by warning), and `PortMarkers`/`PortsSidebar`/`PORT_SHAPE_TOOL_DEFS` shared with the stamp editor. Both views replace the template editor body in place.
- Template editor: palette buttons "Symbol…" and "Symbol (each circuit)…"; a symbol is a `drawing` block with `symbolId` and no `shapes`. The block follows the library, so editing a symbol updates every block that uses it. "Change…" swaps the symbol. "Detach to drawing" copies the shapes into the block. A deleted symbol leaves a dashed box with "?".

Decisions (reversible):
- Reference, not copy. A block stores `symbolId`, so a template that leaves this installation loses its art. Phase 6 of the templates plan (export) must bundle the symbols a template uses.
- No built-in symbols yet. The library starts empty.
- Symbol names are not checked for duplicates.
- Ports are stored and drawn in the editor, but nothing snaps to them yet. Annotations on the schematic do not exist. A sheet-position helper for ports comes with that feature.
- Size edits stretch shapes and ports together (fractions), the same as resizing a drawing block. There is no "canvas resize" rescale like the stamp editor's.

Verified: core 376 tests, ui 36 tests, root `pnpm build` 9 of 9. Headless Chromium (Playwright, built bundle): stamp editor regression (ports, rename, link, save, reopen); symbol library (empty state, name validation, thumbnail with shapes, place, one undo step, each-circuit repeat across 6 sample circuits, edit propagates to placed blocks, change, detach, copy, delete with warning and "?" box, localStorage round trip, generated schematic view). No console or page errors. Not checked: Windows, touch, the library after a page reload (the panel is gone after reload).

Known rough edges: the symbol editor's dialog title still reads "Schematic template". The name field wraps the size fields to a second row. A sheet block and a group block can share an id (`drawing-1`), as before.

**Original spec:**

New dialog (or shared shell, per §6): shared hook, SVG adapter, shared ports module, plus a name-and-save form. Writes a `SymbolShape[]` + ports entry to the schematic symbol library, replacing the mockup's disabled "+ Draw your own symbol…" button. Symbol-library thumbnails render the SVG artwork directly at thumbnail size — no raster step.

Depends on the schematic symbol library's real persistence existing (currently a hardcoded `SYMBOL_LIBRARY` array in the mockup only — needs its own small data-model decision, likely mirroring the custom-stamp-library pattern).

### Phase 5 — Regression-check the stamp editor's raster output

**Done** — 2026-09-23, folded into Phase 2's own commits (no separate
commit — see `62e2cf6`/`fa15afb`), closed out by inspection rather
than an empirical pixel-diff, for a reason stronger than that diff
would have given: `rasterizeSymbolShapes` was untouched by both Phase
1 (which moved everything else out of `symbolShapeCanvas.ts` but left
the three Canvas2D functions alone) and Phase 2 (confirmed by
`git show fa15afb -- packages/ui/src/components/ElementEditorDialog.tsx`
touching no line inside `buildDefinition`, its caller). Same function,
same inputs, same call site — the output is identical for *any* input,
not just a sampled one, which is a stronger guarantee than a
pixel-diff over a handful of stamps would have been. The Playwright
walkthrough in Phase 2 additionally exercised this path live (drew a
shape, placed a port, clicked Create) and it completed with no
console or page errors, confirming the pipeline still runs end to end
in the browser, not just in isolation.

### Phase 6 — Generalize the block-catalogue system's drag/rotate interactions (optional) — **Closed, not done** (2026-09-25)

Not done, by decision. The template editor's drag, rotate, resize and grid-snap math already lives in `@mepapp/core` (`schematic-template-edit.ts`: `snapToGrid`, `rotationFromPointer`, `resizeKeepingCorner`, `toBlockAxes`) with tests. It works in millimetres and degrees on blocks that have a catalogue size and a rotation-aware resize. The shared tool's primitives work in fractions and radians on shapes. Pointing one at the other would add conversion code and remove none. The visible differences are modifier keys (Alt turns off the grid in the block editor; the shape editor has a toggle) and the default rotation snap. Those are a behaviour choice, not shared code. Revisit only if the user wants the two editors to feel identical.

**Original spec:**

Once §5's generalized transform primitives exist, point the template editor's block-catalogue drag/rotate handlers (`attachDrag`/`attachRotateDrag` in the mockup) at them instead of their own hand-written math, so block dragging/rotating feels the same as the shared drawing tool's. Scope this when the template editor (Phase 5 of [[electrical-schematic-templates]]) is being built; fall back to keeping the block system's interactions separate (§7) if this turns out awkward in practice.

## 9. Open questions

1. ~~**Thumbnail rasterization.**~~ **Resolved 2026-09-23:** SVG thumbnails render directly at thumbnail size. No raster step for the symbol library.
2. ~~**Ports for schematic symbols.**~~ **Resolved 2026-09-23:** yes, needed — connection points for annotations (lines) to snap to, matching the old MEPSketcher app's behavior. See §6's shared ports module.
3. ~~**Naming collision.**~~ **Resolved 2026-09-25:** the type is `SchematicSymbol` in `@mepapp/core/schematic-symbol.ts`; the mockup's `SYMBOL_LIBRARY` array is gone. The stamp side keeps `SymbolShape`.
4. **Later unification of the block-catalogue system.** Could the semantic blocks (§7) eventually be redefined as `SymbolShape`s with a bound-text extension, removing the separate `mkBlock` model entirely? Not needed for v1, worth revisiting once the shared tool is proven in Phases 1-5.
5. ~~**One shared dialog shell or two.**~~ **Resolved 2026-09-25: two shells, shared parts.** The stamp editor stays a `Dialog`. The symbol editor is an in-place view inside `SchematicDialog` (a second `Dialog` would close both on Escape). They share `useShapeDrawEditor`, `usePortEditor`, `ShapeDrawSurface`, `ShapeDrawToolbar` and, new in Phase 4, `PortMarkers`/`PortsSidebar` (`PortEditorParts.tsx`) and `PORT_SHAPE_TOOL_DEFS`. Their remaining differences are real: the stamp editor has discipline, category, image import, name-collision prompts and a raster bake; the symbol editor has a mm size and no raster step.

## 10. Non-goals

- Migrating the schematic template's semantic block-catalogue system onto `SymbolShape` (§7) — its data model and rendering stay bespoke; only its interaction math is a reuse candidate (Phase 6, optional).
- Deciding how the generated (read-only) schematic view renders (Phase 4 of [[electrical-schematic-templates]]) or whether it exports to PDF (that plan's open question 2). This plan is about the editing tools, not the final render target for finished schematics.
- Building the schematic symbol library's persistence model beyond what Phase 4 needs minimally — a full design (built-in vs per-document, per [[electrical-schematic-templates]] open question 1) is out of scope here.
