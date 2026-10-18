import { describe, expect, it } from 'vitest';
import type { RoomPolygon } from './rooms/types.js';
import { distanceToRing } from './route-wall.js';

const square: RoomPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  holes: [],
};

describe('distanceToRing', () => {
  it('gives the distance to the nearest edge from inside', () => {
    expect(distanceToRing(square, { x: 50, y: 50 })).toBe(50);
  });

  it('gives the distance to the nearest edge from outside', () => {
    expect(distanceToRing(square, { x: 150, y: 50 })).toBe(50);
  });

  it('gives 0 on an edge', () => {
    expect(distanceToRing(square, { x: 0, y: 30 })).toBe(0);
  });

  it('gives the distance to the hole ring for a point inside the hole', () => {
    const holed: RoomPolygon = {
      outer: square.outer,
      holes: [
        [
          { x: 40, y: 40 },
          { x: 60, y: 40 },
          { x: 60, y: 60 },
          { x: 40, y: 60 },
        ],
      ],
    };
    expect(distanceToRing(holed, { x: 45, y: 50 })).toBe(5);
  });

  it('gives Infinity for a polygon with no ring', () => {
    expect(distanceToRing({ outer: [], holes: [] }, { x: 0, y: 0 })).toBe(Infinity);
  });
});
