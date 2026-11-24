# UX spec B7-T09c-2a: the Properties panel shows "at most" for a network with no source

Size: small change of an existing screen (the Properties panel, three branches: one segment, one fitting, several segments). No new control, no new section, no new setting. Open points are taken as provisional decisions (section 8). Decisions of the user stay: D-B-104 B ("at most" and the hint only when K is 2 or more), D-B-100 C (a drain uses the rule like any type), D-B-105 A.

Source files read: `PropertiesPanel.tsx` (`:37`, `:199-296`, `:297-347`, `:348-370`, terminal Capacity `:537`, `:676`), `riserSegmentHint.ts`, `flowReadModel.ts`, `scene.ts` (`SegmentInfo` `:443`, `FittingInfo` `:459`, `getSelectedFittingInfo` `:1548`), `theme.css` (`.mep-field-row`, `.mep-hint`, `.mep-dock`), `DockPanel.tsx`, plan `buildings-b7-t09-open-ends.md` sections 1, 2, 3.5, 6, 7, 9.

## Findings that change the task text

1. **`FittingInfo` has no `networkTypeId`.** The source word comes from the discipline of the network type. `SegmentInfo` has `networkTypeId`. `FittingInfo` has only id, kind, position, `solvedCapacity`, `solvedNoSource`. The panel cannot find the discipline of a fitting. Provisional fix: add the optional field `networkTypeId?: string` to `FittingInfo` (about 3 lines in `getSelectedFittingInfo`, taken from a segment that ends at the fitting; by the cascade invariant all of them have one type). This is a render change that T09c-2a did not list. Alternative if the lead refuses: the fitting hint uses the neutral word "a source equipment". Not recommended: the segment and the fitting next to it would use different words.
2. **The input is 104 px wide** (section 5). It fits `at most 100`. It can cut `at most 12345.67`. Provisional fix: a modifier class for this input (section 5).
3. **Hint A has 6 sentences.** `ui-guide.md` says a hint is one sentence. The text comes from the plan (section 7, "exact") and the user accepted the plan, so it stays. See question Q3.

## 1. Concepts

| Word on screen | User has it? | Note |
|---|---|---|
| Solved capacity | yes, existing label | unchanged |
| at most | yes, plain word, same word as the Risers tab (D-B-88) | new |
| source | yes: source, equipment, pump, AHU are the words of the engineer | new in a hint |
| air handling unit, fan, pump, boiler, panel, outlet | yes, domain words | the "source word" of the discipline |
| loop | yes (ring main) | in Hint L |
| position of the source | yes | in Hint A |
| `solvedNoSource`, `highest`, K, open end, side, node, possible source | no | never on screen |

Note: "open end" does not appear in any text of this task. The user sees "No source yet".

## 2. Journeys

Goal of the user: draw a T-duct, see the flow in the open ends before an air handling unit exists, then place the unit and see the normal numbers.

**J1: read the number, place the source (main journey). Start: one level, Supply Air. Terminal `Tm` (capacity 100), segments `main` (Tm to T), `s1` (T to O1), `s2` (T to O2), open ends O1 and O2, no equipment. The user selected nothing. 4 steps.**
1. Click segment `s1`. Properties shows "Segment · s1", field "Solved capacity" = `at most 100`, and under it Hint A with "an air handling unit or a fan". (1 step)
2. In the Stamps tab pick an air handling unit and click the canvas at O1 so that its port joins `s1`. (2 steps: pick, click.) No dialog.
3. Click segment `s2`. The field shows `0` and no hint (a source exists, the old rule). Click `s1`: `100`, no hint. (1 step for each segment. Counted once here as the check of the result.)
Total from the first click: 1 + 2 + 1 = 4 steps.

**J2: repeat the read 3 times (L3). Start: as J1 before step 2. 3 steps.**
Click `s1`, click `s2`, click fitting O2. One step each. Each shows `at most 100` and its hint. The panel keeps its section order and does not jump (the hint adds lines under the field, nothing moves above it).

**J3: change the demand and see the number follow (D-B-90). Start: as J1. 3 steps.**
1. Click terminal `Tm`. 2. Type 250 in "Capacity" and press Enter. 3. Click `s1`. The field shows `at most 250`.
Pick equipment stays the user's choice: Properties never adds a source by itself.

