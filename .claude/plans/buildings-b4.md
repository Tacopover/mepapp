# B4 plan: risers between levels

Status: planned 2026-10-31 by the road map planner. Not started. Not audited. The model needs user answers D-B-13 and D-B-14 before B4-T04 and B4-T05 (see section 6).
Origin: `buildings-levels-sheets-spec.md` (sections 3.4, 3.6, 6), `buildings-b1.md` to `buildings-b3.md`. Final decisions: D-B-04 (a riser has the same x and y on every level; a move on one level syncs to the others), D-B-07 A (a riser is an entity in the building file with one anchor and the list of segments on each level).
Read `.claude/roadmap/rules.md` first. Paths start at the repository root. Line numbers can move.
Terms: as in the spec, section 0. **Member**: the part of a riser on one level: a fitting at the anchor and the segments that end there. **Pending op**: a change (a move or a type change) that a closed document has not applied yet.

## 1. Goal

After B4 the user can:
1. Right-click a fitting on a level and choose "Make riser". The fitting position becomes the anchor.
2. Open the sheet of the next level, select the end of a segment (or draw a segment) and choose "Attach to riser". The end snaps to the anchor and the riser gets a member.
3. Move the riser fitting on one level. The other levels move too. A document that is open moves at once. A closed document gets a pending op and applies it when it opens.
4. Export quantities with a Riser table: vertical length from the level elevations, and a column `Building network` that names runs joined by a riser.

Example: an air shaft `SH1` at x 410, y 220 on a ground floor and a first floor. The supply duct on each floor ends in a fitting at the shaft. The riser `SH1` has two members. Level elevations are 0 and 3000 mm. The Riser table has one row: `SH1`, Supply air, 3.00 m, 2 levels.

B4 stops where the work is only geometry and takeoff. B4 does not size ducts across levels and does not solve flow across levels (the flow solve works inside one document: `packages/core/src/flow.ts`). R6 route (auto-routing) still refuses multi-page documents; B4 does not lift that rule.

## 2. What exists now

| Fact | Source |
|---|---|
| `ConnectionPoint` is a fitting or a port, by id, inside one document | `packages/core/src/network.ts:50-52` |
| `computeNetworks`: networks from topology, recomputed on each call; a port group alone never joins segments of different types | `network.ts:107-120`, `:170` |
| A fitting move goes through `applyConnectivityCascade` | `packages/render/src/tools/selectTool.ts:177-211`; `scene.ts:4883` |
| Change of the network type retags the whole connected run | `scene.ts:1531` (`setNetworkTypeForSegmentsNetworks`, uses `segmentIdsOfNetworks`) |
| `adoptNetworkTypes` | `scene.ts:2529` |
| Insert and remove a fitting, the context menu with `insertFitting` and `removeFittingId` | `scene.ts:542-544`, `:989-994`, `:1453-1481` |
| The canvas context menu event | `scene.ts:989` (`canvasContextMenuRequested`) |
| No elevation, level or z anywhere in the project data | memory `project-buildings-levels-sheets-scoping`; `BuildingLevel.elevationMm` is new in B1 |
| The old app has no riser. `Elevation` is display only | `MepSketcherTools/MEP/Building/BuildingLevel.cs:18-23` |
| D-R2-02 deferred "project levels and risers" to a later work | memory `project-auto-routing-plan` |
| Domain rules for connected segments and network type | `.claude/roadmap/rules.md` section 3, rule 2 |

## 3. Research (what MepApp can use)

- Revit (MEP risers are vertical runs that cross levels with one type), MagiCAD (shafts in the model): the common practice is one vertical element with a type and a position, referenced from each level. Sources not fetched in this plan. Not verified: how a given CAD tool handles a riser whose plan position differs by level. D-B-04 fixes this: the position is the same.
- The domain rule check: a riser must not make connected segments have different network types. The riser carries one `networkTypeId`. Each member segment must have it. A member whose segment has another type is a conflict that the app shows and does not hide.
- MepApp mechanisms to reuse: the fitting (it already joins segments at a point), `applyConnectivityCascade`, the fitting drag, `setNetworkTypeForSegmentsNetworks`, the undo `Transaction`, the context menu. The only new state is the `Riser` entity in the building file (D-B-07 A) and one set of marks in the scene.

