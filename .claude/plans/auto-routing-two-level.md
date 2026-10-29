# P2 plan: the two-level auto-route (main run, room runs, combine)

Status: PLAN, revised 2026-10-28 after audit round 1 (section 11 lists each finding and its fix). Nothing is built. Part prefix: P2. Task ids: P2-T00 to P2-T18 (with split ids such as T10a). Question ids: Q-P2-01 to Q-P2-08 (the numbers stay; Q-P2-04 and Q-P2-05 are merged, Q-P2-03 is the same as Q-P1-16, Q-P2-06 and Q-P2-08 are provisional defaults, Q-P2-09 is new).

Inputs: `auto-routing-two-level-prompt.md` (the wish of the user), `auto-routing-two-level-analysis.md` (rules R1 to R12 of the hand route, numbers), `route-layout-presets.md` (P1: the option mechanism and the result of the old planner), `auto-routing.md`, `.claude/roadmap/rules.md`, and the code of branch `worktree-routing-feedback`.

Terms (the terms of `auto-routing.md`, `auto-routing-r6.md` and `route-layout-presets.md` apply). New terms:
- **Main run**: the long straight lines in the corridors. They carry the flow from the start to the rooms. A main run is a tree. It has no branch into a room.
- **Main line**: one straight line of the main run.
- **Room run**: all segments inside one room, from the door to the terminals. It has a stem (one straight line) and may have teeth (short straight lines at right angles to the stem).
- **Comb**: a stem with teeth. Each tooth ends at a terminal or runs through two terminals. The stem hits a tooth at its middle.
- **Door**: the point where a run crosses the wall of a room. MepApp has no door data (section 0, item 4). A door is a point on a wall that the planner chooses.
- **Foot**: the foot of the perpendicular. The point on a main line that is nearest to a door, on the line that goes out of the door at a right angle to the wall.
- **Tee at the foot**: the room branch ends on the main line at the foot. It does not slide along the main line (rule R8).
- **Combine**: the step that joins each room run to the main run with a branch from the door to the foot.
- **Terminal**: a target port.

## 0. Findings that change the plan

1. **The old planner starts from the corridor centre line.** `buildTrunk` makes a Steiner tree on the centre-line graph of the corridors (`packages/core/src/route-trunk.ts:126`, called at `route-build.ts:315`). The hand route does not follow the centre line (rule R1: 0.6 to 1.4 m from the corridor-side walls). So the main run of P2 does not use the centre-line graph.
2. **The old room feed makes the shape of a room with a search, not with a pattern.** `roomFeed` calls `roomSpine` (a Hanan grid search with bend prices) (`route-room-feed.ts:70`, `route-hanan.ts:187`). That search gives shapes that the user does not want (P1-T27 found spines that go around terminals, `route-layout-presets.md` section on T27). The hand route uses fixed patterns (rules R3, R5, R6, R7). P2 uses patterns first.
3. **The numbers of the user tests.** Hand route against the last auto route (analysis file): bends 12 against 89; length 234.0 m against 278.4 m; mean bends from the unit to a terminal 4.0 against 12.0. P1 with the option `roomBranches` (P1-T27) still has more bends in rooms than Balanced: 52 against 49 (`w_rooms-2`, scenario B, `fewRoomBends` on) (`route-layout-presets.md`, section of P1-T27). So a patch of the old modules does not reach the hand route.
4. **The model has no door data.** The room polygon is a ring of the walls. A door is not stored. `area.entries` has a wall point in the middle of the shared wall stretch (`route-area.ts:40-52`, `:122-147`). The hand route puts the crossing at the terminal (R4). Whether these crossings are real doors is not known (open question Q-P2-01).
5. **The real terminals are in the PDF files, not in a fixture.** The test scenarios A and B put synthetic terminals in each room (`route-scenario.testutil.ts:84-90`: A = one point at the label point, B = a grid of 4). The hand route has 58 real terminals. They are in the project JSON that is embedded in `00_arch_ground_floor_w_rooms_route_manual.pdf` (59 stamps, 0 segments; I read it with a script, the counts are verified). The rooms of that project are not the same as the local fixture `ground-floor-w-rooms-2.json`: both have 51 rooms, but the room types differ (13 offices and 6 storage rooms in the manual project, against 12 and 4 in the fixture; the fixture has 3 rooms with no type). So P2 needs a new local fixture (task P2-T02). The manual route itself is only vector strokes in the PDF (no segment data).
6. **The chip row of P1 is not built.** A search finds no `layout` field in `RouteRequest` (`packages/render/src/scene.ts:496-499`) and no use of `roomBranches` in `packages/render` or `packages/ui`. `scene.planRoute` calls the core `planRoute` with the default options (`scene.ts:2960`). P1-T09 (scene seam), P1-T06 (preset table) and P1-T11 (chips) are open. So the UI tasks of P2 (phase D) depend on them, or build the smallest part of them (task P2-T16).
7. **The route area is set by room types.** The route area is automatic: the rooms of the room types in the list (default Corridor and Shaft) (D-R4-01, `auto-routing-r4.md:47`; list in `localStorage`, `auto-routing-r4.md:35`). So a main run through an entrance room is not allowed today. The hand route crosses room-15 (type "entrance" in the manual project, `00_..._w_rooms.json`; 8.1 m of the main run). See Q-P2-02.

## 1. Goal

A new planner mode, the option `twoLevel` of `RouteLayoutOptions`. It works in three steps:

1. **mainRun.** Decide a few long straight lines in the corridors, parallel to the corridor walls, joined by tees into a tree from the start. No room branch yet.
2. **roomRuns.** For each room, alone: choose the door and make the shape of the room run (a straight line for one terminal, a comb for several, blocks of 2 by 2 for large rooms, an L only when the wall is parallel to the rows).
3. **combine.** For each room run, make the branch from its door to the foot on the main run. The branch ends on the main run with a tee.

What the user sees: the user opens "Route network…", chooses the chip "Two-level" (next to the layout chips of P1), and the preview shows a hall with a few long lines, one straight branch to each room, and combs in the rooms. The numbers fall to the level of the hand route: about 12 bends in place of 89, and about 234 m in place of 278 m (the targets of the analysis file; the limits of the gate are in section 7).

Example (floor `00_arch_ground_floor_w_rooms`, air handling unit in the technical room, 22 served rooms, 58 terminals): the preview shows the west spine at 1.0 m from the wall (28 m, straight), the north line, the south line and the east spine. A single-terminal office gets one straight branch from the spine to its terminal. A six-terminal meeting room gets a stem from its door with teeth to the terminals. The entrance room 15 is crossed by the main run if the user agrees (Q-P2-02).

Where P2 stops: P2 adds no stored data, no change of the corner modes, no sizing, no door detection and no change of the default output. It does not replace the old modes. The next step after P2 (a decision of the user, not in this plan) is to make `twoLevel` the default or to remove modules that only the old modes use.

## 2. What exists now (path:line)

| Item | Where |
|---|---|
| `planRoute(input, options, trace?)`; the branch point `if (options.roomBranches) ... else planBranches(...)` | `packages/core/src/route-build.ts:199-203`, `:352-392` |
| Trunk (centre-line Steiner tree), `TrunkResult` (`edges`, `served`, `offGraphRoomIds`, `rootPointMm`) | `route-trunk.ts:126`, `:35-60` |
| The region of the corridors (`insideRouteArea`, `withWallGaps`, `WALL_GAP_MM` 750, `REGION_TOL_MM` 150) | `route-layout.ts:149-175` |
| `RouteLayoutOptions` (all fields optional); `roomBranches` is a prototype key; `DEFAULT_LAYOUT_OPTIONS` | `route-layout.ts:10-44` |
| Room feed loop (`planRoomFeeds`): order nearest first, carriers = trunk legs, `bestRoomReach`, chain pass | `route-feeds.ts:63-304` |
| One entry and one tap for a room (`bestRoomReach`; has `extraCostMm` and `pathPenaltyMm`) | `route-room-reach.ts:103-115` |
| Entry candidates (`roomEntryCandidates`: sources `area-entry`, `ring`, `port-line`; at most 120) | `route-room-entry.ts:5-6`, `:22-30` |
| Stub and spine of a room (`roomFeed`, `ENTRY_DEPTH_MM` 200) | `route-room-feed.ts:6`, `:70` |
| Steiner tree and Steiner tree with turn prices | `route-steiner.ts:19`, `:154` |
| Loose ports link (`connectLoosePorts`), over-port test (`runsOverOtherPort`) | `route-topology.ts:366`, `:308` |
| Tee and elbow fittings from the paths (`buildRouteItems`) | `route-topology.ts:49` |
| The checks after the plan: `checkExisting`, `checkInvariant`, `canJoinPoint`, `accepts` | `route-build.ts:308-312`, `:455-489`; `route-checks.ts:17`, `:87`, `:173` |
| Metrics: `routeMetrics` (`bendsRoom90`, `bendsArea90`, `chainedRooms`, `multiEntryRooms`, `longestPathMm`) | `route-metrics.ts:18-57`, `:119` |
| Warnings: `room-chained`, `room-off-graph`, `ports-left`, `wall-crossings` | `route-build.ts:445-453`, `:509` |
| Stats of wall crossings in two numbers | `route-build.ts:496-501`, `:583-585` |
| Test harness: `buildScenario` (A, B), `runScenario(s, ids, options, trace)`, `measureScenario`, `localDrawing`, `planHash`, `seededShuffle` | `route-scenario.testutil.ts:21-26`, `:69`, `:121`, `:143`, `:177`, `:216` |
| Gate test (G0) and its table | `route-room-branch-report.test.ts:26-35`, `:195-227`, `:229-241` |
| Local fixtures (git-ignored): `ground-floor-w-rooms-2.json` (51 rooms, 3 corridors, 1 shaft), `ground-floor-w-rooms.json` (44 rooms), `10A-rooms.json` | `packages/core/fixtures/route-area/local/` |
| The PDF files of the user | `fixtures/pdfs/00_arch_ground_floor_w_rooms.pdf`, `..._route.pdf`, `..._route_manual.pdf`, `..._route_2.png` |
| Scene request (no `layout` field); `planRoute` call with default options | `packages/render/src/scene.ts:496-499`, `:2936`, `:2960` |
| The preview section (debounce, `scene.planRoute`, `setRoutePreview`, Place) | `packages/ui/src/components/RouteBuildSection.tsx:16`, `:49`, `:62`, `:81` |
| Browser helper and the helper of the Route dialog | `.claude/roadmap/browser/lib.mjs`, `r6-ui-lib.mjs` |

The work files of the analysis (not in git): the scratchpad folder `p2-analysis/` with `extract.mjs`, `vec.mjs`, `analyze.py`, `sbs.mjs`, `side-by-side.png` and `results.json`. A task copies what it needs (P2-T02, P2-T18). The scratchpad can vanish. The first task (P2-T00) is that the director copies these scripts to `.claude/roadmap/tools/p2/` (the folder does not exist yet).

