import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomLabelPoint, type Room } from './rooms/room.js';
import { loadFirstFloorRooms } from './rooms/route-area-fixture.testutil.js';
import { DEFAULT_ROUTE_AREA_TYPE_IDS, computeRouteArea, type RouteArea, type RouteEntry } from './route-area.js';
import { routeAreaWarnings } from './route-area-warnings.js';
import { crossingsAlongPath } from './route-crossings.js';
import { boundaryGapMm, wallStretch } from './route-wall.js';

const { mmPerPt, rooms } = loadFirstFloorRooms();
const PAGE = rooms[0]!.pageIndex;
// Measured on the first floor fixture: 18 primary entries of 33 served rooms (15 unreached). room-22 has an entry since the 1e-6 fix in wallStretch (its run was 499.99999999999994 mm against a limit of 500 mm).
const MIN_PRIMARY = 10;
// Measured: 16 of 18 primary entries (88.9 %) have exactly 1 wall crossing. Rounded down to 5 %: 85 %.
// The two other entries (room-3 to room-32 with 0 crossings, room-24 to room-31 with 2) are shown by the test output.
const MIN_CONSISTENT_PERCENT = 85;

function roomById(id: string): Room {
  const room = rooms.find((r) => r.id === id);
  if (!room) throw new Error(`room ${id} is not in the fixture`);
  return room;
}

function nameOf(id: string): string {
  return roomById(id).name ?? '(no name)';
}

let defaultRun: { area: RouteArea; ms: number } | undefined;

function defaultArea(): RouteArea {
  if (!defaultRun) {
    const start = performance.now();
    const area = computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex: PAGE });
    defaultRun = { area, ms: performance.now() - start };
  }
  return defaultRun.area;
}

// The center-line point at the other end of the connector edge of an entry.
function centerPointOf(area: RouteArea, entry: RouteEntry): Vec2 | null {
  const edge = area.edges.find((e) => e.kind === 'connector' && (e.from === entry.nodeId || e.to === entry.nodeId));
  if (!edge) return null;
  const otherId = edge.from === entry.nodeId ? edge.to : edge.from;
  const other = area.nodes.find((n) => n.id === otherId);
  return other ? { x: other.point.x, y: other.point.y } : null;
}

// Wall crossings of the straight line from the center line to the served room, or null without a connector edge.
function entryCrossings(area: RouteArea, entry: RouteEntry): number | null {
  const center = centerPointOf(area, entry);
  if (!center) return null;
  const path = [center, roomLabelPoint(roomById(entry.roomId))];
  return crossingsAlongPath(rooms, path, { mmPerPt, pageIndex: PAGE }).crossings.length;
}

