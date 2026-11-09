# UX spec: B4-T06 (Make riser, Attach, Detach, sync) and B4-T09 (Risers tab)

Status: draft for the user. Decisions kept: D-B-04, D-B-13 A, D-B-14 (mm), D-B-18 A, D-B-55 A, D-B-56 A, D-B-58 A. No product code changed.
Reuse: `CanvasContextMenu.tsx` (button list), `Dialog.tsx`, `BuildingSection` (`quiet`), the status-line `notice` of `ManageBuildingsDialog`, the tab strip at `ManageBuildingsDialog.tsx:494-506`, the Levels pane row style, in-app confirm (no `window.confirm`).

## 1. Concepts (words the user has)

| Word | Source | On screen |
|---|---|---|
| Riser (name R1, R2) | the old app and the drawing: a pipe or duct that goes through floors | yes |
| Shaft name (SH1) | the drawing: the shaft label | yes, optional text in the tab |
| Level | B3 | yes ("on level 2") |
| Network type | the app | shown, never asked in B4 |
| Flow direction, source level | D-B-18 | yes, in the tab only |
| End: "Continues", "Open", "Capped" | D-B-55 | yes, in the tab only |
| Scale of the page | the app (calibration) | yes, in hints |
| Member, pending op, anchor, pt | code only | NO. Text says "on level X", "waiting to move", "position" |
| Conflict | code | text says "Riser R1 is not where the building file puts it" |

## 2. Journeys

**J1 Make a riser from nothing (empty start: no riser).** Goal: mark the shaft on level 0. Start: building open, sheet of level 0 open and scaled, one fitting at the shaft.
1 right-click the fitting; 2 click "Make riser..."; 3 type a name (default "R1" is filled and selected, may skip); 4 press Enter or "Make riser". 4 steps (3 if the default name is kept).
After 4: dialog closes, the fitting gets a ring, status line "Riser R1 made on Level 0."

**J2 Attach on the next level.** Goal: join level 1 to R1. Start: J1 done, sheet of level 1 open and scaled, a segment ends near the shaft.
1 right-click the segment end; 2 click "Attach to riser..."; 3 choose "R1" in the small dialog (only one choice: preselected); 4 "Attach". 4 steps (3 with one riser: the choice is preselected, press Enter).
After: the end jumps to the shaft position, ring shown, status "Riser R1 attached on Level 1."

**J3 Repeat three times (L3).** Goal: attach R1, R2, R3 on level 1. Each repeat is J2 (4 steps). The dialog closes after each attach; the menu is one right-click away; the list in the dialog does not show a riser that is already on this level, so the next riser is preselected.

**J4 Move the riser (sync).** Goal: shift the shaft 200 mm. Drag the ringed fitting on level 0 (1 step). Open level 1: the fitting is there; status line "Riser R1 moved to match the building". If level 1 is closed: it moves when it opens.

**J5 Fix a wrong attach.** Right-click the ringed fitting on level 1, "Detach from riser" (2 steps). The fitting stays as a plain fitting.

**J6 Recover from the conflict.** The user calibrates a page again, or routes over the riser fitting. On the next open or after the change the conflict dialog shows. 1 click decides.

## 3. Entity by action table

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Riser | right-click fitting "Make riser..." | Risers tab, name field | right-click "Delete riser" or tab "Delete riser" (confirm in app) | drag the ringed fitting; all levels follow | tab "Go to" | the drag on the source level undoes; the other levels follow (D-B-56 A); make, attach, detach: Ctrl+Z through the scene | click ring selects the fitting |
| Riser on a level | "Attach to riser..." | derived (riser name) | "Detach from riser" | derived (follows the riser) | "Go to level X" in the tab | as above | the fitting |
| Riser fitting | made by Make riser | none (the riser has the name) | refused (message 6.4) | drag | n/a | yes | yes |

## 4. State table

### 4.1 Canvas menu (right-click)

| State | The user sees |
|---|---|
| No building open, or the document is not a sheet of the open building | no riser entries at all (menu as today). Hide, L13 |
| Plain fitting with at least 1 segment, page scaled | "Make riser..." on |
| Same, page not scaled | "Make riser..." dim, hint line under it (grey, 12 px): "Set the scale of this page first." |
| Fitting with no segment | no entry |
| Segment end or free point, page scaled, at least 1 riser without a member on this level | "Attach to riser..." on |
| Same, not scaled | dim + "Set the scale of this page first." |
| No riser is free on this level | entry dim + hint "Every riser already has a part on this level." (if no riser exists at all: entry hidden) |
| Ringed fitting (riser fitting) | "Detach from riser" and "Delete riser". "Make riser..." and "Attach..." hidden |
| Fitting that has a riser ring AND the menu already shows "Remove fitting" | "Remove fitting" stays but refuses with message 6.4 (not hidden; the existing entry is reused) |

