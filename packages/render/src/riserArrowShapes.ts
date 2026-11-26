import type { RiserArrowPair, Vec2 } from '@mepapp/core';

/** All values in PDF points (world units). Fixed: the arrows grow and shrink with the zoom (D-B-122). */
export const RISER_ARROW_STYLE = {
  /** From the ring line to the far end, head included. */
  lengthPt: 64,
  shaftWidthPt: 2,
  /** Tip to base. */
  headLengthPt: 14,
  /** Full width at the base. */
  headWidthPt: 9,
  /** From the horizontal. The "above" arrow goes to the upper right on the screen, the "below" arrow to the lower left. */
  angleDeg: 60,
} as const;

export interface RiserArrowShape {
  side: 'below' | 'above';
  direction: 'up' | 'down';
  /** The point on the ring line where the arrow meets the ring: center + d * ringRadiusPt. */
  ringPoint: Vec2;
  /** The other end: center + d * (ringRadiusPt + lengthPt). */
  farPoint: Vec2;
  /** The shaft runs from shaftTail (the end with no head) to shaftEnd (the base of the head). Its length is lengthPt - headLengthPt. */
  shaftTail: Vec2;
  shaftEnd: Vec2;
  /** The filled triangle: the tip, and the two corners of the base. */
  head: { tip: Vec2; baseA: Vec2; baseB: Vec2 };
  /** true: the arrow points toward the ring (the tip is at ringPoint). false: it points away (the tip is at farPoint). */
  headAtRing: boolean;
}

const RAD = Math.PI / 180;
/** Unit vector of the "above" arrow in screen coordinates (y grows down). */
const AXIS: Vec2 = { x: Math.cos(RISER_ARROW_STYLE.angleDeg * RAD), y: -Math.sin(RISER_ARROW_STYLE.angleDeg * RAD) };
/** Unit vector perpendicular to AXIS. */
const PERP: Vec2 = { x: Math.sin(RISER_ARROW_STYLE.angleDeg * RAD), y: Math.cos(RISER_ARROW_STYLE.angleDeg * RAD) };

/** The shaft length of an arrow: lengthPt - headLengthPt. */
export const RISER_ARROW_SHAFT_LENGTH_PT = RISER_ARROW_STYLE.lengthPt - RISER_ARROW_STYLE.headLengthPt;

function along(center: Vec2, d: Vec2, distance: number): Vec2 {
  return { x: center.x + d.x * distance, y: center.y + d.y * distance };
}

function shift(point: Vec2, d: Vec2, distance: number): Vec2 {
  return { x: point.x + d.x * distance, y: point.y + d.y * distance };
}

/** The arrows of one ring: 0, 1 or 2 shapes, `below` first. undefined, or the pair (none, none): []. */
export function riserArrowShapes(pair: RiserArrowPair | undefined, centerPt: Vec2, ringRadiusPt: number): RiserArrowShape[] {
  if (!pair) return [];
  const shapes: RiserArrowShape[] = [];
  for (const side of ['below', 'above'] as const) {
    const direction = pair[side];
    if (direction === 'none') continue;
    shapes.push(riserArrowShape(side, direction, centerPt, ringRadiusPt));
  }
  return shapes;
}

function riserArrowShape(side: 'below' | 'above', direction: 'up' | 'down', centerPt: Vec2, ringRadiusPt: number): RiserArrowShape {
  const d = side === 'above' ? AXIS : { x: -AXIS.x, y: -AXIS.y };
  const ringPoint = along(centerPt, d, ringRadiusPt);
  const farPoint = along(centerPt, d, ringRadiusPt + RISER_ARROW_STYLE.lengthPt);
  const awayFromRing = (side === 'above' && direction === 'up') || (side === 'below' && direction === 'down');
  const headAtRing = !awayFromRing;
  const tip = headAtRing ? ringPoint : farPoint;
  const tail = headAtRing ? farPoint : ringPoint;
  const base = shift(tip, d, headAtRing ? RISER_ARROW_STYLE.headLengthPt : -RISER_ARROW_STYLE.headLengthPt);
  const halfWidth = RISER_ARROW_STYLE.headWidthPt / 2;
  return {
    side,
    direction,
    ringPoint,
    farPoint,
    shaftTail: tail,
    shaftEnd: base,
    head: {
      tip,
      baseA: along(base, PERP, halfWidth),
      baseB: along(base, PERP, -halfWidth),
    },
    headAtRing,
  };
}

/** The dash pattern for the shaft, or null for a solid shaft. null when `pattern` is null or empty, or when the shaft is shorter than 2 full periods (the sum of the entries) of the pattern. */
export function riserArrowShaftPattern(pattern: readonly number[] | null | undefined, shaftLengthPt: number = RISER_ARROW_SHAFT_LENGTH_PT): number[] | null {
  if (!pattern || pattern.length === 0) return null;
  const period = pattern.reduce((sum, entry) => sum + entry, 0);
  return shaftLengthPt >= 2 * period ? [...pattern] : null;
}
