# B3 plan: building management UI

Status: planned 2026-10-31 by the road map planner. Not started. Not audited.
Origin: `buildings-levels-sheets-spec.md` (sections 1, 3, 5), `buildings-b1.md`. D-B-01 and D-B-02 (answered) apply: PDFs live anywhere, a page belongs to one level. D-B-16 A (web is read-only) is a director default.
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. Line numbers can move.
Terms: as in the spec, section 0. **Unassigned page**: a page of a PDF that is in the building file's PDF list but on no level.

## 1. Goal

After B3 the user manages a building in one dialog (Menu, Manage Buildings):
- Create a building (a new building file at a place the user picks) or open one.
- Add, rename, reorder and delete levels. Each level has an elevation in mm.
- Add PDFs from anywhere on the PC. Each page of a PDF can go to one level.
- See the state of each sheet: found, missing, "not stamped" (no id yet), "no summary".
- Relink a missing PDF. Resolve a copy or a move when a document opens.
- Open a sheet from the list (go to sheet). The old app has no such feature.
- Rebuild the summaries and see the progress.

Example: an office block of 8 PDFs on the desktop. The user adds the 8 files, sees 14 pages, sets "Ground floor" and "Level 1" and assigns page 1 of `A101.pdf` to Ground floor and page 2 to Level 1. The status bar then shows "Office block, Level 1, A101.pdf p2" while that page is shown.

B3 stops where risers begin. B3 shows no riser. B4 adds a Risers tab to this dialog.

## 2. What exists now

| Fact | Source |
|---|---|
| The old dialog: building list, level list, "Assign current document"; every change commits at once (no Save step) | `packages/ui/src/components/ManageBuildingsDialog.tsx:21-60` |
| The old model: `Building`, `BuildingLevel` with `documentFileName`; localStorage key `mepapp.buildings.v1` | `packages/ui/src/buildings.ts:10-57` |
| The state and the save callback in `App` | `packages/ui/src/App.tsx:413`, `:516-518`, `:1518`, `:1814-1819` |
| The shared dialog; `closeOnBackdropClick` prop; Escape handling | `packages/ui/src/components/Dialog.tsx:13`, `:39-40`; memory `project-dialog-escape-listener-conflict` |
| Opening a PDF goes through one function `openPdfFile(file, fileTarget)`; it dedups on `name:size:lastModified` | `App.tsx:593-642` |
| Page change | `App.tsx:523-540` (`handleChangePage`), `scene.ts:1100` |
| The header document switcher over the documents list | `DocumentSwitcher` (memory `project-left-rail-toolbar-cleanup-2026-09-18`); `DrawingsPanel.tsx` |
| `FileAccess.openFile` returns `File` plus a `target`; no "open this path" call | `packages/platform/src/file-access.ts:36-51` |
| `onOpenRequest` reads a path to a `File` on desktop (`readAsFile`) | `packages/platform-tauri/src/tauri-file-access.ts:25-28`, `:98-119` |
| The status bar shows "Page X of N" | `App.tsx:1627-1629` |
| Several dialogs use an i18n path | `packages/ui/src/components/AutoPlaceDialog.tsx`, `RouteDialog.tsx` (not verified: which function; read one before B3-T02) |

## 3. Research (what MepApp can use)

- The old window: `BuildingManagementViewModel` (assign PDFs and pages, unassigned PDFs, relink `:155`, current-document highlight `:209`, `:532`), `BuildingVM`, `BuildingLevelVM`, `BuildingSheetVM`, `UnassignedPdfVM` under `MEPSketcher2/ViewModels/Building/`. MepApp copies: the three-level tree (building, level, sheets); the list of unassigned PDFs; relink. MepApp adds: level order that the user changes (the old app has none), and "go to sheet".
- Reuse (rules.md section 3, rule 3): the dialog is a thin view over `BuildingFile` (from B1) and over the documents state that already exists (`documents`, `activeDocumentId`, `handleActivateDocument`; memory `feedback-reuse-existing-mechanisms-before-designing-new`). No parallel list of open documents.
- Not verified: the number of pages that a big building shows; a list of hundreds of sheets needs a virtual list or a collapsed tree. B3-T04 sets a limit: sheets show under their level and a PDF group is collapsed by default when it has more than 20 pages.

