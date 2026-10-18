import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import {
  MIN_LEG_MM,
  applyJogRule,
  elbowPath,
  insideRouteArea,
  isLayoutPath,
  jogPath,
  legClass,
  straightenPolyline,
  withWallGaps,
} from './route-layout.js';

function pathLength(path: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return total;
}

describe('legClass', () => {
  it('classes a horizontal leg as axis', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe('axis');
  });

  it('classes a vertical leg as axis', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe('axis');
  });

  it('classes a 45 degree leg as diagonal', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 70, y: 70 })).toBe('diagonal');
  });

  it('classes a -45 degree leg as diagonal', () => {
    expect(legClass({ x: 0, y: 0 }, { x: -70, y: 70 })).toBe('diagonal');
  });

  it('classes a shallow leg as free', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 100, y: 1 })).toBe('free');
  });

  it('classes a zero-length leg as axis', () => {
    expect(legClass({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('axis');
  });
});

describe('isLayoutPath', () => {
  it('accepts a path of axis and diagonal legs', () => {
    expect(
      isLayoutPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 100 },
      ]),
    ).toBe(true);
  });

  it('rejects a path with a free leg', () => {
    expect(
      isLayoutPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 1 },
      ]),
    ).toBe(false);
  });

  it('accepts a path with one point', () => {
    expect(isLayoutPath([{ x: 0, y: 0 }])).toBe(true);
  });
});

describe('jogPath', () => {
  it('builds a Z along the longer x axis', () => {
    expect(jogPath({ x: 0, y: 0 }, { x: 10000, y: 600 })).toEqual([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 600 },
      { x: 10000, y: 600 },
    ]);
  });

  it('builds a Z along the longer y axis', () => {
    expect(jogPath({ x: 300, y: 0 }, { x: 100, y: 2400 })).toEqual([
      { x: 300, y: 0 },
      { x: 300, y: 1200 },
      { x: 100, y: 1200 },
      { x: 100, y: 2400 },
    ]);
  });

  it('returns the two points for an aligned pair', () => {
    expect(jogPath({ x: 0, y: 0 }, { x: 0, y: 500 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 500 },
    ]);
    expect(jogPath({ x: 0, y: 0 }, { x: 500, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
    ]);
  });
});

describe('elbowPath', () => {
  it('bends on the x axis first', () => {
    expect(elbowPath({ x: 0, y: 0 }, { x: 300, y: 400 }, 'x')).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
    ]);
  });

  it('bends on the y axis first', () => {
    expect(elbowPath({ x: 0, y: 0 }, { x: 300, y: 400 }, 'y')).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 400 },
      { x: 300, y: 400 },
    ]);
  });

  it('returns the two points for an aligned pair', () => {
    expect(elbowPath({ x: 0, y: 0 }, { x: 300, y: 0 }, 'y')).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ]);
  });
});

