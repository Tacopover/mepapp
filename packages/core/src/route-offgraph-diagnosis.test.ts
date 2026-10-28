// Off-graph room diagnosis (Q13): which served rooms have no way to the corridor graph, and what wall tolerance would give them an entry. Test only, no product change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roomLabelPoint } from './rooms/room.js';
import { DEFAULT_ROUTE_AREA_TYPE_IDS, computeRouteArea } from './route-area.js';
import { planRoute, type RouteBuildInput } from './route-build.js';
import { boundaryGapMm, wallStretch } from './route-wall.js';
import { buildScenario, firstFloorDrawing, localDrawing, makeIdFactories, type Drawing, type Scenario } from './route-scenario.testutil.js';

const OUT_DIR = '/tmp/claude-0/-root-MepApp/0119519d-6cb5-4465-8095-715236bd031d/scratchpad/q13';
const TEST_TIMEOUT = 300000;
const TOLERANCES_MM: (number | undefined)[] = [undefined, 100, 200, 300, 500, 1000];
const WIDE_MM = 3000;

function offGraphIds(s: Scenario, area: Scenario['area']): string[] {
  const ids = makeIdFactories();
  const input: RouteBuildInput = {
    startStampId: s.startStampId,
    startPortId: s.startPortId,
    networkTypeId: s.networkTypeId,
    targetPorts: s.targetPorts,
    state: { stamps: s.stamps, segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: s.drawing.rooms,
    area,
    mmPerPt: s.drawing.mmPerPt,
    pageIndex: s.pageIndex,
    newSegmentId: ids.newSegmentId,
    newFittingId: ids.newFittingId,
  };
  const result = planRoute(input);
  return result.plan.warnings.find((w) => w.code === 'room-off-graph')?.ids ?? [];
}

const SOURCES: { name: string; drawing: Drawing | null }[] = [
  { name: 'first floor', drawing: firstFloorDrawing() },
  { name: 'w_rooms', drawing: localDrawing('ground-floor-w-rooms', 'w_rooms') },
  { name: '10A', drawing: localDrawing('10A-rooms', '10A') },
];

describe('off-graph diagnosis (Q13)', () => {
  for (const source of SOURCES) {
    it.skipIf(source.drawing === null)(`${source.name}: off-graph rooms and wall tolerance`, () => {
      const drawing = source.drawing!;
      const s = buildScenario(drawing, 'A', 0)!;
      const { rooms, mmPerPt } = drawing;
      const byId = new Map(rooms.map((r) => [r.id, r]));
      const lines: string[] = [];
      const typeCount = new Map<string, number>();
      for (const r of rooms) typeCount.set(r.roomTypeId ?? '(none)', (typeCount.get(r.roomTypeId ?? '(none)') ?? 0) + 1);
      lines.push(`== ${source.name}: ${rooms.length} rooms; types ${[...typeCount].map(([k, v]) => `${k}=${v}`).join(', ')}`);

      const areaIds = new Set(s.area.rooms.map((r) => r.roomId));
      const corridorLike = rooms.filter((r) => /corr|hall|gang|hal/i.test(r.roomTypeId ?? ''));
      lines.push(`area rooms ${s.area.rooms.length}; unreached (no entry) ${s.area.unreached.length}; parts ${s.area.parts}`);
      for (const r of corridorLike) {
        lines.push(`  corridor-like ${r.id} "${r.name ?? ''}" type ${r.roomTypeId} in area: ${areaIds.has(r.id)}`);
      }

      const off = offGraphIds(s, s.area);
      const unreachedIds = new Set(s.area.unreached.map((u) => u.roomId));
      const rows: unknown[] = [];
      lines.push(`off graph ${off.length}; of them with no wall entry (unreached) ${off.filter((id) => unreachedIds.has(id)).length}; with entry but disconnected ${off.filter((id) => !unreachedIds.has(id)).length}`);
      for (const id of off) {
        const room = byId.get(id)!;
        let nearest: { id: string; gap: number } | null = null;
        for (const a of s.area.rooms) {
          const gap = boundaryGapMm(room.polygon, byId.get(a.roomId)!.polygon, mmPerPt);
          if (!nearest || gap < nearest.gap) nearest = { id: a.roomId, gap };
        }
        const near = nearest ? byId.get(nearest.id)! : null;
        const wide = near ? wallStretch(room.polygon, near.polygon, mmPerPt, { maxWallMm: WIDE_MM, minWallRunMm: 0 }) : null;
        let anyCorridor: { id: string; gap: number } | null = null;
        for (const c of rooms.filter((r) => r.roomTypeId === 'corridor' && r.id !== id)) {
          const gap = boundaryGapMm(room.polygon, c.polygon, mmPerPt);
          if (!anyCorridor || gap < anyCorridor.gap) anyCorridor = { id: c.id, gap };
        }
        const c = roomLabelPoint(room);
        const row = {
          id,
          name: room.name,
          typeId: room.roomTypeId ?? null,
          centreMm: [Math.round(c.x * mmPerPt), Math.round(c.y * mmPerPt)],
          hasEntry: !unreachedIds.has(id),
          nearestAreaId: near?.id ?? null,
          nearestAreaName: near?.name ?? null,
          nearestAreaType: near?.roomTypeId ?? null,
          gapMm: nearest ? Math.round(nearest.gap) : null,
          overlapMm: wide ? Math.round(wide.runMm) : null,
          overlapGapMm: wide ? Math.round(wide.gapMm) : null,
          nearestCorridorTypeId: anyCorridor?.id ?? null,
          nearestCorridorTypeGapMm: anyCorridor ? Math.round(anyCorridor.gap) : null,
        };
        rows.push(row);
        lines.push(JSON.stringify(row));
      }

      const tol: Record<string, { unreached: number; offGraph: number }> = {};
      for (const t of TOLERANCES_MM) {
        const area = computeRouteArea(rooms, {
          roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS,
          mmPerPt,
          pageIndex: s.pageIndex,
          ...(t !== undefined ? { maxWallMm: t } : {}),
        });
        const count = offGraphIds(s, area).length;
        tol[t === undefined ? 'default(600)' : String(t)] = { unreached: area.unreached.length, offGraph: count };
        lines.push(`maxWallMm ${t ?? 'default 600'}: no-entry rooms ${area.unreached.length}, off-graph rooms ${count}, parts ${area.parts}`);
      }

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(`${OUT_DIR}/${source.name.replace(/\s+/g, '_')}.json`, JSON.stringify({ rows, tol, areaIds: [...areaIds], off }, null, 1));
      console.log(lines.join('\n'));
      expect(off.length).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);
  }
});
