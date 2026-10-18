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

export function jogPath(from: Vec2, to: Vec2): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return [from, to];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mx = (from.x + to.x) / 2;
    return [from, { x: mx, y: from.y }, { x: mx, y: to.y }, to];
  }
  const my = (from.y + to.y) / 2;
  return [from, { x: from.x, y: my }, { x: to.x, y: my }, to];
}

export function elbowPath(from: Vec2, to: Vec2, firstAxis: 'x' | 'y'): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return [from, to];
  if (firstAxis === 'x') return [from, { x: to.x, y: from.y }, to];
  return [from, { x: from.x, y: to.y }, to];
}

function zStep(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): { dir: Vec2; j: number; lenA: number; lenB: number } | null {
  const aDx = a1.x - a0.x;
  const aDy = a1.y - a0.y;
  const jDx = b0.x - a1.x;
  const jDy = b0.y - a1.y;
  const bDx = b1.x - b0.x;
  const bDy = b1.y - b0.y;
  if (
    aDy === 0 &&
    bDy === 0 &&
    jDx === 0 &&
    aDx !== 0 &&
    bDx !== 0 &&
    Math.sign(aDx) === Math.sign(bDx) &&
    jDy !== 0
  ) {
    return { dir: { x: Math.sign(aDx), y: 0 }, j: Math.abs(jDy), lenA: Math.abs(aDx), lenB: Math.abs(bDx) };
  }
  if (
    aDx === 0 &&
    bDx === 0 &&
    jDy === 0 &&
    aDy !== 0 &&
    bDy !== 0 &&
    Math.sign(aDy) === Math.sign(bDy) &&
    jDx !== 0
  ) {
    return { dir: { x: 0, y: Math.sign(aDy) }, j: Math.abs(jDx), lenA: Math.abs(aDy), lenB: Math.abs(bDy) };
  }
  return null;
}

export function applyJogRule(path: readonly Vec2[]): Vec2[] {
  const p = [...path];
  let i = 0;
  while (i + 3 < p.length) {
    const z = zStep(p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!);
    if (
      z &&
      z.j <= SMALL_JUMP_MM &&
      z.lenA >= z.j / 2 + MIN_LEG_MM &&
      z.lenB >= z.j / 2 + MIN_LEG_MM
    ) {
      const h = z.j / 2;
      const p1 = p[i + 1]!;
      const p2 = p[i + 2]!;
      p[i + 1] = { x: p1.x - z.dir.x * h, y: p1.y - z.dir.y * h };
      p[i + 2] = { x: p2.x + z.dir.x * h, y: p2.y + z.dir.y * h };
      i += 2;
    } else {
      i += 1;
    }
  }
  return p;
}
