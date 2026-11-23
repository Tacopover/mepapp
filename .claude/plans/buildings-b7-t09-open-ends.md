# B7-T09: open ends are possible sources (the "highest" rule)

Status: **planned 2026-11-23. Not started.** Stream `buildings`, part `B7`, branch `worktree-buildings-b7`. Parent plan: `buildings-b7-flow-through-risers.md`. T09 starts after B7-T07 is merged on the branch. T07 changes `useRiserFlowInputs.ts`, `riserFlowSync.ts`, `App.tsx`, the Risers pane and `building-flow.ts` (the `live` argument). Each T09 task must re-read these files first. This plan does not depend on their details. Line numbers below come from the working copy of 2026-11-23 and can move after T07.

One question for the user blocks one task (D-B-93, a change of the stored summary). Read section 6 first.

## 0. Words used here

- **Open end**: the end of a segment that connects to nothing. It is a bare fitting with one segment, and it is not a riser fitting. A terminal is not an open end. An equipment is not an open end.
- **Source**: an element of category `equipment` whose own capacity is 0 or empty (D-B-77). A source level that the user sets by hand is also a source.
- **Possible source**: an open end of a network that has no source.
- **Side of a segment**: when you cut one segment, the network falls into two sides. A riser span is also a cut: it splits the whole building into two sides.
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

Unit of all numbers: the unit of the network type. All networks have type Supply Air.

### Example 1: one level, one terminal, a T fitting, two open ends, no source

Elements: terminal `Tm` (capacity 100). Segments: `main` (Tm to T), `s1` (T to O1), `s2` (T to O2). Fittings: `T` (tee), `O1` and `O2` (open ends). Possible sources: O1, O2.

| Item | Today (root = first open end by id: O1) | After T09 |
|---|---|---|
| `main` | 100 | 100 |
| `s1` | 100 | **100** |
| `s2` | 0 | **100** |
| fitting T | 100 | 100 |
| fitting O1 | 100 (root, total) | 100 |
| fitting O2 | 0 | **100** |
| total (header) | 100 | 100 |

Example 1b: the same network, but an equipment `E` (capacity empty) replaces O1 at the end of `s1`. There is a source. The old rule holds: `main` 100, `s1` 100, `s2` 0, fitting T 100, fitting O2 0 (a dead open end), total 100.

Example 1c: the same as 1, but the user places a second terminal `Tm2` (50) at O2. Now O1 is the only open end. The rule needs no special case: `s1` 150, `main` 100, `s2` 50, fitting T 150, total 150. The numbers are the same as today. The network still has no source, so the mode runs with one possible source (`sourceUnknown` is true, and the UI still says "at most").

### Example 2: three levels, one terminal on Level 0, no source

Level 0: terminal `Tm0` (100), segment `a0` (Tm0 to RF0), riser fitting RF0. Level 1: RF1, segment `a1` (RF1 to O1), open end O1. Level 2: RF2, segment `a2` (RF2 to O2), open end O2. One riser R through RF0, RF1, RF2. No equipment anywhere.

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

Level 0: `Tm0` (100), `a0`, RF0. Level 1: RF1, `b1` (RF1 to O1), O1. Level 2: `Tm2` (50), `c2` (Tm2 to RF2), RF2. Only O1 can be a source.

| Item | After T09 | Why |
|---|---|---|
| `a0`, RF0 | 100, 100 | the source is on the far side, so the segment carries its own terminal |
| `b1`, RF1, O1 | 150, 150, 150 | the source O1 is on this level. Everything else flows away from it |
| `c2`, RF2 | 50, 50 | same as `a0` |
| Span Level 0 to Level 1 | at most 100 | only the Level 1 side can hold a source. The span carries Level 0 |
| Span Level 1 to Level 2 | at most 50 | only the Level 0+1 side can hold a source. The span carries Level 2 |
| Connected total | 150 | |

This example shows why the building solve needs to know which levels have an open end (D-B-93). If every level counted as a possible source, span 1 to 2 would read 100. That is wrong.

### Example 4: single level, two terminals

4a, one open end. `Tm1` (60) to T by `s1`, `Tm2` (40) to T by `s2`, T to O by `s3`. There is one possible source, so the highest rule gives the old numbers: `s1` 60, `s2` 40, `s3` 100, fitting T 100, fitting O 100, total 100.

4b, two open ends. A chain `O1 - p1 - F1 - p2 - F2 - p3 - O2`. `Tm1` (60) joins F1 by `q1`. `Tm2` (40) joins F2 by `q2`.

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

Same terminals as the B7 worked example: Level 0 has 100. Level 1 has 300 and 200. Level 2 has 150. Every level also has one open end. No equipment.

| Span | Side A | Side B | After T09 |
|---|---|---|---|
| Level 0 to Level 1 | Level 0: 100 | Levels 1+2: 650 | **at most 650** (source on side B gives 100, on side A gives 650) |
| Level 1 to Level 2 | Levels 0+1: 600 | Level 2: 150 | **at most 600** |
| Connected total | | | 750 |

Riser fitting RF1 on Level 1 shows 650. The segment from RF1 to the tee of Level 1 shows 650. The two terminal segments show 300 and 200. The open segment of Level 1 shows 750 (all capacity not on its own side). Compare with the B7 worked example with equipment on Level 0: 650 and 150.

## 3. The rule

### 3.1 Definition

Take a tree (a network without a loop). Let `R` be the set of possible sources. For one source `r` in `R`, run the existing subtree sum. Each segment, fitting and span gets the value of `solveFlow` for that root. The **highest value** of an item is its maximum over all `r` in `R`.

A "node" of the tree can be an open end, a terminal port, a fitting, or a level. An "edge" can be a segment or a riser span. The rule is the same for all of them.

### 3.2 When the rule applies

All of these must hold. Otherwise the old rule runs and nothing changes.

1. The caller asks for it (`highestWhenNoSource: true`, D-B-92).
2. No explicit root (`rootElementId`) is valid, and no entry fitting (`entryFittingId`) is valid.
3. The network has no source (no element of category `equipment` with capacity not above 0, in this network only).
4. At least one possible source exists: a local open end, or an open side (3.4).
5. The graph is a tree (no loop).
6. Every marked riser fitting is the end of a run (one segment). A mid-run riser fitting keeps the old rule (the T02 warning case).