## 3. Research

No web search was run. The sources are the hand route of the user and the code.

- **Rules R1 to R12** (analysis file). They are the specification. Each module below names the rules it keeps.
- **Rectilinear Steiner tree on a grid of candidate lines.** The main run is a small Steiner problem on a graph whose edges are pieces of the candidate lines. The code has the Takahashi-Matsuyama heuristic with and without turn prices (`route-steiner.ts:19`, `:154`). MepApp can use it with no new dependency. (Not verified in an outside source.)
- **Duct practice.** A designer puts the main duct near the corridor wall, above the ceiling, to keep the branches short and to keep the middle free for other services. This is the reading of R1. (Planner knowledge, not verified.) The offset of 1.0 m is a planner value from the range 0.6 to 1.4 m of the hand route.
- No new dependency. No `pnpm add`.

## 4. The model

### 4.1 No stored data

Same rule as P1 (`route-layout-presets.md` section 4.1). `twoLevel` is an option in code. The chip choice is dialog state. Nothing goes into `ProjectDocument`, `schema.ts` or the PDF. `CURRENT_SCHEMA_VERSION` stays. Proof in every task that says "no stored change": `git diff --stat` shows no change in `packages/core/src/project.ts` and `packages/core/src/schema.ts`. If the user wants door data (Q-P2-01 B or C), that is a [data model] decision and a later part.

### 4.2 Types (core)

```ts
// route-layout.ts
export interface TwoLevelOptions {
  /** Distance of a main line from the corridor wall, mm. Default 1000. Hand route: 600 to 1400. */
  mainOffsetMm?: number;
  /** A terminal farther than this from a main line makes the room get a bridge or a link, mm. Default 6000. Hand route: 4800. */
  reachMm?: number;
  /** Main run may cross a room with no terminal that is not in the route area. Default false (Q-P2-02). */
  crossRooms?: { maxRooms: number };
  /** Far rooms: how many chain steps from a fed room. Default 0 in P2 (Q-P2-03). */
  maxChainDepth?: number;
  /** A room may get several doors when it has this many terminals or more (blocks of 2 by 2). Default Infinity (one hole per room) until Q-P2-04 is answered; see section 9. */
  splitFromTerminals?: number;
  /** Minimum distance of a wall hole (door) to the end of a wall, a column or a corner, mm. Default 200 (planner value). */
  doorMarginMm?: number;
  /** Minimum distance between two tees on one main line, mm. Default: max(300, one duct width, 1.5 x DN of the branch); when sizing is not known at this step, 600 (planner value; sizing may widen it). */
  teeSpacingMm?: number;
  /** Room type ids that a main run never crosses (Q-P2-02). Default: see section 4.3 (provisional list by name). */
  neverCrossTypeIds?: readonly string[];
  /** Clearance to segments of other networks, mm. Default 150 (planner value). */
  clearanceMm?: number;
}
// RouteLayoutOptions gets:   twoLevel?: TwoLevelOptions;   // off when absent. Added to PrototypeLayoutKey.
```

`twoLevel` and `roomBranches` must not be set together. `planRoute` reads `twoLevel` first. If both are set, `twoLevel` wins and the plan has no warning (a test pins this).

New files in `packages/core/src` (each pure, mm units, no scene):

```ts
// route-main-run.ts
export interface MainLine { id: string; a: Vec2; b: Vec2; bridge?: boolean; crossedRoomId?: string }   // axis aligned, a to b
export interface MainRun { lines: MainLine[]; paths: Vec2[][]; rootPointMm: Vec2; unreachedRoomIds: string[]; chosenHitByRoom: Map<string, Vec2> }
export function mainRunLines(input: { areaRingsMm: readonly (readonly Vec2[])[]; inside: (p: Vec2) => boolean; startMm: Vec2; offsetMm: number; roomHalfWidthMm: (p: Vec2) => number; blockers: readonly Vec2[][]; shaftRoomIds: ReadonlySet<string>; ductWidthMm: number; clearanceMm: number }): MainLine[];
export function planMainRun(input: { lines: readonly MainLine[]; startMm: Vec2; demands: readonly MainDemand[]; inside: (p: Vec2) => boolean; bendMm: number; reachMm: number }): MainRun;
export interface MainDemand { roomId: string; doorsMm: readonly { pointMm: Vec2; outward: Vec2 }[] }   // from roomEntryCandidates

// route-room-runs.ts
export interface RoomRun { roomId: string; door: EntryCandidate; stem: Vec2[]; teeth: Vec2[][]; lead: Vec2[]; bends: number; lengthMm: number; leftPortIds: string[]; pattern: 'single' | 'comb' | 'blocks' | 'l' | 'fallback' }
export function roomRunFor(input: { room: Pick<Room,'id'|'polygon'>; door: EntryCandidate; ports: readonly { id: string; point: Vec2 }[]; wallParallelToRows: boolean; bendMm: number; splitFromTerminals: number; blockers: readonly Vec2[][]; clearanceMm: number; doorMarginMm: number; roomFeedFallback: (door: EntryCandidate) => RoomFeed }): RoomRun[];   // more than one run for a room only for 'blocks'

// route-combine.ts
export interface RoomDoorPlan { door: EntryCandidate; run: RoomRun; branch: Vec2[]; spine: Vec2[]; tapMm: Vec2; carrierId: string }   // one door of a room
export interface RoomFeedMulti { roomId: string; doors: RoomDoorPlan[]; leftPortIds: string[] }              // several doors only for 'blocks'
export interface TwoLevelFeedsResult { rooms: RoomFeedMulti[]; unfedRoomIds: string[] }
export function combineRoomRuns(input: { ... }): TwoLevelFeedsResult;
```

**Result type (finding H2).** `RoomFeedResult` (`route-feeds.ts:38`) holds one branch for one room, and `bestRoomReach` (`route-room-reach.ts:103`) returns one reach. Blocks need several doors for one room. So P2 does not return `RoomFeedsResult`. It returns `TwoLevelFeedsResult`, where each room has a list `doors` (one entry for every pattern except `blocks`). The function `combineRoomRuns` calls `bestRoomReach` once for each block (not once for each room). `route-build.ts` reads `TwoLevelFeedsResult` in its own branch of the `twoLevel` code. The old modes keep `RoomFeedsResult` unchanged.

**How combine selects the doors of the blocks.** `roomRunFor` returns the runs of a room: one run, or one run for each block. For the first run, combine calls `bestRoomReach` with the candidates of the room. For each next block, combine calls `bestRoomReach` again with the candidates that are at least `doorMarginMm` and one duct width away from the doors already chosen (so two holes do not touch). The cost of a block is its own run cost. If a block has no pair, its terminals go to the loose list; the other blocks stay. If every block but one fails, the room is a single-door room with the stem of the longest comb, and the report counts it. The total number of holes in a room is counted in the stats (D4, D-note 9 in section 5).

### 4.3 The three modules

**mainRun (rules R1, R2, R8, R11, R12).**
1. *Candidate lines.* For each axis-aligned edge of a ring of a route-area path room that is at least 2000 mm long (planner value), make a line parallel to the edge, `mainOffsetMm` inside the room. Also make the lines through the start point. Cut each line to the pieces that stay in the region `withWallGaps(insideRouteArea(areaRooms))` (the region of the old trunk, `route-trunk.ts:214-215`). Merge lines of the same coordinate within 200 mm. The wall gaps between two corridor rooms (`area.links`, `route-area.ts:54`) let a line cross from one corridor room to the next. Each such crossing is counted (D4): the stats get `corridorGapCrossings` and the plan gets the warning `corridor-gap-crossed` (count and points). A gap in a wall between two corridor rooms can be a fire door or a fire wall; the planner does not know (not verified).
   *Offset clamp (D1).* The offset of a line is `min(mainOffsetMm, w/2 - ductWidthMm/2)` where `w` is the width of the corridor room across the line (distance between the two long walls). In a corridor of 1.5 m or less, both lines collapse into one line on the centre. When two parallel lines of one corridor remain, they keep at least one duct width between them (centre to centre at least 2 x `ductWidthMm`; if not, keep only the line nearer to the demands). `ductWidthMm` comes from the sizing step if known, else 400 (planner value; not verified for the project). No line is made in a shaft room (`kind === 'shaft'`, the ids in `shaftRoomIds`).
   *Other networks (D2).* A candidate line is cut where it comes within `clearanceMm` of a segment of another network (`blockers`: the polylines of the existing segments with another `networkTypeId`, from `state.segments` in page space, converted to mm). The same blockers apply in `roomRunFor` (stems, teeth, leads) and in the doors of `roomEntryCandidates` (a door within `clearanceMm` of a blocker is dropped). Reason: supply and return are routed one after the other; the second run must not take the line or stem of the first.
2. *Demands.* For each served room, the `doorsMm` are the entry candidates of `roomEntryCandidates` (the real wall point, the ring points, and the points in line with each terminal). For each door, cast the ray `outward`. The first main line that the ray hits within `reachMm` gives a *hit node*. A room with no hit is in `unreachedRoomIds`.
3. *Tree.* Build a graph: nodes = line ends, line crossings, hit nodes, the root. Edges = pieces of a line between two nodes. Run `steinerTreeWithTurns` (`route-steiner.ts:154`) with `bendMm` (the bend price of the options) from the root to the hit nodes of all rooms. `steinerTreeWithTurns` connects all terminals it gets (`route-steiner.ts:154`); it has no choice among a group. So the planner picks ONE hit node for each room before the call (finding H1). The pick: the hit node with the lowest cost `distance(root, hit by the graph) + hit ray length`; ties go to the lower node id. Then the planner runs the solver. Then it makes a second pass (at most 2 rounds): for each room, test the other hit nodes of that room; if a node is already in the tree, or lies nearer to the tree than the picked one, switch the room to it and run again. The loop stops when no room changes (a test pins the stop and the order independence). So "served" means: the picked hit node is in the tree, and `chosenHitByRoom` records it. Combine reads `chosenHitByRoom` only as a hint; combine chooses the door by cost on the real legs (see combine). The tree is the main run. Pieces of one line that touch end to end make one straight path (a test pins that a line is one path, so the straight pieces are long, R1).
4. *Root.* The start joins the nearest main line with a stub, as the old code does for `rootPointMm` (`route-build.ts:321-329`). The stub is an elbow path (`elbowPath`, `route-layout.ts:80`).

*Why this keeps R12:* a bend of the main run exists only where two lines meet. The turn price keeps the number of such places small.

