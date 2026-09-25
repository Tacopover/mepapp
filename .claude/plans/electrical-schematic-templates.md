# Electrical schematic templates — plan

Status: **draft. Phases 0–4 done (Phases 3 and 4 on 2026-09-24); Phase 5 done 2026-09-24 (block editor) and 2026-09-25 (free-drawn shapes); Phase 6 not started.** Written 2026-09-21 after a design discussion with the user and a survey of the old app.

## 1. Goal

The old MEPSketcher app produces one electrical schematic with one fixed layout and one fixed style. An electrical schematic looks different in each country. The user wants a modular replacement.

The new design has these parts:

- A **building block** is one kind of object in a schematic (for example a protective device symbol, a cable text, a table cell).
- A **template** is a saved arrangement of building blocks. The user edits, saves, and loads templates. The app ships one or more built-in templates.
- The user places and rotates building blocks on a canvas to make a template.
- A **generator** builds the real schematic from the template, the circuits, and the elements drawn on the PDF.

The first schematic type is the **distribution board schedule**. It is more complex than a single-line diagram and has more value.

### Decisions made by the user

1. The summary table is part of the template.
2. The user types the cable length by hand. The app does not compute it from segments.
3. The frame, the sections, and the title block are in v1.
4. A circuit owns terminals (connection points on drawing elements). A circuit can also belong to a panel. The user can convert an Equipment stamp into a panel, as in the old app.
5. A user-made group of building blocks repeats for each circuit. The user decides which building blocks are in the group.
6. **A mockup comes before any implementation** (Phase 0).
7. Circuits do not exist in MepApp yet. The circuit model is a prerequisite (Phase 1).
8. The circuit model has its own plan, [[electrical-circuits-model.md]], written 2026-09-22. See §13 below for how the two plans align.

## 2. Sources

### Example schematics

Folder: `fixtures/schematics/` in the primary checkout. **The files are not tracked in git.** They are real client project drawings, and this repository is open source. Do not commit them without the owner's permission.

- `OV-HKantoor-2.pdf` — one board, 40 circuits. Circuits are columns. Text is rotated 90°.
- `E60_LK1+2 - Installatieschema EC-LK1+2.pdf` — two boards (A and B), each with sections. Circuits are rows.

Both are Dutch. The two files already differ in orientation and table structure.

### Old app

Path: `/root/MepSketcher`. A survey was made on 2026-09-21. The four claims marked (checked) were compared with the source. The other claims come from the survey report only.

- `MepSketcherTools/MEP/Circuit.cs` — `Circuit` has `CircuitNumber`, `CircuitPrefix`, `PanelId`, `CircuitType`, `TerminalIds`, `IsSpare`, `CustomName`, `LoadFactor` (checked).
- `MepSketcherTools/Schematics/SchematicGenerator.cs` — fixed layout constants (checked), phase `rowIndex % 3` at line 612 (checked). The generator never reads `CircuitType` (checked).
- `MepSketcherTools/Schematics/SymbolDefinition.cs` — `PortIn` and `PortOut` for each symbol image.
- `MepSketcherTools/Services/CircuitService.cs` — assign terminals to circuits, assign circuits to panels, spare circuits.
- `MEPSketcher2/Views/Schematics/` — the schematic window, builders, and dialogs.
- `Memory/Schematics-Feature-Plan.md` and `Memory/Schematics-MVP-Plan.md` — old design notes.

Related MepApp plan: `.claude/plans/networks-panel-spec.md`. It describes the old tree (Discipline, Circuit Type, Panel, Circuit, Terminal). Phase 2 reuses that tree.

## 3. What the example schematics show

Both schematics use the same chain:

1. An **incoming feed**: cable, switch, protection, and sometimes current transformers, a meter, and a surge protector.
2. A **busbar** (a bar that joins all the circuits).
3. A **circuit group** for each circuit, repeated along the busbar.
4. A **summary** with totals.

The repeat direction differs. OV repeats along a row, E60 repeats along a column. So the repeat direction is a property of the template.

### One circuit group contains

- Circuit number label (1, 2, A1, B7)
- Protective device symbol with a rating text (B16, C16, B16/30mA)
- Phase label (OV only)
- Cable mark and conductor count ("3x", "4x")
- Conductor line
- Cable text: type, cores, cross-section, length ("B2CA 3G 2.5 mm2 l=33 m")
- Description text ("Verlichting kantoren")
- Load symbol at the end of the line (E60)
- Table cells that align with the circuit:
  - a count and VA (volt-amperes) for each load type
  - total VA
  - percentage
  - diversified VA ("Gelijkt. VA")
  - L1, L2, and L3 VA (OV only)

