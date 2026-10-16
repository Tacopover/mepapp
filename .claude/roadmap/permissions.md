# Allow rules for an unattended run

An unattended run stops at each permission prompt. This file lists the calls of the framework that ask for permission and the rules that cover them. The rules go into `.claude/settings.local.json` of the worktree (or of the main checkout) **only after the user agrees**. They are not applied yet.

## Calls that ask for permission

| Call | Who | Why |
|---|---|---|
| `git add`, `git commit`, `git push origin <branch>` | task lead, director | One commit for each task. The branch is pushed after each task. |
| `git worktree add`, `git fetch` | director | A new branch for each part. |
| `pnpm install`, `pnpm build`, `pnpm test`, `pnpm typecheck` | tester, director | Tests and builds. |
| `node .claude/roadmap/ledger.mjs …` | director | Ledger events. |
| `node .claude/roadmap/browser/with-server.mjs …` | tester, ui-reviewer | Browser checks. |
| `cp`, `cmp` to the hub folder | director | Plan and protocol copies. |
| `Write`, `Edit` in the worktree | all roles that write | Plans, briefs, checks, product code. |
| `ArtifactData` (batch, list, update) on the dashboard | director | Events, answers, notes. |
| `Artifact` (publish, asset upload) on the dashboard | director | Screenshots, page updates. |
| `PushNotification` | director | The decision batch, a stop, the end. |
| `Agent` (start a role) | director, task lead | All roles. |
| `ScheduleWakeup` | director | The `/loop` cycle. |

## Proposed rules

Put this in `permissions.allow` of `.claude/settings.local.json`:

```json
[
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git fetch:*)",
  "Bash(git add:*)",
  "Bash(git commit:*)",
  "Bash(git worktree add:*)",
  "Bash(git push origin worktree-agent-framework)",
  "Bash(git push origin worktree-routing-*)",
  "Bash(git push -u origin worktree-routing-*)",
  "Bash(pnpm install)",
  "Bash(pnpm build)",
  "Bash(pnpm test)",
  "Bash(pnpm typecheck)",
  "Bash(pnpm --filter:*)",
  "Bash(node .claude/roadmap/ledger.mjs:*)",
  "Bash(node .claude/roadmap/browser/with-server.mjs:*)",
  "Bash(MEPAPP_SHOTS=* node .claude/roadmap/browser/with-server.mjs:*)",
  "Bash(node --check:*)",
  "Bash(cmp:*)",
  "Bash(cp * /taco/notes/Obsidian Vault/Project Docs/MepApp/Specs/*)",
  "Bash(ls:*)",
  "Bash(grep:*)",
  "Write",
  "Edit",
  "Agent",
  "ArtifactData",
  "Artifact",
  "PushNotification",
  "ScheduleWakeup"
]
```

Put this in `permissions.deny` so that the run can never publish to master:

```json
[
  "Bash(git push origin master:*)",
  "Bash(git push origin main:*)",
  "Bash(git push --force:*)",
  "Bash(git push -f:*)",
  "Bash(git reset --hard:*)",
  "Bash(pkill:*)"
]
```

## Notes

- A push to `master` deploys to the live site (`https://app.mepsketcher.com`). The allow rules for `git push` name the branch. The deny rules block master.
- `Write` and `Edit` have no path limit here. The roles write plans, briefs and product code in many folders. The scope of each role is in its agent file, not in the permission.
- A command with `&&`, a pipe or a heredoc is not covered by these rules, and the harness refuses it as "too complex". The agent files tell each role to run one command for each call.
- Subagents may not inherit the allow rules of the parent in all versions. The dry run checks this. If a worker still stops at a prompt, add the rule to the `tools` list or to the settings that the worker reads.
