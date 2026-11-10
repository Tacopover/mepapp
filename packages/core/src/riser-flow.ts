import type { BuildingFile } from './building.js';
import type { RiserFittingFlow } from './flow.js';
import type { RiserFlow, RiserMember } from './riser.js';

/** Flow at each riser fitting, from the flow solve of each sheet: sheetId -> fittingId -> flow. A missing entry counts as 'none'. */
export type PerSheetRiserFittingFlow = Record<string, Record<string, RiserFittingFlow>>;

export interface DerivedRiserFlow {
  flow: RiserFlow;
  /** The level that feeds the riser. Absent when not known. */
  sourceLevelId?: string;
  /** True when the direction comes from the flow solve (no hand-set direction, no hand-set source, at least one solved source). The source level can come from the solve even when fromSolve is false. */
  fromSolve: boolean;
}

/**
 * The source of a riser is a structural source: the level with an equipment
 * (flow.ts, `out` fittings), or the level set by hand. For exhaust and return
 * risers the source is the fan level.
 */
export function deriveRiserFlow(file: BuildingFile, perLevelFlow: PerSheetRiserFittingFlow): Record<string, DerivedRiserFlow> {
  const elevationByLevel = new Map(file.levels.map((level) => [level.id, level.elevationMm]));
  const elevationOf = (member: RiserMember): number => elevationByLevel.get(member.levelId)!;
  const result: Record<string, DerivedRiserFlow> = {};
  for (const riser of file.risers) {
    const members = riser.members
      .filter((member) => elevationByLevel.has(member.levelId))
      .sort((a, b) => elevationOf(a) - elevationOf(b));
    const stateOf = (member: RiserMember): RiserFittingFlow => perLevelFlow[member.sheetId]?.[member.fittingId] ?? 'none';
    const sources =
      riser.sourceLevelId !== undefined
        ? members.filter((member) => member.levelId === riser.sourceLevelId)
        : members.filter((member) => stateOf(member) === 'out');
    const entry: DerivedRiserFlow = { flow: riser.flow, fromSolve: false };
    const sourceLevelId = riser.sourceLevelId ?? sources[0]?.levelId;
    if (sourceLevelId !== undefined) entry.sourceLevelId = sourceLevelId;
    if (riser.flow === 'unknown') {
      const destinations = members.filter((member) => !sources.includes(member));
      const up = destinations.some((destination) => sources.some((source) => elevationOf(destination) > elevationOf(source)));
      const down = destinations.some((destination) => sources.some((source) => elevationOf(destination) < elevationOf(source)));
      entry.flow = up && down ? 'both' : up ? 'up' : down ? 'down' : 'unknown';
      entry.fromSolve = riser.sourceLevelId === undefined && sources.length > 0 && entry.flow !== 'unknown';
    }
    result[riser.id] = entry;
  }
  return result;
}