describe('applyJogRule', () => {
  it('turns a jump of 600 into two 45 degree bends', () => {
    const path = applyJogRule(jogPath({ x: 0, y: 0 }, { x: 10000, y: 600 }));
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 4700, y: 0 },
      { x: 5300, y: 600 },
      { x: 10000, y: 600 },
    ]);
    expect(pathLength(path)).toBeCloseTo(9400 + 600 * Math.SQRT2, 6);
  });

  it('turns a jump of exactly 1000 into two 45 degree bends', () => {
    const path = applyJogRule(jogPath({ x: 0, y: 0 }, { x: 16000, y: 1000 }));
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 7500, y: 0 },
      { x: 8500, y: 1000 },
      { x: 16000, y: 1000 },
    ]);
  });

  it('keeps the Z for a jump of 1001', () => {
    const z = jogPath({ x: 0, y: 0 }, { x: 16000, y: 1001 });
    const path = applyJogRule(z);
    expect(path).toEqual(z);
    expect(pathLength(path)).toBeCloseTo(17001, 6);
  });

  it('keeps the Z for a jump of 1500', () => {
    const z = jogPath({ x: 0, y: 0 }, { x: 10000, y: 1500 });
    const path = applyJogRule(z);
    expect(path).toEqual(z);
    expect(pathLength(path)).toBeCloseTo(11500, 6);
  });

  it('keeps a Z whose runs are shorter than the jump allows', () => {
    const z = [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 600 },
      { x: 1000, y: 600 },
    ];
    expect(applyJogRule(z)).toEqual(z);
  });

  it('keeps a pure diagonal unchanged', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 600, y: 600 },
    ];
    expect(applyJogRule(path)).toEqual(path);
    expect(pathLength(path)).toBeCloseTo(600 * Math.SQRT2, 6);
  });

  it('turns a tap into two 45 degree bends', () => {
    const path = applyJogRule(jogPath({ x: 300, y: 0 }, { x: 100, y: 2400 }));
    expect(path).toEqual([
      { x: 300, y: 0 },
      { x: 300, y: 1100 },
      { x: 100, y: 1300 },
      { x: 100, y: 2400 },
    ]);
    expect(pathLength(path)).toBeCloseTo(2200 + 200 * Math.SQRT2, 6);
  });

  it('turns two taps into two 45 degree bends', () => {
    const path = applyJogRule(jogPath({ x: 7300, y: 0 }, { x: 7200, y: -2400 }));
    expect(path).toEqual([
      { x: 7300, y: 0 },
      { x: 7300, y: -1150 },
      { x: 7200, y: -1250 },
      { x: 7200, y: -2400 },
    ]);
    expect(pathLength(path)).toBeCloseTo(2300 + 100 * Math.SQRT2, 6);
  });

  it('mirrors the jump 600 result for a negative jump', () => {
    expect(applyJogRule(jogPath({ x: 0, y: 0 }, { x: 10000, y: -600 }))).toEqual([
      { x: 0, y: 0 },
      { x: 4700, y: 0 },
      { x: 5300, y: -600 },
      { x: 10000, y: -600 },
    ]);
  });

  it('keeps a single bend unchanged', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 600 },
    ];
    expect(applyJogRule(path)).toEqual(path);
  });

  it('turns a staircase of two jumps that share a run into two 45 degree bends', () => {
    const path = applyJogRule([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 400 },
      { x: 6000, y: 400 },
      { x: 6000, y: 800 },
      { x: 9000, y: 800 },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 2800, y: 0 },
      { x: 3200, y: 400 },
      { x: 5800, y: 400 },
      { x: 6200, y: 800 },
      { x: 9000, y: 800 },
    ]);
  });

  it('keeps a staircase whose shared run is too short for the first jump', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 400 },
      { x: 3400, y: 400 },
      { x: 3400, y: 800 },
      { x: 6400, y: 800 },
    ];
    expect(applyJogRule(path)).toEqual(path);
  });

  it('keeps a vertical Z whose runs point in opposite directions', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 2000 },
      { x: 500, y: 2000 },
      { x: 500, y: 0 },
    ];
    expect(applyJogRule(path)).toEqual(path);
  });

  it('keeps a U shape unchanged', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 600 },
      { x: 0, y: 600 },
    ];
    expect(applyJogRule(path)).toEqual(path);
  });

  it('does not mutate the input and keeps the end points', () => {
    const input = jogPath({ x: 0, y: 0 }, { x: 10000, y: 600 });
    const copy = input.map((v) => ({ ...v }));
    const path = applyJogRule(input);
    expect(input).toEqual(copy);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 10000, y: 600 });
  });

  it('keeps every axis leg at or above MIN_LEG_MM for the sample jogs', () => {
    const samples = [
      applyJogRule(jogPath({ x: 0, y: 0 }, { x: 10000, y: 600 })),
      applyJogRule(jogPath({ x: 0, y: 0 }, { x: 16000, y: 1000 })),
      applyJogRule(jogPath({ x: 300, y: 0 }, { x: 100, y: 2400 })),
      applyJogRule(jogPath({ x: 7300, y: 0 }, { x: 7200, y: -2400 })),
    ];
    for (const path of samples) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        if (legClass(a, b) !== 'axis') continue;
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(MIN_LEG_MM);
      }
    }
  });

  it('gives paths that isLayoutPath accepts', () => {
    expect(isLayoutPath(applyJogRule(jogPath({ x: 0, y: 0 }, { x: 10000, y: 600 })))).toBe(true);
    expect(isLayoutPath(applyJogRule(jogPath({ x: 0, y: 0 }, { x: 16000, y: 1000 })))).toBe(true);
    expect(isLayoutPath(applyJogRule(jogPath({ x: 0, y: 0 }, { x: 16000, y: 1001 })))).toBe(true);
    expect(isLayoutPath(applyJogRule(jogPath({ x: 300, y: 0 }, { x: 100, y: 2400 })))).toBe(true);
    expect(isLayoutPath(applyJogRule(jogPath({ x: 7300, y: 0 }, { x: 7200, y: -2400 })))).toBe(true);
  });

  it('keeps the end points and a layout path for 200 seeded pairs', () => {
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let n = 0; n < 200; n++) {
      let x = 0;
      let y = 0;
      do {
        x = Math.round(-20000 + next() * 40000);
        y = Math.round(-3000 + next() * 6000);
      } while (x === 0 || y === 0);
      const from = { x: 0, y: 0 };
      const to = { x, y };
      const path = applyJogRule(jogPath(from, to));
      expect(isLayoutPath(path)).toBe(true);
      expect(path[0]).toEqual(from);
      expect(path[path.length - 1]).toEqual(to);
    }
  });
});

