# UI cleanup plan (part U1): one rail entry, less text in the dialogs, English only

Status: PLANNED 2026-10-25 by the road map planner. No task is started. Eight questions wait for the user (section 0).
Origin: the user test of R1-R6 (comments 1, 4 and 5) and `.claude/plans/auto-routing-feedback-prompt.md` (the section "Findings: UI"). Each claim of that section was checked against the code on branch `worktree-routing-feedback`. The corrections are in section 2.
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. Line numbers are from this branch and can move.

## 1. Goal

The user gets three changes.

1. **One rail entry (comment 1).** The left rail gets one new button under "Rooms". It opens a small list with icons. The list holds "Route network", "Size network" and "Show/Hide route area". The three menu items leave the Menu.
2. **Less text (comment 4).** The Route, Size and Auto-place dialogs show icons with tooltips (a tooltip is a short text that shows when the pointer stays on an icon). Long hints move behind an "i" mark (`InfoTip`). Errors, one summary line and results stay as visible text.
3. **English only (comment 5).** No dialog shows Dutch. The cause is one saved setting, the stamp label language. The dialogs stop reading it.

Example (10A drawing). Today the user opens Menu, picks "Route network…" and sees a dialog with about 25 lines of hints. After U1 the user clicks the "Routing" button under "Rooms", clicks the route icon in the list, and sees the same dialog. The dialog shows one summary line, the warnings as lines with a coloured icon, and the hints behind "i" marks. The words "Kantoor" and "aansluitingen" never show, even when the Stamps tab is set to NL.

Where U1 stops. U1 changes the UI only. It changes no route, size or auto-place logic. It adds no stored data and no schema step (section 4.1). It does not build route presets (`route-layout-presets.md`) and it does not build the "Make circuits" UI (R7). Both use the new rail list later (section 4.3).

## 0. Questions for the user (open)

The director posts these on the dashboard. Each has a recommendation. A task waits for an answer only where the table at the end of this section says so.

- **Q-U1-01. What happens to the EN/NL toggle in the Stamps tab?** The toggle (`StampsPanel.tsx:275`) sets `labelLanguage`. It changes the stamp names in the picker and the labels drawn on the plan (`App.tsx:427`).
  - **A.** Keep the toggle. It affects the stamp picker and the drawn labels only, never a dialog. The default stays English.
  - **B.** Remove the toggle. All stamp names are English. The Dutch names (`labelNl`) stay in the data.
  - **C.** Keep the toggle, but move it to the Settings dialog.
  - **Recommendation: A.** A drawing for a Dutch client can need Dutch labels on the plan. That is drawing content, not UI. The user asked for an English UI.
- **Q-U1-02 [data model]. What happens to the Dutch name of a room type (`nameNl`)?** The field is part of `RoomType` (`packages/core/src/rooms/room-type.ts:84`). The project file stores the list of room types (`packages/core/src/project.ts:54`, `roomTypes: RoomType[]`), so the field is saved. `RoomNeed.nameNl` (`room-need.ts:15`) has no reader at all.
  - **A.** Keep `nameNl` in the types, the parser and the file. Hide the "Dutch name" field in the editor. No file format change.
  - **B.** Remove `nameNl` from the types, the parser and the default list. A saved Dutch name is dropped at the next save.
  - **C.** Keep the field and the data. Move the field to an "Advanced" part of the editor.
  - **Recommendation: A.** It is the smallest change, it loses no data, and an older file still loads. B can follow later as a clean-up.
- **Q-U1-03. Does "Auto-place stamps" move into the new rail entry?** Auto-place existed before R2. The user said "the new menu entries".
  - **A.** Move it. The Menu loses it. The entry holds Auto-place, Route, Size and Route area.
  - **B.** Keep it in the Menu. The entry holds Route, Size and Route area only.
  - **C.** Show it in both places.
  - **Recommendation: B.** It follows the words of the user. The list is a data table, so a later move is one line (section 4.3). Seven browser helpers use `openAutoPlace` and stay as they are.
- **Q-U1-04. How does the new rail list look?**
  - **A.** The existing flyout (`.mep-rail-flyout`): icon plus a short label for each action.
  - **B.** The same flyout with icons only and tooltips.
  - **C.** A bar in the header, like `RoomToolBar`, that shows after a click.
  - **Recommendation: A.** The rail flyout exists and its labels are short. A phone or tablet has no hover, so a tooltip alone is not enough there.
- **Q-U1-05. In what order do U1 and R7 touch `RouteDialog.tsx`?** R7 has uncommitted edits in `RouteDialog.tsx` in the worktree `agent-framework` (the brief says so; not verified here because that worktree is out of scope). The tasks U1-T01, T08, T09 and T10 also edit that file.
  - **A.** Do the rail (T04 to T07) and the English work (T01 to T03) now. Do the text cuts in `RouteDialog.tsx` (T09, T10) after R7 commits its edit. T01 is the exception: it edits call sites in `RouteDialog.tsx` and must rebase.
  - **B.** Do everything now. R7 rebases later.
  - **C.** Wait for R7 for all of U1.
  - **Recommendation: A.** The rail does not touch the dialog. The conflict is limited to T01, T09 and T10.
- **Q-U1-06. Do the main buttons of a dialog become icons?** ("Place route", "Size", "Close".)
  - **A.** No. They keep a text and get an icon. Field labels, scope choices, check boxes and row buttons become icons with tooltips.
  - **B.** Yes. All buttons are icon only.
  - **Recommendation: A.** The main action must be clear and it must have an accessible name. This also matches the order of the user: "where possible".
- **Q-U1-07. Where does the route area switch live?** Today it is in the Menu and in the Route dialog (`RouteAreaSection.tsx`, one scene flag).
  - **A.** Keep both. The rail list shows a pressed toggle. The dialog keeps its check box (as an icon toggle). Both read the same scene flag.
  - **B.** Remove it from the dialog.
  - **Recommendation: A.** There is no second copy of state. The dialog user sees the area while routing.
