import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_DETECTION_PARAMS, filterWallSegments, type WallCandidateSegments } from './index.js';

const MM = 25; // 1 pt = 25 mm
type Seg = [number, number, number, number];

function build(list: Seg[]): WallCandidateSegments {
  const segments = new Float64Array(list.length * 8);
  list.forEach((s, i) => segments.set([s[0], s[1], s[2], s[3], 0.5, 0, 0, i + 1], i * 8));
  return { segments, segmentCount: list.length, bounds: [-100, -100, 500, 500] };
}

// Room 12 m x 8 m with double-line walls (200 mm thick), a table of 4.5 m x 2.5 m in pieces of 1.5 m, chairs of 500 mm along the long sides.
const T = 8;
const wallLines: Seg[] = [
  [0, 0, 480, 0], [-T, -T, 480 + T, -T],
  [0, 320, 480, 320], [-T, 320 + T, 480 + T, 320 + T],
  [0, 0, 0, 320], [-T, -T, -T, 320 + T],
  [480, 0, 480, 320], [480 + T, -T, 480 + T, 320 + T],
];
const table: Seg[] = [];
for (let k = 0; k < 3; k++) table.push([150 + k * 60, 100, 210 + k * 60, 100], [150 + k * 60, 200, 210 + k * 60, 200]);
table.push([150, 100, 150, 200], [330, 100, 330, 200]);
const chairs: Seg[] = [];
for (let k = 0; k < 9; k++) chairs.push([155 + k * 20, 92, 165 + k * 20, 92], [155 + k * 20, 208, 165 + k * 20, 208]);

describe('filterWallSegments: furniture beside chairs', () => {
  const input = build([...wallLines, ...table, ...chairs]);
  const tableStart = wallLines.length;
  const keptTable = (keep: Uint8Array): number => table.reduce((n, _, i) => n + keep[tableStart + i]!, 0);

  it('keeps the table edges when the partners may be short (old behaviour)', () => {
    const res = filterWallSegments(input, MM, { partnerMinMm: 0 });
    expect(keptTable(res.keep)).toBeGreaterThan(0);
  });

  it('drops the table edges when only short chair lines lie beside them, and keeps the walls', () => {
    expect(DEFAULT_ROOM_DETECTION_PARAMS.partnerMinMm).toBeGreaterThan(0);
    const res = filterWallSegments(input, MM);
    expect(keptTable(res.keep)).toBe(0);
    for (let i = 0; i < wallLines.length; i++) expect(res.keep[i]).toBe(1);
  });
});
