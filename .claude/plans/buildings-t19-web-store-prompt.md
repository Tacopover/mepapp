# Prompt for a new session: B1-T19 web building store, and the dead-code cleanup

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

---

## Prompt

You continue the MepApp buildings stream. B1 to B3 are done and merged to `master` (3ddc33d, 2026-11-05). The desktop app works (the user tested it on Windows). The web app at `https://app.mepsketcher.com` still shows "Use the desktop app" in the Manage Buildings dialog, because the web store does not exist (decision D-B-24 A). You do two jobs:

1. **B1-T19**: a web `BuildingStore`, so the Building dialog works in the browser.
2. **Cleanup**: remove dead code that the B3 feedback rounds left (gap item 9).

### Rules

- Call `EnterWorktree` and work on a new branch off `master`. Never work in the main checkout. Push the branch only. `master` is live (auto-deploy). The user tests on Windows and merges.
- Work in 2 tasks, T19 first. Commit each task alone with a clear message. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Use the agent framework (skill `roadmap-director`, stream `buildings`, ledger `.claude/roadmap/ledger-buildings.jsonl`, `ledger.mjs --stream buildings`, dashboard `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i`). The framework now has `ux-designer`, `journey-tester` and a stronger `ui-reviewer` (read `.claude/roadmap/ux-lessons.md`, `ui-guide.md`, `rules.md`, `protocol.md`). New agent files load only in a new session. If a named agent is missing, use a general-purpose agent that reads `.claude/agents/<role>.md`.
- Read the `answers` collection of the dashboard at the start of each cycle. Mirror new ledger events and screenshots at once (`.claude/roadmap/tools/mirror-batch.mjs`).
- One command per Bash call, no chained commands, no heredocs (write a script with Write, then run it). No `pnpm add` (add the line to `package.json` by hand, then run `pnpm install`). No prettier. Never `pkill -f vite`. No `window.confirm` in `ui`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid dependency. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`.
- Evidence before claims. Browser checks use real DOM inputs. One Chromium page at a time. Never two heavy runs at once (the core test takes about 140 s; the container has about 3.9 GB).
- English-only UI. Prose for the user in ASD-STE100 style (short sentences, active voice, one word per meaning, define new terms). Use they/them for people.
- Say clearly what you did not run on a real browser profile, Tauri or Windows.

### What to read first

- Memory: `/root/.claude/projects/-root-MepApp/memory/project-buildings-levels-sheets-scoping.md` and `project-agent-framework.md`.
- `.claude/plans/buildings-b1.md` (section for B1-T15, T17, T19 and the `BuildingStore` interface), `buildings-levels-sheets-spec.md`, `buildings-b3.md`, `buildings-b3-feedback.md`, `buildings-b3-feedback2.md`.
- Code: `packages/platform` (the `BuildingStore` interface, `FileAccess`), `packages/platform-tauri` (the desktop store, for the behaviour to match), `packages/platform-web` (`dev-building-store.ts`, the memory store, `FileAccess`), `apps/web/src/main.tsx` (how the platform pair is chosen, the DEV-only hook `window.__mepBuilding`), `packages/ui/src/useBuilding*` and `ManageBuildingsDialog.tsx` (where "Use the desktop app" shows).

### Task 1: B1-T19 web `BuildingStore`

Plan text (B1-T19): `packages/platform-web/src/web-building-store.ts`. Handles in IndexedDB. Permission needs a click. `readPath` and `statPath` are absent on web: the dialog says "no access" and asks for the file again. Verify with the contract suite and `fake-indexeddb`.

Questions to answer in a short plan file `.claude/plans/buildings-t19.md` BEFORE you build. Ask the user the ones that change the design (give options, one recommendation each):
1. What does the user pick on the web: a building file (File System Access API `showOpenFilePicker` / `showSaveFilePicker`) and a folder for the summaries (`showDirectoryPicker`)? Compare with the desktop flow so the dialog stays the same. Which browsers support the API? What does the dialog show in a browser without it (Firefox, Safari)? Do not leave a blank dialog.
2. Which handles go to IndexedDB, and what happens after a restart? A stored handle needs `requestPermission` and a user click. Design the "Allow access" state of the dialog (see `ui-guide.md`, empty and disabled states, and lessons L1 to L18).
3. Sheets: the desktop matches an open PDF by path. The web has no paths. The sheet match then uses the project id (`idMinted` adopt flow from B3-T13c), or name and size. State what the user sees when a PDF cannot be found ("no access", ask for the file again). Use plain words, no internal terms.
4. `readPath`/`statPath` absent: list every dialog function that needs them and what the web does instead. Every hidden difference of a fake handle becomes a numbered step in the Windows test script (or a Chrome test script, since this is web). Write that capability table in the plan.
5. Production safety: remove the "Use the desktop app" text only when the store works. Keep the dev hook `window.__mepBuilding` and the DEV-only `statPath` out of the production build (grep `dist` for `__mepBuilding`; report the result).
6. The old localStorage building list was removed in B3. Does anything need a migration? Check, do not guess.

Then follow the framework loop: `ux-designer` spec (the new dialog states: no access, allow access, not supported), user approval of the wireframe on the dashboard if the dialog changes much, implement, test (contract suite with `fake-indexeddb`, UI tests, browser checks), code review, `ui-reviewer`, `journey-tester` (goal: "make a building in the browser, add two PDFs to a level, close the tab, come back, export"). Write the web test script for the user, `.claude/plans/buildings-t19-test.md`, with the steps that a fake cannot prove (real picker, real permission prompt, real restart). Check that no step needs a second PC.

### Task 2: dead-code cleanup (gap item 9)

After B3-T13 these may be dead: `pendingPdfs`, `deleteBlockedReason`, `usePendingPdfs.add`. Files that mention them today: `packages/ui/src/buildingLevels.ts`, `buildingLevels.test.ts`, `components/BuildingSheetsPane.tsx`, `components/ManageBuildingsDialog.tsx`, `components/NotPlacedPane.tsx`. For each name, find all callers. Remove a name only if nothing live calls it (the "Not placed" pane stays for old data, D-B-44, so check what it needs). Remove its tests too. Do not change behaviour. Run the UI tests and `pnpm build --force`, and run the buildings browser checks that touch the dialog (`.claude/roadmap/browser/run-checks.mjs --only` with the b3 checks). Report what you removed and what you kept, and why.

### Also (small, ask first)

These gaps are open. Do them only if the user agrees, in a separate task: path match runs on every open; no focus trap in `Dialog`; "Export Building" has no question about pages that are not on a level; "Read summaries now" tries a sheet that shows "Not opened yet"; old sheets with no id say "Not linked yet". Do not start B4 (risers).

### Finish

Push the branch. Tell the user: what changed, the checks that ran (with counts), what you did not verify (real browsers, permission prompts, restart), the test script path, and the open items. Do not merge to `master`.
