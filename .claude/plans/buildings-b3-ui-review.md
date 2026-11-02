# B3-T11 review of the Manage Buildings dialog

Date: 2026-11-02. Method: the real app (dev server, Chromium), real clicks and typing, script `.claude/roadmap/work/b3-t11-review.mjs`. Viewports: 1600x1000 and 760x640. No product code was changed.
Screenshots: `/tmp/mepapp-shots/T11-main-*.png`, `T11-dark-*.png`, `T11-narrow-*.png`.
Not run: the native Tauri paths (folder picker, `statPath`, `readPath`, Grant access). The web dev build has no file paths, so Rebuild fails there with "no path is stored" (D-B-24: the production web build shows "Use the desktop app").

Terms. **Sheet**: one page of a PDF that is placed on a level. **Open document**: a PDF that is open in a viewer tab. **Project id**: the id (`projectUuid`) in the saved project of a PDF.

## 1. What a user wants to do, and the steps today

Steps count each click, each typed entry and each file picker as one step. Menu, Manage Buildings counts as 2.

| Task | Steps today | Problem |
|---|---|---|
| Create a building | 2 + New building + type + Enter + picker = 6 | Acceptable. |
| Add 3 levels with names | 3 clicks + 3 x (type + Enter) = 9 | The new level gets an empty name. The user must click into each name field. |
| Add the PDFs that are open in the viewer to a level | Not possible without a file picker. For each PDF: Add PDFs + picker + choose the same file again + one select for each page. For 3 PDFs of 1 page: about 9 | The dialog does not know the open documents. R0 test: 3 open documents, the dialog mentions none of them. |
| Assign the pages of a 3-page PDF | 3 selects (2 actions each) | No "all pages to this level" action. |
| Switch to another building | Close building, then Open on a recent row = 2, but the dialog loses all context | Recent buildings show only when no building is open. There is no overview. |
| See all levels and their sheets | Scroll | The sheets list is grouped by PDF, not by level. A user who asks "what is on Level 1?" must read every PDF group. |
| Export Level quantities | Menu, Export, Level radio, select, Export = 5 | OK when a building is open. |
| Export Level quantities with no building open | Dead end. The scope dialog says "Open a building first". The user must cancel, open Manage Buildings, open a building, close, and start again: about 11 | No link or action in the scope dialog. |
| Fix a missing PDF | Find the group, Relink, picker = 3 | Status refreshes only after "Check files again" or a dialog open. |
| Know if the summaries are ready | Read each row | No total. The word "Rebuild" gives no hint when it is needed. |

## 2. Problems found

Rating: H = blocks a main task, M = slows or confuses, L = polish. IDs R-n are used in the plan.

### Structure and flow
- **R-1 (H) Open documents are invisible.** The dialog has no list of open documents. R0 test: three tabs open, the text of the dialog has no file name. The user asked for this.
- **R-2 (H) No overview of buildings and levels.** One long column: building header, Levels, Summaries, Sheets, then Open or create and Recent buildings at the bottom. At 1600x1000 the body is 1206 px high in a 780 px area, so it scrolls (R4). Recent buildings show only after Close building.
- **R-3 (H) Sheets are grouped by PDF, not by level.** The level select sits on each page row. To check a level the user reads all rows.
- **R-4 (H) Export scope has a dead end** when no building is open (R8 test text: "Open a building first", no action).
- **R-5 (M) The dialog jumps in height.** R0 207 px, R1 721 px, R4 894 px. The dialog is centered, so its top moves from 396 to 140 to 53 px. The width is fixed at 944 px, so the "width jumps" note in F-B3-1 did not reproduce. The height does.
- **R-6 (M) Pages without a level exist only in the dialog** (D-B-17). A user who closes the dialog loses them without a warning. The text "kept only while this dialog is open" is small and grey.
- **R-7 (M) One file picker for each PDF.** `FileAccess.openFile` returns one file. "Add folder" exists on desktop only and adds every PDF.
- **R-8 (M) "Rebuild summaries" has no clear use** (D-B-27). It is a section by itself, between Levels and Sheets, at the same weight as the main tasks. The result list shows file names and a reason, nothing to click.

### Wording and controls
- **R-9 (M) Two near-equal buttons**: "Close" (dialog) and "Close building" (building). Both are plain grey buttons. Close building sits above the footer with no marking.
- **R-10 (M) "Pick the file again…" looks like an error.** On a web file with no path this button replaces "Open" on every row. Desktop rows with a path show "Open".
- **R-11 (M) Mixed words**: "sheet", "page", "PDF", "document", "file". The status "Not stamped yet. Open and save it in MepApp." uses "stamped" with no definition.
- **R-12 (M) Delete level has no confirm and no undo.** One click removed an empty level (R6). The button is disabled with a reason in the title only, and the row text says "cannot delete" in a small grey label.
- **R-13 (L) Sort by elevation is disabled with no reason text.** No tooltip.
- **R-14 (L) Mixed levels of button.** "Remove from list" (pending PDF) and "Remove sheets" (stored sheets) sit next to each other with the same look. One changes the file, the other does not.
- **R-15 (L) A notice with "Dismiss" button** after each add. The text stays until dismissed.
- **R-16 (L) Section titles are tiny, condensed capitals** (OPEN BUILDING, LEVELS). The building name is larger than the section titles, but the counts line ("3 levels, 5 sheets") is bigger than both.

