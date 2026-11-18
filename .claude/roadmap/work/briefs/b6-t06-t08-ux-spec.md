# B6-T06, T07 and T08 UX spec: changed file, one reconnect button, row text

Plan: `.claude/plans/buildings-b6-pdf-access.md`. Earlier specs: `b6-t01-ux-spec.md` (Reconnect PDFs), `b6-t03-t04-ux-spec.md` (saved PDFs, one folder permission). Screen: the "Sheets" section of `LevelSheetsPane` (the band, the rows) and the notice line. No change to the building file format. No new data change: a "use the new file" action calls the same code as Relink (`relinkSheet`, `sheetsOfSamePdf`, `relinkWouldDuplicate`).

Code facts used (read 2026-11-18):
- `SheetFileCache.take()` and `scanPdfFolder()` match a file by `fileName:sizeBytes`. A file with a new size never matches, so it is skipped with no message.
- `App.tsx openSheetNow` (about line 1086 to 1102): after a row pick with another size, the file opens and the notice `pickedOtherFileNotice()` says "Use Relink on the sheet to update it." But the Relink button shows only when the status is `pdf-missing`, and the web app never sets that status. This is the dead end of the bug report. The sizes in the building file do not change, so the row says "Choose file…" again.
- Stored handle with a new size: `openStoredSheet` deletes the handle (`shouldDeleteHandle`) and the T04 notice says "... is not the same file any more. Choose the file again." with the picker. The user must pick the file that the app just read.
- `useSheetRelink.relink()` reads the file (`readPdfInfo`: page count and project id), asks `RelinkConfirm` only when the project id is a different document, then `applyRelink()` updates every sheet of the same PDF (`sheetsOfSamePdf`, also on other levels) with the new `fileName` and `sizeBytes`. `relinkSheet` does not check the page count. `relinkWouldDuplicate` refuses a duplicate (notice `RELINK_REFUSED`).
- The old text "Not linked yet. Open the PDF in MepApp and save it once" is two strings: the chip label `statusLabel('not-stamped')` = "Not linked yet" and `statusHint('not-stamped')` = "MepApp cannot link this PDF to the sheet yet. Open the PDF in MepApp and save it once." (`buildingStatus.ts` lines 46 and 68). `LevelSheetsPane.tsx` line 373 shows the hint as `p.mep-sheet-hint` under the row for `not-stamped` and `not-opened`. The status means "the PDF has no MepApp id yet". It says nothing about the file. It is not the real problem when the row needs a file.

## 1. Concepts

| Word | Does the user have it? |
|---|---|
| PDF, sheet, level, building, file, folder | Yes. |
| Reconnect PDFs | Yes (T01). One word for "tell the app where the files are". It stays the one entry. |
| The PDF changed | Yes. The user edited and saved the PDF in another program. The user does not know "size" as the test. The text says "changed". |
| Use the new file | Yes. Plain. Same job as Relink, but the user never sees the word Relink for this case. |
| Allow access | Yes (T04). Only on the folder item of the menu. |
| "size", "key", "handle", "stamped", "id", "relink" in new texts | No. Not in new texts (L5). Old words "Relink…" stay on the desktop button, where it is a real button. |

## 2. Rules (derived, not asked)

