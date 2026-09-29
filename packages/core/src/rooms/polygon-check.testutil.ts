// Test helpers for room polygons (excluded from the build, see tsconfig.json).
import type { Vec2 } from '../geometry.js';

const orient = (a: Vec2, b: Vec2, c: Vec2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const onSegment = (a: Vec2, b: Vec2, p: Vec2): boolean =>
  Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;

// True when the closed segments a-b and c-d share at least one point.
function segmentsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (Math.abs(o1) < 1e-9 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-9 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-9 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-9 && onSegment(c, d, b)) return true;
  return false;
}

// A ring (closed implicitly) is simple when it has at least 3 vertices and no
// two edges touch, except neighbouring edges at their shared vertex.
export function isSimpleRing(ring: readonly Vec2[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if (a.x === b.x && a.y === b.y) return false;
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsTouch(a, b, ring[j]!, ring[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

export function ringArea(ring: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    s += ring[i]!.x * ring[j]!.y - ring[j]!.x * ring[i]!.y;
  }
  return Math.abs(s / 2);
}
