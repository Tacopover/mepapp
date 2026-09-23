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

### Phase 0 — Mockup — **mockup built, awaiting user review**

Make a static HTML mockup. Publish it as a private Artifact. Store the source in `.claude/plans/electrical-schematic-mockup/` so the mockup survives in git.

The mockup shows:

1. **Template editor.** Canvas, building block palette, a circuit group being edited with sample data, rotate handles, and a properties panel with the bindings.
2. **Generated schematic in both layout styles.** One with circuits as columns and one with circuits as rows. Use sample data that follows the example schematics. Include the frame, the sections, the summary table, and the title block.
3. **Template picker.** Choose, copy, save, and load a template.
4. **Circuit assignment.** Convert Equipment to a panel, create a circuit, assign terminals, and edit the circuit properties.

Built 2026-09-23, commit `4909cd7` on `worktree-electrical-schematic-mockup`
(pushed straight to `master` — plan-housekeeping exception, no `apps/web`
code touched). Source: `.claude/plans/electrical-schematic-mockup/mockup.html`,
a single-file static app (vanilla JS, no build step). Published as a
private Artifact: https://claude.ai/artifact/A5wn3XUw87BqTj1LQPuEbF

All four items above are present and interactive: block selection +
rotation + bindings on screen 1, a Columns/Rows toggle with both boards
shown side by side on screen 2 (bears on open question 4), copy/load/new
on screen 3, and a tree + provisional device/cable/phase fields +
terminal assignment with a live derived-capacity readout on screen 4.
Sample data is shaped from the real `OV-HKantoor-2` and `E60_LK1+2`
fixtures, but every project/client identifier in the title blocks was
fictionalised (e.g. "Voorbeeldgebouw") — the fixtures policy in this
project's `CLAUDE.md` says not to commit or reproduce real client data,
and typed-in sample text falls under that same spirit even though it
isn't the source files themselves.

Not done: this was built with no in-browser check (no browser tool was
available this session) — only a JS syntax check (`node --check`) and a
structural sanity pass (balanced tags, every referenced element id
exists). The user should open the Artifact link and look for real
rendering issues before relying on it for review.

Acceptance: the user reviews the mockup and approves it. The catalogue (section 6), the model (section 7), and the open questions (section 12) are updated from the review.

### Phase 1 — Circuit model in `@mepapp/core` — not started, tracked in its own plan

Full plan: [[electrical-circuits-model.md]]. Its own Phase A (types, numbering, capacity) and Phase B (schema migration) do not depend on this plan's Phase 0 mockup and may start in parallel with it. Its Phase C (commands) is safe to build once Phase A/B land. Its Phase D (UI) should wait for this plan's Phase 0 mockup review, per §7 above.

### Phase 2 — Circuit UI — not started, tracked as electrical-circuits-model.md's Phase D

Convert Equipment to panel, create circuit, assign terminals, edit circuit properties. Reuse the tree from `networks-panel-spec.md`. See [[electrical-circuits-model.md]] §9.

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

1. **Template storage.** Per installation (like custom properties), per document, or both? Consider mirroring `CircuitType`'s built-in-seed-plus-per-document-copy pattern ([[electrical-circuits-model.md]] §3, §5) for consistency.
2. **Export.** Does the schematic export to PDF? Does it insert into the drawing sheet? The old app only printed.
3. **Phase model.** Fixtures show one phase for each circuit. How does a three-phase circuit appear? Shared with [[electrical-circuits-model.md]] open question 2 — resolve together.
4. **Several boards on one sheet.** E60 shows boards A and B on one sheet. Does one schematic cover one panel or many panels?
5. **Load type columns.** Do they come from stamp categories in the stamp library, or does the user define them?
6. **Locale.** Table headers and labels are template text. Number format and the decimal separator need a setting in the template.
7. ~~**Circuit type.** The old app had `CircuitType` but the generator never used it. Does the new template use it to choose a group variant?~~ **Resolved 2026-09-22:** yes, deliberately — a genuine new use the old app never had. See [[electrical-circuits-model.md]] §5.
8. **Example schematics.** Do we get permission to commit sanitised copies, or do we recreate similar files?

## 13. Alignment with the circuit model

[[electrical-circuits-model.md]] is this plan's Phase 1, written and cross-checked against this plan on 2026-09-22. Two-way check:

- Every field this plan's §6 catalogue needs from a circuit or a panel (device, cable, diversity, phase, sections, accessories) has a home in the circuit model's §5 data shapes.
- The circuit model's provisional fields (`device`, `cable`, `phase`) are explicitly gated on this plan's Phase 0 mockup review, so a UI-driven correction there does not require redesigning the circuit model from scratch — only adjusting field shapes that are already marked not-yet-final.
- The circuit model's `CircuitType.id` use for group-variant selection (its §5) is what resolves this plan's open question 7.
- Nothing in this plan requires a change to the circuit model's numbering, exclusivity, or persistence design (its §3, §7, §8) — those are settled independently of the schematic template concept.
