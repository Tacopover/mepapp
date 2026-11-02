# Prompt: B3-T11, overhaul of the Building dialog (UI and UX)

Branch: `worktree-buildings-model` (pushed). Work in the worktree `/root/MepApp/.claude/worktrees/buildings-model`. Never work in the main checkout. Never push to master. Push the branch only. The user tests on Windows and merges.

## Start

1. Run `pnpm install` and `pnpm build`.
2. Load the `roadmap-director` skill. Use `--stream buildings` before every `ledger.mjs` command. Never write to `ledger.jsonl`.
3. Read, in this order: `.claude/plans/buildings-levels-sheets-spec.md`, `.claude/plans/buildings-b3.md`, `.claude/roadmap/protocol.md`, `.claude/roadmap/rules.md`, and `node .claude/roadmap/ledger.mjs --stream buildings show`.
4. Read the dashboard `answers` collection (artifact `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i`, tool `ArtifactData`). Add each new answer as a `decision` event. The dashboard does not push answers. You must read them.
5. The ledger task is `B3-T11` (planned). Part B3 is `active`. B4 (risers) does not start before T11 is done and the user agrees.

## State you start from

B1 (identity, pages), B2 (summaries, Level and Building export) and B3 T01 to T10 are built and pushed. The Manage Buildings dialog works but is basic. Files: `packages/ui/src/components/ManageBuildingsDialog.tsx`, `BuildingLevelsPane.tsx`, `BuildingSheetsPane.tsx`, `DuplicateDocumentDialog.tsx`, `buildingController.ts`, `useBuilding.ts`, `buildingSheets.ts`, `buildingStatus.ts`, `buildingLevels.ts`, `recentBuildings.ts`, `quantitiesScope.ts`, `QuantitiesScopeDialog.tsx`, and the status-bar label in `App.tsx`. Native Tauri paths (folder pickers, `statPath`, `readPath`, Grant access) have never run. T16 (Windows spike) and T19 (web store) are open. D-B-24 A: the production web build shows "Use the desktop app".

## The user's feedback (2026-11-02, quoted)

- "The UI is very basic and needs a lot of improvement. Both on how it looks, but also how it functions: the overall user experience could be improved a lot."
- "If there are PDF's open in the viewer then they should be listed somewhere so they can be easily added to a level."
- "The dialog should also have a more structured overview of all the buildings and levels so a user can easily switch between them."
- On Rebuild (D-B-27, still open): "I see that 'Rebuild' creates a list of file names in the dialog. Is that all it does? What is the actual use of this 'Rebuild'? Is it not something we can do as soon as a PDF is open or loaded?"

## Your task

Take a critical look at the whole building UI. Make it as functional and as user friendly as possible. Do not only restyle it. Ask what a user wants to do and how many steps it takes.

Do these steps:

1. **Review first (no code).** Start the app (`node .claude/roadmap/browser/with-server.mjs`) and use the dialog with real clicks. Use the fixtures in `fixtures/pdfs/` (also `Sample Project_multi_page.pdf`, 3 pages, gitignored). Write down the problems in `.claude/plans/buildings-b3-ui-review.md`: steps per task, confusing words, empty states, dead ends, layout, dark theme, narrow window. Compare with the old MEPSketcher dialog if it helps (`/root/MepSketcher`, building management view model).
2. **Write the plan** `.claude/plans/buildings-b3-ui.md` with phases and tasks, in the format of the other B plans. Run the `roadmap-auditor` on it. Show the user the plan and STOP for review before you implement. Ask the user only about product choices the plan does not cover.
3. **Implement** after the user agrees, task by task with `task-lead`. Upload the screenshots of each task to the dashboard (event `shot`).

## Must be in the plan

- **Open documents list.** Show every PDF that is open in the viewer (tabs, `DocumentSwitcher` data). Each one shows its pages, the level it is on (if any) and a one-step "Add to level" (a level choice, or drag, or a menu). Adding the open document must not need a file picker. Use the project id of the open document, so the sheet is linked at once.
- **Structured overview.** One clear view of all buildings (recent list and open one) and their levels with sheet counts and warnings. Switching building or level must take one click. Think of a tree or a two-column layout (buildings and levels on the left, sheets on the right). Show which building and level are active.
- **Rebuild (D-B-27).** Answer the user's question in the plan. Facts: Rebuild opens each PDF that is not open, reads its embedded project and writes its summary, so Level and Building export work for files that were saved before the building existed. The summary is written on Save only (`summaryAfterSave`). The user suggests doing it when a PDF is opened or loaded. Propose: write the summary on open for a PDF that matches a sheet (cheap, the project is already loaded), keep Rebuild as a rare repair action with a clear name and text, and link sheets that have no id when the embedded id is read (D-B-27 option A was the recommendation). Put D-B-27 on the dashboard again with these options.
- **Workflow check.** Walk the main flows end to end and cut steps: new building, add levels, add the open PDFs, add PDFs from disk, assign pages, export Level and Building quantities, fix a missing file. The Export scope dialog (`QuantitiesScopeDialog`) says "Open a building first" with no way forward: give it a way (open the building from there, or a link to the dialog).
- **Looks.** Use the existing design tokens and components (`Dialog`, theme.css). Check dark theme, narrow window, keyboard use (Tab, Enter, Escape), and focus. Plain, consistent words. English only.
- **Known small items to fold in** (ledger finding `F-B3-1`, `F-B3-2`, `F-B3-3`): dialog width jumps when the first level is added; no marker for the open file in the recent list; Close building and Close look alike; Sort by elevation has no reason text when disabled; delete of an empty level has no confirm or undo; dialog body scrolls under the title with no divider; no "assign all pages" action; Rebuild Cancel works only between documents; long failure text is cut in the header; stale "Saved ..." text after a tab switch; the status-bar label can be cut at 1600 px; core `relinkSheet` has no guard for duplicate id and page (UI guard only); `FileTarget` has no `path` (cast in `pathOfTarget`).

## Decisions already made (do not reopen)

D-B-09 A (building file is a user-placed file, no backend), D-B-10 A (one flat summary file per project), D-B-11 A (`projectUuid` in the project JSON), D-B-12 A, D-B-13 A, D-B-16 (web read-only and last), D-B-17 (unassigned pages live only in dialog state), D-B-24 A (web shows "Use the desktop app" until T19), D-B-25 (copy id minted on next Save, provisional), D-B-26 (pick again checks only the page range, provisional), D-B-28 A (import also makes sheets from old file names), D-B-29 A (label matches by id only). Riser decisions (B4) stay: D-B-14 (mm, shared coordinate system is B5), D-B-18, D-B-20, D-B-23.

## Rules

- Follow `CLAUDE.md` and `.claude/roadmap/rules.md`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid or non-free dependency.
- One command per Bash call. No chained commands. No heredocs. Write a script with the Write tool, then run it.
- Prose for the user in ASD-STE100 (short sentences, active voice, one word for one meaning). Define new terms.
- Evidence before claims: run the proving command in the same turn. Browser checks use real DOM inputs, not the scene API. One Chromium page at a time. Never run two heavy runs at once (core test takes about 140 s).
- Do not edit `permissions.md` or `.claude/settings.local.json`.
- Commit the plans, the ledger and the mirror file (`.claude/roadmap/mirrored-buildings.json`). Mirror new ledger events to the dashboard in the same step (batch with `ArtifactData`, then `ledger.mjs --stream buildings mirrored <seq>`). Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Say clearly what was not run in Tauri. Offer a short script for a Windows test where a native dialog is needed.
