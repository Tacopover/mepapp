# Prompt for a new session: update the agent framework with what the Building dialog rounds taught

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

---

## Prompt

You are going to improve the MepApp agent framework (the director skill and the agents in `.claude/agents/`, the rules and protocol in `.claude/roadmap/`). The reason: the framework built a Building dialog (stream `buildings`, tasks B3-T01 to B3-T13) that passed every automated check. Then the user tested it on Windows in 3 rounds and found 30+ problems that no agent had found. This session must find out why the agents missed them and change the framework so that the next UI task is right the first time.

Work in a new worktree (call `EnterWorktree`) on a branch of `master`. Do not work in the main checkout. Push the branch only. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`. Do not touch product code in `packages/` or `apps/`. Prose for the user in ASD-STE100 style. One command per Bash call, no heredocs (write a script with Write, then run it). Evidence before claims.

### What to read first

1. `.claude/agents/*.md` (9 agents), `.claude/skills/roadmap-director/`, `.claude/roadmap/rules.md`, `protocol.md`, `director-prompt.md`.
2. The plans and ledger of the stream, on the branch `worktree-buildings-model` (pushed): `.claude/plans/buildings-b3-ui.md`, `buildings-b3-ui-review.md`, `buildings-b3-feedback.md`, `buildings-b3-feedback2.md`, `buildings-b3-windows-test.md`, and `.claude/roadmap/ledger-buildings.jsonl`. Use `git show origin/worktree-buildings-model:<path>` or a second worktree to read them.
3. The check scripts in `.claude/roadmap/work/` on that branch (for example `b3-t11-check.mjs`, `b3-t12d-check.mjs`): see what they assert and what they never look at.
4. Memory: `/root/.claude/projects/-root-MepApp/memory/` (agent framework, Buildings stream, feedback notes).

### Ground truth: what the user found that no agent found

Round 1 (after T11, which was already a full UI overhaul with a UI reviewer pass):
1. Levels had Move up and Move down buttons and a "Sort by elevation" button. The user wanted the elevation to define the order. A manual control for something that the data can derive.
2. "Add folder" put the pages under a "Not placed" pane. The user had a level selected and expected the pages on that level. An extra step and an extra state.
3. The "Open" button closed the whole dialog. The user wanted to open several PDFs in a row.
4. The building list moved the selected building to the top. The user expected a fixed order.
5. A "Close building" command. An internal concept (an open building) shown as a user command. The user has no use for it.
6. Export of an unsaved PDF failed quietly with a short message at the top right. The text was cut. No tooltip, no question.
7. The sheet rows had buttons and texts at different places, depending on the length of the file name. Sections had no clear border or title. Name and Elevation of a level were not first. The "Add PDF" part was as big as the main sections.
8. In the file picker only 1 file could be selected.
9. A "No access" test step could not be done on one PC (the test script asked for something impossible).

Round 2 (after the fixes of round 1):
10. A building could not be renamed (a missing action).
11. An "Untitled" entry showed in the list of open PDFs when no PDF was open (an empty state that nobody looked at).
12. The text "Remove its 2 sheets first" was not understood (cryptic text).
13. PDFs could be assigned to the building (a state that the rules should forbid).
14. The "Open" button looked the same after the PDF was open (no feedback).
15. An "Open" badge on a building in the tree did nothing (a dead label).
16. The tree showed no PDF names under the levels (no overview).
17. "Add folder" skipped a PDF that was already on another level and did not say so (a silent no-op).
18. The file picker still allowed 1 file (reported in round 1, and the fix was a test-only change).
19. After the user added a PDF to a level, "Open" said "Save it to link it". An implementation limit (the id lives in the saved PDF) shown to the user as a task.

### Questions to answer (write the answers in a short report in `.claude/plans/agent-framework-ux-update.md`)

For each of the 19 items: which agent should have caught it, in which step of the loop, and why it did not. Look for patterns. Ideas to test, not conclusions:
- The ui-reviewer runs on `haiku`, reads screenshots, and judges against a list that checks "exists", "works", "consistent". It has no layout measurement, no visual hierarchy test, no copy test, no list of invalid states.
- The browser checks were written by the task lead for the controls the task changes. They assert what the implementer built. They cannot find a missing feature, a bad flow, or a bad text. A check that confirms its own design finds nothing.
- Nobody plays a user with a goal. Nobody counts the steps of a journey (add a PDF to a level, open three PDFs in a row, export one level).
- Nobody lists every action for each entity (a building, a level, a sheet): create, rename, delete, move, open, undo. Rename was missing.
- Nobody lists every state of a screen (empty, loading, error, partial, done, disabled, already done) or every control's purpose (what does this label do?).
- The plan phase reviewed behaviour and data, not the screen. The user saw the screen first at the end.
- The tests ran on web with fake file handles and a fake picker. The real platform (Tauri, Windows) differs (multi-file picker, paths, access scope). Nobody listed what the fake hides.
- A model concept leaked to the UI (open building, Not placed, id in file). Nobody asked "does the user have this concept?".
- The Windows test script was written after the work and by the same agent. It asked for something that cannot be done on one PC.
- Process cost: the full browser runner took 50 minutes and always exits with code 0. Task leads handed back early while a worker still ran (many "waiting on background work" notices). Ledger mirror to the dashboard was manual. These are smaller, but fix what is cheap.

### What to deliver

1. The report `.claude/plans/agent-framework-ux-update.md` (items vs cause, in a table, plus your proposals ranked by value and cost).
2. Changes to the framework, on the branch. Decide which of these to do, and add others if the analysis shows a need:
   - A new agent `ux-designer` (model `sonnet` or better) that runs BEFORE the implementation of every task that changes a screen. It writes a UX spec: the user journeys (goal, number of steps, what the user sees at each step), an entity by action table, a state table for each screen (empty, loading, error, partial, done, disabled, already done), "derive it or ask for it" (a value the data can derive must not get a control), the text of every label and message (plain words, say what to do, never an internal term), and a layout spec (an ASCII wireframe, the grid, section titles, the alignment rule for list rows, the minor and major sections). For a new dialog or a big change, the director shows the wireframe to the user on the dashboard before the implementation starts.
   - A new agent `journey-tester` (model `sonnet`) that gets goals and not steps. It plays a first-time user in the browser at 1600 and 1100 and 760 px with real clicks, writes a friction log (every extra step, every unclear text, every dead control, every state with no message, every moment where it had to guess), and counts clicks per journey. It also starts from nothing (no building, no PDF open) and from a full state (30 sheets, 80-character names).
   - An upgraded `ui-reviewer`: model `sonnet`, a layout measurement script template (bounding boxes: same column edges in every row, gutters, overflow, section order, size of minor against major sections), a dead-control audit (list every visible control and what it does), an invalid-state audit (can the user reach a state that the rules forbid?), a copy audit (each message: does it say what happened and what to do?), stress data (long names, many rows), and a rule that it must look at each screenshot itself. Consider Nielsen's 10 heuristics as the checklist.
   - A platform check in the task lead procedure: a "capability table" for each platform API in the task (picker: multiple files, path, access scope, drag and drop), with the column "what the web test fake hides". Each hidden item goes to the Windows test script as a numbered step.
   - A UI pattern guide `.claude/roadmap/ui-guide.md`: section card, list row grid, where buttons go (primary, secondary, destructive), disabled and "done" states, empty-state texts, message styles, dialog sizes, what a minor section looks like. Take the patterns from the final Building dialog (`BuildingSection.tsx`, `LevelSheetsPane.tsx`, `theme.css` on the branch `worktree-buildings-model`). Task leads and the `ux-designer` read it first.
   - Rules for checks: a check for a screen must come from the UX spec journeys, and a second agent (not the implementer's lead) writes at least the journey check. Add a "self-confirming check" warning to `rules.md`.
   - A `ux-lessons.md` file (one line per lesson, with the user quote) that the `ux-designer`, the `ui-reviewer` and the `journey-tester` read first. Start it with the 19 items above.
   - Process fixes that are cheap: the runner exits with a non-zero code when a check fails; run only the affected checks per task and the full runner once per part; a tool `mirror-batch.mjs` that writes the ledger events not yet mirrored to a JSON batch file for `ArtifactData`; a rule that a task lead does not hand back while a worker runs; a rule that the Windows test script is written from the journeys by the `journey-tester` and checked for steps that one PC cannot do.
   - Update `.claude/skills/roadmap-director/`, `protocol.md` and `director-prompt.md` so the director starts the new agents at the right step, and shows a wireframe for approval.
3. A replay test that proves the new agents work. On the branch `worktree-buildings-model`, commit `c9af4aa` is the state the user first tested (B3-T11 complete). Check it out in a separate worktree (read only; do not push to that branch). Run the new `ux-designer` on the task text of B3-T11 (a Building dialog for levels and sheets, see `buildings-b3-ui.md`) and the new `ui-reviewer` and `journey-tester` on the dialog of that commit (build it with `pnpm build` or run the dev server as the browser helper does; the helper is `.claude/roadmap/browser/with-server.mjs`). Count how many of the 19 items they find. Write the count and the misses in the report. If they find fewer than 12 of the 19, improve the agents and run the replay again (at most 2 more rounds). Run one browser at a time. The container has little memory (about 3.9 GB).
4. Commit and push the branch. Do not merge to master. Tell the user what changed, the replay count, and what you did not verify.

### Constraints

- Free and open tools only. No new paid dependency.
- Keep each agent file short (about 40 lines) like the existing ones. Put long checklists in the guide files that the agents read.
- Keep the existing agents' names, so the director skill keeps working. Add new names only for the new agents.
- Do not change the way the ledger and the dashboard work, except for the cheap fixes above.
