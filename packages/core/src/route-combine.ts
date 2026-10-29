import type { Vec2 } from './geometry.js';
import { roomBounds, type Room } from './rooms/room.js';
import type { EntryCandidate } from './route-room-entry.js';
import type { RoomFeed } from './route-room-feed.js';
import type { RoomBlockPlan, RoomDoorRun } from './route-room-doors.js';
import { roomRunFor, type RoomRun } from './route-room-runs.js';
import { bestRoomReach, type PlacedTapAt, type ReachCarrier, type RoomReach } from './route-room-reach.js';
import { buildPortRoomsByCell, chainRoom, dist, hitsOtherRoom } from './route-feed-helpers.js';
import { LEFT_PORT_MM } from './route-feeds.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { runsOverOtherPort } from './route-topology.js';

export const DEFAULT_TEE_SPACING_MM = 600;      // planner value
export const DEFAULT_OPPOSITE_TEE_SPACING_MM = 395;   // planner value: tee spacing of two branches on opposite sides of one main line (hand route 437)
export const DEFAULT_COMBINE_SEARCH_MM = 6000;  // planner value: a door counts only for a tree leg within this distance
export const DEFAULT_CHAIN_DEPTH = 2;           // Q-P1-16 answer C

// branch = the path tap to door (reach.branch; for a chain with a moved door, the jog point is appended). spine = run.teeth (tagged spine later). run.stem / run.lead stay in run.
export interface RoomDoorPlan { door: EntryCandidate; run: RoomRun; branch: Vec2[]; spine: Vec2[][]; tapMm: Vec2; carrierId: string }
export interface RoomFeedMulti { roomId: string; doors: RoomDoorPlan[]; leftPortIds: string[]; chain?: { viaRoomId: string; depth: number } }
export interface TwoLevelFeedsResult { rooms: RoomFeedMulti[]; unfedRoomIds: string[] }

export interface CombineRoom {
  room: Room;                                         // page-space (pt) room
  ports: readonly { id: string; point: Vec2 }[];      // terminals, mm
  singles: readonly RoomDoorRun[];                    // result of roomDoorRuns (all doors)
  blockPlans: readonly RoomBlockPlan[];               // result of roomBlockRuns (may be [])
}

export interface CombineInput {
  tree: readonly (readonly Vec2[])[];                 // MainRun.paths
  startMm: Vec2;                                      // for the room order only; also: no tap at the start
  rooms: readonly CombineRoom[];
  allRooms: readonly Room[];                          // every room of the page (hitsOtherRoom, chain hosts)
  mmPerPt: number;
  bendMm?: number;                                    // default BEND_PENALTY_MM
  searchMm?: number;                                  // default DEFAULT_COMBINE_SEARCH_MM
  teeSpacingMm?: number;                              // default DEFAULT_TEE_SPACING_MM
  oppositeTeeSpacingMm?: number;                      // default DEFAULT_OPPOSITE_TEE_SPACING_MM
  ductWidthMm?: number;                               // default 0; tee spacing = max(teeSpacingMm ?? 600, ductWidthMm)
  maxChainDepth?: number;                             // default DEFAULT_CHAIN_DEPTH; 0 = no chain pass
  accepts?: (path: Vec2[]) => boolean;                // default () => true
  blockers: readonly (readonly Vec2[])[];             // for roomRunFor in the chain pass
  clearanceMm: number;
  doorMarginMm: number;
  portDoorMarginMm?: number;                          // margin of a port-line door to a ring vertex; default doorMarginMm
  stubMm?: number;
  wallParallelToRows?: boolean;
  roomFeedFallback?: (room: Room, door: EntryCandidate) => RoomFeed;
}

interface Placed { carrierId: string; sMm: number; point: Vec2; side: -1 | 0 | 1 }
interface Option { total: number; doors: RoomDoorPlan[]; leftPortIds: string[]; taps: Placed[] }
interface Fed { depth: number; junctionMm: Vec2; paths: Vec2[][] }

const EPS = 1e-6;

export function runCostMm(run: RoomRun, bendMm: number): number {
  return run.lengthMm + run.bends * bendMm + run.leftPortIds.length * LEFT_PORT_MM;
}

const doorKey = (p: Vec2, outward: Vec2): string => `${p.x},${p.y},${outward.x},${outward.y}`;

