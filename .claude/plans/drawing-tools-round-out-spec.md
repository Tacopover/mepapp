# Drawing tools round-out — spec (for a future session)

Scopes three gaps identified against the legacy MEPSketcher feature atlas: the generic
"place-stamp" tool doesn't distinguish Terminal from Equipment, segment drawing can't
start from a port because placed stamps never carry their ports, and none of
`pdf-engine`'s annotation kinds (freehand/line/shape/textbox/etc.) have a creation path
in `core`/`render`/`ui`. All three build on data shapes that already exist in the code —
no new packages, no schema redesign.

## 1. Source investigated

This session's codebase read of `packages/render/src/scene.ts`, `packages/core/src/{stamp-library,network,geometry,segmentTool}.ts`, `packages/pdf-engine/src/index.ts`, and `packages/ui/src/{Toolbar.tsx,App.tsx,useSketchScene.ts,StampsPanel.tsx}`.

## 2. Current state, in brief

**Tool system.** No `Tool` interface — one `SketchScene` class with a `SketchTool` union
(`'select' | 'pan' | 'place-stamp' | 'calibrate' | 'measure' | 'draw-segment'`, scene.ts:138)
and an if-chain in `onPointerDown` (scene.ts:894-985) that branches on `this.tool`. Adding a
tool means: a new `SketchTool` variant, a branch in the dispatch, an implementation method,
a `Toolbar.tsx` `TOOLS` entry, and — if the tool needs priming data (like a stamp texture) —
a `sceneRef.current.set…()` call from the UI before `setTool(...)`, same pattern
`StampsPanel.handlePick` already uses.

**Terminal vs Equipment.** `StampCategory` (`stamp-library.ts:12`) is `'terminal' | 'equipment' |
'fitting'` and already lives on `StampDefinition`. But `PlacedStamp` (`stamp.ts:6-14`) — the
placed-on-canvas instance — carries no category at all, and `placeStamp()` (scene.ts:1066-1088)
hardcodes `ports: []` regardless of what the definition specifies. So today "place-stamp" is one
undifferentiated tool because the placed data has nothing to differentiate on.

**Ports.** The model is fully designed and unused: `PortSpec`/`getWorldPortPosition`
(`geometry.ts:233-251`), `PlacedStamp.ports` + `getStampWorldPorts` (`stamp.ts:11,24-29`),
`ConnectionPoint`'s `{kind:'port', elementId, portId}` variant and `PortGroup`
(`network.ts:38-40,76-79`), and `resolveSegmentEndpoint` (`segmentTool.ts:38-44`) already
prefers snapping to a stamp's world ports before fitting/segment-interior. It resolves to
nothing today only because (a) `placeStamp` never copies `definition.ports` onto the placed
instance, and (b) every `computeNetworks`/`solveFlow`/`getNetworkSummaries` call in scene.ts
passes `portGroups: []` (scene.ts:465, 490, 527, 530) — no `PortGroup` is ever constructed.

**Annotations.** `AnnotationKind`/`AnnotationGeometry` (`pdf-engine/src/index.ts:11-36`) already
model `freehand | line | arrow | rectangle | circle | textbox | stickyNote | highlight | stamp`,
and `PdfDocumentHandle.addAnnotation/listAnnotations/deleteAnnotation` is a real, working
creation path — but it's a pure PDF-object API. The only caller anywhere is scene.ts's
drift-reconciliation sync code (`annotationSyncEntry` / `writeAnnotationForId`,
scene.ts:66-79, 712-751), and that only ever reads/writes `'line' | 'circle' | 'stamp'` — the
kinds that back segments/fittings/stamps, not user-drawn markup. There is no `Command`-based
create/undo, no `SketchTool` variant, no `DrawingState` field, and no render/ui code for
freehand, arrow, rectangle, textbox, stickyNote, or highlight. `grep` for `freehand` across
core/render/ui/apps returns zero hits outside pdf-engine's own type file.

## 3. Proposed scope, split in three parts

### Part A — split place-stamp into Terminal / Equipment tools — done, merged 2026-09-07

Smallest, most mechanical part.

