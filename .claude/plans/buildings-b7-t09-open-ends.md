# B7-T09: open ends are possible sources (the "highest" rule)

Status: **planned 2026-11-23, revised the same day after the audit (3 high findings) and the domain check. Not started.** Stream `buildings`, part `B7`, branch `worktree-buildings-b7`. Parent plan: `buildings-b7-flow-through-risers.md`. T09 starts after B7-T07 is merged on the branch. T07 changes `useRiserFlowInputs.ts`, `riserFlowSync.ts`, `App.tsx`, the Risers pane and `building-flow.ts` (the `live` argument). Each T09 task must re-read these files first. This plan does not depend on their details. Line numbers come from the working copy of 2026-11-23 and can move after T07.

Six questions wait for the user (section 6, "Open"). A task that depends on one is marked "waits for D-B-xx". The tasks without such a mark can start at once.

## 0. Words used here

- **Open end**: the end of a segment that connects to nothing. It is a bare fitting with one segment, and it is not a riser fitting. A terminal is not an open end. An equipment is not an open end.
- **Source**: an element of category `equipment` whose own capacity is 0 or empty (D-B-77). A main level that the user sets by hand is also a source.
- **Possible source**: an open end of a network that has no source.
- **K**: the number of possible sources of one network (on one level) or of one group of levels (in a building).
- **Side of a segment**: when you cut one segment, the network falls into two sides. A riser span is also a cut. It splits the whole building into two sides.
- **Highest rule**: a segment shows the highest value that it would carry for any choice of source. The value of one choice is the sum of the terminal capacities on the side that does not hold the source. This is the sum that `solveFlow` gives today for one root.
- **Level node**: all the network of one level that holds riser fittings. The building solve treats it as one node (B7 plan, section 2).

## 1. Goal

A network with no source must show useful numbers. Today the solver picks ONE open end as root. The result depends on the sort order of the fitting ids. One open segment shows the sum and the other shows 0. Across levels, a group with no source shows "Not known yet".

After T09:

- Every open segment of a network with no source shows all the capacity that is not on its own side.
- A riser span shows the highest of its two directions, with the words "at most".
- One rule holds on one level and across levels. A riser span is a segment. A level is a node. A vertical and a horizontal segment have no different rule.
- A network with a source keeps the current rule. A dead open end shows 0.
- The numbers settle by themselves. When the user places a source or a terminal, the normal rule applies at once.

## 2. The examples (acceptance numbers)

Unit of all numbers: the unit of the network type. All networks have type Supply Air. "Words" at the end of each example follows D-B-104 option B (recommended): "at most" shows only when K is 2 or more. With option A it shows in every example.

### Example 1: one level, one terminal, a T fitting, two open ends, no source

Elements: terminal `Tm` (capacity 100). Segments: `main` (Tm to T), `s1` (T to O1), `s2` (T to O2). Fittings: `T` (tee), `O1` and `O2` (open ends). Possible sources: O1, O2. K = 2.

| Item | Today (root = first open end by id: O1) | After T09 |
|---|---|---|
| `main` | 100 | 100 |
| `s1` | 100 | **100** |
| `s2` | 0 | **100** |
| fitting T | 100 | 100 |
| fitting O1 | 100 (root, total) | 100 |
| fitting O2 | 0 | **100** |
| total (header) | 100 | 100 |

Words: `at most 100` on every item and the hint.

Example 1b: the same network, but an equipment `E` (capacity empty) replaces O1 at the end of `s1`. There is a source. The old rule holds: `main` 100, `s1` 100, `s2` 0, fitting T 100, fitting O2 0 (a dead open end), total 100. No "at most", no hint.

Example 1c: the same as 1, but the user places a second terminal `Tm2` (50) at O2. Now O1 is the only open end (K = 1). `s1` 150, `main` 100, `s2` 50, fitting T 150, total 150. The numbers are the same as today. Words: plain numbers (no "at most") with option B.

### Example 2: three levels, one terminal on Level 0, no source

Level 0: terminal `Tm0` (100), segment `a0` (Tm0 to RF0), riser fitting RF0. Level 1: RF1, segment `a1` (RF1 to O1), open end O1. Level 2: RF2, segment `a2` (RF2 to O2), open end O2. One riser R through RF0, RF1, RF2. No equipment anywhere. K = 2.

| Item | Today | After T09 |
|---|---|---|
| Level 0 `a0`, fitting RF0 | 100, 100 | 100, 100 |
| Level 1 `a1`, fitting RF1, fitting O1 | 0, 0, 0 | **100, 100, 100** |
| Level 2 `a2`, fitting RF2, fitting O2 | 0, 0, 0 | **100, 100, 100** |
| Span Level 0 to Level 1 | Not known yet | **at most 100** |
| Span Level 1 to Level 2 | Not known yet | **at most 100** |
| Main level | not known yet (no source level) | not known yet (no source level) |
| Connected total | 100 | 100 |

### Example 3: terminals on Level 0 (100) and Level 2 (50), the open end on Level 1

Level 0: `Tm0` (100), `a0`, RF0. Level 1: RF1, `b1` (RF1 to O1), O1. Level 2: `Tm2` (50), `c2` (Tm2 to RF2), RF2. Only O1 can be a source. K = 1.

| Item | After T09 | Why |
|---|---|---|
| `a0`, RF0 | 100, 100 | the source is on the far side, so the segment carries its own terminal |
| `b1`, RF1, O1 | 150, 150, 150 | the source O1 is on this level. Everything else flows away from it |
| `c2`, RF2 | 50, 50 | same as `a0` |
| Span Level 0 to Level 1 | 100 | only the Level 1 side can hold a source. The span carries Level 0 |
| Span Level 1 to Level 2 | 50 | only the Level 0+1 side can hold a source. The span carries Level 2 |
| Connected total | 150 | |

Words: plain numbers with option B (K = 1). This example shows why the building solve needs to know which levels have an open end (D-B-93). If every level counted as a possible source, span 1 to 2 would read 100. That is wrong.

### Example 4: single level, two terminals

4a, one open end (K = 1). `Tm1` (60) to T by `s1`, `Tm2` (40) to T by `s2`, T to O by `s3`. There is one possible source, so the highest rule gives the old numbers: `s1` 60, `s2` 40, `s3` 100, fitting T 100, fitting O 100, total 100.

4b, two open ends (K = 2). A chain `O1 - p1 - F1 - p2 - F2 - p3 - O2`. `Tm1` (60) joins F1 by `q1`. `Tm2` (40) joins F2 by `q2`.

| Item | Root O1 | Root O2 | Today (root O1) | After T09 (highest) |
|---|---|---|---|---|
| `p1` | 100 | 0 | 100 | **100** |
| `p2` | 40 | 60 | 40 | **60** |
| `p3` | 0 | 100 | 0 | **100** |
| `q1` | 60 | 60 | 60 | 60 |
| `q2` | 40 | 40 | 40 | 40 |
| fitting F1 | 100 | 60 | 100 | 100 |
| fitting F2 | 40 | 100 | 40 | **100** |
| fitting O1 | 100 | 0 | 100 | 100 |
| fitting O2 | 0 | 100 | 0 | **100** |

`p2` is not the sum of both choices. It is the highest of the two.

### Example 5: the worked example of B7, with no source

Same terminals as the B7 worked example: Level 0 has `Tm0` 100. Level 1 has `Tm300` and `Tm200`. Level 2 has `Tm2` 150. Every level also has one open end (O0, O1, O2). No equipment. K = 3.

Spans and total:

| Span | Side A | Side B | After T09 |
|---|---|---|---|
| Level 0 to Level 1 | Level 0: 100 | Levels 1+2: 650 | **at most 650** (source on side B: 100. Source on side A: 650) |
| Level 1 to Level 2 | Levels 0+1: 600 | Level 2: 150 | **at most 600** (source on side B: 600. Source on side A: 150) |
| Connected total | | | 750 |

Level 1 in detail. The tee `F` has `Tm300` (segment `sa`), `Tm200` (segment `sb`), the open end O1 (segment `so`) and the riser fitting RF1 (segment `s1`). Sides of RF1: below `{demand 100, openEnds 1}`, above `{demand 150, openEnds 1}`. Total of Level 1 = 500 + 100 + 150 = 750.

| Item | Source on the RF1 side | Source at O1 | After T09 (highest) |
|---|---|---|---|
| `sa` | 300 | 300 | 300 |
| `sb` | 200 | 200 | 200 |
| `s1` (RF1 to F) | 500 (the F side: 300 + 200) | 250 (the RF1 side: 100 + 150) | **500** |
| `so` (F to O1) | 0 | 750 | **750** |
| fitting F | 500 | 750 | **750** |
| fitting O1 | n/a | 750 (total) | **750** |
| fitting RF1 | 650 (source below: 750 - 100) or 600 (source above: 750 - 150) | 250 | **650** |

The segment `s1` is 500, not 650. The two sides of RF1 (100 and 150) lie on the RF1 side of `s1`. They never count for a source that sits on that side. Compare with the B7 worked example with equipment on Level 0: 650 and 150.