*Main run through a room that is not a corridor (R9).* The default is no (`crossRooms` absent). The old rule holds: the main run stays in the route area. Rooms that the lines do not reach (far rooms) then use the chain pass (`maxChainDepth`) or the old links. If the user answers Q-P2-02 with yes, task P2-T07 adds *bridge lines*: a straight piece that leaves a corridor, crosses one room that has no terminal and is not in the route area, and ends in a corridor or at the wall of a far room. A bridge counts the wall crossings in the stats (`wallCrossingsRoom`, `route-build.ts:583-585`) and gives a new warning `main-crosses-room` (ids and count). It is never allowed through a room with a terminal of the network type that is routed (test "no terminal" per network type: a room with only a return terminal counts as free for a supply route, but the user may not want it; the provisional rule is that the room has no terminal of ANY routing target, D3), a shaft, or a room whose type id is in the ban list. The default ban list (provisional): stair, lift, kitchen, shaft, and residential or sleeping rooms, because a duct through them crosses a fire compartment (from memory, no clause number: not verified). The room type library has no mark for these types (R-6). So the code matches the default list by room name or type name (case-insensitive words: "stair", "lift", "elevator", "kitchen", "shaft", "residential", "bedroom", "apartment"), and the user supplies or edits the list (Q-P2-02 asks for it; the option is `neverCrossTypeIds`). The user may allow a type. Several holes in a fire wall mean several fire dampers; the report counts them. Reason for the rule: the route area of the user is the set of rooms for ducts and pipes (D-R4-01). A bridge breaks that set only when the user agrees, and the plan shows each crossing as a wall crossing (fire damper to check, P1 plan section 4.6 "Walls and fire rating").

**roomRuns (rules R3, R4, R5, R6, R7, R10, R11).** For one room and one door:
- `outward` = unit axis vector away from the room at the door. The stem axis is `outward` or its perpendicular.
- *Single terminal (R3):* the door is the `port-line` candidate (the terminal lies on the line through the door along `outward`). The run is one straight line from the terminal to the door. 0 bends. If no such door lies on the shared wall stretch, the run has one L (1 bend) and the report counts it.
- *Several terminals (R5):* group the terminals into rows (same coordinate along `outward`, tolerance 300 mm, planner value). The stem runs along `outward` at the middle of the terminals across the rows. Each row gets a tooth from the stem to its terminals. A row of two terminals gets two pieces, one to each terminal, that meet at the stem tee (D5): a terminal is the END of a branch, so a straight bar through two terminals is not allowed. A terminal that lies on the stem gets a short stub (the stem ends in a tee, the stub is `stubMm` long, default 150, planner value) and the stem does not run over the port. Task P2-T08 checks `runsOverOtherPort` (`route-topology.ts:308`) and adds the test "no port has more than one connected segment end". 0 bends. Stems, teeth and leads stay out of the blockers (D2) and keep `doorMarginMm` from wall ends, columns and corners (D7); the door candidates of `roomEntryCandidates` that break this are dropped.
- *Blocks (R6):* when the room has `splitFromTerminals` terminals or more in rows along the corridor wall, split them into blocks of 2 columns. Each block is a comb with its own door. The condition is not proven (open point of the analysis). P2-T09 measures the manual route first and fixes the rule from the numbers (Q-P2-04). Default: one hole.
- *L (R7):* when the corridor wall is parallel to the rows, the stem runs along the wall, ends past the last row and turns 90 degrees to the door. This is one bend. The planner tries both stem axes for each door and takes the lower cost (length plus `bendMm` for each bend).
- *Fallback:* when no pattern reaches all terminals (an L-shaped room, a pillar), call `roomFeed` (`route-room-feed.ts:70`) for that door. The run is marked `pattern: 'fallback'` and the report counts it. No terminal is left out silently: `leftPortIds` lists them, and they go to the loose list as today.
- *No chain through a served room (R10):* a run stays inside its own room. A test checks it with the same sampling as `hitsOtherRoom` (`route-feeds.ts:187-195`).

**combine (rules R4, R8, R10).** For each room, nearest to the start first (the order of `route-feeds.ts:110-112`):
0. *Only built legs (M6).* Combine uses only the legs of the built tree (`MainRun.paths`), never the candidate lines. A door whose foot lies on no leg of the tree has no pair. A room with no pair for any door goes to the chain pass (step 5).
1. Call `bestRoomReach` (`route-room-reach.ts:103`) with `carriers` = the legs of the main run, `candidates` = the doors of the room, and `extraCostMm` = the cost of the room run of that door (length plus `bendMm` for each bend plus 5000 mm for each terminal left, the cost rule of `route-feeds.ts:138-144`, constant `LEFT_PORT_MM`). Then the pair (door, tee) with the lowest total cost wins. A straight pair (the tee is the foot of the door) has no bend; an L pair has one.
2. `pathOk` = the branch stays out of every other served room (`hitsOtherRoom`), `accepts(path)`, and `!runsOverOtherPort` (all three exist in `route-feeds.ts:187-203`).
3. The tee spacing is `teeSpacingMm` (D6): at least one duct width or 1.5 x DN of the branch, never less than 300 mm (`placedTaps`, as today uses 300; a duct of 400 mm or more would have fittings that touch at 300 mm). Sizing comes after the plan (not known here), so the default is 600 mm and the sizing step may report a clash later (not verified how sizing reacts). The tee of a pair is the foot (R8). The 90 degree fitting loss is a sizing matter, not a layout matter (D8).
4. The branch plus the stem (or the lead) is tagged `branch`. The teeth are tagged `spine`. So the metrics and the trace keep working.
5. A room that has no pair is a far room. It tries the chain pass (`maxChainDepth`; the same pass as `tryChain`, `route-feeds.ts:221-284`, with the host junction as carrier). A chain keeps the rule of Q-P1-11 (M7): it extends the main branch of the host room and never takes a path of a spine. The depth is the answer to Q-P1-16 (one question, no second P2 copy). If that fails, its terminals go to the loose list and `connectLoosePorts` joins them (`route-build.ts:408-419`).

### 4.4 Which old modules P2 reuses and which it drops

| Module | Reuse? | Why |
|---|---|---|
| `route-area.ts` (area, entries, links, wall stretch) | Reuse | Corridor rooms and wall stretches are the input. |
| `route-room-entry.ts` (`roomEntryCandidates`) | Reuse | The doors. The `port-line` points give the straight single-terminal run. |
| `route-room-reach.ts` (`bestRoomReach`) | Reuse (combine) | It already picks the pair door and tee by cost. Its `extraCostMm` carries the room run cost. |
| `route-feeds.ts` (`hitsOtherRoom`, `inPortRoom`, `tryChain`, chain checks) | Reuse by refactoring the helpers into functions with explicit arguments in a shared file (task P2-T10a, refactor only) | One copy of the room test and of the chain pass. No second copy (rule 3 of `rules.md` section 3). |
| `route-room-feed.ts` (`roomFeed`) | Reuse as fallback only | Good for irregular rooms. Not the main shape. |
| `route-steiner.ts` (`steinerTreeWithTurns`) | Reuse | For the main run tree. |
| `route-topology.ts` (`buildRouteItems`, `connectLoosePorts`, `runsOverOtherPort`) | Reuse | Tees, elbows and the safety net for loose ports. |
| `route-checks.ts`, warnings, `route-finish.ts`, flow and sizing steps of `planRoute` | Reuse, no change | The checks after the plan stay the same for every mode. |
| `route-trunk.ts` `buildTrunk` (centre-line Steiner tree) | Not used under `twoLevel` | The main run does not use the centre line (finding 1). The file stays for the other modes. |
| `route-branch.ts` `planBranches`, `route-hanan.ts` `roomSpine` as primary shape | Not used under `twoLevel` | The patterns replace them (finding 2). `roomSpine` stays inside the fallback. |
| Options `exactSpine`, `linkSearch`, `fewRoomBends`, `slideRun`, `bridgeParts`, `trunkBends`, `entryRule`, `offGraphAxis` | Ignored under `twoLevel` | They tune the old modules. A test pins that they do not change a `twoLevel` plan. |
| Option `jogSmallJumpMm` (L13) | Ignored under `twoLevel` | It cleans jogs of the old trunk and feeds. The plan has no jog (straight lines, tee at the foot). Not verified where `jogSmallJumpMm` is read (T11 greps for it and lists the readers in its report); the hash test in T11 includes it. |
| `corners` | Kept | The plan has only 90 degree bends (R11), so `right` changes nothing. `diagonal` (P1-T21, when built) cuts corners after the plan. |
| `bendPenaltyMm`, `crossingPenaltyMm` | Kept | They are the prices of the main run tree and of the room run cost. |

### 4.5 What `planRoute` reads from `trunk` (finding M5)

`buildTrunk` is used at `route-build.ts:315`. The code reads the result later in these places: `trunk.rootPointMm` (`:321-329`, the root stub; `:362`, `:382`), `trunk.edges` (`:330`, the pushed trunk paths; `:361`, `:381`), `trunk.offGraphRoomIds` (`:337`, `:357`, `:445`), `trunk.served` (`:341` for `branchRooms`, `:356`) and `trunk.freeEdges` (`:444`, the warning `free-angle`). Under `twoLevel`, task P2-T11 builds a synthetic `TrunkResult` (the type of `route-trunk.ts:35-60`) so that these reads stay valid: `edges` = the paths of the main run (one edge per straight path, with id and path), `rootPointMm` = `MainRun.rootPointMm`, `served` = the rooms with a main-run hit (shape as the type needs; the task copies the fields from the type and lists any that need a value), `offGraphRoomIds` = `unreachedRoomIds`, `freeEdges` = `[]` (the plan has no free angle). The line `:337` (`if (!options.roomBranches) ... loosePorts.push`) gets `&& !options.twoLevel`, because the far rooms of `twoLevel` go to the chain pass first. Not verified: the full field list of `TrunkResult` and `branchRooms` use; the task reads them first.

## 5. How P2 keeps the rules of `rules.md` section 3

1. **Segment defines the network type of a port.** The mode makes geometry only. `planRoute` writes the network type of the request on the segments and writes nothing on a port. The foreign-start check and the foreign-join check run before the mode (`route-build.ts:213-232`, `:262-273`) and are not changed.
2. **Cascade invariant.** The result passes `checkInvariant` (`route-build.ts:480-489`) like every plan. A plan that would join two types is refused. P2-T11 has a test with a foreign network next to the corridor. The mode joins no corridor graph part with another (the main lines stay in the route area).
3. **Reuse before new.** Section 4.4. New files hold only the three new algorithms. The UI reuses the preview flow of P1 (section 8). No new stored state.
4. **Adoption trap.** `applyRoute` adopts the network types first (`scene.ts:3044`, per P1 plan). P2 does not change `applyRoute`. The browser check places a route in a project with an empty `networkTypes` list.
5. **Real DOM.** The browser check clicks the real chip and the real Place button. The scene API is for setup and for reading state.
6. **Merge lesson.** After a merge of a sibling branch (P1 UI tasks), run `pnpm build` at the root.

