# B2 plan: sheet summaries and the Level and Building takeoff

Status: planned 2026-10-31 by the road map planner. Not started. Not audited.
Origin: `buildings-levels-sheets-spec.md`, sections 3.3, 4.1, 5. Decisions D-B-03 (answered) and D-B-08 A (answered: `PlacedStamp.pageIndex`) apply. Decided: D-B-10 A (one summary file for each project; user, 2026-10-31). Director default: D-B-15 (one workbook).
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. Line numbers can move.
Terms: as in the spec, section 0. **Scope**: what the takeoff counts. This, Document, Level or Building.

## 1. Goal

After B2 the user opens "Export quantities" and picks a scope: This sheet (the shown page), This document, Level, Building. Level and Building read the saved summaries, so no second PDF opens. A missing PDF, a missing summary or an old summary gives a warning on the Warnings sheet. One workbook has the columns Building, Level, Sheet and Document.

Example: Level 0 holds `00_arch_ground_floor.pdf` p1, Level 1 holds `01_arch_first_floor.pdf` p1. Scope "Building" gives the segment rows of both files, each row marked with its level. If the first floor PDF is deleted from disk, its rows still come from the summary and a warning says so (D-B-03).

B2 stops where the building has no dialog. B2 tests the scopes with a building file that a script or a test writes. B3 builds the dialog that makes the file. B4 adds the riser rows.

## 2. What exists now

| Fact | Source |
|---|---|
| `buildQuantityTables(input)` builds the tables of one document; the type `QuantityInput` | `packages/core/src/quantities.ts:20-36`, `:81` |
| Network labels are numbered per call and per type; ids repeat between documents | `quantities.ts:86-104` |
| Length needs `calibrationOf(page)`; a page without a scale gives a blank and a warning | `quantities.ts:106-135` |
| Stamp tables have no `Page` column; custom property columns differ per document | `quantities.ts:144-173`, `:51-78` |
| The xlsx writer takes `QuantityTable[]` and needs no change | `packages/ui/src/quantitiesExport.ts:7-20` |
| The export handler builds the input from the scene, adds a Warnings sheet, calls `saveFileAs` | `packages/ui/src/App.tsx:803-843` |
| The engine can open a PDF from bytes and read the embedded JSON | `packages/pdf-engine/src/index.ts:128-155` |
| `loadProject(raw)` returns a `ProjectDocument` without a scene | `packages/core/src/project.ts:435` |
| Stamp definition lookup with a custom list | `getStampDefinition(id, definitions)` used at `App.tsx:820-825` |
| B1 gives `projectUuid`, `PlacedStamp.pageIndex`, `BuildingFile`, `BuildingStore` | `buildings-b1.md` |

## 3. Research (what MepApp can use)

- The old takeoff: `TakeoffCollector` resolves a scope to sheets (`ResolveSheets`, `FindOwner`, `ResolveScale`); the open document comes from memory and the others from saved JSON; a missing sheet gives a warning (`MepSketcherTools/Services/Takeoff/TakeoffCollector.cs:81`, `:131`, `:187`). MepApp copies the shape: resolve the scope to sheets, take each sheet's rows, warn for a gap. MepApp differs: the "saved JSON" is a summary file, and the output is one xlsx workbook (the old one wrote CSV, `CsvTakeoffWriter.cs`).
- Merging tables: a pivot in Excel needs the same header in the same column. Custom property columns differ by document. The merge unions the headers by name and fills blanks. A name clash with a fixed header is already handled by `withCustomColumns` (" (custom)").
- Not verified: how the old app numbers networks across sheets. B2 keeps the label per sheet and adds `Document` and `Sheet` columns, so two "Supply air 1" rows stay distinguishable.

## 4. The model

Types are in the spec, section 3.3 (`SheetSummary`). B2 adds:

