# Prompt for a new session: B8 riser arrows

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

The branch rule `worktree-buildings-*` is already in `.claude/settings.local.json` (the user added it on 2026-11-21), so the branch `worktree-buildings-b8` needs no new allow rule. Check that the rule still exists (`.claude/roadmap/permissions.md`). If it does not, ask the user.

---

## Prompt

You continue the MepApp buildings stream. B1 to B4 and B6 are live on `master`. B7 (flow through risers, T01 to T13) is done on the branch `worktree-buildings-b7` (head `5aa3719` or later). The user tested the riser functionality on Windows and says it works. Now you start **B8: riser arrows**. The plan is `.claude/plans/buildings-b8-riser-arrows.md`. Read it first. It was written 2026-11-26 and checked against the code of that day by the director (not by the auditor yet). The picture of the user is `fixtures/risers.png` in the main checkout (`/root/MepApp/fixtures/risers.png`, untracked). The plan explains the eight pictograms.

### Where to work

- The plan, the picture `.claude/plans/buildings-b8-riser-arrows.png` and this prompt are on the branch `worktree-buildings-b7` (not on `master`). B7 may not be merged yet. Check first: `git -C /root/MepApp fetch origin`, then `git -C /root/MepApp merge-base --is-ancestor origin/worktree-buildings-b7 origin/master`. Exit code 0 means B7 is on `master`.
- If B7 is NOT on `master`: make the worktree from the B7 branch. Run these commands, one per Bash call:
  1. `git -C /root/MepApp worktree add /root/MepApp/.claude/worktrees/buildings-b8 -b worktree-buildings-b8 origin/worktree-buildings-b7`
  2. Work in `/root/MepApp/.claude/worktrees/buildings-b8`. Check with `git status -sb` and `git log -3`.
  3. `pnpm install`, then `pnpm build` in that folder (node_modules and `dist` are not shared between worktrees).
- If B7 IS on `master`: make the worktree from `origin/master` and copy the plan, the prompt and the ledger files from `origin/worktree-buildings-b7` (`git checkout origin/worktree-buildings-b7 -- <paths>`). Tell the user what you did.
- Push the branch `worktree-buildings-b8` only. Never merge into `master`. `master` is live (auto-deploy). The user tests on Windows and merges. Do not work in the worktree of B7.

### Rules

