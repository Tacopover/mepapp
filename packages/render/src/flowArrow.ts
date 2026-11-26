import { flowSenseOf, type FlowSense, type NetworkType, type Vec2 } from '@mepapp/core';

/** The ends of the flow arrowhead of a segment. `direction` comes from the flow solve and always runs toward the source: `AtoB` runs from the first point to the second, `BtoA` the other way. The flow sense of the network type decides what the arrowhead shows: `return` keeps that direction (toward the source), `supply` reverses it (away from the source). A `null` direction gives `null`: no source is known, so the overlay draws no arrowhead (D-B-95). */
export function flowArrowEnds(direction: 'AtoB' | 'BtoA' | null, a: Vec2, b: Vec2, sense: FlowSense): { from: Vec2; to: Vec2 } | null {
  if (direction === null) return null;
  const towardSource = direction === 'BtoA' ? { from: b, to: a } : { from: a, to: b };
  return sense === 'supply' ? { from: towardSource.to, to: towardSource.from } : towardSource;
}

/** The flow sense of the network type of a segment. The type in the document wins. A type that the document did not adopt falls back to the library value of the same id, else `supply` (flowSenseOf). */
export function segmentFlowSense(networkTypes: readonly NetworkType[], networkTypeId: string): FlowSense {
  return flowSenseOf(networkTypes.find((t) => t.id === networkTypeId) ?? { id: networkTypeId });
}
