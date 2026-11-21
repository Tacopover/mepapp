import type { Network, RiserFlowInput } from '@mepapp/core';

export interface RiserSolveOptions {
  riserFittingIds: Set<string>;
  entryFittingId?: string;
  riserDemand: Record<string, number>;
}

/** The riser options of one network for solveFlow. Only the fittings of the network that have an input are boundaries. Null when there is none. */
export function riserSolveOptionsFor(network: Network, inputs: ReadonlyMap<string, RiserFlowInput>): RiserSolveOptions | null {
  const riserFittingIds = new Set<string>();
  const riserDemand: Record<string, number> = {};
  let entryFittingId: string | undefined;
  for (const id of network.fittingIds) {
    const input = inputs.get(id);
    if (!input) continue;
    riserFittingIds.add(id);
    riserDemand[id] = input.demandBeyond;
    if (input.role === 'entry' && entryFittingId === undefined) entryFittingId = id;
  }
  if (riserFittingIds.size === 0) return null;
  return { riserFittingIds, ...(entryFittingId !== undefined ? { entryFittingId } : {}), riserDemand };
}
