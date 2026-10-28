// route room branch report and gate G0 (P1-T20)
// The default run prints the table, the PASS/FAIL line of each criterion and the rooms behind each FAIL.
// The criterion tests assert only when MEPAPP_G0_ASSERT=1 (the thresholds are the ones of the plan; they are not moved).
// Time is printed in the table (the ms column) and is not asserted; the time limit moved to gate G2.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { roomsAtPoint } from './rooms/room.js';
import type { PlannedRoute, RouteLegOrigin, RouteStats, RouteTrace } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import type { RouteMetrics } from './route-metrics.js';
import { ENTRY_CLUSTER_MM } from './route-metrics.js';
import {
  buildScenario,
  firstFloorDrawing,
  localDrawing,
  makeIdFactories,
  measureScenario,
  runScenario,
  type Drawing,
  type Scenario,
  type ScenarioKind,
  type ScenarioRun,
} from './route-scenario.testutil.js';

const ASSERT = process.env.MEPAPP_G0_ASSERT === '1';
const TEST_TIMEOUT = 600000;
const BRANCH_OPTIONS: RouteLayoutOptions = { roomBranches: { searchMm: 30000 } };
const SOURCES: { file: string | null; name: string; optional: boolean }[] = [
  { file: null, name: 'first floor', optional: false },
  { file: 'ground-floor-w-rooms-2', name: 'w_rooms-2', optional: true },
  { file: 'ground-floor-w-rooms', name: 'w_rooms', optional: true },
  { file: '10A-rooms', name: '10A', optional: true },
];
const ASSERTED = new Set(['first floor', 'w_rooms-2']);

interface Cluster { point: Vec2; origins: Set<RouteLegOrigin> }
interface Side {
  run: ScenarioRun;
  metrics: RouteMetrics;
  stats: RouteStats;
  medianMs: number;
  chained: Set<string>;
  offGraph: Set<string>;
  fed: Set<string>;
  clusters: Map<string, Cluster[]>;
  trace: RouteTrace;
}
interface Case { source: string; kind: ScenarioKind; s: Scenario; balanced: Side; branch: Side }
interface Criterion { id: number; text: string; drawing: string; scenario: string; pass: boolean; detail: string }

const mmDist = (a: Vec2, b: Vec2, mmPerPt: number): number => Math.hypot(a.x - b.x, a.y - b.y) * mmPerPt;

function entriesOfPath(s: Scenario, path: readonly Vec2[]): { roomId: string; point: Vec2 }[] {
  const { rooms, mmPerPt } = s.drawing;
  const served = new Set(s.servedRooms.map((r) => r.id));
  const out: { roomId: string; point: Vec2 }[] = [];
  const stepPt = 100 / mmPerPt;
  let previous: string | null = null;
  let previousPoint: Vec2 | null = null;
  const sample = (p: Vec2): void => {
    const roomId = roomsAtPoint(rooms, p, s.pageIndex)[0]?.id ?? null;
    if (roomId !== null && roomId !== previous && previousPoint !== null && served.has(roomId)) out.push({ roomId, point: p });
    previous = roomId;
    previousPoint = p;
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepPt));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) sample({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function pointToPathMm(p: Vec2, path: readonly Vec2[], mmPerPt: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = { x: path[i]!.x / mmPerPt, y: path[i]!.y / mmPerPt };
    const b = i + 1 < path.length ? { x: path[i + 1]!.x / mmPerPt, y: path[i + 1]!.y / mmPerPt } : a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, mmDist(p, { x: a.x + t * dx, y: a.y + t * dy }, mmPerPt));
  }
  return best;
}

