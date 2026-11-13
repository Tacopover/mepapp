# Prompt for a new session: B6 open the PDFs of a building without the file picker

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

Before you start, the user must do one thing. `.claude/roadmap/permissions.md` names the allowed branches. Ask the user to add an allow rule for the branch `worktree-buildings-b6` (and its worktree folder) to `.claude/settings.local.json`. The agents must not edit these two files.

---

## Prompt

You continue the MepApp buildings stream. B1 to B4 are done and merged to `master` (origin/master `e96fcdc`, 2026-11-13; B4 risers with the feedback tasks F1 to F6). Now you start **B6: open the PDFs of a building without the file picker**. The plan is `.claude/plans/buildings-b6-pdf-access.md`. Read it first. It was written 2026-11-13 and checked against the code that day. The user decided D-B-66 (reverse D-B-53 for Chrome and Edge: the app may keep PDF file handles in the browser).

### Where to work

- The plan file is only on the branch `worktree-buildings-b4` (commit `0e0521f`), not on `master`. The worktree of that branch is `/root/MepApp/.claude/worktrees/buildings-b4`. It holds the plan, the B4 test script, the agent framework files and the ledger. Do not work in that worktree.
- Make a new worktree for B6 from that branch. Do not use `EnterWorktree` without a base, because the local `master` in `/root/MepApp` is old. Run these commands, one per Bash call:
  1. `git -C /root/MepApp fetch origin`
  2. `git -C /root/MepApp worktree add /root/MepApp/.claude/worktrees/buildings-b6 -b worktree-buildings-b6 origin/worktree-buildings-b4`
  3. Work in `/root/MepApp/.claude/worktrees/buildings-b6`. Check with `git status -sb` and `git log -3`.
  4. `pnpm install`, then `pnpm build` in that folder (node_modules and `dist` are not shared between worktrees).
- Push the branch `worktree-buildings-b6` only. Never merge into `master`. `master` is live (auto-deploy). The user tests on Windows and merges.
- Old scratch files and browser checks of B4 are in `/tmp/claude-0/-root-MepApp--claude-worktrees-buildings-b4/63f7a7db-cf81-41a4-b498-010d108b3888/scratchpad/` (for example `b4-f2/b4-f2-check.mjs`, `b4-f4/`). They may be gone. The checks that matter are also in `.claude/roadmap/work/` and `.claude/roadmap/browser/` in the repo.

### Rules

- Commit each task alone. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Use the agent framework: skill `roadmap-director`, stream `buildings`, ledger `.claude/roadmap/ledger-buildings.jsonl` (use `node .claude/roadmap/ledger.mjs --stream buildings ...`, last seq is 399), dashboard `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i`. Read `.claude/roadmap/rules.md`, `protocol.md`, `ux-lessons.md`, `ui-guide.md` and `ux-checklists.md`. Start the session so that the agent files load (`task-lead`, `ux-designer`, `journey-tester`, `ui-reviewer`, `tester`, `code-reviewer`). If a named agent is missing, use a general-purpose agent that reads `.claude/agents/<role>.md`.
- Read the `answers` collection of the dashboard at the start of each cycle. Mirror new ledger events and screenshots at once (`.claude/roadmap/tools/mirror-batch.mjs <path> buildings`, then ArtifactData batch, then `ledger.mjs --stream buildings mirrored <seq>`). Copy screenshots from `/tmp/mepapp-shots` into your scratchpad before you upload them.
- One command per Bash call, no chained commands, no heredocs (write a script with Write, then run it). No `pnpm add` (edit `package.json` by hand, then `pnpm install`). No prettier. Never `pkill -f vite`. No `window.confirm` in `ui`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid dependency. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`. No bare `git stash`.
- Evidence before claims. Browser checks use real DOM inputs. One Chromium page at a time. Never two heavy runs at once (core tests take about 140 s and 3.9 GB).
- English-only UI. Write prose for the user in ASD-STE100 style (short sentences, active voice, one word per meaning, define new terms). Use they/them for people.
- Say clearly what you did not run on a real browser profile, Tauri or Windows.

### Lessons from the B4 session (apply them)

- A task lead can hand back early when a background child agent dies. Run the tester, ux-designer and journey-tester in the FOREGROUND. Do not accept a hand-back until the task commit exists. Re-run the unit tests yourself (`pnpm --filter @mepapp/ui test`, `pnpm --filter @mepapp/render test`, core when core changed). Never trust a report without a proving command.
- A change that keeps old browser checks green must not change what plain `pnpm dev` or production does. Old checks opt in to the in-memory dev store with `localStorage mepapp.devPlatform=1` (`lib.mjs` `open()` sets it unless the seed has `mepapp.webLike` or `mepapp.realStore`). Add at least one check that runs with no flags. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- Run the `ux-designer` first for every screen task, and the `journey-tester` before you call a screen task done. Show the wireframe, journeys and texts of any new button or message on the dashboard (event `decision`, kind `ux`) before the implementation starts. The user found problems each time by using the dialog.
- The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`; it lists 28 checks) is needed when a task edits the Building dialog or the building controller. It must end with `checks with problems: 0`. It exits 0 even when a check fails. Read EVERY line.
- Known old failures that are not yours: `r6-t23-check` (2 of 50 steps) and `r3-check` (expects schema 21).
- Playwright cannot show a real permission prompt, a real "Allow on every visit", or a browser restart with a real profile. Stub `queryPermission` and `requestPermission` in the checks, and say in every report what only the Windows test can cover.

### Order of the work

1. Read the plan and `.claude/plans/buildings-b6-pdf-access.md` sections 3 and 4 against the code. Report any difference between the plan and the code before you start (the plan says: `SheetFileCache`, `web-file-access.ts`, `web-building-store.ts`, `LevelSheetsPane`).
2. B6-T01 (Reconnect PDFs, all browsers). ux-designer first, show the button and texts on the dashboard, then implement.
3. B6-T02, T03, T04 (stored handles, using them, one folder permission), each with its own tests and checks.
4. B6-T05 (Windows test script `.claude/plans/buildings-b6-test.md`, update step 34 of `buildings-b4-test.md`, records).
5. Record each task in the ledger, mirror, push the branch. Do not merge to master. Tell the user what to test on Windows.

Stop and ask the user before any change to the building file format. The plan needs none: the new data lives in browser IndexedDB only.