- **Q-U1-08. Does the rail list show a "Make circuits" slot now?** R7 builds that command; it has no UI yet.
  - **A.** Show a disabled slot "Make circuits (coming soon)".
  - **B.** Show nothing now. R7 adds its action to the list.
  - **Recommendation: B.** A dead button is noise. The list is a table (section 4.3).

| Task | Waits for |
|---|---|
| T02, T04, T07 | Nothing. |
| T01 | Q-U1-05 (it edits call sites in `RouteDialog.tsx`) |
| T03 | Q-U1-02 |
| T05 | Q-U1-03, Q-U1-04, Q-U1-08 |
| T06 | Q-U1-03 |
| T08 | Q-U1-05 (it edits `RouteDialog.tsx:273`) |
| T09 | Q-U1-05, Q-U1-06 |
| T10 | Q-U1-05, Q-U1-06, Q-U1-07 |
| T11 | Q-U1-06 |
| T12 | Q-U1-06 |
| T13 | All tasks T01 to T12 |

Until the user answers, a task that waits uses the recommended answer.

### 0.1 Defaults that I assume

- The flyout closes after a click on an action (like every flyout in `Rail.tsx:123`).
- "Route network" and "Size network" are disabled while no PDF is open (like the Menu: `MenuButton.tsx:168`, `:179`). "Route area" is disabled too (`MenuButton.tsx:190`).
- The dialogs open as before. The state `routeOpen`, `sizeOpen` and `autoPlaceOpen` stays in `App.tsx:455-457`.
- The tooltip is the native `title` plus an `aria-label`, like the rail (`Rail.tsx:73`). The "i" mark is the existing `InfoTip` (`InfoTip.tsx:13`).
- All `data-testid` values stay the same. A browser check keeps working when only the menu path changes.
- The saved key `mepapp.settings.labelLanguage.v1` (`App.tsx:163`) stays. No migration. A user with the value `nl` keeps it, and it then affects the Stamps tab only (if Q-U1-01 is A).

## 2. What exists now, and corrections to the earlier findings

| Item | Where (verified) | Use in U1 |
|---|---|---|
| Menu items "Auto-place stamps…" `:155-164`, "Route network…" `:165-175`, "Size network…" `:176-186`, "Show/Hide route area" `:187-197`. Props `onOpenAutoPlace`, `onOpenRoute`, `onOpenSize`, `routeAreaVisible`, `onToggleRouteArea`. | `packages/ui/src/components/MenuButton.tsx:18-22`, `:155-197` | T06 removes three items and four props. |
| App wiring of the Menu and the dialogs | `packages/ui/src/App.tsx:1460-1477` (Menu), `:1506-1517` (Rail), `:455-457` (open state), `:323` (`handleToggleRouteArea`), `:322-330` (visible state and event) | T05 and T06 move the call sites to the Rail props. |
| Rail rows table `RAIL_ROWS`; "Rooms" row `:85-90`; "Circuits" row `:91-96`; `ToolEntry` `:28-35`; `RailRow` `:37-43` | `packages/ui/src/toolRegistry.ts` | T05 adds the `routing` row between them and one optional field to `ToolEntry`. |
| Rail component. The chevron shows only when `!row.singleton` (`:90`). The flyout lists the members that are not the current one (`:61`, `:102-132`). A flyout member can run a non-tool action (Snap angle opens Settings, `:105-119`). | `packages/ui/src/components/Rail.tsx` | T05. |
| Rail CSS | `packages/ui/src/theme.css:389-490` (`.mep-rail` to `.mep-rail-flyout-btn:disabled`) | T05 adds a small block. |
| `InfoTip`: an "i" mark with a hover and focus text; Escape closes the text only | `packages/ui/src/components/InfoTip.tsx:13`; CSS `theme.css:4585-4640` | Reused in T09 to T12. |
| Icons are constants: `export const IconX = (props: IconProps) => <Svg …>`. The view box is 24 by 24. The stroke is `currentColor`. About 66 icons exist. None is for route, size, auto-place or route area. Reusable: `IconEyeOff` `:137`, `IconPlus` `:306`, `IconMinus` `:312`, `IconTrash` `:212`, `IconClose` `:183`, `IconPencil` `:293`. | `packages/ui/src/icons.tsx:6-17`, `:24-499` | T04 adds new icons in the same style. |
| Dutch table and Dutch branches | `packages/ui/src/components/routePlan.ts`: `roomLabel` `:67-73` ("Ruimte"), `typeNameInText` `:76-82`, `TEXTS.nl` `:171-243`, `includeOutsideText` `:246-249`, `typeOptionText` `:251-255`, `routeText(language, …)` `:257-262`, `startCheckLines` `:273-` (variable `nl`, `:278`), `routeAreaLines` `:317`, `routeAreaSummaryLine` `:379`, `routeAreaTypeChoices` `:392`, `routeSummaryLines` `:411-474`. Core: `packages/core/src/route-input.ts:1-9` (`RouteLanguage`, `routePageProblem`). | T01. |
| The language is passed as `language={labelLanguage}` | `App.tsx:1633` (AutoPlaceDialog), `:1678` (RouteDialog); stamp names via `stampLabelFor(definition, labelLanguage)` at `:1636`, `:1681`, `:1693` (Size dialog); `PropertiesPanel.tsx:141` (room type in the Properties panel) | T01, T02. |
| `roomTypeLabel(type, language)` returns `nameNl` for `nl` | `packages/core/src/rooms/room-type.ts:374-376`; used in `AutoPlaceDialog.tsx:233`, `:1121`; `AutoPlaceInputCards.tsx:125`, `:210`, `:327`; `PlacementRuleGuide.tsx:363`, `:732`, `:735`; `RoomProperties.tsx:51`, `:75`, `:116`; `RouteDialog.tsx:355`; `routePlan.ts:398` | T02. |
| The "Dutch name" field | `packages/ui/src/components/RoomTypeLibrary.tsx:668-669` (field), `:535`, `:547`, `:590`, `:622` (draft state) | T03. |
| The Stamps tab toggle and its storage | `StampsPanel.tsx:275`, `LanguageToggle.tsx:9`, `App.tsx:372-374`, `:483-486` | Stays under Q-U1-01 A. |
| Text blocks that are too long | Route summary `routePlan.ts:411-474`; room type keyword hint `RoomTypeLibrary.tsx:675`; example-values hint `RoomTypeLibrary.tsx:743`; Size notes `SizeDialog.tsx:261-269`; `disciplineNotSized` `sizePlan.ts:25`; fire wall hint `routeBuildPlan.ts` (`hintFireWalls`); Route dialog hints `RouteDialog.tsx:160`, `:309`, `:312`; Route area hints `RouteAreaSection.tsx:100`, `:121` | T09 to T12. |
| Dialog shell: `div.mep-modal` with `role="dialog"`, `actions` slot | `packages/ui/src/components/Dialog.tsx:42` | Unchanged. |
| Browser helper `menu(item)`, `openAutoPlace()` | `.claude/roadmap/browser/lib.mjs:44-47`, `:79-82` | T07. |
| UI tests | Pure function tests in `packages/ui/src/*.test.ts` (for example `routePlan.test.ts`, `sizePlan.test.ts`, `routeBuildPlan.test.ts`). No component test exists. `packages/ui/package.json` has no DOM library. | New tests are for pure functions. The browser proves the wiring (rules.md section 3, rule 5). |

