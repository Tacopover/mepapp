import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';

export const DEFAULT_ROUTE_AREA_TYPE_IDS: readonly string[] = ['corridor', 'shaft'];
export const SHAFT_ROOM_TYPE_ID = 'shaft';
export const DEFAULT_MAX_WALL_MM = 600;
export const DEFAULT_MIN_WALL_RUN_MM = 500;
export const DEFAULT_SKELETON_PIXEL_MM = 100;

export interface RouteAreaOptions {
  /** Room type ids that form the route area. An empty list gives an empty area. */
  roomTypeIds: readonly string[];
  /** Millimetres per page point: 1 / calibration.pageUnitsPerRealUnit. Null when the page has no calibration. */
  mmPerPt: number | null;
  pageIndex: number;
  maxWallMm?: number;       // default DEFAULT_MAX_WALL_MM
  minWallRunMm?: number;    // default DEFAULT_MIN_WALL_RUN_MM
  pixelMm?: number;         // default DEFAULT_SKELETON_PIXEL_MM
}

export type RouteAreaStatus = 'ok' | 'no-calibration' | 'no-rooms' | 'no-types' | 'no-route-rooms';
export type RouteAreaRoomKind = 'path' | 'shaft';
export interface RouteAreaRoom { roomId: string; kind: RouteAreaRoomKind; typeId: string; open: boolean; name: string | null }

export type RouteNodeKind = 'end' | 'junction' | 'bend' | 'tap' | 'shaft' | 'wall';
export interface RouteNode { id: string; point: Vec2; kind: RouteNodeKind; roomId: string }
export interface RouteEdge {
  id: string;
  from: string;             // RouteNode.id
  to: string;
  kind: 'center' | 'connector';
  points: Vec2[];           // page points, first = node `from`, last = node `to`
  lengthMm: number;
  roomId: string | null;    // the path room of a center edge; null for a connector
}
/** A place in a wall where a branch can go from a route-area room to another room. */
export interface RouteEntry {
  id: string;
  roomId: string;           // the served room (not in the route area)
  areaRoomId: string;       // the route-area room that the branch leaves
  nodeId: string;           // the node of kind 'wall' at `point`
  point: Vec2;
  runMm: number;
  gapMm: number;
  /** True for the entry of the area room with the longest run for this served room. */
  primary: boolean;
  /** True when the area room is a shaft room. */
  shaft: boolean;
}
/** The same between two route-area rooms. It joins their center lines. */
export interface RouteLink { id: string; roomIds: [string, string]; nodeId: string; point: Vec2; runMm: number; gapMm: number; shaft: boolean }
export interface UnreachedRoom { roomId: string; distanceMm: number | null }  // null: no route-area room on the page

export interface RouteArea {
  status: RouteAreaStatus;
  rooms: RouteAreaRoom[];
  nodes: RouteNode[];
  edges: RouteEdge[];
  entries: RouteEntry[];
  links: RouteLink[];
  /** Rooms of the page, not in the route area, with no wall stretch to any route-area room. */
  unreached: UnreachedRoom[];
  /** The number of separate parts of the graph (connected sets of nodes). 0 for an empty area. */
  parts: number;
}

export function selectRouteAreaRooms(rooms: readonly Room[], options: Pick<RouteAreaOptions, 'roomTypeIds' | 'pageIndex'>): RouteAreaRoom[] {
  return rooms
    .filter((r) => r.pageIndex === options.pageIndex && r.roomTypeId !== undefined && options.roomTypeIds.includes(r.roomTypeId))
    .map((r) => ({
      roomId: r.id,
      kind: r.roomTypeId === SHAFT_ROOM_TYPE_ID ? 'shaft' : 'path',
      typeId: r.roomTypeId!,
      open: r.open,
      name: r.name,
    }));
}

// Stub: T09 to T10b fill the nodes, edges, entries, links and unreached rooms.
export function computeRouteArea(rooms: readonly Room[], options: RouteAreaOptions): RouteArea {
  if (options.mmPerPt === null) return emptyArea('no-calibration');
  if (!rooms.some((r) => r.pageIndex === options.pageIndex)) return emptyArea('no-rooms');
  if (options.roomTypeIds.length === 0) return emptyArea('no-types');
  const selected = selectRouteAreaRooms(rooms, options);
  if (selected.length === 0) return emptyArea('no-route-rooms');
  return emptyArea('ok', selected);
}

function emptyArea(status: RouteAreaStatus, rooms: RouteAreaRoom[] = []): RouteArea {
  return { status, rooms, nodes: [], edges: [], entries: [], links: [], unreached: [], parts: 0 };
}
