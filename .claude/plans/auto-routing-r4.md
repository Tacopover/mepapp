# R4 plan: where a duct or pipe may go (the route area, its graph and its possible wall places)

**Status: DONE 2026-10-17 (on branch `worktree-agent-framework`, not merged; the user tests on Windows first).** R4 stores nothing in the project file; the schema stays at 18. The room type list is in `localStorage` (`mepapp.routeRoomTypes.v1`, provisional Q-R4-01 A). No new Dutch text (user note, section 11).

| Task | Commit | Verification |
|---|---|---|
| T01 fixture and loader of real rooms | `7b8e79f` | core 1022 tests (with T02, T03) |
| T02 types, defaults, room selection | `071dd67` | 14 tests |
| T03 raster and thinning | `d6bfd92` | 11 tests |
| T04 pixel graph | `923b16f` | core 1036 tests |
| T05a prune and half-width | `349c652` | core 1049 tests |
| T05b simplify, `centerLineOf`, real rooms | `47f5487` | core 1056 tests; 5 corridors in about 220 ms; rule of 25 % of the half-width relaxed (26 of 29 vertices), all vertices inside and at least 40 mm from walls |
| T06 wall stretch, boundary gap | `b04c891` | core tests; a direction test was added to the wall rule |
| T07 crossings along a path | `4b68b01` | core tests; gaps measure up to one 100 mm step too large |
| T08 graph helpers | `e76d60d` | core 1108 tests (T06 to T08) |
| T09 `computeRouteArea` part 1 | `49a61a7` | core 1117 tests |
| T10a links and entries | `7f4cf0a` | core 1127 tests; tap tolerance 100 mm (pixel grid) |
| T10b unreached, parts, shaft cases | `9472cd3` | core 1139 tests |
| T11 warnings | `ecccc29` | core 1158 tests |
| T12 chain test on real rooms | `12338a3` | core 1168 tests; 18 of 33 rooms have an entry, 16 of 18 consistent, 146 ms; float fix in `wallStretch` |
| T13 overlay drawing | `3e1b39c` | build |
| T14a scene: list, cache, flag, layer, debounce | `5fbbbe4` | typecheck and build |
| T14b `r4-lib.mjs` and scene check | `4e16384` | `t14-check` 31 of 31 (rerun by the director's agent) |
| T15 list storage and wiring | `c204f6e` | `t15-check` 6, 5 and 5 passed |
| T17 texts (English only) and line builders | `3f979c8` | UI 226 tests |
| T16 menu switch | `be5e5f2` | `t16-check` 17 of 17 and 3 of 3 (real clicks) |
| T18 dialog section | `59bead6` | `t18-check` 44 of 44 |
| T19 room type list control | `99041fd` | `t19-check` 30 of 30 |
| T20a singular text of the shaft warning | `c51c6d9` | UI 227 tests |
| T20 part check | `f06c8ec` | `r4-check` exit 0 (50, 6, 6, 5, 6 passed; 0 failed); `r2-check` 66 of 66 and 10 of 10; `r3-check` 44 of 44 and 7 of 7; core 1168 tests; UI 227 tests; forced typecheck 17 of 17 and build 9 of 9, 0 cached (the typecheck and build ran before the script fixes of T20, which changed no product code) |

Measured at the end of R4: first floor: 6 rooms (5 corridor, 1 shaft made for the check), 48 nodes, 44 edges, 17 primary entries, 4 parts, first compute 98 to 424 ms. Plan 10A at scale 1:100: 34 rooms found, 7 route-area rooms (2 "gang", 3 "schacht", 2 "Plenum"), first compute about 165 ms. A room edit takes about 870 ms to recompute on the first floor (limit 1 s, P-R4-13).

Open at the end of R4:
- **Q-R4-01 (open, user):** the room type list stays in `localStorage` (A). Option B would put it in the project file (schema step).
- **UI findings, medium, open:** the purple center line crosses the room label text (room labels are below the route layer); the amber entry crosses have low contrast on the orange Lift room.
- The "Calculating" note shows about 300 ms late (the plan asks for 100 ms).
- The `t14-check` step 9 can flake on a loaded machine (the 600 ms wait for the 300 ms debounce). Increase the wait if it recurs.
- The real-room test of T05b has a 1000 ms wall-clock guard.
- Two entries of the first floor fail the straight-line check ("Overleg" rooms with 0 and 2 crossings). Not investigated.
- The shaft-crossing warning counts primary shaft entries and shaft links only (plan text: any entry). The first floor has no shaft, so no real-room test covers this.
- The layout rule of routed segments (orthogonal and 45 degrees, user note 2026-10-17) is in `roadmap-overview.md` for R6.
- Dutch: no new Dutch text; the question of the Dutch term for the route area is removed from R4.

Status: written 2026-10-17 by the road map planner, on the branch `worktree-agent-framework` after R3 (end of R3 = commit `71156cd`). Revised 2026-10-17, round 1 of the audit (items A1 to A14, M1 to M7; the "Round 1" section at the end lists each change).
Origin: `roadmap-overview.md` (R4 text, sections 1a, 3, 5, 6; gaps G3 and G10), `auto-routing-r2.md`, `auto-routing-r3.md`, `auto-routing.md` (§8, R4), `.claude/roadmap/rules.md`.
Answers of the user that bind this plan (final): **D-R4-01** (the route area is automatic only, from room types; the default room types are Corridor and Shaft; the user can add other room types to the list; no hand-drawn area; no stored "no crossing" line). **D-R4-02 A** (a 2D draft is acceptable; the app shows a note). The decision is the 2D draft. The words of the note grew in round 1 (M5): "Draft in 2D. Check height, clashes, clearances and slope yourself." **D-R2-03 A** (single PDF files; a multi-page PDF is refused).
Code claims carry `path:line`. Paths start at the repository root. Line numbers are from commit `71156cd` and can move.
Read `.claude/roadmap/rules.md` first.

Terms (the terms of `roadmap-overview.md`, `auto-routing-r2.md` and `auto-routing-r3.md` apply). The plan uses the word "network" only. New terms:
- **Route area**: the rooms of the chosen room types on the active page. A route-area room is a **path room** (any chosen type except Shaft) or a **shaft room** (room type `shaft`).
- **Center line**: a line inside a path room, about halfway between its walls. It is a graph of nodes and edges, not one line, because a room can be an L, a T or a ring.
- **Wall stretch**: the part of the boundary of room A that lies within a small distance of the boundary of room B. The distance between the two boundaries is the wall thickness.
- **Entry**: a place in the wall between a route-area room and another room, where a branch can go into that other room. It has a point, a run (length of the wall stretch) and a gap (wall thickness).
- **Link**: the same thing between two route-area rooms. It joins their center lines.
- **Wall crossing**: a place where a path goes from one room to another room through a wall. The wall is a gap of at most `maxWallMm` between two rooms, or no gap. R4 builds no path, so R4 finds no wall crossing. Only R6 counts real crossings, with `crossingsAlongPath`. R4 shows entries and links, which are *possible* places for a branch. The texts never call an entry a "door".
- **Route graph**: the nodes and edges of all center lines, with the entries and links. R4 calculates it. R6 reads it.
- **Severity**: `error`, `warning` or `info`. The dialog shows the labels Error, Warning and Note (R3 rule).

## 0. Questions, provisional choices, and what blocks

Blocking questions: none. R4 stores nothing in the project file.

### Questions for the user (not blocking)

- **Q-R4-01 [data model].** Should the list of room types of the route area travel with the project file? Options: **A** no, keep it as a setting of this browser in `localStorage`; **B** yes, store it in the project file (a new field and a schema step 19). **Recommendation: A.** Reason: D-R4-01 calls it a setting. The result of R4 is calculated and never stored. The routed segments of R6 are saved in the file. The room types also live in `localStorage` (`packages/ui/src/roomTypeStorage.ts:6`). A mechanism for a list of ids in `localStorage` already exists (`packages/ui/src/placementRuleStorage.ts:113`-`:127`, used in `packages/ui/src/App.tsx:435`-`:436`). Cost of A: the same drawing on another machine shows the default route area (Corridor and Shaft) until the user sets the list there. If the user answers B, the director adds a schema step to the task "Storage" (T15) and stops that task until the answer. R4 works with A until then.

Round 1 adds no new question. No item of the audit touches the data model or a domain rule of `rules.md` section 3 (section 5 says why). The items of the round are provisional choices P-R4-13 to P-R4-18.

### Provisional choices (easy to reverse; the director takes them without a stop)

| Id | Choice | Reason |
|---|---|---|
| P-R4-01 | The list of room type ids lives in `localStorage`, key `mepapp.routeRoomTypes.v1`, default `["corridor","shaft"]`. A stored empty list stays empty. An id that no room has changes nothing. | The mechanism of `uncheckedRuleIds` is the model (reuse before new). See Q-R4-01. |
| P-R4-02 | The overlay of the route area shows when the dialog is open and the user keeps the check box "Show the route area on the plan" on (default on), and also by a menu switch "Show route area" / "Hide route area". Both use one flag in the scene. When the dialog closes, the flag goes back to the value it had before the dialog opened. The flag is not stored. | The dialog has a transparent backdrop but blocks pan and zoom, so the user needs a switch that works with no dialog. One flag avoids two copies of one state (rule 3). |
| P-R4-03 | Entries, links and `crossingsAlongPath` come from the room polygons only. R4 does not use the wall lines of the filter (`wallDebugData`). R6 must not look for wall lines either. R6 counts real crossings with `crossingsAlongPath`. A wall is a gap of at most `maxWallMm = 600` between two rooms (or no gap), and a wall stretch must be at least `minWallRunMm = 500` long. | The wall lines give no door, and they need an async filter run on the main thread (`scene.ts:3475`-`:3512`). The probe of section 3.4 shows gaps of 0 to 425 mm on the first-floor drawing. |
| P-R4-04 | The center line comes from a raster (100 mm pixels), Zhang-Suen thinning, a prune of short spurs and a Douglas-Peucker simplification. The skeleton stays (the overview promises a center line). If it fails for a room (no node), the room gets one node at its label point, so a failed skeleton never blocks R6. | The room polygons are often not rectangles (8 to 24 vertices in the probe). Section 3.3 gives the reason. |
| P-R4-05 | A shaft room is a room with the room type id `shaft` (`packages/core/src/rooms/room-type.ts:176`). All other chosen types give path rooms. | The warning "into or out of a Shaft room" needs a fixed id. |
| P-R4-06 | The dialog shows the route area in a `<details open>` section at the bottom of `route-body`, and it also shows when the drawing has no equipment stamp. | The R2 inputs stay at the top. The route area does not depend on a start stamp. |
| P-R4-07 | The real-data fixture is a JSON file of the rooms of `01_arch_first_floor.pdf` only (a tracked PDF). The rooms of `plattegrond begane grond 10A.pdf` are used live in the browser check and never copied into the repository. | The fixture policy keeps the real PDFs out of git (the 10A PDF is local only). |
| P-R4-08 | Overlay colors: route-area fill teal `0x00897b` (alpha 0.18); center line purple `0x6a1b9a`; connector dashed purple; possible place for a branch amber `0xffab00`; shaft place red `0xd50000`. | The colors do not clash with the rooms (green or orange), the route markers (magenta `0xe6007e`, `scene.ts:467`) or the selection (cyan). The UI reviewer may change them. |
| P-R4-09 | Severity: `no-calibration` error. `no-rooms`, `no-types`, `no-route-rooms`, `open-room`, `parts`, `wall-crossings`, `shaft-crossing` warning. `unreached`, `stair-name` and `draft-2d` info. | A warning asks the designer to look. An error means the app cannot calculate. |
| P-R4-10 | The graph and the warnings are calculated again when a room, the page, the calibration or the list changes, but only when the overlay is visible or the dialog is open (P-R4-13). A cache keeps the last result. | `computeNetworks` follows the same idea (`packages/core/src/network.ts:1`). |
| P-R4-11 | The Dutch texts follow the rules of R2 and R3 (formal "u", "ruimte", "aansluiting", "netwerk"). A Dutch speaker must check them. The Dutch term for "route area" is "Routegebied" and stays provisional (P-R4-17). | Same open item as R2 and R3. |
| P-R4-12 | The part check runs the two earlier part checks as separate commands (`r2-check.mjs`, `r3-check.mjs`). It does not start them from inside `r4-check.mjs`. | `with-server.mjs` starts one server for one check (`.claude/roadmap/browser/with-server.mjs`). |
| P-R4-13 | Timing. `computeRouteArea` runs on the main thread. The scene computes it only when the layer is visible (the dialog sets the flag, so an open dialog counts as visible). After `roomsChanged` the scene waits 300 ms (a debounce: a new change restarts the wait) and shows the note "Calculating the route area…" while it waits. The limit is about 1 s for one floor. Above 1 s in T12, T14b or T20, the lead reports it and a new task moves the call into a worker (the pattern of `packages/core/src/rooms/worker.ts`, as R-7 says). Until then the main thread blocks for that time. | A cache miss follows every room edit. The user edits rooms while the overlay shows, so a 5 s block is too long. The wait lets the browser paint the note before the block. |
| P-R4-14 | The skeleton tests a junction with the crossing number (CN = the number of 0-to-1 steps around the pixel), not with the count of set neighbors. CN 1 is an end, CN 2 is a chain pixel, CN 3 or more is a junction. | Zhang-Suen leaves staircase pixels on a diagonal. They have 3 set neighbors but CN 2. The neighbor count gives false junctions there. |
| P-R4-15 | Node and edge ids follow the formats of section 4.2 (also for tap nodes, connectors and split edges). | The stable-ids test needs one rule for each id. |
| P-R4-16 | Warning texts. A branch place is a "possible place for a branch", never a door. The wall-crossings line says "{count} rooms can be reached through a wall of the route area. The places are marked." Its hint is the fire hint (M2). A room named like a stair (the name holds "trap") in the route area gets a Note line (`stair-name`). One hint line near the type list: "Entrance and hall can carry a main." (the library has no type named Hall or Lobby; the type is "Entrance and hall", `room-type.ts:165`). The legend adds "The center line is a guide." | Domain check M1 to M5. The texts are easy to reverse. |
| P-R4-17 | Dutch term: "Routegebied" stays. "Tracé" is the common MEP word. A Dutch speaker must decide. The type label of Corridor is "Gang" in the library (`room-type.ts:164`). The Bouwbesluit term is "verkeersruimte". The label "Gang / verkeersruimte" is a change of the room type library (product data), so R4 does not make it. It is a note for the Dutch speaker. | M6. A text choice is easy to reverse. |
| P-R4-18 | `RouteAreaView` is defined in `packages/render/src/routeAreaLayer.ts`. `drawRouteArea` also gets the room list for the fill. | A1 and A2. Core keeps no render type. |

## 1. Goal

The app shows the route area of the floor: the rooms of the chosen room types, the center line of each path room, and the possible places where a branch can pass a wall to reach another room. A warning list says what the designer must check: how many rooms can be reached through a wall of the route area, which of these places belong to a shaft room, which route-area room may be a stairwell, which route-area rooms may have a wrong outline, which rooms have no wall with the route area, and the note that the result is a 2D draft.

The route area comes only from the room types. The user edits the list of room types in the route dialog (a short control). The user can also change the room type of one room in the Rooms tab, as today.

Where R4 stops: R4 builds the graph and shows it. R4 finds no path, makes no segment, sizes nothing and stores nothing in the project file. R6 reads the graph (nodes, edges, entries, links) and the pure function `crossingsAlongPath`. R4 adds no `routedBy` mark and no library stamp.

## 2. What exists now

| Item | Where | Use in R4 |
|---|---|---|
| `Room`: `polygon`, `pageIndex`, `open`, `roomTypeId`, `name` | `packages/core/src/rooms/room.ts:15`-`:45` (`open` at `:26`, `roomTypeId` at `:37`) | Input. The route area is a filter on `roomTypeId`. |
| `polygonContainsPoint`, `polygonAreaPt2`, `roomLabelPoint`, `roomsAtPoint` | `room.ts:75`, `:64`, `:101`, `:138` | The point tests. `roomsAtPoint` gives the smallest room first. |
| Calibration: `pageUnitsPerRealUnit` is points per mm | `room.ts:68`-`:72`, `packages/core/src/calibration.ts:56` | `mmPerPt = 1 / pageUnitsPerRealUnit`. The scene reads it with `getCalibration()` (`packages/render/src/scene.ts:2203`). The calibration is saved in the project (`packages/core/src/project.ts:48`). |
| Room types `corridor`, `entrance` (Entree en hal), `shaft` | `packages/core/src/rooms/room-type.ts:164`, `:165`, `:176`; label function `roomTypeLabel` at `:374` | The defaults and the Dutch names. |
| `DEFAULT_ROOM_DETECTION_PARAMS.maxWallMm = 500` | `packages/core/src/rooms/types.ts:121` | The wall thickness that detection expects. R4 uses 600 (P-R4-03). |
| `distanceTransform(mask, w, h)` (exact, in pixels) | `packages/core/src/rooms/raster.ts:72` | Half-width of a corridor, for the prune of spurs. |
| No skeleton, no medial axis, no thinning in core or render | a search of `packages/core/src` and `packages/render/src` for skeleton, medial, thinning, centerline finds nothing | The center line is new code (rule 3 was applied). |
| `setRoomType(ids, choice)`, `getRoomTypes()`, `listRooms()`, `updateRoom()` | `scene.ts:3186`, `:3142`, `:3096`, `:3729` | The scene reads rooms. The browser check sets a room type with `setRoomType` in the setup. |
| Rooms layer and its redraw events | `scene.ts:3101` (`syncRoomLayer`), `:717` (events `roomsChanged`, `pageChanged`, `documentActivated`, `calibrationSet`) | The model for the redraw triggers. |
| Wall-line debug layer: a scene-level `Container`, added to `world` at start and again on a document switch | `scene.ts:669`-`:680`, `:860`, `:1108`, `:3452`-`:3512` | The model for the route area layer. The debug menu item is shown only when `isDebugToolsEnabled()` (`packages/ui/src/debugTools.ts:5`, `MenuButton.tsx:170`). R4 does not use the wall lines (P-R4-03). |
| Route markers: a list on the scene, drawn in `redrawOverlay`, never dirty, cleared on `pageChanged` and `documentActivated` | `scene.ts:2755`-`:2765`, `:5277`-`:5301`, `:721` | The model for "an overlay that is not an edit". |
| `RouteDialog` and its props (`sceneRef`, `roomTypes`, `language`, `stampName`, `onClose`) | `packages/ui/src/components/RouteDialog.tsx:8`-`:14`, `:36` | The dialog gets a new section. The body shows only the R2 inputs when a start stamp exists (`:157`-`:180`). |
| `routeText`, `RouteTextKey`, `TEXTS` (en, nl), the severity labels `severityError`, `severityWarning`, `severityInfo` | `packages/ui/src/components/routePlan.ts:79`-`:192` | New texts go into this table (rule 3). |
| Text tests: every key in both languages, 140 characters at most | `packages/ui/src/routePlan.test.ts:418`-`:425` | Must still pass with the new keys. |
| `RouteDialog` refusal branch: `route-refusal` shows instead of `route-body` | `packages/ui/src/components/RouteDialog.tsx:162`-`:163` | The route area section is inside `route-body`, so the refusal branch (a multi-page PDF, D-R2-03) shows no section. The menu switch (T16) still works on such a PDF, because it does not depend on the dialog. |
| Room worker (a pattern for a move off the main thread) | `packages/core/src/rooms/worker.ts` | Only if the time limit of P-R4-13 fails. |
| Room `name` is `string \| null` | `packages/core/src/rooms/room.ts:20` | `RouteAreaRoom.name` copies it for the stair note. |
| Scale presets include 100 | `packages/core/src/calibration.ts:74` (`PRESET_SCALE_DENOMINATORS = [10, 20, 50, 100, 200, 500]`) | The 10A run uses `detect('100')`. |
| `drawRooms` draws from `room.polygon` | `packages/render/src/roomLayer.ts:12`, `:21`-`:22` | `RouteArea` holds only room ids, so the overlay needs the rooms (A1). |
| `Dialog` with `closeOnBackdropClick` and `backdropClassName` | `packages/ui/src/components/Dialog.tsx:19`, `:27`, `:41`; CSS `.mep-modal--route` at `packages/ui/src/theme.css:3453` | The dialog at the right, with a transparent backdrop (R2). |
| `MenuButton` item "Route network…" and the debug item | `packages/ui/src/components/MenuButton.tsx:159`-`:169`, `:170`-`:186` | The place of the new menu item. |
| App state `routeOpen`, `wallDebugVisible`, `uncheckedRuleIds` with its storage | `packages/ui/src/App.tsx:438`, `:310`, `:435`-`:436` | The place of the new state. |
| Storage pattern: `StorageLike`, a list of ids, load and save in try/catch | `packages/ui/src/placementRuleStorage.ts:113`-`:130`, `packages/ui/src/schematicTemplateStorage.ts:7` | T15 copies it. |
| Browser helpers | `.claude/roadmap/browser/lib.mjs`, `r2-check.mjs`, `r3-check.mjs`, `r3-lib.mjs`, `with-server.mjs` | The shape of the new checks. `lib.mjs` `detect(scale = '50')` selects the drawing scale (`lib.mjs:83`-`:90`). |
| No door positions: detection finds door arcs only to remove them | `packages/core/src/rooms/types.ts:71`-`:74` | Gap G3. Section 3.4 states how R4 lives with it. |

## 3. Research

### 3.1 What the drawings give (measured, with read-only probes)

The probes are scripts in the scratchpad of the planner. They call the built `dist` of core and of the MuPDF adapter, with the same function as `SketchScene.detectRooms` (`detectLabelledRoomsOnPage`) and the room type matching of the library. They change no product code. The numbers are the evidence for this plan. They are not yet repeated inside the app (not verified in the app).

| Drawing and scale | Rooms found | Route-area rooms (Corridor, Shaft) | Notes |
|---|---|---|---|
| `01_arch_first_floor.pdf`, 1:50 | 38 rooms | 5 rooms "Verkeersruimte" (Corridor), 0 Shaft | 3 of the 5 corridors have `open: true`. Their area is 23.7, 23.4 and 17.8 m² against 35, 35.3 and 25.9 m² printed. The corridor polygons have 8 to 14 vertices. No room has the type Shaft or Entrance. |
| `plattegrond begane grond 10A.pdf`, 1:100 | 34 rooms | 1 Corridor "gang" (77 m², printed 77, 24 vertices), at least 3 "schacht" (Shaft, 3.4 to 3.9 m²), 1 "lifthal" (room type Entrance and hall, 68 m²) | Two of the three shafts have `open: true`. The probe printout was cut after 27 of the 34 rooms, so more shafts are possible. |
| `plattegrond begane grond 10A.pdf`, 1:50 | 30 rooms | areas are about a quarter of the printed areas | The scale 1:50 is wrong for this drawing. |

The last row explains the R2 finding "Auto-place places 0 stamps on 10A with the scale of `lib.mjs`": `lib.mjs` `detect` uses the scale `50` by default (`.claude/roadmap/browser/lib.mjs:83`), and the drawing is 1:100. This is the probable cause. It is not verified in the app. R4 plans browser checks on `01_arch_first_floor.pdf` (scale `50`) and one extra run on 10A with `detect('100')`. The option `100` exists (`PRESET_SCALE_DENOMINATORS`, `packages/core/src/calibration.ts:74`).

Wall gaps (first-floor drawing, closest distance from the boundary of a room to the boundary of a corridor room): 33 rooms are not corridors. 16 rooms have a boundary within 500 mm of a corridor, with gaps from 0 to 425 mm. Two more rooms lie at 532 mm (a toilet) and 567 mm (the lift). The other 15 rooms lie 766 mm or more from every corridor (up to 9 m): offices behind other rooms. A rule that needs two parallel edges finds only 13 of the 16 (the polygons are jagged). So R4 uses the closest approach, not parallel edges (section 3.4).

### 3.2 Sources

- Zhang, T. Y. and Suen, C. Y., "A fast parallel algorithm for thinning digital patterns", Communications of the ACM 27(3), March 1984. Default of 2D skeletonize in scikit-image; the weakness: a 2 by 2 blob disappears and diagonal lines of two pixels blur. Found through a web search; the original paper was not read. MepApp can use it: a corridor is never narrower than 3 pixels of 100 mm, and it is ours to implement (no dependency; `pnpm add` is not allowed).
- ISPRS Archives XLII-4 (2018), "automatic generation of indoor navigation networks based on the floor plan" (https://isprs-archives.copernicus.org/articles/XLII-4/579/2018/isprs-archives-XLII-4-579-2018.pdf). The search summary says: the medial axis of a space gives the center line of a long corridor, it suits large halls less, and doors link rooms to corridors. MepApp can use it: the center line of a corridor, plus a connector from the center line to the wall place of each room. Halls get a center line that is only an approximation; the plan says so (risk R-5). Only the search summary was read.
- ICC CodeNotes, "Fire Damper Fundamentals" (https://www.iccsafe.org/wp-content/uploads/22-21439_CodeNotes_2021_Fire_Damper_Fundamentals_FINAL.pdf), and the San Francisco Fire Department bulletin 5.14 (https://sf-fire.org/514-removal-fire-smoke-dampers-hvac-penetrations-fire-resistance-rated-corridors). The search summary says: a duct that crosses a fire-rated assembly needs a fire damper or a firestop system, and a duct that connects to a riser in a rated shaft still needs a combination fire-smoke damper at the shaft wall in that jurisdiction. The rules are local and change with the code edition. MepApp can use it: the design reason for a separate shaft warning. The text of the warning does not claim a code rule. It says "Check the fire protection of this wall". Only the search summaries were read, not the documents.
- Dutch basis: Bouwbesluit 2012, chapter 2 (fire safety: subdivision into fire compartments and sub-compartments, and the escape routes), and NEN 6068 (the method to find the fire resistance between spaces). The US sources above do not apply in the Netherlands. Clause numbers are not verified, and the documents were not read. MepApp can use them as the reason for the fire hint: a wall of the route area can be a boundary of a (sub)compartment, and a duct, pipe or cable tray through it needs a fire-resistant penetration. The text still claims no rule. The Bouwbesluit term "verkeersruimte" covers corridors and also stairwells (the domain check, M3). So the app shows a note when a route-area room looks like a stairwell.

### 3.3 Why a raster skeleton (the junction test: P-R4-14)

A room polygon is not always a rectangle. In the probe, the corridor polygons have 8 to 24 vertices (L, T and stepped shapes). Three methods were considered.
1. **Raster thinning (chosen).** Draw the polygon at 100 mm per pixel, thin it with Zhang-Suen, cut the short spurs that the corners cause, and simplify the chains. The code is about 250 lines in total, uses `pointInRing` and `distanceTransform` that exist, and handles holes and rings. A 40 m corridor is 400 pixels long, so the cost is small. The center line is centered within about one pixel (100 mm).
2. Rectangle decomposition. It is exact for rectilinear rooms, but it fails for a polygon that is not axis-aligned, and the decomposition has many cases.
3. Straight skeleton or medial axis from a library. No such library is in the repository, and `pnpm add` is not allowed.

Known limits of method 1 (stated in the code comment and in the tests): the ends of a center line stop about half a corridor width before the end wall; a hall gets a line that is only a guide; a corridor that is narrower than 300 mm gives no line, and the room then gets one node at its label point.

### 3.4 How wall crossings are found, and how accurate they are (gap G3)

The wall lines of the filter are single lines of the PDF (kept or dropped by a rule). They carry no door and no wall attribute (`packages/render/src/wallDebugLayer.ts`, `reason` per line). A fire wall cannot be found from them. So R4 uses the room polygons only (P-R4-03).

Rule. The polygon of a room ends at the inner face of the wall (`wallGrowMm` is 0, `packages/core/src/rooms/types.ts:174`). So the wall is the gap between the polygons of two rooms, or the polygons touch. R4 samples the boundary of room A every 100 mm. For each sample it finds the nearest point on the boundary of room B. A **wall stretch** is the longest run of consecutive samples with a distance of at most `maxWallMm` (600 mm). The run must be at least `minWallRunMm` (500 mm). The entry point is the middle of the stretch, halfway between the two boundaries.

Accuracy and limits (each one is shown to the user in the dialog or in this plan):
- The place has an error of about 50 mm along the wall (sample step) and the wall thickness across it. This is enough to mark a crossing on the plan.
- A gap of more than 600 mm is not a wall. It is "space with no room": an unlabeled room or open space. Room detection is label-driven: a region with no label is not a room (the doc comment of `detectRooms`, `scene.ts:3529`-`:3534`). R4 counts such a gap as no entry. It does not guess.
- An open archway between a corridor and a room gives a false crossing. A thick wall of more than 600 mm gives a missed entry (the room then shows in "no wall with the route area"). The false crossing is the safe side: the designer checks the crossings.
- The room outline can be wrong. `Room.open` says that detection found no closed wall (`room.ts:26`). In the probe, 3 of 5 corridors on the first floor are open. The `open-room` warning names this.
- The quality of the room detection sets the quality of R4 (13 of 34 room shapes within 15 % of the printed area on 10A, from the memory note of part 1; not verified here). The probe agrees in kind: at 1:100 the corridor "gang" matches its printed area (77 m²), but "NSA ruimte 1" has 15.2 m² against 53.7 m² printed.

Independent check of the entries (core test with real rooms, T12): for each entry, draw a straight line from the nearest point of the center line to the label point of the served room, and count the crossings with `crossingsAlongPath` (T07). It uses another method (sampling the rooms along the line, not the boundary distance). A line that crosses exactly one wall confirms the entry. T12 records the measured share and sets the limit from it.

What this check proves, and what it does not. It uses the same room polygons and the same `maxWallMm` as the code under test. So it proves consistency of two methods, not truth about the building. It cannot find a wrong room outline or a wall that is not there. Also, the straight line to a label point can cross other rooms in an L-shaped room, so a failing entry may be a defect of the check and not of the entry. T12 prints each failing entry for review. The only proof of truth is the review of the screenshots by a person (T20).

If the share is under the 70 % floor of T12: the lead does not hide it. The lead reports the measured share and the failing entries. The lead may lower the floor, but only with a written reason in the test (for example "L-shaped rooms: the straight line crosses a third room") and a count of the failing entries that the reason explains. A floor below 50 % is a defect to send back, not a floor to lower.

## 4. The model

### 4.1 Stored data

R4 stores nothing in the project file.
- No new field on `ProjectDocument`, `PlacedStamp`, `Segment`, `Fitting`, `NetworkType`, `Room` or `Circuit`.
- No schema step. `CURRENT_SCHEMA_VERSION` stays 18 (`packages/core/src/project.ts:20`).
- One `localStorage` key: `mepapp.routeRoomTypes.v1` (P-R4-01, Q-R4-01). It holds a JSON list of room type ids.
- The route area, the graph and the warnings are calculated. The scene keeps the last result in memory only. The visibility flag is in memory only.

Proof for each task: `git diff --stat` shows no change in `packages/core/src/project.ts`, `schema.ts` or `serialize*`. The browser checks compare `JSON.stringify(exportProject())`, `getDrawingSummary().canUndo` and `isDirty` of `getDocuments()` before and after the overlay and the dialog (the shape of `r2-check.mjs` and `r3-check.mjs`).

### 4.2 Core types (`packages/core/src/route-area.ts`, new)

```ts
import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';

export const DEFAULT_ROUTE_AREA_TYPE_IDS: readonly string[] = ['corridor', 'shaft'];
export const SHAFT_ROOM_TYPE_ID = 'shaft';
export const DEFAULT_MAX_WALL_MM = 600;
export const DEFAULT_MIN_WALL_RUN_MM = 500;
export const DEFAULT_SKELETON_PIXEL_MM = 100;

export interface RouteAreaOptions {
  /** Room type ids that form the route area. An empty list gives an empty area. */
  roomTypeIds: readonly string[];
  /** Millimetres per page point: 1 / calibration.pageUnitsPerRealUnit. Null when the page has no calibration. */
  mmPerPt: number | null;
  pageIndex: number;
  maxWallMm?: number;       // default DEFAULT_MAX_WALL_MM
  minWallRunMm?: number;    // default DEFAULT_MIN_WALL_RUN_MM
  pixelMm?: number;         // default DEFAULT_SKELETON_PIXEL_MM
}

export type RouteAreaStatus = 'ok' | 'no-calibration' | 'no-rooms' | 'no-types' | 'no-route-rooms';
export type RouteAreaRoomKind = 'path' | 'shaft';
export interface RouteAreaRoom { roomId: string; kind: RouteAreaRoomKind; typeId: string; open: boolean; name: string | null }

export type RouteNodeKind = 'end' | 'junction' | 'bend' | 'tap' | 'shaft' | 'wall';
export interface RouteNode { id: string; point: Vec2; kind: RouteNodeKind; roomId: string }
export interface RouteEdge {
  id: string;
  from: string;             // RouteNode.id
  to: string;
  kind: 'center' | 'connector';
  points: Vec2[];           // page points, first = node `from`, last = node `to`
  lengthMm: number;
  roomId: string | null;    // the path room of a center edge; null for a connector
}
/** A place in a wall where a branch can go from a route-area room to another room. */
export interface RouteEntry {
  id: string;
  roomId: string;           // the served room (not in the route area)
  areaRoomId: string;       // the route-area room that the branch leaves
  nodeId: string;           // the node of kind 'wall' at `point`
  point: Vec2;
  runMm: number;
  gapMm: number;
  /** True for the entry of the area room with the longest run for this served room. */
  primary: boolean;
  /** True when the area room is a shaft room. */
  shaft: boolean;
}
/** The same between two route-area rooms. It joins their center lines. */
export interface RouteLink { id: string; roomIds: [string, string]; nodeId: string; point: Vec2; runMm: number; gapMm: number; shaft: boolean }
export interface UnreachedRoom { roomId: string; distanceMm: number | null }  // null: no route-area room on the page

export interface RouteArea {
  status: RouteAreaStatus;
  rooms: RouteAreaRoom[];
  nodes: RouteNode[];
  edges: RouteEdge[];
  entries: RouteEntry[];
  links: RouteLink[];
  /** Rooms of the page, not in the route area, with no wall stretch to any route-area room. */
  unreached: UnreachedRoom[];
  /** The number of separate parts of the graph (connected sets of nodes). 0 for an empty area. */
  parts: number;
}

export function selectRouteAreaRooms(rooms: readonly Room[], options: Pick<RouteAreaOptions, 'roomTypeIds' | 'pageIndex'>): RouteAreaRoom[];
export function computeRouteArea(rooms: readonly Room[], options: RouteAreaOptions): RouteArea;
```

The function reads its input and never changes it (a deep-equal test). The ids are stable for the same input (P-R4-15). `k` is a counter that starts at 0 and counts in the order of creation, so the same input gives the same ids.
- Center node: `rn-<roomId>-<k>`. Center edge: `re-<roomId>-<k>`. Shaft node: `rn-<roomId>-0`.
- Wall node of an entry: `rw-<servedRoomId>-<areaRoomId>`. Wall node of a link: `rl-<roomIdA>-<roomIdB>` (the two ids in the order of `rooms`).
- Entry id: `ry-<servedRoomId>-<areaRoomId>`. Link id: `rk-<roomIdA>-<roomIdB>`.
- Tap node (where a connector meets a center edge): `rt-<entry id or link id>-<k>`, with `k` 0 for an entry and for the first room of a link, and 1 for the second room of a link.
- Connector edge: `rc-<entry id or link id>-<k>` with the same `k`.
- The two edges that `splitEdgeAt` makes from edge `E`: the first part keeps the id `E`, and the second part gets the id `E~<tapNodeId>`. So no id is reused and the ids stay stable.
- A test (T09 and T10b) calls `computeRouteArea` twice and compares every id, and checks that all ids are different.

Empty cases (each has a test, section 4.7):
- No calibration: `status 'no-calibration'`, all lists empty.
- No rooms on the page: `status 'no-rooms'`.
- The list of room types is empty: `status 'no-types'`.
- Rooms exist, but none has a chosen type: `status 'no-route-rooms'`.
- In each of these cases the function returns at once and does not throw.

### 4.3 Core algorithms

**Skeleton (`packages/core/src/route-skeleton.ts`, new; T03, T04, T05a, T05b).**
1. `rasterizePolygon(polygon, pixelPt)`: a mask of the room. A pixel is set when the pixel center is inside the outer ring and outside every hole (`polygonContainsPoint`). The mask has a border of 1 empty pixel. If the mask would have more than 4 000 000 pixels, the pixel size grows until it fits.
2. `thinMask(raster)`: Zhang-Suen thinning, in place, until a pass changes nothing. Neighbors P2 to P9 run clockwise from the north. A pixel goes when 2 ≤ B ≤ 6 (B = number of set neighbors), A = 1 (A = number of 0 to 1 steps in the ring of neighbors), and step 1: P2·P4·P6 = 0 and P4·P6·P8 = 0; step 2: P2·P4·P8 = 0 and P2·P6·P8 = 0.
3. `pixelGraphOf(raster)`: classify each set pixel by its crossing number CN (the number of 0-to-1 steps in the ring of its 8 neighbors, the same ring order as step 2). CN 0 or CN 1: `end` (a lone pixel is a node with no edge). CN 2: chain pixel. CN 3 or more: `junction` (touching junction pixels become one node at their average). A staircase pixel of a diagonal line has B = 3 but CN = 2, so it is a chain pixel and not a junction (P-R4-14). Edges are the pixel chains between nodes. A closed ring with no node gets one `bend` node at its first pixel.
4. `centerLineOf(polygon, mmPerPt, options)`: steps 1 to 3, then **prune**: an edge that ends in an `end` node and has a length of at most 1.5 times the half-width at its junction (from `distanceTransform` of the outside) goes; repeat until no change; a junction with two edges left joins them (it becomes a `bend`). Then **simplify** each chain with Douglas-Peucker (tolerance 1 pixel; a new function for an open polyline, `simplifyRing` is for rings, `packages/core/src/rooms/polygon.ts:132`). Then convert pixels to page points: `x = x0 + (px + 0.5) * pixelPt`.
5. If the result has no node (the room is too narrow), `computeRouteArea` gives the room one `end` node at `roomLabelPoint`.

```ts
export interface RasterMask { mask: Uint8Array; w: number; h: number; x0: number; y0: number; pixelPt: number }
export interface CenterLineNode { id: string; point: Vec2; kind: 'end' | 'junction' | 'bend' }
export interface CenterLineEdge { from: string; to: string; points: Vec2[] }
export interface CenterLine { nodes: CenterLineNode[]; edges: CenterLineEdge[]; halfWidthMm: number }
export function rasterizePolygon(polygon: RoomPolygon, pixelPt: number, maxPixels?: number): RasterMask;
export function thinMask(raster: RasterMask): void;
export function centerLineOf(polygon: RoomPolygon, mmPerPt: number, options?: { pixelMm?: number; pruneFactor?: number }): CenterLine;
```

**Wall stretch (`packages/core/src/route-wall.ts`, new; T06).**

```ts
export interface WallStretch { point: Vec2; onA: Vec2; onB: Vec2; runMm: number; gapMm: number }
/** The longest stretch of A within maxWallMm of B, or null. */
export function wallStretch(a: RoomPolygon, b: RoomPolygon, mmPerPt: number, options?: { maxWallMm?: number; minWallRunMm?: number; stepMm?: number }): WallStretch | null;
/** The smallest distance between the boundaries, in mm. Infinity when a ring is empty. */
export function boundaryGapMm(a: RoomPolygon, b: RoomPolygon, mmPerPt: number, stepMm?: number): number;
```
The boundary of B is its outer ring and its holes. A bounding-box test (grown by `maxWallMm`) skips room pairs that are far apart. Samples wrap around the ring: a run can cross the first vertex.

**Crossings along a path (`packages/core/src/route-crossings.ts`, new; T07).**

```ts
export interface WallCrossing { point: Vec2; fromRoomId: string | null; toRoomId: string | null; gapMm: number; atMm: number }
export interface OpenRun { from: Vec2; to: Vec2; lengthMm: number; fromRoomId: string | null; toRoomId: string | null }
export function crossingsAlongPath(rooms: readonly Room[], path: readonly Vec2[], options: { mmPerPt: number; pageIndex: number; maxWallMm?: number; stepMm?: number }): { crossings: WallCrossing[]; openRuns: OpenRun[] };
```
The path is sampled every `stepMm` (default 100 mm, end point included). The room of a sample is `roomsAtPoint(rooms, p, pageIndex)[0]?.id ?? null` (`room.ts:138`). The walk keeps the last room that it saw. A change to another room is a crossing: if no sample lay between the two rooms, the gap is 0 and the point is the middle of the two samples; if a run of empty samples lay between, the gap is the run length plus one step, and the point is the middle of the run. When the gap is above `maxWallMm`, the run is an `OpenRun` and not a crossing. A path that leaves a room and comes back to the same room through empty samples gives nothing. Empty samples at the start or at the end of the path give nothing.

**The graph (`packages/core/src/route-graph.ts`, new helpers; `computeRouteArea` in `route-area.ts`; T08, T09, T10a, T10b).**
1. Select the route-area rooms of the page (`selectRouteAreaRooms`): a room with `pageIndex === options.pageIndex` and `roomTypeId` in the list. The kind is `shaft` when `roomTypeId === SHAFT_ROOM_TYPE_ID`, else `path`. The order is the order of `rooms`.
2. Each path room: `centerLineOf` gives nodes and edges. They become `RouteNode` and `RouteEdge` of kind `center`. A path room with an empty center line gets one `end` node at `roomLabelPoint`. Each shaft room gets one node of kind `shaft` at `roomLabelPoint`.
3. Links (T10a). For each pair of route-area rooms, `wallStretch` gives a stretch or null. A stretch gives one `RouteLink`: a node of kind `wall` at the stretch point, and a connector edge from that node to the nearest point of each of the two rooms (the nearest point on a center edge: the helper splits the edge there and adds a `tap` node; for a shaft room, the `shaft` node). `shaft` is true when either room is a shaft room.
4. Entries (T10a). For each other room of the page, `wallStretch` against each route-area room gives zero or more entries. Each entry has a `wall` node at the stretch point and a connector edge to the nearest point on the area room (the same helper). The entry with the longest run for a served room is `primary`. `shaft` is true when the area room is a shaft room.
5. `unreached` (T10b): the other rooms with no entry. `distanceMm` is the smallest `boundaryGapMm` to a route-area room, rounded to 10 mm (null when there is none).
6. `parts` (T10b, after the links): the number of connected sets of nodes (union-find over the edges).

Graph helpers (T08), pure, no room data:

```ts
export interface GraphData { nodes: RouteNode[]; edges: RouteEdge[] }
/** The nearest point on the edges that pass `filter`: { edgeId, segment, point, distance } or null. */
export function nearestOnEdges(graph: GraphData, point: Vec2, filter?: (edge: RouteEdge) => boolean): { edgeId: string; segment: number; point: Vec2; distance: number } | null;
/** Splits the edge at the point (on segment `segment`) and returns the id of the new `tap` node. Returns the id of an end node of the edge when the point is within 1e-6 of it. */
export function splitEdgeAt(graph: GraphData, edgeId: string, segment: number, point: Vec2, nodeId: string): string;
export function connectedParts(graph: GraphData): string[][];
```

### 4.4 Warnings (`packages/core/src/route-area-warnings.ts`, new; T11)

```ts
export type RouteAreaWarningCode =
  | 'no-calibration' | 'no-rooms' | 'no-types' | 'no-route-rooms'
  | 'open-room' | 'parts' | 'wall-crossings' | 'shaft-crossing' | 'unreached' | 'stair-name' | 'draft-2d';
export interface RouteAreaWarning {
  code: RouteAreaWarningCode;
  severity: 'error' | 'warning' | 'info';
  count?: number;
  /** open-room: the rooms with an open outline. shaft-crossing: the shaft room. unreached and stair-name: the rooms. */
  roomIds?: string[];
  /** wall-crossings and shaft-crossing: the possible places for a branch, page points. */
  points?: Vec2[];
}
/** Errors first, then warnings, then info. `draft-2d` is always the last line. */
export function routeAreaWarnings(area: RouteArea): RouteAreaWarning[];
```

Rules (each one has a test):
1. `status` other than `ok`: one line for the status, severity by P-R4-09. Then `draft-2d`. Nothing else.
2. `open-room` (warning): the route-area rooms with `open: true`. `count` and `roomIds`.
3. `parts` (warning): `area.parts > 1`; `count` = `parts`.
4. `wall-crossings` (warning): the primary entries and the links that are not shaft places. `count` = their number (each one is one room that a branch can reach through a wall of the route area; a link reaches another route-area room). `points` = their points. No line when the count is 0. The code is still named `wall-crossings` so that R6 can find it. The text does not claim that a branch crosses a wall: R4 has no branch (A8, M1).
5. `shaft-crossing` (warning): one line for each shaft room that has at least one entry or link with `shaft` true. `roomIds` = that shaft room; `count`; `points`. A shaft place is not counted again in `wall-crossings`.
6. `unreached` (info): `count` and `roomIds`.
7. `stair-name` (info): the route-area rooms whose `name` holds "trap" (a case-insensitive test; "trappenhuis" and "trap" match). `count` and `roomIds`. No line when there is none. Reason: the Bouwbesluit term "verkeersruimte" covers corridors and stairwells, so the route area can hold a stairwell (M3). The test is a name test and can be wrong. The text says "may be".
8. `draft-2d` (info): always, at the end (D-R4-02).
9. The function does not change its input.

The texts call each place a "possible place for a branch" and never a "door" or a "crossing". They never say "fire wall" as a fact. The app has no fire compartment model. The wall lines carry no attribute (`wallDebugData`, `packages/render/src/scene.ts:675`). The designer checks the fire walls. The fire hint goes with the `wall-crossings` line and with the `shaft-crossing` line, because a corridor wall is often fire-rated too (M2). R6 counts real crossings with `crossingsAlongPath`.

### 4.5 Scene (`packages/render/src/scene.ts`, `routeAreaLayer.ts` new; T13, T14a)

```ts
// packages/render/src/routeAreaLayer.ts (defined here, not in scene.ts, so the layer file has no import from scene.ts; A2)
import type { RouteArea, RouteAreaWarning } from '@mepapp/core';
export interface RouteAreaView { area: RouteArea; warnings: RouteAreaWarning[] }
// SketchScene:
setRouteAreaRoomTypes(ids: readonly string[]): void   // the list; invalidates the cache; redraws; emits 'routeAreaChanged'
getRouteAreaRoomTypes(): string[]                      // the one copy of the list (A12)
getRouteArea(): RouteAreaView                          // of the active document and page; cached
setRouteAreaVisible(visible: boolean): void           // emits 'routeAreaVisibleChanged'
isRouteAreaVisible(): boolean
isRouteAreaPending(): boolean                          // true during the debounce wait (P-R4-13)
// events: routeAreaChanged: [RouteAreaView]; routeAreaVisibleChanged: [boolean]; routeAreaPendingChanged: [boolean]
```
- `getRouteArea` builds `computeRouteArea(listRooms(), { roomTypeIds, mmPerPt, pageIndex })` with `mmPerPt = 1 / getCalibration().pageUnitsPerRealUnit` or `null`. The cache key is the object `drawingHistory.getState().rooms`, the list, the page and the calibration factor. A call to `getRouteArea` with a stale cache computes at once (the tests and the scene API need a result).
- **When the scene computes (P-R4-13).** The layer redraw and the event `routeAreaChanged` run only when `isRouteAreaVisible()` is true. A change of the list, the page, the calibration or the visibility redraws at once. A `roomsChanged` event marks the cache stale, sets "pending" to true (event `routeAreaPendingChanged`), and starts a 300 ms timer; a new `roomsChanged` restarts the timer. When the timer ends, the scene computes, redraws, sets "pending" to false and emits `routeAreaChanged`. While "pending" is true the layer keeps the old drawing and the dialog section shows the note "Calculating the route area…". When the layer is not visible, the scene computes nothing on `roomsChanged`.
- **Above the limit.** The limit is about 1 s for one floor (measured in T12, T14b and T20). If a measured time is above it, the lead reports it, and a new task moves `computeRouteArea` into a worker (the pattern of `packages/core/src/rooms/worker.ts`). R4 does not assume the worker.
- **The room polygons for the fill (A1).** `RouteArea` holds room ids only. `drawRouteArea` gets the rooms as an input and looks up each polygon by `roomId` (the scene passes `listRooms()`; the pattern of `drawRooms`, `roomLayer.ts:12`, `:21`-`:22`).
- The layer is a scene-level `Container` like `wallDebugLayer`: added to `world` at start (`scene.ts:860`) and again on a document switch (`:1108`), above the room layer. It is cleared and redrawn on `pageChanged`, `documentActivated`, `calibrationSet`, `zoomChanged`, on both setters, and after the debounce of `roomsChanged`. Line widths divide by `world.scale.x` so they stay constant on the screen.
- It never calls `markDirty`, never writes to the undo state, never enters `serializeDocument` or the PDF export (as the route markers).
- `drawRouteArea(layer, view, rooms, pxPt)` in `routeAreaLayer.ts` draws, in this order: the route-area room fill, the center edges, the connector edges (dashed), a small amber cross at each place of a primary entry or a link, and a red cross at each shaft place.

### 4.6 UI

**Storage (`packages/ui/src/routeAreaStorage.ts`, new; T15).**
```ts
export const ROUTE_ROOM_TYPES_STORAGE_KEY = 'mepapp.routeRoomTypes.v1';
export function loadRouteRoomTypeIds(storage: StorageLike | undefined): string[]; // default: a copy of DEFAULT_ROUTE_AREA_TYPE_IDS; a stored [] stays []; non-string entries and doubles go
export function saveRouteRoomTypeIds(storage: StorageLike | undefined, ids: readonly string[]): void;
```
`App.tsx` holds the state `routeRoomTypeIds`, saves it in an effect (as `uncheckedRuleIds`), and pushes it with `scene.setRouteAreaRoomTypes` in an effect (as `setRoomTypeLibrary`, `App.tsx:424`-`:428`, line `:427`). This is the one copy: App state to the scene, the same pattern as `setRoomTypeLibrary`. The dialog section does not keep the list. It reads `scene.getRouteAreaRoomTypes()` and changes it through the callback `onRouteTypeIdsChange` (which sets the App state).

**Menu switch (T16).** `MenuButton` gets two props, `routeAreaVisible` and `onToggleRouteArea`. The new item sits directly after "Route network…" (`MenuButton.tsx:169`) and reads "Show route area" or "Hide route area". It is disabled without a PDF. `App.tsx` mirrors the scene flag through the event `routeAreaVisibleChanged`.

**Texts (T17).** New keys in `RouteTextKey` and `TEXTS` of `routePlan.ts` (en and nl), and one pure function:

```ts
export interface RouteAreaLine { code: RouteAreaWarningCode; severity: 'error' | 'warning' | 'info'; text: string; hint: string }
export function routeAreaLines(
  warnings: readonly RouteAreaWarning[],
  names: { room: (roomId: string) => string },
  language: RouteLanguage,
): RouteAreaLine[];
export function routeAreaSummaryLine(area: RouteArea, language: RouteLanguage): string;
export function routeAreaTypeChoices(roomTypes: readonly RoomType[], ids: readonly string[], language: RouteLanguage): { id: string; label: string; inList: boolean }[];
```
English texts (STE; 140 characters at most; no CFM, no GPM):

| Key | Text |
|---|---|
| `areaTitle` | "Route area" |
| `areaTypes` | "Room types in the route area" |
| `areaAdd` | "Add a room type…" |
| `areaRemove` | "Remove {type}" |
| `areaReset` | "Use Corridor and Shaft" |
| `areaShow` | "Show the route area on the plan" |
| `areaTypesHint` | "Entrance and hall can carry a main." (shown near the room type select; no hint for technical rooms or stairwells) |
| `areaCalculating` | "Calculating the route area…" |
| `areaSummary` | "{rooms} rooms in the route area. {entries} rooms have a wall with it." (1 room: "1 room in the route area.") |
| `areaLegend` | "Route area, center line, possible place for a branch, shaft place" (four labels with colored squares) |
| `areaLegendGuide` | "The center line is a guide." |
| `warnNoCalibration` | "The drawing has no scale. Set the scale first." |
| `warnNoRooms` | "The drawing has no rooms. Run Detect rooms in Auto-place." |
| `warnNoTypes` | "No room type is in the list. Add a room type." |
| `warnNoRouteRooms` | "No room has a room type of the list. Add a room type, or change the room type of a room in the Rooms tab." |
| `warnOpenRoom` | "{count} rooms of the route area may have a wrong outline (no closed wall found). The center line can be wrong." |
| `warnParts` | "The route area has {count} separate parts. A branch between them passes rooms that are not in the route area." |
| `warnWallCrossings` | "{count} rooms can be reached through a wall of the route area. The places are marked." (1 room: "1 room can be reached through a wall of the route area. The place is marked.") |
| `warnWallCrossingsHint` | "Check which of these walls are fire walls. A duct needs a fire damper there. A pipe or cable tray needs a firestop." |
| `warnShaftCrossing` | "The shaft {room} has {count} possible places for a branch through its wall." |
| `warnShaftCrossingHint` | the same text as `warnWallCrossingsHint` (the fire hint goes with both lines) |
| `warnUnreached` | "{count} rooms have no wall with the route area. A branch to them passes more than one wall or room." |
| `warnStairName` | "{room} may be a stairwell. Check if a branch can go there." |
| `warnDraft2d` | "Draft in 2D. Check height, clashes, clearances and slope yourself." |

All keys: 140 characters at most, in English and in Dutch (the test of T17 checks this). The text of `warnWallCrossingsHint` has about 115 characters.

The Dutch texts follow P-R4-11. A Dutch speaker must check each one. Starting points (not verified by a Dutch speaker):
- `warnDraft2d`: "Schets in 2D. Controleer zelf hoogte, conflicten, vrije ruimte en afschot."
- `warnWallCrossingsHint`: "Controleer of deze wand brandwerend is." The words "brandklep", "brandmanchet" and "doorvoering" are added only if the full text stays within 140 characters and a Dutch speaker agrees.
- `warnStairName`: "{room} kan een trappenhuis zijn. Controleer of een aftakking hier kan lopen."
- `areaTypesHint`: "Entree en hal kan een hoofdleiding dragen."
The Dutch term for "route area" is "Routegebied" and stays provisional (P-R4-17): "tracé" is the common MEP word and a Dutch speaker must decide. If the Dutch UI shows both Corridor ("Gang") and the Bouwbesluit term "verkeersruimte", a Dutch speaker decides on the label "Gang / verkeersruimte". R4 does not change the room type library.

**Dialog section (T18, T19).** `packages/ui/src/components/RouteAreaSection.tsx` (new). `RouteDialog` mounts it as the last child of `route-body`, also in the branch with no equipment stamp.
- Test ids: `route-area` (the `<details open>`), `route-area-show` (check box), `route-area-summary`, `route-area-lines` with one `route-area-line-<code>` for each line (the code `stair-name` gives `route-area-line-stair-name`) (attribute `data-severity`; text starts with the label Error, Warning or Note, as `route-check-<code>` does in R3), `route-area-legend`, `route-area-types` (the chips; each chip `route-area-type` with `data-type-id` and a button `route-area-remove`), `route-area-add` (select), `route-area-reset` (button).
- While the dialog is open, the effect sets the scene flag to true and restores the old value in its cleanup (P-R4-02). The check box `route-area-show` sets the flag.
- The section reads `scene.getRouteArea()` and `scene.getRouteAreaRoomTypes()` and refreshes on `routeAreaChanged` and `routeAreaPendingChanged`. While `isRouteAreaPending()` is true it shows `areaCalculating` (test id `route-area-calculating`) above the old lines. It shows the hint `areaTypesHint` (test id `route-area-types-hint`) under the select and the line `areaLegendGuide` in the legend.
- The route area section is inside `route-body`. The refusal branch (`route-refusal`, a multi-page PDF) shows no section. The menu switch (T16) still works there (`RouteDialog.tsx:162`-`:163`).
- The chips show the room types of the list that exist in `scene.getRoomTypes()`. An id that no known room type has shows as its id text. The select `route-area-add` lists the room types that are not in the list (library names, Dutch names in Dutch). The button `route-area-reset` sets the list to Corridor and Shaft.
- An empty list is allowed. The section then shows `warnNoTypes`.
- The dialog prop: `onRouteTypeIdsChange: (ids: string[]) => void` (from `App.tsx`). There is no prop for the list itself (A12).

### 4.7 The cases with no corridor and with an empty list

| Case | `status` | What the user sees | Tests |
|---|---|---|---|
| The page has no scale | `no-calibration` | Error line, the note "Draft in 2D". No overlay. | T09, T11, T14b |
| The page has no rooms | `no-rooms` | Warning "The drawing has no rooms. Run Detect rooms in Auto-place." | T09, T11, T14b, T20 |
| The list is empty | `no-types` | Warning "No room type is in the list. Add a room type." The chips area is empty. | T09, T11, T19, T20 |
| Rooms exist, none has a type of the list (no corridor) | `no-route-rooms` | Warning "No room has a room type of the list…" | T09, T11, T14b, T20 |
| One path room, no other room | `ok` | The center line; summary "1 room in the route area"; no entry. | T09 |
| A path room too narrow for a center line | `ok` | One `end` node at the label point. | T09 |
| Two path rooms far apart | `ok`, `parts` 2 | Warning `parts`. | T09, T10b, T11 |
| A shaft room that touches no other room | `ok` | One `shaft` node; no entry. | T10b |

No case throws. The overlay shows nothing for a status other than `ok`.

## 5. How R4 keeps the rules of `rules.md` §3

1. **The segment defines the network type of a port.** R4 reads rooms and room types. It writes no segment, no port, no routing target and no network type. The graph holds no network type.
2. **The cascade invariant.** R4 adds no per-segment field and no segment. The rule is not touched.
3. **Reuse before new.** Reused: `roomsAtPoint`, `polygonContainsPoint`, `roomLabelPoint`, `distanceTransform`, `setRoomType` (setup), the layer and redraw pattern of the wall debug layer, the "overlay that is not an edit" pattern of the route markers, the storage pattern of `uncheckedRuleIds`, the `routeText` table and its length test, the `Dialog` backdrop class, the severity labels of R3, `lib.mjs` and `r3-lib.mjs`. New, after a search that found nothing to reuse: the skeleton (no thinning or medial axis in core or render), the wall stretch, the crossing sampler. No second copy of a state: the visibility flag lives in the scene only, and the dialog and the menu both use it.
4. **The adoption trap.** R4 writes no segment and no network type. It adopts nothing.
5. **Verify UI wiring through the real DOM.** T16, T18, T19 and T20 click the menu item, the check box, the select and the buttons, and read the DOM. The scene API is for setup (`setRoomType`, `loadProjectFromJson`) and for reading state.
6. **Merge lesson.** Each task ends with `pnpm build` at the root.

Rules `rules.md` §2: no `pnpm add`; the skeleton is our own code. No `mupdf` import outside its package: the fixture script (T01) is a script that calls the built adapter, as `scripts/room-labelled.mjs` does.

## 6. The phases and the tasks

Commands (the tester runs them from the root of the worktree `/root/MepApp/.claude/worktrees/agent-framework`, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. No environment variable before the command. Screenshots go to `/tmp/mepapp-shots/`, with `shot('<task id>-<name>')`.

Rules for every browser step of this part (the rules of R2 and R3 apply):
- Open each PDF with `openPdf('<absolute path>')`. The main PDF is `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf` with `detect('50')`. One Chromium page at a time. R4 needs no stamps.
- While the route dialog is open, click only inside `.mep-modal--route`. Close it with Escape or the Close button. Do all canvas clicks before the dialog opens. The dialog ignores a click on the backdrop (`closeOnBackdropClick={false}`).
- The setup (T14b, `r4-lib.mjs`): open the PDF, run `detect`, read `listRooms()`, and make the shaft room with `setRoomType([roomId], 'shaft')` on a small room that has no corridor type (on the first floor: a room named "Kast", area 0.6 m²; the check picks the smallest room that is not a corridor). The setup is an undo step and marks the document as changed. So every baseline is taken after the setup.
- The scene API reads the route area (`getRouteArea()`), the layer, and the flag. The wiring (menu item, check box, select, buttons) goes through real inputs.
- Pixels: a check counts the pixels of a color in a clip of a screenshot around a point (the shape of `magentaIn` in `r2-check.mjs:72`).
- No real multi-page PDF exists (R2 found 9 files with 1 page). R4 does not plan on one.

Phases: **A** the model in core (T01 to T12, with T05a, T05b, T10a, T10b), **B** the scene (T13, T14a, T14b), **C** the dialog (T15 to T19), **D** the part check (T20).

| Task | Title | Depends on | Files (main) |
|---|---|---|---|
| T01 | The real-room fixture and its loader | none | `scripts/export-route-area-fixture.mjs`, `packages/core/fixtures/route-area/first-floor-rooms.json`, `packages/core/src/rooms/route-area-fixture.testutil.ts` |
| T02 | Types, defaults and room selection | none | `packages/core/src/route-area.ts`, `route-area.test.ts`, `index.ts` |
| T03 | Skeleton: raster and thinning | none | `packages/core/src/route-skeleton.ts`, `route-skeleton.test.ts` |
| T04 | Skeleton: the pixel graph | T03 | `route-skeleton.ts`, `route-skeleton.test.ts` |
| T05a | Skeleton: prune and half-width | T04 | `route-skeleton.ts`, `route-skeleton.test.ts` |
| T05b | Skeleton: simplify, `centerLineOf`, real-room tests | T05a, T01 | `route-skeleton.ts`, `route-skeleton.test.ts`, `route-skeleton-real.test.ts`, `index.ts` |
| T06 | Wall stretch and boundary gap | none | `packages/core/src/route-wall.ts`, `route-wall.test.ts`, `index.ts` |
| T07 | Crossings along a path | none | `packages/core/src/route-crossings.ts`, `route-crossings.test.ts`, `index.ts` |
| T08 | Graph helpers | T02 | `packages/core/src/route-graph.ts`, `route-graph.test.ts` |
| T09 | `computeRouteArea` part 1: rooms, center lines, shaft nodes, empty cases | T02, T05b, T08 | `route-area.ts`, `route-area.test.ts` |
| T10a | `computeRouteArea` part 2a: links and entries | T06, T09 | `route-area.ts`, `route-area.test.ts` |
| T10b | `computeRouteArea` part 2b: unreached, parts, shaft cases, ids | T10a | `route-area.ts`, `route-area.test.ts`, `route-area-shaft.test.ts` |
| T11 | The warnings | T10b | `packages/core/src/route-area-warnings.ts`, `route-area-warnings.test.ts`, `index.ts` |
| T12 | The chain on real rooms (test only) | T01, T07, T11 | `packages/core/src/route-area-real.test.ts` |
| T13 | The overlay drawing and `RouteAreaView` | T11 | `packages/render/src/routeAreaLayer.ts` |
| T14a | The scene: list, cache, flag, layer, events, debounce | T11, T13 | `packages/render/src/scene.ts`, `packages/render/src/index.ts` |
| T14b | The shared browser setup and the scene check | T14a | `.claude/roadmap/browser/r4-lib.mjs`, `t14-check.mjs` (work folder) |
| T15 | Storage of the list and the wiring in `App.tsx` | T14b | `packages/ui/src/routeAreaStorage.ts`, `routeAreaStorage.test.ts`, `App.tsx` |
| T16 | The menu switch | T15 | `MenuButton.tsx`, `App.tsx` |
| T17 | The texts and the line builders | T11 | `packages/ui/src/components/routePlan.ts`, `packages/ui/src/routePlan.test.ts` |
| T18 | The dialog section: lines, legend, show switch | T16, T17 | `RouteAreaSection.tsx` (new), `RouteDialog.tsx`, `theme.css` |
| T19 | The room type list control | T18 | `RouteAreaSection.tsx`, `RouteDialog.tsx`, `App.tsx` |
| T20 | The part check | all | `.claude/roadmap/browser/r4-check.mjs` |

No dependency: **T01, T02, T03, T06, T07**. They write different files. `packages/core/src/index.ts` is a shared file: each task adds one export line, and the task lead adds the lines one after another. Jobs on the same file run one after another: T03, T04, T05a and T05b (`route-skeleton.ts`); T02, T09, T10a and T10b (`route-area.ts`); T14a (`scene.ts`, `render/index.ts`); T15, T16 and T19 (`App.tsx`, in this order); T18 and T19 (`RouteAreaSection.tsx` and `RouteDialog.tsx`); T17 and the later texts (`routePlan.ts`). T17 edits `routePlan.ts` only, so it runs in parallel with T13 to T16. T13 and T14a need `RouteAreaWarning` from T11. T12 runs in parallel with T13 to T14b (it is a test file only).

### T01. The real-room fixture and its loader
- **Depends on:** none. Needs `pnpm build` first (the script reads `dist`).
- **Files:** `scripts/export-route-area-fixture.mjs` (new), `packages/core/fixtures/route-area/first-floor-rooms.json` (new, generated), `packages/core/src/rooms/route-area-fixture.testutil.ts` (new, the loader), `packages/core/src/rooms/route-area-fixture.test.ts` (new, the loader test).
- **Shapes:** the script copies the steps of `scripts/room-labelled.mjs` (open the PDF with `MupdfEngine`, read labels, `detectLabelledRoomsOnPage`, scale 50, `mmPerPt = (25.4 / 72) * 50`) and the type match `matchRoomType(name, details, ROOM_TYPE_LIBRARY)`. It writes `{ "source": "01_arch_first_floor.pdf", "scale": 50, "mmPerPt": number, "pageIndex": 0, "rooms": Room[] }` where each room has `id` (`room-<k>`), `pageIndex`, `polygon`, `name`, `number: null`, `source: 'detected'`, `locked: false`, `open`, `roomTypeId`, `roomTypeSource: 'matched'`. The loader exports `loadFirstFloorRooms(): { mmPerPt: number; rooms: Room[] }`.
- **Must not touch:** product code, any existing script, `fixtures/pdfs`.
- **Verify:** `pnpm build`, then `node scripts/export-route-area-fixture.mjs` exits 0 and prints the room count (38 in the probe) and the number of rooms with `roomTypeId` `corridor` (5 in the probe). The core test `route-area-fixture.test.ts` (in T01, listed in the files) checks that the loader gives 38 rooms and 5 corridors. The JSON has no PDF content (polygons and names only). `git diff --stat` shows no product file.
- **Size:** about 60 lines of script, 25 of loader, a JSON of some tens of KB.

### T02. Types, defaults and room selection
- **Depends on:** none.
- **Files:** `packages/core/src/route-area.ts` (new), `packages/core/src/route-area.test.ts` (new), `packages/core/src/index.ts` (one export line).
- **Shapes:** section 4.2 (all types, the constants, `selectRouteAreaRooms`). `computeRouteArea` is a stub in T02 that returns an empty area with the right `status` (T09 fills it).
- **Must not touch:** `rooms/room.ts`, any stored type.
- **Tests (core):** the defaults are `corridor` and `shaft`; `selectRouteAreaRooms` keeps rooms of the page with a type in the list and gives kind `shaft` for the type `shaft`; a room of another page is left out; a room with no `roomTypeId` is left out; the order is the order of the input; an id in the list that no room has changes nothing; an empty list gives an empty result; the input is not changed (deep equal); the stub gives each of the four empty statuses (`no-calibration` when `mmPerPt` is null, `no-rooms`, `no-types`, `no-route-rooms`).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 70 of tests.

### T03. Skeleton: raster and thinning
- **Depends on:** none.
- **Files:** `packages/core/src/route-skeleton.ts` (new), `packages/core/src/route-skeleton.test.ts` (new).
- **Shapes:** `RasterMask`, `rasterizePolygon`, `thinMask` (section 4.3, steps 1 and 2). Use `polygonContainsPoint` (`room.ts:75`).
- **Must not touch:** `rooms/raster.ts`, `rooms/polygon.ts`.
- **Tests (core), built shapes (a rectangle, an L, a ring with a hole):**
  - `rasterizePolygon`: the pixel count times the pixel area is within 3 % of `polygonAreaPt2`; the border pixels are empty; a hole is empty; a polygon so large that it needs more than `maxPixels` pixels gets a larger pixel (the mask has at most `maxPixels` pixels).
  - `thinMask` on a 10 m by 2 m rectangle (100 mm pixels): the result is one connected chain; every set pixel lies within 1 pixel of the middle line; the chain length is at least 70 % of the long side.
  - On an L: one connected chain with one bend. On a ring with a hole: one closed loop (every set pixel has exactly two set neighbors, or the loop has no end).
  - On a 2 by 2 blob the result may be empty (the known weakness; the test pins it).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 100 lines and 70 of tests.

### T04. Skeleton: the pixel graph
- **Depends on:** T03 (same file).
- **Files:** `route-skeleton.ts`, `route-skeleton.test.ts`.
- **Shapes:** `pixelGraphOf(raster): { nodes: { id: string; x: number; y: number; kind: 'end' | 'junction' | 'bend' }[]; edges: { from: string; to: string; pixels: { x: number; y: number }[] }[] }` (section 4.3, step 3, with the crossing number, P-R4-14). A private `crossingNumber(mask, w, x, y)`. Export `pixelGraphOf` for the tests.
- **Tests (core):** a straight chain: 2 `end` nodes, 1 edge. A plus: 4 `end`, 1 `junction`, 4 edges. A T: 3 `end`, 1 `junction`. A ring: 1 `bend` node, 1 edge that starts and ends at it. Touching junction pixels give one node. **A diagonal line** (a 45 degree staircase of 8-connected pixels with the extra corner pixels that Zhang-Suen leaves, built by hand, and also a diagonal made by `thinMask` of a built parallelogram): 2 `end` nodes, 0 `junction`, 1 edge. A test of `crossingNumber`: a staircase pixel (B = 3) gives CN 2. A chain that was thinned from a built 10 m rectangle: 2 nodes, 1 edge. An empty raster: no node, no edge.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 80 lines and 60 of tests.

### T05a. Skeleton: prune and half-width
- **Depends on:** T04 (same file).
- **Files:** `route-skeleton.ts`, `route-skeleton.test.ts`.
- **Shapes:** `pruneGraph(graph, halfWidthPx, pruneFactor): graph` (the prune of section 4.3, step 4: an edge that ends in an `end` node and is at most `pruneFactor` (default 1.5) times the half-width at its junction long goes; repeat until no change; a junction with two edges left becomes a `bend` and its two edges join) and `halfWidthAt(distances, x, y)` (the half-width in pixels at a pixel, from `distanceTransform`, `raster.ts:72`, on the inverted mask). Export both for the tests. No conversion to page points yet.
- **Must not touch:** `rooms/raster.ts`, `rooms/polygon.ts`.
- **Tests (core), built pixel graphs from `thinMask` of built shapes:** a T of two corridors with corner spurs: the spurs go, 3 `end` nodes and 1 `junction` stay. A rectangle: the two short corner spurs go and 2 `end` nodes stay. A junction with two edges left becomes a `bend` and its edges join (one edge). A real branch longer than 1.5 times the half-width stays. `halfWidthAt` on a 2 m wide corridor gives about 10 pixels at 100 mm. A prune never removes the last edge of a graph. The input is not changed.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 60 of tests.

### T05b. Skeleton: simplify, `centerLineOf`, real-room tests
- **Depends on:** T05a (same file), T01 (real test).
- **Files:** `route-skeleton.ts`, `route-skeleton.test.ts`, `route-skeleton-real.test.ts` (new, the real-room tests), `index.ts` (one export line).
- **Shapes:** `centerLineOf`, `CenterLine` (section 4.3, step 4), a private `simplifyChain` (Douglas-Peucker for an open polyline, tolerance 1 pixel), and the conversion of pixels to page points. The result has `halfWidthMm`.
- **Must not touch:** `simplifyRing` in `rooms/polygon.ts`.
- **Tests (core):**
  - Built: a 10 m by 2 m rectangle gives 2 `end` nodes and 1 edge; its length is between `L - W` and `L` (L = 10 000 mm, W = 2000 mm) and each point is within 150 mm of the middle line; `halfWidthMm` is about 1000. A T of two 2 m wide corridors gives 3 `end` nodes and 1 `junction`; the spurs of the corners are pruned (no `end` node closer than 1 m to a polygon corner that is not a real end). An L gives 2 `end` nodes and a path with one corner. A ring gives one closed edge. A room narrower than 300 mm gives no node.
  - Real (in `route-skeleton-real.test.ts`, with the loader of T01): for each of the 5 corridor rooms, the result has at least 1 edge; every node and every vertex of an edge lies inside the polygon (`polygonContainsPoint`); the distance from each vertex to the nearest polygon edge (computed in the test with a plain point-to-segment function, not with the raster) is at least 25 % of `halfWidthMm`. The test records the number of nodes of each corridor in a comment, as measured.
  - The input is not changed.
  - A time guard: the 5 corridors together take less than 1 s on the test machine (logged; P-R4-13).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 60 lines of code and 100 of tests (built tests and the real-room file are two files).

### T06. Wall stretch and boundary gap
- **Depends on:** none.
- **Files:** `packages/core/src/route-wall.ts` (new), `route-wall.test.ts` (new), `index.ts` (one export line).
- **Shapes:** `WallStretch`, `wallStretch`, `boundaryGapMm` (section 4.3). Defaults: `maxWallMm` 600, `minWallRunMm` 500, `stepMm` 100.
- **Must not touch:** `rooms/edit.ts` (`nearestEdge`), `rooms/clip.ts`.
- **Tests (core), built rectangles at 1 mm per point:**
  - Two rooms with a shared edge (gap 0): the stretch has `gapMm` 0 and `runMm` equal to the shared length (within 100 mm); the point lies on the shared edge.
  - Two rooms with a 300 mm gap: `gapMm` 300; the point lies in the middle of the gap (within 20 mm across).
  - A gap of 700 mm: null.
  - A shared run of 400 mm: null. A run of 600 mm: a stretch.
  - Two long runs: the longest wins.
  - A room inside a hole of the other room: a stretch (the hole is a boundary).
  - A stretch that crosses the first vertex of the ring (the run wraps): it is found as one run.
  - `boundaryGapMm`: 0 for touching rooms, 300 for the 300 mm gap, `Infinity` for an empty ring; the value is symmetric within 1 mm.
  - Far apart rooms: null at once (the bounding-box test; the test counts that it does no sampling by using a spy-free check: a large far-apart pair finishes in under 5 ms).
  - The input is not changed.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 100 lines and 80 of tests.

### T07. Crossings along a path
- **Depends on:** none.
- **Files:** `packages/core/src/route-crossings.ts` (new), `route-crossings.test.ts` (new), `index.ts` (one export line).
- **Shapes:** `WallCrossing`, `OpenRun`, `crossingsAlongPath` (section 4.3).
- **Tests (core), built rooms:**
  - A straight path through room A, a 300 mm wall, room B: 1 crossing, `fromRoomId` A, `toRoomId` B, `gapMm` between 300 and 400, the point within 100 mm of the middle of the wall, `atMm` within 100 mm of the true distance.
  - Touching rooms (gap 0): 1 crossing with `gapMm` 0.
  - A, B, C in a row: 2 crossings in order of `atMm`.
  - A path inside one room: none.
  - A gap of 1500 mm between rooms: 0 crossings and 1 `OpenRun` with `lengthMm` about 1500.
  - A path that leaves A and comes back to A through a gap: none.
  - A path that starts or ends outside every room: no crossing for the empty start or end.
  - A path on another page index: none. A path with one point or none: none, no throw.
  - Nested rooms (a room inside a bigger room): the smaller room wins at its samples (`roomsAtPoint` order), so the path from the big room into the small one gives 1 crossing with gap 0.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 90 of tests.

### T08. Graph helpers
- **Depends on:** T02 (types).
- **Files:** `packages/core/src/route-graph.ts` (new), `route-graph.test.ts` (new).
- **Shapes:** `GraphData`, `nearestOnEdges`, `splitEdgeAt`, `connectedParts` (section 4.3). `splitEdgeAt` keeps the order of the points, gives both new edges their share of `lengthMm`, and keeps `roomId`.
- **Tests (core):** the nearest point on a straight edge and on a bent edge (the right segment index); the filter skips edges; a point on an end node returns that node id and splits nothing; a split gives two edges whose `lengthMm` add up to the old length (within 1 mm) and whose point lists join at the new node; two parts and one part; the empty graph; the input graph is changed only through `splitEdgeAt` (documented), and `nearestOnEdges` and `connectedParts` do not change it.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 90 lines and 80 of tests.

### T09. `computeRouteArea` part 1: rooms, center lines, shaft nodes, empty cases
- **Depends on:** T02 (same file), T05b, T08.
- **Files:** `route-area.ts`, `route-area.test.ts`.
- **Shapes:** replace the stub: steps 1 and 2 of section 4.3, the node and edge ids of section 4.2 (center and shaft ids), `RouteAreaRoom.name` copied from `Room.name`, `parts` from `connectedParts`, `entries`, `links` and `unreached` stay empty until T10a and T10b. A path room with an empty center line gets one `end` node at `roomLabelPoint` (the fallback: a failed skeleton never blocks R6).
- **Tests (core):**
  - The four empty statuses (as T02, now through the real code); an empty room list; a list with an unknown id.
  - One 10 m by 2 m corridor: 2 `end` nodes, 1 edge, `parts` 1, `status 'ok'`.
  - A T of corridors: 4 nodes (3 `end`, 1 `junction`).
  - A shaft room: 1 node of kind `shaft` at `roomLabelPoint`.
  - A path room narrower than 300 mm: 1 `end` node at the label point.
  - Two far corridors: `parts` 2.
  - `rooms` lists the route-area rooms with `open` and `name` copied from the room.
  - Ids are stable: two calls give equal results (deep equal); all ids are different; the input is not changed.
  - The fallback: a path room for which `centerLineOf` gives no node (a built room 250 mm wide) still gets its `end` node, and `status` is `ok`.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 80 lines and 90 of tests.

### T10a. `computeRouteArea` part 2a: links and entries
- **Depends on:** T06, T09 (same file).
- **Files:** `route-area.ts`, `route-area.test.ts`.
- **Shapes:** steps 3 and 4 of section 4.3, with the ids of section 4.2 (`ry-`, `rk-`, `rw-`, `rt-`, `rc-`, and the rule for the two edges of `splitEdgeAt`). A helper `connectTo(graph, areaRoomId, point, nodeId, edgeId)` (private) connects a `wall` node to the nearest center edge (with `splitEdgeAt`) or to the shaft node. `primary` is set here. `shaft` is set on each entry and link.
- **Tests (core), built plans:**
  - A corridor with 3 offices on one side, a 300 mm wall: 3 entries, all `primary`, each `point` between the corridor and the office, each connector ends on the center line (a `tap` node on a center edge).
  - An office that touches two corridors: 2 entries, one `primary` (the longer run).
  - Two corridors that touch: 1 link.
  - A shaft that touches a corridor: 1 link with `shaft` true. A shaft that touches an office: 1 entry with `shaft` true.
  - A gap of 800 mm: no entry, no link.
  - Ids: two calls give equal ids; all ids are different; the two edges of a split follow the rule (first keeps the id, second is `E~<tapNodeId>`); a tap node and a connector edge follow `rt-` and `rc-`.
  - The input is not changed.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 90 lines and 90 of tests.

### T10b. `computeRouteArea` part 2b: unreached, parts, shaft cases
- **Depends on:** T10a (same file).
- **Files:** `route-area.ts`, `route-area.test.ts`, `route-area-shaft.test.ts` (new, the shaft cases).
- **Shapes:** steps 5 and 6 of section 4.3: `unreached` with `distanceMm` (from `boundaryGapMm`, rounded to 10 mm), and `parts` after the links.
- **Tests (core), built plans:**
  - A corridor with 3 offices: `unreached` empty, `parts` 1.
  - An office behind another office: no entry; it is in `unreached` with `distanceMm` equal to the gap to the corridor (within 20 mm).
  - Two corridors that touch: `parts` 1; the same two corridors 800 mm apart: `parts` 2.
  - `route-area-shaft.test.ts`: a shaft that touches no room: 1 `shaft` node, no entry, `parts` 1. A shaft that touches a corridor and an office: the `shaft` flags are right on the link and on the entry. A shaft with no other route-area room: `parts` 1.
  - The `unreached` list is empty when there is no route-area room (status not `ok`).
  - The input is not changed. The same input gives the same output.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 40 lines and 90 of tests.

### T11. The warnings
- **Depends on:** T10b.
- **Files:** `packages/core/src/route-area-warnings.ts` (new), `route-area-warnings.test.ts` (new), `index.ts` (one export line).
- **Shapes:** section 4.4.
- **Tests (core):** each rule with a built `RouteArea` (written by hand in the test, so the test does not depend on the geometry code): a status other than `ok` gives the status line and `draft-2d` only; `open-room` with a count and ids; `parts` 2 gives a warning and `parts` 1 gives none; `wall-crossings` counts non-shaft primary entries and non-shaft links (rooms that can be reached), with the points; two entries of one served room count once; `shaft-crossing` gives one line for each shaft room and does not count again in `wall-crossings`; `unreached` is info; `stair-name` gives a line for a route-area room named "Trappenhuis", "trap" or "TRAP 2" (case-insensitive) and none for "Gang"; a room with `name` null gives none; `draft-2d` is last; the order is errors, warnings, info; the severities are those of P-R4-09; the input is not changed.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 90 of tests.

### T12. The chain on real rooms (test only)
- **Depends on:** T01, T07, T11.
- **Files:** `packages/core/src/route-area-real.test.ts` (new). No product code.
- **Tests (core), with the loader of T01 and `mmPerPt` from the fixture:**
  - `computeRouteArea` with the default list: `status 'ok'`, 5 path rooms, 0 shaft rooms, at least 1 node per room, `parts` at least 1 (the test prints the measured value). The test also prints the `name` and the type of each route-area room (M3: a stairwell can hold the type Corridor) and `routeAreaWarnings` shows `stair-name` for a name with "trap" if one exists.
  - The number of entries with `primary` true is at least 10 of the 33 other rooms (the probe found 16 rooms within 500 mm; the test sets the exact lower limit from the measured value and writes it in a comment). The `unreached` list holds the rest. The test prints each one with its `distanceMm` (a room with a short run can be close and still unreached) and asserts only that no room is both an entry room and unreached.
  - **Independent check of the entries:** for each primary entry, the straight line from the nearest point of the center line (the other end of its connector edge) to `roomLabelPoint` of the served room has exactly 1 wall crossing in `crossingsAlongPath`. The test counts the share. The limit is the measured share rounded down to 5 %, and not below 70 %. The entries that fail are printed (room name and counts) for the review. **What this proves:** the two methods use the same polygons and `maxWallMm`, so the check proves consistency and not truth, and a straight line can cross a third room in an L-shaped room (section 3.4). **Under the 70 % floor:** the lead reports the share and the failing entries, and may lower the floor only with a written reason in the test and never below 50 % (section 3.4).
  - A list with `office` added: more path rooms, more nodes, no throw.
  - A list with `shaft` only: `status 'no-route-rooms'` (the first floor has no shaft).
  - A list with an unknown id: `status 'no-route-rooms'`.
  - `routeAreaWarnings` of the default result holds `open-room` (3 of the 5 corridors are open), `wall-crossings` with `count` equal to the non-shaft primary entries plus non-shaft links, `unreached`, and `draft-2d` last. No `shaft-crossing`.
  - A time guard: `computeRouteArea` takes less than 1 s on the test machine (logged; P-R4-13). Above 1 s the lead reports it and proposes the worker task.
  - The input is not changed (deep equal of the rooms).
- **Verify:** core tests; `pnpm build`. If a test finds a defect in T05a to T11, the task lead fixes it in this task (a few lines) or sends it back, and reports it.
- **Size:** about 120 lines of tests.

### T13. The overlay drawing and `RouteAreaView`
- **Depends on:** T11 (the type `RouteAreaWarning`; the file imports `RouteArea` and `RouteAreaWarning` from `@mepapp/core` and nothing from `scene.ts`).
- **Files:** `packages/render/src/routeAreaLayer.ts` (new).
- **Shapes:** `export interface RouteAreaView { area: RouteArea; warnings: RouteAreaWarning[] }` and `export function drawRouteArea(layer: Container, view: RouteAreaView | null, rooms: readonly Room[], pxPt: number): void` (pixi `Container` and `Graphics`, as `wallDebugLayer.ts`). `rooms` gives the polygon of each route-area room (the fill needs it; `RouteArea` holds room ids only). `pxPt` is the page size of one screen pixel (`1 / world.scale.x`). Order and colors: section 4.5 and P-R4-08. It removes the old children first (`removeChildren` and `destroy`, as `roomLayer.ts:13`). A `null` view or a status other than `ok` draws nothing. The fill uses `poly(...).fill(...)` and `cut()` for holes, as `roomLayer.ts:21`-`:22`.
- **Must not touch:** `scene.ts`, `roomLayer.ts`.
- **Verify:** `pnpm build` (the proof of the types). The picture is checked in T14b.
- **Size:** about 75 lines.

### T14a. The scene: list, cache, flag, layer, events, debounce
- **Depends on:** T11, T13.
- **Files:** `packages/render/src/scene.ts`, `packages/render/src/index.ts` (export `RouteAreaView` and `drawRouteArea` from `routeAreaLayer.ts`).
- **Shapes:** section 4.5 (all methods, the three events, the debounce of 300 ms, the compute-only-when-visible rule, P-R4-13). Place the fields next to the wall debug fields (`scene.ts:669`-`:680`), the layer handling next to `:860` and `:1108`, the events next to `:717`-`:722`, and the methods next to `getWallDebugState` (`:3452`). Add the three events to the event map (`routeAreaChanged`, `routeAreaVisibleChanged`, `routeAreaPendingChanged`, near `:548`). Clear the timer on dispose and on `documentActivated`.
- **Must not touch:** the room tools, `roomLayer.ts`, the route markers, `markDirty`, `serializeDocument`.
- **Verify:** `pnpm build` and `pnpm typecheck`. Core tests and UI tests still pass. The browser proof is T14b (T14a has no UI to click, and the check needs the helper of T14b).
- **Size:** about 100 lines of scene code.

### T14b. The shared browser setup and the scene check
- **Depends on:** T14a.
- **Files:** `.claude/roadmap/browser/r4-lib.mjs` (new), `t14-check.mjs` (new, in the work folder).
- **`r4-lib.mjs` exports:** `open` and `D` (from `lib.mjs`); `setupRooms(t, { pdf, scale, shaft })` (start, `openPdf`, `openAutoPlace`, `detect(scale)`, close the Auto-place dialog with Escape, read `listRooms()`, when `shaft` is true call `setRoomType([smallestNonCorridorRoomId], 'shaft')`, return `{ rooms, corridorIds, shaftId }`); `screenOf(page, p)` (as `r3-lib.mjs:14`); `colorPixelsIn(page, q, predicate)` (counts pixels in a 40 by 40 clip; the predicate gets r, g, b); `routeAreaView(page)` (reads `getRouteArea()`); `baseline(page)` and `sameAsBaseline(page, b)` (project JSON, `canUndo`, `isDirty`).
- **Must not touch:** product code.
- **Verify:** `pnpm build`. Browser check `t14-check.mjs` (setup with `setupRooms`, scale `50`, `shaft: true`; the dialog is not used; the flag is switched through the scene API, because the real menu item comes in T16):
  1. `getRouteArea().area.status` is `ok`; the rooms are the corridor rooms and the shaft room (kinds `path` and `shaft`), counted independently from `listRooms()` (type ids). `warnings` ends with `draft-2d`.
  2. `isRouteAreaVisible()` is false at first. A clip around a center node shows no teal and no purple pixel. After `setRouteAreaVisible(true)` it shows purple pixels (the center line) and the pixel buffer differs. After `false` the buffer is the first buffer again.
  3. `exportProject()`, `canUndo` and `isDirty` are equal before and after the flag changes (the baseline, taken after the setup).
  4. `setRouteAreaRoomTypes(['office'])` changes `rooms` to the office rooms. `setRouteAreaRoomTypes([])` gives status `no-types`, and the overlay shows nothing. `setRouteAreaRoomTypes(['shaft'])` on a drawing with a shaft gives only the shaft room (a `shaft` node and no center edge).
  5. The no-room case: a new page, a PDF with no Detect rooms run: status `no-rooms`; the warnings are `no-rooms` and `draft-2d`; no page error.
  6. Zoom: after `zoomChanged` (call the scene zoom API or a wheel event on the canvas before the dialog exists) the line width in screen pixels stays within 1 pixel (a pixel-count comparison at two zooms). If the check cannot make the zoom event it reports "not verified because <reason>".
  7. Switch the page or the document tab (`documentActivated`): the layer is redrawn, no error.
  8. Timing: the check prints the time of the first `getRouteArea()` call. It is under 1 s on the first floor (P-R4-13). Above 1 s the check prints a FINDING, and the lead proposes the worker task.
  9. Debounce: with the flag on, change a room type with `setRoomType`. At once, `isRouteAreaPending()` is true. After 600 ms it is false and `getRouteArea().area.rooms` shows the new room. With the flag off, the same change leaves the layer empty and `isRouteAreaPending()` stays false (no compute).
  Screenshots: `T14-route-area-first-floor`, `T14-route-area-empty`.
- **Size:** about 80 lines of helper script and 60 of check script.

### T15. Storage of the list and the wiring in `App.tsx`
- **Depends on:** T14b (the check uses `r4-lib.mjs`).
- **Files:** `packages/ui/src/routeAreaStorage.ts` (new), `packages/ui/src/routeAreaStorage.test.ts` (new), `packages/ui/src/App.tsx`.
- **Shapes:** section 4.6, "Storage". In `App.tsx`: `const [routeRoomTypeIds, setRouteRoomTypeIds] = useState<string[]>(() => loadRouteRoomTypeIds(...))` next to `uncheckedRuleIds` (`App.tsx:435`), a save effect, and an effect that calls `sceneRef.current?.setRouteAreaRoomTypes(routeRoomTypeIds)` when `ready` (the pattern of `:424`-`:428`).
- **Must not touch:** the project file, the room type library, `RouteDialog` (T19 passes the props).
- **Tests (UI):** nothing stored gives `['corridor','shaft']` and a new array each time; a stored list comes back; a stored `[]` stays `[]`; a stored text that is not JSON gives the default; non-string entries and doubles go; `saveRouteRoomTypeIds` with a storage that throws does not throw; the key is `mepapp.routeRoomTypes.v1`.
- **Verify:** UI tests; `pnpm build`. Browser check `t15-check.mjs`: a first run with `open({ seed: { 'mepapp.routeRoomTypes.v1': '["corridor"]' } })`, `setupRooms` with `shaft: true`: `getRouteAreaRoomTypes()` is `['corridor']` and the area has no shaft room. A second run with no seed: the list is `['corridor','shaft']`. A third run with the seed `[]`: status `no-types`. (This task adds no input control. The proof is the wiring from `localStorage` to the scene state. The input controls come in T16 and T19.)
- **Size:** about 40 lines and 50 of tests.

### T16. The menu switch
- **Depends on:** T15 (same file `App.tsx`).
- **Files:** `packages/ui/src/components/MenuButton.tsx`, `packages/ui/src/App.tsx`.
- **Shapes:** props `routeAreaVisible: boolean` and `onToggleRouteArea: () => void`. The item after "Route network…" (`MenuButton.tsx:169`), text "Show route area" or "Hide route area", disabled without a PDF. `App.tsx`: state `routeAreaVisible` set from the event `routeAreaVisibleChanged` and from `isRouteAreaVisible()` when the scene is ready; the handler calls `setRouteAreaVisible(!...)`.
- **Must not touch:** the debug menu item, `Route network…`.
- **Verify:** UI tests; `pnpm build`. Browser check `t16-check.mjs` through real inputs: setup as T14b. Open the menu: the item reads "Show route area" (match with `^\s*Show route area\s*$`). Click it: the pixel buffer around a center node changes (purple pixels appear), and the item now reads "Hide route area". Click again: the buffer is the first buffer. The `exportProject` JSON, `canUndo` and `isDirty` are equal before and after. Before a PDF is open the item is disabled (a second page load). Screenshot: `T16-menu`, `T16-route-area-shown`.
- **Size:** about 25 lines.

### T17. The texts and the line builders
- **Depends on:** T11. Runs in parallel with T13 to T16 (it changes `routePlan.ts` and `routePlan.test.ts` only).
- **Files:** `packages/ui/src/components/routePlan.ts`, `packages/ui/src/routePlan.test.ts`.
- **Shapes:** section 4.6, "Texts": the keys of the table, `routeAreaLines`, `routeAreaSummaryLine`, `routeAreaTypeChoices`. Use the severity label keys that exist (`severityError`, `severityWarning`, `severityInfo`).
- **Must not touch:** the R2 and R3 functions and texts.
- **Tests (UI):** every new key (section 4.6, including `areaTypesHint`, `areaCalculating`, `areaLegendGuide`, `warnStairName`) has an English and a Dutch text; each text, with sample parameters, has 140 characters or less (the draft text and the fire hint are the longest: the test checks them by name); no text holds "CFM" or "GPM", and no text holds "door" or "crossing" (R6 owns the word "crossing", and an entry is a "possible place for a branch"); the hint holds "fire walls" only inside the question "which of these walls are fire walls"; `routeAreaLines` fills `{count}` and `{room}`, keeps the order of the warnings, gives an empty `hint` where a code has none (`wall-crossings` and `shaft-crossing` have the fire hint), and uses `names.room` for the shaft room and for the `stair-name` room; the plural forms (1 and 2 or more) in both languages for the summary and for `warnWallCrossings`; `routeAreaSummaryLine` for 0, 1 and many rooms; `routeAreaTypeChoices` marks the types in the list, uses `roomTypeLabel` for the language (`room-type.ts:374`), keeps the library order, and keeps an id with no known type as its id text.
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 90 lines and 100 of tests.

### T18. The dialog section: lines, legend, show switch
- **Depends on:** T16, T17.
- **Files:** `packages/ui/src/components/RouteAreaSection.tsx` (new), `packages/ui/src/components/RouteDialog.tsx`, `packages/ui/src/theme.css`.
- **What it adds** (section 4.6, "Dialog section"): the `<details open data-testid="route-area">` as the last child of `route-body`, also in the branch with no equipment stamp; the check box `route-area-show`; the effect that sets the scene flag to true and restores the old value; the summary line; the lines with the severity label (`<strong class="mep-route-severity">`, the classes of R3: `mep-route-check-error`, `mep-route-check-warning`, `mep-route-check-info`); the legend with four colored squares and the line `areaLegendGuide`; the note `areaCalculating` while `isRouteAreaPending()` is true. The list control comes in T19: in T18 the section reads `scene.getRouteAreaRoomTypes()` (the one copy of the list, A12) and shows it as plain text (the chips). The section is inside `route-body`, so the refusal branch shows no section (A13).
- **Must not touch:** the R2 inputs and the R3 check block, the scope part, the markers.
- **Verify:** UI tests; `pnpm build`. Browser check `t18-check.mjs` through real inputs (setup as T14b, with the shaft; no canvas click while the dialog is open; the flag was false before):
  1. Open the dialog (menu "Route network…"). `route-area` is visible. The flag is true and the pixel buffer around a center node shows purple. `route-area-summary` holds the count of the route-area rooms (compared with an independent count from `listRooms()`).
  2. The lines: `route-area-line-draft-2d` shows with `data-severity="info"` and the text starts with "Note"; the text holds "Draft in 2D. Check height, clashes, clearances and slope yourself." `route-area-line-wall-crossings` shows with `data-severity="warning"` and "Warning"; its count equals the independent count of non-shaft primary entries plus non-shaft links from `getRouteArea()`; its hint holds "Check which of these walls are fire walls." No line text holds "door" or "crossing". `route-area-line-open-room` shows (the first floor has open corridors). If a route-area room has a name with "trap", `route-area-line-stair-name` shows with "Note" (otherwise the check prints that no such room exists and does not fail). The legend shows four labels and "The center line is a guide.".
  3. A real click on the check box `route-area-show` (off): the purple pixels go and the flag is false. On: they come back.
  4. Close with Escape: the flag is false again (its value before the dialog), the buffer is the first buffer. Open the menu switch (T16) first, then open and close the dialog: the flag stays true after the close.
  5. The dialog ignores the backdrop (R2 rule); the check does not click it.
  6. No equipment stamp in the drawing (the normal case here): the section shows; the R2 text "Place an equipment stamp first…" shows too.
  7. Dutch run at 400 px (`seed` of `mepapp.settings.labelLanguage.v1`): the lines show in Dutch; `scrollWidth <= clientWidth` of `.mep-modal--route`.
  8. `exportProject`, `canUndo`, `isDirty` equal after the close.
  9. Pending note: with the dialog open, call `setRoomType` on a room through the scene API (setup use only). `route-area-calculating` shows within 100 ms and goes away after 800 ms; the lines match `getRouteArea()` after that.
  Screenshots: `T18-section`, `T18-section-nl-narrow`.
- **Size:** about 130 lines. This is borderline. If the diff passes 150 lines, the lead splits it: T18a (the section, summary, lines, legend, pending note) and T18b (the check box and the effect that sets and restores the flag, with steps 3 to 5 of the check).

### T19. The room type list control
- **Depends on:** T18 (same file).
- **Files:** `packages/ui/src/components/RouteAreaSection.tsx`, `packages/ui/src/components/RouteDialog.tsx` (one prop), `packages/ui/src/App.tsx` (pass `onRouteTypeIdsChange={setRouteRoomTypeIds}`; no prop for the list, because the section reads `scene.getRouteAreaRoomTypes()`), `packages/ui/src/theme.css`.
- **What it adds:** the chips with a remove button, the select `route-area-add`, the hint `route-area-types-hint` ("Entrance and hall can carry a main.", no hint for technical rooms or stairwells) and the button `route-area-reset` (section 4.6). Chips and select use `routeAreaTypeChoices`. A change calls `onRouteTypeIdsChange`, which saves to `localStorage` (T15) and updates the scene.
- **Must not touch:** the storage code, the scene.
- **Verify:** UI tests (T17 covers the logic); `pnpm build`. Browser check `t19-check.mjs` through real inputs (setup as T14b with the shaft; the dialog open):
  1. The chips show Corridor and Shaft (`route-area-type`, `data-type-id`). `route-area-types-hint` shows the Entrance-and-hall hint.
  2. `selectOption({ label: 'Office' })` on `route-area-add`: a chip Office appears; `localStorage['mepapp.routeRoomTypes.v1']` holds `["corridor","shaft","office"]`; `route-area-summary` now counts the corridor, shaft and office rooms (independent count from `listRooms()`); the overlay changes (a pixel buffer around the center of an office differs from before).
  3. A real click on `route-area-remove` of the Office chip: the list and the count go back.
  4. Remove both chips: the lines show `route-area-line-no-types` ("Warning"); the overlay shows nothing; `route-area-reset` brings Corridor and Shaft back.
  5. Remove Corridor only: the lines show `no-route-rooms` or the shaft only, matching `getRouteArea()`; no page error.
  6. Dutch at 400 px: the chip labels use the Dutch room type names (`nameNl`); `scrollWidth <= clientWidth` of the dialog; the select options are Dutch.
  7. After the close, `exportProject`, `canUndo` and `isDirty` are equal (the list is not in the project).
  8. The persistence proof is the key in `localStorage` (a reload needs the PDF again). T20 repeats it with a seeded second browser.
  Screenshots: `T19-types`, `T19-types-nl-narrow`.
- **Size:** about 110 lines.

### T20. The part check
- **Depends on:** all tasks above.
- **Files:** `.claude/roadmap/browser/r4-check.mjs` (new). No product code. It imports `lib.mjs` and `r4-lib.mjs` with relative paths of its own folder and never reads `MEPAPP_PDF`.
- **What it does** (run 1: English, 1600 by 1000, `01_arch_first_floor.pdf`, scale `50`, shaft set):
  1. Setup with `setupRooms`. Baseline: `JSON.stringify(exportProject())`, `canUndo`, `isDirty`, `localStorage` keys.
  2. The model: `getRouteArea()`; the rooms equal the independent count from `listRooms()` (type ids `corridor` and `shaft`); every `end`, `junction`, `bend` and `tap` node lies inside its path room (`polygonContainsPoint` evaluated in the page from the exported rooms); at least 10 primary entries; the warnings hold `wall-crossings`, `shaft-crossing` (for the made shaft, if it touches a route-area room or another room; otherwise the check prints "the made shaft has no wall stretch" and does not fail) and `draft-2d` last. The check prints the `name` of each route-area room, and the line `stair-name` shows if a name holds "trap". The check prints the counts.
  3. The menu switch with a real click (T16 steps), pixels, labels.
  4. The dialog (T18 steps 1 to 4, T19 steps 1 to 4), in English, with real clicks and the select. The `Warning` and `Note` labels show.
  5. Close with Escape and with the Close button. Compare with the baseline: `exportProject` equal, `canUndo` equal, `isDirty` equal, and the `localStorage` keys equal except `mepapp.routeRoomTypes.v1` (the check expects exactly that difference or none).
  6. Empty cases: remove both chips (`no-types`), then a second browser (run 2) with no Detect rooms run (`no-rooms`), and a seeded browser with `["shaft"]` on the first floor with no shaft made (`no-route-rooms`). No page error. No overlay pixel in each.
  7. Run 3: Dutch at 400 px (seed `mepapp.settings.labelLanguage.v1` = `nl`): the section shows Dutch texts, `scrollWidth <= clientWidth`.
  8. Run 4: `plattegrond begane grond 10A.pdf` (scale 1:100) with `detect('100')`. The option `100` exists (`PRESET_SCALE_DENOMINATORS`, `calibration.ts:74`). Expect at least 1 path room and at least 1 shaft room (the probe found "gang" and 3 "schacht"). Print the time of the first `getRouteArea()` call. The limit is 1 s (P-R4-13). Above 1 s the check prints a FINDING for the lead (the worker task) and fails only above 5 s. Screenshot. If the app finds other rooms than the probe, print them as a FINDING and do not fail on the count, only on a status other than `ok`.
  9. Persistence (run 5): a seeded browser with `["corridor"]` shows no shaft rooms in the dialog chips.
  10. `no page errors` (`finish()` of `lib.mjs`).
- **Screenshots:** `T20-area-first-floor`, `T20-dialog-section`, `T20-dialog-types`, `T20-dialog-nl-narrow`, `T20-area-10A`, `T20-empty`.
- **Verify (the tester runs each command alone):**
  1. `pnpm --filter @mepapp/core test`
  2. `pnpm --filter @mepapp/ui test`
  3. `pnpm typecheck`
  4. `pnpm build` fresh (the R3 part check forced a build with no cache; use `pnpm build --force`; not verified: that Turbo passes the flag, so the tester reads the "cached" count in the output and reports it).
  5. `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r4-check.mjs` exits 0.
  6. **No regression:** `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r2-check.mjs` and then `.../r3-check.mjs`, one command each, each exits 0 (R2: 66 of 66 and 10 of 10; R3: 44 of 44 and 7 of 7, from the R3 table). The tester reports the totals.
- **After the check:** the director marks R4 done in this file, with the commit hash of each task and the verification, in the style of `auto-routing-r2.md` and `auto-routing-r3.md`.

## 7. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T01 | yes (loader) | no | yes | no | none |
| T02 | yes | no | yes | no | none |
| T03 | yes | no | yes | no | none |
| T04 | yes | no | yes | no | none |
| T05a | yes | no | yes | no | none |
| T05b | yes (built and real rooms) | no | yes | no | none |
| T06 | yes | no | yes | no | none |
| T07 | yes | no | yes | no | none |
| T08 | yes | no | yes | no | none |
| T09 | yes | no | yes | no | none |
| T10a | yes | no | yes | no | none |
| T10b | yes | no | yes | no | none |
| T11 | yes | no | yes | no | none |
| T12 | yes (real rooms) | no | yes | no | none |
| T13 | no | no | yes | no (proof in T14b) | none |
| T14a | yes | yes | yes (and `pnpm typecheck`) | no (proof in T14b) | none |
| T14b | no | no | yes | `t14-check.mjs` | `T14-*` |
| T15 | no | yes | yes | `t15-check.mjs` (state wiring) | none |
| T16 | no | yes | yes | `t16-check.mjs` | `T16-*` |
| T17 | no | yes | yes | no | none |
| T18 | no | yes | yes | `t18-check.mjs` | `T18-*` |
| T19 | no | yes | yes | `t19-check.mjs` | `T19-*` |
| T20 | yes | yes | yes (fresh) | `r4-check.mjs`, `r2-check.mjs`, `r3-check.mjs` | `T20-*` |

The check scripts live in the work folder of the task, except `r4-lib.mjs` and `r4-check.mjs`, which stay in `.claude/roadmap/browser/`.

## 8. Where R4 stops and the next parts start

R4 gives: `computeRouteArea` (center-line graph, possible places for a branch (entries and links), unreached rooms, parts), `routeAreaWarnings`, `crossingsAlongPath` (a pure function that only R6 calls; R4 builds no path and counts no real crossing), the scene read `getRouteArea()` with the list, the flag and the overlay, the storage of the list, the menu switch and the dialog section with the list control.

- **R5** (sizing) does not use R4.
- **R6** (the shape of the network) reads `RouteArea`: it picks the start node from the start stamp (the nearest node or `shaft` node), searches the graph, uses the `primary` entry of each served room as the place of the branch, and calls `crossingsAlongPath` on its own preview to warn about walls. R6 decides how to serve a room in `unreached` (through another room, or no branch) and what a re-run does. R6 adds the `routedBy` marks. R4 gives R6 the graph and nothing else.
- **Not in R4:** a path search, a segment, a size, a stored area, a door, a height (the 2D draft note is the answer to G10), a fire compartment, the wall lines of the filter, a notice at load.

## 9. Risks and what is not verified

- **R-1 Room detection quality.** The route area is only as good as the rooms. On the first floor, 3 of 5 corridors are flagged open and their area is 25 to 33 % smaller than the printed area. The center line of an open corridor can be wrong. The `open-room` warning says so. A user can fix a room in the Rooms tab (the room type, or the outline).
- **R-2 Split corridors.** Room detection can cut one corridor into several rooms (the first floor has 5 rooms named "Verkeersruimte"). Pieces that touch are joined by links. Pieces that do not touch give `parts` above 1, and the `parts` warning. Not measured: how many parts the first floor gives. T12 prints it.
- **R-3 False and missed places.** An open archway gives a false entry (the safe side). A wall thicker than 600 mm gives a missed entry. The lift (567 mm) and a toilet (532 mm) on the first floor are near this limit. `maxWallMm` is a parameter of the core function. R4 has no control for it. The user can ask for one later.
- **R-4 Rooms behind rooms.** On the first floor, 15 to 17 of 33 rooms have no wall with a corridor (15 lie 766 mm or more away; 2 lie at 532 and 567 mm, near the limit). R4 lists them as `unreached` with their distance. How to serve them is an R6 question.
- **R-5 Halls.** A hall (room type Entrance and hall) gets a center line that is only a guide. The medial axis fits long corridors better than wide halls (ISPRS source, summary only). The user can add the type to the list. R4 does not improve the line for a hall.
- **R-6 Skeleton ends.** A center line stops about half a corridor width before the end wall. R6 must connect a branch to the nearest point, not to an end node only.
- **R-7 Performance.** Not measured in the app: the cost of `computeRouteArea` on a large drawing. The probe ran the room detection (seconds) but not the new code. `computeRouteArea` runs on the main thread. T05b and T12 log the time, T14b and T20 print the time for the first floor and 10A. The limit is about 1 s (P-R4-13). The scene computes only when the overlay is visible, waits 300 ms after a room edit, and shows a "calculating" note. If a check shows more than 1 s, the lead reports it and a new task moves the call into the room worker (`packages/core/src/rooms/worker.ts`). The plan does not assume this.
- **R-8 The 10A scale.** The probable cause of "0 stamps on 10A" is the scale 1:50 in `lib.mjs` (section 3.1). Not verified in the app. T20 run 4 uses `detect('100')`; the option exists (`calibration.ts:74`).
- **R-9 The shaft case on the first floor.** The first floor has no Shaft room. The checks make one with `setRoomType`. A made shaft may touch no other room. The check then reports it and does not fail. The shaft logic has built-case tests (T10a, T10b, T11) and the 10A run.
- **R-10 The size of the fixture.** Not verified: the size of `first-floor-rooms.json`. Polygons of 38 rooms with up to 29 vertices should give some tens of KB.
- **R-11 Dutch.** The Dutch texts, including the term for "route area", need a Dutch speaker (P-R4-11).
- **R-12 One list for all drawings.** The list is a setting of the browser (Q-R4-01). A shared project can show another route area on another machine.
- **R-13 Not verified: a real multi-page PDF.** R4 does not plan on one. The refusal of R2 stays as R2 left it. The route area works on the active page only (`pageIndex` of the scene).
- **R-14 Not verified: `pnpm build --force`.** The exact flag for a build with no cache (T20, step 4).
- **R-15 The units of the calibration.** `room.ts:68` says that `pageUnitsPerRealUnit` is points per mm. The scene uses it so (`scene.ts:3500`). A calibration in another unit would shift every distance. Not verified: that the app can store another unit.
- **R-16 The sources.** Only search summaries were read, not the papers or the code documents (section 3.2). Bouwbesluit 2012 chapter 2 and NEN 6068 are named from memory of the domain check; clause numbers are not verified.
- **R-17 Stairwells in the route area.** A stairwell can have the room type Corridor, and the Bouwbesluit term "verkeersruimte" covers both. The `stair-name` note tests the room name for "trap". It misses a stairwell with another name. A stairwell also has its own room type (`stairs`, `room-type.ts:166`), which is not in the default list.
- **R-18 What the T12 check proves.** It proves consistency of two methods on the same polygons, not truth (section 3.4). Only a person who looks at the screenshots can judge the real building.

## 10. Round 1 of the audit: what changed

| Item | Change |
|---|---|
| A1 | `drawRouteArea` gets `rooms` (T13, section 4.5, P-R4-18). |
| A2 | `RouteAreaView` lives in `routeAreaLayer.ts`; T13 depends on T11. |
| A3 | T05 split into T05a and T05b. |
| A4 | T10 split into T10a and T10b. |
| A5 | T14 split into T14a and T14b. T18 is borderline; the split is written in its size note. |
| A6 | Crossing number for junctions (section 4.3, P-R4-14); diagonal test in T04. |
| A7 | P-R4-13: compute only when visible, 300 ms debounce, 1 s limit, pending note, worker task above the limit. Guards in T05b, T12, T14b and T20 are now 1 s. |
| A8 | Warning reworded (section 4.4, M1); the R4 row of the overview records the rooms-only rule (P-R4-03). |
| A9 | Id formats in section 4.2 (P-R4-15). |
| A10 | Section 3.4 and T12 say what the check proves and what the lead does under the floor. |
| A11 | T01 file list has `route-area-fixture.test.ts`. |
| A12 | The list lives in App state and in the scene. The section reads `scene.getRouteAreaRoomTypes()`; no list prop. |
| A13 | The refusal branch shows no section; the menu switch still works (sections 2 and 4.6). |
| A14 | The "not verified" on the scale option 100 is gone (`calibration.ts:74`). |
| M1 to M7 | Texts and notes: sections 3.2, 4.4, 4.6; P-R4-16 and P-R4-17. |

## 11. Revision 2026-10-17: no new Dutch text (note of the user)

The user wrote on the dashboard: "There is no need to include Dutch names anywhere in the UI. The user can switch to stamps with a Dutch name and that is fine for now. If we need more Dutch in the app then we will add this later, it should not be part of these tasks."

This overrides P-R4-11 and P-R4-17 and every Dutch item in T17 to T20:

- New texts of R4 have an English text only. If the type of `TEXTS` in `routePlan.ts` needs a Dutch entry, the Dutch entry holds the same English text. No new Dutch wording is written.
- No test checks Dutch texts, the Dutch length of 140 characters, or a Dutch plural form. The English checks stay.
- No browser run in Dutch and no Dutch screenshot (`T18-section-nl-narrow`, `T19-types-nl-narrow`, `T20-dialog-nl-narrow` are dropped). The English 400 px run stays.
- Room type names still follow the language of the label setting. That is existing data, not new text.
- Risk R-11 (Dutch speaker) and the "Routegebied" question are removed from R4. They return when the user asks for more Dutch.
- Texts of R2 and R3 that already have Dutch stay as they are. The user did not ask to remove them.