### Corrections to the earlier findings

1. **The "Rooms" row has no flyout.** It is a `singleton` (`toolRegistry.ts:88`), so `Rail.tsx:90` draws no chevron. The Rooms button enters the last room tool (`Rail.tsx:81-84`).
   - The earlier text said the flyout is for tools, not dialogs.
   - The flyout has one non-tool case: Snap angle opens Settings (`Rail.tsx:105-119`). So an action in a flyout is not new.
2. **The flyout hides the current member** (`Rail.tsx:61`). A row of actions needs a flag. The flag makes the flyout show all members. It also makes the main button open the list. The earlier text did not say this. T05 adds the flag.
3. **The Size dialog is not fully English today.** Its own texts are English (`sizePlan.test.ts:65` proves it). But its stamp names come from `stampLabelFor(definition, labelLanguage)` (`App.tsx:1693`). So the stamp names show in Dutch when the toggle is NL. The earlier text said "SizeDialog is English only".
4. **The Route dialog mixes languages in one place.** `RouteDialog.tsx:403` calls `roomLabel(…, 'en')` for the build section. The rest of the dialog uses `language`. A user with NL sees "Ruimte 3" in the room list. The same user sees "Room 3" in the route lines.
5. **More than dialogs use the language.** `PropertiesPanel.tsx:141` passes it to `RoomProperties`, which shows room type names in Dutch. The user said "the whole UI". T02 fixes it.
6. **Dutch is also in the data.** The field `nameNl` is declared at `room-type.ts:84`. The project file stores the list of room types (`project.ts:54`, `roomTypes: RoomType[]`; verified by grep). So `nameNl` is saved in the file. `RoomNeed.nameNl` (`room-need.ts:15`, `:26-31`, `:102`) has no reader: a search for `.nameNl` finds only `room-type.ts:375` and `RoomTypeLibrary.tsx`. So the need names are dead data.
7. **The keywords stay Dutch.** `room-type.ts:161-180` lists Dutch keywords (for example `kantoor`, `gang`). They match room names on Dutch drawings. They are data, not UI text. They stay.
8. **Many browser checks use the menu items.** The earlier text did not count them. A grep of `.claude/roadmap/browser/` for "Route network", "Size network" and "route area" finds 15 files. T07 handles all 15.
   - Use the menu items (change needed): `r2-check.mjs`, `r3-check.mjs`, `r4-check.mjs`, `r5-check.mjs`, `t10-check.mjs`, `t16-check.mjs`, `t16-size-check.mjs`, `t18-check.mjs`, `t19-check.mjs`, `t22-check.mjs`, `t23-check.mjs`, `r6-t22-check.mjs`, `r6-ui-lib.mjs`.
   - Match the words only in a comment or in a data read (T07 checks each and changes it only if needed): `r4-lib.mjs`, `t14-check.mjs`.
   - `t16-check.mjs:39-45` also asserts the order of the menu items.
9. **The rail CSS range is `theme.css:389-490`** (the earlier text said 386). The block starts with the comment at `:385`.
10. **Icons are constants, not functions** (`export const IconX = (props: IconProps) => …`). The count is about 66. No icon exists for the new actions.
11. **No component tests exist.** The earlier task (10) "update tests" has only pure function tests to update. The DOM proof is the browser check.
12. **The line numbers of the menu items, `RAIL_ROWS`, `labelLanguage` (`App.tsx:163`, `:372-374`), `routePlan.ts:171-243`, `RoomTypeLibrary.tsx:675` and `sizePlan.ts:25` are correct.**
13. **Not verified.** Which blocks of the Auto-place dialog (1140 lines) and of `PlacementRuleGuide.tsx` (1811 lines) are "too long". The earlier text names "Auto-place cards" without lines. T12 starts with a read of each dialog state and a list of the blocks over two lines.

## 3. Research

