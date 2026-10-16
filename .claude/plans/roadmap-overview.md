# Road map overview: R2 to R7 of the auto-routing work

Status: written 2026-10-16 by the road map planner. Revised the same day after the review of the auditor and the domain checker (items A1 to A12, M1 to M9).
Origin: `auto-routing.md` §8, `auto-routing-r2-prompt.md`, `agent-framework-prompt.md`.
Code claims carry `path:line`. Paths start at the repository root. A line number can move after a later commit.

Terms:
- **Routing target**: the network type that routing must connect to a port (`PlacedStamp.routingTargets`, `packages/core/src/stamp.ts:33`). It is not the network type of the port. A segment defines that.
- **Open port**: a port with a routing target and no segment.
- **System**: a named service, for example "AHU 1" or "Exhaust fan 3". R2 stores it. A system lists its **service keys**.
- **Service key**: the text that says what a system serves. For a port with a routing target, it is the network type id (for example `supply-air`). For an electrical terminal (Light, Sockets), it is the word `electrical`. Electrical needs have no network type (`packages/core/src/rooms/placement-rule.ts:125`-`:131`: only the 4 HVAC needs have a routing target), so the key cannot be a network type.
- **Network**: one connected run of segments, calculated by `computeNetworks` (`packages/core/src/network.ts:147`).
- **Start point**: the place where a system begins, for example an air handling unit or a shaft (R3).
- **Demand type**: what a room requires, in one unit, for example Supply air in dm³/s (`packages/core/src/rooms/room-need.ts:27`).
- **Route area**: the area where a duct or pipe may run (R4).
- **Sum direction**: the direction in which `solveFlow` adds the flows, toward the start point (`packages/core/src/flow.ts:34`). The physical flow of a supply duct goes the other way, away from the unit.

## 1. What the user gets

### R2. Which network (systems)

The user can name a system and say which rooms it serves, for each service. Each open port then belongs to a system, and the app shows it.

Example. An office floor has two wings. The user makes "AHU 1" and "AHU 2". The user picks the rooms of the west wing for AHU 1 and the rooms of the east wing for AHU 2. Auto-place has put supply grilles with the routing target Supply Air. Properties of a grille in the west wing now says "Supply Air, system AHU 1". The status bar count says "Open ports 28": 15 for AHU 1 and 13 for AHU 2. The toilets have their own fan, "Exhaust fan 3". A toilet has Supply Air from AHU 1 and Exhaust Air from Exhaust fan 3. With one air handling unit, the user does nothing new. Every port is on the one implicit system of its network type.

### R3. A start point for each network

The user says where each system begins.

Example. AHU 1 stands in the technical room. The user picks the air handling unit stamp as the start point of AHU 1, and picks the port "Supply" for Supply Air and the port "Return" for Return Air. A second system, "Heating plant", starts at a shaft that comes up from the basement. Routing can now find the end of a main duct.

### R4. Where a duct or pipe may go

The app shows the route area of the floor: the corridors, the shafts, and the places where a branch may cross a wall. The user can correct it. The result is a 2D draft (see D-R4-03).

Example. On the office floor, the corridor is the main route. The app shows the corridor center line in a color. A branch may leave the corridor through the wall of an office. The user draws one extra route zone over a hall that the detection did not mark as a corridor. The user also draws one "no crossing" line along a fire-compartment wall.

### R5. Sizing

The user presses "Size network". The app writes a diameter (or a width and a height) on each segment of the chosen network, from the flow in the segment.

Example. The Supply Air run of AHU 1 carries 640 dm³/s at the start and 20 dm³/s at the last grille. The main gets a large size and the last branch a small one. The app uses a standard size series. Supply and Return Air are sized each from their own terminals. A balance report (supply against return plus exhaust) is a warning only.

### R6. The shape of the network

The user presses "Route". The app shows a preview of a main along the corridor, a branch to each room, and a sub-branch to each open port. The user accepts, and one undo step removes it. The result is a draft: the app has no duct height, so the designer checks clashes.

Example. For AHU 1 the main runs from the shaft along the corridor. It puts a tee at each office door line and sends one branch into the office. In the office, a sub-branch goes to each of the 4 grilles. The open-port dots go away when a segment connects.

### R7. Electrical circuits

The user presses "Make circuits". The app groups the unassigned luminaires and sockets into circuits, by room and by a limit for each circuit type, and puts them on the panel that serves the rooms.

Example. The office floor has 40 luminaires and 30 sockets. Panel "A" serves the west wing. The app makes light circuits and socket circuits in Circuits mode. Each circuit stays under the limit of its circuit type. A toilet gets its sockets on a circuit with a 30 mA residual-current device (RCD). The user can still move a terminal by hand.

