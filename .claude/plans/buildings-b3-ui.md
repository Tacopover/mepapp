# B3-T11 plan: Manage Buildings dialog overhaul

Status: planned 2026-11-02. Audited 2026-11-02 (verdict: OK with fixes; 19 findings, all folded in below). Not started. Waits for the user to review.
Origin: `buildings-b3-ui-prompt.md` (the user feedback), `buildings-b3-ui-review.md` (the findings R-1 to R-22), `buildings-b3.md`, `buildings-levels-sheets-spec.md`.
Read `.claude/roadmap/rules.md` first. Paths start at the repository root.
Terms: as in the review. **Open document**: a PDF open in a viewer tab. **Placed page**: a sheet (page on a level). **Not placed**: a page of an added PDF that has no level. It lives in dialog state only (D-B-17, not reopened).

## 1. Goal

A user manages all buildings and levels in one dialog with few steps:
- One view shows all buildings, the levels of the open building, the sheets of each level and the warnings. One click switches building or level.
- The dialog lists the open documents. One click adds an open document (or one page of it) to a level. No file picker, and the sheet is linked at once when the document has a project id.
- Rebuild is no longer a main task. MepApp writes the summary when a PDF opens. A repair action stays for rare cases.
- Every dead end has a way forward (Export scope with no building).

Steps after the change. One rule for all rows: a step is one click, one typed entry or one file picker. Rows start with the dialog open (opening it is 2 steps, Menu and Manage Buildings, before and after). The Export rows start in the app.

| Task | Today | After |
|---|---|---|
| Add 3 open PDFs to Level 1 | about 9 | 2: pick the level in the tree, click "Add all open documents" |
| Add one open PDF to a level | about 3 | 1 (a button on its row) |
| Assign the 3 pages of a PDF | 6 (3 selects, 2 actions each) | 1 ("Add all pages") |
| Switch building | 2 and the context is lost | 1 (click it in the tree) |
| Check what is on Level 1 | scroll and read all groups | 1 click on the level |
| Export Level quantities, building open | 5 (Menu, Export, Level radio, select, Export) | 5 (no change) |
| Export Level quantities, no building open | about 11 | 6: Menu, Export, choose a building in the dialog, Level radio, select, Export |
| Add 3 levels | 9 (click, type, Enter for each) | 3 with the default names "Level 1" to "Level 3"; 6 with typed names (click and type; the next click commits the name) |

## 2. Decisions

Already made, not reopened: D-B-09, 10, 11, 12, 13, 16, 17, 24, 25, 26, 28, 29 (see the prompt).

Open, for the user (put on the dashboard with these options):

**D-B-27 (reopened).** The user asked: "Is that all Rebuild does? What is the actual use? Is it not something we can do as soon as a PDF is open?" Answer: Rebuild opens each PDF of the building that is not open, reads its project and writes its summary (counts, scale, page size). Level and Building export need those summaries. Today MepApp writes a summary only on Save. So a PDF that was saved before the building existed has no summary until Rebuild reads it. Rebuild also lists names, because it shows which PDF failed and why. The user is right: MepApp can write the summary when a PDF opens, because the project is already loaded then.
- A. (recommended) Write the summary when a PDF opens and it matches a sheet. Link a sheet that has no project id to the id that the PDF carries. Keep a repair action, "Read summaries now", with a clear text. It shows only when a sheet has no summary. It links sheets too.
- B. Write the summary on open, but never link sheets by file name. A sheet with no id stays "not stamped" until the user saves it.
- C. Keep Rebuild as it is. Add nothing on open.
Reason for A: the data is free at open, the repair action is rare, and "not stamped" rows go away without a Save.

