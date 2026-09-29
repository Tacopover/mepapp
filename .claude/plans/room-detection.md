# Room detection from vector PDF floor plans

Status: PLAN ONLY (2026-09-29). No code written. Research done by a subagent; numbers below come from the real fixtures.

## 1. Agreed requirements (user, 2026-09-29)

- **Outputs:** room polygon (page coordinates), room area (m², via `packages/core/src/calibration.ts`), room name and number read from PDF text when present.
- **Use:** (a) assign MEP elements to rooms (point-in-polygon), (b) per-room calculations from area.
- **Modes:** click inside a room to find its boundary, AND detect all rooms on a page at once. The user then corrects mistakes.
- **Source:** vector CAD PDFs first. Scanned/raster PDFs are a later phase (not planned now).
- **Door openings:** the algorithm closes gaps up to a configurable width and treats them as wall.
- **Boundary:** inner wall face (net floor area). Make it configurable later.
- **User preparation:** none by default (fully automatic). Layer or line-style selection is a fallback only.
- **Open-plan areas:** the user states that every room is eventually enclosed by walls (many walls, or exterior walls). So detection expects a closed boundary. If no closed boundary exists, the tool reports a "leak" and shows where. No separator-line feature is planned unless testing shows it is needed.
- **Polygonizer choice:** undecided. Decide after a test on the ground-floor fixture (JSTS with EDL licence vs own face-extraction code).
- **More test PDFs:** the user will add 2 to 3 real plans from other CAD programs (Revit, AutoCAD, other country) to `fixtures/pdfs/`. Phase 1 filter design waits for them.

## 2. Fixture findings

| File | Stroked paths | Notes |
|---|---|---|
| `arch_simple_A4.pdf` | 12 | Toy. No text. |
| `00_arch_ground_floor.pdf` | 57,637 (60,104 segments) | A0, 1:50. 222 text lines. 64 curves. |
| `01_arch_first_floor.pdf` | 41,893 | Same style. 213 text lines. |
| `Test_doc.pdf` | 1,045,742 | Stress case. 9 text draws. |

- Every stroked path is one straight segment. Walls are NOT filled shapes.
- Thick walls are two parallel lines with hatch between them. Wall, hatch and furniture share colours and widths. The filter must not depend on colour.
- About 70% of segments are axis-aligned. Median length 5 to 10 pt. Max 5,680 pt.
- No PDF layers (OCG) in these files. The layer fallback cannot help here.
- Text is real. Room labels are stacked lines: number, name, area (example: `0.37 / Werkplek / 8pers. / 49 m²`). Font about 18 pt.
- The label area gives a free check on the computed area.
- Doors: arcs plus a leaf line, but not proven for every door.

## 3. Interface gaps (`packages/pdf-engine/src/index.ts`)

`PdfDocumentHandle` has no vector path or text access. Add:

1. `getVectorPaths(pageIndex)`: flat `Float64Array` segments (x0,y0,x1,y1) plus per-path stroke width, colour, alpha, fill/stroke flag, clip id, layer name. The adapter flattens curves with a tolerance parameter.
2. `getTextRuns(pageIndex)`: `{ text, bbox, origin, fontSize, rotation }` per line.
3. `listLayers(pageIndex)`: names and visibility.

Adapter rules: convert the y-axis direction once and document it. Handle page rotation. Free WASM objects. Compute stroke bounds ourselves (`Path.getBounds` throws on strokes without a stroke state). Only `pdf-engine-mupdf` imports `mupdf`.

MuPDF.js features: `new mupdf.Device({...})`, `page.run(device, matrix)`, `path.walk`, `page.toStructuredText().walk`. Docs: https://github.com/artifexsoftware/mupdf.js/blob/master/docs/how-to-guide/page.rst

## 4. Approach

- **A. Vector planar graph (detect-all):** filter segments, detect wall pairs, close door gaps, node segments (split at crossings), extract faces, drop the outer face and faces that are too small or large. Holes are columns or shafts.
- **B. Raster wall mask + flood fill (click mode):** draw the FILTERED segments (not the PDF) to a bitmap, close gaps, flood fill, trace contour, snap to vector vertices, shrink to the inner face.
- **C. Machine-learning segmentation:** later scan phase only.

Order: B for click mode first (quick result), then A for detect-all. Both share the filtered segment set. Confirm with fixture tests before building both.

## 5. Libraries (licences read from the npm registry)

| Library | Licence | Use |
|---|---|---|
| `flatbush` | ISC | Spatial index. Use. |
| `polygon-clipping` | MIT | Union/difference. |
| `clipper2-wasm` | BSL-1.0 | Offset for the inner-face shrink. |
| `jsts` | EDL-1.0 OR EPL-1.0 | Polygonizer. Choose EDL (EPL-1.0 is not GPL-compatible). |
| `@turf/polygonize` | MIT | Slower on large input. |
| `earcut` | ISC | Room fill display only. |
| `@techstark/opencv-js` | Apache-2.0 | Later raster fallback only. |

Not verified: bundle sizes, degenerate-input robustness of clipping libraries.

## 6. Performance

- Segment counts: 42k to 60k (A0 plans), about 1M (`Test_doc.pdf`). Use a spatial index.
- Run extraction and detection in a Web Worker with transferred typed arrays. Tauri needs the same.
- Click mode queries only segments near the click. Detect-all caches the filtered set per page.
- `Test_doc.pdf` may need a coarse first pass (long straight segments only).

## 7. Room name reading

