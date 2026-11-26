import { riserRingArrows, type BuildingFile, type BuildingFlowResult, type BuildingSheet, type NetworkType, type Riser } from '@mepapp/core';
import type { RiserMark } from '@mepapp/render';

/** A flow with no group and no span: the hand-set arrows still show, the derived arrows do not. */
export const EMPTY_FLOW: BuildingFlowResult = { risers: {}, groups: [], warnings: [] };

export interface RememberedFlow {
  /** The store (or any object) that identifies the open building. */
  building: unknown;
  flow: BuildingFlowResult;
}

/** The keep-last rule. A current flow replaces the memory (the same object when building and flow are equal by identity). A null flow keeps the memory when `building` is the same one. Another building clears it (null). */
export function rememberFlow(previous: RememberedFlow | null, building: unknown, current: BuildingFlowResult | null): RememberedFlow | null {
  if (current !== null) {
    if (previous !== null && previous.building === building && previous.flow === current) return previous;
    return { building, flow: current };
  }
  if (previous !== null && previous.building === building) return previous;
  return null;
}

/** D-B-130: the live type of the open drawing with the id of `riser.networkTypeId`, else `riser.networkType`. */
export function riserNetworkTypeLookup(liveTypes: readonly NetworkType[]): (riser: Riser) => NetworkType {
  const byId = new Map(liveTypes.map((type) => [type.id, type] as const));
  return (riser) => byId.get(riser.networkTypeId) ?? riser.networkType;
}

/** A copy of `marks` where each mark of a ring that has an arrow pair (pictogram not null) gets `arrows` (the pair), `arrowColor` (type.color) and `arrowPattern` (type.linePattern). The member of a mark is found by `riserId`, `fittingId` and the id of `sheet`; its ring by `member.levelId`. A mark with no riser, no member on `sheet`, no ring (level not in file.levels) or the pair (none, none) is copied unchanged (no arrows keys). `flow` null uses EMPTY_FLOW. The input map and the input marks are not changed. */
export function withRiserArrows(marks: ReadonlyMap<string, RiserMark>, file: BuildingFile, sheet: BuildingSheet, flow: BuildingFlowResult | null, liveTypes: readonly NetworkType[]): Map<string, RiserMark> {
  const typeOf = riserNetworkTypeLookup(liveTypes);
  const arrows = riserRingArrows(file, flow ?? EMPTY_FLOW, typeOf);
  const risers = new Map(file.risers.map((riser) => [riser.id, riser] as const));
  const result = new Map<string, RiserMark>();
  for (const [fittingId, mark] of marks) {
    const riser = risers.get(mark.riserId);
    const member = riser?.members.find((item) => item.fittingId === fittingId && item.sheetId === sheet.id);
    const ring = riser && member ? arrows[riser.id]?.[member.levelId] : undefined;
    if (!riser || !ring || ring.pictogram === null) {
      result.set(fittingId, mark);
      continue;
    }
    const type = typeOf(riser);
    result.set(fittingId, { ...mark, arrows: { ...ring.pair }, arrowColor: type.color, arrowPattern: type.linePattern });
  }
  return result;
}
