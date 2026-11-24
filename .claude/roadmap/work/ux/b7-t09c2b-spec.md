# UX spec B7-T09c-2b: the Risers tab and the riser block of Properties for a group with no source level

Size: small change of two existing read-outs. No new control, section or setting. The view data change (`capacityViewOf`, `fittingRiserLinesOf` in `riserCapacity.ts`). `BuildingRisersPane.tsx` and `PropertiesPanel.tsx` do not change: they print `view.mainLine`, `view.rows`, `view.hints` (pane `:536-566`) and `riserLines.rows`/`hints` (panel `:355-367`). Open points are provisional (section 7). Decisions kept: D-B-104 B, D-B-100 C, D-B-97 A, D-B-105 A.

Read: plan sections 3.2, 7, 9 and the answers of 2026-11-24; `riserCapacity.ts`; `building-flow.ts` (`:298-322`, `:419-428`); `BuildingRisersPane.tsx:425-660`; `theme.css` (`.mep-rp*` `:6532-6700`, `.mep-field-text` `:748`); `sourceWord.ts`; spec b7-t09c2a.

## 1. Findings

1. **`mainValue` must hold the full text.** The plan says `mainValue` is `not known yet` and `mainLine` adds `(no source level)`. `fittingRiserLinesOf` copies `mainValue` to the Properties row, and adds the reason only when `unknownReasonText !== null` (`:216`). For an `atMost` group the state is `ok`, so the reason is null and Properties would read `not known yet` with no reason. Fix: `mainValue = 'not known yet (no source level)'`, `mainLine = 'Main level: ' + mainValue`. This matches the doc comment of `mainValue` ("text after `Main level: `").
2. **K = 1 is a visible state today.** A group with the highest rule, K = 1, state `ok`, no `sourceLevelId`, no `atMost` gets `mainValue` = `not known yet` now (`:154`). The line says "not known yet" next to exact numbers. This is a contradiction on screen, so the K = 1 text is needed (Q1). The plan line "the view of a group with `atMost` absent is unchanged" is true for every other group (source level, hand-set, unknown).
3. **The source word is already available.** `sourceWordOf(riser.networkType)` (`sourceWord.ts`) takes `{id, discipline}`. `riser.networkType` has both, and a drain is tested first. No new data.
4. **The "Set by hand" text depends on one flag.** `options.selectsShown` is already an input of `capacityViewOf` (`UNKNOWN_SELECT_HINT` pattern). The same flag picks the third paragraph.

## 2. Concepts

| Word on screen | User has it? |
|---|---|
| Main level | yes, existing label |
| not known yet, no source level | yes, existing words |
| at most | yes, same word as the Properties panel (T09c-2a) |
| Connected total, concurrency factor | yes, existing (D-B-105 A) |
| source, air handling unit, fan, pump, boiler, panel, outlet | yes, words of the engineer |
| Set by hand, list "Source level" | yes, existing control names |
| `atMost`, K, open end, possible source, highest | never on screen |

## 3. Journeys

Goal: draw riser networks on 3 levels, see the capacity of each span before any equipment exists, then place the equipment.

**J1: read the Risers tab. 3 steps.** Start: Example 5, no equipment. 1) Open Manage Buildings. 2) Open the tab Risers. 3) Click riser R1 in the diagram. The Capacity box shows the main line, 2 rows, the total, 3 hints (section 5). Nothing to type.

**J2: read the riser block in Properties. 2 steps.** 1) Click the riser fitting on the canvas. 2) Read the block "Riser R1": Main level `not known yet (no source level)`, Connected total `750 m³/h (no concurrency factor)`, one hint. For the span numbers the user opens the Risers tab (the hint says how). The block shows no `at most` number because it holds only the total.

**J3: act on the hint. Start: J1 done. 3 steps.** 1) Close the dialog. 2) Pick an air handling unit and click the canvas. 3) Open the tab Risers. Main line `Main level: Level 1`, rows are plain numbers, no hint. (L3: the dialog may stay open when the user uses "Set by hand": click Set by hand, choose a level in "Source level": 2 steps, same result, the pane refreshes by itself.)

**J4: K = 1. 2 steps.** Start: 2 levels, one open end only, no equipment. Steps as J1 (2 and 3). Main line `Main level: none yet (no source level)`, plain numbers, no hint, no `at most`.

Empty start (no riser selected, one-member riser): unchanged.

## 4. Entity by action table and state table

The text is derived (L1). No cell asks for a value. Actions: select (click a riser or a fitting), edit (not possible: derived), undo (the text follows the drawing), create/rename/delete/move do not apply.