- **Changed file.** A picked file is a *changed file* of a sheet when its file name equals the file name of a sheet of this building, and no sheet of the building has that name and that size. Derived.
- **Same PDF.** The sheets that change together are `sheetsOfSamePdf` (as Relink). One prompt names the number of sheets (all levels).
- **Where it is found.** (1) Row "Choose file…" or "Open" (picker, or stored handle that now has another size). (2) "Reconnect PDFs…" files. (3) "Reconnect PDFs…" folder scan (scan also collects same-name files with another size). The file is never used before the user says yes.
- **One name, two candidates.** Two different changed files with one name (two subfolders, or two picked files) are not used. The text of T01 and T03 "two different files with the same name" applies. The user uses "Choose file…" on the row.
- **Name and size both differ.** Not a changed file. Existing behaviour stays (question 2).
- **Another document.** When the new file has a project id that is a different document than the sheets (Relink rule), the existing `RelinkConfirm` question shows instead of the changed-file question. The user never sees two questions for one file.
- **Page count.** Same as Relink: the sheets stay and keep their page number. No sheet is removed or moved by the app. The prompt and the notice name the sheets whose page is not in the new file (question 3).
- **On yes.** The app (a) updates `location.fileName` and `location.sizeBytes` of every sheet of that PDF (`applyRelink`), (b) remembers the file in this tab (cache) and replaces the stored handle (new key, old key deleted, Chrome and Edge), (c) for a row pick, opens the sheet.
- **On cancel.** Nothing changes in the building. The file is not remembered. The row keeps "Choose file…" and gets the changed-file line (section 6). The band does not change.
- **Session memory of "changed".** The app keeps the set of sheets known as changed in this tab (a pick or a stored handle showed it). It is not saved in the building file. After a restart the set is empty and the row says what the browser knows (needs the file). Derived.
- **Many changed files.** One prompt for all (question 1). The user started the action for the whole set, so one decision is enough, and the prompt names every PDF.
- **Desktop.** Not changed. Path-based rows show "Out of date" through the old summary check. Not part of this task.
- **Band.** One button, "Reconnect PDFs…" (T07). Chrome and Edge: the button opens a small menu. Firefox and Safari: the button opens the file picker at once (no menu, no folder text).

## 3. Journeys

**J1. Edit in another viewer, open from the row (main, T06).** Goal: open a sheet after the PDF was saved by another program. Start: Chrome, building with plan-L1.pdf on 2 levels (3 sheets), the browser has the file stored.
1. Click "Open" (or "Choose file…") on a row of plan-L1.pdf. (1 click) The app reads the file; for "Choose file…" the user picks plan-L1.pdf in the picker (2 more steps).
2. Under the row the prompt shows: `plan-L1.pdf changed. Use the new file for 3 sheets?` with "Use new file" and "Cancel". (0 steps)
3. Click "Use new file". (1 click) The sheet opens. The notice says `Using the new plan-L1.pdf for 3 sheets.` All 3 rows say "Open".
Total: Open path 2 clicks (no picker, stored handle); picker path 2 clicks + 1 pick. Today: no way out.

**J2. Three changed files, Reconnect (T06 + T07).** Start: 9 PDFs, 3 of them edited. Rows say "Choose file…" or "Open".
1. Click "Reconnect PDFs…", click "Choose files…" in the menu. (2 clicks) Pick 9 files with Ctrl+A. (1 pick)
2. The band area shows one prompt: `3 PDFs changed: A.pdf, B.pdf, C.pdf. Use the new files for 7 sheets?` with "Use new files" and "Cancel".
3. Click "Use new files". (1 click) The notice: `Found all 9 PDFs. Using the new files for 3 PDFs (7 sheets).` All rows say "Open".
Total 4 clicks + 1 pick for all 9 PDFs.

**J3. Folder scan with changed files (T06 + T07).** Same start, folder known. 1. "Reconnect PDFs…" then "Choose a folder…" (or "Use the folder Plans" when the folder is stored). 2. The browser asks "View files in Plans?" (only when the folder is new or not allowed). 3. The scan finds 6 exact files and 3 changed files. One prompt as in J2. 4. "Use new files". Notice: `Found all 9 PDFs in Plans. Using the new files for 3 PDFs (7 sheets).`

**J4. Cancel, decide later.** In J1 click "Cancel". The sheet does not open. The prompt closes. The row shows the changed-file line `The PDF changed after it was added. Click Choose file… and use the new file.` The band has the hint of section 7. The user clicks "Choose file…" again later: J1.

**J5. Repeat 3 times (L3).** The user opens 3 changed sheets of 3 PDFs one by one with "Open": 2 clicks each (Open, Use new file) = 6 clicks. The prompt of the first closes before the next row. The band path (J2) needs 4 clicks + 1 pick for all, so the band hint offers it (section 7) when 2 or more rows are known as changed.

**J6. Fewer pages.** The PDF had 3 pages, the user deleted page 3. J1 prompt: `plan-L1.pdf changed. Use the new file for 3 sheets? The new file has 2 pages. The sheet for page 3 cannot open.` Click "Use new file". The sheets of page 1 and 2 open. The row of page 3 shows `Page 3 is not in the file. Remove this sheet, or choose another file.` The user removes it with "Remove" (existing button). The app removes nothing by itself.

