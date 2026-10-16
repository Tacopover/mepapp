# Prompt: an agent framework for the routing road map

Written 2026-10-16. Start a new session with:

> Read `.claude/plans/agent-framework-prompt.md` on branch `worktree-auto-routing` and do it.

---

## The goal (the user, 2026-10-16)

> "I would like to try and handle all the tasks that are on the road map more autonomously. Currently I have to check back in after each part of the road map is finished and then give a go on the next part. Could we create an agent framework that can take over my role as external reviewer and checker?"

The road map is §8 of `.claude/plans/auto-routing.md`: R2 (which network: systems), R3 (a start point for each network), R4 (where a duct or pipe may go), R5 (sizing), R6 (the shape of the network), R7 (electrical circuits). R8 (the adoption trap) is done with part 1. Part 1 (routing targets on stamps) is done on `worktree-auto-routing` (36af8b5 and later), not merged.

The user also wants "a dashboard of sorts that shows the current progress and what is being worked on. Also having available any screenshots of the app once finished so I can inspect and steer if needed."

## Decisions of the user (2026-10-16)

1. **Models.** The user: "Let's use sonnet where you adviced opus instead. I am pretty content with opus and it is nor rocket science what we are working on." So the roles that judge use Sonnet, and the roles that do the work use Haiku (table below). The director is the main session and uses the model that the user starts the session with.
2. **Decisions: one batch at the start.** The road map planner collects all the decisions of the user for R2 to R7, with a recommendation for each. The user answers them once. After that:
   - For a new decision that is easy to reverse, the director takes its recommendation, records it on the dashboard as "provisional", and continues.
   - For a new decision about the data model or the file format that the batch did not cover, that part stops until the user answers.
3. **Branches.** The director continues on the branch of the previous part. The user tests several parts at once on Windows and merges. Never push to master.
4. **Notifications.** The director uses `PushNotification` only when it needs the user: the decision batch, a stop, or the end of the road map. The user turns on Remote Control themself if they want the notifications on the phone.

## The roles

| Role | Agent file | Model | Job |
|---|---|---|---|
| Director | (the main session) | the session model | Runs the road map: starts every other role, keeps the ledger and the dashboard, does the branches, merges, pushes, plan marks and hub copies. |
| Road map planner | `roadmap-planner.md` | sonnet | The functional overview of R2 to R7: what the user gets in the app, how each part relates to new and existing features, the data that goes from one part to the next, the gaps. The batch of user decisions. Later, the plan of each part with its tasks. |
| Road map auditor | `roadmap-auditor.md` | sonnet | Checks the overview and each part plan against the code and the plans, with no shared context with the planner. Looks for gaps, conflicts with existing features, missing migrations, and data that one part needs and no part makes. |
| MEP domain checker | `mep-domain-checker.md` | sonnet | Checks the engineering of the overview and of each part, for example supply and return pairs, duct sizes (EN 1506, R5) and circuit limits (NEN 1010, R7). |
| Task lead | `task-lead.md` | sonnet | One for each task. Writes the briefs for the Haiku workers and runs the loop: implement, test, code review, UI review, fix. Returns one summary with a status. |
| Researcher | `researcher.md` | haiku | Collects sources from the web and the code (Revit systems, path search, sizing tables). The task lead or the director judges the findings. |
| Implementer | `implementer.md` | haiku | Implements one brief. Based on `/root/.claude/agents/haiku-coder.md`. |
| Tester | `tester.md` | haiku | Runs the core and UI tests, `pnpm build`, and the browser checks through real DOM inputs. Takes the screenshots. Based on `/root/.claude/agents/haiku-verifier.md`. |
| Code reviewer | `code-reviewer.md` | haiku | Reviews the diff of a task against its brief, the plan and the rules, with a fixed checklist. The task lead also reads the diff. |
| UI reviewer | `ui-reviewer.md` | haiku | Uses the page and reads the screenshots. Checks usability and completeness against the overview and the part plan. |

