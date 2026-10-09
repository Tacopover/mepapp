# Automatic stamp placement in rooms — plan

Status: **Phase 0 done 2026-10-09 (branch `worktree-room-placement-phase0`, not merged). Phase 1 done 2026-10-09 (branch `worktree-room-placement-phase1`, built on Phase 0, not merged). Phase 2 done 2026-10-09 (branch `worktree-room-placement-phase2`, built on Phase 1, not merged). Phase 3 done 2026-10-09 (branch `worktree-room-placement-phase3`, built on Phase 2, not merged). Phase 4 done 2026-10-09 (branch `worktree-room-placement-phase4`, built on Phase 3, not merged). Phases 5-8 not started.** Follows [[room-detection]] (its Phase 9 "Element-to-room assignment and per-room calculations" is replaced by this plan). The next plan after this one is routing from main equipment to the placed stamps. This plan does not cover routing.

## 1. Goal

The user selects rooms and one or more placement rules. MepApp calculates how many elements each room needs and places the stamps in the rooms. The user sees a preview first. The user can then apply the result as one undo step.

MepApp does not build in the rules of a country. The user enters the numbers (airflow per m², lux, spacing) in form fields. MepApp supplies the room values and the geometry: counts, grids, spacing, wall offsets and orientation.

All calculations follow the same four steps:

1. **Room values:** area, height, volume, perimeter, length and width, room type, number of people.
2. **Required amount:** for example an airflow, a light output or a fixed number of elements.
3. **Count:** required amount ÷ capacity of one element, and a coverage limit (max spacing, max area per element). The larger count wins.
4. **Layout:** the count is placed in the room polygon by a layout strategy (center, grid, even spread, coverage, perimeter).

## 2. Decisions already made (user, 2026-10-09)

- **Room type from name matching.** MepApp matches the room name (and the label `details`) against keywords of each room type. When no keyword matches, the room has no type, and the user selects one.
- **Ceiling height has four levels.** Global → per PDF → per room type → per room. Each level overrides the level before it. The global value is required. The other levels are optional.
- **Rules live in the user library,** not in the PDF. The same applies to the room types (see §4.1).
- **Form fields, no formulas** in the first version. A formula field (with the expression engine) is a later option (Phase 8).

- **Confirmed plan choices (user, 2026-10-09):** room-type heights stored per PDF; the PDF keeps a copy of the room types it uses; a calibration per page; a stamp that does not fit goes at the label point with a warning.

## 3. Findings from the code survey (2026-10-09)

Check each line number before you depend on it.

- `Room` is at `packages/core/src/rooms/room.ts:15-37`. It has `name`, `number`, `details?`, `properties?` (custom room properties) and `pageIndex`. The area is derived (`roomAreaM2(room, calibration)`, `room.ts:61`). The area is not saved.
- `roomsAtPoint`, `roomLabelPoint` and `polygonContainsPoint` are in `room.ts`. `roomLabelPoint` gives a good inside point for concave rooms. It is the starting point for the Center layout.
- Room polygons and placed stamps use the same space (displayed page space, PDF points). Proof: the fill-room click passes the world point straight to `roomsAtPoint` (`packages/render/src/scene.ts:2761`).
- `ProjectDocument` (`packages/core/src/project.ts:19-44`) is the data of one PDF. `CURRENT_SCHEMA_VERSION = 13` (`project.ts:17`). "Per PDF" values therefore go into `ProjectDocument`.
- **The calibration is not saved.** `SketchDocument.calibration` (`packages/render/src/document.ts:108`) is not part of `ProjectDocument`. It is one value per document, not per page: `calibrateTool.ts:40` and `scene.ts:2100` are the only writers, and a page change does not reset it. After a reload the user must calibrate again. Auto-placement needs a calibration (metres to page points), so this gap blocks a good workflow. See Phase 0.
- User-level data today lives in `localStorage` with a versioned key: custom property definitions (`mepapp.customProperties.v1`, `packages/ui/src/App.tsx:150-168`) and custom schematic templates (`loadCustomTemplates` / `saveCustomTemplates`, `App.tsx:369-373`). `SettingsStore` exists in `@mepapp/platform` but the app does not use it yet. The `LibraryStore` (IndexedDB) holds stamps only.
- `StampDefinition` (`packages/core/src/stamp-library.ts:16-34`) has **no capacity field**. The capacity of a placed terminal is in `ProjectDocument.terminalCapacities` (by stamp id), set with `SketchScene.setTerminalCapacity` (`scene.ts:2519`). The flow solve reads it. A rule must therefore hold "capacity per element" itself.
- `PlaceStampTool.placeStamp` (`packages/render/src/tools/placeStampTool.ts:46-90`) shows what one placement does: new id from `nextStampSeq`, adopt the definition, copy the ports, build the sprite, add the definition's port groups. `SketchScene.pasteClipboard` (`scene.ts:4338`) adds many stamps as **one** undo step with a `Transaction`. Auto-placement copies both patterns.
- The scene takes art as an `ImageBitmap` from the UI (`replaceSelectedStamps(definition, bitmap)`, `scene.ts:2435`). The UI makes the bitmap with `loadDefinitionBitmap` (`packages/ui/src/stampBitmap.ts`).
- `mergeDetectedRooms` (`room.ts`) keeps `locked` rooms when detect-all runs again. Re-running a rule uses the same idea (§4.5).
- `packages/core/src/schematic-expression.ts` is an expression engine (paths, `+ - * /`, `sum()`, `count()`). It is not needed for the form fields. It is the base for Phase 8.
- `buildRoomExportTable` (`packages/core/src/rooms/export.ts`) builds the Excel table. New room values go there as new fixed columns.
- `RESERVED_ROOM_PROPERTY_NAMES` (`packages/core/src/custom-properties.ts:59`) must get the new field names (room type, ceiling height, volume, perimeter, people).
- No room type exists anywhere in the code today.

