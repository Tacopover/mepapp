import { describe, expect, it } from 'vitest';
import { planRoute, type RouteBuildInput } from './route-build.js';
import { DEFAULT_SCORE_WEIGHTS, scoreRoute } from './route-metrics.js';
import { planBestRoute, routeSignature } from './route-candidates.js';
import { buildScenario, firstFloorDrawing, makeIdFactories, type Scenario } from './route-scenario.testutil.js';

function inputFor(s: Scenario, ids: ReturnType<typeof makeIdFactories>, mmPerPt: number | null = s.drawing.mmPerPt): RouteBuildInput {
  return {
    startStampId: s.startStampId,
    startPortId: s.startPortId,
    networkTypeId: s.networkTypeId,
    targetPorts: s.targetPorts,
    state: { stamps: s.stamps, segments: [], fittings: [], portGroups: [] },
    removal: { segmentIds: [], fittingIds: [] },
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt,
    pageIndex: s.pageIndex,
    newSegmentId: ids.newSegmentId,
    newFittingId: ids.newFittingId,
  };
}

function idsFrom(start: number): ReturnType<typeof makeIdFactories> {
  let counter = start;
  return {
    newSegmentId: () => `x-s${counter++}`,
    newFittingId: () => `x-f${counter++}`,
  };
}

const CANDIDATES = [{}, { bridgeParts: { penaltyMm: 0 } }];

describe('planBestRoute on the first floor', () => {
  const scenario = buildScenario(firstFloorDrawing(), 'A', 0)!;

  it('plans and scores each candidate and picks the lowest score', () => {
    const { best, results } = planBestRoute(inputFor(scenario, makeIdFactories()), CANDIDATES);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    for (const r of results) expect(r.score).toBe(scoreRoute(r.metrics));
    expect(best).toBe(results[1]!.score < results[0]!.score ? 1 : 0);
    expect(results[0]!.options).toBe(CANDIDATES[0]);
    expect(routeSignature(results[0]!.plan)).toBe(routeSignature(planRoute(inputFor(scenario, makeIdFactories()), {}).plan));
  });

  it('follows the lowest score with other weights', () => {
    const weights = { ...DEFAULT_SCORE_WEIGHTS, bend90: 1_000_000 };
    const { best, results } = planBestRoute(inputFor(scenario, makeIdFactories()), CANDIDATES, weights);
    for (const r of results) expect(r.score).toBe(scoreRoute(r.metrics, weights));
    expect(best).toBe(results[1]!.score < results[0]!.score ? 1 : 0);
  });

  it('gives a tie to the lower index and equal signatures for equal candidates', () => {
    const { best, results } = planBestRoute(inputFor(scenario, makeIdFactories()), [{}, {}]);
    expect(results[0]!.score).toBe(results[1]!.score);
    expect(best).toBe(0);
    expect(results[0]!.signature).toBe(results[1]!.signature);
  });

  it('gives different signatures for different geometry and equal signatures when only ids change', () => {
    const { results } = planBestRoute(inputFor(scenario, makeIdFactories()), CANDIDATES);
    expect(results[0]!.signature).not.toBe(results[1]!.signature);

    const first = planBestRoute(inputFor(scenario, makeIdFactories()), [{}]).results[0]!;
    const shifted = planBestRoute(inputFor(scenario, idsFrom(1000)), [{}]).results[0]!;
    expect(shifted.plan.segments[0]!.id).not.toBe(first.plan.segments[0]!.id);
    expect(shifted.signature).toBe(first.signature);
  });

  it('refuses every candidate without calibration and picks index 0', () => {
    const { best, results } = planBestRoute(inputFor(scenario, makeIdFactories(), null), CANDIDATES);
    expect(results.every((r) => r.status === 'refused')).toBe(true);
    for (const r of results) expect(r.score).toBe(Number.POSITIVE_INFINITY);
    expect(best).toBe(0);
  });

  it('gives best -1 and no results for an empty candidate list', () => {
    expect(planBestRoute(inputFor(scenario, makeIdFactories()), [])).toEqual({ best: -1, results: [] });
  });

  it('gives the same scores and signatures on two calls with fresh factories', () => {
    const a = planBestRoute(inputFor(scenario, makeIdFactories()), CANDIDATES);
    const b = planBestRoute(inputFor(scenario, makeIdFactories()), CANDIDATES);
    expect(a.results.map((r) => [r.score, r.signature])).toEqual(b.results.map((r) => [r.score, r.signature]));
  });
});
