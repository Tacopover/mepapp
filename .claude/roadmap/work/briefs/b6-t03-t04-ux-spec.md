# B6-T03 and B6-T04 UX spec: saved PDFs and one folder permission

Plan: `.claude/plans/buildings-b6-pdf-access.md` section 4, B6-T03 and B6-T04. Decision D-B-66 (Chrome and Edge keep handles), D-B-67 (depth 3), D-B-68 (read only). Screen: the T01 band at the top of the "Sheets" section (`LevelSheetsPane`) and the notice line. One spec for both tasks, because the band shows the state of both. No change to the building file.

Code facts used (read 2026-11-13):
- T01 band: `div.mep-reconnect` with `p.mep-hint` and one button "Reconnect PDFs…". It shows when `fileAccess.readPath === undefined`, `rememberFiles` exists and `pdfsNeedingFile(...)` has 1 or more PDFs.
- Row button: "Open" when `canOpenCached(sheet)` is true, else "Choose file…". Both call `onOpenSheet(sheet, 'pick')`.
- `App.tsx` `onOpenSheet` (about line 976): `cached = await sheetFilesRef.current.take(sheet); opened = cached ?? await fileAccess.openFile(...)`. `take()` already calls `getFile()` again and drops an entry when the size differs.
- `PdfHandleStore` (T02): `listFiles(buildingId)` gives the stored keys `fileName:size`; `getFolder`, `putFolder`, `deleteFile`, `deleteFolder`; `available` is false in Firefox, Safari and without IndexedDB.
- The notice line at the bottom of the dialog (`onNotice`) stays 6 s (12 s for an error).
- `fileAccess.pickFolder()` returns `{ dirHandle }` in Chrome and Edge (used by "Add folder"). The desktop "Grant access…" uses `pickFolder` too and is not touched.

## 1. Concepts

| Word | Does the user have it? |
|---|---|
| PDF, sheet, level, building, folder | Yes. |
| Allow access | Yes. The browser asks "View files in <folder>?" with the button "View files". The user knows this question from other web apps. |
| Saved in this browser | Yes, plain. It tells why "Open" works after a restart. |
| Found / Missing / Reconnect | Yes (T01). |
| "handle", "permission API", "IndexedDB", "cache", "key", "stale", "query" | No. Not on the screen (L5). |

The user does not own "a stored handle". The user owns: "the PDF folder of this building". There is no list of handles on any screen.

## 2. Rules (derived, not asked)

- **Store.** Every PDF given to the app stores its handle without a question: Add PDFs, Add folder, Open, Choose file, Reconnect PDFs, and every file that the folder search finds. Only in Chrome and Edge (`available` true). Derived (L1).
- **Row state.** `canOpenCached(sheet)` is true when the key of the sheet is in the stored list or in the tab memory. So after a restart the rows say "Open" at once, with no check. The band tells the user if one click of permission comes first.
- **Access state of a PDF** (async, checked once when the building opens and after each action): `granted` when the folder or the file has read access now (Chrome "Allow on every visit" gives this after a restart, then no band); `needs allow` when the browser would ask; `none` when no handle exists. Derived.
- **P** = PDFs of the building (all sheets, not only the selected level) that have a stored file but `needs allow`. **N** = PDFs of the shown scope that need a file (T01 rule: no memory entry, no stored key).
- **Folder before single handles.** When a folder handle exists and a PDF is not yet usable, "Open" and the band button use the folder first. One permission for the folder opens all PDFs in it. A single handle is used only when the folder has no file of that name and size.
- **Folder search.** Depth 3 (D-B-67). A match is the same file name and the same size as a sheet of the building (all sheets, so one pass serves every level). Two different files in the folder with one name and size: the PDF is not found and is named (same rule as T01). The search remembers each found file, and stores its single handle too.
- **One click, one question.** A click that needs permission asks it once with the click as the gesture. The app does not ask again for the same folder in this tab.
- **Read only** (D-B-68). The button text never says "edit" or "save".
- **Not in Chrome or Edge** (`available` false, Firefox, Safari): no second button, no text about saved files. The screen is exactly the T01 screen (L13).
- **Desktop** (`readPath` defined): no band, no change. "Grant access…" stays.
- **Denied.** The app keeps the stored handles. The user may allow later. Only a handle that fails because the file is gone or has another size is deleted (see question 2).
- **Folder gone.** When the stored folder cannot be opened (moved, deleted): the app deletes the folder handle, says so, and the band offers the folder picker again.

## 3. Journeys

