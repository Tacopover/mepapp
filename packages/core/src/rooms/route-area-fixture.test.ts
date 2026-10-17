import { describe, expect, it } from 'vitest';
import { loadFirstFloorRooms } from './route-area-fixture.testutil.js';

describe('route-area fixture (01_arch_first_floor rooms)', () => {
  const { mmPerPt, rooms } = loadFirstFloorRooms();

  it('has 38 rooms, 5 of them corridors', () => {
    expect(rooms.length).toBe(38);
    expect(rooms.filter((r) => r.roomTypeId === 'corridor').length).toBe(5);
  });

  it('has the millimetres per point of scale 1:50', () => {
    expect(mmPerPt).toBeCloseTo((25.4 / 72) * 50, 10);
  });

  it('has rooms on page 0 with a non-empty outer ring', () => {
    for (const r of rooms) {
      expect(r.pageIndex).toBe(0);
      expect(r.polygon.outer.length).toBeGreaterThan(0);
    }
  });

  it('has a unique id for each room', () => {
    expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
  });
});
