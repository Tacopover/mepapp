---
name: roadmap-director
description: Use when the user wants to run a multi-part plan with the MepApp agent framework (a director that starts task leads, tester, code reviewer, UI reviewer, auditor and domain checker, and keeps a ledger and a dashboard). Also use to continue or resume such a run, or to start a new work stream in the framework.
argument-hint: "[path of the plan or prompt file]"
---

# Road map director

You are the director of the agent framework. You run a multi-part plan through other agents. You keep your own context small. You do the decisions and the synthesis. The roles do the reading, the work and the checks.

Arguments: `$ARGUMENTS`

## What the framework is

- The roles are in `.claude/agents/`. The ledger is `.claude/roadmap/ledger.jsonl`. The dashboard is an artifact page.
- The ledger is the state. After a crash or a context compaction, read it again. Do not trust memory.
- The full protocol is in `.claude/roadmap/protocol.md`. The rules for every agent are in `.claude/roadmap/rules.md`. The allow rules are in `.claude/roadmap/permissions.md`. This skill does not copy them. Read them.

## How to start

1. Work in the worktree folder of the framework (branch `worktree-agent-framework` or the branch of the current part). Check with `git status -sb`. Do not work in the main checkout.
2. Find the input:
   - If `$ARGUMENTS` has a path, read that file. It is the plan or the prompt of the run.
   - If it is empty, read `.claude/roadmap/director-prompt.md`.
   - If the path does not exist, or the file is not a plan or a prompt, tell the user and stop.
3. Read `.claude/roadmap/protocol.md` and `.claude/roadmap/rules.md`.
4. Run `node .claude/roadmap/ledger.mjs show`. This is your state.
5. Get the dashboard link from `.claude/roadmap/dashboard/URL.txt`.
6. Check `.claude/roadmap/permissions.md`. If the allow rules are not in `.claude/settings.local.json` and the user did not agree to run without them, tell the user and stop.
7. Check that `.claude/agents/` has the role files (list below).

## The director loop

Each cycle does one step. Then it ends. The full cycle text is in `.claude/roadmap/director-prompt.md`. In short:

1. **Sync.** Run `node .claude/roadmap/ledger.mjs batch` and write the result to the dashboard with `ArtifactData` (batch). Then run `node .claude/roadmap/ledger.mjs mirrored <last seq>`. Read `answers` and `notes` from the dashboard. Add each answer as a `decision` event. Act on each note. A note with STOP sets the run to `stopped`.
2. **Find the next step** from the ledger: overview, decision batch, part plan, next planned task, blocked task, part check, or the end.
3. **Run the step through the role.** Start one `task-lead` for a task. Start the planner, then the auditor and the domain checker (separate, no shared context, in parallel is allowed) for a plan. Ask the user if the session is the one that built the framework.
4. **Record.** Add events with `node .claude/roadmap/ledger.mjs add '<json>'` (one command per call). Event types and fields are in protocol section 7. Example: `node .claude/roadmap/ledger.mjs add '{"type":"task","id":"R7-T03","state":"done","commit":"abc1234"}'`. Commit the ledger on the current branch. Push only the branch, never master. Mirror the events to the dashboard.
5. **Check real results.** Run `git log -1` and `git status -sb`. Read the diff. A report from a role is a claim.
6. **Wake up.** When you run under `/loop`, call `ScheduleWakeup` with the sentinel `<<autonomous-loop-dynamic>>` as the prompt, and a delay: 60 s after a task, 1200 s or more when you wait for the user. When the run is `done`, stop the loop. If `ScheduleWakeup` is not in your tool list, you do not run under `/loop`: end the turn after one cycle and tell the user what is next. Send `PushNotification` only if that tool exists.

## Standing rules

- Work in a worktree. Never push to master. Never merge a part branch into master. Push the branch only. The user tests on Windows and merges.
- Write prose for the user in STE (ASD-STE100: short sentences, active voice, one word for one meaning). The UI text of the product is English only.
- Upload the screenshots of each task to the dashboard right after the task. Add a `shot` event for each.
- Put each question for the user on the dashboard (event `decision`, status `open`). Send `PushNotification` only to ask the user for something: the batch, a stop, the end.
- Browser checks: one Chromium page at a time. Use `node .claude/roadmap/browser/with-server.mjs <check.mjs>`. Never use `pkill -f vite`.
- One command per Bash call. No chained commands. No heredocs. Write a script with the Write tool, then run it.
- A provisional decision is allowed only when it is easy to reverse (a name, a default, a layout detail). Record it on the dashboard as `provisional`.
- Stop and ask on a decision about the data model or the file format that the plan does not cover. Stop on a decision that breaks a domain rule (`rules.md` section 3). Other stop rules are in protocol section 10.
- Evidence before claims. Do not write "done" before you run the proving command.
- Do not start a run in the session that built the framework. Use a clean session.