### Looks and keyboard
- **R-17 (M) Body scrolls under the title with no clear divider** in a long list (narrow screenshot: the level rows are cut at the title line).
- **R-18 (M) Narrow window (760x640).** The page-row select shows "Ground flo" (cut), and the row below is cut by the footer. The status text and the Open button wrap in odd places. Three columns of the level row (mm, count, three buttons) crowd the name field.
- **R-19 (M) Initial focus is the page body.** After the dialog opens, `document.activeElement` is `<body>`. The first Tab goes to the first level name. With no building, the first Tab goes behind the dialog or to the footer.
- **R-20 (L) Focus ring is the browser default** (1 px auto). It is hard to see on the grey buttons.
- **R-21 (L) No dark theme exists.** `theme.css` has no `prefers-color-scheme` or `data-theme` rule. The dark run (`colorScheme: dark`) looks the same as the light run. The dialog uses hard-coded `#b3261e`, `#2f7d4f` and `#9a5b00` for status. T11 adds no dark theme (out of scope). T11 uses the existing tokens only, so a later dark theme works.
- **R-22 (L) Tab order** is correct (name, elevation, up, down) but the delete button is skipped when disabled, so the row feels uneven. No arrow-key move in lists.

### Known small items (F-B3-1, F-B3-2, F-B3-3), status
| Item | Status after the review |
|---|---|
| Dialog width jumps when the first level is added | Not reproduced. The height jumps instead (R-5). |
| No marker for the open file in the recent list | Confirmed. `RecentBuilding` has `{ id, name, location }`. Compare with `building.file.id`. |
| Close building and Close look alike | Confirmed (R-9). |
| Sort by elevation has no reason | Confirmed (R-13). |
| Delete of an empty level has no confirm or undo | Confirmed (R-12). |
| Body scrolls under the title with no divider | Confirmed (R-17). |
| No "assign all pages" action | Confirmed (R-3, section 1). |
| Rebuild Cancel works only between documents | Confirmed in code (the abort signal is checked per document). Keep. A single PDF is read in one call. |
| Long failure text cut in the header | Confirmed in the screenshot: "Rebuilt 0 of 3 summaries. 3 failed: ground.pdf: no p…". |
| Stale "Saved ..." text after a tab switch | Not re-tested here. Kept in the plan. |
| Status-bar label cut at 1600 px | Not re-tested here. Kept in the plan. |
| `relinkSheet` has no guard for a duplicate id and page | Core gap, UI guard only. In the plan. |
| `FileTarget` has no `path` field | In the plan. |

## 3. The old MEPSketcher dialog (for comparison)

Source: `/root/MepSketcher/MEPSketcher2/ViewModels/Building/BuildingManagementViewModel.cs` and `Views/BuildingManagementWindow.xaml`.
- Left: a tree Building, Level, Sheet, all expanded. Missing PDFs in italics. An "Unassigned" row at the top shows the PDF that is open now when its page is on no sheet.
- Right: the detail of the selected node (building rename, level name and elevation, sheet path with Relink, scale and calibration).
- Main flow: open a PDF, open the dialog, the "Unassigned" row shows that PDF, assign its page to a level. One flow, few steps, because the app knows the open document.
- What MepApp should copy: the tree, the detail pane, and the "open document is not placed yet" row. What MepApp should not copy: one building at a time with no level order, and the dialog as the only place to see the building.

## 4. Facts the plan depends on (checked in code)

- `documents` in `App` come from `useSketchScene()`, fed by `scene.getDocuments()` (`scene.ts:1194`) and the event `documentsChanged`. Type `DocumentSummary` is `{ id, fileName, isDirty, hasPdf }` only (`packages/render/src/document.ts:74`). Page count, project id and size are not in it. `SketchDocument` holds `projectUuid` and `pdfHandle` (`document.ts:90`). The scene has `getProjectUuid()` for the active document only (`scene.ts:4244`). `commitProjectUuid` (`scene.ts:4249`) does not emit `documentsChanged`.
- A document that was never saved has `projectUuid === null`. It gets an id on Save (`ensureProjectUuid`, `scene.ts:4359`) or from the embedded project when it loads.
- The file target of a document (path) is in a ref, `fileTargetsRef` (`packages/ui/src/App.tsx:629`; used at `:1001`). `FileTarget` has no `path` type; `pathOfTarget` casts.
- Save writes the summary (`writeBuildingSummary`, `App.tsx:878`, `summaryAfterSave`). Open writes nothing; `checkOpenedDocument` only fixes a moved location or asks about a copy. Rebuild reads PDFs from disk, one per document, writes summaries, and does not link a sheet with no id (it goes to "notLinked").
- `QuantitiesScopeDialog` gets `building` (name and levels) or undefined. It has no way to open the building.
- `recent` is stored in localStorage `mepapp.buildings.v2`, max 20, newest first.