```ts
// packages/core/src/quantities.ts
export interface QuantityInput {
  // ...existing...
  /** Count only elements on these 0-based pages. Absent = every page. */
  pages?: ReadonlySet<number>;
}
export interface QuantityProvenance { building: string; level: string; sheet: string; document: string }

// packages/core/src/sheet-summary.ts (new)
export function buildSheetSummary(args: { project: ProjectDocument; savedAt: string; sourceSizeBytes: number; stampTypeName: (id: string) => string | null; stampImageName: (id: string) => string | null }): SheetSummary;
export function parseSheetSummary(raw: unknown): SheetSummary;        // throws SheetSummaryError
export type TakeoffScope =
  | { kind: 'building' }
  | { kind: 'level'; levelId: string };
export interface TakeoffSheetStatus { sheetId: string; state: 'ok' | 'no-summary' | 'old-summary' | 'pdf-missing-using-summary' | 'pdf-no-access-using-summary' | 'unreadable' }
export function buildBuildingTakeoff(args: {
  building: BuildingFile;
  scope: TakeoffScope;
  summaryOf: (projectUuid: string) => SheetSummary | undefined;
  /** From `FileAccess.statPath` (B1-T17). Without `statPath` (web) the state is 'no-access'. */
  statusOf: (sheet: BuildingSheet) => { state: 'ok' | 'missing' | 'no-access'; sizeBytes?: number; modifiedMs?: number };
}): { tables: QuantityTable[]; warnings: string[]; sheets: TakeoffSheetStatus[] };
```

How the rules apply:
- Rule 1 and 2: B2 reads types and networks; it changes nothing. The network label stays per document. `computeNetworks` runs per document inside `buildSheetSummary` (as `buildQuantityTables` does now).
- Rule 4 (adoption): the summary stores the type name text (`typeName`), taken from the document's own `networkTypes`. A segment with an unadopted type id shows its id text, as today (`quantities.ts:84`). B2 does not hide that. It adds a warning "type X is not adopted in <document>" if cheap (not required).
- Rule 3: `buildSheetSummary` calls `buildQuantityTables`; it does not copy it.
- Stale data: a summary has `sourceSizeBytes` and `sourceModifiedMs`. If the PDF exists and its size differs, or its modification time is later than `sourceModifiedMs`, state `old-summary`.
- The scale of a sheet that is not open: it is in the summary (`pages[...]`, in points per mm). B2 shows it in the warnings ("page has no scale"). B3-T08 shows it as "1:N" in the sheet rows (`scaleDenominatorFromCalibration`, `calibration.ts:88`). B2 and B3 do **not** edit the scale of a closed sheet: the scale lives in the project and the user sets it in the open document. This is a deliberate deferral; the old app's per-sheet override (`BuildingSheetRef.Calibration`) is not built.

How this part keeps scale honest: lengths come from the calibration of the page inside the summary rows. A page without a scale keeps its blank and its warning, text prefixed with the sheet name ("Floor plan.pdf p2: ...").

## 5. Phases and tasks

Common verification: `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test` when `ui` changes, `pnpm build`, and the browser check where written. Screenshots to `/tmp/mepapp-shots/` named `<task id>-<name>`.

### Phase 1: the builder in core (needs B1-T01, B1-T06)

**B2-T01 core: page filter and Page column for stamps.**
- Files: `packages/core/src/quantities.ts`, `packages/core/src/quantities.test.ts`.
- Shapes: `QuantityInput.pages?`; elements of other pages are left out of all tables and out of the network numbering. Stamp tables get a `Page` column first (1-based) like the segment table. Circuits and panels are not paged: a circuit label is kept if its terminal stamp is kept.
- Do not touch: the order of existing columns after `Page`; the xlsx writer.
- Verify: core tests: a document with stamps and segments on pages 0 and 1; `pages: new Set([1])` gives only page 2 rows; with no `pages` the old tests pass (update their expected headers for the added `Page` column).
- Depends on: B1-T06.

**B2-T02 core: merge tables with provenance.**
- Files: `packages/core/src/quantities-merge.ts` (new), test file.
- Shapes: `mergeQuantityTables(parts: { provenance: QuantityProvenance; tables: readonly QuantityTable[] }[]): QuantityTable[]`. The result has one table for each name (`Segments`, `Terminals`, `Equipment`, `Fittings`); headers: `Building`, `Level`, `Sheet`, `Document`, then the union of the other headers in order of first use; blank cells fill gaps; a part's `Page` rows are kept.
- Do not touch: `buildQuantityTables`.
- Verify: core tests: two parts with different custom columns merge with blanks; same ids from two documents stay as two rows; a header named like a provenance header gets " (custom)".
- Depends on: B2-T01.

