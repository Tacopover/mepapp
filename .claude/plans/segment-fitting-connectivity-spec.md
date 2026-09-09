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
