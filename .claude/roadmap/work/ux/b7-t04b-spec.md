# UX spec B7-T04b: the open level shows the numbers of the other levels

Size: small change of an existing screen. The "Solved capacity" numbers of the open level change (no screen change for that). One new block shows in the Properties panel, only for one selected riser fitting. Words follow D-B-74 option A (neutral words, no arrow, no "Up", "Down" or "flow direction") and reuse the words and the unit rules of the T05 spec (`b7-t05-spec.md`).

Source files read: `riserCapacity.ts`, `PropertiesPanel.tsx` (segment branch line 192, fitting branch line 289), `theme.css` (`.mep-section`, `.mep-field-row`, `.mep-hint`, `.mep-rp-tag`), `DockPanel.tsx` (dock width 280 to 720 px, default 420 px), `App.tsx` (header total, line 2021).

## Decisions in short (provisional, the lead may change them)

1. Layout: a second section card "Riser R1" under the "Fitting" section, with two rows that use the `.mep-field-row` pattern (label left, value right). The value is a read-only text, not a disabled `<input>`, because a disabled input is 104 px wide and cuts the text (see 7).
2. "Solved capacity" gets no note. The two new rows are enough. The segment panel gets no change (see 4).
3. No building, no riser, a fitting that is not a riser fitting, one-member riser, loading: nothing new shows.
4. Strings: label and value come from `riserCapacity.ts`. The T05 line `Main level: Level 0` is built from the same two parts, so the words cannot drift (see 6).

## 1. Concepts

| Word on screen | User has it? | Note |
|---|---|---|
| Solved capacity | yes, exists in Properties | the number now counts other levels where the solve has a number |
| Riser (R1) | yes, exists in the Risers tab | |
| Main level | yes (T05) | the level of the source; neutral word (D-B-74 A) |
| Connected total (no concurrency factor) | yes (T05) | |
| at least | yes (T05) | |
| not known yet | yes (T05) | |
| Not a design flow | yes (T05) | |
| Manage Buildings, tab Risers | yes, exists | the place for the detail |
| entry, exit, node, group, span, `demandBeyond`, `capacityIn`, summary, solve | no | never on screen |

## 2. Journeys

**J1 (main): read the duct and find the rest of the building. 2 steps.** Start: 3 levels, one riser R1, equipment on Level 0, terminals 100 / 300 + 200 / 150, Level 1 is open, nothing selected.
1. Click the duct that ends at the riser. Properties shows "Segment", "Solved capacity 500". No new row (the duct carries only the terminals behind it: 500 is right for the duct).
2. Click the riser fitting at the end of the duct. Properties shows "Fitting" with "Solved capacity 650", and a new section "Riser R1": "Main level  Level 0", "Connected total  750 m³/h (no concurrency factor)". The user now knows: the fitting carries 650, the whole building 750, the source is Level 0.
Friction check: the user does not need the Building dialog for this answer. The hint text names the dialog only for the detail per level.

**J2: change a terminal capacity on the open level. 4 steps.** Start: as J1, the riser fitting is selected and shows 650 and 750.
1. Click the terminal that has 300. 2. In Properties type 400 in its capacity field and press Enter. The numbers change by themselves after about 0.2 s. No reopen. 3. Click the riser fitting again. It shows "Solved capacity 750", "Connected total 850 m³/h (no concurrency factor)". The header total shows 600 (level only: unchanged rule D-B-78).
Rule: while the fitting stays selected during an edit (for example after an Undo click), the two rows keep the last numbers until the new numbers arrive. They never go empty and never flicker.

**J3: switch to another document and back. 3 steps.** Start: as J1, Level 1 and Level 0 are open as two document tabs.
1. Click the tab of Level 0. Properties shows nothing new for it (no fitting selected). 2. Click the tab of Level 1. The level numbers show at once. About 0.2 s later the scene counts the other levels again. 3. Click the riser fitting. The lines show.
Rule: the rows show only when the scene has the numbers for this document. So "Solved capacity" and the rows never disagree. A click in the first 0.2 s shows the fitting with a level-only number and no rows. The rows then appear below it.

