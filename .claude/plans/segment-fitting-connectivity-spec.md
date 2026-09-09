# Segment/fitting connectivity — chained drawing, drag propagation, undo — spec

Priority 1 of two split specs (see [[ports-custom-element-editor-spec]] for
priority 2). Scope: a user can draw a connected chain of segments, then
select and drag any fitting, Terminal, or Equipment and have every segment
attached to it follow — correctly, atomically, and undoably, including when
several connected nodes are dragged together. Ports don't need to exist yet
for this: any stamp with no explicit ports gets a synthetic center
connection point as a bridge (§5, Phase 5).

## 1. Source investigated

`/root/MepSketcher` (legacy WPF app):
- Propagation: `MepSketcherTools/Utilities/ConnectedSegmentUpdater.cs`,
  `PortPositionHelper.cs`; `MepSketcherTools/Commands/MoveElementCommand.cs`,
  `SegmentDragCommand.cs` (`MoveNodeCommand`), `MultiMoveCommand.cs`,
  `RotateElementCommand.cs`, `MultiRotateCommand.cs`;
  `MepSketcherTools/MEP/Node.cs`, `Segment.cs`, `Fitting.cs`, `IPose.cs`;
  `MepSketcherTools/Selection/MepDragHandler.cs`.
- Chained drawing: `MepSketcherTools/Tools/MepSegmentCreate.cs`,
  `StartEndPointCreate.cs`, `ToolManager.cs`.

`/root/MepApp` current state, read directly: `packages/core/src/network.ts`,
`stamp.ts`, `segmentTool.ts`, `commands.ts`; `packages/render/src/scene.ts`
(drag state machine ~1650-1820, `onDrawSegmentClick`/`resolveDrawTarget`
~2000-2070, `hitTest` ~1281-1300, `resolveSelectableBoundsWorld` ~1335,
`syncDrawingLayer` ~2098), `packages/render/src/document.ts` (`SketchDocument`,
`DrawingState`, `doc.stamps`).

## 2. What the old app does

### 2.1 Propagation — one shared, push-based re-seat routine

Every mutation path (drag, single rotate, multi-move, multi-rotate — the
class comments on `MultiMoveCommand`/`MultiRotateCommand` say this
explicitly) is forced through one static method,
`ConnectedSegmentUpdater.RestoreEndpointsToPorts(node, ...)`
(`ConnectedSegmentUpdater.cs:31-76`): after a node's position/rotation
changes, it iterates **every** segment in `node.Segments` and calls
`segment.SetStartPoint`/`SetEndPoint` on each, resolving the world position
live via `PortPositionHelper.GetPortWorldPosition` (never cached). `Node`
itself (`Node.cs`) is a bare segment-collection with no position and no
events — an earlier design that tried to make `Node` own position and push
updates itself is present as **dead, commented-out code**
(`Node.cs:79-90`), deliberately abandoned in favor of orchestration living
in the command/drag-handler layer.

`Segment.Startpoint`/`Endpoint` are live proxies onto the backing PDF line
annotation (`IPose.cs:27-94`) — no separate cached geometry field to keep
in sync for normal segments. `StartNodeId`/`EndNodeId` (`Segment.cs:58-59`)
are a **permanent** endpoint→node mapping, decoupled from the swappable
`FromNode`/`ToNode` references, so the re-seat routine always knows which
physical line endpoint belongs to which node even after a topology edit.

**Multi-select drags** avoid double-updating a segment whose both endpoints
are selected via a dedup pass before any writes: a `HashSet<string>
processedSegmentIds` guards a `ClassifySegment` closure
(`MepDragHandler.cs:1578-1609`), and final endpoints are written into a
`Dictionary<string, (Point, Point)>` **keyed by segment ID**
(`MepDragHandler.cs:1754`) so even a segment discovered from both ends only
gets one entry, applied once.

