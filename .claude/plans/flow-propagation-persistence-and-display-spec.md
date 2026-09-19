# Flow propagation — persistence + on-canvas display (Option A)

Scope decided with the user 2026-09-18: close the two gaps in the
already-built flow-propagation solver — values aren't saved with the
project, and nothing shows on the canvas except one document-wide total.
Two other options investigated the same session are explicitly deferred:
an explicit equipment "source" flag (replacing today's degree-1-node
heuristic) and duct/pipe auto-sizing from solved capacity. Neither is in
scope here.

## 1. What already exists (confirmed by reading the code, 2026-09-18)

The solver itself is fully built and tested — this is a persistence +
display task, not new solver work:

- `packages/core/src/flow.ts` — `solveFlow()`. Post-order DFS over a
  `nodeKeyOf`-keyed adjacency graph, summing each terminal's user-entered
  capacity up through fittings/segments toward a root. A cycle-closing
  edge is left `null` (unresolved) via a visited-set check. Root:
  explicit `rootElementId`, else a degree-1 non-terminal node, else any
  degree-1 node, else arbitrary. Ported from the old app's
  `NetworkFlowProcessor.cs` (`flow.ts`'s own header comment cites exact
  line ranges). Full test coverage in `flow.test.ts`.
- `packages/core/src/network.ts` — `computeNetworks()` (union-find) is
  the shared connectivity graph, already reused by the network-type
  retagging feature.
- `packages/render/src/document.ts:85` — `terminalCapacities: Map<string,
  number>` lives on `SketchDocument`, **in memory only**.
- `packages/render/src/document.ts:91` — `lastFlowResult: FlowResult[] |
  null`, also in memory only.
