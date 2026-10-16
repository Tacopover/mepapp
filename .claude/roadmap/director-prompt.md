# Prompt: the director of the routing road map

Written 2026-10-16. The director is the main session. Start it in a **new session** in the worktree of the framework, so that its context is clean. Use this line:

> Read `.claude/roadmap/director-prompt.md` and do it. Use `/loop` to run the road map.

Or start the loop directly:

> /loop Read `.claude/roadmap/director-prompt.md` and run one cycle of the road map.

## Before the first cycle

1. Check that the agents exist: `.claude/agents/` has 9 files. Claude Code loads them at the start of the session.
2. Read `.claude/roadmap/protocol.md` and `.claude/roadmap/rules.md`.
3. Run `node .claude/roadmap/ledger.mjs show`. This is your state. After a crash or a context compaction, you continue from it, not from memory.
4. The dashboard link is in `.claude/roadmap/dashboard/URL.txt`.
5. Check `.claude/roadmap/permissions.md`. If the allow rules are not in `.claude/settings.local.json` and the user did not agree to run without them, tell the user and stop.

## One cycle

Do this in order. Each cycle does one step of the flow and then ends. `/loop` starts the next cycle.

1. **Sync.** Copy the pending events to the dashboard (protocol section 8, step 1). Read `answers` and `notes` from the dashboard (step 2). Add the answers as `decision` events. Act on each note. A note with STOP sets the run to `stopped`.
2. **Find the step.** From the ledger state, pick the first step that is not done:
   - No overview: start `roadmap-planner` (Job A) for the overview. Then start `roadmap-auditor` and `mep-domain-checker` on it, in parallel and each alone. Merge the findings. Fix the overview (send it back to the planner for at most 2 rounds). Write `.claude/plans/roadmap-overview.md`. Add the decisions of the batch as `decision` events (status `open`, kind `batch`). Set the run to `waiting`, send `PushNotification`, and end the cycle.
   - Open decisions of the batch: do nothing. End the cycle. (Wait for the user.)
   - A part with no plan: make or check out the branch (protocol section 9). Start `roadmap-planner` (Job B) with the answered decisions. Start the auditor and the domain checker. Fix the plan. Commit and push the plan. Copy it to the hub. Add the `task` events (state `planned`). Set the part to `in progress`.
   - A task that is `planned`: start one `task-lead` with the task text. Set `now`. When the lead returns, add the events (task state, commit, findings, screenshots). Upload the screenshots to the dashboard. Commit the ledger.
   - A task that is `blocked`: decide. Change the brief or the plan, or split the task, and start a new task lead. Two blocks on the same task: stop the run.
   - All tasks of a part are `done`: run the part check (below). Then mark the part done in its plan, copy the plan to the hub (`cmp`), set the part to `done`, and make the branch for the next part.
   - All parts `done`: write the summary on the dashboard, set the run to `done`, send `PushNotification`, and stop the loop (`ScheduleWakeup` with `stop: true`).
3. **Record.** After each step: add the events to the ledger, commit the ledger, mirror the events to the dashboard.
4. **Wake up.** Give `ScheduleWakeup` a delay. Use 60 s after a task. Use 1200 s or more when you wait for the user.

## Rules for the director

- You keep your context small. Start roles for all reading, research and checking. You do the synthesis and the decisions.
- A role does not share context with you. Give each role a brief with the paths, the goal and the report shape. Give every task lead the work folder (a folder in your scratchpad), the worktree path and the branch.
- Start the auditor and the domain checker as separate agents that do not see each other's work.
- Read the real result of each role, not only its report. Check that a commit exists (`git log -1`) and that the push worked (`git status -sb`).
- Take a provisional decision only when it is easy to reverse (protocol section 3). Record it on the dashboard.
- Use `PushNotification` only to ask the user for something: the decision batch, a stop, the end.
- Never push to master. Never merge a part branch into master. The user does that after the Windows test.
- Write all prose for the user in STE.
- Do not start the road map in the session that built the framework.

## Part check (after the last task of a part)

Run these yourself or through the `tester`: `pnpm test`, `pnpm typecheck`, `pnpm build`, and the browser checks of the part. Read the screenshots of the part. If a check fails, add a task. Do not mark the part done on a fail.

## Marking a part done

In `.claude/plans/auto-routing-r<N>.md`, mark each phase done inline: status, commit hash, and a summary of the verification, in the style of the done entries of part 1 in `auto-routing.md` §9. Change §8 of `auto-routing.md` for that part. Commit the plans. Copy them to the hub with `cp` and check with `cmp`.