**J4 (empty start): no building or no riser. 1 step.** Start: a PDF with no building. Click a fitting. Properties shows the "Fitting" section as today. No new section.

## 3. Entity by action table

Read-out only. No entity, no control, no setting.

| Entity | create | rename | delete | move | open | undo | select |
|---|---|---|---|---|---|---|---|
| Riser section in Properties | none: derived | none: derived | none: derived | none | none | none: nothing to undo; the numbers follow an undo of a drawing edit | existing: click the riser fitting |

## 4. State table (single selected fitting; other selections unchanged)

| State | The user sees in Properties | Controls |
|---|---|---|
| No building open | the "Fitting" section as today. No new section | none new |
| Building has no risers, or the document is not a level of the building | same as above | none new |
| Fitting is not a riser fitting | same as above | none new |
| Stamp, segment (one), several segments selected | as today. No new section. A segment shows only its own capacity (see note) | none new |
| Loading (summaries not read yet, or the scene has no numbers for this document yet) | no section. "Solved capacity" shows the level-only number | none new |
| Riser with one member | no section (no other level, nothing to add) | none new |
| Known | section "Riser R1": Main level `Level 0`, Connected total `750 m³/h (no concurrency factor)` | none |
| At least (a level has no data) | Connected total `at least 750 m³/h (no concurrency factor)`, hint (E) | none |
| Not known yet | Main level `not known yet (<reason>)` with one of the four reasons, Connected total still shows (D-B-76), hint (F). "Solved capacity" is level-only | none |
| Hand-set main level | Main level `Level 0` (the level that the user set). No extra word | none |
| No unit | `750 (no concurrency factor)`, hint (G) | none |
| Not a design flow (drain, fire protection, electrical) | tag `Not a design flow` under the heading, hint (H) after the rows | none |
| Shared network (group has more than one riser) | hint (D) | none |
| Error: summaries cannot be read | same as "at least" | none |
| Already done / busy | not applicable: no action | none |
| Edit in progress (numbers change) | the rows keep the last numbers until the new ones arrive | none |

Note on the segment (decision 2 in short): a duct that ends at the riser carries only the terminals behind it. 500 is the true number for that duct. The rest of the building is at the fitting at its end. A line on the segment panel would need the riser data of the fitting at one end of the segment, and a rule for which end counts. That is a new feature. Recommend "not in this task". The two clicks of J1 answer the question.

## 5. Derive it or ask for it

Everything is derived: the numbers (building solve), the main level (the solve; a hand-set level comes from the Risers tab), the unit (`riser.networkType.flowUnit`, never the unit of the open level), "Not a design flow" (the network type), "at least" (a level has no data). No control. The user sets the main level only in the Risers tab, as today.

## 6. Texts (word for word)

Labels show in the existing style of `.mep-field-row label` (small, upper case by CSS). The text below is the source text.

- Section heading (`h4`, as in `CircuitPanelProperties`): `Riser R1` (the name of the riser).
- Row 1 label: `Main level`. Value: `Level 0` | `not known yet` | `not known yet (no source level)` | `not known yet (more than one source level)` | `not known yet (the risers make a loop)` | `not known yet (two main levels set by hand)`. (`not known yet` alone only when no reason can be found.)
- Row 2 label: `Connected total`. Value: `750 m³/h (no concurrency factor)` | `at least 750 m³/h (no concurrency factor)` | no unit: `750 (no concurrency factor)` and `at least 750 (no concurrency factor)`.
- Tag (only for Not a design flow): `Not a design flow`
- Hints, in this order, each only when it applies. Style: `.mep-hint`.
  - (D) shared network, reused word for word from `sharedLine`: `The total also covers R2. It shares a network with this riser.` Several: `The total also covers R2, R3. They share a network with this riser.`
  - (E) not complete: `Some levels have no data, so a number reads "at least". Solved capacity counts only the levels that have data. Open Manage Buildings, tab Risers, to see which levels.`
  - (F) not known yet, reason is not a loop: `Solved capacity counts this level only until the main level is known. Open Manage Buildings, tab Risers, to set it.` Reason loop: `Solved capacity counts this level only. The risers make a loop. Open Manage Buildings, tab Risers, for details.`
  - (G) no unit, reused word for word: `This network type has no flow unit, so the numbers have no unit.`
  - (H) not a design flow, reused word for word: `These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type.`
