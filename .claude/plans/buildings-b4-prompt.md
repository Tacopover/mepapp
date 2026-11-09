# Prompt for a new session: B4 risers between levels

Start a new Claude Code session in `/root/MepApp`. Use the prompt below as the first message. Read the whole file first.

---

## Prompt

You continue the MepApp buildings stream. B1 to B3 and the web building store (B1-T19) are done and merged to `master` (c8b6152, 2026-11-09). The user tested them on Windows (desktop) and in Chrome and Firefox (web). Now you start **B4: risers between levels**. The plan is `.claude/plans/buildings-b4.md`. It was written 2026-10-31, it is **not audited**, and it is older than the B3 feedback rounds and the web store. Treat its line numbers and API names as unverified.

### Rules

- Call `EnterWorktree` and work on a new branch off `master`. Never work in the main checkout. Push the branch only. `master` is live (auto-deploy). The user tests on Windows and merges.
- Commit each task alone. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Use the agent framework: skill `roadmap-director`, stream `buildings`, ledger `.claude/roadmap/ledger-buildings.jsonl` (use `ledger.mjs --stream buildings`, last seq is 300), dashboard `https://claude.ai/artifact/KFsd9h8ZqGsRWaY9146D7i`. Read `.claude/roadmap/rules.md`, `protocol.md`, `ux-lessons.md`, `ui-guide.md` and `ux-checklists.md`. Start the session so that the agent files load (`ux-designer`, `journey-tester`, `ui-reviewer`). If a named agent is missing, use a general-purpose agent that reads `.claude/agents/<role>.md`.
- Read the `answers` collection of the dashboard at the start of each cycle. Mirror new ledger events and screenshots at once (`.claude/roadmap/tools/mirror-batch.mjs`, then ArtifactData batch, then `ledger.mjs --stream buildings mirrored <seq>`).
- One command per Bash call, no chained commands, no heredocs (write a script with Write, then run it). No `pnpm add` (edit `package.json` by hand, then `pnpm install`). No prettier. Never `pkill -f vite`. No `window.confirm` in `ui`. Nothing outside `pdf-engine-mupdf` imports `mupdf`. No paid dependency. Do not edit `.claude/roadmap/permissions.md` or `.claude/settings.local.json`. No bare `git stash`.
- Evidence before claims. Browser checks use real DOM inputs. One Chromium page at a time. Never two heavy runs at once (core tests take about 140 s and 3.9 GB).
- English-only UI. Write prose for the user in ASD-STE100 style (short sentences, active voice, one word per meaning, define new terms). Use they/them for people.
- Say clearly what you did not run on a real browser profile, Tauri or Windows.

### Lessons from the last session (apply them)

- A change that keeps old browser checks green must not change what plain `pnpm dev` or production does. Plain `pnpm dev` now uses the real web building store. Old checks opt in to the in-memory dev store with `localStorage mepapp.devPlatform=1` (`lib.mjs` `open()` sets it unless the seed has `mepapp.webLike` or `mepapp.realStore`). Add at least one check that runs with no flags. Import `lib.mjs` by relative path (`../browser/lib.mjs`).
- The user found problems the agents missed, each time by using the dialog. Run the `ux-designer` first for every screen task, and the `journey-tester` before you call a screen task done. Show the wireframe, journeys and texts of any new dialog to the user on the dashboard (event `decision`, kind `ux`) before the implementation starts.
- Production `dist` must not contain `__mepBuilding`, `devPlatform` or `webLike`. Grep `apps/web/dist` after `pnpm build --force`.
- Web mode (Chrome, Firefox) has no path read: PDFs need "Choose file…" after a restart (D-B-53, accepted). Risers must work in both desktop and web mode. Web matches sheets by project id, then by name and size.
- Run the 29-check runner (`.claude/roadmap/work/run-all-b3-checks.mjs`) before you finish a task that touches the dialog or the building controller. The result must be `checks with problems: 0`.

### What to do first

1. Read `.claude/plans/buildings-b4.md`, `buildings-levels-sheets-spec.md` (sections 3.4, 3.6, 5.5, 6) and the memory file `project-buildings-levels-sheets-scoping.md`.
2. Verify the plan against the code that exists now: the building file model in `packages/core`, `BuildingController` in `packages/ui/src/buildingController.ts`, the scene APIs the plan names (`applyRemoteFittingMove`, `activateDocument`, `drawingHistory`, `setNetworkTypeForSegmentsNetworks`, `canvasContextMenuRequested`). The plan says some of these are "not verified". Check each one.
3. Run the `roadmap-auditor` and the `mep-domain-checker` on the plan (separate, no shared context). Fix the plan from their findings. Put any new question for the user on the dashboard as a `decision` event with options and a recommendation.
4. Start with Phase 1 (the model in core: T01 to T03). Then Phase 2 (the scene), then Phase 3 (the UI).

### Decided (do not ask again)

D-B-04 (a riser has the same x and y on every level; a move syncs), D-B-07 A (a riser is an entity in the building file), D-B-13 A (a type change on a riser run retags all levels, pending ops for closed documents), D-B-14 custom (the anchor is in real-world mm, origin bottom-left of the displayed page, y up; a shared coordinate system is B5), D-B-18 A, D-B-20 A, D-B-21, D-B-22, D-B-23, D-B-53 (no persisted PDF handles).

### Stop and ask the user when

- A decision touches the data model or the file format and the plan does not cover it.
- A decision breaks a domain rule (`rules.md` section 3), for example the rule that a connected run has one network type.
- The audit finds that the plan cannot work as written.

### Finish

Push the branch only. Do not merge to `master`. Write a Windows test script for the user (one PC, steps with "Check:" lines, like `buildings-t19-test.md`). Tell the user what you did not run on Windows, Tauri or a real browser profile. Do not start B5.

### Open items from B1-B3 you may meet (not part of B4)

- The text "Save it to link it" (open documents list) and the chip "Not linked yet" name the same state. The user should pick one term.
- Browser-mode buildings have no "Delete building" button.
- T16 (Windows spike: Tauri fs scope, new file in a picked folder, stat outside scope) is open.
- `pnpm --filter @mepapp/web typecheck` fails on `import.meta.env`. It failed before B4.
