# Annotation select/move/rotate/delete

Status: **done**. Implemented, verified, merged to `origin/master`.

## Goal

`packages/render/src/scene.ts`'s `hitTestStamp` only scans `doc.stamps`. Once
a user places any annotation (freehand, line, arrow, rectangle, circle,
textbox, stickyNote, highlight, polyline), it can never be selected, moved,
rotated, or deleted again — the only way to remove one is Undo right after
creation. This closes that gap and also fills the `toolRegistry.ts` "Select &
Edit" row's four `tool: null` placeholders (Move, Copy, Rotate, Delete).
Copy is explicitly out of scope (not requested).

## Findings from the existing code

- `SketchDocument.selectedIds` (`packages/render/src/document.ts:65`) is
  already an untyped `Set<string>` — nothing in its own type ties it to
  stamps. Every *consumer* of it (`getSelection`, `hitTestStamp`,
  `getSelectionBoundsWorld`, the rubber-band hit loop, `redrawOverlay`) is
  what hard-codes the stamp-only assumption, by looking the id up in
  `doc.stamps` and nowhere else.
- Stamps carry a `Transform2D` (`position` + `rotationDegrees` + `scale`).
  Move/rotate for stamps works by replacing that transform
  (`setStampTransform`) and re-applying it to the PixiJS sprite.
- `Annotation`/`AnnotationGeometry` (`packages/core/src/annotation.ts`) has
  **no transform field at all**. Each kind stores its own absolute-coordinate
  geometry directly: `points` (freehand/polyline), `from`/`to` (line/arrow),
  `rect` (rectangle/highlight/textbox), `center`+`radius` (circle),
  `position` (stickyNote). There is no rotation angle anywhere in this type,
  and `pdf-engine`'s mirrored `AnnotationGeometry` has none either — a
  rotated rectangle/highlight/textbox/stickyNote has no field to store the
  angle in, in either the domain model or the PDF annotation kinds MepApp
  writes (`Line`, `Square`/`Circle`, `FreeText`, `Text`, `Highlight`,
  `PolyLine`).
- A second asymmetry: moving/rotating a **stamp** today is a direct mutation
  of `StampEntry.data` (`setStampTransform`) — it never goes through
  `doc.drawingHistory`, so it is **not undoable** today. Creating an
  **annotation** already goes through a `Command`
  (`createAnnotationCommand`), so it **is** undoable. Whatever Move/Rotate
  do to annotations will sit on the Command side of this split; matching
  that existing annotation convention (Command-based, undoable) is the
  natural choice and is what this plan assumes below.
- There is no delete path for either stamps or annotations today, other than
  Undo right after placement. `handle.deleteAnnotation` exists in
  `@mepapp/pdf-engine` but is only ever called from `exportToPdf`'s
  `planPdfSync` reconciliation (`scene.ts:840-849`), never from a user
  action.
- `exportToPdf` (and therefore `handle.deleteAnnotation`) only runs from
  `App.tsx`'s `handleSave`/`handleSaveAs` — there is no autosave. So a
  deleted annotation reaching `handle.deleteAnnotation` on the **next save**
  is already guaranteed by the existing `planPdfSync` diff (domain side no
  longer lists the id → `plan.toDelete` picks it up) — **no new explicit
  `handle.deleteAnnotation` call is needed at delete-time**, as long as
  Delete removes the annotation from `doc.drawingHistory`'s state (so
  `domainSyncEntries` stops reporting it).
- Reusable geometry helpers already exist in `packages/core/src/geometry.ts`:
  `distance`, `closestPointOnSegment`, `centroid`, `multiRotate`,
  `rotatePointAround`, `pointInRotatedRect`, `rectIntersectsRotatedRect`.
  Hit-testing a thin stroke (freehand/polyline/line/arrow) can be built from
  `closestPointOnSegment` + `distance` without duplicating logic.

## Decisions made (engineering calls, not asking about these)

