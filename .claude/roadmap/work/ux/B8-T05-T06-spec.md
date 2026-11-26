# UX spec B8-T05 and B8-T06: riser arrows on the canvas

Two parts in one file. Part 1 is T05 (the arrows follow the live flow). Part 2 is T06 (the user picks a pictogram by hand). Read the part 1 "Findings" first: two of them change the plan.

Kept decisions: D-B-113 (same words for every network type), D-B-119 (the hand-set pair lives on the riser member), D-B-120 (no main level, no arrow), D-B-121 (a hand-set pair changes only its own ring; a warning for two rings that disagree), D-B-122 (arrows scale with the zoom), D-B-124 (hand-set pair first, then the flow solve with the flow sense), D-B-130 (the flow sense comes from the type of the open drawing when it exists, else from the riser copy), D-B-131 (arrow starts on the ring line, 64 pt, 2 pt shaft).

Read for this spec: `useBuildingRisers.ts` (the effect at lines 698 to 735 in this branch, not 691 to 728), `useRiserFlowInputs.ts`, `riserActions.ts`, `CanvasContextMenu.tsx`, `PropertiesPanel.tsx` (the riser block, lines 355 to 367), `riserCapacity.ts`, `riserInfo.ts`, `BuildingRisersPane.tsx`, `riser-arrows.ts`, `riserArrowShapes.ts`, the T04 screenshots in `.claude/roadmap/work/shots-b8/`.

---

# PART 1: T05, the arrows follow the live flow

## 1.0 Findings that change the plan

1. **A free anchor has no member, so it has no arrow.** `riserRingArrows` gives a pair for each member level (`rings[riserId][levelId]`). `buildRiserAnchors` (`riserActions.ts:223`) makes a free anchor only for a level that has no member of the riser. So the key of a free anchor is never in the result. The plan text of T05 says "arrows on every ring". That is true for marked rings (solid ring, a fitting of the riser is there). It is not true for dashed rings. A dashed ring also cannot hold a hand-set pair in T06 (no member to hold the field). Decision proposed: a dashed ring shows no arrow and has no picker. When the user draws from the ring ("Draw from"), the level becomes a member, and the arrows follow. See open question 1.
2. **The "Flow direction" box of the Risers tab can disagree with the arrows.** `riserFlowText` says "Up · source: Level 0" for the whole riser, where "Up" means "away from the main level" (B7). For a Return type the arrows point toward the main level. A user then reads "Up" in the box and sees down arrows on the rings. This is a part B problem (T09 decides the box, D-B-74). It is not fixed in T05 or T06. The Windows script of T08 must say so, and the director may want to put the question to the user now.
3. **Hook order.** `App.tsx` calls `useBuildingRisers` (line 512) before `useRiserFlowInputs` (line 525). T05 needs the flow result inside `useBuildingRisers`. The call order in `App.tsx` must change (`useRiserFlowInputs` first, then pass `riserFlow` to `useBuildingRisers`). `useRiserFlowInputs` does not depend on `useBuildingRisers`.
4. **A flash at page change.** `useRiserFlowInputs` sets its state to `null` on each document or page switch and solves again after 60 ms (`onSwitch`). If the arrows are computed only from a non-null result, they disappear and come back at each page change. Rule: keep the last result while the building file is the same one. See the state table.
5. **A hand-set pair must not wait for the flow.** The hand-set pair is stored in the file. It must show also when `riserFlow` is `null` (first load, no summaries yet).

## 1.1 Concepts

| Concept | Does the user have it? | On screen? |
|---|---|---|
| Ring (purple circle of a riser) | Yes (B6, B7). | Yes, as today. |
| Arrow, pictogram | Yes. The user drew them in `risers.png`. | Yes, drawn on the ring. |
| Main level (where the flow starts) | Yes. B7 shows "Main level" and "Source level". | Not new. Existing text. |
| Supply and return | Yes. T01 editor. | Not new. |
| Flow solve | Yes, as a word in the Risers tab ("from the flow solve"). | Not new. |
| Span, `towardSource`, `RiserRingArrows`, `handSet` | No. Only the code has them. | No. |

## 1.2 Derive it or ask for it

