# Whole-project code review — findings and fix status

Status: **Review done 2026-10-04. Fix groups 1–5 in progress on branch `worktree-code-review-fixes`.** All other findings are open.

This file is the reference list of every defect that the 2026-10-04 code review found. Each finding has an id, a location, a short description and a status. When a finding is fixed, its status gets the commit hash and the date. Do not delete a finding when it is fixed. Mark it instead.

## 1. Scope and method

- **Code reviewed:** `origin/master` at `c45307c` (the live site on 2026-10-04). The branch `worktree-custom-stamp-library` was not reviewed.
- **Method:** nine review agents each read one part of the code (core domain, core electrical, core rooms, `render/scene.ts`, the other render files, UI top-level files, UI electrical components, the other UI components, PDF engine and platform). The coordinator then checked the most severe findings in the code.
- **Checks at review time:** root `pnpm build` passed. `pnpm typecheck` passed. All 771 tests passed (core 628, ui 68, platform 31, pdf-engine-mupdf 24, platform-web 20). The `render` package has no tests. No package has a lint step.
- **Line numbers** are for `c45307c`. They move when the code changes, so search for the named symbol if a line does not match.

The **Checked** column says how the finding was confirmed:

- **run**: the coordinator reproduced it.
- **code**: the coordinator read the code path.
- **agent**: only the review agent confirmed it (by reading, or by a run where the text says "agent run").
- **plausible**: the code path exists, but a timing or browser detail was not confirmed.

The **Status** column is one of: **Open**, **Fixed** (with commit), **Partly fixed** (the text says which part), or **Not a defect**.

## 2. Fix groups

The review recommended five fix groups, in this order. The user asked for all five on 2026-10-04.

| Group | Findings | Status |
|---|---|---|
| 1. Save and Open | C1, C2, C3, H4, H5, H6, H7 | Open |
| 2. Keys that reach the canvas through dialogs | H8, H20 | Open |
| 3. Undo and references | H9, M6 | Open |
| 4. Tab switch keeps state from the other document | H18, H19, M1, M2, M3, M4, M5 | Open |
| 5. Number inputs | H15, M9, M10, M11, M12 | Open |

## 3. Critical

| ID | Location | Issue | Checked | Status |
|---|---|---|---|---|
| C1 | `packages/pdf-engine-mupdf/src/index.ts:579` | `save()` always calls `saveToBuffer('incremental')`. MuPDF refuses an incremental save for a PDF that it repaired on open (`Can't do incremental writes on a repaired file`). `handleSave` does not catch the error, and `exportToPdf` already cleared the unsaved-changes marker. So the save fails with no message, and the document looks saved. | run | Open |
| C2 | `packages/ui/src/App.tsx:467` | `openPdfFile` opens the document and registers its file handle before `loadFromPdf`. When the embedded project fails to load (newer schema from a branch build, bad JSON, `ProjectLoadError`), the catch only sets a status. The tab stays open with an empty drawing. A Save then replaces the project data in the file. | code | Open |
| C3 | `packages/render/src/scene.ts:3251` | `exportToPdf` reads `this.doc` again after each `await` (`pdfSyncIds`, `exportProject()`, `markClean()`). Pixi 8.20 `extract.base64` uses `canvas.toBlob`, so the browser handles clicks during a save. A tab switch during a save writes document B's project into file A. | code | Open |

## 4. High

