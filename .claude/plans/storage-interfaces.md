# Storage interfaces — plan

Status: **Phase 1 and Phase 2 done 2026-10-03 (`91deca8`, `5226167`). Phase 3 is optional and not started.** Written after a feasibility discussion with the user (see §1). The first consumer is [[custom-stamp-library]]. The second consumer is a later plan for replacing a PDF (see §9). Nothing in this plan needs a login or a backend.

## 1. Goal

MepApp needs to keep data outside the PDF. Examples: a custom stamp library, user settings, and the project data of a PDF that gets overwritten by a new export. Today the app has no clean place for this. This plan adds that place: a small set of storage interfaces in `@mepapp/platform`, with one implementation per target.

The reason is the product direction the user chose on 2026-10-02:

- **Free tier:** everything stays on the user's machine. No login.
- **Paid tier (later):** sync across devices, team-shared libraries, backup. These use a cloud drive (OneDrive, Google Drive, Dropbox) or an own backend.
- **Desktop app (later):** the same interfaces, with plain file access and no permission prompts.

App code must not know which implementation runs. Then a later cloud or backend implementation is an addition, not a rewrite.

## 2. Findings from the survey (2026-10-02)

These come from one read-only survey. The line numbers were not re-checked one by one. Check each one before you depend on it.

- `packages/platform/src/index.ts` has only a comment and `export {}`. `platform-web` and `platform-tauri` also have only `export {}`. Nothing imports `@mepapp/platform`.
- All file access sits in `packages/ui/src/App.tsx`: `supportsFileSystemAccess()` (`:89-97`), `showOpenFilePicker`, `showSaveFilePicker`. Typings are in `packages/ui/src/file-system-access.d.ts`. That file does not declare `showDirectoryPicker`.
- There is no IndexedDB code in the repo. There is no `FileSystemHandle` persistence. There is no secure storage.
- Per-installation data lives in `localStorage` only, in several unrelated places:
  - `packages/ui/src/schematicSymbolStorage.ts` (`mepapp.schematicSymbols`) and `schematicTemplateStorage.ts`.
  - `packages/ui/src/stampAppearanceDefaults.ts`.
  - Buildings, label visibility, snap and language settings in `App.tsx` (about `:100-150` and `:303-376`).
- Project data is embedded in the PDF as an embedded file (`EMBEDDED_PROJECT_FILENAME`, `scene.ts` about `:3271`). Export is at about `scene.ts:3074`. Import is at about `scene.ts:3129`.
- The service worker `apps/web/public/sw.js` does not affect local handles.

## 3. Design

### 3.1 Package layout

- `@mepapp/platform`: the interfaces and the shared record types. Type-only. No browser API calls except the pure helpers listed in §3.4.
- `@mepapp/platform-web`: the browser implementations (IndexedDB, File System Access API).
- `@mepapp/platform-tauri`: stays a stub until the Tauri app exists.

**Decision to confirm in Phase 1:** `@mepapp/platform` may import types from `@mepapp/core` (type-only). `core` must never import `platform`. Check that no dependency cycle appears. If a cycle appears, keep the record types in `core` instead and let `platform` import them.

### 3.2 Common ideas

All three stores follow the same rules.

- Every call is async.
- Every store has a `status()` call. It returns `'ready'`, `'needs-permission'`, or `'unavailable'`. The value `'needs-permission'` means the browser needs a user click before the store can read or write. This is the "re-connect" case for a folder handle.
- Every store has a `requestAccess()` call. The UI calls it from a click handler. A browser only grants permission inside a user gesture (a click or key press). The store never prompts by itself.
- Every store has a `capabilities` object with plain booleans. Example fields: `persistent` (data survives a browser data clear), `needsUserGesture`, `shareable`, `worksOffline`. The UI uses these to show or hide controls. The UI never checks the implementation name.
- A stored record has a `revision` string. A write passes the revision it read. The store rejects the write if the revision changed (a conflict). The IndexedDB implementation uses a counter. A cloud implementation would use the provider's ETag (a version tag).

### 3.3 The three interfaces

**`LibraryStore`** keeps the user's stamp library. This is the first one to implement. Sketch (names are not final):