## 2. How each part relates to what exists

| Part | Features that it reads | Features that it changes | Other parts |
|---|---|---|---|
| R2 | Auto-place (`autoPlaceStamps`, `packages/render/src/scene.ts:2755`), routing targets, rooms (`packages/core/src/rooms/room.ts:15`), the status bar chip (`packages/ui/src/components/StatusBar.tsx:97`) | Properties (`RoutingSection.tsx:29`), the open-port count (`scene.ts:2231`-`:2237`), the Rooms tab | Gives the system to R3, R6, R7. |
| R3 | The flow solve root (`packages/core/src/flow.ts:22`, `:95`), equipment stamps, port groups (`network.ts:82`) | Properties of an equipment stamp; the system panel of R2; `computeNetworks` (D-R3-02) | Needs R2. Gives the end of each main to R4 and R6. |
| R4 | Rooms and room types Corridor and Shaft (`room-type.ts:164`, `:176`), the wall lines (data in `wallDebugData`, `scene.ts:661`) | A new overlay for the route area | Needs rooms. Gives the graph to R6. |
| R5 | `solveFlow` (`flow.ts:55`), `terminalCapacities` (`project.ts:33`), network types (`network.ts:22`), segment size fields (`network.ts:48`) | Segment `diameter`, `width`, `height` | Needs a network with a start point (R3). R6 calls it to give routed segments a size. |
| R6 | R2 systems, R3 start points, R4 graph, R5 sizing, the segment tool, fittings, the cascade (`scene.ts:1418`) | Adds segments and fittings | Needs R2 to R5. |
| R7 | Circuits and panels (`circuit.ts:9`, `:72`), the circuit types (`circuit.ts:93`), `autoPlaced.roomId` (`stamp.ts:27`), `terminalCapacities` | Circuits mode | Needs R2 only (the room-to-panel link, D-R7-01). Does not read any field of R3 to R6. |

Rules that every part keeps (`rules.md` §3):
- Rule 1, the segment defines the network type of a port. A system never changes the network type of a port. A system only says which service a routing target belongs to.
- Rule 2, the cascade invariant. No part adds a per-segment field that can differ inside one connected run, except D-R6-02. That field says how the segment was made, not what network it is on. D-R3-02 changes `computeNetworks` and needs a cascade test (see R3).
- Rule 3, reuse before new. R2 puts the link on the room (an existing entity). R7 uses `Panel.equipmentStampId` (`circuit.ts:75`) as the only place that names the panel stamp. R3 stores its own start stamp for mechanical systems only. A system that has a `panelId` (R7) never stores `startStampId`.
- Rule 4, the adoption trap. R6 and R5 call `adoptNetworkTypes` (`scene.ts:2358`) before they write a segment.

## 3. The data that goes from one part to the next

| Data | Made by | Read by | Stored in |
|---|---|---|---|
| Routing target of a port | Part 1 (done) | R2, R6 | `PlacedStamp.routingTargets` (`stamp.ts:33`) |
| `autoPlaced.roomId` | Part 1 (Auto-place) | R2 (stamp to room), R7 | `PlacedStamp.autoPlaced` (`stamp.ts:27`). Only auto-placed stamps have it. |
| System (name, service keys) | R2 | R3, R5, R6, R7 | New `ProjectDocument.systems` (proposed, schema 19). Default on an old file: `[]`. |
| Room to system link, one for each service key | R2 | R2 (open-port count), R6, R7 | New `Room.systems?: Record<string, string>` (service key to system id). Default on an old file: absent. |
| Port to system (for a stamp) | R2 (calculated from the room under the stamp, never stored) | R3, R6 | Not stored |
| Start point of a system (mechanical) | R3 | R5, R6 | `System.startStampId` and `startPortIds` (proposed). Default: absent. |
| Panel of an electrical system | R7 | R7 | New `System.panelId?`. The stamp comes from `Panel.equipmentStampId` (`circuit.ts:75`). Default: absent. |
| Route area and graph | R4 | R6 | Calculated, not stored. Optional hand-drawn route zones and no-crossing lines are stored (D-R4-01). Default on an old file: none. |
| Flow in each segment | `solveFlow` (exists) | R5 | Calculated (`flow.ts:55`) |
| Capacity of a terminal | Auto-place (`scene.ts:2791`) | R5, R7 | `ProjectDocument.terminalCapacities` (`project.ts:33`), one number for each stamp |
| Capacity of a port (stamp with two flows) | R5 (D-R5-04) | R5 | New `PlacedStamp.portCapacities`. Default: absent. |
| Size of a segment | R5, or the user | R6 | `Segment.diameter`, `width`, `height` (`network.ts:48`). Default: absent (exist today). |
| Sizing settings of a network type | R5 | R5 | New optional fields on `NetworkType` (D-R5-03). Default: absent, and R5 asks the user. |
| Routed-by mark of a segment | R6 | R6 (re-run) | New `Segment.routedBy`. Default: absent = hand-drawn. |
| Circuit limits | R7 | R7 | New optional fields on `CircuitType` (D-R7-02). Default: absent = no limit, and R7 asks. |