## 4. The model

Types are in the spec, section 3.4 (`Riser`, `RiserMember`, `RiserPendingOp`). The building file schema goes from version 1 to 2 (B4-T01) only if `risers` was left out of version 1. B1-T13 includes `risers: Riser[]` already, so B4 needs no file migration, only a validator for the entries. If the audit prefers a version bump, add a step 1 to 2 that sets `risers: []`.

The scene gets a read-only mark set. It holds no riser data of its own:

```ts
// packages/render/src/scene.ts (new public API)
export interface RiserMark { riserId: string; name: string; networkTypeId: string; anchor: Vec2 }
setRiserMarks(marks: ReadonlyMap<string /* fittingId */, RiserMark>): void;   // the UI sets it when a building and a document are open
getRiserMarks(): ReadonlyMap<string, RiserMark>;
moveFittingTo(fittingId: string, to: Vec2, opts?: { source: 'riser-sync' }): boolean;  // one undo step; false when the fitting is not found
events: 'riserFittingMoved' ({ fittingId, from: Vec2, to: Vec2 })
```

The mark set is a view of the building file. It is not saved in the project JSON. When the document opens outside a building, the fitting is a plain fitting.

### 4.1 The rules

- **A riser fitting on a level** is a normal `Fitting` (kind `junction`) at the anchor, with the segments of that level. It keeps the document consistent when opened alone. Moving it alone in a document without the building file leaves the file stale: on the next open the check below finds `fitting.position != anchor` and shows a conflict (the user picks "Move the riser here" or "Snap back").
- **Move** (D-B-04). `moveRiser(file, riserId, to)` (pure, in `core`) returns the new file and one op for each member: `{ sheetId, kind: 'move', to }`. The document that was moved applies it at once. Each other member whose document is open applies it with `moveFittingTo`. Each other member whose document is closed gets a `RiserPendingOp` with a growing `seq`. On open, the pending ops of that sheet run in `seq` order and are then removed from the file. **They run outside the undo stack** (the scene method `applyRemoteFittingMove` edits `drawingHistory` state without pushing a `Transaction`; not verified: the exact API, read `packages/render/src/document.ts` `drawingHistory` first). **The document becomes dirty** (D-B-21 A), so a Save writes the new place, and a status line says "Riser <name> moved to match the building". Live sync into an **open** non-active document follows the same rule (outside undo, dirty). The user's own drag on the source level is a normal undoable edit.
- **Anchor frame** (D-B-14). The anchor is in page units (pt). `attach` compares the sheet with the first member's sheet: page width, page height, page rotation (from `getPageInfo` or the summary `pages[...]`) and `pageUnitsPerRealUnit` (tolerance 0.5 %; both pages must be calibrated, else the check says "scale unknown" and refuses). If one differs, `attach` refuses with a message. A second warning (D-B-22 A): two riser anchors on one level closer than 150 mm. Not verified: that the user's sheets share one page size.
- **Network type** (domain rule 2, D-B-13 A). `Riser.networkTypeId` is the one type. `attach` refuses a segment whose type differs from the riser type, and tells the user to change the type of the run first. A type change on a run that has a riser mark (the scene calls `setNetworkTypeForSegmentsNetworks`): the scene emits `riserTypeChangeRequested({ riserId, networkTypeId })` before it commits; the UI sets `Riser.networkTypeId` and, for each other member, applies `retag` (the whole connected run on that level, by `segmentIdsOfNetworks`, with `adoptNetworkTypes([id], [riser.networkType])` first, so the copy in the riser is adopted by that document; the copy is stored in the building file, `riser.networkType`) when the document is open, or stores a pending `retag` op. The same adoption runs when a pending `retag` applies on open. If D-B-13 is answered B (refuse), the scene refuses the change and shows "This run is part of riser <name>. Detach the riser first." and no pending queue is needed for retag.
- **Delete.** Deleting the riser fitting in a document is refused with a message (`removeFitting` refuses when `canRemoveFitting` is false, `scene.ts:1453`; the scene adds its own check for marked fittings). "Detach from riser" removes the member from the file. "Delete riser" removes the entity; the fittings stay as plain fittings.
- **Levels.** Deleting a level that holds a riser member is refused (B3-T01 refuses when a level has sheets; a member always sits on a sheet). Moving a sheet to another level (B3-T01 `moveSheet`) updates `member.levelId`.

