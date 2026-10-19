# R6 plan: the shape of the network (route a main, a branch for each room and a sub-branch for each port)

Status: PLANNED 2026-10-18 by the road map planner. Revision 1 on 2026-10-18 after the audit (section 10). R5 is done (last commit `3cb9919`). The schema is at step 20 (`packages/core/src/project.ts:22`). R6 makes step 21 (the routed marks). R7 is step 22. The numbers 19 to 21 hold on this branch only: `origin/master` is at schema 16 (R5 section 12.1).
Origin: `roadmap-overview.md` (R6 text, "Layout rule of the routed segments", the cases (a) to (d), the schema paragraph, gaps G7, G8, G11), `auto-routing.md`, `auto-routing-r2.md` to `auto-routing-r5.md`, `.claude/roadmap/rules.md`, `.claude/roadmap/protocol.md`, `.claude/roadmap/director-prompt.md`. The brief said `.claude/domain/rules.md`. That file does not exist. The domain rules are in `.claude/roadmap/rules.md` section 3. This plan uses that file.

**Answers that bind this plan (final):**
- **D-R6-01 B.** One branch for each room, then sub-branches to its ports.
- **D-R6-02 A.** `Segment.routedBy` and `Fitting.routedBy`, both in one schema step (21). A re-run removes the marked items that it reaches from the start port through marked segments, and keeps hand-drawn items. The overview says: build option B first (no stored data), then option A. This plan keeps that order (phase A of the tasks is the mark, phase C builds the planner, and the planner does not need the mark to be correct, see section 6).
- **D-R4-01, D-R4-02.** The route area is the set of rooms of the chosen room types (default Corridor and Shaft). The result is a 2D draft.
- **D-R5-01 C.** A flow unit on each network type. Limits for sizing are saved for each network (Q-R5-04 B, `ProjectDocument.networkSizing`).
- **Layout rule (user, 2026-10-17 and 2026-10-18).** Each routed segment is orthogonal (0 or 90 degrees) or at 45 degrees. A small jump uses 45 degree bends. A larger jump uses 90 degree bends. A free angle is rare and always shows a warning. Provisional values: small jump 1000 mm (P-R6-ANGLES). Reuse the Snap Angle code.
- **Rule 1 of `rules.md`.** The route command refuses to route into a network of another type.
- **No new Dutch text.** New texts are English only (user note 2026-10-17).
- **Dashboard screenshots** of every new or changed dialog state. Each UI task names its screenshots.

Code claims carry `path:line`. Paths start at the repository root. Line numbers are from commit `3cb9919` and can move. Read `.claude/roadmap/rules.md` first.

Terms (the terms of the overview and of the plans R2 to R5 apply; the plan uses the word "network" only). New terms:
- **Route**: the result of one run. It is a set of new segments and fittings.
- **Trunk (main)**: the part of the route that follows the route area. It starts at the start port and reaches the entry of each served room.
- **Branch**: the part from the trunk, through the entry of one room, to the hub of that room (D-R6-01 B).
- **Room spine**: the tree of segments inside one room. It starts at the entry and ends at each port of that room. A sub-branch is one arm of the spine.
- **Run key**: the pair (start stamp, start port) that the user gives to the command.
- **Routed mark**: the stored field `routedBy` (section 4.1).
- **Leg**: one straight piece of a path between two vertices. Each leg becomes one segment.
- **Jump (jog)**: a place where a run changes to a parallel line. It has two bends that turn in opposite directions. The offset between the two lines is the jump size `j`.
- **Hanan grid**: the grid of all horizontal and vertical lines through the terminals of a set of points. A shortest rectilinear tree for the points exists on this grid (Hanan, 1966; section 3).
- **Steiner tree**: a tree that joins given terminals and may use extra junction points. The heuristic of Takahashi and Matsuyama builds one (section 3).
- **Plan**: the pure result of the planner. It is not stored. It holds the new items, the items to remove, the warnings and the numbers.
- **Free angle**: a leg that is not a multiple of 45 degrees.

## 0. Questions (all answered) and provisional choices

### Questions for the user (all answered by the user on 2026-10-18)

Rule of the brief: a stored field or a changed meaning of a stored value that the batch did not cover is a question. The planner does not decide it. The user answered all five questions. The answers bind this plan. No task waits for an answer.

- **Q-R6-01 [data model]. What value does `routedBy` hold?** ANSWERED B by the user: `routedBy?: 'route'`. D-R6-02 A names the two fields. The value is a literal text that names the command that made the item. The options were:
  - **A.** `routedBy?: true`. The smallest value.
  - **B.** `routedBy?: 'route'`. A literal text. It names the command that made the item. It reads clearly in a file and a later command can add a value.
  - **C.** `routedBy?: { startStampId: string; startPortId: string }`. The mark holds the run key. Not chosen. Cost: one id pair on every item, and the pair goes stale when the stamp is deleted or replaced.
  - **Answer: B.** The walk (section 4.3, step 2) limits a re-run to one run. It follows marked segments through fittings only, and it crosses a stamp port only at the start port of the run. Every other stamp port is a leaf, so a terminal that two runs share, or a port group, cannot lead the walk into another run. A hand-drawn segment stops the walk. R6 never joins two runs (step 11).
  - **Effect:** the value is one constant (`ROUTED_MARK = 'route'`) and one clean-up function. T01, T02, T03, T12 and every task that depends on them are unblocked.
- **Q-R6-02 [data model: it sets what the stored mark means]. Which hand edit makes a routed segment a "hand-edited" one (the mark goes)?** ANSWERED A by the user (geometry edit only). D-R6-02 A says: "keeps hand-drawn or edited ones". The overview lists the paths (cascade, split, merge, drag, delete, paste, undo). It does not name an edit of a property in the Properties panel (size, shape, material). Options:
  - **A.** Only an edit of the geometry clears the mark: a drag of a fitting or a segment. A change of size, shape or material keeps the mark. A re-run then rebuilds the segment and loses the typed material. R5 already says "a size that you typed by hand is overwritten" (R5 P-R5-11).
  - **B.** Any edit of a segment in the Properties panel clears the mark of that segment.
  - **C.** Like A, and also a move of any stamp that a routed segment ends on clears the mark of that segment.
  - **Answer: A.** The geometry is what the route command owns. A size is recalculated by "Size network". A move of a stamp is an edit of the stamp, not of the segment, and a re-run after a stamp move is the normal way to fix the route. The dialog counts what a re-run removes before it removes it.
  - **Effect:** T03 is unblocked.
- **Q-R6-03 [data model; closes Q-R2-02]. Should a water port know its pipe side (flow or return)?** ANSWERED A by the user (first open port in the stamp port order, no stored side). The library has one `heating-water` type and one `chilled-water` type for both pipes (`packages/core/src/network-type-library.ts:14`-`:15`). The R2 finder keeps, for a stamp with several open ports, the port that is nearest to the start port (`auto-routing-r2.md:190`-`:195`). With that rule the first run could take the return-side port of one radiator and the flow-side port of the next one, and the second run would get the opposite sides. Options:
  - **A.** No stored pipe side, and a fixed side rule. R6 asks the finder for `portChoice: 'order'` (task T09a). On a stamp with more than one open port of the chosen type, the run takes the open port that comes first in the port order of the stamp (`getStampPorts`). The first run of a pair takes the first port of every radiator. The second run takes the remaining port. The sides then match across all terminals, also when the stamps are rotated differently, because the port order belongs to the stamp definition. The user decides which run is the flow and which is the return by the order of the runs. T09a has a test with 3 radiators.
  - **B.** A stored pipe side on the port or on the routing target. A new schema step.
  - **Answer: A.** No new data, and the sides are the same on every terminal. The cost: the user, not the app, decides which pipe is which, and a definition with the ports in the wrong order puts flow on the return side everywhere (the user then runs the return first). A port group over the flow and return ports still joins the two pipes into one network and doubles the water power in the sizing (R5 R-11). The Route dialog keeps the R3 warning `group-same-type`.
  - **Effect:** nothing waits. A change to B (a stored pipe side) is a later part.
- **Q-R6-04 [behaviour, not data; it sets what the route does to the plan]. What does the route do with rooms that have no connected entry to the route area ("off-graph" rooms)?** ANSWERED A by the user. This replaces the earlier recommendation B (skip by default, with a switch). On the first floor, 15 of 33 rooms have no wall with a corridor (R4 plan R-4). **Answer: A.** Rooms with no connected entry to the route area ARE served. The planner joins each such room with a free orthogonal connection from the nearest point of the built route. The ducts cross unrelated rooms, with warnings (`room-off-graph`, `wall-crossings`). There is no switch in the dialog. The warning lists the off-graph rooms. `rooms-skipped` stays only for a room that cannot be served at all: a room is skipped when both orthogonal layouts of its connection (first axis x and first axis y) would join an item of another network type (the foreign check of T13). Its ports then stay open and the plan lists the room. A room with no target port is not "skipped": it has nothing to serve. C (route through neighbour rooms) is a later part, not in R6. **Effect:** the off-graph connection is the default behaviour. T12 builds it with its tests. T22 has no switch.
- **Q-R6-05 [behaviour]. Two runs of the same network type through one corridor.** ANSWERED A by the user. Both follow the same center line, so the second run lies on top of the first. **Answer: A.** R6 places no lateral lane. The dialog shows one Note for the whole run ("This route runs on top of N segments of earlier runs. Move one run by hand."), not a warning on each leg. If two runs overlap during the tests, the director must alert the user (a message to the user, not only a line on the dashboard). B (a lateral offset for each earlier run) is a layout feature of its own and is not in R6. Nothing waits.

### Provisional choices (easy to reverse; the director takes them without a stop). The five questions above are not provisional.

| Id | Choice | Reason |
|---|---|---|
| P-R6-ANGLES | The angle set is the multiples of 45 degrees. The constant `ROUTE_ANGLE_INCREMENT_DEGREES = 45` is used with `resolveAngleSnap` (moved to core in T04, and called by `legClass` so the moved code has a user). The small jump limit is `SMALL_JUMP_MM = 1000`. A jump of 1000 mm or less uses a pair of 45 degree bends. A jump above 1000 mm keeps two 90 degree bends. The user setting "Snap Angle" (`App.tsx:162`, any value, also off) is not used, because it can be 0 or 15 degrees. | User note, provisional value of the director. One constant each (`route-layout.ts`). Reuse of the Snap Angle code, rule 3. |
| P-R6-MINLEG | `MIN_LEG_MM = 300`: no leg is shorter, when a longer layout exists. A 45 degree jump needs, on both sides, a run of at least `j/2 + 300` mm. | A fitting needs room. 300 mm is a planner value. Not verified against a duct catalogue. |
| P-R6-JOG | `MIN_JOG_MM = 150`. A lateral offset below 150 mm between two vertices of a trunk polyline is removed by moving the later vertex, at most `MAX_DRIFT_MM = 300` from its first place. | The center line is a guide (R4 legend). The skeleton has a pixel of 100 mm, so an offset below 150 mm is noise. |
| P-R6-AXES | "Orthogonal" means parallel to the page axes, as the Snap Angle code does (`angleSnap.ts:9`-`:19`). A building that is rotated on the sheet gets 45 degree zig-zags (risk R-2). | The one angle code that exists. A grid angle is a later option. |
| P-R6-DIAG | A pair of polyline vertices that is already an exact 45 degree diagonal stays one 45 degree leg. Orthogonal first applies to a pair that is not aligned. | A diagonal corridor stays a diagonal run. |
| P-R6-TREE | The trunk is a Steiner tree built with the heuristic of Takahashi and Matsuyama on the R4 graph. The room spine is the same heuristic on the Hanan grid of the room. Tie-breaks use ids and coordinates, so the same input gives the same output. | A known heuristic with a proven bound (section 3). It is simple. The optimal tree is NP-hard (section 3). |
| P-R6-ENTRY | A served room uses its `primary` entry (`route-area.ts`, `RouteEntry.primary`). If the graph part of the primary entry is not connected to the start, the room tries its other entries in the order of their run length. If none connects, the room is "off graph" (P-R6-OFFGRAPH). | R4 plan section 8 says R6 uses the primary entry. |
| P-R6-OFFGRAPH | Q-R6-04 A (answered). A served room with no connected entry is "off graph". The planner serves it: it joins the room with a free orthogonal path from the nearest point of the built route (the "off graph connection"). The path is checked with `crossingsAlongPath`. The plan shows `room-off-graph` (the list of rooms) and `wall-crossings`, both at warning level. There is no dialog switch and no input `includeOffGraph`. A room is skipped (`rooms-skipped`, info) only when both orthogonal layouts of its connection (first axis x, first axis y) would join an item of another network type. A port in no room (the R2 check box "include ports outside rooms" is on) and a port that the room spine cannot reach inside its room use the same connection. The user removes a room from the run with the R2 room list (section 4.6). | R4 found that 15 of 33 rooms on the first floor have no wall with a corridor (R4 plan R-4). The user chose to serve them, with warnings. |
| P-R6-EXTEND | If the start port already has exactly one segment that is not routed, and its far end is a fitting, the route starts at that fitting. The hand-drawn stub stays and keeps its size. The walk of a re-run starts at the same fitting (step 2), so a re-run of an extended run removes the routed part and builds it again. The overview open question "lock a drawn main" is answered this way for the stub at the start port only. | Reuse of the R3 start check (a start port with one segment is a normal case, `route-start.ts:76`-`:80`). It costs no data. |
| P-R6-KIND | A new fitting gets the kind `elbow` (2 segments), `tee` (3 segments) or `cross` (4 segments). The tool makes `junction` only (`drawSegmentTool.ts:160`). The kind has no effect on drawing today (a search of `packages/render/src` finds `fitting.kind` only in `scene.ts:1416`). | A closer match to the real fitting. The user can change the kind in Properties (`PropertiesPanel.tsx:40`). |
| P-R6-SEG | Each leg is one segment with a two-point geometry, as the tool makes it. A node of degree 2 on a straight line has no fitting (the legs merge). | `mergeSegmentsAtFitting` expects two-point segments (`segmentTool.ts:130`-`:161`). |
| P-R6-SIZE | New segments are round and get a placeholder diameter from the discipline of the network type (`PLACEHOLDER_DIAMETER_MM`): ventilation 200 (as the tool, `drawSegmentTool.ts:126`-`:127`), heatingAndCooling 25, plumbing 25, fireProtection 50, electrical 25, other 50. A pipe is never a 200 mm placeholder. The dialog shows a check box "Size the network after routing" when a limits entry exists for the run key (`getNetworkSizing`, `scene.ts:3028`). With the check box on, `sizeNetwork` runs on the new state and the sizes go into the same undo step, **for the marked segments only**. A hand-drawn segment of the same network (for example the stub of P-R6-EXTEND) keeps its size, and the dialog shows how many (`hand-kept-size`, info). Without an entry, the plan shows the warning `no-limits`: "Segments are not sized. Sizes shown are placeholders." and no sizing runs. R6 saves no limits by itself (D-R5-05: suggested values never apply by themselves). | One undo step (overview: "one undo step removes it"). Reuse of `sizeNetwork` (`sizing-network.ts:114`). |
| P-R6-MOVE | A move, rotation or replacement of a stamp keeps the marks of the segments on it. Only a direct drag of a fitting or of a segment clears marks, and only on the fittings that the drag moves and the segments attached to those fittings (section 4.4). A stamp drag moves no fitting (`selectTool.ts:109`-`:143`), so it clears nothing. | The overview says: "A move of the start stamp keeps the marks." The same rule for every stamp is simpler. Q-R6-02 C changes it. |
| P-R6-PAGE | The planner works on page 0 and refuses a multi-page file (D-R2-03). New items get `pageIndex: 0`, as the tool does (`drawSegmentTool.ts:121`). | Gap G1. |
| P-R6-MM | The planner works in millimetres. It converts a page point with `mmPerPt = 1 / pageUnitsPerRealUnit` (`calibration.ts:56`) and converts back at the end. All thresholds are in millimetres. | Angles do not change under a uniform scale. |
| P-R6-PEN | Bend penalty `BEND_PENALTY_MM = 500` and crossing penalty `CROSSING_PENALTY_MM = 1000` in the search on the Hanan grid. The penalties choose between paths of similar length. The reported length is the real length. | Fewer bends and fewer crossings look better. Planner values, not from a source. |
| P-R6-STEP | Samples along a path for region and wall tests are every 100 mm (the step of `crossingsAlongPath`, `route-crossings.ts:51`). A sample is "inside" a room when it is inside the polygon or within `REGION_TOL_MM = 150` of its boundary. For a trunk edge that holds a `wall` node (a link, `rl-`), a sample is also "inside" within `WALL_GAP_MM = 750` (the R4 limit `DEFAULT_MAX_WALL_MM = 600` plus the tolerance) of that wall node. | The skeleton pixel is 100 mm. The tolerance covers the half pixel and the wall thickness error of the polygon. A link joins two route-area rooms through a wall gap of up to 600 mm (`route-area.ts:9`), so a leg through a link leaves both polygons for that gap. |
| P-R6-LANE | R6 places no lateral lane for a second run in the same corridor (Q-R6-05 A, answered). If two runs overlap during the tests, the director alerts the user. | A layout feature of its own. |
| P-R6-GRAVITY | R6 refuses a gravity network type (`sanitary-waste`, `GRAVITY_TYPE_IDS`, `routePlan.ts:4`) with the error `gravity-not-routed`: "Drains need a slope. R6 does not route drains." | A drain needs a fall, and a 2D draft has no height. Forced 45 degree joints and a no-slope warning are a later feature. |
| P-R6-TAP | A tap sits on an axis leg of the trunk. When the nearest trunk leg is a 45 degree leg, the tap moves to the nearest axis leg of the same trunk edge. Two taps on one leg are at least `MIN_LEG_MM` apart (the later tap moves along the leg, away from the earlier one). | A tee on a diagonal needs a special fitting. Two tees closer than 300 mm have no room. Planner value. |
| P-R6-SHORT | After sizing, a leg shorter than 2 diameters (the larger side for a rectangular segment) gives the warning `short-leg` with the count. | A fitting needs about 2 diameters of run (planner value, not verified in a catalogue). |
| P-R6-TARGETS | The scene finds the target ports on the reduced state `S'` with the scope inputs of the dialog (section 4.5). The finder gets `portChoice: 'order'` (Q-R6-03 A). | Without this a re-run would lose its ports: the finder skips ports that have a segment, and the old run still holds them (`RouteDialog.tsx:98`, `route-ports.ts:22`). |
| P-R6-PREVIEW | The dialog recalculates the plan 300 ms after the last change (the debounce of R4, `auto-routing-r4.md` section 4.5) and shows "Calculating the route…" while it waits. | Reuse of the R4 pattern. |
| P-R6-UNDO | "Route network" is one undo step. It holds the removal of the old routed items, the new items and the optional sizes. The undo does not change `networkSizing`, the id counters, or the adopted network types. | Overview. `networkSizing` is not an undo state (R5 section 12.2). |
| P-R6-NAME | The menu item stays "Route network…" (R2). R6 adds no menu item. The dialog gets a new section "Route" with the preview and the button "Place route". | The overview says the user presses "Route" in the dialog of R2. |