**J7. Other document with the same name (existing question).** The user picks a plan-L1.pdf from another project. The existing text shows: `The file "plan-L1.pdf" is a different document than the sheets of plan-L1.pdf. Relink the sheets to it? They keep their levels.` Same buttons as today. No change.

**J8. One entry (T07, first use after restart).** Start: 9 PDFs saved, no folder. 1. The band hint says `9 PDFs are saved in this browser. Click Reconnect PDFs… to open them.` 2. Click "Reconnect PDFs…", the menu shows 2 items. 3. Click "Choose a folder…". 4. Pick the folder. Notice `Found all 9 PDFs in Plans.` The band is gone. 3 clicks + 1 pick. Today: 2 buttons, the user must guess.

**J9. Firefox or Safari.** No menu. "Reconnect PDFs…" opens the file picker. Changed files: prompt as J2. No folder text anywhere.

**J10. Empty start (L11).** New building, no sheets: no band, no row. After "Add PDFs…" every file is in the tab: no band, rows say "Open". No new text appears. The changed-file question first shows after the user edits a PDF and picks it.

**J11. Failure.** "Use new file" but the update is refused (another sheet already uses this document and page): the notice `Could not relink: another sheet already uses this document and page.` (existing text, error). The prompt closes. Nothing changes.

## 4. Entity by action table

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Sheet | not changed | none | not changed | not changed | "Open" or "Choose file…" on the row. A changed file adds the prompt. | none (the update of the file size is not an edit the user would undo; "Choose file…" again with the old file gives the question again) | n/a |
| Changed PDF (new, not stored) | derived: the app finds it at a pick or a scan | none | none | none | "Use new file" in the prompt | "Cancel" in the prompt (no change made) | none |
| PDF connection (T01, T03) | "Reconnect PDFs…" menu: "Choose a folder…", "Choose files…" (T07 merge) | none | none | none | via the row | none | scope = selected node (T01, derived) |
| PDF folder (T04) | menu item "Choose a folder…" | none | none (T04 question 4) | menu item "Choose another folder…" | menu item "Use the folder {Folder}" | none | none |

## 5. State table

The prompt is `ChangedFileConfirm` (same look and place pattern as `RelinkConfirm`: `.mep-buildings-actions` with a `.mep-hint` text and two buttons). It sits under the row (row pick) or under the band (many files). One prompt at a time.

| State | What the user sees | Controls |
|---|---|---|
| Empty (no sheets) | no band, no prompt | none |
| Loading (reading the new file, up to a few seconds for a large PDF) | the buttons "Reconnect PDFs…" and the row button are off; the band hint of the state stays. Short busy text in the notice line `Reading plan-L1.pdf…` is not used: the read is under 1 s for plans of a normal size (see platform table step 11). | Reconnect off while the read runs |
| Error (cannot read the file, not a PDF) | notice `Could not read plan-L1.pdf: {message}` (existing text of Relink) | all on |
| Partial (some exact, some changed, some missing) | one prompt for the changed ones; the notice after the answer has found, changed and missing parts | prompt buttons on |
| Prompt open | text and 2 buttons. The rows stay clickable. A new pick replaces the prompt (the earlier file is dropped; the new prompt is visible, so it is not silent). | "Use new file(s)", "Cancel" |
| Done | rows "Open"; band gone when nothing is left to do; notice | n/a |
| Disabled | "Reconnect PDFs…" off while a folder scan runs (T04) | off |
| Already done (the user picks the same new file again) | the file now has the stored size: it matches exactly, no prompt, the sheet opens | n/a |
| Cancelled | no change; row shows the changed-file line; band hint as in section 7 | all on |

Row states (T08) and the text of each are in section 6.

## 6. Texts (word for word)

### 6.1 T06 prompt and notices

