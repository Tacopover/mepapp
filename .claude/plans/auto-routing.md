# Routing to the placed stamps — part 1: routing targets on stamps

Status: **assessment, comparison, model, answers, mockup and road map done (2026-10-14). Decisions of the user (2026-10-15, §11): the rule is the owner; the value on a port is a routing target, not the network type of the port; the user can set a routing target by hand in Properties; layout A; P7 dropped; the UI word "need" becomes "demand type" now (P0). Part 1 done 2026-10-15: P0 to P6 (§9), branch pushed, not merged. Next: the user tests the branch on Windows; then the plan of R2 (prompt: `auto-routing-r2-prompt.md`). The agent framework of `agent-framework-prompt.md` (2026-10-16) is to run R2 to R7.** Branch `worktree-auto-routing`, made from `origin/worktree-room-type-calculations` (a3f3ee9), because `origin/master` (4c31201) does not contain 3f66722. Master had no newer commits, so no merge was necessary. Prompt: `auto-routing-prompt.md`.

Mockup: artifact https://claude.ai/artifact/Ugzv9CJtBdJ5rKuPSAmg7e, copy in `.claude/plans/auto-routing-mockup/mockup.html`. Checked in Chromium (Playwright 1.63): 38 checks pass (19 at 400 px in the dark theme, 19 at 1280 px in the light theme). The checks type into the rule name and the capacity box, use the selects, the check boxes and the buttons, click and key-select stamps in the drawing, find no horizontal page scroll and no page errors. The mockup is older than decisions 4 to 6 (§6 says which parts do not apply).

Terms in this file:
- **Port**: a connection point of a placed stamp. A stamp without ports of its own has one synthetic port at its center (`__center__`, `stamp.ts:44`).
- **Routing target**: the network type that routing must connect to a port (`PlacedStamp.routingTargets`). It is not the network type of the port. The network type of a port always comes from the segment that connects to it (§11, decision 4).
- **Open port**: a port with a routing target and no segment.
- **Owner**: the place where the user chooses the routing target before Auto-place writes it on the stamps (the rule, the demand of a room type, or both).
- **Network**: one set of joined segments, calculated by `computeNetworks`, never stored. The earlier term "system" is replaced: see `roadmap-overview.md` (2026-10-16). The code has the words **network** and **network type** only.
- **Demand type**: one thing that a room requires, as one total in one unit. The code calls it a need (`RoomNeed`, `core/rooms/room-need.ts:11`, from `room-type-calculations.md`); the UI says "demand type" after P0. MepApp has 6 built-in demand types: Light (lm), Supply air (dm³/s), Return air (dm³/s), Heating (W), Cooling (W) and Sockets (a count). The user adds own demand types in the Room types table. A demand type is not a network type. The demand type Supply air is the amount of air that a room requires. The network type Supply Air is the kind of duct that carries the air.
- **Demand**: the calculation of one demand type for one room type, for example "Office: Supply air 6.5 dm³/s per person" (`RoomDemand`, `room-type.ts:21`). One demand is one cell of the Room types table.
- **Rule**: a placement rule (`PlacementRule`, `placement-rule.ts`). A rule with `countBy: 'need'` serves one demand type (`needId`). Auto-place divides the total of the demand type in a room by the capacity of one stamp, and rounds up. A rule can also count without a demand type: "The same number in each room" or "by coverage".

## 1. The goal of part 1

Auto-place writes a routing target onto each port of each stamp that it places. Routing (a later part) reads the routing targets to find the ports that it must connect, and the network type of the segments that it must draw. The routing target is optional: a luminaire or a socket joins no drawn network. A segment that connects to a port defines the network type of the port; the routing target does not.

Part 1 also lets the user see and set the routing target of any port in Properties (an explicit choice, never a default), shows the open ports in the drawing, and keeps the value correct when MepApp copies, replaces or changes a stamp.

## 2. Assessment: each place that reads or copies the fields

Columns: **Must** = what part 1 must do there. "Keep" = the routing target must survive. "Read" = the place uses it. "Show" = the UI shows it.

