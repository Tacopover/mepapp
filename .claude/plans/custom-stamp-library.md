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
- **Raster size = a default (user answer 2026-10-02).** A PNG or JPEG gets a fixed default size. The user adjusts it later. A global scale property (as in MEPSketcher) may follow at some time. See §4.4.
- **One load button per category (user answer 2026-10-02).** The Terminals view has a "Load custom terminals" button. The Equipment view has a "Load custom equipment" button. Each button opens the folder picker with the category already set. The user can press a button again to add another folder. The data model stays a list of sources (§4.1). Only the entry points are per category.
- **Port edits update placed stamps (user answer 2026-10-02).** An edit in the library also updates the stamps already placed in the open project. The app already does this for custom stamps. It warns the user when removed ports have connected segments. See Phase 6.
- **A backup of the port data is wanted (user answer 2026-10-02),** as a nice-to-have. See Phase 8.

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
- Related open issue (memory note "Stamp DPI scaling issue"): placed PNG stamps are about 2.2 times too large. The code assumes 300 DPI. This plan avoids the issue for user stamps by using a default size (§4.4).
- **Checked on 2026-10-02:** the app already applies a changed definition to placed stamps. `applyDefinitionToPlacedStamps` is in `App.tsx:703-713`. It updates ports and size at once, and loads the new art. `SketchScene.countLostPortConnections(definitionId, ports)` (`scene.ts:2220`) counts the segment ends that lose a port. The Element Editor calls it before a save (`ElementEditorDialog.tsx:308`, passed in at `App.tsx:1159`). `updateCustomStampDefinition` (`scene.ts:2200`) does nothing if the id is not in the project's custom list. This matters for Phase 6.
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
- **PNG and JPEG:** `ui` decodes the file and reads the pixel size, only to get the aspect ratio. The stamp size is a default: the longer side is `USER_RASTER_DEFAULT_LONG_SIDE_PT`, and the other side follows the aspect ratio. Keep this value in one named constant. Start with **40 pt**. That is the median `nativeWidth` of the 167 built-in stamps (measured 2026-10-02: minimum 10.8, median 40.33, maximum 208.15). The user will adjust the value later. The user can also change the size of one stamp in the Element Editor (`edits.nativeWidth` and `edits.nativeHeight`). A global scale property is a possible later addition. It is not part of this plan.

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

1. **Load buttons, one per category.** The Terminals view of the Stamps panel has "Load custom terminals". The Equipment view has "Load custom equipment". Each opens the folder picker, then asks for a name and a discipline. The category is already set by the button.
2. **A "Library folders" dialog** for management. Open it from a button in the Stamps panel header.
   - It lists the sources: name, category, discipline, stamp count, last sync time.
   - Buttons: **Sync**, **Remove** (asks for confirmation, removes the source and its stamps). It can also add a folder, with the category as a field.
   - It starts with a short explanation: MepApp copies the files. Press Sync to pick up changes.
   - On Firefox and Safari it shows "Not available in this browser" and disables the buttons.
3. **Stamps panel.** Merge the user stamps into the visible list.
   - They follow the same discipline and category filters. Their category comes from the source.
   - The search box searches the label.
   - Show a small marker on a user tile.
   - A stamp whose file is missing keeps working. Show a small warning marker on the tile.
   - `getVisibleStampDefinitions` has no tests today. Add tests for the new merge.
4. **A custom stamp with the same id in the project.** See Phase 5. The panel must show **one** tile per id.

### Phase 5 — Placement and the missing-definition risk

1. **Copy on first placement.** When the user places a user stamp, and the project has no definition with that id, MepApp adds a copy of the full definition to `customStampDefinitions` with `source: 'user'`. The project and the PDF then carry the stamp art and ports. A colleague without the folder still sees the stamps.
2. **No duplicate tile.** The project copy and the library entry share one id. The panel shows the library entry and skips project copies with `source: 'user'`.
3. **A project from another machine** has a `source: 'user'` definition and no library entry. The panel shows it in the project's custom list, as it does today for custom stamps.
4. `getStampDefinition` checks custom first. The project copy wins over the live library entry. A library edit still reaches the open project through Phase 6 point 3. A project that is not open keeps its copy (see §6, point 2).
5. Check `placeStampTool.ts:54` and the category-to-tool mapping (`StampsPanel.tsx:97`) with `category` from the source.

### Phase 6 — Ports (editing)

1. A "Edit stamp…" button on a user tile opens the Element Editor with the materialized definition.
2. **On Save, write to the `LibraryStore`.** Write `edits.ports`, `edits.label`, `edits.discipline`, `edits.nativeWidth` and `edits.nativeHeight`.
3. **Then update the open project (user decision 2026-10-02).** If the project has a copy of this id in `customStampDefinitions` (Phase 5 makes one at first placement), call `updateCustomStampDefinition` and then `applyDefinitionToPlacedStamps`. This is the existing path in `handleSaveElementDefinition` (`App.tsx:715-734`). If the project has no copy, nothing is placed, so there is nothing to update.
4. **Warn about lost connections.** The Element Editor already calls `countLostPortConnections` before the save and warns the user (`ElementEditorDialog.tsx:308`). Check that this warning still works when the saved stamp is a user stamp. The count reads the placed stamps by `definitionId`, so it should. Test it with a segment connected to a port that the user removes.
5. The Element Editor currently re-rasterizes the shapes to a PNG at save. For a user stamp, keep the original file as the source image. Check how `ElementEditorDialog.tsx` saves, and do not replace the user's SVG with a PNG.
6. The name collision check in the Element Editor must include the user stamps.
7. **Other projects.** A PDF that was saved earlier holds its own copy of the definition. It does not update when the library changes. The user's decision covers the open project. Whether to refresh old copies when a PDF opens is not decided. Do not build it in this plan. See §8 question 3.

