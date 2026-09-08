import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconClose, IconEyeOff, IconPlus } from '../icons.js';

export interface DockTabDef {
  id: string;
  label: string;
}

export interface DockPanelProps {
  tabs: DockTabDef[];
  content: Record<string, ReactNode>;
  /**
   * When set to a tab id, forces the dock onto that tab (reopening it first
   * if the user had closed it), remembering whichever tab was active so it
   * can be restored once this goes back to null/undefined. Bump
   * `forcedTabNonce` to re-force the same tab id again, e.g. when a new
   * element is selected while the user had manually switched to another tab.
   */
  forcedTabId?: string | null;
  forcedTabNonce?: number;
}

const STATE_STORAGE_KEY = 'mepapp.dockPanel.v1';
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

interface PersistedState {
  width: number;
  collapsed: boolean;
  activeTabId: string | null;
  closedTabIds: string[];
}

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

/**
 * The right-side dock: a single fixed-position panel with resizable width
 * and per-tab close/reopen, plus a whole-panel collapse to a small edge tab.
 * Previously built on dockview-react for floating/splitting panels, but that
 * confined "floating" to the same right-hand column it was meant to escape
 * (dockview's DnD compass for real cross-layout docking is Enterprise-only —
 * see the dockview-fixes branch history) and the multiple modes added more
 * confusion than value. Rewound to one dock position, matching this app's
 * actual needs — see the original DockPanel.tsx this restores (deleted in
 * the dockview replacement, git history 2341a8f).
 */
export function DockPanel({ tabs, content, forcedTabId = null, forcedTabNonce = 0 }: DockPanelProps) {
  const saved = useRef(loadState()).current;

  const [width, setWidth] = useState(() => (saved && saved.width >= MIN_WIDTH && saved.width <= MAX_WIDTH ? saved.width : DEFAULT_WIDTH));
  const [collapsed, setCollapsed] = useState(() => saved?.collapsed ?? false);
  const [closedTabIds, setClosedTabIds] = useState<string[]>(() => (saved?.closedTabIds ?? []).filter((id) => tabs.some((t) => t.id === id)));
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const openTabs = tabs.filter((t) => !(saved?.closedTabIds ?? []).includes(t.id));
    const restored = saved?.activeTabId;
    return (restored && openTabs.some((t) => t.id === restored) ? restored : openTabs[0]?.id) ?? tabs[0].id;
  });
  const [reopenMenuOpen, setReopenMenuOpen] = useState(false);
  const reopenRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const preForceTabIdRef = useRef<string | null>(null);
  const wasForcedRef = useRef(false);

  useEffect(() => {
    const state: PersistedState = { width, collapsed, activeTabId, closedTabIds };
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  }, [width, collapsed, activeTabId, closedTabIds]);

  useEffect(() => {
    if (!reopenMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (reopenRef.current && !reopenRef.current.contains(event.target as Node)) setReopenMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [reopenMenuOpen]);

  useEffect(() => {
    if (forcedTabId) {
      if (!wasForcedRef.current) {
        // Fresh force (was not already forced) — remember the tab to restore later.
        preForceTabIdRef.current = activeTabId;
        wasForcedRef.current = true;
      }
      setClosedTabIds((ids) => (ids.includes(forcedTabId) ? ids.filter((id) => id !== forcedTabId) : ids));
      setActiveTabId(forcedTabId);
    } else if (wasForcedRef.current) {
      wasForcedRef.current = false;
      const restore = preForceTabIdRef.current;
      setActiveTabId((current) => (restore && tabs.some((t) => t.id === restore) ? restore : current));
    }
    // forcedTabNonce is a re-force signal only — bumping it re-runs this effect
    // even when forcedTabId's value hasn't changed (e.g. re-selecting while the
    // user had manually switched away from the forced tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedTabId, forcedTabNonce]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeRef.current = { startX: event.clientX, startWidth: width };
    },
    [width],
  );
  const onResizePointerMove = useCallback((event: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dx = resizeRef.current.startX - event.clientX; // dock sits on the right — dragging left grows it
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + dx)));
  }, []);
  const onResizePointerUp = useCallback((event: React.PointerEvent) => {
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const closeTab = (id: string) => {
    setClosedTabIds((ids) => [...ids, id]);
    if (activeTabId === id) {
      const next = tabs.find((t) => t.id !== id && !closedTabIds.includes(t.id));
      if (next) setActiveTabId(next.id);
    }
  };

  const reopenTab = (id: string) => {
    setClosedTabIds((ids) => ids.filter((tid) => tid !== id));
    setActiveTabId(id);
    setReopenMenuOpen(false);
  };

  if (collapsed) {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    return (
      <button type="button" className="mep-dock-edge-tab" onClick={() => setCollapsed(false)} title="Show panel">
        {activeTab?.label ?? 'Panel'}
      </button>
    );
  }

  const openTabs = tabs.filter((t) => !closedTabIds.includes(t.id));
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? openTabs[0];

  return (
    <>
      <div className="mep-resize-handle" onPointerDown={onResizePointerDown} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp}>
        <div className="nub" />
      </div>
      <div className="mep-dock" style={{ width }}>
        <div className="mep-dock-header">
          {openTabs.map((t) => (
            <div key={t.id} className={`mep-dock-tab${t.id === activeTab?.id ? ' on' : ''}`}>
              <button type="button" className="mep-dock-tab-label" onClick={() => setActiveTabId(t.id)}>
                {t.label}
              </button>
              {openTabs.length > 1 && (
                <button type="button" className="mep-dock-tab-close" title={`Close ${t.label}`} onClick={() => closeTab(t.id)}>
                  <IconClose size={9} />
                </button>
              )}
            </div>
          ))}
          <div className="mep-fill" />
          {closedTabIds.length > 0 && (
            <div className="mep-menu" ref={reopenRef}>
              <button type="button" className="mep-dock-mode-btn" title="Reopen panel" onClick={() => setReopenMenuOpen((o) => !o)}>
                <IconPlus size={13} />
              </button>
              {reopenMenuOpen && (
                <div className="mep-menu-dropdown mep-dock-menu-dropdown">
                  {closedTabIds.map((id) => (
                    <button key={id} type="button" className="mep-menu-item" onClick={() => reopenTab(id)}>
                      {tabs.find((t) => t.id === id)?.label ?? id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="mep-dock-mode-btn" title="Hide" onClick={() => setCollapsed(true)}>
            <IconEyeOff size={13} />
          </button>
        </div>
        <div className="mep-dock-body">{activeTab && content[activeTab.id]}</div>
      </div>
    </>
  );
}
