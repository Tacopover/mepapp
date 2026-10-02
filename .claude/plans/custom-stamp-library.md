# Custom stamp library from the user's own folders — plan

Status: **planned 2026-10-02, not started.** Browser target: Chrome and Edge only (the user decided to skip Firefox and Safari for now). Depends on the `LibraryStore` interface from [[storage-interfaces]]. Phase 2 of this plan and Phase 2 of that plan are the same work.

## 1. Goal

The user points MepApp at a folder on their computer. MepApp imports every `.svg`, `.png`, `.jpg` and `.jpeg` file in that folder as a stamp. The user can set one folder for terminals and another for equipment. The stamps appear in the Stamps panel next to the built-in library. They are still there in the next session, with no new permission prompt.

The user also asked that ports survive. The user can add ports to an imported stamp (in the Element Editor). The next session shows the same ports.

## 2. Decisions already made (2026-10-02)

- **Copy, not link.** MepApp copies the files into IndexedDB (browser storage that holds files). The folder is read only when the user presses "Sync". Reason: a stored folder handle needs a new browser permission click in every session. A copy needs none.
- **Image stamps only.** An SVG becomes a stamp with one `image` shape. MepApp does not convert SVG to editable vector shapes. PNG and JPEG work the same way. This is the same output as the Element Editor "Import image" path.
- **Chromium only.** Firefox and Safari show the feature as unavailable, with a short message.
- **No login, no backend.** Cloud sync is a later paid feature (see [[storage-interfaces]]).

## 3. Findings from the survey (2026-10-02)

These come from one read-only survey. The line numbers were not re-checked one by one. Check each one before you depend on it.

- `StampDefinition` is at `packages/core/src/stamp-library.ts:13-34`. Fields: `id`, `label`, `labelNl?`, `discipline`, `category` (`'terminal' | 'equipment' | 'fitting'`), `nativeWidth`, `nativeHeight` (PDF points), `ports` (fractions), `iconRef`, `source` (`'library' | 'custom'`), `definitionPortGroups?`, `shapes?`.
- `getStampDefinition(id, customDefs)` (`stamp-library.ts:41-43`) checks the custom list first, then the built-in library. A custom definition with a library id **overrides** the library stamp. `StampsPanel` hides the shadowed library entry (`StampsPanel.tsx:78`).
- Custom definitions live in the project document (`ProjectDocument.customStampDefinitions`, `packages/core/src/project.ts:28`). They travel inside the PDF.
- A `PlacedStamp` (`packages/core/src/stamp.ts:8-24`) stores `definitionId`, `category`, `nativeWidth`, `nativeHeight` and a **copy of the ports**. It stores no image.
- **A placed stamp whose definition is missing is dropped without a warning** (`scene.ts:3217-3220`). This is the main risk of this feature (see §6).
- Rendering: `loadDefinitionBitmap` (`packages/ui/src/stampBitmap.ts:49`) uses `shapes` when present, else it fetches `iconRef`. SVG goes through `<img>` and `<canvas>`, so scripts in an SVG do not run.
- The Element Editor "Import image" path builds a single `image` shape from a data URL (`ElementEditorDialog.tsx:202-228`, accepts `image/png,image/svg+xml` at `:416`).
- `SVG_UNIT_TO_PT = 0.18` is in `scripts/generate-stamp-library.mjs` (about `:96`). The built-in SVGs use this scale.
- The Stamps panel filters in `getVisibleStampDefinitions` (`StampsPanel.tsx:69-90`). It uses `discipline` and `category`. It has no notion of a source.
- Label layouts, hidden-label lists and per-stamp appearance defaults are keyed by definition id. Stable ids keep them working.
- Related open issue (memory note "Stamp DPI scaling issue"): placed PNG stamps are about 2.2 times too large. The code assumes 300 DPI. See §8 question 1.
- Typings for `showDirectoryPicker` do not exist in `packages/ui/src/file-system-access.d.ts`.

## 4. Data model

### 4.1 Records in the `LibraryStore`