| Case | Text | Buttons |
|---|---|---|
| Row, one PDF, N sheets | `{name} changed. Use the new file for {N} sheets?` (N = 1: `{name} changed. Use the new file for this sheet?`) | `Use new file`, `Cancel` |
| Row, fewer pages | the sentence above + ` The new file has {M} pages. The sheet for page {k} cannot open.` (more than one page: `The sheets for pages {k1}, {k2} cannot open.`) | same |
| Many files | `{K} PDFs changed: A.pdf, B.pdf, C.pdf and 2 more. Use the new files for {N} sheets?` (K = 2 or 3: all names, no "and more"; max 3 names, then `and {r} more`) | `Use new files`, `Cancel` |
| Many files, fewer pages | the sentence above + ` {n} sheets are for pages that are not in the new files.` (n = 1: `1 sheet is for a page that is not in the new file.`) | same |
| Yes, row | notice `Using the new {name} for {N} sheets.` (N = 1: `Using the new {name} for 1 sheet.`) | normal |
| Yes, many | joined after the pick result: `Found all 9 PDFs. Using the new files for 3 PDFs (7 sheets).` | normal |
| Yes and pages missing | the sentence above + ` The sheet for page 3 of plan-L1.pdf cannot open. Remove it, or choose another file.` | normal |
| Cancel, row | no notice. The row shows the changed-file line. | none |
| Cancel, many | notice `3 PDFs changed and were not used: A.pdf, B.pdf, C.pdf.` (names as above) | normal |
| Refused | `Could not relink: another sheet already uses this document and page.` (existing) | error |
| Read error | `Could not read {name}: {message}` (existing) | error |
| Two changed candidates | `For {name} the folder has two different files with another size. The app cannot tell which one to use. Use Choose file… on its row.` (for picked files: `you chose two different files`) | normal |
| Other document | existing `RelinkConfirm` text and buttons `Relink to this file`, `Cancel`. Unchanged. | n/a |

Prompt aria: the paragraph has `role="status"`. "Use new file" is the first button and keeps focus after the prompt shows (keyboard: Enter confirms, Esc cancels). `data-testid="changed-confirm"`, buttons `changed-confirm-yes`, `changed-confirm-cancel`.

Replaced text: `pickedOtherFileNotice()` ("... Use Relink on the sheet to update it.") is not used for a name match. It stays for name and size both different, with the new text in question 2: `This file has another name than the sheet. The sheet keeps its saved file name.` (Recommended text; the dead pointer to Relink goes.)

Replaced text: the T04 notice for a stored file with another size (`{name} is not the same file any more. Choose the file again.`) is replaced by the prompt of J1. The notice is not shown any more for a name match.

### 6.2 T07 band, button, menu

Button (all browsers): label `Reconnect PDFs…`, aria-label `Reconnect PDFs`, `data-testid="reconnect-pdfs"` (unchanged, so old checks work). The old button `Allow access to the PDF folder…` and its test id `allow-pdf-folder` are removed from the band; the menu items take over the work (`pdf-folder-pick`, `pdf-folder-use`, `pdf-files-pick`).

Tooltip, Chrome and Edge: `Tell the app where the PDF files are. Choose the folder with the PDFs, or choose the files. The app only reads the files.` For a level: the tooltip names the level scope as in T01: `... for this level`. Short form: `Choose the folder or the PDF files of this {level|building}. The app finds the sheets by file name. No sheet is added or changed.`
Tooltip, Firefox and Safari: unchanged T01 text: `Choose the PDF files of this {level|building}. The app finds the sheets by file name and size. No sheet is added or changed.` (also says "and size": the real rule, plus changed files get the question).

Menu (Chrome and Edge only). Each item has a label and one line of help:

| Item | Label | Help line |
|---|---|---|
| 1 (no folder stored) | `Choose a folder…` | `The app finds the PDFs of this building in the folder and the folders inside it.` |
| 1 (folder stored, browser must ask) | `Use the folder {Folder}` | `The browser asks you once to allow access.` |
| 1b (folder stored) | `Choose another folder…` | `The app uses it instead of {Folder}.` |
| 2 | `Choose files…` | `Pick the PDF files yourself. Press Ctrl+A in the picker to pick all.` |

The menu shows 2 items (no folder) or 3 items (folder stored, access needed) or 3 items (folder stored, granted: `Search {Folder} again`, `Choose another folder…`, `Choose files…`). Label of the first item when granted: `Look in {Folder} again`.