**Undo/redo doesn't snapshot the cascaded segments at all.** Because
segment geometry is a pure function of node position (via
`GetPortWorldPosition`), undo just restores the node's old position and
reruns the same forward re-seat call — the segments come back correct
automatically (`MultiMoveCommand.cs:8-10`: *"Connected segment endpoints
are updated as a side-effect of restoring the node position, so they are
not recorded here"*). The only explicit before/after snapshots
(`SegmentMoveRecord`/`SegmentRotateRecord`) are for a segment dragged
independently, with **neither** endpoint node in the selection.

**Rotation** uses the identical routine: `Terminal.ApplyRotation` only
changes the stored rotation; `GetWorldPortPositions()` recomputes every
port's world position live from position+rotation+fraction on every call,
so the very next `RestoreEndpointsToPorts` call picks up the new port
positions automatically (`Terminal.cs:260-323`, `RotateElementCommand.cs:43-55`).
`Fitting.Rotation`/`SetRotation` both `throw NotImplementedException` —
fittings never rotate.

**Known risk, explicitly flagged by the research**: correctness rests
entirely on every mutation call site remembering to call
`RestoreEndpointsToPorts`. No automated test covers this; a forgotten call
at a new call site silently leaves segments detached. Worth closing off
structurally in the rewrite rather than by convention (§4).

### 2.2 Chained segment drawing

`MepSegmentCreate` (subclass of `StartEndPointCreate`): click 1 sets the
start point; each subsequent click places one segment then reassigns
`_startNode = endNode` (`MepSegmentCreate.cs:1067`) — that reassignment is
the entire chaining mechanism. Chain **ends** on connecting to a
**Terminal** (auto `EndCurrentTool`), **Escape** (global handler,
`ToolManager.cs:1409`), or right-click → Cancel; connecting to
**Equipment** or a **Fitting** continues the chain. Snap priority per
click: a nearby port; failing that, if the click is anywhere on a ported
element's body, force-snap to its nearest port regardless of distance
(`HighLighter.TrySnapToPort`, effectively unlimited threshold for
`HasUserDefinedPorts` elements); then an existing fitting; then an existing
segment's interior (breaks it, inserts a fitting); otherwise a new free
`Fitting`.

Deletion cleanup, for reference (not in this phase's scope, §5 Phase 6):
`DeleteSegmentWithCleanupCommand` removes an endpoint fitting left with
zero segments; `DeleteFittingWithMergeCommand` merges the two segments of a
2-segment fitting into one, carrying port references through.

## 3. Current MepApp state

Confirmed directly against code (two research passes this session):

- **Fittings are rendered but not selectable.** `syncDrawingLayer`
  (`scene.ts:2098-2100`) already draws every fitting as a small orange
  circle (radius 6 world units) — the visual exists. But `hitTest`
  (`scene.ts:1281-1300`) only iterates `doc.stamps` and
  `state.annotations`; `SelectableRef` (`scene.ts:342`) is only
  `{kind:'stamp'} | {kind:'annotation'}` — no `'fitting'` variant.
  `resolveSelectableBoundsWorld` (`scene.ts:1335`) likewise only switches
  on stamp/annotation. Segments themselves have no hit-test branch either.
- **Segment geometry never updates after creation.** `Segment.geometry:
  Vec2[]` is a plain snapshot (first/last point = endpoint world position
  *at draw time*, per the doc comment at `network.ts:56`) — nothing
  recomputes it when a connected fitting or stamp moves. No
  `updateSegmentCommand`/`moveFittingCommand`/equivalent exists (confirmed,
  grep returns nothing).
- **Stamp position is not part of the undoable state at all.** `doc.stamps`
  (`document.ts:64`, a plain `Map<string, StampEntry>`) is mutated directly
  — `setStampTransform` (`scene.ts:1242-1247`) does `entry.data = {
  ...entry.data, transform }` with no `CommandManager` involved anywhere.
  Compare `doc.drawingHistory: CommandManager<DrawingState>`
  (`document.ts:67`), where `DrawingState = { segments, fittings,
  annotations }` (`document.ts:17-21`) — **stamps are not a field of
  `DrawingState`**. `document.ts:16`'s own doc comment already flags this
  as a known gap: *"kept separate from the pre-existing, not-yet-undoable
  stamp placement state (see decisions log 2026-09-06)."* Stamp rotate and
  the Properties-panel position field go through the same unguarded path.
- **`CompositeCommand<S>` is generic and already used for multi-step atomic
  undo** (`commands.ts:137-184`; e.g. `onDrawSegmentClick`'s fitting+segment
  bundle, `scene.ts:2038-2043`) — but every use today is bound to
  `S = DrawingState`, which doesn't include stamps. A command can't
  atomically bundle a stamp-position-change with N segment updates while
  they live in two different, incompatible state containers.
- **`Command<S>`** (`commands.ts:15-28`) is an explicit `execute`/`undo`
  pair the author writes by hand — no automatic before/after diffing.
  `Transaction<S>` (`commands.ts:192-222`) already exists for "many live
  drag steps, one committed undo entry" (used today for annotation
  move/rotate/resize) and is the natural fit for a live fitting/stamp drag
  preview too.
- **Segment drawing is strictly two-click**, not a chain — `scene.ts:2008`'s
  `onDrawSegmentClick` unconditionally resets `pendingSegmentStart = null`
  after one segment (`scene.ts:2025`); the doc comment at `scene.ts:2001`
  calls this out explicitly.

## 4. Decisions (asked and answered this session)

- **Ports and custom element authoring are a separate spec**, built second
  — see [[ports-custom-element-editor-spec]]. This spec does not wait on
  it: segments connect to a synthetic center point on any port-less stamp
  in the meantime (§5, Phase 5).
- **Unify `PlacedStamp` position/transform/ports into `DrawingState`**
  (rather than a bolted-on dual-undo-stack wrapper). `doc.stamps` becomes a
  render-only cache of `{ sprite, baseScale }`, keyed by id, resynced from
  `DrawingState.stamps` the same way `syncDrawingLayer` already resyncs
  fitting/segment graphics. This is the bigger of two options, but it's
  required for correctness (a stamp-move + cascaded-segment-update has to
  be one atomic, one-undo-step operation, which is impossible across two
  separate state containers) and it closes the pre-existing "stamp moves
  aren't undoable" gap as a direct side effect, rather than leaving it for
  someone else to hit later.

## 5. Implementation scope, phased

### Phase 0 — Unify stamp state into `DrawingState` (prerequisite for Phases 3+)

Add `stamps: Record<string, PlacedStamp>` to `DrawingState`
(`document.ts:17-21`). `doc.stamps` keeps only the PixiJS-side cache:
`{ sprite: Sprite; baseScale: Vec2 }`, no `data` field — every read of a
stamp's position/transform/ports/category/definitionId goes through
`DrawingState.stamps[id]` instead. Every current direct mutation site needs
to become a `Command<DrawingState>`: `setStampTransform`
(`scene.ts:1242-1247`), `placeStamp` (`scene.ts:1899-1921`), stamp deletion
(`scene.ts:1923`), and the Properties-panel position setter
(`scene.ts:1226-1235`). `hitTest`, `resolveSelectableBoundsWorld`, and every
`getStampWorldPorts` caller need to read from the new location.

This is the largest, most cross-cutting piece of this whole spec — it
touches nearly every stamp code path in `scene.ts` even though it adds no
new user-facing behavior by itself (stamp moves simply become undoable,
which they already should have been). Treat it as its own preparatory
change, landed and verified (existing stamp-placement/move/rotate tests
still pass, stamp moves now show up in the undo stack) before layering
Phases 3-4 on top. Not a blocker for Phases 1-2, which are fitting-only and
don't touch stamps at all.

**Verify before starting**: how `doc.stamps` is currently persisted in the
saved project file (`project.ts`) — is `PlacedStamp` data already part of
the saved document schema outside `DrawingState`, or not persisted at all
today? This determines whether Phase 0 is purely a runtime-state migration
or also a save-schema migration.

### Phase 1 — Fitting select + single-drag, cascades to connected segments

Ships independently of Phase 0 — fittings already live in `DrawingState`.

- Extend `SelectableRef` with `{ kind: 'fitting'; id: string }`; add a
  fitting branch to `hitTest` (hit-test against the drawn 6-unit circle,
  with a slightly generous screen-px click target) and to
  `resolveSelectableBoundsWorld`.
- New pure module in `packages/core` (e.g. `connectivity.ts`):
  - `resolveConnectionPointWorld(point: ConnectionPoint, state: Pick<DrawingState, 'fittings' | 'stamps'>): Vec2`
  - `recomputeAttachedSegments(state: DrawingState, changed: ConnectionPoint[]): Record<string, Segment>` —
    finds every segment whose `endpointA`/`endpointB` shares a
    `nodeKeyOf` (reusing `network.ts`'s existing function, so port-group
    members count as the same node) with any changed point, and rewrites
    that segment's `geometry`'s first/last point via
    `resolveConnectionPointWorld`. Always recomputes **both** ends fresh
    on every call — idempotent, can't drift, mirrors the old app's
    "derive live, never cache" principle instead of its "remember to call
    the re-seat routine" convention (closing off §2.1's flagged risk
    structurally: there's exactly one path that changes a fitting's
    position, and it always calls this).