| Value | Derived or asked | Reason |
|---|---|---|
| Which arrows a ring shows | Derived (flow solve, flow sense, elevation) | D-B-120, D-B-124. No control in T05. T06 adds the override. |
| Color and line pattern of the arrows | Derived (type of the riser, live type of the open drawing first, D-B-130) | No control. The user sets the type look in the type editor. |
| Flow sense | Asked, in the type editor (T01) | No new control in T05. |
| Size of the arrows | Constant (64 pt, scales with the zoom, D-B-122) | No control. |

## 1.3 Texts

T05 adds **no text and no control.** The arrows are the only change. The reason for a missing arrow is already in words:

- Properties of a riser fitting: row "Main level" with "not known yet (no source level)" and the hints of `riserCapacity.ts`.
- Risers tab: "Main level: ...", the capacity hints, the box "Flow direction" with "Not known yet", the link "Read summaries now", the warning "Riser R1 has more than one source level" (text of the solve).

Answer to the question of the brief: no new words such as "No main level yet". A third place that repeats the reason would be a second copy of the same state (L1). The T06 row "Arrows" in Properties shows "None yet" (part 2) and sits next to the "Main level" row, so the pair reads as cause and effect.

## 1.4 Journeys

Start for J1 to J8: the web app, a building with Level 0, Level 1, Level 2 (Manage Buildings), the three PDFs open, scale set, a supply-air network drawn on each level with a fitting at the same place. The step counts below count the steps for the arrows only. Steps that B7 already owns (place a source stamp, draw a segment) are named as "as in B7".

**J1: make a riser, no arrows (empty start). 3 steps.**
1. On Level 0, right-click the fitting. The menu shows "Make riser".
2. Click "Make riser". A solid ring shows. No arrow.
3. Go to Level 1. A dashed ring shows (the riser has no member here yet). No arrow.
After "Draw from" the dashed ring on Level 1 (2 more steps): the ring is solid. The riser has two members, but no source: still no arrow (D-B-120).

**J2: add a source on one level, the arrows show on every marked ring. 0 extra steps.**
1. Place the source equipment on Level 0 and connect it to the network of the ring (as in B7).
2. Within one second, with no click: Level 0 ring shows pictogram 2 (goes up). Go to Level 1 (middle member): pictogram 1 (comes up, goes up). Go to Level 2 (top member): pictogram 3 (comes up).
The arrows have the color and the pattern of Supply Air.

**J3: add a terminal. 0 extra steps.** On Level 2, place a terminal and connect it. The arrows do not change. A terminal changes the numbers (B7), not the direction. Exception: if the riser had no source and no terminal before, the group has no source and nothing changes either (state "no main level").

**J4: remove the source. 1 step.** Delete the source equipment on Level 0. Within one second, all arrows of the riser go. The rings stay.

**J5: two sources. 0 extra steps.** Place a second source on Level 2. All arrows go. The Risers tab shows the warning of the solve ("more than one source level"). Remove one source: the arrows come back.

**J6: a level that is not open. 3 steps.** Close the PDF of Level 1 (its saved summary stays). The source is on Level 1. Open only Level 0 and Level 2.
1. Go to Level 0. The ring shows the arrows from the solve with the stored summary of Level 1. For a Supply type the flow goes away from Level 1: Level 0 shows pictogram 5 (comes down) and Level 2 shows pictogram 3 (comes up).
2. If the stored summary of Level 1 is missing (never saved), the rings show no arrow. Open Manage Buildings, tab Risers: "Read summaries now" is shown (B7 text). Click it: the arrows show (2 steps).

**J7: a supply type and a return type on the same drawing. 0 extra steps.** Two risers, one Supply Air and one Return Air, source on Level 0, both with members on Level 0 and Level 1. Level 0: the supply ring shows pictogram 2 (goes up), the return ring shows pictogram 5 (comes down). Level 1: supply pictogram 3 (comes up), return pictogram 6 (goes down). The two rings are at different places. If two rings are at one place (20 pt), the arrows draw over each other (T04 reports this).

**J8: change Flow direction of a type in the editor. 3 steps, no save.**
1. Click the color dot of the tile "Supply Air" (title "Edit"). The editor opens.
2. Choose "Return (toward source)" in Flow direction.
3. Click Save. The editor closes. Within one second all arrows of the Supply Air risers flip (pictogram 2 on Level 0 becomes 5). The user does not save the PDF or the building. The save of the editor writes the building file by itself (D-B-126 A, as in T01).

