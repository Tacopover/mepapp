// Riser arrows of a building: the direction of each span of a riser and the arrow pair of each ring, from the flow solve.
// Pure data, no I/O. Types of a riser are in riser.ts, the flow solve is in building-flow.ts.

import type { BuildingFile } from './building.js';
import type { BuildingFlowGroup, BuildingFlowResult } from './building-flow.js';
import type { NetworkType } from './network.js';
import { flowSenseOf } from './network-type-library.js';
import { sortedMembers } from './riser-quantities.js';
import { riserPictogramOf, type Riser, type RiserArrowDirection, type RiserArrowPair, type RiserPictogramNumber } from './riser.js';

export type RiserSpanDirection = 'up' | 'down' | 'unknown';

export interface RiserSpanArrow {
  fromLevelId: string;
  toLevelId: string;
  direction: RiserSpanDirection;
}

/** Gives the network type of a riser. The caller may pass the live type of the open drawing, else `riser.networkType`. Only `id` and `flowSense` are read. */
export type RiserNetworkTypeOf = (riser: Riser) => Pick<NetworkType, 'id' | 'flowSense'>;

/** The direction of each span of each riser, in the order of the spans of the flow result. A span is 'unknown' when its group has no sourceLevelId, when the span has no towardSource, or when the two ends have the same elevation. It never reads span.state or span.atMost. */
export function riserSpanDirections(file: BuildingFile, flow: BuildingFlowResult, networkTypeOf: RiserNetworkTypeOf): Record<string, RiserSpanArrow[]> {
  const groupOfRiser = new Map<string, BuildingFlowGroup>();
  for (const group of flow.groups) {
    for (const riserId of group.riserIds) groupOfRiser.set(riserId, group);
  }
  const elevationOf = new Map(file.levels.map((level) => [level.id, level.elevationMm]));
  const result: Record<string, RiserSpanArrow[]> = {};
  for (const riser of file.risers) {
    const sense = flowSenseOf(networkTypeOf(riser));
    const group = groupOfRiser.get(riser.id);
    const spans = flow.risers[riser.id]?.spans ?? [];
    result[riser.id] = spans.map((span): RiserSpanArrow => {
      const base = { fromLevelId: span.fromLevelId, toLevelId: span.toLevelId };
      if (group?.sourceLevelId === undefined || span.towardSource === undefined) return { ...base, direction: 'unknown' };
      const flowTo = sense === 'supply' ? (span.towardSource === 'from' ? 'to' : 'from') : span.towardSource;
      const toElevation = elevationOf.get(flowTo === 'from' ? span.fromLevelId : span.toLevelId);
      const otherElevation = elevationOf.get(flowTo === 'from' ? span.toLevelId : span.fromLevelId);
      if (toElevation === undefined || otherElevation === undefined || toElevation === otherElevation) {
        return { ...base, direction: 'unknown' };
      }
      return { ...base, direction: toElevation > otherElevation ? 'up' : 'down' };
    });
  }
  return result;
}

export interface RiserRingArrows {
  pair: RiserArrowPair;
  /** `riserPictogramOf(pair)`: 1 to 8, or null for (none, none). */
  pictogram: RiserPictogramNumber | null;
  /** True when `pair` is `member.arrows` (set by hand). */
  handSet: boolean;
}

/** For each riser id: the arrows of each ring, keyed by the level id of the member. */
export function riserRingArrows(file: BuildingFile, flow: BuildingFlowResult, networkTypeOf: RiserNetworkTypeOf): Record<string, Record<string, RiserRingArrows>> {
  const spanDirections = riserSpanDirections(file, flow, networkTypeOf);
  const result: Record<string, Record<string, RiserRingArrows>> = {};
  for (const riser of file.risers) {
    const members = sortedMembers(file, riser);
    const spans = spanDirections[riser.id] ?? [];
    const directionOf = (fromLevelId: string, toLevelId: string): RiserArrowDirection => {
      const span = spans.find((item) => item.fromLevelId === fromLevelId && item.toLevelId === toLevelId);
      if (span === undefined || span.direction === 'unknown') return 'none';
      return span.direction;
    };
    const rings: Record<string, RiserRingArrows> = {};
    members.forEach(({ member }, index) => {
      const below = index > 0 ? directionOf(members[index - 1]!.member.levelId, member.levelId) : 'none';
      const above = index + 1 < members.length ? directionOf(member.levelId, members[index + 1]!.member.levelId) : 'none';
      const pair: RiserArrowPair = member.arrows ?? { below, above };
      rings[member.levelId] = { pair, pictogram: riserPictogramOf(pair), handSet: member.arrows !== undefined };
    });
    result[riser.id] = rings;
  }
  return result;
}
