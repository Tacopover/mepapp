# Room type calculations — small fixes for later

Status: **open, not started (2026-10-14).** The user asked to write these down and to fix them later. They come from review round 1 of [[room-type-calculations]] (§10): the two review agents found them, and they were not on the list of the user. None of them blocks the Windows test. Most need a crafted or imported file. Branch of the code: `worktree-room-type-calculations` (line numbers at 7d14a87).

## 1. Parse and validate edge cases (core)

1. **An own need keeps terms that do not fit its kind.** `parseRoomDemands` / `toRoomDemand` (`packages/core/src/rooms/room-type.ts:312`) keeps for example a `volume` or `every` term on an own flow need. `demandTotal` then gives `notFit`, and the user cannot save the room type until the term goes. Fix: drop the terms that `BASES_OF_KIND` and `kindHasEvery` do not allow, when the need is known at parse time (or at the load of the library, with the own needs).
2. **A Light rule without `luminaire` is valid.** `validatePlacementRule` (`placement-rule.ts:387`) accepts it, and it gives 1 stamp per room with no warning. Fix: refuse a need rule for a light need without a luminaire ("Enter the utilisation factor and the maintenance factor."). The guide already sets one.
3. **An old entry with a `countBy` that is not a mode.** `hasOldPlacementRules` (`placement-rule.ts:657`) says "not old" when the key `countBy` exists, but `toPlacementRule` converts the entry the old way, so the one-time move never runs and the own numbers are lost. Fix: make both use the same test (`COUNT_MODES.includes(v.countBy)`).
4. **An old rule with only air changes always becomes Return air** (`placement-rule.ts:544`), also when its name says "supply" or "toevoer". Fix: check the supply words first, then fall back to Return air.
5. **The working-plane note of an old Light rule** (`placement-rule.ts:525`) says that the height "goes" also when the rule has its own `lux`; then the moved demand carries the height. Fix: give the note only when `lux` is absent.
6. **`validateRoomNeed` does not refuse ids such as `constructor`** (`room-need.ts:77`); only `parseRoomNeeds` does. The UI never makes such ids, so this is for consistency only.

## 2. Room type details (UI)

7. **An empty "At least" box removes the minimum on Save without a message** (`packages/ui/src/components/roomDemandText.ts:138`). Fix: treat an empty open box like an empty term box: "Enter the minimum, or click × to remove it."
8. **An empty "1 per N" box says '"1 per N" needs an N above 0.'** (the `every: NaN` path in `demandOfDraft`, `roomDemandText.ts:133`). Fix: say "Enter a number" for an empty box, and keep the "above 0" text for 0 or less.
9. **The keyboard focus goes to the page after × of a term or of the minimum** (`RoomTypeLibrary.tsx:850`, `:863`): the clicked button unmounts. Fix: use `focusAfter` (added in 179b4a7) to move the focus to the calculation select of the need, or to "+ At least…".

## 3. Tests that are missing (core)

10. `runPlacementPlan` with an own need in `input.needs` (the worker and layout tests never pass `needs`).
11. A Light rule with a UF table in a room with no calibration.
12. `moveOldRuleNumbers` run twice inside core (only the UI storage guard tests this today).

## 4. Clean-up

13. `isBuiltInNeedId` (`room-need.ts:66`) is used only by tests. Remove it, or use it where the code tests `BUILT_IN_IDS` by hand.
14. At 400 px the app shell behind the Auto-place dialog is 854 px wide (older than this feature; the dialog itself does not scroll sideways).
