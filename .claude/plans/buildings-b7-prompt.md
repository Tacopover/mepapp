# Prompt for a new session: B7 flow through risers

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

Before you start, the user must do one thing. `.claude/roadmap/permissions.md` names the allowed branches. Ask the user to add an allow rule for the branch `worktree-buildings-b7` (and its worktree folder) to `.claude/settings.local.json`. The agents must not edit these two files.

---

## Prompt

You continue the MepApp buildings stream. B1 to B4 and B6 are done and live on `master` (origin/master `1b7b4fd`, 2026-11-21). Now you start **B7: flow through risers**. The plan is `.claude/plans/buildings-b7-flow-through-risers.md`. Read it first. It was written 2026-11-21 and checked against the code that day. B5 (shared coordinate system) stays deferred. B8 (riser arrows) comes after B7 and is not part of your work.

### Where to work

- The plan file is only on the branch `worktree-buildings-b4` (it is not on `master`). That branch is `master` plus the plan and this prompt. The worktree of that branch is `/root/MepApp/.claude/worktrees/buildings-b4`. It holds the plan, the B4 and B6 test scripts, the agent framework files and the ledger. Do not work in that worktree.
- Make a new worktree for B7 from that branch. Do not use `EnterWorktree` without a base. Run these commands, one per Bash call:
  1. `git -C /root/MepApp fetch origin`
  2. `git -C /root/MepApp worktree add /root/MepApp/.claude/worktrees/buildings-b7 -b worktree-buildings-b7 origin/worktree-buildings-b4`
  3. Work in `/root/MepApp/.claude/worktrees/buildings-b7`. Check with `git status -sb` and `git log -3`.
  4. `pnpm install`, then `pnpm build` in that folder (node_modules and `dist` are not shared between worktrees).
- Push the branch `worktree-buildings-b7` only. Never merge into `master`. `master` is live (auto-deploy). The user tests on Windows and merges.
- Old scratch files of earlier sessions may be gone. The checks that matter are in `.claude/roadmap/work/` and `.claude/roadmap/browser/` in the repo (for example the `b4-*` and `b6-*` checks).

### Rules

- Commit each task alone. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Use the agent framework: skill `roadmap-director`, stream `buildings`, ledger `.claude/roadmap/ledger-buildings.jsonl` (use `node .claude/roadmap/ledger.mjs --stream buildings ...`, last seq is 427, last decision id is D-B-72), dashboard `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i`. Read `.claude/roadmap/rules.md`, `protocol.md`, `ux-lessons.md`, `ui-guide.md` and `ux-checklists.md`. Roles: `task-lead`, `ux-designer`, `journey-tester`, `ui-reviewer`, `tester`, `code-reviewer`. If a named agent is missing, use a general-purpose agent that reads `.claude/agents/<role>.md`.
- Read the `answers` collection of the dashboard at the start of each cycle. Mirror new ledger events and screenshots at once (`.claude/roadmap/tools/mirror-batch.mjs <path> buildings`, then ArtifactData batch, then `ledger.mjs --stream buildings mirrored <seq>`). Copy screenshots from `/tmp/mepapp-shots` into your scratchpad before you upload them.
- One command per Bash call, no chained commands, no heredocs (write a script with Write, then run it). No `pnpm add` (edit `package.json` by hand, then `pnpm install`). No prettier. Never `pkill -f vite`. No `window.confirm` in `ui`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid dependency. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`. No bare `git stash`.
- Evidence before claims. Browser checks use real DOM inputs. One Chromium page at a time. Never two heavy runs at once (core tests take about 140 s and 3.9 GB).
- English-only UI. Write prose for the user in ASD-STE100 style (short sentences, active voice, one word per meaning, define new terms). Use they/them for people.
- Say clearly what you did not run on a real browser profile, Tauri or Windows.

### Lessons from earlier buildings sessions (apply them)

- A task lead can hand back early when a background child agent dies. Run the tester, ux-designer and journey-tester in the FOREGROUND. Do not accept a hand-back until the task commit exists. Re-run the unit tests yourself (`pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/render test`, `pnpm --filter @mepapp/ui test`). Never trust a report without a proving command.
- A change that keeps old browser checks green must not change what plain `pnpm dev` or production does. Old checks opt in to the in-memory dev store with `localStorage mepapp.devPlatform=1`. Add at least one check that runs with no flags. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- Run the `ux-designer` first for every screen task (T04, T05). Show the wireframe, journeys and texts on the dashboard (event `decision`, kind `ux`) before the implementation starts. Run the `journey-tester` before you call a screen task done.
- The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`; it lists 28 checks) is needed when a task edits the Building dialog or the building controller. It must end with `checks with problems: 0`. It exits 0 even when a check fails. Read EVERY line.
- Known old failures that are not yours: `r6-t23-check` (2 of 50 steps) and `r3-check` (expects schema 21).
- A scale change never moves page content. Real-world values are rescaled. B7 does not touch this, but do not break it.
- Playwright cannot show a real permission prompt or a browser restart with a real profile. Say in every report what only the Windows test can cover.

### Order of the work

1. Read the plan against the code (sections 3 of the plan: `flow.ts`, `sheet-summary.ts`, `riser-flow.ts`, `riser-quantities.ts`, `scene.ts` `recomputeFlow`, `riserInfo.ts`, `App.tsx` live summary). Report any difference between the plan and the code before you start.
2. Put the decisions on the dashboard before the first task: D-B-73 (summary field, needs the user), D-B-74 (meaning of direction, needs the user, ask the `mep-domain-checker` for an opinion first), and the provisional D-B-75 and D-B-76. Add them to the ledger. Wait for D-B-73 before T02. T01 does not depend on a decision and can start.
3. Run the `roadmap-auditor` and the `mep-domain-checker` on the plan (separate, read only). Fix real findings in the plan before T01.
4. B7-T01, T02, T03 (core, pure functions, unit tests first). Use the worked example of the plan as an acceptance test.
5. B7-T04, T05 (screen tasks). `ux-designer` first. `journey-tester` last.
6. B7-T06 (Windows test script `.claude/plans/buildings-b7-test.md`, records).
7. Record each task in the ledger, mirror, push the branch. Do not merge to `master`. Tell the user what to test on Windows.

Stop and ask the user before any change to the building file format or the project file format. The plan needs none. The only data change is the optional summary field of D-B-73, and it needs the user's answer first.