**J9: repeat J8 three times (L3). 9 steps.** The arrows flip each time. The editor closes after each Save (as today).

## 1.5 State table (what a ring shows)

| State | Marked ring (solid) | Dashed ring (free anchor) |
|---|---|---|
| No building open | No ring at all. | No ring at all. |
| Riser with one member (no span) | Ring alone. | Ring alone. |
| Riser, no main level, no equipment | Ring alone. | Ring alone. |
| No main level, group has equipment (`atMost`, highest rule) | Ring alone. Properties: "Main level: not known yet (no source level)". | Ring alone. |
| One source (or the main level set by hand in the Risers tab) | Pictograms 1 to 8 by level. | Ring alone (open question 1). |
| Two sources, loop, or two main levels set by hand | Ring alone. The Risers tab has the warning. | Ring alone. |
| Source on a level that is not open, summary stored | Arrows from the stored summary. | Ring alone. |
| Source on a level that is not open, no summary | Ring alone. Risers tab: "Read summaries now". | Ring alone. |
| Supply and return risers together | Opposite arrows. | Ring alone. |
| Two levels with the same elevation | Ring alone on that span (`unknown`). | Ring alone. |
| A level that is not in the building file | Ring alone. | Ring alone. |
| The drawing and the riser copy of a type disagree on the flow sense | The open drawing wins (D-B-130). After a switch to a drawing that has the other value, the arrows can change. | Ring alone. |
| Flow result is `null` (first load, page change, summaries read) | Keep the last arrows of this building file. First load: ring alone. A hand-set pair always shows. | Ring alone. |
| The flow changes (edit, drag, type change) | Update after the 200 ms of `useRiserFlowInputs`. No flash. | Ring alone. |
| Zoom | Arrows scale with the zoom (T04). Faint under 0.26, hidden at 0.05. Not changed here. | Ring alone. |
| Ring label | The label sits at the right of the ring. The arrow at 60 degrees passes above it. T04 screenshots show that the label stays readable. | Same. |

Controls: none in T05. Nothing is disabled.

## 1.6 Entity by action table (T05)

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Arrow of a ring | derived (flow solve) | n/a | derived (goes when the source goes) | n/a | n/a | n/a: derived value, the drawing undo changes the flow and the arrows follow | click the ring (fitting), as today |

## 1.7 Layout

No new layout. The arrows are drawn on the canvas by T04. No section, no panel, no dialog changes. At 760 px nothing changes.

## 1.8 Platform table (T05)

| Platform API | Web test fake | Real platform | What the fake hides | Windows step |
|---|---|---|---|---|
| Building file write (the editor save writes `riser.networkType`, D-B-126 A) | OPFS handle | A real file on disk (FS Access stored handle in Chrome or Edge, or Tauri) | A write failure, a file that moved or is read only | 1. Do J8 with a building file on disk. Close the app and open again. The arrows still follow the new Flow direction. 2. Make the building file read only, do J8. The editor saves the type, a toast says "The building file was not saved: ..." (B6 text), and the arrows follow the drawing type (D-B-130). |
| Saved PDF summaries (J6) | Summaries in OPFS | Summaries in the real store | Nothing for the direction | 3. Do J6 with real PDFs from disk. |
| Display scaling | 100 % | 125 %, 150 % | Arrow width at a high scaling | 4. At 125 % and 150 % read the arrows: head and shaft are clear, the ring label is not covered. |
| File picker, drag and drop, path | n/a | n/a | n/a: T05 opens no picker | none |

## 1.9 Open questions (part 1)

1. **A dashed ring (free anchor): arrows or not?** Options: A (recommended) no arrow and no picker on a dashed ring, because the level is not a member and the model has no span there. "Draw from" makes it a member. B: the arrow of a dashed ring comes from the span that holds its elevation (pictogram 1 or 4 for a level in the middle of a riser). That adds a new function to T02 and a place for the hand-set pair that the file does not have (a new field on the riser, a schema decision). Recommendation: A.

---

# PART 2: T06, choose a pictogram by hand

## 2.1 Decisions of this part