**D-B-30 (new).** An open document that was never saved has no project id. What does "Add to level" do?
- A. (recommended) Add the sheet with no id and its path. The row says "Save this file to link it". The link happens at the next Save (existing `linkSheets`). The dialog writes no PDF.
- B. Save the document first (the dialog calls Save), then add the sheet with the id.
Reason for A: Save works on the active tab only, and it writes a PDF. A dialog action must not write a user PDF without a clear Save.
Same rule for a document with unsaved changes (auditor finding 19): the summary is written only on Save. The row says "Unsaved changes. The summary updates when you save." This is part of A and B alike.
A document with no id and no path (web, or "Open with" with no file target) has no key. The add callback tests the view state first, so a second click adds nothing twice.

Provisional (director default, easy to reverse, recorded as `provisional`):
- **D-B-31** Layout: a tree on the left, the detail on the right (two columns). A single column below 900 px. Alternative: tabs. Reason: the old app uses a tree, and the user asked for one view of buildings and levels.
- **D-B-32** No drag and drop in T11. Buttons only. Reason: Tauri drag events differ from the web, and the buttons give one-step add.
- **D-B-33** Delete of a level that has no sheets: no confirm. An "Undo" line shows for 8 seconds. Reason: reversible, one click less than a confirm.

## 3. What exists now (verified in the review)

See review section 4. In short: `DocumentSummary` has no page count, size or project id. `fileTargetsRef` (`packages/ui/src/App.tsx:629`) holds the path of a document. `summaryAfterSave` already links a sheet with no id on Save. `documentOpenedRef` (declared `App.tsx:652`, assigned `:706`) runs on open and only fixes a moved location. `QuantitiesScopeDialog` has no action. `SketchScene.getDocuments()` (`scene.ts:1194`) and the event `documentsChanged` (`scene.ts:581`) already feed `useSketchScene.documents`.

## 4. The model

No stored data changes. No schema change. The building file format stays as it is (D-B-10, D-B-11).

New read model (UI state, not stored):

```ts
// packages/render/src/document.ts: DocumentSummary (exists: id, fileName, isDirty, hasPdf) gets three fields.
// toSummary() (document.ts:191) fills them. No second method (rules.md section 3, B4 uses scene.getDocuments()).
interface DocumentSummary {
  projectUuid: string | null;      // null: never saved or stamped
  pageCount: number;               // pdfHandle.getPageCount(), 0 when there is no PDF
  sizeBytes: number | null;        // file.size, stored when the document opens
}
// commitProjectUuid (scene.ts:4249) emits documentsChanged, so a Save updates the rows.
// packages/ui/src/openDocumentsView.ts (new, pure)
export interface OpenDocumentRow {
  doc: DocumentSummary & { active: boolean; currentPage: number | null };
  path: string | undefined;        // from fileTargetsRef; the dialog reads it when it opens and when the documents change
  displayName: string;             // the file name; for a multi-page PDF the sheet name adds " p<N>"
  pages: { pageIndex: number; sheet: BuildingSheet | null; levelName: string | null }[];
  state: 'placed' | 'partly' | 'not-placed';
  needsSave: boolean;              // projectUuid === null
}
export function openDocumentRows(docs, targets, file): OpenDocumentRow[]
```

Rules: a page matches a sheet by `projectUuid` and `pageIndex`; a document with no id matches by path, then by file name only when `path` is unset (same rule as `findSheets`, B1-T14). The dialog reads `listDocuments()` again when documents change (reuse the existing subscription of `useSketchScene`, no new store). Rule 3 of `rules.md` holds: the dialog is a view over `documents` and over the building file. No second list of documents.

Domain rules 1, 2, 4 do not apply (no network type or port is touched). Rule 5: every task has a browser check with real inputs. Rule 6: build after each task.

## 5. Phases and tasks

Common verification: `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm build`, then the named browser check (one command per Bash call, `with-server.mjs`). Screenshots `B3-T11x-<name>`, uploaded to the dashboard (event `shot`). Core test takes about 140 s: never run two heavy runs at once. Browser limit: one Chromium page at a time. Also run the keyboard check (Tab, Enter, Escape, arrows) and a 760x640 run for each UI task.

