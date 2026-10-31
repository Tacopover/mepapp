# Spec: Buildings, Levels, Sheets, sheet summaries and risers

Status: written 2026-10-31 by the road map planner. Not yet audited. Decisions D-B-01 to D-B-08 are final (user, 2026-10-31). The user answered D-B-09 to D-B-14, D-B-18 and D-B-20 on 2026-10-31 (section 6): all decided. No decision of the user is open.
Branch: `worktree-buildings-model`, made from `worktree-quantities-export`. The quantities code (`packages/core/src/quantities.ts`, `packages/ui/src/quantitiesExport.ts`) is not on `master`.
Plans of the parts: `buildings-b1.md`, `buildings-b2.md`, `buildings-b3.md`, `buildings-b4.md`.
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. A line number can move after a later commit.

## 0. Terms

- **Document**: one PDF file with the project JSON that MepApp embeds in it (`mepapp-project.json`, `packages/render/src/scene.ts:239`).
- **Sheet**: one page of one document. Its key is (`projectUuid`, `pageIndex`). `pageIndex` is 0-based in MepApp. The old app used 1-based.
- **Level**: a floor of a building. It owns many sheets (D-B-02: one sheet belongs to exactly one level). It has an elevation in mm.
- **Building**: a name, a list of levels, a list of risers. It lives in the **building file**.
- **Building file**: a JSON file that the user puts anywhere (D-B-01 allows the PDFs anywhere; the building file follows the same rule). It stores for each sheet a location, not the PDF.
- **Sheet summary**: the saved takeoff rows and scales of one document. MepApp writes it when the user saves the document. The Level and Building takeoff read it, so no second PDF opens (D-B-03).
- **Riser**: one vertical run through levels. It has one anchor (x, y in real-world mm, D-B-14) and, for each level, the segments that end there (D-B-04, D-B-07 A).
- **Stamp the id**: write the `projectUuid` into the document and save the file.
- **Project id** (`projectUuid`): the UUID in the project JSON. It names the project across moves and renames. It is not the runtime id `doc-N` of `SketchDocument.id` (`packages/render/src/document.ts:91`) and not the `documentId` of the save receipt (`scene.ts:4460`). Every plan uses `projectUuid` for the saved id.

## 1. What the old app does (with citations)

Old source: `/root/MepSketcher` (checked 2026-10-31).

| Topic | Fact | Source |
|---|---|---|
| Model | Building has Levels. A Level has `Elevation` and many sheets. A sheet is `BuildingSheetRef`: `PdfPath`, `DocumentId`, `PdfHash`, `PageIndex` (1-based), `DisplayName`, a calibration, and a cached scale (`ScaleFactor`, `ScaleUnit`, `ScaleDecimalPlaces`, `ScaleUnitSymbol`). | `MepSketcherTools/MEP/Building/Building.cs:11`, `BuildingLevel.cs:11`, `BuildingSheetRef.cs:8-45` |
| Elevation | A number with a display meaning only (story height text). No riser uses it. The old app has no riser and no link between sheets. | `BuildingLevel.cs:18-23` |
| Registry | One file per install: `%LOCALAPPDATA%\MepSketcher\Buildings\buildings.json`, schema v2, with an optional backup copy in a shared folder named per user. Load falls back to the backup when the local file is bad. | `Services/BuildingRegistryService.cs:15-27`, `:63`, `:113` |
| Sheet match | A sheet with a `DocumentId` matches on that id alone. An older sheet matches on the hash of the normalized path. | `BuildingRegistryService.cs:268-281` (`SheetMatchesDocument`) |
| Re-key | After the id is stamped into the PDF and the PDF is saved, `RekeySheets` moves the sheets and the per-document project file from the path hash to the id. Order: write id, save PDF, then re-key. | `DocumentIdentityService.cs:140-147`, `BuildingRegistryService.cs:283-300` |
| Document id | A GUID in the PDF catalog under the key `MepSketcherDocId`. `TryReadDocumentIdFromFile` reads it without opening the file in the viewer. | `Services/DocumentIdentityService.cs:31-97` |
| Copy or move | `CheckForDuplicate` compares the path of the open file with the stored path. Same path: none. Stored file gone: Moved. Both exist and are two files: Copy. Same size and time: Inconclusive (ask the user). | `DocumentIdentityService.cs:153-178` |
| Management window | `BuildingManagementViewModel` (assign PDFs and pages to levels, unassigned PDFs list, relink at `:155`). | `MEPSketcher2/ViewModels/Building/BuildingManagementViewModel.cs:155`, `:209`, `:532` |
| Takeoff scope | `TakeoffScope` has Sheet, Level, Building. `TakeoffCollector.ResolveSheets` turns a scope into sheets. The open document is read from memory. Other documents are read from their saved project file. A missing sheet gives a warning. | `Services/Takeoff/TakeoffCollector.cs:81`, `:131`, `:187`; `MainWindowViewModel.cs:522-524`; `MainWindowViewModel.Dialogs.cs:235` |
| Other readers | `PdfManagerViewModel` (duplicate check at `:1135`) and `ToolCoordinatorViewModel` and `MousePositionService` also use the registry. Their use is not read in detail. Not verified: what `MousePositionService` does with a sheet. | file list from a search for `BuildingRegistryService` |
| Gaps of the old app | No reorder of levels. No "go to sheet" navigation. No riser. No cross-sheet link. | memory `project-buildings-levels-sheets-scoping`; not re-read in full |