Order in the menu: existing entries first, a divider, then riser entries. Menu items are plain buttons like `mep-draw-from-menu-btn`; a dim item shows its hint as a second grey line inside the item (not only a tooltip, ui-guide 4).

### 4.2 Make riser dialog

| State | The user sees |
|---|---|
| Open | name filled "R1" (next free number), selected; type line; limit line; help line; buttons "Make riser" (primary) and "Cancel" |
| Name empty | "Make riser" off; hint "Type a name." |
| Name used | "Make riser" off; hint "A riser with this name exists." |
| Page size warning | not applicable at make time (one page only). It shows in the Attach dialog (6.2) |
| Busy | none; the action is instant |

### 4.3 Attach dialog

| State | The user sees |
|---|---|
| Open | select of free risers, first one chosen; line "Type: Supply air" (type of the riser); button "Attach" |
| Segment type equals riser type | "Attach" on |
| Types differ | "Attach" off; red-less message under the select (6.2) |
| Page sizes differ >1 % | "Attach" stays on; amber line (6.2) |
| Scale unknown | cannot open (menu entry is dim) |

### 4.4 Risers tab: see section 8.

## 5. Derive it or ask for it

| Value | Mode | Reason |
|---|---|---|
| Position of the riser | derived from the fitting you click | no input |
| Network type | derived from the segments at the fitting; shown | domain rule: the segment defines the type. If the fitting has segments of two types, "Make riser..." is dim: "The segments here have different types. Change the type of the run first." |
| Name | asked, default R<n> | user label |
| Shaft name | asked in the tab, optional | not in the Make dialog (keep it short) |
| Level of a part | derived from the sheet | |
| Flow direction, source level, ends, allowance, connection height | asked in the tab, defaults: unknown, none, Continues, 0, 0 | cannot be derived (D-B-18 A) |
| Elevation difference / length | derived (levels) | shown read only in the tab |

## 6. Texts, word for word

### 6.1 Menu
- "Make riser..." / "Attach to riser..." / "Detach from riser" / "Delete riser"
- Hints: "Set the scale of this page first." ; "Every riser already has a part on this level." ; "The segments here have different types. Change the type of the run first."

### 6.2 Dialogs
Make riser dialog. Title: "Make riser".
- Label "Name" (input).
- Line: "Type: {type name} (from the segments at this fitting)" with a color chip as in the network type list.
- Help (grey, 12 px): "Sheets line up only if the PDFs share the same origin and orientation. A shared coordinate system comes later."
- Help: "For an offset, use two risers and a horizontal run."
- Buttons: "Make riser", "Cancel".
- Warning (amber, shows when another riser is closer than 150 mm on this level): "Riser {other} is only {d} mm from this place."

Attach dialog. Title: "Attach to riser".
- Label "Riser" (select; each option "R1 - Supply air - levels 0, 2").
- Line "Type: {type name}".
- Type differs: "This run is {run type}. Riser {name} is {riser type}. Change the type of the run first." Button "Attach" off.
- Page size warning: "Page sizes differ by {n} mm: the sheets may not line up." (shows n in mm; button stays on)
- Buttons: "Attach", "Cancel".

### 6.3 Status line and notices (bottom of the building dialog and the app status bar)
- "Riser {name} made on {level}."
- "Riser {name} attached on {level}."
- "Riser {name} detached from {level}."
- "Riser {name} deleted. Its fittings stay on the sheets."
- Sync: "Riser {name} moved to match the building"
- Waiting for a scale: "Set the scale of {sheet} to move riser {name}"
- Pending (closed document): "Riser {name} moves on {sheet} when you open it."
- Weak sheet match: "{sheet}: riser {name} waits. Open this sheet from the building to apply it."
- Scale from a saved summary: add after a sync text: "(scale from the saved sheet)".

### 6.4 Refusals (shown where the action was: status line plus, for a key press, a notice near the canvas)
- Delete a riser fitting: "This fitting belongs to riser {name}. Detach the riser first, or use Delete riser."
- Remove a sheet that is a riser part (sheetRemovalBlock): "Detach the riser first." Full form in the sheet row: "Detach riser {name} first." (the short core text stays "Detach the riser first.", the UI adds the name when it knows it)
- Move a sheet to a level that already has the riser (sheetMoveBlock): "Level {level} already has a part of riser {name}. Detach the riser first."
- Delete a level that holds a riser part: "Level {level} has riser {name}. Detach the riser first."
- Network type change on a run with a riser (no refusal, D-B-13 A): a notice after: "Type changed on {n} levels for riser {name}."
- Level taken (should be hidden by 4.1): "Riser {name} already has a part on this level."

