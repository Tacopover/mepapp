import type { Vec2 } from './geometry.js';
import type { RouteEntry } from './route-area.js';
import { insideRouteArea, legClass, type RouteLayoutOptions } from './route-layout.js';
import { roomEntryCandidates } from './route-room-entry.js';
import { bestRoomReach, type PlacedTapAt, type ReachCarrier } from './route-room-reach.js';
import { roomFeed } from './route-room-feed.js';
import { runsOverOtherPort } from './route-topology.js';
import type { TrunkServedRoom } from './route-trunk.js';
import { roomBounds, roomContainsPoint, type Room } from './rooms/room.js';

const SAMPLE_MM = 100;
const ENTRY_CLEAR_MM = 500;

export interface RoomFeedsInput {
  rooms: readonly Room[];
  servedRooms: readonly TrunkServedRoom[];
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

export interface RoomFeedResult { roomId: string; branch: Vec2[]; spine: Vec2[][]; leftPortIds: string[]; lengthMm: number }
export interface RoomFeedsResult { rooms: RoomFeedResult[]; unfedRoomIds: string[] }

const dist = (p: Vec2, q: Vec2): number => Math.hypot(q.x - p.x, q.y - p.y);

const pathLength = (path: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
};

function legSamples(a: Vec2, b: Vec2): Vec2[] {
  const n = Math.max(1, Math.ceil(dist(a, b) / SAMPLE_MM));
  return Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
}

export function planRoomFeeds(input: RoomFeedsInput): RoomFeedsResult {
  const branches = input.options.roomBranches;
  if (!branches) throw new Error('planRoomFeeds needs options.roomBranches');
  const { mmPerPt } = input;
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
  const toPage = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const roomById = new Map(input.rooms.map((room) => [room.id, room] as const));
  const areaRooms = input.rooms.filter((room) => input.areaRoomIds.has(room.id));
  const corridorAt = (p: Vec2): boolean => areaRooms.some((room) => roomContainsPoint(room, toPage(p)));
  const portRooms = input.rooms
    .filter((room) => input.portsByRoom.has(room.id))
    .map((room) => ({ room, bounds: roomBounds(room) }));

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

  const placedTaps: PlacedTapAt[] = [];
  const rooms: RoomFeedResult[] = [];
  const unfedRoomIds: string[] = [];

  for (const { roomId } of order) {
    const room = roomById.get(roomId);
    const ports = input.portsByRoom.get(roomId) ?? [];
    const areaEntries = input.areaEntries.filter((entry) => entry.roomId === roomId);
    if (!room || areaEntries.length === 0) {
      unfedRoomIds.push(roomId);
      continue;
    }
    const portsMm = ports.map((port) => port.point);
    const candidates = roomEntryCandidates({ room, mmPerPt, areaEntries, corridorAt, portsMm });
    const others = portRooms.filter((other) => other.room.id !== roomId);
    const hitsOtherRoom = (path: readonly Vec2[], entryMm: Vec2): boolean => {
      for (let i = 1; i < path.length; i++) {
        for (const p of legSamples(path[i - 1]!, path[i]!)) {
          if (dist(p, entryMm) < ENTRY_CLEAR_MM) continue;
          const q = toPage(p);
          if (others.some((o) => q.x >= o.bounds.minX && q.x <= o.bounds.maxX && q.y >= o.bounds.minY && q.y <= o.bounds.maxY && roomContainsPoint(o.room, q))) return true;
        }
      }
      return false;
    };
    const reach = bestRoomReach({
      candidates,
      carriers,
      placedTaps,
      pathOk: (path, _carrierId, entry) =>
        input.accepts([...path]) && !runsOverOtherPort(path, input.targetPointsMm) && !hitsOtherRoom(path, entry.pointMm),
      bendMm: input.options.bendPenaltyMm,
      searchMm: branches.searchMm,
      portsMm,
    });
    if (!reach) {
      unfedRoomIds.push(roomId);
      continue;
    }
    const carrier = carrierById.get(reach.carrierId);
    if (carrier && dist(carrier.a, carrier.b) > 0) placedTaps.push({ carrierId: reach.carrierId, sMm: dist(carrier.a, reach.tapMm) });

    const feed = roomFeed({
      entry: reach.entry,
      ports,
      ringMm: room.polygon.outer.map(toMm),
      inside: insideRouteArea([room], mmPerPt),
      roomContains: (p) => roomContainsPoint(room, toPage(p)),
      crossesExisting: input.crossesExisting,
      bendMm: input.options.bendPenaltyMm,
      crossingMm: input.options.crossingPenaltyMm,
      exactMaxPorts: input.options.exactSpine?.maxPorts,
    });
    const branch = feed.stub.length === 2 ? [...reach.branch, feed.stub[1]!] : reach.branch;
    rooms.push({
      roomId,
      branch,
      spine: feed.spine,
      leftPortIds: feed.leftPortIds,
      lengthMm: pathLength(branch) + feed.spine.reduce((total, path) => total + pathLength(path), 0),
    });
  }
  return { rooms, unfedRoomIds };
}
