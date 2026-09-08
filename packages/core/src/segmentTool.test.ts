import { describe, expect, it } from 'vitest';
import { resolveSegmentEndpoint, splitSegmentAtFitting } from './segmentTool.js';
import type { Fitting, Segment } from './network.js';
import type { PlacedStamp } from './stamp.js';

const stamp: PlacedStamp = {
  id: 'ahu',
  category: 'equipment',
  transform: { position: { x: 100, y: 100 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
  nativeWidth: 40,
  nativeHeight: 20,
  ports: [{ id: 'p1', name: 'out', fractionX: 1, fractionY: 0.5 }],
};

const existingFitting: Fitting = { id: 'f1', pageIndex: 0, position: { x: 300, y: 100 }, kind: 'junction' };

const existingSegment: Segment = {
  id: 's1',
  pageIndex: 0,
  networkTypeId: 'supply-air',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'fitting', fittingId: 'f1' },
  endpointB: { kind: 'fitting', fittingId: 'f2' },
  geometry: [
    { x: 300, y: 100 },
    { x: 500, y: 100 },
  ],
};

describe('resolveSegmentEndpoint', () => {
  it('snaps to a stamp port before anything else', () => {
    // (120, 100) is exactly the AHU's port world position — see PlacedStamp port math.
    const target = resolveSegmentEndpoint({ x: 120, y: 100 }, [stamp], [existingFitting], [], { radius: 10 });
    expect(target).toEqual({
      kind: 'existing',
      point: { kind: 'port', elementId: 'ahu', portId: 'p1' },
      worldPosition: { x: 120, y: 100 },
    });
  });

  it('snaps to an existing fitting when no port is close enough', () => {
    const target = resolveSegmentEndpoint({ x: 302, y: 101 }, [], [existingFitting], [], { radius: 10 });
    expect(target).toEqual({
      kind: 'existing',
      point: { kind: 'fitting', fittingId: 'f1' },
      worldPosition: { x: 300, y: 100 },
    });
  });

  it('resolves a click on the interior of an existing segment as a break', () => {
    const target = resolveSegmentEndpoint({ x: 400, y: 102 }, [], [], [existingSegment], { radius: 10 });
    expect(target.kind).toBe('break');
    if (target.kind === 'break') {
      expect(target.original.id).toBe('s1');
      expect(target.breakPoint.x).toBeCloseTo(400, 9);
      expect(target.breakPoint.y).toBeCloseTo(100, 9);
    }
  });

  it('does not treat a click near a segment end as a break — that end is already covered by fitting/port snapping', () => {
    // Right on top of the segment's own endpoint at (300,100), which also happens to be existingFitting's position.
    const target = resolveSegmentEndpoint({ x: 300, y: 100 }, [], [existingFitting], [existingSegment], { radius: 10 });
    expect(target.kind).toBe('existing');
  });

  it('does not break a segment right at its own endpoint (t near 0 or 1) even with no fitting there', () => {
    const target = resolveSegmentEndpoint({ x: 301, y: 100 }, [], [], [existingSegment], { radius: 10 });
    expect(target.kind).toBe('new-fitting');
  });

  it('creates a brand new bare fitting when nothing is nearby', () => {
    const target = resolveSegmentEndpoint({ x: 900, y: 900 }, [stamp], [existingFitting], [existingSegment], { radius: 10 });
    expect(target).toEqual({ kind: 'new-fitting', worldPosition: { x: 900, y: 900 } });
  });
});

describe('splitSegmentAtFitting', () => {
  it('preserves shape/diameter/networkType on both pieces and connects them through the new fitting', () => {
    const newFitting: Fitting = { id: 'f-new', pageIndex: 0, position: { x: 400, y: 100 }, kind: 'junction' };
    const { segmentA, segmentB } = splitSegmentAtFitting(existingSegment, newFitting, { x: 400, y: 100 }, {
      segmentA: 's1-a',
      segmentB: 's1-b',
    });

    expect(segmentA.endpointA).toEqual(existingSegment.endpointA);
    expect(segmentA.endpointB).toEqual({ kind: 'fitting', fittingId: 'f-new' });
    expect(segmentA.diameter).toBe(200);
    expect(segmentA.networkTypeId).toBe('supply-air');

    expect(segmentB.endpointA).toEqual({ kind: 'fitting', fittingId: 'f-new' });
    expect(segmentB.endpointB).toEqual(existingSegment.endpointB);
  });
});
