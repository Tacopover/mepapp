# B8: riser arrows

Status: **planned 2026-11-26. Nothing is built.** Stream `buildings`, part id `B8`. It needs B7 (flow through risers, branch `worktree-buildings-b7`, tested by the user on Windows, merge pending). B5 (shared coordinate system) stays deferred.

Source of the request: the user, 2026-11-26, after the Windows test of B7 ("I also tested the riser functionality and it works correctly"). The picture of the user is `fixtures/risers.png` (untracked in the main checkout). A copy is committed next to this plan: `.claude/plans/buildings-b8-riser-arrows.png`.

Words in this plan:
- A **ring** is the purple circle of a riser on the canvas of one level. It is a free anchor (dashed ring, no segment yet) or a marked fitting (solid ring, a segment ends there). Both exist in the code (`riserAnchors.ts`, `riserMarks.ts`).
- A **span** is the part of a riser between two member levels that are next to each other.
- A **pictogram** is one of the eight arrow combinations of `risers.png`.
- **Below** and **above** are the two halves of a pictogram. "Below" is the span to the next lower member level. "Above" is the span to the next higher member level.

## 1. What the user wants

1. After the user makes a riser, no arrows show. The rings show on the other levels, as today.
2. When the user connects segments, terminals or equipment, and the direction of the flow is not in doubt, the arrows show on every ring of the riser.
3. The arrows take the color of the network type. They also take its line pattern (solid, dashed, dotted and so on), if that is possible.
4. When the direction stays in doubt, the user can choose one of the eight pictograms by hand for a ring.
5. Later (part B of this plan, after the user has tested part A): the Risers tab of Manage Buildings shows the direction in its diagram.

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

The model is one pair for each ring: `below` and `above`, each `up`, `down` or `none`. Eight of the nine pairs are pictograms. The pair (`none`, `none`) means "no arrow".

Both halves of a span agree. A span has one direction. The ring on the lower level uses it as its `above`. The ring on the upper level uses it as its `below`. So the derived arrows of two neighbor rings never disagree.

The picture is the spec of the drawing: the shaft is a line at about 60 degrees from the horizontal. The arrowhead is a small filled triangle. The ring is small and the arrows are about seven ring radii long (ring radius 10, arrow 70, in the picture). The text in the picture is only a label for this plan. The app does not draw it.

## 3. State of the code (checked 2026-11-26 on `worktree-buildings-b7` at `5aa3719`)

- `packages/core/src/riser.ts`: `Riser` has `flow: 'up' | 'down' | 'both' | 'unknown'` (a hand-set direction) and `sourceLevelId?`. `RiserMember` has `levelId`, `sheetId`, `pageIndex`, `fittingId`, `connectionHeightMm?`. The building file has `BUILDING_SCHEMA_VERSION = 1`. An unknown field stays when the app reads a file.
- `packages/core/src/riser-flow.ts` `deriveRiserFlow(file, perLevelFlow)`: one direction word for a whole riser (`up`, `down`, `both`) from the source level. A hand-set flow or source level wins.
- `packages/core/src/building-flow.ts` `solveBuildingFlow`: the spans (`BuildingFlowSpan`, `fromLevelId`, `toLevelId`, `capacity`, `state`), the members (`role`: `source`, `entry`, `exit`, `open`, `none`), the groups (`sourceLevelId`, `atMost`). It gives a source for a group, or none. With no source it uses the highest rule and marks `atMost`. **The orientation of `fromLevelId` and `toLevelId` against the flow is not written in the type. T01 reads the code and writes it down.**
- `packages/render/src/scene.ts` `redrawOverlay` (about line 6278 to 6335) draws the rings and the ring labels. `RiserMark` (`riserMarks.ts`) and `RiserAnchor` (`riserAnchors.ts`) are the data that the UI gives to the scene (`setRiserMarks`, `setRiserAnchors`). A free anchor only shows on a page that has a segment of its network type (`visibleRiserAnchors`). The label of a ring sits at the right of the ring (`ringRadius + 4` pt), so an arrow that points up and to the right can cross it.
- Line patterns: `scene.ts` has `DASH_PATTERN_WORLD` and `strokeDashedPolyline` for a segment with a non-solid `linePattern`. `BuildingRisersDiagram.tsx` has `dashArrayOf(pattern)` for the SVG diagram.
- `packages/ui/src/useBuildingRisers.ts` (about line 696) calls `scene.setRiserMarks(marks)` and `scene.setRiserAnchors(buildRiserAnchors(...))`. The flow numbers reach the scene by a live path (`riserFlowSync.ts`, `useRiserFlowInputs.ts`).
- `BuildingRisersPane.tsx` has the hand-set controls (`Direction`, `Source level`, "Use the flow solve") and the box "Flow direction" with the text `Up · source: Level 0 · from the flow solve` (`riserInfo.ts` `riserFlowText`).
- The canvas arrowheads on a segment (D-B-95, `flowArrow.ts`, `scene.ts` `syncFlowLabels`) use `FlowResult.segmentDirection`. The doc comment in `flow.ts:60` and the code at `flow.ts:254` say: the direction is leaf to root, **toward the source**. The arrowhead of a supply duct then points to the air handling unit. See D-B-118 and D-B-123.