### Phase 1: data and behavior (no layout change yet)

**B3-T11a: open documents view model.**
- Files: `packages/render/src/document.ts` (`DocumentSummary`, `toSummary`), `packages/render/src/scene.ts` (store `sizeBytes` at open; `commitProjectUuid` emits `documentsChanged`), `packages/ui/src/openDocumentsView.ts` (new), tests, `packages/platform/src/file-access.ts` (add `path?: string` to `FileTarget`; the web target stays without a path; remove the cast in `pathOfTarget`), `packages/core/src/building-edit.ts` (`relinkSheet` guard: refuse a duplicate id and page, return an error code like `deleteLevel`; keep the UI guard and its test).
- **DONE 2026-11-02, commits `638bda2` and `095792e`.** Core 2179, ui 562 tests passed, build 9/9, browser check 15/15, old `b3-t06` check 25/25. Added after the audit: `DocumentSummary.projectUuidInFile` (false while the id is only minted in memory) and the row field `sheetProjectUuid`; every successful Save calls `commitProjectUuid`. Not run: Tauri paths.
- Verify: UI tests for `openDocumentRows` (placed, partly, not placed, no id, path match, name match, no id and no path); core test for the `relinkSheet` guard; browser check: open 2 documents, Save one, the summary of that document shows the new `projectUuid` without a reload.
- Depends on: none.

**B3-T11b: summary on open (D-B-27, A or B as the user chooses).**
- Files: `App.tsx` (`documentOpenedRef`, `writeBuildingSummary`), `packages/ui/src/buildingContext.ts`, `rebuildSummaries.ts` (link sheets with no id; remove `notLinked` when linked), tests.
- Shapes: write the summary after `checkOpenedDocument` (`documentIdentity.ts:22`) ends, by its outcome:
  - `none`: write at once.
  - `moved`: write after `updateRef` has finished (they run one after the other).
  - `ask` (copy or unclear): write nothing. A copy has the same `projectUuid` as the original, so a write would replace the summary of the original. Write only after the user picks "It is the same file" or "Use as a copy (new id)" (a copy has no id until its next Save, so it writes nothing then either).
  - Take the PDF handle from the scene by document id, not from React state. `writeBuildingSummary` (`App.tsx:878`) reads `pdfHandle` from state and may see the previous document. Refactor it to take `handle` and the document id. Do not write when the document is not the one that just opened (a background open writes nothing, on purpose).
  - Stale test: write when no summary exists, or when `sourceSizeBytes` or `sourceModifiedMs` differ from the file (one `readSummary` per open).
  - Skip when `loadFromPdf` reports `drifted` or `missingIds` (`App.tsx:684`): the loaded project then differs from the file.
  - A PDF with no embedded id gets a random id in memory at load (`ensureProjectUuid`, `scene.ts`), and `DocumentSummary.projectUuidInFile` is false (T11a fix `095792e`). Write no summary and link no sheet by that id on open. Such a sheet stays "Not saved yet" until a Save. A path match links without a size check, as Save does. Under B, skip `linkSheets` for a name-only match.
  - Do not add an effect on a building change that runs this check again (a loop: `writeBuildingSummary` ends with `buildingHook.reload()`).
- Verify: UI tests with a stub store (match, no match, copy case, moved, summary fresh = no write, drifted = no write, conflict retry, two PDFs opened in quick succession write each summary under its own id). Browser check: add two saved PDFs to a building with no summaries (build the building through the dev hook), open each PDF from the viewer, the sheet row changes from "no summary" to a date, and Level export works without Rebuild.
- **DONE 2026-11-02, commit `ccdbea0`** (D-B-27 A, answered by the user). UI 578 tests, build 9/9, new check `b3-t11b-check.mjs` 19/19, old checks `b3-t08` 19/19, `b3-t06` 25/25, `b3-check` 22/22. Not run: Tauri paths. On web a path match cannot run in the browser (unit tests only). On web the first open after a Save may rewrite the summary once (harmless).
- Depends on: none.

