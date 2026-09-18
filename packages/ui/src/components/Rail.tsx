import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
import { RAIL_ROWS } from '../toolRegistry.js';
import { IconChevRight, IconCopy, IconRedo, IconSelect, IconTrash, IconUndo } from '../icons.js';

export interface RailProps {
  tool: SketchTool;
  sceneRef: RefObject<SketchScene | null>;
  stampReady: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSettings: () => void;
  /** Stamp clicked with no active definition yet — auto-picks the first stamp shown in the MEP tab's grid. */
  onPickDefaultStamp: () => void;
}

function needsStamp(t: SketchTool | null): boolean {
  return t === 'place-terminal' || t === 'place-equipment';
}

/**
 * The left-edge tool rail — see .claude/plans/ui-atlas-layout-mapping.md §3.
 * Each row collapses to whichever member was last picked in this session
 * (default: the row's first member); a chevron opens a flyout to the right
 * listing the rest. Members with `tool: null` (toolRegistry.ts) are reserved
 * slots for tools nobody has built yet — they render disabled.
 */
export function Rail({ tool, sceneRef, stampReady, hasSelection, canUndo, canRedo, onUndo, onRedo, onOpenSettings, onPickDefaultStamp }: RailProps) {
  const [lastPickedByRow, setLastPickedByRow] = useState<Record<string, string>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The single 'Stamp' button re-enters whichever of place-terminal/place-equipment was last
  // active (the actual Terminal/Equipment choice happens in the MEP dock tab's stamp grid),
  // so re-clicking it after an Escape resumes the same category instead of always Terminal.
  const [lastStampTool, setLastStampTool] = useState<'place-terminal' | 'place-equipment'>('place-terminal');
  useEffect(() => {
    if (tool === 'place-terminal' || tool === 'place-equipment') setLastStampTool(tool);
  }, [tool]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenRow(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div className="mep-rail" ref={rootRef}>
      {RAIL_ROWS.map((row) => {
        const currentId = lastPickedByRow[row.id] ?? row.members[0].id;
        const current = row.members.find((m) => m.id === currentId) ?? row.members[0];
        const flyoutMembers = row.members.filter((m) => m.id !== current.id);
        const isOpen = openRow === row.id;
        const isStampRow = row.id === 'place';
        const stampRowActive = tool === 'place-terminal' || tool === 'place-equipment';

        return (
          <div key={row.id} className="mep-rail-row">
            <div className="mep-rail-row-main">
              <button
                type="button"
                className={`mep-rail-btn${(isStampRow ? stampRowActive : tool === current.tool) ? ' active' : ''}`}
                title={current.tool === null ? `${current.label} — coming soon` : current.label}
                disabled={isStampRow ? false : current.tool === null || (needsStamp(current.tool) && !stampReady)}
                onClick={() => {
                  if (isStampRow) {
                    if (stampReady) sceneRef.current?.setTool(lastStampTool);
                    else onPickDefaultStamp();
                    return;
                  }
                  current.tool && sceneRef.current?.setTool(current.tool);
                }}
              >
                <current.Icon size={18} />
              </button>
              {!row.singleton && (
                <button
                  type="button"
                  className={`mep-rail-chev${isOpen ? ' open' : ''}`}
                  title="More tools"
                  onClick={() => setOpenRow(isOpen ? null : row.id)}
                >
                  <IconChevRight size={11} />
                </button>
              )}
            </div>

            {isOpen && (
              <div className="mep-rail-flyout">
                {flyoutMembers.map((m) => {
                  const isSnapAngle = m.id === 'snap-angle';
                  const comingSoon = m.tool === null && !isSnapAngle;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="mep-rail-flyout-btn"
                      title={comingSoon ? `${m.label} — coming soon` : m.label}
                      disabled={comingSoon || (needsStamp(m.tool) && !stampReady)}
                      onClick={() => {
                        if (isSnapAngle) {
                          onOpenSettings();
                          setOpenRow(null);
                          return;
                        }
                        if (!m.tool) return;
                        sceneRef.current?.setTool(m.tool);
                        setLastPickedByRow((prev) => ({ ...prev, [row.id]: m.id }));
                        setOpenRow(null);
                      }}
                    >
                      <m.Icon size={16} />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="mep-rail-divider" />
      <button type="button" className="mep-rail-btn" title="Undo" disabled={!canUndo} onClick={onUndo}>
        <IconUndo size={18} />
      </button>
      <button type="button" className="mep-rail-btn" title="Redo" disabled={!canRedo} onClick={onRedo}>
        <IconRedo size={18} />
      </button>

      <div className="mep-rail-divider" />
      <button type="button" className={`mep-rail-btn${tool === 'select' ? ' active' : ''}`} title="Select" onClick={() => sceneRef.current?.setTool('select')}>
        <IconSelect size={18} />
      </button>
      <button type="button" className="mep-rail-btn" title="Copy" disabled={!hasSelection} onClick={() => sceneRef.current?.copySelection()}>
        <IconCopy size={18} />
      </button>
      <button type="button" className="mep-rail-btn" title="Delete" disabled={!hasSelection} onClick={() => sceneRef.current?.deleteSelection()}>
        <IconTrash size={18} />
      </button>
    </div>
  );
}
