import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { EntryCandidate } from './route-room-entry.js';
import { bestRoomReach, DEFAULT_WALL_MM, type PlacedTapAt, type ReachCarrier } from './route-room-reach.js';

const real = (x: number, y: number): EntryCandidate => ({ pointMm: { x, y }, outward: { x: 0, y: 1 }, source: 'area-entry' });
const synthetic = (x: number, y: number): EntryCandidate => ({ pointMm: { x, y }, outward: { x: 0, y: 1 }, source: 'ring' });
const leg = (id: string, a: Vec2, b: Vec2): ReachCarrier => ({ id, a, b });
const junction = (id: string, x: number, y: number): ReachCarrier => ({ id, a: { x, y }, b: { x, y } });
const always = (): boolean => true;
const base = { pathOk: always, searchMm: 5000, portsMm: [] as Vec2[], placedTaps: [] as PlacedTapAt[] };

const OUTWARD: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const grid = (r: () => number): number => 100 * Math.floor(r() * 50);

function randomCandidate(r: () => number): EntryCandidate {
  return { pointMm: { x: grid(r), y: grid(r) }, outward: OUTWARD[Math.floor(r() * 4)]!, source: r() < 0.6 ? 'area-entry' : 'ring' };
}

function randomCarrier(r: () => number, id: string): ReachCarrier {
  const x = grid(r);
  const y = grid(r);
  if (r() < 0.2) return { id, a: { x, y }, b: { x, y } };
  const step = (r() < 0.5 ? -1 : 1) * (100 + 100 * Math.floor(r() * 20));
  if (r() < 0.5) return { id, a: { x, y }, b: { x: x + step, y } };
  return { id, a: { x, y }, b: { x, y: y + step } };
}

function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const onCarrier = (tap: Vec2, c: ReachCarrier): boolean => {
  const within =
    tap.x >= Math.min(c.a.x, c.b.x) - 1e-6 && tap.x <= Math.max(c.a.x, c.b.x) + 1e-6 &&
    tap.y >= Math.min(c.a.y, c.b.y) - 1e-6 && tap.y <= Math.max(c.a.y, c.b.y) + 1e-6;
  if (c.a.y === c.b.y) return within && tap.y === c.a.y;
  if (c.a.x === c.b.x) return within && tap.x === c.a.x;
  return tap.x === c.a.x && tap.y === c.a.y;
};

