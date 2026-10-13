# Prompt: room types carry the demand calculations

Written 2026-10-13, after the user saw mockup v2 of `amount-step-clarity.md`. Start a new session with:

> Read `.claude/plans/room-type-calculations-prompt.md` on branch `worktree-amount-section-clarity` and do it.

---

## The idea (the user, 2026-10-13)

> "We need to change the structure of how automated placement of stamps is decided. We are trying to fit too much information in the dialog at once. Instead we should move more data to the room types so we can make this 'amount' dialog a lot simpler. [...] Room types have demands and at the moment that is all they have, but every demand can already be associated with a calculation. If we organize it in that way then we only need the room's area to retrieve the total amount. So choosing a calculation happens when assigning room types."

The reading of the last session (confirm it with the user at the stop point):

- A room type holds its demands. Each demand has a **need** (Supply air, Light, Sockets, Heating, a need of the user), a **calculation** (per person, per m², "1 per N m²", per room, air changes, illuminance) and its **numbers**.
- The user chooses the calculation when they set up the room type. A room gets the calculations when it gets its room type (keyword match or the user's pick).
- The room gives its area. The persons (area ÷ area per person, or the room's own number), the volume (area × ceiling height) and the perimeter come from the area, the room type and the height chain (`computeRoomValues`). With these, the room type gives the **total need of the room**, in one unit.
- The placement rule keeps only the product side: the stamp, the need that it serves, what one stamp gives (the capacity; the user said on 2026-10-12 that the capacity stays in the rule), limits, coverage and layout.
- Step 3 "Amount" becomes small: the need, "One stamp gives [ ]", and a table of the stamps per room.

Why this fits the code (found by the last session):

- Each field in `ROOM_DEMAND_FIELDS` is already one need × one calculation (`supplyPerPersonDm3s` = supply air × per person). But the rule also chooses a formula and links each term to a field (`amount.from`). This double definition makes most of the fields in step 3, and it causes a bug (below).
- Room types use different calculations for the same need. `room-demands-research.md` §8: Office sockets 4 per person, Meeting room 6 per room, Corridor 1 per 15 m. Today one formula in the rule must serve all of them.
- `room-demands-research.md` §1.4 and §8 already split the inputs: the room type holds what the room needs, the rule holds the product (lumen per luminaire, UF, MF, reach), the room holds the geometry. The new idea moves the calculation to the room-type side of that split.

## What exists now (read these first)

Core (`packages/core/src/rooms/`):
- `placement-rule.ts`: `PlacementAmount` (terms `fixed`, `perM2`, `perPerson`, `perM3`, `minimum`, `unit`, `from`), `LightingInputs` (lux, UF, UF table, MF), `CoverageLimits`, `capacityOf`, `calculateRoomRequirement` (about line 407), `validatePlacementRule`, `toPlacementRule` / `parsePlacementRules` (migration of old rules), `PLACEMENT_RULE_EXAMPLES`.
- `room-type.ts`: `RoomDemandKey`, `ROOM_DEMAND_FIELDS`, `ROOM_TYPE_DEMAND_EXAMPLES`, `RoomType`, `validateRoomTypeFields`, `parseRoomTypes`.
- `room-values.ts`: `computeRoomValues` (area, volume, perimeter, persons, ceiling height, a copy of the room-type demands).
- `placement-units.ts` (units, `STAMP_COUNT_UNIT`), `placement-layout.ts` (coverage can raise the count), `placement-worker.ts`.
- `../project.ts`: `CURRENT_SCHEMA_VERSION = 16`. The project keeps a copy of the room types that it uses.

UI (`packages/ui/src/`):
- `components/RoomTypeLibrary.tsx` (the Room types card, `DEMAND_GROUPS`, "Demands for rules"), `components/AutoPlaceInputCards.tsx` (the Room types input of Auto-place), `components/RoomProperties.tsx`.
- `components/PlacementRuleGuide.tsx` (`stepRooms`, `stepAmount` at about lines 740–925, `WhyBox`), `components/placementRuleDraft.ts` (`presetPatch`, `ruleOf`), `components/AutoPlaceDialog.tsx`.
- `roomTypeStorage.ts` (`mepapp.roomTypes.v1`), `placementRuleStorage.ts` (`mepapp.placementRules.v1`).

Plans (`.claude/plans/`):
- `amount-step-clarity.md`: §1–4 assess today's step 3. §8 holds the concept "need ÷ capacity", the terms, the needs table and the user's answers.
- `amount-step-mockup/mockup-v2.html` (artifact https://claude.ai/artifact/JX4GdVfea9witVLRHzYUiY): the "Room types card" view groups the demand fields by need. The "Stamps per room" table and the "Why N stamps?" chain are worth reusing.
- `room-demands-research.md`: values per room type (§8), the split of inputs (§1.4, §2.6, §5.4), the calculation methods (§9).

## Keep from the last session

- The user's answers (2026-10-12): users think "one per 5 m²", not "0.2 per m²". The capacity stays in the rule. Users want to define their own needs.
- The count: `N = max(ceil(need ÷ capacity), coverage count, min count)`, at most the max count.
- The bug: a rule with two room-type terms (`socketsPerPerson` + `socketsFixed`) gives `count: null` and the warning `noDemand` for a room type that has only `socketsPerPerson` (checked with the built core). A calculation on the room type removes the cause.
- The capacity suggestion from the stamp name: "Double" = 2, "Triple" = 3, "Quadruple" = 4.

These parts of `amount-step-clarity.md` §8 do not apply any more: the need block in step 3 (the room-type table plus the own numbers), layouts 1 and 2 of mockup v2, and the phases of §8.6.

## Task

1. **Branch.** Make a new worktree branch from `origin/worktree-amount-section-clarity`. That branch has only plan files more than `origin/master` 4c31201 (check with `git diff --stat origin/master...origin/worktree-amount-section-clarity`). If `origin/master` has newer commits, merge it into your branch first.
2. **Assess.** Map the data flow today: room → room type → `computeRoomValues` → rule terms and `amount.from` → `calculateRoomRequirement` → count → coverage → layout. List each place that reads the amount terms, `amount.from`, `lighting`, `RoomType.demands` or `ROOM_DEMAND_FIELDS`. List what goes away from the rule and from step 3.
3. **Propose the data model.** Write the new types in TypeScript: the need, the calculation of a demand, the demand on a room type, the rule fields that stay. Give the migration of: the room types in the user library, the room types in the project copy (schema 17), the rules in the user library, and the example sets.
4. **Answer the open questions below.** Give one recommendation for each, with the reason.
5. **Mockup.** Make an HTML mockup in `.claude/plans/room-type-calculations-mockup/`:
   - 2 or 3 layouts of the Room types card with demands and calculations. This card now holds most of the setup, so it needs the most care. Ideas, not decisions: a list of demands per room type, or a table of room types × needs with one cell per demand ("6.5 dm³/s per person").
   - The simple step 3: the need, "One stamp gives", the stamps per room, and a room type without the need.
   - The "Why N stamps?" chain: room type → calculation → need → ÷ one stamp → N.
   - Use the 4 sample rooms of mockup v2 (1.20 Office 31.4 m², 3 persons; 1.05 Meeting room 18 m², 9 persons; 1.01A Corridor 23.7 m², no persons; 1.12 Toilet 3.2 m², no persons; height 2.7 m) and the values of `room-demands-research.md` §8.
   - Check the mockup in Playwright (real typing, 400 px width, dark theme, no page errors). Publish it as an artifact.
6. **Plan.** Write `.claude/plans/room-type-calculations.md` (assessment, model, answers, mockup link, draft phases). Commit it and push the branch.
7. **Stop.** Ask the user to accept the reading of the idea, the model and a layout of the Room types card. Do not change product code before the user answers.
8. After the answer: finish the phases in the plan and do them one by one. Each phase ends with the core tests and a browser check through real DOM inputs. Rebuild `@mepapp/ui` before each browser check. Mark each phase done in the plan with its commit hash.

## Open questions

1. **Calculations per need.** Which calculations does each built-in need offer? Does one demand have one term, or two terms plus a minimum (EN 16798-1 adds per person and per m²; today the rule adds the terms, then applies "at least")? Does a need ever take the larger of two calculations instead of the sum?
2. **"1 per N m²".** How does a count need ("Sockets", "Smoke detectors") show and store "1 per 5 m²"? The model can still store a number per m².
3. **Lighting.** The room type holds Em (lx) and the working-plane height. UF and MF depend on the luminaire, so the research puts them in the rule. Option: need = Em × A (lm on the working plane), capacity = Φ × UF × MF (useful lm of one luminaire, with UF from the room index). The math stays the same as today.
4. **No demand.** What happens to a room without a room type, or with a room type that has no demand for the need? Options: no stamps, with a clear row in the table and a link to the room type; a default room type; an override per room (an open gap since Phase F); own numbers in the rule as today.
5. **Rooms of a rule.** Does a rule apply by default to all rooms whose type has the need? Step 2 then becomes a filter. A filter stays necessary when two rules serve the same need with different stamps (office luminaire, corridor downlight).
6. **Two rules for one need in one room** (supply grilles and a diffuser). Does each rule serve the full need? Is a split in scope?
7. **Coverage needs** (detectors, sprinklers, sounders). The count comes from the room shape and the reach, not from a total. Does the room type hold "needs smoke detection" or a class (research §5.4), and does the rule hold the reach?
8. **A number per room** ("1 thermostat per room"): a demand on the room type, or an option in the rule?
9. **Own needs.** Where does the user add a need (name, unit, calculations)? In the Room types card? How are needs stored (a user library like `mepapp.roomNeeds.v1`, or inside the room types)? What happens when a rule uses a need that is deleted?
10. **Library and project copy.** The project keeps a copy of the room types that it uses. What happens to an open project when the user changes a calculation in the library? Check the current behavior first.
11. **Migration of old rules.** Old rules hold a formula, own numbers and `amount.from` links. Which old rules map to "need + capacity" without loss? What does the session do with own numbers that no room type holds (for example, give them to the room types of the rule, or keep an old-rule mode)?
12. **Where the user chooses.** The last session reads "choosing a calculation happens when assigning room types" as: the choice is made in the room type (library card and Auto-place input card), and a room gets it with its room type. Confirm this. Is a choice per room needed too?

## Rules

- Classify first. For a question, answer and change nothing.
- Work on your branch. Never push to master. Push the branch only.
- Write user prose in STE (ASD-STE100 style).
- Do not change the model without a reason. This task changes it, so give the reason for each change in the plan.
- Evidence before claims: run the command and read its output before you say "done" or "passing".
- Scope lock: no changes outside the task. Mention other problems instead.
- No `pnpm add`. No `window.confirm` in the ui package. Never run prettier.
- Stop servers with TaskStop, never `pkill -f vite`.
- No chained or heredoc Bash commands: write scripts to the scratchpad and run them.
- Commit the plan files to git.
