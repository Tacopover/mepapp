# Placement guide follow-up: performance, wall distance, ceiling grid, room-type demands — plan

Follow-on to `room-placement-guide.md` (all phases done, branch `worktree-room-placement-guide`, not merged). This plan continues on the same branch.

Source: user test feedback, 2026-10-10. The research for Phase F is in `room-demands-research.md` (same folder).

## 1. Findings (measured 2026-10-10)

- **Freeze.** The guide recalculates the sample room on each key press, on the main thread. A browser profile of the example lighting rule (19 rooms, office 23.8 m²) showed this:
  - When the user selects the capacity "3600" and types "3", the capacity is 3 lm. The room then needs 8259 stamps. That one key press took 102 s, and 88.5 s of that time was in `nearestValidPoint` (placement-layout.ts).
  - The capacity "36" gives 689 stamps and took 2.8 s. The capacities "360" and "3600" took 1–2.5 s in the headless test browser. Most of that time was browser overhead, not MepApp code.
  - In node, the grid code for 8334 stamps took only 69 ms. Even spread took 3.1 s.
- **"Later changes are faster" is not correct.** The time depends on the value in the field after each key, not on the number of changes. The first key after a select-all leaves a small number (for example "3" lm), so the room gets thousands of stamps. A later edit, such as a change of the last digit, keeps the number large, so the count stays small. Three repeats of the same edit took 109–120 s each, so the browser does not get faster after a warm-up.
- **Wall distance.** The min distance between stamps never changes the positions (checked in core, 2026-10-10). A grid puts each stamp at the center of its cell. So the outer stamps are half the stamp spacing from the wall, and a wall distance of 0 m moves nothing. The wall distance is a minimum, not a position.
- **Lighting today.** required lm = Em × A ÷ (UF × MF), and count = ceil(required ÷ lm per stamp). Em, UF and MF are fixed numbers in the rule. MepApp does not use the working-plane height, the room index or the ceiling height.

## 2. Decisions (user, 2026-10-10)

- Grid wall distance: **a setting per rule**. "Half the spacing from the wall" is the current behaviour. With "At the min distance to the walls", the outer stamps sit exactly at the wall distance.
- Ceiling grid snap: stamps snap to the **tile center**.
- Ceiling grid origin: the grid is **centered in the room** along its main axis.
- Order: **performance first** (Phase D), then the wall distance and the ceiling grid (Phase E), then the room-type demands (Phase F).

## 3. Decisions made in this plan (the user can change them)

- The preview waits **400 ms after the last key**, or until Enter or a focus change. The input box shows each key at once.
- The calculation runs in a **Web Worker**, which is a background thread of the browser. The core layout code is pure, so it runs in the worker without the scene. The main thread sends the room polygons and room values. When a new request comes while the worker is busy, MepApp stops that worker and starts a new one. So a long job never blocks the next one.
- **A limit of 1000 stamps per room.** Above the limit, MepApp makes no layout for that room. The row gets the warning "N stamps: too many to place. Check the values." Place skips that room. The limit protects the preview and Place.
- The ceiling grid snap **never changes the count** ("these settings change only where", the same rule as the spacing). Two stamps never share one tile: the second stamp goes to the nearest free tile. When the room has fewer valid tiles than stamps, the row gets a warning.
- The ceiling grid snap applies to Center, Grid and Even spread. With Along the walls, the setting is off.

## 4. Phases

### Phase D — Performance: no freeze while typing

STATUS: DONE 2026-10-10, commit 39c46e6. Verification:
- All package tests pass (core 853, ui 101). `pnpm typecheck` and `pnpm build` pass.
- New core tests:
  - the point lookups give the same results as the old full scans;
  - a room above 1000 stamps gets `tooMany` and no stamps;
  - the worker client cancels a running job, falls back to the main thread without a worker, and reports a worker error.
- Browser check of the lighting rule (dev server, 9 of 9 checks, no page errors):
  - typing "3000" over "3600" in the capacity box: each key takes 18–110 ms (median about 20 ms) in the dev build; the "3" took 102 s before;
  - "3" lm: the room needs 8259 stamps; the sample room shows no stamps, the note "more than 1000 stamps", and step 3 says "19 rooms: too many stamps";
  - whole floor at 36 lm: 5790 stamps, drawn as simple marks; keys take 16–30 ms during the job; a CPU profile of the main thread shows 1–2 ms in the layout code;
  - step 6 shows the table and "Save and place 118 stamps".
- The Phase C browser check passes 33 of 33 (it now waits until "Calculating…" goes away), and the feedback round 1 check passes 9 of 9.
- Production build: the bundled `placement.worker-*.js` loads under `vite preview` and answers a plan request (3 stamps).
- In node (core only), an L-shaped room with Grid: 1000 stamps take 0.26 s, and 8259 stamps take 2.7 s.

