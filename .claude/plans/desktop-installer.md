# Desktop installer (Tauri) — plan

Status: **planned 2026-10-08, not started.** Open decisions are in §3. Phase 0 can start before the user answers them.

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
- **D2 — Where to build the Windows installer.** Recommendation: GitHub Actions on a `windows-latest` runner with `tauri-apps/tauri-action`. Alternative: cross-compile from this Linux container with `cargo-xwin`. The Tauri docs list that path, but it is less tested and it cannot sign the installer with a Windows tool. Note: the `gh` CLI here has no `workflow` scope. The user must push `.github/workflows/*` files through the GitHub web UI (see memory "Subdomain deploy").
- **D3 — Product name and identifier.** Example: product name `MEPSketcher`, identifier `com.mepsketcher.app`. Decide before the first installer goes to anyone. A later identifier change makes Windows treat it as a different program. It also moves the app data folder and breaks the update chain.
- **D4 — Code signing.** An unsigned installer shows a Windows SmartScreen warning ("Windows protected your PC"). Options: (a) unsigned, for own testing only; (b) Azure Trusted Signing (a paid monthly Microsoft service); (c) a bought OV code-signing certificate. Recommendation: (a) now, decide (b) or (c) before a public release. Signing is a service, not a dependency, so it does not conflict with AGPLv3.
- **D5 — File access on desktop.** Recommendation: a new `FileAccess` interface in `@mepapp/platform`, with a Tauri implementation that uses `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`. This gives real file paths, "Open with" and file association support, and works on every OS. Alternative: keep the browser API and depend on WebView2. That works on Windows only, and only if Phase 1 confirms the support.
- **D6 — Installer type.** Recommendation: NSIS (a `-setup.exe`). NSIS can install per user without admin rights. MSI is better for company-wide deployment through IT. Tauri can build both.

## 4. Phases

### Phase 0 — Revive the scaffold (container, no decisions needed)

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

### Phase 2 — Native file access (needs D5)

1. Add a `FileAccess` interface to `@mepapp/platform`. Sketch (names are not final): `openPdf()`, `save(target, bytes)`, `saveAs(suggestedName, types, bytes)`, `pickFolder()`, `listFolder(folder)`, `readFile(folder, name)`. A file target is opaque to the UI: a `FileSystemFileHandle` on web, a path on desktop.
2. Move the current `App.tsx` and `userStampLibrary.ts` file code into a web implementation in `@mepapp/platform-web`. No behavior change on the web. This step is a pure move and can ship to the web on its own.
3. Write the Tauri implementation in `@mepapp/platform-tauri` with `plugin-dialog` and `plugin-fs`. Give the `fs` capability the smallest scope that works. Add the Cargo crates and the npm packages by hand in `package.json`, then a plain `pnpm install` (see memory "pnpm add rewrites lockfile").
4. Add a small app shell entry for the desktop build that wires the Tauri implementation. Option: a second Vite entry in `apps/web`, or a mode flag. Decide during the phase.
5. Replace the `beforeunload` prompt on desktop with the Tauri window `onCloseRequested` event and a real dialog.
6. Optional in this phase: file association for `.pdf` ("Open with MEPSketcher") plus `tauri-plugin-single-instance`, so a second open goes to the running window.

Verification: web build has the same behavior as before (Playwright, real DOM). Desktop build: Save writes back to the opened path with no dialog. A custom stamp folder survives an app restart.

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
