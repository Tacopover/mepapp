# Room types carry the demand calculations

Status: **assessment, model, answers and mockup done (2026-10-13). Stopped before product code: the user must accept the reading of the idea, the model and a layout of the Room types card (§9).** Branch `worktree-room-type-calculations`, made from `origin/worktree-amount-section-clarity` (d970ae8), with `origin/master` 4c31201 merged in. Prompt: `room-type-calculations-prompt.md`. Input: `amount-step-clarity.md` §8, `room-demands-research.md` §1.4, §2.6, §5.4, §8, §9.

Mockup: artifact https://claude.ai/artifact/SnNSpj6x1yLJ7W5euGdf5t, copy in `.claude/plans/room-type-calculations-mockup/mockup.html`. Checked in Chromium (Playwright 1.63): 49 checks pass. The checks type into real inputs, use all 10 example rules, add, rename and delete a need, use a 400 px width (no horizontal page scroll in the 4 views) and the dark theme, and find no page errors.

Terms in this file:
- **Need**: what a room requires, as one total in one unit (Supply air in dm³/s, Light in lm, Sockets). Built-in needs come with MepApp. **Own needs** are needs that the user adds.
- **Calculation**: how the total of a need grows: per person, per m² floor area, per room, per m room length, air changes per hour, "1 per N m²", illuminance.
- **Demand**: the calculation and the numbers of one need on one room type (Office: Supply air 6.5 dm³/s per person).
- **Capacity**: what one stamp gives, in the unit of the need (one grille gives 50 dm³/s). The existing field `capacityPerElement`.

## 1. The reading of the idea

The user (2026-10-13): "move more data to the room types so we can make this 'amount' dialog a lot simpler. [...] every demand can already be associated with a calculation. [...] then we only need the room's area to retrieve the total amount. So choosing a calculation happens when assigning room types."

This plan reads the idea as follows (§9 asks the user to confirm it):

