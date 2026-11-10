import { describe, expect, it } from 'vitest';
import { CommandManager, Transaction, splitSegmentAtFitting, type Fitting, type Segment, type Vec2 } from '@mepapp/core';
import type { DrawingState } from './document.js';
import { fittingContextIn, moveFittingInState, retagRunInState, riserConflictsIn, riserIdsTouchedBySegments, type RiserMark } from './riserMarks.js';

function fitting(id: string, position: Vec2, pageIndex = 0, routedBy?: 'route'): Fitting {
  return { id, pageIndex, position, kind: 'junction', ...(routedBy ? { routedBy } : {}) };
}

function makeState(overrides: Partial<DrawingState> = {}): DrawingState {
  const segment: Segment = {
    id: 's1',
    pageIndex: 0,
    networkTypeId: 'supply-air',
    shape: 'round',
    diameter: 200,
    endpointA: { kind: 'fitting', fittingId: 'f1' },
    endpointB: { kind: 'fitting', fittingId: 'f2' },
    geometry: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ],
  };
  return {
    segments: { s1: segment },
    fittings: { f1: fitting('f1', { x: 100, y: 100 }), f2: fitting('f2', { x: 300, y: 100 }) },
    stamps: {},
    annotations: {},
    circuits: {},
    panels: {},
    panelSections: {},
    rooms: {},
    ...overrides,
  };
}

describe('moveFittingInState', () => {
  it('moves the fitting and the attached segment end follows', () => {
    const before = makeState();
    const after = moveFittingInState(before, 'f1', { x: 100, y: 150 }, [])!;
    expect(after.fittings.f1.position).toEqual({ x: 100, y: 150 });
    expect(after.segments.s1.geometry[0]).toEqual({ x: 100, y: 150 });
    expect(after.segments.s1.geometry[1]).toEqual({ x: 300, y: 100 });
    expect(after.segments.s1.geometry).not.toEqual(before.segments.s1.geometry);
  });

  it('does not mutate the input state', () => {
    const before = makeState();
    moveFittingInState(before, 'f1', { x: 100, y: 150 }, []);
    expect(before.fittings.f1.position).toEqual({ x: 100, y: 100 });
    expect(before.segments.s1.geometry[0]).toEqual({ x: 100, y: 100 });
  });

  it('returns null for an unknown fitting id', () => {
    expect(moveFittingInState(makeState(), 'missing', { x: 1, y: 1 }, [])).toBeNull();
  });

  it('returns the same state object when the position is already equal', () => {
    const before = makeState();
    expect(moveFittingInState(before, 'f1', { x: 100, y: 100 }, [])).toBe(before);
  });

  it('clears the route mark of the moved fitting and of the segments that end at it', () => {
    const before = makeState({
      fittings: { f1: fitting('f1', { x: 100, y: 100 }, 0, 'route'), f2: fitting('f2', { x: 300, y: 100 }) },
      segments: {
        s1: { ...makeState().segments.s1, routedBy: 'route' },
      },
    });
    const after = moveFittingInState(before, 'f1', { x: 100, y: 150 }, [])!;
    expect(after.fittings.f1.routedBy).toBeUndefined();
    expect(after.segments.s1.routedBy).toBeUndefined();
  });

  it('restores the old position on undo and leaves no undo entry for setLiveState', () => {
    const initial = makeState();
    const manager = new CommandManager<DrawingState>(initial);
    const tx = new Transaction(manager, 'x');
    tx.update((s) => moveFittingInState(s, 'f1', { x: 100, y: 150 }, [])!);
    tx.commit();
    expect(manager.canUndo).toBe(true);
    manager.undo();
    expect(manager.getState().fittings.f1.position).toEqual({ x: 100, y: 100 });

    const fresh = new CommandManager<DrawingState>(initial);
    fresh.setLiveState(moveFittingInState(initial, 'f1', { x: 100, y: 150 }, [])!);
    expect(fresh.canUndo).toBe(false);
    expect(fresh.getState().fittings.f1.position).toEqual({ x: 100, y: 150 });
  });
});

