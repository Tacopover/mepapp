// route exact report
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { PlannedRoute, RouteBuildInput, RouteTrace } from './route-build.js';
import { planRoute } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { ORIGINS, splitByOrigin, type OriginPart, type OriginSplit } from './route-origin.js';
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
  type ScenarioRow,
  type ScenarioRun,
} from './route-scenario.testutil.js';

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
const STARTS = [0, 1, 2];
const B_STARTS = [0];
const PLAN: [ScenarioKind, number[]][] = FULL_RUNTIME ? [['A', STARTS], ['B', B_STARTS]] : [['A', STARTS]];
const PARTIAL_STARTS_VARIANTS = ['off', 'bridge', 'bridgeExact6', 'exact6'];

interface Variant { name: string; options: RouteLayoutOptions | undefined }
const VARIANTS: Variant[] = [
  { name: 'off', options: undefined },
  { name: 'exact6', options: { exactSpine: { maxPorts: 6 } } },
  { name: 'bridge', options: { bridgeParts: { penaltyMm: 0 } } },
  { name: 'bridgeExact6', options: { bridgeParts: { penaltyMm: 0 }, exactSpine: { maxPorts: 6 } } },
  { name: 'bridgeLink', options: { bridgeParts: { penaltyMm: 0 }, linkSearch: { bendMm: 500, wallMm: 3000 } } },
  { name: 'bridgeLinkExact6', options: { bridgeParts: { penaltyMm: 0 }, linkSearch: { bendMm: 500, wallMm: 3000 }, exactSpine: { maxPorts: 6 } } },
  { name: 'linkExact6', options: { linkSearch: { bendMm: 500, wallMm: 3000 }, exactSpine: { maxPorts: 6 } } },
];

interface Source { name: string; drawing: Drawing | null; optional: boolean }
interface Case { label: string; startIndex: number; s: Scenario; variants: Variant[] }
interface Measured { label: string; startIndex: number; variant: Variant; run: ScenarioRun; row: ScenarioRow; medianMs: number; maxMs: number }
interface SourceRun { cases: Case[]; rows: Measured[] }
interface OriginResult { variant: Variant; split: OriginSplit }
interface SourceOrigin { name: string; variants: OriginResult[] }

const TABLE_ROWS: Measured[] = [];
const SOURCE_RUNS = new Map<string, SourceRun>();
const ORIGIN_RESULTS: SourceOrigin[] = [];

function loadSources(): Source[] {
  const sources: Source[] = [{ name: 'first floor', drawing: firstFloorDrawing(), optional: false }];
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
    sources.push({ name: spec.name, drawing, optional: true });
  }
  return sources;
}

function variantsFor(kind: ScenarioKind, startIndex: number): Variant[] {
  if (kind === 'A' && startIndex > 0) return VARIANTS.filter((v) => PARTIAL_STARTS_VARIANTS.includes(v.name));
  return VARIANTS;
}

