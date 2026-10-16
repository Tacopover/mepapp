# Road map overview: R2 to R7 of the auto-routing work

Status: rewritten 2026-10-16 by the road map planner, on the model of the user: the routing command takes its input when it runs, and the app stores no grouping.
This version replaces the one with "systems". The terms "system", "zone", "service key" and `Room.systems` are gone. The code has two words only: **network** and **network type**.
Origin: `auto-routing.md` §8, `auto-routing-r2-prompt.md`, `agent-framework-prompt.md`.
Round 2 (2026-10-16): the audit and the domain check are applied. The changes: `Fitting.routedBy`, the new meaning of "joined", the flow root from the start stamp, the rules for the mark, the foreign-type rule, the notes on risers, sizing, and RCDs.
Round 3 (2026-10-16): the user answered all 15 decisions (section 4). The changes in this file: no stored route area and no "no crossing" line (D-R4-01); a unit on each network type with a conversion table (D-R5-01 C); air-only limits and a sizing method on the network type (D-R5-02, -03); `portCapacities` and the riser sum are later (D-R5-04); single PDF files only, risers out of scope (D-R2-02); a multi-page PDF is refused (D-R2-03). The plan of R2 is `auto-routing-r2.md`.
Code claims carry `path:line`. Paths start at the repository root. A line number can move after a later commit.

Terms:
- **Network**: one set of segments that are joined to each other, calculated by `computeNetworks` (`packages/core/src/network.ts:147`). The app never stores it.
- **Joined**: two segments are joined when they share a fitting or a port, or when their ports are in one port group (`network.ts:75`-`:79`, `:102`-`:109`). The user confirmed a narrower meaning for a port group (D-R3-01 A): a port group never joins segments of different network types.
- **Run**: one execution of the route command, with one route input. A run is not stored. A set of joined segments is a "network", never a "run".
- **Routed mark**: the optional field `routedBy` on a segment or a fitting. It says that the route command made the item (D-R6-02).
- **Network type**: the kind of a network, for example Supply Air (`network.ts:22`). A segment defines it (rule 1 of `rules.md` §3).
- **Routing target**: the network type that routing must connect to a port (`PlacedStamp.routingTargets`, `packages/core/src/stamp.ts:33`). It is not the network type of the port.
- **Open port**: a port with a routing target and no segment. The private method `openPorts` finds it (`scene.ts:2255`). R2 needs a pure function in core, built from `routingTargetOf` and `getStampWorldPorts` (`stamp.ts:37`, `:113`), because `openPorts` and `portSegmentTypes` (`scene.ts:1202`) are private to the scene. The function is new.
- **Route command**: the command of R6 (and its dialog, built in R2). It takes its input when the user runs it. Like the Auto-place dialog, it stores no input.
- **Route input**: the data that the user gives to the route command: the start stamp, the start port, the network type, and the target ports (given as rooms, or as a selection of stamps).
- **Start stamp**: the stamp where the network begins, for example an air handling unit or a shaft stamp. It is route input, not stored data.
- **Demand type**: what a room requires, in one unit, for example Supply air in dm³/s (`packages/core/src/rooms/room-need.ts:27`).
- **Route area**: the area where a duct or pipe may run (R4). R4 calculates it from the rooms of the chosen room types. It is never stored.
- **Sum direction**: the direction in which `solveFlow` adds the flows, toward the root (`packages/core/src/flow.ts:34`). The physical flow of a supply duct goes the other way.

## 0. The model in short

1. Before routing, no network exists for the new ducts. The open ports are ports with a routing target and no segment. They have no grouping. They are not on a network.
2. The user runs the route command and gives the route input: "start at air handling unit 1, port Supply, type Supply Air, connect the open ports of these rooms".
3. The command makes segments. From then on, the network exists as segments. The flow solve needs a root (the start stamp). `recomputeFlow` passes no `rootElementId` today (`scene.ts:3013`), so the solve uses its fallback order (`flow.ts:94`-`:101`): an equipment node with degree 1 (degree = number of segments at that node), then any non-terminal node with degree 1, then any equipment node. This fallback is wrong for some real networks (G14). So R5 takes the start stamp from the user and passes it as `rootElementId` (D-R3-02). The live overlay keeps the fallback.
4. So the app needs no stored list of networks, no room link and no start point. The segments are the record.
5. Rooms are used as geometry only (section 1a). No room has a link to a network.

## 1. What the user gets

### R2. The route command: its input and the port finder

The user opens the route dialog, picks a start stamp and a start port on the plan, and picks the network type. The user then picks the rooms to serve (all rooms are checked at first), or a selection of stamps. The dialog says how many open ports of that type the rooms hold, and shows them on the plan. The dialog makes no segment yet.

Example. An office floor has two wings. Auto-place has put supply grilles with the routing target Supply Air. The user opens the dialog and clicks "air handling unit 1" on the plan. The user picks the port "Supply" and the type Supply Air, and unchecks the east-wing rooms. The dialog says "15 open ports of Supply Air in 9 rooms" and marks them on the plan. With one air handling unit, the user keeps all rooms checked and sees no extra step.

### R3. The start point

The dialog checks the start and says what is wrong: the stamp is not equipment, the start port has more than one segment (before the run it may have none or one, and after the run it has exactly one), the start port already has a segment of another type, the port is in a port group that joins another type, or the network that the start port touches has a second equipment stamp.

Example. The user made a port group on the Supply and Return ports of an air handling unit in the Element Editor. The generated stamp library has none (a search of `packages/core/src/stamp-library.generated.ts` finds no `definitionPortGroups`). A group exists only when the user makes it (`stamp-library.ts:32`, `ElementEditorDialog.tsx:276`, or `setPortGroup`, `scene.ts:2866`). The dialog warns that the group joins the two ducts into one network. After D-R3-01, the two ducts are two networks. A second run starts at a shaft stamp that the user draws with the Element Editor: the library has no ventilation shaft stamp (G12). The run takes that stamp as the root of the flow solve (D-R3-02).

### R4. Where a duct or pipe may go

The app shows the route area of the floor. The route area is the set of rooms of the chosen room types. The default room types are Corridor and Shaft. The user can add other room types to the list, for example a hall. The app draws no area by hand and stores no area. The result is a 2D draft (D-R4-02).

