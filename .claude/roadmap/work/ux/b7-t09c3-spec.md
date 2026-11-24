# UX spec B7-T09c-3: the Capacity card of the Risers tab, way to act, tag, summary link

Size: small. The texts of part (1) to (3) are decided and not reopened (D-B-93, D-B-103). This spec only adds the layout of the card (review findings M1, L4 of T09c-2b). No new concept, section or setting. Open points are provisional (section 7). Not verified in a browser: all heights below are estimates from the screenshots in `work/shots/b7-t09c2b/`.

Read: plan task text B7-T09c-3 and section 7; spec b7-t09c2b; `BuildingRisersPane.tsx:425-662`; `theme.css` `.mep-rp*` `:6532-6802`; `riserCapacity.ts`; the 1600, 1100 and 760 px screenshots of T09c-2b.

## 1. Findings

1. **The way to act is below the fold.** At 1100 px the card starts at about y 490 of 900. The visible body ends at about y 730. Visible: main line, total, 2 rows, hint 1. Cut: hints 2 and 3, the "Set by hand" link. At 760 px (viewport 900) it is the same. At 1600 px hint 3 shows but the link is below. The body scrolls, and only a small shadow at the top shows that.
2. **The link is far from the text that asks for it.** Hint 3 says "click Set by hand". The link is under "Flow direction" (`:631-652`), about 100 px lower, and it opens a list that is not about direction only.
3. **After "Set by hand" the two lists appear below the fold.** The click would show nothing. This is L6. It is true today, and it gets worse if the link moves up. So the move needs the focus step (Q3).
4. **The tag is also in Properties.** `fittingRiserLinesOf` `:253` has its own fixed `Not a design flow`. If only the pane changes, one electrical riser has two texts for one fact (Q4).
5. **No browser check depends on the order of the lists.** All checks use test ids (`riser-flow-select`, `riser-source-select`). One audit script (`b7-t05-journey-audit.mjs:135`) cuts text at `Direction`: its result only gets 2 more words. Safe.

## 2. Concepts

No new word. Used: Capacity, Main level, Set by hand, Source level, Read summaries now, at most. The tag text `Connected load` is a word of the electrical engineer. Never on screen: open end, summary data (the note says "open-end data": it is decided).

## 3. Journeys

Goal: draw terminals, no air handling unit, then understand "at most" and find what to do.

**J1: read and act. 3 steps.** Start: Example 5, no equipment. 1) Open Manage Buildings, tab Risers. 2) Read the Capacity card: main line says no source level, rows say `at most`. The link `Set by hand` shows under the main line with no scroll. 3) Click `Set by hand`. The focus goes to the list "Source level", the user picks `Level 0`. The rows lose "at most". (The other way, place an air handling unit, is hint 3.)

**J2: old building. 2 steps.** Start: a building saved before T09. 1) Open the tab Risers. The note and the link `Read summaries now` show (the link is under the main line). 2) Click it. The note goes.

**J3: electrical riser. 1 step.** Open the tab Risers with an electrical riser. The tag reads `Connected load, not a design load`. Drain and fire protection read `Not a design flow`.

**J4: repeat 3 times (L3).** Select 3 risers one by one in the diagram: the link row sits at the same place in each card.

Empty start: no riser selected, or one-member riser: unchanged.

## 4. Entity by action table and state table

No entity gets a new action. Entity Riser (Risers tab): select (diagram), edit main level (`Set by hand`, exists), undo (follows data). Rest: not applicable. Derived: all numbers and the tag. Asked: only the main level (exists).

State table of the link row `riser-capacity-actions` (new, under the main box):

| State | Row shows |
|---|---|
| Solved, lists hidden, no stored summary gap | `Set by hand` |
| Solved, lists hidden, old summary gap | `Read summaries now`, `Set by hand` (this order) |
| Solved, lists shown (hand-set or after click) | `Read summaries now` only if needed; else no row (no empty row) |
| One member, or reading (`capacity` null) | no row. `Set by hand` stays in the old place (bottom row). The card is short, so it is visible |
| Busy or reading | the links are disabled (as today) |

## 5. Texts (word for word)

| Id | Text |
|---|---|
| Takeoff cell, warning (part 1) | decided, no screen |
| Group note, link (part 2) | `The summary of Level 1 has no open-end data. Read the summaries.` / `Read summaries now` (reading: `Reading…`) |
| Tag, electrical | `Connected load, not a design load` |
| Tag, other types | `Not a design flow` (title: the existing design-flow hint) |
| Link | `Set by hand` (no change) |
| Hint 3 | no change (M2 below) |

## 6. Layout

Order of the card, 1600 px and 760 px (same order; at 760 px and with the details open the card is one column):

