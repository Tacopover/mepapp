# Routing to the placed stamps — part 1: network types on stamps

Status: **assessment, comparison, model, answers, mockup and road map done (2026-10-14). On 2026-10-15 the user accepted the recommendations (§11): the rule is the owner, the model of §4, layout A, P7 later. No product code is changed yet. Next: P1.** Branch `worktree-auto-routing`, made from `origin/worktree-room-type-calculations` (a3f3ee9), because `origin/master` (4c31201) does not contain 3f66722. Master had no newer commits, so no merge was necessary. Prompt: `auto-routing-prompt.md`.

Mockup: artifact https://claude.ai/artifact/Ugzv9CJtBdJ5rKuPSAmg7e, copy in `.claude/plans/auto-routing-mockup/mockup.html`. Checked in Chromium (Playwright 1.63): 38 checks pass (19 at 400 px in the dark theme, 19 at 1280 px in the light theme). The checks type into the rule name and the capacity box, use the selects, the check boxes and the buttons, click and key-select stamps in the drawing, find no horizontal page scroll and no page errors.

Terms in this file:
- **Port**: a connection point of a placed stamp. A stamp without ports of its own has one synthetic port at its center (`__center__`, `stamp.ts:44`).
- **Port network type**: the network type that a port must join. It is a wish for routing. It is not the network type of a segment.
- **Open port**: a port with a port network type and no segment yet.
- **Owner**: the place where the user chooses the port network type before Auto-place writes it on the stamps (the rule, the demand of a room type, or both).
- **System**: a later term (§8, R2) for one network of one type, for example "Supply Air 1" of one air handling unit.
- **Need**: one thing that a room requires, as one total in one unit (`RoomNeed`, `core/rooms/room-need.ts:11`, from `room-type-calculations.md`). MepApp has 6 built-in needs: Light (lm), Supply air (dm³/s), Return air (dm³/s), Heating (W), Cooling (W) and Sockets (a count). The user adds own needs with "+ New need…" in the Room types table. A need is not a network type. The need Supply air is the amount of air that a room requires. The network type Supply Air is the kind of duct that carries the air.
- **Demand**: the calculation of one need for one room type, for example "Office: Supply air 6.5 dm³/s per person" (`RoomDemand`, `room-type.ts:21`). One demand is one cell of the Room types table.
- **Rule**: a placement rule (`PlacementRule`, `placement-rule.ts`). A rule with `countBy: 'need'` serves one need (`needId`). Auto-place divides the total of the need in a room by the capacity of one stamp, and rounds up. A rule can also count without a need: "The same number in each room" or "by coverage".

## 1. The goal of part 1

Auto-place writes a network type onto each port of each stamp that it places. Routing (a later part) reads these port network types to find the ports that it must connect, and the network type of the segments that it must draw. The network type is optional: a luminaire or a socket joins no drawn network.

Part 1 also lets the user see and change the port network type of any stamp (Properties), shows the open ports in the drawing, and keeps the value correct when MepApp copies, replaces or changes a stamp.

## 2. Assessment: each place that reads or copies the fields

Columns: **Must** = what part 1 must do there. "Keep" = the port network type must survive. "Read" = the place uses it. "Show" = the UI shows it.

