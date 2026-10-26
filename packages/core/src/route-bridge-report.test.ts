import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { RouteLayoutOptions } from './route-layout.js';
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
  { file: 'ground-floor-w-rooms', name: 'ground floor w_rooms' },
  { file: '10A-rooms', name: '10A' },
];
const FULL_ENV = 'MEPAPP_QUALITY_FULL';
const TEST_TIMEOUT = 120000;
const FULL_RUNTIME = process.env[FULL_ENV] === '1';
const RUNTIME_MODE = FULL_RUNTIME ? 'full (2 warm-ups, 7 runs)' : 'fast (1 warm-up, 3 runs)';
const RUNTIME_WARMUPS = FULL_RUNTIME ? 2 : 1;
const RUNTIME_RUNS = FULL_RUNTIME ? 7 : 3;
const STARTS = [0, 1, 2];
const PLAN: [ScenarioKind, number[]][] = FULL_RUNTIME ? [['A', STARTS], ['B', STARTS]] : [['A', STARTS]];

interface Variant { name: string; options: RouteLayoutOptions | undefined }
const VARIANTS: Variant[] = [
  { name: 'off', options: undefined },
  { name: 'bridge0', options: { bridgeParts: { penaltyMm: 0 } } },
  { name: 'bridge3000', options: { bridgeParts: { penaltyMm: 3000 } } },
];

interface Source { name: string; drawing: Drawing | null; optional: boolean }
interface Case { label: string; startIndex: number; s: Scenario; variants: Variant[] }
interface Measured { label: string; startIndex: number; variant: Variant; run: ScenarioRun; row: ScenarioRow; medianMs: number; maxMs: number }
interface SourceRun { cases: Case[]; rows: Measured[] }

const TABLE_ROWS: Measured[] = [];
const SOURCE_RUNS = new Map<string, SourceRun>();

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
  if (FULL_RUNTIME || (kind === 'A' && startIndex === 0)) return VARIANTS;
  return VARIANTS.filter((v) => v.name !== 'bridge3000');
}

function buildCases(source: Source, drawing: Drawing): Case[] {
  const cases: Case[] = [];
  for (const [kind, starts] of PLAN) {
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
  if (source.name === 'first floor') {
    const line = rows.filter((r) => r.label === 'first floor A' && r.startIndex === 0);
    console.log(line.map((r) => `${r.variant.name}: offGraphRooms ${r.row.metrics.offGraphRooms}, freeLegs ${r.row.metrics.freeLegs}, lengthMm ${Math.round(r.row.metrics.lengthMm)}`).join(' | '));
  }
  return run;
}

function checkSafety(run: SourceRun): void {
  for (const c of run.cases) {
    const group = groupOf(run.rows, c);
    const off = group.find((r) => r.variant.name === 'off');
    if (off === undefined) throw new Error(`no off row for ${c.label} start ${c.startIndex}`);
    expect(runScenario(c.s, makeIdFactories()).plan).toEqual(runScenario(c.s, makeIdFactories(), {}).plan);
    for (const m of group) {
      if (m.variant.name === 'off') continue;
      const label = `${c.label} start ${c.startIndex} ${m.variant.name}`;
      expect(m.run.status, label).toBe('ok');
      expect(m.run.plan.warnings.some((w) => w.code === 'internal-join'), label).toBe(false);
      expect(m.row.metrics.offGraphRooms, label).toBeLessThanOrEqual(off.row.metrics.offGraphRooms);
      const first = runScenario(c.s, makeIdFactories(), m.variant.options).plan;
      const second = runScenario(c.s, makeIdFactories(), m.variant.options).plan;
      expect(first, label).toEqual(second);
    }
  }
}

function freeLegsAboveOff(run: SourceRun): string[] {
  const bad: string[] = [];
  for (const c of run.cases) {
    const group = groupOf(run.rows, c);
    const off = group.find((r) => r.variant.name === 'off');
    if (off === undefined) throw new Error(`no off row for ${c.label} start ${c.startIndex}`);
    for (const m of group) {
      if (m.variant.name === 'off') continue;
      if (m.row.metrics.freeLegs > off.row.metrics.freeLegs) {
        bad.push(`${c.label} start ${c.startIndex} ${m.variant.name}: freeLegs ${m.row.metrics.freeLegs} above off ${off.row.metrics.freeLegs}`);
      }
    }
  }
  return bad;
}

function formatTable(rows: readonly Measured[], mode: string): string {
  const header = ['scenario', 'start', 'variant', 'segments', 'fittings', 'lengthMm', 'bends90', 'bends45', 'wallCrossings', 'offGraphRooms', 'noEntryRooms', 'portsLeft', 'freeLegs', 'score', 'median ms', 'max ms'];
  const body = rows.map((r) => {
    const m = r.row.metrics;
    const numbers = [m.segments, m.fittings, m.lengthMm, m.bends90, m.bends45, m.wallCrossings, m.offGraphRooms, m.noEntryRooms, m.portsLeft, m.freeLegs];
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
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cells) => (cells[i] ?? '').length)));
  const formatLine = (cells: readonly string[]): string => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
  return [`${formatLine(header)}  runtime: ${mode}`, ...body.map(formatLine)].join('\n');
}

describe('route bridge report', () => {
  const sources = loadSources();

  for (const source of sources) {
    it.skipIf(source.drawing === null)(`${source.name}: off equals off with {}, status ok, no internal-join, offGraphRooms, determinism`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      checkSafety(runSource(source, drawing));
    }, TEST_TIMEOUT);

    it.skipIf(source.drawing === null)(`${source.name}: freeLegs of each bridge variant is not above off`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      expect(freeLegsAboveOff(runSource(source, drawing)), 'rows with freeLegs above off').toEqual([]);
    }, TEST_TIMEOUT);
  }

  afterAll(() => {
    if (TABLE_ROWS.length > 0) console.log(formatTable(TABLE_ROWS, RUNTIME_MODE));
  });
});
