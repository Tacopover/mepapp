# UX spec B7-T05: capacity in the Risers tab and in the Risers takeoff table

Size: small change of an existing screen (the info panel of the Risers tab, one takeoff table). Words follow D-B-74 option A: neutral words only in new text. The B4 texts ("Flow direction" box, "Up · source: Level 0", the select "Source level") stay until B8.

Source files read: `building-flow.ts`, `BuildingRisersPane.tsx`, `riserInfo.ts`, `riser-quantities.ts`, `theme.css` (block "Risers pane"), `BuildingSummariesPane.tsx`, `ManageBuildingsDialog.tsx`.

## Findings that change the task text

1. **The action "Read summaries now" is on the Levels tab, not on the Risers tab.** `BuildingSummariesPane` sits in the Levels panel (`ManageBuildingsDialog.tsx:622`). It shows only when a sheet has NO summary (`sheetsWithoutSummary`, `hasOwnProperty` on `sheetSummary`). The warning "The summary of level X has no riser data. Read the summaries." is for a summary that exists but has no `riserNetworks` (an old summary). For that case the Levels tab shows no button at all. So the user cannot follow the text. Fix in this task: a link button "Read summaries now" inside the Capacity section (see 6). It calls the same `onRebuildSummaries` as the Levels tab (`rebuildSummaries` reads every document, so it also repairs old summaries).
2. **The solve result has no reason for `state: 'unknown'`.** The reason (no source, more than one source, loop, two hand-set levels) exists only inside warning strings. The pane must not parse strings. Provisional: add the optional field `unknownReason?: 'no-source' | 'many-sources' | 'loop' | 'hand-conflict'` to `BuildingFlowGroup` (4 lines in `building-flow.ts` and one test). Fallback if the lead refuses a core change: the row text is only "not known yet" and the hint says "See the warnings above."
3. A riser with one member has no span and no group. The pane shows a hint (see 6).
4. The pane reads summaries asynchronously (`readSummaries`). Before the first read ends, the solve would show false warnings ("has no saved summary"). The pane needs a "loaded" flag (state table).

## 1. Concepts

| Word on screen | User has it? | Note |
|---|---|---|
| Capacity (of a span) | yes: capacity of equipment and segments in Properties | |
| Main level | yes, domain word chosen by the checker | replaces "source" in new text |
| Connected total (no concurrency factor) | yes (engineer word: no concurrency factor) | |
| at least | yes, plain word | |
| Read summaries now | yes, exists on the Levels tab | |
| Not a design flow | yes (engineer word) | |
| node, group, span, entry, exit, `riserNetworks`, `complete` | no | never on screen |

## 2. Journeys (journey of the task: a user with 3 levels and one riser understands the numbers without help)

**J1: all numbers known. Goal: read the capacity of each span. Start: building with Level 0, 1, 2, one riser R1, an equipment on Level 0, all summaries saved, unit m³/h. 2 steps.**
1. Open the Building dialog. (The Risers tab is not the first tab.)
2. Click the tab "Risers". R1 is selected by itself (first riser). The user sees under "Capacity": "Main level: Level 0", "Connected total: 750 m³/h (no concurrency factor)", rows "Level 0 to Level 1" 650 m³/h and "Level 1 to Level 2" 150 m³/h. No hint line.
Repeat check (L3): click 3 risers one after another in the diagram. 1 step each; each shows its own numbers; the list order does not move.

**J2: one level has no summary. Goal: understand why a number reads "at least" and fix it. Start: as J1, Level 1 has no saved summary. 3 steps.**
1. Open the Building dialog. 2. Click "Risers". The user sees "Connected total: at least 750 m³/h (no concurrency factor)" and the span rows "Level 0 to Level 1: at least 650 m³/h", "Level 1 to Level 2: at least 150 m³/h" (the number of a row is "at least" when a level behind it has no data). Under the rows: the hint and the button "Read summaries now". The "Warnings (1)" line at the top of the tab names Level 1.
3. Click "Read summaries now". The button shows "Reading…" and is off. When it ends, a notice shows "Read 3 of 3 summaries." The "at least" words, the hint and the button go. (If a PDF cannot be read, the notice says "1 PDF needs to be opened first." and the hint stays.)