Example. On the office floor, the corridor is the main route. The app shows the corridor center line in a color. A branch may leave the corridor through the wall of an office. A hall that room detection named "Hal" has the room type Hall. The user adds the room type Hall to the list, and the hall joins the route area. The user can also fix the room type of one room in the Room tab, as today.

Fire walls. The app has no model of a fire compartment, and the wall lines of detection carry no attribute (`wallDebugData`, `scene.ts:661`). So R4 does not forbid a crossing. It counts the walls that a route crosses, and shows a warning with the count and the place of each crossing. A crossing into or out of a Shaft room gets its own warning. The designer checks the fire compartments. The warning is calculated and not stored.

### R5. Sizing

The user presses "Size network". The command takes the start stamp as input, like the route command, and passes it to the flow solve as the root. The app writes a diameter (or a width and a height) on each segment of the chosen network, from the flow in the segment. Each network type has a unit for its flow, a sizing method and the settings of that method (D-R5-01 C, D-R5-02, D-R5-03). The method for air uses a maximum velocity (m/s) and a maximum pressure drop (Pa/m). Round or rectangular, and the maximum aspect ratio (width to height) of a rectangular duct, are settings of the type too. Water networks and plumbing use other methods. The R5 plan researches those methods and states the limits with their sources. The method for water needs a delta T that the user enters (D-R5-05 B).

Example. The Supply Air network of air handling unit 1 carries 640 dm³/s at the start and 20 dm³/s at the last grille. The main gets a large size and the last branch a small one. The app uses a standard size series. Supply and Return Air are sized each from their own terminals. A balance report (supply against return plus exhaust) is a warning only.

Later, not in R5 v1 (D-R2-02 A, D-R5-04 A). A riser through several floors, a shaft that carries the sum of all floors, and a stamp with two flows. Each PDF file is sized alone. A shaft stamp carries only the flow of its own file. The user said: come back to these after the main routing feature. R5 v1 shows no number for the other floors and does not claim that a riser size is right.

### R6. The shape of the network

The user presses "Route" in the dialog of R2. The app shows a preview of a main along the corridor, a branch to each room, and a sub-branch to each open port. The user accepts, and one undo step removes it. The result is a draft: the app has no duct height, so the designer checks clashes.

Example. For air handling unit 1 the main runs from the shaft along the corridor. It puts a tee at each office door line and sends one branch into the office. In the office, a sub-branch goes to each of the 4 grilles. The open-port dots go away when a segment connects. After the run, the dialog shows the total capacity of the network (`totalCapacity`, `flow.ts:32`). If the start stamp has a capacity, the dialog warns when the total of the terminals is above it. (The solve adds the own capacity of the root to the total, `flow.ts:107`, so the warning subtracts it.) The user then runs the command again for Return Air (start port "Return"), and a third time for the toilet exhaust (start at the roof fan).

An air handling unit with heat recovery has more ducts: outdoor air in and discharge out. The network type library has no such types. It has Supply Air, Return Air and Exhaust Air for ventilation (`packages/core/src/network-type-library.ts:11`-`:13`). The user must add the two types as custom types (not verified: that the network type editor lets the user add a type with the discipline ventilation). R6 does not need them: it routes any adopted type.

### R7. Electrical circuits

The user presses "Make circuits". The command takes a panel (an existing `Panel`) and a set of rooms as input. It groups the unassigned luminaires and sockets of those rooms into circuits, by room and by a limit for each circuit type, and puts them on the panel. The dialog shows the count of rooms and of terminals for each panel before the user accepts. A second panel can take the terminals that the first panel left.

Example. The office floor has 40 luminaires and 30 sockets. The user picks panel "A" and the west-wing rooms. The app makes light circuits and socket circuits in Circuits mode. Each circuit stays under the limit of its circuit type. Every socket circuit gets a residual-current device (RCD) of 30 mA by default (`device.rcdMilliamps`, `circuit.ts:31`). The user can change it. A light circuit of a wet room (toilet, bathroom) gets the same default. A stamp with the category equipment, or with a capacity above a threshold, gets its own circuit and never joins the sockets. Then the user picks panel "B" and the east-wing rooms. The dialog says "40 rooms: 22 on panel A, 18 left".

### 1a. What the rooms do (check of the user's question)

The user lists three uses of a room. The check against the code and the R2 prompt:

| Use | Correct? | What the code gives | Needs a link from a room to a network? |
|---|---|---|---|
| (i) Find the ports to connect | Yes, but optional | `roomsAtPoint(rooms, point, pageIndex)` (`packages/core/src/rooms/room.ts:138`) gives the room of a port. A stamp made by Auto-place also has `autoPlaced.roomId` (`stamp.ts:27`), but the id can go stale after a new Detect rooms run, so the position lookup is safer. The user can also give a selection of stamps and skip the rooms. | No. Rooms are input, as in the Auto-place dialog. |
| (ii) Find the stamps in one room, for the layout of the branches (D-R6-01) | Yes | The same lookup. The smallest room wins when rooms nest (`room.ts:137`). The page is needed (G1). | No. |
| (iii) The corridor and shaft rooms, for the route area (R4) | Yes | The room types Corridor and Shaft (`packages/core/src/rooms/room-type.ts:164`, `:176`). The type comes from name matching and can be wrong (`room.ts:39`, `roomTypeSource: 'matched'`). | No. It needs the existing rooms and room types only. |

The R2 prompt (step 5 and open questions 2, 8, 9) assumed that a room gives a grouping to a port. That assumption is gone. No part needs a room-to-network link. The demand calculations of the room types (supply amount per room) reach routing only through `terminalCapacities` (`packages/core/src/project.ts:33`), which R5 reads.

## 2. How each part relates to what exists

