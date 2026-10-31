# B1 plan: project identity, real pages, and the building file

Status: planned 2026-10-31 by the road map planner. Revised after the audit and the domain check (round 1). Not started.
Origin: `buildings-levels-sheets-spec.md` (all sections), `buildings-run-prompt.md`. Decisions D-B-01 to D-B-08 are final. D-B-09 to D-B-12 are decided A (user, 2026-10-31). D-B-16 is a director default.
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. Line numbers can move after a later commit.
Terms: as in the spec, section 0. **Project id** (`projectUuid`): the UUID in the project JSON. It is not the runtime id `doc-N` (`SketchDocument.id`) and not the `documentId` of the scene receipt (`scene.ts:4460`).

## 1. Goal

After B1:
- Each project has a stable `projectUuid` in its project JSON (schema v22).
- Each element, stamps included, belongs to a PDF page. The view shows only the elements of the shown page.
- `core` parses and matches a building file. `platform` has a `BuildingStore`, `FileAccess` can stat and read a path, and desktop has a store.
- A dev-only web store lets the browser checks of B2 to B4 load a building.

B1 gives no new dialog. The user sees one change: drawing on page 2 of a PDF no longer shows the drawing on page 1.
B1 stops here. B2 writes sheet summaries and the takeoff. B3 builds the dialog. B4 builds risers.

## 2. What exists now

| Fact | Source |
|---|---|
| Schema v21; `CURRENT_SCHEMA_VERSION`; the 20 to 21 step only advances the number; `serializeProject`; `loadProject` | `packages/core/src/project.ts:22`, `:331-341`, `:415-417`, `:435` |
| The migration chain must have one step for each version from 0 | `packages/core/src/schema.ts:27-45` |
| `PlacedStamp` has no `pageIndex` | `packages/core/src/stamp.ts:8-34` |
| `Segment.pageIndex`, `Fitting.pageIndex` exist; tools write 0 | `packages/core/src/network.ts:58-61`, `:80-83`; `packages/render/src/tools/drawSegmentTool.ts:123`, `:160` |
| A polyline is an **annotation** (not a segment) | `packages/render/src/tools/drawPolylineTool.ts:44-47` |
| Annotation tools write `pageIndex: 0` | `drawLineTool.ts:22`, `drawFreehandTool.ts:32`, `drawHighlightTool.ts:45`, `drawShapeTool.ts:56`, `drawTextboxTool.ts:19`, `drawStickyNoteTool.ts:16`, `drawPolylineTool.ts:46` (all in `packages/render/src/tools/`) |
| `setBackdropPage` swaps the backdrop only | `packages/render/src/scene.ts:1092-1120`; `packages/render/src/document.ts:96-97` |
| `syncDrawingLayer` draws all segments, fittings, annotations; `syncStampSprites` shows all stamps | `scene.ts:5498-5520`, `:5604-5618` |
| Stamp creators: place tool; auto-place (`scene.ts:3124`); Replace stamp keeps the stamp and changes its definition (`scene.ts:2820-2835`); paste (`:5361`); project load | same files |
| Save: `syncAndGetPdfBytes` calls `exportToPdf`, which writes the project JSON; `saveDocument`; `saveAsNewFile` | `packages/ui/src/App.tsx:713-718`, `:724-739`, `:743-778`; `scene.ts:4459` |
| The route stamp list uses the shown page for rooms and all stamps | `scene.ts:2945-2950` |
| PDF annotation sync: list and delete use page 0; a segment line is written to its own `segment.pageIndex` | `scene.ts:4440`, `:4480`, `:4551` |
| `FileAccess` has no stat or read-by-path | `packages/platform/src/file-access.ts:36-51` |
| `BaseStore`, `checkRevision`, `StoreConflictError`, memory stores, contract suites | `packages/platform/src/store.ts:10`, `revision.ts`, `errors.ts`, `memory/`, `contract/` |
| Tauri: scope comment, `pickFolder` with `recursive: false`, `readAsFile` | `packages/platform-tauri/src/tauri-file-access.ts:25-28`, `:40-42`, `:70-91` |
| Capabilities: read-file, write-file, read-dir, stat | `apps/desktop/src-tauri/capabilities/default.json:12-15` |
| Old registry in localStorage | `packages/ui/src/buildings.ts:10-57` |
| **Test scripts:** `core` and `ui` have `"test": "vitest run"`. `render` and `platform-tauri` have **no** test script | `packages/*/package.json` |