function analyseTrace(s: Scenario, trace: RouteTrace, plan: PlannedRoute): { fed: Set<string>; clusters: Map<string, Cluster[]> } {
  const { rooms, mmPerPt } = s.drawing;
  const served = new Set(s.servedRooms.map((r) => r.id));
  const fed = new Set<string>();
  for (const entry of trace.paths) {
    if (entry.origin !== 'branch' || entry.path.length === 0) continue;
    const last = entry.path[entry.path.length - 1]!;
    const id = roomsAtPoint(rooms, { x: last.x / mmPerPt, y: last.y / mmPerPt }, s.pageIndex)[0]?.id;
    if (id !== undefined && served.has(id)) fed.add(id);
  }
  // entries are read from the planned segments (as the metric does); the origin is the trace path that lies at the entry point
  const clusters = new Map<string, Cluster[]>();
  for (const segment of plan.segments) {
    for (const e of entriesOfPath(s, segment.geometry)) {
      const origins = new Set<RouteLegOrigin>();
      for (const entry of trace.paths) if (pointToPathMm(e.point, entry.path, mmPerPt) < 150) origins.add(entry.origin);
      const list = clusters.get(e.roomId) ?? [];
      const hit = list.find((c) => mmDist(c.point, e.point, mmPerPt) < ENTRY_CLUSTER_MM);
      if (hit) for (const o of origins) hit.origins.add(o);
      else list.push({ point: e.point, origins });
      clusters.set(e.roomId, list);
    }
  }
  return { fed, clusters };
}

function measureSide(s: Scenario, options: RouteLayoutOptions | undefined, runs: number): Side {
  const first = runScenario(s, makeIdFactories(), options);
  const times = [first.ms];
  for (let i = 1; i < runs; i++) times.push(runScenario(s, makeIdFactories(), options).ms);
  times.sort((a, b) => a - b);
  const trace: RouteTrace = { paths: [] };
  runScenario(s, makeIdFactories(), options, trace);
  const row = measureScenario(s, first, 'g0');
  const idsOf = (code: string): Set<string> => new Set(first.plan.warnings.find((w) => w.code === code)?.ids ?? []);
  return {
    run: first,
    metrics: row.metrics,
    stats: first.plan.stats,
    medianMs: times[Math.floor(times.length / 2)] ?? 0,
    chained: idsOf('room-chained'),
    offGraph: idsOf('room-off-graph'),
    ...analyseTrace(s, trace, first.plan),
    trace,
  };
}

let CASES: Case[] | null = null;