**J3: no source level. Goal: set the main level. Start: 3 levels, no equipment on any level. 4 steps.**
1. Open the Building dialog. 2. Click "Risers". The user sees "Main level: not known yet", "Connected total: 750 m³/h (no concurrency factor)", the rows "Level 0 to Level 1: not known yet (no source level)" and the hint "Click Set by hand and choose a source level."
3. Click "Set by hand" (existing link). Two selects show.
4. In the select "Source level", choose "Level 0". The rows now show 650 and 150. "Main level: Level 0".

**Empty start:** no riser. The pane shows the existing text. Not changed.

## 3. Entity by action table

Capacity is a derived read-out: create, rename, delete, move, open, select, undo are all "none: derived from the levels and summaries". The only new control is the link "Read summaries now": create = none; undo = none (a rebuild of saved summaries, same as on the Levels tab).

## 4. State table (info panel of the selected riser)

| State | The user sees | Controls |
|---|---|---|
| No riser | existing text "No riser yet. ..." | none |
| Loading (first read of summaries) | subhead "Capacity" and the hint "Reading the saved summaries…". No numbers. The top warning list shows only the B4 warnings | none |
| Riser with one member | subhead "Capacity" and the hint "This riser has one level. A capacity needs two levels." | none |
| All known | header lines and one row per span, no hint | none |
| "at least" (a level has no data) | numbers with "at least"; hint; button when a member sheet has a PDF link but no summary or no riser data (derived from `summaries`); else no button | "Read summaries now" |
| Not known yet | rows "not known yet (<reason>)"; "Main level: not known yet"; the total still shows (reads "at least" when not complete); hint "Click Set by hand and choose a source level." (reason loop: "See the warnings above.") | existing "Set by hand" |
| Hand-set main level | "Main level: <level>" (no extra word; the Flow direction box already says "Set by hand") | existing selects |
| Unit not set | numbers with no unit; hint "This network type has no flow unit, so the numbers have no unit." | none |
| Drain, fire protection, electrical | tag "Not a design flow" next to the subhead and the hint (see 6) | none |
| Many levels (30) | header lines stay fixed; the span list scrolls (about 8 rows high) | scroll |
| 760 px | the info panel is one column (existing rule below 900 px); rows are text left, number right, the number wraps under the text when the line is too long | same |
| Error: summaries cannot be read | same as "no summaries": warnings name the levels; no extra message (existing behavior of `readSummaries` error) | "Read summaries now" if shown |
| Busy (rebuild runs) | button label "Reading…", off | button off |
| Already done | after a good rebuild the hint and the button go | |

## 5. Derive it or ask for it

Capacity: derived. Main level: derived; the user may set it by hand with the existing select (kept). Unit: derived from `riser.networkType.flowUnit` (never the unit of the open level). "Not a design flow": derived from the network type. No new setting.

## 6. Layout and texts (word for word)

**Place:** a new block "Capacity" in the left column of the info panel (`mep-rp-info-main`), directly under the "Flow direction" box and before the selects. The block shows results; the selects and links below are the controls. Reason for the left column and not for the level rows: the rows of the right column list levels (highest first, each with the buttons "Go to" and "Detach"). A span lies between two levels, so it has no row. Spans read lowest first ("Level 0 to Level 1") as the B4 line does. The right column is already full at 760 px. The right column stays unchanged.

Wide (1600 px, dialog about 1100 px of content):