### Where the new fields get their default on an old file

The schema step for 19 only raises the version. A clean-up on load fills the defaults, as schema 18 does (`auto-routing.md` §4.5). `ProjectDocument.systems` is `[]`. `Room.systems` is absent. `Segment.routedBy` is absent. `PlacedStamp.portCapacities` is absent. The sizing fields on `NetworkType` are absent. The limit fields on `CircuitType` are absent. The new version is 19 for R2 (`project.ts:20` has 18 now). Each next part that changes the format adds the next version.

### How the new state touches the code (R2)

`ProjectDocument.systems` needs 7 edits:
1. The interface and the version, `packages/core/src/project.ts:20`, `:22`-`:57`.
2. A migration step, near `project.ts:301`.
3. A validator, `project.ts:354`-`:362`.
4. The save, `packages/render/src/scene.ts:3772`-`:3788`.
5. The load, `scene.ts:3856`-`:3877`.
6. The state of the document, `packages/render/src/document.ts:34`, `:128`-`:151`.
7. The label context, `scene.ts:1557`, only if a label needs the system. Not verified: no label needs it today.

The clean-up on load removes each entry of `Room.systems` that names a system which does not exist. It also removes a system that lists a service key with no sense. A deleted room or a deleted system leaves no dangling id after a save and a load.

### Gaps: data that one part needs and no part makes

| # | Gap | Needed by | Evidence | Where the plan handles it |
|---|---|---|---|---|
| G1 | Stamps have no page. Rooms, calibrations and segments have a page field, but the code records `pageIndex: 0` for new items. The code says: "each still records pageIndex: 0 regardless of which page is shown". The status bar counts the stamps of all pages. The scene looks up rooms on the active page. | R2, R3, R4, R6 | `scene.ts:984`, `network.ts:50`, `stamp.ts:8` (a stamp has no page), `room.ts:138` (`roomsAtPoint` needs a page), `scene.ts:3255`, `:3343`, `:2236` | D-R2-03 |
| G2 | No project level above the documents. Each PDF file is one document with its own `ProjectDocument`. | R2, R3 (a riser through 4 PDF files) | `scene.ts:624`, `project.ts:22` | D-R2-04 |
| G3 | No door positions. Detection finds door arcs only to remove them. | R4 | `packages/core/src/rooms/types.ts:71`-`:74` | Default D-R4-02 avoids the need |
| G4 | The flow has no unit. The network type has a display label only (CFM, GPM). Only the two air demand types use dm³/s. | R5 | `network.ts:26`-`:27`, `flow.ts:5`, `network-type-library.ts:11`, `room-need.ts:27`-`:28` | D-R5-01 |
| G5 | One capacity number for each stamp. A fan coil unit with Heating Water and Chilled Water has two water flows and an air flow. Auto-place also has no rule that places one stamp for two demand types (a rule serves one `needId`, `placement-rule.ts:92`). | R5 | `project.ts:33`, `scene.ts:2791` | D-R5-04 |
| G6 | The network type has no direction. The flow solve knows only the sum direction, toward the root. The physical flow of a supply run goes away from the unit. The old app had `Direction` (Supply, Return) on a network. | R3, R5 | `flow.ts:34`, `/root/MepSketcher/MepSketcherTools/MEP/Network.cs:42` | Default: sum direction = toward the start point. No `direction` field. |
| G7 | A port group joins ports into one node. A group on an air handling unit can join a supply run and a return run into one network. `computeNetworks` then gives the network the type of the first segment of the union. | R3, R6 | `network.ts:102`-`:109`, `:140`-`:165`, `auto-routing.md` §7 | D-R3-02 |
| G8 | Room ids are not stable. A new run of Detect rooms replaces every unlocked detected room with a new id. A link on a room would be lost. | R2, R7 | `room.ts:190` `mergeDetectedRooms`, `room.ts:165`-`:168` `updateRoom` | D-R2-02 |
| G9 | The segment has no "routed by the app" mark. A re-run of R6 cannot tell hand-drawn segments from routed ones. | R6 | `network.ts:48` | D-R6-02 |
| G10 | A terminal has no power in W. `terminalCapacities` holds the Auto-place number in the unit of its rule (Light is lm, Sockets is a count). `CircuitType` has `units` and `defaultCapacity` (`circuit.ts:98`-`:99`), edited in `CircuitTypesDialog.tsx:83`. No code reads `defaultCapacity` as a limit (a search finds it only in the library, the dialog and the validation, `circuit-type-library.ts:12`-`:19`, `:40`). It is a number in `units` (W for all built-in types, for example 200 for Lighting and 2500 for Sockets) that the user sets for the type. `computeCircuitCapacity` sums the terminal numbers (`circuit.ts:337`). | R7 | `circuit.ts:98`-`:99`, `:337`, `room-need.ts:26`, `:31` | D-R7-02 |
| G11 | The open-port count is by network type only. It has no system. | R2 | `scene.ts:452`, `:2236`-`:2237` | R2 plan |
| G12 | A hand-placed stamp has no room link. Only `autoPlaced` stamps have `roomId`. The room under a stamp can be found with `roomsAtPoint`. | R2, R7 | `stamp.ts:27`, `room.ts:138` | D-R2-07 |
| G13 | A duct has no height (elevation). Obstacles have no model. A drawing has only a ceiling height. | R4, R6 | `project.ts:54` | D-R4-03 |
| G14 | Paste copies `routingTargets` (`scene.ts:4887`) but not port groups and not capacities. The clipboard holds stamps, annotations, segments, fittings, network types and stamp definitions (`scene.ts:4864`). It holds no rooms and no systems. | R5, R6 | `scene.ts:4864`, `:4887`, `auto-routing.md` §7 | Small. Fix in the first task that touches paste. See the paste rule in section 5. |
| G15 | A shaft room has a room type, but no port and no start point. | R3 | `room-type.ts:176` | D-R3-01 |
| G16 | The room demands use 4 different units: Light lm, Supply and Return air dm³/s, Heating and Cooling W, Sockets a count (`room-need.ts:26`-`:31`). Only the air demands are a flow. Heating and Cooling in W do not give a water flow. A water flow needs the temperature difference (delta T) and the fluid. | R5 | `room-need.ts:26`-`:31` | D-R5-05 |
| G17 | Light and Sockets terminals have no routing target and no network type. A system cannot name them with a network type id. | R2, R7 | `placement-rule.ts:125`-`:131` | Service key `electrical` (see Terms) |

