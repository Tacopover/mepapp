import { describe, expect, it } from 'vitest';
import { canJoinPoint, checkExisting, checkInvariant, distanceToPiece, makeCrossesExisting, type ExistingCheckInput } from './route-checks.js';
import { computeNetworks, type ConnectionPoint, type Fitting, type PortGroup, type Segment } from './network.js';
import type { Vec2 } from './geometry.js';

function fit(id: string): ConnectionPoint {
  return { kind: 'fitting', fittingId: id };
}

function port(elementId: string, portId: string): ConnectionPoint {
  return { kind: 'port', elementId, portId };
}

function seg(id: string, networkTypeId: string, a: ConnectionPoint, b: ConnectionPoint, geometry: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }], routedBy?: 'route'): Segment {
  return { id, pageIndex: 0, networkTypeId, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry, ...(routedBy ? { routedBy } : {}) };
}

function fitAt(id: string, x: number, y: number): Fitting {
  return { id, pageIndex: 0, position: { x, y }, kind: 'junction' };
}

function line(id: string, x0: number, y0: number, x1: number, y1: number, routedBy?: 'route'): Segment {
  return seg(id, 'return-air', fit(`${id}-a`), fit(`${id}-b`), [{ x: x0, y: y0 }, { x: x1, y: y1 }], routedBy);
}

const GROUP: PortGroup = { id: 'g1', elementId: 'p', portIds: ['a', 'b'] };

describe('canJoinPoint', () => {
  it('refuses a fitting that holds a segment of another type', () => {
    const graph = { segments: [seg('s1', 'return-air', fit('F'), fit('G'))], fittings: [fitAt('F', 0, 0), fitAt('G', 1, 0)], portGroups: [] };
    expect(canJoinPoint(graph, fit('F'), 'supply-air')).toEqual({ ok: false, hits: ['s1'] });
  });

  it('refuses when a foreign segment is further along the network of the point', () => {
    const graph = {
      segments: [seg('s_ok', 'supply-air', fit('F'), fit('G')), seg('s_bad', 'return-air', fit('G'), fit('H'))],
      fittings: [fitAt('F', 0, 0), fitAt('G', 1, 0), fitAt('H', 2, 0)],
      portGroups: [],
    };
    expect(canJoinPoint(graph, fit('F'), 'supply-air')).toEqual({ ok: false, hits: ['s_bad'] });
  });

  it('refuses a port group whose second port has a segment of a different type', () => {
    const graph = { segments: [seg('s2', 'return-air', port('p', 'b'), fit('G'))], fittings: [fitAt('G', 1, 0)], portGroups: [GROUP] };
    expect(canJoinPoint(graph, port('p', 'a'), 'supply-air')).toEqual({ ok: false, hits: ['s2'] });
  });

  it('accepts the same type through a port group and lists the segments of the group', () => {
    const graph = { segments: [seg('s3', 'supply-air', port('p', 'b'), fit('G'))], fittings: [fitAt('G', 1, 0)], portGroups: [GROUP] };
    expect(canJoinPoint(graph, port('p', 'a'), 'supply-air')).toEqual({ ok: true, sameTypeJoinIds: ['s3'], atNodeIds: ['s3'] });
    expect(canJoinPoint(graph, port('p', 'a'), 'supply-air', computeNetworks({ segments: graph.segments, fittings: graph.fittings, portGroups: graph.portGroups }))).toEqual({ ok: true, sameTypeJoinIds: ['s3'], atNodeIds: ['s3'] });
  });

  it('accepts a free port', () => {
    const graph = { segments: [], fittings: [], portGroups: [GROUP] };
    expect(canJoinPoint(graph, port('p', 'a'), 'supply-air')).toEqual({ ok: true, sameTypeJoinIds: [], atNodeIds: [] });
    expect(canJoinPoint(graph, port('q', 'x'), 'supply-air')).toEqual({ ok: true, sameTypeJoinIds: [], atNodeIds: [] });
  });

  it('lists the segments at a plain port of the same type with no group ids', () => {
    const graph = { segments: [seg('s4', 'supply-air', port('q', 'x'), fit('G'))], fittings: [fitAt('G', 1, 0)], portGroups: [] };
    expect(canJoinPoint(graph, port('q', 'x'), 'supply-air')).toEqual({ ok: true, sameTypeJoinIds: [], atNodeIds: ['s4'] });
  });
});