For the building: the group has no hand-set main level, no node with a source, no missing node, no loop, and at least one node with an open end (D-B-94, D-B-96).

### 3.3 The algorithm (O(N), one helper for the level and the building)

New pure helper `highestFlow(nodes, edges)` in `packages/core/src/flow-highest.ts`. It needs no recursion.

1. Let `T` = sum of `own` over all nodes. Let `K` = number of nodes with `root: true`.
2. Walk the tree once from the first node (sorted by id), with an explicit stack. Record the parent and the walk order.
3. In reverse walk order, compute for each node `sub` (sum of `own` in its subtree) and `rootsSub` (count of root nodes in its subtree).
4. For each edge between parent `p` and child `c`: side C has demand `sub[c]` and `rootsSub[c]` roots. Side P has demand `T - sub[c]` and `K - rootsSub[c]` roots.
5. Edge value = the highest of: `sub[c]` when side P has a root; `T - sub[c]` when side C has a root. When `K` is 0, the value is null.
6. Node value (used for fittings): for each edge at the node, take the demand of the node's own side when the other side has a root. For a node with `root: true`, also take `T`. The node value is the highest of these. Null when there is none.

Why this equals "run the solve for each root": the solve for root `r` gives each edge the demand of the side that does not hold `r`. That side is the same for every root on the same side of the edge. So only two numbers exist for each edge. Step 5 takes the highest of those two that a root can reach. The node value in step 6 is the subtree demand that `solveFlow` gives a non-root node (the demand on its own side of the edge toward the root), or the total for a root node.

Cost: O(N) for N nodes. The naive method costs O(K x N). A network with 300 open ends and 5000 nodes would need 1.5 million steps for each edit. The one-pass method avoids that. No cap is needed. The naive method stays in the tests only, as an oracle (T09a-1).

Order does not matter. The result does not depend on the sort order of ids. This fixes the id-order problem of today.

### 3.4 How the level solve takes the other levels

A marked riser fitting with `sides` (one entry for each span at that fitting, seen from this level) gets one extra node for each side. The extra node has `own = side.demand` and `root = side.open`. It joins the fitting by one extra edge. An old `riserDemand` value for a fitting (an exit) is one side with `open: false`.

A middle level has one riser fitting and two spans. So the fitting has two sides. The solve never mixes them. When the source is beyond one side, the other side counts as demand.

`side.demand` is the sum of terminal capacities on the far side of the span. `side.open` is true when the far side holds a possible source.

### 3.5 The result fields in this mode

| Field | Value in the mode |
|---|---|
| `segmentCapacity[id]` | the edge value (3.3 step 5) |
| `fittingCapacity[id]` | the node value (3.3 step 6) |
| `resolved` | true |
| `totalCapacity` | local terminals + sum of all side demands |
| `riserCapacity` | sum of all side demands (set when `riserDemand` or `riserSides` is given). So the header total stays level-only (D-B-89) |
| `segmentDirection[id]` | `null` for every segment (D-B-95) |
| `sourceUnknown` | `true` (new, optional) |

### 3.6 Loops, unresolved items, a network that has no open end

- A loop in the level graph: the old rule runs. The closing segment stays `null`, as today. A possible later step: give a value to the segments outside the loop (D-B-96, option B).
- A loop in the building (two risers in a ring): the old warning stays and the spans have no number.
- A network with no open end and no open side (only terminals, or a closed ring of terminals): the old rule runs, as today. The result is not marked `sourceUnknown`.
- A segment that the walk cannot reach: `null`, as today.

## 4. How the rule meets the existing flags

| Item | What happens |
|---|---|
| `resolved` | true in the mode. The old early returns (no nodes, no root candidate) stay before the new branch (`flow.ts:96-112`). |
| `totalCapacity` | see 3.5. It is the same for any source, so it is a stable number. |
| `segmentDirection` | `null` in the mode. The value is the highest over several roots, so no one direction is true. A direction would also say "the flow goes here", and the source is not known. The only reader is the flow overlay (`scene.ts:3817`). It draws an A to B arrow when the direction is not `BtoA`. T09c-1 skips the arrowhead for a `null` direction and keeps the number. |
| `riserFittingFlow` (`out`, `in`, `none`) | not touched. It calls `solveFlow` without the new flag. `deriveRiserFlow` and the old box "Flow direction" keep their rules (B8 keeps them). |
| entry fitting (`entryFittingId`) | when a valid entry exists, the old rule runs. The level is fed from a level that has the source, so open ends are dead (D-B-87). |
| `riserDemand` | still used by the old rule. In the mode it becomes one side with `open: false`. |
| `RiserFlowInput` roles | new role `open` (no source known: every side is a possible source). `entry` and `exit` stay. |
| building solve | a group with no source, no missing level and one level with an open end is `state: 'ok'` with `atMost: true` and no `sourceLevelId`. Every other no-source case stays `unknown` (as in T03). |
| "Main level: not known yet" (T04b/T05) | stays for: two sources, a loop, two hand-set levels, a missing level, and no open end. In the new state the line reads `Main level: not known yet (no source level)` and the rows have numbers. |
| "at least" (a level has no data) | not combined with "at most". A group with a missing level never uses the highest rule (D-B-94). So the two words never appear in one number. |
| source level set by hand | the old rule for the group. The level that the user set has the source, so spans have exact numbers. The level itself has no equipment: its open ends are possible sources (D-B-97). |

## 5. Facts from the code (2026-11-23)