| ID | Location | Issue | Checked | Status |
|---|---|---|---|---|
| H4 | `packages/render/src/scene.ts:3272` | `exportToPdf` calls `markClean()` before the file write. A cancelled Save As, a denied permission or a failed write leaves unsaved work marked as saved. The close guard (`App.tsx:520`) then gives no warning. | code | Open |
| H5 | `packages/ui/src/App.tsx:517` | No `beforeunload` handler. Closing or reloading the browser tab loses unsaved work in every open document without a prompt. | code | Open |
| H6 | `packages/ui/src/App.tsx:589` | `handleSave` and `handleSaveAs` have no try/catch around `syncAndGetPdfBytes`, and nothing blocks a second save while one runs. A failure is an unhandled rejection with no message. Two overlapping saves can add duplicate annotations with the same /NM id. | code | Open |
| H7 | `packages/render/src/scene.ts:3290` | `loadFromPdf` uses `this.doc` after its `await`s for `domainSyncEntries()` and `pdfSyncIds`. A tab switch during a load gives document B the ids of A, so every later save of B throws `no annotation found`. A keeps an empty id set, so deleted elements stay in its exported PDF. | code | Open |
| H8 | `packages/ui/src/useShapeDrawEditor.ts:410` | Delete/Backspace in the Element Editor also reaches `SketchScene.keyDownImpl` and deletes the canvas selection behind the dialog. Ctrl+V pastes onto the canvas. The handler calls `preventDefault` but not `stopPropagation`, `ElementEditorDialog` does not set `isolateKeys`, and the scene guard skips only INPUT/TEXTAREA (not SELECT). | code | Open |
| H9 | `packages/render/src/tools/drawSegmentTool.ts:137` | `chainContinuationFrom` re-arms `pendingStart` with the resolved end, including its `setupCommand`. The next segment runs that command again inside its own undo step. Undo of that segment then deletes the fitting that the previous segment ends on (broken reference saved to the project). `undoDrawing` also leaves the pending chain armed on an undone point. | code | Open |
| H10 | `packages/render/src/scene.ts:2147` (also `:1290`) | `setActiveNetworkType` and `setNetworkTypeForSegmentsNetworks` push the `NETWORK_TYPE_LIBRARY` object itself, not a copy. `renameNetworkType` and `updateNetworkType` then mutate the shared library entry, so the change shows in every open document. | code | Open |
| H11 | `packages/core/src/flow.ts:75` | The only caller (`scene.ts:2466`) never passes `rootElementId`. The solver picks the first sorted node with one connection and no capacity. `fitting:…` sorts before `port:…`, so a loose duct end becomes the root before the AHU. Flow values and arrows are wrong. | code | Open |
| H12 | `packages/core/src/schematic-template-edit.ts:266` | `copyTemplate` gives the lowest free `custom-N` id (`nextId` fills gaps). After a delete, a new copy reuses the id, and schematics that linked to the old template now link to the new one. "Update from template" then replaces their copy. Templates are per browser, so the same project links to different templates on two machines. | code | Open |
| H13 | `packages/ui/src/schematicTemplateStorage.ts:18` | The template editor saves on each keystroke, also when a field label is empty or a binding is incomplete. `loadCustomTemplates` drops every template with a validation issue, and the mount effect (`App.tsx:323`) writes the filtered list back. The template is lost. The same applies to symbols (`App.tsx:324`). | code | Open |
| H14 | `packages/render/src/tools/selectTool.ts:333` | A click on empty canvas starts a rubber band of zero size. `onEnd` selects every annotation and segment whose bounding box contains the click point. A Delete then removes items that the user did not pick. | code | Open |
| H15 | `packages/ui/src/components/ElementEditorDialog.tsx:406` | Clearing the W or H field sets the size to `Number('')` = 0. The resize effect (`:190-200`) divides by 0 and then multiplies by 0, so every shape and port coordinate becomes NaN. Ports have no undo. | code | Open |
| H16 | `packages/ui/src/components/GlobalPropertiesDialog.tsx:96` | Renaming a custom property deletes its value on every element and writes the default value under the new name. `applyCustomPropertyCascade` (`scene.ts:2398`) diffs by name, and the rows have no stable id. | code | Open |
| H17 | `packages/pdf-engine-mupdf/src/index.ts:415` | On pages with /Rotate 90/180/270, the stamp rectangle goes through `worldRectToContent` before `annot.setRect`, but MuPDF already converts from displayed page space. Exported stamps are in the wrong place in other PDF viewers. The read path reverses the error, so the round-trip test passes. The PNG pre-rotation at `scene.ts:3402` has the same root cause. | agent run | Open |
| H18 | `packages/render/src/scene.ts:978` | `activateInternal` and `setBackdropPage` do not clear `selectedRoomIds` / `selectedRoomVertices`. Room ids restart in each document, so a room edit or "Delete room" goes to the other document's room with the same id. | agent | Open |
| H19 | `packages/render/src/scene.ts:4080` | The clipboard keeps stamp base textures by reference. `closeDocument` destroys them (`destroyStampEntries`). A paste after the close, or a stamp already pasted into another document, then uses a destroyed texture, which can stop the canvas render. | agent (crash plausible) | Open |
| H20 | `packages/ui/src/components/SchematicDialog.tsx:286` | While a drawing or symbol subview is open, Escape in a text input reaches `Dialog`'s handler and closes the whole Schematic dialog. The subview's unsaved work is lost. The mode tab and the schematic switcher are also not blocked while the subview is open. | agent | Open |
| H21 | `packages/ui/src/components/RoomProperties.tsx:6` | `CommitInput` saves only on blur or Enter. A canvas click changes the room selection on pointerdown, before the blur, so the typed value is lost. | agent (timing plausible) | Open |

