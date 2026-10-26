// route origin report
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { RouteBuildInput, PlannedRoute, RouteTrace } from './route-build.js';
import { planRoute } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { ORIGINS, splitByOrigin, type OriginPart, type OriginSplit } from './route-origin.js';
import {
  buildScenario,
  firstFloorDrawing,
  localDrawing,
  makeIdFactories,
  type Drawing,
  type Scenario,
} from './route-scenario.testutil.js';

const LOCAL_FIXTURES = [
  { file: 'ground-floor-w-rooms', name: 'w_rooms' },
  { file: '10A-rooms', name: '10A' },
];
const TEST_TIMEOUT = 120000;

interface Variant { name: string; options: RouteLayoutOptions | undefined }
const VARIANTS: Variant[] = [
  { name: 'off', options: undefined },
  { name: 'bridge', options: { bridgeParts: { penaltyMm: 0 } } },
  { name: 'bridgeLink500w', options: { bridgeParts: { penaltyMm: 0 }, linkSearch: { bendMm: 500, wallMm: 3000 } } },
];

interface Source { name: string; drawing: Drawing | null }
interface VariantResult { variant: Variant; split: OriginSplit; plan: PlannedRoute }
interface SourceResult { name: string; variants: VariantResult[] }

const RESULTS: SourceResult[] = [];

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

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function variantNamed(source: SourceResult, name: string): VariantResult {
  const found = source.variants.find((v) => v.variant.name === name);
  if (found === undefined) throw new Error(`no ${name} result for ${source.name}`);
  return found;
}

function formatTable(source: SourceResult): string {
  const header = ['source', 'variant', 'origin', 'segments', 'lengthMm', 'fittings', 'bends90', 'bends45', 'tees', 'crosses'];
  const body: string[][] = [];
  for (const v of source.variants) {
    const rows: [string, OriginPart][] = ORIGINS.map((origin) => [origin, v.split.byOrigin[origin]] as [string, OriginPart]);
    rows.push(['TOTAL', totalOf(v.split)]);
    for (const [origin, part] of rows) {
      body.push([
        source.name,
        v.variant.name,
        origin,
        String(part.segments),
        String(Math.round(part.lengthMm)),
        String(part.fittings),
        String(part.bends90),
        String(part.bends45),
        String(part.tees),
        String(part.crosses),
      ]);
    }
  }
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cells) => (cells[i] ?? '').length)));
  const formatLine = (cells: readonly string[]): string => cells.map((c, i) => (i < 3 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
  return [formatLine(header), ...body.map(formatLine)].join('\n');
}

function deltaLines(source: SourceResult): string[] {
  const off = variantNamed(source, 'off').split;
  const lines: string[] = [];
  for (const name of ['bridge', 'bridgeLink500w']) {
    const other = variantNamed(source, name).split;
    for (const origin of ORIGINS) {
      const a = other.byOrigin[origin];
      const b = off.byOrigin[origin];
      lines.push(
        `${source.name} ${name} vs off: ${origin} bends90 ${signed(Math.round(a.bends90 - b.bends90))} bends45 ${signed(Math.round(a.bends45 - b.bends45))} lengthMm ${signed(Math.round(a.lengthMm - b.lengthMm))} fittings ${signed(a.fittings - b.fittings)}`,
      );
    }
  }
  return lines;
}

describe('route origin report', () => {
  const sources = loadSources();

  for (const source of sources) {
    it.skipIf(source.drawing === null)(`${source.name}: trace does not change the plan, the origin split adds up`, () => {
      const drawing = source.drawing;
      if (drawing === null) return;
      const s = buildScenario(drawing, 'A', 0);
      if (s === null) {
        console.log(`SKIP ${source.name} A start 0: no path room`);
        return;
      }
      const variants: VariantResult[] = [];
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
        variants.push({ variant, split, plan });
      }
      RESULTS.push({ name: source.name, variants });
    }, TEST_TIMEOUT);
  }

  afterAll(() => {
    for (const source of RESULTS) console.log(formatTable(source));
    for (const source of RESULTS) for (const line of deltaLines(source)) console.log(line);
  });
});
