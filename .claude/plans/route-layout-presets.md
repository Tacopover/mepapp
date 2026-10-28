# P1 plan: route layout presets (a few layouts of one route, each with a preview, before the user places it)

Status: REVISION 3 on 2026-10-27 by the road map planner (audit and domain review applied). P1-T01 is built (commit `7d3d255`). P1-T05 is built (commit `7e3c0e7`). P1-T23 is built (commit `ee4a244`). P1-T16 is built (commit `54930b2`; the stop rule fires, see section 12). All other tasks are open. Part prefix: P1. Task ids: P1-T01 to P1-T24. Question ids: Q-P1-01 to Q-P1-12 (Q-P1-01 to Q-P1-08 are answered; Q-P1-09 to Q-P1-12 are open).

Origin: comment 3 of the user test of R1 to R6 ("offer a few preloaded route layouts with a preview before the user places the route, like Revit Generate Layout"). Revision 2 adds the user screenshot of the auto-route on the w_rooms floor (defect classes D-1 to D-8, `route-quality-research.md` section 11) and the corner choice. Sources: `auto-routing-feedback-prompt.md` (section "Findings: presets"), `auto-routing-r6.md`, `.claude/roadmap/rules.md`, the code at the commit of branch `worktree-routing-feedback`.

Sibling plans: `ui-cleanup-rail-i18n.md` (prefix U1) and `route-quality-research.md` (prefix Q1). Section 7 uses their real task ids.

**Seams that the director fixed (revision 1, still valid):**
1. P1-T01 created `RouteLayoutOptions` and `planRoute(input, options?)`. This is the only core seam. A Q1 prototype switch is a field of `RouteLayoutOptions`.
2. P1-T09 adds `layout?: RoutePresetId | RouteLayoutOptions` to the scene `RouteRequest`. Revision 2 adds a second field `corners?: CornerMode` (section 4.5).
3. P1 owns the preset list: `ROUTE_PRESETS`, a list of named `RouteLayoutOptions`. `planBestRoute` (`packages/core/src/route-candidates.ts:43`, Q1-T11) takes the options list and owns the scoring only.

**Decision of the director (2026-10-27, Q-Q1-09 C):** Q1 research stops. Q1-T12 (`ripUp`) and Q1-T13 are held. The Q1 prototype fields `bridgeParts`, `linkSearch`, `exactSpine` and `trunkBends` stay in `RouteLayoutOptions` and give small gains (section 3.2). P1 does not wait for more Q1 work. The new room-branch algorithm of revision 2 lives in P1 (tasks P1-T16 to P1-T20).

Terms (the terms of `auto-routing.md` and `auto-routing-r6.md` apply). New terms:
- **Layout options**: a small object of numbers and switches (`RouteLayoutOptions`) that the planner reads. The default value gives today's result.
- **Preset**: a named layout options value, with an id, shown to the user as a chip (a small selectable tile). A preset is code, not stored data.
- **Corner choice**: a dialog control with three values (`90 only`, `45 only`, `both`). It is not a preset. It sets the field `corners` of the layout options. It multiplies with the presets.
- **Candidate**: the plan (`PlannedRoute`) that the planner makes for one preset and one corner choice on one request.
- **Signature**: a hash of the rounded geometry of a plan. Two plans with the same signature look the same. The code has it already: `routeSignature` (`route-candidates.ts:31`).
- **Gate**: a point in the order where the work stops until a measurement passes.
- **Loose port**: a target port that the trunk and the room branches do not serve. The planner joins it with its own link (`route-build.ts:335-337`).
- **Room branch**: one main duct from the corridor to one entry point of a room, and from there the branches to the terminals in that room. A terminal is a target port.
- **Synthetic entry**: an entry point on the wall of a room that the planner picks itself, for a room that has no entry in `area.entries`.
- **Chained room**: a served room that a duct enters directly from another served room (`chainedRooms`, `route-metrics.ts:51`).

## 0. Corrections to the earlier findings

Eight corrections from revision 1 (still true), then the corrections of revision 2.

1. **The preview flow is in `RouteBuildSection`, not in `RouteDialog`.** `RouteDialog` only builds the request (`packages/ui/src/components/RouteDialog.tsx:119-133`). The debounce, the call `scene.planRoute` and the call `scene.setRoutePreview` are in `packages/ui/src/components/RouteBuildSection.tsx:41-68`. Place is at `:77-84`. All UI tasks change `RouteBuildSection`.
2. **The penalties reach the room spines only.** The planner calls `buildTrunk` (`route-build.ts:314`), `planBranches` (`:350`), `connectLoosePorts` (`:378`) and `buildRouteItems` (`:400`). The bend and crossing penalties are module constants (`route-hanan.ts:4-5`) and are used in one place only (`route-hanan.ts:247`). The trunk is a Steiner tree with length cost only (`route-trunk.ts:161`). Q1-T08 measured more: the corridor graph of the first floor has 23 edges and no cycle (a forest), so a bend price cannot change the trunk (`route-quality-research.md` section 10, idea 1a). So a bend or crossing price changes the segments **inside rooms** only. This is why revision 2 adds an algorithm for the part that the user sees (section 4.6).
3. **`scene.setRoutePreview` takes one plan** (`packages/render/src/scene.ts:2991`). Ghosts of other candidates are not built (Q-P1-04 A). P1-T10 is cancelled.
4. **"No schema change" is correct.** The preset id and the corner choice are dialog choices. `CURRENT_SCHEMA_VERSION` stays unchanged. The browser remembers the last choice (Q-P1-05 B). A stored value for each document would be a data-model decision. It is not planned.
5. **The jump limit is a constant.** `SMALL_JUMP_MM = 1000` is used inside `applyJogRule` (`route-layout.ts:129`). `applyJogRule` is called from `straightenPolyline` (`route-layout.ts:248`) and from `branchPath` (`route-branch.ts:186`). A right-angle mode must also remove the exact 45 degree legs that the corridor graph keeps (`walkPolyline` keeps every leg that is not `free`, `route-layout.ts:184-187`). So P1-T03 is size M.
6. **The entry rule is local.** The entry order is in `entriesOf` (`route-trunk.ts:96-104`). The next entry is tried only when the tap node is not reached (`route-trunk.ts:174-188`).
7. **The off-graph axis option is a preference.** `connectLoosePorts` tries the axis `tap.perpendicular ?? longer` first and then the other axis (`route-topology.ts:414-417`).
8. **The time numbers.** "About 150 ms" comes from `auto-routing-r6.md:47`. Revision 2 has better numbers from Q1-T04 (section 3.2 and G2).

**Corrections of revision 2 (checked against the code):**

9. **P1-T01 is built.** `planRoute(input, options = DEFAULT_LAYOUT_OPTIONS, trace?)` is at `route-build.ts:198-202`. `RouteLayoutOptions` is at `route-layout.ts:9-32`. The earlier text said the fields are required and that `ripUp` is a Q1 comment. In the code **every field is optional**, and `DEFAULT_LAYOUT_OPTIONS` has type `Readonly<Required<Omit<RouteLayoutOptions, PrototypeLayoutKey>>>` (`route-layout.ts:33-41`). Section 4.2 now shows the real type.
10. **The fields `orthogonalOnly`, `entryRule`, `jogSmallJumpMm`, `bendPenaltyMm` and `crossingPenaltyMm` exist in the type but no planner code reads them.** A search finds them in `route-layout.ts` and in one test line (`route-build.test.ts:766`) only. P1-T02 to P1-T05 still have to wire them. P1-T05 wired offGraphAxis.
11. **A signature function exists.** `routeSignature` (`route-candidates.ts:31`) hashes the geometry rounded to 0.01 pt, ids left out. The old plan wanted a new `planSignature` (10 mm grid). P1-T06 reuses `routeSignature`. It makes no second one (rule 3 of `rules.md` section 3).
12. **The chip lists of revision 1 did not contain "Fewer crossings".** The four start presets included it, but the lists of `presetsForDiscipline` did not. Section 4.2 fixes this.
13. **The long diagonals of the screenshot (D-6) do not come from `bridgeParts`.** `bridgeParts` is off by default (`route-trunk.ts:132`), and the user plan used the default. The `research` plan says "probably a bridge" (section 11, D-6). That cannot be. The long diagonal legs come from the trunk edges of the corridor graph (kind `link` edges between area rooms, or straightened centre edges). P1-T16 measures the origin with the existing trace (`route-build.ts:196`).
14. **A room that the trunk reaches already gets one branch.** `planBranches` makes one branch and one spine for each served room (`route-branch.ts:327-396`), and `buildTrunk` picks one entry for each room (`route-trunk.ts:251-258`). The defects D-1 (many entries) and D-5 (chain) can come only from loose ports: `connectLoosePorts` joins each loose port by its own link to the nearest point of everything built so far, spines of other rooms included, with no test for rooms (`route-topology.ts:317-363`, `:376-388`; the only test is `accepts`, `route-build.ts:307-311`). On the w_rooms floor 43 rooms are served, 33 are off graph and only 10 have an entry (`route-quality-research.md:773`; the 10 are reached by the trunk). So 33 of 43 rooms are served by links. A room has an entry only when it shares a wall stretch with a route-area room (`route-area.ts:117-147`); the others sit in `area.unreached` (`route-area.ts:150-155`) and usually have another room between them and the corridor. The first floor also has off-graph rooms: 28 of 33 for start 0 (15 without an entry, 13 with an entry in another graph part; `route-quality-research.md` section 2.3 and 10). This is a reasoned reading of the code. P1-T16 measures it before P1-T17 starts.

Verified without change: the preview runs 300 ms after the last change (`RouteBuildSection.tsx:13`, `:48-51`); the request key is `routeRequestKey` (`RouteBuildSection.tsx:16-19`); `scene.planRoute` reads the live document and does not change it (`scene.ts:2936-2988`); `applyRoute` is one undo step and adopts the network types first (`scene.ts:3017-3082`, adoption at `:3044`); the invariant check is inside `planRoute`; there is no fitting loss coefficient in the code, so "friction estimate" is a later part.

## 1. Goal

The user opens "Route network…". Today the dialog shows one preview and one Place button. After P1, the section "Route" shows two controls above the numbers: a row of chips (layouts of the same route) and a corner choice (`90 only`, `45 only`, `both`). The first chip is selected and its preview shows on the plan. The user taps another chip or another corner value. The preview changes. The numbers and warnings change. While the user chooses, the user can pan and zoom the PDF, because the dialog allows it (U1-T14, done, commit `2a64bf1`). The user presses "Place route". The app writes the selected candidate with the existing `applyRoute`. This is one undo step. The segments are normal segments with the route mark.

Example (first floor, 6 served offices, an air handling unit on the corridor): "Balanced" shows 86 segments and 212 m (numbers as an example, not measured). "Branch per room" shows one duct into each office from the corridor, then short branches to the terminals, and fewer rooms that a duct crosses on its way to another room. "Fewest bends" shows fewer bends inside the offices and a few more metres. The user sets "90 only" and the hall has no 45 degree leg. The user compares the chips and places one.

Where P1 stops: P1 adds no stored data, no new trunk algorithm (the Q1 prototypes stay as they are), no joining of corridor graph parts (D-8), no friction estimate, no "home run" topology and no new dialog. P1 adds one new algorithm for the rooms (section 4.6) and one for the corners (section 4.5). The next part is Q2 (a later plan: which Q1 ideas become default) or U1 (dialog cleanup). They do not depend on P1 to finish.

## 2. What exists now (path:line, from the branch)

| Item | Where |
|---|---|
| `planRoute(input, options, trace?)` returns `{ status, plan }` | `packages/core/src/route-build.ts:198` |
| `RouteLayoutOptions` (all fields optional), `DEFAULT_LAYOUT_OPTIONS`, `SMALL_JUMP_MM`, `legClass`, `isLayoutPath`, `applyJogRule`, `straightenPolyline` | `packages/core/src/route-layout.ts:8-41`, `:47`, `:57`, `:122`, `:243` |
| `RouteBuildInput`, `PlannedRoute`, `RouteStats` | `route-build.ts:27-49` (not re-verified in revision 2) |
| Bend penalty 500 and crossing penalty 1000 (module constants), room spine only | `route-hanan.ts:4-5`, `:205` |
| Trunk: Steiner tree, cost = length (`+ bridgePenaltyMm` on bridge edges); entry order; root; `trunkBends` switch | `route-trunk.ts:120`, `:155-183`, `:96-104` |
| Branch path, tap rules, `planReachRoom` (used with `exactSpine`) | `route-branch.ts:172-187`, `:240-325`, `:327-398` |
| Loose ports, nearest-first link, tap candidates, `linkSearch` | `route-build.ts:335-337`, `route-topology.ts:317-363`, `:366-438` |
| Port grouping (`byRoom`, `outside`, `inArea`) | `route-build.ts:74-90` |
| Metrics: `bendsArea90/45`, `bendsRoom90/45`, `bendsOutside`, `roomsWithBends`, `chainedRooms`, `multiEntryRooms`, `diagonalLegs`, `longDiagonalLegs` | `route-metrics.ts:42-56`, `:119` (computed at `:159-227`) |
| Score, candidate list, signature | `route-metrics.ts:312-323`, `route-candidates.ts:31`, `:43` |
| Leg origin trace (`trunk`, `bridge`, `branch`, `spine`, `link`) | `route-build.ts:196`, `:316-318` |
| Test harness: `buildScenario` (A = 1 port per room, B = 4), `runScenario(s, ids, options)`, `measureScenario`, `localDrawing('ground-floor-w-rooms', …)` | `packages/core/src/route-scenario.testutil.ts:21-26`, `:69`, `:121`, `:143` |
| Defect counts report (the user screenshot, section 11 of the Q1 plan) | `packages/core/src/route-defects-report.test.ts` |
| Scene `RouteRequest`, `RoutePlanView`; `planRoute`; `setRoutePreview`; `applyRoute` | `packages/render/src/scene.ts:496-505`, `:2936`, `:2991`, `:3017` |
| Preview drawing (one plan, dashed, removed runs, warning marks) | `packages/render/src/routePreviewLayer.ts:12-47`; called at `scene.ts:5761` |
| The section: debounce, events, Place, result | `packages/ui/src/components/RouteBuildSection.tsx:21-125` |
| Texts and lines of the section (English only) | `packages/ui/src/components/routeBuildPlan.ts` |
| The request is built in the dialog; the section is mounted there | `RouteDialog.tsx:119-133`, `:395-408` |
| Browser setting pattern (load and save with a storage object) | `packages/ui/src/routeAreaStorage.ts:9`, `:22`; used in `App.tsx:450-451` |
| Core tests with the real first floor | `packages/core/src/rooms/route-area-fixture.testutil.ts:8`; `packages/core/src/route-run.test.ts:12`, `:162` |
| Timing check (3 target counts, 3 runs each) | `.claude/roadmap/browser/r6-time-check.mjs` |
| Dialog helpers for browser checks | `.claude/roadmap/browser/r6-ui-lib.mjs:11` |