| Entity | Select | Main level | Span rows | Total | Hints | Edit | Undo |
|---|---|---|---|---|---|---|---|
| Riser (Risers tab) | click in diagram | derived | derived | derived | derived | via "Set by hand" (exists) | follows data |
| Riser fitting (Properties) | click on canvas | derived row | not shown | derived row | derived | none | follows data |

State table (Risers tab). "none" = no hint of this task. Rows show `levels  value`.

| State of the group | Main line | Rows | Total | Hints |
|---|---|---|---|---|
| Source level (one equipment) | `Main level: Level 0` | `650 m³/h` | `Connected total: 750 m³/h (no concurrency factor)` | none |
| Hand-set main level | `Main level: Level 1` | plain | as above | none |
| **atMost** (K 2 or more, no source level) | `Main level: not known yet (no source level)` | `at most 650 m³/h` | as above | H1, H2, H3 |
| **K = 1** (state ok, no source level, no atMost) | `Main level: none yet (no source level)` | plain `650 m³/h` | as above | none |
| Unknown, no open-end data (state unknown, reason no-source) | `Main level: not known yet` (unchanged) | `not known yet (no source level)` (unchanged) | as above | old hint `Click Set by hand and choose a source level.` (or the select version) |
| Unknown, many sources / hand conflict / loop | unchanged | unchanged | unchanged | unchanged |
| Incomplete (a level has no data) | unchanged | `at least ...` | `at least ...` | unchanged. atMost needs a complete group, so no mix |
| No unit | as the row of the state | numbers with no unit | as above | the old no-unit hint comes after H3 |
| Not a design flow type | as the state | as the state | as above | the old design-flow hint comes last (unchanged) |

In `capacityNumberText(value, unit, atLeast, atMost)` `atMost` wins when both are true (unreachable, guard). `at most 650` with no unit.

State table (Properties, riser block):

| State | Row Main level | Row Connected total | Hints (order: shared, incomplete, state hint, no unit, design flow) |
|---|---|---|---|
| atMost | `not known yet (no source level)` | unchanged | H4 replaces `RISER_UNKNOWN_HINT` |
| K = 1 | `none yet (no source level)` | unchanged | none for the state (today none too) |
| source level / hand-set | level name | unchanged | unchanged |
| unknown, loop, incomplete | unchanged | unchanged | unchanged |

## 5. Texts (word for word)

Risers tab, group with atMost, ventilation, no selects shown:

```
Capacity
+-----------------------------------------------+
| Main level: not known yet (no source level)   |
| Connected total: 750 m³/h (no concurrency ... |
+-----------------------------------------------+
Level 0 to Level 1                at most 650 m³/h
Level 1 to Level 2                at most 600 m³/h
No source level yet. Each span shows the largest flow for any source position.
Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.
Place an air handling unit or a fan on a level, or click Set by hand and choose a main level.
```

| Id | Text |
|---|---|
| Main line (atMost) | `Main level: not known yet (no source level)` |
| Main line (K = 1) | `Main level: none yet (no source level)` (Q1) |
| Row value (atMost) | `at most 650 m³/h`, `at most 600 m³/h`. aria-label: `Level 0 to Level 1: at most 650 m³/h` |
| Total (unchanged) | `Connected total: 750 m³/h (no concurrency factor)` |
| H1 | `No source level yet. Each span shows the largest flow for any source position.` |
| H2 | `Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.` |
| H3, selects hidden | `Place <source word> on a level, or click Set by hand and choose a main level.` |
| H3, selects shown (Q2) | `Place <source word> on a level, or choose a main level in the list "Source level".` |
| H4 (Properties riser hint) | `No source level yet. Solved capacity shows the largest flow for any source position. Open Manage Buildings, tab Risers, to set the main level.` |

`<source word>`: from `sourceWordOf(riser.networkType)`. Ventilation `an air handling unit or a fan`. Heating, cooling, plumbing `a pump or a boiler`. Electrical `a panel`. Fire protection `a pump`. Drain `an outlet or a pump`. Other `a source equipment`. Example drain: `Place an outlet or a pump on a level, or click Set by hand and choose a main level.` Example electrical: `Place a panel on a level, ...`.

STE check: each sentence has 20 words or less (H4 longest: 15 words). One word for one thing: "source", "main level" (H3 says "main level", not "source level", for the action: the old hint says "source level"; Q3). The word "span" in H1: the pane calls the rows `Level 0 to Level 1`, no "span" label exists. Q3.

## 6. Fit in the pane

