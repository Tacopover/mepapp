// Test helper: the rooms of the first floor fixture, exported by scripts/export-route-area-fixture.mjs (excluded from the build, see tsconfig.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Room } from './room.js';

const FILE = fileURLToPath(new URL('../../fixtures/route-area/first-floor-rooms.json', import.meta.url));

export function loadFirstFloorRooms(): { mmPerPt: number; rooms: Room[] } {
  const data = JSON.parse(readFileSync(FILE, 'utf8')) as { mmPerPt: number; rooms: Room[] };
  return { mmPerPt: data.mmPerPt, rooms: data.rooms };
}
