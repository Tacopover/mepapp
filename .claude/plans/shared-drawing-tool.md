# Shared drawing-tool component — plan

Status: **draft. No part is started.** Written 2026-09-23, resolving open question 9 of [[electrical-schematic-templates]].

## 1. Goal

Three parts of the app need the same free-form drawing tool: place and edit a line, a rectangle, a circle, an ellipse, an arc, a polygon, a text label, or an image, with select, move, rotate, scale, and undo.

1. The custom-stamp editor (`ElementEditorDialog.tsx`). Shipped and working today.
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

The mockup's template editor canvas is a different thing altogether. It is raw SVG with hand-written `pointerdown`/`pointermove` drag and rotate math, working in fixed pixel coordinates (a 640×400 `viewBox`), with no undo and no fractional coordinate convention. Its "blocks" (`mkBlock`: `{id, type, x, y, rotation}`) are a separate data shape from `SymbolShape` — each block type (breaker, busbar, frame, …) has its own hardcoded multi-element draw function and a text-binding string. **This plan does not fold that semantic block system into the shared tool.** Only the free-item toolbar strip (line/rect/circle/text/symbol — the mockup's reserved, disabled row) is in scope. See §7.

## 4. The rendering-target decision

**Decision: keep Canvas2D for the stamp editor. Build a new SVG renderer for the two schematic surfaces. Share the pure-geometry layer between both.**

Reason: the geometry layer (hit-test, bounds, handles, drag math, snapping — ~21 of 24 functions in `symbolShapeCanvas.ts`) already does not care which renderer draws the result. Only a thin draw function differs per target. That makes "one rendering target for everyone" the wrong question — the real design has one shared geometry core and small, swappable draw adapters.

Given that, the target choice is really: what should the *new* schematic surfaces use? Three reasons point to SVG, not Canvas2D and not a PixiJS scene:

1. **The mockup already committed to SVG**, and the user already reviewed and signed off on it (Phase 0, 2026-09-23). Moving the schematic surfaces to Canvas2D or Pixi throws that validated design away and re-derives drag/rotate math the mockup already has.
2. **Schematics are print documents.** [[electrical-schematic-templates]] open question 2 asks whether the generated schematic exports to PDF or inserts into the drawing sheet. An SVG document is a much shorter path to vector PDF output (well-known SVG-to-PDF conversion) than a Canvas2D raster or a WebGL/Pixi scene graph would be. Text stays selectable and crisp at any zoom.
3. **Text and data-binding fit SVG's document model.** A cable-text binding like `{cable.type} {cable.cores}G {cable.size} mm2` is a `<text>` node with a computed string — natural in an SVG document tree, more work to lay out and re-measure on a raster canvas.

Migrating the stamp editor off Canvas2D is a non-goal: it is shipped, tested by use, and produces a rasterized `iconRef` because stamps are placed as PixiJS sprites on the main drawing canvas. Nothing about that output requirement changes, so there is no forcing reason to touch its renderer.

## 5. Package placement

Move the ~21 pure-geometry functions from `packages/ui/src/symbolShapeCanvas.ts` into `@mepapp/core` (for example `packages/core/src/symbol-shape-geometry.ts`), next to `symbol-shapes.ts`. This matches `@mepapp/core`'s existing role: headless domain math with vitest coverage, no rendering. These functions have no tests today; moving them is also the chance to add vitest coverage, the same bar the rest of `@mepapp/core` holds.

`packages/ui/src/symbolShapeCanvas.ts` keeps only the three Canvas2D-coupled functions (`drawSymbolShapes`, `loadShapeImages`, `rasterizeSymbolShapes`) and becomes the Canvas2D renderer adapter.

A new SVG renderer adapter (draws `SymbolShape[]` to real SVG elements, reusing the same hit-test/bounds/handle functions from `@mepapp/core` unchanged) lives in `packages/ui`, next to the Canvas2D adapter — not in `@mepapp/render`. `@mepapp/render` is the PixiJS scene graph for the main PDF canvas; neither the stamp editor nor the schematic template editor draws into that scene — both are separate editing surfaces, the same way `ElementEditorDialog` is today. [[electrical-schematic-templates]] §5's package-placement note ("`@mepapp/render` — draws … the template editor canvas") is marked a proposal, not settled; this plan supersedes it for the template editor's canvas ownership.

## 6. Shared component design

Extract a shared editor hook (working name `useShapeDrawEditor`) from `ElementEditorDialog.tsx`'s generic half: tool selection, draft shape create/update, selected-id set, marquee rectangle, multi-click polygon/arc-three-point accumulation, handle-drag, undo/redo (`CommandManager<SymbolShape[]>` from `@mepapp/core`, already generic), view pan/zoom, and keyboard shortcuts. The hook takes a `SymbolShape[]` and returns the same shape list plus editor state and event handlers. It does not know about ports, `StampDefinition`, or schematic blocks.

Each consumer supplies:
- A renderer adapter (Canvas2D or SVG) that draws `SymbolShape[]` plus the hook's selection/handle/marquee/draft state.
- Its own chrome around the shared tool palette: the stamp editor keeps its ports tab and save/dedup logic; the schematic "create your own symbol" flow gets a small name-plus-save form with no ports tab; the schematic template editor's free-item strip mounts the shared tool inside the existing SVG canvas, alongside the block-catalogue's own bespoke rendering.

