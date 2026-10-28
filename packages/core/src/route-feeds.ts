import type { Vec2 } from './geometry.js';
import type { RouteEntry } from './route-area.js';
import { insideRouteArea, legClass, type RouteLayoutOptions } from './route-layout.js';
import { roomEntryCandidates, type EntryCandidate } from './route-room-entry.js';
import { bestRoomReach, type PlacedTapAt, type ReachCarrier, type RoomReach } from './route-room-reach.js';
import { roomFeed, type RoomFeed } from './route-room-feed.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { runsOverOtherPort } from './route-topology.js';
import type { TrunkServedRoom } from './route-trunk.js';
import { roomBounds, roomContainsPoint, type Room } from './rooms/room.js';
import { buildPortRoomsByCell, chainRoom, dist, hitsOtherRoom } from './route-feed-helpers.js';

export const DEFAULT_MAX_CHAIN_DEPTH = 1;
export const LEFT_PORT_MM = 5000;   // planner value: a terminal that the spine cannot reach later gets a link of about that cost
export const MAX_FEED_ENTRIES = 8;   // planner value: the entries priced in one search, in order of base cost; a later entry costs Infinity, so the cap can drop an entry that would win

export interface RoomFeedsInput {
  rooms: readonly Room[];
  servedRooms: readonly TrunkServedRoom[];
  offGraphRoomIds?: readonly string[];
  portsByRoom: ReadonlyMap<string, { id: string; point: Vec2 }[]>;
  areaEntries: readonly RouteEntry[];
  areaRoomIds: ReadonlySet<string>;
  trunkEdges: readonly { id: string; path: readonly Vec2[] }[];
  rootPointMm: Vec2;
  startPointMm: Vec2;
  mmPerPt: number;
  accepts: (path: Vec2[]) => boolean;
  targetPointsMm: readonly Vec2[];
  crossesExisting: (a: Vec2, b: Vec2) => number;
  options: RouteLayoutOptions;
}

export interface RoomFeedResult { roomId: string; branch: Vec2[]; spine: Vec2[][]; leftPortIds: string[]; lengthMm: number; chain?: { viaRoomId: string; depth: number } }
export interface RoomFeedsResult { rooms: RoomFeedResult[]; unfedRoomIds: string[] }

const pathLength = (path: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
};

