# UX spec B8-T09: flow direction in the Risers tab

Task: show the direction of each riser span in the diagram, and replace the words of the box "Flow direction". Small change of an existing screen (Manage Buildings, tab Risers). Written 2026-11-27. Read: rules, ux-lessons, ui-guide, ux-checklists, plan B8 (sections 1-4, 7, 8, Part B), `buildings-b8-test.md`, `BuildingRisersDiagram.tsx`, `BuildingRisersPane.tsx`, `riserDiagram.ts`, `riserInfo.ts`, `riserCapacity.ts`, `riser-arrows.ts`, `theme.css` (block "Risers tab diagram").

No data model change. No file format change. No new platform API. Decision D-B-143 A (provisional) is kept: the Direction select, the Source level select, "Use the flow solve" and the stored `riser.flow` do not change.

## 0. Answers to the four questions (short)

1. **Input:** the diagram follows the flow solve (`riserSpanDirections`), not the hand-set ring pair (`member.arrows`). Reason in section 1.
2. **Geometry:** one filled triangle on the lane, 10 px long and 12 px wide, centred on the middle of the span, lane colour, 2 px outline in `var(--surface)`. The head is always solid. The lane under it keeps the line pattern. Section 5.
3. **Accessibility:** the lane `aria-label` gets the tail `, flow away from <main level>` or `, flow toward <main level>`. Each arrowhead has an SVG `<title>`. The arrows are `aria-hidden`. The shape carries the direction, not the colour.
4. **Legend:** yes, one new row "flow direction" with a small neutral triangle.

## 1. Concepts, and the input question (Q1)

Concepts the user already has: riser, level, main level (Capacity block, "Main level: Level 0"), flow direction away from or toward the main level (Direction in the network type editor, canvas arrows of B8 part A). The words "up" and "down" mean higher and lower levels. No new concept. "Span" stays in the code: the user sees "Level 0 to Level 1".

**Q1: which input?** Recommendation: `riserSpanDirections(file, buildingFlow, riser => riser.networkType)`. Reasons:
- A span has one direction. A ring has two ends of two spans. A hand-set pair can say "up" at the top end of a span and "none" at the bottom end. The diagram cannot show a half span.
- The Risers tab is a view of the building. The hand-set pair is a drawing choice for one ring (D-B-119, D-B-121).
- The Capacity block of the same tab already shows the flow solve. The arrows then agree with the numbers on the same screen.
- It uses the same function and the same sense (copy of the type in the riser, D-B-130 B) as the rings on the canvas. Without a hand-set ring the diagram and the canvas always agree.

What the user sees when a hand-set ring disagrees: the ring on the canvas shows the hand-set pictogram. The diagram shows the flow solve. The row of that level in the info card has the tag "Arrows set by hand" (T06, exists). Two neighbour rings that disagree get the warning of D-B-121 (exists). A hand-set ring against the flow solve gets no warning (D-B-134, unchanged). New in this task: one grey line in the box "Flow direction" when the selected riser has at least one hand-set ring (text in section 4). No data change.

## 2. Journeys

J1 (see the direction, from a closed dialog, 3 steps). Goal: know which way the supply riser flows. Start: building with a supply riser, source on Level 0. (1) Open Manage Buildings. (2) Click the tab "Risers". The diagram shows an arrowhead in each span, pointing up. (3) Click the lane: the box says "Away from Level 0 · from the flow solve". The arrows show with no click on the lane (2 steps for the arrows, 3 for the words).

J2 (supply next to return, 0 extra steps). The Return Air lane shows arrowheads that point down, the Supply Air lane up, on the same screen. The user clicks the return lane (1 step): "Toward Level 0 · from the flow solve".

J3 (no source, then a source by hand, 3 steps). Start: riser with no source, no arrows. (1) Click the lane: the box says "No arrows yet: no source level." (2) Click "Set by hand" in the Capacity block. (3) Choose a level in "Source level". The arrows show at once. The box says "Away from Level 1 · Set by hand".