## 3. Research

### 3.1 Sources (planner memory, not verified)

No web search was run. Mark as "not verified" until a person reads them.

- **Revit "Generate Layout"** (duct and pipe systems). It offers a small set of solutions that follow a topology (Network, Perimeter, Intersection) and shows each one in the view, with a button to step through them. MepApp copies the shape: a few named candidates, one preview at a time, one Place. Not verified in the Autodesk help.
- **Candidates from one search with different weights.** Run the same router with other cost weights and keep the results that differ. Not verified in a source.
- **Rectilinear Steiner tree and Hanan grid.** Used by R6 (`auto-routing-r6.md` section 3).
- **Two 45 degree elbows instead of one 90 degree elbow.** A usual practice in duct and drain work to cut the pressure loss and to ease flow. The meaning of "45 only" in this plan rests on it (Q-P1-09). Not verified in a source, and no loss data is in the code.

### 3.2 What the Q1 measurements say for P1 (from `route-quality-research.md` sections 10 and 11, first floor and local drawings, scenario A = 1 port per room)

- Time of one plan: 26 to 105 ms (scenario A, default options), 941 to 2 175 ms (scenario B, 4 ports per room, first floor and 10A), 8 449 ms (w_rooms B). `planBestRoute` with 4 candidates: 306 to 911 ms (scenario A).
- `bridgeParts`: off-graph rooms 28 to 15, but length +17.5 %, bends 90 from 35 to 62, score worse in every row. No preset uses it.
- `trunkBends`: no effect (the graph is a forest). No preset uses it.
- `linkSearch`: small gains (crossings 53 to 40 on w_rooms B; length -8 %); bends do not fall.
- `exactSpine`: 5 bends 90 fewer, only together with the bridge.
- `planBestRoute` ranked "base" first in all 10 rows (Q1-T11). So the score of section 5 of the Q1 plan does not favour any prototype. P1 does not use the score to order the chips (the order is fixed).
- The defect counts of the user screenshot (w_rooms, 43 served rooms, start 0, default options), scenario A / B: `chainedRooms` 20 / 25; `multiEntryRooms` 4 / 15; `roomsWithBends` 20 / 36; `bendsRoom90` 22 / 66; `bendsArea45` 5 / 5; `longDiagonalLegs` 2 / 2. First floor: `chainedRooms` 18 / 18; `multiEntryRooms` 1 / 4. 10A: 9 / 11 and 2 / 9.

What MepApp can use: its own planner with options. No new dependency. No `pnpm add`.

## 4. The model

### 4.1 No stored data

A preset is a value in code. The chosen preset id and the corner choice are dialog state. Nothing goes into `ProjectDocument`, `schema.ts` or the PDF. Proof for each task that says "no stored change": `git diff --stat` shows no change in `packages/core/src/project.ts` and `packages/core/src/schema.ts`; the browser checks compare `JSON.stringify(exportProject())` before and after a preview.

### 4.2 Core types

`RouteLayoutOptions` lives in `packages/core/src/route-layout.ts` (built). The preset list lives in the new file `packages/core/src/route-presets.ts`.

```ts
export type CornerMode = 'both' | 'right' | 'diagonal';   // both = today; right = 90 only; diagonal = 45 only (Q-P1-09)

export interface RouteLayoutOptions {            // all fields optional, as built
  bendPenaltyMm?: number;        // default BEND_PENALTY_MM (500), room spine
  crossingPenaltyMm?: number;    // default CROSSING_PENALTY_MM (1000), room spine
  jogSmallJumpMm?: number;       // default SMALL_JUMP_MM (1000); 0 = no 45 degree jump pair
  corners?: CornerMode;          // NEW (P1-T23). Replaces `orthogonalOnly?: boolean`. Default 'both'.
  entryRule?: 'primary-longest' | 'shortest-branch';
  offGraphAxis?: 'perpendicular' | 'longer';   // 'perpendicular' = today (tap.perpendicular ?? longer, route-topology.ts:415); 'longer' = NEW mode (the longer side first). Default 'perpendicular'.
  roomBranches?: { searchMm: number };   // NEW (P1-T19). Off when absent. Section 4.6.
  bridgeParts?: { penaltyMm: number };   // Q1, built
  trunkBends?: { bendMm: number; fittingMm: number };   // Q1, built
  linkSearch?: { bendMm: number; wallMm: number };      // Q1, built
  exactSpine?: { maxPorts: number };     // Q1, built
  ripUp?: { rounds: number };            // Q1 type only; Q1-T12 is held. No preset uses it.
}
export const DEFAULT_LAYOUT_OPTIONS: Readonly<Required<Omit<RouteLayoutOptions, PrototypeLayoutKey | 'roomBranches'>>>;   // gains `corners: 'both'`, loses `orthogonalOnly`

export type RoutePresetId = 'balanced' | 'branch-per-room' | 'shortest' | 'fewest-bends' | 'fewer-crossings';
export interface RoutePreset { id: RoutePresetId; name: string; tooltip: string; options: RouteLayoutOptions }
export const ROUTE_PRESETS: readonly RoutePreset[];   // order = chip order; 'balanced' first, options `{}` (same plan as DEFAULT_LAYOUT_OPTIONS)
export function presetsForDiscipline(discipline: Discipline): readonly RoutePreset[];
export function layoutFor(preset: RoutePresetId | RouteLayoutOptions, corners: CornerMode): RouteLayoutOptions;   // the preset options with `corners` set

// packages/core/src/route-build.ts (built)
export function planRoute(input: RouteBuildInput, options?: RouteLayoutOptions, trace?: RouteTrace): { status: 'ok' | 'refused'; plan: PlannedRoute };
```

`corners` is not part of a preset value. The preset options leave `corners` unset. `layoutFor` adds the value of the dialog control. So the cache key is (request, preset id, corners, tick) and a signature always belongs to one corner choice.

**Start values of the presets.** Planner values. P1-T07 (gate G1) tunes or drops them from the measurement, not from taste.

"default" means the field is absent. **Balanced is the empty object `{}`**, which gives the same plan as `DEFAULT_LAYOUT_OPTIONS` (one rule for the whole plan; T06 tests it).

| Preset | bendPenaltyMm | crossingPenaltyMm | entryRule | Other fields |
|---|---|---|---|---|
| Balanced (today) | default | default | default | none |
| Branch per room (new) | default | default | default | `roomBranches: { searchMm: 30000 }` |
| Shortest run | 0 | default | shortest-branch | none |
| Fewest bends | 3000 | default | default | `exactSpine: { maxPorts: 6 }` (P1-T02 passes the bend price to `exactRoomSpine`) |
| Fewer crossings | default | 8000 | default | `linkSearch: { bendMm: 500, wallMm: 3000 }` |

All numbers in this table are planner values, not verified.

`jogSmallJumpMm` is not a preset field: a 45 degree pair and a right-angle Z both count as two bends, so the field adds nothing to "Fewest bends". The corner mode `right` sets it to 0 inside the planner (section 4.5). No preset uses `bridgeParts`, `trunkBends` or `ripUp` (section 3.2).

**Off-graph axis (revision 3 correction).** Today's code already tries the perpendicular axis first: `first = tap.perpendicular ?? longer` (`route-topology.ts:415`), and `tap.perpendicular` is non-null for every tap on an axis leg of 600 mm or more (`route-topology.ts:342-354`). So today's rule is "perpendicular first". The new mode is `'longer'`. No preset uses the field now. P1-T05 measures whether `'longer'` gives another plan. If it never does, the field leaves the type.

Names and tooltips (the tooltip is the `title` of the chip):
- **Balanced:** "Today's layout. A mix of length and bends."
- **Branch per room:** "One main branch into each room, then branches to the terminals."
- **Shortest run:** "Shortest length. More bends."
- **Fewest bends:** "Fewer bends and fittings. A little more length. Counts a 45 degree pair as two bends."
- **Fewer crossings:** "Fewer crossings. Counts only segments on this drawing."

**Presets for each discipline (Q-P1-06 B).** The lists are code (`presetsForDiscipline`):
- Ducts: Balanced, Branch per room, Fewest bends, Fewer crossings.
- Pipes and cable trays: Balanced, Branch per room, Shortest run, Fewest bends, Fewer crossings.

A duct pays most for a bend and a fitting, so "Shortest run" is not offered for ducts. A preset that gate G1 drops leaves its list. A drain and a cable tray need 45 degree parts, so no preset forbids them (Q-P1-01 B: "Fewest bends" is cost only). A "home run" layout and a tray segregation distance are later parts.

### 4.3 Scene (render)

```ts
// scene.ts
export interface RouteRequest { /* existing fields */ layout?: RoutePresetId | RouteLayoutOptions; corners?: CornerMode }   // absent = 'balanced', 'both'
planRoute(request: RouteRequest): RoutePlanView;   // options = layoutFor(request.layout ?? 'balanced', request.corners ?? 'both')
```

`RoutePlanView` is unchanged. The scene keeps no candidate cache. The cache lives in the UI section (P1-T11), because the UI already owns the debounce and the events that invalidate it.

### 4.4 UI (English only; no Dutch)

New pure module `packages/ui/src/components/routePresets.ts` (state machine and dedupe, testable without React). New components `RoutePresetChips.tsx` and `RouteCornerChoice.tsx`. `RouteBuildSection` uses them. Texts go into `routeBuildPlan.ts` (`TEXTS`). Each chip shows the name, the total length in metres, the bend count, and a mark when the plan has warnings. A tooltip (`title`) lists the full numbers. The corner choice is a group of three toggle buttons next to the chips (not a chip). Help goes to tooltips, not to visible text (U1 wants less text).

### 4.5 The corner choice (Q-P1-08 A) and what the planner can do

Today the planner makes legs at 0, 45 and 90 degrees (`legClass`: `axis`, `diagonal`, `free`, `route-layout.ts:45-55`). The metrics already split bends into 90 and 45 degrees (`route-metrics.ts:209-227`). The type had a boolean `orthogonalOnly` that no code reads. Decision: **replace the boolean by `corners: CornerMode`** (P1-T23), because the user wants three values and a boolean cannot hold them.

| Value | Dialog label | What the planner makes | Where the work is |
|---|---|---|---|
| `both` | Both | Today's result. | Nothing. Must stay byte-equal to the default. |
| `right` | 90 only | No 45 degree leg and no 45 degree bend. Every turn is 90 degrees. | Existing places: the corridor graph keeps diagonal legs (`walkPolyline`, `route-layout.ts:184-187`) and the jog rule makes 45 degree pairs (`applyJogRule`, `:122-143`). Both change under the option. Spines, links and bridges are axis-only already (`roomSpine` Hanan grid; `elbowPath`). P1-T03. |
| `diagonal` | 45 only | Every turn of 90 degrees becomes two turns of 45 degrees with a short diagonal leg between them (a chamfer). Legs stay at 0, 45 and 90 degrees. A corner with no room for the chamfer keeps its 90 degree elbow. | New function on the final paths. P1-T21. |

What "45 only" means is **not fully clear** from the user's words. The planner reads it as "no 90 degree elbow where a 45 degree pair fits" (Q-P1-09 asks the user). Reasons for this reading: (a) a plan with only diagonal legs cannot follow walls; (b) the layout rule of R6 allows the legs 0, 45 and 90 (`isLayoutPath`, `route-layout.ts:57-63`), so a chamfer is a legal path; (c) the fitting model already has 45 degree elbows (`route-metrics.ts:214-215`).

How the rules of the chamfer keep the layout rule: the cut at a corner is `d = MIN_LEG_MM / sqrt(2)` (about 212 mm) so the diagonal leg is at least `MIN_LEG_MM` (300 mm). A corner is cut only when both neighbour legs keep at least `MIN_LEG_MM` of straight length after the cuts at both ends, when the diagonal stays inside the region (`legsInside`, `route-layout.ts:229`) and when no vertex of another path (a tap, a port) lies in the cut. A corner that fails a test keeps the 90 degree elbow. The plan then shows the real `bends90`; no new warning code is added.

**Diagonal length and size (domain, revision 3).** A good diagonal is at least `max(300 mm, 1.5 x width or diameter)` when the size is known (planner value, not verified). Routing runs before sizing (R5), so the planner does not know the size and keeps 300 mm. The tooltip says "Check the diagonal after sizing." Two 45 degree elbows give no gain against one long-radius 90 degree elbow; the tooltip says it. In 45-only mode the chip shows fittings and bends (more fittings, lower pressure loss: "More fittings. Lower pressure loss."). For cable trays and pipes the tooltip adds "Check the cable bend radius for the tray bend." For drains the tooltip recommends 45 only. The planner has no discipline rule that forces a corner value.

`corners` multiplies with the presets. The UI computes the candidates for the chosen corner value only. A change of the corner value clears the candidate cache and recomputes (cache key in P1-T11). The `right` mode sets `jogSmallJumpMm` to 0 inside the planner. The `diagonal` mode keeps the jog rule.

