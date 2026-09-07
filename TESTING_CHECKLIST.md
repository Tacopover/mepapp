# Manual testing checklist

This file tracks everything that needs a human — real hardware, real eyes, or a
real decision only you can make. Everything not listed here has already been
verified by an automated check (see commit history / session reports for what
ran and passed). Pull this file after each session; new items get appended as
work proceeds, checked-off items stay struck through rather than deleted so the
history of what was verified stays visible.

## Step 1 — Stamp placement & rotation

- [x] Manual rotation test on Windows — placed stamps, rotated them, confirmed
      no drift. **You confirmed this passed (2026-09-05).**
- [ ] Check 3 (sharpness at 800% zoom) with a real 300-DPI stamp fixture — needs
      your own eyes on your own screen; not meaningfully automatable.
- [ ] Check 5 (rotated stamp flattened into the PDF, matches on-screen angle in
      an independent viewer) — blocked, `flattenOverlay`/`addAnnotation` are
      still stubs (deferred to Step 4 by the plan). Nothing to check yet.

## Step 2 — Coordinate & scale fidelity

- [ ] 0.1mm calibration accuracy sweep (100%-800% zoom) on an **unrotated**
      fixture. `fixtures/pdfs/00_arch_ground_floor.pdf` and
      `01_arch_first_floor.pdf` both have real printed grid dimensions you can
      use as ground truth: horizontal grid spacing 1200mm / 5400mm / 1700mm
      (repeating), vertical grid spacing 7200mm. Calibrate against one of
      these, then measure a different one and check you land within 0.1mm.
- [ ] Same sweep on a **rotated** fixture. `arch_simple_A4.pdf` has `/Rotate 90`
      but no printed dimension on it, so it can only prove self-consistency
      (same reading at different zoom levels), not absolute accuracy. If you
      want a fully authoritative rotated check, a rotated fixture with a
      printed dimension would help.

## Step 3 — Frame rate under real load

