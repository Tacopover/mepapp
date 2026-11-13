# B6-T01 UX spec: Reconnect PDFs

Task: `.claude/plans/buildings-b6-pdf-access.md` section 4, B6-T01. Screen: the "Sheets" section (`LevelSheetsPane`) in the Building dialog. Scope: one new band with one button and one result message. No other screen changes.

Code facts used (read 2026-11-13):
- `LevelSheetsPane` shows "Choose file…" when the sheet has no path-read and `canOpenCached(sheet)` is false. It shows "Open" when `canOpenCached` is true.
- `SheetFileCache` key is `fileName:size`. A key with two files of different `lastModified` is ambiguous and is never used (`has` is false).
- `sheetFiles.has` reads a ref, so it answers with the new state at once after `remember`. `sheetFiles.remember` also raises `sheetFilesVersion`, so the dialog renders again and the rows change to "Open".
- `fileAccess.openFiles` returns `[]` on cancel. In Firefox and Safari it uses `<input type=file multiple>` and the files have no `target`.
- `BuildingSheet.location.sizeBytes` is optional. A sheet with no size can never match.
- The notice line at the bottom of the dialog (`onNotice`, `sheets-notice`) stays 6 s (12 s for an error).

## 1. Concepts

| Word | Does the user have it? |
|---|---|
| PDF, sheet, level, building | Yes. Same words as the rest of the dialog. |
| Reconnect | Yes, new but plain. It means "tell the app where the PDF files are again". The user knows the problem: after a restart the rows say "Choose file…". |
| Found / Missing | Yes. |
| "cache", "handle", "key", "ambiguous", "remember" | No. Not on the screen (L5). |

Count unit: a PDF is one file (name and size). A PDF can have many sheets (pages). All counts in text are PDFs, not sheets, because the user picks files.

## 2. Rules (derived, not asked)

- **Scope.** Level node: the sheets of that level. Building node: all sheets of the building, including "No level". Derived from `levelId` (L2).
- **A sheet needs a file** when all are true: the platform has no `readPath`; the sheet has `sizeBytes`; `canOpenCached(sheet)` is false.
- **PDFs needed (N)** = distinct `fileName + size` among the sheets in scope that need a file.
- **The band shows** when N is at least 1. It is hidden when N is 0, on the desktop app (`readPath` defined), and when the pane has no `rememberFiles` function (L13, L14).
- **Matching** = same as `SheetFileCache`: same file name and same size. The user is not asked to set it.
- **Remember** every picked file, also a file that matches a sheet on another level only. Reason: the building has one cache. Do not ask.
- **Found (F)** = PDFs of N that now have a file (`canOpenCached` true after `remember`).
- **Missing** = N minus F, in the order of the rows, names unique.
- **Other level** (level node only) = picked files that match no sheet in scope but match a sheet of this building on another level.
- **Not used** = picked files that match no sheet of the building.
- **Two files with one name and size** (different `lastModified`): the PDF is not found. It is named in a separate sentence. Needs a small addition: the cache must tell the pane that a key is ambiguous (or the pane compares the picked files). The implementer picks one.
- Cancel: no change, no message.
- The button is never disabled while the picker is open. Reason: in Firefox and Safari a cancel may give no event, and a disabled button would stay disabled (platform table, item 3).

## 3. Journeys

**J1. Restart and reconnect (main).** Goal: open the sheets of a building after the browser restarted. Start: building with 9 PDFs on 3 levels, all rows say "Choose file…".
1. Open Manage buildings, select the building. The Sheets section shows the band "9 PDFs need a file before they open." and the button "Reconnect PDFs…".
2. Click "Reconnect PDFs…". The system picker opens.
3. Select all 9 PDFs in the folder (Ctrl+A) and confirm.
4. Result: all rows show "Open". The band is gone. The notice says "Found all 9 PDFs."
5. Click "Open" on a row. 3 steps to "reconnect" (click, select, confirm), then 1 step for each sheet.
Repeat 3 times (L3): click "Open" on 3 rows one after the other. The dialog stays open and the band stays gone.