```
| Risers                                                             |
| Show [x] Supply air [x] Drain                                      |
| (diagram)                                                          |
| v Warnings (1)  - Level 1 has no saved summary. Read the summaries.|
| +-------------------------------+--------------------------------+ |
| | == R1                         | Level 2   OK     [Go to][Detach]|
| | Level 0 to Level 2 . 3 levels | Level 1   OK     [Go to][Detach]|
| | Flow direction                | Level 0   OK     [Go to][Detach]|
| | [ Up . source: Level 0 ..   ] |                                |
| | Capacity        [Not a design flow]                              |
| | [ Main level: Level 0         ]                                |
| | [ Connected total: at least 750 m3/h (no concurrency factor) ]          |
| |  Level 0 to Level 1  at least 650 m3/h |                       |
| |  Level 1 to Level 2  at least 150 m3/h |  (list scrolls > 8 rows)|
| | Some levels have no data, so some numbers read "at least".     |
| | The warnings above name each level.  Read summaries now         |
| | Set by hand | More details                                      |
| | [Delete riser]                |                                |
+-------------------------------+--------------------------------+
```

760 px (one column; the right column with the level rows goes under the left column as today):

```
| == R1                                |
| Level 0 to Level 2 . 3 levels . 4 m  |
| Flow direction                       |
| [ Up . source: Level 0 ...         ] |
| Capacity                             |
| [ Main level: Level 0              ] |
| [ Connected total: 750 m3/h (no ..)] |
|  Level 0 to Level 1     650 m3/h     |
|  Level 1 to Level 2     150 m3/h     |
| Set by hand | More details           |
| [Delete riser]                       |
| Level 2  OK  [Go to][Detach] ...     |
```

Classes (no new pattern; reuse): subhead `mep-rp-subhead` (a flex row when the tag shows); the two header lines in the existing derived box `mep-rp-flowbox` (same look: dashed accent box means "derived value" in this pane); hints `mep-hint`; link `mep-rp-link`. New small classes only for the span rows: `mep-rp-cap-list` (max-height about 190 px, `overflow-y: auto`), `mep-rp-cap-row` (grid `minmax(0, 1fr) auto`, 8 px gap, 4 px by 0 padding, bottom line `--surface-2`, the same look as `mep-rp-row`), `mep-rp-cap-value` (right aligned, tabular numbers, `overflow-wrap: anywhere`; muted colour for "not known yet"), `mep-rp-tag` (12 px, `--muted`). No change in the media block. Each row has an `aria-label` with the full sentence: "Level 0 to Level 1: 650 m³/h".

Major or minor: the block is a sub-block of the info panel, not a section card. It is as quiet as the Flow direction block. No card.

**Texts**

- Subhead: `Capacity`
- Tag (drain `sanitary-waste` (`ROUTE_GRAVITY_TYPE_IDS`), discipline `fireProtection`, discipline `electrical`): `Not a design flow`. Its `title` and a visible hint below the rows: `These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type.`
- Line 1: `Main level: Level 0`; unknown: `Main level: not known yet`.
- Line 2: `Connected total: 750 m³/h (no concurrency factor)`; not complete: `Connected total: at least 750 m³/h (no concurrency factor)`; no unit: `Connected total: 750 (no concurrency factor)`. Note: the draft had no colon after "Connected total"; I added one so both lines match.
- Row (one per span, lowest level first): `Level 0 to Level 1` + value `650 m³/h`; not complete: `at least 150 m³/h`; unknown: `not known yet (no source level)`, `not known yet (more than one source level)`, `not known yet (the risers make a loop)`, `not known yet (two main levels set by hand)`. Without unit: `650`, `at least 150`.
- Shared network (group has more than one riser): `The total also covers Riser 2, Riser 3. They share a network with this riser.` (one riser: `The total also covers Riser 2. It shares a network with this riser.`)
- Not complete: `Some levels have no data, so some numbers read "at least". The warnings above name each level.` and the link button `Read summaries now` (shown only when a member sheet has a PDF link but no summary or no riser data; hidden when the app cannot read PDFs, `onRebuildSummaries` absent). While it runs: `Reading…`. Result: the notice of the dialog with `rebuildResultText` ("Read 3 of 3 summaries.").
- Unknown: `Click Set by hand and choose a source level.`; loop: `See the warnings above.`
- No unit: `This network type has no flow unit, so the numbers have no unit.`
- One member: `This riser has one level. A capacity needs two levels.`
- Loading: `Reading the saved summaries…`

