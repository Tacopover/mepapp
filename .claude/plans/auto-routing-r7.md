# R7 plan: electrical circuits (the "Make circuits" command)

Status: PLANNED 2026-10-19 by the road map planner. No task is started. Nine questions wait for the user (section 0). The table in section 6 shows which task waits for which question. R6 is done (last plan commit `874e60d`). The schema is at step 21 (`packages/core/src/project.ts:22`). R7 makes step 22.

Origin: `roadmap-overview.md` (R7 text in section 1, case (e), gap G9, D-R7-01, the defaults about R7 in section 5), `auto-routing.md` (§5 item 10, §8 R7), `electrical-circuits-model.md` (the circuit model), `.claude/roadmap/rules.md`, `.claude/roadmap/protocol.md`, `.claude/roadmap/director-prompt.md`, and the finished plan `auto-routing-r6.md` (format). The brief said "the planner role file". The file is `.claude/agents/roadmap-planner.md` (Job B). The domain rules are in `.claude/roadmap/rules.md` section 3.

**Answers that bind this plan (final):**
- **D-R7-01 A (user, 2026-10-16).** Reuse `CircuitType.defaultCapacity` (`packages/core/src/circuit.ts:99`) as the load limit in `units`, plus optional limits (`maxTerminals`, `diversity`) on `CircuitType`. The limits are user-editable defaults with the source "design practice". NEN 1010:2020 and IEC 60364 set no count of sockets or luminaires per circuit. The real protection is the breaker rating and the cable section. `device.ratingA` is set only from a value that the user typed.
- **D-R2-02 A and D-R2-03 A.** Single PDF files. One PDF file is one floor. A multi-page PDF is refused.
- **User note 2026-10-17.** New UI text is English only. No new Dutch.
- **Dashboard screenshots** for every new or changed dialog state. Each UI task names its screenshots.
- **Rule 1 to 6 of `rules.md` section 3.** Section 5 says how R7 keeps each rule.

Code claims carry `path:line`. Paths start at the repository root. Line numbers are from commit `874e60d` and can move. Read `.claude/roadmap/rules.md` first.

Terms (the terms of the overview apply). New terms:
- **Terminal**: a placed stamp with `category: 'terminal'` (`packages/core/src/stamp.ts:11`). Only a terminal can be a member of a circuit today (`packages/render/src/scene.ts:1987`).
- **Candidate**: an unassigned terminal that the command may put on a circuit. "Unassigned" means that `findCircuitForTerminal` (`packages/core/src/circuit.ts:202`) finds no circuit for it.
- **Group**: the planned content of one new circuit. It has a circuit type, a list of candidates and a list of rooms.
- **Plan**: the pure result of the planner. It is not stored. It holds the groups, the candidates that stay without a circuit, the warnings and the numbers.
- **Wet room**: a room whose room type is in a list of the user. The default list is Toilet and Bathroom (`packages/core/src/rooms/room-type.ts:168`-`:169`).
- **Limit**: a number that a circuit must not pass. R7 has two limits: the count of terminals and the load.
- **Load**: the sum of `terminalCapacities` of the terminals of a circuit (`computeCircuitCapacity`, `circuit.ts:337`), in the unit of the circuit type.

## 0. Questions for the user (all open) and provisional choices

Rule of the brief: a stored field, a changed meaning of a stored value, or a choice that the roadmap does not cover is a question. The planner does not decide it. Each question has options, a recommendation and, only when the choice is easy to reverse, a provisional default that the director may take without a stop.

Five choices change stored data ([data model]: Q-R7-01 every option, Q-R7-02 B, Q-R7-03 C, Q-R7-07 B, Q-R7-08 B). All of them join the single schema step 22, so the step is written once. Only Q-R7-01 blocks T01: the provisional defaults Q-R7-02 A, Q-R7-03 A, Q-R7-07 A and Q-R7-08 A store nothing. If the user picks one of the other four options, that answer also blocks T01 and its field joins step 22. Q-R7-04 blocks T02. The tasks T03, T05, T06, T07, T09, T14 and T15 can start before any answer.

### Q-R7-01 [data model]. What are the new fields on `CircuitType` and what do they mean?

D-R7-01 A names "`maxTerminals`, `diversity`". It does not say the exact names, the types, or what `diversity` does. `Circuit` already has `diversityPercent` (`circuit.ts:44`), which is a per-circuit value that inherits from the panel.

- **A.** Two optional fields on `CircuitType`: `maxTerminals?: number` (a whole number of 1 or more) and `diversityPercent?: number` (above 0, at most 100). `defaultCapacity` is the load limit in `units`. R7 does not write the `diversityPercent` of the type into the new circuits; a new circuit inherits from its panel. The type value is a planning factor: the limit check uses the load times `diversityPercent` ÷ 100. Schema step 22.
- **B.** Only `maxTerminals?`. `defaultCapacity` stays the load limit. No diversity on the type. Schema step 22.
- **C.** A new object `limits?: { maxTerminals?: number; maxLoad?: number; diversityPercent?: number }` on `CircuitType`, and `defaultCapacity` is not used as a limit. This departs from D-R7-01 A.

**Recommendation: A.** It follows D-R7-01 A and uses the name that `Circuit` already has. A clean-up on load removes values that are not finite numbers in range. Provisional default: none (it changes the file format; T01 waits).

### Q-R7-02 [data model]. How does R7 know that a terminal is a luminaire or a socket?

A terminal has no field for this. A stamp definition has `discipline` and `category` only (`packages/core/src/stamp-library.ts:16`-`:35`). A search of `packages/core/src/stamp-library.generated.ts` shows 102 electrical stamps whose labels name the kind ("D5 Luminaire Rectangular", "D5 Wall Socket Double"). An auto-placed stamp has `autoPlaced.ruleId` (`stamp.ts:27`), and the rule has `needId` `light` or `sockets` (`packages/core/src/rooms/placement-rule.ts:92`). The rules live in the browser (`mepapp.placementRules.v1`), not in the file.

- **A.** No stored data. For an auto-placed stamp, the dialog reads the rule through `autoPlaced.ruleId` (the UI passes the rules to the planner as input). For every other terminal the dialog lists each stamp definition once ("D5 Wall Socket Double: 6 terminals") with a select for the circuit type. The choice lives in the dialog only. A stamp with no choice stays out of the plan and is listed.
- **B.** [data model] A new optional field `circuitTypeId` on `StampDefinition`. A custom definition can hold it. The generated library cannot hold it (generated file), so R7 needs a table in code for the 102 library stamps, or an override by a custom definition (`getStampDefinition`, `stamp-library.ts:45`). Schema step 22 (with Q-R7-01).
- **C.** A match on the label ("Luminaire", "Socket", "Wall Socket"). No stored data. The match fails for a custom stamp with a name in another language.

**Recommendation: A.** It stores nothing, it uses data that exists, and the user sees and corrects every choice before the run. The cost: a drawing with hand-placed terminals needs one choice per stamp definition at each run (the dialog keeps the choice in memory for the session). B is the better long-term model but needs a table for the library. **Provisional default: A** (reversible: the planner takes a `classify` map as input in all three options).

### Q-R7-03. What does the load limit compare against when terminals have no power?

Auto-place writes a capacity only for flow, power and amount needs (`placement-rule.ts:529`, `writesCapacity`). Light and Sockets (kind `light` and `count`) get no capacity. So an auto-placed luminaire or socket has no entry in `terminalCapacities` (gap G9). The library values of `defaultCapacity` are in W (`circuit-type-library.ts:12`-`:19`).

- **A.** R7 v1 limits by count (`maxTerminals`). It limits by load only with the terminals that have a capacity that the user typed (`setTerminalCapacity`). A terminal without a capacity adds 0 to the load, and the plan shows the Note "N terminals have no power. The load limit counts only terminals with a power."
- **B.** R7 refuses a terminal without a capacity. The dialog asks the user to enter a power first.
- **C.** [data model] A default power for each stamp definition (a new field, in schema step 22). Not recommended in R7.

**Recommendation: A.** It works on a real drawing today and does not claim a load that nobody entered. **Provisional default: A.**

### Q-R7-04. What are the default values of the limits?

The library values of `defaultCapacity` are not circuit loads: "Lighting 200 W" and "Fire Alarm 100 W" are the load of one terminal or one small device (`circuit-type-library.ts:12`, `:18`). If R7 used them as a load limit, a lighting circuit would hold 200 W, which is 3 or 4 luminaires of 50 W. The roadmap says "Not verified: the default values."

- **A.** No built-in limit. A type with no `maxTerminals` and a `defaultCapacity` that the user did not set is refused by the dialog ("Set a limit for Lighting first"), with a link to the Circuit types dialog.
- **B.** Built-in `maxTerminals` for four types, labelled "design practice, not a standard": Lighting 20, Socket Outlets 8, Fire Alarm 30, Emergency Lighting 20. Every other library type (Kitchen Appliance, Water Heater, HVAC Unit, EV Charger) gets 1 terminal per circuit, because each is a fixed appliance with an own circuit. A type that the user made has no limit, and the plan shows the Note `no-limit`. The load limit is used only when the user edited `defaultCapacity` in the document copy of the type. The library value alone is not a limit.
- **C.** Take the library `defaultCapacity` as the load limit (D-R7-01 A read literally).

**Recommendation: B.** It runs at once, and it states in the dialog that the numbers are design practice. A limit of 1 would be wrong for Fire Alarm and Emergency Lighting: these circuits serve many small devices, so they get a high limit and not an own circuit for each. The values 20, 8, 30 and 20 are not from a source (not verified); the user changes them in the Circuit types dialog. C would make circuits of 3 luminaires. A blocks a first run. **Provisional default: B** (reversible: the values are one constant each, `DEFAULT_MAX_TERMINALS`).

### Q-R7-05. May one circuit serve more than one room?

The overview says "by room and by a limit for each circuit type".

