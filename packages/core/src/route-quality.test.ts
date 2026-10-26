import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildScenario,
  firstFloorDrawing,
  formatBaselineTable,
  localDrawing,
  makeIdFactories,
  measureRuntime,
  measureScenario,
  planGeometry,
  planHash,
  runScenario,
  shuffledScenario,
  type BaselineRow,
  type Drawing,
  type Scenario,
  type ScenarioKind,
  type ScenarioRun,
  type ScenarioRow,
} from './route-scenario.testutil.js';

const LOCAL_FIXTURES = [
  { file: 'ground-floor-w-rooms', name: 'ground floor w_rooms' },
  { file: '10A-rooms', name: '10A' },
];
const START_INDEXES = [0, 1, 2];
const KNOWN_D2_DEFECTS: { drawing: string; kind: ScenarioKind; seed: number }[] = [
  { drawing: 'first floor', kind: 'A', seed: 1 },
  { drawing: 'first floor', kind: 'B', seed: 1 },
  { drawing: '10A', kind: 'B', seed: 2 },
  { drawing: 'first floor', kind: 'B', seed: 2 },
];
const HASH_ENV = 'MEPAPP_HASH_OUT';
const FULL_ENV = 'MEPAPP_QUALITY_FULL';
const TEST_TIMEOUT = 120000;
const CORE_DIR = fileURLToPath(new URL('..', import.meta.url));
const VITEST_BIN = join(CORE_DIR, 'node_modules', 'vitest', 'vitest.mjs');
const baseline: BaselineRow[] = [];
const FULL_RUNTIME = process.env[FULL_ENV] === '1';
const RUNTIME_MODE = FULL_RUNTIME ? 'full (2 warm-ups, 7 runs)' : 'fast (1 warm-up, 3 runs)';
const RUNTIME_WARMUPS = FULL_RUNTIME ? 2 : 1;
const RUNTIME_RUNS = FULL_RUNTIME ? 7 : 3;

function scenarioOf(drawing: Drawing, kind: ScenarioKind): Scenario {
  const s = buildScenario(drawing, kind, 0);
  if (s === null) throw new Error(`no path room in ${drawing.name}`);
  return s;
}

function measure(s: Scenario, label: string): { run: ScenarioRun; row: ScenarioRow } {
  const run = runScenario(s);
  const row = measureScenario(s, run, label);
  console.log(`status ${run.status}`);
  return { run, row };
}

interface Source { name: string; drawing: Drawing | null; optional: boolean }

interface Point { x: number; y: number }
interface GeometryLike { segments: { geometry: Point[] }[]; fittings: { position: Point }[]; stats: { lengthMm: number } }
interface CountSummary { segments: number; fittings: number; bends90: number; bends45: number; wallCrossings: number; offGraphRooms: number; warnings: string[] }

function firstGeometryDifference(expected: GeometryLike, actual: GeometryLike): string | null {
  for (let i = 0; i < Math.max(expected.segments.length, actual.segments.length); i++) {
    const a = expected.segments[i];
    const b = actual.segments[i];
    if (!a || !b) return `sorted segment index ${i} present in one plan only`;
    for (let p = 0; p < Math.max(a.geometry.length, b.geometry.length); p++) {
      const pa = a.geometry[p];
      const pb = b.geometry[p];
      if (!pa || !pb) return `sorted segment index ${i} point ${p} present in one plan only`;
      const delta = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (delta > 0) return `sorted segment index ${i} point ${p} delta ${delta} pt`;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) return `sorted segment index ${i} fields other than geometry differ`;
  }
  for (let i = 0; i < Math.max(expected.fittings.length, actual.fittings.length); i++) {
    const a = expected.fittings[i];
    const b = actual.fittings[i];
    if (!a || !b) return `fitting ${i} present in one plan only`;
    const delta = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    if (delta > 0) return `fitting ${i} delta ${delta} pt`;
  }
  if (expected.stats.lengthMm !== actual.stats.lengthMm) return `stats.lengthMm ${expected.stats.lengthMm} vs ${actual.stats.lengthMm}`;
  return null;
}

