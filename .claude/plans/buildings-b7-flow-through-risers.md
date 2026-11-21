# B7: flow through risers

Status: **planned 2026-11-21, not started.** Stream `buildings`, part id `B7`. B5 (shared coordinate system) stays deferred. A later part (B8, riser arrows) needs B7 first. Branch for the work: `worktree-buildings-b7`, made from `origin/worktree-buildings-b4` (master `1b7b4fd` plus this plan).

## 1. Why

The user asked for this on 2026-11-13. A riser is a segment that goes up or down. The flow rules of normal segments should also work for risers. Today they do not:

- Each level solves its own flow. A riser fitting ends the solve (a boundary). Nothing passes through it.
- The sheet summary stores only a direction word for each riser fitting (`out`, `in`, `none`). It stores no capacity.
- `deriveRiserFlow` gives the direction of a riser (up, down, both) from the source level. It gives no number.

Example of the problem: level 1 has terminals and one open end, the riser. The solve gives each segment of level 1 a capacity toward that riser. The riser itself shows nothing, and level 0 never counts the demand of level 1.

## 2. Idea

A riser is a chain of spans between its member levels, sorted by elevation (the same chain as `riserSpans` in `packages/core/src/riser-quantities.ts`). A level network that holds a riser fitting is one node. A span joins two nodes. The whole building is then a tree of nodes, and the existing rule is the same: capacity of a branch = sum of the terminal capacities behind it, counted toward the root.

- The root is the source: a level network with an equipment, or the level that the user set by hand (`riser.sourceLevelId`).
- The capacity of a span = the terminal capacity of every node behind the span, counted from the root.
- The open level gets its numbers from the same solve (`solveFlow`) with two new inputs: the riser fitting that feeds the network, and the demand behind each riser fitting that leaves the network.

Numbers do not depend on the direction of the real fluid. The sum is the same for supply and for return. Only the direction word depends on that (see D-B-74).

### Worked example (use it as an acceptance test)

Levels 0, 1, 2. One riser R with members on all three. Terminals: level 0 has 100, level 1 has 300 + 200, level 2 has 150. All values are in the unit of the network type.

| Source | Span 0-1 | Span 1-2 | Total at the source |
|---|---|---|---|
| Equipment on level 0 | 650 | 150 | 750 |
| Equipment on level 2 | 100 (level 1 to level 0) | 600 (level 2 to level 1) | 750 |
| Equipment on level 1 | 100 | 150 | 750 |

In every row the sum of terminals is 750. The span next to a leaf level equals the terminals of that level.

## 3. Facts from the code (2026-11-21)

- `packages/core/src/flow.ts`: `solveFlow` takes `riserFittingIds`. A marked fitting is a boundary: it is never the root, and the walk does not continue past it (child demand 0). `riserFittingFlow` gives `out`, `in` or `none` from "is there an equipment on this network".
- `packages/core/src/sheet-summary.ts`: `SHEET_SUMMARY_VERSION = 2`. `riserFittingFlow` is a merged map (fitting id to `out`/`in`/`none`). `buildSheetSummary` builds it with `riserFittingFlowOf` for every network that has a riser fitting. A summary has no capacity and no network structure.
- `packages/core/src/riser-flow.ts`: `deriveRiserFlow(file, perLevelFlow)`. A source = a member with `out`, or the member of `riser.sourceLevelId`. The result is a direction for the whole riser.
- `packages/core/src/riser-quantities.ts`: `riserSpans`, `riserFittingIdsForSheets`. `building-takeoff.ts` uses `deriveRiserFlow` for the riser table.
- `packages/render/src/scene.ts` (`recomputeFlow`, about line 3759): the live solve calls `solveFlow` per network with no `riserFittingIds`. In the live view a riser fitting is an ordinary fitting. The scene holds `riserMarks` (fitting id to mark) and `getRiserMarks()`.
- `packages/ui/src/riserInfo.ts`: `riserFlowText`, `derivedFlowOf`. `App.tsx` (about line 1300) builds a live summary of the open sheet with `buildSheetSummary` for the Level and Building takeoff.
- Terminal capacity of a network does not depend on the root. With a boundary at every riser fitting, the solve counts every terminal of the network once. This is the reason why one number per network is enough in the summary.
- `NetworkType.flowUnit` (flow-units.ts) is the label of the capacity numbers of a type. `solveFlow` never reads it. Use it only for display.

