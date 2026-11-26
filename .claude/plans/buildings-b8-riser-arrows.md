# B8: riser arrows

Status: **planned 2026-11-26, revised the same day after the answers of the user (section 4). Nothing is built.** Stream `buildings`, part id `B8`. It needs B7 (flow through risers, branch `worktree-buildings-b7`, tested by the user on Windows, merge pending). B5 (shared coordinate system) stays deferred.

Source of the request: the user, 2026-11-26, after the Windows test of B7 ("I also tested the riser functionality and it works correctly"). The picture of the user is `fixtures/risers.png` (untracked in the main checkout). A copy is committed next to this plan: `.claude/plans/buildings-b8-riser-arrows.png`.

Words in this plan:
- A **ring** is the purple circle of a riser on the canvas of one level. It is a free anchor (dashed ring, no segment yet) or a marked fitting (solid ring, a segment ends there). Both exist in the code (`riserAnchors.ts`, `riserMarks.ts`). **A ring is always a full circle. The app never draws half a ring.** The arrows are drawn over the full circle, as in the picture.
- A **span** is the part of a riser between two member levels that are next to each other.
- A **pictogram** is one of the eight arrow combinations of `risers.png`: a full circle with one or two diagonal arrows.
- **Below** and **above** are the two arrows (the two halves of the arrow pair) of a pictogram. "Below" is the arrow for the span to the next lower member level. "Above" is the arrow for the span to the next higher member level. They are not parts of the ring.
- The **flow sense** of a network type is `supply` (the flow goes away from the source) or `return` (the flow goes toward the source).

## 1. What the user wants

1. After the user makes a riser, no arrows show. The rings show on the other levels, as today.
2. When the user connects segments, terminals or equipment, and the direction of the flow is not in doubt, the arrows show on every ring of the riser.
3. The arrows take the color of the network type. They also take its line pattern (solid, dashed, dotted and so on), if that is possible.
4. The arrows scale with the zoom level (answer of the user, D-B-122).
5. A network type has a flow sense, supply or return. The user sets it in the network type editor. The default network types carry a default value (answer of the user, D-B-118).
6. When the direction stays in doubt, the user can choose one of the eight pictograms by hand for a ring.
7. Later (part B of this plan, after the user has tested part A): the Risers tab of Manage Buildings shows the direction in its diagram.

## 2. The eight pictograms

Read from `risers.png`. The ring is red in the picture. The app draws it purple, as now. A diagonal arrow that points up and to the right means "up" (to a higher level). A diagonal arrow that points down and to the left means "down".

| # | Picture text | Below | Above | Meaning at this level |
|---|---|---|---|---|
| 1 | coming up, going up | up | up | The flow passes through this level, upward |
| 2 | going up | none | up | The flow starts here and goes up |
| 3 | coming up | up | none | The flow from below ends here |
| 4 | coming down, going down | down | down | The flow passes through, downward |
| 5 | coming down | none | down | The flow from above ends here |
| 6 | going down | down | none | The flow starts here and goes down |
| 7 | going up, going down | down | up | The flow starts here and goes both ways |
| 8 | coming up, coming down | up | down | The flow from both sides ends here |

The model is one pair for each ring: `below` and `above`, each `up`, `down` or `none`. Eight of the nine pairs are pictograms. The pair (`none`, `none`) means "no arrow" (the ring shows alone, as today).

Both ends of a span agree. A span has one direction. The ring on the lower level uses it as its `above`. The ring on the upper level uses it as its `below`. So the derived arrows of two neighbor rings never disagree.

The picture is the spec of the drawing: the shaft is a line at about 60 degrees from the horizontal. The arrowhead is a small filled triangle. The ring is small and each arrow is about seven ring radii long (ring radius 10, arrow 70, in the picture). The text in the picture is only a label for this plan. The app does not draw it.

## 3. State of the code (checked 2026-11-26 on `worktree-buildings-b7` at `5aa3719`)