| Part | Features that it reads | Features that it changes | Other parts |
|---|---|---|---|
| R2 | Auto-place (`autoPlaceStamps`, `packages/render/src/scene.ts:2755`) and its dialog as the model for the input, routing targets, rooms (`room.ts:15`), the logic of the private `openPorts` (`scene.ts:2255`) | A new dialog and a new pure finder function in core (the scene cannot be called from core tests). No stored data. The status bar chip (`packages/ui/src/components/StatusBar.tsx:97`) can open the dialog. | Gives the port set to R6. |
| R3 | The flow solve root (`flow.ts:94`-`:101`), equipment stamps, port groups (`network.ts:82`) | `computeNetworks` (D-R3-01), the root of the flow solve (D-R3-02), the checks in the dialog | Needs R2 (the dialog). Gives a clean network and a root to R5 and R6. |
| R4 | Rooms and room types Corridor and Shaft, the wall lines (`wallDebugData`, `scene.ts:661`) | A new overlay for the route area. A user preference: the list of room types that form the route area (D-R4-01). | Needs rooms only. Gives the graph to R6. |
| R5 | `solveFlow` (`flow.ts:55`), `terminalCapacities`, network types (`network.ts:22`), segment size fields (`network.ts:48`), the unit factors (`packages/core/src/rooms/placement-units.ts:10`-`:12`) | Segment `diameter`, `width`, `height`. New optional fields on `NetworkType`: the flow unit and the sizing method with its settings. | Needs a network (drawn or routed) and the start stamp as input (passed as `rootElementId`). R6 calls it to size routed segments. |
| R6 | R2 input, R3 checks, R4 graph, R5 sizing, the segment tool, fittings, the cascade (`scene.ts:1418`) | Adds segments and fittings, removes the marked ones on a re-run | Needs R2 to R5. |
| R7 | Circuits and panels (`packages/core/src/circuit.ts:9`, `:72`), circuit types (`circuit.ts:93`), rooms, `terminalCapacities` | Circuits mode | Needs no other part of R2 to R6. |

Rules that every part keeps (`rules.md` §3):
- Rule 1, the segment defines the network type of a port. The route command writes segments with the chosen network type. It never writes a network type on a port. The routing target stays the only value on the port. A route that would join a segment of another network type is refused (section 3, "The rule for a foreign network type").
- Rule 2, the cascade invariant. No part adds a per-segment field that can differ inside one network, except `routedBy` on a segment and on a fitting (D-R6-02). That field says how the item was made, not what network it is on. The cascade (`scene.ts:1441`) copies the whole segment with a spread, so the mark stays when the type changes. D-R3-01 A changes the meaning of "joined" and so changes the text of rule 2. The user confirmed it on 2026-10-16. The text of rule 2 says "connected segments never have different network types". Now "connected" means "joined by a segment, or by a port group whose segments all have one network type". The R3 plan asks the director to edit `rules.md` §3 (rule 2) with this text.
- Rule 3, reuse before new. The route command copies the shape of the Auto-place dialog. R7 uses `Panel` as it is. The routed mark reuses the idea of `autoPlaced.moved`. No new entity exists.
- Rule 4, the adoption trap. The first step of "Route" and of "Size network" is `adoptNetworkTypes` (`scene.ts:2358`) for the chosen type, before any segment is written. Both tasks have a browser check: a library type that the drawing has not adopted gets its own color, not the default look. (The pure core function that builds the segments takes the type id only. The scene method adopts first.)
## 3. The data that goes from one part to the next

| Data | Made by | Read by | Stored in |
|---|---|---|---|
| Routing target of a port | Part 1 (done) | R2, R6 | `PlacedStamp.routingTargets` (`stamp.ts:33`) |
| `autoPlaced.roomId` | Part 1 (Auto-place) | R2 (only as a hint) | `PlacedStamp.autoPlaced` (`stamp.ts:27`) |
| Route input (start stamp, start port, network type, rooms or selection) | The user, in the dialog (R2) | R6 | Not stored. It lives in the state of the dialog while it is open. |
| Target port set | The new pure finder function in core (R2) | R6 | Not stored. Calculated from the input. |
| Network of the routed ducts | R6 (as segments) | R3, R5 | The segments. `computeNetworks` calculates the network. |
| Start stamp for the flow root | The user, as input of "Size network" (R5) and of the route command (R6) | R5, R6 (`rootElementId` of `solveFlow`, `flow.ts:22`) | Not stored (D-R3-02 A). The live overlay uses the fallback (`flow.ts:94`-`:101`). |
| List of room types that form the route area | The user, in the R4 dialog (default Corridor and Shaft) | R4, R6 | A user preference in `localStorage`, like the room types (`packages/ui/src/roomTypeStorage.ts:6`). Not in the project file. No schema step. Provisional (section 4, D-R4-01). |
| Route area and graph | R4 | R6 | Calculated from the rooms and the list above. Not stored. There are no hand-drawn areas and no "no crossing" lines (D-R4-01). |
| Wall-crossing warnings | R4 | R6 (shown in the preview) | Calculated, not stored |
| Flow in each segment | `solveFlow` | R5 | Calculated (`flow.ts:55`) |
| Capacity of a terminal | Auto-place (`scene.ts:2791`) | R5, R7 | `ProjectDocument.terminalCapacities` (`project.ts:33`) |
| Unit of a capacity | Auto-place (the unit of the rule) | R5 | Not verified: `terminalCapacities` holds a number with no unit. See gap G16. |
| Capacity of a port (stamp with two flows, sum of other floors) | Later (D-R5-04 A) | R5 later | Not built. `PlacedStamp.portCapacities` is dropped for now. |
| Size of a segment | R5, or the user | R6 | `Segment.diameter`, `width`, `height` (`network.ts:48`) (exist today) |
| Flow unit of a network type, and the conversion table | R5 | R5 | New optional field `flowUnit` on `NetworkType` (D-R5-01 C). The conversion table is a constant in core. Its first factors exist (`placement-units.ts:10`-`:12`). Default: absent. |
| Sizing method and its settings of a network type | R5 | R5 | New optional field on `NetworkType` (D-R5-02, -03): the method, and the settings of that method. Default: absent, and R5 asks the user. |
| Routed mark of a segment | R6 | R6 (re-run) | New `Segment.routedBy` (D-R6-02 A). Default: absent = hand-drawn. |
| Routed mark of a fitting | R6 | R6 (re-run) | New `Fitting.routedBy` (D-R6-02 A), same schema step as the segment mark. Default: absent = hand-placed. |
| Panel of a circuit | The user (exists) | R7 | `Circuit.panelId` and `Panel.equipmentStampId` (`circuit.ts:16`, `:75`) |
| Circuit limits | R7 | R7 | New optional fields on `CircuitType` (D-R7-01). Default: absent. |

### What must be stored, and why