## 4. Decisions

Add these to the ledger as `decision` events and show them on the dashboard before T01. Ids continue after D-B-117.

- **D-B-118 (user): what direction does a riser arrow show?** The solver knows the main level (the source) and nothing else. The real fluid goes away from the source in a supply network and toward it in a return, extract or drain network (D-B-74).
  - A (recommended): away from the main level, for every network type. It is one rule, with no type-specific part (the user asked for that on 2026-11-26: "all network types the same terminology for now"). The user fixes a return riser by hand (D-B-119). A later part can add a flag on the network type.
  - B: add an optional flag to the network type (`toward the source`), set for return air, exhaust air and sanitary waste in the library. It changes the project file (schema 23 to 24) and the type-specific wording rule. Stop and ask first.
  - C: a switch on each riser, "away from" or "toward" the main level.
  - T01 writes the function with one input `sense: 'away' | 'toward'`. The default is the answer.
- **D-B-119 (user, file format): where does the hand-set pictogram live?** Recommended: an optional field on `RiserMember` in the building file, `arrows?: { below: 'up' | 'down' | 'none'; above: 'up' | 'down' | 'none' }`. No schema bump (an older app keeps an unknown field, and ignores it). One ring, one pair. Alternative: a list on `Riser` keyed by level id. Stop and ask: the building file format changes.
- **D-B-120 (provisional): when do the arrows show?** A (recommended): as soon as the riser has a main level (a source on one member level, or the level that the user set), every span shows its direction. B: a span shows only when the far level holds a segment or a terminal. A is simpler and gives feedback at once. The rings of a riser with no source show no arrow (D-B-88, D-B-95: no direction without a source).
- **D-B-121 (provisional): hand-set pictogram and the neighbor.** A hand-set pictogram changes only the arrows of its own ring. The neighbor ring keeps its own arrows. When two rings disagree on a shared span, the Risers tab shows a warning ("Arrows disagree on the span Level 1 to Level 2"). Alternative: a ring choice sets the span on both sides. It is harder to explain.
- **D-B-122 (provisional): the drawing.** The picture of the user is the template (section 2). The size of the arrows is constant on the screen at any zoom (like the ring). `ux-designer` sets the final length, the width and the place of the ring label.
- **D-B-123 (user): the old arrowheads on segments.** They point toward the source (section 3). With D-B-118 A the riser arrows point away from the source. Both on one page contradict each other. A (recommended): flip the segment arrowheads to "away from the source" in B8 (T05, one swap in `flowArrowEnds` and its tests, with the same words in the test script). B: leave them and write the contradiction in the test script. C: leave them until the type flag of D-B-118 B exists.
- **D-B-124 (provisional): the order of precedence.** Hand-set pictogram of the ring, then the hand-set direction and main level of the riser (`riser.flow`, `riser.sourceLevelId`), then the flow solve. A hand-set `flow: 'up'` or `'down'` without a main level gives that direction on every span. `'both'` without a main level gives no arrow (the split point is not known).

## 5. Tasks

Part A (canvas). Part B (Risers tab) starts only when the user has tested part A and says go. One task lead for each task, `ux-designer` first for T04 and T06, `journey-tester` last for T04 and T06.

### B8-T01 (core): the direction of each span, and the pair for each ring

- New file `packages/core/src/riser-arrows.ts` (pure, no I/O) and its test file.
- `riserSpanDirections(file, flow, options)`: for each riser, for each span, `'up' | 'down' | 'unknown'`. Input: the building file, the result of `solveBuildingFlow` (and `deriveRiserFlow` for the hand-set values), `options.sense` (D-B-118). A span is `up` when the flow goes to the member with the higher elevation. Two levels with the same elevation give `unknown`.
- `riserRingArrows(file, flow, options)`: for each riser and member, the pair `{ below, above }`, with the hand-set `member.arrows` over the derived pair (D-B-124). A member at the end of the chain has `none` on the side with no span.
- Write the orientation of `BuildingFlowSpan` into its doc comment.
- Tests (write them first). Use a table with these cases and all eight pictograms: a source on the lowest level; on the highest; in the middle (pictogram 7 there, 1 or 4 on the levels between, 3 and 5 at the ends); a source level set by hand; no source (no arrows); two sources (no arrows, as in D-B-77); a riser with two levels; a group of two risers on one network; a hand-set `flow`; a hand-set pictogram; `sense: 'toward'` (pictogram 8 at the source level); equal elevations.

### B8-T02 (core): hand-set pictogram in the building file

