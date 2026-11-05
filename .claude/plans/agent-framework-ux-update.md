# Agent framework update: what the Building dialog rounds taught

Date: 2026-11-04. Branch: `worktree-agent-framework-ux-update` (from master `9dd031a`). Input: `.claude/plans/agent-framework-ux-update-prompt.md` (19 user findings from 3 Windows test rounds of the Building dialog, stream `buildings`, tasks B3-T01 to B3-T13).

Terms. **UX spec**: a file with the journeys, tables, texts and wireframe of a screen, written before the implementation. **Journey**: a goal of a user and the steps to reach it. **Friction**: an extra step, an unclear text, a dead control, a state with no message, or a moment where the user must guess. **Self-confirming check**: a check that the implementer wrote for the design of the implementer.

## 1. Decision: which items go into the framework

The framework must run on other tasks. An item goes in only when it becomes a rule that any screen task can check. Result: 18 of 19 items kept (merged into 10 general rules). Item 16 (PDF names under the levels in the tree) is dropped: it is a design choice of this dialog.

| Item | Decision | General rule (lesson) |
|---|---|---|
| U1 Move/Sort buttons for levels | keep | L1 derive it or ask for it |
| U2 "Add folder" puts pages in "Not placed" | keep | L2 an action acts on the current selection |
| U3 "Open" closes the dialog | keep | L3 a repeated action stays repeatable |
| U4 Selected building jumps to the top | keep | L4 a list keeps its order |
| U5 "Close building" command | keep | L5 the user owns every concept on the screen |
| U6 Quiet export failure, cut text | keep | L6 every action shows its result |
| U7 Uneven rows, weak sections | keep | L7 layout is a grid |
| U8 Picker allows 1 file | keep (general form) | L8 list what the web fake hides |
| U9 Impossible "No access" test step | keep | L9 a test step must be possible on the test machine |
| U10 No rename | keep | L10 entity by action table |
| U11 "Untitled" entry in the empty state | keep | L11 look at every state |
| U12 Cryptic "Remove its 2 sheets first" | keep | L12 a message says what happened and what to do |
| U13 PDFs assignable to the building | keep | L13 no forbidden state is reachable |
| U14 "Open" looks the same after opening | keep (with U11) | L11 |
| U15 Dead "Open" badge | keep | L14 every visible control does something |
| U16 PDF names under levels in the tree | **dropped** | design choice, no rule |
| U17 Silent skip of a PDF on another level | keep (with U6) | L6 |
| U18 Round 1 picker fix was test-only | keep | L18 a fix needs a check that fails first |
| U19 "Save it to link it" | keep (with U5) | L5 |

## 2. Why no agent found them

Evidence: the roles in `.claude/agents/`, `protocol.md` section 4, the check scripts `b3-t11-check.mjs` and `run-all-b3-checks.mjs`, and the plans `buildings-b3-ui.md`, `buildings-b3-ui-review.md`, `buildings-b3-feedback.md`, `buildings-b3-feedback2.md`.

Findings about the old loop:

1. The `ui-reviewer` ran on `haiku`. Its list was "complete, works, consistent, not more work, readable, safe, no errors". It had no layout measurement, no copy test, no list of invalid states, no dead-control audit, no entity list.
2. The task lead wrote the browser check for the controls that the task changed. The check asserted what the implementer built (self-confirming). `b3-t11-check.mjs` tests ids and states of controls that exist. It cannot find a control that is missing (rename), a flow that is bad (Open closes the dialog), or a text that is bad.
3. Nobody played a user with a goal and counted steps. The T11 review (`buildings-b3-ui-review.md`) did make a step table. It was written after the implementation by the director, and it listed 22 findings, but two of them came back as user findings in round 1: R-7 (one file for each picker, U8) and R-9 (two close buttons, related to U5). I did not find a written outcome for them in the T11 plan. The review found them, and the loop did not force a decision.
4. The plan phase reviewed data and behavior (`D-B-*` decisions). Nobody reviewed the screen. The user saw it first at the end.
5. Browser checks ran on the web build with a fake picker. The plan lists "what the web run could not prove" only in the Windows test script, which the same agent wrote after the work.
6. The Windows test script asked for something that one PC cannot do (step 9, "No access").
7. Process: `run-all-b3-checks.mjs` counted failures but never set an exit code, so a caller saw exit 0 on a failure. It ran 29 checks for each task (about 50 minutes). Task leads handed back while a worker still ran. The ledger mirror to the dashboard was manual and late.