The table cells belong to the circuit group. A building block is not always a symbol. It can be a text field or a table cell.

### What breaks a simple repeat

- **Variants.** OV circuits 1 and 2 branch to a second cable and a switch. Reserve circuits have almost no members. A template needs more than one group definition. Each circuit picks one.
- **Special circuits.** In E60, the surge protector uses a C6 breaker. The sub-feed uses a Q1A/160A switch. They do not follow the standard group.
- **Aggregate blocks.** The column header counts, the per-phase totals, and the reserve capacity line sum values over the circuits.
- **Blocks outside the circuits.** The board frame (dashed line), the board sections ("preferent A"), the earthing details, and the title block do not belong to one circuit.
- **More than one board on one sheet.** E60 shows boards A and B on one sheet. OV shows one board.

## 4. Old feature: what to keep and what to drop

### Keep

- **Ports on symbols.** Each symbol has connection points, stored as fractions of the symbol box. Wires attach to them. They keep working after a rotation. MepApp already has `PortSpec` in `@mepapp/core`. Reuse it.
- **A link from a generated item to its source** (`SourceElementId` in the old app). User-drawn items move with their circuit when the layout changes.
- The symbol picker panel and the properties panel.
- Totals computed at render time.

### Drop

- The fixed chain of symbols, the fixed columns, the fixed page, and the round-robin phase.
- Generated items that the user cannot delete. Regeneration that erases edits. In the new design, the template owns the layout.
- The old persistence bugs. A user-placed image reloaded as an empty text. Rotation, scale, and colors were not saved. **The template format must save every property from the start.**
- Hardcoded strings, symbol file names, and number formats. All of them must be template data.

## 5. Architecture

Keep three parts separate.

1. **Logical model** — panels, circuits, protective devices, cables, and assigned terminals. It has no country-specific look. It belongs in `@mepapp/core`.
2. **Drawing links** — each element on the PDF links to one logical entity by id.
3. **Schematic** — building blocks and the template. It only presents the logical model.

A building block type names a **role**, not a look. For example, "protective device" is a role. The template maps each role to a symbol and a style. This keeps the model neutral across countries.

Circuit membership is explicit. The user assigns terminals to circuits. The app never infers membership from geometry. A socket has no line to its breaker on the PDF, so geometry cannot show membership.

### Package placement (proposal)

- `@mepapp/core` — circuit and panel model, commands, undo, schema migration, template schema, and the generator. All headless and tested with vitest.
- `@mepapp/render` — draws the generated schematic and the template editor canvas.
- `@mepapp/ui` — circuit panels, template picker, and the block properties panel.
- Nothing outside `pdf-engine-mupdf` imports `mupdf`.

## 6. Building block catalogue (draft)

This is a first list. The mockup (Phase 0) refines it.

Scope: **once** = one instance in the schematic. **per panel** = one for each panel. **per circuit** = repeats in the circuit group. **aggregate** = sums or counts over circuits.

| Block | On the drawing | In the logical model | Scope |
|---|---|---|---|
| Feed cable | — | Panel feeder cable (type, size, length) | per panel |
| Main device | — | Panel main protective device | per panel |
| Accessory device (CT, meter, surge protector) | — | Panel accessory list | per panel |
| Busbar | — | Panel or section busbar | per panel |
| Circuit number label | — | Circuit prefix and number | per circuit |
| Protective device (breaker, RCD) | — | Circuit device type, rating, RCD sensitivity | per circuit |
| Phase label | — | Circuit phase | per circuit |
| Cable line and conductor mark | — | Circuit cable core count | per circuit |
| Cable text | — | Circuit cable type, cores, size, and typed length | per circuit |
| Load symbol | Stamp art of the assigned terminals | Circuit terminals | per circuit |
| Description text | — | Circuit name | per circuit |
| Custom annotation | — | Any circuit or terminal property | per circuit |
| Table cell: count and VA per load type | Terminals on the PDF | Terminal capacity, grouped by load type | per circuit |
| Table cell: derived value (total, %, diversified VA, per-phase VA) | — | Sum of terminal capacity and the circuit diversity factor | per circuit |
| Table header cell or legend symbol | — | Load type definition | once |
| Aggregate cell (sum, count) | — | Sum over circuits | aggregate |
| Totals table | — | User-defined rows, each a label plus a formula (e.g. `sum(terminal.capacity)`), one column per circuit or panel | aggregate |
| Section box and label | — | Panel section | per panel |
| Frame | — | Panel | per panel |
| Title block | — | Project data | once |
| Free text, free line, free symbol | — | None | once |

