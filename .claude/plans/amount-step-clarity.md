# Step 3 "Amount" of a placement rule: assessment and layouts

Status: **assessment and mockup done (2026-10-11). Waiting for the user to choose a layout.** No code change yet. Branch `worktree-amount-section-clarity`, made from `worktree-auto-place-dialog` (73f6c3a). Prompt: `amount-section-clarity-prompt.md`.

Mockup: artifact https://claude.ai/artifact/32GqZbfRZcu9RC3r1zCvUd (v1), copy in `.claude/plans/amount-step-mockup/mockup-v1.html`. The mockup has three layouts (A, B, C), three example cases and two sample rooms. Its numbers use the model of `calculateRoomRequirement`.

## 1. What was checked

Browser check: Playwright, `01_arch_first_floor.pdf`, scale 1:50, Detect rooms (38 rooms), a new rule, step 3. Sample room 1.01A Verkeersruimte (corridor, 23.7 m², 64.1 m³, no persons). Screenshots of all 8 presets, the socket case, the supply air case with and without a capacity, and Custom with numbers. The screenshots are in the session scratchpad only (not kept).

Code read: `stepAmount` and `WhyBox` in `PlacementRuleGuide.tsx`, `placementRuleDraft.ts` (`presetPatch`, `ruleOf`), `calculateRoomRequirement` and `capacityOf` in `packages/core/src/rooms/placement-rule.ts`.

## 2. What a first-time user sees (Custom, new rule)

From top to bottom, 1425 px high (a 1000 px window shows less than the first half):

1. 8 preset cards with a formula in symbols ("fixed + a × floor area + b × persons + n × volume").
2. "Units [dm³/s ▾] per [m² ▾] floor area", on its own line.
3. 4 rows. Each row starts with a symbol chip (`fixed`, `b`, `a`, `n`), then a wide "Number" select, then an empty box, the unit text, × and a room value.
4. "At least [none] dm³/s".
5. "Required amount: **missing room data**" (in orange), with no number typed.
6. "What one stamp gives: [none] dm³/s", "No capacity: each room gets one stamp. 1 stamp", and a checked box "Write the amount per stamp to each stamp as its capacity".
7. Coverage checkbox, "Count limits per room: At least [none] stamps, at most [none] stamps".
8. Room data checks. With a per-person number: a list of 8 room types with an "m² per person" box (Custom with numbers: 1947 px high).

## 3. Fields that are hard to understand, and why

| # | What | Why it is hard |
|---|---|---|
| 1 | Symbol chips `fixed`, `a`, `b`, `n` | The meaning is only in the info tip of the card. The same letter changes meaning: in "Per person + per area" `a` is per person and `b` is per area; in Custom `a` is per area and `b` is per person. |
| 2 | Row order | The formula says fixed, a (area), b (persons), n. The rows show fixed, b, a, n. |
| 3 | "Number" select, first in each row | It asks "where does the number come from" before the user knows what the number is. "Number" does not say "I type it". With a room-type source the box becomes a "fallback", a second idea in the same row. |
| 4 | Unit far from the number | The unit select is on a separate line above the rows. The rows repeat "dm³/s per m²" as text that cannot be changed there. |
| 5 | The unit `stamps` | It is hidden in a list of physical units. The default is dm³/s. Choosing `stamps` changes the whole step (the capacity goes away), but nothing says so before. |
| 6 | No capacity | "No capacity: each room gets one stamp" is a grey result row, not a warning. The step state stays green. The checkbox "Write the amount … as its capacity" is on, so MepApp writes the full room amount to one stamp. |
| 7 | "Required amount: missing room data" | Shows when the user typed nothing, and when the term that needs the data is empty. The message blames the room, not the empty rule. |
| 8 | "? persons" on an empty per-person row | Shows while the check list below says "Number of persons: This calculation does not use it". The two messages contradict. |
| 9 | Two "At least" rows | "At least [ ] dm³/s" is the minimum amount. "At least [ ] stamps" is the min count. Same words, different things, in different sections. With the unit `stamps` both rows say "At least [ ] stamps". |
| 10 | Three places that change the count | Amount ÷ capacity, Coverage, Count limits are three sections with three headings. The user sees them only in the "Why N stamps?" panel together. |

