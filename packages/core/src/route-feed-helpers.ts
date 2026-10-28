import type { Vec2 } from './geometry.js';
import { roomEntryCandidates, type EntryCandidate } from './route-room-entry.js';
import { bestRoomReach, type ReachCarrier, type RoomReach } from './route-room-reach.js';
import { distanceToPiece } from './route-checks.js';
import { runsOverOtherPort } from './route-topology.js';
import { roomBounds, roomContainsPoint, type Room } from './rooms/room.js';

export const SAMPLE_MM = 100;
export const ENTRY_CLEAR_MM = 500;
export const CHAIN_CLEAR_MM = 60;
export const CELL_PT = 100;

export type PortRoomsByCell = Map<string, { room: Room; bounds: ReturnType<typeof roomBounds> }[]>;

export const dist = (p: Vec2, q: Vec2): number => Math.hypot(q.x - p.x, q.y - p.y);

export function distanceToPath(p: Vec2, path: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToPiece(p, path[i - 1]!, path[i]!));
  return best;
}

export function anySample(a: Vec2, b: Vec2, test: (p: Vec2) => boolean): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / SAMPLE_MM));
  for (let k = 0; k <= n; k++) {
    if (test({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })) return true;
  }
  return false;
}

export function buildPortRoomsByCell(rooms: readonly Room[], portsByRoom: ReadonlyMap<string, unknown>): PortRoomsByCell {
  const portRooms = rooms
    .filter((room) => portsByRoom.has(room.id))
    .map((room) => ({ room, bounds: roomBounds(room) }));
  const portRoomsByCell: PortRoomsByCell = new Map();
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
  return portRoomsByCell;
}

export function inPortRoom(args: { q: Vec2; excluded: ReadonlySet<string>; portRoomsByCell: PortRoomsByCell }): boolean {
  const { q, excluded, portRoomsByCell } = args;
  return (portRoomsByCell.get(`${Math.floor(q.x / CELL_PT)},${Math.floor(q.y / CELL_PT)}`) ?? []).some((o) => !excluded.has(o.room.id) && q.x >= o.bounds.minX && q.x <= o.bounds.maxX && q.y >= o.bounds.minY && q.y <= o.bounds.maxY && roomContainsPoint(o.room, q));
}

export function hitsOtherRoom(args: { path: readonly Vec2[]; entryMm: Vec2; excluded: ReadonlySet<string>; toPage: (p: Vec2) => Vec2; portRoomsByCell: PortRoomsByCell }): boolean {
  const { path, entryMm, excluded, toPage, portRoomsByCell } = args;
  for (let i = 1; i < path.length; i++) {
    if (anySample(path[i - 1]!, path[i]!, (p) => {
      if (dist(p, entryMm) < ENTRY_CLEAR_MM) return false;
      return inPortRoom({ q: toPage(p), excluded, portRoomsByCell });
    })) return true;
  }
  return false;
}

export function chainRoom(args: {
  roomId: string;
  room: Room;
  ports: readonly { id: string; point: Vec2 }[];
  fed: ReadonlyMap<string, { depth: number; junctionMm: Vec2; paths: Vec2[][] }>;
  roomById: ReadonlyMap<string, Room>;
  maxDepth: number;
  mmPerPt: number;
  toPage: (p: Vec2) => Vec2;
  fewBends: boolean;
  accepts: (path: Vec2[]) => boolean;
  targetPointsMm: readonly Vec2[];
  portRoomsByCell: PortRoomsByCell;
  bendPenaltyMm: number | undefined;
  searchMm: number;
  costOf: (entry: EntryCandidate) => number;
  resetCap: () => void;
}): RoomReach | null {
  const { roomId, room, ports, fed, roomById, maxDepth, mmPerPt, toPage, fewBends, accepts, targetPointsMm, portRoomsByCell, bendPenaltyMm, searchMm, costOf, resetCap } = args;
  const portsMm = ports.map((port) => port.point);
  const hosts = [...fed.entries()]
    .filter(([, host]) => host.depth + 1 <= maxDepth)
    .sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0));
  if (hosts.length === 0) return null;
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
      } else if (inPortRoom({ q: toPage(p), excluded: hostExcluded, portRoomsByCell })) return false;
      if (fromJunction > CHAIN_CLEAR_MM && host.paths.some((own) => distanceToPath(p, own) <= CHAIN_CLEAR_MM)) return false;
      return true;
    };
    for (let i = 1; i < path.length; i++) {
      if (anySample(path[i - 1]!, path[i]!, (p) => !sampleOk(p))) return false;
    }
    return accepts([...path]) && !runsOverOtherPort(path, targetPointsMm);
  };
  let reach: RoomReach | null = null;
  for (const probeMm of [300, 700]) {
    const candidates = roomEntryCandidates({ room, mmPerPt, areaEntries: [], corridorAt: inHostAt, portsMm, probeMm, alignedInGap: fewBends });
    resetCap();
    reach = bestRoomReach({
      candidates,
      carriers: chainCarriers,
      placedTaps: [],
      pathOk: chainPathOk,
      bendMm: bendPenaltyMm,
      searchMm,
      portsMm,
      ...(fewBends ? { extraCostMm: (reach: RoomReach) => costOf(reach.entry) } : {}),
    });
    if (reach) break;
  }
  return reach;
}
