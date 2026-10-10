import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { AutoPlaceGroup, SketchScene } from '@mepapp/render';
import { autoPlacedStampIds, PLACEMENT_WARNING_TEXT, planAutoPlacement, roomPlacementKey, roomTypeLabel, type PlacementRow, type PlacementRule, type Room, type StampDefinition } from '@mepapp/core';
import { Dialog } from './Dialog.js';

/** The art of a stamp definition, loaded by the app for the preview and the placement. */
export interface AutoPlaceArt {
  definition: StampDefinition;
  bitmap: ImageBitmap;
  appearanceDefault?: { color?: string; scale?: number };
}

export interface AutoPlaceDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The user library of placement rules. */
  rules: PlacementRule[];
  language: 'en' | 'nl';
  /** A stamp definition by id, for its size; undefined when it is not found. */
  stampDefinition: (definitionId: string) => StampDefinition | undefined;
  /** The remembered scale of a stamp definition (the stamp tool's appearance default). */
  stampScale: (definitionId: string) => number;
  /** Loads the art of a stamp definition; null when it cannot be loaded. */
  loadStampArt: (definitionId: string) => Promise<AutoPlaceArt | null>;
  onOpenRules: () => void;
  /** Called after Place with the number of placed stamps and of replaced stamps. */
  onPlaced: (count: number, replaced: number) => void;
  /** Called after Remove auto-placed stamps with the number of removed stamps. */
  onRemoved: (count: number) => void;
  onClose: () => void;
}

type Scope = 'selected' | 'page' | 'all';

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '–' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;

const COUNT_SOURCE_TEXT: Record<PlacementRow['requirement']['countSource'], string> = {
  amount: 'From the amount ÷ the capacity, rounded up, then the min and max count',
  coverage: 'By coverage: the fewest stamps that cover the room',
  onePerRoom: 'No capacity: one per room, then the min and max count',
};

/** Notes of one row: why it places nothing or what the layout changed, and whether the room needs a check. */
export function notesOf(row: PlacementRow, otherPage: boolean): string {
  const notes = row.warnings.map((w) => (w === 'tooClose' && row.fitEstimate !== undefined ? `${PLACEMENT_WARNING_TEXT[w]}: about ${row.fitEstimate} fit` : PLACEMENT_WARNING_TEXT[w]));
  if (otherPage) notes.push('on another page');
  if (row.existing.keep.length > 0) notes.push(`${row.existing.keep.length} moved stamp${row.existing.keep.length === 1 ? '' : 's'} kept`);
  if (row.room.open) notes.push('room needs review');
  if (row.room.roomTypeId === undefined) notes.push('no room type');
  return notes.join('; ');
}

/** The stamps of the rows, one group per stamp definition, with the art from `art`. */
export function groupsOf(rows: readonly PlacementRow[], art: ReadonlyMap<string, AutoPlaceArt>): AutoPlaceGroup[] {
  const groups = new Map<string, AutoPlaceGroup>();
  for (const row of rows) {
    const id = row.rule.stampDefinitionId;
    const loaded = id ? art.get(id) : undefined;
    if (!id || !loaded) continue;
    let group = groups.get(id);
    if (!group) {
      group = { definition: loaded.definition, bitmap: loaded.bitmap, ...(loaded.appearanceDefault ? { appearanceDefault: loaded.appearanceDefault } : {}), stamps: [] };
      groups.set(id, group);
    }
    const capacity = row.rule.writeCapacity && row.requirement.perElement !== null ? row.requirement.perElement : undefined;
    const roomKey = roomPlacementKey(row.room);
    for (const stamp of row.stamps) group.stamps.push({ ...stamp, ruleId: row.rule.id, roomId: row.room.id, roomKey, ...(capacity !== undefined ? { capacity } : {}) });
  }
  return [...groups.values()];
}

/**
 * The unmoved stamps a placement of the row replaces: only when the row has a full plan (a stamp,
 * a calibration and a count). A row that cannot be calculated keeps its stamps.
 */
export function replaceIdsOf(row: PlacementRow): string[] {
  const blocked = row.warnings.some((w) => w === 'noStamp' || w === 'stampNotFound' || w === 'noCalibration');
  return blocked || row.requirement.count === null ? [] : row.existing.replace;
}

/**
 * Auto-placement (room-auto-placement.md Phases 3 to 5): for the chosen rooms and rules, the room
 * values, the required amount, the count, and where the stamps go. Preview shows the stamps on the
 * drawing; Place adds them as one undo step. Only rooms on the shown page get stamps. A re-run
 * replaces the unmoved auto-placed stamps of the same rule and room, and keeps the moved ones.
 */