**J1. Restart, open 3 sheets, folder known (main).** Goal: open 3 sheets after the browser restarted. Start: building with 9 PDFs on 3 levels, a folder was allowed before, Chrome asks again.
1. Open Manage buildings, select the building. The band says "9 PDFs are saved in this browser. Allow access to the folder Plans once to open them." Rows say "Open".
2. Click "Allow access to the PDF folder". Chrome asks "View files in Plans?". (1 click)
3. Click "View files" in Chrome. (1 click) The app looks in the folder. The notice says "Found all 9 PDFs in Plans." The band is gone.
4. Click "Open" on 3 rows, one after the other (L3). The dialog stays open. (3 clicks)
Total 5 clicks for 3 sheets, then 1 click for each other sheet. Without the folder it would be 6 clicks for 3 sheets (a question for each PDF) and 2 for each other sheet.

**J2. Restart, click "Open" on a row first.** Same start. Click "Open" on a row (1). Chrome asks for the folder (2). The sheet opens. The notice says "Found all 9 PDFs in Plans." The band is gone, the other rows open with 1 click each. The user does not need to see the band. The band is only the explicit way.

**J3. Restart, no folder known, only saved PDFs.** Start: the user added PDFs with "Add PDFs…" last week, never used the folder button.
1. Select the building. Band: "9 PDFs are saved in this browser. Allow access to their folder once to open them all." Buttons: "Allow access to the PDF folder…", "Reconnect PDFs…".
2. Click "Allow access to the PDF folder…". The folder picker opens (2 clicks with the confirm; the picker starts in the folder of the last file when the browser can). No second question, because the pick gives access.
3. Result: "Found all 9 PDFs in Plans." From now the folder is stored (J1 for the next restart).
Alternative: the user ignores the band and clicks "Open" on a row. Chrome asks for that one file (2 clicks for each PDF). Nothing breaks.

**J4. First use, empty start (L11).** New building, no PDFs. No band (no sheets). The user adds PDFs with "Add PDFs…". The handles are stored with no message and no control. No band shows (all files are in this tab). The user does not know about the store. After a restart: J3.

**J5. Some files moved.** Start: as J1, but 2 PDFs are not in the folder any more. After step 3 the notice says "Found 7 of 9 PDFs in Plans. Missing: A.pdf, B.pdf." The band stays with the new text "2 PDFs are not in the folder Plans. Choose them, or allow access to another folder." Rows of the 7 say "Open"; rows of the 2 say "Choose file…". The user clicks "Reconnect PDFs…" and picks the 2 files (T01). Notice: "Found all 2 PDFs." Band gone.

**J6. One file moved, single handle.** Start: saved PDFs, no folder. The user clicks "Open" on a row. Chrome asks (allow). The file is not there. The notice says "Could not open plan-L1.pdf. Choose the file again." The picker opens for that sheet. The user picks the file. The sheet opens and the new handle replaces the old one. 3 clicks + 1 pick.

**J7. Permission denied.** The user clicks "Block" in the Chrome question. The notice says "Access was not allowed. Click Allow access to try again, or choose the files." The band stays. A click on "Open" in a row after a denial: Chrome may not ask again; the app falls back to the picker for that sheet (message J6 style, see texts).

**J8. Firefox or Safari.** Same as T01 J1. No new button, no new text. After restart, rows say "Choose file…" and the T01 band shows. 

**J9. Incognito in Chrome.** The store works until the window closes. Then it is empty. The user sees the T01 screen after a restart. No special text.

**J10. Desktop.** No band. "Open" by path.

## 4. Entity by action table

| Entity | Create | Rename | Delete | Move | Open | Undo | Select |
|---|---|---|---|---|---|---|---|
| Building | not changed | not changed | not changed; its saved PDFs and its folder go with it (T02, no control) | none | not changed | none | not changed |
| Sheet | not changed | none | not changed | not changed | "Open": uses the folder, then the saved PDF, then the picker. Failure text, see texts. | none | n/a |
| PDF folder of a building (new) | "Allow access to the PDF folder…" (picks a folder, stores it) | none: the name is the folder name on disk | none: it ends with the building, or when the browser reports it gone (message). No "Forget" control (decision, question 4) | "Allow access to the PDF folder…" again picks a new folder and replaces the old one; offered when the band shows | via "Open" and via "Allow access to the PDF folder" | none: it changes no building data | n/a (one folder per building) |
| Saved PDF (new) | derived: every PDF given to the app | none | derived: deleted when the file is gone or has another size | none | via its sheet rows | none | none |