Walls: the planner does not know fire ratings. Each wall crossing is counted and shown (`wallCrossings`, P1-T24, built). Blocks (R6) make several holes in one wall. That changes the answered decision Q-P1-12 A ("one hole for each room"). See Q-P2-04. Until the user answers, the default is one hole (`splitFromTerminals` = Infinity), so the chip keeps Q-P1-12 A.

Notes (D8 to D10, D4):
- The loss of a 90 degree fitting is a sizing matter. P2 counts bends only.
- Several holes in one wall mean several fire dampers. The stats count holes for each room and for each wall.
- The preview is a plan layout in 2D only. It does not show heights, ceiling clashes or other services.
- Each wall gap crossed in a corridor (`area.links`) is counted in the stats and shown as the warning `corridor-gap-crossed`.

## 6. Order and phases

Order: A (data and the metric, no planner change) -> B (the three modules, each pure and tested alone) -> C (wire, gate, fix rounds) -> D (UI and pictures). Phase A can start with no user decision. The main run through other rooms (P2-T07) waits for Q-P2-02. Blocks (P2-T09) wait for Q-P2-04 for the final rule, but the first measurement runs without it. Phase D waits for part P1 (see T15 and T16).

Commands (from the root of the worktree, one command for each Bash call): `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm typecheck`, `pnpm build`, `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. Screenshots: `/tmp/mepapp-shots/`, name `P2-Tnn-<name>`. Never commit a local fixture or an ignored PDF. A test that needs a local fixture prints `SKIP` when it is missing (as `route-room-branch-report.test.ts:148-152`).

Default output rule for every task: with `twoLevel` absent, the plan hash must equal the hash before the task. Hash prefixes (from P1-T27): first floor A `03b3135ca4c7`, B `f7801a9c5fcf`; `w_rooms-2` A `08663b7b054b`, B `bd80a5e0c823`; `w_rooms` A `a0ec64d2ff7c`, B `13cc1ff90f43`; 10A A `96b0721d9d7c`, B `13fadd36cd71` (`route-layout-presets.md`, P1-T27 result; the harness function is `planHash`, `route-scenario.testutil.ts:216`). A task that touches `route-build.ts` runs this check and prints the hashes.

### Phase A. Data and the metric

#### P2-T00. Copy the analysis scripts (the director does it, L14)
- **Size:** S. **Depends on:** nothing. **Who:** the director, before any other task.
- **What:** copy `extract.mjs`, `vec.mjs`, `analyze.py`, `sbs.mjs` and `results.json` from the scratchpad `/tmp/claude-0/-root-MepApp--claude-worktrees-routing-feedback/4946bbd0-c4f1-4f63-99c6-5b34c429a21c/scratchpad/p2-analysis/` to `.claude/roadmap/tools/p2/` (the folder does not exist yet; create it). Commit them. Do not copy `side-by-side.png` (a picture of 1 MB or more; the task T17 makes a new one). T02 and T17 read their scripts from this folder.
- **Verify:** `git status` shows the files in `.claude/roadmap/tools/p2/`; `cmp` of each file against the scratchpad copy.

#### P2-T01. The option type `twoLevel` (type only)
- **Size:** S (about 40 lines). **Depends on:** nothing.
- **Files:** `packages/core/src/route-layout.ts` (`TwoLevelOptions`, field `twoLevel?`, add `'twoLevel'` to `PrototypeLayoutKey` at `:36`), `route-build.test.ts`.
- **Shapes:** section 4.2.
- **Must not touch:** the planner, the defaults, any output.
- **Verify:** core test: `DEFAULT_LAYOUT_OPTIONS` has no key `twoLevel`; a call with `{ ...DEFAULT_LAYOUT_OPTIONS, twoLevel: {} }` returns the same plan as the call with `DEFAULT_LAYOUT_OPTIONS` alone (L12; nothing reads the field yet; deep-equal on the first floor). `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check.

#### P2-T02. Fixture of the hand route (local, git-ignored) and the loader
- **Size:** M (about 140 lines: script 90, loader 50). **Depends on:** nothing.
- **Files:** `.claude/roadmap/tools/p2/extract-manual.mjs` (new; copy of the logic of the analysis `extract.mjs`, `vec.mjs`; uses the `pdf-engine-mupdf` package, not `mupdf` directly), `packages/core/src/route-scenario.testutil.ts` (new function `manualScenario(): { scenario: Scenario; manual: ManualRoute } | null`).
- **What the script does:** reads `fixtures/pdfs/00_arch_ground_floor_w_rooms_route_manual.pdf`. It writes `packages/core/fixtures/route-area/local/w-rooms-manual.json` with: `rooms` (the 51 rooms of the manual project, with `roomTypeId`), `mmPerPt`, the 58 terminals and the unit (stamp positions, ports, routing targets), and `manual`: the blue and red strokes as polylines in page points, each with its colour (`main` for blue, `room` for red). The file is under `local/`, which git ignores (not re-checked: verify with `git check-ignore` in the task).
- **Shapes:** `interface ManualRoute { main: Vec2[][]; room: Vec2[][] }`. The loader builds a `Scenario` (`route-scenario.testutil.ts:43-55`; `buildScenario` at `:69` takes a `Drawing` and makes synthetic stamps, so the loader fills the fields itself) with these fields: `drawing` = `{ name: 'manual', mmPerPt, rooms }` from the JSON; `kind` = `'A'` (the field has no meaning here; the type allows only `'A' | 'B'`, so the loader sets `'A'` and a comment in the test says so); `pageIndex` = the page of the rooms; `area` = `computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex })` (as `:72`); `startRoom` = the room that holds the unit; `servedRooms` = the rooms that hold a terminal; `stamps` = the real stamps (`RouteStamp[]`, 59); `targetPorts` = `findRoutePorts` (`route-ports.ts:101`) filtered to the routing targets (58); `startStampId` and `startPortId` = the unit and its port; `networkTypeId` = the network type of the stamps. Not verified: the real routing target and port ids; the script prints them and the loader reads them from the JSON.
- **Must not touch:** product code. The fixtures policy: the file comes from the real PDF, never synthetic.
- **Verify:** core test `manualScenario()` is `null` when the file is missing (prints SKIP) and, when present, returns 58 target ports in 22 served rooms and 59 stamps. The script prints the number of main strokes (6 expected, analysis file) and room strokes. `git status` shows the JSON is untracked and ignored. `pnpm --filter @mepapp/core test`, `pnpm typecheck`. No browser check.

#### P2-T03. The shape metric (pure)
- **Size:** M (about 150 lines). **Depends on:** P2-T01.
- **Files:** `packages/core/src/route-shape-metrics.ts` (new), `route-shape-metrics.test.ts` (new).
- **Shapes:**
  ```ts
  export interface ShapeMetrics {
    lengthMm: number;
    bends: number; bends90: number; bends45: number;
    bendsServedRooms: number; bendsCorridors: number; bendsOther: number;
    tees: number; crosses: number;
    straightPieces5m: number; longestStraightMm: number;
    meanBendsToTerminal: number; maxBendsToTerminal: number;
    pathToManhattan: number;                       // mean over terminals
    multiEntryRooms: number; chainedRooms: number;
    singleTerminalStraight: { rooms: number; straight: number };
    teeOffsetMm: { max: number; median: number };  // distance of each branch tee from the foot of the perpendicular from its door
    longestPathFromStartMm: number;                // D7: longest path along the network from the start to a terminal
    branchLengthP90Mm: number;                     // D7: 90th percentile of the length door to tee
    portsWithManyEnds: number;                     // D5: ports with more than one connected end (must be 0)
  }
  export function shapeMetrics(input: { polylines: readonly (readonly Vec2[])[]; terminalsMm: readonly { id: string; point: Vec2; roomId: string | null }[]; startMm: Vec2; rooms: readonly Room[]; area: RouteArea; mmPerPt: number; pageIndex: number }): ShapeMetrics;
  export function polylinesOfPlan(plan: PlannedRoute, mmPerPt: number): Vec2[][];   // merges collinear segments of one run
  ```
  The metric works on polylines, so it measures the plan and the hand route with one function. A bend is a vertex where two legs meet with a turn of 20 degrees or more (the threshold of `isTurn`, `route-steiner.ts:136-139`). A place is the room that holds the vertex (`roomsAtPoint`, as `route-metrics.ts:7`).
- **Must not touch:** `route-metrics.ts` (it stays as the metric of the old gates).
- **Verify:** core tests with hand polylines (an L, a Z, a comb: bends, straight pieces, tee offset, path to Manhattan). Cross-check on a real plan (first floor, default): `bends90 + bends45` of `shapeMetrics` equals `bendsArea90 + bendsArea45 + bendsRoom90 + bendsRoom45 + bendsOutside` of `routeMetrics` (`route-metrics.ts:43-47`) (or the difference is printed and explained in the test). Core tests, typecheck, build.

#### P2-T04. Gate M0: the metric reproduces the numbers of the analysis
- **Size:** S (about 70 lines of test). **Depends on:** P2-T02, P2-T03.
- **Files:** `packages/core/src/route-two-level-manual.test.ts` (new).
- **What it does:** `shapeMetrics` on the manual polylines gives, within a tolerance of 5 percent for length and exactly for counts: 12 bends, all 90 degrees; 6 in served rooms, 5 in corridors; 234.0 m; 7 straight pieces of 5 m or more with the longest 28.2 m; mean bends to a terminal 4.0, max 5; 2 rooms with more than 1 entry; 0 chained rooms (the table of `auto-routing-two-level-analysis.md`). It also runs the old auto route (default options) on the same scenario and prints the second column (analysis: 89 bends, 278.4 m).
- **Missing fixture (M10):** the fixture is git-ignored, so a fresh checkout has none. Rule: when the flag file `.claude/roadmap/tools/p2/assert.flag` exists (see T12) and the fixture is missing, the gate test FAILS with the message "manual fixture missing: run extract-manual.mjs". It does not skip. Without the flag file, a missing fixture prints SKIP.
- **If a number differs:** the test prints both. The director decides if the analysis or the metric is wrong. Phase B does not start before M0 passes: the target must be right.
- **Verify:** `pnpm --filter @mepapp/core test` (SKIP when the fixture is missing). No browser check.

### Phase B. The three modules

