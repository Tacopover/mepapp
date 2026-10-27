# Q1 plan: better auto-routes (metrics, baseline and prototypes)

Status: PLANNED 2026-10-25 by the road map planner. No task is started. No product code changed.
Origin: `auto-routing-feedback-prompt.md` (comment 2 of the user test of R1-R6), `auto-routing-r6.md`, `.claude/roadmap/rules.md`. This plan covers comment 2 only. Comment 3 (presets) is in `route-layout-presets.md`. Comments 1, 4, 5 are in `ui-cleanup-rail-i18n.md`.

Code claims carry `path:line`. Paths start at the repository root. The lines are from branch `worktree-routing-feedback` (R1-R6). Numbers marked "measured" come from a test run on 2026-10-25 (section 2.3).

Terms (the terms of `auto-routing.md` and R6 apply). New terms:
- **Metric**: one number that describes a planned route, for example the total length.
- **Baseline**: the metrics of today's planner on a fixed input. Later numbers are compared with it.
- **Prototype**: code that tries one idea. It is off by default. With its layout option off, the plan equals the baseline.
- **Off-graph room**: a served room that the trunk does not reach (section 2.3 defines the two counts that were mixed up).
- **Graph part**: a set of corridor graph nodes that are joined by edges. `area.parts` counts them (`packages/core/src/route-area.ts:66`).
- **Heading state**: the pair (node, direction of the last leg). A search on heading states can charge a price for each bend.
- **Rip-up and reroute**: remove one path of a finished plan and plan it again with a price on the spots that other paths use.

## 0. Open questions and what is assumed

All questions are in section 9 (ids Q-Q1-01 to Q-Q1-08). Tasks Q1-T01 to Q1-T06 need no answer. Q1-T07 and later wait for Q-Q1-02 and Q-Q1-04 only where the task says so.

Assumptions (easy to reverse):
- A prototype changes the plan only when its field in `RouteLayoutOptions` is set. The default output stays byte-equal to the baseline. Q1 does not make a second options type or a second candidate list: `route-layout-presets.md` (P1) owns them.
- No new dependency. All code is TypeScript in `@mepapp/core`. The `pnpm add` command is not used.
- The user answers in the dashboard. The director posts the questions.

## 1. Goal

Find out, with numbers, which ideas make the auto-route better from an engineering view. Build the measuring tool first. Then try five ideas as prototypes, one by one, behind a layout option. At the end the user sees before/after screenshots and a table, and chooses which ideas become the default (part Q2, not in this plan).

Example (first floor drawing, 33 rooms, one port in each room, the air handling unit in the largest corridor room). Today the plan has 109 segments, 151 m of duct, 26 wall crossings, and 28 of 33 rooms are joined by a long free L-shaped duct that crosses other rooms (measured). After the best prototype the table should show fewer off-graph rooms and fewer wall crossings at about the same length. The user compares two screenshots.

Where Q1 stops: Q1 adds a metrics module, a report test, a baseline, and prototypes that are off by default. It changes no dialog, no stored data and no default result. Q2 (a later plan) switches the chosen ideas on and removes the others. Q1 uses the P1 seam `planRoute(input, options?: RouteLayoutOptions)` (section 4). Q1 does not run gate G1 of P1. P1 runs G1 after Q1-T07 to Q1-T09 are done.

## 2. What exists now (verified against the code)

### 2.1 The planner steps, as the code does them

| Step | Where | What it does |
|---|---|---|
| Entry | `packages/core/src/route-build.ts:193` `planRoute(input)` | One function with no options object. It returns `{ status, plan }`. |
| Start leg | `route-build.ts:281-287` | An L-shaped `elbowPath` from the start point to the trunk root. The first axis is the longer side. |
| Trunk | `packages/core/src/route-trunk.ts:101` `buildTrunk` | Takahashi-Matsuyama Steiner tree (`route-steiner.ts:16`) on the corridor graph. The edge cost is `lengthMm` only (`route-trunk.ts:134-136`). Entry connectors (`rc-ry-`) are not in the graph. The terminal of a room is the tap node of its entry. If the tree does not reach a tap, the room tries its next entry (`route-trunk.ts:139-153`). A room with no reached tap is off graph (`route-trunk.ts:215-227`). |
| Straightening | `route-trunk.ts:196-197`, `route-layout.ts` | Each tree edge becomes axis and 45 degree legs (`straightenPolyline`). |
| Branches | `packages/core/src/route-branch.ts:182` `planBranches` | Rooms are sorted by room id (`:185`). Each branch taps the nearest trunk leg. Later taps keep 300 mm from earlier taps (`placeTapPosition`, `:110`), so the id order moves the taps. The branch is a straight leg or a jog (`:156-171`). |
| Room spine | `packages/core/src/route-hanan.ts:95` `roomSpine` | Takahashi-Matsuyama again, on a Hanan grid of the entry and the ports. Each path search is on heading states (node x 4 headings, `:170-213`). The price is length + `BEND_PENALTY_MM` (500, `:3`) for a turn + `CROSSING_PENALTY_MM` (1000, `:4`) for each existing foreign segment that the grid edge crosses (`:205`). Grid edges that leave the room are blocked (`:123-128`). The ports are leaves (`:194`). The tree source has all four headings at cost 0 (`:179-185`), so a bend where a new path leaves the tree is free. |
| Off-graph connection | `packages/core/src/route-topology.ts:358` `connectLoosePorts` | Loose ports are ports of off-graph rooms, ports in no room, ports in a corridor room, and ports that the spine could not reach (`route-build.ts:289-312`). It joins them one at a time, nearest first, to the nearest point of the route that exists so far, including earlier loose links (`route-topology.ts:367-381`). It tries the tap candidates, and for each one two L-shapes (`:384-401`). The only test is `accepts` (`route-build.ts:342-346`): no vertex within `NEAR_ITEM_MM` of a foreign item. There is no test for walls, rooms or bends. |
| Checks and numbers | `route-build.ts:383-406`, `route-crossings.ts:51` | `checkExisting`, `checkInvariant`, and the wall crossings along the final paths (`crossingsAlongPath`). These only report. They do not steer the search. |

### 2.2 What this means for engineering quality

- The bend price and the crossing price exist only inside one room. The trunk uses length only. The off-graph links use no price at all.
- No search step counts a wall crossing. Walls are counted only after the plan is done.
- The room Hanan grid has only the lines through the entry and the ports (`route-hanan.ts:99-100`). It has no lines for door posts or room corners, so a room with an L-shape can leave a port unreached (the port then becomes a loose port).
- The code already has a search on heading states (`route-hanan.ts:170-213`) and a heap with a fixed tie-break (`:37-93`). A prototype reuses it. It does not write a second one (rule 3).

### 2.3 The two counts "15" and "28" (answer)

Both counts are right. They count different things.

| Count | Definition | Where | Value |
|---|---|---|---|
| **15** | Rooms that have no wall with a route-area room within the wall limit (500 mm run). It is a property of the drawing only. The name in the code is `area.unreached`. | `packages/core/src/route-area-real.test.ts:12` (comment: "18 primary entries of 33 served rooms (15 unreached)"); R4 plan R-4; R6 plan `auto-routing-r6.md:102`, `:116` | 15 of 33 |
| **28** | Rooms that the trunk tree does not reach from the chosen start. It is a property of the drawing and of the start point. The name in the code is `trunk.offGraphRoomIds`. The dialog shows it as the warning `room-off-graph`. | `route-trunk.ts:215-227`; `route-build.ts:374`; printed by `packages/core/src/route-run.test.ts:188-190` | 28 of 33 (measured, 84.8 %) |

Why 28 is larger than 15 (measured with a scratch script on 2026-10-25, first floor, start in the largest corridor room):
- The route area has 5 rooms and **4 graph parts** (`area.parts` = 4), and only 1 link between rooms. The corridors are not joined to each other in the graph.
- 18 rooms have a primary entry. Only 5 of them lie in the part of the start. 13 rooms have an entry but sit in other parts. So 15 (no entry) + 13 (entry in another part) = 28.
- This is the main finding of this plan. The biggest lever may not be the search. It may be the join of the graph parts (idea 0, task Q1-T07).

Which one the user sees: the user sees the **28 type**, in the dialog warning `room-off-graph`, when the start is in the part that serves few rooms. The 15 type never shows in the dialog. With another start room the 28 changes. Not verified: the count for a start in another corridor, and for 10A. Task Q1-T04 measures several starts.

### 2.4 Corrections to the earlier findings (`auto-routing-feedback-prompt.md`, section "Findings: algorithms")

1. The earlier text says the bend and crossing prices belong to "room paths on a Hanan grid". True, but the text implies they are used for routing in general. They are used only in `roomSpine` (section 2.2). The crossing price counts existing foreign segments, not walls.
2. The earlier text says "off-graph rooms get a fixed L-shaped elbow from the nearest built point" and "rooms are routed one by one in id order". Correction: the id order holds for the branches (`route-branch.ts:185`). The off-graph links go **nearest first**, one port at a time, and the id only breaks a tie (`route-topology.ts:374-381`). A link can start at an earlier link, not only at the trunk.
3. The elbow is not "fixed". It tries both axes for each of several tap candidates, and it takes the first one that `accepts` (`route-topology.ts:384-401`). The test checks only the nearness to foreign items.
4. The ranked idea 1 says "a bend-aware search on (node, heading) states". A search like that already exists for the room spine (`route-hanan.ts:170-213`). Idea 1 is to reuse it for the trunk and the links, not to invent it.
5. The earlier text does not mention the 4 graph parts. They explain most off-graph rooms (section 2.3). A new idea 0 is added (join the parts).
6. "Planning takes about 150 ms": confirmed. Measured 167 ms in one cold test run (`route-run.test.ts:191`). The R6 summary says 144 to 155 ms on the first floor and 93 ms on 10A (`auto-routing-r6.md:47`). The test limit is 500 ms (`route-run.test.ts:195`).
7. "Takahashi-Matsuyama on a corridor graph with length-only cost": confirmed (`route-trunk.ts:134-142`). "Bend penalty 500, crossing penalty 1000": the values are confirmed (`route-hanan.ts:3-4`).

### 2.5 Baseline numbers that exist (measured 2026-10-25, first floor, `route-run.test.ts` set-up)

The set-up puts one terminal in each of the 33 served rooms, at the room label point (`route-run.test.ts:33-49`), and the start stamp at the label point of the largest corridor room (`:27-31`). It is a synthetic input: one port per room, no stamp art.

| Metric | Value |
|---|---|
| Segments / fittings | 109 / 76 |
| Length | 151 366 mm |
| Bends 90 / 45 degrees | 35 / 10 |
| Free-angle legs | 0 |
| Rooms / ports / ports left | 33 / 33 / 0 |
| Wall crossings | 26 |
| Existing crossings | 0 |
| Off-graph rooms | 28 |
| Warnings | `room-off-graph`=28, `wall-crossings`=26, `no-limits`, `draft-2d` |
| `planRoute` time (cold, one run) | 167 ms |

The 10A drawing has no stored fixture. It exists only in the browser check (`.claude/roadmap/browser/r6-check.mjs:12`, `:239-273`). It is a local-only PDF (`rules.md` section 2).

## 3. Research

I checked only two licence claims on the web (2026-10-25). All other sources come from memory and are **not verified**. A person must open them before the report to the user.

