import { describe, expect, it } from 'vitest';
import { capacityWarnings, orderWarnings, shortLegCount } from './route-finish.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';
import type { Segment } from './network.js';
import type { SizedSegment } from './sizing-network.js';

function leg(id: string, lengthPt: number): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId: 'supply-air',
    shape: 'round',
    diameter: 200,
    endpointA: { kind: 'fitting', fittingId: 'a' },
    endpointB: { kind: 'fitting', fittingId: 'b' },
    geometry: [{ x: 0, y: 0 }, { x: lengthPt, y: 0 }],
  };
}

function round(segmentId: string, diameterMm: number): SizedSegment {
  return { segmentId, shape: 'round', diameterMm, velocityMs: 1, pressureDropPaPerM: 1, governedBy: 'velocity', flowM3s: 0.1 } as SizedSegment;
}

describe('shortLegCount', () => {
  it('counts a leg of 300 mm with a size of 200 and not a leg of 400 mm', () => {
    expect(shortLegCount([leg('s1', 30)], [round('s1', 200)], 10)).toBe(1);
    expect(shortLegCount([leg('s2', 40)], [round('s2', 200)], 10)).toBe(0);
  });

  it('uses the larger side of a rectangle', () => {
    const size = { ...round('s1', 0), shape: 'rectangular', diameterMm: undefined, widthMm: 300, heightMm: 100 } as SizedSegment;
    expect(shortLegCount([leg('s1', 50)], [size], 10)).toBe(1);
    expect(shortLegCount([leg('s1', 60)], [size], 10)).toBe(0);
  });

  it('ignores a leg with no size', () => {
    expect(shortLegCount([leg('s1', 1)], [], 10)).toBe(0);
  });
});

describe('capacityWarnings', () => {
  it('follows the hand values', () => {
    expect(capacityWarnings(300, 700, true)).toEqual({ code: 'capacity-over', severity: 'warning', numbers: { total: 400, cap: 300 } });
    expect(capacityWarnings(500, 900, true)).toBeNull();
    expect(capacityWarnings(0, 400, true)).toBeNull();
    expect(capacityWarnings(300, null, true)).toBeNull();
    expect(capacityWarnings(300, 700, false)).toEqual({ code: 'capacity-unit', severity: 'info', numbers: { total: 400, cap: 300 } });
  });
});

describe('orderWarnings', () => {
  it('puts errors, warnings, info and draft-2d in this order and keeps the order inside a group', () => {
    const lines: RoutePlanWarning[] = [
      { code: 'draft-2d', severity: 'info' },
      { code: 'rooms-skipped', severity: 'info' },
      { code: 'ports-left', severity: 'warning' },
      { code: 'internal-join', severity: 'error' },
      { code: 'free-angle', severity: 'warning' },
    ];
    const before = structuredClone(lines);
    expect(orderWarnings(lines).map((w) => w.code)).toEqual(['internal-join', 'ports-left', 'free-angle', 'rooms-skipped', 'draft-2d']);
    expect(lines).toEqual(before);
  });
});