No outside source is needed. The changes follow the patterns that exist in the code: the rail flyout, `InfoTip`, `title` and `aria-label`. One comparison for the design of the rail list: Revit and AutoCAD keep one ribbon button for a group of related commands. That is a comparison, not a source. Not verified.

Rules for text that I apply (my own, easy to change):
- A label of a field becomes an icon only when the icon is clear without a word (arrow for start, pipe for type is NOT clear). Where an icon is not clear, the label stays as text. T09 lists each field with its decision.
- A warning line keeps its text. Its word "Warning:" becomes a coloured icon with an `aria-label`.
- A hint longer than one sentence moves behind an "i" mark.
- No icon button without `title` and `aria-label`. A test checks this (T13).

## 4. The model

### 4.1 Stored data

None. U1 adds no field, no schema step and no change to the file format. `CURRENT_SCHEMA_VERSION` stays as it is (`packages/core/src/project.ts:22`). T03 and the answer A of Q-U1-02 keep `nameNl`. If the user chooses B, T03 changes the parser and becomes `[data model]`: it then needs its own schema note. Proof: `git diff --stat` shows no change in `project.ts`, `schema.ts` and `serialize*` for T01 to T13 (with Q-U1-02 A).

### 4.2 Types and shapes

```ts
// packages/ui/src/toolRegistry.ts (changed)
export type RailActionId = 'route' | 'size' | 'route-area'; // R7 and Q-U1-03 add ids here
export interface ToolEntry {
  id: string; label: string; Icon: (props: IconProps) => ReactElement;
  tool: SketchTool | null;
  /** A dialog or switch instead of a tool. Rail.tsx calls onRailAction(action). */
  action?: RailActionId;
}
export interface RailRow {
  id: string; members: ToolEntry[]; singleton?: boolean;
  /** The main button opens the flyout with ALL members. No "current" member. */
  actionList?: boolean;
}
// New row, between 'rooms' and 'circuits':
// { id: 'routing', actionList: true, members: [
//   { id: 'route',      label: 'Route network',   Icon: IconRoute,      tool: null, action: 'route' },
//   { id: 'size',       label: 'Size network',    Icon: IconSizeNetwork, tool: null, action: 'size' },
//   { id: 'route-area', label: 'Route area',      Icon: IconRouteArea,  tool: null, action: 'route-area' } ] }

// packages/ui/src/components/Rail.tsx (changed props)
export interface RailProps {
  /* existing props */
  pdfLoaded: boolean;
  routeAreaVisible: boolean;
  onRailAction: (action: RailActionId) => void;
}

// packages/ui/src/components/IconButton.tsx (new)
export interface IconButtonProps {
  Icon: (props: IconProps) => ReactElement;
  label: string;              // becomes title and aria-label
  onClick?: () => void;
  pressed?: boolean;          // aria-pressed and the "on" class
  disabled?: boolean;
  size?: number;              // default 16
  testId?: string;
}
// IconToggle (same file): a real <input type="checkbox"|"radio"> that covers the icon (opacity 0, same size),
// so Playwright can still click and .check() it. Props: Icon, label, type, name?, checked, disabled?, onChange, testId.

// packages/ui/src/components/SeverityMark.tsx (new)
export function SeverityMark(props: { severity: 'error' | 'warning' | 'info' }): ReactElement; // coloured icon + aria-label "Error" | "Warning" | "Note"
```

The `routing` row needs three new icons for the actions and one for the rail button. The rail button shows `IconRouting`. New icons (T04): `IconRouting`, `IconRoute`, `IconSizeNetwork`, `IconRouteArea`, plus `IconSeverityError`, `IconSeverityWarning`, `IconSeverityInfo`. Same `Svg` wrapper, 24 by 24 view box.

### 4.3 How the list grows

`RAIL_ROWS` is the only table. A new command (Auto-place under Q-U1-03 A, "Make circuits" in R7, a preset picker later) is one new member with `action` and one `case` in the handler in `App.tsx`. No change to `Rail.tsx`.

### 4.4 English only: the target shape

```ts
// packages/ui/src/components/routePlan.ts (after T01)
export function routeText(key: RouteTextKey, params?: Record<string, string | number>): string;
export function roomLabel(room: Pick<Room, 'id' | 'name' | 'number'>, index: number): string; // "Room 3"
export function typeNameInText(libraryName: string): string;           // returns libraryName; or removed
export function includeOutsideText(count: number): string;
export function typeOptionText(name: string, count: number): string;
// packages/core/src/route-input.ts (after T01)
export function routePageProblem(pageCount: number): string | null;    // English only; RouteLanguage removed
// packages/core/src/rooms/room-type.ts (after T02)
export function roomTypeLabel(type: RoomType): string;                 // returns type.name
```

### 4.5 How U1 keeps the domain rules (`rules.md` section 3)

1. **Rule 1 (segment defines the port network type).** U1 changes no port, no stamp and no routing target. Not touched.
2. **Rule 2 (cascade invariant).** U1 does not write a segment or a network type. Not touched.
3. **Rule 3 (reuse before new).** The rail list reuses `RAIL_ROWS`, the `Rail` flyout and its CSS. The tooltips reuse `title` and `InfoTip`. The dialog state stays in `App.tsx`. The route area switch reuses `setRouteAreaVisible` and the event `routeAreaVisibleChanged` (`App.tsx:322-330`). The only new components are `IconButton`, `IconToggle` and `SeverityMark`. Reason: no component exists that gives an icon, a title and a pressed state in one place. The search for such a component found none (`packages/ui/src/components` has no `IconButton`; the rail buttons are written by hand in `Rail.tsx:70`, `:91`, `:108`).
4. **Rule 4 (adoption trap).** U1 does not set a `networkTypeId`. Not touched.
5. **Rule 5 (verify wiring through the real DOM).** Every browser check clicks the real rail button, the real flyout button, the real icon toggles and types into real inputs. The scene API is for setup and for reading state only.
6. **Rule 6 (merge lesson).** After each merge, `pnpm build` at the root.