**J4: select several segments. Start: as J1. 2 steps.**
1. Click `s1`. 2. Shift-click `s2`. Properties shows "2 segments selected", "Solved capacity" = `at most 100`, one Hint A under the field.

**J5: loop with no source. Start: a ring of 3 fittings and 1 terminal, no equipment, no open end. 1 step.**
Click a segment of the ring. The field shows the plain number (or "Not solved" for the closing segment) and Hint L.

**Empty start:** nothing selected, or a document with no segment. Properties shows what it shows today. No new text.

## 3. Entity by action table

The new text is a derived read-out. No cell asks the user for a value. Columns follow the actions that matter on this screen.

| Entity | Select | Solved capacity field | Hint line | Edit the capacity | Undo |
|---|---|---|---|---|---|
| Segment | click on canvas | `at most N` / `N` / `Not solved` (derived) | Hint A or Hint L before the D-B-84 hint | none: derived (L1) | none for the text. It follows undo of the drawing |
| Fitting (no riser block) | click on canvas | same as segment | same as segment | none: derived | same |
| Riser fitting (`riserLines` not null) | click on canvas | `at most N` (same rule) | none here. The riser block has its own hint (task T09c-2b) | none: derived | same |
| Several segments | click, Shift-click | `at most N` / `N` / `Varies` | one Hint A or one Hint L when all selected segments agree (section 4) | none: derived | same |
| Terminal "Capacity" field | click on the terminal | none (a terminal has no "Solved capacity") | none | exists today (typed number). Not changed. A new value changes the numbers of the network at once | exists today |

Create, rename, delete, move and open do not apply: the entities exist already and the task adds no action.

## 4. State table

"Highest" means `solvedNoSource === 'highest'`. `K` is the count of possible sources. Option B of D-B-104: the engine sets `solvedNoSource` only when K is 2 or more, so the panel needs no K.

| State | Field "Solved capacity" | Line under the field |
|---|---|---|
| No source, K 2 or more (highest), value known | `at most 100` | Hint A |
| Loop with no source (`loop`), value known | `100` (plain) | Hint L |
| Loop with no source, value null (the closing segment) | `Not solved` | Hint L (the loop is the reason; provisional, Q4) |
| K = 1 (no `solvedNoSource`) | `100` | none |
| Source present (equipment) | `100`, a dead open end `0` | none |
| Not solved (value null, not a loop) | `Not solved` (never "at most") | none |
| Nothing solved yet (no result) | `Not solved` | none |
| Highest, value null (cannot happen by the rule; guard) | `Not solved` | none |
| Riser fitting with riser block | `at most 100` when highest, else as above | none (the riser block shows its own hint) |
| Drain network (id in `ROUTE_GRAVITY_TYPE_IDS`) | same as any type | Hint A or L with the drain source word |
| Several segments, all highest, same value | `at most 100` | one Hint A |
| Several segments, all highest, different values | `Varies` (label "Solved capacity (Varies)", as today) | one Hint A (every number in the set is an "at most" number) |
| Several segments, mixed (some highest, some not) | plain number if equal, else `Varies` | none (one hint cannot be true for all) |
| Several segments, all loop | plain number or `Varies` | one Hint L |
| Several segments, highest and loop mixed | plain or `Varies` | none |
| Several segments of one discipline | as above | source word of that discipline |
| Several segments of several disciplines | as above | source word `a source equipment` (the neutral word) |
| Source placed after the user selected (the selection stays) | the field and the hint refresh at once (the panel re-reads the read model after each solve) | the hint goes |

Multi-select decision (the plan table has no hint for several segments): **show the hint once under the field** when all selected segments are `highest`, and Hint L once when all are `loop`. Reason: the field says `at most 100`. A user who sees that number for several segments has the same question as for one segment: why "at most". One hint line costs 4 lines of panel height. A silent "at most" is a text with no explanation (L12). A mixed set gets no hint, because the plain numbers in the set are true numbers and the hint would be wrong for them.

## 5. Where it sits and how it fits

Place (segment branch, `PropertiesPanel.tsx:216-221`), order top to bottom:

1. row "Length" (unchanged)
2. row "Solved capacity" (value changes)
3. `<p className="mep-hint" data-testid="props-at-most-hint">` Hint A or L (new)
4. `<p ... data-testid="props-segment-riser-hint">` the D-B-84 hint (unchanged)
5. row "Network Type" and the rest (unchanged)