### Phase 2: the new dialog

**B3-T11c: shell, tree and building switcher.**
- **DONE 2026-11-02, commit `0ac88fe`.** UI 597 tests, build 9/9, new check `b3-t11c-check.mjs` 66/66, old checks b3-t02/03/04/05/09/check pass. Provisional: warnings badge counts level warnings plus missing/no-access PDFs; Import old buildings is a Building menu item. Not run: Tauri paths, real building switch (web store holds one file).
- Files: `ManageBuildingsDialog.tsx` (rewrite of the shell), `BuildingTree.tsx` (new), `buildingTree.ts` (new, pure: tree nodes from `recent` and the open file), `theme.css` (scoped classes), `App.tsx` (pass `documents` rows and the active sheet), tests.
- Shapes: fixed size `min(1100px, 96vw)` by `min(760px, 88vh)`. A header: the building name, the file path, the counts, a warnings badge, and a "Building" menu (Close building, Import old buildings, Open building…, New building…). A left tree: every building from `recent` (the open one has a marker and is expanded; a click on another building opens it), its levels with sheet count and warning dot, a "Not placed" node when pages wait. Arrow keys move in the tree, Enter selects, Home and End work. The right pane shows the detail of the selected node. The dialog opens with the level of the active sheet selected (else the first level; else the building node). Initial focus: the tree. Body scroll in the right pane only. A divider line under the title and above the footer. Section titles in normal size and weight, clearly larger than the hints (R-16). A visible focus ring on all controls, from the existing tokens (R-20). The right pane has a tab strip with one tab, "Levels and sheets", so that B4-T09 adds "Risers" there. Below 900 px: one column, the tree becomes a select over buildings and levels. Footer: one "Close" button only (Close building moves into the menu).
- Fixes: R-2, R-5, R-9, R-16, R-17, R-18 (shell part), R-19, R-20, F-B3-1 (marker), F-B3-2 (divider).
- Old checks: keep these test ids and update the check scripts for what moves. Kept: `level-row`, `sheet-status` and its `data-status` values, `open-sheet`, `relink-pdf`, `page-row`, `pdf-group`, `rebuild-*`, `import-old*`, `dup-*`. Moved or renamed (update `b3-check.mjs`, `b3-t02` to `b3-t09` and `b2-lib.mjs`): `.mep-buildings-open-name`, `.mep-buildings-recent button` "Open", "Close building" (now in the Building menu), "Add level" (now "+ Add level"), `[data-testid=sheets-notice]`, "Dismiss", `sheets-totals`, `refresh-status`. Each of T11c to T11i updates the checks it breaks. The final run of every old check is part of T11j.
- Verify: UI tests for `buildingTree`; browser check: with 2 building files in the recent list, click each in the tree (1 click each), levels show; keyboard walk; screenshots at 1600x1000 and 760x640. Height stays the same before and after the first level (R-5).
- Depends on: T11a.

**B3-T11d: levels in the tree.**
- Files: `BuildingLevelsPane.tsx` (becomes the level detail), `BuildingTree.tsx`, `buildingLevels.ts`, tests.
- Shapes: "+ Add level" under the levels in the tree. The new level is selected and its name field has the focus, with a default name "Level N" selected. The detail has name, elevation (mm), move up and down, delete. Delete shows the reason text when blocked ("Remove its 2 sheets first"). An empty level deletes with an Undo line (8 s). "Sort by elevation" shows the reason when disabled. Level order shows in the tree as the order of the file.
- Fixes: R-12, R-13, R-22, F-B3-1.
- Verify: UI tests; browser check by typing into the real fields, Enter and Tab; delete then Undo restores the level; screenshots.
- Depends on: T11c.