```ts
interface LibrarySourceRecord {
  id: string;               // random UUID, created when the user adds the folder
  name: string;             // shown in the UI, default = folder name
  category: 'terminal' | 'equipment';
  discipline: Discipline;   // default discipline for stamps from this source
  dirHandle?: FileSystemDirectoryHandle;  // only used by "Sync"
  lastSyncedAt?: number;
}

interface LibraryStampRecord {
  id: string;               // see 4.2
  sourceId: string;
  fileName: string;         // as found in the folder, with extension
  mimeType: 'image/svg+xml' | 'image/png' | 'image/jpeg';
  fileSize: number;
  fileModified: number;     // file lastModified, used by the sync diff
  missingFromFolder: boolean;
  // Values from the file (a sync may overwrite these):
  nativeWidth: number;
  nativeHeight: number;
  // Values the user edited (a sync must never overwrite these):
  edits: {
    label?: string;
    discipline?: Discipline;
    ports?: PortSpec[];
    nativeWidth?: number;
    nativeHeight?: number;
  };
}
```

The image bytes live in the separate blob store. `listStamps` returns records without bytes.

**Why `edits` is separate:** a sync re-reads the file. It must update the image and size. It must not remove the ports the user added. The effective value of a field is `edits.x ?? file value`.

### 4.2 Stamp ids

`user-<sourceId>-<slug of file name without extension>`

- The `user-` prefix makes a collision with a built-in id impossible. Built-in ids are plain slugs (the generator uses `slugify`). **Verify that no built-in id starts with `user-`.** Add a unit test for it.
- The id depends on the file name. A renamed file is a new stamp. The old one becomes "missing from folder". This is acceptable for a first version. Document it in the UI help text.
- Two files with the same name but different extensions (`pump.svg` and `pump.png`) get a suffix: the extension. Decide the exact rule in Phase 1 and test it.

### 4.3 `StampDefinition` changes

- Add `'user'` to the `source` union. Audit every `source === 'custom'` and `source === 'library'` check in the repo. List them in this file when Phase 1 is done.
- The definition built from a record has:
  - `shapes: [{ kind: 'image', dataUrl, x: 0, y: 0, width: 1, height: 1 }]`
  - `iconRef`: a URL for the image (see §5, Phase 3, on object URLs)
  - `ports`: `edits.ports ?? []`
  - `label`: `edits.label ?? humanize(file name)`
  - `labelNl`: not set.

### 4.4 Size from the file

- **SVG:** read `viewBox`, else `width` and `height` (strip the unit). Multiply by `SVG_UNIT_TO_PT` (0.18). Use a string/regex parse in `core` (no DOM dependency in `core`). If none of these exists, `ui` decodes the SVG with an `<img>` and uses the natural size.
- **PNG and JPEG:** `ui` decodes the file and reads the pixel size. The point size is `pixels * 72 / RASTER_IMPORT_DPI`. Keep the DPI in one constant. See §8 question 1.

## 5. Phases

### Phase 1 — Core logic (pure code, tested)

In `@mepapp/core`:

1. The record types from §4.1 (or in `platform`, per the decision in [[storage-interfaces]] §3.1).
2. `userStampId(sourceId, fileName, takenIds)`.
3. `parseSvgIntrinsicSize(svgText)` (string-based).
4. `buildUserStampDefinition(record, imageDataUrl)`.
5. `diffFolderScan(existingRecords, scannedFiles)`. It returns `added`, `updated` (modified time or size changed), `unchanged`, `missing`. Pure function.
6. Add `source: 'user'` and fix all checks found by the audit.

Tests (vitest, in `core`): id rules, the `user-` prefix versus all built-in ids, SVG size parse (viewBox with an offset, width and height with units, none), the sync diff (rename, removal, edit survives update).

Verify: `pnpm --filter @mepapp/core test` and a root `pnpm build`.

### Phase 2 — Storage

Do [[storage-interfaces]] Phase 1 and Phase 2 first, or do them here. Then:

