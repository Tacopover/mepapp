# B1-T19 plan: web `BuildingStore`

Status: DRAFT. Waiting for the user to answer Q1 to Q3 (section "Decisions for the user"). Task 2 (dead code) is in the second part of this file.

## What exists today (read 2026-11-06)

- `BuildingStore` (`packages/platform/src/building-store.ts`): `read`, `write(json, expectedRevision?)`, `readSummary`, `writeSummary`, `listSummaries`, plus `status` and `requestAccess`.
- `FolderBuildingStore` (`packages/platform/src/folder-building-store.ts`) already implements the whole interface on top of `FolderFiles` (`read`, `write`, `list` of one folder). The desktop store is a 25-line adapter around it. The revision is `modifiedMs:sizeBytes`.
- `makeBuildingStore(ref)` in `apps/web/src/main.tsx` is synchronous and gets only `{ id, name, location }`. On the web `location` is the file name, because a `FileSystemFileHandle` has no path (`locationOf` in `buildingController.ts`).
- `BuildingController.create/open/importOldBuildings` get a `target` (the handle) from `fileAccess.saveFileAs/openFile`, then call `makeStore(ref)`. The handle never reaches `makeStore`. This must change.
- `WebFileAccess` already feature-detects `showOpenFilePicker`. It falls back to `<input type=file>` and to a download. Neither fallback gives a handle.
- `ManageBuildingsDialog.tsx:233` shows "Use the desktop app" when `makeStore` is undefined (`available` false).

## Design (recommended)

A web building has two handles:

1. The **building file**: a `FileSystemFileHandle`, from `showSaveFilePicker` (create) or `showOpenFilePicker` (open). Already returned as `target`.
2. The **summaries folder**: see Q1 below.

An IndexedDB table `building-handles` (database `mepapp-buildings`, new file `packages/platform-web/src/building-handle-registry.ts`) keeps `{ buildingId, fileHandle, dirHandle? }`. IndexedDB can store handles (structured clone). `createWebBuildingStore(registry)` returns a factory `(ref, target?) => BuildingStore`:

- With `target`: the factory saves the handle under `ref.id`.
- Without `target` (reopen from the recent list): the store looks up `ref.id` in the registry on first use.
- `status()`: `queryPermission({mode:'readwrite'})` on the building file handle. `granted` -> `ready`. `prompt` -> `needs-permission`. No handle or no API -> `unavailable`.
- `requestAccess()`: `requestPermission`. It runs inside a click only.
- `read`/`write`/summaries: `FolderBuildingStore` over a `FolderFiles` adapter (the file handle for the building file; the directory handle or IndexedDB for summaries, see Q1).

Controller change: `makeStore: (ref, target?) => BuildingStore`. `openRecent` on `needs-permission` sets a state "Allow access" (new `BuildingState.needsAccess` entry). The dialog shows a button "Allow access to <name>". One click calls `requestAccess`, then loads the building.

## Answers to the six questions

### 1. What the user picks; browsers; unsupported browsers

Desktop flow (stays the same in the dialog): "New building" -> save-as picker -> file. "Open building" -> open picker. The summaries go to the same folder as the building file (`<projectUuid>.summary.json`).

Web flow: the same two buttons, the same two pickers (`showSaveFilePicker`, `showOpenFilePicker`). A file handle cannot reach the folder around it. Summaries need a second pick: see Q1 in the decisions section.

Support (File System Access API): Chrome, Edge, Opera, Brave on desktop. Not supported: Firefox, Safari, all iOS browsers. Chrome on Android has no `showOpenFilePicker` either. Detection: `typeof window.showSaveFilePicker === 'function'`.

Unsupported browser: the dialog shows a message and no buttons that cannot work: "Building files need Chrome or Edge on a computer. This browser cannot keep a link to a file on your disk. You can still use the viewer and export. Use the desktop app or Chrome for buildings." Close button only. The decision is in Q2.

### 2. Handles, restart, "Allow access"

- Stored: the building file handle (and the folder handle, Q1), keyed by building id, in IndexedDB.
- After a restart the handle is still there, but the permission is back to `prompt`. A request needs a user click.
- Dialog states for a recent building whose permission is `prompt`: the tree row shows the building name with the hint "Needs your permission". The detail pane shows one primary button "Allow access" and a line "Your browser asks again after you close the tab. Click Allow, then choose 'Allow on every visit' or 'Allow this time'." After the click: loads the building. If the user denies: the pane says "Access was not given. The building stays closed." and keeps the button.
- Disabled states: "Add folder", "Read summaries now" stay hidden until a building is open (as on desktop).
- The `ux-designer` step writes the wireframe of these three states (Allow access, Not supported, Handle lost).
- Handle lost (the file was moved or deleted): `read()` throws `NotFoundError` -> message "The building file was not found. Use Open building… to find it." (the text `openRecent` already shows).

### 3. Sheets without a path

The desktop matches an open PDF by path. The web has none. `documentIdentity.ts` already has the web rule: `doc.path === undefined`, same file name, same size (or no stored size) -> same file. `findSheets` already matches by project id first (strength 'id', the `idMinted` adopt flow from B3-T13c), then by name and size.

What the user sees when a sheet PDF cannot be found by itself: the row chip says "Not opened" (new wording for unknown state; today `unknown` shows nothing). The row button is "Choose file…" (the existing 'pick' mode of `openSheet`). No internal words. The hint: "This browser cannot open the PDF by itself. Choose the file again."