Band hint (replaces the T04 hints; the words "Allow access" leave the band; the one action is "Reconnect PDFs…"):

| State | Hint |
|---|---|
| No file, nothing saved, N = 1 | `1 PDF needs a file before it opens. Click Reconnect PDFs… to choose the folder or the file.` |
| No file, nothing saved, N more | `{N} PDFs need a file before they open. Click Reconnect PDFs… to choose the folder or the files.` |
| Saved, no folder, P = 1 | `1 PDF is saved in this browser. Click Reconnect PDFs… to open it.` |
| Saved, no folder, P more | `{P} PDFs are saved in this browser. Click Reconnect PDFs… to open them all.` |
| Saved, folder stored | `{P} PDFs are saved in this browser. Click Reconnect PDFs… and use the folder {Folder} to open them.` (P = 1: `1 PDF is saved in this browser. Click Reconnect PDFs… and use the folder {Folder} to open it.`) |
| Folder granted, N missing | `{N} PDFs are not in the folder {Folder}. Click Reconnect PDFs… to choose the files or another folder.` (N = 1: `1 PDF is not in the folder {Folder}. Click Reconnect PDFs… to choose the file or another folder.`) |
| Saved and N at least 1 | the saved sentence + ` {N} PDFs need a file before they open.` (as T04) |
| Changed known (K at least 2, session) | `{K} PDFs changed after they were added. Click Reconnect PDFs… and choose the new files.` (shown only when no other sentence applies; K = 1 shows only the row line) |
| Busy (folder scan) | `Looking for PDFs in {Folder}…` (button off) |
| Firefox, Safari | T01 text, unchanged: `1 PDF needs a file before it opens. Choose it again.` / `{N} PDFs need a file before they open. Choose them all in one step.` |

The Changed hint counts PDFs, not sheets. The band shows when any sentence applies. L13: when nothing applies, no band.

Result notices stay as T01 and T04 (`Found all 9 PDFs in Plans.`, `Found 7 of 9 PDFs ...`, and so on). Changed text from the old T04 that names a removed button:

| Old text | New text |
|---|---|
| `Access was not allowed. Choose the files with Reconnect PDFs…, or change the site setting in the browser.` | `Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser.` (unchanged in meaning; the old text already names Reconnect) |
| `The folder {Folder} is not there any more. Allow access to the PDF folder again.` | `The folder {Folder} is not there any more. Click Reconnect PDFs… and choose the folder again.` |
| `Access was not allowed. Click Allow access to try again, or choose the files.` (T04 spec) | `Access was not allowed. Click Reconnect PDFs… to try again, or choose the files.` |

Keyboard: the button is a normal button (Tab, Enter, Space). Enter or Space opens the menu and puts focus on item 1. Arrow Down and Arrow Up move. Enter runs the item. Esc closes and returns focus to the button. Tab closes the menu. A click outside closes it. The menu does not trap focus. The picker opens from the item click (the click is the gesture).

### 6.3 T08 row text, all states

The chip label stays. The second line of the row (`p.mep-sheet-hint`, `data-testid="sheet-hint"`) shows ONE line, chosen by this order (first that applies). Web only; a desktop row keeps the existing status hints.

| Order | Row state | Chip | Button | Row line |
|---|---|---|---|---|
| 1 | Open in a tab (`openedSheetIds`) | as status | `Opened` (off) | none |
| 2 | Page not in the file (after a failed show of the page) | as status | `Open` | `Page {k} is not in the file. Remove this sheet, or choose another file.` |
| 3 | Changed file (known in this tab, prompt cancelled or closed) | as status | `Choose file…` | `The PDF changed after it was added. Click Choose file… and use the new file.` |
| 4 | Needs the file (web, not in the tab, not stored) | as status | `Choose file…` | `The browser needs this PDF file again. Click Choose file…` |
| 5 | Can open (in the tab or stored) | as status | `Open` | none, except the identity line of order 7 |
| 6 | Missing or no access (desktop probe) | `Missing` / `No access` | `Open` off, `Relink…` / `Grant access…` | existing `statusHint` texts, unchanged |
| 7 | PDF has no MepApp id yet (`not-stamped`), only when orders 2 to 4 do not apply | `Not linked yet` | as above | `This sheet finds its PDF by file name and size. Save the PDF once in MepApp to link it for good.` |
| 8 | Not opened (`not-opened`), only when orders 2 to 4 do not apply | `Not opened yet` | as above | `Open this PDF in MepApp to read its summary.` (existing) |

