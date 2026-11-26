# UX spec B8-T01: the flow direction of a network type

Scope: one new select in `NetworkTypeEditorDialog.tsx`. No new dialog, no new section. Decisions D-B-113, D-B-118, D-B-125, D-B-127 A and D-B-128 A are kept. The value has two states only: Supply and Return (no third value).

Measured on the real dialog (web build, 2026-11-26): the dialog is 345 px wide and has no fixed width. It grows with its widest select. The selects are 197 to 213 px wide. The label column is 9.5 px upper-case mono, and a two-word label ("FLOW UNIT") wraps to two lines. The dialog is the same width at 1600 px and at 760 px, because the browser window is wider than the dialog in both cases.

## 1. Concepts

| Concept | Does the user have it? | On screen? |
|---|---|---|
| Network type | Yes (old MEPSketcher, the dialog title). | Yes, as today. |
| Supply and return | Yes. Every MEP engineer knows both words. | Yes, as the two options. |
| Source (the equipment that feeds the system) | Yes. B7 already shows "source equipment" and "Source level". | Yes, inside the option text. |
| Flow direction | Yes, as "flow direction" of a system. | Yes, as the label. |
| "flowSense" (the field name) | No. Only the code has it. | No. |
| Library default / stored value | No. Only the code has it. | No. The user sees one value. |

## 2. Where the select sits (decision 1)

Section 2, "Flow and sizing", first row. Order of the section: Flow direction, Flow unit, Sizing method.

Reason:
- The value is about the flow. Section 1 holds the name and the look of the type (identity first, L7). Flow direction is not a look.
- The section title already says "Flow". No new section is needed.
- On top, the row does not move the two notes that belong to the sizing rows (limits note, discipline note). Those notes stay below "Sizing method".
- The value does not depend on the discipline. The select is always on and never changes when the user changes the discipline.

Tab order: Name, Discipline, Color, Thickness, Pattern, Flow direction, its "i" mark, Flow unit, Sizing method, its "i" mark, Cancel, Duplicate, Save.

## 3. Texts, word for word (decisions 2 and 3)

| Item | Text |
|---|---|
| Label | `Flow direction` |
| Option 1 (value `supply`) | `Supply (away from source)` |
| Option 2 (value `return`) | `Return (toward source)` |
| "i" mark label (aria) | `About the flow direction` |
| "i" mark text (one sentence pair, 118 characters) | `A network type has one flow direction. For the other direction of the same system, use Duplicate and change the copy.` |
| Success feedback | None. The dialog closes on Save, as today. |
| Error text | None. The select has two values and cannot hold a wrong one. |

Why not the long option texts of the brief ("... away from the source equipment"): the select is as wide as its widest option. Measured: 39 characters give about 335 px for the select, and the dialog grows from 345 px to about 470 px. Every other select then floats at the right with a large gap. The two short texts give about 225 px and a dialog of about 365 px. The word "source" is the word of the Risers tab ("Source level"). It is the same for every type (D-B-113). The code constant `NEUTRAL_SOURCE_WORD` is not needed here.

The hint (question 2). A short neutral text exists. It says "for the other direction of the same system", and it names no pipe, duct or cable. It sits in an "i" mark like the two other notes of this dialog (`unitReadNote`, `limitsNote`). The row stays one line high, so the dialog height does not change. The same step goes into the platform test script (step 4 below), because an "i" text shows only on hover or focus.

Text keys: add to `sizeText` in `sizePlan.ts`: `flowSense` (label), `flowSenseSupply`, `flowSenseReturn`, `flowSenseInfoLabel`, `flowSenseNote`. Add the five keys to `PLAIN_KEYS` in `sizePlan.test.ts`. The text tests (not empty, 140 characters or less, no CFM/door/crossing, no Dutch word) pass.

The hint does not say "arrows". In T01 no arrow exists yet. T07 adds a second sentence to the hint when arrows exist: `The arrows on risers and segments follow it.` (T07 owns this change.)

`data-testid`: `nt-flow-sense` on the select. `nt-flow-sense-note` on the span around the "i" mark (same pattern as `nt-limits-note`).

## 4. Wireframe

Same at 1600 px and 760 px (the dialog is content-sized and about 365 px wide; it fits at 760 px with room to spare, and the body scrolls if the window is low).

```
+--------------------------------------------------+
| Network type: Chilled Water                      |
|                                                  |
|   NAME                         [ Chilled Water  ]|
|   DISCIPLINE         [ Heating & Cooling      v ]|
|   COLOR                                   [ #  ] |
|   THICKNESS (PT)                            2    |
|   PATTERN                 [ Solid             v ]|
|  ------------------------------------------------|
|   FLOW AND SIZING                                |
|   FLOW         [ Supply (away from source)  v ] i|   <- new row, major section 2
|   DIRECTION                                      |
|   FLOW UNIT         [ Not set               v ]  |
|   SIZING            [ Not sized             v ]  |
|   METHOD                                         |
|  ------------------------------------------------|
|                     [Cancel] [Duplicate] [Save]  |
+--------------------------------------------------+
```