Only after D-B-119.
- `RiserMember.arrows?`. A function `setMemberArrows(file, riserId, levelId, pair)` and `clearMemberArrows(file, riserId, levelId)` in `riser-edit.ts`, in the style of `setRiserProps`. `validate` in `building.ts` accepts the field and refuses another value. A pair (`none`, `none`) is the same as "no arrow" and is stored as such. It is not the same as "no hand-set value". Use a separate "Use the flow solve" action to clear.
- `riserWarnings`: the warning of D-B-121.
- Tests: write, read, round trip of a file, an old file without the field, a bad value, an older app (unknown field kept).

### B8-T03 (render): draw the arrows at a ring

- `RiserMark` and `RiserAnchor` get an optional `arrows?: { below, above }` and `color`, `linePattern`.
- A pure function `riserArrowShapes(pair, centerPt, ringRadiusPt, scale)` returns the shaft ends and the arrowhead points. Test it (eight pictograms, no arrow, scale).
- `redrawOverlay` draws the shaft with the line pattern of the network type (reuse `strokeDashedPolyline`; a pattern that does not fit a short shaft falls back to solid) and a solid arrowhead, in the color of the network type. It draws for anchors and for marked fittings. Check that the arrows stay in view and do not hide the ring label. `ux-designer` sets the rule.
- Tests next to the shape function. A no-flag test: a scene with no `arrows` draws what it drew before.

### B8-T04 (ui): the arrows follow the live flow

- `useBuildingRisers.ts` computes `riserRingArrows` from the live building flow (the same data as the capacities) and gives the pair to the scene with the marks and anchors. The arrows update when the user connects or removes a segment, a terminal or an equipment, without a save (like the numbers in B7). Names, colors and patterns come from the network type of the riser.
- Screen task: `ux-designer` first. Write the journeys: make a riser (no arrows); add a source on one level (arrows on every ring); add a terminal; remove the source (arrows go); two sources; a level that is not open (the arrows of the open level still show). `journey-tester` last.
- Browser check with real DOM inputs, in the real web store, one Chromium page. Screenshots of the eight pictograms (hand-set, T05) and of three network types with three line patterns.

### B8-T05 (ui): choose a pictogram by hand

- Right-click on a ring: the menu gets "Riser arrows" with the eight pictograms (small pictures with a tooltip text such as "Comes up, goes up") and "Use the flow solve". The Properties panel of a riser fitting shows the same choice. `ux-designer` decides which of the two, or both.
- Writes `member.arrows` through the edit functions of T02. Undo is the way of the building file (as the other riser actions).
- The marks that the user set by hand show a small mark ("Set by hand") in the Properties panel and in the Risers tab.
- If D-B-123 is A: flip the arrowheads of the segments here.

### B8-T06 (Windows test script and records, part A)

- Add Part M to `.claude/plans/buildings-b7-test.md`, or a new file `.claude/plans/buildings-b8-test.md` (the lead chooses; one file is easier for the user). Steps for the eight pictograms, three network types, a level that is not open, and a hand-set pictogram.
- Mark the status of this plan. Ledger events, mirror to the dashboard, screenshots to the dashboard.

### Part B (after the user says go)

- **B8-T07 (ui): the Risers tab diagram.** `BuildingRisersDiagram.tsx` shows the direction of each span: a small arrowhead on the lane, in the color and pattern of the lane (`dashArrayOf`). The input is `riserSpanDirections`. A span with no direction shows nothing. `ux-designer` first (a wireframe on the dashboard). The old box "Flow direction" text and the words `Up`, `Down`, `Both` (D-B-74) need a decision: keep, or replace by the arrows plus a neutral word. Put the question on the dashboard.
- **B8-T08:** Windows test steps, records.

## 6. Out of scope

- A supply or return flag on the network type (D-B-118 B), unless the user chooses it.
- Arrow for the segments of an electrical or other network on a canvas, other than the existing arrowheads.
- A change of the capacity numbers of B7.
- B5 (shared coordinate system).
- A fluid-flow calculation. The arrows show the direction of the capacity path (from the main level). They show no pressure or speed.

## 7. Risks

- The ring label sits to the right of the ring. An arrow that points up and to the right crosses it. T03 and the `ux-designer` decide: move the label, or draw the arrow behind it.
- Several rings close to each other (two risers in one shaft) draw arrows over each other. T03 reports what it sees with two rings at 20 pt distance.
- A group of two risers on one network has one main level for the group. The spans of both risers point away from it. T01 tests this.
- A long arrow can cover a drawing detail. The arrow is semi-transparent or thin. The `ux-designer` decides, and the user checks on Windows.
- `risers.png` shows the arrows at 60 degrees. A user can read "up and to the right" as a direction on the page. The legend in the picker says "up" and "down" in words (levels), not directions on the page.
- B8 changes the user-visible meaning of the old arrowheads only with D-B-123 A.
- Not run by any agent: a real browser profile, Windows display scaling, Tauri. State this in each report.
