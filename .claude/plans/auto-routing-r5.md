# R5 plan: sizing of the network (a flow unit and a sizing method on each network type)

Status: written 2026-10-17 by the road map planner, on the branch `worktree-agent-framework` after R4 (R4 done, last commit `179a88e`). Not yet audited.
Origin: `roadmap-overview.md` (R5 text, sections 0 to 6, gaps G4, G5, G6, G13, G14, G15, G16, decisions D-R5-01 to D-R5-05), `auto-routing-r4.md` and `auto-routing-r3.md` (format, and what they built), `.claude/roadmap/rules.md`, `.claude/roadmap/protocol.md`.
Answers of the user that bind this plan (final):
- **D-R5-01 C.** A flow unit on each network type, with a conversion table in core.
- **D-R5-02.** The velocity and pressure-drop method is for air networks only. The user picks the sizing method as an option on the network type. Hydraulics and plumbing use other methods.
- **D-R5-03.** The settings are properties of the network type: one optional field `sizing` (a union with a `method` key).
- **D-R5-04.** Stamps with two flows, risers and other non-typical cases are out of scope. The user comes back to them after the main routing feature.
- **D-R5-05 B.** R5 sizes water too. The user enters the delta T. There is no default.
- **Schema step 19** holds the two new optional `NetworkType` fields (`flowUnit`, `sizing`) in one step. The default comes from the clean-up on load, as schema 18 does.
- **No new Dutch text** anywhere in the UI (user note 2026-10-17, section 11 of the R4 plan). New texts have English only.
- **Dashboard screenshots** of every new or changed dialog. Each UI task names its screenshots.
- The **layout rule of routed segments** (orthogonal and 45 degrees) belongs to R6. R5 does not touch it.
- R5 sizes an **existing network** (drawn or routed), 2D draft. It takes a start stamp as input and passes it to `solveFlow` as `rootElementId`. R6 calls it later.

Code claims carry `path:line`. Paths start at the repository root. Line numbers are from commit `179a88e` and can move.
Read `.claude/roadmap/rules.md` first.

Terms (the terms of `roadmap-overview.md` and of the plans R2 to R4 apply). The plan uses the word "network" only. New terms:
- **Flow**: the amount of fluid or energy that a terminal carries. It is a number in a flow unit.
- **Flow unit**: the unit of the capacity numbers of a network type. It is a volume flow (for example dm³/s or m³/h) or a power (W or kW).
- **Conversion table**: a constant in core. It holds the factor of each flow unit to an SI base (m³/s for a volume flow, W for a power).
- **Sizing method**: the rule that turns a flow into a size. R5 has two: `air` and `water`. A network type with no method is not sized.
- **Sizing settings**: the limits and choices of one method. They are stored on the network type.
- **Size series**: the list of sizes that exist in the shop. The sizing picks the smallest size of the series that meets all limits.
- **Specific pressure drop**: the pressure loss for each metre of duct or pipe, in Pa/m.
- **Equivalent diameter**: the diameter of a round duct that has the same flow and the same specific pressure drop as a rectangular duct (Huebscher formula, section 3.2).
- **Delta T (ΔT)**: the temperature difference between the flow and the return of a water network, in K. The user enters it.
- **Start stamp** and **start port**: the equipment stamp and its port where the network begins. They are input of the Size command. The app does not store them.
- **Sizing result**: the sizes that the pure function calculates, with the problems. It is not stored. Only the sizes written to the segments are stored (in the existing fields).

## 0. Questions, provisional choices, and what blocks

### Questions for the user (data model; the batch did not cover them)

Rule of the brief: a stored field or a changed meaning of a stored number that the batch did not cover is a question. The planner does not decide it. The plan shows which tasks wait for the answer. All other tasks can run now.

- **Q-R5-01 [data model]. In which unit is a stored capacity?** (This is gap G16 and P-R5-01 of the overview.) A capacity is a number in `ProjectDocument.terminalCapacities` (`packages/core/src/project.ts:33`). It has no unit. Auto-place writes the capacity in the unit of the placement rule (`scene.ts:2862`, `ruleUnitOf`, `packages/core/src/rooms/placement-rule.ts:186`). The rules live in `localStorage` (`mepapp.placementRules.v1`, `packages/ui/src/placementRuleStorage.ts:8`), not in the project file, and a stamp placed by hand has no rule. So R5 cannot find the unit of an old capacity from the file. Options:
  - **A.** A capacity is always in the flow unit of the network type of the segment at its port. Auto-place converts the number into that unit when it writes it (task T12). The dialogs and the Properties panel show the unit (T17). No stored field. **Cost and hazards:** (1) A number written before R5 is read in the unit of its network type. (2) The unit can change later. The editor saves a new `flowUnit` and does not convert the stored capacities. The usual order is: Auto-place writes in the unit of the rule (for example m³/h), then the user sets `flowUnit` to dm³/s. Every capacity is then wrong by the factor 3.6, with no message. T12 converts only when `flowUnit` already exists, so it does not help here. (3) The library labels say CFM and GPM (`packages/core/src/network-type-library.ts:11`-`:18`, `defaultCapacity` 400). A number that the user typed by hand may mean CFM. The Size dialog says which unit it reads, but that alone does not remove hazard (2).
  - **B.** Store a unit for each capacity: a new field (for example `terminalCapacityUnits: Record<string, string>`) and a new schema step. Cost: a new stored item and a second schema step. A change of `flowUnit` then converts nothing wrongly, because each number keeps its own unit.
  - **C.** Read the rule through `autoPlaced.ruleId`. Not possible for hand-placed stamps, and the rules are not in the file. Not recommended.
  - **D.** A fixed canonical unit for each kind: dm³/s for a volume flow and W for a power. No field. A stored number means the canonical unit. The meaning of old numbers changes once (a number written by Auto-place in m³/h or kW is then wrong until the user fixes it). Auto-place always converts into the canonical unit. `NetworkType.flowUnit` then only sets the unit that the dialogs show and accept (they convert on entry). Cost: it weakens D-R5-01 C (the user chose a unit on each network type), because the stored unit is the same for all types.
  - **E.** Option A, with a guard: when the user changes `flowUnit` from one unit to another of the same kind, and capacities of elements on that type exist, the editor asks in the dialog (not `window.confirm`): "Convert {n} stored capacities from {old} to {new}?" with the buttons "Convert" and "Keep numbers". "Convert" rewrites the capacities (task T14c). From "Not set" to a unit nothing converts (the old unit is unknown); the editor shows the Note "Existing capacities of this type are read as {unit}." A change between a volume unit and a power unit converts nothing and shows a Warning. No new stored field.
  - **Recommendation now: E.** Reason: it keeps D-R5-01 C (a unit on each type) and adds no stored field, and it removes the silent factor error of hazard (2). A alone is not safe. D is the simplest and most robust choice if the user accepts one fixed unit for all types and a one-time meaning change; B is the exact choice if the user wants old files to keep each unit. The user decides.
  - **Blocks:** T10b (scene read), T12 (Auto-place conversion, for A and E), T14c (conversion in the editor, E only), T17 (unit label). The pure core (T01 to T08) takes the unit from a function `capacityUnitOf`, so it is right for every option.
- **Q-R5-02 [data model]. In which unit are `Segment.diameter`, `width` and `height`?** The Properties panel labels them "Diameter (pt)", "Width (pt)", "Height (pt)" (`packages/ui/src/components/PropertiesPanel.tsx:248`, `:258`, `:266`). Their defaults are 200, 400 and 300 (`PropertiesPanel.tsx:48`-`:51`, copied from the old app, where they were millimetres; the comment says "Segment.cs: Diameter 200.0"). Nothing in core or render reads them (a search of `packages/core/src` and `packages/render/src` finds `.diameter` only in `scene.ts:1302` and the model). So the unit is a label only. The overview assumed millimetres. A real size is in millimetres (a 630 mm duct). Options:
  - **A.** Keep "pt". R5 converts mm to page points with the calibration of the page (`pageUnitsPerRealUnit`, `packages/core/src/calibration.ts:57`; `mmPerPt = 1 / pageUnitsPerRealUnit`). Sizing is refused on a page with no calibration. Cost: a new calibration of the page changes the real size that the number means.
  - **B.** The fields hold millimetres. The Properties labels change to "(mm)". R5 writes mm and needs no calibration. Cost: a number that an older file holds under the label "pt" is read as mm. The defaults 200/400/300 read as mm, which is what the old app meant.
  - **Recommendation: B.** Reason: a duct size is a physical size. It must not change when the user changes the scale. Nothing reads the old numbers. No new field and no schema step in both options.
  - **Blocks:** T11 (scene write) and the label change in T17. The sizing functions return millimetres in both options.
- **Q-R5-03 [data model, not blocking]. A role on the network type (supply, return, exhaust).** A network type has no direction or role (gap G6, `packages/core/src/network.ts:22`-`:33`). Two things need it:
  - The balance report of the overview (supply against return plus exhaust, a warning only). Guessing from the ids `supply-air` and `return-air` fails for custom types.
  - A **correctness effect for water.** The library has one `heating-water` type and one `chilled-water` type for flow and return (`network.ts:146`-`:150` says the water case). When a port group joins the flow port and the return port of a stamp, the two pipes are one network of one type, and `solveFlow` adds the power twice. Sizing then oversizes every pipe by up to a factor 2, with no message. R5 can warn about this case (P-R5-21) but cannot know which pipe is the return pipe.
  - Options: **A.** No role, no balance report. R5 warns when the start stamp has segments on two ports of one network (P-R5-21) and shows the standing Note "Supply and return pipes must be separate networks." **B.** A new stored field `role` on `NetworkType` (`'supply' | 'return' | 'exhaust'`), a schema step, and the balance report. **C.** No new field: the Size dialog lets the user mark, at run time, the start port of the return network ("also size the return network from this port"). The app stores no grouping (the model of the overview). The mark is used for the balance report in the dialog only and is not stored.
  - **Recommendation: A for R5 v1, C if the user wants the balance report.** Reason: A and C add no stored field. B is the exact choice but needs a schema step and a new editor field. The correctness warning (P-R5-21) works with A.

### Provisional choices (easy to reverse; the director takes them without a stop)

| Id | Choice | Reason |
|---|---|---|
| P-R5-01 | The fields are `NetworkType.flowUnit?: FlowUnitId` and `NetworkType.sizing?: SizingSettings`. Absent means "not set". The library types (`packages/core/src/network-type-library.ts:11`-`:23`) carry neither. | D-R5-01 C and D-R5-03. A library entry with no field keeps old files and the library unchanged. The editor offers suggested values (P-R5-04). |
| P-R5-02 | The method ids are `air` and `water`. "No method" is an absent `sizing`. | One key per method gives each method its own settings (D-R5-03). |
| P-R5-03 | The editor offers the method `air` for the discipline ventilation only and `water` for the discipline heating and cooling only. Plumbing, drain (sanitary waste), fire protection, electrical and other get no method in R5 v1 and the editor offers neither `air` nor `water` to them. There is never an automatic fallback to another method. | D-R5-02: plumbing uses other methods (loading units, section 3.3). Easy to widen. Round 1, item 12. |
| P-R5-04 | Suggested values (the user presses a button to fill them; they are not applied by themselves). Air: flow unit dm³/s, maximum velocity **5 m/s**, maximum 1.0 Pa/m, round, standard series, aspect ratio 4. Water: flow unit kW, maximum velocity 1.0 m/s, maximum 200 Pa/m, no delta T. The Size dialog states that the velocity limit applies to every segment. | Sources in section 3.3 are secondary. The user edits all values. One limit for every segment is a simplification: public-building guidance gives about 5 to 8 m/s for mains, 2.5 to 3 m/s for branches and 1.2 to 2.3 m/s at terminals (secondary, not verified). A limit for each depth of the network is deferred (D-R5-04). Constants `SUGGESTED_AIR_SIZING` and `SUGGESTED_WATER_SIZING` in core. |
| P-R5-05 | Air constants in core, not settings: density 1.2 kg/m³, kinematic viscosity 1.5e-5 m²/s, roughness 0.09 mm (galvanized steel). | Textbook values for 20 °C. Not read from a source in this session. The user cannot change them in v1. |
| P-R5-06 | Water constants in core, not settings: specific heat 4186 J/(kg·K), density 1000 kg/m³, kinematic viscosity 1.0e-6 m²/s, roughness 0.045 mm (steel). | Textbook values for 20 °C. The error at 60 °C is about 2 % in density. Not read from a source in this session. |
| P-R5-07 | The friction factor uses the Swamee-Jain formula for Re ≥ 2300 and 64/Re below. | An explicit formula with no iteration. Section 3.2. |
| P-R5-08 | Round duct series `standard`: 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250 mm (the recommended sizes of EN 1506). Series `free`: the next multiple of 10 mm. Rectangular sides: 100 to 2000 mm in steps of 50 mm. Pipe series: DN 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300. | Section 3.2. The rectangular step and the DN list are not verified against a standard. The values are constants. |
| P-R5-09 | **The smaller option:** no material table. The inner diameter of a pipe is the DN number in mm and the segment gets the DN number. The Size result block always shows the plain line "Pipe sizes are DN. The inner diameter is taken as equal to the DN. Check copper and plastic pipe." (key `pipeNote`, not a hint). | A material table (steel, copper, PEX: inner diameters and roughness) is a new setting of the water method, with data that this session cannot verify. The line is plain because the error is large for small pipes: copper 15 × 1 has an inner diameter of 13 mm and PEX 16 × 2 has 12 mm, so the real velocity is 30 to 60 percent higher and the drop about twice as high (figures from the audit, not verified). The table is the first item of the later list (section 8). |
| P-R5-10 | The smallest size of the series that meets every limit wins. A rectangular duct: the smallest area wins; on a tie the smaller aspect ratio wins. The width is the longer side. | A reducer-friendly and simple rule. |
| P-R5-11 | A segment with a flow of 0 or with an unresolved flow gets no size. The dialog counts these segments. A network where no segment has a flow is refused. A segment with no new size **keeps its old size**, which is often the default 200 / 400 / 300 (`packages/render/src/tools/drawSegmentTool.ts:126`). So before the write the dialog says "{n} segments are not sized and keep their old size." and "{N} segments get a new size. A size that you typed by hand is overwritten.", and when any segment of the network is unsized it asks for a confirm inside the dialog (not `window.confirm`, T15b). | Writing a size from no data would hide a missing capacity. A silent old size looks like a result. |
| P-R5-12 | The sizing changes the segments of the network of the start port only, as one undo step named "Size network". It does not change the selection. | One network at a time, like the Route command. |
| P-R5-13 | The command is "Size network…" in the main menu, after "Route network…" (`packages/ui/src/components/MenuButton.tsx:159`-`:173`). The dialog is `SizeDialog.tsx`. It uses the CSS classes of the route dialog (right side, clear backdrop, `closeOnBackdropClick={false}`). | Reuse before new (`RouteDialog.tsx:152`-`:157`). |
| P-R5-14 | The Size dialog does not use the open-port logic of R2. It lists the equipment stamps that have a segment on at least one port, and for the chosen port it reads the network type from the segment. The user does not pick the type. | Rule 1: the segment defines the network type of the port. The existing `startCandidates` (`packages/ui/src/components/routePlan.ts:15`) gives the equipment list. |
| P-R5-15 | New texts go into a new file `packages/ui/src/components/sizePlan.ts` with an English table and a function `sizeText(key, params)`. The severity labels reuse `routeText('en', 'severityError' ...)`. | `routePlan.ts` has 469 lines. A second table in the same file would grow it. The Dutch table of R2 to R4 stays as it is. |
| P-R5-16 | A stamp with more than one flow is not sized separately. The dialog shows one Note line when a stamp of the network has routing targets of two or more different network types: "Stamps with two flows use one capacity here." The dialog always shows the Note "Sizes are for this file only. A riser through other floors is not added up." | D-R5-04 A. The overview says R5 must say so on screen. |
| P-R5-17 | An invalid `sizing` or `flowUnit` in a file is dropped as a whole on load (never half-kept). | The clean-up of schema 18 does the same for `routingTargets` (`packages/core/src/project.ts:399`-`:405`). |
| P-R5-18 | After "Size network" the dialog shows the count of segments for each size. The plan shows no size label. The user reads a size in the Properties panel. | Size labels on the plan belong to the Label feature (phases 5 to 7 open). |
| P-R5-19 | `NetworkType.units` (a display label, shown at `packages/ui/src/components/StampsPanel.tsx:457`) and the new `flowUnit` both hold a unit for one type. Decision: `units` stays stored and unchanged (old files, library labels CFM and GPM). `StampsPanel` shows the label of `flowUnit` when it is set, else `units`. Nothing reads `units` for a calculation. Task: T14a (one line in `StampsPanel.tsx`). | Rule 3: one visible unit for one type. No second copy of the state is kept in sync. Easy to reverse. |
| P-R5-20 | A network with segments of more than one network type: `sizeNetwork` takes the type from the segment at the start port, never changes a segment of another type, and gives those segments no size. It reports the warning `mixed-type` with their ids. | `computeNetworks` joins different types at a shared fitting or port and the first segment wins (`packages/core/src/network.ts:146`-`:155`). A size by the settings of the wrong type is worse than no size. |
| P-R5-21 | Water return pipe. The dialog shows the standing Note "Supply and return pipes must be separate networks." for the `water` method. `sizeNetwork` gives the warning `start-two-ports` when the network holds segments on two or more different ports of the start stamp and the method is `water`. | Q-R5-03: no role on the type, so the app cannot know the return pipe. The warning catches the usual case (a port group over flow and return). |
| P-R5-22 | The Size dialog states the fluid: "Water at 20 °C, no glycol." (water method) and "Air at 20 °C." (air method). A fluid setting is deferred. | P-R5-05, P-R5-06. A glycol mixture changes density and viscosity. |
| P-R5-23 | The unit `gpm` is the US gallon per minute. Its id and label are `US gpm`. | A bare "gpm" hides the difference to the imperial gallon. |
| P-R5-24 | The Size dialog recalculates on the events `pageChanged`, `documentActivated`, `drawingChanged`, `flowSolved` and `networkTypesChanged`. | `setTerminalCapacity` and `setCapacityForSelection` emit only `selectionChanged` and `flowSolved` (`scene.ts:2917`-`:2925`, `:3090`), not `drawingChanged`. The dialog has a clear backdrop, so the user can type a capacity while it is open. |
| P-R5-25 | The network type editor dialog is titled "Network type: {name}" (was "{name} visuals", `NetworkTypeEditorDialog.tsx:48`-`:60`). | It now edits more than the visuals. |

