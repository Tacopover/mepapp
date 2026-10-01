import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectRoomAt, type RoomDetectionCache, type WallCandidateSegments } from './index.js';
import { isSimpleRing, ringArea } from './polygon-check.testutil.js';

// Cropped windows of the real fixture fixtures/pdfs/00_arch_ground_floor.pdf, exported by
// scripts/export-room-fixtures.mjs (Float32, layout of VectorPageData.segments).
const DIR = fileURLToPath(new URL('../../fixtures/rooms/', import.meta.url));

interface RoomFixture {
  name: string;
  id: string;
  label: string;
  seed: { x: number; y: number };
  labelAreaM2: number;
  bounds: [number, number, number, number];
  segmentCount: number;
  extra: boolean;
}
interface Index {
  scale: number;
  minCompMm: number; // component limit of the full page (a window has a smaller largest component)
  rooms: RoomFixture[];
}

const index: Index = JSON.parse(readFileSync(`${DIR}index.json`, 'utf8'));
const mmPerPt = (25.4 / 72) * index.scale;
// partnerMinMm 0 and hatchEvidence false: a crop window cuts off the long partner lines of its wall lines and changes the hatch share, so the furniture rules of the full page do not apply to it.

function load(room: RoomFixture): WallCandidateSegments {
  const buf = readFileSync(`${DIR}${room.name}.f32`);
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return { segments: Float64Array.from(f32), segmentCount: room.segmentCount, bounds: room.bounds };
}

// Rooms and the largest error against the label area that the test accepts.
// 0.30 sits at about -17 % in the prototype (label area 11 m2, fill about 9 m2): the check for it is
// that the seed stays inside the small room (before the seedClosed fix the fill was 338 m2).
const TOLERANCE: Record<string, number> = {
  '00_arch_ground_floor#2': 0.15,
  '00_arch_ground_floor#3': 0.15,
  '00_arch_ground_floor#x1': 0.15,
  '00_arch_ground_floor#x2': 0.25,
};

describe('room fixtures (00_arch_ground_floor windows)', () => {
  it('has all fixture files', () => {
    expect(index.rooms.length).toBe(4);
    for (const r of index.rooms) {
      expect(existsSync(`${DIR}${r.name}.f32`)).toBe(true);
      expect(readFileSync(`${DIR}${r.name}.f32`).byteLength).toBe(r.segmentCount * 8 * 4);
    }
  });

  for (const room of index.rooms) {
    for (const wallGrowMm of [0, 100]) {
      it(`${room.id} (label ${room.labelAreaM2} m2), wallGrowMm ${wallGrowMm}: area matches the label, polygon is valid`, () => {
        const input = load(room);
        const cache: RoomDetectionCache = {};
        const res = detectRoomAt(input, room.seed, mmPerPt, { wallGrowMm, minCompMm: index.minCompMm, labelAreaM2: room.labelAreaM2, partnerMinMm: 0, hatchEvidence: false }, cache);
        expect(res.flags.fillEmpty).toBe(false);
        expect(res.flags.touchesRoiBorder).toBe(false);
        expect(res.flags.open).toBe(false);
        const ratio = res.areaM2 / room.labelAreaM2;
        expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(TOLERANCE[room.id]!);
        // Exact polygon area agrees with the pixel count (snapping moves the boundary up to half a pixel per side), and with the ring itself.
        expect(Math.abs(res.areaM2 - res.pixelAreaM2) / res.pixelAreaM2).toBeLessThan(0.05);
        expect(res.areaM2).toBeCloseTo((ringArea(res.polygon.outer) * mmPerPt * mmPerPt) / 1e6 - holesArea(res.polygon.holes), 4);
        // The polygon is closed (implicitly), simple, and contains the seed.
        expect(res.polygon.outer.length).toBeGreaterThanOrEqual(4);
        expect(isSimpleRing(res.polygon.outer)).toBe(true);
        for (const h of res.polygon.holes) expect(isSimpleRing(h)).toBe(true);
        expect(inside(res.polygon.outer, res.seedPt)).toBe(true);
        // A second click in the same room reuses the filter and gives the same polygon area.
        const again = detectRoomAt(input, res.seedPt, mmPerPt, { wallGrowMm, minCompMm: index.minCompMm, labelAreaM2: room.labelAreaM2, partnerMinMm: 0, hatchEvidence: false }, cache);
        expect(again.areaM2).toBeCloseTo(res.areaM2, 1);
      });
    }
  }
});

function holesArea(holes: { x: number; y: number }[][]): number {
  return holes.reduce((s, h) => s + (ringArea(h) * mmPerPt * mmPerPt) / 1e6, 0);
}

function inside(ring: { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