## 3. The rule

### 3.1 Definition

Take a tree (a network without a loop). Let `R` be the set of possible sources. For one source `r` in `R`, run the existing subtree sum. Each segment, fitting and span gets the value of `solveFlow` for that root. The **highest value** of an item is its maximum over all `r` in `R`.

A "node" of the tree can be an open end, a terminal port, a fitting, or a level. An "edge" can be a segment or a riser span. The rule is the same for all of them. A rule written like this supersedes D-B-76 and item 3 of D-B-77 for the case of open ends (see D-B-86 and D-B-88).

### 3.2 When the rule applies

All of these must hold. Otherwise the old rule runs and nothing changes.

1. The caller asks for it (`highestWhenNoSource: true`, D-B-92). The scene does not ask for a network of a drain type (D-B-100, option A).
2. No explicit root (`rootElementId`) is valid, and no entry fitting (`entryFittingId`) is valid.
3. The network has no source (no element of category `equipment` with capacity not above 0, in this network only).
4. K is 1 or more: a local open end, or an open side (3.4).
5. The graph is a tree (no loop).
6. Every marked riser fitting is the end of a run (one segment). A mid-run riser fitting keeps the old rule (the T02 warning case).

For the building: the group has no hand-set main level, no node with a source, no missing node, no node with a mid-run riser fitting, no loop, no riser of a drain type (D-B-100), a known number of open ends for each node (D-B-93), and K of 1 or more.

The result says "no source" (3.5) when K is 2 or more (D-B-104, option B). The numbers are the same for K = 1.

### 3.3 The algorithm (one helper for the level and the building)

New pure helper `highestFlow(nodes, edges)` in `packages/core/src/flow-highest.ts`. It uses no recursion.

1. Let `T` = sum of `own` over all nodes. Let `K` = sum of `roots` over all nodes (the count of possible sources).
2. Walk the tree once from the first node (sorted by id), with an explicit stack. Record the parent and the walk order.
3. In reverse walk order, compute for each node `sub` (sum of `own` in its subtree) and `rootsSub` (count of possible sources in its subtree).
4. For each edge between parent `p` and child `c`: side C has demand `sub[c]` and `rootsSub[c]` possible sources. Side P has demand `T - sub[c]` and `K - rootsSub[c]` possible sources.
5. Edge value = the highest of: `sub[c]` when side P has a possible source; `T - sub[c]` when side C has one. When `K` is 0, the value is null.
6. Node value (used for fittings): for each edge at the node, take the demand of the node's own side when the other side has a possible source. For a node with `roots` above 0, also take `T`. The node value is the highest of these. Null when there is none.

Why this equals "run the solve for each root": the solve for root `r` gives each edge the demand of the side that does not hold `r`. That side is the same for every root on the same side of the edge. So only two numbers exist for each edge. Step 5 takes the highest of those two that a possible source can reach. The node value in step 6 is the subtree demand that `solveFlow` gives a non-root node (the demand on its own side of the edge toward the root), or the total for a root node.

Cost: the walk is O(N) for N nodes. `solveFlow` already sorts the node keys (`flow.ts:85`), which is O(N log N). So one solve stays O(N log N). The naive method (one solve for each open end) costs O(K x N). A network with 300 open ends and 5000 nodes would need 1.5 million steps for each edit. The one-pass walk avoids that. No cap is needed. The naive method stays in the tests only, as an oracle (T09a-1).

Order does not matter. The result does not depend on the sort order of ids. This fixes the id-order problem of today.

### 3.4 How the level solve takes the other levels

A marked riser fitting with `sides` (one entry for each span at that fitting, seen from this level) gets one extra node for each side. The extra node has `own = side.demand` and `roots = side.openEnds`. It joins the fitting by one extra edge. An old `riserDemand` value for a fitting (an exit) is one side with `openEnds: 0`.

A middle level has one riser fitting and two spans. So the fitting has two sides. The solve never mixes them. When the source is beyond one side, the other side counts as demand.

`side.demand` is the sum of terminal capacities on the far side of the span. `side.openEnds` is the number of open ends on the far side.

A riser fitting that has no input (state unknown, role none) is never a root and never an open end (D-B-102). It is a boundary with demand 0, as today.

### 3.5 The result fields in this mode

| Field | Value in the mode |
|---|---|
| `segmentCapacity[id]` | the edge value (3.3 step 5) |
| `fittingCapacity[id]` | the node value (3.3 step 6) |
| `resolved` | true |
| `totalCapacity` | local terminals + sum of all side demands |
| `riserCapacity` | sum of all side demands (set when `riserDemand` or `riserSides` is given). So the header total stays level-only (D-B-89) |
| `segmentDirection[id]` | `null` for every segment (D-B-95) |
| `noSource` (new, optional) | `'highest'` when K is 2 or more. Absent when K is 1 |

When the network has no source, no valid root or entry, and has a loop, the old rule runs and `noSource` is `'loop'`. The UI then says so (section 7).

### 3.6 Loops, unresolved items, a network that has no open end

- A loop in the level graph (a ring main, a sprinkler grid): the old rule runs. The closing segment stays `null`, as today. `noSource` is `'loop'` and the hint says so. A possible later step: give a value to the segments outside the loop (D-B-96, option B).
- A loop in the building (two risers in a ring): the old warning stays and the spans have no number.
- A network with no open end and no open side (only terminals, or a closed ring of terminals): the old rule runs, as today. `noSource` is absent.
- A segment that the walk cannot reach: `null`, as today.

## 4. How the rule meets the existing flags

| Item | What happens |
|---|---|
| `resolved` | true in the mode. The old early returns (no nodes, no root candidate) stay before the new branch (`flow.ts:96-112`). |
| `totalCapacity` | see 3.5. It is the same for any source, so it is a stable number. |
| `segmentDirection` | `null` in the mode. The value is the highest over several roots, so no one direction is true. A direction would also say "the flow goes here", and the source is not known. The only reader is the flow overlay (`scene.ts:3817`). It draws an A to B arrow when the direction is not `BtoA`. T09c-1 skips the arrowhead for a `null` direction and keeps the number. |
| `riserFittingFlow` (`out`, `in`, `none`) | not touched. It calls `solveFlow` without the new flag. `deriveRiserFlow` and the old box "Flow direction" keep their rules (B8 keeps them). |
| entry fitting (`entryFittingId`) | when a valid entry exists, the old rule runs. The level is fed from a level that has the source, so open ends are dead (D-B-87). |
| `riserDemand` | still used by the old rule. In the mode it becomes one side with `openEnds: 0`. |
| `RiserFlowInput` roles | new role `open` (no source known: every side is a possible source). `entry` and `exit` stay. |
| building solve | a group with no source, complete data and K of 1 or more is `state: 'ok'` with no `sourceLevelId`. `atMost: true` is set when K is 2 or more. Every other no-source case stays `unknown` (as in T03). |
| mid-run riser fitting | the level solve turns the mode off (3.2 item 6). The building solve cannot see the drawing. It reads the summary warning `RISER_WARNING` (`sheet-summary.ts:97`) and turns the mode off for the whole group (D-B-106). |
| "Main level: not known yet" (T04b/T05) | stays for: two sources, a loop, two hand-set levels, a missing level, a mid-run riser fitting, a drain, a missing open-end count, and no open end. In the new state the line reads `Main level: not known yet (no source level)` and the rows have numbers. |
| "at least" (a level has no data) | not combined with "at most". A group with a missing level never uses the highest rule (D-B-94). So the two words never appear in one number. |
| source level set by hand | the old rule for the group. The level that the user set has the source, so spans have exact numbers. The level itself has no equipment: its open ends are possible sources (D-B-97). |

## 5. Facts from the code (2026-11-23)

