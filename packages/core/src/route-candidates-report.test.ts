// route candidates report
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { RouteBuildInput } from './route-build.js';
import { planRoute } from './route-build.js';
import { planBestRoute, routeSignature, type BestRoute } from './route-candidates.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from './route-metrics.js';
import { buildScenario, firstFloorDrawing, localDrawing, makeIdFactories, type Drawing, type Scenario } from './route-scenario.testutil.js';

const LOCAL_FIXTURES = [
  { file: 'ground-floor-w-rooms', name: 'w_rooms' },
  { file: '10A-rooms', name: '10A' },
];
const FULL_ENV = 'MEPAPP_QUALITY_FULL';
const TEST_TIMEOUT = 300000;
const FULL_RUNTIME = process.env[FULL_ENV] === '1';
const RUNTIME_MODE = FULL_RUNTIME ? 'full (2 warm-ups, 7 runs)' : 'fast (1 warm-up, 3 runs)';
const RUNTIME_WARMUPS = FULL_RUNTIME ? 2 : 1;
const RUNTIME_RUNS = FULL_RUNTIME ? 7 : 3;
const RUNTIME_LIMIT_MS = 1200;
const FIRST_FLOOR_STARTS = [0, 1, 2];
const LOCAL_STARTS = [0];

interface Candidate { name: string; options: RouteLayoutOptions }
const CANDIDATES: Candidate[] = [
  { name: 'base', options: {} },
  { name: 'bridge', options: { bridgeParts: { penaltyMm: 0 } } },
  { name: 'bridgeLink', options: { bridgeParts: { penaltyMm: 0 }, linkSearch: { bendMm: 500, wallMm: 3000 } } },
  { name: 'all', options: { bridgeParts: { penaltyMm: 0 }, linkSearch: { bendMm: 500, wallMm: 3000 }, exactSpine: { maxPorts: 6 } } },
];

interface WeightSet { name: string; weights: ScoreWeights }
const WEIGHT_SETS: WeightSet[] = [
  { name: 'default', weights: DEFAULT_SCORE_WEIGHTS },
  { name: 'bends', weights: { ...DEFAULT_SCORE_WEIGHTS, bend90: 1500, bend45: 750 } },
];

interface Source { name: string; drawing: Drawing | null; optional: boolean; starts: number[] }
interface WeightRow { label: string; startIndex: number; weights: string; winner: string; best: BestRoute }
interface RuntimeRow { label: string; startIndex: number; medianMs: number; maxMs: number }

const WEIGHT_ROWS: WeightRow[] = [];
const RUNTIME_ROWS: RuntimeRow[] = [];

function loadSources(): Source[] {
  const sources: Source[] = [{ name: 'first floor', drawing: firstFloorDrawing(), optional: false, starts: FIRST_FLOOR_STARTS }];
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
    sources.push({ name: spec.name, drawing, optional: true, starts: LOCAL_STARTS });
  }
  return sources;
}