### 6.5 Conflict dialog
Title: "Riser {name} is not at the building position". Body (1 line each):
- "On {level}, the fitting is {d} mm from where the building file puts riser {name}."
- "A new scale on a page moves every riser on that page into this state."
Buttons: "Move the riser here" (the riser and all levels follow this fitting; primary), "Snap back" (this fitting returns to the building position), "Decide later" (closes; the ring turns amber, status "Riser {name} is not at the building position.").
Both main buttons are one undo step on this sheet.

## 7. Layout of the T06 screens

Context menu (existing width, ~200 px):
```
 Draw from port
 Remove fitting
 ------------------
 Make riser...
   Set the scale of this page first.   (grey, only when dim)
```
Make riser dialog (400 px wide, 1600 and 760 px alike; single column):
```
+ Make riser ------------------------------+
| Name  [R1________]                        |
| Type  [chip] Supply air                   |
| (grey) Sheets line up only if the PDFs... |
| (grey) For an offset, use two risers ...  |
|                  [Cancel] [Make riser]    |
+-------------------------------------------+
```
Attach dialog is the same frame: Riser select, Type line, message line, buttons.
Ring color: third ring color (the code picks it); amber ring for the conflict.

## 8. B4-T09 Risers tab

Placement: a second tab "Risers" next to "Levels and sheets" in the strip at `ManageBuildingsDialog.tsx:494-506` (id `mep-buildings-tab-risers`, panel `mep-buildings-panel-risers`; arrow keys switch tabs). The tab label shows a count when risers exist: "Risers (3)". Hidden warnings badge: a dot when `riserWarnings` is not empty. The tab keeps its state when the user switches (L4: list order = by name, natural sort).
It needs no path read: all data is in the building file plus `sheetStatus` (works on web and desktop, D-B-53). "Go to" opens the sheet through the same `openSheetKeepOpen` as the Levels pane (on web it can ask for "Choose file..." as today).

### 8.1 Sections (major / minor)
1. Major: one `BuildingSection` per riser ("RISER" kind word, title = name, right side = "{n} levels"). The identity fields come first: Name, Shaft name.
2. Minor (quiet), below the list: "Warnings" (from `riserWarnings`, plus the flow warnings of 8.4). Empty: not shown.

### 8.2 Body of one riser section (two blocks)
Block A, fields (label above input, 2 columns at 1600 px, 1 column at 760 px):
`Name` | `Shaft name` | `Type` (read only chip + name) | `Flow direction` (select: Up, Down, Both, Unknown) | `Source level` (select: "None" + only levels that have the riser) | `Top end` (select: Continues, Open, Capped) | `Bottom end` (select) | `End allowance (mm)` (number, 0 or more; off with a hint when both ends are "Continues": "Only used for an open or capped end.")
Top end / bottom end labels: the top end is the end at the highest level of the riser; the bottom end the lowest. The select shows "Continues" if the riser continues above (a part on a higher level exists). Because the data stores `member`, show "Continues" as the stored value and do not offer it when the end has no level beyond? No: keep the 3 values always (data model); a hint under the pair: "Top is the highest level of this riser: {level}."

Block B, list of the riser on its levels (list row grid, ui-guide 2). Order: by elevation, highest first (like a building drawing). Columns at 1600 px:
```
| Level (minmax(0,1fr)) | Sheet (160) | Height (110) | Status (110) | Actions (104) |
| Level 2               | A-201 .pdf  | [ 0 ] mm     | OK           | [Go to]       |
| Level 1               | A-101 .pdf  | [ 300 ] mm   | Waiting      | [Go to] [Detach] |
| Level 0               | A-001 .pdf  | [ 0 ] mm     | Not at position | [Go to] [Detach] |
```
At 760 px the Sheet column drops (name in tooltip). Header row labels: "Level", "Sheet", "Height above floor", "Status". "Height above floor" is the connection height; tooltip: "Where the riser connects, above the finished floor of this level."
Status words: "OK" (nothing pending, no conflict), "Waiting" (a pending move or retag; tooltip lists "Moves when {sheet} opens"), "Not at position" (conflict; tooltip: "The fitting is {d} mm from the building position. Open the sheet to decide."). Status is text plus an icon, not color alone.
Section footer (right): `Rename` is the Name field (commit on Enter or blur, same as the level name editor); destructive button "Delete riser" at the left of the title bar's far end, away from "Go to". Delete asks in place: "Delete riser {name}? The fittings stay on the sheets." with "Delete riser" and "Cancel". After delete a line with "Undo" for 8 s (same pattern as the Levels pane `UNDO_MS`).
"Go to" has no "member" word. Go to opens the sheet and activates the page (B3-T05), then the scene selects the riser fitting.

