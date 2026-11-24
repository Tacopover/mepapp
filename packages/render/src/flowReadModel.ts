import type { FlowResult, Network } from '@mepapp/core';

export type SolvedNoSource = NonNullable<FlowResult['noSource']>;

/** The `noSource` of the network that holds the segment or the fitting, from the last solve. Undefined when nothing was solved, the item is in no result, or the result has no `noSource`. */
export function solvedNoSourceOf(results: readonly FlowResult[] | null, kind: 'segment' | 'fitting', id: string): SolvedNoSource | undefined {
  if (!results) return undefined;
  for (const result of results) {
    const capacities = kind === 'segment' ? result.segmentCapacity : result.fittingCapacity;
    if (id in capacities) return result.noSource;
  }
  return undefined;
}

/** The marked fittings of the network that have no input. A riser fitting with no input is never an open end (D-B-102). Undefined when there is none. */
export function notOpenEndIdsFor(network: Network, marks: ReadonlyMap<string, unknown>, inputs: ReadonlyMap<string, unknown>): ReadonlySet<string> | undefined {
  const ids = new Set<string>();
  for (const id of network.fittingIds) {
    if (marks.has(id) && !inputs.has(id)) ids.add(id);
  }
  return ids.size > 0 ? ids : undefined;
}

/** True when both maps hold the same keys. */
export function sameKeys(a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a.keys()) if (!b.has(key)) return false;
  return true;
}