| Place | File:line | What it does today | Must |
|---|---|---|---|
| `PlacedStamp.ports` | `core/stamp.ts:15` | A copy of the ports of the definition | No change. The port network type goes into a separate map (§4.1). |
| `PortSpec` | `core/geometry.ts:256` | `{id, name, fractionX, fractionY}` | No change (§4.1 says why). |
| `getStampPorts`, `__center__` | `core/stamp.ts:44`, `:64` | The ports, or the synthetic center port | Read: the UI rows and the helpers use it, so a stamp without ports gets one row "Center". |
| Stamp tool | `render/tools/placeStampTool.ts:56` | `[...definition.ports]`: the PortSpec objects are shared with the definition | Keep: no port network type in part 1 (P7 adds the default of the definition). |
| Auto-place | `render/scene.ts:2613` `autoPlaceStamps`; `ui/components/autoPlacePlan.ts:47` `groupsOf` | Writes ports, `autoPlaced`, capacity | Read and keep: `groupsOf` gets the map for each planned stamp from the rule, `autoPlaceStamps` writes it and adopts the network types. |
| Edit of a definition | `scene.ts:2389` `applyDefinitionToPlacedStamps` | New copy of the ports; ends on lost ports go to a new fitting | Keep: remove the keys of the lost ports, keep the others (match by id, as today). |
| Replace stamp | `scene.ts:2485` `replaceSelectedStamps`, `:2419` `planPortReplacement` | Maps the ports by place (`matchPortsByLocation`), else by id | Keep: move each key with the same `remaps`, remove the keys of the lost ports. Replace already calls `markAutoPlacedMoved`. |
| Copy and paste | `scene.ts:4663` `copySelection`, `:4695` `pasteClipboard` | Spread copy of the stamp without `autoPlaced`; adopts the network types of the copied segments | Keep: the spread keeps the map. Copy must also take the network types that the copied stamps name, so paste into another drawing adopts them. |
| Undo | `core/commands.ts:192` `Transaction` | Whole-state snapshots | Nothing: a field of `PlacedStamp` is in the state. `doc.networkTypes` is not in undo; an adopted type stays after an undo, as for segments today. |
| Save and load | `scene.ts:3591` `serializeDocument`, `core/project.ts:378` `loadProject` | Stamps are written and read as they are | Keep: schema 18 (§4.5), and the load drops entries that are not strings. |
| PDF export and import | `scene.ts:3842` embedded `mepapp-project.json`; annotations at `:3987` | The stamp data travels only in the embedded JSON | Nothing: the map travels in the JSON. The dots of open ports are not exported. |
| Read model of a stamp | `scene.ts:1151` `toStampInfo` | `ports`, `linkedPortIds`, `capacity` | Read: add `portNetworkTypeIds`. |
| Properties panel | `ui/components/PropertiesPanel.tsx:554`–`:711` | Position, rotation, color, scale, capacity, circuit, custom, "Linked ports" | Show: a "Networks" section (§6). |
| Port-group picker | `PropertiesPanel.tsx:684` "Linked ports" | Groups ports of an equipment stamp | Nothing. A group does not force one network type (§5 question 3). |
| Segment tool | `render/tools/drawSegmentTool.ts:123` | A new segment gets the active network type | Read (P6): a segment that starts at a port with a port network type takes that type. |
| Network type cascade | `scene.ts:1369` `setNetworkTypeForSegmentsNetworks` | Retags the whole connected run | Keep (P6): the ports on the run with the old type get the new type in the same undo step. |
| Network types of the drawing | `scene.ts:2245` `setActiveNetworkType`, `:2262` `updateNetworkType`, `:2277` `duplicateNetworkType`, `:1377` adoption in the cascade | Each path adopts a type on its own | Read: one shared `adoptNetworkTypes` for every path, also auto-place, paste and Properties (prerequisite 8). |
| Flow solve | `core/flow.ts:55` `solveFlow` | Uses `portGroups`, `terminalCapacities`, `elementCategories` | Nothing in part 1. |
| Network tree panel | `ui/components/NetworkTreePanel.tsx`, `scene.ts:1435` `getNetworkSummaries` | Lists the computed networks and their elements | Nothing in part 1. A list of open ports goes to routing (§8, R6). |
| `computeNetworks` | `core/network.ts:147` | The network type of a run comes from its first segment | Nothing. |
| Placement rule | `core/rooms/placement-rule.ts:79`, `:590` `toPlacementRule`, `:387` `validatePlacementRule`, `:714` `PLACEMENT_RULE_EXAMPLES` | The parse builds a new rule field by field | Read and keep: the parse must read the new fields, else it drops them silently. The examples get values. |
| Rule draft and guide | `ui/components/placementRuleDraft.ts:46` `draftOf`, `:94` `needPatch`, `:118` `ruleOf`; `PlacementRuleGuide.tsx:601` step 1 | Text draft of the rule | Show: the Network section in step 1 (§6). |
| Rule storage | `ui/placementRuleStorage.ts:16` | Examples when nothing is stored | Nothing: an old stored rule has no network type (§4.5). |
| Auto-place worker | `core/rooms/placement-worker.ts:28` | postMessage of rules and stamps | Nothing: the new fields pass through. |

## 3. The owner of the network type

### 3.1 The cases

