import { useEffect, useRef, useState } from 'react';
import {
  allNeeds,
  copyRoomDemands,
  demandTotal,
  NEED_KIND_LABELS,
  NEED_KIND_UNITS,
  OWN_NEED_KINDS,
  parseDecimal,
  parseRoomNeeds,
  parseRoomTypeKeywords,
  parseRoomTypes,
  roomPeople,
  ROOM_TYPE_DEMAND_EXAMPLES,
  validateRoomNeed,
  validateRoomTypeFields,
  type NeedKind,
  type Room,
  type RoomDemands,
  type RoomNeed,
  type RoomType,
  type RoomValues,
} from '@mepapp/core';
import {
  calcKey,
  calcLabel,
  calcOfKey,
  calcsOfKind,
  DemandTextError,
  demandDraftOf,
  demandOfDraft,
  demandShort,
  demandSumText,
  EVERY_OF,
  everyBefore,
  fmtNum,
  fmtTotal,
  newDemandDraft,
  totalUnit,
  type DemandDraft,
} from './roomDemandText.js';

/** A room of the page with the type: its values give the result lines of the details. */
export interface RoomTypeSample {
  label: string;
  room: Room;
  values: RoomValues;
}

export interface RoomTypeLibraryProps {
  /** The user library. */
  types: RoomType[];
  /** Types in the active drawing's file that the library lacks. */
  fileOnlyTypes: RoomType[];
  /** The own needs of the user library. */
  needs: RoomNeed[];
  /** Own needs in the active drawing's file that the library lacks. */
  fileOnlyNeeds?: RoomNeed[];
  onChange: (types: RoomType[]) => void;
  onChangeNeeds: (needs: RoomNeed[]) => void;
  /** Saves the list and the own needs it uses as a JSON file. */
  onExport: (types: RoomType[], needs: RoomNeed[]) => void;
  /** Called when the details get or lose changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
  /** The number of rooms of the shown page with a type; shown next to each type. */
  roomCountOf?: (typeId: string) => number;
  /** A room of the page with the type, for the result lines. Null = none. */
  sampleOf?: (typeId: string) => RoomTypeSample | null;
  /** Opens the details of this room type at this need. A new object opens it again. */
  focus?: { typeId: string; needId?: string } | null;
}

const newTypeId = () => `room-type-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const newNeedId = () => `need-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** The column of the area per person in the table. */
const PERSONS = 'persons';
/** The "Add a need" list gets the focus after a need is removed. */
const ADD_NEED = 'add-need';

type NeedPanel = { kind: 'new' } | { kind: 'edit'; needId: string } | { kind: 'delete'; needId: string };

/** The own needs that the types use, from the library or the file. */
function usedOwnNeeds(types: readonly RoomType[], own: readonly RoomNeed[]): RoomNeed[] {
  const ids = new Set(types.flatMap((t) => Object.keys(t.demands ?? {})));
  return own.filter((n) => ids.has(n.id));
}

/**
 * Edits the user library of room types (room-type-calculations.md §5.1, layout B): a table with one
 * row for each room type and one column for each need, and below it the details of the room type
 * that the user clicks (name, Dutch name, keywords, area per person, and the calculation of each
 * need). The user adds own needs, renames and deletes them here. Import and Export. The library is
 * not part of a drawing. A type that only the drawing's file holds can be added to the library.
 * The Room types card of Auto-place hosts it.
 */