Nesting: the director starts a task lead, and the task lead starts its Haiku workers. That is 2 layers below the main session. Claude Code 2.1.301 allows 3 layers by default (docs: "Let subagents spawn their own subagents", `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`). Only the task lead (and the director) get the `Agent` tool. The workers do not.

The existing agents in `/root/.claude/agents/` (read-only in this container): reuse the protocol of `haiku-coder`, `haiku-verifier` and `haiku-scout` (the seven-part brief GOAL / CONTEXT / TARGETS / EXACT SHAPES / DO NOT TOUCH / VERIFY / REPORT, and the status codes DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT). Do not reuse `quality-review` and `architecture-reviewer`: they are written for C# and WPF, and they cannot run commands. Also read the skill `/root/.claude/skills/fable-harness/` (`SKILL.md` and `references/delegation.md`, `planning.md`, `verification.md`).

## The flow

1. **Overview.** The planner writes the overview of R2 to R7. The auditor checks it. The domain checker checks it. The director merges the results and writes `.claude/plans/roadmap-overview.md`. The overview includes the batch of user decisions. The open questions of `.claude/plans/auto-routing-r2-prompt.md` go into the batch; that prompt's research and comparison become input for the R2 part plan.
2. **The only planned stop.** The director publishes the decision batch on the dashboard, sends a notification, and waits for the answers.
3. **Each part.** The planner writes the part plan (`auto-routing-r<N>.md`: the model, the phases, the tasks, the verification of each task). The auditor and the domain checker check it. The director splits it into tasks.
4. **Each task.** A task lead runs: implement → test → code review → UI review. A finding goes back to the implementer. A finding gets at most 2 fix rounds; then the task is "blocked" and the director decides. Each task ends with the core tests, the UI tests, `pnpm build`, a browser check through real DOM inputs, screenshots, a commit, and a push of the branch.
5. **After each part.** The director marks the part done in its plan (commit hash and verification, the same style as part 1), copies the plan to the hub, and starts the next part on a branch made from the current one.
6. **The end.** A notification, a summary on the dashboard, and the screenshots of each part.

The states of a task: planned, briefed, implementing, testing, code review, UI review, fixing, done, blocked. The states of a part: overview, audited, decided, in progress, done.

## The ledger and the dashboard

- **Ledger.** A file in the repository, for example `.claude/roadmap/ledger.json`, is the source of truth: the parts, the tasks, their states, the decisions, the findings and the commits. The director commits it at the end of each task. After a crash or a context compaction, the director continues from the ledger.
- **Dashboard.** An artifact page. Load the skills `artifact-design` and `artifact-capabilities` before you write it.
  - It shows: the road map R2 to R7 with the state of each part; the tasks of the current part with their states; "now working" (which role, which task, since when); the decision queue; the review findings; the screenshots of each task and of each finished part; a short log.
  - The director writes the state into the shared database of the page (`ArtifactData`), and uploads the screenshots to the asset store of the page. The page shows the changes without a new publish.
  - The user can answer a decision on the page, or write a steering note. The director reads them in each cycle.
  - Check that the account has the database and the asset store. If not, publish the state as a `state.json` file and the screenshots as files of the artifact, and republish after each task.
  - The page must work at phone width (the user reads it on the phone). Prose on the page is in STE.
  - Put the link in the hub, in `/taco/notes/Obsidian Vault/Project Docs/MepApp/`.

## Permissions for a run without the user

An unattended run stops at each permission prompt. Find which calls of the framework ask for permission: Bash commands, `git push`, `ArtifactData` writes, asset uploads, `Artifact` publishes. Propose allow rules for `.claude/settings.local.json` that cover only what the framework needs. Show the list to the user, and add the rules only after the user agrees.

## Shared knowledge for the agents

