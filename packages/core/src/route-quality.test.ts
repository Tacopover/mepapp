import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildScenario,
  firstFloorDrawing,
  formatTable,
  localDrawing,
  measureScenario,
  runScenario,
  type Drawing,
  type Scenario,
  type ScenarioKind,
  type ScenarioRow,
  type ScenarioRun,
} from './route-scenario.testutil.js';

const LOCAL_FIXTURES = [{ file: 'ground-floor-w-rooms', name: 'ground floor w_rooms' }];
const rows: ScenarioRow[] = [];

function scenarioOf(drawing: Drawing, kind: ScenarioKind): Scenario {
  const s = buildScenario(drawing, kind, 0);
  if (s === null) throw new Error(`no path room in ${drawing.name}`);
  return s;
}

function measure(s: Scenario, label: string): { run: ScenarioRun; row: ScenarioRow } {
  const run = runScenario(s);
  const row = measureScenario(s, run, label);
  rows.push(row);
  console.log(`status ${run.status}`);
  console.log(formatTable([row]));
  return { run, row };
}

describe('route quality report', () => {
  it('first floor, scenario A: the baseline numbers', () => {
    const s = scenarioOf(firstFloorDrawing(), 'A');
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
    const s = scenarioOf(firstFloorDrawing(), 'B');
    const { run } = measure(s, 'first floor B');
    expect(run.status).toBe('ok');
    expect(run.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
    expect(run.plan.stats.ports + run.plan.stats.portsLeft).toBe(s.targetPorts.length);
  }, 60000);

  for (const spec of LOCAL_FIXTURES) {
    const drawing = localDrawing(spec.file, spec.name);
    if (drawing === null) {
      const path = fileURLToPath(new URL(`../fixtures/route-area/local/${spec.file}.json`, import.meta.url));
      console.log(`SKIP ${spec.name}: local fixture ${path} missing`);
    }
    for (const kind of ['A', 'B'] as const) {
      const s = drawing === null ? null : buildScenario(drawing, kind, 0);
      it.skipIf(s === null)(`${spec.name}, scenario ${kind}: no throw, no internal-join`, () => {
        if (s === null) return;
        const { run } = measure(s, `${spec.name} ${kind}`);
        expect(run.plan.warnings.some((w) => w.code === 'internal-join')).toBe(false);
        expect(['ok', 'refused']).toContain(run.status);
      }, 60000);
    }
  }

  afterAll(() => {
    console.log(formatTable(rows));
  });
});