describe('checkExisting', () => {
  function run(overrides: Partial<ExistingCheckInput>) {
    return checkExisting({ newSegments: [], newFittings: [], existingSegments: [], existingFittings: [], existingPortPoints: [], mmPerPt: 1, ...overrides });
  }
  const newLeg = line('n1', 0, 0, 1000, 0);

  it('counts a proper crossing once for each pair and gives the point in page points', () => {
    const result = run({ mmPerPt: 2, newSegments: [line('n1', 0, 0, 500, 0)], existingSegments: [line('e1', 250, -100, 250, 100)] });
    expect(result.crossings).toBe(1);
    expect(result.crossingPoints).toEqual([{ x: 250, y: 0 }]);
    const twice = run({ newSegments: [{ ...newLeg, geometry: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 1000, y: 0 }] }], existingSegments: [line('e1', 300, -500, 300, 500), line('e2', 800, -500, 800, 500)] });
    expect(twice.crossings).toBe(2);
    const zigzag = run({ newSegments: [newLeg], existingSegments: [{ ...line('e1', 0, 0, 0, 0), geometry: [{ x: 300, y: -500 }, { x: 300, y: 500 }, { x: 400, y: 500 }, { x: 400, y: -500 }] }] });
    expect(zigzag.crossings).toBe(1);
  });

  it('does not count end points that touch', () => {
    expect(run({ newSegments: [newLeg], existingSegments: [line('e1', 1000, 0, 1000, 500)] }).crossings).toBe(0);
    expect(run({ newSegments: [newLeg], existingSegments: [line('e1', 500, 0, 500, 500)] }).crossings).toBe(0);
    expect(run({ newSegments: [newLeg], existingSegments: [line('e1', 500, 0.0000001, 500, 500)] }).crossings).toBe(0);
  });

  it('counts a collinear overlap of 600 mm and not one of 200 mm', () => {
    const long = run({ newSegments: [newLeg], existingSegments: [line('e1', 400, 0, 1500, 0)] });
    expect(long).toMatchObject({ overlaps: 1, overlapIds: ['e1'], lane: 0, crossings: 0 });
    const short = run({ newSegments: [newLeg], existingSegments: [line('e1', 800, 0, 1500, 0)] });
    expect(short).toMatchObject({ overlaps: 0, lane: 0 });
    const apart = run({ newSegments: [newLeg], existingSegments: [line('e1', 400, 5, 1500, 5)] });
    expect(apart.overlaps).toBe(0);
  });

  it('puts an overlap with a routed segment into lane', () => {
    const result = run({ newSegments: [newLeg], existingSegments: [line('e1', 400, 0, 1500, 0, 'route'), line('e2', 0, 0, 1000, 0)] });
    expect(result).toMatchObject({ overlaps: 1, overlapIds: ['e2'], lane: 1, laneIds: ['e1'] });
  });

  it('counts many overlapping legs of one existing segment once', () => {
    const result = run({ newSegments: [line('n1', 0, 0, 1000, 0), line('n2', 1000, 0, 2000, 0), line('n3', 2000, 0, 3000, 0)], existingSegments: [line('e1', 0, 0, 3000, 0)] });
    expect(result).toMatchObject({ overlaps: 1, overlapIds: ['e1'] });
  });

  it('lists a new fitting within 50 mm of a foreign fitting and not one at 80 mm', () => {
    const base = { mmPerPt: 2, existingFittings: [fitAt('x', 0, 0)] };
    const near = run({ ...base, newFittings: [fitAt('n', 15, 0)] });
    expect(near).toMatchObject({ nearItems: 1, nearPoints: [{ x: 15, y: 0 }] });
    expect(run({ ...base, newFittings: [fitAt('n', 40, 0)] }).nearItems).toBe(0);
  });

  it('lists a new port end near a foreign port point and counts each point once', () => {
    const end = seg('n1', 'supply-air', fit('a'), port('t', 'out'), [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    const result = run({ newSegments: [end], newFittings: [fitAt('n', 1000, 0)], existingPortPoints: [{ x: 1030, y: 0 }] });
    expect(result).toMatchObject({ nearItems: 1, nearPoints: [{ x: 1000, y: 0 }] });
  });

  it('does not change its input', () => {
    const data = { newSegments: [newLeg], existingSegments: [line('e1', 400, 0, 1500, 0)] };
    const before = structuredClone(data);
    run(data);
    expect(data).toEqual(before);
  });
});