Cells with "none" have a reason: the saved PDF is not an object of the user (L5). The folder is, but it has one name and one purpose.

## 5. State table (band area of the Sheets section)

State comes from: browser can save (yes/no), P, N, folder (none/stored), access (granted, needs allow, denied now).

| State | Band hint (see texts) | Buttons in the band | Rows |
|---|---|---|---|
| Firefox, Safari, desktop (cannot save) | T01 text, or no band | T01: "Reconnect PDFs…" only; desktop none | "Choose file…" or "Open" by path |
| Empty (no sheets) | no band | none | existing hint |
| Checking access (first moments after the building opens) | no band until the answer arrives (under 100 ms for tens of PDFs) | none | "Open" (from the stored list) |
| Chrome or Edge, nothing saved (N at least 1, P = 0, no folder) | T-A | "Allow access to the PDF folder…", "Reconnect PDFs…" | "Choose file…" |
| Saved PDFs, access needs allow, no folder (P at least 1) | T-B | "Allow access to the PDF folder…", "Reconnect PDFs…" | "Open" (each asks for its own file) |
| Folder saved, access needs allow | T-C | "Allow access to the PDF folder" (no ellipsis: no picker), "Reconnect PDFs…" | "Open" (the first click asks for the folder) |
| Looking in the folder (busy) | T-D | "Looking for PDFs…" (off), "Reconnect PDFs…" (off) | unchanged until done |
| Access granted, all found (P = 0, N = 0) | no band | none (cannot apply, L13) | "Open" |
| Folder granted, some not in the folder (N at least 1) | T-E | "Allow access to the PDF folder…" (picks another folder), "Reconnect PDFs…" | found: "Open"; others: "Choose file…" |
| Access denied (the user pressed Block) | T-B or T-C unchanged + error notice | unchanged | unchanged |
| File moved, deleted or changed (found at "Open") | band unchanged at first; after the failed row the row shows "Choose file…" and N grows | unchanged | that row: "Choose file…" |
| Folder gone | T-A or T-B (folder removed) + notice | picker label back with the ellipsis | as the new state |
| Two different files with one name and size | as the state above + sentence in the notice | unchanged | that row: "Choose file…" |
| Picker error | error notice (existing text) | on | unchanged |
| Opened sheet | row says "Opened" (existing) | n/a | existing |

Notice and band are separate: the band is a state, the notice is the result of one action.

## 6. Derive it or ask for it

| Value | Mode |
|---|---|
| Which PDFs to save | derived: all |
| That the folder is used before single files | derived |
| Search depth (3) | derived (D-B-67) |
| Match rule (name and size) | derived |
| Which sheets to look for in the folder | derived: all sheets of the building |
| Whether access is granted | derived (browser answer) |
| The picker start folder (folder handle as `startIn`, the folder of the last file otherwise) | derived |
| Folder of the PDFs | asked once per building, in the folder picker (the app cannot guess it) |
| Allow or block | asked by the browser, not by the app |
| Forget the folder or the saved PDFs | not offered (no use case) |

## 7. Texts (word for word)

Band. One hint, then the buttons. The hint is the sentences of the state, joined with a space. Button order is fixed: Allow first, Reconnect second (the Reconnect button keeps its place at the right end, as in T01).

| State | Hint | Allow button | Tooltip of the Allow button |
|---|---|---|---|
| T-A (nothing saved, N = 1) | `1 PDF needs a file before it opens. Choose the file, or allow access to the PDF folder once.` | `Allow access to the PDF folder…` | `Choose the folder with the PDFs of this building. The app finds the sheets in it by file name and size. The app only reads the files.` |
| T-A (N more than 1) | `{N} PDFs need a file before they open. Choose the files, or allow access to the PDF folder once.` | same | same |
| T-B (saved PDFs, no folder, P = 1) | `1 PDF is saved in this browser. Allow access to its folder once to open it.` | `Allow access to the PDF folder…` | same as T-A |
| T-B (P more than 1) | `{P} PDFs are saved in this browser. Allow access to their folder once to open them all.` | same | same |
| T-B and N at least 1 (some PDFs have no saved file) | T-B sentence + ` {N} PDFs need a file before they open.` (N = 1: `1 PDF needs a file before it opens.`) | same | same |
| T-C (folder saved, P at least 1) | `{P} PDFs are saved in this browser. Allow access to the folder {Folder} once to open them.` (P = 1: `1 PDF is saved in this browser. Allow access to the folder {Folder} once to open it.`) | `Allow access to the PDF folder` | `The app opens the PDFs of this building from the folder {Folder}. The browser asks you once. The app only reads the files.` |
| T-C and N at least 1 | T-C sentence + ` {N} PDFs need a file before they open.` | same | same |
| T-D (busy) | `Looking for PDFs in {Folder}…` | `Looking for PDFs…` (off) | none |
| T-E (folder granted, N at least 1) | N = 1: `1 PDF is not in the folder {Folder}. Choose the file, or allow access to another folder.` N more than 1: `{N} PDFs are not in the folder {Folder}. Choose the files, or allow access to another folder.` | `Allow access to the PDF folder…` | `Choose another folder. The app uses it instead of {Folder}.` |

