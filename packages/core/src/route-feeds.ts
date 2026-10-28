import type { Vec2 } from './geometry.js';
import type { RouteEntry } from './route-area.js';
import { insideRouteArea, legClass, type RouteLayoutOptions } from './route-layout.js';
import { roomEntryCandidates, type EntryCandidate } from './route-room-entry.js';
import { bestRoomReach, type PlacedTapAt, type ReachCarrier, type RoomReach } from './route-room-reach.js';
import { roomFeed, type RoomFeed } from './route-room-feed.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { distanceToPiece } from './route-checks.js';
import { runsOverOtherPort } from './route-topology.js';
import type { TrunkServedRoom } from './route-trunk.js';
import { roomBounds, roomContainsPoint, type Room } from './rooms/room.js';

const SAMPLE_MM = 100;
const ENTRY_CLEAR_MM = 500;
const CHAIN_CLEAR_MM = 60;
const CELL_PT = 100;
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

const dist = (p: Vec2, q: Vec2): number => Math.hypot(q.x - p.x, q.y - p.y);

const pathLength = (path: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
};

function distanceToPath(p: Vec2, path: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToPiece(p, path[i - 1]!, path[i]!));
  return best;
}

function anySample(a: Vec2, b: Vec2, test: (p: Vec2) => boolean): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / SAMPLE_MM));
  for (let k = 0; k <= n; k++) {
    if (test({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })) return true;
  }
  return false;
}

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
  const portRooms = input.rooms
    .filter((room) => input.portsByRoom.has(room.id))
    .map((room) => ({ room, bounds: roomBounds(room) }));
  const portRoomsByCell = new Map<string, typeof portRooms>();
  for (const o of portRooms) {
    for (let ix = Math.floor(o.bounds.minX / CELL_PT); ix <= Math.floor(o.bounds.maxX / CELL_PT); ix++) {
      for (let iy = Math.floor(o.bounds.minY / CELL_PT); iy <= Math.floor(o.bounds.maxY / CELL_PT); iy++) {
        const key = `${ix},${iy}`;
        const list = portRoomsByCell.get(key);
        if (list) list.push(o);
        else portRoomsByCell.set(key, [o]);
      }
    }
  }
  const inPortRoom = (q: Vec2, excluded: ReadonlySet<string>): boolean =>
    (portRoomsByCell.get(`${Math.floor(q.x / CELL_PT)},${Math.floor(q.y / CELL_PT)}`) ?? []).some((o) => !excluded.has(o.room.id) && q.x >= o.bounds.minX && q.x <= o.bounds.maxX && q.y >= o.bounds.minY && q.y <= o.bounds.maxY && roomContainsPoint(o.room, q));

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
    const hitsOtherRoom = (path: readonly Vec2[], entryMm: Vec2): boolean => {
      for (let i = 1; i < path.length; i++) {
        if (anySample(path[i - 1]!, path[i]!, (p) => {
          if (dist(p, entryMm) < ENTRY_CLEAR_MM) return false;
          return inPortRoom(toPage(p), excluded);
        })) return true;
      }
      return false;
    };
    resetCap();
    const reach = bestRoomReach({
      candidates,
      carriers,
      placedTaps,
      pathOk: (path, _carrierId, entry) =>
        !hitsOtherRoom(path, entry.pointMm) && input.accepts([...path]) && !runsOverOtherPort(path, input.targetPointsMm),
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
    const portsMm = ports.map((port) => port.point);
    const hosts = [...fed.entries()]
      .filter(([, host]) => host.depth + 1 <= maxDepth)
      .sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0));
    if (hosts.length === 0) return false;
    const hostRooms = hosts.map(([hostId]) => roomById.get(hostId)!);
    const chainCarriers: ReachCarrier[] = hosts.map(([hostId, host]) => ({
      id: `chain:${hostId}`,
      a: { ...host.junctionMm },
      b: { ...host.junctionMm },
    }));
    const inHostAt = (p: Vec2): boolean => hostRooms.some((host) => roomContainsPoint(host, toPage(p)));
    const chainPathOk = (path: readonly Vec2[], carrierId: string, entry: EntryCandidate): boolean => {
      const hostId = carrierId.slice('chain:'.length);
      const host = fed.get(hostId);
      const hostRoom = roomById.get(hostId);
      if (!host || !hostRoom) return false;
      const hostExcluded = new Set([hostId, roomId]);
      const sampleOk = (p: Vec2): boolean => {
        const fromJunction = dist(p, host.junctionMm);
        if (fromJunction < 1) return true;
        if (dist(p, entry.pointMm) >= ENTRY_CLEAR_MM) {
          if (!roomContainsPoint(hostRoom, toPage(p))) return false;
        } else if (inPortRoom(toPage(p), hostExcluded)) return false;
        if (fromJunction > CHAIN_CLEAR_MM && host.paths.some((own) => distanceToPath(p, own) <= CHAIN_CLEAR_MM)) return false;
        return true;
      };
      for (let i = 1; i < path.length; i++) {
        if (anySample(path[i - 1]!, path[i]!, (p) => !sampleOk(p))) return false;
      }
      return input.accepts([...path]) && !runsOverOtherPort(path, input.targetPointsMm);
    };
    const chainCache = chainCaches.get(roomId) ?? feedCache(room, ports);
    chainCaches.set(roomId, chainCache);
    const { feedOf, costOf, resetCap } = chainCache;
    let reach: RoomReach | null = null;
    for (const probeMm of [300, 700]) {
      const candidates = roomEntryCandidates({ room, mmPerPt, areaEntries: [], corridorAt: inHostAt, portsMm, probeMm, alignedInGap: fewBends });
      resetCap();
      reach = bestRoomReach({
        candidates,
        carriers: chainCarriers,
        placedTaps: [],
        pathOk: chainPathOk,
        bendMm: input.options.bendPenaltyMm,
        searchMm: branches.searchMm,
        portsMm,
        ...(fewBends ? { extraCostMm: (reach: RoomReach) => costOf(reach.entry) } : {}),
      });
      if (reach) break;
    }
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