## 1. Goal

The user opens "Size network…", picks an equipment stamp and one of its ports that has a segment, and sees the network type of that segment. The dialog calculates the flow in each segment of that network from the capacities of its terminals, with the start stamp as the root. It shows the total flow, the problems, and the count of segments for each size. The user presses "Size network". The app writes a size on each segment with a flow (diameter, or width and height) in one undo step.

Each network type has a flow unit and a sizing method with its settings. The user sets them in the network type editor. A network type with no method is refused with a clear line and a button to open the editor.

The method `air` uses a maximum velocity and a maximum specific pressure drop, round or rectangular, a maximum aspect ratio and a size series. The method `water` uses a maximum velocity, a maximum specific pressure drop and a delta T (when the flow unit is a power).

Where R5 stops: R5 sizes a network that already exists. It makes no segment, it does not route, and it does not change a network type or a routing target. R6 calls the core function after it routes. R5 shows no size on the plan.

## 2. What exists now

| Item | Where | Use in R5 |
|---|---|---|
| `NetworkType`: `id`, `name`, `discipline`, `units` (display label), `defaultCapacity`, `color`, `lineWidthPt`, `linePattern` | `packages/core/src/network.ts:22`-`:33` | The two new optional fields go here. `units` stays a display label that nothing reads for the flow. |
| `Segment`: `shape`, `diameter?`, `width?`, `height?`, `material?` | `network.ts:48`-`:64` | R5 writes `diameter`, or `width` and `height`. The unit: Q-R5-02. |
| Library types, with the labels CFM and GPM | `packages/core/src/network-type-library.ts:11`-`:23` | No change. The suggested flow unit for air is dm³/s (the unit of the room demands, `packages/core/src/rooms/room-need.ts:27`-`:28`). |
| `solveFlow`: sums capacities toward the root; `rootElementId`, `rootPortId`, `elementCategories` | `packages/core/src/flow.ts:14`-`:27`, `:57` | R5 calls it with the start stamp and port. R3 already built the exact root match and `rootPortId`. |
| The root choice: an explicit root first (`explicitRootKey`), then the fallback | `flow.ts:96`-`:112` | R5 always gives the root. |
| `ownCapacityOf` adds the capacity of a node element, also of the root | `flow.ts:49`-`:55`, `:118` | A capacity on the start stamp is in `totalCapacity`, not in `segmentCapacity`. R5 sizes from `segmentCapacity`. |
| `FlowResult`: `segmentCapacity` (null = unresolved), `fittingCapacity`, `totalCapacity`, `segmentDirection` | `flow.ts:29`-`:38` | The input of the size pick. |
| The doc comment says "unitless" and that there is no sizing in this module | `flow.ts:1`-`:8` | Stays true: sizing lives in new files. T08b updates the comment with one line. |
| `computeNetworks`, `segmentIdsOfNetworks`, `nodeKeyOf` | `network.ts:156`, `:198`, `:102` | Find the network of the start port. |
| The live solve and the overlay: `recomputeFlow` passes `elementCategories` but no root | `packages/render/src/scene.ts:3079`-`:3092` | Not changed. The live overlay keeps the fallback. |
| `terminalCapacities` (Map in the scene) and its writers | `scene.ts:2917` (`setTerminalCapacity`), `:2862` (Auto-place), `:4488` | The input of sizing. |
| Unit constants `M3H_PER_CFM`, `M3H_PER_DM3S`, `AIR_CHANGE_UNITS`, `isAirChangeUnit` | `packages/core/src/rooms/placement-units.ts:10`-`:12`, `:22`-`:28`, `:31` | The conversion table is built from them (rule 3 of `rules.md`). |
| `CAPACITY_UNITS`, `ruleUnitOf`, `inRuleUnit` (Auto-place units: flow, W, kW) | `packages/core/src/rooms/placement-rule.ts:177`-`:197` | The units that Auto-place writes. T12 converts from them. |
| `ProjectDocument`, `CURRENT_SCHEMA_VERSION = 18`, the step 17 to 18 (version only), the clean-up `withCleanRoutingTargets` | `packages/core/src/project.ts:20`, `:293`-`:303`, `:389`-`:405` | The model of the step 19 and its clean-up. |
| `parseRoutingTargets` | `packages/core/src/stamp.ts:68`-`:73` | The model of `parseSizingSettings`. |
| `migrateToLatest` refuses a newer file | `packages/core/src/schema.ts:69`-`:71` | An older MepApp refuses a file of schema 19. |
| `adoptNetworkTypes` (public), `adoptTypes` (copies `{ ...type }`) | `scene.ts:2416`, `:2423`-`:2437` | Rule 4. A shallow copy would share a nested `sizing` object (risk R-5). |
| `updateNetworkType(id, patch)` (patch type has five fields; `Object.assign`) | `scene.ts:2448`-`:2457` | T09 widens the patch. |
| `duplicateNetworkType` (`{ ...source, ... }`) | `scene.ts:2459`-`:2466` | T09 copies `sizing` by value. |
| `updateSegmentFields` and `updateSegmentsForSelection`: edit one segment or the selection; one transaction | `scene.ts:1350`-`:1360`, `:1369`-`:1383` | The model of the write in T11 (`Transaction`, `markDirty`). |
| `getConnectivity()` gives the segments, fittings and port groups | `scene.ts:1534`-`:1541` | The dialog reads it. |
| `getCalibration(pageIndex)` | `scene.ts:2252` | Only if Q-R5-02 = A. |
| `NetworkTypeEditorDialog`: local draft, Save, `NetworkTypeEditPatch` | `packages/ui/src/components/NetworkTypeEditorDialog.tsx:6`, `:39`-`:46`, `:48`-`:102` | T14a and T14b add a section. |
| `RouteDialog`, `Dialog`, CSS `.mep-modal--route`, `mep-route-*` classes, `closeOnBackdropClick={false}` | `packages/ui/src/components/RouteDialog.tsx:38`, `:152`-`:157` | The model of `SizeDialog`. |
| `startCandidates`, `startPortChoices`, `GRAVITY_TYPE_IDS` | `packages/ui/src/components/routePlan.ts:4`, `:15`, `:53` | Reused for the stamp list. The gravity type `sanitary-waste` has no method anyway. |
| `MenuButton` item "Route network…" | `packages/ui/src/components/MenuButton.tsx:159`-`:173` | The place of "Size network…". |
| Browser helpers: `lib.mjs`, `r3-lib.mjs` (`buildMixedGroupProject` builds a project through `exportProject` and `loadProjectFromJson`), `with-server.mjs` | `.claude/roadmap/browser/` | The shape of `r5-lib.mjs`. |
| `GRAVITY_TYPE_IDS = ['sanitary-waste']` | `routePlan.ts:4` | Drain is out of scope for R5. |

**Where the code differs from the overview** (the plan follows the code):
1. The overview (gap G15, section 3 and the R5 row) says the first R5 task fixes the substring match of the root. R3 already fixed it: `elementIdOf` returns the exact element id and the root test compares exactly (`flow.ts:45`-`:47`, `:96`-`:97`). `rootPortId` exists (`flow.ts:22`-`:24`, `:100`-`:104`). R5 has no such task. T08a keeps a regression test (`stamp-1` against `stamp-12`).
2. The overview assumes millimetres for the segment size. The Properties panel says "pt" (Q-R5-02).
3. The overview says the balance report is a warning in R5. The data model has no role on the network type (Q-R5-03). The plan leaves it out, and adds a warning for the water case where flow and return form one network (P-R5-21).
4. The overview says "the R5 plan states the limits with their sources". Section 3.3 does. The sources are secondary (web search summaries); no primary standard was read (risk R-1).

## 3. Research

### 3.1 What the sizing needs

A network type says what the numbers mean (flow unit) and how to size (method). The sum of capacities toward the start stamp gives the flow in each segment. The method turns that flow into a size. Four parts are new: the conversion of units, the physics of the pressure drop, the size series and the choice of the size. The rest (the sum, the network, the undo step) exists.

### 3.2 Sources and what MepApp uses

All sources were found by web search. Only the search summaries were read, not the standards (risk R-1).

