# Protocol of the agent framework for the routing road map

Written 2026-10-16. Origin: `.claude/plans/agent-framework-prompt.md`. The road map is §8 of `.claude/plans/auto-routing.md`: R2 (which network: systems), R3 (a start point for each network), R4 (where a duct or pipe may go), R5 (sizing), R6 (the shape of the network), R7 (electrical circuits). Part 1 (routing targets on stamps) is done. R8 is done with part 1.

The goal of the user: the framework takes over the role of the external reviewer and checker. The user does not have to give a go after each part. The user sees a dashboard, with screenshots, and can steer.

Every agent reads `.claude/roadmap/rules.md` first.

## 1. The roles

| Role | Agent file | Model | Tools (main) | Job |
|---|---|---|---|---|
| Director | the main session | the model of the session | all | Runs the road map. Starts every role. Keeps the ledger and the dashboard. Does the branches, merges, pushes, plan marks and hub copies. |
| Road map planner | `roadmap-planner` | sonnet | read, web, write plans | Writes the overview of R2 to R7, the batch of decisions, and later the plan of each part. |
| Road map auditor | `roadmap-auditor` | sonnet | read only | Checks the overview and each part plan against the code and the plans. It does not share context with the planner. |
| MEP domain checker | `mep-domain-checker` | sonnet | read, web | Checks the engineering of the overview and of each part plan. |
| Task lead | `task-lead` | sonnet | read, write briefs, `Agent` | Runs one task: brief, implement, test, code review, UI review, fix. Returns one summary. |
| Researcher | `researcher` | haiku | read, web | Collects sources from the web and from the code. |
| Implementer | `implementer` | haiku | read, edit, write, bash | Implements one brief. |
| Tester | `tester` | haiku | bash, read | Runs tests and builds. Runs browser checks. Takes screenshots. |
| Code reviewer | `code-reviewer` | haiku | read, bash (read-only) | Reviews the diff of a task against its brief, the plan and the rules. |
| UI reviewer | `ui-reviewer` | haiku | read, bash | Uses the page and reads the screenshots. Checks usability and completeness. |

Sonnet judges and Haiku works (decision of the user, 2026-10-16: "Let's use sonnet where you adviced opus instead").

