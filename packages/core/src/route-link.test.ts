import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { elbowPath } from './route-layout.js';
import { LINK_STEP_MM, searchLink, type LinkTap } from './route-link.js';

const P = (x: number, y: number): Vec2 => ({ x, y });

interface Rect {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function roomsAt(rects: Rect[]): (p: Vec2) => string | null {
  return (p) => {
    for (const r of rects) {
      if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) return r.id;
    }
    return null;
  };
}

function lengthOf(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y);
  }
  return total;
}

function turnsOf(path: Vec2[]): number {
  return Math.max(0, path.length - 2);
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function exitsOf(path: Vec2[], roomAt: (p: Vec2) => string | null): number {
  const samples: Vec2[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = manhattan(a, b);
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (let d = LINK_STEP_MM; d < len; d += LINK_STEP_MM) {
      samples.push({ x: a.x + dx * d, y: a.y + dy * d });
    }
    samples.push(b);
  }
  let exits = 0;
  for (let i = 1; i < samples.length; i++) {
    const first = roomAt(samples[i - 1]!);
    const second = roomAt(samples[i]!);
    if (first !== null && first !== second) exits++;
  }
  return exits;
}

function onLeg(p: Vec2, a: Vec2, b: Vec2): boolean {
  if (a.x === b.x) return Math.abs(p.x - a.x) < 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
  return Math.abs(p.y - a.y) < 1e-6 && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6;
}

describe('searchLink', () => {
  it('a. open field: the path has the Manhattan length, at most one bend, and leaves the tap along y', () => {
    const tap: LinkTap = { point: P(5000, 0), perpendicular: 'y' };
    const path = searchLink({
      port: P(6000, 4000),
      taps: [tap],
      built: [[P(0, 0), P(10000, 0)]],
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(P(5000, 0));
    expect(path![path!.length - 1]).toEqual(P(6000, 4000));
    expect(lengthOf(path!)).toBe(manhattan(P(5000, 0), P(6000, 4000)));
    expect(turnsOf(path!)).toBeLessThanOrEqual(1);
    expect(path![1]!.x).toBe(5000);
  });

  it('b. the grid has one path, with three turns, at any bend cost', () => {
    const input = {
      port: P(1400, 1400),
      taps: [{ point: P(0, 0), perpendicular: null }],
      built: [[P(1400, 0)], [P(0, 1400)], [P(0, 1000)], [P(1000, 1400)]],
      corners: [P(1200, 1200)],
      roomAt: () => null,
      wallMm: 0,
    };
    const expected = [P(0, 0), P(1000, 0), P(1000, 1000), P(1400, 1000), P(1400, 1400)];
    const straight = searchLink({ ...input, bendMm: 0 });
    const bent = searchLink({ ...input, bendMm: 5000 });
    expect(straight).toEqual(expected);
    expect(bent).toEqual(expected);
    expect(turnsOf(straight!)).toBe(3);
    expect(lengthOf(straight!)).toBe(manhattan(P(0, 0), P(1400, 1400)));
  });

  it('c. a wall price moves the path to the gap column that has no room', () => {
    const rects: Rect[] = [
      { id: 'A', x0: 0, y0: 0, x1: 1000, y1: 4000 },
      { id: 'B', x0: 2000, y0: 0, x1: 3000, y1: 4000 },
    ];
    const roomAt = roomsAt(rects);
    const input = {
      port: P(2500, 2000),
      taps: [{ point: P(500, -500), perpendicular: null }],
      built: [[P(2500, -500)]],
      corners: [P(1500, 1000)],
      roomAt,
      bendMm: 100,
    };
    const through = searchLink({ ...input, wallMm: 0 });
    const around = searchLink({ ...input, wallMm: 20000 });
    expect(through).not.toBeNull();
    expect(around).not.toBeNull();
    expect(exitsOf(through!, roomAt)).toBe(1);
    expect(exitsOf(around!, roomAt)).toBe(0);
    expect(lengthOf(around!)).toBe(manhattan(P(500, -500), P(2500, 2000)));
  });

  it('d. with no cost and no obstacle the length equals the shorter L-shape', () => {
    const from = P(0, 0);
    const to = P(3000, 2000);
    const path = searchLink({
      port: to,
      taps: [{ point: from, perpendicular: null }],
      built: [],
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    });
    const shorter = Math.min(
      lengthOf(elbowPath(from, to, 'x')),
      lengthOf(elbowPath(from, to, 'y')),
    );
    expect(path).not.toBeNull();
    expect(lengthOf(path!)).toBe(shorter);
  });

  it('e. the path touches a built leg only at the tap', () => {
    const tap = P(0, 0);
    const built = [[P(0, 0), P(0, 1000), P(3000, 1000)]];
    const path = searchLink({
      port: P(3000, -1000),
      taps: [{ point: tap, perpendicular: null }],
      built,
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    });
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!;
      const b = path![i]!;
      const len = manhattan(a, b);
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      for (let d = 0; d <= len; d += 50) {
        const p = P(a.x + dx * d, a.y + dy * d);
        for (const leg of built) {
          for (let k = 1; k < leg.length; k++) {
            if (!onLeg(p, leg[k - 1]!, leg[k]!)) continue;
            expect(p).toEqual(tap);
          }
        }
      }
    }
  });

  it('f. perpendicular sets the axis of the leg that reaches the tap', () => {
    const base = {
      port: P(2000, 2000),
      built: [],
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    };
    const horizontal = searchLink({ ...base, taps: [{ point: P(0, 0), perpendicular: 'x' }] });
    const vertical = searchLink({ ...base, taps: [{ point: P(0, 0), perpendicular: 'y' }] });
    expect(horizontal).not.toBeNull();
    expect(vertical).not.toBeNull();
    expect(horizontal![0]!.y).toBe(horizontal![1]!.y);
    expect(vertical![0]!.x).toBe(vertical![1]!.x);
  });

  it('g. the result is deterministic, and no path returns null when the tap is surrounded', () => {
    const input = {
      port: P(3000, 3000),
      taps: [{ point: P(0, 0), perpendicular: null }],
      built: [],
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    };
    expect(searchLink(input)).toEqual(searchLink(input));
    const ring = [P(-1000, -1000), P(1000, -1000), P(1000, 1000), P(-1000, 1000), P(-1000, -1000)];
    const surrounded = searchLink({ ...input, built: [ring] });
    expect(surrounded).toBeNull();
  });

  it('h. two rooms that touch count one room exit at their shared boundary', () => {
    const roomAt = roomsAt([
      { id: 'A', x0: 0, y0: 0, x1: 1000, y1: 1000 },
      { id: 'B', x0: 1000, y0: 0, x1: 2000, y1: 1000 },
    ]);
    const input = {
      port: P(1500, 500),
      taps: [{ point: P(500, -500), perpendicular: null }],
      built: [[P(1500, -500)]],
      corners: [P(1400, -800)],
      roomAt,
      bendMm: 100,
    };
    expect(searchLink({ ...input, wallMm: 50 })).toEqual([P(500, -500), P(500, 500), P(1500, 500)]);
    expect(searchLink({ ...input, wallMm: 150 })).toEqual([P(500, -500), P(1200, -500), P(1200, 500), P(1500, 500)]);
  });

  it('i. two taps at equal cost: the tap at the lower node index wins, not the first in the list', () => {
    const path = searchLink({
      port: P(2000, 2000),
      taps: [
        { point: P(4000, 0), perpendicular: null },
        { point: P(0, 0), perpendicular: null },
      ],
      built: [],
      corners: [],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    });
    expect(path![0]).toEqual(P(0, 0));
  });

  it('j. a tap is an end: the path does not pass through another tap', () => {
    const path = searchLink({
      port: P(2000, 0),
      taps: [
        { point: P(0, 0), perpendicular: null },
        { point: P(1000, 0), perpendicular: 'y' },
      ],
      built: [[P(1000, 800)]],
      corners: [P(1000, 1000)],
      roomAt: () => null,
      bendMm: 0,
      wallMm: 0,
    });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(P(0, 0));
    expect(path!.some((p) => p.x === 1000 && p.y === 0)).toBe(false);
  });

  it('k. many corners: the line cap still gives a path, the same on each call', () => {
    const corners: Vec2[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) corners.push(P(-400 + i * 250, -400 + j * 250));
    }
    const input = {
      port: P(2000, 2000),
      taps: [{ point: P(0, 0), perpendicular: null }],
      built: [],
      corners,
      roomAt: () => null,
      bendMm: 500,
      wallMm: 0,
    };
    const first = searchLink(input);
    expect(first).not.toBeNull();
    expect(searchLink(input)).toEqual(first);
    expect(first![0]).toEqual(P(0, 0));
    expect(first![first!.length - 1]).toEqual(P(2000, 2000));
  });
});