- `packages/core/src/flow.ts:69` `solveFlow`. The root chain is at `:137-144`: explicit root, entry, equipment with one connection, open end (a node with one connection that is not a terminal, `:141`), any equipment, any node with one connection, the first key. The nodes are sorted by key (`:85`). A `fitting:` key sorts before a `port:` key. So the first open end by fitting id wins. This is the cause of Example 1. `flow.ts` is already exported from `index.ts:40`.
- `flow.ts:141` counts a PORT of a stamp with one connection and no capacity as an open end, if it is not a terminal. That includes a stamp of category `fitting`. D-B-91 uses a stricter definition for the new rule.
- `flow.ts:140-143`: an open end wins over an equipment with two or more connections. This copies the old app (`NetworkFlowProcessor.cs` FindRoot, step 2b: "a collector's discharge"). T09 does not change it. A network with an equipment keeps the old rule (D-B-87).
- `flow.ts:196-231` `riserFittingFlow` counts `hasSource` over ALL `elementCategories`. The scene passes the categories of all stamps of the document (`scene.ts:3778`). So the new `networkHasSource` must look only at the elements that have a port in this network.
- An empty capacity counts as 0. `ownCapacityOf` gives `terminalCapacities[elementId] ?? 0` (`flow.ts:61-67`). The Capacity inputs store `Number(value) || 0` (`PropertiesPanel.tsx:543`, `:681`), so an empty field stores 0.
- `packages/core/src/sheet-summary.ts:19` `RiserNetworkSummary` has `networkTypeId`, `fittingIds`, `terminalCapacity`, `hasSource`, `warnings`. It has no count of open ends. `:97` the constant `RISER_WARNING` (not exported). `:100` `buildRiserNetworks`. `:119` `hasSource`. `:129-135` the mid-run test. `:298-319` the validator `validateRiserNetworks`.
- `packages/core/src/building-flow.ts:91` `solveBuildingFlow`. `:142` the node warnings are copied to the result. `:228-277` source choice (`:265-276` the candidate list: with 0 candidates the group stays `unknown`). `:279-319` the solve (`solveBelow`, `:297`). `:326-345` the members and their roles. `:359` `RiserFlowInput`. `:362` `riserFlowInputsOf`.
- The scene holds `riserMarks` for the shown sheet only. `buildRiserMarks` (`packages/ui/src/riserActions.ts:201-220`) makes one mark for each riser member with `member.sheetId === sheet.id`. `useBuildingRisers.ts:696` calls `scene.setRiserMarks(marks)`. `scene.ts:3115-3119` `setRiserMarks` runs `recomputeFlow` only when `riserFlowInputs.size > 0`. A mark exists even when the member has no input (role none, state unknown).
- `riserFittingIdsForSheets` (`riser-quantities.ts:200-209`) gives the riser fitting ids of all sheets of a project. `computeRiserFlow` already calls it (`riserFlowSync.ts:32`).
- `packages/render/src/riserFlowInputs.ts:10-21` `riserSolveOptionsFor` marks only fittings that have an input. `scene.ts:3126` `setRiserFlowInputs`. `:3772` `recomputeFlow`. `:3780` the `solveFlow` call. `:3796-3835` `syncFlowLabels`. `:442` `SegmentInfo`, `:458` `FittingInfo`. `:1470` and `:1479` the lookups of the solved capacity. `:1205` and `:1334` the places where the inputs reset.
- `packages/ui/src/riserFlowSync.ts:86-95` `sameRiserFlowInputs` compares only `role` and `demandBeyond`. `:98` `RiserFlowSender`. `packages/ui/src/useRiserFlowInputs.ts:28` the hook.
- `packages/ui/src/riserCapacity.ts:10-13` `isNotDesignFlow` (a drain is `ROUTE_GRAVITY_TYPE_IDS`, `route-plan-warnings.ts:5`: only the id `sanitary-waste`). `:16` `capacityNumberText`. `:127` `capacityViewOf`. `:213` `fittingRiserLinesOf`. `:237-253` `needsSummaryRead`. `:41-50` the hint texts.
- `packages/ui/src/components/PropertiesPanel.tsx:37` `formatSolvedCapacity`. `:217-218` the segment field and `:220` the D-B-84 hint. `:328-329` the fitting field. `:331-345` the riser block. `:355-367` the multi-select field.
- `packages/ui/src/components/BuildingRisersPane.tsx:533-566` the capacity block. `:589` the old box "Flow direction".
- `packages/ui/src/App.tsx` (about `:2025`) the header total: `totalCapacity - riserCapacity`.
- `packages/core/src/riser-quantities.ts:131-136` the capacity columns. `:184-197` `riserTakeoffWarnings`.
- Capacity units: a terminal has one bare number (`flow.ts:21`) and no unit of its own. The unit is a label of the network type: `flowUnit` (`flow-units.ts:26-27`: W and kW as power units, no VA) or the free text `units` (`network-type-library.ts:25-28`: `A` for Branch Circuit and Feeder, empty for Conduit and Cable Tray).
- Decisions D-B-79 to D-B-84 are in `.claude/roadmap/ledger-buildings.jsonl` (lines 465-476), not in the parent plan file. D-B-84 is the hint "This segment is on the network of riser R1".
- Callers of `solveFlow` that must not change: `sizing-network.ts:91`, `route-build.ts:591`, `sheet-summary.ts:109` (`buildRiserNetworks`), `flow.ts:200` (`riserFittingFlow`). They do not pass the new flag (D-B-92).
- Old tests that depend on the default of an absent open-end count (D-B-93): `building-flow.test.ts:246-258` and `:510-518`, `building-takeoff.test.ts:446-457`, `riserCapacity.test.ts:223-226`, `:399`, `:480`. Their summaries have no `openEnds` and expect `unknown`.

## 6. Decisions

"User" means the user decided it. "Open" means the user must answer first. "Provisional" means the director may take my recommendation and record it.

### Decided by the user (do not reopen)

- **D-B-86 (user): the highest rule for a network with no source.** Every open end is a possible source. Each segment shows the highest value for any choice of source. Across levels the same rule holds: a riser span is a segment and the levels behind it are demand. **Supersedes D-B-76 and D-B-77 item 3 for the case of open ends:** a group with no source level and at least one open end is no longer "no unique source". Two sources, a loop and a missing level stay as D-B-76 says.
- **D-B-87 (user): a network with a source keeps the current rule.** A dead open end shows 0 and stays 0 until someone places a terminal or an equipment on it.
- **D-B-88 (user): riser spans of a group with no source.** A span shows the highest of its two directions (for example 650 for 100 on one side and 650 on the other). The UI marks it "at most". Words stay neutral: no arrow, no Up, no Down (D-B-74 stays). **Supersedes D-B-76 and D-B-77 item 3 for the case of open ends** (same reason as D-B-86).
- **D-B-89 (user): what stays level-only.** Sizing, routing and the header total stay level-only (D-B-78). The sheet summary format, the building file and the project file do not change without a question to the user.
- **D-B-90 (user): the result settles by itself.** After a source or a terminal is placed, the normal rule applies.

### Open (the user answers before the task named)

- **D-B-93 [data model] (open): an optional open-end count in the stored summary, and what an absent count means.** The stored summary has no such number (`sheet-summary.ts:19`). Example 3 shows it is needed.
  - Field. A: add the optional field `openEnds?: number` to `RiserNetworkSummary`. `SHEET_SUMMARY_VERSION` stays 2 (the same pattern as `riserNetworks` in D-B-73). An older app ignores the field. B: no field. Every level counts as a possible source. Example 3 gives 100 for span 1 to 2 (true value 50), and the old tests listed in section 5 break. C: the field only in the live data of open levels. Saved levels have no count. The numbers differ between open and closed levels. Not recommended.
  - Default of an absent field (summaries saved before T09), for option A.
    - A1: an absent count means "can hold a source". The old tests listed in section 5 break (their summaries have no count and they expect `unknown`). T09b-2 would have to change them, or their test helpers would have to set `openEnds: 0`.
    - A2: an absent count means "no data". The group stays `unknown` with the old warning, plus one note for each level: `The summary of Level 1 has no open-end data. Read the summaries.` The old tests stay green. A count of 0 or more then drives the rule. The "Read summaries now" link shows for this case (T09c-3).
  - **Recommendation: A with A2.** It is the same pattern as D-B-73. It breaks no old test. A stale summary never gives a number that is too high.
  - What changes in the split: A2 means T09b-2 treats a missing count like a missing level, and T09c-3 extends `needsSummaryRead`. A1 means T09b-2 treats it as a possible source and the old tests change. B means T09b-1 is dropped and T09b-2 takes every node as a possible source. Waits: T09b-1, T09b-2, and the part of T09c-3 that reads the count.
- **D-B-97 (open, small): a level that the user set as main level by hand but that has no equipment.** The level has open ends.
  - A: its open ends are possible sources (the highest rule, local to the level).
  - B: the old rule (the first open end by id wins).
  - **Recommendation: A.** B depends on the sort order of ids and cannot be explained. A needs no building code: the level solve sees a level with no source and no entry, so the rule applies. It changes numbers on a level that has a hand-set main level, so the user should confirm.
  - What changes in the split: with B, T09a-3 adds a switch in `solveFlow` ("a marked fitting with `riserDemand` and no entry means a source level: the old chain"), and one test changes. Waits: the hand-set test of T09a-3 only.