describe('makeCrossesExisting', () => {
  const existing = [line('e1', 500, -500, 500, 500), line('e2', 700, -500, 700, 500)];
  it('counts the existing segments that the leg crosses', () => {
    const crosses = makeCrossesExisting(existing, 1);
    expect(crosses({ x: 0, y: 0 }, { x: 1000, y: 0 })).toBe(2);
    expect(crosses({ x: 0, y: 0 }, { x: 600, y: 0 })).toBe(1);
    expect(crosses({ x: 0, y: 0 }, { x: 400, y: 0 })).toBe(0);
    expect(crosses({ x: 0, y: 0 }, { x: 500, y: 0 })).toBe(0);
  });
  it('gives 0 for a leg of zero length', () => {
    expect(makeCrossesExisting(existing, 1)({ x: 500, y: 0 }, { x: 500, y: 0 })).toBe(0);
  });
  it('converts page points with mmPerPt', () => {
    const crosses = makeCrossesExisting([line('e1', 250, -250, 250, 250)], 2);
    expect(crosses({ x: 0, y: 0 }, { x: 1000, y: 0 })).toBe(1);
  });
});

describe('distanceToPiece', () => {
  it('measures to the nearest point of the piece', () => {
    expect(distanceToPiece({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToPiece({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});

describe('checkInvariant', () => {
  const old = [seg('o1', 'return-air', fit('G'), fit('H'))];
  const oldFittings = [fitAt('G', 0, 0), fitAt('H', 1, 0)];
  const base = { reducedSegments: old, reducedFittings: oldFittings, portGroups: [], networkTypeId: 'supply-air', growableSegmentIds: [] as string[] };

  it('holds when the new items stay apart', () => {
    const n1 = seg('n1', 'supply-air', fit('A'), fit('B'));
    expect(checkInvariant({ ...base, newSegments: [n1], newFittings: [fitAt('A', 5, 5), fitAt('B', 6, 5)] })).toEqual([]);
  });

  it('breaks when a new segment ends on a fitting of a foreign network', () => {
    const n1 = seg('n1', 'supply-air', fit('A'), fit('G'));
    expect(checkInvariant({ ...base, newSegments: [n1], newFittings: [fitAt('A', 5, 5)] })).toEqual(['n1', 'o1']);
  });

  it('lets a growable network grow but still checks the type', () => {
    const same = [seg('o2', 'supply-air', fit('G'), fit('H'))];
    const n1 = seg('n1', 'supply-air', fit('A'), fit('G'));
    const grow = { ...base, reducedSegments: same, newSegments: [n1], newFittings: [fitAt('A', 5, 5)] };
    expect(checkInvariant(grow)).toEqual(['n1']);
    expect(checkInvariant({ ...grow, growableSegmentIds: ['o2'] })).toEqual([]);
    expect(checkInvariant({ ...base, newSegments: [n1], newFittings: [fitAt('A', 5, 5)], growableSegmentIds: ['o1'] })).toEqual(['o1']);
  });
});