1. **The picker lives in two places that share one component:** the right-click menu of a marked ring, and the Properties panel of the selected riser fitting. Reason: (a) the menu is the fast way (2 steps); (b) the Properties panel is the only way with the keyboard (the canvas menu has no keyboard way: no focus, no Shift+F10 on the canvas); (c) the "Set by hand" mark needs a place where the user can also take it away (L14: a mark with no way back is a dead end). One component, `RiserArrowPicker`, is used in both. A dashed ring has no picker (part 1, finding 1).
2. **In the menu the picker is an inline block, not a submenu.** The plan says "submenu". The menu of the app has no submenu today (flat list of buttons, `CanvasContextMenu.tsx`). A submenu is a new pattern: hover timing, an edge case near the window border, no keyboard. An inline block under a heading needs 2 steps, a submenu needs 3, and the existing clamp logic keeps the menu in the window. Recommendation: inline.
3. **Nine choices, not eight.** The eight pictograms of the plan, plus "No arrows" (pair `none`, `none`, which T03 already stores as "no arrow by hand"). Reason: a conduit riser or a case that the solve gets wrong needs "no arrow" and the picker could not say it. Without it the pair `none`, `none` has no way in. See open question 2.
4. **"Use the flow solve"** clears the pair (`clearMemberArrows`). It has the same words as the link in the Risers tab, which clears the hand-set direction and the source level of the riser. The two links clear different things. They are in different places and each sits next to the thing it clears (the picker, or the Flow direction box). No new word is needed.
5. **No undo.** The building file has no undo stack (as for Direction and Source level). The drawing Undo button (rail) does not undo an arrow. The way back is visible in the same place (choose another pictogram, or "Use the flow solve"). No text says "not undoable": the user does not expect Undo for a choice that has a visible reverse. The Windows script has a step (6) that proves the Undo button leaves the arrows alone.

## 2.2 Concepts

| Concept | Does the user have it? | On screen? |
|---|---|---|
| Pictogram (full circle plus one or two diagonal arrows) | Yes. `risers.png` is the user's own picture. | Yes, as a small picture on each choice. |
| "Comes up", "goes up", "comes down", "goes down" | Yes. The words of the picture. | Yes, as the tooltip of each choice. |
| Arrows set by hand / from the flow solve | Yes. "Set by hand" and "from the flow solve" are in the Risers tab since B7. | Yes. |
| `below`, `above`, `RiserArrowPair`, member | No. Only the code has them. | No. |

## 2.3 Derive it or ask for it

| Value | Derived or asked | Reason |
|---|---|---|
| The pair of a ring | Derived by default. Asked as an override. | The solve gives no answer when the direction is in doubt (D-B-120), and it can be wrong (pump, return pipe of a water type, D-B-127). Data cannot know the intent. |
| "No arrows" | Asked | Same reason. |
| Look of the picture in the picker | Derived (same geometry as the canvas) | No control. |

## 2.4 The eight pictograms and the texts

Order in the grid: the order of the picture, 4 per row (row 1: 1 to 4, row 2: 5 to 8). The number is not shown. Text = `title` (tooltip) and `aria-label` of the button. Same words for every network type (D-B-113).

| # | Pair (below, above) | Picture | Text (title and aria-label) |
|---|---|---|---|
| 1 | up, up | one arrow through the ring, pointing up | `Comes up, goes up` |
| 2 | none, up | one arrow from the ring, pointing up | `Goes up` |
| 3 | up, none | one arrow into the ring, pointing up | `Comes up` |
| 4 | down, down | one arrow through the ring, pointing down | `Comes down, goes down` |
| 5 | none, down | one arrow into the ring, pointing down | `Comes down` |
| 6 | down, none | one arrow from the ring, pointing down | `Goes down` |
| 7 | down, up | two arrows from the ring | `Goes up, goes down` |
| 8 | up, down | two arrows into the ring | `Comes up, comes down` |

Check against the plan table: the pairs are the pairs of `RISER_ARROW_PICTOGRAMS` and the texts are the "picture text" of the plan, section 2, in the present tense.

Other texts, word for word:

