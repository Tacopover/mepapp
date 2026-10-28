import { describe, expect, it } from 'vitest';
import type { RouteTrace } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { roomLabelPoint } from './rooms/room.js';
import type { RouteStamp } from './route-ports.js';
import { buildScenario, firstFloorDrawing, makeIdFactories, planHash, runScenario, shuffledScenario, type ScenarioKind } from './route-scenario.testutil.js';
import { terminalRoomIdsOf } from './route-two-level.js';

const KINDS: readonly ScenarioKind[] = ['A', 'B'];

function scenarioOf(kind: ScenarioKind) {
  const s = buildScenario(firstFloorDrawing(), kind, 0);
  if (s === null) throw new Error(`no path room for kind ${kind}`);
  return s;
}

describe.each(KINDS)('two-level plan, kind %s', (kind) => {
  it('plans ok with no internal-join or free-angle warning and counts every target port', () => {
    const s = scenarioOf(kind);
    const trace: RouteTrace = { paths: [] };
    const run = runScenario(s, makeIdFactories(), { twoLevel: {} }, trace);
    expect(run.status).toBe('ok');
    const codes = run.plan.warnings.map((warning) => warning.code);
    expect(codes).not.toContain('internal-join');
    expect(codes).not.toContain('free-angle');
    expect(run.plan.stats.ports + run.plan.stats.portsLeft).toBe(s.targetPorts.length);
    const leftWarning = run.plan.warnings.find((warning) => warning.code === 'ports-left');
    expect(run.plan.stats.portsLeft).toBe(leftWarning?.count ?? 0);
    for (const leg of trace.paths) expect(['trunk', 'branch', 'spine', 'link']).toContain(leg.origin);
    expect(trace.paths.some((leg) => leg.origin === 'trunk')).toBe(true);
  });

  it('gives the same plan for the same input twice and the same counts for shuffled input', () => {
    const s = scenarioOf(kind);
    const first = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const again = runScenario(s, makeIdFactories(), { twoLevel: {} });
    expect(planHash(again.plan)).toBe(planHash(first.plan));
    for (const seed of [1, 2]) {
      const shuffled = shuffledScenario(firstFloorDrawing(), kind, 0, seed);
      if (shuffled === null) throw new Error(`no path room after shuffle, seed ${seed}`);
      const actual = runScenario(shuffled, makeIdFactories(), { twoLevel: {} });
      expect(actual.plan.stats.segments, `seed ${seed} segments`).toBe(first.plan.stats.segments);
      expect(actual.plan.stats.fittings, `seed ${seed} fittings`).toBe(first.plan.stats.fittings);
      expect(actual.plan.stats.bends90, `seed ${seed} bends90`).toBe(first.plan.stats.bends90);
      expect(actual.plan.stats.portsLeft, `seed ${seed} portsLeft`).toBe(first.plan.stats.portsLeft);
      expect(actual.plan.stats.rooms, `seed ${seed} rooms`).toBe(first.plan.stats.rooms);
      expect(Math.abs(actual.plan.stats.lengthMm - first.plan.stats.lengthMm) / first.plan.stats.lengthMm, `seed ${seed} lengthMm`).toBeLessThanOrEqual(0.001);
    }
  });

  it('ignores the old layout options when twoLevel is set', () => {
    const s = scenarioOf(kind);
    const oldOptions: RouteLayoutOptions = {
      twoLevel: {},
      exactSpine: { maxPorts: 6 },
      linkSearch: { bendMm: 500, wallMm: 3000 },
      entryRule: 'shortest-branch',
      jogSmallJumpMm: 0,
      bridgeParts: { penaltyMm: 1000 },
      trunkBends: { bendMm: 500, fittingMm: 200 },
    };
    const plain = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const withOld = runScenario(s, makeIdFactories(), oldOptions);
    expect(planHash(withOld.plan)).toBe(planHash(plain.plan));
  });

  it('gives no room-chained warning with maxChainDepth 0 and stays ok', () => {
    const s = scenarioOf(kind);
    const run = runScenario(s, makeIdFactories(), { twoLevel: { maxChainDepth: 0 } });
    expect(run.status).toBe('ok');
    expect(run.plan.warnings.map((warning) => warning.code)).not.toContain('room-chained');
  });
});

describe('two-level plan options', () => {
  it('gives the twoLevel plan when roomBranches is also set', () => {
    const s = scenarioOf('A');
    const plain = runScenario(s, makeIdFactories(), { twoLevel: {} });
    const both = runScenario(s, makeIdFactories(), { twoLevel: {}, roomBranches: { searchMm: 30000 } });
    expect(planHash(both.plan)).toBe(planHash(plain.plan));
  });
});

describe('terminalRoomIdsOf', () => {
  it('returns the room of a routing target port for any route type', () => {
    const room = firstFloorDrawing().rooms[0]!;
    const at = roomLabelPoint(room);
    const stamp: RouteStamp = {
      id: 'term-1',
      category: 'terminal',
      transform: { position: { x: at.x, y: at.y }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 20,
      nativeHeight: 20,
      ports: [{ id: 'in', name: 'in', fractionX: 0.5, fractionY: 0.5 }],
      routingTargets: { in: 'return-air' },
    };
    expect([...terminalRoomIdsOf([stamp], [room], room.pageIndex)]).toEqual([room.id]);
  });
});