| Place | File:line | What it does today | Must |
|---|---|---|---|
| `PlacedStamp.ports` | `core/stamp.ts:15` | A copy of the ports of the definition | No change. The routing target goes into a separate map (§4.1). |
| `PortSpec` | `core/geometry.ts:256` | `{id, name, fractionX, fractionY}` | No change (§4.1 says why). |
| `getStampPorts`, `__center__` | `core/stamp.ts:44`, `:64` | The ports, or the synthetic center port | Read: the UI rows and the helpers use it, so a stamp without ports gets one row "Center". |
| Stamp tool | `render/tools/placeStampTool.ts:56` | `[...definition.ports]`: the PortSpec objects are shared with the definition | Nothing: a stamp placed by hand gets no routing target (§11, decision 4). |
| Auto-place | `render/scene.ts:2613` `autoPlaceStamps`; `ui/components/autoPlacePlan.ts:47` `groupsOf` | Writes ports, `autoPlaced`, capacity | Read and keep: `groupsOf` gets the map for each planned stamp from the rule, `autoPlaceStamps` writes it and adopts the network types. |
| Edit of a definition | `scene.ts:2389` `applyDefinitionToPlacedStamps` | New copy of the ports; ends on lost ports go to a new fitting | Keep: remove the keys of the lost ports, keep the others (match by id, as today). |
| Replace stamp | `scene.ts:2485` `replaceSelectedStamps`, `:2419` `planPortReplacement` | Maps the ports by place (`matchPortsByLocation`), else by id | Keep: move each key with the same `remaps`, remove the keys of the lost ports. Replace already calls `markAutoPlacedMoved`. |
| Copy and paste | `scene.ts:4663` `copySelection`, `:4695` `pasteClipboard` | Spread copy of the stamp without `autoPlaced`; adopts the network types of the copied segments | Keep: the spread keeps the map. Copy must also take the network types that the copied stamps name, so paste into another drawing adopts them. |
| Undo | `core/commands.ts:192` `Transaction` | Whole-state snapshots | Nothing: a field of `PlacedStamp` is in the state. `doc.networkTypes` is not in undo; an adopted type stays after an undo, as for segments today. |
| Save and load | `scene.ts:3591` `serializeDocument`, `core/project.ts:378` `loadProject` | Stamps are written and read as they are | Keep: schema 18 (§4.5), and the load drops entries that are not strings. |
| PDF export and import | `scene.ts:3842` embedded `mepapp-project.json`; annotations at `:3987` | The stamp data travels only in the embedded JSON | Nothing: the map travels in the JSON. The dots of open ports are not exported. |
| Read model of a stamp | `scene.ts:1151` `toStampInfo` | `ports`, `linkedPortIds`, `capacity` | Read: add `routingTargets` and the network type of the segment on each connected port. |
| Properties panel | `ui/components/PropertiesPanel.tsx:554`–`:711` | Position, rotation, color, scale, capacity, circuit, custom, "Linked ports" | Show: a "Routing" section (§6). |
| Port-group picker | `PropertiesPanel.tsx:684` "Linked ports" | Groups ports of an equipment stamp | Nothing. A group does not force one routing target (§5 question 3). |
| Segment tool | `render/tools/drawSegmentTool.ts:123` | A new segment gets the active network type | Read (P6): a segment that starts at an open port takes its routing target as its network type. |
| Network type cascade | `scene.ts:1369` `setNetworkTypeForSegmentsNetworks` | Retags the whole connected run | Nothing: the segment defines the network type of a connected port, and the cascade changes no routing target (§5 question 6). |
| Network types of the drawing | `scene.ts:2245` `setActiveNetworkType`, `:2262` `updateNetworkType`, `:2277` `duplicateNetworkType`, `:1377` adoption in the cascade | Each path adopts a type on its own | Read: one shared `adoptNetworkTypes` for every path, also auto-place, paste and Properties (prerequisite 8). |
| Flow solve | `core/flow.ts:55` `solveFlow` | Uses `portGroups`, `terminalCapacities`, `elementCategories` | Nothing in part 1. |
| Network tree panel | `ui/components/NetworkTreePanel.tsx`, `scene.ts:1435` `getNetworkSummaries` | Lists the computed networks and their elements | Nothing in part 1. A list of open ports goes to routing (§8, R6). |
| `computeNetworks` | `core/network.ts:147` | The network type of a run comes from its first segment | Nothing. |
| Placement rule | `core/rooms/placement-rule.ts:79`, `:590` `toPlacementRule`, `:387` `validatePlacementRule`, `:714` `PLACEMENT_RULE_EXAMPLES` | The parse builds a new rule field by field | Read and keep: the parse must read the new fields, else it drops them silently. The examples get values. |
| Rule draft and guide | `ui/components/placementRuleDraft.ts:46` `draftOf`, `:94` `needPatch`, `:118` `ruleOf`; `PlacementRuleGuide.tsx:601` step 1 | Text draft of the rule | Show: the Routing section in step 1 (§6). |
| Rule storage | `ui/placementRuleStorage.ts:16` | Examples when nothing is stored | Nothing: an old stored rule has no routing target (§4.5). |
| Auto-place worker | `core/rooms/placement-worker.ts:28` | postMessage of rules and stamps | Nothing: the new fields pass through. |

## 3. The owner of the routing target

### 3.1 The cases