## 5. The phases and the tasks

Order: Phase A (English), Phase B (rail), Phase C (text cuts), Phase D (part check). Phase A and B are independent and can run in parallel in two branches only if they do not edit the same file. They both touch `App.tsx` (T01, T02 and T06). So run them in series: A, then B. Phase C waits for Q-U1-05 and for B (it uses `IconButton`).

Size: S is up to 60 changed lines, M is up to 150, L is more (split before you start). Deleted lines count at one third.

Each task ends with: `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm --filter @mepapp/ui typecheck`, and `pnpm build` at the root. Where a browser check is named, run `node .claude/roadmap/browser/with-server.mjs <check.mjs>`. Screenshots go to `/tmp/mepapp-shots/` and are named `<task id>-<name>`. Upload each screenshot of a new or changed dialog to the dashboard right after the task (memory rule).

### Phase A. English only

#### U1-T01. Remove the Dutch path in the Route text [M]
- Files: `packages/ui/src/components/routePlan.ts`, `packages/core/src/route-input.ts`, `packages/core/src/route-input.test.ts`, `packages/core/src/index.ts` (remove the `RouteLanguage` export), `packages/ui/src/routePlan.test.ts`, `packages/ui/src/components/RouteDialog.tsx` (call sites only), `packages/ui/src/components/RouteAreaSection.tsx` (call sites and the `language` prop), `packages/ui/src/App.tsx` (remove `language={labelLanguage}` at `:1678`).
- Shapes: section 4.4. Delete `TEXTS.nl`, the `nl` branches in `startCheckLines`, `routeSummaryLines`, `includeOutsideText`, `typeOptionText`, `roomLabel`, `typeNameInText` and `routePageProblem`. The `language` argument goes from every function in `routePlan.ts`.
- Must not touch: the English texts (keep every word, so the browser checks that match text still pass), the `data-testid` values, `routeBuildPlan.ts`, `sizePlan.ts`.
- Verification:
  - Core: `route-input.test.ts` keeps the English case and drops the Dutch cases (3 cases use `'nl'`).
  - UI: `routePlan.test.ts` drops the `nl` cases (49 uses of `'nl'`). A new test `routePlan.test.ts` "has no Dutch word in any text": it scans every value of `TEXTS` with a list of Dutch words (copy the list from `routeBuildPlan.test.ts:33` and `sizePlan.test.ts:65`). Run the tests; read the pass count.
  - `pnpm build` at the root.
  - Browser (`.claude/roadmap/browser/r3-check.mjs`, then `r6-t22-check.mjs`): both still pass with their menu path. Screenshot `U1-T01-route-dialog` (set `localStorage` `mepapp.settings.labelLanguage.v1` to `nl` first, reload, open the dialog: it shows English).
- Dependencies: none. Conflict risk with R7 (Q-U1-05).

#### U1-T02. The dialogs and the Properties panel ignore the label language [S]
- Files: `packages/core/src/rooms/room-type.ts` (`roomTypeLabel(type)` with no language, `:374`), `packages/core/src/rooms/room-type.test.ts`, `packages/ui/src/components/AutoPlaceDialog.tsx`, `AutoPlaceInputCards.tsx`, `PlacementRuleGuide.tsx`, `RoomProperties.tsx`, `RouteDialog.tsx`, `routePlan.ts` (`routeAreaTypeChoices`), `PropertiesPanel.tsx:141`, `App.tsx` (`:1633` `language`, `:1636`, `:1681`, `:1693` `stampLabelFor(definition, labelLanguage)` becomes `stampLabelFor(definition, 'en')` for the three dialogs).
- Shapes: remove the `language` prop of `AutoPlaceDialog` (`:39`), `RoomTypesCard` (`AutoPlaceInputCards.tsx:91`), `CeilingHeightsCard` (`:263`), `PlacementRuleGuide` (`:59`), `RoomProperties` (`:41`, `:107`, `:225`). Keep `labelLanguage` for the Stamps tab, the stamp picker, the placed-stamp label (`PropertiesPanel.tsx:567`, `:587`) and the drawn labels (Q-U1-01 A).
- Must not touch: `stampLabelFor` (`stampVisibility.ts:7`), the Stamps tab, `setLabelContext` (`App.tsx:427`).
- Verification: core test for `roomTypeLabel` (returns `name`; a type with `nameNl` still returns `name`). `pnpm build`. Browser: new check `u1-lang-check.mjs` part 1: set `labelLanguage` to `nl`, open a PDF with detected rooms, open Auto-place, Route and Size, and select a room: assert that no chrome text matches the Dutch word list (exclude `.mep-route-room-name` and room names from the drawing, which are data). Screenshots `U1-T02-autoplace-nl-setting`, `U1-T02-size-nl-setting`, `U1-T02-room-properties`.
- Dependencies: T01 (same call sites in `RouteDialog.tsx`).

#### U1-T03. Remove the "Dutch name" field [S]
- Files: `packages/ui/src/components/RoomTypeLibrary.tsx` (`:535`, `:547`, `:590`, `:622`, `:668-669`).
- Shapes (Q-U1-02 A): the draft loses `nameNl`. A save keeps the stored `nameNl` of the type unchanged (read it from the type, not from the draft). So a type with a Dutch name keeps it when the user edits another field. If the user chooses B: also change `room-type.ts:84`, `:161-180`, `:352`, `room-need.ts:15`, `:26-31`, `:102`, and the test `room-type.test.ts:204-205`; mark `[data model]`.
- Must not touch: the keyword list and the keyword hint logic.
- Verification: UI test for the draft function (if the draft code is a pure function; if not, extract it first as a small step). Browser: open the room type editor, edit the name of a type, save, read the library: `nameNl` is unchanged. Screenshot `U1-T03-room-type-editor`.
- Dependencies: T02. Waits for Q-U1-02.

