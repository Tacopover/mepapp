import type { Vec2 } from '@mepapp/core';

/** The ends of the flow arrowhead of a segment. `AtoB` runs from the first point to the second, `BtoA` the other way. A `null` direction gives `null`: no source is known, so the overlay draws no arrowhead (D-B-95). */
export function flowArrowEnds(direction: 'AtoB' | 'BtoA' | null, a: Vec2, b: Vec2): { from: Vec2; to: Vec2 } | null {
  if (direction === null) return null;
  return direction === 'BtoA' ? { from: b, to: a } : { from: a, to: b };
}