describe('straightenPolyline', () => {
  const always = (): boolean => true;

  it('keeps a straight axis polyline', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 0 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
      free: false,
    });
  });

  it('drifts a 100 mm offset onto the axis', () => {
    const result = straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 100 }], always);
    expect(result.path).toEqual([{ x: 0, y: 0 }, { x: 10000, y: 0 }]);
    expect(pathLength(result.path)).toBe(10000);
    expect(result.free).toBe(false);
  });

  it('bends a 400 mm offset into a 45 degree jog', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 400 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 4800, y: 0 }, { x: 5200, y: 400 }, { x: 10000, y: 400 }],
      free: false,
    });
  });

  it('keeps an L corridor of two axis legs', () => {
    const result = straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }], always);
    expect(result.path).toEqual([{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }]);
    expect(result.free).toBe(false);
  });

  it('bends a tilted leg into a 45 degree jog', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 600 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 4700, y: 0 }, { x: 5300, y: 600 }, { x: 10000, y: 600 }],
      free: false,
    });
  });

  it('removes a collinear middle vertex', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 10000, y: 0 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
      free: false,
    });
  });

  it('replaces a Z that leaves the region with an x-first elbow', () => {
    const region = (p: Vec2): boolean => (p.y <= 100 && p.x <= 10100) || p.x >= 9900;
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 6000 }], region)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 6000 }],
      free: false,
    });
  });

  it('returns the input unchanged and free when the region excludes everything', () => {
    const points = [{ x: 0, y: 0 }, { x: 10000, y: 600 }];
    expect(straightenPolyline(points, () => false)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 10000, y: 600 }],
      free: true,
    });
  });

  it('keeps a link valid when a wall node covers the gap', () => {
    const inner = (p: Vec2): boolean => (p.x <= 6000 || p.x >= 6400) && Math.abs(p.y) <= 50;
    const region = withWallGaps(inner, [{ x: 6200, y: 0 }]);
    expect(
      straightenPolyline([{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6400, y: 0 }, { x: 12000, y: 0 }], region),
    ).toEqual({
      path: [{ x: 0, y: 0 }, { x: 12000, y: 0 }],
      free: false,
    });
  });

  it('returns the input unchanged and free when the wall node is too far from the gap', () => {
    const inner = (p: Vec2): boolean => (p.x <= 6000 || p.x >= 6400) && Math.abs(p.y) <= 50;
    const region = withWallGaps(inner, [{ x: 8200, y: 0 }]);
    const points = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6400, y: 0 }, { x: 12000, y: 0 }];
    expect(straightenPolyline(points, region)).toEqual({ path: points, free: true });
  });

  it('bends a short tilted pair with one elbow, longer leg first', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 500, y: 400 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }],
      free: false,
    });
  });

  it('does not drift a 200 mm offset over a long run', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 10000, y: 200 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 4900, y: 0 }, { x: 5100, y: 200 }, { x: 10000, y: 200 }],
      free: false,
    });
  });

  it('drops a duplicate vertex', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5000, y: 0 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 5000, y: 0 }],
      free: false,
    });
  });

  it('takes the y-first elbow when the Z and the x-first elbow leave the region', () => {
    const region = (p: Vec2): boolean => p.x <= 100 || p.y >= 1900;
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 3000, y: 2000 }], region)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 0, y: 2000 }, { x: 3000, y: 2000 }],
      free: false,
    });
  });

  it('keeps the Z when the region holds everything and no 45 degree pair fits', () => {
    expect(straightenPolyline([{ x: 0, y: 0 }, { x: 3000, y: 2000 }], always)).toEqual({
      path: [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 2000 }, { x: 3000, y: 2000 }],
      free: false,
    });
  });

  it('does not mutate the input', () => {
    const input = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 10000, y: 0 }];
    const copy = input.map((v) => ({ ...v }));
    straightenPolyline(input, always);
    expect(input).toEqual(copy);
    const jogInput = [{ x: 0, y: 0 }, { x: 10000, y: 600 }];
    const jogCopy = jogInput.map((v) => ({ ...v }));
    straightenPolyline(jogInput, always);
    expect(jogInput).toEqual(jogCopy);
  });
});

describe('insideRouteArea', () => {
  const square = {
    polygon: {
      outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      holes: [],
    },
  };
  const far = {
    polygon: {
      outer: [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }],
      holes: [],
    },
  };

  it('counts a point inside the room', () => {
    expect(insideRouteArea([square], 10)({ x: 500, y: 500 })).toBe(true);
  });

  it('counts a point 100 mm outside the edge within the tolerance', () => {
    expect(insideRouteArea([square], 10)({ x: 1100, y: 500 })).toBe(true);
  });

  it('rejects a point 300 mm outside the edge', () => {
    expect(insideRouteArea([square], 10)({ x: 1300, y: 500 })).toBe(false);
  });

  it('counts a point inside either room', () => {
    expect(insideRouteArea([square, far], 10)({ x: 2500, y: 500 })).toBe(true);
  });
});

describe('withWallGaps', () => {
  const none = (): boolean => false;

  it('counts a point 700 mm from a wall node', () => {
    expect(withWallGaps(none, [{ x: 0, y: 0 }])({ x: 700, y: 0 })).toBe(true);
  });

  it('rejects a point 800 mm from a wall node', () => {
    expect(withWallGaps(none, [{ x: 0, y: 0 }])({ x: 800, y: 0 })).toBe(false);
  });
});