### 8.3 Empty and other states
| State | Seen |
|---|---|
| No risers | one line "No risers yet. Right-click a fitting on a sheet and choose Make riser..." No box |
| No building sheets open | the tab works; Go to opens the sheet |
| One level only | warning "Riser {name} has one member." shown as "Riser {name} is only on one level." (UI rewrite of the core text; see 8.5) |
| Waiting op, document closed | status "Waiting" |
| Conflict | status "Not at position" + the section title bar gets an amber dot |
| Sheet missing | Go to off, tooltip "The PDF is missing. See Levels and sheets." |
| 30 risers | list scrolls inside the panel; sections are collapsed after the first 5? NO: keep all open; the panel scrolls (stress case to test) |

### 8.4 Flow warnings (new, needs a rule table)
- Flow "Up" or "Both" on a drainage type: "Drainage runs down. Set the flow direction to Down."
- Exhaust or return type with a source level not set: "Set the fan level as the source level."
- Exhaust or return type with a source level that is not the fan: the app cannot know; no warning. The select label says "Source level (fan level for exhaust and return)" only for those types.
- Flow "Unknown": no warning (D-B-18 A default). No default is written.
Warnings sit under the field that causes them (amber, 12 px) and again in the minor Warnings section.

### 8.5 Warning texts (core text stays; the UI maps them)
| core text | shown |
|---|---|
| "Riser R1 has one member." | "Riser R1 is only on one level. Its length is unknown." |
| "...open or capped end and no end allowance." | "Riser R1 has an open or capped end and no end allowance. Set the end allowance." |
| "...end allowance but both ends are members." | "Riser R1 has an end allowance but both ends continue. The allowance is not used." |
| "Risers A and B are closer than 150 mm on level L." | same text |
Because these are core strings with "member", the UI maps the first and third by the riser name (decision for the implementer: edit the core strings, they are not yet shown anywhere; recommended).

### 8.6 Entity by action for the tab
Rename: field. Delete: button + in-app confirm + Undo line. Move: not here (drag on the sheet). Open: Go to. Select: none (the sections do not select).

## 9. Platform table

| API | Web fake | Real platform | Hidden | Test step |
|---|---|---|---|---|
| Go to a sheet (open PDF) | opens the cached file | web: needs "Choose file..." after every restart (D-B-53); desktop: path read | the web "Choose file..." step | P1 web: restart, Go to, see the picker, choose the file, the sheet opens |
| Pending ops | fake keeps the building in memory | web: restart closes all documents, so every move becomes pending | the fake never closes documents | P2 move the riser on level 0, restart the app, open level 1: the fitting moved and the status line shows |
| Save of a synced document | memory | desktop: the document is dirty after the sync | the fake has no dirty-on-close prompt | P3 after a sync, close level 1: the app asks to save |
| Building file save | OPFS/browser store | desktop file | the file lock on OneDrive (desktop) | P4 two risers made fast: both are in the file after restart |
| Scale source | live scene | saved summary for a closed sheet | the summary can be stale | P5 scale level 1 again, check the status says "scale from the saved sheet" for a closed sheet |

## 10. Open questions (few; the rest the plan answers)

Q1. How does the Risers tab know a type is "drainage" or "exhaust or return"? `NetworkType` has `discipline` only (ventilation, plumbing ...), no supply/return kind.
 - A (recommended) a small word match on the type name (drain, waste, sewer = drainage; exhaust, extract, return = fan-sink), the warning is a hint and only shows on a match; no new field.
 - B add a `flowRole` field on the network type (file change, a user setting).
 - C no flow warning in B4.
Q2. Menu order: show the riser entries at the end after a divider (recommended), or at the top? Recommend the end: they are rare.
Q3. A fitting with segments of two types: Make riser dim with a hint (recommended, follows the domain rule), or let the user pick one type and retag the run?
 - Recommend the dim hint (no hidden retag).

## 11. Not in this task
Shaft name in the Make dialog; drag-to-create; a multi-riser select; the shared coordinate system (B5); flow or size across levels; a fire-rated flag (D-B-58 A: no flag).

## 12. Check list for the journey tester
J1 to J6, each at 1600, 1100 and 760 px; from empty and from a state of 30 risers with 80-character names; the web platform steps P1 to P5.