| Item | Stored? | Why |
|---|---|---|
| Which start stamp and which ports belong to a network | No | The segments hold it. The flow solve finds the root. |
| Which rooms a network serves | No | It is route input. After routing, the segments hold the result. |
| Which panel serves which rooms | No | It is input of the circuit command. The result is in `Circuit.panelId` and `Circuit.terminalIds`, which exist. |
| Routed mark of a segment | Yes (D-R6-02 A) | After a reload, the app cannot tell a routed segment from a hand-drawn one by looking at the geometry. |
| Routed mark of a fitting | Yes (D-R6-02 A) | A `Fitting` has only `id`, `pageIndex`, `position` and `kind` (`network.ts:68`-`:74`). It has no link to a segment. `deleteSelection` removes segments and keeps the fittings (`scene.ts:4775`). Only `removeFitting` deletes a fitting (`scene.ts:1380`). `computeNetworks` hides a fitting with no segment (`network.ts:171`-`:173`). So a segment mark alone leaves orphan fittings after each re-run. |
| Extra route areas and "no crossing" lines | No | The user decided on 2026-10-16: no hand-drawn areas and no stored lines (D-R4-01). |
| List of room types for the route area | In the browser preferences, not in the project | A setting of the user, like the room type library. It changes the calculation, not the drawing. |
| Flow unit and sizing method of a network type, circuit limits | Yes | They are settings of the user. They travel with the file on the network type and the circuit type. |
| Port capacity | No (later) | D-R5-04 A. |
| Last route input | No | The dialog may keep it in memory for the session. It is not saved in the file. |

### Schema

R2 and R3 change no stored data. They need no schema step. The current version is 18 (`project.ts:20`). The first task, in the order of the work, that stores a field makes the step 18 to 19. Each later task takes the next number: it reads `CURRENT_SCHEMA_VERSION` at its start and adds 1. R7 can start at any time, so the director gives the number when the task starts. The expected order is: R5 (the `NetworkType` fields for the flow unit and the sizing method, in one step: 19), R6 phase "mark" (`Segment.routedBy` and `Fitting.routedBy` in one step: 20), R7 (circuit limits: 21). R4 stores nothing in the file, so it has no step. D-R6-02 builds option B first (no stored data) and then option A. So the R6 phase of option A is the one that makes its step, and it writes both marks in that one step. Each new field is optional and gets its default from the clean-up on load, as schema 18 does (`auto-routing.md` §4.5). An older MepApp refuses a newer file.

### The cases that the user asked for

**(a) A re-run after the user edits.** The minimum stored mark is one optional flag on a segment and one on a fitting: `Segment.routedBy` and `Fitting.routedBy`. It says "the route command made this item". The user input gives the rest: the re-run takes the start stamp and the start port again, so the app does not need a run id. A fitting needs its own mark because it has no link to a segment (`network.ts:68`-`:74`).

*What a re-run removes.* The re-run walks from the start port. It follows only segments that carry the mark. It stops at a hand-drawn segment. It removes the marked segments that it reached, as one undo step. Then it removes each marked fitting that those segments touched, but only when no segment that stays uses that fitting. A hand-placed fitting (no mark) is never removed. The walk stops at a hand-drawn segment, so these stay: the hand-drawn segments, and any marked segment that lies beyond one.

*The count before the removal.* The dialog counts the items first and shows them: "This run removes 34 routed segments and 12 fittings. Hand-drawn segments stay." The user then accepts or cancels. A run with count 0 removes nothing.

*Two routed networks joined by hand.* The user draws one hand segment between the network of unit 1 and the network of unit 2. `computeNetworks` now gives one network (it keeps the type of the first segment, `network.ts:159`-`:164`). A re-run of unit 1 walks through marked segments only. It stops at the hand segment, so it never removes the segments of unit 2. The count in the dialog shows this. The hand segment stays, and the two networks stay joined until the user deletes the hand segment.

*What happens to the mark on each path.* The rules below are core rules with core tests. The R6 plan reads the code of each path before it writes the task.

| Path | Code | Today | Rule for the mark |
|---|---|---|---|
| Change of the network type (cascade) | `scene.ts:1441` | Copies the segment with a spread | The mark stays. The type is a network value. The mark is not. |
| Insert a fitting on a segment (a split) | `scene.ts:1347`, `segmentTool.ts:92`-`:102` | Both new pieces copy the original (`...original`) | Both pieces keep the mark. The new fitting is hand-placed and has no mark. A re-run keeps it. After the re-run removes both pieces, no segment uses it, and `computeNetworks` hides it. |
| Remove a fitting (a merge) | `scene.ts:1368`, `segmentTool.ts:151`-`:154` | The merged segment copies the first piece | The merged segment has the mark only when both pieces have it. A change in `mergeSegmentsAtFitting` with a core test. |
| Drag a segment or a fitting by hand | `selectTool.ts:117`-`:130`, `:197`, `scene.ts:4396` | The drag moves the fittings and the cascade changes the geometry. The mark is kept by the spread. | A hand drag clears the mark of the moved fitting and of each segment whose geometry changes, as `autoPlaced.moved` does for stamps (`stamp.ts:27`). Not verified: the exact place in `applyConnectivityCascade` and in the select tool. The R6 plan finds it. A move of the start stamp keeps the marks. |
| Delete a segment | `scene.ts:4775` | The segment goes. Its fittings stay. | No change. A marked fitting that stays is hidden. A later re-run removes it only if a segment that it removed used it. |
| Paste, also into another drawing | `scene.ts:4864`, `:4902`, `segmentPaste.ts:54`-`:60` | A pasted segment copies the original with a spread. The pasted fittings are new objects with no mark (`segmentPaste.ts:39`). | `pasteSegments` clears the mark of every pasted segment. A pasted copy is hand-drawn. A core test checks it. |
| Undo | `Transaction` | One step | Route, re-run and mark clear each use one transaction. |

The field says how an item was made. It does not say what network the item is on, so rule 2 stays true. Without the mark (option B of D-R6-02) the re-run only connects open ports, removes nothing, and stores nothing.

**(b) Open-port count and the status bar by network (closed item C2).** An open port is on no network yet, so no count by network or by start stamp can exist before routing. The count stays by network type (`scene.ts:2237`). This is enough: the dialog counts the ports of the chosen rooms and type for the chosen run. After routing, a port that got a segment is no longer open. The ports that stay open are the ones that no run reached. The status bar needs no change. C2 is closed.

