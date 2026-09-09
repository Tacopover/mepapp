// Domain model for a placed Terminal/Equipment stamp. No rendering, no I/O —
// the render layer wraps this with an actual PixiJS sprite.

import { getWorldPortPosition, type PortSpec, type Transform2D, type Vec2 } from './geometry.js';
import type { StampCategory } from './stamp-library.js';
import type { CustomPropertyValues } from './custom-properties.js';

export interface PlacedStamp {
  id: string;
  /** Terminal vs. Equipment vs. Fitting — set from whichever placement tool created this instance, not looked up lazily, so ad hoc uploaded art (no definitionId) still carries it. */
  category: StampCategory;
  transform: Transform2D;
  nativeWidth: number; // unscaled width in world units, before transform.scale
  nativeHeight: number;
  ports: PortSpec[];
  /** StampDefinition['id'] (stamp-library.ts) this instance was placed from, when placed via the palette rather than an ad hoc uploaded PNG. */
  definitionId?: string;
  /** Values for the Global Properties dialog's per-installation custom fields (Terminal/Equipment only for now) — see custom-properties.ts. */
  properties?: CustomPropertyValues;
}

/** Half-extents in world units, scale applied — the shape pointInRotatedRect and rectIntersectsRotatedRect expect. */
export function getStampHalfExtents(stamp: PlacedStamp): { halfWidth: number; halfHeight: number } {
  return {
    halfWidth: (stamp.nativeWidth / 2) * stamp.transform.scale.x,
    halfHeight: (stamp.nativeHeight / 2) * stamp.transform.scale.y,
  };
}

/** Reserved port id for the synthetic center connection point below — a plain string, never confused with a real authored port id since those come from stamp-library.ts's own definitions. */
export const SYNTHETIC_CENTER_PORT_ID = '__center__';

const SYNTHETIC_CENTER_PORT: PortSpec = { id: SYNTHETIC_CENTER_PORT_ID, name: 'Center', fractionX: 0.5, fractionY: 0.5 };

/**
 * A stamp's connectable ports — its own authored ports (stamp-library.ts),
 * or, when it has none, a single synthetic point at its center. This is the
 * bridge that lets a segment connect to any stamp today, not just the
 * handful of built-ins with real ports authored yet (connectivity spec,
 * §5 Phase 5). No ConnectionPoint schema change: the synthetic port is still
 * `{ kind: 'port', elementId, portId: SYNTHETIC_CENTER_PORT_ID }`, so a
 * segment connected to it keeps working unchanged if a real port is later
 * authored at the same position. Every connection-resolution call site
 * (getStampWorldPorts below, connectivity.ts's resolveConnectionPointWorld,
 * scene.ts's stampPortConnectionPoints) goes through this instead of reading
 * `stamp.ports` directly, so the bridge can't be forgotten at a new call
 * site — UI that lists a stamp's own *authored* ports (e.g. the port-group
 * picker) still reads `stamp.ports` directly, since a synthetic port isn't a
 * real one a user can choose to group.
 */
export function getStampPorts(stamp: PlacedStamp): PortSpec[] {
  return stamp.ports.length > 0 ? stamp.ports : [SYNTHETIC_CENTER_PORT];
}

export function getStampWorldPorts(stamp: PlacedStamp): Array<PortSpec & { world: Vec2 }> {
  return getStampPorts(stamp).map((port) => ({
    ...port,
    world: getWorldPortPosition(port, stamp.transform, stamp.nativeWidth, stamp.nativeHeight),
  }));
}