1. Create the `IndexedDbLibraryStore` instance in `apps/web` and give it to the UI through the same prop pattern the app already uses (see `resolveIconUrl` in `App.tsx:87`).
2. Request persistent storage when the first source is added.

### Phase 3 — Folder scan and sync (in `packages/ui`)

1. Add `showDirectoryPicker` to `file-system-access.d.ts`. Add `queryPermission` and `requestPermission` for directory handles.
2. A `scanLibraryFolder(dirHandle)` function. It reads the top level of the folder. It keeps files with the extensions `.svg`, `.png`, `.jpg`, `.jpeg` (case-insensitive). It does not read subfolders in this version.
3. A `syncSource(sourceId)` function:
   1. Ask for read permission (this runs inside the Sync click).
   2. Scan. Decode each new or changed file for its size.
   3. Call `diffFolderScan`. Write the changes with `putStamp`. Mark missing files. Never delete a stamp during a sync.
   4. Return a summary: counts of added, updated, missing.
4. A list of `UserStampDefinition`s in React state, built from `listStamps()`. **Do not load all image bytes into memory as data URLs.** Use `URL.createObjectURL` for the panel thumbnails. Build the full definition with a data URL shape only when the stamp is placed or embedded (a `materializeUserStamp(id)` function). Check what `resolveIconBitmap` and `getStampDefinition` need, then decide the exact shape of this split. Write the decision into this file.
5. Revoke object URLs when the list reloads.

### Phase 4 — UI

1. **A "Library folders" dialog.** Open it from a button in the Stamps panel header.
   - It lists the sources: name, category, discipline, stamp count, last sync time.
   - Buttons: **Add folder** (picker, then name, category and discipline fields), **Sync**, **Remove** (asks for confirmation, removes the source and its stamps).
   - It starts with a short explanation: MepApp copies the files. Press Sync to pick up changes.
   - On Firefox and Safari it shows "Not available in this browser" and disables the buttons.
2. **Stamps panel.** Merge the user stamps into the visible list.
   - They follow the same discipline and category filters. Their category comes from the source.
   - The search box searches the label.
   - Show a small marker on a user tile.
   - A stamp whose file is missing keeps working. Show a small warning marker on the tile.
   - `getVisibleStampDefinitions` has no tests today. Add tests for the new merge.
3. **A custom stamp with the same id in the project.** See Phase 5. The panel must show **one** tile per id.

### Phase 5 — Placement and the missing-definition risk

1. **Copy on first placement.** When the user places a user stamp, and the project has no definition with that id, MepApp adds a copy of the full definition to `customStampDefinitions` with `source: 'user'`. The project and the PDF then carry the stamp art and ports. A colleague without the folder still sees the stamps.
2. **No duplicate tile.** The project copy and the library entry share one id. The panel shows the library entry and skips project copies with `source: 'user'`.
3. **A project from another machine** has a `source: 'user'` definition and no library entry. The panel shows it in the project's custom list, as it does today for custom stamps.
4. `getStampDefinition` checks custom first. The project copy wins over the live library entry. This is the snapshot rule (see §6, point 2).
5. Check `placeStampTool.ts:54` and the category-to-tool mapping (`StampsPanel.tsx:97`) with `category` from the source.

### Phase 6 — Ports (editing)

1. A "Edit stamp…" button on a user tile opens the Element Editor with the materialized definition.
2. **On Save, write back to the `LibraryStore`.** Write `edits.ports`, `edits.label`, `edits.discipline`, `edits.nativeWidth` and `edits.nativeHeight`. Do not create a project copy. This differs from the built-in flow, which duplicates into the project.
3. The Element Editor currently re-rasterizes the shapes to a PNG at save. For a user stamp, keep the original file as the source image. Check how `ElementEditorDialog.tsx` saves, and do not replace the user's SVG with a PNG.
4. Placed stamps keep their old ports (snapshot rule). Changing the library does not move connections in an open project.
5. The name collision check in the Element Editor must include the user stamps.

### Phase 7 — Tests and verification

