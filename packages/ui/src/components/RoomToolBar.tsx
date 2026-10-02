import type { RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
import { ROOM_TOOL_ENTRIES, isRoomTool } from '../toolRegistry.js';

export interface RoomToolBarProps {
  tool: SketchTool;
  sceneRef: RefObject<SketchScene | null>;
}

/** Header switcher for the three room tools. Shown only while a room tool is active; exactly one is on. */
export function RoomToolBar({ tool, sceneRef }: RoomToolBarProps) {
  if (!isRoomTool(tool)) return null;
  return (
    <div className="mep-room-tools" role="radiogroup" aria-label="Room tool">
      {ROOM_TOOL_ENTRIES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="radio"
          aria-checked={tool === entry.tool}
          className={tool === entry.tool ? 'on' : ''}
          title={entry.label}
          onClick={() => entry.tool && sceneRef.current?.setTool(entry.tool)}
        >
          <entry.Icon size={15} />
          <span>{entry.label}</span>
        </button>
      ))}
    </div>
  );
}