- `packages/render/src/scene.ts`:
  - `setTerminalCapacity(elementId, capacity)` (~L1052) — single-stamp input.
  - `setCapacityForSelection(capacity)` (~L1585) — multi-select input, not undoable (matches `setTerminalCapacity`'s own non-undoable status — capacity is a working-value input, not drawing-history state).
  - `computeFlow()` (~L1129) — recomputes `computeNetworks()` fresh, runs `solveFlow` per network, stores into `doc.lastFlowResult`, emits `flowSolved`.
  - `exportProject()` (~L1142) / `loadProjectFromJson()` (~L1180) — the **only** save/load boundary in the app (there is no separate `.mep`/JSON file save path — `App.tsx` only ever writes a PDF with the project embedded as a file via `exportToPdf`/`loadFromPdf`). Today neither method touches `terminalCapacities` at all.
- `packages/ui/src/App.tsx:527-576` — "Solve flow" button (Networks tab) plus one line: total capacity summed across every segment's `segmentCapacity` in every network, no per-segment breakdown, no direction indicator.
- `packages/ui/src/components/PropertiesPanel.tsx:171-176,285-290` — capacity input fields exist for a stamp selection; `SegmentInfo` (`scene.ts:806-823`, the segment-selected read model) has **no** capacity/solved-value field at all.
- Confirmed by grep: no `Text(`/label-drawing call anywhere in `scene.ts` references capacity or flow — the only two `new Text(...)` call sites (~L2290, ~L2305) are annotation freehand/textbox rendering, unrelated.

## 2. Gap vs. this spec's scope

| Need | Exists today? | Where it must be added |
|---|---|---|
| Save `terminalCapacities` with the project | No — in-memory `Map` only | `ProjectDocument` schema + `exportProject`/`loadProjectFromJson` |
| Restore `terminalCapacities` on load | No | same as above |
| Schema migration for old saves (no field) | N/A (field doesn't exist yet) | `project.ts` migration step v7→v8 |
| Per-segment solved-capacity label on canvas | No | new render pass in `scene.ts` |
| Flow-direction indicator on canvas | No (legacy had "F"/"T" text; MepApp has nothing) | same new render pass |
| Per-segment capacity in the Properties panel | No (`SegmentInfo` has no such field) | `getSelectedSegmentInfo()` + `PropertiesPanel.tsx` |

## 3. Phase 1 — Persistence

1. **Schema.** Bump `CURRENT_SCHEMA_VERSION` 7 → 8 in `packages/core/src/project.ts`. Add `terminalCapacities: Record<string, number>` to `ProjectDocument`. Add a migration step (`fromVersion: 7, toVersion: 8`) defaulting `terminalCapacities` to `{}` when absent, following the exact pattern of the v3→v4/v4→v5 steps (plain array/object default, no inference of values that were never recorded). Add `requireArray` — no, this field is an object not an array, so add a small `requireObject` validator alongside the existing `requireArray` helper, or just validate it's a plain object inline.
2. **Export.** `SketchScene.exportProject()` (`scene.ts` ~L1142): add `terminalCapacities: Object.fromEntries(this.doc.terminalCapacities)` to the object passed into `serializeProject`.
3. **Import.** `SketchScene.loadProjectFromJson()` (`scene.ts` ~L1180): after the existing `target.portGroups.splice(...)` line, add `target.terminalCapacities.clear(); for (const [id, value] of Object.entries(doc.terminalCapacities)) target.terminalCapacities.set(id, value);` (mirrors how `portGroups`/`customStampDefinitions` are restored — clear-then-repopulate the live document field from the loaded `doc`).
4. **Tests.** `packages/core/src/project.test.ts`: one round-trip test (capacities survive a full serialize/load cycle unchanged) plus one migration test (`migrates a pre-terminalCapacities (v7) save, defaulting to an empty object`), following the file's existing per-version test pattern exactly.
5. **Do not persist `lastFlowResult`.** Solved values stay derived/in-memory only, recomputed by clicking "Solve flow" after a project loads — consistent with `computeFlow()`'s own doc comment ("recomputed from current topology on every call — there is no stored NetworkId to go stale"). Persisting a stale solve would reintroduce exactly the staleness problem that comment is written to avoid.

## 4. Phase 2 — On-canvas display

1. **New render layer.** Add a `flowLabelLayer` `Container` on `SketchDocument` (`document.ts`), added to `this.world` alongside `stampsLayer`/`annotationTextLayer` wherever those are (`scene.ts` ~L505/~L707). Rebuilt fully on every successful `computeFlow()` call (not on every `syncDrawingLayer()` — flow values only change when explicitly solved, matching the existing manual-trigger model; wiring it into `syncDrawingLayer` would force a recompute-and-redraw on every unrelated edit, which is unnecessary and a behavior change nobody asked for).
2. **Per-segment label.** For each segment with a non-null `segmentCapacity`, place a small `Text` node at the segment's midpoint (same node-construction pattern as the existing annotation labels at `scene.ts` ~L2290) showing the numeric value. No units suffix — `NetworkType.units` is documented as "never consulted," and this task doesn't change that; if the user wants units shown, that's a one-line follow-up, not core to this spec.
3. **Direction indicator.** Legacy MEPSketcher used "F"/"T" text at each endpoint (`LineGraphics.cs`), not an arrowhead graphic. MepApp starts with nothing, so this is a fresh design decision, not a port — see D2 below.
4. **Properties panel.** Add `solvedCapacity: number | null` to `SegmentInfo` (`scene.ts` `getSelectedSegmentInfo()`, ~L806) — look up the selected segment's id in `this.doc.lastFlowResult` (across all networks) if a solve has run, else `null`. Display it as a read-only row in `PropertiesPanel.tsx` next to the existing diameter/width/material fields, labeled distinctly from the (editable) terminal "Capacity" input so the two aren't confused — a segment's solved value is a derived read-out, a terminal's capacity is a user-entered input.
5. **Fix the existing total-capacity metric while touching this code.** `App.tsx:527-531` sums `segmentCapacity` across *every* segment in *every* network — since each segment's value is already a subtree total (a segment nearer the root includes everything downstream of it), this over-counts rather than reporting true total demand. The correct total per network is the *root's* own demand (the max value at the network's source end), not a sum of every segment's value. This is a small, self-contained bug found during investigation, directly adjacent to the label work — fix it in the same phase rather than filing it separately and leaving the display visibly wrong while everything else around it gets fixed.

## 5. Open decisions

- **D1 — label visibility.** Always-on once solved, or a toggle (e.g. next to "Solve flow")? Recommend always-on for now — there's no existing show/hide affordance for any other overlay (dimension text, network-type color) to be consistent with, and a toggle can be added later if labels prove cluttered on dense drawings.
- **D2 — direction indicator style.** Small arrowhead glyph (cleaner, no text collision with the capacity number) vs. reusing the legacy app's "F"/"T" text (proven, but old-fashioned and adds a second text node per segment right next to the capacity label). Recommend a small triangular arrowhead drawn into `flowLabelLayer` alongside the text, pointing from child toward root (i.e., the direction flow is assumed to travel) — cheaper to read at a glance than two-letter text, and doesn't require a font decision.
- **D3 — where the fitting-capacity value (also solved, currently unused anywhere) is worth surfacing.** `FlowResult.fittingCapacity` is already computed but nothing reads it — out of scope for this pass unless the user wants a fitting (junction/tee) to show its through-capacity too. Flag only; no action unless requested.

## 6. Non-goals (explicitly deferred, per user decision 2026-09-18)

- **Option B** — explicit `isSource`/equipment-root flag on `PlacedStamp`, replacing the degree-1-node root heuristic. User will reconsider separately.
- **Option C** — feeding solved capacity into automatic duct/pipe sizing. No precedent in either codebase; a genuinely separate, larger feature.

## 7. Verification plan

- `pnpm turbo run typecheck` and `pnpm turbo run test` clean across all packages, including the two new `project.test.ts` cases.
- Manual/Playwright walkthrough against a fixture PDF: place an equipment stamp and a terminal stamp, connect them with segments, enter a terminal capacity, click "Solve flow," confirm the per-segment label and direction indicator render correctly and the network total is no longer over-counted, save to PDF, reopen it, confirm the capacity value is still present in the Properties panel input (persistence round-trip through the real save/load path, not just the unit test).

## 8. Status

**Done** — 2026-09-18, on branch `worktree-flow-propagation-plan` (not yet merged to `master` — this touches `apps/web`'s dependency packages, so it goes through the branch-first workflow, not straight to master).

Shipped, matching §3/§4 exactly:
- Schema v7→v8: `ProjectDocument.terminalCapacities: Record<string, number>`, migration step, `requireRecord` validator, round-trip + migration tests in `project.test.ts`.
- `exportProject()`/`loadProjectFromJson()` (`scene.ts`) now carry `terminalCapacities`; a fresh load clears `lastFlowResult` and the flow-label overlay (the solve itself is never persisted, per §3 point 5).
- `flow.ts`'s `FlowResult` gained `totalCapacity` (the root's own subtree demand) and `segmentDirection` (`'AtoB'`/`'BtoA'`, structural leaf-to-root) — both covered by new `flow.test.ts` cases.
- New `flowLabelLayer` (`document.ts`/`scene.ts`): a capacity number + small V-shaped arrowhead per resolved segment, rebuilt on every `computeFlow()` call — resolves D2 in favor of the arrowhead option, reusing the existing 'arrow' annotation's stroke-only V idiom rather than a filled triangle, for visual consistency with the rest of the app.
- `SegmentInfo.solvedCapacity` + a read-only "Solved capacity" row in `PropertiesPanel.tsx` (single- and multi-segment views).
- Fixed the total-capacity over-counting bug found during investigation (`App.tsx` now sums `totalCapacity` per network, not every segment's value).

One regression was found and fixed during live verification, not anticipated in the original spec: `useSketchScene.ts`'s `onFlowSolved` handler originally refreshed `selectedSegment`/`selectedSegments` unconditionally on every solve, which churned `selectedSegments`' array reference even when a stamp (not a segment) was selected — that reference change re-triggered `App.tsx`'s dock-tab-forcing effect (`selectedSegments` is in its dependency array) and yanked the dock back to the Properties tab on every "Solve flow" click. Fixed by only calling those setters when a segment selection actually exists to refresh.

Verified: `pnpm build` + `pnpm turbo run typecheck` clean across all 10 packages; `pnpm turbo run test` — 136 core tests (up from 135; new flow.ts/project.ts cases) + 13 pdf-engine-mupdf tests, all passing. Live headless-Chromium Playwright walkthrough: placed a Terminal + Equipment stamp, connected with a segment, entered a capacity, solved flow — confirmed correct `totalCapacity`/`segmentDirection`, the canvas overlay (label + arrowhead) rendering (screenshot-confirmed), the Properties panel's live-updating "Solved capacity" row, and a full `exportProject()`/`loadProjectFromJson()` round-trip (schema v8, capacity value survives reload, stale overlay correctly cleared). Re-verified after the dock-tab-forcing fix that both the original bug repro and the segment-selected live-update case now work correctly together.

D1 (label visibility) originally resolved as always-on; **superseded 2026-09-19** (see below) in favor of selection-scoped. D3 (fitting-capacity display) was addressed in the same follow-up round.

### 2026-09-19 follow-up: live compute, selection-scoped overlay, fitting capacity

User testing surfaced that entered capacity wasn't reaching the solver at all (flow showed 0 for a simple one-terminal-one-segment network), and asked for three behavior changes beyond the original spec: flow computed live instead of only on a manual "Solve flow" click, the on-canvas overlay tied to segment selection instead of always-on, and a Capacity read-out on fittings (not just segments). Commit `f8bb09f` on the same branch:

- **Root cause of the "0" bug**: the single-stamp Capacity field (`PropertiesPanel.tsx`) was a locally-buffered string that only wrote to `setTerminalCapacity` on blur and was never initialized from the stamp's actual value — pressing Enter (rather than clicking away) after typing a capacity silently left it uncommitted. Fixed by making the field directly controlled (`value={stamp.capacity}`, commit on every `onChange`), matching every other field in the panel. This in turn required `setTerminalCapacity`/`setCapacityForSelection` to emit `selectionChanged` themselves (they never had before, since capacity wasn't part of `PlacedStamp`), or the now-controlled input would visually revert on every keystroke.
- **Live compute**: `computeFlow()` split into a public button-action wrapper and a private `recomputeFlow()`, the latter now called automatically from `syncDrawingLayer()` (covers every segment/fitting/stamp create/edit/delete) and from both capacity setters — `lastFlowResult` is now always current, independent of the overlay/button.
- **Fitting capacity**: `FittingInfo.solvedCapacity` (new field) + a "Solved capacity" row in the fitting Properties view, mirroring the existing segment row (closes D3). Uncovered and fixed a real gap in `core/flow.ts`'s solver while wiring this up: `fittingCapacity` was only ever recorded for a fitting visited as someone else's child edge, so a bare fitting that resolves as the network's *root* itself (the common "open trunk end" case) stayed `null` forever even though `totalCapacity` already held its correct value right there. New `flow.test.ts` case covers it (5 tests now, up from 4).
- **Selection-scoped overlay**: new per-document `flowOverlayActive` flag (`document.ts`), off by default. "Solve flow" turns it on; `syncFlowLabels()` (called from `redrawOverlay()` on every selection change, not just from a solve) now no-ops unless it's on *and* a segment is currently selected, and filters to just the network(s) containing the selection. Once turned on it keeps following the selection live (no need to re-click the button per segment) until it goes back to off on deselect. Supersedes D1's always-on resolution.
- Deleting a stamp now drops its `terminalCapacities` entry (previously an orphaned, harmless map entry).

Verified: `pnpm turbo run typecheck test build` clean across all 20 tasks; core suite at 137 tests (up from 136). Live headless-Chromium Playwright walkthrough drove the Capacity field through actual DOM input (type + Enter, not scene API shortcuts, since that's exactly where the original bug hid from the prior verification round) and confirmed: the exact reported repro now resolves to the correct capacity, `SegmentInfo`/`FittingInfo.solvedCapacity` update live without pressing "Solve flow", the overlay appears on solve and disappears on deselect, live capacity edits update an already-shown overlay in place, and the dock-tab-forcing regression fixed on 2026-09-18 does not reappear via the new auto-recompute paths.

Pushed to `origin/worktree-flow-propagation-plan` (commit `f8bb09f`) — still not merged to `master`, same branch-first stance as before.