- `packages/core/src/riser.ts`: `Riser` has `flow: 'up' | 'down' | 'both' | 'unknown'` (a hand-set direction), `sourceLevelId?` and a copy of its network type (`networkType`). `RiserMember` has `levelId`, `sheetId`, `pageIndex`, `fittingId`, `connectionHeightMm?`. The building file has `BUILDING_SCHEMA_VERSION = 1`. An unknown field stays when the app reads a file.
- `packages/core/src/network.ts` `NetworkType`: `id`, `name`, `discipline`, `units`, `defaultCapacity`, `color`, `lineWidthPt`, `linePattern`, `flowUnit?`, `sizingMethod?`. It has no flow sense. `network-type-library.ts` `NETWORK_TYPE_LIBRARY` holds the 14 default types (supply-air, return-air, exhaust-air, chilled-water, heating-water, domestic-cold-water, domestic-hot-water, sanitary-waste, conduit, cable-tray, branch-circuit, feeder, wet-standpipe, dry-standpipe). A project document holds its own copy (`ProjectDocument.networkTypes`). The project file is at schema version 23 (`CURRENT_SCHEMA_VERSION`, `project.ts`). The precedent for an optional field on the network type is `flowUnit?` (migration step 18 to 19: the step only advances the version, so that an older app refuses the file and does not drop the field).
- `packages/ui/src/components/NetworkTypeEditorDialog.tsx` is the network type editor. `NetworkTypeEditPatch` lists the editable fields. `scene.ts` `updateNetworkType` (about line 2755) takes the same list.
- `packages/core/src/riser-flow.ts` `deriveRiserFlow(file, perLevelFlow)`: one direction word for a whole riser (`up`, `down`, `both`) from the source level. A hand-set flow or source level wins.
- `packages/core/src/building-flow.ts` `solveBuildingFlow`: the spans (`BuildingFlowSpan`, `fromLevelId`, `toLevelId`, `capacity`, `state`), the members (`role`: `source`, `entry`, `exit`, `open`, `none`), the groups (`sourceLevelId`, `atMost`). It gives a source for a group, or none. With no source it uses the highest rule and marks `atMost`. **The orientation of `fromLevelId` and `toLevelId` against the flow is not written in the type. T02 reads the code and writes it down.**
- `packages/render/src/scene.ts` `redrawOverlay` (about line 6278 to 6335) draws the rings and the ring labels. The ring radius is `FITTING_MARKER_RADIUS_WORLD` plus a part that stays constant on the screen. `RiserMark` (`riserMarks.ts`) and `RiserAnchor` (`riserAnchors.ts`) are the data that the UI gives to the scene (`setRiserMarks`, `setRiserAnchors`). A free anchor only shows on a page that has a segment of its network type (`visibleRiserAnchors`). The label of a ring sits at the right of the ring, so an arrow that points up and to the right can cross it.
- Line patterns: `scene.ts` has `DASH_PATTERN_WORLD` and `strokeDashedPolyline` for a segment with a non-solid `linePattern`. `BuildingRisersDiagram.tsx` has `dashArrayOf(pattern)` for the SVG diagram.
- `packages/ui/src/useBuildingRisers.ts` (about line 696) calls `scene.setRiserMarks(marks)` and `scene.setRiserAnchors(buildRiserAnchors(...))`. The flow numbers reach the scene by a live path (`riserFlowSync.ts`, `useRiserFlowInputs.ts`).
- `BuildingRisersPane.tsx` has the hand-set controls (`Direction`, `Source level`, "Use the flow solve") and the box "Flow direction" with the text `Up · source: Level 0 · from the flow solve` (`riserInfo.ts` `riserFlowText`).
- The canvas arrowheads on a segment (D-B-95, `flowArrow.ts`, `scene.ts` `syncFlowLabels`) use `FlowResult.segmentDirection`. The doc comment in `flow.ts:60` and the code at `flow.ts:254` say: the direction is leaf to root, **toward the source**, for every network type. T07 changes this (D-B-123).

## 4. Decisions

Ids continue after D-B-117. Add them to the ledger as `decision` events (answered ones with `status: answered`, `by: user`) and show the open ones on the dashboard before T01.

Answered by the user on 2026-11-26:

