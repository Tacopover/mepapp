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
  /** Per-instance tint, hex (e.g. '#2196f3'). Absent means no tint — render at the stamp art's own native colors. */
  color?: string;
  /** 0-based page of the sheet this stamp sits on. */
  pageIndex: number;
  /**
   * Set when auto-placement made this stamp (room-auto-placement.md §4.5): the rule and the room it was placed for.
   * `moved` = the user moved, rotated or edited it, so a re-run keeps it. `roomKey` = roomPlacementKey of the room
   * at placement, to tell when the room changed after the placement.
   */
  autoPlaced?: { ruleId: string; roomId: string; moved: boolean; roomKey?: string };
  /**
   * The network type that routing must connect to each port, by port id (auto-routing.md §4.1). Not the network
   * type of the port: a connected segment defines that. A stamp without ports of its own uses
   * SYNTHETIC_CENTER_PORT_ID. A port without an entry has no routing target. Absent = no port has one.
   */
  routingTargets?: Record<string, string>;
}

/** The routing target of one port of the stamp (a network type id), or undefined. */
export function routingTargetOf(stamp: Pick<PlacedStamp, 'routingTargets'>, portId: string): string | undefined {
  const targets = stamp.routingTargets;
  return targets && Object.prototype.hasOwnProperty.call(targets, portId) ? targets[portId] : undefined;
}

/** The routing targets with the target of one port set, or removed for `null`. Undefined when no port has one. */
export function withRoutingTarget(targets: Readonly<Record<string, string>> | undefined, portId: string, networkTypeId: string | null): Record<string, string> | undefined {
  const next: Record<string, string> = {};
  for (const [id, target] of Object.entries(targets ?? {})) if (id !== portId) next[id] = target;
  if (networkTypeId !== null && portId !== '__proto__') next[portId] = networkTypeId;
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The routing targets after a change of the ports of the stamp: an entry moves to `remap.get(portId)` when
 * `remap` has the port, and goes when its (new) port id is not in `keep`. Undefined when no entry stays.
 */
export function remapRoutingTargets(
  targets: Readonly<Record<string, string>> | undefined,
  keep: ReadonlySet<string>,
  remap?: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  const next: Record<string, string> = {};
  for (const [portId, target] of Object.entries(targets ?? {})) {
    const id = remap?.get(portId) ?? portId;
    if (keep.has(id)) next[id] = target;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The routing targets of a saved stamp: entries whose value is not a non-empty string go. Undefined when none stays. */
export function parseRoutingTargets(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const next: Record<string, string> = {};
  for (const [portId, target] of Object.entries(raw)) if (portId !== '__proto__' && typeof target === 'string' && target) next[portId] = target;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The stamp with `autoPlaced.moved` set, for a user edit of an auto-placed stamp. The same object when there is nothing to change. */
export function markAutoPlacedMoved(stamp: PlacedStamp): PlacedStamp {
  return stamp.autoPlaced && !stamp.autoPlaced.moved ? { ...stamp, autoPlaced: { ...stamp.autoPlaced, moved: true } } : stamp;
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
export function getStampPorts(stamp: Pick<PlacedStamp, 'ports' | 'transform' | 'nativeWidth' | 'nativeHeight'>): PortSpec[] {
  return stamp.ports.length > 0 ? stamp.ports : [SYNTHETIC_CENTER_PORT];
}

export function getStampWorldPorts(stamp: Pick<PlacedStamp, 'ports' | 'transform' | 'nativeWidth' | 'nativeHeight'>): Array<PortSpec & { world: Vec2 }> {
  return getStampPorts(stamp).map((port) => ({
    ...port,
    world: getWorldPortPosition(port, stamp.transform, stamp.nativeWidth, stamp.nativeHeight),
  }));
}

/**
 * Pairs each old port with one new port by location (fractionX/fractionY, so a size
 * difference between the two stamps does not matter): repeatedly takes the closest
 * unpaired old/new pair. Returns old port id -> new port id, or null when the two
 * lists differ in length.
 */
export function matchPortsByLocation(oldPorts: PortSpec[], newPorts: PortSpec[]): Map<string, string> | null {
  if (oldPorts.length !== newPorts.length) return null;
  const pairs: Array<{ oldId: string; newId: string; distance: number }> = [];
  for (const o of oldPorts) {
    for (const n of newPorts) {
      pairs.push({ oldId: o.id, newId: n.id, distance: Math.hypot(o.fractionX - n.fractionX, o.fractionY - n.fractionY) });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const result = new Map<string, string>();
  const usedNew = new Set<string>();
  for (const pair of pairs) {
    if (result.has(pair.oldId) || usedNew.has(pair.newId)) continue;
    result.set(pair.oldId, pair.newId);
    usedNew.add(pair.newId);
  }
  return result;
}