export function planRoomFeeds(input: RoomFeedsInput): RoomFeedsResult {
  const branches = input.options.roomBranches;
  if (!branches) throw new Error('planRoomFeeds needs options.roomBranches');
  const maxDepth = branches.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
  const fewBends = branches.fewRoomBends === true;
  const { mmPerPt } = input;
  const bendMm = input.options.bendPenaltyMm ?? BEND_PENALTY_MM;
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
  const toPage = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const roomById = new Map(input.rooms.map((room) => [room.id, room] as const));
  const areaRooms = input.rooms.filter((room) => input.areaRoomIds.has(room.id));
  const corridorAt = (p: Vec2): boolean => areaRooms.some((room) => roomContainsPoint(room, toPage(p)));
  const portRoomsByCell = buildPortRoomsByCell(input.rooms, input.portsByRoom);

  const carriers: ReachCarrier[] = [];
  for (const edge of input.trunkEdges) {
    for (let i = 1; i < edge.path.length; i++) {
      const a = edge.path[i - 1]!;
      const b = edge.path[i]!;
      if (dist(a, b) === 0 || legClass(a, b) !== 'axis') continue;
      carriers.push({ id: `${edge.id}#${i - 1}`, a, b });
    }
  }
  if (carriers.length === 0) carriers.push({ id: 'root', a: input.rootPointMm, b: input.rootPointMm });
  const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier] as const));

  const centreDistance = (roomId: string): number => {
    const room = roomById.get(roomId);
    if (!room) return Infinity;
    const b = roomBounds(room);
    return dist(input.startPointMm, toMm({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
  };
  const order = input.servedRooms
    .map((served) => ({ roomId: served.roomId, d: centreDistance(served.roomId) }))
    .sort((p, q) => p.d - q.d || (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0));

  const feedCache = (room: Room, ports: readonly { id: string; point: Vec2 }[]) => {
    const cache = new Map<string, RoomFeed>();
    const keyOf = (entry: EntryCandidate): string => `${entry.pointMm.x},${entry.pointMm.y},${entry.outward.x},${entry.outward.y}`;
    const feedOf = (entry: EntryCandidate): RoomFeed => {
      const key = keyOf(entry);
      let feed = cache.get(key);
      if (!feed) {
        feed = roomFeed({
          entry,
          ports,
          ringMm: room.polygon.outer.map(toMm),
          inside: insideRouteArea([room], mmPerPt),
          roomContains: (p) => roomContainsPoint(room, toPage(p)),
          crossesExisting: input.crossesExisting,
          bendMm: input.options.bendPenaltyMm,
          crossingMm: input.options.crossingPenaltyMm,
          exactMaxPorts: input.options.exactSpine?.maxPorts,
          middleLines: fewBends,
        });
        cache.set(key, feed);
      }
      return feed;
    };
    const counted = new Set<string>();
    const costOf = (entry: EntryCandidate): number => {
      const key = keyOf(entry);
      if (!counted.has(key) && counted.size >= MAX_FEED_ENTRIES) return Infinity;
      counted.add(key);
      const f = feedOf(entry);
      return f.lengthMm + f.bends * bendMm + f.leftPortIds.length * LEFT_PORT_MM;
    };
    const resetCap = (): void => counted.clear();
    return { feedOf, costOf, resetCap };
  };

  const feedRoom = (
    room: Room,
    ports: readonly { id: string; point: Vec2 }[],
    reach: RoomReach,
    feedOf: (entry: EntryCandidate) => RoomFeed,
  ): { row: RoomFeedResult; paths: Vec2[][]; junctionMm: Vec2 } => {
    const feed = feedOf(reach.entry);
    const branch = feed.stub.length === 2 ? [...reach.branch, feed.stub[1]!] : reach.branch;
    return {
      row: {
        roomId: room.id,
        branch,
        spine: feed.spine,
        leftPortIds: feed.leftPortIds,
        lengthMm: pathLength(branch) + feed.spine.reduce((total, path) => total + pathLength(path), 0),
      },
      paths: feed.stub.length === 2 ? [feed.stub, ...feed.spine] : [...feed.spine],
      junctionMm: feed.junctionMm,
    };
  };

  const placedTaps: PlacedTapAt[] = [];
  const rooms: RoomFeedResult[] = [];
  const far: string[] = [];
  const fed = new Map<string, { depth: number; junctionMm: Vec2; paths: Vec2[][] }>();

  for (const { roomId } of order) {
    const room = roomById.get(roomId);
    const ports = input.portsByRoom.get(roomId) ?? [];
    const areaEntries = input.areaEntries.filter((entry) => entry.roomId === roomId);
    if (!room || areaEntries.length === 0) {
      far.push(roomId);
      continue;
    }
    const portsMm = ports.map((port) => port.point);
    const candidates = roomEntryCandidates({ room, mmPerPt, areaEntries, corridorAt, portsMm, alignedInGap: fewBends });
    const { feedOf, costOf, resetCap } = feedCache(room, ports);
    const excluded = new Set([roomId]);
    resetCap();
    const reach = bestRoomReach({
      candidates,
      carriers,
      placedTaps,
      pathOk: (path, _carrierId, entry) =>
        !hitsOtherRoom({ path, entryMm: entry.pointMm, excluded, toPage, portRoomsByCell }) && input.accepts([...path]) && !runsOverOtherPort(path, input.targetPointsMm),
      bendMm: input.options.bendPenaltyMm,
      searchMm: branches.searchMm,
      portsMm,
      ...(fewBends ? { extraCostMm: (reach: RoomReach) => costOf(reach.entry) } : {}),
    });
    if (!reach) {
      far.push(roomId);
      continue;
    }
    const carrier = carrierById.get(reach.carrierId);
    if (carrier && dist(carrier.a, carrier.b) > 0) placedTaps.push({ carrierId: reach.carrierId, sMm: dist(carrier.a, reach.tapMm) });

    const fedRoom = feedRoom(room, ports, reach, feedOf);
    rooms.push(fedRoom.row);
    fed.set(roomId, { depth: 0, junctionMm: fedRoom.junctionMm, paths: fedRoom.paths });
  }

  const chainCaches = new Map<string, ReturnType<typeof feedCache>>();
  const tryChain = (roomId: string): boolean => {
    const room = roomById.get(roomId);
    if (!room) return false;
    const ports = input.portsByRoom.get(roomId) ?? [];
    const chainCache = chainCaches.get(roomId) ?? feedCache(room, ports);
    chainCaches.set(roomId, chainCache);
    const { feedOf, costOf, resetCap } = chainCache;
    const reach = chainRoom({
      roomId,
      room,
      ports,
      fed,
      roomById,
      maxDepth,
      mmPerPt,
      toPage,
      fewBends,
      accepts: input.accepts,
      targetPointsMm: input.targetPointsMm,
      portRoomsByCell,
      bendPenaltyMm: input.options.bendPenaltyMm,
      searchMm: branches.searchMm,
      costOf,
      resetCap,
    });
    if (!reach) return false;
    const hostId = reach.carrierId.slice('chain:'.length);
    const host = fed.get(hostId)!;
    const fedRoom = feedRoom(room, ports, reach, feedOf);
    rooms.push({ ...fedRoom.row, chain: { viaRoomId: hostId, depth: host.depth + 1 } });
    fed.set(roomId, { depth: host.depth + 1, junctionMm: fedRoom.junctionMm, paths: fedRoom.paths });
    host.paths.push(reach.branch);
    return true;
  };

  const farRooms = [...new Set([...far, ...(input.offGraphRoomIds ?? []).filter((roomId) => input.portsByRoom.has(roomId))])]
    .map((roomId) => ({ roomId, d: centreDistance(roomId) }))
    .sort((p, q) => p.d - q.d || (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0))
    .map((item) => item.roomId);

  let pending = farRooms;
  if (maxDepth >= 1 && farRooms.length > 0) {
    let placedAny = true;
    while (placedAny) {
      placedAny = false;
      pending = pending.filter((roomId) => {
        if (!tryChain(roomId)) return true;
        placedAny = true;
        return false;
      });
    }
  }
  return { rooms, unfedRoomIds: pending };
}
