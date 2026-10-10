# One Auto-place stamps dialog — assessment and plan

Status: **proposal, waiting for the user's choice of direction (2026-10-10). No code changed.** Branch `worktree-auto-place-dialog`, made from `worktree-room-placement-guide` (2119ccb). This is a UI change. The core logic (`packages/core/src/rooms/*`) stays as it is.

Mockup of the recommended layout (C): artifact https://claude.ai/artifact/E7Zng1kM3dbN38KdLUqsyU, copy in `.claude/plans/auto-place-dialog-mockup/mockup-v1.html`.

## 1. Assessment of the current UI

Browser check: Playwright, `01_arch_first_floor.pdf`, scale 1:50, Detect rooms (38 rooms, 8 without a type), the 5 example rules. Screenshots are in the session scratchpad only (not kept).

### 1.1 Entry points

| Menu item | Dialog | What it edits | Stored in |
|---|---|---|---|
| Room types… | `RoomTypesDialog.tsx` | type list, name, Dutch name, keywords, area per person, 10 demand boxes, Match rooms again, Import, Export | user library (`mepapp.roomTypes.v1`) |
| Ceiling heights… | `CeilingHeightsDialog.tsx` | height of the drawing, one box for each of the 20 types | drawing |
| Placement rules… | `PlacementRulesDialog.tsx` | rule list, summary, Edit in the guide…, Duplicate, Delete, Import, Export | user library (`mepapp.placementRules.v1`) |
| (from Placement rules) | `PlacementRuleGuide.tsx` | one rule in 6 steps, live sample room, Place for that rule | rule draft, Save |
| Auto-place stamps… | `AutoPlaceDialog.tsx` | scope, rule checkboxes, 12-column table, Preview, Place, Remove | — |

Other places that edit the same data: Settings › Rooms (global ceiling height), Room Properties (type, height and persons of one room), guide step 2 (type of an untyped room), guide step 3 (area per person of a type).

### 1.2 How the dialogs send the user around

- Auto-place › "Placement rules…" closes Auto-place and opens Placement rules. Close in Placement rules closes all. The user must open Auto-place again from the menu. (Checked: 0 dialogs open after the close.)
- Placement rules › "Edit in the guide…" replaces the rules dialog with the guide. Close in the guide goes back to the rules list, not to Auto-place.
- The guide has its own Place button for one rule. Auto-place has a Place button for all rules. The two tables have almost the same columns.
- Hints send the user to the menu: "Menu › Room types", "Menu › Ceiling heights" (Room Properties, Settings, guide step 3).
- No dialog opens Room types or Ceiling heights. The user must close the current dialog and use the menu.

### 1.3 Problems for a new user who wants stamps in all rooms

1. **No order.** Four menu items in a row, with no sign of which comes first. The natural order is: scale and rooms → room types → heights → rules → place. The menu shows types, heights, rules, place, but nothing says that the first three are input for the last one.
2. **Missing data shows late.** Auto-place shows "the rule has no stamp" in 78 table rows, not once at the top. All 5 example rules have no stamp, so the first Auto-place run gives "Place 0 stamps" and a long table of the same note. Persons that are missing ("no number of people") show the same way.
3. **The entry point for the main job is the weakest dialog.** Auto-place is a 12-column table with 1950 words for 38 rooms. The guide, which the user finds the most intuitive, is two dialogs away from it.
4. **Duplicate controls.** Room type of a room: Room Properties and guide step 2. Area per person: Room types and guide step 3. Place: guide step 6 and Auto-place. Rule summary: Placement rules and the guide's left list.
5. **Too much text.** Auto-place hint: 68 words before the controls. Guide step 2: 349 hint words (the untyped-room callout plus notes). Room types form: 83 hint words. Ceiling heights: 20 boxes for types that the drawing mostly does not use (only 8 of 20 types have rooms).
6. **Confusing numbers.** The Room types list shows the number of keywords next to each type (Office 8). Ceiling heights shows the number of rooms (Office 15 rooms). The same place in the two lists means two different things.
7. **Scope that does nothing.** Auto-place offers "All rooms of this drawing", but only rooms on the shown page get stamps. Rows of other pages show "on another page".
8. **No status at a glance.** The guide has a good status per step (✓, !, ×). The other dialogs have no status. The user cannot see which rule is ready.
9. **Without a drawing** Auto-place opens with an empty table and "Place 0 stamps". It does not say what to do first. Detect rooms without a scale shows a toast only ("Calibrate the drawing first").