- Commit each task alone. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Use the agent framework: skill `roadmap-director`, stream `buildings`, ledger `.claude/roadmap/ledger-buildings.jsonl` (use `node .claude/roadmap/ledger.mjs --stream buildings ...`; run `show` first for the last seq, it was 577 on 2026-11-26; the last decision id is D-B-117), dashboard `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i` (the stream dashboard, see `.claude/roadmap/dashboard-buildings/URL.txt`). Read `.claude/roadmap/rules.md`, `protocol.md`, `ux-lessons.md`, `ui-guide.md` and `ux-checklists.md`. Roles: `task-lead`, `ux-designer`, `journey-tester`, `ui-reviewer`, `tester`, `code-reviewer`. If a named agent is missing, use a general-purpose agent that reads `.claude/agents/<role>.md`.
- Read the `answers` collection of the dashboard at the start of each cycle. Mirror new ledger events and screenshots at once (`.claude/roadmap/tools/mirror-batch.mjs <path> buildings`, then ArtifactData batch, then `ledger.mjs --stream buildings mirrored <seq>`). Upload each task's screenshots to the dashboard right after the task. Copy screenshots from `/tmp/mepapp-shots` into the worktree (a shots folder) before you upload them. A path outside the worktree is refused.
- One command per Bash call, no chained commands, no heredocs (write a script with Write, then run it). No `pnpm add` (edit `package.json` by hand, then `pnpm install`). No prettier. Never `pkill -f vite`. No `window.confirm` in `ui`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid dependency. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`. No bare `git stash`.
- Evidence before claims. Browser checks use real DOM inputs. One Chromium page at a time. Never two heavy runs at once (core tests take about 140 s and 3.9 GB).
- English-only UI. Write prose for the user in ASD-STE100 style (short sentences, active voice, one word per meaning, define new terms). Use they/them for people.
- The words of the UI are the same for every network type (decision D-B-113 of the user, 2026-11-25). Do not write a type-specific text. The flow sense of a network type is data (a field and a default value in the library), not wording.
- Say clearly what you did not run on a real browser profile, Tauri or Windows.

### Lessons from earlier buildings sessions (apply them)

- A task lead can hand back early when a background child agent dies. Run the tester, ux-designer and journey-tester in the FOREGROUND. Do not accept a hand-back until the task commit exists. Re-run the unit tests yourself (`pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/render test`, `pnpm --filter @mepapp/ui test`). Never trust a report without a proving command.
- A change that keeps old browser checks green must not change what plain `pnpm dev` or production does. Old checks opt in to the in-memory dev store with `localStorage mepapp.devPlatform=1`. Add at least one check that runs with no flags. The production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`.
- Browser checks of the real web store use `seed: { 'mepapp.realStore': '1' }` and fake stored handles over OPFS (see `.claude/roadmap/work/b6-t01-noflag-check.mjs` and `b7-t13-check.mjs`). Real OPFS handles in IndexedDB crash headless Chromium after a reload. The wrapper `with-server.mjs` swallows env variables, so pass arguments after the check path.
- The 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`) is needed when a task edits the Building dialog or the building controller. Read EVERY line. It exits 0 even when a check fails.
- Known old failures that are not yours: `r6-t23-check` (2 of 50 steps) and `r3-check` (expects schema 21).
- A scale change never moves page content. Real-world values are rescaled. Do not break it.
- Playwright cannot show a real permission prompt or a browser restart with a real profile. Say in every report what only the Windows test can cover.
- The user reads screenshots on the dashboard. Read each screenshot yourself before you call a screen task done.

### Order of the work

1. Read the plan against the code (section 3 of the plan). Report any difference before you start. Run the `roadmap-auditor` and the `mep-domain-checker` on the plan (separate, read only). Fix real findings in the plan.
2. Record the decisions of section 4 in the ledger and on the dashboard before the first task. The user already answered D-B-118 (the flow sense is a property of the network type), D-B-119 (hand-set pictogram on the riser member), D-B-122 (the arrows scale with the zoom) and D-B-123 (adapted: the segment arrowheads follow the flow sense). The user accepted D-B-120, D-B-121 and D-B-124. Add them as answered or provisional, as section 4 says. D-B-125 (the field name, the library defaults, the migration 23 to 24, the reading rule) is new and provisional: show it on the dashboard with the options and ask the `mep-domain-checker` to confirm the library defaults first. Send one `PushNotification` only if you need an answer that blocks work. D-B-123 is the director's reading of the answer of the user. Say so on the dashboard, so the user can correct it.
3. Part A: B8-T01 (the flow sense of a network type: core, migration, library defaults, editor; `ux-designer` first, it is a small screen task), T02, T03 (core, unit tests first), T04 (render), T05, T06 (screen tasks: `ux-designer` first, show the wireframe, the journeys and the texts on the dashboard as a `decision` of kind `ux` before the implementation, `journey-tester` last), T07 (the arrowheads on segments follow the flow sense), T08 (Windows test script and records). T01 must be done before T02 and T07.
4. After T08: record, mirror, push the branch, and report to the user. **Stop.** Part B (the Risers tab, T09 and T10) starts only when the user has tested part A on Windows and says go.
5. Do not merge to `master`. Tell the user what to test on Windows.

Two format changes are agreed with the user: the optional field `RiserMember.arrows` in the building file (D-B-119) and the optional field `NetworkType.flowSense` with the project schema step 23 to 24 (D-B-118, D-B-125). Make exactly these. Stop and ask the user before any other change to the building file format or the project file format. Check at the start that no other branch took schema version 24. A ring is always a full circle: the app never draws half a ring (the arrows are drawn over the full circle).