## 3. Research (what MepApp can use)

- The old app: identity and registry code is the model (spec section 1). MepApp copies: id first and path second; the order "write the id, save the PDF, then patch the registry" (`DocumentIdentityService.cs:140-147`); the verdicts moved, copy, unclear (`:153-178`). MepApp changes: the id lives in the project JSON.
- Not verified: Tauri v2 behavior of `dialog.open({ directory: true, recursive: true })` for files created later in the folder. B1-T16 proves it.
- `crypto.randomUUID()` exists in the browser and in the Tauri webview. `core` takes the generator as an argument.
- Testing without a render test setup: put page logic in `core` (pure functions) and test it there. B1-T20 also adds vitest to `render`. For `platform-tauri` the store logic sits in `platform` behind an injected file adapter; `platform-tauri` only wires it (see T17).

## 4. The model

Types are in the spec, sections 3.1 and 3.2. B1 builds:
- `ProjectDocument.projectUuid?: string`, `PlacedStamp.pageIndex: number` (required in T06).
- Schema v22 migration, one step 21 to 22: sets `pageIndex: 0` on each stamp without a number. A v21 file loads with `projectUuid === undefined`.
- Building file and summary file each have their own `schemaVersion` and their own migration chain. Each chain **starts with a step 0 to 1** (an identity step that sets the version), because `validateMigrationChain` needs a step for every version from 0 (`schema.ts:40-44`). The type check lives in `core` tests.
- `BuildingFile`, `BuildingLevel`, `BuildingSheet`, `SheetLocation` in `packages/core/src/building.ts`.
- `risers: Riser[]` is in the file from version 1 (stub type in `riser.ts`; B4 fills it).

```ts
// packages/platform/src/building-store.ts
export interface BuildingRef { id: string; name: string; location: string }
export interface BuildingStore extends BaseStore {
  read(): Promise<{ json: string; revision: string } | undefined>;
  write(json: string, expectedRevision?: string): Promise<{ revision: string }>;   // throws StoreConflictError
  readSummary(projectUuid: string): Promise<string | undefined>;
  writeSummary(projectUuid: string, json: string): Promise<void>;
  listSummaries(): Promise<string[]>;
}

// packages/platform/src/file-access.ts (new, optional members; T17)
export type PathState = 'ok' | 'missing' | 'no-access';
statPath?(path: string): Promise<{ state: PathState; sizeBytes?: number; modifiedMs?: number }>;
readPath?(path: string): Promise<OpenedFile | undefined>;   // undefined when state is not 'ok'
```

`statPath` tells a missing file from a file the app may not read (outside the Tauri fs scope). The takeoff and the dialog show the two states with different text.

Summary file rule (finding 11): **one summary file for each project, not for each building.** Its name is `<projectUuid>.summary.json` and the store key is `projectUuid`. It sits in the folder of the building file. Two buildings in one folder share the file. A summary belongs to the PDF, so two buildings that use one PDF see the same data. The name and the key are the same string.

How B1 keeps the domain rules:
- Rule 1: B1 adds no network type to a stamp or port.
- Rule 2: B1 changes no type. Page scoping makes connections page-local (T10), so a run cannot join elements of two pages by accident.
- Rule 3: `BaseStore`, `checkRevision`, memory store pattern, `getEmbeddedFile`, `FileAccess`.
- Rule 4: untouched.
- Rule 5: every UI-visible task has a browser check with a real click or input.
- Rule 6: `pnpm build` at the root after each task.

## 5. Phases and tasks

