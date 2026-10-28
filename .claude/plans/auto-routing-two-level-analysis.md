# Analysis: the hand route against the auto route (P2 input)

Date: 2026-10-28. Floor: `00_arch_ground_floor_w_rooms.pdf` (22 served rooms, 58 terminals, 1 pt = 17.64 mm). Source of the numbers: a diagnosis worker. The manual route is read from the vector strokes of `..._route_manual.pdf` (no segment data in its JSON). The auto route is read from the project JSON of `..._route.pdf`. The auto PDF does not store its planner options. Assume the default plan.

Work folder (not in git): the scratchpad `p2-analysis/` with `side-by-side.png`, `results.json`, and the scripts.

## Numbers (manual / auto)

| Metric | Manual | Auto |
|---|---|---|
| Length | 234.0 m | 278.4 m (+19 %) |
| Bends | 12 (all 90 deg) | 89 (70 at 90 deg, 19 at 45 deg) |
| Bends in served rooms | 6 | 23 |
| Bends in corridor rooms | 5 | 61 |
| Tees / crosses | 37 / 10 | 51 / 4 |
| Straight pieces of 5 m or more | 7 (longest 28.2 m) | 11 (longest 9.8 m) |
| Bends on the path from the unit to a terminal | mean 4.0, max 5 | mean 12.0, max 24 |
| Path length / Manhattan distance | 1.23 | 1.56 |
| Rooms with more than 1 entry | 2 | 7 |
| Chained rooms | 0 | 3 |

Main run (blue): 89.3 m in 6 straight strokes. West spine x=821.5 (28.2 m), north line y=916 (21.7 m), cross line y=2260 (14.3 m), east spine x=1634 (19.3 m), line y=2430 (4.3 m), a 1.5 m stub from the unit. 24 room branches meet it at tees. 8.1 m of it crosses the entrance room-15.

## Rules of the hand route

- R1. The main run is a few long straight lines, one for each row or column of rooms, 0.6 to 1.4 m from the corridor-side walls. They meet at tees. The run is a tree. It does not follow the corridor centre line.
- R2. Every terminal lies within 4.8 m of a main-run line. The rooms form 5 groups: west column, north row, south row, east column, south-east corner.
- R3. A room with one terminal gets one straight line, perpendicular to the nearest main-run line. The tee is the projection of the terminal. 12 of 12 rooms: 0 bends. (Exception room-37: 2.9 m, not the shortest 2.1 m. Cause not proven.)
- R4. The wall crossing follows the terminal, not the wall centre. Crossings sit at 0.49 to 0.51 of the shared wall for mid-room terminals, and at 0.64 to 0.94 for others. The model has no door data. The crossings are not checked against real doors.
- R5. A room with several terminals gets a comb: one straight spine from the main run, teeth at right angles to the terminals. A bar through 2 terminals is hit at its middle. Rooms 5 and 24 (6 terminals): 0 bends, 1 entry.
- R6. A room with 6 or 8 terminals in rows parallel to the corridor wall is split into blocks of 2 by 2. Each block gets its own straight feed at its middle (rooms 22 and 26). The exact condition is not proven.
- R7. The comb stem runs parallel to the wall only when the corridor wall is parallel to the rows. It ends past the last row, turns 90 deg, and goes to the main run (room-20, 1 bend).
- R8. The tee is the foot of the perpendicular from the feed. The branch does not slide along the main run. Largest offset 0.06 m.
- R9. A room with no wall to a corridor still gets a straight branch. It passes through the rooms in between that no terminal needs (entrance, technical room).
- R10. No branch passes through another served room. Manual: 0 chained rooms.
- R11. All bends are 90 deg. No 45 deg leg.
- R12. Bends are rare. They sit at the end of a spine or a main-run line.

## Check against `rules.md` section 3

No rule conflicts. The new mode writes segments and fittings with the existing routing path. It must keep the port rule (a segment sets the type of a port) and the cascade (one run, one network type). No new stored field is needed if the mode stays an option of `RouteLayoutOptions`.

## Metric assertions for the test (manual numbers as the target)

Bends in rooms at most 6. Bends in corridors at most 5. No 45 deg leg. 0 chained rooms. At most 2 rooms with several entries. Every single-terminal branch is straight. Length at most 234 m (allow a margin). Mean bends on the path from the unit at most 4.

## Open points for the user

- Are the crossings of the hand route real doors? (R4, R9)
- Room-37 exception (R3). The split condition of R6.
- The main run may cross a room that is not a corridor (entrance room-15, technical rooms). The planner today allows only the route area.