describe('bestRoomReach', () => {
  it('takes a straight branch to a real entry in line with a corridor leg', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(2000, 1500)],
      carriers: [leg('h1', { x: 0, y: 1000 }, { x: 4000, y: 1000 })],
      portsMm: [{ x: 2000, y: 1800 }],
    });
    expect(r).not.toBeNull();
    expect(r!.tapMm).toEqual({ x: 2000, y: 1000 });
    expect(r!.branch).toHaveLength(2);
    expect(r!.costMm).toBe(500);
  });

  it('prefers a longer straight drop that costs less than the bent path on the nearer leg', () => {
    const r = bestRoomReach({
      ...base,
      searchMm: 2000,
      candidates: [real(2000, 1500)],
      carriers: [
        leg('near', { x: 0, y: 1000 }, { x: 1000, y: 1000 }),
        leg('far', { x: 0, y: -400 }, { x: 4000, y: -400 }),
      ],
    });
    expect(r!.carrierId).toBe('far');
    expect(r!.branch).toHaveLength(2);
    expect(r!.costMm).toBe(1900);
  });

  it('picks the entry with fewer bends when the cost is lower', () => {
    const r = bestRoomReach({
      ...base,
      searchMm: 3000,
      candidates: [real(1000, 500), real(0, 1900)],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.entry.pointMm).toEqual({ x: 0, y: 1900 });
    expect(r!.branch).toHaveLength(2);
    expect(r!.costMm).toBe(1900);
  });

  it('gives a real entry the tie against a synthetic entry of equal geometric cost', () => {
    const r = bestRoomReach({
      ...base,
      wallMm: 0,
      candidates: [synthetic(0, 1000), { ...real(1000, 0), outward: { x: 1, y: 0 } }],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.entry.source).toBe('area-entry');
    expect(r!.entry.pointMm).toEqual({ x: 1000, y: 0 });
    expect(r!.costMm).toBe(1000);
  });

  it('adds the wall price to a synthetic entry', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [synthetic(0, 1000)],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.costMm).toBe(1000 + DEFAULT_WALL_MM);
  });

  it('takes the next pair when pathOk rejects the best one, and null when it rejects all', () => {
    const carriers = [junction('j', 0, 0)];
    const candidates = [real(1000, 0), real(0, 2000)];
    const next = bestRoomReach({
      ...base,
      candidates,
      carriers,
      pathOk: (path) => path[path.length - 1]!.x !== 1000,
    });
    expect(next!.entry.pointMm).toEqual({ x: 0, y: 2000 });
    const none = bestRoomReach({ ...base, candidates, carriers, pathOk: () => false });
    expect(none).toBeNull();
  });

  it('keeps 300 mm from a placed tap on the same carrier', () => {
    const r = bestRoomReach({
      ...base,
      searchMm: 2000,
      candidates: [real(2000, 1500)],
      carriers: [leg('h', { x: 0, y: 1000 }, { x: 6000, y: 1000 })],
      placedTaps: [{ carrierId: 'h', sMm: 2000 }],
    });
    expect(r!.tapMm.y).toBe(1000);
    expect(Math.abs(r!.tapMm.x - 2000)).toBeGreaterThanOrEqual(300);
    expect(r!.tapMm.x).toBeCloseTo(2300);
  });

  it('keeps the opposite-side gap from a placed tap on the far side of the carrier', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(4000, -1500)],
      carriers: [leg('h', { x: 0, y: 0 }, { x: 8000, y: 0 })],
      placedTaps: [{ carrierId: 'h', sMm: 4000, side: 1 }],
      tapGaps: { sameSideMm: 600, oppositeSideMm: 395 },
    });
    expect(r!.tapMm).toEqual({ x: 4395, y: 0 });
  });

  it('keeps the same-side gap from a placed tap on the near side of the carrier', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(4000, 1500)],
      carriers: [leg('h', { x: 0, y: 0 }, { x: 8000, y: 0 })],
      placedTaps: [{ carrierId: 'h', sMm: 4000, side: 1 }],
      tapGaps: { sameSideMm: 600, oppositeSideMm: 395 },
    });
    expect(r!.tapMm).toEqual({ x: 4600, y: 0 });
  });

  it('gives an L on a junction with one bend price', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(1000, 500)],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.branch).toHaveLength(3);
    expect(r!.costMm).toBe(2000);
  });

  it('prices the bend where an L branch meets the room stub', () => {
    const r = bestRoomReach({
      ...base,
      bendMm: 100,
      candidates: [real(1000, 1000)],
      carriers: [junction('j', 0, 0)],
      portsMm: [{ x: 0, y: 1000 }],
    });
    expect(r!.branch).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    expect(r!.costMm).toBe(2150);
  });

  it('gives a straight arrival its length alone', () => {
    const r = bestRoomReach({
      ...base,
      bendMm: 100,
      candidates: [real(0, 1000)],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.branch).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1000 }]);
    expect(r!.costMm).toBe(1000);
  });

  it('adds one bend price to a single leg that runs along the wall', () => {
    const r = bestRoomReach({
      ...base,
      bendMm: 100,
      wallMm: 0,
      candidates: [real(2000, 0)],
      carriers: [junction('j', 0, 0)],
    });
    expect(r!.branch).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
    expect(r!.costMm).toBe(2100);
  });

  it('takes a horizontal-first L from a vertical carrier that arrives along the outward axis', () => {
    const r = bestRoomReach({
      ...base,
      carriers: [leg('v', { x: 0, y: 0 }, { x: 0, y: 1000 })],
      candidates: [real(1000, 3000)],
    });
    expect(r!.branch).toEqual([{ x: 0, y: 700 }, { x: 1000, y: 700 }, { x: 1000, y: 3000 }]);
  });

  it('takes a vertical-first L from a horizontal carrier that arrives along the outward axis', () => {
    const r = bestRoomReach({
      ...base,
      carriers: [leg('h', { x: 0, y: 0 }, { x: 1000, y: 0 })],
      candidates: [{ pointMm: { x: 3000, y: 1000 }, outward: { x: 1, y: 0 }, source: 'area-entry' }],
    });
    expect(r!.branch).toEqual([{ x: 700, y: 0 }, { x: 700, y: 1000 }, { x: 3000, y: 1000 }]);
  });

  it('gives the same result for shuffled candidates and carriers', () => {
    const input = {
      ...base,
      searchMm: 5000,
      candidates: [
        real(2000, 1500), real(3000, 2500), synthetic(800, 2000), real(1500, 3000), synthetic(1000, -600), real(2200, 800),
      ],
      carriers: [
        leg('h1', { x: 0, y: 1000 }, { x: 3000, y: 1000 }),
        leg('v1', { x: 3500, y: 0 }, { x: 3500, y: 4000 }),
        junction('j1', 500, 500),
        leg('h2', { x: 0, y: -200 }, { x: 4000, y: -200 }),
        leg('v2', { x: 1200, y: 3000 }, { x: 1200, y: 0 }),
      ],
      placedTaps: [{ carrierId: 'h1', sMm: 1000 }],
      portsMm: [{ x: 2500, y: 700 }],
    };
    const expected = bestRoomReach(input);
    expect(expected).not.toBeNull();
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = bestRoomReach({
        ...input,
        candidates: shuffled(input.candidates, seed),
        carriers: shuffled(input.carriers, seed + 7),
      });
      expect(result).toEqual(expected);
    }
  });

  it('grows the cost by exactly roomPenaltyMm', () => {
    const input = {
      ...base,
      candidates: [real(1000, 500)],
      carriers: [junction('j', 0, 0)],
    };
    const without = bestRoomReach(input);
    const withPenalty = bestRoomReach({ ...input, roomPenaltyMm: 250 });
    expect(withPenalty!.costMm).toBeCloseTo(without!.costMm + 250, 9);
    expect(withPenalty!.carrierId).toBe(without!.carrierId);
    expect(withPenalty!.branch).toEqual(without!.branch);
  });

  it('moves the choice to the longer path when pathPenaltyMm favors it', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(0, 1000)],
      carriers: [junction('near', 0, 0), junction('far', 0, -1500)],
      pathPenaltyMm: (_path, carrierId) => (carrierId === 'near' ? 5000 : 0),
    });
    expect(r!.carrierId).toBe('far');
    expect(r!.costMm).toBe(2500);
  });

  it('calls pathOk lazily and returns the cheapest passing pair', () => {
    let calls = 0;
    const r = bestRoomReach({
      ...base,
      bendMm: 100,
      candidates: [real(1000, 500), real(2000, 1500), real(500, 2500)],
      carriers: [junction('a', 0, 0), junction('b', 0, 300)],
      pathOk: (path) => {
        calls++;
        return path[path.length - 1]!.x !== 1000;
      },
    });
    expect(r!.carrierId).toBe('b');
    expect(r!.entry.pointMm).toEqual({ x: 500, y: 2500 });
    expect(r!.branch).toEqual([{ x: 0, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 2500 }]);
    expect(r!.costMm).toBeCloseTo(2800, 6);
    expect(calls).toBeLessThan(12);
  });

  it('adds extraCostMm to passing pairs and stops before a pair whose base cost is above the best total', () => {
    const ends: Vec2[] = [];
    const r = bestRoomReach({
      ...base,
      bendMm: 0,
      candidates: [real(1000, 0), real(0, 1500), real(0, 4000)],
      carriers: [junction('j', 0, 0)],
      extraCostMm: (reach) => (reach.entry.pointMm.x === 1000 ? 5000 : 0),
      pathOk: (path) => {
        ends.push(path[path.length - 1]!);
        return true;
      },
    });
    expect(r!.entry.pointMm).toEqual({ x: 0, y: 1500 });
    expect(r!.costMm).toBeCloseTo(1500, 6);
    expect(ends).toEqual([{ x: 1000, y: 0 }, { x: 0, y: 1500 }]);
  });

  it('gives null beyond searchMm and a result at searchMm', () => {
    const input = { ...base, candidates: [real(0, 1000)], carriers: [junction('j', 0, 0)] };
    expect(bestRoomReach({ ...input, searchMm: 999 })).toBeNull();
    expect(bestRoomReach({ ...input, searchMm: 1000 })).not.toBeNull();
  });

  it('skips a diagonal carrier', () => {
    const candidates = [real(0, 1000)];
    const diagonal = leg('diag', { x: 0, y: 0 }, { x: 1000, y: 1000 });
    expect(bestRoomReach({ ...base, candidates, carriers: [diagonal] })).toBeNull();
    const r = bestRoomReach({ ...base, candidates, carriers: [diagonal, junction('j', 0, 0)] });
    expect(r!.carrierId).toBe('j');
  });

  it('skips a leg whose only tap spot is closer than 300 mm to a placed tap', () => {
    const r = bestRoomReach({
      ...base,
      candidates: [real(350, 1000)],
      carriers: [leg('h', { x: 0, y: 1000 }, { x: 700, y: 1000 })],
      placedTaps: [{ carrierId: 'h', sMm: 350 }],
    });
    expect(r).toBeNull();
  });

  it('puts the tap at a free far end of a leg only when tapAtFreeEnd is set', () => {
    const carriers = [{ ...leg('h', { x: 0, y: 0 }, { x: 5000, y: 0 }), freeB: true }];
    const candidates = [{ ...real(5000, 1500), outward: { x: 0, y: -1 } }];
    const free = bestRoomReach({ ...base, candidates, carriers, tapAtFreeEnd: true });
    expect(free!.tapMm).toEqual({ x: 5000, y: 0 });
    expect(free!.branch).toEqual([{ x: 5000, y: 0 }, { x: 5000, y: 1500 }]);
    const clamped = bestRoomReach({ ...base, candidates, carriers });
    expect(clamped!.tapMm).toEqual({ x: 4700, y: 0 });
    expect(clamped!.branch).toHaveLength(3);
  });

  it('puts the tap at a free near end of a leg only when tapAtFreeEnd is set', () => {
    const carriers = [{ ...leg('h', { x: 0, y: 0 }, { x: 5000, y: 0 }), freeA: true }];
    const candidates = [{ ...real(0, 1500), outward: { x: 0, y: -1 } }];
    const free = bestRoomReach({ ...base, candidates, carriers, tapAtFreeEnd: true });
    expect(free!.tapMm).toEqual({ x: 0, y: 0 });
    expect(free!.branch).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1500 }]);
    const clamped = bestRoomReach({ ...base, candidates, carriers });
    expect(clamped!.tapMm).toEqual({ x: 300, y: 0 });
    expect(clamped!.branch).toHaveLength(3);
  });

  it('keeps a tap off a non-free start of a leg shorter than 600 mm, and allows it on a free start', () => {
    const candidates = [real(100, 1500)];
    const blocked = bestRoomReach({
      ...base,
      candidates,
      carriers: [{ ...leg('h', { x: 0, y: 0 }, { x: 400, y: 0 }), freeA: false, freeB: true }],
      tapAtFreeEnd: true,
      tapGaps: { sameSideMm: 600, oppositeSideMm: 395 },
    });
    expect(blocked === null || blocked.tapMm.x !== 0).toBe(true);
    const free = bestRoomReach({
      ...base,
      candidates,
      carriers: [{ ...leg('h', { x: 0, y: 0 }, { x: 400, y: 0 }), freeA: true, freeB: true }],
      tapAtFreeEnd: true,
      tapGaps: { sameSideMm: 600, oppositeSideMm: 395 },
    });
    expect(free!.tapMm).toEqual({ x: 0, y: 0 });
  });

  it('returns only accepted paths that start on a carrier and end at the entry (200 seeded cases)', () => {
    let found = 0;
    for (let c = 0; c < 200; c++) {
      const r = rng(c + 1);
      const carriers = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => randomCarrier(r, `c${i}`));
      const candidates = Array.from({ length: 1 + Math.floor(r() * 8) }, () => randomCandidate(r));
      const placedTaps = Array.from({ length: Math.floor(r() * 3) }, () => ({
        carrierId: `c${Math.floor(r() * carriers.length)}`,
        sMm: 100 * Math.floor(r() * 30),
      }));
      const portsMm = Array.from({ length: Math.floor(r() * 3) }, () => ({ x: grid(r), y: grid(r) }));
      const searchMm = 1000 + 100 * Math.floor(r() * 40);
      const pathOk = (path: readonly Vec2[]): boolean => (path[0]!.x + path[0]!.y) % 300 !== 0;
      const result = bestRoomReach({ candidates, carriers, placedTaps, portsMm, pathOk, searchMm });
      if (!result) continue;
      found++;
      expect(pathOk(result.branch)).toBe(true);
      expect(result.branch[0]).toEqual(result.tapMm);
      expect(result.branch[result.branch.length - 1]).toEqual(result.entry.pointMm);
      const carrier = carriers.find((k) => k.id === result.carrierId);
      expect(carrier).toBeDefined();
      expect(onCarrier(result.tapMm, carrier!)).toBe(true);
      const carrierLen = Math.hypot(carrier!.b.x - carrier!.a.x, carrier!.b.y - carrier!.a.y);
      if (carrierLen >= 600) {
        const tapS = Math.hypot(result.tapMm.x - carrier!.a.x, result.tapMm.y - carrier!.a.y);
        for (const t of placedTaps.filter((p) => p.carrierId === carrier!.id)) {
          expect(Math.abs(tapS - t.sMm)).toBeGreaterThanOrEqual(300 - 1e-6);
        }
      }
      expect(Number.isFinite(result.costMm)).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('runs 47 rooms with 120 candidates and 60 carriers each within 1000 ms', () => {
    const r = rng(99);
    const start = performance.now();
    let found = 0;
    for (let room = 0; room < 47; room++) {
      const candidates = Array.from({ length: 120 }, () => ({
        pointMm: { x: 60000 * r(), y: 60000 * r() },
        outward: OUTWARD[Math.floor(r() * 4)]!,
        source: r() < 0.6 ? ('area-entry' as const) : ('ring' as const),
      }));
      const carriers = Array.from({ length: 60 }, (_, i) => randomCarrier(r, `c${i}`));
      if (bestRoomReach({ ...base, candidates, carriers, searchMm: 20000 })) found++;
    }
    const elapsed = performance.now() - start;
    expect(found).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
  });
});