**J2. Partial result, then a second pick.** Start: as J1, but the folder holds only 7 of the 9 PDFs, and 3 other files.
1. Click "Reconnect PDFs…", select 10 files (7 match, 3 do not).
2. Result: 7 PDFs show "Open". The band stays: "2 PDFs need a file before they open." The notice: "Found 7 of 9 PDFs. Missing: A.pdf, B.pdf. 3 files were not used."
3. The user copies the 2 missing files into the folder. Click "Reconnect PDFs…" again, select them. Notice: "Found all 2 PDFs." The band is gone. Steps: 2 clicks + 2 pickers.
The second pick does not forget the first 7.

**J3. Level node.** Start: level "Level 2" selected, 2 PDFs on it, the other levels have 7 more PDFs. Click "Reconnect PDFs…", select all 9. Result: "Found all 2 PDFs. 7 files are for other levels." Then select the building node: the 7 PDFs already show "Open", the band is gone (the pick was shared).

**J4. Firefox or Safari.** Same as J1. The picker is the native file dialog with `multiple`. The result is the same. After "Open" works for a sheet, a later "Save" may ask for a location (no file handle). This is outside T01.

**J5. Start from empty.** Building with no sheets: no band. The existing text "No sheets on this level. Use Add PDFs… below." stays. After the user adds PDFs with "Add PDFs…", the cache has those files, so the band does not show (no sheet needs a file). The user never needs Reconnect for new work.

**J6. Cancel.** Click "Reconnect PDFs…", press Cancel in the picker. Nothing changes. No message. The user can click again.

**J7. Desktop app.** `readPath` is defined. No band, no button. Rows use "Open" by path.

## 4. Entity by action table

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Building | not changed | not changed | not changed | none | not changed | none | not changed |
| Level | not changed | not changed | not changed | none | none | none | "Reconnect PDFs…" uses the selected node as scope (derived) |
| Sheet | not changed ("Add PDFs…") | none (name comes from the PDF) | not changed ("Remove") | not changed | "Open" after reconnect; no change to the "Open" code | none: reconnect changes no building data, only the files in this tab. Nothing to undo. | n/a |
| PDF connection (new) | "Reconnect PDFs…" | none | none: ends with the tab or the building change (existing behaviour); no "Forget" control (L10 decision: no use case) | none | via the sheet row | none (see above) | none |

Cells marked "none" have a reason: the connection is a temporary link in this tab, not an object of the user.

## 5. State table (Sheets section, band area)

| State | The user sees | Controls |
|---|---|---|
| Empty (no sheets) | No band. Existing hint. | none new |
| Loading (building opens, status checks run) | Band shows as soon as rows show. The band does not depend on the status check. | button on |
| Needs files (N at least 1) | Band: hint and button. Rows: "Choose file…" | button on |
| Picker open | Same as above. | button stays on (see rule) |
| Partial | Band with the new N. Rows: some "Open", some "Choose file…". Notice with Found, Missing. | button on |
| Done / all found | Band is gone. All rows "Open". Notice "Found all N PDFs." | none (the control cannot apply, L13) |
| Already done (no file needs a connection) | No band. | none |
| Zero found | Band unchanged. Notice (error style) with what to do. | button on |
| Error (picker throws) | Notice (error style): "Could not open the file picker: <message>". | button on |
| Desktop | No band. | none |
| Opened sheet | Row says "Opened" (existing). It does not count in N, because its file is in the cache. | existing |

## 6. Derive it or ask for it

| Value | Mode |
|---|---|
| Scope (level or building) | derived from the selected node |
| Which sheets need a file | derived |
| Match rule (name and size) | derived |
| Counts N, Found, Missing, Not used | derived |
| Which files to use | asked: the user picks them in the system picker (the app cannot read a folder in all browsers) |
| Folder of the PDFs | not asked in T01 (B6-T04 may ask in Chrome and Edge) |

## 7. Texts (word for word)

Band (one line, grey hint on the left, button on the right):
- Hint, N = 1: `1 PDF needs a file before it opens. Choose it again.`
- Hint, N > 1: `{N} PDFs need a file before they open. Choose them all in one step.`
- Button label: `Reconnect PDFs…`
- Button tooltip: `Choose the PDF files of this {level|building}. The app finds the sheets by file name and size. No sheet is added or changed.` (level node: "this level"; building node: "this building")
- Button aria-label: `Reconnect PDFs`
- Picker: the system picker; file type filter "PDF" (same filter as "Add PDFs…").