Per item (the role that should have caught it, the step of the loop, the cause):

| Item | Should catch | Loop step | Cause |
|---|---|---|---|
| U1 Move/Sort buttons | designer, ui-reviewer | plan, UI review | No "derive it or ask for it" test. The plan had D-B decisions about order but no one asked whether a control was needed. |
| U2 "Not placed" | designer, journey-tester | plan, UI review | The task lead's check tested the flow that it built. No journey "put PDFs on the selected level". |
| U3 Open closes dialog | journey-tester | UI review | No journey repeated the main action 3 times. |
| U4 List reorders | ui-reviewer | UI review | No stability check (order before and after a select). |
| U5 Close building | designer | plan | Nobody asked "does the user have this concept?". The model had an "open building". |
| U6 Quiet failure | ui-reviewer, journey-tester | UI review | No feedback audit. Failure paths were not run in the checks. |
| U7 Layout | ui-reviewer | UI review | The haiku reviewer read screenshots with no measurement. Row edges and section size were not measured. |
| U8 One-file picker | task lead, designer | plan, test | The web fake hid it. No platform table. |
| U9 Impossible step | journey-tester | test script | The script was written by the same agent after the work, and nobody checked if one PC can do each step. |
| U10 No rename | designer, ui-reviewer | plan, UI review | No entity by action table. |
| U11 "Untitled" entry | ui-reviewer | UI review | The empty state was not on any list. |
| U12 Cryptic text | ui-reviewer | UI review | No copy audit. |
| U13 PDFs on the building | designer, ui-reviewer | plan, UI review | No invalid-state audit. |
| U14 No feedback after Open | designer, ui-reviewer | plan, UI review | No "already done" state in any table. |
| U15 Dead badge | ui-reviewer | UI review | No dead-control audit. |
| U17 Silent skip | ui-reviewer | UI review | Same as U6. |
| U18 Test-only fix | task lead, code reviewer | fix | A fix needed no failing check first. |
| U19 "Save it to link it" | designer | plan | An implementation limit shown as a task. Same cause as U5. |

## 3. What changed (this branch)

| Change | File | Fixes |
|---|---|---|
| New agent `ux-designer` (sonnet): writes the UX spec before the implementation | `.claude/agents/ux-designer.md` | causes 4, U1, U2, U5, U10, U11, U13, U14, U19 |
| New agent `journey-tester` (sonnet): goals not steps, 3 widths, empty and full state, friction log, step count, platform steps | `.claude/agents/journey-tester.md` | causes 2, 3, U2, U3, U6, U9 |
| `ui-reviewer` upgraded: sonnet, layout measurement, 7 audits, Nielsen pass, reads each screenshot itself | `.claude/agents/ui-reviewer.md` | cause 1, U4, U6, U7, U11, U12, U15 |
| Shared checklists: spec format, measurement, audits, journey method | `.claude/roadmap/ux-checklists.md` | all |
| Lessons file (general rules L1 to L18 with the case) | `.claude/roadmap/ux-lessons.md` | all |
| UI pattern guide (section card, row grid, buttons, states, empty texts, dialogs) | `.claude/roadmap/ui-guide.md` | U7, U13, U14 |
| Layout measurement helpers | `.claude/roadmap/browser/layout-measure.mjs` | cause 1, U4, U7 |
| Check runner that exits non-zero on a fail, with `--only` | `.claude/roadmap/browser/run-checks.mjs` | cause 7 |
| Mirror batch tool | `.claude/roadmap/tools/mirror-batch.mjs` | cause 7 |
| Task lead: starts the `ux-designer`, platform check, failing check for a user-reported fix, no hand-back while a worker runs, journey tester at UI review | `.claude/agents/task-lead.md` | causes 2, 5, 7, U8, U18 |
| Rules section 1a (self-confirming check, second author for journeys, finding outcomes, platform script) | `.claude/roadmap/rules.md` | causes 2, 3, 6, U9 |
| Protocol: roles, step 0, section 4a (UX spec and wireframe approval), mirror tool | `.claude/roadmap/protocol.md` | cause 4 |
| Director prompt and skill: start order, wireframe on the dashboard, part check with journey tester | `.claude/roadmap/director-prompt.md`, `.claude/skills/roadmap-director/SKILL.md` | cause 4 |