- Replaced: `MepApp cannot link this PDF to the sheet yet. Open the PDF in MepApp and save it once.` (`statusHint('not-stamped')`) becomes `This sheet finds its PDF by file name and size. Save the PDF once in MepApp to link it for good.` The same string serves the chip tooltip.
- Button tooltips: `Open` stays `Open this sheet`. `Choose file…` for a changed file: `The PDF changed. Choose the new file to use it.` `Choose file…` otherwise: unchanged (`This browser cannot open the PDF by itself. Choose the file again.`).
- The line for order 4 repeats on every row that needs a file. For a building with 30 such rows the band already says it once; the line is short and gray (`.mep-hint`, 12 px) (question 6).
- "Page not in the file" (order 2) comes from `openRow` failing on a page index above the page count. The notice for that click: `Could not open {name} page {k}. The file has {M} pages.` (error).

## 7. Derive it or ask for it

| Value | Mode |
|---|---|
| That a file changed | derived (same name, other size) |
| Which sheets use the new file | derived (`sheetsOfSamePdf`, as Relink) |
| New size, new name in the sheets | derived (from the picked file) |
| Use the new file or not | asked (prompt). Reason: the file may be a wrong copy; the app cannot know. |
| Which sheets to remove after a page loss | asked, by the existing "Remove" button (no automatic data loss) |
| Folder or files | asked once in the menu (the app cannot know what the user has on disk) |
| Whether the folder is used before files | derived (T04) |
| Which text a row shows | derived from the row state |

## 8. Layout

Place: no new section. The band stays at the top of "Sheets" (T01, T04). The prompt is a row of the same style as the Relink question (`.mep-buildings-actions`). The menu is a popup under the band button (`role="menu"`, same pattern as `BuildingMenu` / `WorkspaceMenu`). Section "Sheets" stays major, the band minor. No new dialog, no new panel (reuse before new).

Grid of the band: `minmax(0, 1fr) auto`. Left: hint. Right: one button. Row grid unchanged (name, status, Open, fix, Move to, Remove). The row line spans the full row, as the existing `.mep-sheet-hint`.

1600 px (right pane about 900 px):
```
+- Sheets ------------------------------------------------------ 9 sheets -+
| 9 PDFs are saved in this browser. Click Reconnect       [Reconnect PDFs…]|
| PDFs… to open them all.                                  +--------------+|
|                                       (menu open)        |Choose a folder…
|                                                          | The app finds...
|                                                          |Choose files…  |
|--------------------------------------------------------------------------|
| plan-L1.pdf  Page 1  summary     Not linked yet  [Choose file…] [Move to…][Remove]|
| The PDF changed after it was added. Click Choose file… and use the new file.   |
| plan-L1.pdf changed. Use the new file for 3 sheets?  [Use new file] [Cancel]  |
+--------------------------------------------------------------------------+
```
The menu is about 320 px wide, right aligned with the button, above the rows (it covers rows while open). It closes on any choice.

1100 px: the same, hint wraps in 2 or 3 lines. The prompt text wraps; buttons stay at the right of the text, or below it when the text is longer than the space.

760 px:
```
+- Sheets ------------------- 9 sheets -+
| 9 PDFs are saved in this browser.     |
| Click Reconnect PDFs… to open them    |
| all.                                  |
| [Reconnect PDFs…]                     |
| +-----------------------------------+ |
| | Choose a folder…                  | |
| |  The app finds the PDFs ...       | |
| | Choose files…                     | |
| +-----------------------------------+ |
|---------------------------------------|
| plan-L1.pdf                           |
| Page 1   Not linked yet               |
| [Choose file…]  [Move to…]  [Remove]  |
| The PDF changed after it was added.   |
| Click Choose file… and use the new    |
| file.                                 |
| plan-L1.pdf changed. Use the new file |
| for 3 sheets?                         |
| [Use new file] [Cancel]               |
+---------------------------------------+
```
At 760 px the menu is as wide as the band (not wider than the dialog), left aligned under the button.

