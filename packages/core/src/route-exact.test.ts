import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { exactRoomSpine } from './route-exact.js';
import { BEND_PENALTY_MM, CROSSING_PENALTY_MM, headingOf, roomSpine } from './route-hanan.js';
import type { SpineInput, SpineResult } from './route-hanan.js';

const P = (x: number, y: number): Vec2 => ({ x, y });
const always = (): boolean => true;
const noCross = (): number => 0;

function makeRng(seed: number): (n: number) => number {
  let state = seed;
  return (n: number): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state % n;
  };
}

function layouts(count: number, seed: number): SpineInput[] {
  const rng = makeRng(seed);
  const out: SpineInput[] = [];
  while (out.length < count) {
    const root = P(0, 100 * (1 + rng(79)));
    const ports = [0, 1, 2, 3].map((k) => ({
      id: `p${k}`,
      point: P(100 * (1 + rng(99)), 100 * (1 + rng(79))),
    }));
    const input: SpineInput = { root, entryDir: P(1, 0), ports, inside: always, crossesExisting: noCross };
    if (roomSpine(input).unreachedPortIds.length === 0) out.push(input);
  }
  return out;
}

function legs(paths: Vec2[][]): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) out.push([path[i - 1]!, path[i]!]);
  }
  return out;
}

function bendsOf(result: SpineResult, input: SpineInput): number {
  let bends = 0;
  for (const path of result.paths) {
    bends += Math.max(0, path.length - 2);
    const first = path[0]!;
    const leg = path[1];
    if (leg && first.x === input.root.x && first.y === input.root.y) {
      if (headingOf(P(leg.x - first.x, leg.y - first.y)) !== headingOf(input.entryDir)) bends++;
    }
  }
  return bends;
}

function scoreOf(result: SpineResult, input: SpineInput): number {
  let crossings = 0;
  for (const [a, b] of legs(result.paths)) crossings += input.crossesExisting(a, b);
  return (
    result.lengthMm +
    CROSSING_PENALTY_MM * crossings +
    BEND_PENALTY_MM * bendsOf(result, input)
  );
}

const same = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

function strictlyInside(p: Vec2, a: Vec2, b: Vec2): boolean {
  if (a.x === b.x && p.x === a.x) {
    return p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  }
  if (a.y === b.y && p.y === a.y) {
    return p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
  }
  return false;
}