## 4. The questions the user must answer in their head

1. Do I count stamps, or an amount that the stamps give? (Hidden in the unit list.)
2. Which terms do I need? (Custom shows all four.)
3. What do `fixed`, `a`, `b`, `n` mean? (Info tip.)
4. Is my number "per m²" or "m² per stamp"? (Only "per m²" is possible.)
5. Do I type the number, or does it come from the room type? What is a fallback?
6. What does one stamp give? What happens when I leave it empty?
7. Is "At least" an amount or a number of stamps?
8. Do I need coverage, a min count, a max count?

### Case "1 socket per 5 m²"

The user thinks "one per five". They choose Per area and type 5. The default unit is dm³/s. Result: 118.7 dm³/s, "No capacity: each room gets one stamp", 1 stamp, green step state, no warning. The correct entry needs three choices that the step does not suggest: Per area, the unit `stamps`, and 0.2 (the inverse of 5). After those, the step shows "The amount is a number of stamps: 4.7, rounded up — 5 stamps" (corridor 23.7 m²).

### Case "supply air with a capacity per grille"

Per area, 1.2 dm³/s per m², grille 50 dm³/s. The default unit dm³/s fits, so the user only must find "What one stamp gives" (below the amount box, outside the first screen at 1000 px) and type 50. Without it: 28.5 dm³/s, 1 stamp, no warning, and the checkbox writes 28.5 dm³/s to the one grille. With it: "28.5 ÷ 50 = 0.57, rounded up — 1 stamp". This case works when the user knows the capacity box exists. The problem is the silent result without it.

## 5. Layouts (in the mockup)

The stored rule (`PlacementRule`) and `calculateRoomRequirement` stay the same in all three. "1 per 5 m²" is saved as perM2 = 0.2; the draft keeps which form the user typed. In all three: words instead of symbols, rows in one order (per room, per m², per person, air changes), the unit next to the number, the room-type source as a small "Take from room type" link, a warning (amber, step state warn) when an amount has no capacity, and one closed **Limits** section (min amount, min count, max count, coverage). "Room data this calculation needs" stays as it is.

- **A · Ask first.** The step starts with "What do you count?": **Stamps** or **An amount that the stamps give**. Then "The number grows with": chips Per room, Per m² floor area, Per person, Air changes (amount only), plus Lighting… and By coverage…. The chips replace the 8 preset cards: the chosen chips set the preset (one chip = its preset, more chips = Custom). With Stamps the area row reads "1 stamp per [5] m² floor area" (a link flips it to "stamps per m²"). The capacity section shows only for an amount.
- **B · Sentence.** One box reads as a sentence: "Each room needs [stamps / an amount in dm³/s ▾]", then the term rows, "+ Per room / + Per person …" buttons, "One grille gives [50] dm³/s", and the result. The presets become a "Start from an example" list. Most compact; least guidance.
- **C · Cards, clear rows.** The smallest change. The 8 cards stay. "Count in [stamps (no capacity) ▾ / dm³/s / …]" is the first row of the amount box. Words, order, unit, room-type link, warning and Limits as above. The question "count or amount" stays inside the unit list.

**Recommendation: A.** The main cause of both cases is the question "count or amount", and only A asks it first. A also makes "1 per 5 m²" possible as typed. C is the safe fallback when the 8 preset cards must stay.

## 6. Open decisions for the user

1. Which layout: A, B or C (or a mix)?
2. A and B remove the 8 preset cards. Do the presets stay as a stored field (set from the chosen terms), or only as examples? (Recommendation: keep `preset` in the rule, derive it from the terms.)
3. The default for a new rule: Stamps, or an amount in dm³/s?
4. No capacity with an amount: warning only (recommended), or block the rule until the user enters a capacity?

## 7. Phases

Written after the user chooses a layout.
