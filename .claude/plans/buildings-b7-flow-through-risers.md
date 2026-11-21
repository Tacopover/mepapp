# B7: flow through risers

Status: **planned 2026-11-21, revised the same day after the audit and the domain check. Not started.** Stream `buildings`, part id `B7`. B5 (shared coordinate system) stays deferred. A later part (B8, riser arrows) needs B7 first. Branch for the work: `worktree-buildings-b7`, made from `origin/worktree-buildings-b4` (master `1b7b4fd` plus this plan).

## 1. Why

The user asked for this on 2026-11-13. A riser is a segment that goes up or down. The flow rules of normal segments should also work for risers. Today they do not:

- Each level solves its own flow. A riser fitting ends the solve (a boundary) when a caller passes `riserFittingIds`. Nothing passes through it.
- The sheet summary stores only a word for each riser fitting (`out`, `in`, `none`). It stores no capacity.
- `deriveRiserFlow` gives the direction of a riser (up, down, both) from the source level. It gives no number.

Example of the problem: level 1 has terminals and one open end, the riser. The solve gives each segment of level 1 a capacity toward that riser. The riser itself shows nothing, and level 0 never counts the demand of level 1.

## 2. Idea

A level network that holds a riser fitting is one **node**. A span of a riser joins the two nodes of two consecutive members. The nodes and spans of the whole building form a forest. The existing rule stays: the capacity of a branch is the sum of the terminal capacities behind it, counted from the source.

- The source of a group of connected nodes is one node. See section 4 (D-B-77) for how the source is chosen.
- The capacity of a span is the demand of all nodes on the far side of the span, as seen from the source.
- A member (one riser fitting on one level) gets two numbers: `capacityIn` (the span toward the source, 0 at the source) and `demandBeyond` (the sum of the spans that leave the member away from the source). A middle level has ONE fitting (one member per level and riser, `building.ts:237`). That fitting is the entry and the exit at once. So the total at the fitting is the terminals of the network plus `demandBeyond`.
- The open level gets these numbers from the same solve (`solveFlow`) with two new inputs (T01).

Numbers do not depend on the real direction of the fluid. The sum is the same for supply, return and extract. See D-B-74 for the words.

### Worked example (use it as an acceptance test)

Levels 0, 1, 2. One riser R with one member on each level. Terminals: level 0 has 100, level 1 has 300 + 200, level 2 has 150. Each level has one network with the riser fitting. All values are in the unit of the network type.

| Source | Span 0-1 | Span 1-2 | Connected total |
|---|---|---|---|
| Equipment on level 0 | 650 | 150 | 750 |
| Equipment on level 2 | 100 (level 0 side) | 600 (level 1 and level 0 side) | 750 |
| Equipment on level 1 | 100 | 150 | 750 |

In every row the connected total is 750. The span next to a leaf level equals the terminals of that level. Worked numbers of one member (row 1, level 1): `capacityIn` 650, `demandBeyond` 150, total at the fitting 500 + 150 = 650. Row 3, level 1 (the source): `capacityIn` 0, `demandBeyond` 250.

Only the network that holds the riser fitting counts. A terminal on the same level in another network, or on a sheet that is not a member, is not part of the number.

## 3. Facts from the code (2026-11-21)

