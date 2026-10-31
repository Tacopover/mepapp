# B1-T26: readers of the drawing that ignore the page

Date: 2026-10-31. Branch: `worktree-buildings-model`. Task: B1-T26 of `buildings-b1.md`.

Every new stamp, segment, fitting and annotation carries the shown page (`pageIndex`). The helpers `onPage`, `withPage` and `pasteOnPage` are in `packages/core/src/page-scope.ts`. The shown page is `SketchScene.getPageIndex()` (`doc.pageIndex`).

Rule for each reader:

- **SHOWN**: the reader works on the page that the user sees (auto-place, route, hit-test, snap, open ports). It uses `onPage`.
- **ALL**: the reader works on the whole document (flow solve, circuits, Networks list, summaries, id look-ups, save). It keeps all pages. It may show the page.
- **Owner**: T09 (view filter), T10 (connect, snap, paste) or T11 (PDF annotation sync list and delete) fixes the reader. T26 does not touch it.

Status values: `fix` (T26 fixes it, with a test), `ok` (no change needed), `T09`, `T10`, `T11`, `OPEN` (needs a decision; recommendation given).

Line numbers are for the commit before T26 (`6ce682f`).

## A. Readers that T26 fixes (SHOWN)

| # | Reader | Where | Must see | Problem | Fix | Status |
|---|---|---|---|---|---|---|
| R01 | `planAutoPlacement` (`stampsOf`, `stale`) | `core/src/rooms/placement-layout.ts:913-934` | SHOWN | A re-run finds the old auto-placed stamps by room id, or, when the room id is gone, by `polygonContainsPoint`. A stamp of another page at the same x, y matches a room of this page. It is then kept, replaced or removed (stale) by mistake. | Match a stamp only when `(stamp.pageIndex ?? 0) === room.pageIndex`. Pure core test. | fix |
| R02 | `autoPlaceStamps` / `autoPlacePlan` (UI) | `render/src/scene.ts:3104`; `ui/src/components/autoPlacePlan.ts` | SHOWN | The writer is ready (T23 writes the shown page). `autoPlacePlan.ts` reads only the `existing` of a row, so it is page-safe after R01. | None after R01. | ok (via R01) |
| R03 | `listAutoPlacedStamps` | `scene.ts:3180`; used by `AutoPlaceDialog.tsx:400`, `PlacementRuleGuide.tsx:446,1422` | SHOWN | Returns the auto-placed stamps of all pages. | R01 handles the match. The list stays whole, because `PlacementRuleGuide` looks stamps up by id. | ok (via R01) |
| R04 | `planRoute` | `scene.ts:2946-2967` | SHOWN | Segments, fittings and stamps of all pages go into the route plan. A stamp of another page is a target port. | Use `onPage(..., shownPage)` for `segments`, `fittings`, `stamps` and for `elementCategories`. | fix |
| R05 | `RouteDialog` stamp and connectivity lists | `ui/src/components/RouteDialog.tsx:41-42,58-59` | SHOWN | The start list, the type choices and `checkRouteStart` see stamps and segments of all pages. | Read `scene.listStamps(page)` and `scene.getConnectivity(page)` with the shown page. | fix |
| R06 | `listStamps` | `scene.ts:1584` | ALL (default) | Used by the Layers list, the quantities export, circuits, schematics (ALL) and by the route dialog (SHOWN). | Add an optional `page?: number`. With a page it returns `onPage`. | fix |
| R07 | `getConnectivity` | `scene.ts:1590` | ALL (default) | Used by the route dialog (SHOWN), the size dialog and the quantities export (ALL). | Add an optional `page?: number`. With a page: `segments` and `fittings` are `onPage`; `portGroups` stay whole (they hold stamp ids). | fix |
| R08 | `openPorts` (status bar count, dots on the overlay) | `scene.ts:2440-2443`, `getDrawingSummary` `:2422`, `redrawOverlay` `:5775` | SHOWN | Open ports of all pages are counted and drawn. Routing works on one page. | Use `onPage(stamps, shownPage)` in `openPorts`. The other counts of `getDrawingSummary` stay ALL. | fix |
| R09 | PDF export of a stamp annotation | `scene.ts:4616` (`getPageInfo(0)`), `:4634` (`pageIndex: 0`) | the page of the stamp | A stamp of page 2 is written to page 1 and turned by the /Rotate of page 1 (finding F-B1-T08-1). | Use `stampData.pageIndex` for both. | fix |
| R10 | Quantities stamp tables | `core/src/quantities.ts:144-172` | ALL, show the page | The Segments and Fittings tables have a `Page` column. The Terminals and Equipment tables have none, so a stamp row does not say its page. | Add a `Page` column as the first column. Core test. | fix |
| R11 | Stale comments about "page 0" | `scene.ts:1098-1105`, `render/src/document.ts:98` | - | The comments say that elements are not page-scoped and record page 0. This is wrong now. | Rewrite both comments. | fix |

## B. Readers owned by T09, T10, T11 (listed, not fixed here)