Write `.claude/roadmap/rules.md`. Each agent reads it first. It contains:
- The rules at the end of this prompt.
- The memory files that apply, in `/root/.claude/projects/-root-MepApp/memory/`: `feedback-segment-defines-port-network-type.md`, `feedback-network-type-cascade-invariant.md`, `feedback-reuse-existing-mechanisms-before-designing-new.md`, `project-network-type-adoption-gotcha.md`, `feedback-verify-ui-wiring-via-real-dom-not-scene-api.md`, `project-playwright-verification-gotchas.md`, `project-merge-conflict-resolution-lesson.md`.
- The browser checks of part 1, copied into `.claude/plans/agent-framework/`: `lib.mjs` (the shared helper: open a page, a PDF, the Auto-place dialog, room detection; `check` and `finish`), `p3-check.mjs` and `p6-check.mjs` (examples). `lib.mjs` has fixed paths (`REPO`, `SP`) and the port 5462: make them parameters, and move the files to `.claude/roadmap/browser/`.
- The dev server: `pnpm --dir <worktree>/apps/web exec vite --port 5462 --strictPort --host 127.0.0.1 --force`, run in the background. Stop it with TaskStop. `apps/web` uses the `dist` of `@mepapp/ui`, so rebuild it after a UI change.

## Task

1. **Branch.** Make a worktree branch from `origin/worktree-auto-routing`, so the framework goes with the road map work. Run `pnpm install` and `pnpm build` at the root.
2. **Read.** This prompt, `auto-routing.md`, `auto-routing-r2-prompt.md`, the root `CLAUDE.md`, the fable-harness skill and its references, the 3 Haiku agent files, and the memory files above.
3. **Protocol.** Write `.claude/roadmap/protocol.md`: the roles, the flow, the states, the brief format, the stop rules, the decision policy, the branch policy, the ledger format, and when the director updates the dashboard. Write `.claude/roadmap/rules.md`.
4. **Agents.** Write the 9 agent files in `.claude/agents/` (frontmatter `name`, `description`, `tools`, `model`). Give each role only the tools it needs.
5. **Browser helper.** Move and generalize the files of `.claude/plans/agent-framework/`.
6. **Dashboard.** Build it, publish it, and give the link to the user.
7. **Permissions.** Propose the allow rules and ask the user.
8. **Commit and push** the branch. Copy `protocol.md` to the hub as `Specs/agent-framework.md`, and check the copy with `cmp`.
9. **Restart.** `.claude/agents/` is a new folder. Claude Code watches only the agent folders that existed when the session started, so it loads the new agents only after a restart. Ask the user to restart the session in the same worktree folder (`/exit`, then `claude --continue`).
10. **Dry run.** After the restart, start each role once on a small real job. Examples: the tester runs the core tests and takes one screenshot of the Auto-place dialog; the code reviewer reviews commit fb3cc44; a task lead starts one Haiku worker. Check that each agent uses the right model, reports the status format, and that the screenshot arrives on the dashboard. Fix the agent files.
11. **Director prompt.** Write `.claude/roadmap/director-prompt.md`: how the director starts or continues the run (with `/loop`, from the ledger). Give the user the line to start it in a new session. Do not start the road map in this session: the director must begin with a clean context.

## Rules

- Classify first. For a question, answer and change nothing.
- Work on your branch. Never push to master. Push the branch only.
- Write user prose in STE (ASD-STE100 style): plans, the dashboard, commit bodies, reports.
- Evidence before claims: run the command and read its output before you say "done" or "passing".
- Scope lock: no changes outside the task. Mention other problems instead. Do not do the items of `room-type-calculations-small-fixes.md`: the user wants them later.
- No `pnpm add`. No `window.confirm` in the ui package. Never run prettier.
- Stop servers with TaskStop, never `pkill -f vite`.
- No chained or heredoc Bash commands: write scripts to the scratchpad and run them.
- Browser checks: keep one Chromium page with a PDF open at a time (the container has 3.9 GB). So only one tester or UI reviewer uses the browser at a time.
- Commit the plan files to git. Copy each changed plan to the hub, and check the copy with `cmp`.
- Commit messages end with the `Co-Authored-By` line from the system reminder.