- The Capacity box is in `.mep-rp-info-main`: 330 px column at 900 px viewport or wider (`theme.css:6580`), the full width when stacked (under 900 px, or when the details are open, `:6588`, `:6784`). `.mep-rp-capbox` has 10 px padding: about 307 px of text width at 12 px (about 6.2 px for one character, an estimate).
- Main line atMost: 43 characters, about 267 px: one line. It does not use `nowrap`, so a long level name wraps and never cuts. K = 1 line: 38 characters, one line.
- Row: grid `minmax(0,1fr) auto`. `Level 0 to Level 1` about 105 px plus `at most 650 m³/h` about 100 px: fits. Long names wrap (`overflow-wrap: anywhere`). The list scrolls after 150 px (6 rows).
- Hints: 11 px, about 57 characters a line at 330 px. H1: 2 lines. H2: 2 to 3 lines. H3: 2 lines. About 7 lines, about 115 px, 4 px gap. The box "Flow direction" and the buttons move down by that height. The dialog body scrolls. At 760 px the column is wider (stack), so fewer lines.
- Properties (dock 280 to 420 px): the row uses `.mep-field-text`: it wraps, right aligned. `not known yet (no source level)` (31 characters, about 214 px) wraps to 2 lines at 280 px. It does not cut. The hint H4 (3 sentences) is 4 to 7 lines.
- The browser check measures `scrollWidth <= clientWidth` of the capacity box and the row text at 1600 px and 760 px (not verified here: the numbers above are estimates).
- Section order and the wireframe: no new section. Order stays: Capacity head, box (main, total), row list, shared line, hints, design-flow hint, "Read summaries now" link, Flow direction. No major/minor change.

## 7. Platform table

No platform API (no file, drag and drop, path, clipboard, window). Nothing hidden. No step for the platform test script. B7-T09d covers these texts with its own steps (step 18 of the plan).

Browser check: the pane prints `capacityViewOf`, so the new texts show with no change of the pane. A check needs the data: a building with 2 levels from 2 real PDFs, a riser, one open end on each level, no equipment (K = 2). It reads `riser-capacity-main`, `riser-capacity-row`, `riser-capacity-total`, `riser-capacity-hint` from the real DOM. The full Example 5 (3 levels) is the check of B7-T09c-3. The data needs the summaries of T09b (`openEnds`): "Read summaries" or the live data of the open sheet.

## 8. Open questions (provisional picks)

- **Q1: main line text for K = 1.** `Main level: not set` is vague: "set" by whom, and it reads as a task for the user, but D-B-104 B says no task. Options: A) `Main level: none yet (no source level)`: says the true state, same words as the atMost line and the unknown rows; B) `Main level: none (no source level)`; C) `Main level: not set` (lead's text). Provisional: **A**. Reason: the reader sees the same reason words in all states; "none yet" (not "not known") tells the reader that the numbers are exact.
- **Q2: H3 when the "Source level" list is shown.** Options: A) `Place <word> on a level, or choose a main level in the list "Source level".` B) keep `click Set by hand` (wrong: no such button then). Provisional: **A**.
- **Q3: words in H1 and H3.** Plan texts are exact: H1 says "span" (not a word on the tab) and H3 says "main level" where the list says "Source level". Options: A) keep the plan text; B) change "Each span shows" to "Each number shows" and the list name stays. Provisional: **A** (text of the plan; "span" is a minor term; the label "Main level" is on the same screen). Note for the user.
- **Q4: `mainValue` holds the full text** (finding 1). Provisional: yes. A different shape of the task text.
- **Q5: Properties for K = 1.** Row `none yet (no source level)`, no hint. Provisional: yes (D-B-104 B).

## Not in this task

The takeoff text and the tag for electrical (T09c-3). The link "Read summaries now" for a missing `openEnds` (T09c-3). A "Set main level" button in the hint. A change of the wording `concurrency`. The Properties segment hints (T09c-2a).

## 9. Check list for the journey tester

1. J1 on the real tab with 2 levels, K = 2: main line, 2 rows `at most`, total, 3 hints, exact text (`riser-capacity-*`).
2. Source word of a drain and of an electrical riser in H3 (select the network type by the real dialog).
3. J2: Properties riser block: row text, hint H4, no `RISER_UNKNOWN_HINT`.
4. J3: place equipment; the tab shows `Main level: <level>`, plain numbers, no hint. Also "Set by hand" then the list "Source level": H3 text with the list.
5. J4 (K = 1): `none yet (no source level)`, no `at most`, no hint, in the tab and in Properties.
6. Unknown no-source state keeps its old text (no open-end data).
7. A group with a source: strings equal to master.
8. Widths at 1600 and 760 px; screenshots `b7-t09c2b-*`.