What MepApp keeps from this: sheet = (document id, page); id first, path second; "moved" and "copy" verdicts; a registry with a schema version; takeoff scope resolved to sheets; a warning for a missing sheet.
What MepApp changes: the id sits in the embedded project JSON (no PDF catalog write, see 4.2); the registry is a user-placed file (D-B-01), not a per-install file; the summaries replace "read the other project JSON" because MepApp embeds the project in the PDF (opening a PDF with mupdf is too slow for hundreds of sheets).

## 2. Gap list

### 2.1 Facts in MepApp that block the model (verified in the code)

| # | Fact | Source |
|---|---|---|
| G1 | `PlacedStamp` has no `pageIndex`. D-B-08 A adds it. | `packages/core/src/stamp.ts:8-34` |
| G2 | **Segments, fittings and annotations carry `pageIndex` but every tool writes 0.** The draw tools hard-code it. The scene shows all elements on every page. Page navigation is view-only. Only rooms use the shown page. | `packages/render/src/tools/drawSegmentTool.ts:123`, `:160`; `drawPolylineTool.ts:46`; `drawTextboxTool.ts:19`; `drawStickyNoteTool.ts:16`; `drawLineTool.ts:22`; `drawFreehandTool.ts:32`; `drawHighlightTool.ts:45`; `drawShapeTool.ts:56`; `packages/render/src/scene.ts:1092-1120` (comment at `:1096`); `packages/render/src/document.ts:96-97` |
| G3 | The PDF annotation sync reads and writes page 0 only. | `packages/render/src/scene.ts:4440`, `:4480` (`listAnnotations(0)`); `:4607` |
| G4 | The project JSON has no document id. Schema is v21. The last step (20 to 21) only advances the number. The runtime id `doc-N` counts documents in the session and is not saved. | `packages/core/src/project.ts:22`, `:331-341`; `packages/render/src/document.ts:81`, `:91` |
| G5 | Calibration is per page and saved (`calibrations`, key = page index as text). `getCalibration(pageIndex)` takes a page. | `packages/core/src/project.ts:51-52`, `:367-376`; `scene.ts:2365`; `:4225` |
| G6 | `ConnectionPoint` is `fitting` or `port`, both by id inside one document. No form crosses a page or a document. | `packages/core/src/network.ts:50-52` |
| G7 | `buildQuantityTables` works on one document: element ids repeat between documents, network labels ("Supply air 1") restart for each call, `calibrationOf(page)` has no document. | `packages/core/src/quantities.ts:20-36`, `:81-104`, `:112` |
| G8 | The export button uses the open document only. | `packages/ui/src/App.tsx:803-843` |
| G9 | The building registry is a list in `localStorage` (`mepapp.buildings.v1`). A level holds one document file name. It matches by file name. | `packages/ui/src/buildings.ts:10-23`, `:48-57`; `packages/ui/src/components/ManageBuildingsDialog.tsx:21`; `App.tsx:413`, `:516-518` |
| G10 | `ProjectStore` is a provisional interface with a memory implementation and no user. Its key is `{ pdfName, locationId? }`. It holds one JSON string with a revision. | `packages/platform/src/project-store.ts:3-14`; `packages/platform/src/memory/memory-project-store.ts` |
| G11 | `FileAccess` can open one file (`File` plus a `target`), write to a target, save as, pick a folder, and list a folder (top level, returns `File[]`, no write handle). It cannot write a named file into a folder. | `packages/platform/src/file-access.ts:36-51`; `packages/platform-tauri/src/tauri-file-access.ts:70-91` |
| G12 | Tauri reads and writes only paths in the fs scope. The dialog adds picked paths. The persisted-scope plugin keeps them. `pickFolder` passes `recursive: false`. The capability file has `fs:allow-read-file`, `allow-write-file`, `allow-read-dir`, `allow-stat` only (no `mkdir`, no `remove`). | `tauri-file-access.ts:40-42`, `:72`; `apps/desktop/src-tauri/capabilities/default.json:12-15`; `apps/desktop/src-tauri/src/lib.rs:22-23`, `:61-63` |
| G13 | The engine interface can read an embedded file and open a PDF from bytes. So a headless read of the project JSON of a PDF needs no scene and no interface change. | `packages/pdf-engine/src/index.ts:128-155` |
| G14 | All 9 PDFs in `fixtures/pdfs/` have one page. A real multi-page fixture does not exist (R2 report, `auto-routing-r2.md` status). | `.claude/plans/auto-routing-r2.md:5` |

G2 is the largest finding. D-B-02 says one PDF has many pages on different levels. That is false in the data until the tools write the real page and the view filters by page. So B1 includes a phase "Pages are real".

### 2.2 Old features that MepApp lacks (not shipped, ranked)

Source: `.claude/plans/ui-atlas-layout-mapping.md` (rows "Manage Buildings…", "Export Takeoff to CSV", "Duplicate Document / Missing Image" at `:124-125`, `:152`) and memory `project-feature-atlas-priority-order`. Items already shipped (Global Properties, copy and paste, labels, Excel quantities for one document, rooms) are not repeated.