- Reconnect button (T01, text unchanged): label `Reconnect PDFs…`, aria-label `Reconnect PDFs`, tooltip from T01.
- Allow button aria-label: `Allow access to the PDF folder`.
- `{Folder}` is the folder name of the stored folder, in plain text (the user knows it). Long names: ellipsis in the hint is not used; the hint wraps. The tooltip repeats the name.
- Row buttons and tooltips: no change. After a restart the tooltip of "Open" stays "Open this sheet".

Notices after an action (`onNotice`, order of sentences: Found, Missing, Two files, Not looked, as T01):

| Case | Text | Style |
|---|---|---|
| Folder search, all found | `Found all {N} PDFs in {Folder}.` (N = 1: `Found the PDF in {Folder}.`) | normal |
| Folder search, partial | `Found 7 of 9 PDFs in {Folder}. Missing: A.pdf, B.pdf.` (more than 3: `Missing: A.pdf, B.pdf, C.pdf and 2 more.`) | normal |
| Folder search, zero | `Found 0 of 9 PDFs in {Folder}. The app looked in the folder and in the folders inside it, 3 levels deep. Missing: A.pdf, B.pdf, C.pdf and 6 more.` | error |
| Two files, one name and size | `For C.pdf the folder has two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.` | normal |
| Too many items | `The app stopped looking after 5000 items in {Folder}. Choose a folder that holds fewer files.` | error |
| Access denied (folder or band) | `Access was not allowed. Click Allow access to try again, or choose the files.` | error |
| Access denied at a row (single PDF) | `Could not open plan-L1.pdf. Access was not allowed. Choose the file again.` | error |
| Folder gone | `The folder {Folder} is not there any more. Allow access to the PDF folder again.` | error |
| Saved file moved or gone, row click | `Could not open plan-L1.pdf. Choose the file again.` (the picker opens at once) | normal |
| Saved file has another size, row click | `plan-L1.pdf is not the same file any more. Choose the file again.` (the picker opens at once) | normal |
| Picker blocked after the failure (browser refuses a second picker) | `Could not open plan-L1.pdf. Choose the file again.` + the row shows "Choose file…"; the user clicks it | error |
| Picker error (folder or files) | `Could not open the file picker: {message}` (existing) | error |
| Cancel in a picker | no change, no message | none |

The "Allow access to the PDF folder" message in the notice names the button as the user reads it on the screen ("Click Allow access"). The button is on the screen in the same state, so the user finds it.

## 8. Layout

Place: the T01 band, the same line, one band (not a second band). Reason: one place for "my PDFs do not open", the same style (`.mep-hint` 12 px, `--muted`, plain secondary buttons), no new pattern (`ui-guide.md` 1 and 4). The section stays major, with no primary button. The band shows only in the states of section 5; it is hidden when nothing is to do.

Grid: `minmax(0, 1fr) auto`. Left: the hint. Right: a group of the buttons (gap 8 px), order Allow, Reconnect. Reconnect keeps the right edge of T01.

1600 px (dialog right pane about 900 px):
```
+- Sheets ------------------------------------------------------ 9 sheets -+
| 9 PDFs are saved in this browser. Allow access  [Allow access to the PDF |
| to the folder Plans once to open them.          folder] [Reconnect PDFs…]|
|--------------------------------------------------------------------------|
| plan-L1.pdf   Page 1   summary      Status  [Open]  [Move to…] [Remove]  |
| ...                                                                      |
+--------------------------------------------------------------------------+
```
Hint about 440 px (wraps in 2 lines), buttons about 330 px.

760 px:
```
+- Sheets ------------------- 9 sheets -+
| 9 PDFs are saved in this browser.     |
| Allow access to the folder Plans      |
| once to open them.                    |
| [Allow access to the PDF folder]      |
| [Reconnect PDFs…]                     |
|---------------------------------------|
| plan-L1.pdf                           |
```
At 760 px: one column; hint first, then the buttons under it, left aligned, same order, wrapping in one flex row (they stay in one line when they fit, otherwise one under the other).