- `title` of each value: the full sentence `Main level: Level 0` and `Connected total: 750 m³/h (no concurrency factor)` (the same text that the Risers tab shows).

Why (E) and (F) are not the T05 hints word for word: the T05 hints point to "the warnings above", to the link "Set by hand" and to the list "Source level". None of these exist in Properties. A hint that names a control that is not on the screen is a defect (L12, L14). All the other texts are reused word for word.

String source (so the words cannot drift): `riserCapacity.ts` is the only source.
- Add the exports `MAIN_LEVEL_LABEL = 'Main level'` and `CONNECTED_TOTAL_LABEL = 'Connected total'`.
- `CapacityView` gets `mainValue` (`Level 0` or `not known yet`), `totalValue` (`750 m³/h (no concurrency factor)`), `unknownReasonText` (the reason text or null), and the flags `complete`, `unknown`, `loop`, `noUnit`.
- `mainLine` and `totalLine` are built as `${LABEL}: ${value}`. Their text does not change, so the T05 tests stay green. A new unit test checks this.
- A new function `fittingRiserLinesOf(view)` returns the heading tag, the two rows (label, value, title) and the hints (D to H). `PropertiesPanel` only draws what it returns. A test on `riserCapacity.ts` checks every state of the table in 4.
- `PropertiesPanel` gets one new optional prop with this result (null = no section). `App.tsx` finds the riser of the selected fitting through `scene.getRiserMarks()` and calls `capacityViewOf` with the same building solve that feeds the scene.

## 7. Layout

Reuse: section card of the Properties panel (`.mep-section` with `h4`), row `.mep-field-row` (label left, value right), `.mep-hint`, `.mep-rp-tag`. One small addition to the row: the value is a `<span class="mep-field-text">` and the row gets the class `mep-field-row--text`. Reason: the value is a sentence of up to 40 characters. The disabled `<input>` of the row is 104 px wide and cuts it. The span copies the look of the disabled input (mono 11.5 px, weight 600, `--muted`, dotted bottom line) and takes the free width of the row: `flex: 1; min-width: 0; text-align: right; overflow-wrap: anywhere`. The row aligns to the first text line (`align-items: baseline`). So a long value wraps in 2 or 3 lines and nothing is cut. The full text is also in `title`.

Order in the Properties panel for a fitting: header "Fitting . F12"; section "Fitting" (Kind, X, Y, Solved capacity; unchanged); new section "Riser R1" (only in the states of 4). Both are plain sections of the same panel. The new section is minor: it has no card border and no title bar, only the usual `.mep-section` and its `h4`.

Dock at the default width 420 px (content about 372 px). Known state:

```
+--------------------------------------------+
| Fitting . F12                              |
+--------------------------------------------+
| KIND                          [ Junction v]|
| X (PT)                              412.5  |
| Y (PT)                              208.0  |
| SOLVED CAPACITY                       650  |
+--------------------------------------------+
| RISER R1                                   |
|--------------------------------------------|
| MAIN LEVEL                         Level 0 |
| CONNECTED TOTAL    750 m³/h (no concurrency factor) |
+--------------------------------------------+
```

Narrowest dock, 280 px (content about 232 px). A long value wraps, nothing is cut:

```
+----------------------------------+
| Fitting . F12                    |
+----------------------------------+
| KIND                [ Junction v]|
| X (PT)                     412.5 |
| Y (PT)                     208.0 |
| SOLVED CAPACITY              650 |
+----------------------------------+
| RISER R1                         |
|----------------------------------|
| MAIN LEVEL       not known yet   |
|                  (more than one  |
|                  source level)   |
| CONNECTED TOTAL  at least 12345.6|
|                  7 m³/h (no      |
|                  concurrency)      |
| Solved capacity counts this      |
| level only until the main level  |
| is known. Open Manage Buildings, |
| tab Risers, to set it.           |
+----------------------------------+
```

