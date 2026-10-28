import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomContainsPoint } from './rooms/room.js';
import { dist } from './route-feed-helpers.js';
import { manualScenario } from './route-scenario.testutil.js';
import { roomDoorRuns, wallStretches, type RoomDoorRunsInput, type WallStretch } from './route-room-doors.js';

const ROOM_IDS = ['room-5', 'room-24', 'room-20', 'room-22', 'room-26', 'room-31', 'room-29', 'room-7', 'room-8', 'room-9'];
const TOLERANCES_MM = [100, 300, 500];
const ROW_TOLERANCE_MM = 300;
const HOLE_CLUSTER_MM = 300;
const BEND_SIN = 0.01;

const fmt = (p: Vec2): string => `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;

const avg = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

const axisOfVector = (v: Vec2): 'x' | 'y' => (Math.abs(v.x) >= Math.abs(v.y) ? 'x' : 'y');

// Sorted values; a new group starts when the gap to the previous value is larger than tol.
const groupSizes = (values: number[], tol: number): number[] => {
  const sorted = [...values].sort((a, b) => a - b);
  const sizes: number[] = [];
  let size = 0;
  sorted.forEach((v, i) => {
    if (i > 0 && v - sorted[i - 1]! > tol) {
      sizes.push(size);
      size = 0;
    }
    size++;
  });
  if (size > 0) sizes.push(size);
  return sizes.sort((a, b) => a - b);
};

const segmentCrossing = (p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null => {
  const rx = r.x - p.x;
  const ry = r.y - p.y;
  const sx = s.x - q.x;
  const sy = s.y - q.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
  const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p.x + t * rx, y: p.y + t * ry };
};

const fractionOn = (st: WallStretch, p: Vec2): number => {
  const len = dist(st.a, st.b);
  const proj = ((p.x - st.a.x) * (st.b.x - st.a.x) + (p.y - st.a.y) * (st.b.y - st.a.y)) / len;
  return (proj - st.loMm) / (st.hiMm - st.loMm);
};

describe('two-level rooms report on the manual fixture', () => {
  it('prints the hand route measurement per room', () => {
    const fixture = manualScenario();
    if (fixture === null) return;
    const { scenario: s, manual } = fixture;
    const { mmPerPt } = s.drawing;
    const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });
    const toPt = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
    const areaIds = new Set(s.area.rooms.map((a) => a.roomId));
    const areaRoomObjects = s.drawing.rooms.filter((r) => areaIds.has(r.id));
    const corridorAt = (p: Vec2): boolean => areaRoomObjects.some((r) => roomContainsPoint(r, toPt(p)));
    const otherRoomFor =
      (room: { id: string }) =>
      (p: Vec2): boolean =>
        s.drawing.rooms.some((r) => r.id !== room.id && !areaIds.has(r.id) && roomContainsPoint(r, toPt(p)));
    const handLengthMm = (room: { id: string; polygon: { outer: Vec2[]; holes: Vec2[][] } }): number => {
      let sum = 0;
      for (const path of manual.room) {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          if (roomContainsPoint(room, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) sum += dist(a, b) * mmPerPt;
        }
      }
      return sum;
    };

    const summary: string[] = [];
    for (const id of ROOM_IDS) {
      const room = s.drawing.rooms.find((r) => r.id === id);
      if (!room) {
        console.log(`P2 T09 measurement ${id}\nnot in the fixture`);
        summary.push(`${id}: not in the fixture`);
        continue;
      }
      const lines: string[] = [`P2 T09 measurement ${id} (${room.number ?? '-'})`];

      const terminals = s.targetPorts
        .filter((p) => p.roomId === room.id)
        .map((p) => ({ id: `${p.stampId}/${p.portId}`, mm: toMm(p.world) }))
        .sort((a, b) => a.mm.x - b.mm.x || a.mm.y - b.mm.y);
      lines.push(`terminals ${terminals.length}`);
      for (const t of terminals) lines.push(`  ${t.id} ${fmt(t.mm)} mm`);

      const input: RoomDoorRunsInput = {
        room,
        mmPerPt,
        corridorAt,
        otherRoomAt: otherRoomFor(room),
        portsMm: terminals.map((t) => t.mm),
        ports: terminals.map((t) => ({ id: t.id, point: t.mm })),
        blockers: [],
        clearanceMm: 150,
        doorMarginMm: 200,
      };

      const stretches = wallStretches(input);
      for (const st of stretches) {
        lines.push(
          `wall edge ${st.edgeIndex}: wall along ${axisOfVector({ x: st.b.x - st.a.x, y: st.b.y - st.a.y })}, outward (${st.outward.x}, ${st.outward.y}), lo ${st.loMm.toFixed(0)}, hi ${st.hiMm.toFixed(0)}, thickness ${st.thicknessMm.toFixed(0)} mm`,
        );
      }
      if (stretches.length === 0) lines.push('wall: no stretch');

      const xs = terminals.map((t) => t.mm.x);
      const ys = terminals.map((t) => t.mm.y);
      for (const tol of TOLERANCES_MM) {
        const gx = groupSizes(xs, tol);
        const gy = groupSizes(ys, tol);
        lines.push(`groups at ${tol} mm: x ${gx.length} [${gx.join(', ')}], y ${gy.length} [${gy.join(', ')}]`);
      }
      const gx = groupSizes(xs, ROW_TOLERANCE_MM);
      const gy = groupSizes(ys, ROW_TOLERANCE_MM);
      const rowsAxis: 'x' | 'y' | 'ambiguous' = gy.length < gx.length ? 'x' : gy.length > gx.length ? 'y' : 'ambiguous';
      const rowsLabel = rowsAxis === 'ambiguous' ? 'rows ambiguous' : `rows along ${rowsAxis}`;
      lines.push(`rows axis at ${ROW_TOLERANCE_MM} mm: ${rowsLabel}`);

      const runs = roomDoorRuns(input);
      const first = runs[0];
      const firstStretch = first ? stretches.find((st) => st.edgeIndex === first.edgeIndex) : undefined;
      let relation: string;
      if (!first) relation = 'no door';
      else if (!firstStretch) relation = 'no stretch';
      else if (rowsAxis === 'ambiguous') relation = 'rows ambiguous, relation not defined';
      else
        relation =
          axisOfVector({ x: firstStretch.b.x - firstStretch.a.x, y: firstStretch.b.y - firstStretch.a.y }) === rowsAxis
            ? 'wall parallel to rows'
            : 'wall perpendicular to rows';
      lines.push(`wall relation: ${relation}`);

      const ringMm = room.polygon.outer.map(toMm);
      const crossings: { p: Vec2; edgeIndex: number }[] = [];
      for (const path of manual.room) {
        for (let i = 1; i < path.length; i++) {
          const a = toMm(path[i - 1]!);
          const b = toMm(path[i]!);
          for (let e = 0; e < ringMm.length; e++) {
            const p = segmentCrossing(a, b, ringMm[e]!, ringMm[(e + 1) % ringMm.length]!);
            if (p) crossings.push({ p, edgeIndex: e });
          }
        }
      }
      const clusters: { p: Vec2; edgeIndex: number }[][] = [];
      for (const c of crossings) {
        const hit = clusters.find((k) => dist(k[0]!.p, c.p) <= HOLE_CLUSTER_MM);
        if (hit) hit.push(c);
        else clusters.push([c]);
      }
      const holes = clusters.map((k) => ({
        at: { x: avg(k.map((q) => q.p.x)), y: avg(k.map((q) => q.p.y)) },
        edgeIndex: k[0]!.edgeIndex,
      }));
      lines.push(`holes of the hand route: ${holes.length}`);
      holes.forEach((h, k) => {
        const st = stretches.find((x) => x.edgeIndex === h.edgeIndex);
        const fraction = st ? fractionOn(st, h.at).toFixed(2) : '-';
        const count = terminals.filter((t) => {
          let best = -1;
          let bestDist = Infinity;
          holes.forEach((other, j) => {
            const d = dist(other.at, t.mm);
            if (d < bestDist) {
              bestDist = d;
              best = j;
            }
          });
          return best === k;
        }).length;
        lines.push(
          `  hole ${k + 1} at ${fmt(h.at)} mm, edge ${h.edgeIndex}, fraction ${fraction}, terminals ${count} (by straight distance)`,
        );
      });

      const inside = (a: Vec2, b: Vec2): boolean => roomContainsPoint(room, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      let bends = 0;
      for (const path of manual.room) {
        for (let i = 2; i < path.length; i++) {
          const a = path[i - 2]!;
          const b = path[i - 1]!;
          const c = path[i]!;
          if (!inside(a, b) || !inside(b, c)) continue;
          const ux = b.x - a.x;
          const uy = b.y - a.y;
          const vx = c.x - b.x;
          const vy = c.y - b.y;
          const lu = Math.hypot(ux, uy);
          const lv = Math.hypot(vx, vy);
          if (lu === 0 || lv === 0) continue;
          if (Math.abs((ux * vy - uy * vx) / (lu * lv)) > BEND_SIN) bends++;
        }
      }
      lines.push(`hand route inside the room ${(handLengthMm(room) / 1000).toFixed(2)} m, bends ${bends}`);

      console.log(lines.join('\n'));
      summary.push(
        `${id} (${room.number ?? '-'}): terminals ${terminals.length}, ${rowsLabel}, ${relation}, holes of the hand route ${holes.length}, groups at ${ROW_TOLERANCE_MM} mm x [${gx.join(', ')}] y [${gy.join(', ')}]`,
      );
    }
    console.log(['P2 T09 summary', ...summary].join('\n'));

    expect(s.servedRooms.length).toBeGreaterThan(0);
  }, 120000);
});