- `packages/core/src/flow.ts`: `solveFlow` takes `riserFittingIds`. A marked fitting is a boundary: it is never the root, and the walk does not continue past it (child demand 0). `flow.test.ts:446-458` shows a marked fitting in the middle of a run: the terminal behind it gets no number. `riserFittingFlow` gives `out`, `in` or `none` from "is there an equipment on this network" (`flow.ts:189`; it also accepts an explicit root). The root order is a chain (`flow.ts:121-127`): explicit root, equipment with one connection, loose end with one connection, any equipment, any one-connection node, first key.
- `packages/core/src/sheet-summary.ts`: `SHEET_SUMMARY_VERSION = 2`. `riserFittingFlow` is a merged map (fitting id to `out`/`in`/`none`). `buildSheetSummary` builds it for every network that has a riser fitting. It builds all quantity tables too (`:98-110`), so it is heavy. A summary has no capacity and no network structure.
- `packages/core/src/riser-flow.ts`: `deriveRiserFlow(file, perLevelFlow)`. A hand-set `sourceLevelId` replaces the `out` members (`:30-33`). Two `out` members give `both` with the lower one as source (`riser-flow.test.ts:130-136`).
- `packages/core/src/riser-quantities.ts`: `riserSpans` (also returns end rows with `toLevelId` `''`), `riserFittingIdsForSheets`, `riserGraph` and `buildingNetworkLabels` (`:235-272`, they join risers and networks with the identity "sheet | Network label"). `building-takeoff.ts` uses `deriveRiserFlow` for the riser table.
- `packages/render/src/scene.ts` (`recomputeFlow`, line 3759): the live solve calls `solveFlow` per network with no `riserFittingIds`. In the live view a riser fitting is an ordinary fitting. The scene holds `riserMarks` (fitting id to mark) and `getRiserMarks()`. `setRiserMarks` (`:3109-3112`) does not call `recomputeFlow`. The marks exist only for the shown page (`useBuildingRisers.ts:690-696`).
- `packages/ui/src/App.tsx` (about line 1479, in `runExportQuantities`): the live summary of the open sheet for the Level and Building takeoff. `quantitiesScope.ts:108` replaces the stored summary of the same `projectUuid` with the live one. `BuildingRisersPane.tsx:188-208` reads only saved summaries. `App.tsx:2015-2020` sums `totalCapacity` of all networks for the header total. `sizing-network.ts:91` and `route-build.ts:591` call `solveFlow` with no risers.
- A summary belongs to a project (`projectUuid`), not to a sheet. One PDF with several pages shares one summary. A sheet with `projectUuid` null has none (`building-takeoff.ts:62`).
- `NetworkType.flowUnit` (flow-units.ts) is the label of the capacity numbers of a type. `solveFlow` never reads it. A change of the unit does not convert numbers.
- `migrateToLatest` refuses a summary with a newer version (`schema.ts:68-72`). An older app then lists it as a problem and leaves it out of the takeoff (`quantitiesScope.ts:92`).

## 4. Decisions

- **D-B-73 (user, needs an answer before T02): a new optional field in the sheet summary.** Option A (recommended): keep `SHEET_SUMMARY_VERSION` 2 and add the optional field `riserNetworks` (T02). An older app ignores an unknown optional field, so a new summary still opens there. A summary without the field means "not known yet": the building solve gives a warning and the existing rebuild fixes it. Option B: bump the version to 3. An older app then refuses every new summary and cannot be undone once the user saves with the new app. Option C: read every PDF and project on each solve. Too slow. The building file and the project file do not change.
- **D-B-74 (user; the `mep-domain-checker` gave an opinion): the words for a riser.** The real flow of a return, extract or drain riser goes toward the fan or the outlet. So "away from the source level" misleads for them. Option A (recommended): B7 shows only neutral words: "Main level" (the level of the source), "Connected total (no diversity)" and "Level 1 to Level 2". B7 draws no arrow and adds no word "Up", "Down" or "flow direction". The existing text from B4 (`Up · source: Level 0`) stays until B8. B8 adds supply and return. Option B: also replace the existing B4 text with the neutral words in B7. Option C: add a supply/return flag to the network type now (a model change). The checker advises A or B. Wait for the answer before T04b and T05 (they carry the texts). T01 to T03 do not depend on it.
- **D-B-75 (provisional): other levels use their saved summary.** A level that is not saved, not opened, or has no summary counts with demand 0. Every span above it then shows "at least N" and a warning that names the level. The open level always uses its live data. The app never opens a PDF to solve. One function replaces a stored summary with the live one by `projectUuid`, and Properties and the Building dialog use it, so both show the same number.
- **D-B-76 (provisional): when there is no unique source, the spans have no number.** The spans show "Not known yet" and a warning. The connected total still shows (it is the same for any source). This holds for two sources, no source and a loop. Same stance as the loop rule for segments in `flow.ts`.
- **D-B-77 (provisional): what the source is.** In this order: (1) the level that the user set by hand (`riser.sourceLevelId`) wins. Equipment on other levels gives a note, not an error. (2) Else the one level whose network has a source equipment. (3) Else, or with two or more such levels, there is no unique source (D-B-76). A **source equipment** is an element of category `equipment` that has no capacity of its own above 0 (a fan coil unit with a capacity is a demand, not a source). `deriveRiserFlow` keeps its old rule for the direction word (two `out` levels give `both` with the lower source). B7 does not change its old tests. In the case of two sources the two disagree on purpose: the direction word stays, the capacities say "Not known yet". The plan reports this case in T03.
- **D-B-78 (provisional): what stays level-only.** Duct sizing (`sizing-network.ts`), routing (`route-build.ts`) and the header total of the open level keep the level-only numbers. The scene result carries `riserCapacity` (T01) so the header total can subtract it. A source level whose exit leads to other levels is sized as before. This is a known gap that the user can open as a later task.

