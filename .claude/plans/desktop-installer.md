# Desktop installer (Tauri) — plan

Status: **Phases 0, 1 and 2 done and merged to `master` 2026-10-09 (branch `worktree-desktop-installer-plan`). Phase 2 passed the user's Windows checks, including the confirm fix. Phases 3-5 not started.** Open decisions are in §3.

## 1. Goal

MepApp gets a desktop installer next to the web app. The desktop app runs the same React app that `apps/web` builds, inside a Tauri 2 window. The first target is a Windows installer that the user can install, update and uninstall like a normal program.

The web app at `https://app.mepsketcher.com` stays the main target. The desktop app must not fork the UI. All desktop-only behavior goes through `@mepapp/platform` (the abstract layer) and `@mepapp/platform-tauri` (its desktop implementation).

## 2. Findings from the survey (2026-10-08)

The survey was read-only. Check each line number before you depend on it.

**What already exists**

- `apps/desktop` is a real Tauri 2 project, not a placeholder. Commit `f255c94` (2026-09-05) made it. The root `CLAUDE.md` text "placeholder only (README, no code)" is out of date.
  - `apps/desktop/src-tauri/tauri.conf.json`: `frontendDist: ../../web/dist`, `devUrl: http://localhost:5173`, `beforeBuildCommand: pnpm --filter @mepapp/web build`.
  - `apps/desktop/src-tauri/Cargo.toml`: crates `tauri 2.11.3`, `tauri-plugin-log 2`. Template values are still in place: package name `app`, `authors = ["you"]`, `license = ""`.
  - `apps/desktop/src-tauri/src/lib.rs`: template code only (log plugin in debug builds).
  - `apps/desktop/src-tauri/capabilities/default.json`: `core:default` only.
  - `productName: mepapp-desktop`, `identifier: com.mepapp.desktop`, window 800 x 600.
  - `apps/desktop/src-tauri/target/release` exists. So a Linux release build ran once in this container.
- This container has `cargo` and `rustc 1.98.1`. The Windows machine probably has no Rust. Not checked.
- `@mepapp/platform-tauri` (`packages/platform-tauri/src/index.ts`) has only `export {}`.
- `@mepapp/platform` has the storage interfaces (`LibraryStore`, `ProjectStore`, `SettingsStore`) plus memory implementations. It has no interface for file access yet.
- `TESTING_CHECKLIST.md:58` and `:111` list two open desktop items: a frame-rate number and an encrypted cache.

**Browser-only code that the desktop app must handle**

- `packages/ui/src/App.tsx` calls the File System Access API directly: `supportsFileSystemAccess()` (`:112-120`), `showOpenFilePicker` (`:587`), `showSaveFilePicker` (`:671`, `:738`), `showDirectoryPicker` (`:1110`). The fallback is a hidden `<input type=file>` and an `<a download>` (`downloadBlob`, `:195-201`).
- `packages/ui/src/userStampLibrary.ts:29-31`: `supportsLibraryFolders()` checks `showDirectoryPicker`. The custom stamp library needs folder handles.
- `App.tsx:625-626`: a `beforeunload` listener warns about unsaved changes. A Tauri window close does not show that browser prompt.
- `apps/web/src/main.tsx:39-55` registers the service worker `/sw.js`. The desktop app does not need it, because all files are local.
- `apps/web/src/main.tsx:12`: `IndexedDbLibraryStore` from `@mepapp/platform-web`. IndexedDB and `localStorage` work inside the Tauri webview.
- Root-absolute URLs (`/stamps/...`, `/sw.js`) work in Tauri, because Tauri serves `frontendDist` at the root of its own origin.

**Facts about the webview**

- Windows uses WebView2 (Chromium). macOS uses WKWebView. Linux uses WebKitGTK. WKWebView and WebKitGTK do not have `showOpenFilePicker` or `showDirectoryPicker`. For WebView2 the support is not confirmed. Phase 1 checks it.
- The webview origin is `http://tauri.localhost` on Windows by default. The `dev` origin is `http://localhost:5173`. IndexedDB and `localStorage` data belong to one origin. So dev data and installed-app data are separate. A later change of the origin (for example the `useHttpsScheme` option) makes the installed app lose its stored data.

