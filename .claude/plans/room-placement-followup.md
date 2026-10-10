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

STATUS: not started.

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

STATUS: not started.

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

STATUS: not started. Plan the details after Phase E, from `room-demands-research.md` §8–§9. Short version:

- `RoomType` gets optional `demands`, for example `illuminanceLx`, `workingPlaneHeightM`, `supplyPerPersonDm3s`, `supplyPerM2Dm3s`, `exhaustFixedDm3s`, `airChangesPerH`, `heatingLoadWm2`, `socketsPerPerson` and `fireDetector`. The Room Type dialog edits them. The research file has a table of defaults for 8 common room types.
- Each amount term of a rule can take its number from a room-type demand, so one rule serves all room types. A room or the rule can override the number.
- Lighting:
  - Em and the working-plane height come from the room type;
  - the room index is k = 2A ÷ (h_m × P), with h_m = ceiling height − suspension − working-plane height;
  - UF comes from a table k → UF in the rule, with a fixed UF as the fallback;
  - an optional max spacing SHR × h_m.
- By coverage: a direct radius (NEN 2535 D). Optional bands that depend on the room area and the ceiling height.
- A new calculation "Amount + coverage": count = max(amount count, coverage count).
- Fix the two example rules that the research found:
  - toilet exhaust 25 dm³/s → 7 dm³/s;
  - smoke detector: radius 5.8 m.

## 5. Risks

- The worker gets plain data only. The room values (persons, ceiling height) must be computed on the main thread and sent with each job. A change of a room type must start a new job.
- Snapping to tiles can push stamps closer together than the min distance between stamps. The step 4 check then shows that.
- The Phase F data model change affects stored rules and room-type libraries. It needs a migration, and the import and export of rules must handle it.