| Rank | Feature | Depends on the building model? | Part |
|---|---|---|---|
| 1 | Takeoff scopes Level and Building (the first goal) | Yes | B1, B2 |
| 2 | Per-sheet scale cache and a scale for a sheet that is not open | Yes (summary holds it) | B2 |
| 3 | Duplicate Document / Missing Image dialogs (copy verdict, relink) | Yes (identity) | B1, B3 |
| 4 | Building management with many sheets per level, elevation, unassigned PDFs | Yes | B3 |
| 5 | Go to sheet (open a sheet from the building). The old app lacks it | Yes | B3 |
| 6 | Real multi-page documents (elements per page) | The model needs it | B1 |
| 7 | Risers between levels. The old app lacks it | Yes | B4 |
| 8 | Extract Images, Create Connection, live coordinate readout, legal page, update banner | No | out of scope |

Rows 8: the user deferred Extract Images (2026-09-09, memory `project-feature-atlas-priority-order`). The rest do not need the model.

## 3. Proposed data model and where it lives

### 3.1 In the project JSON (package `core`, schema v22)

```ts
// packages/core/src/project.ts
export const CURRENT_SCHEMA_VERSION = 22;
export interface ProjectDocument {
  // ...existing fields...
  /** UUID v4. Made when the document first loads without one. Absent only in a file saved before v22. */
  projectUuid?: string;
}
// packages/core/src/stamp.ts
export interface PlacedStamp {
  // ...existing fields...
  /** 0-based page of the PDF that the stamp sits on. */
  pageIndex: number;
}
```

One migration step 21 to 22: it sets `pageIndex: 0` on each stamp that has none. It does not make a `projectUuid`: a migration is pure and runs on each load, so an id made there would differ on each load of the same file. The scene makes the id at load (B1-T04) and saves it with the next Save.
A file with schema v22 refuses to open in an older MepApp (the existing rule of `migrateToLatest`, see the v21 step comment at `project.ts:334-336`).
Existing multi-page files: elements were saved with `pageIndex: 0` whatever page was shown (G2). They all stay on page 1. This cannot be repaired. See D-B-12.

### 3.2 The building file (package `core` owns the type, `platform` stores it)

```ts
// packages/core/src/building.ts (new)
export const BUILDING_SCHEMA_VERSION = 1;
export interface BuildingFile {
  schemaVersion: number;
  id: string;                 // UUID, stable when the file is copied or renamed
  name: string;
  levels: BuildingLevel[];    // order = display order
  sheets: BuildingSheet[];    // all sheets; each names its level
  risers: Riser[];            // B4. Empty before B4. See 3.4.
}
export interface BuildingLevel { id: string; name: string; elevationMm: number }
export interface BuildingSheet {
  id: string;                 // UUID of this entry
  levelId: string;
  projectUuid: string | null;  // null until the document has been saved by MepApp with an id
  pageIndex: number;
  displayName: string;        // for example "Floor plan.pdf p2"
  location: SheetLocation;
}
export interface SheetLocation {
  fileName: string;
  /** Desktop: absolute path. Web: absent (the handle is in the browser store). */
  path?: string;
  /** Path relative to the folder of the building file. A hint when the whole folder moves. */
  relativePath?: string;
  sizeBytes?: number;         // size at the last save, a weak check for "the file changed"
}
```

Rules:
- A page belongs to one level (D-B-02). `sheets` has at most one entry for each (`projectUuid`, `pageIndex`). With `projectUuid: null` the entry is unique for (`location.path`, `pageIndex`).
- Level order is the order of `levels`. The user can also sort by elevation.
- Calibration is not in the building file. It lives in the project JSON (G5) and is copied into the summary. One truth for the scale: the document. This avoids the old app's second copy (`BuildingSheetRef.ScaleFactor`, a mirror that the old code itself calls "display-only").

### 3.3 The sheet summary (one per document)

```ts
// packages/core/src/sheet-summary.ts (new)
export const SHEET_SUMMARY_VERSION = 1;
export interface SheetSummary {
  version: number;
  projectUuid: string;
  savedAt: string;            // ISO time
  sourceSizeBytes: number;    // size of the PDF that the summary was made from
  sourceModifiedMs: number;   // modification time of the PDF when the summary was made
  /** key = page index as text. pageUnitsPerRealUnit = PDF points per millimeter (calibration.ts:56; the real unit is mm). */
  pages: Record<string, { calibrated: boolean; pageUnitsPerRealUnit: number | null; widthPt: number; heightPt: number /* width and height as displayed, after /Rotate; the riser mm flip uses heightPt */; rotationDegrees: number }>;
  tables: QuantityTable[];    // the tables of buildQuantityTables for the whole document; each row has its page
  warnings: string[];
}
```

A summary is old when the PDF size differs from `sourceSizeBytes` or the PDF modification time is later than `sourceModifiedMs`. Not verified: that `Calibration` is in mm for every file; `calibration.ts:56` says "e.g. millimeters", and `calibrationFromScale` uses `PT_PER_MM` (`:84`), so the plan treats it as mm. B2-T03 adds a test that proves the unit with `scaleDenominatorFromCalibration`.
A summary is for a whole project (one PDF), not one page. The Level scope picks the rows of the pages that belong to the level. Reason: a save writes one file, and the user may move a page to another level without a new summary.