| Item | Text |
|---|---|
| Heading of the block in the menu | `Riser arrows` |
| Group label (aria) of the picker, both places | `Riser arrows` |
| Item 9 | `No arrows` (title: `Show no arrows on this ring.`) |
| Item 10 (link, last) | `Use the flow solve` (title: `Show the arrows that the flow solve gives.`) |
| Properties, label of the row | `Arrows` |
| Properties, value of the row | `From the flow solve`, or `Set by hand`, or `None yet` |
| Properties, one hint line under the picker (grey, 12 px) | `Up and down mean higher and lower levels.` |
| Risers tab, tag in the row of a level | `Arrows set by hand` |
| Risers tab warning (D-B-121) and the toast after an action | `Arrows of R1 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.` |
| Toast when the riser or the level is gone | `This riser does not exist any more.` (text of `drawFromRing`, reused) |
| Save failure | Existing text of `commit`: `The building file was not saved: ...` |
| Success | No text. The ring changes on the canvas at once. |

"Set by hand" as a bare word means the arrows only in the Properties row `Arrows`. In the Risers tab the tag says "Arrows set by hand" because "Set by hand" there already means the direction of the riser (link and flow box, B7).

The value `None yet` shows when the solve gives no arrow for this ring (no main level, part 1 state table). The row "Main level" above it already says why.

## 2.5 The D-B-121 warning

Today (`building.ts:393`): `Arrows disagree on the span Basement to Ground`. It has no riser name. Two risers with the same level names give two equal lines that the user cannot tell apart (the test `warns for each riser on its own` shows that). Fix: add the riser name and a next step, as in the table above. A change of one string in `riserWarnings` and in `building.test.ts` (lines 391 to 483). It stays the same text everywhere. The function builds it once, and `useBuildingRisers` shows it as a warning notice (toast) when the user's action creates a new "Arrows of ..." line (compare `riserWarnings` before and after the write).

Where it shows:
- Risers tab, "Warnings (N)" list (exists, no change).
- A toast right after the action that caused it (L6): the user sits on the canvas and does not open the Risers tab.

What it does not cover (accepted, D-B-121): a hand-set ring that disagrees with a ring that shows the flow solve. The warning needs two hand-set pairs. The user chose the one by hand, and the other follows the solve. The Properties row of the ring shows "Set by hand".

## 2.6 Journeys

Start for K1 to K7: part 1 start, one riser with members on Level 0, Level 1, Level 2, source on Level 0 (arrows show from the solve).

**K1: set a pictogram with the menu. 2 steps.**
1. Right-click the ring of the riser on Level 1. The menu shows "Riser arrows" with the grid.
2. Click the picture with the tooltip "Goes up". The menu closes. The ring shows one arrow (pictogram 2). The ring is now "Set by hand".

**K2: set a pictogram with Properties. 2 steps.** (1) Click the ring (the fitting is selected). The Properties panel shows "Riser R1" with the row "Arrows: From the flow solve" and the picker. (2) Click "Comes down". The row says "Set by hand". The picker stays open for the next choice (L3).

**K3: go back to the flow solve. 2 steps.** Right-click the ring, click "Use the flow solve". The ring shows the solve again. In Properties: one click on the link.

**K4: three rings in a row (L3). 6 steps by the menu, 6 by Properties.** Do K1 on Level 0, Level 1 and Level 2. By Properties the user stays in the panel for repeated choices on one ring (1 step each), and needs 1 click per ring.

**K5: no source (empty start). 4 steps.** A riser with 2 members and no source (no arrows). Set "Goes up" on the lower ring and "Comes up" on the upper ring (2 steps each by the menu). Both rings show the arrows. Add a source later: the two rings keep their hand-set pairs.

**K6: two rings that disagree. 4 steps.** Set "Goes up" on Level 0 and "Goes down" on Level 1. After the 2nd choice, a toast shows `Arrows of R1 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.` The Risers tab shows the same text in "Warnings (1)". Two risers (R1 and R2) with the same levels give two different lines (R1, R2).

**K7: see it in the Risers tab. 2 steps.** After K1 open Manage Buildings, tab Risers. The row of Level 1 shows the second line `Arrows set by hand`. The order of the rows does not change.

**K8: keyboard in Properties. 5 steps.** Select the ring. Tab to the picker (focus goes to the chosen item, or to the first item when the choice is "Use the flow solve"). Press the Right arrow 2 times (focus moves, nothing is written). Press Space. The choice is written and the focus stays on the same item. Tab goes on to "No arrows", then "Use the flow solve".