D-3 (45 degree corners in the open hall) and D-6 (long diagonals) of the screenshot come from the straightened trunk edges. The mode `right` removes all of them. In the mode `both` they stay, and the plan does not fix them (the corridor graph join D-8 is a Q1 topic, held).

### 4.6 The room branch (D-1, D-2, D-4 in part, D-5): which part is an algorithm and which is an option

What the planner does today (code facts):
- A served room that the trunk reaches gets **one** branch from the nearest trunk leg to the entry point `E`, then a spine (`planBranches`, `route-branch.ts:327-396`). This already is "one main branch per room". It is not changed.
- A served room that the trunk does not reach (`trunk.offGraphRoomIds`, `route-trunk.ts:248-264`) puts **all its ports into the loose list** (`route-build.ts:335-337`). `connectLoosePorts` then joins **each port by its own link**, nearest first, to the nearest point of everything built so far (trunk, branches, spines and earlier links, `route-topology.ts:317-320`, `:376-388`). It tries two L-shapes and takes the first that `accepts` (`route-topology.ts:409-429`). `accepts` checks only the nearness to foreign items (`route-build.ts:307-311`). There is no test for rooms, walls or bends.
- So D-1 (many entries to one room), D-2 (corners on the link), D-5 (chain through another room) all come from this one code path. On the w_rooms drawing 33 of 43 served rooms are off graph (see correction 14), so most of the plan there is links.

**Limit of the idea (revision 3).** A room that is off graph usually has another room between it and the corridor. For such a room no clear axis path exists, and the algorithm below falls back to the old links. So the gain depends on how many off-graph rooms touch a corridor or have a clear way. P1-T16 counts this and gives the stop rule (a number). Gate G0 may fail by design if the share is small. In that case the director reports the numbers to the user (Q-P1-12) before more work.

Which part is an option and which part is new:

| Part | Kind | Where |
|---|---|---|
| Group the loose ports of one room and treat the room as one unit | Option (a switch in `route-build.ts`) and a small change | `route-build.ts:335-337`, `groupTargetPorts` |
| The spine from an entry point to the terminals of the room | **Reuse.** `roomSpine` (`route-hanan.ts`) and `planBranches` do it already | `route-branch.ts:327` |
| Find an entry point for a room that has none in `area.entries` (the synthetic entry) | **New algorithm** (small): candidate points on the room wall | P1-T17 |
| Pick the tap on the built route and the entry together, with a test that the branch does not cross another served room | **New algorithm** (the core of the change) | P1-T18 |
| Fall back to the old link for a port that is not reached, or for a room with no clear way (chain as last resort) | Existing code (`connectLoosePorts`) | P1-T19 |
| A terminal that a straight segment can reach (D-4) | Covered by the candidate set: the synthetic entries include the points where the axis line through a terminal meets the wall, so a straight branch is a candidate and wins when the bend price counts. Applies to rooms without a real entry only. A room that has a real entry keeps its door. | P1-T17, P1-T18 |

The new option is `roomBranches?: { searchMm: number }`. `searchMm` is the largest distance, in mm, from a built corridor path to a synthetic entry that the search considers. Absent = today's behaviour. The algorithm (P1-T18) for one off-graph room:

1. **Carriers** (the built paths that can carry a tap): the trunk edges (`trunk.edges`, the tree of `route-trunk.ts:174-188`), the bridge edges when present, and the parts of earlier room branches that lie in the route area or in no room. **Decision (revision 3): corridor edges outside the trunk tree are not carriers.** Reason: a tap on them would need an extra edge from the tree to that tap, which joins graph parts (defect D-8). D-8 is held (Q-Q1-09 C, `bridgeParts` raises length and bends). So a room whose only corridor lies in another graph part uses a synthetic entry that faces a tree room, or falls back to links. A tap on a spine or on a link inside another served room is **not** allowed (that is the chain). A tap keeps `MIN_LEG_MM` (300 mm) from every other tap (rule below, P1-T19). Also: no tap on a leg that has a bend or a chamfer within the tap distance (domain rule: a tap too near an elbow is bad practice; the tap distance may depend on the main size; the planner has no tap-to-elbow rule by size yet, section 8).
2. **Entry candidates** (P1-T17). A room that has a real entry in `area.entries` uses it (**exactly one hole per room**). A room without one gets synthetic candidates only on a stretch of its wall that touches a route-area room (a probe point 300 mm outside the wall lies in a route-area room). Never on an outer wall (the probe lies in no room) and never on a wall between two served rooms. The points are one every 500 mm and the points where the axis line through a terminal meets that stretch. The planner prefers the longest stretch (prefer the part of the wall that touches the corridor).
3. **Pairs.** For each pair (tap, entry) the path is the axis path with at most one bend. A pair is kept when: the path stays out of every other served room (samples every 100 mm, `REACH_SAMPLE_MM`, `route-branch.ts:71`); `accepts(path)` is true (no vertex near a foreign item, `NEAR_ITEM_MM`, `route-build.ts:307-311`); and `runsOverOtherPort(path, targetPoints)` is false (`route-topology.ts:308-315`, used at `:422`). The cost is length + bend price + the spine cost + a room penalty (rule 6). The search first filters by `searchMm` and by the bounding box, then samples.
4. The best pair gives the branch. The room is then a normal `BranchRoomInput` (`route-branch.ts:11`) with a fixed branch, so the spine code makes the spine.
5. A room with no pair uses the old link code, and the plan counts it as a chain (it shows in `chainedRooms`). The result shows a WARNING for each such chain (Q-P1-11 A).
6. **Room penalty.** `RouteBuildInput.rooms` holds full `Room` objects, and `Room` has `roomTypeId` (`packages/core/src/rooms/room.ts:38`). So a room-type penalty is possible: a pair whose path crosses a toilet, kitchen, shaft, stair or electrical room gets a high penalty, and a chain through such a room is the last choice. Which `roomTypeId` values mean these types: not verified (the id list of the room type library was not read). P1-T18 takes a function `roomPenaltyMm(roomId)` and P1-T19 builds it from the room type ids that the room type library marks; if the library has no such mark, the penalty is off and the risk R-13 stays open.
7. **Order.** The off-graph rooms are processed nearest to the start first (the distance from the start point to the room centre), not by room id. The chip reports the longest path from the start to a terminal (`longestPathMm`, `route-metrics.ts:38`).

**Walls and fire rating.** The synthetic entry is a point on the wall, and the model has no door data and no wall rating (`route-quality-research.md` Q-Q1-02). A branch through a synthetic entry crosses a wall that may be fire rated. The planner does not know the fire rating. So the plan reports the crossings in two numbers: **room walls** (a wall between two served rooms) and **corridor wall** (a wall between a route-area room and a served room), and the chip and the Place result say "N penetrations, fire damper or fire sealing to check" (P1-T24, P1-T12). Exactly one new hole per room is allowed when no real entry exists; the plan prices each hole (rule 3, the wall price `wallMm` of the cost) and gate G0 asserts that `multiEntryRooms` is 0 for rooms that got a synthetic entry. Whether such a hole is allowed at all is Q-P1-12.

How this keeps the domain rules: the rooms are not changed, the type of the segments is the type of the request, and the checks of `planRoute` (foreign start, foreign join) run after the change (section 5).

## 5. How P1 keeps the rules of `rules.md` section 3

1. **Segment defines the network type of a port.** A preset and a corner choice change the geometry only. `planRoute` still takes the type from `networkTypeId` and writes it on segments. No port, stamp or routing target changes. The room branch writes no value on a port. The foreign-start check and the foreign-join check run for every candidate (`route-build.ts:212-226`, and the invariant check later in `planRoute`).
2. **Cascade invariant.** Every candidate passes the same `checkInvariant` inside `planRoute`. A candidate that would join two types is `refused`; its chip shows "not possible" and cannot be selected. P1-T01 has a test that runs this for each preset; P1-T19 and P1-T21 repeat it for their options. The chamfer (P1-T21) moves vertices only on a path of one type and keeps the end points of every path, so it cannot join two networks.
3. **Reuse before new.** The preview layer, `setRoutePreview`, `applyRoute`, `RouteBuildSection`, `routeRequestKey`, the debounce, the storage pattern of `routeAreaStorage.ts`, `routeSignature`, `roomSpine`, `planBranches` and the test harness `route-scenario.testutil.ts` are reused. No new stored entity. No second copy of the plan state: the UI keeps a map of candidates and the selected id, and the scene keeps the one drawn preview.
4. **Adoption trap.** `applyRoute` adopts the network types first (`scene.ts:3044`). P1 does not change `applyRoute`. P1-T14 has a check with an empty `networkTypes` project.
5. **Real DOM.** Browser checks click the real chips, the real corner buttons and the real Place button. The scene API is for setup and for reading state.
6. **Merge lesson.** After every merge of the sibling branches (section 7), run `pnpm build` at the root.

## 6. Order, gates and phases

Order: A (options in core: T23, T02, T04, T05) -> N (room branch: T16 -> T17 -> T18 -> T19 -> T20 with gate G0) -> K (corners: T03, T21) -> T06 (preset table) -> C1 (scene seam T09) -> B (gates G1 and G2) -> D (UI) -> E (checks). **The chip UI (T11, T12, T13) starts only after G0, G1 and G2 pass.** The corner control (T22) does not need the gates (Q-P1-08 A stands; the corner choice does not depend on any preset): it waits for T03, T21, T09 and U1-T08 to T10 only, and it runs before T11. A task that changes only core code needs no user decision.

| Phase | Tasks | Notes |
|---|---|---|
| A. Options in core | P1-T01 (done), T23, T02, T04, T05 | No UI. The default output stays identical. T23 first (a type change that T03, T21 and T09 need). |
| N. Room branch | P1-T16, T17, T18, T19, T20 | Core only. T16 measures the cause first. T20 is **gate G0**: the new metrics must fall. |
| K. Corners | P1-T03 (`right`), P1-T21 (`diagonal`) | Core only. Independent of phase N (can run in parallel when two workers are free; they edit different files except `route-build.ts`). |
| T06. Preset table | P1-T06 | After T02, T04, T05, T23, T19. T06 owns `route-presets.ts` and adds the entry `branch-per-room`. T24 (wall crossings in two numbers) runs before T20. |
| C1. Scene seam | P1-T09 | Needed by the browser part of both gates. |
| B. Gates | P1-T07 (G1: variety by the new metrics), P1-T08 (G2: time) | G1 no longer waits for Q1 work. It needs T20, T06, T09. |
| C2. Ghosts | P1-T10 | **Cancelled** (Q-P1-04 A). Not built. |
| D. UI | P1-T22 first, then P1-T11, T12, T13 | All wait for U1-T08, T09, T10 (section 7). T11 to T13 also wait for G0, G1, G2. T22 does not. |
| E. Checks | P1-T14, P1-T15 | Browser, dashboard screenshots, regression. |

Mapping to the tasks T1 to T13 of the earlier findings: T1 -> P1-T01; T2 -> P1-T02; T3 -> P1-T03; T4 -> P1-T04; T5 -> P1-T05; T6 -> P1-T06; T7 -> P1-T09; T8 -> P1-T11; T9 -> P1-T12; T10 -> P1-T10 (cancelled); T11 (timing) -> P1-T08; T12 (friction) and T13 (home run) -> out of P1 (section 8). New in revision 1: P1-T07, P1-T13, P1-T14, P1-T15. New in revision 2: P1-T16 to P1-T23. New in revision 3: P1-T24 (wall crossings in two numbers).