- [ ] **Re-run `node scripts/bench-frame-rate.mjs chromium` (and `firefox`) on
      your own machine with a real GPU.** This sandbox has no GPU device at
      all (`/dev/dri` doesn't exist), so Chromium/Firefox both fall back to
      software rendering (SwiftShader/llvmpipe). The numbers this sandbox
      produced (Chrome: 1-8fps across zoom levels with 3000 objects; Firefox:
      10-21fps) are **not representative of real performance** — they only
      proved the harness works end to end (population, pan, zoom, rubber-band
      select-and-drag) with zero page errors. Real pass/fail against the
      plan's 60fps bar needs real hardware.
  - Usage: `(cd apps/web && pnpm dev &)` then
    `node scripts/bench-frame-rate.mjs chromium` from the repo root. The
    script is checked in and reusable — see its header comment.
  - Firefox's rubber-band drag-selection sub-check didn't reliably hit its
    target count in this sandbox (Chromium's did — 394 elements). Minor script
    robustness gap, not investigated further; the pan/zoom numbers are unaffected.
- [ ] Neither real PDF fixture is in the plan's "10MB+, thousands of vector
      paths" heavy-sheet tier yet (`00_arch_ground_floor.pdf` is ~500KB,
      `01_arch_first_floor.pdf` is ~360KB). If you want the heavy-load number
      to mean something closer to a worst-case real project file, drop a
      genuinely large sheet into `fixtures/pdfs/` — `scripts/bench-frame-rate.mjs`
      can point at it by changing `BACKDROP_PDF`/`BACKDROP_PAGE_SIZE` at the
      top of the file.
- [ ] Desktop (Tauri) frame-rate number — `apps/desktop` is now a real Tauri 2
      project (scaffolded this session; Rust/Cargo/webkit2gtk were installed
      into this sandbox to make that possible). See report for whether the
      first build succeeded here. Even if it did, the frame-rate number still
      needs to be measured on real hardware, same as the browser case.
- [ ] Safari and a real Windows-vs-Linux Tauri comparison — explicitly
      deferred follow-up per the plan, needs those machines.

## Step 4 — Annotation round trip

- [x] `addAnnotation`/`listAnnotations`/`deleteAnnotation`/`flattenOverlay`/
      `save` are now implemented in `@mepapp/pdf-engine-mupdf` (previously
      stubs). Automated test (`packages/pdf-engine-mupdf/src/annotations.test.ts`)
      proves: all 6 required markup kinds (freehand, line, arrow, rectangle,
      circle, textbox) round-trip through a real save+reopen with exact
      geometry; delete removes exactly the targeted one; flatten bakes a
      raster snapshot into the page's own content stream (confirmed to leave
      zero annotations behind — it's real page content, not an annotation).
- [ ] **Reopen a saved annotated PDF in two independent PDF readers** (the
      plan's other pass condition) to confirm the annotations are still
      editable objects there too, not just at the mupdf.js object level. This
      sandbox has no GUI PDF viewer to do that with. A quick way to produce a
      test file: a short script calling `MupdfEngine`'s `addAnnotation` for
      each kind against a real fixture PDF, then `save()` the bytes to disk.
- [ ] Visual/fidelity comparison of a flattened overlay (including a rotated
      stamp) against the source PixiJS scene — the flatten mechanism itself is
      now proven to work structurally, but nothing yet feeds a real PixiJS
      canvas snapshot into it (the render layer has no "export snapshot as
      PNG" step wired up yet). That wiring plus the visual comparison is
      unbuilt — tracked as a gap, not attempted as a placeholder.

## Step 5 — Offline caching (browser)

- [x] Added a service worker (`apps/web/public/sw.js`, network-first with
      cache fallback) and registration in `main.tsx`. Automated Playwright
      test: loaded the app once online, went fully offline
      (`context.setOffline(true)`, no network at all), reloaded, and
      confirmed: zero page errors, all UI chrome renders, and — the specific
      thing this step cares about — **a real fixture PDF loads and renders
      successfully while offline**, proving MuPDF's WASM genuinely
      initialized from the service worker cache, not just that static HTML/JS
      loaded.
  - Found and fixed a real bug along the way: the original registration code
    (`window.addEventListener('load', ...)`) could silently never fire,
    because this app's main bundle finishes its own top-level execution
    *after* `window`'s `load` event already happened (this app loads several
    large async chunks — PixiJS, the 10MB mupdf WASM). Fixed by checking
    `document.readyState === 'complete'` first. Worth remembering if a
    similar "runs on load" pattern gets added elsewhere in this app later.
- [ ] The "edit and save while offline" half of this step's pass criteria
      isn't testable yet — there's no annotation-drawing UI in the app (that's
      Step 7 territory). The underlying save mechanism itself was proven
      separately in Step 4's automated test.
- [ ] **Desktop (Tauri) encrypted/integrity-checked cache — not attempted.**
      This needs a Tauri secure-storage plugin (stronghold or OS
      keychain-backed), which means another large Rust dependency compile on
      top of the ~40-minute one this session already paid for `apps/desktop`
      itself. Deliberately deferred rather than rushed — a real, disclosed gap,
      not a placeholder implementation.
- [ ] Aggressive storage-eviction testing (both browser and desktop) — not
      attempted this session.

## Step 6 — Open-source release mechanics

- [x] Added an in-app AGPLv3 corresponding-source notice (bottom of the app,
      "View the source code for this exact version") that links to
      `https://github.com/Tacopover/mepapp/tree/<commit-sha>`, with the SHA
      baked in at build time via `vite.config.ts`. Verified the link renders
      with the correct, real commit SHA.
- [x] **Clean-clone build verified.** Cloned `https://github.com/Tacopover/mepapp`
      fresh into an empty directory, ran `corepack enable && pnpm install &&
      pnpm build && pnpm test` — 9/9 build tasks and all 27 tests passed, all
      genuinely fresh (0 cache hits, since it's a separate directory from this
      session's own dev checkout). Confirmed the built bundle's
      corresponding-source link bakes in the exact commit
      (`f255c94...`) that was actually cloned and built.
- [ ] Self-hosted license-gating behavior remains explicitly out of scope per
      the plan's own decision — not attempted, not needed here.

## Step 7 — Vertical feature slice

Design questions resolved 2026-09-06, following the same method as Step 1's
rotation semantics: investigate `/root/MepSketcher` as a behavioral
reference, cite file:line evidence, then confirm the target design with the
user before writing code. Full investigation reports and citations are in
the session transcript; decisions are recorded in the Obsidian decisions log.

- **Segment/junction/fitting domain model** — old app stores engineering
  data in a loosely-typed property bag and a stamped, hand-synced
  `NetworkId` (a documented source of bugs — see
  `SegmentLifecycleManager.cs:11-22`). New `@mepapp/core` uses typed
  `Segment`/`Fitting`/`Network` objects; network membership is derived from
  graph adjacency rather than stamped state. Adding `material` (segments)
  and a fitting-kind field now, which the old app never had or abandoned.
- **Flow solve** — confirmed the old app computes a unitless, user-entered
  "Capacity" number summed bottom-up over the network graph
  (`NetworkFlowProcessor.cs:11-41`), not real HVAC/plumbing physics. The new
  app ports this same capacity-accumulation model, not a physics solver.
- **Undo/redo model** — old app uses a command pattern (`execute`/`undo`/
  `redo`, two-stack history, `CompositeCommand` grouping). New `core` adopts
  the same family, plus a first-class transaction/batch API for continuous
  gestures (drag) — an improvement over the old app, which only ever
  hand-rolled this per tool (`MepDragHandler.cs:640-706`).
- **Schema migration strategy** — old app centralizes version as an int
  field in the save JSON with a resumable chain of upgrade steps, but two
  real bugs were found: migration is opt-in per call site (not run inside
  `LoadAsync` itself), and steps operate on fully-typed DTOs, which already
  caused one near-miss with a deleted field. New `core` fixes both: migration
  runs automatically inside the load boundary, on loosely-typed JSON, with
  post-migration shape validation the old app never had.

Implementation proceeds now that all four are confirmed.

**Status:**
- [x] Domain layer in `@mepapp/core`: `network.ts` (Segment/Fitting/Network,
      `computeNetworks`), `flow.ts` (`solveFlow`), `commands.ts`
      (`CommandManager`/`CompositeCommand`/`Transaction`), `schema.ts` +
      `project.ts` (versioned save format with a real migration step).
      67 automated tests, all passing.
- [x] Interactive segment-drawing tool wired into `@mepapp/render`'s
      `SketchScene` and `@mepapp/ui`'s toolbar: two-click draw with snap-to-port/
      snap-to-fitting/break-existing-segment resolution
      (`core/segmentTool.ts`), undo/redo via `CommandManager`, a "Solve flow"
      button, and Save/Load project buttons.
- [x] Verified live in a real browser (Playwright/Chromium against the dev
      server, not just unit tests): drawing a run, snapping to an existing
      fitting, auto-generating a junction by branching onto a segment's
      interior, two separately-drawn networks merging into one purely from
      derived connectivity (no explicit "merge" step exists or is needed),
      atomic undo/redo of a whole composite draw operation, flow solve
      running without error, and save/reload — including a synthetic
      pre-material (v0) document proving the migration step itself runs on
      real load, not just in a unit test. Zero page errors throughout.
- [x] **PDF export/import with reference management and external-edit
      detection (2026-09-06).** Design investigated against
      `/root/MepSketcher`'s own `ProjectDataMapper.cs`/`AnnotationRebuildResult`
      (citations in the session transcript and Decisions-Log), confirmed with
      you, then implemented:
  - A domain object's own id (`Segment.id`/`Fitting.id`/`PlacedStamp.id`) is
    used verbatim as its PDF annotation's `/NM` field
    (`AnnotationSpec.id` in `@mepapp/pdf-engine`, `MupdfEngine.addAnnotation`)
    — no separate id-mapping table, the same correlation MEPSketcher used via
    pdftron's UniqueID.
  - The project JSON is embedded **inside** the PDF itself (a document-level
    embedded file, `PdfDocumentHandle.setEmbeddedFile`/`getEmbeddedFile`) —
    one self-contained `.pdf`, no sidecar file to lose or mismatch.
  - `SketchScene.exportToPdf()` diffs the domain model against the PDF's
    current annotations (`core/pdfSync.ts`'s `planPdfSync`) and only
    creates/updates/deletes what actually changed; segments write as `line`
    annotations, fittings as small `circle` markers, placed stamps as real
    `stamp` annotations rasterized from the live PixiJS sprite
    (`renderer.extract.base64`).
  - `SketchScene.loadFromPdf()` loads the embedded JSON, then compares it
    against the PDF's actual annotations (`core/pdfSync.ts`'s
    `reconcilePdfSync`) and returns a report of drifted/missing/foreign
    annotations. Confirmed policy: flag it, never silently resolve either
    way — the domain model is never mutated or deleted just because an
    annotation vanished or moved (mirrors MEPSketcher's own user-gated
    `AnnotationRebuildResult`, minus its silent gap around geometry drift,
    which MEPSketcher never detected at all).
  - `@mepapp/ui`'s toolbar surfaces the report as a dismissible banner (Sync
    to PDF / Download PDF buttons alongside it).
  - Automated coverage: `packages/pdf-engine-mupdf/src/annotations.test.ts`
    (id correlation, stamp annotation round trip, embedded-file round trip —
    9 tests) and `packages/core/src/pdfSync.test.ts` (10 tests, pure
    reconcile/plan logic). **Verified live in a real browser** (Playwright
    against the dev server, real fixture PDF + real fixture stamp PNG): drew
    a segment, placed a stamp, synced into the PDF, downloaded it, then
    independently reopened those exact bytes with `MupdfEngine` outside the
    browser to confirm the annotations and embedded JSON are real — then
    used `MupdfEngine` directly (simulating a different PDF viewer) to delete
    the stamp annotation and move the segment's line annotation, saved, and
    reopened that mutated file in the running app: the reconciliation banner
    correctly reported "1 annotation missing" and "1 annotation moved," and
    the domain model's segment count was untouched. Zero page errors.
  - **Known gap, not attempted**: no UI action yet to accept a drifted
    annotation's PDF-side geometry back into the domain model (only "keep
    MepApp's version," via re-running Sync to PDF, is wired up) — pushing an
    externally-edited position into the corresponding Segment/Fitting/
    PlacedStamp would need a new, undoable command, tracked as a real
    follow-up rather than a placeholder button.
  - **Known gap, not attempted**: `flattenOverlay`-based baking (Step 4's
    other pass condition) is unrelated to this annotation-based sync and
    remains as previously tracked.
- [x] **Placed stamps now round-trip through the project JSON, for
      palette-placed stamps.** `loadProjectFromJson` is now async: for every
      restored `PlacedStamp` with a `definitionId` (placed from the stamp
      palette), it looks the definition up in `STAMP_LIBRARY`, re-fetches its
      icon art via an injected `IconBitmapResolver` (apps/web's
      `resolveStampIconUrl`, same layering as `StampsPanel` — `SketchScene`
      still owns no fetch call itself), and rebuilds the sprite into the
      *target* `SketchDocument` (captured up front, so a tab switch mid-load
      can't spill it into whichever document happens to be active when the
      fetch resolves). `nextStampSeq` is seeded past the highest restored
      `stamp-N` id so a newly placed stamp can't collide with one just
      restored. Verified live (Playwright against the dev server): placed a
      palette stamp, saved project JSON, reloaded it, stamp reappeared at the
      same position/rotation/scale; repeated with two documents open
      simultaneously (two PDFs, one distinct stamp each) and confirmed each
      restores only its own stamp, no cross-document leakage.
  - **Known gap, not attempted**: a `PlacedStamp` with no `definitionId` (an
    ad hoc uploaded PNG/SVG via the "Custom stamp…" tile) has no image bytes
    saved anywhere in the project JSON, so it still cannot be rebuilt on
    reload and is left out of the restored scene. Fixing this needs the save
    format itself to embed image bytes — a separate, larger change.
- [ ] Only straight two-point segments are supported (no multi-point
      polyline drawing tool yet) and there is no UI yet to edit a segment's
      shape/diameter/material/network-type after creation — every new
      segment gets the same default network type and round/200 shape.
- [ ] Stamp placement/move/rotate still isn't covered by undo/redo (a
      pre-existing gap from Step 1, not introduced this session) — only the
      new segment/fitting drawing operations are undoable.

## Notes

- SVG stamp support (you added `.svg` fixtures) — real feature gap, not built
  yet. Current prototype only accepts PNG stamp art. Tracked for when SVG
  support becomes the active task, not attempted as part of this validation
  pass.