**B2-T03 core: `SheetSummary` type, build, parse.**
- Files: `packages/core/src/sheet-summary.ts` (new), `packages/core/src/index.ts`, test file.
- Shapes: section 4. `buildSheetSummary` calls `buildQuantityTables` for all pages. `pages[key]` holds `calibrated` and `pageUnitsPerRealUnit` from `project.calibrations`. `parseSheetSummary` refuses a newer `version`.
- Verify: core tests: build from a `ProjectDocument` made from a real fixture saved JSON if one exists in the repo (search `fixtures/` for a `.json` project; if none, build the document in the test with the factory helpers of `quantities.test.ts`); round trip through JSON. A test proves the calibration unit: a calibration from `calibrationFromScale(100)` has `pageUnitsPerRealUnit === PT_PER_MM / 100` and `scaleDenominatorFromCalibration` returns 100. The summary parse chain starts with a 0 to 1 identity step (B1 section 4). `pages[...].widthPt/heightPt` are the **displayed** size after the page's own rotation (the riser mm flip in B4 needs `heightPt`; spec section 3.4); a test builds the summary of a page with a swapped size.
- Depends on: B2-T01, B1-T01.

**B2-T04 core: `buildBuildingTakeoff`.**
- Files: `packages/core/src/building-takeoff.ts` (new), test file.
- Shapes: section 4. Steps: pick the sheets of the scope (all sheets for Building, `levelId` for Level); group by `projectUuid`; for each document read its summary; filter its rows to the pages of the chosen sheets (a row's `Page` column, 1-based); add provenance (Building name, Level name, sheet display name, document file name); merge with `mergeQuantityTables`. Warnings (text in English, one line each):
  - `no-summary`: "<sheet>: no saved summary. Open the file in MepApp and save it, or use Rebuild summaries. Left out."
  - `old-summary`: "<sheet>: the PDF changed after the summary was saved (<date>). The rows may be old."
  - `pdf-missing-using-summary`: "<sheet>: PDF not found. Using the summary saved <date>." (D-B-03)
  - `pdf-no-access-using-summary`: "<sheet>: MepApp may not read the PDF (no access). Using the summary saved <date>. Use Grant access in Manage Buildings."
  - A sheet with `projectUuid: null`: "<sheet>: the document has no id yet. Open it in MepApp and save it." and it is left out.
  - Circuit across levels (D-B-20 A): when the Terminals rows of one circuit label come from more than one level in the Building scope, warn "Circuit <label> has terminals on levels <a>, <b>. No vertical cable length is counted." Not verified: whether circuit labels repeat between documents; the warning keys on (document, label).
  - Pages of the document not assigned to this scope are not warned about.
  - Each warning of the summary is copied with the sheet name in front.
- Verify: core tests for every state; a Level scope with sheets on two levels counts only its level; a page assigned to no level is absent from the Building scope.
- Depends on: B2-T02, B2-T03, B1-T13.

### Phase 2: writing and rebuilding summaries (needs B1-T15 and B1-T17)

**B2-T05 ui: write the summary on Save.**
- Files: `packages/ui/src/App.tsx` (in `saveDocument`, after a successful write, `:727-763`), `packages/ui/src/buildingContext.ts` (new: `summaryAfterSave(scene, building, store)`), test file.
- Shapes: after a Save, if a building is open and `findSheets` (B1-T14) matches the document (by id, else path), call `buildSheetSummary(...)` from `scene.exportProject()` (`scene.ts:4201`) and `store.writeSummary(projectUuid, JSON.stringify(summary))`. If the match has `projectUuid: null`, patch it with `withProjectUuid` and write the building file with the revision rule. A failure shows a status line and does not undo the Save.
- Do not touch: the PDF bytes, the order of the save steps.
- Verify: UI test with the memory store; browser check: with a building made by script (two sheets), Save writes a summary (read it from the store); screenshot not needed.
- Depends on: B2-T03, B1-T04, B1-T14, B1-T15.

**B2-T06 ui: "Rebuild summaries".**
- Files: `packages/ui/src/rebuildSummaries.ts` (new), a test file, a status line in `App.tsx` (the dialog button comes in B3-T08).
- Shapes: `rebuildSummaries(args: { building: BuildingFile; engine: PdfEngine; read: (sheet: BuildingSheet) => Promise<File | undefined>; store: BuildingStore; onProgress: (done: number, total: number, name: string) => void; signal: AbortSignal }): Promise<{ ok: number; failed: { sheet: BuildingSheet; reason: string }[] }>`. For each distinct document: read the file, `engine.openDocument(bytes)`, `getEmbeddedFile('mepapp-project.json')`, `loadProject`, `buildSheetSummary`, `writeSummary`, `handle.close()`. One document at a time (memory). A document with no embedded project is a failure "never saved in MepApp".
- Do not touch: `pdf-engine` interface; nothing imports `mupdf`.
- Verify: UI test with a stub engine that returns a saved JSON; browser check: rebuild with the two tracked fixtures after saving each once; progress text reaches 2 of 2.
- Depends on: B2-T03, B1-T15, B1-T17 (`readPath`, `statPath`; this removes the old order cycle with B3-T05). The reader `read` is `fileAccess.readPath`; a result of `undefined` is a failure with the reason from `statPath` ("missing" or "no access").

### Phase 3: the scope in the Export (needs B2-T04)

**B2-T07 ui: scope choice in Export quantities.**
- Files: `packages/ui/src/App.tsx` (`handleExportQuantities`, `:803`), `packages/ui/src/components/QuantitiesScopeDialog.tsx` (new, uses `Dialog` with `closeOnBackdropClick={false}`), `packages/ui/src/quantitiesScope.ts` (new, pure: builds the tables for the scope), test file.
- Shapes: the dialog has a radio group: "This sheet", "This document", "Level" (a select of levels), "Building". Level and Building are disabled with a hint "Open a building first" when no building is open. This sheet uses `pages: new Set([scene.getPageIndex()])` (`scene.ts:1123`). This document is the current behavior. The open document's rows for Level and Building come from the live scene, not the summary, when the open document is a sheet of the scope (so unsaved edits count): `summaryOf(projectUuid)` returns a fresh `buildSheetSummary` for it. The Warnings sheet logic stays. The file name: `<building>-<level or all>-quantities.xlsx`.
- Do not touch: `quantitiesExport.ts`; the single-document tables when the scope is This document (same output as before B2, except the `Page` column that B2-T01 adds to the stamp tables; the old tests' expected headers change in B2-T01).
- Verify: UI tests for `quantitiesScope.ts`; browser check by real clicks on the radio buttons and Export; read the xlsx from OPFS and check the sheet names and the first headers `Building`, `Level`, `Sheet`, `Document`. Screenshots `B2-T07-dialog`, `B2-T07-dialog-nobuilding`.
- Depends on: B2-T04, B2-T05, B1-T21 (the dev-only web building store and the loader hook `window.__mepBuilding.load`). Before B3 exists, the check loads the building through that hook. The hook is for setup (`rules.md` section 3, rule 5), so the scope dialog itself is driven by real clicks. The text box for `Document` scope with no building stays enabled.

**B2-T08 ui: part check on real files.**
- Files: `<work>/b2-check.mjs` (not in the repo).
- Verify: build a building file by script from the two tracked fixtures (`00_arch_ground_floor.pdf`, `01_arch_first_floor.pdf`): draw one segment on each, calibrate, Save each; export Level 0 and Building. Assert: Building has the rows of both levels; Level 0 has only level 0 rows; delete one PDF from OPFS and export again: the warning "PDF not found. Using the summary" is on the Warnings sheet and the rows are still there (D-B-03). Screenshots `B2-T08-warnings`.
- Depends on: B2-T07.

## 6. Order and parallel work

T01 to T04 are core only and can run before B1 phase 4 is done, but they need `PlacedStamp.pageIndex` (B1-T06). T05 and T06 need the store. T07 needs T04 and T05. D-B-10 A is decided; D-B-15 A (one workbook) is a director default and easy to reverse. A later change of D-B-10 to a sub-folder (C) touches only the store (B1-T17), not B2.

## 7. Where B2 stops

B2 ends when Level and Building export works from a building file with summaries, with all four warnings. B3 starts with the dialog that makes and edits the building file. Riser rows and the `Building network` column come in B4.