Stability: the band does not show until the access check ends (see state table), so it does not jump in under the pointer. After a click that ends in "all found", the band is removed: the rows move up by the band height. The user has finished the action then (same as T01). A click on a row "Open" while the band shows and a prompt is open: nothing moves (the band only changes when the action ends). The dialog top and height do not change (scroll body, `ui-guide.md` 6).

Section order of the dialog is unchanged: Level section, Sheets (major, with the band), Summaries, Open documents with "Add files" (minor). "Add PDFs…" and "Add folder" stay in "Add files", unchanged.

Reuse check: `.mep-reconnect` (T01) is extended, not copied. The folder picker is `fileAccess.pickFolder()` (already used for "Add folder" and "Grant access…"); no new dialog. No new dialog and no new panel are needed.

## 9. Platform table (L8)

APIs: handles in IndexedDB (`PdfHandleStore`), `queryPermission` and `requestPermission`, `getFile()`, `showDirectoryPicker`, directory iteration (`values()`).

| Item | Web test fake (Playwright) | Real platform | What the fake hides |
|---|---|---|---|
| Permission question | OPFS handles are always `granted`; a check can force `prompt` with a stub that returns the answer a check chooses. | Chrome asks "View files in <folder>?" with "View files" and "Cancel"; for a file handle it asks "Allow <site> to view <file>?" (Chrome 122 and later: also "Allow on every visit"). The question needs a click on the page. | The real browser window with the question; "Allow on every visit" after a restart gives `granted` and no band; the question is per file for single handles. |
| Gesture | none | `requestPermission` and the pickers need a click as the gesture. After an `await` the gesture lasts only a few seconds. A picker after a failed `getFile()` may be refused. | A slow disk or a long search may lose the gesture. The spec has the "picker blocked" text. |
| Block and dismiss | Stub returns `denied`. | After Block, or after the question is closed a few times, Chrome answers `denied` with no question. The user must change the site setting. | The user cannot allow again with a click. The text gives only "choose the files". (Question 2.) |
| Restart | The Playwright profile can be kept with `launchPersistentContext`; OPFS handles survive. | A new browser session; handles survive, permission does not (unless "Allow on every visit"). | The permission loss itself: the fake keeps access, a real restart ends it. |
| File moved or renamed | The check deletes an OPFS file. | `getFile()` throws `NotFoundError`. A file moved with a drag in the file manager is a new path: the old handle is dead. | Error text and name; the OS may give a different error. |
| File changed (size) | The check writes to the OPFS file. | `getFile()` works, size differs (the user saved the PDF in another program). | n/a (fake works). |
| Folder moved or renamed | The check removes the OPFS directory. | A moved folder: the handle fails with `NotFoundError`. A renamed folder: Chrome keeps the handle, with the new name; the old name text must not stay. | The name in the band after a rename. |
| Folder search size | 5 files in OPFS. | A project folder may have 5000 items and many subfolders; a network drive is slow; a cloud folder may fetch files on demand. | Time. The band shows "Looking for PDFs…" with the button off. The app caps at 5000 items. |
| Name and size match in the folder | Fake folder with files. | Two files with the same name and size in two subfolders: only the "two files" text covers it; the ambiguity needs a `lastModified` compare. | Windows cannot hold two files with one name in one folder; the test needs two subfolders. |
| System folders | none | `showDirectoryPicker` refuses Desktop, Documents root, Downloads root and system folders in Chrome. The error text of Chrome shows in the notice (existing text for the picker error). | The refusal. The user must choose a subfolder. |
| Availability | `PdfHandleStore.available` can be set false. | Firefox, Safari: no `showDirectoryPicker`, no handle store. Incognito: Chrome works but forgets at close. | n/a |
| Desktop | n/a | `readPath` defined: no band. | Check that the band is hidden. |
| Risers tab | uses the same cache | its rows use `take()` too | The Risers tab must also use the new open path (folder, saved PDF). The task lead must check this; no new screen. |