## 4. The batch of decisions

Format: id, question, options (key and label), recommendation, reason. `[data model]` means the decision changes the file format or the model.

The rule of the room link (M1). The link of a room to a system is for each service key. A room may have Supply Air from AHU 1 and Exhaust Air from "Exhaust fan 3". Exhaust has its own fan. So `Room.systems` is a map from service key to system id, and a room has at most one system for each service key.

How the system of a port is found (A1). The lookup takes the point of the port and calls `roomsAtPoint(rooms, point, pageIndex)` (`room.ts:138`). The `pageIndex` is the page that is shown (`scene.ts:3255`, `:3343` do the same). The service key of the port is its routing target. The system is `Room.systems[key]` of that room. A port with no room, or a room with no entry, uses the one implicit system of its network type.

### R2. Which network (systems)

**D-R2-01 [data model]** What is a system?
- A: A copy of a network type ("Supply Air 2"), as `duplicateNetworkType` does (`scene.ts:2401`).
- B: A new stored entity with a name and service keys, in `ProjectDocument.systems`.
- C: A name on a calculated network, found by its start point.
- Recommendation: **B**. Reason: A mixes two meanings. The copy also changes the look of the type, and a type cannot hold rooms or a start point. C does not exist before a segment is drawn, so it cannot serve routing. B keeps the network type of the segment as the only network type. A system never writes on a segment. So the rule "the segment defines the network type" and the cascade stay true. Precedent: `Panel` (`circuit.ts:72`).

**D-R2-02 [data model]** How does the user give rooms to a system, and what happens when the user runs Detect rooms again?
- A: Pick rooms. The link is `Room.systems`. A change of the link locks the room (like `roomTypeSource: 'user'`). Side effect: `updateRoom` locks a room only for the fields that it lists (`room.ts:165`-`:168`). A locked room keeps its old polygon when Detect rooms runs again, and the new polygon of that room is dropped (`room.ts:190`-`:192`). The user loses a better outline.
- B: Pick rooms. The link does not lock the room. When Detect rooms replaces a room, the new room takes `systems` from the old room if the label point of the new room lies inside the old polygon. This is the same test that `mergeDetectedRooms` uses to drop a duplicate (`room.ts:197`-`:198`). `roomPlacementKey` (`placement-layout.ts:829`) is not a good match key here: it includes the polygon, so it changes when the polygon changes.
- C: Draw zones (polygons) and store them.
- D: Free text in `Room.properties` (`room.ts:36`).
- Recommendation: **B**. Reason: it uses the rooms that exist and has no side effect on the polygon. A is simple but the lock blocks a better outline. C is a new entity and a new tool. D is free text, so a rename of a system breaks the link. B needs one change in `mergeDetectedRooms` and a core test. Both A and B need the clean-up of dangling ids on load (see section 3).