1. A room type holds its demands. Each demand is one need, its calculation and its numbers.
2. The user chooses the calculation when they set up the room type, in the Room types card. A room gets the calculations with its room type (name match or the user's pick).
3. The room gives its area. The persons, the volume and the room length come from the area, the room type and the height chain (`computeRoomValues`). With these, the demand gives the total need of the room in one unit.
4. The placement rule keeps only the stamp side: the stamp, the need that it serves, the capacity, the limits, coverage and layout.
5. Step 3 "Amount" becomes small: "One stamp gives [ ]" and the stamps per room.

## 2. Assessment: the data flow today

```
room name ──matchRoomType / user pick──▶ room.roomTypeId
scene.resolveRoomType (library first, then the file copy)          scene.ts:2940
computeRoomValues(room, calibration, heights, roomType)            room-values.ts:172
  area, perimeter, length, width, ceiling height, volume, persons, a copy of roomType.demands
calculateRooms(rules, rooms, valuesOf) → ruleAppliesToRoom          placement-rule.ts:514, 243
calculateRoomRequirement(rule, values)                              placement-rule.ts:407
  each term the rule uses: amountTermValue (amount.from → room-type field, else the rule's number)
  lighting: lightingLux (luxFromRoomType → illuminanceLx), UF or UF table (room index), MF
  required = fixed + perM2·A + perPerson·P + perM3·V + light, at least amount.minimum
  count = ceil(required ÷ capacityOf(rule)), or 1 without a capacity; min count, max count
placement-layout.ts: coverage can raise the count (usesCoverage); perElement = required ÷ count
placement-worker.ts → Place: stamps, and the capacities when writeCapacity
```

The double definition. Each field of `ROOM_DEMAND_FIELDS` is already one need × one calculation (`supplyPerPersonDm3s` = supply air × per person). The rule chooses a formula again (`preset` and its terms) and links each term to a field (`amount.from`). Step 3 must show both sides, so most of its fields (`amount-step-clarity.md` §2, §3) exist only to connect the rule formula to the room-type fields.

The bug that the double definition causes. Each linked term falls back on its own. A socket rule with `perPerson ← socketsPerPerson` and `fixed ← socketsFixed` gives an Office that holds only `socketsPerPerson` the warning `noDemand` and `count: null`. The examples avoid this for supply air only with `supplyPerM2Dm3s: 0`. A demand on the room type removes the cause: the room type says which terms it has.

Room types use different calculations for the same need (`room-demands-research.md` §8): Office sockets 4 per person, Meeting room 6 per room, Corridor 1 per 15 m. One rule formula cannot serve these three today.

### 2.1 Places that read the fields

| What | Product code | Tests |
|---|---|---|
| `amount` terms, `amount.from`, `PlacementAmount`, `AmountTermKey` | `placement-rule.ts` 26–49, 147, 366–395, 407–471, 540–542, 556, 613, 646–654; `placementRuleDraft.ts` 66–73, 125–140, 200; `PlacementRuleGuide.tsx` 750–815 (term rows and sources), 819, 991–1021, 1916; `AutoPlaceDialog.tsx` 640 (rules that use the volume), 845 (unit in the results table) | `placement-rule.test.ts` 49–417; `placementRuleDraft.test.ts` |
| `lighting`, `LightingInputs`, `lightingLux`, `LightingUsed` | `placement-rule.ts` 57–74, 121, 336–343, 375–385, 435–462, 544–550, 633–645, 723–735; `placementRuleDraft.ts` 75–83, 164–186; `PlacementRuleGuide.tsx` 879–897, 966, 1039–1170, 1914, 1969–1971 | `placement-rule.test.ts` 190–311, 350, 376 |
| `preset`, `PRESET_AMOUNT_FIELDS`, `PLACEMENT_PRESET_HELP`, `PLACEMENT_PRESET_LABELS` | `placement-rule.ts` 13, 135–222, 307, 383, 409, 554–556, 612, 652–654; `placementRuleDraft.ts` 111–113, 126; `PlacementRuleGuide.tsx` (the 8 cards of step 3, `stepStatus` 519, `fieldSymbol`) | many |
| `capacityOf`, `calculateRoomRequirement`, `validatePlacementRule`, `parsePlacementRules`, `PLACEMENT_RULE_EXAMPLES` | `placement-rule.ts`; `placementRuleStorage.ts` 8, 15; `AutoPlaceDialog.tsx` 289 (import); `PlacementRuleGuide.tsx` 544, 564, 746 | `placement-rule.test.ts`, `placementRuleDraft.test.ts` |
| `RoomType.demands`, `RoomDemandKey`, `ROOM_DEMAND_FIELDS`, `ROOM_TYPE_DEMAND_EXAMPLES`, `validateRoomTypeFields`, `parseRoomTypes` | `room-type.ts` 7–65, 77, 188–235; `RoomTypeLibrary.tsx` 29–40, 74, 188–296; `PlacementRuleGuide.tsx` 609–616 (`setDemand`), 1265–1376 (the room data list); `roomTypeStorage.ts` 15; `scene.ts` 3645 (load of the file copy) | `room-type.test.ts`, `placement-rule.test.ts` 220–325 |
| `computeRoomValues`, `RoomValues.demands` | `room-values.ts` 158–188; `scene.ts` 3009 | `room-values.test.ts` 119–145, `export.test.ts` 52 |
| Schema | `project.ts` 19 (`CURRENT_SCHEMA_VERSION = 16`), 49 (`roomTypes`), 263–277 (steps 14→15, 15→16), 332 (validator). No step touches demands or rules. Rules are not in the project. | `project.test.ts` |
| Storage | `roomTypeStorage.ts` 6 (`mepapp.roomTypes.v1`), `placementRuleStorage.ts` 6 (`mepapp.placementRules.v1`), 32 (`mepapp.placementRules.unchecked.v1`), `App.tsx` 407–419 | `placementRuleStorage.test.ts` |

`placement-layout.ts` and `placement-worker.ts` read only the requirement, `coverage`, `minCount`, `maxCount` and `usesCoverage`. They change only for the new input field `needs` (§3.4).

### 2.2 What goes away

From the rule: `preset`; all of `amount` (`fixed`, `perM2`, `perPerson`, `perM3`, `minimum`, `unit`, `areaUnit`, `from`); from `lighting` the fields `lux`, `luxFromRoomType`, `workingPlaneHeightM` and `illuminanceUnit`. The rest of `lighting` (UF, UF table, suspension, MF) stays as `luminaire`. `amount.unit` stays as `unit`, for the capacity of a flow or power need.

From core: `PRESET_AMOUNT_FIELDS`, `PLACEMENT_PRESET_HELP`, `PLACEMENT_PRESET_LABELS`, `AmountTermKey`, `amountTermValue`, `lightingLux`, `demandsForTerm`, `demandFitsUnit`, `demandInUnit`, `RoomDemandKey`, `RoomDemandTerm`, `RoomDemandKind`, `ROOM_DEMAND_FIELDS`.

From step 3: the 8 preset cards; the unit select above the terms; the 4 term rows with the symbol chips and the "Number / room type" sources; the "fallback" boxes; "At least [ ] dm³/s" (the minimum moves to the room type); the illuminance box, its source and fc; the working-plane box; the list "Room data this calculation needs" with its boxes per room type. What stays: the capacity (now the main field), "Write the amount per stamp …", coverage, the count limits, UF, MF, the UF table, the suspension, and the "Why N stamps?" chain.

## 3. The data model

### 3.1 Needs (new module `packages/core/src/rooms/room-need.ts`)

```ts
/** The kind of a need sets its unit, the calculations it offers, and the units of a rule's capacity. */
export type NeedKind = 'light' | 'flow' | 'power' | 'count' | 'amount';

/** What one term of a demand grows with. */
export type DemandBasis = 'room' | 'person' | 'area' | 'length' | 'volume' | 'illuminance';

export interface RoomNeed {
  /** A built-in id ('light', 'supplyAir', …) or the id of an own need. */
  id: string;
  name: string;
  nameNl?: string;
  kind: NeedKind;
  /** The unit of a total: 'lm', 'dm³/s', 'W', or the text of a count or amount need ('sockets', 'outlets'). */
  unit: string;
  /** A count need: the word for one ("socket"), for "1 socket per 5 m²". Absent = the unit. */
  unitOne?: string;
  /** True for a need of the user. */
  own?: boolean;
}

export const BUILT_IN_NEEDS: readonly RoomNeed[] = [
  { id: 'light', name: 'Light', nameNl: 'Verlichting', kind: 'light', unit: 'lm' },
  { id: 'supplyAir', name: 'Supply air', nameNl: 'Toevoerlucht', kind: 'flow', unit: 'dm³/s' },
  { id: 'exhaustAir', name: 'Exhaust air', nameNl: 'Afvoerlucht', kind: 'flow', unit: 'dm³/s' },
  { id: 'heating', name: 'Heating', nameNl: 'Verwarming', kind: 'power', unit: 'W' },
  { id: 'cooling', name: 'Cooling', nameNl: 'Koeling', kind: 'power', unit: 'W' },
  { id: 'sockets', name: 'Sockets', nameNl: 'Wandcontactdozen', kind: 'count', unit: 'sockets', unitOne: 'socket' },
];

/** The bases that a kind offers, in the order of the calculation list. */
export const BASES_OF_KIND: Record<NeedKind, readonly DemandBasis[]> = {
  light: ['illuminance'],
  flow: ['person', 'area', 'room', 'volume'],
  power: ['area', 'room', 'person'],
  count: ['person', 'room', 'area', 'length'],
  amount: ['person', 'room', 'area', 'length'],
};

export function parseRoomNeeds(raw: unknown): RoomNeed[] | null;            // own needs: user library and project copy
export function validateRoomNeed(need: RoomNeed, others: readonly RoomNeed[]): string | null;
```

Reason: a need must exist apart from the room types, because two room types and a rule must point at the same need, and the user wants own needs (2026-10-12). The kind replaces `RoomDemandKind` and still sets the unit conversions (flow, power).

### 3.2 The demand on a room type (`room-type.ts`)

```ts
/** One term of a demand. Exactly one of `value` and `every`. */
export interface DemandTerm {
  basis: DemandBasis;
  /** Per room, per person, per m² floor area, per m room length; air changes per hour (volume); Em in lx (illuminance). */
  value?: number;
  /** "1 per N": one unit of the need per N persons, m² or m. Count and amount needs; bases person, area and length. */
  every?: number;
}

/** What a room type needs of one need: the terms add up, then the minimum applies. */
export interface RoomDemand {
  /** 1 or more. Light: one illuminance term. */
  terms: DemandTerm[];
  /** The total is at least this, in the unit of the need. */
  minimum?: number;
  /** Light only: the working plane above the floor, m. Absent = 0.75 (DEFAULT_WORKING_PLANE_HEIGHT_M). */
  workingPlaneM?: number;
}

/** The demands of a room type, by need id. One demand for each need. */
export type RoomDemands = Record<string, RoomDemand>;

export interface RoomType {
  id: string;
  name: string;
  nameNl?: string;
  keywords: string[];
  areaPerPersonM2?: number;
  /** Was Partial<Record<RoomDemandKey, number>>. */
  demands?: RoomDemands;
}

/** The total of one demand for one room, in the unit of the need, with the parts for the "Why" chain. */
export function demandTotal(need: RoomNeed, demand: RoomDemand, values: RoomValues): DemandResult;
```

Reasons: the calculation moves from the rule to the room type (the idea). `every` keeps "1 per 5 m²" as the user typed it (no 0.2 with a rounding error). The record by need id gives one demand for each need, so two rules can never read two different calculations of one need on one room type. `workingPlaneM` belongs to the illuminance of the room type (`room-demands-research.md` §1.4).

`RoomValues` keeps its fields. `RoomValues.demands` holds a copy of the new record. `lengthM` (the long side of the min bounding rectangle) now also feeds the "per m room length" calculation.

### 3.3 The rule (`placement-rule.ts`)

```ts
/** How MepApp counts the stamps: the need of the room types ÷ the capacity, the same number in each room, or coverage. */
export type PlacementCountMode = 'need' | 'perRoom' | 'coverage';

/** The luminaire side of the lumen method (was part of LightingInputs). */
export interface LuminaireInputs {
  utilisationFactor: number;
  ufTable?: UfTablePoint[];
  suspensionM?: number;
  maintenanceFactor: number;
}

export interface PlacementRule {
  id: string;
  name: string;
  discipline: Discipline;
  /** RoomType ids. Empty = every room whose type has the need (countBy 'need'), else every room. */
  roomTypeIds: string[];
  nameContains?: string;
  stampDefinitionId: string | null;
  countBy: PlacementCountMode;
  /** countBy 'need': the need that the stamp serves. */
  needId?: string;
  /** countBy 'need': what one stamp gives, in `unit`. Light: the lm of one luminaire. Count need: absent = 1. Flow, power, amount: absent = one stamp per room, with a warning. */
  capacityPerElement?: number;
  /** A flow or power need: the unit of the capacity and of the written capacity (dm³/s, l/s, m³/h, m³/s, cfm; W, kW). Absent = the unit of the need. */
  unit?: string;
  /** Need Light: UF or the UF table, the suspension, MF. */
  luminaire?: LuminaireInputs;
  /** countBy 'perRoom': the stamps in each room. */
  perRoomCount?: number;
  coverage: CoverageLimits;
  alsoCoverage?: boolean;
  minCount?: number;
  maxCount?: number;
  layout: PlacementLayout;
  writeCapacity: boolean;
}
```

The count: `N = max(ceil(need ÷ capacity), coverage count, min count)`, at most the max count, as in `amount-step-clarity.md` §8.1. For Light, need = Em × A (lm on the working plane) and capacity = Φ × UF × MF, with UF from the room index of each room when the rule has a UF table (§4, question 3). `calculateRoomRequirement(rule, values, need)` gets the need definition. `calculateRooms` and `PlacementPlanInput` get `needs: RoomNeed[]` (the built-in needs plus the own needs). `RoomRequirement` gets `capacity` (per room, for Light) and the parts of the demand for the "Why" chain. The warnings stay, plus `needNotFound` (a deleted own need); `noDemand` now means "the room type has no demand for the need".

Reason for `countBy`: three ways of counting stay after the calculation moves out. `perRoom` is "1 thermostat in each room" (question 8). `coverage` is today's By coverage (question 7).

### 3.4 Storage and the project

- `mepapp.roomTypes.v1` keeps its key. `parseRoomTypes` reads the old number fields and gives the new record (§3.5). The next save writes the new shape. This follows the pattern of the rules, whose parser already migrates old coverage names.
- New `mepapp.roomNeeds.v1`: the own needs of the user (`roomNeedStorage.ts`, like `roomTypeStorage.ts`). Built-in needs are in code.
- `mepapp.placementRules.v1` keeps its key. Before the first save in the new shape, the app writes the old list once to `mepapp.placementRules.v1.before-needs` as a backup.
- Project schema 17: step 16 → 17 converts `roomTypes[].demands` with the same function as the library parser, and adds `roomNeeds: []`. `ProjectDocument.roomNeeds` holds copies of the own needs that the room types of the file use (like `roomTypes`). Reason for the version: an app of schema 16 drops the new demands silently (`toRoomDemands` reads numbers only). With 17 it refuses the file instead.

### 3.5 Migration

Old room-type demands (library, project copy, `ROOM_TYPE_DEMAND_EXAMPLES`):

| Old fields | New demand |
|---|---|
| `illuminanceLx` (+ `workingPlaneHeightM`) | `light: { terms: [illuminance E], workingPlaneM }` |
| `supplyPerPersonDm3s`, `supplyPerM2Dm3s` | `supplyAir: { terms: [person, area] }` |
| `exhaustFixedDm3s` | `exhaustAir: { terms: [room] }` |
| `airChangesPerH` | `exhaustAir: { terms: [volume] }` (added to the exhaust terms; see the note) |
| `heatingLoadWm2` | `heating: { terms: [area] }` |
| `coolingLoadWm2` | `cooling: { terms: [area] }` |
| `socketsPerPerson`, `socketsFixed` | `sockets: { terms: [person, room] }` |

- A term with the number 0 is left out when the demand has another term. A demand with only 0 stays: it says "needs none" (Toilet: 0 sockets).
- `workingPlaneHeightM` without `illuminanceLx` is dropped: without Em it has no use.
- Note on `airChangesPerH`: the old field does not say supply or exhaust. The examples use it for Storage (0.5) and Technical room (2), which practice ventilates by exhaust. A room type with both `exhaustFixedDm3s` and `airChangesPerH` gets one Exhaust air demand with both terms, so its total is the sum. No example has both. §9 asks the user to confirm Exhaust air.

Old rules (`toPlacementRule`, and the import of a rules file):

| Old rule | New rule | Loss |
|---|---|---|
| `preset: 'coverage'` | `countBy: 'coverage'` | none |
| no amount (one stamp per room), or unit "stamps" with only `fixed` N | `countBy: 'perRoom'`, `perRoomCount` 1 or N | none |
| every used term comes from the room type, all from one need | `countBy: 'need'` with that need | none; the bug of §2 goes away |
| `lighting` with `luxFromRoomType` | need Light; UF, table, suspension, MF → `luminaire` | none |
| own numbers (with or without links) | `countBy: 'need'`; the own numbers move to the room types of the rule as a demand (§4, question 11) | room types that already hold the need keep their own numbers (reported); untyped rooms leave the rule (reported) |
| a unit that no built-in need has ("stamps" with per m², free text) | a new own need, named after the unit, with the numbers moved as above | a new own need shows in the card |

The need of an old rule: the need of its links; else Light for `preset: 'lighting'`; Heating for W or kW (Cooling when the rule name has "cool" or "koel"); Supply air for a flow unit (Exhaust air when the name has "exhaust", "extract", "afzuig", "afvoer" or "toilet"). The report names each guess, and the user can change the need in step 1. `areaUnit: 'ft2'` and `illuminanceUnit: 'fc'` convert to m² and lx (× 10.764).

The core gives this as pure functions: `parsePlacementRules(raw)` returns `{ rules, oldNumbers }`, and `moveOldRuleNumbers(types, oldNumbers)` returns `{ types, report }`. The app runs both once when the stored rules are old, saves both libraries, and shows the report.

Example sets: `ROOM_TYPE_DEMAND_EXAMPLES` and `PLACEMENT_RULE_EXAMPLES` are rewritten in the new shape (no migration at run time). The supply air example gets `roomTypeIds: []` (every room type with Supply air) and loses its own 7 + 0.7 (the room types give 6.5 per person, Bbl). The toilet exhaust example keeps `['toilet', 'bathroom']`, so storage and technical rooms do not get a toilet grille. The air-change example becomes an Exhaust air rule for `['technical']` with 300 m³/h per grille. The corridor example gets "Sockets: 1 per 15 m room length" (`room-demands-research.md` §8, `socketsPerM`).

## 4. Answers to the open questions

1. **Calculations per need.** Built-in needs and their calculations: Light — illuminance; Supply air and Exhaust air — per person, per m², per room, air changes; Heating — per m², per room; Cooling — per m², per room, per person; Sockets and own count needs — per person, per room, per m², per m room length, and "1 per N" of persons, m² and m. **One demand = 1 or more terms that add up, then "at least" a minimum.** No "larger of two" mode. Reason: EN 16798-1 method 1 and ASHRAE 62.1 add per person and per m²; Bbl dwellings ("0.9 per m², at least 7 dm³/s") is the minimum; the research found no case that needs the larger of two terms that the minimum does not cover.
2. **"1 per N m²".** Count and amount needs offer "1 per N m² floor area", "1 per N m room length" and "1 per N persons". **Store `every: N`**, not 1 ÷ N. Reason: the card shows what the user typed (answer of 2026-10-12), and 1 ÷ 3 has no exact decimal.
3. **Lighting.** **Need = Em × A in lm on the working plane; capacity = Φ × UF × MF of one luminaire.** The room type holds Em and the working-plane height; the rule holds Φ (the capacity), UF or the UF table, the suspension and MF. Reason: this is the split of `room-demands-research.md` §1.4, and the math does not change: N = ceil(Em·A ÷ (Φ·UF·MF)). With a UF table the capacity differs per room (corridor UF 0.45, office 0.67 in the mockup); the table of step 3 shows it per room. fc goes away from the rule; old fc rules convert to lx. Room types stay metric, as now.
4. **No demand.** **No stamps, and a clear row.** A rule whose step 2 is empty skips rooms whose type has no demand for the need, and lists them in one line ("Not in this rule: 1.01A Corridor (Corridor has no Supply air)"). A room type that the user chose in step 2 without the need gets a row "Corridor has no Exhaust air. No stamps." with the link "Add Exhaust air to Corridor", which opens the card on that need. No default room type, and no own numbers in the rule: both bring back the double definition. A room without a type is not in a need rule. The override per room stays an open gap (question 12).
5. **Rooms of a rule.** **Yes: by default a need rule applies to every room type that has the need.** Step 2 becomes a filter: no chip chosen = all of them. Reason: the room type says which needs it has, so step 2 needs no work in most rules. A filter stays for two rules with the same need and different stamps (office luminaire, corridor downlight). Because step 2 depends on the need, **the need moves to step 1** ("This stamp serves [Supply air ▾]"), next to the stamp.
6. **Two rules for one need in one room.** **Each rule serves the full need, as today. A split is out of scope.** A later "share of the need (%)" on the rule can add it. Phase 4 can add a warning in the Auto-place list when two checked rules with the same need place in the same room (§7, optional).
7. **Coverage needs.** **Coverage stays a rule mode (`countBy: 'coverage'`), without a need.** The rule holds the reach, as today. Reason: the count comes from the room shape, not from a total, so nothing moves to the room type. Step 2 already chooses the rooms. A room-type class (smoke / heat / none, sprinkler hazard class, research §5.4) can come later as a filter; it is not part of this change.
8. **A number per room.** **A rule mode: "The same number in each room" (`countBy: 'perRoom'`).** Reason: "1 thermostat per room" belongs to the system, not to the room; to type it on 20 room types is extra work. When the number differs per room type, it is a count need on the room types (Meeting room: 6 sockets per room).
9. **Own needs.** **The user adds them in the Room types card ("+ New need…"): a name, what it is (a number of things, an air flow, a power, another amount) and a unit.** They are stored in `mepapp.roomNeeds.v1`, with a copy in the project (`roomNeeds`). Rename keeps the id. Delete asks in the page (no `window.confirm`), names the room types that hold numbers for it, and removes those demands. A rule that uses a deleted need shows "The need of this rule was deleted" and places nothing until it gets another need, the same as a stamp that is not found.
10. **Library and project copy.** Current behavior (checked): `resolveRoomType` reads the library first and the file copy only when the library does not have the id (`scene.ts:2940`). A save writes the library version of each used type (`usedRoomTypes`, `scene.ts:3584`). A type that leaves the library stays as the copy of an open document (`setRoomTypeLibrary`, `scene.ts:2921`). So a change of a calculation in the library changes the counts of an open project at once, and the next Save writes it. **Keep this behavior, and give the own needs the same rule.** Placed stamps do not change until the user runs Place again. Risk (as today): a file opened on a machine with another library uses that library.
11. **Old rules.** Lossless cases convert silently (§3.5). **Own numbers move once to the room types of the rule that do not have the need yet**, with a report and a backup of the old rules. Reason: the numbers are not lost, the rule gets the new shape, and the user sees what happened. A rule with no room types moves its numbers to every room type without the need. The alternative (no move; the rule shows its old numbers once, and the user types them into the card) is simpler to build but asks work of the user.
12. **Where the user chooses.** **Confirmed: the calculation is chosen on the room type** (Room types card, in the library tab of the Auto-place input card). A room gets it with its type. **No choice per room in this change**: a room that needs another calculation gets another room type (for example "Office, open plan"). The number of persons on the room stays the override per room, as now.

## 5. The mockup

https://claude.ai/artifact/SnNSpj6x1yLJ7W5euGdf5t — four views and 10 example rules. Sample rooms (from mockup v2): 1.20 Office 31.4 m² (3 persons), 1.05 Meeting room 18 m² (9 persons), 1.01A Corridor 23.7 m² (13.2 m long), 1.12 Toilet 3.2 m², all 2.7 m high. Room-type numbers: `room-demands-research.md` §8.

- **Card A · By room type.** The card of today: the list of room types and the form of one type. The form shows the persons and only the needs that the type has. Each need has its calculation (a select), its numbers, "+ Add a term", "+ At least…", and its result in a sample room ("1.20 Office: 6.5 × 3 persons = 19.5 dm³/s"). "Add a need" and "+ New need…" are at the end.
- **Card B · Table.** Room types × needs, one short cell each ("6.5/person", "1 per 15 m", "0.5 ACH"). A click opens the same editor below the table. Good to compare and to find gaps; narrow in the dialog, and it scrolls sideways at 400 px.
- **Card C · By need.** The needs on the left (with "3/8": the room types that have it), every room type with its calculation for the chosen need on the right. An own need has Rename and Delete here. This is how a norm table reads (Bbl per function, EN 12464-1 per room). The link from step 3 opens this view.
- **Rule step 3.** The context box shows step 1 (stamp, "Serves") and step 2 (room-type chips; none = every type with the need). Then one section "What does one stamp give?" in the words of the need ("One grille gives [50] [dm³/s ▾]", "One stamp holds [2] sockets" with the suggestion from "Double", "One luminaire gives [3600] lm × UF × MF"), the table "Stamps per room" (room, what the room type gives, need, ÷ one stamp, stamps), the line "Not in this rule", and closed Limits. A click on a room shows "Why N stamps?": room type → calculation (grey: from the room type) → room values → need → ÷ one stamp → round up → limits → N.

**Recommendation: A and C as two views of one library tab ("By room type" | "By need"), both with the same demand editor.** Reason: A has the place for the name, the keywords and the persons, and it shows one room type at a time, as the user sets one up. C is the view of one need over all room types: the view that step 3 links to, and the fastest way to fill a norm table or a new own need. B shows everything, but it is too wide for the dialog and for a phone.

## 6. Other findings (not in scope)

- The built-in room types have no demands ("No design values", `room-type.ts:80`). With the new default of step 2, a need rule matches nothing until the room types have numbers. Phase 2 adds "Fill in the example values" for all room types at once in the card (today it is per type), and step 3 links to it when no room type has the need.
- `room-demands-research.md` §0 findings 1 and 2 are fixed already: the toilet exhaust example uses 7 dm³/s, and the smoke detector example uses `maxRadius: 5.8`.

## 7. Draft phases

Each phase ends with the core tests (`pnpm --filter @mepapp/core test`), `@mepapp/ui` rebuilt, and a browser check through real DOM inputs. Mark each phase done here with its commit hash.

1. **Core: needs and room-type demands.** `room-need.ts` (built-in needs, kinds, bases, parse and validate of own needs). The new `RoomDemand` shape, `demandTotal`, the migration of the old fields in `parseRoomTypes`, `validateRoomTypeFields`, `ROOM_TYPE_DEMAND_EXAMPLES`. Schema 17 (`roomTypes[].demands`, `roomNeeds`). An adapter that reads and writes the old field names on the new shape, so the current card and guide keep working until phase 3. Vitest for each (also: "1 per 15 m", minimum, 0 terms, the ACH case, a v16 project).
2. **Room types card.** The chosen layout (recommended: A and C), the demand editor, own needs (add, rename, delete with the confirmation in the page), `mepapp.roomNeeds.v1`, the own needs in the scene and in the project copy, "Fill in the example values" for all types. Browser check: type demands, "1 per N", add and delete a need, save and reload a project.
3. **Core rules and guide steps 1–3.** The new rule shape and `calculateRoomRequirement` (need ÷ capacity, Light with the capacity per room, perRoom, coverage), `ruleAppliesToRoom` with the need default, the parse of new and old rules (`oldNumbers`), `moveOldRuleNumbers`, `PLACEMENT_RULE_EXAMPLES`, `needs` in the worker input. Remove the adapter, `ROOM_DEMAND_FIELDS` and the presets. Guide: "Serves" in step 1, step 2 as a filter, the simple step 3 and the Why chain, `placementRuleDraft.ts` rewritten. Vitest, also the socket case of §2 (Office with only "4 per person" gives a count).
4. **Auto-place and the old rules.** The rule list and summaries name the need; the results table uses the unit of the rule; the volume check reads the demands (`AutoPlaceDialog.tsx:640`). The one-time move at start with the backup and the report; the import of an old rules file. Optional: the warning for two rules with one need in one room. Browser check with stored old rules: the shipped examples of today, an old Custom rule with own numbers, and an old socket rule with two links.

## 8. Not changed by this plan

Spacing, layout, ceiling grid, Place and Undo (steps 4 to 6); room detection; the ceiling-height chain; the persons rule (room number first, then area ÷ area per person).

## 9. Open decisions for the user

1. Is the reading of the idea in §1 correct?
2. Do you accept the model of §3? It includes these choices: the need moves to step 1; step 2 is empty by default (every room type with the need); three ways of counting (need ÷ capacity, the same number in each room, coverage); the old field "air changes" becomes Exhaust air.
3. Which layout of the Room types card: **A + C (recommended)**, A only, B, or C only?
4. Old rules with own numbers: move the numbers to the room types once, with a report (recommended), or show them once and let the user type them in?