#### P2-T05. mainRun, candidate lines (pure)
- **Size:** S (about 110 lines with tests). **Depends on:** P2-T01.
- **Files:** `packages/core/src/route-main-run.ts` (new, `mainRunLines`), `route-main-run.test.ts` (new).
- **Shapes:** section 4.2 (`MainLine`, `mainRunLines`). Region: the caller passes `inside`.
- **Must not touch:** `route-trunk.ts`, `route-layout.ts`.
- **Verify:** core tests: a rectangle corridor gives lines at the offset from each long wall and one through the start; a corridor 1.5 m wide gives one centre line, not two (D1); two parallel lines are at least one duct width apart; a shaft room gets no line (D1); a line is cut near a blocker segment of another network with clearance (D2); the conversion with `mmPerPt` = 17.64 gives the same line positions as the numbers of the analysis in PDF units (L16: the test uses 17.64 mm per point on the manual fixture, SKIP when missing); a line is cut where the region ends; two corridor rooms with a wall gap give one line that crosses the gap; lines within 200 mm merge; the output is deterministic and the same for a shuffled ring order. On the manual fixture (SKIP when missing): the 3 corridor rooms give at least the 4 lines of the hand route within 500 mm (west x=821.5 pt-converted, north y=916, cross y=2260, east x=1634; the numbers of the analysis are in the units of the PDF: the test converts them with `mmPerPt` and says so). Core tests, typecheck, build.

#### P2-T06. mainRun, the tree (pure)
- **Size:** M (about 150 lines with tests). **Depends on:** P2-T05.
- **Files:** `route-main-run.ts` (`planMainRun`), `route-main-run.test.ts`.
- **Shapes:** section 4.2. The graph is built from the lines; the solver is `steinerTreeWithTurns` (the task checks that its input type `SteinerTurnGraph` fits; if not, it uses `steinerTree` plus a count of turns and says so in the report).
- **Must not touch:** `route-steiner.ts`.
- **Group choice (H1):** `planMainRun` picks one hit node for each room before the solver call, then runs the 2-round switch of section 4.3.
- **Verify:** core tests: two rooms on one line give one straight path; a room on a second line adds a tee and one turn at most; a room with two hit nodes (one far, one near the tree) gets exactly one hit node in the demand set and the tree has no branch to the second (H1); a room that no ray reaches within `reachMm` is in `unreachedRoomIds`; the result is a tree (no cycle: node count = edge count + 1 per part); the order of the demands does not change it; a higher `bendMm` never gives more turns. On the manual fixture: the main run has at most 8 bends (hand route: 5 in corridors; the 8 is a planner margin, not verified), every room with a hit is within `reachMm`, length at most 110 percent of the 89.3 m of the hand main run (planner value). Print the lines and the number of rooms that are not reached. Core tests, typecheck, build.

#### P2-T07. mainRun, bridge through rooms with no terminal (waits for Q-P2-02)
- **Size:** M (about 120 lines). **Depends on:** P2-T06 and the answer yes of Q-P2-02. If the answer is no, the task is cancelled and no code is kept.
- **Files:** `route-main-run.ts` (bridge lines when `twoLevel.crossRooms` is set), `route-plan-warnings.ts` (new code `main-crosses-room`), `route-build.ts` (one push of the warning, in T11), tests.
- **Shapes:** a bridge line is a `MainLine` with `bridge: true` and the id of the crossed room. It is allowed only when the room has no terminal, is not in the route area, is not a shaft, and its type id is not in the list that Q-P2-02 sets. At most `maxRooms` rooms in one bridge. The price of a bridge is its length plus 3000 mm (`DEFAULT_WALL_MM`, `route-room-reach.ts:10`) for each wall crossing, so a bridge is the last choice.
- **Ban list (D3):** `neverCrossTypeIds` default = the provisional list of section 4.3 (stair, lift, kitchen, shaft, residential), matched by room name or type name because the library has no marks (R-6). The user supplies or edits the list (Q-P2-02). The user may allow a type.
- **Verify:** core tests: a far room behind an empty room gets a bridge; a room with a terminal is never crossed; "no terminal" is tested per network type (a room with a return terminal only, routed as supply: the provisional rule bans it, a test pins that); a room named "Stair" or "Kitchen" is never crossed with the default list and is crossed when the user lists it as allowed (D3); the warning lists the crossed rooms; the wall crossing count of the plan includes both walls. On the manual fixture: the main run reaches room-15 (the entrance room, 8.1 m of crossing in the hand route) and the bridges number at most 2 (planner value). Core tests, typecheck, build.
- **Result (T07, done; commit "P2-T07: ..." on this branch; Q-P2-02 answered B, Q-P2-09 answered A):** pure code, not wired into `planRoute` (T11 does that).
  - `mainBridgeLines` (`route-main-run.ts`) casts each door ray to the nearest corridor line. It makes a bridge line when the ray crosses 1 to `maxRooms` rooms that pass `bridgeRoomAllowed` (no terminal of ANY routing target, not route area, not shaft, not on the ban list) and no blocker is near. The default ban list is matched by room name or type name (words stair, lift, elevator, kitchen, shaft, residential, bedroom, apartment). A given `neverCrossTypeIds` replaces the default words and matches `typeId`; `[]` allows everything.
  - `planMainRun` prices a bridge edge at length + 3000 mm for each wall crossing (rooms + 1). A door that has a bridge ending at it uses only the bridge hit. Bridge tracks are never a root, a join end or a tee target. A bridge piece never merges with a corridor piece.
  - `mainCrossesRoomWarning(lines)` in `route-plan-warnings.ts` gives code `main-crosses-room` with ids, count and numbers `{ bridges, wallCrossings }`. The UI has two texts for it. `route-build.ts` is not changed (T11 pushes the warning).
  - The caller passes ONLY the doors that may get a bridge to `mainBridgeLines`, and passes to `planMainRun` only the extra doors that end a bridge. Reason: `hitOf` ignores rooms, so a plain extra door would tee through a room with no price.
  - Manual fixture (doors of `roomDoorCandidates` with `probeMm` 15000): before 21 of 22 rooms, tree 94.52 m, 4 bends. After 22 of 22, 1 bridge, tree 99.26 m, 5 bends. The bridge crosses room-19 (Invoerkasten, technical) for 1.77 m and feeds room-33. The 99.26 m is 11 percent over the 89.3 m of the hand route; the gate of T06 (110 percent = 98.23 m) holds for the run with no bridge. The bridge costs 4.74 m for one more room. Room-15 is not crossed: no room needs it.
  - Not done: two bridge tracks that share one graph edge use the room list of the first (rare, stacked doors on one ray).

#### P2-T08. roomRuns, single terminal and comb (pure)
- **Size:** M (about 150 lines with tests). **Depends on:** P2-T01.
- **Files:** `packages/core/src/route-room-runs.ts` (new), `route-room-runs.test.ts` (new).
- **Shapes:** section 4.2 (`RoomRun`, `roomRunFor`; patterns `single` and `comb`).
- **Must not touch:** `route-room-feed.ts`, `route-room-entry.ts`.
- **Verify:** core tests. One terminal in line with a `port-line` door: 0 bends, one straight path. One terminal off the door line: one L, 1 bend, `pattern: 'single'`. Two terminals in a row: two pieces, one to each terminal, that meet at the stem tee (D5; no bar through both; the tee is within 50 mm of the middle). Six terminals in 3 rows of 2 (D5, as built): a stem and 3 teeth, each tooth in two pieces, 0 bends, one door. Every terminal is on a path (distance 0). No path leaves the room polygon (region test `insideRouteArea([room])` with 150 mm tolerance, `route-layout.ts:154`). Two terminals in a row never share one straight piece: each terminal is the end of its own piece (D5). A terminal on the stem line gets a stub and the stem does not run over the port (`runsOverOtherPort`, `route-topology.ts:308`, is called on the result). A test on a whole plan (first floor, `twoLevel: {}` once T11 exists; in T08 on the room run built into a plan by `buildRouteItems`): no port has more than one connected segment end. Stems and teeth stay `clearanceMm` away from a blocker segment of another network; a door within `clearanceMm` of a blocker, and a door nearer than `doorMarginMm` to a wall end, a column or a corner, is dropped (D2, D7). Test "route supply, then route return": the two plans share no corridor line and no stem (D2; it runs fully in T11). A room with an L-shaped polygon where the pattern fails returns `pattern: 'fallback'` (the fallback is a stub in this task: it returns the `leftPortIds`; T09 connects `roomFeed`). Deterministic. Core tests, typecheck, build.

#### P2-T09. roomRuns, blocks, L, and the fallback
- **Size:** M (about 150 lines). **Depends on:** P2-T08, and a measurement (first step below). The final split rule waits for Q-P2-04 (merged question). Until the user answers, the default of `splitFromTerminals` is Infinity (one hole), and the tests set the value on purpose.
- **Files:** `route-room-runs.ts`, `route-room-runs.test.ts`; a throw-away report test `route-two-level-rooms-report.test.ts` for step 1.
- **Step 1 (measurement, no product change):** on the manual fixture, for rooms 22 and 26 (blocks) and rooms 5 and 24 (6 terminals, one door), print the terminal coordinates, the row direction, the wall direction and the number of holes of the hand route. From the numbers, write the rule for `splitFromTerminals` and the row tolerance into this file. If the numbers do not give a rule, stop and ask the user (Q-P2-04).
- **Step 2:** patterns `blocks` (a room with `splitFromTerminals` terminals or more gets blocks of 2 columns, each a comb with its own door) and `l` (stem along the wall; both stem axes are tried for every door and the lower cost wins). The fallback calls `roomFeed` (`route-room-feed.ts:70`) with the door.
- **Result of the measurement (Q-P2-04 answered B by the user; numbers from `route-two-level-rooms-report.test.ts`, mm, manual fixture).**
  - Rooms 5, 24, 20, 22: 6 terminals in 2 columns of 3 (a column runs along y). Room 26: 8 terminals in 2 columns of 4. Terminals of one row differ by at most 9 mm. Rows are 1200 mm apart or more (1800 or 2400 mm in rooms 5, 24, 20, 22, 26).
  - Rooms 5, 24, 20: the door wall is PERPENDICULAR to the columns (wall along x). The hand route has 1 hole and one comb (stem along the column direction, door in the middle). Room 20 is an L (1 bend, hole in the east wall).
  - Room 22: the door wall is PARALLEL to the columns (wall along y). The hand route has 2 holes. Hole 1 (y=37359) serves 4 terminals (rows y=36210 and 38610, middle 37410). Hole 2 (y=40464) serves the 2 terminals of the row y=41010 (the stem is 546 mm beside the row).
  - Room 26: the door wall is PARALLEL to the columns. 2 holes: y=28275 (rows 27347 and 29147, middle 28247) and y=32473 (rows 31547 and 33347, middle 32447). 4 terminals each, 0 bends.
  - Room 31: 1 hole, comb with the stem along the inward axis, 5 terminals, 0 bends. Room 29 (3 in a row, perpendicular wall): 1 hole.
  - **Rule.** The terminal count alone gives no rule: rooms 5, 24, 20 and 22 all have 6 terminals, and only room 22 splits. The rule is geometric. When the door wall runs parallel to a column of 3 terminals or more, one straight bar cannot serve the column. A bar serves 2 terminals at most, one on each side of its tee (D5). Then the room splits into blocks of 2 rows (4 terminals each). An odd last row is a block of 2 terminals. A door wall perpendicular to the columns needs no split.
  - The value of `splitFromTerminals` that matches the hand route is **6** (room 22 splits at 6). With the user wording "more than 6" room 22 would not split, so 6 is the value to use. The row tolerance is **300 mm** (any value from 10 to about 1190 mm gives the same rows on this fixture).
  - Not proven: only 2 rooms split (22 and 26), and both have the door wall parallel to the columns. A third example is missing.
  - Step 2 result on the manual fixture: room-26 gives a block plan (2 holes).
  - Room 22 gives none, because its vertical walls have no route-area room within the probe distance. The hand holes lie on vertical walls. This is a door data cause, not a split cause.
  - Room 31: the door of the hand route lies behind a non-route room on the probe ray, so `roomDoorCandidates` never offers it.