- New `Command<DrawingState>`: `moveFittingCommand(fittingId, from, to)` —
  `execute` sets the fitting's position and merges in
  `recomputeAttachedSegments`'s output; `undo` does the same with `from`.
  One command, one undo step — matches the old app's "restore position,
  rerun the same recompute" pattern, just expressed as a pure
  execute/undo pair instead of a replay.
- Wire into `scene.ts`'s drag state machine: live preview via
  `Transaction<DrawingState>` (same pattern already used for annotation
  drag), committing to the `Command` above on pointer-up.

### Phase 2 — Multi-select drag including fittings

Generalizes Phase 1's single-fitting drag to a mixed selection (fittings +
annotations, and once Phase 0 lands, stamps): apply each selected node's
position delta, then call `recomputeAttachedSegments` **once** with the
full list of changed connection points from the whole gesture — not once
per node — so a segment with both endpoints in the selection is still only
recomputed once, adapting the old app's dedup-by-ID lesson to this
pure-recompute design (idempotence already prevents a correctness bug here;
computing once per gesture instead of once per node is purely to avoid
redundant work, not a bug fix).

### Phase 3 — Stamp drag cascades to connected segments (needs Phase 0)

Once stamp position lives in `DrawingState`, generalize Phase 1's
`moveFittingCommand` into a shared `moveNodeCommand` used for both fittings
and stamps — mirroring the old app's single shared
`ConnectedSegmentUpdater` for every mutation path, not a second parallel
implementation for stamps.

