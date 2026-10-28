// route room origin report (P1-T16): where do chained rooms, multi-entry rooms and long diagonals come from, and how many rooms have a clear way. Test only, no product change.
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomsAtPoint, type Room } from './rooms/room.js';
import type { PlannedRoute, RouteBuildInput, RouteLegOrigin, RouteTrace } from './route-build.js';
import { planRoute } from './route-build.js';
import { crossingsAlongPath } from './route-crossings.js';
import { legClass } from './route-layout.js';
import { ENTRY_CLUSTER_MM, LONG_DIAGONAL_MM, routeMetrics, type RouteMetrics } from './route-metrics.js';
import { ORIGINS } from './route-origin.js';
import {
  buildScenario,
  firstFloorDrawing,
  localDrawing,
  makeIdFactories,
  type Drawing,
  type Scenario,
  type ScenarioKind,
} from './route-scenario.testutil.js';

const LOCAL_FIXTURES = [
  { file: 'ground-floor-w-rooms', name: 'w_rooms' },
  { file: 'ground-floor-w-rooms-2', name: 'w_rooms-2' },
  { file: '10A-rooms', name: '10A' },
];
const TEST_TIMEOUT = 300000;
const STEP_MM = 100;
const PROBE_MM = 300;
const END_SKIP_MM = 350;
const CANDIDATE_STEP_MM = 500;
const SEARCH_MM = 20000;
const NEAREST_TAPS = 10;
const CELL_MM = 50;

const STOP_LINK_SHARE = 0.5;
const STOP_S = 0.3;

interface Source { name: string; drawing: Drawing | null }

interface Item { roomId: string; kind: 'chained' | 'multi'; origins: Record<RouteLegOrigin, number>; dominant: RouteLegOrigin; otherRoomId: string | null }
interface DiagonalLeg { origin: RouteLegOrigin; lengthMm: number }
interface RoomWay { roomId: string; ports: number; real: boolean; synthetic: number; clear: boolean }

interface Row {
  source: string;
  kind: ScenarioKind;
  servedRooms: number;
  trunkServed: number;
  offGraph: number;
  offGraphWithEntry: number;
  offGraphWithSynthetic: number;
  offGraphClear: number;
  unreachedCount: number;
  unreachedNull: number;
  unreachedDistances: number[];
  chainedMine: number;
  chainedMetric: number;
  multiMine: number;
  multiMetric: number;
  items: Item[];
  diagonals: DiagonalLeg[];
  longDiagonalMetric: number;
  denominator: number;
  denominatorSum: number;
  clearInDenominator: number;
  noCandidateInDenominator: number;
  s: number | null;
  linkShare: number | null;
  linkShareAny: number | null;
  chainedWays: { roomId: string; other: string | null; dominant: RouteLegOrigin; clear: boolean }[];
}

const ROWS: Row[] = [];

