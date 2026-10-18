import type { NetworkType } from '@mepapp/core';

export function capacityLabel(
  stamps: readonly { portSegmentTypes?: Record<string, string> }[],
  types: readonly Pick<NetworkType, 'id' | 'flowUnit'>[],
): string {
  const ids = new Set<string>();
  for (const stamp of stamps) {
    for (const id of Object.values(stamp.portSegmentTypes ?? {})) ids.add(id);
  }
  if (ids.size !== 1) return 'Capacity';
  const [onlyId] = ids;
  const flowUnit = types.find((t) => t.id === onlyId)?.flowUnit;
  return flowUnit ? `Capacity (${flowUnit})` : 'Capacity';
}