### Phase 7 — Tests and verification (run after Phase 6; Phase 8 adds its own checks)

- Core unit tests (Phase 1) and store contract tests (Phase 2).
- A browser check of the whole flow. Playwright cannot drive the native directory picker. Follow the memory note "Playwright verification gotchas". Stub `showDirectoryPicker` with a fake directory handle that returns real files from `fixtures/stamps/`. The fixtures policy in CLAUDE.md says: use real files, never synthetic ones.
- **Verify through the real DOM**, not through the scene API only (memory note "Verify UI wiring via real DOM").
- A check by the user on Windows with their own folders of terminals and equipment: add both folders, sync, place a stamp, add ports, close the browser, open it again, check that the stamps and ports are still there with no prompt.
- A check that a PDF saved with a placed user stamp opens on a browser profile without the library, and the stamp is still there.

### Phase 8 — Port data backup (nice to have)

The user wants a backup of the port data. The port edits exist only in IndexedDB, which the browser can clear. The images can be synced again from the folder. The port edits cannot.

**Recommended route: a sidecar file next to each image.** The built-in library already uses a `.mepconfig.json` file per stamp for ports (read by `scripts/generate-stamp-library.mjs`). Check that format first and reuse it, so the old app and MepApp read the same file.

1. After a port edit, if the folder handle has write permission, write `<file name>.mepconfig.json` into the source folder. If the handle has no write permission, ask for it in the Save click (a user gesture). If the user declines, skip the backup and say so in the status text.
2. During a Sync, read a sidecar file when one exists and no `edits.ports` exist yet. This restores the ports on a new machine or after the browser data was cleared.
3. A conflict rule is needed when the sidecar and `edits.ports` both exist and differ. Suggested rule: the newer modified time wins. Decide this in this phase, and write it here.
4. The sidecar also travels with the folder if the user syncs it with OneDrive. That gives a simple cross-device route without a backend.

**Alternative, if the folder write permission is a problem:** a "Download library backup" button that saves one JSON file with all `edits`. A "Restore from backup" button reads it back. This needs no folder write access.

Tests: a round-trip of the sidecar (write, clear the store, sync, compare ports).

## 6. Risks and rules

1. **Missing definition = silent loss.** The app drops placed stamps whose definition is missing. Phase 5 point 1 (copy on first placement) removes this risk for user stamps. Do not skip it.
2. **Old projects keep their copy.** A library edit updates the open project (Phase 6 point 3). A PDF that is not open keeps its embedded copy, so a library port fix does not reach it. This is safe. A later "Update from library" action on open could change it. It is out of scope here.
3. **Browser eviction.** IndexedDB data can be cleared. `navigator.storage.persist()` helps. The files are still in the user's folder, so a new Sync restores the images. **The port edits would be lost.** Phase 8 (backup) removes this risk. Until Phase 8 is done, tell the user about it.
4. **Large libraries.** The built-in library already has 166 stamps and no lazy thumbnail loading. A user folder can be larger. Use object URLs and avoid decoding every file at once. Decode in small batches during a sync.
5. **JPEG has no transparency.** A JPEG stamp draws a white rectangle. Show a note in the Library dialog help text. A "make white transparent" option is out of scope.
6. **Pure black art and recoloring.** Image stamps recolor through the luminance blend in `colorize.ts` (memory note "PixiJS tint/colorize fix"). Check that a user SVG with colors behaves the same as a built-in one.
7. **Folder blocked by Chrome.** Chrome may refuse some system folders. Show the browser's error in plain words, and suggest a subfolder.
8. **SVG safety.** Never insert user SVG into the page as markup. Load it only through `<img>`, `<canvas>` and data URLs.
9. **License.** Only free dependencies. `fake-indexeddb` is MIT. Add dev dependencies by hand to `package.json` and run a plain `pnpm install`.

## 7. Out of scope

- Converting SVG to editable vector shapes.
- Reading subfolders.
- A global scale property (a possible later addition).
- Cloud sync and shared team libraries (paid tier, later).
- Firefox and Safari.
- Dutch labels for user stamps.
- Making white transparent in JPEG files.
- An "Update from library" action that refreshes the embedded copies of stamps in PDFs that are not open.

## 8. Open questions

Answered by the user on 2026-10-02: raster size (use a default, §4.4), sources (one load button per category, §2), library edit versus project copy (the edit updates placed stamps, Phase 6), backup (wanted, Phase 8).

1. **Old projects.** Should a PDF refresh its embedded copy of a user stamp from the library when it opens? The plan says no. Decide after the first version.
2. **Backup route.** Phase 8 offers two routes: a sidecar `.mepconfig.json` next to each image, or a backup file with a download button. The plan recommends the sidecar. Confirm when Phase 8 starts.
3. **Default raster size.** 40 pt is a start value. Adjust it after the user tests it.

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
| 8 Port data backup (nice to have) | not started |

When a phase finishes, mark it here with the commit hash and a verification summary. Do not delete this file on partial completion.