function inputFor(s: Scenario): RouteBuildInput {
  const ids = makeIdFactories();
  return {
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
}

function bestOf(s: Scenario, weights: ScoreWeights): BestRoute {
  return planBestRoute(inputFor(s), CANDIDATES.map((c) => c.options), weights);
}

function timeBest(s: Scenario): number {
  const input = inputFor(s);
  const start = performance.now();
  planBestRoute(input, CANDIDATES.map((c) => c.options), DEFAULT_SCORE_WEIGHTS);
  return performance.now() - start;
}

function formatColumns(header: readonly string[], body: readonly string[][], textColumns: number): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cells) => (cells[i] ?? '').length)));
  const formatLine = (cells: readonly string[]): string => cells.map((c, i) => (i < textColumns ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
  return [formatLine(header), ...body.map(formatLine)];
}

function weightRowsTable(rows: readonly WeightRow[]): string[] {
  const header = ['drawing', 'start', 'weights', 'winner', ...CANDIDATES.flatMap((c) => [`${c.name} score`, `${c.name} sig`]), 'distinct'];
  const body = rows.map((row) => [
    row.label,
    String(row.startIndex),
    row.weights,
    row.winner,
    ...CANDIDATES.flatMap((_, i) => {
      const result = row.best.results[i];
      return [result ? String(Math.round(result.score)) : '-', result ? result.signature.slice(0, 6) : '-'];
    }),
    String(new Set(row.best.results.map((r) => r.signature)).size),
  ]);
  return formatColumns(header, body, 4);
}

function runtimeTable(rows: readonly RuntimeRow[], mode: string): string[] {
  const header = ['drawing', 'start', 'median ms', 'max ms'];
  const body = rows.map((r) => [r.label, String(r.startIndex), String(Math.round(r.medianMs)), String(Math.round(r.maxMs))]);
  const lines = formatColumns(header, body, 2);
  lines[0] = `${lines[0]}  limit ${RUNTIME_LIMIT_MS} ms  runtime: ${mode}`;
  return lines;
}

function buildCases(source: Source, drawing: Drawing): { label: string; startIndex: number; s: Scenario }[] {
  const cases: { label: string; startIndex: number; s: Scenario }[] = [];
  for (const startIndex of source.starts) {
    const label = source.name;
    let s: Scenario | null = null;
    try {
      s = buildScenario(drawing, 'A', startIndex);
    } catch (e) {
      if (!source.optional) throw e;
      console.log(`SKIP ${label} start ${startIndex}: scenario build failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (s === null) {
      console.log(`SKIP ${label} start ${startIndex}: no path room`);
      continue;
    }
    cases.push({ label, startIndex, s });
  }
  return cases;
}

describe('route candidates report', () => {
  const sources = loadSources();

  for (const source of sources) {
    it.skipIf(source.drawing === null)(`${source.name}: candidates ok, freeLegs 0, no internal-join, default winner is the minimum, base equals planRoute, determinism, runtime`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      for (const c of buildCases(source, drawing)) {
        const baseSignature = routeSignature(planRoute(inputFor(c.s), {}).plan);
        for (const set of WEIGHT_SETS) {
          const label = `${c.label} start ${c.startIndex} ${set.name}`;
          const best = bestOf(c.s, set.weights);
          WEIGHT_ROWS.push({ label: c.label, startIndex: c.startIndex, weights: set.name, winner: CANDIDATES[best.best]?.name ?? '?', best });
          expect(best.results.length, label).toBe(CANDIDATES.length);
          for (const r of best.results) {
            expect(r.status, label).toBe('ok');
            expect(r.metrics.freeLegs, label).toBe(0);
            expect(r.plan.warnings.some((w) => w.code === 'internal-join'), label).toBe(false);
          }
          const base = best.results[0];
          expect(base === undefined ? null : routeSignature(base.plan), label).toBe(baseSignature);
          if (set.name === 'default') {
            expect(best.results[best.best]?.score, label).toBe(Math.min(...best.results.map((r) => r.score)));
            const again = bestOf(c.s, set.weights);
            expect(again.results.map((r) => r.score), label).toEqual(best.results.map((r) => r.score));
            expect(again.results.map((r) => r.signature), label).toEqual(best.results.map((r) => r.signature));
          }
        }
        for (let i = 0; i < RUNTIME_WARMUPS; i++) timeBest(c.s);
        const times: number[] = [];
        for (let i = 0; i < RUNTIME_RUNS; i++) times.push(timeBest(c.s));
        times.sort((a, b) => a - b);
        RUNTIME_ROWS.push({ label: c.label, startIndex: c.startIndex, medianMs: times[Math.floor(times.length / 2)] ?? 0, maxMs: times[times.length - 1] ?? 0 });
      }
    }, TEST_TIMEOUT);
  }

  afterAll(() => {
    if (WEIGHT_ROWS.length > 0) for (const line of weightRowsTable(WEIGHT_ROWS)) console.log(line);
    if (RUNTIME_ROWS.length > 0) for (const line of runtimeTable(RUNTIME_ROWS, RUNTIME_MODE)) console.log(line);
  });
});
