// Test helper: the route scenarios of the route quality report (route-quality.test.ts). Excluded from the build, see tsconfig.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConnectionPoint } from './network.js';
import { layoutGrid } from './rooms/placement-layout.js';
import { polygonAreaPt2, roomLabelPoint, type Room } from './rooms/room.js';
import { loadFirstFloorRooms } from './rooms/route-area-fixture.testutil.js';
import { DEFAULT_ROUTE_AREA_TYPE_IDS, computeRouteArea, type RouteArea } from './route-area.js';
import { planRoute, type PlannedRoute, type RouteBuildInput, type RouteTrace } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { routeMetrics, scoreRoute, type RouteMetrics } from './route-metrics.js';
import { findRoutePorts, type RoutePort, type RouteStamp } from './route-ports.js';

const TYPE = 'supply-air';
const START_ID = 'start-ahu';
const LOCAL_DIR = fileURLToPath(new URL('../fixtures/route-area/local/', import.meta.url));

export interface Drawing { name: string; mmPerPt: number; rooms: Room[] }

export function firstFloorDrawing(): Drawing {
  const { mmPerPt, rooms } = loadFirstFloorRooms();
  return { name: 'first floor', mmPerPt, rooms };
}

export function localDrawing(file: string, name: string): Drawing | null {
  const path = `${LOCAL_DIR}${file}.json`;
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, 'utf8')) as { mmPerPt: number; rooms: Room[] };
  return { name, mmPerPt: data.mmPerPt, rooms: data.rooms };
}

export function makeIdFactories(): { newSegmentId: () => string; newFittingId: () => string } {
  let counter = 0;
  return {
    newSegmentId: () => `n-s${counter++}`,
    newFittingId: () => `n-f${counter++}`,
  };
}

export type ScenarioKind = 'A' | 'B';

export interface Scenario {
  drawing: Drawing;
  kind: ScenarioKind;
  pageIndex: number;
  area: RouteArea;
  startRoom: Room;
  servedRooms: Room[];
  stamps: RouteStamp[];
  targetPorts: RoutePort[];
  startStampId: string;
  startPortId: string;
  networkTypeId: string;
}