**Implemented and merged to master** (commit `3265b75`): `PlacedStamp.category` added,
`placeStamp()` now copies the definition's ports (previously always `[]`), `SketchTool` split
into `'place-terminal' | 'place-equipment'`, toolbar/StampsPanel/App.tsx wired accordingly
(including two custom-upload tiles, one per category), and a v1→v2 schema migration backfills
`category` on old saves. Verified: `pnpm build`/`pnpm typecheck` clean, all 79 core tests pass,
and a live headless-browser smoke test confirmed the tool split and the port-copy fix (a placed
Switch terminal now carries its `feed` port, which was silently dropped before).

- Add a `category: StampCategory` field to `PlacedStamp` (`stamp.ts`), set from
  `getStampDefinition(definitionId).category` at placement time.
- Copy `definition.ports` onto the placed instance in `placeStamp()` instead of hardcoding
  `ports: []` — this is a prerequisite for Part B regardless, so do it here first.
- Replace the single `'place-stamp'` `SketchTool` value with `'place-terminal' | 'place-equipment'`
  (decided: two distinct tools, not one gated by category — matches the atlas' separate T/E
  hotkeys and keeps toolbar active-state simple). Toolbar gets two buttons instead of one, each
  priming from a stamp of the matching category (`StampsPanel` already knows each definition's
  category via `stamp-library.ts`, so filtering which picker feeds which tool is straightforward).
- Migration note: existing saved projects have `PlacedStamp` records with no `category` — schema
  migration needed (`core` already has a versioned migration chain per the atlas' persistence
  section; follow that pattern rather than inferring category from `definitionId` at load time
  if `definitionId` is ever optional/missing).

### Part B — port-based segment start — done, merged 2026-09-08

Depends on Part A's port-copying fix.

**Implemented and merged to master** (commit `40fb33f`): `computeNetworks`/`getDrawingSummary`/
`computeFlow` now build real `PortGroup` data from `SketchDocument.portGroups` instead of always
passing `[]`. Added a "Linked ports" checkbox control to the Properties panel (shown for
Equipment with 2+ ports) and `SketchScene.setPortGroup`/`ProjectDocument.portGroups` (schema v3,
with a migration defaulting old saves to `[]`). Kept D3's decision: no separate "Segment Create
From Port" tool — `resolveSegmentEndpoint` already unifies the snap logic in plain "Segment".

Verified: `pnpm build`/`pnpm typecheck` clean, all 80 core tests pass. Live-verified in a headless
browser: (1) drawing a segment onto a real placed Switch terminal's port produces
`endpointA: { kind: 'port', elementId, portId: 'feed' }` in the exported project — port-based
segment start working end-to-end, not just at the unit level; (2) since no shipped stamp fixture
currently has 2+ ports (fixtures policy forbids fabricating one), the "Linked ports" checkbox UI
was exercised by temporarily injecting a synthetic two-port test definition into the running dev
server via request interception — never written to the repo/fixtures — confirming checking both
ports creates a real `PortGroup`, partial/unchecking states behave correctly, and it round-trips
through the exported project JSON.

- With placed stamps carrying real `ports`, `resolveSegmentEndpoint` already snaps to them —
  verify this end-to-end once Part A lands (may need only a test, not new logic).