## 5. Medium

| ID | Location | Issue | Checked | Status |
|---|---|---|---|---|
| M1 | `packages/ui/src/App.tsx:399` | `handleChangePage` applies the rendered page to whichever document is active when the render finishes. Rapid clicks can resolve out of order. A render error is an unhandled rejection. | code | Open |
| M2 | `packages/render/src/scene.ts:1005` | A document switch resets only the segment tool. Polyline and measure state carry over into the other document (the contract in `tools/types.ts:238` says every tool is reset). | agent | Open |
| M3 | `packages/ui/src/App.tsx:306` | App keeps `activeDefinitionId` and `activeNetworkTypeId` across a document switch, but the scene resets both. The Stamps tab shows the wrong type, and the rail Stamp button arms a tool with no texture. | agent | Open |
| M4 | `packages/render/src/scene.ts:4453` | `activateInternal` removes `measureLabel` from `world` and never adds it back. The measure distance text never shows again in the session. | agent | Open |
| M5 | `packages/render/src/scene.ts:875` | When `openDocument` reuses the empty first document, it emits only `documentsChanged`. The UI keeps `pageCount = 1`, so page navigation stays hidden. | agent | Open |
| M6 | `packages/core/src/commands.ts:205` | `Transaction.update` writes its own private state back on each pointermove. A Delete, Backspace or Ctrl+V during a drag is overwritten, but stays on the undo stack. `keyDownImpl` does not check for an active drag. Async room detection during a drag has the same effect (plausible). | code | Open |
| M7 | `packages/render/src/tools/selectTool.ts:222` | In a rotation, stamps turn around the centroid of the stamp positions (`multiRotate`), and annotations turn around the centre of all selected bounds. A mixed selection breaks its layout. The rail Rotate button has the same defect. | agent | Open |
| M8 | `packages/render/src/tools/drawSegmentTool.ts:108` | The second click resolves against the state before the first click's new fitting. A double-click makes a zero-length segment that loops back to its own fitting. Two clicks on the same duct split it twice. | agent | Open |
| M9 | `packages/ui/src/components/PropertiesPanel.tsx:634` | An empty Scale % field writes scale 0 and saves `{scale: 0}` as the stamp's remembered default, so later placements of that stamp are invisible. The multi-select path (`:497`) does the same. | agent | Open |
| M10 | `packages/ui/src/components/PropertiesPanel.tsx:610` | Rotation, X, Y and numeric custom values commit `Number(e.target.value)` on each change. Typing "-45" over a selected value can give 45. | plausible | Open |
| M11 | `packages/ui/src/components/SettingsDialog.tsx:58` | Each keystroke is clamped to the field's range, so select-all and typing "600" gives 3000 for the room gap. The value goes to localStorage. | agent | Open |
| M12 | `packages/ui/src/components/RoomProperties.tsx:93` | A numeric room property typed with a Dutch comma ("2,5") is saved as 0. `core/src/custom-properties.ts:67` does the same for numeric defaults. | agent | Open |
| M13 | `packages/render/src/scene.ts:2342` | `setTerminalCapacity`, `setCapacityForSelection`, `renameNetworkType` and `duplicateNetworkType` do not set the unsaved-changes marker. Closing the document gives no warning, and the edits are lost. | agent | Open |
| M14 | `packages/ui/src/components/NetworkTypeEditorDialog.tsx:109` | Duplicate does nothing for a library network type that the document has not adopted yet (`scene.ts:2177` returns null). | agent | Open |
| M15 | `packages/ui/src/components/NetworkTreePanel.tsx:409` | Rename mode is keyed by network type, so every run of that type shows an `autoFocus` input. The second focus blurs the first, and rename mode ends at once. | plausible | Open |
| M16 | `packages/core/src/schematic-expression.ts:212` | A decimals spec above 100 (`{circuit.number:101}`) parses, but `toFixed(101)` throws a `RangeError`. The app has no error boundary, so the screen goes blank each time that template opens. Very deep nesting overflows the recursive parser in the same way. | code | Open |
| M17 | `packages/core/src/schematic-template-edit.ts:231` | `duplicateGroup` gives the copy the rule `any` and puts it right after the original. The copy then takes every circuit that a later group would match. | agent | Open |
| M18 | `packages/core/src/schematic-generator.ts:311` | Text overrides, block overrides and extras are keyed by ids that can be reused (`nextId` for template blocks, the reseeded circuit counter). Old overrides attach to a new block or circuit. | agent | Open |
| M19 | `packages/ui/src/components/SchematicDialog.tsx:782` | A dragged generated block stores an absolute sheet position, so it does not move with its circuit when circuits shift. Extras use a position relative to the circuit. | agent | Open |
| M20 | `packages/ui/src/components/SchematicDialog.tsx:275` | The text bar (`textEdit`) is not cleared on a schematic switch. Apply writes the text into the other schematic. | agent | Open |
| M21 | `packages/ui/src/components/SchematicDialog.tsx:249` | After a library symbol is edited, placing it again in a schematic that already uses it draws the old art at the new size. | agent | Open |
| M22 | `packages/ui/src/components/SchematicTemplateEditor.tsx:250` | The "Add to" select shows "Sheet" when the chosen group draws no circuit, but the state keeps the group. A drawn shape disappears. `SchematicDialog.tsx:237` has the same issue for "Attach to". | agent | Open |
| M23 | `packages/ui/src/components/CircuitTypesDialog.tsx:97` | `markDirty` always reports dirty, but the form computes dirty by comparison. After typing a letter and deleting it, the dialog locks every other type. | agent | Open |
| M24 | `packages/ui/src/components/CircuitPanelProperties.tsx:562` | `CircuitNumberField` saves only on blur. A canvas click unmounts the panel first, so the typed number is lost. | plausible | Open |
| M25 | `packages/ui/src/schematicBlockSvg.tsx:181` | Load symbols are drawn with the default 1 mm minimum stroke, about 6 times too thick. Other call sites pass `DRAWING_MIN_STROKE_MM`. | agent | Open |
| M26 | `packages/core/src/calibration.ts:60` | `calibrateFromKnownDistance` accepts two identical points and returns `pageUnitsPerRealUnit: 0`. Every later length and area becomes Infinity or NaN. | code | Open |
| M27 | `packages/core/src/symbol-shape-geometry.ts:259` | Bounds, handles, handle drag and group rotate turn shapes in fraction space, but drawing and hit-testing turn them in pixel space. On a canvas that is not square, rotated shapes get wrong handles, and group rotation changes their layout. | agent | Open |
| M28 | `packages/core/src/symbol-shape-geometry.ts:355` | A handle drag on a rotated rect, image or ellipse moves the corner that should stay fixed, because the rotation pivot moves with the new size. | agent | Open |
| M29 | `packages/core/src/rooms/filter.ts:77` | The wall pair rule misses a partner line when one face has a tiny negative slope and the other a tiny positive slope (angle bins wrap, offsets change sign). The room fill then leaks through that wall. `stairRule` and `dashRule` share the cause. | agent run | Open |
| M30 | `packages/core/src/rooms/filter.ts:1092` | `componentRule` rasterizes the page at 50 mm per pixel with no pixel cap. A0 at 1:500 needs about 1 GB on the main thread. | agent | Open |
| M31 | `packages/core/src/rooms/edit.ts:115` | Vertex edits are not checked for a simple ring with an area above 0. A self-intersecting ring is stored as it is, or `wrapAroundRooms` keeps only one half of it. | agent run | Open |
| M32 | `packages/core/src/rooms/labels.ts:58` | The area regex reads only the last digit group, so "1.234,56 m²" gives 234.56. | agent run | Open |
| M33 | `packages/pdf-engine-mupdf/src/index.ts:258` | `getPageInfo` reports MediaBox dimensions, but the raster and all MuPDF coordinates use the CropBox. The backdrop is stretched when the two differ. A page with no MediaBox crashes `readMediaBox`. | agent run | Open |
| M34 | `packages/pdf-engine-mupdf/src/index.ts:579` | Every save is incremental and appends the full project JSON again. Five saves grew `arch_simple_A4.pdf` from 2.7 KB to 1 MB. | agent run | Open |
| M35 | `packages/pdf-engine-mupdf/src/index.ts:591` | `save()` replaces `this.doc` without `destroy()`, the save buffer is not destroyed, and `PdfDocumentHandle` has no close method. WASM memory grows with each save and each open. | plausible | Open |
| M36 | `packages/pdf-engine-mupdf/src/index.ts:306` | Page render encodes a PNG in WASM and the browser decodes it again. On an A0 page the encode is about 70 % of the render time (Node). | agent run | Open |
| M37 | `packages/pdf-engine-mupdf/src/index.ts:599` | `openDocument` never checks `needsPassword()`. A PDF with a user password opens as a blank page with no message. | agent run | Open |
| M38 | `packages/render/src/scene.ts:4233` | Each pointermove of a move, rotate or resize drag rebuilds the whole drawing layer, runs `computeNetworks` three times and `solveFlow` for each network (`flow.ts:49` builds a map of all segments per network), and emits events that re-render React. | agent | Open |
| M39 | `packages/render/src/roomLayer.ts:13` | `drawRooms` destroys and rebuilds every room Graphics and Text on each call, and `zoomChanged` calls it on each wheel step (text resolution up to 8). | agent | Open |
| M40 | `packages/render/src/scene.ts:3220` | `loadProjectFromJson` loads the icon and creates a texture once per placed stamp, not once per stamp definition. | agent | Open |
| M41 | `packages/ui/src/components/SchematicDialog.tsx:205` | Each schematic edit goes through `notifyCircuitsChanged`, which re-syncs every stamp label on the canvas. A multi-select drag does this once per item per pointermove. | plausible | Open |

