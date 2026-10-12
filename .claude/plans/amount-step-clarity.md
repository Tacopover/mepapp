# Step 3 "Amount" of a placement rule: assessment and layouts

Status: **assessment and mockup v1 done (2026-10-11). Concept chosen (2026-10-12, §8): "need ÷ capacity", entered by the kind of stamp. Mockup v2 done. Waiting for the user to choose layout 1 (Form) or 2 (Chain is the form).** No code change yet. Branch `worktree-amount-section-clarity`, made from `worktree-auto-place-dialog` (73f6c3a). Prompt: `amount-section-clarity-prompt.md`.

Mockup v1: artifact https://claude.ai/artifact/32GqZbfRZcu9RC3r1zCvUd, copy in `.claude/plans/amount-step-mockup/mockup-v1.html`. Three layouts (A, B, C) of the current fields. Superseded by v2.

Mockup v2: artifact https://claude.ai/artifact/JX4GdVfea9witVLRHzYUiY, copy in `.claude/plans/amount-step-mockup/mockup-v2.html`. Two layouts of the chosen concept, the Room types card, 9 examples, 4 sample rooms. Checked in Chromium (Playwright): all examples, real typing, a new need, 400 px width (no horizontal scroll), dark theme, no page errors.

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

Sections 5 and 6 are superseded by §8.

## 7. Phases

See §8.6. Final after the user chooses layout 1 or 2.

## 8. Chosen concept (2026-10-12): need ÷ capacity

The user asked for a step back: every room has an area and needs; the calculations differ (stamps per m², an average lux, fresh air per person …), but each one gives a number of stamps. Five options were given (one form "need ÷ capacity", start from the kind of stamp, needs in the room types, the chain as the form, a formula field). The user accepted the recommendation: **start from the kind of stamp, built on "need ÷ capacity", with the room-type numbers as the default source.** The user's answers:

1. A user thinks "one per 5 m²", not "0.2 per m²".
2. The capacity (what one stamp gives) stays in the rule, not in the stamp library.
3. Users want to define their own needs.

### 8.1 Terms

- **Need**: what one room requires, as one total in one unit (19.5 dm³/s supply air, 32 708 lm light, 23.7 m² floor area, 12 sockets).
- **Capacity**: what one stamp gives, in the unit of the need (one grille gives 50 dm³/s). The existing field `capacityPerElement`.
- **Kind of stamp**: Luminaire, Air grille, Socket, Heater or cooler, Detector/sprinkler/speaker, Other. It gives the list of needs, the words of the form and the defaults. MepApp suggests it from the stamp name of step 1.
- **Room-type numbers**: the numbers of a need that a room type holds (Office: 6.5 dm³/s per person). **Own numbers**: the numbers in the rule for room types without numbers (today: "fallback").
- **Your need** (custom need): a need that the user adds: a name, a unit and the terms it grows with. The room types hold its numbers.

The count is always: `N = max(ceil(need ÷ capacity), coverage count, min count)`, at most the max count. This is the chain that `calculateRoomRequirement` already uses.

### 8.2 The needs

| Kind of stamp | Need | Unit | Terms (room-type field) |
|---|---|---|---|
| Luminaire | Light | lm | E × area ÷ (UF × MF); E from `illuminanceLx` |
| Air grille | Supply air | flow | per person (`supplyPerPersonDm3s`) + per m² (`supplyPerM2Dm3s`) |
| Air grille | Exhaust air | flow | per room (`exhaustFixedDm3s`) |
| Air grille | Air changes | flow | per m³ (`airChangesPerH`) |
| Socket | Sockets | sockets | per person (`socketsPerPerson`) + per room (`socketsFixed`) |
| Socket, Other | Floor area | m² | the floor area itself; capacity "one stamp serves N m²" |
| Heater or cooler | Heating / Cooling | W | per m² (`heatingLoadWm2` / `coolingLoadWm2`) |
| Detector … | Cover each point | – | coverage limits (radius, max area …) |
| Other | Persons | persons | the persons itself; capacity "one stamp serves N persons" |
| Other | A number per room | stamps | own number; no capacity |
| Other | Your needs | user unit | the terms the user chose |
| Other | Own calculation | any | today's Custom: own numbers only, no room types |

