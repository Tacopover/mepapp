// The two-level plan for planRoute (P2-T11): main run in the corridors, room runs in the rooms, combine. Pure, mm units.

import { distance, type Vec2 } from './geometry.js';
import { roomBounds, roomContainsPoint, roomsAtPoint, type Room } from './rooms/room.js';
import { ROOM_TYPE_LIBRARY } from './rooms/room-type.js';
import type { RouteArea } from './route-area.js';
import { combineRoomRuns, DEFAULT_CHAIN_DEPTH } from './route-combine.js';
import { elbowPath, insideRouteArea, withWallGaps, type TwoLevelOptions } from './route-layout.js';
import { bridgeRoomAllowed, mainBridgeLines, mainRunLines, planMainRun, type BridgeRoom, type MainDemand, type MainLine, type MainRun } from './route-main-run.js';
import type { RouteStamp } from './route-ports.js';
import type { EntryCandidate } from './route-room-entry.js';
import { roomFeed, type RoomFeed } from './route-room-feed.js';
import { roomBlockRuns, roomDoorCandidates, roomDoorRuns, type RoomBlockPlan, type RoomDoorRun, type RoomDoorRunsInput } from './route-room-doors.js';
import type { RoomRun } from './route-room-runs.js';
import type { TrunkResult } from './route-trunk.js';
import { getStampWorldPorts, routingTargetOf } from './stamp.js';

/** Planner values. Each one is overridden by the option of the same name in TwoLevelOptions where that option exists. */
export const TWO_LEVEL_DEFAULTS = {
  mainOffsetMm: 1000,
  reachMm: 6000,
  splitFromTerminals: 6,
  clearanceMm: 150,
  doorMarginMm: 200,
  ductWidthMm: 400,
  bridgeProbeMm: 15000,
} as const;

export interface TwoLevelPlanInput {
  options: TwoLevelOptions;
  bendMm: number;                                                     // options.bendPenaltyMm ?? DEFAULT_LAYOUT_OPTIONS.bendPenaltyMm
  rooms: readonly Room[];                                             // all rooms (page space, pt)
  area: RouteArea;
  mmPerPt: number;
  pageIndex: number;
  startMm: Vec2;
  portsByRoom: ReadonlyMap<string, readonly { id: string; point: Vec2 }[]>;   // served rooms (not in the route area) with their terminals, mm. id = `${stampId}:${portId}`. Map order = room ids sorted.
  terminalRoomIds: ReadonlySet<string>;                               // rooms with a terminal of ANY routing target (D3), see terminalRoomIdsOf
  blockers: readonly (readonly Vec2[])[];                             // polylines (mm) of segments of other networks (D2)
  accepts: (path: Vec2[]) => boolean;
  crossesExisting: (a: Vec2, b: Vec2) => number;                      // for the roomFeed fallback
}

export interface TwoLevelPiece { origin: 'branch' | 'spine'; path: Vec2[] }

export interface TwoLevelPlan {
  trunk: TrunkResult;            // synthetic, see below
  main: MainRun;                 // the raw main run (T11b reads lines, stubCrossesWall, stubRoomIds)
  mainPaths: Vec2[][];           // the main run paths to push with tag 'trunk': the tree paths, then the root stub (an elbow when the stub is not axis aligned)
  pieces: TwoLevelPiece[];       // branch (tap to door), lead and stem are 'branch'; teeth are 'spine'. Only paths with 2 points or more.
  leftPortIds: string[];         // terminals that a served run leaves, sorted, unique
  chainedRoomIds: string[];      // rooms with row.chain, sorted
  unfedRoomIds: string[];        // combine.unfedRoomIds
  holesPerRoom: Record<string, number>;   // room id -> number of doors, keys sorted
}