1. **One unified selection**, not a parallel concept. `doc.selectedIds`
   keeps its current type (`Set<string>`) and now holds a mix of stamp ids
   and annotation ids. A new resolver (`resolveSelectable(id): {kind:
   'stamp', entry} | {kind: 'annotation', annotation} | null`) replaces the
   direct `doc.stamps.get(id)` lookups in `getSelection`,
   `getSelectionBoundsWorld`, `redrawOverlay`, and the rubber-band hit loop.
   Rubber-band and click selection then naturally mix both kinds in one
   selection set, which is the expected behavior for a single "Select &
   Edit" tool.
2. **Hit-testing dispatch**: `hitTestStamp` becomes `hitTest(worldPoint)`,
   trying stamps first (existing `pointInRotatedRect`, topmost first), then
   annotations (topmost first) using new per-kind tests added to
   `packages/core/src/geometry.ts`:
   - `line`/`arrow`/`freehand`/`polyline`: distance from the point to the
     nearest stroke segment (`closestPointOnSegment` + `distance`) within a
     screen-px threshold converted to world units, same pattern as
     `HANDLE_HIT_RADIUS_SCREEN_PX`.
   - `rectangle`/`highlight`/`textbox`: plain point-in-axis-aligned-rect
     (these render filled or as a simple stroked box — clicking anywhere
     inside selects it, no separate border-only hit region).
   - `circle`: distance from the point to the center compared against
     `radius` (+ a small screen-px tolerance so a thin stroked circle is
     still easy to hit).
   - `stickyNote`: point-in-rect against its fixed
     `STICKY_NOTE_ICON_SIZE_PT` icon box.
3. **Move**: translates an annotation's raw geometry by `(dx, dy)` —
   every point/rect corner/center/position field shifts uniformly, kind by
   kind (no rotation component involved). Implemented as one
   `translateAnnotationsCommand` executed once per gesture (on
   `pointerup`, mirroring the "one command per whole freehand stroke"
   convention already used for drawing), not per `pointermove` frame — the
   live drag mutates a working copy the same way `move-selection` already
   does for stamps, and only commits a single Command at the end. Stamps
   keep their existing non-undoable direct-mutation move; only annotations
   gain undo here, which is a strict improvement, not a regression.
4. **Delete**: a new `deleteSelectionCommand` (annotations only — through
   `doc.drawingHistory`, undoable) plus a direct `doc.stamps.delete(id)` /
   sprite-destroy for stamps in the same selection (matching the existing
   non-undoable precedent for stamp mutation, so this doesn't introduce a
   partial-undo trap where undoing "delete" only restores half the
   selection). Bound to the rail's Delete flyout button and the
   Delete/Backspace key, acting immediately on `doc.selectedIds` — not a
   persistent "delete tool" mode. No new PDF-sync code needed (see Findings
   above).

## Open questions — resolved

Asked via AskUserQuestion before implementing, per the task's instruction to
check in on anything that isn't a clear call.

1. **Move/Rotate/Delete: instant actions, not persistent tool modes.**
   Resolved: instant actions. The rail's Rotate flyout item rotates the
   current selection by 90° immediately (`SketchScene.rotateSelectionBy`,
   already existed, unused until now); Delete removes the current selection
   immediately. Move's flyout slot stays disabled ("coming soon") — there is
   no distinct one-shot action for it once Select's drag-to-move already
   covers continuous move for both stamps and annotations; aliasing it to
   the Select tool would just duplicate that button. Both actions also work
   as instant actions from a script/keyboard, not only the rail: Delete via
   the Delete/Backspace key, Rotate via `rotateSelectionBy(90)`.
2. **Rectangle/highlight/textbox/stickyNote group-rotate: reposition only.**
   Resolved: their center orbits the pivot, the shape itself stays
   axis-aligned at the same width/height. Implemented in
   `rotateAnnotationGeometry` (`packages/core/src/annotation.ts`) — see its
   doc comment. Verified live: a rubber-band-selected line + rectangle,
   rotated together, ends with the line's endpoints genuinely rotated and
   the rectangle's center moved but its width/height unchanged.
3. **Text re-edit and resizing: both included.** Clicking an
   already-sole-selected textbox/stickyNote with the select tool reopens the
   same floating textarea, pre-filled, and commits an in-place text update
   (same annotation id, not delete+recreate) — see `SketchScene.
   openTextEditor`. Resizing a placed rectangle/highlight (4 corner handles)
   or circle (1 radius handle) is single-selection only, matching the
   existing `setSelectedRotationDegrees`/`setSelectedPosition` precedent —
   see `getResizeHandlesWorld` and the `resize-rect`/`resize-circle` drag
   kinds in `scene.ts`.