| Case | (a) The rule | (b) The demand of a room type | (c) Both |
|---|---|---|---|
| Fan coil unit with 2 ports: Chilled Water and Heating Water | Works. The rule knows the stamp, so it lists the 2 ports and gives each one a type. | Does not work. The demand "Cooling" knows no stamp and no port. It can give one type, and the second port stays wrong. | Works only through the rule part. |
| Toilet exhaust against office return air (both serve the need Return air) | Works with 2 rules. The examples already have 2 rules: "Return air valve toilet" (toilet, bathroom; center; max 1) and a grille rule for other rooms. The stamp, the count and the layout differ, so the rules differ anyway. | Works with 1 rule: the Toilet type says Exhaust Air. But a toilet valve and an office grille are different stamps, so 1 rule rarely serves both. | Works. The user must look in 2 places to know what a stamp gets. |
| Radiators for Heating | Works: one rule "Radiator" → Heating Water. | Works, but each of about 20 room types with Heating must get the same value. | Works. |
| Sockets, Light | Works: none (the default). | Works: none. | Works. |
| Smoke detector by coverage, thermostat "the same number in each room" | Works: the rule has the field for each way to count. | Does not work: these rules serve no need, so no demand exists. | Works only through the rule part. |
| One building, 2 air handling units | Not the job of a network type. The place of the room sets the system (§8, R2). | The same. | The same. |

### 3.2 Recommendation: (a) the rule

- The network type belongs to the stamp and its system, not to the room. A supply grille joins Supply Air in each room type.
- Only the rule knows the stamp, so only the rule can give a different type to each port.
- Only the rule exists for each way to count. The demand exists only for a rule that serves a need.
- The user chooses once per rule, not once per room type.
- One place to look: the rule says what its stamps get.

The argument for (b) is real but small: "the air of this room goes out of the building" is a property of the room. If a later case must have this, the demand can get an optional override (`RoomDemand.networkTypeId`) that wins over the rule. This addition does not change the model of part 1, so part 1 does not add it.

## 4. The data model

### 4.1 The stamp side (`core/stamp.ts`)

```ts
export interface PlacedStamp {
  // ... the fields of today
  /**
   * The network type that each port must join, by port id (auto-routing.md §4.1). A stamp without
   * ports of its own uses SYNTHETIC_CENTER_PORT_ID. A port without an entry joins no network.
   * Absent = no port has one. Routing reads it; the type of a connected segment can differ (a mismatch).
   */
  portNetworkTypeIds?: Record<string, string>;
}

/** The port network type of one port, or undefined. */
export function portNetworkTypeOf(stamp: Pick<PlacedStamp, 'portNetworkTypeIds'>, portId: string): string | undefined;

/** The map after a change of the ports: keys move by `remap` (old id -> new id), keys of ports not in `keep` go. Undefined when nothing stays. */
export function remapPortNetworkTypes(map: Record<string, string> | undefined, keep: ReadonlySet<string>, remap?: ReadonlyMap<string, string>): Record<string, string> | undefined;
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
  /** The network type of each port of the placed stamps (auto-routing.md §4.2). Absent = none. */
  networkTypeId?: string;
  /**
   * A stamp with 2 or more ports: the network type of each port id of the stamp, in place of
   * networkTypeId. Null = this port joins no network. A port without an entry gets networkTypeId.
   * An id that the stamp does not have (the user chose another stamp) changes nothing.
   */
  portNetworkTypeIds?: Record<string, string | null>;
  /**
   * A copy of each network type that the rule names and that NETWORK_TYPE_LIBRARY does not have
   * (a type that the user duplicated in a drawing). Auto-place adds the copy to a drawing that
   * does not have the type.
   */
  networkTypeCopies?: NetworkType[];
}

/** The default network type of a built-in need. Light, Sockets and own needs have none. */
export const NEED_NETWORK_TYPE_DEFAULTS: Readonly<Record<string, string>> = {
  supplyAir: 'supply-air',
  returnAir: 'return-air',
  heating: 'heating-water',
  cooling: 'chilled-water',
};

/** What a stamp placed by the rule gets: the port network type of each port of `ports` (getStampPorts semantics), or undefined. */
export function ruleStampNetworkTypes(rule: Pick<PlacementRule, 'networkTypeId' | 'portNetworkTypeIds'>, ports: readonly PortSpec[]): Record<string, string> | undefined;
```