**(c) Two air handling units of the same network type in one building.** The user runs the command once for each unit. Run 1: start at unit 1, type Supply Air, the west-wing rooms. Run 2: start at unit 2, type Supply Air, the east-wing rooms. The finder takes the open ports of that type that lie in the chosen rooms. Run 1 connects its ports, so they are no longer open. Run 2 with "all rooms" gets the rest. If both units serve ports in one room, the user selects the stamps instead of the rooms. Risk: if a branch of run 2 touches a segment of run 1, `computeNetworks` joins the two networks. The rule for a foreign network type (below) stops this.

**The rule for a foreign network type.** `computeNetworks` gives a network the type of the first segment it meets and does not check the others (`network.ts:140`-`:145`, `:159`-`:164`). So a route that ends on a fitting or a port of a network with another type would change the type of one of the two networks without a message. Rule: the route command refuses to join a fitting, a port or a segment of another network type. It checks this before it writes. The check is a pure core function that takes the state, a connection point and the type id, and says yes or no. A core test: a route that ends on a foreign fitting is refused. A second core test: after any run, `computeNetworks` gives networks in which every segment has one type. A third test: the check also sees the join through a port group (after D-R3-01). The dialog shows the refusal and the item that caused it. This is a default (section 5) and needs no decision from the user.

**(d) Supply and return of one unit, and exhaust with its own fan.** One run for each start port. Run 1: start port "Supply", type Supply Air. Run 2: start port "Return", type Return Air. Run 3: start at the exhaust fan, type Exhaust Air, the toilet rooms. The finder filters the open ports by the routing target, so a toilet with a supply grille and an exhaust grille works with no extra data: run 1 takes the grille with Supply Air and run 3 takes the one with Exhaust Air. The dialog checks that the start port has at most one segment before the run, and the run makes exactly one. A start port with two segments has degree 2, and the fallback of the flow solve then does not pick the stamp (`flow.ts:97`). The start stamp from the user fixes the root (D-R3-02). A port group on the unit joins the networks (G7). D-R3-01 fixes that, if the user makes such a group (the library has none).

**(e) Electrical R7.** The panel is existing data. `Panel.equipmentStampId` names the panel stamp (`circuit.ts:75`). The command takes the panel and the rooms as input. Its result is stored in `Circuit.panelId` and `Circuit.terminalIds` (`circuit.ts:16`, `:18`), which exist. The terminals are found by room (the same lookup as in 1a). The panel-to-room link is not stored. R7 needs none of R2 to R6.

**(f) A riser through several PDF files.** Out of scope for now. The user answered D-R2-02 A on 2026-10-16: single PDF files only. Project levels and risers are a future implementation. Each file is one document (`scene.ts:624`) and holds its own segments. Each file is one floor (D-R2-03 A), routed and sized alone. A shaft stamp is a start stamp like any other equipment stamp. A project level above the files is not built. The earlier answer of the user to D-R2-04 (= B, "yes, a project level") is superseded by D-R2-02 A.

What this leaves open for later: a riser that carries the sum of all floors. No part of R2 to R7 sizes it. The R5 plan does not claim that a size on a shaft segment is right for the riser.

### Gaps: data that one part needs and no part makes

| # | Gap | Needed by | Evidence | Where the plan handles it |
|---|---|---|---|---|
| G1 | Stamps have no page. Rooms, calibrations and segments have a page field, but the code records `pageIndex: 0` for new items. The status bar counts the stamps of all pages. The scene looks up rooms on the active page. | R2, R4, R6 | `scene.ts:984`, `network.ts:50`, `stamp.ts:8` (no page), `room.ts:138`, `scene.ts:3255`, `:3343`, `:2236` | D-R2-03 |
| G2 | No project level above the documents. Each PDF file is one document. | A later riser feature, not R2 to R7 | `scene.ts:624`, `project.ts:22` | Out of scope (D-R2-02 A). |
| G3 | No door positions. Detection finds door arcs only to remove them. | R4 | `packages/core/src/rooms/types.ts:71`-`:74` | Default: a branch may cross a wall, with a cost |
| G4 | The flow has no unit. The network type has a display label only (CFM, GPM). Only the two air demand types use dm³/s. | R5 | `network.ts:26`-`:27`, `flow.ts:1`-`:9`, `room-need.ts:27`-`:28` | D-R5-01 C: a unit on each network type and a conversion table. |
| G5 | One capacity number for each stamp. A fan coil unit with Heating Water and Chilled Water has two water flows. Auto-place has no rule that serves two demand types (`placement-rule.ts:92`). | Later | `project.ts:33`, `scene.ts:2791` | Deferred (D-R5-04 A). R5 v1 ignores stamps with two flows. |
| G6 | The network type has no direction. The flow solve knows only the sum direction, toward the root. The old app had `Direction` (Supply, Return). | R5 | `flow.ts:34`, `/root/MepSketcher/MepSketcherTools/MEP/Network.cs:42` | Default: sum direction = toward the start stamp. No `direction` field. |
| G7 | A port group joins ports into one node. A group on an air handling unit can join a supply network and a return network into one network. `computeNetworks` then gives the network the type of the first segment of the union. The generated library has no `definitionPortGroups`. Such a group exists only if the user makes it. | R3, R6 | `network.ts:75`-`:79`, `:102`-`:109`, `:140`-`:165`, `scene.ts:2866`, `:2790`, `auto-routing.md` §7 | D-R3-01 |
| G8 | Neither the segment nor the fitting has a "made by the route command" mark. A re-run cannot tell hand-drawn items from routed ones, and a fitting has no link to a segment, so a re-run leaves orphan fittings. | R6 | `network.ts:48`, `:68`-`:74`, `scene.ts:4775`, `:1380` | D-R6-02 A (both marks) |
| G9 | A terminal has no power in W. `terminalCapacities` holds the Auto-place number in the unit of its rule (Light is lm, Sockets is a count). `CircuitType` has `units` and `defaultCapacity`, edited in `CircuitTypesDialog.tsx:83`. No code reads `defaultCapacity` as a limit (a search finds it only in the library, the dialog and the validation). `computeCircuitCapacity` sums the terminal numbers (`circuit.ts:337`). | R7 | `circuit.ts:98`-`:99`, `:337`, `room-need.ts:26`, `:31` | D-R7-01 |
| G10 | A duct has no height (elevation). Obstacles have no model. A drawing has only a ceiling height. | R4, R6 | `project.ts:54` | D-R4-02 |
| G11 | Paste copies `routingTargets` (`scene.ts:4887`) but not port groups and not capacities. | R5, R6 | `scene.ts:4864`, `:4887`, `auto-routing.md` §7 | Small. Fix in the first task that touches paste. |
| G12 | A shaft room has a room type, but no port. The stamp library has no ventilation shaft stamp: a search of `stamp-library.generated.ts` for "shaft" and "riser" finds only two dry-riser stamps (fire protection, `:5971`, `:6069`). | R3, R5 | `room-type.ts:176`, `stamp-library.generated.ts:5971` | Open. Default: the user draws a shaft stamp in the Element Editor with category equipment. The decision to add a library stamp stays open. |
| G13 | The room demands use 4 different units: Light lm, Supply and Return air dm³/s, Heating and Cooling W, Sockets a count. Only air is a flow. Water needs delta T and the fluid. | R5 | `room-need.ts:26`-`:31` | D-R5-05 |
| G14 | The flow solve gets no `rootElementId` from the scene (`scene.ts:3013`). The root comes from a fallback in this order: an equipment node with degree 1, then a non-terminal node with degree 1, then any equipment node (`flow.ts:94`-`:101`). Two cases give a wrong root. (1) A start port with two segments has degree 2, so a loose duct end wins. (2) A second equipment stamp in the network takes the root by the sort order of the node keys (`flow.ts:71`). This is real for water networks: a fan coil unit has the category equipment (`stamp-library.generated.ts:22942`), and so does a heat pump (not verified in the library). | R3, R5 | `flow.ts:71`, `:94`-`:101`, `scene.ts:3011`-`:3013` | D-R3-02. R3 and R5 need the fix. |
| G16 | A capacity has no unit. `terminalCapacities` holds a number. The unit is the unit of the rule that placed the stamp (`ruleUnitOf`, used in `AutoPlaceDialog.tsx`). With a unit on each network type (D-R5-01 C), R5 must convert a capacity from its unit to the unit of the network type. Not verified: how R5 learns the unit of a capacity. Candidates: read the rule through `autoPlaced.ruleId` (a stamp placed by hand has none), or store a unit with the capacity. A stored unit is a new data-model decision. | R5 | `project.ts:33`, `scene.ts:2791`, `stamp.ts:27` | The R5 plan decides. If it needs a stored field, R5 stops for a decision of the user. |
| G15 | The root lookup matches by substring: `k.includes(':' + rootElementId)` (`flow.ts:96`). The id `stamp-1` also matches the node `port:stamp-12:…`. A root id that is a prefix of another id gives a wrong root. | R5 | `flow.ts:95`-`:96` | The first R5 task that passes `rootElementId` fixes the match (exact element id) and adds a core test. |

