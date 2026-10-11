import { useEffect, useState } from 'react';
import type { AutoPlaceGroup } from '@mepapp/render';
import { PlacementPlanCancelled, PlacementPlanClient, PLACEMENT_WARNING_TEXT, roomPlacementKey, type PlacementPlan, type PlacementPlanInput, type PlacementRow, type PlacementWorkerLike, type StampDefinition } from '@mepapp/core';

/** The art of a stamp definition, loaded by the app for the preview and the placement. */
export interface AutoPlaceArt {
  definition: StampDefinition;
  bitmap: ImageBitmap;
  appearanceDefault?: { color?: string; scale?: number };
}

/** The row cannot be calculated: data of the room or of its type is missing. */
export const missingData = (row: Pick<PlacementRow, 'requirement'>) => row.requirement.warnings.some((w) => w === 'noPeople' || w === 'noCalibration' || w === 'noDemand' || w === 'noRoomIndex');
/** Step 4: the stamps do not fit with the spacing. */
export const spacingProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.some((w) => w === 'tooClose' || w === 'noFit');
/** The room needs more stamps than auto-placement lays out (MAX_ROOM_STAMPS): almost always a typing error. */
export const tooManyStamps = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('tooMany');
/** Step 5: the layout leaves part of the room outside the coverage circles. */
export const coverageProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('coverageNotMet');

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
