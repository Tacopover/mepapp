# B8: riser arrows

Status: **planned 2026-11-26, revised the same day after the answers of the user (section 4) and after the audit and the domain check (section 8). Nothing is built.** Stream `buildings`, part id `B8`, branch `worktree-buildings-b8` (made from `master` 9ad5869). B7 (flow through risers) is on `master`. B5 (shared coordinate system) stays deferred.

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

## 3. State of the code (checked 2026-11-26 on `master` at `9ad5869`)

- `packages/core/src/riser.ts`: `Riser` has `flow: 'up' | 'down' | 'both' | 'unknown'` (a hand-set direction), `sourceLevelId?` and a copy of its network type (`networkType`). `RiserMember` has `levelId`, `sheetId`, `pageIndex`, `fittingId`, `connectionHeightMm?`. The building file has `BUILDING_SCHEMA_VERSION = 1`. An unknown field stays when the app reads a file.
- `packages/core/src/network.ts` `NetworkType`: `id`, `name`, `discipline`, `units`, `defaultCapacity`, `color`, `lineWidthPt`, `linePattern`, `flowUnit?`, `sizingMethod?`. It has no flow sense. `network-type-library.ts` `NETWORK_TYPE_LIBRARY` holds the 14 default types (supply-air, return-air, exhaust-air, chilled-water, heating-water, domestic-cold-water, domestic-hot-water, sanitary-waste, conduit, cable-tray, branch-circuit, feeder, wet-standpipe, dry-standpipe). A project document holds its own copy (`ProjectDocument.networkTypes`). The project file is at schema version 23 (`CURRENT_SCHEMA_VERSION`, `project.ts`). The precedent for an optional field on the network type is `flowUnit?` (migration step 18 to 19: the step only advances the version, so that an older app refuses the file and does not drop the field).
- `packages/ui/src/components/NetworkTypeEditorDialog.tsx` is the network type editor. `NetworkTypeEditPatch` lists the editable fields. `scene.ts` `updateNetworkType` (about line 2755) takes the same list.
- `packages/core/src/riser-flow.ts` `deriveRiserFlow(file, perLevelFlow)`: one direction word for a whole riser (`up`, `down`, `both`) from the source level. A hand-set flow or source level wins.
- `packages/core/src/building-flow.ts` `solveBuildingFlow`: the spans (`BuildingFlowSpan`, `fromLevelId`, `toLevelId`, `capacity`, `state`), the members (`role`: `source`, `entry`, `exit`, `open`, `none`), the groups (`sourceLevelId`, `atMost`). It gives a source for a group, or none. With no source it uses the highest rule and marks `atMost`. `fromLevelId` is the lower level and `toLevelId` the upper level of the span (`riser-quantities.ts:76-77`). **The span has no field that says which end is nearer the source.** The tree orientation lives only inside `solveBuildingFlow` (`parentEdgeOf`, `building-flow.ts:365`). T02 adds the field (section 8, H2). A group with no source still has spans with `state: 'ok'` and `atMost` (`building-flow.ts:328-337`).
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
- **D-B-124 (changed 2026-11-26 after the audit, M7, and the domain check, finding 1): the order of precedence.** Hand-set pictogram of the ring, then the flow solve of the building (`solveBuildingFlow`) with the flow sense. The main level comes from the solve only (it already reads `riser.sourceLevelId`, the level that the user set). The hand-set word `riser.flow` is NOT used for the arrows: in B7 it means "away from the main level", so a literal reading would show wrong arrows on a `return` riser, and the solve ignores it. A riser with no main level shows no arrow (D-B-120). The director changed the first version of this decision (a literal hand-set direction). It stays provisional.
- **D-B-125 (provisional, new): the flow sense of a network type.**
  - Field: `NetworkType.flowSense?: 'supply' | 'return'`. The editor label: "Flow direction". The options: "Supply (away from the source)" and "Return (toward the source)". The wording is the same for every type (D-B-113). The name of the field is a proposal.
  - Project file: schema 23 to 24. The step is pure and idempotent. It writes the library value on every type in the project whose id is in the library and that has no value. A type with another id (a type of the user) stays without a value. The step uses a frozen table of the three `return` ids inside the step (not the live library). The reason for the step: `flowSenseOf` already falls back to the library by id, but `duplicateNetworkType` makes a copy with a new id, and without a stored value a copy of exhaust-air would become `supply`. An older app refuses a version 24 file (as for `flowUnit`). Tests: the step, an old file, a second run, the refusal by an older app, the duplicate case. Schema 24 is free (audit M1, 2026-11-26).
  - Reading: one function `flowSenseOf(type)` in core. It returns `type.flowSense`, else the library value of the same id, else `supply`. The building file has no version bump and no migration, so the copy of the network type in a riser (`riser.networkType`) of an old building file has no value. `flowSenseOf` covers it.
  - A bad value is dropped at load (like `withCleanSizing` does for `flowUnit`). It does not throw: a throw would block the file of the user.
  - Defaults in `NETWORK_TYPE_LIBRARY`: `return` for return-air, exhaust-air and sanitary-waste. `supply` for the other eleven. The `mep-domain-checker` accepts these. It reports two gaps: see D-B-127 and D-B-128.
  - The editor shows the effective value for a type that has none (`flowSenseOf` of the type given to the dialog). Saving the editor writes the value.
  - A duplicate of a type keeps the value of its source. There is no other way to make a type today.
