// The open ports of the drawing for the route dialog (auto-routing.md §5). No rendering, no I/O.

import type { Vec2 } from './geometry.js';
import { getStampWorldPorts, routingTargetOf, type PlacedStamp } from './stamp.js';

/** A stamp as the finder reads it. `StampInfo` of the scene fits this shape. */
export type RouteStamp = Pick<PlacedStamp, 'id' | 'category' | 'transform' | 'nativeWidth' | 'nativeHeight' | 'ports' | 'routingTargets'> & {
  /** The network type of the segment on each connected port, by port id. A port with no entry has no segment. */
  portSegmentTypes?: Readonly<Record<string, string>>;
};

/** A port with a routing target and no segment. */
export interface OpenPort {
  stampId: string;
  portId: string;
  networkTypeId: string;
  world: Vec2;
}

/** All open ports of the stamps, any network type. Order: the order of `stamps`, then the order of the ports. */
export function openPortsOf(stamps: readonly RouteStamp[]): OpenPort[] {
  const open: OpenPort[] = [];
  for (const stamp of stamps) {
    if (!stamp.routingTargets) continue;
    for (const port of getStampWorldPorts(stamp)) {
      const networkTypeId = routingTargetOf(stamp, port.id);
      if (networkTypeId && stamp.portSegmentTypes?.[port.id] === undefined) open.push({ stampId: stamp.id, portId: port.id, networkTypeId, world: port.world });
    }
  }
  return open;
}