## 4. Data model

### 4.1 Room types (user library)

```ts
interface RoomType {
  id: string;               // stable slug or UUID
  name: string;             // "Toilet"
  nameNl?: string;          // "Toilet"
  /** Lower-case keywords; a room matches when its name or details contain one as a whole word. */
  keywords: string[];       // ["toilet", "wc", "invalidetoilet", "sanitair"]
  /** Floor area per person, m². Used to calculate the number of people. Absent = no people. */
  areaPerPersonM2?: number;
  color?: string;           // overlay tint, later
}
```

- MepApp ships a seed list (NL and EN keywords, because the test drawings are Dutch). Seed types: office, meeting room, classroom, corridor, entrance/hall, stairs, toilet, bathroom, kitchen/pantry, storage, technical room, meter cupboard, changing room, living room, bedroom. The user can edit, add and delete types.
- Storage: `localStorage` key `mepapp.roomTypes.v1`, same pattern as `mepapp.customProperties.v1`. Import and export as a JSON file.
- **The PDF keeps a copy of each room type it uses** (`ProjectDocument.roomTypes`), the same as `networkTypes` and `circuitTypes`. Reason: a PDF opened on another computer must still show the type names. On load, a type that is missing from the user library shows as "from this file". The user can add it to the library. Note the network-type trap ([[network-type-adoption-gotcha]]): the copy must be made at the moment a room gets the type, not later.

### 4.2 New room fields (in the PDF)

```ts
interface Room {
  // ...existing fields
  roomTypeId?: string;
  /** 'matched' = set by keyword matching, may change on a new match; 'user' = chosen by the user, never changed by matching. */
  roomTypeSource?: 'matched' | 'user';
  /** Room-level override, mm. */
  ceilingHeightMm?: number;
  /** Room-level override of the number of people. */
  people?: number;
}
```

### 4.3 Ceiling height chain

| Level | Stored in | Field |
|---|---|---|
| Global (required) | user settings, `localStorage` `mepapp.settings.ceilingHeightMm.v1`, default 2700 | — |
| Per PDF | `ProjectDocument` | `ceilingHeightMm?: number` |
| Per room type | `ProjectDocument` | `roomTypeCeilingHeightsMm: Record<roomTypeId, number>` |
| Per room | `Room` | `ceilingHeightMm?` |

The room-type height is stored per PDF, not in the user library, because a ceiling height belongs to a building. The type "toilet" can have 2.4 m in one building and 2.6 m in another. If the user wants a library default per room type, that can be added later as an extra level between "global" and "per PDF".

A core function returns the value **and** its level:

```ts
function resolveCeilingHeight(room, ctx): { mm: number; level: 'global' | 'pdf' | 'roomType' | 'room' }
```

The Properties panel shows the level next to the value ("2.40 m — from room type Toilet"). The user can then see which level to change.

