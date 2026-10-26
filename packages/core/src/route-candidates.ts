// Plans a route for each candidate layout and scores each plan (route quality research, part Q1). Reads the input and writes nothing. The caller owns the list of candidates.

import { planRoute, type PlannedRoute, type RouteBuildInput } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { DEFAULT_SCORE_WEIGHTS, routeMetrics, scoreRoute, type RouteMetrics, type ScoreWeights } from './route-metrics.js';

export interface RouteCandidateResult {
  options: RouteLayoutOptions;
  status: 'ok' | 'refused';
  plan: PlannedRoute;
  metrics: RouteMetrics;
  /** scoreRoute of the metrics. Number.POSITIVE_INFINITY when status is 'refused'. */
  score: number;
  /** Hash of the geometry (see routeSignature). Equal signatures = same geometry. */
  signature: string;
}
export interface BestRoute { best: number; results: RouteCandidateResult[] }

const round = (n: number): number => Math.round(n * 100) / 100;

function fnv1a(text: string, offsetBasis: number): string {
  let hash = offsetBasis;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Hash of the geometry of a plan. Ids are left out, so plans with equal geometry give equal signatures. */
export function routeSignature(plan: PlannedRoute): string {
  const segments = plan.segments
    .map((segment) => JSON.stringify({ n: segment.networkTypeId, g: segment.geometry.map((p) => ({ x: round(p.x), y: round(p.y) })) }))
    .sort();
  const fittings = plan.fittings
    .map((fitting) => JSON.stringify({ k: fitting.kind, p: { x: round(fitting.position.x), y: round(fitting.position.y) } }))
    .sort();
  const text = `${segments.join('|')}#${fittings.join('|')}`;
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x9747b28c);
}

/** Plans and scores each candidate in the given order. The id factories of input are shared, so the ids of later candidates continue the counter. */
export function planBestRoute(input: RouteBuildInput, candidates: readonly RouteLayoutOptions[], weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): BestRoute {
  const results = candidates.map((options): RouteCandidateResult => {
    const { status, plan } = planRoute(input, options);
    const metrics = routeMetrics({
      plan,
      rooms: input.rooms,
      area: input.area,
      mmPerPt: input.mmPerPt ?? 1,
      pageIndex: input.pageIndex,
      startStampId: input.startStampId,
      startPortId: input.startPortId,
    });
    const score = status === 'refused' ? Number.POSITIVE_INFINITY : scoreRoute(metrics, weights);
    return { options, status, plan, metrics, score, signature: routeSignature(plan) };
  });
  let best = results.length > 0 ? 0 : -1;
  for (let i = 1; i < results.length; i++) {
    if (results[i]!.score < results[best]!.score) best = i;
  }
  return { best, results };
}
