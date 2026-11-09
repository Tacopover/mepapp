import { describe, expect, it } from 'vitest';
import { CommandManager, Transaction, type Fitting, type Segment, type Vec2 } from '@mepapp/core';
import type { DrawingState } from './document.js';
import { moveFittingInState, riserConflictsIn, type RiserMark } from './riserMarks.js';

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