### 3.4 The riser (B4)

```ts
export interface Riser {
  id: string;
  name: string;
  shaftName?: string;                        // optional name of the physical shaft, for the takeoff
  networkTypeId: string;                     // the one type of the whole riser
  networkType: NetworkType;                  // a copy, so another document can adopt it (see below)
  anchorMm: { xMm: number; yMm: number };    // real-world mm, the same on every level (D-B-04, D-B-14). The source of truth. Rounded to 0.01 mm when stored.
  flow: 'up' | 'down' | 'both' | 'unknown';  // D-B-18. Default 'unknown'.
  sourceLevelId?: string;                    // the level where the flow starts, when known
  topEnd: 'member' | 'open';                 // 'open' = a riser end with no member (roof or ground): length unknown or set by the user
  bottomEnd: 'member' | 'open';
  endAllowanceMm: number;                    // fitting allowance added at each closed end. Default 0.
  members: RiserMember[];                    // at most one per level
  pending: RiserPendingOp[];                 // changes that a closed document has not applied yet
}
export interface RiserMember {
  levelId: string;
  sheetId: string;                           // BuildingSheet.id
  fittingId: string;                         // the fitting at the anchor in that document. Segments are found at run time (the segments that end at this fitting), never stored.
  connectionHeightMm?: number;               // height of the connection above the floor of its level. Default 0.
}
export interface RiserPendingOp { seq: number; sheetId: string; kind: 'move' | 'retag'; toMm?: { xMm: number; yMm: number }; networkTypeId?: string }
```

Why `fittingId` only (audit finding 7): a list of segment ids goes stale when the user inserts a fitting or splits a segment (`scene.ts:1460`). The fitting is the one stable thing. D-B-07 A says "the list of segments on each level"; the plan derives that list from the fitting. This is a change of form, not of the decision.
Why a `networkType` copy (finding 8): a closed or newly opened document may not have the type. Before a retag or an attach, the scene calls `adoptNetworkTypes([id], [riser.networkType])` (`scene.ts:2529`, second argument = copies). The adoption trap of `rules.md` section 3 rule 4 is then closed for each member.
Fitting marker (domain finding): a riser fitting stays a plain `Fitting` of kind `junction`. No new `FittingKind`, so no schema step in the project JSON. The Fittings table gets a column `Riser` (name or blank) from the building file (B4-T08).

**The anchor is in real-world mm (D-B-14, user answer 2026-10-31).** Conversion, in `core` (`packages/core/src/riser-coords.ts`, B4-T02):
- `xMm = xPt / ppmm` and `yMm = (pageHeightPt - yPt) / ppmm`, with `ppmm = pageUnitsPerRealUnit` (points per mm, `calibration.ts:56`, `:84`) and `pageHeightPt` = the height of the **displayed** page. The reverse: `xPt = xMm * ppmm` and `yPt = pageHeightPt - yMm * ppmm`.
- The origin is the **bottom-left corner of the displayed page**, with y pointing **up** (D-B-23, user, 2026-10-31: "Bottom left corner of the pdf. That way the y up is positive, just like CAD apps"). The scene works in pt with the origin at the top-left and y down (`scene.ts:1100` sizes the backdrop at 0,0), so the conversion flips y with the page height. The origin is not the CAD drawing origin and not the PDF crop box origin in its raw frame.
- **Rotated pages.** The "displayed page" is the page after its own `/Rotate` entry (`PageInfo.rotationDegrees`, `packages/pdf-engine/src/index.ts:4`). The conversion takes the displayed width and height as arguments and never reads the rotation. For a page with `/Rotate` 90 or 270 the caller passes the swapped size, so the bottom-left corner is the bottom-left of what the user sees. Not verified: whether `PageInfo.widthPt/heightPt` are already post-rotation; the scene's backdrop size (`setBackdropPage` `pageWidthPt/pageHeightPt`, `scene.ts:1100`) is what the user sees, so B4 reads the height from the backdrop (`scene` getter, B4-T04) and not from `PageInfo`. There is no rotated fixture in `fixtures/pdfs/`; the proof is a core test with the swapped size, and a real-file check when the user gives a rotated PDF (NEEDS_CONTEXT, like the multi-page fixture).
- A page without a calibration cannot take part. `makeRiser` and `attachMember` refuse with the message "Set the scale of this page first." (`scale-unknown`).
- Rounding: the mm value is the source of truth and is rounded to 0.01 mm once, when the user makes or moves the riser. Each other level gets `pt = mm * pageUnitsPerRealUnit` without rounding. The level where the user dropped the fitting keeps its own pt value. A member is "in conflict" only when the fitting, converted to mm, differs from the anchor by more than 0.5 mm.
- Page size check (reduced): `attach` does not compare points or rotation. It compares the two page sizes **in mm** (width and height after calibration). If they differ by more than 1 %, it still attaches and shows a warning: "Page sizes differ: the sheets may not line up."
- **Known limit, until B5:** two sheets line up only if both PDFs put the building at the same place on the page, with the same orientation (same origin at the bottom-left of the displayed page, same rotation). Plans exported from one CAD model with the same sheet size and the same view usually do. Plans of different sizes or with a different view origin do not, and the riser then lands in the wrong place on one level. MepApp does not detect this. B5 (section 5.5) fixes it.