Fitting branch: after the row "Solved capacity" (`:327-330`), inside the same `mep-section`, no riser block hint. Several-segment branch: after the row "Solved capacity" (`:365-368`), before "Network Type".

Text layout at the default dock (420 px; the dock is 280 px at its smallest, `DockPanel.tsx:24-25`; the dock width is set in px by the user, not by the window width, so the 1600 px and 760 px windows show the same panel, only the canvas gets smaller):

```
 Segment . s1
 -----------------------------------------
 LENGTH                         2410.00 mm
 SOLVED CAPACITY               at most 100
 No source yet. Each number shows the
 largest flow for any source position.
 Numbers show different source positions.
 They do not add up at a fitting. An empty
 capacity counts as 0. Place an air
 handling unit or a fan to set the source.
 This segment is on the network of riser
 R1. Select the riser fitting to see ...
 NETWORK TYPE                  [Supply Air v]
 SHAPE                         [Round v]
```

The hint is a `.mep-hint` (11 px, muted, line height 1.4, 8 px below). It is a block under the row, so it wraps over the full section width: about 5 lines at 420 px and about 7 lines at 280 px. The dock body scrolls, so a long stack of two hints needs no new scroll rule.

Does `at most 100` fit? `.mep-field-row input` is 104 px wide, 11.5 px mono, so one character is about 6.9 px and the box holds about 14 characters. `at most ` takes 8 of them.
- `at most 100` (11) to `at most 12345` (13): fits.
- `at most 1234.5` (14): at the edge.
- `at most 12345.67` (16) and a raw float such as `0.30000000000000004`: cut. The raw float is a problem that exists today. The number is not rounded in `formatSolvedCapacity`. It is not in this task (see "Not in this task").

Is there room to widen it? Row at the minimum dock (280 px): 280 minus 2 (border), 20 (dock body padding) and 28 (section padding) is 230 px. The label `SOLVED CAPACITY` is about 89 px, the gap is 10 px, the input 104 px: 203 px. Spare: about 27 px. So the input can grow by 20 px at the narrowest dock without a wrap. The row has no wrap rule: the label of the several-segment row `SOLVED CAPACITY (VARIES)` is already longer and squeezes the input today.

Provisional design: when the text starts with `at most`, the input gets the class `mep-field-wide` (width 124 px, about 17 characters) and `title` = the full text. Plain values keep 104 px, so the right edges of the plain rows do not change. CSS: one rule, `.mep-field-row input.mep-field-wide { width: 124px; }`. No change to the label. The row stays an `input` (disabled), because the existing checks (`b7-t07-check.mjs` reads the row value) and the look of all other read-outs depend on it. The `mep-field-row--text` span pattern (T04b) is the other option: it wraps, but it has no input border, and it needs a changed `solved()` read in the old checks. Not chosen. The browser check measures `scrollWidth` against `clientWidth` of the input at a 280 px dock for `at most 12345.67`.

Major or minor: not applicable. No section card. The hint is a quiet line, like the other hints of the panel.

## 6. Texts (word for word)

Field value: `at most ` + the number as it shows today (`String(value)`). `at most 100`. Else `Not solved`, `100`, `Varies`, as today.

Hint A (once per panel):
`No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place <source word> to set the source.`

Hint L:
`This network has a loop and no source. The numbers use one start point. Place <source word> to set the source.`

Source word, from the discipline of the network type (a drain is tested first):

| Network type | `<source word>` |
|---|---|
| id in `ROUTE_GRAVITY_TYPE_IDS` (a drain, `sanitary-waste`; provisional) | `an outlet or a pump` |
| ventilation | `an air handling unit or a fan` |
| heatingAndCooling | `a pump or a boiler` |
| plumbing (not a drain) | `a pump or a boiler` |
| electrical | `a panel` |
| fireProtection | `a pump` |
| other, or a type that the document does not have | `a source equipment` |
| a selection of segments with more than one discipline | `a source equipment` |

The full strings (12 texts). The two sentences that change are the last ones; the first sentences are as above.