The guide writes `networkTypeId` for a stamp with 0 or 1 port. For a stamp with 2 or more ports, the check box "Give each port of the stamp its own network type" writes an entry for each port; when the user clears the check box, the guide removes the map.

### 4.3 The stamp definition (optional, phase P7)

```ts
export interface StampDefinition {
  // ... the fields of today
  /** The port network type that a stamp of this definition gets when the user places it by hand, by port id (SYNTHETIC_CENTER_PORT_ID for a definition without ports). The rule of Auto-place wins. */
  portNetworkTypeIds?: Record<string, string>;
}
```

### 4.4 The scene and the UI

- `AutoPlaceGroup.stamps[i].portNetworkTypeIds?: Record<string, string>` (each planned stamp, like `capacity`), and `AutoPlaceGroup.networkTypeCopies?: NetworkType[]`.
- `StampInfo.portNetworkTypeIds?: Record<string, string>`.
- `SketchScene.setPortNetworkType(stampIds: string[], portId: string, networkTypeId: string | null)`: one undo step, adopts the type, calls `markAutoPlacedMoved`.
- `SketchScene.adoptNetworkTypes(ids: Iterable<string>, copies?: readonly NetworkType[])`: the drawing keeps its own copy when it has the id, else it adopts the library type, else the copy. It emits `networkTypesChanged` once. The cascade, `setActiveNetworkType`, `updateNetworkType`, auto-place, paste and `setPortNetworkType` all use it.

### 4.5 Migration

- **Drawing**: schema 18, a step that changes only the version, the same as v5 → v6 (`PlacedStamp.color`). The reason: an older MepApp refuses a newer file (`schema.ts:68`), so it cannot open the file and then drop the field when it saves. The load removes entries of `portNetworkTypeIds` that are not strings, and an empty map.
- **Rules in the user library** (`mepapp.placementRules.v1`): no migration. An old rule has no network type, and Auto-place writes none for it. Step 1 of the guide shows "The need Supply air usually goes to Supply Air. Use Supply Air". MepApp does not fill a default silently: a stored rule then does what it did before.
- **`parsePlacementRules`**: reads `networkTypeId` (a non-empty string), `portNetworkTypeIds` (string or null values; other values go), `networkTypeCopies` (a parse of each `NetworkType`; bad entries go). `validatePlacementRule` refuses an empty id.
- **`PLACEMENT_RULE_EXAMPLES`**: `example-supply-air` → `supply-air`; `example-toilet-exhaust` → `exhaust-air`; `example-air-changes` (technical room) → `return-air`; `example-lighting` and `example-smoke-detector` → none.
- **Room types**: no field in part 1.

## 5. Answers to the open questions

1. **The owner.** The rule (§3). No override in the room type in part 1. If a later case must have it, the demand gets an override that wins over the rule.
2. **Defaults.** Yes, for the built-in needs: Supply air → Supply Air, Return air → Return Air, Heating → Heating Water, Cooling → Chilled Water. Light, Sockets and own needs → none. The guide fills the default when the user makes a rule or changes the need, but only when the old value was the default of the old need, so a choice of the user stays. An own need gets no default in part 1: the choice in the rule is enough, and a field on the own need adds a control to the Room types card for a small gain.
3. **More ports.** The check box "Give each port of the stamp its own network type" shows one row for each port (name, place, select). A port group does not force one type. A group joins ports into one node for the flow (an air handling unit passes air from the return side to the supply side), but routing must draw a Return Air duct to the return port and a Supply Air duct to the supply port. So each port keeps its own type. (§7 lists a problem of `computeNetworks` with groups.)
4. **The stamp definition.** Yes, but as the optional phase P7, not in the main path. The Element Editor sets a default for each port of a custom stamp; the stamp tool writes it on a stamp placed by hand; the guide fills the rows from it; the rule wins at Auto-place. The library stamps get no defaults in part 1: their data is not reliable for this (the supply grille `ventilation-grille-rh-supply` has the discipline `heatingAndCooling`), and a check of the data of the 167 stamps is a separate task.
5. **Stamps placed by hand.** Yes: Properties shows a select for each port, for each stamp (§6). A change calls `markAutoPlacedMoved`, the same as a change of a custom property (`scene.ts:2736`). Else a new run of Auto-place replaces the stamp and loses the change. A multi-selection of stamps of one definition shows the same rows, with "Mixed" when the values differ.
6. **Segments.** The port network type is the wish, the segment type is the fact. MepApp does not change one to match the other on its own:
   - A segment of type A on a port of type B: a mark at the port in the drawing (§6) and a line in Properties with the button "Use A for the port". No automatic retag, because a retag of a run changes the whole run (the cascade invariant), and a connect must not do that silently.
   - The segment tool: a segment that starts at a port with a port network type takes that type, and the active network type changes to it, so the next segments of the chain have the same type. A segment that ends at a port does not change its type (a mismatch shows).
   - The cascade: a change of the network type of a run also changes the port network type of each port on the run that had the old type, in the same undo step. Ports without a type stay without. So the run and its ports keep one type, as the invariant asks.
