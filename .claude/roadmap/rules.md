# Rules for every agent of the road map

Read this file first. It applies to the director and to each role in `protocol.md`.

## 1. Rules of the run

- Classify first. For a question, answer and change nothing.
- Work on the branch of the current part. Never push to master. Push the branch only.
- Write prose for the user in STE (ASD-STE100 style): plans, the dashboard, commit bodies, reports.
  - One word for one meaning. Sentences of 20 words or less for an instruction, 25 or less for an explanation.
  - Active voice. No metaphor or idiom. Define a new term in the sentence where it first appears.
  - Do not change code, identifiers, file paths, commands or quoted errors.
- Evidence before claims. Run the command and read its output before you write "done", "fixed" or "passing". Otherwise write "not verified because <reason>".
- Scope lock. Change only what the task needs. Mention other problems in the report. Do not do the items of `.claude/plans/room-type-calculations-small-fixes.md`: the user wants them later.
- Two failed fixes on the same symptom: stop and find the cause again. Do not try a third variation.
- If reality does not match the task (a file is missing, a signature is different, an API does not exist), stop and report. Do not work around it.
- No `pnpm add`. If a package is needed, write the line in `package.json` by hand and run `pnpm install`.
- No `window.confirm` in the `ui` package. Never run prettier.
- Never use `pkill -f vite`. Use `node .claude/roadmap/browser/with-server.mjs <check.mjs>` for browser checks. That script starts the server and stops it.
- Do not chain Bash commands and do not use heredocs. The harness refuses them as "too complex". Write a script to the work folder with the Write tool, then run it. One command for each Bash call.
- Commit the plan files to git. Copy each changed plan to the hub and check the copy with `cmp` (see protocol, "Hub").
- A commit message ends with the `Co-Authored-By` line from the system reminder of the session.
- Browser checks: only one Chromium page with a PDF open at a time (the container has 3.9 GB). So only one tester or UI reviewer uses the browser at a time.

## 2. Rules of the repository

- Only `@mepapp/pdf-engine-mupdf` imports `mupdf`. Everything else uses the `pdf-engine` interface.
- Only `@mepapp/core` has real test coverage (vitest). It has no rendering and no I/O.
- AGPLv3. Every dependency must be free and open. No SaaS backend.
- `fixtures/pdfs/` and `fixtures/stamps/` hold real files. Never make a placeholder fixture. The PDFs are git-ignored: they live in `/root/MepApp/fixtures/pdfs/` (the main checkout).
- `node_modules` and `dist/` do not carry over between machines. After a fresh checkout, run `pnpm install` and then `pnpm build` at the root.
- `apps/web` uses the `dist` of `@mepapp/ui`. After a UI change, run `pnpm build` again before a browser check.
- A merge can break the build with no conflict marker. After a real merge, run `pnpm build` at the root.

## 3. Domain rules of the user

These rules come from the memory files of the user. They are hard rules, not preferences.

1. **The segment defines the network type of a port.** A stamp port has no network type by default. No stamp and no stamp definition gets a default network type. A value that Auto-place writes for routing is a *routing target*, not the network type of the port. When a segment connects, the segment wins with no prompt. (User, 2026-10-15: "a stamp's port should not be part of any network type by default. They are assigned to a network type only when connected to a segment. The segment defines the network type for the port.")
2. **The cascade invariant.** A change of the network type always changes the whole connected run (found with `computeNetworks`), never only the selected segments. Connected segments can never have different network types. This holds for each edit path: single select, multi select, bulk edit, import, scripts. Before you add a new per-segment field, check if it is truly per segment or a network-level value like the network type.
3. **Reuse before new.** Before you design new state or a new UI, search the code for a data model or a mechanism that already exists in another panel. Then make the new thing a thin view over the old state. Two parallel copies of one state are a real risk in this repository.
4. **The adoption trap.** A drawing keeps only the network types that it adopted (`doc.networkTypes`). A segment with an unadopted `networkTypeId` is drawn with the default look. Each code path that sets a `networkTypeId` must adopt the type first. Use `adoptNetworkTypes` (`packages/render/src/scene.ts`).
5. **Verify UI wiring through the real DOM.** For an input, a button or a form, a browser check types into the real input and presses Enter, Tab or click. The scene API `window.__mepSketchScene` is for setup and for reading state. It is not a proof that the wiring works.
6. **Merge lesson.** Git joins nearby hunks into one conflict block, and it can merge a type change with no marker. After a real merge, run `pnpm build` at the root. "No marker left" is not proof.