## 5. Tasks

Order matters. T01 to T03 are core only (pure functions with unit tests first). T04a is render. T04b and T05 change what the user sees: the `ux-designer` runs first, the dashboard shows the wireframe and the texts, and the `journey-tester` runs before the task is done.

### B7-T01: solver inputs for risers (core)

- `FlowSolveInput` gets two optional fields:
  - `entryFittingId?: string`: a marked riser fitting that feeds this network. It is a root candidate. It is the root right after an explicit root, and before every step of the old root chain. The old chain never picks it before the entry. A marked fitting that is not the entry stays a boundary. An entry id that is not in the network is ignored.
  - `riserDemand?: Record<string, number>`: the capacity beyond a marked fitting (fitting id to number). For a boundary fitting it is added to the child demand: `segmentCapacity`, `fittingCapacity` and `totalCapacity` count it. For the entry (the root) it is added to the total of the root and to `fittingCapacity` of the entry. The segments of the network keep only the terminals behind them. A key for a fitting that is not marked or not in the network is ignored. A marked fitting with no key counts 0.
- `FlowResult` gets the optional `riserCapacity?: number`. It is set only when `riserDemand` is given. It is the sum of all `riserDemand` values that the solve used (exits and entry).
- With neither field nothing changes. Every existing test in `flow.test.ts` stays green without edit.
- Tests: entry as root with a drain behind another fitting; the old chain with a loose duct end (the entry wins); entry plus an explicit root (the explicit root wins); equipment root with exits that have `riserDemand`; entry and equipment on one network (the entry wins; the building solve decides the roles); an entry id that is not in the network; a key for an unmarked fitting; a marked fitting with no key; a marked fitting in the middle of a run (the terminal behind it is not counted: this documents `flow.test.ts:446-458`); a loop; `riserCapacity`.

### B7-T02: the summary lists the riser networks (core)

