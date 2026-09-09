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

export function getStampWorldPorts(stamp: PlacedStamp): Array<PortSpec & { world: Vec2 }> {
  return stamp.ports.map((port) => ({
    ...port,
    world: getWorldPortPosition(port, stamp.transform, stamp.nativeWidth, stamp.nativeHeight),
  }));
}
