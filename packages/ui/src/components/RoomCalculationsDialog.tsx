import { useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { calculateRooms, REQUIREMENT_WARNING_TEXT, roomTypeLabel, type PlacementRule, type Room, type RoomCalculationRow } from '@mepapp/core';
import { Dialog } from './Dialog.js';

export interface RoomCalculationsDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The user library of placement rules. */
  rules: PlacementRule[];
  language: 'en' | 'nl';
  onOpenRules: () => void;
  onClose: () => void;
}

type Scope = 'selected' | 'page' | 'all';

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '–' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;

/** Notes of one row: why a value is missing, what limited the count, and whether the room shape needs a check. */
function notesOf(row: RoomCalculationRow): string {
  const notes = row.requirement.warnings.map((w) => REQUIREMENT_WARNING_TEXT[w]);
  if (row.room.open) notes.push('room needs review');
  if (row.room.roomTypeId === undefined) notes.push('no room type');
  return notes.join('; ');
}

/**
 * The dry run of the placement rules (room-auto-placement.md Phase 3): for the chosen rooms and
 * rules, the room values, the required amount and the count of elements. It places no stamps.
 */
export function RoomCalculationsDialog({ sceneRef, rules, language, onOpenRules, onClose }: RoomCalculationsDialogProps) {
  const scene = sceneRef.current;
  const selectedCount = scene?.getSelectedRooms().length ?? 0;
  const [scope, setScope] = useState<Scope>(selectedCount > 0 ? 'selected' : 'page');
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  if (!scene) return null;
  const pageIndex = scene.getPageIndex();
  const rooms = scope === 'selected' ? scene.getSelectedRooms() : scope === 'page' ? scene.listRooms().filter((r) => r.pageIndex === pageIndex) : scene.listRooms();
  const activeRules = rules.filter((r) => !unchecked.has(r.id));
  const { rows, unmatched } = calculateRooms(activeRules, rooms, (room) => scene.getRoomValues(room));
  const types = scene.getRoomTypes();
  const typeName = (id: string | undefined) => {
    if (id === undefined) return '–';
    const type = types.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : id;
  };
  const untyped = unmatched.filter((r) => r.roomTypeId === undefined).length;

  return (
    <Dialog
      title="Room calculations"
      className="mep-modal--room-calculations"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onOpenRules}>
            Placement rules…
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="mep-settings-hint">A check of the numbers before any stamp is placed. Change the rules in Placement rules, and the room values in Room Properties.</p>
      <div className="mep-field-row">
        <label htmlFor="rc-scope">Rooms</label>
        <select id="rc-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          <option value="selected" disabled={selectedCount === 0}>
            Selected rooms ({selectedCount})
          </option>
          <option value="page">Rooms on this page</option>
          <option value="all">All rooms of this drawing</option>
        </select>
      </div>
      <div className="mep-room-calc-rules" role="group" aria-label="Rules">
        {rules.length === 0 && <p className="mep-settings-hint">There are no placement rules. Add one in Placement rules.</p>}
        {rules.map((rule) => (
          <label key={rule.id}>
            <input
              type="checkbox"
              checked={!unchecked.has(rule.id)}
              onChange={(e) => {
                const next = new Set(unchecked);
                if (e.target.checked) next.delete(rule.id);
                else next.add(rule.id);
                setUnchecked(next);
              }}
            />
            {rule.name}
          </label>
        ))}
      </div>
      <div className="mep-room-calc-scroll">
        <table className="mep-room-calc-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Area (m²)</th>
              <th>Volume (m³)</th>
              <th>People</th>
              <th>Rule</th>
              <th>Required</th>
              <th>Capacity</th>
              <th>Count</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.room.id}:${row.rule.id}`} data-room={row.room.id} data-rule={row.rule.id}>
                <td>{roomLabel(row.room)}</td>
                <td>{typeName(row.room.roomTypeId)}</td>
                <td className="num">{fmt(row.values.areaM2)}</td>
                <td className="num">{fmt(row.values.volumeM3)}</td>
                <td className="num">{row.values.people ? row.values.people.count : '–'}</td>
                <td>{row.rule.name}</td>
                <td className="num">{row.requirement.required === null ? '–' : `${fmt(row.requirement.required)} ${row.rule.amount.unit}`.trim()}</td>
                <td className="num">{row.rule.capacityPerElement === undefined ? '–' : fmt(row.rule.capacityPerElement)}</td>
                <td className="num" data-testid="count" title={`From the amount: ${row.requirement.quantityCount ?? '–'}; from coverage: ${row.requirement.coverageCount ?? '–'}`}>
                  {row.requirement.count ?? '–'}
                </td>
                <td>{notesOf(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mep-settings-hint">No rule applies to these rooms.</p>}
      </div>
      <p className="mep-settings-hint" role="status">
        {rooms.length} room{rooms.length === 1 ? '' : 's'}, {rows.length} row{rows.length === 1 ? '' : 's'}.
        {unmatched.length > 0 && ` ${unmatched.length} room${unmatched.length === 1 ? '' : 's'} with no rule${untyped > 0 ? ` (${untyped} without a room type)` : ''}.`}
      </p>
    </Dialog>
  );
}