- After the answer to D-B-73 (option A: no version change).
- New optional field of `SheetSummary`: `riserNetworks?: Array<{ networkTypeId: string; fittingIds: string[]; terminalCapacity: number; hasSource: boolean; warnings?: string[] }>`. One entry for each network that holds at least one riser fitting. `fittingIds` are the riser fittings of the network (sorted).
- A new light function in core, `buildRiserNetworks(project, riserFittingIds)`. It builds only this field (no quantity tables). `buildSheetSummary` uses it. The ui uses it for the live data of the open sheet.
- `terminalCapacity` is `totalCapacity` of `solveFlow` for the network, with all riser fittings marked and the first sorted fitting as the entry. So it is the same number that the live view counts. When a riser fitting has more than one segment, the terminals behind a fitting that is not the entry are not counted. In that case the entry gets a warning in `warnings` (text: `Riser fitting is not an open end. The terminals behind it may not be counted.`). The warning also shows for the entry itself, where both sides count, so the text says "may".
- `hasSource` is "the network has an element of category `equipment` whose own capacity is 0 or absent" (D-B-77). `riserFittingFlow` takes the same rule when no old test breaks. If an old test breaks, report it. Do not change the old tests.
- Keep `riserFittingFlow` (old readers and old tests use it).
- Validator for the new field (bad entry gives an issue). A version 2 summary without the field stays valid.
- Tests: build with the field, parse with and without the field, validate a bad entry, a network with two riser fittings, a network with a fan coil unit that has a capacity (no source), a mid-run riser fitting (warning), `terminalCapacity` equals the solve total. `sheet-summary.test.ts` (asserts version 2) stays green.
- `rebuildSummaries` and `buildingContext` already call `buildSheetSummary` with `riserFittingIds`, so they build the field with no extra change. Check this with a test.

### B7-T03: the building solve (core)

- New file `packages/core/src/building-flow.ts`: `solveBuildingFlow(file, summariesByProject, live?)`. `summariesByProject` maps `projectUuid` to `SheetSummary`. `live` is the optional live `riserNetworks` of the open sheet, with its `projectUuid`. The function replaces the stored summary of that `projectUuid` with the live data, once (the same rule as `quantitiesScope.ts:108`). Pure. No I/O.
- First read `riserGraph` and `buildingNetworkLabels` in `riser-quantities.ts`. Reuse their identity if it fits. If it does not fit, say why in the report and say how the two agree.
- Nodes and edges:
  - A node is a `riserNetworks` entry of a sheet. A member is found by its `fittingId` (key). A member whose sheet has `projectUuid` null, or whose project has no summary, or whose summary has no `riserNetworks`, is an empty node (demand 0). It gives its own warning ("Read summaries now" or "Save level N again"). A member whose fitting is not in any entry (no segment at the fitting) gives a different warning ("No segment at the riser fitting of level N").
  - An edge is a span between two consecutive members of one riser (sorted by elevation, the order of `riserSpans`). Only spans with both `fromMember` and `toMember` count. End rows (`toLevelId` `''`) are left out. An open or capped end carries 0.
  - One network that holds fittings of two risers is one node with two edges. A loop gives a warning and no numbers for that group.
- Source: D-B-77. Two sources, no source or a loop gives `unknown` for the spans of that group (D-B-76). The connected total is still given.
- Result for each riser: its spans in elevation order, each with `capacity`, `fromLevelId`, `toLevelId`, `state` (`ok` or `unknown`) and `complete` (false when a level behind the span has no summary, then the number reads "at least"). For each member: `capacityIn`, `demandBeyond` and `role` (`source`, `fed` or `none`). A group total. A list of warnings (text, one for each problem, naming the level). A warning when the `networkTypeId` of an entry is not the type of the riser.
- A pure function `riserFlowInputsOf(result, sheetId)` that gives, for the open sheet, `Record<fittingId, { role: 'entry' | 'exit'; demandBeyond: number }>` for `scene.setRiserFlowInputs` (T04a). A source member is `exit` with all spans in `demandBeyond`. A fed member is `entry`. A member with no unique source gives no entry in the map (the scene then behaves as today for it).
- One rule for "what is the source": `deriveRiserFlow` and `solveBuildingFlow` agree on the direction of every old riser test, except the D-B-77 case of two sources. If they cannot agree elsewhere, report it. Do not change old tests to make them pass.
- Tests: the three rows of the worked example (spans, `capacityIn`, `demandBeyond`, total), a riser with a gap level, two risers in one tree, a loop, two sources, no source, a missing summary, a summary without `riserNetworks`, a member with `projectUuid` null, a riser fitting with no segment, an end row, a hand-set source level plus equipment on another level, a fan coil unit level, an old v2 summary, two networks on one level that use two different risers, the live data that replaces a stored summary (the open level counts once), a mismatch of network type, and `riserFlowInputsOf`.