Stability: the band does not change height when the menu opens (the menu overlays, it does not push). The prompt adds one row under the row or the band and removes it on the answer. The dialog top and height do not change (scroll body). After "Use new file" the band can disappear; the rows move up by the band height (same as T01). The row line adds one line to a row; rows keep their order (L4). Stress: 30 rows with names of 80 characters: the file name has an ellipsis and a tooltip with the full name (existing); the prompt wraps and names the file in full, so a long name makes a taller prompt, not a cut.

## 9. Platform table (L8)

APIs: `showOpenFilePicker` (files), `showDirectoryPicker` (folder), `FileSystemFileHandle.getFile()`, `queryPermission` / `requestPermission`, IndexedDB handle store, directory iteration.

| Item | Web test fake (Playwright) | Real platform | What the fake hides |
|---|---|---|---|
| File saved by another program | The check writes new bytes to the OPFS file (new size). | The PDF viewer (Acrobat, Edge, Bluebeam) writes the file: some write in place, some write a temp file and rename it. Chrome keeps the handle for in-place writes. After a rename-swap the old handle may point to nothing (`NotFoundError`) and then the row needs "Choose file…" (picker path, same prompt). | The two save styles; the file lock of a viewer that has the PDF open (Windows may refuse to read a locked file). |
| `getFile()` after the edit | Works, new size. | Works for in-place writes. May throw while the other program writes. | A read during a write: the user sees "Could not open ... Choose the file again." (T04 text). |
| Time stamp | `lastModified` set by the check. | The OS sets it. | n/a |
| Picker with changed file | Fake picker returns the OPFS file. | Windows file dialog. The user must find the edited file. | The dialog; the file name list; Ctrl+A. |
| Folder scan with changed files | OPFS folder with files of other sizes. | A project folder with old copies "plan-L1 (1).pdf" (different name: not a candidate) and subfolders. | Many candidates; time. |
| Menu popup | Playwright clicks the menu items. | Real mouse, keyboard, narrow window, the popup near the edge of the dialog. | Clipping of the popup by the dialog scroll body at 760 px; focus return after the picker closes. |
| Permission question after "Use the folder" | stub (T04) | Chrome question "View files in {Folder}?" | The question window. |
| Firefox, Safari | `canStore` false in a check. | No folder picker. | The look without the menu. |

Numbered steps for the platform test script (`buildings-b6-test.md`):
1. Chrome on Windows: add `plan-L1.pdf` (2 sheets) with "Add PDFs…". Open it in another viewer (Edge or Acrobat), add a text note, save. Close the other viewer.
2. In MepApp click "Open" on a row of the PDF. The prompt `plan-L1.pdf changed. Use the new file for 2 sheets?` shows under the row. Read it word for word.
3. Click "Cancel". The sheet does not open. The row shows `The PDF changed after it was added. Click Choose file… and use the new file.` Check the row button says "Choose file…".
4. Click "Choose file…", pick the file. Click "Use new file". The sheet opens, the notice says `Using the new plan-L1.pdf for 2 sheets.` Both rows say "Open". Restart Chrome, open the building: the rows still say "Open" (after the band) and open with no prompt.
5. Edit and save the PDF again with the other viewer still open (file lock). Click "Open": read the result (prompt, or "Could not open ...").
6. Edit three PDFs. Click "Reconnect PDFs…", click "Choose files…", press Ctrl+A in the picker, confirm. One prompt names the 3 PDFs and the sheet count. Click "Use new files". Read the notice. Check all rows.
7. Repeat step 6 and click "Cancel". The notice names the 3 PDFs. The band says `3 PDFs changed after they were added. Click Reconnect PDFs… and choose the new files.` Rows have the changed line.
8. Put 3 edited PDFs in a folder and 2 old copies with a different name next to them. Click "Reconnect PDFs…", "Choose a folder…". The prompt names only the 3 PDFs.
9. Copy one edited PDF into two subfolders, change one copy (other size). Scan the folder. Read the "two different files" text and check that "Choose file…" on the row works.
10. Remove page 3 of a 3-page PDF in the other viewer. Click "Open" on the page 1 row: the prompt names the lost page. Click "Use new file". Click "Open" on the row of page 3: the row line and the notice say the page is not in the file. Click "Remove" on it.
11. Edit a large PDF (50 MB or more). Check how long the prompt takes to show, and that nothing freezes.
12. Open the PDF from another project with the same file name. Check that the old "different document" question shows, and no second question.
13. Menu with the keyboard: Tab to "Reconnect PDFs…", Enter, Arrow Down twice, Esc. Focus returns to the button. Enter on "Choose files…" opens the picker.
14. Check the menu at the window widths 1600, 1100 and 760 px: the menu is not cut by the dialog.
15. Firefox: no menu, "Reconnect PDFs…" opens the file picker at once. Changed file: the prompt shows. No folder word on screen.
16. Check that the band never shows the text "Allow access to the PDF folder". With a stored folder and a restart, the menu item says `Use the folder {Folder}`, Chrome asks once.
17. Row texts: view a row of each state (open in a tab, can open, needs file, changed, missing on desktop). Read each line.
18. Desktop app: nothing of this task shows; the rows and "Relink…" work as before.