How B4 keeps the domain rules:
1. A riser never adds a network type to a stamp or port. It has no ports. Its type is checked, not defaulted.
2. Cascade: the type change reaches the whole run on this level (existing) and the runs of the other members (new), with pending ops for closed documents (D-B-13 A). Between a pending op and its apply, the closed document is stale. The Building takeoff shows a warning "<sheet>: pending change for riser <name>" (B4-T08).
3. Reuse: fitting, cascade, `Transaction`, context menu, the building file, `FileAccess`.
4. Adoption: `adoptNetworkTypes` runs before every retag (`scene.ts:2529`).
5. UI through the real DOM: right-click, menu click, typing the riser name.
6. After a merge: `pnpm build`.

## 5. Phases and tasks

Common verification: `pnpm --filter @mepapp/core test`, `pnpm --filter @mepapp/ui test`, `pnpm build`, the browser check named in the task. Screenshots `<task id>-<name>`. Browser limit: one Chromium page with a PDF at a time. Two levels need two documents: open them one after another and switch tabs (`handleActivateDocument`, `App.tsx:664`). Upload screenshots to the stream dashboard after each task.

### Phase 1: the model in core (needs B1-T13; D-B-14 for T03)

**B4-T01 core: riser types and validation.**
- Files: `packages/core/src/riser.ts` (replace the B1 stub), `packages/core/src/building.ts` (validate `risers`), tests.
- Shapes: the types of spec section 3.4 (`fittingId` only, no `segmentIds`; `networkType` copy; `flow`, `sourceLevelId`, `topEnd`, `bottomEnd`, `endAllowanceMm`, `shaftName?`, `connectionHeightMm?`). Validation: `networkTypeId` equals `networkType.id`; at most one member per `levelId`; every `sheetId` and `levelId` exists; `anchor` is finite; `endAllowanceMm` and `connectionHeightMm` are finite and not negative; `sourceLevelId` is a level that has a member; `pending` ops name a sheet that is a member; `seq` is unique and increasing. A warning list `riserWarnings(file)`: one member only; an `open` end with no allowance; two anchors closer than 150 mm on one level (needs the calibration of that level; skipped without it).
- Verify: core tests for each rule; a v1 building file with `risers: []` still loads.
- Depends on: B1-T13.

**B4-T02 core: riser edits as pure functions.**
- Files: `packages/core/src/riser-edit.ts` (new), tests.
- Shapes:
  ```ts
  export function makeRiser(file: BuildingFile, args: { id: string; name: string; networkTypeId: string; sheetId: string; fittingId: string; segmentIds: string[]; anchor: Vec2 }): BuildingFile;
  export function attachMember(file: BuildingFile, riserId: string, member: RiserMember, frames: { first: PageFrame; this: PageFrame }): BuildingFile | RiserError;   // 'level-taken' | 'type-differs' | 'page-frame-differs' | 'scale-unknown'
  export interface PageFrame { widthPt: number; heightPt: number; rotationDegrees: number; pageUnitsPerRealUnit: number | null }
  export function setRiserProps(file: BuildingFile, riserId: string, props: Partial<Pick<Riser, 'name' | 'shaftName' | 'flow' | 'sourceLevelId' | 'topEnd' | 'bottomEnd' | 'endAllowanceMm'>>): BuildingFile;
  export function detachMember(file: BuildingFile, riserId: string, sheetId: string): BuildingFile;
  export function deleteRiser(file: BuildingFile, riserId: string): BuildingFile;
  export function moveRiser(file: BuildingFile, riserId: string, to: Vec2, fromSheetId: string): { file: BuildingFile; ops: { sheetId: string; to: Vec2 }[] };   // pending ops are added for sheets in `closedSheetIds`
  export function takePendingOps(file: BuildingFile, sheetId: string): { file: BuildingFile; ops: RiserPendingOp[] };
  ```
  `moveRiser` takes a set `openSheetIds` and adds a pending op for each member that is not in it and not the source.