- **D-B-118 (answered, option B): the flow sense is a property of the network type.** The user said: "we should add that to network types first so that can be set in the network type editor by the user. This means we also have to update the current network types that are loaded by default and set a default direction on them (supply or return)." It replaces the earlier options A and C. The riser arrows follow the flow sense of the network type of the riser. See D-B-125 for the details.
- **D-B-119 (answered, as recommended): the hand-set pictogram lives on the riser member.** An optional field on `RiserMember` in the building file, `arrows?: { below: 'up' | 'down' | 'none'; above: 'up' | 'down' | 'none' }`. No schema bump of the building file (an older app keeps an unknown field and ignores it). One ring, one pair.
- **D-B-122 (answered, changed): the arrows scale with the zoom.** The arrows are drawn in world (page) units, so they grow and shrink with the zoom like the segments and the page. The ring keeps its present rule. The earlier proposal (constant size on the screen) is dropped. The `ux-designer` sets the length, the width and the place of the ring label at the default zoom, and reports how the arrows look at the lowest and the highest zoom. It does not add a size limit without the answer of the user.
- **D-B-120, D-B-121, D-B-124: accepted as proposed** (below).
- **D-B-123 (answered, adapted by the director; the user can correct it): the old arrowheads on segments follow the flow sense too.** The user agreed with the proposal to change them. With the flow sense they must follow the type: a `supply` type points away from the source, a `return` type points toward the source (the present behavior). Both on one page then agree with the riser arrows. This is task T07.

Accepted (provisional, easy to reverse):

- **D-B-120: when do the arrows show?** As soon as the riser has a main level (a source on one member level, or the level that the user set), every span shows its direction. A riser with no source shows no arrow (D-B-88, D-B-95: no direction without a source).
- **D-B-121: hand-set pictogram and the neighbor.** A hand-set pictogram changes only the arrows of its own ring. The neighbor ring keeps its own arrows. When two rings disagree on a shared span, the Risers tab shows a warning ("Arrows disagree on the span Level 1 to Level 2").
- **D-B-124: the order of precedence.** Hand-set pictogram of the ring, then the hand-set direction and main level of the riser (`riser.flow`, `riser.sourceLevelId`), then the flow solve with the flow sense. A hand-set `flow: 'up'` or `'down'` without a main level gives that direction on every span. `'both'` without a main level gives no arrow (the split point is not known). A hand-set direction is literal (real up or down). It ignores the flow sense.
- **D-B-125 (provisional, new): the flow sense of a network type.**
  - Field: `NetworkType.flowSense?: 'supply' | 'return'`. The editor label: "Flow direction". The options: "Supply (away from the source)" and "Return (toward the source)". The wording is the same for every type (D-B-113). The name of the field is a proposal.
  - Project file: schema 23 to 24. The step is pure and idempotent. It writes the library value on every type in the project whose id is in the library and that has no value. A type with another id (a type of the user) stays without a value. The step otherwise follows the precedent of `flowUnit` (an older app refuses a version 24 file). Tests: the step, an old file, a second run, the refusal by an older app. Check at the start of the work that no other branch took version 24.
  - Reading: one function `flowSenseOf(type)` in core. It returns `type.flowSense`, else the library value of the same id, else `supply`. The building file has no version bump and no migration, so the copy of the network type in a riser (`riser.networkType`) of an old building file has no value. `flowSenseOf` covers it.
  - Defaults in `NETWORK_TYPE_LIBRARY` (the `mep-domain-checker` confirms them): `return` for return-air, exhaust-air and sanitary-waste. `supply` for the other eleven (the water, electrical and fire protection types flow away from their source; conduit and cable tray are neutral and read as supply).
  - The editor shows the effective value for a type that has none. Saving the editor writes the value.
  - A change in the editor reaches the copy in the riser in the same way as a change of color does today. T01 reads how that works and uses the same path.
  - A new network type from the library carries the library value. A new custom type starts with `supply`.

## 5. Tasks

Part A (canvas). Part B (Risers tab) starts only when the user has tested part A and says go. One task lead for each task. `ux-designer` first and `journey-tester` last for T01 (small), T05, T06 and T09. Show the wireframe, the journeys and the texts on the dashboard (event `decision`, kind `ux`) before the implementation of a screen task.

### B8-T01 (core and ui): the flow sense of a network type