### Phase 4 — Stamp rotate cascades to connected segments (needs Phase 0/3)

Same shared recompute function, invoked after a rotation changes a stamp's
transform — since `resolveConnectionPointWorld` for a port always derives
from the stamp's live transform (already true today, `getWorldPortPosition`
in `geometry.ts`), this falls out of Phase 3's plumbing rather than needing
new geometry math.

### Phase 5 — Bridge: synthetic default port

Any stamp with `ports.length === 0` gets an implicit connection point at
its center (reserved id, e.g. `'__center__'`, fractionX = fractionY = 0.5)
synthesized wherever ports are read for connection purposes
(`getStampWorldPorts` in `stamp.ts`, and `resolveSegmentEndpoint` in
`segmentTool.ts`). No `ConnectionPoint` schema change needed — it's still
`{ kind: 'port', elementId, portId: '__center__' }`, so this is forward-
compatible: once real ports are authored later (via the sibling spec),
segments already connected to the synthetic center port simply keep
working, or get migrated to a real port if one lands at the same position.
This makes Phase 3/4's stamp cascade meaningful for every existing stamp
today, not just the three built-ins that happen to already have a real
port.

### Phase 6 — Chained (click-click-click) segment drawing tool

Carried over from the connectivity/ports research done earlier this
session; independent of Phases 0-5 (only touches the two-click drawing
flow, not drag/undo):

- Replace `scene.ts:2025`'s unconditional `pendingSegmentStart = null`
  with a rule mirroring §2.2: after committing a segment, if the resolved
  endpoint is `{ kind: 'fitting' }`, **continue**
  (`pendingSegmentStart = resolved`); if it's a port on a stamp whose
  `category === 'terminal'`, **end** the chain; `category === 'equipment'`
  **continues**.
- Escape cancels an in-progress chain (clear `pendingSegmentStart`, drop
  the preview overlay) — leave the Segment tool active rather than forcing
  a tool switch, since MepApp's rail-based tool model has no equivalent of
  the old app's auto-revert-to-pan convention. **Verify** MepApp's current
  global-key-handling location before wiring this in.
- Force-snap fix in `resolveSegmentEndpoint`: before falling through to
  fitting/break/new-fitting logic, check whether the click landed inside a
  ported stamp's hit-bounds; if so and `ports.length > 0`, snap to its
  nearest port regardless of the normal snap radius (new branch before the
  existing port-distance loop, `segmentTool.ts:38-44`).

### Phase 7 — Deferred / not scoped further here

