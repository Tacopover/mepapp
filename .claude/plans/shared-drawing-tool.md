# Shared drawing-tool component — plan

Status: **draft. No part is started.** Written 2026-09-23, resolving open question 9 of [[electrical-schematic-templates]]. Revised 2026-09-23 after user review: stamp editor moves to SVG too, ports become a shared module, thumbnail and ports open questions resolved.

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

### Phase 1 — Move pure geometry into `@mepapp/core`, generalize the transform primitives — not started

Move the ~21 renderer-agnostic functions from `packages/ui/src/symbolShapeCanvas.ts` into `packages/core/src/symbol-shape-geometry.ts`. Generalize `translateShape`, `rotateShapeAround`, `gridSnap`, `angleSnap`, and `findNearestSnapPoint` to take plain position/rotation values where practical (§5), keeping `SymbolShape`-typed wrappers for existing call sites. No behavior change. Add vitest coverage (none exists today).

Verify: `pnpm build` and `pnpm test` pass; the stamp editor opens and works exactly as before (manual check — still Canvas2D at this point, Phase 2 migrates it).

### Phase 2 — Extract the shared editor hook and ports module; migrate the stamp editor to SVG — not started

Pull the generic half of `ElementEditorDialog.tsx` (§6) into `useShapeDrawEditor`, and the ports tab/overlay into `usePortEditor`. Build the SVG renderer adapter (§4). Migrate `ElementEditorDialog.tsx`'s live canvas from Canvas2D to the SVG adapter, keeping the Canvas2D bake (§4) as a save-time-only call. This is a real change to a shipped surface's rendering path, not a pure refactor.

Verify: full manual pass of the stamp editor's existing feature list (every tool, undo/redo, handle drag, marquee, angle/grid/object snap, port place/rename/link, image import, save/name-collision) against its current (pre-migration) behavior, plus `pnpm build`/`pnpm test`. Evaluate the single-shared-dialog-shell question (§6) here, once the real shape of both consumers is in front of you.

### Phase 3 — Wire the schematic template editor's free-item tools — not started

Mount the shared hook plus the SVG adapter inside the schematic template editor canvas (built as part of [[electrical-schematic-templates]] Phase 5). Replace the mockup's disabled toolbar strip with real line/rect/circle/text/symbol-placement tools, writing to the template's static-blocks section.

Depends on [[electrical-schematic-templates]] Phase 5 (the template editor itself) existing to mount into.

### Phase 4 — "Create your own symbol" flow — not started

New dialog (or shared shell, per §6): shared hook, SVG adapter, shared ports module, plus a name-and-save form. Writes a `SymbolShape[]` + ports entry to the schematic symbol library, replacing the mockup's disabled "+ Draw your own symbol…" button. Symbol-library thumbnails render the SVG artwork directly at thumbnail size — no raster step.

Depends on the schematic symbol library's real persistence existing (currently a hardcoded `SYMBOL_LIBRARY` array in the mockup only — needs its own small data-model decision, likely mirroring the custom-stamp-library pattern).

### Phase 5 — Regression-check the stamp editor's raster output — not started

After Phase 2's migration, confirm the baked `iconRef` output (pixel size, DPI, rotation/scale bake) is unchanged for a representative sample of existing custom stamps, since the live editing surface changed even though the bake function did not.

Verify: compare baked `iconRef` output for a few existing custom stamps before/after Phase 2, pixel-for-pixel or close to it.

### Phase 6 — Generalize the block-catalogue system's drag/rotate interactions (optional) — not started

Once §5's generalized transform primitives exist, point the template editor's block-catalogue drag/rotate handlers (`attachDrag`/`attachRotateDrag` in the mockup) at them instead of their own hand-written math, so block dragging/rotating feels the same as the shared drawing tool's. Scope this when the template editor (Phase 5 of [[electrical-schematic-templates]]) is being built; fall back to keeping the block system's interactions separate (§7) if this turns out awkward in practice.

## 9. Open questions

1. ~~**Thumbnail rasterization.**~~ **Resolved 2026-09-23:** SVG thumbnails render directly at thumbnail size. No raster step for the symbol library.
2. ~~**Ports for schematic symbols.**~~ **Resolved 2026-09-23:** yes, needed — connection points for annotations (lines) to snap to, matching the old MEPSketcher app's behavior. See §6's shared ports module.
3. **Naming collision.** The mockup's own `SYMBOL_LIBRARY` constant (a hardcoded array of 10 placeholder entries) needs a new name once real code lands near `symbol-shapes.ts`/`symbolShapeCanvas.ts`, which already use "symbol" terminology.
4. **Later unification of the block-catalogue system.** Could the semantic blocks (§7) eventually be redefined as `SymbolShape`s with a bound-text extension, removing the separate `mkBlock` model entirely? Not needed for v1, worth revisiting once the shared tool is proven in Phases 1-5.
5. **One shared dialog shell or two.** §6 flags this for a decision during Phase 2, once the stamp dialog's and the schematic symbol dialog's real remaining differences (save step, metadata fields) are in front of the implementer.

## 10. Non-goals

- Migrating the schematic template's semantic block-catalogue system onto `SymbolShape` (§7) — its data model and rendering stay bespoke; only its interaction math is a reuse candidate (Phase 6, optional).
- Deciding how the generated (read-only) schematic view renders (Phase 4 of [[electrical-schematic-templates]]) or whether it exports to PDF (that plan's open question 2). This plan is about the editing tools, not the final render target for finished schematics.
- Building the schematic symbol library's persistence model beyond what Phase 4 needs minimally — a full design (built-in vs per-document, per [[electrical-schematic-templates]] open question 1) is out of scope here.