- **D-B-100 (open): a drain.** A drain flows by gravity toward the outlet. The upstream end of a branch can never be the outlet. So the highest rule gives a wrong number for a drain.
  - How the code knows a drain: the network type id is in `ROUTE_GRAVITY_TYPE_IDS` (`route-plan-warnings.ts:5`, now only `sanitary-waste`). B7-T05 uses it in `isNotDesignFlow` (`riserCapacity.ts:10-13`). A user-made drain type with another id is not found. This gap already exists for the tag "Not a design flow" (D-B-82).
  - What "marks an outlet" means with the existing model: the user places an element of category `equipment` with an empty capacity on the drain network (a sewer connection or an outlet stamp). The rule `networkHasSource` then finds a source and the old rule runs. On a riser the user can also set the main level by hand (`riser.sourceLevelId`). No new mechanism is needed. Not verified: whether the stamp library has an outlet stamp of category `equipment`. If it has none, the user can make one in the Element Editor.
  - A (recommended): air, water, sprinkler and electrical types use the highest rule. A drain keeps the old rule on one level (no change, no "at most"). A drain group shows "Not known yet" for its spans until a source exists (as today).
  - B: as A, and a drain level with no source also shows "Not solved" (the solve is unresolved). The header total then counts that network as 0. This changes the header total (conflicts with D-B-89).
  - C: the highest rule for all types.
  - **Recommendation: A.** It keeps today's behavior for a drain and makes no wrong number "official".
  - What changes in the split: A and B add one condition in the scene call (T09c-1: `highestWhenNoSource` is false when `ROUTE_GRAVITY_TYPE_IDS` has the network type id) and one condition in the building solve (T09b-2: a group with a riser of a drain type stays `unknown`). B also adds a third mode value in T09a-2. C removes both conditions. Waits: T09c-1 (one line), T09b-2 (one condition).
- **D-B-103 (open): the tag for an electrical network.** Domain check: an electrical sum is a connected load, not a design load.
  - What the code has: a terminal has one bare number and no unit (`flow.ts:21`). The unit is a label of the network type (W or kW as `flowUnit`, `flow-units.ts:26-27`; the library uses `A` for Branch Circuit and Feeder, and an empty label for Conduit and Cable Tray). VA is not a unit in the code. A mix of kW and VA inside one network is possible only when the user types such values by hand. The code cannot detect it, because a terminal has no unit of its own.
  - A (recommended): for the discipline `electrical` the tag reads `Connected load, not a design load` and the hint reads `These numbers are a plain sum of connected loads, with no concurrency factor. They are not a design load for this network type.` No check of a unit mix.
  - B: as A, and a warning when the electrical type has no `flowUnit` (the existing hint `NO_UNIT_HINT` already says that numbers have no unit).
  - C: as A, and add VA to `FLOW_UNITS` (a model change: not in B7).
  - **Recommendation: A.** A mix cannot be found, and C is a change of the model.
  - What changes in the split: a new function `designFlowTagOf(type)` in `riserCapacity.ts` (T09c-3), the tag in `BuildingRisersPane.tsx:525`, and the tests of T05. With B, one more hint line. Waits: the tag part of T09c-3.
- **D-B-104 (open): when "at most" and the hint show.** A network with one trunk, one open end and terminals has one possible source (K = 1). Its numbers are exact.
  - A: "at most" and the hint show whenever the network has no source and K is 1 or more.
  - B (recommended): they show only when K is 2 or more. With K = 1 the numbers show plain, with no hint.
  - **Recommendation: B.** With K = 1 the number is not "at most". It is exact. A would put a hint on every plain drawing that has no equipment yet.
  - What changes in the split: B means `noSource: 'highest'` and the building `atMost` are set only for K of 2 or more (T09a-2, T09b-2) and the tests of Example 1c, 3 and 4a expect plain numbers. A means they are always set and those tests expect "at most". Waits: the flag condition in T09a-2 and T09b-2; the texts in T09c.
- **D-B-105 (open, no code change now): the word "concurrency".** The domain check says "concurrency" is not a usual building-services term and "simultaneity factor" is the usual English one. The user chose "concurrency" in T08.
  - A: keep "concurrency factor" (no change).
  - B: change to "simultaneity factor" in all building views, the takeoff, the checks and the plans.
  - **Recommendation: A** until the user decides. B is a text change in one commit (the same files as T08). The T09 texts do not use the word. No text changes now.

### Provisional (my recommendation)

- **D-B-91: what an open end is.**
  - A: a bare fitting with one segment, not a riser fitting.
  - B: also a port with one connection of any non-terminal stamp (what `flow.ts:141` does).
  - **Recommendation: A.** The user wrote: "a segment end that connects to nothing". A stamp of category `fitting` with one connection (an end cap) closes a run on purpose. One helper (`countOpenEnds`) is used by the solver and by `buildRiserNetworks`, so the two agree.
- **D-B-92: who uses the rule.**
  - A: opt-in input `highestWhenNoSource`. The scene and the building use it.
  - B: change the default of `solveFlow`.
  - **Recommendation: A.** Sizing, routing, the sheet summary and `riserFittingFlow` keep their numbers (D-B-89). Sizing and routing pass an explicit root, so they are not in the case.
- **D-B-94: a group with a missing level.**
  - A: no highest rule. The spans say "Not known yet" (as today). The missing level could hold the source.
  - B: use the rule and read the numbers as "at least".
  - **Recommendation: A.** With a missing level we cannot say that no source exists. B would need "at least" and "at most" on one number.
- **D-B-95: `segmentDirection` in the mode.**
  - A: `null`, and the overlay draws no arrowhead.
  - B: the direction of the root that gave the highest value.
  - C: the direction of one fixed root, as today.
  - **Recommendation: A.** No one direction is true. An arrow would say "the flow goes here" when the source is not known (D-B-74).
- **D-B-96: fallback cases.** A loop in a level, a mid-run riser fitting, and a network with no open end use the old rule.
  - A: the old rule (recommended). The closing segment of a loop stays `null`, as the user said. The hint says that a loop keeps the old rule.
  - B: the highest rule for the segments that are bridges (not in a loop), and `null` inside the loop. Needs a bridge search. A later step.
- **D-B-98: the words (English only, neutral).** See section 7. One word for the rule: "at most". It shows on the numbers where the rule applied (D-B-104). The hint explains it once.
  - A: every number of such a network reads "at most N" (recommended).
  - B: only the numbers that change with the choice of source read "at most". It needs a second result for each segment (the lowest value). More code and more states.
- **D-B-99: the takeoff.**
  - A (recommended): the column "Capacity" keeps the number. The column "Capacity complete" reads `At most` for a span of a group with `atMost` (instead of `Yes`). One warning line says that the numbers are the largest flow for any source position. No new column.
  - B: add a column "Capacity basis". Changes the headers and the tests of `riserTable`.
  - **Recommendation: A.** A text in the numeric column would break sums in Excel. The values of "Capacity complete" become `Yes`, `No` or `At most`. This extends D-B-80.
- **D-B-101: two source levels stay "Not known yet" (D-B-76).** The rule does not pick between two sources. This keeps the old tests. A later step can give the highest value over the sources.
- **D-B-102: which riser fittings are not open ends in the scene.** A riser fitting with no input (state unknown, role none, or input not sent yet) must not count as an open end.
  - A (recommended): the scene uses its own `riserMarks` (the riser fittings of the shown sheet). In `recomputeFlow` each marked fitting without an input goes into a new input `notOpenEndIds`. A marked fitting is never a root and never an open end. `setRiserMarks` also runs `recomputeFlow` when the keys of the marks change (today it runs only when inputs exist, `scene.ts:3118`). No new data goes through the ui, the sender or `sameRiserFlowInputs`. This reuses the state that exists.
  - B: the ui sends the ids of all riser fittings of the project (`riserFittingIdsForSheets`) as a second argument of `setRiserFlowInputs`. The sender and `sameRiserFlowInputs` must then compare the list too. More coupling with the T07 files.
  - **Recommendation: A.** The marks hold exactly the riser fittings of the shown sheet. A network lives on one page. The Properties panel and the header read the shown sheet. The numbers of another sheet of the same project do not show. If the browser check finds a gap on a multi-page project, switch to B. This differs from the audit proposal, which asked for B.
  - Flicker before the first input: the marks exist at once (the hook sets them), the inputs come about 60 ms after the summaries are read. In this time the level shows level-only numbers with the riser fitting as a boundary (K counts only local open ends), the same as T04b today. With D-B-104 option B no "at most" flashes when K is 1.
- **D-B-106: a mid-run riser fitting in the building solve.**
  - A (recommended): a node whose summary entry has the warning `RISER_WARNING` turns the mode off for the whole group. The group stays `unknown` with the old warning, and the node warning already shows. `RISER_WARNING` is exported from `sheet-summary.ts`.
  - B: the mode runs, and a hint says that the level may differ.
  - **Recommendation: A.** The level solve turns the mode off for a mid-run fitting. With B the Risers tab would say "at most 100" while the level shows level-only numbers. A keeps one story.

### Defaults that I assume

- Display rounding: two decimals, as `capacityNumberText` does today.
- The unit comes from the riser (`riser.networkType.flowUnit`), never from the open level.
- No setting, no toggle, no stored state. The mode is a result of the drawing.
- The new building fields are optional and appear only when true. Old tests that use `toEqual` stay green.
- The source word comes from the discipline of the network type: ventilation: "an air handling unit or a fan"; heatingAndCooling and plumbing: "a pump or a boiler"; electrical: "a panel"; fireProtection: "a pump"; other: "a source equipment".
- Screenshots are named `b7-t09<task>-<name>` and go to the dashboard after each task.
- Texts are in English only. People are "they". Texts follow ASD-STE100.

## 7. The words and where they show

`<source word>` is the word of the discipline (see "Defaults"). "Hint A" below is this text, shown once for each panel:

> No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place `<source word>` to set the source.

"Hint L" is the text for a network with a loop and no source:

> This network has a loop and no source. The numbers use one start point. Place `<source word>` to set the source.

| Where | Text | When |
|---|---|---|
| Properties, one segment, field "Solved capacity" | `at most 100` | `solvedNoSource` is `highest` |
| Properties, one segment, line under the field | Hint A | same |
| Properties, one segment, line under the field | Hint L | `solvedNoSource` is `loop`. The number stays plain |
| Properties, one fitting, field and line | same as the segment | same. For a riser fitting the line is left out (the riser block has its own hint) |
| Properties, several segments | `at most 100`, or `Varies` as today | all selected segments are `highest`. A mixed selection shows the plain number or `Varies` |
| Properties, block of a riser fitting, hint | `No source level yet. Solved capacity shows the largest flow for any source position. Open Manage Buildings, tab Risers, to set the main level.` | the group has `atMost`. It replaces the hint "counts this level only" |
| Risers tab, row of a span | `at most 650 m³/h` | span `atMost` |
| Risers tab, line "Main level" | `Main level: not known yet (no source level)` | group `atMost` |
| Risers tab, line "Connected total" | unchanged: `Connected total: 750 m³/h (no concurrency factor)` | the total is the same for any source |
| Risers tab, hints (three paragraphs) | `No source level yet. Each span shows the largest flow for any source position.` / `Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.` / `Place <source word> on a level, or click Set by hand and choose a main level.` | group `atMost` |
| Takeoff warnings | `Riser R1 has no source level yet. Each capacity shows the largest flow for any source position.` | one line for each riser of a group with `atMost` |
| Takeoff column "Capacity complete" | `At most` | span `atMost` |
| Flow overlay on the canvas | the number only, no arrowhead | `segmentDirection` is `null` |

Which hint shows when two could show. A segment on the network of a riser can show Hint A and the D-B-84 hint (`This segment is on the network of riser R1. Select the riser fitting to see the connected total.`, `PropertiesPanel.tsx:220`). Both show. Hint A comes first, directly under the field, because it explains the number above it. The D-B-84 hint follows. No hint is dropped. A riser fitting shows only the riser block hint, so the text does not repeat. The hint "Click Set by hand and choose a source level." (`UNKNOWN_HINT`) does not show in the new state. The old "Flow direction" box keeps its text.

## 8. How the design keeps the domain rules

- **Rule 1 (the segment defines the network type of a port).** No type is set on a port or a stamp. The solve reads only segments, fittings and stamp categories.
- **Rule 2 (the cascade).** Nothing writes a network type. The solve reads `computeNetworks`.
- **Rule 3 (reuse).** The mode lives in `solveFlow` and in `solveBuildingFlow`. One helper (`highestFlow`) serves both. The open end has one definition (`countOpenEnds`). The marked riser fittings come from `riserMarks`, which the scene already holds. The scene already has `setRiserFlowInputs`, `riserSolveOptionsFor`, the hint lines and `riserCapacity.ts`. T09 adds fields to them. T09 adds no new store and no new panel.
- **Rule 4 (adoption).** Not affected. No `networkTypeId` is set.
- **Rule 5 (real DOM).** Each browser check types into the real "Capacity" field and presses Enter. It reads the numbers from the real Properties panel and the Risers tab. The scene API sets up the drawing only.
- **Rule 6 (merge lesson).** After T07 and T09 meet on the branch, run `pnpm build` at the root.
- **Stored data.** No change to the building file or the project file. The summary changes only by an optional field and only after the user answers D-B-93.

## 9. Tasks

Order: T09a-1, T09a-2, T09a-3, then T09c-1 and T09c-2a (they need only core). The tasks marked "waits for" start after the answer. Then T09b-2, T09b-3a, T09b-3b, T09c-2b, T09c-3, T09d.

Each task is one commit. Each task runs the tests of its package and `pnpm build` at the root. Core tasks run `pnpm --filter @mepapp/core test`. A task never edits an old test to make it pass. If an old test breaks, the task stops and reports.

Screen tasks (T09c-2a, T09c-2b, T09c-3): the `ux-designer` writes a short spec first (a small change in existing screens: the director takes open points as provisional). The `journey-tester` runs before the task is done.

### Early result

After T09a-1 to T09a-3, T09c-1 and T09c-2a, Example 1 works in the app, with or without a building. T09b, T09c-2b and T09c-3 add Example 2, 3 and 5.

---

### B7-T09a-1: the helper `highestFlow` (core)

- Dependencies: none. Waits for: nothing.
- Files: new `packages/core/src/flow-highest.ts`, new `packages/core/src/flow-highest.test.ts`, one export line in `packages/core/src/index.ts` (next to `export * from './flow.js'`, `:40`).
- Exact shapes:

```ts
export interface HighestNode { id: string; own: number; /** The number of possible sources at this node. */ roots: number }
export interface HighestEdge { id: string; a: string; b: string }
export interface HighestSide { demand: number; roots: number }
export interface HighestResult {
  /** Sum of `own` over all nodes. */
  total: number;
  /** Sum of `roots` over all nodes (K). */
  roots: number;
  /** Highest value of each edge: the demand of the side that holds no source. Null when K is 0. */
  edge: Record<string, number | null>;
  /** Highest value of each node (see 3.3 step 6). Null when none. */
  node: Record<string, number | null>;
  /** The two sides of each edge. `a` is the side that holds node `a`. */
  sides: Record<string, { a: HighestSide; b: HighestSide }>;
}
/** Null unless the graph is one tree: exactly one connected component and edges = nodes - 1. No recursion. The result does not depend on the order of the input. */
export function highestFlow(nodes: readonly HighestNode[], edges: readonly HighestEdge[]): HighestResult | null;
```

- Must not touch: `flow.ts`, any other file.
- Verification (core tests, exact numbers):
  - Example 1 as a graph (own: Tm 100, others 0; roots 1 at O1 and O2): `edge.main` 100, `edge.s1` 100, `edge.s2` 100, `node.T` 100, `node.O1` 100, `node.O2` 100, `total` 100, `roots` 2.
  - Example 4b: the table in section 2 (`p2` is 60).
  - Example 3 at the building level (nodes L0 own 100 roots 0; L1 own 0 roots 1; L2 own 50 roots 0; edges L0-L1, L1-L2): edges 100 and 50.
  - Example 5 at the building level (own 100, 500, 150; roots 1 each): edges 650 and 600.
  - Example 5, Level 1 as a graph (nodes RF1, F, Tm300, Tm200, O1, side-below own 100 roots 1, side-above own 150 roots 1): `s1` 500, `so` 750, `sa` 300, `sb` 200, `node.F` 750, `node.O1` 750, `node.RF1` 650.
  - No possible source at all: every `edge` and `node` value is null.
  - One possible source: each edge equals the old one-root subtree sum (compare with a simple oracle).
  - A loop returns null. Two components return null. An empty input returns null.
  - **Oracle test:** a seeded random generator makes 200 trees of 2 to 12 nodes with random `own` and `roots`. A naive function in the test file runs, for each node with `roots` above 0, its own subtree sum (independent code) and keeps the maximum for each edge and node. The result equals `highestFlow`.
  - A chain of 20000 nodes finishes with no stack error (no recursion).
  - Input order does not change the result (shuffle test).
- Size: about 110 lines of code.

### B7-T09a-2: `solveFlow` uses the rule on one level (core)

- Dependencies: T09a-1. Waits for: D-B-104 (the condition for `noSource`; take option B as provisional if no answer comes).
- Files: `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts` (new `describe`; old tests unchanged). `flow.ts` is already exported from `index.ts`, so `index.ts` does not change.
- Exact shapes:

```ts
// FlowSolveInput gets:
/** With no source and no valid entry or explicit root, treat every open end as a possible source and give each segment and fitting the highest value over all choices. Opt in; sizing and routing do not set it. */
highestWhenNoSource?: boolean;
/** Fittings that are never a root and never an open end in the highest rule: riser fittings that have no input. Ignored by the old rule. */
notOpenEndIds?: ReadonlySet<string>;
// FlowResult gets:
/** The network has no source. 'highest': the highest rule gave the numbers (K is 2 or more). 'loop': a loop kept the old rule. Absent otherwise. */
noSource?: 'highest' | 'loop';
// New exports in flow.ts:
/** The number of open ends of the network: bare fitting nodes with one segment that are not in `input.riserFittingIds` or `input.notOpenEndIds`. */
export function countOpenEnds(input: FlowSolveInput): number;
/** True when an element of category 'equipment' with own capacity not above 0 has a port in this network (only this network's elements count). */
export function networkHasSource(input: FlowSolveInput): boolean;
```