Nesting: the director starts a task lead. The task lead starts Haiku workers. That is 2 layers below the main session. Claude Code allows 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`). Only the director and the task lead have the `Agent` tool. The workers do not.

## 2. The flow

1. **Overview.** The planner writes the overview of R2 to R7. The auditor and the domain checker check it, each one alone. The director merges the results and writes `.claude/plans/roadmap-overview.md`. The overview contains the batch of decisions of the user. The open questions of `.claude/plans/auto-routing-r2-prompt.md` go into the batch. The research and the comparison of that prompt become input for the plan of R2.
2. **The only planned stop.** The director puts the decision batch on the dashboard (events `decision`), sends a notification, and waits.
3. **Each part.**
   1. The planner writes the part plan `.claude/plans/auto-routing-r<N>.md`: the model, the phases, the tasks, the verification of each task.
   2. The auditor and the domain checker check it. The director fixes the plan or sends it back to the planner (at most 2 rounds).
   3. The director splits the plan into tasks (events `task`, state `planned`).
4. **Each task.** A task lead runs it (section 4). The task ends with: core tests, UI tests, `pnpm build`, a browser check through real DOM inputs, screenshots, a commit, and a push of the branch.
5. **After each part.** The director marks the part done in its plan (commit hash and verification, the same style as the done entries of part 1 in `auto-routing.md` §9). The director copies the plan to the hub. The director starts the next part on a new branch made from the current branch.
6. **The end.** The director sends a notification and writes a summary on the dashboard. The summary has the screenshots of each part.

States of a **part**: `overview`, `audited`, `decided`, `in progress`, `done`.
States of a **task**: `planned`, `briefed`, `implementing`, `testing`, `code review`, `UI review`, `fixing`, `done`, `blocked`.
States of the **run**: `idle`, `running`, `waiting` (for the user), `stopped`, `done`.

## 3. Decision policy

- **One batch at the start.** The planner collects all decisions of the user for R2 to R7, with a recommendation for each. Each decision has a short question, 2 to 4 options, and one recommendation with the reason. The user answers once, on the dashboard or in the terminal.
- **A new decision that is easy to reverse** (a name, a default value, a layout detail, an order of items): the director takes the recommendation, records it as `provisional` on the dashboard, and continues.
- **A new decision about the data model or the file format that the batch did not cover** (a new field in `ProjectDocument`, a schema version, a change of a saved format, a new stored entity): that part stops until the user answers. The director continues with a part that does not depend on it, or ends the run with a notification.
- **A decision that breaks a domain rule** (`rules.md` section 3): always stop.
- The director reads the answers and the steering notes of the user at the start of each cycle (section 8).

## 4. The task loop (the task lead)

The task lead gets: the task text from the part plan, the files to read, the branch, the work folder, and the ledger id. The task lead does not edit product code itself.

1. **Brief.** Write one brief for each implementer job in the format of section 5. Put the briefs in `<work>/briefs/`. One brief = one seam, at most about 150 changed lines. Jobs on the same file run one after another. Jobs on separate files can run in parallel.
2. **Implement.** Start an `implementer` for each brief. Read the diff of each result, even for DONE.
3. **Test.** Start the `tester` with the exact commands (core tests, UI tests, `pnpm build`, the browser check, the screenshots). A fail goes back to step 2 as a finding.
4. **Code review.** Start the `code-reviewer` on the diff. The task lead also reads the diff. Findings go back to step 2.
5. **UI review.** If the task changes what the user sees: start the `ui-reviewer` with the screenshots and the browser check. Findings go back to step 2.
6. **Fix.** A finding gets at most **2 fix rounds**. Then the task is `blocked` and the task lead reports to the director. Two failed fixes on the same symptom: stop, find the cause again (rule of the user).
7. **Finish.** The task lead commits the work (one commit for each task, message in STE, `Co-Authored-By` line) and pushes the branch. Then the task lead returns the summary of section 6.

## 5. The brief format (seven parts)

```
GOAL: <one sentence: what exists after this job that does not exist now>
CONTEXT: <2 or 3 sentences of the reason, so the worker sees when reality does not match>
TARGETS: <exact file paths; for an edit, the anchor>
EXACT SHAPES: <names, signatures and types, written out; a short snippet of nearby code to copy the style>
DO NOT TOUCH: <files, public APIs, behavior that must not change>
VERIFY: <the exact command and what a success looks like>
REPORT: <required shape: Status, Files changed, Verification (verbatim tail), Deviations, Observations>
```

Every brief also contains, word for word:

> If reality does not match this brief — file missing, signature different, pattern doesn't apply, verification fails twice — STOP. Report exactly what you found and what you tried. Do not improvise a workaround, do not widen the change, do not fix unrelated problems you notice.

and the line `Read .claude/roadmap/rules.md first.` The task lead owns the contract: all new names and types come from the briefs. Two parallel workers never invent the same name. If several briefs share a large block, write it once to a file and point to it.

Status codes of a worker: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT` (meaning in `rules.md` section 6). The report of a worker is a claim. The task lead reads the real diff.

## 6. The summary of a task lead