## 3. Open decisions (for the user)

Each decision has a recommendation. Phase 0 does not depend on any of them.

- **D1 — Operating systems.** Recommendation: Windows only for the first release. macOS needs an Apple Developer account (paid, yearly) for notarization (Apple's malware check that lets the app open without a warning). Linux can come later at low cost.
- **D2 — Where to build the Windows installer.** **Taken 2026-10-08 (recommendation, user said "continue with phase 1"):** GitHub Actions. Original note: recommendation GitHub Actions on a `windows-latest` runner with `tauri-apps/tauri-action`. Alternative: cross-compile from this Linux container with `cargo-xwin`. The Tauri docs list that path, but it is less tested and it cannot sign the installer with a Windows tool. Note: the `gh` CLI here has no `workflow` scope. The user must push `.github/workflows/*` files through the GitHub web UI (see memory "Subdomain deploy").
- **D3 — Product name and identifier.** **Decided 2026-10-08:** product name `mepsketcher-desktop`, identifier `com.mepsketcher.desktop`. Original note: example product name `MEPSketcher`, identifier `com.mepsketcher.app`. Decide before the first installer goes to anyone. A later identifier change makes Windows treat it as a different program. It also moves the app data folder and breaks the update chain.
- **D4 — Code signing.** An unsigned installer shows a Windows SmartScreen warning ("Windows protected your PC"). Options: (a) unsigned, for own testing only; (b) Azure Trusted Signing (a paid monthly Microsoft service); (c) a bought OV code-signing certificate. Recommendation: (a) now, decide (b) or (c) before a public release. Signing is a service, not a dependency, so it does not conflict with AGPLv3.
- **D5 — File access on desktop.** **Decided 2026-10-09: native Tauri dialogs (option B).** The user also asked to fix the missing warning on window close. Original note: recommendation a new `FileAccess` interface in `@mepapp/platform`, with a Tauri implementation that uses `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`. This gives real file paths, "Open with" and file association support, and works on every OS. Alternative: keep the browser API and depend on WebView2. That works on Windows only, and only if Phase 1 confirms the support. **Phase 1 result (2026-10-09): WebView2 supports `showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker`. The cost of the alternative is the browser permission prompts (first Save, folder access) with "site" wording.**
- **D6 — Installer type.** **Taken 2026-10-08 (recommendation):** NSIS, `installMode: currentUser`. Original note: recommendation NSIS (a `-setup.exe`). NSIS can install per user without admin rights. MSI is better for company-wide deployment through IT. Tauri can build both.

## 4. Phases

### Phase 0 — Revive the scaffold (container, no decisions needed)

**Done 2026-10-08.** Changes: both `before*Command`s build the workspace packages through turbo first. The Cargo package is `mepapp-desktop` (lib `mepapp_desktop_lib`), license `AGPL-3.0-only`, window 1400 x 900, maximized, minimum 900 x 600. `apps/web/src/main.tsx` skips the service worker when `__TAURI_INTERNALS__` is present. README and root `CLAUDE.md` are updated. `productName` and `identifier` are not changed (they wait for D3). The SPDX id `AGPL-3.0-only` is a guess: no file in the repo says "or later". Confirm it with the user.

Verification: `pnpm exec tauri build` in `apps/desktop` passed and produced `.deb`, `.rpm` and `.AppImage`. The dev pre-build (`turbo ... --filter=@mepapp/web^... --force`) built 7/7 packages with no cache. A WebDriver run (`tauri-driver` + `webkit2gtk-driver`, both installed into this container) of the release binary under Xvfb showed: origin `tauri://localhost`, `__TAURI_INTERNALS__` present, no `showOpenFilePicker`, 0 service worker registrations. The run opened `fixtures/pdfs/arch_simple_A4.pdf` through the file input ("Loaded arch_simple_A4.pdf (842.0 x 595.0 pt)") and placed a "D2 Bath" stamp (screenshot shows it, status bar "1 selected"). Not verified: `tauri dev` (the dev window), and anything on Windows. Driver script pattern: plain `fetch` calls to `http://127.0.0.1:4444`, capability `tauri:options.application`, unhide `input[type=file]` with a script before Element Send Keys.

1. Run `pnpm install` and `pnpm build` at the repo root. Then run `pnpm --filter @mepapp/desktop tauri build` in this container. Record whether the Linux build still passes.
2. Change `beforeBuildCommand` so that it builds the workspace packages first (for example `pnpm turbo run build --filter=@mepapp/web...`). The current command builds only `apps/web` and fails on a fresh checkout with no `dist/` in the packages.
3. Fill in the template values: `Cargo.toml` `name`, `description`, `authors`, `license = "AGPL-3.0-or-later"` (check the exact SPDX id against `LICENSE`), `repository`. Set the window title and a usable start size (for example 1400 x 900, maximized).
4. Skip service worker registration in the desktop build. Detect Tauri in `apps/web/src/main.tsx` (for example `'__TAURI_INTERNALS__' in window`), or use a build-time flag.
5. Update `apps/desktop/README.md` and the out-of-date line in root `CLAUDE.md`.

Verification: the Linux release build passes. `pnpm tauri dev` opens a window in the container (Xvfb), opens a fixture PDF through the `<input type=file>` fallback, and places a stamp. Playwright cannot drive the Tauri webview directly. Use screenshots, or a WebDriver setup (`tauri-driver`) if that is not too heavy.

### Phase 1 — First Windows installer (needs D2, D6)

1. Add `.github/workflows/build-desktop.yml`. Trigger: `workflow_dispatch` and tags `desktop-v*`. Never on a push to `master` (that trigger publishes the web app).
2. The job runs on `windows-latest`: pnpm install, root build, `tauri-action`. It uploads the NSIS `.exe` as a workflow artifact first. A GitHub Release comes in Phase 4.
3. Add the AGPLv3 license page to the installer (`bundle.windows.nsis` license option pointing at `LICENSE`).
4. The user installs the `.exe` on the Windows machine and runs a test checklist. The checklist covers: open PDF, save, Save As, export Excel, custom stamp folder, room detection (Web Worker), MuPDF WASM load, offline start, stored settings after a restart, uninstall.
5. The checklist also records which browser file APIs WebView2 supports. That result feeds D5.

Verification: the user's checklist result on Windows. The container cannot run the Windows installer.

**Progress 2026-10-08.** Done in the container: `productName` `mepsketcher-desktop`, `identifier` `com.mepsketcher.desktop`; Cargo package `mepsketcher-desktop` (lib `mepsketcher_desktop_lib`); `bundle.license` + `bundle.licenseFile` (`../../../LICENSE`, used by the NSIS license page); `bundle.windows.nsis.installMode: currentUser`. `.github/workflows/build-desktop.yml` runs `pnpm exec tauri build --bundles nsis` on `windows-latest` and uploads the `.exe` as the artifact `mepsketcher-desktop-windows-nsis`. It uses no `tauri-action` (no release yet). Verified here: a Linux `--bundles deb` build with the new config passed (package `mepsketcher-desktop`). Not verified: the workflow itself, the NSIS build, the license page. `workflow_dispatch` shows in the Actions UI only when the file is on `master`.

**First Windows run 2026-10-09:** the user committed the workflow through the web UI (`243db19`). Tag `desktop-v0.1.0-test.1` started run `37913699823`. It passed in 4 min 54 s and produced `mepsketcher-desktop_0.1.0_x64-setup.exe` (artifact `mepsketcher-desktop-windows-nsis`, 6.6 MB zip). Only warning: actions `checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `pnpm/action-setup@v4` target Node.js 20 (deprecated, forced to Node.js 24). The deploy workflow uses the same versions. Next: the user runs the checklist below.

**Windows test checklist** (the user fills in the result):

Result 2026-10-09 (user report: "installer works fine"). Items with no mark were not reported one by one.

- [x] The installer starts. Record the SmartScreen warning text (expected, the installer is unsigned).
- [ ] The installer shows the AGPLv3 license page and installs without an admin prompt.
- [ ] A Start menu entry exists. The app opens maximized.
- [x] Open a PDF (Menu > Open…). Record which dialog appears: the Windows file dialog through `showOpenFilePicker`, or the plain file input. **Result: a file browser opens.**
- [x] Place a stamp, draw a segment, then Save. Record: does Save write back to the same file with no dialog? **Result: Save writes back to the same file. The first Save shows the same browser permission prompt as the web version.**
- [ ] Save As writes a new file.
- [ ] Room detection runs (it uses a Web Worker).
- [ ] Export Excel produces a file.
- [x] Custom stamp library: add a folder (Record: does the folder dialog appear? This needs `showDirectoryPicker`.) **Result: the folder dialog appears. Then the browser prompt asks if "the site" may view and copy files, the same as the web version.**
- [ ] Close the app with unsaved changes. Record: does a warning appear? **Result so far: closing a PDF document inside the app warns. Closing the whole window (the X button) is not reported yet.**
- [ ] Restart the app. Settings and the custom stamp library are still there.
- [ ] Start the app with no network. It opens and loads a PDF.
- [ ] The "View the source code" link opens the correct commit in a browser.
- [ ] Uninstall through Windows Settings removes the app.

### Phase 2 — Native file access (needs D5)

1. Add a `FileAccess` interface to `@mepapp/platform`. Sketch (names are not final): `openPdf()`, `save(target, bytes)`, `saveAs(suggestedName, types, bytes)`, `pickFolder()`, `listFolder(folder)`, `readFile(folder, name)`. A file target is opaque to the UI: a `FileSystemFileHandle` on web, a path on desktop.
2. Move the current `App.tsx` and `userStampLibrary.ts` file code into a web implementation in `@mepapp/platform-web`. No behavior change on the web. This step is a pure move and can ship to the web on its own.
3. Write the Tauri implementation in `@mepapp/platform-tauri` with `plugin-dialog` and `plugin-fs`. Give the `fs` capability the smallest scope that works. Add the Cargo crates and the npm packages by hand in `package.json`, then a plain `pnpm install` (see memory "pnpm add rewrites lockfile").
4. Add a small app shell entry for the desktop build that wires the Tauri implementation. Option: a second Vite entry in `apps/web`, or a mode flag. Decide during the phase.
5. Replace the `beforeunload` prompt on desktop with the Tauri window `onCloseRequested` event and a real dialog.
6. Optional in this phase: file association for `.pdf` ("Open with MEPSketcher") plus `tauri-plugin-single-instance`, so a second open goes to the running window.

Verification: web build has the same behavior as before (Playwright, real DOM). Desktop build: Save writes back to the opened path with no dialog. A custom stamp folder survives an app restart.

**Done 2026-10-09 (container; not yet tested on Windows).**

- `@mepapp/platform/src/file-access.ts`: `FileAccess` (`openFile`, `writeFile`, `saveFileAs`, `pickFolder`, `requestFolderAccess`, `readFolder`, `capabilities.writeBack/folders`), `FileTarget` (opaque, has `name`), `LibraryFolderRef` (`{ dirHandle }` or `{ folderPath }`), `CloseGuard` (`setUnsavedChanges`). `LibrarySourceRecord` has a new optional `folderPath`; `libraryFolderOf(source)` picks the one that is set.
- `@mepapp/platform-web`: `WebFileAccess` holds the code that was in `App.tsx` and `userStampLibrary.ts` (pickers, fallback, permission). The fallback `<input type=file>` is now made per pick instead of living in the header JSX. `WebCloseGuard` holds the `beforeunload` listener. `file-system-access.d.ts` moved here from `ui`. `scanLibraryFolder` became `scanDirectoryHandle` with its test.
- `@mepapp/platform-tauri`: `TauriFileAccess` (`plugin-dialog` + `plugin-fs`, remembers the last folder so Save As starts next to the open PDF) and `TauriCloseGuard` (`onCloseRequested` + `ask`). npm `@tauri-apps/api ~2.11.1`, `plugin-dialog ~2.7.3`, `plugin-fs ~2.5.2`, matched to the crates' minor versions.
- `apps/desktop/src-tauri`: crates `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-persisted-scope` (fs registered before persisted-scope). Capabilities: `core:window:allow-destroy`, `dialog:default`, `fs:allow-read-file/write-file/read-dir/stat`. No static fs scope: only dialog-picked paths are readable, kept across restarts by persisted-scope.
- `MepSketchApp` takes required `fileAccess` and `closeGuard` props. `apps/web/src/main.tsx` picks the Tauri pair when `__TAURI_INTERNALS__` exists (dynamic import, a separate ~20 kB chunk in the web build), else the web pair.
- Not done: file association / single instance (step 6, optional). The library dialog text still says "browser storage" on desktop.

Verification: `pnpm build`, `pnpm typecheck` (17/17), `pnpm test` (all pass: core 680, ui 100, platform 32, platform-web 21, pdf-engine-mupdf 33). Web regression (Playwright, headless Chromium, `vite preview`): open through stubbed `showOpenFilePicker`, Save writes back (2687 -> 13623 bytes), Save As, `beforeunload` on a dirty document and none on a clean one, fallback file input open + removed after the pick, fallback Save downloads. Desktop (Linux release build, `tauri-driver` + Xvfb + xdotool/python-xlib for the native GTK dialogs): Open through the native dialog, Save wrote back with no dialog (2687 -> 12362 bytes), a WM close request with unsaved changes showed "Unsaved changes" with Close/Cancel and Cancel kept the window, a close with no unsaved changes exited at once, a picked library folder loaded 3 stamps, and after an app restart Sync read the folder again ("0 added, 1 updated") with no prompt, Save As opened in the PDF's folder and wrote `copy.pdf`. Not verified: Windows. Windows installer for this commit (`31c966f`): tag `desktop-v0.1.0-test.2`, run `37919664892`, passed.

**Windows test 2026-10-09:** Open/Save/Save As with no prompts, write-back, folder add + Sync after restart, warning on app close, Excel export: all OK. One failure: closing one PDF with unsaved edits (Drawings tab or header switcher) gave no warning.

**Fix 2026-10-09.** Cause: `tauri-plugin-dialog` 2.7.3 injects a script that replaces `window.confirm` with an async function calling `plugin:dialog|confirm`. No capability can allow that command (`allow-confirm` is now an alias of `allow-message`), so the call fails ("not allowed by ACL"), and `!window.confirm(...)` on a Promise is always false. Every `window.confirm` in the app was affected (close PDF, remove folder, delete/hide/revert stamps, replace stamps, schematic and template deletes). Fix: new `AppDialogs { confirm(message): Promise<boolean> }` in `@mepapp/platform`; `WebAppDialogs` (window.confirm) and `TauriAppDialogs` (plugin-dialog `confirm()`, which uses the `message` command); `MepSketchApp` takes a required `dialogs` prop and hands it to `packages/ui/src/confirmDialog.ts` (`setAppDialogs`); all 12 `window.confirm` calls in `ui` now `await confirmDialog(...)`. Rule from here on: never call `window.confirm` in `ui`. `window.alert` is still replaced by the plugin, but it uses the allowed `message` command and needs no answer.

Verification: build, typecheck, tests pass. Desktop (Linux, WebDriver + Xvfb): closing a dirty PDF from the Drawings tab showed `"copy.pdf" has unsaved changes. Close anyway?`; Cancel kept it, OK closed it; Remove folder showed its question and Cancel kept the folder. Web (Playwright): the same close showed the browser confirm; dismiss kept the document, accept closed it. The header switcher's close calls the same handler; not driven separately. Windows installer: tag `desktop-v0.1.0-test.3` (`d3c3628`), run `37926213643`, passed; the user confirmed both checks on Windows 2026-10-09.

**Step 6 and small items, 2026-10-09 (branch `desktop-small-items`; not yet tested on Windows).**

- File association: `bundle.fileAssociations` for `.pdf` (name `MEPSketcher.pdf`, role `Editor`). The installer adds MEPSketcher to "Open with" for PDF files.
- `tauri-plugin-single-instance` (registered first, desktop targets only). `src-tauri/src/lib.rs` takes the existing `.pdf` paths from the command line (at start, and from a second start that the plugin stops), adds each to the fs scope with `allow_file` (persisted-scope keeps it, so Save writes back after a restart), queues it in `OpenRequests`, and emits `open-requests`. The command `take_open_requests` empties the queue. A second start also unminimizes and focuses the window.
- `FileAccess.onOpenRequest?(handler)` (optional; only `TauriFileAccess` has it). `MepSketchApp` subscribes when the scene is ready and opens the files one at a time through `openPdfFile`.
- Window title `MEPSketcher` (was `MepApp`).
- Library dialogs: "copies the files into its own storage" instead of "browser storage", and "MEPSketcher" instead of "MepApp" in the two library dialogs and the remove-folder question.

Verification: build, typecheck (17/17), tests pass (core 680, ui 100, platform 32, platform-web 21, pdf-engine-mupdf 33); `cargo check --release` with no warnings. Desktop (Linux release build, WebDriver + Xvfb + a DBus session bus, which the plugin needs on Linux): a start with `open-a.pdf` as argument loaded it; a second start with the relative path `"open b.pdf"` plus `notes.txt` opened `open b.pdf` in the first window and ignored the `.txt`; a third start with `copy.pdf` exited with code 0 after 9 s and the first window had 3 documents; Save on `copy.pdf` wrote back with no dialog (21294 -> 63293 bytes); the visible X window title was `MEPSketcher`. Not verified: Windows (the registry entries and the Explorer double-click).

### Phase 3 — Desktop storage (optional, after Phase 2)

IndexedDB keeps working in the webview, so this phase is not needed for a first release. It becomes useful when the user wants data in a visible folder (backup, sync through OneDrive).

1. File-based `LibraryStore` and `SettingsStore` in `@mepapp/platform-tauri`, in the Tauri app data folder. Reuse the contract test suite from [[storage-interfaces]].
2. A one-time move of existing IndexedDB data into the files.
3. The encrypted cache from `TESTING_CHECKLIST.md:111` stays out of scope until a feature needs it.

### Phase 4 — Releases and updates (needs D3, D4)

1. Add `tauri-plugin-updater`. Generate an update signing key pair. The private key goes into GitHub secrets (`TAURI_SIGNING_PRIVATE_KEY`). The public key goes into `tauri.conf.json`. This key is separate from the D4 code-signing certificate. Losing the private key means installed apps can never update again, so the user must keep a backup.
2. The workflow publishes a draft GitHub Release with the installer and `latest.json` (the update manifest the plugin reads).
3. Version scheme: one version in `tauri.conf.json`, bumped per desktop release, tagged `desktop-vX.Y.Z`.
4. Show the update in the app. The feature atlas already lists an open "Update banner" item. Reuse it for both targets if possible.
5. Add code signing per D4 to the workflow.
6. The AGPLv3 source link (`correspondingSourceUrl`, built from the commit SHA) must also show in the desktop app. For a distributed program, AGPLv3 §6 needs the source offer, not §13.

Verification: install version N, publish N+1, the installed app finds and installs N+1.

### Phase 5 — Other operating systems (later, needs D1)

macOS (`.dmg`, notarization) and Linux (`.AppImage` / `.deb`) builds in the same workflow matrix. Not planned in detail.

## 5. Out of scope

- Any change to the UI that only the desktop app gets, except file dialogs, the close prompt and the update notice.
- A backend or login.
- The Microsoft Store.
