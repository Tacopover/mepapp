# Prompt: make the amount step of a placement rule clear

Paste the text below into a new session. Written 2026-10-11, after feedback round 1 of `auto-place-dialog.md`.

---

Work on branch `worktree-auto-place-dialog` (or a new branch made from it). Do not push to master. Write user prose in STE.

**Problem.** The user finds step 3 of a placement rule ("How many stamps does one room need?") confusing. This is the amount section of `PlacementRuleGuideBody` in `packages/ui/src/components/PlacementRuleGuide.tsx` (function `stepAmount`). The worst case is the preset **Custom**. It shows many fields and symbols at the same time, and it is not clear at first sight what each field does:

- the terms `fixed`, `a` (per m²), `b` (per person) and `n` (per m³ volume), each with a "Number / Room type: …" source select and a box that becomes a "fallback";
- "At least" (the minimum);
- the amount unit select (stamps, dm³/s, l/s, m³/h, …, Other…) and the area unit select;
- "Required amount";
- "What one stamp gives" (the capacity) and "Write the amount per stamp to each stamp as its capacity", or "Number of stamps" for the unit `stamps`;
- "Also cover each point of the room" and the coverage limits;
- the count limits (min count, max count).

A user who wants "1 socket per 5 m²" must know that they need Per area, the unit `stamps` and 0.2. Before feedback round 1 there was no unit `stamps`, and a rule without a capacity gave one stamp per room with no warning.

**The model** (do not change it without a reason): `calculateRoomRequirement` in `packages/core/src/rooms/placement-rule.ts`. required = fixed + a × area + b × persons + n × volume (+ lighting), at least the minimum. count = ceil(required ÷ capacity) (`capacityOf`: 1 for the unit stamps), or 1 when there is no capacity. Then the min count and the max count apply. Coverage can raise the count.

**Task.**
1. Read `stepAmount`, the "Why N stamps?" panel (`WhyBox`, near the end of the file), `placementRuleDraft.ts` and the core model. Open the dialog in a browser (Playwright, port 5431, OPFS stub; the scripts in the old scratchpad show the pattern) and take screenshots of step 3 for each preset, Custom first.
2. Write an assessment: what a first-time user sees, which fields are hard to understand and why, and the questions the user must answer in their head. Include the case "1 socket per 5 m²" and the case "a supply air rule with a capacity per grille".
3. Propose 2 or 3 layouts for step 3 as an HTML mockup (in `.claude/plans/`, like `auto-place-dialog-mockup`). Ideas to consider, not decisions:
   - Ask first "What do you count?": stamps directly, or an amount (air, power, light) that stamps give. Show the capacity only for an amount.
   - Show only the terms that the preset uses, with words instead of symbols (`a`, `b`, `n`); show the formula as a sentence with the real numbers of the sample room.
   - Move the room-type source and the fallback into a small "Take from room type" toggle per term.
   - Put the unit near the number it belongs to ("0.2 stamps per m²").
   - Warn when a rule has an amount unit but no capacity (now: one stamp per room).
   - Put min count, max count and coverage in a closed "Limits" section.
4. Stop and ask the user to choose a layout before you change the code. Then write a phased plan in `.claude/plans/` and do the phases one by one, with a browser check through real DOM inputs for each phase.

Rules: no `pnpm add`; no `window.confirm` in the ui package; stop servers with TaskStop, never `pkill -f vite`; no chained or heredoc Bash commands (write scripts to the scratchpad and run them); rebuild `@mepapp/ui` before a browser check.