Changes made during the work (not in the steps below):
- The worker protocol and the client are in core (`rooms/placement-worker.ts`), the same pattern as room detection. The app makes the worker (`apps/web/src/placement.worker.ts`) and passes the factory through `MepSketchApp` → `PlacementRulesDialog` → the guide.
- The guide uses three clients: the sample room, the whole floor (steps 3–5) and step 6. Each has its own worker, so a floor job never cancels the sample job.
- The guide keys the settled draft by its content: a value that comes back (36 → 360 → 36) starts no new job.
- `nearestValidPoint` caches the valid grid samples per room polygon and offset. The preview caches the SVG path of each room.
- Not changed: Menu › Auto-place stamps… still calculates on the main thread. The 1000-stamp limit also applies there.
- Not tested: the Tauri desktop build.

- **Wait for the typing to stop.** The guide keeps two values: the typed draft (the input boxes) and the settled draft (all calculations). The settled draft follows the typed draft 400 ms after the last key, or at once on Enter or a focus change. Save and Place use the typed draft and check it first.
- **Background calculation.** A worker module (`packages/ui/src/placementWorker.ts`, or in core) runs `planAutoPlacement` for the sample room, for the whole floor (steps 4 and 5, Whole floor view) and for step 6. Each request has a number. MepApp ignores a result with an old number. Vite builds the worker with `new Worker(new URL(...), { type: 'module' })`. Check that the Tauri build loads it too.
- **Indicator.** While a job runs, the plan panel shows "Calculating…" and the old stamps stay dimmed. The step list shows the old state with a "…" mark.
- **Faster code.**
  - `nearestValidPoint` and `layoutGrid`: use a spatial hash (a lookup of points by grid cell) for the "taken" points, so the check does not scan all placed stamps for each sample.
  - `hasCloserPair`: use the same hash.
  - `RulePreviewPlan`: above about 300 stamps, draw a simple mark instead of an `<image>` per stamp.
- **The 1000-stamp limit** per room (§3), in core: `planAutoPlacement` returns the warning `tooMany` and no stamps for that room.
- Verification:
  - The browser profile of §1 again: the "3" key in the capacity box takes < 50 ms on the main thread; the result for 8259 stamps shows the limit warning; the input stays responsive during a job.
  - The Phase C browser check (33 checks) still passes.
  - A test for the limit and for the hash-based checks (same positions as before for the core test rooms).

### Phase E — Wall distance mode and ceiling grid

STATUS: DONE 2026-10-10, commit b37ab37. Verification:
- All package tests pass (core 869, ui 101). `pnpm typecheck` and `pnpm build` pass.
- New core tests: the edge positions at 0 and 40 pt, one column at the center, the three grid styles with 'wall', a rotated room; the tile center at the room center, the nearest tile, no shared tiles, the wall distance, `full`, a rotated grid; Grid only uses the edge; the snap keeps the count; Along the walls ignores the grid; `gridFull`; the parser and the validation.
- Browser check (dev server, 12 of 12 checks, no page errors), Supply air example rule:
  - Grid with "At the min distance to the walls" at 0 m: in each room with 2 or more stamps, the nearest stamp is 0 mm from the wall;
  - a 600 mm grid at 0.3 m: all 22 placed stamps are at a tile center (1 mm tolerance), no two share a tile, and each is at least 0.3 m from the walls;
  - the sample room draws the tile lines; Custom 1000 mm changes them; the rule summary shows both settings; the guide opens the saved rule with no changes.
- The Phase C check (33 of 33), the feedback round 1 check (9 of 9) and the Phase D check (9 of 9) still pass.

Changes made during the work (not in the steps below):
- The grid has a tile center (not a tile line) at the center of the room's bounding rectangle.
- With an offset of 0, a point on a wall is a valid placement point (`isValidPlacementPoint`). Before, the ray test called some wall points outside, so they moved.
- With 'wall' and Staggered, the step is usable ÷ (n − 0.5), so the odd rows stay inside.
- The stamps take their tiles in layout order.

- **Data**, in `PlacementLayout`:
  - `edge?: 'halfSpacing' | 'wall'` (Grid only; absent = 'halfSpacing');
  - `ceilingGridMm?: number` (absent = off).
  - The rule parser and the validation get the two fields. Old rules keep their behaviour.
- **Edge 'wall'.** In `gridCells`, with n columns over the usable length: the spacing is usable ÷ (n − 1), and the first stamp is at the min distance to the walls. One column stays at the center. The rows work in the same way.
- **Ceiling grid.** Tiles of size g × g along the main axis of the room (its smallest bounding rectangle). The grid is centered on that rectangle. After the layout, each stamp moves to the nearest valid tile center (inside the room, at least the wall distance from each wall, not taken). The moves never change the count. Fewer valid tiles than stamps gives the warning `gridFull`, and those stamps keep their positions.
- **UI**, in step 5 (Layout):
  - for Grid: radio cards "Half the spacing from the wall" and "At the min distance to the walls", each with a picture;
  - a check box "Snap to a ceiling grid", with a list of 300, 600, 900, 1200, 1500, 1800, 2100 and 2400 mm, and Custom (a number box in mm);
  - the sample room draws the ceiling grid lines;
  - the step 4 note about the min distance to the walls explains the edge setting.