const runsAlong = (p: Vec2, q: Vec2, carrier: ReachCarrier): boolean => {
  const ux = q.x - p.x;
  const uy = q.y - p.y;
  const vx = carrier.b.x - carrier.a.x;
  const vy = carrier.b.y - carrier.a.y;
  return Math.abs(ux * vy - uy * vx) <= EPS * Math.hypot(ux, uy) * Math.hypot(vx, vy);
};

const sideOn = (carrier: ReachCarrier, from: Vec2, to: Vec2): -1 | 0 | 1 => {
  const horizontal = Math.abs(carrier.b.x - carrier.a.x) >= Math.abs(carrier.b.y - carrier.a.y);
  const d = horizontal ? to.y - from.y : to.x - from.x;
  return Math.abs(d) <= EPS ? 0 : d > 0 ? 1 : -1;
};

const piecesOf = (run: RoomRun): Vec2[][] => [run.lead, run.stem, ...run.teeth].filter((p) => p.length >= 2);

const junctionOf = (run: RoomRun): Vec2 => {
  const stemEnd = run.stem[run.stem.length - 1];
  return run.stem.length >= 2 && stemEnd ? { x: stemEnd.x, y: stemEnd.y } : { x: run.door.pointMm.x, y: run.door.pointMm.y };
};

const terminalsOf = (ports: readonly { id: string; point: Vec2 }[], run: RoomRun): string[] => {
  const pieces = piecesOf(run);
  return ports
    .filter((port) => pieces.some((piece) => dist(piece[0]!, port.point) <= 1 || dist(piece[piece.length - 1]!, port.point) <= 1))
    .map((port) => port.id);
};

const planOf = (run: RoomRun, reach: RoomReach): RoomDoorPlan => ({
  door: run.door,
  run,
  branch: reach.branch,
  spine: run.teeth,
  tapMm: reach.tapMm,
  carrierId: reach.carrierId,
});