describe('riserIdsTouchedBySegments', () => {
  const marks = new Map<string, RiserMark>([
    ['f1', { riserId: 'R1', name: 'R1', networkTypeId: 'supply-air', anchorPt: { x: 100, y: 100 } }],
    ['f2', { riserId: 'R2', name: 'R2', networkTypeId: 'supply-air', anchorPt: { x: 300, y: 100 } }],
  ]);
  const s1 = makeState().segments.s1;
  const portEnd: Segment = {
    ...s1,
    id: 's2',
    endpointA: { kind: 'port', elementId: 'stamp-1', portId: 'p1' },
    endpointB: { kind: 'port', elementId: 'stamp-2', portId: 'p2' },
  };

  it('returns no riser ids when no fitting is marked', () => {
    expect(riserIdsTouchedBySegments([s1], new Map())).toEqual([]);
  });

  it('returns the riser of one marked end', () => {
    expect(riserIdsTouchedBySegments([s1], new Map([['f1', marks.get('f1')!]]))).toEqual(['R1']);
  });

  it('dedupes riser ids over two segments on one riser', () => {
    const s2: Segment = { ...s1, id: 's2', endpointA: { kind: 'fitting', fittingId: 'f1' }, endpointB: { kind: 'fitting', fittingId: 'f3' } };
    expect(riserIdsTouchedBySegments([s1, s2], new Map([['f1', marks.get('f1')!]]))).toEqual(['R1']);
  });

  it('ignores a port endpoint', () => {
    expect(riserIdsTouchedBySegments([portEnd], marks)).toEqual([]);
  });

  it('keeps the riser of a marked fitting after splitSegmentAtFitting inserts a new fitting', () => {
    const f3: Fitting = { id: 'f3', pageIndex: 0, position: { x: 200, y: 100 }, kind: 'junction' };
    const { segmentA, segmentB } = splitSegmentAtFitting(s1, f3, { x: 200, y: 100 }, { segmentA: 'sa', segmentB: 'sb' });
    expect(riserIdsTouchedBySegments([segmentA, segmentB], new Map([['f2', marks.get('f2')!]]))).toEqual(['R2']);
  });
});

describe('retagRunInState', () => {
  function segmentAt(id: string, networkTypeId: string, endpointA: Segment['endpointA'], endpointB: Segment['endpointB']): Segment {
    return { ...makeState().segments.s1, id, networkTypeId, endpointA, endpointB };
  }
  const at = (fittingId: string) => ({ kind: 'fitting' as const, fittingId });
  const fourFittings = {
    f1: fitting('f1', { x: 100, y: 100 }),
    f2: fitting('f2', { x: 300, y: 100 }),
    f3: fitting('f3', { x: 500, y: 100 }),
    f4: fitting('f4', { x: 700, y: 100 }),
  };

  it('retags both segments of a run joined at the fitting', () => {
    const state = makeState({
      fittings: fourFittings,
      segments: {
        s1: segmentAt('s1', 'supply-air', at('f1'), at('f2')),
        s2: segmentAt('s2', 'supply-air', at('f2'), at('f3')),
      },
    });
    const after = retagRunInState(state, 'f2', 'return-air', [])!;
    expect(after.segments.s1.networkTypeId).toBe('return-air');
    expect(after.segments.s2.networkTypeId).toBe('return-air');
    expect(state.segments.s1.networkTypeId).toBe('supply-air');
  });

  it('keeps the type of a segment of another run with no shared fitting', () => {
    const state = makeState({
      fittings: fourFittings,
      segments: {
        s1: segmentAt('s1', 'supply-air', at('f1'), at('f2')),
        s3: segmentAt('s3', 'supply-air', at('f3'), at('f4')),
      },
    });
    const after = retagRunInState(state, 'f2', 'return-air', [])!;
    expect(after.segments.s1.networkTypeId).toBe('return-air');
    expect(after.segments.s3.networkTypeId).toBe('supply-air');
  });

  it('returns null for an unknown fitting id', () => {
    expect(retagRunInState(makeState(), 'missing', 'return-air', [])).toBeNull();
  });

  it('returns the same state object when the fitting has no segment', () => {
    const before = makeState({ fittings: { ...fourFittings } });
    expect(retagRunInState(before, 'f4', 'return-air', [])).toBe(before);
  });

  it('returns the same state object when every segment of the run has the type already', () => {
    const before = makeState();
    expect(retagRunInState(before, 'f1', 'supply-air', [])).toBe(before);
  });
});

