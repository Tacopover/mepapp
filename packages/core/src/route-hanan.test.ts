import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomSpine } from './route-hanan.js';

const P = (x: number, y: number): Vec2 => ({ x, y });
const always = (): boolean => true;
const noCross = (): number => 0;
const key = (p: Vec2): string => `${p.x},${p.y}`;

function pathsLength(paths: Vec2[][]): number {
  let total = 0;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      total += Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y);
    }
  }
  return total;
}

function endCounts(paths: Vec2[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of paths) {
    for (const p of [path[0]!, path[path.length - 1]!]) {
      counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    }
  }
  return counts;
}

function junctions(paths: Vec2[][]): string[] {
  return [...endCounts(paths)].filter(([, c]) => c >= 3).map(([k]) => k);
}

function innerPoints(paths: Vec2[][]): Set<string> {
  const set = new Set<string>();
  for (const path of paths) for (let i = 1; i < path.length - 1; i++) set.add(key(path[i]!));
  return set;
}

function corners(path: Vec2[]): number {
  return Math.max(0, path.length - 2);
}

describe('roomSpine', () => {
  it('a) two ports on the two axes of the root', () => {
    const r = roomSpine({
      root: P(0, 0),
      entryDir: P(1, 0),
      ports: [
        { id: 'p1', point: P(4000, 0) },
        { id: 'p2', point: P(0, 3000) },
      ],
      inside: always,
      crossesExisting: noCross,
    });
    expect(r.lengthMm).toBe(7000);
    expect(r.unreachedPortIds).toEqual([]);
    expect(r.paths).toHaveLength(2);
    for (const path of r.paths) expect(corners(path)).toBe(0);
  });

  it('b) two ports share the trunk along the entry direction', () => {
    const ports = [
      { id: 'a', point: P(4000, 2000) },
      { id: 'b', point: P(4000, -2000) },
    ];
    const r = roomSpine({ root: P(0, 0), entryDir: P(1, 0), ports, inside: always, crossesExisting: noCross });
    expect(r.lengthMm).toBe(8000);
    expect(junctions(r.paths)).toEqual(['4000,0']);
    expect(r.paths[0]).toEqual([P(0, 0), P(4000, 0)]);
    expect(r.paths).toHaveLength(3);
    const stubs = r.paths.slice(1).map((p) => pathsLength([p]));
    expect(stubs).toEqual([2000, 2000]);
    for (const path of r.paths.slice(1)) expect(path[0]).toEqual(P(4000, 0));

    const rev = roomSpine({ root: P(0, 0), entryDir: P(-1, 0), ports, inside: always, crossesExisting: noCross });
    expect(rev.lengthMm).toBe(12000);
  });

  it('c) four ports in a room: a cross and a tee, every port a leaf', () => {
    const ports = [
      { id: 'p1', point: P(1000, 1000) },
      { id: 'p2', point: P(3000, 1000) },
      { id: 'p3', point: P(1000, 3000) },
      { id: 'p4', point: P(3000, 3000) },
    ];
    const r = roomSpine({ root: P(2000, 0), entryDir: P(0, 1), ports, inside: always, crossesExisting: noCross });
    expect(r.lengthMm).toBe(7000);
    expect(pathsLength(r.paths)).toBe(7000);
    expect(r.paths).toHaveLength(6);
    const counts = endCounts(r.paths);
    expect(junctions(r.paths).sort()).toEqual(['2000,1000', '2000,3000']);
    expect(counts.get('2000,1000')).toBe(4);
    expect(counts.get('2000,3000')).toBe(3);
    const inner = innerPoints(r.paths);
    for (const port of ports) {
      expect(counts.get(key(port.point))).toBe(1);
      expect(inner.has(key(port.point))).toBe(false);
    }
  });

  it('d) a port outside the region is reported, the others connect', () => {
    const ports = [
      { id: 'in1', point: P(4000, 0) },
      { id: 'out', point: P(3000, 3000) },
      { id: 'in2', point: P(0, 2000) },
    ];
    const r = roomSpine({
      root: P(0, 0),
      entryDir: P(1, 0),
      ports,
      inside: (p) => !(Math.abs(p.x - 3000) <= 200 && Math.abs(p.y - 3000) <= 200),
      crossesExisting: noCross,
    });
    expect(r.unreachedPortIds).toEqual(['out']);
    expect(r.lengthMm).toBe(6000);
    const counts = endCounts(r.paths);
    expect(counts.get('4000,0')).toBe(1);
    expect(counts.get('0,2000')).toBe(1);
  });

  it('e) a wall makes the path go around', () => {
    const r = roomSpine({
      root: P(0, 0),
      entryDir: P(1, 0),
      ports: [{ id: 'p', point: P(4000, 3000) }],
      inside: (p) => !(p.x >= 1900 && p.x <= 2100 && p.y < 2000),
      crossesExisting: noCross,
    });
    expect(r.paths[0]).toEqual([P(0, 0), P(0, 3000), P(4000, 3000)]);
    expect(r.lengthMm).toBe(7000);
  });

  it('f) a crossing penalty moves the path to the free line', () => {
    const ports = [{ id: 'p', point: P(4000, 3000) }];
    const crossing = (a: Vec2, b: Vec2): number => (a.y === 0 && b.y === 0 ? 1 : 0);
    const withCross = roomSpine({ root: P(0, 0), entryDir: P(1, 0), ports, inside: always, crossesExisting: crossing });
    expect(withCross.paths[0]).toEqual([P(0, 0), P(0, 3000), P(4000, 3000)]);
    const free = roomSpine({ root: P(0, 0), entryDir: P(1, 0), ports, inside: always, crossesExisting: noCross });
    expect(free.paths[0]).toEqual([P(0, 0), P(4000, 0), P(4000, 3000)]);
  });

  it('g) one port gives a path with at most one corner', () => {
    const r = roomSpine({
      root: P(500, 700),
      entryDir: P(0, -1),
      ports: [{ id: 'p', point: P(3500, 2700) }],
      inside: always,
      crossesExisting: noCross,
    });
    expect(r.paths).toHaveLength(1);
    expect(corners(r.paths[0]!)).toBeLessThanOrEqual(1);
    expect(r.lengthMm).toBe(5000);
  });

  it('returns nothing when no port is reached', () => {
    const r = roomSpine({
      root: P(0, 0),
      entryDir: P(1, 0),
      ports: [{ id: 'p', point: P(1000, 0) }],
      inside: (p) => p.x < 500,
      crossesExisting: noCross,
    });
    expect(r.paths).toEqual([]);
    expect(r.lengthMm).toBe(0);
    expect(r.unreachedPortIds).toEqual(['p']);
  });

  it('i) is deterministic and does not mutate the input', () => {
    const ports = [
      { id: 'a', point: P(1000, 1000) },
      { id: 'b', point: P(3000, 1000) },
      { id: 'c', point: P(1000, 3000) },
    ];
    const input = { root: P(2000, 0), entryDir: P(0, 1), ports, inside: always, crossesExisting: noCross };
    const before = JSON.stringify({ root: input.root, entryDir: input.entryDir, ports });
    const r1 = roomSpine(input);
    const r2 = roomSpine(input);
    expect(r2).toEqual(r1);
    expect(JSON.stringify({ root: input.root, entryDir: input.entryDir, ports })).toBe(before);
  });

  it('leaves a port unreached when it can only be reached through another port on the same line', () => {
    const r = roomSpine({
      root: P(0, 0),
      entryDir: P(1, 0),
      ports: [
        { id: 'near', point: P(2000, 0) },
        { id: 'far', point: P(4000, 0) },
      ],
      inside: always,
      crossesExisting: noCross,
    });
    expect(r.unreachedPortIds).toEqual(['far']);
    expect(r.lengthMm).toBe(2000);
  });

  it('h, j) 20 random ports: fast, ports are leaves', () => {
    let seed = 12345;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ports = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      point: P(Math.floor(next() * 101) * 100, Math.floor(next() * 101) * 100),
    }));
    const t0 = Date.now();
    const r = roomSpine({ root: P(0, 0), entryDir: P(1, 0), ports, inside: always, crossesExisting: noCross });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500);
    expect(r.lengthMm).toBeGreaterThan(0);
    expect(r.unreachedPortIds).toEqual([]);
    const inner = innerPoints(r.paths);
    for (const port of ports) {
      if (port.point.x === 0 && port.point.y === 0) continue;
      expect(inner.has(key(port.point))).toBe(false);
    }
    expect(pathsLength(r.paths)).toBe(r.lengthMm);
  });
});
