import { useCallback, useRef, useState, type ReactNode } from 'react';
import { IconDock, IconEyeOff, IconFloat, IconGrip } from '../icons.js';

export type DockMode = 'docked' | 'floating' | 'hidden';

export interface DockTab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface DockPanelProps {
  tabs: DockTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
}

const DEFAULT_WIDTH = 308;
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

/**
 * The right-side Dock/Float/Hide panel from the Field Blueprint mockup.
 * Hand-rolled rather than a general docking library (dockview,
 * react-resizable-panels): this app needs exactly one panel with three
 * fixed modes, not arbitrary multi-pane rearrangement, so the smaller
 * surface area is a deliberate scope match, not a shortcut.
 */
export function DockPanel({ tabs, activeTabId, onTabChange }: DockPanelProps) {
  const [mode, setMode] = useState<DockMode>('docked');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [floatPos, setFloatPos] = useState({ top: 80, left: 0 });
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dragRef = useRef<{ startScreen: { x: number; y: number }; startPos: { top: number; left: number } } | null>(null);

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

  const onDragPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startScreen: { x: event.clientX, y: event.clientY }, startPos: floatPos };
    },
    [floatPos],
  );
  const onDragPointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startScreen.x;
    const dy = event.clientY - dragRef.current.startScreen.y;
    setFloatPos({ top: Math.max(0, dragRef.current.startPos.top + dy), left: dragRef.current.startPos.left + dx });
  }, []);
  const onDragPointerUp = useCallback((event: React.PointerEvent) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (mode === 'hidden') {
    return (
      <button type="button" className="mep-dock-edge-tab" onClick={() => setMode('docked')} title="Show panel">
        {tabs.find((t) => t.id === activeTabId)?.label ?? 'Panel'}
      </button>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const header = (
    <div className="mep-dock-header">
      {mode === 'floating' && (
        <div
          className="mep-toolbar-grip"
          style={{ width: 16, height: 24 }}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
        >
          <IconGrip size={12} />
        </div>
      )}
      {tabs.map((t) => (
        <button key={t.id} type="button" className={`mep-dock-tab${t.id === activeTabId ? ' on' : ''}`} onClick={() => onTabChange(t.id)}>
          {t.label}
        </button>
      ))}
      <div className="mep-fill" />
      <button type="button" className={`mep-dock-mode-btn${mode === 'docked' ? ' on' : ''}`} title="Docked" onClick={() => setMode('docked')}>
        <IconDock size={14} />
      </button>
      <button
        type="button"
        className={`mep-dock-mode-btn${mode === 'floating' ? ' on' : ''}`}
        title="Floating"
        onClick={() => {
          setFloatPos((p) => (p.left === 0 ? { top: 80, left: window.innerWidth - width - 32 } : p));
          setMode('floating');
        }}
      >
        <IconFloat size={14} />
      </button>
      <button type="button" className="mep-dock-mode-btn" title="Hide" onClick={() => setMode('hidden')}>
        <IconEyeOff size={14} />
      </button>
    </div>
  );

  if (mode === 'floating') {
    return (
      <div className="mep-dock floating" style={{ top: floatPos.top, left: floatPos.left, width, height: 520 }}>
        {header}
        <div className="mep-dock-body">{activeTab?.content}</div>
      </div>
    );
  }

  return (
    <>
      <div className="mep-resize-handle" onPointerDown={onResizePointerDown} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp}>
        <div className="nub" />
      </div>
      <div className="mep-dock" style={{ width }}>
        {header}
        <div className="mep-dock-body">{activeTab?.content}</div>
      </div>
    </>
  );
}
