import { describe, expect, it } from 'vitest';
import { openPortsOf, type RouteStamp } from './route-ports.js';
import { SYNTHETIC_CENTER_PORT_ID } from './stamp.js';

function stamp(id: string, rotationDegrees: number, ports: RouteStamp['ports'], routingTargets: RouteStamp['routingTargets']): RouteStamp {
  return {
    id,
    category: 'terminal',
    transform: { position: { x: 100, y: 100 }, rotationDegrees, scale: { x: 1, y: 1 } },
    nativeWidth: 100,
    nativeHeight: 50,
    ports,
    routingTargets,
  };
}

const P1 = { id: 'p1', name: 'Supply', fractionX: 0, fractionY: 0 };
const P2 = { id: 'p2', name: 'Return', fractionX: 1, fractionY: 1 };

describe('openPortsOf', () => {
  it('lists both ports of an unrotated stamp and the port of a rotated stamp at their world positions', () => {
    const plain = stamp('a', 0, [P1, P2], { p1: 'supply-air', p2: 'exhaust-air' });
    const rotated = stamp('b', 90, [P1], { p1: 'supply-air' });
    const open = openPortsOf([rotated, plain]);
    expect(open).toEqual([
      { stampId: 'b', portId: 'p1', networkTypeId: 'supply-air', world: { x: 125, y: 50 } },
      { stampId: 'a', portId: 'p1', networkTypeId: 'supply-air', world: { x: 50, y: 75 } },
      { stampId: 'a', portId: 'p2', networkTypeId: 'exhaust-air', world: { x: 150, y: 125 } },
    ]);
  });

  it('skips a port that has a segment and keeps the other port open', () => {
    const plain = stamp('a', 0, [P1, P2], { p1: 'supply-air', p2: 'exhaust-air' });
    plain.portSegmentTypes = { p1: 'supply-air' };
    const open = openPortsOf([plain]);
    expect(open.map((port) => port.portId)).toEqual(['p2']);
  });

  it('gives one open port at the center for a stamp without ports of its own', () => {
    const bare = stamp('c', 0, [], { [SYNTHETIC_CENTER_PORT_ID]: 'supply-air' });
    expect(openPortsOf([bare])).toEqual([
      { stampId: 'c', portId: SYNTHETIC_CENTER_PORT_ID, networkTypeId: 'supply-air', world: { x: 100, y: 100 } },
    ]);
  });

  it('gives no open port for a stamp without routing targets', () => {
    expect(openPortsOf([stamp('d', 0, [P1, P2], undefined)])).toEqual([]);
  });

  it('gives no open port for a routing target on a port id the stamp does not have', () => {
    expect(openPortsOf([stamp('e', 0, [P1], { ghost: 'supply-air' })])).toEqual([]);
  });

  it('keeps the order of the stamps, then the order of their ports', () => {
    const first = stamp('f', 0, [P2, P1], { p1: 'supply-air', p2: 'exhaust-air' });
    const second = stamp('g', 0, [P1], { p1: 'supply-air' });
    expect(openPortsOf([first, second]).map((port) => `${port.stampId}:${port.portId}`)).toEqual(['f:p2', 'f:p1', 'g:p1']);
  });
});
