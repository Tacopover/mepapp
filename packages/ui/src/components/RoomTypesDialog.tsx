import { useRef, useState } from 'react';
import {
  parseDecimal,
  parseRoomTypeKeywords,
  parseRoomTypes,
  ROOM_DEMAND_FIELDS,
  ROOM_TYPE_DEMAND_EXAMPLES,
  validateRoomTypeFields,
  type RoomDemandKey,
  type RoomDemands,
  type RoomType,
} from '@mepapp/core';
import { Dialog } from './Dialog.js';

export interface RoomTypesDialogProps {
  /** The user library. */
  types: RoomType[];
  /** Types in the active drawing's file that the library lacks. */
  fileOnlyTypes: RoomType[];
  onChange: (types: RoomType[]) => void;
  /** Runs name matching again on the rooms of the active drawing; returns how many rooms changed. */
  onMatchAgain: () => number;
  /** Saves the list as a JSON file. */
  onExport: (types: RoomType[]) => void;
  onClose: () => void;
}

/** The draft key of a demand box. */
const demandField = (key: RoomDemandKey) => `demand.${key}`;

const newTypeId = () => `room-type-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Edits the user library of room types (room-auto-placement.md Phase 1): name, Dutch name, the
 * keywords that name matching uses, the floor area per person and the demands that placement rules
 * use (room-placement-followup.md Phase F). The library is not part of a
 * drawing. A type that only the drawing's file holds can be added to the library.
 */
export function RoomTypesDialog({ types, fileOnlyTypes, onChange, onMatchAgain, onExport, onClose }: RoomTypesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const selected = types.find((t) => t.id === selectedId) ?? null;
  const busy = dirty ? 'Save or revert your changes first' : undefined;

  const addType = () => {
    const created: RoomType = { id: newTypeId(), name: uniqueName('New room type', types), keywords: [] };
    onChange([...types, created]);
    setSelectedId(created.id);
  };

  const addToLibrary = (type: RoomType) => {
    onChange([...types, { ...type, name: uniqueName(type.name, types) }]);
    setSelectedId(type.id);
  };

  const importFile = async (file: File) => {
    try {
      const imported = parseRoomTypes(JSON.parse(await file.text()));
      if (!imported) {
        setMessage(`${file.name} does not hold a list of room types.`);
        return;
      }
      const importedIds = new Set(imported.map((t) => t.id));
      onChange([...types.map((t) => imported.find((i) => i.id === t.id) ?? t), ...imported.filter((i) => !types.some((t) => t.id === i.id))]);
      setMessage(`Imported ${imported.length} room type${imported.length === 1 ? '' : 's'} (${types.filter((t) => importedIds.has(t.id)).length} replaced).`);
    } catch {
      setMessage(`Could not read ${file.name}.`);
    }
  };

  const matchAgain = () => {
    const changed = onMatchAgain();
    setMessage(changed === 0 ? 'No room changed.' : `${changed} room${changed === 1 ? '' : 's'} changed.`);
  };

  return (
    <Dialog
      title="Room types"
      className="mep-modal--room-types"
      onClose={onClose}
      actions={
        <>
          <button type="button" disabled={dirty} title={busy ?? 'Match the rooms of this drawing by name again. Rooms with a type you chose keep it.'} onClick={matchAgain}>
            Match rooms again
          </button>
          <button type="button" disabled={dirty} title={busy} onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <button type="button" disabled={dirty} title={busy} onClick={() => onExport(types)}>
            Export…
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <div className="mep-circuit-types">
        <div className="mep-circuit-types-list" role="listbox" aria-label="Room types">
          {types.map((type) => (
            <button
              key={type.id}
              type="button"
              role="option"
              aria-selected={type.id === selected?.id}
              className={`mep-circuit-types-item${type.id === selected?.id ? ' on' : ''}`}
              disabled={dirty && type.id !== selected?.id}
              title={dirty && type.id !== selected?.id ? busy : undefined}
              onClick={() => setSelectedId(type.id)}
            >
              <span>{type.name}</span>
              <span className="mep-circuit-types-abbr">{type.keywords.length}</span>
            </button>
          ))}
          <button type="button" className="mep-circuit-types-new" disabled={dirty} title={busy} onClick={addType}>
            + New room type
          </button>
          {fileOnlyTypes.length > 0 && (
            <>
              <div className="mep-room-types-heading">Only in this drawing</div>
              {fileOnlyTypes.map((type) => (
                <button key={type.id} type="button" className="mep-circuit-types-item" disabled={dirty} title={busy ?? 'Add this room type to your library'} onClick={() => addToLibrary(type)}>
                  <span>{type.name}</span>
                  <span className="mep-circuit-types-abbr">+ add</span>
                </button>
              ))}
            </>
          )}
        </div>
        {selected ? (
          <RoomTypeForm
            key={JSON.stringify(selected)}
            type={selected}
            others={types.filter((t) => t.id !== selected.id)}
            onDirtyChange={setDirty}
            onSave={(next) => onChange(types.map((t) => (t.id === next.id ? next : t)))}
            onDelete={() => {
              onChange(types.filter((t) => t.id !== selected.id));
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="mep-circuit-types-form">
            <p className="mep-settings-hint">Select a room type, or add a new one.</p>
          </div>
        )}
      </div>
      {message && (
        <p className="mep-settings-hint" role="status">
          {message}
        </p>
      )}
    </Dialog>
  );
}

function uniqueName(base: string, types: readonly RoomType[]): string {
  const taken = new Set(types.map((t) => t.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

interface RoomTypeFormProps {
  type: RoomType;
  others: RoomType[];
  onDirtyChange: (dirty: boolean) => void;
  onSave: (type: RoomType) => void;
  onDelete: () => void;
}

/** The fields of one room type. Local draft with explicit Save and Revert. Its parent gives it a `key` built from the saved values, so it re-seeds after a save. */
function RoomTypeForm({ type, others, onDirtyChange, onSave, onDelete }: RoomTypeFormProps) {
  const initial = {
    name: type.name,
    nameNl: type.nameNl ?? '',
    keywords: type.keywords.join(', '),
    areaPerPerson: type.areaPerPersonM2 !== undefined ? String(type.areaPerPersonM2) : '',
    ...Object.fromEntries(ROOM_DEMAND_FIELDS.map((f) => [demandField(f.key), type.demands?.[f.key] !== undefined ? String(type.demands[f.key]) : ''])),
  };
  const example = ROOM_TYPE_DEMAND_EXAMPLES[type.id];
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = (field: string) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
    onDirtyChange(true);
  };

  const revert = () => {
    setDraft(initial);
    setError(null);
    onDirtyChange(false);
  };

  /** Fills the empty boxes with the example values of the type. */
  const fillExample = () => {
    if (!example) return;
    setDraft((d) => {
      const next: Record<string, string> = { ...d };
      if (example.areaPerPersonM2 !== undefined && !next.areaPerPerson!.trim()) next.areaPerPerson = String(example.areaPerPersonM2);
      for (const f of ROOM_DEMAND_FIELDS) {
        const value = example.demands[f.key];
        if (value !== undefined && !next[demandField(f.key)]!.trim()) next[demandField(f.key)] = String(value);
      }
      return next as typeof d;
    });
    setError(null);
    onDirtyChange(true);
  };

  const save = () => {
    const numberOf = (text: string) => (text.trim() === '' ? undefined : (parseDecimal(text.trim()) ?? Number.NaN));
    const area = numberOf(draft.areaPerPerson);
    const next: RoomType = { id: type.id, name: draft.name.trim(), keywords: parseRoomTypeKeywords(draft.keywords) };
    if (draft.nameNl.trim()) next.nameNl = draft.nameNl.trim();
    if (area !== undefined) next.areaPerPersonM2 = area;
    const demands: RoomDemands = {};
    for (const f of ROOM_DEMAND_FIELDS) {
      const value = numberOf((draft as Record<string, string>)[demandField(f.key)]!);
      if (value !== undefined) demands[f.key] = value;
    }
    if (Object.keys(demands).length > 0) next.demands = demands;
    const problem = validateRoomTypeFields(next, others);
    if (problem) {
      setError(problem);
      return;
    }
    onDirtyChange(false);
    onSave(next);
  };

  return (
    <div className="mep-circuit-types-form">
      <div className="mep-field-row">
        <label htmlFor="rt-name">Name</label>
        <input id="rt-name" type="text" value={draft.name} onChange={(e) => set('name')(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="rt-name-nl">Dutch name</label>
        <input id="rt-name-nl" type="text" value={draft.nameNl} onChange={(e) => set('nameNl')(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="rt-keywords">Keywords</label>
        <textarea id="rt-keywords" className="mep-room-types-keywords" rows={4} value={draft.keywords} onChange={(e) => set('keywords')(e.target.value)} />
      </div>
      <p className="mep-settings-hint">Separate keywords with commas. A keyword matches a word of the room name that starts or ends with it (“toilet” matches “toiletruimte”). A keyword of 3 letters or less must be the whole word.</p>
      <div className="mep-field-row">
        <label htmlFor="rt-area">Area per person (m²)</label>
        <input id="rt-area" type="text" inputMode="decimal" placeholder="none" value={draft.areaPerPerson} onChange={(e) => set('areaPerPerson')(e.target.value)} />
      </div>
      <h5 className="mep-room-types-group">Demands</h5>
      <p className="mep-settings-hint">Placement rules can use these numbers, so one rule serves all room types. An empty box means: not known.</p>
      {ROOM_DEMAND_FIELDS.map((f) => (
        <div className="mep-field-row" key={f.key}>
          <label htmlFor={`rt-${f.key}`}>
            {f.label} ({f.unit})
          </label>
          <input id={`rt-${f.key}`} type="text" inputMode="decimal" placeholder="none" value={(draft as Record<string, string>)[demandField(f.key)]} onChange={(e) => set(demandField(f.key))(e.target.value)} />
        </div>
      ))}
      {example && (
        <p className="mep-settings-hint">
          <button type="button" onClick={fillExample} data-testid="rt-fill-example">
            Fill in the example values
          </button>{' '}
          Dutch new build (Bbl, NEN-EN 12464-1, practice). These are examples: check them against the rules of your project. The button fills only the empty boxes.
        </p>
      )}
      {error && (
        <div className="mep-circuit-types-error" role="alert">
          {error}
        </div>
      )}
      <div className="mep-circuit-types-actions">
        <button type="button" onClick={save} disabled={!dirty}>
          Save
        </button>
        <button type="button" onClick={revert} disabled={!dirty}>
          Revert
        </button>
        <button type="button" onClick={onDelete} disabled={dirty} title="Delete this room type from your library. Rooms that use it keep it as a copy in the drawing.">
          Delete
        </button>
      </div>
    </div>
  );
}