1. Group nearby, centred text lines into one label cluster.
2. Anchor = cluster centre. Assign to the polygon that contains the anchor.
3. Several clusters in one polygon: prefer one matching the room-number pattern, then nearest to the polygon centroid. Keep the others as extra labels.
4. No cluster: the room stays unnamed and flagged.
5. Patterns: number `^\d{1,2}\.\d+[A-Za-z]?(-\d+)?$`; area `(\d+(?:[.,]\d+)?)\s*m[²2]`; persons `\d+\s*pers\.`. Exclude grid labels, dimension strings, title block.
6. Names stay free text (Dutch). An optional dictionary only helps classify.
7. Warn when computed area and label area differ by more than a set percentage.

## 8. Phases

1. **Fixtures + filter study.** STATUS 2026-09-29: first pass done (throwaway scripts in the session scratchpad, not in the repo). Filter keeps walls, click-fill draws clean contours, but only 9 of 24 test rooms match the label area within 15%. Findings that change later phases: Example_1 draws walls as FILLS and text as outlines (no names readable); Example_2/3 have curved walls; no file has layers; furniture touching walls survives the filter. Phase 2 must return fill paths, fill colour and a curve flag. Scale comes from MepApp's existing calibration (decided 2026-09-29). New PDFs stay untracked (decided). ROUND 2 (subagent report, not yet re-verified by the parent): 12 of 24 rooms within 15%; 12 of 16 when the 8 rooms with no closed wall in the drawing (OPEN) are excluded. Of 15 misses: 7 filter errors, 8 OPEN, 0 seed errors, 0 label errors. Biggest gains: respect clip paths, skip near-white/see-through paint, require 10% coverage for a wall pair, keep columns that bridge wall gaps. Still failing: stairs and furniture touching walls (4 rooms). Open items: stair rule, "fill > 3x label" OPEN flag, fills about 5% under the label (label boundary unknown), curve walls unverified, door-gap growth unmeasured. Product rule: OPEN rooms are detected and flagged, and the user draws a manual polygon. ROUND 3 DONE, re-run by the parent (run V1, 2026-09-29): 14 of 16 non-OPEN rooms within 15%, median absolute error 0.023. Gains: stair rule (treads plus stair box), and growing the fill 100 mm into the wall line (fixes the ~5% under-fill; this value is fitted to the labels, 33 mm if labels use the finish face). Failing non-OPEN: Example_2 #1 (0.47, two-flight stair) and 00_arch_ground_floor #0 (0.68, table/desk touching walls; no general rule found, stopped per two-strike rule). OPEN flag: fill/label ratio > 1.3 flags all 8 OPEN rooms with no false alarms; shared-fill check flags 4 of 8; border-touch flags none. Timings (Node): filter 0.35-3.3 s per page, fill 0.35-1.6 s per room. Not verified: stair rule on other PDFs (drops 540 lines in 00_ground), polygon output (study measures area only), scale set by hand. Spec for the TypeScript port: session scratchpad `roomstudy/algorithm.md` (copy it into the repo at the start of Phase 3). Next step: Phase 2 (extraction API). Extract segments with a throwaway script. Decide the wall-line filter and wall-pair rules. Output: written findings, no app code.
2. **pdf-engine extraction API.** Add `getVectorPaths`, `getTextRuns`, `listLayers`. Implement in `pdf-engine-mupdf`. Test on fixtures. STATUS 2026-09-29: DONE, commit COMMIT_HASH. `PATH_KIND`, `VectorPathOptions`, `VectorPageData`, `TextRun`, `LayerInfo` and the three methods are in `packages/pdf-engine`; adapter code is in `packages/pdf-engine-mupdf/src/vectors.ts`; tests are in `vectors.test.ts` (vitest was already there). Coordinates: displayed page space, y down; `page.run` with the identity matrix already applies /Rotate (checked with synthetic /Rotate 0/90/180/270 pages). Verified: root `pnpm build` (9 tasks), `pnpm typecheck` (16 tasks), pdf-engine-mupdf tests (29) and core tests (449) pass. Segment and text counts equal the round-2 prototype on all 5 fixtures (Example_1 377,262 segs; Example_2 112,029; Example_3 96,252; ground floor 55,460; first floor 40,509; text chars equal). The plan's earlier 58,648 for the ground floor was the round-1 count before clip/light/alpha filters; the tests use 55,460. Timings: 0.3-1.0 s per page; Test_doc.pdf 994,601 segments in 6.3 s, +150 MB RSS (recommend maxSegments 2,000,000). getTextRuns takes 0.1-0.4 s. Text line boxes are unrounded (prototype used JSON output rounded to whole points). Layers: none in any fixture; `listLayers` reads mupdf `countLayers/getLayerName/isLayerVisible` (default configuration; context7 had no page for these). Untracked fixtures are copied in, never added to git.
3. **Core geometry (headless, `@mepapp/core`).** Filtering, gap closing, click-to-fill (approach B), inner-face offset. Vitest tests on fixture data.
4. **Polygonizer test and decision.** Build JSTS and own-code versions on the ground floor. Compare speed, bundle size, correctness. Record the decision.
5. **Detect-all (approach A) in a Web Worker.** Progress, cache, leak report.
6. **Room data model.** `Room` in core: polygon, area, name, number, undo, save-file schema, migration.
7. **Name reading.** Label clusters, matching, area check.
8. **UI.** Detect-all command, click-to-fill tool, room overlay, correction tools (edit vertices, delete, merge, split), room properties panel.
9. **Element-to-room assignment and per-room calculations.**

Scanned PDFs (raster, approach B on the raster or C) stay out of scope.

## 9. Open risks

- The three current fixtures come from one office and one CAD source. The filter may over-fit.
- Some PDFs draw doors without arcs, or draw text as outlines (then no names).
- Default gap width is not decided (candidate: 1000 mm).
- Rooms with no closed boundary: leak reporting must be clear. Revisit separator lines if testing shows a need.
- Not verified: other PDFs' layers, real algorithm timings.