| Case | (a) The rule | (b) The demand of a room type | (c) Both |
|---|---|---|---|
| Fan coil unit with 2 ports: Chilled Water and Heating Water | Works. The rule knows the stamp, so it lists the 2 ports and gives each one a type. | Does not work. The demand "Cooling" knows no stamp and no port. It can give one type, and the second port stays wrong. | Works only through the rule part. |
| Toilet exhaust against office return air (both serve the demand type Return air) | Works with 2 rules. The examples already have 2 rules: "Return air valve toilet" (toilet, bathroom; center; max 1) and a grille rule for other rooms. The stamp, the count and the layout differ, so the rules differ anyway. | Works with 1 rule: the Toilet type says Exhaust Air. But a toilet valve and an office grille are different stamps, so 1 rule rarely serves both. | Works. The user must look in 2 places to know what a stamp gets. |
| Radiators for Heating | Works: one rule "Radiator" → Heating Water. | Works, but each of about 20 room types with Heating must get the same value. | Works. |
| Sockets, Light | Works: none (the default). | Works: none. | Works. |
| Smoke detector by coverage, thermostat "the same number in each room" | Works: the rule has the field for each way to count. | Does not work: these rules serve no demand type, so no demand exists. | Works only through the rule part. |
| One building, 2 air handling units | Not the job of a routing target. The user gives the start stamp and the rooms when the route command runs (`roadmap-overview.md`, R2). | The same. | The same. |

### 3.2 Recommendation: (a) the rule (accepted)

- The routing target belongs to the stamp, not to the room. A supply grille joins Supply Air in each room type.
- Only the rule knows the stamp, so only the rule can give a different type to each port.
- Only the rule exists for each way to count. The demand exists only for a rule that serves a demand type.
- The user chooses once per rule, not once per room type.
- One place to look: the rule says what its stamps get.

The argument for (b) is real but small: "the air of this room goes out of the building" is a property of the room. If a later case must have this, the demand can get an optional override (`RoomDemand.routingTarget`) that wins over the rule. This addition does not change the model of part 1, so part 1 does not add it.

## 4. The data model

### 4.1 The stamp side (`core/stamp.ts`)

```ts
export interface PlacedStamp {
  // ... the fields of today
  /**
   * The network type that routing must connect to each port, by port id (auto-routing.md §4.1).
   * Not the network type of the port: a connected segment defines that. A stamp without ports of
   * its own uses SYNTHETIC_CENTER_PORT_ID. A port without an entry has no routing target.
   * Absent = no port has one.
   */
  routingTargets?: Record<string, string>;
}

/** The routing target of one port, or undefined. */
export function routingTargetOf(stamp: Pick<PlacedStamp, 'routingTargets'>, portId: string): string | undefined;

/** The map after a change of the ports: keys move by `remap` (old id -> new id), keys of ports not in `keep` go. Undefined when nothing stays. */
export function remapRoutingTargets(map: Record<string, string> | undefined, keep: ReadonlySet<string>, remap?: ReadonlyMap<string, string>): Record<string, string> | undefined;
```

Why a map on the stamp, not a field on the `PortSpec` copy, and not one value for the stamp:
- A field on `PortSpec` fails for the 63 library stamps with `ports: []`: the synthetic center port is not in `stamp.ports`, so it has no object to hold the field.
- `applyDefinitionToPlacedStamps` and Replace stamp put a new copy of the ports on the stamp, so a field on the copy is lost there. The stamp tool shares the `PortSpec` objects with the definition (`placeStampTool.ts:56`), so a write into a port can change `STAMP_LIBRARY`.
- One value for the stamp fails for the fan coil unit with 2 ports.
- The map is in the drawing state, so undo, save, the PDF JSON and paste keep it with no extra code.

### 4.2 The owner side: the rule (`core/rooms/placement-rule.ts`)

```ts
export interface PlacementRule {
  // ... the fields of today
  /** The routing target of each port of the placed stamps (auto-routing.md §4.2): a network type id. Absent = none. */
  routingTarget?: string;
  /**
   * A stamp with 2 or more ports: the routing target of each port id of the stamp, in place of
   * routingTarget. Null = this port gets no routing target. A port without an entry gets routingTarget.
   * An id that the stamp does not have (the user chose another stamp) changes nothing.
   */
  portRoutingTargets?: Record<string, string | null>;
  /**
   * A copy of each network type that the rule names and that NETWORK_TYPE_LIBRARY does not have
   * (a type that the user duplicated in a drawing). Auto-place adds the copy to a drawing that
   * does not have the type.
   */
  networkTypeCopies?: NetworkType[];
}

/** The default routing target of a built-in demand type (code: need). Light, Sockets and own demand types have none. */
export const NEED_ROUTING_TARGET_DEFAULTS: Readonly<Record<string, string>> = {
  supplyAir: 'supply-air',
  returnAir: 'return-air',
  heating: 'heating-water',
  cooling: 'chilled-water',
};

/** What a stamp placed by the rule gets: the routing target of each port of `ports` (getStampPorts semantics), or undefined. */
export function ruleRoutingTargets(rule: Pick<PlacementRule, 'routingTarget' | 'portRoutingTargets'>, ports: readonly PortSpec[]): Record<string, string> | undefined;
```

