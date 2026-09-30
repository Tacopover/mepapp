import { useEffect, useState, type RefObject } from 'react';
import type { Vec2 } from '@mepapp/core';
import { WALL_DEBUG_GROUPS, type SketchScene, type WallDebugGroup, type WallDebugState, type WallLineInfo } from '@mepapp/render';

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
const colorOf = (group: WallDebugGroup): string => hex(WALL_DEBUG_GROUPS.find((g) => g.group === group)!.color);

/** One line of text that identifies a line for a bug report: id, rule, length and page coordinates. */
export function wallLineText(info: WallLineInfo): string {
  const f = (v: number) => v.toFixed(1);
  return `${info.id}: ${info.reason}, ${Math.round(info.lengthMm)} mm, ${info.kind}, pen ${info.strokeWidthPt.toFixed(2)} pt, (${f(info.x0)}, ${f(info.y0)}) -> (${f(info.x1)}, ${f(info.y1)}) pt`;
}

/**
 * Legend, group toggles and pinned lines of the wall-line debug overlay, plus the tooltip of the
 * line under the pointer. Renders nothing while the overlay is hidden.
 */
export function WallDebugPanel({ sceneRef, ready }: { sceneRef: RefObject<SketchScene | null>; ready: boolean }) {
  const [state, setState] = useState<WallDebugState | null>(null);
  const [hover, setHover] = useState<{ info: WallLineInfo; screen: Vec2 } | null>(null);
  const [pinned, setPinned] = useState<WallLineInfo[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    setState(scene.getWallDebugState());
    const onChanged = (s: WallDebugState) => setState(s);
    const onHover = (info: WallLineInfo | null, screen: Vec2 | null) => setHover(info && screen ? { info, screen } : null);
    const onPinned = (info: WallLineInfo) => setPinned((list) => (list.some((p) => p.id === info.id) ? list : [...list, info]));
    scene.on('wallDebugChanged', onChanged);
    scene.on('wallLineHover', onHover);
    scene.on('wallLinePinned', onPinned);
    return () => {
      scene.off('wallDebugChanged', onChanged);
      scene.off('wallLineHover', onHover);
      scene.off('wallLinePinned', onPinned);
    };
  }, [ready, sceneRef]);

  if (!state?.visible) return null;
  const hidden = new Set(state.hidden);
  const toggle = (group: WallDebugGroup) => {
    const next = new Set(hidden);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    sceneRef.current?.setWallDebugHidden([...next]);
  };
  const copyPinned = () => {
    void navigator.clipboard?.writeText(pinned.map(wallLineText).join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <div className="mep-wall-debug-panel" data-testid="wall-debug-panel">
        <div className="mep-wall-debug-head">
          <span>Wall lines{state.pageIndex !== null ? ` (page ${state.pageIndex + 1})` : ''}</span>
          <button type="button" className="mep-wall-debug-close" title="Hide wall lines" onClick={() => sceneRef.current?.setWallDebugVisible(false)}>
            ×
          </button>
        </div>
        {state.busy && <div className="mep-wall-debug-note">Running the wall filter…</div>}
        {state.message && <div className="mep-wall-debug-note">{state.message}</div>}
        {WALL_DEBUG_GROUPS.map(({ group, label, color }) => (
          <label key={group} className="mep-wall-debug-row">
            <input type="checkbox" checked={!hidden.has(group)} onChange={() => toggle(group)} />
            <span className="mep-wall-debug-swatch" style={{ background: hex(color) }} />
            <span className="mep-wall-debug-label">{label}</span>
            <span className="mep-wall-debug-count">{state.counts ? state.counts[group].toLocaleString() : '–'}</span>
          </label>
        ))}
        <div className="mep-wall-debug-note">Hover a line to see why it was kept or dropped. Press P to pin it.</div>
        {pinned.length > 0 && (
          <div className="mep-wall-debug-pinned">
            {pinned.map((p) => (
              <div key={p.id} className="mep-wall-debug-pin" title={wallLineText(p)}>
                <span className="mep-wall-debug-swatch" style={{ background: colorOf(p.group) }} />
                <span className="mep-wall-debug-id">{p.id}</span>
                <span className="mep-wall-debug-label">{p.reason}</span>
                <button type="button" title="Remove" onClick={() => setPinned((list) => list.filter((q) => q.id !== p.id))}>
                  ×
                </button>
              </div>
            ))}
            <div className="mep-wall-debug-actions">
              <button type="button" onClick={copyPinned}>
                {copied ? 'Copied' : `Copy ${pinned.length} line${pinned.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={() => setPinned([])}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
      {hover && (
        <div className="mep-wall-debug-tooltip" data-testid="wall-debug-tooltip" style={{ left: hover.screen.x + 14, top: hover.screen.y + 14 }}>
          <div>
            <span className="mep-wall-debug-swatch" style={{ background: colorOf(hover.info.group) }} />
            <b>{hover.info.id}</b> {hover.info.reason}
          </div>
          <div>
            {Math.round(hover.info.lengthMm).toLocaleString()} mm · {hover.info.kind} · pen {hover.info.strokeWidthPt.toFixed(2)} pt
          </div>
        </div>
      )}
    </>
  );
}