- **D-B-126 (provisional, new; audit H1): how the editor change reaches the copy in the riser.** The editor save calls `scene.updateNetworkType` only. It writes `doc.networkTypes` and nothing else. `riser.networkType` is written only by `makeRiser` and by the retag path. So a change of color or `flowUnit` does not reach the riser copy today. The riser arrows read the copy. The segment arrowheads (T07) read the document type. They would disagree after an edit.
  - A (recommended): the save of the editor also writes the new type into `riser.networkType` of every riser with that id in the open building. Other levels keep their value until the user opens and saves them.
  - B: the riser arrows read the live type of the open document when one is open, else the copy.
- **D-B-127 (provisional, new; domain finding 2): return pipes of water systems.** The library has one type for each of chilled water, heating water and domestic hot water. A real circuit has a supply pipe and a return pipe, and both use the one type. The return pipe then shows `supply` arrows. D-B-113 says: no specific changes to the network types for now.
  - A (recommended): add no library type now. A user who needs a return pipe makes a copy of the type and sets Return in the editor (the editor allows it). The plan and the Windows script say so.
  - B: add the library types `chilled-water-return`, `heating-water-return` and `domestic-hot-water-return` with `return`.
- **D-B-128 (provisional, new; domain finding 4): conduit and cable tray have no flow.** D-B-125 gives them `supply`, so arrows show on their risers.
  - A (recommended): keep `supply` (the user asked for supply or return). The user can change it. Show it in the test script.
  - B: add a third value `none` (no arrows, no arrowhead) and make it the default of these two.
  - The words "toward the source" in the editor: the domain checker notes that a sewer outlet is not a source. T01 uses the word "source equipment", as B7 does for every type (D-B-113). The `ux-designer` may find a better neutral word.

## 5. Tasks

Part A (canvas). Part B (Risers tab) starts only when the user has tested part A and says go. One task lead for each task. `ux-designer` first and `journey-tester` last for T01 (small), T05, T06 and T09. Show the wireframe, the journeys and the texts on the dashboard (event `decision`, kind `ux`) before the implementation of a screen task.

### B8-T01 (core and ui): the flow sense of a network type

- Core: `NetworkType.flowSense?`, `flowSenseOf(type)`, the library defaults, the migration step 23 to 24 in `project.ts` (D-B-125), a bad value dropped at load, tests first. Update the types that list the editable fields (`NetworkTypeEditPatch`, `scene.ts` `updateNetworkType`: take `flowSense` out of `visual` in the destructuring and use the "delete when undefined" pattern, so that a flow-sense-only patch does not redraw the drawing layer). `toNetworkTypeCopies` (`rooms/placement-rule.ts:697-708`) copies each field by hand and drops `flowUnit`, `sizingMethod` and `flowSense`: copy `flowSense` there if it is valid, or note the limit in the report. Change the hard-coded expectation of 23 in `group-networks.test.ts:75-76` to 24.
- Riser copy (D-B-126, option A unless the user answers B): the save of the editor also writes the new type into `riser.networkType` of every riser with that id in the open building. Tests for it.
- UI: one select "Flow direction" in `NetworkTypeEditorDialog.tsx`, with a short hint of one sentence. Where the dialog shows a summary of a type (the Networks tab), check if the value belongs there. The `ux-designer` decides.
- The change reaches the riser copy (see D-B-125). The save of a project writes the field. A project that is not migrated (an old file) opens and shows the library defaults.
- Tests: core (migration, `flowSenseOf`, library), ui (editor patch). A no-flag check in the real web store: open the editor, change a type, save, reopen. Screenshot of the editor.
- Stop and ask the user first if the project file format needs more than D-B-125 says.

### B8-T02 (core): the direction of each span, and the pair for each ring