function countSummary(s: Scenario, label: string): { counts: CountSummary; lengthMm: number } {
  const run = runScenario(s, makeIdFactories());
  const { metrics: m } = measureScenario(s, run, label);
  return {
    counts: {
      segments: m.segments,
      fittings: m.fittings,
      bends90: m.bends90,
      bends45: m.bends45,
      wallCrossings: m.wallCrossings,
      offGraphRooms: m.offGraphRooms,
      warnings: run.plan.warnings.map((w) => w.code).sort(),
    },
    lengthMm: m.lengthMm,
  };
}

function shuffledGeometries(drawing: Drawing, kind: ScenarioKind): { expected: GeometryLike; actual: { seed: number; geometry: GeometryLike }[] } {
  const expected = planGeometry(runScenario(scenarioOf(drawing, kind), makeIdFactories()).plan) as GeometryLike;
  const actual = [1, 2].map((seed) => {
    const shuffled = shuffledScenario(drawing, kind, 0, seed);
    if (shuffled === null) throw new Error(`no path room after shuffle, seed ${seed}`);
    return { seed, geometry: planGeometry(runScenario(shuffled, makeIdFactories()).plan) as GeometryLike };
  });
  return { expected, actual };
}

describe('route quality report', () => {
  const firstFloor = firstFloorDrawing();
  const sources: Source[] = [{ name: 'first floor', drawing: firstFloor, optional: false }];
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

  it('first floor, scenario A: the baseline numbers', () => {
    const s = scenarioOf(firstFloor, 'A');
    const { run, row } = measure(s, 'first floor A');
    const m = row.metrics;
    expect(run.status).toBe('ok');
    expect(run.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(m.segments).toBe(109);
    expect(m.fittings).toBe(76);
    expect(Math.round(m.lengthMm)).toBe(151366);
    expect(m.bends90).toBe(35);
    expect(m.bends45).toBe(10);
    expect(m.wallCrossings).toBe(26);
    expect(m.offGraphRooms).toBe(28);
    expect(run.plan.stats.segments).toBe(109);
    expect(run.plan.stats.fittings).toBe(76);
    expect(Math.round(run.plan.stats.lengthMm)).toBe(151366);
    expect(run.plan.stats.bends90).toBe(35);
    expect(run.plan.stats.bends45).toBe(10);
    expect(run.plan.stats.wallCrossings).toBe(26);
  }, 60000);

  it('first floor, scenario B: four ports per room reach the planner', () => {
    const s = scenarioOf(firstFloor, 'B');
    const { run } = measure(s, 'first floor B');
    expect(run.status).toBe('ok');
    expect(run.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(run.plan.stats.ports + run.plan.stats.portsLeft).toBe(s.targetPorts.length);
  }, 60000);

  for (const source of sources) {
    for (const kind of ['A', 'B'] as const) {
      for (const startIndex of START_INDEXES) {
        it.skipIf(source.drawing === null)(`${source.name}, scenario ${kind}, start ${startIndex}: no internal-join, baseline row`, () => {
          const drawing = source.drawing;
          if (drawing === null) return;
          const label = `${source.name} ${kind} start ${startIndex}`;
          let s: Scenario | null = null;
          try {
            s = buildScenario(drawing, kind, startIndex);
          } catch (e) {
            if (!source.optional) throw e;
            console.log(`SKIP ${label}: scenario build failed: ${e instanceof Error ? e.message : String(e)}`);
            return;
          }
          if (s === null) {
            console.log(`SKIP ${label}: no path room`);
            return;
          }
          const { run, row } = measure(s, label);
          expect(run.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
          expect(['ok', 'refused']).toContain(run.status);
          const runtime = measureRuntime(s, RUNTIME_WARMUPS, RUNTIME_RUNS);
          if (source.name === 'first floor' && kind === 'A' && startIndex === 0) {
            expect(runtime.medianMs).toBeLessThanOrEqual(300);
          }
          baseline.push({ scenario: `${source.name} ${kind}`, startIndex, startRoomId: s.startRoom.id, row, runtime });
        }, TEST_TIMEOUT);
      }
    }
  }

  for (const source of sources) {
    for (const kind of ['A', 'B'] as const) {
      it.skipIf(source.drawing === null)(`${source.name}, scenario ${kind}: determinism D1, two runs give the same plan`, () => {
        const drawing = source.drawing;
        if (drawing === null) return;
        const s = buildScenario(drawing, kind, 0);
        if (s === null) {
          console.log(`SKIP ${source.name} ${kind}: no path room`);
          return;
        }
        const planA = runScenario(s, makeIdFactories()).plan;
        const planB = runScenario(s, makeIdFactories()).plan;
        expect(planA).toEqual(planB);
      }, TEST_TIMEOUT);

      const geometries = source.drawing === null ? null : shuffledGeometries(source.drawing, kind);
      for (const seed of [1, 2]) {
        const d2Name = `${source.name}, scenario ${kind}, seed ${seed}: determinism D2, shuffled input gives the same geometry`;
        const d2 = (): void => {
          if (geometries === null) return;
          const diff = firstGeometryDifference(geometries.expected, geometries.actual[seed - 1].geometry);
          if (diff !== null) console.log(`first geometry difference, ${source.name} ${kind} seed ${seed}: ${diff}`);
          expect(diff, `seed ${seed}`).toBeNull();
        };
        if (geometries === null) it.skip(d2Name, d2, TEST_TIMEOUT);
        else if (KNOWN_D2_DEFECTS.some((d) => d.drawing === source.name && d.kind === kind && d.seed === seed)) {
          // known defect: planner is order dependent (sub-mm geometry shift; other terminal port or other non-geometry field in scenario B), see plan section 10
          it.fails(d2Name, d2, TEST_TIMEOUT);
        } else it(d2Name, d2, TEST_TIMEOUT);
      }

      it.skipIf(source.drawing === null)(`${source.name}, scenario ${kind}: determinism D2 (counts), shuffled input gives the same counts`, () => {
        const drawing = source.drawing;
        if (drawing === null) return;
        const base = buildScenario(drawing, kind, 0);
        if (base === null) {
          console.log(`SKIP ${source.name} ${kind}: no path room`);
          return;
        }
        const expected = countSummary(base, `${source.name} ${kind} base`);
        for (const seed of [1, 2]) {
          const shuffled = shuffledScenario(drawing, kind, 0, seed);
          if (shuffled === null) throw new Error(`no path room after shuffle, seed ${seed}`);
          const actual = countSummary(shuffled, `${source.name} ${kind} seed ${seed}`);
          expect(actual.counts, `seed ${seed}`).toEqual(expected.counts);
          expect(Math.abs(actual.lengthMm - expected.lengthMm) / expected.lengthMm, `seed ${seed} lengthMm`).toBeLessThanOrEqual(0.001);
        }
      }, TEST_TIMEOUT);
    }
  }

  it.skipIf(process.env[HASH_ENV] !== undefined)('determinism D3, two processes give the same plan hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'route-hash-'));
    try {
      const hashes: unknown[] = [];
      for (const n of [1, 2]) {
        const out = join(dir, `hash-${n}.json`);
        const r = spawnSync(process.execPath, [VITEST_BIN, 'run', 'src/route-quality.test.ts', '-t', 'hash probe'], {
          cwd: CORE_DIR,
          env: { ...process.env, [HASH_ENV]: out },
          encoding: 'utf8',
          timeout: TEST_TIMEOUT,
        });
        expect(r.status, r.stdout + r.stderr).toBe(0);
        hashes.push(JSON.parse(readFileSync(out, 'utf8')));
      }
      expect(hashes[0]).toEqual(hashes[1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it.skipIf(process.env[HASH_ENV] === undefined)('hash probe', () => {
    const out = process.env[HASH_ENV];
    if (out === undefined) return;
    const hashOf = (kind: ScenarioKind): string => planHash(runScenario(scenarioOf(firstFloor, kind), makeIdFactories()).plan);
    writeFileSync(out, JSON.stringify({ A: hashOf('A'), B: hashOf('B') }));
  }, TEST_TIMEOUT);

  afterAll(() => {
    if (baseline.length > 0) console.log(formatBaselineTable(baseline, RUNTIME_MODE));
  });
});