7. **Drawings and libraries.** At placement, `adoptNetworkTypes`: the drawing keeps its own version of a type when it has the id (a changed color stays), else it adopts the library type, else the copy in the rule (`networkTypeCopies`). The guide lists the library types and the types of the open drawing; a type of the drawing that the library does not have ("Supply Air 2" from `duplicateNetworkType`) is stored as a copy in the rule. If no copy exists (an old rule, a deleted drawing), the Check step shows "the network type of the rule is not found", and the stamps get no type for that port.
8. **A second run of Auto-place.** Unmoved stamps: the re-run replaces them, so they get the new type. Moved stamps: they keep their type, because "moved" means "the user owns this stamp". The Check step adds to the existing note "2 moved stamps kept" the text "with another network type" when their types differ from the rule. The user can change them in Properties with a multi-selection.
9. **Display.** Yes. An open port shows a dot in the color of its network type. A port whose segment has another type shows a ring and "!". A connected port with the same type, and a port without a type, show nothing. The status bar gets a check box "Open ports" (on by default) and a count by type. The dots and rings are in the overlay of MepApp only, not in the PDF export. The network tree panel does not list open ports in part 1: that list belongs to routing (R6) and to the Networks panel spec.
10. **Electrical.** Light and Sockets get none by default. MepApp groups luminaires and sockets into circuits (`Circuit.terminalIds`), not into drawn segments, so a port network type such as Branch Circuit would tell routing to draw wires that MepApp does not use. The later circuit automation (R7) reads the need of the rule (Light, Sockets) and the circuit types, not the port network type. A user who draws conduit or cable tray to a stamp can still choose Conduit or Cable Tray in the rule.
11. **Which network.** The next part (R2), not part 1. Part 1 stores only the type. A system ("Supply Air 1") with a start point and its rooms comes later. The model of part 1 does not block it: a system can later refine a port network type, for example with `portSystemIds` on the stamp or a map from rooms to systems.

## 6. The mockup

Artifact https://claude.ai/artifact/Ugzv9CJtBdJ5rKuPSAmg7e. It shows:
- **Layout A (recommended)**: the Network section in step 1 "Stamp", below "What does the stamp serve?". Step 1 has the stamp, its ports and the need, and the need gives the default. The section is the same for each way to count.
- **Layout B**: the same section in step 3, below "Write the amount per stamp to each stamp as its capacity". Both write a value to each stamp. But step 3 has a different form for each way to count, so the section must go into 3 forms, and the need is 2 steps away.
- The section: "Network type" with a line sample of the type, the default tag, "Use Supply Air" when the value is not the default, the note for a type that is only in the drawing, the check box for each port, a row for each port, and "Each placed stamp gets".
- Three example stamps: a supply grille (no ports of its own: the center), a fan coil unit with 2 ports (Chilled Water, Heating Water), a luminaire (none).
- **Properties**: a "Networks" section with a row for each port (or "Center"), the status of each port (no segment yet / connected / another type with "Use … for the port"), and the auto-placed note.
- **The drawing**: dots on open ports, a ring and "!" on a mismatch, no mark on a connected or untyped port, and the "Open ports" check box with the count by type in the status bar.

## 7. Other findings (not in scope)

