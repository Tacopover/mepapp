# Networks panel — spec (for a future session)

Ships as an empty placeholder tab now (see `header-toolbar-consolidation.md`). This document is the spec for building it for real later, informed by investigating `/root/MepSketcher`'s equivalent panel per the user's request.

## 1. Source investigated

`/root/MepSketcher/MEPSketcher2/`:
- `Views/NetworkTreePanel.xaml` — the panel's XAML (templates per tree-node type)
- `Models/NetworkTreeItem.cs` — the node model + `TreeItemType` enum
- `ViewModels/NetworkTreeViewModel.cs` — tree operations (add/remove/find/rename)
- `ViewModels/NetworkTreeCoordinatorViewModel.cs` — wiring to the live domain model and canvas selection

## 2. What the old panel actually does

**Structure** — a tree, root always showing all 6 disciplines (even empty ones):

```
Discipline (Ventilation | Plumbing | Heating/Cooling | Electrical Pathways | Electrical Circuits | Fire Protection)
└─ Network (renamable, shows "(N elements)")
   └─ Element (Terminal | Equipment)                          — 5 of 6 disciplines
   └─ CircuitTypeGroup (e.g. "230V")                           — Electrical Circuits only
      └─ Panel (e.g. "Panel 1", shows "(N)")
         └─ Circuit (e.g. "C-1 – Terminal Name", can be "spare")
            └─ CircuitTerminal
```

This maps exactly onto `@mepapp/core`'s existing `Discipline` union (`network.ts`) — same six values, confirming that type was the right one to reuse rather than inventing a UI-only one (see `packages/ui/src/disciplineGroups.ts`'s note on this).

**Behaviors**:
- **Bidirectional selection sync.** Clicking a tree node highlights + selects the matching element on the canvas. Selecting on canvas highlights the matching tree node(s) and expands every ancestor so the node is visible. (`OnMepServiceElementSelected`, `SelectItemInTree`, `OnSelectionManagerChanged` in the coordinator.)
- **Inline network rename.** Double-click a network's title to edit it in place; commit on Enter/blur, cancel on Escape. (`RenameNetwork`/`CommitNetworkRename`/`CancelNetworkRename`.)
- **Live rebuild.** The tree rebuilds from the domain model on every network/element change event — it's not a one-time snapshot. (`OnNetworkUpdated` → `RebuildNetworkTreeFromMepService`.)
- **Electrical Circuits extras**: delete a circuit (context menu), mark a circuit "spare" (greyed/italic, no delete), and a bulk "Edit Prefixes" mode — checkboxes appear on every Circuit node, letting the user multi-select circuits and apply one prefix rename across all of them (`IsPrefixEditModeActive`, `ApplyBulkPrefixCommand`).
- **No search/filter box** existed in the old panel — pure tree browsing.
- A "Network Actions" gear button was drawn in the panel header but shipped disabled/hidden (`Visibility="Collapsed"`) — the old app never finished whatever it was for. Not worth reproducing blindly; if a network-level action menu is wanted here, design it fresh rather than guessing at the old app's unfinished intent.

## 3. Gap vs. `@mepapp/core` today

| Old app concept | MepApp equivalent | Status |
|---|---|---|
| `Discipline` enum | `Discipline` (`network.ts`) | Already real, identical 6 values |
| `Network` | `Network` (derived via `computeNetworks`) | Already real |
| `Terminal`/`Equipment` (tree leaves) | `PlacedStamp` (`stamp.ts`) | Already real |
| `Circuit`, `Panel`, spare-slot flag, prefix editing | — | **Does not exist at all.** This is new domain modeling in `@mepapp/core`, not a UI task — mirrors the old app's `MepSketcherTools/MEP` `Circuit`/`Panel`/`CircuitService`. |

## 4. Proposed scope, split in two phases

**Phase 1 — the 5 non-circuit disciplines' tree.** Fully buildable against what already exists:
- `SketchScene.getNetworkSummaries()` and `SketchScene.listStamps()` (both already built this session, currently unused since the Layers tab they were written for was replaced by this Networks placeholder) supply the Discipline → Network → Element data.
- Rename-network needs one new `SketchScene` method (e.g. `renameNetworkType(networkTypeId, name)`) — `NetworkType.name` already exists as a field, just nothing sets it from the UI yet.
- Bidirectional canvas↔tree selection sync needs: tree click → call the existing selection mechanism (there's currently no `selectStampById`-style method on `SketchScene`; add one), and canvas selection → tree already gets `selectionChanged` events to react to.

**Phase 2 — Electrical Circuits branch.** Blocked on real domain modeling first: `Circuit`/`Panel` types in `@mepapp/core`, a way to assign a placed stamp to a panel/circuit, and a spare-slot concept. Don't start the UI for this branch before that modeling exists — it would be exactly the "untyped placeholder" anti-pattern the original sketch-canvas plan called out.

## 5. What ships now (via `header-toolbar-consolidation.md`)

An empty Networks tab containing only the "Solve Flow" button + its result (both already fully functional today, just relocated from the old actionbar) and a plain "Network tree — coming soon" message. No fabricated tree, no fake data.

## 6. Open decisions for whoever picks this up

- **D1 — rename UX.** Inline double-click-to-edit (old app's pattern) vs. a name field in the Properties panel when a network is the "selection." Old app's pattern is proven; only reason to deviate is if MepApp's selection model doesn't cleanly support "a network is selected" as a concept yet (today, selection is stamps only).
- **D2 — does Phase 2 happen at all soon?** Confirm whether Electrical Circuits parity is a near-term goal before investing in `Circuit`/`Panel` domain modeling — it's a meaningfully sized addition to `@mepapp/core`, not a small one.
- **D3 — tree component.** A plain recursive React component is enough for this tree's size and behavior; no tree UI library is needed.
