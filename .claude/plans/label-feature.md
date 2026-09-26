# Canvas labels — plan and spec

Status: **approved 2026-09-26; all recommendations in §11 accepted by the user. Implementation started with Phase 1.** Written 2026-09-26. The "Label visibility controls" row in [[ui-atlas-layout-mapping]] §6 points here. The circuit label that [[electrical-circuits-model]] E8 moved out is part of this plan (Phase 1 and Phase 2).

## 1. Goal

A label is a short text that the canvas draws next to a placed stamp. The text shows one value of that stamp. The user asked for three kinds of value:

1. **Normal properties** — built-in stamp values, for example the name and the capacity.
2. **Custom properties** — the per-installation fields from the Global Properties dialog.
3. **Circuit properties** — values of the circuit that a terminal stamp is a member of, for example the circuit number and the panel name.

The user also asked that the circuit values are **properties of the stamp itself**. Today a terminal stamp does not show them. The stamp's Properties panel has only a circuit picker (`TerminalCircuitSection.tsx`). Phase 1 of this plan adds them.

## 2. Sources

### Old app (`/root/MepSketcher`)

One read-only research pass, 2026-09-26. `file:line` references come from that pass and were not re-checked one by one. Note: `Circuit.cs` and `Panel.cs` contain non-UTF8 bytes, so plain `grep` skips them. Use `grep -a`.

- `MepSketcherTools/MEP/MepElementLabel.cs:13-89` — the label type.
- `MepSketcherTools/Utilities/ElementLabelOverlay.cs` — rendering, anchor math (`:87-138`), side justification (`:141-147, 188-202`), fitting capacity label (`:301-422`).
- `MepSketcherTools/Schematics/MepElementConfigLibrary.cs` — label storage in the `<image>.mepconfig.json` sidecar.
- `MepSketcherTools/Schematics/MepLabelTemplateLibrary.cs` — saved label layouts ("label templates").
- `MEPSketcher2/ViewModels/SymbolCreator/ElementCreatorViewModel.cs` and `Views/SymbolCreator/ElementCreatorWindow.xaml:537-655` — the Labels mode of the element editor.
- `MEPSketcher2/ViewModels/LabelFilterViewModel.cs`, `Views/LabelFilterDropdown.xaml`, `MainWindow.xaml:1253-1307` — status bar toggle and filter.
- `Memory/Phase3-Label-Editor-Sub-Plan.md` — the old design history.

### MepApp (current `origin/master`, `99a2476`)

- `packages/core/src/stamp.ts:8-22` — `PlacedStamp`. No name field; the name comes from the definition.
- `packages/core/src/stamp-library.ts` — `StampDefinition`, `getStampDefinition`. Library definitions are read-only. Custom definitions live on the project (`customStampDefinitions`).
- `packages/core/src/custom-properties.ts` — `CustomPropertyDefinition`, `CustomPropertyValues`, reserved names.
- `packages/core/src/circuit.ts` — `Circuit`, `Panel`, `findCircuitForTerminal` (`:202`), `getCircuitLabel` (`:207`), the panel-default resolvers (`:353-385`).
- `packages/core/src/project.ts` — `CURRENT_SCHEMA_VERSION = 10`, migration steps.
- `packages/render/src/document.ts:80-85` — per-document layers. `packages/render/src/scene.ts` — `syncDrawingLayer` (`:3283`), `notifyCircuitsChanged` (`:1259`), `setStampProperty` (`:2002`), `syncFlowLabels` (`:2101`), `hitTest` (`:2738`), `exportToPdf` (`:2315`), `writeAnnotationForId` (`:2404`).
- `packages/ui/src/components/PropertiesPanel.tsx:512-663` — single-stamp branch. `TerminalCircuitSection.tsx`, `CircuitPanelProperties.tsx`.
- `packages/ui/src/components/ElementEditorDialog.tsx:132, 664-665, 826` — the disabled "Labels — coming soon" tab.
- `packages/ui/src/components/StatusBar.tsx` — presentational, no toggles yet.

## 3. What the old app did

A label in the old app is **one property value of one Terminal or Equipment**, drawn as a WPF overlay above the PDF view.

