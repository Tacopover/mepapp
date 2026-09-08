# UI component atlas → current layout mapping

Source: the "MEPSketcher Feature Atlas" artifact (a survey of the **legacy WPF app**,
not a design for MepApp) — every ribbon tab, dialog, tool, and domain concept it has.
Goal: give every one of those UI-facing items a home in MepApp's current layout
*before* any of it is wired to real logic, so later work is "fill in this slot"
rather than "figure out where this even goes."

This is a location-scoping document, not an implementation plan. It does not
duplicate `drawing-tools-round-out-spec.md` or `networks-panel-spec.md` — where
those already made a location decision, this doc just cross-references them.

**Rev A → Rev B:** Rev A shipped this mapping with six open decisions and a
Toolbar design that stacked every new tool onto today's floating pill (~15
buttons, one row). Rev B resolves all six after review — see §9. The headline
change: tools now live on a new **left-edge vertical rail**, grouped and
expandable, not stacked onto the floating Toolbar. The floating Toolbar itself
survives, repurposed as a small "Quick access" strip.

**Rev B → Rev C:** two refinements from a second review pass:
1. The **Network Type selector** moves off the rail into the **Stamps** dock
   tab, as a second section sharing that tab's existing discipline filter —
   network types are a discipline-filtered library, same as stamps, not a
   per-gesture tool-mode toggle. See §4.
2. The **Quick-access strip** is corrected to a true last-N-*used* list
   (chronological, deduplicated, capped at N), not one slot per rail group —
   using Terminal then Equipment shows both, since both were actually used,
   rather than collapsing to one "Place group" representative. See §3.

## 1. Current layout baseline (what exists today)

- **Header bar** (`App.tsx` `mep-header`) — Menu dropdown, sheet title, status text. (The disabled "Log in" stub button is removed as of Rev B — see D6.)
- **Menu dropdown** (`MenuButton.tsx`) — Open PDF, Save project, Load project, Sync to PDF, Download PDF.
- **Floating Toolbar** (`Toolbar.tsx`, draggable, over canvas) — 3 groups: [Select, Pan], [Place stamp, Segment], [Calibrate, Measure], plus Undo/Redo. **Rev B:** this becomes the Quick-access strip (§4).
- **Dockview dock** (`DockviewShell.tsx`, resizable, right side, tabs can float/split/reopen/hide) — 4 tabs: Stamps, Drawings, Networks (placeholder), Properties.
- **Status bar** (`StatusBar.tsx`, bottom) — zoom, units, scale, last measurement, segment/fitting/network counts, scale-bar graphic, selected count.
- **One ad hoc modal** (`App.tsx` `mep-modal-backdrop`/`mep-modal`) — calibration distance prompt. Still the only dialog in the app; the shared Dialog component (D2) hasn't been built yet.
- **Footer** — AGPL corresponding-source link.

The dock system (Dock / Float / planned Hide, per `dock-hide-mode.md`) is the
established home for anything panel-shaped. The Menu dropdown is the established
home for anything file/app-level. As of Rev B, the new **left rail** is the
established home for canvas-gesture tools; the floating Quick-access strip is a
convenience layer on top of it, not a separate tool inventory.

## 2. Legend

- **Have** — exists today.
- **Spec'd** — location already decided in an existing plan doc; cross-referenced, not repeated here.
- **New** — no location decided yet; this doc assigns one.
- **Blocked** — needs domain modeling in `@mepapp/core` first (not just a UI slot).
- **Deferred** — intentionally not being built right now; see §10 for why each one is deferred.

## 3. The left rail (Rev B — replaces the old "stack everything on the Toolbar" plan)

