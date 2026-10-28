import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import { insideRouteArea } from './route-layout.js';
import { roomSpine } from './route-hanan.js';
import { ENTRY_DEPTH_MM, roomFeed, type RoomFeedInput } from './route-room-feed.js';
import { roomEntryCandidates } from './route-room-entry.js';
import { buildScenario, localDrawing } from './route-scenario.testutil.js';

const P = (x: number, y: number): Vec2 => ({ x, y });
const noCross = (): number => 0;
const key = (p: Vec2): string => `${p.x},${p.y}`;
const FIXTURE_ROOM_SUFFIXES = ['23', '24', '28', '5', '34', '36', '37', '42', '7'];

function rectRing(w: number, h: number): Vec2[] {
  return [P(0, 0), P(w, 0), P(w, h), P(0, h)];
}

function lRing(): Vec2[] {
  return [P(0, 0), P(4000, 0), P(4000, 1000), P(1000, 1000), P(1000, 4000), P(0, 4000)];
}

function polygonContains(ring: readonly Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function growRect(w: number, h: number, tol: number): (p: Vec2) => boolean {
  return (p) => p.x >= -tol && p.x <= w + tol && p.y >= -tol && p.y <= h + tol;
}

function feedInput(ring: readonly Vec2[], entry: Vec2, outward: Vec2, ports: { id: string; point: Vec2 }[], overrides: Partial<RoomFeedInput> = {}): RoomFeedInput {
  return {
    entry: { pointMm: entry, outward, source: 'area-entry' },
    ports,
    ringMm: ring,
    inside: (p) => polygonContains(ring, p),
    roomContains: (p) => polygonContains(ring, p),
    crossesExisting: noCross,
    ...overrides,
  };
}

function axisAligned(path: Vec2[]): boolean {
  for (let i = 1; i < path.length; i++) {
    if (path[i]!.x !== path[i - 1]!.x && path[i]!.y !== path[i - 1]!.y) return false;
  }
  return true;
}

describe('roomFeed', () => {
  it('reaches all ports from an entry 200 mm outside the room, where the bare spine reaches none', () => {
    const w = 4000;
    const h = 3000;
    const E = P(-200, 1500);
    const ports = [
      { id: 'a', point: P(1000, 1000) },
      { id: 'b', point: P(3000, 2000) },
      { id: 'c', point: P(2000, 500) },
    ];
    const inside = growRect(w, h, 100);
    const bare = roomSpine({ root: E, entryDir: P(1, 0), ports, inside, crossesExisting: noCross });
    expect(bare.unreachedPortIds).toEqual(['a', 'b', 'c']);
    const strict = (p: Vec2): boolean => p.x > 0 && p.x < w && p.y > 0 && p.y < h;
    const feed = roomFeed(feedInput(rectRing(w, h), E, P(-1, 0), ports, { inside, roomContains: strict }));
    expect(feed.leftPortIds).toEqual([]);
    expect(feed.stub).toEqual([E, P(250, 1500)]);
  });

  it('reaches all ports of an L-shaped room with the grid lines of the ring', () => {
    const ring = lRing();
    const E = P(0, 3000);
    const ports = [
      { id: 'a', point: P(2300, 550) },
      { id: 'b', point: P(1300, 550) },
    ];
    const feed = roomFeed(feedInput(ring, E, P(-1, 0), ports));
    expect(feed.leftPortIds).toEqual([]);
    const withoutLines = roomSpine({ root: feed.junctionMm, entryDir: P(1, 0), ports, inside: (p) => polygonContains(ring, p), crossesExisting: noCross });
    expect(withoutLines.unreachedPortIds).toEqual(['a']);
  });

  it('keeps the spine off the entry wall line, except for terminals closer than the entry depth', () => {
    const ring = rectRing(4000, 3000);
    const E = P(0, 1500);
    const ports = [
      { id: 'a', point: P(1000, 1000) },
      { id: 'b', point: P(3000, 2000) },
      { id: 'c', point: P(2000, 500) },
    ];
    const feed = roomFeed(feedInput(ring, E, P(-1, 0), ports));
    expect(feed.spine.length).toBeGreaterThan(0);
    for (const path of feed.spine) {
      for (const p of path) {
        if (p.x === E.x) expect(ports.some((q) => key(q.point) === key(p) && q.point.x - E.x < ENTRY_DEPTH_MM)).toBe(true);
      }
    }
  });

  it('falls back to the entry when no point of the walk back is inside the room and the region', () => {
    const E = P(0, 1500);
    const ports = [{ id: 'a', point: P(20, 1500) }];
    const inside = (p: Vec2): boolean => p.x < 30;
    const roomContains = (p: Vec2): boolean => p.x > 0 && p.x < 150 && p.y > 0 && p.y < 3000;
    const feed = roomFeed({ entry: { pointMm: E, outward: P(-1, 0), source: 'area-entry' }, ports, ringMm: rectRing(150, 3000), inside, roomContains, crossesExisting: noCross });
    expect(feed.stub).toEqual([E]);
    expect(feed.junctionMm).toEqual(E);
    expect(feed.spine.length).toBeGreaterThan(0);
    expect(feed.leftPortIds).toEqual([]);
  });

  it('uses the plain region test and the root E when no point is inside the room', () => {
    const ring = rectRing(4000, 3000);
    const E = P(0, 1500);
    const ports = [
      { id: 'a', point: P(1000, 1500) },
      { id: 'b', point: P(3000, 1500) },
    ];
    const inside = growRect(4000, 3000, 100);
    const feed = roomFeed(feedInput(ring, E, P(-1, 0), ports, { inside, roomContains: () => false }));
    const plain = roomSpine({ root: E, entryDir: P(1, 0), ports, inside, crossesExisting: noCross, gridXs: [0, 4000], gridYs: [0, 3000] });
    expect(feed.stub).toEqual([E]);
    expect(feed.junctionMm).toEqual(E);
    expect(feed.spine).toEqual(plain.paths);
    expect(feed.leftPortIds).toEqual(plain.unreachedPortIds);
    expect(feed.leftPortIds).toEqual([]);
  });

  it('gives a stub that is perpendicular to the wall and ends inside the room', () => {
    const ring = rectRing(4000, 3000);
    const E = P(0, 1500);
    const feed = roomFeed(feedInput(ring, E, P(-1, 0), [{ id: 'a', point: P(1000, 1000) }]));
    expect(feed.stub).toHaveLength(2);
    expect(feed.stub[0]).toEqual(E);
    expect(feed.stub[1]!.y).toBe(E.y);
    expect(feed.stub[1]!.x).toBeGreaterThan(E.x);
    expect(polygonContains(ring, feed.stub[1]!)).toBe(true);
    expect(feed.junctionMm).toEqual(feed.stub[1]);
  });

  it('reaches all ports with exactRoomSpine when the port count is within exactMaxPorts', () => {
    const ring = rectRing(4000, 3000);
    const E = P(0, 1500);
    const ports = [
      { id: 'a', point: P(1000, 1000) },
      { id: 'b', point: P(3000, 2000) },
      { id: 'c', point: P(2000, 500) },
    ];
    const feed = roomFeed(feedInput(ring, E, P(-1, 0), ports, { exactMaxPorts: 6 }));
    expect(feed.leftPortIds).toEqual([]);
    for (const path of feed.spine) expect(axisAligned(path)).toBe(true);
  });

  it('gives deep-equal output for the same input', () => {
    const ring = lRing();
    const input = feedInput(ring, P(0, 3000), P(-1, 0), [
      { id: 'a', point: P(3000, 500) },
      { id: 'b', point: P(500, 3500) },
    ]);
    expect(roomFeed(input)).toEqual(roomFeed(input));
  });

  it('gives no spine and no left ports for zero ports', () => {
    const ring = rectRing(4000, 3000);
    const feed = roomFeed(feedInput(ring, P(0, 1500), P(-1, 0), []));
    expect(feed.spine).toEqual([]);
    expect(feed.leftPortIds).toEqual([]);
  });

  it('reaches every port of the nine w_rooms-2 rooms in scenario B', () => {
    const drawing = localDrawing('ground-floor-w-rooms-2', 'w_rooms-2');
    const s = drawing ? buildScenario(drawing, 'B', 0) : null;
    if (!drawing || !s) {
      console.log('SKIP w_rooms-2: local fixture or scenario B missing');
      return;
    }
    const { mmPerPt } = drawing;
    console.log(`w_rooms-2 served room ids: ${s.servedRooms.map((r) => r.id).join(' ')}`);
    const areaRoomIds = new Set(s.area.rooms.map((r) => r.roomId));
    const corridorAt = insideRouteArea(drawing.rooms.filter((r) => areaRoomIds.has(r.id)), mmPerPt);
    let checked = 0;
    for (const suffix of FIXTURE_ROOM_SUFFIXES) {
      const room: Room | undefined = s.servedRooms.find((r) => r.id === `room-${suffix}`);
      if (!room) {
        console.log(`SKIP room ending ${suffix}: no served room with that id`);
        continue;
      }
      const terminals = s.stamps.filter((st) => st.id === `term-${room.id}` || st.id.startsWith(`term-${room.id}-`));
      const ports = terminals.map((st) => ({ id: st.id, point: P(st.transform.position.x * mmPerPt, st.transform.position.y * mmPerPt) }));
      const candidates = roomEntryCandidates({
        room, mmPerPt, areaEntries: s.area.entries.filter((e) => e.roomId === room.id), corridorAt,
        portsMm: ports.map((p) => p.point),
      });
      const entry = candidates[0];
      if (!entry) {
        console.log(`SKIP room ${room.id}: no entry candidate`);
        continue;
      }
      const ringMm = room.polygon.outer.map((p) => P(p.x * mmPerPt, p.y * mmPerPt));
      const feed = roomFeed({
        entry, ports, ringMm,
        inside: insideRouteArea([room], mmPerPt),
        roomContains: (p) => roomContainsPoint(room, P(p.x / mmPerPt, p.y / mmPerPt)),
        crossesExisting: noCross,
      });
      console.log(`room ${room.id} entry ${entry.source} ${JSON.stringify(entry.pointMm)} ports ${ports.length} left ${JSON.stringify(feed.leftPortIds)}`);
      expect(feed.leftPortIds, `room ${room.id}`).toEqual([]);
      checked++;
    }
    console.log(`w_rooms-2 checked ${checked} of ${FIXTURE_ROOM_SUFFIXES.length} rooms`);
    expect(checked).toBe(9);
  });
});