### Phase B. One rail entry

#### U1-T04. Icons and the shared button components [M]
- Files: `packages/ui/src/icons.tsx` (7 new icons, section 4.2), `packages/ui/src/components/IconButton.tsx` (new: `IconButton`, `IconToggle`), `packages/ui/src/components/SeverityMark.tsx` (new), `packages/ui/src/theme.css` (a block `.mep-icon-btn`, `.mep-icon-toggle`, `.mep-severity` with colours from the existing `.mep-route-check-error|warning|info` rules at `:3507-3509`).
- Shapes: section 4.2. `IconButton` renders `<button type="button" className="mep-icon-btn" title={label} aria-label={label} aria-pressed={pressed}>`. `IconToggle` keeps a real input (opacity 0, absolute, full size) so `locator.check()` and `click()` work.
- Must not touch: existing icons, `Rail.tsx`.
- Verification: UI test for any pure helper (for example a function that gives the class name). `pnpm build`. Browser: a short check renders each new icon once through the real app (the rail check in T05 does this). No screenshot of its own.
- Dependencies: none.

#### U1-T05. The "Routing" row in the rail [M]
- Files: `packages/ui/src/toolRegistry.ts`, `packages/ui/src/components/Rail.tsx`, `packages/ui/src/theme.css` (small: pressed state in the flyout button), `packages/ui/src/App.tsx` (pass `pdfLoaded`, `routeAreaVisible`, `onRailAction`; the handler opens the dialogs and toggles the area).
- Shapes: section 4.2. In `Rail.tsx`, for a row with `actionList`: the main button shows the row icon (`IconRouting`), has `title="Routing"` and `data-testid="rail-routing"`, and toggles `openRow`. The flyout lists all members (the filter at `:61` is skipped). A member button has `data-testid="rail-action-<action>"`. The `route-area` member is a toggle: `pressed={routeAreaVisible}` and the label is "Show route area" or "Hide route area". All three are disabled when `!pdfLoaded`. A click calls `onRailAction(action)` and closes the flyout. The main button does not show an active state while a routing dialog is open. U1 needs no new state for this.
- Must not touch: other rows, the stamp, Rooms and Circuits logic in `Rail.tsx:63-86`, `Dialog.tsx`.
- Verification:
  - UI test: a pure test of `RAIL_ROWS` (the `routing` row is after `rooms` and before `circuits`; each member has `action`; ids are unique across rows).
  - `pnpm build`.
  - Browser `u1-rail-check.mjs` with real clicks: (1) before the PDF opens, the main button exists and all three actions are disabled; (2) after the PDF opens, a click on `rail-routing` shows three buttons; (3) a click on `rail-action-route` opens `.mep-modal` with the Route title and closes the flyout; (4) the same for Size; (5) a click on `rail-action-route-area` makes `window.__mepSketchScene.isRouteAreaVisible()` true and the button `aria-pressed="true"`; a second click reverts it; (6) a click outside closes the flyout; (7) the "Rooms" button still enters Fill room. Screenshots `U1-T05-rail-closed`, `U1-T05-rail-flyout`, `U1-T05-rail-area-pressed`, `U1-T05-route-dialog-from-rail`.
- Dependencies: T04. Waits for Q-U1-03, Q-U1-04, Q-U1-08 (defaults A/B/B).

#### U1-T06. Remove the three menu items [S]
- Files: `packages/ui/src/components/MenuButton.tsx` (remove `:165-197` and the props `onOpenRoute`, `onOpenSize`, `routeAreaVisible`, `onToggleRouteArea`, `:19-22`, `:41-44`), `packages/ui/src/App.tsx` (`:1474-1477`). Under Q-U1-03 A also remove `onOpenAutoPlace` (`:155-164`, `:18`, `:40`, `App.tsx:1473`).
- Must not touch: the other menu items and the debug item (`MenuButton.tsx:198-`).
- Verification: `pnpm build`. Browser: open the Menu and assert that the texts "Route network…", "Size network…", "Show route area" and "Hide route area" do not exist. Screenshot `U1-T06-menu`. The old browser checks fail until T07 runs, so do T06 and T07 in one commit pair.
- Dependencies: T05.

#### U1-T07. Move the browser checks to the rail [S to M]
- Files: `.claude/roadmap/browser/lib.mjs` (add `openRoute()`, `openSize()`, `setRouteArea(on)`; they click `rail-routing` then `rail-action-<action>`; `openAutoPlace()` stays on the Menu unless Q-U1-03 A), and the 15 files in correction 8 (13 change, `r4-lib.mjs` and `t14-check.mjs` are read and changed only if needed). `t16-check.mjs` asserts the menu order (`:39-45`): rewrite it to assert the rail order, or retire it and say so in the commit.
- Must not touch: the logic and the expected values of the checks.
- Verification: run each changed check. Read the totals. Every check that passed before passes now (the count of `PASS` lines does not drop; compare with the last run of each check; if no last run is recorded, mark "baseline not verified" and run the check on the commit before T06 first).
- Dependencies: T05, T06.

### Phase C. Less text in the dialogs

Rule for every task of this phase: the text inventory comes first. The worker lists, in the task commit message, each visible text block of the dialog with its decision (icon+tooltip, InfoTip, shorter, or stays). Errors, the summary line and the results stay visible. Every `data-testid` stays. A check that reads a text is changed in the same task.

