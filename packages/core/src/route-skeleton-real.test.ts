import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { loadFirstFloorRooms } from './rooms/route-area-fixture.testutil.js';
import { polygonContainsPoint } from './rooms/room.js';
import type { RoomPolygon } from './rooms/types.js';
import { centerLineOf } from './route-skeleton.js';

// Measured on the first floor fixture with the default 100 mm pixel (nodes, edges, length mm, halfWidthMm):
// room-0: 2 nodes, 1 edge, 5190 mm, 1400.0 mm
// room-27: 2 nodes, 1 edge, 4008 mm, 800.0 mm
// room-31: 4 nodes, 3 edges, 13315 mm, 900.0 mm
// room-32: 2 nodes, 1 edge, 6500 mm, 1200.0 mm
// room-36: 2 nodes, 1 edge, 11740 mm, 450.0 mm
// The 25 % rule uses one half-width per room. A notch tip (room-32) and a 176 mm neck (room-36) are narrower than that,
// so their points fail the 25 % rule. Those points are still inside the room and at least 40 mm from its walls.

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Distance in pt from p to the nearest edge of the outer ring or of a hole.
function distanceToBoundary(p: Vec2, polygon: RoomPolygon): number {
  let best = Infinity;
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const d = segmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!);
      if (d < best) best = d;
    }
  }
  return best;
}

describe('centerLineOf on the corridors of the first floor', () => {
  it('gives a center line inside each corridor, at least 40 mm from its walls, with 85 % of the vertices at 25 % of the half-width', () => {
    const { mmPerPt, rooms } = loadFirstFloorRooms();
    const corridors = rooms.filter((r) => r.roomTypeId === 'corridor');
    expect(corridors).toHaveLength(5);

    const start = performance.now();
    const vertices: { corridor: string; index: number; wallMm: number; needMm: number }[] = [];
    for (const room of corridors) {
      const cl = centerLineOf(room.polygon, mmPerPt);
      let lengthMm = 0;
      for (const e of cl.edges) {
        for (let i = 1; i < e.points.length; i++) {
          lengthMm += Math.hypot(e.points[i]!.x - e.points[i - 1]!.x, e.points[i]!.y - e.points[i - 1]!.y) * mmPerPt;
        }
      }
      console.log(
        `corridor ${room.id}: nodes ${cl.nodes.length}, edges ${cl.edges.length}, length ${Math.round(lengthMm)} mm, halfWidthMm ${cl.halfWidthMm.toFixed(1)}`,
      );
      expect(cl.edges.length, `corridor ${room.id} edges`).toBeGreaterThanOrEqual(1);
      const points: Vec2[] = [...cl.nodes.map((n) => n.point), ...cl.edges.flatMap((e) => e.points)];
      for (const p of points) {
        expect(polygonContainsPoint(room.polygon, p), `corridor ${room.id} point ${p.x},${p.y} inside`).toBe(true);
        const wall = distanceToBoundary(p, room.polygon) * mmPerPt;
        expect(wall, `corridor ${room.id} point ${p.x},${p.y} wall distance`).toBeGreaterThanOrEqual(40);
      }
      cl.edges.forEach((e) =>
        e.points.forEach((p, index) => {
          vertices.push({
            corridor: room.id,
            index,
            wallMm: distanceToBoundary(p, room.polygon) * mmPerPt,
            needMm: 0.25 * cl.halfWidthMm,
          });
        }),
      );
    }
    const elapsed = performance.now() - start;
    console.log(`corridors total ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(1000);

    const failing = vertices.filter((v) => v.wallMm < v.needMm);
    for (const v of failing) {
      console.log(
        `below 25 % rule: corridor ${v.corridor}, vertex ${v.index}, wall ${v.wallMm.toFixed(1)} mm, need ${v.needMm.toFixed(1)} mm`,
      );
    }
    console.log(`vertices at 25 % rule: ${vertices.length - failing.length} of ${vertices.length}`);
    expect((vertices.length - failing.length) / vertices.length).toBeGreaterThanOrEqual(0.85);
  });
});
