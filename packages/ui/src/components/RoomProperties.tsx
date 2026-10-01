import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { roomAreaM2, roomAreaWarning, type Calibration, type Room } from '@mepapp/core';

/** Text input that commits on blur or Enter, not on every keystroke (one undo step per edit). */
function CommitInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

export interface RoomPropertiesProps {
  sceneRef: RefObject<SketchScene | null>;
  rooms: Room[];
  calibration: Calibration | null;
}

/** Properties of the rooms selected with the edit-room tool. */
export function RoomProperties({ sceneRef, rooms, calibration }: RoomPropertiesProps) {
  const remove = () => sceneRef.current?.deleteRooms(rooms.map((r) => r.id));
  if (rooms.length > 1) {
    const total = calibration ? rooms.reduce((sum, r) => sum + roomAreaM2(r, calibration), 0) : null;
    return (
      <div>
        <div className="mep-elem-row">
          <b>{rooms.length} rooms</b>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Total area</label>
            <input type="text" value={total !== null ? `${total.toFixed(1)} m²` : 'Not calibrated'} disabled />
          </div>
          {rooms.length === 2 && (
            <button type="button" onClick={() => sceneRef.current?.mergeSelectedRooms()}>
              Merge rooms
            </button>
          )}
          <button type="button" onClick={remove}>
            Delete rooms
          </button>
        </div>
      </div>
    );
  }
  const room = rooms[0]!;
  const computed = calibration ? roomAreaM2(room, calibration) : null;
  const warning = calibration ? roomAreaWarning(room, calibration) : null;
  const update = (patch: Parameters<SketchScene['updateRoom']>[1]) => sceneRef.current?.updateRoom(room.id, patch);
  return (
    <div>
      <div className="mep-elem-row">
        <b>Room · {room.id}</b>
      </div>
      <div className="mep-section">
        <div className="mep-field-row">
          <label>Number</label>
          <CommitInput value={room.number ?? ''} onCommit={(v) => update({ number: v.trim() === '' ? null : v.trim() })} />
        </div>
        <div className="mep-field-row">
          <label>Name</label>
          <CommitInput value={room.name ?? ''} onCommit={(v) => update({ name: v.trim() === '' ? null : v.trim() })} />
        </div>
        <div className="mep-field-row">
          <label>Area</label>
          <input type="text" value={computed !== null ? `${computed.toFixed(2)} m²` : 'Not calibrated'} disabled />
        </div>
        {room.labelAreaM2 !== undefined && (
          <div className="mep-field-row">
            <label>Area in drawing</label>
            <input type="text" value={`${room.labelAreaM2} m²`} disabled />
          </div>
        )}
        {warning && <p className="mep-settings-hint">The computed area differs {Math.round(warning.deviation * 100)}% from the area printed in the drawing. Check the outline.</p>}
        <div className="mep-field-row">
          <label>Needs review</label>
          <input type="checkbox" checked={room.open} onChange={(e) => update({ open: e.target.checked })} />
        </div>
        <div className="mep-field-row">
          <label>Source</label>
          <input type="text" value={`${room.source}${room.locked ? ' (locked)' : ''}`} disabled />
        </div>
        {room.otherLabels && room.otherLabels.length > 0 && <p className="mep-settings-hint">Other labels inside this outline: {room.otherLabels.join(', ')}. The outline may hold more than one room.</p>}
        <button type="button" onClick={() => sceneRef.current?.setTool('split-room')}>
          Split room…
        </button>
        <button type="button" onClick={remove}>
          Delete room
        </button>
        <p className="mep-settings-hint">Drag a corner to move it. Click an edge to add a corner. Alt-click a corner to remove it.</p>
      </div>
    </div>
  );
}
