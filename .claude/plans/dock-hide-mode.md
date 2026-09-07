# Dock "Hide" mode — implementation plan

Follow-up to `dockable-panel-system.md` (Decisions-Log 2026-09-07: `DockPanel` replaced with `dockview`). That work covered Dock and Float; the old `DockPanel`'s third mode — collapse to a small reopenable edge tab — was called out as a known gap, not built. This is the plan for building it.

## 1. Why this needs its own investigation, not just "add a button"

Dockview's only built-in collapse-to-strip mechanism — `pinEdgeGroup()` / `autoHideEdgeGroup()` / `peekEdgeGroup()` on edge groups — is **Dockview Enterprise-only**, confirmed directly against the library's own docs:

> "These methods require the enterprise auto-hide edge groups feature." — `autoHideEdgeGroups.mdx`
> "Dockview Enterprise offers additional capabilities for edge groups, specifically auto-hide functionality and the ability to dock content directly to edge groups." — `licence.mdx`

This project's `CLAUDE.md` rules out paid/non-free dependencies in the tree. So Hide can't reuse the library's native mechanism the way Dock/Float reused native drag-and-drop and splitting — it has to be built on the free tier.

## 2. What Hide needs to do (old `DockPanel`'s behavior — the bar to match)

- Collapses the dock down to a small vertical clickable strip showing the active tab's label.
- Clicking the strip restores it, always back to **docked** (not floating), regardless of which mode it was in before hiding.
- New wrinkle old `DockPanel` never had to deal with: today's dock can be split into multiple independent groups (per `dockable-panel-system.md`'s D1). Old `DockPanel` only ever had one group, so "hide the dock" and "hide the one group" were the same thing — that's no longer true.

## 3. Two approaches investigated

### Approach A — remove, stash, re-add (recommended)

On Hide: capture the group's panel ids (in tab order) and which one was active, call `group.api.close()` (removes the group and disposes its panels — confirmed by the method's signature and the `onDidRemoveGroup`/`onDidRemovePanel` events it fires), and push an entry onto a small `hiddenGroups` list held in `DockviewShell`'s own state. Render one small edge-tab strip per hidden entry, outside dockview's own DOM, inside `.mep-dockview-root`.

On click: `containerApi.addPanel(...)` once per stashed tab id — first with no `position` (creates a fresh group), the rest with `{ referencePanel: firstId, direction: 'within' }` (restacks them as tabs of one group, reconstructing how they were grouped before hiding) — set the previously-active one active again, drop the entry from `hiddenGroups`.

**Tradeoff:** `close()` disposes the panels, so restoring remounts `DockContentSlot` and, through it, the real panel component (`StampsPanel` etc.) fresh. Since all four panels' content is driven by props/context owned by `App.tsx` (no meaningful uncontrolled local state), the only real loss is something like a scroll position inside the Stamps grid — acceptable today.

**Persistence:** dockview's own `toJSON()` never contains a closed panel, so the existing `localStorage` layout save/restore (`dockable-panel-system.md` D2) already does the right thing for a hidden panel — it's just absent. The `hiddenGroups` list itself needs its own small `localStorage` entry (e.g. `mepapp.dockHidden.v1`) alongside the layout key, read back on mount, so a hidden panel doesn't silently reappear docked after a reload.

### Approach B — resize the live group down to a strip in place

Uses `GridviewPanelApi.setConstraints()` / `setSize()` — confirmed present in the free `dockview-core` package's own type declarations, not gated — to shrink a group's width to ~28px without removing it from dockview's model, so its panels stay mounted (no remount, no state loss).

**Tradeoff:** dockview still renders that group's normal tab strip and content area inside the 28px sliver — there's no library hook to swap in a custom "collapsed" visual for a still-live group, so making it actually look like a clean vertical edge tab (rather than a broken, squished panel) means fighting dockview's own tab-bar/close-button/content CSS at that width. It also isn't uniform: a group collapsed inside a left/right split needs width-collapse, one inside a top/bottom split needs height-collapse instead — more edge cases for a benefit (no remount) that doesn't matter much given what today's four panels actually hold.

### Recommendation

**Approach A.** Simpler, no CSS fighting, and the remount cost is negligible for this app's current panels. Approach B is only worth revisiting if a future panel gains real local UI state worth preserving through a hide/show cycle.

## 4. Design sketch (Approach A)

- `DockGroupHeaderActions` (already has Dock/Float, see `DockviewShell.tsx`) gets a third button using `IconEyeOff` from `icons.tsx` — unused since `DockPanel.tsx`'s deletion, so this closes that loose end instead of adding new icon surface.
- Hidden-list state lives in `DockviewShell`, exposed through a small context (or folded into the existing `DockContentContext`) so the header-actions component — rendered once per group, not by `DockviewShell` directly — can push/pop entries.
- New `mepapp.dockHidden.v1` localStorage key, read/written the same way `mepapp.dockLayout.v1` already is.
- CSS: a small `.mep-dock-edge-tab`-style block — roughly what `DockPanel.tsx` had before it was deleted in the dockview replacement (vertical `writing-mode`, ink border, uppercase label) — scoped inside `.mep-dockview-root`.

## 5. Open decisions for whoever picks this up

- **D1 — hide scope: whole group vs. single tab.** Old `DockPanel` only ever had one group, so this distinction didn't exist before. Recommend group-level — matches Dock/Float, which already act on the whole group — since hiding one tab out of a multi-tab group and leaving its siblings visible would need per-tab UI this app doesn't have anywhere else. Confirm before building.
- **D2 — stacking order when more than one group is hidden.** A user can now hide two different groups (e.g. after a split). Recommend stacking their edge-tab strips in the order they were hidden — simplest, and identical to the single-group case when there's only one.
- **D3 — collapse-all-the-way case.** If every group in the dock gets hidden, the dockview instance inside `.mep-dockview-root` has zero groups left and shows its default blank watermark. Recommend collapsing `.mep-dockview-root`'s own CSS width down to just fit the edge-tab strip(s) instead of leaving a mostly-empty 420px box — driven by `containerApi.groups.length === 0`, checked on `onDidAddGroup`/`onDidRemoveGroup`.
- **D4 — restoring always docks, never re-floats.** Matches old `DockPanel` exactly (hidden always restores to docked, even if it was floating when hidden). Flagging in case that's not actually wanted now that floating is a first-class mode in its own right.

## 6. Verification

Same shape as `dockable-panel-system.md`'s: live checks (Playwright against the dev server, not just reading docs) covering hide → edge tab appears with the right label → click restores docked with the same tabs in the same order and the same one active → reload persists the hidden state → hiding down to zero groups collapses the container per D3's answer.