Closed by the new model (named C1 to C4 so they do not clash with the open gaps): C1 (room ids not stable, because rooms are input and not linked), C2 (open-port count by network), C3 (a stamp placed by hand has a room: `roomsAtPoint` finds it), C4 (electrical terminals have no routing target: R7 takes rooms as input).

## 4. The decisions

Format: id, the question, the answer of the user (2026-10-16), and what the answer does to the model. `[data model]` means the decision changes the file format or the model.

### 4.1 Open decisions for the user

None. The user answered all 15 decisions on 2026-10-16. The answers are final. Two details that the answers left open are in 4.3. The director takes them as provisional decisions (protocol §3).

### 4.2 The answers

**R2. The route command: input and port finder**

- **D-R2-01** How does the user give the target ports? **Answer C.** Rooms, with a switch to use the selected stamps instead. Effect: the R2 dialog has both scopes and one finder for both (`auto-routing-r2.md`). Nothing is stored.
- **D-R2-02 [data model]** Does the work need a project level above the PDF files? **Answer A.** Single PDF files only. Project levels and risers are out of scope for now (a future implementation). Effect: no project level; no riser sum; the shaft is a normal start stamp (case f).
- **D-R2-03 [data model]** What happens with a multi-page PDF? **Answer A.** One PDF file is one floor. The dialog refuses a PDF with more than one page and says why. Effect: the page of a stamp is always the active page (G1); no `pageIndex` on `PlacedStamp`; the core function `routePageProblem` and a refusal in the dialog (R2 T03, T07). A real multi-page fixture may not exist: the tester then reports NEEDS_CONTEXT and nobody makes a fake PDF.

**R3. The start point**

- **D-R3-01 [data model]** Does the new meaning of "connected" hold? **Answer A. The user confirmed.** "Connected" means joined by a segment, or by a port group whose segments all have one network type. `computeNetworks` keeps two networks apart when a port group would join different types. The group still joins networks of one type. Effects:
  - The R3 plan lists every consumer of `computeNetworks`. A search finds these calls: `scene.ts:1427` (the cascade, `setNetworkTypeForSegmentsNetworks`, `:1418`), `:1483` (the network list), `:2231` (the open ports and the status bar), `:3009` (the flow solve), `:5106` (the visible fittings, `computeVisibleFittingIds`, `:5097`). The PDF sync does not call `computeNetworks`: `domainSyncEntries` (`scene.ts:4057`) reads each segment alone (`:4063`). `solveFlow` builds its graph from `network.segmentIds` only (`flow.ts:57`, `:64`-`:69`); this is not verified to work with two networks on one group.
  - Core tests: two segments of different types on one port group give two networks. A cascade test over a group: the user changes the type of one network, and only that network changes. A test of `solveFlow` on each of the two networks.
  - A file of the user with a group that joined two types is today one network, and after A it is two.
  - The director edits `rules.md` §3 (rule 2) with the new meaning. The R3 plan lists this as its first task.
- **D-R3-02** Where does the root of the flow solve come from? **Answer A.** The start stamp is user input and goes to `solveFlow` as `rootElementId`. Nothing is stored. The live overlay (`recomputeFlow`, `scene.ts:3005`) keeps the fallback. Core tests: a start port with two segments (degree 2) gives the start stamp as the root when it is passed; a second equipment stamp in the network does not take the root; the id-prefix case of G15 (`stamp-1` against `stamp-12`).

**R4. Where a duct or pipe may go**