Not done on purpose:
- The new agents use the same Bash commands as the existing ones, so the allow rules cover them. The two new commands got allow rules after the user agreed (2026-11-04): `node .claude/roadmap/browser/run-checks.mjs:*` and `node .claude/roadmap/tools/mirror-batch.mjs:*`, in `.claude/settings.local.json` and in `permissions.md`.
- The ledger and the dashboard work as before. Only the mirror step is easier.
- The `code-reviewer` is unchanged.

## 4. Proposals ranked by value and cost

| Rank | Proposal | Value | Cost | State |
|---|---|---|---|---|
| 1 | UX spec before the implementation (`ux-designer`) | high: finds the U1/U2/U5/U10/U11/U13/U19 class before code exists | medium: 1 sonnet run for each screen task | done |
| 2 | Journey check by a second agent | high: finds flow and feedback problems | medium: browser time | done |
| 3 | Upgraded `ui-reviewer` with measurement and audits | high | low | done |
| 4 | Wireframe approval by the user for a new dialog | high: the user sees the screen first at the start | low | done (protocol 4a) |
| 5 | Check runner with exit code and `--only` | medium | low | done |
| 6 | Mirror tool, no hand-back while a worker runs | medium | low | done |
| 7 | Platform table and platform test script from journeys | medium | low | done |
| 8 | Allow rules for the two new tools | low | needs the user | done (user agreed 2026-11-04; `settings.local.json` and `permissions.md`) |
| 9 | Mine the T11 review findings that had no outcome (R-7, R-9) for a "finding must get an outcome" check in the ledger tool | medium | medium: a ledger change | not done (the prompt says keep the ledger as is) |

## 5. Replay test

Setup. Commit `c9af4aa` (B3-T11 complete, the state that the user tested first) in a detached worktree `.claude/worktrees/replay-c9af4aa` (read only, not pushed). `pnpm install` and `pnpm build` ran there. One round. The three new agents ran as `general-purpose` agents (model sonnet) that read their role file, because agent files load only at the start of a session. They ran blind: no access to the review, feedback or Windows test plans, no ledger, no list of the 19 items. One browser at a time.

| Agent | Run | Result file |
|---|---|---|
| `ux-designer` | task text of B3-T11, no browser, then a gap list against the code | `replay-r1/ux/B3-T11-spec.md` (30 gaps) |
| `journey-tester` | 6 goals, real clicks, empty start and 30-row stress state | `replay-r1/journey/friction-log.md` (Verdict FAIL, 6 high, 10 medium) |
| `ui-reviewer` | UX spec sections 1 to 9, measurement at 3 widths, 7 audits | `replay-r1/review/ui-review.md` (Verdict FAIL, 6 high, 8 medium) |

The result files are in the session scratchpad, not in git. This report keeps the summary.

### Count: which of the 19 items each agent found

