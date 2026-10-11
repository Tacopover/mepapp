import { useState, type ReactNode } from 'react';
import type { SketchScene } from '@mepapp/render';
import { isValidCeilingHeightMm, roomTypeLabel, type Calibration, type CeilingHeightContext, type CeilingHeightLevel, type Room, type RoomType } from '@mepapp/core';
import type { StepState } from './PlacementRuleGuide.js';
import { OptionalNumberInput } from './OptionalNumberInput.js';
import { MAX_CEILING_HEIGHT_MM, MIN_CEILING_HEIGHT_MM } from './RoomProperties.js';
import { RoomTypeLibrary } from './RoomTypeLibrary.js';
import { ScaleControl } from './ScaleControl.js';

const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('en', { maximumFractionDigits: 1 }));
const allowHeight = (mm: number) => mm >= MIN_CEILING_HEIGHT_MM && mm <= MAX_CEILING_HEIGHT_MM;
const AUTO = '__auto';
const NONE = '__none';

/** The room types of the plan, by the order of the type list. */
export const TYPE_FILLS = ['#dbe9f2', '#dcefe3', '#efe3f4', '#fbeed6', '#e2e7ea', '#f4e1dc', '#e0f0ef', '#f1efd6'];
/** The ceiling height levels of the plan. */
export const LEVEL_FILLS: Record<CeilingHeightLevel, string> = { global: 'var(--surface)', pdf: '#dbe9f2', roomType: '#fbeed6', room: '#efe3f4' };
export const LEVEL_NAMES: Record<CeilingHeightLevel, string> = { global: 'level 1, all drawings', pdf: 'level 2, this drawing', roomType: 'level 3, room type', room: 'level 4, one room' };

/** The fill of a room by its type, or null without a type. */
export const typeFillOf = (types: readonly RoomType[]) => (room: Room) => {
  if (room.roomTypeId === undefined) return null;
  const i = types.findIndex((t) => t.id === room.roomTypeId);
  return TYPE_FILLS[(i < 0 ? 0 : i) % TYPE_FILLS.length]!;
};

/** One line of a card with a state icon. */
export function Check({ state, title, sub, children }: { state: StepState; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className={`mep-guide-check ${state || 'off'}`}>
      <span className="ic">{state === 'ok' ? '✓' : state === '' ? '–' : '!'}</span>
      <div>
        <b>{title}</b>
        <div className="sub">{sub}</div>
        {children && <div className="mep-guide-inline mep-autoplace-check-actions">{children}</div>}
      </div>
    </div>
  );
}

export interface DrawingCardProps {
  pageIndex: number;
  calibration: Calibration | null;
  roomCount: number;
  detecting: boolean;
  onSetScale: (denominator: number) => void;
  onCalibrate: () => void;
  onDetectRooms: () => void;
  /** Back and Next. */
  footer: ReactNode;
}

/** Drawing and rooms: the scale of the shown page and its rooms. */
export function DrawingCard({ pageIndex, calibration, roomCount, detecting, onSetScale, onCalibrate, onDetectRooms, footer }: DrawingCardProps) {
  const page = `page ${pageIndex + 1}`;
  return (
    <>
      <h2>Drawing and rooms</h2>
      <p className="mep-guide-lead">MepApp needs the scale of the page and the rooms on it. The scale gives the floor area. The rooms come from the room names in the drawing.</p>
      <div className="mep-guide-checks">
        <Check state={calibration ? 'ok' : 'bad'} title={calibration ? `Scale of ${page}` : `${page[0]!.toUpperCase()}${page.slice(1)} has no scale`} sub={calibration ? 'Calibrate… hides this dialog until you click two points.' : 'Choose the scale, or calibrate on the drawing with two points.'}>
          <ScaleControl calibration={calibration} onSetScale={onSetScale} />
          <button type="button" id="ap-calibrate" onClick={onCalibrate}>
            Calibrate…
          </button>
        </Check>
        <Check state={roomCount > 0 ? 'ok' : 'bad'} title={roomCount > 0 ? `${plural(roomCount, 'room')} on ${page}` : `No rooms on ${page}`} sub={!calibration ? 'Detect rooms needs the scale.' : 'MepApp finds the rooms from the room names.'}>
          <button type="button" id="ap-detect" className={roomCount === 0 ? 'primary' : ''} disabled={!calibration || detecting} onClick={onDetectRooms}>
            {detecting ? 'Detecting…' : roomCount === 0 ? 'Detect rooms' : 'Detect again'}
          </button>
        </Check>
      </div>
      <p className="mep-guide-note">MepApp places stamps only on the page that the drawing shows now. Go to another page to place stamps there.</p>
      {footer}
    </>
  );
}

