import type { Vec2 } from './geometry.js';
import { resolveAngleSnap } from './angle-snap.js';

export const ROUTE_ANGLE_INCREMENT_DEGREES = 45;
export const SMALL_JUMP_MM = 1000;
export const MIN_LEG_MM = 300;
export const MIN_JOG_MM = 150;
export const MAX_DRIFT_MM = 300;
export type LegClass = 'axis' | 'diagonal' | 'free';

export function legClass(a: Vec2, b: Vec2): LegClass {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 'axis';
  const snapped = resolveAngleSnap(a, b, ROUTE_ANGLE_INCREMENT_DEGREES);
  if (Math.hypot(snapped.x - b.x, snapped.y - b.y) > 1e-6 * len) return 'free';
  return Math.min(Math.abs(dx), Math.abs(dy)) <= 1e-6 * len ? 'axis' : 'diagonal';
}

export function isLayoutPath(path: readonly Vec2[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const cls = legClass(path[i - 1]!, path[i]!);
    if (cls !== 'axis' && cls !== 'diagonal') return false;
  }
  return true;
}