## 4. Decisions

- **D-B-73 (user, needs an answer before T02): a new optional field in the sheet summary.** Option A (recommended): `SHEET_SUMMARY_VERSION` 2 to 3, new optional field `riserNetworks` (section 5, T02). A version 2 summary stays valid. It has no `riserNetworks`, so the building solve treats its levels as "not known yet" and the app offers the existing rebuild of summaries. The building file and the project file do not change. Option B: read every PDF and project on each solve. Too slow. The summary is a derived cache, so A is easy to reverse.
- **D-B-74 (user and domain checker): what does "direction" mean?** Option A (recommended): in B7 the direction is "away from the source level" (as `deriveRiserFlow` says today: "source: Level 0"), and a span shows a capacity. B8 adds the supply or return meaning to the arrows. Option B: add a supply/return flag to the network type now. Reason for A: the solver is structural. `segmentDirection` of `solveFlow` points toward the root, and the riser direction today points away from the source. B7 must not draw arrows that mislead for a return network. The flag belongs to B8.
- **D-B-75 (provisional): other levels use their saved summary.** A level that is not saved, not opened or without a summary counts with demand 0 and gives a warning that names the level. The open level always uses its live data. The app never opens a PDF to solve.
- **D-B-76 (provisional): two sources, or a loop, or no source gives no number.** The riser shows "not known yet" and a warning. Same stance as the loop rule for segments in `flow.ts`.

## 5. Tasks

Order matters. T01 to T03 are core only (pure functions with unit tests). T04 and T05 change what the user sees: the `ux-designer` runs first, the dashboard shows the wireframe and the texts, and the `journey-tester` runs before the task is done.

### B7-T01: solver inputs for risers (core)

- `FlowSolveInput` gets two optional fields:
  - `entryFittingId?: string`: a riser fitting that feeds this network. It is the root when the network has no explicit root and no equipment. A marked fitting that is the entry is allowed as the root. A marked fitting that is not the entry stays a boundary.
  - `riserDemand?: Record<string, number>`: extra capacity behind a boundary riser fitting (fitting id to number). The solve adds it to the child demand of that fitting, so `segmentCapacity`, `fittingCapacity` and `totalCapacity` count the levels beyond.
- With neither field, nothing changes. Every existing test in `flow.test.ts` stays green without edit.
- Tests: entry as root with a drain behind another fitting; equipment root with drains; entry and equipment on one network (the explicit rule: the equipment wins and the entry counts as a second source; the building solve reports it); an entry id that is not in the network (ignored).

### B7-T02: the summary lists the riser networks (core)

- After the answer to D-B-73. New optional field of `SheetSummary`: `riserNetworks?: Array<{ networkTypeId: string; fittingIds: string[]; terminalCapacity: number; hasSource: boolean }>`. One entry for each network that holds at least one riser fitting. `fittingIds` are the riser fittings (sorted). `terminalCapacity` is the sum of the capacities of the elements of the network (the same sum as `networkCapacity` in `riserFittingFlow`). `hasSource` is "the network has an element of category equipment" (the same rule as `riserFittingFlow`).
- `SHEET_SUMMARY_VERSION` 3, migration step 2 to 3 adds nothing, validator for the new field. Keep `riserFittingFlow` (old readers and old tests use it).
- Tests: build, parse, migrate a version 2 summary, validate a bad entry.
- `rebuildSummaries` builds the field (it already calls `buildSheetSummary` with `riserFittingIds`).

### B7-T03: the building solve (core)

- New file `packages/core/src/building-flow.ts`: `solveBuildingFlow(file, summaries)` where `summaries` maps a sheet id to its `SheetSummary` (or absent). Pure. No I/O.
- Result for each riser: its spans in elevation order, each with `capacity`, `direction` (`'up' | 'down'`, away from the source), `fromLevelId`, `toLevelId`, and the problem states `ok | unknown`. For each riser member: `role` (`'feed' | 'drain' | 'source' | 'none'`), the capacity that comes in or goes out, and the demand behind it. A list of warnings (text, one per problem, naming the level).
- Rules:
  - A node = a network of a sheet that holds a riser fitting (from `riserNetworks`). A node of a riser member that has no summary entry is an empty node (demand 0) with a warning (D-B-75).
  - An edge = the span between two consecutive members of one riser (sorted by elevation, the same order as `riserSpans`).
  - The source of a connected group = the node with `hasSource`, or the node of the member on `riser.sourceLevelId`. Two sources, a loop, or no source gives no number (D-B-76).
  - Capacity of an edge = the demand of the subtree behind it. Demand of a node = `terminalCapacity` + the demand behind its other riser fittings.
