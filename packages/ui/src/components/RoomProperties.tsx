import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { coerceDefaultValue, parseDecimal, roomAreaM2, roomAreaWarning, roomTypeLabel, type Calibration, type CustomPropertyDefinition, type Room, type RoomType } from '@mepapp/core';

/** Text input that commits on blur or Enter, not on every keystroke (one undo step per edit). An `onCommit` that returns false rejects the text, and the box shows the stored value again. */
function CommitInput({ value, onCommit }: { value: string; onCommit: (value: string) => boolean | void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value && onCommit(draft) === false) setDraft(value);
  };
  return <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

const AUTO = '__auto__';
const NONE = '__none__';
const MIXED = '__mixed__';

/** The select value of a room: AUTO while name matching sets the type, else the chosen type id or NONE. */
const roomTypeChoice = (room: Room): string => (room.roomTypeSource === 'user' ? (room.roomTypeId ?? NONE) : AUTO);

interface RoomTypeSelectProps {
  sceneRef: RefObject<SketchScene | null>;
  rooms: Room[];
  roomTypes: (RoomType & { inLibrary: boolean })[];
  language: 'en' | 'nl';
}

/** Room type of one or more rooms. "By name" gives the rooms back to name matching; any other choice is kept when names change. */
function RoomTypeSelect({ sceneRef, rooms, roomTypes, language }: RoomTypeSelectProps) {
  const choices = new Set(rooms.map(roomTypeChoice));
  const value = choices.size === 1 ? [...choices][0]! : MIXED;
  const nameOf = (id: string | undefined) => {
    if (id === undefined) return null;
    const type = roomTypes.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : id;
  };
  const matched = rooms.length === 1 && rooms[0]!.roomTypeSource !== 'user' ? nameOf(rooms[0]!.roomTypeId) : null;
  const unknownIds = [...new Set(rooms.flatMap((r) => (r.roomTypeId && !roomTypes.some((t) => t.id === r.roomTypeId) ? [r.roomTypeId] : [])))];
  return (
    <div className="mep-field-row">
      <label htmlFor="room-type">Room type</label>
      <select
        id="room-type"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v !== MIXED) sceneRef.current?.setRoomType(rooms.map((r) => r.id), v === AUTO ? 'auto' : v === NONE ? null : v);
        }}
      >
        {value === MIXED && (
          <option value={MIXED} disabled>
            Mixed
          </option>
        )}
        <option value={AUTO}>{rooms.length === 1 ? `By name: ${matched ?? 'no match'}` : 'By name'}</option>
        <option value={NONE}>No type</option>
        {roomTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {roomTypeLabel(type, language)}
            {type.inLibrary ? '' : ' (this drawing only)'}
          </option>
        ))}
        {unknownIds.map((id) => (
          <option key={id} value={id}>
            {id} (unknown)
          </option>
        ))}
      </select>
    </div>
  );
}

export interface RoomPropertiesProps {
  sceneRef: RefObject<SketchScene | null>;
  rooms: Room[];
  calibration: Calibration | null;
  /** The Room tab of Global Properties: the custom fields every room shows. */
  customPropertyDefinitions: CustomPropertyDefinition[];
  /** Room types to choose from: the user library, then the types only the drawing's file holds. */
  roomTypes?: (RoomType & { inLibrary: boolean })[];
  language?: 'en' | 'nl';
}

/** Properties of the rooms selected with the edit-room tool. */
export function RoomProperties({ sceneRef, rooms, calibration, customPropertyDefinitions, roomTypes = [], language = 'en' }: RoomPropertiesProps) {
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
          <RoomTypeSelect sceneRef={sceneRef} rooms={rooms} roomTypes={roomTypes} language={language} />
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
        <RoomTypeSelect sceneRef={sceneRef} rooms={rooms} roomTypes={roomTypes} language={language} />
        {room.roomTypeId === undefined && <p className="mep-settings-hint">This room has no type. Choose one, or add a keyword in Menu › Room types.</p>}
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
        {customPropertyDefinitions.map((def) => (
          <div className="mep-field-row" key={def.name}>
            <label>{def.name}</label>
            <CommitInput
              value={String(room.properties?.[def.name] ?? coerceDefaultValue(def))}
              onCommit={(v) => {
                if (def.kind !== 'numeric') {
                  update({ properties: { ...room.properties, [def.name]: v } });
                  return;
                }
                const parsed = v.trim() === '' ? 0 : parseDecimal(v);
                if (parsed === null) return false;
                update({ properties: { ...room.properties, [def.name]: parsed } });
              }}
            />
          </div>
        ))}
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