export function RoomTypeLibrary({ types, fileOnlyTypes, needs, fileOnlyNeeds = [], onChange, onChangeNeeds, onExport, onDirtyChange, roomCountOf, sampleOf, focus }: RoomTypeLibraryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusNeed, setFocusNeed] = useState<{ id: string; at: number } | null>(null);
  /** A link opened a type that only the drawing's file has: the details need it in the library first. */
  const [fileFocus, setFileFocus] = useState<{ type: RoomType; needId?: string } | null>(null);
  const [dirty, setDirtyState] = useState(false);
  const [panel, setPanel] = useState<NeedPanel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const columns = allNeeds(needs);
  const known = allNeeds([...needs, ...fileOnlyNeeds.filter((n) => !needs.some((m) => m.id === n.id))]);
  const selected = types.find((t) => t.id === selectedId) ?? null;
  const busy = dirty ? 'Save or revert your changes first' : undefined;
  const setDirty = (next: boolean) => {
    setDirtyState(next);
    onDirtyChange?.(next);
  };

  useEffect(() => {
    if (!focus || dirty) return;
    const fileType = types.some((t) => t.id === focus.typeId) ? undefined : fileOnlyTypes.find((t) => t.id === focus.typeId);
    setFileFocus(fileType ? { type: fileType, ...(focus.needId ? { needId: focus.needId } : {}) } : null);
    setSelectedId(fileType ? null : focus.typeId);
    setFocusNeed(!fileType && focus.needId ? { id: focus.needId, at: Date.now() } : null);
    // Only a new focus object opens the details again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const open = (typeId: string, needId?: string) => {
    setSelectedId(typeId);
    setFocusNeed(needId ? { id: needId, at: Date.now() } : null);
    setFileFocus(null);
    setMessage(null);
  };

  const addType = () => {
    const created: RoomType = { id: newTypeId(), name: uniqueName('New room type', types), keywords: [] };
    onChange([...types, created]);
    open(created.id);
  };

  /** The own needs of the file that the type uses and the library lacks. */
  const missingNeedsOf = (type: RoomType) => usedOwnNeeds([type], fileOnlyNeeds).filter((n) => !needs.some((m) => m.id === n.id));

  const addToLibrary = (type: RoomType, needId?: string) => {
    onChange([...types, { ...type, name: uniqueName(type.name, types) }]);
    const missing = missingNeedsOf(type);
    if (missing.length > 0) onChangeNeeds([...needs, ...missing]);
    open(type.id, needId);
  };

  /** Fills the empty values of each type that has example values. */
  const fillAll = () => {
    const filled: string[] = [];
    const next = types.map((type) => {
      const example = ROOM_TYPE_DEMAND_EXAMPLES[type.id];
      if (!example) return type;
      const result: RoomType = { ...type };
      let changed = false;
      if (example.areaPerPersonM2 !== undefined && type.areaPerPersonM2 === undefined) {
        result.areaPerPersonM2 = example.areaPerPersonM2;
        changed = true;
      }
      const demands: RoomDemands = copyRoomDemands(type.demands ?? {});
      for (const [needId, demand] of Object.entries(copyRoomDemands(example.demands))) {
        if (demands[needId]) continue;
        demands[needId] = demand;
        changed = true;
      }
      if (!changed) return type;
      result.demands = demands;
      filled.push(type.name);
      return result;
    });
    if (filled.length > 0) onChange(next);
    const without = types.filter((type) => !ROOM_TYPE_DEMAND_EXAMPLES[type.id]).map((type) => type.name);
    setMessage(
      (filled.length > 0
        ? `MepApp filled in the empty values of ${plural(filled.length, 'room type')}: ${filled.join(', ')}. Check them against the rules of your project.`
        : 'Each room type with example values has them already.') + (without.length > 0 ? ` MepApp has no example values for ${without.join(', ')}.` : ''),
    );
  };

  const importFile = async (file: File) => {
    try {
      const raw: unknown = JSON.parse(await file.text());
      const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
      const imported = parseRoomTypes(record ? record.roomTypes : raw);
      if (!imported) {
        setMessage(`${file.name} does not hold a list of room types.`);
        return;
      }
      const importedNeeds = record ? (parseRoomNeeds(record.roomNeeds) ?? []) : [];
      const importedIds = new Set(imported.map((t) => t.id));
      onChange([...types.map((t) => imported.find((i) => i.id === t.id) ?? t), ...imported.filter((i) => !types.some((t) => t.id === i.id))]);
      if (importedNeeds.length > 0) onChangeNeeds([...needs.map((n) => importedNeeds.find((i) => i.id === n.id) ?? n), ...importedNeeds.filter((i) => !needs.some((n) => n.id === i.id))]);
      setMessage(
        `Imported ${plural(imported.length, 'room type')} (${types.filter((t) => importedIds.has(t.id)).length} replaced)${importedNeeds.length > 0 ? ` and ${plural(importedNeeds.length, 'own need')}` : ''}.`,
      );
    } catch {
      setMessage(`Could not read ${file.name}.`);
    }
  };

  const panelNeed = panel && panel.kind !== 'new' ? needs.find((n) => n.id === panel.needId) : undefined;

  return (
    <>
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
      <div className="mep-guide-inline mep-rt-tools">
        <button type="button" disabled={dirty} title={busy ?? 'Fill the empty values of the built-in room types with example values'} onClick={fillAll} data-testid="rt-fill-all">
          Fill in the example values
        </button>
        <button type="button" disabled={dirty} title={busy} onClick={() => setPanel({ kind: 'new' })} data-testid="rt-new-need">
          + New need…
        </button>
      </div>
      {panel?.kind === 'new' && (
        <NeedForm
          others={needs}
          onCancel={() => setPanel(null)}
          onSave={(need) => {
            onChangeNeeds([...needs, need]);
            setPanel(null);
            setMessage(`MepApp added the need ${need.name}. Click a cell in its column to add it to a room type.`);
          }}
        />
      )}
      {panel?.kind === 'edit' && panelNeed && (
        <NeedForm
          key={panelNeed.id}
          need={panelNeed}
          others={needs.filter((n) => n.id !== panelNeed.id)}
          onCancel={() => setPanel(null)}
          onSave={(need) => {
            onChangeNeeds(needs.map((n) => (n.id === need.id ? need : n)));
            setPanel(null);
          }}
          onDelete={() => setPanel({ kind: 'delete', needId: panelNeed.id })}
          busy={busy}
        />
      )}
      {panel?.kind === 'delete' && panelNeed && (
        <DeleteNeed
          need={panelNeed}
          users={types.filter((t) => t.demands?.[panelNeed.id])}
          busy={busy}
          onCancel={() => setPanel(null)}
          onDelete={() => {
            onChange(
              types.map((t) => {
                if (!t.demands?.[panelNeed.id]) return t;
                const { [panelNeed.id]: _gone, ...rest } = t.demands;
                const { demands: _old, ...type } = t;
                return Object.keys(rest).length > 0 ? { ...type, demands: rest } : type;
              }),
            );
            onChangeNeeds(needs.filter((n) => n.id !== panelNeed.id));
            setPanel(null);
            setMessage(`MepApp deleted the need ${panelNeed.name}.`);
          }}
        />
      )}
      <div className="mep-rt-scroll">
        <table className="mep-rt-table" aria-label="Room types and their needs" data-testid="rt-table">
          <thead>
            <tr>
              <th scope="col" className="mep-rt-name">
                Room type<span>{roomCountOf ? 'rooms on this page' : 'keywords'}</span>
              </th>
              <th scope="col">
                Persons<span>m² per person</span>
              </th>
              {columns.map((need) => (
                <th scope="col" key={need.id} data-need={need.id}>
                  {need.own ? (
                    <button type="button" className="mep-guide-link" disabled={dirty} title={busy ?? 'Rename or delete this need'} onClick={() => setPanel({ kind: 'edit', needId: need.id })}>
                      {need.name}
                    </button>
                  ) : (
                    need.name
                  )}
                  <span>{need.unit}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const locked = dirty && type.id !== selected?.id;
              const cell = (needId: string, label: string, text: string | null) => (
                <td key={needId}>
                  <button
                    type="button"
                    className={`mep-rt-cell${text === null ? ' none' : ''}`}
                    data-type={type.id}
                    data-need={needId}
                    aria-label={`${type.name}, ${label}: ${text ?? 'none'}`}
                    aria-pressed={type.id === selected?.id && focusNeed?.id === needId}
                    disabled={locked}
                    title={locked ? busy : undefined}
                    onClick={() => open(type.id, needId)}
                  >
                    {text ?? '–'}
                  </button>
                </td>
              );
              return (
                <tr key={type.id} className={type.id === selected?.id ? 'on' : ''} data-type={type.id}>
                  <th scope="row" className="mep-rt-name">
                    <button type="button" disabled={locked} title={locked ? busy : undefined} onClick={() => open(type.id)}>
                      <span>{type.name}</span>
                      <span className="mep-circuit-types-abbr">{roomCountOf ? roomCountOf(type.id) : type.keywords.length}</span>
                    </button>
                  </th>
                  {cell(PERSONS, 'persons', type.areaPerPersonM2 !== undefined ? `${fmtNum(type.areaPerPersonM2)} m²/person` : null)}
                  {columns.map((need) => {
                    const demand = type.demands?.[need.id];
                    return cell(need.id, need.name, demand ? demandShort(demand) : null);
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mep-guide-inline mep-rt-under">
        <button type="button" className="mep-circuit-types-new" disabled={dirty} title={busy} onClick={addType}>
          + New room type
        </button>
        {fileOnlyTypes.length > 0 && (
          <>
            <span className="mep-room-types-heading">Only in this drawing:</span>
            {fileOnlyTypes.map((type) => (
              <button key={type.id} type="button" className="mep-circuit-types-item" disabled={dirty} title={busy ?? 'Add this room type to your library'} onClick={() => addToLibrary(type)}>
                <span>{type.name}</span>
                <span className="mep-circuit-types-abbr">+ add</span>
              </button>
            ))}
          </>
        )}
      </div>
      {message && (
        <p className="mep-settings-hint" role="status" data-testid="rt-message">
          {message}
        </p>
      )}
      {selected ? (
        <RoomTypeForm
          key={JSON.stringify(selected)}
          type={selected}
          others={types.filter((t) => t.id !== selected.id)}
          needs={known}
          focusNeed={focusNeed}
          sample={sampleOf?.(selected.id) ?? null}
          onDirtyChange={setDirty}
          onSave={(next) => {
            onChange(types.map((t) => (t.id === next.id ? next : t)));
            // A demand for an own need of the drawing's file: the need goes to the library too, so the table and Export have it.
            const missing = missingNeedsOf(next);
            if (missing.length > 0) {
              onChangeNeeds([...needs, ...missing]);
              setMessage(`MepApp added the need ${missing.map((n) => n.name).join(', ')} of this drawing to your library.`);
            }
            setFocusNeed(null);
          }}
          onDelete={() => {
            onChange(types.filter((t) => t.id !== selected.id));
            setSelectedId(null);
          }}
        />
      ) : fileFocus ? (
        <div className="mep-guide-callout" data-testid="rt-file-only">
          <span>
            {fileFocus.type.name} is only in this drawing, not in your library. Add it to your library to change its needs.
          </span>
          <div className="mep-guide-inline">
            <button type="button" onClick={() => addToLibrary(fileFocus.type, fileFocus.needId)}>
              + Add {fileFocus.type.name} to your library
            </button>
          </div>
        </div>
      ) : (
        <p className="mep-guide-note">Click a room type or a cell to see the details below the table.</p>
      )}
      <div className="mep-circuit-types-actions">
        <button type="button" disabled={dirty} title={busy} onClick={() => fileInput.current?.click()}>
          Import…
        </button>
        <button type="button" disabled={dirty} title={busy} onClick={() => onExport(types, usedOwnNeeds(types, needs))}>
          Export…
        </button>
      </div>
    </>
  );
}

function uniqueName(base: string, types: readonly { name: string }[]): string {
  const taken = new Set(types.map((t) => t.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

const KIND_UNIT_HINT: Record<NeedKind, string> = {
  light: '',
  flow: 'The room types use dm³/s. A rule can count in dm³/s, l/s or m³/h.',
  power: 'The room types use W. A rule can count in W or kW.',
  count: 'A room type can also say "1 per N m²".',
  amount: 'A room type can also say "1 per N m²".',
};

/** The form of a new own need, or of an own need to rename. Kind is fixed after the need exists. */
function NeedForm({ need, others, onSave, onCancel, onDelete, busy }: { need?: RoomNeed; others: RoomNeed[]; onSave: (need: RoomNeed) => void; onCancel: () => void; onDelete?: () => void; busy?: string }) {
  const [name, setName] = useState(need?.name ?? '');
  const [kind, setKind] = useState<NeedKind>(need?.kind ?? 'count');
  const [unit, setUnit] = useState(need && NEED_KIND_UNITS[need.kind] === null ? need.unit : '');
  const [unitOne, setUnitOne] = useState(need?.unitOne ?? '');
  const [error, setError] = useState<string | null>(null);
  const fixedUnit = NEED_KIND_UNITS[kind];
  const save = () => {
    const next: RoomNeed = { id: need?.id ?? newNeedId(), name: name.trim(), kind, unit: fixedUnit ?? unit.trim(), own: true };
    if (kind === 'count' && unitOne.trim()) next.unitOne = unitOne.trim();
    const problem = validateRoomNeed(next, others);
    if (problem) setError(problem);
    else onSave(next);
  };
  return (
    <div className="mep-guide-formula mep-rt-need-form" data-testid="rt-need-form">
      <div className="mep-guide-term">
        <b>{need ? `Need: ${need.name}` : 'New need'}</b>
      </div>
      <div className="mep-guide-term">
        <label className="mep-guide-label" htmlFor="rt-need-name">
          Name
        </label>
        <input id="rt-need-name" className="mep-guide-num wide" type="text" placeholder="for example Data outlets" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
      </div>
      <div className="mep-guide-term">
        <label className="mep-guide-label" htmlFor="rt-need-kind">
          It is
        </label>
        <select id="rt-need-kind" className="mep-guide-unit" value={kind} disabled={need !== undefined} title={need ? 'A need keeps its kind. Make a new need for another kind.' : undefined} onChange={(e) => (setKind(e.target.value as NeedKind), setError(null))}>
          {OWN_NEED_KINDS.map((k) => (
            <option key={k} value={k}>
              {NEED_KIND_LABELS[k].toLowerCase()}
              {NEED_KIND_UNITS[k] ? ` (${NEED_KIND_UNITS[k]})` : ''}
            </option>
          ))}
        </select>
      </div>
      {fixedUnit === null && (
        <div className="mep-guide-term">
          <label className="mep-guide-label" htmlFor="rt-need-unit">
            Unit
          </label>
          <input id="rt-need-unit" className="mep-guide-num wide" type="text" placeholder={kind === 'count' ? 'for example outlets' : 'for example kg'} value={unit} onChange={(e) => (setUnit(e.target.value), setError(null))} />
        </div>
      )}
      {kind === 'count' && (
        <div className="mep-guide-term">
          <label className="mep-guide-label" htmlFor="rt-need-one">
            Unit after 1
          </label>
          <input id="rt-need-one" className="mep-guide-num wide" type="text" placeholder={unit.trim() || 'for example outlet'} value={unitOne} onChange={(e) => setUnitOne(e.target.value)} />
          <span className="mep-guide-note">For example "outlet" in "1 outlet per 10 m²". Empty: MepApp uses the unit.</span>
        </div>
      )}
      <div className="mep-guide-term">
        <span className="mep-guide-note">{KIND_UNIT_HINT[kind]} Each room type then chooses its calculation for the need.</span>
      </div>
      {error && (
        <div className="mep-guide-term mep-circuit-types-error" role="alert">
          {error}
        </div>
      )}
      <div className="mep-guide-term mep-guide-inline">
        <button type="button" className="primary" onClick={save} data-testid="rt-need-save">
          {need ? 'Save' : 'Add the need'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={busy !== undefined} title={busy} data-testid="rt-need-delete">
            Delete…
          </button>
        )}
      </div>
    </div>
  );
}

/** Asks in the page before an own need goes (no window.confirm in the ui package). */
function DeleteNeed({ need, users, busy, onDelete, onCancel }: { need: RoomNeed; users: RoomType[]; busy?: string; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="mep-guide-callout bad" role="alert" data-testid="rt-delete-need">
      <b>Delete the need {need.name}?</b>
      <span>
        {users.length > 0 ? `${plural(users.length, 'room type')} lose${users.length === 1 ? 's' : ''} its numbers: ${users.map((t) => t.name).join(', ')}.` : 'No room type has numbers for it.'} A rule that serves it places no stamps until it gets another
        need. You cannot undo this.
      </span>
      <div className="mep-guide-inline">
        <button type="button" onClick={onDelete} disabled={busy !== undefined} title={busy} data-testid="rt-delete-need-yes">
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface RoomTypeFormProps {
  type: RoomType;
  others: RoomType[];
  /** The needs that the demands can use: built-in, own, and own needs of the drawing's file. */
  needs: RoomNeed[];
  /** The need to show: the details scroll to it. */
  focusNeed: { id: string; at: number } | null;
  sample: RoomTypeSample | null;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (type: RoomType) => void;
  onDelete: () => void;
}

interface TypeDraft {
  name: string;
  nameNl: string;
  keywords: string;
  areaPerPerson: string;
  demands: Record<string, DemandDraft>;
}

function draftOfType(type: RoomType, needs: readonly RoomNeed[]): TypeDraft {
  const demands: Record<string, DemandDraft> = {};
  for (const need of needs) {
    const demand = type.demands?.[need.id];
    if (demand) demands[need.id] = demandDraftOf(demand);
  }
  return { name: type.name, nameNl: type.nameNl ?? '', keywords: type.keywords.join(', '), areaPerPerson: type.areaPerPersonM2 !== undefined ? String(type.areaPerPersonM2) : '', demands };
}

/** The details of one room type. Local draft with explicit Save and Revert. Its parent gives it a `key` built from the saved values, so it re-seeds after a save. */
function RoomTypeForm({ type, others, needs, focusNeed, sample, onDirtyChange, onSave, onDelete }: RoomTypeFormProps) {
  const initial = draftOfType(type, needs);
  const example = ROOM_TYPE_DEMAND_EXAMPLES[type.id];
  const [draft, setDraftState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const root = useRef<HTMLElement | null>(null);
  /** The need whose calculation gets the focus after the next render (a need was added), or ADD_NEED (a need was removed). */
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  // The form goes with its changes (another key, or no type selected): the library is not dirty then.
  const dirtyChange = useRef(onDirtyChange);
  dirtyChange.current = onDirtyChange;
  useEffect(() => () => dirtyChange.current(false), []);

  useEffect(() => {
    if (!focusNeed) {
      root.current?.scrollIntoView({ block: 'nearest' });
      // After Save the details are new, and the clicked button went with the old ones.
      if (document.activeElement === document.body) root.current?.focus({ preventScroll: true });
      return;
    }
    const target = root.current?.querySelector<HTMLElement>(`[data-demand="${focusNeed.id}"]`);
    target?.scrollIntoView({ block: 'nearest' });
    (target?.querySelector<HTMLElement>('select, input') ?? target?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  }, [focusNeed]);

  useEffect(() => {
    if (!focusAfter) return;
    const target = focusAfter === ADD_NEED ? root.current?.querySelector<HTMLElement>('#rt-add-need') : root.current?.querySelector<HTMLElement>(`[data-demand="${focusAfter}"]`)?.querySelector<HTMLElement>('select, input');
    target?.focus();
    setFocusAfter(null);
  }, [focusAfter]);

  const setDraft = (next: (d: TypeDraft) => TypeDraft) => {
    const result = next(draft);
    setDraftState(result);
    onDirtyChange(JSON.stringify(result) !== JSON.stringify(initial));
    setError(null);
  };
  const setField = (field: 'name' | 'nameNl' | 'keywords' | 'areaPerPerson') => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const setDemand = (needId: string, next: DemandDraft | null) =>
    setDraft((d) => {
      const demands = { ...d.demands };
      if (next) demands[needId] = next;
      else delete demands[needId];
      return { ...d, demands };
    });
  const addDemand = (need: RoomNeed) => {
    setDemand(need.id, newDemandDraft(need));
    setFocusAfter(need.id);
  };

  const revert = () => {
    setDraftState(initial);
    setError(null);
    onDirtyChange(false);
  };

  /** Fills the empty values with the example values of the type. */
  const fillExample = () => {
    if (!example) return;
    setDraft((d) => {
      const demands = { ...d.demands };
      for (const [needId, demand] of Object.entries(example.demands)) if (!demands[needId]) demands[needId] = demandDraftOf(demand);
      return { ...d, areaPerPerson: d.areaPerPerson.trim() || (example.areaPerPersonM2 !== undefined ? String(example.areaPerPersonM2) : ''), demands };
    });
  };

  const save = () => {
    const area = draft.areaPerPerson.trim() === '' ? undefined : (parseDecimal(draft.areaPerPerson.trim()) ?? Number.NaN);
    const next: RoomType = { id: type.id, name: draft.name.trim(), keywords: parseRoomTypeKeywords(draft.keywords) };
    if (draft.nameNl.trim()) next.nameNl = draft.nameNl.trim();
    if (area !== undefined) next.areaPerPersonM2 = area;
    const demands: RoomDemands = {};
    try {
      for (const need of needs) {
        const d = draft.demands[need.id];
        if (d) demands[need.id] = demandOfDraft(need, d);
      }
    } catch (e) {
      if (e instanceof DemandTextError) {
        setError(e.message);
        return;
      }
      throw e;
    }
    if (Object.keys(demands).length > 0) next.demands = demands;
    const problem = validateRoomTypeFields(next, others, needs);
    if (problem) {
      setError(problem);
      return;
    }
    onDirtyChange(false);
    onSave(next);
  };

  const app = draft.areaPerPerson.trim() === '' ? undefined : (parseDecimal(draft.areaPerPerson.trim()) ?? undefined);
  const people = sample ? roomPeople(sample.room, sample.values.areaM2, app !== undefined && app > 0 ? { areaPerPersonM2: app } : undefined) : null;
  const personsLine = !sample
    ? null
    : people === null
      ? `${sample.label}: no area per person, so no persons.`
      : people.source === 'room'
        ? `${sample.label}: the room has its own number, ${plural(people.count, 'person')}.`
        : `${sample.label}: ${fmtNum(sample.values.areaM2 ?? 0, 1)} m² ÷ ${fmtNum(app!)} = ${plural(people.count, 'person')}, rounded down`;
  const shown = needs.filter((n) => draft.demands[n.id]);
  const lacking = needs.filter((n) => !draft.demands[n.id]);
  const focusMissing = focusNeed && !draft.demands[focusNeed.id] ? needs.find((n) => n.id === focusNeed.id) : undefined;

  return (
    <section className="mep-circuit-types-form mep-rt-details" ref={root} tabIndex={-1} aria-label={`Details of ${type.name}`} data-testid="rt-details" data-type={type.id}>
      <h3>{type.name}</h3>
      <div className="mep-field-row">
        <label htmlFor="rt-name">Name</label>
        <input id="rt-name" type="text" value={draft.name} onChange={(e) => setField('name')(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="rt-name-nl">Dutch name</label>
        <input id="rt-name-nl" type="text" value={draft.nameNl} onChange={(e) => setField('nameNl')(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="rt-keywords">Keywords</label>
        <textarea id="rt-keywords" className="mep-room-types-keywords" rows={3} value={draft.keywords} onChange={(e) => setField('keywords')(e.target.value)} />
      </div>
      <p className="mep-settings-hint">Separate keywords with commas. A keyword matches a word of the room name that starts or ends with it (“toilet” matches “toiletruimte”). A keyword of 3 letters or less must be the whole word.</p>
      <h5 className="mep-room-types-group">Persons</h5>
      <div className="mep-guide-formula" data-demand={PERSONS}>
        <div className="mep-guide-term">
          <label htmlFor="rt-area">Area per person</label>
          <input id="rt-area" type="text" inputMode="decimal" placeholder="none" value={draft.areaPerPerson} onChange={(e) => setField('areaPerPerson')(e.target.value)} />
          <span>m²</span>
        </div>
        {personsLine && (
          <div className="mep-guide-term result" data-testid="rt-persons-sample">
            {personsLine}
          </div>
        )}
      </div>
      <h5 className="mep-room-types-group">Needs and their calculations</h5>
      {shown.length === 0 && <p className="mep-guide-note">This room type has no needs yet. A rule for a need does not place stamps in its rooms.</p>}
      {shown.map((need) => (
        <DemandEditor
          key={need.id}
          need={need}
          typeName={draft.name.trim() || type.name}
          draft={draft.demands[need.id]!}
          sample={sample}
          people={people}
          onChange={(next) => {
            setDemand(need.id, next);
            if (!next) setFocusAfter(ADD_NEED);
          }}
        />
      ))}
      {focusMissing && (
        <div className="mep-guide-callout" data-demand={focusMissing.id} data-testid="rt-missing-need">
          <span>
            {type.name} has no {focusMissing.name}. A rule for {focusMissing.name} places no stamps in its rooms.
          </span>
          <div className="mep-guide-inline">
            <button type="button" onClick={() => addDemand(focusMissing)}>
              + Add {focusMissing.name}
            </button>
          </div>
        </div>
      )}
      {lacking.length > 0 && (
        <div className="mep-guide-inline mep-rt-add-need">
          <label htmlFor="rt-add-need">Add a need</label>
          <select
            id="rt-add-need"
            className="mep-guide-unit"
            value=""
            onChange={(e) => {
              const need = needs.find((n) => n.id === e.target.value);
              if (need) addDemand(need);
            }}
          >
            <option value="">Choose…</option>
            {lacking.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {example && (
        <p className="mep-settings-hint">
          <button type="button" onClick={fillExample} data-testid="rt-fill-example">
            Fill in the example values
          </button>{' '}
          Only the empty values. Dutch new build (Bbl, NEN-EN 12464-1, practice): check the values against the rules of your project.
        </p>
      )}
      {error && (
        <div className="mep-circuit-types-error" role="alert">
          {error}
        </div>
      )}
      <div className="mep-circuit-types-actions">
        <button type="button" className="primary" onClick={save} disabled={!dirty}>
          Save
        </button>
        <button type="button" onClick={revert} disabled={!dirty}>
          Revert
        </button>
        <button type="button" onClick={onDelete} disabled={dirty} title="Delete this room type from your library. Rooms that use it keep it as a copy in the drawing.">
          Delete
        </button>
      </div>
    </section>
  );
}

interface DemandEditorProps {
  need: RoomNeed;
  typeName: string;
  draft: DemandDraft;
  sample: RoomTypeSample | null;
  people: ReturnType<typeof roomPeople>;
  onChange: (draft: DemandDraft | null) => void;
}

/** The calculation and the numbers of one need, and the result in the sample room. */
function DemandEditor({ need, typeName, draft, sample, people, onChange }: DemandEditorProps) {
  const id = `rt-${need.id}`;
  const setTerm = (i: number, patch: Partial<DemandDraft['terms'][number]>) => onChange({ ...draft, terms: draft.terms.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const calcs = calcsOfKind(need.kind);
  let line: string;
  try {
    const demand = demandOfDraft(need, draft);
    if (!sample) line = 'No room of this type on this page.';
    else if (demand.terms.some((t) => (t.every === undefined ? t.value === undefined : !(t.every > 0)))) line = 'Enter the numbers to see the result in a room.';
    else {
      const result = demandTotal(need, demand, { ...sample.values, people });
      line =
        result.total === null
          ? `${sample.label}: ${result.problems.includes('noPeople') ? 'no persons. Enter the area per person above.' : result.problems.includes('noCalibration') ? 'the page has no scale.' : 'a calculation does not work with this need.'}`
          : `${sample.label}: ${demandSumText(need, result)}${result.minimumApplied ? ' → at least the minimum' : ''} = ${fmtTotal(result.total)} ${totalUnit(need)}`;
    }
  } catch (e) {
    if (!(e instanceof DemandTextError)) throw e;
    line = e.message;
  }
  return (
    <div className="mep-guide-formula mep-rt-demand" data-demand={need.id}>
      <div className="mep-guide-term mep-rt-demand-head">
        <b>{need.name}</b>
        <span className="mep-guide-note">{need.unit}</span>
        {need.own && <span className="mep-rt-tag">your need</span>}
        <button type="button" className="mep-guide-link mep-rt-remove" onClick={() => onChange(null)} data-testid={`${id}-remove`}>
          Remove {need.name}
        </button>
      </div>
      {need.kind === 'light' ? (
        <div className="mep-guide-term">
          <span>E</span>
          <input id={`${id}-v-0`} type="text" inputMode="decimal" placeholder="?" aria-label={`Illuminance of ${typeName}`} value={draft.terms[0]?.text ?? ''} onChange={(e) => setTerm(0, { text: e.target.value })} />
          <span>lx on a working plane at</span>
          <input id={`${id}-wp`} type="text" inputMode="decimal" placeholder="0.75" aria-label={`Working-plane height of ${typeName}`} value={draft.workingPlane} onChange={(e) => onChange({ ...draft, workingPlane: e.target.value })} />
          <span>m above the floor</span>
        </div>
      ) : (
        draft.terms.map((term, i) => {
          const calc = calcOfKey(term.key);
          const box = (
            <input id={`${id}-v-${i}`} type="text" inputMode="decimal" placeholder="?" aria-label={`${need.name} of ${typeName}, ${calcLabel(calc)}`} value={term.text} onChange={(e) => setTerm(i, { text: e.target.value })} />
          );
          return (
            <div className="mep-guide-term" key={i}>
              {i > 0 && <span className="mep-guide-op">+</span>}
              <select className="mep-guide-unit" id={`${id}-calc-${i}`} aria-label={`Calculation ${i + 1} of ${need.name}`} value={term.key} onChange={(e) => setTerm(i, { key: e.target.value })}>
                {calcs.map((c) => (
                  <option key={calcKey(c)} value={calcKey(c)}>
                    {calcLabel(c)}
                  </option>
                ))}
              </select>
              {calc.every ? (
                <>
                  <span>{everyBefore(need)}</span>
                  {box}
                  <span>{EVERY_OF[calc.basis]}</span>
                </>
              ) : calc.basis === 'volume' ? (
                <>
                  {box}
                  <span>× room volume, per hour</span>
                </>
              ) : (
                <>
                  {box}
                  <span>
                    {need.unit} {calcLabel(calc)}
                  </span>
                </>
              )}
              {draft.terms.length > 1 && (
                <button type="button" className="mep-guide-link" aria-label={`Remove term ${i + 1} of ${need.name}`} onClick={() => onChange({ ...draft, terms: draft.terms.filter((_, k) => k !== i) })}>
                  ×
                </button>
              )}
            </div>
          );
        })
      )}
      {need.kind !== 'light' && draft.minimum !== null && (
        <div className="mep-guide-term">
          <span>At least</span>
          <input id={`${id}-min`} type="text" inputMode="decimal" placeholder="?" aria-label={`Minimum ${need.name} of ${typeName}`} value={draft.minimum} onChange={(e) => onChange({ ...draft, minimum: e.target.value })} />
          <span>{need.unit} per room</span>
          <button type="button" className="mep-guide-link" aria-label={`Remove the minimum of ${need.name}`} onClick={() => onChange({ ...draft, minimum: null })}>
            ×
          </button>
        </div>
      )}
      {need.kind !== 'light' && (
        <div className="mep-guide-term mep-guide-inline">
          <button type="button" className="mep-guide-link" data-testid={`${id}-add-term`} onClick={() => onChange({ ...draft, terms: [...draft.terms, { key: calcKey(calcs.find((c) => !draft.terms.some((t) => t.key === calcKey(c))) ?? calcs[0]!), text: '' }] })}>
            + Add a term (the terms add up)
          </button>
          {draft.minimum === null && (
            <button type="button" className="mep-guide-link" data-testid={`${id}-add-min`} onClick={() => onChange({ ...draft, minimum: '' })}>
              + At least…
            </button>
          )}
        </div>
      )}
      <div className="mep-guide-term result" data-testid={`${id}-sample`}>
        {line}
      </div>
    </div>
  );
}