**B3-T11e: sheets of a level.**
- Files: `LevelSheetsPane.tsx` (new, replaces the per-PDF groups of `BuildingSheetsPane.tsx` for placed sheets), `BuildingSheetsPane.tsx` (shrinks to the not-placed PDFs and the add actions), `buildingStatus.ts` (words), tests.
- Shapes: each row: file name, page, a status chip with one plain word (OK, Missing, No access, Not saved yet, No summary), the actions Open (or "Choose file…" when it has no path), "Move to…" (level select), Remove. A missing sheet shows "Relink…" on the row. A footer line: "N of M sheets have a summary". Words: **sheet** for a placed page, **page** for a page of a PDF, **PDF** for a file on disk, **document** for a PDF open in the viewer. "Not stamped" becomes "Not saved yet. Save it in MepApp to link it." A long list uses a plain scroll in the right pane (no new virtual list; the limit stays: a PDF with more than 20 pages is collapsed).
- Fixes: R-3, R-10, R-11, R-14, F-B3-2 (no assign-all).
- Verify: UI tests for status words; browser check: Level 1 shows only its sheets; Move to changes the list; Relink on a deleted file; screenshots.
- Depends on: T11d.

**B3-T11f: open documents list and Add to level.**
- Files: `OpenDocumentsPane.tsx` (new), `ManageBuildingsDialog.tsx`, `App.tsx` (rows into the dialog; callback `onAddOpenDocument`), tests.
- Shapes: a section "Open in the viewer" under the sheets of the selected level. One row per open document: file name, page count, where it is placed ("Ground floor", "3 pages: 1 placed"), the primary button "Add to <selected level>", a level select for another level. A document with several pages: "Add all pages" and a page chip list to pick single pages. A document with no id (D-B-30 A) has the note "Save it to link it". A header button "Add all open documents to <level>". A page that is already a sheet shows its level, and the button is "Move to <level>". The active document has a marker. The add uses `addSheets` with the project id, path and displayed name of the document. No file picker.
- Add data: `projectUuid` = the row field `sheetProjectUuid` (null when `projectUuidInFile` is false: never store the random id of an unsaved PDF), `path` (from the file target; may be absent), `sizeBytes` (from `DocumentSummary`), `displayName` (the file name; for a multi-page PDF the page adds " p<N>"), `pageIndex`. The callback tests the row state before it calls `addSheets`, so a second click or a document with no id and no path adds nothing twice (`addSheets` cannot see that key). A document with unsaved changes shows "Unsaved changes. The summary updates when you save." (see D-B-30).
- Fixes: R-1.
- Verify: UI tests (add one page, add all, already placed, no id, no id and no path, double click, no building level yet = "Add a level first" with a button); browser check: open 3 documents (one multi-page), click Add all, `stored()` shows the sheets with the right ids; no file picker call (count picker calls = 0); screenshots.
- Waits for: the answer to D-B-30 (the form above is A).
- Depends on: T11a, T11e.

**B3-T11g: add from disk and not-placed pages.**
- Files: `BuildingSheetsPane.tsx`, `NotPlacedPane.tsx` (new), tests.
- Shapes: "Add PDFs…" and "Add folder…" (desktop) stay, as a small action row in the open documents section. Added PDFs that wait appear under the "Not placed" tree node with a count badge. The node shows the line "These pages are not saved in the building. Place them or they go when you close this dialog." in normal text. "Assign all pages" for a PDF has a level select. Closing the dialog with not-placed pages asks once inside the dialog ("N pages are not placed. Close anyway?", two buttons; no `window.confirm`). The notice after an add goes in a status line at the bottom of the right pane and fades (no Dismiss button).
- Fixes: R-6, R-7 (partly: the picker stays one file at a time; the folder add stays desktop only), R-15.
- Verify: browser check (picker stub): add 2 files, assign all pages of a 3-page PDF with one action, close with pages waiting shows the ask; screenshots.
- Depends on: T11e.