J4 (repeat 3 times, L3, 3 steps). Click 3 lanes one after the other, or use the arrow keys. Each click changes the box. The diagram, the legend and the scroll position stay. No dialog closes.

J5 (empty start, 0 steps). No riser: the pane says "No riser yet..." (exists). No diagram, no legend, no arrow, no box. A riser with one level: lane with one dot, no arrow, box "No arrows. This riser has one level."

## 3. Entity by action and state tables

Entity by action (arrow and box only; riser actions are unchanged).

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Span arrow | derived from the flow solve and the flow direction of the type (L1) | none, no text | none, derived | none | none | none: the building file has no undo | click on the arrow selects the lane (the arrow is inside the lane hit area) |
| Flow direction box | derived | none | none | none | none | none | shows the selected riser |

Derive or ask: direction of a span = derived. Main level = derived, or asked by the existing Source level select. Flow sense = asked in the network type editor (T01, exists). Direction select (Up, Down, Both) = asked, exists, not used by the arrows (see O2).

State table (rows of the task). "Arrows" = what the diagram draws on the lane. Box texts are in section 4.

| State | Arrows | Box |
|---|---|---|
| Loading summaries | none | `Reading the saved summaries…` |
| No source | none | `No arrows yet: no source level.` |
| Source at the lowest level, supply | every span up | `Away from <lowest> · …` |
| Source at the highest level, supply | every span down | `Away from <highest> · …` |
| Source in the middle (3+ levels), supply | spans below the source down, spans above up | `Away from <middle> · …` |
| Return type | every arrow reversed to the supply case | `Toward <main level> · …` |
| Two sources | none | `No arrows yet: more than one source level.` |
| Group with `atMost` (no source) | none | `No arrows yet: no source level.` |
| Source set by hand | as above | tag `Set by hand` |
| Direction set by hand (Up, Down, Both) | no change | the box text of the state, plus the grey line of section 4 |
| Hand-set ring pair | no change | the grey line of section 4 |
| Riser with one level | none | `No arrows. This riser has one level.` |
| Hidden network type | lane and arrows are not drawn | the box shows the next shown riser (exists) |
| Riser in a group of two risers | each riser has its own sense (own type). The main level is the one of the group. It can be on the other riser. | `Away from` or `Toward` the main level of the group |
| Equal elevations | none on that span | `No arrows. The levels of this riser have the same height.` (only when no span has a direction) |
| Error (summary read fails) | as the flow solve gives (summaries are empty) | as above |

## 4. Texts (word for word)

Box heading stays: `Flow direction`. The box shows one line, plus an optional grey line.

Line 1, in this order of tests:
1. Flow solve not loaded: `Reading the saved summaries…`
2. Riser has one level: `No arrows. This riser has one level.`
3. Group has a main level and at least one span has a direction: `Away from <level name>` (flow sense supply) or `Toward <level name>` (return), then ` · Set by hand` when the riser has its own `sourceLevelId` and the solve uses it, else ` · from the flow solve`.
4. Group has a main level, no span has a direction (equal elevations): `No arrows. The levels of this riser have the same height.`
5. No main level: `No arrows yet: <reason>.` The reason is `unknownReasonText` of the Capacity view: `no source level`, `more than one source level`, `the risers make a loop`, `two main levels set by hand`. A group with `atMost`, or with no reason text, gives `no source level`.

Line 2 (grey, `--muted`, 12 px, only when it applies; one line each, the first one first):
- `Direction set by hand: Up. The diagram and the sheets do not use it.` (also `Down`, `Both`). Shows when `riser.flow` is not `unknown`. It tells the user why the arrows did not follow the Direction select.
- `Some rings use arrows set by hand. The diagram shows the flow solve.` Shows when any member of the selected riser has `arrows`.

