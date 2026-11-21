import type { BuildingFile, Riser } from '@mepapp/core';

/** The risers that have a member on sheetId whose fittingId is in fittingIds. File order, each riser once. */
export function risersOfNetwork(file: BuildingFile, sheetId: string, fittingIds: readonly string[]): Riser[] {
  return file.risers.filter((riser) => riser.members.some((member) => member.sheetId === sheetId && fittingIds.includes(member.fittingId)));
}

/** null for no name. One name: `This segment is on the network of riser R1. Select the riser fitting to see the connected total.` Several: `This segment is on the network of risers R1, R2. Select a riser fitting to see the connected total.` */
export function segmentRiserHint(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `This segment is on the network of riser ${names[0]}. Select the riser fitting to see the connected total.`;
  return `This segment is on the network of risers ${names.join(', ')}. Select a riser fitting to see the connected total.`;
}