## 1. Goal

The user opens "Route network…", picks the start stamp, the start port, the network type and the target ports (R2), and sees a preview of the route on the plan. The preview shows a main along the corridor, a branch to each room and a sub-branch to each port. The dialog lists the numbers, the warnings, what a re-run removes, and the total flow with a capacity warning. The user presses "Place route". The app removes the old routed items of this run, writes the new segments and fittings (with the routed mark) and, if the user chose it, writes the sizes. This is one undo step.

Each routed segment is orthogonal or at 45 degrees. A free angle happens only in rare cases and has a warning. The route never joins a network of another type. It crosses walls only at the places that the dialog counts. The result is a 2D draft.

Example (10A drawing, 1:100 scale; the numbers of the first floor are in section 4.7). Air handling unit 1 stands in the shaft. The main starts at the shaft node, runs along the corridor "gang" and puts a tee at each office door line. One branch enters each office. In the office, a spine runs to each of the 4 grilles. The dialog says, for example, "86 segments, 41 fittings, 212 m. 9 rooms, 34 ports." and "9 walls are crossed. Check which are fire walls." After "Place route", the open-port dots of the 34 ports go away. A second run for Return Air (start port "Return") finds the open ports with the routing target Return Air.

Where R6 stops: R6 routes one run key at a time. It adds no height, no clash check and no label. It does not size without limits. It does not make a riser. It changes no routing target and no network type. R7 (circuits) needs nothing from R6.

## 2. What exists now

| Item | Where | Use in R6 |
|---|---|---|
| `Segment`: `id`, `pageIndex`, `networkTypeId`, `shape`, `diameter`, `width`, `height`, `material`, `endpointA`, `endpointB`, `geometry` | `packages/core/src/network.ts:54` (the interface) | The new field `routedBy` goes here. The planner writes two-point geometry. |
| `Fitting`: `id`, `pageIndex`, `position`, `kind` (`junction`, `elbow`, `tee`, `reducer`, `cross`) | `network.ts:74` (the interface) | The new field `routedBy` goes here. |
| `ConnectionPoint`, `computeNetworks`, `nodeKeyOf`, `PortGroup` | `network.ts:41`, `:162`, `:108` | The check that no foreign join happens. `nodeKeyOf` joins grouped ports into one node: the walk of step 2 does not use it for stamp ports. |
| `CURRENT_SCHEMA_VERSION = 20`, the step 19 to 20, `loadProject` clean-up for stamps, types and `networkSizing` | `packages/core/src/project.ts:22`, `:320`-`:330`, `:424`-`:436`, `withCleanRoutingTargets` at `:441`, the step 17 to 18 at `:297`-`:307` | The model of step 21 and its clean-up. |
| `resolveAngleSnap(anchor, rawPoint, incrementDegrees)` (render only) | `packages/render/src/tools/angleSnap.ts:9` | Moves to core (T04). `legClass` calls it, so the Snap Angle code is reused, not copied. |
| The Snap Angle setting (default, any value, 0 = off) and `getAngleSnapDegrees` | `packages/render/src/scene.ts:364`, `:736`, `:2855`; `packages/ui/src/App.tsx:162`, `:409` | Not used by R6 (P-R6-ANGLES). |
| `resolveSegmentEndpoint`, `splitSegmentAtFitting` (both pieces copy the original with `...original`), `mergeSegmentsAtFitting` (the merged segment copies the first piece), `segmentsAtFitting` | `packages/core/src/segmentTool.ts:29`, `:83`-`:107`, `:117`, `:130`-`:161` | Mark rules for split and merge. |
| `pasteSegments` (copies a segment with `...segment`; a pasted fitting is a new object with no extra fields) | `packages/core/src/segmentPaste.ts:50`-`:60`, `:39` | The paste clears the mark. |
| `recomputeAttachedSegments` rewrites the geometry of the segments on a changed point | `packages/core/src/connectivity.ts:46`-`:64` | Used by every move. Marks are cleared at the drag site, not here. |
| The drag of fittings and segments | `packages/render/src/tools/selectTool.ts:109`-`:143`, `:176`-`:197` | T03 clears the marks here. |
| `SketchScene.applyConnectivityCascade`, `removeFitting`, `insertFittingOnSegment`, `copySelection`/`pasteClipboard` | `packages/render/src/scene.ts:4711`, `:1458`, `:1437`, `:5189` | The paths of section 4.4. |
| `adoptNetworkTypes` | `scene.ts:2506` | Rule 4. `applyRoute` calls it first. |
| `planNetworkSizes`, `applyNetworkSizes` (one `Transaction`, "Size network"), `getNetworkSizing`, `setNetworkSizing` | `scene.ts:1570`, `:1604`, `:3028`, `:3034` | The sizing step. |
| `sizeNetwork`, `networkOfStartPort`, `flowsOfNetwork` | `packages/core/src/sizing-network.ts:114`, `:45`, `:57` | Pure sizing on the planned state. |
| `solveFlow`, `FlowResult.totalCapacity`, `rootElementId`, `rootPortId` | `packages/core/src/flow.ts:14`-`:38`, `:96`-`:112` | The capacity warning. |
| `findRoutePorts`, `RoutePort`, `openPortsOf`, `RouteStamp` | `packages/core/src/route-ports.ts:99`, `:56`, `:22`, `:8` | The target ports. The dialog calls them on the live stamps (`RouteDialog.tsx:98`-`:110`), and `openPortsOf` skips a port that has a segment. So the scene must call them again on the reduced state (section 4.5). |
| `checkRouteStart` (phase `before` and `after`), `StartProblem` | `packages/core/src/route-start.ts:53` | The start check. R6 runs `before` and refuses on an error. |
| `computeRouteArea`, `RouteArea`, `RouteNode`, `RouteEdge`, `RouteEntry`, `RouteLink`, `unreached`, `parts`, ids | `packages/core/src/route-area.ts` (types in the R4 plan section 4.2) | The trunk graph. |
| `crossingsAlongPath`, `WallCrossing`, `OpenRun` | `packages/core/src/route-crossings.ts:51` | Counts real crossings of the final paths. |
| `nearestOnEdges`, `splitEdgeAt`, `connectedParts` | `packages/core/src/route-graph.ts:15`, `:44`, `:77` | Graph helpers. |
| `wallStretch`, `boundaryGapMm` | `packages/core/src/route-wall.ts` | Not needed by R6 directly. A point-to-ring distance for the region test: not verified whether a helper exists. T06 searches first. |
| `roomsAtPoint`, `polygonContainsPoint`, `roomLabelPoint` | `packages/core/src/rooms/room.ts:75`, `:101`, `:138` | The region tests. |
| `getRouteArea()` and the route area layer and events | `scene.ts:3662`; `packages/render/src/routeAreaLayer.ts` | The scene gives the area. The preview layer copies the pattern. |
| Route markers (a list on the scene, drawn in `redrawOverlay`, never dirty, cleared on page change) | `scene.ts:488`, `:662`, `:764`, `:2903`-`:2911`, `:5582` | The model for `setRoutePreview`. |
| `RouteDialog`, its sections and test ids, `RouteAreaSection` | `packages/ui/src/components/RouteDialog.tsx:38`, `:167`-`:376` | T21 and T22 add a section. |
| `routePlan.ts` texts (`routeText`, severity labels) and `sizePlan.ts` (English only table, `sizeText`) | `packages/ui/src/components/routePlan.ts:79`-`:192`; `sizePlan.ts` | The model for `routeBuildPlan.ts`. |
| Browser helpers | `.claude/roadmap/browser/lib.mjs`, `r3-lib.mjs`, `r4-lib.mjs` (`setupRooms`, `screenOf`, `baseline`, `sameAsBaseline`), `r5-lib.mjs` (`buildSizingProject`), `with-server.mjs` | The shape of `r6-lib.mjs`. |
| Real-room test fixture | `packages/core/src/rooms/route-area-fixture.testutil.ts` (`loadFirstFloorRooms`), `route-area-real.test.ts` | Core tests with real rooms. |

**Where the code differs from the overview** (the plan follows the code):
1. The overview says the walk and the mark are "case (a)". The code has no `routedBy` yet (a search of `packages` finds no `routedBy`).
2. The overview says R6 calls "the foreign-type check as a pure core function that takes the state, a connection point and the type id". The R3 start check already refuses a foreign type at the start port (`route-start.ts:79`-`:81`, code `port-foreign-type`). R6 adds the check for the far end of an extended stub and the final invariant (section 4.3, step 11).
3. The overview says the new route data joins by `computeNetworks`. A fitting that is only near a foreign segment in 2D is not joined in the data. The tool breaks a segment only when the user clicks on it (`resolveSegmentEndpoint`, `segmentTool.ts:73`-`:79`). So a geometric crossing is a warning, not a join (section 4.3, step 10).

## 3. Research

All sources below are from the planner's memory. No web search was run for this plan. Mark them "not verified" until a person reads them.

- **Hanan grid.** Hanan, M. (1966), "On Steiner's problem with rectilinear distance", SIAM Journal on Applied Mathematics 14(2), 255-265. Result: for any set of points, a shortest rectilinear Steiner tree exists on the grid of the horizontal and vertical lines through the points. MepApp uses it for the room spine. Not verified.
- **Complexity.** Garey, M.R. and Johnson, D.S. (1977), "The rectilinear Steiner tree problem is NP-complete", SIAM Journal on Applied Mathematics 32(4), 826-834. So R6 uses a heuristic. Not verified.
- **The heuristic.** Takahashi, H. and Matsuyama, A. (1980), "An approximate solution for the Steiner problem in graphs", Mathematica Japonica 24(6), 573-577. Start with the root. Repeat: add the terminal that is nearest to the tree, with its shortest path. The result is at most 2 times the optimal (more exactly 2(1 - 1/l) for l terminals). Kou, Markowsky and Berman (1981), Acta Informatica 15, 141-145, give a similar bound. MepApp uses it on a general weighted graph (the R4 graph) and on the Hanan grid. Not verified.
- **Bends.** A bend costs a fitting and pressure drop. The bend penalty of P-R6-PEN makes the search prefer fewer bends. The state of the search is (node, direction), a standard method. Not verified in a source.
- **Fitting angles.** Standard duct and pipe fittings come at 90 and 45 degrees (elbows, offsets). The user gave the rule. The domain checker confirms the angle set. Not verified in a standard.
- **R4 and R5 findings that bind R6.** Only 18 of 33 served rooms on the first floor have a primary entry (R4 plan R-4: 15 rooms lie 766 mm or more from every corridor). So the off-graph connection is a main case, not a rare one. R4 entries are consistent with `crossingsAlongPath` in 16 of 18 cases (`route-area-real.test.ts`, comment at the top).

What MepApp can use: our own code for the Steiner tree, the Hanan grid, the jog rule and the invariants. No new dependency (`pnpm add` is not allowed).

## 4. The model

### 4.1 Stored data (schema step 21)

R6 stores two new optional fields. The value is the literal text `'route'` (Q-R6-01 B, answered).

```ts
// packages/core/src/network.ts
/** The route command made this item (auto-routing-r6.md section 4.1). Absent = drawn by hand. */
export type RoutedMark = 'route';
export interface Segment { /* existing fields */ routedBy?: RoutedMark }
export interface Fitting { /* existing fields */ routedBy?: RoutedMark }
export const ROUTED_MARK: RoutedMark = 'route';
```

- `CURRENT_SCHEMA_VERSION` goes from 20 to 21 (`project.ts:22`).
- The step 20 to 21 only changes the version number: `{ fromVersion: 20, toVersion: 21, migrate: (data) => ({ ...data, schemaVersion: 21 }) }`. The fields are optional and "absent" is valid. The model is the step 17 to 18 (`project.ts:293`-`:303` in the R5 numbering).
- The clean-up on load: `loadProject` maps `segments` and `fittings` through `withCleanRoutedMark`. It removes a `routedBy` that is not a valid mark. It returns the same object when nothing is wrong (the pattern of `withCleanRoutingTargets`, `project.ts:441`).
- An older MepApp refuses the file (`schema.ts:69`-`:71`). This is the design of every step.
- The plan, the preview, the removal list, the warnings and the dialog input are not stored. The run key is not stored.
- Proof for each task that claims "no stored change": `git diff --stat` shows no change in `project.ts`, `schema.ts` and `serialize*`, and the browser checks compare `JSON.stringify(exportProject())` before and after (the pattern of R4).

### 4.2 Core types

