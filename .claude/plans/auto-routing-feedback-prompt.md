# Prompt: plan the follow-up work after the user test of R1-R6

Use this prompt in a new session. Work in a new worktree off branch `worktree-agent-framework`
(it holds R1-R6, last pushed commit 3bd5115). Do not push to master.
Write all prose for the user in simple technical English (short sentences, one term per concept).
The whole UI must be English. Do not start the code work. First write plans and questions.

## Background

The user tested R1-R6 on Windows and gave five comments:

1. Merge the new menu entries into ONE new entry on the left rail, under the "Rooms" button.
2. The auto-routes are not good enough from an engineering view. Research better pathfinding,
   layout and topology algorithms.
3. Offer a few preloaded route layouts (presets) with a preview before the user places the route,
   like Revit "Generate Layout".
4. The new dialogs have too much text. Use icons with tooltips where possible.
5. Part of the dialogs shows Dutch. The whole UI must be English.

An investigation (2026-10-20) already produced these findings. Verify them before you rely on them.

## Findings: UI (comments 1, 4, 5)

Menu entries added by the roadmap (packages/ui/src/components/MenuButton.tsx):
"Route network..." (:165-175), "Size network..." (:176-186), "Show/Hide route area" (:187-197).
Auto-place (:155-164) existed before. "Make circuits" has no UI yet.
There is no menu entry for Room types (it lives inside the Auto-place dialog) or the Network type editor
(opened from the Size dialog).

Left rail: `Rail.tsx` plus the data list `RAIL_ROWS` in `packages/ui/src/toolRegistry.ts`
("Rooms" row at :85-90, Circuits row at :91-96). The flyout is built for tools (setTool), not dialogs.
Icons: custom inline SVG in `packages/ui/src/icons.tsx`, no icon package. Tooltips: native `title`
and the `InfoTip` component. Rail CSS: theme.css:386-490.

Recommended design: a new `routing` row after the Rooms row. The main button opens an icon-only
flyout with actions (Auto-place, Route, Size, Route area on/off, Make circuits as "coming soon").
Add an optional `action` field to the tool entry. Remove the four entries from MenuButton and App.tsx.
Add a shared `IconButton` component (icon, label, title, aria-label). Size M.

Dutch cause: one saved setting `labelLanguage` ('en'|'nl', App.tsx:163, :372-374) is passed as
`language` into RouteDialog and AutoPlaceDialog. `routePlan.ts` has a full Dutch table (:171-243), so a
stored NL value gives a mixed-language dialog. RouteBuildSection and SizeDialog are English only.
Fix: delete the Dutch table and the `language` parameter (routePlan.ts, route-input.ts,
RouteDialog, RouteAreaSection, App.tsx), use 'en' for room type and stamp names, and update tests.
Also: remove the "Dutch name" field in RoomTypeLibrary.tsx and decide on the `nameNl` data
(room-type.ts:161-180, room-need.ts:26-31). Keep the Dutch matching keywords (they match room
names in Dutch drawings).

Most text-heavy blocks: route summary lines (routePlan.ts:411-474), room type keywords hint
(RoomTypeLibrary.tsx:675), Size notes block (SizeDialog.tsx:261-269), `disciplineNotSized`
(sizePlan.ts:25), the fire wall hint (repeated), Auto-place cards. Proposal: field labels, scope radios,
checkboxes and buttons become icon + tooltip. Severity prefixes become coloured icons. Long hints move
to InfoTip. Keep errors, one summary line and results as visible text.

Task list: (1) remove the Dutch path in Route [M]; (2) dialogs ignore label language [S];
(3) remove "Dutch name" field and decide on nameNl [S]; (4) Routing rail entry [M];
(5) new icons and IconButton [M]; (6) remove menu entries [S]; (7) cut text in Route dialog [L];
(8) cut text in Size dialog and Network type editor [M]; (9) cut text in Auto-place and Room types [L];
(10) update tests and browser checks [S-M]. Order: 1-3, then 4-6, then 7-9.

Open questions for the user: keep the EN/NL stamp-label toggle for the stamp picker?
Should Auto-place move into the Routing entry? Entry directly after Rooms?

## Findings: algorithms (comment 2)