#### U1-T08. Severity marks [S]
- Files: `RouteDialog.tsx` (`:273`), `RouteBuildSection.tsx` (`:104`), `RouteAreaSection.tsx` (`:107`), `SizeDialog.tsx` (`:212`), `routePlan.ts`/`routeBuildPlan.ts`/`sizePlan.ts` (the labels `severityError|Warning|Info`), `theme.css:3534` (the `::after` colon rule).
- Shapes: `<strong className="mep-route-severity">Error</strong>` becomes `<SeverityMark severity=… />`. The line text stays. `data-severity` stays.
- Verification: UI test that no severity word is needed by a pure function any more (or the function is deleted). Browser: `r3-check.mjs` and `t22-check.mjs` pass; they read `data-severity`. Screenshot `U1-T08-warning-lines`.
- Files note: this task and U1-T10 both edit `RouteBuildSection.tsx` and `routeBuildPlan.ts`. Run T08 before T10.
- Dependencies: T04. Waits for Q-U1-05 (it edits `RouteDialog.tsx:273`).

#### U1-T09. Route dialog fields [M]
- Files: `RouteDialog.tsx`, `routePlan.ts` (`TEXTS` keys that become tooltips), `theme.css`.
- Baseline first: before any edit, count the words of the visible text in `.mep-modal` for the Route dialog on 10A after a preview. Write the number in the commit message. T13 step 5 reads it.
- Decisions (planned; the worker may change one with a reason):
  - "Start stamp", "Network type", "Start port": the three `<select>` stay. Their label text stays too. The user must know which list is which. No clear icon exists for them.
  - Scope radios "Rooms" and "Stamps" (`:286-306`): `IconToggle type="radio"` with icons `IconFillRoom` and `IconStamp`; tooltips "Serve the checked rooms" and "Serve the selected stamps".
  - "All" and "None" buttons (`:320-329`): `IconButton` with `IconPlus`-like check and `IconClose`; tooltips "Check all rooms", "Uncheck all rooms".
  - Check boxes "include outside" (`:365`) and "use all ports" (`:376`): `IconToggle type="checkbox"` with a tooltip; the count of ports stays as a number next to it.
  - Hints `scopeStampsNote`, `scopeStampsHint`, `selectionRiserNote` (`:160`, `:309`, `:312`) move behind one `InfoTip`.
  - Room table head (`:331-336`): the column titles stay (short).
- Shapes: `data-testid` of every input stays (`route-scope-rooms`, `route-scope-stamps`, `route-outside`, `route-all-ports`, `route-rooms-all`, `route-rooms-none`).
- Verification: UI tests for the changed pure functions. Browser: run `r3-check.mjs`, `r2-check.mjs`, `t10-check.mjs` (they click the radios and boxes). A new step in `u1-dialog-check.mjs`: every `button` and `label` that contains only an icon has `title` and `aria-label`. Hover each icon with the mouse and read `title`. Screenshots `U1-T09-route-dialog-full`, `U1-T09-route-dialog-scope-stamps`, `U1-T09-route-dialog-tooltip`.
- Dependencies: T01, T04, T08. Waits for Q-U1-05, Q-U1-06.

#### U1-T10. Route build section and route area section [M]
- Files: `RouteBuildSection.tsx`, `RouteAreaSection.tsx`, `routeBuildPlan.ts`, `routePlan.ts`, `theme.css`.
- Decisions: the summary stays one line. The fire-wall hint (`hintFireWalls`, repeated for each crossing line) shows once, behind one `InfoTip` on the crossing line. `buildExtends`, `buildRemove`: shorter text, one sentence. The check box "Size the network after routing" (`RouteBuildSection.tsx:111`) becomes an `IconToggle` with a visible short label "Size after routing" (keeps meaning). "Place route" keeps text and gets an icon (Q-U1-06 A). The route area legend (`areaLegend`, `:67`) shows four colour swatches with a tooltip each instead of a text list; `areaTypesHint` (`:100`) and `areaLegendGuide` (`:121`) go behind `InfoTip`. The "Show route area" check box becomes an `IconToggle` with `IconEyeOff`-style icon (Q-U1-07 A).
- Verification: UI tests (`routeBuildPlan.test.ts`: the no-Dutch test stays; keep tests that read the texts and update them to the new words). Browser: `r6-check.mjs`, `r6-t22-check.mjs`, `t18-check.mjs`, `r4-check.mjs` pass (update a regex only where the text changed, and name the change in the commit). Screenshots `U1-T10-build-section`, `U1-T10-warnings`, `U1-T10-area-section`.
- Files note: T08 also edits `RouteBuildSection.tsx` and `routeBuildPlan.ts`. T10 runs after T08. The presets tasks P1-T11 to P1-T13 wait for this task (section 7).
- Dependencies: T08, T09. Waits for Q-U1-05, Q-U1-06, Q-U1-07.

#### U1-T11. Size dialog and the network type editor [M]
- Files: `SizeDialog.tsx` (`:261-269` notes block), `sizePlan.ts` (`disciplineNotSized` `:25`, the note keys), `NetworkTypeEditorDialog.tsx` (`:150`, `:166`, `:167` notes), `theme.css`.
- Decisions: the notes `velocityNote`, `fluidAir|Water`, `returnNote`, `pipeNote`, `twoFlowsNote`, `riserNote`, `draftNote` move into one `InfoTip` "About these sizes" (the same texts, as a list). `disciplineNotSized` shrinks to one sentence ("This type has no sizing method.") plus the long part in an `InfoTip`. `capacityUnitNote` (`SizeDialog.tsx:205`) stays one line. The two small buttons "Suggest" and "Clear" (`:231`, `:234`) become `IconButton`s with tooltips. "Size" and "Close" keep text.
- Verification: `sizePlan.test.ts` (the no-Dutch test stays; update the text tests). Browser: `r5-check.mjs`, `t22-check.mjs`, `t23-check.mjs`, `t16-size-check.mjs` pass. Screenshots `U1-T11-size-dialog`, `U1-T11-size-infotip`, `U1-T11-network-type-editor`.
- Dependencies: T04, T08.