The guide writes `routingTarget` for a stamp with 0 or 1 port. For a stamp with 2 or more ports, the check box "Give each port of the stamp its own routing target" writes an entry for each port; when the user clears the check box, the guide removes the map.

### 4.3 The stamp definition (phase P7, dropped by the user on 2026-10-15)

A stamp definition gets no default routing target and no default network type (§11, decision 4).

### 4.4 The scene and the UI

- `AutoPlaceGroup.stamps[i].routingTargets?: Record<string, string>` (each planned stamp, like `capacity`), and `AutoPlaceGroup.networkTypeCopies?: NetworkType[]`.
- `StampInfo.routingTargets?: Record<string, string>`, and `StampInfo.portSegmentTypes?: Record<string, string>`: the network type of the segment on each connected port (read only, from the segments).
- `SketchScene.setRoutingTarget(stampIds: string[], portId: string, networkTypeId: string | null)`: one undo step, adopts the type, calls `markAutoPlacedMoved`.
- `SketchScene.adoptNetworkTypes(ids: Iterable<string>, copies?: readonly NetworkType[])`: the drawing keeps its own copy when it has the id, else it adopts the copy, else the library type (P2: the copy comes first, so a paste keeps the version of the source drawing as before; a rule has copies only of types that the library does not have, so the order does not change a rule). It emits `networkTypesChanged` once. The cascade, `setActiveNetworkType`, `updateNetworkType`, auto-place, paste and `setRoutingTarget` all use it.

### 4.5 Migration

- **Drawing**: schema 18, a step that changes only the version, the same as v5 → v6 (`PlacedStamp.color`). The reason: an older MepApp refuses a newer file (`schema.ts:68`), so it cannot open the file and then drop the field when it saves. The load removes entries of `routingTargets` that are not strings, and an empty map.
- **Rules in the user library** (`mepapp.placementRules.v1`): no migration. An old rule has no routing target, and Auto-place writes none for it. Step 1 of the guide shows "Supply air usually goes to Supply Air. Use Supply Air". MepApp does not fill a default silently: a stored rule then does what it did before.
- **`parsePlacementRules`**: reads `routingTarget` (a non-empty string), `portRoutingTargets` (string or null values; other values go), `networkTypeCopies` (a parse of each `NetworkType`; bad entries go). `validatePlacementRule` refuses an empty id.
- **`PLACEMENT_RULE_EXAMPLES`**: `example-supply-air` → `supply-air`; `example-toilet-exhaust` → `exhaust-air`; `example-air-changes` (technical room) → `return-air`; `example-lighting` and `example-smoke-detector` → none.
- **Room types**: no field in part 1.

## 5. Answers to the open questions

1. **The owner.** The rule (§3). No override in the room type in part 1. If a later case must have it, the demand gets an override that wins over the rule.
2. **Defaults.** Yes, for the built-in demand types: Supply air → Supply Air, Return air → Return Air, Heating → Heating Water, Cooling → Chilled Water. Light, Sockets and own demand types → none. The guide fills the default when the user makes a rule or changes the demand type, but only when the old value was the default of the old demand type, so a choice of the user stays. An own demand type gets no default in part 1: the choice in the rule is enough, and a field on the own demand type adds a control to the Room types card for a small gain.
3. **More ports.** The check box "Give each port of the stamp its own routing target" shows one row for each port (name, place, select). A port group does not force one routing target. A group joins ports into one node for the flow (an air handling unit passes air from the return side to the supply side), but routing must draw a Return Air duct to the return port and a Supply Air duct to the supply port. So each port keeps its own routing target. (§7 lists a problem of `computeNetworks` with groups.)
4. **The stamp definition.** No: the user dropped P7 on 2026-10-15 (§11, decision 4). A stamp definition gets no default.
5. **Stamps placed by hand.** Yes (§11, decision 5): Properties shows a row for each port, for each stamp (§6). A port without a segment shows a select for its routing target, with "None" as the start value. A connected port shows the network type of its segment, and no select. A change calls `markAutoPlacedMoved`, the same as a change of a custom property (`scene.ts:2736`). Else a new run of Auto-place replaces the stamp and loses the change. A multi-selection of stamps of one definition shows the same rows, with "Mixed" when the values differ.
6. **Segments.** The segment defines the network type of a port (§11, decision 4). The routing target is only the wish of routing:
   - A segment of type A on a port with the routing target B: the port is on a network of type A. MepApp shows no mismatch and changes nothing. While the segment is there, MepApp ignores the routing target. When the user deletes the segment, the port is open again and shows its routing target.
   - The segment tool: a segment that starts at an open port takes the routing target of the port as its network type, and the active network type changes to it, so the next segments of the chain have the same type. A segment that ends at a port does not change its type.
   - The cascade: a change of the network type of a run changes no routing target.