What works well and must stay: the guide's three columns (steps, card, live plan), the step status, the live sample room and whole-floor view, "Why N stamps?", the per-room checks in step 4, the Web Worker plans, re-run with moved stamps, one undo step for Place.

## 2. Layouts for the new main dialog

All three layouts: one menu item (Auto-place stamps…). Room types and ceiling heights are inside the dialog. The guide edits a rule inside the same dialog, not in a second one. Place all is one button.

### Layout A — Setup wizard

Fixed steps: 1 Drawing and rooms, 2 Room types, 3 Ceiling heights, 4 Rules, 5 Place all. Step 4 lists the rules; "Edit" opens the guide's six steps in place of the wizard (a second level of steps).
- Missing data: a step with a problem gets ! or ×. Next is possible, Place all is disabled with the reason.
- Good: the order is clear for a new user.
- Bad: two levels of steps (wizard steps and guide steps) look the same. An expert who only wants to place again must walk past the input steps. The rules are one step of five, so the guide is not the center.

### Layout B — Rule board with a status strip

Top strip with three status chips: Drawing (1:50, 38 rooms), Room types (8 without a type), Heights (2700 mm). A chip opens its editor as a panel that slides over the board. Below: rule cards (checkbox, stamp icon, count, status), a floor plan with all stamps, and Place all. Edit on a card replaces the board with the guide; "Back to all rules" returns.
- Missing data: a red chip, and a callout above the cards. No rules: example cards.
- Good: quick for re-runs; all rules visible.
- Bad: the input editors are hidden in panels; the board and the guide are two different screens with two layouts; most work moves between them.

### Layout C — The guide frame for everything (recommended)

The whole dialog uses the guide's three columns. The left column is one list:
- **Input data:** Drawing and rooms, Room types, Ceiling heights. Each item has a status icon and one line (for example "8 rooms without a type").
- **Placement rules:** one item per rule with a checkbox (use in Place all), a color dot, a status icon and one line ("249 stamps", "No stamp"). "+ New" at the top. The open rule unfolds into its six guide steps, each with its status.
- **Place all:** at the bottom, with the total count.

The middle column is the card of the chosen item: an input editor, a guide step, or the Place all table (one row per rule, room rows on request). The right column is always the floor plan, colored for the card: room types, height levels, the stamps of one rule, or the stamps of all checked rules.