describe('exactRoomSpine', () => {
  it('four ports: never longer than roomSpine, ports stay leaves', () => {
    for (const input of layouts(200, 7)) {
      const heuristic = roomSpine(input);
      const exact = exactRoomSpine(input);
      expect(exact.unreachedPortIds).toEqual([]);
      expect(exact.lengthMm).toBeLessThanOrEqual(heuristic.lengthMm);

      for (const port of input.ports) {
        let ends = 0;
        for (const path of exact.paths) {
          if (same(path[0]!, port.point)) ends++;
          if (same(path[path.length - 1]!, port.point)) ends++;
        }
        expect(ends).toBe(1);
      }
      for (const [a, b] of legs(exact.paths)) {
        for (const port of input.ports) expect(strictlyInside(port.point, a, b)).toBe(false);
      }
    }
  });

  it('counts the layouts where the exact tree beats roomSpine', () => {
    let wins = 0;
    for (const input of layouts(200, 7)) {
      const heuristic = roomSpine(input);
      const exact = exactRoomSpine(input);
      if (
        exact.lengthMm < heuristic.lengthMm ||
        (exact.lengthMm === heuristic.lengthMm && bendsOf(exact, input) < bendsOf(heuristic, input))
      ) {
        wins++;
      }
    }
    console.log(`exact tree wins in ${wins} of 200 layouts`);
    expect(wins).toBeGreaterThanOrEqual(1);
  });

  it('never scores worse than roomSpine', () => {
    for (const input of layouts(200, 11)) {
      const exact = exactRoomSpine(input);
      const heuristic = roomSpine(input);
      expect(scoreOf(exact, input)).toBeLessThanOrEqual(scoreOf(heuristic, input));
    }
  });

  it('is deterministic', () => {
    for (const input of layouts(20, 3)) {
      expect(exactRoomSpine(input)).toEqual(exactRoomSpine(input));
    }
  });

  it('uses the gap in a blocked wall', () => {
    const input: SpineInput = {
      root: P(1000, 1000),
      entryDir: P(1, 0),
      ports: [
        { id: 'a', point: P(9000, 1000) },
        { id: 'b', point: P(5000, 6000) },
        { id: 'c', point: P(9500, 5000) },
      ],
      inside: (p) => !(Math.abs(p.x - 5000) < 1 && p.y < 4000),
      crossesExisting: noCross,
    };
    const exact = exactRoomSpine(input);
    expect(exact.unreachedPortIds).toEqual([]);
    for (const [a, b] of legs(exact.paths)) {
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 10));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        expect(input.inside(P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))).toBe(true);
      }
    }
  });

  it('one port aligned with the entry gives one straight path', () => {
    const input: SpineInput = {
      root: P(0, 0),
      entryDir: P(1, 0),
      ports: [{ id: 'a', point: P(5000, 0) }],
      inside: always,
      crossesExisting: noCross,
    };
    const exact = exactRoomSpine(input);
    expect(exact.paths).toEqual([[P(0, 0), P(5000, 0)]]);
    expect(exact.lengthMm).toBe(5000);
  });

  it('bend merge: the tree with one bend is returned for an L-shaped leg', () => {
    const input: SpineInput = {
      root: P(0, 0),
      entryDir: P(0, 1),
      ports: [{ id: 'a', point: P(2000, 1000) }],
      inside: always,
      crossesExisting: noCross,
    };
    const exact = exactRoomSpine(input);
    expect(exact.lengthMm).toBe(3000);
    expect(bendsOf(exact, input)).toBe(1);
  });

  it('the bend price of the input changes the bends of the tree', () => {
    const base: SpineInput = {
      root: P(0, 5900),
      entryDir: P(1, 0),
      ports: [
        { id: 'a', point: P(5400, 3300) },
        { id: 'b', point: P(2000, 1100) },
        { id: 'c', point: P(3800, 500) },
        { id: 'd', point: P(400, 4300) },
      ],
      inside: always,
      crossesExisting: noCross,
    };
    const cheap = exactRoomSpine({ ...base, bendPenaltyMm: 500 });
    const dear = exactRoomSpine({ ...base, bendPenaltyMm: 3000 });
    expect(cheap.lengthMm).toBe(13000);
    expect(bendsOf(cheap, base)).toBe(2);
    expect(dear.lengthMm).toBe(14600);
    expect(bendsOf(dear, base)).toBe(1);
    expect(exactRoomSpine(base)).toEqual(cheap);
  });

  it('an explicit bend price argument wins over the input field', () => {
    const base: SpineInput = {
      root: P(0, 5900),
      entryDir: P(1, 0),
      ports: [
        { id: 'a', point: P(5400, 3300) },
        { id: 'b', point: P(2000, 1100) },
        { id: 'c', point: P(3800, 500) },
        { id: 'd', point: P(400, 4300) },
      ],
      inside: always,
      crossesExisting: noCross,
    };
    expect(exactRoomSpine({ ...base, bendPenaltyMm: 3000 }, 500)).toEqual(exactRoomSpine(base, 500));
    expect(exactRoomSpine({ ...base, bendPenaltyMm: 500 }, 3000)).toEqual(exactRoomSpine(base, 3000));
  });

  it('no Math.random and no Date in route-exact.ts', () => {
    const text = readFileSync(new URL('./route-exact.ts', import.meta.url), 'utf8');
    expect(text).not.toContain('Math.random');
    expect(/\bDate\b/.test(text)).toBe(false);
  });
});
