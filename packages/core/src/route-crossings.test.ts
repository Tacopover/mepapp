import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import { crossingsAlongPath } from './route-crossings.js';

const room = (id: string, x0: number, y0: number, x1: number, y1: number, pageIndex = 0): Room => ({
  id,
  pageIndex,
  polygon: {
    outer: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    holes: [],
  },
  name: null,
  number: null,
  source: 'manual',
  locked: false,
  open: false,
});

const opts = { mmPerPt: 1, pageIndex: 0 };

describe('crossingsAlongPath', () => {
  it('finds one crossing over a 300 mm wall', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, opts);
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    const c = crossings[0]!;
    expect(c.fromRoomId).toBe('A');
    expect(c.toRoomId).toBe('B');
    // The error is up to one sampling step (100 mm).
    expect(c.gapMm).toBeGreaterThanOrEqual(300);
    expect(c.gapMm).toBeLessThanOrEqual(400);
    expect(Math.abs(c.point.x - 2150)).toBeLessThanOrEqual(100);
    expect(Math.abs(c.point.y - 500)).toBeLessThan(1);
    expect(Math.abs(c.atMm - 1650)).toBeLessThanOrEqual(100);
  });

  it('gives a gap of 0 for touching rooms', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2000, 0, 4000, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, opts);
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.gapMm).toBe(0);
  });

  it('lists two crossings of three rooms in path order', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000), room('C', 4600, 0, 6600, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 6000, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, opts);
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(2);
    expect(crossings[0]!.fromRoomId).toBe('A');
    expect(crossings[0]!.toRoomId).toBe('B');
    expect(crossings[1]!.fromRoomId).toBe('B');
    expect(crossings[1]!.toRoomId).toBe('C');
    expect(crossings[0]!.atMm).toBeLessThan(crossings[1]!.atMm);
  });

  it('gives nothing for a path inside one room', () => {
    const rooms = [room('A', 0, 0, 2000, 1000)];
    const path: Vec2[] = [
      { x: 100, y: 100 },
      { x: 1900, y: 900 },
    ];
    expect(crossingsAlongPath(rooms, path, opts)).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives an open run for a gap of 1500 mm', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 3500, 0, 5000, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 4500, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, opts);
    expect(crossings).toEqual([]);
    expect(openRuns).toHaveLength(1);
    const r = openRuns[0]!;
    // The gap is 1600 mm on the samples. The error is up to one sampling step (100 mm).
    expect(Math.abs(r.lengthMm - 1500)).toBeLessThanOrEqual(100);
    expect(r.fromRoomId).toBe('A');
    expect(r.toRoomId).toBe('B');
  });

  it('gives nothing when the path leaves a room and comes back to it', () => {
    const rooms = [room('A', 0, 0, 2000, 1000)];
    const path: Vec2[] = [
      { x: 1000, y: 500 },
      { x: 1000, y: 1500 },
      { x: 1500, y: 1500 },
      { x: 1500, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, opts)).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives nothing when the path starts and ends outside every room', () => {
    const rooms = [room('A', 0, 0, 2000, 1000)];
    const path: Vec2[] = [
      { x: -1000, y: 500 },
      { x: 1000, y: 500 },
      { x: 3000, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, opts)).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives nothing for rooms on another page', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, { mmPerPt: 1, pageIndex: 1 })).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives nothing and does not throw for a path with one point or none', () => {
    const rooms = [room('A', 0, 0, 2000, 1000)];
    expect(crossingsAlongPath(rooms, [{ x: 500, y: 500 }], opts)).toEqual({ crossings: [], openRuns: [] });
    expect(crossingsAlongPath(rooms, [], opts)).toEqual({ crossings: [], openRuns: [] });
  });

  it('finds a gap of 0 between a room and a room nested in it', () => {
    const rooms = [room('Outer', 0, 0, 4000, 4000), room('Inner', 1000, 1000, 2000, 2000)];
    const path: Vec2[] = [
      { x: 500, y: 1500 },
      { x: 1500, y: 1500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, opts);
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.fromRoomId).toBe('Outer');
    expect(crossings[0]!.toRoomId).toBe('Inner');
    expect(crossings[0]!.gapMm).toBe(0);
  });

  it('adds the end point once when the step does not divide the length', () => {
    // Room B starts 5 mm before the path end and off the 300 mm step grid, so only the end point is inside B.
    const rooms = [room('A', 0, 0, 2600, 1000), room('B', 2985, 0, 4000, 1000)];
    const path: Vec2[] = [
      { x: 1000, y: 500 },
      { x: 2990, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, { ...opts, stepMm: 300 });
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.fromRoomId).toBe('A');
    expect(crossings[0]!.toRoomId).toBe('B');
    expect(crossings[0]!.gapMm).toBe(490);
  });

  it('keeps the crossing at the end of a path that ends inside the next room', () => {
    // Room B starts 5 mm before the path end and off the 250 mm step grid, so only the end point is inside B.
    const rooms = [room('A', 0, 0, 2700, 1000), room('B', 2995, 0, 4000, 1000)];
    const path: Vec2[] = [
      { x: 1000, y: 500 },
      { x: 3000, y: 500 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, { ...opts, stepMm: 250 });
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.fromRoomId).toBe('A');
    expect(crossings[0]!.toRoomId).toBe('B');
    expect(crossings[0]!.gapMm).toBe(500);
  });

  it('gives nothing for a path of 250 mm inside one room with a 100 mm step', () => {
    const rooms = [room('A', 0, 0, 2000, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 750, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, { ...opts, stepMm: 100 })).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives nothing and does not hang when mmPerPt is Infinity', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, { mmPerPt: Infinity, pageIndex: 0 })).toEqual({
      crossings: [],
      openRuns: [],
    });
  });

  it('gives nothing and does not hang when stepMm is Infinity', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, { ...opts, stepMm: Infinity })).toEqual({ crossings: [], openRuns: [] });
  });

  it('gives nothing and does not hang when the path has an Infinity coordinate', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: Infinity, y: 500 },
    ];
    expect(crossingsAlongPath(rooms, path, opts)).toEqual({ crossings: [], openRuns: [] });
  });

  it('measures the wall in mm when 1 pt is 10 mm', () => {
    const rooms = [room('A', 0, 0, 200, 100), room('B', 230, 0, 430, 100)];
    const path: Vec2[] = [
      { x: 50, y: 50 },
      { x: 380, y: 50 },
    ];
    const { crossings, openRuns } = crossingsAlongPath(rooms, path, { mmPerPt: 10, pageIndex: 0 });
    expect(openRuns).toEqual([]);
    expect(crossings).toHaveLength(1);
    // The error is up to one sampling step (100 mm).
    expect(crossings[0]!.gapMm).toBeGreaterThanOrEqual(300);
    expect(crossings[0]!.gapMm).toBeLessThanOrEqual(400);
  });

  it('does not change the rooms or the path', () => {
    const rooms = [room('A', 0, 0, 2000, 1000), room('B', 2300, 0, 4300, 1000)];
    const path: Vec2[] = [
      { x: 500, y: 500 },
      { x: 3800, y: 500 },
    ];
    const roomsBefore = JSON.stringify(rooms);
    const pathBefore = JSON.stringify(path);
    crossingsAlongPath(rooms, path, opts);
    expect(JSON.stringify(rooms)).toBe(roomsBefore);
    expect(JSON.stringify(path)).toBe(pathBefore);
  });
});