`D` = ux-designer, `J` = journey-tester, `R` = ui-reviewer. A mark means that the agent reported the same problem. A partial match does not count.

| Item | D | J | R | Found |
|---|---|---|---|---|
| U1 Move/Sort buttons | x | x | x | yes |
| U2 "Not placed" after Add | x | x | x | yes |
| U3 Open closes the dialog | x | | x ("Choose file…" closes it) | yes |
| U4 Selected building jumps to the top | | | | no: all 3 agents checked and the order was stable at this commit. The user found it after the first test. Not reproducible here. |
| U5 "Close building", internal concepts | x | x | x | yes |
| U6 Quiet export failure, cut text | | x | x | yes |
| U7 Uneven rows, weak layout | x | x | x | yes |
| U8 One-file picker | x | x | | yes |
| U9 Impossible test step | | partly | | yes (counted): `journey-tester` wrote 9 platform steps and checked that one PC can do each one. |
| U10 No rename | x | x | x | yes |
| U11 "Untitled" entry in the empty state | | x | | yes |
| U12 Cryptic "Remove its 2 sheets first" | | | x | yes |
| U13 PDFs assignable to the building | | | | no (the reviewer found "Not placed" reachable, a related but different state) |
| U14 "Open" looks the same after opening | | | | no |
| U15 Dead "Open" badge | | x | x | yes |
| U16 PDF names in the tree | | | | dropped by decision |
| U17 Silent skip of a PDF on another level | | | | no (the agents found "Add folder does nothing", a different problem) |
| U18 Test-only fix | | | | process rule, not testable by replay |
| U19 "Save it to link it" | x | x | x | yes |

**Result: 12 of 19 found by the agents, 13 with U9.** The target was 12 or more, so no second round was needed. Of the 19 items, 3 cannot be tested by a replay (U16 dropped, U18 a process rule, U4 not reproducible at this commit). Of the 16 items that could be tested, the agents found 13.

Misses and what I did about them:
- **U13, U14, U17** were missed by all three agents. They are states that need a precise action (an action on the wrong selection kind, the "already done" state of a button, a skipped item in a batch add). The audits name them (invalid-state, feedback). The agents found other problems first. I did not change the agents: a second round on a single example would fit the agents to this dialog.
- **U4** the list-stability check ran and passed at this commit.

Beyond the 19: the replay found other real problems in this dialog (`Add folder…` does nothing on web, the typed level name was lost at 760 px, the web switch between buildings fails with "not found"). Several of them are not on the user's list, so the framework finds more than the user did in the same stage.

### Limits of this replay

- One run, one task, one commit. A count of 12 or 13 has wide error bars.
- **The test is not fully blind.** I wrote the 6 journey goals and the brief of the `ui-reviewer` after I had read the 19 items. The goals (rename a building, open three PDFs in a row, add two PDFs to one level) and the list of cases in the review brief (a delete of a level that holds sheets, an export of an unsaved PDF) match user findings. A real run gets its goals from the UX spec. So the count is an upper estimate for the goal-driven items (U3, U6, U10, U12).
- The `journey-tester` ran G1 to G5 at 1600 px only. It ran 1100 and 760 px for G6 and one narrow G1. The role file says to run every journey at 3 widths. The `ux-lessons.md` and `ux-checklists.md` give it no cost limit. I did not change this.
- Not tested: the real file picker, Tauri, Windows scaling. The agents list these as platform steps.
- The new `task-lead` flow, the director skill and the wireframe approval were not run end to end. Only the three agents were tested.
- `run-checks.mjs` and `mirror-batch.mjs`: `mirror-batch.mjs` ran on the real ledger (9 events written to a test file). `run-checks.mjs` and `layout-measure.mjs` passed `node --check` (syntax) only. `layout-measure.mjs` functions ran inside the replay by the `ui-reviewer` (it reported row edge spreads of 19 px and clipped controls), so that file works. `run-checks.mjs` was not run on a real list.