## 2.7 State table (the picker)

| State | What the user sees | Controls |
|---|---|---|
| No building open, or the ring is not part of a riser | No picker (no ring menu entry, no Properties row). | n/a |
| Dashed ring (free anchor) | Menu: only "Draw from" (as today). No picker. | n/a |
| Marked ring, the solve gives arrows | Row `Arrows: From the flow solve`. The picker shows no choice marked. "Use the flow solve" has a check mark and is dim. | All pictograms and "No arrows" on. |
| Marked ring, the solve gives no arrow | Row `Arrows: None yet`. Same picker. | Same. |
| Marked ring, hand-set pictogram | Row `Arrows: Set by hand`. The chosen picture has a dark frame (`aria-checked`). "Use the flow solve" on. | All on. |
| Hand-set "No arrows" | Row `Arrows: Set by hand`. "No arrows" has the check mark. | All on. |
| The same choice clicked again | Nothing changes, no text, no write. | n/a |
| Riser has one member | The picker works. A hand-set arrow with no span is drawn anyway (T03: "open end through the roof"). | Same. |
| Riser deleted or level removed while the menu is open | Toast `This riser does not exist any more.` The menu closes. | n/a |
| Write fails | Toast `The building file was not saved: ...`. The ring keeps the old arrows (the file is the source). | n/a |
| Writing (short) | No busy state. The write is local. The ring changes when the file has changed. | Items stay on. |
| Properties with `riserLines` null (one-member riser) | The `Arrows` block still shows. It is independent of the capacity block. | Same. |
| Two hand-set rings disagree | Toast and warning (2.5). | n/a |
| Hand-set pair, then the type changes flow sense | The pair stays as set. The solve is not read. | n/a |
| Loading, empty | Not applicable. The picker has no list that loads. | n/a |

## 2.8 Entity by action table (T06)

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Hand-set pair of a ring | Pictogram or "No arrows" (menu or Properties) | n/a | "Use the flow solve" | n/a | n/a | none: the building file has no undo stack. The reverse is in the same place. | Click the ring. The chosen picture shows a frame. |

## 2.9 Wireframes

### Right-click menu of a marked ring (same at 1600 px and 760 px; the menu does not depend on the window width)

```
+----------------------------------+
| Draw from                        |
|----------------------------------|   separator (existing class)
| Riser arrows                     |   12 px, grey, not a button
| [p1] [p2] [p3] [p4]              |   36 x 36 px cells, 2 px gap
| [p5] [p6] [p7] [p8]              |   chosen cell: dark frame
| No arrows                        |   menu button (check mark when chosen)
| Use the flow solve               |   menu button (check mark + dim when chosen)
|----------------------------------|
| Detach from riser                |
| Delete riser                     |
+----------------------------------+
```

- Width: 4 cells of 36 px plus 3 gaps of 2 px is 150 px. The menu gets about 162 px width (min width 150 px today, so it grows by 12 px).
- Height grows by about 130 px. The clamp logic of `CanvasContextMenu` already moves the menu into the window. Its layout effect must also depend on the picker state (the dependency list is `[posX, posY, riserModel]`; the model gets the new field).
- At 760 px the menu is the same. Test a right-click near the right and the bottom edge.
- Major block: the grid. Minor: the heading and the two text items.
- The existing items keep their order. Delete riser stays last, away from the new block.

### Properties panel of a selected riser fitting

```
Fitting · f12
 KIND            [ Elbow           v ]
 ...
 Solved capacity [ 650 m3/h          ]
 ------------------------------------
 Riser R1                  Not a design flow
 MAIN LEVEL       Level 0
 CONNECTED TOTAL  750 m3/h (no concurrency factor)
 ARROWS           Set by hand
 [p1] [p2] [p3] [p4]
 [p5] [p6] [p7] [p8]
 [No arrows]  Use the flow solve
 Up and down mean higher and lower levels.
 (the existing hints of the block follow here)
```

- The new block sits after the two rows and before the hints, inside `props-riser-section`. Label `Arrows` uses the label column of `mep-field-row`. The grid starts under it and takes the full width (150 px).
- At the narrowest panel (240 px) the grid fits. The row "No arrows" and "Use the flow solve" wraps to two lines (flex wrap, `mep-rp-links` pattern). 760 px window: same.
- Section: Properties stays one section. The block is a minor part of it.