#### U1-T12. Room type library and Auto-place dialog [M, may split]
- Files: `RoomTypeLibrary.tsx` (`:675` keyword hint, `:743` example hint), `AutoPlaceInputCards.tsx` (the cards), `AutoPlaceDialog.tsx`, `theme.css`.
- Step 1 (read-only, in the commit message): open the Auto-place dialog on the 10A drawing in each state (Rules, Room types, Ceiling heights, results) and list each text block over two lines. Not verified now which these are (correction 13). If the list is longer than six blocks, split into T12a (RoomTypeLibrary + cards) and T12b (`AutoPlaceDialog` result texts).
- Decisions: the keyword hint and the example-values hint move behind `InfoTip`. Existing `InfoTip` uses stay. `PlacementRuleGuide.tsx` (1811 lines) is out of scope unless the step 1 list names a block in it.
- Verification: `autoPlacePlan.test.ts`, `roomDemandText.test.ts` pass (read the counts). Browser: `p6-check.mjs`, `r4-check.mjs` (Auto-place steps) pass. Screenshots `U1-T12-room-types`, `U1-T12-autoplace-rules`, `U1-T12-autoplace-cards`.
- Dependencies: T02, T04.

### Phase D. The part check

#### U1-T13. The part check [S]
- Files: `.claude/roadmap/browser/u1-check.mjs` (new; copy the shape of `r6-check.mjs`), `u1-lang-check.mjs` and `u1-rail-check.mjs` from T02 and T05 if not yet written.
- Steps: (1) open a PDF; the Menu holds no routing item; (2) the rail list works for the three actions and the pressed state; (3) `labelLanguage` is `nl`: open Auto-place, Route, Size, the room type editor, the Properties panel for a room: no chrome text matches the Dutch word list; (4) every icon-only control in the three dialogs has `title` and `aria-label` (walk the DOM in the browser and count; the count is printed); (5) the visible text of the Route dialog on 10A after a preview has at most 60% of the words of the baseline. T09 measures the baseline first (the word count of `.mep-modal` text on the commit before T09) and writes it in its commit message. T13 reads that number. If T09 recorded no baseline, drop this step and say so in the report; (6) one real Place route and one Undo still work (smoke test, as `r6-check.mjs`).
- Verification: the full list. `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm typecheck` (the root script; confirm the name in the root `package.json`, not verified here), `pnpm build`. All older browser checks run once (r2 to r6) and report 0 failed.
- Dependencies: T01 to T12.

## 6. Verification summary

| Proof | Tasks |
|---|---|
| Core tests | T01, T02, T03 |
| UI pure function tests | T01, T02, T03 (draft), T04, T05 (`RAIL_ROWS`), T08 to T12 |
| `pnpm build` | every task |
| Browser, real DOM (rail, flyout, toggles, tooltips) | T05, T06, T09 to T13 |
| Old checks still pass | T01, T07, T09 to T13 |
| No stored change | `git diff --stat` shows nothing in `project.ts`, `schema.ts`, `serialize*` (section 4.1) |
| Dashboard screenshots | every UI task |

## 7. Where U1 stops and the next work starts

- **U1 stops** when the rail entry works, the three menu items are gone, the dialogs show no Dutch with any `labelLanguage`, and the long hints are behind "i" marks.
- **Route quality** (`route-quality-research.md`) changes the planner, not the UI.
- **Route presets** (`route-layout-presets.md`) adds preset chips and previews to the Route dialog. It reuses `IconButton` and the new text rules.
- **File order with the presets plan.** U1-T08 and U1-T10 both edit `RouteBuildSection.tsx` and `routeBuildPlan.ts`. U1-T09 edits `RouteDialog.tsx`. The tasks P1-T11 to P1-T13 of the presets plan edit the same files. So P1-T11 to P1-T13 must wait for U1-T10. If they run first, U1-T08 to U1-T10 must rebase on them.
- **R7 (circuits)** adds "Make circuits" as one member in `RAIL_ROWS` (section 4.3) and changes `RouteDialog.tsx`. It must rebase on T01 (Q-U1-05).

## 8. Risks and what is not verified

- **R-1. Conflict with R7 in `RouteDialog.tsx`.** The edits of R7 are not committed (the brief says so; not verified here). T01, T09 and T10 touch the same file. Mitigation: Q-U1-05 A, and a rebase by the worker of the later task.
- **R-2. Browser checks break.** 15 files name the menu items (13 need a change). Mitigation: T06 and T07 go together. The lib helper hides the path.
- **R-3. A hidden input does not take a click.** `IconToggle` covers the icon with the input (opacity 0, not `display:none`). A check proves a real click and `.check()` work (T09).
- **R-4. An icon is not clear.** The worker keeps the text where no clear icon exists (section 3, first rule). The user reviews the screenshots on the dashboard.
- **R-5. A touch screen has no hover.** The native `title` does not show on touch. The `InfoTip` opens on focus, so it works on touch. For icon buttons the plan accepts `title` only, as the rail does (`Rail.tsx:73`). Not verified on a touch device.
- **R-6. Text checks.** Some checks match text (`r6-t22-check.mjs:111` matches a regex of the off-graph line). A text cut changes them. Each task lists its checks.
- **R-7. `labelLanguage` is also used for the drawn labels** (`App.tsx:427`). T02 does not touch that path.
- **R-8. Dutch user data.** A Dutch room name from the drawing shows in the room list. It is data. The language check excludes it. The user may still see Dutch there. Say so in the dashboard note.
- **Not verified:** the R7 edits in the other worktree; the blocks of the Auto-place dialog that are "too long" (T12 step 1); the name of the root typecheck script; the last pass counts of the older browser checks (T07 runs them first); any touch device.