## 6. Low

| ID | Location | Issue | Status |
|---|---|---|---|
| L1 | `packages/core/src/schematic-expression.ts:264` | Free text from the schematic Text tool is stored as a binding without escaping. `[` and `]` disappear, and a single `}` blanks the text. | Open |
| L2 | `packages/core/src/schematic-generator.ts:392` | Group blocks and extras read `SCHEMATIC_BLOCK_CATALOGUE[block.type]` without the guard that the layout loop has. A file with an unknown block type crashes the generator. | Open |
| L3 | `packages/core/src/schematic-template-edit.ts:398` | `buildSampleSchematicInput` can make two sample circuits with the same id and number. | Open |
| L4 | `packages/core/src/schematic.ts:95` | `refreshSchematicFromTemplate` drops the bundled copy of a symbol that was deleted from the library, so the block loses its art. | Open |
| L5 | `packages/core/src/schematic.ts:44` | `getSchematicTemplateStatus` deep-copies and serializes the template on each render of `SchematicDialog` (not memoized). | Open |
| L6 | `packages/core/src/circuit.ts:296` | `resolveCircuitLineTargets` scans every circuit and panel for each selected stamp on each overlay redraw. | Open |
| L7 | `packages/render/src/tools/dragSnap.ts:32` | Angle snap runs before endpoint snap, so a click on a port at an angle off the snap step can miss the port. | Open |
| L8 | `packages/render/src/tools/selectTool.ts:166` | `moved` becomes true on any pointermove. `CLICK_VS_DRAG_SCREEN_PX` is declared but not used, so 1 px of jitter pushes a no-op move to the undo stack and sets the unsaved-changes marker. | Open |
| L9 | `packages/render/src/tools/placeStampTool.ts:79` | Port groups go into `doc.portGroups` outside the undo history. Undo or delete of the stamp leaves them, and a later stamp with the same id inherits them. | Open |
| L10 | `packages/ui/src/App.tsx:303` | Some `localStorage` reads and writes have no try/catch. A browser that blocks site data crashes the app on mount. | Open |
| L11 | `packages/ui/src/components/PortEditorParts.tsx:39` | Escape in the port-rename input (and the text-shape input, `ShapeDrawSurface.tsx:265`) also reaches `Dialog` and closes the Element Editor or asks to discard. | Open |
| L12 | `packages/ui/src/components/ColorPicker.tsx` | The native colour input calls `pick()` on its first `input` event, so the popover closes after the first drag movement (plausible). | Open |
| L13 | `packages/ui/src/components/ElementEditorDialog.tsx` | `handleSave` is async with no in-flight guard. A double-click on Create can create two custom elements. | Open |
| L14 | `packages/ui/src/components/PropertiesPanel.tsx` | With one stamp plus a segment or annotation selected, the single-stamp X, Y and Rotation fields do nothing (`setSelectedPosition` needs exactly one selected id). | Open |
| L15 | `packages/ui/src/components/ShapeDrawToolbar.tsx` | The shape style Scale % field commits only on blur, so a click on another shape loses the typed value. | Open |
| L16 | `packages/ui/src/components/NetworkTypeEditorDialog.tsx` | An empty Thickness field saves `lineWidthPt` 0. | Open |
| L17 | `packages/ui/src/components/StampsPanel.tsx` | The module-level `bitmapCache` has no limit, and a slow stamp pick can arm a stale stamp after a faster later pick. | Open |
| L18 | `packages/render/src/scene.ts:2307` | `setDefinitionArtwork` replaces the base texture without releasing the old one, and writes to whichever document is active when the bitmap resolves. | Open |
| L19 | `packages/ui/src/components/SchematicTemplateProperties.tsx:495` | `CircuitNumberRule` copies the numbers into its text state only once. After undo or redo, the box shows an old list, and the next keystroke saves it again. | Open |
| L20 | `packages/ui/src/components/TerminalCircuitSection.tsx:324` | "Assign all to" calls the single-terminal assign once per terminal: N undo steps and up to N toasts. | Open |
| L21 | `packages/ui/src/components/SchematicDialog.tsx:350` | The first "Edit template" on a schematic made from a built-in template marks it "changed" before any edit (`isSameData` compares id and name). | Open |
| L22 | `packages/ui/src/components/CircuitPanelProperties.tsx:248` | Numeric inputs turn `''` into 0, so a value cannot be cleared, and ".5" can become 5. `SchematicSymbolEditor.tsx:96` (W, H) has the same pattern. `NumberField` (`SchematicTemplateProperties.tsx:109`) clears an optional value on invalid input such as "1,5". | Open |
| L23 | `packages/pdf-engine-mupdf/src/index.ts:495` | `getEmbeddedFile` returns a live WASM heap view and drops its Buffer. Safe today only because the caller decodes at once. | Open |
| L24 | `packages/core/src/segmentPaste.ts:46` | Each pasted segment end on a stamp that was not copied gets its own new fitting, so two segments that met at one port paste as two runs. Pasted stamps lose their port groups. | Open |
| L25 | `packages/core/src/flow.ts:45` | `ownCapacityOf` gives an element's full capacity to each of its ports, so an element with two ungrouped ports in one network is counted twice. | Open |
| L26 | `packages/render/src/scene.ts:3135` | `loadProject` validates only top-level shapes. A `__proto__` key in `schematicProjectFields` replaces that object's prototype through `Object.assign`. The global prototype is not changed. | Open |
| L27 | `packages/core/src/rooms/overlap.ts:56` | `resolveRoomOverlaps` intersects every pair of rooms with no bounding-box pre-check (600 rooms: about 2 s on the main thread). | Open |
| L28 | `packages/core/src/rooms/raster.ts:30` | The Bresenham step limit counts from the first endpoint, so a line that starts more than 20,000 px outside the raster is not drawn. | Open |
| L29 | `packages/core/src/rooms/fill.ts:152` | The module-level `rasterCache` keeps up to about 45 MB after the document closes. | Open |
| L30 | `.github/workflows/deploy-web.yml` | `pages: write` and `id-token: write` are set for the whole workflow, so the build job (which runs `pnpm install` scripts) has them too. | Open |
| L31 | `package.json` files | `mupdf`, `pixi.js`, `react` and `vite` are declared as `"latest"`, so only the lockfile fixes their versions. | Open |
| L32 | `apps/web/public/sw.js` | The service worker uses a fixed `CACHE_NAME`, so old hashed assets stay in the cache. There is no CSP. | Open |

## 7. Not a defect

- **Field id rename does not update old text** (`schematic-template-edit.ts:425`). The UI hint at `SchematicTemplateProperties.tsx:414` says this, so the behaviour is intentional.
- **"`exportToPdf` cannot interleave with user input"** (one agent's claim). This is wrong: Pixi 8.20.1 `ExtractSystem.base64` uses `canvas.toBlob`, which is asynchronous. See C3.

## 8. What the review found sound

- No `dangerouslySetInnerHTML` or `innerHTML`. JSX builds all SVG. The expression parser uses no `eval` and checks function names with `hasOwnProperty`.
- The Excel export writes room names as plain strings, not formulas.
- `schema.ts` checks the migration chain on each load and refuses newer versions. Each version 0–12 has a resume test.
- The room worker protocol drops stale jobs, cancels by terminating the worker, and returns errors.
- Network Type changes retag the whole connected run and adopt the type first. Stamp colour goes through `colorize.ts`, never `Sprite.tint`.
- Only `pdf-engine-mupdf` imports `mupdf`. All runtime dependencies are AGPL-compatible.
