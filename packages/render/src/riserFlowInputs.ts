import type { Network, RiserFlowInput, RiserSide } from '@mepapp/core';
import { notOpenEndIdsFor } from './flowReadModel.js';

export interface RiserSolveOptions {
  riserFittingIds: Set<string>;
  entryFittingId?: string;
  /** Absent when the network has marks but no input. */
  riserDemand?: Record<string, number>;
  riserSides?: Record<string, ReadonlyArray<RiserSide>>;
  notOpenEndIds?: ReadonlySet<string>;
}

/**
 * The riser options of one network for solveFlow. Only the fittings of the network that have an input are boundaries.
 * A marked fitting with no input goes into `notOpenEndIds` (D-B-102): the one source for that is `notOpenEndIdsFor`.
 * A fitting with role 'open' has no entry: its sides go into `riserSides`.
 * Null when the network has no input and no mark without input.
 */
export function riserSolveOptionsFor(
  network: Network,
  inputs: ReadonlyMap<string, RiserFlowInput>,
  marks: ReadonlyMap<string, unknown> = new Map(),
): RiserSolveOptions | null {
  const riserFittingIds = new Set<string>();
  const riserDemand: Record<string, number> = {};
  const riserSides: Record<string, ReadonlyArray<RiserSide>> = {};
  let entryFittingId: string | undefined;
  for (const id of network.fittingIds) {
    const input = inputs.get(id);
    if (!input) continue;
    riserFittingIds.add(id);
    riserDemand[id] = input.demandBeyond;
    if (input.role === 'open' && input.sides) riserSides[id] = input.sides.map((side) => ({ ...side }));
    if (input.role === 'entry' && entryFittingId === undefined) entryFittingId = id;
  }
  const notOpenEndIds = notOpenEndIdsFor(network, marks, inputs);
  if (riserFittingIds.size === 0) return notOpenEndIds ? { riserFittingIds, notOpenEndIds } : null;
  return {
    riserFittingIds,
    ...(entryFittingId !== undefined ? { entryFittingId } : {}),
    riserDemand,
    ...(Object.keys(riserSides).length > 0 ? { riserSides } : {}),
    ...(notOpenEndIds ? { notOpenEndIds } : {}),
  };
}
