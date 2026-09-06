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

import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import { getStampWorldPorts, type PlacedStamp } from './stamp.js';
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