- Missing data (see the mockup's start states):
  - No scale or no rooms: "Drawing and rooms" is red; its card has the scale select, Calibrate… (hides the dialog until two points are clicked, like the preview bar) and Detect rooms. The plan shows "No scale". Place all says "Set the scale first" with a button to the card.
  - Room without a type: Room types is orange ("8 rooms without a type"). Its card lists those rooms with a type select and Match rooms again. Guide step 2 and Place all show one line with a button to this card, not a second list.
  - No rules: the Rules section is empty; Place all shows "There are no placement rules" with "Add the example rules", "+ New rule" and Import….
  - Rule without a stamp: the rule is red ("No stamp"); Place all skips it and shows one line "1 rule without a stamp: Place all skips it" with "Choose a stamp" (opens step 1).
  - Persons missing: the rule is orange; step 3 links to the room type library.
- Opening: the dialog opens on the first red input item; else on Place all.
- Good: one layout for all work; the guide is the center (each rule is the guide); the status of every input and rule is always visible; the plan always shows the effect.
- Bad: the left list gets long with many rules (needs scroll, and only the open rule unfolds); the dialog stays large (the guide is already 1404 × 964 px at 1600 × 1000).

**Recommendation: Layout C.** It keeps the dialog that the user likes and puts everything else into its frame. It needs no new visual language. A and B both need two layouts that the user must learn.

## 3. Decisions for the user (before Phase 1)

1. Global default ceiling height: edit it also in the Ceiling heights card (mockup), or only in Settings (the card shows it read-only)?
2. Rule checkboxes (use in Place all): remember them per user, or check all rules each time the dialog opens?
3. Unsaved rule edits when the user leaves a rule: ask inline (mockup: Save and go on / Discard / Stay), or save at once?
4. Keep "Place only this rule" in step 6?

## 4. Phases

Each phase ends with `pnpm build`, `pnpm typecheck`, the ui/core tests, and a browser check through real DOM inputs on `01_arch_first_floor.pdf` at 1:50 ([[verify-ui-wiring-via-real-dom-not-scene-api]]). Rebuild the ui package before a browser check (apps/web uses `@mepapp/ui` `dist`). No `window.confirm` in the ui package. No core change unless a phase says so.

1. **Guide body without its own dialog.** Split `PlacementRuleGuide.tsx` into a body (step card + side panel) and the step list. The body takes `step` / `onStepChange` from its parent and gives the step status to the parent (for the left list). Save and Revert move into a bar at the top of the card. Keep `placementRuleDraft.ts`, `RulePreviewPlan.tsx`, the worker clients and step 6 as they are. For this phase, `PlacementRulesDialog` hosts the body, so nothing changes for the user yet. Check: the guide's browser checks of Phases B–F still pass.
2. **The new Auto-place frame.** New `AutoPlaceDialog.tsx`: left list (Input data placeholders, rules with checkbox and status, Place all), middle card, right `RulePreviewPlan` in floor mode. A rule item opens the guide body from Phase 1. The Place all card: one row per checked rule (rooms, stamps, state), the room rows of today's table behind a disclosure, Preview, Place N stamps, Remove auto-placed stamps. The Place all plan moves to a `PlacementPlanClient` (Web Worker), the same as the guide; today it runs on the main thread (about 1 s for 5 rules). Scope: "Rooms on this page" and "Selected rooms" only. Rule status comes from the plan rows (no stamp, no room matches, rooms without persons, too many stamps).
3. **Input data cards.** Drawing and rooms: scale select, Calibrate… (the dialog hides until the calibration ends), Detect rooms (the existing handler), the page note. Room types: tab "Rooms on this page" (rooms without a type first, a type select per room through `scene.setRoomType`, Match rooms again) and tab "Room type library" (the form of `RoomTypesDialog` as a component, with Import and Export). Ceiling heights: the chain global → drawing → types on this page → one room; "Show all room types". The plan colors rooms by type or by height level (new `RulePreviewPlan` fill modes). Guide step 2 replaces its untyped-room list with one line and a button to the Room types card.
4. **One menu item and clean-up.** Remove Menu › Room types…, Ceiling heights… and Placement rules…. Move + New, Duplicate, Delete (inline confirm), Import… and Export… of rules into the Rules section. Delete `PlacementRulesDialog.tsx`, and keep only the parts of `RoomTypesDialog.tsx` and `CeilingHeightsDialog.tsx` that the cards use. Change the "Menu › Room types / Ceiling heights" hints in `RoomProperties.tsx`, `SettingsDialog.tsx` and the guide. Open on the first red input item, else on Place all. The inline prompt for unsaved rule edits (decision 3).
5. **Text and finish.** Shorten the hint texts (STE, one sentence where possible; the long texts go into the existing InfoTips). Narrow window (1024 × 700) and dark mode. A full browser check: no drawing → open → scale → detect → type 8 rooms → rule stamp → Place all → Undo → re-run with a moved stamp.

## 5. Risks

- `PlacementRuleGuide.tsx` is 1971 lines. The split in Phase 1 touches its state (draft, step, three worker clients). Do the split with no behavior change and run the old browser checks first.
- Two worker clients (the open rule and Place all) can run at the same time. Keep one client per plan type and cancel a stale job, as the guide does now.
- The Place all plan with many rules on a large floor: measure it in Phase 2 (the lighting capacity trap gave 8259 stamps once; the 1000-stamp limit per room stays).
- Stamps still have no page, so Place all works on the shown page only. The plan does not change that.
