import { describe, expect, it } from 'vitest';
import { checkRouteStart, type StartCheckInput } from './route-start.js';
import type { ConnectionPoint, Fitting, Segment } from './network.js';
import type { RouteStamp } from './route-ports.js';

const OUT = { id: 'out', name: 'Out', fractionX: 0, fractionY: 0 };
const IN = { id: 'in', name: 'In', fractionX: 1, fractionY: 1 };

function stamp(id: string, category: RouteStamp['category'], ports: RouteStamp['ports']): RouteStamp {
  return {
    id,
    category,
    transform: { position: { x: 100, y: 100 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 100,
    nativeHeight: 50,
    ports,
  };
}

const ahu = stamp('ahu', 'equipment', [OUT, IN]);
const grille = stamp('grille', 'terminal', [OUT]);
const boiler = stamp('boiler', 'equipment', [OUT]);
const pump = stamp('pump', 'equipment', [IN]);
const fcu1 = stamp('fcu1', 'equipment', [OUT]);
const fcu2 = stamp('fcu2', 'equipment', [OUT]);
const fcu = stamp('fcu', 'equipment', [OUT]);

function port(elementId: string, portId: string): ConnectionPoint {
  return { kind: 'port', elementId, portId };
}

function segment(id: string, networkTypeId: string, endpointA: ConnectionPoint, endpointB: ConnectionPoint): Segment {
  return { id, pageIndex: 0, networkTypeId, shape: 'round', diameter: 200, endpointA, endpointB, geometry: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
}

function fitting(id: string): Fitting {
  return { id, pageIndex: 0, position: { x: 50, y: 0 }, kind: 'junction' };
}

function input(overrides: Partial<StartCheckInput> = {}): StartCheckInput {
  return {
    stamps: [ahu, grille],
    segments: [],
    fittings: [],
    portGroups: [],
    startStampId: 'ahu',
    startPortId: 'out',
    networkTypeId: 'supply-air',
    ...overrides,
  };
}

describe('checkRouteStart: groups, equipment and order', () => {
  it('finds an info when a group mate has a segment of another type', () => {
    const segments = [segment('r1', 'return-air', port('ahu', 'in'), port('grille', 'out'))];
    const result = checkRouteStart(input({ segments, portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] }));
    expect(result).toEqual([{ code: 'group-other-type', severity: 'info', typeIds: ['return-air'], portIds: ['in'] }]);
  });

  it('finds a warning when a group mate has a segment of the chosen type', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'in'), port('grille', 'out'))];
    const result = checkRouteStart(input({ segments, portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] }));
    expect(result).toEqual([{ code: 'group-same-type', severity: 'warning', portIds: ['in'] }]);
  });

  it('finds second-equipment when the start port joins an equipment stamp', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), port('fcu', 'out'))];
    expect(checkRouteStart(input({ stamps: [ahu, fcu], segments }))).toEqual([
      { code: 'second-equipment', severity: 'info', stampIds: ['fcu'] },
    ]);
  });

  it('finds no second-equipment when the other end is a terminal', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out'))];
    expect(checkRouteStart(input({ stamps: [ahu, grille], segments }))).toEqual([]);
  });

  it('finds no second-equipment when the other end stamp is missing from stamps', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), port('fcu', 'out'))];
    expect(checkRouteStart(input({ stamps: [ahu], segments }))).toEqual([]);
  });

  it('lists the equipment stamps of a water network sorted by id', () => {
    const segments = [
      segment('w1', 'water', port('boiler', 'out'), { kind: 'fitting', fittingId: 'f1' }),
      segment('w2', 'water', { kind: 'fitting', fittingId: 'f1' }, port('pump', 'in')),
      segment('w3', 'water', { kind: 'fitting', fittingId: 'f1' }, port('fcu2', 'out')),
      segment('w4', 'water', { kind: 'fitting', fittingId: 'f1' }, port('fcu1', 'out')),
    ];
    const result = checkRouteStart(
      input({
        stamps: [boiler, pump, fcu1, fcu2],
        segments,
        fittings: [fitting('f1')],
        startStampId: 'boiler',
        startPortId: 'out',
        networkTypeId: 'water',
      }),
    );
    expect(result).toEqual([{ code: 'second-equipment', severity: 'info', stampIds: ['fcu1', 'fcu2', 'pump'] }]);
  });

  it('orders the problems by severity: error, then warning, then info', () => {
    const segments = [
      segment('r1', 'return-air', port('ahu', 'in'), port('grille', 'out')),
      segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
      segment('r2', 'return-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' }),
    ];
    const result = checkRouteStart(input({ segments, fittings: [fitting('f1')], portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] }));
    expect(result).toEqual([
      { code: 'port-foreign-type', severity: 'error', typeIds: ['return-air'] },
      { code: 'port-segments', severity: 'warning', count: 2 },
      { code: 'group-other-type', severity: 'info', typeIds: ['return-air'], portIds: ['in'] },
    ]);
  });

  it('lists the error before the warning when the start port has two segments of two types', () => {
    const segments = [
      segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
      segment('r1', 'return-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' }),
    ];
    expect(checkRouteStart(input({ segments, fittings: [fitting('f1')] }))).toEqual([
      { code: 'port-foreign-type', severity: 'error', typeIds: ['return-air'] },
      { code: 'port-segments', severity: 'warning', count: 2 },
    ]);
  });

  it('does not change its input', () => {
    const segments = [
      segment('r1', 'return-air', port('ahu', 'in'), port('grille', 'out')),
      segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
      segment('r2', 'return-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' }),
    ];
    const value = input({ segments, fittings: [fitting('f1')], portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] });
    const before = structuredClone(value);
    checkRouteStart(value);
    expect(value).toEqual(before);
  });
});