"1 socket per 5 m²" becomes the need Floor area with "One stamp serves 5 m²". In Own calculation with the unit stamps, the area and person rows read "1 stamp per N m²" / "1 stamp per N persons" (answer 1).

### 8.3 Rule for the room-type numbers (model change, with a reason)

A need with more than one term (Supply air, Sockets, your needs) uses the numbers of a room type as one set: when the room type has one or more numbers of the need, an empty term counts as 0. When it has none, the rule's own numbers apply as a set. Today each term falls back on its own, so a socket rule with per person + per room from the room type gives Office (only `socketsPerPerson`) the warning `noDemand` and no count (checked 2026-10-12 with the built core: unit sockets, capacity 2, result `count: null`). The examples avoid this for supply air only because they hold `supplyPerM2Dm3s: 0`. Terms without a room-type field stay own numbers, as today.

### 8.4 Model and data changes (planned)

- `PlacementRule.need?: string`: the need the rule meets (a built-in id or the id of your need). Absent = Own calculation; old rules get a need when the mapping is lossless (`needOfRule`), else they open as Own calculation. `preset` stays and is set from the need, so the calculation, the layout and the coverage code keep working.
- A new core module for the needs: the built-in list (§8.2) and your needs (`{ id, name, unit, terms }`), with parse and validate. Your needs are a user library (`mepapp.roomNeeds.v1`, like the rules and the room types).
- The numbers of your needs go into `RoomType.demands` with the key `<needId>:<term>`, so the existing `amount.from` link, the project copy of the room types, import and export work for them. `ROOM_DEMAND_FIELDS` plus the fields of your needs; `demandInUnit`, `demandFitsUnit`, `validatePlacementRule`, `toPlacementRule` and `toRoomDemands` accept these keys.
- `calculateRoomRequirement`: the set rule of §8.3. Floor area and Persons are the presets perArea / perPerson with the number 1 and the unit m² / persons, so they need no new calculation.
- The Room types card groups the demands by need and lists your needs (add, rename, delete).

### 8.5 Layouts (mockup v2)

- **1 · Form.** Four sections: What do you place? (6 tiles, the suggested one marked), What does the room need? (need chips, then a table of the room types of step 2 with their numbers and a row for own numbers), What does one stamp give? (one row in the words of the kind; the stamp name can suggest the capacity: "Double" = 2), Stamps per room (one row per room of the rule; a click shows its "Why N stamps?" chain on the right). Limits closed.
- **2 · Chain is the form.** The tiles, then the chain of one sample room: Need, ÷ One stamp, Round up, Limits, = N stamps. Each link shows its number and opens with Change. The other rooms show as one line below.
- **Room types card** (both layouts): the demands grouped by need, your needs in their own groups, "+ New need".

Recommendation: **1 · Form.** It shows all rooms of the rule at once, so a room type without numbers is visible before Place. Layout 2 shows one room at a time and is tall for Light.

### 8.6 Phases (draft)

Each phase ends with a browser check through real DOM inputs (`feedback-verify-ui-wiring-via-real-dom`), `@mepapp/ui` rebuilt first, and the core tests.

1. **Core: needs.** Built-in needs, your needs (parse, validate), the custom demand keys, `PlacementRule.need` and its migration, the set rule of §8.3. Vitest for each.
2. **Room types card.** Demands grouped by need; your needs: add, rename, delete; their numbers per room type; storage `mepapp.roomNeeds.v1`.
3. **Step 3, top half.** Kind tiles with the suggestion from the stamp name, need chips, the need block (room-type table + own numbers; Light with UF/MF and More; Floor area, Persons, A number per room, Own calculation), "+ New need…". The 8 preset cards go away.
4. **Step 3, bottom half.** Capacity row per kind (with the "Double" suggestion), the warning without a capacity, Stamps per room (all rooms of the rule), Limits closed, the Why panel in the new words.
5. **Other places.** The rule list and summaries in Auto-place, and the Place step, name the need instead of the preset. Old rules open correctly (the example rules and an old Custom rule).

### 8.7 Open decisions for the user

1. Layout 1 (Form) or 2 (Chain is the form)?
2. Does "Stamps per room" list every room of the rule (recommended), or only the sample room?
3. No capacity with an amount: a warning (recommended), or block the rule?
4. Your needs: only under Other (as in the mockup), or can the user give a need a kind of stamp, so it shows under that tile too?