**D-R2-03 [data model]** Is a floor (a PDF page) a zone? What happens with a multi-page PDF?
- A: No. Stamps are not page-scoped (G1). One PDF file is one floor. The user uses one PDF file for each floor. When the PDF has more than one page (`getPageCount()`, `packages/pdf-engine/src/index.ts:128`), the system lookup is off and the Systems panel says so. Every port uses its implicit system. The app does not guess.
- B: Yes. Add `pageIndex` to `PlacedStamp` and filter by page. Schema 19. The status bar count also filters by page.
- Recommendation: **A**, with the refusal. Reason: B is a large change that no routing part needs if the user keeps one floor in each file. A refusal is better than a wrong system: a stamp on page 2 would be looked up in the rooms of page 1. Not verified: how many users keep several floors in one multi-page PDF. If the user does, answer B and R2 gains one phase. The R2 plan has a test: a core test with rooms on two pages, and a browser check with a real multi-page PDF. Not verified: whether `fixtures/pdfs/` has a multi-page PDF. If none, the tester reports NEEDS_CONTEXT. Nobody makes a fake PDF.

**D-R2-04 [data model]** Can a system serve more than one PDF file (a riser)?
- A: No. A system lives in one document. A riser is a start point (R3) on each floor.
- B: Yes. Add a project level above the documents.
- Recommendation: **A**. Reason: there is no project level (`scene.ts:624`). B changes the save format and the open flow. R3 can still draw one riser stub on each floor.

**D-R2-06 [data model]** Does one system serve more than one network type (supply and return of one unit)?
- A: Yes. One system lists several service keys ("AHU 1": `supply-air`, `return-air`). When the user picks AHU 1 for a room, the app sets the link for every key of AHU 1. The user can then set one key to another system (exhaust to "Exhaust fan 3").
- B: Two linked systems (one for supply, one for return).
- C: Two independent systems.
- Recommendation: **A**. Reason: the user picks the rooms once, not twice, and can still split one type. `Room.systems` is a map, so a room can never have two systems for one key. This removes the "two systems list the same type" conflict by construction.

**D-R2-07** Does a hand-placed stamp get the system of the room under it?
- A: Yes, calculated from the position with `roomsAtPoint` on the shown page (see the rule above). Nothing is stored on the stamp. If the user moves the stamp, the system follows.
- B: Also allow a per-port override on the stamp (`PlacedStamp.routingSystems`). [data model]
- Recommendation: **A**. Reason: it makes Auto-place and a hand-placed stamp behave the same. Moved and unmoved stamps follow a change of the room link with no rewrite. B can come later with no change of A.

**D-R2-08 [data model]** Is the list of systems part of the undo history?
- A: Yes. Add `systems: Record<string, System>` to `DrawingState` (`packages/render/src/document.ts:29`-`:40`), like `panels` and `circuits`, which are undo-tracked (`document.ts:34`-`:37`).
- B: No. A plain list on the document, like `networkTypes`, `terminalCapacities` and `portGroups` (`document.ts:34` comment, `:128`-`:151`). Undo of a room link can then name a system that the user deleted. The lookup treats such an id as "no system".
- Recommendation: **A**. Reason: `Room.systems` is undo-tracked, because rooms are (`document.ts:38`). A list that is not tracked gives a dangling id after one undo. A costs one more record in `DrawingState` and a command for add, rename and delete. The delete command also removes the room links in the same undo step.

### R3. A start point for each network

**D-R3-01 [data model]** What is a start point?
- A: An equipment stamp and its ports (`System.startStampId`, `startPortIds`) for a mechanical system. A shaft is an equipment stamp drawn in the shaft room.
- B: A new fitting kind `riser`.
- C: The shaft room itself.
- Recommendation: **A**. Reason: the flow solve already starts at an equipment stamp (`flow.ts:95`). Not verified: whether the stamp library has a shaft stamp. If it does not, R3 adds one library stamp, and that stays inside the Custom stamp library work. An electrical system does not use this field (see D-R7-01).

