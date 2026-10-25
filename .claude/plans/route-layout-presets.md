# P1 plan: route layout presets (a few layouts of one route, each with a preview, before the user places it)

Status: PLANNED 2026-10-25 by the road map planner. Nothing is built. Part prefix: P1. Task ids: P1-T01 to P1-T15. Question ids: Q-P1-01 to Q-P1-07.

Origin: comment 3 of the user test of R1 to R6 ("offer a few preloaded route layouts with a preview before the user places the route, like Revit Generate Layout"). Sources: `auto-routing-feedback-prompt.md` (section "Findings: presets"), `auto-routing-r6.md`, `.claude/roadmap/rules.md`, the code at the commit of branch `worktree-routing-feedback`.

Sibling plans: `ui-cleanup-rail-i18n.md` (prefix U1) and `route-quality-research.md` (prefix Q1). Revision 1 (audit round 1) reads both plans. Section 7 uses their real task ids.

**Seams that the director fixed (revision 1):**
1. P1-T01 creates `RouteLayoutOptions` and `planRoute(input, options?)`. This is the only core seam. A Q1 prototype switch is a field of `RouteLayoutOptions`. Q1-T06 must use this type and not a second `experiment` object on `RouteBuildInput`.
2. P1-T09 adds `layout?: RoutePresetId | RouteLayoutOptions` to the scene `RouteRequest`. Q1-T15 depends on it.
3. P1 owns the preset list: `ROUTE_PRESETS`, a list of named `RouteLayoutOptions`. Q1-T11 (`planBestRoute`) takes this list type and owns the scoring only.

Terms (the terms of `auto-routing.md` and `auto-routing-r6.md` apply). New terms:
- **Layout options**: a small object of numbers and switches (`RouteLayoutOptions`) that the planner reads. The default value gives today's result.
- **Preset**: a named layout options value, with an id, shown to the user as a chip (a small selectable tile). A preset is code, not stored data.
- **Candidate**: the plan (`PlannedRoute`) that the planner makes for one preset on one request.
- **Signature**: a text made from the rounded geometry of a plan. Two plans with the same signature look the same.
- **Gate**: a point in the order where the work stops until a measurement passes.

## 0. Corrections to the earlier findings

The earlier investigation (2026-10-20) was checked against the code. Eight corrections:

1. **The preview flow is in `RouteBuildSection`, not in `RouteDialog`.** `RouteDialog` only builds the request (`packages/ui/src/components/RouteDialog.tsx:119-133`). The debounce, the call `scene.planRoute` and the call `scene.setRoutePreview` are in `packages/ui/src/components/RouteBuildSection.tsx:41-68`. Place is at `:77-84`. All UI tasks change `RouteBuildSection`.
2. **`planRoute` has no options object, as the finding says (`packages/core/src/route-build.ts:193`). But an options object must travel further than the finding says.** The planner calls `buildTrunk` (`route-build.ts:279`), `planBranches` (`:305`), `connectLoosePorts` (`:336`) and `buildRouteItems` (`:359`). The penalties are module constants (`route-hanan.ts:3-4`) and are used in one place only (`route-hanan.ts:205`, the room spine). The trunk is a Steiner tree with length cost only (`route-trunk.ts:134-137`). So a bend penalty or a crossing penalty changes the segments **inside rooms** only. It does not change the trunk and not the off-graph links. This makes the risk "presets give the same plan" larger than the finding says. Gate G1 (P1-T07) is expected to fail on these penalty fields alone. It needs the trunk and link options of Q1 (section 4.2, fields `bridgeParts`, `trunkBends`, `linkSearch`).
3. **`scene.setRoutePreview` takes one plan, as the finding says (`packages/render/src/scene.ts:2991`), but the drawing has no field for more than one plan.** `RoutePreviewView` (`packages/render/src/routePreviewLayer.ts:12-19`) holds one set of `paths`. Ghosts of other candidates need a new field (P1-T10, conditional).
4. **"No schema change" is correct** for the preset. The preset id is a dialog choice. `CURRENT_SCHEMA_VERSION` stays unchanged (R6 made step 21; `routedBy` stays `'route'`). Two limits: (a) the choice of a preset is not recorded on the segments, so a re-run shows no memory of the earlier preset unless the browser remembers it (Q-P1-05); (b) a stored preset id for each document or network type would be a new stored field. That is a data-model decision (Q-P1-05 option C), not planned.
5. **The jump limit is also a constant.** `SMALL_JUMP_MM = 1000` is used inside `applyJogRule` (`route-layout.ts:95`). `applyJogRule` is called from `straightenPolyline` (`route-layout.ts:214`) and from `branchPath` (`route-branch.ts:170`). "Orthogonal only" is more than a flag: the trunk keeps exact 45 degree legs of the skeleton (P-R6-DIAG, `legClass` at `route-layout.ts:13-20`), so a 90-degree-only mode must also turn those legs into right-angle steps. P1-T03 is size M, not S.
6. **The entry rule is local.** The entry order is in `entriesOf` (`route-trunk.ts:91-99`: primary first, then the longest run first, then the id). The next entry is tried only when the tap node is not reached (`route-trunk.ts:140-153`). An entry option changes this one function.
7. **The off-graph axis option is a preference, not a rule.** `connectLoosePorts` tries the axis `tap.perpendicular ?? longer` first and then the other axis (`route-topology.ts:385-399`). An option changes the order of the two tries. Both stay in use as fallback.
8. **The time numbers are not measured by this plan.** "About 150 ms" comes from `auto-routing-r6.md:47` (144 to 155 ms on the first floor, 93 ms on 10A). The route area is cached per rooms and types (`scene.ts:741`, `:3831-3841`), so a second candidate does not pay for it again. Not verified: how much of the 150 ms is the room spine. P1-T08 measures it.

Verified without change: the preview runs 300 ms after the last change (`RouteBuildSection.tsx:13`, `:48-51`); the request key is `routeRequestKey` (`RouteBuildSection.tsx:16-19`); `scene.planRoute` reads the live document and does not change it (`scene.ts:2936-2988`); `applyRoute` is one undo step and adopts the network types first (`scene.ts:3017-3082`, adoption at `:3044`); the invariant check is inside `planRoute` (`route-build.ts:408-417`); there is no fitting loss coefficient in the code (a search for loss coefficient, fitting loss, equivalent length and k-factor in `packages` finds nothing), so "friction estimate" is a later part.

