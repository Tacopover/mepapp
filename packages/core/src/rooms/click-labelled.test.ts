import { describe, expect, it } from 'vitest';
import { detectRoomAtWithLabels, polygonContainsPoint, type RoomLabel } from './index.js';

const MM_PER_PT = 25; // 40 pt = 1 m
const M = 40;
type Line = [number, number, number, number];
// Double-line walls (inner and outer face, `t` pt apart) around the rectangle (x, y, w, h).
const rect = (x: number, y: number, w: number, h: number, t = 8): Line[] => [
  [x, y, x + w, y],
  [x + w, y, x + w, y + h],
  [x + w, y + h, x, y + h],
  [x, y + h, x, y],
  [x - t, y - t, x + w + t, y - t],
  [x + w + t, y - t, x + w + t, y + h + t],
  [x + w + t, y + h + t, x - t, y + h + t],
  [x - t, y + h + t, x - t, y - t],
];
function input(lines: Line[]) {
  const segments = new Float64Array(lines.length * 8);
  lines.forEach((l, i) => segments.set([l[0], l[1], l[2], l[3], 0.5, 0, 0, i], i * 8));
  return { segments, segmentCount: lines.length, bounds: [-100, -100, 400, 400] as [number, number, number, number] };
}
const label = (x: number, y: number, areaM2: number | null): RoomLabel => ({ anchor: { x, y }, bounds: [x - 5, y - 5, x + 5, y + 5], lines: ['Room'], number: null, code: null, name: 'Room', details: [], areaM2, persons: null });

describe('detectRoomAtWithLabels', () => {
  const table = [...rect(0, 0, 6 * M, 6 * M), ...rect(60, 90, 3 * M, 1.5 * M)];

  it('repairs a click inside a table with the printed area of the label', () => {
    const inTable = { x: 120, y: 120 };
    const r = detectRoomAtWithLabels(input(table), inTable, MM_PER_PT, [label(120, 120, 36)]);
    expect(r.method).toBe('dissolved');
    expect(r.fill.areaM2).toBeGreaterThan(30);
    expect(r.label).not.toBeNull();
  });

  it('keeps the plain fill without a label area or when no label is near', () => {
    const inTable = { x: 120, y: 120 };
    expect(detectRoomAtWithLabels(input(table), inTable, MM_PER_PT, [label(120, 120, null)]).method).toBe('plain');
    expect(detectRoomAtWithLabels(input(table), inTable, MM_PER_PT, []).method).toBe('plain');
    expect(detectRoomAtWithLabels(input(table), { x: 30, y: 30 }, MM_PER_PT, [label(30, 30, 36)]).method).toBe('plain');
  });

  it('fills a cubicle narrower than the door gap, not the room next to it', () => {
    // A 0.8 m x 1.5 m cubicle in the corner of a 6 m x 6 m room, partitions of two lines 50 mm apart.
    const lines: Line[] = [
      [0, 0, 240, 0],
      [-8, -8, 248, -8],
      [240, 0, 240, 240],
      [248, -8, 248, 248],
      [240, 240, 0, 240],
      [248, 248, -8, 248],
      [0, 240, 0, 0],
      [-8, 248, -8, -8],
      [32, 0, 32, 60],
      [34, 0, 34, 62],
      [0, 60, 32, 60],
      [0, 62, 34, 62],
    ];
    const click = { x: 16, y: 30 };
    const r = detectRoomAtWithLabels(input(lines), click, MM_PER_PT, []);
    expect(polygonContainsPoint(r.fill.polygon, click)).toBe(true);
    expect(r.fill.areaM2).toBeCloseTo(1.2, 1);
  });

  it('keeps the plain fill when a repair cannot reach the printed area', () => {
    const r = detectRoomAtWithLabels(input(rect(0, 0, 6 * M, 6 * M)), { x: 100, y: 100 }, MM_PER_PT, [label(100, 100, 200)]);
    expect(r.method).toBe('plain');
    expect(r.label).toBeNull();
  });
});