Numbered steps for the platform test script (`buildings-b6-test.md`):
1. Chrome on Windows: add 3 PDFs with "Add PDFs…" to a building. Close Chrome with all windows. Open Chrome, open the building. The band says "3 PDFs are saved in this browser. Allow access to their folder once to open them all." with two buttons. Rows say "Open".
2. Click "Open" on a row. Chrome asks to view the file. Click "View files". The sheet opens. Open the second row: Chrome asks again (per file).
3. Click "Allow access to the PDF folder…". Pick the folder of the PDFs. No second question. Read the notice word for word. The band is gone.
4. Restart Chrome again. The band says "... Allow access to the folder {Folder} once ..." and the button has no ellipsis. Click it. Chrome asks one time. Click "View files". The notice says "Found all 3 PDFs in {Folder}." Open 3 sheets with 1 click each. The dialog stays open.
5. Restart Chrome. In Chrome, give the site "Allow on every visit" in the question. Restart again. No band shows and "Open" works with no question. Then turn the setting off (site settings).
6. Restart Chrome, click "Block" in the question. Read the notice. The band stays. Click "Open" on a row: the notice or the picker follows.
7. Move one PDF into a subfolder (2 levels deep) of the folder. Restart, allow access. It is found (depth 3). Move it 4 levels deep: it is missing and the notice names it.
8. Rename one PDF in the file manager. Click "Open" on its row after allowing access: the notice "Could not open ... Choose the file again." shows and the picker opens at once. Pick the file: the sheet opens.
9. Save one PDF in another program so that its size changes. Click "Open": the notice "... is not the same file any more ..." shows.
10. Rename the folder in the file manager. Open the building: the band shows the new name (or the "folder is not there any more" text when Chrome fails). Check that the old name never shows.
11. Delete the folder. Click "Allow access ...": the notice "The folder ... is not there any more." shows, and the button label has the ellipsis again.
12. Copy two PDFs with the same name and size, but different time stamps, into two subfolders. Check the "two different files" text and that "Choose file…" works for that row.
13. Pick a folder with 5000 or more items (for example a big project folder): the band shows "Looking for PDFs…", the dialog stays quick, and the stop text shows when the cap is reached.
14. Try to pick the Documents folder itself or the Downloads folder: read the Chrome refusal text in the notice.
15. Open the building in Firefox (no folder button, T01 only). Open the building in a Chrome Incognito window: add PDFs, close the window, open a new Incognito window: T01 screen.
16. Edge: steps 1 to 4.
17. Desktop app: no band; "Grant access…" works as before.
18. With a level selected, allow access to the folder: the notice counts the PDFs of that level only. Select the building: no band.

## 10. Not in this task

- An "Open all" button (D-B-67).
- A "Forget saved PDFs" or "Forget folder" control.
- An "Add files" button for the folder before the first restart.
- Storing the folder from "Add folder" as the PDF folder of the building.
- Writing to a PDF (D-B-68).
- A new first-use explanation or help page.
- Any change in the building file.

## 11. Open questions

1. **Where is the folder button?**
   a) In the T01 band, left of "Reconnect PDFs…", shown only in Chrome and Edge, only while the band shows. (Recommended: one place for "my PDFs do not open"; the band is hidden when nothing is to do, so there is no dead control (L13, L14); Firefox and Safari see the T01 screen.)
   b) Also in the quiet "Add files" section, always. (More reach, but it adds a control that is not needed after the first pick, and it looks like an add button.)
   c) Only in the notice after a reconnect. (Hard to find.)
2. **A denied question: keep or delete the saved PDF?** The plan says delete on denial.
   a) Keep the saved PDFs on a denial; delete only when the file is gone or has another size. (Recommended: the user may press "Block" by mistake. A kept file costs nothing.)
   b) Delete on every failure (as the plan text). The user must choose all the files again.
3. **A row "Open" with no folder and a saved PDF: ask for each PDF or point to the folder?**
   a) Ask for the file (Chrome question), and leave the band to point to the folder. (Recommended: the click always works; the band says what to do for all PDFs.)
   b) Open the folder picker on the first "Open". (A click on "Open" would not open a sheet. A surprise.)
4. **Forget the folder.** a) No control; the folder goes with the building, or is replaced with the same button. (Recommended; no use case.) b) A small "Stop using this folder" in the band tooltip or the building section. (More controls; no shown need.)
5. **Folder before the first restart.** The user adds PDFs and works. The band shows first after the next restart. a) Accept (recommended: the cost is 2 clicks once; no new control). b) Add the folder button to "Add files".
6. **Cap and depth text.** Depth 3 (D-B-67) and a cap of 5000 items are provisional. a) Keep both and show the text in the notice (recommended). b) No cap (a very large folder may freeze the tab).

None of these questions changes the building file or the data model. The saved handles and the folder handle are only in the browser store (T02).