export function combineRoomRuns(input: CombineInput): TwoLevelFeedsResult {
  const bendMm = input.bendMm ?? BEND_PENALTY_MM;
  const searchMm = input.searchMm ?? DEFAULT_COMBINE_SEARCH_MM;
  const maxChainDepth = input.maxChainDepth ?? DEFAULT_CHAIN_DEPTH;
  const accepts = input.accepts ?? (() => true);
  const spacing = Math.max(input.teeSpacingMm ?? DEFAULT_TEE_SPACING_MM, input.ductWidthMm ?? 0);
  const oppositeSpacing = Math.min(spacing, input.oppositeTeeSpacingMm ?? DEFAULT_OPPOSITE_TEE_SPACING_MM);
  const { mmPerPt } = input;
  const toPage = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const centreOf = (room: Room): Vec2 => {
    const b = roomBounds(room);
    return { x: ((b.minX + b.maxX) / 2) * mmPerPt, y: ((b.minY + b.maxY) / 2) * mmPerPt };
  };

  const roomById = new Map(input.allRooms.map((room) => [room.id, room] as const));
  const portsByRoom = new Map<string, { id: string; point: Vec2 }[]>();
  for (const cr of input.rooms) {
    if (cr.ports.length > 0) portsByRoom.set(cr.room.id, [...cr.ports]);
  }
  const portRoomsByCell = buildPortRoomsByCell(input.allRooms, portsByRoom);
  const targetPointsMm = input.rooms.flatMap((cr) => cr.ports.map((port) => port.point));

  const carriers: ReachCarrier[] = [];
  input.tree.forEach((path, pathIndex) => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if (dist(a, b) <= 0 || (Math.abs(b.x - a.x) > EPS && Math.abs(b.y - a.y) > EPS)) continue;
      carriers.push({ id: `${pathIndex}#${i - 1}`, a, b });
    }
  });
  const freeEnd = (carrier: ReachCarrier, end: Vec2): boolean => {
    if (dist(end, input.startMm) <= 1) return false;
    return !carriers.some(
      (other) =>
        other.id !== carrier.id &&
        end.x >= Math.min(other.a.x, other.b.x) - 1 && end.x <= Math.max(other.a.x, other.b.x) + 1 &&
        end.y >= Math.min(other.a.y, other.b.y) - 1 && end.y <= Math.max(other.a.y, other.b.y) + 1,
    );
  };
  for (const carrier of carriers) {
    carrier.freeA = freeEnd(carrier, carrier.a);
    carrier.freeB = freeEnd(carrier, carrier.b);
  }
  const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier] as const));

  const distanceOf = (cr: CombineRoom): number => dist(input.startMm, centreOf(cr.room));
  const ordered = [...input.rooms].sort(
    (p, q) => distanceOf(p) - distanceOf(q) || (p.room.id < q.room.id ? -1 : p.room.id > q.room.id ? 1 : 0),
  );

  const usable = (cr: CombineRoom, run: RoomRun): boolean => run.leftPortIds.length < cr.ports.length;

  const tapBlockers = (taken: readonly Placed[]): PlacedTapAt[] =>
    taken.map((tap) => ({ carrierId: tap.carrierId, sMm: tap.sMm, side: tap.side }));

  const tapGaps = { sameSideMm: spacing, oppositeSideMm: oppositeSpacing };

  const pathOk =
    (roomId: string, taken: readonly Placed[]) =>
    (path: readonly Vec2[], carrierId: string, entry: EntryCandidate): boolean => {
      const carrier = carrierById.get(carrierId);
      if (!carrier) return false;
      if (path.length >= 3 && runsAlong(path[0]!, path[1]!, carrier)) return false;
      const side = sideOn(carrier, path[0]!, path[1]!);
      return (
        !hitsOtherRoom({ path, entryMm: entry.pointMm, excluded: new Set([roomId]), toPage, portRoomsByCell }) &&
        accepts([...path]) &&
        !runsOverOtherPort(path, targetPointsMm) &&
        taken.every((tap) => {
          const opposite = tap.carrierId === carrierId && side !== 0 && tap.side !== 0 && tap.side !== side;
          return dist(path[0]!, tap.point) >= (opposite ? oppositeSpacing : spacing) - EPS;
        })
      );
    };

  const placedOf = (reach: RoomReach): Placed => {
    const carrier = carrierById.get(reach.carrierId)!;
    return {
      carrierId: reach.carrierId,
      sMm: dist(carrier.a, reach.tapMm),
      point: reach.tapMm,
      side: sideOn(carrier, reach.branch[0]!, reach.branch[1]!),
    };
  };

  const runsFor = (cr: CombineRoom, door: EntryCandidate): RoomRun[] => {
    const fallback = input.roomFeedFallback;
    return roomRunFor({
      room: cr.room,
      mmPerPt,
      door,
      ports: cr.ports,
      blockers: input.blockers,
      clearanceMm: input.clearanceMm,
      doorMarginMm: input.doorMarginMm,
      portDoorMarginMm: input.portDoorMarginMm,
      stubMm: input.stubMm,
      bendMm: input.bendMm,
      wallParallelToRows: input.wallParallelToRows,
      roomFeedFallback: fallback ? (d) => fallback(cr.room, d) : undefined,
    });
  };

  const singleOption = (cr: CombineRoom, taken: Placed[]): Option | null => {
    const runs = cr.singles.filter((d) => usable(cr, d.run));
    if (runs.length === 0) return null;
    const runByKey = new Map<string, RoomRun>();
    for (const d of runs) {
      const key = doorKey(d.run.door.pointMm, d.run.door.outward);
      const prev = runByKey.get(key);
      if (!prev || runCostMm(d.run, bendMm) < runCostMm(prev, bendMm)) runByKey.set(key, d.run);
    }
    const reach = bestRoomReach({
      candidates: runs.map((d) => d.run.door),
      carriers,
      placedTaps: tapBlockers(taken),
      pathOk: pathOk(cr.room.id, taken),
      bendMm,
      searchMm,
      portsMm: cr.ports.map((port) => port.point),
      tapAtFreeEnd: true,
      tapGaps,
      extraCostMm: (r) => runCostMm(runByKey.get(doorKey(r.entry.pointMm, r.entry.outward))!, bendMm),
    });
    if (!reach) return null;
    const run = runByKey.get(doorKey(reach.entry.pointMm, reach.entry.outward))!;
    return { total: reach.costMm, doors: [planOf(run, reach)], leftPortIds: [...run.leftPortIds].sort(), taps: [placedOf(reach)] };
  };

  const planOption = (cr: CombineRoom, plan: RoomBlockPlan, taken: Placed[]): Option | null => {
    const local = [...taken];
    const doors: RoomDoorPlan[] = [];
    const taps: Placed[] = [];
    const left = new Set<string>();
    const portsMm = cr.ports.map((port) => port.point);
    let total = 0;
    for (const block of plan.blocks) {
      const reach = bestRoomReach({
        candidates: [block.run.door],
        carriers,
        placedTaps: tapBlockers(local),
        pathOk: pathOk(cr.room.id, local),
        bendMm,
        searchMm,
        portsMm,
        tapAtFreeEnd: true,
        tapGaps,
        extraCostMm: () => runCostMm(block.run, bendMm),
      });
      if (reach) {
        const placed = placedOf(reach);
        local.push(placed);
        taps.push(placed);
        doors.push(planOf(block.run, reach));
        total += reach.costMm;
        for (const id of block.run.leftPortIds) left.add(id);
      } else {
        const ids = [...terminalsOf(cr.ports, block.run), ...block.run.leftPortIds];
        for (const id of ids) left.add(id);
        total += ids.length * LEFT_PORT_MM;
      }
    }
    if (doors.length === 0) return null;
    return { total, doors, leftPortIds: [...left].sort(), taps };
  };

  const taken: Placed[] = [];
  const rows: RoomFeedMulti[] = [];
  const fed = new Map<string, Fed>();
  const pending: CombineRoom[] = [];

  for (const cr of ordered) {
    let best = singleOption(cr, taken);
    for (const plan of cr.blockPlans) {
      const option = planOption(cr, plan, taken);
      if (option && (!best || option.total < best.total)) best = option;
    }
    if (!best) {
      pending.push(cr);
      continue;
    }
    taken.push(...best.taps);
    rows.push({ roomId: cr.room.id, doors: best.doors, leftPortIds: best.leftPortIds });
    const runs = best.doors.map((d) => d.run);
    fed.set(cr.room.id, { depth: 0, junctionMm: junctionOf(runs[0]!), paths: runs.flatMap(piecesOf) });
  }

  const costCaches = new Map<string, Map<string, number>>();
  const tryChain = (cr: CombineRoom): boolean => {
    const cache = costCaches.get(cr.room.id) ?? new Map<string, number>();
    costCaches.set(cr.room.id, cache);
    const costOf = (entry: EntryCandidate): number => {
      const key = doorKey(entry.pointMm, entry.outward);
      let cost = cache.get(key);
      if (cost === undefined) {
        const [run] = runsFor(cr, entry);
        cost = run && usable(cr, run) ? runCostMm(run, bendMm) : Infinity;
        cache.set(key, cost);
      }
      return cost;
    };
    const reach = chainRoom({
      roomId: cr.room.id,
      room: cr.room,
      ports: cr.ports,
      fed,
      roomById,
      maxDepth: maxChainDepth,
      mmPerPt,
      toPage,
      fewBends: true,
      accepts,
      targetPointsMm,
      portRoomsByCell,
      bendPenaltyMm: input.bendMm,
      searchMm,
      costOf,
      resetCap: () => {},
    });
    if (!reach) return false;
    const hostId = reach.carrierId.slice('chain:'.length);
    const host = fed.get(hostId)!;
    const [run] = runsFor(cr, reach.entry);
    if (!run || !usable(cr, run)) return false;
    const last = reach.branch[reach.branch.length - 1]!;
    const branch = dist(last, run.door.pointMm) > 1 ? [...reach.branch, run.door.pointMm] : reach.branch;
    rows.push({
      roomId: cr.room.id,
      doors: [{ door: run.door, run, branch, spine: run.teeth, tapMm: reach.tapMm, carrierId: reach.carrierId }],
      leftPortIds: [...run.leftPortIds].sort(),
      chain: { viaRoomId: hostId, depth: host.depth + 1 },
    });
    fed.set(cr.room.id, { depth: host.depth + 1, junctionMm: junctionOf(run), paths: piecesOf(run) });
    host.paths.push(branch);
    return true;
  };

  let remaining = pending;
  if (maxChainDepth >= 1 && remaining.length > 0) {
    let placedAny = true;
    while (placedAny) {
      placedAny = false;
      remaining = remaining.filter((cr) => {
        if (!tryChain(cr)) return true;
        placedAny = true;
        return false;
      });
    }
  }

  return { rooms: rows, unfedRoomIds: remaining.map((cr) => cr.room.id).sort() };
}
