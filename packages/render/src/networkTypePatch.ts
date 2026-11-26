import type { NetworkType } from '@mepapp/core';

/** The fields that Network Type Editor Save can change. */
export type NetworkTypePatch = Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern' | 'discipline' | 'flowUnit' | 'sizingMethod' | 'flowSense'>>;

/** Writes the patch into target (direct mutation, like the scene did). flowUnit, sizingMethod and flowSense are optional fields: a key in the patch with the value undefined removes the field. Returns true when the patch holds a visual field (name, color, lineWidthPt, linePattern, discipline), so the caller redraws the drawing layer; a patch of only flowUnit, sizingMethod and flowSense returns false. */
export function applyNetworkTypePatch(target: NetworkType, patch: NetworkTypePatch): boolean {
  const { flowUnit, sizingMethod, flowSense, ...visual } = patch;
  Object.assign(target, visual);
  if ('flowUnit' in patch) {
    if (flowUnit === undefined) delete target.flowUnit;
    else target.flowUnit = flowUnit;
  }
  if ('sizingMethod' in patch) {
    if (sizingMethod === undefined) delete target.sizingMethod;
    else target.sizingMethod = sizingMethod;
  }
  if ('flowSense' in patch) {
    if (flowSense === undefined) delete target.flowSense;
    else target.flowSense = flowSense;
  }
  return Object.keys(visual).length > 0;
}