**Design, as decided:** a vertical strip anchored to the canvas's left edge.
Each row is a *group* of related tools, collapsed to whichever tool in that
group was used most recently (that becomes the row's default icon). Clicking
the row's chevron opens a flyout to the right listing the rest of that group;
picking one there closes the flyout and makes that tool the row's new default.
This keeps the whole tool set — including everything new in §5–§7 below — in a
fixed-width strip instead of a ever-widening horizontal bar.

Proposed grouping (functional grouping was specified; exact membership is a
small detail to confirm during implementation, not a blocking decision):

| Rail row | Default (shown collapsed) | Flyout members |
|---|---|---|
| Select & Edit | Select | Move, Copy, Rotate, Delete |
| Pan | Pan | *(single tool, no flyout)* |
| Place | Terminal | Equipment |
| Draw network | Segment | Snap Angle selector, Create Connection |
| Annotate | Freehand | Line/Arrow, Rectangle/Circle, Textbox, Sticky Note, Text Highlight, Polyline |
| Measure | Calibrate | Measure |
| Undo/Redo | *(both always shown, not a group)* | — |

Network Type selection is no longer a rail row — **Rev C** moves it to the
Stamps dock tab (§4).

**Quick-access strip.** The existing floating Toolbar (draggable, already has a
resize precedent via the dock's own resize handle) survives as a small
secondary surface. **Rev C:** it shows the last N tools actually activated —
a plain chronological most-recently-used list, deduplicated (re-activating a
tool moves it to the front rather than adding a second copy) and capped at N
(5 by default, user-resizable). This is deliberately a *separate* piece of
state from each rail row's "which member was picked last" — using Terminal
then Equipment shows **both** in the strip, since both were actually used,
rather than collapsing to one "Place row" representative the way the rail
itself does. Two small pieces of state, one shared source of tool-activation
events.

## 4. Where §3's rows come from (mapping the atlas onto them)

### MEP Elements tab

| Item | Status | Location |
|---|---|---|
| Select tool | Have | Rail: Select & Edit row (default). |
| Copy / Paste / Delete | New | Rail: Select & Edit row's flyout (Copy, Delete) + keyboard shortcuts (Ctrl+C/V, Delete) for all three. |
| Rotate CW/CCW | New | Rail: Select & Edit row's flyout, **and** two ±90° nudge buttons next to the existing Rotation field in the Properties dock tab — both, since rotate is reached both as a tool and as a selection edit. |
| Terminal tool / Equipment tool | **Spec'd** | `drawing-tools-round-out-spec.md` Part A — Rail: Place row (Terminal default, Equipment in the flyout), still opening the existing category-filtered Stamps dock tab. |
| Shared stamp picker | Have | The Stamps dock tab. |
| Segment tool | Have | Rail: Draw network row (default). |
| Network Type selector | New — **moved, Rev C** | Stamps dock tab, new "Network Types" section below the stamp grid, sharing the tab's existing discipline filter (`DisciplineSwitcher`). Clicking a type sets it "active," exactly like clicking a stamp definition does today (`activeDefinitionId`); the rail's Segment tool then draws with whatever is active. Same interaction shape as Terminal/Equipment, just a second library in the same tab instead of a rail flyout. |
| Create Connection (hidden segment) | New | Rail: Draw network row's flyout. |

### Annotations tab — **Spec'd** location updated for the rail

`drawing-tools-round-out-spec.md` Part C scopes the data model (new annotation
store, Command-based create/undo) and four distinct `SketchTool` values. Rev A
put those on a 4th Toolbar group; Rev B moves them to the **Annotate** rail row
(Freehand default; Line/Arrow, Rectangle/Circle, Textbox, Sticky Note, Text
Highlight, Polyline in its flyout). Textbox's text entry stays a floating input
over the canvas, not a dialog.

### Manage tab

Unaffected by the rail change — still Menu-triggered, still needs the shared
Dialog component (D2, confirmed):

| Item | Status | Location |
|---|---|---|
| Extract Images | New | Menu → Manage → dialog. |
| Manage Buildings… | New | Menu → Manage → dialog. |
| Export Takeoff to CSV | New | Menu → Manage, small scope popover (sheet/level/building). |
| Snap Angle selector | New | Rail: Draw network row's flyout (moved here from "Toolbar group 3" in Rev A). |
| Settings | New | Menu → Manage → dialog. |
| Global Properties | New | Menu → Manage → dialog. |
| Debug tools | New | Menu, dev-flag gated. |

### Circuits tab → Networks dock tab (unchanged from Rev A)

Still blocked on `Circuit`/`Panel` modeling per `networks-panel-spec.md`.
**Rev B:** Schematic generation is additionally marked **Deferred** — not
needed until Circuit/Panel modeling itself is prioritized (D5).

| Item | Status | Location |
|---|---|---|
| Circuit Type / Create / Panel assign | Blocked | Networks tab, Electrical Circuits branch. |
| Show/Hide Circuits | Blocked | Toggle in the Networks tab header. |
| Bulk circuit editing | Blocked | Contextual row inside the Networks tab. |
| Schematic generation | Deferred | Own subsystem, revisit once Circuit/Panel work is scheduled (D5). |

## 5. Dialogs & windows

Confirmed direction (D2): one shared Dialog component, reused everywhere
below, instead of each dialog hand-rolling the calibration prompt's ad hoc
backdrop pattern.

| Item | Status | Location |
|---|---|---|
| Duplicate Document / Missing Image | New | Shared Dialog, auto-triggered on a file-integrity issue at load. |
| Network Type Editor | New — **moved, Rev C** | An edit affordance (e.g. a small pencil icon) on each card in the Stamps tab's new Network Types section, next to where the type is picked. |
| Symbol Creator | Deferred | Own subsystem — not needed at the moment (D5); revisit alongside Schematic generation. |
| Legal / privacy page | New | Menu, bottom "Info" section. |
| Update Available | New | Dismissible banner, reusing the existing reconciliation-banner pattern in `App.tsx` — not a modal. |
| Welcome & onboarding | New | Full-screen, once per install, first thing shown on launch (no longer gated behind a license step — see D6). |

**Removed in Rev B (D6):** License gate and User profile are no longer part of
this map — see §10. They're not "New" items waiting for a slot; they're
explicitly out of scope for now.

## 6. Workspace & status bar

| Item | Status | Location |
|---|---|---|
| Properties panel | Have | Properties dock tab. |
| Multi-tab PDF viewer | Have (tabs) / Deferred (split panes) | Tab-switching already works. Side-by-side split panes: **not on the roadmap** (D3) — not scoped further. |
| Network Tree panel | **Spec'd** | `networks-panel-spec.md` — Networks dock tab. |
| Page navigation & zoom controls | New, low priority | Status bar. The engine already supports multi-page PDFs (`getPageCount`, `pageIndex`) — `SketchScene` just never uses it. Confirmed low priority, to be added after the other basic features (D4). |
| Live coordinate readout | New | Status bar, next to the zoom chip. |
| Label visibility controls | New | Status bar — toggle + per-type filter dropdown. |

**Removed in Rev B (D6):** Offline-mode indicator — see §10.

## 7. Decisions — Rev B: all six resolved

- **D1 — Toolbar size. Resolved: left rail, grouped + expandable, plus a
  Quick-access strip.** See §3 for the full design and grouping table. The
  floating Toolbar is repurposed rather than removed — it becomes a
  user-resizable convenience strip, not the primary tool surface.
  **Rev C amendment:** the strip is a true last-N-*activated* list (any tool,
  deduplicated, capped at N), not one representative per rail group — see §3.
- **D2 — Reusable Dialog component. Confirmed**, no changes to the Rev A
  proposal — build it against the simplest target first (Settings), reuse for
  every dialog in §5.
- **D3 — Split-pane multi-doc view. Resolved: not on the roadmap.** Tab-
  switching (already built) is what ships. Not scoped further.
- **D4 — In-document page navigation. Resolved: low priority, after the other
  basic features.** Kept in §6 as a placeholder row, not pulled forward.
- **D5 — Schematic generation & Symbol Creator. Resolved: not needed at the
  moment**, will be added later. Both marked Deferred in §4/§5 rather than
  New/Blocked.
- **D6 — Account/licensing timing. Resolved: remove license-related UI from
  the app for now.** MepApp is currently positioned as an open-source app;
  licensing for future paid features may come later but has no UI footprint
  today. Concretely: the header's disabled "Log in" stub button is removed
  (`App.tsx`, `theme.css` — done in this revision), and the offline-mode
  indicator and license gate are dropped from this map entirely (§10).

No open decisions remain from this pass.

## 8. Explicitly out of scope

- **Multi-user collaboration, room/area detection, AI-assisted design** — the
  atlas's own "not yet built" list. No stub exists anywhere, including in the
  legacy app.
- **Licensing/account UI** (D6) — login, user profile, license gate,
  offline-license indicator. Not because they're hard, but because this phase
  of the project is focused on the open-source app itself; licensing for
  future paid features is a later, separate decision.
- **Side-by-side split-pane document view** (D3) — not on the roadmap.
- **Schematic generation & Symbol Creator** (D5) — real subsystems, deferred
  until Circuit/Panel domain modeling is prioritized.

None of these are given a layout slot. Revisit each only once it becomes an
active goal.

## 9. What this unblocks

Every atlas item now has a location, a cross-reference, a "blocked on domain
modeling" flag, or an explicit "deferred, and here's why" — and every decision
raised in Rev A has an answer. Suggested next step, unchanged from Rev A: pick
one section (the stamp-tool split in `drawing-tools-round-out-spec.md` Part A
is already spec'd and the smallest unit of real work) rather than building
toward this whole map at once.