- Where: in `solveFlow`, after `explicitRootKey` is known (`flow.ts:136`) and before `rootKey` is chosen (`:137`). If `highestWhenNoSource` and `explicitRootKey === undefined` and `entryKey === undefined` and `!networkHasSource`: when the graph is a tree and K is 1 or more and every marked fitting has one segment, build the nodes (own = `ownCapacityOf`, roots 1 at an open end) and the edges (segments), call `highestFlow`, map the result (3.5), return. When the graph has a loop, continue with the old chain and set `noSource: 'loop'` on the result. A `null` from the helper continues with the old chain.
- This task does not take `riserSides`. A marked fitting with no key stays a boundary with 0 (it is not a root and it is not an open end). Pendant sides come in T09a-3.
- Must not touch: the old chain and the DFS (`flow.ts:137-192`), `riserFittingFlow`, `sizing-network.ts`, `route-build.ts`, `sheet-summary.ts`.
- Verification (core tests):
  - Example 1: numbers in section 2. `noSource` `'highest'`, `resolved` true, every `segmentDirection` null, `totalCapacity` 100.
  - Example 1b: the old numbers, `noSource` absent.
  - Example 1c and 4a (K = 1): the old numbers (`s1` 150, `main` 100, `s2` 50), `noSource` absent (option B of D-B-104; with option A it is `'highest'`).
  - Example 4b.
  - Swap the ids of O1 and O2 in Example 1: the same result (order does not matter).
  - Without the flag, Example 1 gives today's numbers (`s2` 0). Every old test is green with no edit.
  - A loop with no source and the flag: the old numbers (one `null`), `noSource` `'loop'`. The same loop without the flag: `noSource` absent.
  - A network with only terminals: the old result.
  - A port with one connection of a stamp of category `fitting` is not an open end (D-B-91): a network `Tm - T - cap-stamp` and `T - O` has one open end.
  - A valid `rootElementId` or `entryFittingId` turns the mode off.
  - An equipment with capacity above 0 (a fan coil unit) does not count as a source: the mode runs.
  - An equipment in another network (in `elementCategories`, no port here) does not count (the scene passes all stamps).
  - A terminal with an empty capacity (no key, or 0) adds 0.
  - A marked fitting with two segments turns the mode off.
  - `notOpenEndIds`: a degree-1 fitting in the set is not an open end and not a root. Example 2, Level 1 with RF1 in the set and no sides: only O1 is a possible source (K = 1).
- Size: about 100 lines of code.

### B7-T09a-3: sides of riser fittings (core)

- Dependencies: T09a-2. Waits for: D-B-97 (only the hand-set test).
- Files: `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts`.
- Exact shapes:

```ts
export interface RiserSide {
  /** Terminal capacity on the far side of one span, seen from this level. */
  demand: number;
  /** The number of open ends on the far side. */
  openEnds: number;
}
// FlowSolveInput gets:
/** For a marked riser fitting with one segment: one entry for each span at the fitting. Used only by the highest rule. A key for an unmarked fitting or a fitting outside the network is ignored. */
riserSides?: Record<string, ReadonlyArray<RiserSide>>;
```

- Behavior: in the mode, each side is a node (`own` = demand, `roots` = openEnds) that joins the fitting by one edge. A marked fitting with no `riserSides` key but with a `riserDemand` key gets one side `{ demand, openEnds: 0 }`. The marked fitting itself is never a root. `totalCapacity` and `riserCapacity` follow 3.5. K counts local open ends and the `openEnds` of all sides. When the mode is off, `riserSides` is ignored and the old rule uses `riserDemand`.
- Must not touch: the old DFS and `riserDemand` handling in the old path.
- Verification (core tests, level solves with exact numbers; sides are `{demand, openEnds}`):
  - Example 2, Level 1 (`RF1 - a1 - O1`, sides `[{100, 0}, {0, 1}]`): `a1` 100, RF1 100, O1 100, `totalCapacity` 100, `riserCapacity` 100, `noSource` `'highest'` (K = 2).
  - Example 2, Level 0 (`Tm0 - a0 - RF0`, sides `[{0, 2}]`): `a0` 100, RF0 100, `totalCapacity` 100, `riserCapacity` 0.
  - Example 2, Level 2 (`RF2 - a2 - O2`, sides `[{100, 1}]`): `a2` 100, RF2 100, O2 100.
  - Example 3, Level 1 (sides `[{100, 0}, {50, 0}]`): `b1` 150, RF1 150, O1 150, total 150, `noSource` absent (K = 1).
  - Example 3, Level 0 (sides `[{50, 1}]`): `a0` 100, RF0 100. Level 2 (sides `[{100, 1}]`): `c2` 50, RF2 50.
  - Example 5, Level 1 (the table in section 2; sides `[{100, 1}, {150, 1}]`): `s1` **500**, RF1 650, `sa` 300, `sb` 200, F 750, `so` 750, O1 750, `noSource` `'highest'` (K = 3).
  - A level that is the hand-set main level and has no equipment, with `riserDemand` only: the highest rule over its open ends (D-B-97 option A).
  - Old path unchanged: a source level with equipment and `riserDemand`; an entry level (the old tests of T01 stay green with no edit).
  - A marked fitting with two segments: the mode is off and the old numbers show.
- Size: about 90 lines of code.

### B7-T09b-1: the summary counts open ends (core) — waits for D-B-93

- Dependencies: T09a-2. Waits for: D-B-93 (option A).
- Files: `packages/core/src/sheet-summary.ts`, `packages/core/src/sheet-summary.test.ts`.
- Exact shapes: `RiserNetworkSummary.openEnds?: number` (a whole number, 0 or more; the number of open ends of the network, riser fittings excluded). `buildRiserNetworks` sets it with `countOpenEnds` (the same call input as its `solveFlow`, `sheet-summary.ts:109`). The validator (`:298-319`) accepts an absent field and rejects a negative or non-integer value (`path: riserNetworks[i].openEnds`). `RISER_WARNING` (`:97`) becomes `export const`.
- Must not touch: `SHEET_SUMMARY_VERSION` (stays 2), `riserFittingFlow`, `terminalCapacity`, `hasSource`.
- Verification: build with the field (Example 2 Level 1 gives 1, Level 0 gives 0); parse and validate with and without it; a bad value gives an issue; a v2 summary without the field stays valid; `sheet-summary.test.ts` (asserts version 2) stays green; `rebuildSummaries` and `buildingContext` write the field (a test calls `buildSheetSummary` with riser ids).
- If the user answers B for the field: skip this task, but still export `RISER_WARNING` (T09b-2 needs it).
- Size: about 40 lines.

### B7-T09b-2: the building solve (core) — waits for D-B-93, D-B-100, D-B-104

- Dependencies: T09a-1, T09b-1 (or option B of D-B-93). Waits for: D-B-93 (default of an absent count), D-B-100 (the drain condition), D-B-104 (when `atMost` is set).
- Files: `packages/core/src/building-flow.ts`, `packages/core/src/building-flow.test.ts`. Re-read the file first (T07 changed it).
- Exact shapes:

```ts
// BuildingFlowSpan gets (set only when true):  atMost?: true
// BuildingFlowGroup gets (set only when true): atMost?: true
// BuildingFlowMember.role gets a new value: 'open'
// BuildingFlowMember gets (only for role 'open'):
sides?: Array<{ demand: number; openEnds: number }>;   // one for each span at the member; far side as seen from the member
// FlowNode gets: openEnds?: number; midRun: boolean   // from RiserNetworkSummary.openEnds and from RISER_WARNING in entry.warnings
```