Diagram:
- Arrow title (tooltip), flow order of the two names: `Flow goes up: Level 0 to Level 1`, `Flow goes down: Level 2 to Level 1`.
- Lane `aria-label`: the existing text, then `, flow away from <main level>` or `, flow toward <main level>`. Add it only when at least one span has a direction. Example: `Supply air 1, Basement to Level 2, 4 levels, flow away from Level 0`. A lane with no arrow keeps the old text.
- Legend row: `flow direction` (lower case, as the other rows).

Removed: the words `Up`, `Down`, `Both` and `source:` from the box. They stay in the Direction select only. `riserFlowText` (and its 7 tests) change: the new text needs the Capacity view and the span directions as input. `byHand` (used for `showSelects`) keeps its rule.

## 5. Geometry (Q2)

- Shape: isosceles triangle, 10 px long along the lane, 12 px wide at the base. Up: tip at `(x, y - 5)`, base `(x - 6, y + 5)` and `(x + 6, y + 5)`. Down: mirror. `y` is the middle between the two dot centres of the span (`dot.yPx` of the two levels). One head for each span, whatever its length.
- Fill: the lane colour. Outline: `stroke: var(--surface)`, `stroke-width: 4`, `paint-order: stroke`, `stroke-linejoin: round` (2 px show). The outline cuts the lane line and the level line around the head, so a dashed or dotted lane does not run through the tip. No dash array on the head: it stays solid, as on the canvas (T04: pattern on the shaft, solid head). The lane under it keeps the pattern. This is the only way to keep the head readable on a 4 px dotted lane. (The brief says "in the lane pattern": the pattern stays on the lane, not on the head.)
- Short span (48 px between dot centres): the free lane is 48 - 2 x 8.5 = 31 px (dot ring r 7 + 3 px stroke). Head and outline are 14 px. 8.5 px stay free at each end. The head never touches a dot or a status mark (the marks are inside the dot).
- Long span: one head in the middle. A level line crosses the head when the span has two neighbour levels (the middle is the level line). The outline cuts it. Accepted.
- Selected lane: the halo is 30 px wide, accent-soft. The head sits on it. Class `mep-rd-arrow--selected`: outline `var(--accent-soft)` so no white edge shows.
- Lane label: at `y = 16`, above the top dot (top dot at 32 px or lower). Arrows are between dots only, so they never touch it.
- Side by side: lane step is 84 px (+24 px between two types). A head is 12 px wide. Nothing overlaps. The hit area (44 px) already contains the head. A click on a head selects the lane.
- Scroll: the arrows are in the same SVG, so `.mep-rd-scroll` scrolls them with the lanes. Layout width and height do not change.
- Dark theme: the app has no dark theme (`theme.css` has no dark block; the B8 test script says so). Colours come from `var(--surface)` and `var(--accent-soft)`, so a later theme works. The contrast of the head equals the contrast of the lane colour on the surface. A pale type colour is as pale as its lane today. Not changed here.
- New CSS classes: `mep-rd-arrow`, `mep-rd-arrow--selected`, `mep-rd-legend-arrow`. No hard-coded colour.

## 6. Accessibility (Q3)

- The lane keeps `role="radio"`. The `aria-label` gets the tail of section 4. The tail names the sense and the main level, not each span (the Capacity list has each span).
- Each head: `aria-hidden="true"` and a `<title>` for the mouse tooltip. A title in an aria-hidden node is not read: this is wanted.
- Colour is not the only carrier: the triangle points up or down. The lane label, the box and the title give the same in words.
- Keyboard: no new tab stop. The arrow keys, Home, End, Enter and Space work as now.

## 7. Layout (wireframes)

No new section. The diagram is the major block, the info card the second block (order unchanged: filter row, diagram, warnings, info card). The box stays in the info card, below the Capacity block. The legend is the small block at the right of the diagram (1600) or under it (760, rule `max-width: 1199px`).

One lane, 3 levels, 1600 px (the span is 64 px; `^` = head up, `v` = head down; `O` = dot):