Result notices (shown with `onNotice`). Sentences join in this order: Found, Missing, Two files, Other levels, Not used. Parts that are zero are left out.

| Case | Text | Style |
|---|---|---|
| All found, N = 1 | `Found the PDF.` | normal |
| All found, N > 1 | `Found all {N} PDFs.` | normal |
| All found + extras | `Found all 9 PDFs. 2 files are for other levels. 3 files were not used.` | normal |
| Partial | `Found 7 of 9 PDFs. Missing: A.pdf, B.pdf.` | normal |
| Partial, long list (more than 3 missing) | `Found 4 of 9 PDFs. Missing: A.pdf, B.pdf, C.pdf and 2 more.` | normal |
| Two files with one name and size | `For C.pdf you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.` (for more than one: `For C.pdf, D.pdf you chose …`) | normal |
| Other levels (level node) | `2 files are for other levels.` / `1 file is for another level.` | normal |
| Not used | `3 files were not used.` / `1 file was not used.` (text of the suffix on partial or all-found) | normal |
| Zero found | `Found 0 of 9 PDFs. None of the 4 files you chose has the same name and size as a PDF of the sheets here. Missing: A.pdf, B.pdf, C.pdf and 6 more.` | error |
| Zero found, zero picked files cannot happen (cancel = no message) | n/a | n/a |
| Picker error | `Could not open the file picker: {message}` (existing text of `grantAccess`) | error |

The "Missing" list names at most 3 PDFs, then `and {k} more`. The full list is always on the rows (they still say "Choose file…"), so no information is lost. The notice is never cut (it wraps in the status line).

Existing texts that stay: "Choose file…", "Open", "Opened", the tooltip "This browser cannot open the PDF by itself. Choose the file again."

## 8. Layout

Place: inside the "Sheets" section (major section), at the top of the body, above the rows. One line, not a new section. Reason (`ui-guide.md`): the title bar already has the count in the aside; a section helper band stays quiet, the same style as `.mep-hint` (12 px, `--muted`). The button is the plain secondary button (12 px). The section has no primary button. The band is not a minor section card, so no new pattern.

The title bar does not change (`Sheets` left, `9 sheets` right). The band is not in the title bar, so a 760 px width does not crowd the title.

Relation to "Add PDFs…" / "Add folder": they live in the quiet "Add files" section (`BuildingSheetsPane`) below. They add new sheets. "Reconnect PDFs…" adds none. The band hint says what it is for ("need a file before they open"), so the two buttons do not look like the same job. Do not merge them and do not change them.

Wireframe at 1600 px (dialog right pane, about 900 px wide):
```
+- Sheets ------------------------------------------------------ 9 sheets -+
| 9 PDFs need a file before they open. Choose them all in one step.        |
|                                                    [ Reconnect PDFs… ]   |
|--------------------------------------------------------------------------|
| plan-L1.pdf   Page 1   summary      Status  [Choose file…] [Move to…][Remove]|
| plan-L1.pdf   Page 2   ...                                               |
| ...                                                                      |
+--------------------------------------------------------------------------+
```
Grid of the band: one row, two columns: `minmax(0, 1fr) auto`. Hint left (ellipsis not used: the text is short; it wraps). Button right, aligned with the right edge of the row actions (the right edge of the "Remove" column). The band has 0 top margin, 8 px below, and a 1 px `--line` bottom line only when rows follow.

Wireframe at 760 px:
```
+- Sheets ------------------- 9 sheets -+
| 9 PDFs need a file before they open.  |
| Choose them all in one step.          |
| [ Reconnect PDFs… ]                   |
|---------------------------------------|
| plan-L1.pdf                           |
|  Page 1  ...                          |
```
At 760 px the grid is one column. The hint is first, the button is under it, left aligned. The band does not push the rows into a new column layout.

