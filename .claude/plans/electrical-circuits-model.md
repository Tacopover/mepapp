# Electrical circuits and panels — data model plan

Status: **draft, Phase A done, B–D not started.** Written 2026-09-22. Prerequisite for `.claude/plans/electrical-schematic-templates.md` Phase 1 — see [[electrical-schematic-templates.md#§13 Alignment with the circuit model]] for the two-way cross-check.

## 1. Goal

MepApp has no concept of an electrical circuit or a distribution panel today. The electrical-schematic-templates plan needs one before its Phase 1 can start. This plan designs that domain model: `Circuit`, `Panel`, `PanelSection`, and `CircuitType`, plus the commands that create and edit them.

This is domain modeling only — no template, no generator, no schematic drawing. A circuit and a panel have **no presence on the PDF canvas**. They are pure logical data, same as the old app (`Circuit.ContainsPoint` always returns false — it is never drawn).

## 2. Sources

### Old app

Path: `/root/MepSketcher`. Two survey passes were made (2026-09-21, 2026-09-22), plus first-hand reads of `MepSketcherTools/MEP/Circuit.cs`, `Panel.cs`, `CircuitType.cs`, and `Services/CircuitService.cs` (the full files), and a listing of `MepSketcherTools/Commands/*Circuit*`, `*Panel*`, `*Spare*`. One claim (`CircuitDto` has no `LoadFactor` field) was independently checked against `ProjectData.cs:225-235` and confirmed.

- `MepSketcherTools/MEP/Circuit.cs` — the `Circuit` type.
- `MepSketcherTools/MEP/Panel.cs` — `Panel : Equipment`, a true C# subtype that replaces the Equipment object in place under the same id.
- `MepSketcherTools/MEP/CircuitType.cs` — a small, per-project, user-editable type.
- `MepSketcherTools/Services/CircuitService.cs` — every circuit/panel mutation, including numbering, spare insertion, and panel conversion.
- `MepSketcherTools/Commands/*Circuit*.cs`, `*Panel*.cs`, `*Spare*.cs` — 12 command classes (listed in §6).
- `MepSketcherTools/Services/Persistence/DTOs/ProjectData.cs` — `CircuitDto`, `PanelDto`, `TerminalDto.CircuitId`. Introduced at schema v3.
- Related existing MepApp plan: `.claude/plans/networks-panel-spec.md` §3–§4, which already identified this exact gap ("Circuit/Panel — does not exist at all") and left it as its own unstarted Phase 2. **This plan supersedes that Phase 2** and closes its open decision D2 ("does Phase 2 happen at all soon?" — yes, this plan is it).

### Current MepApp core patterns (read in full)

- `packages/core/src/network.ts` — `NetworkType`, `Discipline`, `computeNetworks` (union-find over segment/fitting topology). Confirms `electrical` is already one `Discipline` value.
- `packages/core/src/network-type-library.ts` — the pattern this plan copies for `CircuitType`: a built-in seed array (`NETWORK_TYPE_LIBRARY`), looked up by id, with the live per-document copy stored on `ProjectDocument.networkTypes` and editable there.
- `packages/core/src/stamp.ts` — `PlacedStamp`, `StampCategory` (`'terminal' | 'equipment' | 'fitting'`). No existing "panel" concept.
- `packages/core/src/custom-properties.ts` — per-installation custom fields on a placed Terminal/Equipment. A candidate home for arbitrary circuit annotations the building-block catalogue calls out (electrical-schematic-templates.md §6, "Custom annotation").
- `packages/core/src/commands.ts` — `Command<S>` (`execute`/`undo`/optional `redo`, over an immutable state value), `CompositeCommand` (all-or-nothing undo, unlike the old app's inconsistent one).
- `packages/core/src/schema.ts` + `packages/core/src/project.ts` — versioned JSON migration, one step per version, current version 8.
- `packages/core/src/segmentTool.ts` — the validation pattern this plan follows: a pure function that returns `null` when a proposed change is invalid (e.g. `mergeSegmentsAtFitting`), rather than throwing. The caller decides what to show the user.
- `packages/render/src/drawingCommands.ts` — where `Command<DrawingState>` factories live today (`createStampCommand`, `createSegmentCommand`, …), each a few lines: swap one key in/out of a `Record<string, T>`.
- `packages/ui/src/components/NetworkTreePanel.tsx` — the existing Discipline → Network → Element tree. Electrical Circuits is the one discipline branch not yet built (networks-panel-spec.md §4 Phase 2).

## 3. What the old app got right — keep it

- **Numbering is gap-fill, scoped per panel (or the unassigned pool for `panelId = null`).** `GetNextCircuitNumberForScope` picks the lowest unused positive integer in scope — not a running counter. Deleting a circuit leaves a gap; the next creation in that scope fills it.
- **A spare is a real `Circuit`** with `isSpare = true`, occupying a real numbered slot, not a placeholder or an empty row.
- **Inserting a spare shifts everything at or after it up by one**, highest-numbered first (so no transient collision), freeing the slot. This is a different operation from plain creation (which never shifts — it only fills a gap).
- **Renumbering an existing circuit swaps** with whatever already occupies the target slot, rather than shifting a whole range.
- **Terminal-to-circuit membership is exclusive** — a terminal in circuit A cannot be added to circuit B without first being removed.
- **Capacity is a derived sum**, never stored: `sum(terminal.capacity for terminal in circuit.terminalIds)`, cascading up to the panel total.
- **`CircuitType` is a small, user-editable, per-document library** (name, abbreviation, description, units, a default capacity) — same shape as `NetworkType`.

## 4. What the old app got wrong — fix, don't port

| Gap | Old app behavior | New app fix |
|---|---|---|
| Terminal delete leaves a dangling reference | `MepService.DeleteTerminal` never calls `RemoveTerminalFromCircuit`; `Circuit.terminalIds` keeps the dead id forever. Undo of the delete does not restore circuit membership either. | The delete-terminal command becomes a `CompositeCommand`: remove-from-circuit (when assigned) + delete-stamp, so undo restores both atomically. No dangling ids are possible by construction. |
| `LoadFactor` is not persisted | `CircuitDto` (`ProjectData.cs:225-235`) has no `LoadFactor` field. It always resets to 100 on reload — confirmed against source. | The equivalent field (named `diversityPercent`, matching electrical-schematic-templates.md §7) is a normal persisted `Circuit` field from day one, set through a command like every other field. |
| Circuit number uniqueness is "opportunistic" | Nothing stops a direct field mutation from producing a duplicate number in one scope; only the service methods maintain the invariant, and nothing enforces callers use them. | Not applicable in the new app by construction: there are no public setters, only commands, and every command that changes a number computes it itself (gap-fill or swap). A duplicate number is unreachable through the command surface. |
| Spare can silently receive terminals | No guard in `AddTerminalToCircuit` checks `isSpare`; only UI convention avoids it. | The add-terminal-to-circuit command factory returns `null` for a spare target circuit, following the `segmentTool.ts` validation pattern (§2). The caller decides how to surface that (e.g. disable the drop target). |
| Panel conversion is an OO identity hack | `Panel : Equipment` is a genuine subtype that overrides the Equipment's id in the element map and replaces the stored object — needed only because the old app modeled elements as mutable class instances with identity. | Not needed here: `Panel` is a **separate record** that references a `PlacedStamp` (`category: 'equipment'`) by id. "Convert to panel" is just creating a `Panel` record for that stamp id; "revert to equipment" is deleting it. The stamp itself never changes. See §5. |
| `RevertToEquipmentCommand` and `ChangePanelSortDirectionCommand` are dead code | Written, never wired to a UI action. | Still port the *behavior* (both are one-line command factories in the new model), but confirm a UI entry point exists for each before shipping — don't reproduce unreachable code. |

## 5. Data model

### Design decision: Panel is a reference, not a replacement

The old app's `Panel : Equipment` subtype exists to satisfy C#'s mutable-object-identity model — the element map needs the *same slot* to now hold a richer type. MepApp's `PlacedStamp` is plain data with a fixed `category`, and nothing else in the codebase does this kind of type-swap. So:

- **`Panel`** is a new top-level record: `{ id, equipmentStampId, name, sortDirection, mainDevice, feederCable, accessories, sectionIds, circuitIds }`.
- `equipmentStampId` points at an existing `PlacedStamp` with `category: 'equipment'`. That stamp is unchanged — same rendering, same ports, same position — a panel is simply an Equipment stamp that a `Panel` record now references.
- "Convert to panel" = create a `Panel` record. "Revert to equipment" = delete it. Both are one-line, fully symmetric commands — no restriction on segments/ports needed at this layer (the old app's "must have zero segments" rule was UI-layer only, `CircuitSelectionTool.cs:235-240`, not enforced by the service; carry the same UI-layer-only convention forward, or drop it — open question 9).
- One `PlacedStamp` id can have at most one `Panel` record. Enforced the same way terminal-circuit exclusivity is: the command factory returns `null` if a `Panel` already references that stamp id.

### `Circuit`

```ts
interface Circuit {
  id: string;
  prefix: string;              // e.g. "A" in E60's "A1" — Circuit.CircuitPrefix
  number: number;               // unique within (panelId, isSpare doesn't affect scope)
  panelId?: string;              // undefined = unassigned pool, same scope as null in the old app
  sectionId?: string;            // new — old app has no equivalent; see PanelSection below
  terminalIds: string[];
  isSpare: boolean;
  customName?: string;           // auto-populated from the first terminal's name, same rule as the old app (§CircuitService.AddTerminalToCircuit)
  circuitTypeId?: string;
  phase?: 'L1' | 'L2' | 'L3' | 'L1L2' | 'L2L3' | 'L1L3' | 'L1L2L3'; // provisional — see open question 3
  device?: {
    kind: 'breaker' | 'other';
    curve?: string;               // "B", "C", "D" — breaker curve letter
    ratingA?: number;
    rcdMilliamps?: number;
  };
  cable?: {
    type?: string;                // e.g. "B2CA"
    coreCount?: number;
    crossSectionMm2?: number;
    lengthM?: number;              // user-typed, per the user's decision in electrical-schematic-templates.md §1
  };
  diversityPercent: number;      // default 100 — replaces the old app's unpersisted LoadFactor
}
```

Fields marked provisional (`phase`, `device`, `cable` shapes) are a first pass from the fixtures and the old app. **They are exactly what electrical-schematic-templates.md's Phase 0 mockup (its "Circuit assignment" screen) is meant to pressure-test — do not finalize these shapes before that review lands.**

### `Panel`

```ts
interface Panel {
  id: string;
  equipmentStampId: string;      // the PlacedStamp this panel overlays
  name: string;
  sortDirection: 'ascending' | 'descending';
  mainDevice?: { label: string; ratingA?: number };  // e.g. E60's "Q1A/160A" — free label plus an optional typed rating
  feederCable?: { type?: string; crossSectionMm2?: number; lengthM?: number };
  accessories: PanelAccessory[];   // CT, meter, surge protector — new, generalizes the old app's fixed feeder-only fields
  sectionIds: string[];
  circuitIds: string[];           // derived-cacheable from Circuit.panelId, or authoritative — see open question 4
}

interface PanelAccessory {
  id: string;
  kind: string;   // "currentTransformer" | "meter" | "surgeProtector" | ... — open, not a closed enum yet
  label?: string;
}
```

### `PanelSection`

New — the old app has no concept matching E60's "preferent A (1e pref.)" / "preferent A (2e pref.)" board sections. A thin grouping record:

```ts
interface PanelSection {
  id: string;
  panelId: string;
  name: string;
  order: number;
}
```

### `CircuitType`

Same shape as the old app, following the `NetworkType`/`network-type-library.ts` pattern (§3):

```ts
interface CircuitType {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  units: string;
  defaultCapacity: number;
}
```

**Deliberate deviation from the old app:** the old `CircuitType` was confirmed vestigial — nothing reads `DefaultCapacity` or `Units` for any computation, only labels. In the new design, `circuitTypeId` is meant to **drive template group-variant selection** (electrical-schematic-templates.md §6, §8 — a circuit picks which building-block group it renders with, partly by its type). This is a genuine new use the old app never had. Resolves electrical-schematic-templates.md open question 7.

Ships a small built-in seed list (`CIRCUIT_TYPE_LIBRARY`, mirroring `NETWORK_TYPE_LIBRARY`) plus a per-document editable copy on `ProjectDocument.circuitTypes`.

## 6. Commands

One factory per old-app command, following the `drawingCommands.ts` pattern (§2) — each takes plain data, returns a `Command<DrawingState>` or `null` on an invalid precondition, per the `segmentTool.ts` validation pattern:

| Old app command | New factory (provisional name) | Notes |
|---|---|---|
| `CreateCircuitCommand` | `createCircuitCommand` | Next free number in the unassigned pool. |
| `DeleteCircuitCommand` | `deleteCircuitCommand` | Clears `circuitId` on every member terminal — now via composite undo, not a manual snapshot. |
| `AddTerminalToCircuitCommand` | `addTerminalToCircuitCommand` | Returns `null` if the terminal is already in a different circuit, or the target is a spare (fixes §4's gap). |
| `RemoveTerminalFromCircuitCommand` | `removeTerminalFromCircuitCommand` | |
| `AssignPanelToCircuitCommand` | `assignCircuitToPanelCommand` | Renumbers into the target panel's scope (gap-fill), same as old. |
| `RemoveCircuitFromPanelCommand` | `removeCircuitFromPanelCommand` | Old app deletes a spare outright on panel removal instead of returning it to the unassigned pool — confirm this is still wanted, or make spares behave like any other circuit here (open question 5). |
| `CreateSpareCircuitCommand` | `insertSpareCircuitCommand` | Shifts every circuit in scope at/after the target number up by one first. |
| `RenumberCircuitCommand` (new — old app calls `RenumberCircuit` directly, uncommanded in places) | `renumberCircuitCommand` | Swap semantics. |
| `ChangeCircuitPrefixCommand` | `setCircuitPrefixCommand` | |
| `BulkChangeCircuitPrefixCommand` | `setCircuitPrefixBulkCommand` | `CompositeCommand` over several `setCircuitPrefixCommand`s. |
| `ChangeCircuitNameCommand` | `setCircuitCustomNameCommand` | |
| (new) | `setCircuitTypeCommand` | Old app calls `SetCircuitType` directly with no command/undo (`CircuitPropertiesViewModel.cs:95-107`) — give it one here. |
| (new) | `setCircuitDeviceCommand`, `setCircuitCableCommand`, `setCircuitDiversityCommand`, `setCircuitPhaseCommand` | Old app's `LoadFactor` setter is also uncommanded (`CircuitPropertiesViewModel.cs:109-119`) — every field gets a real undo step here, closing that gap too. |
| `ConvertToPanelCommand` | `createPanelCommand` | Creates the `Panel` record referencing the stamp — no object replacement (§5). |
| `RevertToEquipmentCommand` | `deletePanelCommand` | Detaches all circuits first (returns them to the unassigned pool), same as old `RevertToEquipment`. |
| (Panel rename, uncommanded in old app) | `setPanelNameCommand` | |
| `ChangePanelSortDirectionCommand` | `setPanelSortDirectionCommand` | |
| (new) | `setPanelMainDeviceCommand`, `setPanelFeederCableCommand`, `addPanelAccessoryCommand`, `removePanelAccessoryCommand` | |
| (new) | `createPanelSectionCommand`, `renamePanelSectionCommand`, `deletePanelSectionCommand`, `setCircuitSectionCommand` | No old-app equivalent (§5). |

Delete-terminal and delete-panel-equipment-stamp commands (already existing in `drawingCommands.ts`) need to become composites that also run the circuit-cleanup commands above, closing §4's dangling-reference gap.

## 7. Validation rules carried forward

- A terminal belongs to at most one circuit at a time.
- A circuit number is unique within its scope (its panel, or the unassigned pool). Enforced structurally (§4), not by convention.
- A panel may have zero circuits.
- No maximum circuit count per panel (matches old app; revisit only if a real project needs one).
- A spare circuit cannot receive terminals (§4 fix — the old app allowed this by omission).
- One `PlacedStamp` may back at most one `Panel` record (§5).

## 8. Persistence

- `ProjectDocument` gains: `circuits: Circuit[]`, `panels: Panel[]`, `panelSections: PanelSection[]`, `circuitTypes: CircuitType[]`.
- `CURRENT_SCHEMA_VERSION` bumps from 8 to 9. One migration step, defaulting all four to `[]` for any older document — same pattern as every prior step in `project.ts` (e.g. the `portGroups` and `customStampDefinitions` steps).
- No DTO translation layer is needed — the new app persists its domain types directly as JSON (confirmed by every existing field in `ProjectDocument`), unlike the old app's separate `CircuitDto`/`PanelDto` mapping layer. This is also what closes the `LoadFactor`-not-persisted gap: there is no separate DTO to have forgotten a field on.

## 9. UI (not started — comes after the domain model)

Builds the "Electrical Circuits" branch that `networks-panel-spec.md` §4 left as an unstarted Phase 2, inside the existing `NetworkTreePanel.tsx`:

```
Discipline: Electrical
└─ Circuit Type group (or "Ungrouped")
   └─ Panel
      └─ Section (if any)
         └─ Circuit (shows "spare" state, terminal count)
```

Plus a circuit/panel properties panel (new component, alongside the existing `PropertiesPanel.tsx`), a bulk prefix-edit mode (matches the old app's checkbox multi-select), and the "select panel" / "convert to panel" interaction (matches `CircuitSelectionTool`'s click-to-pick flow, without porting the segment-count restriction unless open question 9 says to keep it).

**This phase should follow, not precede, electrical-schematic-templates.md's Phase 0 mockup** — its "Circuit assignment" screen is where the exact fields and flows in §5–§6 above get pressure-tested against a real user judgment call, same reasoning as §5's provisional-fields note.

## 10. Phases

### Phase A — Core types, numbering, capacity

**Done** — 2026-09-23, commit `b2b884e` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped: `packages/core/src/circuit.ts` (`Circuit`, `Panel`, `PanelAccessory`,
`PanelSection`, `CircuitType` types per §5; `getNextCircuitNumber` (gap-fill),
`shiftCircuitNumbersUpFrom` (spare-insertion shift), `renumberCircuitWithSwap`
(swap semantics, scoped to the moving circuit's own panel), `computeCircuitCapacity`
and `computePanelCapacity` (derived sums, `terminalCapacities: Record<string, number>`
matching `flow.ts`'s existing shape)) and `packages/core/src/circuit-type-library.ts`
(`CIRCUIT_TYPE_LIBRARY` seed of 8 built-in types + `getCircuitTypeFromLibrary`,
mirroring `network-type-library.ts` — the old app shipped no built-in
`CircuitType`s, so this seed is new to MepApp). Both re-exported from
`packages/core/src/index.ts`. diversityPercent is stored but not yet folded
into the capacity formula (no such rule was specified — left for whichever
phase defines it).

Not done: no `createCircuit`-style id-generating factories (Phase C's job,
per the `network.ts` pattern of not allocating ids in `core`); the 7 open
questions in §12 are still open and may still change these shapes before
Phase C locks in the command surface.

Verified: `pnpm exec vitest run` in `packages/core` — 168 tests passed
(17 new, in `circuit.test.ts` and `circuit-type-library.test.ts`), 0
failures. `pnpm --filter @mepapp/core exec tsc --noEmit` clean. `pnpm build`
at repo root — all 9 workspace tasks succeeded (5 cached, 4 rebuilt
including `@mepapp/render`, `@mepapp/ui`, `@mepapp/web`), confirming the
new exports don't break downstream packages. No UI to verify in-browser —
this phase has no UI surface (§9 is Phase D).

### Phase B — Schema migration — not started
Bump to schema v9, one migration step, `project.test.ts` coverage for the new step (matches every prior migration's test).

### Phase C — Commands — not started
Every factory in §6, in a new `packages/render/src/circuitCommands.ts` alongside `drawingCommands.ts`. Composite delete-cleanup wiring into the existing delete-terminal/delete-stamp commands.

### Phase D — UI — not started, blocked on electrical-schematic-templates.md Phase 0
The tree branch, properties panel, and interactions in §9.

## 11. Non-goals for v1

- Nested panels (`parentPanelId` exists as a reserved, unused field in the old app too — leave it out until a real need appears).
- Enforcing "equipment must have zero segments before becoming a panel" at the domain layer (open question 9).
- Any schematic drawing or template concept — that is entirely electrical-schematic-templates.md's scope.

## 12. Open questions

1. Should `Panel.circuitIds` be authoritative or derived on the fly from `Circuit.panelId` (avoiding two sources of truth, same tradeoff `network.ts`'s doc comment calls out for its own decision to derive network membership rather than store it)?
2. Exact `phase` representation — the fixtures show single-phase circuits only; how does a three-phase circuit's `phase` field look? (Same as electrical-schematic-templates.md open question 3 — resolve together.)
3. `device`/`cable` field shapes are provisional (§5) — confirm after the mockup review.
4. Does `removeCircuitFromPanelCommand` keep the old app's behavior of deleting a spare outright, or return it to the unassigned pool like any other circuit?
5. Should `PanelAccessory.kind` be a closed enum or free text? The fixtures show current transformers, a meter, and a surge protector; there may be more per country.
6. Carry forward the old app's "equipment must have zero segments to become a panel" UI-layer restriction, or drop it?
7. Where do `CustomPropertyDefinition`-style custom annotations (electrical-schematic-templates.md §6, "Custom annotation" building block) attach — to the `Circuit` record directly, or reuse the existing per-installation custom-properties mechanism (`custom-properties.ts`), scoped to circuits instead of stamps?