Current planner (packages/core/src/route-*.ts): trunk by Takahashi-Matsuyama Steiner tree on a corridor
graph with length-only cost; room paths on a Hanan grid (bend penalty 500, crossing penalty 1000);
off-graph rooms get a fixed L-shaped elbow from the nearest built point; rooms are routed one by one in
id order with no refinement. Planning takes about 150 ms on the first floor.

Ranked ideas (sources in the research report; licence statements from snippets are unverified):
1. A bend-, fitting- and wall-crossing-aware search on (node, heading) states for the trunk and the
   off-graph links [S-M, biggest visible gain, no new library].
2. Exact small-net Steiner paths in rooms (Dreyfus-Wagner on the Hanan grid, ports are leaves)
   plus a bend-merging pass [S-M].
3. A scoring module (length, bends, fittings, wall crossings, crossings, balance) plus 2-3 candidate
   layouts [M]; this is the base for presets.
4. Deterministic rip-up and reroute (PathFinder style) for crossings [M].
5. Exact region tests with polygon offsetting and a graph from wall corners instead of the raster
   skeleton, then centre parallel runs [M-L].
Not now: straight skeleton (not an engineer's trunk line, CGAL part is GPL), libavoid (LGPL, WASM,
box obstacles), annealing (later polish).
Revit "Generate Layout" has three topologies (Network, Perimeter, Intersection), not an optimiser.
Start with a metrics script and a baseline table on the first floor (and 10A, local only):
length by part, bends (90/45), fittings, wall crossings, crossings, free legs, corridor use,
longest path and spread, runtime, determinism. Ask the user for 2-3 screenshots of runs they dislike.
Known count to reconcile: first floor off-graph rooms are 15 of 33 in the R4 data and 28 of 33 in the
R6 test (different definition). Find out which one the user sees.

## Findings: presets (comment 3)

Feasible. No schema change: a preset is a dialog choice that produces normal segments.
`planRoute(core/route-build.ts:193)` has no options object today. Add `RouteLayoutOptions`
(bendPenaltyMm, crossingPenaltyMm, orthogonalOnly, jogSmallJumpMm, entryRule, offGraphAxis) with
defaults equal to today, so the output stays identical. `scene.setRoutePreview` already takes any plan.
Risk: on a tree-shaped corridor graph the trunk is nearly unique, so presets may give the same plan.
Hide or mark duplicates (signature of rounded geometry). Compute the default preset first, the others one
per macrotask, and cache by request key + preset id. A worker is not needed at 150 ms per plan.
Start presets: Balanced (today), Shortest run, Fewest bends (90 degrees only), Avoid clashes;
Home run later [L]. Metrics in the dialog: length, segments, fittings, 90/45 bends, wall crossings,
existing crossings, free legs, ports left, warnings. Estimated friction only as a second step (the code
has no fitting loss coefficients).
Tasks T1-T13 (options type, penalty plumbing, orthogonal-only mode, entry rule, off-graph axis, preset
table + signature, scene API, dialog states and chips, chip component with thumbnail, ghosts, timing test,
friction estimate, home run). Do T11 (timing) and a quick comparison of T2-T4 outputs on the real
floors BEFORE building the UI.
Questions for the user: Is "Fewest bends" = 90 degrees only a hard rule? May plans with warnings be
placed? Hide identical plans or label them? Ghosts of other candidates on the plan? Remember the last
preset (per document, per network type, per browser)? Which discipline first (duct, pipe, cable tray)?

## What to do

1. Verify the findings above against the code (read-only agents).
2. Write three plans in `.claude/plans/`: `ui-cleanup-rail-i18n.md` (comments 1, 4, 5),
   `route-quality-research.md` (comment 2: metrics, baseline, prototypes), `route-layout-presets.md`
   (comment 3). Use the format of `auto-routing-r6.md` (tasks, tests, browser checks, screenshots,
   risks, open questions with options A/B/C and a recommendation). Copy each to the hub Specs folder
   with cp and check with cmp. Commit the plans.
3. Put the open questions on the road map dashboard
   (https://claude.ai/artifact/NJPff8DSmntqHwYHm8ZtYh) and ask the user to answer them.
4. Do the Dutch removal (task 1-3) first only if the user agrees; it is small and low risk.

Do not touch the R7 work in progress (uncommitted files circuit-plan.ts, RoomScopeList.tsx and edits in
RouteDialog.tsx exist in the worktree `agent-framework`, not on the branch). R7 resumes later.
