// Prints the defect classes of the user screenshot (route quality plan, section 11) for each drawing. Scenario A, start 0, default options.
import { describe, expect, it } from 'vitest';
import { buildScenario, firstFloorDrawing, localDrawing, makeIdFactories, measureScenario, runScenario, type Drawing } from './route-scenario.testutil.js';

const TEST_TIMEOUT = 120000;

const SOURCES: { name: string; drawing: Drawing | null }[] = [
  { name: 'first floor', drawing: firstFloorDrawing() },
  { name: 'ground floor w_rooms (local-only)', drawing: localDrawing('ground-floor-w-rooms', 'ground floor w_rooms') },
  { name: '10A (local-only)', drawing: localDrawing('10A-rooms', '10A') },
];

describe('route defect classes (report)', () => {
  for (const kind of ['A', 'B'] as const) for (const source of SOURCES) {
    it(`counts the defect classes on ${source.name}, scenario ${kind}`, () => {
      if (source.drawing === null) {
        console.log(`SKIP ${source.name}: fixture missing`);
        return;
      }
      const scenario = buildScenario(source.drawing, kind, 0);
      expect(scenario).not.toBeNull();
      const s = scenario!;
      const run = runScenario(s, makeIdFactories());
      const m = measureScenario(s, run, source.name).metrics;
      const served = s.servedRooms.length;
      const roomBends = m.bendsRoom90 + m.bendsRoom45;
      console.log(
        [
          `DEFECTS ${source.name} scenario ${kind}: served rooms ${served}, off-graph ${m.offGraphRooms}, no-entry ${m.noEntryRooms}`,
          `  bends total 90/45: ${m.bends90}/${m.bends45}`,
          `  in route area 90/45: ${m.bendsArea90}/${m.bendsArea45}; in served rooms 90/45: ${m.bendsRoom90}/${m.bendsRoom45}; outside rooms: ${m.bendsOutside}`,
          `  rooms with bends: ${m.roomsWithBends}; bends in rooms per served room: ${(roomBends / Math.max(1, served)).toFixed(2)}`,
          `  chained rooms: ${m.chainedRooms}; rooms with more than one entry: ${m.multiEntryRooms}`,
          `  diagonal legs: ${m.diagonalLegs}; longer than 3000 mm: ${m.longDiagonalLegs}`,
        ].join('\n'),
      );
      expect(m.bends90 + m.bends45).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);
  }
});