Concretely:
1. `ElementEditorDialog.tsx` is refactored to call the shared hook plus the (unchanged) Canvas2D adapter. Its ports tab, `StampDefinition` save logic, and metadata fields stay as they are. This should be behavior-preserving — same dialog, same features, less duplicated logic.
2. A new `SymbolDrawEditor` (or similar) component wraps the shared hook plus the new SVG adapter, for the "create your own symbol" flow. Its save step writes a `SymbolShape[]` artwork entry to the schematic symbol library: name plus shapes, no ports, no dedup against `STAMP_LIBRARY`.
3. The schematic template editor mounts the shared hook's free-item tools (line/rect/circle/text/symbol-placement) as an extra layer inside its existing SVG canvas — the mockup's reserved toolbar strip becomes real. Free items produced this way are stored as `SymbolShape[]` inside the template's static-blocks section (§8 of [[electrical-schematic-templates]]), separate from the semantic block-catalogue list.

## 7. What does not get unified

The schematic template editor's semantic, bound blocks (breaker, busbar, frame, cable text, table cell, …) keep their own bespoke SVG draw functions and `x/y/rotation` model, per §3 above. They are not `SymbolShape`s: they carry a catalogue role and a data binding, not raw geometry the user free-draws. Folding them into `SymbolShape` later is a real possible direction — flagged in §9 as an open question — but this plan does not do it now, to keep scope to the actual open question (free-form drawing, not the whole block system).

## 8. Phases

### Phase 1 — Move pure geometry into `@mepapp/core` — not started

Move the ~21 renderer-agnostic functions from `packages/ui/src/symbolShapeCanvas.ts` into `packages/core/src/symbol-shape-geometry.ts`. No behavior change. Add vitest coverage (none exists today). `packages/ui/src/symbolShapeCanvas.ts` imports from core; `ElementEditorDialog.tsx` keeps working unchanged.

Verify: `pnpm build` and `pnpm test` pass; the stamp editor opens and works exactly as before (manual check).

### Phase 2 — Extract the shared editor hook — not started

Pull the generic half of `ElementEditorDialog.tsx` (§6) into `useShapeDrawEditor`. Refactor `ElementEditorDialog.tsx` to consume it. Behavior-preserving — no visible change to the stamp editor.

Verify: existing stamp-editor behavior unchanged (manual check against the current feature set: tools, undo, snapping, handles).

### Phase 3 — Build the SVG renderer adapter — not started

New SVG draw function for `SymbolShape[]`, reusing the Phase 1 geometry unchanged. No consumer yet.

Verify: a small standalone test/story renders each `SymbolShape` kind correctly in SVG.

### Phase 4 — Wire the schematic template editor's free-item tools — not started

Mount the shared hook plus the SVG adapter inside the schematic template editor canvas (built as part of [[electrical-schematic-templates]] Phase 5). Replace the mockup's disabled toolbar strip with real line/rect/circle/text/symbol-placement tools, writing to the template's static-blocks section.

Depends on [[electrical-schematic-templates]] Phase 5 (the template editor itself) existing to mount into.

### Phase 5 — "Create your own symbol" flow — not started

New small dialog: shared hook plus SVG adapter plus a name-and-save form. Writes a `SymbolShape[]` entry to the schematic symbol library, replacing the mockup's disabled "+ Draw your own symbol…" button.

Depends on the schematic symbol library's real persistence existing (currently a hardcoded `SYMBOL_LIBRARY` array in the mockup only — needs its own small data-model decision, likely mirroring the custom-stamp-library pattern).

## 9. Open questions

1. **Thumbnail rasterization.** Does the symbol-library picker grid need a raster thumbnail (like the stamp palette's icons), reusing the existing `rasterizeSymbolShapes` for that one purpose, or can it render the SVG artwork directly at thumbnail size? Leaning toward direct SVG rendering — no reason to raster something already vector — but flagging since the stamp palette's precedent is raster icons.
2. **Ports for schematic symbols.** Stamps carry `PortSpec` connection points for wires drawn across a PDF. Do schematic symbols (breaker, meter, …) need the same, or does the template's catalogue-driven layout (blocks slot into a circuit group at fixed offsets, not user-routed wires) make ports unnecessary? Needs a decision before Phase 5's save form is finalized.
3. **Naming collision.** The mockup's own `SYMBOL_LIBRARY` constant (a hardcoded array of 10 placeholder entries) needs a new name once real code lands near `symbol-shapes.ts`/`symbolShapeCanvas.ts`, which already use "symbol" terminology.
4. **Later unification of the block-catalogue system.** Could the semantic blocks (§7) eventually be redefined as `SymbolShape`s with a bound-text extension, removing the separate `mkBlock` model entirely? Not needed for v1, worth revisiting once the shared tool is proven in Phases 1-5.

## 10. Non-goals

- Migrating `ElementEditorDialog.tsx` off Canvas2D.
- Migrating the schematic template's semantic block-catalogue system onto `SymbolShape` (§7).
- Deciding how the generated (read-only) schematic view renders (Phase 4 of [[electrical-schematic-templates]]) or whether it exports to PDF (that plan's open question 2). This plan is about the editing tool, not the final render target for finished schematics.
- Building the schematic symbol library's persistence model beyond what Phase 5 needs minimally — a full design (built-in vs per-document, per [[electrical-schematic-templates]] open question 1) is out of scope here.