- Core: `NetworkType.flowSense?`, `flowSenseOf(type)`, the library defaults, the migration step 23 to 24 in `project.ts` (D-B-125), the validation (a bad value is refused), tests first. Update the types that list the editable fields (`NetworkTypeEditPatch`, `scene.ts` `updateNetworkType`).
- UI: one select "Flow direction" in `NetworkTypeEditorDialog.tsx`, with a short hint of one sentence. Where the dialog shows a summary of a type (the Networks tab), check if the value belongs there. The `ux-designer` decides.
- The change reaches the riser copy (see D-B-125). The save of a project writes the field. A project that is not migrated (an old file) opens and shows the library defaults.
- Tests: core (migration, `flowSenseOf`, library), ui (editor patch). A no-flag check in the real web store: open the editor, change a type, save, reopen. Screenshot of the editor.
- Stop and ask the user first if the project file format needs more than D-B-125 says.

### B8-T02 (core): the direction of each span, and the pair for each ring

- New file `packages/core/src/riser-arrows.ts` (pure, no I/O) and its test file.
- `riserSpanDirections(file, flow, networkTypeOf)`: for each riser, for each span, `'up' | 'down' | 'unknown'`. Input: the building file, the result of `solveBuildingFlow` (and `deriveRiserFlow` for the hand-set values). The sense of a span comes from `flowSenseOf(riser.networkType)`: `supply` means away from the main level, `return` means toward it. A span is `up` when the flow goes to the member with the higher elevation. Two levels with the same elevation give `unknown`.
- `riserRingArrows(...)`: for each riser and member, the pair `{ below, above }`, with the hand-set `member.arrows` over the derived pair (D-B-124). A member at the end of the chain has `none` on the side with no span.
- Write the orientation of `BuildingFlowSpan` into its doc comment.
- Tests (write them first). Use a table with these cases and all eight pictograms: a source on the lowest level; on the highest; in the middle (pictogram 7 there, and 1 or 4 on the levels between, 3 and 5 at the ends); a source level set by hand; no source (no arrows); two sources (no arrows, as in D-B-77); a riser with two levels; a group of two risers on one network; a hand-set `flow`; a hand-set pictogram; a `return` type (pictogram 8 at the source level) next to a `supply` type; equal elevations.

### B8-T03 (core): hand-set pictogram in the building file

- `RiserMember.arrows?` (D-B-119). Functions `setMemberArrows(file, riserId, levelId, pair)` and `clearMemberArrows(file, riserId, levelId)` in `riser-edit.ts`, in the style of `setRiserProps`. `validate` in `building.ts` accepts the field and refuses another value. A pair (`none`, `none`) is stored as such: "no arrow by hand". It is not the same as "no hand-set value". The action "Use the flow solve" clears the field.
- `riserWarnings`: the warning of D-B-121.
- Tests: write, read, round trip of a file, an old file without the field, a bad value, an older app (the unknown field is kept).

### B8-T04 (render): draw the arrows at a ring

- `RiserMark` and `RiserAnchor` get an optional `arrows?: { below, above }`, `color` and `linePattern` (from the network type of the riser).
- A pure function `riserArrowShapes(pair, centerPt, ringRadiusPt)` returns the shaft ends and the arrowhead points in world units. The arrow size is in world units, so it scales with the zoom (D-B-122). Test it (eight pictograms, no arrow, the size at two scales).
- `redrawOverlay` draws the full ring as now, then the shaft with the line pattern of the network type (reuse `strokeDashedPolyline`; a pattern that does not fit a short shaft falls back to solid) and a solid arrowhead, in the color of the network type. It draws for anchors and for marked fittings. Check that the arrows do not hide the ring label. `ux-designer` sets the rule.
- Tests next to the shape function. A no-flag test: a scene with no `arrows` draws what it drew before.

### B8-T05 (ui): the arrows follow the live flow

- `useBuildingRisers.ts` computes `riserRingArrows` from the live building flow (the same data as the capacities) and gives the pair to the scene with the marks and anchors. The arrows update when the user connects or removes a segment, a terminal or an equipment, and when the user changes the flow direction of a network type, without a save (like the numbers in B7).
- Screen task: `ux-designer` first. Write the journeys: make a riser (no arrows); add a source on one level (arrows on every ring); add a terminal; remove the source (arrows go); two sources; a level that is not open (the arrows of the open level still show); a supply type and a return type on the same drawing; change the flow direction of a type in the editor. `journey-tester` last.
- Browser check with real DOM inputs, in the real web store, one Chromium page. Screenshots of the eight pictograms (hand-set, T06), of three network types with three line patterns, and of two zoom levels.