## 4. The model

B3 adds no stored data. It uses `BuildingFile` (spec 3.2), `BuildingStore` (B1-T15) and the recent list (B1-T18).

UI state (React, not stored):

```ts
// packages/ui/src/useBuilding.ts (new)
export interface OpenBuilding {
  file: BuildingFile;
  revision: string;
  store: BuildingStore;
  dirty: boolean;                     // the dialog writes at once, so this is true only while a write runs
  sheetStatus: Record<string, SheetStatus>;   // by BuildingSheet.id
}
export type SheetStatus = 'ok' | 'pdf-missing' | 'no-access' | 'not-stamped' | 'no-summary' | 'old-summary' | 'copy-suspected';
export function useBuilding(args: { fileAccess: FileAccess; makeStore: (ref: BuildingRef) => BuildingStore }): {
  building: OpenBuilding | null;
  create(name: string): Promise<void>;       // asks for a location (saveFileAs), writes an empty building file
  open(): Promise<void>;                     // asks for a file (openFile)
  update(change: (file: BuildingFile) => BuildingFile): Promise<void>;   // write with the revision; on StoreConflictError reload and tell the user
  close(): void;
};
```

A change goes through `update` only. `update` calls a pure function of `core` and writes. If `StoreConflictError` is thrown (another MepApp or a OneDrive sync changed the file), the hook reloads the file, drops the change, and shows "The building file changed on disk. Your last change was not saved." (a data loss shown, never silent).

How B3 keeps the domain rules: no network type or port is touched (rules 1, 2, 4). Rule 3: the dialog reuses `Dialog`, `useBuilding` over `BuildingStore`, and the documents state. Rule 5: every task has a browser check with real clicks and typing. Rule 6: build after each task.

## 5. Phases and tasks

Common verification: `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm build`, then the browser check named in the task. Screenshots `<task id>-<name>` in `/tmp/mepapp-shots/`. Upload each task's screenshots to the stream dashboard (memory `feedback-roadmap-screenshots-on-dashboard`).
Browser limit: one Chromium page with a PDF at a time.
The web dev server uses the web store (OPFS handles from `lib.mjs`). A desktop-only action (absolute paths) is proven with the memory store plus a user run on Windows.

### Phase 1: the pure logic (core)

**B3-T01 core: building edits.**
- Files: `packages/core/src/building-edit.ts` (new), test file.
- Shapes (all pure, return a new `BuildingFile`): `addLevel(file, name, elevationMm?)`, `renameLevel`, `setLevelElevation`, `moveLevel(file, levelId, toIndex)`, `deleteLevel(file, levelId)` (a sheet always has a level, so `deleteLevel` refuses when the level has sheets and returns the error code `'level-has-sheets'`), `addSheets(file, levelId, pages: { projectUuid: string | null; pageIndex: number; displayName: string; location: SheetLocation }[])` (skips a page that already has a sheet and returns the skipped list), `moveSheet(file, sheetId, levelId)`, `removeSheet`, `relinkSheet(file, sheetId, location, projectUuid?)`, `sortLevelsByElevation`.
- Unassigned pages: a PDF page that the user did not assign is not in `sheets` at all. The dialog keeps the pages of an added PDF in its state until the user assigns them or closes the dialog (not stored, to keep one source of truth: `sheets`). See D-B-17 below.
- Verify: core tests: each function; a page twice; delete refuses; move keeps order.
- Depends on: B1-T13.

### Phase 2: the dialog

**B3-T02 ui: `useBuilding` hook and the dialog shell.**
- Files: `packages/ui/src/useBuilding.ts` (new), `packages/ui/src/components/ManageBuildingsDialog.tsx` (rewrite), `packages/ui/src/App.tsx` (props at `:1814-1819`), tests.
- Shapes: as in section 4. The dialog: header with the building name and the file location; buttons New building, Open building; a recent list from B1-T18; Close. `closeOnBackdropClick={false}`. Keeps the Escape behavior of `Dialog`.
- Do not touch: the Menu entry (`onOpenManageBuildings`, `App.tsx:1518`).
- Verify: UI tests for the hook with the memory store; browser check: click Menu, Manage Buildings, New building, type a name, confirm in the (OPFS) save picker, the dialog shows the name and an empty level list; reload the page, the recent list shows the building. Screenshots `B3-T02-new`, `B3-T02-recent`.
- Depends on: B1-T15, B1-T18, B1-T21 (browser checks), B3-T01. This task removes the old `buildings.ts` exports and the old dialog (kept by B1-T18 until now).

