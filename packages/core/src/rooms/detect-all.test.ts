import { describe, expect, it } from 'vitest';
import { SEGMENT_STRIDE, detectAllRooms, detectAllRoomsOnPage, fillRoomAt, filterWallSegments, type DetectAllPhase, type FilteredWalls, type WallCandidateSegments } from './index.js';

// Test drawing: 1 pt = 25 mm. A room of 240 x 160 pt is 6000 x 4000 mm = 24 m2.
const MM = 25;
const W = 240;
const H = 160;
const T = 8; // wall thickness: 200 mm

type Seg = [number, number, number, number];

function build(list: Seg[], bounds: [number, number, number, number]): WallCandidateSegments {
  const segments = new Float64Array(list.length * SEGMENT_STRIDE);
  list.forEach((s, i) => segments.set([s[0], s[1], s[2], s[3], 0.5, 0, 0, i + 1], i * SEGMENT_STRIDE));
  return { segments, segmentCount: list.length, bounds };
}

// Double-line walls of the rectangle (x, y)-(x + w, y + h). `gapPt` cuts an opening of that height into the right wall.
function room(x: number, y: number, w = W, h = H, gapPt = 0): Seg[] {
  const s: Seg[] = [
    [x, y, x + w, y],
    [x - T, y - T, x + w + T, y - T],
    [x, y + h, x + w, y + h],
    [x - T, y + h + T, x + w + T, y + h + T],
    [x, y, x, y + h],
    [x - T, y - T, x - T, y + h + T],
  ];
  const g0 = y + 40;
  if (gapPt > 0) {
    s.push([x + w, y, x + w, g0], [x + w, g0 + gapPt, x + w, y + h], [x + w + T, y - T, x + w + T, g0], [x + w + T, g0 + gapPt, x + w + T, y + h + T]);
  } else {
    s.push([x + w, y, x + w, y + h], [x + w + T, y - T, x + w + T, y + h + T]);
  }
  return s;
}

const filtered = (input: WallCandidateSegments): FilteredWalls => ({ walls: input, keep: filterWallSegments(input, MM).keep });
const inside = (r: { polygon: { outer: { x: number; y: number }[] } }, x: number, y: number): boolean => {
  const xs = r.polygon.outer.map((p) => p.x);
  const ys = r.polygon.outer.map((p) => p.y);
  return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
};

describe('detectAllRooms', () => {
  it('finds two closed rooms with the click-to-fill area, and reports the outside as a leak region', () => {
    const input = build([...room(100, 100), ...room(600, 100)], [0, 0, 1000, 400]);
    const walls = filtered(input);
    const res = detectAllRooms(walls, MM);
    expect(res.rooms).toHaveLength(2);
    expect(res.cancelled).toBe(false);
    for (const [cx, cy] of [
      [220, 180],
      [720, 180],
    ] as const) {
      const r = res.rooms.find((q) => inside(q, cx, cy))!;
      expect(r).toBeDefined();
      const click = fillRoomAt(walls, { x: cx, y: cy }, MM);
      expect(r.areaM2).toBeCloseTo(click.areaM2, 6);
      expect(r.areaM2).toBeGreaterThan(22);
      expect(r.areaM2).toBeLessThan(25);
      expect(r.flags.open).toBe(false);
    }
    expect(res.leaks.filter((l) => l.kind === 'border')).toHaveLength(1);
  });

  it('closes a door gap up to the gap width and does not return an open room', () => {
    const input = build([...room(100, 100, W, H, 32), ...room(600, 100, W, H, 60)], [0, 0, 1000, 400]);
    const res = detectAllRooms(filtered(input), MM);
    // 32 pt = 800 mm closes. 60 pt = 1500 mm leaks into the outside.
    expect(res.rooms).toHaveLength(1);
    expect(inside(res.rooms[0]!, 220, 180)).toBe(true);
  });

  it('returns a region that wraps the rooms (outside inside a frame) as an enclosing leak, not as a room', () => {
    // Frame drawn as a double-line wall with a margin around the building.
    const frame = room(20, 20, 900, 360);
    const input = build([...frame, ...room(100, 100), ...room(600, 100)], [0, 0, 1000, 420]);
    const res = detectAllRooms(filtered(input), MM);
    expect(res.rooms).toHaveLength(2);
    expect(res.leaks.some((l) => l.kind === 'enclosing')).toBe(true);
  });

  it('drops rooms smaller than minRoomM2', () => {
    const input = build([...room(100, 100, 80, 80), ...room(600, 100)], [0, 0, 1000, 400]);
    const walls = filtered(input);
    expect(detectAllRooms(walls, MM, {}, { minRoomM2: 0.5 }).rooms).toHaveLength(2);
    expect(detectAllRooms(walls, MM, {}, { minRoomM2: 10 }).rooms).toHaveLength(1);
  });

  it('reports progress from 0 to 1 in order and stops when cancelled', () => {
    const input = build([...room(100, 100), ...room(600, 100)], [0, 0, 1000, 400]);
    const walls = filtered(input);
    const seen: [number, DetectAllPhase][] = [];
    detectAllRooms(walls, MM, {}, { onProgress: (f, p) => seen.push([f, p]) });
    expect(seen[0]![0]).toBe(0);
    expect(seen[seen.length - 1]).toEqual([1, 'done']);
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    const res = detectAllRooms(walls, MM, {}, { shouldCancel: () => true });
    expect(res.cancelled).toBe(true);
    expect(res.rooms).toHaveLength(0);
  });

  it('uses a coarser raster above maxPixels', () => {
    const input = build(room(100, 100), [0, 0, 1000, 400]);
    const res = detectAllRooms(filtered(input), MM, {}, { maxPixels: 100_000 });
    expect(res.pxMm).toBeGreaterThan(33.3);
    expect(res.rooms).toHaveLength(1);
  });

  it('detectAllRoomsOnPage filters, and reuses the cache of detectRoomAt', () => {
    const input = build([...room(100, 100), ...room(600, 100)], [0, 0, 1000, 400]);
    const cache = {};
    const a = detectAllRoomsOnPage(input, MM, {}, {}, cache);
    expect(a.rooms).toHaveLength(2);
    const filteredRef = (cache as { filtered?: FilteredWalls }).filtered;
    expect(filteredRef).toBeDefined();
    detectAllRoomsOnPage(input, MM, {}, {}, cache);
    expect((cache as { filtered?: FilteredWalls }).filtered).toBe(filteredRef);
  });
});