## 4. Browser check facts (apps/web)

- A PDF must be open before the stamp tools are enabled. Open it through Menu → Open… (`lib.mjs` does this: `openPdf`).
- `window.showOpenFilePicker` and `showSaveFilePicker` do not work headless. `lib.mjs` replaces them with OPFS handles. A Save writes into OPFS. Read the result from OPFS.
- The onboarding overlay blocks the first load: click `button.mep-onboarding-start` (`lib.mjs`: `start`).
- A stamp tile has the selector `.mep-stamp-tile`. Its name has a prefix such as `D2 Sink`. List the names first with `allInnerTexts()`.
- A stamp pick is asynchronous. Wait 1000 ms after the tile click before you click the canvas.
- Undo and redo have no keyboard shortcut. Click `.mep-rail-btn[title="Undo"]`. Ctrl+C and Ctrl+V work on `body`.
- `page.mouse.click` has no `modifiers` option. For Shift-click use `keyboard.down('Shift')`, `mouse.click`, `keyboard.up('Shift')`.
- `waitForFunction` does not wait for an async predicate. Poll from Node.
- `Dialog.tsx` renders `div.mep-modal` with no `role="dialog"`. Use `.mep-modal`.
- Menu items have a leading icon. Match with `^\s*Open…\s*$`.
- Menu → Open… opens a new document tab. A second Open of the same file does not replace the document.
- `window.__mepSketchScene` exists only in the dev server (vite), not in `vite preview`.
- The first page load after a dependency change makes Vite optimize the dependencies. `with-server.mjs` loads the page once before the check.
- Vite can stop with `ENOSPC` (too many file watchers). `with-server.mjs` sets `CHOKIDAR_USEPOLLING=1`.

## 5. Browser helper

Files in `.claude/roadmap/browser/`:

- `lib.mjs`: `open()` returns `{ page, check, menu, until, idle, start, openPdf, openAutoPlace, detect, shot, finish, ... }`. Settings come from the environment: `MEPAPP_REPO`, `MEPAPP_PORT` (5462), `MEPAPP_PDF`, `MEPAPP_SHOTS` (default `/tmp/mepapp-shots`).
  - `check(ok, what, extra)` counts a pass or a fail. `shot(name)` saves `<MEPAPP_SHOTS>/<name>.png` and prints `SHOT <path>`. `finish()` prints the totals and sets a non-zero exit code on a fail.
- `with-server.mjs <check.mjs>`: starts the dev server, runs the check, stops the server.
- `p3-check.mjs`, `p6-check.mjs`: examples from part 1 (the Auto-place dialog, room detection, real DOM inputs). Copy the shape of one for a new check.

Run a check with one command:

`node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`

Do not put an environment variable before the command: the allow rules do not match it. Screenshots go to `/tmp/mepapp-shots/` (the default of `lib.mjs`). Name each one `<task id>-<name>` with `shot()`.

Write the check script in the work folder with the Write tool. Import the helper with an absolute path to `lib.mjs` of the worktree.

## 6. Reports

Each worker report starts with its status word (`Status:` or `Verdict:`) and is short. The status codes are DONE, DONE_WITH_CONCERNS, BLOCKED and NEEDS_CONTEXT. BLOCKED and NEEDS_CONTEXT are good outcomes when the brief does not fit reality. A silent workaround is the failure.
