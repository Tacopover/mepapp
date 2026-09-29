// Convenience: filter once per page, then fill for every click.

import type { Vec2 } from '../geometry.js';
import { filterWallSegments } from './filter.js';
import { fillRoomAt } from './fill.js';
import {
  DEFAULT_ROOM_DETECTION_PARAMS,
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
  const key = filterKey(P);
  let walls: FilteredWalls;
  if (
    cache?.filtered &&
    cache.segments === input.segments &&
    cache.segmentCount === input.segmentCount &&
    cache.mmPerPt === mmPerPt &&
    cache.paramsKey === key
  ) {
    walls = cache.filtered;
  } else {
    walls = { walls: input, keep: filterWallSegments(input, mmPerPt, P).keep };
    if (cache) {
      cache.segments = input.segments;
      cache.segmentCount = input.segmentCount;
      cache.mmPerPt = mmPerPt;
      cache.paramsKey = key;
      cache.filtered = walls;
    }
  }
  return fillRoomAt(walls, seedPt, mmPerPt, P);
}