7. **Drawings and libraries.** At placement, `adoptNetworkTypes`: the drawing keeps its own version of a type when it has the id (a changed color stays), else it adopts the copy in the rule (`networkTypeCopies`, only for types that the library does not have), else the library type. The guide lists the library types and the types of the open drawing; a type of the drawing that the library does not have ("Supply Air 2" from `duplicateNetworkType`) is stored as a copy in the rule. If no copy exists (an old rule, a deleted drawing), the Check step shows "the network type of the rule is not found", and the stamps get no routing target for that port.
8. **A second run of Auto-place.** Unmoved stamps: the re-run replaces them, so they get the new routing target. Moved stamps: they keep their routing target, because "moved" means "the user owns this stamp". The Check step adds to the existing note "2 moved stamps kept" the text "with another routing target" when their targets differ from the rule. The user can change them in Properties with a multi-selection.
9. **Display.** Yes. An open port shows a dot in the color of its routing target. A connected port and a port without a routing target show nothing. The status bar gets a check box "Open ports" (on by default) and a count by type. The dots are in the overlay of MepApp only, not in the PDF export. The network tree panel does not list open ports in part 1: that list belongs to routing (R6) and to the Networks panel spec.
10. **Electrical.** Light and Sockets get none by default. MepApp groups luminaires and sockets into circuits (`Circuit.terminalIds`), not into drawn segments, so a routing target such as Branch Circuit would tell routing to draw wires that MepApp does not use. The later circuit automation (R7) reads the demand type of the rule (Light, Sockets) and the circuit types, not the routing target. A user who draws conduit or cable tray to a stamp can still choose Conduit or Cable Tray in the rule.
11. **Which network.** The next part (R2), not part 1. Part 1 stores only the type. Replaced on 2026-10-16: the app stores no system and no grouping. The user gives the start stamp and the rooms (or the selected stamps) when the route command runs. See `roadmap-overview.md` and `auto-routing-r2.md`. The text about `routingSystemIds` no longer applies.

## 6. The mockup

Artifact https://claude.ai/artifact/Ugzv9CJtBdJ5rKuPSAmg7e. It shows:
- **Layout A (accepted)**: the section in step 1 "Stamp", below "What does the stamp serve?". Step 1 has the stamp, its ports and the demand type, and the demand type gives the default. The section is the same for each way to count.
- **Layout B**: the same section in step 3, below "Write the amount per stamp to each stamp as its capacity". Both write a value to each stamp. But step 3 has a different form for each way to count, so the section must go into 3 forms, and the demand type is 2 steps away.
- The section: the select with a line sample of the type, the default tag, "Use Supply Air" when the value is not the default, the note for a type that is only in the drawing, the check box for each port, a row for each port, and "Each placed stamp gets".
- Three example stamps: a supply grille (no ports of its own: the center), a fan coil unit with 2 ports (Chilled Water, Heating Water), a luminaire (none).
- **Properties**: a section with a row for each port (or "Center"), the status of each port (no segment yet / connected), and the auto-placed note.
- **The drawing**: dots on open ports, no mark on a connected port or a port without a routing target, and the "Open ports" check box with the count by type in the status bar.

The mockup is older than decisions 4 to 6. These parts of it do not apply: the ring and "!" on a mismatch, the status "another type" with "Use … for the port", the label "Network type" (now "Routing target"), the section name "Networks" in Properties (now "Routing"), and the word "need" (now "demand type").

## 7. Other findings (not in scope)

- `computeNetworks` (`network.ts:147`) joins grouped ports into one node, so the supply and return ducts of an air handling unit with a port group become one network with the type of its first segment. The cascade (`scene.ts:1369`) then retags the return run with the supply run. Routing must handle this (R3, R6).
- Paste (`scene.ts:4695`) does not copy the port groups and the capacities (`terminalCapacities`) of the pasted stamps.
- The segment tool draws a segment with the active type also when it connects to a run of another type, so a run can have mixed types (`computeNetworks` takes the first).
- `placeStampTool.ts:56` shares the `PortSpec` objects of the definition with the placed stamp. No code writes into them today.

## 8. Road map: the later parts (draft)

Each part gets its own plan. No detailed design here.

**R2 — Which network: the route dialog input and the port finder. DONE 2026-10-17 (see `auto-routing-r2.md`).** Replaced on 2026-10-16 by `roadmap-overview.md`; the plan is `auto-routing-r2.md`. The text below is the old draft.
- Exists: network types per drawing; networks that MepApp calculates from the segments (`computeNetworks`), never stored; `.claude/plans/networks-panel-spec.md`.
- Now: a route dialog takes the start stamp, the start port, the network type, and the target ports (given as rooms, or as the selected stamps). A pure finder in core lists the open ports. Nothing is stored. A multi-page PDF is refused.
- Old draft (dropped): a stored system with a name, a start point and its rooms or zone.