## 1. Goal

The user opens "Route network…". Today the dialog shows one preview and one Place button. After P1, the section "Route" shows a row of chips above the numbers. Each chip is one layout of the same route (for example "Balanced", "Shortest run", "Fewest bends", "Fewer crossings"). The first chip is selected and its preview shows on the plan. The user taps another chip. The preview changes. The numbers and warnings change. The user presses "Place route". The app writes the selected candidate with the existing `applyRoute`. This is one undo step. The segments are normal segments with the route mark.

Example (first floor, 6 served offices, an air handling unit on the corridor): "Balanced" shows 86 segments and 212 m (numbers as an example, not measured). "Fewest bends" shows fewer 90 degree bends inside the offices and a few more metres. "Shortest run" shows less pipe length. The user compares the chips and places one.

Where P1 stops: P1 adds no stored data, no new algorithm for the trunk (that is Q1), no friction estimate, no "home run" topology and no new dialog. The next part is Q1 (algorithm quality) or U1 (dialog cleanup). They do not depend on P1 to finish.

## 2. What exists now (path:line, from the branch)

| Item | Where |
|---|---|
| `planRoute(input)` returns `{ status, plan }`; no options | `packages/core/src/route-build.ts:193` |
| `RouteBuildInput`, `PlannedRoute`, `RouteStats` (segments, fittings, lengthMm, bends90, bends45, freeLegs, rooms, ports, portsLeft, wallCrossings, existingCrossings) | `route-build.ts:27-49` |
| Bend penalty 500 and crossing penalty 1000 (module constants), used in the room spine only | `route-hanan.ts:3-4`, `:205` |
| Trunk: Steiner tree, cost = length; entry order | `route-trunk.ts:101`, `:134-137`, `:91-99` |
| Jog rule and the 1000 mm limit | `route-layout.ts:7`, `:88-110`, `:209-214` |
| Branch path and tap rules | `route-branch.ts:156-171`, `:182-248` |
| Off-graph connection, axis order | `route-topology.ts:357-411`, `:385-399` |
| Scene `RouteRequest`, `RoutePlanView`; `planRoute`; `setRoutePreview`; `applyRoute` | `packages/render/src/scene.ts:496-505`, `:2936`, `:2991`, `:3017` |
| Preview drawing (one plan, dashed, removed runs, warning marks) | `packages/render/src/routePreviewLayer.ts:12-47`; called at `scene.ts:5761` |
| The section: debounce, events, Place, result | `packages/ui/src/components/RouteBuildSection.tsx:21-125` |
| Texts and lines of the section (English only) | `packages/ui/src/components/routeBuildPlan.ts` (`TEXTS` at `:4`, `buildText` at `:78`, `routeBuildSummary` at `:105`) |
| The request is built in the dialog | `RouteDialog.tsx:119-133`; the section is mounted at `:395-408` |
| Browser setting pattern (load and save with a storage object) | `packages/ui/src/routeAreaStorage.ts:9`, `:22`; used in `App.tsx:450-451` |
| Core tests with the real first floor | `packages/core/src/rooms/route-area-fixture.testutil.ts:8` (`loadFirstFloorRooms`); `packages/core/src/route-run.test.ts:12`, `:162` |
| Timing check (3 target counts, 3 runs each) | `.claude/roadmap/browser/r6-time-check.mjs` |
| Dialog helpers for browser checks (`openDialog` uses the menu item) | `.claude/roadmap/browser/r6-ui-lib.mjs:11` |

## 3. Research

Sources are from the planner's memory. No web search was run. Mark as "not verified" until a person reads them.

- **Revit "Generate Layout"** (duct and pipe systems). The user names it. It offers a small set of solutions that follow a topology (Network, Perimeter, Intersection) and shows each one in the view, with a button to step through them. It is a set of heuristics, not an optimiser. MepApp can copy the shape: a few named candidates, one preview at a time, one Place. Not verified in the Autodesk help.
- **Candidates from one search with different weights.** A usual way: run the same router with other cost weights (bends, length, crossings) and keep the results that differ. MepApp already has the weights in the room spine (`BEND_PENALTY_MM`, `CROSSING_PENALTY_MM`). Not verified in a source.
- **Rectilinear Steiner tree and Hanan grid.** Already used by R6 (`auto-routing-r6.md` section 3). The tree is not unique, but on the corridor graph of R4 the trunk is nearly unique. This is why the gate G1 exists.

What MepApp can use: its own planner with options. No new dependency. No `pnpm add`.

## 4. The model

### 4.1 No stored data

A preset is a value in code. The chosen preset id is dialog state. Nothing goes into `ProjectDocument`, `schema.ts` or the PDF. Proof for each task that says "no stored change": `git diff --stat` shows no change in `packages/core/src/project.ts` and `packages/core/src/schema.ts`; the browser checks compare `JSON.stringify(exportProject())` before and after a preview.

### 4.2 Core types (new file `packages/core/src/route-presets.ts`; the options type may live in `route-layout.ts`)

```ts
export interface RouteLayoutOptions {
  /** Cost of one turn in the room search, mm. Default BEND_PENALTY_MM (500). */
  bendPenaltyMm: number;
  /** Cost of one crossing of an existing foreign segment in the room search, mm. Default CROSSING_PENALTY_MM (1000). */
  crossingPenaltyMm: number;
  /** Largest jump that uses a pair of 45 degree bends, mm. Default SMALL_JUMP_MM (1000). 0 = no 45 degree jumps. */
  jogSmallJumpMm: number;
  /** true = no 45 degree leg at all (the trunk diagonals become right-angle steps). Default false. Built only if Q-P1-01 needs it. */
  orthogonalOnly: boolean;
  /** Which entry of a room the trunk tries first. Default 'primary-longest' (today). */
  entryRule: 'primary-longest' | 'shortest-branch';
  /** Which axis an off-graph link tries first. Default 'longer' (today). Dropped if P1-T05 finds that it never differs. */
  offGraphAxis: 'longer' | 'perpendicular-first';
  /** Fields that Q1 adds (all optional, absent = today's output). P1 only passes them on.
   *  bridgeParts?: { penaltyMm: number }      (Q1-T07)
   *  trunkBends?: { bendMm: number; fittingMm: number }   (Q1-T08)
   *  linkSearch?: { bendMm: number; wallMm: number }      (Q1-T09)
   *  exactSpine?: { maxPorts: number }        (Q1-T10)
   *  ripUp?: { rounds: number }               (Q1-T12) */
}
export const DEFAULT_LAYOUT_OPTIONS: RouteLayoutOptions; // equals today's behaviour

export type RoutePresetId = 'balanced' | 'shortest' | 'fewest-bends' | 'fewer-crossings';
export interface RoutePreset { id: RoutePresetId; name: string; tooltip: string; options: RouteLayoutOptions }
export const ROUTE_PRESETS: readonly RoutePreset[];     // order = chip order; 'balanced' first and equal to DEFAULT_LAYOUT_OPTIONS
/** The presets that a discipline offers (Q-P1-06 B). Ducts: balanced, fewest-bends. Pipes and trays: balanced, fewest-bends, shortest. */
export function presetsForDiscipline(discipline: Discipline): readonly RoutePreset[];

export function planSignature(plan: PlannedRoute): string;   // rounded geometry, 10 mm grid, sorted
// packages/core/src/route-build.ts
export function planRoute(input: RouteBuildInput, options?: RouteLayoutOptions): { status: 'ok' | 'refused'; plan: PlannedRoute };
```