**D-R3-02** A port group can join a supply run and a return run into one network (G7). What does R3 do?
- A: `computeNetworks` stops joining runs of different network types through a group. The group still joins runs of one type.
- B: Leave it. Routing treats each port alone.
- Recommendation: **A**. Reason: the run of one network type must not take the type of another (rule 2). `computeNetworks` today gives a network the type of the first segment of the union (`network.ts:140`-`:165`). B leaves a wrong cascade. The change is small. The R3 plan lists every consumer and tests each:
  - the cascade, `setNetworkTypeForSegmentsNetworks` (`scene.ts:1418`, calls `computeNetworks` at `:1427`);
  - the network list (`scene.ts:1483`);
  - the open ports and the status bar (`scene.ts:2231`);
  - `solveFlow` (`scene.ts:3009`);
  - the domain sync (`scene.ts:5106`).
  - Core tests: two segments of different types on one port group give two networks. A cascade test over a group: the user changes the type of one run, and only that run changes. The other run on the same group keeps its type.

### R4. Where a duct or pipe may go

**D-R4-01 [data model]** Where does the route area come from?
- A: Automatic only, from the rooms of type Corridor and Shaft.
- B: Automatic, and the user can draw route zones and "no crossing" lines by hand (stored).
- C: Hand-drawn only.
- Recommendation: **B**. Reason: room types come from name matching and can be wrong (`room.ts:39`, `roomTypeSource: 'matched'`). The user needs a way to fix it. The user also needs a way to mark a fire-compartment wall that no branch may cross (M7). The plan puts A first and the hand items in a later phase. A stored zone is a polygon and a page index. A stored "no crossing" line is a line and a page index.

**D-R4-03** Is a 2D draft acceptable for R4 and R6 (G13)?
- A: Yes. The route has no height. The app shows a note: "Draft in 2D. Check clashes and clearances yourself." The designer decides heights and clashes.
- B: First add a height (elevation) to a segment, then route in 3 steps. This is a per-segment field, so it needs a cascade check (rule 2) and a larger model.
- Recommendation: **A**. Reason: MepApp has no height model and no obstacle model today. B is a separate large feature. A gives value now and does not block B later.

### R5. Sizing

**D-R5-01 [data model]** What is the unit of the flow?
- A: dm³/s inside, for every type. The UI shows dm³/s, with m³/h as a display option (1 dm³/s = 3.6 m³/h). The library labels change from CFM and GPM to dm³/s.
- B: Keep the labels and convert at the edge.
- C: A unit on each network type with a conversion table.
- Recommendation: **A**. Reason: the air demands already use dm³/s (`room-need.ts:27`-`:28`). `NetworkType.units` is a free label that no code reads (`network.ts:26`). One unit means no conversion bug. An old drawing keeps its old label text. This covers air only. Water follows D-R5-05. Not verified: where the display option is stored (the user preferences or the file).

**D-R5-02** Which sizing method?
- A: Each network type has two limits: a maximum velocity (m/s) and a maximum pressure drop (Pa/m). The size is the smallest standard size that meets both. Equal friction for ducts, velocity plus Pa/m for pipes.
- B: Maximum velocity only.
- C: Equal friction only.
- Recommendation: **A**. Reason: it is the common practice, and it never gives a size that fails one limit. The limit values and the size tables come from the standards. The tables are "read from the standard in R5, not from memory": the EN 1506 table of round duct sizes (13 or 14 sizes, not verified), the EN 1505 steps for rectangular ducts, and the DN series for pipes. The R5 research task reads them first.

**D-R5-03 [data model]** Where are the sizing settings stored?
- A: Optional fields on `NetworkType`: maximum velocity, maximum Pa/m, size series, and the delta T of D-R5-05 (the drawing copy, so they travel with the file and follow the adoption path).
- B: A separate list `sizingRules` by network type id on the document.
- Recommendation: **A**. Reason: reuse. The drawing already keeps its own copy of each type. B is a second place to read for one type.

**D-R5-04 [data model]** How does a stamp with two flows keep them (G5)?
- A: Keep one number. R5 sizes only terminals with one flow.
- B: Add `PlacedStamp.portCapacities` (port id to number). `terminalCapacities` stays for a stamp with one flow.
- Recommendation: **B**. Reason: a fan coil unit has a heating flow and a cooling flow on two ports. It also has an air flow, and a condensate drain. A would size one of them wrong. R5 v1 sizes the water ports. The air flow and the drain of a fan coil unit stay outside R5 v1 and the plan says so. Not verified: how Auto-place gives such a stamp two flows. Today a rule serves one demand type, so the plan adds the entry by hand in Properties first.

