// The open ports of the drawing for the route dialog (auto-routing.md §5). No rendering, no I/O.

import type { Vec2 } from './geometry.js';
import { getStampWorldPorts, routingTargetOf, type PlacedStamp } from './stamp.js';
import { roomsAtPoint, type Room } from './rooms/room.js';

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

export type RouteScope =
  | { kind: 'rooms'; roomIds: ReadonlySet<string> }
  | { kind: 'stamps'; stampIds: ReadonlySet<string> };

export interface RoutePortsInput {
  stamps: readonly RouteStamp[];
  networkTypeId: string;
  scope: RouteScope;
  /** The start stamp. Its own ports are never target ports. */
  startStampId?: string;
  /** The start port. It only decides which port of a multi-port stamp is the nearest (P-R2-01). */
  startPortId?: string;
  /** All rooms of the page. Needed for scope `rooms`. When given for scope `stamps`, the finder sets `roomId` of each port. */
  rooms?: readonly Room[];
  /** The page of `rooms`. Default 0 (D-R2-03 A: one page only). */
  pageIndex?: number;
  /** Scope `rooms`: a port in no room is a target port. Default true (P-R2-05). */
  includeOutsideRooms?: boolean;
  /** 'one': one target port for each multi-port stamp (P-R2-01). 'all': every port. Default 'one'. */
  portsPerStamp?: 'one' | 'all';
  /** The port kept of a multi-port stamp with portsPerStamp 'one'. 'nearest': the port nearest to the start port. 'order': the first open port in port order. Default 'nearest'. */
  portChoice?: 'nearest' | 'order';
}

export interface RoutePort extends OpenPort {
  /** The smallest room that holds the port (`roomsAtPoint`), or null when no room holds it or no `rooms` were given. */
  roomId: string | null;
}

export interface RoutePortsResult {
  /** The target ports, in the order of `openPortsOf`. */
  ports: RoutePort[];
  /**
   * Scope `rooms`: one entry for each room of `input.rooms` (also an unchecked room, also a room with 0 ports).
   * `count` is the number of ports that survive rules 1 to 7 and lie in that room. `checked` is true when the room is in `roomIds`.
   * Scope `stamps`: an empty list.
   */
  perRoom: { roomId: string; count: number; checked: boolean }[];
  /** Scope `rooms`: the ports that survive rules 1 to 7 and lie in no room. They are target ports only when `includeOutsideRooms` is true. */
  outsideRooms: number;
  /** Ports that survive rules 1 to 7 and that the scope leaves out (an unchecked room, a stamp not selected). Ports outside rooms are in `outsideRooms`, not here. */
  leftOut: number;
  /** Open ports of the type on the start stamp. They are not target ports (rule 4). */
  startStampPorts: number;
  /** Scope `rooms`: open ports of the type on equipment stamps in the scope. They are not target ports (rule 6). */
  equipmentPorts: number;
  /** The number of multi-port stamps, whatever `portsPerStamp` is. */
  multiPortStamps: number;
  /** Ports that rule 7 dropped. It is 0 when `portsPerStamp` is 'all'. */
  droppedExtraPorts: number;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestPort(group: readonly RoutePort[], from: Vec2 | undefined): RoutePort {
  if (!from) return group[0]!;
  let best = group[0]!;
  for (const port of group) if (distance(port.world, from) < distance(best.world, from)) best = port;
  return best;
}

/**
 * The target ports of one network type for a route. Rule 7 keeps one port of a multi-port stamp: by default the port nearest to the start port,
 * with `portChoice` 'order' the first open port in port order. The finder does not know the pipe side (flow or return) of a port.
 */
export function findRoutePorts(input: RoutePortsInput): RoutePortsResult {
  const rooms = input.rooms ?? [];
  const pageIndex = input.pageIndex ?? 0;
  const includeOutsideRooms = input.includeOutsideRooms ?? true;
  const perStamp = input.portsPerStamp ?? 'one';
  const scope = input.scope;
  const stampById = new Map(input.stamps.map((stamp) => [stamp.id, stamp]));
  const startStamp = input.startStampId === undefined ? undefined : stampById.get(input.startStampId);
  const start = startStamp && input.startPortId !== undefined ? getStampWorldPorts(startStamp).find((port) => port.id === input.startPortId)?.world : undefined;

  const open = openPortsOf(input.stamps)
    .filter((port) => port.networkTypeId === input.networkTypeId)
    .map((port): RoutePort => ({ ...port, roomId: roomsAtPoint(rooms, port.world, pageIndex)[0]?.id ?? null }));
  const candidates = open.filter((port) => port.stampId !== input.startStampId);
  const startStampPorts = open.length - candidates.length;

  let equipmentPorts = 0;
  const unequipped: RoutePort[] = [];
  for (const port of candidates) {
    if (scope.kind === 'rooms' && stampById.get(port.stampId)?.category === 'equipment') {
      const inScope = port.roomId === null ? includeOutsideRooms : scope.roomIds.has(port.roomId);
      if (inScope) equipmentPorts++;
    } else {
      unequipped.push(port);
    }
  }

  const byStamp = new Map<string, RoutePort[]>();
  for (const port of unequipped) byStamp.set(port.stampId, [...(byStamp.get(port.stampId) ?? []), port]);
  const kept = new Set<RoutePort>();
  let multiPortStamps = 0;
  let droppedExtraPorts = 0;
  for (const group of byStamp.values()) {
    if (group.length >= 2) multiPortStamps++;
    const nearest = group.length >= 2 && perStamp === 'one' ? (input.portChoice === 'order' ? group[0] : nearestPort(group, start)) : undefined;
    for (const port of group) {
      if (nearest && port !== nearest) droppedExtraPorts++;
      else kept.add(port);
    }
  }
  const survivors = unequipped.filter((port) => kept.has(port));

  const perRoom: RoutePortsResult['perRoom'] = scope.kind === 'rooms' ? rooms.map((room) => ({ roomId: room.id, count: 0, checked: scope.roomIds.has(room.id) })) : [];
  const entryOf = new Map(perRoom.map((entry) => [entry.roomId, entry] as const));
  const ports: RoutePort[] = [];
  let outsideRooms = 0;
  let leftOut = 0;
  for (const port of survivors) {
    if (scope.kind === 'stamps') {
      if (scope.stampIds.has(port.stampId)) ports.push(port);
      else leftOut++;
      continue;
    }
    if (port.roomId === null) {
      outsideRooms++;
      if (includeOutsideRooms) ports.push(port);
      continue;
    }
    const entry = entryOf.get(port.roomId);
    if (entry) entry.count++;
    if (scope.roomIds.has(port.roomId)) ports.push(port);
    else leftOut++;
  }

  return { ports, perRoom, outsideRooms, leftOut, startStampPorts, equipmentPorts, multiPortStamps, droppedExtraPorts };
}
