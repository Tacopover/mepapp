# Stamp library migration (NL/EN) + "Draw from" context menu

## Context

Two related asks:

1. `fixtures/stamps/` gained two large subfolders — `Terminals-english/` (143 SVGs) and `Equipment-english/` (21 SVGs) — migrated from the old MEPSketcher desktop app, each with a sibling `.mepconfig.json` (ports) and a `name-mapping.csv` (Dutch↔English label translation) per folder. None of this is wired into the running app today: the Stamps tab only shows 4 hand-typed `STAMP_LIBRARY` entries, and nothing reads the new folders. The user wants these ~164 stamps selectable (split by Terminal/Equipment the way the panel already splits by discipline), their authored ports migrated (they map 1:1 onto core's existing `PortSpec`), and a Dutch/English label toggle — custom user-uploaded stamps must stay visible and unchanged regardless of which language is active.

2. Users can currently only start a segment by first entering the draw-segment tool and clicking precisely on/near an existing port or fitting. The user wants a more direct "start drawing from here" entry point on an existing fitting/stamp. The underlying snap/chain mechanics already exist (`segmentTool.ts`, `onDrawSegmentClick`); what's missing is a UI entry point. After discussion, the agreed entry point is a **right-click context menu** (MepApp currently has none — old MEPSketcher had an equivalent "Draw From" menu item, useful precedent) with port resolution based on proximity to the right-click point — not a toolbar button (dropped from scope).

Two independent, unrelated parts of this repo (Part A touches core/UI stamp data + StampsPanel; Part B touches render/scene + a new context-menu UI). No dependency between them — order doesn't matter functionally, but Part A has a hard external blocker (user must supply a discipline mapping) so **Part B can be built first** while that's pending.

---

## Part A — Migrate fixture stamps into Stamps tab, NL/EN label toggle

**Status: DONE** (commits `1cbabac`, `6bdd373`, worktree `stamp-migration-and-draw-from`). User hand-filled `scripts/stamp-discipline-map.csv`'s discipline column directly on disk (this session and the user share the same container filesystem). Two things came up during implementation that the design section above didn't anticipate:

- **A 6th Discipline value, `'other'`**, added everywhere Discipline is enumerated (core union, Stamps-tab filter, Network Type editor dropdown, custom Element Editor dropdown) — the user's filled-in CSV had items (CO2/compressed-air connection points, sprinkler heads, nitrogen/oxygen connections) that don't fit the original 5.
- **Multi-discipline items** (the 3 Pump SVGs, both hvac and plumbing per the user) generate one `StampDefinition` per discipline, ids suffixed by the CSV's own group token (`pump-hvac`/`pump-plumbing`) — CSV format is `discipline1;discipline2` in one cell.
- **3 of the 4 original hand-typed entries turned out to share fixture art with the new generated set** (not just the `switch` collision the design section flagged) — `ventilation-grille-rh-supply` and `luminaire-rectangular` are also now superseded, same id, generated data. The 4th, `fire-hose-reel`, was deliberately kept hand-typed and *excluded* from generation: `project.ts`'s v1→v2 schema migration reads this exact definitionId's `category` to backfill old saves, and the new fixture data disagrees (terminal vs. the hand-typed equipment) — see `generate-stamp-library.mjs`'s `EXCLUDED_FILENAMES` comment. Flagged to the user as a follow-up if they want to reconcile the category disagreement later.

Verified: `pnpm build` (all workspaces) clean; `pnpm --filter @mepapp/core test` 134/134 passing (rewrote `stamp-library.test.ts`'s stale "no plumbing entries" assertion, added id-uniqueness/labelNl/multi-discipline coverage; `project.test.ts`'s migration tests — including the one keyed on `fire-hose-reel`'s category — passed unmodified, confirming the exclusion worked). End-to-end in a real Chromium browser via Playwright: 166 generated entries load, Terminal/Equipment category toggle and discipline filter (now including "Other") both filter the grid correctly, EN/NL toggle swaps a fixture-generated stamp's label (Pump → Pomp) while leaving the hand-typed `fire-hose-reel` tile in English (no `labelNl`), confirming custom/hand-typed entries stay language-agnostic as required.


### A1. Discipline mapping (blocking — user supplies)

The old `D<n>_`/numeric filename prefixes do NOT map reliably onto core's 5 `Discipline` values (`heatingAndCooling | ventilation | plumbing | fireProtection | electrical` — `packages/core/src/network.ts:12-17`): confirmed conflicts (`D3_` mixes ventilation grilles with heating radiators, `D5_` mixes electrical panels with pumps, `D6_`-`D8_` items — camera, intercom, data cabinet, thermostat — don't fit any of the 5 at all).

**Step**: generate `scripts/stamp-discipline-map.csv` — one row per fixture SVG (from both folders), columns `filename, englishLabel, discipline` with `discipline` left blank — and hand it to the user to fill in. If any items genuinely don't fit the 5 existing disciplines, flag those rows back to the user rather than guessing (may need a 6th `Discipline` value — a separate, smaller follow-up if so).

This step can run immediately; the rest of Part A is blocked on the filled-in CSV coming back.

### A2. Codegen script

New `scripts/generate-stamp-library.mjs` (dev-time only, not part of `turbo run build` — keeps `packages/core` I/O-free; run manually via a new root `package.json` script `"gen:stamps"`).

Reads:
- Every `.svg` in `fixtures/stamps/Terminals-english/` (→ `category: 'terminal'`) and `Equipment-english/` (→ `category: 'equipment'`) — folder is the category source of truth.
- Each folder's `name-mapping.csv` (`DutchBase,EnglishBase`) for the NL label.
- Each asset's sibling `<EnglishBase>.mepconfig.json` when present → take `.ports` only (already = `PortSpec[]` shape verbatim: `{id, name, fractionX, fractionY}`); `.labels` always empty, discard. Missing file → `ports: []`.
- The filled-in `scripts/stamp-discipline-map.csv` from A1.
- `.mepshapes.json` is **not read** — out of scope; current stamps rasterize to `ImageBitmap` on placement regardless of source format (`StampsPanel.tsx:83`), so this vector data has no consumer yet (matches the existing "Vector stamp rendering" work noted as not-yet-built).

Derives per asset, matching the 4 existing hand-typed entries' conventions (`packages/core/src/stamp-library.ts:34-82`):
- `id`: kebab-case slug of `EnglishBase` with its `D<n>_` prefix stripped (e.g. `D5_Pump` → `pump`).
- `label` (EN): humanized `EnglishBase`. `labelNl` (new field, see A3): humanized matching `DutchBase`.
- `nativeWidth`/`nativeHeight`: derived from each SVG's own `viewBox` aspect ratio (same approach already used for the hand-typed `luminaire-rectangular` entry, `stamp-library.ts:57-70`).
- `ports`: passed through from `.mepconfig.json` verbatim, or `[]`.
- `iconRef`: bare fixture filename, unchanged.
- `source: 'library'`; `definitionPortGroups`/`shapes` omitted (custom-only fields).
- `discipline`: from the filled-in CSV.

**id collision to resolve during this step**: `Terminals-english/D5_Switch.svg` slugs to `switch`, colliding with the existing hand-typed `switch` entry (`stamp-library.ts:71-81`, currently pointing at `D5_Switch.png`). Resolve by having the generated entry **replace** the hand-typed one (drop the old hand-typed `switch` entry from `stamp-library.ts`, let the generated SVG version take over the same id) — script should still detect and report any other collisions found across the full set rather than assuming this is the only one.

Writes:
- `apps/web/public/stamps/<filename>.svg` — every referenced SVG copied flat into the existing static folder (same resolution path apps/web already uses: `DEFAULT_RESOLVE_ICON_URL`, `packages/ui/src/App.tsx:50`).
- `packages/core/src/stamp-library.generated.ts` — new sibling module, fully regenerated each run (never hand-edited), exporting `GENERATED_STAMP_LIBRARY: StampDefinition[]`. `packages/core/src/stamp-library.ts` imports it and does `STAMP_LIBRARY = [...remaining hand-typed entries, ...GENERATED_STAMP_LIBRARY]`. Keeps core I/O-free (only `scripts/` touches `fs`) and keeps regeneration a clean deterministic rewrite.

### A3. `StampDefinition` + language toggle

- Add `labelNl?: string` to `StampDefinition` (`packages/core/src/stamp-library.ts:15-32`). Set only on generated library entries with a CSV translation; never set on custom (`'custom'`-source) entries — a custom stamp's single free-text `label` (`ElementEditorDialog.tsx:106,682,654`) always renders as-is regardless of the language toggle. This is the mechanism that satisfies "custom stays the same when switching language."
- New helper in `StampsPanel.tsx` (next to `iconUrlFor`): `stampLabelFor(definition, language)` → `definition.labelNl` when `language === 'nl'` and present, else `definition.label`. Used at the grid's label render point (`StampsPanel.tsx:127`).
- **Scope**: the language toggle affects only the Stamps-tab picker grid. `NetworkTreePanel.tsx`'s placed-stamp labels and any other `.label` reads elsewhere keep showing English — not touched by this plan.
- New localStorage-backed state in `packages/ui/src/App.tsx`, mirroring the existing `SNAP_RADIUS_STORAGE_KEY` pattern (`App.tsx:64,155,169`): `LABEL_LANGUAGE_STORAGE_KEY = 'mepapp.settings.labelLanguage.v1'`, `labelLanguage: 'en' | 'nl'` state, threaded into `StampsPanel` as two new props (`labelLanguage`, `onChangeLabelLanguage`) alongside the existing `disciplineGroup`/`onChangeDisciplineGroup` pair.
- New `packages/ui/src/components/LanguageToggle.tsx`, modeled on `DisciplineSwitcher.tsx`'s two-button `role="tablist"` pattern, rendered in the filter row (`StampsPanel.tsx:111-113`) next to `<DisciplineSwitcher>`.

### A4. Terminal/Equipment category toggle

- Small local `useState` inside `StampsPanel.tsx` (not threaded through `App.tsx` — nothing else needs it, unlike `disciplineGroup`). A `CategorySwitcher`-style toggle (All / Terminal / Equipment), same visual family as `LanguageToggle`, placed in the same filter row.
- Filtering logic (`StampsPanel.tsx:66-68`) gets one more additive `.filter()` step by `category` — no restructuring.

### Files — Part A
- `scripts/stamp-discipline-map.csv` (new — template now, filled in by user)
- `scripts/generate-stamp-library.mjs` (new)
- `packages/core/src/stamp-library.generated.ts` (new, generated/committed)
- `packages/core/src/stamp-library.ts` (add `labelNl?`, drop hand-typed `switch` entry, merge generated array)
- `apps/web/public/stamps/*.svg` (new, generated/committed, ~164 files)
- `packages/ui/src/App.tsx` (language state + prop threading)
- `packages/ui/src/components/StampsPanel.tsx` (props, `stampLabelFor`, category filter, filter-row UI)
- `packages/ui/src/components/LanguageToggle.tsx` (new)
- `package.json` root (`gen:stamps` script)

---

## Part B — Right-click "Draw from" context menu

**Status: DONE** (commit `a75fc02`, worktree `stamp-migration-and-draw-from`). Implemented as designed, with one simplification: `resolveSegmentEndpoint` (already exported from `packages/core/src/segmentTool.ts` — not `packages/render/` as originally guessed) already returns exactly the `{kind:'existing', point, worldPosition}` shape needed once filtered, so no new core-level `resolveDrawFromTarget` helper was added — the contextmenu listener calls the existing function directly and checks `target.kind !== 'existing'`. Verified end-to-end with a real Chromium browser via Playwright against the running `apps/web` dev server: right-click on a bare fitting shows "Draw from", right-click on a stamp with a real authored port shows "Draw from Port: <name>" (tested against the library's "Switch" stamp, port "Feed"), right-click on empty canvas shows nothing, clicking the menu arms `pendingSegmentStart` and a further click completes the segment, one Undo click removes the whole new segment (confirmed via `getDrawingSummary()` segment/fitting counts and `canUndo`/`canRedo`). `pnpm build` (all workspaces) and `pnpm --filter @mepapp/core test` (131 tests, including unmodified `segmentTool.test.ts`/`connectivity.test.ts`) both pass.

### B1. Hit-test at the right-click point

New exported helper (co-located with `segmentTool.ts`'s existing snap logic, sharing its radius constants): `resolveDrawFromTarget(worldPosition, state)` → `{kind:'port', elementId, portId, worldPosition} | {kind:'fitting', fittingId, worldPosition} | null`. Reuses the same priority order `resolveSegmentEndpoint` already has for "inside a ported stamp's body → nearest port" and "within snap radius of a port/fitting" (`segmentTool.ts:46-67`), but **excludes** the "break a segment" and "create a new fitting" fallback cases — right-click "Draw from" only ever targets an *existing* fitting or stamp, matching the original ask ("select a fitting or a stamp and continue drawing from that point"). Returns `null` (no menu) when nothing valid is near the click.

For a stamp with multiple real ports, resolve to the single **nearest port to the click position** (per your answer) — reuses `getStampWorldPorts` (`packages/core/src/stamp.ts:57`, which already folds in the synthetic-center-port fallback for port-less stamps, so 0-port stamps resolve automatically too).

### B2. Context menu event + UI

- Extend the canvas's existing `contextmenu` listener (`packages/render/src/scene.ts:557`, currently only `e.preventDefault()`): compute world position from the event, call `resolveDrawFromTarget`; if non-null, emit a new event e.g. `drawFromMenuRequested: [{ screenX, screenY, target }]`; if null, do nothing further (same as today).
- New `packages/ui/src/components/DrawFromMenu.tsx` — small positioned popup (absolute-positioned at `screenX`/`screenY`), single "Draw from" item (or "Draw from Port" when `target.kind === 'port'`, matching the old app's header-text behavior), dismiss on outside-click or Escape (same outside-click pattern `Rail.tsx`'s flyout already uses).
- Mounted/wired in `App.tsx`: listens for `drawFromMenuRequested` off the scene, renders `DrawFromMenu` when set, clears it on dismiss or on click of "Draw from".

### B3. Arming the segment start

New `SketchScene` method, e.g. `armSegmentStartFromTarget(target: DrawFromTarget): void`:
1. Builds the same `DrawEndpointResolution` shape `resolveDrawTarget`'s "existing element" branch already produces (`{ point: {kind:'port'|'fitting', ...}, worldPosition }`, no `setupCommand` — nothing new is created).
2. Sets `this.pendingSegmentStart` to it and `this.tool = 'draw-segment'` **without** going through `setTool()` (which resets `pendingSegmentStart` as its first action, `scene.ts:577-590`) — instead replicate only the needed resets (clear `pendingPoints`/`pendingPolylinePoints`, hide stamp ghost, emit `toolChanged`) while preserving the just-set pending start, then call `redrawOverlay()` so the pending-start marker renders immediately.
3. The next canvas left-click is handled entirely by the existing, unmodified `onDrawSegmentClick` second-click path (`scene.ts` ~2647-2689) — resolves the end endpoint and commits via the existing `CompositeCommand` (`packages/core/src/commands.ts`), same as any normal two-click segment today. Chain continuation (`scene.ts:2683,2692-2696`) then works exactly as it already does for subsequent clicks.

`DrawFromMenu`'s "Draw from" click calls `sceneRef.current?.armSegmentStartFromTarget(target)`, then closes the menu.

### Files — Part B
- `packages/render/src/segmentTool.ts` (new exported `resolveDrawFromTarget` helper, reusing existing snap-radius constants)
- `packages/render/src/scene.ts` (extend `contextmenu` listener; new `armSegmentStartFromTarget` method; new `drawFromMenuRequested` emitter event)
- `packages/ui/src/components/DrawFromMenu.tsx` (new)
- `packages/ui/src/App.tsx` (mount `DrawFromMenu`, wire the scene event)

Toolbar's existing reserved `create-connection` slot (`toolRegistry.ts:70`) is left untouched/disabled — out of scope per this round's decision to drop the toolbar-button entry point.

---

## Verification

- **Part A**: `pnpm build` at repo root (turbo, all workspaces) after running `pnpm gen:stamps`; `pnpm --filter @mepapp/core test` (vitest) for any new/existing `stamp-library` tests; manually run `apps/web` (`pnpm --filter @mepapp/web dev`), open the Stamps tab, confirm: Terminal/Equipment toggle switches the visible set, NL/EN toggle swaps labels on generated entries but leaves a custom-uploaded stamp's label unchanged, discipline filter still works, placing a migrated stamp with authored ports shows those ports (Properties panel / port snapping) same as the 4 original entries do today.
- **Part B**: manual run of `apps/web` — place two fittings/stamps, right-click near an existing port/fitting, confirm the "Draw from" menu appears only when near a valid target, click it, confirm the segment tool arms (pending-start marker visible), click elsewhere on canvas to finish the segment, confirm it committed as one undo step (`Ctrl+Z` removes the whole new segment, not a partial state) and that chain-continuation still works for the next click. Also verify existing draw-segment flows (toolbar button, precise-click snapping) are unaffected — `pnpm --filter @mepapp/core test` for `segmentTool.test.ts`/`connectivity.test.ts` after the `resolveDrawFromTarget` extraction, to confirm no shared-logic regression.