Start values of the four presets (planner values; P1-T07 tunes them from the measurement, not from taste). The Q1 fields are blank until the Q1 task exists; P1-T07 fills them from the Q1 results.

| Preset | bendPenaltyMm | crossingPenaltyMm | jogSmallJumpMm | entryRule | offGraphAxis | Q1 fields |
|---|---|---|---|---|---|---|
| Balanced (today) | 500 | 1000 | 1000 | primary-longest | longer | none |
| Shortest run | 0 | 1000 | 1000 | shortest-branch | longer | none |
| Fewest bends | 3000 | 1000 | 1000 | primary-longest | perpendicular-first | `trunkBends` high, `linkSearch` high bend price |
| Fewer crossings | 500 | 8000 | 1000 | primary-longest | longer | `linkSearch` high wall price, `ripUp` |

**If P1-T05 finds that `tap.perpendicular` is null on the real floors, the column "offGraphAxis" leaves this table and the type.** Then "Fewest bends" has `perpendicularFirst` removed and relies on the Q1 fields.

Names and tooltips (the tooltip is the `title` of the chip):
- **Balanced:** "Today's layout. A mix of length and bends."
- **Shortest run:** "Shortest length. More bends."
- **Fewest bends:** "Fewer bends and fittings. A little more length."
- **Fewer crossings:** "Fewer crossings. Counts only segments on this drawing."

**Presets for each discipline (Q-P1-06 B).** Ducts get Balanced and Fewest bends. Pipes and cable trays get these two and Shortest run. A drain and a cable tray need 45 degree parts, so no preset forbids them (Q-P1-01 B). A "home run" layout (one line from the start to each device) is a later part, and it applies to cables and manifold pipes, not to ducts. A segregation distance between cable trays is also later; no preset checks it.

Not verified: that the values give different plans on the real floors. Gate G1 checks.

### 4.3 Scene (render)

```ts
// scene.ts
export interface RouteRequest { /* existing fields */ layout?: RoutePresetId | RouteLayoutOptions }   // absent = 'balanced'
planRoute(request: RouteRequest): RoutePlanView;   // a preset id maps to ROUTE_PRESETS options; an options object goes to the core planner as given
```

`RoutePlanView` is unchanged. The scene keeps no candidate cache. The cache lives in the UI section (P1-T11), because the UI already owns the debounce and the events that invalidate it.

### 4.4 UI (English only; no Dutch)

New pure module `packages/ui/src/components/routePresets.ts` (state machine and dedupe, testable without React). New component `RoutePresetChips.tsx`. `RouteBuildSection` uses them. Texts go into `routeBuildPlan.ts` (`TEXTS`). Each chip shows: the name, the total length in metres, the bend count, and a mark when the plan has warnings. A tooltip (`title`) on the chip lists the full numbers. The longer help goes to a tooltip, not to visible text (the user asked for less text; see U1).

## 5. How P1 keeps the rules of `rules.md` section 3

1. **Segment defines the network type of a port.** A preset changes the geometry only. `planRoute` still takes the type from `networkTypeId` and writes it on segments. No port, stamp or routing target changes. The foreign-start check and the foreign-join check run for every candidate (`route-build.ts:203-221`, `:408-417`).
2. **Cascade invariant.** Every candidate passes the same `checkInvariant` inside `planRoute`. A candidate that would join two types is `refused`; its chip shows "not possible" and cannot be selected. P1-T01 has a test that runs this for each preset.
3. **Reuse before new.** The preview layer, `setRoutePreview`, `applyRoute`, `RouteBuildSection`, `routeRequestKey`, the debounce and the storage pattern of `routeAreaStorage.ts` are reused. No new stored entity. No second copy of the plan state: the UI keeps a map of candidates and the selected id, and the scene keeps the one drawn preview.
4. **Adoption trap.** `applyRoute` adopts the network types first (`scene.ts:3044`). P1 does not change `applyRoute`. P1-T14 has a check with an empty `networkTypes` project.
5. **Real DOM.** Browser checks click the real chips and the real Place button. The scene API is for setup and for reading state.
6. **Merge lesson.** After every merge of the sibling branches (section 7), run `pnpm build` at the root.

## 6. Order, gates and phases

Order: A (core options) -> C1 (scene seam, P1-T09) -> B (the two gates) -> A2 (P1-T03, after the gate) -> C2 (P1-T10) -> D (UI) -> E (checks). **No UI task starts before both gates pass.** A task that changes only core code does not need a user decision, except where marked.

| Phase | Tasks | Notes |
|---|---|---|
| A. Options in core | P1-T01, T02, T04, T05, T06 | No UI. Default output stays identical. |
| C1. Scene seam | P1-T09 | Needed by the browser part of both gates and by Q1-T15. Runs before the gates. |
| B. Gates | P1-T07 (variety), P1-T08 (time) | Earlier findings T11 (timing) and the "quick comparison" are here, before any UI. T07 waits for Q1-T07 to T09, or for the trunk options (see T07). |
| A2. Jump limit | P1-T03 | After the gate. Its size stays M. Build the right-angle mode only if Q-P1-01 needs it (it recommends B, so only `jogSmallJumpMm`). |
| C2. Ghosts | P1-T10 | Only if Q-P1-04 asks for it. |
| D. UI | P1-T11 to P1-T13 | All three wait for U1-T10 (section 7). |
| E. Checks | P1-T14, P1-T15 | Browser, dashboard screenshots, regression. |

