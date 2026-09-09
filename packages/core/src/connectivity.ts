// Shared connectivity-recompute routine for every mutation that can move a
// fitting or a ported element: derives every affected segment's endpoint
// geometry fresh from live fitting/stamp state, rather than caching it. This
// closes off the old app's flagged risk (ConnectedSegmentUpdater.cs — every
// mutation call site had to remember to call the shared re-seat routine, with
// no structural guard against a forgotten call) by making segment geometry a
// pure function of the current topology instead of a cache that can drift —
// see the connectivity spec, §2.1/§5 Phase 1.

import { getWorldPortPosition, type Vec2 } from './geometry.js';
import { nodeKeyOf, type ConnectionPoint, type Fitting, type PortGroup, type Segment } from './network.js';
import { type PlacedStamp } from './stamp.js';

export interface ConnectivityGraphState {
  segments: Record<string, Segment>;
  fittings: Record<string, Fitting>;
  stamps: Record<string, PlacedStamp>;
  portGroups: PortGroup[];
}

/** Resolves a connection point's current world position, or null if it names a fitting/stamp/port that no longer exists. */
export function resolveConnectionPointWorld(
  point: ConnectionPoint,
  state: Pick<ConnectivityGraphState, 'fittings' | 'stamps'>,
): Vec2 | null {
  if (point.kind === 'fitting') {
    return state.fittings[point.fittingId]?.position ?? null;
  }
  const stamp = state.stamps[point.elementId];
  const port = stamp?.ports.find((p) => p.id === point.portId);
  if (!stamp || !port) return null;
  return getWorldPortPosition(port, stamp.transform, stamp.nativeWidth, stamp.nativeHeight);
}

/**
 * Recomputes the geometry of every segment attached to any of `changed`'s
 * connection points (matched by connectivity-graph node, so a port-group
 * member counts as the same node as its group-mates — see network.ts's
 * nodeKeyOf). Always re-derives both endpoints of an affected segment fresh,
 * never just the one that moved, so this is idempotent and safe to call
 * repeatedly with a stale changed list. Returns only the segments that
 * actually changed, keyed by id, for the caller to merge into state — a
 * segment whose resolved endpoint can't be found (dangling reference) is left
 * out rather than guessed at.
 */
export function recomputeAttachedSegments(state: ConnectivityGraphState, changed: ConnectionPoint[]): Record<string, Segment> {
  const changedKeys = new Set(changed.map((point) => nodeKeyOf(point, state.portGroups)));
  const updates: Record<string, Segment> = {};

  for (const segment of Object.values(state.segments)) {
    const keyA = nodeKeyOf(segment.endpointA, state.portGroups);
    const keyB = nodeKeyOf(segment.endpointB, state.portGroups);
    if (!changedKeys.has(keyA) && !changedKeys.has(keyB)) continue;

    const worldA = resolveConnectionPointWorld(segment.endpointA, state);
    const worldB = resolveConnectionPointWorld(segment.endpointB, state);
    if (!worldA || !worldB) continue;

    const interior = segment.geometry.slice(1, -1);
    updates[segment.id] = { ...segment, geometry: [worldA, ...interior, worldB] };
  }

  return updates;
}