The first word is `Status:`. One of: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`. Then, in at most 40 lines:

- **Task:** the ledger id and the title.
- **Commit:** the hash and the branch (pushed: yes or no).
- **Verification:** each command, its exit code, and the summary line (verbatim).
- **Screenshots:** the full paths, one for each line, with a short caption.
- **Findings:** each finding with its severity and its outcome (`fixed`, `accepted`, `open`).
- **Provisional decisions:** each easy decision that the task lead took, with the reason.
- **Questions:** each decision that needs the director or the user.
- **Other problems seen:** things outside the scope. Not fixed.

## 7. The ledger

The source of truth is `.claude/roadmap/ledger.jsonl`. It is an append-only file. Each line is one event. The helper `node .claude/roadmap/ledger.mjs` adds events and prints them. The director commits the file at the end of each task, and when a part changes state. After a crash or a context compaction, the director runs `node .claude/roadmap/ledger.mjs show` and continues from that state. Do not edit the file by hand.

Common fields: `seq` (set by the helper), `at` (set by the helper), `type`, `id`. The newest event for a `type` and `id` replaces the older fields that it contains.

| type | id | fields |
|---|---|---|
| `run` | `run` | `status` (run state), `branch`, `note` |
| `part` | `R2` … `R7` | `name`, `order`, `state`, `branch`, `plan` (path), `commit`, `summary` |
| `task` | `R2-T03` | `part`, `order`, `title`, `state`, `role`, `commit`, `summary` |
| `now` | `now` | `role`, `task`, `note`, `since` (ISO time). Empty `role` means idle. |
| `decision` | `D-R2-01` | `part`, `question`, `options` (list of `{key, label}`), `recommendation` (a key), `reason`, `status` (`open`, `answered`, `provisional`), `answer` (a key or text), `by` (`user` or `director`), `kind` (`batch` or `new`) |
| `finding` | `F-R2-T03-1` | `part`, `task`, `source` (role), `severity` (`high`, `medium`, `low`), `text`, `status` (`open`, `fixed`, `accepted`) |
| `shot` | `S-R2-T03-1` | `part`, `task`, `caption`, `assetId`, `url` |
| `log` | `L-<seq>` | `text` (one short line, STE) |

The state of the ledger (`show`) is the fold of the events.

## 8. The dashboard

The dashboard is an artifact page. It is built from `.claude/roadmap/dashboard/index.html`. The link is in `.claude/roadmap/dashboard/URL.txt` and in the hub.

- **What it shows:** the road map R2 to R7 with the state of each part; the tasks of the current part with their states; "now working" (role, task, since when); the decision queue; the findings; the screenshots of each task and each finished part; a short log; the notes of the user.
- **How the data moves.** The page keeps its data in the `db` capability.
  - Collection `events`: one document for each ledger event, id `e000123` (the `seq`, 6 digits). The director writes only **new** documents, so no `if_version` is needed. The page folds the events like `ledger.mjs show`. This is the same fold, so the page and the ledger agree.
  - Collection `answers`: the user answers a decision on the page. The page writes one document `a-<decisionId>` with `{ decisionId, answer, at }`.
  - Collection `notes`: the user writes a steering note on the page. One document each, `{ text, at, handled: false }`.
- **The director's cycle** (at the start of a cycle, after each task, and at each wake-up of the loop):
  1. Run `node .claude/roadmap/ledger.mjs batch`. Pass the printed array as `writes` to `ArtifactData` (`action: batch`, the `url` of the dashboard). Then run `node .claude/roadmap/ledger.mjs mirrored <last seq>`.
  2. Read the collections `answers` and `notes` with `ArtifactData` (`list`). An answer to an open decision becomes a `decision` event with `status: answered`, `by: user`. A note: read it, act on it, then `update` the note with `handled: true` (read its `version` first, and pass `if_version`).
  3. If the ledger has more than 700 events in `events`, delete superseded documents with a batch. Keep the newest event of each `type` and `id`.
- **Screenshots.** The tester saves them in `<work>/shots/`. The director uploads each file with `Artifact` (`action: publish`, `url`, `asset: true`, `file_path` or `file_paths`). The result gives the `url` and `id` of each asset. The director adds a `shot` event for each.
- **Fallback.** If the account has no `db` or no `assets`: publish the folded state as `state.json` and the screenshots as files of the artifact, and publish again after each task. The page then reads `state.json` with `fetch`.
- **Language.** Prose on the page is in STE. The page works at phone width.

## 9. Branch policy

- The director continues on the branch of the previous part. The first part (R2) continues on the branch where the framework was merged (`worktree-agent-framework`, made from `worktree-auto-routing`). For each next part, make a new worktree branch from the current one. Name: `worktree-routing-r<N>`.
- The user tests several parts on Windows and merges. Never push to master. Push the branch of the part only.
- Merge `origin/master` into the branch only if the user asks. After a real merge, run `pnpm build` at the root.
- Each task is one commit. Plan changes are separate commits.
- After `git worktree add`, run `pnpm install` and `pnpm build` at the root.

## 10. Stop rules

The director stops the run (state `stopped`, a notification) when:

1. A task is `blocked` and the director cannot fix the cause with one change of the brief or the plan.
2. A decision about the data model or the file format is open and no other part can go on.
3. A decision would break a domain rule of `rules.md` section 3.
4. A check that passed before fails again after a merge or a rebuild, and the cause is not found in 2 tries.
5. Disk space is below 2 GB, or memory problems stop the browser twice in a row.
6. The user writes a steering note with the word STOP, or sets the run to `stopped`.
7. A permission prompt appears that the allow rules do not cover. The director does not work around it.

A stop is not a fail. The director writes the reason on the dashboard in STE and sends a notification (`PushNotification`). The director uses `PushNotification` only to ask the user for something: the decision batch, a stop, or the end of the road map.

## 11. Permissions

An unattended run stops at each permission prompt. The allow rules are in `.claude/roadmap/permissions.md`. They go into `.claude/settings.local.json` only after the user agrees.

## 12. Hub

- Copy `protocol.md` to `/taco/notes/Obsidian Vault/Project Docs/MepApp/Specs/agent-framework.md`, and check the copy with `cmp`.
- Copy each changed plan (`roadmap-overview.md`, `auto-routing-r<N>.md`) to `Specs/` in the same way. Check each copy with `cmp`.
- Write the link of the dashboard in the hub entry of the project.

## 13. The director

See `.claude/roadmap/director-prompt.md`. The director is the main session of a new, clean session. It starts or continues the run from the ledger, with `/loop`.