```
 source at the lowest level      source at the highest level     source in the middle (3 levels)
 (supply)                        (supply)                        (supply)
  Supply air 1                    Supply air 1                    Supply air 1
 Level 2 ----O----               Level 2 ----O----               Level 2 ----O----
              |                               |                               |
              ^                               v                               ^
              |                               |                               |
 Level 1 ----O----               Level 1 ----O----               Level 1 ----O----   (source)
              |                               |                               |
              ^                               v                               v
              |                               |                               |
 Level 0 ----O----               Level 0 ----O----               Level 0 ----O----
   (source)                                      (source)
```

Supply next to return (source at Level 0). Each lane has its own colour and pattern (the return lane is dashed here):

```
 Supply air 1        Return air 1        | legend (112 px)
 Level 2 ---O----------O-----------      |  O  at position
            |          :                 |  (o) waiting
            ^          v                 |  (x) not at position
            |          :                 |  ^  flow direction
 Level 1 ---O----------O-----------      |
            |          :
            ^          v
            |          :
 Level 0 ---O----------O-----------
```

1600 px grid: levels column 130 px, diagram `1fr`, legend 112 px. 760 px: the same diagram scrolls inside `.mep-rd-scroll`, the legend wraps under it as a row of 4 items (`flex-wrap`). The info card stacks (exists).

## 8. Platform table (L8)

Not applicable: the task uses no platform API (no picker, no path, no drag and drop, no save). The data comes from the stored summaries that B7 already reads. Items that the headless check cannot show, for the Windows test script (T10):
1. Hover an arrowhead with the real mouse: the tooltip shows the text of section 4 (the headless browser has no tooltip).
2. At display scaling 125 % and 150 %: the head is clear, the outline does not blur, the head does not touch a dot.
3. A dotted lane (type with "Dotted") next to a solid lane: the head reads on both.
4. With a screen reader or with the browser zoom 200 %: the lane label has the tail "flow away from ...".
5. A building that has a closed level with no stored summary: the arrows show after "Read summaries now" (as the numbers).

## 9. Screenshots for the browser check

Name them `B8-T09-<name>`. Real DOM clicks on the tab and the lanes.
1. `supply`: one supply riser, 3 levels, source at the lowest level, lane selected, box text.
2. `return`: supply and return side by side (J2), return lane selected.
3. `nosource`: group with no source: no arrow, box "No arrows yet: no source level."
4. `middle`: 4 levels, source at the second level: arrows in both directions on one lane.
5. `patterns`: a solid, a dashed and a dotted lane: the head on each.
6. `short`: two levels at 48 px (equal gap), selected, to check the free space next to the dots and the halo.
7. `narrow`: 760 px wide, legend under the diagram, horizontal scroll with 6 lanes.
8. `handset`: one hand-set ring and a hand-set Direction: the grey lines.
9. Dark theme: not applicable (the app has none). Say so in the report.
The check also reads: the `aria-label` tail, the `<title>` of one head, the count of heads (one for each span with a direction), and that a click on a head selects its lane. The check must fail before the change (L18): no `.mep-rd-arrow` in the old build.

## 10. Open questions

- **O1 (provisional ok):** the diagram follows the flow solve and not the hand-set ring pair. Recommended. Reverse: change one input of the diagram. Alternative: draw the hand-set pair where both ends agree. Not recommended (two sources for one picture).
- **O2 (provisional ok; raise again after the Windows test):** the Direction select (Up, Down, Both) changes no arrow, no number and no box text. Only the Excel takeoff column reads it. That is a dead control (L14). D-B-143 keeps it, so this task adds only the explaining grey line. Recommended later: remove the select, or give it an effect. This needs a decision about the stored `riser.flow` data, so it is not part of this task.
- **O3 (provisional ok):** the legend gets the row "flow direction". Alternative: no row, tooltip only. Recommended: row, because every mark in the diagram is then explained.
- **O4 (provisional ok):** head size 10 x 12 px, one head in the middle of each span. The user judges the size in the Windows test. A change is one constant.

Not in this task: arrows for a riser end (open or capped), a direction word for each span in the Capacity list, a flow arrow on the lane of a riser with a source on another riser's level only, a dark theme, a change of the Direction select.