One task is one commit and one seam, at most about 150 changed lines. Common verification: `pnpm --filter @mepapp/core test`; `pnpm --filter @mepapp/render test` (after T20); `pnpm --filter @mepapp/ui test` when `ui` changes; `pnpm build`. A browser check is `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. Screenshots `<task id>-<name>` (`rules.md` section 5). Each task below has a check that needs **no multi-page PDF**: a core test on pure page functions, plus a browser check that uses the `getPageCount` stub of the R2 report (it proves wiring and texts). The real multi-page proof is T12 only.

### Phase 0: test and dev set-up (first)

**B1-T20 render: vitest set-up.**
- Files: `packages/render/package.json` (hand-edit: `"test": "vitest run"` and `"vitest": "^2"` in `devDependencies`, the version of `core`), `packages/render/vitest.config.ts` (copy the shape of `packages/core`'s config if it has one), `pnpm-lock.yaml` (changed by `pnpm install`, never by `pnpm add`), one smoke test `packages/render/src/smoke.test.ts` for a pure function. Not verified: that pixi imports load in a node test; the smoke test imports only a pure module (`tools/angleSnap.ts`).
- Verify: `pnpm install`, then `pnpm --filter @mepapp/render test` passes; `pnpm build`.
- Depends on: none. If vitest cannot run in `render`, the fallback is: every page rule goes to `core` and the render change is proven by the browser check only. State this in the task report.

**B1-T21 dev-only web building store and loader.**
- Files: `packages/platform-web/src/dev-building-store.ts` (new: in-memory implementation of `BuildingStore` that wraps the memory store of T15), `apps/web/src/main.tsx` or the UI entry that builds the app (hook `window.__mepBuilding = { load(json: string, summaries?: Record<string,string>): void }`, installed only when `import.meta.env.DEV`).
- Shapes: `useBuilding` (B3-T02) takes `makeStore`; in dev with a loaded building it returns this store. The hook is for setup and for reading state. The wiring of dialogs is still checked by real clicks (`rules.md` section 3, rule 5). D-B-16 stays: the full web store is T19, last.
- Do not touch: production code paths; the hook must not exist in a production build.
- Verify: `pnpm build` output has no `__mepBuilding` string (grep the `dist`); a browser check in dev loads a building by the hook and reads it back.
- Depends on: T13, T15.

### Phase 1: project identity (D-B-11 A and D-B-12 are decided)

**B1-T01 core: schema v22.**
- Files: `packages/core/src/project.ts`, `packages/core/src/stamp.ts`, the migration test file (search `fromVersion: 20`).
- Shapes: `CURRENT_SCHEMA_VERSION = 22`; `ProjectDocument.projectUuid?: string`; `PlacedStamp.pageIndex?: number` (optional with a comment; T06 makes it required); step 21 to 22; validator: if present, `projectUuid` is a non-empty string.
- Verify: core tests: a v21 file loads with every stamp `pageIndex === 0` and `projectUuid` undefined; a v22 round trip keeps both; `validateMigrationChain` still passes.
- Depends on: none.

**B1-T02 core: id helpers.**
- Files: `packages/core/src/project-uuid.ts` (new), `packages/core/src/index.ts`.
- Shapes: `isProjectUuid(value: unknown): value is string` (lowercase UUID text, 36 chars); `makeProjectUuid(random: () => string): string` (throws when `random()` is not a UUID); `readProjectUuidFromJson(text: string): string | null` (parses the embedded JSON text and returns the field or null; never throws).
- Verify: core tests, good and bad input.
- Depends on: T01.

**B1-T03 render: the document holds the id.**
- Files: `packages/render/src/document.ts`, `packages/render/src/scene.ts` (`serializeDocument` `:4205`, `loadProjectInto` `:4279`).
- Shapes: `SketchDocument.projectUuid: string | null = null`; serialize writes it when not null; load reads `loaded.projectUuid ?? null`.
- Do not touch: the runtime `id` and the receipt `documentId`.
- Verify: render test (after T20) or a core test of the serialize shape; browser check: Save a PDF (OPFS), read the embedded JSON: `schemaVersion: 22` and `projectUuid`.
- Depends on: T01, T02.

**B1-T04 render and ui: mint the id and Save As.**
- Files: `packages/render/src/scene.ts`, `packages/ui/src/App.tsx` (`syncAndGetPdfBytes` `:713`, `saveAsNewFile` `:724`, `saveDocument` `:743`).
- Shapes:
  - Mint once: when a project loads, and when a PDF opens with no embedded project (`loadFromPdf`, `scene.ts:4472`), `if (doc.projectUuid === null) doc.projectUuid = makeProjectUuid(() => crypto.randomUUID())`. Public `getProjectUuid(): string | null`. A new id alone does not mark the document dirty.
  - Save As: the id changes **before the bytes are built**, because `exportToPdf` writes the project JSON into the PDF (`scene.ts:4459`). `syncAndGetPdfBytes(opts: { newProjectUuid?: boolean })` calls `scene.exportToPdf(handle, { projectUuid: <new> })`, which serializes with the new id **without** committing it to the document. Only after the picker returns a target (`saveAsNewFile` returned true) does the UI call `scene.commitProjectUuid(documentId, newId)`. If the picker is cancelled, the old id stays and the document is unchanged. The order is: sync with the new id, picker, write, commit the id, `markSaved`.
  - "First save is Save As": `saveDocument(false)` for a document with no file target runs `saveAsNewFile` (`:760-767`). That path is a Save As too, but the file is the first copy of an opened PDF: it **keeps** the id when the file had no target because it was never saved, and mints a new id only when the document was opened from a file that has a target. Rule in code: `newProjectUuid = asNewFile && fileTargetsRef.current.has(documentId)`. Not verified: that a web download fallback (no target) should keep the id; the plan keeps it.
- Do not touch: `markDirty`; the order of the other save steps.
- Verify: unit test of the rule "mint once" and of `newProjectUuid`; browser check: open, `getProjectUuid()` is a UUID; Save As to OPFS gives another id in the embedded JSON and in the scene; a cancelled picker keeps the old id in both (picker stub returns undefined). No screenshot.
- Depends on: T03.

### Phase 2: pages are real (D-B-12 part 1 A is decided)

Pure page logic goes to `core` first. Each later task has a core test that needs no PDF.

**B1-T06 core: stamps carry the page; page helpers.**
- Files: `packages/core/src/stamp.ts` (make `pageIndex` required), `packages/core/src/page-scope.ts` (new), `packages/core/src/index.ts`, tests, `packages/core/src/project.ts` (validator needs a number).
- Shapes: `onPage<T extends { pageIndex: number }>(items: readonly T[], page: number): T[]`; `withPage<T extends object>(item: T, page: number): T & { pageIndex: number }`.
- Verify: core tests for both; core builds. The type change breaks `render`'s build: T22 to T25 fix each creator. Land T06 and T22 to T25 on one branch before the push, or keep `pageIndex` optional until T25 is done: **Chosen: T06 makes it required only in its last commit, after T22 to T25 pass.** Until then `pageIndex?: number` stays and `onPage` treats `undefined` as 0.
- Depends on: T01.

**B1-T22 render: place tool writes the page.**
- Files: `packages/render/src/tools/placeStampTool.ts`, `packages/render/src/tools/types.ts` (`activePage(): number` in the context), `packages/render/src/scene.ts` (`activePage()` returns `this.doc.pageIndex`).
- Verify: render test or core test of `withPage`; browser check with the `getPageCount` stub: place on page 1, switch, place again; `listStamps()` shows pages 0 and 1.
- Depends on: T06 (helpers), T20.

**B1-T23 render: auto-place writes the page.**
- Files: `scene.ts` near `:3124` (the stamp literal) and its request `pageIndex` (`:2949`).
- Verify: test that the placed stamps have the request page; browser: Auto-place on the shown page.
- Depends on: T22.

**B1-T24 render: paste and duplicate keep or set the page.**
- Files: `scene.ts` `copySelection` / `pasteClipboard` (`:5329`, `:5361`).
- Shapes: a paste writes the shown page on every pasted stamp, segment, fitting and annotation. (Cross-page paste moves the copy to the shown page.)
- Verify: test of the page rewrite on a pure helper in `core` (`pasteOnPage`); browser check.
- Depends on: T22.

**B1-T25 render: Replace stamp and project load keep the page.**
- Files: `scene.ts` (`:2820-2835` Replace spreads the old stamp, so the page is kept; add a test), the load path (a stamp from a v21 file has page 0 from the migration).
- Verify: test: replace keeps `pageIndex`; load of a v22 file keeps it. Then T06 makes the field required.
- Depends on: T22, T23, T24.

**B1-T07 render: segments and fittings carry the page.**
- Files: `drawSegmentTool.ts` (`:123`, `:160`); fittings made by a split take the segment's page (`scene.ts:1463`, `:2657`; check).
- Verify: test with `withPage`; browser (stub): draw on page 2, `getConnectivity().segments[0].pageIndex === 1`.
- Depends on: T22.

**B1-T08 render: annotations carry the page (polyline included).**
- Files: the six annotation tools and `drawPolylineTool.ts:44-47` (a polyline is an annotation).
- Verify: browser (stub) with one annotation on page 2.
- Depends on: T07.

**B1-T26 audit: page-blind readers.**
- This task writes a list, then fixes each reader in small commits. The list goes to `.claude/plans/buildings-b1-readers.md`. Each entry: the function, `path:line`, whether it must see all pages or the shown page, and the fix. Start with: `autoPlaceStamps`, `autoPlacePlan` (`packages/ui/src/autoPlacePlan.test.ts` area), `listStamps` (`scene.ts:1579`), room demand counts, the route stamp list (`scene.ts:2945-2950`), `portSegmentTypes`, circuit and schematic terminal lists (`packages/ui/src/schematicTerminals.ts`), `stampPortConnectionPoints` (`scene.ts:897`), the Networks panel (`getConnectivity`), the flow solve. Rule of thumb: a reader that works on the shown page (auto-place, route, rooms) uses `onPage`; a reader that works on the document (flow, circuits, Networks list, summaries) keeps all pages and shows the page.
- Verify: the list exists with a decision for each reader; each fix has a core test of `onPage` use or a browser check.
- Depends on: T06, T07, T08.

**B1-T09 render: the view filters by page.**
- Files: `scene.ts` (`syncDrawingLayer` `:5498`, `syncStampSprites` `:5604`, `computeVisibleFittingIds`, annotation draw, hit test, selection box); `setBackdropPage` clears a selection of ids from another page (model: `clearRoomSelection`, `:1114`).
- Do not touch: the flow solve, circuits, schematics.
- Verify: test of `onPage` use (core); browser (stub) screenshots `B1-T09-page1`, `B1-T09-page2`.
- Depends on: T25, T07, T08, T26.

**B1-T10 render: connect, snap and paste stay on the page.**
- Files: `drawSegmentTool.ts`, `dragSnap.ts`, `lineSnap.ts`, `alignmentGuides.ts`.
- Shapes: a snap or connect target on another page is ignored.
- Do not touch: the known hole of rule 2 (a segment drawn onto a port of another type).
- Verify: test with elements of two pages at one x, y; browser (stub).
- Depends on: T09.

**B1-T11 render: PDF annotation sync per page.**
- Files: `scene.ts` `:4440`, `:4480`. A segment line already goes to its own page (`:4551`); the list and delete calls use page 0.
- Shapes: for each page that has elements or sync ids, call `listAnnotations(page)`. Read `planPdfSync` and `reconcilePdfSync` first and write down what changes. Not verified: how they treat ids of annotations on pages above 0.
- Verify: test of the plan with two pages (pure, on `planPdfSync`); the real proof is T12.
- Depends on: T08.

**B1-T12 check: multi-page end to end.**
- `<work>/b1-pages-check.mjs`. A real 2-page PDF: draw a segment and a stamp on each page, switch, save, reload, each page holds its own. Screenshots `B1-T12-p1`, `B1-T12-p2`.
- Depends on: T06 to T11 and the user's fixture. NEEDS_CONTEXT without the fixture. Nobody makes a fake one.

### Phase 3: the building file model in core

**B1-T13 core: building types, parse, validate.**
- Files: `packages/core/src/building.ts` (new), `riser.ts` (stub), `index.ts`, tests.
- Shapes: spec 3.2. `parseBuildingFile(raw: unknown): BuildingFile` with a chain that starts at a 0 to 1 identity step; `BuildingFileError` with `issues`; `emptyBuilding(id, name)`; `serializeBuildingFile(file): string`. Validate: `levelId` exists; one sheet per (`projectUuid`, `pageIndex`); whole `pageIndex` from 0; `elevationMm` finite (negative allowed); `id` of levels unique. Warn (not error) on two levels with the same elevation: `levelWarnings(file): string[]`.
- Verify: core tests: round trip, each error, an unknown field is kept, a newer version is refused.
- Depends on: T01.

**B1-T14 core: sheet match, move, copy.**
- Files: `packages/core/src/building-identity.ts` (new), tests.
- Shapes:
  ```ts
  export type DuplicateVerdict = 'none' | 'moved' | 'copy' | 'unclear';
  export function findSheets(file: BuildingFile, doc: { projectUuid: string | null; path?: string; fileName: string; sizeBytes: number }): { sheet: BuildingSheet; strength: 'id' | 'path' | 'weak' }[];
  export function duplicateVerdict(args: { openPath: string | undefined; storedPath: string | undefined; storedState: 'ok' | 'missing' | 'no-access'; sameSizeAndTime: boolean }): DuplicateVerdict;
  export function withProjectUuid(file: BuildingFile, sheetId: string, projectUuid: string): BuildingFile;
  export function withMovedLocation(file: BuildingFile, projectUuid: string, location: SheetLocation): BuildingFile;
  ```
  `storedState: 'no-access'` gives `unclear`, never `moved`.
- Verify: core tests for each verdict (port of `DocumentIdentityService.cs:153-178`) and each match order.
- Depends on: T13.

### Phase 4: stores and file access

**B1-T15 platform: `BuildingStore`, memory implementation, contract suite.**
- Files: `building-store.ts`, `memory/memory-building-store.ts`, `contract/building-store.contract.ts`, `index.ts`, a test file next to `memory-stores.test.ts`.
- Verify: `pnpm --filter @mepapp/platform test`: revision conflict, absent read, summaries listed.
- Depends on: none.

**B1-T16 spike: Tauri scope and folder writes.**
- Answers: (a) with `recursive: true`, can the app write a new file in the picked folder? (b) with `false`? (c) is `fs:allow-mkdir` needed for a sub-folder? (d) are picked paths in the scope after a restart? (e) what does `stat` return for a path outside the scope (this decides `'no-access'`)?
- Output: `.claude/plans/buildings-b1-spike.md` with answers and proof. If a headless run cannot drive a native dialog: NEEDS_CONTEXT and a script for a 5-minute Windows test.
- Depends on: none. D-B-10 A (flat files) is decided; the spike only proves that flat files work or names the capability line that is needed.

**B1-T17 platform and platform-tauri: store logic, `statPath`, `readPath`.**
- Files: `packages/platform/src/file-access.ts` (the optional members of section 4), `packages/platform/src/folder-building-store.ts` (new: the store logic over an injected adapter `FolderFiles { read(name): Promise<{ text: string; modifiedMs: number; sizeBytes: number } | undefined>; write(name, text): Promise<void>; list(): Promise<string[]> }`), `packages/platform/src/folder-building-store.test.ts` (runs the contract suite with an in-memory `FolderFiles`), `packages/platform-tauri/src/tauri-building-store.ts` (thin: builds `FolderFiles` from `@tauri-apps/plugin-fs` and the folder path), `tauri-file-access.ts` (`statPath` via `stat`, `readPath` via `readAsFile` at `:25`).
- Shapes: revision = `${modifiedMs}:${sizeBytes}`. Summary file name `<projectUuid>.summary.json` (section 4). `statPath` maps a scope error to `'no-access'` and a not-found error to `'missing'` (per the spike, T16).
- Check without a test script in `platform-tauri`: the logic is tested in `platform`; `platform-tauri` is checked by `tsc` through `pnpm build` and by a desktop run (a script for the user on Windows). State this in the report.
- Do not touch: the other `FileAccess` methods; Rust code unless T16 requires one capability line.
- Depends on: T15, T16.

**B1-T18 ui: recent buildings and the import of the old registry.**
- Files: `packages/ui/src/buildings.ts` (add; **keep the old exports** `Building`, `BuildingLevel`, `loadBuildings`, `saveBuildings`, `newBuilding`, `newLevel`, `assignDocumentToLevel` until B3-T02 replaces the dialog that uses them: `ManageBuildingsDialog.tsx:3`), `packages/ui/src/recentBuildings.ts` (new), tests.
- Shapes: `RecentBuilding { id; name; location: string }[]` in `localStorage` key `mepapp.buildings.v2`. `importOldRegistry(v1: Building[]): BuildingFile[]`.
- Verify: UI tests; the old dialog still opens (browser, `B1-T18-dialog`).
- Depends on: T13.

**B1-T19 platform-web: handle-based `BuildingStore` (optional, last).**
- Files: `packages/platform-web/src/web-building-store.ts`. Handles in IndexedDB. Permission needs a click. `readPath`/`statPath` are absent on web: the dialog says "no access" and asks for the file again.
- Verify: contract suite with `fake-indexeddb`.
- Depends on: T15, D-B-16 A. Not before B2 is done.

## 6. Order and parallel work

1. T20, T15, T16 (parallel; no shared files). T01, T02, T13.
2. T03, T04. T14. T21.
3. Pages: T06 (helpers), T22, T23, T24, T25, then T06 final (required field), T07, T08, T26, T09, T10, T11, T12.
4. T17, T18. T19 last.
- B2-T06 needs T17 (`readPath`, `statPath`). B3 needs only B2's types, so there is no cycle.
- D-B-11 A and D-B-12 are decided, so T01 to T04 can start. The spike T16 still decides the sub-folder question of D-B-10 (the user chose A: flat files; a switch to a sub-folder is a director default).

## 7. Where B1 stops

B1 ends when: a project has an id; elements have a page and the view shows one page; `core` parses and matches a building file; `BuildingStore`, `statPath` and `readPath` work on desktop and in memory; a dev web store exists for checks. B2 starts with the sheet summary type.