### Risers tab, row of a level (the grid is unchanged: level `1fr` | status `110px` | actions `170px`)

1600 px:
```
Level 1                          ✓ OK          [Go to] [Detach]
Arrows set by hand
```
760 px: the same grid. The name is cut with an ellipsis and a tooltip, as today. The tag is a second line of the level cell (12 px, grey, `mep-rp-tag` style), shown only on a row that has a hand-set pair. A row with a tag is about 16 px higher. Rows never move (L4).

The tab has no control that clears the pair. See "Not in this task".

## 2.10 The picture in the picker (the shared drawing function)

- Each cell: a button of 36 x 36 px, 1 px line, 3 px radius, `--surface` background, `--surface-2` on hover, dark frame (2 px, `--ink`) on the chosen one. The picture is an SVG of 36 x 36 px.
- Picture: the ring is a full circle (radius 4.5 px, 1.5 px line, the ring purple `#7c4dff`, the value of `RISER_MARK_COLOR`). The arrows are 1.5 px shafts with a filled triangle head, color `--ink` (not the color of a network type: the picker must stay clear for every type). Direction 60 degrees from the horizontal: the "above" arrow goes to the upper right, the "below" arrow to the lower left, as on the canvas and in `risers.png`. An arrow that points to the ring has its head at the ring line. An arrow that points away has its head at the far end. Arrow length 13 px, head 5 x 4 px. The far end is at most 17.5 px from the center, so it stays in the 36 px cell.
- Where the shared function lives: the geometry already exists in `packages/render/src/riserArrowShapes.ts` (`riserArrowShapes`, exported by `@mepapp/render`). It uses the fixed constants `RISER_ARROW_STYLE`. T06 adds an optional fourth argument `style` (default `RISER_ARROW_STYLE`, so the canvas does not change; a test proves it). The picker calls it with the small style and a ring radius of 4.5, and draws the returned shaft points and head triangle as SVG `line` and `polygon`. One geometry function, so the picker and the canvas cannot differ. The SVG component is `packages/ui/src/components/RiserArrowIcon.tsx` (new, only a view).
- `RiserArrowPicker` (new, `packages/ui/src/components/RiserArrowPicker.tsx`): props `current: RiserRingArrows`, `onChoose(pair)`, `onUseSolve()`. It renders the grid and the two text items. The menu wraps it with the heading. Properties wraps it with the row `Arrows`.
- The pairs come from `RISER_ARROW_PICTOGRAMS` and the "No arrows" pair `{ below: 'none', above: 'none' }`. The texts of 2.4 live in one table next to the picker (one source for `title`, `aria-label` and the tests).

## 2.11 Keyboard and focus

- The picker is one group (`role="radiogroup"`, `aria-label="Riser arrows"`). Each pictogram and "No arrows" is `role="radio"` with `aria-checked`. Only one item is in the Tab order (roving `tabindex`): the chosen item, or the first item when the choice is "Use the flow solve". "Use the flow solve" is a normal button after the group.
- Arrow keys: Left and Right move by 1, Up and Down move by 4 in the grid (stop at the ends). Moving focus writes nothing. Space or Enter chooses (one write for each choice, not one for each arrow press).
- Focus after a choice in Properties: stays on the chosen item. The component keeps stable keys so the panel redraw does not drop the focus.
- Menu: it has no keyboard way today (no focus on open; plain buttons). T06 does not change that. Escape and a click outside close it (existing). Each choice closes the menu (as every item of this menu). The keyboard way is the Properties picker, which also has the same choices.
- Visible focus ring on each item (the global focus style of the app).
- Escape in the Properties picker: no effect (it is not a dialog).

## 2.12 Width 760 px

The grid has a fixed width (150 px), so no wrap and no cut. The two text items wrap in Properties. The Risers tab row follows the existing narrow rule (name column cut). The menu follows the clamp. No part uses a column that depends on a name.

## 2.13 Platform table (T06)