- **The rule summary** in the rule list shows the edge setting and the ceiling grid.
- Verification:
  - Core tests: the edge positions for a rectangle (wall distance 0 and 1 m); the tile centers for a centered 600 grid; no shared tiles; `gridFull`; Along the walls ignores the grid.
  - Browser check: a lighting rule with a 600 mm grid. Each placed stamp is at a tile center, with a tolerance of 1 mm on the page in real units. With wall distance 0 and edge 'wall', the outer stamps are 0 m from the wall.

### Phase F — Room-type demands and better calculations

STATUS: planned 2026-10-10 (details below). Source: `room-demands-research.md` §8–§9.

Decisions made in this plan (the user can change them):
- The room type gets **10 number demands** that a calculation uses: `illuminanceLx`, `workingPlaneHeightM`, `supplyPerPersonDm3s`, `supplyPerM2Dm3s`, `exhaustFixedDm3s`, `airChangesPerH`, `heatingLoadWm2`, `coolingLoadWm2`, `socketsPerPerson`, `socketsFixed`. The info fields and the class fields of research §8 (Uo, UGR, set points, CO2, emergency lighting, fire detector, sprinkler class) wait: no calculation uses them yet.
- The built-in room types stay without values ("no design values"). The Room Types dialog gets a button "Fill in the example values" for the 8 types of research §8 (Dutch new build, marked as examples).
- An amount term (per room, per person, per area, air changes) takes its number **from the rule or from a room-type demand**. With a demand, the rule number is the fallback for a room type without the demand. Without both, the row gets the warning `noDemand` and no count, as `noPeople` today. A room cannot override a demand in this phase.
- Units: a flow demand (dm³/s) is converted to the flow unit of the rule. A W/m² demand works with W and kW. A count demand (sockets) works with any other unit. The guide lists only the demands that fit the unit.
- Lighting: Em comes from the rule or from the room type (rule value = fallback). UF is fixed, or comes from the room index with a table k → UF in the rule (linear between the points, the end values outside). h_m = ceiling height − suspension − working-plane height. The working-plane height comes from the room type, else the rule (default 0.75 m). SHR spacing waits.
- By coverage gets a direct **max radius** (NEN 2535 D). Coverage bands wait.
- An amount rule can **also meet coverage limits**: the count is max(amount count, coverage count). The layout starts with the amount count and adds stamps until each point is covered.
- The example rules are fixed: toilet exhaust 7 dm³/s; smoke detector max radius 5.8 m and max area 60 m², no spacing or wall limit.

#### F1 — Room-type demands

STATUS: not started.
- Core: `RoomDemands`, `ROOM_DEMAND_FIELDS` (label, unit, kind, the term it fits), `ROOM_TYPE_DEMAND_EXAMPLES`; `RoomType.demands`; parse and validate (each value a number of 0 or more); `RoomValues.demands` (a copy from the room type).
- UI: the Room Types dialog shows a "Demands" group with a box per demand and the example button.
- Verification: core tests for parse, validate and the values; a browser check that a saved demand comes back after a reload.

#### F2 — Calculations that use the demands

STATUS: not started.
- Core: `PlacementAmount.from` (term → demand key); `LightingInputs.luxFrom`, `ufTable`, `suspensionM`, `workingPlaneHeightM`; `RoomRequirement.terms` and `.lighting` (the values that the calculation used, for the guide); the warning `noDemand`.
- UI step 3: a source list per term ("In this rule" or a demand), the room-type value of the sample room, and a box per room type without the demand (as for the area per person). Lighting: the Em source, "UF: fixed or from the room index" with an editable table, the suspension and the working-plane height. The Why box shows k and UF.
- Verification: core tests for each source, the units, the fallback, `noDemand`, k and the UF table; a browser check with one supply-air rule over offices and meeting rooms that gives the two Bbl values.

#### F3 — Coverage radius, amount + coverage, example fixes

STATUS: not started.
- Core: `CoverageLimits.maxRadius`; `PlacementRule.alsoCoverage`; planAutoPlacement starts the coverage layout from the amount count; `countSource` says which one gave the count.
- UI: the max radius box; for an amount preset a check box "Also cover each point of the room" with the coverage boxes; step 5 and the Why box explain the count.
- Example fixes (§ decisions). A stored copy of an old example stays as the user saved it.
- Verification: core tests; a browser check of a lighting rule with a coverage limit in a corridor.

## 5. Risks

- The worker gets plain data only. The room values (persons, ceiling height) must be computed on the main thread and sent with each job. A change of a room type must start a new job.
- Snapping to tiles can push stamps closer together than the min distance between stamps. The step 4 check then shows that.
- The Phase F data model change affects stored rules and room-type libraries. It needs a migration, and the import and export of rules must handle it.