- `computeNetworks` (`network.ts:147`) joins grouped ports into one node, so the supply and return ducts of an air handling unit with a port group become one network with the type of its first segment. The cascade (`scene.ts:1369`) then retags the return run with the supply run. Routing must handle this (R3, R6).
- Paste (`scene.ts:4695`) does not copy the port groups and the capacities (`terminalCapacities`) of the pasted stamps.
- The segment tool draws a segment with the active type also when it connects to a run of another type, so a run can have mixed types (`computeNetworks` takes the first).
- `placeStampTool.ts:56` shares the `PortSpec` objects of the definition with the placed stamp. No code writes into them today.

## 8. Road map: the later parts (draft)

Each part gets its own plan. No detailed design here.

**R2 — Which network (systems).**
- Exists: network types per drawing; networks that MepApp calculates from the segments (`computeNetworks`), never stored; `.claude/plans/networks-panel-spec.md`.
- Missing: a stored system (name, network type, start point, the rooms or zone that it serves); a way to give a system to a port (by the room of the stamp).
- Open questions: does the user draw zones, or pick rooms? Is a floor (a page) a zone? Can a system serve more than one page (a riser)? Is a system a copy of a network type ("Supply Air 2", as `duplicateNetworkType` does today) or a new entity with a type?
- Research: how Revit (systems), MagiCAD and the old MEPSketcher assign terminals to systems; the Networks panel spec.

**R3 — A start point for each network.**
- Exists: the category `equipment`; the flow solve takes `rootElementId` or an equipment stamp (`flow.ts`); the segment chain continues through equipment ports.
- Missing: a start point that is not a stamp (the place where the main duct or pipe comes onto the floor: a shaft, a riser); a link from a system to its start point.
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
- Missing: the algorithm (a main along the corridor, a branch to each room, a sub-branch to each open port), fittings at the joints, a list of open ports by type and system (the network tree panel).
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

- **P1 — The core model.** `PlacedStamp.portNetworkTypeIds`, `portNetworkTypeOf`, `remapPortNetworkTypes`; the rule fields, `NEED_NETWORK_TYPE_DEFAULTS`, `ruleStampNetworkTypes`; the parse and validation of the rule; the examples; schema 18 and the clean-up at load. Tests: the parse keeps the fields and drops bad values; the helpers with `__center__`, with 2 ports, with a remap; an old file loads as schema 18. Browser: open a drawing, save, open it again, no errors.
- **P2 — Properties and the scene.** `adoptNetworkTypes` (and the existing paths use it), `setPortNetworkType`, `StampInfo.portNetworkTypeIds`, the "Networks" section in Properties for one stamp and for a multi-selection of one definition. Browser: choose a type for a port in Properties, undo, redo, save and open again.
- **P3 — The rule and Auto-place.** The Network section in step 1 "Stamp" of the guide (layout A), the draft fields, `needPatch` and the default, "Use …", the copies of drawing-only types; `groupsOf` and `autoPlaceStamps` write the map and adopt the types; the Check step note for moved stamps with another type. Browser: make a rule with the guide, place, check the types in Properties; a re-run with another type.
- **P4 — Keep the value through edits.** `applyDefinitionToPlacedStamps`, Replace stamp (`remaps`), copy and paste (also the network types that the stamps name). Browser: replace a 2-port stamp, edit a definition, paste into another drawing.
- **P5 — The open ports in the drawing.** The dots, the ring and "!", the status bar check box and the count. Browser: the dots go when a segment connects, and come back on undo.
- **P6 — Segments.** The segment tool takes the type of the start port; the cascade changes the ports on the run; the mismatch line and button in Properties. Browser: draw from a grille, retag the run, check the ports.
- **P7 — The default of the definition (optional).** `StampDefinition.portNetworkTypeIds`, the Element Editor rows, the stamp tool, the guide rows. Later, not in part 1 (§11, decision 4).

## 10. Not changed by this plan

The items of `room-type-calculations-small-fixes.md` (the user wants them later). The flow solve. The network tree panel.

## 11. Decisions of the user

On 2026-10-15 the user accepted the recommendations:

1. The owner: the rule.
2. The model of §4: accepted (a map on the stamp, the rule fields, schema 18, no silent default for old rules).
3. The layout: A (the Network section in step 1 "Stamp").
4. P7 (the default of the definition): later, not in part 1. P7 is the last phase, so the user can still move it into part 1.