```
Capacity  [Connected load, not a design load]      (heading + tag, wraps under the heading if needed)
+----------------------------------------------+
| Main level: not known yet (no source level)  |
| Connected total: 750 m3/h (no concurrency...)|
+----------------------------------------------+
Read summaries now   Set by hand                   NEW row, moved here
Level 0 to Level 1                at most 650 m3/h
Level 1 to Level 2                at most 600 m3/h
hint 1, hint 2, hint 3 (and the design-flow hint)
Flow direction                                      (heading, box)
[Source level v]   [Direction v]                    (lists, swapped)
Use the flow solve   More details                   (bottom row)
```

Change in `BuildingRisersPane.tsx`:
1. Render `<div className="mep-rp-links" data-testid="riser-capacity-actions">` right after the `mep-rp-capbox` div (inside the `solved` branch, before the list). It holds `riser-read-summaries` (condition of `:572` unchanged) and then `riser-set-by-hand` (only when `!showSelects`). No row when both are absent. Test ids and handlers do not change. The two old places drop `riser-read-summaries` and, in the solved case, `riser-set-by-hand`. The bottom row keeps `riser-use-solve` and `riser-more-details`.
2. Swap the two `mep-rp-field` blocks: `riser-source-select` first, `riser-flow-select` second (Q2).
3. After a click on `Set by hand`, focus `riser-source-select` (a `FocusRequest` of kind `selects`, same pattern as `:241-254`). The browser scrolls the list into view (Q3).
4. Tag: `{capacity.designFlowTag}` from `designFlowTagOf(riser.networkType)`; `fittingRiserLinesOf` `:253` reads the same field (Q4).

CSS: no new rule for the row (`.mep-rp-links` flex-wrap exists). Two small changes so that the tag never pushes the heading: `.mep-rp-capacity-head { flex-wrap: wrap }` and `.mep-rp-tag { min-width: 0; overflow-wrap: anywhere }`. Section order and size: no major or minor change.

Fit (estimates, 12 px about 6.2 px a character):
- 330 px column: heading about 52 px, gap 8, tag `Connected load, not a design load` (33 characters) about 205 px. Total about 265 px of 330: one line. It does not wrap or cut. A longer custom text wraps under the heading with the rule above.
- 760 px (stack): wider than the column. No change. Properties dock 280 px: the tag is its own line (`:358`), 205 px of about 250: fits.
- Link row: `Read summaries now` about 105 px, `Set by hand` about 65 px, gap 14: about 185 px: one line at 330 px.
- Height of the row: about 20 px with gap. At 1100 and 760 px (viewport 900) the row sits at about y 655 and y 705 of a visible 730 and 735: visible, but at 760 px with only 30 px to spare. At 760 x 640 the card is below the fold before the change: not solved here (Q5).

## 7. Platform table and questions

Platform API: none (no file, drag and drop, path, clipboard, window). Nothing hidden, no step for the platform test script.

Open questions (provisional picks):
- **Q1: move the links under the main box.** A) yes, as above; B) a scroll cue only (a change of the dialog, not of the pane); C) no change. Provisional: **A**. It is the smallest change and puts the link next to the box that says "no source level".
- **Q2: swap the lists, Source level first.** Cheap: two JSX blocks, no test depends on the order (finding 5). The hint asks for a main level, so this list comes first. Provisional: **yes**.
- **Q3: focus `Source level` after `Set by hand`.** Needed because the lists open below the link (finding 3). Provisional: **yes**.
- **Q4: the Properties tag uses the same text.** Provisional: **yes**.
- **Q5: the card is below the fold at 760 x 640.** Option: accept. Provisional: **accept** (the user scrolls; the diagram height is outside this task).
- **M2 for the user (no change here):** hint 3, the action text, is the last text in the card. The link now comes first. Does the user want hint 3 earlier too? Ask at the review.

Not in this task: a scroll cue in the dialog, a smaller diagram, a "Set main level" button in the hint, a new text for the design-flow hint (it says "not a design flow" next to an electrical tag that says "not a design load"; decided, note only).

## 8. Check list for the journey tester

1. J1 at 1600, 1100 and 760 px (viewport 900): without scrolling, `riser-set-by-hand` is inside the visible part of `.mep-modal` (measure the box). Read main line and rows. Say if "at most" is clear and the next step is easy to find.
2. Click `Set by hand` with the real mouse: `riser-source-select` has the focus and is visible. Choose `Level 0`: rows have no "at most".
3. Order of the lists: Source level above Direction. Both still work (type by test id).
4. J2: old building: the note, the link in the new row, click, the note goes. Link order `Read summaries now`, `Set by hand`.
5. J3: electrical tag text at 330 px and 760 px: one line, no cut, heading not moved (`scrollWidth <= clientWidth`). Drain and fire protection: `Not a design flow`. Properties tag the same (Q4).
6. J4: 3 risers: the row sits at the same place.
7. A group with a source and a hand-set group: the link row has `Set by hand` or nothing as the table says; no empty row.
8. Old checks `b4-t09`, `b7-t05`, `b7-t09c2b` pass (they click by test id).
