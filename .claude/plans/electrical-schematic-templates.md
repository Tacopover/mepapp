# Electrical schematic templates — plan

Status: **draft. No part is started.** Written 2026-09-21 after a design discussion with the user and a survey of the old app.

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
| Section box and label | — | Panel section | per panel |
| Frame | — | Panel | per panel |
| Title block | — | Project data | once |
| Free text, free line, free symbol | — | None | once |

Terminals and circuits have no fixed count of blocks. A circuit group is a user-made set of these blocks with a repeat direction and a pitch (the distance between two circuits).

## 7. Logical model (prerequisite)

The old `Circuit` has no phase, rating, cable, or length. The new model needs at least these fields. The mockup and the fixtures may add more.

**Circuit**

- `id`, `prefix`, `number` (number is unique in its panel)
- `panelId` (optional)
- `sectionId` (optional)
- `terminalIds` (terminals are `PlacedStamp` ids)
- `isSpare`
- `name` (the description text)
- `phase`
- Protective device: type, rating, RCD sensitivity
- Cable: type, core count, cross-section, length (typed by the user)
- `diversityPercent`
- `circuitType` (used to choose a group variant)

**Panel** (an Equipment stamp that the user converts to a panel)

- `name`, `sortDirection`
- Main device, feeder cable
- Accessories (CT, meter, surge protector)
- Sections

**Existing MepApp data to reuse**

- `PlacedStamp` with category Terminal, Equipment, or Fitting (`packages/core/src/stamp.ts`)
- `terminalCapacities` in the project document (`packages/core/src/project.ts`)
- Custom properties on Terminal and Equipment stamps (`packages/core/src/custom-properties.ts`)
- The `Discipline` union, which already has an electrical circuits value (`packages/core/src/network.ts`)

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

### Phase 0 — Mockup — **not started, blocks all other phases**

Make a static HTML mockup. Publish it as a private Artifact. Store the source in `.claude/plans/electrical-schematic-mockup/` so the mockup survives in git.

The mockup shows:

1. **Template editor.** Canvas, building block palette, a circuit group being edited with sample data, rotate handles, and a properties panel with the bindings.
2. **Generated schematic in both layout styles.** One with circuits as columns and one with circuits as rows. Use sample data that follows the example schematics. Include the frame, the sections, the summary table, and the title block.
3. **Template picker.** Choose, copy, save, and load a template.
4. **Circuit assignment.** Convert Equipment to a panel, create a circuit, assign terminals, and edit the circuit properties.

Acceptance: the user reviews the mockup and approves it. The catalogue (section 6), the model (section 7), and the open questions (section 12) are updated from the review.

### Phase 1 — Circuit model in `@mepapp/core` — not started

`Circuit` and `Panel`, commands with undo, schema migration, and tests.

### Phase 2 — Circuit UI — not started

Convert Equipment to panel, create circuit, assign terminals, edit circuit properties. Reuse the tree from `networks-panel-spec.md`.

### Phase 3 — Template schema, built-in templates, generator — not started

All in `@mepapp/core`. Tests use structures taken from the example schematics.

### Phase 4 — Schematic view — not started

Draw the generated schematic. Regenerate on change.

### Phase 5 — Template editor — not started

Place, rotate, and bind building blocks. Snap using ports. Edit a circuit group with sample data.

### Phase 6 — Save and load templates, export — not started

Storage and export format depend on open questions 1 and 2.

## 11. Non-goals for v1

- Single-line diagrams (a later schematic type that reuses the same building blocks)
- Automatic wire routing beyond the rules in the template
- DXF export

## 12. Open questions

1. **Template storage.** Per installation (like custom properties), per document, or both?
2. **Export.** Does the schematic export to PDF? Does it insert into the drawing sheet? The old app only printed.
3. **Phase model.** Fixtures show one phase for each circuit. How does a three-phase circuit appear?
4. **Several boards on one sheet.** E60 shows boards A and B on one sheet. Does one schematic cover one panel or many panels?
5. **Load type columns.** Do they come from stamp categories in the stamp library, or does the user define them?
6. **Locale.** Table headers and labels are template text. Number format and the decimal separator need a setting in the template.
7. **Circuit type.** The old app had `CircuitType` but the generator never used it. Does the new template use it to choose a group variant?
8. **Example schematics.** Do we get permission to commit sanitised copies, or do we recreate similar files?
