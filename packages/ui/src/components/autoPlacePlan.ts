import { useEffect, useState } from 'react';
import type { AutoPlaceGroup } from '@mepapp/render';
import {
  PlacementPlanCancelled,
  PlacementPlanClient,
  PLACEMENT_WARNING_TEXT,
  roomPlacementKey,
  ruleRoutingTargets,
  SYNTHETIC_CENTER_PORT_ID,
  type AutoPlaceUnitNoteReason,
  type PlacedStamp,
  type PlacementPlan,
  type PlacementPlanInput,
  type PlacementRow,
  type PlacementWorkerLike,
  type StampDefinition,
} from '@mepapp/core';

/** The art of a stamp definition, loaded by the app for the preview and the placement. */
export interface AutoPlaceArt {
  definition: StampDefinition;
  bitmap: ImageBitmap;
  appearanceDefault?: { color?: string; scale?: number };
}

/** The row cannot be calculated: data of the room or of its type is missing. */
export const missingData = (row: Pick<PlacementRow, 'requirement'>) => row.requirement.warnings.some((w) => w === 'noPeople' || w === 'noCalibration' || w === 'noDemand' || w === 'noRoomIndex');
/** The need of the room is 0, although its room type has a number above 0 (for example 0 persons in a small room): no stamp. */
export const zeroNeed = (row: Pick<PlacementRow, 'requirement'>) => row.requirement.warnings.includes('zeroNeed') && row.requirement.count === 0;
/** No stamp because the room is smaller than the area per person of its type: 0 persons. */
export const zeroPersons = (row: Pick<PlacementRow, 'requirement' | 'values'>) => zeroNeed(row) && row.values.people?.count === 0 && row.values.people.source === 'roomType';
/** Step 4: the stamps do not fit with the spacing. */
export const spacingProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.some((w) => w === 'tooClose' || w === 'noFit');
/** The room needs more stamps than auto-placement lays out (MAX_ROOM_STAMPS): almost always a typing error. */
export const tooManyStamps = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('tooMany');
/** Step 5: the layout leaves part of the room outside the coverage circles. */
export const coverageProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('coverageNotMet');

/** True when the two maps of routing targets have the same entries. */
const sameTargets = (a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean => {
  const ka = Object.keys(a ?? {});
  return ka.length === Object.keys(b ?? {}).length && ka.every((k) => a![k] === b?.[k]);
};

/** The moved stamps that the row keeps whose routing targets differ from what the rule gives now (auto-routing.md §5 question 8). */
export function keptWithOtherTarget(row: Pick<PlacementRow, 'existing' | 'rule'>, stampOf: (id: string) => Pick<PlacedStamp, 'ports' | 'routingTargets'> | undefined): number {
  return row.existing.keep.filter((id) => {
    const stamp = stampOf(id);
    return stamp !== undefined && !sameTargets(stamp.routingTargets, ruleRoutingTargets(row.rule, stamp.ports.length > 0 ? stamp.ports : [{ id: SYNTHETIC_CENTER_PORT_ID }]));
  }).length;
}

/** Notes of one row: why it places nothing or what the layout changed, and whether the room needs a check. `keptOther` = keptWithOtherTarget of the row. */
export function notesOf(row: PlacementRow, otherPage: boolean, keptOther = 0): string {
  const notes = row.warnings.map((w) => (w === 'tooClose' && row.fitEstimate !== undefined ? `${PLACEMENT_WARNING_TEXT[w]}: about ${row.fitEstimate} fit` : PLACEMENT_WARNING_TEXT[w]));
  if (otherPage) notes.push('on another page');
  if (row.existing.keep.length > 0)
    notes.push(`${row.existing.keep.length} moved stamp${row.existing.keep.length === 1 ? '' : 's'} kept${keptOther > 0 ? ` (${keptOther} with another routing target)` : ''}`);
  if (row.room.open) notes.push('room needs review');
  if (row.room.roomTypeId === undefined) notes.push('no room type');
  return notes.join('; ');
}

/** The stamps of the rows, one group per stamp definition, with the art from `art`, and the routing targets and network type copies of the rules. */
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
    const capacityUnit = capacity !== undefined ? row.requirement.capacityUnit : undefined;
    const roomKey = roomPlacementKey(row.room);
    const ports = loaded.definition.ports.length > 0 ? loaded.definition.ports : [{ id: SYNTHETIC_CENTER_PORT_ID }];
    const routingTargets = ruleRoutingTargets(row.rule, ports);
    for (const copy of row.rule.networkTypeCopies ?? []) if (!group.networkTypeCopies?.some((c) => c.id === copy.id)) group.networkTypeCopies = [...(group.networkTypeCopies ?? []), copy];
    for (const stamp of row.stamps)
      group.stamps.push({ ...stamp, ruleId: row.rule.id, roomId: row.room.id, roomKey, ...(capacity !== undefined ? { capacity } : {}), ...(capacityUnit !== undefined ? { capacityUnit } : {}), ...(routingTargets ? { routingTargets: { ...routingTargets } } : {}) });
  }
  return [...groups.values()];
}

const UNIT_NOTE_CAUSE: Record<AutoPlaceUnitNoteReason, string> = {
  noTargetUnit: 'the routing target has no flow unit',
  targetUnitsDiffer: 'the routing targets have different flow units',
  unitKindDiffers: 'the flow unit of the routing target is of another kind',
};

/** One line for the Auto-place result: how many stamps kept the unit of the rule, and why. Empty when no stamp did. */
export function unitNotesText(notes: readonly { reason: AutoPlaceUnitNoteReason; count: number }[]): string {
  return notes
    .filter((note) => note.count > 0)
    .map((note) => `${note.count} stamp${note.count === 1 ? '' : 's'} kept the unit of the rule because ${UNIT_NOTE_CAUSE[note.reason]}.`)
    .join(' ');
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
 * The plan of `input`, calculated by a PlacementPlanClient of its own: in a Web Worker with
 * `createWorker`, else on the main thread. A new input cancels the running job. The last plan stays
 * until the next one comes; `busy` is true while the plan is not the plan of `input`.
 */
export function usePlacementPlan(createWorker: (() => PlacementWorkerLike) | undefined, input: PlacementPlanInput | null) {
  const [client] = useState(() => new PlacementPlanClient(createWorker ?? null));
  useEffect(() => () => client.dispose(), [client]);
  const [done, setDone] = useState<{ input: PlacementPlanInput; plan: PlacementPlan } | null>(null);
  const [failed, setFailed] = useState<{ input: PlacementPlanInput; message: string } | null>(null);
  useEffect(() => {
    if (!input) return;
    const job = client.plan(input);
    let live = true;
    job.promise.then(
      (plan) => {
        if (live) setDone({ input, plan });
      },
      (err: unknown) => {
        if (live && !(err instanceof PlacementPlanCancelled)) setFailed({ input, message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      live = false;
      job.cancel();
    };
  }, [client, input]);
  const error = failed && failed.input === input ? failed.message : null;
  return { plan: done?.plan ?? null, input: done?.input ?? null, fresh: input !== null && done?.input === input, busy: input !== null && done?.input !== input && error === null, error };
}