- Verify: core tests: move with 3 members, 1 open: 1 apply op and 1 pending op, `seq` grows; `takePendingOps` removes the ops once.
- Depends on: B4-T01.

**B4-T03 core: riser length and network join.**
- Files: `packages/core/src/riser-quantities.ts` (new), tests.
- Shapes:
  ```ts
  export interface RiserSpan { riser: Riser; fromLevelId: string; toLevelId: string; lengthMm: number; crossings: number }
  export function riserSpans(file: BuildingFile, riser: Riser): { spans: RiserSpan[]; warnings: string[] };
  export function riserTable(file: BuildingFile, sizeOf: (member: RiserMember) => string | null): QuantityTable;
  export function buildingNetworkLabels(file: BuildingFile, networksOf: (member: RiserMember) => string[]): Map<string /* "sheetId|segmentLabel" */, string>;
  export function buildingNetworkRollup(args: { segmentRows: QuantityTable; spans: RiserSpan[] }): QuantityTable;
  ```
  - A span is the part between two neighbouring members in elevation order: `lengthMm` = elevation difference + `connectionHeightMm` of the upper member − `connectionHeightMm` of the lower member (default 0). `crossings` = number of levels strictly between them + 1 (floor crossings; adjacent levels give 1). An end with `open` and `endAllowanceMm > 0` adds one extra span row "to roof/ground" with `lengthMm = endAllowanceMm`; an `open` end with no allowance adds a warning and no row. A closed end adds `endAllowanceMm` to its span (fitting allowance).
  - A riser with one member has no span: the table gets one row with a **blank** length and the warning "Riser <name> has one member. Length unknown." It never writes 0.
  - `riserTable` columns (no pt coordinates): `Building`, `Riser`, `Shaft`, `Network type`, `From level`, `To level`, `Floor-to-floor length (m)`, `Floor crossings`, `Size`, `Flow direction`, `Source level`. `Size` comes from `sizeOf(member)` (found at run time from the segments that end at the member fitting in the summary; "mixed" when the two ends differ). `Flow direction` is `up`, `down`, `both` or `unknown` as stored (D-B-18).
  - The Building takeoff adds the warning "Flow is not summed across levels." whenever a riser exists. The solve in `flow.ts` works inside one document and B4 does not change that.
  - Roll-up (`buildingNetworkRollup`): one row for each network type: `Segment length (m)` (sum of the rows of that type), `Riser floor-to-floor length (m)` (sum of spans), `Risers` (count).
  - `buildingNetworkLabels`: union-find over members; two per-document network labels that a riser joins get one `Building network N`, numbered per network type.
  - Circuit cable (D-B-20 A): B4 adds no vertical cable length. The warning for a circuit with terminals on several levels is B2-T04.
- Verify: core tests: levels 0, 3000, 6000 with members on 0 and 6000: one span of 6.00 m and 2 crossings; a member on 3000 too: two spans; connection heights change the span; one member: blank length plus warning; `open` end with allowance adds a row; negative elevation (basement −3000 to 0) gives 3.00 m; equal elevations give length 0 for that span and the level warning of B1-T13; two networks joined by a riser get one label; the roll-up sums by type.
- Depends on: B4-T01. Needs the level elevations of B1 (`elevationMm`).

### Phase 2: the scene (needs B4-T02; D-B-13 for T05)

