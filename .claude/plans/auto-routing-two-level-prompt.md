# Prompt: two-level auto-route (main run first, then room runs)

Start a new session in the worktree `/root/MepApp/.claude/worktrees/routing-feedback` (branch `worktree-routing-feedback`). Do not work in the main checkout. Never push to master. Push the branch only. The user tests on Windows and merges.

Write all prose for the user in Simplified Technical English (short sentences, active voice, one term per concept, define new terms). The product UI is English only.

## Why this session exists

The user tested the auto-route again (after P1-T27) and says the result is still poor: far too many corners and segments in odd places. The earlier work (P1 "Branch per room", option `roomBranches` in `packages/core/src/route-*.ts`) patched the old planner step by step. Each patch moved one defect and created another. The user asks for a different structure.

## What the user wants (their words, summarised)

The planner works in three steps:

1. **Main run.** First decide the main route through the corridors. It starts at the equipment. It runs in straight segments as much as possible through the corridors of the floor plan. No branches to rooms yet.
2. **Room runs.** Then look at each room on its own. Decide where the main branch enters that room. Then place the branching segments from that main branch to the terminals in that room.
3. **Combine.** Join the main run and the room runs. Project the main branch of each room run onto the main run in the corridor (the room branch ends on the main run with a tee).

## Reference files (read these first, look at them as images)

In `fixtures/pdfs/` of the worktree:

- `00_arch_ground_floor_w_rooms.pdf` — the floor plan with the rooms (embedded project JSON `mepapp-project.json`).
- `00_arch_ground_floor_w_rooms_route.pdf` — the route the current auto-route makes (the bad result).
- `00_arch_ground_floor_w_rooms_route_manual.pdf` — the same terminals with a route the user placed by hand. **Blue line = main run through the corridors. Red lines = the room segments that connect into the main run.** This is the target. Measure it: how many corners, how long, where the room branches meet the main run, how the main branch of a room enters (door position), how 4-terminal rooms are fed.
- `00_arch_ground_floor_w_rooms_route_2.png` — earlier user notes on defects D-1..D-8 (see `.claude/plans/route-layout-presets.md`).

Render the PDFs to PNG (mupdf through `packages/pdf-engine-mupdf`, or the helpers under `.claude/roadmap/browser/`). Extract the segments of the manual route from the PDF (they are vector or embedded project data) and compare them with the auto route. Show the user a side-by-side picture on the dashboard.

## State of the code (do not re-derive)

- Planner: `packages/core/src/route-build.ts` (`planRoute`), `route-layout.ts` (`RouteLayoutOptions`), `route-topology.ts`, `route-hanan.ts`, `route-area.ts`, `route-metrics.ts`. Room feed (option `roomBranches`): `route-room-entry.ts`, `route-room-feed.ts`, `route-room-reach.ts`, `route-feeds.ts`, `route-plan-warnings.ts`.
- Gate test: `packages/core/src/route-room-branch-report.test.ts` (run with `MEPAPP_G0_ASSERT=1`). Fixtures: first floor (committed), local git-ignored `packages/core/fixtures/route-area/local/ground-floor-w-rooms-2.json` (51 rooms, 3 corridors). Never commit local fixtures or PDFs that git ignores.
- Default output must stay byte-equal when an option is absent. Hash prefixes are in the ledger and in the P1 plan (task T27 and earlier).
- Last results (option on, scenario B, w_rooms-2): rooms with several entries 16 → 1, chained rooms 12 → 7, bends outside the rooms 18 → 2, but bends inside rooms 49 → 70 (Balanced 49). `fewRoomBends` sub-option lowers it to 52. Time is now under 600 ms.
- The framework: ledger `.claude/roadmap/ledger.jsonl`, dashboard https://claude.ai/artifact/NJPff8DSmntqHwYHm8ZtYh, roles in `.claude/agents/`, skill `/roadmap-director`. Read `.claude/roadmap/protocol.md` and `rules.md`.

## Open decisions on the dashboard (still unanswered)

Q-P1-15 (slide the wall hole along the shared wall), Q-P1-16 (chain depth), Q-U1-09 (click-through while the Route dialog is open). Ask the user again only if the new design needs them.

## How to proceed (suggested)

1. Act as director (`/roadmap-director`). Do not code first.
2. Analyse the manual route against the auto route (agent: researcher or a diagnosis task). Write down the rules the user's hand route follows: main run shape, door choice, room main branch direction, tee points. Check each rule against `rules.md` section 3 (domain rules).
3. Write a short plan (new part id, e.g. `P2`) for a new planner mode: `mainRun` → `roomRuns` → `combine`. Decide which old modules to reuse (corridor graph, room entries, spine) and which to drop. Keep it behind an option; default output stays equal.
4. Put the design questions on the dashboard before coding. Ask on anything about the data model or file format.
5. Add a metric and a test that compare the new route with the manual route (corner count, length, tee points on the main run), not only the old G0 criteria.
6. Run it in tasks with the task-lead role. Upload pictures of each result on the real PDF to the dashboard.

## Standing rules

One command per Bash call, no chaining, no heredocs. Never `pkill -f vite`. No `pnpm add`. Never run prettier. Evidence before claims: rerun the proving command before writing "done". Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