- One rule for "what is the source": reuse it in `deriveRiserFlow`. Do not make two rules. After T03 `deriveRiserFlow` and `solveBuildingFlow` must agree on the direction of every existing riser test. If they cannot, report it. Do not change old tests to make them pass.
- Tests: the three rows of the worked example, a riser with a gap level, two risers in one tree, a loop, two sources, no source, a missing summary, a hand-set source level, two networks on one level that use two different risers.

### B7-T04: the open level shows the numbers (render and ui, screen task)

- `SketchScene` gets `setRiserFlowInputs(inputs)`: for each riser fitting of the open sheet, the role and the demand from the building solve. `recomputeFlow` passes `riserFittingIds` (the keys of `riserMarks`), `entryFittingId` and `riserDemand` to `solveFlow`. Without inputs the scene behaves as today (the plain no-building case does not change).
- The ui computes the inputs from the building and the summaries, and from the live summary of the open sheet (as `App.tsx` does for the takeoff). It runs again after a capacity edit, a save, or a change of the riser list. No circle: the terminal sum of a level does not depend on the root.
- Visible result: the capacity of every segment and fitting of the open level now counts the other levels. The Properties panel of a riser fitting says where the flow comes from or goes to, with the capacity and the unit (`NetworkType.flowUnit`). Draft texts: `Feeds Level 2 · 650 m³/h`, `Fed from Level 0 · 650 m³/h`, `Source level`. The `ux-designer` writes the final texts.
- Check in a real browser (one Chromium page): a 3-level fixture (real PDFs from `fixtures/pdfs/`), the numbers of the worked example, a capacity edit that changes the numbers on the open level, and a no-building run where nothing changes.

### B7-T05: the Building dialog and the takeoff (ui, screen task)

- The riser detail in the Building dialog shows the capacity of each span, the direction word and the unit. The riser takeoff table gets a capacity column. Warnings from the solve (missing summary, two sources, loop, no source) show in the dialog and in the takeoff warnings. The `ux-designer` writes the texts. The word "from the flow solve" in `riserFlowText` stays true.
- `journey-tester`: a user with 3 levels and one riser opens the Building dialog and understands the numbers without help.

### B7-T06: Windows test script and records

- `.claude/plans/buildings-b7-test.md`: step by step, with the numbers of the worked example, a change of one terminal capacity, a level that is not saved, a riser with two sources, and a return network (the direction word, see D-B-74).
- Ledger events, dashboard screenshots, push the branch only.

## 6. Out of scope

- Riser arrows (B8). They need B7 and the answer to D-B-74.
- Sizing of risers from the capacity (a later step; `sizing-network.ts` is not touched).
- Simultaneity or diversity factors. B7 sums capacities, as the segment solve does.
- Pressure, velocity or any physics. Capacity stays unitless in the solver.
- A change of the building file or the project file.

## 7. Rules for every task

- Agent framework rules: `ux-designer` before every screen task, `journey-tester` before a screen task is done, no `window.confirm`, English-only UI in ASD-STE100 prose.
- Plain `pnpm dev` and production behavior must not change when no building is open or the building has no risers. Add a no-flag check. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`) is needed when a task edits the Building dialog or the building controller (T04 and T05 do). Read every line.
- `solveFlow` stays unitless and never reads `NetworkType.units`.
- Nothing outside `pdf-engine-mupdf` imports `mupdf`.
- Push the branch only. The user tests on Windows and merges.

## 8. What a browser check cannot prove

Windows, Tauri and a real browser profile are not available in the container. The test script of T06 covers them.

## 9. Risks

- A stale summary of another level gives an old number. D-B-75 shows a warning. The user saves the level to refresh it.
- A level with two sheets of one riser at the same elevation: the chain order is the member order. The warning of `riserSpans` about equal elevation stays.
- A network that holds fittings of two different risers makes one node with two edges. The tree rule still holds. A loop through two risers gives a warning.
- The old `riserFittingFlow` and the new building solve can disagree on edge cases. T03 compares them.