**B3-T03 ui: levels.**
- Files: `ManageBuildingsDialog.tsx` or a new `BuildingLevelsPane.tsx`, tests.
- Shapes: list of levels with name input, elevation input (mm, a number with a unit label), up and down buttons, delete button (disabled with a reason when the level has sheets). Add level button. Every change calls `update`.
- Verify: UI tests; browser check by typing into the real inputs and pressing Enter and Tab (rules.md section 3, rule 5); the order survives a reload of the dialog. Screenshot `B3-T03-levels`.
- Depends on: B3-T02.

**B3-T04 ui: add PDFs and assign pages.**
- Files: `packages/ui/src/components/BuildingSheetsPane.tsx` (new), `packages/ui/src/buildingPdfInfo.ts` (new), tests.
- Shapes: "Add PDFs…" uses `fileAccess.openFile(PDF_FILE_TYPES)` (one file at a time; desktop also offers `pickFolder` plus `readFolder` to add a folder of PDFs: `readFolder(folder, ['pdf'])` returns the `File[]` of the top level). For each file, `readPdfInfo(file, engine): Promise<{ pageCount: number; projectUuid: string | null }>` opens it with `engine.openDocument`, calls `getPageCount()` and `getEmbeddedFile('mepapp-project.json')`, reads only `projectUuid` from the JSON text (a small parser in `core`: `readProjectUuidFromJson(text)`), then `close()`. The pane shows each PDF as a row with its pages and a level select for each page. Choosing a level calls `addSheets` or `moveSheet`. A PDF with more than 20 pages is collapsed.
- Do not touch: `openPdfFile`; the opened document list.
- Verify: UI tests for `readPdfInfo` with a stub engine; browser check with the two tracked fixtures (each has 1 page): add both, assign them to two levels, the sheet count shows 2. A real 2-page file is needed to prove the per-page select (G14 of the spec): NEEDS_CONTEXT for that part. Screenshots `B3-T04-assign`.
- Depends on: B3-T03.

**B3-T05 ui and platform: go to sheet.**
- Files: `ManageBuildingsDialog.tsx`, `App.tsx` (a callback `onOpenSheet(sheet)`), tests. `readPath` and `statPath` already exist from B1-T17 (moved there on purpose: B2-T06 needs them before B3).
- Shapes: on desktop, "Open" on a sheet calls `readPath(sheet.location.path)`, then `openPdfFile(file, target)` (`App.tsx:593`), then `handleChangePage(sheet.pageIndex)` (`:523`) after the document is active. On web the store keeps a handle: `FileAccess` gets the handle through the web store; if no handle or no permission, the row says "Pick the file again" and runs `openFile`. If the document is already open, `openPdfFile` switches to its tab (`:598-605`).
- Do not touch: the dedup key.
- Verify: browser check: open Level 1's sheet from the dialog; the status bar shows the right file and page; a second click does not open a second tab. Screenshot `B3-T05-open`.
- Depends on: B3-T04.