| # | Reader | Where | Must see | Owner |
|---|---|---|---|---|
| R20 | `syncDrawingLayer` (segments, fittings, annotations draw) | `scene.ts:5537-5560`, `computeVisibleFittingIds` | SHOWN | T09 |
| R21 | `syncStampSprites` (stamp sprites) | `scene.ts:5620-5640` | SHOWN | T09 |
| R22 | Hit-test of `hitTest` (stamps, fittings, segments, annotations) | `scene.ts:4954-4985` | SHOWN | T09 |
| R23 | Rubber-band select | `render/src/tools/selectTool.ts:356-375` | SHOWN | T09 |
| R24 | Selection box of `redrawOverlay` (kept selection of another page) | `scene.ts:5794-5814`; `setBackdropPage` `:1106` | SHOWN | T09 |
| R25 | `resolveSegmentEndpoint` for the context menu | `scene.ts:986-993` | SHOWN | T10 (connect target) |
| R26 | Connect and snap in `drawSegmentTool` (`stamps`, `segments`, `fittings`) | `render/src/tools/drawSegmentTool.ts:102-104,138` | SHOWN | T10 |
| R27 | Alignment guides refs | `render/src/tools/alignmentGuides.ts:243-245` | SHOWN | T10 |
| R28 | `dragSnap`, `lineSnap` | `render/src/tools/dragSnap.ts`, `lineSnap.ts` | SHOWN | T10 |
| R29 | Paste | `scene.ts:5396-5450` | writes the shown page | T10 (done in T24) |
| R30 | `exportToPdf` list and delete calls `listAnnotations(0)`, `deleteAnnotation` | `scene.ts:4466-4482` | every page that has elements or sync ids | T11 |
| R31 | `loadFromPdf` list call `listAnnotations(0)` | `scene.ts:4507` | every page | T11 |
| R32 | `domainSyncEntries` (needs the page of each entry for T11) | `scene.ts:4522-4541` | ALL, with page | T11 |

## C. Readers that keep ALL pages (decision: no change)

| # | Reader | Where | Decision |
|---|---|---|---|
| R40 | `recomputeFlow` / `solveFlow` | `scene.ts:3387-3400` | ALL. A network is on one page (T10 keeps connections on a page), so the solve is right. Rule recorded; not touched. |
| R41 | `getNetworkSummaries` (Networks panel) | `scene.ts:1664-1691` | ALL. The list shows every network of the document. Showing the page of a network is a later UI item (OPEN-1). |
| R42 | `getDrawingSummary` counts | `scene.ts:2414-2437` | ALL (segment, fitting, annotation, network counts). Only the open ports are SHOWN (R08). |
| R43 | `portSegmentTypes` | `scene.ts:1322-1333` | ALL. It maps a stamp id and a port id to a type. Ids are unique in the document, so the result is right for any page. |
| R44 | `stampPortConnectionPoints`, `applyConnectivityCascade`, `capacityElements` | `scene.ts:4892,4851` | ALL. They work on stamp ids. |
| R45 | Definition update, replace, lost ports (`applyDefinitionToPlacedStamps`, `countLostPortConnections`, `removedPortsByStamp`, `detachLostPortEnds`, `remapPortEnds`, `getReplacePortMismatch`) | `scene.ts:2631-2798` | ALL. A stamp definition applies to every placed stamp of the document. `detachLostPortEnds` already gives the new fitting the page of the segment. |
| R46 | Circuits and panels (`listCircuits`, circuit commands) | `scene.ts:1826-2208` | ALL. A circuit may hold terminals of several pages (building-wide). Rule recorded; not touched. |
| R47 | `buildSchematicTerminals` | `ui/src/schematicTerminals.ts:9` | ALL. It reads the stamps that the caller gives (`listStamps()` of all pages). Not touched. |
| R48 | `SizeDialog`, `planNetworkSizes`, `applyNetworkSizes` | `ui/src/components/SizeDialog.tsx:45-56`; `scene.ts:1600-1661` | ALL. A network is on one page; the start list may show every page. |
| R49 | Quantities export, `handleExportRooms` | `ui/src/App.tsx:788-840` | ALL. Segment and fitting rows have a page column. The page scale comes from `calibrationOf(pageIndex)`. Stamp rows get the page in R10. |
| R50 | Layers panel list (`allStamps`), `useSketchScene` | `ui/src/useSketchScene.ts:142,196,260,303` | ALL. Showing the page of a row is a later UI item (OPEN-1). |
| R51 | `findCircuitCandidates` | `core/src/circuit-candidates.ts:46` | ALL. It has no caller in `packages/` today. It tests every stamp against the rooms of ONE page (`input.pageIndex`). Recommendation: when a caller exists, use `stamp.pageIndex` per stamp. Not touched (circuits). |
| R52 | `serializeDocument`, save, `loadProjectInto` | `scene.ts:4227-4236,4356-4413` | ALL. |
| R53 | Label layer `syncLabels` | `scene.ts:1738-1759` | ALL data. The label nodes show on the shown page only through the view filter: OPEN-2. |

## D. OPEN items (decision needed; recommendation)

- **OPEN-1: show the page in the Networks panel and in the Layers list.** The panels list the document. A row of page 2 looks the same as a row of page 1. Recommendation: add a "Page n" suffix to the row, in the UI part of a later task. No data change.
- **OPEN-2: label layer and circuit lines are not in T09.** `syncLabels` (`scene.ts:1738`, labels of every stamp) and `drawCircuitLines` (`scene.ts:5816`) draw items of other pages on the shown page after the view filter. T09 names neither. Recommendation: T09 filters labels by the page of the stamp and draws a circuit line only when the terminal and the panel stamp are on the shown page.
- **OPEN-3: Route refuses a multi-page PDF.** `routePageProblem` (`core/src/route-input.ts:1`) and the `multi-page` error (`core/src/route-build.ts:210`) stop Route network when the PDF has more than one page. After R04 and R05 the route code itself is page-safe. Lifting the guard is a product decision (also the risers between levels). Recommendation: keep the guard until a later part decides.
- **OPEN-4: T11 and the stamp export.** R09 writes a stamp annotation to its own page. Until T11 lists annotations of every page, a save of a stamp of page 2 does not find the annotation again in the list of page 1, so a second save can add a copy on page 2. T11 must land in the same push window. Recommendation: do T11 next.
