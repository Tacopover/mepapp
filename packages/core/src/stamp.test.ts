import { describe, expect, it } from 'vitest';
import { getStampHalfExtents, getStampWorldPorts, type PlacedStamp } from './stamp.js';

describe('PlacedStamp helpers', () => {
  const stamp: PlacedStamp = {
    id: 's1',
    transform: { position: { x: 100, y: 50 }, rotationDegrees: 0, scale: { x: 2, y: 3 } },
    nativeWidth: 40,
    nativeHeight: 20,
    ports: [{ id: 'p1', name: 'in', fractionX: 1, fractionY: 0.5 }],
  };

  it('scales half-extents by the transform scale', () => {
    expect(getStampHalfExtents(stamp)).toEqual({ halfWidth: 40, halfHeight: 30 });
  });

  it('places a port at the right edge, mid-height, at rotation 0', () => {
    const [port] = getStampWorldPorts(stamp);
    // fractionX=1 -> local x = +nativeWidth/2 = 20, scaled by 2 -> world x = 100+40=140
    // fractionY=0.5 -> local y = 0 -> world y = 50
    expect(port.world.x).toBeCloseTo(140, 9);
    expect(port.world.y).toBeCloseTo(50, 9);
  });
});