- **Definition per symbol, not per instance.** Labels are stored per symbol image in a sidecar file. Every placed element with that image shows the same labels. An instance cannot move, hide or change a label.
- **Fields:** `PropertyKey` (one property name), `FractionX`/`FractionY` (anchor as 0..1 of the unrotated symbol box), `FontSize` (9), `TextColor`, `BackgroundColor` + `ShowBackground`, `BorderColor` + `ShowBorder`.
- **Content:** the property value as `ToString()`. No format string, no units, no prefix or suffix, no multi-line text.
- **Available keys:** built-in (`Type, Name, Capacity, Rotation, X Position, Y Position, Scale, Color`), per-symbol custom properties, and global custom properties. A rename or delete of a custom property also updates label keys (`CustomPropertyApplier.cs`).
- **Circuits: never shown.** `Terminal.CircuitId` is a plain C# field and is not in the property bag. The label code never mentions circuits. The only exception: a `Panel` has a "Panel Name" property, so a panel symbol can label its own panel name.
- **Rotation:** the anchor rotates with the element. The text stays horizontal. After rotation the text is right-aligned when the anchor is left of the center, left-aligned when right of the center, and centered inside a small dead zone (2% of the symbol size).
- **Size:** the font scales with zoom (fixed paper size).
- **Visibility:** a status bar "Labels" toggle (off by default) and a drop-up filter tree: All → Equipment / Terminals → per symbol type, plus one checkbox for fittings. The filter is saved in the user settings.
- **Editor:** a Labels mode in the element editor. Click to add a label at a point on the symbol, drag to move it, a grid to pick the property, style controls. Named "label templates" save and apply a whole layout.
- **Not in the old app:** per-instance positions, dragging on the plan, leader lines, collision handling, PDF export (labels were canvas-only), segment property labels (segments had only "F"/"T" flow-direction marks).
- **Fittings:** a separate hard-coded capacity label next to each fitting.

## 4. What to keep, what to change

Keep:

- One label = one value, anchored at a point on the stamp. The anchor rotates with the stamp and the text stays horizontal. Port the side justification.
- A layout is defined per stamp definition, so a new placement of the same stamp gets the same labels with no extra work.
- The style fields (font size, text color, background, border).
- The status bar toggle and the filter tree.

Change:

- **Circuit and panel values are available** as label content (new; the old app never had them).
- **Prefix and suffix text** on each label, for example `Ø` or ` W`. This replaces a format-string parser. A label still shows one value.
- **A label with an empty value draws nothing.** Example: a terminal that is not in a circuit does not show an empty circuit badge.
- **Layouts are stored on the project**, not in a file next to the art. Reason: library definitions are read-only and a project must show the same labels on every machine. The layout also travels inside the PDF with the embedded project JSON.
- **Per-instance position override** (Phase 5): the user can drag one label on the plan. The old app could not do this.
- **Labels go into the exported PDF** (Phase 6). The PDF is the deliverable of this app; the old app lost labels on export.

## 5. Circuit values as stamp properties (Phase 1)

### 5.1 Decision: derived, not stored

**Recommendation: the stamp does not store a copy of its circuit values. A resolver in core reads them from the circuit when they are needed.** The Properties panel and the labels both use that resolver, so for the user the values are properties of the stamp.

Reasons:

- The circuit is the only source of membership today (`Circuit.terminalIds`). A stored copy on the stamp must change on every renumber, every panel rename, every move to another circuit, every panel-default change, and every Undo of any of these. Each missing update is a wrong label on a drawing that goes to a client.
- The resolver is a pure function in core. It is cheap to test with vitest.
- `findCircuitForTerminal` is a linear search. The label pass builds a `terminalId → circuit` map once per rebuild, so the cost stays O(stamps + circuit members).

This is decision **D1** in §11. If the user wants the values stored on the stamp, only §5.2 changes; the label phases stay the same.

### 5.2 Property keys

One key string names each value. Labels store the key. The Properties panel uses the same catalogue.