- **A.** No. Each circuit stays inside one room. A room that has more terminals than the limit gets several circuits. Many small rooms give many circuits with few terminals.
- **B.** Yes, by default. The planner puts whole rooms on a circuit one after the other, nearest room first, until the next room does not fit. A room is split only when it alone is above the limit. A wet room and a dry room never share a circuit.
- **C.** The user chooses in the dialog (a check box "One circuit may serve several rooms").

**Recommendation: C with B as the start value.** Circuits per room is the common wish for a design, and a circuit across a corridor is also common. The check box costs one boolean in the dialog and nothing in the file. **Provisional default: B** with the check box (reversible).

### Q-R7-06. What happens to fixed appliances (equipment)?

The overview says: "A stamp with the category equipment, or with a capacity above a threshold, gets its own circuit and never joins the sockets." But the scene refuses a stamp that is not a terminal: `assignTerminalToCircuit` raises "Only terminals can be added to a circuit." (`scene.ts:1987`-`:1989`). So an equipment stamp cannot be a circuit member today. The roadmap does not say which of the two to change.

- **A.** R7 v1 handles terminals only. A terminal with a capacity above the threshold gets its own circuit. An equipment stamp is not handled, and the dialog says "N equipment stamps are not put on a circuit." (Counted, not listed one by one.)
- **B.** [behaviour that the model plan fixed] Allow equipment stamps as circuit members. This relaxes `scene.ts:1987`, `TerminalCircuitSection`, the Circuits tree and the connection lines, and it contradicts "Only terminals can be added to a circuit". It needs the user to confirm that the circuit model changes.
- **C.** Treat a panel-less equipment stamp as a terminal by a user choice in the dialog. Same cost as B.

**Recommendation: A.** It keeps the model of `electrical-circuits-model.md` and still gives a heavy terminal (a socket for a cooker) its own circuit. **Provisional default: A.** The threshold is a setting (Q-R7-08).

### Q-R7-07 [data model]. Does the user get "Remove the circuits of the last run"?

R6 marks the items it makes (`routedBy`) so a re-run can remove them. R7 can do the same.

- **A.** No mark. A run adds circuits, and Undo (one step) removes them while the file is open. Later the user deletes circuits in Circuits mode, as today. A second run assigns only the terminals that have no circuit, so a second run never doubles circuits.
- **B.** [data model] An optional `Circuit.madeBy?: 'make-circuits'` (schema step 22). The dialog gets a button "Remove circuits made by this command" that deletes the marked circuits that still hold no manual change.

**Recommendation: A.** The roadmap says R7 "never moves a terminal that is already on a circuit". With A that statement holds without a mark. B repeats the R6 cost (clean-up on load, mark rules on edit paths) for a small gain. **Provisional default: A.**

### Q-R7-08. Where do the wet-room list and the threshold for an own circuit live?

Both are "user-editable" in the overview. The room types live in the browser, not in the file (`packages/ui/src/roomTypeStorage.ts:6`).

- **A.** Browser preferences, as P-R4-01 did for the route area (a key such as `mepapp.circuitPrefs.v1`: the list of wet room type ids and the threshold). Not in the file. No schema step.
- **B.** [data model] Fields on `ProjectDocument`, in schema step 22.
- **C.** Constants in code, no editing.

**Recommendation: A.** The list changes how the plan is calculated. The result is circuits in the file. **Provisional default: A** (reversible).

### Q-R7-09. Does the command balance the phases (L1, L2, L3)?

`Circuit.phase` exists and is provisional (`circuit.ts:25`; `electrical-circuits-model.md` §12 question 2, never resolved). The roadmap says nothing about phases.

- **A.** No. R7 leaves `phase` unset, so the circuit inherits from the panel (`getEffectivePhase`, `circuit.ts:361`).
- **B.** Spread the circuits over L1, L2 and L3 in turn, per type.
- **C.** Leave it unset, and show a Note when the panel has no phase default.

**Recommendation: A.** The shape of `phase` is still provisional, and a wrong balance would look like a design result. **Provisional default: A.**

### Provisional choices (easy to reverse; the director takes them without a stop)

| Id | Choice | Reason |
|---|---|---|
| P-R7-ORDER | The planner sorts the rooms by the distance from the panel stamp to the room label point (`roomLabelPoint`, `packages/core/src/rooms/room.ts:109`), nearest first. It sorts the terminals of one room by a nearest-neighbour chain that starts at the terminal nearest to the panel. Ties break on id. The same input gives the same output. | A repeatable result. The cable length is not designed here. |
| P-R7-WET | A circuit never holds terminals of a wet room and of a dry room together. | A 30 mA device on a light circuit of a wet room (overview section 5) must not trip dry rooms. |
| P-R7-RCD | The default for `device.rcdMilliamps` is 30. It applies to every circuit of the type Socket Outlets and to every circuit of a wet room. The dialog has a check box "Set a 30 mA residual-current device" (on). The device is `{ ...getEffectiveDevice(circuit, panel), kind: 'breaker', rcdMilliamps: 30 }`, because `device` is a whole-object override (`circuit.ts:26`) and a plain object would drop the curve and rating of the panel default. `ratingA` is never set (D-R7-01 A). | `rules.md`-style hard rule from the overview: a secondary source (IEC 60364-4-41 clause 411.3.3; not read in the original). The dialog states it and the user can clear it. |
| P-R7-OWN | A terminal with a typed capacity above the threshold gets its own circuit of the type that the classification gives. The start threshold is 2000 (in the unit of the circuit type). It is a setting (Q-R7-08). Not verified: the value. | Overview section 5. A planner value. |
| P-R7-PANEL | The command takes an existing `Panel` (`listPanels`, `scene.ts:1820`). If the drawing has no panel, the dialog says "Convert an equipment stamp to a panel first" and shows no Place button. R7 does not convert equipment. | Reuse. Conversion exists in Properties (Phase D). It keeps R7 small. |
| P-R7-NUMBER | New circuits are made with `createCircuitCommand` for the panel (`packages/render/src/circuitCommands.ts:36`), so the number is the lowest free number of the panel (gap fill) and the prefix inherits from the panel default. R7 sets `circuitTypeId` explicitly on each circuit. R7 sets no section. | Reuse of the numbering rules (`electrical-circuits-model.md` §3). |
| P-R7-ONE | One undo step. It holds all new circuits and all assignments. The strict `addTerminalToCircuitCommand` is the guard for each terminal (it returns null for a terminal that is already on another circuit). Notices follow `createCircuitFromTerminals` (`scene.ts:2021`): one notice for the whole run. | Reuse of the Transaction pattern. |
| P-R7-PAGE | The command works on the active page and refuses a multi-page file with `routePageProblem` (`packages/core/src/route-input.ts`). | Gap G1 (stamps have no page). The same refusal as R2. |
| P-R7-SCOPE | The scope is the R2 scope: rooms (a list with check boxes, all checked at first) or the selected stamps. A check box "Include terminals outside rooms" is on. The room list is extracted from `RouteDialog` into a shared component (T14). | Reuse before new (rule 3). |
| P-R7-LEFT | "Left" is a count of terminals. It is calculated: the unassigned candidates in the chosen scope that the plan does not place, plus the unassigned terminals outside the scope. It is not stored. The dialog says "N terminals on panel A, M terminals left" (the overview wrote "40 rooms: 22 on panel A, 18 left"; the unit is terminals, not rooms). | Overview section 1, R7 example. |
| P-R7-MENU | The menu item "Make circuits…" goes next to "Route network…" and "Size network…" (`packages/ui/src/components/MenuButton.tsx:170`-`:185`). It has no icon of its own beyond the menu style. | Same place as the other commands. |
| P-R7-UNITS | The load unit is the `units` text of the circuit type. R7 does not convert units. The dialog shows the unit. | The model has no unit on `terminalCapacities` (gap G16). A type in W with a terminal capacity in another unit is a risk (section 9, R-7). |

## 1. Goal

The user opens "Make circuits…", picks a panel, picks the rooms (or the selected terminals), and sees a preview. The preview says how many circuits the command makes for each circuit type, how many terminals each circuit holds, which terminals stay without a circuit and why, and how many unassigned terminals are left for another panel. The user presses "Make circuits". The app creates the circuits on the panel and assigns the terminals. This is one undo step. The new circuits show in the Networks tree and in Circuits mode.

Example (the office floor of the overview). The floor has 40 luminaires and 30 sockets. The user picks panel "A" and the west-wing rooms. With the start limits (Lighting 20, Sockets 8) the command makes light circuits and socket circuits. Every socket circuit and every circuit of a toilet gets a 30 mA device. The dialog says "40 terminals: 22 on panel A, 18 left". The user picks panel "B" and the east-wing rooms. The command assigns only terminals that have no circuit, so it never touches panel A.

Where R7 stops: R7 makes circuits. It does not draw cables, route conduit, balance phases, size breakers or cables, check the total against the main device of the panel, or make a schematic. It changes no network type, no routing target and no segment.

## 2. What exists now

