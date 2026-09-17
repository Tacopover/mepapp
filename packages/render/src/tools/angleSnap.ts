import type { Vec2 } from '@mepapp/core';

/**
 * Projects `rawPoint` onto a ray from `anchor` whose angle is rounded to the nearest
 * multiple of `incrementDegrees`, preserving the raw point's distance from `anchor` —
 * used while drawing a segment so its heading locks to round angles (0/45/90° by
 * default) unless the user holds Shift to draw free-angle.
 */
export function resolveAngleSnap(anchor: Vec2, rawPoint: Vec2, incrementDegrees: number): Vec2 {
  if (incrementDegrees <= 0) return rawPoint;
  const dx = rawPoint.x - anchor.x;
  const dy = rawPoint.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return rawPoint;
  const incrementRad = (incrementDegrees * Math.PI) / 180;
  const snappedAngleRad = Math.round(Math.atan2(dy, dx) / incrementRad) * incrementRad;
  return { x: anchor.x + Math.cos(snappedAngleRad) * distance, y: anchor.y + Math.sin(snappedAngleRad) * distance };
}