- `packages/core/src/flow.ts:69` `solveFlow`. The root chain is at `:137-144`: explicit root, entry, equipment with one connection, open end (a node with one connection that is not a terminal, `:141`), any equipment, any node with one connection, the first key. The nodes are sorted by key (`:85`). A `fitting:` key sorts before a `port:` key. So the first open end by fitting id wins. This is the cause of Example 1.
- `flow.ts:141` counts a PORT of a stamp with one connection and no capacity as an open end, if it is not a terminal. That includes a stamp of category `fitting`. D-B-91 uses a stricter definition for the new rule.
- `flow.ts:140-143`: an open end wins over an equipment with two or more connections. This copies the old app (`NetworkFlowProcessor.cs:227-276`, FindRoot step 2b: "a collector's discharge"). T09 does not change it. A network with an equipment keeps the old rule (D-B-87).
- `flow.ts:196-231` `riserFittingFlow` counts `hasSource` over ALL `elementCategories`. The scene passes the categories of all stamps of the document (`scene.ts:3778`). So the new `networkHasSource` must look only at the elements that have a port in this network.
- `packages/core/src/sheet-summary.ts:19` `RiserNetworkSummary` has `networkTypeId`, `fittingIds`, `terminalCapacity`, `hasSource`, `warnings`. It has no count of open ends. `:100` `buildRiserNetworks`. `:119` `hasSource`. `:299-313` the validator.
- `packages/core/src/building-flow.ts:91` `solveBuildingFlow`. `:228-277` source choice (`:265-276` the candidate list: with 0 candidates the group stays `unknown`). `:279-319` the solve (`solveBelow`, `:297`). `:326-345` the members and their roles. `:359` `RiserFlowInput`. `:362` `riserFlowInputsOf`.
- `packages/render/src/riserFlowInputs.ts:10` `riserSolveOptionsFor`. `packages/render/src/scene.ts:3126` `setRiserFlowInputs`. `:3772` `recomputeFlow`. `:3780` the `solveFlow` call. `:3796-3835` `syncFlowLabels`. `:454` and `:463` the read models `SegmentInfo` and `FittingInfo`. `:1470` and `:1479` the lookups of the solved capacity.
- `packages/ui/src/riserFlowSync.ts:86-95` `sameRiserFlowInputs` compares only `role` and `demandBeyond`. `:98` `RiserFlowSender`. `packages/ui/src/useRiserFlowInputs.ts:28` the hook.
- `packages/ui/src/riserCapacity.ts:15` `capacityNumberText`. `:127` `capacityViewOf`. `:213` `fittingRiserLinesOf`. `:41-50` the hint texts.
- `packages/ui/src/components/PropertiesPanel.tsx:37` `formatSolvedCapacity`. `:217-218` the segment field. `:328-329` the fitting field. `:355-367` the multi-select field. `:331-345` the riser block.
- `packages/ui/src/components/BuildingRisersPane.tsx:533-566` the capacity block. `:589` the old box "Flow direction".
- `packages/ui/src/App.tsx` (about `:2025`) the header total: `totalCapacity - riserCapacity`.
- `packages/core/src/riser-quantities.ts:131-136` the capacity columns. `:184-197` `riserTakeoffWarnings`.
- Callers of `solveFlow` that must not change: `sizing-network.ts:91`, `route-build.ts:591`, `sheet-summary.ts:109` (`buildRiserNetworks`), `flow.ts:200` (`riserFittingFlow`). They do not pass the new flag (D-B-92).
- Tests exist for the old behavior: `flow.test.ts` (loop at `:109`, root order at `:127-172`), `building-flow.test.ts`, `riserCapacity.test.ts`, `riserFlowSync.test.ts`, `riserFlowInputs.test.ts`.

## 6. Decisions

"User" means the user decided it. "Provisional" means the director may take my recommendation and record it. "Open" means the user must answer first.

### Decided by the user (do not reopen)

- **D-B-86 (user): the highest rule for a network with no source.** Every open end is a possible source. Each segment shows the highest value for any choice of source. Across levels the same rule holds: a riser span is a segment and the levels behind it are demand.
- **D-B-87 (user): a network with a source keeps the current rule.** A dead open end shows 0 and stays 0 until someone places a terminal or an equipment on it.
- **D-B-88 (user): riser spans of a group with no source.** A span shows the highest of its two directions (for example 650 for 100 on one side and 650 on the other). The UI marks it "at most". Words stay neutral: no arrow, no Up, no Down (D-B-74 stays).
- **D-B-89 (user): what stays level-only.** Sizing, routing and the header total stay level-only (D-B-78). The sheet summary format, the building file and the project file do not change without a question to the user.
- **D-B-90 (user): the result settles by itself.** After a source or a terminal is placed, the normal rule applies.

### Open (the user answers before the task named)

- **D-B-93 [data model] (open, blocks T09b-1 and what follows): how the building solve learns which level has an open end.** The stored summary has no such number (`sheet-summary.ts:19`). Example 3 shows it is needed.
  - A: add the optional field `openEnds?: number` to `RiserNetworkSummary`. `SHEET_SUMMARY_VERSION` stays 2 (the same way as `riserNetworks` in D-B-73). An older app ignores the field. A summary without the field counts as "can hold a source" and gives the warning `The summary of Level 1 has no open-end data. Read the summaries.` The existing rebuild adds the field.
  - B: no field. Every level counts as a possible source. Example 3 then gives 100 for span 1 to 2 (true value 50). The error only makes the number too high.
  - C: the field exists only in the live data of open levels. Saved levels count as "can hold a source". The numbers differ between open and closed levels. Not recommended.
  - **Recommendation: A.** It is the same pattern as D-B-73. It is an optional field and it is not read by older apps. Wait for the user. T09a, T09c-1 and T09c-2 do not depend on it.
- **D-B-97 (open, small): a level that the user set as main level by hand but that has no equipment.** The level has open ends.
  - A: its open ends are possible sources (the highest rule, local to the level).
  - B: the old rule (the first open end by id wins).
  - **Recommendation: A.** B depends on the sort order of ids and cannot be explained. A needs no building code: the level solve sees a level with no source and no entry, so the rule applies. The user should confirm because it changes numbers on a level that has a hand-set main level.

### Provisional (my recommendation)