describe('computeRouteArea on the first floor', () => {
  it('uses the default list: 5 path rooms, no shaft, every room has a node', () => {
    const area = defaultArea();
    expect(area.status).toBe('ok');
    expect(area.rooms.filter((r) => r.kind === 'path')).toHaveLength(5);
    expect(area.rooms.filter((r) => r.kind === 'shaft')).toHaveLength(0);
    for (const r of area.rooms) {
      console.log(`route-area room ${r.roomId} name ${r.name} type ${r.typeId} open ${r.open}`);
      expect(area.nodes.some((n) => n.roomId === r.roomId), `room ${r.roomId} has a node`).toBe(true);
    }
    console.log(`parts ${area.parts}`);
    expect(area.parts).toBeGreaterThanOrEqual(1);
    const stair = routeAreaWarnings(area).find((w) => w.code === 'stair-name');
    console.log(`stair-name: ${stair ? `present, roomIds ${JSON.stringify(stair.roomIds)}` : 'absent'}`);
  }, 60000);

  it('lists the primary entries and the unreached rooms', () => {
    const area = defaultArea();
    const primary = area.entries.filter((e) => e.primary);
    console.log(`primary entries ${primary.length}`);
    const served = rooms.filter((r) => r.pageIndex === PAGE && !area.rooms.some((a) => a.roomId === r.id));
    console.log(`served rooms ${served.length}`);
    for (const u of area.unreached) {
      console.log(`unreached ${u.roomId} name ${nameOf(u.roomId)} distanceMm ${u.distanceMm}`);
    }
    expect(primary.length, 'primary entries').toBeGreaterThanOrEqual(MIN_PRIMARY);
    const unreachedIds = new Set(area.unreached.map((u) => u.roomId));
    for (const e of primary) {
      expect(unreachedIds.has(e.roomId), `room ${e.roomId} is an entry room and unreached`).toBe(false);
    }
    const perRoom = new Map<string, number>();
    for (const e of primary) perRoom.set(e.roomId, (perRoom.get(e.roomId) ?? 0) + 1);
    for (const [roomId, n] of perRoom) {
      expect(n, `room ${roomId} primary entries`).toBeLessThanOrEqual(1);
    }
  }, 60000);

  it('the straight line of each primary entry has the measured share of single wall crossings', () => {
    const area = defaultArea();
    const primary = area.entries.filter((e) => e.primary);
    let consistent = 0;
    for (const entry of primary) {
      const n = entryCrossings(area, entry);
      expect(n, `entry ${entry.id} has a connector edge`).not.toBeNull();
      if (n === 1) {
        consistent++;
      } else {
        console.log(
          `inconsistent entry ${entry.id}: served room ${entry.roomId} name ${nameOf(entry.roomId)}, crossings ${n}, area room ${entry.areaRoomId}`,
        );
      }
    }
    const percent = (100 * consistent) / primary.length;
    console.log(`consistent entries ${consistent} of ${primary.length} (${percent.toFixed(1)} %)`);
    expect(percent).toBeGreaterThanOrEqual(MIN_CONSISTENT_PERCENT);
  }, 60000);

  it('adds the office type: more path rooms and more nodes, no throw', () => {
    const base = defaultArea();
    const withOffice = computeRouteArea(rooms, {
      roomTypeIds: [...DEFAULT_ROUTE_AREA_TYPE_IDS, 'office'],
      mmPerPt,
      pageIndex: PAGE,
    });
    expect(withOffice.status).toBe('ok');
    expect(withOffice.rooms.filter((r) => r.kind === 'path').length).toBeGreaterThan(
      base.rooms.filter((r) => r.kind === 'path').length,
    );
    expect(withOffice.nodes.length).toBeGreaterThan(base.nodes.length);
  }, 60000);

  it('gives no-route-rooms for the shaft type alone and for an unknown type', () => {
    expect(computeRouteArea(rooms, { roomTypeIds: ['shaft'], mmPerPt, pageIndex: PAGE }).status).toBe('no-route-rooms');
    expect(computeRouteArea(rooms, { roomTypeIds: ['no-such-type'], mmPerPt, pageIndex: PAGE }).status).toBe('no-route-rooms');
  }, 60000);

  it('gives the warnings of the default result', () => {
    const area = defaultArea();
    const warnings = routeAreaWarnings(area);
    const open = warnings.find((w) => w.code === 'open-room');
    console.log(`open-room count ${open?.count ?? 'absent'}`);
    // Measured: 3 of the 5 corridors are open (room-0, room-31, room-32).
    expect(open?.count).toBe(3);

    const expectedWall = area.entries.filter((e) => e.primary && !e.shaft).length + area.links.filter((l) => !l.shaft).length;
    expect(expectedWall).toBeGreaterThan(0);
    expect(warnings.find((w) => w.code === 'wall-crossings')?.count).toBe(expectedWall);

    expect(warnings.find((w) => w.code === 'unreached')?.count).toBe(area.unreached.length);
    expect(warnings.some((w) => w.code === 'shaft-crossing')).toBe(false);
    expect(warnings[warnings.length - 1]!.code).toBe('draft-2d');
  }, 60000);

  it('computes the default result in less than 1000 ms', () => {
    const start = performance.now();
    computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex: PAGE });
    const ms = performance.now() - start;
    console.log(`computeRouteArea time ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
  }, 60000);

  it('does not change the input', () => {
    const before = JSON.stringify(rooms);
    computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex: PAGE });
    expect(JSON.stringify(rooms)).toBe(before);
  }, 60000);

  it('prints the wall stretches of room-22 to the route-area rooms', () => {
    const room22 = rooms.find((r) => r.id === 'room-22');
    expect(room22, 'room-22 exists in the fixture').toBeDefined();
    const area = defaultArea();
    const entries = area.entries.filter((e) => e.roomId === 'room-22');
    const unreached = area.unreached.find((u) => u.roomId === 'room-22');
    console.log(`room-22 name ${room22!.name} type ${room22!.roomTypeId ?? '(none)'}`);
    console.log(
      `room-22 entries ${entries.length}, primary ${entries.filter((e) => e.primary).length}, unreached ${unreached ? `distanceMm ${unreached.distanceMm}` : 'no'}`,
    );
    for (const a of area.rooms) {
      const areaPoly = roomById(a.roomId).polygon;
      const servedFirst = wallStretch(room22!.polygon, areaPoly, mmPerPt, { minWallRunMm: 0 });
      const areaFirst = wallStretch(areaPoly, room22!.polygon, mmPerPt, { minWallRunMm: 0 });
      const gap = boundaryGapMm(room22!.polygon, areaPoly, mmPerPt);
      console.log(
        `room-22 vs ${a.roomId} (${a.name}): served-first runMm ${servedFirst?.runMm ?? null} gapMm ${servedFirst?.gapMm ?? null}; area-first runMm ${areaFirst?.runMm ?? null} gapMm ${areaFirst?.gapMm ?? null}; boundaryGapMm ${gap.toFixed(0)}`,
      );
    }
  }, 60000);
});