### B8-T06 (ui): choose a pictogram by hand

- Right-click on a ring: the menu gets "Riser arrows" with the eight pictograms (small pictures with a tooltip text such as "Comes up, goes up") and "Use the flow solve". The Properties panel of a riser fitting shows the same choice. `ux-designer` decides which of the two, or both.
- Writes `member.arrows` through the edit functions of T03. Undo is the way of the building file (as the other riser actions).
- A ring with a hand-set pictogram shows a small mark ("Set by hand") in the Properties panel and in the Risers tab.

### B8-T07 (render and ui): the arrowheads on segments follow the flow sense

- `flowArrowEnds` and `syncFlowLabels` get the flow sense of the network type of the segment. `supply`: the arrowhead points away from the source (the flow direction is the reverse of `segmentDirection`). `return`: as today (toward the source). A segment with no direction keeps no arrowhead (D-B-95).
- Update the tests of `flowArrow.test.ts`, the browser checks and the steps in the Windows scripts that read the direction of an arrowhead (search for "arrowhead" in `.claude/roadmap/work/` and `.claude/plans/buildings-b7-test.md`). The numbers do not change.
- Test: the same network drawn as a supply type and as a return type gives opposite arrowheads. A screenshot of both.

### B8-T08 (Windows test script and records, part A)

- Add Part M to `.claude/plans/buildings-b7-test.md`, or a new file `.claude/plans/buildings-b8-test.md` (the lead chooses; one file is easier for the user). Steps for the flow direction in the network type editor, the eight pictograms, a supply and a return type, three line patterns, the zoom, a level that is not open, a hand-set pictogram, and the arrowheads on segments.
- Mark the status of this plan. Ledger events, mirror to the dashboard, screenshots to the dashboard.

### Part B (after the user says go)

- **B8-T09 (ui): the Risers tab diagram.** `BuildingRisersDiagram.tsx` shows the direction of each span: a small arrowhead on the lane, in the color and pattern of the lane (`dashArrayOf`). The input is `riserSpanDirections`. A span with no direction shows nothing. `ux-designer` first (a wireframe on the dashboard). The old box "Flow direction" text and the words `Up`, `Down`, `Both` (D-B-74) need a decision: keep, or replace by the arrows plus a neutral word. Put the question on the dashboard.
- **B8-T10:** Windows test steps, records.

## 6. Out of scope

- A different flow sense for each riser or for each level. The sense belongs to the network type.
- A change of the capacity numbers of B7.
- B5 (shared coordinate system).
- A fluid-flow calculation. The arrows show the direction of the capacity path, away from or toward the main level. They show no pressure or speed.
- Words for a network type that differ by type (D-B-113). The editor label and its two options are the same for every type.

## 7. Risks

- The user rule "no type-specific words" (D-B-113) stays. The flow sense is data, not wording. The library defaults in D-B-125 are type-specific data. The `mep-domain-checker` confirms them.
- Arrows that scale with the zoom are small at a low zoom and large at a high zoom. The `ux-designer` reports how it looks. The user decides on a limit after the Windows test.
- The ring label sits to the right of the ring. An arrow that points up and to the right crosses it. T04 and the `ux-designer` decide: move the label, or draw the arrow behind it.
- Several rings close to each other (two risers in one shaft) draw arrows over each other. T04 reports what it sees with two rings at 20 pt distance.
- A group of two risers on one network has one main level for the group. The spans of both risers point away from it (or toward it for a `return` type). Two risers of one group can have different network types, so different senses. T02 tests this and reports what it does.
- A riser whose network type is changed on one level (retag) changes the sense. T05 checks that the arrows update.
- A project saved by version 24 does not open in an older app (as for every schema step). This is the same as `flowUnit` in version 19.
- `risers.png` shows the arrows at 60 degrees. A user can read "up and to the right" as a direction on the page. The picker says "up" and "down" in words (levels), not directions on the page.
- The change of the arrowheads on segments (T07) changes what the user saw in B7. The test script says so.
- Not run by any agent: a real browser profile, Windows display scaling, Tauri. State this in each report.
