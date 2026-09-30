// Convenience: filter once per page, then fill for every click.

import type { Vec2 } from '../geometry.js';
import { filterWallSegments } from './filter.js';
import { fillRoomAt } from './fill.js';
import { detectAllRooms } from './detect-all.js';
import { detectLabelledRooms, type LabelledOptions, type LabelledResult, type LabelTarget } from './labelled.js';
import {
  DEFAULT_ROOM_DETECTION_PARAMS,
  type DetectAllOptions,
  type DetectAllResult,
  type FilteredWalls,
  type RoomDetectionCache,
  type RoomDetectionParams,
  type RoomFillParams,
  type RoomFillResult,
  type WallCandidateSegments,
} from './types.js';

// Fill parameters do not change the keep flags, so they stay out of the cache key.
const FILL_KEYS: ReadonlySet<string> = new Set<keyof RoomFillParams>([
  'gapMm',
  'pxMm',
  'seedRadiusMm',
  'roiMm',
  'wallGrowMm',
  'fillHoles',
  'seedClosed',
  'autoSeed',
  'simplifyTolPx',
  'openRatio',
  'labelAreaM2',
]);

function filterKey(params: RoomDetectionParams): string {
  return Object.entries(params)
    .filter(([k]) => !FILL_KEYS.has(k))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',');
}

function cachedWalls(input: WallCandidateSegments, mmPerPt: number, P: RoomDetectionParams, cache?: RoomDetectionCache): FilteredWalls {
  const key = filterKey(P);
  if (
    cache?.filtered &&
    cache.segments === input.segments &&
    cache.segmentCount === input.segmentCount &&
    cache.mmPerPt === mmPerPt &&
    cache.paramsKey === key
  ) {
    return cache.filtered;
  }
  const walls: FilteredWalls = { walls: input, keep: filterWallSegments(input, mmPerPt, P).keep };
  if (cache) {
    cache.segments = input.segments;
    cache.segmentCount = input.segmentCount;
    cache.mmPerPt = mmPerPt;
    cache.paramsKey = key;
    cache.filtered = walls;
  }
  return walls;
}

/**
 * Runs the wall filter (or reuses the result stored in `cache`) and fills the
 * room at `seedPt`. The cache is valid while the segment array, the segment
 * count, mmPerPt and the filter parameters stay the same. The caller owns the
 * cache object and passes the same one for repeated clicks on one page.
 */
export function detectRoomAt(
  input: WallCandidateSegments,
  seedPt: Vec2,
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
  cache?: RoomDetectionCache,
): RoomFillResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  return fillRoomAt(cachedWalls(input, mmPerPt, P, cache), seedPt, mmPerPt, P);
}

/**
 * Runs the wall filter (or reuses the cache, shared with detectRoomAt) and
 * detects every closed room on the page. Runs in one synchronous call; call it
 * from a Web Worker and use options.onProgress / shouldCancel.
 */
export function detectAllRoomsOnPage(
  input: WallCandidateSegments,
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
  options: DetectAllOptions = {},
  cache?: RoomDetectionCache,
): DetectAllResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  options.onProgress?.(0, 'filter');
  return detectAllRooms(cachedWalls(input, mmPerPt, P, cache), mmPerPt, P, options);
}

/** Filter (or cache) plus label-driven detection: one room per label. See labelled.ts. */
export function detectLabelledRoomsOnPage(
  input: WallCandidateSegments,
  targets: readonly LabelTarget[],
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
  options: LabelledOptions = {},
  cache?: RoomDetectionCache,
): LabelledResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  options.onProgress?.(0, 'filter');
  return detectLabelledRooms(cachedWalls(input, mmPerPt, P, cache), targets, mmPerPt, P, options);
}
