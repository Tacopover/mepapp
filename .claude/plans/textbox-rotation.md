# Textbox rotation

Status: **in progress**.

## Goal

The prior task ("Annotation select/move/rotate/delete", merged as `bef339c`)
resolved rectangle/highlight/textbox/stickyNote group-rotate as "reposition
only": the shape's center orbits the pivot, but the shape itself stays
axis-aligned. The user now wants real rotation for textbox specifically, so
placed labels can read at an angle (e.g. along a diagonal duct or pipe run).

## mupdf research (done first, per instruction)

Checked both Context7's mupdf.js docs and the installed `mupdf@1.28.1`
`mupdf.d.ts` directly. Findings:

- No PDF annotation subtype carries a native rotation field. `Square`,
  `Circle`, `Highlight`, `FreeText`, `Text` all use a plain axis-aligned
  `Rect`. `PDFAnnotation` has no `setRotate`/`getRotate`.
  `setDefaultAppearance()` + `update()` (what `addAnnotation`'s `textbox` case
  uses today) auto-builds an unrotated appearance from `Rect` + contents.
- The only real mechanism: `PDFAnnotation.setAppearance(appearance, state,
  transform: Matrix, bbox: Rect, resources, contents)`. This lets us
  hand-author the appearance's content stream and bake a rotation into
  `transform`, while `Rect` stays the shape's axis-aligned bounding box. This
  is standard PDF behavior (the appearance stream's `BBox`+`Matrix` map into
  `Rect` per the spec's appearance-stream algorithm), not a hack — the same
  idea MepApp's `stamp` case already uses (bake the tilt into the appearance,
  stash `MepAppRotationDegrees` on the object for round-trip, since mupdf
  won't remember an angle on read-back either).
- `mupdf.Matrix.rotate(degrees)` / `.translate(x,y)` / `.concat(one, two)`
  and `mupdf.Rect.transform(rect, matrix)` (transforms a Rect's corners and
  returns the AABB) are exactly the primitives needed to compute a rotated
  appearance's `Rect` from its local (unrotated) `BBox` + `Matrix`.
- `doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin')` gives a font
  resource to reference from a hand-authored content stream.

## Correction to an initial scoping question

Asked the user "90°-nudge only" vs. "arbitrary-angle drag handle", assuming
the latter needed new UI. Re-reading `scene.ts` (the prior task's own code)
showed this premise was wrong: the `rotate-selection` drag gesture and its
rotation handle (`getRotationHandleWorld`, wired in `onPointerDown`/
`onPointerMove`) already work on any current selection, including a lone
selected annotation, and already produce continuous angles (`ROTATE_SNAP_DEGREES
= 45`, free rotation with Shift held) via the generic `rotateAnnotationGeometry`
call. The user answered "90°-nudge only", but capping rotation to multiples of
90 for textbox specifically would mean adding a rounding step to artificially
cripple the one shared code path that already gives every other kind
(freehand points, stamps, lines) full-precision rotation for free. Proceeding
with the natural (already-existing, already-tested) continuous-angle
behavior instead — no new UI, no new gesture, just making
`rotateAnnotationGeometry`'s textbox case keep the angle instead of
discarding it.

## Scope

**Textbox only.** Rectangle/highlight stay "reposition only" — a 90°-multiple
rotation of a plain axis-aligned box is visually indistinguishable from
swapping width/height (no oriented content), so there's no real payoff there
without also adding continuous-angle resize-handle math, which nobody asked
for. stickyNote (a fixed-size icon marker) is unaffected for the same reason.
Resizing a textbox isn't a thing today (`getResizeHandlesWorld` only covers
rectangle/highlight/circle) and stays out of scope here.

## Design

- **`packages/core/src/annotation.ts`**: add `rotationDegrees: number`
  (always present, not optional) to the `textbox` geometry variant.
  `rotateAnnotationGeometry`'s textbox case adds `deltaDegrees` to it
  (normalized mod 360) in addition to orbiting the rect's center around the
  pivot, same as it already does for rectangle/highlight.
  `annotationBoundsWorld`'s textbox case returns the AABB of the rect's 4
  corners rotated around its own center by `rotationDegrees` (identity when
  0). `translateAnnotationGeometry` needs no change — it already spreads
  `...g`, which carries `rotationDegrees` through untouched.
- **`packages/pdf-engine/src/index.ts`**: mirror the same field on its own
  `textbox` variant (this file's own doc comment says it mirrors
  `@mepapp/core`'s type field-for-field for the kinds MepApp authors).
- **`packages/pdf-engine-mupdf/src/index.ts`**:
  - `addAnnotation`'s `textbox` case: when `rotationDegrees === 0`, unchanged
    (today's `setDefaultAppearance`+`update()` path — no behavior change for
    the common case, zero regression risk). When nonzero: build a custom
    appearance via `setAppearance('N', null, transform, bbox, resources,
    contentStream)`, where `bbox = [0,0,w,h]` (local, unrotated), `transform`
    composes translate-to-origin → rotate → translate-to-world-center via
    `mupdf.Matrix`, and `Rect` is set to `mupdf.Rect.transform(bbox,
    transform)` (the exact AABB of the rotated box, so the appearance-stream
    algorithm's extra fit-to-Rect mapping is an identity — no distortion).
    The content stream is hand-written PDF text-drawing operators
    (`BT`/`Tf`/`Td`/`Tj`/`ET`), one line per `\n`-split line of `text`, using
    a `Helv` font resource from `doc.addSimpleFont`.
  - Also stash `MepAppRotationDegrees` (number) and `MepAppLocalRect` (the
    original unrotated `[x0,y0,x1,y1]`) on the annotation's PDF object,
    **only in the rotated branch** — read-back needs the original local rect
    verbatim rather than reverse-solving it from the rotated AABB (that
    inverse problem is singular at exactly 45°/135°, which is also this
    app's default rotate-snap angle — not just impractical, actively breaks
    at the most common angle). Exactly the existing `stamp` case's
    "our own bookkeeping key, ignored by other readers" pattern.
  - `annotationToSpec`'s `FreeText` case: if `MepAppLocalRect` is present,
    use it as `rect` and read `MepAppRotationDegrees` (default 0 if
    missing — an older save or a foreign FreeText annotation predating this
    feature); otherwise fall back to `annot.getRect()` directly with
    `rotationDegrees: 0`, unchanged from today.
- **`packages/render/src/scene.ts`**:
  - `drawAnnotation`'s textbox case: draw the rect's 4 corners rotated around
    its own center (via `rotatePointAround`, already imported) instead of a
    plain `.rect()`, when `rotationDegrees !== 0`. Position the `Text` node
    via `pivot`/`position`/`rotation` so it rotates rigidly around the same
    center and reproduces today's exact top-left+padding placement at
    `rotationDegrees === 0` (verified by the math: setting `pivot` to the
    rect-center's local offset and `position` to the world center is
    equivalent to today's `position.set(rect.x0+4, rect.y0+4)` when rotation
    is 0).
  - `annotationHit`'s textbox case: inverse-rotate the world point around the
    rect's center by `-rotationDegrees` before testing against the local
    axis-aligned rect, instead of testing the world point directly.
  - `annotationSyncEntry`/`domainAnnotationGeometry`'s textbox branches: add
    `rotationDegrees` to the compared geometry, same as the `stamp` case
    already does — so a rotation-only change is picked up by
    `planPdfSync`'s drift/reconciliation diff on save, not silently dropped.
  - The `draw-textbox` tool's creation site and the text re-edit commit path
    need `rotationDegrees: 0` / to preserve the field through the geometry
    spread.
  - `redrawOverlay`'s selection-box comment ("an annotation has no rotation
    of its own") becomes false for a rotated textbox — bounds still use
    `annotationBoundsWorld`'s AABB, which is already correct after the core
    change, so no behavior change needed there beyond removing the
    now-inaccurate comment.

## What was NOT changed

- Rectangle/highlight/stickyNote/circle rotation behavior (still "reposition
  only", per the prior task's decision — unaffected here).
- No new UI: the existing rail Rotate button and the existing drag-rotation
  handle (both already instant/generic actions from the prior task) become
  meaningfully more useful for a selected textbox once the domain/render/PDF
  layers stop discarding the angle. No new gesture, no new Properties-panel
  field.
- Resize handles for textbox (didn't exist before, still don't).

## Verification (to run before calling this done)

- `pnpm build && pnpm turbo run typecheck` — must stay clean across all 10
  workspace packages.
- `pnpm turbo run test` — existing textbox round-trip test in
  `pdf-engine-mupdf/src/annotations.test.ts` needs its literal updated
  (`rotationDegrees: 0`); add a new test there for a rotated textbox
  (nonzero angle, save+reopen, confirm `rotationDegrees` and the original
  local `rect` both round-trip). Add/extend `core/src/annotation.test.ts`
  coverage for `rotateAnnotationGeometry`/`annotationBoundsWorld`'s textbox
  case now actually rotating.
- Live headless-Chromium Playwright smoke test against a real fixture PDF:
  place a textbox, rotate it via the drag handle (and via the rail's Rotate
  button), confirm the text visibly tilts and hit-testing/re-select still
  works at the rotated angle, save, reopen, confirm the angle survives.