```ts
interface LibraryStore {
  readonly capabilities: StoreCapabilities;
  status(): Promise<StoreStatus>;
  requestAccess(): Promise<StoreStatus>;
  listSources(): Promise<LibrarySourceRecord[]>;
  putSource(source: LibrarySourceRecord): Promise<void>;
  removeSource(sourceId: string): Promise<void>;      // also removes its stamps
  listStamps(sourceId?: string): Promise<LibraryStampRecord[]>;   // no blob bytes
  getStampBlob(stampId: string): Promise<Blob | undefined>;
  putStamp(record: LibraryStampRecord, blob?: Blob): Promise<void>;
  removeStamp(stampId: string): Promise<void>;
}
```

The record types are defined in [[custom-stamp-library]] §4. `listStamps` must not load the image bytes. A library can hold hundreds of files.

**`ProjectStore`** keeps the sidecar data of one PDF project. **This interface is provisional.** The Replace-PDF plan (§9) fixes its final shape. Sketch:

```ts
interface ProjectStore {
  readonly capabilities: StoreCapabilities;
  status(): Promise<StoreStatus>;
  requestAccess(): Promise<StoreStatus>;
  read(key: ProjectKey): Promise<{ json: string; revision: string } | undefined>;
  write(key: ProjectKey, json: string, expectedRevision?: string): Promise<{ revision: string }>;
}
```

`ProjectKey` identifies the PDF. For a directory implementation it holds the PDF file name and the folder handle id. The store treats the JSON as an opaque string. `core` validates and migrates it (`project.ts` schema steps).

**`SettingsStore`** is a small async key-value store for per-installation settings. It replaces the scattered `localStorage` calls over time. The first implementation wraps `localStorage`. Sketch: `get(key)`, `set(key, value)`, `remove(key)`, `keys(prefix)`. Values are JSON strings. This interface is scaffolding only. Phase 1 does not move any existing call site.

### 3.4 Pure helpers

Put these in `@mepapp/platform` because several implementations share them and they have no browser dependency:

- A key naming rule: all keys start with `mepapp.`.
- A revision-check helper that throws a typed `StoreConflictError`.
- A typed `StoreUnavailableError`.

## 4. Phases

### Phase 1 — Interfaces and an in-memory implementation

No UI. No user-visible change.

