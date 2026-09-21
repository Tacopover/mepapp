// Pure id/reference remapping for pasting copied segments — no rendering, no id
// allocation beyond the counters the caller passes in. The render layer copies
// stamps, annotations and segments together, then calls this to turn the copied
// segments into a self-contained pasted run.

import type { Vec2 } from './geometry.js';
import type { ConnectionPoint, Fitting, Segment } from './network.js';

export interface SegmentPasteInput {
  /** The copied segments. */
  segments: Segment[];
  /** Every fitting a copied segment can end on, by id — a fitting no copied segment touches is never pasted. */
  fittingsById: Record<string, Fitting>;
  /** Copied stamp id → its pasted copy's id. A segment port on any other stamp is not carried over. */
  stampIdMap: Map<string, string>;
  offset: Vec2;
  newSegmentId: () => string;
  newFittingId: () => string;
}

/**
 * Builds the pasted copies of `segments`, each shifted by `offset`. A fitting shared by
 * several copied segments is copied once, so the pasted run keeps the original's topology.
 * A segment end on a copied stamp's port follows that stamp to its pasted copy. A segment end
 * on a stamp that was not copied gets a new junction fitting at the same spot instead:
 * reusing the original port would join the pasted run into the original network.
 */
export function pasteSegments(input: SegmentPasteInput): { segments: Segment[]; fittings: Fitting[] } {
  const { offset } = input;
  const shift = (p: Vec2): Vec2 => ({ x: p.x + offset.x, y: p.y + offset.y });
  const pastedFittings = new Map<string, Fitting>();
  const extraFittings: Fitting[] = [];

  const remapEndpoint = (point: ConnectionPoint, endpointWorld: Vec2, pageIndex: number): ConnectionPoint => {
    if (point.kind === 'fitting') {
      let pasted = pastedFittings.get(point.fittingId);
      if (!pasted) {
        const original = input.fittingsById[point.fittingId];
        pasted = { id: input.newFittingId(), pageIndex, position: shift(original?.position ?? endpointWorld), kind: original?.kind ?? 'junction' };
        pastedFittings.set(point.fittingId, pasted);
      }
      return { kind: 'fitting', fittingId: pasted.id };
    }
    const pastedStampId = input.stampIdMap.get(point.elementId);
    if (pastedStampId) return { kind: 'port', elementId: pastedStampId, portId: point.portId };
    const detached: Fitting = { id: input.newFittingId(), pageIndex, position: shift(endpointWorld), kind: 'junction' };
    extraFittings.push(detached);
    return { kind: 'fitting', fittingId: detached.id };
  };

  const segments = input.segments.map((segment): Segment => {
    const first = segment.geometry[0];
    const last = segment.geometry[segment.geometry.length - 1];
    return {
      ...segment,
      id: input.newSegmentId(),
      endpointA: remapEndpoint(segment.endpointA, first, segment.pageIndex),
      endpointB: remapEndpoint(segment.endpointB, last, segment.pageIndex),
      geometry: segment.geometry.map(shift),
    };
  });

  return { segments, fittings: [...pastedFittings.values(), ...extraFittings] };
}
