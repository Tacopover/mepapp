import { describe, expect, it } from 'vitest';
import { clearRoutedMarks, routedRunOf } from './route-marks.js';
import { ROUTED_MARK, type ConnectionPoint, type Fitting, type Segment } from './network.js';

function fitEnd(fittingId: string): ConnectionPoint {
  return { kind: 'fitting', fittingId };
}

function portEnd(elementId: string, portId: string): ConnectionPoint {
  return { kind: 'port', elementId, portId };
}

function seg(id: string, endpointA: ConnectionPoint, endpointB: ConnectionPoint, marked = true): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId: 'supply-air',
    shape: 'round',
    diameter: 200,
    endpointA,
    endpointB,
    geometry: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    ...(marked ? { routedBy: ROUTED_MARK } : {}),
  };
}

function fit(id: string, marked = true): Fitting {
  return { id, pageIndex: 0, position: { x: 0, y: 0 }, kind: 'junction', ...(marked ? { routedBy: ROUTED_MARK } : {}) };
}

describe('routedRunOf', () => {
  it('collects every marked segment and fitting of a branching run', () => {
    const state = {
      segments: [
        seg('s1', portEnd('ahu', 'out'), fitEnd('f1')),
        seg('s2', fitEnd('f1'), portEnd('t1', 'p')),
        seg('s3', fitEnd('f1'), fitEnd('f2')),
        seg('s4', fitEnd('f2'), portEnd('t2', 'p')),
        seg('s5', fitEnd('f2'), portEnd('t3', 'p')),
      ],
      fittings: [fit('f1'), fit('f2')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({
      segmentIds: ['s1', 's2', 's3', 's4', 's5'],
      fittingIds: ['f1', 'f2'],
    });
  });

  it('stops at a fitting that a hand-drawn segment still uses, and keeps that fitting', () => {
    const state = {
      segments: [
        seg('s1', portEnd('ahu', 'out'), fitEnd('f2')),
        seg('h', fitEnd('f2'), fitEnd('f3'), false),
        seg('s6', fitEnd('f3'), portEnd('t9', 'p')),
      ],
      fittings: [fit('f2'), fit('f3')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: ['s1'], fittingIds: [] });
  });

  it('returns empty arrays when no segment ends on the start port', () => {
    const state = {
      segments: [seg('s1', portEnd('other', 'out'), fitEnd('f1'))],
      fittings: [fit('f1')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: [], fittingIds: [] });
  });

  it('walks from both segments when two marked segments end on the start port', () => {
    const state = {
      segments: [
        seg('s1', portEnd('ahu', 'out'), fitEnd('f1')),
        seg('s2', portEnd('ahu', 'out'), fitEnd('f2')),
        seg('s3', fitEnd('f1'), portEnd('t1', 'p')),
        seg('s4', fitEnd('f2'), portEnd('t2', 'p')),
      ],
      fittings: [fit('f1'), fit('f2')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: ['s1', 's2', 's3', 's4'], fittingIds: ['f1', 'f2'] });
  });

  it('returns empty arrays when two segments end on the start port and one has no mark', () => {
    const state = {
      segments: [seg('s1', portEnd('ahu', 'out'), fitEnd('f1')), seg('s2', portEnd('ahu', 'out'), fitEnd('f2'), false)],
      fittings: [fit('f1'), fit('f2')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: [], fittingIds: [] });
  });

  it('passes a hand-drawn stub at the start port and walks the marked run behind it', () => {
    const state = {
      segments: [
        seg('S', portEnd('ahu', 'out'), fitEnd('G'), false),
        seg('s1', fitEnd('G'), fitEnd('f1')),
        seg('s2', fitEnd('f1'), fitEnd('f2')),
        seg('s3', fitEnd('f2'), portEnd('t1', 'p')),
      ],
      fittings: [fit('G', false), fit('f1'), fit('f2')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: ['s1', 's2', 's3'], fittingIds: ['f1', 'f2'] });
  });

  it('returns empty arrays for a hand-drawn stub whose far end is a port', () => {
    const state = {
      segments: [seg('S', portEnd('ahu', 'out'), portEnd('t9', 'p'), false), seg('s1', portEnd('t9', 'p'), fitEnd('f1'))],
      fittings: [fit('f1')],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: [], fittingIds: [] });
  });

  it('stops at a shared terminal port and does not follow runs that end on it', () => {
    const state = {
      segments: [
        seg('s', portEnd('ahuA', 'out'), portEnd('T', 'p1')),
        seg('sB', portEnd('ahuB', 'out'), portEnd('T', 'p2')),
      ],
      fittings: [],
    };
    expect(routedRunOf(state, 'ahuA', 'out')).toEqual({ segmentIds: ['s'], fittingIds: [] });
  });

  it('stops at a terminal port reached through a fitting and skips the marked runs that start there', () => {
    const state = {
      segments: [
        seg('s1', portEnd('ahuA', 'out'), fitEnd('f')),
        seg('s2', fitEnd('f'), portEnd('T', 'p1')),
        seg('s9', portEnd('T', 'p1'), fitEnd('z')),
        seg('s10', fitEnd('z'), portEnd('t5', 'p')),
      ],
      fittings: [fit('f'), fit('z')],
    };
    expect(routedRunOf(state, 'ahuA', 'out')).toEqual({ segmentIds: ['s1', 's2'], fittingIds: ['f'] });
  });

  it('adds nothing beyond a marked segment that loops back onto the start port', () => {
    const state = {
      segments: [seg('s', portEnd('ahu', 'out'), portEnd('ahu', 'out'))],
      fittings: [],
    };
    expect(routedRunOf(state, 'ahu', 'out')).toEqual({ segmentIds: ['s'], fittingIds: [] });
  });

  it('does not join two routed runs that touch only at a hand-drawn segment', () => {
    const state = {
      segments: [
        seg('sA1', portEnd('ahuA', 'out'), fitEnd('fa')),
        seg('sA2', fitEnd('fa'), portEnd('tA', 'p1')),
        seg('h', fitEnd('fa'), fitEnd('fb'), false),
        seg('sB1', portEnd('ahuB', 'out'), fitEnd('fb')),
        seg('sB2', fitEnd('fb'), portEnd('tB', 'p1')),
      ],
      fittings: [fit('fa'), fit('fb')],
    };
    const result = routedRunOf(state, 'ahuA', 'out');
    expect(result).toEqual({ segmentIds: ['sA1', 'sA2'], fittingIds: [] });
    expect(result.segmentIds).not.toContain('h');
    expect(result.segmentIds).not.toContain('sB1');
    expect(result.segmentIds).not.toContain('sB2');
    expect(result.fittingIds).not.toContain('fb');
  });
});

describe('clearRoutedMarks', () => {
  it('returns copies without the route mark for the given ids and keeps the other fields', () => {
    const marked = seg('a', portEnd('ahu', 'out'), fitEnd('f1'));
    const { routedBy: _mark, ...rest } = marked;
    const result = clearRoutedMarks([marked], new Set(['a']));
    expect(Object.keys(result[0])).not.toContain('routedBy');
    expect(result[0]).toEqual(rest);
    expect(marked.routedBy).toBe(ROUTED_MARK);
  });

  it('returns the same object for items whose id is not in the set', () => {
    const other = seg('b', portEnd('ahu', 'out'), fitEnd('f1'));
    const result = clearRoutedMarks([other], new Set(['a']));
    expect(result[0]).toBe(other);
  });

  it('returns the same object for an unmarked item in the set', () => {
    const plain = seg('c', portEnd('ahu', 'out'), fitEnd('f1'), false);
    const result = clearRoutedMarks([plain], new Set(['c']));
    expect(result[0]).toBe(plain);
  });
});