Terminals and circuits have no fixed count of blocks. A circuit group is a user-made set of these blocks with a repeat direction and a pitch (the distance between two circuits).

## 7. Logical model (prerequisite)

**The full design lives in [[electrical-circuits-model.md]] (written 2026-09-22).** It covers the `Circuit`, `Panel`, `PanelSection`, and `CircuitType` records, the numbering rules, every command, and eight gaps found and deliberately fixed in the old app (a dangling terminal reference on delete, an unpersisted load factor, and others — see that plan's §4). Field summary, for reference:

**Circuit** — `id`, `prefix`, `number` (unique in its scope), `panelId`, `sectionId`, `terminalIds`, `isSpare`, `customName`, `phase`, `device` (breaker curve, rating, RCD), `cable` (type, cores, cross-section, typed length), `diversityPercent`, `circuitTypeId`.

**Panel** — a record that *references* an Equipment stamp by id, rather than replacing it (a deliberate simplification over the old app's C#-subtype hack — see [[electrical-circuits-model.md]] §5). Holds `name`, `sortDirection`, `mainDevice`, `feederCable`, `accessories`, `sectionIds`, `circuitIds`.

**`device`, `cable`, and `phase` are marked provisional** in that plan, pending this plan's own Phase 0 mockup review (§10) — the "Circuit assignment" mockup screen is exactly where those shapes get pressure-tested.

**Panel-level defaults with per-circuit override (decided 2026-09-23, Phase 0 round 4).** A panel holds a `circuitDefaults` shape mirroring the defaultable circuit fields (`prefix`, `circuitTypeId`, `phase`, `device`, `cable.type`/`cable.coreCount`/`cable.crossSectionMm2`, `diversityPercent`). A circuit only stores an override for a field it actually sets; an unset field reads from its panel's `circuitDefaults` at display and generation time. `cable.lengthM` is excluded — it is always a per-circuit typed measurement, never a panel default, since two circuits from the same panel practically always run different physical lengths. This needs to land in [[electrical-circuits-model.md]] §5 (`Circuit`/`Panel` shapes) — not yet done there, since that plan lives in a different, actively-used worktree; see §13 below.

**Existing MepApp data reused**

- `PlacedStamp` with category Terminal, Equipment, or Fitting (`packages/core/src/stamp.ts`)
- `terminalCapacities` in the project document (`packages/core/src/project.ts`)
- Custom properties on Terminal and Equipment stamps (`packages/core/src/custom-properties.ts`) — candidate home for the "Custom annotation" building block (§6); open question in [[electrical-circuits-model.md]] §12.7
- The `Discipline` union, which already has an electrical value (`packages/core/src/network.ts`)
- The `NetworkType`/`network-type-library.ts` pattern (built-in seed + per-document editable copy), reused for `CircuitType`

## 8. Template format (concept)

A template holds:

- `id`, `name`, `description`, and a locale label (for example "NL")
- Sheet settings: paper size, orientation, units, number format
- **Static blocks** (frame, title block, headers, free items)
- **Circuit group definitions.** Each has a repeat direction, a pitch, and a list of blocks.
- **A rule that picks a group definition** for each circuit (for example by circuit type or by the spare flag)
- **Aggregate blocks**

A block instance holds:

- Block type (the role)
- Position relative to its group origin
- Rotation
- Style (line thickness, line pattern, color, font, size)
- Symbol reference, with ports
- **Bindings.** A text field names a data field and a format (for example `{cable.type} {cable.cores}G {cable.size} mm2  l={cable.length} m`).

Every property is saved. The app ships built-in templates. The user can copy a built-in template, edit it, save it, and load it.

Suggested built-in templates: one with circuits as columns (like OV) and one with circuits as rows (like E60).

## 9. Generator (concept)

- Input: a panel, its circuits and terminals, and a template.
- Output: a flat list of resolved building blocks. Each has a position, a rotation, and final text.
- Pure function in `@mepapp/core`. No rendering and no I/O.
- Test target: generate a schematic with the same structure as each example schematic.
- Regeneration does not erase user-drawn extras. An extra keeps a link to its source circuit and moves with it.

## 10. Phases

### Phase 0 — Mockup — **done** (4 review rounds, user signed off 2026-09-23)

Make a static HTML mockup. Publish it as a private Artifact. Store the source in `.claude/plans/electrical-schematic-mockup/` so the mockup survives in git.

The mockup shows:

1. **Template editor.** Canvas, building block palette, a circuit group being edited with sample data, rotate handles, and a properties panel with the bindings.
2. **Generated schematic in both layout styles.** One with circuits as columns and one with circuits as rows. Use sample data that follows the example schematics. Include the frame, the sections, the summary table, and the title block.
3. **Template picker.** Choose, copy, save, and load a template.
4. **Circuit assignment.** Convert Equipment to a panel, create a circuit, assign terminals, and edit the circuit properties.

Source: `.claude/plans/electrical-schematic-mockup/mockup.html`, a
single-file static app (vanilla JS, no build step). Published as a
private Artifact: https://claude.ai/artifact/A5wn3XUw87BqTj1LQPuEbF
(now Version 3). All commits pushed straight to `master` — plan-housekeeping
exception, no `apps/web` code touched.

- **Round 1** (`4909cd7`, 2026-09-23): first build of all four screens above.
- **Round 2** (`0cabb86`, 2026-09-23): reworked the template editor into two
  modes — layout (once/per-panel/aggregate blocks, plus a draggable anchor
  and a "preview repeat" count for the active circuit group) and group-edit
  (one full-size instance of a circuit group, same drag/rotate tools).
  Palette items became real HTML5 drag sources with scope-checked drops.
  Repeat direction/pitch/rule/spare moved from a template-global toolbar to
  per-group settings. Template picker's Load button now seeds the editor
  and switches to it. Removed the "Assign a terminal" control from circuit
  assignment (terminals get assigned by selecting them on the PDF canvas,
  a different mechanism, not from this panel).
- **Round 3** (`4f637dd`, 2026-09-23): added a "Totals table" block
  type with user-defined rows (label + formula per row, editable in the
  properties panel, rendered live in the layout preview) — this is
  separate from open question 5, which is about load-type *columns*, not
  which summary *rows* a totals table shows; question 5 is still open.
  Made the binding field generic: every block, not just the ones the
  catalogue predefines a binding for,
  now has an editable binding expression and an editable preview value in
  its properties panel. Added a placeholder "Symbol library" (opened from
  the properties panel for `main`/`device`/`acc` blocks) so a block can
  swap its default vector art for a picked symbol — icons are placeholders,
  not the user's real artwork. Reserved, but did not build, space for
  freeform drawing tools (line/rect/circle/text/symbol) on the template
  canvas — see open question 9 below; that work needs its own plan since
  it shares a primitive with the existing custom-stamp editor and with
  "create your own component" in the symbol library.
- **Round 4** (`128a3d1`, 2026-09-23): added a per-panel defaults
  system to the circuit assignment screen — each panel has a "⚙ Defaults"
  view (prefix, circuit type, phase, device, cable type/cores/cross-section,
  diversity) and every circuit's properties panel shows each of those
  fields as either inherited (dashed, italic, labelled "panel default") or
  overridden (solid, with a "↺ panel default" reset link). See the new
  §7 note on this. User signed off that the mockup is functionally
  complete enough to move to implementation from here.

All four spec items are present and interactive: block selection, drag,
rotation, and bindings on screen 1 (now with the two-mode editor above),
a Columns/Rows toggle with both boards shown side by side on screen 2
(bears on open question 4), copy/load/new on screen 3, and a tree +
provisional device/cable/phase fields + terminal assignment with a live
derived-capacity readout on screen 4. Sample data is shaped from the real
`OV-HKantoor-2` and `E60_LK1+2` fixtures, but every project/client
identifier in the title blocks was fictionalised (e.g. "Voorbeeldgebouw")
— the fixtures policy in this project's `CLAUDE.md` says not to commit or
reproduce real client data, and typed-in sample text falls under that same
spirit even though it isn't the source files themselves.

Not done: this was built with no in-browser check in any of the four
rounds (no browser tool was available this session) — only a JS syntax
check (`node --check`) and a structural sanity pass (balanced tags, every
referenced element id exists) after each round. The user should open the
Artifact link and look for real rendering/interaction issues before
relying on it for real.

Acceptance: the user reviews the mockup and approves it. The catalogue (section 6), the model (section 7), and the open questions (section 12) are updated from the review. **Done 2026-09-23** — user confirmed the mockup covers the functional shape well enough, remaining details are expected to change during real implementation anyway. §6 and §7 updated above (Totals table row, panel-default/override pattern); §12 gained open question 9 (shared drawing tools). Phase 1 (electrical-circuits-model.md) may now proceed, including its Phase D UI work, once it also picks up the §7 panel-defaults note.

### Phase 1 — Circuit model in `@mepapp/core` — **Done**, tracked in its own plan

Full plan: [[electrical-circuits-model.md]] — all four of its phases (A–D) shipped 2026-09-23, commit `7bcba5f` on `worktree-electrical-schematic-templates-plan`. See that plan's own Phase A–D done-blocks for the shipped shape, including the Phase C addendum that picked up this plan's §7 panel-defaults decision before Phase D UI work began.

### Phase 2 — Circuit UI — **Done**, tracked as electrical-circuits-model.md's Phase D

Convert Equipment to panel, create circuit, assign terminals, edit circuit properties. Reuse the tree from `networks-panel-spec.md`. See [[electrical-circuits-model.md]] §9 and its Phase D done-block — terminal-assignment-from-the-terminal-side, a `Circuit.properties` editor, and `PanelAccessory` add/remove UI are explicitly called out there as not done yet.

### Phase 3 — Template schema, built-in templates, generator — **Done**

All in `@mepapp/core`. Tests use structures taken from the example schematics.

**Done** — 2026-09-24, commit `7b23d7d` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped (four new modules, all exported from `@mepapp/core`, plus three test files; no schema migration, since nothing is persisted yet):

- `schematic-expression.ts` — binding language. A binding is text with `{expression}` segments. An expression is a dotted path (`cable.type`, `circuit.properties."Serial number"`), a number, `+ - * /`, parentheses, and `sum()` / `count()`. A path over a list maps over it, so `sum(terminal.capacity)` sums every terminal. A missing value gives blank text, never an error. `{expr:2}` forces two decimals. `{{` and `}}` are literal braces. Numbers show at most two decimals, with the template's decimal separator. Syntax errors throw `ExpressionError`.
- `schematic-template.ts` — the schema: `SchematicTemplate` (sheet size in mm, number format, layout blocks, group anchor, ordered circuit groups), `SchematicBlock` (every property saved: position, rotation, size, binding, style, symbol id, table rows, load-type filter), the 21-type block catalogue with default size, scope and binding, and `validateSchematicTemplate` (structure, scope-per-collection, unique ids, positive pitch, one direction for all groups, every binding parses).
- `schematic-template-library.ts` — two built-ins, "Rows (NL)" (like E60) and "Columns (NL)" (like OV, text rotated 90°), each a spare group plus a catch-all group. Sheet is A1 landscape (841 x 594 mm), the OV example's size.
- `schematic-generator.ts` — `generateSchematic(input, template, { origin })`, a pure function returning flat `ResolvedBlock`s (position, size, rotation, resolved text, stable id `<panel>/<circuit | section | ->/<block>`), `circuitOrigins` (for user-drawn extras that follow their circuit), and diagnostics (`no-matching-group`, `binding-error`).

Decisions made while building it (all reversible; the template editor in Phase 5 is where they meet a real user):

- **Units and pivot.** Sheet mm. `x`/`y` is the top-left corner. Rotation is clockwise degrees about the block's centre (the mockup's convention).
- **A fifth scope, `section`.** The catalogue in §6 said the section box is "per panel". It repeats once per section that has circuits, spanning that section's circuits along the repeat direction, so it got its own scope.
- **Group selection.** First matching group wins; each group has its own pitch, and the cursor advances by the pitch of the group just placed. A spare matches only `spare` and `any` rules, so a `circuitType` group never swallows a spare. All groups must repeat in the same direction (validated), which narrows the mockup's per-group direction.
- **Circuit order.** By section order (circuits with no section last), then number. `sortDirection: 'descending'` reverses the numbers inside each section, not the sections.
- **Three-phase capacity.** `circuit.capacityL1/L2/L3` split a circuit's capacity across its phase letters equally (L1L2L3 gives a third to each; no phase gives none). This is a first answer to open question 3 for the per-phase VA cells.
- **Totals table.** `tableColumns: 'panel'` (default) evaluates each row once over all non-spare circuits; `'circuits'` evaluates each row once per circuit in layout order.
- **Load-type cells.** A block's `loadTypeFilter` narrows `terminals` and `terminal.*` to one load type. The generator only reads `loadType` from the caller's terminal info. Where a terminal's load type comes from is still open question 5.
- **One panel per call.** Open question 4 (several boards on one sheet) is answered for the generator only: call it once per panel with a different `origin`.

Not done:

- **Not run against the real fixtures.** The tests use a synthetic panel shaped like the examples (sections, a spare, a three-phase circuit, an RCD breaker, a 40-circuit board that must fit the sheet). The two real PDFs are not committed (client data), so no test compares generated output to them. Compare visually once Phase 4 draws it.
- **The built-in layouts are a first guess.** The positions were computed, not looked at, because nothing draws them yet. Expect to adjust them in Phase 4 and 5.
- **No persistence.** Where templates are stored (open question 1) and how they are saved and loaded is Phase 6. No terminal-info builder exists yet (stamp plus `terminalCapacities` to `SchematicTerminalInfo`); Phase 4 writes it.
- **Title block, legend and free items have no data.** They are static text or art. There is no project-data model to bind a title block to.
- **Aggregate cells only see non-spare circuits** and there is no reserve-capacity function yet.
- **`accessoryDevice` renders all accessories in one block** (joined text), not one block per accessory.

Verified: `pnpm --filter @mepapp/core test` (22 files, 317 tests, all pass; 70 are new); `tsc --noEmit` and `pnpm --filter @mepapp/core build` clean. Nothing in `render`, `ui` or `apps/web` changed, so no browser run was needed.

### Phase 4 — Schematic view — **Done**

Draw the generated schematic. Regenerate on change.

**Done** — 2026-09-24, commit `e8e0d28` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped:

- **`SchematicDialog`** (`packages/ui`), opened by a new "View schematic…" button in a panel's Properties. It has a Panel select, a Template select (the two built-ins), "Fit to sheet", wheel zoom and drag pan. It is a modal: the page behind it cannot change while it is open. It regenerates from React props (circuits, sections, circuit types, stamps) on every render, so it always shows the current document when opened. It reports circuits that no group matches and invalid bindings above the sheet.
- **`schematicBlockSvg.tsx`** draws one resolved block as SVG in sheet mm (all 21 block types). The sheet is fixed white paper with black ink, whatever the app theme. A load symbol draws the vector art of a custom stamp when its definition has shapes; otherwise a generic load mark.
- **`schematicTerminals.ts`** builds the generator's terminal info from the placed stamps: label from the stamp definition, capacity from `terminalCapacities`, and **load type = the stamp's definition id** (category for an uploaded stamp with none). This is the working answer to open question 5.
- **Generator and template changes found by the browser check** (core, with tests): section box offsets in the built-ins were sheet coordinates instead of offsets from the first circuit; a busbar with no size on the repeat axis now stretches over every circuit (both built-ins use this); a binding can hold optional `[...]` groups that only show when one of their `{...}` values exists (so a missing cable length no longer leaves "l= m"); no load symbol on a circuit without terminals.

Not done:

- **Read-only and modal.** No editing, no side-by-side dock. Phase 5 adds the template editor.
- **The template choice is not saved.** The dialog opens on the first built-in every time.
- **One panel per view.** A sheet with several panels (open question 4) is not drawn; the generator supports it through `origin`.
- **Library stamps show a generic load mark.** Only custom stamps have vector shapes. Drawing the PNG art of library stamps needs the app's icon resolver and was not done.
- **No export** (Phase 6, open question 2), and no title-block data (there is no project-data model).
- **The circuit's custom name is not auto-filled from a terminal name.** `addTerminalToCircuit` takes a terminal name, but a placed stamp has none to give, so the description block is blank until the user types a name. This gap is older than Phase 4 (Phase C).
- **No visual comparison with the real E60 and OV drawings.** The built-in layouts are still a first guess; the browser check only confirmed they are readable and consistent.

Verified: `pnpm build` (9 of 9 tasks); `pnpm --filter @mepapp/core test` (327 tests) and `pnpm --filter @mepapp/ui test` (16 tests) pass. A real headless Chromium run (fork, on a preview build of this worktree) built a panel with 2 sections and 6 circuits (one spare, one with RCD, different phase, typed lengths, terminals of two kinds) through real clicks, then opened the dialog. Text in the SVG matched the entered data (labels A1 to A6, `B16/30mA`, `B2CA 3G2,5 mm²  l=27,5 m`, cells and totals). Both templates draw, zoom, pan, fit and Escape work, reopening after a change shows the new data, no console errors. The first run found the defects listed above; they were fixed and re-checked in the browser.

### Phase 5 — Template editor — **Done** (block editor 2026-09-24, free-drawn shapes 2026-09-25)

Place, rotate, and bind building blocks. Snap using ports. Edit a circuit group with sample data.

Design (decided 2026-09-24):

- **The editor canvas shows the generated schematic.** It calls `generateSchematic` on every change, so the user edits what the schematic view shows. Each generated block keeps `templateBlockId` and `groupId`, so a click selects the template block. A drag changes the template block's `x` and `y` by the drag distance, so every repeat moves together.
- **Preview data.** A select picks a real panel or built-in sample data. The sample data has circuits in two sections, one spare, terminals with capacity, and one extra circuit for each `circuitType` or `circuitNumber` group rule.
- **Where it lives.** Inside `SchematicDialog`, as an edit mode that replaces the view (no second modal). Built-in templates stay read-only: "Edit template" first makes a copy. Copies live in App state for the session. Saving them is Phase 6.
- **Pure edit functions in `@mepapp/core`** (`schematic-template-edit.ts`), with vitest tests: add, remove, move, resize (rotation-aware), duplicate and reorder blocks; add, remove and reorder groups; set the direction of all groups; copy a template; a list of the fields a binding can use.
- **Tools.** Select, drag, rotate handle, resize handle, grid snap (1 mm default), a draggable group anchor, undo and redo, a palette that adds a block by click, a properties panel (position, size, rotation, binding with an "insert field" list, style, load type filter, totals table rows), a group list (rule, pitch, name) and template settings (name, sheet size, decimal separator, direction).
**Done (block editor)** — 2026-09-24, commits `ff1a386` (core), `03499f6` (UI) and `2722e80` (two fixes) on `worktree-electrical-schematic-templates-plan`.

Shipped:
- Core (`schematic-template-edit.ts`): pure edit functions, sample data and the binding field list. 36 tests. `validateSchematicTemplate` now accepts a template with no groups.
- UI: `SchematicTemplateEditor` inside `SchematicDialog` (edit mode). The canvas shows the generated schematic. It has move, rotate and resize handles, a draggable group anchor, grid snap (Alt turns it off), undo and redo (one drag is one step), a palette, group and block lists, and keyboard shortcuts. `SchematicTemplateProperties` has template, group and block panels with an "Insert field" list and live binding errors. `useSheetView` is the zoom and pan shared with the viewer.
- Built-in templates stay read-only. "Edit template…" makes a copy under "My templates". Duplicate and Delete template work.
- Custom templates live in App state and in localStorage (`mepapp.schematicTemplates`, interim). Phase 6 replaces this.

**Done (free-drawn shapes)** — 2026-09-25, commits `2d16143` (core) and `4178964` (UI) on `worktree-electrical-schematic-templates-plan`.

Shipped:
- A `drawing` block type. Its art is `shapes: SymbolShape[]`, in fractions of the block box. It can sit on the sheet or in a circuit group, where it repeats for every circuit. A drawn symbol in a group can stand in for the built-in protective device: delete that block and add "Drawing (each circuit)".
- `SchematicDrawingEditor`: opens in place of the template editor body (double-click the block, "Edit drawing…", or on adding one). Done saves one undo step. Cancel discards.
- The drawing surface and the tool and style bars now live in `ShapeDrawSurface` and `ShapeDrawToolbar`. The stamp editor uses them too (`ElementEditorDialog.tsx` 974 to 495 lines).
- Strokes in the schematic are true millimetres (`minStrokePx` on `SymbolShapesSvg`, default unchanged for stamps).

Not done:
- No symbol library and no symbol picker on a block (`symbolId` is still unused). That is shared-drawing-tool Phase 4.
- No bound text inside a drawing. Use a description or free text block beside it.
- No image import and no ports tool in the drawing editor.
- `loadSymbol` art still has a 1 mm minimum stroke.
- Old defect, not caused by this work: on a non-square canvas a circle's radius follows the pointer too little (a 4:3 block gives about 0.75 of the dragged radius). The draft uses the width fraction, the drawing uses the shorter side. Code: `symbol-shape-geometry.ts` (draft creation) and `useShapeDrawEditor.ts`.

Verified: core 367 tests; UI 33 tests; root `pnpm build` 9 of 9. Headless browser (Playwright, own port): the stamp editor regression (all shape tools, transform, mirror, undo, snap indicators, port tool, view, save and place) passed. Drawing blocks passed: 4-shape drawing at the right proportion with 0.300 mm strokes; move, resize, rotate; one undo step for a whole drawing session; Cancel; Escape keeps the dialog open; a group drawing on all 5 circuits changing together; the drawn symbol replacing the deleted protective device; empty drawings dashed only in the editor; reload keeps 1 layout and 2 group drawings and `validateSchematicTemplate` returns no issues. No page or console errors. Not checked: Windows, touch.

### Phase 6 — Save and load templates, export — not started

Storage and export format depend on open questions 1 and 2.

## 11. Non-goals for v1

- Single-line diagrams (a later schematic type that reuses the same building blocks)
- Automatic wire routing beyond the rules in the template
- DXF export

## 12. Open questions

1. **Template storage.** Per installation (like custom properties), per document, or both? Consider mirroring `CircuitType`'s built-in-seed-plus-per-document-copy pattern ([[electrical-circuits-model.md]] §3, §5) for consistency.
2. **Export.** Does the schematic export to PDF? Does it insert into the drawing sheet? The old app only printed.
3. **Phase model.** Fixtures show one phase for each circuit. How does a three-phase circuit appear? Shared with [[electrical-circuits-model.md]] open question 2 — resolve together.
4. **Several boards on one sheet.** E60 shows boards A and B on one sheet. Does one schematic cover one panel or many panels?
5. **Load type columns.** Do they come from stamp categories in the stamp library, or does the user define them?
6. **Locale.** Table headers and labels are template text. Number format and the decimal separator need a setting in the template.
7. ~~**Circuit type.** The old app had `CircuitType` but the generator never used it. Does the new template use it to choose a group variant?~~ **Resolved 2026-09-22:** yes, deliberately — a genuine new use the old app never had. See [[electrical-circuits-model.md]] §5.
8. **Example schematics.** Do we get permission to commit sanitised copies, or do we recreate similar files?
9. **Shared drawing tools.** Added 2026-09-23. Three surfaces need the same freeform draw/edit primitive (line, rectangle, circle, text, symbol placement, with select/move/rotate): the template canvas's "once"-scope blocks, a user-created entry in the component/symbol library, and the app's existing custom-stamp editor. Build one shared component and reuse it in all three, rather than three separate implementations. Needs its own plan — not drafted yet. The Phase 0 mockup only reserves screen space for this (a disabled toolbar strip on the template canvas); none of the three surfaces are wired up.

## 13. Alignment with the circuit model

[[electrical-circuits-model.md]] is this plan's Phase 1, written and cross-checked against this plan on 2026-09-22. Two-way check:

- Every field this plan's §6 catalogue needs from a circuit or a panel (device, cable, diversity, phase, sections, accessories) has a home in the circuit model's §5 data shapes.
- The circuit model's provisional fields (`device`, `cable`, `phase`) are explicitly gated on this plan's Phase 0 mockup review, so a UI-driven correction there does not require redesigning the circuit model from scratch — only adjusting field shapes that are already marked not-yet-final.
- The circuit model's `CircuitType.id` use for group-variant selection (its §5) is what resolves this plan's open question 7.
- Nothing in this plan requires a change to the circuit model's numbering, exclusivity, or persistence design (its §3, §7, §8) — those are settled independently of the schematic template concept.
- **Resolved 2026-09-23** (was: "still to do in electrical-circuits-model.md", added Phase 0 round 4): applied directly in `electrical-circuits-model.md`, whose worktree turned out to be this same one after the two branches merged. `Panel` gained `circuitDefaults`; `Circuit.prefix`/`circuitTypeId`/`phase`/`device`/`cable.type`/`cable.coreCount`/`cable.crossSectionMm2`/`diversityPercent` now read as override-or-inherit. See that plan's "Phase C addendum" done-block for the shipped shape and commit.