- New file `packages/core/src/riser-arrows.ts` (pure, no I/O) and its test file.
- First, in `building-flow.ts`: add to `BuildingFlowSpan` an optional field `towardSource?: 'from' | 'to'` (which end is nearer the source). Set it in `solveBuildingFlow` from the `parentEdgeOf` edge. It is absent when the group has no source. Write the orientation of `fromLevelId` (lower level) and `toLevelId` (upper level) in the doc comment. Tests in `building-flow.test.ts`. Do not use the elevation against `group.sourceLevelId` (it fails when the source is reached through another riser of the group, or when one node holds several levels).
- `riserSpanDirections(file, flow, networkTypeOf)`: for each riser, for each span, `'up' | 'down' | 'unknown'`. The only input for the direction is `solveBuildingFlow` (`towardSource`). The hand-set `riser.flow` is not used (D-B-124). "No arrow" is decided by the absence of `group.sourceLevelId`, never by `span.state` (a group with no source has `state: 'ok'` and `atMost`). The sense comes from `flowSenseOf(riser.networkType)`: `supply` means away from the main level, `return` means toward it. A span is `up` when the flow goes to the member with the higher elevation. Two levels with the same elevation give `unknown`. End rows (`toLevelId ''`) are not in `BuildingFlowSpan`.
- `riserRingArrows(...)`: for each riser and member, the pair `{ below, above }`, with the hand-set `member.arrows` over the derived pair (D-B-124). A member at the end of the chain has `none` on the side with no span. A member whose level is not in `file.levels` is dropped, as `sortedMembers` does (`riser-quantities.ts:30-35`).
- Tests (write them first). Use a table with these cases and all eight pictograms: a source on the lowest level; on the highest; in the middle (pictogram 7 there, and 1 or 4 on the levels between, 3 and 5 at the ends); a source level set by hand; no source (no arrows); a group with `atMost` (no arrows); two sources (no arrows, as in D-B-77); a riser with two levels; a group of two risers on one network; a group whose source level is on another riser; a hand-set `flow` of `up`, `down` and `both` (no effect on the arrows); a hand-set pictogram; a `return` type (pictogram 8 at the source level) next to a `supply` type; equal elevations; a member level missing in `file.levels`. Also report what the arrows show for a network with two types joined at an AHU port group (domain finding 3).

### B8-T03 (core): hand-set pictogram in the building file

- `RiserMember.arrows?` (D-B-119). Functions `setMemberArrows(file, riserId, levelId, pair)` and `clearMemberArrows(file, riserId, levelId)` in `riser-edit.ts`, in the style of `setRiserProps`. `building.ts` reads the field next to `connectionHeightMm` (after line 260) and drops a pair with an unknown value on read (it does not fail the whole file: a future app may write other values). A pair (`none`, `none`) is stored as such: "no arrow by hand". It is not the same as "no hand-set value". The action "Use the flow solve" clears the field.
- A hand-set pair can point to a span that is gone (`detachMember` and `attachMember` do not clear the pair of the neighbors). Rule: the arrow is drawn anyway (an open end through the roof is allowed). State it in the report.
- `riserWarnings`: the warning of D-B-121.
- Tests: write, read, round trip of a file, an old file without the field, a bad value (dropped), an older app (the unknown field is kept).

### B8-T04 (render): draw the arrows at a ring

- `RiserMark` and `RiserAnchor` get an optional `arrows?: { below, above }`, `color` and `linePattern` (from the network type of the riser).
- A pure function `riserArrowShapes(pair, centerPt, ringRadiusPt)` returns the shaft ends and the arrowhead points in world units. The arrow length is a fixed constant in world units (it scales with the zoom, D-B-122) and starts at the edge of the ring. The ring radius itself changes with the zoom (`FITTING_MARKER_RADIUS_WORLD + 3/scale` for a marked fitting, `+ 8/scale` for a free anchor, `scene.ts:6282` and `:6288`), so the start point moves with it. Test it (eight pictograms, no arrow, two scales, both ring radii).
- `redrawOverlay` draws the full ring as now, then the shaft with the line pattern of the network type (reuse `strokeDashedPolyline`, `scene.ts:6062`, private, default target `drawingLayer`: pass `this.overlay` as the target; a pattern that does not fit a short shaft falls back to solid) and a solid arrowhead, in the color of the network type. It draws for anchors and for marked fittings. Check that the arrows do not hide the ring label. `ux-designer` sets the rule.
- Tests next to the shape function. A no-flag test: a scene with no `arrows` draws what it drew before.

### B8-T05 (ui): the arrows follow the live flow

**DONE 2026-11-26 (763b1d4).** ui 1297 tests, render 98, build 9 of 9, b8-t05-check 40 passed, no-flag check 8 passed, journey tester and UI reviewer ran. Change from the text below (D-B-130 B): the flow sense comes from the riser copy of the type (`riser.networkType`) on every level. The live type of the open drawing gives only the color and the line pattern. A dashed ring shows no arrow (D-B-132 A).