```ts
// packages/core/src/route-layout.ts (new)
export const ROUTE_ANGLE_INCREMENT_DEGREES = 45;
export const SMALL_JUMP_MM = 1000;
export const MIN_LEG_MM = 300;
export const MIN_JOG_MM = 150;
export const MAX_DRIFT_MM = 300;
export type LegClass = 'axis' | 'diagonal' | 'free';
export function legClass(a: Vec2, b: Vec2): LegClass;              // tolerance 1e-6 of the length
export function isLayoutPath(path: readonly Vec2[]): boolean;     // every leg is 'axis' or 'diagonal'
export function jogPath(from: Vec2, to: Vec2): Vec2[];             // the Z path on the longer axis
export function applyJogRule(path: readonly Vec2[]): Vec2[];       // 90 pairs up to SMALL_JUMP_MM become 45 pairs
export function elbowPath(from: Vec2, to: Vec2, firstAxis: 'x' | 'y'): Vec2[];
export function straightenPolyline(points: readonly Vec2[], insideRegion: (p: Vec2) => boolean): { path: Vec2[]; free: boolean };

// packages/core/src/angle-snap.ts (new; moved from render, T04)
export function resolveAngleSnap(anchor: Vec2, rawPoint: Vec2, incrementDegrees: number): Vec2;

// packages/core/src/route-steiner.ts (new)
export interface SteinerGraph {
  nodeIds: readonly string[];                                  // fixed order = tie-break order
  edges: readonly { id: string; from: string; to: string; cost: number }[];
}
/** Takahashi-Matsuyama. Returns the edge ids of the tree and the terminals that no path reached. */
export function steinerTree(graph: SteinerGraph, root: string, terminals: readonly string[]): { edgeIds: string[]; unreached: string[] };

// packages/core/src/route-hanan.ts (new)
export interface SpineInput {
  root: Vec2;                                  // the entry point of the room
  /** The direction in which the branch enters the room (a unit axis vector). Tie-break: among paths of equal cost, the one whose first leg goes along this direction wins. */
  entryDir: Vec2;
  /** The ports are leaves: a path may end at a port but may not pass through one, and no later path starts at one. */
  ports: readonly { id: string; point: Vec2 }[];
  inside: (p: Vec2) => boolean;               // the region test
  crossesExisting: (a: Vec2, b: Vec2) => number; // how many existing foreign segments the leg a-b crosses
  stepMm?: number;                            // sample step, default 100
}
export interface SpineResult { paths: Vec2[][]; unreachedPortIds: string[]; lengthMm: number }
export function roomSpine(input: SpineInput): SpineResult;

// packages/core/src/route-build.ts (new)
export interface RouteBuildInput {
  startStampId: string; startPortId: string; networkTypeId: string;
  /** The target ports. The CALLER computes them with findRoutePorts on the reduced state S' (`removal` applied), see section 4.5. */
  targetPorts: readonly RoutePort[];
  /** The FULL state (before the removal). */
  state: { stamps: readonly RouteStamp[]; segments: readonly Segment[]; fittings: readonly Fitting[]; portGroups: readonly PortGroup[] };
  /** The items the run removes (from routedRunOf, T02). The planner builds S' from `state` minus this set. Empty for a first run. */
  removal: { segmentIds: readonly string[]; fittingIds: readonly string[] };
  rooms: readonly Room[];
  area: RouteArea;                             // from computeRouteArea (R4)
  mmPerPt: number | null; pageIndex: number;
  limits?: SizingSettings;                     // the saved limits of the run key, or undefined
  newSegmentId: () => string; newFittingId: () => string;
}
export interface PlannedRoute {
  segments: Segment[];                         // all carry routedBy
  fittings: Fitting[];                         // all carry routedBy
  removeSegmentIds: string[]; removeFittingIds: string[];
  warnings: RoutePlanWarning[];
  stats: RouteStats;
}
export interface RouteStats {
  segments: number; fittings: number; lengthMm: number; bends90: number; bends45: number; freeLegs: number;
  rooms: number; ports: number; portsLeft: number; wallCrossings: number; existingCrossings: number;
  removedSegments: number; removedFittings: number;
}
export function planRoute(input: RouteBuildInput): { status: 'ok' | 'refused'; plan: PlannedRoute };

// packages/core/src/route-marks.ts (new)
/** The walk of section 4.3 step 2. */
export function routedRunOf(state: { segments: readonly Segment[]; fittings: readonly Fitting[] }, startStampId: string, startPortId: string): { segmentIds: string[]; fittingIds: string[] };
export function clearRoutedMarks<T extends { routedBy?: RoutedMark }>(items: readonly T[], ids: ReadonlySet<string>): T[];

// packages/core/src/route-plan-warnings.ts (new)
export type RoutePlanWarningCode =
  | 'multi-page' | 'no-calibration' | 'area-empty' | 'gravity-not-routed' | 'start-error' | 'foreign-start' | 'no-targets' | 'start-unreachable' | 'internal-join'
  | 'free-angle' | 'wall-crossings' | 'shaft-crossing' | 'room-off-graph' | 'ports-left' | 'existing-crossings' | 'existing-overlap'
  | 'same-type-join' | 'short-leg' | 'capacity-over' | 'capacity-unit' | 'no-limits'
  | 'removes-routed' | 'extends-stub' | 'rooms-skipped' | 'shares-lane' | 'hand-kept-size' | 'draft-2d';
export interface RoutePlanWarning {
  code: RoutePlanWarningCode;
  severity: 'error' | 'warning' | 'info';
  count?: number; ids?: string[]; points?: Vec2[]; numbers?: Record<string, number>;
}
```

The planner reads its input and never changes it (a deep-equal test). Ids come from the two factories, in the order of creation, so the same input and the same counters give the same ids.

### 4.3 The algorithm (all in millimetres, section P-R6-MM)

The planner runs these steps in order. A step that finds an `error` warning stops the planner. It returns `status: 'refused'` and an empty plan with the warnings.

1. **Preconditions.** More than one page: `multi-page` (error). No calibration (`mmPerPt` null): `no-calibration` (error). `area.status` is not `ok`: `area-empty` (error). The network type is a gravity type (`GRAVITY_TYPE_IDS`): `gravity-not-routed` (error, P-R6-GRAVITY). `checkRouteStart` with phase `before` returns any `error`: one `start-error` with the codes. No target port in `targetPorts`: `no-targets` (error).
2. **The removal set and the walk (D-R6-02 A).** The caller computes the removal set with `routedRunOf` (T02) and passes it as `input.removal`. The planner builds the virtual state `S'` = `state` minus the removal set. Steps 3 to 12 work on `S'`. `routedRunOf` walks like this:
   1. Find the segments on the start port (an end `{ kind: 'port', elementId: startStampId, portId: startPortId }`). Exactly one marked segment: the walk begins with it. Exactly one unmarked segment (a hand-drawn stub, P-R6-EXTEND) whose far end is a fitting: the walk begins at that fitting, and the stub is not in the set. Any other case (no segment, more than one segment, a stub whose far end is a port): the set is empty.
   2. The walk goes from fitting to fitting. At a fitting it takes each attached segment that has the mark. It stops at an unmarked segment. It does not use `nodeKeyOf` for ports.
   3. A segment end on a stamp port is a leaf. The walk removes that segment (if marked) and does not continue through that port. This holds for every stamp port, also a port in a port group and a port of a terminal that another run shares. The only port that the walk passes is the start port of the run, and only at its beginning (rule 1 above).
   4. The set is the marked segments that the walk reached, then each marked fitting that those segments touch and that no remaining segment uses.
   The count goes into `removes-routed` (info). A count of 0 removes nothing and shows no line. The scene computes the target ports on `S'` (section 4.5), because a port that a removed segment held is open again in `S'`.
3. **The start.** The start port has 0 segments in `S'`: the start point is the world position of the start port. The start port has exactly 1 segment in `S'` and it is not marked (a hand-drawn stub): if its far end is a fitting, the start point is that fitting (P-R6-EXTEND, info `extends-stub`); if the far end is a port, the planner has nothing to extend and returns `start-unreachable` (error). The start port has more than 1 segment: the planner refuses with `start-error` (the R3 warning `port-segments` already shows in the dialog). The network of the start point (found with `computeNetworks`) must have one network type, equal to `networkTypeId`; else `foreign-start` (error) with the ids. A network that joins the start through a port group with the same type is allowed and gives the warning `same-type-join` with the ids (rule 2 of `rules.md` allows it).
4. **Group the target ports.** For each `RoutePort`: its `roomId` (smallest room, `roomsAtPoint`). A port with `roomId` null goes to the "outside" group. Each served room is one group (D-R6-01 B). The user chooses which rooms and stamps take part with the R2 scope (the rooms list or the selected stamps of `RouteDialog.tsx:98`-`:110`). R6 has no second room list.
5. **The trunk graph.** Take `area.nodes` and `area.edges`. Each center edge and each link connector has the cost `lengthMm`. Two kinds of connector edge exist in R4 (ids in `auto-routing-r4.md` section 4.2): an **entry connector** has the id `rc-ry-…` and joins the tap node `rt-ry-…-0` on a center edge to the wall node `rw-…`; a **link connector** has the id `rc-rk-…` and joins two route-area rooms through a wall node `rl-…`. The planner tells them apart by these prefixes (a test pins them). A link connector is a trunk edge. An entry connector is not a trunk edge. The terminal of the search for a served room is the **tap node** of its entry (the center-line side of the connector), not the wall node. The point `E` of the entry (the wall node position) is used later for the branch (step 9). The terminals come from P-R6-ENTRY. The root is the graph node nearest to the start point: `nearestOnEdges` on the center edges, split with `splitEdgeAt` (a copy of the graph; the R4 result is not changed). If the nearest distance is above `2000` mm, the planner still connects, with a start leg that is checked in step 8 (the start stamp may stand in a room that is not in the route area).
6. **The trunk tree.** `steinerTree` on this graph. Ties break by node order, then edge id. The edges of kind `center` and the link edges that the tree uses are the trunk edges. A terminal that the tree does not reach (another graph part, `area.parts` above 1) is retried with its next entry (P-R6-ENTRY). If still unreached, its room is off graph (step 8).
7. **The trunk geometry.** Each trunk edge is a polyline in the graph. The planner walks the tree from the root. For each edge it calls `straightenPolyline` with the test "inside a route-area room" (P-R6-STEP). For an edge that holds a `wall` node (a link), the test also accepts a sample within `WALL_GAP_MM = 750` of that wall node, so a leg through a wall gap is not a region failure. The rules of `straightenPolyline`:
   1. A pair of vertices that is an `axis` or a `diagonal` leg stays (P-R6-DIAG).
   2. Another pair becomes `jogPath(from, to)`: a Z on the longer axis (half the long distance, the jump `j`, the other half). Then `applyJogRule` changes each pair of 90 degree bends with `j <= SMALL_JUMP_MM` to a pair of 45 degree bends, if both runs next to it are at least `j/2 + MIN_LEG_MM` long. Otherwise the pair of 90 degree bends stays. If a Z leg would be shorter than `MIN_LEG_MM`, the planner uses `elbowPath` (one 90 degree bend) with the longer leg first.
   3. A lateral offset below `MIN_JOG_MM` is removed by moving the later vertex (P-R6-JOG), at most `MAX_DRIFT_MM` from its first place. Beyond that limit the offset becomes a jump by rule 2.
   4. After the pair step, the planner joins collinear legs.
   5. The path is tested with the region test. If one sample is outside, the planner tries the same pair again with the per-vertex path (rule 2 applied to each pair of the original polyline, not to the whole displacement). If a sample is still outside, the original polyline is kept as a free-angle path: the result has `free: true`, and the plan gets one `free-angle` warning with the points.
   The result is a trunk of axis and diagonal legs. The trunk nodes (the junctions of the tree) keep their positions after the walk.
8. **The start leg and the off-graph connections.** The start leg joins the start point to the trunk root. A served room that is off graph (no connected entry) is always served (Q-R6-04 A): for such a room, and for a port in no room, the leg joins the nearest point of the built route to the target point. The planner skips a room only when both orthogonal layouts of its connection (first axis x, first axis y) would join an item of another network type (step 12): the room goes to `rooms-skipped` (info) and its ports stay open. Each leg is `elbowPath` with the first axis chosen as the longer side, then `applyJogRule`. The leg is not tested against the region (it may cross rooms by design). It is tested with `crossingsAlongPath` (step 10). Each off-graph room adds its id to `room-off-graph`.
9. **The branches (D-R6-01 B).** For each served room with an entry on the trunk:
   1. Find the nearest trunk leg to the entry point `E`. If it is a 45 degree leg, take the nearest axis leg of the same trunk edge instead (P-R6-TAP). The tap `T` is the projection of `E` on that leg along the axis that gives the smaller distance. If `T` lies less than `MIN_LEG_MM` from a vertex of the leg, `T` moves along the leg to `MIN_LEG_MM` from that vertex, or to the vertex when the leg is shorter than `2 * MIN_LEG_MM`. Two taps on one leg are at least `MIN_LEG_MM` apart: the tap that comes later in the order of the room ids moves along the leg, away from the earlier tap.
   2. The branch path from `T` to `E` is a straight leg when `T` and `E` share an axis coordinate. Else it is `jogPath(T, E)` with the jog rule.
   3. The room spine: `roomSpine` with the root `E`, the direction `entryDir` (the direction of the last leg of the branch, into the room) and the ports of the room. It builds the Hanan grid of `E` and the ports, adds the state (node, axis), blocks each grid edge that has a sample outside the room (P-R6-STEP), and runs `steinerTree` with the costs: the length, plus `BEND_PENALTY_MM` for a turn, plus `CROSSING_PENALTY_MM` for each existing foreign segment that the edge crosses. **A port is a leaf**: a path may end at a port, may not pass through a port, and a later path may not start at one. Tie-break between paths of equal cost: the path whose first leg goes along `entryDir` wins, then the lower node order. A port the tree cannot reach goes to the off-graph connection (step 8) and shows in `ports-left` only if that fails too.
   4. The jog rule runs on every path of the spine, so a small offset between two parallel runs becomes a 45 degree pair.
10. **The existing segments.** For every new leg: count the crossings with existing segments of other networks (2D segment intersection, shared end points excluded). Count the overlaps (collinear overlap of more than `MIN_LEG_MM`). A crossing is not a join. The planner makes no junction at a crossing. The result goes to `existing-crossings` and `existing-overlap` (warnings, with points; one line for the whole run, never one line for each leg). An overlap with segments that carry the routed mark (an earlier run) goes to the Note `shares-lane` instead (Q-R6-05 A). A new fitting or end point within 50 mm of a foreign fitting or port is also listed in `existing-crossings` (the designer sees it). The planner never connects to a foreign item (see 11).
11. **Build the items.** Each node of the planned paths with degree 1 (not a start or a port) cannot exist. A node with degree 2 and two legs in one line has no fitting. Other nodes get a fitting with a kind (P-R6-KIND). Each leg becomes a segment with `networkTypeId`, `shape: 'round'`, `diameter` from `PLACEHOLDER_DIAMETER_MM` of the discipline (P-R6-SIZE), `pageIndex: 0`, `routedBy`, two-point geometry in page points. The ends at a stamp port use `{ kind: 'port', elementId, portId }`. Every other end uses a fitting. The start point uses the start port, or the stub fitting. The planner never reuses a fitting of the state, except the stub fitting.
12. **The invariant check (rule 1, rule 2).** The planner runs `computeNetworks` on `S'` plus the new items. Each network must have segments of one type (a join of **different** types is refused; a same-type join through a port group is only the warning `same-type-join`), and every network of the old state that is not the start network must have the same segment ids as before. If not, the planner refuses with `internal-join` (error) and the ids. A core test checks that this never fires on the real rooms and that it fires on a built case (a stub whose fitting also holds a foreign segment).
13. **Real crossings (fire).** For each planned path: `crossingsAlongPath(rooms, path, ...)`. The sum goes to `wall-crossings` (warning, with the points). A crossing with a shaft room on either side goes to `shaft-crossing` instead (warning, with the fire hint). The R4 hint text is extended (section 4.6, `warnWallsHint`). `OpenRun` results (a gap above 600 mm) are not counted as walls.
14. **Capacity.** `solveFlow` on `S'` plus the new items with `rootElementId` and `rootPortId`. `terminalTotal = totalCapacity - capacityOf(startStamp)`. If the start stamp has a capacity above 0 and `terminalTotal` is above it: when the network type has a `flowUnit`, `capacity-over` (warning) with both numbers and the unit; when it has none (the numbers may be in an unknown unit, for example the library labels CFM and GPM), the Note `capacity-unit` with both numbers and no claim.
15. **Sizing (optional).** If `limits` is given and the type has `flowUnit` and `sizingMethod`, `planRoute` returns the sizes from `sizeNetwork` on the new state (the same function as "Size network"). It keeps only the sizes of the **marked** segments. The count of unmarked segments of the network goes into `hand-kept-size` (info). After sizing, each routed leg with a length below 2 diameters (the larger side for a rectangular segment) is counted in `short-leg` (warning, P-R6-SHORT). If `limits` is absent: `no-limits` (warning): "Segments are not sized. Sizes shown are placeholders."
16. **Last line.** `draft-2d` (info), always last (D-R4-02).