(The wrap of a number at a digit is the worst case of `overflow-wrap: anywhere`. At 280 px the free width of the value is about 135 px, so `at least 12345.67` normally stays on one line. The wireframe shows the safe fallback.) The dock is not a dialog, so the 1600 / 1100 / 760 px test of `ui-guide.md` section 6 does not apply. The test widths are the dock widths 280 px and 420 px. The dock keeps its own scroll.

Not a design flow (drain): the tag line `Not a design flow` (class `mep-rp-tag`) comes under the heading, and hint (H) after the rows.

## 8. Platform table

No new platform API. The numbers of other levels come from the stored summaries that B6 and T05 already read (`readPath`, `statPath`, stored handles). What the web fake hides, as steps for the platform test script B7-T06:
1. Windows desktop app, 3-level building with real PDFs on disk. Open Level 1, click the duct, then the riser fitting. Expect 500, then 650, "Main level  Level 0", "Connected total  750 m³/h (no concurrency factor)". (The web check uses OPFS files, not real disk files.)
2. Edit a terminal capacity on Level 0 and save the PDF in the desktop app. Switch to the tab of Level 1 and click the riser fitting. Expect the new numbers with no reopen. (The fake save writes to OPFS. The real save writes a PDF, and the other tab must read the new summary.)
3. In Chrome or Edge (no stored handle for Level 2): click the riser fitting of Level 1. Expect `at least` and hint (E). The web fake can open every PDF, so it hides this.
4. Drag the dock to its minimum width (280 px) on a screen with 125 % or 150 % scaling. Read the two rows in the "not known yet" state. Expect a wrapped text, nothing cut. (The headless browser has 100 % scaling.)
5. Open a document that is not a level of the building. Click a fitting. Expect no "Riser" section.

## 9. Open questions (provisional decisions, each can change)

1. **D-B-74.** The plan says "wait for the answer before T04b". This spec follows option A. If the user picks B, this spec needs no change (it has no direction word). If the user picks C, the words "Main level" change in B8 only. Recommend: go on with A.
2. **Header total versus fitting number.** The header says `500 total capacity across 1 network` (level only, D-B-78) while the riser fitting says 650. Options: (a) no note (recommended: the header text already names a network count, and the T06 script records the difference); (b) add a hint under the two rows: `The header total counts this level only.` Recommend (a). If the user finds it confusing in the Windows test, choose (b).
3. **Segment note.** Options: (a) none (recommended, see 4); (b) a line "Ends at riser R1" with a jump to the fitting (new feature, a later task).
4. **Loading state.** Options: (a) no section until the first numbers arrive (recommended: the wait is short and nothing jumps); (b) a muted line `Reading the saved summaries…` as in the Risers tab. Recommend (a).
5. **"Solved capacity" with "at least".** The number of the fitting does not read "at least" when a level has no data. Hint (E) says so in words. Recommend this for now. A change of `Solved capacity` to text needs a new field in the scene (not in this task).

## Not in this task

Arrows or direction words (B8). A capacity line on the segment panel. A change of the header total. A jump from Properties to the Risers tab. "at least" on the Solved capacity row. Concurrency factors. Sizing from the capacity.

## Addendum after the journey test (task lead, provisional)

1. A segment on a riser network shows one hint under its capacity rows: `This segment is on the network of riser R1. Select the riser fitting to see the connected total.` (several risers: `... of risers R1, R2. Select a riser fitting to see the connected total.`). It shows only when the riser block of the fitting would show too. Reason: the journey test found that a duct that shows 500 gives no pointer to the rest of the building. This replaces open question 3 (a).
2. The hook also listens to `selectionChanged`: a capacity edit emits `selectionChanged`, not `drawingChanged` (code review finding, fixed).
3. Accepted, not changed: other levels count the SAVED summary of an unsaved level (D-B-75; platform step 3 of T06 records the difference); no "at least" on the Solved capacity number (needs a scene field); the Networks tab text stays level-only without a note (open question 2 a); no link from Properties to the Risers tab; the word "Main level" (D-B-74 A, same word as the Risers tab pane of T05).