**R3 — A start point for each network.**
- Exists: the category `equipment`; the flow solve takes `rootElementId` or an equipment stamp (`flow.ts`); the segment chain continues through equipment ports.
- Missing: a start point that is not a stamp (the place where the main duct or pipe comes onto the floor: a shaft, a riser); a link from a network to its start point (replaced: the start stamp is route input, see `roadmap-overview.md`).
- Open questions: a new stamp category, a fitting kind `riser`, or a port of a shaft room? What about port groups that join the supply and return sides (§7)?
- Research: shafts from room detection (the room type Shaft exists); risers across pages.

**R4 — Where a duct or pipe may go.**
- Exists: room polygons and room types (Corridor, Shaft); wall lines of the room detection (debug menu); no door positions (`rooms/types.ts:71`–`:74` finds door arcs only to remove them).
- Missing: a routing graph (corridor center lines, places where a branch may cross a wall), obstacles, heights.
- Open questions: mains only in corridors? Branches only through doors, or through any wall above the ceiling? Can the user draw "route zones" by hand?
- Research: a corridor skeleton (medial axis) from room polygons; door detection (`room-auto-placement.md` Phase 7); path search (A* on a grid or a visibility graph).

**R5 — Sizing.**
- Exists: auto-place writes the capacity of each stamp; `solveFlow` adds the capacities along the segments. Segments have `diameter`, `width`, `height`, but MepApp calculates no size (`flow.ts`: "There is no pressure drop, velocity, or duct/pipe sizing computed anywhere here").
- Missing: sizing rules for each network type (max velocity or pressure drop), series of standard sizes, a unit for the capacity (a capacity is a number without a unit; a network type has only a display label such as "CFM").
- Open questions: the unit of the flow (the rules write dm³/s or m³/h, the library types say CFM or GPM); round or rectangular; when to size (after routing, on each change).
- Research: the equal friction and velocity methods; standard round duct sizes (EN 1506) and rectangular sizes; pipe sizing tables for water.

**R6 — The shape of the network.**
- Exists: segments, fittings (junction, elbow, tee, reducer, cross), the segment tool and the cascade.
- Missing: the algorithm (a main along the corridor, a branch to each room, a sub-branch to each open port), fittings at the joints, a list of open ports by type (the network tree panel).
- Open questions: one branch per terminal or per room? Can the user lock a drawn main and let routing add only the branches? What does a re-run do with routed segments (the same question as moved stamps)?
- Research: rectilinear Steiner tree heuristics; the layout practice of HVAC designers; how the old MEPSketcher draws branches.

**R7 — Electrical circuits.**
- Exists: `Circuit` (`terminalIds`, `panelId`), panels, circuit types, `computeCircuitCapacity` from `terminalCapacities`; the Circuits mode.
- Missing: an automation that groups placed luminaires and sockets into circuits (by room, by a limit of count or power, by the nearest panel).
- Open questions: the limit for each circuit type; which panel serves which rooms (the same question as R2).
- Research: NEN 1010 / IEC 60364 limits for sockets and luminaires on one circuit.

**R8 — The adoption trap.**
- Exists: each path adopts a network type on its own (`scene.ts:1377`, `:2246`, `:2263`, `:4731`).
- Missing: one shared function. Part 1 adds `adoptNetworkTypes` (§4.4) and uses it in each path, so this prerequisite is done with part 1.

## 9. Phases of part 1

Each phase ends with the core tests, a rebuild of `@mepapp/ui`, and a browser check through real DOM inputs. Mark each phase done here with its commit hash.

