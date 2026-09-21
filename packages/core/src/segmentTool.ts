// Pure resolution logic for the segment-drawing tool: given a click point,
// decide what it snapped to. No rendering, no ids are allocated here — the
// render layer (which owns id generation and PixiJS objects) turns the
// returned target into actual Fitting/Segment records and undoable commands.
//
// Snap priority matches the old app's own layering of connectivity concepts
// (a stamp's own named ports first, then bare junction nodes, then a segment
// interior — network.ts's ConnectionPoint doc comment): a click resolves to
// an existing port, then an existing fitting, then a point on an existing
// segment's interior (which means breaking it — the "auto-generated
// junction" Step 7 asks for, matching the old app's SegmentBreaker), and
// only creates a brand new bare fitting if nothing nearby was hit.

import { closestPointOnSegment, distance, pointInRotatedRect, type Vec2 } from './geometry.js';
import { getStampHalfExtents, getStampWorldPorts, type PlacedStamp } from './stamp.js';
import type { ConnectionPoint, Fitting, Segment } from './network.js';

export type SegmentEndpointTarget =
  | { kind: 'existing'; point: ConnectionPoint; worldPosition: Vec2 }
  | { kind: 'break'; original: Segment; breakPoint: Vec2 }
  | { kind: 'new-fitting'; worldPosition: Vec2 };

/** How close (in world units) a click must land to snap, and how far from a segment's own ends (as a 0..1 fraction) it must be to count as an interior break rather than an end-snap. */
export interface SnapOptions {
  radius: number;
  minInteriorFraction?: number;
}

export function resolveSegmentEndpoint(
  worldPoint: Vec2,
  stamps: PlacedStamp[],
  fittings: Fitting[],
  segments: Segment[],
  options: SnapOptions,
): SegmentEndpointTarget {
  const minT = options.minInteriorFraction ?? 0.02;

  // A click anywhere on a ported stamp's own body force-snaps to its
  // nearest port, regardless of the normal snap radius — matches the old
  // app's HighLighter.TrySnapToPort (§2.2): a user aiming at a Terminal or
  // Equipment's icon expects to connect to it, not to have to hit a small
  // port marker precisely. Restricted to stamps with real authored ports
  // (not the Phase 5 synthetic-center bridge) — a port-less stamp's whole
  // body force-snapping to its center would be a much bigger snap target
  // than the spec asked for.
  for (const stamp of stamps) {
    if (stamp.ports.length === 0) continue;
    const { halfWidth, halfHeight } = getStampHalfExtents(stamp);
    if (!pointInRotatedRect(worldPoint, stamp.transform, halfWidth, halfHeight)) continue;
    const ports = getStampWorldPorts(stamp);
    const nearest = ports.reduce((best, port) => (distance(worldPoint, port.world) < distance(worldPoint, best.world) ? port : best));
    return { kind: 'existing', point: { kind: 'port', elementId: stamp.id, portId: nearest.id }, worldPosition: nearest.world };
  }

  for (const stamp of stamps) {
    for (const port of getStampWorldPorts(stamp)) {
      if (distance(worldPoint, port.world) <= options.radius) {
        return { kind: 'existing', point: { kind: 'port', elementId: stamp.id, portId: port.id }, worldPosition: port.world };
      }
    }
  }

  for (const fitting of fittings) {
    if (distance(worldPoint, fitting.position) <= options.radius) {
      return { kind: 'existing', point: { kind: 'fitting', fittingId: fitting.id }, worldPosition: fitting.position };
    }
  }

  for (const segment of segments) {
    if (segment.geometry.length < 2) continue;
    const a = segment.geometry[0];
    const b = segment.geometry[segment.geometry.length - 1];
    const { point, t } = closestPointOnSegment(worldPoint, a, b);
    if (distance(worldPoint, point) <= options.radius && t > minT && t < 1 - minT) {
      return { kind: 'break', original: segment, breakPoint: point };
    }
  }

  return { kind: 'new-fitting', worldPosition: worldPoint };
}

/** Splits `original` around a newly-created fitting at `breakPoint`, preserving its engineering properties on both pieces — same rule the old app's SegmentBreaker follows for Shape/Diameter/etc. */
export function splitSegmentAtFitting(
  original: Segment,
  newFitting: Fitting,
  breakPoint: Vec2,
  newIds: { segmentA: string; segmentB: string },
): { segmentA: Segment; segmentB: Segment } {
  const start = original.geometry[0];
  const end = original.geometry[original.geometry.length - 1];
  return {
    segmentA: {
      ...original,
      id: newIds.segmentA,
      endpointB: { kind: 'fitting', fittingId: newFitting.id },
      geometry: [start, breakPoint],
    },
    segmentB: {
      ...original,
      id: newIds.segmentB,
      endpointA: { kind: 'fitting', fittingId: newFitting.id },
      geometry: [breakPoint, end],
    },
  };
}

function isFittingEnd(point: ConnectionPoint, fittingId: string): boolean {
  return point.kind === 'fitting' && point.fittingId === fittingId;
}

function sameConnectionPoint(a: ConnectionPoint, b: ConnectionPoint): boolean {
  if (a.kind === 'fitting') return b.kind === 'fitting' && a.fittingId === b.fittingId;
  return b.kind === 'port' && a.elementId === b.elementId && a.portId === b.portId;
}

/** Every segment with an endpoint on `fittingId`. */
export function segmentsAtFitting(fittingId: string, segments: Segment[]): Segment[] {
  return segments.filter((s) => isFittingEnd(s.endpointA, fittingId) || isFittingEnd(s.endpointB, fittingId));
}

/**
 * The reverse of splitSegmentAtFitting: joins the two segments meeting at `fittingId` into one
 * running between their far ends, keeping the first piece's engineering properties. Returns
 * null when the fitting is not a plain pass-through — anything other than exactly two segments
 * (a one-segment fitting would strand an open end; three or more is a real junction), a segment
 * looping back onto the fitting, or both far ends being the same point (a zero-length merge).
 * The piece that ends at the fitting comes first, so a split followed by a merge restores the
 * original segment's direction.
 */
export function mergeSegmentsAtFitting(
  fittingId: string,
  segments: Segment[],
  newId: string,
): { merged: Segment; removed: [Segment, Segment] } | null {
  const attached = segmentsAtFitting(fittingId, segments);
  if (attached.length !== 2) return null;
  if (attached.some((s) => isFittingEnd(s.endpointA, fittingId) && isFittingEnd(s.endpointB, fittingId))) return null;

  const [first, second] = isFittingEnd(attached[1].endpointB, fittingId) && !isFittingEnd(attached[0].endpointB, fittingId)
    ? [attached[1], attached[0]]
    : [attached[0], attached[1]];

  const farOfFirst = isFittingEnd(first.endpointB, fittingId)
    ? { point: first.endpointA, position: first.geometry[0] }
    : { point: first.endpointB, position: first.geometry[first.geometry.length - 1] };
  const farOfSecond = isFittingEnd(second.endpointA, fittingId)
    ? { point: second.endpointB, position: second.geometry[second.geometry.length - 1] }
    : { point: second.endpointA, position: second.geometry[0] };
  if (sameConnectionPoint(farOfFirst.point, farOfSecond.point)) return null;

  return {
    merged: {
      ...first,
      id: newId,
      endpointA: farOfFirst.point,
      endpointB: farOfSecond.point,
      geometry: [farOfFirst.position, farOfSecond.position],
    },
    removed: [first, second],
  };
}