- **Verify:** core tests: a room of 8 terminals in 2 rows of 4 along the corridor wall gives 2 blocks with 2 doors and 0 bends; a room of 6 terminals in one block gives one door; the wall parallel to the rows gives the L with 1 bend; an irregular room gives `fallback` and every terminal is reached or listed in `leftPortIds`. Each run keeps R10 (no path leaves its room). Core tests, typecheck, build.

#### P2-T10a. Refactor: the feed helpers become functions with explicit arguments (H3)
- **Size:** M (refactor only, about 150 changed lines). **Depends on:** nothing in P2 (it can run in phase A). It must come before T10.
- **Why:** `hitsOtherRoom`, `inPortRoom`, `tryChain` and the chain helpers are closures inside `planRoomFeeds`. They capture `toPage`, `areaRooms`, `excluded`, `placedTaps` and `input` (`route-feeds.ts:89` `inPortRoom`, `:170` `placedTaps`, `:187` `hitsOtherRoom`, `:221-284` `tryChain`). They cannot move to another file as they are.
- **Files:** `packages/core/src/route-feed-helpers.ts` (new: `hitsOtherRoom(args)`, `inPortRoom(args)`, `chainRoom(args)` as pure functions; each argument that a closure captured is a named field of `args`), `route-feeds.ts` (the closures become thin calls with the captured values).
- **Must not touch:** behaviour. No new option. No change of `route-room-reach.ts`.
- **Verify:** the 8 plan hashes of section 6 (default options) and the 8 hashes with `roomBranches` (from P1-T27, `route-layout-presets.md`) are equal before and after; the task prints both lists. `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check.

#### P2-T10. combine (pure)
- **Size:** M (about 150 lines). **Depends on:** P2-T06, P2-T09, P2-T10a.
- **Files:** `packages/core/src/route-combine.ts` (new), `route-combine.test.ts` (new). It imports the helpers of `route-feed-helpers.ts`.
- **Owed from T09:** a `fallback` run has length 0 (it only lists `leftPortIds`). `combineRoomRuns` must add `LEFT_PORT_MM` (5000 mm) for each left port to `extraCostMm`, so a fallback door is not cheaper than a real run.
- **Shapes:** `combineRoomRuns(input): TwoLevelFeedsResult` (section 4.2; several `{ branch, spine }` for each room, one for each block). Uses `bestRoomReach` with `extraCostMm`, once for each block, with the block-door rule of section 4.2.
- **Must not touch:** `planRoomFeeds` and `RoomFeedsResult`, `route-room-reach.ts`.
- **Verify:** core tests. Combine uses only the legs of the built tree: a door whose foot lies on a candidate line that is not in the tree gets no pair (M6), and its room goes to the chain pass or the loose list. A room with 2 blocks gets 2 doors at least `doorMarginMm` and one duct width apart; a block with no pair does not remove the other block. A door whose foot lies on a main line gives a straight branch and the tee is the foot (offset 0). Two rooms facing one main line keep `teeSpacingMm` between their tees (default 600 mm; a test with a duct width of 500 mm gives at least 500 mm) (D6). A chain extends the main branch of the host and never takes a spine path (M7). The lowest total cost wins: a room with two doors picks the door with fewer total bends. A far room with a host chains at depth 1 only when `maxChainDepth` is 1. Same input twice gives the same result; the input order shuffled gives the same counts. The hash check on `roomBranches` plans (8 hashes) is equal to the list of T10a. Core tests, typecheck, build.
- **Result (T10, done; commit 0859014 "P2-T10: ..." on this branch):** pure code, not wired into `planRoute` (T11 does that).
  - `combineRoomRuns` (`route-combine.ts`) uses only the legs of `MainRun.paths` (M6). For each room it calls `bestRoomReach` once for the single-door option (all doors of `roomDoorRuns`, `extraCostMm` = run length + bends + `LEFT_PORT_MM` per left port) and once per block of each block plan. The lowest total wins; a tie goes to the single door. A block with no pair is unserved: its terminals go to `leftPortIds` and the other blocks stay. A run that serves no terminal is never offered.
  - Tee spacing: `max(teeSpacingMm ?? 600, ductWidthMm ?? 0)`, kept through blockers at 300 mm steps (effective spacing is the next multiple of 300) and a check against all placed taps. `pathOk` also rejects an L whose first piece runs along its carrier (review finding 1).
  - Chain pass: `chainRoom` and `hitsOtherRoom` of `route-feed-helpers.ts`, default depth 2. The junction of a host is its stem end (or the door point when it has no stem). Result types: `RoomDoorPlan {door, run, branch (tap to door), spine (= run.teeth, Vec2[][]), tapMm, carrierId}`; `RoomFeedMulti` has an optional `chain {viaRoomId, depth}`. Decision for T11: `run.stem` and `run.lead` stay inside `run`; T11 tags them `branch`.
  - Probe option: `RoomDoorInput.passableRoomAt` (route-room-doors.ts). Default output unchanged. The caller must pass `probeMm` 15000 and a predicate from `bridgeRoomAllowed`.
  - Manual fixture (22 served rooms; config A = default doors, config B = `probeMm` 15000 + `passableRoomAt`): A: 20 by tree, 1 chained (room-32 via room-6), 1 unfed (room-33), bends in served rooms 9 (hand 6), corridor bends 3 (hand 5), main tree 90.31 m, total 234.37 m (hand 234.0 m), 18 of 21 tees at offset 0, smallest tap distance 600 mm. B: 21 by tree, 1 chained (room-32), 0 unfed, bends in served rooms 11, corridor bends 2, main tree 82.18 m, total 230.59 m, 17 of 22 tees at offset 0. Rooms with more than one entry: room-26 only (hand: 22 and 26). Rooms 22 and 31 are served in both configs (room-31 is a `fallback` run in A and a `comb` in B). The doors step takes 24 s in B.
  - Open: room-32 is chained since the rule "no L along the carrier" removed its tree pair (hand route: 0 chained rooms). Room-22 gets one comb door, not the 2 holes of the hand route. The chain pass loop in `route-combine.ts` repeats the loop of `route-feeds.ts` (the body is the shared `chainRoom`). The fixture test has no hard length or bend gate (G-P2 is T12).

### Phase C. Wire, gate, fix rounds

#### P2-T11. Wire `twoLevel` into `planRoute`
- **Size:** M (about 120 lines). **Depends on:** P2-T07 (or its cancel), P2-T10.
- **Files:** `route-build.ts`, `route-build.test.ts`, `route-plan-warnings.ts` (code `main-crosses-room` if T07 is built).
- **What it does:** `if (options.twoLevel)` replaces both `buildTrunk` use and the room feed branch (`route-build.ts:315-392`): it builds the main run, the room runs, and calls combine. It pushes the main run paths with tag `trunk`, the combine branches with `branch`, the teeth with `spine`. The loose list and the steps after it are as today. The code builds a synthetic `TrunkResult` (section 4.5, M5) so that each later read of `trunk` stays valid: `rootPointMm` (`:321`, `:362`, `:382`), `edges` (`:330`, `:361`, `:381`), `served` (`:341`, `:356`), `offGraphRoomIds` (`:337`, `:357`, `:445`) and `freeEdges` (`:444`, empty). The warning `room-off-graph` lists `unreachedRoomIds` and the rooms that stay unfed. The warning `room-chained` stays. The task also passes the blockers (segments of other networks in `state.segments`, D2) to `mainRunLines` and `roomRunFor`, adds the stats `corridorGapCrossings` and `holesPerRoom` and the warning `corridor-gap-crossed` (D4), and lists the readers of `jogSmallJumpMm` (L13). If the task splits (the diff is over 150 lines), the director adds T11a (synthetic trunk and the branch) and T11b (blockers, stats and warnings).
- **Must not touch:** the code path with `twoLevel` absent (hash equal for the 8 plans of section 6), the checks after the plan, `applyRoute`.
- **Verify:** core tests. The 8 default hashes equal before and after (printed). `twoLevel: {}` on the first floor gives status `ok`, every terminal connected or in `ports-left`, no `internal-join`. A foreign segment next to a corridor line: the plan is `ok` or refused with the right code, never joins the foreign network (the cascade test). With `roomBranches` and `twoLevel` both set, `twoLevel` wins. The same input twice gives the same plan (D1). The input order shuffled gives the same counts (D2, as `route-quality.test.ts`). `exactSpine`, `linkSearch`, `entryRule` and `jogSmallJumpMm` set together with `twoLevel` do not change the plan hash. Test "route supply, then route return" (D2): after the supply plan is applied to the state, the return plan shares no line and no stem with it, and keeps `clearanceMm`; no port has more than one connected end (D5). `trunk.freeEdges` is empty: no `free-angle` warning. Core tests, typecheck, build.
- **Result (T11, done; T11a commit 427188f, T11b commit "P2-T11b: ..." that follows it on this branch):** `planTwoLevel` (route-two-level.ts) runs the main run, the room runs and combine, and builds the synthetic trunk; `planRoute` uses it when `twoLevel` is set (twoLevel wins over roomBranches; old tuning options ignored). T11b adds blockers (foreign segments) to the main run, the bridges, the room feeds and the loose links, the stub axis choice, stats `corridorGapCrossings` and `holesPerRoom`, and warnings `corridor-gap-crossed` and `start-stub-through-wall` (UI texts under 100 characters). Manual fixture through `planRoute` (`twoLevel: {}`): status ok, 228.1 m, 28 bends (11 in rooms, 8 in corridors, 9 other), 0 bends of 45 degrees, 1 chained room in the warning (room-32), 1 room off graph (room-33), 6 rooms with several entries by the metric, planRoute time about 1.2 s (3.3 s with `crossRooms`). The hand route is 234.0 m, 12 bends. No hard gate (G-P2 is T12).

#### P2-T12. Gate G-P2: the comparison with the hand route (metric and report)
- **Size:** M (about 150 lines of test). **Depends on:** P2-T11, P2-T04.
- **Files:** `packages/core/src/route-two-level-report.test.ts` (new; copy the shape of `route-room-branch-report.test.ts`: a default run that prints and asserts only that the plans are `ok`). The criteria go in a SEPARATE test file `route-two-level-assert.test.ts` (M9). That file asserts the criteria only when the flag file `.claude/roadmap/tools/p2/assert.flag` exists (the test checks it with `existsSync`); the flag file is git-ignored. No environment variable and no `package.json` script with a variable: the allow rules refuse an env prefix and `VAR=1 vitest` fails on Windows. When the flag file exists and the manual fixture is missing, the test FAILS (M10).
- **What it does:** it runs, on the manual scenario `M` (58 real terminals), the four plans: Balanced, `roomBranches` (`{ searchMm: 30000 }`), `twoLevel` and the hand route. It prints one table with the columns of `ShapeMetrics` and the columns of `route-metrics` that the old G0 used (`chainedRooms`, `multiEntryRooms`, `bendsOutside`, `portsLeft`, `wallCrossings`). It prints a second table for the tee points: for each room that has a branch in both routes, the distance between the tee of the plan and the tee of the hand route along the main line, and whether both use the same main line.
- **Criteria (the assertions of the analysis file; the numbers are the hand route, the margin is a planner value and the first run may change it, the director records the change):**
  - G1. No 45 degree leg: `bends45 == 0` and no free leg.
  - G2. `bendsServedRooms <= 8` (hand route 6). `bendsCorridors <= 7` (hand route 5).
  - G3. `chainedRooms == 0` on `M`. `multiEntryRooms <= 2`.
  - G4. Every room with one terminal has a straight branch (`singleTerminalStraight.straight == rooms`), except rooms that the report lists with a reason.
  - G5. `lengthMm <= 257000` (110 percent of 234 m).
  - G6. `meanBendsToTerminal <= 5` (hand route 4.0).
  - G7. `teeOffsetMm.max <= 100` for the straight branches (rule R8: the tee is at the foot; the hand route has 60 mm at most).
  - G8. `portsLeft == 0` and every room with terminals is fed.
  - G9. Not worse than Balanced on `bends`, `length` and `wallCrossings` for the two other drawings, first floor and `w_rooms-2`, scenarios A and B, with the same margin as G0 C3 and C5 (`route-room-branch-report.test.ts:217-222`). (Reason: `twoLevel` must not win on one floor and lose on another.)
  - G10. Time: the median of 3 runs of scenario A on `w_rooms-2` is at most 600 ms (the limit of gate G2 of P1). Printed in the table, asserted in P2-T14.
  - G11 (D7). Minimum distance of each wall hole to a wall end, column or corner is at least `doorMarginMm` (200 mm). Printed: the smallest distance found. The test on a column or wall end uses the room ring corners (the model has no column data: not verified; a column that is not a ring vertex is not checked).
  - G12 (D7). Longest path from the start to a terminal (printed, and asserted at most 110 percent of the hand route value from the analysis; the number is not in this plan: the task reads it from `results.json`).
  - G13 (D7). Branch length (door to foot, per room): the 90th percentile is printed in the table. It is asserted at most `reachMm` (6000 mm).
  - G14 (D4). `corridorGapCrossings` and `holesPerRoom` are printed; no assert (the hand route value is not known: not verified).
  - G15 (D5). On every plan: no port has more than one connected segment end.
- **Aim (printed, not asserted):** the number of tee points on the same main line as the hand route; total bends at most 12 plus 4.
- **If the gate fails:** stop. Report the table and the rooms behind each failure (as `causeOf`, `route-room-branch-report.test.ts:173-189`). The director adds fix tasks P2-T13a, T13b, ... (one cause each, one commit each; two failed fixes of one cause stop the task and the director asks the user). The thresholds are not moved to make a gate pass.
- **Verify:** the director creates the flag file `.claude/roadmap/tools/p2/assert.flag` and runs `pnpm --filter @mepapp/core test`. The report prints the table. Without the flag file, only the default run executes. No browser check.

#### P2-T13. Reserved: fix tasks from the gate (a, b, c ...)
The director writes them after the first run of P2-T12. Each has the form of the P1 tasks T26 and T27: one cause, one fix, the hash check, the table before and after. The plan does not guess them.

#### P2-T14. Gate timing and the side tests of the mode
- **Size:** S (about 80 lines). **Depends on:** P2-T12 passes.
- **Files:** `packages/core/src/route-two-level-time.test.ts` (new), `route-two-level-report.test.ts` (adds the corner modes).
- **What it does:** time of `twoLevel` on the three drawings, scenarios A and B, median of 3. Limit: scenario A on `w_rooms-2` at most 600 ms; every other plan under 15000 ms (to catch a hang, as P1-T08). The mode with `corners: 'right'` gives the same plan as `'both'` (the plan has no diagonal; a deep-equal test). With `corners: 'diagonal'` (only when P1-T21 is built, else the test is skipped with a message), the plan has no 90 degree bend where a chamfer fits and `isLayoutPath` is true.
- **Verify:** core tests, typecheck, build. No browser check.

### Phase D. UI and pictures

#### P2-T15. Scene seam: `layout` in the request
- **Size:** S (about 40 lines). **Depends on:** P2-T11 and P1-T09 (M8).
- **Who owns the type (M8):** part P1 owns the type of `RouteRequest.layout`. P1-T09 types it as a preset id (`RoutePresetId`). The P1 chip UI (P1-T11 to T13) waits for gates G0 to G2 (`route-layout-presets.md:276`), and `RouteRequest` has no `layout` field today (`scene.ts:496-499`). P2 does not make a second type. So T15 does not start before P1-T09 exists. Then T15 only adds the preset `'two-level'` to the preset table with the options `{ twoLevel: {} }` and checks that `planRoute` passes the resolved options to `planRouteCore` (`scene.ts:2960`).
- **If the director wants P2 before P1-T09:** the director records the choice, and T15 builds only `layout?: RouteLayoutOptions` (an options object) as a temporary field marked `// replaced by P1-T09`. P1-T09 then widens it to `RoutePresetId | RouteLayoutOptions`. This is the only case where P2 types the field.
- **Files:** `packages/render/src/scene.ts`, `packages/render/src/index.ts`, `packages/core/src/route-layout-presets.ts` (the preset table, if P1-T06 built it; not verified that the file exists: the task reads P1 first).
- **Shapes:** the same as P1-T09 (`route-layout-presets.md`, P1-T09).
- **Must not touch:** `applyRoute`, `setRoutePreview`, `serializeDocument`, the id counters.
- **Verify:** `pnpm typecheck`, `pnpm build`. Browser check `p2-t15-check.mjs` through the scene API: `planRoute` without `layout` equals the plan with `layout: {}`; `planRoute` with `layout: { twoLevel: {} }` returns a plan that differs; `exportProject()`, `canUndo`, `isDirty` and `nextSegmentSeq` are the same before and after five calls; no page error. No screenshot.