- Build `PortGroup` records instead of passing `portGroups: []` everywhere in scene.ts (the four
  call sites at lines 465/490/527/530), so that an Equipment element's linked ports (e.g. a
  multi-port AHU's supply-and-return) collapse into one connectivity node per `nodeKeyOf`
  (`network.ts:96-104`) — this is what the atlas calls "Multi-port equipment support." Decided:
  an explicit UI control, not an automatic naming convention — add a control to the properties
  panel that lets the user pick which ports on a selected element are linked into one
  `PortGroup`. Needs its own small design pass (which control shape: checkbox list of the
  element's `PortSpec`s, a pair-picker, etc.) before implementation.
- Port-hover highlight dots and angular snap guides while `draw-segment` is active near a stamp
  with ports are in scope as UX polish once the above works. Decided (D3): keep "Segment Create
  From Port" merged into the plain "Segment Create" tool rather than a separate tool — the atlas
  lists them separately, but `resolveSegmentEndpoint` already unifies the snap logic in one code
  path, so a second tool would add UI surface without new capability.

### Part C — wire up annotation tools (freehand / line / shape / textbox) — done, ready to merge 2026-09-08

Largest part — needs new state, not just new dispatch branches.

**Implemented** on branch `worktree-drawing-tools-part-c`, commit `12fe195` (built on top of current
`master` `01c27a6`, which had advanced far past this spec's `40fb33f`/`3265b75` baseline while this
session worked — see the merge note below). **Not yet fast-forwarded into `master`** — see "Merge
still pending" below; that's the one remaining step.

- Added `Annotation`/`AnnotationKind`/`AnnotationGeometry` to `core` (`annotation.ts`), covering
  `freehand | line | rectangle | circle | textbox` — a domain-owned mirror of pdf-engine's
  `AnnotationGeometry` shape for just the kinds this pass authors (`arrow`/`stickyNote`/`highlight`
  stay out of scope, still `tool: null` placeholders in `toolRegistry.ts`).
  `ProjectDocument.annotations` added, schema bumped to v4 with a v3→v4 migration defaulting old
  saves to `[]`.
- `DrawingState.annotations: Record<string, Annotation>` added to `SketchDocument`
  (`render/document.ts`), alongside a `createAnnotationCommand` (scene.ts) following the existing
  `createSegmentCommand`/`CompositeCommand` pattern — freehand is one command per whole stroke
  (built from a `draw-freehand` `DragState`, committed on pointerup), not one per point.
  `SketchTool` gained the four values verbatim per D4.
- Gestures: freehand = press-drag-release; line = two-click (reuses the `pendingPoints` scratch
  calibrate/measure already use); shape = press-drag-release, plain drag = rectangle, **Shift**+drag
  = circle (one tool per D4, disambiguated the same way rotate-selection already uses `shiftKey`);
  textbox = single click emits a `textboxRequested` event carrying screen coordinates, resolved by
  a floating `<textarea>` in `App.tsx` (`.mep-textbox-prompt`, positioned absolutely inside
  `.mep-canvas-wrap`, committed on Enter/blur, cancelled on Escape).
- `writeAnnotationForId`/`annotationSyncEntry`/`domainSyncEntries` (scene.ts) extended for all five
  kinds — this was indeed "mostly wiring": pdf-engine's `addAnnotation` already accepted the shapes,
  only the round-trip snapshot functions needed new per-kind branches.
- Toolbar: `packages/ui/src/toolRegistry.ts`'s "annotate" row already had reserved slots for these
  four tools (`tool: null` placeholders) from the since-merged "left tool rail" work — this pass
  just flipped them to the real `SketchTool` values, no new Rail/QuickAccessStrip code needed.
  Renamed the "Line/Arrow" label to "Line" since arrow support wasn't implemented (D4 lists four
  tools, not five) — trivial follow-up if wanted later via a Shift-modifier on the same tool, same
  pattern as the shape tool's rectangle/circle split.
