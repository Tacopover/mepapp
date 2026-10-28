import type { Vec2 } from './geometry.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import type { RouteEntry } from './route-area.js';

export interface EntryCandidate { pointMm: Vec2; outward: Vec2; source: 'area-entry' | 'ring' | 'port-line' }   // outward = unit axis vector pointing away from the room
export const MAX_ENTRY_CANDIDATES = 120;

const SOURCE_ORDER: Record<EntryCandidate['source'], number> = { 'area-entry': 0, ring: 1, 'port-line': 2 };

const byOrder = (p: EntryCandidate, q: EntryCandidate): number =>
  SOURCE_ORDER[p.source] - SOURCE_ORDER[q.source] || p.pointMm.x - q.pointMm.x || p.pointMm.y - q.pointMm.y;

const axisOf = (nx: number, ny: number): Vec2 => (Math.abs(nx) >= Math.abs(ny) ? { x: Math.sign(nx), y: 0 } : { x: 0, y: Math.sign(ny) });

function thinEvenly<T>(list: readonly T[], keep: number): T[] {
  if (keep <= 0) return [];
  if (list.length <= keep) return [...list];
  return Array.from({ length: keep }, (_, i) => list[Math.floor((i * list.length) / keep)]!);
}

export function roomEntryCandidates(input: {
  room: Pick<Room, 'id' | 'polygon'>; mmPerPt: number;
  areaEntries: readonly RouteEntry[];            // the real entries of this room
  corridorAt: (pointMm: Vec2) => boolean;        // true when the point lies in a route-area room (probe test)
  probeMm?: number;                              // default 300
  portsMm: readonly Vec2[];                      // the terminals of the room
  stepMm?: number;                               // default 500
}): EntryCandidate[] {
  const { room, mmPerPt, areaEntries, corridorAt } = input;
  const portsMm = [...input.portsMm].sort((p, q) => p.x - q.x || p.y - q.y);
  const probeMm = input.probeMm ?? 300;
  const stepMm = input.stepMm !== undefined && Number.isFinite(input.stepMm) && input.stepMm > 0 ? input.stepMm : 500;
  const outer = room.polygon.outer;
  const oneMmPt = 1 / mmPerPt;
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });

  // Outward axis vector of the outer edge a-b at the page point p (pt). The side that is not inside the room wins.
  const outwardAt = (a: Vec2, b: Vec2, p: Vec2): Vec2 => {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    const nx = -ey / len;
    const ny = ex / len;
    const sign = roomContainsPoint(room, { x: p.x + nx * oneMmPt, y: p.y + ny * oneMmPt }) ? -1 : 1;
    return axisOf(sign * nx, sign * ny);
  };

  const edgeCount = outer.length;
  const edgeAt = (i: number): [Vec2, Vec2] => [outer[i]!, outer[(i + 1) % edgeCount]!];
  const isZeroEdge = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

  const entryCandidates = (): EntryCandidate[] => {
    const out: EntryCandidate[] = [];
    for (const entry of areaEntries) {
      let best: { foot: Vec2; a: Vec2; b: Vec2; dist: number } | null = null;
      for (let i = 0; i < edgeCount; i++) {
        const [a, b] = edgeAt(i);
        if (isZeroEdge(a, b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.min(1, Math.max(0, ((entry.point.x - a.x) * dx + (entry.point.y - a.y) * dy) / (dx * dx + dy * dy)));
        const foot = { x: a.x + dx * t, y: a.y + dy * t };
        const dist = Math.hypot(foot.x - entry.point.x, foot.y - entry.point.y);
        if (!best || dist < best.dist) best = { foot, a, b, dist };
      }
      if (!best) continue;
      out.push({ pointMm: toMm(entry.point), outward: outwardAt(best.a, best.b, best.foot), source: 'area-entry' });
    }
    return out;
  };

  const ringCandidates = (): EntryCandidate[] => {
    const out: EntryCandidate[] = [];
    for (let i = 0; i < edgeCount; i++) {
      const [a, b] = edgeAt(i);
      if (isZeroEdge(a, b)) continue;
      const lenMm = Math.hypot(b.x - a.x, b.y - a.y) * mmPerPt;
      const n = Math.max(1, Math.floor(lenMm / stepMm));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const outward = outwardAt(a, b, p);
        const pointMm = toMm(p);
        if (corridorAt({ x: pointMm.x + outward.x * probeMm, y: pointMm.y + outward.y * probeMm })) out.push({ pointMm, outward, source: 'ring' });
      }
    }
    return out;
  };

  const portLineCandidates = (): EntryCandidate[] => {
    const out: EntryCandidate[] = [];
    const add = (a: Vec2, b: Vec2, p: Vec2): void => {
      const outward = outwardAt(a, b, p);
      const pointMm = toMm(p);
      if (corridorAt({ x: pointMm.x + outward.x * probeMm, y: pointMm.y + outward.y * probeMm })) out.push({ pointMm, outward, source: 'port-line' });
    };
    for (const port of portsMm) {
      const px = port.x / mmPerPt;
      const py = port.y / mmPerPt;
      for (let i = 0; i < edgeCount; i++) {
        const [a, b] = edgeAt(i);
        if (b.y !== a.y) {
          const t = (py - a.y) / (b.y - a.y);
          if (t >= 0 && t <= 1) add(a, b, { x: a.x + (b.x - a.x) * t, y: py });
        }
        if (b.x !== a.x) {
          const t = (px - a.x) / (b.x - a.x);
          if (t >= 0 && t <= 1) add(a, b, { x: px, y: a.y + (b.y - a.y) * t });
        }
      }
    }
    return out;
  };

  const pool = areaEntries.length > 0 ? entryCandidates() : [...ringCandidates(), ...portLineCandidates()];
  const seen = new Set<string>();
  const unique = pool.filter((c) => {
    const key = `${Math.round(c.pointMm.x)},${Math.round(c.pointMm.y)},${c.outward.x},${c.outward.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sorted = unique.sort(byOrder);
  if (sorted.length <= MAX_ENTRY_CANDIDATES) return sorted;
  const fixed = sorted.filter((c) => c.source !== 'ring').slice(0, MAX_ENTRY_CANDIDATES);
  const ring = sorted.filter((c) => c.source === 'ring');
  return [...fixed, ...thinEvenly(ring, MAX_ENTRY_CANDIDATES - fixed.length)].sort(byOrder);
}
