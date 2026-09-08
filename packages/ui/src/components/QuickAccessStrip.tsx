import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
import { TOOL_META } from '../toolRegistry.js';
import { IconGrip, IconMinus, IconPlus } from '../icons.js';

const CAPACITY_STORAGE_KEY = 'mepapp.quickAccess.capacity.v1';
const DEFAULT_CAPACITY = 5;
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 10;

export interface QuickAccessStripProps {
  tool: SketchTool;
  sceneRef: RefObject<SketchScene | null>;
  stampReady: boolean;
}

function needsStamp(t: SketchTool): boolean {
  return t === 'place-terminal' || t === 'place-equipment';
}

/**
 * The floating strip that used to be the app's only toolbar (Toolbar.tsx) —
 * now a small convenience surface on top of the left rail (Rail.tsx). Shows
 * a true last-N-activated, deduplicated tool list rather than one slot per
 * rail group, per .claude/plans/ui-atlas-layout-mapping.md §3's Rev C
 * correction (using Terminal then Equipment shows both, since both were
 * actually used).
 */
export function QuickAccessStrip({ tool, sceneRef, stampReady }: QuickAccessStripProps) {
  const [position, setPosition] = useState({ top: 16, left: 60 });
  const dragRef = useRef<{ startScreen: { x: number; y: number }; startPos: { top: number; left: number } } | null>(null);

  const [capacity, setCapacityState] = useState(() => {
    const saved = Number(localStorage.getItem(CAPACITY_STORAGE_KEY));
    return saved >= MIN_CAPACITY && saved <= MAX_CAPACITY ? saved : DEFAULT_CAPACITY;
  });
  const setCapacity = useCallback((next: number) => {
    setCapacityState(next);
    localStorage.setItem(CAPACITY_STORAGE_KEY, String(next));
  }, []);

  const [mru, setMru] = useState<SketchTool[]>([]);
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false; // don't seed the strip with the initial 'select' tool on mount — only real activations count
      return;
    }
    setMru((prev) => [tool, ...prev.filter((t) => t !== tool)].slice(0, capacity));
  }, [tool, capacity]);

  const onGripPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startScreen: { x: event.clientX, y: event.clientY }, startPos: position };
    },
    [position],
  );
  const onGripPointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startScreen.x;
    const dy = event.clientY - dragRef.current.startScreen.y;
    setPosition({ top: Math.max(0, dragRef.current.startPos.top + dy), left: Math.max(0, dragRef.current.startPos.left + dx) });
  }, []);
  const onGripPointerUp = useCallback((event: React.PointerEvent) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div className="mep-quick-access" style={{ top: position.top, left: position.left }}>
      <div className="mep-quick-access-grip" onPointerDown={onGripPointerDown} onPointerMove={onGripPointerMove} onPointerUp={onGripPointerUp}>
        <IconGrip size={13} />
      </div>

      {mru.length === 0 && <span className="mep-quick-access-empty">No tools used yet</span>}
      {mru.map((t) => {
        const meta = TOOL_META[t];
        if (!meta) return null;
        return (
          <button
            key={t}
            type="button"
            className={`mep-tool-btn${tool === t ? ' active' : ''}`}
            title={meta.label}
            disabled={needsStamp(t) && !stampReady}
            onClick={() => sceneRef.current?.setTool(t)}
          >
            <meta.Icon size={17} />
          </button>
        );
      })}

      <div className="mep-tool-divider" />
      <div className="mep-quick-access-capacity" title="Number of slots">
        <button
          type="button"
          className="mep-quick-access-cap-btn"
          title="Fewer slots"
          disabled={capacity <= MIN_CAPACITY}
          onClick={() => setCapacity(Math.max(MIN_CAPACITY, capacity - 1))}
        >
          <IconMinus size={10} />
        </button>
        <span className="mep-quick-access-cap-label">{capacity}</span>
        <button
          type="button"
          className="mep-quick-access-cap-btn"
          title="More slots"
          disabled={capacity >= MAX_CAPACITY}
          onClick={() => setCapacity(Math.min(MAX_CAPACITY, capacity + 1))}
        >
          <IconPlus size={10} />
        </button>
      </div>
    </div>
  );
}