### 4.4 The mark on every path

The walk of step 2 and the clear rules are core functions with core tests. Each row says what the code does today and what T02 or T03 changes. All places are read in the task before it edits (the overview says "Not verified: the exact place" for the drag).

| Path | Code | Today | Rule for the mark |
|---|---|---|---|
| Change of the network type (cascade) | `scene.ts` `setNetworkTypeForSegmentsNetworks` (spread copy) | The segment is copied with a spread | The mark stays. |
| Insert a fitting (split) | `segmentTool.ts:83`-`:107` | Both pieces copy the original | Both pieces keep the mark. The new fitting is hand-placed and has no mark. |
| Remove a fitting (merge) | `segmentTool.ts:130`-`:161` | The merged segment copies the first piece | The merged segment has the mark only if both pieces had it. T02 changes this and tests it. |
| Drag of a fitting or of a segment by hand | `selectTool.ts:109`-`:143`, `:176`-`:197` | The drag moves the fittings, and `applyConnectivityCascade` rewrites the geometry of every segment on them | T03 clears the mark of every fitting in `fittingOriginals` (the fittings that the drag moves) and of every segment attached to one of those fittings (`segmentsAtFitting`), at this site. It does not clear the mark of a segment whose geometry changes only because a stamp port moved. Q-R6-02 A. |
| Move, rotate or replace a stamp | `scene.ts:2684`, `:2812`, `:4535`, `:4583`, `:4685` | The cascade rewrites the end geometry | The marks stay (P-R6-MOVE). |
| Delete a segment | `scene.ts:5072` | The segment goes. Its fittings stay | No change. A marked fitting that stays is hidden by `computeNetworks`. |
| Paste, also into another drawing | `segmentPaste.ts:50`-`:60`, `scene.ts:5189` | `...segment` copies the field | T02: `pasteSegments` removes `routedBy` from every pasted segment. A pasted fitting is already new and has no mark (`segmentPaste.ts:39`). |
| Undo, redo | `Transaction` | One step | `applyRoute` is one transaction. |
| Save, load, PDF round trip | `serializeDocument`, `loadProject` | Records are written as they are | The field travels in the JSON. T01 tests it. |
| Edit of a property (size, shape, material) | `scene.ts:1350`-`:1383` (`updateSegmentFields`) | Spread copy | No change under Q-R6-02 A. |

### 4.5 Scene (`packages/render/src/scene.ts`, new `routePreviewLayer.ts`; T17, T18)

```ts
// SketchScene
planRoute(input: RouteRequest): RoutePlanView                 // read-only: adopts nothing, emits nothing, never dirty
applyRoute(plan: PlannedRoute, options: { size: boolean }): { segments: number; fittings: number; removedSegments: number; removedFittings: number } | null
setRoutePreview(plan: PlannedRoute | null): void             // overlay only; cleared on pageChanged and documentActivated
// RouteRequest = { startStampId, startPortId, networkTypeId,
//   scope: RouteScope, includeOutsideRooms: boolean, portsPerStamp: 'one' | 'all' }
//   (the scope inputs of RoutePortsInput in route-ports.ts:38, WITHOUT stamps: the scene supplies them)
// RoutePlanView = { status, plan, networkTypeName, flowUnit, hasLimits, portsAfterRemoval: number }
```

- `planRoute` reads the drawing state and computes the removal set with `routedRunOf`. It builds the reduced state `S'`: the segments and fittings minus the removal set, and a `portSegmentTypes` map for each stamp that is computed from the segments of `S'` (the same data as `toStampInfo`, `scene.ts:1151`). It calls `findRoutePorts` on `S'` with the scope inputs of the request, `portChoice: 'order'` (T09a) and the start stamp and port. So a port that the old run held is open again and is a target of the re-run. It takes `getRouteArea().area` and `mmPerPt`, reads the limits with `getNetworkSizing`, and calls the core `planRoute` with `removal`, `targetPorts` and `state`. The id factories are counters that start at `doc.nextSegmentSeq` and `doc.nextFittingSeq` and do not change them (a dry run).
- **The dialog counts.** The R2 summary (`route-summary`) counts the open ports now, on the live stamps, as before. For a re-run it would show fewer ports than the run needs. When the removal set is not empty, the R6 section adds the line `buildPortsAfter`: "After the removal, {n} ports are open for this run." with `portsAfterRemoval`. The R2 count is not changed.
- `applyRoute` re-plans with the real counters, so ids are not reused. It calls `adoptNetworkTypes([typeId])` first (rule 4). It runs one `Transaction` named "Route network": remove the old items, add the new, and (with `size`) write the sizes. It runs the invariant check of step 12 on the final state before it commits; on a failure it writes nothing and returns null. It removes the ids of the removed segments and fittings from `doc.selectedIds` (a removed item must not stay selected). It calls `syncDrawingLayer`, `markDirty`, `recomputeFlow` and emits `drawingChanged`. It selects nothing.
- `setRoutePreview` stores the plan polylines and marks. `redrawOverlay` draws them: the network type color, dashed; a magenta ring at each free-angle point; an amber cross at each wall crossing; a red cross at each shaft crossing; removed items in light red. It is never dirty and never in `serializeDocument` or the PDF export (the pattern of the route markers, `scene.ts:5582`).
- Speed: the core planner on the 10A floor must take 500 ms or less (T16 measures it). If not, the lead reports it and a task moves it into a worker (the pattern of `rooms/worker.ts`).

### 4.6 UI (English only)

**Dialog (T20 to T22).** `RouteDialog.tsx` gets a section `route-build` below the R2 inputs, inside `route-body`, above `RouteAreaSection`. It shows when a start stamp, a port, a type and at least one target port exist.

- `route-build-pending`: "Calculating the route…" while the debounce waits (P-R6-PREVIEW).
- `route-build-summary`: the numbers (segments, fittings, length in m, rooms, ports, bends).
- `route-build-remove`: the removal line.
- `route-build-lines`: one `route-build-line-<code>` for each warning, with `data-severity` and the label Error, Warning or Note (`routeText('en', 'severityError' ...)`, the markup of `RouteDialog.tsx:252`). A fire hint line goes with `wall-crossings` and `shaft-crossing` (the R4 hint, `warnWallCrossingsHint`).
- The rooms and stamps of the run come from the R2 scope (`route-scope`, `route-room`, `route-outside`, `route-all-ports` of `RouteDialog.tsx:263`-`:364`). R6 adds no room list. The dialog passes the scope to `planRoute` as `RouteRequest`.
- There is no off-graph switch (Q-R6-04 A). The Warning `room-off-graph` lists the off-graph rooms that the route serves. The Note `rooms-skipped` lists only the rooms that cannot be served at all.
- `route-build-size`: the check box "Size the network after routing". It shows only when limits exist. Default on.
- `route-place`: the button "Place route". It is disabled when the status is `refused`, when no segment is planned, or while the plan is pending.
- `route-build-result`: after Place, "Placed {segments} segments and {fittings} fittings." The dialog stays open.
- The preview is drawn on the plan while the section shows (`setRoutePreview`), and cleared when the section hides or the dialog closes.
- No `window.confirm`. The removal line is the notice. The user accepts with "Place route".

**Texts (T20).** A new file `packages/ui/src/components/routeBuildPlan.ts` with an English table and `buildText(key, params)` and the pure builders `routeBuildLines(plan, names)` and `routeBuildSummary(stats)`. Every text has 140 characters or less (a test checks it with sample numbers). The severity labels reuse `routeText('en', ...)`. The Dutch table of R2 to R4 stays as it is.

| Key | Text |
|---|---|
| `buildTitle` | "Route" |
| `buildPending` | "Calculating the route…" |
| `buildSummary` | "{segments} segments, {fittings} fittings, {length} m. {rooms} rooms, {ports} ports." |
| `buildBends` | "{b90} bends of 90 degrees and {b45} bends of 45 degrees." |
| `buildRemove` | "This run removes {segments} routed segments and {fittings} fittings. Hand-drawn segments stay." |
| `buildExtends` | "The route starts at the end of a hand-drawn segment. That segment stays." |
| `buildPortsAfter` | "After the removal, {n} ports are open for this run." |
| `noteRoomsSkipped` | "{count} rooms cannot be joined without joining another network. Their ports stay open." |
| `noteSharesLane` | "This route runs on top of {count} segments of earlier runs. Move one run by hand." |
| `noteHandKept` | "{count} hand-drawn segments of this network keep their size." |
| `errGravity` | "Drains need a slope. R6 does not route drains." |
| `warnSameTypeJoin` | "The start network is joined through a port group of the same type." |
| `warnShortLeg` | "{count} legs are shorter than 2 diameters. Check the fittings." |
| `noteCapacityUnit` | "The ports total {total}. The start has {cap}. The unit is not set, so the numbers are not compared." |
| `errMultiPage` | "This file has more than one page. Route one page at a time." |
| `errNoCalibration` | "The drawing has no scale. Set the scale first." |
| `errAreaEmpty` | "The route area is empty. Add a room type or detect rooms." |
| `errStart` | "The start has a problem. Read the lines above." |
| `errForeignStart` | "The start joins a network of another type. Nothing is placed." |
| `errNoTargets` | "No open port is left to connect." |
| `errStartUnreachable` | "The start cannot join the route area." |
| `errInternalJoin` | "The route would join another network. Nothing is placed." |
| `warnFreeAngle` | "{count} places need a free angle. The places are marked." |
| `warnWalls` | "{count} walls are crossed by the route. The places are marked." |
| `warnWallsHint` | "Corridor and shaft walls are often fire rated. Check them. A duct needs a fire damper there. A pipe or cable tray needs a firestop." (131 characters; extends the R4 text) |
| `warnShaft` | "The route crosses the wall of the shaft {room} {count} times." |
| `warnOffGraph` | "{count} rooms are outside the route area. Their branches cross more walls: {rooms}." |
| `warnPortsLeft` | "{count} ports could not be reached. They stay open." |
| `warnCrossings` | "The route crosses {count} existing segments. Check the clearances." |
| `warnOverlap` | "The route runs on top of {count} existing segments." |
| `warnCapacity` | "The ports total {total} {unit}. The start has {cap} {unit}." |
| `warnNoLimits` | "Segments are not sized. Sizes shown are placeholders. Use Size network… after you place." |
| `buildSizeAfter` | "Size the network after routing" |
| `buildPlace` | "Place route" |
| `buildPlaced` | "Placed {segments} segments and {fittings} fittings." |
| `buildRooms` | "Rooms to serve" |
| `buildDraft` | "Draft in 2D. Check height, clashes, clearances and slope yourself." |

### 4.7 Hand-checked values

Each value below is calculated by hand by the planner. The implementer recomputes it. If the code gives another value, the implementer reports it and never changes a constant to hit a value.

**Constants.** `SMALL_JUMP_MM = 1000`; `MIN_LEG_MM = 300`; `MIN_JOG_MM = 150`; `MAX_DRIFT_MM = 300`; `BEND_PENALTY_MM = 500`; `CROSSING_PENALTY_MM = 1000`; `REGION_TOL_MM = 150`; sample step 100 mm; `2000` mm start-distance note. They are planner values. None comes from a standard.

**Jog rule.**
- Jump 600: for `from = (0,0)`, `to = (10000,600)`: the longer axis is x (10000), the jump is 600. The Z is `(0,0) (5000,0) (5000,600) (10000,600)`. 600 is at most 1000, and both runs are 5000, at least 600/2 + 300 = 600. The 45 degree version is `(0,0) (4700,0) (5300,600) (10000,600)`. The legs are 4700, 848.53 (600 by 600, diagonal), 4700. The length is 10248.53 mm. The Manhattan length is 10600 mm.
- Jump 1000: `from (0,0)`, `to (16000,1000)`. The Z corners are `(8000,0)` and `(8000,1000)`. The 45 degree points are `(7500,0)` and `(8500,1000)`: the diagonal is 1000 by 1000. The runs are 7500, which is at least 500 + 300 = 800. So the 45 version applies.
- Jump 1001: `to = (16000,1001)`. The jump is above 1000. The two 90 degree bends stay. The length is 16000 + 1001 = 17001 mm.
- Jump 1500: the two 90 degree bends stay. The length is `10000 + 1500 = 11500` for `to = (10000,1500)`.
- Runs too short: `(0,0) (500,0) (500,600) (1000,600)`. The jump is 600, but the runs are 500, below 600. The 45 version does not fit. The 90 version stays (the legs are 500, 600, 500, all at least `MIN_LEG_MM`).
- A pure diagonal pair `(0,0) (600,600)`: stays one 45 degree leg of 848.53 mm (P-R6-DIAG).
- Drift: a pair `(0,0) (10000,100)`: the offset 100 is below 150. The later vertex moves to `(10000,0)`. Length 10000.
- Branch tap with a clamp: trunk leg `y = 0` from `x = 0` to `x = 20000`. `E = (7000,2400)`: the tap is `T = (7000,0)` and the branch is one straight leg of 2400 mm. `E = (100,2400)`: the projection `x = 100` is below 300 from the vertex, so `T = (300,0)`. The branch is `jogPath((300,0),(100,2400))`: the longer axis is y (2400), the jump is 200. The Z is `(300,0) (300,1200) (100,1200) (100,2400)`. The 45 version is `(300,0) (300,1100) (100,1300) (100,2400)`: the diagonal is 200 by 200. The runs are 1100 and 1100, at least 100 + 300 = 400. The length is 1100 + 282.84 + 1100 = 2482.84 mm.

**Steiner on a graph.** A square graph: nodes `s`, `a`, `b`, `c` with edges `s-a` 10, `a-b` 10, `s-c` 10, `b-c` 10. Root `s`, terminals `a`, `b`, `c`. The nearest terminal is `a` or `c` at cost 10 (tie: the node order picks `a`). Then `b` through `a` costs 10, and `c` costs 10. The tree has 3 edges and cost 30. The optimal cost is 30.

**Hanan grid.**
All Hanan cases use the rule "a port is a leaf" and the tie-break "the first leg goes along `entryDir`".
- Root `(0,0)`, `entryDir = (1,0)`, ports `(4000,0)` and `(0,3000)`, a free room. The tree has two arms from the root, one along x and one along y. Length 7000. It has no bend and no fitting of its own. The root is a junction of the two arms (and of the incoming branch, which the caller adds).
- Root `(0,0)`, `entryDir = (1,0)`, ports `(4000,2000)` and `(4000,-2000)`. Both ports cost the same at first (4000 + 2000 + one bend of 500). The tie-break takes the path whose first leg goes along x: `(0,0)` to `(4000,0)` to `(4000,2000)`. Then the second port joins at `(4000,0)` by a stub of 2000. Length 4000 + 2000 + 2000 = 8000. One tee at `(4000,0)`. Without the tie-break the search could take the paths through `(0,2000)` and `(0,-2000)` and give 12000, so the test checks 8000 and the tie-break.
- A room 4000 by 4000 mm, root `E = (2000,0)`, `entryDir = (0,1)`, four ports `(1000,1000)`, `(3000,1000)`, `(1000,3000)`, `(3000,3000)`. Ports are leaves, so no path runs through a port. The search: the first port `(1000,1000)` (cost 2000 + 500; tie with `(3000,1000)`, node order) goes first along y to `(2000,1000)` and then along x. The port `(3000,1000)` joins at `(2000,1000)` by 1000. The port `(1000,3000)` joins at `(2000,1000)`: up along x = 2000 to `(2000,3000)` (2000), then left (1000). The port `(3000,3000)` joins at `(2000,3000)` by 1000. The tree is: stub `E`-`(2000,1000)` 1000; arm left 1000; arm right 1000; riser `(2000,1000)`-`(2000,3000)` 2000; arm left 1000; arm right 1000. Total 1000 + 1000 + 1000 + 2000 + 1000 + 1000 = 7000. **6 segments** and **2 fittings** inside the room: a cross at `(2000,1000)` (stub, left, right, riser) and a tee at `(2000,3000)` (riser, left, right). `E` is on a straight line with the branch, so it has no fitting. No elbow stands on a port. The tree is the only one of length 7000 in which every port is a leaf. The test asserts length 7000, 6 paths, 2 junction nodes, and that every port is a leaf.