- **D-B-91: what an open end is.**
  - A: a bare fitting with one segment, not a riser fitting.
  - B: also a port with one connection of any non-terminal stamp (what `flow.ts:141` does).
  - **Recommendation: A.** The user wrote: "a segment end that connects to nothing". A stamp of category `fitting` with one connection (an end cap) closes a run on purpose. Treating it as a source would show numbers at a cap. One helper (`countOpenEnds`) is used by the solver and by `buildRiserNetworks`, so the two agree.
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
  - B: the direction of the root that gave the highest value (first by key when equal).
  - C: the direction of one fixed root, as today.
  - **Recommendation: A.** The number is the highest over several roots, so no one direction is true. An arrow would say "the flow goes here" when the source is not known. This follows D-B-74 (neutral words). The overlay is a backup view, so the loss is small.
- **D-B-96: fallback cases.** A loop in a level, a mid-run riser fitting, and a network with no open end use the old rule.
  - A: the old rule (recommended). The closing segment of a loop stays `null`, as the user said.
  - B: the highest rule for the segments that are bridges (not in a loop), and `null` inside the loop.
  - **Recommendation: A.** B needs a bridge search and is a later step.
- **D-B-98: the words (English only, neutral).** See section 7. One word for the rule: "at most". It shows in the fields and rows where the rule applied. The hint explains it once.
  - A: every number of a network with no source reads "at most N" (recommended).
  - B: only the numbers that change with the choice of source read "at most". It needs a second result for each segment (the lowest value). It is true, but it needs more code and more states.
  - **Recommendation: A.** "At most" is true for each number. The simple rule is easier to read and to test.
- **D-B-99: the takeoff.**
  - A: the column "Capacity" keeps the number. One warning line says that the numbers are the most each span can carry (recommended).
  - B: add a column "Capacity basis" with `Exact` or `At most`. It changes the headers and the tests of `riserTable`.
  - **Recommendation: A.** A text in a numeric column would break sums in Excel. A new column can come with B8.
- **D-B-100: other network types (drain, sprinkler, electrical).**
  - A: one rule for all types. The tag "Not a design flow" stays (recommended).
  - B: the rule only for air and water types. Other types show "Not known yet".
  - **Recommendation: A.** The open end of a drain is the outlet. The highest sum of connected capacities for any outlet is a plain sum and says nothing more. The B7 stance holds: a plain sum, no concurrency factor, "Not a design flow". The `mep-domain-checker` should check this.
- **D-B-101: two source levels stay "Not known yet" (D-B-76).** The rule does not pick between two sources. This keeps the old tests. A later step can give the highest value over the sources.

### Defaults that I assume

- Display rounding: two decimals, as `capacityNumberText` does today.
- The unit comes from the riser (`riser.networkType.flowUnit`), never from the open level.
- No setting, no toggle, no stored state. The mode is a result of the drawing.
- The new building fields are optional and appear only when true. Old tests that use `toEqual` stay green.
- A hint line shows once for each panel, not for each number.
- Screenshots are named `b7-t09<task>-<name>` and go to the dashboard after each task.
- Texts are in English only. People are "they". Texts follow ASD-STE100.

## 7. The words and where they show

| Where | Text | When |
|---|---|---|
| Properties, one segment, field "Solved capacity" | `at most 100` | the segment is in a network with no source (`solvedAtMost`) |
| Properties, one segment, line under the field | `No source yet. Each number shows the most this segment can carry.` | same |
| Properties, one fitting, field "Solved capacity" | `at most 100` | same |
| Properties, one fitting, line under the field | `No source yet. Each number shows the most this fitting can carry.` | same |
| Properties, several segments | `at most 100`, or `Varies` as today | all selected segments have `solvedAtMost`. A mixed selection shows the plain number or `Varies` |
| Properties, block of a riser fitting, hint | `No source level yet. Solved capacity shows the most this fitting can carry. Open Manage Buildings, tab Risers, to set the main level.` | the group has `atMost`. It replaces the hint "counts this level only" |
| Risers tab, row of a span | `at most 650 m³/h` | span `atMost` |
| Risers tab, line "Main level" | `Main level: not known yet (no source level)` | group `atMost` |
| Risers tab, line "Connected total" | unchanged: `Connected total: 750 m³/h (no concurrency factor)` | the total is the same for any source |
| Risers tab, hint | `No source level yet. Each span shows the most it can carry. Place an equipment, or click Set by hand and choose a main level.` | group `atMost` |
| Takeoff warnings | `Riser R1 has no source level yet. Each capacity shows the most that span can carry.` | one line for each riser of a group with `atMost` |
| Flow overlay on the canvas | the number only, no arrowhead | `segmentDirection` is `null` |

The hint "Click Set by hand and choose a source level." (`UNKNOWN_HINT`) does not show in the new state. The old "Flow direction" box keeps its text.

## 8. How the design keeps the domain rules

- **Rule 1 (the segment defines the network type of a port).** No type is set on a port or a stamp. The solve reads only segments, fittings and stamp categories.
- **Rule 2 (the cascade).** Nothing writes a network type. The solve reads `computeNetworks`.
- **Rule 3 (reuse).** The mode lives in `solveFlow` and in `solveBuildingFlow`. One helper (`highestFlow`) serves both. The open end has one definition (`countOpenEnds`). The scene already has `setRiserFlowInputs`, `riserSolveOptionsFor`, the hint lines and `riserCapacity.ts`. T09 adds fields to them. T09 adds no new store and no new panel.
- **Rule 4 (adoption).** Not affected. No `networkTypeId` is set.
- **Rule 5 (real DOM).** Each browser check types into the real "Capacity" field and presses Enter. It reads the numbers from the real Properties panel and the Risers tab. The scene API sets up the drawing only.
- **Rule 6 (merge lesson).** After T07 and T09 meet on the branch, run `pnpm build` at the root.
- **Stored data.** No change to the building file or the project file. The summary changes only by an optional field and only after the user answers D-B-93.

## 9. Tasks

Order: T09a-1, T09a-2, T09a-3, then T09c-1 and T09c-2 (they need only core). T09b-1 waits for the answer to D-B-93. Then T09b-2, T09b-3, T09c-3, T09d.

Each task is one commit. Each task runs the tests of its package and `pnpm build` at the root. Core tasks run `pnpm --filter @mepapp/core test`. A task never edits an old test to make it pass. If an old test breaks, the task stops and reports.