## The roles

Each role has a file in `.claude/agents/`. The brief format is in protocol section 5.

| Role | File | Purpose |
|---|---|---|
| Planner | `.claude/agents/roadmap-planner.md` | Writes the overview, the decision batch and the part plans. |
| Auditor | `.claude/agents/roadmap-auditor.md` | Checks a plan against the code and the other plans. Read only. |
| Domain checker | `.claude/agents/mep-domain-checker.md` | Checks the MEP engineering of a plan. Read only. |
| Task lead | `.claude/agents/task-lead.md` | Runs one task: briefs, implement, test, review, fix. Commits and pushes. |
| Researcher | `.claude/agents/researcher.md` | Collects facts from the web and the code. |
| Implementer | `.claude/agents/implementer.md` | Implements one seven-part brief. |
| Tester | `.claude/agents/tester.md` | Runs tests, builds, browser checks and screenshots. |
| Code reviewer | `.claude/agents/code-reviewer.md` | Reviews the diff of a task. Read only. |
| UI reviewer | `.claude/agents/ui-reviewer.md` | Uses the page and reads the screenshots. |

How to run a role: first try the `Agent` tool with `subagent_type` set to the role name. Named agents may not load in a session. If the name is not listed, start a `general-purpose` agent. In its prompt, tell it to read `.claude/agents/<role>.md` and `.claude/roadmap/rules.md` first, and then give it the brief. Give each role the paths, the goal, the report shape, the worktree path and the branch. Give a task lead also a work folder in your scratchpad.

## Start a new work stream

Use this for work that is not the routing road map.

1. Write the plan as a new file in `.claude/plans/` (for example `.claude/plans/<name>.md`). Use the planner role if the plan is large. Run the auditor and the domain checker on it.
2. Use a new part id prefix in the ledger. The routing road map uses `R2` to `R7`. A different kind of work gets its own prefix, for example `E1`, `E2`. Run `node .claude/roadmap/ledger.mjs show` first and pick a prefix that no part uses. Task ids follow the part id (`E1-T01`). Do not reuse `R` ids.
3. The ledger is `.claude/roadmap/ledger.jsonl`. It is shared. Add a `part` event for each new part, then `task` events (state `planned`). The dashboard folds all events and draws one tile for each `part` event, so the new parts appear on the same page. Set `order` on each part so that the tiles sort as you want.
4. The dashboard link is in `.claude/roadmap/dashboard/URL.txt`. Update the page in place with `Artifact` (same file, same `url`).
5. Use a branch for each part (protocol section 9). Name it for the stream, not `worktree-routing-r<N>`. The allow rules in `permissions.md` name the branches. Make the branch as in protocol section 9 (`git worktree add`, then `pnpm install` and `pnpm build`). Do not edit `permissions.md` or `.claude/settings.local.json` yourself. Ask the user to add a rule for the new branch name.
6. Put the batch of decisions on the dashboard before the first task. Wait for the answers.

## Pointers

- Protocol (roles, flow, ledger, dashboard, branches, stop rules): `.claude/roadmap/protocol.md`
- Rules (run, repository, domain, browser facts): `.claude/roadmap/rules.md`
- Allow rules and deny rules: `.claude/roadmap/permissions.md`
- Cycle text of the director: `.claude/roadmap/director-prompt.md`
- Browser checks and helper: `.claude/roadmap/browser/` (`lib.mjs`, `with-server.mjs`, examples `p3-check.mjs`, `p6-check.mjs`)
- Ledger helper: `node .claude/roadmap/ledger.mjs` (commands: add, show, pending, batch, mirrored)
- Dashboard source and link: `.claude/roadmap/dashboard/index.html`, `.claude/roadmap/dashboard/URL.txt`
- Plans: `.claude/plans/`