**B3-T06 ui: sheet status, relink and the copy/move dialog.**
- Files: `packages/ui/src/buildingStatus.ts` (new, pure: `sheetStatusOf`), `ManageBuildingsDialog.tsx`, `packages/ui/src/components/DuplicateDocumentDialog.tsx` (new), `App.tsx` (the hook point after `loadFromPdf`, `:623`), tests.
- Shapes: `sheetStatusOf(sheet, probe: { found: boolean; sizeBytes?: number }, summary: { savedAt: string; sourceSizeBytes: number } | undefined): SheetStatus`. Each row shows a status icon and text. The status comes from `fileAccess.statPath` (B1-T17): `'missing'` and `'no-access'` are two states with two texts. A `no-access` sheet has a "Grant access…" button (desktop: `pickFolder`, which adds the folder to the fs scope; per the spike B1-T16 it may need `recursive: true`) and then a new `statPath`. A missing sheet has a "Relink…" button (`openFile`, then `relinkSheet`; if the picked file has another `projectUuid` it asks first). After a document opens, `findSheets` (B1-T14) runs; verdict `moved` patches the location silently and shows a status line; verdict `copy` or `unclear` opens the dialog "This file looks like a copy of <name>" with the choices "Use as a copy (new id)" (calls `assignNewProjectUuid`, B1-T04) and "It is the same file (update the location)" and "Cancel".
- Do not touch: `window.confirm` (not allowed in `ui`, `rules.md` section 1). The dialog is a `Dialog`.
- Verify: UI tests for `sheetStatusOf` (every state); browser check: delete the OPFS copy of one fixture, the row turns to "PDF missing"; relink to the same file, it turns to ok. Copy case: save the same fixture under another name in OPFS, open it: the dialog shows. Screenshots `B3-T06-missing`, `B3-T06-copy`.
- Depends on: B3-T04, B1-T14.

**B3-T07 ui: current sheet in the status bar and the header.**
- Files: the status bar component fed by `pageIndex` (`App.tsx:1627`), a pure `currentSheetLabel(building, projectUuid, pageIndex): string | null` in `packages/ui/src/buildingStatus.ts`, tests.
- Shapes: when the shown page is a sheet of the open building, show "<Building> / <Level> / <display name>". Nothing is shown otherwise.
- Verify: browser check with the two-sheet building: the label changes when the document tab changes. Screenshot `B3-T07-label`.
- Depends on: B3-T04.

**B3-T08 ui: Rebuild summaries button and summary list.**
- Files: `ManageBuildingsDialog.tsx`, `App.tsx` (wiring of `rebuildSummaries` from B2-T06), tests.
- Shapes: button "Rebuild summaries" with a progress line "3 of 8: A101.pdf" and a Cancel (`AbortController`). The result lists the failed sheets with the reason. Each sheet row shows "summary saved <date>" or "no summary", and the scale as "1:N" from the summary (read only; the scale of a closed sheet is edited in the open document: deferred on purpose, see B2 section 4).
- Verify: browser check: build the summaries of the two fixtures; the rows change from "no summary" to a date; cancel stops the run. Screenshot `B3-T08-rebuild`.
- Depends on: B2-T06, B3-T06.

**B3-T09 ui: the old registry import prompt.**
- Files: `ManageBuildingsDialog.tsx`, `buildings.ts`.
- Shapes: if `mepapp.buildings.v1` holds buildings, the dialog shows one line "Import N old buildings" that makes building files with levels and no sheets (B1-T18 `importOldRegistry`). The user picks where to save each file. After the import the old key stays.
- Verify: browser check with a localStorage seed. Screenshot `B3-T09-import`.
- Depends on: B1-T18, B3-T02.

**B3-T10 part check.**
- Files: `<work>/b3-check.mjs`.
- Verify: from an empty profile: create a building, add two levels with elevation 0 and 3000, add the two fixtures, assign, rebuild summaries, open a sheet, delete and relink, close and reopen the dialog from the recent list. All with real clicks and typing. Screenshots of each step. Core and UI tests, typecheck, `pnpm build --force`.
- Depends on: B3-T09.

## 6. Open decision for B3 (director default)

**D-B-17** (director, easy to reverse): where do unassigned pages live? Options: A. Only in the dialog state (recommended: `sheets` stays the one source of truth and each sheet has a level). B. As `levelId: null` entries in the file. Reason for A: B lets every reader (takeoff, riser) check for a null level.

## 7. Order and parallel work

T01 first. T02, then T03 and T04 in order. T05, T06, T07 after T04 (they touch different files except `ManageBuildingsDialog.tsx`: run one after another). T08 needs B2-T06. Web: T05 on web depends on the web store (B1-T19); until then the web build shows "Desktop only" on "Open" and still lets the user make levels and assign (D-B-16).

## 8. Where B3 stops

B3 ends with a working dialog and a labelled status bar. B4 adds the Risers tab and the riser tools. B3 leaves a clear place for them: a tab strip in the dialog with "Levels and sheets" now and "Risers" later.