**D-R5-05 [data model]** How does R5 turn a heating or cooling power in W into a water flow (G16)?
- A: R5 v1 sizes air networks only. Water networks wait for a later version.
- B: R5 v1 also sizes water. The flow is q = P / (cp × delta T). Each water network type gets a delta T field (D-R5-03). The fluid is water. R5 asks for the delta T when the field is empty. The plan gives no default value. Typical values (for example 20 K for heating and 6 K for cooling) are not verified.
- Recommendation: **B**. Reason: the batch D-R5-03 already adds fields to `NetworkType`, so one more field is cheap. A leaves out heating and cooling, which are half of the HVAC work. The user enters delta T, so the app invents no value. R5 reads cp of water from a source and states it in the plan. Not verified: the source value.

Supply and return rule (M2). R5 sizes Supply Air from its own terminals and Return Air from its own terminals. It never sizes return from supply. A balance report (supply against return plus exhaust, per room and per system) is a warning only. It does not block the sizing.

### R6. The shape of the network

**D-R6-01** One branch for each terminal or for each room?
- A: For each terminal, from the nearest point of the main.
- B: For each room: one branch to the room, then sub-branches to its terminals.
- Recommendation: **B**. Reason: this is how designers draw it. It gives fewer crossings and a clean tee at the room.

**D-R6-02 [data model]** What does a re-run do with routed segments?
- A: Mark routed segments (`Segment.routedBy`). A re-run replaces unchanged routed segments and keeps hand-drawn or edited ones. This is the same idea as `autoPlaced.moved` (`stamp.ts:27`).
- B: A re-run only connects open ports and never removes a segment.
- C: A re-run removes all routed segments.
- Recommendation: **A**. Reason: it matches Auto-place, so the user learns one rule. The new field says how the segment was made. It does not say what network the segment is on, so rule 2 stays true.

### R7. Electrical circuits

**D-R7-01 [data model]** Which panel serves which rooms?
- A: An electrical system of R2 (service key `electrical`). Rooms link to it through `Room.systems['electrical']`. The system has `panelId`. `Panel.equipmentStampId` (`circuit.ts:75`) is the only source of the panel stamp. The system stores no start stamp, and R7 reads no field of R3. A terminal without a routing target (Light, Sockets) uses the electrical system of its room.
- B: A list of rooms on `Panel`.
- C: The nearest panel by distance, with no stored link.
- Recommendation: **A**. Reason: one model for rooms and services, and one source for the panel stamp (rule 3). R7 needs R2 only. If the user answers D-R2-01 with A or C, this becomes B.

