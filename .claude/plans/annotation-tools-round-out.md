# Annotation tools round-out: arrow, sticky note, text highlight, polyline

Follow-on to drawing-tools-round-out Part C (freehand/line/shape/textbox,
shipped in `origin/master` `8373ca4`). Closes the three remaining `tool: null`
placeholders in `packages/ui/src/toolRegistry.ts`'s "annotate" rail row
(sticky-note, text-highlight, polyline), plus arrow (no dedicated rail slot —
a modifier on the existing Line tool, per the Decisions-Log's own suggestion).

Source of design history: Obsidian Decisions-Log.md, entries "Drawing-tools
round-out (Parts A/B/C): five design decisions consolidated" and "Drawing-tools
Part C (annotation tools)" (2026-09-08).

## Design decisions (this pass)

- **Arrow** — Shift-modifier on `draw-line` (mirrors `draw-shape`'s existing
  Shift-for-circle pattern, D4 precedent). No new `SketchTool` value.
- **Sticky note** — new `SketchTool` `draw-sticky-note`. Click-to-place, reuses
  the existing `textboxRequested` floating-textarea event (a point instead of
  a rect) — no new UI event or App.tsx wiring needed.
- **Text highlight** — new `SketchTool` `draw-highlight`. Plain drag-a-box
  gesture (same math as the rectangle half of `draw-shape`, no Shift needed
  since it's already a separate rail button/tool). Decided the
  drag-over-existing-content vs. draw-a-box distinction doesn't matter for a
  CAD annotation tool — rendered as a translucent yellow fill instead of an
  outline, to look distinct from a plain rectangle.
- **Polyline** — real `AnnotationKind` addition (confirmed with user over three
  options: real kind / chained lines / drop scope). `pdf-engine`'s
  `AnnotationGeometry` gets a `{ kind: 'polyline'; points }` variant backed by
  mupdf's native `PolyLine` annotation type (`getVertices`/`setVertices`,
  confirmed present in `mupdf` 1.28.x's type defs). New `SketchTool`
  `draw-polyline`: click adds a vertex, double-click (`event.detail >= 2`)
  finishes — the only multi-click (not two-click, not drag) gesture in the
  tool set, using the native `detail` field the same way `draw-shape` already
  uses `shiftKey` as a gesture modifier.

## Implementation checklist

- [ ] `packages/pdf-engine/src/index.ts` — add `'polyline'` to `AnnotationKind`,
      add `{ kind: 'polyline'; points: Array<{x,y}> }` to `AnnotationGeometry`.
- [ ] `packages/pdf-engine-mupdf/src/index.ts` — read path (`annotationToSpec`):
      `case 'PolyLine'` via `getVertices()`. Write path (`addAnnotation`):
      `case 'polyline'` via `createAnnotation('PolyLine')` + `setVertices()`.
- [ ] `packages/core/src/annotation.ts` — add `'arrow' | 'stickyNote' |
      'highlight' | 'polyline'` to `AnnotationKind`, matching geometry variants
      to `packages/ui`'s core `Vec2`/`AnnotationRect` shapes (field-for-field
      with pdf-engine's shapes, same convention the existing five kinds use).
- [ ] `packages/render/src/scene.ts`:
  - `SketchTool` union: add `draw-sticky-note`, `draw-highlight`,
    `draw-polyline` (no new value for arrow).
  - `onPointerDown`: `draw-line` gains `event.shiftKey` → `{kind:'arrow'}`;
    new `draw-sticky-note` (emit `textboxRequested`), `draw-highlight` (drag
    state), `draw-polyline` (click-to-add / double-click-to-finish) branches.
  - New `DragState` variant for highlight; new instance fields
    `pendingPolylinePoints`/`pendingPolylineCursor` for the polyline gesture
    (reset in `setTool`).
  - `drawAnnotation` — render cases for arrow (line + arrowhead), stickyNote
    (icon + always-visible text label, matching textbox's text-node pattern),
    highlight (translucent fill), polyline (open polyline stroke).
  - `redrawOverlay` — live preview for the highlight drag-box and the
    in-progress polyline (committed segments + a live segment to the cursor).
  - `annotationSyncEntry` / `domainAnnotationGeometry` — sync-comparison cases
    for all four new kinds, same convention as the existing five.
  - `writeAnnotationForId`'s generic `state.annotations[id]` branch needs no
    change — it already passes any domain `Annotation.geometry` straight
    through to `addAnnotation`.
- [ ] `packages/ui/src/toolRegistry.ts` — point `sticky-note`, `text-highlight`,
      `polyline` rail entries at their new `tool` values (icons already exist:
      `IconSticky`/`IconHighlight`/`IconPolyline`).
- [ ] Build/typecheck/vitest clean; live Playwright smoke test against a real
      fixture PDF exercising each new tool's golden path (place a sticky note
      and commit its text, drag a highlight box, draw a 3-point polyline via
      double-click-to-finish, Shift-drag a line to get an arrow) plus a
      save/reload round trip through the real mupdf PDF write/read path.
- [ ] Merge to `origin/master` (check for divergence first — concurrent
      worktrees are common on this repo; several other worktree dirs exist
      alongside this one already).

## Status

**Done.** Implemented in worktree `annotation-tools-arrow-sticky-highlight-polyline`, branch `worktree-annotation-tools-arrow-sticky-highlight-polyline`.

All checklist items completed as designed above, one design correction found
during live testing:

- `event.detail` (native click-count) reads as `0` on every `pointerdown` in
  Chromium regardless of click count — click-count semantics only apply to
  the native `click`/`mousedown` events, not `pointerdown`, which is all this
  class's gesture model listens to. Confirmed empirically (a throwaway
  Playwright probe logging `pointerdown.detail` during a real `dblclick`
  showed `[0, 0]`), not assumed. Replaced with hand-rolled double-click
  detection (`lastPolylineClickAt`/`lastPolylineClickScreen`, 400ms /
  6-screen-px thresholds) in `onPointerDown`'s `draw-polyline` case — same
  place, same trigger (a second click close in time and position), just not
  reliant on a native flag that turned out not to fire the way assumed.

Verification:
- `pnpm build && pnpm turbo run typecheck` clean across all 10 workspace packages.
- `pnpm turbo run test`: 84 core tests + 10 `pdf-engine-mupdf` tests (9
  pre-existing + 1 new `polyline` round-trip case added to
  `packages/pdf-engine-mupdf/src/annotations.test.ts`, matching that file's
  existing per-kind convention) — all passing.
- Live headless-Chromium (Playwright) smoke test against the real
  `fixtures/pdfs/arch_simple_A4.pdf` fixture: opened the PDF, exercised every
  new tool's golden path (Shift+two-click arrow, click-to-place sticky note
  with committed text, drag-a-box highlight, 4-vertex polyline finished via
  double-click), confirmed `drawingSummary.annotationCount` incremented for
  each, confirmed the Rail UI's three previously-disabled buttons (Sticky
  Note/Text Highlight/Polyline) and the relabeled "Line/Arrow" button are all
  enabled and wired. Then a full save round trip: `exportToPdf` +
  `handle.save()` to real PDF bytes, reopened in a **separate** mupdf process
  (not just the same in-memory document) — confirmed a real `Line` annotation
  with `ClosedArrow` ending, a `Text` annotation with the committed sticky
  note contents, a `Highlight` with the dragged quad points, and a real
  `PolyLine` annotation with all 4 vertices, all correctly named/correlated.
  Zero console errors throughout. Screenshot confirms correct visual
  rendering (arrowhead, sticky note icon+label, translucent highlight fill,
  zigzag polyline stroke).