1. Confirm the dependency direction from §3.1.
2. Write the three interfaces, the shared types, and the two error types in `@mepapp/platform`.
3. Write an in-memory implementation of each interface in `@mepapp/platform` (used by tests and by other packages' tests).
4. Write a contract test suite (a set of tests that every implementation must pass). Run it against the in-memory implementation. Later implementations reuse the same suite.
5. Wire `@mepapp/platform` into `packages/ui` as a dependency. Do not use it yet.

Verify: `pnpm build` at the root, then the vitest run for `@mepapp/platform`. The CLAUDE.md note says `core` is the only package with real tests today. Check that vitest runs in `platform` and add the config if it does not.

**Done 2026-10-03 (`91deca8`).** Decision for §3.1: `platform` imports `Discipline` and `PortSpec` from `core` with `import type`. `core` does not import `platform`. No cycle. The record types live in `platform/src/library-store.ts`. A record carries an optional `revision`. A put with no `revision` writes without a check. A put returns the new revision. The contract suites are `platform/src/contract/*.contract.ts`. The build excludes them, and other packages import them by relative path. Verified: root `pnpm build` passes (9 tasks). `@mepapp/platform` vitest: 31 tests pass. The test files also pass a `tsc --noEmit` check. `@mepapp/core`: 628 tests still pass.

### Phase 2 — IndexedDB `LibraryStore` (in `platform-web`)

1. Add `IndexedDbLibraryStore`. Database name `mepapp-library`. Object stores: `sources`, `stamps` (metadata), `blobs` (the files).
2. Request persistent storage with `navigator.storage.persist()` the first time a source is added. Report the result in `capabilities.persistent`.
3. Run the Phase 1 contract suite against it with `fake-indexeddb` (a free MIT-licensed test library). **Add the line to `package.json` by hand and run a plain `pnpm install`.** A `pnpm add` rewrites about 290 lockfile lines (see the memory note on the lockfile).
4. Handle the database version upgrade path from day one (an `onupgradeneeded` step list), because users will have data in it.

This phase is the shared start of [[custom-stamp-library]] Phase 2. Whichever plan starts first does this phase. Mark it done in both files.

**Done 2026-10-03 (`5226167`).** `IndexedDbLibraryStore` is in `platform-web/src/indexeddb-library-store.ts`. It also has a `meta` object store that holds the revision counter, so revisions do not repeat after a reopen. Blobs are stored as `{ type, bytes: ArrayBuffer }`, because `fake-indexeddb` in Node does not clone a `Blob` reliably. The option `indexedDB: null` means "no IndexedDB" (used by a test). `fake-indexeddb` is 6.2.5, licence **Apache-2.0** (not MIT), a dev dependency only. `platform-web/vitest.config.ts` aliases `@mepapp/platform` to its source, so the store and the contract suite share one `StoreConflictError` class. Lockfile diff: 13 lines. Verified: root `pnpm build` passes. `platform-web` vitest: 20 tests pass (14 contract tests, plus reopen, revision after reopen, three `persist()` cases, unavailable store). **Not verified:** the Windows browser check from §7 (close the browser, reopen, data still there). This check needs a UI, which arrives with [[custom-stamp-library]] Phase 2.

### Phase 3 — `SettingsStore` over `localStorage`

1. Add `LocalStorageSettingsStore`.
2. Move **one** existing setting to it as a proof (suggest label visibility, a small one). Leave the others.
3. Record in this file which call sites still use `localStorage` directly.

This phase is optional. Do it when the paid tier needs settings sync.

### Phase 4 — `ProjectStore` implementations

Not part of this plan. See §9. The directory-handle implementation and the IndexedDB fallback belong to the Replace-PDF plan.

### Later (no plan yet)

- Tauri implementations (plain file system, no prompts) when `apps/desktop` exists.
- Cloud implementations for the paid tier. They live in their own packages. They must not add a paid or non-free dependency to the free packages (AGPLv3 rule in CLAUDE.md).
- A backend implementation, if the user decides to run one. Supabase is Apache-2.0 and self-hostable. The hosted service is paid. This is a business decision.

## 5. Out of scope

- Any UI.
- Login, OAuth, accounts.
- Moving existing `localStorage` data.
- Firefox and Safari. The user decided on 2026-10-02 to skip them for now. The IndexedDB `LibraryStore` works there. The folder picker does not.

## 6. Risks and points to verify

- **Browser eviction:** IndexedDB data can disappear if the browser clears site data. `navigator.storage.persist()` reduces the risk. It does not remove it. The library plan adds an export for backup later.
- **Permission lifetime:** Chrome may keep a folder grant longer for an installed PWA. The survey did not verify this. Test it before the Replace-PDF plan decides how often it asks the user to re-connect.
- **Blocked folders:** Chrome may refuse `showDirectoryPicker` for some system folders (the top level of Documents, Desktop, Downloads). Test this on Windows.

## 7. Verification

- Unit tests (contract suite) for every implementation.
- A Windows check by the user for Phase 2: add data, close the browser, open it again, check that the data is still there.

## 8. Open questions

1. ~~Is `core` allowed to be a type dependency of `platform`?~~ Yes. Decided in Phase 1: type-only imports, no cycle.
2. Should `StoreCapabilities` include a `maxBlobBytes` field? IndexedDB has quota limits that differ per browser.

## 9. Consumers

- [[custom-stamp-library]] uses `LibraryStore`.
- A later **Replace-PDF plan** uses `ProjectStore`. The user's view (2026-10-02): replacing a PDF is mostly a copy of all objects onto the new PDF. All positions are absolute PDF coordinates. The user must provide a PDF of the same size, orientation and scale. The case that matters most is the one where the new PDF overwrites the old file. In that case the project data must live in a sidecar file next to the PDF, as in MEPSketcher. The existing export and import of the project JSON in `scene.ts` already serializes the project. That plan decides which copy wins when both an embedded copy and a sidecar exist.