Q3 asks whether to keep PDF handles too.

### 4. Capability table (`readPath`/`statPath` absent on web)

| Where | Function | Needs | Web does instead |
|---|---|---|---|
| `buildingController.refreshSheetStatus` (line 291) | status chips per sheet | `statPath` | `statSheets` gets no `statPath`; probe is `unknown`; chip comes from the summary only (`ok`, `not-opened`, `no-summary`, `not-stamped`). Never `Missing` or `No access`. |
| `App.openSheet` mode `path` (line 898) | open a sheet in one click | `readPath` | Returns "This sheet cannot be opened by its path. Pick the file again." Dialog must show mode `pick` (button "Choose file…") when `readPath` is absent. Check in `LevelSheetsPane`. |
| `App.tsx` ~1045 (save-as/duplicate check) | stale stat on Save | `statPath` | skipped (`if (path !== undefined && statPath)`). |
| `App.tsx` ~722 | modified time after save | `statPath` | `Date.now()`. |
| `App.rebuildSummaries` `read` (line 1085) | "Read summaries now" | `readPath` | returns `undefined` for each sheet -> list "no path is stored for this PDF". Wording must change for web: "Open this PDF first, then try again". Only open documents can supply a summary. |
| `whyUnreadable` (line 1090) | reason text | `statPath` | "this platform cannot read a PDF by path" -> web wording: "the browser cannot read a PDF without your help". |
| `App.tsx` ~1235 (`statSheets` for export) | export status | `statPath` | unknown probes; export warns nothing about missing. |
| `documentIdentity` (`moved`/`ask` verdicts) | copy/moved detection | `statPath` | only the web rule (same name and size = same file). A renamed copy is not detected. |

Each hidden difference becomes a numbered step in `.claude/plans/buildings-t19-test.md`.

### 5. Production safety

- "Use the desktop app" text goes away only when `makeBuildingStore` is defined AND the browser has the API. Otherwise the new "not supported" text shows.
- `window.__mepBuilding`, `devBuildingStore`, `devStatPath`, `devReadPath` stay behind `import.meta.env.DEV` (they are today). After the build: `grep -rl __mepBuilding apps/web/dist`. The result goes in the final report.

### 6. localStorage migration

Checked. B3 left `loadBuildings()` / `loadImportedOldIds()` in `buildings.ts`. The dialog offers "Import old buildings" and the controller `importOldBuildings` saves each one through `saveFileAs`. That already works with a web handle. No data migration. One change: `importOldBuildings` must pass `saved.target` to the store registry so the imported building opens after a restart. The recent list (`recentBuildings.ts`, localStorage) keeps `{ id, name, location }`; on the web the handle lives in IndexedDB under `id`. If the recent entry exists but the handle does not (cleared site data): "The building file was not found. Use Open building…".

## Decisions for the user

- Q1 Summaries on the web: A folder (second pick `showDirectoryPicker`, summaries in the same folder as on desktop, shareable) or B IndexedDB (no second pick, summaries stay in this browser; derived data, the app rebuilds it). Recommendation: B for the first version. The building file is the shared thing. A second folder pick makes the first step hard to understand.
- Q2 Unsupported browser: A "not supported" message with a close button (recommended) or B a building kept in the private storage of the browser (works in Firefox and Safari, but the user cannot see or move the file).
- Q3 PDF handles: A none, the user picks a sheet PDF again after each restart (the plan text, recommended) or B keep PDF handles in IndexedDB per sheet so "Open" works after "Allow access".

## User answers (2026-11-06)

- D-B-51 (Q1): summaries in IndexedDB (option B). No folder pick on the web.
- D-B-52 (Q2): browsers without the File System Access API (Firefox, Safari) keep the building in hidden browser storage (IndexedDB) if that works. The dialog shows a visible alert: "This browser keeps the building inside the browser. Use Chrome or Edge if you want to see or move the file." Creating a building there does not call `saveFileAs` (it would only download a copy). "Open building" there reads a chosen `.json` file into the hidden storage. The user can still get a copy by export/download.
- D-B-53 (Q3): no PDF handles (option A). The user picks a sheet PDF again.

Consequences for the design:
- One IndexedDB database `mepapp-buildings` with stores `handles` (`buildingId` -> file handle, Chromium only), `files` (`buildingId` -> `{ json, revision }`, hidden-storage mode) and `summaries` (`buildingId:projectUuid` -> json).
- Two store kinds behind one factory: `HandleBuildingStore` (Chromium: file handle for the building, summaries in IndexedDB) and `HiddenBuildingStore` (no API: building and summaries in IndexedDB). Revision of the hidden store: a counter that rises with each write.
- Summaries per building are keyed by the building id, so two buildings with the same sheet do not share a summary.

## Verification plan

- Contract suite `building-store.contract.ts` against `createWebBuildingStore` with `fake-indexeddb` and an in-memory fake handle.
- UI tests for: Allow access state, not supported state, status chips with no `statPath`.
- Browser checks (`run-checks.mjs`) with a fake picker (OPFS handle) for create, add two PDFs, reload, export.
- Not provable with a fake: real picker, real permission prompt, restart. These go into `buildings-t19-test.md` (one PC, Chrome).

---

# Task 2: dead code (gap item 9)

Survey and result are added here when Task 2 runs.