| Key | Shown as | Value | Applies to |
|---|---|---|---|
| `stamp:name` | Name | definition label (follows the language toggle) | all stamps |
| `stamp:capacity` | Capacity | `terminalCapacities[id]` | terminal, equipment |
| `stamp:rotation` | Rotation | degrees | all stamps |
| `custom:<name>` | `<name>` | `stamp.properties[name]` or the definition default | terminal, equipment |
| `circuit:label` | Circuit | `getCircuitLabel(circuit, panel)`, for example `L1.3` | terminal in a circuit |
| `circuit:number` | Circuit number | `circuit.number` | terminal in a circuit |
| `circuit:prefix` | Circuit prefix | `getEffectivePrefix` | terminal in a circuit |
| `circuit:name` | Circuit name | `circuit.customName` | terminal in a circuit |
| `circuit:panel` | Panel | `panel.name` | terminal in a circuit with a panel |
| `circuit:type` | Circuit type | circuit type abbreviation (name as fallback) | terminal in a circuit |
| `circuit:phase` | Phase | `getEffectivePhase` | terminal in a circuit |
| `circuit:device` | Device | `getEffectiveDevice`, formatted, for example `B16` | terminal in a circuit |
| `circuit:cable` | Cable | `getEffectiveCable`, formatted, for example `YMvK 3G2.5` | terminal in a circuit |
| `circuit:custom:<name>` | `<name>` (circuit) | `circuit.properties[name]` or the definition default | terminal in a circuit |
| `panel:name` | Panel name | `panel.name` | equipment stamp that is a panel |

Rules:

- A key that does not apply, or has no value, resolves to `null`. The label draws nothing.
- A `custom:` key whose definition no longer exists resolves to `null`. The Labels tab marks that label "missing property" (see §9, gap G2).
- Numbers: an integer shows with no decimals, otherwise one decimal (same as the old fitting label). The prefix and suffix hold units.
- Effective values include panel defaults. A label shows what the circuit really uses, not only the fields typed on the circuit.

### 5.3 Core API

New file `packages/core/src/stamp-properties.ts`:

```ts
export interface StampPropertyContext {
  customStampDefinitions: StampDefinition[];
  terminalCapacities: Record<string, number>;
  circuitByTerminalId: Map<string, Circuit>;   // built once per pass
  panels: Panel[];
  panelByStampId: Map<string, Panel>;
  circuitTypes: CircuitType[];
  customPropertyDefs: GlobalPropertyDefs;       // terminal / equipment / circuit
  labelLanguage: 'en' | 'nl';
}
export function buildStampPropertyContext(...): StampPropertyContext;
export function resolveStampProperty(ctx, stamp: PlacedStamp, key: string): string | null;
export function listStampPropertyKeys(ctx, category: StampCategory): { key: string; label: string; group: 'stamp' | 'custom' | 'circuit' | 'panel' }[];
```

`GlobalPropertyDefs` is declared in `ui/src/components/GlobalPropertiesDialog.tsx:5` today. Move it to `core/src/custom-properties.ts` (it is a plain type) and re-export it from the dialog.

### 5.4 Properties panel

- **Terminal, single selection:** the existing Circuit section (`TerminalCircuitSection.tsx`) keeps its picker. Below the picker, add read-only rows: Circuit number, Prefix, Circuit name, Panel, Circuit type, Phase, Device, Cable, and one row per circuit custom property. An inherited value shows in the same gray "(panel default)" style that `CircuitPanelProperties.tsx` uses. The existing "Show circuit" button opens the circuit to edit a value.
- **Terminal, several selected:** rows show the common value or "—" (mixed), same as the existing multi-select custom properties.
- **Equipment that is a panel:** a read-only Panel name row, plus the existing "Manage panel…" button.
- **Not in the circuit:** the rows are hidden; only the picker shows.

Editing circuit values from the stamp is decision **D2** (§11). Recommendation: read-only. A circuit value is shared by every terminal of the circuit; an edit in one terminal's panel silently changes other terminals.

## 6. Label data model (Phase 2)

### 6.1 Types (core)

New file `packages/core/src/stamp-label.ts`:

```ts
export interface StampLabel {
  id: string;
  /** A key from stamp-properties.ts, for example 'circuit:label' or 'custom:Power'. */
  propertyKey: string;
  prefix?: string;
  suffix?: string;
  /** Anchor as a fraction of the stamp's unrotated width and height. 0,0 = top-left. */
  anchorX: number;
  anchorY: number;
  /** In PDF points (world units). */
  fontSize: number;
  textColor: string;          // '#rrggbb'
  background?: string;        // '#rrggbbaa'; undefined = no background
  border?: string;            // '#rrggbbaa'; undefined = no border
}

/** Label layout per stamp definition id. Library and custom definitions both use it. */
export type StampLabelLayouts = Record<string, StampLabel[]>;
```

Defaults for a new label: font size 9 pt, text `#282828`, background `#FFFFDCC8`, border `#505050B4` (the old app's values, converted from ARGB). Tune after the first Windows test.

### 6.2 Storage

- `ProjectDocument.stampLabelLayouts: StampLabelLayouts`. Schema step **10 → 11** adds it as `{}`. `CURRENT_SCHEMA_VERSION` becomes 11. Add a `requireRecord` validator.
- The render side keeps it on `SketchDocument`, next to `customStampDefinitions`. It is **not** part of `DrawingState`, the same as `customStampDefinitions`. The Labels tab has its own undo while the dialog is open. A save from the dialog is one change and is not on the canvas undo stack.
- `exportProject` and `loadProjectFromJson` include the new field.
- A stamp with no `definitionId` has no layout and no labels.

### 6.3 Rendering

- New per-document `labelLayer: Container` in `document.ts`. Add it in init, in `activateInternal` and in `destroy()` (all three places, see `document.ts:80-85`, `scene.ts:638-643, 858-866`). Order: above `stampsLayer`, `drawingLayer` and `annotationTextLayer`; below `flowLabelLayer` and `overlay`.
- **Text is in world units.** It scales with zoom, the same as the PDF output. One Pixi `Container` per label: a `Graphics` box (background and border, padding 3×1 pt, corner radius 2) and a `Text`.
- **Anchor math** (port of the old `:87-138`):
  1. Local point = `(anchorX − 0.5) × nativeWidth`, `(anchorY − 0.5) × nativeHeight`.
  2. Multiply by `transform.scale` (a `Vec2`; a negative component mirrors), then rotate by `transform.rotationDegrees`.
  3. Add the stamp position.
  4. Side justification from the rotated local x: left of `−2% × width` → right-aligned; right of `+2%` → left-aligned; else centered. Vertically centered.
- **Only the active page.** Each page is its own document here, so the layer holds only that page's stamps.
- **Cache:** keep one label container per `stampId:labelId`. A rebuild changes the text only when the resolved string changed, moves the container when the position changed, and destroys containers of removed stamps or labels. Reason: a Pixi `Text` makes a texture; a full rebuild on every pointer move during a drag is too slow with hundreds of stamps.

### 6.4 Rebuild triggers

One method `syncLabels()`. Call it from:

- `syncDrawingLayer()` — any stamp add, move, rotate, delete, Undo, Redo.
- `notifyCircuitsChanged()` — this does **not** call `syncDrawingLayer` today. Circuit renumber, panel rename, membership, panel defaults.
- `setStampProperty` and `applyToSelectedStamps` — these emit only `selectionChanged` today.
- `applyCustomPropertyCascade` — added or removed custom properties.
- The terminal capacity setter — `terminalCapacities` is outside the undo state.
- The label layout save from the Labels tab.
- The label visibility and filter setters (Phase 4).
- The language toggle — `stamp:name` follows it.

## 7. Label editor (Phase 3)

The Labels tab in `ElementEditorDialog.tsx` is a disabled stub today. Phase 3 builds it.

- **Enabled for library and custom definitions.** The shapes and ports stay read-only for a library definition; the labels are stored on the project (§6.2), so they are editable for both.
- **Preview canvas:** the stamp art with one badge per label anchor. Click empty space → new label at that point. Drag a badge → move its anchor. Delete key → remove it. Each badge draws the real label text with sample values.
- **Sample values:** when the dialog opens from a placed stamp, the preview uses that stamp's resolved values. When it opens from the Stamps tab, it uses placeholders (`Name`, `L1.3`, `Panel A`, `123`).
- **Side list:** one row per label. Property picker grouped as Stamp / Custom / Circuit (terminal only) / Panel (equipment only), prefix, suffix, font size, text color, background on/off + color, border on/off + color.
- **Undo inside the dialog:** snapshot undo over `StampLabel[]` with the generic `CommandManager<StampLabel[]>`, the same as the Shapes tab.
- **Save:** writes `stampLabelLayouts[definitionId]` and calls `syncLabels()`.

**Dependency.** [[shared-drawing-tool]] Phases 3 and 4 move the Element Editor to an SVG surface on branch `worktree-shared-drawing-tool-plan` (not on `master`). Build the Labels tab as its own component (`StampLabelsTab.tsx`) with its own small SVG preview, so it does not depend on which surface the Shapes tab uses. Check the state of that branch before Phase 3 starts. If it has merged, reuse its view (pan/zoom) helpers.

## 8. Visibility, per-instance drag and PDF export

### 8.1 Visibility (Phase 4)

- **Status bar:** a "Labels" toggle chip and a drop-up filter, the same place as the old app.
- **Filter tree:** All → Terminals / Equipment → one row per stamp definition that has a layout and is placed in the document. A second group filters **by label kind**: Stamp / Custom / Circuit / Panel. [[ui-atlas-layout-mapping]] §6 asks for circuit labels as their own filter kind; this group gives that.
- **State:** React state in `useSketchScene`, pushed to the scene with a setter, the same pattern as `setShowCircuitLines`. Stored per installation in localStorage (`mepapp.settings.labelVisibility.v1`), not in the project.
- **Default:** on (decision **D4**). The old app had off, but here labels exist only after the user makes a layout, so "off" hides work the user just did.
- **Circuits mode:** no automatic change. Decision D4 also covers whether Circuits mode turns circuit labels on, the same way it turns on circuit lines today.

### 8.2 Per-instance position (Phase 5)

- `PlacedStamp.labelOffsets?: Record<labelId, { dx: number; dy: number }>`, in the stamp's local frame (points, before rotation), so the offset turns with the stamp. It is part of `DrawingState`, so Undo works with no extra code. Schema: an optional field, one version-bump-only step.
- **Drag on the plan:** a new `SelectableRef` kind `{ kind: 'label'; stampId; labelId }`. `hitTest` checks labels first (they draw on top). A drag on a label moves only that label, through a `Transaction`. It does not select or move the stamp.
- **Leader line:** when the offset is larger than a threshold (for example 1.5 × font size), draw a thin line from the anchor to the label box. Decision **D5**.
- **Reset:** a right-click item "Reset label position" and, for a selected stamp, "Reset all label positions".
- Not in scope: automatic collision avoidance.

### 8.3 PDF export (Phase 6)

- Each visible label becomes a PDF FreeText annotation with `/NM` = `label:<stampId>:<labelId>`. Add the entries in `domainSyncEntries` and a branch in `writeAnnotationForId`. The engine already writes FreeText for textboxes (`pdf-engine-mupdf/src/index.ts:351-386`), including a custom appearance stream.
- **Text change must update the annotation.** Today text content is not part of the drift comparison (`scene.ts:204, 208`). For labels, the sync plan must compare the text, the position and the style, and recreate the annotation when one differs.
- **Import:** the embedded project JSON stays the source of truth. `loadFromPdf` recognizes `label:` annotations as owned by MepApp (not "foreign") and regenerates them on the next export.
- Decision **D6**: export only labels that the visibility filter shows (recommendation — what you see is what you get), or every label.

## 9. Gaps and risks

- **G1 — Pixi `Text` cost.** Hundreds of labels means hundreds of textures. §6.3's cache handles normal edits. If a large document is still slow, switch to `BitmapText` for labels. Measure with the 166-stamp library on a real fixture PDF first.
- **G2 — Custom property rename.** `applyCustomPropertyCascade` treats a rename as remove + add. A label keyed `custom:Old` then points at nothing. Phase 3 marks such a label "missing property" in the Labels tab. A real rename migration needs the Global Properties dialog to report renames; this is out of scope unless the user asks (decision D3).
- **G3 — Label outside the page.** A label near the page edge can draw outside the PDF page. No clamp in the first version.
- **G4 — Stamp with no definition.** No labels. This is only old or imported data.
- **G5 — Language toggle.** `stamp:name` follows the toggle on the canvas. PDF export uses the toggle state at export time.

## 10. Phases

Every phase: `pnpm build` (all tasks), `pnpm turbo run test`, and a real Playwright run that drives the real DOM and canvas input (see memory "Verify UI wiring via real DOM"). Mark each phase done inline here with status, commit hash and a verification summary.

| Phase | Content | Schema | Depends on |
|---|---|---|---|
| 1 | `stamp-properties.ts` resolver and key catalogue with vitest cases. Properties panel: read-only circuit rows for terminals, panel name for panel stamps (§5). | none | — |
| 2 | `StampLabel` types, `stampLabelLayouts` on the project, `labelLayer`, anchor math, side justification, cache, all rebuild triggers (§6). Verified with a project JSON that contains a layout. | 10 → 11 | 1 |
| 3 | Labels tab in the Element Editor (§7). | none | 2 |
| 4 | Status bar toggle and filter (§8.1). | none | 2 |
| 5 | Per-instance drag, leader line, reset (§8.2). | 11 → 12 | 2 |
| 6 | PDF export and import of labels (§8.3). | none | 2 (5 if shipped) |
| 7 | Optional: label templates — save and apply a named layout, stored per installation in localStorage. | none | 3 |

Phases 1 to 4 give a usable feature. Phases 5 to 7 can wait for user feedback.

**Phase 1 — Done** 2026-09-26, commit `PHASE1_HASH`. `core/src/stamp-properties.ts` (key catalogue, `buildStampPropertyContext`, `resolveStampProperty` / `resolveStampPropertyValue` with an `inherited` flag, device and cable formatting); `GlobalPropertyDefs` moved to `core/src/custom-properties.ts` (the dialog re-exports it). Properties panel: `TerminalCircuitSection.tsx` shows read-only rows under the picker (Circuit number, Circuit prefix, Circuit name, Panel, Circuit type, Phase, Device, Cable, circuit custom properties), "(panel default)" on an inherited value, "Varies" across a multi-selection; a panel's equipment stamp shows a read-only Panel name row. Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (259 core, 13 ui, 13 pdf-engine-mupdf passed; 12 new core cases). Real Playwright run with real canvas clicks, 12 of 12 checks passed, no page errors: panel name row, every circuit row with the inherited marks, live update after a panel rename while selected, no rows for a terminal outside a circuit, "Varies" in a multi-selection, common value once both terminals share a circuit. Setup of the panel and circuit used the scene API, not the circuit UI. Not done: an empty value shows an empty row (for example Circuit name when the circuit has none), not a hidden row.

Phase 1 ends with visible value on its own: the user sees circuit number, panel name and the other circuit values on a selected terminal before any label exists.

## 11. Decisions for the user

**Resolved 2026-09-26:** the user had no comments on the spec, so every recommendation below is the decision. On D7 the user added: segments will get labels later, but through a different, more global mechanism than the per-definition stamp layout. That is a future plan, not part of this one.


- **D1 — Circuit values on the stamp: derived or stored?** Recommendation: derived (§5.1). The values show as stamp properties everywhere, but only the circuit holds them.
- **D2 — Edit circuit values from the terminal's Properties panel?** Recommendation: no, read-only plus "Show circuit" (§5.4).
- **D3 — Custom property rename migrates label keys?** Recommendation: not in the first version; mark "missing property" (G2).
- **D4 — Labels on by default? Circuits mode turns circuit labels on?** Recommendation: on by default; Circuits mode does not change label visibility.
- **D5 — Leader line for a moved label?** Recommendation: yes, above a threshold.
- **D6 — PDF export: only visible labels, or all?** Recommendation: only visible labels.
- **D7 — Segment and fitting labels?** The old app had none for segments (only F/T marks) and a fixed capacity label for fittings. The flow overlay already shows segment values when a segment is selected. Recommendation: out of scope for this plan. The key namespace leaves room for `segment:` keys later.
