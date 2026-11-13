# B6: open the PDFs of a building without the file picker

Status: **planned 2026-11-13, not started.** Stream `buildings`, part id `B6` (B5 stays the shared coordinate system, deferred). Branch for the work: a new worktree branch `worktree-buildings-b6` from master.

## 1. Why

On the web, after a browser restart each sheet says "Choose file…". The user must find the same PDF in the file picker again. With tens of PDFs this is slow. The desktop app does not have the problem, because it reads files by path.

## 2. Decision

- **D-B-66 (user, 2026-11-13): reverse D-B-53 for Chrome and Edge.** The app may keep file handles of the PDFs (not file bytes) in the browser. Firefox and Safari cannot keep handles. They get the multi-select reconnect (T01) only.
- A browser never lets a page pre-select a file in its picker. So the plan avoids the picker: stored handles, one folder permission, and one multi-select pick for many PDFs.
- No change to the building file. The new data is browser-local (IndexedDB). No PDF bytes are stored (no stale copies).

## 3. Facts from the code (2026-11-13)

- `packages/ui/src/sheetFileCache.ts`: `SheetFileCache` is in memory only. Key `fileName:size`. `take()` calls `getFile()` again on a handle target and drops the entry when the size differs. This is the matching rule to keep.
- `packages/platform-web/src/web-file-access.ts`: `openFile` and `openFiles` already return `target: FileSystemFileHandle` in Chromium. Without the File System Access API they use `<input type=file>` and return no target. `pickFolder` returns `{ dirHandle }`. `requestFolderAccess` exists.
- `packages/platform-web/src/web-building-store.ts`: IndexedDB `mepapp-buildings` has the stores `handles` (building file handles), `files`, `summaries`. It asks for permission with `queryPermission` and `requestPermission` once per session.
- `LevelSheetsPane` already switches the row button between "Open" (`canOpenCached`) and "Choose file…". `canOpenCached` is synchronous.

## 4. Tasks

Order matters: T01 gives every browser a quick win without storage. T02 to T04 add storage for Chrome and Edge.

### B6-T01: Reconnect many PDFs with one pick (all browsers)

- A button "Reconnect PDFs…" in the Sheets pane (level and building node). It shows only when at least one sheet needs a file.
- It uses `openFiles` (many files at once). The user selects all PDFs of the folder. The app calls `SheetFileCache.remember` for each file. Every sheet with the same name and size now shows "Open".
- Result text: "Found 7 of 9 PDFs. Missing: A.pdf, B.pdf." Files that match no sheet are ignored and counted.
- No storage change. Works in Firefox and Safari through the `<input multiple>` fallback.
- ux-designer pass first. Show the text and the button place on the dashboard before implementing.

### B6-T02: Store PDF handles (Chrome and Edge)

- New interface `PdfHandleStore` in `@mepapp/platform`: put, get, delete and list handles by key. The key is `buildingId` plus `fileName:size` (one handle per PDF, not per page).
- Implementation in `platform-web` in a new IndexedDB store `pdfHandles`. Raise `DB_VERSION` from 1 to 2. The upgrade code creates only the missing store and keeps `handles`, `files` and `summaries`. Add a test that opens a version 1 database and upgrades it.
- Without IndexedDB or without handle support (Firefox, Safari, Incognito): the store reports "unavailable" and the app behaves as today.
- Remove the handles of a building when the building is deleted. Remove one handle when no sheet uses the file any more.
- Unit tests with a fake IndexedDB (the existing store tests show the pattern).

### B6-T03: Use the stored handles

- Every place that gives a PDF to the app (Add PDFs, Add folder, Open, Choose file, T01) stores the handle when the target is a `FileSystemFileHandle`.
- When a building opens, the app loads the list of stored keys. `canOpenCached` stays synchronous and answers from that list.
- Click on "Open" for a stored handle: first await is `requestPermission({ mode: 'read' })` when `queryPermission` says "prompt" (the click is the user gesture). Then `getFile()`. Check the size against the sheet. A denied permission, a moved or renamed file, or a changed size: show a short message and fall back to the picker for that sheet. Delete the stale handle.
- Chrome can remember the permission ("Allow on every visit"). Then no prompt shows.
- Messages (draft): "Could not open <file>. Choose the file again." No new dialog.

### B6-T04: One permission for a whole folder (Chrome and Edge)

- Per file, Chrome can ask for permission again for each handle. For tens of PDFs one folder permission is better.
- A button "Allow access to the PDF folder…" (also offered in the T01 flow for Chrome and Edge). The user picks the folder once with `showDirectoryPicker`. The app stores the folder handle per building.
- After a restart, one click on "Open" or on "Allow access to the PDF folder…" asks the permission for that folder once. Then the app finds every sheet file in that folder by `fileName` and `size`. Subfolders: search to a depth of 3 (provisional, D-B-67).
- The folder is used before the single-file handles. The single-file handles stay as a fallback.
- The old "Grant access" for the desktop app is not touched.

### B6-T05: Windows test script and records

- Add a section to `.claude/plans/buildings-b6-test.md`: restart Chrome with 5 PDFs on 2 levels, check "Open" without a picker, check the folder permission, check a moved file, check Firefox with T01, check Incognito.
- Update `buildings-b4-test.md` step 34 text (the "Choose file…" after restart is no longer expected in Chrome and Edge).
- Ledger events, dashboard screenshots, push the branch only.

## 5. Provisional decisions (easy to reverse)

- **D-B-67:** the folder search depth is 3. The "Open all" button on the Sheets pane is not in B6. After T03 and T04 a user opens a sheet with one click.
- **D-B-68:** the permission mode is read only. The app never writes to a PDF.

## 6. Rules for every task

- Agent framework rules: ux-designer before every screen task; journey-tester before calling a screen task done; no `window.confirm`; English-only UI in ASD-STE100 prose.
- Plain `pnpm dev` and production behaviour must not change except through this feature. Add a no-flag check. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- Old checks must stay green. The 29-check runner is needed when a task edits the Building dialog or the building controller (T01 to T04 do). Read every line.
- Nothing outside `pdf-engine-mupdf` imports `mupdf`.
- Push the branch only. The user tests on Windows and merges.

## 7. What a browser check cannot prove

- Playwright uses OPFS handles and a stubbed picker. A real permission prompt, "Allow on every visit", a real file on disk that moves, and a restart of the browser with a real profile cannot run in the container. The Windows test covers them. State this in every task report.
- Edge and Firefox need a manual run by the user.

## 8. Risks

- A stored handle can fail after the user moves or renames a PDF. The fallback is the picker (T03).
- Chrome can drop handles when the user clears site data. The fallback is the same.
- Two PDFs with the same name and size in different folders: the cache already treats such a key as ambiguous. Keep this rule.