function loadCases(): Case[] {
  if (CASES !== null) return CASES;
  const cases: Case[] = [];
  for (const spec of SOURCES) {
    let drawing: Drawing | null = null;
    try {
      drawing = spec.file === null ? firstFloorDrawing() : localDrawing(spec.file, spec.name);
    } catch (e) {
      if (!spec.optional) throw e;
      console.log(`SKIP ${spec.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (drawing === null) {
      if (!spec.optional) throw new Error(`${spec.name} missing`);
      console.log(`SKIP ${spec.name}: local fixture ${fileURLToPath(new URL(`../fixtures/route-area/local/${spec.file}.json`, import.meta.url))} missing`);
      continue;
    }
    for (const kind of ['A', 'B'] as const) {
      const s = buildScenario(drawing, kind, 0);
      if (s === null) {
        console.log(`SKIP ${spec.name} ${kind}: no path room`);
        continue;
      }
      const runs = kind === 'A' ? 3 : 1;
      if (kind === 'A') {
        runScenario(s, makeIdFactories(), undefined);
        runScenario(s, makeIdFactories(), BRANCH_OPTIONS);
      }
      cases.push({ source: spec.name, kind, s, balanced: measureSide(s, undefined, runs), branch: measureSide(s, BRANCH_OPTIONS, runs) });
    }
  }
  CASES = cases;
  return cases;
}

function causeOf(c: Case, side: Side, roomId: string): string {
  const fed = side.fed.has(roomId);
  const chained = side.chained.has(roomId);
  const far = side.offGraph.has(roomId);
  const clusters = side.clusters.get(roomId) ?? [];
  const origins = clusters.map((cl) => [...cl.origins].sort().join('+'));
  const gaps: number[] = [];
  for (let i = 1; i < clusters.length; i++) gaps.push(Math.round(mmDist(clusters[0]!.point, clusters[i]!.point, c.s.drawing.mmPerPt)));
  let category: string;
  if (far && !fed) category = 'far room not fed (links)';
  else if (fed && chained) category = 'far room chained, a second entry exists';
  else if (fed) category = origins.filter((o) => !o.includes('branch')).length > 0 && origins.filter((o) => !o.includes('branch')).every((o) => o.includes('spine') && !o.includes('link'))
    ? 'fed room, extra entry is a spine near the wall (metric counts it)'
    : 'fed room, extra entry by a link or another path';
  else category = 'room without a feed (links)';
  return `${roomId}: ${category}; cluster origins [${origins.join(' | ')}]; gaps to first mm [${gaps.join(',')}]`;
}

function multiEntryRooms(side: Side): string[] {
  return [...side.clusters.entries()].filter(([, list]) => list.length > 1).map(([id]) => id).sort();
}

function evaluate(cases: readonly Case[]): Criterion[] {
  const out: Criterion[] = [];
  const add = (id: number, text: string, c: Case, pass: boolean, detail: string): void => {
    out.push({ id, text, drawing: c.source, scenario: c.kind, pass, detail });
  };
  for (const c of cases) {
    if (!ASSERTED.has(c.source)) continue;
    const b = c.balanced.metrics;
    const m = c.branch.metrics;
    const w2 = c.source === 'w_rooms-2';
    if (w2 && c.kind === 'B') {
      add(1, 'multiEntryRooms <= 4', c, m.multiEntryRooms <= 4, `${m.multiEntryRooms} (Balanced ${b.multiEntryRooms})`);
      add(1, 'chainedRooms <= 8', c, m.chainedRooms <= 8, `${m.chainedRooms} (Balanced ${b.chainedRooms})`);
    }
    if (w2 && c.kind === 'A') {
      add(1, 'chainedRooms <= 9', c, m.chainedRooms <= 9, `${m.chainedRooms} (Balanced ${b.chainedRooms})`);
      add(1, 'multiEntryRooms == 0', c, m.multiEntryRooms === 0, `${m.multiEntryRooms} (Balanced ${b.multiEntryRooms})`);
    }
    if (!w2) {
      add(2, 'chainedRooms <= Balanced', c, m.chainedRooms <= b.chainedRooms, `${m.chainedRooms} vs ${b.chainedRooms}`);
      add(2, 'multiEntryRooms <= Balanced', c, m.multiEntryRooms <= b.multiEntryRooms, `${m.multiEntryRooms} vs ${b.multiEntryRooms}`);
    }
    add(3, 'bendsOutside <= Balanced', c, m.bendsOutside <= b.bendsOutside, `${m.bendsOutside} vs ${b.bendsOutside}`);
    add(3, 'bendsArea90+45 <= Balanced', c, m.bendsArea90 + m.bendsArea45 <= b.bendsArea90 + b.bendsArea45, `${m.bendsArea90 + m.bendsArea45} vs ${b.bendsArea90 + b.bendsArea45}`);
    add(4, 'portsLeft <= Balanced', c, m.portsLeft <= b.portsLeft, `${m.portsLeft} vs ${b.portsLeft}`);
    add(4, 'offGraphRooms <= Balanced', c, m.offGraphRooms <= b.offGraphRooms, `${m.offGraphRooms} vs ${b.offGraphRooms}`);
    add(5, 'lengthMm <= 120 %', c, m.lengthMm <= 1.2 * b.lengthMm, `${Math.round(m.lengthMm)} vs ${Math.round(b.lengthMm)} (${((m.lengthMm / b.lengthMm) * 100).toFixed(1)} %)`);
    add(5, 'wallCrossings <= 125 %', c, m.wallCrossings <= 1.25 * b.wallCrossings, `${m.wallCrossings} vs ${b.wallCrossings} (${((m.wallCrossings / Math.max(1, b.wallCrossings)) * 100).toFixed(1)} %)`);
    const fedMulti = multiEntryRooms(c.branch).filter((id) => c.branch.fed.has(id));
    add(6, 'fed rooms with more than one entry == 0', c, fedMulti.length === 0, `${fedMulti.length} [${fedMulti.join(', ')}]`);
  }
  return out;
}

function tableLines(cases: readonly Case[]): string[] {
  const header = ['drawing', 'sc', 'variant', 'multiEntry', 'chained', 'bendsOut', 'area90', 'area45', 'room90', 'room45', 'roomsBend', 'longDiag', 'lengthMm', 'wallRoom', 'wallCorr', 'portsLeft', 'offGraph', 'ms', 'room-chained'];
  const body: string[][] = [];
  for (const c of cases) {
    for (const [name, side] of [['balanced', c.balanced], ['branch', c.branch]] as const) {
      const m = side.metrics;
      body.push([c.source, c.kind, name, m.multiEntryRooms, m.chainedRooms, m.bendsOutside, m.bendsArea90, m.bendsArea45, m.bendsRoom90, m.bendsRoom45, m.roomsWithBends, m.longDiagonalLegs, Math.round(m.lengthMm), side.stats.wallCrossingsRoom, side.stats.wallCrossingsCorridor, m.portsLeft, m.offGraphRooms, Math.round(side.medianMs), side.chained.size].map(String));
    }
  }
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (cells: readonly string[]): string => cells.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join('  ');
  return [line(header), ...body.map(line)];
}

function elbowsOutside(c: Case, side: Side): Vec2[] {
  const { rooms } = c.s.drawing;
  return side.run.plan.fittings.filter((f) => f.kind === 'elbow' && (roomsAtPoint(rooms, f.position, c.s.pageIndex)[0]?.id ?? null) === null).map((f) => f.position);
}

function traceElbow(c: Case, side: Side, p: Vec2): string {
  const mmPerPt = c.s.drawing.mmPerPt;
  const hits: { origin: RouteLegOrigin; index: number; mm: number; vertex: boolean; n: number }[] = [];
  side.trace.paths.forEach((entry, index) => {
    let best = Infinity;
    let vertex = false;
    for (let i = 0; i < entry.path.length; i++) {
      const q = { x: entry.path[i]!.x / mmPerPt, y: entry.path[i]!.y / mmPerPt };
      const d = mmDist(p, q, mmPerPt);
      if (d < best) {
        best = d;
        vertex = d < 30;
      }
    }
    for (let i = 1; i < entry.path.length; i++) {
      const a = { x: entry.path[i - 1]!.x / mmPerPt, y: entry.path[i - 1]!.y / mmPerPt };
      const b = { x: entry.path[i]!.x / mmPerPt, y: entry.path[i]!.y / mmPerPt };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      best = Math.min(best, mmDist(p, { x: a.x + t * dx, y: a.y + t * dy }, mmPerPt));
    }
    if (best < 400) hits.push({ origin: entry.origin, index, mm: Math.round(best), vertex, n: entry.path.length });
  });
  hits.sort((x, y) => x.mm - y.mm);
  return `elbow (${p.x.toFixed(0)},${p.y.toFixed(0)}) pt: ${hits.slice(0, 4).map((h) => `${h.origin}#${h.index} ${h.mm}mm${h.vertex ? ' vertex' : ''} (${h.n} pts)`).join('; ') || 'no trace path within 400 mm'}`;
}

describe('route room branch report (G0, P1-T20)', () => {
  it('measures every drawing, prints the table, the criteria and the rooms behind each FAIL', () => {
    const cases = loadCases();
    expect(cases.length, 'cases').toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.balanced.run.status, `${c.source} ${c.kind} Balanced`).toBe('ok');
      expect(c.branch.run.status, `${c.source} ${c.kind} branch`).toBe('ok');
      expect(c.branch.run.plan.warnings.some((w) => w.code === 'internal-join'), `${c.source} ${c.kind} internal-join`).toBe(false);
    }
    const lines: string[] = ['G0 table (start 0; time: median of 3 for A, one run for B):', ...tableLines(cases)];
    const criteria = evaluate(cases);
    lines.push('', 'G0 criteria:');
    for (const k of criteria) lines.push(`${k.pass ? 'PASS' : 'FAIL'} C${k.id} ${k.drawing} ${k.scenario}: ${k.text}: ${k.detail}`);
    lines.push('', 'Rooms behind the failures (option branch):');
    for (const c of cases) {
      if (!ASSERTED.has(c.source)) continue;
      const failed = criteria.filter((k) => !k.pass && k.drawing === c.source && k.scenario === c.kind);
      if (failed.length === 0) continue;
      lines.push(`${c.source} ${c.kind}: failing ${[...new Set(failed.map((k) => `C${k.id}`))].join(', ')}`);
      const multi = multiEntryRooms(c.branch);
      lines.push(`  multi-entry rooms (${multi.length}), Balanced ${multiEntryRooms(c.balanced).length} [${multiEntryRooms(c.balanced).join(', ')}]:`);
      for (const id of multi) lines.push(`    ${causeOf(c, c.branch, id)}`);
      lines.push(`  chained rooms (${c.branch.chained.size}): ${[...c.branch.chained].sort().join(', ')}; far rooms (room-off-graph): ${[...c.branch.offGraph].sort().join(', ')}`);
      lines.push(`  fed rooms: ${c.branch.fed.size}`);
    }
    lines.push('', 'Reported (no assert): far rooms chained / on links and rooms with bends:');
    for (const c of cases) {
      const far = [...c.branch.offGraph];
      const chained = far.filter((id) => c.branch.chained.has(id)).length;
      lines.push(`${c.source} ${c.kind}: far rooms ${far.length}, chained ${chained}, link ${far.length - chained}; roomsWithBends ${c.branch.metrics.roomsWithBends} (Balanced ${c.balanced.metrics.roomsWithBends}); bendsRoom ${c.branch.metrics.bendsRoom90 + c.branch.metrics.bendsRoom45} (Balanced ${c.balanced.metrics.bendsRoom90 + c.balanced.metrics.bendsRoom45}); longestPathMm ${Math.round(c.branch.metrics.longestPathMm)} (${Math.round(c.balanced.metrics.longestPathMm)})`);
    }
    console.log(lines.join('\n'));
  }, TEST_TIMEOUT);

  it('traces the elbows outside any room (origin of each, option against Balanced)', () => {
    const lines: string[] = ['Outside elbows:'];
    for (const c of loadCases()) {
      const had = elbowsOutside(c, c.balanced);
      const mmPerPt = c.s.drawing.mmPerPt;
      const now = elbowsOutside(c, c.branch);
      if (now.length <= had.length && c.source !== 'first floor') continue;
      lines.push(`${c.source} ${c.kind}: option ${now.length}, Balanced ${had.length}`);
      for (const p of now) {
        const alsoInBalanced = had.some((q) => mmDist(p, q, mmPerPt) < 30);
        lines.push(`  ${alsoInBalanced ? 'both   ' : 'OPTION '}${traceElbow(c, c.branch, p)}`);
      }
    }
    console.log(lines.join('\n'));
  }, TEST_TIMEOUT);

  const names = [
    'C1 w_rooms-2: multi-entry and chained rooms fall (B: multi <= 4, chained <= 8; A: chained <= 9, multi 0)',
    'C2 first floor: chained and multi-entry rooms not higher than Balanced',
    'C3 bendsOutside and area bends not higher than Balanced',
    'C4 portsLeft and offGraphRooms not higher than Balanced',
    'C5 lengthMm <= 120 % and wallCrossings <= 125 % of Balanced',
    'C6 every fed room has one entry',
  ];
  names.forEach((name, i) => {
    it.skipIf(!ASSERT)(name, () => {
      const failed = evaluate(loadCases()).filter((k) => k.id === i + 1 && !k.pass).map((k) => `${k.drawing} ${k.scenario}: ${k.text}: ${k.detail}`);
      expect(failed, 'failing checks').toEqual([]);
    }, TEST_TIMEOUT);
  });
});