Angle/alignment/intersection snapping during chain-draw or drag (own atlas
rail item, "Snap Angle selector"); hidden segments
(`CreateHiddenSegmentCommand` equivalent); `DeleteFittingWithMergeCommand`
parity (merge a 2-segment fitting's segments on delete); whether deleting a
segment today already cleans up an orphaned endpoint fitting (**verify**,
not confirmed either way); whether MepApp needs an old-app-style
`ConnectionValidator` (NetworkType-level compatibility check on connect) —
not confirmed either way whether an equivalent exists today.

## 6. Recommended build order

1. **Phase 1 + 2** (fitting select/drag, single and multi) — ships first,
   entirely within already-undoable `DrawingState`, no dependency on
   Phase 0. Delivers real value on its own: fitting-only duct/pipe runs
   already drag correctly and undo correctly end to end.
2. **Phase 0** (stamp state unification) — do this carefully as its own
   change, verified independently, before building on top of it.
3. **Phase 3 + 4** (stamp drag/rotate cascade) — needs Phase 0.
4. **Phase 5** (synthetic center port) — small, unlocks Phase 3/4 for every
   stamp, not just the three with real ports today. Can land any time
   after Phase 3, or earlier if useful for testing Phase 3 sooner.
5. **Phase 6** (chained drawing) — independent of everything else; can be
   done in parallel with Phases 0/3/4 if convenient, or first if the team
   wants an easy, self-contained win before the bigger state-unification
   work.
6. **Phase 7** — explicitly deferred.

## 7. Open verification items

- Current persistence shape of `doc.stamps` in the saved project file
  (Phase 0).
- Global Escape-key handling location (Phase 6).
- Whether segment deletion already cleans up orphaned fittings (Phase 7).
- Whether a NetworkType-level connection-compatibility check exists today
  (Phase 7).

None of these block starting Phase 1.

## 8. Phase 1 + 2 status

**Done** — 2026-09-09, commit `c3008ba` on `worktree-segments-ports-custom-elements-spec` (pushed to origin, not yet merged to master).

Shipped: new pure `packages/core/src/connectivity.ts`
(`resolveConnectionPointWorld`, `recomputeAttachedSegments` — 9 vitest
cases, all passing) plus its `index.ts` export. `packages/render/src/scene.ts`:
`SelectableRef` gained a `'fitting'` variant; `hitTest` and
`resolveSelectableBoundsWorld` both handle it (new
`FITTING_MARKER_RADIUS_WORLD`/`FITTING_HIT_RADIUS_SCREEN_PX` constants,
the latter matching §5 Phase 1's "generous screen-px click target"); a
new `selectableRefForId` helper replaces three duplicated
stamp-or-annotation ternaries now that there are three kinds, not two;
`stampsRecord()` adapts `doc.stamps` for `recomputeAttachedSegments`'s
`ConnectivityGraphState` input. The existing `move-selection` drag
state (already generic over a mixed selection, single or multi) gained
a `fittingSnapshot` alongside `annotationSnapshot`, and its
`annotationTx` was generalized to `drawingTx`: on every pointermove it
now also writes moved fittings' positions and calls
`recomputeAttachedSegments` once per gesture with every moved fitting's
connection point, merging the returned segment updates into the same
transaction — so a fitting drag/multi-drag, its segment cascade, and
the undo entry are genuinely one atomic step, and Phase 2's
"recompute once per gesture, not once per node" is satisfied by
construction (the loop already collects every changed point before the
single `recomputeAttachedSegments` call). Fittings never rotate (per
§2.1's old-app source read), so `rotate-selection` was left untouched.

Verified: `pnpm build` clean across all 9 workspace packages;
`pnpm vitest run` in `packages/core` — 118/118 passing (109 pre-existing
+ 9 new); `tsc --noEmit` clean in `packages/render`. Exercised live via
a scripted Playwright session against `pnpm dev` (no project run-skill
existed for this repo yet): drew a 3-fitting/2-segment chain, dragged
the shared middle fitting — both segments followed, endpoints away from
the drag stayed fixed; undid the drag — position and segment geometry
correctly reverted in one step; multi-selected both end fittings and
dragged them together — both segments recomputed correctly from a
single gesture. No console/page errors in any of it.

**Found, not fixed (pre-existing, out of scope for this spec):**
`SketchScene.undoDrawing()`/`redoDrawing()` never call
`redrawOverlay()`, so a selection's highlight box/rotation-handle
overlay visibly stays at its pre-undo position for one frame until the
next redraw-triggering interaction — cosmetic only (the underlying
`DrawingState` and canvas geometry both revert correctly), pre-dates
this change, and would affect an undone annotation/stamp move too, not
just fittings. Worth a one-line follow-up (`this.redrawOverlay();` in
both methods) whenever someone's next in `scene.ts`.

Not done: Phase 0 (stamp state unification — prerequisite for Phase
3/4's stamp-drag cascade), Phase 3-7. This plan file stays until every
phase is done — see CLAUDE.md's plan-file convention.

## 9. Phase 0 status

**Done** — 2026-09-09, on `worktree-segments-ports-custom-elements-spec`
(pushed to origin, not yet merged to master).

Shipped: `packages/render/src/document.ts`'s `DrawingState` gained
`stamps: Record<string, PlacedStamp>`; `StampEntry` dropped its `data`
field down to `{ sprite, baseScale }` — the PixiJS-only render cache
the spec called for, with `PlacedStamp` data now read from
`DrawingState.stamps[id]` everywhere. `packages/render/src/scene.ts`:
every direct stamp mutation site named in §5 Phase 0 — `setStampTransform`
(replaced by a `Transaction`-backed `applyStampTransform` helper used by
`setSelectedRotationDegrees`/`setSelectedPosition`), `placeStamp`, stamp
deletion, plus `setStampProperty`/`applyCustomPropertyCascade` (mutated
`entry.data` before, so needed the same treatment once `data` moved) —
now go through `createStampCommand`/`Transaction<DrawingState>`, so a
stamp move/rotate/property-change/place/delete is undoable for the
first time. `rotateSelectionBy` and the drag-rotate handle
(`rotate-selection`) were unified to cover stamps and annotations in
one `Transaction` (previously stamps rotated with no undo at all, in a
separate code path from annotations); `move-selection`'s drag now
folds stamp position updates into the same `drawingTx` already used for
fittings/annotations, alongside Phase 1's fitting cascade. Every
geometry helper that only needed `PlacedStamp` fields (`stampCornersWorld`,
`stampWorldBounds`, `hitTest`'s stamp loop, `resolveSelectableBoundsWorld`,
`domainSyncEntries`, the rubber-band hit test) was migrated to take
`PlacedStamp` directly and read `state.stamps` instead of the old
`entry.data`; `stampsRecord()` (a Phase 1 addition) became dead code
once stamps lived in `DrawingState` and was deleted rather than kept as
a trivial passthrough.

Key design decision — sprite lifecycle across delete/undo: a deleted
stamp's sprite is detached from `stampsLayer`, never destroyed (new
`syncStampSprites`, called from `syncDrawingLayer`, reconciles sprite
attachment/transform against `DrawingState.stamps` every time). An
undo has to be able to re-attach the exact same sprite instead of
re-fetching its texture, since that fetch is async (`resolveIconBitmap`)
and, for an ad hoc uploaded stamp with no saved bytes, not even
possible. Traded off: a deleted-then-never-restored stamp's sprite
stays resident in `doc.stamps` for the rest of the session (bounded by
`CommandManager`'s 50-entry history in principle, but nothing actually
evicts the sprite once its command falls off the stack) — a small,
accepted memory-retention cost, not a correctness issue.

**Verify before starting** (§7's open item): confirmed `packages/core/src/project.ts`
already persists `stamps: PlacedStamp[]` as a top-level `ProjectDocument`
field, parallel to `segments`/`fittings`/`annotations`, since schema
version 2 (2026-09-06's Terminal/Equipment category migration) — Phase 0
was purely a runtime-state migration in `packages/render`, not a save-schema
change. `exportProject`/`loadProjectFromJson` were updated to read/write
`DrawingState.stamps` instead of `doc.stamps`'s `.data`, with no
`ProjectDocument`/migration changes needed.

**Found and fixed** (widened, not just documented, from Phase 1's
note): `SketchScene.undoDrawing()`/`redoDrawing()` never called
`redrawOverlay()` or re-emitted `selectionChanged`. Phase 1 only
observed this as a cosmetic one-frame-stale selection box. Phase 0
exposed a real-data-correctness version of the same bug: after
undoing a stamp move/rotate, the Properties panel kept showing the
pre-undo X/Y/rotation values (confirmed via Playwright screenshot,
`p0-03-move-undone` before the fix) because nothing told the panel to
re-read the reverted state. Fixed by adding `this.redrawOverlay()` and
`this.emitter.emit('selectionChanged', this.getSelection())` to both
methods.

Verified: `pnpm build` clean across all 9 workspace packages;
`pnpm vitest run` in `packages/core` — 118/118 passing, unchanged (no
core-package schema touched); `tsc --noEmit` clean in `packages/render`.
Exercised live via a scripted Playwright session against `pnpm dev`:
placed a stamp (undoable — Undo button enables immediately), dragged it
(position updates, Properties panel and overlay box both track live),
undid the move (position and Properties panel both correctly revert),
redid it, rotated it 90° via the rail's flyout action (now one
`Transaction`, undoable), undid the rotation, deleted it (disappears,
selection clears), undid the delete (sprite correctly reappears at its
prior position — confirms the detach-not-destroy design), and re-ran
Phase 1's fitting-drag-cascade regression test (draw a 3-fitting chain,
drag the shared middle fitting, undo) to confirm the shared drag state
machine still works correctly after this refactor. No console/page
errors in any of it.

Not done: Phase 3 (stamp drag cascades to connected segments — now
unblocked, since stamp position lives in `DrawingState`), Phase 4
(stamp rotate cascade), Phase 5 (synthetic center port), Phase 6
(chained drawing), Phase 7 (deferred). This plan file stays until every
phase is done.

## 10. Phase 3 + 4 + 5 status

**Done** — 2026-09-09, on `worktree-segments-ports-custom-elements-spec`
(pushed to origin, not yet merged to master).

Shipped, in one pass since all three were small and tightly coupled
once Phase 0 landed:

- **Phase 3/4** — `packages/render/src/scene.ts` gained two shared
  private helpers: `stampPortConnectionPoints(ids, stamps)` (every
  connection point a set of stamps' own ports offer — the render
  layer's "which nodes did this touch" list) and
  `applyConnectivityCascade(state, changed)` (calls core's
  `recomputeAttachedSegments` and merges the result, or returns `state`
  unchanged if `changed` is empty). Every stamp-transform mutation path
  now funnels through these two — `move-selection`'s drag, `rotate-
  selection`'s drag, the instant `rotateSelectionBy` rail action, and
  `applyStampTransform` (the typed Properties-panel X/Y/rotation
  setters) — mirroring Phase 1's fitting cascade and closing the same
  "forgotten call site" risk §2.1 flags, now for every node kind, not
  just fittings. Phase 4 needed no separate geometry work, exactly as
  the spec predicted: `getWorldPortPosition` already derives a port's
  position live from the stamp's current transform, so once a rotation
  is written into `state.stamps` before the cascade call, the recompute
  picks up the new port position automatically.
- **Phase 5** — new `packages/core/src/stamp.ts` export
  `getStampPorts(stamp)`: returns `stamp.ports` unchanged when
  non-empty, or a single synthetic `{ id: '__center__', fractionX: 0.5,
  fractionY: 0.5 }` port when empty. `SYNTHETIC_CENTER_PORT_ID` is
  exported alongside it. Every connection-resolution call site now goes
  through this instead of reading `stamp.ports` directly:
  `getStampWorldPorts` (stamp.ts, which `resolveSegmentEndpoint` in
  segmentTool.ts already calls, so the two-click draw tool picked up
  the bridge with no changes of its own), `resolveConnectionPointWorld`
  (connectivity.ts), and `stampPortConnectionPoints` (scene.ts, above).
  UI that lists a stamp's own *authored* ports (`PropertiesPanel`'s
  port-group checkbox list, `StampInfo.ports`) deliberately still reads
  `stamp.ports` raw — a synthetic port isn't a real one a user can
  choose to group. No `ConnectionPoint` schema change, as the spec
  anticipated: the synthetic port is a normal `{ kind: 'port',
  elementId, portId: '__center__' }`, so it keeps working unchanged if
  a real port is later authored at the same position.

Verified: `pnpm build` clean across all 9 workspace packages;
`pnpm vitest run` in `packages/core` — 125/125 passing (7 new: two in
`stamp.test.ts` for `getStampPorts`'s two branches, two in
`connectivity.test.ts` for a stamp-driven cascade and the synthetic-
port cascade, one in `segmentTool.test.ts` for snapping to a port-less
stamp); `tsc --noEmit` clean in `packages/render`. Exercised live via a
scripted Playwright session: placed a "Supply Grille" (one real,
authored port) and drew a segment to its port, then dragged the stamp
(segment endpoint followed — confirmed structurally via the fitting
count staying at 1, i.e. the click genuinely snapped to the port rather
than creating a second bare fitting) and rotated it 90° (segment
endpoint moved to the rotated port position), undoing each; placed a
"Fire Hose Reel" (zero authored ports) and drew a segment directly onto
its body — snapped to the synthetic center port — then dragged it and
confirmed the segment's endpoint tracked the stamp's center exactly,
undoing correctly in one step. No console/page errors in any of it.

Not done: Phase 6 (chained click-click-click segment drawing) and
Phase 7 (explicitly deferred). This plan file stays until Phase 6 is
either done or explicitly dropped alongside Phase 7.

## 11. Phase 6 status — spec complete

**Done** — 2026-09-09, on `worktree-segments-ports-custom-elements-spec`
(pushed to origin, not yet merged to master). This was the last
non-deferred phase — see the closing note below.

Shipped, all three sub-items from §5 Phase 6:

- **Chaining**: `packages/render/src/scene.ts`'s `onDrawSegmentClick`
  no longer unconditionally clears `pendingSegmentStart` after
  committing a segment. A new `chainContinuationFrom(resolved, stamps)`
  helper re-arms it from the endpoint just placed when that endpoint is
  a bare fitting, or a port on a stamp whose `category === 'equipment'`
  (a pass-through node); a port on a `'terminal'` stamp (an end-use
  device) or a dangling reference ends the chain (returns `null`) —
  matches §2.2's rule and the old app's `MepSegmentCreate`.
- **Escape cancels an in-progress chain**: verified first (§7's open
  item) that `SketchScene.onKeyDown` — bound once via
  `window.addEventListener('keydown', ...)` in `init()` — is the only
  existing global key-handling location (everything else found by grep
  was scoped to one React input's own `onKeyDown`, e.g. rename-editing
  fields, dialogs). Added an `Escape` branch there, ignored while focus
  is in a text input same as the existing Delete/Backspace branch;
  clears `pendingSegmentStart` and redraws the overlay. The Segment
  tool itself stays active (no tool-switch), since MepApp's rail has no
  equivalent of the old app's auto-revert-to-pan.
- **Force-snap fix**: `packages/core/src/segmentTool.ts`'s
  `resolveSegmentEndpoint` gained a new branch, checked before the
  existing radius-based port loop: a click anywhere inside a stamp's
  own rotated body (`pointInRotatedRect` + `getStampHalfExtents`) now
  force-snaps to that stamp's nearest port, regardless of the normal
  snap radius — matching the old app's `HighLighter.TrySnapToPort`.
  Scoped to `stamp.ports.length > 0` (real authored ports only), exactly
  as the spec specified — a port-less stamp's Phase 5 synthetic center
  point still only snaps within the normal radius, not its whole body,
  since force-snapping an entire large stamp's silhouette to one
  synthetic point would be a much bigger target than the spec asked for.

**Verify before starting** (§7's open items): the Escape-handling
location question above is answered. The other two open items —
whether segment deletion already cleans up an orphaned endpoint fitting,
and whether a NetworkType-level connection-compatibility check exists —
were never resolved and are carried into §5 Phase 7, which stays
explicitly deferred (not part of this spec's completion).

Verified: `pnpm build` clean across all 9 workspace packages;
`pnpm vitest run` in `packages/core` — 127/127 passing (4 new: one
confirming a click anywhere on a real-ported stamp's body force-snaps
to its nearest port past the normal radius, one confirming a port-less
stamp's whole body does *not* force-snap this way — only its synthetic
center's normal radius applies); `tsc --noEmit` clean in
`packages/render`. Exercised live via a scripted Playwright session:
drew a chain into a placed Terminal's port and confirmed the chain
correctly ended there (the very next click started a brand-new,
unconnected segment — verified via segment/fitting/network counts and
visual gaps in the screenshots); drew a chain through two bare
fittings, pressed Escape mid-chain, and confirmed the next click again
started a fresh, unconnected segment rather than continuing. No
console/page errors in any of it.

**Spec complete.** Every phase in §5 except Phase 7 (explicitly
deferred: angle/alignment snapping, hidden segments,
`DeleteFittingWithMergeCommand` parity, and the two unresolved §7
verification items above) is now shipped and verified: Phase 0
(commit `335454a`), Phase 1+2 (commit `c3008ba`/`259eb79`), Phase 3+4+5
(commit `a8c4dcb`), Phase 6 (this commit). Per CLAUDE.md's plan-file
convention, this file is a candidate for deletion by `/session-handoff`
once its summary lands in the Decisions-Log — Phase 7's deferred items
belong in a future spec of their own if the team picks them up later,
not as a reason to keep this file open indefinitely.