| Item | Where | Use in R7 |
|---|---|---|
| `Circuit`, `Panel`, `PanelCircuitDefaults`, `CircuitType` | `packages/core/src/circuit.ts:9`, `:56`, `:72`, `:93` | R7 writes circuits. `CircuitType` gets the new optional fields. |
| Gap-fill numbering, `findCircuitForTerminal`, `computeCircuitCapacity`, `computePanelCapacity`, the six resolvers | `circuit.ts:116`, `:202`, `:337`, `:342`, `:353`-`:375` | The planner uses them. `getEffectiveDevice` builds the RCD device. |
| `CIRCUIT_TYPE_LIBRARY` (8 types, `defaultCapacity` in W), `validateCircuitTypeFields` | `packages/core/src/circuit-type-library.ts:11`, `:35` | The seed of the limits. The validation gets the new fields. |
| `ProjectDocument.circuitTypes` (the document copy, not in undo) and the merge with the library | `packages/core/src/project.ts:42`, `packages/render/src/scene.ts:1831`-`:1832` | A circuit type id of the library works with no copy in the document, so there is no adoption trap for circuit types (browser check in T12). |
| Circuit commands | `packages/render/src/circuitCommands.ts:36` (`createCircuitCommand`), `:134` (`assignTerminalToCircuitCommand`, moves), the strict `addTerminalToCircuitCommand` (returns null) | The apply method uses create and the strict add. |
| Scene methods | `scene.ts:1816` `listCircuits`, `:1820` `listPanels`, `:1947` `createCircuit`, `:1984` `assignTerminalToCircuit`, `:2021` `createCircuitFromTerminals`, `:2071` `assignCircuitToPanelStamp` | `createCircuitFromTerminals` is the pattern for one transaction and one notice. |
| Terminal check | `scene.ts:1987` | Only terminals join circuits (Q-R7-06). |
| Rooms | `packages/core/src/rooms/room.ts:15`, `:109` `roomLabelPoint`, `:146` `roomsAtPoint` | The finder uses the smallest room that holds the terminal. |
| Room types Toilet and Bathroom | `packages/core/src/rooms/room-type.ts:168`-`:169` | The default wet list. |
| Auto-place capacity rule | `packages/core/src/rooms/placement-rule.ts:529` | Light and Sockets get no capacity (Q-R7-03). |
| `autoPlaced.ruleId` | `packages/core/src/stamp.ts:27` | The classification of an auto-placed stamp (Q-R7-02 A). |
| The Route dialog, its room list and the multi-page refusal | `packages/ui/src/components/RouteDialog.tsx:316`-`:366`, `packages/core/src/route-input.ts` | The room list is extracted (T14). The refusal is reused. |
| Menu items and dialog wiring | `packages/ui/src/components/MenuButton.tsx:170`-`:185`, `packages/ui/src/App.tsx:456` (the Route dialog state) and `:1674` (its render) | The model for the new menu item and dialog. |
| Circuit types dialog | `packages/ui/src/components/CircuitTypesDialog.tsx`, state at `App.tsx:396`, rendered at `:1871`-`:1872`, opened through the prop at `:1558` | The dialog edits the new fields (T08). |
| Schema | `packages/core/src/project.ts:22` (21), clean-up pattern at `:445`-`:470` (`withCleanRoutedMark`, `withCleanRoutingTargets`, `withCleanSizing`) | Step 22 follows this pattern. |
| Browser helpers | `.claude/roadmap/browser/lib.mjs`, `r4-lib.mjs` (`setupRooms`), `r6-lib.mjs`, `r6-ui-lib.mjs` | A new `r7-lib.mjs` builds the project. |

Search results (the implementers repeat them): a search of `packages` for `maxTerminals` finds nothing. A search of `packages` for `defaultCapacity` finds these files that use it: `circuit.ts`, `circuit-type-library.ts` (library and validation), `CircuitTypesDialog.tsx`, `scene.ts` and `document.ts` (create and copy of types), `network.ts` and `network-type-library.ts` (network types, another field), and tests. The check did not read each hit, so the claim "no code reads it as a limit" is not verified for `scene.ts` and `document.ts`. T02 reads each hit and reports.

## 3. Research

No new source is needed for the algorithm. The planner is a next-fit packing of rooms in a repeatable order.

Sources for the limits (all "design practice"):
- NEN 1010:2020 no longer sets a count of sockets or luminaires per circuit. IEC 60364 does not set it either. Source named in the roadmap: Techniek Nederland, webinar NEN 1010:2020, https://technieknederland.nl/stream/presentatie-webinar-13-oktober-2021-wat-is-nieuw-in-de-norm-nen-10102020. Not read again in this plan.
- The 30 mA device for sockets: IEC 60364-4-41, clause 411.3.3 (a secondary source in the roadmap, not read in the original). The wet-room clause (IEC 60364-7-701) is not verified. The NEN 1010:2020 text and its exceptions: not verified.
- The values 20 (lighting) and 8 (sockets) are planner values. No source. The dialog says "design practice".

The domain checker (`mep-domain-checker`) checks the defaults before T02 is merged.

## 4. The model

### 4.1 Stored data (schema step 22)

Two optional fields on `CircuitType` (Q-R7-01 A; the exact names wait for the answer):

```ts
// packages/core/src/circuit.ts
export interface CircuitType {
  // existing: id, name, abbreviation, description, units, defaultCapacity
  /** The most terminals on one circuit of this type (auto-routing-r7.md section 4.1). Absent = the built-in default of the library type, else none. */
  maxTerminals?: number;
  /** The diversity factor in percent, above 0 and at most 100, that the limit check applies to the load. Absent = 100. */
  diversityPercent?: number;
}
```

- `CURRENT_SCHEMA_VERSION` goes from 21 to 22 (`project.ts:22`).
- The step 21 to 22 only changes the version number, the same as step 20 to 21 (`{ fromVersion: 21, toVersion: 22, migrate: (data) => ({ ...data, schemaVersion: 22 }) }`). The fields are optional and "absent" is valid.
- The clean-up on load: `loadProject` maps `circuitTypes` through `withCleanCircuitLimits`. It removes a `maxTerminals` that is not a whole number of 1 or more and a `diversityPercent` that is not a finite number above 0 and at most 100. It returns the same object when nothing is wrong (the pattern of `withCleanRoutedMark`, `project.ts:454`).
- An older MepApp refuses the file (`schema.ts`). This is the design of every step.
- The plan, the preview, the classification choices, the wet-room list and the threshold are not stored in the file (Q-R7-02 A, Q-R7-08 A). The circuits and their terminals are the record (`Circuit.panelId`, `Circuit.terminalIds`, `circuit.ts:16`, `:18`).
- Proof for each task that claims "no stored change": `git diff --stat` shows no change in `project.ts`, `schema.ts` and the serialize code. The browser checks compare the exported JSON before and after, except for the circuits.
- If the user chooses Q-R7-02 B or Q-R7-07 B, the same step 22 holds `StampDefinition.circuitTypeId` or `Circuit.madeBy`, and T01 adds them with their clean-up. T01 waits for all three answers (see the order paragraph in section 6).

### 4.2 Core types and functions

```ts
// packages/core/src/circuit-limits.ts (new)
export const DEFAULT_MAX_TERMINALS: Readonly<Record<string, number>> = { lighting: 20, sockets: 8, 'fire-alarm': 30, 'emergency-lighting': 20 };   // Q-R7-04 B
export const OWN_CIRCUIT_DEFAULT_THRESHOLD = 2000;                                                     // P-R7-OWN
export const RCD_DEFAULT_MILLIAMPS = 30;                                                               // P-R7-RCD
// The interface `CircuitLimits { maxTerminals: number | null; maxLoad: number | null; diversityPercent: number; units: string }` is declared in circuit-plan.ts (T06), so T06 does not depend on T02. circuit-limits.ts imports it.
/** The limits of a circuit type. `library` is the type with the same id in CIRCUIT_TYPE_LIBRARY, if any. `maxLoad` is null when the type has no library entry, when `defaultCapacity` is 0 or less, or when it equals the library value. Else it is `defaultCapacity` (Q-R7-04 B). */
export function circuitLimitsOf(type: CircuitType, library: CircuitType | undefined): CircuitLimits;
/** The reason a limit value is not acceptable, or null. */
export function validateCircuitLimits(fields: { maxTerminals?: number; diversityPercent?: number }): string | null;
```

```ts
// packages/core/src/circuit-candidates.ts (new)
export interface CircuitCandidate { id: string; name: string; position: Vec2; roomId: string | null; capacity: number | null; definitionId: string | null; ruleNeedId: string | null }
export interface CandidateScope { kind: 'rooms'; roomIds: readonly string[]; includeOutside: boolean } | { kind: 'stamps'; stampIds: readonly string[] }
/** Unassigned terminals in the scope. A terminal in a circuit is never a candidate. */
export function findCircuitCandidates(input: { stamps: Readonly<Record<string, PlacedStamp>>; circuits: readonly Circuit[]; rooms: readonly Room[]; pageIndex: number; scope: CandidateScope; terminalCapacities: Readonly<Record<string, number>>; ruleNeedOf: (stamp: PlacedStamp) => string | null }): { candidates: CircuitCandidate[]; outsideScopeUnassigned: number; equipmentSkipped: number };
```

```ts
// packages/core/src/circuit-plan.ts (new)
export interface CircuitPlanInput {
  panel: { id: string; position: Vec2 };
  candidates: readonly CircuitCandidate[];
  classify: Readonly<Record<string, string | null>>;           // candidate id -> circuit type id, null = no type
  limits: Readonly<Record<string, CircuitLimits>>;              // circuit type id -> ready limits (the scene calls circuitLimitsOf, T10)
  rooms: readonly Room[];                                       // for the label points and the room names
  wetRoomTypeIds: ReadonlySet<string>;
  ownCircuitThreshold: number;
  spanRooms: boolean;                                           // Q-R7-05
  rcd: boolean;                                                 // P-R7-RCD
}
export interface PlannedCircuit { circuitTypeId: string; terminalIds: string[]; roomIds: string[]; count: number; load: number; wet: boolean; rcdMilliamps?: number; reason: 'pack' | 'own' | 'room-split' }
export type PlanWarningCode = 'no-type' | 'no-limit' | 'terminal-without-power' | 'over-load-limit' | 'wet-and-dry' | 'equipment-skipped' | 'none-to-place' | 'multi-page';
export interface CircuitPlan { circuits: PlannedCircuit[]; unplaced: { terminalId: string; reason: PlanWarningCode }[]; warnings: { code: PlanWarningCode; severity: 'error' | 'warning' | 'note'; count: number }[]; stats: { circuits: number; terminals: number; rooms: number; left: number } }
export function planCircuits(input: CircuitPlanInput): CircuitPlan;
```

