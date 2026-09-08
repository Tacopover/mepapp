import { useCallback, useRef, useState, type ReactElement, type RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
import { IconEquipment, IconGrip, IconMeasure, IconPan, IconRedo, IconRuler, IconSegment, IconSelect, IconTerminal, IconUndo } from '../icons.js';

interface ToolDef {
  tool: SketchTool;
  label: string;
  Icon: (props: { size?: number }) => ReactElement;
}

const TOOLS: ToolDef[][] = [
  [
    { tool: 'select', label: 'Select', Icon: IconSelect },
    { tool: 'pan', label: 'Pan', Icon: IconPan },
  ],
  [
    { tool: 'place-terminal', label: 'Place terminal', Icon: IconTerminal },
    { tool: 'place-equipment', label: 'Place equipment', Icon: IconEquipment },
    { tool: 'draw-segment', label: 'Segment', Icon: IconSegment },
  ],
  [
    { tool: 'calibrate', label: 'Calibrate', Icon: IconRuler },
    { tool: 'measure', label: 'Measure', Icon: IconMeasure },
  ],
];

export interface ToolbarProps {
  tool: SketchTool;
  sceneRef: RefObject<SketchScene | null>;
  stampReady: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({ tool, sceneRef, stampReady, canUndo, canRedo, onUndo, onRedo }: ToolbarProps) {
  const [position, setPosition] = useState({ top: 16, left: 16 });
  const dragRef = useRef<{ startScreen: { x: number; y: number }; startPos: { top: number; left: number } } | null>(null);

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
    <div className="mep-toolbar" style={{ top: position.top, left: position.left }}>
      <div className="mep-toolbar-grip" onPointerDown={onGripPointerDown} onPointerMove={onGripPointerMove} onPointerUp={onGripPointerUp}>
        <IconGrip size={13} />
      </div>
      {TOOLS.map((group, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div className="mep-tool-divider" />}
          {group.map(({ tool: t, label, Icon }) => (
            <button
              key={t}
              type="button"
              className={`mep-tool-btn${tool === t ? ' active' : ''}`}
              title={label}
              disabled={(t === 'place-terminal' || t === 'place-equipment') && !stampReady}
              onClick={() => sceneRef.current?.setTool(t)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      ))}
      <div className="mep-tool-divider" />
      <button type="button" className="mep-tool-btn" title="Undo" disabled={!canUndo} onClick={onUndo}>
        <IconUndo size={17} />
      </button>
      <button type="button" className="mep-tool-btn" title="Redo" disabled={!canRedo} onClick={onRedo}>
        <IconRedo size={17} />
      </button>
    </div>
  );
}