export function AutoPlaceDialog({ sceneRef, rules, language, stampDefinition, stampScale, loadStampArt, onOpenRules, onPlaced, onRemoved, onClose }: AutoPlaceDialogProps) {
  const scene = sceneRef.current;
  const selectedCount = scene?.getSelectedRooms().length ?? 0;
  const [scope, setScope] = useState<Scope>(selectedCount > 0 ? 'selected' : 'page');
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  const [previewing, setPreviewing] = useState(false);
  const [art, setArt] = useState<ReadonlyMap<string, AutoPlaceArt>>(() => new Map());
  const [artErrors, setArtErrors] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  // The plan follows room and stamp edits (possible while the preview bar is shown) and page changes.
  const [roomsVersion, setRoomsVersion] = useState(0);
  useEffect(() => {
    if (!scene) return;
    const bump = () => setRoomsVersion((v) => v + 1);
    scene.on('roomsChanged', bump);
    scene.on('pageChanged', bump);
    scene.on('drawingChanged', bump);
    return () => {
      scene.off('roomsChanged', bump);
      scene.off('pageChanged', bump);
      scene.off('drawingChanged', bump);
    };
  }, [scene]);

  const pageIndex = scene?.getPageIndex() ?? 0;
  const plan = useMemo(() => {
    if (!scene) return null;
    const rooms = scope === 'selected' ? scene.getSelectedRooms() : scope === 'page' ? scene.listRooms().filter((r) => r.pageIndex === pageIndex) : scene.listRooms();
    const result = planAutoPlacement(
      rules.filter((r) => !unchecked.has(r.id)),
      rooms,
      (room) => scene.getRoomValues(room),
      (page) => scene.getCalibration(page),
      (id) => {
        const definition = stampDefinition(id);
        if (!definition || artErrors.has(id)) return null;
        const scale = stampScale(id);
        return { width: definition.nativeWidth * scale, height: definition.nativeHeight * scale };
      },
      { stamps: scene.listAutoPlacedStamps(), roomIds: new Set(scene.listRooms().map((r) => r.id)) },
    );
    // Stamps have no page of their own: only the rooms of the shown page get stamps.
    return { ...result, rooms, rows: result.rows.map((row) => (row.room.pageIndex === pageIndex ? row : { ...row, stamps: [] })) };
    // roomsVersion only triggers the recalculation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, scope, pageIndex, rules, unchecked, stampDefinition, stampScale, artErrors, roomsVersion]);

  const neededIds = useMemo(() => [...new Set((plan?.rows ?? []).filter((r) => r.stamps.length > 0).map((r) => r.rule.stampDefinitionId!))], [plan]);
  useEffect(() => {
    const missing = neededIds.filter((id) => !art.has(id) && !artErrors.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async (id) => [id, await loadStampArt(id).catch(() => null)] as const)).then((loaded) => {
      if (cancelled) return;
      setArt((prev) => new Map([...prev, ...loaded.flatMap(([id, a]) => (a ? [[id, a] as const] : []))]));
      const failed = loaded.filter(([, a]) => !a).map(([id]) => id);
      if (failed.length > 0) setArtErrors((prev) => new Set([...prev, ...failed]));
    });
    return () => {
      cancelled = true;
    };
  }, [neededIds, art, artErrors, loadStampArt]);

  const artReady = neededIds.every((id) => art.has(id));
  const groups = useMemo(() => (plan && artReady ? groupsOf(plan.rows, art) : []), [plan, art, artReady]);
  const total = (plan?.rows ?? []).reduce((sum, r) => sum + r.stamps.length, 0);
  const replaceIds = useMemo(
    () => [
      ...(plan?.rows ?? []).filter((r) => r.room.pageIndex === pageIndex).flatMap(replaceIdsOf),
      ...(plan?.stale ?? []).filter((e) => e.room.pageIndex === pageIndex).flatMap((e) => e.replace),
    ],
    [plan, pageIndex],
  );
  const removeIds = useMemo(() => autoPlacedStampIds(plan?.rows ?? [], plan?.stale ?? []), [plan]);
  const staleCount = (plan?.stale ?? []).reduce((sum, e) => sum + e.keep.length + e.replace.length, 0);

  useEffect(() => {
    if (!scene) return;
    if (previewing) scene.showAutoPlacePreview(groups, replaceIds);
    else scene.clearAutoPlacePreview();
  }, [scene, previewing, groups, replaceIds]);
  useEffect(() => () => sceneRef.current?.clearAutoPlacePreview(), [sceneRef]);

  useEffect(() => {
    if (!previewing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPreviewing(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewing]);

  if (!scene || !plan) return null;

  const canPlace = !busy && artReady && (total > 0 || replaceIds.length > 0);
  const place = () => {
    if (!canPlace) return;
    setBusy(true);
    const ids = scene.autoPlaceStamps(groups, replaceIds);
    setBusy(false);
    onPlaced(ids.length, replaceIds.length);
    onClose();
  };
  const remove = () => {
    if (removeIds.length === 0) return;
    setPreviewing(false);
    onRemoved(scene.removeAutoPlacedStamps(removeIds));
  };
  const placeLabel = !artReady
    ? 'Loading stamps…'
    : `Place ${total} stamp${total === 1 ? '' : 's'}${replaceIds.length > 0 ? ` (replace ${replaceIds.length})` : ''}`;

  if (previewing) {
    return (
      <div className="mep-autoplace-bar" role="toolbar" aria-label="Auto-place preview">
        <span>
          Preview: {total} stamp{total === 1 ? '' : 's'} in {new Set(plan.rows.filter((r) => r.stamps.length > 0).map((r) => r.room.id)).size} rooms
          {replaceIds.length > 0 && `, ${replaceIds.length} placed stamp${replaceIds.length === 1 ? '' : 's'} replaced (hidden)`}.
        </span>
        <button type="button" disabled={!canPlace} onClick={place}>
          {placeLabel}
        </button>
        <button type="button" onClick={() => setPreviewing(false)}>
          Back to the table
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    );
  }

  const types = scene.getRoomTypes();
  const typeName = (id: string | undefined) => {
    if (id === undefined) return '–';
    const type = types.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : id;
  };
  const untyped = plan.unmatched.filter((r) => r.roomTypeId === undefined).length;

  return (
    <Dialog
      title="Auto-place stamps"
      className="mep-modal--room-calculations"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onOpenRules}>
            Placement rules…
          </button>
          <button type="button" disabled={removeIds.length === 0} onClick={remove}>
            Remove {removeIds.length} auto-placed stamp{removeIds.length === 1 ? '' : 's'}
          </button>
          <button type="button" disabled={total === 0 && replaceIds.length === 0} onClick={() => setPreviewing(true)}>
            Preview
          </button>
          <button type="button" disabled={!canPlace} onClick={place}>
            {placeLabel}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="mep-settings-hint">Check the numbers first. Preview shows the stamps on the drawing. Place adds them as one undo step. Only rooms on the shown page get stamps. Place again replaces the auto-placed stamps of a rule in a room; stamps that you moved or edited stay and count. Remove takes away all auto-placed stamps of the checked rules in these rooms.</p>
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
              <th>Existing</th>
              <th>Placed</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={`${row.room.id}:${row.rule.id}`} data-room={row.room.id} data-rule={row.rule.id}>
                <td>{roomLabel(row.room)}</td>
                <td>{typeName(row.room.roomTypeId)}</td>
                <td className="num">{fmt(row.values.areaM2)}</td>
                <td className="num">{fmt(row.values.volumeM3)}</td>
                <td className="num">{row.values.people ? row.values.people.count : '–'}</td>
                <td>{row.rule.name}</td>
                <td className="num">{row.requirement.required === null ? '–' : `${fmt(row.requirement.required)} ${row.rule.amount.unit}`.trim()}</td>
                <td className="num">{row.rule.capacityPerElement === undefined ? '–' : fmt(row.rule.capacityPerElement)}</td>
                <td className="num" data-testid="count" title={COUNT_SOURCE_TEXT[row.requirement.countSource]}>
                  {row.requirement.count ?? '–'}
                </td>
                <td className="num" data-testid="existing" title="Auto-placed stamps of this rule in this room: moved (kept) + not moved (replaced)">
                  {row.existing.keep.length + row.existing.replace.length}
                  {row.existing.keep.length > 0 && ` (${row.existing.keep.length} moved)`}
                </td>
                <td className="num" data-testid="placed">
                  {row.stamps.length}
                </td>
                <td>{notesOf(row, row.room.pageIndex !== pageIndex)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.rows.length === 0 && <p className="mep-settings-hint">No rule applies to these rooms.</p>}
      </div>
      <p className="mep-settings-hint" role="status">
        {plan.rooms.length} room{plan.rooms.length === 1 ? '' : 's'}, {plan.rows.length} row{plan.rows.length === 1 ? '' : 's'}, {total} stamp{total === 1 ? '' : 's'} to place.
        {plan.unmatched.length > 0 && ` ${plan.unmatched.length} room${plan.unmatched.length === 1 ? '' : 's'} with no rule${untyped > 0 ? ` (${untyped} without a room type)` : ''}.`}
        {staleCount > 0 &&
          ` ${staleCount} auto-placed stamp${staleCount === 1 ? '' : 's'} of a rule that no longer applies to the room: Place removes the ones that you did not move, Remove removes all.`}
        {artErrors.size > 0 && ` Could not load the stamp of ${artErrors.size} rule${artErrors.size === 1 ? '' : 's'}.`}
      </p>
    </Dialog>
  );
}