### 4.4 Placement rules (user library)

A rule is one form. Fields:

| Group | Field | Notes |
|---|---|---|
| General | name, discipline | |
| Which rooms | room types (multi-select), optional "name contains" text | empty = all selected rooms |
| Which stamp | stamp definition id | library, user or custom stamp |
| Required amount | `fixed` + `perM2` × area + `perPerson` × people + `perM3` × volume | four number fields, each optional; one unit text field (for example "dm³/s", "W", "lm") |
| | minimum amount per room | for example "at least 7 dm³/s" |
| | calculation preset | fills the fields: "Per area", "Per person + per area" (EN 16798 / ASHRAE 62.1 shape), "Air changes per hour", "Fixed per room", "Lighting (lumen method)" |
| Lighting preset only | design lux E, utilisation factor UF, maintenance factor MF | amount = E × area / (UF × MF), in lm |
| Capacity | capacity per element (same unit) | empty = no quantity count |
| Coverage | max spacing (m), max area per element (m²), max distance to a wall (m) | each optional |
| Count limits | min count, max count per room | |
| Layout | strategy: center / grid / even spread / coverage / perimeter | Phase 4 has center and grid only |
| | offset from walls (m) | |
| | rotation: align to the room / fixed angle | |
| Output | write capacity to placed stamps | each stamp gets `required ÷ count` in `terminalCapacities`, so the flow solve and the later routing get correct values |

Count = max(quantity count, coverage count), limited by min and max count. Quantity count = ceil(required ÷ capacity). Coverage count comes from the layout (the smallest grid that meets the spacing and wall-distance limits).

Storage: `localStorage` key `mepapp.placementRules.v1`, import and export as JSON. MepApp ships a few example rules that say "example" in the name. They are not standards.

### 4.5 Link between a placed stamp and its rule

```ts
interface PlacedStamp {
  // ...existing fields
  /** Set when auto-placement made this stamp. `moved` = the user moved, rotated or deleted-and-undid it; a re-run keeps it. */
  autoPlaced?: { ruleId: string; roomId: string; moved: boolean };
}
```

Re-running a rule on a room removes the stamps with the same `ruleId` + `roomId` and `moved: false`, and places new ones. Stamps with `moved: true` stay. They count toward the room's total. This is the same idea as `locked` rooms in `mergeDetectedRooms`.

## 5. Phases

Each phase ends with tests (core: vitest), `pnpm build`, `pnpm typecheck`, and a browser check of the UI wiring through real DOM inputs ([[verify-ui-wiring-via-real-dom-not-scene-api]]).

