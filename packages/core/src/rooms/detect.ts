// Convenience: filter once per page, then fill for every click.

import type { Vec2 } from '../geometry.js';
import { filterWallSegments } from './filter.js';
import { fillRoomAt } from './fill.js';
import { detectAllRooms } from './detect-all.js';
import { resolveRoomAt, type ResolveMethod } from './resolve.js';
import { polygonContainsPoint } from './room.js';
import { roomConfidence } from './overlap.js';
import type { RoomLabel } from './labels.js';
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

export interface ClickFillResult {
  fill: RoomFillResult;
  method: 'plain' | ResolveMethod;
  label: RoomLabel | null; // the room label whose printed area guided the fill
  confidence: number; // 0 to 1, see roomConfidence
}

/**
 * Click-to-fill guided by the room labels of the page. The plain fill is used when it matches
 * the printed area of the label inside it, or when no label with an area applies. Otherwise the
 * fill is repaired like in label-driven detection (furniture, wide openings, bounded fill,
 * resolveRoomAt) and the repair is used when it matches the printed area. The label is the one
 * inside the plain fill; without one, the nearest label with an area within 4 m of the click.
 */
export function detectRoomAtWithLabels(
  input: WallCandidateSegments,
  seedPt: Vec2,
  mmPerPt: number,
  labels: readonly RoomLabel[],
  params: Partial<RoomDetectionParams> = {},
  cache?: RoomDetectionCache,
  tolerance = 0.15,
): ClickFillResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  const walls = cachedWalls(input, mmPerPt, P, cache);
  const plain = fillRoomAt(walls, seedPt, mmPerPt, P);
  const usable = !plain.flags.fillEmpty;
  const inside = usable ? labels.filter((l) => l.name !== null && polygonContainsPoint(plain.polygon, l.anchor)) : [];
  const dist = (l: RoomLabel): number => Math.hypot(l.anchor.x - seedPt.x, l.anchor.y - seedPt.y);
  const withArea = (list: readonly RoomLabel[]): RoomLabel | undefined => list.filter((l) => l.areaM2 !== null && l.areaM2 > 0).sort((x, y) => dist(x) - dist(y))[0];
  const label = inside.length > 0 ? withArea(inside) : withArea(labels.filter((l) => dist(l) * mmPerPt <= 4000));
  const printed = label?.areaM2 ?? null;
  const rate = (f: RoomFillResult, method: ClickFillResult['method']): number => roomConfidence(method, printed ? f.areaM2 / printed - 1 : null);
  if (!label || printed === null) return { fill: plain, method: 'plain', label: null, confidence: roomConfidence('plain', null) };
  const matches = (f: RoomFillResult): boolean => !f.flags.fillEmpty && (Math.abs(f.areaM2 / printed - 1) <= tolerance || Math.abs(f.areaM2 - printed) <= 2);
  if (usable && !plain.flags.touchesRoiBorder && matches(plain)) return { fill: plain, method: 'plain', label, confidence: rate(plain, 'plain') };
  const r = resolveRoomAt(walls, seedPt, printed, mmPerPt, P, { tolerance });
  if (matches(r.fill) && polygonContainsPoint(r.fill.polygon, seedPt)) return { fill: r.fill, method: r.method, label, confidence: rate(r.fill, r.method) };
  return { fill: plain, method: 'plain', label: null, confidence: roomConfidence('plain', null) };
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