**B4-T04 render: riser marks and move sync.**
- Files: `packages/render/src/scene.ts`, `packages/render/src/tools/selectTool.ts` (the fitting move at `:177-211`), `packages/render/src/overlay` code that draws fitting markers (find: `FITTING_MARKER_RADIUS_WORLD`, `scene.ts:358`), tests. Also `applyRemoteFittingMove(fittingId, to)`: edits the fitting and runs `applyConnectivityCascade`, without a `Transaction` and without an undo entry, and marks the document dirty (D-B-21 A).
- Shapes: `setRiserMarks`, `getRiserMarks`, `moveFittingTo` (one `Transaction`, calls `applyConnectivityCascade` with the moved fitting, as `selectTool.ts:195-198` does), event `riserFittingMoved`. A marked fitting draws with a distinct ring (a color not used by the selection or the route markers: cyan is the selection, magenta is the route marker; pick a third and name it in the code comment).
- Do not touch: the connectivity code in `core`.
- Verify: render tests of `moveFittingTo` (segments follow; undo restores); browser check: mark a fitting by the scene API (setup only), drag it by real mouse moves, the event fires once on mouse up (not for each move step). Screenshot `B4-T04-ring`.
- Depends on: B4-T02.

**B4-T05 render: guard and type events.**
- Files: `packages/render/src/scene.ts`, tests.
- Shapes: `setNetworkTypeForSegmentsNetworks` (`:1531`): when any segment of the run touches a marked fitting, emit `riserTypeChangeRequested` and wait for the UI answer `proceed: boolean` through an injected callback `riserTypeGuard?: (riserId: string, networkTypeId: string) => boolean` (default: allow). `deleteSelection` and `removeFitting` refuse a marked fitting. `insertFittingOnSegment` leaves the mark where it is.
- Verify: render tests: guard true applies, guard false leaves the segments unchanged.
- Depends on: B4-T04, D-B-13 answered.

### Phase 3: the UI

**B4-T06 ui: Make riser, Attach, Detach.**
- Files: `packages/ui/src/App.tsx` (the context menu handler for `canvasContextMenuRequested`, `scene.ts:989`), `packages/ui/src/useBuilding.ts`, `packages/ui/src/riserActions.ts` (new, pure glue over `riser-edit.ts` and scene calls), `packages/ui/src/components/RiserNameDialog.tsx` (new), tests.
- Shapes: the context menu on a fitting offers "Make riser…" (opens a dialog with a name input; default `R1`, `R2`) when the document is a sheet of the open building and the fitting has at least one segment. On a riser fitting it offers "Detach from riser" and "Delete riser". On a segment end or a free point it offers "Attach to riser…" (a select of the risers that have no member on this level). Attach snaps the end to the anchor: if the end is a fitting, move it with `moveFittingTo`; else create a fitting at the anchor and connect (reuse `insertFittingOnSegment` and the connect code; read `scene.ts:1460` first and write down the choice). Every action writes through `useBuilding.update` and then `setRiserMarks`.
- Do not touch: the stamp port logic.
- Verify: UI tests for `riserActions`; browser check with the two tracked fixtures as two levels: draw a segment on each, Make riser on level 0, Attach on level 1, all by right-click and menu click and typing the name. Screenshots `B4-T06-menu`, `B4-T06-dialog`, `B4-T06-attached`.
- Depends on: B4-T04, B3-T02, B3-T04.

**B4-T07 ui: sync a move and apply pending ops.**
- Files: `packages/ui/src/App.tsx`, `packages/ui/src/riserActions.ts`, tests.
- Shapes: on `riserFittingMoved`, call `moveRiser(file, riserId, to, sheetId)`. For each member whose document is open (`scene.getDocuments()`), call `activate`-free access: the scene needs `applyRemoteFittingMoveIn(runtimeDocId: string, fittingId, to)` (the runtime id `doc-N` of `SketchDocument.id`, found from `projectUuid` by `getProjectUuid()` of each open document; a thin wrapper that runs `applyRemoteFittingMove` on a non-active document without switching the view and without an undo entry; the scene already keeps several documents: `scene.ts:1172-1207`). Not verified: that a command on a non-active document is safe in `SketchScene`; read `activateDocument` first. If it is not, apply on the next activation instead and show the pending state. After a document opens (`openPdfFile`, `App.tsx:623`), run `takePendingOps` for its sheets and apply them outside the undo stack; the document becomes dirty and the status line names the riser (D-B-21 A). A mismatch between the fitting and the anchor shows the conflict dialog of section 4.1.
- Verify: browser check: open both fixtures, move the riser fitting on level 0 by a real drag; switch to level 1: the fitting moved. Close level 1, move again, reopen level 1: the pending op applies and the file shows no pending op. Screenshots `B4-T07-before`, `B4-T07-after`, `B4-T07-pending`.
- Depends on: B4-T06.