- `useBuildingRisers.ts` computes `riserRingArrows` from the live building flow (the same data as the capacities) and gives the pair to the scene with the marks and anchors. The effect at `useBuildingRisers.ts:691-728` has the dependencies `[ready, sceneRef, file, sheet, calibration, sceneTick, dismissed]`: add the live flow result and the type copies. `setRiserMarks` redraws on every call, so the scene needs no change. A free anchor draws only on a page that has a segment of its network type (`riserAnchors.ts:12`), so "arrows on every ring" holds where the ring shows. Say so in the journeys. The arrows update when the user connects or removes a segment, a terminal or an equipment, and when the user changes the flow direction of a network type, without a save (like the numbers in B7).
- Screen task: `ux-designer` first. Write the journeys: make a riser (no arrows); add a source on one level (arrows on every ring); add a terminal; remove the source (arrows go); two sources; a level that is not open (the arrows of the open level still show); a supply type and a return type on the same drawing; change the flow direction of a type in the editor. `journey-tester` last.
- Browser check with real DOM inputs, in the real web store, one Chromium page. Screenshots of the eight pictograms (hand-set, T06), of three network types with three line patterns, and of two zoom levels.

### B8-T06 (ui): choose a pictogram by hand

**DONE 2026-11-26 (3364b24).** core 2691, ui 1337, render 102, build 9 of 9, b8-t06-check 78 passed, narrow check 14, no-flag check 10. Built as D-B-133 A (picker in the ring menu and in Properties, "No arrows", "Use the flow solve") and D-B-134 A (warning with the riser name). Open for the user: D-B-136 to D-B-139.

- Right-click on a ring: the menu gets "Riser arrows" with the eight pictograms (small pictures with a tooltip text such as "Comes up, goes up") and "Use the flow solve". The Properties panel of a riser fitting shows the same choice. `ux-designer` decides which of the two, or both.
- Writes `member.arrows` through the edit functions of T03. The action is not undoable, as Direction and Source level in the Risers tab (the building file has no undo stack). "Use the flow solve" reverts it.
- A ring with a hand-set pictogram shows a small mark ("Set by hand") in the Properties panel and in the Risers tab.

### B8-T07 (render and ui): the arrowheads on segments follow the flow sense

- `flowArrowEnds` and `syncFlowLabels` (`scene.ts:3826`, the only reader of `segmentDirection` for drawing, `scene.ts:3848`) get the flow sense of the network type of the segment. `supply`: the arrowhead points away from the source (the flow direction is the reverse of `segmentDirection`). `return`: as today (toward the source). A segment with no direction keeps no arrowhead (D-B-95). The sense comes from the document type, else the library entry of that id, else `supply` (use `flowSenseOf`; the type of a segment may not be adopted, rules.md section 3.4). Keep the flip in render. Do not change `flow.ts`, except the doc comment at `flow.ts:60`.
- Update `flowArrow.test.ts` (the only test that must change). The Windows script `buildings-b7-test.md` has no step that reads the direction. `b7-t09c1-check.mjs` only counts arrowhead graphics. The numbers do not change.
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

## 8. Audit and domain check (2026-11-26)

The `roadmap-auditor` gave FAIL (4 high, 10 medium, 4 low). The `mep-domain-checker` gave PASS_WITH_FINDINGS. The director put every real finding into the plan above.

- Audit H1: the editor save does not reach `riser.networkType`. New decision D-B-126 and a line in T01.
- Audit H2: `BuildingFlowSpan` has no direction. T02 adds `towardSource`.
- Audit H3: "no source" is the absence of `group.sourceLevelId`, not `span.state`. In T02.
- Audit H4: `group-networks.test.ts:75-76` expects 23. In T01.
- Audit M1: schema 24 is free. M2: the step needs a frozen table, the reason is the duplicate, a bad value is dropped. M3: `toNetworkTypeCopies`, the `visual` destructuring. M4: no creation path for a custom type. M5, M6: T07. M7, domain finding 1: D-B-124 changed. M8: T06 has no undo. M9, M10: T04 and T05.
- Audit L1 to L4: status line, T03 and T02 and T01 details.
- Domain findings 2 and 4: new decisions D-B-127 and D-B-128, with a provisional default each.
- Domain finding 3 (AHU intake and discharge types): the plan adds no type. T02 reports what an AHU with two types shows. Domain finding 6 (a `return` drain riser with an up arrow and no pump): a later warning, not in part A.
- Pictograms: the domain checker checked all eight against the picture. They are right.