- **D-R4-01 [data model]** Where does the route area come from? **Answer A, with a setting.** The area is automatic, from the room types. The default room types are Corridor and Shaft. The user can add other room types. **No hand-drawn areas. No stored "no crossing" lines.** Effects:
  - The "no crossing" idea is dropped. For fire walls, R4 counts the wall crossings of a route and shows a warning with the places. A crossing into or out of a Shaft room gets its own warning. The app cannot know which wall is a fire wall, so the designer checks it (section 1, R4).
  - R4 stores nothing in the project file. R4 has no schema step.
  - Where the list of room types lives: see 4.3 (provisional).
- **D-R4-02** Is a 2D draft acceptable for R4 and R6? **Answer A.** Yes. The route has no height. The app shows a note: "Draft in 2D. Check clashes and clearances yourself."

**R5. Sizing**

- **D-R5-01 [data model]** What is the unit of the flow? **Answer C.** A unit on each network type, with a conversion table. Not one internal unit. Effects:
  - A new optional field `flowUnit` on `NetworkType`. The conversion table is a constant in core. Its first factors exist: `M3H_PER_CFM` and `M3H_PER_DM3S` (`packages/core/src/rooms/placement-units.ts:10`-`:12`). The R5 plan lists the units that it needs (dm³/s, m³/h, CFM for air; the units of water and of power).
  - R5 must convert each capacity into the unit of the network type. A capacity has no unit today (gap G16).
  - The unit is a setting of the type. It follows the adoption path (rule 4 of `rules.md` §3).
- **D-R5-02** Which sizing method? **Answer.** The velocity and Pa/m limits are for air networks only. The sizing method is an option of the network type. Hydraulics and plumbing use other methods. Effect: the R5 plan researches the method for each kind of network (air, heating and cooling water, domestic water, drain), states the limits with sources, and builds the air method first.
- **D-R5-03 [data model]** Where are the sizing settings stored? **Answer.** They are properties of the network type: optional fields on `NetworkType`. Effect: one optional field `sizing` on `NetworkType`, a union with a `method` key, so each method has its own settings (air: maximum velocity, maximum Pa/m, round or rectangular, maximum aspect ratio, size series; water: the settings that the R5 research finds, and the delta T of D-R5-05). The step 18 to 19 writes `flowUnit` and `sizing` together.
- **D-R5-04 [data model]** How does a stamp with two flows keep them? **Answer A.** Ignore stamps with two flows and non-typical cases for now. Come back after the main routing feature. **`portCapacities` is deferred.** Effect: `PlacedStamp.portCapacities` is not built. The riser sum is not built. R5 v1 sizes a terminal with one flow.
- **D-R5-05 [data model]** How does R5 turn a power in W into a water flow? **Answer B.** R5 sizes water too, with q = P / (cp × delta T). The user enters the delta T. There is no default. Effect: the delta T is a setting in the water method of the network type. R5 asks for it when it is empty. The R5 plan gives the cp of water with its source. Not verified: the value.

Supply and return rule. R5 sizes Supply Air from its own terminals and Return Air from its own terminals. It never sizes return from supply. The exhaust of a fan is sized from its own terminals. A balance report (supply against return plus exhaust) is a warning only.

**R6. The shape of the network**

- **D-R6-01** One branch for each terminal or for each room? **Answer B.** One branch for each room, then sub-branches to its terminals. The rooms come from the same lookup as in 1a.
- **D-R6-02 [data model]** What does a re-run do with routed segments? **Answer A.** `Segment.routedBy` and `Fitting.routedBy`, both in one schema step. The rules of case (a) apply. R6 builds option B first (no stored data) and then option A.

**R7. Electrical circuits**