Rows use the existing `mep-field-row` (label left, control right). The select takes the `mep-field-row` style of the neighbor selects. The "i" mark follows the select, as in the Sizing method row. Section 1 stays the major section for identity. Section 2 stays a minor section (small grey upper-case title). No new pattern.

## 5. Networks tab tile (decision 4)

No. The tile (`StampsPanel.tsx` about line 440 to 470) keeps name, unit text and the color swatch.

- Derive or ask (L1): the value is asked in the editor and shown on the canvas by the arrows (T05, T07). A third place that repeats it is a second copy of the same state.
- The user owns the concept (L5): the user picks a type to draw with. The direction is not part of that pick. The tile has 14 neighbors in a narrow grid. A "Return" tag on 3 tiles would be a new thing to read for no new action.
- A copy that the user made for a return line is told apart by its name. The Name field is in the same dialog. The test script tells the tester to rename the copy (for example "Chilled Water return"). A copy that stays named "Chilled Water_copy" is the choice of the user.

## 6. Derive it or ask for it

| Value | Derived or asked | Reason |
|---|---|---|
| Flow direction of a type | Asked, with a derived start value | Data cannot tell whether a pipe of a water system is supply or return (D-B-127). The start value comes from the library default of the same id, else Supply. |
| Which end is nearer the source | Derived (T02) | From the building flow solve. No control. |

## 7. State table of the select

| State | What the user sees | Select on? |
|---|---|---|
| Type has a stored value | That value. | Yes |
| Type has no stored value, id is in the library (Return Air, Exhaust Air, Sanitary Waste: Return. The other 11: Supply) | The library value. | Yes |
| Type of the user with no stored value (old file) | Supply. | Yes |
| Library type that this drawing never used (tile of the Networks tab) | The library value. Save adopts the type and writes the value (the same path as Color today). | Yes |
| Copy made with Duplicate | The dialog shows the copy ("Network type: X_copy") with the effective value of the source as it was stored. | Yes |
| Duplicate after the user changed the select but did not save | The copy has the stored value of the source. The unsaved draft is lost. This is the same as every other field of the dialog today. The test script does Duplicate first. | Yes |
| Cancel, Escape, or a click on the backdrop after a change | Nothing is saved. A reopen shows the old value. | Yes |
| Save | The dialog closes. The value is stored. Only the flow direction changed: the dialog still sends its other fields, so the drawing layer redraws as today. This costs nothing visible. A patch of only `flowSense` through the scene API does not redraw (T01 core task). | Yes |
| Save with a changed flow unit | The convert panel shows first. The select keeps its draft. The answer buttons save everything, as today. | Yes, the select stays on. The Save button is off while the panel shows (as today). |
| Type opened from the Size dialog | Same dialog, same value. The Size dialog does not show the value. | Yes |
| Value in the file is not `supply` or `return` | Dropped at load. The user sees the default. | Yes |
| Empty, loading, error | Not applicable. The dialog always has a type. | n/a |
| Disabled | Never. The value does not depend on another field. | n/a |

Dead control note (L14). In T01 alone the select has no visible effect on the canvas. The arrows come with T04, T05 and T07. The part ships to the user as a whole (part A), so this is accepted. The T01 check proves that the value is stored and read back.

## 8. Two required changes outside the dialog (found while reading the code)

1. `duplicateNetworkType` (`scene.ts` about line 2775) returns `null` when the type is not adopted yet, and the dialog does nothing, with no message. The Duplicate button of a library type that the drawing never used (for example Chilled Water in a new drawing) is dead. This is the route that D-B-127 A gives to the user for a return pipe, so it must work. Fix: the function adopts the type first, as `updateNetworkType` does (`this.adoptTypes([id], [])`). A test: Duplicate of an unadopted library type gives a copy.
2. The same function copies with `{ ...source, id, name }`. It must also write `flowSense: flowSenseOf(source)`. A copy has a new id, so the library fallback by id does not find it. A copy of Exhaust Air would become Supply (this is the reason for the file step in D-B-125, and it applies to a drawing that is not migrated too).

## 9. Entity by action table: network type

| Action | Control | Note |
|---|---|---|
| Create | Duplicate button of the editor (name "X_copy", keeps the flow direction). No other way. | D-B-127 A: no new library type. |
| Rename | Name field of the editor. | |
| Set flow direction | Select "Flow direction" in the editor. | New. |
| Delete | None. | No delete exists for a network type today. Not in this task. |
| Move | Not applicable. | |
| Open | Color swatch (title "Edit") on a tile of the Networks tab. "Edit type" button of the Size dialog. | |
| Undo | None. Cancel before Save. | Every field of the editor is saved directly and is not undoable today. |
| Select | Click a tile name. | |

## 10. Journeys

Start for J1 to J3: a drawing with a PDF open, MEP dock tab, Network Types, filter HVAC.

**J1: change Return Air to Supply and save. 3 steps.**
1. Click the swatch of the tile "Return Air". The editor opens. Flow direction shows "Return (toward source)".
2. Choose "Supply (away from source)" in Flow direction.
3. Click Save. The dialog closes.
Reopen (1 step): the select shows Supply.