### B7-T04a: the scene takes the numbers (render, no new screen)

- `SketchScene` gets `setRiserFlowInputs(inputs)` with the shape of `riserFlowInputsOf`. `recomputeFlow` uses a fitting as a boundary only when `setRiserFlowInputs` has an entry for it. For a network it passes `riserFittingIds` (the keys), `entryFittingId` and `riserDemand`. A network with no key is solved as today. Without inputs the scene behaves as today.
- `setRiserFlowInputs` calls `recomputeFlow`. So do `setRiserMarks` and a page change. The inputs reset when a document is activated (`scene.ts:1200`, `:1328`).
- `App.tsx:2015-2020` (header total) subtracts `riserCapacity`, so the header total stays level-only (D-B-78).
- Tests: a render test with a built scene (the 3-level example, level 1, source on level 0): the segments carry 500 or less, the fitting carries 650. A no-inputs test: nothing changes.

### B7-T04b: the open level shows the numbers (ui, screen task)

- The ui computes the inputs from the building and the summaries, and from the live data of the open sheet (`buildRiserNetworks`). It runs again after a capacity edit, a save, a change of the riser list or a rebuild of summaries. Trigger on `drawingChanged`, not on `flowSolved` (`recomputeFlow` emits `flowSolved`, which would loop). After a save, refresh the other open documents.
- Visible result: the capacity of every segment and fitting of the open level counts the other levels where the solve gives a number. The Properties panel of a riser fitting says which level is the main level and the total, with the unit (`NetworkType.flowUnit` of the type of the riser, never of the open level). Draft texts: `Connected total 650 m³/h (no diversity)`, `Main level: Level 0`. The `ux-designer` writes the final texts and follows D-B-74.
- Check in a real browser (one Chromium page): a 3-level fixture (real PDFs from `fixtures/pdfs/`), the numbers of the worked example, a capacity edit that changes the numbers on the open level, and a no-building run where nothing changes. Plus a vitest for the input mapping (already in T03).

### B7-T05: the Building dialog and the takeoff (ui, screen task)

- The riser detail in the Building dialog shows the capacity of each span, "Connected total (no diversity)" and the unit. The Risers table of the takeoff gets a column (the headers of `riserTable` change, `riser-quantities.ts:152-166`, and their tests). The line `Flow is not summed across levels.` (`riser-quantities.ts:174`) becomes false: remove it or change it, and change the two tests (`riser-quantities.test.ts:244`, `building-takeoff.test.ts:314`). `BuildingRisersPane` gets the live summary of the open sheet (the same function as T03). A span with `complete` false reads "at least N". Warnings of the solve show in the dialog and in the takeoff warnings. For a drain, sprinkler or electrical type the dialog adds "Not a design flow". The `ux-designer` writes the texts.
- `journey-tester`: a user with 3 levels and one riser opens the Building dialog and understands the numbers without help.

### B7-T06: Windows test script and records

- `.claude/plans/buildings-b7-test.md`: step by step, with the numbers of the worked example, a change of one terminal capacity, a level that is not saved, a riser with two sources, a hand-set source level, a fan coil unit level, and a drain network (the word "Main level" is the outlet, no direction word).
- Ledger events, dashboard screenshots, push the branch only.

## 6. Out of scope

- Riser arrows (B8). They need B7 and the answer to D-B-74.
- Sizing of risers from the capacity (a later step; `sizing-network.ts` is not touched, D-B-78).
- Simultaneity or diversity factors (drainage EN 12056-2, sprinkler EN 12845 and electrical diversity need them). B7 sums connected capacities, as the segment solve does, and says "no diversity" in the building views.
- Pressure, velocity or any physics. Capacity stays unitless in the solver.
- A change of the building file or the project file.

## 7. Rules for every task