- **P0 — The word "demand type" (§11, decision 6).** On a branch from `origin/worktree-room-type-calculations`, pushed to that branch, then merged here. The UI text of `RoomTypeLibrary.tsx`, `PlacementRuleGuide.tsx`, `AutoPlaceDialog.tsx`, `AutoPlaceInputCards.tsx`, `placementRuleDraft.ts`, `roomDemandText.ts` and the messages of the core say "demand type" in place of "need". The code names (`RoomNeed`, `needId`) and the storage keys stay, so no migration is necessary. Tests: the UI and core tests with the new text. Browser: the Room types table and step 1 of the guide show "demand type". **Done 2026-10-15:** 9d234b4 on `worktree-room-type-calculations` (pushed), merged here in 76fe4ae. The UI says "demand type" for the thing and "demand" for the amount of one room ("The room types give the demand of each room", the table columns "Demand"). Core 906 tests and UI 118 tests pass; `pnpm build` passes. Browser (`p0-check.mjs`, real typing, selects and clicks): 26 of 26 checks pass, among them the new texts of the table, the own demand type form (add, name clash, rename, delete), the room type details, steps 1, 3 and 6 of the guide, no "need" as a noun in the dialog, and no page errors.
- **P1 — The core model.** `PlacedStamp.routingTargets`, `routingTargetOf`, `remapRoutingTargets`; the rule fields, `NEED_ROUTING_TARGET_DEFAULTS`, `ruleRoutingTargets`; the parse and validation of the rule; the examples; schema 18 and the clean-up at load. Tests: the parse keeps the fields and drops bad values; the helpers with `__center__`, with 2 ports, with a remap; an old file loads as schema 18. Browser: open a drawing, save, open it again, no errors. **Done 2026-10-15 (3bda7fd):** also `withRoutingTarget`, `parseRoutingTargets` and `routingTargetDefaultOf`; the guide draft (`draftOf`, `ruleOf`) keeps the three rule fields, so an edit in the guide does not lose them before P3. Core 918 tests and UI 119 tests pass; `pnpm build` passes. Browser (`p1-check.mjs`): 10 of 10 checks pass. The user chooses a stamp for the example supply air rule through the real picker, and the stored rule keeps `routingTarget: 'supply-air'`. Auto-place places the stamps. A routing target written into the state of one stamp (no UI sets it before P2) survives Save, a page reload and Open; the file is schema 18; the other stamps have none; no page errors.
- **P2 — Properties and the scene.** `adoptNetworkTypes` (and the existing paths use it), `setRoutingTarget`, `StampInfo.routingTargets` and `portSegmentTypes`, the "Routing" section in Properties for one stamp and for a multi-selection of one definition. Browser: choose a routing target for a port in Properties, undo, redo, save and open again; connect a segment and see the network type of the segment in place of the select. **Done 2026-10-15 (1c77d6e):** `adoptNetworkTypes` replaces the 4 adoption paths (cascade, `setActiveNetworkType`, `updateNetworkType`, paste); `setRoutingTarget`; `StampInfo.autoPlaced`, `routingTargets`, `portSegmentTypes`; `RoutingSection.tsx` in Properties (one row "Routing target" for a stamp with one port, else one row per port name; None, the network types, "Mixed"; a line sample; a connected port shows "<type> (segment)" and no select; a note for an unmoved auto-placed stamp). Core 918 and UI 119 tests pass; `pnpm build` passes. Browser (`p2-check.mjs`, real clicks on the canvas, Shift+click, the selects, the rail Undo, Redo, Segment and Select buttons, the zoom button, the menu): 28 of 28 checks pass, among them: Supply Air writes the target and marks the stamp moved; Undo and Redo; Exhaust Air is adopted by the drawing; two stamps show "Mixed" and one choice sets both in one undo step; a drawn segment on the port shows "Supply Air (segment)" while the target stays stored; Undo of the segment shows the target again; Save, reload and Open keep the targets and the adopted type; no page errors. The rows of a stamp with 2 or more ports are checked in P4 (Replace stamp with a 2-port stamp).
- **P3 — The rule and Auto-place.** The Routing section in step 1 "Stamp" of the guide (layout A), the draft fields, `needPatch` and the default, "Use …", the copies of drawing-only types; `groupsOf` and `autoPlaceStamps` write the map and adopt the types; the Check step note for moved stamps with another routing target. Browser: make a rule with the guide, place, check the routing targets in Properties; a re-run with another routing target. **Done 2026-10-15 (cc6031c):** `RuleRoutingSection.tsx` in step 1; `blankRule` gets the default; `needPatch` and `countByPatch(countBy, draft)` move the default only when the old value was the old default; `networkTypeCopiesOf`; `groupsOf` writes `routingTargets` per planned stamp and `networkTypeCopies` per group; `autoPlaceStamps` adopts the types and leaves out a target whose type is not found; `keptWithOtherTarget` and the note "(M with another routing target)" in step 6 and in the Auto-place dialog; step 1 status "Routing target not found". The "not found" case shows as a callout in step 1, not in the Check step. Core 918 and UI 125 tests pass (new `autoPlacePlan.test.ts`); `pnpm build` passes. Browser (`p3-check.mjs`, real selects, check box, picker typing and clicks, canvas clicks, Place): 31 of 31 checks pass, among them: the default follows the demand type (Return air → Return Air, Light → None) and a choice of the user stays; "Use Supply Air"; a duplicated drawing type is offered and the stored rule keeps its copy; Auto-place writes the targets; the fan coil unit (3 ports) gets one row per port, null for a port without a target, Heating Water adopted at Auto-place; Properties shows the 3 rows (Center, Port 2, Port 3); a change there marks the stamp moved and step 6 says "1 moved stamp kept (1 with another routing target)"; after a reload, a new drawing gets the copied type from the rule; no page errors.
- **P4 — Keep the value through edits.** `applyDefinitionToPlacedStamps`, Replace stamp (`remaps`), copy and paste (also the network types that the stamps name). Browser: replace a 2-port stamp, edit a definition, paste into another drawing. **Done 2026-10-15 (37f5e29):** `withPortsRoutingTargets` in the scene (core `remapRoutingTargets`); copy takes the types of the routing targets; paste copies the map and adopts the types. Core 918 and UI 125 tests pass; `pnpm build` passes. Browser (`p4-check.mjs`, Properties selects, Replace stamp… with the real picker and its confirmation, the rail Undo, canvas clicks, Ctrl+C and Ctrl+V, Open of a second PDF): 19 of 19 checks pass: Replace with 1 port keeps the target; with the radiator (2 ports) the target of the same id stays and Properties shows the rows Center and Port 2; Replace with a stamp without Port 2 drops its target, Undo gives it back; Replace with the urinal (2 ports at other places, other ids) moves each target to the nearest port; a pasted stamp keeps the targets and loses `autoPlaced`; a paste into a second drawing keeps them and that drawing adopts Exhaust Air and Heating Water; no page errors. The edit of a definition is checked through `applyDefinitionToPlacedStamps` (the method that the Element Editor Save calls), not through the Element Editor itself: the target of the removed port goes, the other stays, Undo gives it back.
- **P5 — The open ports in the drawing.** The dots, the status bar check box and the count. Browser: the dots go when a segment connects, and come back on undo. **Done 2026-10-15 (e7dff7d):** the overlay draws a dot (4.5 screen px, the color of the routing target, a white ring) on each open port; `DrawingSummary.openPorts`; `setOpenPortsVisible` and the event `openPortsVisibleChanged`; the status bar chip "Open ports N" with the 3 largest types (a color dot and a count; the full list in the tooltip). `setRoutingTarget` now also syncs the drawing layer, and a project load redraws the overlay (the dots were missing after Open before this fix). Core 918 and UI 125 tests pass; `pnpm build` passes. Browser (`p5-check.mjs`, the dots checked by the pixels of real screenshots): 13 of 13 checks pass: 0 open ports before Auto-place, 28 after it with the Supply Air count; the check box hides and shows the dots and keeps the count; None in Properties removes a dot and lowers the count, Undo gives it back; a segment on a port takes it out of the count, Undo gives it back; Save, reload and Open show the count and the dots again; no page errors.
- **P6 — Segments.** The segment tool takes the routing target of the start port. Browser: draw from an open port of a grille, check the network type of the segment and the active network type. **Done 2026-10-15 (fb3cc44):** `ToolContext.activateRoutingTargetOf`, called at the first click and by "Draw from"; the scene method `activateRoutingTargetOf` (only an open port with a routing target), public `getActiveNetworkTypeId`, the event `activeNetworkTypeChanged`, and App sets the active tile from it. Core 918 and UI 125 tests pass; `pnpm build` passes. Browser (`p6-check.mjs`, real tile clicks, the rail Segment, Select and Undo buttons, canvas clicks, a right click and the "Draw from" menu): 14 of 14 checks pass: with Supply Air picked, a start at the open port of a stamp with the target Return Air makes Return Air active and the tile follows; the segment is Return Air and the port is no longer open; the next segment keeps Return Air; a segment that ends at a stamp with the target Supply Air stays Return Air and that target stays; a start at a port with a segment keeps the picked Supply Air; Undo opens the ports again; "Draw from" an open port makes its target active; no page errors.
- **P7 — The default of the definition.** Dropped by the user (§11, decision 4).