Screen tasks (T09c-2, T09c-3): the `ux-designer` writes a short spec first (a small change in existing screens: the director takes open points as provisional). The `journey-tester` runs before the task is done.

### Early result

After T09a-1 to T09a-3 and T09c-1 to T09c-2, Example 1 works in the app, with or without a building. T09b and T09c-3 add Example 2, 3 and 5.

---

### B7-T09a-1: the helper `highestFlow` (core)

- Dependencies: none.
- Files: new `packages/core/src/flow-highest.ts`, new `packages/core/src/flow-highest.test.ts`, one export line in `packages/core/src/index.ts` (next to the `flow` export).
- Exact shapes:

```ts
export interface HighestNode { id: string; own: number; root: boolean }
export interface HighestEdge { id: string; a: string; b: string }
export interface HighestSide { demand: number; roots: number }
export interface HighestResult {
  /** Sum of `own` over all nodes. */
  total: number;
  /** Highest value of each edge: the demand of the side that holds no source. Null when no node is a root. */
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
  - Example 1 as a graph (own: Tm 100, others 0; roots O1 and O2): `edge.main` 100, `edge.s1` 100, `edge.s2` 100, `node.T` 100, `node.O1` 100, `node.O2` 100, `total` 100.
  - Example 4b: the table in section 2 (`p2` is 60).
  - Example 3 at the building level (nodes L0 own 100 no root, L1 own 0 root, L2 own 50 no root; edges L0-L1, L1-L2): edges 100 and 50.
  - Example 5 at the building level (all three nodes are roots, own 100, 500, 150): edges 650 and 600.
  - No root at all: every `edge` and `node` value is null.
  - One root: each edge equals the old one-root subtree sum (compare with a simple oracle).
  - A loop returns null. Two components return null. An empty input returns null.
  - **Oracle test:** a seeded random generator makes 200 trees of 2 to 12 nodes with random `own` and `root`. A naive function in the test file runs, for each root, its own subtree sum (independent code) and keeps the maximum for each edge and node. The result equals `highestFlow`.
  - A chain of 20000 nodes finishes with no stack error (no recursion).
  - Input order does not change the result (shuffle test).
- Size: about 110 lines of code.

### B7-T09a-2: `solveFlow` uses the rule on one level (core)

- Dependencies: T09a-1.
- Files: `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts` (new `describe`; old tests unchanged), `packages/core/src/index.ts` (exports).
- Exact shapes:

```ts
// FlowSolveInput gets:
/** With no source and no valid entry or explicit root, treat every open end as a possible source and give each segment and fitting the highest value over all choices. Opt in; sizing and routing do not set it. */
highestWhenNoSource?: boolean;
// FlowResult gets:
/** True when the highest rule gave the numbers (no source was known). Absent otherwise. */
sourceUnknown?: boolean;
// New exports in flow.ts:
/** The number of open ends of the network: bare fitting nodes with one segment that are not in `input.riserFittingIds`. */
export function countOpenEnds(input: FlowSolveInput): number;
/** True when an element of category 'equipment' with own capacity not above 0 has a port in this network (only this network's elements count). */
export function networkHasSource(input: FlowSolveInput): boolean;
```

- Where: in `solveFlow`, after `explicitRootKey` is known (`flow.ts:136`) and before `rootKey` is chosen (`:137`). If `highestWhenNoSource` and `explicitRootKey === undefined` and `entryKey === undefined` and `!networkHasSource` and the graph is a tree and `countOpenEnds > 0` and every marked fitting has one segment: build the nodes (own = `ownCapacityOf`, root = open end) and the edges (segments), call `highestFlow`, map the result (3.5), return. A `null` from the helper continues with the old chain.
- This task does not take `riserSides`. A marked fitting with no key stays a boundary with 0 (it is not a root and it is not an open end). Pendant sides come in T09a-3.
- Must not touch: the old chain and the DFS (`flow.ts:137-192`), `riserFittingFlow`, `sizing-network.ts`, `route-build.ts`, `sheet-summary.ts`.
- Verification (core tests):
  - Example 1: numbers in section 2. `sourceUnknown` true, `resolved` true, every `segmentDirection` null, `totalCapacity` 100.
  - Example 1b: the old numbers, `sourceUnknown` absent.
  - Example 1c: the old numbers (`s1` 150, `main` 100, `s2` 50), `sourceUnknown` true (one possible source).
  - Example 4a and 4b.
  - Swap the ids of O1 and O2 in Example 1: the same result (order does not matter).
  - Without the flag, Example 1 gives today's numbers (`s2` 0). Every old test is green with no edit.
  - A loop with no source: the old result (one `null`).
  - A network with only terminals: the old result.
  - A port with one connection of a stamp of category `fitting` is not an open end (D-B-91): a network `Tm - T - cap-stamp` and `T - O` has one open end.
  - A valid `rootElementId` or `entryFittingId` turns the mode off.
  - An equipment with capacity above 0 (a fan coil unit) does not count as a source: the mode runs.
  - An equipment in another network (in `elementCategories`, no port here) does not count (the scene passes all stamps).
  - A mid-run marked fitting turns the mode off.
- Size: about 100 lines of code.

### B7-T09a-3: sides of riser fittings (core)

- Dependencies: T09a-2.
- Files: `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts`.
- Exact shapes:

```ts
export interface RiserSide {
  /** Terminal capacity on the far side of one span, seen from this level. */
  demand: number;
  /** True when the far side holds a possible source. */
  open: boolean;
}
// FlowSolveInput gets:
/** For a marked riser fitting with one segment: one entry for each span at the fitting. Used only by the highest rule. A key for an unmarked fitting or a fitting outside the network is ignored. */
riserSides?: Record<string, ReadonlyArray<RiserSide>>;
```

- Behavior: in the mode, each side is a node (`own` = demand, `root` = open) that joins the fitting by one edge. A marked fitting with no `riserSides` key but with a `riserDemand` key gets one side `{ demand, open: false }`. The marked fitting itself is never a root. `totalCapacity` and `riserCapacity` follow 3.5. When the mode is off, `riserSides` is ignored and the old rule uses `riserDemand`.
- Must not touch: the old DFS and `riserDemand` handling in the old path.
- Verification (core tests, level solves with exact numbers):
  - Example 2, Level 1 (`RF1 - a1 - O1`, sides `[{demand 100, open false}, {demand 0, open true}]`): `a1` 100, RF1 100, O1 100, `totalCapacity` 100, `riserCapacity` 100.
  - Example 2, Level 0 (`Tm0 - a0 - RF0`, sides `[{demand 0, open true}]`): `a0` 100, RF0 100, `totalCapacity` 100, `riserCapacity` 0.
  - Example 2, Level 2 (`RF2 - a2 - O2`, sides `[{demand 100, open true}]`): `a2` 100, RF2 100, O2 100.
  - Example 3, Level 1 (sides `[{100, false}, {50, false}]`): `b1` 150, RF1 150, O1 150, total 150.
  - Example 3, Level 0 (sides `[{50, true}]`): `a0` 100, RF0 100. Level 2 (sides `[{100, true}]`): `c2` 50, RF2 50.
  - Example 5, Level 1 (tee F with `Tm300`, `Tm200`, open end O1, segment RF1-F; sides `[{100, true}, {150, true}]`): RF1-F 650, RF1 650, `Tm300` segment 300, `Tm200` segment 200, F 750, open segment 750.
  - A level that is the hand-set main level and has no equipment, with `riserDemand` only: the highest rule over its open ends (D-B-97 option A).
  - Old path unchanged: a source level with equipment and `riserDemand`; an entry level (the old tests of T01 stay green with no edit).
  - A marked fitting with two segments: the mode is off and the old numbers show.
- Size: about 90 lines of code.

### B7-T09b-1: the summary counts open ends (core) — waits for D-B-93

- Dependencies: the answer to D-B-93 (option A assumed here). T09a-2.
- Files: `packages/core/src/sheet-summary.ts`, `packages/core/src/sheet-summary.test.ts`.
- Exact shapes: `RiserNetworkSummary.openEnds?: number` (a whole number, 0 or more; the number of open ends of the network, riser fittings excluded). `buildRiserNetworks` sets it with `countOpenEnds` (the same call input as its `solveFlow`, `sheet-summary.ts:109`). The validator (`:299-313`) accepts an absent field and rejects a negative or non-integer value (`path: riserNetworks[i].openEnds`).
- Must not touch: `SHEET_SUMMARY_VERSION` (stays 2), `riserFittingFlow`, `terminalCapacity`, `hasSource`.
- Verification: build with the field (Example 2 Level 1 gives 1, Level 0 gives 0); parse and validate with and without it; a bad value gives an issue; a v2 summary without the field stays valid; `sheet-summary.test.ts` (asserts version 2) stays green; `rebuildSummaries` and `buildingContext` write the field (a test calls `buildSheetSummary` with riser ids).
- If the user answers B: skip this task. T09b-2 then treats every node as a possible source and its Example 3 test changes (span 1 to 2 reads 100).
- Size: about 40 lines.

### B7-T09b-2: the building solve (core)

- Dependencies: T09a-1, T09b-1 (or option B).
- Files: `packages/core/src/building-flow.ts`, `packages/core/src/building-flow.test.ts`. Re-read the file first (T07 changed it).
- Exact shapes:

```ts
// BuildingFlowSpan gets (set only when true):  atMost?: true
// BuildingFlowGroup gets (set only when true): atMost?: true
// BuildingFlowMember.role gets a new value: 'open'
// BuildingFlowMember gets (only for role 'open'):
sides?: Array<{ demand: number; open: boolean }>;   // one for each span at the member; far side as seen from the member
// FlowNode gets: openEnds?: number   // from RiserNetworkSummary.openEnds; absent counts as "can hold a source"
```

- Behavior: in the source step (`building-flow.ts:265-276`), when there are 0 candidates, no hand-set level, no missing node, and at least one node with `openEnds !== 0`: set `component.state = 'ok'`, `component.atMost = true`, no `sourceKey`. Else the old warning stays. In the solve step (`:279-319`) the `atMost` component calls `highestFlow` (nodes: `own` = `terminal`, `root` = `openEnds !== 0`; edges: the spans). Each span gets `capacity`, `state: 'ok'`, `complete: true`, `atMost: true`. Each member gets `role: 'open'`, `capacityIn: null`, `demandBeyond` = sum of its sides, and `sides` from `HighestResult.sides` (the side that does not hold the member's node). A summary with no `openEnds` in an `atMost` group gives the warning `The summary of Level 1 has no open-end data. Read the summaries.` once for each level. No other new warning: the state is normal while the user draws.
- Must not touch: the grouping, the loop rule, the hand-set rule, the missing-level warnings, `deriveRiserFlow`.
- Verification (core tests, exact numbers):
  - Example 2: spans 100 and 100, group `atMost`, `total` 100, `sourceLevelId` absent. Members of Level 1: role `open`, sides `[{100, false}, {0, true}]` (below, above).
  - Example 3: spans 100 and 50. Level 1 members: sides `[{100, false}, {50, false}]`.
  - Example 5: spans 650 and 600.
  - Two risers in one tree with no source: each span follows the rule.
  - The three rows of the B7 worked example (with equipment) are unchanged. The old tests are green with no edit.
  - A missing level: `unknown`, as today (D-B-94). A loop: as today. Two sources: `unknown`. No open end anywhere: `unknown` with the old warning. A hand-set level with no equipment: `ok`, not `atMost`.
  - A summary with no `openEnds`: counts as a possible source and gives the warning.
  - Placing an equipment on any level turns `atMost` off (settle test: same input plus `hasSource: true` on Level 0 gives 650 and 150 for the B7 terminals).
- Size: about 110 lines.

### B7-T09b-3: the inputs reach the scene (core, render, ui)

- Dependencies: T09a-3, T09b-2.
- Files: `packages/core/src/building-flow.ts` (`RiserFlowInput`, `riserFlowInputsOf`), `packages/render/src/riserFlowInputs.ts` (`riserSolveOptionsFor`), `packages/render/src/scene.ts` (`recomputeFlow`), `packages/ui/src/riserFlowSync.ts` (`sameRiserFlowInputs`), and the tests next to them (`building-flow.test.ts`, `riserFlowInputs.test.ts`, `riserFlowSync.test.ts`).
- Exact shapes:

```ts
export type RiserFlowInput = {
  role: 'entry' | 'exit' | 'open';
  demandBeyond: number;
  /** Only for role 'open'. */
  sides?: ReadonlyArray<{ demand: number; open: boolean }>;
};
// RiserSolveOptions (riserFlowInputs.ts:3) gets: riserSides?: Record<string, ReadonlyArray<RiserSide>>
```

- Behavior: `riserFlowInputsOf` gives, for a member with role `open`, `{ role: 'open', demandBeyond: sum, sides }`. When two members map to one fitting id, the sides join and the demands add. `riserSolveOptionsFor` copies `sides` into `riserSides` and `demandBeyond` into `riserDemand`. It sets no `entryFittingId` for role `open`. `recomputeFlow` (`scene.ts:3780`) adds `highestWhenNoSource: true`. `sameRiserFlowInputs` (`riserFlowSync.ts:93`) also compares `sides` (length, `demand`, `open`). Without the second compare the scene would keep old inputs when only `sides` change.
- Must not touch: `setRiserMarks`, the reset of inputs on document activation (`scene.ts:1204`, `:1333`), `useRiserFlowInputs.ts` (T07 owns it; if a change is needed, report it).
- Verification:
  - Core and render tests: `riserFlowInputsOf` for Example 2 and 3 (exact `sides`); `riserSolveOptionsFor` with role `open`; a render test with a built scene or the core path for Example 2, Level 1: `a1` 100, RF1 100, O1 100. A test with no inputs: Example 1 gives 100 and 100.
  - `riserFlowSync.test.ts`: two inputs that differ only in `sides` are not the same.
  - Old tests green with no edit.
- Size: about 80 lines.

### B7-T09c-1: the scene read model and the overlay (render)

- Dependencies: T09a-2.
- Files: `packages/render/src/scene.ts` (`SegmentInfo` `:454`, `FittingInfo` `:463`, the lookups `:1470`/`:1479`, `getSelectedFittingInfo` `:1545`, `syncFlowLabels` `:3796-3835`), a test file next to it.
- Exact shapes: `SegmentInfo.solvedAtMost?: boolean` and `FittingInfo.solvedAtMost?: boolean`. Both are true when the network of the item has `sourceUnknown`. They are absent otherwise. In `syncFlowLabels`, skip the arrowhead when `segmentDirection[id]` is `null` and the capacity is not `null`. The number label stays.
- Must not touch: the solve, `computeFlow`, the other read models.
- Verification: a test for the lookups (a result with `sourceUnknown` and one without). A test that the overlay draws no arrowhead for a `null` direction and still draws the number (use the existing overlay test pattern; if none exists, test the helper that is extracted: name it `flowArrowOf` only if needed, and report).
- Size: about 40 lines.

### B7-T09c-2: Properties shows "at most" (ui, screen task)

- Dependencies: T09c-1, T09a-2. The riser-fitting hint also needs T09b-2 and T09b-3.
- Files: `packages/ui/src/components/PropertiesPanel.tsx` (`formatSolvedCapacity` `:37`, `:217-218`, `:328-329`, `:355-367`), `packages/ui/src/riserCapacity.ts` (`capacityNumberText` `:15`, `capacityViewOf` `:127`, `fittingRiserLinesOf` `:213`), their tests, `packages/ui/src/App.tsx` only if a prop must pass (re-read after T07).
- Exact shapes:
  - `formatSolvedCapacity(value: number | null, atMost = false): string` returns `at most 100` when `atMost` and the value is not null.
  - `capacityNumberText(value, unit, atLeast, atMost = false)`: the new fourth parameter gives `at most 650 m³/h`. The old calls do not change.
  - `CapacityView.atMost: boolean` (from `group.atMost`). When true: `mainValue` is `not known yet`, `mainLine` is `Main level: not known yet (no source level)`, rows use `atMost`, and `hints` has the text from section 7 instead of `UNKNOWN_HINT`. `fittingRiserLinesOf` uses the riser-fitting hint of section 7 instead of `RISER_UNKNOWN_HINT`.
  - Under the field in `PropertiesPanel`: `<p className="mep-hint" data-testid="props-at-most-hint">` with the segment or fitting text.
- Must not touch: the editable "Capacity" field of a terminal, the "Network Type" cascade, the old box "Flow direction".
- Verification:
  - `riserCapacity.test.ts` and a `PropertiesPanel` test: the strings of section 7 exactly.
  - Browser check `b7-t09c2-check.mjs` in `.claude/roadmap/work/` (copy the shape of `b7-t07-check.mjs`; reuse `lib.mjs`). One PDF, no building:
    1. Set up Example 1 with the scene API (setup only).
    2. Click `s1`, then `s2`, then `main` on the canvas. Read the Properties field "Solved capacity" from the real DOM. Expect `at most 100` each time and the hint `props-at-most-hint`.
    3. Click fitting O2. Expect `at most 100`.
    4. Type 250 in the real "Capacity" field of `Tm` and press Enter. Expect `at most 250` on `s1` and `s2`.
    5. Settle: add an equipment at O1 (setup call), select `s2`. Expect `0` with no "at most" and no hint. Select `s1`. Expect `250`.
    6. Screenshots: `b7-t09c2-ex1-segment.png` and `b7-t09c2-ex1b-settled.png`.
  - A no-building run: a network with an equipment shows the same numbers as master (no "at most" anywhere).
  - Plain `pnpm dev` check (the no-flag check of T04b/T05): green. The production `dist` has no `__mepBuilding`, `devPlatform` or `webLike`.
  - Update the expectations of `b7-t04b-nobuilding-check.mjs` only for source-less networks. Add an assertion that a network with an equipment is unchanged.

### B7-T09c-3: the Risers tab and the takeoff (ui, screen task)

- Dependencies: T09b-2, T09b-3, T09c-2.
- Files: `packages/ui/src/components/BuildingRisersPane.tsx` (`:533-566`; most text comes from `capacityViewOf`), `packages/core/src/riser-quantities.ts` (`riserTakeoffWarnings` `:184-197`), their tests (`riser-quantities.test.ts`).
- Exact shapes: `riserTakeoffWarnings` adds, for each riser whose group has `atMost`, the warning in section 7. No new column (D-B-99). A row of a span keeps its number in the column "Capacity".
- Must not touch: the headers of `riserTable`, the "Flow direction" box, the source selects.
- Verification:
  - Core test: the warning appears for a group with `atMost` and not for others. The headers are unchanged.
  - Browser check `b7-t09c3-check.mjs`: 3 levels from real PDFs, one riser, Example 2 terminal only. Open Manage Buildings, tab Risers. Expect the rows `Level 0 to Level 1  at most 100 m³/h`, `Level 1 to Level 2  at most 100 m³/h`, the line `Main level: not known yet (no source level)`, and the hint of section 7. Open Level 1 and click `a1` and the riser fitting. Expect 100 and 100. Type 250 in the capacity field of `Tm0` (real input), do not save, and switch levels: Level 1 shows 250 with no click on "Read summaries now". Then place an equipment on Level 0 (setup call): the rows read `650` and `150` style numbers with no "at most" (use the numbers of the test data).
  - The three B7 worked-example rows (equipment): unchanged (reuse `b7-t05-check.mjs`).
  - The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`): 0 problems. Read every line.
  - Takeoff: open Quantities for the scope Building. Expect the warning line. Screenshots: `b7-t09c3-risers-atmost.png`, `b7-t09c3-takeoff-warning.png`.
  - `journey-tester`: a user who has drawn terminals and no air handling unit yet opens the Risers tab and understands why the numbers read "at most".