| Source word | Hint A, last sentence | Hint L, last sentence |
|---|---|---|
| ventilation | `Place an air handling unit or a fan to set the source.` | same |
| heatingAndCooling, plumbing | `Place a pump or a boiler to set the source.` | same |
| electrical | `Place a panel to set the source.` | same |
| fireProtection | `Place a pump to set the source.` | same |
| drain | `Place an outlet or a pump to set the source.` | same |
| other, mixed | `Place a source equipment to set the source.` | same |

Example, full Hint A for ventilation: `No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place an air handling unit or a fan to set the source.`

Example, full Hint L for electrical: `This network has a loop and no source. The numbers use one start point. Place a panel to set the source.`

Tooltip of the `at most` input: the same text as the value (`at most 100`), only so that a cut value can be read. No other tooltip.

STE check: each sentence is 20 words or less. One word for one thing: "source" (not "supply", not "root"). Active voice, except "An empty capacity counts as 0" (active). No internal word. One weak sentence: `Numbers show different source positions.` (see Q3).

## 7. Platform table

Not applicable: this task uses no platform API (no file picker, no drag and drop, no path, no save). The panel only reads the scene. No hidden item, no step for the platform test script. The Windows test script (B7-T09d) covers this panel in its own steps.

## 8. Open questions (provisional answers, the user may change them)

- **Q1: the fitting has no network type in its read model (finding 1).** Options: A) add `FittingInfo.networkTypeId?` in render (3 lines, same file as T09c-1); B) the fitting hint uses `a source equipment`. Provisional: A. Reason: the segment and the fitting on the same network get the same word.
- **Q2: the source word of a drain.** Options: A) `an outlet or a pump` (the provisional text of the lead); B) `a pump` only. Risk of A: I found no stamp named outlet or drain in the library, so "Place an outlet" may name something the user cannot place (L14). Provisional: A. The journey check or the user confirms that the user can place an outlet (an equipment stamp). If not, change to B in one string.
- **Q3: Hint A is 6 sentences and one is vague (`Numbers show different source positions.`).** Options: A) keep the plan text (decided and accepted in the plan); B) shorten to: `No source yet. Each number shows the largest flow for any source position. The numbers do not add up at a fitting. An empty capacity counts as 0. Place <source word> to set the source.` Provisional: A (the texts are "exact" in the plan; no scope change). B is a free improvement if the lead agrees, and the same text must change on the Risers tab (T09c-2b, T09c-3).
- **Q4: Hint L on an unsolved segment of a loop.** Options: A) show Hint L (the loop explains the missing number); B) show nothing. Provisional: A.
- **Q5: the hint for several segments** (section 4). Options: A) one hint when all selected segments agree (recommended); B) none, as in the plan table. Provisional: A. If the lead keeps the plan table, the field still shows `at most 100` with no explanation.
- **Q6: the input width** (section 5). Options: A) class `mep-field-wide`, 124 px, only for an "at most" value; B) leave 104 px and accept a cut at 5 digits or more. Provisional: A.
- **Q7: the hint says "flow" for an electrical network** (a load, D-B-103). Provisional: keep the plan text. Reason: "flow" is the word of the whole feature (`flow-propagation`); B7-T09c-3 sets the electrical tag on the Risers tab.

## 9. Check list for the journey tester (from the journeys above)

1. J1 step 1 on the canvas with real clicks: `at most 100` and `props-at-most-hint` read from the DOM, for `s1`, `s2`, `main`, fitting O2.
2. J3 with the real "Capacity" input and Enter: `at most 250`.
3. J1 step 3: place a source; the number and the hint refresh with no re-select; `0` on `s2`, no hint.
4. J4 and the mixed selection (one segment with source, one without): hint shows only when all agree.
5. J5 loop: plain number and Hint L.
6. Hint order: Hint A before the D-B-84 hint (a segment on a riser network).
7. A fitting that is a riser fitting: the field says `at most`, the page has no `props-at-most-hint`.
8. Width: input `scrollWidth <= clientWidth` for `at most 12345.67` at a dock of 280 px.
9. No-flag and no-source-free run: a network with an equipment shows plain numbers and no hint anywhere (as master).

## Not in this task

Rounding of the solved capacity to 2 decimals (the raw float problem exists today). A rule that makes the label wrap in the several-segment row. A "Set source" button inside the hint. The riser-fitting block text and the Risers tab (T09c-2b, T09c-3). A new hint for K = 1 (D-B-104 B says none). Any change to the terminal "Capacity" field or to the "Flow direction" box.