- **A real bug found and fixed during smoke testing**: the textbox `<textarea>` originally used
  `autoFocus`, which raced the *same* click's own mousedown/mouseup — the browser's default focus
  handling (landing on `<body>`, since the canvas isn't focusable) fired *after* React's synchronous
  autoFocus, blurring the textarea and dismissing the prompt before it was ever visible. Fixed by
  deferring the `.focus()` call one macrotask (`setTimeout(…, 0)` in a `useEffect`) so it runs after
  the click's own default handling has already resolved.

**Merge still pending — two things for whoever picks this up (the user, or a session with
`/root/MepApp` access):**
1. **`master` moved substantially during this session** (`40fb33f` → `01c27a6`: dock-canvas-resize
   fix, Stamps/Network-Types sub-tab split, menu simplified to Open/Save/Save As, `DockPanel`
   replacing `DockviewShell`, and more) — a concurrent session's work, per this repo's
   known collision risk (Decisions-Log 2026-09-07). This session's worktree could not simply
   fast-forward the way Part A/B did; it rebuilt Part C's one real commit on top of current
   `master` via `git cherry-pick` (one resolved conflict, in `App.tsx`'s import list — trivial,
   `ProjectLoadError`/`ChangeEvent` diff from the menu-simplify work) rather than replaying every
   intermediate commit. Full build/typecheck/84 core tests/live smoke test all re-verified clean
   against this merged state (see below).
2. **This worktree-isolated session cannot push/force-update `master` itself** — git refuses any
   local ref update (`push .`, `branch -f`) to a branch checked out in another worktree
   (`/root/MepApp`), by design. The finished, fully-verified commit is sitting on branch
   `worktree-drawing-tools-part-c` (`12fe195`), one commit ahead of `master`, ready for a plain
   fast-forward merge (`git merge --ff-only worktree-drawing-tools-part-c` from `/root/MepApp`, or
   equivalent). No further conflict resolution should be needed — it's already built on current
   `master`'s tip.
3. Separately, **`origin/master` itself had already diverged from local `master`** before this
   session started (a `b7ba65b` "left tool rail" commit pushed to `origin` from elsewhere, never
   pulled into this container's local `master` — since reconciled locally: local `master` now has
   both that work and the `PortGroup`/linked-ports work merged, per the `master` log above). Whether
   `origin/master` needs a push to catch up is a separate decision for the user — not attempted here
   (no push was made to any remote in this session).

Verified: `pnpm build`/`pnpm typecheck` clean across all 10 workspace packages, all 84 core tests
pass (vitest). Live-verified in a headless browser against a real fixture PDF
(`fixtures/pdfs/arch_simple_A4.pdf`, no synthetic data written to the repo): drew one of each
annotation (freehand stroke, line, rectangle, Shift-drag circle, textbox with real committed text)
via the actual Rail tool buttons and mouse gestures; confirmed all five appear in `exportProject()`
with correct `AnnotationGeometry`; confirmed undo/redo removes/restores exactly one annotation per
step; confirmed "Sync to PDF" round-trips all five through the real mupdf `addAnnotation`/
`listAnnotations` API (`listAnnotations(0)` returned exactly the five expected kinds back). Re-ran
the same smoke test a second time against the final merged-onto-`master` state after the cherry-pick
to confirm the merge introduced no regression — same result, zero console errors both times.

## 4. Decisions (resolved 2026-09-07)

- **D1 — tool-splitting mechanism.** Two distinct `SketchTool` values, `'place-terminal'` and
  `'place-equipment'`, not one `'place-stamp'` tool gated by category.
- **D2 — how a user links two ports on one element into a `PortGroup`.** Explicit UI control in
  the properties panel, not an automatic naming convention. Exact control shape (checkbox list
  of the element's `PortSpec`s vs. a pair-picker, etc.) is still open and needs a short design
  pass at implementation time — see §3 Part B.
- **D3 — "Segment Create From Port" vs. plain "Segment Create."** Keep merged into one tool;
  `resolveSegmentEndpoint` already unifies the snap logic in one code path, so a separate tool
  would add UI surface without new capability.
- **D4 — annotation tool granularity.** Four distinct `SketchTool` values
  (`'draw-freehand' | 'draw-line' | 'draw-shape' | 'draw-textbox'`), matching the toolbar-button
  pattern used everywhere else in this codebase, not one parameterized `'annotate'` tool.
- **D5 — scope for this pass.** One work sequence covering Parts A, B, and C in that order —
  not split into separate specs/PRs. Implement and review in dependency order: Part A first
  (small, unblocks B), then B, then C (largest — new state + command types).

## 5. Recovery note (2026-09-08)

This file was lost between the Part B and Part C sessions — it was never committed to git (`.claude/plans/`
files are local-only per this repo's convention) and was wiped when a fresh worktree checkout was created
for Part C. It was reconstructed from the Part C session's own conversation transcript (it had read this
file in full as its first action, before the loss happened) — see the Decisions-Log entry
"Drawing-tools Part C... " (2026-09-08) for the incident and the resulting policy discussion about whether
`.claude/plans/` files should be deleted or marked-done once a task finishes.
