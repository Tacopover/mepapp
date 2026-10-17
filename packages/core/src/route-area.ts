import { distance, type Vec2 } from './geometry.js';
import { centerLineOf } from './route-skeleton.js';
import { connectedParts, nearestOnEdges, splitEdgeAt, type GraphData } from './route-graph.js';
import { wallStretch } from './route-wall.js';
import { roomLabelPoint, type Room } from './rooms/room.js';

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

// T10b fills unreached.
export function computeRouteArea(rooms: readonly Room[], options: RouteAreaOptions): RouteArea {
  if (options.mmPerPt === null) return emptyArea('no-calibration');
  if (!rooms.some((r) => r.pageIndex === options.pageIndex)) return emptyArea('no-rooms');
  if (options.roomTypeIds.length === 0) return emptyArea('no-types');
  const selected = selectRouteAreaRooms(rooms, options);
  if (selected.length === 0) return emptyArea('no-route-rooms');
  const mm = options.mmPerPt;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const polyOf = (id: string) => byId.get(id)!.polygon;
  const stretchOptions: { maxWallMm?: number; minWallRunMm?: number } = {};
  if (options.maxWallMm !== undefined) stretchOptions.maxWallMm = options.maxWallMm;
  if (options.minWallRunMm !== undefined) stretchOptions.minWallRunMm = options.minWallRunMm;
  const graph: GraphData = buildCenterGraph(byId, selected, mm, options.pixelMm ?? DEFAULT_SKELETON_PIXEL_MM);

  const links: RouteLink[] = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i]!;
      const b = selected[j]!;
      const stretch = wallStretch(polyOf(a.roomId), polyOf(b.roomId), mm, stretchOptions);
      if (!stretch) continue;
      const linkId = `rk-${a.roomId}-${b.roomId}`;
      const wallNode: RouteNode = { id: `rl-${a.roomId}-${b.roomId}`, point: { ...stretch.point }, kind: 'wall', roomId: a.roomId };
      connectTo(graph, a.roomId, wallNode, `rt-${linkId}-0`, `rc-${linkId}-0`, mm);
      connectTo(graph, b.roomId, wallNode, `rt-${linkId}-1`, `rc-${linkId}-1`, mm);
      links.push({
        id: linkId,
        roomIds: [a.roomId, b.roomId],
        nodeId: wallNode.id,
        point: { ...stretch.point },
        runMm: stretch.runMm,
        gapMm: stretch.gapMm,
        shaft: a.kind === 'shaft' || b.kind === 'shaft',
      });
    }
  }

  const selectedIds = new Set(selected.map((r) => r.roomId));
  const served = rooms.filter((r) => r.pageIndex === options.pageIndex && !selectedIds.has(r.id));
  const entries: RouteEntry[] = [];
  for (const s of served) {
    const own: RouteEntry[] = [];
    for (const area of selected) {
      const stretch = wallStretch(polyOf(s.id), polyOf(area.roomId), mm, stretchOptions);
      if (!stretch) continue;
      const entryId = `ry-${s.id}-${area.roomId}`;
      const wallNode: RouteNode = { id: `rw-${s.id}-${area.roomId}`, point: { ...stretch.point }, kind: 'wall', roomId: s.id };
      connectTo(graph, area.roomId, wallNode, `rt-${entryId}-0`, `rc-${entryId}-0`, mm);
      own.push({
        id: entryId,
        roomId: s.id,
        areaRoomId: area.roomId,
        nodeId: wallNode.id,
        point: { ...stretch.point },
        runMm: stretch.runMm,
        gapMm: stretch.gapMm,
        primary: false,
        shaft: area.kind === 'shaft',
      });
    }
    let best: RouteEntry | undefined;
    for (const entry of own) {
      if (!best || entry.runMm > best.runMm) best = entry;
    }
    if (best) best.primary = true;
    entries.push(...own);
  }

  const parts = connectedParts(graph).length;
  return { status: 'ok', rooms: selected, nodes: graph.nodes, edges: graph.edges, entries, links, unreached: [], parts };
}

function buildCenterGraph(
  byId: ReadonlyMap<string, Room>,
  selected: readonly RouteAreaRoom[],
  mmPerPt: number,
  pixelMm: number,
): GraphData {
  const nodes: RouteNode[] = [];
  const edges: RouteEdge[] = [];
  for (const area of selected) {
    const room = byId.get(area.roomId)!;
    const label = roomLabelPoint(room);
    if (area.kind === 'shaft') {
      nodes.push({ id: `rn-${area.roomId}-0`, point: label, kind: 'shaft', roomId: area.roomId });
      continue;
    }
    const cl = centerLineOf(room.polygon, mmPerPt, { pixelMm });
    if (cl.nodes.length === 0) {
      nodes.push({ id: `rn-${area.roomId}-0`, point: label, kind: 'end', roomId: area.roomId });
      continue;
    }
    const ids = new Map<string, string>();
    cl.nodes.forEach((node, k) => {
      const id = `rn-${area.roomId}-${k}`;
      ids.set(node.id, id);
      nodes.push({ id, point: { x: node.point.x, y: node.point.y }, kind: node.kind, roomId: area.roomId });
    });
    cl.edges.forEach((edge, k) => {
      const points = edge.points.map((p) => ({ x: p.x, y: p.y }));
      edges.push({
        id: `re-${area.roomId}-${k}`,
        from: ids.get(edge.from)!,
        to: ids.get(edge.to)!,
        kind: 'center',
        points,
        lengthMm: polylineLength(points) * mmPerPt,
        roomId: area.roomId,
      });
    });
  }
  return { nodes, edges };
}

function connectTo(
  graph: GraphData,
  areaRoomId: string,
  wallNode: RouteNode,
  tapNodeId: string,
  connectorId: string,
  mmPerPt: number,
): void {
  if (!graph.nodes.includes(wallNode)) graph.nodes.push(wallNode);
  const near = nearestOnEdges(graph, wallNode.point, (e) => e.kind === 'center' && e.roomId === areaRoomId);
  const targetId =
    near === null
      ? graph.nodes.find((n) => n.roomId === areaRoomId && n.kind !== 'wall' && n.kind !== 'tap')!.id
      : splitEdgeAt(graph, near.edgeId, near.segment, near.point, tapNodeId);
  const target = graph.nodes.find((n) => n.id === targetId)!;
  graph.edges.push({
    id: connectorId,
    from: wallNode.id,
    to: target.id,
    kind: 'connector',
    points: [{ ...wallNode.point }, { ...target.point }],
    lengthMm: distance(wallNode.point, target.point) * mmPerPt,
    roomId: null,
  });
}

function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

function emptyArea(status: RouteAreaStatus, rooms: RouteAreaRoom[] = []): RouteArea {
  return { status, rooms, nodes: [], edges: [], entries: [], links: [], unreached: [], parts: 0 };
}