## What was built

- **`packages/core`**: `pointNearSegment`/`pointNearPolyline`/
  `pointInAxisAlignedRect` (geometry.ts, annotation hit-testing);
  `translateAnnotationGeometry`/`rotateAnnotationGeometry`/
  `annotationBoundsWorld` (annotation.ts). 18 new unit tests
  (`geometry.test.ts`, new `annotation.test.ts`).
- **`packages/render/src/scene.ts`**: `hitTestStamp` generalized to `hitTest`
  (stamps, then annotations, topmost first); `getSelectionBoundsWorld`/
  `getRotationHandleWorld`/`redrawOverlay`/rubber-band selection all cover
  both kinds now. New `getResizeHandlesWorld`, `deleteSelection`,
  `hasSelection`, `openTextEditor`. Move/rotate/resize on annotations use
  core's existing `Transaction` primitive (previously imported by nothing —
  built for exactly this "live-update-then-one-undo-entry" gesture pattern
  but never wired up) — this makes annotation move/rotate/resize/delete
  undoable, unlike a stamp's (pre-existing, unchanged) non-undoable
  move/rotate. A window `keydown` listener wires Delete/Backspace to
  `deleteSelection`, ignored while focus is in a text input.
  `textboxRequested`'s event signature gained an `initialText` parameter for
  the re-edit flow.
- **`packages/ui`**: `toolRegistry.ts`'s Rotate/Delete flyout entries gained
  an `action` field (`ToolAction`); `Rail.tsx` runs it directly instead of
  `setTool`, gated on a new `hasSelection` prop. `useSketchScene.ts`/
  `App.tsx` thread a new `hasSelection` state (covers both stamps and
  annotations, unlike the existing stamp-only `selection`) and prefill the
  floating textarea from `TextboxPrompt.initialText`.
- Move's rail slot stays a disabled placeholder (see decision 1 above);
  Copy is unchanged/out of scope, as instructed.

## Verification

- `pnpm build` — clean, all 10 workspace packages.
- `pnpm turbo run typecheck` — clean, all 10 packages.
- `pnpm turbo run test` — 102 core tests (84 existing + 18 new) + 10
  `pdf-engine-mupdf` tests, all passing.
- Live headless-Chromium Playwright smoke test against the real fixture
  `fixtures/pdfs/arch_simple_A4.pdf`, driving the actual app UI (not a unit
  test): 22/22 checks passed, covering — draw a rectangle and a line
  annotation; select-by-click; drag-to-move (and undo/redo the move);
  drag-to-resize a rectangle's corner; rubber-band-select both annotations
  and group-rotate them (confirmed the line's endpoints actually rotate and
  the rectangle repositions but keeps its size, per decision 2); delete via
  the Delete key (and undo the delete); create a sticky note, click it to
  select, click again to reopen its text editor prefilled with the existing
  text, and commit an edit that updates the same annotation instead of
  duplicating it; and, as a regression check on the shared
  hitTest/bounds/overlay refactor, a placed stamp's existing select/
  drag-to-move/drag-to-rotate/delete still all work unchanged.

## Known follow-ups (out of scope here, not silently dropped)

- The atlas (§4) also calls for ±90° rotate nudge buttons next to the
  Rotation field in the Properties panel, in addition to the rail flyout —
  only the rail flyout was built; the Properties panel nudge buttons are a
  separate, not-yet-scoped UI addition.
- Copy/Paste were explicitly out of scope for this task and remain
  unimplemented rail placeholders.
- A resize/move/rotate/annotation-text-edit gesture that never reaches
  `onPointerUp` (e.g. a genuinely abandoned drag, not a normal mouse-release
  anywhere on or off the canvas, which `pointerupoutside` already covers)
  would leave the live domain-model change applied with no undo entry —
  inherent to `Transaction`'s "commit at gesture end" design, not something
  this task's gestures do differently from how `Transaction` is meant to be
  used; flagged here rather than silently accepted.
