# Electrical circuits and panels — data model plan

Status: **draft, Phases A–D done, plus a post-D review that fixed 2 real bugs and disclosed 2 previously-unnoticed UI gaps (spare creation, renumbering).** **Phase E (circuit workflow UI: canvas tools, connection lines, tree, terminal side) added 2026-09-23 after Windows testing; E1 and E2 (move command, toasts, Add-to-Circuit tool, terminal Circuit section) done 2026-09-23, E3 (connection lines and Show Circuits toggle) done 2026-09-24, E4 (Circuits mode and floating toolbar) E5 (tree, menus, halos, delete), E6 (spares, renumber, bulk edit) and E7 (circuit type editor) done 2026-09-24, E8 not started.** Written 2026-09-22. Prerequisite for `.claude/plans/electrical-schematic-templates.md` Phase 1 — see [[electrical-schematic-templates.md#§13 Alignment with the circuit model]] for the two-way cross-check.

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

- **`Panel`** is a new top-level record: `{ id, equipmentStampId, name, sortDirection, mainDevice, feederCable, accessories, sectionIds }`. (No stored `circuitIds` — see §12 open question 1, resolved: derived via `getPanelCircuitIds(panel, circuits)`.)
- `equipmentStampId` points at an existing `PlacedStamp` with `category: 'equipment'`. That stamp is unchanged — same rendering, same ports, same position — a panel is simply an Equipment stamp that a `Panel` record now references.
- "Convert to panel" = create a `Panel` record. "Revert to equipment" = delete it. Both are one-line, fully symmetric commands — no restriction on segments/ports needed at this layer (the old app's "must have zero segments" rule was UI-layer only, `CircuitSelectionTool.cs:235-240`, not enforced by the service — §12 open question 6, resolved 2026-09-23: dropped, not carried forward even at the UI layer).
- One `PlacedStamp` id can have at most one `Panel` record. Enforced the same way terminal-circuit exclusivity is: the command factory returns `null` if a `Panel` already references that stamp id.

### `Circuit`

```ts
interface Circuit {
  id: string;
  prefix?: string;              // e.g. "A" in E60's "A1" — Circuit.CircuitPrefix. undefined = inherits the panel's circuitDefaults.prefix, or '' with no panel/default
  number: number;               // unique within (panelId, isSpare doesn't affect scope)
  panelId?: string;              // undefined = unassigned pool, same scope as null in the old app
  sectionId?: string;            // new — old app has no equivalent; see PanelSection below
  terminalIds: string[];
  isSpare: boolean;
  customName?: string;           // auto-populated from the first terminal's name, same rule as the old app (§CircuitService.AddTerminalToCircuit)
  circuitTypeId?: string;        // undefined = inherits the panel's circuitDefaults.circuitTypeId, if any
  phase?: 'L1' | 'L2' | 'L3' | 'L1L2' | 'L2L3' | 'L1L3' | 'L1L2L3'; // provisional — see open question 2. undefined = inherits the panel's circuitDefaults.phase, if any
  device?: {                     // undefined = inherits the panel's circuitDefaults.device, if any (whole-object override, not per-subfield)
    kind: 'breaker' | 'other';
    curve?: string;               // "B", "C", "D" — breaker curve letter
    ratingA?: number;
    rcdMilliamps?: number;
  };
  cable?: {
    type?: string;                // e.g. "B2CA". undefined = inherits circuitDefaults.cable.type
    coreCount?: number;           // undefined = inherits circuitDefaults.cable.coreCount
    crossSectionMm2?: number;     // undefined = inherits circuitDefaults.cable.crossSectionMm2
    lengthM?: number;              // user-typed, per the user's decision in electrical-schematic-templates.md §1 — never inherited, always per-circuit
  };
  diversityPercent?: number;      // undefined = inherits the panel's circuitDefaults.diversityPercent, or 100 with no panel/default — replaces the old app's unpersisted LoadFactor
  properties?: CustomPropertyValues; // arbitrary user-added annotations — see open question 7, resolved: reuse custom-properties.ts scoped to circuits
}

interface PanelCircuitDefaults {
  prefix?: string;
  circuitTypeId?: string;
  phase?: Circuit['phase'];
  device?: Circuit['device'];
  cable?: { type?: string; coreCount?: number; crossSectionMm2?: number }; // no lengthM — never a panel default
  diversityPercent?: number;
}
```

Fields marked provisional (`phase`, `device`, `cable` shapes) are a first pass from the fixtures and the old app. **They are exactly what electrical-schematic-templates.md's Phase 0 mockup (its "Circuit assignment" screen) is meant to pressure-test — do not finalize these shapes before that review lands.**

**Panel-level defaults with per-circuit override**, decided in that same Phase 0 mockup's round 4 (2026-09-23, `electrical-schematic-templates.md` §7): `prefix`, `circuitTypeId`, `phase`, `device`, `cable.type`/`cable.coreCount`/`cable.crossSectionMm2`, and `diversityPercent` are all defaultable at the panel level via `Panel.circuitDefaults`; a circuit leaving one of these fields `undefined` inherits it from its panel instead of falling back to a hardcoded literal. `cable.lengthM` is excluded — always a per-circuit typed measurement, since two circuits off the same panel practically always run different physical lengths. `circuit.ts` exposes one resolver per field (`getEffectivePrefix`, `getEffectiveCircuitTypeId`, `getEffectivePhase`, `getEffectiveDevice`, `getEffectiveCable`, `getEffectiveDiversityPercent`) rather than one generic resolver, since `device` resolves as a whole object while `cable`'s three defaultable subfields resolve individually.

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
  circuitDefaults?: PanelCircuitDefaults;   // fallback values a member circuit inherits for any field it leaves unset — see the note under Circuit above
  // No circuitIds field — derived via getPanelCircuitIds(panel, circuits), see open question 1 (resolved)
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
| `RemoveCircuitFromPanelCommand` | `removeCircuitFromPanelCommand` | A spare is deleted outright on panel removal, matching the old app — non-spare circuits return to the unassigned pool (open question 4, resolved 2026-09-23: keep the old app's spare-deletion behavior). |
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
| (new) | `setPanelCircuitDefaultsCommand` | Whole-object replacement of `Panel.circuitDefaults` — added post-Phase-C, templates plan §7 round 4. |
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
- **Addendum (post-Phase-C):** `CURRENT_SCHEMA_VERSION` bumps again, 9 to 10, for `Panel.circuitDefaults` and the override-or-inherit reading of several `Circuit` fields (see §5's addendum note). The v9→v10 step is a version-number-only migration with no data transform — every touched field is optional and every reader already treats "absent" as "no override"/"no default", the same reasoning `project.ts` used for `PlacedStamp.color`'s v5→v6 step.

## 9. UI (not started — comes after the domain model)

Builds the "Electrical Circuits" branch that `networks-panel-spec.md` §4 left as an unstarted Phase 2, inside the existing `NetworkTreePanel.tsx`:

```
Discipline: Electrical
└─ Circuit Type group (or "Ungrouped")
   └─ Panel
      └─ Section (if any)
         └─ Circuit (shows "spare" state, terminal count)
```

Plus a circuit/panel properties panel (new component, alongside the existing `PropertiesPanel.tsx`), a bulk prefix-edit mode (matches the old app's checkbox multi-select), and the "select panel" / "convert to panel" interaction (matches `CircuitSelectionTool`'s click-to-pick flow — no segment-count restriction, per open question 6, resolved).

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
per the `network.ts` pattern of not allocating ids in `core`). The 7 open
questions in §12 were open at the time this phase shipped; all 7 are now
resolved (2026-09-23, see §12) — `Panel.circuitIds` and `Circuit.properties`
already reflect those resolutions as of the commit below.

Verified: `pnpm exec vitest run` in `packages/core` — 168 tests passed
(17 new, in `circuit.test.ts` and `circuit-type-library.test.ts`), 0
failures. `pnpm --filter @mepapp/core exec tsc --noEmit` clean. `pnpm build`
at repo root — all 9 workspace tasks succeeded (5 cached, 4 rebuilt
including `@mepapp/render`, `@mepapp/ui`, `@mepapp/web`), confirming the
new exports don't break downstream packages. No UI to verify in-browser —
this phase has no UI surface (§9 is Phase D).

### Phase B — Schema migration

**Done** — 2026-09-23, commit `752a378` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped: `CURRENT_SCHEMA_VERSION` bumped 8 → 9. `ProjectDocument` gains
`circuits: Circuit[]`, `panels: Panel[]`, `panelSections: PanelSection[]`,
`circuitTypes: CircuitType[]`. One migration step (`fromVersion: 8,
toVersion: 9`) defaulting all four to `[]`, matching every prior step's
pattern. Four new `requireArray` validators. `render/src/scene.ts`'s
`exportProject()` updated to pass empty arrays for the four new fields —
`SketchScene` has no circuit/panel state of its own yet, so this is a
placeholder pending Phase C, not a real round trip yet.

Not done: `loadProjectFromJson()` reads the four new fields off the
migrated document but doesn't store them anywhere yet (no render-side
state exists to put them in) — Phase C's job, alongside the command
factories that will actually mutate them.

Verified: `pnpm exec vitest run` in `packages/core` — 170 tests passed
(1 new migration test + updated round-trip/missing-field tests in
`project.test.ts`), 0 failures. `pnpm build` at repo root — all 9
workspace tasks succeeded, confirming `@mepapp/render`/`@mepapp/ui`/
`@mepapp/web` still typecheck against the wider `ProjectDocument` shape.
No UI to verify in-browser — this phase has no UI surface.

### Phase C — Commands

**Done** — 2026-09-23, commit `5904e8c` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped: `packages/render/src/circuitCommands.ts` — every factory in §6
(24 exports), following `drawingCommands.ts`'s `Command<DrawingState>`
pattern. `addTerminalToCircuitCommand` and `createPanelCommand` return
`null` on their plan-specified invalid preconditions; other factories
follow `drawingCommands.ts`'s existing convention of trusting the caller
for basic CRUD. `removeCircuitFromPanelCommand` implements open question
4's resolution (a spare is deleted outright; a non-spare returns to the
unassigned pool). `detachPanelCircuits` is exported as a plain pure
helper (not a `Command`), reused by both `deletePanelCommand` and
`scene.ts`'s delete-cleanup below. `DrawingState` (`document.ts`) gained
`circuits`/`panels`/`panelSections` as undo-tracked records, plus
`circuitTypes` as a plain per-document array (mirroring
`networkTypes`/`customStampDefinitions` — no "adopt on first use"
mechanism, since nothing in Phase C needs one) and matching
`nextCircuitSeq`/`nextPanelSeq`/`nextPanelSectionSeq` id counters.
`isEmpty()` now also checks circuits/panels are empty.

Correction to this plan's own premise: §6's closing line assumed
"delete-terminal and delete-panel-equipment-stamp commands... already
existing in `drawingCommands.ts`" could become `CompositeCommand`s.
Investigation found no such per-item delete commands exist —
`drawingCommands.ts` only has create/delete-by-type factories, and actual
stamp/segment/annotation deletion happens through `scene.ts`'s
`deleteSelection()`, a `Transaction`-based bulk mutation with its own
single before/after undo snapshot. The dangling-reference cleanup this
phase's §4 needs is wired into `deleteSelection()` directly instead: it
now purges a deleted terminal from every circuit's `terminalIds`, and
detaches a Panel (returning its circuits to the unassigned pool via
`detachPanelCircuits`) when its underlying equipment stamp is deleted —
same net effect the plan asked for, different integration point than
described. `exportProject`/`loadProjectFromJson` also updated to
round-trip real circuit/panel/panelSection/circuitType state (replacing
Phase B's empty-array placeholder), with id-counter reseeding on load
matching the existing segment/fitting/stamp pattern (id format:
`circuit-<n>`, `panel-<n>`, `panel-section-<n>`) — skipping this would
have reintroduced the exact reload-id-collision class of bug fixed
2026-09-21 (Decisions-Log; commit `6dd1098`).

Not done: no UI calls any of these commands yet (Phase D); no id-minting
call sites exist yet either (the three new `nextXSeq` counters are
declared but unused until Phase D mints an id from one, same relationship
`nextStampSeq` etc. already have to their own placement tools).

Verified: `pnpm --filter @mepapp/core exec tsc --noEmit` and
`pnpm --filter @mepapp/render exec tsc --noEmit` both clean. `pnpm build`
at repo root — all 9 workspace tasks succeeded. `pnpm turbo run test` —
170 core + 13 pdf-engine-mupdf tests, unchanged (render has no test
infra to extend — consistent with the rest of that package, per this
project's CLAUDE.md). No UI to verify in-browser — this phase has no UI
surface.

### Phase C addendum — panel circuit defaults

**Done** — 2026-09-23, commit `cf4520b` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Triggered by `electrical-schematic-templates.md`'s Phase 0 mockup round 4
(2026-09-23): the user decided panels should hold default values for
several circuit fields, with each circuit free to override or inherit.
That plan's §13 flagged this as a to-do against this plan's §5/§6 before
Phase D starts, since Phase C's commands were already built against the
old flat shape.

Shipped: `Panel` gains `circuitDefaults?: PanelCircuitDefaults` (§5).
`Circuit.prefix` and `Circuit.diversityPercent` become optional, joining
`circuitTypeId`/`phase`/`device`/`cable.type`/`cable.coreCount`/
`cable.crossSectionMm2`, which were already optional — an unset field on
any of these now means "inherit from the panel", not "unset". `cable.lengthM`
stays excluded from defaulting (§5's note). Six resolver functions in
`circuit.ts` (`getEffectivePrefix`, `getEffectiveCircuitTypeId`,
`getEffectivePhase`, `getEffectiveDevice`, `getEffectiveCable`,
`getEffectiveDiversityPercent`) read circuit-then-panel-then-hardcoded-
fallback, mirroring `computeCircuitCapacity`'s existing pure-function
style rather than one generic resolver, since `device` resolves as a
whole object while `cable`'s three defaultable subfields resolve
individually. `circuitCommands.ts` gained `setPanelCircuitDefaultsCommand`
(whole-object replacement, matching `setPanelMainDeviceCommand`'s
pattern); `setCircuitPrefixCommand`/`setCircuitDiversityCommand` widened
to accept `undefined` so a caller can clear an override back to
inheriting; `createCircuitCommand` no longer forces `prefix: ''` /
`diversityPercent: 100` onto a new circuit, so a circuit created under a
panel with defaults inherits them immediately rather than needing an
explicit reset. `CURRENT_SCHEMA_VERSION` bumped 9 → 10 (§8's addendum
note) — a version-marker-only step, no data transform needed since every
touched field is optional.

Not done: no UI reads or writes `circuitDefaults` yet (Phase D's job,
same as the rest of this plan's command surface).

Verified: `pnpm --filter @mepapp/core exec vitest run` — 176 tests passed
(6 new in `circuit.test.ts`'s resolver-function suite, 1 new migration
test in `project.test.ts`), 0 failures. `pnpm --filter @mepapp/core exec
tsc --noEmit` and `pnpm --filter @mepapp/render exec tsc --noEmit` both
clean (after rebuilding `@mepapp/core`'s `dist/` — render typechecks
against the built package, not source). `pnpm build` at repo root — all 9
workspace tasks succeeded. `pnpm turbo run test` — 176 core +
pdf-engine-mupdf tests, all passing. No UI to verify in-browser — this
addendum has no UI surface.

### Phase D — UI

**Done** — 2026-09-23, commit `7bcba5f` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Shipped: a full `SketchScene` read/write API for circuits and panels
(`listCircuits`/`listPanels`/`listPanelSections`/`listCircuitTypes`,
`getPanelForEquipmentStamp`, and a wrapper method per §6 command factory,
plus `setCircuitProperty` — new, no factory existed for it — and
`setPanelCircuitDefaults`/`addPanelAccessory`/`removePanelAccessory`, the
latter minting ids off a new `nextPanelAccessorySeq` counter with its own
reseed-on-load block, matching the existing segment/fitting/stamp/circuit/
panel/panelSection pattern). `NetworkTreePanel.tsx` gained a "Circuits"
subsection nested under the Electrical discipline row, alongside (not
replacing) the existing per-network element list: Panel → Section → Circuit
rows, an "Unassigned" bucket for panel-less circuits, spare styling, and
"+ Add circuit" affordances. A new `CircuitPanelProperties.tsx` exports
`CircuitProperties` and `PanelProperties`, wired into `PropertiesPanel.tsx`
ahead of its existing stamp/segment/fitting branches via two new pieces of
app-level selection state (`selectedCircuitId`/`selectedPanelId` in
`useSketchScene.ts` — a Circuit/Panel has no canvas presence to select via
the normal stamp-selection path, so `SketchScene.clearSelection()` (new)
keeps the two selection concepts mutually exclusive). Every defaultable
field (`prefix`, `circuitTypeId`, `phase`, `device`, `cable.type`/
`coreCount`/`crossSectionMm2`, `diversityPercent`) renders as inherited
(dashed/italic, panel default as placeholder) or overridden (solid, with a
↺ reset-to-default link) via three small `Inheritable*Field` components,
matching the Phase 0 mockup round 4's exact described UX. Panel's own
Properties view edits `circuitDefaults` inline (no separate dialog — same
inline-field convention as `mainDevice`/`feederCable`) and its own sections
list. `PropertiesPanel.tsx`'s single-stamp branch gained "Convert to
panel"/"Manage panel…" buttons for an Equipment-category stamp, gated on
`SketchScene.getPanelForEquipmentStamp`.

A real bug surfaced and fixed during verification, not just a premise
mismatch this time: the first implementation routed every circuit/panel
mutation through the existing `'drawingChanged'` event (reusing
`syncDrawingLayer`'s notification channel to avoid inventing a new one).
`useSketchScene.ts`'s `onDrawingChanged` handler also refreshes
`selectedSegment`/`selectedSegments`/`selectedFitting`, and
`getSelectedSegments()` always returns a fresh array reference even when
nothing about segments changed — so a circuit edit made `selectedSegments`
change reference too, which spuriously re-ran `App.tsx`'s "an armed
placement tool forces the Stamps tab" effect (keyed on `selectedSegments`
among others) on every circuit edit. Caught via a real Playwright
walkthrough: editing a freshly-created circuit's prefix while the
equipment-placement tool was still armed (a reachable state — placing a
stamp doesn't auto-disarm the tool, and nothing stops a user manually
opening Properties while it's still armed) yanked the dock from Properties
back to the Stamps tab mid-edit. Fixed by giving circuit/panel changes
their own `'circuitsChanged'` event, decoupled from segment-selection
refresh entirely — see that event's doc comment in `scene.ts`.

Not done, deliberately deferred:
- **Assigning a terminal to a circuit** only works from the circuit's own
  Properties view removing one — no "assign this terminal to a circuit"
  affordance on a Terminal stamp's own Properties panel yet. `addTerminalToCircuit`
  exists on `SketchScene` and is fully wired/undo-tracked; only the UI
  entry point is missing.
- **`Circuit.properties`** (plan §12 open question 7) has a working
  `setCircuitProperty` command but no definitions/reserved-name editor —
  same gap Phase C's own note already flagged as belonging here, still open.
- **`PanelAccessory` add/remove** has a working `SketchScene` method
  (`addPanelAccessory`/`removePanelAccessory`) but no UI row in
  `PanelProperties` yet.
- **Bulk prefix-edit mode** (`setCircuitPrefixBulkCommand`, checkbox
  multi-select across circuits, §9) — command exists, no tree UI for it.
- No dedicated `circuit.test.ts`/`render` test coverage was added (UI-only
  change; `@mepapp/render` has no test infrastructure, consistent with the
  rest of that package per this project's `CLAUDE.md`).
- **Corrected 2026-09-23 (post-implementation review — see the addendum
  below): two more gaps were missing from this list, not deliberately
  deferred, just unnoticed.** `insertSpareCircuit`/`renumberCircuit` are
  both fully wired on `SketchScene`, undo-tracked, with no UI call site
  anywhere in `packages/ui` — a user cannot create a spare or renumber a
  circuit through the shipped UI at all, even though "a spare is a real
  Circuit... occupying a real numbered slot" is one of the domain model's
  explicitly-kept old-app behaviors (§3) and the tree was specifically
  built to display spare state.

Verified: `pnpm --filter @mepapp/core exec tsc --noEmit`, `pnpm --filter
@mepapp/render exec tsc --noEmit`, and `pnpm --filter @mepapp/ui exec tsc
--noEmit` all clean. `pnpm build` at repo root — all 9 workspace tasks
succeeded. `pnpm turbo run test` — 176 core + pdf-engine-mupdf tests
unchanged. **Live in-browser walkthrough** (headless Chromium via
Playwright, `fixtures/pdfs/arch_simple_A4.pdf`): placed a
D3 Air Handling Unit equipment stamp, clicked "Convert to panel" (panel
created, Panel Properties view opened automatically), expanded the tree's
new Panel row, clicked "+ Add circuit" (circuit created inside the panel,
tree/properties both updated, dock auto-switched to Properties), edited
the circuit's Prefix field from inherited to "A" (label updated live to
"Circuit A1", value persisted via `listCircuits()`), clicked Undo (prefix
correctly reverted to unset/inherited). Screenshots taken at each step
confirmed the inherited-field dashed/italic styling and the panel
defaults section rendering correctly.

**Correction, 2026-09-23 (post-implementation review):** the Undo claim
above does not hold against the actual event wiring at the time this was
written — see the review addendum immediately below. The domain model
*did* revert correctly (circuits/panels share `drawingHistory` with
everything else); what the walkthrough missed is that the tree/properties
UI wasn't guaranteed to refresh afterward, since `undoDrawing()` never
emitted `'circuitsChanged'`. The walkthrough's specific sequence may have
incidentally shown the correct value regardless (e.g. if some other event
fired first), or the observation was simply mistaken. Left in place
rather than deleted, per this project's convention of correcting the
record rather than rewriting history — see the addendum for the fix.

### Phase D review & fixes — post-implementation

**Done** — 2026-09-23, commit `28d48e5` on `worktree-electrical-schematic-templates-plan` (not yet merged to `master`).

Requested by the user as a second-opinion check on Phase D before trusting
it ("assume it finished correctly, but check to be sure") — appropriate
caution, since Phase D was implemented by an agent that had been
explicitly briefed for read-only research and went off-brief into a full
implementation, commit, and push with nobody reviewing the diff line by
line first (see session notes). A dedicated review pass read the actual
diff against this plan's §5/§6/§9 and found two real, independently-
verified bugs plus one design-drift risk and one cosmetic issue:

1. **Fixed — undo/redo didn't refresh the circuit/panel UI.**
   `SketchScene.undoDrawing()`/`redoDrawing()` only called
   `syncDrawingLayer()` (fires `'drawingChanged'`), never
   `notifyCircuitsChanged()` (fires `'circuitsChanged'`) — the event the
   Phase D commit's own bug fix introduced specifically so circuit/panel
   state wouldn't ride along with segment-selection refresh. Since
   `circuits`/`panels`/`panelSections` share the same undo-tracked
   `drawingHistory` as segments/stamps (Phase C), an undo/redo *does*
   correctly revert them at the domain level, but the tree and any open
   Circuit/Panel Properties view kept showing pre-undo values until some
   unrelated circuit/panel edit happened to fire `circuitsChanged`.
   Fixed by having both methods also call `notifyCircuitsChanged()`
   unconditionally (cheap, and undo/redo can't cheaply know in advance
   whether the specific step touched circuits/panels, so it isn't worth
   trying to detect precisely — same reasoning `syncDrawingLayer()`
   already runs unconditionally above it).
2. **Fixed — deleting a panel's backing stamp left a ghost Properties view.**
   `deleteSelection()`'s circuit/panel dangling-reference cleanup (§4/§6,
   the `Transaction` block that detaches a Panel when its Equipment stamp
   is deleted) had the same gap: only `syncDrawingLayer()` ran afterward.
   With a Panel's own Properties view open, deleting its backing stamp on
   canvas left `PropertiesPanel.tsx` rendering a `PanelProperties` for a
   panel no longer in `DrawingState.panels` — every field edit became a
   silent no-op, guarded by `SketchScene.withPanel`'s existence check with
   no error surfaced. Fixed the same way: `notifyCircuitsChanged()` now
   runs after the transaction commits, when the deletion included a stamp
   (the only kind of deletion that can touch circuits/panels).
3. **Fixed — two UI call sites reimplemented `circuit.ts`'s canonical
   inherit/override resolvers instead of calling them**, a real drift
   risk given the resolvers exist specifically so this logic lives in one
   place: `NetworkTreePanel.tsx` and `CircuitPanelProperties.tsx` each had
   their own `circuitLabel()` hand-rolling `circuit.prefix ??
   panel?.circuitDefaults?.prefix ?? ''`, duplicating `getEffectivePrefix`;
   the Diversity field's placeholder hardcoded its own `?? 100` fallback,
   duplicating `getEffectiveDiversityPercent`. Both now call the resolver
   directly. Not touched: the `Inheritable*Field` components' `value`/
   `defaultValue` split is a different, UI-specific concern (they need the
   raw override and the panel default as two separate values, to decide
   dashed-vs-solid styling — not the resolvers' single merged value — so
   this isn't the same duplication for `device`/`cable`/`phase`/
   `circuitTypeId`, which pass `panel?.circuitDefaults?.x` straight
   through with no extra fallback logic to drift).
4. **Fixed — two roundabout conditional-type casts**, replaced with the
   plainer `NonNullable<Circuit['device']>['kind']` /
   `NonNullable<Panel['circuitDefaults']>['phase']` spelling, matching the
   plain `as Panel['sortDirection']` cast already used two lines away in
   the same file.
5. **Corrected, not fixed — the two undisclosed gaps** (spare-circuit
   creation, circuit renumbering — no UI call site for either) are now
   listed in the "Not done" block above. Building that UI is new scope,
   not a bug fix, and is left for whoever picks this up next.
6. **Flagged, not fixed — `InheritableTextField`/cable-type override
   cannot express an explicit empty-string override.** Clearing the input
   always resolves back to "inherit" (`onChange(e.target.value ||
   undefined)`), so a circuit cannot override a panel's non-empty
   `circuitDefaults.prefix` to an explicit blank. Low-frequency real-world
   case; the right fix (a separate "override with blank" affordance, or a
   different empty-vs-unset signal) is a small UX design decision, not
   made here.
7. **Not touched — `convertStampToPanel` burns a `panel-<n>` id when
   `createPanelCommand` rejects** (mints the id before the call, discards
   it on `null`). Cosmetic only, an id-counter gap rather than a
   collision, and consistent with a few other id-mint-then-maybe-reject
   sites already in this codebase.

Verified: `pnpm --filter @mepapp/core exec tsc --noEmit`, `pnpm --filter
@mepapp/render exec tsc --noEmit`, `pnpm --filter @mepapp/ui exec tsc
--noEmit` all clean. `pnpm build` at repo root — all 9 workspace tasks
succeeded. `pnpm turbo run test` — 176 core + pdf-engine-mupdf tests
unchanged. No new in-browser walkthrough — the two critical fixes were
verified by reading the exact code paths involved (event emission sites,
handler wiring, `PropertiesPanel.tsx`'s existence guards) rather than a
fresh Playwright run; both failure scenarios described above are
reasoned through, not just asserted.

### Phase E — circuit workflow UI (canvas tools, connection lines, tree, terminal side)

Status: **E1 and E2 done 2026-09-23, E3 done 2026-09-24 (see their Done notes); E4 (Circuits mode and floating toolbar) E5 (tree, menus, halos, delete) and E6 (spares, renumber, bulk edit) and E7 (circuit type editor) done 2026-09-24; E8 not started.** Written 2026-09-23, after the user tested Phase D on Windows and reported: no way to assign terminals to a circuit, no visual indication of what belongs to a circuit, and assigning a circuit to a panel only works through the Networks tab. The user asked for a full investigation of the old app so the gaps did not have to be listed by hand. Four read-only research passes covered the old app's commands, UI entry points and visualization, plus an inventory of what MepApp has today. Findings below. Old-app `file:line` references come from those passes and were not re-checked one by one.

**The finding that shapes this phase.** Phase C built every command the core workflow needs. Phase D built property editors for circuits and panels. Neither built the *canvas-side* workflow that the old app used for almost everything. The old app does circuit work with three canvas features, not with the tree or the Properties panel:

- **Add to Circuit** tool (`Tools/CircuitSelectionTool.cs`, mode `AddTerminals`): the user clicks free terminals on the canvas. Each click runs `AddTerminalToCircuitCommand`.
- **Select Panel** tool (same class, mode `SelectPanel`): the user clicks equipment. Plain equipment is converted to a panel first, then the circuit is assigned to it.
- **Show Circuits** toggle plus `MEP/CircuitConnectionVisualizer.cs`: dashed lines from each terminal to its panel, one palette color per circuit.

MepApp has none of these. Its only assignment paths are the panel dropdown and the per-terminal "Remove" button in the circuit Properties panel.

#### Gap inventory (old app vs. MepApp at `7933ec0`)

| Area | Old app | MepApp today |
|---|---|---|
| Add terminal to circuit | Add to Circuit tool (multi-click on canvas). Create Circuit from the selected terminal. | **No UI.** `addTerminalToCircuit` has no caller. The circuit Properties hint text points at a terminal control that does not exist. |
| Remove terminal | Ribbon button on a selected terminal. | Circuit Properties only. The list shows raw stamp ids. |
| Circuit connection lines | Dashed lines terminal → panel, per-circuit palette, `Show Circuits` toggle. Also drawn on tree selection. | **None.** No circuit rendering anywhere in `render`. |
| Circuit → panel | Select Panel tool. | Dropdown in circuit Properties only. |
| Terminal Properties | No circuit info (old app gap too). | No circuit info. |
| Insert spare | Tree/ribbon "Add Spare". Shifts later numbers up. | No UI. Command exists. |
| Renumber | Number field. A taken number swaps the two circuits. | No UI. Command exists. |
| Bulk prefix/type | "Edit Circuits" mode, tree checkboxes, dialog. | No UI. Prefix command exists. |
| Delete circuit | Tree context menu, Delete key, toolbar. Confirm dialog if it has terminals. | Delete button in Properties only. |
| Tree | Circuit → terminal child nodes. Clicking a terminal node selects it on the canvas. Two context menus. | No terminal children, no context menu on any tree node. |
| Circuit type editor | Full window (name, abbreviation, description, units, default capacity). | None found in the inventory. |
| Panel accessories, `Circuit.properties` editor | Not in old app. | No UI (already listed in Phase D "Not done"). |

**Old-app behavior not to copy.** Circuit-type and load-factor edits bypassed the command stack, so they were not undoable. Load factor was not persisted. Revert-panel and sort-direction had no UI. Deleting a terminal left stale ids in `circuit.terminalIds`. MepApp's stamp-delete cleanup already fixes the last one.

#### Decisions (user, 2026-09-23)

1. **Adding a terminal that is already in a circuit moves it.** The old app rejected this. MepApp lets it happen, because a terminal belongs to at most one circuit. The user must be told when a move happens, but *not* with a dialog that needs a click. Use a **transient toast that disappears on its own**. See E1.
2. **Connection lines show only while the Show Circuits toggle is on**, as in the old app. Nothing draws circuit lines while the toggle is off.
3. **Circuit actions get a dedicated Circuits mode with a floating toolbar (2026-09-24).** The user found that every circuit action sat in the Properties panel or the Networks tab and asked for the equivalent of the old app's Circuits ribbon tab. Agreed design: a **Circuits button on the left rail** (always visible, in every discipline) enters **Circuits mode**. A **floating toolbar** at the top of the canvas shows only in that mode. See E4.
4. **Circuits mode behaves like Select.** A click selects terminals and panels, and a rubber band selects several. It is a real tool (`'circuits'`), so the toolbar and the lines have a clear lifetime.
5. **The Lines toggle turns on when the user enters Circuits mode and off when the user leaves it.** The toggle stays manual inside the mode. This keeps decision 2 (lines show only while the toggle is on) and saves one click.
6. **Empty start.** With nothing selected that belongs to a circuit, only **New circuit** is enabled. The user clicks it, the new empty circuit becomes the current circuit, and **Add terminals** becomes enabled.

#### Contradiction with shipped code that E1 must resolve

`addTerminalToCircuitCommand` (`circuitCommands.ts:75`) returns `null` when the terminal is already in *any* circuit, and it also rejects spare targets. Decision 1 needs a separate **move** command, not a relaxed add. Reasons: the move must be one undo step (remove from the source circuit and add to the target), and the caller must learn which circuit the terminal came from to build the toast. Keep the strict add command unchanged. Keep the spare-target rejection (a spare has no terminals by definition), but surface it as a toast, not a silent no-op.

#### Sub-phases

Order matters. E1–E4 answer the user's three complaints and only need commands that already exist (plus the move command). E4 also adds the toolbar that later sub-phases extend. E5–E8 follow.

**E1 — Move command and toast mechanism (foundation)** — **Done** (2026-09-23, see the Done note after E2's list)
- New `moveTerminalToCircuitCommand(circuits, terminalId, targetCircuitId, terminalName?)`. One undo step. Returns the source circuit id to the caller. Rules: reject a spare target. Same-circuit target is a no-op with a notice. Open detail: the old app advanced the source circuit's `customName` when the removed terminal's name matched it. `removeTerminalFromCircuitCommand` here does not. Decide whether the move should, and keep both consistent.
- New `SketchScene.moveTerminalToCircuit(...)` wrapper that emits `circuitsChanged`, per the Phase D event rule (never ride `drawingChanged`).
- **No toast mechanism exists.** `StatusBar.tsx` only shows zoom, page, units and counts. Add a scene event `'notice'` (`{ message, kind: 'info' | 'warning' }`) so render-side tools can raise messages without React access. Add a small `Toast` component plus hook in `packages/ui`: auto-dismiss (about 4 s), non-blocking, no focus steal, `role="status"` with `aria-live="polite"`, several toasts may stack. The old app used status-bar text for tool hints and rejections. Toasts replace that for one-off events. Persistent tool hints ("click terminals to add, Esc to finish") stay in the status bar or a tool banner.
- Toast copy for a move: name the terminal, the old circuit and the new circuit, for example "Moved ‘T-4’ from L1.3 to L1.5".
- Done when: the command has unit tests for move, undo and the rejections. Real Playwright run shows the toast appears and disappears without a click.

**E2 — Add to Circuit tool, terminal-side circuit section (complaint 1)** — **Done** (2026-09-23, see the Done note after E2's list)
- New tool `'circuit-add-terminals'` in `SketchTool` (`tools/types.ts`), new file `tools/addToCircuitTool.ts`, hit-testing through `ctx.hitTest` like `selectTool`/`placeStampTool`. The active circuit id is scene state set when the tool starts. Cursor: crosshair. Escape leaves the tool and returns to Select, like the placement tools.
- Hover highlight on valid targets: terminals only. A terminal already in another circuit is *valid* (Decision 1) but styled differently, so the user sees a move coming. A terminal already in the active circuit gets a "already in this circuit" notice, no change.
- Entry points: an "Add terminals" button on the circuit Properties panel, and (E5) the circuit tree node's menu.
- **Terminal Properties gets a Circuit section** (`PropertiesPanel.tsx`, single-stamp branch, terminal category only): current circuit label as a link that selects the circuit; a picker to assign or move (circuits grouped by panel, plus "New circuit…"); "Remove from circuit". This also makes the existing hint text in `CircuitPanelProperties.tsx` true.
- "Create circuit from selection": works on one *or many* selected terminals (the old app handled exactly one). One undo step (create plus add).
- Replace the raw stamp ids in the circuit's terminal list with stamp labels. Clicking a label selects that stamp on the canvas (`selectStampById`).
- Constraint: circuit selection and canvas selection are mutually exclusive (`useSketchScene.ts`). The tool must not fight that rule. The tool runs with a circuit selected and leaves the canvas selection empty.

**E1 + E2 Done note — 2026-09-23, commit `924c3cf` on `worktree-electrical-schematic-templates-plan`.**

Shipped:
- `core/circuit.ts`: `findCircuitForTerminal`, `getCircuitLabel` and `planTerminalAssignment` (add / move / already-member / rejected), with 9 new vitest cases (core now 185 tests).
- `circuitCommands.ts`: `assignTerminalToCircuitCommand`. One undo step for add or move. Returns null for rejected and already-member. `addTerminalToCircuitCommand` is unchanged.
- `SketchScene`: `assignTerminalToCircuit` (raises the notices), `createCircuitFromTerminals` (one undo step, create plus add), `beginAddTerminalsToCircuit`, `getCircuitToolTarget`, a `'notice'` event and the `'circuit-add-terminals'` tool (`tools/addToCircuitTool.ts`, hover outline: green free, orange move, grey member). Escape leaves the tool.
- UI: `Toasts.tsx` (self-dismissing after 4.5 s, no click needed, `role="status"`), a tool banner over the canvas, `TerminalCircuitSection.tsx` in single-terminal and multi-terminal Properties (picker with None, circuits by panel and "New circuit…", plus "Show circuit"), "Add terminals…" in circuit Properties, and the circuit's terminal list now shows labels and selects on click.
- Resolved open point 4: a move does not touch `customName`. E2 never auto-names a circuit from its first terminal, so no stale name can remain.
- Fixed while verifying: `App.tsx`'s dock-tab effect now keeps Properties on screen while a circuit or panel is selected and while the Add-to-Circuit tool runs. Before, a `drawingChanged` (Undo) or starting the tool released the dock to the user's previous tab. The Undo case was a Phase D bug this work exposed.

Not done: the circuit tree's own "Add terminals" menu (E5). A terminal's label is only its stamp definition name, so several terminals of one kind look identical in the circuit's list (position or a per-terminal name would fix this; not decided). No hover outline until the pointer has moved over the canvas.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (185 core + 13 pdf-engine-mupdf passed, before the dock-tab fix; core and render are unchanged since). Real Playwright run against the built bundle, driving real DOM and real canvas clicks: add via the tool, move with a toast that disappeared on its own, equipment click warning, one-step Undo/Redo, terminal Properties picker (assign, move, None, New circuit…), multi-select "Assign all to", no page errors. After the dock-tab fix, a second run confirmed that Add terminals… keeps Properties on screen and that Undo keeps the circuit panel in 4 of 4 runs.

**E3 — Connection lines and Show Circuits toggle (complaint 2)** — **Done** (2026-09-24, see the Done note after E3's list)
- New render layer for circuit lines, on the per-document layer set next to `flowLabelLayer` (`document.ts`). Follow the flow overlay's lifecycle: rebuild on change, clear on document swap (`scene.ts` ~1785 pattern). Lines are non-interactive.
- Style from the old app: dashed, about 1.5 px, about 0.85 opacity, drawn below stamps' hit layers. Palette: 11+ colors, one per circuit, wrapping. Assign colors by circuit order in a pure function in `core` so it is unit-testable. Check how existing strokes keep a constant on-screen width across zoom and match that.
- What draws, when the toggle is **on**:
  - Selected terminal → its circuit's lines.
  - Selected panel (or its equipment stamp) → all its circuits, each in its own color.
  - Selected circuit (tree) → that circuit's lines.
  - Circuit with a panel: lines go terminal → panel. Circuit without a panel: star from the first terminal.
- When the toggle is **off**: nothing circuit-related draws. This deliberately differs from the old app, where a tree selection drew lines even with the toggle off.
- Toggle location: MepApp has no ribbon. Proposal: a toggle in the Circuits section header of the Networks tab, mirrored in circuit and panel Properties. Confirm with the user during E3.
- Toggle lifetime. Proposal: it stays on until switched off (session state, not saved in the project file). The old app reset it on every canvas selection change, which is easy to lose track of.
- The old app turned the toggle on after a Select Panel assignment. Decision 5 replaces this: the toggle turns on when the user enters Circuits mode (E4).
- Only terminals on the active page draw lines. Circuits stay cross-page in the data.
- Do not use `drawingChanged` for redraws. Use the `circuitsChanged` path.

**E3 Done note — 2026-09-24, commit `84bed94` on `worktree-electrical-schematic-templates-plan`.**

Shipped:
- `core/circuit.ts`: `CIRCUIT_LINE_PALETTE` (12 colors), `getCircuitLineColor` (color from the number in the circuit id, so it never changes when other circuits are added or renumbered), `getCircuitConnectionLines` (panel → each terminal, or a star from the first terminal when the circuit has no panel) and `resolveCircuitLineTargets` (tree focus plus canvas selection: a terminal shows its circuit, a panel's equipment stamp shows all that panel's circuits). 12 new vitest cases (core now 197).
- `SketchScene`: `setShowCircuitLines`, `setCircuitLinesFocus`, and `drawCircuitLines` inside `redrawOverlay`. The lines are drawn in the existing overlay, so they follow zoom and never reach the PDF. Width (2 px) and dash (7 + 4 px) are in screen pixels. `notifyCircuitsChanged` redraws while the toggle is on, so Undo and Redo update the lines live.
- UI: a "Lines" toggle button in the Networks tab's Circuits row, and a "Show connection lines" checkbox at the top of circuit and panel Properties. Both show one shared state, held in `useSketchScene` and pushed down to the scene. The toggle stays on until switched off. It is session state and is not saved in the project.
- With the toggle off, nothing circuit-related draws. This deliberately differs from the old app, where a tree selection drew lines even with the toggle off.

Not done: turning the toggle on after a Select Panel assignment (E4). Halo rings around a selected circuit's members (E5). A circuit label next to each terminal (E8). Lines only draw for terminals on the active page, because each page is its own document here.

Known oddity, not from E3: clicking the already-selected circuit row in the tree does not switch the dock to Properties, because the selection did not change.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (197 core + 13 pdf-engine-mupdf passed). Real Playwright run against the built bundle, with pixel counts on canvas screenshots: no lines with the toggle off; a star for a circuit with no panel; panel → terminal lines after assignment (the star disappears); two circuits in two colors when the panel is selected; a terminal selection shows only its own circuit; the toggle survives every selection change; Undo and Redo update the lines without reselecting; constant 2 px thickness and 11 px dash period at 62%, 100% and 133% zoom; the tree button and both checkboxes always agree; no page errors.

**E4 — Circuits mode, floating toolbar and Select Panel tool (complaint 3, and the "where are the tools" complaint)** — **Done** (2026-09-24, see the Done note after E4's spec)

Added 2026-09-24. This replaces the earlier "E4 — Select Panel tool". The user tested E1–E3 and asked for the old app's Circuits ribbon tab, because the actions were scattered over Properties and the Networks tab. The old ribbon groups were Circuit Type, Circuits (Create, Add to, Remove from, Select Panel, Remove from Panel, Show Circuits), Panels (Edit Circuits, Apply Edits, Add Spare) and Schematics. Every old button acted on the current selection. The two tools ran until Escape.

*Entry point.* A **Circuits** button on the left rail (`toolRegistry.ts`, singleton row like Stamp, bolt icon). It is always visible. A click runs `setTool('circuits')`.

*Tools.* Three new `SketchTool` values form the "circuits family":
- `'circuits'`: the mode itself. It wraps `SelectTool` (click, Shift-click, rubber band, drag). Escape leaves the mode (to `'select'`).
- `'circuit-add-terminals'`: exists from E2. Escape now returns to where the tool started: `'circuits'` if the user came from Circuits mode, else `'select'`.
- `'circuit-assign-panel'`: new. Click a Panel or Equipment stamp. Equipment is converted through the same steps as `convertStampToPanel`, then the current circuit is assigned. **Convert plus assign is one undo step** (`Transaction`; the old app used two commands). Panel name for a new panel: the stamp's label. No "no segments" restriction (open question 6, dropped). Hover outline: green for a panel, blue for equipment that becomes a panel, none for anything else. Escape returns as above.
- The scene keeps `circuitToolReturn` (`'select' | 'circuits'`), set when a sub-tool starts and cleared by `setTool` for other tools and by `activateInternal`.

*Current circuit.* The toolbar acts on one **current circuit**, resolved in this order: the circuit selected in the tree (`selectedCircuitId`), else the circuit that all selected terminals share, else none. A pure helper in `core` (`resolveCurrentCircuitId`) does the resolution so vitest covers it.

*Toolbar.* A floating bar at the top-center of the canvas. It replaces the E2 banner. The second line of the bar shows the hint text of the running sub-tool and a Done button. Groups:
- **Circuit:** a chip with the current circuit label (a select that changes it), **New circuit**, **Add terminals**, **Remove from circuit**.
- **Panel:** **Assign panel** (starts `'circuit-assign-panel'`), **Remove from panel**.
- **View:** **Lines** toggle.
- Enabling rules: New circuit is always enabled. It creates an empty circuit and makes it current. When terminals are selected, it creates the circuit from those terminals (`createCircuitFromTerminals`). Add terminals and Assign panel need a current circuit that is not a spare. Remove from circuit needs at least one selected terminal that is in a circuit. Remove from panel needs a current circuit that has a panel. A disabled button has a tooltip that says what to do first.
- Later sub-phases add buttons to the same bar: Add spare and Delete (E5, E6), Circuit types (E7).

*Dock.* In the circuits family the dock keeps Properties while a circuit, panel or canvas item is selected, and shows Networks when nothing is selected.

*Lines.* `showCircuitLines` becomes true on entering the family from outside it and false on leaving it. Starting Add terminals from Properties (outside the mode) also enters the family, so the lines show during that tool and hide after it.

*Keep.* The dropdown in circuit Properties, the "Add terminals…" button there, and the terminal Circuit section all stay. They are the detail view. The toolbar is the entry point.

Done when: `resolveCurrentCircuitId` has unit tests. A real Playwright run shows: the rail button enters the mode; with nothing selected only New circuit is enabled; New circuit makes the current circuit and enables Add terminals; Add terminals then Escape returns to Circuits mode with the toolbar still visible; Assign panel converts plain equipment and assigns in one undo step; Remove from circuit and Remove from panel work; the Lines toggle turns on at entry and off at exit; Select on the rail leaves the mode and hides the toolbar; no page errors.

**E4 Done note — 2026-09-24, commit `08ef0c9` on `worktree-electrical-schematic-templates-plan`.**

Shipped:
- `core/circuit.ts`: `resolveCurrentCircuitId` (tool target, then tree selection, then the circuit all selected terminals share; null when ambiguous), 3 new vitest cases (core now 200).
- `SketchScene`: tools `'circuits'` (wraps `SelectTool`, Escape leaves) and `'circuit-assign-panel'` (`tools/assignPanelTool.ts`); `circuitToolReturn` so Escape returns a sub-tool to where it started; `beginAssignPanelToCircuit`; `assignCircuitToPanelStamp` (convert plus assign in one `Transaction`, notices, ends the tool); `removeTerminalsFromCircuits` (one undo step, notice); public `leaveCircuitTool`. Hover outlines for the assign tool: green panel, blue equipment.
- UI: a **Circuits** rail button (`toolRegistry.ts`, `IconBolt`), `CircuitsToolbar.tsx` (circuit picker, New circuit, Add terminals, Remove from circuit, Assign panel, Remove from panel, Lines) with a hint row and Done button, replacing the E2 banner. `App.tsx`: the Lines toggle turns on when the circuits family is entered and off when it is left; the Networks tab opens on entering Circuits mode; the dock keeps Properties while a circuit sub-tool runs. `useSketchScene.ts`: the lines focus also follows the tool's target circuit.
- New circuit does not start Add terminals by itself. The user presses Add terminals next.

Not done: toolbar buttons for Add spare, Delete and Circuit types (they arrive with E5–E7). A circuit picker label is only "number (count)", so "1" can exist both unassigned and under a panel; the group name in the list tells them apart.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (200 core + 13 pdf-engine-mupdf passed). Real Playwright run against the built bundle, real DOM and canvas clicks, all 12 steps passed with no page or console errors: rail button and toolbar enable rules (only New circuit enabled on an empty start), New circuit makes the current circuit, Add terminals then Escape returns to Circuits mode, New circuit from a selected terminal and its one-step Undo/Redo, Remove from circuit with a self-dismissing toast, Assign panel converting equipment in one undo step (plus assigning to an existing panel, Escape, a terminal click warning), Remove from panel, Lines toggle by pixel count, leaving and re-entering the mode, and Add terminals started from Properties.

Known oddities, not fixed: one run under heavy load lost the first canvas click after Add terminals started (not reproduced in clean runs). Clicking an already-selected tree row still does not switch the dock to Properties.

**E5 — Tree: terminal children, context menus, sync** — **Done** (2026-09-24, see the Done note after E5's list)
- Terminal nodes under each circuit. Click selects the stamp on the canvas.
- Right-click menus on tree nodes (none exist today; the canvas menu in `CanvasContextMenu.tsx` is the pattern to reuse):
  - Circuit: Add terminals, Select panel, Insert spare above, Renumber, Remove from panel, Delete.
  - Panel: Add circuit, Add spare, Manage panel.
  - Terminal node: Remove from circuit, Select on canvas.
- "Highlight members" for a selected circuit: because of the mutual-exclusion rule in E2, do **not** implement it as canvas multi-select. Draw halo rings around the member terminals instead, gated by the same toggle as E3 for consistency with Decision 2. Confirm gating with the user.
- Delete circuit: it is undoable, so skip a confirm dialog. Show a toast that says how many terminals were released. Proposal only; confirm with the user. Also add a **Delete** button to the Circuits toolbar (E4).

**E5 Done note — 2026-09-24, commit `29b91fe` on `worktree-electrical-schematic-templates-plan`.**

Decisions applied (user, 2026-09-24: "go with your recommendations"): halo rings only while the Lines toggle is on; delete circuit without a confirm dialog, toast only.

Shipped:
- `NetworkTreePanel.tsx`: each circuit row has a chevron that lists its member terminals. A terminal row selects the stamp on the canvas. A circuit selected in the tree, or a member terminal selected on the canvas, opens its circuit. Circuits are listed in number order, so an Undo of a delete puts the circuit back in its place.
- Right-click menus (`TreeContextMenu`, same look and dismissal as the canvas menu). Circuit: Add terminals, Assign panel, Remove from panel (only when it has a panel), Delete circuit; spares get Delete only. Terminal: Select on canvas, Remove from circuit. Panel: Add circuit, Manage panel, Select equipment on canvas. "Unassigned" header: New circuit.
- `SketchScene.deleteCircuit` now raises a toast ("Deleted circuit L. N terminals released." or "Deleted spare L."). No confirm dialog; Undo restores. A **Delete** button joined the Circuits toolbar. `App.tsx` clears a tree selection that points at a circuit or panel that no longer exists (delete, or Undo of its creation).
- `SketchScene.drawCircuitHalos`: a solid ring in the circuit colour around each member terminal, drawn while Lines is on for the circuit selected in the tree or filled by a running Add terminals tool. A terminal or panel selection draws lines only.
- Moved to E6: Insert spare and Renumber in the circuit menu, because their UI belongs to E6.

Not done: no way to create a spare through the UI yet (E6), so the spare menu and toast were not exercised. The dock leaves the Networks tab on almost every selection, and the tree loses its expansion when it remounts, so the auto-expand is only visible after the user re-expands Electrical. This is the existing dock behaviour (Phase D) and needs its own fix: keep the tree's expansion state above the tab. Panel rows still wrap their icon onto its own line, and "+ Add circuit" sits right-aligned; both come from Phase D CSS and are unchanged.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (200 core + 13 pdf-engine-mupdf passed). Real Playwright run, real DOM and canvas input, 11 of 12 steps passed and 1 blocked (spare, see above), no page or console errors: chevron and terminal rows, click selects on canvas, auto-expand, halo ring pixel counts (308 px in the ring band at each member, 0 at a non-member, 0 with Lines off, lines only for a terminal or panel selection, rings also during Add terminals), all four context menus and their items, Escape and outside-click dismissal, Assign panel and Add terminals from the menu, delete with no dialog and a self-dismissing toast, Undo and Redo, toolbar Delete enable rules, stale selection cleared after Undo of a creation. After the run, the number-order sort, the indent (circuits now nest under their panel) and an aria-label fix were re-checked with a screenshot only.

**E5 follow-up — dock stays on Networks; tree keeps its open rows — 2026-09-24, commit `8c0b758`.**

User request after E5: selecting an element in the Networks tree (any network, not only circuits) must not jump the dock to Properties. Only a click on the canvas does.

Shipped:
- `SketchScene.isCanvasSelectionChange`: true while a selection change runs inside a canvas pointer-down, pointer-up or key-down handler (`asCanvasInteraction` wrapper). Tree selection (`selectStampById`), Undo, Redo and Properties edits are not canvas interactions. `useSketchScene` exposes it as `selectionFromCanvas`.
- `App.tsx` dock effect: it returns early, without touching the dock, for a tree-made stamp selection, for a selected circuit or panel, and while Add terminals or Assign panel runs. The separate "circuit selected → Properties" effect is gone. A canvas click on a stamp, segment or fitting still jumps to Properties.
- `useNetworkTreeExpansion.ts`: the open discipline, network, panel and circuit rows live in `App.tsx`, so they survive the dock unmounting the tree.
- `DockPanel.tsx`: a tab the user clicks by hand cancels the pending restore. Without it, deselecting on the canvas sent the dock back to a tab from before the last force (MEP), not the one the user was on.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (200 core + 13 pdf-engine-mupdf passed). Real Playwright run, real DOM and canvas input, 9 steps: tree selection of circuit-terminal, circuit, panel and network-element rows keeps Networks with the stamp highlighted on the canvas; the panel and terminal menu items keep Networks; a canvas click on a terminal or segment jumps to Properties; open rows survive an MEP round trip and a canvas selection opens its circuit; toolbar flows, tree "Add terminals" and Assign panel keep Networks; Undo and Redo keep Networks (the first run found Undo jumping to Properties, which the canvas-interaction flag fixed); placing a stamp still opens MEP; no page or console errors. Deselecting on the canvas after a manual switch to Networks now stays on Networks (re-run of that step after the DockPanel change).

Not done: Add terminals started from Properties keeps the dock on Properties (the user is already there); Properties edits do not switch tabs.

**E6 — Lifecycle UI for existing commands** — **Done** (2026-09-24, see the Done note after E6's list)
- Insert spare (Circuits toolbar, tree menu, panel and circuit Properties). Renumber field with commit on blur. A swap must raise a toast ("Swapped with L1.4"). Bulk prefix/type edit mode with tree checkboxes. Bulk type edit must go through the command stack, unlike the old app.
- All three commands already exist (`insertSpareCircuit`, `renumberCircuit`, `setCircuitPrefixBulk`). This sub-phase is UI only.

**E6 Done note — 2026-09-24, commit `ebdf809` on `worktree-electrical-schematic-templates-plan`.**

Shipped:
- `core/circuit.ts`: `getSpareInsertion` (before a circuit: takes its number, counts how many circuits move up; after the last circuit of a panel; null for a missing circuit) and `isValidCircuitNumber`. 4 new vitest cases (core now 204).
- `SketchScene`: `insertSpareAt` (one undo step, notice with the number of circuits that moved up), `renumberCircuit` (now returns `'renumbered' | 'swapped' | 'unchanged' | 'invalid'`; a swap raises a warning toast), `applyCircuitBulkEdit` (prefix and/or type on many circuits as one `Transaction`; the type edit is undoable, unlike the old app). `insertSpareCircuitCommand` no longer gives a spare an empty own prefix, so it inherits its panel's (before, a spare in a panel with prefix "L1." showed as "3", not "L1.3").
- UI: toolbar **Add spare**; tree menus "Insert spare above" (circuit) and "Add spare" (panel); circuit Properties "Number" field (commit on blur or Enter, Escape or an invalid value reverts) and "Insert spare above"; panel Properties "Add spare". The tree has an **Edit** toggle: checkboxes on circuit rows, group checkboxes on panel rows and "Unassigned" (mixed state when partly checked), and a bar with prefix, type and Apply. An empty field keeps the current value. The bulk state lives in `useNetworkTreeState.ts` (renamed from `useNetworkTreeExpansion.ts`), so it survives the dock unmounting the tree.

Not done: the toast for a swap names the edited circuit first ("Swapped numbers: circuit 1 and circuit 3."). The Circuits toolbar wraps onto several rows at some widths (icons are the planned fix, see E8); after the run its chip and spacing were tightened, and that change was not re-measured. The panel row's icon still wraps onto its own line, and the tree is wider than the dock (440 px in 400 px), both from Phase D and unchanged. The chip lists a panel circuit and an unassigned circuit with the same number identically, apart from their terminal counts.

Verified: `pnpm build` (9 of 9 tasks), `pnpm turbo run test` (204 core + 13 pdf-engine-mupdf passed). Real Playwright run, real keyboard and mouse input, steps 1 to 11 all passed with no page or console errors: toolbar Add spare (toast, shift, one-step Undo/Redo, disabled with no circuit and while a tool runs), tree and Properties spare buttons, spare menu and "Deleted spare" toast, panel prefix inherited by spares (L1.x labels), renumber by Enter and Tab (free number, swap with toast and one-step Undo, 0, negative, empty, fractional and Escape all revert, separate numbering for the unassigned pool), bulk edit (prefix only, type only, both, one-step Undo, group checkbox and its mixed state, state kept across tabs), row click versus checkbox click. After the run, the panel checkbox was moved before the chevron so the two checkbox columns line up (checked in a screenshot).

**E7 — Circuit type editor**

**Done 2026-09-24, commit `fef41bb`.**
- Core: `getCircuitTypeUsage` (circuits and panel defaults that use a type) and `validateCircuitTypeFields` (name required and unique ignoring case, abbreviation required, capacity a number of 0 or more), 3 new tests (207 core tests).
- `SketchScene`: `createCircuitType`, `updateCircuitType` (returns the refusal reason; a built-in type is copied into the document on first change), `deleteCircuitType`, `resetCircuitType`. Circuit types live in `doc.circuitTypes`, not in the undo history, so these edits are direct and not undoable, like the network type edits. They raise `circuitsChanged`, which marks the document dirty and refreshes the UI.
- Decisions: a built-in type can be changed and reset but not deleted (the library always shows). A user type cannot be deleted while a circuit or a panel default uses it; the dialog shows the usage and disables Delete. This means no circuit is ever left with a type that is gone, and no dangling id can come back through Undo. The old app allowed a delete only while another type remained; that rule does not apply because the built-ins always remain.
- UI: `CircuitTypesDialog.tsx` (list, form with Save and Revert, other rows disabled while a draft is unsaved), toolbar "Circuit types" icon button in a new "Setup" group (`IconCircuitTypes`).
- Two bugs found by the browser run and fixed in the same commit: (1) on a fresh document the type list was empty until the first circuit edit (the hook's initial state was `[]`; now the built-in library); (2) Escape in a dialog also left Circuits mode, because the scene listens on `window` (`Dialog.tsx` now stops the Escape event after it closes).
- Verified: `pnpm build` (9 of 9), `pnpm turbo run test` (207 core + 13 pdf-engine-mupdf). Real Playwright runs, real input: edit, validation (blank, duplicate in any case, blank abbreviation, negative/blank/non-numeric capacity), Reset to built-in, New, unique default name, Delete, in-use blocking by a circuit and by a panel default, rename showing in the Properties select and the tree row abbreviation without reload, save to PDF and reload keeps the edited built-in and the user type, toolbar one row at 1500, 1200 and 1000 px, no page errors. Checks 1 and 9 failed at first and passed after the two fixes above.
- Not done: the tree row shows the type abbreviation only, not the name; the dialog has no `role="dialog"`; renaming a type to a different case of its own name is accepted; no entry to the dialog from the Properties type select.
- Add a **Circuit types** button to the Circuits toolbar that opens the editor (the old app had a Circuit Type group on the Circuits tab).
- The inventory found no create/update/delete command for `CircuitType` in `circuitCommands.ts`. Verify, then add commands plus an editor (name, abbreviation, description, units, default capacity). The old app allowed deleting a type only while another type remains.
- Decide what happens to circuits that reference a deleted type.

**E8 — Later / optional**
- ~~Circuit label next to each terminal (for example "L1.3").~~ **Moved 2026-09-24 (user decision) to the canvas Label feature**, which has not started; see the "Label visibility controls" row in `ui-atlas-layout-mapping.md` §6. The old app never had this label. New work, not a port.
- Carried from Phase D "Not done": `PanelAccessory` add/remove UI, `Circuit.properties` editor, explicit-blank override affordance.
  - `PanelAccessory` add/remove UI: **discarded 2026-09-24** (user decision). The scene methods stay; no screen uses them.
  - Click a member terminal to remove it (below): **discarded 2026-09-24** (user decision).
  - **`Circuit.properties` editor and explicit-blank override: Done 2026-09-24, commit `d2e736c`.**
    - Custom circuit properties: the Global Properties dialog has a third tab "Circuit" (per-install definitions in the same localStorage entry, `GlobalPropertyDefs.circuit`). Circuits have their own reserved names (`RESERVED_CIRCUIT_PROPERTY_NAMES`, core). The dialog validates every tab, so an error on one tab disables Save on all. `applyCustomPropertyCascade` takes `'circuit'`: a new definition gives every existing circuit its default, and a removed one is dropped, as one undo step. Circuit Properties shows a "Custom" section (a circuit without a stored value shows the definition's default).
    - Explicit blank: the panel default already showed grayed in an inheriting field (placeholder, "(panel default)" label, ↺), so only the blank was missing. For the Prefix and Cable > Type text fields, clearing a field that has been typed into now stores `''` when the panel default has text. The label then reads "(blank, panel default overridden)" and ↺ returns to inheriting. When the panel has no default text, clearing still means "inherit". Core already used `??`, so no core change was needed. Number and select fields have no blank override.
    - Verified: `pnpm build` (9 of 9), `pnpm turbo run test` (210 core + 13 pdf-engine-mupdf; 3 new core tests). Real Playwright run: inherit look, type, clear, ↺, Cable type, panel without default, save and reopen keeps the blank, UI Undo/Redo of the blank override in one step; the Circuit tab (16 reserved names, "capacity" allowed there, empty and duplicate names, error on another tab), defaults applied to existing and later circuits, typed text and numeric values persist, a definition added later, definitions survive a reload, values survive save and reopen, removing a definition. No page errors in the runs that printed them.
    - Not done or not verified: Undo restores circuit values but not the definition (it lives in localStorage; same for terminals). Clearing a numeric custom field gives 0 (same as terminals). The Undo button can stay disabled right after a definition change in a document with no other edits (same for terminals). The long blank-override label wraps to two lines. A fresh browser without the definitions was not tested.
- **Icons on the Circuits toolbar buttons** — **Done** 2026-09-24, commit `85e2eac`. Requested by the user, and brought forward before E7 because the text toolbar wrapped onto several rows. Every action is now an icon-only `ToolbarIconButton` (`CircuitsToolbar.tsx`; 8 new icons in `icons.tsx`) whose label is its accessible name and the start of its tooltip ("Label — what it does now, or why it cannot"). Below 1100 px window width the group labels (Circuit, Panel, View) hide. Same commit: the Networks tree rows use `box-sizing: border-box` (the tree was 440 px wide in a 400 px dock) and the panel row's icon stays on the name's line (both were Phase D CSS). Verified: `pnpm build` (9 of 9 tasks); real Playwright run; the toolbar is one row at 1500x900, 1200x800 and 1000x700 (the first run failed at 1000x700 with the View group on a second row, then passed after the labels were hidden; only 1000x700 was re-measured); every button works by role and name; enable rules, `on` states, keyboard (Tab, Enter, Space) and tooltips are unchanged; icons checked in a screenshot; no page errors. Not done: two icon pairs differ only by a small mark (Add and Remove terminals, Assign and Remove panel). E7's button needs an icon too.
- Click a terminal already in the active circuit to *remove* it (old-app gap). Not requested. Only if the user asks.

#### Verification plan
- `render` has no test infrastructure, and the new command sits in `render`. Put pure logic in `core` where vitest runs: color assignment, which-circuit-owns-terminal lookup, valid-target rules. Keep the move command's rules in a `core` helper if practical, so they are unit-tested.
- UI wiring must be checked by driving real DOM inputs and real canvas clicks in Playwright, not through the scene API (see memory note on the onBlur bug). Use the known Playwright gotchas: a sheet is required before stamps, neutralize `showOpenFilePicker`, use `.mep-stamp-tile`, there is no Ctrl+Z shortcut, and `mouse.click` has no modifiers option.
- Each sub-phase ends with the same evidence set as Phase D: three `tsc --noEmit` runs, root `pnpm build`, `pnpm turbo run test`, plus a stated list of what was and was not checked in a browser.

#### Open points for the user
1. Toggle location and lifetime (E3). Proposals above.
2. Whether halo rings and any other circuit visuals are gated by the toggle (E5). Proposal: yes.
3. Delete circuit without a confirm dialog (E5). Proposal: yes, toast only.
4. Whether a move should adjust the source circuit's `customName` (E1).

## 11. Non-goals for v1

- Nested panels (`parentPanelId` exists as a reserved, unused field in the old app too — leave it out until a real need appears).
- Enforcing "equipment must have zero segments before becoming a panel" at the domain layer, or anywhere else — open question 6, resolved 2026-09-23: dropped entirely, not carried forward.
- Any schematic drawing or template concept — that is entirely electrical-schematic-templates.md's scope.

## 12. Open questions

All 7 resolved 2026-09-23, ahead of Phase B, after Phase A's types landed.

1. Should `Panel.circuitIds` be authoritative or derived on the fly from `Circuit.panelId` (avoiding two sources of truth, same tradeoff `network.ts`'s doc comment calls out for its own decision to derive network membership rather than store it)?
   **Resolved: derived.** `network.ts`'s own precedent for exactly this tradeoff was decisive. `Panel.circuitIds` is dropped from the type; `getPanelCircuitIds(panel, circuits)` in `circuit.ts` derives it. `computePanelCapacity` updated to filter by `Circuit.panelId` directly instead of consulting a stored list.
2. Exact `phase` representation — the fixtures show single-phase circuits only; how does a three-phase circuit's `phase` field look? (Same as electrical-schematic-templates.md open question 3 — resolve together.)
   **Not resolved — still blocked** on electrical-schematic-templates.md's Phase 0 mockup, which hasn't run yet. Deciding now risks a redo once that review lands. `Circuit.phase` stays provisional as shipped in Phase A.
3. `device`/`cable` field shapes are provisional (§5) — confirm after the mockup review.
   **Not resolved — same blocker as #2.** Both stay provisional as shipped in Phase A.
4. Does `removeCircuitFromPanelCommand` keep the old app's behavior of deleting a spare outright, or return it to the unassigned pool like any other circuit?
   **Resolved: keep the old app's behavior** — a spare is deleted outright on panel removal; a non-spare circuit returns to the unassigned pool. User's explicit choice, against this plan's own recommendation (returning every circuit to the pool for consistency) — no code change needed yet, this shapes `removeCircuitFromPanelCommand` in Phase C.
5. Should `PanelAccessory.kind` be a closed enum or free text? The fixtures show current transformers, a meter, and a surge protector; there may be more per country.
   **Resolved: free text**, as already shipped in Phase A (`kind: string`) — matches the plan's own observation that the accessory set varies per country and isn't closed.
6. Carry forward the old app's "equipment must have zero segments to become a panel" UI-layer restriction, or drop it?
   **Resolved: dropped.** Not carried forward at the domain layer (never was) or the UI layer (was, in the old app). No restriction anywhere in MepApp's panel conversion.
7. Where do `CustomPropertyDefinition`-style custom annotations (electrical-schematic-templates.md §6, "Custom annotation" building block) attach — to the `Circuit` record directly, or reuse the existing per-installation custom-properties mechanism (`custom-properties.ts`), scoped to circuits instead of stamps?
   **Resolved: reuse `custom-properties.ts`, scoped to circuits.** One editing mechanism instead of two. `Circuit` gained a `properties?: CustomPropertyValues` field in Phase A (reusing the existing type as-is). Generalizing `custom-properties.ts` itself — its `RESERVED_PROPERTY_NAMES`/`isReservedPropertyName` are currently stamp-only (`'x position' | 'y position' | 'rotation' | 'capacity'`, none of which are meaningful reserved names for a `Circuit`) — is deliberately left to whichever phase builds the circuit properties UI (Phase C for the command, Phase D for the panel), since it requires auditing every current call site of those exports first.