**Warnings (dialog):** all solve warnings go into the existing "Warnings (N)" list at the top of the tab, after the B4 warnings, unchanged text. One list for the whole building (provisional decision 1). The existing rule stays: open when 3 or fewer.

**Takeoff table "Risers"** (`riserTable`, `riserTakeoffWarnings`): three new columns at the END, after "Flow set by": `Capacity`, `Capacity unit`, `Capacity complete`. Reason for the end: the numbers come after the columns that decide them (flow direction, source level), and the old column letters in the Excel files of users do not move. Why three columns: one unit in a header is wrong for a table with air, water and electrical risers. A number cell holds no text, so "at least" lives in its own column.
- `Capacity`: a number (2 decimals at most) or empty. Empty for an end row, a one-member riser and a span with state unknown.
- `Capacity unit`: `riser.networkType.flowUnit` (for example `m³/h`), empty when the unit is not set or the capacity is empty.
- `Capacity complete`: `Yes` or `No` (`No` means "at least"). Empty when the capacity is empty.
- Takeoff warnings, in this order: the existing span warnings; the solve warnings as the core builds them (they name the level; no prefix); one line per network type that has numbers but no unit: `Network type <name> has no flow unit. Its capacity numbers have no unit.`; the line that replaces `Flow is not summed across levels.`: `Capacity is a plain sum of connected capacities, with no concurrency factor. It is not a design flow.`; the existing fire damper line.

## 7. Platform table

No new platform API. The new link "Read summaries now" reuses the existing rebuild (`fileAccess.readPath`, `statPath`, `pdfEngine`). What the web fake hides, as steps for the platform test script (B7-T06):
1. In the Windows desktop app with PDFs on disk, open the Risers tab with one level not saved. Click "Read summaries now" in the Capacity block. Expect: no picker, the numbers lose "at least", a notice "Read N of N summaries."
2. In Chrome or Edge with a PDF that has no stored handle: click the same button. Expect: the notice "1 PDF needs to be opened first." (or the existing reason text), the hint stays.
3. Export the takeoff to Excel. Expect: the three new columns at the end; a sum over the column "Capacity" with a filter on `Capacity unit` works.

## 8. Provisional decisions (the user may change them)

1. One list of all solve warnings (whole building) in the existing Warnings line. Reason: the strings carry no riser id, and a filter by text breaks. The per-riser state comes from the structure (spans and groups), so the Capacity block does not depend on the strings.
2. Capacity block in the left column under the Flow direction box; the level rows stay unchanged.
3. Add `unknownReason` to `BuildingFlowGroup` (core, small). Fallback in finding 2.
4. Link button "Read summaries now" in the Capacity block (the Levels tab has none for a summary with no riser data).
5. Takeoff: three columns at the end (`Capacity`, `Capacity unit`, `Capacity complete`).
6. "Not a design flow": a tag next to the subhead plus a visible hint; in the takeoff one general warning line, no per-row mark.
7. Span list scrolls above 8 rows (max-height), header lines stay fixed.
8. The pane gets the live data of the open sheet as the new prop `live` (from the dialog, same function as T04b).
9. Mixed words on one screen until B8: the Flow direction box and the select say "source"; the new block says "Main level". Accepted by D-B-74 A. The hint "choose a source level" uses the label of the existing select, so the user finds the control.

## Not in this task

Arrows or "Up/Down" in the new text (B8). A capacity per level row. Concurrency factors. Sizing from the capacity. A filter of warnings by riser.
