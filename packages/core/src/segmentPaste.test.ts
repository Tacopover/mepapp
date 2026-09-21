import { describe, expect, it } from 'vitest';
import { pasteSegments } from './segmentPaste.js';
import type { Fitting, Segment } from './network.js';

const f1: Fitting = { id: 'f1', pageIndex: 0, position: { x: 100, y: 100 }, kind: 'elbow' };
const f2: Fitting = { id: 'f2', pageIndex: 0, position: { x: 300, y: 100 }, kind: 'junction' };
const f3: Fitting = { id: 'f3', pageIndex: 0, position: { x: 300, y: 300 }, kind: 'junction' };
const fittingsById = { f1, f2, f3 };

const base: Segment = {
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
const s2: Segment = { ...base, id: 's2', endpointA: { kind: 'fitting', fittingId: 'f2' }, endpointB: { kind: 'fitting', fittingId: 'f3' }, geometry: [{ x: 300, y: 100 }, { x: 300, y: 300 }] };

function counters() {
  let seg = 10;
  let fit = 20;
  return { newSegmentId: () => `segment-${seg++}`, newFittingId: () => `fitting-${fit++}` };
}

describe('pasteSegments', () => {
  it('gives every pasted segment and fitting a new id and shifts geometry by the offset', () => {
    const result = pasteSegments({ segments: [base], fittingsById, stampIdMap: new Map(), offset: { x: 20, y: 20 }, ...counters() });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].id).toBe('segment-10');
    expect(result.segments[0].geometry).toEqual([{ x: 120, y: 120 }, { x: 320, y: 120 }]);
    expect(result.segments[0].diameter).toBe(200);
    expect(result.segments[0].networkTypeId).toBe('supply-air');
    expect(result.fittings).toEqual([
      { id: 'fitting-20', pageIndex: 0, position: { x: 120, y: 120 }, kind: 'elbow' },
      { id: 'fitting-21', pageIndex: 0, position: { x: 320, y: 120 }, kind: 'junction' },
    ]);
    expect(result.segments[0].endpointA).toEqual({ kind: 'fitting', fittingId: 'fitting-20' });
    expect(result.segments[0].endpointB).toEqual({ kind: 'fitting', fittingId: 'fitting-21' });
  });

  it('copies a fitting shared by two copied segments once, so the pasted run stays connected', () => {
    const result = pasteSegments({ segments: [base, s2], fittingsById, stampIdMap: new Map(), offset: { x: 20, y: 20 }, ...counters() });
    expect(result.fittings).toHaveLength(3);
    expect(result.segments[0].endpointB).toEqual(result.segments[1].endpointA);
  });

  it('never pastes a fitting that no copied segment touches', () => {
    const result = pasteSegments({ segments: [base], fittingsById, stampIdMap: new Map(), offset: { x: 0, y: 0 }, ...counters() });
    expect(result.fittings.map((f) => f.position)).not.toContainEqual(f3.position);
  });

  it('moves a port endpoint onto the pasted copy of its stamp', () => {
    const toPort: Segment = { ...base, endpointA: { kind: 'port', elementId: 'ahu', portId: 'p1' } };
    const result = pasteSegments({ segments: [toPort], fittingsById, stampIdMap: new Map([['ahu', 'stamp-9']]), offset: { x: 20, y: 20 }, ...counters() });
    expect(result.segments[0].endpointA).toEqual({ kind: 'port', elementId: 'stamp-9', portId: 'p1' });
    expect(result.fittings).toHaveLength(1);
  });

  it('replaces a port on a stamp that was not copied with a new fitting at the shifted endpoint', () => {
    const toPort: Segment = { ...base, endpointA: { kind: 'port', elementId: 'ahu', portId: 'p1' } };
    const result = pasteSegments({ segments: [toPort], fittingsById, stampIdMap: new Map(), offset: { x: 20, y: 20 }, ...counters() });
    const endpoint = result.segments[0].endpointA;
    expect(endpoint.kind).toBe('fitting');
    const detached = result.fittings.find((f) => endpoint.kind === 'fitting' && f.id === endpoint.fittingId);
    expect(detached).toEqual({ id: expect.any(String), pageIndex: 0, position: { x: 120, y: 120 }, kind: 'junction' });
  });

  it('does not change the copied inputs', () => {
    const before = JSON.stringify([base, fittingsById]);
    pasteSegments({ segments: [base], fittingsById, stampIdMap: new Map(), offset: { x: 20, y: 20 }, ...counters() });
    expect(JSON.stringify([base, fittingsById])).toBe(before);
  });
});