What the elevation measures (D-B-19, default): `BuildingLevel.elevationMm` is the height of the **finished floor** of the level above a common datum (mm). Negative values are allowed (a basement). Two levels with the same elevation give a warning (not an error). The riser length between two members is the elevation difference of their levels, plus the connection heights, plus the end allowances. Name of the number in the takeoff: "Floor-to-floor length". It is **not** the pipe or duct length: bends and offsets in the shaft are not counted.

### 3.5 Where it lives

| Data | Package | Storage |
|---|---|---|
| Types, parse, validate, migrate, match, duplicate verdict, summary merge, riser rules | `core` (pure, tested) | none |
| `BuildingStore` interface, memory implementation, contract suite | `platform` | none |
| Desktop store | `platform-tauri` | files on disk (building file and summary files in the folder of the building) |
| Web store | `platform-web` | file handles in IndexedDB. Last, optional (D-B-05) |
| List of recent buildings (id, name, where) | `ui` | `localStorage` (the key `mepapp.buildings.v1` is replaced, with a one-time import of the old shape) |
| The open building as UI state | `ui` | React state over the store |

`ProjectStore` does not fit: its key is the PDF name (not unique), it keeps one string for one key, and it cannot list. Its own comment says the shape may change (`project-store.ts:3`). So B1 adds `BuildingStore` and reuses the parts around it: `BaseStore` (`store.ts:10`), `checkRevision` (`revision.ts`), `StoreConflictError` (`errors.ts`), the memory store pattern and the contract suite pattern (`memory/`, `contract/`). `ProjectStore` stays as it is.

### 3.6 How the model keeps the domain rules (`rules.md` section 3)

1. **The segment defines the network type of a port.** No building data adds a type to a stamp or a port. A riser has a `networkTypeId`, but it is a link between segments, not a port. The riser type is checked against the types of its segments. It never writes a type onto a stamp.
2. **Cascade invariant.** Segments joined by a riser are connected across levels. A change of type on a run that touches a riser must change the riser and the runs on the other levels (B4, D-B-13). Until B4 ships, no riser exists, so nothing changes.
3. **Reuse before new.** Reuses `BaseStore`, revision, `FileAccess`, `getEmbeddedFile`, `buildQuantityTables`, the fitting drag and `computeNetworks`. The only new state is the building file and the summaries.
4. **Adoption trap.** A summary stores type names, not ids only, because documents hold their own `networkTypes`. Takeoff never needs the adoption call. B4 retag uses `adoptNetworkTypes` (`scene.ts`) when it sets a type on a segment of an open document.
5. **UI through the real DOM.** Every UI task has a browser check with real inputs.
6. **Merge lesson.** The branch carries the quantities code. After each merge, `pnpm build`.

## 4. Options for the hard parts

### 4.1 Read the data of sheets that are not open

| Option | Cost | Risk | Cannot do |
|---|---|---|---|
| **A. Saved summary per document, written on Save, plus a headless "Rebuild summaries"** (recommended) | Medium: a summary type, a writer in the Save path, a rebuild routine | A summary can be older than the PDF. The rebuild and a size check handle it | Show the live state of a document that another person changed after the last save from MepApp |
| B. Read the PDF on demand (open with mupdf, read the embedded JSON) | Low code, high time | Hundreds of PDFs at some MB each: minutes and memory (the container has 3.9 GB; the browser tab less) | Work on web with no file access |
| C. Require all documents open | Lowest code | Fails the goal (hundreds of PDFs) | Everything |

The rebuild in A is B run once on request, with progress and cancel. It needs only `pdf-engine` (`openDocument`, `getEmbeddedFile`, `getPageCount`, G13) and `core` (`loadProject`, `buildQuantityTables`). It needs no scene.

### 4.2 Document identity

| Option | Cost | Risk | Cannot do |
|---|---|---|---|
| **A. `projectUuid` in the embedded project JSON** (recommended) | Low: one field, one migration step, no engine change | A file that MepApp never saved has no id (fallback: path). A copy of a file has the same id (copy check) | Name a PDF that has no project JSON |
| B. GUID in the PDF catalog (old app) | High: the engine interface has no catalog write; a change touches `pdf-engine` and `pdf-engine-mupdf` | A change of the interface | Nothing more than A |
| C. Content hash | Medium | Changes on each save, so it cannot be a stable key | Identify a document after an edit |
| D. File name or path only | Lowest | A rename or move breaks the link | Survive a move |

Flow with A (copies the old order "stamp, save, then re-key"): the user adds a PDF to a building. The sheet gets `projectUuid: null` and the location. When MepApp opens that file (the path matches), the scene makes the id. The next Save writes it. The save hook then patches the sheet entry (`projectUuid` set). Before that, takeoff warns "no summary yet".
Other documents with an id: the add dialog reads the id headless (G13) and fills it at once.
Duplicate verdict (port of `CheckForDuplicate`, `DocumentIdentityService.cs:153`): the open file has an id that the building file lists with another path. Stored file gone: **moved** (patch the path). Both exist: **copy** (ask: "Use the copy as a new document"; it gets a new id at once). Same size and mtime: **unclear** (ask). `Save As` makes a new id (default, D-B-12... see section 6).