- **Size series of round ducts.** EN 1506:2007, "Ventilation for buildings - Sheet metal air ducts and fittings with circular cross-section - Dimensions" (https://www.buildwise.be/en/standards-and-regulations/standards-regulations/en-1506-en/). The sample copy lists the recommended nominal diameters 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000 and 1250 mm, equal to ISO 7807. A second list (150, 300, 355, 450, 560, 710, 900, 1120 mm) is in use in some countries. MepApp uses the recommended list as `standard`. The table was not checked against the current standard.
- **Equivalent diameter of a rectangular duct.** Huebscher, R.G. (1948), "Friction Equivalents for Round, Square and Rectangular Ducts", ASHVE Transactions 54, p. 101-118. Formula: De = 1.30 (a·b)^0.625 / (a + b)^0.25, with a and b the sides and De in the same unit. The rectangle and its equivalent round duct have the same flow and the same friction rate, not the same area. The rectangle has more free area, so a lower velocity. One source says aspect ratios above 4 : 1 give a friction penalty beyond the formula (ACCA Manual D note, as quoted by a calculator site, e.g. https://hvacptcharts.com/duct-size-calculator/). MepApp uses the formula to find the rectangles that match the round duct, and limits the aspect ratio by a setting (suggested 4).
- **Friction rate for air.** Calculator and guide sites give 1.0 Pa/m for offices, 0.8 Pa/m for quiet rooms, 1.2 Pa/m for industry (https://www.enginist.co/en/guides/ventilation/understanding-duct-sizing, https://www.cky.com.tw/en/insights/duct-design-engineering). A VAV blog gives velocity caps of 2500 fpm upstream and 1500 to 2000 fpm at branches, which is 12.7 and 7.6 to 10.2 m/s (https://industrialmonitordirect.com/blogs/knowledgebase/vav-duct-sizing-velocity-and-friction-rate-guidelines). The summary found no primary standard for a velocity cap. A guide for public buildings (secondary, not verified) gives about 5 to 8 m/s for mains, 2.5 to 3 m/s for branches and 1.2 to 2.3 m/s at terminals. MepApp suggests 1.0 Pa/m and 5 m/s for every segment and lets the user change them (P-R5-04).
- **Friction factor.** Darcy-Weisbach: Δp/L = f · (ρ v² / 2) / D. For f, Swamee and Jain (1976) give an explicit formula for the Colebrook equation: f = 0.25 / [log10( ε/(3.7 D) + 5.74 / Re^0.9 )]², good for about 5000 < Re < 1e8. Below Re 2300 the flow is laminar: f = 64/Re. Not read from the original paper; the formula is from the planner's knowledge. T02 checks it against a hand value (section 6, T02).
- **Water pipes.** Search summaries give: heating circuits keep 0.5 to 1.0 m/s in small pipes and at most 1.5 m/s (https://www.h2xengineering.com/blogs/pipe-sizing-for-heat-pump-systems-worked-example/, https://www.heatweb.co.uk/w/index.php?title=Pipework_Calculations); a pressure drop of 100 to 200 Pa/m is typical, 250 Pa/m an acceptable ceiling, 160 Pa/m a common default (https://kalkulatorpro.pl/en/ogrzewanie/srednice-przewodow/); CIBSE allows 350 Pa/m, and a Hong Kong lecture uses 400 Pa/m above 50 mm (https://www.heatweb.co.uk/w/index.php?title=Pipework_Calculations, http://ibse.hk/spd5132/SPD5132_1617-02.pdf); district heating mains run 1.0 to 1.5 m/s (https://vicus-software.com/en/knowledge/network-design/pipe-dimensioning/). Hot water needs lower velocity than cold water because of erosion. MepApp suggests 1.0 m/s and 200 Pa/m and lets the user change them. The user must check the governing standard.
- **Water flow from power.** q = P / (cp · ρ · ΔT) (D-R5-05 B). Constants: section 0, P-R5-06. Not read from a source in this session; the values are common textbook values.
- **Domestic water and drains use other methods (out of scope).** EN 806-3 (simplified method) sums *loading units* (1 LU = a draw-off flow of 0.1 l/s) from the last draw-off point upstream and reads the pipe size from material tables (https://standards.iteh.ai/catalog/standards/cen/c600c378-b062-40b9-a0fa-f6a8b719ead1/en-806-3-2006). It excludes hot water return pipes. For drains, the search found nothing on EN 12056-2; the planner knows that it uses *discharge units* and a filling degree, not a flow sum (not verified here). So the sum of `solveFlow` is not enough for these networks: they need a unit per fixture, not a capacity. R5 gives them no method.

What MepApp can use: all constants and the two formulas, as pure functions in core with unit tests. Nothing needs a new dependency.

### 3.3 The methods R5 builds, in one place

| Kind of network | Method | Limits | Status |
|---|---|---|---|
| Air (supply, return, exhaust) | `air`: smallest size of the series with v ≤ maximum and Δp/L ≤ maximum (equal-friction limit) | maximum velocity, maximum Pa/m, shape, aspect ratio, series | built in R5 |
| Heating and cooling water | `water`: flow from power and ΔT, smallest DN with v ≤ maximum and Δp/L ≤ maximum | maximum velocity, maximum Pa/m, ΔT | built in R5 |
| Domestic water | loading units (EN 806-3) | not a flow sum | out of scope; later |
| Drain | discharge units (EN 12056-2, not verified) | not a flow sum | out of scope; later |
| Fire protection | hydraulic calculation by hazard class | other inputs | out of scope; later |
| Electrical (conduit, cable tray, circuits) | cable section and breaker | not a flow | out of scope (R7 owns circuits) |

### 3.4 What a worked example gives (hand values of the planner, not a source)

Used as test values with a tolerance. The implementer recomputes them and compares.
- Round duct 200 mm, 0.1 m³/s (100 dm³/s), air with the constants of P-R5-05 and the formula of P-R5-07: v = 3.18 m/s, Re ≈ 42 441, f ≈ 0.0231, Δp/L ≈ 0.70 Pa/m. The minimum diameter D* for 1.0 Pa/m is about 186 mm, so the standard series picks 200 mm. 0.02 m³/s gives D* ≈ 102 mm and the pick 125 mm. (Round 1 corrected the first values of this plan, 0.0278 and 0.84, which did not follow from its own formula.) **The implementer must never change the formula or a constant to hit a hand value.** If the code gives another number, the implementer reports it.
- Rectangle 400 × 200 mm: De ≈ 305 mm.
- Water: 10 kW, ΔT 10 K: q = 10000 / (4186 · 1000 · 10) = 2.389e-4 m³/s = 0.239 l/s. With roughness 0.045 mm and viscosity 1e-6 m²/s (P-R5-06) and the inner diameter equal to the DN: DN 15 gives v 1.35 m/s and 1938 Pa/m; DN 20 gives v 0.76 m/s and 462 Pa/m (above 200); DN 25 gives v 0.49 m/s and 154 Pa/m. So the pick is **DN 25, governed by the pressure drop**. The pressure limit governs small water pipes; the velocity limit rarely does. A tree of 4 terminals of 5 kW (q = 4.78e-4 m³/s) gives 546 Pa/m in DN 25, so the main is DN 32. These values come from the audit; the implementer recomputes them (same rule: never bend the formula).

## 4. The model

### 4.1 Stored data

R5 stores two new optional fields on `NetworkType`, in one schema step.

```ts
// packages/core/src/network.ts
export interface NetworkType {
  // existing fields ...
  /** The unit of the capacity numbers of this type (flow-units.ts). Absent = not set. */
  flowUnit?: FlowUnitId;
  /** How to size a network of this type. Absent = not sized. */
  sizing?: SizingSettings;
}
```

- `CURRENT_SCHEMA_VERSION` goes from 18 to 19 (`packages/core/src/project.ts:20`).
- The step 18 to 19 only changes the version number (the fields are optional and "absent" is valid), as the step 17 to 18 does (`project.ts:293`-`:303`). An older MepApp then refuses the file (`schema.ts:69`-`:71`).
- The clean-up on load: `loadProject` maps `networkTypes` through `withCleanSizing` (T05). It drops a `flowUnit` that is not in the table, and a `sizing` that `parseSizingSettings` rejects. It returns the same object when nothing is wrong. This is the pattern of `withCleanRoutingTargets` (`project.ts:399`-`:405`).
- No other field is stored. The sizes go into the existing `Segment.diameter`, `width` and `height` (the unit: Q-R5-02). The flow, the problems and the result are calculated.
- If the user answers Q-R5-01 = B, a second field and a second schema step (20) come, and the R6 mark moves to 21. The director then gives the numbers (overview, "Schema").

### 4.2 Core types

```ts
// packages/core/src/flow-units.ts (new; T01)
import { AIR_CHANGE_UNITS } from './rooms/placement-units.js';

export type FlowUnitKind = 'volume' | 'power';
export type FlowUnitId = 'dm³/s' | 'l/s' | 'm³/s' | 'm³/h' | 'cfm' | 'l/min' | 'US gpm' | 'W' | 'kW';
export interface FlowUnit {
  id: FlowUnitId;
  kind: FlowUnitKind;
  /** Value of 1 unit in m³/s (volume) or in W (power). */
  base: number;
}
export const FLOW_UNITS: readonly FlowUnit[];   // the order is the order of the select in the editor
export function isFlowUnitId(value: unknown): value is FlowUnitId;
export function flowUnitOf(id: FlowUnitId): FlowUnit;
/** The value in the base unit of its kind (m³/s or W). */
export function toBaseFlow(value: number, unit: FlowUnitId): number;
/** The value in another unit of the same kind, or null when the kinds differ. */
export function convertFlow(value: number, from: FlowUnitId, to: FlowUnitId): number | null;
```
The five volume units that `AIR_CHANGE_UNITS` has get their base from it: `base = 1 / (3600 * AIR_CHANGE_UNITS[id])`. New: `l/min` (1/60000), `US gpm` (US gallon 3.785411784 l per minute), `W` (1) and `kW` (1000).

```ts
// packages/core/src/sizing-settings.ts (new; T04)
export type SizeSeries = 'standard' | 'free';
export interface AirSizing {
  method: 'air';
  maxVelocityMs: number;
  maxPressureDropPaPerM: number;
  shape: 'round' | 'rectangular';
  /** Rectangular only: width ÷ height, at most this. At least 1. */
  maxAspectRatio?: number;
  series: SizeSeries;
}
export interface WaterSizing {
  method: 'water';
  maxVelocityMs: number;
  maxPressureDropPaPerM: number;
  /** K. Needed when the flow unit is a power. */
  deltaTK?: number;
}
export type SizingSettings = AirSizing | WaterSizing;
export const SUGGESTED_AIR_SIZING: AirSizing;
export const SUGGESTED_WATER_SIZING: WaterSizing;
export const SUGGESTED_FLOW_UNIT: Record<'air' | 'water', FlowUnitId>;
/** The settings without a bad value, or undefined. Numbers must be finite and above 0; maxAspectRatio at least 1; deltaTK above 0 when present. */
export function parseSizingSettings(raw: unknown): SizingSettings | undefined;
```

```ts
// packages/core/src/sizing-hydraulics.ts (new; T02)
export interface Fluid { densityKgM3: number; viscosityM2S: number; roughnessMm: number }
export const AIR_FLUID: Fluid;     // P-R5-05
export const WATER_FLUID: Fluid;   // P-R5-06
export const WATER_SPECIFIC_HEAT = 4186;   // J/(kg K)
export const velocityMs: (flowM3s: number, diameterM: number) => number;
export function frictionFactor(reynolds: number, relativeRoughness: number): number;
export function pressureDropPaPerM(flowM3s: number, diameterM: number, fluid: Fluid): number;
/** Huebscher: the round diameter (mm) that matches a rectangle a × b (mm). */
export function equivalentDiameterMm(aMm: number, bMm: number): number;
/** The smallest round diameter (m) such that this diameter and every larger one meet both limits. Continuous (no series). The friction factor jumps at Re 2300 (laminar 64/Re about 0.0278 against turbulent about 0.0487 there), so the drop does not always fall when d grows. Method: scan a log grid of 400 diameters from 5 mm to 5 m, take the largest grid diameter that breaks a limit, then bisect between it and the next grid diameter. */
export function minimumDiameterM(flowM3s: number, fluid: Fluid, maxVelocityMs: number, maxPaPerM: number): number;
```

```ts
// packages/core/src/sizing-series.ts (new; T03)
export const ROUND_DUCT_SERIES_MM: readonly number[];
export const PIPE_DN_SERIES_MM: readonly number[];
export const RECT_SIDE_MIN_MM = 100, RECT_SIDE_MAX_MM = 2000, RECT_SIDE_STEP_MM = 50;
/** The first size of the series that is at least `minimumMm`, or null when the series ends below it. */
export function nextSize(series: readonly number[], minimumMm: number): number | null;
/** The next multiple of `stepMm` at least `minimumMm`. */
export function roundUpTo(minimumMm: number, stepMm: number): number;
```

```ts
// packages/core/src/sizing-air.ts (new; T06a, T06b), sizing-water.ts (new; T07)
export type GovernedBy = 'velocity' | 'pressure' | 'aspect' | 'minimum';
export interface SizePick {
  shape: 'round' | 'rectangular';
  diameterMm?: number;
  widthMm?: number;
  heightMm?: number;
  velocityMs: number;
  pressureDropPaPerM: number;
  governedBy: GovernedBy;
}
/** null when no size of the series meets the limits. */
export function sizeAirSegment(flowM3s: number, settings: AirSizing): SizePick | null;
export function sizeWaterSegment(flowM3s: number, settings: WaterSizing): SizePick | null;
/** m³/s of a power in W for a delta T in K. */
export function waterFlowFromPowerM3s(powerW: number, deltaTK: number): number;
```

```ts
// packages/core/src/sizing-network.ts (new; T08a, T08b)
export type SizingProblemCode =
  | 'no-start' | 'no-segment-at-port' | 'discipline-not-sized' | 'method-discipline' | 'no-flow-unit' | 'no-sizing'
  | 'unit-kind' | 'no-delta-t' | 'no-flow'
  | 'unit-unknown' | 'not-resolved' | 'zero-flow' | 'too-large' | 'mixed-type' | 'start-two-ports';
export interface SizingProblem {
  code: SizingProblemCode;
  severity: 'error' | 'warning' | 'info';
  /** Segment ids (too-large, zero-flow, not-resolved, mixed-type) or element ids (unit-unknown, start-two-ports: the port ids). */
  ids?: string[];
}
export interface SizedSegment extends SizePick { segmentId: string; flowM3s: number }
export interface SizeNetworkInput {
  segments: Segment[]; fittings: Fitting[]; portGroups: PortGroup[];
  terminalCapacities: Record<string, number>;
  /** The unit of the capacity of one element, or null when it has none. */
  capacityUnitOf: (elementId: string) => FlowUnitId | null;
  elementCategories?: Record<string, StampCategory>;
  startStampId: string; startPortId: string;
  networkType: Pick<NetworkType, 'id' | 'discipline' | 'flowUnit' | 'sizing'>;
}
export interface SizeNetworkResult {
  /** 'refused' when an error problem exists. Then `sizes` is empty. */
  status: 'ok' | 'refused';
  problems: SizingProblem[];
  sizes: SizedSegment[];
  /** Segments of the network that get no size, with the reason. They keep their old size. */
  unsized: { segmentId: string; reason: 'zero-flow' | 'not-resolved' | 'too-large' | 'mixed-type' }[];
  /** The whole network, in m³/s, or null when it is not resolved. */
  totalFlowM3s: number | null;
  segmentCount: number;
}
export function networkOfStartPort(graph: NetworkGraphInput, startStampId: string, startPortId: string): Network | null;
export function sizeNetwork(input: SizeNetworkInput): SizeNetworkResult;
```

How the core works (T08a, T08b):
1. `networkOfStartPort` calls `computeNetworks` and returns the network that holds a segment with an endpoint on the exact stamp id and port id. A port group is not followed: the dialog offers only ports that have a segment.
2. Each capacity becomes SI. A volume unit goes through `toBaseFlow` (m³/s). A power goes through `waterFlowFromPowerM3s` (needs the delta T). An element with a capacity and no unit is skipped and listed in `unit-unknown`.
3. `solveFlow` runs on the SI map with `rootElementId = startStampId` and `rootPortId = startPortId` (`flow.ts:22`-`:24`). The sum is then in m³/s, so a mix of units in one network is right (this makes the core right for Q-R5-01 A and B).
4. For each segment: a flow of `null` goes to `not-resolved`; a flow of 0 goes to `zero-flow`; else the method picks a size; no size goes to `too-large`.
5. Errors: no segment at the port; a discipline that has no method (`discipline-not-sized`: any discipline except ventilation and heating and cooling, whatever `sizing` holds; the line says "This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command."); a method that does not fit the discipline (`method-discipline`: `air` on heating and cooling, `water` on ventilation); no flow unit on the type; no sizing; a power unit with the `air` method (`unit-kind`); a power unit with the `water` method and no delta T (`no-delta-t`); and a network where no segment has a flow (`no-flow`). A volume unit with the `water` method is allowed (no delta T needed). There is never an automatic fallback to another method.
6. Mixed types (P-R5-20): every segment of the network with a `networkTypeId` other than the type of the start segment goes to `unsized` with the reason `mixed-type` and one warning. The terminals of those segments still count in the flow of the other segments (the solve is not changed).
7. `start-two-ports` (P-R5-21): the method is `water` and the segments of the network end on two or more different ports of the start stamp. One warning.

### 4.3 The pick of a size (T06a, T06b, T07)

- **Round (air):** `D* = minimumDiameterM(...)` (bisection on the pressure drop, direct formula for the velocity: D ≥ sqrt(4 q / (π v_max))). Series `standard`: `nextSize(ROUND_DUCT_SERIES_MM, D*·1000)`. Series `free`: `roundUpTo(D*·1000, 10)`. `governedBy` is `velocity` or `pressure`, whichever needs the larger D, or `minimum` when D* is below the smallest size.
- **Rectangular (air):** with D* the diameter for the pressure limit only (the velocity bound is removed, because the rectangle has its own velocity check from its own area), walk the heights h = 100, 150, ... 2000 and the widths w = h, h+50, ... 2000 with w/h ≤ `maxAspectRatio` (default 4 when absent). A pair is valid when `equivalentDiameterMm(w, h) ≥ D*·1000` and the velocity `q / (w·h)` is at most the maximum. The smallest area wins; on a tie the smaller w/h wins. `governedBy` is `aspect` when the aspect limit removed a smaller area. The pressure drop that the pick reports is that of the equivalent round duct.
- **Water:** the flow is already in m³/s (the caller converts a power). `D*` as above with `WATER_FLUID`; the pick is `nextSize(PIPE_DN_SERIES_MM, D*·1000)` with the inner diameter equal to the DN (P-R5-09, the smaller option; the result block states it plainly). The reported velocity and drop use that diameter. The pressure limit governs small pipes (section 3.4).
- A flow above the largest size of the series gives `null` (`too-large`). The segment stays as it was.

### 4.4 Scene API (T10b, T11)

```ts
// packages/render/src/scene.ts
planNetworkSizes(startStampId: string, startPortId: string): NetworkSizePlan;   // read only
applyNetworkSizes(sizes: readonly SizedSegment[]): void;                        // one Transaction "Size network"
interface NetworkSizePlan { networkTypeId: string | null; networkTypeName: string | null; flowUnit: FlowUnitId | null; result: SizeNetworkResult }
```
`planNetworkSizes` reads the drawing state, `this.doc.terminalCapacities`, the stamp categories and the adopted type (`this.doc.networkTypes`, else the library type). The segment at the start port gives the type (rule 1). `capacityUnitOf` is `() => type.flowUnit ?? null` under Q-R5-01 A.
`applyNetworkSizes` calls `adoptNetworkTypes` for the type first (rule 4 and the overview), then writes the fields in one `Transaction`, calls `markDirty`, and emits `selectionChanged` (the model: `updateSegmentFields`, `scene.ts:1350`-`:1360`). Under Q-R5-02 A it converts mm to points with the calibration of the page; under B it writes mm.

## 5. How R5 keeps the rules of `rules.md` §3

1. **The segment defines the network type of a port.** R5 never writes a network type on a port or a stamp. The Size dialog reads the type from the segment at the chosen port (P-R5-14). The flow unit and the sizing belong to the network type, not to a port or a stamp definition. No default network type appears on a stamp.
2. **The cascade invariant.** R5 adds no per-segment field that can differ inside one network. The size fields exist already and are per segment by nature (a main is larger than a branch). R5 does not change a network type. The new fields are on the type, so they follow the type of the whole connected run. A change of the type of a run (the cascade, `setNetworkTypeForSegmentsNetworks`, `scene.ts:1482`, reached from `:1469`) keeps each segment size. A run changed to a type with other settings keeps its old sizes until the user presses "Size network" again; the dialog does not claim otherwise.
3. **Reuse before new.** Reused: `solveFlow` and its root, `computeNetworks`, `AIR_CHANGE_UNITS` and the constants, `parseRoutingTargets` as the model of the parser, the clean-up pattern of `loadProject`, `updateNetworkType`, `adoptNetworkTypes`, the `Transaction` write of `updateSegmentFields`, the editor dialog, the route dialog classes, `startCandidates`, the severity labels, `lib.mjs` and `r3-lib.mjs`. New, after a search that found nothing to reuse: the conversion table (only the air subset exists), the pressure-drop physics, the size series, the size pick. A search of `packages/core/src` for `velocity`, `pressure`, `Darcy` and `equivalent` finds no sizing code (the word `velocity` appears in no module; to be re-checked by the T02 implementer). Two parallel copies of one state are avoided: the unit lives on the network type only; `NetworkType.units` stays a display label.
4. **The adoption trap.** `applyNetworkSizes` calls `adoptNetworkTypes` for the type before it writes. A segment with an unadopted type has no sizing (the library types have none), so the dialog shows `no-sizing` and the button to open the editor; the editor adopts the type on first touch (`updateNetworkType`, `scene.ts:2449`). The browser check (T18) proves: a library type that the drawing has not adopted gives `no-sizing`, no write, no error. After the editor saves the type, it is adopted and the sizing works.
5. **Verify UI wiring through the real DOM.** T14a, T14b, T15a, T15b and T18 type into the real inputs, choose in the real selects and click the real buttons. The scene API sets the drawing up and reads state. A check of the segment size reads the real Properties panel after a real click on the segment.
6. **Merge lesson.** Each task ends with `pnpm build` at the root. The part check forces a build with no cache.

Other rules of `rules.md` §2: no `pnpm add` (the physics and the series are our own code); no `mupdf` import; no `window.confirm`; never prettier. A file that holds a hand-written project JSON is a test of the loader, not a fixture of a PDF or stamp (the fixture policy is not touched; no placeholder fixture is made).

## 6. The phases and the tasks

Commands (the tester runs them from the root of the worktree `/root/MepApp/.claude/worktrees/agent-framework`, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. No environment variable before the command. Screenshots go to `/tmp/mepapp-shots/` with `shot('<task id>-<name>')`.

Rules for every browser step of this part (the rules of R2 to R4 apply):
- Open the PDF with `openPdf('/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf')` (a tracked file). One Chromium page at a time. R5 needs no rooms and no `detect`.
- The setup (`r5-lib.mjs`, T10a) builds the drawing the way `buildMixedGroupProject` does (`r3-lib.mjs:50`): place one stamp with real clicks, then change the exported project (`category: 'equipment'`, ports, terminal stamps, segments, fittings, `terminalCapacities`, `networkTypes`) and load it with `loadProjectFromJson`. The T10a implementer reads `r3-lib.mjs` first. The built network is a small tree: one equipment stamp, one main, two branches, four terminal stamps with capacities. This is test setup, not a fixture file.
- While a dialog is open, click only inside it (`.mep-modal--route` for the Size dialog, `.mep-modal` for the editor). Close it with Escape or its button.
- A check of the written size reads the real Properties panel after a real click on the segment on the canvas (the screen position from `screenOf`).
- `exportProject()` is the proof of the stored result. The check compares it before and after where a task claims "no change".
- Screenshots go to the dashboard. The director uploads them (`protocol.md` §8).

Phases: **A** the model in core (T01 to T08b), **B** the scene (T09 to T12), **C** the UI (T13 to T17, with T14c), **D** the part check (T18).

| Task | Title | Depends on | Waits for | Files (main) |
|---|---|---|---|---|
| T01 | Flow units and the conversion table | none | none | `packages/core/src/flow-units.ts`, `flow-units.test.ts`, `index.ts` |
| T02 | Hydraulics | none | none | `sizing-hydraulics.ts`, `sizing-hydraulics.test.ts`, `index.ts` |
| T03 | Size series | none | none | `sizing-series.ts`, `sizing-series.test.ts`, `index.ts` |
| T04 | Sizing settings and the `NetworkType` fields | T01 | none | `sizing-settings.ts`, `sizing-settings.test.ts`, `network.ts`, `index.ts` |
| T05 | Schema step 19 and the clean-up on load | T04 | none | `project.ts`, `project.test.ts` |
| T06a | Air size: round | T02, T03, T04 | none | `sizing-air.ts`, `sizing-air.test.ts`, `index.ts` (one export line) |
| T06b | Air size: rectangular | T06a | none | `sizing-air.ts`, `sizing-air.test.ts` |
| T07 | Water size and the flow from a power | T02, T03, T04 | none | `sizing-water.ts`, `sizing-water.test.ts`, `index.ts` (one export line) |
| T08a | Network of the start port, capacities in SI, flows | T01, T04 | none | `sizing-network.ts`, `sizing-network.test.ts` |
| T08b | `sizeNetwork` and the problems | T06b, T07, T08a | none | `sizing-network.ts`, `sizing-network.test.ts`, `flow.ts` (comment), `index.ts` |
| T09 | Scene: widen `updateNetworkType`; copy `sizing` by value in `adoptTypes`, `duplicateNetworkType` and the clipboard copy | T05 | none | `packages/render/src/scene.ts` |
| T10a | Browser setup `r5-lib.mjs` | T05 | none | `.claude/roadmap/browser/r5-lib.mjs` |
| T10b | Scene: `planNetworkSizes` | T08b, T09, T10a | Q-R5-01 | `scene.ts`, `packages/render/src/index.ts`, `t10-check.mjs` (work folder) |
| T11 | Scene: `applyNetworkSizes` | T10b | Q-R5-02 | `scene.ts`, `t11-check.mjs` (work folder) |
| T12 | Auto-place writes the capacity in the unit of the type | T10b | Q-R5-01 = A or E | `scene.ts` (and the plan type in core, if the read says so) |
| T13 | Texts and line builders | T08b | none | `packages/ui/src/components/sizePlan.ts`, `packages/ui/src/sizePlan.test.ts` |
| T14a | Editor: flow unit, method, air fields, title, Stamps panel unit | T05, T09, T13 | none | `NetworkTypeEditorDialog.tsx`, `App.tsx`, `StampsPanel.tsx`, `theme.css` |
| T14b | Editor: water fields, suggested values, clear | T14a | none | `NetworkTypeEditorDialog.tsx`, `theme.css` |
| T14c | Editor: convert stored capacities when the flow unit changes | T10b, T14b | Q-R5-01 = E | `NetworkTypeEditorDialog.tsx`, `scene.ts` |
| T15a | Size dialog: inputs, checks | T10b, T13, T14a | Q-R5-01 | `SizeDialog.tsx` (new), `theme.css` |
| T15b | Size dialog: result, confirm and the Size button | T11, T15a | Q-R5-02 | `SizeDialog.tsx`, `sizePlan.ts` |
| T16 | Menu item and App wiring | T15b | none | `MenuButton.tsx`, `App.tsx` |
| T17 | Unit labels in the Properties panel | T11 | Q-R5-01 = A, Q-R5-02 = B | `PropertiesPanel.tsx` |
| T18 | The part check | all | none | `.claude/roadmap/browser/r5-check.mjs` |

No dependency: **T01, T02, T03**. They write different files. `packages/core/src/index.ts` is a shared file: each task adds one export line, and the task lead adds the lines one after another. Jobs on the same file run one after another: T06a and T06b (`sizing-air.ts`); T08a and T08b (`sizing-network.ts`); T09, T10b, T11, T12 and T14c (`scene.ts`); T14a, T14b and T14c (`NetworkTypeEditorDialog.tsx`); T15a and T15b (`SizeDialog.tsx`). T13 runs in parallel with T09 to T12 (it changes `sizePlan.ts` only). T06a and T07 run in parallel because each adds its own export line to `index.ts` (the task lead adds the lines one after another). If the user has not answered Q-R5-01 and Q-R5-02 when T10b is next, the director runs T10a, T13, T14a and T14b first, then stops the part at T10b.

### T01. Flow units and the conversion table
- **Depends on:** none.
- **Files:** `packages/core/src/flow-units.ts` (new), `packages/core/src/flow-units.test.ts` (new), `packages/core/src/index.ts` (one export line).
- **Shapes:** section 4.2, `flow-units.ts`. The volume bases of `dm³/s`, `l/s`, `m³/s`, `m³/h` and `cfm` come from `AIR_CHANGE_UNITS` (`packages/core/src/rooms/placement-units.ts:22`-`:28`). The table order: `dm³/s`, `l/s`, `m³/s`, `m³/h`, `cfm`, `l/min`, `US gpm`, `W`, `kW`.
- **Must not touch:** `rooms/placement-units.ts`, `NetworkType.units`.
- **Tests (core):** every id is in the table once; `isFlowUnitId` accepts all ids and rejects `'kg'`, `''`, `null`, a number; `convertFlow(1, 'cfm', 'dm³/s')` is 0.47195 (4 digits); `convertFlow(1, 'm³/h', 'l/s')` is 0.27778; `convertFlow(1, 'dm³/s', 'l/s')` is exactly 1; `convertFlow(1, 'US gpm', 'l/min')` is 3.7854; `convertFlow(1, 'kW', 'W')` is 1000; `convertFlow(1, 'W', 'dm³/s')` is `null` (kinds differ); a round trip through two units gives the start value within 1e-12; `toBaseFlow(3.6, 'm³/h')` is 0.001.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 60 lines and 60 of tests.

### T02. Hydraulics
- **Depends on:** none.
- **Files:** `packages/core/src/sizing-hydraulics.ts` (new), `packages/core/src/sizing-hydraulics.test.ts` (new), `packages/core/src/index.ts`.
- **Shapes:** section 4.2, `sizing-hydraulics.ts`. `frictionFactor(re, rel)`: for `re < 2300` return `64 / re`; else `0.25 / log10(rel / 3.7 + 5.74 / re ** 0.9) ** 2`. `pressureDropPaPerM(q, d, fluid) = f · (ρ v² / 2) / d` with `Re = v d / ν` and `rel = roughnessMm / 1000 / d`. `minimumDiameterM`: the larger of the diameter for the velocity limit (`sqrt(4 q / (π vmax))`) and the diameter for the pressure limit (bisection between 0.01 m and 5 m, 60 steps; the drop falls when d grows). A flow of 0 or less returns 0.
- **Must not touch:** `flow.ts`, any stored type.
- **Tests (core):** `velocityMs(0.1, 0.2)` is 3.183 (3 digits); `pressureDropPaPerM(0.1, 0.2, AIR_FLUID)` is 0.70 Pa/m within 2 % (Re 42 441, f 0.0231; section 3.4; the implementer also prints the exact value and never changes the formula or a constant to hit it); a low-flow water case (for example 1e-5 m³/s in a 15 mm pipe, Re near the change at 2300): `minimumDiameterM` gives a diameter such that every larger grid diameter meets both limits (scan test over 50 larger diameters), even where the drop does not fall steadily across Re 2300; `frictionFactor` at Re 2299 and 2301 differ by the known jump (0.0278 against 0.0487 for a smooth pipe; the test documents the jump, it does not remove it); the drop falls when the diameter grows and rises when the flow grows (monotone for turbulent flow, 20 sample points; the laminar jump is tested in the case below); laminar branch: `frictionFactor(1000, 0.001)` is 0.064; `equivalentDiameterMm(400, 200)` is 305 within 1 mm; `equivalentDiameterMm(a, a)` is close to 1.30·a^1.25/(2a)^0.25 and is less than the diameter of the same area (the rectangle has more area than its round equivalent); `minimumDiameterM(0.1, AIR_FLUID, 8, 1.0)` is governed by the pressure limit and the result gives a drop of 1.0 Pa/m within 0.5 %; `minimumDiameterM(0.1, AIR_FLUID, 2, 100)` is governed by the velocity limit (`sqrt(4·0.1/(π·2))` = 0.2523 m); flow 0 gives 0. A search of `packages/core/src` for `Darcy`, `Swamee` or `velocity` finds no earlier module (record the result in the report).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 80 lines and 80 of tests.

### T03. Size series
- **Depends on:** none.
- **Files:** `packages/core/src/sizing-series.ts` (new), `packages/core/src/sizing-series.test.ts` (new), `packages/core/src/index.ts`.
- **Shapes:** section 4.2, `sizing-series.ts`. The lists of P-R5-08. `nextSize` returns the first element at least `minimumMm` (with a tolerance of 1e-9), or `null`. `roundUpTo(x, step)` is `Math.ceil(x / step - 1e-9) * step`.
- **Must not touch:** nothing else.
- **Tests (core):** `ROUND_DUCT_SERIES_MM` is strictly increasing, starts with 63, ends with 1250 and has 14 entries; `PIPE_DN_SERIES_MM` is strictly increasing with 14 entries; `nextSize(ROUND_DUCT_SERIES_MM, 200)` is 200 (equal counts); `nextSize(..., 201)` is 250; `nextSize(..., 0)` is 63; `nextSize(..., 1251)` is `null`; `roundUpTo(201, 10)` is 210; `roundUpTo(200, 10)` is 200; `roundUpTo(0.0001, 50)` is 50.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 40 lines and 40 of tests.

### T04. Sizing settings and the `NetworkType` fields
- **Depends on:** T01.
- **Files:** `packages/core/src/sizing-settings.ts` (new), `packages/core/src/sizing-settings.test.ts` (new), `packages/core/src/network.ts` (two optional fields, type-only imports), `packages/core/src/index.ts`.
- **Shapes:** section 4.1 and section 4.2, `sizing-settings.ts`. The suggested constants of P-R5-04. `parseSizingSettings(raw)`: `raw` must be an object with `method` `'air'` or `'water'`; every number field must be finite and above 0 (`maxAspectRatio` at least 1, `deltaTK` above 0 when present); `shape` must be `'round'` or `'rectangular'`; `series` must be `'standard'` or `'free'`; a bad field returns `undefined` for the whole object (P-R5-17). Unknown extra keys are dropped. `__proto__` is never copied.
- **Must not touch:** `project.ts`, `CURRENT_SCHEMA_VERSION`, the library, `NetworkType.units`.
- **Tests (core):** the suggested constants parse to themselves; a missing `method`, an unknown method, `maxVelocityMs: 0`, `-1`, `NaN`, `'8'` each return `undefined`; `maxAspectRatio: 0.5` returns `undefined`; `maxAspectRatio` absent is valid; a water setting with `deltaTK: 0` returns `undefined`; with `deltaTK` absent it is valid; extra keys are dropped; `{ __proto__: ... }` does not pollute; the result is a new object (no shared reference to the input); `SUGGESTED_FLOW_UNIT.air` is `'dm³/s'` and `.water` is `'kW'`. A type test: a `NetworkType` with both new fields and one with neither compile (`tsc`).
- **Verify:** core tests; `pnpm typecheck`; `pnpm build`. `git diff --stat` shows no change in `project.ts`.
- **Size:** about 90 lines and 70 of tests.

### T05. Schema step 19 and the clean-up on load
- **Depends on:** T04.
- **Files:** `packages/core/src/project.ts`, `packages/core/src/project.test.ts`.
- **Shapes:** `CURRENT_SCHEMA_VERSION = 19`. A step `{ fromVersion: 18, toVersion: 19, migrate: (data) => ({ ...data, schemaVersion: 19 }) }` with a comment in the style of the step 17 to 18 (`project.ts:293`-`:303`). In `loadProject`: `networkTypes: doc.networkTypes.map(withCleanSizing)` next to the stamps clean-up (`project.ts:396`). `withCleanSizing(type)`: the same object when it has neither field or both are valid; else a copy without the bad field (`flowUnit` through `isFlowUnitId`, `sizing` through `parseSizingSettings`).
- **Must not touch:** the other steps, the validators, `serializeProject` (it already writes `CURRENT_SCHEMA_VERSION`), the scene.
- **Tests (core):** a v18 file (the existing test files of the project; the implementer reads `project.test.ts` for the pattern) loads and has `schemaVersion` 19, and its network types are unchanged (deep equal); a v19 file with a valid `flowUnit` and `sizing` round-trips through `serializeProject` and `loadProject` unchanged; a file with `flowUnit: 'kg'` loads with the field dropped and the other fields kept; a file with `sizing: { method: 'air' }` (bad) loads with `sizing` dropped; a file of schema 20 is refused with the `SchemaMigrationError` text; the clean-up does not change a type that has neither field (same object, `toBe`); other network type fields are kept.
- **Verify:** core tests; `pnpm typecheck`; `pnpm build`. `grep -rn "schemaVersion: 18\|CURRENT_SCHEMA_VERSION" packages` shows no test that still expects 18 (the implementer fixes the expected value only where a test names the current version).
- **Size:** about 40 lines and 60 of tests.

### T06a. Air size: round
- **Depends on:** T02, T03, T04.
- **Files:** `packages/core/src/sizing-air.ts` (new), `packages/core/src/sizing-air.test.ts` (new).
- **Shapes:** section 4.3, "Round (air)". `sizeAirSegment(flowM3s, settings)` for `settings.shape === 'round'`; for `'rectangular'` it returns `null` until T06b. `governedBy`: `velocity` when the velocity limit needs the larger diameter, `pressure` when the pressure limit does, `minimum` when D* is below the first size of the series. The pick holds the exact `velocityMs` and `pressureDropPaPerM` of the chosen diameter.
- **Must not touch:** `sizing-hydraulics.ts`, `sizing-series.ts`.
- **Tests (core), with the suggested settings:** 0.1 m³/s gives 200 mm? The implementer computes the expected size by hand from T02 and writes the reason in the test: the pressure limit 1.0 Pa/m gives D* near 0.186 m, the series gives 200 mm, and the pick reports v 3.18 m/s and 0.70 Pa/m, governed by pressure (the velocity at 186 mm is 3.7 m/s, below the suggested 5 m/s); 0.02 m³/s gives D* near 102 mm and the pick 125 mm, and the pick's drop is at most the limit; 0.64 m³/s gives a size where both reported values are within the limits and the next smaller size of the series breaks a limit (a property test over 20 flows from 0.005 to 1.5 m³/s: the pick meets both limits and the next smaller series size does not, or the pick is the smallest size); the series `free` gives a multiple of 10 mm and not more than 10 mm above D*; a flow above what 1250 mm carries at the limits gives `null`; flow 0 gives the smallest size with `governedBy: 'minimum'` (the caller never sends 0; the test documents it); a lower velocity limit makes `governedBy` `velocity`.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 80 of tests.

### T06b. Air size: rectangular
- **Depends on:** T06a.
- **Files:** `packages/core/src/sizing-air.ts`, `packages/core/src/sizing-air.test.ts`.
- **Shapes:** section 4.3, "Rectangular (air)". The search over h and w uses `RECT_SIDE_MIN_MM`, `RECT_SIDE_MAX_MM`, `RECT_SIDE_STEP_MM`. The width is the longer side. `maxAspectRatio` absent means 4.
- **Must not touch:** the round branch.
- **Tests (core):** the pick for 0.1 m³/s has `equivalentDiameterMm(w, h)` at least D*·1000 and `q / (w·h)` at most the velocity limit; no other valid pair has a smaller area (brute force over the same grid in the test); on a tie the smaller aspect ratio wins (a built case); `w ≥ h` always; `w / h` is at most `maxAspectRatio`; with `maxAspectRatio: 1` the pick is square; with a low limit (1.5) the pick has a larger area than with 4 and `governedBy` is `aspect`; a flow too large for 2000 × 2000 gives `null`; the pressure drop in the pick equals that of the equivalent round duct; the area of the rectangle is larger than the area of the round pick (the rectangle has more free area, section 3.2).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 70 lines and 80 of tests.

### T07. Water size and the flow from a power
- **Depends on:** T02, T03, T04. It runs in parallel with T06a and T06b.
- **Files:** `packages/core/src/sizing-water.ts` (new), `packages/core/src/sizing-water.test.ts` (new), `packages/core/src/index.ts` (its own export lines only).
- **Shapes:** section 4.2 (`sizeWaterSegment`, `waterFlowFromPowerM3s`) and section 4.3, "Water". `waterFlowFromPowerM3s(p, dT) = p / (WATER_SPECIFIC_HEAT * WATER_FLUID.densityKgM3 * dT)`. The pick has `shape: 'round'` and `diameterMm` equal to the DN. The inner diameter equals the DN (P-R5-09).
- **Must not touch:** the air module.
- **Tests (core):** `waterFlowFromPowerM3s(10000, 10)` is 2.389e-4 (4 digits); 10 kW at ΔT 10 K with the suggested settings (1.0 m/s, 200 Pa/m) gives **DN 25, `governedBy: 'pressure'`**, v 0.49 m/s and 154 Pa/m (section 3.4; the tests print the exact values and compare within 3 %); the continuous D* is above 20 mm, because DN 20 gives v 0.76 m/s but 462 Pa/m, and DN 15 gives 1.35 m/s and 1938 Pa/m (the test checks `pressureDropPaPerM` for DN 15, 20 and 25 against these values); the pressure limit, not the velocity limit, governs this small pipe, and the test asserts it; a low-flow case where Re is near 2300 still meets the "every larger size is valid" rule of `minimumDiameterM`; the property test of T06a for 20 flows; a flow above what DN 300 carries gives `null`; a higher velocity limit gives a smaller or equal DN; a ΔT twice as large halves the flow and gives a smaller or equal DN.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 60 lines and 60 of tests.

### T08a. Network of the start port, capacities in SI, flows
- **Depends on:** T01, T04.
- **Files:** `packages/core/src/sizing-network.ts` (new), `packages/core/src/sizing-network.test.ts` (new).
- **Shapes:** `networkOfStartPort` (section 4.2, step 1) and an internal `flowsOfNetwork(input, deltaTK)` that does steps 2 and 3: it converts each capacity to m³/s (a volume unit through `toBaseFlow`; a power unit through `waterFlowFromPowerM3s` when `deltaTK` is set), collects elements with a capacity and no unit (`unit-unknown`), runs `solveFlow` with `rootElementId` and `rootPortId`, and returns `{ flow: FlowResult; unknownUnit: string[] }`. Export `flowsOfNetwork` for the tests.
- **Must not touch:** `flow.ts`, `network.ts`.
- **Tests (core), on built networks (ids only, no fixture files):**
  - A tree: stamp `ahu` (port `out`) → main → fitting → two branches → terminals `t1`, `t2` with capacities 40 and 60 dm³/s. The flow in the main is 0.1 m³/s; in the branches 0.04 and 0.06.
  - The root has two segments on its start port (degree 2): with `startPortId` given, the root is the start stamp and the flows are right (R3 test case, repeated here for sizing).
  - A second equipment stamp in the network does not take the root.
  - The id-prefix case: stamps `stamp-1` (start) and `stamp-12` (terminal) give the right flows (regression for G15).
  - Mixed units: `t1` in `cfm` and `t2` in `dm³/s` give the sum in m³/s; the same data with both in `dm³/s` after conversion gives the same flows.
  - A capacity with no unit is skipped and listed.
  - A power unit with no delta T: the function does not convert it (the caller reports `no-delta-t` in T08b).
  - `networkOfStartPort` finds the network of the start port, returns `null` when no segment ends on it, and does not return a network that only touches a port of another stamp with the same port id.
  - A loop gives `null` flows on the closing segment (as `flow.ts:30` says); the function does not throw.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 90 lines and 110 of tests.

### T08b. `sizeNetwork` and the problems
- **Depends on:** T06b, T07, T08a.
- **Files:** `packages/core/src/sizing-network.ts`, `packages/core/src/sizing-network.test.ts`, `packages/core/src/flow.ts` (the doc comment only), `packages/core/src/index.ts`.
- **Shapes:** section 4.2, `sizeNetwork` and the problem codes. Severity: error for `no-start`, `no-segment-at-port`, `discipline-not-sized`, `method-discipline`, `no-flow-unit`, `no-sizing`, `unit-kind`, `no-delta-t`, `no-flow`; warning for `unit-unknown`, `not-resolved`, `zero-flow`, `too-large`, `mixed-type`, `start-two-ports`. A refused result has `sizes: []`. The result lists `unsized` (the segments with no new size and the reason). Items 5 to 7 of section 4.2 give the rules. The method comes from `networkType.sizing.method`. `unit-kind`: the `air` method with a power unit, or any method with the unit missing. The comment of `flow.ts` (`:1`-`:8`) gets one more sentence: sizing is in `sizing-network.ts`; this module still has no unit.
- **Must not touch:** the code of `flow.ts`.
- **Tests (core):** the tree of T08a with the suggested air settings: three sizes, the main larger than the branches, `totalFlowM3s` 0.1, `status: 'ok'`; each error code has a case (no segment at the port; a plumbing type, a sanitary-waste type and a fire-protection type, each with an `air` or `water` `sizing` stored, give `discipline-not-sized` and no fallback; `air` on a heating and cooling type and `water` on a ventilation type give `method-discipline`; no flow unit; no sizing; an `air` type with `kW`; a `water` type with `kW` and no ΔT; a network with all capacities 0);
  `mixed-type` (P-R5-20): a network built with a fitting shared by a `supply-air` segment and a `return-air` segment, start segment `supply-air`: the `return-air` segments are in `unsized` with the reason `mixed-type`, they are not in `sizes`, one warning lists their ids, and the other segments are sized with the settings of `supply-air`;
  `start-two-ports` (P-R5-21): a `water` network where the start stamp has segments on its `out` and `in` ports joined by a port group gives the warning; the same network with the `air` method gives none; a `water` network with one start port gives none; `unit-unknown`, `zero-flow` (one terminal with capacity 0 gives its segment no size and a warning, the other segments are sized), `not-resolved` (a loop) and `too-large` (a flow above the series) are warnings and the other segments are still sized; a water tree: 4 terminals of 5 kW, ΔT 10 K, suggested water settings: the main (q 4.78e-4 m³/s, 546 Pa/m in DN 25) is DN 32 and `governedBy` is `pressure`; each 5 kW branch is DN 20 or DN 25 (the test prints the exact drops and asserts that the main is not smaller than any branch); the result for a `volume` unit on a `water` type needs no ΔT; the function does not change its input (deep equal); a segment outside the network is never in `sizes`; the sizes of the main do not depend on the order of the segment array (shuffle test).
- **Verify:** core tests; `pnpm typecheck`; `pnpm build`.
- **Size:** about 150 lines and 170 of tests with the round 1 codes. The lead splits at the start: T08b1 (the problem checks and the refusals) and T08b2 (the pick loop, `unsized`, `mixed-type`, `start-two-ports`).

### T09. Scene: widen `updateNetworkType`; copy `sizing` by value everywhere a type is copied
- **Depends on:** T05.
- **Files:** `packages/render/src/scene.ts`.
- **Shapes:** the patch type of `updateNetworkType` (`scene.ts:2448`) becomes `Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern' | 'discipline' | 'flowUnit' | 'sizing'>>`. A key whose value is `undefined` removes the field (`delete target[key]`), so the file does not hold an `undefined`. The patch writes `sizing` as a copy (`structuredClone`), never the caller's object. `duplicateNetworkType` (`:2459`) copies `sizing` by value. `adoptTypes` (`:2433`, `push({ ...type })`) copies `sizing` by value for a type that carries it (a library type has none today; this keeps it safe). The clipboard copy (`scene.ts:4998`, `.map((type) => ({ ...type }))`) shares a nested `sizing` object with the document; it copies by value too. A cross-document paste adopts that copy through `adoptNetworkTypes(ids, copies)`, so `flowUnit` and `sizing` travel with a pasted segment. The placement rule copies of a type (`toNetworkTypeCopies`, `packages/core/src/rooms/placement-rule.ts:694`-`:704`) keep only the visual fields and drop `flowUnit` and `sizing`. That is safe, because an absent value is valid ("not set"); the plan does not change it. A type adopted from such a copy has no sizing and the Size dialog says so. The method does not call `syncDrawingLayer` for a patch that has only `flowUnit` or `sizing` (it changes no visual); it still calls `markDirty` and emits `networkTypesChanged`.
- **Must not touch:** the visual fields' behavior, `renameNetworkType`, segments.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `t09-check.mjs` (work folder), setup with `loadProjectFromJson` of a project that has one segment: call `updateNetworkType('supply-air', { flowUnit: 'dm³/s', sizing: <air settings> })` through the scene; `exportProject().networkTypes` holds both fields; `isDirty` is true; change the settings object that the caller kept: the stored copy does not change; `updateNetworkType('supply-air', { sizing: undefined })` removes the field (`'sizing' in type` is false); `duplicateNetworkType` gives a copy whose `sizing` is a different object (changing the copy does not change the original); a Ctrl+C and Ctrl+V of a segment of the type (Ctrl+C and Ctrl+V work on `body`, `rules.md` §4) gives, after editing the clipboard-side source type, a document copy that did not change (the check edits the `sizing` of the type after the copy and reads the pasted copy); the visual redraw count does not grow for a `sizing`-only patch (read `getDrawingSummary()` before and after, or skip this step and say so). No screenshot.
- **Size:** about 30 lines.

### T10a. Browser setup `r5-lib.mjs`
- **Depends on:** T05 (the project JSON it builds holds the new fields). It needs no scene method.
- **Files:** `.claude/roadmap/browser/r5-lib.mjs` (new). No product code.
- **Shapes:** `r5-lib.mjs` exports `open`, `D`, `screenOf`, `buildSizingProject(t, { type, capacities })` (section 6, the browser rules; the `type` argument can be an air, a heating-water or a mixed-type tree), `segmentSizes(page)` (the sizes in `exportProject()`), and `baseline(page)` / `sameAsBaseline(page, b)` (the shape of `r4-lib.mjs:85`-`:92`).
- **Must not touch:** `lib.mjs`, `r3-lib.mjs`, `r4-lib.mjs`.
- **Verify:** `node .claude/roadmap/browser/with-server.mjs <work>/t10a-check.mjs` (a short check that builds the tree and reads `exportProject()`: four terminals with the stated capacities, the segment count, and `loadProjectFromJson` accepted without a page error). No screenshot.
- **Size:** about 90 lines.

### T10b. Scene: `planNetworkSizes`
- **Depends on:** T08b, T09, T10a. **Waits for Q-R5-01.**
- **Files:** `packages/render/src/scene.ts`, `packages/render/src/index.ts` (export the plan type), `t10-check.mjs` (work folder).
- **Shapes:** section 4.4, `planNetworkSizes` and `NetworkSizePlan`. It reads `this.doc.drawingHistory.getState()` (segments, fittings, stamps), `this.doc.portGroups`, `this.doc.terminalCapacities`, the adopted types (`this.doc.networkTypes`, else `getNetworkTypeFromLibrary`). The type id comes from the first segment that ends on the start port (rule 1). `capacityUnitOf`: under Q-R5-01 A or E, `() => type.flowUnit ?? null`; under B, the stored unit; under D, the canonical unit of the kind. It passes `discipline` of the type to `sizeNetwork`. It calls `sizeNetwork`. It changes nothing and emits nothing.
- **Must not touch:** `recomputeFlow` (the live overlay keeps the fallback root), the drawing state.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `t10-check.mjs` (setup only, scene API for reading): build the tree (4 terminals of 100, 150, 50 and 100 dm³/s); set `flowUnit` and the suggested air `sizing` with `updateNetworkType`; `planNetworkSizes(stampId, 'out')` returns `status: 'ok'`, `totalFlowM3s` 0.4 (±1e-9), sizes for all segments, and the main size is at least the size of any branch; an independent count from `exportProject()` (segments of the network) equals `result.segmentCount`; with no `flowUnit` the plan is refused with `no-flow-unit`; with a library type that the drawing has not adopted (load a project whose `networkTypes` is empty) the plan is refused with `no-sizing` and `networkTypes` of `exportProject()` is still empty (the plan adopts nothing); `exportProject()` JSON, `canUndo` and `isDirty` equal before and after each plan call. No screenshot.
- **Size:** about 70 lines of scene.

### T11. Scene: `applyNetworkSizes`
- **Depends on:** T10b. **Waits for Q-R5-02.**
- **Files:** `packages/render/src/scene.ts`, `t11-check.mjs` (work folder).
- **Shapes:** section 4.4, `applyNetworkSizes`. Order: `adoptNetworkTypes([typeId])`; one `Transaction(this.doc.drawingHistory, 'Size network')`; for each size set `shape` and the fields (`diameter`, or `width` and `height`; the other fields of the shape are removed so a round segment has no `width`); `markDirty`; `emit('selectionChanged', ...)`. Q-R5-02 B: write mm. Q-R5-02 A: multiply by `mmToPt = calibration.pageUnitsPerRealUnit` of the page of the segment (`getCalibration(segment.pageIndex)`); with no calibration the method writes nothing and `planNetworkSizes` has already refused (a new error code `no-calibration` is added to T08b only if the answer is A).
- **Must not touch:** `updateSegmentFields`, the network type of any segment, `terminalCapacities`.
- **Verify:** `pnpm typecheck`; `pnpm build`. Browser check `t11-check.mjs`: after the T10a setup, `applyNetworkSizes(plan.result.sizes)`; `exportProject().segments` hold the sizes (an independent recomputation with the same formula in the page is not needed; compare with `plan.result.sizes`); the segment fields of other shapes are absent; one click on `.mep-rail-btn[title="Undo"]` restores the segments exactly (deep equal to the baseline); `isDirty` is true after the apply; a segment of another network is untouched; segments with a zero flow keep their old size; networks that the drawing does not hold are never created. A real click on the main segment (`screenOf`) shows its size in the Properties panel (`Diameter` input value equals the stored number; if the field is labelled "(pt)" or "(mm)" the check prints the label). Screenshot: `T11-properties-size`.
- **Size:** about 50 lines.

### T12. Auto-place writes the capacity in the unit of the type
- **Depends on:** T10b. **Waits for Q-R5-01 = A or E.** Dropped if the answer is B, C or D (under D the task converts into the canonical unit instead; the director rewrites it then). It converts only when `flowUnit` is set. The change of an existing `flowUnit` is T14c (E).
- **Files:** `packages/render/src/scene.ts` (the `autoPlaceStamps` write at `:2862`) and, if the read says the plan stamp has no unit, the plan type in `packages/core/src/rooms/placement-rule.ts`. The implementer reads both places first and reports before it edits the core type.
- **Shapes:** the plan stamp gets the unit of its capacity (`capacityUnit?: string`, the `ruleUnitOf` result at `placement-rule.ts:343`). When the stamp has a routing target whose adopted type has a `flowUnit` of the same kind as the capacity unit, the scene writes `convertFlow(capacity, capacityUnit, flowUnit)`. If the kinds differ (for example a rule in W for a type in dm³/s) or the type has no `flowUnit`, the scene writes the number as before and the dialog of Auto-place is not changed. A stamp with two routing targets uses the first (the second flow is out of scope, P-R5-16).
- **Must not touch:** the Auto-place dialog text, `terminalCapacities` of stamps that exist, rules in `localStorage`.
- **Verify:** core tests; `pnpm build`. Browser check `t12-check.mjs` with real inputs in the Auto-place dialog is not needed: a scene-level check with `autoPlaceStamps` on a hand-built plan (setup use of the scene API): a stamp with the target `supply-air` (type `flowUnit` `m³/h`) and a capacity of 10 dm³/s in a rule of unit `dm³/s` is stored as 36; with the type unit equal to the rule unit the number is unchanged; with a power rule (W) for an air type the number is unchanged. If building this plan through the scene API is not possible, the task reports NEEDS_CONTEXT and asks for the real Auto-place dialog flow (the model: `p6-check.mjs`).
- **Size:** about 40 lines.

### T13. Texts and line builders
- **Depends on:** T08b. Runs in parallel with T09 to T12.
- **Files:** `packages/ui/src/components/sizePlan.ts` (new), `packages/ui/src/sizePlan.test.ts` (new).
- **Shapes:** `sizeText(key: SizeTextKey, params?: Record<string, string | number>): string`, English only (P-R5-15). Keys: `title` ("Size network"), `startStamp`, `startPort`, `networkType`, `noEquipment`, `noSegments`, `size` ("Size network"), `close`, `editType` ("Edit network type…"), `capacityUnitNote` ("Capacities are read as {unit}."), `totalFlow`, `sizedCount`, `sizeCount` ("{size}: {count} segments"), `riserNote` ("Sizes are for this file only. A riser through other floors is not added up."), `twoFlowsNote` ("Stamps with two flows use one capacity here."), `draftNote` ("Draft in 2D. Check clashes and clearances yourself."), and one key and one hint for each problem code of `SizingProblemCode`. Round 1 adds: `disciplineNotSized` ("This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command."; this text is longer than 140 characters, so the length test skips it by name, as R4 did for its longest texts), `velocityNote` ("The velocity limit applies to every segment."), `fluidAir` ("Air at 20 °C."), `fluidWater` ("Water at 20 °C, no glycol."), `pipeNote` ("Pipe sizes are DN. The inner diameter is taken as equal to the DN. Check copper and plastic pipe."), `returnNote` ("Supply and return pipes must be separate networks."), `unsizedKeep` ("{n} segments are not sized and keep their old size."), `newSize` ("{n} segments get a new size. A size that you typed by hand is overwritten."), `confirmQuestion`, `confirmYes` ("Size anyway"), `confirmNo` ("Cancel"), and the texts of the editor note and the conversion question of T14c (`unitReadNote`, `convertQuestion`, `convertYes`, `convertNo`, `unitKindWarning`). Builders: `sizeProblemLines(problems, names): { code; severity; text; hint }[]` (fills `{count}` and `{unit}`; `hint` is empty where a code has none); `sizeResultLines(result, unitLabel): string[]` (total flow in the unit of the type, count sized, counts for each size, sorted from the largest size); `sizeLabel(pick): string` ("Ø 400", "800 × 400", "DN 20").
- **Must not touch:** `routePlan.ts` and its Dutch table.
- **Tests (UI):** every key has a text; each text has 140 characters or less with sample parameters; no text holds "CFM", "door" or "crossing" (the unit label "US gpm" is allowed; it is a unit name, not a text); each problem code has a line and a hint where the plan says so (`no-flow-unit`, `no-sizing` and `no-delta-t` hint at the editor); `sizeLabel` for the three shapes; `sizeResultLines` for one size, three sizes, and zero sizes; the counts add up to the number of sized segments; the order is from the largest size; the plural form for 1 and 2 segments; no text holds Dutch words (a small list check: "gang", "ruimte", "netwerk").
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 120 lines and 100 of tests.

### T14a. Editor: flow unit, method, air fields
- **Depends on:** T05, T09, T13.
- **Files:** `packages/ui/src/components/NetworkTypeEditorDialog.tsx`, `packages/ui/src/App.tsx` (the `handleSaveNetworkType` patch), `packages/ui/src/theme.css`.
- **What it adds:** a section "Flow and sizing" under the visual fields. A select "Flow unit" (`data-testid="nt-flow-unit"`; the first option "Not set", then `FLOW_UNITS`). A select "Sizing method" (`nt-sizing-method`: "Not sized" always; "Air" only when the discipline is Ventilation; "Water" only when the discipline is Heating & Cooling; P-R5-03). For plumbing, fire protection, electrical and other disciplines the select holds "Not sized" only and a Note line shows the text `disciplineNotSized`. The dialog title becomes "Network type: {name}" (P-R5-25; the existing UI tests and checks that read the old title "visuals" are updated in this task). `StampsPanel.tsx:457` shows the label of the `flowUnit` when it is set, else `units` (P-R5-19). For "Air": number inputs `nt-air-max-velocity` (m/s), `nt-air-max-drop` (Pa/m), a select `nt-air-shape` (Round or Rectangular), `nt-air-aspect` (shown for Rectangular), a select `nt-air-series` (Standard or Free). The local draft starts from the type. Save sends `flowUnit` and `sizing` in the patch (`undefined` when "Not set"/"Not sized"). A value that is not a positive number disables Save and shows one line under the field. The texts are English only. A change of the discipline to one that does not offer the draft method (`air` off Ventilation, `water` off Heating & Cooling) switches the draft to "Not sized".
- **Must not touch:** the visual fields and their behavior, `NetworkTypeEditPatch` keys that exist (it only gains two).
- **Verify:** UI tests (the draft logic as pure functions in `sizePlan.ts` or a small helper, with tests); `pnpm build`. Browser check `t14a-check.mjs` through real inputs (open the editor by the real double-click on the Networks tree entry, or the real context action that opens it; the implementer reads `NetworkTreePanel.tsx` for the path):
  1. The section shows. The flow unit select holds "Not set" and the nine units. "Sizing method" holds "Not sized" and "Air" (the type is Supply Air, ventilation; no "Water"). The title reads "Network type: Supply Air". The Stamps panel row of the type shows "dm³/s" after step 3 (the label of `flowUnit`, not "CFM"). Open the editor for Domestic Cold Water (plumbing): the method select holds "Not sized" only and the Note `disciplineNotSized` shows; change the discipline of Supply Air to Plumbing in the draft: the method switches to "Not sized".
  2. Choose flow unit "dm³/s" and method "Air". The five air fields show. Type 7 into `nt-air-max-velocity` and press Tab; type 0.9 into `nt-air-max-drop`; choose Rectangular: `nt-air-aspect` shows. Click Save.
  3. `exportProject().networkTypes` holds `flowUnit: 'dm³/s'` and `sizing` with `method: 'air'`, `maxVelocityMs: 7`, `maxPressureDropPaPerM: 0.9`, `shape: 'rectangular'`.
  4. Reopen the editor: the fields show the saved values.
  5. Type `0` into `nt-air-max-velocity`: Save is disabled and the line shows. Type `-3`: the same. Type `abc` (the number input refuses it; the value stays empty and Save is disabled).
  6. Choose "Not sized" and Save: `sizing` is gone from the export. Choose "Not set" for the unit and Save: `flowUnit` is gone.
  7. A 400 px wide run: `scrollWidth <= clientWidth` of `.mep-modal`.
  8. The visual fields still save: change the color and Save; the segment color changes (the pixel buffer or `exportProject().networkTypes[0].color`).
  Screenshots: `T14a-editor-air`, `T14a-editor-narrow`, `T14a-editor-plumbing`.
- **Size:** about 140 lines with the title, the Stamps panel line and the discipline rules. The lead moves the draft helper (pure functions with tests) to its own file first, which keeps the diff under 150 lines.

### T14b. Editor: water fields, suggested values, clear
- **Depends on:** T14a.
- **Files:** `packages/ui/src/components/NetworkTypeEditorDialog.tsx`, `packages/ui/src/theme.css`.
- **What it adds:** for "Water": `nt-water-max-velocity`, `nt-water-max-drop`, `nt-water-delta-t` (K; empty is allowed; the hint says "Needed when the flow unit is a power."). A button "Use suggested values" (`nt-suggest`) that fills the unit and the fields of the chosen method from `SUGGESTED_*` into the draft (not saved until Save). A plain line under the water fields: the `pipeNote` text and the `fluidWater` text (P-R5-09, P-R5-22). A line under the air fields: the `velocityNote` text and the `fluidAir` text. A hint under both methods: "Sources for the suggested values are secondary. Check your standard." Nothing is filled without the button (D-R5-05: no default for ΔT: the suggested water values leave `deltaTK` empty).
- **Must not touch:** the air fields.
- **Verify:** UI tests; `pnpm build`. Browser check `t14b-check.mjs` through real inputs (a Heating Water type; load a project with the type adopted):
  1. The method select holds "Water". Choose it with the unit "kW". Click `nt-suggest`: the velocity shows 1 and the drop 200; `nt-water-delta-t` stays empty. Save.
  2. `exportProject().networkTypes[...]` has `sizing.method: 'water'`, 1, 200, and no `deltaTK` key.
  3. Type 10 into `nt-water-delta-t`, Tab, Save: `deltaTK: 10` is stored.
  4. Clear the field and Save: the key is gone.
  5. On the Supply Air type, `nt-suggest` fills dm³/s and the air values.
  6. Cancel after a change: nothing is stored (the export equals the baseline).
  Screenshots: `T14b-editor-water`, `T14b-editor-suggested`.
- **Size:** about 80 lines.

### T14c. Editor: convert stored capacities when the flow unit changes
- **Depends on:** T10b, T14b. **Waits for Q-R5-01 = E.** Dropped for every other answer.
- **Files:** `packages/ui/src/components/NetworkTypeEditorDialog.tsx`, `packages/render/src/scene.ts`, `packages/ui/src/theme.css`, `packages/ui/src/components/sizePlan.ts` (texts only).
- **Shapes:** scene: `countCapacitiesOfType(typeId): number` (read only: the elements with a capacity that have a segment of this type on a port; an element that has segments of two types counts once for each and is reported by the dialog as "not converted") and `convertCapacitiesOfType(typeId, from: FlowUnitId, to: FlowUnitId): number` (one `Transaction`? The capacities are in `terminalCapacities`, a Map outside the history; the method follows `setCapacityForSelection` (`scene.ts:4485`) and its undo handling; the implementer reads it first and reports if the change cannot be undone). In the editor: when Save changes `flowUnit` from a unit to another unit and `countCapacitiesOfType` is above 0, a panel inside the dialog (not `window.confirm`) shows `convertQuestion` with the buttons `convertYes` ("Convert") and `convertNo` ("Keep numbers"). Same kind: "Convert" calls `convertCapacitiesOfType`. Different kind (volume to power or back): no conversion is possible, the panel shows `unitKindWarning` and only "Keep numbers". From "Not set" to a unit: no panel, the Note `unitReadNote` ("Existing capacities of this type are read as {unit}.") shows in the editor.
- **Must not touch:** capacities of elements on other types, the Auto-place code.
- **Verify:** UI tests (the panel logic as a pure function); `pnpm build`. Browser check `t14c-check.mjs` through real inputs: a Supply Air network with `flowUnit` `m³/h` and capacities 36, 72 (as stored). Open the editor, choose `dm³/s`, Save: the panel shows the question with "2 capacities". Click "Keep numbers": the export holds 36 and 72 and `flowUnit` `dm³/s`. Repeat from `m³/h`, click "Convert": the export holds 10 and 20. Choose `kW` for the air type: the warning shows and there is no convert button. From "Not set" to `dm³/s`: no panel, the Note shows. A terminal on two types is not changed (setup with one stamp that has two segment types; the line says it was not converted). Screenshots: `T14c-convert-question`, `T14c-unit-warning`.
- **Size:** about 100 lines.

### T15a. Size dialog: inputs and checks
- **Depends on:** T10b, T13, T14a. **Waits for Q-R5-01.**
- **Files:** `packages/ui/src/components/SizeDialog.tsx` (new), `packages/ui/src/theme.css`.
- **What it adds:** the dialog frame (P-R5-13), the start stamp select (`size-start`: `startCandidates(stamps)` filtered to stamps that have a segment on at least one port, from `scene.getConnectivity()`), the port select (`size-port`: ports of the stamp that have a segment), a read-only line `size-type` with the name of the network type of the segment at the port, a line `size-unit` ("Capacities are read as {unit}." or the `no-flow-unit` line), the check lines from `planNetworkSizes` through `sizeProblemLines` (`size-line-<code>`, `data-severity`, the labels Error, Warning, Note; the markup of `RouteDialog.tsx:252`), the buttons "Edit network type…" (`size-edit-type`; shown for `no-flow-unit`, `no-sizing`, `no-delta-t`, `unit-kind`, `method-discipline`; calls the prop `onEditNetworkType(typeId)`; not shown for `discipline-not-sized`, where the line says the type has no method) and "Close". The plan is recalculated when the choice or the drawing changes: the events of `RouteDialog.tsx:62`-`:65` (`pageChanged`, `documentActivated`, `drawingChanged`) **and `flowSolved` and `networkTypesChanged`** (P-R5-24). A capacity edit emits only `selectionChanged` and `flowSolved` (`scene.ts:2917`-`:2925`, `:3090`), and the clear backdrop lets the user type a capacity while the dialog is open, so without `flowSolved` the numbers go stale. The dialog always shows the riser note, the draft note, the `velocityNote` (air method) and the fluid line (`fluidAir` or `fluidWater`); for the water method it also shows `returnNote` and the `pipeNote`; it shows the two-flows note when a stamp of the network has routing targets of two or more types. A drawing with no equipment that has a segment shows the `noEquipment` text.
- **Must not touch:** `RouteDialog.tsx`, the route markers, the selection.
- **Verify:** UI tests (pure parts); `pnpm build`. T15a has no browser check of its own. The dialog opens only through the real menu item, which T16 adds. The browser steps of T15a run in T16 (steps 2, 3, 4 and 10 to 12).
- **Size:** about 130 lines.

### T15b. Size dialog: result and the Size button
- **Depends on:** T11, T15a. **Waits for Q-R5-02.**
- **Files:** `packages/ui/src/components/SizeDialog.tsx`, `packages/ui/src/components/sizePlan.ts`.
- **What it adds:** the result block `size-result` (the lines of `sizeResultLines`: total flow, count sized, count for each size, `unsizedKeep`, `newSize`), the button `size-apply` ("Size network", disabled when `status` is `refused` or no segment is sized), and the call `scene.applyNetworkSizes(plan.result.sizes)`. When `result.unsized` is not empty, the first press of `size-apply` opens a confirm panel inside the dialog (`size-confirm`, not `window.confirm`) with the text `confirmQuestion` and the buttons `size-confirm-yes` ("Size anyway") and `size-confirm-no` ("Cancel"). The write happens only after "Size anyway". With no unsized segment the first press writes. After the apply the block shows "Sized {n} segments." and the dialog stays open (the user can press Undo in the toolbar). A second press with no change writes the same sizes (no error).
- **Must not touch:** the plan function, the scene.
- **Verify:** UI tests (the confirm logic as a pure function); `pnpm build`. The apply path (the write, the confirm panel) is **not run in a browser until T16**, because the dialog opens only through the menu item that T16 adds. T16 steps 5 to 7, 14 and 15 prove it.
- **Size:** about 60 lines.

### T16. Menu item and App wiring
- **Depends on:** T15b.
- **Files:** `packages/ui/src/components/MenuButton.tsx`, `packages/ui/src/App.tsx`.
- **Shapes:** a prop `onOpenSize: () => void`; the item "Size network…" after "Route network…" (`MenuButton.tsx:159`-`:173`), disabled without a PDF. `App.tsx`: state `sizeOpen`; the dialog renders when open with `onEditNetworkType` that closes nothing and opens the `NetworkTypeEditorDialog` of the id (the dialog state of `App.tsx:1817`).
- **Must not touch:** the debug item, "Route network…", the route dialog.
- **Verify:** UI tests; `pnpm build`. Browser check `t16-check.mjs` through real inputs (the T10a setup with the network type unset first; the dialog is opened by the real menu click; the menu item matches `^\s*Size network…\s*$`):
  1. Before a PDF is open, the item is disabled (a first page load).
  2. After the setup, the menu item opens the dialog. The start select lists the equipment stamp; the port select lists `out`; `size-type` reads "Supply Air".
  3. With the type unset: `size-line-no-flow-unit` shows with `data-severity="error"` and "Error"; `size-apply` is disabled; the text holds no "door" or "crossing" and no Dutch.
  4. Click `size-edit-type`: the network type editor opens. Choose "dm³/s", "Air", click `nt-suggest`, Save. The dialog behind updates: the error line goes (the `networkTypesChanged` event) and `size-unit` reads "Capacities are read as dm³/s."
  5. `size-result` shows the total flow (equal to the independent sum of the capacities from `exportProject().terminalCapacities`, converted to dm³/s: 400 dm³/s) and the count of sized segments (equal to the count of segments of the network in the export).
  6. Click `size-apply`. The export holds sizes on all segments of the network. Close with Escape. Click `.mep-rail-btn[title="Undo"]`: the export equals the baseline taken before the apply.
  7. Select a segment on the canvas by a real click; the Properties panel shows its size; the main is not smaller than a branch.
  8. The Water case: load a Heating Water network with 4 terminals of 5 kW; set the type to kW, Water, suggested values, no ΔT: `size-line-no-delta-t` shows (Error). Set ΔT 10 in the editor: the line goes; apply; sizes are DN values from the series (every `diameter` is in the DN list when Q-R5-02 = B).
  9. The unadopted-type case: load a project whose `networkTypes` is empty but whose segments use `supply-air`: the dialog shows `size-line-no-sizing`; `size-apply` is disabled; `exportProject().networkTypes` is still empty; after `size-edit-type`, Save of suggested values, the type is adopted and apply works (rule 4).
  10. A drawing with no equipment stamp that has a segment shows the `noEquipment` text and no select.
  11. A 400 px run: `scrollWidth <= clientWidth` of `.mep-modal--route`.
  12. The dialog ignores a click on the backdrop (the check does not click it).
  13. No page error (`finish()` of `lib.mjs`).
  14. Stale test (P-R5-24): with the dialog open and the sizing ready, type a new capacity into the Properties panel of a terminal (a real click on the terminal on the canvas first; the clear backdrop allows it; the check clicks on the canvas, not on the backdrop of a closing dialog, and the dialog stays open because `closeOnBackdropClick` is false). The total flow in `size-result` changes within 1 s to the new independent sum.
  15. Unsized confirm (P-R5-11): set one terminal to capacity 0. `size-result` shows `unsizedKeep` ("1 segments are not sized and keep their old size." in the plural-safe text of T13) and `newSize`. Click `size-apply`: `size-confirm` shows and the export is unchanged. Click `size-confirm-no`: still unchanged. Click `size-apply` and `size-confirm-yes`: the sized segments change and the unsized one keeps its old number.
  16. Notes: for the air type, `size-velocity-note`, the fluid line "Air at 20 °C." and the riser note show. For the water type, `size-return-note` ("Supply and return pipes must be separate networks."), `size-pipe-note`, and "Water at 20 °C, no glycol." show. A water network whose start stamp has the flow and return ports in one port group shows `size-line-start-two-ports` (Warning).
  17. Unsupported discipline: a Domestic Cold Water network (plumbing) shows `size-line-discipline-not-sized` with the full text "This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command."; `size-apply` is disabled; `size-edit-type` is not shown; the export is unchanged. Even when the type holds an `air` setting in the loaded JSON, the line shows and nothing is written.
  18. Mixed type: a Supply Air tree with a Return Air segment on a shared fitting shows `size-line-mixed-type` (Warning); the Return Air segment keeps its number after the apply.
  19. Stacked dialogs: with the editor open on top of the Size dialog, one Escape closes **both** dialogs (each `Dialog` has its own document Escape listener, `Dialog.tsx:29`-`:37`). The check records this behavior and does not fail on it; it closes the editor with its Cancel button when it needs the Size dialog to stay. The finding is passed to the director (it is an old trait of `Dialog`, not an R5 change).
  Screenshots: `T16-menu`, `T16-size-dialog-error`, `T16-size-dialog-ok`, `T16-size-result`, `T16-size-confirm`, `T16-size-water`, `T16-size-discipline`, `T16-size-narrow`.
- **Size:** about 40 lines of product code.

### T17. Unit labels in the Properties panel
- **Depends on:** T11. **Waits for Q-R5-01 = A or E and Q-R5-02 = B.** Each half is dropped when its answer is another one.
- **Files:** `packages/ui/src/components/PropertiesPanel.tsx`.
- **What it changes:** (Q-R5-02 B) the labels "Diameter (pt)", "Width (pt)", "Height (pt)" (`:248`, `:258`, `:266`, `:387`, `:399`, `:408`) become "(mm)". (Q-R5-01 A) the "Capacity" label of a stamp (`:516`, `:655`) shows the flow unit of the network type at its ports when exactly one type is found, for example "Capacity (dm³/s)". With no type or two types the label stays "Capacity".
- **Must not touch:** the values, the handlers, the multi-select "Varies" logic.
- **Verify:** UI tests where a pure helper exists; `pnpm build`. Browser check `t17-check.mjs`: click a segment: the label reads "Diameter (mm)"; click a terminal stamp that is connected to a Supply Air segment whose type has `flowUnit` `dm³/s`: the label reads "Capacity (dm³/s)"; a stamp with no segment reads "Capacity". Screenshot: `T17-properties-units`.
- **Size:** about 30 lines.

### T18. The part check
- **Depends on:** all tasks above.
- **Files:** `.claude/roadmap/browser/r5-check.mjs` (new). No product code. It imports `lib.mjs` and `r5-lib.mjs` with relative paths of its own folder and never reads `MEPAPP_PDF`.
- **What it does** (run 1: English, 1600 by 1000, `01_arch_first_floor.pdf`):
  1. Setup with `buildSizingProject` (air tree, four terminals, 400 dm³/s). Baseline: `exportProject()` JSON, `canUndo`, `isDirty`.
  2. Core claims through the page: `planNetworkSizes` returns `ok`; the total equals the independent sum; each reported size meets the limits (the check recomputes the velocity as `q / area` in the page from the exported size and the plan flow, and the check of the pressure limit is the property test of core, not repeated here).
  3. The editor (T14a steps 1 to 4 in short) with real inputs, in English.
  4. The Size dialog (T16 steps 2 to 7) with real clicks. The `Error` and `Note` labels show.
  5. The water case (T16 step 8).
  6. The unadopted-type case (T16 step 9).
  7. A save and load round trip: `exportProject()` after the apply, `loadProjectFromJson` of that JSON; the sizes, the `flowUnit` and the `sizing` are the same; `schemaVersion` is 19.
  8. A file of schema 18 (the baseline project with `schemaVersion: 18` and no new fields) loads without error and the Size dialog shows `no-flow-unit`.
  9. Run 2: 400 px wide, the editor and the dialog fit.
  10. Run 3 (dark mode, `open({ dark: true })`): the dialog and the editor section show with readable text (a screenshot; the UI reviewer reads it).
  11. `no page errors`.
- **Screenshots:** `T18-editor-air`, `T18-editor-water`, `T18-size-dialog`, `T18-size-result`, `T18-size-dark`, `T18-size-narrow`.
- **Verify (the tester runs each command alone):**
  1. `pnpm --filter @mepapp/core test`
  2. `pnpm --filter @mepapp/ui test`
  3. `pnpm typecheck`
  4. `pnpm build` fresh (the tester reads the "cached" count in the output and reports it; R4 used a forced build)
  5. `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r5-check.mjs` exits 0.
  6. **No regression:** `r2-check.mjs`, `r3-check.mjs` and `r4-check.mjs`, one command each, each exits 0 (R2: 66 of 66 and 10 of 10; R3: 44 of 44 and 7 of 7; R4: 50, 6, 6, 5, 6 passed and 0 failed, from the R4 table).
- **After the check:** the director marks R5 done in this file, with the commit hash of each task and the verification, in the style of `auto-routing-r4.md`.

## 7. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T01 | yes | no | yes | no | none |
| T02 | yes | no | yes | no | none |
| T03 | yes | no | yes | no | none |
| T04 | yes | no | yes (and typecheck) | no | none |
| T05 | yes (loader, step 19) | no | yes (and typecheck) | no | none |
| T06a | yes | no | yes | no | none |
| T06b | yes | no | yes | no | none |
| T07 | yes | no | yes | no | none |
| T08a | yes | no | yes | no | none |
| T08b | yes | no | yes (and typecheck) | no | none |
| T09 | no | no | yes (and typecheck) | `t09-check.mjs` | none |
| T10a | no | no | no | `t10a-check.mjs` | none |
| T10b | no | no | yes (and typecheck) | `t10-check.mjs` | none |
| T11 | no | no | yes (and typecheck) | `t11-check.mjs` | `T11-*` |
| T12 | yes | no | yes | `t12-check.mjs` | none |
| T13 | no | yes | yes | no | none |
| T14a | no | yes | yes | `t14a-check.mjs` | `T14a-*` |
| T14b | no | yes | yes | `t14b-check.mjs` | `T14b-*` |
| T14c | no | yes | yes | `t14c-check.mjs` | `T14c-*` |
| T15a | no | yes | yes | in T16 | in T16 |
| T15b | no | yes | yes | in T16 | in T16 |
| T16 | no | yes | yes | `t16-check.mjs` | `T16-*` |
| T17 | no | yes | yes | `t17-check.mjs` | `T17-*` |
| T18 | yes | yes | yes (fresh) | `r5-check.mjs`, `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs` | `T18-*` |

The check scripts live in the work folder of the task, except `r5-lib.mjs` and `r5-check.mjs`, which stay in `.claude/roadmap/browser/`.

Dialogs that are new or changed, and their screenshots for the dashboard: the network type editor (`T14a-editor-air`, `T14a-editor-narrow`, `T14a-editor-plumbing`, `T14b-editor-water`, `T14b-editor-suggested`, `T14c-convert-question`, `T14c-unit-warning`), the Size dialog (`T16-size-dialog-error`, `T16-size-dialog-ok`, `T16-size-result`, `T16-size-confirm`, `T16-size-water`, `T16-size-discipline`, `T16-size-narrow`), the menu (`T16-menu`), the Properties panel (`T11-properties-size`, `T17-properties-units`) and the part check (`T18-*`).

## 8. Where R5 stops and the next parts start

R5 gives: the flow unit table (`flow-units.ts`), the sizing settings and the two fields on `NetworkType`, the schema step 19, the pure functions `sizeAirSegment`, `sizeWaterSegment` and `sizeNetwork`, the scene methods `planNetworkSizes` and `applyNetworkSizes`, the network type editor section and the Size dialog.

- **R6** (the shape of the network) calls `sizeNetwork` after it routes, with its start stamp and start port, and `applyNetworkSizes` in the same undo step or a second one (the R6 plan decides). R6 reads `NetworkType.sizing` and `flowUnit`. R6 adds the `routedBy` marks in the schema step after 19 (20, or 21 if Q-R5-01 = B). R6 owns the layout rule of routed segments (orthogonal and 45 degrees). R5 does not.
- **R2 to R4** are not changed. The route dialog is not changed. The Size dialog does not use the open-port finder.
- **Not in R5 (out of scope, D-R5-04 and the user's note: come back after the main routing feature):**
  - stamps with two flows (a fan coil unit with heating and chilled water): `portCapacities` is not built (P-R5-16 shows a note);
  - risers and the sum of several floors;
  - other non-typical cases: a loop in the network, a start stamp with its own capacity, two start stamps, a network with a foreign type joined (R6 refuses to route into one);
  - methods for domestic water (loading units, EN 806-3), drains (discharge units), fire protection and electrical networks;
  - a balance report of supply against return plus exhaust (Q-R5-03);
  - a material table for pipes (steel, copper, PEX: inner diameter and roughness) as a setting of the water method (P-R5-09);
  - a fluid setting (temperature, glycol), a minimum duct size, a maximum rectangular height, a minimum water velocity note (0.2 to 0.3 m/s), and a velocity limit for each depth of the network (P-R5-04, P-R5-22);
  - a size label on the plan (the Label feature), a pipe table by material, a user setting for fluid temperature, density, roughness or the minimum velocity, a maximum duct height, a reducer or fitting loss, a pressure drop along the whole network, and a pump or fan duty;
  - Dutch texts (user note 2026-10-17).

## 9. Risks and what is not verified

- **R-1 Secondary sources.** Section 3.2 rests on web search summaries and calculator sites. No standard was read. The EN 1506 list comes from a sample copy of the 2007 edition. The velocity caps have no primary source. The suggested values are suggestions; the user must set the limits of the project.
- **R-2 Constants.** The air and water constants (P-R5-05, P-R5-06), the Swamee-Jain formula and the DN list are from the planner's knowledge. T02 checks the formula against a hand value (0.70 Pa/m at 200 mm and 100 dm³/s) and the implementer should compare it with a public ductulator. Not verified: that comparison.
- **R-3 Rectangular series.** The 50 mm step and the 100 to 2000 mm range are not from a standard (P-R5-08). EN 1505 lists rectangular sizes; it was not read.
- **R-4 DN is not the inner diameter.** P-R5-09 simplifies. A steel pipe DN 20 has an inner diameter near 21 to 22 mm and a copper pipe has another one. For small copper and plastic pipes the real inner diameter is much smaller (copper 15 × 1: 13 mm; PEX 16 × 2: 12 mm), so the real velocity is 30 to 60 percent higher and the drop about twice as high: the sizes are then too small, not too safe. The Size result block states the simplification plainly (`pipeNote`, P-R5-09), and the material table is the first later item.
- **R-5 Shared nested object.** `adoptTypes` (`scene.ts:2433`), `duplicateNetworkType` (`:2462`) and the clipboard copy (`:4998`) copy with a spread. A nested `sizing` object would be shared between a library entry or a copy and the document. T09 copies by value in all three places. A browser check covers duplicate and paste. `toNetworkTypeCopies` (`placement-rule.ts:694`-`:704`) drops `flowUnit` and `sizing`; that is safe because absent is valid.
- **R-6 A new file is refused by an older MepApp** (schema 19). This is the design of the schema step (`schema.ts:69`-`:71`).
- **R-7 Q-R5-01 and Q-R5-02 block the write path.** Without answers the part can build the core, the editor and the texts, but not the scene read, the write, the Size dialog or the part check. The director stops the part at T10b until the user answers.
- **R-8 Old capacities.** With Q-R5-01 = A, a capacity that Auto-place wrote before R5 in the unit of its rule (for example m³/h) is read in the unit of the network type (for example dm³/s). The numbers can be off by the factor 3.6. The dialog states the unit it reads. The user checks it. This risk is the price of option A.
- **R-9 A hand-placed terminal has capacity 0** until the user types one. The segments of that branch get no size and the dialog counts them (P-R5-11). A user can think the sizing is complete when it is not. The warning line names the count.
- **R-10 The overlay root can differ.** The live flow overlay uses the fallback root (`scene.ts:3087`), so the number on the plan can differ from the number that the Size dialog uses when the fallback picks another stamp. The dialog uses the start stamp and says "Total flow" from its own solve. Not changed in R5.
- **R-11 Water on one network type for flow and return.** The library has one `heating-water` type for both pipes (R3 open item, Q-R2-02). A network that holds both pipes (a port group over the flow and return ports) sums the terminal power twice toward the root, so every pipe is oversized by up to a factor 2, with no message from the solve. R5 now gives the warning `start-two-ports` when the start stamp has segments on two ports of the network, and the standing Note "Supply and return pipes must be separate networks." (P-R5-21). It cannot know which pipe is the return pipe (Q-R5-03). A water run is a draft until R6 decides the pipe side.
- **R-12 Cascade and old sizes.** A change of the network type of a run keeps the old sizes (rule 2, section 5). The user presses "Size network" again.
- **R-13 No size on the plan.** The user cannot see a size without selecting a segment. P-R5-18 says so. The count in the dialog is the only overview.
- **R-14 Not verified: `pnpm build --force`.** The flag for a build with no cache. The tester reports the cached count (as in R4).
- **R-15 Performance.** `sizeNetwork` runs on the main thread on each dialog change. The solve is linear, and the rectangular search is at most 39 × 39 pairs for each segment. Not measured. A network of 500 segments gives about 750 000 pair tests; T10b prints the time of one plan on the test tree, and the T18 check prints it for a larger built network (300 segments). Above 300 ms the lead reports it; the fix is to cache by segment flow.
- **R-16 Browser check access to the editor.** The check opens the editor through the Networks tree. The path was not read for this plan (T14a reads `NetworkTreePanel.tsx`). If it needs a path that real clicks cannot reach, the task reports NEEDS_CONTEXT.
- **R-17 Q-R5-01 B.** If the user chooses B, a second schema step (20) comes and `terminalCapacityUnits` must follow paste, delete and copy of stamps (the capacity map does already: `scene.ts:4488`, `:4923`). That is a new task group that this plan does not cover.
- **R-18 Friction factor jump.** At Re 2300 the factor jumps from laminar to turbulent. The drop is not monotone in the diameter near the change, so `minimumDiameterM` uses a grid scan, not a plain bisection (T02). Small water pipes at low flow are the case.
- **R-19 Velocity limit is global.** One limit applies to every segment. Branches and terminals need a lower one (P-R5-04). The user can set a lower global limit; a limit for each depth is deferred.
- **R-20 Stale old sizes.** A segment with no new size keeps its old number, often the default 200 / 400 / 300. The dialog states it and asks for a confirm (P-R5-11).
- **R-21 Not verified (kept honest).** EN 1506 (a sample of the 2007 edition only), EN 1505 (not read), the water limits (secondary sites), EN 806-3 (summary only), EN 12056-2 (nothing found), the public-building velocity guidance (secondary), the pipe inner diameters of copper and PEX (from the audit), and the constants of P-R5-05 and P-R5-06.
- **R-22 Stacked dialogs.** One Escape closes the Size dialog and the editor on top of it (`Dialog.tsx:29`-`:37`). Not changed by R5 (T16 step 19).

## 10. Revision log

| Date | Change |
|---|---|
| 2026-10-17 | First version by the road map planner. 22 tasks (T01 to T18, with T06, T08, T14 and T15 split). Three questions for the user (Q-R5-01 capacity unit, Q-R5-02 unit of the segment size, Q-R5-03 balance report), 18 provisional choices. |
| 2026-10-17 | Round 1 of the audit (section 11). 24 tasks. Q-R5-01 and Q-R5-03 widened; 8 new provisional choices (P-R5-19 to P-R5-25 and the changes of P-R5-03, -04, -09, -11). |

## 11. Round 1 of the audit: what changed

| Item | Change |
|---|---|
| 1 | Air hand value corrected to Re 42 441, f 0.0231, 0.70 Pa/m (D* about 186 mm, pick 200 mm; 0.02 m³/s gives D* 102 mm, pick 125 mm). Section 3.4, T02 and T06a tests. Rule added: never bend the formula to hit a hand value. |
| 2 | Water hand values corrected: 10 kW at ΔT 10 K gives DN 25 (154 Pa/m, v 0.49), DN 20 gives 462 Pa/m, DN 15 gives 1938 Pa/m; the 4 × 5 kW tree main is DN 32 (DN 25 gives 546 Pa/m). Section 3.4, T07, T08b. The pressure limit governs small water pipes. |
| 3 | P-R5-09: the smaller option, no material table. A plain line `pipeNote` in the result block and in the editor. Reason and the later item recorded. R-4 rewritten. |
| 4 | Q-R5-01: hazards added to the cost of A (a later change of `flowUnit` is silent; CFM labels). Options D (canonical unit) and E (A plus conversion in the editor) added. Recommendation now E. Blocks list updated. New task T14c (E only). T12 waits for A or E. |
| 5 | P-R5-19: `StampsPanel` shows the label of `flowUnit` when set, else `units`. Task T14a. |
| 6 | T07 depends on T02, T03, T04 only. T06a and T07 each add their own export line to `index.ts`. T06 and T07 run in parallel. |
| 7 | T09 copies `sizing` by value in `adoptTypes` (`scene.ts:2433`), `duplicateNetworkType` (`:2462`) and the clipboard copy (`:4998`). `toNetworkTypeCopies` drops the fields (safe; stated in section 2, T09 and R-5). |
| 8 | Problem code `mixed-type` (warning, those segments are unsized). P-R5-20. Test in T08b. |
| 9 | Q-R5-03 widened to "a role on the network type", with the correctness effect for water and a no-new-field option C. Standing Note `returnNote`; warning `start-two-ports` (P-R5-21, T08b). R-11 rewritten. |
| 10 | T15a listens to `flowSolved` and `networkTypesChanged` too (P-R5-24). T16 step 14 tests it. |
| 11 | Suggested air velocity 5 m/s. The dialog states that the limit applies to every segment (`velocityNote`). Per-depth limits stay deferred. R-19. |
| 12 | P-R5-03: `air` for Ventilation only, `water` for Heating & Cooling only, no fallback. New codes `discipline-not-sized` and `method-discipline`. Exact dialog text. T14a, T08b, T16 step 17. |
| 13 | P-R5-11: unsized segments keep their old size; the dialog says so and asks for a confirm inside the dialog. T15b, T16 step 15. |
| 14 | P-R5-22: the dialog states "Water at 20 °C, no glycol." and "Air at 20 °C.". A fluid setting is deferred. |
| 15 | `minimumDiameterM` uses a grid scan and bisection (largest violating diameter), not a plain bisection. Low-flow water test in T02. R-18. |
| 16 | Line numbers refreshed: cascade `scene.ts:1482` (from `:1469`), `MenuButton.tsx:159`-`:173`, `calibration.ts:57`, `setTerminalCapacity` `:2917`. |
| 17 | T10 split: T10a (`r5-lib.mjs`) and T10b (`planNetworkSizes`). T15b states that its apply path is not run in a browser until T16. T08b expected to split into T08b1 and T08b2. |
| 18 | The editor title becomes "Network type: {name}" (P-R5-25, T14a). The Escape behavior of stacked dialogs is recorded in T16 step 19 and R-22. |
| 19 | The unit is named `US gpm` (P-R5-23). Optional later settings and the not-verified list are in section 8 and R-21. |
| 20 | Plumbing, drains and fire protection stay out of scope (section 8, P-R5-03). |