describe('riserConflictsIn', () => {
  const marks = new Map<string, RiserMark>([['f1', { riserId: 'R1', name: 'R1', networkTypeId: 'supply-air', anchorPt: { x: 100, y: 100 } }]]);

  it('gives no conflict within the tolerance', () => {
    const state = makeState({ fittings: { f1: fitting('f1', { x: 100, y: 100.4 }), f2: fitting('f2', { x: 300, y: 100 }) } });
    expect(riserConflictsIn(state, marks, 0, 0.5)).toEqual([]);
  });

  it('gives one conflict beyond the tolerance', () => {
    const state = makeState({ fittings: { f1: fitting('f1', { x: 100, y: 100.6 }), f2: fitting('f2', { x: 300, y: 100 }) } });
    expect(riserConflictsIn(state, marks, 0, 0.5)).toEqual([{ fittingId: 'f1', fittingPt: { x: 100, y: 100.6 }, anchorPt: { x: 100, y: 100 } }]);
  });

  it('skips a fitting on another page', () => {
    const state = makeState({ fittings: { f1: fitting('f1', { x: 100, y: 150 }, 1), f2: fitting('f2', { x: 300, y: 100 }) } });
    expect(riserConflictsIn(state, marks, 0, 0.5)).toEqual([]);
  });

  it('skips a mark whose fitting is missing', () => {
    const state = makeState({ fittings: { f2: fitting('f2', { x: 300, y: 100 }) } });
    expect(riserConflictsIn(state, marks, 0, 0.5)).toEqual([]);
  });
});

describe('fittingContextIn', () => {
  function segmentAt(id: string, networkTypeId: string, endpointA: Segment['endpointA'], endpointB: Segment['endpointB']): Segment {
    return { ...makeState().segments.s1, id, networkTypeId, endpointA, endpointB };
  }
  const at = (fittingId: string) => ({ kind: 'fitting' as const, fittingId });

  it('returns null for a missing fitting', () => {
    expect(fittingContextIn(makeState(), 'missing')).toBeNull();
  });

  it('gives zero segments and no types for a fitting without segments', () => {
    const state = makeState({ fittings: { f1: fitting('f1', { x: 100, y: 100 }), f2: fitting('f2', { x: 300, y: 100 }), f3: fitting('f3', { x: 50, y: 50 }) } });
    expect(fittingContextIn(state, 'f3')).toEqual({ position: { x: 50, y: 50 }, segmentCount: 0, networkTypeIds: [] });
  });

  it('counts two segments of one type once in the type list', () => {
    const state = makeState({
      segments: {
        s1: segmentAt('s1', 'supply-air', at('f1'), at('f2')),
        s2: segmentAt('s2', 'supply-air', at('f1'), at('f3')),
      },
    });
    expect(fittingContextIn(state, 'f1')).toEqual({ position: { x: 100, y: 100 }, segmentCount: 2, networkTypeIds: ['supply-air'] });
  });

  it('lists two types in first-seen order of the segments', () => {
    const state = makeState({
      segments: {
        s1: segmentAt('s1', 'return-air', at('f1'), at('f2')),
        s2: segmentAt('s2', 'supply-air', at('f1'), at('f3')),
        s3: segmentAt('s3', 'return-air', at('f1'), at('f3')),
      },
    });
    expect(fittingContextIn(state, 'f1')).toEqual({ position: { x: 100, y: 100 }, segmentCount: 3, networkTypeIds: ['return-air', 'supply-air'] });
  });

  it('counts a segment with both ends at the fitting once', () => {
    const state = makeState({ segments: { s1: segmentAt('s1', 'supply-air', at('f1'), at('f1')) } });
    expect(fittingContextIn(state, 'f1')).toEqual({ position: { x: 100, y: 100 }, segmentCount: 1, networkTypeIds: ['supply-air'] });
  });

  it('does not count a segment that ends at another fitting', () => {
    const state = makeState({ segments: { s1: segmentAt('s1', 'supply-air', at('f2'), at('f3')) } });
    expect(fittingContextIn(state, 'f1')).toEqual({ position: { x: 100, y: 100 }, segmentCount: 0, networkTypeIds: [] });
  });
});