function pointStamp(id: string, category: RouteStamp['category'], portId: string, at: { x: number; y: number }, routingTargets?: Record<string, string>): RouteStamp {
  return {
    id,
    category,
    transform: { position: { x: at.x, y: at.y }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 20,
    nativeHeight: 20,
    ports: [{ id: portId, name: portId, fractionX: 0.5, fractionY: 0.5 }],
    ...(routingTargets ? { routingTargets } : {}),
  };
}

export function buildScenario(drawing: Drawing, kind: ScenarioKind, startIndex = 0): Scenario | null {
  const { rooms, mmPerPt } = drawing;
  const pageIndex = rooms[0]?.pageIndex ?? 0;
  const area = computeRouteArea(rooms, { roomTypeIds: DEFAULT_ROUTE_AREA_TYPE_IDS, mmPerPt, pageIndex });
  const areaRoomIds = new Set(area.rooms.map((r) => r.roomId));
  const pathIds = new Set(area.rooms.filter((r) => r.kind === 'path').map((r) => r.roomId));
  const pathRooms = rooms
    .filter((r) => pathIds.has(r.id))
    .sort((a, b) => polygonAreaPt2(b.polygon) - polygonAreaPt2(a.polygon) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const startRoom = pathRooms[startIndex];
  if (!startRoom) return null;

  const servedRooms = rooms.filter((r) => r.pageIndex === pageIndex && !areaRoomIds.has(r.id));
  const offsetPt = 300 / mmPerPt;
  const stamps: RouteStamp[] = [pointStamp(START_ID, 'equipment', 'out', roomLabelPoint(startRoom))];
  for (const room of servedRooms) {
    const points = kind === 'A' ? [roomLabelPoint(room)] : layoutGrid(room, 4, offsetPt).points;
    points.forEach((point, k) => {
      const id = kind === 'A' ? `term-${room.id}` : `term-${room.id}-${k}`;
      stamps.push(pointStamp(id, 'terminal', 'in', point, { in: TYPE }));
    });
  }

  const terminalIds = new Set(stamps.filter((s) => s.id !== START_ID).map((s) => s.id));
  const targetPorts = findRoutePorts({
    stamps,
    networkTypeId: TYPE,
    scope: { kind: 'stamps', stampIds: terminalIds },
    startStampId: START_ID,
    startPortId: 'out',
    rooms,
    pageIndex,
    portChoice: 'order',
  }).ports;

  return {
    drawing,
    kind,
    pageIndex,
    area,
    startRoom,
    servedRooms,
    stamps,
    targetPorts,
    startStampId: START_ID,
    startPortId: 'out',
    networkTypeId: TYPE,
  };
}

export interface ScenarioRun { status: 'ok' | 'refused'; plan: PlannedRoute; ms: number }

export function runScenario(s: Scenario, ids: ReturnType<typeof makeIdFactories> = makeIdFactories(), options?: RouteLayoutOptions, trace?: RouteTrace): ScenarioRun {
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
  const start = performance.now();
  const result = planRoute(input, options, trace);
  return { status: result.status, plan: result.plan, ms: performance.now() - start };
}

export interface ScenarioRow { label: string; metrics: RouteMetrics; score: number; ms: number }

export function measureScenario(s: Scenario, run: ScenarioRun, label: string): ScenarioRow {
  const metrics = routeMetrics({
    plan: run.plan,
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt: s.drawing.mmPerPt,
    pageIndex: s.pageIndex,
    startStampId: s.startStampId,
    startPortId: s.startPortId,
  });
  return { label, metrics, score: scoreRoute(metrics), ms: run.ms };
}

type MetricColumn = Exclude<keyof RouteMetrics, 'fittingsByKind'>;

function cell(key: MetricColumn, value: number): string {
  return key.endsWith('Share') ? value.toFixed(3) : String(Math.round(value));
}

function formatLine(cells: readonly string[], widths: readonly number[]): string {
  return cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const next = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function shuffledScenario(drawing: Drawing, kind: ScenarioKind, startIndex: number, seed: number): Scenario | null {
  const s = buildScenario({ ...drawing, rooms: seededShuffle(drawing.rooms, seed) }, kind, startIndex);
  if (s === null) return null;
  return { ...s, stamps: seededShuffle(s.stamps, seed + 1), targetPorts: seededShuffle(s.targetPorts, seed + 2) };
}

function sortByJson<T>(items: readonly T[]): T[] {
  return items
    .map((item) => ({ key: JSON.stringify(item), item }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.item);
}

export function planGeometry(plan: PlannedRoute): unknown {
  const fittingPositions = new Map(plan.fittings.map((f) => [f.id, f.position]));
  const endpoint = (p: ConnectionPoint): unknown => (p.kind === 'fitting' ? { kind: p.kind, position: fittingPositions.get(p.fittingId) } : p);
  const segmentForms = plan.segments.map((s) => ({ shape: s.shape, networkTypeId: s.networkTypeId, pageIndex: s.pageIndex, material: s.material, diameter: s.diameter, width: s.width, height: s.height, endpointA: endpoint(s.endpointA), endpointB: endpoint(s.endpointB), geometry: s.geometry }));
  const segmentKeys = new Map(plan.segments.map((s, i) => [s.id, JSON.stringify(segmentForms[i])]));
  return {
    segments: sortByJson(segmentForms),
    fittings: sortByJson(plan.fittings.map((f) => ({ kind: f.kind, position: f.position }))),
    sizes: sortByJson(plan.sizes.map(({ segmentId, ...size }) => ({ segment: segmentKeys.get(segmentId) ?? null, ...size }))),
    stats: plan.stats,
    warnings: plan.warnings.map((w) => w.code).sort(),
  };
}

export function planHash(plan: PlannedRoute): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export interface RuntimeStats { medianMs: number; maxMs: number }

export function measureRuntime(s: Scenario, warmups = 2, runs = 7): RuntimeStats {
  for (let i = 0; i < warmups; i++) runScenario(s, makeIdFactories());
  const times = Array.from({ length: runs }, () => runScenario(s, makeIdFactories()).ms).sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)] ?? 0, maxMs: times[times.length - 1] ?? 0 };
}

export interface BaselineRow { scenario: string; startIndex: number; startRoomId: string; row: ScenarioRow; runtime: RuntimeStats }

const BASELINE_COLUMNS: MetricColumn[] = ['segments', 'fittings', 'lengthMm', 'bends90', 'bends45', 'wallCrossings', 'offGraphRooms', 'noEntryRooms', 'portsLeft'];

export function formatBaselineTable(rows: readonly BaselineRow[], runtimeMode = ''): string {
  const header = ['scenario', 'start', 'start room', 'segments', 'fittings', 'length mm', 'bends90', 'bends45', 'wallCrossings', 'offGraphRooms', 'noEntryRooms', 'portsLeft', 'score', 'median ms', 'max ms'];
  const body = rows.map((r) => [
    r.scenario,
    String(r.startIndex),
    r.startRoomId,
    ...BASELINE_COLUMNS.map((key) => cell(key, r.row.metrics[key])),
    String(Math.round(r.row.score)),
    String(Math.round(r.runtime.medianMs)),
    String(Math.round(r.runtime.maxMs)),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((line) => (line[i] ?? '').length)));
  const headerLine = formatLine(header, widths) + (runtimeMode === '' ? '' : `  runtime: ${runtimeMode}`);
  return [headerLine, ...body.map((line) => formatLine(line, widths))].join('\n');
}