**Total of a room with the trunk.** Use the room above, and a trunk leg on the line `y = -2000`. The tap is `T = (2000,-2000)`. The branch from `T` to `E = (2000,0)` is a straight leg of 2000 mm. It continues in line with the stub `(2000,0)-(2000,1000)`, so the branch and the stub are one segment of 3000 mm. New length 2000 + 7000 = 9000 mm. New segments: 6. They are: `T` to the cross 3000; the cross to `(1000,1000)` 1000; the cross to `(3000,1000)` 1000; the cross to the tee 2000; the tee to `(1000,3000)` 1000; the tee to `(3000,3000)` 1000. The sum is 3000 + 1000 + 1000 + 2000 + 1000 + 1000 = 9000. New fittings: 3 (the tee on the trunk at `T`, the cross, the tee). The trunk segment is split at `T`, and its two halves are counted in the trunk. The test uses an independent sum of the lengths of the written segments.

**Two taps on one leg.** Trunk leg `y = 0`, `x` from 0 to 20000. Room A has `E = (7000,2400)`, room B has `E = (7200,-2400)`. The taps are 200 apart, below 300. The later tap (by room id) moves to `x = 7300`. The branch of B is then `jogPath((7300,0),(7200,-2400))`: the jump is 100, below `MIN_JOG_MM`, and the branch end `E` is a fixed wall point, so the rule 3 of `straightenPolyline` does not move it; the planner uses the 45 pair: jump 100, runs 1150 each, at least 50 + 300. The path is `(7300,0) (7300,-1150) (7200,-1250) (7200,-2400)`. Check: the diagonal is 100 by 100, length 141.42. Total length 1150 + 141.42 + 1150 = 2441.42 mm.

**Placeholder sizes (P-R6-SIZE).** ventilation 200, heatingAndCooling 25, plumbing 25, fireProtection 50, electrical 25, other 50. A Heating Water run gets `diameter: 25` on every new segment.

**Capacity.** 4 terminals of 100 each, and the start stamp with capacity 300: `totalCapacity = 400 + 300 = 700`. `terminalTotal = 700 - 300 = 400`. 400 is above 300, so `capacity-over` shows, with 400 and 300. With start capacity 500 there is no warning. With no start capacity there is no warning. With the same numbers and a network type that has no `flowUnit`, the line is the Note `capacity-unit` and not the warning.

**Removal.** A routed run of 10 segments and 6 fittings, plus one hand-drawn segment that joins a routed fitting `F`. A re-run: the walk removes the segments it reaches. The hand-drawn segment stops it. `F` stays, because a remaining segment uses it. The count is 10 segments minus those beyond the hand segment, and 6 fittings minus `F`. The core test builds this case and compares the sets.

**Removal, stub case.** A hand-drawn stub S (1 segment, 2000 mm) joins the start port to a fitting G. A routed run of 8 segments and 4 fittings starts at G. Run 1 (the extend case) wrote the routed run. The re-run: the start port has one unmarked segment S, its far end is the fitting G, so the walk begins at G. The set is the 8 segments and the 4 fittings (G is not marked and is not in the set). S and G stay. After Place, the export holds S, G, and 8 new segments and 4 new fittings (the ids are new).

**Removal, shared terminal.** Two runs (A from stamp A, B from stamp B), same type. Terminal T has two ports `p1` and `p2` in one port group. Run A ends on `p1` and run B ends on `p2`. The re-run of A: the segment on `p1` is marked, it is removed, and the walk does not continue through the port group to `p2`. The set holds no segment of B (the test compares ids).

**Angle test.** After any run, each routed leg `(dx,dy)` has `min(|dx|,|dy|) <= 1e-6 * len` (axis) or `abs(|dx| - |dy|) <= 1e-6 * len` (diagonal). The browser check recomputes this from the exported geometry (it does not use the core function).

## 5. How R6 keeps the rules of `rules.md` section 3

1. **The segment defines the network type of a port.** R6 writes segments with the chosen `networkTypeId`. It writes no network type on a port, a stamp, or a definition. It changes no routing target. A segment that ends on a port defines the type of that port (the R2 and R3 model). The finder takes only open ports of the chosen type.
2. **The cascade invariant.** `routedBy` is not a network value. It says how the item was made. A cascade keeps it (spread copy). R6 refuses to join a network of another type: the R3 start check, the check of the stub fitting (step 3), and the final invariant (step 12), with tests (section 6). A change of the network type of a routed run keeps the marks and changes the whole run, as the cascade does today. A later re-run uses the type that the user chooses in the dialog. Not verified: what a re-run does to a routed run whose type the user changed by hand. The walk follows the marks, not the type. T25 checks it.
3. **Reuse before new.** Reused: `resolveAngleSnap` (moved to core, T04), `computeRouteArea` and its ids, `crossingsAlongPath`, `findRoutePorts`, `checkRouteStart`, `sizeNetwork`, `solveFlow`, the R4 pending and debounce pattern, the route marker pattern for the preview, the `Transaction` pattern of `applyNetworkSizes`, the R5 `sizePlan.ts` pattern for texts, `lib.mjs`, `r3-lib.mjs`, `r4-lib.mjs`, `r5-lib.mjs`. New, after a search that found nothing: the Steiner tree, the Hanan grid, the jog rule, the walk of marked items. A search of `packages/core/src` for `steiner`, `hanan` and `routedBy` finds nothing (the T05 to T07 implementers repeat the search).
4. **The adoption trap.** `applyRoute` calls `adoptNetworkTypes` before it writes. The browser check (T19) proves that a library type that the drawing has not adopted draws with its own color after the run, not with the default look.
5. **Verify UI wiring through the real DOM.** T21, T22, T25 and T26 click the menu item, type into and choose in the real controls, and read the DOM. The scene API sets the drawing up and reads state.
6. **Merge lesson.** Each task ends with `pnpm build` at the root. The part check forces a build with no cache.

Other rules of `rules.md` section 2: no `pnpm add`; no `mupdf` import; no `window.confirm`; never prettier. The real rooms of the first floor come from the existing fixture. No placeholder fixture is made.

## 6. The phases and the tasks

