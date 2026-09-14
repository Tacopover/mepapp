# Editable stamps: duplicate-as-custom (done) + full vector-shape migration (follow-up)

## Context

The Stamps tab (renamed "MEP" — see commit `edf65ec`) shows 166 fixture-generated library stamps (`STAMP_LIBRARY`, from `stamp-migration-and-draw-from-spec.md`'s Part A) plus whatever a user has authored in the Element Editor dialog (`customStampDefinitions`, per-document). The user wants to be able to edit a *loaded* (library) stamp — reposition/add ports, and ideally reshape the actual line art — then save it either back over itself or as a new stamp under a different name.

Investigation found the Element Editor dialog (`ElementEditorDialog.tsx`) already does almost everything needed: it re-populates its own editing canvas from an existing `StampDefinition`'s `ports`/`shapes`/metadata (this is the same code path today's "Edit ports…" action, reachable from a placed custom instance's Properties panel, already uses). Two gaps stood between that and doing this for a *library* stamp:

1. **No vector shape data for library stamps.** The fixture folders' `.mepshapes.json` sidecars (vector outline data from the old MEPSketcher app) were deliberately excluded from the Part A migration — nothing consumed them at the time. Without `shapes`, "editing" a library stamp can only mean moving ports around a fixed picture, not reshaping the art.
2. **No safe "Save As" path, and no entry point.** The dialog decides create-vs-overwrite purely by which button opened it (`elementEditorTarget.mode`), and naively reusing a library stamp's own `id` on save would either silently no-op or collide with the library entry's id in the merged Stamps-tab grid.

This plan covers both. **Part A (duplicate-as-custom, ports + metadata only) is done.** **Part B (migrate `.mepshapes.json` → real vector-editable art) is fully designed below but not started** — a future session should be able to implement it directly from this file, no rediscovery needed.

---

## Part A — "Duplicate as custom stamp" (ports + metadata, raster art)

**Status: DONE** (commit `dbb506d`, worktree `stamp-migration-and-draw-from`).

A small circular duplicate-icon button (`IconCopy`) now sits in the top-right corner of every *library*-sourced tile in the Stamps tab grid (never shown on an already-custom tile — those get "Edit ports…" from a placed instance's Properties panel instead). Clicking it:

1. `App.tsx`'s new `handleDuplicateStampDefinition(definition)` fetches the library stamp's art (`definition.iconRef` is a bare fixture-relative filename, e.g. `'D2_Bath.svg'`, resolved via the existing `resolveStampIconUrl`) and re-encodes it as a self-contained `data:` URL via `FileReader.readAsDataURL` — matching the invariant every *custom* `StampDefinition.iconRef` must hold (see `stamp-library.ts`'s doc comment).
2. Builds a "seed" `StampDefinition`: the library definition's fields, but with a fresh `id` (`crypto.randomUUID()`), `source: 'custom'`, the re-encoded `iconRef`, and a **shallow clone of `ports`** (`definition.ports.map(p => ({...p}))`) — defensive, so the dialog's editable state never shares array/object references with `STAMP_LIBRARY`'s module-level (session-shared) data. (Verified this precaution isn't strictly load-bearing today — every `setPorts`/`commitShapes` call in the dialog already rebuilds arrays immutably, never mutates in place — but it's cheap insurance worth keeping, see Part B's note on doing the same for `shapes` once that field is populated.)
3. Sets `elementEditorTarget = { mode: 'duplicate', seed }` — a new third variant alongside the existing `'create'`/`'edit'`. The dialog's own `id: definition?.id ?? crypto.randomUUID()` save logic and `handleSaveElementDefinition`'s existing `mode === 'edit' ? update : create` branching both already handle this correctly with **zero changes to `ElementEditorDialog.tsx` itself** — `'duplicate'` just isn't `'edit'`, so it falls into the existing create path and calls `addCustomStampDefinition`.

Because today's library stamps have no `shapes` data, the dialog opens in **Import mode** (`mode` state's existing init: `definition?.shapes?.length > 0 ? 'shapes' : 'import'`) — the user sees the original picture as a fixed background image and can move/add/rename ports, rename the stamp, and change discipline/category, but cannot reshape the art itself. That capability is exactly what Part B unlocks, and — notably — **Part B needs no further UI/App.tsx changes**: once generated `StampDefinition`s carry real `shapes`, this same duplicate button automatically opens the dialog in Shapes mode instead.

Files touched: `packages/ui/src/App.tsx` (state + handler + dialog wiring), `packages/ui/src/components/StampsPanel.tsx` (prop + per-tile button), `packages/ui/src/theme.css` (`.mep-stamp-tile-wrap`, `.mep-stamp-tile-duplicate`).

Verified: `pnpm --filter @mepapp/ui build` clean, `pnpm --filter @mepapp/core test` 134/134 passing (untouched by this change — no core edits). End-to-end in a real Chromium browser via Playwright against the running `apps/web` dev server: clicked the duplicate button on the library "Bath" stamp, dialog opened pre-filled (name "Bath", discipline "Plumbing", category "Terminal", both migrated ports visible, art preview rendering correctly from the re-encoded `data:` URL), saved, confirmed status message "Bath created…", confirmed the grid now has two tiles labeled "Bath" — the original library one still showing its duplicate button, the new custom one not showing it (`source: 'custom'`).

---

## Part B — Migrate `.mepshapes.json` into real vector `shapes` (DONE)

**Status: DONE** (commit `5561ae9`, worktree `stamp-shape-vector-migration`).

### Why this is lower-risk than it sounds

Decoded all 163 `.mepshapes.json` files (`fixtures/stamps/{Terminals,Equipment}-english/*.mepshapes.json`, UTF-8 **with a BOM** — must open with `utf-8-sig`/strip the BOM, plain UTF-8 JSON parsing throws). Their shape vocabulary is **an almost exact structural match** to this app's own `SymbolShape` union (`packages/core/src/symbol-shapes.ts`) — not a coincidence, this app's shape format is a direct descendant of the old one:

| mepshapes `type` | count (of 1550 total) | `SymbolShape` `kind` | field differences |
|---|---|---|---|
| `line` | 979 | `line` | none beyond coordinate normalization (below) |
| `circle` | 206 | `circle` | `r` → `radius` |
| `arc` | 159 | `arc` | `r` → `radius`; **angles in degrees, not radians**; `startAngle`+`sweepAngle` → `startAngle`+`endAngle` (`endAngle = startAngle + sweepAngle`, then both `* Math.PI / 180`) |
| `rect` | 122 | `rect` | `w`/`h` → `width`/`height` |
| `polygon` | 71 | `polygon` | `points` is a **flat** `[x1,y1,x2,y2,...]` array → needs pairing into `{x,y}[]` |
| `text` | 8 | `text` | `content` → `text` |
| `arrow` | 3 | `arrow` | none |
| `ellipse` | 2 | `ellipse` | `rx`/`ry` → `radiusX`/`radiusY` |

Universal field notes across every shape:
- `fill: "none"` (string) must become `fill: null` (`SymbolShapeStyle.fill` is `string | null`) — everything else passes through (`stroke`, `strokeWidth`).
- Coordinates (`x`, `y`, `cx`, `cy`, `x1`/`y1`/`x2`/`y2`, polygon points) are **absolute pixels** against each file's own `ViewBoxWidth`/`ViewBoxHeight`. `SymbolShape` coordinates are fractional 0..1 over the definition's own bounding box, and — confirmed by reading the renderer (`packages/ui/src/symbolShapeCanvas.ts`, e.g. `shape.x * widthPx`, `shape.y * heightPx`) — **x and y are normalized independently** (fraction-of-width, fraction-of-height), not by one uniform scale. So: `fractionX = px / ViewBoxWidth`, `fractionY = px / ViewBoxHeight`.
- No `rotation` field appears in the source data — leave it undefined (matches `SymbolShape`'s already-optional `rotation?`).
- Every shape needs a fresh `id: crypto.randomUUID()` (or any stable string) — the source data has none.
- `Ports` is present in every file but **always empty** (checked all 163) — confirms `.mepconfig.json` (already migrated in Part A) is the sole port source; no conflict to reconcile.
- `LabelData` is non-empty in 7 files — already out of scope (Part A discarded `.mepconfig.json`'s `.labels` the same way; treat consistently, still discard).

### Known fidelity risk — flag, don't silently resolve

`circle` and `arc` in `SymbolShape` have a single scalar `radius`, not independent X/Y radii (only `ellipse` does). For a source file whose `ViewBoxWidth` ≠ `ViewBoxHeight`, normalizing a circle's radius against only one axis (width, matching how `nativeWidth`/`nativeHeight` already get derived from SVG aspect ratio in `generate-stamp-library.mjs`) will visually stretch it slightly once rendered back through independent-per-axis `x * widthPx` / `y * heightPx` scaling — this is a pre-existing conceptual gap in `SymbolShape` itself, not something to paper over with a guess. Spot-check the converted output against the original SVG for a sample of non-square-viewBox assets and flag anything that looks visibly off, rather than assuming the width-axis convention is always right.

### Implementation

1. **Extend `scripts/generate-stamp-library.mjs`** with a `loadShapes(englishBase, folder)` function, parallel to the existing `loadPorts`-equivalent step that already reads each asset's `.mepconfig.json`: read `<EnglishBase>.mepshapes.json` (utf-8-sig), map each entry in `.Shapes` through the table above, and attach the result as `shapes: SymbolShape[]` on the generated `StampDefinition`. Missing file → `shapes: undefined` (same "absent field" convention `ports: []` already isn't — check what the current fallback is for a missing `.mepconfig.json` and mirror it for consistency).
2. **Do not generate `shapes` for `fire-hose-reel`** — it's excluded from codegen entirely (`EXCLUDED_FILENAMES`, Part A) and stays hand-typed; its `.mepshapes.json` (if any) is irrelevant.
3. **Regenerate**: `pnpm gen:stamps`, review the diff to `packages/core/src/stamp-library.generated.ts` (166 entries each gaining a `shapes` array — expect a large diff, that's expected/fine, this file is fully regenerated each run per its own convention).
4. **One small addition needed in `App.tsx`'s `handleDuplicateStampDefinition`** (Part A code, already shipped): once library definitions carry `shapes`, extend the existing defensive-clone treatment already applied to `ports` to also cover `shapes` — `definition.shapes?.map(s => ({ ...s, style: { ...s.style }, ...(s.kind === 'polygon' ? { points: s.points.map(p => ({ ...p })) } : {}) }))`. Not currently load-bearing (no library entry has `shapes` yet) but becomes real insurance the moment this migration ships — same reasoning as the `ports` clone already in place.
5. No other UI/render changes needed — `ElementEditorDialog`'s existing `mode` init (`definition?.shapes?.length > 0 ? 'shapes' : 'import'`) and the whole duplicate-button flow from Part A pick this up automatically.

### Verification

- `pnpm --filter @mepapp/core test` — should still pass unmodified (no core schema change, `shapes?` was already optional on `StampDefinition`).
- Spot-check by duplicating a handful of library stamps covering each shape `kind` (at least one `arc`, one `polygon`, one non-square-viewBox asset) via the Part A duplicate button, confirm the Shapes-mode canvas renders a recognizable match to the original SVG, and that editing/saving round-trips correctly.
- Not realistic to manually visually diff all 163 converted icons in one session — a representative sample (~10-15, covering every shape `kind` and at least a couple of non-square viewBoxes) is the intended QA bar; flag anything visibly wrong rather than guessing at a fix.

### Result

Implemented as planned above, with one additional bug found and fixed beyond the spec: **`SymbolShapeStyle.strokeWidth` also needed normalizing.** The mepshapes source gives `strokeWidth` as raw pixels (5–18, against a ~250–1500px viewBox), but `SymbolShapeStyle.strokeWidth` is a *fraction* — confirmed by `ElementEditorDialog.tsx`'s own `DEFAULT_STYLE.strokeWidth: 0.01` and the renderer's `ctx.lineWidth = strokeWidth * Math.min(widthPx, heightPx)`. Copying the raw value unnormalized produced a `lineWidth` in the thousands of pixels — every stroke covered the entire 520×520 preview canvas, rendering solid black. Fixed by dividing by `Math.min(vbw, vbh)`, the same width/height-independent convention already used for `radius`/`fontSize`. Caught only because the plan's own verification step (visual spot-check) was followed rather than trusting the build/tests alone — `pnpm build` and `pnpm --filter @mepapp/core test` were green throughout, since neither exercises canvas rendering.

Verified:
- `pnpm --filter @mepapp/core test`: 134/134 passing (unchanged from before Part B — no core schema change).
- `pnpm build`: clean across all 9 workspace tasks.
- Regenerated-vs-previous diff of `stamp-library.generated.ts` checked programmatically: all 166 entries' non-`shapes` fields byte-identical to the pre-Part-B file (0 mismatches); 165/166 entries gained a `shapes` array (the 166th, `drycooler-section`, correctly has no `shapes` key — its `.mepshapes.json` doesn't exist, confirmed the one real gap among the 164 fixture SVGs).
- Visual spot-check via a scratch Playwright driver against the running `apps/web` dev server, covering every `SymbolShape` kind plus a non-square-viewBox asset (Air Handling Unit, 1500×700): rect, line, circle, arc, ellipse, text, arrow, and polygon shapes all rendered as clean, correctly-proportioned, recognizable line art matching their real-world symbols (AHU twin boxes, camera bracket, key-and-keyhole, LPG/CO detector text+circles, earthing-rod arrow, boiler "B"-in-circle, fan blades). (Needed forcing the preview's dark-theme background to white for the screenshots — the art's `#000000` stroke is otherwise invisible against `--surface-2`; that's a pre-existing dark-theme quirk of the dialog, not something this migration should try to fix.)
- Full edit → save round-trip: duplicated "Key Safe" from the library, dragged one of its converted shapes on the Shapes-mode canvas, saved — status message "Key Safe created — pick it from the Stamps tab to place it.", grid showed 2 tiles named "Key Safe" (original library + new custom).