### 4.3 Multi-page documents and stamps with no page

| Option | Cost | Risk | Cannot do |
|---|---|---|---|
| **A. `pageIndex` on stamps, tools write the real page, the view filters by page** (decided, D-B-08 A) | Medium-high: 8 tool files, the view, snap, paste, PDF sync | A visible change for old multi-page files (all elements were saved on page 0) | Repair old files |
| B. Document-level scope only (rejected by D-B-08) | Low | Level scope cannot split a multi-page PDF | D-B-02 |
| C. Hidden: keep elements at page 0 and add a "sheet" tag in a map | Medium | Two truths for one fact | Reuse of `Segment.pageIndex` |

### 4.4 Where the registry lives

| Option | Cost | Risk | Cannot do |
|---|---|---|---|
| **A. A building file that the user places, plus summary files in the same folder** (recommended) | Medium: a `BuildingStore`, folder writes | Tauri scope (G12) and a missing `mkdir` permission. The spike B1-T16 settles it | Sharing on a hosted service (a shared drive such as OneDrive can carry the folder) |
| B. Per install registry (localStorage or app data), like the old app | Low | Not shareable, lost with the browser data; conflicts with D-B-01 (the user wants one building file) | Share a building between PCs |
| C. Hosted backend (for example Supabase) | High: account, network code, cost, offline | The AGPLv3 section 13 duty when a modified version runs as a network service, and the rule "no SaaS backend" (`rules.md` section 2) | Work offline |
| D. Inside one PDF | Low | A building of hundreds of PDFs has no main PDF | Everything |

Recommendation for D-B-05: **no backend.** The user already keeps files on OneDrive. A folder with the building file, shared by OneDrive, gives sharing for free. Web: file handles in IndexedDB and a read of the building file and summaries, last and optional.

Where the summary files go: inside the building file (one file) is easy but too large (about 150 KB for a sheet of 500 segments and 300 stamps, so about 30 MB for 200 sheets, and each Save rewrites it). So one file per project (one PDF), not per building, next to the building file. The file name and the store key are the same string: `<projectUuid>.summary.json` and `projectUuid`. Two buildings in one folder share the file, which is correct because the summary describes the PDF. The capability file has no `mkdir` (G12), so the files are flat in the folder. Alternative: add `fs:allow-mkdir` and use a sub-folder. See D-B-10.

## 5. Recommendation and phased plan

### 5.1 Order

1. **B1** Project identity, real pages, building file and stores, `statPath` and `readPath`, test set-up for `render`, a dev-only web store for checks. Everything else needs it. (B2-T06 needs B1-T17; B3 needs no B2 task, so there is no order cycle.)
2. **B2** Summaries and the Level and Building takeoff (first goal). Needs B1. It can run on two files by hand before B3 exists: B2 has its own minimal "Export scope" test with a building file made by a script.
3. **B3** Building management UI. Needs B1. Can run in parallel with B2 after B1-T15 (the store interface).
4. **B4** Risers (second goal). Needs B1, B2 (summary and riser rows), B3 (levels and sheets in the UI).

5. **B5 (later, deferred)** Shared coordinate system between sheets. Not planned in tasks. See 5.5.

### 5.2 What each part gives (the user's view)

- **B1.** Nothing new on the toolbar, except: elements now belong to the page that is shown (drawing on page 2 of a PDF no longer shows on page 1). A Save also stamps a document id. A building file can be created and read in code.
- **B2.** In Export quantities a scope choice: This sheet, This document, Level, Building. Example: an office block with `00_arch_ground_floor.pdf` as Level 0 and `01_arch_first_floor.pdf` as Level 1. "Building" gives one workbook with the columns Building, Level, Sheet, Document and a Warnings sheet. A missing PDF gives a warning and uses the saved summary.
- **B3.** The Manage Buildings dialog: create or open a building file, add levels with elevation, add PDFs and assign each page to a level, relink a moved PDF, open a sheet from the list.
- **B4.** Right-click a fitting: "Make riser". On the next level: "Attach to riser". Moving the riser on one level moves it on the others (an open document at once, a closed one on open). The takeoff gets a Riser table with the vertical length from the level elevations.

### 5.5 B5 (later): shared coordinate system between sheets

Deferred on purpose (user, D-B-14). No tasks yet.
- **Goal:** the building file stores, for each sheet, an alignment to a shared building frame (an offset in mm, and a rotation), so PDFs with different origins or views line up. The riser anchor then lives in the building frame, and each sheet converts through its alignment and its calibration.
- **Why:** in B4 the anchor is in mm from the bottom-left of each displayed page, y up. This is right only when the PDFs share origin and orientation (section 3.4). Real projects mix sheet sizes and views.
- **Open questions (for the B5 planning, not now):**
  1. How does the user set the alignment: click the same two points (a grid crossing, a column) on two sheets, or type an offset?
  2. Is a rotation or a mirror needed, or only an offset?
  3. Does the alignment sit on the sheet entry (`BuildingSheet`) or on the level? (A level may have many sheets with different views.)
  4. How do existing risers migrate? The B4 anchor is a point in the "page bottom-left, y up" frame of the first member; the migration would set each alignment to zero.
  5. Should the app detect that two sheets do not line up (for example by comparing a shared feature) and warn?
  This is a change of the building file format (a new field on `BuildingSheet`), so it needs a user decision when planned.

