import { distance, type Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import type { RouteArea, RouteEdge, RouteEntry, RouteNode } from './route-area.js';
import { nearestOnEdges, splitEdgeAt, type GraphData } from './route-graph.js';
import { insideRouteArea, straightenPolyline, withWallGaps } from './route-layout.js';
import { steinerTree } from './route-steiner.js';

export interface TrunkInput {
  area: RouteArea;
  /** All rooms of the page. The route-area rooms are picked with area.rooms[].roomId. */
  rooms: readonly Pick<Room, 'id' | 'polygon'>[];
  mmPerPt: number;
  /** The start point in mm. */
  startPointMm: Vec2;
  /** The rooms that need a branch (rooms with target ports that are not in the route area). */
  servedRoomIds: readonly string[];
}
export interface TrunkEdge {
  /** The id of the graph edge (a split edge has an id with '~'). */
  id: string;
  kind: 'center' | 'link';
  /** Oriented away from the root. */
  fromNodeId: string;
  toNodeId: string;
  /** mm. First point = the actual position of fromNodeId, last point = the actual position of toNodeId. */
  path: Vec2[];
  /** True when no axis/45 degree path stays in the region; then path is the original polyline. */
  free: boolean;
}
export interface TrunkServedRoom {
  roomId: string;
  entryId: string;
  /** The wall node of the entry. */
  wallNodeId: string;
  /** The graph node on the corridor side (the terminal of the tree). */
  tapNodeId: string;
  /** E: the wall point of the entry, mm, not moved. */
  entryPointMm: Vec2;
}
export interface TrunkResult {
  rootNodeId: string | null;
  rootPointMm: Vec2 | null;
  /** Distance from startPointMm to the root, mm. null when there is no root. */
  startDistanceMm: number | null;
  /** The tree edges, parent before child (breadth first from the root; children in the order of the edge id). */
  edges: TrunkEdge[];
  /** The actual position (mm) of every node of the tree, root included. A node position can differ from the graph position by less than MIN_JOG_MM (a drift fix moves the last vertex of an edge). */
  nodePointsMm: Record<string, Vec2>;
  /** Served rooms that the tree reaches, sorted by room id. */
  served: TrunkServedRoom[];
  /** Served rooms with no entry that the tree reaches (no entry, or every entry in another graph part), sorted. */
  offGraphRoomIds: string[];
  /** For each free edge: its id and the first point of its path. */
  freeEdges: { edgeId: string; pointMm: Vec2 }[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emptyTrunk(servedRoomIds: readonly string[]): TrunkResult {
  return {
    rootNodeId: null,
    rootPointMm: null,
    startDistanceMm: null,
    edges: [],
    nodePointsMm: {},
    served: [],
    offGraphRoomIds: [...new Set(servedRoomIds)].sort(compareText),
    freeEdges: [],
  };
}

function chooseRoot(graph: GraphData, startPt: Vec2): string | null {
  const edgeNear = nearestOnEdges(graph, startPt, (e) => e.kind === 'center');
  let nodeId: string | null = null;
  let nodeDistance = Infinity;
  for (const node of graph.nodes) {
    if (node.kind === 'wall' || node.kind === 'tap') continue;
    const d = distance(startPt, node.point);
    if (d < nodeDistance) {
      nodeDistance = d;
      nodeId = node.id;
    }
  }
  if (!edgeNear) return nodeId;
  if (nodeId !== null && nodeDistance <= edgeNear.distance) return nodeId;
  return splitEdgeAt(graph, edgeNear.edgeId, edgeNear.segment, edgeNear.point, 'rt-root');
}

function entriesOf(area: RouteArea, roomId: string): RouteEntry[] {
  return area.entries
    .filter((e) => e.roomId === roomId)
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      if (a.runMm !== b.runMm) return b.runMm - a.runMm;
      return compareText(a.id, b.id);
    });
}

export function buildTrunk(input: TrunkInput): TrunkResult {
  const { area, rooms, mmPerPt, startPointMm, servedRoomIds } = input;
  if (area.status !== 'ok' || area.nodes.length === 0) return emptyTrunk(servedRoomIds);

  const graph: GraphData = {
    nodes: area.nodes.map((n): RouteNode => ({ ...n, point: { ...n.point } })),
    edges: area.edges.map((e): RouteEdge => ({ ...e, points: e.points.map((p) => ({ ...p })) })),
  };

  const startPt = { x: startPointMm.x / mmPerPt, y: startPointMm.y / mmPerPt };
  const rootId = chooseRoot(graph, startPt);
  if (rootId === null) return emptyTrunk(servedRoomIds);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const rootNode = nodeById.get(rootId)!;
  const rootPointMm = { x: rootNode.point.x * mmPerPt, y: rootNode.point.y * mmPerPt };
  const startDistanceMm = distance(startPt, rootNode.point) * mmPerPt;

  // Entries of each served room, and the tap node of the current entry.
  const roomIds = [...new Set(servedRoomIds)].sort(compareText);
  const entryLists = new Map<string, { entry: RouteEntry; tapNodeId: string }[]>();
  for (const roomId of roomIds) {
    const list: { entry: RouteEntry; tapNodeId: string }[] = [];
    for (const entry of entriesOf(area, roomId)) {
      const connector = edgeById.get(`rc-${entry.id}-0`);
      if (connector) list.push({ entry, tapNodeId: connector.to });
    }
    entryLists.set(roomId, list);
  }
  const current = new Map<string, number>(roomIds.map((id) => [id, 0]));
  const active = (roomId: string) => current.get(roomId)! < entryLists.get(roomId)!.length;
  const tapOf = (roomId: string) => entryLists.get(roomId)![current.get(roomId)!]!.tapNodeId;

  const steinerEdges = graph.edges
    .filter((e) => !e.id.startsWith('rc-ry-'))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, cost: e.lengthMm }));
  const steinerGraph = { nodeIds: graph.nodes.map((n) => n.id), edges: steinerEdges };

  let treeEdgeIds: string[] = [];
  for (;;) {
    const terminals = roomIds.filter(active).map(tapOf);
    const tree = steinerTree(steinerGraph, rootId, terminals);
    treeEdgeIds = tree.edgeIds;
    const unreached = new Set(tree.unreached);
    let changed = false;
    for (const roomId of roomIds) {
      if (active(roomId) && unreached.has(tapOf(roomId))) {
        current.set(roomId, current.get(roomId)! + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Orientation and straightening.
  const treeSet = new Set(treeEdgeIds);
  const incident = new Map<string, RouteEdge[]>();
  for (const edge of graph.edges) {
    if (!treeSet.has(edge.id)) continue;
    for (const end of [edge.from, edge.to]) {
      let list = incident.get(end);
      if (!list) {
        list = [];
        incident.set(end, list);
      }
      list.push(edge);
    }
  }
  for (const list of incident.values()) list.sort((a, b) => compareText(a.id, b.id));

  const areaRooms = rooms.filter((r) => area.rooms.some((a) => a.roomId === r.id));
  const baseInside = insideRouteArea(areaRooms, mmPerPt);
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });

  const nodePointsMm: Record<string, Vec2> = { [rootId]: { ...rootPointMm } };
  const edges: TrunkEdge[] = [];
  const freeEdges: { edgeId: string; pointMm: Vec2 }[] = [];
  const usedEdges = new Set<string>();
  const queue: string[] = [rootId];
  for (let head = 0; head < queue.length; head++) {
    const parentId = queue[head]!;
    for (const edge of incident.get(parentId) ?? []) {
      if (usedEdges.has(edge.id)) continue;
      usedEdges.add(edge.id);
      const forward = edge.from === parentId;
      const childId = forward ? edge.to : edge.from;
      const oriented = forward ? edge.points : [...edge.points].reverse();
      const polyline = oriented.map(toMm);
      polyline[0] = { ...nodePointsMm[parentId]! };

      const wallPoints: Vec2[] = [];
      for (const endId of [edge.from, edge.to]) {
        const end = nodeById.get(endId);
        if (end && end.kind === 'wall') wallPoints.push(toMm(end.point));
      }
      const inside = wallPoints.length > 0 ? withWallGaps(baseInside, wallPoints) : baseInside;
      const { path, free } = straightenPolyline(polyline, inside);
      nodePointsMm[childId] = { ...path[path.length - 1]! };
      edges.push({
        id: edge.id,
        kind: edge.kind === 'center' ? 'center' : 'link',
        fromNodeId: parentId,
        toNodeId: childId,
        path,
        free,
      });
      if (free) freeEdges.push({ edgeId: edge.id, pointMm: { ...path[0]! } });
      queue.push(childId);
    }
  }

  // Served rooms.
  const served: TrunkServedRoom[] = [];
  const offGraph: string[] = [];
  for (const roomId of roomIds) {
    if (active(roomId) && nodePointsMm[tapOf(roomId)] !== undefined) {
      const { entry, tapNodeId } = entryLists.get(roomId)![current.get(roomId)!]!;
      served.push({
        roomId,
        entryId: entry.id,
        wallNodeId: entry.nodeId,
        tapNodeId,
        entryPointMm: toMm(entry.point),
      });
    } else {
      offGraph.push(roomId);
    }
  }

  return {
    rootNodeId: rootId,
    rootPointMm,
    startDistanceMm,
    edges,
    nodePointsMm,
    served,
    offGraphRoomIds: offGraph,
    freeEdges,
  };
}