Mapping to the tasks T1 to T13 of the earlier findings: T1 -> P1-T01; T2 -> P1-T02; T3 -> P1-T03; T4 -> P1-T04; T5 -> P1-T05; T6 -> P1-T06; T7 -> P1-T09; T8 -> P1-T11; T9 -> P1-T12; T10 -> P1-T10; T11 (timing) -> P1-T08; T12 (friction) and T13 (home run) -> out of P1 (section 8). New: P1-T07 (the comparison, as a task with a gate), P1-T13, P1-T14, P1-T15.

Commands (run from the root of the worktree; one command for each Bash call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs` (no environment variable before the command; screenshots go to `/tmp/mepapp-shots/`; name each `P1-Tnn-<name>`).

Rules for every browser step: open `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf` with `openPdf` (one Chromium page at a time); the 10A drawing is local only and a check skips it with a message when absent; click only inside `.mep-modal--route`; open the dialog through the helper `openDialog` of `r6-ui-lib.mjs:11` (one place to change when U1 moves the entry).

### Phase A. Options in core

#### P1-T01. Options type, defaults, second argument of `planRoute`
- **Size:** S (about 80 lines). **Depends on:** nothing.
- **Files:** `packages/core/src/route-layout.ts` (the type and the default), `packages/core/src/route-build.ts`, `packages/core/src/index.ts`, `packages/core/src/route-build.test.ts`.
- **Shapes:** `RouteLayoutOptions`, `DEFAULT_LAYOUT_OPTIONS`, `planRoute(input, options = DEFAULT_LAYOUT_OPTIONS)` (section 4.2). The planner passes `options` to the helpers; in this task no helper reads it yet.
- **Must not touch:** `RouteBuildInput` (the options are a second argument, not an input field), the stats, the warnings.
- **Verify:** core test: for the first floor setup of `route-run.test.ts:162`, `planRoute(input)` and `planRoute(input, DEFAULT_LAYOUT_OPTIONS)` deep-equal (ids, geometry, stats, warnings). Core test: the input is unchanged (deep-equal copy). `pnpm --filter @mepapp/core test`, `pnpm typecheck`, `pnpm build`. No browser check. No screenshot.

#### P1-T02. Penalties reach the room search
- **Size:** S (about 60 lines). **Depends on:** P1-T01. **Coordinate with Q1-T08:** Q1-T08 moves the heap (`StateHeap`, `route-hanan.ts:37-93`) to `route-heap.ts`. Do P1-T02 after Q1-T08, or merge P1-T02 first and let Q1-T08 rebase. Both edit `route-hanan.ts`; the director picks the order when both are ready.
- **Files:** `route-hanan.ts` (`SpineInput` gets optional `bendPenaltyMm`, `crossingPenaltyMm`; the constants stay as defaults), `route-branch.ts` (`BranchInput` passes them), `route-build.ts`, tests `route-hanan.test.ts`, `route-branch.test.ts`, `route-build.test.ts`.
- **Shapes:** `SpineInput.bendPenaltyMm?: number`; `SpineInput.crossingPenaltyMm?: number`; `BranchInput` the same two fields.
- **Must not touch:** the order of the search, the tie-breaks (determinism), the exported constants.
- **Verify:** core tests: default call equals today's result (hand case of `route-hanan.test.ts`); a hand case where a bend penalty of 0 gives a shorter path with more bends and a penalty of 3000 gives the opposite; a hand case where a high crossing penalty avoids an existing segment. Same input twice gives the same output. Core tests, typecheck, build. No browser check.

#### P1-T03. Jump limit and right-angle mode
- **Size:** M (about 140 lines). **Depends on:** P1-T01 and gate G1 (it runs after the gate, because G1 may show that the jump limit adds nothing). **Conditional part:** the `orthogonalOnly` mode is built only if Q-P1-01 answers A or C. The `jogSmallJumpMm` part is always built.
- **Files:** `route-layout.ts` (`applyJogRule(path, smallJumpMm = SMALL_JUMP_MM)`, `straightenPolyline` gets the same parameter and, for `orthogonalOnly`, a step that replaces an exact 45 degree leg by a right-angle step), `route-branch.ts` (`branchPath` passes the value), `route-trunk.ts`, `route-build.ts`, tests.
- **Shapes:** `applyJogRule(path: readonly Vec2[], smallJumpMm?: number): Vec2[]`; `TrunkInput.options?: Pick<RouteLayoutOptions,'jogSmallJumpMm'|'orthogonalOnly'>`.
- **Must not touch:** the rule that a free angle always shows a warning; the 300 mm minimum leg (`MIN_LEG_MM`).
- **Verify:** core tests: default equals today's result; `jogSmallJumpMm: 0` gives no 45 degree leg for a Z of 800 mm (today it gives two 45 degree bends); with `orthogonalOnly`, `isLayoutPath` is true and every leg is `axis` on the first floor trunk; the stair keeps the region test (no sample outside the area, `ROUTE_SAMPLE_STEP_MM`). Core tests, typecheck, build. No browser check.

#### P1-T04. Entry rule
- **Size:** S (about 50 lines). **Depends on:** P1-T01.
- **Files:** `route-trunk.ts` (`entriesOf` gets the rule), `route-build.ts`, `route-trunk.test.ts`.
- **Shapes:** `TrunkInput.entryRule?: RouteLayoutOptions['entryRule']`. `'shortest-branch'` sorts the entries of a room by the distance from the entry point to the nearest corridor tap node, then by id. A room that has one entry gives the same result for every rule.
- **Must not touch:** the retry with the next entry when the tap is not reached (`route-trunk.ts:140-153`).
- **Verify:** core tests: default equals today's result; a hand room with two entries picks the other entry under the other rule; a room with one entry is the same; deterministic. Core tests, typecheck, build.

#### P1-T05. Off-graph axis
- **Size:** S (about 40 lines). **Depends on:** P1-T01.
- **Files:** `route-topology.ts` (`ConnectLooseInput.axisOrder?: 'longer' | 'perpendicular-first'`), `route-build.ts`, `route-topology.test.ts`.
- **Shapes:** `'perpendicular-first'` tries `tap.perpendicular` first, else `longer` (today uses `tap.perpendicular ?? longer`, `route-topology.ts:388`). So the two rules differ only where `tap.perpendicular` is null; the task first measures if that case occurs on the first floor and reports. If it never differs, the column "offGraphAxis" leaves the table of section 4.2 and the type `RouteLayoutOptions`, and the task ends with a note (no code kept).
- **Must not touch:** the rule that both axes are tried; `runsOverOtherPort`; the `accepts` check.
- **Verify:** core tests as in T04; a printed count of off-graph links on the first floor for each rule. Core tests, typecheck, build.

#### P1-T06. Preset table and signature
- **Size:** S (about 90 lines). **Depends on:** P1-T02 to P1-T05 (the option names must exist; a dropped option is removed from the table).
- **Files:** `packages/core/src/route-presets.ts` (new), `packages/core/src/route-presets.test.ts` (new), `index.ts`.
- **Shapes:** `ROUTE_PRESETS`, `RoutePresetId`, `presetsForDiscipline`, `planSignature(plan)` (section 4.2). P1 owns this list; Q1-T11 `planBestRoute` takes `readonly RoutePreset[]` (or `RouteLayoutOptions[]`) and does the scoring only. The signature rounds every point to 10 mm and sorts the segments, so ids and order do not change it.
- **Must not touch:** the planner.
- **Verify:** core tests: `ROUTE_PRESETS[0].options` deep-equals `DEFAULT_LAYOUT_OPTIONS`; ids are unique; the signature of a plan does not change when the ids change; two plans with a 5 mm shift have the same signature and a 50 mm shift gives another. Core tests, typecheck, build.

### Phase B. Gates (no UI before both pass)

#### P1-T07. Gate G1: compare the option outputs on the real floors
- **Size:** S (about 100 lines of test, no product code). **Depends on:** P1-T06, P1-T09 (for 10A), and **either** Q1-T07 to Q1-T09 (bridge, trunk bends, link search) **or** the same trunk options added as `RouteLayoutOptions` fields in this part (`bridgeParts`, `trunkBends`). **G1 is expected to fail without them:** the trunk uses length only and the off-graph links use no price, so the penalty fields change the room spines only. Do not run G1 as a pass check before one of the two is in.
- **Machine check:** the test has a constant `GATE_G1 = true` flag. With the flag on, it asserts the pass rule below. With the flag off, it prints only. The first run after P1-T06 sets the flag off and records the result. The director sets the flag on after Q1-T07 to T09 and records "G1 pass" or "G1 fail" with the date in section 12 of this file.
- **Files:** `packages/core/src/route-presets-real.test.ts` (new; uses `loadFirstFloorRooms`, the setup of `route-run.test.ts`); `.claude/roadmap/browser/p1-t07-check.mjs` for the 10A drawing (local only).
- **What it does:** for the target counts 6, 15 and 25 (as in `r6-time-check.mjs`) it runs `planRoute` with each preset and prints a table: preset, status, signature group, segments, fittings, length (m), bends 90, bends 45, free legs, wall crossings, existing crossings, ports left. The 10A part runs through the scene API (`scene.planRoute` with `layout`) after P1-T09; until then the 10A part is skipped.
- **Gate G1 passes when:** for at least two of the three target counts, at least three of the four presets have different signatures, and the numbers differ in the direction the preset name says (Shortest run has the lowest length; Fewest bends has the fewest bends; Fewer crossings has the fewest existing crossings or ties). With the flag on, the test asserts these facts. In every mode it asserts determinism and "no preset is refused when Balanced is ok".
- **If G1 fails with the flag on:** stop. Report the table to the director. Options for the user: A. ship fewer presets (the ones that differ); B. add or tune Q1 options and re-run G1; C. cancel the UI of P1. The recommendation is B, then A.
- **Verify:** core tests; the printed table goes into the report and into section 10 of this file. Browser check for 10A only if the file exists. No screenshot.

#### P1-T08. Gate G2: timing
- **Size:** S (about 60 lines). **Depends on:** P1-T06; the browser part after P1-T09.
- **Files:** `packages/core/src/route-presets-time.test.ts` (new; prints times, asserts only `< 5000` ms to catch a hang), `.claude/roadmap/browser/p1-t08-check.mjs` (copy of `r6-time-check.mjs` that loops over the presets with `layout`).
- **Gate G2 passes when (browser numbers, first floor, 25 targets):** the default candidate takes at most 300 ms; each other candidate takes at most 300 ms; the four together take at most 1000 ms. The UI computes the default first and the others one after another in separate macrotasks (P1-T11), so the screen does not freeze for the sum.
- **If G2 fails:** Q-P1-07 (staged compute with fewer presets, or a worker). Do not build a worker without the answer.
- **Verify:** the times of three runs per preset are printed in the report. No screenshot.

### Phase C. Scene

#### P1-T09. Scene: `layout` in the request
- **Size:** S (about 30 lines). **Depends on:** P1-T06; gates G1 and G2 for the UI work that follows, but this task may run before the gates (it is needed by their browser parts).
- **Files:** `packages/render/src/scene.ts` (`RouteRequest.layout?: RoutePresetId | RouteLayoutOptions`, `planRoute` passes `ROUTE_PRESETS.find(...)?.options` for an id and the object as given otherwise), `packages/render/src/index.ts`. Q1-T15 depends on this task: it sets Q1 options through `layout`.
- **Shapes:** section 4.3. An unknown id falls back to `balanced`.
- **Must not touch:** `applyRoute`, `setRoutePreview`, `serializeDocument`, the id counters (`planRoute` does not advance them; keep that).
- **Verify:** `pnpm typecheck`, `pnpm build`. Browser check `p1-t09-check.mjs` through the scene API: `planRoute` without `layout` and with `layout: 'balanced'` give equal plans; two presets give plans that follow P1-T07; `exportProject()`, `canUndo`, `isDirty` and `nextSegmentSeq` are the same before and after five calls; no page error. No screenshot.

#### P1-T10. Scene: hover preview and ghosts (conditional on Q-P1-04)
- **Size:** S (about 70 lines). **Depends on:** P1-T09. **Skip if Q-P1-04 answers A.**
- **Files:** `routePreviewLayer.ts` (`RoutePreviewView.ghosts?: Vec2[][][]`, drawn thin and light grey, below the selected plan), `scene.ts` (`setRoutePreview(plan, ghosts?)`), tests if the layer has any.
- **Shapes:** `setRoutePreview(plan: PlannedRoute | null, ghosts?: readonly PlannedRoute[]): void`. A call with `null` clears both. The preview is never dirty and never enters the history (as today, `scene.ts:2990`).
- **Must not touch:** the removed-run drawing; `applyRoute`.
- **Verify:** `pnpm typecheck`, `pnpm build`. Browser check `p1-t10-check.mjs`: with ghosts, the overlay holds pixels of the ghost colour near a point that only a ghost passes; with `null` they are gone; `exportProject()` unchanged. Screenshot `P1-T10-ghosts`.

### Phase D. UI (waits for U1 on shared files; see section 7)

#### P1-T11. Preset state: staged compute, cache, dedupe
- **Size:** M (about 140 lines with tests). **Depends on:** gates G1 and G2, P1-T09, **U1-T10**.
- **Files:** `packages/ui/src/components/routePresets.ts` (new, pure), `packages/ui/src/routePresets.test.ts` (new), `RouteBuildSection.tsx`.
- **Shapes:**
  ```ts
  export interface Candidate { id: RoutePresetId; view: RoutePlanView; signature: string; duplicateOf: RoutePresetId | null }
  export function candidateKey(requestKey: string, presetId: RoutePresetId, tick: number): string;
  export function markDuplicates(candidates: readonly Candidate[]): Candidate[];   // first in chip order keeps the plan
  ```
  The section computes `balanced` first (after the 300 ms debounce, as today), shows it, and then computes each other preset in its own `setTimeout(0)`. A new request key or tick cancels the pending presets and clears the cache. A refused candidate stays in the list with `view.status === 'refused'`.
- **Must not touch:** the debounce value, the event list (`RouteBuildSection.tsx:34`), `applyRoute`.
- **Verify:** UI tests (pure part): `markDuplicates` marks the later of two equal signatures; a refused view is never a duplicate; the key changes with the tick; staged order is `balanced` first. `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps in P1-T14.

#### P1-T12. Chip row and the numbers
- **Size:** M (about 150 lines). **Depends on:** P1-T11. **Shared files with U1:** `RouteBuildSection.tsx`, `routeBuildPlan.ts`, `theme.css`. **Depends on:** P1-T11, **U1-T10** (start after it is merged). The chip `title` is `RoutePreset.tooltip` plus the numbers.
- **Files:** `packages/ui/src/components/RoutePresetChips.tsx` (new), `RouteBuildSection.tsx`, `routeBuildPlan.ts` (texts), `theme.css`.
- **Shapes:** `RoutePresetChips({ candidates, selected, onSelect, pendingIds })`. Each chip is a `button` with `data-testid="route-preset-<id>"`, `aria-pressed`, a short name, the length in metres, the bend count, a warning mark, and a `title` with the full numbers (length, segments, fittings, 90 and 45 bends, wall crossings, existing crossings, free legs, ports left, warnings). A duplicate is hidden and a small text "N layouts give the same result" shows with a `title` that names them (Q-P1-03 A; the text changes with the answer). A refused candidate is a disabled chip with a `title` that gives the reason. A pending candidate shows a small spinner text "…". The selected candidate drives `setRoutePreview`, the summary and the lines (the existing code, fed with the selected view).
- **Must not touch:** the warning lines, the removal line, the size check box, the Place logic.
- **Verify:** UI tests: the chip texts and `title` builders (every key has a text; numbers are formatted in metres with one decimal; no Dutch; a text of 60 characters or less on the chip). `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps in P1-T14. Screenshots in P1-T14.

#### P1-T13. Place the selected candidate; remember the last preset
- **Size:** S (about 60 lines). **Depends on:** P1-T12, Q-P1-05, **U1-T10**.
- **Files:** `RouteBuildSection.tsx`, `packages/ui/src/routePresetStorage.ts` (new; copy the shape of `routeAreaStorage.ts:9-30`), `packages/ui/src/App.tsx` only if the choice must live above the dialog (otherwise the section reads the storage itself), tests.
- **Shapes:** `loadLastPreset(storage): RoutePresetId` (default `'balanced'`; an unknown value gives `'balanced'`), `saveLastPreset(storage, id)`. Place calls `scene.applyRoute(selected.view.plan, { size })` as today; if it returns `null` it plans the selected preset again (as today, `RouteBuildSection.tsx:80-81`). If Q-P1-05 answers A there is no storage file.
- **Must not touch:** `applyRoute`; any stored field of the document.
- **Verify:** UI tests: load and save with a fake storage; a bad value gives `'balanced'`. `pnpm --filter @mepapp/ui test`, `pnpm build`. Browser steps in P1-T14.

### Phase E. Checks

#### P1-T14. Browser check of the preset flow (real DOM)
- **Size:** M (about 150 lines of check). **Depends on:** P1-T13 (and P1-T10 if built).
- **Files:** `.claude/roadmap/browser/p1-check.mjs` (new; uses `r6-lib.mjs` and `r6-ui-lib.mjs`).
- **What it checks** (1600 by 1000, English, `01_arch_first_floor.pdf`, project from `buildRoutingProject` with 6 targets, then with 25):
  1. Open the dialog through the helper. Pick start, port and type with the real selects. `route-build-pending` shows, then `route-preset-balanced` is selected and the summary shows. The other chips fill in one after another.
  2. Tap each visible chip with a real click. The summary numbers change as the chip says (the length in the chip equals the length in the summary). The preview changes (pixels of the type colour near a point that only that candidate passes). A hidden duplicate has no chip.
  3. Select "Fewest bends" and press `route-place`. The result text shows. In the export: every new segment has `routedBy: 'route'`; the count of 90 degree bends of the written run equals `stats.bends90` of the chip (independent count from the export geometry); an independent walk from the start port reaches every connected target port; every leg is axis or 45 degrees.
  4. Undo through `.mep-rail-btn[title="Undo"]` (close the dialog first, as in R6-T22): the export equals the baseline.
  5. Change an input (clear one room): the chips recompute; the selected chip stays selected if its plan is still valid.
  6. Reload the dialog: the last preset is selected if Q-P1-05 is B; else `balanced`.
  7. A project with an empty `networkTypes`: Place of a non-default preset adopts the type (the export holds it; the line has the library colour, not the default).
  8. A foreign segment on the start port: all chips are disabled or the section shows the start error; `route-place` is disabled.
  9. A 400 px wide window: `scrollWidth <= clientWidth` of `.mep-modal--route`; the chips wrap.
  10. The 10A drawing (local; skipped with a message when absent): the chips fill; the times print.
  11. No page error. The export before and after preview-only steps is the same.
- **Screenshots (upload each to the dashboard right after the task):** `P1-T14-chips-balanced`, `P1-T14-chips-fewest-bends`, `P1-T14-chips-pending`, `P1-T14-chips-duplicate-note`, `P1-T14-chips-refused`, `P1-T14-placed`, `P1-T14-narrow`, `P1-T14-dark`, `P1-T14-10A`.
- **Verify:** the check exits 0; screenshots are read by the UI reviewer.

#### P1-T15. The part check
- **Size:** S. **Depends on:** all tasks above.
- **Files:** none (no product code). `p1-check.mjs` is the part check.
- **Verify (one command for each call):** `pnpm --filter @mepapp/core test`; `pnpm --filter @mepapp/ui test`; `pnpm typecheck`; `pnpm build` (fresh; report the cached count); `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/p1-check.mjs`; no regression: `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs`, `r5-check.mjs`, `r6-check.mjs`, one command each. Also check that `git diff --stat origin-base -- packages/core/src/project.ts packages/core/src/schema.ts` is empty (no schema change).
- **After the check:** the director marks P1 done in this file with the commit of each task.

## 7. Dependencies on U1 and Q1

Basis: `ui-cleanup-rail-i18n.md` and `route-quality-research.md`, read on 2026-10-25 (revision 1). Both are plans; none of their tasks is built.

**U1 tasks that touch P1 files**

| U1 task | What it does | Effect on P1 |
|---|---|---|
| U1-T01 | Removes the Dutch path (`routePlan.ts`, `route-input.ts`, call sites in `RouteDialog.tsx`, `RouteAreaSection.tsx`, `App.tsx`) | P1 adds English text only and reads no `language`. No conflict if P1 UI starts later. |
| U1-T07 | Changes `.claude/roadmap/browser/lib.mjs` (adds `openRoute()`) and 15 browser files; the dialog opens from the rail | P1 checks use the dialog opener after U1-T07. `openDialog` in `r6-ui-lib.mjs:11` is one of the files to change (not verified which of the 15 it is). |
| U1-T08 | Severity marks in `RouteBuildSection.tsx` and `routeBuildPlan.ts` | Shared files. |
| U1-T10 | Cuts text in `RouteBuildSection.tsx`, `RouteAreaSection.tsx`, `routeBuildPlan.ts`; "Place route" keeps its text (Q-U1-06 A); the size check box becomes `IconToggle` | **P1-T11, P1-T12 and P1-T13 all wait for U1-T10.** They edit the same two files. |

U1 keeps text on the main buttons (Q-U1-06 A). The chips of P1 show a short name and numbers, and use the `IconButton` and `InfoTip` parts of U1-T04 only where an icon helps (the warning mark).

**Q1 tasks that touch P1 files**

| Q1 task | What it does | Effect on P1 |
|---|---|---|
| Q1-T06 | The experiment switch | Replaced by `RouteLayoutOptions` and `planRoute(input, options?)` of P1-T01 (director decision 1). P1-T01 must come before Q1-T06, or Q1-T06 adopts the type. |
| Q1-T07, T08, T09 | Bridge between graph parts, bends in the trunk search, a search for off-graph links | These give the variety that gate G1 needs (P1-T07). They add `route-link.ts`; T08 adds `steinerTreeWithTurns`. |
| Q1-T08 | Moves the heap from `route-hanan.ts` to `route-heap.ts` | P1-T02 edits `route-hanan.ts` too. Order them (P1-T02 note). |
| Q1-T10, T12 | `route-exact.ts` (exact Steiner tree), `route-ripup.ts` | New files. `exactSpine` and `ripUp` are `RouteLayoutOptions` fields. |
| Q1-T11 | `planBestRoute` with scoring | Takes the preset list type of P1 (P1-T06). It owns scoring only. |
| Q1-T15 | Browser check of the Q1 variants | Depends on P1-T09 (`layout` in the scene request). |
| Q1-T16 | Q1 keeps the default output byte-equal until a later Q2 decision | "Balanced" stays today's layout until Q2. The identity tests of P1-T01 to T05 stay valid until then; Q2 re-baselines them. |

**Independent of U1 and Q1 (can run now):** P1-T01, P1-T04, P1-T05, P1-T06 (core only, no change of output). P1-T02 is independent but is ordered against Q1-T08 (same file).
**Depends on Q1 (soft):** P1-T07 (gate G1) needs Q1-T07 to T09, or trunk options added in this part. No other P1 task waits for Q1. If Q1 ships `scoreRoute`, the chips may show its score; if not, they show `RouteStats` (`route-build.ts:48`).
**Depends on U1 (hard, UI only):** P1-T11, P1-T12 and P1-T13 wait for U1-T10. P1-T14 and P1-T15 wait for U1-T07 (the dialog opener).
**Recommended order:** P1-T01 first (it is the seam that Q1-T06 uses). Then P1-T04 to T06, P1-T09, and P1-T02 (with the Q1-T08 order agreed). Run Q1-T07 to T09. Run G1 (P1-T07) and G2 (P1-T08). Then P1-T03 and the UI after U1-T10.

## 8. What P1 does not do

- No friction or pressure-drop estimate on the chips. The code has no fitting loss coefficients; this needs data and a decision. Later part.
- No "Home run" topology (one branch from the start to each room). Later part, size L.
- No new trunk algorithm (Q1). No clash check against beams or ceilings (R6 section 8).
- No stored preset id on segments or documents (Q-P1-05 option C would add one; not planned).
- No preset for the sizing step. Sizing stays the check box of R6.
- No Dutch text; the UI text is English only.
- No worker, unless G2 fails and the user answers Q-P1-07 B.
- Not the items of `room-type-calculations-small-fixes.md`. Not the R7 work (circuit files `circuit-plan.ts`, `RoomScopeList.tsx` and the edits of `RouteDialog.tsx` in the worktree `agent-framework`). P1 starts from the files of this branch; when R7 merges, `RouteDialog.tsx` and the section may conflict; rebase and run `pnpm build`.

## 9. Risks

- **R-1 The presets give the same plan.** Penalties reach only the room spines (correction 2). Offices with one or two ports give the same spine for any weights. Gate G1 measures and is expected to fail on the penalty fields alone; it needs the Q1 trunk and link options (P1-T07). Fallbacks in Q-P1-03 and in P1-T07.
- **R-2 The names promise what the plan does not give.** "Fewest bends" with a penalty may not give fewer bends in every case. The chip shows the real number; the test in G1 checks the direction. If a name fails on the real floors, rename it or remove the preset.
- **R-3 Time.** Four plans cost about four times 150 ms (not measured here). Staged compute keeps the screen alive. Gate G2.
- **R-4 Stale candidates.** A drawing change during staged compute must cancel the pending presets. P1-T11 has a test for this and P1-T14 step 5 checks it.
- **R-5 A candidate that was ok becomes refused after a change.** The selected chip must fall back to `balanced`, and the Place button must follow the selected candidate. Test in P1-T11.
- **R-6 Merge conflicts with U1, Q1 and R7** (section 7 and section 8). After each merge: `pnpm build`.
- **R-7 The default drifts.** If Q1 changes the default, "Balanced" changes too. This is intended. The identity tests are re-baselined in that Q1 task.
- **R-8 Not verified.** The sources of section 3; the claim that `tap.perpendicular` is null often enough for the off-graph axis option to matter (P1-T05 measures); the share of the 150 ms that the room spine uses; the 10A numbers (local file only); whether `r6-ui-lib.mjs` is one of the 15 files that U1-T07 changes.

## 10. Questions for the user (options A, B, C; recommendation marked)

**Q-P1-01. Is "Fewest bends" = 90 degree legs only a hard rule?** The R6 layout rule allows 90 and 45 degree legs.
- A. Yes. "Fewest bends" uses right angles only (`orthogonalOnly`). Builds the M part of P1-T03.
- B. No. "Fewest bends" only raises the bend cost. 45 degree jumps stay allowed. A 45 pair counts as two bends, like a 90 Z.
- C. Two presets: "Fewest bends" (B) and "Right angles only" (A).
- **Recommendation: B. Cost only, no hard rule.** Drains and cable trays need 45 degree parts (domain check), and the R6 layout rule allows them. B is also the smaller change. G1 decides if C is worth it. Data model: no.

**Q-P1-02. May the user place a candidate that has warnings?**
- A. Yes, as today. The chip shows a warning mark and the lines list the warnings.
- B. No. Place is disabled while any warning exists.
- C. Yes, but the chips are sorted so that candidates without warnings come first.
- **Recommendation: A.** Wall crossings and off-graph rooms are common on real floors (R6 risk R-4); a rule B would block most plans. Keep the order fixed (the chip order does not jump between runs).

**Q-P1-03. What does the dialog do with two candidates that look the same?**
- A. Hide the later one and show one text "N layouts give the same result".
- B. Show it with a label "same as Balanced".
- C. Show all chips, no label.
- **Recommendation: A.** Less text and less choice. A tooltip names the hidden presets.

**Q-P1-04. Does the plan show the other candidates?**
- A. No. Only the selected candidate shows (Revit steps through one at a time).
- B. Hover or focus on a chip shows that candidate for a moment; leaving returns to the selected one.
- C. Faint ghosts of the other candidates always show.
- **Recommendation: A for the first release.** It needs no new drawing code and P1-T10 is skipped. B is the next step if the user asks.

**Q-P1-05. Does the dialog remember the last preset?** [data model for C]
- A. No. It starts with "Balanced" each time.
- B. Yes, for the browser (one setting, like the route room types in `routeAreaStorage.ts`). Not stored in the file.
- C. Yes, for each document and network type, stored in the file. This is a new stored field and a new schema step. Not planned.
- **Recommendation: B.** It is cheap and keeps the file unchanged.

**Q-P1-06. Which disciplines get presets first?**
- A. All disciplines get the same four presets.
- B. A preset list for each discipline. Ducts: Balanced, Fewest bends. Pipes and cable trays: those two and Shortest run.
- C. Ventilation ducts only; other types show "Balanced" only.
- **Recommendation: B.** A duct pays most for a bend and a fitting, so "Shortest run" would mislead. A pipe or a tray gains from a short run. `presetsForDiscipline` (section 4.2) holds the lists. A home run layout is later, for cables and manifold pipes only. A tray segregation distance is also later.

**Q-P1-07. If gate G2 fails (a plan takes more than 300 ms), what then?**
- A. Fewer presets (the two that differ most) and staged compute.
- B. A Web Worker for the planner. Larger work; the planner needs the room and area data in the worker.
- C. Keep four presets and accept a short wait.
- **Recommendation: A.** Decide only if G2 fails. Nothing waits for this answer now.

Defaults that I assume (change them if wrong): four start presets with the names Balanced, Shortest run, Fewest bends, Fewer crossings (a discipline may show fewer of them, Q-P1-06 B); the chip shows name, length in metres, bend count and a warning mark; the full numbers are in a tooltip; the preset list order is fixed; the first chip is selected on open; Place uses the existing "Size the network after routing" check box; no preset changes the sizing; the 300 ms debounce stays.

## 11. Revision log

| Date | Change |
|---|---|
| 2026-10-25 | First version by the road map planner. 15 tasks (P1-T01 to P1-T15), 7 questions (Q-P1-01 to Q-P1-07), 2 gates. Sibling plans U1 and Q1 did not exist yet; section 7 uses the feedback prompt only. |
| 2026-10-25 | **Revision 1** (audit round 1, director decisions). Seams fixed: `RouteLayoutOptions` and `planRoute(input, options?)` are the only core seam (Q1 switches become fields); scene `layout?: RoutePresetId \| RouteLayoutOptions` (Q1-T15 depends on it); P1 owns `ROUTE_PRESETS`, Q1-T11 owns scoring. G1 is a machine check with a flag `GATE_G1`, expected to fail without Q1-T07 to T09. P1-T03 moves after the gate. Section 7 rewritten with the real U1 and Q1 task ids (P1-T11 to T13 wait for U1-T10; P1-T02 is ordered against Q1-T08). "Avoid clashes" renamed "Fewer crossings" with tooltips. Q-P1-01 recommends B (cost only); Q-P1-06 recommends B (a list for each discipline). P1-T05 states that the off-graph axis column leaves the table if `tap.perpendicular` is null. |

## 12. Gate record (filled by the director)

| Gate | Date | Result | Table or numbers |
|---|---|---|---|
| G1 (P1-T07) | not run | not run | |
| G2 (P1-T08) | not run | not run | |