**J2: make a return copy of Chilled Water. 4 steps, 5 with a new name.**
1. Click the swatch of "Chilled Water". The editor opens with Supply.
2. Click Duplicate. The same dialog now shows "Network type: Chilled Water_copy" and Supply. A tile "Chilled Water_copy" shows in the grid.
3. Optional: type a new name, for example "Chilled Water return".
4. Choose "Return (toward source)".
5. Click Save. The dialog closes. The new tile stays in the list.
Repeat for Heating Water and Domestic Hot Water (L3): 3 times 5 steps. The dialog closes after each Save, as today. A repeated use needs one click on a swatch each time. This is the same for every field of this dialog and is accepted.

**J3: the value is kept after Save of the project and reload. 6 steps.**
1. Do J1 (Return Air is Supply) and J2 (a copy that is Return).
2. Menu, Save. Reload the page and open the project again.
3. Open the tile "Return Air". It shows Supply.
4. Close with Cancel. Open the copy of Chilled Water. It shows Return.

**J4: from an empty start. 3 steps.** A new drawing with a PDF and no segment. Open the tile "Exhaust Air" (never used in this drawing). Flow direction shows Return. Click Save with no change. Reopen: Return. Then Save the project: the file holds the value.

**J5: Cancel. 3 steps.** Open "Supply Air", choose Return, click Cancel. Reopen: Supply.

**J6: an old project file. 3 steps.** Open a project saved before this change. Open "Return Air". It shows Return. Open "Sanitary Waste" (tab Plumbing). It shows Return.

## 11. Platform table

| Platform API | Web test fake | Real platform | What the fake hides | Windows step |
|---|---|---|---|---|
| Save of the project file | OPFS handle. Writes the JSON of the project. | File System Access API (Chrome, Edge) or the Tauri file API. | Nothing for this value. The value is a field inside the JSON. | Step 1: do J3 with a real file on disk. |
| Open of an old project file | OPFS file made by the check. | A real older file on disk. | The check cannot hold a file that an older build saved. | Step 2: do J6 with a real project saved before this change. |
| Older app refuses a version 24 file | Not testable in the web fake. | The user may still have an older build. | Unit test only (core). | Not a step (one PC cannot hold both builds in the same state). |
| Native select popup | Headless Chromium draws no popup. | Windows draws the popup list in the system font. | The text of the options may be wider than the select. | Step 3: open Flow direction on Windows. Read both options in full. Check that the dialog is not cut at 125 % and 150 % display scaling. |
| "i" mark text (hover or focus) | Hover works in the check. | Same. | Nothing. | Step 4: hover the "i" next to Flow direction. The text reads "A network type has one flow direction. For the other direction of the same system, use Duplicate and change the copy." Press Tab to the "i": the text shows, and Escape closes only the text. |
| File picker, drag-drop, path | Not applicable | Not applicable | Not applicable: this task opens no picker and uses no path, apart from the project Save and Open above. | none |
| Duplicate of a type never used | Same | Same | Nothing | Step 5: in a new drawing, open Chilled Water, click Duplicate, rename the copy, choose Return, Save. The tile of the copy shows. |
| Dialog at 760 px | Resize works | The user resizes the window | Nothing | Step 6: narrow the window to 760 px. Open the editor. Every row is whole and Save is visible. |

## 12. Success feedback

Text: none. The editor closes on Save, as for every other field. This is enough: the user sees the dialog close, and a reopen shows the new value. The Networks tab shows nothing new (section 5). The visible result on the canvas comes with T05 and T07 (arrows). A toast would be a new pattern for one field and would be missing for the other fields of the same Save.

## 13. Checks the journey tester writes (from this spec)

Real DOM, real web store, one Chromium page. At 1600 and 760 px. Screenshots of the editor with Supply and with Return.
- J1 with a real select change and a real Save click. Then read the type in the document.
- J2 with a type never used (no segment drawn). The copy exists, shows Return, and keeps its source unchanged.
- J3: Save to OPFS, reload, reopen, the value is there.
- J4, J5, J6 (a file made without the field).
- Fails before the change: no select with `nt-flow-sense` exists. Duplicate of an unadopted type returns no copy.
- A no-flag run: no flag in the URL (plain `pnpm dev` equals production).

## 14. Open questions for the user

None. The plan and the decision batch answer everything this screen needs. Two points go to the director for a ruling, not to the user:
- Option texts are shorter than the brief ("Supply (away from source)") because the long text makes the dialog 125 px wider (measured). The director can overrule it.
- Section 8 adds two small changes to `duplicateNetworkType` that the plan text for T01 does not list. The first one is needed for the route of D-B-127 A to work at all.

## 15. Not in this task

- A tag or a column for the direction in the Networks tab or in the Size dialog.
- A delete action for a network type.
- A new library type for a return line (D-B-127 B) and a third value `none` (D-B-128 B).
- Saving the unsaved draft of the editor when the user clicks Duplicate.
- The editor sending only changed fields.
