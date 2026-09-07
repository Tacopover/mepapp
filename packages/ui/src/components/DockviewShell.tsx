import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
  type Position,
  type SerializedDockview,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { IconDock, IconFloat } from '../icons.js';

export interface DockviewTabDef {
  id: string;
  label: string;
}

export interface DockviewShellProps {
  tabs: DockviewTabDef[];
  content: Record<string, ReactNode>;
}

const LAYOUT_STORAGE_KEY = 'mepapp.dockLayout.v1';

// Field Blueprint's own light palette, layered on dockview's stock light
// theme via CSS variable overrides — see the `.mep-dockview-theme` block in
// theme.css. Keeps this as a small, real theme rather than the placeholder
// dark theme the spike used.
const theme = { ...themeLight, className: `${themeLight.className} mep-dockview-theme` };

interface SlotParams {
  tabId: string;
}

// Panel content isn't handed to dockview through `params` (dockview
// serializes params into the saved layout JSON — a React element there
// would break persistence). Instead each slot looks up its live content by
// id from this context, which App.tsx re-provides on every render.
const DockContentContext = createContext<Record<string, ReactNode>>({});

function DockContentSlot({ params }: IDockviewPanelProps<SlotParams>) {
  const content = useContext(DockContentContext);
  return <div className="mep-dock-body">{content[params.tabId] ?? null}</div>;
}

// Directional redocking (dragging a floating panel to a specific edge to
// split it in) is a Dockview Enterprise-only feature — its "DnD compass",
// confirmed against the library's own docs: without it, a drag from a
// floating group can only ever merge as a tab into an existing group, never
// split a new one. This project can't add a paid dependency (CLAUDE.md), so
// the same outcome is offered as an explicit menu instead, built on the free
// `GroupviewPanel.api.moveTo` primitive (which already powers plain "Dock").
const DOCK_DIRECTIONS: { position: Position; label: string }[] = [
  { position: 'center', label: 'As tab' },
  { position: 'left', label: 'Split left' },
  { position: 'right', label: 'Split right' },
  { position: 'top', label: 'Split top' },
  { position: 'bottom', label: 'Split bottom' },
];

// Per-group Dock/Float shortcut — real drag-and-drop (Shift+drag a tab to
// float it, drag a floating tab onto a group's center to redock it as a tab)
// works without this, but it's not discoverable without knowing the Shift
// modifier, and can't reach a split at all (see above), so this stays as an
// explicit affordance alongside the drag gestures (dockable-panel-system.md D3).
function DockGroupHeaderActions(props: IDockviewHeaderActionsProps) {
  const isFloating = props.location?.type === 'floating';
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const onFloat = () => {
    props.containerApi.addFloatingGroup(props.group, { width: 360, height: 460 });
  };
  const dockTo = (position: Position) => {
    const target = props.containerApi.groups.find((g) => g.id !== props.group.id && g.api.location.type === 'grid') ?? props.containerApi.addGroup();
    props.api.moveTo({ group: target, position });
    setMenuOpen(false);
  };

  if (!isFloating) {
    return (
      <div className="mep-dock-header-actions">
        <button type="button" className="mep-dock-mode-btn" title="Float" onClick={onFloat}>
          <IconFloat size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="mep-dock-header-actions mep-menu" ref={rootRef}>
      <button type="button" className="mep-dock-mode-btn" title="Dock" onClick={() => setMenuOpen((o) => !o)}>
        <IconDock size={13} />
      </button>
      {menuOpen && (
        <div className="mep-menu-dropdown mep-dock-menu-dropdown">
          {DOCK_DIRECTIONS.map(({ position, label }) => (
            <button key={position} type="button" className="mep-menu-item" onClick={() => dockTo(position)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Registered once at module scope so component identity is stable across
// renders — an inline object here would make DockviewReact remount every
// panel on every App.tsx re-render.
const components = { slot: DockContentSlot };

/**
 * Replaces the hand-rolled DockPanel: wires the app's real panel content
 * into dockview-react so floating/resizing/re-docking/tab-drag-to-float/
 * tab-drag-to-merge come from the library instead of being hand-built.
 * See .claude/plans/dockable-panel-system.md.
 */
export function DockviewShell({ tabs, content }: DockviewShellProps) {
  const apiRef = useRef<DockviewApi | null>(null);
  // Closing a tab's native × fully removes and disposes its panel — dockview
  // has no built-in way to bring it back. Track which of the app's known
  // tabs are currently absent from the layout so a small "Reopen" control
  // can re-add them; recomputed after every layout change rather than
  // tracked incrementally, so it also self-heals a stale/edited saved layout.
  const [closedTabIds, setClosedTabIds] = useState<string[]>([]);
  const [reopenMenuOpen, setReopenMenuOpen] = useState(false);
  const reopenRef = useRef<HTMLDivElement | null>(null);

  const refreshClosedTabs = useCallback(
    (api: DockviewApi) => {
      const present = new Set(api.panels.map((p) => p.id));
      setClosedTabIds(tabs.filter((t) => !present.has(t.id)).map((t) => t.id));
    },
    [tabs],
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;

      let restored = false;
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        try {
          event.api.fromJSON(JSON.parse(saved) as SerializedDockview);
          restored = true;
        } catch {
          // Corrupt/incompatible saved layout — fall through to the default below.
        }
      }

      if (!restored) {
        tabs.forEach((tab, i) => {
          event.api.addPanel({
            id: tab.id,
            component: 'slot',
            title: tab.label,
            params: { tabId: tab.id },
            position: i === 0 ? undefined : { referencePanel: tabs[0].id, direction: 'within' },
          });
        });
      }

      refreshClosedTabs(event.api);

      event.api.onDidLayoutChange(() => {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(event.api.toJSON()));
        refreshClosedTabs(event.api);
      });
    },
    [tabs, refreshClosedTabs],
  );

  useEffect(() => {
    if (!reopenMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (reopenRef.current && !reopenRef.current.contains(event.target as Node)) setReopenMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [reopenMenuOpen]);

  const reopenTab = (id: string) => {
    const api = apiRef.current;
    const tab = tabs.find((t) => t.id === id);
    if (!api || !tab) return;
    const reference = api.panels[0]?.id;
    api.addPanel({
      id: tab.id,
      component: 'slot',
      title: tab.label,
      params: { tabId: tab.id },
      position: reference ? { referencePanel: reference, direction: 'within' } : undefined,
    });
    setReopenMenuOpen(false);
  };

  return (
    <DockContentContext.Provider value={content}>
      <div className="mep-dockview-shell">
        {closedTabIds.length > 0 && (
          <div className="mep-dock-reopen-bar mep-menu" ref={reopenRef}>
            <button type="button" className="mep-dock-reopen-btn" onClick={() => setReopenMenuOpen((o) => !o)}>
              + Reopen panel
            </button>
            {reopenMenuOpen && (
              <div className="mep-menu-dropdown">
                {closedTabIds.map((id) => (
                  <button key={id} type="button" className="mep-menu-item" onClick={() => reopenTab(id)}>
                    {tabs.find((t) => t.id === id)?.label ?? id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mep-dockview-container">
          <DockviewReact theme={theme} onReady={onReady} components={components} rightHeaderActionsComponent={DockGroupHeaderActions} />
        </div>
      </div>
    </DockContentContext.Provider>
  );
}