Rules of `planCircuits` (all pure; the same input gives the same output):
1. Group the candidates by (circuit type, wet flag). A candidate with no type goes to `unplaced` with `no-type`.
2. A type with no limit (`maxTerminals` null and `maxLoad` null) puts each candidate on an own circuit and gives the warning `no-limit` (Q-R7-04 B makes this rare).
3. A candidate with a capacity above the threshold gets an own circuit (`reason: 'own'`).
4. In each group, sort the rooms by P-R7-ORDER. Pack with next-fit: add the next whole room to the open circuit while the count and the load (times the diversity) stay within the limits. When a room does not fit, close the open circuit and start a new one with that room. A closed circuit is never reopened (next-fit, not first-fit: a later small room does not jump back to an earlier circuit, so circuits stay near each other). A room that alone is above a limit is split (`room-split`), and the split follows the nearest-neighbour order of its terminals. With `spanRooms` false, every room starts a new circuit.
5. Every candidate appears once: in one circuit or in `unplaced`. The total count in the circuits plus `unplaced` equals the count of candidates.
6. `rcdMilliamps` is set (30) for a circuit of the type `sockets` and for a wet circuit when `rcd` is true.
7. A terminal that is not a candidate (already on a circuit) never appears in the plan.

### 4.3 Scene (`packages/render/src/scene.ts`, T09 and T10)

```ts
planCircuits(request: { panelId: string; scope: CandidateScope; classify: Record<string, string | null>; spanRooms: boolean; rcd: boolean; prefs: { wetRoomTypeIds: string[]; ownCircuitThreshold: number }; ruleNeedByRuleId: Record<string, string> }): CircuitPlan & { candidates: CircuitCandidate[]; problem?: string }
applyCircuits(plan: CircuitPlan, request: { panelId: string }): { circuitIds: string[]; assigned: number }
```

- `planCircuits` reads the state, calls the two pure functions, and changes nothing. It returns `problem` for a multi-page file (`routePageProblem`) and for a panel that does not exist.
- `applyCircuits` runs in one `Transaction` named "Make circuits". For each planned circuit it mints an id (`nextCircuitSeq`), runs `createCircuitCommand` for the panel, sets `circuitTypeId`, sets `device` when the plan says so, and adds each terminal with the strict `addTerminalToCircuitCommand`. It re-checks that each terminal is still unassigned; a terminal that is not unassigned is skipped and counted. It emits one notice and `circuitsChanged` once (`scene.ts:1947` shows the emit pattern).
- The classification, the preferences and the rules come from the UI as input. The scene stores none of them.

### 4.4 UI (English only)

- `packages/ui/src/components/MakeCircuitsDialog.tsx` (new). Controls: a panel select (`circuits-panel`), the scope (`circuits-scope`, shared room list from T14), the classification table (`circuits-classify`, one select per stamp definition, shown only when Q-R7-02 A needs it), the check box "One circuit may serve several rooms" (`circuits-span`), the check box "Set a 30 mA residual-current device" (`circuits-rcd`), a summary (`circuits-summary`), the lines (`circuits-line-<code>`), the button `circuits-place` and the result `circuits-result`.
- `packages/ui/src/components/circuitPlan.ts` (new) builds the texts. Texts are English only. Each text has 140 characters or fewer. The warning label is "Warning" and the note label is "Note".
- The dialog recalculates the plan 300 ms after the last change (the R4 and R6 pattern) and shows "Calculating…" while it waits.
- A small section "Settings" holds the wet room types and the threshold (Q-R7-08 A, browser storage).
- `CircuitTypesDialog.tsx` gets two number fields: "Most terminals" and "Diversity (%)".

### 4.5 Migration summary

Version-only step 21 to 22, a clean-up on load, no data transform. A file of schema 21 loads and its circuit types are unchanged. A file of schema 22 does not open in an older MepApp.

## 5. How R7 keeps the rules of `rules.md` section 3

1. **The segment defines the network type of a port.** R7 touches no segment, no port, no network type and no routing target. Light and Sockets have no routing target (`auto-routing.md` §5 item 10). Circuits are not networks.
2. **The cascade invariant.** R7 adds no per-segment field. Not applicable. T22 compares the segments of the export before and after a run.
3. **Reuse before new.** Reused: `Panel`, `Circuit`, `createCircuitCommand`, the strict add command, `findCircuitForTerminal`, `getEffective*`, `listCircuitTypes`, the Transaction pattern of `createCircuitFromTerminals`, `roomsAtPoint`, `routePageProblem`, the R2 room list (extracted, T14), the 300 ms debounce, `lib.mjs`, `r4-lib.mjs`, `r6-ui-lib.mjs`. New, after a search that found nothing: the packing planner and the candidate finder. The implementers search `packages/core/src` for `planCircuits`, `maxTerminals` and `findCircuitCandidates` and report.
4. **The adoption trap.** Circuit types are not adopted: `listCircuitTypes` merges the library with the document copy (`scene.ts:1831`). T12 proves it with a project whose `circuitTypes` is empty. A circuit of type `sockets` shows the name "Socket Outlets" in the tree and in Properties, not a missing name. If the proof fails, `applyCircuits` adopts the type first and the plan is revised.
5. **Verify UI wiring through the real DOM.** T15 to T17, T20 and T22 click the menu item and use the real controls. The scene API sets the drawing up and reads state.
6. **Merge lesson.** Each task ends with `pnpm build` at the root. The part check forces a build with no cache.

Other rules of `rules.md` section 2: no `pnpm add`; no `mupdf` import; no `window.confirm`; never prettier. The real rooms of the first floor come from the existing fixture. No placeholder fixture is made.

## 6. The phases and the tasks