- Agent framework rules: `ux-designer` before every screen task, `journey-tester` before a screen task is done, no `window.confirm`, English-only UI in ASD-STE100 prose.
- Plain `pnpm dev` and production behavior must not change when no building is open or the building has no risers. Add a no-flag check. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`) is needed when a task edits the Building dialog or the building controller (T04b and T05 do). Read every line.
- `solveFlow` stays unitless and never reads `NetworkType.units`.
- Nothing outside `pdf-engine-mupdf` imports `mupdf`.
- Push the branch only. The user tests on Windows and merges.

## 8. What a browser check cannot prove

Windows, Tauri and a real browser profile are not available in the container. The test script of T06 covers them.

## 9. Risks

- A stale summary of another level gives an old number. D-B-75 shows a warning and "at least". The user saves the level to refresh it.
- Two levels with the same elevation: the chain order is the member order, and the direction of that span is not defined. The warning of `riserSpans` about equal elevation stays.
- A network that holds fittings of two different risers makes one node with two edges. A loop through two risers gives a warning.
- Duct sizing and routing keep level-only numbers (D-B-78). Properties and the sizing can differ on a source level with an exit.
- Equipment with a capacity of 0 (for example a fan coil unit with no value yet) still counts as a source. The hand-set source level wins over it.
- The old `riserFittingFlow` and the new building solve can disagree on edge cases. T03 compares them.

## 10. Audit of 2026-11-21 (roadmap-auditor and mep-domain-checker)

Each finding ends as `fixed` (in this plan), `accepted` or `open`.

| Finding | Outcome |
|---|---|
| A1 two sources versus old `deriveRiserFlow` tests | fixed: D-B-77, old rule stays for the direction word |
| A2 middle level has one fitting (entry and exit) | fixed: `riserDemand` also on the entry, `capacityIn`/`demandBeyond` |
| A3 "counts every terminal once" is false | fixed: `terminalCapacity` is the solve total, warning for a mid-run fitting |
| A4 scene "no inputs" contradiction | fixed: T04a, boundary only with an entry in the inputs |
| A5 root order | fixed: entry after the explicit root, before the old chain |
| A6 end rows of `riserSpans` | fixed in T03 |
| A7 two cases of a missing summary | fixed in T03 (two warnings) |
| A8 summary key is `projectUuid` | fixed in T03 |
| A9 double count of the open level | fixed: one replace function, live data to the pane |
| A10 `buildSheetSummary` is heavy, `flowSolved` loop | fixed: `buildRiserNetworks`, trigger on `drawingChanged` |
| A11 sizing and header total | fixed: D-B-78, `riserCapacity` |
| A12 version 3 refused by older app | fixed: D-B-73 option A keeps version 2 |
| A13 reuse `riserGraph` | fixed: T03 starts by reading it |
| A14 unit and type across levels | fixed: warning on a type mismatch; unit comes from the riser |
| A15 stale text and tests | fixed in T05 (and `sheet-summary.test.ts` stays green) |
| A16, A17, A18 wording | fixed in sections 2, 3 and 9 |
| A19 user decisions missing | fixed: D-B-77, D-B-78 |
| A20 T04 too big | fixed: T04a and T04b, input mapping in core |
| A21 missing tests | fixed in T01 to T03 |
| D1 `hasSource` and the fan coil unit | fixed: D-B-77 |
| D2 hand-set source wins | fixed: D-B-77 |
| D3 `terminalCapacity` double count of equipment | fixed: the solve total is the number |
| D4 missing level hides a low total | fixed: "at least N" |
| D5 word "capacity" | fixed: "Connected total (no diversity)" in the building views; the segment panel keeps its word |
| D6 total with two sources | fixed: D-B-76 |
| D7 `deriveRiserFlow` picks `sources[0]` | accepted: the direction word keeps the old rule (D-B-77) |
| D8 type mismatch warning | fixed in T03 |
| D9 drain test | fixed in T06 |
| D-B-74 words | open: user answer |
