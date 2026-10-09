# Placement guide and the new count model — plan

Follow-on to `room-auto-placement.md` (Phases 0–6 done on branch `worktree-room-placement-phase6`, not merged). This plan starts from that branch.

The user reviewed an interactive mockup on 2026-10-09 and accepted it: https://claude.ai/artifact/HAFcrX3ZSCNCBqHYakQEHb (version 2). A copy is in `.claude/plans/room-placement-guide-mockup/mockup-v2.html`. Open it in a browser, or publish it again, to see the target. The mockup has a simple copy of the core formulas. Where this plan and the mockup are different, this plan is correct.

## 1. Goal

1. The count of stamps comes from **one** calculation, which the user chooses. Coverage is one of the calculations ("By coverage"). It no longer adds to the amount count.
2. The distances to walls and between stamps change only the **positions** of the stamps. They never change the count. When the stamps do not fit, MepApp shows a warning.
3. The rule editor becomes a six-step guide with a live sample room: Stamp, Rooms, Amount, Spacing, Layout, Check and place.

## 2. Decisions (user, 2026-10-09)

- Each calculation card has an explanation that the user sees on hover or on focus. It explains each symbol (for example **a** = amount per person, **b** = amount per m² floor area).
- New calculation **Per person**: a × persons.
- New calculation **By coverage**: max spacing, max distance to a wall, max area per stamp. The other calculations do not use coverage limits.
- The old **Coverage** tab becomes **Spacing**: min distance to the walls and min distance between stamps. These change only the positions. The UI warns when the stamps do not fit.
- **Persons are rounded down**: 12 m² at 5 m² per person gives 2 persons, because a third person does not fit in the remaining 2 m².
- **Units from a list** for every calculation, so a user can choose the units of the country or region.
- **Grid styles**: Spread last row (today's grid), Aligned columns (an incomplete row keeps the columns, so a cell can stay empty), Staggered (rows stay aligned, and each second row moves half a cell).

## 3. Decisions made in this plan (the user can change them)

- **Min distance between stamps is a check only.** The layouts keep their pattern (grid, walls, even spread). MepApp does not push stamps apart. When two stamps are too close, the row gets a warning with an estimate of how many stamps fit. The distance is measured from stamp center to stamp center.
- **By coverage counts with the real room shape.** It uses `layoutCoverage` from Phase 6 (add stamps until each room sample and each corner is inside a circle). The bounding-rectangle grid count (`coverageCount`, `coverageGridShape`) leaves the count rules. In an L-shaped room, the bounding-rectangle count gives too many stamps.
- **The Coverage layout leaves the layout list.** By coverage selects Even spread, and Even spread then uses the positions that the coverage calculation found. With By coverage and another layout, MepApp places the stamps in that pattern and checks the coverage. If part of the room is not covered, the row gets the warning "coverage not met in part of the room".
- **Along the walls no longer sets its own count** from the wall length ÷ spacing (a Phase 6 rule). The count comes from the calculation, and the layout only spreads the stamps along the walls. A "per wall length" calculation can come later (§7).
- **Old rules keep their coverage data.** A stored rule with an amount and coverage limits keeps the limits in its data, but they no longer change the count. The editor shows a note on such a rule. If the user changes the rule to By coverage, the old limits fill the boxes. This applies to the supply air example (4 m spacing) and the lighting example (3.6 m spacing) in the stored libraries.
- **Unit conversion only where a room value is used.** The amount unit (dm³/s, l/s, m³/h, cfm, W, …) is a label: the capacity per stamp uses the same unit, so MepApp converts nothing. MepApp converts only where it multiplies a room value:
  - floor area in m² or ft² for "per area";
  - air changes: n × volume (m³/h) to the chosen flow unit;
  - lighting: lx with m², or fc with ft²;
  - By coverage: lengths in m or ft, area in m² or ft².

  Room geometry stays in metres inside the core.

## 4. Data model changes

```ts
type PlacementPreset = 'perArea' | 'perPerson' | 'perPersonArea' | 'airChanges' | 'fixed' | 'lighting' | 'coverage' | 'custom';
type LayoutStrategy = 'center' | 'grid' | 'evenSpread' | 'perimeter';          // 'coverage' removed

interface PlacementAmount {
  // ...fixed, perM2, perPerson, perM3, minimum, unit (unchanged)
  /** The area that perM2 uses. Absent = 'm2'. */
  areaUnit?: 'm2' | 'ft2';
}
interface LightingInputs { /* lux, UF, MF */ illuminanceUnit?: 'lx' | 'fc' }  // fc uses ft²
interface CoverageLimits { maxSpacing?: number; maxAreaPerElement?: number; maxWallDistance?: number; /** Absent = 'm' (m and m²). */ lengthUnit?: 'm' | 'ft' }
interface PlacementLayout {
  strategy: LayoutStrategy;
  wallOffsetM: number;          // "min distance to the walls" in the UI (unchanged meaning)
  /** Min distance between two stamp centers, m. A check only. */
  minSpacingM?: number;
  /** Grid only. Absent = 'spread'. */
  gridStyle?: 'spread' | 'aligned' | 'staggered';
  rotation: 'room' | 'fixed';
  fixedAngleDeg?: number;
}
```

- With `lengthUnit: 'ft'`, the coverage fields hold feet and ft², so their names lose the unit suffix: `maxSpacing`, `maxAreaPerElement`, `maxWallDistance`. `parsePlacementRules` also reads the old names `maxSpacingM`, `maxAreaPerElementM2` and `maxWallDistanceM`.
- `RoomRequirement.coverageCount` and the warning `countByCoverage` are removed. A new field `countSource: 'amount' | 'coverage' | 'onePerRoom'` tells the UI which calculation gave the count. The UI uses it for the "Why N stamps?" box.
- New layout warnings: `tooClose` ("stamps closer than the min distance"), with `fitEstimate?: number` on the row layout. `coverageNotMet` stays.
- The rules are a user library in `localStorage` (`mepapp.placementRules.v1`), not part of the drawing, so there is no schema bump. `parsePlacementRules` migrates old entries (§5 Phase A, step A4).

## 5. Phases

Each phase ends with tests (core: vitest), `pnpm build`, `pnpm typecheck`, and a browser check of the UI wiring through real DOM inputs ([[verify-ui-wiring-via-real-dom-not-scene-api]]).

### Phase A — Core: count model, units, spacing, grid styles

STATUS: not started.

- **A1. Persons rounded down.**
  - Change `roomPeople`: `floor(area ÷ areaPerPerson + 1e-9)`, at least 0.
  - Update the doc comments in `room-values.ts` and `room.ts`.
  - Update the Room Properties hint ("rounded down", `RoomProperties.tsx:124`).
  - Update the Phase 2 rounding tests. The Excel "People" column follows without a code change.
  - Test the user's example: 12 m² at 5 m² per person gives 2.
- **A2. New presets.**
  - Add `perPerson` (fields perPerson, minimum) and `coverage` (no amount fields, no capacity) to `PLACEMENT_PRESET_LABELS` and `PRESET_AMOUNT_FIELDS`.
  - Add a short explanation per preset: `PLACEMENT_PRESET_HELP` (a formula and one line per symbol). The UI tooltips use it.
- **A3. One source for the count.**
  - `calculateRoomRequirement`:
    - For the presets other than coverage, the count is ceil(required ÷ capacity). Without a capacity it is 1. Then the min count and the max count apply. Coverage limits are not read.
    - For `coverage`: required = null, count = null, `countSource: 'coverage'`. The count needs the geometry.
  - `planAutoPlacement`/`layoutRoomStamps`:
    - For `coverage`, run `layoutCoverage` (start = max(ceil(area ÷ max area), min count, 1), at most the max count). This gives the count. With Even spread it also gives the positions.
    - With another layout, MepApp places that pattern with the count and checks the coverage. A gap gives `coverageNotMet`.
    - Replace `withLayoutCount` with this path. Remove the Along-the-walls count from spacing.
  - Remove `coverageCount` and `coverageGridShape` from the count, and remove `countByCoverage`. Grep the UI for each use: `AutoPlaceDialog.tsx:306` uses `coverageCount` in a tooltip.
  - `validatePlacementRule`: a `coverage` rule needs at least one coverage limit. A rule of another preset ignores its limits.
- **A4. Migration of stored rules (`parsePlacementRules`).**
  - `layout.strategy: 'coverage'` with no amount → preset `coverage`, layout `evenSpread`.
  - `layout.strategy: 'coverage'` with an amount → keep the preset, layout `evenSpread`.
  - Coverage limits on a rule of another preset stay in the data (the editor shows a note, §3).
  - A stored `layout.wallOffsetM` keeps its meaning.
  - Update `PLACEMENT_RULE_EXAMPLES`: the smoke detector becomes preset `coverage`. The supply air and lighting examples lose their coverage limits.
  - Tests: one old JSON entry per case.
- **A5. Units.**
  - New core file `rooms/placement-units.ts`. It holds the lists for the UI (`AMOUNT_UNITS` = dm³/s, l/s, m³/h, m³/s, cfm, W, kW; `AIR_CHANGE_UNITS` with factors from m³/h; area m²/ft²; illuminance lx/fc; length m/ft) and the conversion functions.
  - Factors:
    - 1 ft = 0.3048 m (exact);
    - 1 ft² = 0.09290304 m²;
    - 1 cfm = 1.69901082 m³/h;
    - 1 dm³/s = 1 l/s = 3.6 m³/h.
  - `calculateRoomRequirement` uses `areaUnit`, the air-change unit (from `amount.unit`) and `illuminanceUnit`. `layoutCoverage` gets its radius in metres from `coverageRadiusM` after the length conversion.
  - Validation: an air-changes rule needs a unit from `AIR_CHANGE_UNITS`. A free-text unit stays allowed for the other presets, so old rules still load. The UI shows the free text as "Other: <text>".
  - Tests: each factor, an air-changes rule in cfm, a lighting rule in fc, a per-area rule in ft², and a coverage rule in ft.
- **A6. Spacing check.**
  - After each layout, measure the center-to-center distance of every pair in the room.
  - Pairs closer than `minSpacingM` give `tooClose`. `fitEstimate` comes from a greedy pass over the valid room samples: keep a sample when it is at least the min distance from every kept sample. The UI says "about N".
  - A room where the wall offset leaves no valid sample keeps the existing `noFit` warning.
  - The check never changes the count or the points.
  - Tests: two stamps in a 3 m room with 4 m min distance, an estimate in a rectangle, no warning when the distance is met.
- **A7. Grid styles.**
  - `gridCells` gets the style:
    - **spread** (today): the last row spreads over the full length.
    - **aligned**: the k stamps of a short row take the columns round((i + 0.5) · cols ÷ k − 0.5). This is symmetric, so 2 of 3 columns use columns 1 and 3.
    - **staggered**: row r moves by −¼ cell (even r) or +¼ cell (odd r) along the row. The short row also uses the aligned columns. With one row it is the same as aligned.
  - The style works in the frame of the room's main axis, so a rotated room works.
  - Tests: 5 stamps in 3 × 2 for each style, a rotated rectangle, and an L-shape with a point moved inside.
- **A8. Keep the current UI working** (minimal changes, the guide comes in Phase B):
  - the new presets are in the Calculation select;
  - the Coverage section shows only for By coverage;
  - unit selects for each preset;
  - the Layout select has no Coverage, and it gets a Grid style select;
  - a "Min distance between stamps" box;
  - the note on old coverage limits;
  - the `AutoPlaceDialog` notes and tooltips without `coverageCount`.

  Update `LAYOUT_HINTS` in `PlacementRulesDialog.tsx`.

Verification for Phase A: core tests (new and updated), all package tests, build, typecheck. Browser check on `01_arch_first_floor.pdf` at 1:50:
- an old stored library loads and migrates (smoke → By coverage);
- a per-person rule with 5 m² per person gives floor(area ÷ 5) persons in the table;
- By coverage places stamps that cover each room;
- 4 m min distance gives the warning;
- the three grid styles give different positions;
- a cfm air-changes rule gives the converted amount.

### Phase B — The guide: steps 1–3 and the sample room

STATUS: not started.

- New `PlacementRuleGuide.tsx` (ui). Menu › Placement rules… keeps the rule list. Edit and New open the guide for one rule. The guide has the step list on the left and the step in the middle. The sample-room panel is on the right, and the layout stacks on a narrow window. Save and Revert stay (a draft rule, as today).
- **Sample room panel** (`RulePreviewPlan.tsx`):
  - An SVG drawing of one real room of the shown page: the outer ring and the holes in page points, the wall offset band, the dimension lines of the bounding rectangle, and the stamps as outlines. Use the definition's size and its thumbnail image when it has one.
  - "Whole floor" draws all rooms of the page and colours them: matches, does not match, no room type, missing data.
  - A click on a room makes it the sample room.
  - The panel computes only the sample room on each change (one `planAutoPlacement` call with one room). The full page is computed only in step 6 and on "Whole floor", with a debounce of about 300 ms.
- **"Why N stamps?" box**: the calculation row from `countSource` (amount ÷ capacity, rounded up, or the coverage circles), the min count and max count rows when set, the result row, and the amount per stamp.
- **Step 1 Stamp**: name, discipline, stamp from the existing `StampPickerDialog`.
- **Step 2 Rooms**: room-type chips with the room count of the page; "Name contains" under "More filters". A callout for rooms with no type, with a select that calls `scene.setRoomType` (one undo step).
- **Step 3 Amount**:
  - calculation cards with an info tip from `PLACEMENT_PRESET_HELP`;
  - unit selects;
  - formula lines with the symbol tags and the values of the sample room;
  - capacity per stamp, and the count limits.
  - A "Room data this calculation needs" checklist: floor area (calibration of the page), persons, and ceiling height (only for air changes).
  - Inline fixes:
    - the area per person per room type writes to the room-type library (`roomTypeStorage`), the same as the Room types dialog;
    - the drawing ceiling height uses `scene.setDrawingCeilingHeight`.
- New small `InfoTip` component (hover and keyboard focus, `role="note"`, it closes on Escape without closing the dialog: [[project-dialog-escape-listener-conflict]]).

Verification: browser check with real DOM inputs. The tip opens on hover and on focus. Each preset shows its fields. A unit change updates the totals. The sample room follows a click on the plan. The area-per-person fix updates the persons. The room-type fix is one undo step. Save stores the rule.

### Phase C — The guide: steps 4–6

STATUS: not started.

- **Step 4 Spacing**:
  - min distance to the walls (`wallOffsetM`) and min distance between stamps (`minSpacingM`), each with a small diagram;
  - circles on the sample room that turn red when they overlap;
  - "Check of all rooms": one line per matched room ("3 stamps fit", or "2 stamps do not fit: about 4 fit with this distance").
  - The step shows red in the step list when a room fails.
- **Step 5 Layout**: cards with a small picture per layout (drawn with the core layout functions on a fixed L-shaped room). Grid shows the three style cards with 5 stamps. Rotation is the last setting. The step shows a callout for "coverage not met" and for the Center fallback.
- **Step 6 Check and place**: the table of the matched rooms of this rule (the `AutoPlaceDialog` row logic: existing, replace, moved, notes), the "Whole floor" preview, and Place / Undo through the existing scene calls (`autoPlaceStamps`, one undo step). The existing Auto-place dialog stays for running many rules at once.
- Remove the old flat rule form when the guide covers every field. Keep import and export in the rule list.

Verification: the full browser check from step 1 to Place on `01_arch_first_floor.pdf` at 1:50:
- a supply-air rule (per person + per area);
- a smoke-detector rule (By coverage);
- a wall-grille rule (Along the walls).

Check each count against a hand calculation, the spacing warning, the grid styles on the canvas, one Undo, and save and reload. Measure the time of one keystroke in step 3 with the fixture. The target is under 100 ms for the sample room.

## 6. Risks

- **Speed.** Coverage on all rooms takes about 0.8 s (Phase 6 measurement). The guide must compute only the sample room while the user types (Phase B).
- **Behaviour change for saved drawings.** Persons and counts change for existing rules: rounding down, and no coverage in amount rules. Placed stamps do not change until the user places again. The re-run (Phase 5) then replaces unmoved stamps with the new count. Say this in the release note.
- **Two editors for a while.** Phase A changes the old form, and Phase C removes it. Keep Phase A's form changes small.

## 7. Open points (not in this plan)

- A "per wall length" calculation (for example 1 grille per 2 m of wall), as a replacement for the Phase 6 wall-length count.
- Layouts that move stamps to meet the min distance (today it is a check only, §3).
- The open gaps of `room-auto-placement.md` stay open: stamps not tied to a page, a deleted auto-placed stamp is placed again on a re-run, doors and windows (Phase 7).