#### P2-T16. The chip "Two-level" in the Route dialog
- **Size:** M (about 120 lines). **Depends on:** P2-T15, P2-T14, P1-T09 and P1-T11 (M8: the chip row and its gates G0 to G2 of P1), and U1-T08 to T10 if they are not yet merged (the dialog layout; same dependency as P1-T11). If the director runs P2 before P1-T11, the one-chip toggle below is the fallback. If P1-T11 (the chip row) is built, this task adds one entry to the preset table (`ROUTE_PRESETS`, `id: 'two-level'`, options `{ twoLevel: {} }`) and the tooltip. If it is not built, this task builds a one-chip row (a toggle "Two-level" next to the numbers) that sets `request.layout`, with the key of the request (`routeRequestKey`, `RouteBuildSection.tsx:16`) including the choice, and P1-T11 later replaces the toggle by the chip row.
- **Files:** `packages/ui/src/components/RouteBuildSection.tsx`, `routeBuildPlan.ts` (texts: the chip name "Two-level" and the tooltip "Main run in the corridors, then one branch for each room."; the text of the new warning `main-crosses-room` if built; the text of the existing `room-chained`), the test of the texts.
- **Must not touch:** `applyRoute`, the core planner, the debounce of 300 ms (`RouteBuildSection.tsx:13`). The choice is dialog state, with the browser memory as in P1 (Q-P1-05 B) only if P1 did it; no stored data.
- **Verify:** `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser check `p2-t16-check.mjs` through real DOM: open the dialog with the helper `openDialog` of `r6-ui-lib.mjs:11`, click the chip, wait for the preview, read the numbers on the dialog, click Place, check the segments with the scene API for reading only, press the rail Undo, check that the plan is gone, no page error; run it with an empty `networkTypes` project (the adoption trap). Screenshots: `P2-T16-chip-off`, `P2-T16-chip-on`.

#### P2-T17. Pictures on the real PDF and the side-by-side with the hand route
- **Size:** M (about 140 lines of script). **Depends on:** P2-T16, P2-T12 (the table).
- **Files:** `.claude/roadmap/browser/p2-t17-check.mjs` (new), `.claude/roadmap/tools/p2/side-by-side.mjs` (new; port of the analysis `sbs.mjs`).
- **What it does:** open `fixtures/pdfs/00_arch_ground_floor_w_rooms_route_manual.pdf` with `openPdf` (it holds the 59 stamps in its project; the user's hand route is the page drawing under the stamps; one page at a time, 3.9 GB). Open the Route dialog through the real DOM, pick the unit as start and the network type of the stamps, choose "Two-level", wait for the preview, take the screenshot of the plan. Then choose "Balanced" and take a second one. A third picture is the render of the hand route PDF (the page without the preview) from the same viewport. The script `side-by-side.mjs` puts the pictures in one image: left hand route, middle two-level, right Balanced, with the numbers of the table of P2-T12 as a caption row. Not verified: that the manual PDF shows its strokes when opened in the app (they are page graphics, not segments). If they are hidden, the picture of the hand route is the render by `mupdf` through `packages/pdf-engine-mupdf` as in the analysis.
- **Screenshots (names):** `P2-T17-two-level-preview`, `P2-T17-balanced-preview`, `P2-T17-hand-route`, `P2-T17-side-by-side`, and one close-up of a room with a comb (`P2-T17-comb-room`). The director uploads them to the dashboard (event `shot`, `rules.md` and the memory note "upload screenshots after each task").
- **Verify:** the check prints the numbers that the dialog shows (segments, length, bends) and compares them with the table of P2-T12 for the same drawing; they must be equal. No page error. The script exits with a non-zero code on a failed check.

#### P2-T18. Review pass and the plan mark
- **Size:** S. **Depends on:** all above.
- **What it does:** the director marks each task done in this file (hash, verification), copies this plan to the hub (`Specs/auto-routing-two-level.md`) and checks the copy with `cmp`, and writes the open results (R3 exception room-37, the split rule) in a section 10. No code.

## 7. Where P2 stops and what comes next

P2 stops when gate G-P2 passes (or the user accepts the report of a failed gate) and the chip shows the mode with real pictures. P2 does not: make `twoLevel` the default (that changes the default output; a separate decision, Q-P2-07); detect doors; change `applyRoute`; size the ducts differently; route drains or other gravity systems (`ROUTE_GRAVITY_TYPE_IDS`, `route-plan-warnings.ts:5`, still refused); route two networks together (each network type is routed alone). After P2, the director may (a) remove the unused option fields and modules that only the old modes use, after the user agrees, (b) add door data (Q-P2-01), (c) end the P1 chip tasks with the new preset table.

## 8. Risks

- **R-1. The hand route is one design.** The hand route is one good result, not the only one. A comparison with its tee points is a report, not a pass rule. The pass rules are the counts of the analysis file. The user judges the pictures.
- **R-2. The fixture of the hand route is a second set of rooms.** The room types differ from `ground-floor-w-rooms-2.json` (finding 5). A result on `M` does not prove a result on `w_rooms-2`. G9 runs both.
- **R-3. Main lines near a wall reduce the room for other services.** The offset is a planner value (1.0 m). The user may want it as a setting. It is an option field (`mainOffsetMm`), not a dialog control in P2.
- **R-4. Blocks make several holes in one wall.** Penetrations rise (Q-P2-04).
- **R-5. A main run through a room breaks the route area rule.** Section 4.3 and Q-P2-02.
- **R-6. The room type library has no mark for toilet, kitchen, stair or electrical rooms** (open since P1-T19a, risk R-13 of P1). The bridge list is set by the user (Q-P2-02), not by the code.
- **R-7. Time.** The line graph is small. The room run cost is cached by door. `bestRoomReach` already sorts pairs by cost and calls `pathOk` lazily (P1-T27). Not measured for this mode. G10 and P2-T14 measure it.
- **R-8. A gate fails.** P1 needed fix rounds (T26, T27). This plan has the reserved task P2-T13 for it.
- **R-9. Two options for the same job.** `roomBranches` and `twoLevel` both exist. A user can be confused by two chips. Mitigation: the tooltip says what each one does; the director decides later which one stays (Q-P2-07).

## 9. Open questions for the user

Each question has options and a recommendation. A question marked `[data model]` touches the data model or the file format. No question below needs a data-model change if the recommendation is taken.

- **Q-P2-01. Door choice. [data model]** The model has no door data. The hand route puts the crossing at the terminal (R4). Options: **A** the planner picks a point on the shared wall stretch, in line with the terminal when the stretch allows it (no door data; as the hand route); **B** detect doors from the PDF drawing (a later part; no stored data if it is calculated, a [data model] decision if it is stored); **C** the user marks doors by hand (a new stored entity, a schema step). Recommendation: **A** for P2. Reason: it matches the hand route and needs no stored data. Open check: are the hand route crossings real doors? The user can tell from the drawing. If they are not, the result is a draft in the sense of D-R4-02.
- **Q-P2-02. Main run through a room that is not a corridor.** The hand route crosses the entrance room 15 (8.1 m). The route area rules allow only corridors and shafts (D-R4-01). Options: **A** no; the user adds the room type "entrance" to the route area list in the existing setting (no code change; but an entrance room with terminals then counts as a route-area port, `groupTargetPorts`, `route-build.ts:81`); **B** yes, bridges through rooms with no terminal of the routed network, with a warning and a ban list (default: stair, lift, kitchen, shaft, residential; see Q-P2-09; task P2-T07); **C** never. Recommendation: **B**. Reason: far rooms (8 of 47 on `w_rooms-2`) cannot get a straight branch otherwise, and the hand route does it (R9, R10). Each crossing shows as a wall crossing and a warning. If the user picks **A**, P2-T07 is cancelled and nothing changes in the code.
- **Q-P2-03. Far rooms with no bridge (chain depth). One question with Q-P1-16 (M7).** The answer of Q-P1-16 is the answer here; the user answers once. A chain keeps Q-P1-11 (it extends the main branch, never a spine path). Options: **A** no chain (a far room that no main line reaches keeps the old links); **B** chain depth 1 (the room is fed from a junction of its neighbour, rule of Q-P1-11); **C** depth 2. Recommendation: **B**. Reason: the manual route has 0 chained rooms, but with Q-P2-02 **B** there should be few far rooms left; depth 1 is the cautious fallback (P1 used 1 and depth 2 added nothing in scenario B, `route-layout-presets.md` P1-T19b result).
- **Q-P2-04 (merged with the old Q-P2-05). A second hole for a room, and the split rule. This CHANGES an answered decision: Q-P1-12 A ("one hole for each room").** The hand route has 2 rooms with more than one hole (rooms 22 and 26, blocks) and 2 rooms with 6 terminals and one hole (rooms 5 and 24). The analysis found no exact rule. Options: **A** keep one hole for each room (the answer Q-P1-12 A; a longer comb inside the room); **B** blocks make a second hole when a room has more than 6 terminals (task T09 measures first); **C** the user sets `splitFromTerminals` as a number in a later control. Recommendation: **B** after the user sees the pictures; until the user answers, the chip default is **A** (`splitFromTerminals` = Infinity, one hole). Reason: A keeps the answered decision and the fire-wall count low; B matches the hand route. The fire-wall count is shown in both cases. Not verified: the rule of B is a reading of two rooms. Several holes mean several fire dampers.
- **Q-P2-06. The exception of room 37. Not a user decision (L15): provisional default A.** The hand route feeds room 37 with 2.9 m where the shortest is 2.1 m. The cause is not proven. The planner takes the shortest (A). The user may tell the cause later (a duct, a column or a wall detail that the model does not hold); then the director adds a task.
- **Q-P2-07. What happens to the default.** After the gate: **A** `twoLevel` stays one chip next to the others; **B** `twoLevel` becomes the first and default chip (the default output changes; separate decision after the user compares the pictures); **C** `twoLevel` replaces `roomBranches` and the dead modules are removed (a later clean-up). Recommendation: **A** now, decide **B** or **C** after the user tests on Windows. Reason: P2 must keep the default output equal.
- **Q-P2-08. Setting for the distance from the wall. Not a user decision (L15): provisional default A.** The main lines are 1.0 m from the corridor wall (the hand route 0.6 to 1.4 m), clamped by the corridor width (D1). The value is a planner value in the option `mainOffsetMm`; no dialog field (the dialog has too much text already). Easy to reverse.
- **Q-P2-09. (new, D3) Which room types may the main run never cross?** The room type library has no marks for stair, lift, kitchen, shaft or residential rooms (R-6). Options: **A** the code matches the default list by room name or type name (provisional, section 4.3), and the user edits it; **B** the user supplies a list of room type ids once; **C** a mark on the room type (a [data model] change, a later part). Recommendation: **A** for P2, with **B** as the way to correct it. It only matters if Q-P2-02 is B. The fire-compartment reason is from memory with no clause number (not verified).

Defaults that I assume (no question): the main run keeps `reachMm` 6000 and the offset 1000 mm (clamped by the corridor width) as planner values; `doorMarginMm` 200, `clearanceMm` 150, `teeSpacingMm` 600, `stubMm` 150, duct width 400 until sizing is known (all planner values); room 37 (Q-P2-06) and the offset setting (Q-P2-08) are provisional defaults; the order of the rooms is nearest to the start first; a room gets the pattern with the lowest cost (length plus `bendMm` for each bend); a terminal that the pattern cannot reach goes to the old link step and shows in `ports-left`; the corners are 90 degrees only; the mode is for ducts and pipes with one network type at a time; English UI text only; no stored data; the chip choice is dialog state; `twoLevel` ignores the prototype options of P1; the 5 m straight piece threshold and the 4.8 m reach of the analysis are report values.

## 11. Audit round 1: findings and fixes

| Finding | Fix (where) |
|---|---|
| H1 | Pick one hit node per room before the solver, 2-round switch (4.3 step 3, T06 test). |
| H2 | New type `TwoLevelFeedsResult` with several doors per room; block-door rule (4.2). |
| H3 | New task T10a: refactor closures to functions, hashes equal. T10 depends on it. |
| H4 | Q-P2-04 and Q-P2-05 merged; says it changes Q-P1-12 A; chip default is one hole (section 5, 9). |
| M5 | New section 4.5 lists each `trunk` read; T11 builds a synthetic `TrunkResult`. |
| M6 | Combine step 0: only legs of the built tree; no pair goes to the chain pass (4.3, T10). |
| M7 | Q-P2-03 is Q-P1-16; chain keeps Q-P1-11 (combine step 5). |
| M8 | T15 owner of the type is P1-T09; T16 waits for P1-T09 and P1-T11; fallback stated. |
| M9 | Flag file `assert.flag` and a separate assert test file; no env prefix (T12). |
| M10 | Gate fails, not skips, when the flag exists and the fixture is missing (T04, T12). |
| M11 | The loader fills every `Scenario` field (T02). |
| L12 | T01 test uses `{...DEFAULT_LAYOUT_OPTIONS, twoLevel: {}}`. |
| L13 | `jogSmallJumpMm` is ignored under `twoLevel`; T11 lists its readers (4.4). |
| L14 | New task T00 (director): copy the scripts to `.claude/roadmap/tools/p2/`. |
| L15 | Q-P2-06 and Q-P2-08 are provisional defaults, not user decisions (9). |
| L16 | T05 test uses mmPerPt = 17.64. |
| D1 | Offset clamp, one duct width between lines, no lines in shafts (4.3 step 1, T05). |
| D2 | `blockers` for lines, stems and doors; test supply then return (4.3, T08, T11). |
| D3 | Ban list by name, per network type test, new Q-P2-09 (4.3, T07, 9). |
| D4 | `corridorGapCrossings` stat and warning `corridor-gap-crossed` (4.3, T11, G14). |
| D5 | Terminal is a branch end; stub; test one end per port (4.3, T08, G15). |
| D6 | `teeSpacingMm` default 600 and a rule from duct width or 1.5 DN (4.2, combine step 3, T10). |
| D7 | `doorMarginMm` 200; gates G11 to G13; metrics fields (4.2, T03, T12). |
| D8 to D10 | Notes in section 5 (fitting loss with sizing, several fire dampers, 2D preview only). |

Not done: none. Two items stay "not verified": the field list of `TrunkResult` (T11 reads it first), and whether sizing widens the tee spacing.

## 10. Results (the director fills this in as the tasks finish)

Empty. Each task adds one line here: id, commit hash, verification summary, the open items.