**B4-T08 ui and core: takeoff with risers.**
- Files: `packages/core/src/building-takeoff.ts` (B2-T04), `packages/ui/src/quantitiesScope.ts` (B2-T07), tests.
- Shapes: the Building and Level takeoff adds the `Risers` table (spans, B4-T03) and the `Building networks` roll-up table (by network type). A Level scope lists only the spans that touch that level. The `Building network` column goes into `Segments` and `Fittings` for runs that a riser joins (needs the network label of each segment in the summary: B2-T03 stores the per-document label already). The `Fittings` table gets a column `Riser` (the riser name for a riser fitting, else blank). Warnings: for pending ops and for a conflict "<sheet>: pending change for riser <name>"; "Flow is not summed across levels."; the warnings of `riserSpans` (one member, open end).
- Verify: core tests; browser check: export Building from the two-level building; the workbook has a `Risers` sheet with 1 span row, the right length in the column "Floor-to-floor length (m)", no pt columns, a `Building networks` sheet, a `Riser` column on the riser fitting row, and the flow warning on `Warnings`. Screenshot `B4-T08-risers`.
- Depends on: B4-T03, B2-T04, B2-T07, B4-T07.

**B4-T09 ui: Risers tab in the building dialog.**
- Files: `ManageBuildingsDialog.tsx`, `packages/ui/src/components/BuildingRisersPane.tsx` (new), tests.
- Shapes: a list of risers: name, shaft name, type, members by level with a status (ok, pending, conflict), inputs for connection height of each member, a select for flow direction (`up`, `down`, `both`, `unknown`), a select for the source level, selects for top and bottom end (`member`, `open`), an input for the end allowance (mm), rename, delete, "Go to" a member (reuse B3-T05). Every input calls `setRiserProps` through `useBuilding.update`. The warnings of `riserWarnings` show under the list.
- Verify: browser check with real clicks; screenshot `B4-T09-tab`.
- Depends on: B4-T07, B3-T05.

**B4-T10 part check.**
- Files: `<work>/b4-check.mjs`.
- Verify: the whole flow on the two fixtures with real input: make, attach, move on both sides, type change (per D-B-13), delete a level (refused), export Building and read the xlsx; `pnpm build --force`; core and UI tests. Screenshots of each step.
- Depends on: B4-T09.

## 6. Decisions

Answered: D-B-04, D-B-07 A. Open (user): **D-B-13** (type change on a riser run: A cascade with pending ops, B refuse, C only the run, which breaks rule 2), **D-B-14** (anchor in pt with a check of size, rotation and scale, or in mm), **D-B-18** (flow direction and source level: stored, A recommended), **D-B-20** (vertical cable length of a circuit across levels: warn only, A recommended). Director defaults: D-B-19 (elevation = finished floor height, "Floor-to-floor length"), D-B-21 (pending ops apply outside undo and make the document dirty), D-B-22 (150 mm anchor spacing warning). See the spec, section 6. Until the user answers D-B-13, B4-T01 to B4-T04 and B4-T06 can run. T05, T07 (the retag part) and T08 wait. The recommendation for the first release is B with the refusal text; A is the full design.

Browser checks of B4 load the building through the dev-only hook of B1-T21 and then use real right-clicks (see B4-T06).

## 7. Order and parallel work

T01, T02, T03 in core in order. T03 does not wait for the scene. T04 after T02. T05 after the D-B-13 answer. T06, T07, T08, T09, T10 in order. B4 needs B1 to B3 done, because it uses the building file, the dialog and the takeoff.

## 8. Where B4 stops

B4 ends with risers in the file, in the scene, in the dialog and in the takeoff. Not in B4: flow or sizing across levels, auto-routing of risers (R6 still refuses multi-page documents), risers that change x and y on one level (D-B-04 forbids), a 3D view, and shared "typical floor" sheets (D-B-02 forbids).