Commands (run from the root of the worktree; one command for each Bash call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs` (no environment variable before the command; screenshots go to `/tmp/mepapp-shots/`; name each `P1-Tnn-<name>`).

Rules for every browser step: open `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf` with `openPdf` (one Chromium page at a time); the 10A and w_rooms drawings are local only and a check skips them with a message when absent; click only inside `.mep-modal--route`; open the dialog through the helper `openDialog` of `r6-ui-lib.mjs:11` (one place to change when U1 moves the entry).

Rules for every core report test of revision 2: use the harness `route-scenario.testutil.ts` (`buildScenario`, `runScenario(s, ids, options)`, `measureScenario`, `localDrawing`). Print the table and compare with Balanced in the same run. A test that needs a local fixture prints "SKIP" when the fixture is missing (as `route-defects-report.test.ts:17`).

### Phase A. Options in core

#### P1-T01. Options type, defaults, second argument of `planRoute` — DONE (commit `7d3d255`)
- **Size:** S. **Depends on:** nothing.
- **Built:** `RouteLayoutOptions` (`route-layout.ts:9`), `DEFAULT_LAYOUT_OPTIONS` (`:34`), `planRoute(input, options = DEFAULT_LAYOUT_OPTIONS, trace?)` (`route-build.ts:198`). Q1-T06 (`606c65c`) added the five Q1 fields.
- **Left for revision 2:** the boolean `orthogonalOnly` becomes `corners` in P1-T23.
- **Not verified in revision 2:** the test that the default call and an explicit default call are equal (the test file `route-build.test.ts` was not re-read).

#### P1-T23. `corners` replaces `orthogonalOnly` (type and default only) — DONE (commit `ee4a244`)
- **Size:** S (about 25 lines). **Depends on:** P1-T01.
- **Files:** `packages/core/src/route-layout.ts` (type `CornerMode`, field `corners?`, remove `orthogonalOnly`, default `corners: 'both'`), `packages/core/src/route-build.test.ts`. `index.ts` needs no edit: it has `export * from './route-layout.js'` (`index.ts:17`).
- **Shapes:** section 4.2. No planner code reads `corners` yet.
- **Must not touch:** the planner, the other fields, any output. The options must still pass through to `buildTrunk`, `planBranches` and `connectLoosePorts` unchanged: the tests read them at `route-build.test.ts:764-766` and `:814-817` and must stay green.
- **Verify:** core test: `DEFAULT_LAYOUT_OPTIONS.corners === 'both'` and the key `orthogonalOnly` is gone; the first floor plan with default options equals the plan with `{ corners: 'both' }` (deep-equal). `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check.

#### P1-T02. Penalties reach the room search — DONE (commit `ab8c54d`)
- **Size:** S (about 60 lines). **Depends on:** P1-T01. Q1-T08 moved the heap to `route-heap.ts` (built), so the order against Q1-T08 is settled.
- **Files:** `route-hanan.ts` (`SpineInput` gets optional `bendPenaltyMm`, `crossingPenaltyMm`; the constants stay as defaults), `route-branch.ts` (`BranchInput` passes them), `route-build.ts`, tests `route-hanan.test.ts`, `route-branch.test.ts`, `route-build.test.ts`.
- **Shapes:** `SpineInput.bendPenaltyMm?: number`; `SpineInput.crossingPenaltyMm?: number`; `BranchInput` the same two fields. `exactRoomSpine(input, bendMm)` already takes a bend price (`route-exact.ts:68`, default `BEND_PENALTY_MM` at `:49`/`:68`) but `planReachRoom` calls it with the default, and `roomSpine` is used for rooms with more than `maxPorts` ports (`route-branch.ts:286`). So this task passes `options.bendPenaltyMm` to `exactRoomSpine` and to `spineScore` too. Without this, the preset "Fewest bends" (bend price 3000 plus `exactSpine`) would change the large rooms only.
- **Must not touch:** the order of the search, the tie-breaks (determinism), the exported constants, the default price of `exactRoomSpine` when the option is absent.
- **Verify:** core tests: default call equals today's result; a hand case where a bend penalty of 0 gives a shorter path with more bends and a penalty of 3000 gives the opposite; a hand case where a high crossing penalty avoids an existing segment; a hand room with `exactSpine` where `bendPenaltyMm` 3000 gives fewer bends than 500. Same input twice gives the same output. Core tests, typecheck, build. No browser check.

#### P1-T04. Entry rule — DONE (commit `aa06cc5`)
- **Result:** core tests 1757 passed, 2 skipped; typecheck and `pnpm build` pass. Plan JSON for the default is byte-equal before and after (first floor and w_rooms, `cmp`). `shortest-branch` sorts by the distance from `entry.point` to the tap node of the connector `rc-<entry id>-0` (pt units), then by id. Printed, default / `shortest-branch`: first floor bends90 35/35, lengthMm 151366/151366, wallCrossings 26/26, multiEntryRooms 1/1; w_rooms bends90 47/47, lengthMm 207563/207563, wallCrossings 33/33, multiEntryRooms 4/4. So the rule changes no plan on these two drawings.
- **Size:** S (about 50 lines). **Depends on:** P1-T01.
- **Files:** `route-trunk.ts` (`entriesOf` gets the rule), `route-build.ts`, `route-trunk.test.ts`.
- **Shapes:** `TrunkInput.options.entryRule` (the field `options?: RouteLayoutOptions` exists, `route-trunk.ts:19`). `'shortest-branch'` sorts the entries of a room by the distance from the entry point to the nearest corridor tap node, then by id. A room that has one entry gives the same result for every rule.
- **Must not touch:** the retry with the next entry when the tap is not reached (`route-trunk.ts:174-188`).
- **Verify:** core tests: default equals today's result; a hand room with two entries picks the other entry under the other rule; a room with one entry is the same; deterministic. Core tests, typecheck, build.

#### P1-T05. Off-graph axis — DONE (commit `7e3c0e7`)
- **Size:** S (about 40 lines). **Depends on:** P1-T01.
- **Files:** `route-topology.ts` (`ConnectLooseInput.options.offGraphAxis`; the field `options` exists, `route-topology.ts:385`), `route-build.ts`, `route-topology.test.ts`.
- **Shapes:** `offGraphAxis: 'perpendicular' | 'longer'`. `'perpendicular'` is today's rule: `tap.perpendicular ?? longer` (`route-topology.ts:415`). `'longer'` is the new mode: the longer side first, then the other. The two modes differ wherever the longer side is not the perpendicular axis of the tap. The task measures on the first floor and on w_rooms (local) how many loose links change, and reports. If no link changes, the field leaves the type and the task ends with a note (no code kept).
- **Must not touch:** the rule that both axes are tried; `runsOverOtherPort`; the `accepts` check.
- **Verify:** core tests as in T04; a printed count of loose links on the first floor for each rule. Core tests, typecheck, build.
- **Result (2026-10-28):** the option is wired and kept: default 'perpendicular' equals today (6 plan JSON files, cmp identical), 'longer' differs. Links that differ / links, perpendicular -> longer (bends90, lengthMm, wallCrossings, chainedRooms): first floor A 7/30 (35, 151366, 26, 18 -> 33, 150420, 26, 16); first floor B 15/121 (60, 269867, 31, 18 -> 56, 267121, 30, 17); w_rooms A 0/33 and B 0/137 (same); 10A A 0/20 (same); 10A B 14/79 (45, 333449, 22, 11 -> 42, 333584, 20, 11). 'longer' is better or equal on bends and crossings; no preset uses it yet. Tests: 1760 passed, 2 skipped; typecheck clean; pnpm build 9 of 9.

### Phase N. The room branch (core only)

#### P1-T16. Diagnosis: where do chains and many entries come from? — DONE (commit `54930b2`)
- **Size:** S (about 90 lines of test, no product code). **Depends on:** P1-T01 (the trace exists). Needs no other task. **Run first in phase N.**
- **Files:** `packages/core/src/route-room-origin-report.test.ts` (new; copy the shape of `route-origin-report.test.ts` and `route-defects-report.test.ts`).
- **What it does:** with `RouteTrace` (`route-build.ts:196`) and default options it prints, for the first floor, w_rooms (local) and 10A (local), scenarios A and B, start 0: (a) the number of rooms in `chainedRooms` and `multiEntryRooms` whose crossing leg has origin `link`, `branch`, `spine` or `trunk`; (b) the number of rooms served by the trunk (`trunk.served`) against rooms served by links; (c) the origin of each `longDiagonalLegs` leg (answers correction 13); (d) for each chained room, the room on the other side of the crossing and whether a straight axis path from the nearest trunk leg to the room wall stays out of all other served rooms (a clear way exists: yes/no). Revision 3 adds: (e) for each drawing, the number of off-graph rooms (`trunk.offGraphRoomIds`), the number of rooms with a real entry in another graph part, and the `area.unreached` distances (`UnreachedRoom.distanceMm`, `route-area.ts:55`); (f) the number of off-graph rooms that have a synthetic candidate (a wall stretch that touches a route-area room, P1-T17 rule) and the number that have a clear axis path from a tree carrier to such a candidate; (g) the share S = rooms with a clear way / (chained rooms + multi-entry rooms + off-graph rooms with 2 or more ports).
- **Stop rule for phase N (a number):** (1) if fewer than half of the chained and multi-entry rooms come from `link` legs on the first floor, the reading of section 4.6 is wrong: stop and report. (2) If S (item g) is below 0.3 on the drawing that G0 asserts on (see P1-T20), the new algorithm cannot move the metrics by design: stop after T16 and report the numbers to the director, who asks the user (Q-P1-12). The numbers 0.5 and 0.3 are planner values, not verified.
- **Must not touch:** product code.
- **Verify:** `pnpm --filter @mepapp/core test`; the printed numbers go into section 12 of this file. No browser check.
- **Result (2026-10-27, test `route-room-origin-report.test.ts`, start 0):** the numbers are in section 12. Rule (1) passes: 85 to 100 percent of the chained and multi-entry rooms come from `link` legs, so the reading of section 4.6 is right. Rule (2) fires: S is below 0.3 on the first floor (0.06 for A, 0.19 for B) and on w_rooms (0.13). Only 10A scenario A reaches 0.33.

#### P1-T17. Entry candidates for a room (pure function)
- **Size:** S (about 110 lines with tests). **Depends on:** P1-T16 (gate passed).
- **Files:** `packages/core/src/route-room-entry.ts` (new), `packages/core/src/route-room-entry.test.ts` (new).
- **Shapes:**
  ```ts
  export interface EntryCandidate { pointMm: Vec2; outward: Vec2; source: 'area-entry' | 'ring' | 'port-line' }   // outward = unit axis vector pointing away from the room
  export function roomEntryCandidates(input: {
    room: Pick<Room, 'id' | 'polygon'>; mmPerPt: number;
    areaEntries: readonly RouteEntry[];            // the real entries of this room
    corridorAt: (pointMm: Vec2) => boolean;        // true when the point lies in a route-area room (probe test)
    probeMm?: number;                              // default 300
    portsMm: readonly Vec2[];                      // the terminals of the room
    stepMm?: number;                               // default 500
  }): EntryCandidate[];
  ```
  The function returns the real entries first, then ring points every `stepMm` on the axis-aligned wall edges (an edge that is not axis-aligned gives points with the nearest axis direction) **but only where the point `probeMm` outside the wall satisfies `corridorAt`** (so never on an outer wall and never on a wall between two served rooms), then the points where the horizontal and vertical line through each terminal meets such a wall stretch. The list is sorted by source, then x, then y (deterministic) and holds at most 120 points.
- **Must not touch:** the planner. No call from `route-build.ts` yet.
- **Verify:** core tests: a rectangle room with one terminal gives the four points of the terminal lines; a room with a real entry returns only that entry (exactly one hole per room); a wall whose outside is another served room or the open (no room) gives no candidate; an L-shaped room gives no point inside the room; same input twice gives the same list. Core tests, typecheck, build.

#### P1-T18. Reach search: the best tap and entry for one room (pure function)
- **Size:** M (about 150 lines with tests; split into two commits if over 150). **Depends on:** P1-T17.
- **Files:** `packages/core/src/route-room-reach.ts` (new), `packages/core/src/route-room-reach.test.ts` (new).
- **Shapes:**
  ```ts
  export interface RoomReach { entry: EntryCandidate; tapMm: Vec2; branch: Vec2[]; costMm: number }
  export function bestRoomReach(input: {
    roomId: string;
    candidates: readonly EntryCandidate[];
    carriers: readonly (readonly Vec2[])[];        // built paths that may carry a tap (section 4.6, rule 1)
    clearOfRooms: (path: readonly Vec2[]) => boolean;   // true when the path crosses no other served room (samples every 100 mm)
    bendMm: number;                                // default BEND_PENALTY_MM
    searchMm: number;
    portsMm: readonly Vec2[];
    accepts: (path: readonly Vec2[]) => boolean;              // the planner test of route-build.ts:307-311 (NEAR_ITEM_MM)
    targetPointsMm: readonly Vec2[];                           // for runsOverOtherPort (route-topology.ts:308-315, export it)
    roomPenaltyMm?: (roomId: string) => number;               // section 4.6 rule 6; default 0
    wallMm?: number;                                           // price of the wall hole of a synthetic entry; default 3000
  }): RoomReach | null;                             // null = no clear way
  ```
  For each carrier leg (axis legs; a tap keeps 300 mm from the leg ends and from other taps, with `placeTapPosition`, `route-branch.ts:126`) and each candidate: the path is the straight axis path when the tap and the entry share a line, else one L with the first leg on the axis of the carrier (as `branchPath`, `route-branch.ts:172-187`). Before any sampling, drop a pair by `searchMm` and by the bounding box of the path (revision 3: time). Keep the pair when `clearOfRooms(path)` is true, `accepts(path)` is true and `runsOverOtherPort(path, targetPointsMm)` is false. The cost is the path length + `bendMm` for each bend + `wallMm` for a synthetic entry (a real entry has 0) + `roomPenaltyMm` for each room the path touches + the half of `bendMm` for each terminal that is not in line with the last leg of the branch (a proxy for the spine bend; the real spine runs in P1-T19). The lowest cost wins; ties go to the real entry, then to the lower x, then the lower y.
- **Must not touch:** `planBranches`, `connectLoosePorts`.
- **Verify:** core tests: a room next to a corridor with a terminal in line with a ring point gets a straight branch (one segment, no bend); a room behind another room (the only axis path crosses a second served room) returns null; a carrier inside another served room is never chosen; **a pair whose path ends within `NEAR_ITEM_MM` of a foreign vertex is refused (one test for `accepts`); a pair whose path runs over another target port is refused (one test for `runsOverOtherPort`)**; a room penalty moves the choice to a longer path; a real entry beats a synthetic one of equal length; the result is the same for shuffled candidates; 200 seeded random rooms give a result with `clearOfRooms` true. Runtime: at w_rooms size (43 rooms, when the fixture exists) all calls of one plan together take at most 100 ms (planner value, not verified). Core tests, typecheck, build.

#### P1-T19. Wire the room branch into `planRoute` (option `roomBranches`)
- **Size:** M (about 150 lines). **Depends on:** P1-T18, P1-T02.
- **Files:** `packages/core/src/route-layout.ts` (field `roomBranches?`), `packages/core/src/route-build.ts`, `packages/core/src/route-topology.ts` (export `runsOverOtherPort`), `packages/core/src/route-branch.ts` (a way to pass a fixed branch: `BranchRoomInput.fixedBranch?: { tapMm: Vec2; tapEdgeId: string | null; branch: Vec2[] }`; `BranchInput.taps?: PlacedTap[]` for the taps that exist; `planBranches` returns `taps` after the call; a fixed branch enters the list `placed` so that the 300 mm spacing holds, `route-branch.ts:333-342`), tests `route-build.test.ts`, `route-branch.test.ts`.
- **What it does:** with `options.roomBranches` set, the off-graph rooms (`trunk.offGraphRoomIds`) are not put into the loose list. Instead, **nearest to the start first** (section 4.6 rule 7), for each such room: collect the carriers. **Where the carriers are kept:** a list `carriers` in `route-build.ts`, filled with `trunk.edges` paths, bridge edges, and the parts of accepted room branches that lie outside served rooms. `planBranches` taps only its own `trunk` list (`route-branch.ts:333`), so the off-graph rooms are planned in a second call `planBranches({ trunk: carriers, taps, rooms: [one room with fixedBranch] })`, one room at a time, with `taps` passed on; call `bestRoomReach`; if it returns a reach, add a `BranchRoomInput` with that entry and `fixedBranch`, and let `planBranches` make the spine; the ports that the spine cannot reach go to the loose list as today (`route-build.ts:361`). If `bestRoomReach` returns null, the ports of that room go to the loose list as today. The plan then shows the room in `chainedRooms`. Ports in no room (`grouped.outside`) and ports in a route-area room (`grouped.inArea`) stay loose.
- **Must not touch:** the result with `roomBranches` absent (byte-equal), `connectLoosePorts`, the checks after the plan, `applyRoute`.
- **Verify:** core tests: default plan unchanged (deep-equal, first floor); with `roomBranches` on, every target port is connected or listed in `ports-left` as before; the invariant check passes; same input twice gives the same plan (D1); the input order shuffled gives the same counts (D2, as `route-quality.test.ts` does); two taps on one carrier leg keep at least 300 mm between them, also when one tap comes from a fixed branch and one from a normal branch; a case with `roomBranches` and `exactSpine` together gives an `ok` plan; the invariant check passes with a foreign segment near the new branch. `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check.

#### P1-T20. Preset `branch-per-room` and gate G0 (the new metrics must fall)
- **Size:** S (about 100 lines of test). **Depends on:** P1-T19, P1-T24. P1-T06 owns `route-presets.ts`; this task does not create it. The test uses the option value `{ roomBranches: { searchMm: 30000 } }` directly; P1-T06 adds the preset entry afterwards.
- **Files:** `packages/core/src/route-room-branch-report.test.ts` (new).
- **What it does:** for the first floor and for w_rooms and 10A (local, skipped when absent), scenarios A and B, start 0, it runs Balanced (`{}`) and the room branch option and prints one table: `chainedRooms`, `multiEntryRooms`, `roomsWithBends`, `bendsRoom90`, `bendsRoom45`, `bendsOutside`, `bends90`, `bends45`, `lengthMm`, `wallCrossings` (split into room walls and corridor wall, P1-T24), `existingCrossings`, `portsLeft`, `offGraphRooms`, `longestPathMm`, median runtime of 3 runs.
- **Drawing for the assert:** G0 asserts on the drawing that P1-T16 names as having off-graph rooms with a clear way (S at or above 0.3). The first floor has 28 off-graph rooms for start 0 (15 without an entry, 13 with an entry in another graph part), so it is the default choice. The local drawings (w_rooms: 33 off-graph of 43) assert when the fixture exists. If the first floor fails the S rule, G0 asserts on no drawing and the director asks the user (Q-P1-12) before the work goes on.
- **Gate G0 passes when (asserted for the first floor, in every mode; asserted for w_rooms and 10A only when the fixture exists):**
  1. `chainedRooms` of Branch per room is **lower** than Balanced in scenario A and in scenario B.
  2. `multiEntryRooms` is **lower or equal**, and **lower** in scenario B on the drawing where Balanced has 3 or more. **Every room that got a synthetic entry has exactly one entry: the count of such rooms with more than one entry is 0.**
  3. `portsLeft` and `offGraphRooms` are not higher than Balanced.
  4. `lengthMm` is at most 120 % of Balanced. `wallCrossings` is at most 125 % of Balanced.
  5. The median time of one plan in scenario A is at most 300 ms.
  Aim (reported, not asserted): `chainedRooms` and `multiEntryRooms` at half of Balanced or less. The baseline values to beat are in section 3.2 (first floor A / B: 18 / 18 and 1 / 4; w_rooms: 20 / 25 and 4 / 15; 10A: 9 / 11 and 2 / 9). The planner values 120 % and 125 % come from the Q1 acceptance A3 (+10 %) and the bridge result (+17.5 %). They are not measured for this option; the first run may change them (the director records the change).
- **If G0 fails:** stop. Report the table. Options for the director: tune `searchMm` and the cost; drop the preset (the user wants this fix, so the director asks the user); ship the option in the debug flag only.
- **Report also (no assert):** `roomsWithBends` and `bendsRoom90 + bendsRoom45` per served room, the number of rooms that got a synthetic entry, the number of rooms that fell back to links (each is a chain and a WARNING on the chip, Q-P1-11 A), the number of rooms whose branch crosses a room of a type with a penalty (R-13). These numbers show D-2 and D-4.
- **Verify:** core tests with the table; section 12 of this file gets the numbers. No browser check yet (T09 and T14 do it).

### Phase K. Corners

#### P1-T24. Wall crossings in two numbers (room walls and corridor wall)
- **Size:** S (about 60 lines). **Depends on:** P1-T01. Needed by P1-T20 and P1-T12.
- **Files:** `packages/core/src/route-build.ts` (where `RouteStats` is built from `crossingsAlongPath`; the exact lines are not verified), `packages/core/src/route-metrics.ts`, tests.
- **Shapes:** `RouteStats` gets `wallCrossingsRoom: number` (a wall between two served rooms, or between a served room and no room) and `wallCrossingsCorridor: number` (a wall between a route-area room and a served room). The sum equals `wallCrossings`. `crossingsAlongPath` already returns `fromRoomId` and `toRoomId` (`route-metrics.ts:172-173` uses them). `emptyStats` gets both fields with 0 (`route-build.ts:92-94`).
- **Must not touch:** `wallCrossings` (same value), the warnings, any geometry.
- **Verify:** core tests: the sum equals `wallCrossings` on the first floor; a hand plan with one corridor wall and one room wall gives 1 and 1. `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check.

#### P1-T03. Corner mode `right` (90 only) — DONE (commit `ece219c`)
- **Result:** core tests 1750 passed, 2 skipped; typecheck and `pnpm build` pass. Plan JSON for `both` and absent is byte-equal before and after (first floor and w_rooms, `cmp`). Printed, `right` / `both`: first floor bends90 43/35, lengthMm 152441/151366, wallCrossings 26/26; w_rooms bends90 66/47, lengthMm 214330/207563, wallCrossings 31/33. No plan-level trunk region test (unit test only).
- **Size:** M (about 140 lines). **Depends on:** P1-T23. **No longer waits for a gate** (revision 2: the user wants the control, so the mode is built always).
- **Files:** `route-layout.ts` (`applyJogRule(path, smallJumpMm = SMALL_JUMP_MM)`; `walkPolyline` and `straightenPolyline` get a parameter `corners` and, for `right`, replace a `diagonal` leg by a right-angle Z or an L that stays in the region), `route-branch.ts` (`branchPath` passes the value), `route-trunk.ts`, `route-build.ts`, tests.
- **Shapes:** `applyJogRule(path: readonly Vec2[], smallJumpMm?: number): Vec2[]`; `straightenPolyline(points, insideRegion, corners?: CornerMode)`; `TrunkInput.options.corners` (already reachable through `options`).
- **Must not touch:** the rule that a free angle always shows a warning; the 300 mm minimum leg (`MIN_LEG_MM`); the result for `corners` absent or `'both'`.
- **Verify:** core tests: default equals today's result; with `right`, `isLayoutPath` is true and `legClass` is `axis` for every leg of every non-free segment on the first floor and (when present) w_rooms; `bends45` is 0 and `diagonalLegs` is 0 in `routeMetrics`; the trunk stays inside the region (no sample outside the area, `ROUTE_SAMPLE_STEP_MM`); **`straightenPolyline` returns `free: true` with the original polyline when no path stays inside the region (`route-layout.ts:266`): in `right` mode a free edge keeps its free-angle warning, so the test asserts axis legs only for edges that are not free, and asserts that `freeLegs` is not higher than for `both`**; a Z of 800 mm gives two 90 degree bends; the plan is `ok` and `portsLeft` is not higher than for `both`. Print `bends90`, `lengthMm` and `wallCrossings` against `both` (no assert on the change of length). Core tests, typecheck, build. No browser check.

#### P1-T21. Corner mode `diagonal` (45 only)
- **Size:** M (about 150 lines with tests). **Depends on:** P1-T23, and the answer to Q-P1-09 (the planner builds the recommended reading A; a different answer changes this task).
- **Files:** `packages/core/src/route-layout.ts` (or the new file `route-chamfer.ts`) with `chamferCorners`, `route-build.ts` (a call on the final paths before `buildRouteItems`, `route-build.ts:400`; the trace array keeps its order), tests.
- **Shapes:**
  ```ts
  export function chamferCorners(path: readonly Vec2[], options: {
    insideRegion: (p: Vec2) => boolean;     // for the diagonal leg; defined per path (below)
    accepts: (path: readonly Vec2[]) => boolean;   // the planner test of route-build.ts:307-311 on the cut path
    protectedPointsMm: readonly Vec2[];     // vertices of every other path, and the target ports
    minLegMm?: number;                      // default MIN_LEG_MM
  }): Vec2[];
  ```
  Only an interior vertex with a 90 degree turn between two axis legs is cut (section 4.5). The end points of the path do not move. **The region test for each path** (the caller builds it from the origin in the trace): a trunk or bridge path uses the corridor region (`insideRouteArea` of the area rooms with `withWallGaps`, as `route-trunk.ts:201-226`); a spine uses the room region (`insideRouteArea([room])`, `route-build.ts:346`); a branch or a link uses the union of corridor and room regions plus the wall gap. A cut is made only if `accepts` is true for the changed path.
- **Must not touch:** the result for `corners` absent or `'both'`; the number of paths; the end point of any path; the type of any segment.
- **Verify:** core tests: a hand L-path of 3 m by 3 m becomes two 45 degree bends with a diagonal of at least 300 mm; a corner with a neighbour leg of 500 mm stays 90; a path with a tap point in the cut zone keeps that corner; **a corner with a foreign segment within `NEAR_ITEM_MM` of the new diagonal keeps its 90 degree elbow (`accepts` refuses)**; a Z of 90 degree bends becomes four 45 degree bends or stays when a leg is too short; `isLayoutPath` is true for every result; the plan on the first floor is `ok`, `freeLegs` is 0, `portsLeft` is not higher than for `both`, and `bends90` is lower than for `both`. Print `bends90`, `bends45` and the number of kept 90 degree corners. The check "the end points of all paths are equal before and after" is a test. The plan with `diagonal` is deterministic (two runs equal) and has the same counts for shuffled input order (as `route-quality.test.ts`). Core tests, typecheck, build. No browser check.

### Phase T06. Preset table and signature

#### P1-T06. Preset table (reuse of `routeSignature`)
- **Size:** S (about 90 lines). **Depends on:** P1-T02, P1-T04, P1-T05, P1-T23, P1-T19 (the option names must exist; a dropped option is removed from the table). **This task owns `route-presets.ts`** and adds the entry `branch-per-room` with the option value that P1-T20 tested.
- **Files:** `packages/core/src/route-presets.ts` (new), `packages/core/src/route-presets.test.ts` (new), `index.ts`.
- **Shapes:** `ROUTE_PRESETS`, `RoutePresetId`, `presetsForDiscipline`, `layoutFor` (section 4.2). The signature is `routeSignature` (`route-candidates.ts:31`); this task adds no second signature function. P1 owns the list; `planBestRoute` takes `ROUTE_PRESETS.map((p) => p.options)` if a caller wants it.
- **Must not touch:** the planner, `route-candidates.ts`.
- **Verify:** core tests: `ROUTE_PRESETS[0].options` deep-equals `{}` and the plan for `layoutFor('balanced','both')` equals the plan for `DEFAULT_LAYOUT_OPTIONS`; `layoutFor` with `roomBranches` and `exactSpine` together keeps both fields; an unknown preset id gives the options of `balanced`; ids are unique; every id in a discipline list exists; `layoutFor(x, 'right').corners === 'right'`; the signature of a plan does not change when the ids change (`planBestRoute` test exists). Core tests, typecheck, build.

### Phase C1. Scene

#### P1-T09. Scene: `layout` and `corners` in the request
- **Size:** S (about 40 lines). **Depends on:** P1-T06, P1-T23. May run before the gates (the gates need its browser part).
- **Files:** `packages/render/src/scene.ts` (`RouteRequest.layout?`, `RouteRequest.corners?`; `planRoute` passes `layoutFor(...)`), `packages/render/src/index.ts`.
- **Shapes:** section 4.3. An unknown id falls back to `balanced`. An absent `corners` is `'both'`.
- **Must not touch:** `applyRoute`, `setRoutePreview`, `serializeDocument`, the id counters (`planRoute` does not advance them; keep that).
- **Verify:** `pnpm typecheck`, `pnpm build`. Browser check `p1-t09-check.mjs` through the scene API: `planRoute` without `layout` and with `layout: 'balanced'` give equal plans; two presets give plans that follow P1-T07; an unknown preset id gives the plan of `balanced`; `corners: 'right'` gives a plan with no 45 degree leg; `exportProject()`, `canUndo`, `isDirty` and `nextSegmentSeq` are the same before and after five calls; no page error. No screenshot.

### Phase B. Gates (no UI before they pass)

#### P1-T07. Gate G1: compare the preset outputs on the real floors (new metrics)
- **Size:** S (about 110 lines of test, no product code). **Depends on:** P1-T06, P1-T20 (G0 passed or reported to the user), P1-T09 (for the scene part). **No longer waits for Q1-T07 to T09** (Q-Q1-09 C: the Q1 fields that exist are the ones that the presets use).
- **Fixed list:** the test holds a FIXED list of preset ids (`['balanced','branch-per-room','shortest','fewest-bends','fewer-crossings']`), not `ROUTE_PRESETS`, so that a dropped preset does not change the test. It runs the ducts list and the pipes list (`presetsForDiscipline`) with one network type of each discipline, or runs the fixed list once and reports which discipline lists contain each qualified id.
- **Machine check:** the test has a constant `GATE_G1 = true` flag. With the flag on, it asserts the pass rule below. With the flag off, it prints only. In every mode it asserts determinism and "no preset is refused when Balanced is ok".
- **Files:** `packages/core/src/route-presets-real.test.ts` (new; uses the harness of `route-scenario.testutil.ts`); `.claude/roadmap/browser/p1-t07-check.mjs` for the local drawings.
- **What it does:** for the first floor, w_rooms and 10A (local), scenarios A and B, start 0, it runs `planRoute` with each preset of the discipline list (corner choice `both`) and prints one table per drawing: preset, status, signature, segments, fittings, length (m), `bends90`, `bends45`, `chainedRooms`, `multiEntryRooms`, `roomsWithBends`, `bendsRoom90/45`, `bendsArea90/45`, `wallCrossings`, `existingCrossings`, `portsLeft`, `offGraphRooms`.
- **A preset "differs in the direction its name says" when (first floor, scenario A and B; local drawings when present), compared with Balanced:**
  - Branch per room: `chainedRooms` lower (this is gate G0 again).
  - Shortest run: `lengthMm` lower or equal, and lower on at least one scenario.
  - Fewest bends: `bends90 + bends45` lower or equal, and lower on at least one scenario.
  - Fewer crossings: `wallCrossings + existingCrossings` lower or equal, and lower on at least one scenario.
  - A preset with the same signature as Balanced in every scenario fails.
  - Existing crossings (domain): a second route planned after a first route of another network type shows `existingCrossings` above 0 in the plan of every preset. Each network type is routed on its own (section 8).
- **Gate G1 passes when:** Balanced, Branch per room and at least one more preset qualify. A preset that does not qualify leaves `ROUTE_PRESETS` and the discipline lists (Q-P1-07 A: fewer presets). The test prints the list of qualified ids; the director records it in section 12.
- **If fewer than three presets qualify:** stop. Report the table. Options for the user: A. ship the qualified presets (two chips); B. cancel the chip row and ship only the corner choice (it does not need G1); C. tune the start values once and run again. The recommendation is C once, then A. (The old option "add Q1 options" is closed by Q-Q1-09 C.)
- **Verify:** core tests; the printed tables go into the report and into section 12. Browser check for the local drawings only if the file exists. No screenshot.

#### P1-T08. Gate G2: timing
- **Size:** S (about 60 lines). **Depends on:** P1-T06, P1-T03, P1-T21 (it measures the three corner values), P1-T19; the browser part after P1-T09.
- **Files:** `packages/core/src/route-presets-time.test.ts` (new; prints times, asserts only `< 15000` ms to catch a hang; scenario B on w_rooms takes 8 s today), `.claude/roadmap/browser/p1-t08-check.mjs` (copy of `r6-time-check.mjs` that loops over the presets and over the three corner values with `layout` and `corners`).
- **Numbers that exist (Q1-T04, section 3.2):** one plan takes 26 to 105 ms in scenario A and 941 to 8 449 ms in scenario B. So the limit cannot hold for scenario B, and the rule below separates the two cases.
- **Gate G2 passes when (browser numbers, first floor, scenario A size, 25 targets):** the default candidate takes at most 300 ms; each other candidate takes at most 300 ms; the presets of the discipline list together take at most 1000 ms. The UI computes the default first and the others one after another in separate macrotasks (P1-T11), so the screen does not freeze for the sum. The corner mode `diagonal` adds a pass over the paths; its time is measured too.
- **Rule for a large request (scenario B size):** when Balanced takes more than 1000 ms, the UI computes the other chips only when the user taps them (P1-T11, `lazyAboveMs`). This rule needs no answer.
- **If G2 fails in scenario A size:** Q-P1-07 A applies: fewer presets and staged compute. No worker.
- **Verify:** the times of three runs per preset and per corner value are printed in the report. No screenshot.

### Phase C2. Ghosts

#### P1-T10. Scene: hover preview and ghosts — CANCELLED (Q-P1-04 A)
Not built. The scene keeps one preview. The id stays so that later references still read.

### Phase D. UI (waits for U1-T10 on shared files; see section 7)

#### P1-T11. Preset state: staged compute, cache, dedupe, corners
- **Size:** M (about 150 lines with tests). **Depends on:** gates G0, G1, G2, P1-T09, P1-T22, **U1-T08, U1-T09, U1-T10** (and U1-T13 if it edits the same files).
- **Files:** `packages/ui/src/components/routePresets.ts` (new, pure), `packages/ui/src/routePresets.test.ts` (new), `RouteBuildSection.tsx`.
- **Shapes:**
  ```ts
  export interface Candidate { id: RoutePresetId; view: RoutePlanView; signature: string; duplicateOf: RoutePresetId | null }
  export function candidateKey(requestKey: string, presetId: RoutePresetId, corners: CornerMode, tick: number): string;
  export function markDuplicates(candidates: readonly Candidate[]): Candidate[];   // first in chip order keeps the plan
  export const LAZY_ABOVE_MS = 1000;
  ```
  The section computes `balanced` first (after the 300 ms debounce, as today), shows it, and then computes each other preset of the discipline list in its own `setTimeout(0)`. If the plan of `balanced` took more than `LAZY_ABOVE_MS`, the other presets are computed only when the user taps their chip (the chip shows "tap to compute"). A new request key, a new tick or a new corner value cancels the pending presets and clears the cache. A refused candidate stays in the list with `view.status === 'refused'`.
- **Must not touch:** the debounce value, the event list (`RouteBuildSection.tsx:34`), `applyRoute`.
- **Verify:** UI tests (pure part): `markDuplicates` marks the later of two equal signatures; a refused view is never a duplicate; the key changes with the tick and with the corner value; staged order is `balanced` first; with a slow first plan the other chips stay pending until a tap. `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps in P1-T14.

#### P1-T12. Chip row and the numbers
- **Size:** M (about 150 lines). **Depends on:** P1-T11, **U1-T08, U1-T09, U1-T10** (start after they are merged). **Shared files with U1:** `RouteBuildSection.tsx`, `routeBuildPlan.ts`, `theme.css`.
- **Files:** `packages/ui/src/components/RoutePresetChips.tsx` (new), `RouteBuildSection.tsx`, `routeBuildPlan.ts` (texts), `theme.css`.
- **Shapes:** `RoutePresetChips({ candidates, selected, onSelect, pendingIds })`. Each chip is a `button` with `data-testid="route-preset-<id>"`, `aria-pressed`, a short name, the length in metres, the bend count (90 and 45 shown as "12 / 3"), a warning mark, and a `title` with the full numbers (length, segments, fittings, 90 and 45 bends, wall crossings, existing crossings, free legs, ports left, rooms with a chain, longest path from the start to a terminal, warnings). The chip and the Place result show the wall crossings in two numbers (room walls and corridor wall, P1-T24) with the text "N penetrations, fire damper or fire sealing to check" and the note "The planner does not know the fire rating." In 45-only mode the chip shows fittings and bends. A chain through another room (a room in `chainedRooms` that the branch option could not serve, Q-P1-11) shows as a **warning** mark on the chip and in the lines. A duplicate is hidden and a small text "N layouts give the same result" shows with a `title` that names them (Q-P1-03 A). A refused candidate is a disabled chip with a `title` that gives the reason. A pending candidate shows a small spinner text "…". The selected candidate drives `setRoutePreview`, the summary and the lines (the existing code, fed with the selected view).
- **Note for the reader of the dialog:** the user can pan and zoom the PDF while the dialog is open (U1-T14, done). So the user can look at the plan while choosing chips. The chips must not take the focus from the canvas: a click on a chip does not block the wheel zoom and the middle-button pan afterwards.
- **Must not touch:** the warning lines, the removal line, the size check box, the Place logic.
- **Verify:** UI tests: the penetration text builder (two numbers, the fire sealing words, the rating note); the chain warning mark; the chip texts and `title` builders (every key has a text; numbers are formatted in metres with one decimal; no Dutch; a text of 60 characters or less on the chip). `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps and screenshots in P1-T14.

#### P1-T22. Corner choice control
- **Size:** S (about 120 lines). **Depends on:** P1-T03, P1-T21, P1-T09, **U1-T08, U1-T09, U1-T10**. It does **not** wait for G0, G1, G2, T11 or T12 (the corner choice needs no preset, Q-P1-08 A and the answer to Q-P1-08 stand). It adds the corner state to `RouteBuildSection.tsx` and sends it as `corners` in the request; the chips (T11, T12) later read the same state. Until the chips exist, the section has one candidate.
- **Files:** `packages/ui/src/components/RouteCornerChoice.tsx` (new), `RouteBuildSection.tsx`, `routeBuildPlan.ts` (texts), `theme.css`.
- **Shapes:** `RouteCornerChoice({ value, onChange })` with `value: CornerMode`. Three `button`s with `data-testid="route-corners-right"`, `"route-corners-diagonal"` and `"route-corners-both"`, `aria-pressed`, a short label ("90°", "45°", "Both") and a `title` ("Only 90 degree bends", "Only 45 degree bends. Two 45 degree bends replace each 90 degree bend where there is room.", "90 and 45 degree bends"). The control sits on the same row as the chips or just under it. A change calls `onChange`; the section clears the cache and recomputes with the new corner value (the key of P1-T11). The initial value is `both` (or the browser value, P1-T13). The control is not a chip: it never appears in the duplicate note. Tooltips (domain, revision 3): `diagonal` also says "More fittings. Lower pressure loss. Check the diagonal after sizing. Gives no gain against a long-radius 90 degree elbow." For a cable tray or pipe network type the `diagonal` tooltip adds "Check the cable bend radius for the tray bend."; for a drain network type it adds "Recommended for drains." (the section reads the discipline of the network type).
- **Must not touch:** the chip logic, the request key function (the section adds `corners` to its own state, not to the document).
- **Verify:** UI tests: the labels and titles exist; a change of value changes the candidate key. `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps and screenshots in P1-T14.

#### P1-T13. Place the selected candidate; remember the last choice
- **Size:** S (about 60 lines). **Depends on:** P1-T12, P1-T22, **U1-T08, U1-T09, U1-T10**. (Q-P1-05 is answered B, so the storage file is built.)
- **Files:** `RouteBuildSection.tsx`, `packages/ui/src/routePresetStorage.ts` (new; copy the shape of `routeAreaStorage.ts:9-30`), `packages/ui/src/App.tsx` only if the choice must live above the dialog (otherwise the section reads the storage itself), tests.
- **Shapes:** `loadLastChoice(storage): { preset: RoutePresetId; corners: CornerMode }` (default `{ preset: 'balanced', corners: 'both' }`; an unknown value gives the default for that field), `saveLastChoice(storage, choice)`. A saved preset that the discipline list does not offer gives `balanced`. Place calls `scene.applyRoute(selected.view.plan, { size })` as today; if it returns `null` it plans again **with the selected layout and the selected corner value** (as today, `RouteBuildSection.tsx:80-81`, but with `layout` and `corners` in the request).
- **Must not touch:** `applyRoute`; any stored field of the document.
- **Verify:** UI tests: load and save with a fake storage; a bad value gives the default; a preset outside the list gives `balanced`; a test with a fake scene whose `applyRoute` returns `null` checks that `planRoute` is called again with the selected `layout` and `corners`. `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps in P1-T14.

### Phase E. Checks

#### P1-T14. Browser check of the preset flow (real DOM)
- **Size:** M (about 150 lines of check). **Depends on:** P1-T13.
- **Files:** `.claude/roadmap/browser/p1-check.mjs` (new; uses `r6-lib.mjs` and `r6-ui-lib.mjs`).
- **What it checks** (1600 by 1000, English, `01_arch_first_floor.pdf`, project from `buildRoutingProject` with 6 targets, then with 25):
  1. Open the dialog through the helper. Pick start, port and type with the real selects. `route-build-pending` shows, then `route-preset-balanced` is selected and the summary shows. The other chips fill in one after another.
  2. Tap each visible chip with a real click. The summary numbers change as the chip says (the length in the chip equals the length in the summary). The preview changes (pixels of the type colour near a point that only that candidate passes). A hidden duplicate has no chip.
  3. Select "Branch per room" and press `route-place`. In the export: every new segment has `routedBy: 'route'`; an independent count from the export geometry gives fewer served rooms entered from another served room than for Balanced (the same count as `chainedRooms`); an independent walk from the start port reaches every connected target port; every leg is axis or 45 degrees.
  4. Select "Fewest bends" and place on a fresh project: the count of 90 degree bends of the written run equals `stats.bends90` of the chip.
  5. Undo through `.mep-rail-btn[title="Undo"]` (close the dialog first, as in R6-T22): the export equals the baseline.
  6. Change an input (clear one room): the chips recompute; the selected chip stays selected if its plan is still valid.
  7. **Corner choice.** Tap `route-corners-right`: the chips recompute; the plan has no 45 degree leg (independent check of the preview geometry through the scene API read, then of the export after Place). Tap `route-corners-diagonal`: `bends90` in the chips is lower than for `both`, and every leg is axis or 45 degrees after Place. Tap `route-corners-both`: the numbers equal the first run.
  8. **Look at the plan while choosing.** With the dialog open, zoom with the wheel over the canvas and pan with the middle button (U1-T14): the viewport changes, the dialog stays open, the chips keep their selection, and a click on another chip afterwards still works.
  9. Reload the dialog: the last preset and the last corner choice are selected (Q-P1-05 B).
  10. A project with an empty `networkTypes`: Place of a non-default preset adopts the type (the export holds it; the line has the library colour, not the default).
  11. A foreign segment on the start port: all chips are disabled or the section shows the start error; `route-place` is disabled.
  12. A 400 px wide window: `scrollWidth <= clientWidth` of `.mep-modal--route`; the chips and the corner buttons wrap.
  13. The w_rooms and 10A drawings (local; skipped with a message when absent): the chips fill; the times print; for w_rooms the `chainedRooms` count of Branch per room is lower than for Balanced.
  14. **Crossings with other types.** Place a first route (a supply type), then open the dialog for a second network type that crosses it: the chips show `existingCrossings` above 0 and the lines list them.
  15. **Penetrations.** The chip title and the Place result show "N penetrations, fire damper or fire sealing to check" with the two numbers (room walls, corridor wall) and the rating note.
  16. No page error. The export before and after preview-only steps is the same.
- **Screenshots (upload each to the dashboard right after the task):** `P1-T14-chips-balanced`, `P1-T14-chips-branch-per-room`, `P1-T14-chips-fewest-bends`, `P1-T14-chips-pending`, `P1-T14-chips-duplicate-note`, `P1-T14-chips-refused`, `P1-T14-corners-right`, `P1-T14-corners-diagonal`, `P1-T14-placed`, `P1-T14-narrow`, `P1-T14-dark`, `P1-T14-wrooms-balanced`, `P1-T14-wrooms-branch-per-room`.
- **Verify:** the check exits 0; screenshots are read by the UI reviewer.

#### P1-T15. The part check
- **Size:** S. **Depends on:** all tasks above (except the cancelled P1-T10).
- **Files:** none (no product code). `p1-check.mjs` is the part check.
- **Verify (one command for each call):** `pnpm --filter @mepapp/core test`; `pnpm --filter @mepapp/ui test`; `pnpm typecheck`; `pnpm build` (fresh; report the cached count); `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/p1-check.mjs`; no regression: `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs`, `r5-check.mjs`, `r6-check.mjs`, one command each. Also check that `git diff --stat <base commit> -- packages/core/src/project.ts packages/core/src/schema.ts` (`<base commit>` is the commit hash of the branch head before the first P1 task; the director writes it into section 12; `origin-base` is not a git ref) is empty (no schema change). Re-run the defect report (`route-defects-report.test.ts`) and paste the table for Balanced and for Branch per room into section 12.
- **After the check:** the director marks P1 done in this file with the commit of each task.

## 7. Dependencies on U1 and Q1

Basis: `ui-cleanup-rail-i18n.md` and `route-quality-research.md`, read again on 2026-10-27.

**U1 tasks that touch P1 files**

| U1 task | What it does | Effect on P1 |
|---|---|---|
| U1-T01 | Removes the Dutch path (done, `7ba9154`) | P1 adds English text only. No conflict. |
| U1-T07 | Browser checks move from the Menu to the rail (done, `281d401`) | P1 checks use the dialog opener of the rail. `openDialog` in `r6-ui-lib.mjs:11`: not verified if it was changed. |
| U1-T08 | Severity marks in `RouteBuildSection.tsx` and `routeBuildPlan.ts` | Shared files. **The chip UI waits for it.** Not built (done so far: U1-T01 to T07, T11, T12, T14). |
| U1-T09 | Route dialog fields (`RouteDialog.tsx`) | The corner control and the chips sit in the dialog that this task changes. **Waits for it.** Not built. |
| U1-T10 | Cuts text in `RouteBuildSection.tsx`, `RouteAreaSection.tsx`, `routeBuildPlan.ts`; "Place route" keeps its text (Q-U1-06 A) | **P1-T11, T12, T13 and T22 wait for U1-T08, U1-T09 and U1-T10.** They edit the same files. U1-T13 (the part check) also edits them if it changes text there: the director checks. Not built when this was written (no commit with these ids in the log). |
| U1-T14 | The user can pan and zoom the PDF while the Route dialog is open (done, `2a64bf1`) | The user can look at the plan while choosing chips and corners. P1-T12 note and P1-T14 step 8. The task is not in the text of `ui-cleanup-rail-i18n.md` (a search finds no `U1-T14` there); the commit exists. |

U1 keeps text on the main buttons (Q-U1-06 A). The chips and the corner buttons of P1 show a short label and numbers, and use the `IconButton` and `InfoTip` parts of U1-T04 only where an icon helps (the warning mark).

**Q1 tasks that touch P1 files**

| Q1 task | What it does | Effect on P1 |
|---|---|---|
| Q1-T06 | The five Q1 option fields (built, `606c65c`) | Replaced the experiment switch. `RouteLayoutOptions` is the only seam. |
| Q1-T07, T08, T09, T10 | `bridgeParts`, `trunkBends`, `linkSearch`, `exactSpine` (built, with reports) | Give small gains (section 3.2). Presets use `linkSearch` and `exactSpine`; none uses `bridgeParts` or `trunkBends`. |
| Q1-T11 | `planBestRoute`, `routeSignature` (built, `cc7833f`) | P1-T06 reuses `routeSignature`. |
| Q1-T05 | Defect catalogue from the screenshot (done, `19ebf98`) and new metrics | Source of the G0 and G1 tests. |
| Q1-T12, T13 | `ripUp`, spike | **Held** (Q-Q1-09 C). No preset uses `ripUp`. |
| Q1-T15 | Browser check of the Q1 variants | Depends on P1-T09. Held with Q1. |
| Q1-T16 | Default output stays byte-equal until a later Q2 decision | "Balanced" stays today's layout until Q2. The identity tests of P1 stay valid until then. |

**Independent of U1 and Q1 (can run now):** P1-T23, P1-T02, P1-T04, P1-T05, P1-T16, P1-T24 (core only, no change of output). The phase N tasks T17 to T20 and the corner tasks T03 and T21 are core only and do not wait for U1 or Q1.
**Depends on U1 (hard, UI only):** P1-T11, P1-T12, P1-T13 and P1-T22 wait for U1-T08, T09 and T10. P1-T14 and P1-T15 wait for them.
**Recommended order:** P1-T23 and P1-T16 first (small, no risk). Then P1-T02, T04, T05. Then P1-T17 to T20 (gate G0). In parallel, if a second worker is free: P1-T03 and P1-T21. Then P1-T24 (any time before T20), P1-T06, P1-T09, and the gates P1-T07 and P1-T08. The corner control T22 can start as soon as T03, T21, T09 and U1-T08 to T10 are in; it does not wait for the gates. Then T11, T12, T13 after the gates. Then T14 and T15. What can run without a decision: T23, T02, T04, T05, T16, T24, T03, T17 to T19 (T21 builds reading A of Q-P1-09).

## 8. What P1 does not do

- No friction or pressure-drop estimate on the chips. The code has no fitting loss coefficients. Later part.
- No "Home run" topology (one branch from the start to each room). Later part, size L.
- No new trunk algorithm and no joining of the corridor graph parts (D-8). The Q1 prototype `bridgeParts` exists but raises length and bends, and no preset uses it (Q-Q1-09 C). The long diagonals (D-6) are removed by the corner mode `90 only` and are not fixed in the mode `both`.
- No door data and no fire rating. The synthetic entry is a point on the wall. Every wall crossing stays a "penetration to check". The planner does not know the fire rating; the chip and the Place result say "fire damper or fire sealing to check".
- **Each network type is routed on its own.** The preview shows crossings with other network types as `existingCrossings`. Supply and return are not paired.
- **Routing does not know the duct size** (sizing runs after routing, R5). So the 45 only diagonal keeps 300 mm, and the tooltip says to check it after sizing.
- No tap-to-elbow rule by main size yet. The planner only forbids a tap on a leg that has a bend or a chamfer within the tap distance (300 mm, `MIN_LEG_MM`). A rule by size is a later part.
- No change of the entry of a room that has a real entry and is reached by the trunk (that room already gets one branch).
- No clash check against beams or ceilings (R6 section 8).
- No stored preset id or corner choice on segments or documents.
- No preset for the sizing step. Sizing stays the check box of R6.
- No Dutch text; the UI text is English only.
- No worker, unless G2 fails and the user chooses it later. Q-P1-07 is answered A (fewer presets and staged compute).
- Not the items of `room-type-calculations-small-fixes.md`. Not the R7 work. The R7 plan (`.claude/plans/auto-routing-r7.md`) edits `scene.ts` (T10, T11), `packages/core/src/index.ts`, `RouteDialog.tsx` (T14), `App.tsx` and the schema (step 22). The worktree `agent-framework` sits at master `89df9e5` and holds none of these edits yet. P1 edits `scene.ts` (T09), `RouteBuildSection.tsx`, `routeBuildPlan.ts` and maybe `App.tsx` (T13), not the schema. When R7 merges, these files may conflict; rebase and run `pnpm build`.

## 9. Risks

- **R-1 The presets give the same plan.** Penalties reach only the room spines (correction 2); the corridor graph is a forest, so `trunkBends` and the trunk are fixed. Offices with one or two ports give the same spine for any weights. Gates G0 and G1 measure it. Fallback: ship fewer presets (G1).
- **R-2 The names promise what the plan does not give.** "Fewest bends" with a penalty may not give fewer bends in every case. The chip shows the real number; G1 checks the direction. If a name fails, the preset leaves the list.
- **R-3 Time.** Several plans cost several times 26 to 105 ms in scenario A, and seconds in scenario B (section 3.2). Staged compute and `LAZY_ABOVE_MS` keep the screen alive. Gate G2. The corner mode `diagonal` adds a pass.
- **R-4 Stale candidates.** A drawing change during staged compute must cancel the pending presets. P1-T11 has a test; P1-T14 step 6 checks it.
- **R-5 A candidate that was ok becomes refused after a change.** The selected chip must fall back to `balanced`, and the Place button must follow the selected candidate. Test in P1-T11.
- **R-6 Merge conflicts with U1 and R7** (sections 7 and 8). R7 edits `scene.ts`, `index.ts`, `RouteDialog.tsx`, `App.tsx` and the schema; P1 edits `scene.ts`, the section, `routeBuildPlan.ts` and maybe `App.tsx`. After each merge: `pnpm build`.
- **R-7 The default drifts.** If a later Q2 changes the default, "Balanced" changes too. The identity tests are re-baselined in that task.
- **R-8 The cause of D-1 and D-5 may be wrong.** Correction 14 is a reading of the code. P1-T16 measures it. If half of the chained rooms come from branches or spines of rooms the trunk reaches, the new algorithm will not remove them, and the plan needs a second look (the stop rule of P1-T16).
- **R-9 The synthetic entry hides a bad wall.** A branch may enter a room through a thick or fire-rated wall because the model has no door data. The plan counts each crossing as a penetration to check, as it did for links. The chip tooltip shows `wallCrossings`. A door model is a later part.
- **R-10 The chamfer breaks a junction.** A tap or a port near a corner may lose its place. The tests of P1-T21 (protected points, end points equal) and the `checkInvariant` run guard it.
- **R-11 "45 only" may mean something else to the user.** Q-P1-09 asks. P1-T21 waits for the answer only in the sense that the planner builds reading A.
- **R-13 A branch or chain through a toilet, kitchen, shaft, stair or electrical room.** The cost has no such term unless the room type library marks these types. `Room.roomTypeId` exists (`rooms/room.ts:38`) and `RouteBuildInput.rooms` holds `Room`, so a penalty is possible (section 4.6 rule 6). Which `roomTypeId` values mean these types: not verified. If no mark exists, the risk stays open and the chain warning (Q-P1-11) is the only guard.
- **R-14 G0 may fail by design.** Off-graph rooms usually have another room between them and the corridor (section 4.6, limit). The stop rule of P1-T16 (number S) and Q-P1-12 handle it.
- **R-12 Not verified.** The sources of section 3.1; the share of the plan time that the room spine uses; the 10A and w_rooms numbers (local files only); whether `r6-ui-lib.mjs` was changed by U1-T07; the test list of `route-build.test.ts` for P1-T01 (not re-read); the exact fixture "first floor with 25 targets" used by `r6-time-check.mjs` against the harness scenarios A/B.

## 10. Questions for the user (options A, B, C; recommendation marked)

### Answered

| Id | Question (short) | Answer |
|---|---|---|
| Q-P1-01 | Is "Fewest bends" = 90 degree legs only a hard rule? | **B.** Cost only. 45 degree jumps stay allowed. (The user wants a separate control for corners: Q-P1-08.) |
| Q-P1-02 | May the user place a candidate that has warnings? | **A.** Yes, as today. The chip shows a warning mark. |
| Q-P1-03 | What does the dialog do with two candidates that look the same? | **A.** Hide the later one and show one text "N layouts give the same result". |
| Q-P1-04 | Does the plan show the other candidates? | **A.** No. Only the selected candidate shows. P1-T10 is cancelled. |
| Q-P1-05 | Does the dialog remember the last choice? | **B.** Yes, in a browser setting. Not stored in the file. |
| Q-P1-06 | Which disciplines get presets first? | **B.** A list for each discipline (section 4.2). |
| Q-P1-07 | If gate G2 fails, what then? | **A.** Fewer presets and staged compute. |
| Q-P1-08 | A corner choice in the dialog? | **A.** Yes: `90 only`, `45 only`, `both`. A dialog control next to the chips, not a preset. It sets `corners` in the layout options (section 4.5). |

### Open (4 for the user: Q-P1-09 to Q-P1-12)

**Q-P1-09. What does "45 only" mean?** [no data model]
- A. Every turn is made of 45 degree elbows. A 90 degree corner becomes two 45 degree bends with a short diagonal leg between them. The diagonal is at least 300 mm now. When the duct or pipe size is known it should be at least 1.5 times the width or diameter (not verified); routing runs before sizing, so the tooltip says "Check the diagonal after sizing". Legs stay at 0, 45 and 90 degrees. A corner with no room keeps its 90 degree elbow, and the plan shows the real count of 90 degree bends.
- B. As A, but a plan that keeps any 90 degree elbow gets a warning, and the chip is marked.
- C. Something else (the user says what).
- **Recommendation: A.** It follows the layout rule of R6 (legs 0, 45, 90) and the fittings that exist. B adds a new warning code and text for a rare case. The reading is from the planner, not from the user (not verified). Note for the user: two 45 degree elbows give no gain against one long-radius 90 degree elbow in a duct. The gain is for drains and some pipes.

**Q-P1-10. Which layout is the first chip, selected when the dialog opens?** [no data model]
- A. Balanced stays first (today's result, unchanged). "Branch per room" is the second chip. After gate G0 and G1 the director shows the measured table and asks again. The answer may differ by discipline ("Branch per room" may become the default for ducts only).
- B. "Branch per room" becomes the first chip and the default for all disciplines. Balanced is renamed "Classic" and moves to the second place.
- **Recommendation: A for now.** The seam rule says that Balanced equals today's output until a Q2 decision, and the new algorithm is not measured yet. The question is asked again with numbers after P1-T20. If the numbers are good, B for ducts is the likely answer.

**Q-P1-11. A room that has no clear way from the corridor (it is behind another room). What does "Branch per room" do?** [no data model]
- A. Last resort: the room is joined through the other room with the old link code. Every terminal is still connected. Two limits: (1) the chip and the result show each such chain as a **warning**; (2) the planner never chains through a toilet, kitchen, shaft, stair or electrical room if another way exists (a penalty on the cost; it works only if the room type library marks these types, otherwise the risk R-13 stays open).
- B. The room stays unconnected and the plan shows "ports left" for it.
- **Recommendation: A.** The user said "each room connected separately from the corridor *if possible*". B leaves terminals without a duct, which is worse than a chain. The planner builds A with the two limits.

**Q-P1-12. May the planner make a new hole in a room wall where the room has no entry?** [no data model] A synthetic entry is a point on a wall that touches the corridor. The model has no doors and no fire rating, so the wall may be fire rated.
- A. Yes, one hole for each room. The plan counts it as a penetration, shows "fire damper or fire sealing to check", and prefers the part of the wall that touches the corridor. It never uses an outer wall or a wall between two served rooms.
- B. No. "Branch per room" serves only rooms that have a real entry. Other rooms keep the old links.
- C. Yes, but only after the user marks the doors (a new door model; not planned in P1).
- **Recommendation: A.** The old links already cross walls, and they cross more of them (one hole for each terminal). One hole per room is fewer penetrations than today. If gate G0 shows that only a few rooms qualify (stop rule S of P1-T16), the director shows the numbers first.

Defaults that I assume (change them if wrong): the preset order is fixed (Balanced, Branch per room, Shortest run, Fewest bends, Fewer crossings; the discipline lists drop some); the chip shows name, length in metres, bend count and a warning mark; the full numbers are in a tooltip; the first chip is selected on open; Place uses the existing "Size the network after routing" check box; no preset changes the sizing; the 300 ms debounce stays; the corner choice and the preset are two separate controls; the corner control starts at `both`; a synthetic entry is a point on a wall stretch that touches the corridor, every 500 mm, plus the terminal lines; a tap keeps 300 mm from other taps and from elbows; off-graph rooms are planned nearest to the start first; the largest search distance `searchMm` is 30 000 mm; the browser setting stores the last preset and the last corner choice together; a preset that the discipline list does not offer is not shown.

## 11. Revision log

| Date | Change |
|---|---|
| 2026-10-25 | First version by the road map planner. 15 tasks (P1-T01 to P1-T15), 7 questions (Q-P1-01 to Q-P1-07), 2 gates. Sibling plans U1 and Q1 did not exist yet; section 7 uses the feedback prompt only. |
| 2026-10-25 | **Revision 1** (audit round 1, director decisions). Seams fixed: `RouteLayoutOptions` and `planRoute(input, options?)` are the only core seam (Q1 switches become fields); scene `layout?: RoutePresetId \| RouteLayoutOptions` (Q1-T15 depends on it); P1 owns `ROUTE_PRESETS`, Q1-T11 owns scoring. G1 is a machine check with a flag `GATE_G1`, expected to fail without Q1-T07 to T09. P1-T03 moves after the gate. Section 7 rewritten with the real U1 and Q1 task ids (P1-T11 to T13 wait for U1-T10; P1-T02 is ordered against Q1-T08). "Avoid clashes" renamed "Fewer crossings" with tooltips. Q-P1-01 recommends B (cost only); Q-P1-06 recommends B (a list for each discipline). P1-T05 states that the off-graph axis column leaves the table if `tap.perpendicular` is null. |
| 2026-10-27 | **Revision 2.** Inputs: user answers Q-P1-01 to Q-P1-08; gate decision Q-Q1-09 C (Q1 research stops); the user screenshot of the auto-route on the w_rooms floor (defect classes D-1 to D-8). Changes: see the list below. |
| 2026-10-27 | **Revision 3.** Inputs: the audit of revision 2 (code facts) and the domain review. Changes: see the second list below. Where a finding met a user answer, the user answer stays (Q-P1-08 A: the corner control does not wait for the gates; Q-P1-01 B: "Fewest bends" stays cost only; Q-P1-07 A). |

**What changed in revision 2:**
1. Status: P1-T01 is built (`7d3d255`). Section 2 and section 4.2 show the real type (all fields optional; `orthogonalOnly` exists but nothing reads it). The planned `planSignature` is dropped: P1-T06 reuses `routeSignature`.
2. Questions: Q-P1-01 to Q-P1-08 are marked answered in a table. All conditional text is removed (`orthogonalOnly` conditional in T03, T10 conditional, T13 conditional on Q-P1-05). P1-T10 is cancelled (Q-P1-04 A). Three new open questions: Q-P1-09 (meaning of "45 only"), Q-P1-10 (first chip), Q-P1-11 (room with no clear way).
3. Corner choice (Q-P1-08 A): the boolean `orthogonalOnly` is replaced by `corners: 'both' | 'right' | 'diagonal'` (P1-T23). `right` = P1-T03 (now always built, no gate). `diagonal` = new P1-T21 (chamfer). New dialog control P1-T22. The request key, the cache key, the scene request (T09), the storage (T13), the gate G2 and the browser check (T14, steps 7 to 9) carry the corner value. The corner value is not part of a preset.
4. Room branch (defects D-1, D-2, D-4 in part, D-5): new section 4.6 and tasks P1-T16 (diagnosis), T17 (entry candidates), T18 (reach search), T19 (wiring, option `roomBranches`), T20 (preset `branch-per-room` and gate G0 with the new metrics). The section says which part is an option and which part is a new algorithm.
5. Preset table: new preset "Branch per room"; "Fewer crossings" now uses `linkSearch` (no `ripUp`, Q1-T12 held); "Fewest bends" uses `exactSpine`; the discipline lists include "Fewer crossings" (it was missing). `jogSmallJumpMm` leaves the preset table.
6. Gates: G0 (new, in P1-T20) and G1 (P1-T07) use the new metrics `chainedRooms`, `multiEntryRooms`, `bendsRoom90/45` and the "differs in the direction the name says" rule per preset. G1 no longer waits for Q1-T07 to T09; a preset that fails leaves the list. G2 uses the Q1 timing numbers and gets the rule `LAZY_ABOVE_MS` for large requests.
7. Order: phases A, N, K, T06, C1, B, D, E (section 6). U1-T10 stays the dependency for the chip UI (T11, T12, T13, T22). U1-T14 (done) is noted in section 1, in P1-T12 and in P1-T14 step 8.
8. Corrections 9 to 14 added (built state, unused fields, existing signature, missing preset in lists, the long diagonals do not come from the bridge, why D-1 and D-5 come from loose ports).
9. Risks R-8 to R-11 added.

**What changed in revision 3:**
1. Gate G0 (HIGH-1): P1-T16 also counts off-graph rooms, `area.unreached` distances, rooms with a synthetic candidate and rooms with a clear axis path, and gives a number S as stop rule. Carriers are the trunk tree only (decision in section 4.6; corridor edges outside the tree would join graph parts, D-8, which is held). G0 states the drawing it asserts on. Correction 14 and section 4.6 now say 43 served rooms, 33 off graph, 10 with an entry on w_rooms.
2. P1-T18 gets `accepts` and `runsOverOtherPort`, a room penalty, a wall price, a pre-filter by `searchMm` and bounding box, and a runtime assert (HIGH-2, MED-7). One test each.
3. Off-graph axis (MED-1): today's rule is "perpendicular first". The new mode is `'longer'`. The values are renamed, the preset table and R-12 are fixed, and no preset uses the field.
4. P1-T19 (MED-2): carriers are kept in a list in `route-build.ts`; `planBranches` gets `taps` in and out; a fixed branch enters `placed`; a 300 mm spacing test.
5. U1 dependencies (MED-3): T11, T12, T13, T22 wait for U1-T08, T09, T10. Done so far: U1-T01 to T07, T11, T12, T14.
6. P1-T21 (MED-4): `accepts`, a region test for each path origin, a test with a foreign segment near a corner. P1-T03 (MED-5): a free edge keeps its warning; axis legs asserted for non-free edges; `freeLegs` not higher than `both`.
7. Gates and order (MED-6): the corner control T22 does not wait for G0/G1/G2 (it waits for T03, T21, T09, U1). T08 depends on T03, T21, T19. G1 uses a fixed list of preset ids and names the discipline lists.
8. P1-T02 (MED-8): passes the bend price to `exactRoomSpine` and `spineScore` too.
9. Low items: penalty constant lines `route-hanan.ts:4-5` and `:247`; trunk retry `route-trunk.ts:174-188`; T23 needs no `index.ts` edit (`index.ts:17`) and keeps the option pass-through tests (`route-build.test.ts:764-766`, `:814-817`); Balanced is `{}` (one rule); P1-T06 owns `route-presets.ts` (T20 uses the option value directly); T15 uses a base commit hash; R7 clash list now has `scene.ts`, `index.ts`, `App.tsx`, `RouteDialog.tsx` and the schema. New tests: unknown preset id, `roomBranches` plus `exactSpine`, Place re-plans with layout and corners, `diagonal` determinism and shuffled input.
10. Domain: wall crossings in two numbers and the fire damper text (new P1-T24, T12); synthetic entries only on a wall that touches the corridor, exactly one hole per room, G0 asserts `multiEntryRooms` 0 for such rooms; a second route shows `existingCrossings` (T07, T14 step 14); the 45 only diagonal rule and the tooltips for ducts, trays, pipes and drains; fittings shown on the chip in 45-only mode; no tap near an elbow; branch order nearest to the start and the longest path on the chip; chain through another room is a warning and a room-type penalty is planned (R-13).
11. Questions: Q-P1-09, 10, 11 reworded; new Q-P1-12 (a new hole in a possibly fire-rated wall).

## 12. Gate record (filled by the director)

| Gate | Date | Result | Table or numbers |
|---|---|---|---|
| Diagnosis (P1-T16) | 2026-10-27 | Rule (1) passes. Rule (2) FIRES: S below 0.3 on the first floor and on w_rooms. Work on T17 to T19 waits for the director (Q-P1-12). | See the table under this one. |
| G0 (P1-T20) | not run | not run | |
| G1 (P1-T07) | not run | not run | |
| G2 (P1-T08) | not run | not run | |

**Numbers of P1-T16** (commit `54930b2`; start 0; default options; A = one terminal for each room, B = grid terminals). S = rooms with a clear way / rooms in the union of chained rooms, multi-entry rooms and off-graph rooms with 2 or more ports. A clear way: an axis path with at most one bend from a tap on the trunk tree (trunk and bridge paths) to a real entry (or, when the room has none, to a synthetic candidate on a wall stretch that touches a route-area room), with no sample of 100 mm inside another served room. The search takes the 10 nearest taps within 20 m. With 80 nearest taps within 80 m the result stays below 0.3 on the first floor for A (0.11) and rises to 0.26 for B.

| Drawing, scenario | Served rooms | Served by trunk | Off graph | Off graph with real entry | Off graph with synthetic candidate | Off graph with clear way | `area.unreached` (distance mm, median / max) |
|---|---|---|---|---|---|---|---|
| first floor A and B | 33 | 5 | 28 | 13 | 10 | 3 | 15 (4220 / 9370) |
| w_rooms A and B | 43 | 10 | 33 | 0 | 0 | 0 | 33 (8730 / 18780) |
| 10A A and B | 27 | 8 | 19 | 6 | 6 | 1 | 13 (3230 / 5410) |

| Drawing, scenario | Chained rooms | Multi-entry rooms | Origin of the chained rooms | Origin of the multi-entry rooms | Long diagonal legs (origin) | Union / with clear way / with no candidate | S |
|---|---|---|---|---|---|---|---|
| first floor A | 18 | 1 | link 18 | link 1 | 0 | 18 / 1 / 9 | 0.06 |
| first floor B | 18 | 4 | link 18 | link 2, spine 2 | 0 | 31 / 6 / 15 | 0.19 |
| w_rooms A | 20 | 4 | link 20 | link 1, branch 2, trunk 1 | 1 (trunk) | 23 / 3 / 20 | 0.13 |
| w_rooms B | 25 | 15 | link 25 | link 10, spine 4, branch 1 | 1 (trunk) | 38 / 5 / 33 | 0.13 |
| 10A A | 9 | 2 | link 9 | link 1, spine 1 | 0 | 9 / 3 / 6 | 0.33 |
| 10A B | 11 | 9 | link 11 | link 6, spine 3 | 0 | 22 / 4 / 13 | 0.18 |

Notes:
- The origin is the stage with the shortest distance to the event point (a wall crossing for a chained room, a room entry for a multi-entry room). The metrics `chainedRooms` and `multiEntryRooms` equal the counts of the test in all six runs.
- The share of items whose dominant origin is `link` is 0.85 to 1.00 (rule 1 needs 0.5). Items with at least one `link` leg: 0.90 to 1.00.
- The long diagonals (D-6) on the two drawings that have any come from the trunk (straightened corridor edges), not from `link`, `branch` or `bridge`. The test finds 1 long diagonal leg on w_rooms where the metric finds 2: probably the plan splits one long leg into two segments (not verified). The first floor and 10A have none at the default options.
- Most rooms of the union have no candidate at all (no real entry and no wall stretch that touches a route-area room): 9 of 18 and 15 of 31 on the first floor, 20 of 23 and 33 of 38 on w_rooms (no served room touches a corridor there: the nearest is 1890 mm away), 6 of 9 and 13 of 22 on 10A. The new algorithm of section 4.6 has no entry to use for these rooms.
- Limits of the measure: carriers are the trunk tree only (decision of section 4.6); parts of earlier room branches are not carriers; the probe is 300 mm; a sample cell is 50 mm. These are measurement choices of the test, not verified values.