- Behavior (with the recommended answers: A2 for the default, A for the drain, B for K):
  - In the source step (`building-flow.ts:265-276`), when there are 0 candidates, no hand-set level and no missing node: the group stays `unknown` with the old warning when (1) a node has `midRun` (D-B-106), or (2) a riser of the group has a type id in `ROUTE_GRAVITY_TYPE_IDS` (D-B-100), or (3) a node has `openEnds === undefined` (D-B-93 A2: one note `The summary of Level 1 has no open-end data. Read the summaries.` for each such level), or (4) K = sum of `openEnds` is 0. Else `state = 'ok'`, no `sourceKey`, and `atMost = true` when K is 2 or more.
  - In the solve step (`:279-319`) the group calls `highestFlow` (nodes: `own` = `terminal`, `roots` = `openEnds`; edges: the spans). Each span gets `capacity`, `state: 'ok'`, `complete: true`, and `atMost: true` when the group has it. Each member gets `role: 'open'`, `capacityIn: null`, `demandBeyond` = sum of its sides, and `sides` from `HighestResult.sides` (the side that does not hold the member's node).
  - No other new warning: the state is normal while the user draws.
- Must not touch: the grouping, the loop rule, the hand-set rule, the missing-level warnings, `deriveRiserFlow`.
- Verification (core tests, exact numbers):
  - Example 2: spans 100 and 100, group `atMost`, `total` 100, `sourceLevelId` absent. Level 1 member: role `open`, sides `[{100, 0}, {0, 1}]` (below, above).
  - Example 3: spans 100 and 50, group `atMost` absent. Level 1 member sides `[{100, 0}, {50, 0}]`.
  - Example 5: spans 650 and 600, `atMost` true.
  - Two risers in one tree with no source: each span follows the rule.
  - The three rows of the B7 worked example (with equipment) are unchanged. The old tests are green with no edit (D-B-93 A2).
  - A missing level: `unknown`, as today (D-B-94). A loop: as today. Two sources: `unknown`. No open end anywhere: `unknown` with the old warning. A hand-set level with no equipment: `ok`, not `atMost`.
  - A node with the warning `RISER_WARNING`: `unknown` (D-B-106). A summary with no `openEnds`: `unknown` with the note. A drain riser: `unknown`.
  - Placing an equipment on any level turns the mode off (settle test: same input plus `hasSource: true` on Level 0 gives 650 and 150 for the B7 terminals).
- Size: about 110 lines.

### B7-T09b-3a: the inputs for the scene (core, render)

- Dependencies: T09a-3, T09b-2.
- Files: `packages/core/src/building-flow.ts` (`RiserFlowInput`, `riserFlowInputsOf`), `packages/render/src/riserFlowInputs.ts` (`riserSolveOptionsFor`), and the tests next to them (`building-flow.test.ts`, `riserFlowInputs.test.ts`).
- Exact shapes:

```ts
export type RiserFlowInput = {
  role: 'entry' | 'exit' | 'open';
  demandBeyond: number;
  /** Only for role 'open'. */
  sides?: ReadonlyArray<{ demand: number; openEnds: number }>;
};
// RiserSolveOptions (riserFlowInputs.ts:3) gets: riserSides?: Record<string, ReadonlyArray<RiserSide>>; notOpenEndIds?: ReadonlySet<string>
// riserSolveOptionsFor(network, inputs, marks?: ReadonlyMap<string, unknown>) : the marked fittings of the network with no input go into notOpenEndIds.
```

- Behavior: `riserFlowInputsOf` gives, for a member with role `open`, `{ role: 'open', demandBeyond: sum, sides }`. When two members map to one fitting id, the sides join and the demands add. `riserSolveOptionsFor` copies `sides` into `riserSides` and `demandBeyond` into `riserDemand`. It sets no `entryFittingId` for role `open`. It returns options (with `notOpenEndIds`) also when only marks without inputs exist in the network.
- Must not touch: `scene.ts` (T09c-1 and T09b-3b), the hook files of T07.
- Verification: `riserFlowInputsOf` for Example 2 and 3 (exact `sides`); `riserSolveOptionsFor` with role `open`, with a mark and no input (gives `notOpenEndIds`), with no marks and no inputs (null, as today). Old tests green with no edit.
- Size: about 60 lines.

### B7-T09b-3b: the sender compares sides (ui) and the chain test

- Dependencies: T09b-3a, T09c-1.
- Files: `packages/ui/src/riserFlowSync.ts` (`sameRiserFlowInputs`, `:86-95`), `packages/ui/src/riserFlowSync.test.ts`. Re-read the file after T07.
- Behavior: `sameRiserFlowInputs` also compares `sides` (length, `demand`, `openEnds`). Without it the scene would keep old inputs when only `sides` change.
- Must not touch: `useRiserFlowInputs.ts` (T07 owns it; if a change is needed, report it).
- Verification: a test that two inputs that differ only in `sides` are not the same. A chain test: `computeRiserFlow` for Example 2 with live networks gives, for Level 1, an input with role `open` and `sides` `[{100, 0}, {0, 1}]`, and `RiserFlowSender.next` returns it once and then null. A render test with a built scene or the core path for Example 2, Level 1: `a1` 100, RF1 100, O1 100. Old tests green with no edit.
- Size: about 40 lines.

### B7-T09c-1: the scene read model, the call and the overlay (render)

- Dependencies: T09a-2. Waits for: D-B-100 (one line).
- Files: `packages/render/src/scene.ts` (`SegmentInfo` `:442`, `FittingInfo` `:458`, the lookups `:1470`/`:1479`, `getSelectedFittingInfo` `:1545`, `setRiserMarks` `:3115`, `recomputeFlow` `:3772`, `syncFlowLabels` `:3796-3835`), a new file `packages/render/src/flowArrow.ts` with `flowArrowEnds`, and tests next to them.
- Exact shapes:
  - `SegmentInfo.solvedNoSource?: 'highest' | 'loop'` and `FittingInfo.solvedNoSource?: 'highest' | 'loop'`. Both come from `FlowResult.noSource` of the network of the item. Absent otherwise.
  - `recomputeFlow` adds `highestWhenNoSource: !ROUTE_GRAVITY_TYPE_IDS.includes(network.networkTypeId)` (D-B-100 option A) and `notOpenEndIds` (the keys of `this.riserMarks` that are in the network and have no input; D-B-102).
  - `setRiserMarks` also runs `recomputeFlow` when the set of keys changes.
  - `export function flowArrowEnds(direction: 'AtoB' | 'BtoA' | null, a: Vec2, b: Vec2): { from: Vec2; to: Vec2 } | null` returns `null` for a `null` direction, `{ from: a, to: b }` for `AtoB`, and `{ from: b, to: a }` for `BtoA`. `syncFlowLabels` calls it. It skips the arrowhead for `null` and keeps the number label.
- Must not touch: `computeFlow`, the other read models, the riser-fitting reset of inputs (`:1205`, `:1334`).
- Verification: tests for the lookups (a result with `noSource` and one without); tests for `flowArrowEnds` (three directions); a test that `setRiserMarks` triggers a solve when the keys change and not when they stay. A no-flag test: a network with an equipment gives the same `FlowResult` as before.
- Size: about 70 lines.

### B7-T09c-2a: Properties shows "at most" (ui, screen task)

- Dependencies: T09c-1, T09a-2. Waits for: D-B-104 (the texts).
- Files: `packages/ui/src/components/PropertiesPanel.tsx` (`formatSolvedCapacity` `:37`, `:217-220`, `:328-329`, `:355-367`), new `packages/ui/src/sourceWord.ts` (`sourceWordOf(discipline: Discipline): string`), their tests, and `packages/ui/src/App.tsx` only if a prop must pass (re-read after T07).
- Exact shapes: `formatSolvedCapacity(value: number | null, atMost = false): string` returns `at most 100` when `atMost` and the value is not null. Under the field: `<p className="mep-hint" data-testid="props-at-most-hint">` with Hint A or Hint L (section 7), placed before the D-B-84 hint. For a riser fitting no line.
- Must not touch: the editable "Capacity" field of a terminal, the "Network Type" cascade, the old box "Flow direction".
- Verification:
  - Unit tests: the strings of section 7 exactly, for each discipline.
  - Browser check `b7-t09c2a-check.mjs` in `.claude/roadmap/work/` (copy the shape of `b7-t07-check.mjs`; reuse `lib.mjs`). One PDF, no building:
    1. Set up Example 1 with the scene API (setup only).
    2. Click `s1`, then `s2`, then `main` on the canvas. Read the Properties field "Solved capacity" from the real DOM. Expect `at most 100` each time and the hint `props-at-most-hint`.
    3. Click fitting O2. Expect `at most 100`.
    4. Type 250 in the real "Capacity" field of `Tm` and press Enter. Expect `at most 250` on `s1` and `s2`.
    5. Settle: add an equipment at O1 (setup call), select `s2`. Expect `0` with no "at most" and no hint. Select `s1`. Expect `250`.
    6. A loop with no source (three fittings in a ring and one terminal): expect a plain number and Hint L.
    7. Screenshots: `b7-t09c2a-ex1-segment.png` and `b7-t09c2a-ex1b-settled.png`.
  - A no-building run: a network with an equipment shows the same numbers as master (no "at most" anywhere).
  - Plain `pnpm dev` check (the no-flag check of T04b/T05): green. The production `dist` has no `__mepBuilding`, `devPlatform` or `webLike`.
  - Update the expectations of `b7-t04b-nobuilding-check.mjs` only for source-less networks with K of 2 or more. Add an assertion that a network with an equipment is unchanged.

### B7-T09c-2b: the riser-fitting block and the view (ui, screen task) — waits for D-B-104

- Dependencies: T09b-2, T09b-3a, T09b-3b, T09c-2a.
- Files: `packages/ui/src/riserCapacity.ts` (`capacityNumberText` `:16`, `capacityViewOf` `:127`, `fittingRiserLinesOf` `:213`), `packages/ui/src/riserCapacity.test.ts`.
- Exact shapes: `capacityNumberText(value, unit, atLeast, atMost = false)`: the new fourth parameter gives `at most 650 m³/h`. The old calls do not change. `CapacityView.atMost: boolean` (from `group.atMost`). When true: `mainValue` is `not known yet`, `mainLine` is `Main level: not known yet (no source level)`, rows use `atMost`, and `hints` has the three paragraphs of section 7 instead of `UNKNOWN_HINT`. `fittingRiserLinesOf` uses the riser-fitting hint of section 7 instead of `RISER_UNKNOWN_HINT`.
- Must not touch: the pane (`BuildingRisersPane.tsx`), the old tests.
- Verification: unit tests with the exact strings of section 7; a view for Example 5 (rows `at most 650 m³/h` and `at most 600 m³/h`, total `Connected total: 750 m³/h (no concurrency factor)`); the view of a group with `atMost` absent is unchanged.

### B7-T09c-3: the Risers tab, the takeoff and the summary link (ui, screen task) — waits for D-B-93, D-B-103

- Dependencies: T09b-2, T09b-3a, T09c-2b.
- Files: `packages/ui/src/components/BuildingRisersPane.tsx` (`:525` the tag; the rest of the text comes from `capacityViewOf`), `packages/ui/src/riserCapacity.ts` (`needsSummaryRead` `:237-253`; `designFlowTagOf` for D-B-103), `packages/core/src/riser-quantities.ts` (`:131-136` and `riserTakeoffWarnings` `:184-197`), and the tests (`riser-quantities.test.ts`, `riserCapacity.test.ts`).
- Exact shapes:
  - `capacityOf` in `riserTable` (`riser-quantities.ts:131-136`): the third cell is `At most` when `flowSpan.atMost`, else `Yes` or `No` as before. No new column (D-B-99).
  - `riserTakeoffWarnings` adds, for each riser whose group has `atMost`, the warning in section 7.
  - `needsSummaryRead`: also true when the group has no source level (the group has `atMost`, or it is `unknown` for the reason `no-source`) and a member's stored summary entry (found by `fittingIds.includes(member.fittingId)`, not live) has `openEnds === undefined`. The link "Read summaries now" then shows. (Waits for D-B-93.)
  - The tag for an electrical type: `designFlowTagOf(type)` (D-B-103). (Waits for D-B-103.)
- Must not touch: the headers of `riserTable`, the "Flow direction" box, the source selects.
- Verification:
  - Core tests: the third cell reads `At most` for an `atMost` span and `Yes`/`No` for the others. The warning appears for a group with `atMost` and not for others. The headers are unchanged. `needsSummaryRead` test line: a stored entry with no `openEnds` in a source-less group gives true; the same entry with `openEnds` 1 gives false; a group with a source gives false.
  - Browser check `b7-t09c3-check.mjs`: 3 levels from real PDFs, one riser, the B7 terminals (Level 0: 100; Level 1: 300 and 200; Level 2: 150), one open end on each level, no equipment (Example 5).
    1. Open Manage Buildings, tab Risers. Expect the rows `Level 0 to Level 1  at most 650 m³/h`, `Level 1 to Level 2  at most 600 m³/h`, `Main level: not known yet (no source level)`, `Connected total: 750 m³/h (no concurrency factor)` and the hints of section 7.
    2. Open Level 1. Click the open segment: expect `at most 750`. Click the riser fitting: expect `at most 650`. Click the segment from the riser fitting to the tee: expect `at most 500`.
    3. Open Level 0. Type 250 in the real "Capacity" field of `Tm0` and press Enter. Do not save. Switch to Level 1 (no click on "Read summaries now"). Expect: open segment `at most 900`, riser fitting `at most 750`. Risers tab: `at most 650` and `at most 750`, total `900 m³/h`.
    4. Place an equipment at the open end of Level 0 (setup call). Expect the rows `650 m³/h` and `150 m³/h` with no "at most", total `900`. On Level 1 the open segment shows `0`, the riser fitting `650`.
    5. Open an old summary (no `openEnds`): the note appears and "Read summaries now" shows; click it and the note goes.
    6. Takeoff, scope Building: the warning line shows and the column "Capacity complete" reads `At most` for both rows.
  - The three B7 worked-example rows (equipment): unchanged (reuse `b7-t05-check.mjs`).
  - The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`): 0 problems. Read every line.
  - Screenshots: `b7-t09c3-risers-atmost.png`, `b7-t09c3-takeoff-warning.png`.
  - `journey-tester`: a user who has drawn terminals and no air handling unit yet opens the Risers tab and understands why the numbers read "at most".

### B7-T09d: the Windows test script

- Dependencies: all of the above.
- Files: `.claude/plans/buildings-b7-test.md` (re-read it first: T08 changed it), and the status line of `buildings-b7-flow-through-risers.md`.
- Change:
  - Step 18 (delete the air handling unit) changes. The result depends on open ends. After the unit is deleted, a level may have no open end (not verified: what the segment of the deleted unit becomes). With no open end anywhere the rows stay `not known yet (no source level)`. So the step first says: "Draw a short duct from the riser fitting of each level and leave its end open." Then it expects the numbers of Example 5 for the terminals of that script: Level 0 to Level 1 `at most 650 m³/h`, Level 1 to Level 2 `at most 600 m³/h`. "Main level" reads `not known yet (no source level)`. The hints are the new texts. The implementer checks these numbers in the browser run before writing them.
  - Step 24 (takeoff): the column "Capacity complete" reads `At most` in this case.
  - New Part J "No source yet": (1) one level in the plain app: draw Example 1, click both open segments, expect `at most` and 100 on both; (2) place an air handling unit at one open end, expect 0 on the dead open end; (3) three levels with a terminal on Level 0 only (Example 2): the open ends of Level 1 and Level 2 show `at most 100`; (4) type a new capacity, expect the numbers to follow with no save; (5) terminals on Level 0 and Level 2, the open end on Level 1 (Example 3): spans `100` and `50`, plain; (6) place the air handling unit: `at most` goes away; (7) a drain network: no "at most", the spans stay "Not known yet", and "Not a design flow" stays; (8) open an old building saved before T09: the note `The summary of Level 1 has no open-end data. Read the summaries.` shows and the link "Read summaries now" shows; click it and the note goes; (9) a ring main with no source: a plain number and the loop hint.
  - "What to write down": add the open questions D-B-97, D-B-104 and the word "at most".
- Verification: each step is possible on one PC (rule 1a). No code change.

## 10. Risks

- **Performance.** The walk costs O(N) for each network and each edit. `solveFlow` sorts the keys already (O(N log N)). `recomputeFlow` already runs on each edit and each network. The building graph is small. The naive method (one solve for each open end) is the oracle in tests only.
- **The T07 overlay.** The live networks of open levels are `RiserNetworkSummary[]`. They carry `openEnds` with no change in T07, because `buildRiserNetworks` fills it. The JSON compare in `LiveRiserOverlay.set` sees the new field. T09b-3b changes `sameRiserFlowInputs` only. T09 must re-read `useRiserFlowInputs.ts` and `riserFlowSync.ts` after T07 and must not change the hook without a report.
- **A stale summary** (saved before T09) has no `openEnds`. With the recommended default (A2) the group stays "Not known yet" with a note, and "Read summaries now" fixes it. With A1 a number can be too high.
- **Marks cover the shown sheet only** (D-B-102). A riser fitting of another sheet of the same project counts as an open end in the solve of that sheet. Its numbers do not show. The browser check on a multi-page project proves this. If it fails, use option B of D-B-102.
- **Numbers rise.** A user who saw 0 on an open segment now sees the sum. This is the goal. The test script (T09d) tells the tester.
- **No-building behavior changes** for networks with no source and K of 2 or more. This is deliberate (Example 1 on one level). Networks with a source are identical. The B7 rule "plain `pnpm dev` must not change" is kept for them and is tested in T09c-2a.
- **An equipment with two or more connections** next to an open end keeps the old order (the open end wins, `flow.ts:140-143`). This copies the old app (collector heuristic). Not changed here. A note for later.
- **Old app.** `NetworkFlowProcessor.cs` (FindRoot) picks one root and leaves the others dead. MepApp copied this. T09 is a deliberate change: the old app has no "highest" rule. Where there is a source the two apps agree.
- **Drain.** With D-B-100 option A a drain with no source keeps an arbitrary root on one level, as today. The tag "Not a design flow" stays. A user-made drain type with another id is not found (the same gap as D-B-82).
- **Electrical.** The sum is a plain sum of bare numbers. A mix of units in one network cannot be found (D-B-103).
- **Stack depth.** The old `demandOf` is recursive. The new helper is not.
- **Two hand-set levels, two sources, loops** keep "Not known yet". The user may want a later step for the highest value over several sources.

## 11. Not in scope

- Riser arrows and supply/return words (B8).
- Sizing and routing from the highest numbers (D-B-89). `sizing-network.ts` and `route-build.ts` stay as they are. The header total stays level-only.
- A concurrency factor or any physics. A change of the word "concurrency" (D-B-105).
- A new column in the takeoff (D-B-99, option B).
- A change of `SHEET_SUMMARY_VERSION`, of the building file or of the project file. The optional field `openEnds` needs the answer to D-B-93 first.
- The highest value over two sources (D-B-101).
- A value for the segments outside a loop (D-B-96, option B).
- VA as a unit (D-B-103, option C).
- The items of `room-type-calculations-small-fixes.md`.

## 12. Records

- The director copies this plan to the hub (`Specs/`) and checks it with `cmp`.
- The director writes the ledger events for D-B-86 to D-B-106. This plan writes none.
- After each task: ledger events, dashboard screenshots, one commit, push of the branch only. The user tests on Windows and merges.