| Platform API | Web test fake | Real platform | What the fake hides | Windows step (one PC) |
|---|---|---|---|---|
| Building file write (`update` of the store) | OPFS | A file on disk (FS Access stored handle, or Tauri) | A write failure, a moved or read only file, a slow disk | 1. Set pictogram 2 on one ring. Close the app. Open again, open the building. The ring has the arrow, Properties says "Set by hand". 2. Make the building file read only. Set a pictogram. A toast says "The building file was not saved: ...". The ring keeps the old arrows. |
| Right-click menu | `mouse.click` with the right button | A real right click on Windows (Edge, Chrome, WebView2 in Tauri) | The native menu of the browser or WebView2 can show with ours | 3. Right-click a ring. Only the app menu shows, not the native menu. The picker is whole. 4. At 150 % display scale and at 760 px window width, right-click a ring near the bottom and the right edge. The menu moves into the window and no cell is cut. |
| Tooltips (`title`) | Headless Chromium draws none | The system tooltip after about half a second | The text that the user reads | 5. Hover each of the 8 pictures, "No arrows" and "Use the flow solve". Read the tooltip: "Comes up, goes up", "Goes up", "Comes up", "Comes down, goes down", "Comes down", "Goes down", "Goes up, goes down", "Comes up, comes down", "Show no arrows on this ring.", "Show the arrows that the flow solve gives." |
| Undo of the drawing | Rail button | Same | The user may press Ctrl+Z or the rail Undo | 6. Set an arrow. Press the rail Undo. The arrow stays and the last drawing action is undone. (This is how the app works; the step proves that nothing else happens.) |
| Keyboard | Playwright key presses | A real keyboard, a layout with a different arrow key map (no) | Nothing special | 7. Select a ring. Tab to the picker. Use the Right arrow, then Space. The arrow is set. Tab order: picker, "Use the flow solve". |
| SVG drawing, display scaling | 100 % | 125 % and 150 % | Blurry or cut lines at a non-integer scale | 8. At 125 % and 150 % read the 8 pictures in the menu and in Properties. Ring and arrowheads are clear. |
| File picker, drag and drop, path | n/a | n/a | n/a | none |

An older build that opens a file with `arrows` keeps the field and ignores it (core test). One PC cannot hold both builds in the same state, so there is no step.

## 2.14 Checks for the journey tester (from this spec)

Real DOM clicks in the real web store, one Chromium page. At 1600 and 760 px.
- K1, K2, K3, K4 (3 rings), K5, K6, K7, K8. Read the stored pair from the building file, not only the canvas.
- Fail before the change: no "Riser arrows" block in the menu, no row `Arrows` in Properties.
- The menu stays inside the window with a ring at the bottom right corner at 760 px.
- Two risers with disagreeing pairs give two different warning lines.
- The same choice twice writes nothing.
- A no-flag run: no flag in the URL.
- Screenshots: the menu with a chosen item, Properties, the Risers tab with the tag, the 8 pictures at the cell size, and the eight pictograms on the canvas.

## 2.15 Open questions (part 2)

2. **A ninth choice "No arrows"?** Options: A (recommended) yes, as in 2.1. B: only the eight and "Use the flow solve". Then a ring where the solve is wrong cannot show no arrow, and the stored pair `none`, `none` cannot be set.
3. **Inline block or submenu in the menu?** A (recommended) inline block (2 steps, no new pattern). B: a "Riser arrows" submenu as in the plan (3 steps, a new menu pattern, no keyboard way).
4. **Menu and Properties, or the menu only?** A (recommended) both with one component. B: the menu only (less work, no keyboard way, and the "Set by hand" mark in Properties has no way back).
5. **Change the warning text (2.5)?** A (recommended) yes: riser name and a next step. It changes the T03 string and its tests. B: keep the text (two risers give two lines that look equal).

## 2.16 Not in this task

- A link in the Risers tab that clears the hand-set pair of a row ("Use the flow solve" per row). Reason: the tab gets its direction work in part B (T09). Until then the user goes to the level (button "Go to") and uses the menu or Properties.
- A picker on a dashed ring (part 1, question 1).
- A warning for a hand-set ring that disagrees with a derived ring.
- A keyboard way to open the canvas menu.
- The Risers tab diagram with arrows (T09), and the words of the box "Flow direction" (finding 2 of part 1).
- Undo for the pair (the building file has no undo stack).