Commands (the tester runs them from the root of the worktree `/root/MepApp/.claude/worktrees/agent-framework`, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. No environment variable before the command. Screenshots go to `/tmp/mepapp-shots/` with `shot('<task id>-<name>')`.

Rules for every browser step of this part (the rules of R2 to R6 apply):
- One Chromium page with a PDF open at a time. Open `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf` (tracked) with `openPdf`. The 10A drawing (`plattegrond begane grond 10A.pdf`, local only) is used in T22 only, and the check skips it with a message when the file is absent.
- The setup (`r7-lib.mjs`, T11) uses `setupRooms` of `r4-lib.mjs` to detect rooms, places terminals and a panel with the scene API, and gives them capacities with `setTerminalCapacity` where a test needs a load. This is test setup, not a fixture file.
- While a dialog is open, click only inside `.mep-modal`. The Undo button of the rail is covered by the dialog backdrop, so a step that undoes closes the dialog first (the R6 deviation 2).
- Independent proofs (not the planner's own numbers): (1) read the circuits from the exported JSON and count the terminals; every terminal is in at most one circuit; (2) every circuit has at most `maxTerminals` terminals; (3) no terminal that was on a circuit before the run changed circuit; (4) the circuit numbers of one panel are unique; (5) compare the export before and after Undo; (6) the segments, fittings and stamps of the export are the same before and after a run.

Phases: **A** the model (T01, T02), **B** the engines in core (T03 to T07), **C** the dialog settings and the preference storage (T08, T09), **D** the scene (T10, T11), **E** the browser setup and the scene checks (T12, T13), **F** the UI (T14 to T19), **G** the checks (T20 to T24).

| Task | Title | Depends on | Waits for | Files (main) |
|---|---|---|---|---|
| T01 | Schema step 22: the `CircuitType` limit fields and the clean-up | none | Q-R7-01 (and any other [data model] answer that is not the provisional default) | `circuit.ts`, `project.ts`, `project.test.ts` |
| T02 | Limits: `circuitLimitsOf`, the defaults, the validation | T01 | Q-R7-04 | `circuit-limits.ts`, `circuit-type-library.ts`, tests |
| T03 | Candidate finder | none | none | `circuit-candidates.ts`, tests |
| T04 | Classification input and the rule-need lookup | T03 | Q-R7-02 | `circuit-candidates.ts`, tests |
| T05 | The packing function (rooms, next-fit, nearest-first) | none | none | `circuit-pack.ts`, tests |
| T06 | `planCircuits`: groups, own circuits, wet rooms, limits (declares `CircuitLimits`, takes ready limits as input) | T03, T05 | none (uses the provisional defaults of Q-R7-03, -05, -06) | `circuit-plan.ts`, tests |
| T07 | `planCircuits`: the RCD device, warnings, invariants | T06 | Q-R7-09 | `circuit-plan.ts`, tests |
| T08 | Circuit types dialog: the two new fields | T01, T02 | none | `CircuitTypesDialog.tsx`, UI tests |
| T09 | Preference storage: wet room types and the threshold | none | Q-R7-08 | `circuitPrefsStorage.ts`, UI tests |
| T10 | Scene: `planCircuits` (read only; calls `circuitLimitsOf`) | T02, T04, T07 | none | `scene.ts`, `index.ts` |
| T11 | Scene: `applyCircuits` | T10 | none | `scene.ts` |
| T12 | Browser setup `r7-lib.mjs` and the scene check | T11 | none | `.claude/roadmap/browser/r7-lib.mjs`, `r7-t12-check.mjs` |
| T13 | Scene check: undo, exclusivity, second panel, library types | T12 | none | `r7-t13-check.mjs` |
| T14 | Extract the room list from `RouteDialog` | none | none | `RoomScopeList.tsx`, `RouteDialog.tsx`, regression check |
| T15 | Texts and line builders | T07 | none | `circuitPlan.ts`, `circuitPlan.test.ts` |
| T16 | Dialog: inputs, scope, panel, classification table | T10, T14, T09 | none | `MakeCircuitsDialog.tsx`, `theme.css` |
| T19 | Menu item and App wiring (runs right after T16) | T16 | none | `MenuButton.tsx`, `App.tsx` |
| T17 | Dialog: preview section | T15, T16, T19 | none | `MakeCircuitsDialog.tsx` |
| T18 | Dialog: Place, the RCD and span check boxes, result | T11, T17, T19 | none | `MakeCircuitsDialog.tsx`, `r7-t18-check.mjs` |
| T20 | Browser: second panel, leftovers, edits, Circuits mode | T18, T19 | none | `r7-t20-check.mjs` |
| T21 | Browser: save, load, PDF round trip, schema 21 file | T18 | none | `r7-t21-check.mjs` |
| T22 | Browser: wet rooms, own circuits, no-power note, narrow, dark | T18 | none | `r7-t22-check.mjs` |
| T23 | Circuit types dialog check and screenshots | T08 | none | `r7-t23-check.mjs` |
| T24 | The part check | all | none | `.claude/roadmap/browser/r7-check.mjs` |

**Order for the director.** The questions are open. Start T03, T05, T14 and T09 (no wait on a data-model answer; T09 needs only Q-R7-08, which has a provisional default). T01 waits for Q-R7-01 only, because the provisional defaults of the other [data model] questions (Q-R7-02 A, -03 A, -07 A, -08 A) store nothing. If the user answers one of those with a stored option, that field joins step 22 and T01 waits for that answer too. Do not write step 22 twice. Q-R7-01 has no provisional default, so T01 stays blocked until the user answers. T02 waits for Q-R7-04 and depends on T01. The free tasks, with no dependency on T01 or T02, are: T03, T05, T06 (the planner takes ready `CircuitLimits`; the test inputs are hand-made), T07, T09, T14 and T15. T04 and T08 follow their own dependencies. T06 and T07 use the provisional defaults of Q-R7-03, -05, -06 and -09, because each one is a parameter of the planner and not a stored value. The scene tasks T10 and T11 and everything after them need T02, so they wait for T01. R7 needs nothing from R2 to R6 except two reused functions. R6 is done, so the schema number 22 is right. The director reads `CURRENT_SCHEMA_VERSION` at the start of T01 and uses the next number if it is not 21.

Jobs on the same file run one after another, in the order of the task numbers: T06 and T07 (`circuit-plan.ts`); T10 and T11 (`scene.ts`); T16, T17 and T18 (`MakeCircuitsDialog.tsx`; T19 runs between T16 and T17 and edits other files). `packages/core/src/index.ts` is a shared file: each task adds its export lines, one task after another.

### T01. Schema step 22: the `CircuitType` limit fields and the clean-up
- **Depends on:** none. **Waits for:** Q-R7-01 only (Q-R7-02 A, -03 A, -07 A and -08 A store nothing; a stored option of one of them joins this task).
- **Files:** `packages/core/src/circuit.ts`, `packages/core/src/project.ts`, `packages/core/src/project.test.ts`, `packages/core/src/index.ts`. The implementer searches `packages` for tests that name 21 (`grep -rn "schemaVersion\|CURRENT_SCHEMA_VERSION"`).
- **Shapes:** section 4.1. `CURRENT_SCHEMA_VERSION = 22`. The step `{ fromVersion: 21, toVersion: 22, ... }` with a comment in the style of the step 20 to 21. `withCleanCircuitLimits(type)` in `loadProject`.
- **Must not touch:** the other steps, `serializeProject`, the scene, the circuit commands.
- **Tests (core):** a v21 file loads with `schemaVersion` 22 and its circuit types are unchanged (deep equal); a v22 file with `maxTerminals: 8` and `diversityPercent: 80` round-trips; `maxTerminals: 0`, `2.5`, `'8'`, `-1`, `diversityPercent: 0`, `150`, `'x'` load with the field removed and the other fields kept; a type without the fields is the same object (`toBe`); a file of schema 23 is refused with the `SchemaMigrationError` text; no test still expects 21.
- **Verify:** core tests; `pnpm typecheck`; `pnpm build`.
- **Size:** about 30 lines and 60 of tests.

### T02. Limits: `circuitLimitsOf`, the defaults, the validation
- **Depends on:** T01. **Waits for:** Q-R7-04.
- **Files:** `packages/core/src/circuit-limits.ts` (new), `packages/core/src/circuit-type-library.ts` (`validateCircuitTypeFields` gets the two fields), tests, `index.ts`.
- **Shapes:** section 4.2. `circuitLimitsOf(type, library)`: `maxTerminals` from the type, else `DEFAULT_MAX_TERMINALS[type.id]`, else 1 for a library type, else null for a type the user made (Q-R7-04 B). `maxLoad` is `defaultCapacity` only when the type has a library entry, `defaultCapacity` is above 0, and it differs from the library value; else null. (`createCircuitType` sets `defaultCapacity` 0 for a new type, `scene.ts:1846`, so 0 must mean "no load limit".) `diversityPercent` defaults to 100.
- **Must not touch:** `CIRCUIT_TYPE_LIBRARY` values, `computeCircuitCapacity`.
- **Tests (core):** the library type `sockets` gives 8 and no load limit; `lighting` gives 20; `kitchen-appliance` gives 1; `fire-alarm` gives 30; a user type with no field gives null `maxTerminals`; a user type with `defaultCapacity` 0 gives null `maxLoad`; a user type with `defaultCapacity` 500 and no library entry gives null `maxLoad`; a library type whose copy has `defaultCapacity` 0 gives null `maxLoad`; a document copy of `sockets` with `defaultCapacity` 3000 gives `maxLoad` 3000; `maxTerminals` of the type wins over the default; `validateCircuitTypeFields` refuses `maxTerminals` 0 and 2.5 and `diversityPercent` 0 and 101, and accepts absent values. Re-run the search for readers of `defaultCapacity` and report any (section 2).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 60 lines and 70 of tests.

### T03. Candidate finder
- **Depends on:** none.
- **Files:** `packages/core/src/circuit-candidates.ts` (new), `circuit-candidates.test.ts`, `index.ts`.
- **Shapes:** section 4.2 `findCircuitCandidates`. A candidate is a stamp with `category: 'terminal'` that `findCircuitForTerminal` does not find. The room is `roomsAtPoint(rooms, stamp.transform.position, pageIndex)[0]` (the smallest room). Scope `rooms`: the terminal is in when its room is checked, or when it has no room and `includeOutside` is true. Scope `stamps`: the ids in the list. `equipmentSkipped` counts stamps with `category: 'equipment'` in the scope, except a stamp that backs a `Panel` (the input holds the set of panel stamp ids, `Panel.equipmentStampId`): a panel is not an appliance and is not counted. `outsideScopeUnassigned` counts unassigned terminals not in the scope. `capacity` is the entry of `terminalCapacities` or null.
- **Must not touch:** the circuit commands, the scene.
- **Tests (core):** a terminal on a circuit is never a candidate; a terminal in two nested rooms takes the smaller room; a terminal outside all rooms is in only with `includeOutside`; the `stamps` scope ignores the rooms; equipment is counted and not returned; an equipment stamp that backs a panel is not counted; a terminal on another page is out; the counts add up (`candidates + outsideScopeUnassigned` equals all unassigned terminals on the page).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 90 of tests.

### T04. Classification input and the rule-need lookup
- **Depends on:** T03. **Waits for:** Q-R7-02 (A is the provisional default).
- **Files:** `packages/core/src/circuit-candidates.ts`, tests.
- **Shapes (for Q-R7-02 A):** `NEED_CIRCUIT_TYPE: Record<string, string> = { light: 'lighting', sockets: 'sockets' }`. `suggestCircuitTypes(candidates): Record<string, string | null>` returns, for each candidate, `NEED_CIRCUIT_TYPE[ruleNeedId]` or null. `definitionGroups(candidates)` groups the candidates without a suggestion by `definitionId` (for the table in the dialog).
- **Must not touch:** the placement rules, the stamp library.
- **Tests (core):** an auto-placed light terminal suggests `lighting`; a sockets terminal suggests `sockets`; a supply-air terminal suggests null; a hand-placed terminal suggests null and groups by definition; a terminal with no definition id groups under "no definition".
- **Verify:** core tests; `pnpm build`.
- **Size:** about 40 lines and 50 of tests. If the user chooses B, the task changes: the lookup reads `StampDefinition.circuitTypeId`.

### T05. The packing function
- **Depends on:** none.
- **Files:** `packages/core/src/circuit-pack.ts` (new), `circuit-pack.test.ts`, `index.ts`.
- **Shapes:** `packRooms(units: { roomId: string; terminalIds: string[]; loads: number[]; distance: number }[], limits: { maxTerminals: number | null; maxLoad: number | null; diversityPercent: number }, options: { spanRooms: boolean }): { terminalIds: string[]; roomIds: string[]; reason: 'pack' | 'room-split' }[]`. Rooms sort by `distance`, then id. Next-fit as in section 4.2 rule 4 (the open circuit takes the next whole room if it fits, else it closes and a new one opens; a closed circuit never reopens). The split of one room uses the order that the caller gives in `terminalIds` (the caller sorts by nearest neighbour). A limit of null does not limit.
- **Must not touch:** the circuit types, the scene.
- **Tests (core):** hand-checked values (section 6a); a next-fit test where first-fit gives another result: rooms of 3, 3 and 1 terminals with limit 4 and `spanRooms` true give the circuits {room 1} and {room 2, room 3} (first-fit would give {room 1, room 3} and {room 2}); every terminal appears once; no circuit passes a limit; `spanRooms: false` gives one room per circuit; a room above the limit splits and the pieces keep the given order; a null limit packs everything in one circuit; a load limit with diversity 50 admits twice the raw load; an empty input gives an empty result; the same input twice gives the same output.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 100 of tests.

### T06. `planCircuits`: groups, own circuits, wet rooms, limits
- **Depends on:** T03, T05. It does not depend on T02. **Waits for:** nothing (it uses the provisional defaults of Q-R7-03, -05 and -06: A, B and A).
- **Files:** `packages/core/src/circuit-plan.ts` (new), `circuit-plan.test.ts`, `index.ts`.
- **Shapes:** section 4.2 without the RCD and the warning list (T07). Rules 1 to 5 and 7. `CircuitPlanInput.limits` holds ready `CircuitLimits` for each circuit type id. This task declares the `CircuitLimits` interface (T02 imports it). The tests build the limits by hand.
- **Must not touch:** `circuit-pack.ts`, the scene.
- **Tests (core):** a candidate with no type is in `unplaced` with `no-type`; wet and dry candidates of one type never share a circuit; a capacity above the threshold gives an own circuit with `reason: 'own'`; the terminals of two types never share a circuit; the packing cases of the hand-checked values 1 to 3 and 5 to 6 (section 6a); a type with no limit gives one circuit per candidate; the sum of the circuit sizes plus `unplaced` equals the count of candidates; a candidate that is not in the input never appears.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 110 lines and 120 of tests.

### T07. `planCircuits`: the RCD device, warnings, invariants
- **Depends on:** T06. **Waits for:** Q-R7-09 (A is the provisional default).
- **Files:** `packages/core/src/circuit-plan.ts`, `circuit-plan.test.ts`.
- **Shapes:** `rcdMilliamps` (rule 6), the warning codes and severities of section 4.2: `no-type` Warning, `no-limit` Note, `terminal-without-power` Note, `over-load-limit` Warning (an own circuit above the load limit), `equipment-skipped` Note, `none-to-place` Error (the Place button is disabled), `multi-page` Error. `stats.left` follows P-R7-LEFT (a count of terminals).
- **Must not touch:** the packing.
- **Tests (core):** a socket circuit has 30; a wet light circuit has 30; a dry light circuit has none; `rcd: false` sets none; the warning counts match; `none-to-place` appears for an empty candidate list; an invariant test over 200 random inputs (seeded): every candidate once, no limit passed except an own circuit, and the output is stable.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 90 of tests.

### T08. Circuit types dialog: the two new fields
- **Depends on:** T01, T02.
- **Files:** `packages/ui/src/components/CircuitTypesDialog.tsx`, its UI test, `theme.css` only if the layout needs it.
- **What it adds:** two number inputs, "Most terminals" and "Diversity (%)", with the start values of the library type shown as the placeholder, and the text of `validateCircuitLimits` on a wrong value. A note under the fields: "These limits are design practice, not a standard. NEN 1010 and IEC 60364 set no count of sockets or luminaires for a circuit." The save calls the existing update method of the scene, which already writes the document copy (`scene.ts:1860`-`:1862`). A clearing of a field must pass an explicit `undefined` (`{ ...type, maxTerminals: undefined }`), because a plain merge keeps the old value. Next to the "Default capacity" field the dialog says: "A Default capacity that you change acts as a load limit for Make circuits." (Q-R7-04 B).
  The new fields join the five state places of `CircuitTypeForm` (`CircuitTypesDialog.tsx:78`-`:135`), none of which may be missed: (1) a `useState` for each field (`:79`-`:84`); (2) `changedFromBuiltIn` (`:87`), which decides if "Reset to built-in" is on; (3) `dirty` (`:94`), which enables Save and Revert; (4) `revert` (`:103`), which resets each field; (5) the `key` of the form at `:56`, which must hold the two saved values so the form re-seeds after a save. The scene method `resetCircuitType` (`scene.ts:1884`) must also drop the two fields when it restores the built-in values.
- **Must not touch:** the circuit commands, the other fields.
- **Verify:** UI tests (the pure validation text); `pnpm build`. The browser check is T23.
- **Size:** about 50 lines.

### T09. Preference storage: wet room types and the threshold
- **Depends on:** none. **Waits for:** Q-R7-08 (A is the provisional default).
- **Files:** `packages/ui/src/circuitPrefsStorage.ts` (new), `circuitPrefsStorage.test.ts`. The model is `packages/ui/src/routeAreaStorage.ts`.
- **Shapes:** `loadCircuitPrefs(storage): { wetRoomTypeIds: string[]; ownCircuitThreshold: number }` (defaults `['toilet', 'bathroom']` and 2000), `saveCircuitPrefs(storage, prefs)`. The key is `mepapp.circuitPrefs.v1`. Every read and write is in try/catch. A bad stored value gives the default. An id that is not in the room type library is ignored by the caller.
- **Must not touch:** `roomTypeStorage.ts`.
- **Tests (UI):** the defaults; a round trip; a bad JSON gives the defaults; a negative threshold gives the default; a storage that throws gives the defaults.
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 40 lines and 50 of tests.

### T10. Scene: `planCircuits` (read only)
- **Depends on:** T02, T04, T07.
- **Files:** `packages/render/src/scene.ts`, `packages/core/src/index.ts`.
- **Shapes:** section 4.3 `planCircuits`. It builds the input from the state: stamps, circuits, panels, the rooms of the active page, `terminalCapacities`, and the ready limits: for each type of `listCircuitTypes()` it calls `circuitLimitsOf(type, library entry)` (T02) and passes the result as `limits`. It also passes the set of panel stamp ids to the finder. The panel position is the position of `panel.equipmentStampId`. It returns the `problem` text for a multi-page file and for a missing panel.
- **Must not touch:** the circuit commands, the undo state.
- **Verify:** `pnpm typecheck`; `pnpm build`. `git diff --stat` shows no change in `project.ts`. The browser check is in T12.
- **Size:** about 70 lines.

### T11. Scene: `applyCircuits`
- **Depends on:** T10.
- **Files:** `packages/render/src/scene.ts`.
- **Shapes:** section 4.3 `applyCircuits`. One `Transaction` named "Make circuits". The device uses `{ ...getEffectiveDevice(circuit, panel), kind: 'breaker', rcdMilliamps }` (P-R7-RCD). The strict add command is the guard; skipped terminals are counted. One notice: "Made N circuits with M terminals on <panel name>." One `notifyCircuitsChanged()` call at the end (`scene.ts:1693`; this method emits the event `circuitsChanged`). The selection needs no clean-up (no id is removed). Diversity: a new circuit gets no `diversityPercent` of its own, so it inherits from the panel (`getEffectiveDiversityPercent`). The `diversityPercent` of the circuit type is used only by the limit check of the planner, as a factor on the load. The planner and the circuit therefore can use different factors when the panel default differs from the type; the Note `diversity-differs` is not built in R7 (listed in section 9, R-15). (This is the "recommend A" reading of Q-R7-01: the type value is a planning factor, not a value that R7 writes to the circuit.)
- **Must not touch:** `planCircuits`, `createCircuitFromTerminals`, `assignTerminalToCircuit`.
- **Verify:** `pnpm typecheck`; `pnpm build`. The browser check is T12 and T13.
- **Size:** about 80 lines.

### T12. Browser setup `r7-lib.mjs` and the scene check
- **Depends on:** T11.
- **Files:** `.claude/roadmap/browser/r7-lib.mjs` (new), `r7-t12-check.mjs` (work folder).
- **What it builds:** `buildCircuitProject(h, options)`: detects rooms with `setupRooms`, places a panel stamp (an equipment stamp, converted with `convertStampToPanel(stampId, name)`, `scene.ts:2289`), 4 toilet and office rooms with luminaires and sockets (some auto-placed with a rule, some by hand), and typed capacities on two terminals. It returns the ids.
- **What it checks (scene API, setup and reading only):** `planCircuits` returns the planned counts; `applyCircuits` writes them; the independent proofs (1) to (4) and (6) of section 6 hold; Undo restores the export exactly; Redo gives the same counts; a project with `circuitTypes` empty shows the library type name in `listCircuitTypes()` (rule 4); a multi-page file gives `problem`; no page error.
- **Size:** about 150 lines of lib and 120 of check.

### T13. Scene check: undo, exclusivity, second panel, library types
- **Depends on:** T12.
- **Files:** `r7-t13-check.mjs` (work folder).
- **What it checks:** (1) a terminal that is on a hand-made circuit stays there after a run; (2) a second run for panel B with the rest of the rooms assigns only the unassigned terminals and the circuits of panel A are the same objects (compare the export); (3) the numbers of panel B start at 1 (gap fill per panel); (4) a panel with a circuit default prefix gives the new circuits that prefix by inheritance (`circuit.prefix` is absent in the export); (5) a panel with `circuitDefaults.device` of curve C keeps the curve on a socket circuit (the device has `rcdMilliamps: 30` and the curve of the panel); (6) a deleted terminal (the existing delete cleanup) leaves no id in any circuit; (7) the run twice with the same input gives equal plans.
- **Size:** about 120 lines.

### T14. Extract the room list from `RouteDialog`
- **Depends on:** none.
- **Files:** `packages/ui/src/components/RoomScopeList.tsx` (new), `packages/ui/src/components/RouteDialog.tsx`, `theme.css` only if needed.
- **What it does:** moves the room list (`RouteDialog.tsx:316`-`:366`: the "all" and "none" buttons, the head, the rows, the "include outside" check box) into a component with the same `data-testid` names (`route-rooms-all`, `route-rooms-none`, `route-room`, `route-outside`). It takes the rooms, the unchecked set and the callbacks as props. It also takes props for the labels (the Route dialog passes its translated texts through `routeText(language, ...)`, so the component holds no text of its own) and a prop for an optional count column (for each room, a number and a header text; the Make circuits dialog shows "Terminals", the Route dialog shows its ports column as before). The new dialog passes English texts only. The Route dialog behaves the same.
- **Must not touch:** the logic of the Route dialog, its texts, its test ids.
- **Verify:** UI tests; `pnpm build`; regression: `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r2-check.mjs` exits 0, and `r6-check.mjs` exits 0 (one command each).
- **Size:** about 80 changed lines. The test ids of the new dialog use the prefix `circuits-` through a prop `testIdPrefix`.

### T15. Texts and line builders
- **Depends on:** T07.
- **Files:** `packages/ui/src/components/circuitPlan.ts` (new), `packages/ui/src/circuitPlan.test.ts` (new).
- **Shapes:** `circuitPlanLines(plan)`, `circuitPlanSummary(plan)`. A line has `{ code, severity, text, hint }`. Examples: "Makes {circuits} circuits with {terminals} terminals in {rooms} rooms." and "{left} terminals stay without a circuit. Use another panel for them." and "{count} terminals have no power. The load limit counts only terminals with a power." Texts are STE, English only.
- **Must not touch:** `routePlan.ts`, `sizePlan.ts`, `routeBuildPlan.ts`.
- **Tests (UI):** every code has a text; each text with sample numbers has 140 characters or fewer; the plural forms (1 circuit, 2 circuits); no Dutch word; the order of lines follows the plan; the severity of each code matches section 4.2.
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 100 lines and 90 of tests.

### T16. Dialog: inputs, scope, panel, classification table
- **Depends on:** T10, T14, T09.
- **Files:** `packages/ui/src/components/MakeCircuitsDialog.tsx` (new), `theme.css`.
- **What it adds:** the controls of section 4.4 up to the classification table; the settings section for the wet rooms and the threshold (saved with T09); the refusal for a multi-page file; the message "Convert an equipment stamp to a panel first" when there is no panel. The dialog class is `mep-modal--circuits`.
- **Must not touch:** the scene, the Route dialog.
- **Verify:** UI tests (the pure parts); `pnpm build`. The browser steps run in T18.
- **Size:** about 140 lines.

### T17. Dialog: preview section
- **Depends on:** T15, T16, T19.
- **Files:** `MakeCircuitsDialog.tsx`.
- **What it adds:** the pending line, the summary, the lines, a table "Circuits by type" (type name, circuits, terminals, the limit and its unit), the left count. It calls `scene.planCircuits` 300 ms after the last change and on the events `drawingChanged`, `circuitsChanged`, `roomsChanged`, `pageChanged` and `documentActivated`.
- **Must not touch:** the inputs of T16.
- **Verify:** UI tests (the pure parts); `pnpm build`.
- **Size:** about 100 lines.

### T18. Dialog: Place, the RCD and span check boxes, result
- **Depends on:** T11, T17, T19.
- **Files:** `MakeCircuitsDialog.tsx`, `circuitPlan.ts`, `theme.css`, `r7-t18-check.mjs` (work folder).
- **What it adds:** `circuits-span`, `circuits-rcd`, `circuits-place` (disabled on an error), `circuits-result` ("Made N circuits with M terminals on <panel>.").
- **Verify:** UI tests; `pnpm build`. Browser check `r7-t18-check.mjs` through real clicks and typing:
  1. Open the dialog through the menu item `^\s*Make circuits…\s*$` (T19 is a dependency of this task, so the menu item exists).
  2. Pick the panel, the scope "rooms". `circuits-summary` shows after the pending line. The numbers equal `planCircuits` through the scene API.
  3. Uncheck one room: the summary changes and the terminals of that room are not in the plan.
  4. Switch the scope to "selected stamps" with a canvas selection: the summary counts the selection.
  5. The classification table lists each hand-placed definition once; choose a type with the real select: the summary changes.
  6. Clear `circuits-span`: the circuits count goes up or stays the same; it never goes down.
  7. Clear `circuits-rcd`: the plan has no device; Place writes no `rcdMilliamps`.
  8. Click `circuits-place`. `circuits-result` shows N and M equal to the export difference. The Networks tree lists the circuits (open the tree after the dialog closes).
  9. Close the dialog, click `.mep-rail-btn[title="Undo"]`: the export equals the baseline.
  10. A drawing with no panel shows the message and no `circuits-place`. A multi-page file shows the refusal (if no real multi-page fixture exists, the check reports NEEDS_CONTEXT for this step and nobody makes a fake PDF).
  11. A 400 px run: `scrollWidth <= clientWidth` of `.mep-modal--circuits`. No page error.
  12. The Settings section: open it, change the wet room types and the threshold with the real controls, and watch the plan change.
  13. The "Calculating…" state: type in a field and take the screenshot inside the 300 ms wait (the check stubs the plan call with a delay of 600 ms through the page, or reads the pending line with a poll).
  Screenshots: `T18-circuits-preview`, `T18-circuits-classify`, `T18-circuits-placed`, `T18-circuits-nopanel`, `T18-circuits-narrow`, `T18-circuits-settings`, `T18-circuits-calculating`.
- **Size:** about 90 lines.

### T19. Menu item and App wiring
- **Depends on:** T16. Runs right after T16 and before T17 and T18.
- **Files:** `packages/ui/src/components/MenuButton.tsx`, `packages/ui/src/App.tsx`.
- **What it does:** the prop `onOpenCircuits`, the menu item "Make circuits…" after "Size network…" (P-R7-MENU), the state `circuitsOpen`, and the render of `MakeCircuitsDialog` with the rules from the placement rule storage as `ruleNeedByRuleId` (a map from rule id to `needId`).
- **Must not touch:** the other menu items.
- **Verify:** `pnpm typecheck`; `pnpm build`.
- **Size:** about 40 lines.

### T20. Browser: second panel, leftovers, edits, Circuits mode
- **Depends on:** T18, T19.
- **Files:** `r7-t20-check.mjs` (work folder).
- **What it checks (real DOM):** (1) run for panel A with the west rooms: `circuits-summary` says how many are left; (2) open the dialog again for panel B with all rooms: the plan holds only the left terminals; Place; the export shows two panels with disjoint terminals; (3) a third run says `none-to-place` and `circuits-place` is disabled; (4) delete one circuit in Circuits mode (the rail button, the floating toolbar): its terminals are candidates again and a new run takes them; (5) delete a terminal on the canvas and run again: no dead id in any circuit; (6) the Circuits mode tree and the connection lines show the new circuits (a screenshot of the Show Circuits lines); (7) change the wet room list in the dialog settings: the plan changes; reload the page: the list stays (browser storage).
- **Screenshots:** `T20-second-panel`, `T20-none-to-place`, `T20-circuit-lines`.
- **Size:** about 130 lines of check.

### T21. Browser: save, load, PDF round trip, schema 21 file
- **Depends on:** T18.
- **Files:** `r7-t21-check.mjs` (work folder).
- **What it checks:** run and Place; Save through the OPFS handles of `lib.mjs`; reload; Open; the export equals the one before (`schemaVersion` 22); a schema 21 file (the same project with `schemaVersion: 21` and no limit fields) loads without error and a run on it works with the library limits; a file with bad limit values loads with the fields removed; the PDF export keeps the embedded JSON with the circuits (read `mepapp-project.json` as the R2 to R6 checks do; the implementer reads `lib.mjs` and reports if there is no helper).
- **Size:** about 90 lines of check.

### T22. Browser: wet rooms, own circuits, no-power note, narrow, dark
- **Depends on:** T18.
- **Files:** `r7-t22-check.mjs` (work folder).
- **What it checks:** (1) a toilet with 2 luminaires and an office with 3 gives two light circuits (wet and dry), and the toilet circuit has 30 mA; (2) a socket circuit has 30 mA; the panel default curve stays; (3) a terminal with a typed capacity above the threshold gets its own circuit and the line `circuits-line-own` shows; (4) the line `circuits-line-terminal-without-power` shows (Note) for auto-placed lights; (5) a type with no limit shows `circuits-line-no-limit`; (6) a hand-placed terminal with no classification choice is listed and not placed; (7) equipment in the scope is counted in `circuits-line-equipment-skipped`; (8) run 2 in dark mode (`open({ dark: true })`) for the UI reviewer; (9) run 3 at 400 px.
- **Screenshots:** `T22-wet-circuits`, `T22-own-circuit`, `T22-notes`, `T22-dark`, `T22-narrow`.
- **Size:** about 120 lines of check.

### T23. Circuit types dialog check and screenshots
- **Depends on:** T08.
- **Files:** `r7-t23-check.mjs` (work folder).
- **What it checks:** open "Circuit types" from the menu; the two new fields show with the placeholder of the library value; type 12 in "Most terminals", Tab, Save: `listCircuitTypes()` shows 12 and `exportProject()` has the field; type 0: the error text shows and Save is disabled; clear the field: the field is absent in the export; reload and Open: the value stays; 400 px width has no horizontal scroll.
- **Screenshots:** `T23-types-limits`, `T23-types-error`.
- **Size:** about 70 lines of check.

### T24. The part check
- **Depends on:** all tasks above. **Waits for nothing.**
- **Files:** `.claude/roadmap/browser/r7-check.mjs` (new). No product code.
- **What it does** (run 1: 1600 by 1000, English, `01_arch_first_floor.pdf`):
  1. Setup with `buildCircuitProject`. Baseline: the export JSON, `canUndo`, `isDirty`.
  2. The dialog (T18 steps 2 to 9) with real controls. Independent proofs 1 to 6.
  3. The numbers: the sum of terminals of the new circuits equals the placed count in the result line; the load of each circuit equals the sum of its terminal capacities (`computeCircuitCapacity`).
  4. A second run for a second panel (T20 in short).
  5. Save and load (T21 in short); `schemaVersion` is 22.
  6. A file of schema 21 loads; the dialog runs on it.
  7. Run 2: 400 px wide. Run 3: dark mode (a screenshot for the UI reviewer).
  8. A run on the 10A drawing (`detect('100')`, local file; skipped with a message when absent): the time of `planCircuits` is printed and compared to 500 ms.
  9. The segments, fittings and stamps of the export are the same before and after the run. No page error.
- **Screenshots:** `T24-dialog`, `T24-preview`, `T24-placed`, `T24-second-panel`, `T24-dark`, `T24-narrow`, `T24-10A`.
- **Verify (the tester runs each command alone):**
  1. `pnpm --filter @mepapp/core test`
  2. `pnpm --filter @mepapp/ui test`
  3. `pnpm typecheck`
  4. `pnpm build` fresh (the tester reports the cached count)
  5. `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r7-check.mjs` exits 0.
  6. **No regression:** `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs`, `r5-check.mjs` and `r6-check.mjs`, one command each, each exits 0.
- **After the check:** the director marks R7 done in this file, with the commit of each task and the verification, in the style of `auto-routing-r6.md`. The director changes §8 of `auto-routing.md` for R7.

## 6a. Hand-checked values

(The test authors copy these values; they do not compute them with the code under test.)

1. **Packing, spanRooms true, maxTerminals 4.** Three dry rooms A, B, C at distance 5 m, 8 m and 12 m from the panel. A has 2 sockets, B has 2, C has 3. Next-fit in distance order: circuit 1 = A + B (4 terminals). C does not fit in circuit 1 (7 > 4), so circuit 2 = C (3 terminals). Result: 2 circuits, 7 terminals.
2. **Same input, spanRooms false.** Three circuits: A (2), B (2), C (3).
3. **Room split.** One room with 10 sockets and maxTerminals 4, spanRooms true: circuits of 4, 4 and 2 terminals, all with `room-split`. The first circuit holds the first 4 terminals of the nearest-neighbour chain, which starts at the terminal nearest to the panel.
4. **Wet and dry.** Lighting limit 20. A toilet (wet) with 2 luminaires and an office (dry) with 3. Result: 2 circuits (2 and 3 terminals), not 1 circuit of 5. The toilet circuit has `rcdMilliamps` 30. The office circuit has none.
5. **Load with diversity.** maxLoad 1000, diversityPercent 50, terminals of 300 each in one room: the raw limit is 2000, so 6 terminals fit (6 x 300 = 1800 <= 2000) and a 7th (2100) does not. Result: circuits of 6 and the rest.
6. **Own circuit.** Threshold 2000, a socket with capacity 3500 and 5 plain sockets in the same room, maxTerminals 8: 2 circuits: one with the 3500 socket (`own`) and one with the 5 sockets.
7. **No power.** 4 auto-placed luminaires with no capacity and a load limit 100: the load is 0, the limit is not reached, and the Note `terminal-without-power` counts 4.
8. **Next-fit against first-fit.** Rooms R1 (3), R2 (3), R3 (1) in distance order, maxTerminals 4, spanRooms true. Next-fit: R1 opens circuit 1 (3). R2 does not fit (6 > 4), so circuit 1 closes and circuit 2 opens with R2 (3). R3 fits circuit 2 (3 + 1 = 4). Result: {R1} and {R2, R3}. First-fit would give {R1, R3} and {R2}.

## 7. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T01 | yes (loader, step 22) | no | yes (and typecheck) | no | none |
| T02 | yes | no | yes | no | none |
| T03 | yes | no | yes | no | none |
| T04 | yes | no | yes | no | none |
| T05 | yes | no | yes | no | none |
| T06 | yes | no | yes | no | none |
| T07 | yes | no | yes | no | none |
| T08 | no | yes | yes | in T23 | in T23 |
| T09 | no | yes | yes | no | none |
| T10 | no | no | yes (and typecheck) | in T12 | none |
| T11 | no | no | yes (and typecheck) | in T12 and T13 | none |
| T12 | no | no | no | `r7-t12-check.mjs` | none |
| T13 | no | no | no | `r7-t13-check.mjs` | none |
| T14 | no | yes | yes | `r2-check.mjs`, `r6-check.mjs` | none |
| T15 | no | yes | yes | no | none |
| T16 | no | yes | yes | in T18 | in T18 |
| T17 | no | yes | yes | in T18 | in T18 |
| T18 | no | yes | yes | `r7-t18-check.mjs` | `T18-*` |
| T19 | no | no | yes (and typecheck) | in T18 | none |
| T20 | no | no | yes | `r7-t20-check.mjs` | `T20-*` |
| T21 | no | no | yes | `r7-t21-check.mjs` | none |
| T22 | no | no | yes | `r7-t22-check.mjs` | `T22-*` |
| T23 | no | no | yes | `r7-t23-check.mjs` | `T23-*` |
| T24 | yes | yes | yes (fresh) | `r7-check.mjs`, `r2` to `r6` checks | `T24-*` |

The check scripts live in the work folder of the task, except `r7-lib.mjs` and `r7-check.mjs`, which stay in `.claude/roadmap/browser/`.

Dialogs that are new or changed, and their screenshots for the dashboard: the Make circuits dialog (`T18-circuits-preview`, `T18-circuits-classify`, `T18-circuits-placed`, `T18-circuits-nopanel`, `T18-circuits-narrow`, `T18-circuits-settings`, `T18-circuits-calculating`, `T20-second-panel`, `T20-none-to-place`, `T22-wet-circuits`, `T22-own-circuit`, `T22-notes`, `T22-dark`, `T22-narrow`, `T24-dialog`, `T24-dark`, `T24-narrow`), the Circuit types dialog (`T23-types-limits`, `T23-types-error`), the plan on the canvas (`T20-circuit-lines`, `T24-placed`, `T24-10A`) and the Route dialog after the T14 extraction (`r2-check.mjs` screenshots, unchanged).

## 8. Where R7 stops and what comes after

R7 gives: schema step 22 (the circuit type limits), the candidate finder, the packing planner `planCircuits`, the scene methods `planCircuits` and `applyCircuits`, the "Make circuits" dialog, the settings storage, and the checks. R7 is the last part of the road map (R2 to R7).

Not in R7 (later, after the main routing feature):
- balance of the phases L1, L2 and L3 (Q-R7-09);
- breaker rating, cable section and cable length from the load (`device.ratingA` is set only from a value that the user typed);
- a check of the total load of the panel against its main device;
- fixed appliances that are equipment stamps (Q-R7-06);
- a power on each stamp definition (Q-R7-03 C);
- a remove button for the circuits of the last run (Q-R7-07 B);
- sections of a panel (`PanelSection`): R7 sets none;
- a custom circuit name (`customName`) from the room name: the circuit label belongs to the Label feature;
- circuits across several floors or several PDF files (D-R2-02);
- the electrical schematic (`electrical-schematic-templates.md`).

## 9. Risks and what is not verified

- **R-1 The limit values are not from a source.** Lighting 20 and Sockets 8 are planner values. NEN 1010:2020 and IEC 60364 set no count. The dialog says "design practice". The user changes them in the Circuit types dialog.
- **R-2 No power on auto-placed terminals.** Light and Sockets get no capacity from Auto-place (`placement-rule.ts:529`). The load limit does nothing for them. Only the count limit works (Q-R7-03 A). A user who expects a load limit sees a Note.
- **R-3 Classification is manual for hand-placed terminals.** With Q-R7-02 A, a drawing with only hand-placed terminals needs a choice for each stamp definition at each run. The dialog keeps the choices in memory for the session only.
- **R-4 Room quality.** Wrong room outlines (`open: true`) put a terminal in the wrong room or in no room. The "outside rooms" check box covers the second case. 13 of 34 room shapes of the 10A drawing are within 15 % (memory note "Room detection Phase 8"; not verified here).
- **R-5 The device is a whole-object override.** A plain `{ rcdMilliamps: 30 }` would drop the curve and the rating of the panel default (`circuit.ts:26`). T11 and T13 step 5 cover it. A side effect: the whole-object override also pins the `ratingA` of the panel default on the circuit (the merged device copies it), so a later change of the panel default rating does not reach these circuits. The Make circuits dialog says so in the check box hint.
- **R-6 The RCD rule comes from a secondary source.** IEC 60364-4-41 clause 411.3.3 was not read in the original. The wet-room clause is not verified. The check box lets the user turn the default off.
- **R-7 Units.** `terminalCapacities` has no unit (gap G16). A circuit type in W with a terminal capacity in another unit adds numbers of different units. R7 shows the unit of the type and does not convert (P-R7-UNITS). Capacities of Auto-place before R5 can be in another unit.
- **R-8 Circuit types are not in undo.** `ProjectDocument.circuitTypes` is a plain array (`project.ts:42`). Undo of a run does not touch it, and R7 does not change it. T23 checks the dialog separately.
- **R-9 Id counters.** `nextCircuitSeq` is not undone. After an undo a new run gets higher ids. This is harmless, and the reload re-seeds the counters (memory note "segment id reseed").
- **R-10 The room list extraction (T14) can break the Route dialog.** The test ids stay. The `r2-check.mjs` and `r6-check.mjs` runs prove it.
- **R-11 Performance.** The packing is linear after the sort. A drawing with 2000 terminals must plan in under 500 ms. T24 step 8 measures it on the 10A drawing. Not measured.
- **R-12 Multi-page PDF.** The refusal needs a real multi-page fixture for the browser check. A fixture may not exist (D-R2-03). The tester then reports NEEDS_CONTEXT for that step.
- **R-13 Not verified.** The default values (section 3), the claim that no code reads `defaultCapacity` as a limit (T02 repeats the search), the wet room clause, and the 10A numbers (local file only).
- **R-14 Stacked dialogs.** One Escape closes stacked dialogs (R5 R-22). Not changed.
- **R-15 Two diversity factors.** The planner uses the `diversityPercent` of the circuit type. The new circuit inherits the one of its panel (T11). If they differ, the circuit load that the user sees in the tree uses the panel value, and the limit check used the type value. R7 shows no Note for this.

## 10. Revision log

| Date | Change |
|---|---|
| 2026-10-19 | **Revision 1** after the audit (18 findings). `planCircuits` takes ready `CircuitLimits`; T06 and T07 do not depend on T02; only Q-R7-01 blocks T01. `maxLoad` is null for `defaultCapacity` 0 or no library entry. T08 lists the five state places. Next-fit replaces first-fit (value 8). T14 gets label and count-column props. T19 runs before T17 and T18. Diversity rule stated (T11, R-15). T12 uses `convertStampToPanel`. All [data model] options join step 22. Fire Alarm 30 and Emergency Lighting 20 in Q-R7-04. Panel stamps are not counted as equipment. Settings and "Calculating…" screenshots added. "Left" is a count of terminals. R-5 notes the pinned `ratingA`. Search claim, App line numbers and section 6a fixed. Changed question text: Q-R7-01 A (diversity), Q-R7-03 C and Q-R7-08 B (step 22), Q-R7-04 B (four limits). |
| 2026-10-19 | First version by the road map planner. 24 tasks (T01 to T24), nine questions for the user (Q-R7-01 to Q-R7-09), twelve provisional choices (P-R7-*). Nothing is started. |