- Core unit tests (Phase 1) and store contract tests (Phase 2).
- A browser check of the whole flow. Playwright cannot drive the native directory picker. Follow the memory note "Playwright verification gotchas". Stub `showDirectoryPicker` with a fake directory handle that returns real files from `fixtures/stamps/`. The fixtures policy in CLAUDE.md says: use real files, never synthetic ones.
- **Verify through the real DOM**, not through the scene API only (memory note "Verify UI wiring via real DOM").
- A check by the user on Windows with their own folders of terminals and equipment: add both folders, sync, place a stamp, add ports, close the browser, open it again, check that the stamps and ports are still there with no prompt.
- A check that a PDF saved with a placed user stamp opens on a browser profile without the library, and the stamp is still there.

## 6. Risks and rules

1. **Missing definition = silent loss.** The app drops placed stamps whose definition is missing. Phase 5 point 1 (copy on first placement) removes this risk for user stamps. Do not skip it.
2. **Snapshot rule.** A project copy never updates itself from the library. This is simple and safe. The cost: a library port fix does not reach old projects. A later "Update from library" action could do it. It is out of scope here.
3. **Browser eviction.** IndexedDB data can be cleared. `navigator.storage.persist()` helps. A library export for backup is out of scope for now. The files are still in the user's folder, so a new Sync restores the images. **The port edits would be lost.** This is the main argument for a later export, or for writing `.mepconfig.json` next to the files. Raise it with the user after the first version.
4. **Large libraries.** The built-in library already has 166 stamps and no lazy thumbnail loading. A user folder can be larger. Use object URLs and avoid decoding every file at once. Decode in small batches during a sync.
5. **JPEG has no transparency.** A JPEG stamp draws a white rectangle. Show a note in the Library dialog help text. A "make white transparent" option is out of scope.
6. **Pure black art and recoloring.** Image stamps recolor through the luminance blend in `colorize.ts` (memory note "PixiJS tint/colorize fix"). Check that a user SVG with colors behaves the same as a built-in one.
7. **Folder blocked by Chrome.** Chrome may refuse some system folders. Show the browser's error in plain words, and suggest a subfolder.
8. **SVG safety.** Never insert user SVG into the page as markup. Load it only through `<img>`, `<canvas>` and data URLs.
9. **License.** Only free dependencies. `fake-indexeddb` is MIT. Add dev dependencies by hand to `package.json` and run a plain `pnpm install`.

## 7. Out of scope

- Converting SVG to editable vector shapes.
- Reading subfolders.
- Reading or writing `.mepconfig.json` sidecar files next to the images.
- Library export, import and backup.
- Cloud sync and shared team libraries (paid tier, later).
- Firefox and Safari.
- Dutch labels for user stamps.
- Making white transparent in JPEG files.
- An "Update from library" action for placed stamps.

## 8. Open questions for the user

1. **Raster size.** What size should a PNG or JPEG get when it has no physical size? The suggestion is 300 DPI, as in the current code. The existing PNG stamps come out about 2.2 times too large (open issue, fix direction undecided). Decide this together with that issue, or give raster imports a size field in the Library dialog.
2. **Sources.** Is a list of sources enough (each with a category), or do you want exactly two fixed slots, "Terminals" and "Equipment"? The plan uses the list. The dialog can start with two suggested rows.
3. **Library edit versus project copy.** After the user edits ports in the library, should the open project update its copy? The plan says no (snapshot rule).
4. **Export of port edits.** Do you want a backup route for the port edits in the first version? The simplest route is a sidecar `.mepconfig.json` written next to each image. That needs write permission on the folder.

## 9. Phase status

| Phase | Status |
|---|---|
| 1 Core logic | not started |
| 2 Storage (shared with [[storage-interfaces]] Phase 2) | not started |
| 3 Folder scan and sync | not started |
| 4 UI | not started |
| 5 Placement and copy on first placement | not started |
| 6 Ports | not started |
| 7 Tests and verification | not started |

When a phase finishes, mark it here with the commit hash and a verification summary. Do not delete this file on partial completion.