### B7-T09d: the Windows test script

- Dependencies: all of the above.
- Files: `.claude/plans/buildings-b7-test.md` (re-read it first: T08 changed it), and the status line of `buildings-b7-flow-through-risers.md`.
- Change:
  - Step 18 (delete the air handling unit) changes. The result depends on open ends. After the unit is deleted, a level may have no open end (not verified: what the segment of the deleted unit becomes). With no open end anywhere the rows stay `not known yet (no source level)`. So the step first says: "Draw a short duct from the riser fitting of each level and leave its end open." Then it expects Example 5 numbers for the terminals of that script: Level 0 to Level 1 `at most 650 m³/h`, Level 1 to Level 2 `at most 600 m³/h`. "Main level" reads `not known yet (no source level)`. The hint is the new text. The implementer checks these numbers in the browser run before writing them.
  - New Part J "No source yet": (1) one level in the plain app: draw Example 1, click both open segments, expect `at most` and 100 on both; (2) place an air handling unit at one open end, expect 0 on the dead open end; (3) three levels with a terminal on Level 0 only (Example 2): the open ends of Level 1 and Level 2 show `at most 100`; (4) type a new capacity, expect the numbers to follow with no save; (5) terminals on Level 0 and Level 2, the open end on Level 1 (Example 3): spans `at most 100` and `at most 50`; (6) place the air handling unit: `at most` goes away; (7) a drain network (a plain sum, "Not a design flow" stays); (8) open an old building saved before T09: the warning `The summary of Level 1 has no open-end data. Read the summaries.` shows, and "Read summaries now" clears it.
  - "What to write down": add the open questions D-B-97 and the word "at most".