**D-R7-02 [data model]** Where are the circuit limits, and what are they?
- A: Reuse `CircuitType.defaultCapacity` (`circuit.ts:99`) as the load limit in `units`, and add optional `maxTerminals` and `diversity` (for sockets) on `CircuitType`. The document already has its own copy of the circuit types (`project.ts:38`).
- B: New fields only. `defaultCapacity` keeps its unused meaning.
- C: Fixed values in code.
- Recommendation: **A**. Reason: reuse (rule 3). `defaultCapacity` is already a number in W that the user edits for each type, and nothing reads it. All limits are user-editable defaults with the source "design practice". NEN 1010:2020 no longer regulates a minimum or maximum count of sockets or luminaires per circuit, and IEC 60364 does not set it either. The real protection is the rating of the breaker and the section of the cable. Source: Techniek Nederland, webinar NEN 1010:2020 (https://technieknederland.nl/stream/presentatie-webinar-13-oktober-2021-wat-is-nieuw-in-de-norm-nen-10102020). A light circuit counts its load in W or A. A socket circuit uses a diversity factor. Terminals have no W today (G10), so R7 v1 limits by count and by the W of terminals that have one. R7 also sets `device.ratingA` on the circuit (`circuit.ts:30`) only from a value that the user entered. Not verified: the default values.

## 5. Defaults that I assume

The user does not need to answer these.
- D-R2-05 (was a user decision): a segment does not store its system. `rules.md` §3 rule 2 forces this. A per-segment `systemId` must follow the whole run. MepApp calculates the system of a run from its start point (R3) and the system of the ports on it. When a drawn segment joins two systems of one type, the run shows a warning in R3. It does not block.
- D-R4-02 (was a user decision): a branch may cross any wall, with a cost for each crossing. The main stays in the corridor. This is a technical choice: ducts run above the ceiling and cross walls at openings that the designer picks. The domain checker confirms it, with these additions.
  - A fire-compartment wall or a shaft wall has a very high cost, or a ban. A crossing is flagged for the designer.
  - The user can mark a "no crossing" line (stored, D-R4-01 B).
  - A branch above the ceiling needs no door detection.
  - R4 shows a minimum clearance as a note. The app has no height model (G13), so the output is a draft and clashes stay with the designer.
- One implicit system for each network type. A port with no listed system uses it. The user sees no new step with one air handling unit.
- The system of a port is calculated live, from the shown page (see section 4). A change of a room link moves the system of unmoved and moved stamps with no rewrite.
- Stamps placed by hand: no system override. See D-R2-07.
- A system does not change the open-port dot color. The dot keeps the color of the routing target. The status bar count and the tooltip add the system name.
- The network tree lists the systems in a later task of R2, as a group above the networks of one discipline. No new panel.
- Paste. The clipboard has no rooms and no systems (`scene.ts:4864`). A pasted stamp carries no system. It takes the system of the room it lands in. The R2 plan keeps this true: if a later change puts rooms on the clipboard, the paste strips `Room.systems` for another document. Paste copies `routingTargets` (`scene.ts:4887`) but not port groups and not capacities (G14). Undo and save use the document. The PDF export carries the systems in the embedded project JSON.
- A system can exist with no start point. Only R6 needs the start point.
- Sum direction = toward the start point (`flow.ts:34`). No `direction` field on `NetworkType`.
- R4 is 2D (D-R4-03).
- The route graph is calculated on demand and not stored (like `computeNetworks`, `network.ts:1`).
- R5 sizes on a button press, writes all segments of the chosen network, in one undo step.
- R6 shows a preview, as the Auto-place dialog does, then the user presses Place.
- R7 assigns only terminals with no circuit (`findCircuitForTerminal`, `circuit.ts:202`). It groups light and sockets apart. It never moves a terminal that is already on a circuit.
- R7 and fixed appliances. The circuit type list already has "Kitchen Appliance" for an oven, a hob or a dishwasher (`circuit-type-library.ts:14`). So R7 needs no new type. R7 skips high-load stamps (a stamp whose capacity is above a user-editable threshold) and leaves them for the user. How R7 knows a washing machine: not verified, the stamp category is the likely source.
- R7 and wet rooms. A wet room needs a residual-current device of 30 mA. The circuit has `device.rcdMilliamps` (`circuit.ts:31`). R7 puts the sockets of a wet room only on a circuit with `rcdMilliamps` of 30 or less, or it makes a new circuit with 30. The wet room types are a user-editable list. The default list has Toilet and Bathroom (`room-type.ts:168`-`:169`). The clause numbers of the standard are not verified.
- Each schema change is a version-only step plus a clean-up on load, as in schema 18. The new version is 19 for R2.

## 6. Risks and order

Order: R2, R3, R4, R5, R6, then R7 (or R7 after R2).
- R3 needs the system of R2. R6 needs R2, R3, R4 and R5. R5 comes before R6, because R6 must give each routed segment a size and R5 can size drawn networks alone.
- R7 needs R2 only. D-R7-01 A reads `Room.systems` and `System.panelId` (R2 and R7 fields) and `Panel.equipmentStampId` (existing). It reads no field of R3. So the director can run R7 right after R2, before R3 or R4, if R4 is blocked. The ledger has an `order` field for this (`protocol.md` §7). If the user answers D-R7-01 with B or C, R7 needs even less of R2.
- R4 phase 1 (the graph from corridor rooms) and R5 phase 1 (pure sizing functions with tests) store nothing. They run with no answer to the batch. R2 and R3 start with core types and tests, but their stored data waits for D-R2-01, -02, -06, -08 and D-R3-01.

Risks:
- Several parts change the file format (schema 19 and later). Each change adds a version-only step. An older MepApp refuses a newer file (`auto-routing.md` §4.5).
- G1 (stamps not page-scoped) is the largest. If the user keeps several floors in one multi-page PDF, then R2 to R6 need page scope first. Ask in D-R2-03.
- Room detection quality sets the quality of R4 and R7. `room-detection` notes say that 13 of 34 room shapes of the 10A drawing are within 15 % (memory, "Room detection Phase 8"). Not verified here.
- R4 and R6 give a 2D draft. The designer checks clashes and clearances (D-R4-03).
- R6 is a heuristic. Expect a visual review by the user.
- Every merge needs `pnpm build` (`rules.md` §3, rule 6).
- A change of `mergeDetectedRooms` (D-R2-02 B) touches room detection. Test Detect rooms again after a link (G8).

## 7. Count of decisions for the user

| Part | Decisions |
|---|---|
| R2 | 7 (D-R2-01, -02, -03, -04, -06, -07, -08) |
| R3 | 2 (D-R3-01, -02) |
| R4 | 2 (D-R4-01, -03) |
| R5 | 5 (D-R5-01 to -05) |
| R6 | 2 (D-R6-01, -02) |
| R7 | 2 (D-R7-01, -02) |
| Total | 20 |