export interface RoomTypesCardProps {
  sceneRef: { current: SketchScene | null };
  pageRooms: readonly Room[];
  /** The room types of the drawing: the library and the copies in the drawing. */
  types: readonly RoomType[];
  language: 'en' | 'nl';
  library: RoomType[];
  fileOnlyTypes: RoomType[];
  onChangeLibrary: (types: RoomType[]) => void;
  onExportLibrary: (types: RoomType[]) => void;
  onLibraryDirtyChange: (dirty: boolean) => void;
  pickedId: string | null;
  onPick: (roomId: string) => void;
  footer: ReactNode;
}

/** Room types: the type of each room of the page, and the room-type library. */
export function RoomTypesCard({ sceneRef, pageRooms, types, language, library, fileOnlyTypes, onChangeLibrary, onExportLibrary, onLibraryDirtyChange, pickedId, onPick, footer }: RoomTypesCardProps) {
  const untyped = pageRooms.filter((r) => r.roomTypeId === undefined);
  const [tab, setTab] = useState<'rooms' | 'library'>('rooms');
  const [filter, setFilter] = useState<'untyped' | 'all'>(untyped.length > 0 ? 'untyped' : 'all');
  const [message, setMessage] = useState<string | null>(null);
  const [libraryDirty, setLibraryDirty] = useState(false);
  const scene = sceneRef.current;
  const typeName = (id: string | undefined) => {
    const type = id === undefined ? undefined : types.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : null;
  };
  const list = filter === 'untyped' ? untyped : pageRooms;
  const matchAgain = () => {
    const changed = scene?.matchRoomTypesAgain() ?? 0;
    setMessage(changed === 0 ? 'No room changed.' : `${plural(changed, 'room')} changed.`);
  };
  return (
    <>
      <h2>Room types</h2>
      <p className="mep-guide-lead">Rules choose rooms by type. MepApp finds the type from the room name. The type also gives the persons and the demands that a rule can use.</p>
      <div className="mep-guide-seg" role="tablist" aria-label="Room types">
        <button type="button" role="tab" className={tab === 'rooms' ? 'on' : ''} aria-selected={tab === 'rooms'} disabled={libraryDirty} title={libraryDirty ? 'Save or revert the room type first' : undefined} onClick={() => setTab('rooms')}>
          Rooms on this page
        </button>
        <button type="button" role="tab" className={tab === 'library' ? 'on' : ''} aria-selected={tab === 'library'} onClick={() => setTab('library')}>
          Room type library
        </button>
      </div>
      {tab === 'rooms' ? (
        <>
          {untyped.length > 0 ? (
            <div className="mep-guide-callout" data-testid="ap-untyped">
              <span>
                <b>{plural(untyped.length, 'room')}</b> {untyped.length === 1 ? 'has' : 'have'} no type. A rule with room types does not find {untyped.length === 1 ? 'it' : 'them'}. Choose a type, or add a keyword in the library.
              </span>
            </div>
          ) : (
            <div className="mep-guide-callout info">
              <span>Each room on this page has a type.</span>
            </div>
          )}
          <div className="mep-guide-inline">
            <div className="mep-guide-seg" role="group" aria-label="Rooms">
              <button type="button" className={filter === 'untyped' ? 'on' : ''} aria-pressed={filter === 'untyped'} onClick={() => setFilter('untyped')}>
                Without a type ({untyped.length})
              </button>
              <button type="button" className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All ({pageRooms.length})
              </button>
            </div>
            <button type="button" id="ap-match" title="Match the rooms of this drawing by name again. Rooms with a type that you chose keep it." onClick={matchAgain}>
              Match rooms again
            </button>
          </div>
          {message && (
            <p className="mep-guide-note" role="status">
              {message}
            </p>
          )}
          {list.length > 0 && (
            <div className="mep-room-calc-scroll mep-guide-table">
              <table className="mep-room-calc-table" data-testid="ap-type-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type</th>
                    <th>m²</th>
                    <th>Persons</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((room) => {
                    const values = scene?.getRoomValues(room) ?? null;
                    const choice = room.roomTypeSource === 'user' ? (room.roomTypeId ?? NONE) : AUTO;
                    return (
                      <tr key={room.id} className={room.roomTypeId === undefined ? 'bad' : room.id === pickedId ? 'sel' : ''} data-room={room.id} onClick={() => onPick(room.id)}>
                        <td>{roomLabel(room)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            aria-label={`Room type of ${roomLabel(room)}`}
                            data-room={room.id}
                            value={choice}
                            onChange={(e) => {
                              const v = e.target.value;
                              scene?.setRoomType([room.id], v === AUTO ? 'auto' : v === NONE ? null : v);
                            }}
                          >
                            <option value={AUTO}>By name: {room.roomTypeSource !== 'user' ? (typeName(room.roomTypeId) ?? 'no match') : '…'}</option>
                            <option value={NONE}>No type</option>
                            {types.map((t) => (
                              <option key={t.id} value={t.id}>
                                {roomTypeLabel(t, language)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">{fmt(values?.areaM2)}</td>
                        <td className="num">{values?.people ? values.people.count : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mep-guide-note">Each change is one undo step. A type that you choose stays when the room name changes.</p>
        </>
      ) : (
        <>
          <p className="mep-guide-note">The library is yours, not part of the drawing. Each drawing uses the same room types. The numbers count the rooms of this page.</p>
          <RoomTypeLibrary
            types={library}
            fileOnlyTypes={fileOnlyTypes}
            onChange={onChangeLibrary}
            onExport={onExportLibrary}
            onDirtyChange={(dirty) => {
              setLibraryDirty(dirty);
              onLibraryDirtyChange(dirty);
            }}
            roomCountOf={(id) => pageRooms.filter((r) => r.roomTypeId === id).length}
          />
        </>
      )}
      {footer}
    </>
  );
}

export interface CeilingHeightsCardProps {
  sceneRef: { current: SketchScene | null };
  heights: (CeilingHeightContext & { roomTypeMm: Record<string, number> }) | null;
  pageRooms: readonly Room[];
  types: readonly RoomType[];
  language: 'en' | 'nl';
  /** The number of checked rules that use the room volume. */
  volumeRules: number;
  pickedId: string | null;
  onPick: (roomId: string) => void;
  footer: ReactNode;
}

/** Ceiling heights: the four levels, each above the next. An empty box uses the level above it. */
export function CeilingHeightsCard({ sceneRef, heights, pageRooms, types, language, volumeRules, pickedId, onPick, footer }: CeilingHeightsCardProps) {
  const [showAll, setShowAll] = useState(false);
  const scene = sceneRef.current;
  if (!heights) return null;
  const level2 = heights.pdfMm;
  const above3 = level2 ?? heights.globalMm;
  const counts = new Map<string, number>();
  for (const room of pageRooms) if (room.roomTypeId) counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1);
  const shownTypes = showAll ? types : types.filter((t) => counts.has(t.id) || heights.roomTypeMm[t.id] !== undefined);
  const typeHeights = Object.keys(heights.roomTypeMm).length;
  const own = pageRooms.filter((r) => isValidCeilingHeightMm(r.ceilingHeightMm));
  const step = (text: string) => <div className="mep-autoplace-level-step">↓ {text}</div>;
  return (
    <>
      <h2>Ceiling heights</h2>
      <p className="mep-guide-lead">
        The height gives the room volume. A level uses the level above it when you leave its box empty. {volumeRules > 0 ? `${plural(volumeRules, 'checked rule')} use${volumeRules === 1 ? 's' : ''} the volume.` : 'No checked rule uses the volume now.'}
      </p>
      <div className="mep-autoplace-levels" data-testid="ap-heights">
        <section className="mep-autoplace-level" aria-label="Level 1">
          <div className="mep-autoplace-level-head">
            <span className="ln">1</span>
            <span className="lt">All drawings</span>
            <span className="le">{heights.globalMm} mm</span>
          </div>
          <div className="mep-autoplace-level-row">
            <span>Default ceiling height</span>
            <b data-testid="ap-h-global">{heights.globalMm} mm</b>
            <span className="mep-guide-note">Change it in Settings › Rooms.</span>
          </div>
        </section>
        {step('an empty box uses level 1')}
        <section className="mep-autoplace-level" aria-label="Level 2">
          <div className="mep-autoplace-level-head">
            <span className="ln">2</span>
            <span className="lt">This drawing</span>
            <span className="le">{level2 !== undefined ? `${level2} mm` : `empty: ${heights.globalMm} mm from level 1`}</span>
          </div>
          <div className="mep-autoplace-level-row">
            <label htmlFor="ap-h-drawing">Ceiling height of this drawing (mm)</label>
            <OptionalNumberInput id="ap-h-drawing" value={level2} placeholder={String(heights.globalMm)} allow={allowHeight} onCommit={(mm) => scene?.setDrawingCeilingHeight(mm)} />
            <span className="mep-guide-note">Saved in the drawing.</span>
          </div>
        </section>
        {step('an empty box uses level 2')}
        <section className="mep-autoplace-level" aria-label="Level 3">
          <div className="mep-autoplace-level-head">
            <span className="ln">3</span>
            <span className="lt">Room types in this drawing</span>
            <span className="le">{typeHeights > 0 ? `${plural(typeHeights, 'type')} with an own height` : `empty: ${above3} mm from level ${level2 !== undefined ? 2 : 1}`}</span>
          </div>
          {shownTypes.map((t) => (
            <div className="mep-autoplace-level-row" key={t.id}>
              <label htmlFor={`ap-h-type-${t.id}`}>
                {roomTypeLabel(t, language)} <span className="mep-guide-note">{plural(counts.get(t.id) ?? 0, 'room')}</span>
              </label>
              <OptionalNumberInput id={`ap-h-type-${t.id}`} value={heights.roomTypeMm[t.id]} placeholder={String(above3)} allow={allowHeight} onCommit={(mm) => scene?.setRoomTypeCeilingHeight(t.id, mm)} />
            </div>
          ))}
          {shownTypes.length === 0 && <p className="mep-guide-note">No room on this page has a type.</p>}
          <p className="mep-guide-note">
            <button type="button" className="mep-guide-link" id="ap-h-all" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show only the types on this page' : `Show all ${types.length} room types`}
            </button>{' '}
            The heights are saved in the drawing, not in the room type library.
          </p>
        </section>
        {step('an empty box uses level 3')}
        <section className="mep-autoplace-level" aria-label="Level 4">
          <div className="mep-autoplace-level-head">
            <span className="ln">4</span>
            <span className="lt">One room</span>
            <span className="le">{plural(own.length, 'room')} with an own height</span>
          </div>
          {own.map((room) => (
            <button key={room.id} type="button" className={`mep-autoplace-level-row pick${room.id === pickedId ? ' sel' : ''}`} data-room={room.id} onClick={() => onPick(room.id)}>
              <span>{roomLabel(room)}</span>
              <b>{room.ceilingHeightMm} mm</b>
            </button>
          ))}
          {own.length === 0 && <p className="mep-guide-note">No room on this page has an own height.</p>}
          <p className="mep-guide-note">Set the height of one room in Room Properties. Click a room on the plan to see its height and its level.</p>
        </section>
      </div>
      {footer}
    </>
  );
}