**B3-T11h: tools, messages and repair.**
- Files: `BuildingSummariesPane.tsx` (becomes the repair action), `ManageBuildingsDialog.tsx`, tests.
- Shapes: the "Summaries" section goes. The building header shows "N sheets have no summary" with the button "Read summaries now" only when N is above 0. The text: "Reads each PDF of this building from disk and saves its summary. MepApp does this when you open or save a PDF." Progress and Cancel as now. The result: a list with the reason and, for each failed sheet, the actions that fix it (Relink, Choose file…). A long failure text wraps in the dialog; the header status line shows a short text. "Check files again" becomes automatic when the dialog opens and when the window gets the focus; a small "Refresh" icon button stays. Under D-B-27 C this task keeps the button as it is and only moves it.
- Fixes: R-8, F-B3-3 (long text; keep the Cancel limit: between documents, named in the text).
- Verify: UI tests; browser check: with N=2 the button shows, after the run it is gone; failure rows show actions; screenshots.
- Waits for: the answer to D-B-27.
- Depends on: T11b, T11e.

### Phase 3: ways forward and close-out

**B3-T11i: Export scope dead end, status label, stale text.**
- Files: `QuantitiesScopeDialog.tsx`, `App.tsx`, the status-bar label component, tests.
- Shapes: with no building open, the scope dialog shows a select "Building" over `recent` and a button "Open building…" (opens the file picker). Choosing one opens it through `building.openRecent`, then the Level and Building scopes enable. A link "Manage buildings…" opens the main dialog. The status-bar label opens the dialog at the shown level when clicked, and it shortens with an ellipsis and a full title text at narrow widths (F-B3-3). The header "Saved …" text clears when the active tab changes (F-B3-3).
- Fixes: R-4, F-B3-3.
- Verify: browser check: no building open, Menu, Export, choose the recent building, Level, Export gives an xlsx; 1600 px label check; tab switch clears the text; screenshots.
- Depends on: T11c.

**B3-T11j: part check.**
- Files: `.claude/roadmap/work/b3-t11-check.mjs`.
- Verify: from an empty profile with real clicks: create two buildings, switch by one click, add levels by typing, add three open documents (one multi-page) with the bulk button, open each document from a sheet, delete a PDF and relink, export Level and Building, close and reopen from the tree, 760x640 run, keyboard walk. Core and UI tests, `pnpm build --force`, grep `dist` for the dev hooks (`__mepBuilding`). Screenshots of every step. Say clearly: the Tauri paths were not run. Give the user a short Windows script (folder picker, Grant access, Open from path, Add folder).
- Depends on: all.

## 6. Order and parallel work

T11a is independent of the layout and runs first. T11c, T11d and T11e do not wait for a decision and can start after T11a. T11b, T11f and T11h wait for D-B-27 and D-B-30. T11c to T11h touch `ManageBuildingsDialog.tsx` and `theme.css`: run them one after another, in the order written. T11i can run after T11c. T11j last. Do not start B4 before the user agrees.

Tauri-only risks (not run here): a document opened by "Open with" or a drag may have no file target, so no path (T11f then adds a sheet with no path and no id, and the row says so). `statPath` on open (T11b) must stay inside the granted scope; a throw is already `no-access` in `checkOpenedDocument`. T11j gives the user a Windows script for these.

B4: `buildings-b4.md` B4-T09 (Risers tab) was written for the old single-column dialog. After T11 it adds its tab to the tab strip of T11c. A line in B4-T09 says so.

## 7. Out of scope

Dark theme (the app has none; T11 uses the existing tokens). Drag and drop (D-B-32). A virtual list. Scale and calibration edit per sheet in the dialog (deferred, B2 section 4). Risers (B4; the dialog keeps a place for a "Risers" tab next to the detail). The web store (T19). Windows native checks (T16).
