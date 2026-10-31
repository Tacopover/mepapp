import { describe, expect, it } from 'vitest';
import {
  getStampHalfExtents,
  getStampPorts,
  getStampWorldPorts,
  matchPortsByLocation,
  parseRoutingTargets,
  remapRoutingTargets,
  routingTargetOf,
  SYNTHETIC_CENTER_PORT_ID,
  withRoutingTarget,
  type PlacedStamp,
} from './stamp.js';

describe('PlacedStamp helpers', () => {
  const stamp: PlacedStamp = {
    id: 's1',
    category: 'terminal',
    transform: { position: { x: 100, y: 50 }, rotationDegrees: 0, scale: { x: 2, y: 3 } },
    nativeWidth: 40,
    nativeHeight: 20,
    pageIndex: 0,
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

describe('matchPortsByLocation', () => {
  const port = (id: string, fractionX: number, fractionY: number) => ({ id, name: id, fractionX, fractionY });

  it('pairs ports by position even when the ids are swapped', () => {
    const oldPorts = [port('a', 0, 0.5), port('b', 1, 0.5)];
    const newPorts = [port('x', 1, 0.5), port('y', 0, 0.5)];
    expect(matchPortsByLocation(oldPorts, newPorts)).toEqual(new Map([['a', 'y'], ['b', 'x']]));
  });

  it('gives each new port to one old port only', () => {
    const oldPorts = [port('a', 0.1, 0.5), port('b', 0.2, 0.5)];
    const newPorts = [port('x', 0, 0.5), port('y', 1, 0.5)];
    expect(matchPortsByLocation(oldPorts, newPorts)).toEqual(new Map([['a', 'x'], ['b', 'y']]));
  });

  it('returns null when the port counts differ', () => {
    expect(matchPortsByLocation([port('a', 0, 0)], [port('x', 0, 0), port('y', 1, 1)])).toBeNull();
  });
});

describe('routing targets (auto-routing.md §4.1)', () => {
  const fcu = { routingTargets: { cw: 'chilled-water', hw: 'heating-water' } };

  it('routingTargetOf reads one port, the center port of a stamp without ports, and nothing for another key', () => {
    expect(routingTargetOf(fcu, 'hw')).toBe('heating-water');
    expect(routingTargetOf({ routingTargets: { [SYNTHETIC_CENTER_PORT_ID]: 'supply-air' } }, SYNTHETIC_CENTER_PORT_ID)).toBe('supply-air');
    expect(routingTargetOf(fcu, 'toString')).toBeUndefined();
    expect(routingTargetOf({}, 'cw')).toBeUndefined();
  });

  it('withRoutingTarget sets and removes the target of one port, and gives undefined when none stays', () => {
    expect(withRoutingTarget(undefined, SYNTHETIC_CENTER_PORT_ID, 'supply-air')).toEqual({ [SYNTHETIC_CENTER_PORT_ID]: 'supply-air' });
    expect(withRoutingTarget(fcu.routingTargets, 'hw', 'return-air')).toEqual({ cw: 'chilled-water', hw: 'return-air' });
    expect(withRoutingTarget(fcu.routingTargets, 'hw', null)).toEqual({ cw: 'chilled-water' });
    expect(withRoutingTarget({ cw: 'chilled-water' }, 'cw', null)).toBeUndefined();
    expect(fcu.routingTargets).toEqual({ cw: 'chilled-water', hw: 'heating-water' });
  });

  it('remapRoutingTargets moves the entries of a remap, keeps the ports that stay, and drops the lost ports', () => {
    expect(remapRoutingTargets(fcu.routingTargets, new Set(['cw', 'hw']))).toEqual(fcu.routingTargets);
    expect(remapRoutingTargets(fcu.routingTargets, new Set(['cw']))).toEqual({ cw: 'chilled-water' });
    expect(remapRoutingTargets(fcu.routingTargets, new Set(['a', 'b']), new Map([['cw', 'b'], ['hw', 'a']]))).toEqual({ a: 'heating-water', b: 'chilled-water' });
    expect(remapRoutingTargets(fcu.routingTargets, new Set([SYNTHETIC_CENTER_PORT_ID]))).toBeUndefined();
    expect(remapRoutingTargets(undefined, new Set(['cw']))).toBeUndefined();
  });

  it('parseRoutingTargets keeps the non-empty strings only', () => {
    expect(parseRoutingTargets(JSON.parse('{"cw":"chilled-water","hw":"","x":3,"y":null,"__proto__":"supply-air"}'))).toEqual({ cw: 'chilled-water' });
    expect(parseRoutingTargets({ hw: 2 })).toBeUndefined();
    expect(parseRoutingTargets(['supply-air'])).toBeUndefined();
    expect(parseRoutingTargets('supply-air')).toBeUndefined();
  });
});