- **D-R7-01 [data model]** Where are the circuit limits? **Answer A.** Reuse `CircuitType.defaultCapacity` (`circuit.ts:99`) as the load limit in `units`, plus optional limits (`maxTerminals`, `diversity`) on `CircuitType`. The document already has its own copy of the circuit types (`project.ts:38`). All limits are user-editable defaults with the source "design practice". NEN 1010:2020 no longer regulates a minimum or maximum count of sockets or luminaires per circuit, and IEC 60364 does not set it either. The real protection is the rating of the breaker and the section of the cable. Source: Techniek Nederland, webinar NEN 1010:2020 (https://technieknederland.nl/stream/presentatie-webinar-13-oktober-2021-wat-is-nieuw-in-de-norm-nen-10102020). A socket circuit uses a diversity factor. Terminals have no W today (G9), so R7 v1 limits by count and by the W of terminals that have one. R7 sets `device.ratingA` (`circuit.ts:30`) only from a value that the user entered. Not verified: the default values.

### 4.3 Provisional decisions that the answers opened

These are easy to reverse. The director takes them without a stop (protocol §3). The user can change them on the dashboard.

- **P-R4-01** Where does the list of room types for the route area live? Provisional: a user preference in `localStorage` (a key such as `mepapp.routeRoomTypes.v1`, a list of room type ids, default Corridor and Shaft). It is not a field of the project. The R4 dialog edits it. An id that is no longer in the room type library is ignored. Reason: the list sets how R4 calculates, and the result is not stored. The room types themselves live in the same kind of preference (`packages/ui/src/roomTypeStorage.ts:6`). It needs storing in the browser only. It needs no schema step. Cost: the same drawing on another machine can give another route area until the user sets the list there. The route itself, once made, is segments in the file.
- **P-R5-01** The unit of each capacity (gap G16). The R5 plan decides how R5 learns it. If the plan needs a stored unit, that is a data-model question and R5 stops for the user.

Superseded or dropped: D-R2-04 (project level, answer B, now D-R2-02 A), the old D-R2-01, -02, -06, -07, -08, the old D-R3-01 (start point as stored data), the old D-R7-01 (panel to rooms), hand-drawn route areas and "no crossing" lines (D-R4-01), `portCapacities` (D-R5-04).


## 5. Defaults that I assume

The user does not need to answer these.
- The route command is the only place that holds the grouping. It stores no input. The dialog may remember the last input in memory for the session.
- A start stamp is an equipment stamp. A shaft is an equipment stamp drawn in the shaft room (G12). The start port gets one segment.
- The sum direction is toward the start stamp (`flow.ts:34`). No `direction` field on `NetworkType`.
- The dialog shows the count of open ports of the chosen type and rooms. The status bar keeps the count by network type (case b).
- The open-port dot keeps the color of the routing target.
- The dialog finds the room of a stamp by position (`roomsAtPoint`, on the shown page). It does not trust `autoPlaced.roomId` alone.
- A branch may cross any wall, with a cost for each crossing. The main stays in the corridor. This is a technical choice: ducts run above the ceiling and cross walls at openings that the designer picks.
  - R4 never bans a crossing. It counts the crossings and flags each one for the designer. A crossing into or out of a Shaft room gets its own flag. The flags are calculated and not stored (D-R4-01).
  - A branch above the ceiling needs no door detection.
  - R4 shows a minimum clearance as a note. The output is a draft and clashes stay with the designer.
- R4 is 2D (D-R4-02). The route graph is calculated on demand and not stored (like `computeNetworks`, `network.ts:1`).
- R5 sizes on a button press, writes all segments of the chosen network, in one undo step.
- R6 shows a preview, as the Auto-place dialog does, then the user presses Place. One undo step removes the result.
- A route must not join a port, a fitting or a segment of another network type. The command refuses it, with a core test (section 3, "The rule for a foreign network type").
- A re-run shows the count of the items that it removes before it removes them (case a).
- Routing and sizing call `adoptNetworkTypes` for the chosen type before they write a segment (rule 4).
- The flow root of sizing is the start stamp that the user gives (D-R3-02 A).
- Paste. The clipboard has no rooms (`scene.ts:4864`). Paste copies `routingTargets` (`scene.ts:4887`) but not port groups and not capacities (G11). Undo and save use the document.
- R7 assigns only terminals with no circuit (`findCircuitForTerminal`, `circuit.ts:202`). It groups light and sockets apart. It never moves a terminal that is already on a circuit.
- R7 and fixed appliances. The circuit type list has "Kitchen Appliance" (`circuit-type-library.ts:14`), so R7 needs no new type. An unassigned stamp with the category `equipment`, or with a capacity above a user-editable threshold, gets its own circuit. R7 never groups it with sockets. The stamp category is the source (`stamp.ts`, `category`). Not verified: the default value of the threshold.
- R7 and residual-current devices (RCDs). IEC 60364-4-41, clause 411.3.3 (a secondary source, not read in the original text) asks a 30 mA RCD for sockets of 20 A or less. So R7 sets `device.rcdMilliamps` (`circuit.ts:31`) to 30 on every socket circuit by default. The user can change or clear it. Light circuits of wet rooms get the same default (IEC 60364-7-701; the clause number is not verified). The 2020 text of NEN 1010 and its exceptions: not verified. The wet room types are a user-editable list. The default list has Toilet and Bathroom (`room-type.ts:168`-`:169`). Because the value comes from a secondary source, the dialog states the default and the user can change it.
- R7 shows, for each panel, the count of rooms and of terminals that the panel gets, and the count that is left. A second panel can take the terminals that the first panel left (R7 assigns only terminals with no circuit).
- Each schema change is a version-only step plus a clean-up on load, as in schema 18.

## 6. Risks and order

Order: R2, R3, R4, R5, R6. R7 can start at any time.
- R2 comes first. It stores nothing and needs no schema step. All its decisions are answered (plan: `auto-routing-r2.md`).
- R3 follows R2 because its checks live in the dialog. D-R3-01 A and D-R3-02 A are answered. R3 changes `computeNetworks`, which reads existing files differently (one network becomes two for a group of two types).
- R4 and R5 do not depend on R2 or R3. R4 phase 1 (the graph from the rooms of the chosen room types) stores nothing. R5 phase 1 (pure sizing functions with tests) stores nothing. The step 18 to 19 comes with R5.
- R6 needs R2 to R5. R5 comes before R6, because R6 must give each routed segment a size.
- R7 needs no other part. It uses `Panel` and rooms as they are. D-R7-01 A is answered. The pure grouping function takes the limits as parameters and can start first.
- All 15 decisions are answered, so every part can start. The only stop that can come: the R5 plan finds that it needs a stored unit for a capacity (G16, P-R5-01), or the R3 or R6 plan finds a new stored item that the answers do not cover.

Risks:
- Several parts change the file format. Each change adds a version-only step. An older MepApp refuses a newer file.
- G1 (stamps not page-scoped) is the largest. It is handled by the refusal of a multi-page PDF (D-R2-03 A). A user with several floors in one multi-page PDF cannot use the route command until the files are split. Not verified: whether a real multi-page fixture exists for the browser check.
- R4 depends on the room types of the rooms. A hall with a wrong room type is not in the route area until the user fixes the type or adds the type to the list (P-R4-01).
- R5 v1 ignores stamps with two flows and risers (D-R5-04 A, D-R2-02 A). A drawing with a fan coil unit gets no size for its second flow. R5 must say so on screen.
- Because the app stores no grouping, the user gives the input again for each run. A re-run after a reload needs the start stamp again. This is the price of the model. The dialog can remember the last input in memory.
- A routed network that touches another network joins it in `computeNetworks`. R6 must check this.
- G14: the flow root is a fallback by stamp category. A wrong root gives wrong flows, and sizing writes data from them. R5 passes the start stamp (D-R3-02 A). The live overlay can still show a wrong root.
- The mark rules (case a) touch five code paths (split, merge, drag, paste, cascade). A missed path leaves a stale mark. Each path has a core test.
- Existing files with a port group of two types change after D-R3-01 A: one network becomes two.
- Room detection quality sets the quality of R4 and R7. `room-detection` notes say that 13 of 34 room shapes of the 10A drawing are within 15 % (memory, "Room detection Phase 8"). Not verified here.
- R4 and R6 give a 2D draft. The designer checks clashes and clearances (D-R4-02).
- R6 is a heuristic. Expect a visual review by the user.
- Every merge needs `pnpm build` (`rules.md` §3, rule 6).

## 7. Count of decisions for the user

| Part | Decisions | Answered | Open |
|---|---|---|---|
| R2 | 3 (D-R2-01, -02, -03) | 3 | 0 |
| R3 | 2 (D-R3-01, -02) | 2 | 0 |
| R4 | 2 (D-R4-01, -02) | 2 | 0 |
| R5 | 5 (D-R5-01 to -05) | 5 | 0 |
| R6 | 2 (D-R6-01, -02) | 2 | 0 |
| R7 | 1 (D-R7-01) | 1 | 0 |
| Total | 15 | 15 | 0 |

Provisional (the director took them): P-R4-01 (where the room type list lives). P-R5-01 (the unit of a capacity) waits for the R5 plan.