0. **Save the calibration in the PDF.** STATUS 2026-10-09: DONE (`bbc1498`, branch `worktree-room-placement-phase0`, not merged). One calibration per page (user confirmed 2026-10-09): `ProjectDocument.calibrations: Record<string, Calibration>` keyed by the 0-based page index, schema 13 → 14 (migration gives `{}`), validator rejects a key that is not a page index and a factor that is not a positive number. `SketchDocument.calibrations` (a `Map`) plus a `calibration` getter/setter for the shown page, so the existing readers did not change. `SketchScene.getCalibration(pageIndex?)`; `labelRooms` and `planRoomOverlaps` use the calibration of their own page. A scale change (scale picker or calibrate tool) now marks the document unsaved. The UI re-reads the calibration on page change and after a project load. `buildRoomExportTable` accepts a function per page; the Excel export uses it. Behaviour change: a page without its own calibration is now "Not set", also when another page of the same PDF is calibrated. Verified: core tests 683 pass (new: v13 load, bad calibrations, export per page), `pnpm build` 9/9, `pnpm typecheck` 16/16; browser check (Playwright, real scale picker, page buttons and Menu > Save on a two-page PDF made from `arch_simple_A4.pdf` + `01_arch_first_floor.pdf`): page 1 1:100 and page 2 1:50 stay separate, the document becomes unsaved, both values come back after a reload, all 12 checks pass, no page errors. Not verified in the browser: the two-point calibrate tool path (same setter, plus `markDirty`), and the Excel export per page (unit test only).
1. **Room types and name matching.**
   - Core: `RoomType`, seed list, `matchRoomType(name, details, types)` (whole-word match, longest keyword wins, case- and accent-insensitive), tests with the room names of the 10A and w_rooms PDFs (local-only fixtures, [[fixture-pdfs-gitignored]]). Report the match rate.
   - Schema: `Room.roomTypeId`, `roomTypeSource`; `ProjectDocument.roomTypes` (copy). Migration.
   - Matching runs after detect-all, after click-fill, and after a rename. It only changes rooms with `roomTypeSource !== 'user'`.
   - UI: room type dropdown in Room Properties ("No type" is visible as a warning). "Room types" manager dialog (list, keywords, m² per person, import/export). Room type column in the Excel export.
   - STATUS 2026-10-09: DONE (`4d64315`, branch `worktree-room-placement-phase1`, not merged). What was built:
     - Core `rooms/room-type.ts`: `RoomType`, `ROOM_TYPE_LIBRARY` (20 types, no design values), `matchRoomType`, `applyRoomTypeMatch`, `parseRoomTypes`, `parseRoomTypeKeywords`, `validateRoomTypeFields`, `roomTypeLabel`.
     - **Matching rule (changed from the plan's "whole word, longest wins"):** a keyword matches a word that starts or ends with it, so Dutch compounds match ("toilet" → "toiletruimte", "trappenhuis" → "vluchttrappenhuis"); a keyword of 3 letters or less must be the whole word ("mer" must not match "kamer"); a keyword in the middle of a word does not match ("server" in "reservering"). The keyword on the earliest word wins ("Opslag onderwijsmateriaal" is storage, not classroom), then the longest keyword ("lifthal" is a hall). The name is tried first, then the label details.
     - Match rate on the fixture labels with the built-in list: 10A 31/34, 00_arch_ground_floor_w_rooms 42/47, Example_2 40/45, Example_3 36/38, 01_arch_first_floor 30/43 (179/207). Misses are mostly not room types ("Bestek", "Casco", "Space", a typo "Werplek", note text) plus "Repro", "EHBO/kolf", "Ankerpunt", "Kast", "automation room", "gassen-ruimte".
     - Schema 15: `Room.roomTypeId?`, `Room.roomTypeSource?` (`'matched' | 'user'`), `ProjectDocument.roomTypes` (migration gives `[]`). `updateRoom` locks the room for `roomTypeSource: 'user'`, and a patch key set to undefined now removes that field.
     - Scene: `setRoomTypeLibrary`, `getRoomTypes()` (library + file-only types with `inLibrary: false`), `setRoomType(ids, id | null | 'auto')` (one undo step), `matchRoomTypesAgain()` (one undo step). Matching runs in `addRoom` (click-fill), `applyDetectedRooms` (detect-all) and `updateRoom` when the name changes. Split and merge carry the type. A save writes the used types as the library has them now. A library type that is deleted while rooms use it stays as a copy in the document.
     - Decision (not in the plan): the library entry wins over the file copy when both exist, so a library edit shows at once. The file copy is only a fallback.
     - UI: `roomTypeStorage.ts` (`mepapp.roomTypes.v1`; the built-in list when nothing is stored), Menu › Room types… (`RoomTypesDialog.tsx`: list, form, "Only in this drawing" section with add, Import…, Export…, Match rooms again), Room Properties "Room type" select (By name: <match>, No type, each type; also for a multi-selection), Excel "Room type" column after Name.
   - Verified: core tests 723 pass (40 new: fixture-name matching, rules, parsing, export column, schema 15, lock rule), `pnpm build` 9/9, `pnpm typecheck` 16/16. Browser check (Playwright, real DOM, `01_arch_first_floor.pdf` at 1:50): detect-all typed 30 of 38 rooms; the select shows "By name: Toilet"; choosing Storage locks and keeps the type through a rename; "By name" re-matches; Undo restores; a new keyword plus "Match rooms again" types "Repro"; the library is stored; a deleted used type stays as "Only in this drawing"; save + reload keeps every room's type and the file copy. 16/16 checks, no page errors.
   - Not done / open: rooms in a file saved before Phase 1 get no type until the user presses "Match rooms again" (no automatic match on load); no "restore built-in types" button; the canvas room label does not show the type; the Dutch name is used only when the label language is Dutch.
2. **Room values and ceiling height.**
   - Core: `roomPerimeterM`, `roomMinBoundingRect` (minimum-area rectangle: convex hull + rotating calipers; gives length, width and main axis), `resolveCeilingHeight`, `roomVolumeM3`, `roomPeople` (room override, else area ÷ `areaPerPersonM2`, rounded up).
   - Schema: `ProjectDocument.ceilingHeightMm?`, `roomTypeCeilingHeightsMm`, `Room.ceilingHeightMm?`, `Room.people?`.
   - UI: global height in Settings. PDF height and room-type heights in a "Building values" section (Rooms toolbar or Drawings panel — decide when building). Room Properties shows height with its level, volume, perimeter, length × width, people.
   - Excel export: new fixed columns.
   - STATUS 2026-10-09: DONE (`7e46363`, branch `worktree-room-placement-phase2`, not merged). What was built:
     - Core `rooms/room-values.ts`: `resolveCeilingHeight` (room → room type → drawing → global, a value that is not a positive number is skipped), `roomPerimeterM` (outer ring plus holes), `roomMinBoundingRect` (convex hull + one candidate per hull edge; length, width, main axis in [0, 180) degrees, page space y down), `roomVolumeM3`, `roomPeople` (room value, else area ÷ area per person rounded up), `computeRoomValues` (scale values are null without a calibration), `CEILING_HEIGHT_LEVEL_LABELS`, `DEFAULT_CEILING_HEIGHT_MM` = 2700.
     - Schema 16: `ProjectDocument.ceilingHeightMm?`, `roomTypeCeilingHeightsMm` (migration gives `{}`, validator: positive numbers), `Room.ceilingHeightMm?`, `Room.people?`. A ceiling height or people edit locks the room. Split gives both pieces the height; merge takes the height of the room that gives the name.
     - Scene: `setGlobalCeilingHeight`, `getCeilingHeights`, `setDrawingCeilingHeight`, `setRoomTypeCeilingHeight` (not undoable, like the calibration; they mark the drawing unsaved), `getRoomValues(room)`, `setRoomValues(ids, patch)` (one undo step).
     - UI: Settings › Rooms › "Default ceiling height (mm)" (`mepapp.settings.ceilingHeightMm.v1`, 1000-30000). Menu › Ceiling heights… (`CeilingHeightsDialog.tsx`): drawing height and one box per room type with its room count; an empty box uses the level above. Room Properties: perimeter, length × width, ceiling height box (placeholder = inherited value) with a level hint, volume, people box with a hint; for a multi-selection a shared height box, total volume and total people. `OptionalNumberInput.tsx`: an empty box removes the value.
     - Excel: new columns after Area: Perimeter (m), Length (m), Width (m), Ceiling height (mm), Ceiling height from, Volume (m³), People. `RESERVED_ROOM_PROPERTY_NAMES` has the new names.
   - Verified: core tests 746 pass (23 new: chain levels, perimeter with a hole, rotated and L-shaped bounding rectangles, people rounding, values without calibration, lock rule, schema 16 load/validate, export columns), all package tests pass, `pnpm build` 9/9, `pnpm typecheck` 16/16. Browser check (Playwright, real DOM, `01_arch_first_floor.pdf` at 1:50): Settings default 2700 → 2800 shows at once and is stored; drawing 3000 and toilet type 2400 in the dialog give the correct level per room; a room value 2500 wins, locks the room, changes the volume, and Undo removes it; people refuses 1.5; area per person 4 m² gives ceil(area ÷ 4); a two-room selection sets both heights in one undo step; save + reload keeps the drawing, type and room values. 22/22 checks, no page errors.
   - Not done / open: the drawing and room-type heights have no undo; the Excel columns are checked by a unit test only (no browser export); the canvas label does not show the values.
3. **Placement rules: model, editor and dry run.**
   - Core: `PlacementRule`, validation, `calculateRoomRequirement(rule, roomValues)` → `{ required, quantityCount }`. Tests for every preset with hand-calculated numbers.
   - UI: "Placement rules" dialog (list + form). Import and export JSON. Example rules.
   - Dry run: select rooms → table with room, type, area, volume, people, required amount, capacity, count. No stamps yet. The user can check the numbers before any geometry exists.
   - STATUS 2026-10-09: DONE (`ef14655`, branch `worktree-room-placement-phase3`, not merged). What was built:
     - Core `rooms/placement-rule.ts`: `PlacementRule` (the §4.4 fields; `stampDefinitionId` may be null; `layout.rotation` is `'room' | 'fixed'` plus `fixedAngleDeg`), `ruleAppliesToRoom`, `coverageCount`, `calculateRoomRequirement` → `{ required, quantityCount, coverageCount, count, perElement, warnings }`, `calculateRooms` (dry-run rows + rooms without a rule), `validatePlacementRule`, `parsePlacementRules`, `PLACEMENT_RULE_EXAMPLES` (5 rules, "(example)" in the name), preset and layout labels.
     - **Count rules (decided while building):** required = fixed + perM2·A + perPerson·P + perM3·V + lighting (E·A ÷ (UF·MF)), at least the minimum. Count = max(ceil(required ÷ capacity), coverage count, min count), at most the max count. A rule without a capacity and without coverage limits places 1 per room. A coverage grid per axis: n = 1 when L ≤ 2d, else ceil((L − 2d) ÷ s) + 1, with d = max wall distance (default s ÷ 2), over the bounding rectangle; the larger of that and ceil(area ÷ max area) wins. Counts use a 1e-9 tolerance before rounding up. Warnings: no calibration, no number of people, max count reached, count set by coverage. The dialog also shows "room needs review" and "no room type".
     - UI: `placementRuleStorage.ts` (`mepapp.placementRules.v1`; the examples when nothing is stored). Menu › Placement rules… (`PlacementRulesDialog.tsx`: list, form per §4.4 with fields per preset, room type checkboxes, stamp from the existing `StampPickerDialog` stacked on top, Import…, Export…, Duplicate). The layout list offers Center and Grid; the other strategies show "(later)". Menu › Room calculations… (`RoomCalculationsDialog.tsx`: scope selected / page / all, a checkbox per rule, a table with room, type, area, volume, people, rule, required, capacity, count, notes).
   - Verified: core tests 772 pass (26 new: one case per preset with hand-calculated numbers, coverage grid and area, min/max, warnings, matching, validation, parsing, dry run), all package tests pass, `pnpm build` 9/9, `pnpm typecheck` 16/16. Browser check (Playwright, real DOM, `01_arch_first_floor.pdf` at 1:50): 5 examples listed; a non-number capacity is refused; Choose… opens the picker on top and Escape closes only the picker; the picked stamp is stored; a new rule and an import are stored; the dry run gives the toilet 25 dm³/s and count 1; an office without area per person shows "no number of people"; area per person 10 m² gives the expected count; an unchecked rule leaves the table; the scope "selected" shows only the selected room; the rules survive a reload. 18/18 checks, no page errors.
   - Not done / open: the built-in room types have no area per person, so per-person rules need the user to fill it in first; the dry-run table has no Excel export; a rule's stamp is shown by id when its definition is not found (for example a drawing-only custom stamp in another drawing).
4. **Placement v1: Center and Grid.**
   - Core (pure, tested): `layoutCenter(room)`, `layoutGrid(room, count | spacing, wallOffset, axis)`. The grid uses the main axis from Phase 2, chooses rows × columns closest to the room's length/width ratio, clips points to the polygon minus holes minus the wall offset, and moves a point that falls outside to the nearest valid inside point. Coverage count for the grid. Tests on rectangles, rotated rectangles, L-shapes and rooms with holes.
   - Render: `SketchScene.autoPlaceStamps(plan, bitmaps)` adds all stamps as one `Transaction` (pattern of `pasteClipboard`), copies the ports and port groups (pattern of `placeStamp`), adopts the definition, writes `autoPlaced` and the capacities. Preview: ghost sprites in a separate layer, removed on cancel.
   - UI: "Auto-place" dialog: room selection (current selection, or all rooms of the page, filtered by type), rule selection (one or more), preview table with a warning column ("room is open", "no type", "count limited by coverage", "max count reached", "no calibration"), Apply.
   - STATUS 2026-10-09: DONE (`76a964b`, branch `worktree-room-placement-phase4`, not merged). What was built:
     - Core `rooms/placement-layout.ts`: `layoutCenter` (label point, else the nearest valid point), `layoutGrid` (cell centers in the bounding rectangle along the main axis, minus the offset; the last row may be shorter and is spread evenly; a point outside the room or too near a wall moves to the nearest valid sample of a 48 × 48 grid, kept apart from the other points), `chooseGridShape` (fewest cells, then cells closest to a square), `layoutRoomStamps` (offset = rule wall offset + half the larger stamp side; rotation = main axis or fixed angle; uses the coverage grid shape when it gave the count; Center with a count above 1 and the later strategies use Grid with the note "grid layout used"), `planAutoPlacement` (dry-run rows + stamps + notes "the rule has no stamp", "the stamp of the rule is not found", "does not fit: placed at the label point", "points moved inside the room"). `coverageGridShape` added to `placement-rule.ts`.
     - Core `PlacedStamp.autoPlaced?: { ruleId, roomId, moved }` (optional, no schema bump). Paste drops it from the copy.
     - Scene: `showAutoPlacePreview(groups)` / `clearAutoPlacePreview()` (ghost sprites at 50 % in a scene-level layer; cleared on document switch), `autoPlaceStamps(groups)` (one `Transaction`, new ids, definition ports and port groups, appearance default, adopts a non-library definition, `autoPlaced`, capacities, selects the new stamps). Exported type `AutoPlaceGroup`.
     - UI: the Phase 3 dialog became Menu › Auto-place stamps… (`AutoPlaceDialog.tsx`): the dry-run table plus a "Placed" column, Preview (hides the dialog, shows a bar with Place / Back to the table / Cancel; Escape goes back), Place N stamps. The art loads per rule stamp (a user-library stamp is materialized first). The plan follows room and page changes.
     - Decision while building: stamps have no page index in the data model, so only rooms on the shown page get stamps; rows of other pages show "on another page".
   - Verified: core tests 792 pass (20 new: grid shape, rectangles, offset, short last row, rotated room, L-shape, hole, no fit, center, wall distance, rule layout offset and rotation, fallback, coverage grid shape, count 0, plan rows), all package tests pass, `pnpm build` 9/9, `pnpm typecheck` 16/16. Browser check (Playwright, real DOM, `01_arch_first_floor.pdf` at 1:50, toilet exhaust + smoke detector rules with stamps): the Place button counts 56 stamps; the toilet gets 1; Preview shows 56 ghosts, hides the dialog and adds nothing; Escape goes back and removes the ghosts; Place adds 56 stamps, all inside their own room, the toilet stamp with capacity 25 and its rule and room; one Undo removes all 56 and Redo restores them; the "selected" scope shows one room; save + reload keeps `autoPlaced` and the capacity. 14/14 checks, no page errors.
   - Not done / open: an Undo of the placement leaves the capacities and port groups of the removed stamps in the document (the same gap as paste); the grid places cell centers, so the wall distance is offset + half a cell, not the rule's max wall distance; the PNG stamp size issue makes stamps look large ([[project-stamp-dpi-scaling-issue]]); stamps on a multi-page PDF are not tied to a page.
5. **Re-run and moved stamps.** Set `moved: true` on move, rotate and properties edits of an auto-placed stamp. Re-run replaces only unmoved stamps. "Remove auto-placed stamps" for a rule or a room. A warning when a room changed (polygon or type) after placement. Risk: moves happen in several places (drag, rotate, Properties panel, alignment snap). List all of them first.
   - STATUS 2026-10-09: DONE (`2e0da17`, branch `worktree-room-placement-phase5`, not merged). What was built:
     - Places that edit a placed stamp, all now call core `markAutoPlacedMoved`: select-tool drag move (alignment snap runs inside it) and drag rotate (`selectTool.ts`), `rotateSelectionBy` (±90° buttons), `applyStampTransform` (typed X, Y, rotation), `applyToSelectedStamps` (rotation, color, scale, property for a selection), `setStampProperty`, `replaceSelectedStamps`. Not marked (decided): `applyDefinitionToPlacedStamps` and `applyCustomPropertyCascade` (cascades, not user edits of one stamp) and capacity edits (not undoable and not in the stamp data; a re-run writes the rule's capacity again).
     - Core: `PlacedStamp.autoPlaced.roomKey?` (`roomPlacementKey`: outer ring and holes rounded to 0.01 pt, plus the room type). `planAutoPlacement(..., existing?)`: each row gets `existing { keep, replace }` (moved stamps stay and count; the planner leaves out the layout point nearest to each moved stamp); the note "the room changed after the last placement" when the key differs or the room id is gone; a stamp whose room id is gone belongs to the room that contains it (re-detect gives new ids). The result also has `stale`: stamps of a checked rule in a room that the rule no longer applies to. `autoPlacedStampIds(rows, stale)`.
     - Scene: `autoPlaceStamps(groups, replaceIds)` removes the replaced stamps in the same undo step; `removeAutoPlacedStamps(ids)` (one undo step; capacities stay so an undo gives them back); `listAutoPlacedStamps()`; `showAutoPlacePreview(groups, replaceIds)` hides the replaced stamps until the preview ends. `deleteSelection`'s circuit and panel cleanup moved into `withoutStamps`, used by all three.
     - UI: an Existing column ("2 (1 moved)"), the note "N moved stamps kept", "Place N stamps (replace M)", "Remove N auto-placed stamps" (all auto-placed stamps of the checked rules in the rooms of the scope, moved ones too, plus the stale ones), a status-line note for stale stamps, and status messages after Place and Remove. The plan also follows `drawingChanged`. A row that cannot be calculated (no stamp, no calibration, no count) keeps its stamps on Place.
   - Verified: core tests 800 pass (8 new: replace, keep and leave out the nearest point, count reached, room changed, room id gone, stale rule, remove list, `markAutoPlacedMoved`), all package tests pass, `pnpm build` 9/9, `pnpm typecheck` 16/16. Browser check (Playwright, real DOM, `01_arch_first_floor.pdf` at 1:50, toilet exhaust + smoke detector rules, 56 stamps): a mouse drag and the Properties "Rotate +90°" button set `moved` on only those 2 stamps; the table shows "1 (1 moved)", 0 placed and "1 moved stamp kept" for the toilet; the button reads "Place 54 stamps (replace 54)"; Preview shows 54 ghosts and hides 54 stamps, Cancel shows them again; the re-run keeps 56 stamps with the 2 moved ones in place; one Undo gives back the earlier stamps; a room type change in Room Properties gives the room-changed note and lists the exhaust stamp as stale; Remove for the selected room removes its 2 stamps, the table updates, Undo gives them back; save + reload keeps `moved` and `roomKey`. 23/23 checks, no page errors.
   - Not done / open: a deleted auto-placed stamp is not remembered, so a re-run places it again; the labels of stamps that the preview hides stay visible; a stamp whose room id is gone and that is in no room stays and is never listed; stamps are still not tied to a page.
6. **More layouts.** Even spread (start from the grid, then Lloyd relaxation: move each point to the centre of its own part of the polygon, repeat), coverage (add points until every point of the room is within the max distance), perimeter (points at intervals along the walls, corner offset, rotated to face into the room). Holes and concave rooms in every test.
7. **Doors and windows (separate investigation).** Door swing arcs and window symbols in the PDF vectors. Needed for "next to the door" (switches, call points) and "under the window" (radiators). Start with a short research note, not code.
8. **Advanced: formula fields.** An optional formula field in the rule form, with the expression engine from `schematic-expression.ts` (add `ceil`, `floor`, `round`, `min`, `max`). Values per room type (for example design lux per type) as variables.

## 6. Open points

- ~~Phase 0: one calibration per document or per page.~~ Per page (user confirmed 2026-10-09).
- ~~Phase 2: where the PDF-level and room-type heights are edited in the UI.~~ Menu › Ceiling heights… (one dialog per drawing).
- ~~Phase 4: what happens to a stamp that does not fit in a very small room.~~ Placed at the label point with the note "does not fit" (user confirmed 2026-10-09, built in Phase 4).
- Rule and room-type storage moves from `localStorage` to `SettingsStore` when that store is wired up ([[storage-interfaces]] Phase 3). Use one small load/save module per library, so the move is one change.
- Units: the rule's unit is free text. MepApp does not convert units. The capacity and the required amount must use the same unit.

## 7. Risks

- **Name matching quality** depends on the drawings. Many Dutch drawings use function groups ("Onderwijsruimten") in `details`. Measure the match rate on the real fixtures in Phase 1 before the seed list is final.
- **Irregular rooms.** Grid layout in L-shaped or open rooms gives uneven results. Phase 6 (even spread) fixes this. Until then, the preview must make the result clear before Apply.
- **Room accuracy.** Room shapes on 10A are still wrong for part of the rooms (13 of 34 within 15 %, [[project-room-detection-phase8]]). Auto-placement makes a wrong room shape more visible. The "needs review" warning must show in the preview table.
- **Stamp size.** PNG stamps are about 2.2 times too large ([[project-stamp-dpi-scaling-issue]]). The wall offset must use the real stamp size, so a wrong size gives stamps that touch walls.