function loadSources(): Source[] {
  const sources: Source[] = [{ name: 'first floor', drawing: firstFloorDrawing() }];
  for (const spec of LOCAL_FIXTURES) {
    let drawing: Drawing | null = null;
    let loadError: string | null = null;
    try {
      drawing = localDrawing(spec.file, spec.name);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
    const path = fileURLToPath(new URL(`../fixtures/route-area/local/${spec.file}.json`, import.meta.url));
    if (loadError !== null) console.log(`SKIP ${spec.name}: local fixture ${path} cannot be read: ${loadError}`);
    else if (drawing === null) console.log(`SKIP ${spec.name}: local fixture ${path} missing`);
    sources.push({ name: spec.name, drawing });
  }
  return sources;
}

function planWith(s: Scenario, trace?: RouteTrace): { status: 'ok' | 'refused'; plan: PlannedRoute } {
  const ids = makeIdFactories();
  const input: RouteBuildInput = {
    startStampId: s.startStampId,
    startPortId: s.startPortId,
    networkTypeId: s.networkTypeId,
    targetPorts: s.targetPorts,
    state: { stamps: s.stamps, segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt: s.drawing.mmPerPt,
    pageIndex: s.pageIndex,
    newSegmentId: ids.newSegmentId,
    newFittingId: ids.newFittingId,
  };
  return planRoute(input, undefined, trace);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToLeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function emptyOrigins(): Record<RouteLegOrigin, number> {
  return { trunk: 0, bridge: 0, branch: 0, spine: 0, link: 0 };
}

function dominantOf(counts: Record<RouteLegOrigin, number>): RouteLegOrigin {
  let best: RouteLegOrigin = 'trunk';
  let bestCount = -1;
  for (const origin of ORIGINS) {
    if (counts[origin] > bestCount) {
      best = origin;
      bestCount = counts[origin];
    }
  }
  return best;
}

function analyse(sourceName: string, s: Scenario): Row {
  const drawing = s.drawing;
  const { mmPerPt, rooms } = drawing;
  const trace: RouteTrace = { paths: [] };
  const result = planWith(s, trace);
  expect(result.status, `${sourceName} ${s.kind} status`).toBe('ok');
  expect(trace.paths.length, `${sourceName} ${s.kind} trace`).toBeGreaterThan(0);
  const plan = result.plan;
  const metrics: RouteMetrics = routeMetrics({
    plan, rooms, area: s.area, mmPerPt, pageIndex: s.pageIndex, startStampId: s.startStampId, startPortId: s.startPortId,
  });

  const areaRoomIds = new Set(s.area.rooms.map((r) => r.roomId));
  const roomById = new Map(rooms.map((r) => [r.id, r] as const));
  const toPage = (p: Vec2): Vec2 => ({ x: p.x / mmPerPt, y: p.y / mmPerPt });
  const toMm = (p: Vec2): Vec2 => ({ x: p.x * mmPerPt, y: p.y * mmPerPt });

  const cache = new Map<string, string | null>();
  const roomIdAtMm = (p: Vec2): string | null => {
    const key = `${Math.round(p.x / CELL_MM)},${Math.round(p.y / CELL_MM)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const id = roomsAtPoint(rooms, toPage(p), s.pageIndex)[0]?.id ?? null;
    cache.set(key, id);
    return id;
  };
  const isServed = (id: string | null): id is string => id !== null && !areaRoomIds.has(id);

  const offGraphIds = new Set(plan.warnings.find((w) => w.code === 'room-off-graph')?.ids ?? []);
  const portsByRoom = new Map<string, number>();
  for (const port of s.targetPorts) {
    if (port.roomId === null || areaRoomIds.has(port.roomId)) continue;
    portsByRoom.set(port.roomId, (portsByRoom.get(port.roomId) ?? 0) + 1);
  }
  const servedWithPorts = [...portsByRoom.keys()];
  const trunkServed = servedWithPorts.filter((id) => !offGraphIds.has(id)).length;

  const originAt = (pointMm: Vec2): RouteLegOrigin => {
    let best: RouteLegOrigin = 'link';
    let bestD = Infinity;
    for (const entry of trace.paths) {
      for (let i = 1; i < entry.path.length; i++) {
        const d = distanceToLeg(pointMm, entry.path[i - 1]!, entry.path[i]!);
        if (d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && ORIGINS.indexOf(entry.origin) < ORIGINS.indexOf(best))) {
          bestD = d;
          best = entry.origin;
        }
      }
    }
    return best;
  };

  // chained rooms and multi-entry rooms, per segment as routeMetrics does, with the origin of each event
  const chained = new Map<string, { origins: Record<RouteLegOrigin, number>; other: string | null }>();
  const entries = new Map<string, { point: Vec2; origin: RouteLegOrigin }[]>();
  const stepPt = STEP_MM / mmPerPt;
  for (const segment of plan.segments) {
    const path = segment.geometry;
    for (const crossing of crossingsAlongPath(rooms, path, { mmPerPt, pageIndex: s.pageIndex }).crossings) {
      if (isServed(crossing.fromRoomId) && isServed(crossing.toRoomId) && crossing.fromRoomId !== crossing.toRoomId) {
        const origin = originAt(toMm(crossing.point));
        const record = chained.get(crossing.toRoomId) ?? { origins: emptyOrigins(), other: crossing.fromRoomId };
        record.origins[origin]++;
        chained.set(crossing.toRoomId, record);
      }
    }
    let previous: string | null = null;
    let havePrevious = false;
    const sample = (p: Vec2): void => {
      const roomId = roomsAtPoint(rooms, p, s.pageIndex)[0]?.id ?? null;
      if (isServed(roomId) && roomId !== previous && havePrevious) {
        const list = entries.get(roomId) ?? [];
        list.push({ point: p, origin: originAt(toMm(p)) });
        entries.set(roomId, list);
      }
      previous = roomId;
      havePrevious = true;
    };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepPt));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) sample({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  const multi = new Map<string, Record<RouteLegOrigin, number>>();
  for (const [roomId, points] of entries) {
    const clusters: Vec2[] = [];
    for (const e of points) {
      if (!clusters.some((c) => dist(c, e.point) * mmPerPt < ENTRY_CLUSTER_MM)) clusters.push(e.point);
    }
    if (clusters.length > 1) {
      const counts = emptyOrigins();
      for (const e of points) counts[e.origin]++;
      multi.set(roomId, counts);
    }
  }

  const items: Item[] = [];
  for (const [roomId, record] of chained) items.push({ roomId, kind: 'chained', origins: record.origins, dominant: dominantOf(record.origins), otherRoomId: record.other });
  for (const [roomId, counts] of multi) items.push({ roomId, kind: 'multi', origins: counts, dominant: dominantOf(counts), otherRoomId: null });

  // long diagonals, by the origin of the trace path
  const diagonals: DiagonalLeg[] = [];
  for (const entry of trace.paths) {
    for (let i = 1; i < entry.path.length; i++) {
      const a = entry.path[i - 1]!;
      const b = entry.path[i]!;
      if (legClass(a, b) !== 'diagonal') continue;
      const lengthMm = dist(a, b);
      if (lengthMm > LONG_DIAGONAL_MM) diagonals.push({ origin: entry.origin, lengthMm });
    }
  }

  // carriers: trunk and bridge paths (mm)
  const carrierLegs: [Vec2, Vec2][] = [];
  const carrierSamples: Vec2[] = [];
  for (const entry of trace.paths) {
    if (entry.origin !== 'trunk' && entry.origin !== 'bridge') continue;
    for (let i = 1; i < entry.path.length; i++) {
      const a = entry.path[i - 1]!;
      const b = entry.path[i]!;
      carrierLegs.push([a, b]);
      const len = dist(a, b);
      const n = Math.max(1, Math.ceil(len / CANDIDATE_STEP_MM));
      for (let k = 0; k <= n; k++) carrierSamples.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }

  const pathIsClear = (path: readonly Vec2[], end: Vec2): boolean => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const len = dist(a, b);
      const n = Math.max(1, Math.ceil(len / STEP_MM));
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
        if (dist(p, end) <= END_SKIP_MM) continue;
        if (isServed(roomIdAtMm(p))) return false;
      }
    }
    return true;
  };

  const syntheticCandidates = (room: Room): Vec2[] => {
    const outer = room.polygon.outer;
    const out: Vec2[] = [];
    const terminals = s.targetPorts.filter((p) => p.roomId === room.id).map((p) => toMm(p.world));
    const consider = (wallMm: Vec2, a: Vec2, b: Vec2): void => {
      const ex = (b.x - a.x) * mmPerPt;
      const ey = (b.y - a.y) * mmPerPt;
      const len = Math.hypot(ex, ey);
      if (len === 0) return;
      const nx = -ey / len;
      const ny = ex / len;
      for (const sign of [1, -1]) {
        const probe = { x: wallMm.x + sign * nx * PROBE_MM, y: wallMm.y + sign * ny * PROBE_MM };
        const id = roomIdAtMm(probe);
        if (id === room.id) continue;
        if (id !== null && areaRoomIds.has(id)) out.push(wallMm);
        return;
      }
    };
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i]!;
      const b = outer[(i + 1) % outer.length]!;
      const lenMm = dist(a, b) * mmPerPt;
      const n = Math.max(1, Math.floor(lenMm / CANDIDATE_STEP_MM));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        consider(toMm({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), a, b);
      }
      for (const term of terminals) {
        const tp = toPage(term);
        if (b.x !== a.x) {
          const t = (tp.x - a.x) / (b.x - a.x);
          if (t >= 0 && t <= 1) consider(toMm({ x: tp.x, y: a.y + (b.y - a.y) * t }), a, b);
        }
        if (b.y !== a.y) {
          const t = (tp.y - a.y) / (b.y - a.y);
          if (t >= 0 && t <= 1) consider(toMm({ x: a.x + (b.x - a.x) * t, y: tp.y }), a, b);
        }
      }
    }
    return out;
  };

  const hasClearWay = (endMm: Vec2): boolean => {
    const taps: Vec2[][] = [];
    for (const [a, b] of carrierLegs) {
      if (Math.abs(a.y - b.y) < 1 && endMm.x >= Math.min(a.x, b.x) && endMm.x <= Math.max(a.x, b.x)) taps.push([{ x: endMm.x, y: a.y }, endMm]);
      else if (Math.abs(a.x - b.x) < 1 && endMm.y >= Math.min(a.y, b.y) && endMm.y <= Math.max(a.y, b.y)) taps.push([{ x: a.x, y: endMm.y }, endMm]);
    }
    taps.sort((p, q) => dist(p[0]!, endMm) - dist(q[0]!, endMm));
    for (const path of taps.slice(0, NEAREST_TAPS)) {
      if (dist(path[0]!, endMm) <= SEARCH_MM && pathIsClear(path, endMm)) return true;
    }
    const near = carrierSamples
      .filter((p) => Math.abs(p.x - endMm.x) + Math.abs(p.y - endMm.y) <= SEARCH_MM)
      .sort((p, q) => Math.abs(p.x - endMm.x) + Math.abs(p.y - endMm.y) - (Math.abs(q.x - endMm.x) + Math.abs(q.y - endMm.y)))
      .slice(0, NEAREST_TAPS * 3);
    for (const tap of near) {
      for (const corner of [{ x: tap.x, y: endMm.y }, { x: endMm.x, y: tap.y }]) {
        if (pathIsClear([tap, corner, endMm], endMm)) return true;
      }
    }
    return false;
  };

  const ways = new Map<string, RoomWay>();
  const wayOf = (roomId: string): RoomWay => {
    const known = ways.get(roomId);
    if (known) return known;
    const room = roomById.get(roomId);
    const real = s.area.entries.filter((e) => e.roomId === roomId).map((e) => toMm(e.point));
    const synthetic = room ? syntheticCandidates(room) : [];
    const candidates = real.length > 0 ? real : synthetic;
    const way: RoomWay = { roomId, ports: portsByRoom.get(roomId) ?? 0, real: real.length > 0, synthetic: synthetic.length, clear: candidates.some(hasClearWay) };
    ways.set(roomId, way);
    return way;
  };

  const offGraphList = [...offGraphIds];
  const offGraphWays = offGraphList.map(wayOf);
  const multiPortOff = offGraphWays.filter((w) => w.ports >= 2).map((w) => w.roomId);
  const union = new Set<string>([...chained.keys(), ...multi.keys(), ...multiPortOff]);
  const clearInUnion = [...union].filter((id) => wayOf(id).clear).length;
  const denominatorSum = chained.size + multi.size + multiPortOff.length;

  const linkItems = items.filter((i) => i.dominant === 'link').length;
  const linkAny = items.filter((i) => i.origins.link > 0).length;

  return {
    source: sourceName,
    kind: s.kind,
    servedRooms: servedWithPorts.length,
    trunkServed,
    offGraph: offGraphList.length,
    offGraphWithEntry: offGraphWays.filter((w) => w.real).length,
    offGraphWithSynthetic: offGraphWays.filter((w) => w.synthetic > 0).length,
    offGraphClear: offGraphWays.filter((w) => w.clear).length,
    unreachedCount: s.area.unreached.length,
    unreachedNull: s.area.unreached.filter((u) => u.distanceMm === null).length,
    unreachedDistances: s.area.unreached.map((u) => u.distanceMm).filter((d): d is number => d !== null).sort((a, b) => a - b),
    chainedMine: chained.size,
    chainedMetric: metrics.chainedRooms,
    multiMine: multi.size,
    multiMetric: metrics.multiEntryRooms,
    items,
    diagonals,
    longDiagonalMetric: metrics.longDiagonalLegs,
    denominator: union.size,
    denominatorSum,
    clearInDenominator: clearInUnion,
    noCandidateInDenominator: [...union].filter((id) => !wayOf(id).real && wayOf(id).synthetic === 0).length,
    s: union.size > 0 ? clearInUnion / union.size : null,
    linkShare: items.length > 0 ? linkItems / items.length : null,
    linkShareAny: items.length > 0 ? linkAny / items.length : null,
    chainedWays: items.filter((i) => i.kind === 'chained').map((i) => ({ roomId: i.roomId, other: i.otherRoomId, dominant: i.dominant, clear: wayOf(i.roomId).clear })),
  };
}

function originCounts(items: readonly Item[], kind: Item['kind']): string {
  const counts = emptyOrigins();
  for (const item of items) if (item.kind === kind) counts[item.dominant]++;
  return ORIGINS.map((o) => `${o} ${counts[o]}`).join(', ');
}

function diagonalCounts(diagonals: readonly DiagonalLeg[]): string {
  const counts = emptyOrigins();
  for (const d of diagonals) counts[d.origin]++;
  return ORIGINS.map((o) => `${o} ${counts[o]}`).join(', ');
}

function fixed(n: number | null): string {
  return n === null ? 'n/a' : n.toFixed(2);
}

function describeRow(row: Row): string[] {
  const distances = row.unreachedDistances;
  const median = distances.length > 0 ? distances[Math.floor(distances.length / 2)]! : 0;
  const maxDistance = distances.length > 0 ? distances[distances.length - 1]! : 0;
  return [
    `== ${row.source} ${row.kind} start 0 ==`,
    `served rooms ${row.servedRooms}; trunk-served ${row.trunkServed}; off graph ${row.offGraph} (with real entry ${row.offGraphWithEntry}, with synthetic candidate ${row.offGraphWithSynthetic}, with clear axis path ${row.offGraphClear})`,
    `area.unreached ${row.unreachedCount} (no route-area room on page ${row.unreachedNull}); distance mm median ${median}, max ${maxDistance}; all ${distances.join(' ')}`,
    `chained rooms ${row.chainedMine} (metric ${row.chainedMetric}); by dominant origin: ${originCounts(row.items, 'chained')}`,
    `multi-entry rooms ${row.multiMine} (metric ${row.multiMetric}); by dominant origin: ${originCounts(row.items, 'multi')}`,
    `long diagonal legs ${row.diagonals.length} (metric ${row.longDiagonalMetric}); by origin: ${diagonalCounts(row.diagonals)}`,
    `items with a link leg ${fixed(row.linkShareAny)}; items with dominant origin link ${fixed(row.linkShare)}`,
    `S = ${row.clearInDenominator} / ${row.denominator} = ${fixed(row.s)} (sum form of the denominator: ${row.denominatorSum}); rooms of the denominator with no real and no synthetic entry: ${row.noCandidateInDenominator}`,
    ...row.chainedWays.map((w) => `  chained ${w.roomId} via ${w.other}: origin ${w.dominant}, clear way ${w.clear ? 'yes' : 'no'}`),
  ];
}

describe('route room origin report (P1-T16)', () => {
  const sources = loadSources();

  for (const source of sources) {
    for (const kind of ['A', 'B'] as const) {
      it.skipIf(source.drawing === null)(`${source.name} ${kind}: origin of chained rooms, multi-entry rooms and long diagonals`, () => {
        const drawing = source.drawing;
        if (drawing === null) return;
        const s = buildScenario(drawing, kind, 0);
        if (s === null) {
          console.log(`SKIP ${source.name} ${kind} start 0: no path room`);
          return;
        }
        ROWS.push(analyse(source.name, s));
      }, TEST_TIMEOUT);
    }
  }

  afterAll(() => {
    for (const row of ROWS) console.log(describeRow(row).join('\n'));
    for (const row of ROWS) {
      console.log(`RULE ${row.source} ${row.kind}: link share (dominant) ${fixed(row.linkShare)} vs ${STOP_LINK_SHARE}; S ${fixed(row.s)} vs ${STOP_S}`);
    }
  });
});
