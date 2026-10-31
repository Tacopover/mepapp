# Prompt: plan the Buildings, Levels and Sheets stream (parts B1 to B4)

Paste this prompt into a new Claude Code session that starts in `/root/MepApp`. This session plans. It writes no product code.

## Step 0: set up

1. Run `git fetch origin`. The branch `worktree-buildings-model` exists on origin and as a worktree at `/root/MepApp/.claude/worktrees/buildings-model`. Call `EnterWorktree` with `path` set to that folder. If the folder is missing, run `git worktree add .claude/worktrees/buildings-model worktree-buildings-model` first. Do not work in the main checkout. Do not push to `master`.
2. Run `git log --oneline -3` and `git status -sb`. The branch is based on `worktree-quantities-export` (the Excel quantities export). That code is **not on `master`**. Do not merge or rebase onto `master`.
3. Run `pnpm install`, then `pnpm build` at the repository root. The `node_modules` and `dist/` folders do not carry over from other machines (see `CLAUDE.md`).
4. Load the skill `roadmap-director`. This stream has its **own ledger and dashboard**. Every `ledger.mjs` command needs `--stream buildings` before the command, for example `node .claude/roadmap/ledger.mjs --stream buildings show`. The dashboard link is in `.claude/roadmap/dashboard-buildings/URL.txt` (source `.claude/roadmap/dashboard-buildings/index.html`). Write events to this ledger only. Never write to `ledger.jsonl` (the routing ledger).
5. Check `.claude/roadmap/permissions.md`. The allow rules may not name the branch `worktree-buildings-model` or the `--stream` flag. If a command asks for a permission, tell the user. Do not edit `permissions.md` or `.claude/settings.local.json`.

## Read first

- Memory `project-buildings-levels-sheets-scoping` (decided design, rejected framings, file and line facts). Read it fully.
- `.claude/plans/buildings-levels-sheets-scoping-prompt.md` (the six questions and the deliverable).
- `.claude/roadmap/protocol.md`, `.claude/roadmap/rules.md`, and `CLAUDE.md`.
- Run `node .claude/roadmap/ledger.mjs --stream buildings show`. It lists the parts B1 to B4 (state `overview`) and decisions D-B-01 to D-B-08.
- Memories `project-storage-interfaces`, `project-auto-routing-plan`, and `feedback-reuse-existing-mechanisms-before-designing-new`.

## Goal

MepApp must support a **building** made of **levels** and **sheets** (a sheet is one PDF page of one document). First goal: the Level and Building scopes of "Export quantities to Excel". Second goal: **risers** that connect segments between levels.

## Decisions already made by the user (do not ask again)

| Id | Decision |
|---|---|
| D-B-01 | The PDFs of a building live anywhere on the PC. The building file stores a location for each sheet. No "folder next to the PDFs". |
| D-B-02 | One PDF page belongs to exactly one level. A PDF can have many pages, each on a different level or area. A building has 1 to hundreds of PDFs. |
| D-B-03 | A missing PDF: the Building takeoff uses its saved summary and shows a warning. |
| D-B-04 | A riser has the same x and y on every level. A move on one level syncs to the other levels. |
| D-B-05 | Web is optional. Desktop-first is acceptable. Spend little effort on web. A backend (for example Supabase) may be considered. Director recommendation: no backend. |
| D-B-06 | Own ledger and dashboard. Branch from `worktree-quantities-export`. |
| D-B-07 | **A.** A riser is an entity in the building file with one anchor (x, y) and the list of segments on each level. |
| D-B-08 | **A.** Add `pageIndex` to `PlacedStamp` (schema step). |

## Facts the planner must verify, not trust

- `PlacedStamp` has no `pageIndex` (`packages/core/src/stamp.ts:8`). Check how `packages/render/src/scene.ts` partitions stamps by page today.
- The project JSON has no document id. Schema is v21 (`packages/core/src/project.ts:22`). The new id needs a v22 migration step.
- `ConnectionPoint` (`packages/core/src/network.ts:50-52`) resolves ids inside one document. A riser must not break the rule that connected segments never have different network types (`rules.md` section 3).
- `buildQuantityTables` is single-document (`packages/core/src/quantities.ts`, on this branch). Ids and network labels collide when documents merge.
- `ProjectStore` (`packages/platform/src/project-store.ts`) is provisional and unused. Check whether it fits the building file before you design a new store.
- The old app (`/root/MepSketcher`) has no riser. It keeps `Elevation` as display only. Its registry and identity code are the model for B1 to B3. Citations are in the scoping memory.

## Task

1. Delegate surveys to `researcher` or `Explore` agents. Do the decisions yourself.
2. Run the `roadmap-planner` role. It writes `.claude/plans/buildings-levels-sheets-spec.md` with the six sections of the scoping prompt, and one plan file for each part (`.claude/plans/buildings-b1.md` to `buildings-b4.md`). Each part has phases and small tasks, and each task has a way to verify it.
3. Run `roadmap-auditor` and `mep-domain-checker` on the spec, separately. Fix the real findings.
4. Add the tasks to the buildings ledger (`task` events, state `planned`, ids `B1-T01` and so on). Put every new open question on the dashboard as a `decision` event with status `open`. Mirror the events to the dashboard (`ledger.mjs --stream buildings batch`, then `ArtifactData` batch, then `mirrored <seq>`).
5. Commit the plans and the ledger. Push the branch `worktree-buildings-model`.
6. **Stop.** Do not start implementation. Tell the user the spec path, the parts and the open decisions. The user reviews the plan first.

## Constraints

- Follow `CLAUDE.md`. Nothing outside `pdf-engine-mupdf` may import `mupdf`. No paid or non-free dependency (AGPLv3). Be careful with a hosted backend (AGPL network-use rule).
- Reuse an existing mechanism before you design a new one.
- One command for each Bash call. No chained commands. No heredocs.
- Write prose for the user in STE (short sentences, active voice, one word for one meaning).
- Upload screenshots to the dashboard after each task. This applies from the implementation phase on.
- Ask the user a question only when a decision on the data model or the file format is theirs and the plan does not cover it.