## 10. Not in this task

- Detecting a changed file at startup with no pick (the browser gives no change event).
- Saving the "changed" state in the building file.
- Removing the sheets of lost pages by the app.
- Merging "Add PDFs…" / "Add folder" into the band.
- A "Forget folder" control.
- A change in the desktop rows (Relink…, Grant access…).
- A new chip label for the changed state.

## 11. Open questions (the user answers on the dashboard)

1. **Many changed files at once (Reconnect and folder scan).**
   a) One prompt that names all PDFs, one yes or no. (Recommended: the user started the action for the whole set; one decision costs 1 click; the prompt lists the names so nothing is hidden.)
   b) One prompt for each PDF, one by one. (Safer for a wrong file, but 3 changed files cost 3 prompts.)
   c) No prompt in the bulk path: use the new files at once. (Fastest, but a wrong copy changes the building with no question.)
2. **A row pick with another name and another size** (the user picks a different file for a row).
   a) Open the file with the notice `This file has another name than the sheet. The sheet keeps its saved file name.` and no change in the building. (Recommended: this is today's behaviour minus the dead pointer to Relink.)
   b) Show the same prompt `Use this file for N sheets?` (A different file name is a stronger change; this needs its own text.)
   c) Refuse and keep the picker closed.
3. **The new file has fewer pages.**
   a) Keep the sheets, name the lost pages in the prompt, the notice and the row; the user removes them with "Remove". (Recommended: the same as Relink today; the app never deletes sheets by itself; no data change.)
   b) Add "Remove sheets of lost pages" to the prompt. (More controls; removing a sheet can break a riser link.)
4. **One entry in the band.**
   a) One button `Reconnect PDFs…` with a menu `Choose a folder…` / `Choose files…` in Chrome and Edge; the file picker at once in Firefox and Safari. (Recommended: the user asked for one entry; the two labels name the object (folder or files), not the job; the old word Reconnect stays.)
   b) Two buttons with clear labels: `Choose a folder…` and `Choose files…`. (One click less, but two buttons, which the user found confusing.)
   c) One button with the new label `Find PDFs…`. (A new word for an old job.)
5. **Chip "Not linked yet".**
   a) Keep the chip, change only the line to `This sheet finds its PDF by file name and size. Save the PDF once in MepApp to link it for good.` (Recommended: the chip is a status of the PDF, true and short; the line says what it means.)
   b) Rename the chip to `Not saved in MepApp yet`. (Clearer, but the chip is used in other panels and in tests.)
6. **The row line for rows that need a file.**
   a) Show `The browser needs this PDF file again. Click Choose file…` on every such row. (Recommended: the row says what to do where the user looks; the line is short.)
   b) Show it only for changed and missing rows; the band alone covers the rest. (Quieter with 30 rows, but a row says nothing about why it needs a click.)

None of these questions changes the building file format or the data model. The size update uses the existing Relink code.