### 5.3 Verification for the whole stream

Each task has its own check in the part plan. The shared proof is a building of the two tracked fixtures `fixtures/pdfs/00_arch_ground_floor.pdf` and `01_arch_first_floor.pdf` (`rules.md` section 2). Multi-page behavior needs a real multi-page PDF, which does not exist (G14). B1 phase 2 and B2 sheet scope stop at "NEEDS_CONTEXT" until the user gives one. Nobody builds a fake one.

### 5.4 Risks

- **R-1 (high).** Page scoping (G2) touches many files and changes what old multi-page files show. Mitigation: one task per seam; the tools take the page from one function `activePage()`; a browser check on every tool.
- **R-2 (high).** Tauri fs scope and the stored absolute paths (G12). A building file from another PC lists paths that are not in the scope. Mitigation: spike first (B1-T16), a "Grant access" folder pick with `recursive: true`, no new Rust command.
- **R-3 (medium).** No multi-page fixture (G14).
- **R-4 (medium).** The cascade (D-B-13 A) needs a pending queue for closed documents. Mitigation: B4-T05 and T07 build it with core tests first.
- **R-7 (medium).** Sheets from different CAD views do not line up in mm (D-B-14). MepApp does not detect it. Mitigation: the known limit is shown in the Make riser dialog; B5 fixes it.
- **R-5 (low).** Summary older than the PDF. Mitigation: size check and "Rebuild".
- **R-6.** The quantities code is not on `master`. This branch must merge after `worktree-quantities-export`.

## 6. Open decisions

D-B-01 to D-B-08 are answered and not repeated. On 2026-10-31 the user answered D-B-09, D-B-10, D-B-11, D-B-12, D-B-13, D-B-18 and D-B-20 with **A** (the recommendation), and D-B-14 with a custom answer (below). These are **decided**. The table shows "Decided" in the owner column. Each decision keeps its options and reason for the record. No decision of the user is open now. The rows owned by the "Director" are defaults that the director may change (`protocol.md` section 3).

| Id | Owner | Question | Options | Recommendation |
|---|---|---|---|---|
| D-B-09 | Decided A (user, 2026-10-31) [data model] | Where is the building stored? | A. A file the user places, with summary files beside it. B. A per-install registry as in the old app. C. A hosted backend. | **A.** Matches D-B-01 and D-B-05. B cannot be shared. C adds the AGPL network duty and a service to run. |
| D-B-10 | Decided A (user, 2026-10-31) [data model] | Where do the sheet summaries go? | A. One file per project (one PDF), named `<projectUuid>.summary.json`, beside the building file, flat in the folder. B. All inside the building file. C. A `summaries` sub-folder (needs `fs:allow-mkdir`). | **A.** B grows to tens of MB and each Save rewrites it. C needs a new permission and the spike may show it is cheap, so allow a switch to C. |
| D-B-11 | Decided A (user, 2026-10-31) [data model] | Where does the document id live? | A. In the embedded project JSON (schema v22). B. In the PDF catalog. C. Both. | **A.** No engine change. The id travels with the project that already travels in the PDF. |
| D-B-12 | Decided A and A (user, 2026-10-31) [data model] | What does the migration do with elements of old multi-page files, which were all saved with page 0? And does Save As make a new id? | Part 1: A. Keep page 0 and tell the user in the release note. B. Ask at open. Part 2: A. Save As makes a new id. B. Save As keeps the id. | Part 1 **A**: the app cannot know the page. Part 2 **A**: a copy with the same id breaks the sheet link. The duplicate check still covers a copy made in the file manager. |
| D-B-13 | Decided A (user, 2026-10-31) [domain rule] | A run that touches a riser changes its network type. What happens? | A. The riser type changes, the runs on all levels retag (open documents at once, closed ones as a pending op). B. The app refuses the change and tells the user to detach the riser first. C. Only the run changes. | **A**, because rule 2 says the whole connected run changes. C breaks the rule and is not an option. B is the cheap first step if the pending queue is late: allow B in the first release of B4. |
| D-B-14 | Decided, custom answer (user, 2026-10-31) [data model] | Is "same x and y on every level" in page units (pt) or in real-world units? | A. pt, with a check of size, rotation and scale. B. Real-world mm from each page scale. | **User: B for now.** Answer: "Both pdf files need a shared coordinate system. File this as to do for a later phase. So for now the x and y should be the same in real world units, not in page units." The anchor is `anchorMm`, converted through each page's calibration (section 3.4). A shared coordinate system between sheets is deferred to **B5** (section 5.5). Known limit: the sheets line up only if the PDFs share origin and orientation. |
| D-B-15 | Director | One workbook or one per level? | A. One workbook with provenance columns. B. One workbook per level. | **A** (assumed below). |
| D-B-16 | Director | Does web write buildings? | A. No: web reads a building file and summaries only, last phase. B. Full. | **A**, in line with D-B-05. A dev-only web store (B1-T21) exists for checks. |
| D-B-17 | Director | Where do unassigned pages live? (B3) | A. Only in the dialog state. B. As `levelId: null` entries. | **A.** `sheets` stays the one truth and each sheet has a level. |
| D-B-18 | Decided A (user, 2026-10-31) [domain rule, data model] | Has a riser a flow direction and a source level? (Supply goes up from the plant room, return goes down.) | A. Stored on the riser: `flow` and `sourceLevelId`, the user sets them, default `unknown`. B. Derived from the equipment: the level whose segments reach a start stamp (not verified: needs the routing start-stamp data, `auto-routing.md`). C. None. | **A.** Cheap, explicit, no hidden rule. B can fill the default later. The takeoff shows the direction and never sums flow across levels (see below). |
| D-B-19 | Director | What does the elevation measure, and how long is a riser? | A. Finished floor height above a common datum, mm, negative allowed; floor-to-floor length = elevation difference + connection heights + end allowances; the column is named "Floor-to-floor length". B. Pipe length with offsets. | **A.** B needs 3D routing that MepApp does not have. |
| D-B-20 | Decided A (user, 2026-10-31) [domain rule] | A circuit (electrical) has terminals on several levels, so the cable has a vertical part. How does the takeoff treat it? | A. The Excel export adds no vertical cable length and writes a warning on the Warnings sheet for a circuit whose terminals are on more than one level. B. Add the vertical part from the elevation difference of the levels of the panel and each terminal. | **A.** MepApp counts no cable length today (not verified: the circuit table has no length column). B needs a rule for routing in a shaft. The warning keeps the number honest. |
| D-B-21 | Director | A pending riser op on a closed document: how does it apply? | A. It applies when the document opens, **outside the undo stack** (it is a sync, not an edit by the user), and the document becomes **dirty** so a Save writes the new place. A status line says "Riser <name> moved". B. Same, but one undo step. | **A.** Undo of a sync would split the riser from the building file. The dirty mark keeps the file and the building in agreement. |
| D-B-23 | Decided, custom answer (user, 2026-10-31) [data model] | Where is the origin of the mm frame? | A. Top-left corner of the displayed page, y down. B. The PDF crop box origin in its raw frame. C. A point the user clicks. | **User: the bottom-left corner of the displayed page, y up**, like CAD apps. The conversion flips y with the displayed page height (section 3.4). Final until B5 (C). |
| D-B-22 | Director | Minimum distance between two riser anchors on one level | A. Warn when two anchors on one level are closer than 150 mm (real units, from the calibration; skipped on an uncalibrated page). B. No check. | **A.** Supply and return risers sit side by side; two anchors on one point are a mistake. |