export function terminalRoomIdsOf(stamps: readonly RouteStamp[], rooms: readonly Room[], pageIndex: number): Set<string> {
  const ids = new Set<string>();
  for (const stamp of stamps) {
    if (!stamp.routingTargets) continue;
    for (const port of getStampWorldPorts(stamp)) {
      if (!routingTargetOf(stamp, port.id)) continue;
      const room = roomsAtPoint(rooms, port.world, pageIndex)[0];
      if (room) ids.add(room.id);
    }
  }
  return ids;
}

export function planTwoLevel(input: TwoLevelPlanInput): TwoLevelPlan {
  const { options, bendMm, area, mmPerPt, pageIndex, startMm, portsByRoom, blockers, accepts, crossesExisting } = input;
  const clearanceMm = options.clearanceMm ?? TWO_LEVEL_DEFAULTS.clearanceMm;
  const doorMarginMm = options.doorMarginMm ?? TWO_LEVEL_DEFAULTS.doorMarginMm;
  const reachMm = options.reachMm ?? TWO_LEVEL_DEFAULTS.reachMm;
  const offsetMm = options.mainOffsetMm ?? TWO_LEVEL_DEFAULTS.mainOffsetMm;
  const splitFromTerminals = options.splitFromTerminals ?? TWO_LEVEL_DEFAULTS.splitFromTerminals;
  const maxChainDepth = options.maxChainDepth ?? DEFAULT_CHAIN_DEPTH;
  const ductWidthMm = TWO_LEVEL_DEFAULTS.ductWidthMm;
  const passable = options.crossRooms !== undefined;

  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
  const toPt = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const pageRooms = input.rooms.filter((room) => room.pageIndex === pageIndex);
  const roomById = new Map(pageRooms.map((room) => [room.id, room] as const));
  const indexed = pageRooms.map((room) => ({ room, bounds: roomBounds(room) }));
  const findRoom = (pMm: Vec2, accept: (room: Room) => boolean = () => true): Room | null => {
    const q = toPt(pMm);
    for (const { room, bounds } of indexed) {
      if (q.x < bounds.minX || q.x > bounds.maxX || q.y < bounds.minY || q.y > bounds.maxY) continue;
      if (accept(room) && roomContainsPoint(room, q)) return room;
    }
    return null;
  };
  const areaIds = new Set(area.rooms.map((room) => room.roomId));
  const shaftRoomIds = new Set(area.rooms.filter((room) => room.kind === 'shaft').map((room) => room.roomId));
  const corridorAt = (p: Vec2): boolean => findRoom(p, (room) => areaIds.has(room.id)) !== null;
  const roomIdAt = (p: Vec2): string | null => findRoom(p)?.id ?? null;
  const otherRoomFor = (room: Room) => (p: Vec2): boolean => findRoom(p, (r) => r.id !== room.id && !areaIds.has(r.id)) !== null;

  const bridgeRooms: BridgeRoom[] = pageRooms.map((room) => ({
    roomId: room.id,
    name: room.name,
    typeId: room.roomTypeId ?? null,
    typeName: ROOM_TYPE_LIBRARY.find((type) => type.id === room.roomTypeId)?.name ?? null,
    hasTerminal: input.terminalRoomIds.has(room.id),
    inRouteArea: areaIds.has(room.id),
    isShaft: shaftRoomIds.has(room.id),
  }));
  const bridgeById = new Map(bridgeRooms.map((room) => [room.roomId, room] as const));
  const passableRoomAt = (p: Vec2): boolean => {
    const room = findRoom(p);
    return room !== null && !areaIds.has(room.id) && bridgeRoomAllowed(bridgeById.get(room.id)!, options.neverCrossTypeIds);
  };

  const served = [...portsByRoom.keys()].flatMap((id) => {
    const room = roomById.get(id);
    return room ? [room] : [];
  });
  const portsOf = (room: Room): { id: string; point: Vec2 }[] => [...(portsByRoom.get(room.id) ?? [])];

  const areaRoomObjects = pageRooms.filter((room) => areaIds.has(room.id));
  const areaRooms = areaRoomObjects.map((room) => ({ roomId: room.id, ringMm: room.polygon.outer.map(toMm) }));
  const linkPointsMm = area.links.filter((link) => !link.shaft).map((link) => toMm(link.point));
  const inside = withWallGaps(insideRouteArea(areaRoomObjects, mmPerPt), linkPointsMm);
  const lines = mainRunLines({ areaRooms, inside, startMm, offsetMm, blockers, shaftRoomIds, ductWidthMm, clearanceMm });

  const ringMmOf = (room: Room): Vec2[] => [...room.polygon.outer.map(toMm), toMm(room.polygon.outer[0]!)];
  const doorInputOf = (room: Room): RoomDoorRunsInput => {
    const ports = portsOf(room);
    return {
      room,
      mmPerPt,
      corridorAt,
      otherRoomAt: otherRoomFor(room),
      ...(passable ? { passableRoomAt, probeMm: TWO_LEVEL_DEFAULTS.bridgeProbeMm } : {}),
      portsMm: ports.map((p) => p.point),
      ports,
      blockers,
      clearanceMm,
      doorMarginMm,
      bendMm,
    };
  };
  const feedHookOf = (room: Room): ((door: EntryCandidate) => RoomFeed) => {
    const ports = portsOf(room);
    const roomInside = insideRouteArea([room], mmPerPt);
    return (door) =>
      roomFeed({
        entry: door,
        ports,
        ringMm: ringMmOf(room),
        inside: roomInside,
        roomContains: (p) => roomContainsPoint(room, toPt(p)),
        crossesExisting,
      });
  };
  const hooks = new Map<string, (door: EntryCandidate) => RoomFeed>();
  const singlesOf = new Map<string, RoomDoorRun[]>();
  const plansOf = new Map<string, RoomBlockPlan[]>();
  for (const room of served) {
    const doorInput = doorInputOf(room);
    const roomFeedFallback = feedHookOf(room);
    hooks.set(room.id, roomFeedFallback);
    singlesOf.set(room.id, roomDoorRuns({ ...doorInput, roomFeedFallback }));
    plansOf.set(room.id, roomBlockRuns({ ...doorInput, splitFromTerminals, roomFeedFallback }));
  }

  const demandOf = (room: Room): MainDemand => {
    const doors = new Map<string, { pointMm: Vec2; outward: Vec2 }>();
    const add = (run: RoomRun): void => {
      const key = `${Math.round(run.door.pointMm.x)},${Math.round(run.door.pointMm.y)},${run.door.outward.x},${run.door.outward.y}`;
      if (!doors.has(key)) doors.set(key, { pointMm: run.door.pointMm, outward: run.door.outward });
    };
    for (const d of singlesOf.get(room.id)!) if (d.run.pattern !== 'fallback') add(d.run);
    for (const plan of plansOf.get(room.id)!) for (const block of plan.blocks) add(block.run);
    return { roomId: room.id, doorsMm: [...doors.values()] };
  };
  const demands = served.map(demandOf);
  const before = planMainRun({ lines, startMm, demands, inside, bendMm, reachMm, roomIdAt });

  let main = before;
  if (passable) {
    const needy = new Set(before.unreachedRoomIds);
    const bridgeCands: MainDemand[] = served
      .filter((room) => needy.has(room.id))
      .map((room) => ({
        roomId: room.id,
        doorsMm: roomDoorCandidates(doorInputOf(room)).map((c) => ({ pointMm: c.door.pointMm, outward: c.door.outward })),
      }));
    const bridges: MainLine[] = mainBridgeLines({
      lines,
      demands: bridgeCands,
      rooms: bridgeRooms,
      roomIdAt,
      crossRooms: options.crossRooms!,
      ...(options.neverCrossTypeIds !== undefined ? { neverCrossTypeIds: options.neverCrossTypeIds } : {}),
      blockers,
      clearanceMm,
    });
    const isBridgeEnd = (door: Vec2): boolean => bridges.some((b) => distance(b.a, door) <= 1 || distance(b.b, door) <= 1);
    const afterDemands: MainDemand[] = demands.map((d) => {
      const cand = bridgeCands.find((c) => c.roomId === d.roomId);
      if (!cand) return d;
      return { roomId: d.roomId, doorsMm: [...d.doorsMm, ...cand.doorsMm.filter((door) => isBridgeEnd(door.pointMm))] };
    });
    main = planMainRun({ lines: [...lines, ...bridges], startMm, demands: afterDemands, inside, bendMm, reachMm, roomIdAt });
  }

  const root = main.rootPointMm;
  const hasStub = distance(startMm, root) > 1;
  const mainPaths: Vec2[][] = main.paths.map((path) => path.map((p) => ({ x: p.x, y: p.y })));
  const stubDx = root.x - startMm.x;
  const stubDy = root.y - startMm.y;
  if (hasStub && mainPaths.length > 0 && Math.abs(stubDx) > 1e-6 && Math.abs(stubDy) > 1e-6) {
    mainPaths[mainPaths.length - 1] = elbowPath(startMm, root, Math.abs(stubDx) >= Math.abs(stubDy) ? 'x' : 'y');
  }
  const treePaths = hasStub ? mainPaths.slice(0, -1) : mainPaths;

  const combined = combineRoomRuns({
    tree: mainPaths,
    startMm,
    rooms: served.map((room) => ({ room, ports: portsOf(room), singles: singlesOf.get(room.id)!, blockPlans: plansOf.get(room.id)! })),
    allRooms: pageRooms,
    mmPerPt,
    bendMm,
    ductWidthMm,
    maxChainDepth,
    accepts,
    blockers,
    clearanceMm,
    doorMarginMm,
    teeSpacingMm: options.teeSpacingMm,
    roomFeedFallback: (room, door) => hooks.get(room.id)!(door),
  });

  const pieces: TwoLevelPiece[] = [];
  const pushPiece = (origin: TwoLevelPiece['origin'], path: readonly Vec2[]): void => {
    if (path.length < 2) return;
    pieces.push({ origin, path: path.map((p) => ({ x: p.x, y: p.y })) });
  };
  for (const row of combined.rooms) {
    for (const plan of row.doors) {
      pushPiece('branch', plan.branch);
      pushPiece('branch', plan.run.lead);
      pushPiece('branch', plan.run.stem);
      for (const spine of plan.spine) pushPiece('spine', spine);
    }
  }

  const leftPortIds = [...new Set(combined.rooms.flatMap((row) => row.leftPortIds))].sort();
  const chainedRoomIds = combined.rooms.filter((row) => row.chain).map((row) => row.roomId).sort();
  const holesPerRoom: Record<string, number> = {};
  for (const row of [...combined.rooms].sort((p, q) => (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0))) {
    holesPerRoom[row.roomId] = row.doors.length;
  }

  const trunk: TrunkResult = {
    rootNodeId: 'main-root',
    rootPointMm: { ...root },
    startDistanceMm: distance(startMm, root),
    edges: treePaths.map((path, i) => ({ id: `mr-${i}`, kind: 'center', fromNodeId: `mr-${i}:a`, toNodeId: `mr-${i}:b`, path, free: false })),
    nodePointsMm: { 'main-root': { ...root } },
    served: [...main.chosenHitByRoom.keys()].sort().map((roomId) => ({ roomId, entryId: `main:${roomId}`, wallNodeId: '', tapNodeId: '', entryPointMm: { ...main.chosenHitByRoom.get(roomId)! } })),
    offGraphRoomIds: [...combined.unfedRoomIds].sort(),
    freeEdges: [],
  };

  return {
    trunk,
    main,
    mainPaths,
    pieces,
    leftPortIds,
    chainedRoomIds,
    unfedRoomIds: combined.unfedRoomIds,
    holesPerRoom,
  };
}
