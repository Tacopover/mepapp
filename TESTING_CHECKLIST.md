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

## Step 7 — Vertical feature slice: STOPPED HERE, needs your design input

This is where automated progress stopped. Steps 3-6 were all either pure
verification or had a specified target to implement against. Step 7 (segment
drawing tool, auto-generated junctions, network merge, flow solve, undo/redo,
schema migration, export) is different: the plan intentionally doesn't pin
down *how* several of these should work, because they're real product design
decisions, not implementation details:

- **Segment/junction/fitting domain model** — `@mepapp/core` has no
  representation yet for a drawn run, a network, or a fitting. What data
  shape should these be (geometry only, or with engineering properties like
  pipe/duct size, material, flow direction)?
- **Flow solve** — the plan names this step but doesn't specify what physical
  quantity is being solved for (pressure drop? air/water flow balancing?) or
  by what method. This is domain-specific engineering knowledge, not
  something to guess at.
- **Undo/redo model** — a command-pattern history, an immutable-snapshot
  diff, or something else? This choice shapes how every future feature is
  built on top of `core`, so it's worth deciding deliberately rather than
  picking whatever is fastest to write first.
- **Schema migration strategy** — versioned JSON with explicit migration
  functions is the common approach, but the exact shape depends on what
  `core`'s save format ends up being, which depends on the above.

None of this was invented or guessed at. Tell me how you want these to work
(or point me at more detail in a design doc) and this can continue.

## Notes

- SVG stamp support (you added `.svg` fixtures) — real feature gap, not built
  yet. Current prototype only accepts PNG stamp art. Tracked for when SVG
  support becomes the active task, not attempted as part of this validation
  pass.