- Verification: each step is possible on one PC (rule 1a). No code change.

## 10. Risks

- **Performance.** The rule costs O(N) for each network and each edit, like one DFS today. `recomputeFlow` already runs on each edit and each network. The building graph is small. The naive method (one solve for each open end) is the oracle in tests only.
- **The T07 overlay.** The live networks of open levels are `RiserNetworkSummary[]`. They carry `openEnds` with no change in T07, because `buildRiserNetworks` fills it. The JSON compare in `LiveRiserOverlay.set` sees the new field. T09b-3 changes `sameRiserFlowInputs` only. T09 must re-read `useRiserFlowInputs.ts` and `riserFlowSync.ts` after T07 and must not change the hook without a report.
- **A stale summary** (saved before T09) has no `openEnds`. It counts as "can hold a source", so a number can be too high. The warning names the level and "Read summaries now" fixes it.
- **Numbers rise.** A user who saw 0 on an open segment now sees the sum. This is the goal. The test script (T09d) tells the tester.
- **No-building behavior changes** for networks with no source. This is deliberate (Example 1 on one level). Networks with a source are byte-identical. The B7 rule "plain `pnpm dev` must not change" is kept for them and is tested in T09c-2.
- **An equipment with two or more connections** next to an open end keeps the old order (the open end wins, `flow.ts:140-143`). This copies the old app (collector heuristic). Not changed here. A note for later.
- **Old app.** `NetworkFlowProcessor.cs` (FindRoot, `:227-276`) picks one root and leaves the others dead. MepApp copied this. T09 is a deliberate change: the old app has no "highest" rule. Where there is a source the two apps agree.
- **Drain and electrical networks.** See D-B-100. The sum has no design meaning. "Not a design flow" stays.
- **Stack depth.** The old `demandOf` is recursive. The new helper is not. A very long chain would still hit the old path first only when the mode is off.
- **Two hand-set levels, two sources, loops** keep "Not known yet". The user may want a later step for the highest value over several sources.

## 11. Not in scope

- Riser arrows and supply/return words (B8).
- Sizing and routing from the highest numbers (D-B-89). `sizing-network.ts` and `route-build.ts` stay as they are.
- A concurrency factor or any physics.
- A new column in the takeoff (D-B-99, option B).
- A change of `SHEET_SUMMARY_VERSION`, of the building file or of the project file. The optional field `openEnds` needs the answer to D-B-93 first.
- The highest value over two sources (D-B-101).
- A value for the segments outside a loop (D-B-96, option B).
- The items of `room-type-calculations-small-fixes.md`.

## 12. Records

- The director copies this plan to the hub (`Specs/`) and checks it with `cmp`.
- After each task: ledger events, dashboard screenshots, one commit, push of the branch only. The user tests on Windows and merges.