Stability: the band appears and disappears. The dialog top and height do not jump, because the dialog body scrolls under a fixed title (`ui-guide.md` 6). The rows shift down by the band height (about 44 px) only while the band shows. The band shows from the first render of the rows, so it does not appear later and move the row under the pointer, except at the end of a successful reconnect, when the user has finished the action (L4 is about order, which does not change).

Section order in the dialog is unchanged: Level section, Sheets (major), Summaries, Open documents with "Add files" (minor).

## 9. Platform table (L8)

API: `fileAccess.openFiles` (file picker, many files).

| Item | Web test fake (Playwright) | Real platform | What the fake hides |
|---|---|---|---|
| Multi-select picker | Stubbed picker returns a list of OPFS handles or File objects the check chooses. | Chrome and Edge: `showOpenFilePicker({multiple:true})`. Firefox and Safari: `<input type=file multiple>`. | The picker starts in the last folder, shows only PDFs, and the user must multi-select (Ctrl+A). The fake gives all files at once. |
| `target` | Fake handle with `getFile()`. | Chrome and Edge: handle with `getFile()`. Firefox and Safari: no `target`. | Rows must open in both. `take()` uses `entry.file` without a target. |
| Cancel | Fake returns `[]`. | Chrome: `AbortError` gives `[]`. Fallback: needs the `cancel` event; an older Firefox or Safari may give no event, so the promise may never end. | A never-ending pick. The button must stay on. |
| Many files | Fake gives 5 files. | A real folder may have 30 to 100 PDFs; each `getFile()` is a call. | Time and memory for a large pick. |
| Same name and size | Fake can create it, but the Windows file system cannot hold two files with one name in one folder. | The user must select files from two folders (the picker does not allow it in one pick). | A real ambiguous case happens only over two picks (two clicks). |
| Permission | none | Handles from the picker have read permission for the tab. | After a restart the handles are gone (no storage in T01). |

Numbered steps for the platform test script (`buildings-b6-test.md`):
1. Chrome on Windows: restart the browser, open the building, count the "Choose file…" buttons. The band shows with the right N. Click "Reconnect PDFs…", select all PDFs of the folder with Ctrl+A. Read the notice text word for word and check that all rows say "Open".
2. Chrome: choose only some of the PDFs plus 3 files that are not in the building. The notice shows Found, Missing and "3 files were not used." The band shows the new N.
3. Chrome: open the picker and press Cancel (Esc). No message. The button still works.
4. Firefox: same as step 1. Also press Cancel and check that the button still works at once. Repeat in Safari when possible.
5. Chrome: reconnect, then click "Open" on 3 rows one after the other. The dialog stays open.
6. Chrome: with a level selected, pick all PDFs of the building. Check the text "N files are for other levels." Select the building node: no band.
7. Chrome: copy one PDF to a second folder and change it (different time stamp, same size, for example `touch`). Pick both files in two picks. Check the "For X you chose two different files" text and that "Choose file…" still works on that row.
8. Chrome: pick 50 PDFs or more. The dialog stays quick.
9. Desktop app: the band does not show.

## 10. Not in this task

- Remember handles after a restart (B6-T02 to T04).
- Pick a folder instead of files (B6-T04).
- An "Open all" button.
- A "Forget connections" control.
- A band on the Risers tab (it uses the same cache, so its rows change by themselves).

## 11. Open questions

1. **Where does the button go?**
   a) In the band at the top of the Sheets body, with a hint line. (Recommended: the user sees why the button is there. It does not crowd the title bar at 760 px.)
   b) In the title bar next to "9 sheets". (Shorter, but no reason shown, and tight at 760 px.)
   c) In the quiet "Add files" section next to "Add PDFs…". (Recommended against: the user can mistake it for an add button.)
2. **Sheets with no stored size** (old building files): they show "Choose file…" and can never match. T01 ignores them (not in N, not in the band). Is that right? Options: a) ignore (recommended, they are rare and the single "Choose file…" still works); b) count them as needing a file and list them under Missing, which is a text the user cannot act on.
3. **Files for other levels (level node).** Recommend: remember them and say "N files are for other levels." Option: ignore them and count them in "not used". Recommend the first, because the user did the work of picking them.

None of these questions changes the data model.
