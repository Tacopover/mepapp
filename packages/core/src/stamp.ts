// Domain model for a placed Terminal/Equipment stamp. No rendering, no I/O —
// the render layer wraps this with an actual PixiJS sprite.

import { getWorldPortPosition, type PortSpec, type Transform2D, type Vec2 } from './geometry.js';

export interface PlacedStamp {
  id: string;
  transform: Transform2D;
  nativeWidth: number; // unscaled width in world units, before transform.scale
  nativeHeight: number;
  ports: PortSpec[];
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
