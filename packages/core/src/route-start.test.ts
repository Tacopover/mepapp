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

const ONE_SUPPLY = segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out'));

describe('checkRouteStart', () => {
  it('finds no problem before the run when the start port has no segment', () => {
    expect(checkRouteStart(input())).toEqual([]);
  });

  it('finds an error after the run when the start port has no segment', () => {
    expect(checkRouteStart(input({ phase: 'after' }))).toEqual([{ code: 'port-segments', severity: 'error', count: 0 }]);
  });

  it('finds no problem in either phase when the start port has one segment of the chosen type', () => {
    expect(checkRouteStart(input({ segments: [ONE_SUPPLY] }))).toEqual([]);
    expect(checkRouteStart(input({ segments: [ONE_SUPPLY], phase: 'after' }))).toEqual([]);
  });

  it('finds a warning in both phases when the start port has two segments', () => {
    const segments = [ONE_SUPPLY, segment('s2', 'supply-air', port('ahu', 'out'), port('grille', 'out'))];
    const expected = [{ code: 'port-segments', severity: 'warning', count: 2 }];
    expect(checkRouteStart(input({ segments }))).toEqual(expected);
    expect(checkRouteStart(input({ segments, phase: 'after' }))).toEqual(expected);
  });

  it('finds an error when the start port has a segment of another type', () => {
    const segments = [segment('r1', 'return-air', port('ahu', 'out'), port('grille', 'out'))];
    expect(checkRouteStart(input({ segments }))).toContainEqual({ code: 'port-foreign-type', severity: 'error', typeIds: ['return-air'] });
  });

  it('finds not-equipment as an error for a terminal stamp', () => {
    const result = checkRouteStart(input({ stamps: [stamp('ahu', 'terminal', [OUT, IN]), grille] }));
    expect(result).toContainEqual({ code: 'not-equipment', severity: 'error' });
  });

  it('finds not-equipment as an error for a fitting stamp', () => {
    const result = checkRouteStart(input({ stamps: [stamp('ahu', 'fitting', [OUT, IN]), grille] }));
    expect(result).toContainEqual({ code: 'not-equipment', severity: 'error' });
  });

  it('returns only unknown-start when the start stamp is missing', () => {
    expect(checkRouteStart(input({ startStampId: 'nope' }))).toEqual([{ code: 'unknown-start', severity: 'error' }]);
  });

  it('returns only unknown-start when the start port is missing', () => {
    expect(checkRouteStart(input({ startPortId: 'nope' }))).toEqual([{ code: 'unknown-start', severity: 'error' }]);
  });

  it('does not change its input', () => {
    const segments = [ONE_SUPPLY, segment('r1', 'return-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const value = input({ segments, fittings: [fitting('f1')], portGroups: [{ elementId: 'ahu', portIds: ['out', 'in'] }] });
    const before = structuredClone(value);
    checkRouteStart(value);
    expect(value).toEqual(before);
  });
});
