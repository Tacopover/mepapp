import { describe, expect, it } from 'vitest';
import { recomputeAttachedSegments, resolveConnectionPointWorld, type ConnectivityGraphState } from './connectivity.js';
import type { Fitting, Segment } from './network.js';
import { SYNTHETIC_CENTER_PORT_ID, type PlacedStamp } from './stamp.js';

const stamp: PlacedStamp = {
  id: 'ahu',
  category: 'equipment',
  transform: { position: { x: 100, y: 100 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
  nativeWidth: 40,
  nativeHeight: 20,
  ports: [{ id: 'p1', name: 'out', fractionX: 1, fractionY: 0.5 }],
};

const fitting: Fitting = { id: 'f1', pageIndex: 0, position: { x: 300, y: 100 }, kind: 'junction' };

const segmentToFitting: Segment = {
  id: 's1',
  pageIndex: 0,
  networkTypeId: 'supply-air',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'port', elementId: 'ahu', portId: 'p1' },
  endpointB: { kind: 'fitting', fittingId: 'f1' },
  geometry: [
    { x: 120, y: 100 },
    { x: 300, y: 100 },
  ],
};

const unrelatedSegment: Segment = {
  id: 's2',
  pageIndex: 0,
  networkTypeId: 'supply-air',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'fitting', fittingId: 'f2' },
  endpointB: { kind: 'fitting', fittingId: 'f3' },
  geometry: [
    { x: 900, y: 900 },
    { x: 950, y: 900 },
  ],
};

function baseState(overrides: Partial<ConnectivityGraphState> = {}): ConnectivityGraphState {
  return {
    segments: { [segmentToFitting.id]: segmentToFitting, [unrelatedSegment.id]: unrelatedSegment },
    fittings: { [fitting.id]: fitting, f2: { id: 'f2', pageIndex: 0, position: { x: 900, y: 900 }, kind: 'junction' }, f3: { id: 'f3', pageIndex: 0, position: { x: 950, y: 900 }, kind: 'junction' } },
    stamps: { [stamp.id]: stamp },
    portGroups: [],
    ...overrides,
  };
}

describe('resolveConnectionPointWorld', () => {
  it('resolves a fitting connection point to its stored position', () => {
    expect(resolveConnectionPointWorld({ kind: 'fitting', fittingId: 'f1' }, baseState())).toEqual({ x: 300, y: 100 });
  });

  it('resolves a port connection point via the stamp live transform', () => {
    expect(resolveConnectionPointWorld({ kind: 'port', elementId: 'ahu', portId: 'p1' }, baseState())).toEqual({ x: 120, y: 100 });
  });

  it('returns null for a dangling fitting reference', () => {
    expect(resolveConnectionPointWorld({ kind: 'fitting', fittingId: 'missing' }, baseState())).toBeNull();
  });

  it('returns null for a dangling port reference', () => {
    expect(resolveConnectionPointWorld({ kind: 'port', elementId: 'ahu', portId: 'missing' }, baseState())).toBeNull();
  });

  it('resolves the synthetic center port on a port-less stamp (Phase 5 bridge)', () => {
    const portless: PlacedStamp = { ...stamp, id: 'grille', ports: [] };
    const state = baseState({ stamps: { ...baseState().stamps, [portless.id]: portless } });
    expect(resolveConnectionPointWorld({ kind: 'port', elementId: 'grille', portId: SYNTHETIC_CENTER_PORT_ID }, state)).toEqual(portless.transform.position);
  });
});

describe('recomputeAttachedSegments', () => {
  it('rewrites the endpoint nearest a moved fitting, leaving the far endpoint alone', () => {
    const moved = { ...fitting, position: { x: 400, y: 250 } };
    const state = baseState({ fittings: { ...baseState().fittings, [fitting.id]: moved } });

    const updates = recomputeAttachedSegments(state, [{ kind: 'fitting', fittingId: 'f1' }]);

    expect(Object.keys(updates)).toEqual(['s1']);
    expect(updates.s1.geometry).toEqual([
      { x: 120, y: 100 }, // endpointA (port) unchanged
      { x: 400, y: 250 }, // endpointB (fitting) follows the move
    ]);
  });

  it('leaves segments with no endpoint at the changed node untouched', () => {
    const updates = recomputeAttachedSegments(baseState(), [{ kind: 'fitting', fittingId: 'f1' }]);
    expect(updates.s2).toBeUndefined();
  });

  it('preserves interior polyline points when re-deriving endpoints', () => {
    const withInterior: Segment = { ...segmentToFitting, geometry: [{ x: 120, y: 100 }, { x: 200, y: 150 }, { x: 300, y: 100 }] };
    const moved = { ...fitting, position: { x: 500, y: 500 } };
    const state = baseState({ segments: { [withInterior.id]: withInterior }, fittings: { [fitting.id]: moved } });

    const updates = recomputeAttachedSegments(state, [{ kind: 'fitting', fittingId: 'f1' }]);

    expect(updates.s1.geometry).toEqual([{ x: 120, y: 100 }, { x: 200, y: 150 }, { x: 500, y: 500 }]);
  });

  it('is idempotent — calling it twice with the same changed list produces the same result', () => {
    const moved = { ...fitting, position: { x: 400, y: 250 } };
    const state = baseState({ fittings: { ...baseState().fittings, [fitting.id]: moved } });
    const first = recomputeAttachedSegments(state, [{ kind: 'fitting', fittingId: 'f1' }]);
    const second = recomputeAttachedSegments({ ...state, segments: { ...state.segments, ...first } }, [{ kind: 'fitting', fittingId: 'f1' }]);
    expect(second.s1.geometry).toEqual(first.s1.geometry);
  });

  it('omits a segment whose endpoint now dangles instead of guessing', () => {
    const state = baseState({ stamps: {} }); // ahu's port no longer resolvable
    const updates = recomputeAttachedSegments(state, [{ kind: 'fitting', fittingId: 'f1' }]);
    expect(updates.s1).toBeUndefined();
  });

  it('rewrites the endpoint nearest a moved stamp, driven by its port (Phase 3 cascade)', () => {
    const moved = { ...stamp, transform: { ...stamp.transform, position: { x: 400, y: 250 } } };
    const state = baseState({ stamps: { [moved.id]: moved } });

    const updates = recomputeAttachedSegments(state, [{ kind: 'port', elementId: 'ahu', portId: 'p1' }]);

    expect(Object.keys(updates)).toEqual(['s1']);
    // p1 is at fractionX=1, so its world position is the new center plus the unscaled half-width offset (20).
    expect(updates.s1.geometry).toEqual([
      { x: 420, y: 250 },
      { x: 300, y: 100 }, // endpointB (fitting) unchanged
    ]);
  });

  it('cascades through a port-less stamp\'s synthetic center port (Phase 5 bridge)', () => {
    const portless: PlacedStamp = { ...stamp, id: 'grille', ports: [] };
    const segmentToPortless: Segment = { ...segmentToFitting, id: 's3', endpointA: { kind: 'port', elementId: 'grille', portId: SYNTHETIC_CENTER_PORT_ID } };
    const moved = { ...portless, transform: { ...portless.transform, position: { x: 700, y: 700 } } };
    const state = baseState({ segments: { [segmentToPortless.id]: segmentToPortless }, stamps: { [moved.id]: moved } });

    const updates = recomputeAttachedSegments(state, [{ kind: 'port', elementId: 'grille', portId: SYNTHETIC_CENTER_PORT_ID }]);

    expect(updates.s3.geometry).toEqual([{ x: 700, y: 700 }, { x: 300, y: 100 }]);
  });
});