## 10. Not changed by this plan

The items of `room-type-calculations-small-fixes.md` (the user wants them later). The flow solve. The network tree panel. The code names that contain "need".

## 11. Decisions of the user

On 2026-10-15 the user accepted the recommendations:

1. The owner: the rule.
2. The model of §4: accepted (a map on the stamp, the rule fields, schema 18, no silent default for old rules).
3. The layout: A (the section in step 1 "Stamp").
4. P7 (the default of the definition): dropped. The user: "a stamp's port should not be part of any network type by default. They are assigned to a network type only when connected to a segment. The segment defines the network type for the port."

Then, on the questions that decision 4 opened:

5. **The value on the port: A, a routing target, with routing targets set by hand.** The value that Auto-place writes is only the network type that routing must connect to the port. The network type of a port always comes from its segment, as MepApp does today (`computeNetworks`). When a segment connects, MepApp ignores the routing target of that port; the routing target stays stored and shows again when the user deletes the segment. Properties lets the user set the routing target of a port without a segment, also on a stamp placed by hand (an explicit choice, never a default). The rejected option B: no value on the stamp; routing reads the rule through `autoPlaced.ruleId`.
6. **"Demand type" in place of "need", now (P0).** A need is not a network type: a need has an amount and a unit (Light in lm, Heating in W, Sockets as a count), Light and Sockets have no network type, and the relation is many to many (Return air goes to Return Air or Exhaust Air; Cooling goes to Chilled Water, or to Supply Air in an all-air system). So the user's first proposal "demand network type" was not used. Only the UI text changes; the code names and the storage keys stay.