function buildCases(source: Source, drawing: Drawing): Case[] {
  const cases: Case[] = [];
  for (const [kind, allStarts] of PLAN) {
    const starts = source.optional ? [0] : allStarts;
    for (const startIndex of starts) {
      const label = `${source.name} ${kind}`;
      let s: Scenario | null = null;
      try {
        s = buildScenario(drawing, kind, startIndex);
      } catch (e) {
        if (!source.optional) throw e;
        console.log(`SKIP ${label} start ${startIndex}: scenario build failed: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      if (s === null) {
        console.log(`SKIP ${label} start ${startIndex}: no path room`);
        continue;
      }
      cases.push({ label, startIndex, s, variants: variantsFor(kind, startIndex) });
    }
  }
  return cases;
}

function measureCase(c: Case, variant: Variant): Measured {
  for (let i = 0; i < RUNTIME_WARMUPS; i++) runScenario(c.s, makeIdFactories(), variant.options);
  const runs: ScenarioRun[] = [];
  for (let i = 0; i < RUNTIME_RUNS; i++) runs.push(runScenario(c.s, makeIdFactories(), variant.options));
  const first = runs[0];
  if (first === undefined) throw new Error(`no measured run for ${c.label} start ${c.startIndex} ${variant.name}`);
  const times = runs.map((r) => r.ms).sort((a, b) => a - b);
  const row = measureScenario(c.s, first, `${c.label} start ${c.startIndex} ${variant.name}`);
  return {
    label: c.label,
    startIndex: c.startIndex,
    variant,
    run: first,
    row,
    medianMs: times[Math.floor(times.length / 2)] ?? 0,
    maxMs: times[times.length - 1] ?? 0,
  };
}

function groupOf(rows: readonly Measured[], c: Case): Measured[] {
  return rows.filter((r) => r.label === c.label && r.startIndex === c.startIndex);
}

function runSource(source: Source, drawing: Drawing): SourceRun {
  const cached = SOURCE_RUNS.get(source.name);
  if (cached !== undefined) return cached;
  const cases = buildCases(source, drawing);
  const rows: Measured[] = [];
  for (const c of cases) {
    for (const variant of c.variants) rows.push(measureCase(c, variant));
  }
  TABLE_ROWS.push(...rows);
  const run: SourceRun = { cases, rows };
  SOURCE_RUNS.set(source.name, run);
  return run;
}

function checkSafety(run: SourceRun): void {
  for (const c of run.cases) {
    const group = groupOf(run.rows, c);
    const off = group.find((r) => r.variant.name === 'off');
    if (off === undefined) throw new Error(`no off row for ${c.label} start ${c.startIndex}`);
    expect(runScenario(c.s, makeIdFactories()).plan).toEqual(runScenario(c.s, makeIdFactories(), {}).plan);
    for (const m of group) {
      const label = `${c.label} start ${c.startIndex} ${m.variant.name}`;
      expect(m.run.status, label).toBe('ok');
      expect(m.run.plan.warnings.some((w) => w.code === 'internal-join'), label).toBe(false);
      expect(m.row.metrics.freeLegs, label).toBe(0);
      expect(m.row.metrics.portsLeft, label).toBeLessThanOrEqual(off.row.metrics.portsLeft);
      const first = runScenario(c.s, makeIdFactories(), m.variant.options).plan;
      const second = runScenario(c.s, makeIdFactories(), m.variant.options).plan;
      expect(first, label).toEqual(second);
    }
  }
}

function planWith(s: Scenario, options: RouteLayoutOptions | undefined, trace?: RouteTrace): { status: 'ok' | 'refused'; plan: PlannedRoute } {
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
  return planRoute(input, options, trace);
}

function sumOf(split: OriginSplit, pick: (part: OriginPart) => number): number {
  return ORIGINS.reduce((total, origin) => total + pick(split.byOrigin[origin]), 0);
}

function totalOf(split: OriginSplit): OriginPart {
  return {
    lengthMm: sumOf(split, (p) => p.lengthMm),
    segments: sumOf(split, (p) => p.segments),
    fittings: sumOf(split, (p) => p.fittings),
    bends90: sumOf(split, (p) => p.bends90),
    bends45: sumOf(split, (p) => p.bends45),
    tees: sumOf(split, (p) => p.tees),
    crosses: sumOf(split, (p) => p.crosses),
  };
}

function variantNamed(source: SourceOrigin, name: string): OriginResult {
  const found = source.variants.find((v) => v.variant.name === name);
  if (found === undefined) throw new Error(`no ${name} result for ${source.name}`);
  return found;
}

function formatColumns(header: readonly string[], body: readonly string[][], textColumns: number): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cells) => (cells[i] ?? '').length)));
  const formatLine = (cells: readonly string[]): string => cells.map((c, i) => (i < textColumns ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
  return [formatLine(header), ...body.map(formatLine)];
}

function formatTable(rows: readonly Measured[], mode: string): string {
  const header = ['scenario', 'start', 'variant', 'segments', 'fittings', 'lengthMm', 'bends90', 'bends45', 'wallCrossings', 'offGraphRooms', 'portsLeft', 'freeLegs', 'score', 'median ms', 'max ms'];
  const body = rows.map((r) => {
    const m = r.row.metrics;
    const numbers = [m.segments, m.fittings, m.lengthMm, m.bends90, m.bends45, m.wallCrossings, m.offGraphRooms, m.portsLeft, m.freeLegs];
    return [
      r.label,
      String(r.startIndex),
      r.variant.name,
      ...numbers.map((n) => String(Math.round(n))),
      String(Math.round(r.row.score)),
      String(Math.round(r.medianMs)),
      String(Math.round(r.maxMs)),
    ];
  });
  const lines = formatColumns(header, body, 3);
  lines[0] = `${lines[0]}  runtime: ${mode}`;
  return lines.join('\n');
}

function signedInt(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function signedFixed(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

function originRows(sources: readonly SourceOrigin[]): string[][] {
  const body: string[][] = [];
  for (const source of sources) {
    for (const v of source.variants) {
      const pairs: [string, OriginPart][] = ORIGINS.map((origin) => [origin, v.split.byOrigin[origin]] as [string, OriginPart]);
      pairs.push(['TOTAL', totalOf(v.split)]);
      for (const [origin, part] of pairs) {
        body.push([source.name, v.variant.name, origin, String(Math.round(part.bends90)), String(Math.round(part.bends45)), (part.lengthMm / 1000).toFixed(1), String(part.fittings)]);
      }
    }
  }
  return body;
}

function deltaRows(sources: readonly SourceOrigin[]): string[][] {
  const body: string[][] = [];
  for (const source of sources) {
    for (const base of ['off', 'bridge']) {
      const baseSplit = variantNamed(source, base).split;
      for (const v of source.variants) {
        if (v.variant.name === base) continue;
        const pairs: [string, OriginPart, OriginPart][] = ORIGINS.map((origin) => [origin, v.split.byOrigin[origin], baseSplit.byOrigin[origin]] as [string, OriginPart, OriginPart]);
        pairs.push(['TOTAL', totalOf(v.split), totalOf(baseSplit)]);
        for (const [origin, a, b] of pairs) {
          body.push([
            source.name,
            base,
            v.variant.name,
            origin,
            signedInt(Math.round(a.bends90 - b.bends90)),
            signedInt(Math.round(a.bends45 - b.bends45)),
            signedFixed((a.lengthMm - b.lengthMm) / 1000),
            signedInt(a.fittings - b.fittings),
          ]);
        }
      }
    }
  }
  return body;
}

function originSource(source: Source, drawing: Drawing): void {
  const s = buildScenario(drawing, 'A', 0);
  if (s === null) {
    console.log(`SKIP ${source.name} A start 0: no path room`);
    return;
  }
  const variants: OriginResult[] = [];
  for (const variant of VARIANTS) {
    const label = `${source.name} ${variant.name}`;
    const trace: RouteTrace = { paths: [] };
    const traced = planWith(s, variant.options, trace);
    const plain = planWith(s, variant.options);
    expect(JSON.stringify(traced), `${label} byte-equal`).toBe(JSON.stringify(plain));
    expect(traced.status, `${label} status`).toBe('ok');
    const plan = traced.plan;
    const split = splitByOrigin(plan, trace, drawing.mmPerPt);
    expect(Math.abs(sumOf(split, (p) => p.lengthMm) - plan.stats.lengthMm), `${label} lengthMm`).toBeLessThanOrEqual(1);
    expect(sumOf(split, (p) => p.segments), `${label} segments`).toBe(plan.segments.length);
    expect(sumOf(split, (p) => p.fittings), `${label} fittings`).toBe(plan.fittings.length);
    expect(sumOf(split, (p) => p.bends90), `${label} bends90`).toBe(plan.stats.bends90);
    expect(sumOf(split, (p) => p.bends45), `${label} bends45`).toBe(plan.stats.bends45);
    expect(split.unassignedSegments, `${label} unassignedSegments`).toBe(0);
    expect(split.unassignedFittings, `${label} unassignedFittings`).toBe(0);
    variants.push({ variant, split });
  }
  ORIGIN_RESULTS.push({ name: source.name, variants });
}

describe('route exact report', () => {
  const sources = loadSources();

  for (const source of sources) {
    it.skipIf(source.drawing === null)(`${source.name}: off equals off with {}, status ok, no internal-join, freeLegs 0, portsLeft not above off, determinism`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      checkSafety(runSource(source, drawing));
    }, TEST_TIMEOUT);

    it.skipIf(source.drawing === null)(`${source.name}: trace does not change the plan, the origin split adds up`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      originSource(source, drawing);
    }, TEST_TIMEOUT);
  }

  afterAll(() => {
    if (TABLE_ROWS.length > 0) console.log(formatTable(TABLE_ROWS, RUNTIME_MODE));
    if (ORIGIN_RESULTS.length === 0) return;
    const originHeader = ['source', 'variant', 'origin', 'bends90', 'bends45', 'lengthM', 'fittings'];
    for (const line of formatColumns(originHeader, originRows(ORIGIN_RESULTS), 2)) console.log(line);
    const deltaHeader = ['source', 'base', 'variant', 'origin', 'bends90', 'bends45', 'lengthM', 'fittings'];
    for (const line of formatColumns(deltaHeader, deltaRows(ORIGIN_RESULTS), 4)) console.log(line);
  });
});
