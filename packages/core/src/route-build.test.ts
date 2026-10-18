import { describe, expect, it } from 'vitest';
import { groupTargetPorts, planRoute, reducedState, resolveStart, type RouteBuildInput } from './route-build.js';
import type { RoutePlanWarning } from './route-plan-warnings.js';
import type { ConnectionPoint, Fitting, Segment } from './network.js';
import type { RoutePort, RouteStamp } from './route-ports.js';
import type { RouteArea } from './route-area.js';

const OUT = { id: 'out', name: 'Out', fractionX: 0, fractionY: 0 };
const OUT2 = { id: 'out2', name: 'Out 2', fractionX: 1, fractionY: 0 };
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

const ahu = stamp('ahu', 'equipment', [OUT, OUT2, IN]);
const grille = stamp('grille', 'terminal', [OUT]);

function port(elementId: string, portId: string): ConnectionPoint {
  return { kind: 'port', elementId, portId };
}

function segment(id: string, networkTypeId: string, endpointA: ConnectionPoint, endpointB: ConnectionPoint): Segment {
  return { id, pageIndex: 0, networkTypeId, shape: 'round', diameter: 200, endpointA, endpointB, geometry: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
}

function fitting(id: string, x = 50, y = 0): Fitting {
  return { id, pageIndex: 0, position: { x, y }, kind: 'junction' };
}

function target(stampId: string, roomId: string | null): RoutePort {
  return { stampId, portId: 'out', networkTypeId: 'supply-air', world: { x: 0, y: 0 }, roomId };
}

const AREA: RouteArea = {
  status: 'ok',
  rooms: [{ roomId: 'corr', kind: 'path', typeId: 'corridor', open: false, name: null }],
  nodes: [],
  edges: [],
  entries: [],
  links: [],
  unreached: [],
  parts: 1,
};

let counter = 0;

function input(overrides: Partial<RouteBuildInput> = {}): RouteBuildInput {
  return {
    startStampId: 'ahu',
    startPortId: 'out',
    networkTypeId: 'supply-air',
    targetPorts: [target('grille', 'r1')],
    state: { stamps: [ahu, grille], segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: [],
    area: AREA,
    mmPerPt: 10,
    pageIndex: 0,
    newSegmentId: () => `new-s${counter++}`,
    newFittingId: () => `new-f${counter++}`,
    ...overrides,
  };
}

function withState(state: Partial<RouteBuildInput['state']>): RouteBuildInput['state'] {
  return { stamps: [ahu, grille], segments: [], fittings: [], portGroups: [], ...state };
}

function codes(result: ReturnType<typeof planRoute>): string[] {
  return result.plan.warnings.map((warning) => warning.code);
}

function expectRefused(result: ReturnType<typeof planRoute>, code: string): void {
  expect(result.status).toBe('refused');
  expect(result.plan.segments).toEqual([]);
  expect(result.plan.fittings).toEqual([]);
  expect(result.plan.removeSegmentIds).toEqual([]);
  expect(result.plan.removeFittingIds).toEqual([]);
  expect(result.plan.warnings).toContainEqual(expect.objectContaining({ code, severity: 'error' }));
}

describe('planRoute preconditions', () => {
  it('refuses a file with more than one page', () => {
    expectRefused(planRoute(input({ pageCount: 2 })), 'multi-page');
  });

  it('refuses a drawing with no calibration', () => {
    expectRefused(planRoute(input({ mmPerPt: null })), 'no-calibration');
  });

  it('refuses an empty route area', () => {
    expectRefused(planRoute(input({ area: { ...AREA, status: 'no-rooms', rooms: [] } })), 'area-empty');
  });

  it('refuses a gravity network type', () => {
    expectRefused(planRoute(input({ networkTypeId: 'sanitary-waste' })), 'gravity-not-routed');
  });

  it('refuses an unknown start stamp', () => {
    const result = planRoute(input({ startStampId: 'nope' }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['unknown-start']);
  });

  it('refuses a start port with two segments', () => {
    const segments = [
      segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
      segment('s2', 'supply-air', port('ahu', 'out'), port('grille', 'out')),
    ];
    const result = planRoute(input({ state: withState({ segments }) }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['port-segments']);
  });

  it('refuses a start stamp that is not equipment', () => {
    const result = planRoute(input({ state: withState({ stamps: [stamp('ahu', 'terminal', [OUT, OUT2, IN]), grille] }) }));
    expectRefused(result, 'start-error');
    expect(result.plan.warnings[0]!.ids).toEqual(['not-equipment']);
  });

  it('refuses a stub network that holds a segment of another type', () => {
    const segments = [
      segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' }),
      segment('r1', 'return-air', { kind: 'fitting', fittingId: 'f1' }, port('grille', 'out')),
    ];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1')] }) }));
    expectRefused(result, 'foreign-start');
    expect(result.plan.warnings.find((warning) => warning.code === 'foreign-start')!.ids).toEqual(['r1']);
  });

  it('refuses a run with no target port', () => {
    expectRefused(planRoute(input({ targetPorts: [] })), 'no-targets');
  });

  it('collects all errors of step 1 in order', () => {
    const result = planRoute(input({ pageCount: 2, targetPorts: [] }));
    expect(codes(result)).toEqual(['multi-page', 'no-targets', 'draft-2d']);
  });

  it('puts draft-2d last in a refused result', () => {
    const result = planRoute(input({ pageCount: 2 }));
    expect(codes(result).at(-1)).toBe('draft-2d');
    expect(result.plan.stats.ports).toBe(0);
  });
});

describe('planRoute start', () => {
  it('extends a hand-drawn stub', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const result = planRoute(input({ state: withState({ segments, fittings: [fitting('f1', 30, 40)] }) }));
    expect(result.status).toBe('ok');
    expect(result.plan.warnings).toContainEqual({ code: 'extends-stub', severity: 'info', ids: ['s1', 'f1'] });
  });

  it('refuses a stub whose far end is a port', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out'))];
    expectRefused(planRoute(input({ state: withState({ segments }) })), 'start-unreachable');
  });

  it('warns about a same-type join through a port group', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out2'), port('grille', 'out'))];
    const portGroups = [{ elementId: 'ahu', portIds: ['out', 'out2'] }];
    const result = planRoute(input({ state: withState({ segments, portGroups }) }));
    expect(result.status).toBe('ok');
    expect(result.plan.warnings).toContainEqual({ code: 'same-type-join', severity: 'warning', ids: ['out2'] });
  });

  it('puts draft-2d last in an ok result', () => {
    expect(codes(planRoute(input())).at(-1)).toBe('draft-2d');
  });
});

describe('planRoute removal', () => {
  const segments = [segment('s2', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f2' })];
  const state = withState({ segments, fittings: [fitting('f2')] });

  it('treats a start port whose segment is removed as free', () => {
    const result = planRoute(input({ state, removal: { segmentIds: ['s2'], fittingIds: ['f2'] } }));
    expect(result.status).toBe('ok');
    expect(codes(result)).not.toContain('extends-stub');
  });

  it('reports the removal and sorts the removal ids', () => {
    const removal = { segmentIds: ['s9', 's2'], fittingIds: ['f2'] };
    const result = planRoute(input({ state, removal }));
    expect(result.plan.warnings).toContainEqual({ code: 'removes-routed', severity: 'info', numbers: { segments: 2, fittings: 1 } });
    expect(result.plan.removeSegmentIds).toEqual(['s2', 's9']);
    expect(result.plan.removeFittingIds).toEqual(['f2']);
    expect(result.plan.stats.removedSegments).toBe(2);
    expect(result.plan.stats.removedFittings).toBe(1);
  });

  it('removes exactly the removal ids in reducedState and keeps its input', () => {
    const value = withState({
      segments: [segment('s1', 'supply-air', port('ahu', 'out'), port('grille', 'out')), segments[0]!],
      fittings: [fitting('f1'), fitting('f2')],
    });
    const before = structuredClone(value);
    const reduced = reducedState(value, { segmentIds: ['s2'], fittingIds: ['f1'] });
    expect(reduced.segments.map((s) => s.id)).toEqual(['s1']);
    expect(reduced.fittings.map((f) => f.id)).toEqual(['f2']);
    expect(value).toEqual(before);
  });
});

describe('groupTargetPorts', () => {
  it('groups ports by room, outside and in the area', () => {
    const ports = [target('a', 'r2'), target('b', null), target('c', 'corr'), target('d', 'r1'), target('e', 'r2')];
    const grouped = groupTargetPorts(ports, new Set(['corr']));
    expect([...grouped.byRoom.keys()]).toEqual(['r1', 'r2']);
    expect(grouped.byRoom.get('r2')!.map((p) => p.stampId)).toEqual(['a', 'e']);
    expect(grouped.outside.map((p) => p.stampId)).toEqual(['b']);
    expect(grouped.inArea.map((p) => p.stampId)).toEqual(['c']);
  });
});

describe('planRoute result', () => {
  it('counts rooms and ports in the stats', () => {
    const targetPorts = [target('a', 'r1'), target('b', 'r1'), target('c', 'r2'), target('d', null)];
    const result = planRoute(input({ targetPorts }));
    expect(result.status).toBe('ok');
    expect(result.plan.segments).toEqual([]);
    expect(result.plan.stats.rooms).toBe(2);
    expect(result.plan.stats.ports).toBe(4);
  });

  it('does not change its input', () => {
    const segments = [segment('s1', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'f1' })];
    const value = input({
      state: withState({ segments, fittings: [fitting('f1')] }),
      removal: { segmentIds: ['s9', 's8'], fittingIds: [] },
      targetPorts: [target('b', 'r2'), target('a', 'r1')],
    });
    const { newSegmentId, newFittingId, ...data } = value;
    const before = { ...structuredClone(data), newSegmentId, newFittingId };
    planRoute(value);
    expect(value).toEqual(before);
  });
});

describe('resolveStart', () => {
  const own = (): Segment => segment('stub', 'supply-air', port('ahu', 'out'), { kind: 'fitting', fittingId: 'g' });
  it('gives the world position of the start port in mm when there is no segment', () => {
    const warnings: RoutePlanWarning[] = [];
    const data = input();
    expect(resolveStart(data, reducedState(data.state, data.removal), warnings)).toEqual({ ok: true, pointMm: { x: 500, y: 750 }, stubSegmentId: null, stubFittingId: null });
  });
  it('gives the stub fitting position in mm', () => {
    const warnings: RoutePlanWarning[] = [];
    const data = input({ state: withState({ segments: [own()], fittings: [fitting('g', 30, 40)] }) });
    expect(resolveStart(data, reducedState(data.state, data.removal), warnings)).toEqual({ ok: true, pointMm: { x: 300, y: 400 }, stubSegmentId: 'stub', stubFittingId: 'g' });
  });
  it('refuses a stub whose fitting is missing', () => {
    const result = planRoute(input({ state: withState({ segments: [own()] }) }));
    expectRefused(result, 'start-unreachable');
  });
  it('reads foreign-start from S, so a removed foreign segment does not count', () => {
    const foreign = segment('f1', 'return-air', { kind: 'fitting', fittingId: 'g' }, port('grille', 'out'));
    const state = withState({ segments: [own(), foreign], fittings: [fitting('g', 30, 40)] });
    expectRefused(planRoute(input({ state })), 'foreign-start');
    const result = planRoute(input({ state, removal: { segmentIds: ['f1'], fittingIds: [] } }));
    expect(result.status).toBe('ok');
  });
});