Commands (the tester runs them from the root of the worktree `/root/MepApp/.claude/worktrees/agent-framework`, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. No environment variable before the command. Screenshots go to `/tmp/mepapp-shots/` with `shot('<task id>-<name>')`.

Rules for every browser step of this part (the rules of R2 to R5 apply):
- Open `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf` (tracked) with `openPdf`. One Chromium page at a time. The 10A drawing (`plattegrond begane grond 10A.pdf`, local only, scale `detect('100')`) is used in T26 only.
- The setup (`r6-lib.mjs`, T14) uses `setupRooms` of `r4-lib.mjs` to detect rooms and set the corridor type, and builds the equipment stamp and the terminal stamps with the scene API in the way of `buildSizingProject` (`r5-lib.mjs`). This is test setup, not a fixture file.
- While a dialog is open, click only inside `.mep-modal--route`.
- Independent proofs (not the planner's own numbers): (1) from the exported JSON, walk the graph from the start port and check that every target port is reached; (2) recompute the angle of each routed leg from the exported geometry; (3) check that each routed item has `routedBy` and no other item has it; (4) check that `computeNetworks`-independent grouping (a union-find in the page) gives one network for the run and leaves every other network unchanged; (5) compare the export before and after Undo.

Phases: **A** the mark (T01 to T03; T14 runs right after T01), **B** the layout and search engines in core (T04 to T08), **C** the planner (T09a, T09 to T16), **D** the scene (T17 to T19), **E** the UI (T20 to T22), **F** the checks (T14, T23 to T26).

| Task | Title | Depends on | Waits for | Files (main) |
|---|---|---|---|---|
| T01 | The mark: type, schema step 21, clean-up | none | none | `network.ts`, `project.ts`, `project.test.ts` |
| T02 | Mark rules in core: merge, paste, the walk, the clear helper | T01 | none | `segmentTool.ts`, `segmentPaste.ts`, `route-marks.ts`, tests |
| T03 | The hand drag clears the mark; browser check | T02, T14 | none | `selectTool.ts`, `scene.ts`, `r6-t03-check.mjs` |
| T04 | Move `resolveAngleSnap` to core; layout classes | none | none | `angle-snap.ts`, `route-layout.ts`, `tools/angleSnap.ts`, `index.ts` |
| T05 | Jog rule and path builders | T04 | none | `route-layout.ts`, `route-layout.test.ts` |
| T06 | `straightenPolyline` with the region test | T05 | none | `route-layout.ts`, `route-layout.test.ts` |
| T07 | The Steiner tree on a graph | none | none | `route-steiner.ts`, `route-steiner.test.ts` |
| T08 | The Hanan grid and the room spine | T05, T07 | none | `route-hanan.ts`, `route-hanan.test.ts` |
| T09a | Side rule in the finder: `portChoice: 'order'` | none | none | `route-ports.ts`, `route-ports.test.ts` |
| T09 | Planner part 1: input, preconditions, groups, start (takes `removal` as input, does not call T02) | T04, T07 | none | `route-build.ts`, `route-plan-warnings.ts`, tests |
| T10 | Planner part 2: the trunk | T06, T07, T09 | none | `route-build.ts` or `route-trunk.ts`, tests |
| T11 | Planner part 3: branches and spines | T08, T10 | none | `route-branch.ts`, tests |
| T12 | Planner part 4: off-graph, topology, items, marks | T02, T11 | none | `route-topology.ts`, `route-build.ts`, tests |
| T13 | Planner part 5: collisions, foreign check, invariant | T12 | none | `route-checks.ts`, `route-build.ts`, tests |
| T15 | Planner part 6: real crossings, shaft, capacity, sizes | T12 | none | `route-plan-warnings.ts`, `route-build.ts`, tests |
| T16 | The chain on real rooms (test only) and the re-run | T13, T15, T02 | none | `route-run.test.ts` |
| T14 | Browser setup `r6-lib.mjs` (move it early: it needs T01 only) | T01 | none | `.claude/roadmap/browser/r6-lib.mjs` |
| T17 | Scene: `planRoute` and the preview layer | T16, T14, T09a | none | `scene.ts`, `routePreviewLayer.ts`, `index.ts` |
| T18 | Scene: `applyRoute` | T14, T17 | none | `scene.ts`, `r6-t18-check.mjs` |
| T19 | Scene browser check: undo, adoption, networks | T18 | none | `r6-t19-check.mjs` |
| T20 | Texts and line builders | T15 | none | `routeBuildPlan.ts`, `routeBuildPlan.test.ts` |
| T21 | Dialog: preview section | T17, T20 | none | `RouteBuildSection.tsx`, `RouteDialog.tsx`, `theme.css` |
| T22 | Dialog: sizing check box, Place, result | T18, T21 | none | `RouteBuildSection.tsx`, `routeBuildPlan.ts`, `r6-t22-check.mjs` |
| T23 | Re-run, edits and paste (browser) | T03, T22 | none | `r6-t23-check.mjs` |
| T24 | Save, load and PDF round trip (browser) | T22 | none | `r6-t24-check.mjs` |
| T25 | Water, extension, foreign type (browser) | T22 | none | `r6-t25-check.mjs` |
| T26 | The part check | all | none | `.claude/roadmap/browser/r6-check.mjs` |

**Order for the director.** All five questions are answered (Q-R6-01 B, Q-R6-02 A, Q-R6-03 A, Q-R6-04 A, Q-R6-05 A). No task waits for an answer and the stop rule at T12 is gone. T01 to T03, T12 and T14 onward are unblocked. T09 to T11 are in progress and keep their order. Tasks follow the dependency column. T20 reads only the plan shape of the warning codes; it needs T15 for its final field names, so it runs after T15. If two runs overlap during the tests (Q-R6-05 A), the director alerts the user. The task numbers T14 and T15 are out of order on purpose: run T14 right after T01 (it needs T01 only), because T03 and T17 need it for their browser checks.

Jobs on the same file run one after another, in the order of the task numbers (T14 after T01, T15 after T13): T05 and T06 (`route-layout.ts`); `route-build.ts` in T09, T10, T12, T13, T15; `route-plan-warnings.ts` in T09 and T15; T17 and T18 (`scene.ts`); T21 and T22 (`RouteBuildSection.tsx`). `packages/core/src/index.ts` is a shared file: each task adds its export lines, one task after another. T07 runs in parallel with T04 to T06. T20 runs in parallel with T17 to T19.

### T01. The mark: type, schema step 21, clean-up
- **Depends on:** none.
- **Files:** `packages/core/src/network.ts`, `packages/core/src/project.ts`, `packages/core/src/project.test.ts`, `packages/core/src/group-networks.test.ts` (lines 74-75 expect schema 20), `packages/core/src/index.ts`. The implementer searches `packages` for other tests that name 20 (`grep -rn "schemaVersion\|CURRENT_SCHEMA_VERSION"`).
- **Shapes:** section 4.1. `RoutedMark`, `ROUTED_MARK`, the optional field on `Segment` and `Fitting`. `CURRENT_SCHEMA_VERSION = 21`. The step `{ fromVersion: 20, toVersion: 21, ... }` with a comment in the style of the step 19 to 20 (`project.ts:320`-`:330`). `withCleanRoutedMark(item)` for segments and fittings in `loadProject`.
- **Must not touch:** the other steps, `serializeProject`, the scene, `networkSizing`.
- **Tests (core):** a v20 file loads with `schemaVersion` 21 and its segments and fittings are unchanged (deep equal); a v21 file with `routedBy: 'route'` on a segment and on a fitting round-trips through `serializeProject` and `loadProject`; `routedBy: 'x'`, `routedBy: true`, `routedBy: 1` load with the field removed and the other fields kept; an item without the field is the same object (`toBe`); a file of schema 22 is refused with the `SchemaMigrationError` text; `grep` shows no test that still expects 20.
- **Verify:** core tests; `pnpm typecheck`; `pnpm build`.
- **Size:** about 30 lines and 60 of tests.

### T02. Mark rules in core: merge, paste, the walk, the clear helper
- **Depends on:** T01.
- **Files:** `packages/core/src/segmentTool.ts`, `packages/core/src/segmentPaste.ts`, `packages/core/src/route-marks.ts` (new), their tests, `index.ts`.
- **Shapes:** section 4.2 `routedRunOf`, `clearRoutedMarks`. `mergeSegmentsAtFitting` keeps `routedBy` only when `first` and `second` both have it. `pasteSegments` deletes `routedBy` from each pasted segment. `routedRunOf(state, startStampId, startPortId)` walks as step 2 of section 4.3 says. It returns sorted ids.
- **Must not touch:** `splitSegmentAtFitting` (it keeps the mark by the spread; a test pins it), `computeNetworks`.
- **Tests (core):** merge of two marked pieces keeps the mark; merge of a marked and an unmarked piece (any order) has no mark; split keeps the mark on both pieces and the new fitting has none; paste of a marked segment gives an unmarked copy and an unmarked fitting; the walk on a built tree: it reaches all marked segments; a hand-drawn segment in the middle stops it, and the marked segments beyond it are not in the result; the fitting list excludes a marked fitting that a remaining segment uses; a run with count 0 returns empty arrays; **the stub case**: a start port with one unmarked segment whose far end is a fitting G, and a marked run behind G: the walk begins at G, the set holds the marked run, and the stub and G are not in it (section 4.7); a stub whose far end is a port gives an empty set; **the shared terminal case**: a terminal with two ports in one port group, run A on `p1`, run B on `p2`: the walk of A removes the marked segment on `p1` and no segment of B (section 4.7); a stamp port other than the start port is a leaf even when the stamp has a port group; the walk passes the start port only at its beginning; the walk does not leave the start network when two routed runs touch only at a hand-drawn segment (the "two routed networks joined by hand" case of the overview).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 80 lines and 120 of tests.

### T03. The hand drag clears the mark; browser check
- **Depends on:** T02, T14. **Waits for nothing (Q-R6-01 and Q-R6-02 are answered).**
- **Files:** `packages/render/src/tools/selectTool.ts`, `packages/render/src/scene.ts` (only if the tool needs a scene call), `r6-t03-check.mjs` (work folder).
- **What it changes:** at the drag site (`selectTool.ts:176`-`:197`), after `applyConnectivityCascade`, clear `routedBy` on each fitting in `fittingOriginals` (the fittings that the drag moves) and on each segment attached to one of them (`segmentsAtFitting`). It does not clear a segment whose geometry changed because a stamp port moved. The implementer reads the drag code first and reports the exact place. A move of a stamp keeps the marks (P-R6-MOVE).
- **Must not touch:** the cascade, `recomputeAttachedSegments`, the stamp move code.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `r6-t03-check.mjs`: load a small routed project (marks written by the scene API in the setup, since R6 has no Place yet; T14 builds it), drag a routed fitting with real mouse moves; the export shows no mark on that fitting and on the segments that touch it, and the marks of the far segments stay; Undo restores the marks; **drag the start stamp with the mouse: the marks stay on every segment and fitting** (the stamp drag moves the end geometry of the segment on its port, and that segment keeps its mark); move a terminal stamp: the marks stay; change the network type of the run in Properties: the marks stay. No page error.
- **Size:** about 20 lines.

### T04. Move `resolveAngleSnap` to core; layout classes
- **Depends on:** none.
- **Files:** `packages/core/src/angle-snap.ts` (new), `packages/core/src/route-layout.ts` (new, constants and `legClass` only), `packages/render/src/tools/angleSnap.ts` (re-export), `packages/core/src/index.ts`, tests.
- **Shapes:** `resolveAngleSnap` moves with its body unchanged. The render file becomes `export { resolveAngleSnap } from '@mepapp/core';`. Constants and `legClass`, `isLayoutPath` of section 4.2. **`legClass(a, b)` calls `resolveAngleSnap(a, b, ROUTE_ANGLE_INCREMENT_DEGREES)`**: the leg is on the angle set when the snapped point is within `1e-6` of the leg length from `b`; it is `axis` when the snapped angle is a multiple of 90 degrees and `diagonal` otherwise. So the moved code has a user in core and the set is the Snap Angle set.
- **Must not touch:** `alignmentGuides.ts`, `dragSnap.ts` (they keep their import path).
- **Tests (core):** `resolveAngleSnap` gives the same values as before on 8 sample points (copy the cases from any existing test; if none exists, write them from the body: `anchor (0,0)`, `raw (10,1)`, increment 45 gives `(10.0499, 0)`); `legClass((0,0),(100,0))` is `axis`; `(0,0),(0,50)` is `axis`; `(0,0),(70,70)` is `diagonal`; `(0,0),(100,1)` is `free`; `isLayoutPath` accepts a path of axis and diagonal legs and rejects one free leg; a zero-length leg is `axis`. The render tests that exist still pass.
- **Verify:** core tests; `pnpm --filter @mepapp/render` tests if they exist; `pnpm typecheck`; `pnpm build`.
- **Size:** about 50 lines and 50 of tests.

### T05. Jog rule and path builders
- **Depends on:** T04.
- **Files:** `packages/core/src/route-layout.ts`, `packages/core/src/route-layout.test.ts`.
- **Shapes:** `jogPath`, `elbowPath`, `applyJogRule` of section 4.2 and step 7 of section 4.3. All paths are in millimetres.
- **Must not touch:** `angle-snap.ts`.
- **Tests (core):** every value of section 4.7 "Jog rule": jump 600, jump 1000, jump 1001, jump 1500, the short runs, the pure diagonal, and the branch tap case. The length of each path equals the sum of its legs within 1e-9. `applyJogRule` never changes the first and the last point. It never makes a leg shorter than `MIN_LEG_MM` when the input has none. A path with a single bend is unchanged. A path with a jump in the opposite direction (a mirror) gives the mirror result. `isLayoutPath` accepts each output. A property test over 200 random pairs: the output of `jogPath` + `applyJogRule` is a layout path, starts at `from` and ends at `to`.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 110 lines and 130 of tests.

### T06. `straightenPolyline` with the region test
- **Depends on:** T05.
- **Files:** `packages/core/src/route-layout.ts`, `packages/core/src/route-layout.test.ts`.
- **Shapes:** `straightenPolyline` and the rules 1 to 5 of step 7. The region callback is a pure function in millimetres. The task searches `packages/core/src/rooms/` and `route-wall.ts` for a point-to-ring distance helper. If one exists, a second function `insideRouteArea(rooms, areaRoomIds, mmPerPt, toleranceMm)` uses it; else the task adds the helper `distanceToRing` to `route-wall.ts` with its own test.
- **Must not touch:** `route-area.ts`.
- **Tests (core):** a straight axis polyline stays; the drift case `(0,0) (10000,100)`; a drift above `MAX_DRIFT_MM` gives a jump; an L-shaped corridor polyline `(0,0) (10000,0) (10000,8000)` stays; a tilted polyline `(0,0) (10000,600)` gives the 45 version; a region that excludes the Z gives the per-vertex path; **a link case**: a polyline `(0,0) (6000,0) (6400,0) (12000,0)` whose middle leg `(6000,0)-(6400,0)` is a wall gap, with a region that accepts only the two rooms `x <= 6000` and `x >= 6400` and a wall node at `(6200,0)`: the path stays (the samples in the gap are within `WALL_GAP_MM` of the wall node) and `free` is false; the same polyline with a wall node 2000 mm away gives `free: true` for the gap; a region that excludes both gives the original polyline with `free: true`; the output always starts and ends at the input end points except for the drift of a middle vertex.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 100 lines and 110 of tests.

### T07. The Steiner tree on a graph
- **Depends on:** none.
- **Files:** `packages/core/src/route-steiner.ts`, `packages/core/src/route-steiner.test.ts`, `index.ts`.
- **Shapes:** `steinerTree` of section 4.2: Dijkstra from the tree, repeated. Ties break by the order of `nodeIds`, then by the edge id. A terminal with no path goes to `unreached`.
- **Must not touch:** the R4 graph code.
- **Tests (core):** the square graph of section 4.7 gives cost 30 and 3 edges; a path graph gives all edges; a star; a graph with two parts gives `unreached`; the same input gives the same output twice; the order of terminals in the input does not change the result (sorted by the rule); a random test over 100 small graphs: the tree has no cycle, spans the reached terminals, and its cost is at most 2 times the cost of a brute force optimum for graphs with at most 8 nodes (this is the bound of section 3).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 80 lines and 90 of tests.

### T08. The Hanan grid and the room spine
- **Depends on:** T05, T07.
- **Files:** `packages/core/src/route-hanan.ts`, `packages/core/src/route-hanan.test.ts`, `index.ts`.
- **Shapes:** `roomSpine` of section 4.2, with `entryDir` and the leaf rule for ports. The nodes are the grid points, each split by axis (H or V). A port node can be the end of a path and nothing else: the search does not expand from it and no later path attaches to it. A turn edge between the two states costs `BEND_PENALTY_MM`. A grid edge is blocked when a sample is not `inside`. A grid edge costs its length plus `CROSSING_PENALTY_MM` times `crossesExisting`. The result paths are polylines from the root to each port, with the shared parts merged by the caller (T12). `lengthMm` is the real length of the tree edges.
- **Must not touch:** the R4 code.
- **Tests (core):** the three Hanan cases of section 4.7 (lengths 7000, 8000, 7000; the 4-port room gives 6 paths, 2 junction nodes (a cross and a tee), no elbow on a port, every port a leaf); the 8000 case with `entryDir` reversed gives a longer tree (the test pins that the tie-break is what picks 8000); a port is never an inner node of any path; a port outside the region is in `unreachedPortIds`; a wall in the middle of a rectangle (the `inside` test excludes a vertical strip) makes the tree go around; a crossing penalty moves a path to a longer free line when the detour is shorter than the penalty; one port gives a path with at most 1 bend; the same input gives the same output; with 20 ports the time is under 100 ms (the test prints it).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 130 lines and 120 of tests.

### T09a. Side rule in the finder: `portChoice: 'order'`
- **Depends on:** none.
- **Files:** `packages/core/src/route-ports.ts`, `packages/core/src/route-ports.test.ts`.
- **Shapes:** `RoutePortsInput.portChoice?: 'nearest' | 'order'` (default `'nearest'`, so R2 does not change). With `portsPerStamp: 'one'` and `'order'`, the finder keeps, for a stamp with more than one open port of the chosen type, the open port that comes first in `getStampPorts` order, not the port nearest to the start port (`route-ports.ts:99`).
- **Must not touch:** the R2 dialog behaviour (the dialog does not pass `portChoice`).
- **Tests (core):** the R2 tests still pass (default unchanged); 3 radiators with two ports `a` and `b` each (stamp port order `a`, `b`), rotated 0, 90 and 180 degrees, all with the routing target Heating Water: run 1 (start port `Flow`) with `'order'` returns the port `a` of all three; after run 1 writes a segment on each `a`, run 2 (start port `Return`) returns the port `b` of all three; with `'nearest'` and the same layout the sides differ between radiators (the test pins the defect that the rule removes); a stamp with one open port is unchanged.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 20 lines and 70 of tests.

### T09. Planner part 1: input, preconditions, groups, start
- **Depends on:** T04, T07. (The removal set is an input, so T09 does not need T02.)
- **Files:** `packages/core/src/route-build.ts` (new), `packages/core/src/route-plan-warnings.ts` (new), their tests, `index.ts`.
- **Shapes:** `RouteBuildInput`, `PlannedRoute`, `RouteStats`, `RoutePlanWarning`, and steps 1 to 4 of section 4.3. Steps 5 and later return an empty plan for now. The conversion to millimetres. `S'` is built from `state` and `input.removal` with a local filter.
- **Must not touch:** `route-start.ts`, `route-ports.ts`, `route-area.ts`.
- **Tests (core):** every precondition code (`multi-page`, `no-calibration`, `area-empty`, `gravity-not-routed` for `sanitary-waste`, `start-error`, `foreign-start`, `no-targets`) with a built input; a start port with a hand-drawn stub gives `extends-stub`; a start port with a stub whose far end is a port gives `start-unreachable`; a stub whose network holds a segment of another type gives `foreign-start`; a same-type join through a port group gives `same-type-join` and no error; with a non-empty `removal`, the planner works on `S'` (a port whose segment is in the removal set counts as open, and the start port with a removed marked segment counts as free); the groups: ports of one room are one group, a port in no room is in the outside group; the input is not changed (deep equal); `draft-2d` is last.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 140 lines and 130 of tests.

### T10. Planner part 2: the trunk
- **Depends on:** T06, T07, T09.
- **Files:** `packages/core/src/route-trunk.ts` (new), `packages/core/src/route-build.ts`, tests.
- **Shapes:** steps 5 to 7. The graph copy, the root, the terminals, the retry with other entries, the walk and `straightenPolyline` for each trunk edge. Output: trunk polylines in mm and the tap data (nodes of the tree).
- **Must not touch:** the R4 `RouteArea` (a test checks it is deep-equal after the call).
- **Tests (core):** a built area (two corridor edges and three entries) gives a tree of the expected edges; the terminal is the tap node (`rt-ry-`) of an entry and an entry connector (`rc-ry-`) is not in the trunk, a link connector (`rc-rk-`) is; **a link case**: two corridor rooms joined by a link with a wall gap of 400 mm (the region accepts only the two polygons plus the wall disc): the trunk through the link is a layout path with `free: false`; the same link with a gap of 1800 mm (above `2 * WALL_GAP_MM`, so a gap of 900 mm still passes) gives `free-angle` for that edge; a terminal in another graph part is retried and then reported as off graph; the root is the nearest point of the start; an area with a shaft node as the start; the trunk of a tilted corridor is a layout path; `free-angle` shows when the region excludes every layout; the same input gives the same output.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 130 lines and 120 of tests.

### T11. Planner part 3: branches and spines
- **Depends on:** T08, T10.
- **Files:** `packages/core/src/route-branch.ts` (new), tests.
- **Shapes:** step 9. The tap and its clamp, the branch path, the call of `roomSpine` with the room polygon test, the merge of the spine paths into one tree of paths.
- **Must not touch:** `route-hanan.ts`.
- **Tests (core):** the branch cases of section 4.7 (the straight branch of 2400 mm, the clamp case 2482.84 mm); the room of 4 grilles with the trunk on `y = -2000` gives a total new length of 9000 mm and the 6 paths of section 4.7 (the count of segments is tested in T12); the two-taps case of section 4.7 (the second tap moves to `x = 7300`, branch length 2441.42 mm); a tap whose nearest trunk leg is a 45 degree leg moves to the nearest axis leg of the same trunk edge; the entry of a room that lies on the end of a leg; a room with one port has at most 1 bend; a port that the spine cannot reach is returned for the off-graph step.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 120 lines and 110 of tests.

### T12. Planner part 4: off-graph, topology, items, marks
- **Depends on:** T02, T11.
- **Files:** `packages/core/src/route-topology.ts` (new), `packages/core/src/route-build.ts`, tests.
- **Shapes:** steps 8 and 11. The off-graph connection (`elbowPath` + jog rule from the nearest point of the built route). The graph of all planned paths: merge equal vertices (within 1e-6 mm), split a leg at a vertex that lies on it, remove a degree-2 node on a straight line, give each remaining node a fitting kind, make the segments with the endpoints, the sizes, the page and the mark. The ids come from the factories in the order: fittings sorted by (x, y), then segments sorted by the pair of end ids.
- **Must not touch:** the mark constant (it comes from T01).
- **Tests (core):** the 4-grille room with the trunk of section 4.7 gives 6 new segments, 3 new fittings (the tee on the trunk, a cross and a tee in the room) and no fitting on a port; off graph (the default): a room with no connected entry gets an off-graph connection from the nearest point of the built route, `room-off-graph` lists it (Warning) and its ports are in the plan; hand value: trunk leg on `y = 0` from `x = 0` to `x = 10000`, room entry-less with one port at `(4000, 3000)`: the nearest point is `(4000, 0)` and the connection is one vertical leg of 3000 mm with a tee on the trunk; each wall that `crossingsAlongPath` finds on the connection adds one to the `wall-crossings` count; a second room that sits behind a foreign-type segment on both layouts is skipped, listed in `rooms-skipped`, and its ports are not in the plan; a room with no target port is not listed; a Heating Water run gets `diameter` 25 on each new segment, a Supply Air run 200; a Y junction gives a `tee`; four legs at a point give a `cross`; a bend gives an `elbow`; two collinear legs merge with no fitting; every planned item has `routedBy`; the end of the first segment is the start port `{ kind: 'port', ... }`; the ends at target ports use the port; no planned item has the id of an existing item; the ids are the same for the same input and counters; every planned leg is an `axis` or a `diagonal` leg except those in `free-angle`; the sum of the segment lengths equals the sum of the path lengths within 1e-6.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 140 lines and 130 of tests.

### T13. Planner part 5: collisions, foreign check, invariant
- **Depends on:** T12.
- **Files:** `packages/core/src/route-checks.ts` (new), `packages/core/src/route-build.ts`, tests.
- **Shapes:** steps 10 and 12, and the pure function `canJoinPoint(graph, point: ConnectionPoint, typeId): { ok: true } | { ok: false; hits: string[] }` that the overview asks for. It finds the network of the point with `computeNetworks` and checks every segment type, also through a port group.
- **Must not touch:** `network.ts`.
- **Tests (core):** a route end on a foreign fitting is refused (`canJoinPoint`); a port group that joins the point to a foreign segment of a **different** type is refused; the same type through a port group is allowed and gives the warning `same-type-join` with the ids; the invariant fires on a built case (a stub fitting that also holds a foreign segment) and gives `internal-join`; after a normal plan, `computeNetworks` of the new state has networks with one type and the old foreign networks are unchanged (set equality of segment ids); a crossing of a planned leg with a foreign segment is counted once; a shared end point is not counted; a collinear overlap of 600 mm is counted as an overlap, of 200 mm is not; an overlap with segments that carry the mark gives the Note `shares-lane` once, and no `existing-overlap`; many overlapping legs give one line for the run, not one for each leg; a new fitting 30 mm from a foreign fitting is listed.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 110 lines and 120 of tests.

### T15. Planner part 6: real crossings, shaft, capacity
- **Depends on:** T12.
- **Files:** `packages/core/src/route-plan-warnings.ts`, `packages/core/src/route-build.ts`, tests.
- **Shapes:** steps 13 to 16. The sum of `crossingsAlongPath`, the split into `wall-crossings` and `shaft-crossing`, `capacity-over` and `capacity-unit`, `no-limits`, `short-leg`, `hand-kept-size`, the optional sizes from `sizeNetwork` (for the marked segments only), and the order of the lines (errors first, then warnings, then info, `draft-2d` last).
- **Must not touch:** `route-crossings.ts`, `flow.ts`, `sizing-network.ts`.
- **Tests (core):** the capacity numbers of section 4.7 (warning at 400 against 300; none at 500; none with no capacity; the Note `capacity-unit` instead of the warning when the type has no `flowUnit`); a stub of 2 hand-drawn segments in the network: the plan sizes do not include them and `hand-kept-size` says 2; a routed leg of 300 mm with a sized diameter of 200 gives `short-leg` (300 < 400), a leg of 400 does not; a path through two rooms gives 1 crossing; a path through a shaft room gives `shaft-crossing`; an open run (gap above 600 mm) is not a crossing; with limits the plan holds sizes equal to `sizeNetwork` on the same state, and the written segments have the shape of the pick; without limits `no-limits` shows; the order of the lines.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 100 lines and 110 of tests.

### T16. The chain on real rooms (test only) and the re-run
- **Depends on:** T13, T15, T02.
- **Files:** `packages/core/src/route-run.test.ts` (new). No product code, unless the test finds a defect (then the lead reports it and adds a task).
- **What it does:** it loads the first floor with `loadFirstFloorRooms` (`route-area-fixture.testutil.ts`), computes the route area, builds a start stamp in the largest corridor and one target port in each served room (the label point), and runs `planRoute`. It prints and asserts: (1) every plan leg is a layout leg except those in `free-angle`; the share of free legs by length is under 5 % (the measured value is printed and the floor is set from it, as R4 T12 did); (2) every port that the plan connects is reached by a walk over the planned items; (3) `internal-join` does not fire; (4) the total `wall-crossings` count is printed and compared to the number of served rooms with an entry (each should be about 1, the R4 consistency of 16 of 18 is the reference); (5) the time of `planRoute` is printed (limit 500 ms); (6) the re-run: apply the plan to a state, run `routedRunOf`, compute the target ports on the reduced state (with `portChoice: 'order'`), run `planRoute` with that `removal`: the new plan has the same counts as the first and the removal set equals the first plan's items; the same with a hand-drawn stub at the start port (the stub case of section 4.7); (7) a hand-drawn segment added on a routed fitting stays after the re-run and the fitting stays; (8) the plan does not change the input (deep equal). The test prints each failing room for review. A floor below 50 % of any share is a defect to send back.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 150 lines of tests.

### T14. Browser setup `r6-lib.mjs`
- **Depends on:** T01. **Waits for nothing** (it writes the mark in the setup of T03).
- **Files:** `.claude/roadmap/browser/r6-lib.mjs` (new).
- **Shapes:** it imports `lib.mjs`, `r4-lib.mjs` (`setupRooms`, `screenOf`, `baseline`, `sameAsBaseline`) and `r5-lib.mjs`. `buildRoutingProject(t, { type, targets, capacities })`: detects rooms on the first floor (scale `50`), sets the corridor type, makes an equipment stamp with the port `out` in the largest corridor, makes one terminal stamp with the routing target for each of `targets` rooms (the label point of the room, the port `in`), adopts the network type, writes capacities, and loads the project with `loadProjectFromJson`. `buildRoutedSample(t)`: a small routed run with marks written by the scene API (for T03 only). Helpers: `exportRun(page)`, `legAngles(page)` (the independent angle test), `reachFromStart(page)` (the independent union-find walk), `markedIds(page)`.
- **Verify:** a small check `r6-t14-check.mjs` that builds the project and prints the counts. No product code.
- **Size:** about 150 lines.

### T17. Scene: `planRoute` and the preview layer
- **Depends on:** T16, T14, T09a.
- **Files:** `packages/render/src/scene.ts`, `packages/render/src/routePreviewLayer.ts` (new), `packages/render/src/index.ts`, `r6-t17-check.mjs` (work folder).
- **Shapes:** section 4.5. `planRoute` takes the scope inputs of the dialog (not a port list), computes `routedRunOf`, builds `S'` with its `portSegmentTypes`, calls `findRoutePorts` with `portChoice: 'order'`, and calls the core planner with counters that it does not advance. `setRoutePreview` draws in `redrawOverlay`. The preview is never dirty.
- **Must not touch:** `serializeDocument`, the PDF export, `applyNetworkSizes`.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `r6-t17-check.mjs` through the scene API (the dialog does not exist yet): `planRoute` on the T14 project returns `status ok`; after a first `applyRoute` is not yet available, the check writes a marked run with the scene setup of T14 and calls `planRoute` again: `portsAfterRemoval` equals the number of ports of the old run (the re-run keeps its targets); `exportProject()`, `canUndo`, and `isDirty` are the same before and after `planRoute` and `setRoutePreview`; the overlay shows pixels in the type color (read from a screenshot: the check counts pixels of the line color near a planned point); `setRoutePreview(null)` and a page change clear them; the nextSegmentSeq is unchanged. Screenshot: `T17-preview-overlay`.
- **Size:** about 120 lines.

### T18. Scene: `applyRoute`
- **Depends on:** T14, T17.
- **Files:** `packages/render/src/scene.ts`, `r6-t18-check.mjs` (work folder).
- **Shapes:** section 4.5. One `Transaction` named "Route network". `adoptNetworkTypes` first. The invariant check before the commit. The optional sizes. The emits. The removed ids leave `doc.selectedIds` (a check selects a routed segment, runs again, and `getSelection()` holds no removed id).
- **Must not touch:** the plan function, `applyNetworkSizes`.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `r6-t18-check.mjs` through the scene API: `applyRoute` writes the items; `exportProject()` has the planned counts; every new item has the mark; the independent walk from the start port reaches every target port; every leg is axis or diagonal (independent test); Undo restores the export exactly (`sameAsBaseline`); Redo gives the same counts. With `size: true` and limits saved, the sizes are in the export and Undo removes them too.
- **Size:** about 70 lines.

### T19. Scene browser check: undo, adoption, networks
- **Depends on:** T18.
- **Files:** `r6-t19-check.mjs` (work folder).
- **What it checks:** (1) rule 4: a project whose `networkTypes` is empty, with `supply-air` as the routing target: after `applyRoute`, `exportProject().networkTypes` holds `supply-air` and a screenshot shows the line in the library color, not the default; (2) rule 1/2: a second network of another type is drawn before the run, touching the corridor in 2D; after the run, the independent union-find gives the old network unchanged (same segment ids) and the new run as one network; (3) a foreign segment on the start port gives `refused` with `port-foreign-type` and writes nothing; (4) a stub case: a hand-drawn stub at the start port is kept and the route starts at its far end; (5) `planRoute` twice gives equal plans (ids and counts); (6) no page error.
- **Size:** about 120 lines of check.

### T20. Texts and line builders
- **Depends on:** T15.
- **Files:** `packages/ui/src/components/routeBuildPlan.ts` (new), `packages/ui/src/routeBuildPlan.test.ts` (new).
- **Shapes:** section 4.6 texts, `buildText`, `routeBuildLines`, `routeBuildSummary`. A line has `{ code, severity, text, hint }`.
- **Must not touch:** `routePlan.ts`, `sizePlan.ts`.
- **Tests (UI):** every key has a text; each text with sample numbers has 140 characters or less; no text holds "door", "crossing" as a claim of fact about a fire wall (the hint says "check"), or a Dutch word; the plural forms (1 segment, 2 segments); the order of the lines follows the plan; `warnShaft` uses the room name; the severity of each code matches section 4.2.
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 120 lines and 100 of tests.

### T21. Dialog: preview section
- **Depends on:** T17, T20.
- **Files:** `packages/ui/src/components/RouteBuildSection.tsx` (new), `packages/ui/src/components/RouteDialog.tsx`, `packages/ui/src/theme.css`.
- **What it adds:** the section of 4.6 without the room list, the size check box and the Place button: the pending line, the summary, the removal line, the warning lines with the labels, the fire hint, the draft line. It calls `scene.planRoute` 300 ms after the last change of the inputs and on the events `drawingChanged`, `pageChanged`, `documentActivated`, `roomsChanged`, `routeAreaChanged`, `networkSizingChanged` and `flowSolved`. It calls `setRoutePreview` while it shows and clears it on unmount. It hides in the refusal branch of `RouteDialog` (multi-page).
- **Must not touch:** the R2 inputs, `RouteAreaSection`.
- **Verify:** UI tests (the pure parts); `pnpm build`. The browser steps run in T22 (the dialog opens through the real menu item that exists).
- **Size:** about 110 lines.

### T22. Dialog: sizing check box, Place, result
- **Depends on:** T18, T21.
- **Files:** `packages/ui/src/components/RouteBuildSection.tsx`, `packages/ui/src/components/routeBuildPlan.ts`, `theme.css`, `r6-t22-check.mjs` (work folder).
- **What it adds:** `route-build-size` (shown when `getNetworkSizing` returns an entry for the run key; default on), `route-place`, `route-build-result`. Place calls `scene.applyRoute(plan, { size })` and then shows the result line. A second press of Place is possible after a change (the plan is recalculated and now removes the routed items of the first press).
- **Must not touch:** the plan, the scene.
- **Verify:** UI tests; `pnpm build`. Browser check `r6-t22-check.mjs` through real clicks and typing (menu item `^\s*Route network…\s*$`; the controls `route-start`, `route-type`, `route-port`, `route-scope`):
  1. Open the dialog on the T14 project. Pick the start stamp, the port `out`, the type Supply Air, the scope "rooms" with the rooms of the project. `route-build-pending` shows and then `route-build-summary` shows. The numbers equal `planRoute` through the scene API.
  2. `route-place` is enabled. The preview shows on the plan (pixels of the type color).
  3. Clear one `route-room` check box of the R2 scope (the existing control): the summary changes and that room is not in the plan. In a project with one off-graph room: the room is in the plan, `route-build-line-room-off-graph` shows (Warning) and lists the room, and no `route-build-offgraph` control exists. In a project where a room cannot be joined without joining another network: `route-build-line-rooms-skipped` shows (Note).
  4. Click `route-place`. `route-build-result` reads "Placed N segments and M fittings." with N and M equal to the export difference. The open-port count in the status bar goes down.
  5. Click `.mep-rail-btn[title="Undo"]`. The export equals the baseline.
  6. The size check box: with no limits saved it does not show, and `route-build-line-no-limits` shows as a Warning with the text "Segments are not sized. Sizes shown are placeholders." (the segments in the export of a Heating Water run have `diameter` 25); After `setNetworkSizing` in the setup (limits for the run key), it shows; Place with it on writes sizes (the Properties panel of a clicked segment shows a size); Undo removes all.
  7. The errors: a project with a foreign segment on the start port shows `route-build-line-start-error` with `data-severity="error"`; `route-place` is disabled. A drawing with no scale shows `route-build-line-no-calibration` (build a project without calibration).
  8. The warnings: `route-build-line-wall-crossings` shows with `data-severity="warning"`, the label "Warning", and the fire hint that starts with "Corridor and shaft walls are often fire rated."
  9. A 400 px run: `scrollWidth <= clientWidth` of `.mep-modal--route`.
  10. No page error.
  11. A re-run shows `route-build-ports-after` ("After the removal, N ports are open for this run.") and the plan still holds all ports of the run (the summary port count equals the first run).
  Screenshots: `T22-route-preview`, `T22-route-warnings`, `T22-route-errors`, `T22-route-placed`, `T22-route-size`, `T22-route-offgraph`, `T22-route-narrow`.
- **Size:** about 100 lines.

### T23. Re-run, edits and paste (browser)
- **Depends on:** T03, T22. **Waits for nothing (Q-R6-01 and Q-R6-02 are answered).**
- **Files:** `r6-t23-check.mjs` (work folder).
- **What it checks (real DOM; the canvas actions use real mouse moves):**
  0. The stub case: draw a hand stub from the start port to a fitting G with the segment tool, run (the route starts at G), run again with the same inputs: `route-build-remove` counts the routed run only (not the stub), the stub and G are in the export after Place, and the new run is not doubled (the segment count equals the count after the first run).
  1. Run once. Open the dialog again with the same inputs: `route-build-remove` reads "This run removes N routed segments and M fittings. Hand-drawn segments stay." with N and M equal to the marked counts in the export. Place: the export counts are the same as after run 1 and the ids differ.
  2. Hand segment: draw one segment with the segment tool from a routed fitting to an empty point. Re-run: the remove line count excludes the hand segment and that fitting; after Place, the hand segment and its fitting are in the export.
  3. Drag: drag a routed fitting with the mouse (T03). The re-run count is lower by the items that lost the mark. The dragged items stay after Place.
  4. Delete a routed segment and re-run: the run is rebuilt completely.
  5. Copy and paste a routed segment: the pasted segment has no mark (export).
  6. Insert a fitting on a routed segment by the context menu; remove a fitting between a marked and an unmarked segment: the merged segment has no mark; between two marked: it has the mark.
  7. Change the network type of the run in Properties: the marks stay. A re-run with the new type in the dialog replaces the run.
  8. Move the start stamp: the marks stay.
  9. The two-run case: run 1 from stamp A, run 2 from stamp B (same type, other rooms); the re-run of A removes only its own items (the segment ids of B are all in the export afterwards). A terminal with two ports in a port group, one port on run A and one on run B: the re-run of A leaves the segment on the port of B.
  10. A second run of the same type through the same corridor: the dialog shows the Note `shares-lane` once ("This route runs on top of N segments of earlier runs.") and no `existing-overlap` line for each leg.
- **Screenshots:** `T23-rerun-remove`, `T23-rerun-hand`.
- **Size:** about 150 lines of check.

### T24. Save, load and PDF round trip (browser)
- **Depends on:** T22.
- **Files:** `r6-t24-check.mjs` (work folder).
- **What it checks:** run and Place; Save through the OPFS handles of `lib.mjs`; reload the page; Open the saved file; the export equals the one before (marks included, `schemaVersion` 21); a re-run offers the same removal count; a schema 20 file (the same project with `schemaVersion: 20` and no marks) loads without error and a run on it removes nothing; a file with a bad `routedBy` loads with the field removed. The PDF export keeps the embedded JSON with the marks (read `mepapp-project.json` from the exported PDF as R2 to R4 checks do, if they do; the implementer reads `lib.mjs` and reports if there is no helper).
- **Size:** about 90 lines of check.

### T25. Water, extension, foreign type (browser)
- **Depends on:** T22.
- **Files:** `r6-t25-check.mjs` (work folder).
- **What it checks:** (1) Extension: a hand-drawn stub at the start port is kept and keeps its size after a run with limits saved; the route starts at its far end; the dialog shows `route-build-line-extends-stub` (Note) and `route-build-line-hand-kept-size` (Note); a re-run removes the routed part only. (7) Gravity: a Sanitary Waste run shows `route-build-line-gravity-not-routed` (Error) and `route-place` is disabled. (8) Capacity unit: with the library type that has no flow unit, the capacity line is a Note and not a Warning. (2) The foreign case of the overview: a second network of another type runs through the corridor; Place leaves it unchanged (independent union-find). (3) The capacity warning: set the start capacity to 300 and four terminals to 100: `route-build-line-capacity-over` shows with 400 and 300; set the start capacity to 500: the line is gone. (4) Water, Q-R6-03 A: a boiler with the ports `Flow` and `Return` and radiators with two ports each, all with the routing target Heating Water (Auto-place or the scene setup): run 1 from `Flow` connects the first port (stamp port order) of each radiator, with radiators rotated differently; the second run from `Return` finds the other port of each radiator, so the sides match across all radiators (the check reads the port id of each segment end in the export); after both runs the independent walk shows two separate networks and each radiator has one segment on each port. (5) `shaft-crossing`: a start in a shaft room shows the line with the fire hint (the 10A drawing, local; the check skips this step with a message when the PDF is absent). (6) A run in a drawing with no corridor shows `route-build-line-area-empty`.
- **Screenshots:** `T25-water-two-runs`, `T25-capacity-over`, `T25-extends-stub`.
- **Size:** about 150 lines of check.

### T26. The part check
- **Depends on:** all tasks above. **Waits for nothing (Q-R6-01 and Q-R6-02 are answered).**
- **Files:** `.claude/roadmap/browser/r6-check.mjs` (new). No product code.
- **What it does** (run 1: 1600 by 1000, English, `01_arch_first_floor.pdf`):
  1. Setup with `buildRoutingProject` for 6 served rooms. Baseline: the export JSON, `canUndo`, `isDirty`.
  2. The dialog (T22 steps 1 to 5) with real controls. Independent proofs: reach, angles, marks, networks.
  3. The numbers: the sum of the lengths of the written segments equals `stats.lengthMm` within 1 mm; the count of segments equals `stats.segments`; the sum of the capacities of the ports equals the total in the capacity line.
  4. Re-run (T23 steps 1 and 2 in short).
  5. Save and load (T24 in short); `schemaVersion` is 21.
  6. A file of schema 20 loads; the dialog runs on it.
  7. Run 2: 400 px wide. Run 3: dark mode (`open({ dark: true })`): a screenshot for the UI reviewer.
  8. A run on the 10A drawing (`detect('100')`, local file; skipped with a message when absent): the dialog shows a plan; the time of the plan is printed and compared to 500 ms; `shaft-crossing` shows if the start is in a shaft.
  9. No page error.
- **Screenshots:** `T26-dialog`, `T26-preview`, `T26-placed`, `T26-rerun`, `T26-dark`, `T26-narrow`, `T26-10A`.
- **Verify (the tester runs each command alone):**
  1. `pnpm --filter @mepapp/core test`
  2. `pnpm --filter @mepapp/ui test`
  3. `pnpm typecheck`
  4. `pnpm build` fresh (the tester reports the cached count)
  5. `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-check.mjs` exits 0.
  6. **No regression:** `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs` and `r5-check.mjs`, one command each, each exits 0.
- **After the check:** the director marks R6 done in this file, with the commit of each task and the verification, in the style of `auto-routing-r5.md`.

## 7. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T01 | yes (loader, step 21) | no | yes (and typecheck) | no | none |
| T02 | yes | no | yes | no | none |
| T03 | no | no | yes (and typecheck) | `r6-t03-check.mjs` | none |
| T04 | yes | no | yes (and typecheck) | no | none |
| T05 | yes | no | yes | no | none |
| T06 | yes | no | yes | no | none |
| T07 | yes | no | yes | no | none |
| T08 | yes | no | yes | no | none |
| T09a | yes | no | yes | no | none |
| T09 | yes | no | yes | no | none |
| T10 | yes | no | yes | no | none |
| T11 | yes | no | yes | no | none |
| T12 | yes | no | yes | no | none |
| T13 | yes | no | yes | no | none |
| T15 | yes | no | yes | no | none |
| T16 | yes (real rooms) | no | yes | no | none |
| T14 | no | no | no | `r6-t14-check.mjs` | none |
| T17 | no | no | yes (and typecheck) | `r6-t17-check.mjs` | `T17-*` |
| T18 | no | no | yes (and typecheck) | `r6-t18-check.mjs` | none |
| T19 | no | no | yes | `r6-t19-check.mjs` | `T19-*` |
| T20 | no | yes | yes | no | none |
| T21 | no | yes | yes | in T22 | in T22 |
| T22 | no | yes | yes | `r6-t22-check.mjs` | `T22-*` |
| T23 | no | no | yes | `r6-t23-check.mjs` | `T23-*` |
| T24 | no | no | yes | `r6-t24-check.mjs` | none |
| T25 | no | no | yes | `r6-t25-check.mjs` | `T25-*` |
| T26 | yes | yes | yes (fresh) | `r6-check.mjs`, `r2` to `r5` checks | `T26-*` |

The check scripts live in the work folder of the task, except `r6-lib.mjs` and `r6-check.mjs`, which stay in `.claude/roadmap/browser/`.

Dialogs that are new or changed, and their screenshots for the dashboard: the Route dialog (`T22-route-preview`, `T22-route-warnings`, `T22-route-errors`, `T22-route-placed`, `T22-route-size`, `T22-route-offgraph`, `T22-route-narrow`, `T23-rerun-remove`, `T23-rerun-hand`, `T25-capacity-over`, `T25-extends-stub`, `T26-dialog`, `T26-dark`, `T26-narrow`), the plan overlay (`T17-preview-overlay`, `T26-preview`, `T26-placed`, `T26-10A`) and the water case (`T25-water-two-runs`).

## 8. Where R6 stops and the next parts start

R6 gives: the routed marks (schema step 21), the walk and the removal, the layout engine (jog rule, straighten), the Steiner and Hanan search, the planner `planRoute`, the scene methods `planRoute`, `applyRoute` and `setRoutePreview`, the section in the Route dialog, and the checks.

- **R7** (circuits) needs nothing from R2 to R6. R7 takes schema step 22.
- **Not in R6 (later, after the main routing feature, as the user said for R5):**
  - a riser through several floors, a shaft that carries the sum of the floors, and a multi-page PDF (D-R2-02, D-R2-03);
  - a height (elevation) of a duct, clash detection with beams, other ducts and ceilings, and clearances (D-R4-02, G10);
  - a lock for a drawn main beyond the stub at the start port (P-R6-EXTEND);
  - drains (gravity networks): R6 refuses them with the error `gravity-not-routed` (P-R6-GRAVITY). A drain needs a slope and 45 degree joints. A later part can force the joints and show a no-slope warning;
  - balancing dampers, regulating valves and other control fittings: R6 places none;
  - a lateral lane for a second run in the same corridor (Q-R6-05 B);
  - routing through neighbour rooms (Q-R6-04 C; R6 serves off-graph rooms with the free orthogonal connection and warnings, Q-R6-04 A, and has no switch for it);
  - a grid angle for a building that is rotated on the sheet (R-2);
  - a pipe side on a water port (Q-R6-03 B);
  - a dialog switch to skip off-graph rooms (the user chose to serve them, Q-R6-04 A);
  - a second route type of the same run (for example a trunk with a lateral split into two floors);
  - reducers: a fitting of kind `reducer` where the size changes (R5 sizes by segment; the kind stays `elbow` or `tee`);
  - a size label on the plan (the Label feature);
  - Dutch texts (user note 2026-10-17);
  - a worker for the planner (only if T16 measures more than 500 ms).

## 9. Risks and what is not verified

- **R-1 The straightening of the center line is the least tested step.** The R4 center line is a guide with free angles. The tolerance rules (P-R6-JOG, P-R6-STEP) are planner values. T16 measures the share of free legs and the fallbacks on the first floor. If the share is high, the lead reports it before the UI tasks start.
- **R-2 A building that is rotated on the sheet.** "Orthogonal" is relative to the page axes (P-R6-AXES). A building at 20 degrees gets a zig-zag of 45 degree and 90 degree legs, and many warnings. The first floor and the 10A drawing are not rotated (not verified: R4 probes do not say). A grid angle is a later task.
- **R-3 The heuristic is not optimal.** The Takahashi and Matsuyama tree is within a factor 2 of the optimum, and usually much closer (not verified here). T07 tests the bound on small graphs. The Hanan grid result for a room is checked by hand in section 4.7.
- **R-4 Many rooms are off graph.** On the first floor, 15 of 33 rooms have no wall with a corridor. The user chose (Q-R6-04 A) to serve them. Those rooms get a long free orthogonal connection from the nearest point of the route. The connection crosses other rooms; the plan counts the walls, lists the rooms in `room-off-graph` and warns, and the result can look poor. About half of the rooms of the first floor use this path, so this is the main product risk. There is no switch to turn it off. The user removes a room from the run with the R2 room list. T16 and T26 report the share of off-graph rooms and the wall count to the lead.
- **R-4a Two runs on one center line.** The second run of the same type lies on the first (Q-R6-05 A). The Note says so once. The user moves one run by hand.
- **R-4b Pipe sides depend on the port order of the stamp definition.** A definition with the flow port second makes the first run the return (Q-R6-03 A).
- **R-5 Quality depends on room detection.** Wrong or open room outlines (`open: true`) move center lines and entries (R4 plan R-3). The region test can then block good paths. The off-graph connection is the fallback.
- **R-6 The foreign-type check covers the data, not the picture.** A routed leg can cross or run on top of a foreign segment in 2D. This is a warning (`existing-crossings`, `existing-overlap`), not a join. The designer decides.
- **R-7 Mark loss.** A path that rebuilds a segment field by field would drop `routedBy`. The paths of section 4.4 are checked. Not verified: the Element Editor "Save" path (`applyDefinitionToPlacedStamps`), the PDF re-import, and any code that clones a segment without a spread. T24 tests the Save and load path. A search for `endpointA:` in `packages` at T01 lists the places that build a segment by hand. The lead reports them.
- **R-8 A re-run removes less than the user expects.** The walk follows marked segments only. A hand-drawn segment in the middle of the run keeps all marked segments beyond it. The dialog shows the count before the user presses Place. Q-R6-01 C would make the removal depend on a key and not on the walk.
- **R-9 Hand edits that Q-R6-02 A does not clear.** A size or a material that the user typed is lost on a re-run. The dialog does not warn about it. The R5 note says a typed size is overwritten.
- **R-10 Performance.** The Hanan grid grows with the square of the ports in a room. A room with 40 ports gives a grid of about 40 by 40 states of two axes. T08 prints the time for 20 ports. A cap of 40 ports for each room, with the rest in the off-graph connection, is a later fix if T16 or T26 finds a slow case. Not measured.
- **R-11 Water.** A port group over the flow and return ports joins the two pipes into one network of one type (R3 M1, R5 R-11). The sizing then doubles the power. R6 shows the R3 warning only. Q-R6-03 A leaves the pipe side to the user.
- **R-12 The capacity unit.** The capacity warning compares numbers in the unit of the network type. Capacities that Auto-place wrote before R5 can be in another unit (R5 R-8). The dialog names the unit.
- **R-13 Undo and the id counters.** `nextSegmentSeq` and `nextFittingSeq` are not undone. After an undo, a new run gets higher ids. This is harmless, and the reload re-seeds the counters (the memory note "segment id reseed").
- **R-14 Stacked dialogs.** One Escape closes stacked dialogs (R5 R-22). Not changed.
- **R-15 Not verified.** All sources of section 3, the fitting angle practice (the domain checker confirms), the planner values of P-R6-MINLEG and P-R6-PEN, the claim that no `fitting.kind` is read outside `scene.ts:1416`, and the 10A numbers (local file only).
- **R-16 The second run for a stamp that was moved by hand.** The planner uses the current stamp positions. A stamp moved after a run does not clear the marks (P-R6-MOVE). The old geometry stays until the user re-runs.
- **R-17 The start stamp in a room outside the route area.** The start leg is long and crosses walls. The plan counts them. The note of step 5 (2000 mm) only informs.

## 10. Revision log

| Date | Change |
|---|---|
| 2026-10-18 | First version by the road map planner. 26 tasks (T01 to T26, T14 and T15 out of order on purpose). Three questions for the user (Q-R6-01 value of the mark, Q-R6-02 what a hand edit clears, Q-R6-03 pipe side), 20 provisional choices. |
| 2026-10-18 | **Revision 1** after the audit (5 high) and the domain check. Walk: starts at the far fitting of an unmarked stub, and crosses a port only at the start port (H1, H2). The scene finds the targets on the reduced state with the scope inputs, not a port list (H3). `removal` is a planner input, so T09 does not need T02; the order paragraph and the Q-R6-01 block list are rewritten, and the director may use B provisionally (H4, M6). The 4-grille example is recomputed with ports as leaves: 6 segments, 2 room fittings, 3 new fittings, 9000 mm (H5). `entryDir` tie-break for the Hanan search (M1). Link gap accepted in the region test (M2). Entry and link connectors told apart by id prefix, terminal = tap node (M3). R6 room list removed; the R2 scope is used (M4). T03 clears only fittings in `fittingOriginals` and their segments, and checks a stamp drag (M5). T09a added (side rule). T01 lists `group-networks.test.ts` (M7). `legClass` calls `resolveAngleSnap` (M8). New questions Q-R6-04 (off-graph rooms), Q-R6-05 (lane); Q-R6-03 now has a side rule (D-H1). Placeholder sizes by discipline and `no-limits` as a warning (D-M3). Sizing writes marked segments only (D-M6, L4). Same-type join is a warning (D-M5). Fire hint text extended (D-M7). Gravity networks refused (D-M8). Capacity warning only with a flow unit (D-M9). `short-leg`, tap rules, no balancing valves (D-L10 to D-L12). Line numbers fixed (L1). Check scripts renamed `r6-t..` (L3). Selection pruning (L5). Schema numbering note (L6). 27 tasks (T09a added). |
| 2026-10-18 | **Revision 2** after the user answers: Q-R6-01 B (`routedBy: 'route'`), Q-R6-02 A (geometry edit only), Q-R6-03 A (first open port in stamp port order), Q-R6-04 A (off-graph rooms are served; this replaces the recommended B), Q-R6-05 A (no lateral lane; the director alerts the user if two runs overlap in tests). The provisional wording and the stop rule at T12 are removed; no task waits. Q-R6-04 A: no dialog switch, no `includeOffGraph` input; the off-graph connection is the default (P-R6-OFFGRAPH, step 8, T12 tests with a hand value, T22 without the switch and its browser step, R-4, section 8, texts `buildOffGraph` removed). `rooms-skipped` stays only for a room whose both orthogonal connections would join a foreign network. 27 tasks, same numbers. |
| 2026-10-19 | **Deviations of T21 and T22** (task lead, director approved). (1) The Route section stays after Place when no open port is left: `RouteDialog` keeps the last valid request (`lastRequest`) while `typeChoices` is empty, because after a full run no open port exists and the section would vanish (provisional; a later change can let the type list include the types of routed runs). (2) The Undo rail button cannot be clicked while the Route dialog is open (the backdrop `mep-modal-backdrop--route` covers it), so the T22 browser step 5 closes the dialog, undoes, and reopens it. (3) The size check box shows only when a limits entry exists AND the plan has no `no-limits` line (a type with no flow unit or sizing method sizes nothing). (4) The text `buildRemove` reads "Place route first removes {segments} and {fittings} of the earlier run. Hand-drawn segments stay." (no "routed"; it reads as a note about the earlier run, not about the route just placed). The off-graph line says that the route serves the rooms anyway, and the off-graph and rooms-skipped lines list the rooms as "number name". T10 test text: a link gap of 1800 mm gives `free-angle` (a gap of 900 mm still passes). |