### Defaults that I assume (the director may change them; no user decision needed)

- File name of the building file: `<name>.mepbuilding.json`. Summary file: `<projectUuid>.summary.json` in the folder of the building file.
- Elevation unit: mm. A new level gets elevation 0 and the order of creation.
- Display name of a sheet: `<file name> p<page number>` with the number 1-based in the UI.
- The Sheet scope means the page that is shown. The Document scope means the whole open document (the current behavior).
- Sheet matching order: `projectUuid`, then path, then file name plus size. A match by path only is shown as "not stamped".
- The summary is written on Save only when the document belongs to a building that is open in the app. A document in two buildings gets one summary (it is per document).
- Takeoff columns: `Building`, `Level`, `Sheet`, `Document` come first. Network labels stay per sheet ("Supply air 1"). B4 adds a column `Building network` for runs that a riser joins.
- A sheet whose PDF is missing and which has a summary: use the summary, warn "Using saved summary from <date>". No summary: warn and leave it out. A PDF that exists but is outside the Tauri scope is "no access", a different warning from "missing" (`statPath`, B1-T17).
- Riser table (B4): one row for each **span** between two neighbouring members (not one row for the riser). Columns: Building, Riser, Shaft, Network type, From level, To level, Floor-to-floor length (m), Floor crossings (levels between members, minus 1 for the span count), Size (taken from the member segments; "mixed" when they differ), Flow direction, Source level. No pt coordinates. Flow is shown as "not summed across levels". The Building takeoff always writes the warning "Flow is not summed across levels."
- A riser with only one member: the length cell is blank, not 0, and a warning says the length is unknown. A riser end set to `open` (roof or ground) with no `endAllowanceMm` gives the same warning.
- Roll-up (B4): the Building takeoff adds a table `Building networks` with one row for each network type: segment length summed over all sheets, riser floor-to-floor length summed, number of risers.
- A pending retag (D-B-13 A): while it waits, the Building takeoff writes "<sheet>: pending change for riser <name>".
- Stale summary check: size differs, or the PDF modification time is later than the saved time (`sourceModifiedMs`).
- Language: UI strings in English as in the rest of the dialogs. Dutch strings follow the existing i18n path if the dialog uses it. Not verified: whether the Manage Buildings dialog has Dutch text.
- No `pnpm add`. The building code needs no new dependency. The xlsx writer is the existing `write-excel-file` (`packages/ui/src/quantitiesExport.ts:8`).