Verified by a web search (snippet only, the licence text was not read in full):
- **libavoid** (Adaptagrams, orthogonal connector routing): LGPL 2.1 or later, with a separate commercial licence. See https://github.com/cmears/adaptagrams and https://www.adaptagrams.org/documentation/libavoid.html. It is C++, so it needs WASM. AGPLv3 does not forbid LGPL, but the build and link rules are a risk. Decision: not used. It routes around boxes, and MepApp has its own search.
- **CGAL straight skeleton**: the package page for CGAL 4.7 lists GPL (https://doc.cgal.org/4.7/Straight_skeleton_2/group__PkgStraightSkeleton2.html). The licence of the current CGAL release is not verified. Decision: not used. A straight skeleton is also not an engineer's trunk line.

Not verified (planner's memory; each needs a page to read):
- **Hanan grid.** Hanan (1966), SIAM J. Appl. Math. A shortest rectilinear Steiner tree exists on the grid through the terminals. MepApp uses it (`route-hanan.ts:99-107`).
- **Exact Steiner tree for few terminals.** Dreyfus and Wagner (1971), Networks 1(3). The cost grows with 3^k for k terminals. For k up to 6 on a Hanan grid of about 50 nodes, this is small. Idea 2 uses it. The ports must stay leaves. The dynamic program must not merge or pass at a port node.
- **Steiner heuristic.** Takahashi and Matsuyama (1980). Used today (`route-steiner.ts:1`). Bound: at most about 2 times the optimal length.
- **Rip-up and reroute with history costs.** McMurchie and Ebeling (1995), "PathFinder", FPGA routing. Idea 4 copies the method. The program plans one path again with a price on spots that other paths use. It raises the price each round. Chip routing uses the method widely. The fit to duct layout is a guess.
- **Maze routing with bends.** Lee (1961) and Hadlock (1977) for the grid search. The bend price on heading states is the standard way to get fewer bends. Used in `route-hanan.ts` already.
- **Revit "Generate Layout".** It offers the topologies Network, Perimeter and Intersection, not an optimiser. Source: Autodesk Revit help, not opened for this plan. Used for the preset plan only.
- **Duct and pipe practice.** Fewer fittings, fewer bends, parallel runs in a bundle, and a run that keeps clear of fire walls. This comes from the user brief and general practice. No standard was read. The weights in section 5 are planner values, not from a source.

What MepApp can use: its own code. The heading-state search, the heap, `crossingsAlongPath`, `checkExisting`, `checkInvariant`, `steinerTree`, `connectedParts` (`route-graph.ts:77`), `nearestOnEdges` (`route-graph.ts:15`), `splitEdgeAt` (`route-graph.ts:44`).

## 4. The model

No stored data changes. No schema step. No new field in a file. The plan, the metrics and the baseline are not stored in a drawing.

New types in `@mepapp/core` (all exported from `packages/core/src/index.ts`, which already exports `route-build`, line 21):

```ts
// packages/core/src/route-metrics.ts (new, pure)
export interface RouteMetrics {
  lengthMm: number;                 // sum of the leg lengths
  lengthTrunkMm: number;            // legs that carry no mark of a branch or a spine: trunk + start leg
  lengthBranchMm: number;           // branch legs
  lengthRoomMm: number;             // spine legs inside rooms
  lengthLinkMm: number;             // off-graph links
  segments: number;
  fittings: number;                 // elbows + tees + crosses (plan.fittings by kind)
  bends90: number;
  bends45: number;
  freeLegs: number;
  wallCrossings: number;            // crossingsAlongPath count (gap up to 600 mm)
  openRuns: number;                 // crossingsAlongPath openRuns
  shaftCrossings: number;
  existingCrossings: number;
  existingOverlaps: number;
  offGraphRooms: number;            // trunk.offGraphRoomIds, the "28" type
  noEntryRooms: number;             // area.unreached, the "15" type
  portsLeft: number;
  corridorShare: number;            // length inside route-area rooms / lengthMm, 0..1
  longestPathMm: number;            // longest path from the start port to a target port along the tree
  meanPathMm: number;
  branchLengthSpreadMm: number;     // longest minus shortest start-to-port path of ONE network. A proxy for balance, not a flow or pressure value. Never computed across supply plus return.
  freeLegsShare: number;            // length of free legs / lengthMm
}
export function routeMetrics(input: {
  plan: PlannedRoute; rooms: readonly Room[]; area: RouteArea; mmPerPt: number; pageIndex: number;
  startStampId: string; startPortId: string;
}): RouteMetrics;

// packages/core/src/route-layout.ts or route-presets.md's file: the P1 type, created by P1-T01.
// Q1-T06 only ADDS these optional fields. An absent field means today's behaviour.
export interface RouteLayoutOptions {
  /* fields of P1 (route-layout-presets.md section 4.2) */
  /** Idea 0: add bridge edges between the graph parts. */
  bridgeParts?: { penaltyMm: number };
  /** Idea 1a: price a bend and a fitting in the trunk search. */
  trunkBends?: { bendMm: number; fittingMm: number };
  /** Idea 1b: search for the off-graph links on heading states with a wall price. */
  linkSearch?: { bendMm: number; wallMm: number };
  /** Idea 2: exact Steiner tree in a room for at most maxPorts ports, then a bend-merge pass. */
  exactSpine?: { maxPorts: number };
  /** Idea 4: rip-up and reroute rounds. */
  ripUp?: { rounds: number };
}
// The core seam is planRoute(input, options?: RouteLayoutOptions) (P1-T01). RouteBuildInput gets no new field.
```

Corridor-share and path metrics need the leg origin (trunk, branch, spine, link). `planRoute` does not return that today. Q1-T01 derives it from the geometry (a leg is in the trunk when it lies in a route-area room). If that is too weak, Q1-T01 adds an optional `origin` list to the plan (`PlannedRoute` is not stored, so this is no schema change). The task says which one it chose.

## 5. The score (used by metrics and by idea 3)

One function `scoreRoute(metrics, weights)` returns a number. Lower is better. The first weights (planner values, **not verified**, to be tuned with the user):

| Term | Weight | Reason |
|---|---|---|
| Wall crossing | 3000 mm each | Every crossing is a "penetration, check fire rating" (the model has no wall rating, see Q-Q1-02). Not a free bridge. |
| Open run (gap above 600 mm) | 3000 mm each | Same. |
| Off-graph room | 1500 mm each | A long free duct through other rooms. |
| Bend 90 | 500 mm each (placeholder, tune with a loss table) | Same value as `BEND_PENALTY_MM`. |
| Bend 45 | 250 mm each (placeholder, tune with a loss table) | A 45 degree fitting is cheaper. |
| Fitting | 300 mm each | A tee costs work. |
| Existing crossing | 1000 mm each | Same value as `CROSSING_PENALTY_MM`. |
| Existing overlap | 2000 mm each | Planner value. |
| Free-angle leg | 2000 mm each | The layout rule says free angles are rare. |
| Branch length spread, one network | 0.2 per mm | A proxy for balance. It is computed per network, never across supply plus return. See Q-Q1-01. |
| Length | 1 per mm | Base. |

## 6. How the design keeps the domain rules (`rules.md` section 3)

1. **The segment defines the network type of a port.** Prototypes change only the path geometry. They do not set a network type on a port or a stamp. The join checks stay: `canJoinPoint` (`route-build.ts:247-263`) and `checkInvariant` (`route-build.ts:408`). Every task that adds a prototype runs `checkInvariant` on its output in a test (no `internal-join`, no foreign network joined).
2. **The cascade invariant.** No task changes a network type. A bridge edge (idea 0) and a link (idea 1b) must not end at a foreign fitting or port: the `accepts` test (`route-build.ts:342-346`) stays and a new test builds a case with a foreign segment in the way.
3. **Reuse before new.** The tasks reuse `roomSpine` heading states, `steinerTree`, `crossingsAlongPath`, `checkExisting`. The metrics function reads `PlannedRoute.stats` where the field exists (`route-build.ts:48`) and adds only the missing numbers. The layout options are one object (`RouteLayoutOptions` of P1), not a copy of the planner and not a second candidate list.
4. **The adoption trap.** No task sets a `networkTypeId` on a drawing. The apply path (`scene.applyRoute`) is not touched.
5. **DOM wiring.** Q1 changes no input. The one browser check (Q1-T15) drives the existing Route dialog through the real inputs. The scene API is used for set-up and to read the result only.
6. **Merge lesson.** After a merge of Q1 with R7 or with the UI plans, run `pnpm build` at the root.

R7 work (the files `circuit-plan.ts`, `RoomScopeList.tsx`, and the edit of `RouteDialog.tsx` in the worktree `agent-framework`) is not touched. Q1 edits `route-build.ts`, `route-trunk.ts`, `route-topology.ts`, `route-hanan.ts` and `route-branch.ts` in core only. Not verified: whether R7 edits the same core files. The director checks `git status` of the R7 worktree before the first merge.

## 7. Phases and tasks

Size: S = under 60 changed lines, M = 60 to 150, L = more (split it). Every task ends with the core tests green. A task that changes `packages/core` also ends with `pnpm build` (root) green. `pnpm build` is not needed for a plan-only task.

Order (P1-T01 must be done before Q1-T06): T01 > T02 > T03 > T04 > T05, T06 (T05 and T06 are independent) > T07 to T12 (each needs T04 and T06, they are independent of each other, run them in the order listed) > T13 > T14 > T15 > T16.

### Phase A. Measure (no change of the result)

#### Q1-T01. Metrics module [M]
- Files: `packages/core/src/route-metrics.ts` (new), `route-metrics.test.ts` (new), `packages/core/src/index.ts` (one export line).
- Shapes: `RouteMetrics`, `routeMetrics(...)` (section 4), `scoreRoute(metrics: RouteMetrics, weights?: ScoreWeights): number`, `DEFAULT_SCORE_WEIGHTS` (section 5).
- Work: reuse `plan.stats` (`route-build.ts:48`) for segments, fittings, bends, free legs, crossings. Add: length by part, fittings by kind, shaft crossings, open runs (from `crossingsAlongPath`), corridor share, path lengths from the start along the planned tree (walk the segments from the start port, as `walk` in `route-run.test.ts:112`), spread.
- Must not touch: `planRoute`, the dialog, the stored model.
- Verification: core tests. A hand-built plan of 3 legs gives exact numbers (length, 2 bends, 0 crossings). A plan with one wall crossing gives `wallCrossings` 1. The metrics of the first-floor plan agree with `plan.stats` for the shared fields (equal). `pnpm build`.
- Depends on: none.

#### Q1-T02. Scenarios and the report test [M]
- Files: `packages/core/src/route-scenario.testutil.ts` (new, test helper, excluded from the build like `route-area-fixture.testutil.ts`; `packages/core/tsconfig.json:8`), `packages/core/src/route-quality.test.ts` (new).
- Work: move the set-up of `route-run.test.ts:12-110` (start stamp, one terminal per served room, `runPlan`) into the helper without a change of behaviour. Do not edit `route-run.test.ts` in this task (it keeps its own copy until Q2; the copy is a risk, see section 8). Add scenario B: four ports in each room, on a deterministic inset grid inside the room polygon (not verified: a helper for this may exist in the Auto-place code. The task searches `packages/core/src` for it first and reuses it; rule 3). The test prints one table per scenario with the metrics of section 4 and the score.
- Must not touch: product code.
- Verification: core tests. The scenario A numbers equal section 2.5 (109, 76, 151 366, 35, 10, 26, 28). `pnpm build`.
- Depends on: T01.

#### Q1-T03. The 10A fixture, local only [S]
- Files: `scripts/export-route-area-fixture.mjs` (take the source PDF, the scale and the output path as arguments; the default stays the first floor), `.gitignore` (add the line `packages/core/fixtures/route-area/local/`). Checked 2026-10-25: `git check-ignore -v packages/core/fixtures/route-area/local/10A-rooms.json` returns nothing, so no rule covers it today.
- Work: export the rooms of `fixtures/pdfs/plattegrond begane grond 10A.pdf` to `packages/core/fixtures/route-area/local/10A-rooms.json`. The scale of the 10A drawing is 1:100 (R6 plan, example of section 1); not verified in the code, read it from `r6-check.mjs`. `route-quality.test.ts` runs the 10A scenarios when the file exists and prints "SKIP" when it does not.
- Must not touch: the tracked first-floor JSON. Never commit the 10A PDF or its JSON (`rules.md` section 2).
- Verification: run the script (needs `pnpm build`, the script header says so). The 10A scenario runs and prints its table. `git check-ignore -v packages/core/fixtures/route-area/local/10A-rooms.json` prints the new rule. `git status` shows no 10A file.
- Depends on: T02.

#### Q1-T04. Baseline table, determinism and runtime [M]
- Files: `packages/core/src/route-quality.test.ts` (extend), this plan (fill section 10 "Baseline table").
- Work: measure scenarios A and B on the first floor and on 10A (if present), for **three start rooms** each (the largest corridor room and the two next ones; this answers the question of section 2.3). Write the table into section 10.
  - Determinism: (a) run `planRoute` twice in one process and compare with `toEqual`; (b) run it with the rooms, the stamps and the target ports in a shuffled order (a fixed shuffle, no `Math.random`) and compare; (c) run the report in two separate Node processes and compare a hash of the plan JSON. The ids come from the factories `newSegmentId` and `newFittingId` of `RouteBuildInput`. No reset function exists in core (checked: the only counter is the module variable `idCounter` at `route-run.test.ts:80`). So the helper of T02 exports `makeIdFactories()`, which returns a fresh pair that starts at 0. Each run calls it. T02 adds this function.
  - Runtime: 2 warm-up runs, then the median and the maximum of 7 runs, from `performance.now()`.
- Must not touch: product code. If (a), (b) or (c) fails, stop and report: that is a defect in the planner, not in the test.
- Verification: core tests. The table is in section 10. The determinism tests pass. Runtime numbers are in the table. `pnpm build`.
- Depends on: T02 (T03 for the 10A column).

#### Q1-T04b. Make `route-quality.test.ts` fast by default [S]
- Files: `packages/core/src/route-quality.test.ts`.
- Work: after T04 the file took about 320 s and the core suite about 400 s. A normal core test run must stay fast. The default run of the file must finish in under 30 s. Only the time when each assertion runs changes. No assertion is removed.
  - The D3 hash probe (two child Node processes) runs only when `MEPAPP_QUALITY_FULL=1`.
  - The shuffled plans are built inside their tests, not at collection time.
  - The default run uses scenario A only for the determinism checks and the baseline rows, and fewer runtime runs. Scenario B (except the first floor check) and the full runtime table run only with `MEPAPP_QUALITY_FULL=1`.
- Must not touch: planner code. The `KNOWN_D2_DEFECTS` list stays as it is.
- Verification: the default run time of the file, the full run with `MEPAPP_QUALITY_FULL=1`, and the whole core suite (under 2 minutes).
- Depends on: T04.

#### Q1-T05. Defect catalogue from the user screenshots [S]
- Files: this plan (section 11), no code.
- Work: when the user sends 2 or 3 screenshots (section 8, request R-Q1-01), look at each one and write: what is wrong in plain words (long free duct through rooms, many bends, tap too close, parallel runs, route leaves the corridor, other). Link each defect to the metric that would show it. If a defect has no metric, add the metric to T01 (a note to the director). Until the screenshots arrive, the section lists the defects that the metrics already show (the 28 off-graph rooms, the 26 wall crossings).
- Verification: the section lists one defect for each screenshot with a metric name. No code check.
- Depends on: none (it runs when the screenshots arrive). T14 needs it.

#### Q1-T06. Prototype fields in `RouteLayoutOptions` [S]
- Files: the file that P1-T01 makes for `RouteLayoutOptions` (add the optional fields of section 4; `DEFAULT_LAYOUT_OPTIONS` stays equal to today), `route-build.ts` (pass the options to `buildTrunk`, `planBranches`, `connectLoosePorts`; no use yet), `route-build.test.ts`. No field on `RouteBuildInput`.
- Must not touch: any default behaviour. No change of `BEND_PENALTY_MM` or `CROSSING_PENALTY_MM`.
- Verification: core tests. A test runs scenario A with `options` absent, with `{}` and with `DEFAULT_LAYOUT_OPTIONS`, and checks `toEqual` with the T04 baseline JSON (committed as `packages/core/fixtures/route-quality/baseline-first-floor-a.json`). `pnpm build`. `git diff --stat` shows no other file.
- Depends on: T04 (the baseline JSON) and P1-T01 (`route-layout-presets.md`: the type and the second argument of `planRoute`). If P1-T01 is not done, the director runs P1-T01 first. Q1 does not make its own type.

### Phase B. Prototypes (each one off by default)

Each prototype task has the same closing steps: (1) add its numbers to section 10 (the "Prototype results" table, one row for the first floor and one for 10A, scenarios A and B); (2) a test that the output with the option off still equals the baseline JSON; (3) `checkInvariant` and `internal-join` tests as in section 6, rules 1 and 2; (4) the determinism test (a) and (b) of T04 with the option on; (5) the runtime median with the option on. The order below follows the expected gain. T04 may change the order (the director decides).

#### Q1-T07. Idea 0, join the graph parts [M]
- Why: 13 rooms with an entry are off graph only because the corridors are in other graph parts (section 2.3).
- Files: `packages/core/src/route-trunk.ts` (build bridge edges before the tree), `route-graph.ts` (helper that finds, for two parts, the nearest pair of nodes or edge points; reuse `nearestOnEdges` and `splitEdgeAt`), tests.
- Shape: `options.bridgeParts = { penaltyMm }`. A bridge edge has id `rb-<n>`, cost = its length + `penaltyMm`, kind `link`. It joins the nearest points of two parts. The steiner tree then decides whether to use it. A bridge must not be used when the straight leg passes a foreign item (reuse the `accepts` test); the check is a parameter of `buildTrunk`.
- Output: a bridge leg becomes an ordinary trunk leg, and `crossingsAlongPath` counts its walls.
- Must not touch: `computeRouteArea` (the R4 area stays as it is; the user saw it in the "Show route area" overlay).
- Verification: core tests (a hand-built area with two parts and one room in the second part: baseline marks the room off graph, the prototype serves it through a bridge with penalty; with a huge penalty the result equals the baseline). Table: off-graph rooms and wall crossings on the first floor; must be reported even if worse. Open question Q-Q1-02 sets the default penalty.
- Depends on: T06.

#### Q1-T08. Idea 1a, bends and fittings in the trunk search [M]
- Files: `packages/core/src/route-steiner.ts` (a second function `steinerTreeWithTurns` that searches on heading states; the old function stays), `route-trunk.ts`, tests.
- Shape: `options.trunkBends = { bendMm, fittingMm }`. The cost of an edge is its length. A turn at a node adds `bendMm` (the angle between the last leg of the incoming edge and the first leg of the next edge, from the graph polyline). A node of degree 3 or more in the tree adds `fittingMm`. This is an approximation: the real bends appear after `straightenPolyline`. Task note: compare the counted bends with `bends90 + bends45` of the final plan and report the difference.
- Reuse: the heap from `route-hanan.ts:37-93` (move it to a shared file `route-heap.ts`, exported, no change of behaviour; the move is part of this task and its test is the unchanged `route-hanan.test.ts`).
- Verification: core tests (a graph where the shortest path has 3 turns and a slightly longer one has 1: baseline picks the short one, the prototype the long one; with `bendMm` 0 the result equals `steinerTree`). Table: bends, fittings, length.
- Depends on: T06.

#### Q1-T09. Idea 1b, a search for the off-graph links [M]
- Files: `packages/core/src/route-link.ts` (new), `route-topology.ts` (call it from `connectLoosePorts` when its option is set), tests.
- Shape: `options.linkSearch = { bendMm, wallMm }`. For one loose port, build a grid from the lines through the port, the tap candidates, and the corner points of the rooms between them (the corner lines are new: they let the duct run along a wall instead of through it). Search on heading states (shared heap). The cost of a grid edge = length + `bendMm` per turn + `wallMm` per wall crossing of that edge (sampled with the same step as `crossingsAlongPath`, 100 mm). Targets: any point of the built route (a leg point, not only a vertex). Tie-break: lower node index. The `accepts` test of `route-build.ts:342-346` stays.
- Fallback: when the search finds no path, the old L-shape is used.
- Verification: core tests (a port behind a wall with an opening: the L-shape crosses the wall, the search goes through the opening when `wallMm` is large; with `wallMm` 0 and `bendMm` 0 the length is not longer than the L-shape). Table: wall crossings, bends, length, runtime (the grid may be large: report the max runtime).
- Depends on: T06, T08 (shared heap).

#### Q1-T09b. Split the bends by leg origin [S] (measure only)
- Why: Q1-T07 (`bridgeParts`) cuts the off-graph rooms from 28 to 15 on the first floor, but the 90 degree bends rise from 35 to 62 and the length by 17.5 %. Q1-T08 changed nothing. Q1-T09 removed 4 of the 27 extra bends. The part of the plan that makes the extra bends is not known.
- Files: `packages/core/src/route-build.ts` (an optional third argument `trace?: RouteTrace` of `planRoute`; with no trace the code does the same as before), `packages/core/src/route-origin.ts` (new, `splitByOrigin`), `packages/core/src/route-origin-report.test.ts` (new).
- Origins: `trunk` (start elbow and trunk edges), `bridge` (edge id `rb-`), `branch` (trunk to room entry), `spine` (room path inside the room), `link` (off-graph connection, `connectLoosePorts`).
- Rules of the split: a plan segment takes its length from the trace legs that cover it, in trace order (a segment can span two paths, because `buildRouteItems` merges collinear legs). A fitting belongs to the origin of highest rank among the paths that have a vertex at the fitting (rank order: trunk, bridge, branch, spine, link). A bend is an elbow fitting of 90 or 45 degrees.
- Verification: the plan with a trace equals the plan without a trace (JSON text); the sums of the split equal `plan.stats` (length within 1 mm, fittings, bends); no unassigned segment or fitting. Result: section 10, "Split of the bends by leg origin".
- Depends on: Q1-T07, Q1-T09.

#### Q1-T10. Idea 2, exact Steiner tree in a room [M]
- Files: `packages/core/src/route-exact.ts` (new), `route-hanan.ts` (call it when `ports.length <= maxPorts`), tests.
- Shape: `options.exactSpine = { maxPorts }`. Dreyfus-Wagner on the same Hanan grid and the same blocked edges as `roomSpine`. The entry is the root terminal. Ports are leaves: no merge and no pass at a port node. The result is the shortest length. A second step, the bend-merge pass, slides a leg onto a parallel leg of the same tree when the length stays equal and the number of bends goes down. If the exact tree has more bends than the heuristic tree for the same length, the tie goes to fewer bends. The old heuristic stays for more than `maxPorts` ports and as the check in tests.
- Verification: core tests (4 ports in a square room: the exact length is not above the heuristic length for 200 random but fixed-seed layouts; the ports stay leaves; the result is deterministic). Table: room length sum (scenario B), bends.
- Depends on: T06, T08 (heap).

#### Q1-T11. Idea 3, a score and candidate layouts [M]
- Files: `packages/core/src/route-candidates.ts` (new), tests.
- Shape: `planBestRoute(input: RouteBuildInput, candidates: readonly RouteLayoutOptions[], weights?: ScoreWeights): { best: number; results: { options: RouteLayoutOptions; plan: PlannedRoute; metrics: RouteMetrics; score: number }[] }`. The list type is the same as the P1 preset table (`ROUTE_PRESETS[].options`). P1 owns the preset list. Q1-T11 owns the scoring only and makes no second candidate list. The function calls `planRoute(input, options)` once per candidate, in the given order, and picks the lowest score. A tie goes to the lower index. It uses `routeMetrics` and `scoreRoute` from T01.
- This is the base of the presets in `route-layout-presets.md`: report that plan the shape (it can become the preset table).
- Verification: core tests (two fake candidates with known scores; the lower one wins; equal scores pick the first). Table: the score of each of the 4 candidate sets (baseline, bridge, bridge + link search, all) on the first floor and 10A. Total runtime of 4 candidates (must stay under the limit of Q-Q1-08).
- Depends on: T07, T08, T09, T10 (it needs at least two real candidates; if one of them was dropped, use those that exist).

#### Q1-T12. Idea 4, rip-up and reroute [M]
- Files: `packages/core/src/route-ripup.ts` (new), tests.
- Shape: `options.ripUp = { rounds }`. After the first plan, find the rooms (branch + spine) whose paths have an existing crossing, an overlap, or a wall crossing in the link. For each one, in room id order, remove it and plan it again with `crossesExisting` extended by the other new paths of the same plan and with a history price that grows by 500 mm per round on the spots that were bad. At most `rounds` rounds (default 3). Stop early when a round changes nothing.
- Fit: today the plan has 0 existing crossings on the first floor (section 2.5), so the gain is not visible there. The task builds a test drawing with foreign segments in the corridor. It reports the 10A result.
- Verification: core tests (a foreign segment across the only direct line: the first plan crosses it, the rip-up plan crosses it fewer times or not at all; the result is deterministic; with `rounds` 0 the result equals the baseline). Table: existing crossings, length, runtime.
- Depends on: T06.

#### Q1-T13. Idea 5, spike: is a better region test needed? [S]
- Files: this plan (section 10), a measuring test only.
- Work: measure how well the trunk is centred and how often the region test fails: the number of free edges (`trunk.freeEdges`, `route-trunk.ts:207`), the share of trunk samples that lie closer than 150 mm to a corridor wall, the number of trunk legs shorter than 300 mm. If all three are small, write "idea 5 is not needed now" in section 10. If not, write an estimate (size L) and the licence-safe method (our own polygon offset by a distance; no CGAL, no libavoid).
- Verification: the numbers are in section 10. No product code.
- Depends on: T04.

### Phase C. Compare and decide

#### Q1-T14. Comparison table [S]
- Files: this plan (section 10).
- Work: one table: baseline, each prototype alone, the combination chosen by the scores, on the first floor and 10A, scenarios A and B. Columns: the metrics of section 4, the score, the runtime median, determinism pass/fail. Mark each acceptance number of section 8 as met or not. Add the defect catalogue (T05): which prototype fixes which defect.
- Verification: the table is complete. Every cell has a number or "not measured because ...".
- Depends on: T05, T07 to T13.

#### Q1-T15. Browser check and screenshots [M]
- Files: `.claude/roadmap/browser/q1-check.mjs` (new; copy the shape of `r6-check.mjs`), no product code.
- Work: the check opens the first floor PDF, detects rooms, places the start stamp and the terminals (the set-up of `r6-check.mjs`), opens the Route dialog, and for each variant passes the layout through the scene request field `layout` (P1-T09) and reads the plan. Variants: baseline, best combination. It types into the real dialog fields for the start and the target, as `rules.md` section 3 rule 5 asks. It takes a screenshot of the preview for each variant.
- Screenshots (names `Q1-T15-<name>`, uploaded to the dashboard right after the task): `Q1-T15-first-floor-baseline`, `Q1-T15-first-floor-best`, `Q1-T15-10A-baseline`, `Q1-T15-10A-best` (10A: local only, do not commit; upload to the dashboard only).
- Verification: `node .claude/roadmap/browser/with-server.mjs <work>/q1-check.mjs` prints 0 failed. The off-graph warning count in the dialog equals the metric of the prototype. One Chromium page at a time.
- Depends on: T14 and **P1-T09** (the scene field `layout?: RoutePresetId | RouteLayoutOptions` on `RouteRequest`). Until P1-T09 is done, Q1-T15 may use the debug path (Q-Q1-04 B, a hidden call behind the flag `mepapp.debugTools`) and the director says so in the report. Without both, the browser shows only the baseline and the table comes from core tests.

#### Q1-T16. Decision gate and hand-over [S]
- Files: this plan (status table), the road map dashboard.
- Work: post the table and the four screenshots on the dashboard. Ask the user which ideas become the default. Write the plan Q2 for the chosen ideas (size, order). Mark Q1 done in the status table with the commit hashes.
- Verification: the dashboard has the table and the screenshots. The user has answered.
- Depends on: T15.

## 8. Acceptance numbers, determinism and runtime

Proposed (the user can change them, question Q-Q1-03). All numbers are on scenario A and B of the first floor, and on 10A when the file exists. "Baseline" is the table of section 10.

| Id | Rule | Why |
|---|---|---|
| A1 | A prototype is **accepted** when, against the baseline, it lowers the score of section 5 by at least 10 %. No single metric may get worse by more than 2 %: ports left, free-angle legs, existing crossings. Length is the exception: A3 overrides A1 for length. | A fix for one defect must not hide a new one. |
| A2 | The best combination lowers off-graph rooms from 28 to 14 or fewer, **or** wall crossings from 26 to 18 or fewer, on the first floor scenario A. **Fewer crossings alone is not enough**: the wall crossings must not rise when off-graph rooms fall, and the model has no wall rating (Q-Q1-02), so every crossing counts as "penetration, check fire rating". Idea 0 must never choose a wall as a free bridge. | The two numbers the user can see in the dialog. A route that avoids a crossing by a longer detour through a rated wall opening is not scored better by this number alone. |
| A3 | Length may grow by at most 10 % when it lowers off-graph rooms or wall crossings. A3 overrides the length part of A1 (A1 allows 2 %). | A longer duct that avoids a wall is a fair trade. |
| A4 | Free-angle legs stay 0 on the first floor. `internal-join` never appears. `checkInvariant` returns no id. | Layout rule of R6 and domain rules 1 and 2. |
| D1 | Two runs in one process: `toEqual`. | Determinism. |
| D2 | Shuffled input order: `toEqual` of the plan geometry (ids may differ only through the counters, so the test compares the geometry and the kinds). | The planner must not depend on the input order. |
| D3 | Two Node processes give the same hash of the plan JSON. | Catches a hidden global state. |
| D4 | No `Math.random`, no `Date`, no `Map` iteration that depends on a insertion order of unsorted input. A test greps the new files for `Math.random` and `Date.now`. | The same input gives the same output. |
| T1 | `planRoute` with one prototype on: median at most 300 ms on the first floor and on 10A (median of 7 runs after 2 warm-up runs). | The dialog waits 300 ms before it plans (`auto-routing-r6.md` P-R6-PREVIEW). The test limit today is 500 ms (`route-run.test.ts:195`). |
| T2 | Four candidates (T11) at most 1200 ms in total, one macrotask each in the UI. | A worker is not needed below this (feedback prompt, presets findings). |

Risks of these numbers: the 10 %, 14 and 18 limits are planner choices, not from a source. The first-floor input has one port in each room, which is easy. Scenario B (four ports) and 10A are the harder checks.

## 9. Open questions (the user decides; the planner recommends)

Each question has options A, B and C and a recommendation. None blocks T01 to T06.

- **Q-Q1-01. What counts most in "good from an engineering view"?** Needed for the weights of section 5.
  - A. Wall crossings and off-graph rooms first, then bends and fittings, then length.
  - B. Length and bends first (the cheapest installation).
  - C. Balance of branch lengths first, per network (a proxy only, not a flow or pressure value).
  - **Recommend A.** It matches the two warnings the user sees in the dialog (`room-off-graph`, `wall-crossings`) and the fire rule. C is a later metric for sizing. Not verified: what the user means. The screenshots (R-Q1-01) will show it.
- **Q-Q1-02. May the trunk cross a wall to join two corridor parts (idea 0)? And how do rated (fire) walls count?** The model has no door data and no wall rating (not verified: no door or rating object is in `packages/core`). A bridge is a wall crossing that the planner chooses. Until a rating exists, every crossing is called "penetration, check fire rating". The planner never treats a wall as a free bridge.
  - A. Yes, with a price (`penaltyMm` 3000). The dialog counts every bridge as a wall penetration with the hint "check fire rating", as for any other crossing.
  - B. No. The off-graph links stay the only crossing.
  - C. Yes, but only through walls that are known not to be rated. This needs wall rating data that does not exist. It is a separate part (data model, not in Q1).
  - **Recommend A.** A trunk with taps looks like an engineer's layout. A long free link does not. The user keeps control because the dialog counts and flags each penetration. C is right in the end, but it needs new data. A2 does not reward fewer crossings alone.
- **Q-Q1-03. Which acceptance numbers?**
  - A. Section 8 as written.
  - B. Stricter: score down 20 %, off-graph rooms 10 or fewer.
  - C. No limits. Only report the numbers.
  - **Recommend A.** The limits are easy to change after the first table. C does not give a stop rule.
- **Q-Q1-04. How does the layout option reach the UI?** [no data model] The core seam is fixed: `planRoute(input, options?: RouteLayoutOptions)` of P1 (director decision 2026-10-25). The scene seam is fixed too: the field `layout` on `RouteRequest`, made in P1-T09. The question is only what the user sees.
  - A. Core only. The browser check shows the baseline and a core table. Q2 wires the UI.
  - B. Use the P1-T09 field `layout` with a hidden entry behind the debug flag `localStorage mepapp.debugTools` (memory: reference-debug-tools-flag). Until P1-T09 exists, no UI.
  - C. Wait for the preset chips of P1 (P1-T11 to P1-T13) and show the prototypes as presets. This is the longest wait.
  - **Recommend B.** It lets the user see the prototypes in the real app on Windows once P1-T09 is done (about 30 lines, `route-layout-presets.md`). C blocks Q1 on the P1 UI. The R7 work edits `RouteDialog.tsx` (uncommitted in `agent-framework`), so the director must merge with care.
- **Q-Q1-05. Is 10A a local-only case?**
  - A. Yes. Its numbers go in the table and on the dashboard, never in git or in CI.
  - B. Make a small public drawing as a second fixture.
  - C. Do not use 10A.
  - **Recommend A.** `rules.md` section 2 forbids the commit of an ignored PDF. B costs time. First floor alone has one very shallow corridor graph.
- **Q-Q1-06. Do the prototypes wait for the user screenshots (R-Q1-01)?**
  - A. Wait. Do T01 to T06 first, then pause.
  - B. Go on with T07 to T13 on the metrics. T14 waits for the screenshots.
  - C. Do not wait. Skip T05.
  - **Recommend B.** The metrics already show two big problems (28 and 26). The screenshots may change the order and the weights, so the final choice (T14) waits for them.
- **Q-Q1-07. Do idea 5 (exact region tests, graph from wall corners) now?**
  - A. Only the spike T13. Build it later if the numbers ask for it.
  - B. Build it in Q1 as a prototype.
  - C. Never.
  - **Recommend A.** The first floor has no free trunk edges today (0 free-angle legs, section 2.5), so the gain is not shown. Size is L.
- **Q-Q1-08. How long may one plan take?**
  - A. 300 ms for one plan, 1200 ms for four candidates (section 8).
  - B. 150 ms (as today).
  - C. 1000 ms for one plan, with a worker.
  - **Recommend A.** The dialog waits 300 ms before it plans, so one plan up to 300 ms keeps the preview calm. A worker is a large change with no need yet.

Request to the user:
- **R-Q1-01. Please send 2 or 3 screenshots of routes you dislike.** For each one, tell me in one line what is wrong, and which drawing, start stamp and network type you used. Photos of the screen are fine. The planner puts them in section 11 and picks the metrics that must show the defect. Please send them through the road map dashboard. Please also say if one of them is on the first floor drawing (then I can reproduce it).

## 10. Results (to be filled by the tasks)

### Baseline table (T04)

Measured on 2026-10-26 by `route-quality.test.ts` (task Q1-T04, branch `worktree-routing-feedback`). Start k is the k-th largest corridor room (start 0 is the largest). Scenario A has one port in each served room. Scenario B has four ports in each served room. Runtime is the median and the maximum of 7 runs after 2 warm-up runs. The score is the score of section 5 with the default weights.

| Scenario | Start | Segments | Fittings | Length mm | Bends 90 / 45 | Wall crossings | Off-graph rooms | No-entry rooms | Ports left | Score | Median ms | Max ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| First floor A | 0 (room-0) | 109 | 76 | 151 366 | 35 / 10 | 26 | 28 | 15 | 0 | 263 044 | 69 | 98 |
| First floor A | 1 (room-31) | 97 | 64 | 150 978 | 31 / 2 | 26 | 30 | 15 | 0 | 261 550 | 42 | 44 |
| First floor A | 2 (room-32) | 98 | 65 | 153 079 | 30 / 4 | 28 | 30 | 15 | 0 | 259 342 | 44 | 52 |
| First floor B | 0 (room-0) | 309 | 184 | 269 867 | 60 / 10 | 31 | 28 | 15 | 1 | 430 531 | 1 994 | 3 833 |
| First floor B | 1 (room-31) | 298 | 173 | 271 968 | 58 / 2 | 28 | 30 | 15 | 1 | 437 627 | 2 175 | 3 707 |
| First floor B | 2 (room-32) | 293 | 168 | 264 828 | 51 / 4 | 39 | 30 | 15 | 1 | 420 412 | 1 637 | 2 107 |
| Ground floor w_rooms A (local-only) | 0 (room-34) | 141 | 98 | 207 563 | 47 / 10 | 33 | 33 | 33 | 0 | 342 577 | 105 | 109 |
| Ground floor w_rooms B (local-only) | 0 (room-34) | 436 | 264 | 387 830 | 93 / 10 | 53 | 33 | 33 | 0 | 605 612 | 8 449 | 10 508 |
| 10A A (local-only) | 0 (room-18) | 95 | 68 | 210 331 | 27 / 16 | 18 | 19 | 13 | 0 | 305 976 | 41 | 51 |
| 10A A (local-only) | 1 (room-31) | 70 | 43 | 178 304 | 17 / 0 | 16 | 26 | 13 | 0 | 273 035 | 26 | 28 |
| 10A B (local-only) | 0 (room-18) | 265 | 160 | 333 449 | 45 / 16 | 22 | 19 | 13 | 0 | 478 449 | 1 074 | 1 081 |
| 10A B (local-only) | 1 (room-31) | 262 | 157 | 312 354 | 55 / 0 | 28 | 26 | 13 | 0 | 469 471 | 941 | 1 019 |

Notes:
- The ground floor w_rooms and 10A rows are local-only numbers. Their PDFs and fixtures are not in git (`rules.md` section 2). The test prints "SKIP" when the fixtures are missing.
- The ground floor w_rooms has only one corridor room, so only start 0 exists. 10A has two corridor rooms, so start 2 does not exist. The test skips these starts.
- The first floor start 0 agrees with section 2.5 (109, 76, 151 366, 35 / 10, 26, 28).
- Answer to the question of section 2.3: the off-graph count depends on the start. On the first floor it is 28 for start 0 and 30 for starts 1 and 2. On 10A it is 19 for start 0 and 26 for start 1. The no-entry count (15 on the first floor, 13 on 10A) does not depend on the start. On the ground floor w_rooms all 33 rooms are off-graph and all 33 have no entry.
- Runtime against limit T1 (300 ms): scenario A is below the limit in all rows (26 ms to 105 ms). Scenario B is far above it: 941 ms to 2 175 ms on the first floor and 10A, and 8 449 ms on the ground floor w_rooms. Limit T1 can hold for scenario A only. The decision gate must decide this. The machine was shared with other work, so the times vary.
- Scenario B leaves 1 port unreached on the first floor (`Ports left` = 1).
- These times come from the full mode (2 warm-up runs and 7 runs, `MEPAPP_QUALITY_FULL=1`). The default mode of the test uses 1 warm-up run and 3 runs, to save time. The test file still takes about 5 minutes in the default mode. The two child processes of D3 (about 2 minutes) and the shuffled plans built at collection time use most of that time. A later task can move the D3 probe to its own small test file.

### Determinism (T04)

| Check | Result |
|---|---|
| D1. Two runs in one process: `toEqual` of the full plan, ids included | Pass on all drawings, A and B. |
| D2 (counts). Shuffled input order (seeds 1 and 2): same counts of segments, fittings, bends and wall crossings, same off-graph count, same warning codes, length within 0.1 % | Pass on all drawings, A and B. |
| D2 (geometry). Shuffled input order (seeds 1 and 2): same geometry, same endpoints, same sizes | **Fails in 4 cases**: first floor A seed 1, first floor B seed 1, first floor B seed 2, 10A B seed 2 (local-only). Passes in all other cases. |
| D3. Two Node processes: same hash of the plan JSON | Pass (first floor A and B). |

Defect found: the plan depends on the input order of the rooms, stamps and ports. On the first floor A and B (seed 1) the first difference is a shift of 0.108 pt in one path point (sorted segment 70 in A). On first floor B seed 2 a non-geometry field of sorted segment 56 differs. On 10A B seed 2 the planner picks another terminal port of the same room (`term-room-30-0` against `term-room-30-2`) with equal geometry. The counts stay equal. The tests for these 4 cases are marked `it.fails` (list `KNOWN_D2_DEFECTS` in `route-quality.test.ts`), so each turns red when somebody fixes its defect. T04 does not change product code. The director decides if a task must remove this order dependence before the prototypes are compared. The cause is not found (not verified).

### Prototype results (T07 to T13)

To be filled by each task: one row per prototype and drawing, same columns as the baseline, plus "acceptance A1 met" and "determinism D1 to D3".

#### Idea 0, join the graph parts (Q1-T07, measured 2026-10-26)

Option: `bridgeParts = { penaltyMm }`. Test: `route-bridge-report.test.ts`, full mode (`MEPAPP_QUALITY_FULL=1`: 2 warm-up runs, 7 runs). "off" is the baseline. "on" is `penaltyMm` 0. The result with `penaltyMm` 3000 is equal to the result with 0 in every row, so only one "on" row is shown. Crossings in this table are **penetrations to check** (the model has no wall rating). The bridge has no price for a crossing (answer Q-Q1-02). The count is a metric only.

| Scenario | Start | Option | Segments | Length mm | Bends 90 / 45 | Wall crossings (penetrations to check) | Off-graph rooms | Ports left | Free legs | Score | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| First floor A | 0 | off | 109 | 151 366 | 35 / 10 | 26 | 28 | 0 | 0 | 263 044 | 59 |
| First floor A | 0 | on | 147 | 177 907 | 62 / 21 | 29 | 15 | 0 | 0 | 291 169 | 83 |
| First floor A | 1 | off | 97 | 150 978 | 31 / 2 | 26 | 30 | 0 | 0 | 261 550 | 52 |
| First floor A | 1 | on | 146 | 177 761 | 63 / 18 | 27 | 15 | 0 | 0 | 287 978 | 74 |
| First floor A | 2 | off | 98 | 153 079 | 30 / 4 | 28 | 30 | 0 | 0 | 259 342 | 42 |
| First floor A | 2 | on | 145 | 176 939 | 62 / 18 | 28 | 15 | 0 | 0 | 288 998 | 77 |
| First floor B | 0 | off | 309 | 269 867 | 60 / 10 | 31 | 28 | 1 | 0 | 430 531 | 1 963 |
| First floor B | 0 | on | 335 | 306 891 | 78 / 21 | 38 | 15 | 1 | 0 | 461 007 | 2 066 |
| First floor B | 1 | off | 298 | 271 968 | 58 / 2 | 28 | 30 | 1 | 0 | 437 627 | 1 645 |
| First floor B | 1 | on | 339 | 309 241 | 84 / 18 | 36 | 15 | 1 | 0 | 464 552 | 2 055 |
| First floor B | 2 | off | 293 | 264 828 | 51 / 4 | 39 | 30 | 1 | 0 | 420 412 | 1 732 |
| First floor B | 2 | on | 339 | 310 202 | 84 / 18 | 36 | 15 | 1 | 0 | 467 522 | 2 058 |
| Ground floor w_rooms A (local-only) | 0 | off | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 0 | 342 577 | 177 |
| Ground floor w_rooms A (local-only) | 0 | on | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 0 | 342 577 | 167 |
| Ground floor w_rooms B (local-only) | 0 | off | 436 | 387 830 | 93 / 10 | 53 | 33 | 0 | 0 | 605 612 | 7 891 |
| Ground floor w_rooms B (local-only) | 0 | on | 436 | 387 830 | 93 / 10 | 53 | 33 | 0 | 0 | 605 612 | 9 635 |
| 10A A (local-only) | 0 | off | 95 | 210 331 | 27 / 16 | 18 | 19 | 0 | 0 | 305 976 | 72 |
| 10A A (local-only) | 0 | on | 114 | 226 122 | 41 / 20 | 20 | 13 | 0 | 0 | 319 693 | 112 |
| 10A A (local-only) | 1 | off | 70 | 178 304 | 17 / 0 | 16 | 26 | 0 | 0 | 273 035 | 41 |
| 10A A (local-only) | 1 | on | 115 | 225 481 | 38 / 24 | 20 | 13 | 0 | 0 | 319 192 | 66 |
| 10A B (local-only) | 0 | off | 265 | 333 449 | 45 / 16 | 22 | 19 | 0 | 0 | 478 449 | 2 202 |
| 10A B (local-only) | 0 | on | 271 | 356 917 | 47 / 22 | 25 | 13 | 0 | 0 | 483 170 | 1 583 |
| 10A B (local-only) | 1 | off | 262 | 312 354 | 55 / 0 | 28 | 26 | 0 | 0 | 469 471 | 1 406 |
| 10A B (local-only) | 1 | on | 271 | 356 160 | 44 / 26 | 24 | 13 | 0 | 0 | 479 850 | 1 071 |

Reading of the table:
- The option does what it should. Off-graph rooms fall from 28 or 30 to 15 on the first floor, and from 19 or 26 to 13 on 10A. The remaining count is equal to the no-entry count (15 and 13), so every room that has an entry is now reached by the trunk. The option cannot go below that count.
- The cost is high. On the first floor scenario A start 0, the length grows by 17.5 % (151 366 to 177 907 mm), the bends 90 grow from 35 to 62, and the penetrations to check grow from 26 to 29. The score of section 5 rises by 10.7 % (it is worse, because the extra length and bends cost more than the 13 rooms that leave the off-graph list). On 10A start 0 the score rises by 4.5 % and the length by 7.5 %.
- Acceptance (section 8), first floor A start 0: A2 is **not met** (off-graph rooms 15, the limit is 14 or fewer; penetrations to check rose, the limit is 18 or fewer). A3 is **not met** (length +17.5 %, the limit is +10 %). A1 is **not met** (the score does not fall by 10 %). A4 is met (free legs 0, no `internal-join` in the test). T1 is met in scenario A (median 83 ms, limit 300 ms). T1 is not met in scenario B (2 066 ms), which equals the baseline problem (1 963 ms off).
- The ground floor w_rooms drawing does not change: it has no entry at all (33 rooms with no entry), so no bridge can serve a room.
- `penaltyMm` 3000 gives the same plan as 0 in all rows. A price on a bridge does not change the choice. The cause is not examined (not verified).
- Determinism D1 (two runs, `toEqual`) passes with the option on in all rows. D2 and D3 with the option on are not measured.
- Ports left in scenario B (1 on the first floor) are the same with the option on and off.
- A bridge elbow is rebuilt from the real position of its parent node after the straightening of the previous edge. The rebuilt elbow is not checked again against foreign items (`bridgeAccepts` checks the first elbow only). Not verified: a case with a foreign segment near a rebuilt elbow.

#### Idea 1a, bends and fittings in the trunk search (Q1-T08, measured 2026-10-26)

Option: `trunkBends = { bendMm, fittingMm }`. Test: `route-turns-report.test.ts`, full mode (`MEPAPP_QUALITY_FULL=1`: 2 warm-up runs, 7 runs, 6 variants). The variants are "off", "turns500" (`bendMm` 500, `fittingMm` 300), "turns2000" (`bendMm` 2000, `fittingMm` 1000), "bridge" (`bridgeParts` with `penaltyMm` 0), "bridgeTurns500" and "bridgeTurns2000" (the bridge option with the two trunk prices). Raw output: `/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/Q1-T08/turns-full.txt` (not in git).

| Scenario | Start | Variant | Segments | Length mm | Bends 90 / 45 | Wall crossings | Off-graph rooms | Ports left | Score | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|
| First floor A | 0 | off | 109 | 151 366 | 35 / 10 | 26 | 28 | 0 | 263 044 | 62 |
| First floor A | 0 | turns500 | 109 | 151 366 | 35 / 10 | 26 | 28 | 0 | 263 044 | 55 |
| First floor A | 0 | turns2000 | 109 | 151 366 | 35 / 10 | 26 | 28 | 0 | 263 044 | 52 |
| First floor A | 0 | bridge | 147 | 177 907 | 62 / 21 | 29 | 15 | 0 | 291 169 | 70 |
| First floor A | 0 | bridgeTurns500 | 147 | 177 907 | 62 / 21 | 29 | 15 | 0 | 291 169 | 71 |
| First floor A | 0 | bridgeTurns2000 | 147 | 177 907 | 62 / 21 | 29 | 15 | 0 | 291 169 | 71 |
| First floor B | 0 | off | 309 | 269 867 | 60 / 10 | 31 | 28 | 1 | 430 531 | 2 122 |
| First floor B | 0 | turns500 | 309 | 269 867 | 60 / 10 | 31 | 28 | 1 | 430 531 | 2 207 |
| First floor B | 0 | turns2000 | 309 | 269 867 | 60 / 10 | 31 | 28 | 1 | 430 531 | 2 320 |
| First floor B | 0 | bridge | 335 | 306 891 | 78 / 21 | 38 | 15 | 1 | 461 007 | 4 189 |
| First floor B | 0 | bridgeTurns500 | 335 | 306 891 | 78 / 21 | 38 | 15 | 1 | 461 007 | 3 888 |
| First floor B | 0 | bridgeTurns2000 | 335 | 306 891 | 78 / 21 | 38 | 15 | 1 | 461 007 | 4 322 |
| 10A A (local-only) | 0 | off | 95 | 210 331 | 27 / 16 | 18 | 19 | 0 | 305 976 | 50 |
| 10A A (local-only) | 0 | turns500 | 95 | 210 331 | 27 / 16 | 18 | 19 | 0 | 305 976 | 84 |
| 10A A (local-only) | 0 | turns2000 | 95 | 210 331 | 27 / 16 | 18 | 19 | 0 | 305 976 | 80 |
| 10A A (local-only) | 0 | bridge | 114 | 226 122 | 41 / 20 | 20 | 13 | 0 | 319 693 | 86 |
| 10A A (local-only) | 0 | bridgeTurns500 | 114 | 226 122 | 41 / 20 | 20 | 13 | 0 | 319 693 | 100 |
| 10A A (local-only) | 0 | bridgeTurns2000 | 114 | 226 122 | 41 / 20 | 20 | 13 | 0 | 319 693 | 103 |
| 10A A (local-only) | 1 | off | 70 | 178 304 | 17 / 0 | 16 | 26 | 0 | 273 035 | 40 |
| 10A A (local-only) | 1 | turns500 | 70 | 178 304 | 17 / 0 | 16 | 26 | 0 | 273 035 | 42 |
| 10A A (local-only) | 1 | turns2000 | 70 | 178 304 | 17 / 0 | 16 | 26 | 0 | 273 035 | 43 |
| 10A A (local-only) | 1 | bridge | 115 | 225 481 | 38 / 24 | 20 | 13 | 0 | 319 192 | 74 |
| 10A A (local-only) | 1 | bridgeTurns500 | 115 | 225 481 | 38 / 24 | 20 | 13 | 0 | 319 192 | 90 |
| 10A A (local-only) | 1 | bridgeTurns2000 | 115 | 225 481 | 38 / 24 | 20 | 13 | 0 | 319 192 | 102 |
| 10A B (local-only) | 0 | off | 265 | 333 449 | 45 / 16 | 22 | 19 | 0 | 478 449 | 1 930 |
| 10A B (local-only) | 0 | turns500 | 265 | 333 449 | 45 / 16 | 22 | 19 | 0 | 478 449 | 2 537 |
| 10A B (local-only) | 0 | turns2000 | 265 | 333 449 | 45 / 16 | 22 | 19 | 0 | 478 449 | 2 670 |
| 10A B (local-only) | 0 | bridge | 271 | 356 917 | 47 / 22 | 25 | 13 | 0 | 483 170 | 2 116 |
| 10A B (local-only) | 0 | bridgeTurns500 | 271 | 356 917 | 47 / 22 | 25 | 13 | 0 | 483 170 | 1 670 |
| 10A B (local-only) | 0 | bridgeTurns2000 | 271 | 356 917 | 47 / 22 | 25 | 13 | 0 | 483 170 | 2 003 |
| Ground floor w_rooms A (local-only) | 0 | off | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 110 |
| Ground floor w_rooms A (local-only) | 0 | turns500 | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 111 |
| Ground floor w_rooms A (local-only) | 0 | turns2000 | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 110 |
| Ground floor w_rooms A (local-only) | 0 | bridge | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 134 |
| Ground floor w_rooms A (local-only) | 0 | bridgeTurns500 | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 111 |
| Ground floor w_rooms A (local-only) | 0 | bridgeTurns2000 | 141 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 112 |

Reading of the table:
- Every turns row equals the off row, and every bridgeTurns row equals the bridge row, in all 48 pairs of all drawings and starts in the file (12 groups, 4 pairs each; segments, length, bends, crossings, score). The option changes nothing on these drawings.
- Cause (measured with a scratch script on the first floor): the corridor graph of the route area has 23 edges and 0 independent cycles (it is a forest). Each terminal has exactly one path to the tree, so a price on bends cannot change the tree. With `bendMm` 100000 and `fittingMm` 100000 the trunk has the same 8 edges as without the option. Not measured: the 10A graph (its rows are equal too, so it is probably a forest as well). The bridge edges of idea 0 add few edges, but the rows stay equal.
- So the 62 bends 90 of the bridge variant (35 before) do not come from the choice of trunk path. They come from the elbows of the bridge edges, the straightening of the edges, and the branches and links. The next candidates are idea 1b (link search) and a bend-aware bridge elbow. This is a reasoned conclusion, not measured.
- Unit tests show that the search works: on a graph with two paths, the short path with 3 turns and a longer path with 1 turn, the option picks the longer path; with both prices 0 the tree equals `steinerTree` (random graphs, fixed seeds); trees stay trees with large prices (200 random graphs). The comparison of counted bends with the bends of the final plan was not made, because the trunk tree is the same in all rows (difference is 0 by construction).
- Acceptance, `trunkBends` alone, first floor A start 0: A1 not met (score change 0 %). A2 not met (off-graph rooms 28, crossings 26). A3 met in the trivial sense (length +0 %). A4 met (free legs 0, no `internal-join`, checked in the report test). T1 met in scenario A (first floor A start 0: median 55 ms and 52 ms, limit 300 ms); not met in scenario B (first floor B start 0: 2 207 ms and 2 320 ms; the baseline is 2 122 ms). Together with `bridgeParts`: the same numbers as `bridgeParts` alone (A1, A2, A3 not met as in T07; A4 met; T1 met in A with 71 ms).
- Determinism D1 (two runs, `toEqual`) passes with the option on in all rows (the report test checks it). D2 and D3 with the option on are not measured.
- Runtime: the option adds no measurable time on first floor A start 0 (medians 55 ms and 52 ms, against 62 ms off). On 10A A start 0 the medians rise from 50 ms (off) to 84 ms and 80 ms. This is not explained (not verified). The full-mode run takes 27 minutes, so it is not for the normal test run.
- Heap: `StateHeap` moved to `route-heap.ts` with no change.
- Safety net: the search forbids a path that visits one node twice (a loop could lower the bend price).

#### Idea 1b, a search for the off-graph links (Q1-T09, measured 2026-10-26)

Option: `linkSearch = { bendMm, wallMm }`. Code: `route-link.ts` (`searchLink`), called from `connectLoosePorts` in `route-topology.ts`. The old L-shape stays as the fallback when the search finds no path or `accepts` refuses the path. Test: `route-link-report.test.ts`, full mode (`MEPAPP_QUALITY_FULL=1`: 2 warm-up runs, 7 runs; scenario A starts 0, 1, 2 and scenario B start 0). Raw output: `/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/Q1-T09/link-full.txt` (not in git). The variants are "off", "link500" (`bendMm` 500, `wallMm` 0), "link500w" (`bendMm` 500, `wallMm` 3000), "link2000w" (`bendMm` 2000, `wallMm` 3000), "bridge" (`bridgeParts` with `penaltyMm` 0), and "bridgeLink500", "bridgeLink500w", "bridgeLink2000w" (the bridge option with the three link prices). A "wall" in the link search is one exit from a room, sampled every 100 mm. The model has no wall rating, so this is a count of penetrations to check, as in T07.

How the search works: a grid with the lines through the port, through up to 8 tap candidates, and through room corners (200 mm to each side, at most 20 lines on each axis). The search runs on heading states with the heap `StateHeap`. The price is the length, `bendMm` for each turn, and `wallMm` for each room exit. An edge that touches the built route is blocked, except at the tap. The first floor A start 0 rows of the main variants (all rows are in the raw file):

| Scenario | Start | Variant | Segments | Fittings | Length mm | Bends 90 / 45 | Wall crossings (penetrations to check) | Off-graph rooms | Ports left | Free legs | Score | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| First floor A | 0 | off | 109 | 76 | 151 366 | 35 / 10 | 26 | 28 | 0 | 0 | 263 044 | 60 |
| First floor A | 0 | link500 | 109 | 76 | 150 650 | 35 / 10 | 26 | 28 | 0 | 0 | 265 328 | 158 |
| First floor A | 0 | link500w | 108 | 75 | 153 142 | 34 / 10 | 25 | 28 | 0 | 0 | 261 616 | 153 |
| First floor A | 0 | link2000w | 108 | 75 | 153 142 | 34 / 10 | 25 | 28 | 0 | 0 | 261 616 | 125 |
| First floor A | 0 | bridge | 147 | 114 | 177 907 | 62 / 21 | 29 | 15 | 0 | 0 | 291 169 | 71 |
| First floor A | 0 | bridgeLink500 | 141 | 108 | 175 054 | 58 / 19 | 29 | 15 | 0 | 0 | 287 016 | 133 |
| First floor A | 0 | bridgeLink500w | 140 | 107 | 174 974 | 57 / 19 | 28 | 15 | 0 | 0 | 283 004 | 129 |
| First floor A | 0 | bridgeLink2000w | 140 | 107 | 174 974 | 57 / 19 | 28 | 15 | 0 | 0 | 283 004 | 128 |
| First floor A | 1 | off | 97 | 64 | 150 978 | 31 / 2 | 26 | 30 | 0 | 0 | 261 550 | 50 |
| First floor A | 1 | link500w | 96 | 63 | 152 125 | 30 / 2 | 24 | 30 | 0 | 0 | 260 028 | 180 |
| First floor A | 2 | off | 98 | 65 | 153 079 | 30 / 4 | 28 | 30 | 0 | 0 | 259 342 | 42 |
| First floor A | 2 | link500w | 100 | 67 | 152 192 | 31 / 4 | 23 | 30 | 0 | 0 | 266 807 | 189 |
| First floor B | 0 | off | 309 | 184 | 269 867 | 60 / 10 | 31 | 28 | 1 | 0 | 430 531 | 1 935 |
| First floor B | 0 | link500w | 327 | 201 | 271 649 | 82 / 10 | 26 | 28 | 0 | 0 | 447 802 | 2 257 |
| First floor B | 0 | link2000w | 317 | 191 | 270 509 | 72 / 8 | 25 | 28 | 0 | 0 | 438 803 | 2 244 |
| Ground floor w_rooms A (local-only) | 0 | off | 141 | 98 | 207 563 | 47 / 10 | 33 | 33 | 0 | 0 | 342 577 | 111 |
| Ground floor w_rooms A (local-only) | 0 | link500w | 143 | 100 | 200 838 | 48 / 10 | 32 | 33 | 0 | 0 | 352 702 | 232 |
| Ground floor w_rooms B (local-only) | 0 | off | 436 | 264 | 387 830 | 93 / 10 | 53 | 33 | 0 | 0 | 605 612 | 6 825 |
| Ground floor w_rooms B (local-only) | 0 | link500w | 436 | 264 | 356 854 | 98 / 10 | 40 | 33 | 0 | 0 | 563 917 | 9 254 |
| 10A A (local-only) | 0 | off | 95 | 68 | 210 331 | 27 / 16 | 18 | 19 | 0 | 0 | 305 976 | 68 |
| 10A A (local-only) | 0 | link500w | 98 | 71 | 200 035 | 30 / 15 | 14 | 19 | 0 | 0 | 307 748 | 289 |
| 10A A (local-only) | 0 | link2000w | 94 | 67 | 205 866 | 26 / 15 | 13 | 19 | 0 | 0 | 313 246 | 332 |
| 10A A (local-only) | 0 | bridgeLink500w | 112 | 85 | 225 848 | 40 / 19 | 18 | 13 | 0 | 0 | 327 069 | 150 |
| 10A B (local-only) | 0 | off | 265 | 160 | 333 449 | 45 / 16 | 22 | 19 | 0 | 0 | 478 449 | 964 |
| 10A B (local-only) | 0 | link500w | 264 | 159 | 318 383 | 46 / 16 | 15 | 19 | 0 | 0 | 457 703 | 1 116 |

Reading of the table:
- `linkSearch` alone does **not** cut bends. On the first floor A start 0 the change is 0 or minus 1 bend 90. On 10A A start 0 it is minus 1 to plus 2. In scenario B the bends rise (first floor B plus 10 to plus 22; w_rooms B plus 4 to plus 10). So the extra bends of idea 0 do not come from the off-graph links. This answers the open point of T08.
- With `bridgeParts` on, the link search takes 4 to 5 bends 90 and 2 bends 45 off (first floor A start 0: 62 / 21 to 57 / 19), and 7 fittings off, but the plan still has 22 more bends 90 than "off" (57 against 35). So most of the extra bends of idea 0 come from the branches and the room spines of the 13 rooms that the trunk now serves. This is a reasoned conclusion from the table. It is not measured with a split by leg type.
- The link search does cut length and wall crossings on the harder drawings: w_rooms B length minus 8.0 % and crossings 53 to 40; 10A A start 0 length minus 4.9 % and crossings 18 to 14; 10A B length minus 4.5 % and crossings 22 to 15. On the first floor A the effect is small (crossings 26 to 25, length plus 1.2 %).
- The link search serves the port that scenario B left over on the first floor (ports left 1 to 0).
- `wallMm` 3000 and 2000/3000 give the same plan in several rows. `bendMm` 500 against 2000 changes little. Not examined (not verified).
- The off-graph count does not change (28, or 15 with the bridge). The link search joins the same rooms by a different path. The count is a count of trunk reach, not of link quality.
- Acceptance (section 8), first floor A start 0, `linkSearch` alone (link500w): A1 **not met** (score minus 0.5 %, the limit is minus 10 %). A2 **not met** (off-graph 28; crossings 25, the limit is 18 or fewer). A3 met in the trivial sense (length plus 1.2 %). A4 met (free legs 0, no `internal-join`, checked in the report test). T1 met on the first floor A (medians 125 to 189 ms, limit 300 ms). T1 is **at the limit** on 10A A start 0 (289 and 332 ms with `linkSearch` alone; 150 ms with the bridge). T1 is not met in scenario B (about 2 200 ms on the first floor, 9 254 ms on w_rooms; the baseline is already 1 935 ms and 6 825 ms). Together with `bridgeParts` (bridgeLink500w): A1 not met (score plus 7.6 % against "off", minus 2.8 % against "bridge"); A2 not met (off-graph 15, crossings 28); A3 not met (length plus 15.6 %); A4 met; T1 met (129 ms).
- Runtime: `linkSearch` adds about 70 to 130 ms on the first floor A and 100 to 250 ms on 10A A start 0. The first version took 650 ms on the first floor A start 0. A profile showed that the room lookup took 40 % of the time; a lookup with a bounding-box test and rooms sorted by area, and a cap of 20 corner lines, brought it to about 150 ms with the same plan. The machine was shared with other work, so the times vary.
- Determinism D1 (two runs, `toEqual`) passes with the option on in all rows (the report test checks it). D2 and D3 with the option on are not measured.
- Not done on purpose: a bend-aware bridge elbow. The table shows that the bridge elbows are not the main source of the extra bends (the link search, which removes only link bends, changes 4 to 5 of the 27). A split of the extra bends by leg type (trunk, bridge, branch, spine, link) would show the real source; it needs a leg origin in the plan (see section 4). This is the suggested next step.
- Known limits: the 100 mm sample step can miss a wall thinner than 100 mm. The link search does not check legs shorter than 300 mm.

#### Split of the bends by leg origin (Q1-T09b, measured 2026-10-26)

Test: `route-origin-report.test.ts`. One run for each variant, scenario A, start 0. Raw output: `/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/Q1-T09b/origin-report.txt` (not in git). Variants: "off", "bridge" (`bridgeParts`, `penaltyMm` 0), "bridge + link" (the bridge option with `linkSearch` 500 / 3000). Columns: bends 90 / bends 45, length in metres, fittings. The plan with a trace is equal to the plan without a trace in all rows. The totals equal `plan.stats`.

| Drawing | Origin | off | bridge | bridge + link |
|---|---|---|---|---|
| First floor A | trunk | 5 / 6, 10.4 m, 11 | 8 / 7, 37.8 m, 17 | 8 / 7, 37.8 m, 17 |
| First floor A | bridge | 0 / 0, 0 m, 0 | 4 / 0, 16.4 m, 4 | 4 / 0, 16.4 m, 4 |
| First floor A | branch | 4 / 4, 8.6 m, 11 | 15 / 14, 20.5 m, 43 | 13 / 12, 18.0 m, 37 |
| First floor A | spine | 2 / 0, 7.2 m, 2 | 14 / 0, 31.0 m, 14 | 13 / 0, 31.0 m, 13 |
| First floor A | link | 24 / 0, 125.2 m, 52 | 21 / 0, 72.2 m, 36 | 19 / 0, 71.7 m, 36 |
| First floor A | total | 35 / 10, 151.4 m, 76 | 62 / 21, 177.9 m, 114 | 57 / 19, 175.0 m, 107 |
| w_rooms A | trunk | 5 / 2, 19.0 m, 9 | 5 / 2, 19.0 m, 9 | 5 / 2, 19.0 m, 9 |
| w_rooms A | bridge | 0 / 0, 0 m, 0 | 0 / 0, 0 m, 0 | 0 / 0, 0 m, 0 |
| w_rooms A | branch | 10 / 8, 24.1 m, 25 | 10 / 8, 24.1 m, 25 | 10 / 8, 24.1 m, 25 |
| w_rooms A | spine | 12 / 0, 28.0 m, 12 | 12 / 0, 28.0 m, 12 | 12 / 0, 28.0 m, 12 |
| w_rooms A | link | 20 / 0, 136.5 m, 52 | 20 / 0, 136.5 m, 52 | 21 / 0, 129.8 m, 54 |
| w_rooms A | total | 47 / 10, 207.6 m, 98 | 47 / 10, 207.6 m, 98 | 48 / 10, 200.8 m, 100 |
| 10A A | trunk | 3 / 2, 25.3 m, 6 | 3 / 6, 30.8 m, 10 | 3 / 6, 30.8 m, 10 |
| 10A A | bridge | 0 / 0, 0 m, 0 | 4 / 0, 54.8 m, 7 | 4 / 0, 54.8 m, 7 |
| 10A A | branch | 1 / 14, 9.4 m, 21 | 9 / 14, 14.5 m, 31 | 9 / 13, 14.5 m, 30 |
| 10A A | spine | 7 / 0, 36.9 m, 7 | 16 / 0, 59.7 m, 16 | 17 / 0, 59.7 m, 17 |
| 10A A | link | 16 / 0, 138.8 m, 34 | 9 / 0, 66.3 m, 23 | 7 / 0, 66.1 m, 21 |
| 10A A | total | 27 / 16, 210.3 m, 68 | 41 / 20, 226.1 m, 87 | 40 / 19, 225.8 m, 85 |

(w_rooms A: the bridge option adds no bridge leg, so the plan is the same as "off". The link search changes only the link part. The totals of 10A A and w_rooms A in this table come from one run each and agree with the totals of the Q1-T09 table, except the bridge row of 10A A, which Q1-T09 did not list.)

Change from "off" to "bridge" (bends 90 / bends 45, length in metres), first floor A:

| Origin | Bends 90 | Bends 45 | Length m | Fittings |
|---|---|---|---|---|
| trunk | +3 | +1 | +27.5 | +6 |
| bridge | +4 | 0 | +16.4 | +4 |
| branch | +11 | +10 | +11.9 | +32 |
| spine | +12 | 0 | +23.8 | +12 |
| link | -3 | 0 | -53.0 | -16 |
| total | +27 | +11 | +26.5 | +38 |

Reading of the table:
- The branches and the room spines make most of the extra bends. On the first floor they add 23 of the 27 extra bends 90 (85 %) and 10 of the 11 extra bends 45. The trunk and the bridge add 7 bends 90. The link part takes off only 3. The bridge itself is not the source.
- 10A A, "off" to "bridge": bends 90 plus 14 = bridge +4, branch +8, spine +9, link -7 (trunk 0). Branch and spine again add 17 of the 21 bends that are not taken off by the links.
- The rooms that the bridge adds (13 on the first floor) change from a link to a branch plus a spine. A link cost about 1 bend 90 for each port (24 bends for the 28 links of "off", about 125 m). A room that is now served by a branch and a spine costs about 2 bends 90 and also bends 45 (23 bends 90 and 10 bends 45 for 13 rooms), and the branch and spine parts add 44 fittings while the link part loses 16. This follows from the table. The cause inside the branch and spine code (the door position against the port position) is not examined (not verified).
- The link search (the "bridge + link" column) changes only the link, branch and spine parts by 1 to 2 bends each. It cannot remove the bends that the branches and spines make.
- Limits: scenario A has one port in each room. The split ranks a fitting to the origin of highest rank at that point, so a bend at the join of a branch and a trunk edge counts for the branch. Scenario B is not split (not measured). The split does not handle a start with an existing stub fitting (the stub is not in the plan fittings; the scenarios have no stub). It is a measuring tool for the report test, not for the product.

Next experiment (proposal only, not implemented): **Q1-T09c, a bend-priced room reach.** For each served room, search the path from the trunk through the entry to all its ports on heading states, with the cost: length plus `bendMm` for each turn, as in Q1-T09. The entry (door) stays a fixed point on the path. The search may choose the tap point on the trunk edge, so that the branch runs straight through the door and the spine starts in line with the port. Compare with the bridge row: the aim is to bring the branch plus spine bends from about 1.8 for each room to about 1. The check is the same table with this split.

#### Idea 2, exact Steiner tree in a room, and the room reach (Q1-T10, measured 2026-10-26)

Option: `exactSpine = { maxPorts }`. Code: `route-exact.ts` (`exactRoomSpine`, `spineScore`), `route-branch.ts` (`planReachRoom`), `route-build.ts` (passes `insideCorridor`). Test: `route-exact-report.test.ts`, fast mode (1 warm-up run, 3 runs; the full mode with scenario B was not run). Raw output: `/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/Q1-T10/exact-report-fast.log` (not in git).

Scope: the T10 text covers only the spine in the room. The scope is extended, as the T09b finding asks, to the reach through the door. With the option on, `planBranches` picks the tap on the trunk together with the spine. Candidate 0 is today's tap (nearest leg). Up to 4 more axis legs (at most 2000 mm farther from the door) are candidates. A candidate must keep its branch inside the corridor rooms (region test sampled every 100 mm). The score is branch length + bend price of the branch (90 degrees = 500 mm, 45 degrees = 250 mm) + the score of the spine (length, crossings, bends, and the bend at the door). The lowest score wins; a tie goes to candidate 0. The spine is the exact tree (Dreyfus-Wagner on the Hanan grid of `roomSpine`, ports are leaves, then a corner-flip pass that lowers the bends at equal cost) for rooms with at most `maxPorts` ports. The exact tree is used only when its score is strictly lower than the heuristic tree of `roomSpine`. The tree and the choice use the same grid and blocked edges as `roomSpine`.

Variants: "exact6" = `exactSpine` with `maxPorts` 6. "bridge" = `bridgeParts` (`penaltyMm` 0). "bridgeLink" = bridge plus `linkSearch` (500 / 3000).

| Scenario | Start | Variant | Segments | Fittings | Length mm | Bends 90 / 45 | Wall crossings | Off-graph rooms | Ports left | Score | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| First floor A | 0 | off | 109 | 76 | 151 366 | 35 / 10 | 26 | 28 | 0 | 263 044 | 67 |
| First floor A | 0 | exact6 | 109 | 76 | 151 533 | 35 / 10 | 26 | 28 | 0 | 263 323 | 72 |
| First floor A | 0 | bridge | 147 | 114 | 177 907 | 62 / 21 | 29 | 15 | 0 | 291 169 | 118 |
| First floor A | 0 | bridge + exact6 | 140 | 107 | 177 574 | 57 / 19 | 28 | 15 | 0 | 285 736 | 79 |
| First floor A | 0 | bridgeLink | 140 | 107 | 174 974 | 57 / 19 | 28 | 15 | 0 | 283 004 | 154 |
| First floor A | 0 | bridgeLink + exact6 | 133 | 100 | 174 642 | 52 / 17 | 27 | 15 | 0 | 277 572 | 143 |
| First floor A | 0 | link + exact6 (no bridge) | 108 | 75 | 153 309 | 34 / 10 | 25 | 28 | 0 | 261 895 | 132 |
| First floor A | 1 | off | 97 | 64 | 150 978 | 31 / 2 | 26 | 30 | 0 | 261 550 | 41 |
| First floor A | 1 | bridge | 146 | 113 | 177 761 | 63 / 18 | 27 | 15 | 0 | 287 978 | 73 |
| First floor A | 1 | bridge + exact6 | 140 | 107 | 176 511 | 58 / 18 | 27 | 15 | 0 | 282 427 | 82 |
| First floor A | 2 | off | 98 | 65 | 153 079 | 30 / 4 | 28 | 30 | 0 | 259 342 | 44 |
| First floor A | 2 | bridge | 145 | 112 | 176 939 | 62 / 18 | 28 | 15 | 0 | 288 998 | 74 |
| First floor A | 2 | bridge + exact6 | 139 | 106 | 175 801 | 57 / 18 | 28 | 15 | 0 | 283 561 | 85 |
| w_rooms A (local-only) | 0 | off | 141 | 98 | 207 563 | 47 / 10 | 33 | 33 | 0 | 342 577 | 113 |
| w_rooms A (local-only) | 0 | exact6 | 141 | 98 | 207 276 | 44 / 14 | 33 | 33 | 0 | 341 774 | 118 |
| 10A A (local-only) | 0 | off | 95 | 68 | 210 331 | 27 / 16 | 18 | 19 | 0 | 305 976 | 38 |
| 10A A (local-only) | 0 | exact6 | 95 | 68 | 210 331 | 27 / 16 | 18 | 19 | 0 | 305 976 | 40 |
| 10A A (local-only) | 0 | bridge | 114 | 87 | 226 122 | 41 / 20 | 20 | 13 | 0 | 319 693 | 43 |
| 10A A (local-only) | 0 | bridge + exact6 | 111 | 84 | 223 758 | 42 / 16 | 20 | 13 | 0 | 315 929 | 50 |
| 10A A (local-only) | 0 | bridgeLink | 112 | 85 | 225 848 | 40 / 19 | 18 | 13 | 0 | 327 069 | 79 |
| 10A A (local-only) | 0 | bridgeLink + exact6 | 106 | 79 | 221 148 | 38 / 15 | 19 | 13 | 0 | 318 569 | 88 |

Split by leg origin, first floor A start 0 (bends 90 / bends 45, length in metres, fittings):

| Origin | bridge | bridge + exact6 | bridgeLink | bridgeLink + exact6 |
|---|---|---|---|---|
| trunk | 8 / 7, 37.8, 17 | 8 / 7, 37.8, 18 | 8 / 7, 37.8, 17 | 8 / 7, 37.8, 18 |
| bridge | 4 / 0, 16.4, 4 | 3 / 0, 16.4, 3 | 4 / 0, 16.4, 4 | 3 / 0, 16.4, 3 |
| branch | 15 / 14, 20.5, 43 | 14 / 12, 20.1, 39 | 13 / 12, 18.0, 37 | 12 / 10, 17.7, 33 |
| spine | 14 / 0, 31.0, 14 | 11 / 0, 31.0, 11 | 13 / 0, 31.0, 13 | 10 / 0, 31.0, 10 |
| link | 21 / 0, 72.2, 36 | 21 / 0, 72.2, 36 | 19 / 0, 71.7, 36 | 19 / 0, 71.7, 36 |
| total | 62 / 21, 177.9, 114 | 57 / 19, 177.6, 107 | 57 / 19, 175.0, 107 | 52 / 17, 174.6, 100 |

Reading of the table:
- `exactSpine` alone does nothing useful on the first floor and on 10A. Without the bridge only 7 rooms have a branch, and the plan is the same except for 167 mm of length and a tap shift (the score rises by 0.1 %). On w_rooms A it trades 3 bends 90 for 4 bends 45 (score minus 0.2 %).
- With the bridge, the option takes 5 bends 90 and 2 bends 45 off on the first floor A start 0 (62 / 21 to 57 / 19): spine minus 3, branch minus 1 (and minus 2 bends 45), bridge minus 1. The branch plus spine part had 29 bends 90 in the "bridge" column and has 25 now. The rooms that the bridge adds need about 1 bend each in the spine, because one port is seldom in line with the door; no tree can remove that bend. So the lower bound is near: the remaining spine bends (11 for 13 new rooms) are mostly that one bend.
- With the bridge and the link search, the option gives 52 / 17 (bridgeLink 57 / 19). That is the best result so far on the first floor A start 0: 52 bends 90 against 62 (bridge) and 35 (off). It is still 17 bends 90 above "off".
- The extra bends of the bridge are not removed. The branch keeps 14 bends 90 and 12 bends 45 for 13 new rooms. A part of them comes from the elbows at the trunk edges (the branch must leave a diagonal or an axis trunk leg), which the tap choice does not change. Not examined (not verified).
- Length: the option shortens by 0.2 % to 1.0 % against the bridge column. It does not close the +17 % length of the bridge.
- Acceptance (section 8), first floor A start 0, `exactSpine` with `bridgeParts` and `linkSearch` (the best row): A1 **not met** (score 277 572 against 263 044 for "off": plus 5.5 %; against "bridge": minus 4.7 %). A2 **not met** (off-graph rooms 15, the limit is 14 or fewer; crossings 27, the limit is 18 or fewer). A3 **not met** (length plus 15.4 % against "off"). A4 met (free legs 0, no `internal-join`, checked in the report test). T1 met in scenario A (median 143 ms against the limit of 300 ms; exact6 alone 72 ms). T1 for scenario B is not measured because the full mode was not run; the baseline already has 1 935 ms there.
- Other drawings: 10A A start 0, bridgeLink + exact6 against bridgeLink: bends 90 40 to 38, bends 45 19 to 15, length minus 2.1 %, score minus 2.6 %; the median is 88 ms. w_rooms A: no bridge leg exists, so only the spine changes.
- Determinism D1 (two runs, `toEqual`) passes with the option on in all rows. D2 and D3 with the option on are not measured.
- Unit tests: in 200 seeded 4-port layouts the exact tree is better (shorter, or equal length with fewer bends) in 177 layouts and never worse by the score. The tree keeps the ports as leaves. The never-worse rule holds for the score of one room; for several rooms the shared tap spacing can change a later room.
- Limit: the check "exact length is not above the heuristic length" holds by construction when no foreign segment is crossed (Dreyfus-Wagner is exact for the length). The bend gain comes only from the choice of the equal-length trees and from the corner-flip pass.

#### Idea 3, a score and candidate layouts (Q1-T11, measured 2026-10-26)

Function: `planBestRoute(input, candidates, weights?)` in `route-candidates.ts`. It plans each candidate with `planRoute`, scores it with `scoreRoute`, and returns `best` (the index of the lowest score; a tie goes to the lower index) and `results`. Each result holds `options`, `status`, `plan`, `metrics`, `score` and `signature`. The signature is a hash of the geometry (rounded to 0.01 pt, ids left out), so two plans with equal geometry have equal signatures. A refused plan has the score infinity. The function has no candidate list: the caller owns it. Test: `route-candidates-report.test.ts`, fast mode (1 warm-up run, 3 runs; scenario A only, because one plan of scenario B takes seconds). The candidates in this test are a local list: "base" (`{}`), "bridge" (`bridgeParts` 0), "bridgeLink" (bridge + `linkSearch` 500/3000) and "all" (bridgeLink + `exactSpine` 6). Raw output: `/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/Q1-T11/report-out.txt` (not in git). The sensitivity row "bends" has `bend90` 1500 and `bend45` 750. All other weights are the default values of section 5 (wall crossing 0, answer Q-Q1-02).

| Drawing | Start | Weights | Winner | base | bridge | bridgeLink | all | Different geometries |
|---|---|---|---|---|---|---|---|---|
| First floor A | 0 | default | base | 263 044 | 291 169 | 283 004 | 277 572 | 4 |
| First floor A | 0 | bends | base | 303 044 | 363 669 | 349 504 | 338 072 | 4 |
| First floor A | 1 | default | base | 261 550 | 287 978 | 283 569 | 278 019 | 4 |
| First floor A | 1 | bends | base | 293 550 | 359 978 | 352 569 | 342 019 | 4 |
| First floor A | 2 | default | base | 259 342 | 288 998 | 284 589 | 279 152 | 4 |
| First floor A | 2 | bends | base | 291 342 | 359 998 | 352 589 | 342 152 | 4 |
| Ground floor w_rooms A (local-only) | 0 | default | base | 342 577 | 342 577 | 352 702 | 351 899 | 3 |
| Ground floor w_rooms A (local-only) | 0 | bends | base | 394 577 | 394 577 | 405 702 | 403 899 | 3 |
| 10A A (local-only) | 0 | default | base | 305 976 | 319 693 | 327 069 | 318 569 | 4 |
| 10A A (local-only) | 0 | bends | base | 340 976 | 370 693 | 376 569 | 364 069 | 4 |

Runtime of `planBestRoute` with the 4 candidates (default weights, median and maximum of 3 runs after 1 warm-up run). Limit T2 (Q-Q1-08 A): 1200 ms in total.

| Drawing | Start | Median ms | Max ms | Limit 1200 ms |
|---|---|---|---|---|
| First floor A | 0 | 911 | 963 | met |
| First floor A | 1 | 862 | 1 083 | met |
| First floor A | 2 | 886 | 1 271 | met by the median; the maximum of one run is above the limit |
| Ground floor w_rooms A (local-only) | 0 | 769 | 789 | met |
| 10A A (local-only) | 0 | 306 | 382 | met |

Reading of the tables:
- The baseline wins in all 10 rows, with the default weights and with the raised bend weights. No candidate gets a lower score than the baseline. The score of section 5 prefers the shorter route with fewer bends. The extra length and bends of the bridge, the link search and the exact spine cost more than the off-graph rooms that they remove (1500 each).
- The raised bend weights make the baseline win by a larger margin, not a smaller one. Every prototype adds bends (section 10, idea 0). So these bend weights cannot change the winner here. A higher weight for an off-graph room was not tried.
- Among the three prototypes, "all" has the lowest score on the first floor and on 10A. The second best is "bridgeLink" on the first floor and "bridge" on 10A. The order is not the same on every drawing.
- On the ground floor w_rooms, "bridge" gives the same plan as "base" (equal signature), because no room has an entry there. Only 3 geometries are different.
- The score does not contain `portsLeft`. A candidate that leaves a port unreached can win. All candidates in scenario A reached all ports (the test checks status "ok" and `freeLegs` 0, and there is no `internal-join`).
- The "base" candidate has the same geometry as `planRoute(input, {})` (equal signature). Determinism: two calls give equal scores and signatures. `planRoute` is unchanged.
- Runtime: the median of 4 candidates is under 1200 ms in all rows. The first-floor start 2 has one run of 1 271 ms in 3 runs. The machine was shared with other work, so the times vary. Scenario B is not measured: one plan takes 1 to 2 s on the first floor, so 4 candidates are above the limit there (section 10, idea 0 shows 2 to 4 s for one plan with the bridge).
- `planBestRoute` does not pass `startFittingId` to `routeMetrics`. A start with an existing stub uses the port as the start of the path metrics. This changes only the path metrics (longest path, spread), which are small in the score. P1 must pass the stub start if it needs them.
- The ids of the later candidates continue the counter of the id functions of the input. The best plan can have ids with gaps. The signature does not use ids.

## 11. Defect catalogue from the user screenshots (T05)

Source: the screenshot `fixtures/pdfs/00_arch_ground_floor_w_rooms_route_2.png` (local only, git-ignored). It shows the auto-route of the latest build on the w_rooms PDF. The user placed the rooms by hand and used terminals for the default supply air rule only. The user drew six notes. The user says each note is a defect class that repeats over the whole floor, not only at the arrow.

How the counts were made (Q1-T05, measured 2026-10-27 by `route-defects-report.test.ts`). The run uses the local fixture `ground-floor-w-rooms.json`, start 0, default options. Scenario A has one terminal at the label point of each served room. Scenario B has four terminals in each served room. The scenarios are not the same as the user input: the scenario puts a terminal in all 43 served rooms, and the user placed terminals in fewer rooms, some with 2 to 6 terminals. So the counts show the size of each class. They are not a copy of the screenshot. The first floor and 10A are in the same test as a cross check. Two terms: a *served room* is a room that is not part of the route area (the corridors). A *bend* is an elbow fitting. A *chain* is a served room that a duct enters directly from another served room.

| Id | Defect in plain words | Example spot (note) | Metric |
|---|---|---|---|
| D-1 | A room has no main branch. Each terminal has its own link into the room, so the room has many entries. The user wants one main branch from the corridor, then similar branches to the terminals. | Top right room is the good example. The room left of it is the bad one (note 1). | `multiEntryRooms` (new), `roomsWithBends` (new). Scenario B only. |
| D-2 | A link from a room to the corridor has bends that a straighter link would not need (90 and 45 degrees). | The link from the top left room to the corridor (note 2). | `bendsRoom90`, `bendsRoom45`, `bendsOutside` (new). |
| D-3 | Bends of 45 degrees in the open hall that do not follow the walls. | The hall in the middle of the floor (note 3). | `bendsArea45`, `bendsArea90` (new), `bends45`. |
| D-4 | A terminal gets an extra bend where one straight segment from the corridor could reach it. | The room right of the middle (note 4). | `roomsWithBends` (new), `bendsRoom90` (new). The metric shows rooms with a bend, not if a straight way exists. |
| D-5 | Rooms are chained: one room is connected through another room, not from the corridor. | The two rooms on the left (note 5). | `chainedRooms` (new). |
| D-6 | A long diagonal leg across open space. The user did not note it. It is probably a bridge between two corridor parts. | The long diagonals in the middle of the floor. | `longDiagonalLegs` (new, longer than 3 000 mm), `diagonalLegs` (new). |
| D-7 | Many rooms are joined by a long free duct across other rooms. | Many rooms on the whole floor. | `offGraphRooms`, `wallCrossings`, `lengthLinkMm`. |
| D-8 | The corridors are not joined in the graph (4 parts). | The long diagonals join the parts. | `area.parts` (not yet in the report). |

Counts on the ground floor w_rooms (local-only, 43 served rooms, start 0). The bends in the route area are all corridor bends, split into 90 and 45 degrees.

| Class | Metric | Scenario A | Scenario B |
|---|---|---|---|
| D-1 | `multiEntryRooms` (rooms with more than one entry) | 4 | 15 |
| D-1, D-4 | `roomsWithBends` (served rooms with at least one bend) | 20 | 36 |
| D-2 | `bendsRoom90` / `bendsRoom45` (bends inside served rooms) | 22 / 2 | 66 / 2 |
| D-2 | `bendsOutside` (bends in no room, for example in a door gap) | 16 | 18 |
| D-3 | `bendsArea90` / `bendsArea45` (bends in the route area) | 12 / 5 | 12 / 5 |
| D-3 | Bends of 45 degrees in the whole plan (`bends45`) | 10 | 10 |
| D-5 | `chainedRooms` | 20 | 25 |
| D-6 | `diagonalLegs` / `longDiagonalLegs` (longer than 3 000 mm) | 6 / 2 | 6 / 2 |
| D-7 | `offGraphRooms` | 33 | 33 |
| All | `bends90` / `bends45` (total) | 47 / 10 | 93 / 10 |

Cross check on the other two drawings (scenario A / scenario B): first floor: `chainedRooms` 18 / 18, `multiEntryRooms` 1 / 4, `roomsWithBends` 16 / 24, `bendsArea45` 10 / 10, `longDiagonalLegs` 0 / 0. 10A: `chainedRooms` 9 / 11, `multiEntryRooms` 2 / 9, `roomsWithBends` 12 / 21, `bendsArea45` 16 / 16, `longDiagonalLegs` 0 / 0. So D-2, D-3 and D-5 repeat on all three drawings. D-6 shows on the ground floor w_rooms only.

Notes on the numbers:
- The bend metrics add up: for example `bendsArea90 + bendsArea45 + bendsRoom90 + bendsRoom45 + bendsOutside` is 57 for the ground floor A, and `bends90 + bends45` is 57.
- The 45 degree bends come from the corridor (D-3), not from the rooms: on all three drawings the 45 degree bends in served rooms are 0 or 2. Some bends in the route area also come from straightening (R-4).
- `chainedRooms` is high because scenario A puts a terminal in every served room. The user input has terminals in fewer rooms, so the real count is likely lower (not verified). It is still the largest class by room count.
- `multiEntryRooms` counts the entry points that are more than 1 000 mm apart. A fitting that sits in the wall gap can give two entries for one door. This is a known limit of the metric (not verified on the screenshot).
- D-4 has no exact metric. A test for "a straight segment from the corridor would serve this terminal" needs a line of sight check from the route area to each terminal. A task (Q1-T10 or Q1-T11) can add it if the director wants it.
- D-8: `area.parts` is still not in the report.
- Not verified: that the counts match the screenshot room by room. The user placed the terminals by hand and the fixture has no stamps.

## 12. Risks and what is not verified

- **R-1 The test input is synthetic.** One port at each room label, no stamp art, one start room (`route-run.test.ts:33-49`). The real user input is different. Scenario B, three start rooms and 10A reduce this risk. They do not remove it. The user screenshots are the real check.
- **R-2 Two copies of the set-up.** T02 copies the set-up of `route-run.test.ts` into a helper and leaves the old test as it is. The two can drift. Q2 removes the copy (the test then uses the helper).
- **R-3 Score weights are guesses.** Section 5 weights are planner values. A wrong weight picks a wrong "best". A table of single metrics (section 10) is always shown next to the score.
- **R-4 Prototype on a trunk approximation.** Idea 1a counts bends on the graph polyline, but the final bends come after straightening (`route-trunk.ts:197`). The task reports the gap. If it is large, a second pass on the straightened path is needed.
- **R-5 Exact Steiner with leaf ports.** The leaf rule makes the dynamic program less standard. If the exact tree is not shorter than the heuristic in the tests, drop idea 2.
- **R-6 Merge with R7 and with the UI plans.** Q1 edits core files only, except an optional wiring (Q-Q1-04 B). `RouteDialog.tsx` is edited by the R7 work (uncommitted) and by the UI cleanup plan. Run `pnpm build` after each merge (`rules.md` section 3 rule 6).
- **R-7 Licences.** The two checks of section 3 used search snippets only. No dependency is added, so the risk is low. Any later use of a library needs a read of its licence text.
- **R-8 A better plan may not look better.** A lower score can still look odd to the user. T15 and T16 put the screenshots in front of the user before any default changes.
- **Not verified:** the count of off-graph rooms for other starts and for 10A (T04); a helper for a port grid inside a room (T02); the scale of 10A in the code (T03); whether `scene.planRoute` can pass `layout` (made by P1-T09) (T15); the content of every source in section 3 except the two licence snippets.

## 13. Status table

| Task | Size | Commit |
|---|---|---|
| Q1-T01 | M | |
| Q1-T02 | M | |
| Q1-T03 | S | |
| Q1-T04 | M | |
| Q1-T04b | S | |
| Q1-T05 | S | |
| Q1-T06 | S | |
| Q1-T07 | M | |
| Q1-T08 | M | |
| Q1-T09 | M | |
| Q1-T09b | S | |
| Q1-T10 | M | |
| Q1-T11 | M | |
| Q1-T12 | M | |
| Q1-T13 | S | |
| Q1-T14 | S | |
| Q1-T15 | M | |
| Q1-T16 | S | |
