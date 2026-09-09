import { describe, expect, it } from 'vitest';
import { getStampHalfExtents, getStampPorts, getStampWorldPorts, SYNTHETIC_CENTER_PORT_ID, type PlacedStamp } from './stamp.js';

describe('PlacedStamp helpers', () => {
  const stamp: PlacedStamp = {
    id: 's1',
    category: 'terminal',
    transform: { position: { x: 100, y: 50 }, rotationDegrees: 0, scale: { x: 2, y: 3 } },
    nativeWidth: 40,
    nativeHeight: 20,
    ports: [{ id: 'p1', name: 'in', fractionX: 1, fractionY: 0.5 }],
  };

  const portlessStamp: PlacedStamp = { ...stamp, id: 's2', ports: [] };

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

  it('getStampPorts returns the authored ports unchanged when there are any', () => {
    expect(getStampPorts(stamp)).toEqual(stamp.ports);
  });

  it('getStampPorts synthesizes a single center port for a port-less stamp', () => {
    const ports = getStampPorts(portlessStamp);
    expect(ports).toHaveLength(1);
    expect(ports[0]).toMatchObject({ id: SYNTHETIC_CENTER_PORT_ID, fractionX: 0.5, fractionY: 0.5 });
  });

  it('getStampWorldPorts resolves the synthetic center port at the stamp\'s own position (fractions 0.5/0.5 is a no-op offset)', () => {
    const [port] = getStampWorldPorts(portlessStamp);
    expect(port.id).toBe(SYNTHETIC_CENTER_PORT_ID);
    expect(port.world).toEqual(portlessStamp.transform.position);
  });
});
