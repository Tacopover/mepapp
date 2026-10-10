// Stamp positions in a room (room-auto-placement.md Phases 4 and 6, room-placement-guide.md Phase A):
// the Center, Grid, Even spread and Along-the-walls layouts, the By coverage count and the check of
// the min distance between stamps. All geometry is in displayed page space (points, y down), the
// space of the room polygon and of placed stamps. Pure functions, no I/O.

import type { Calibration } from '../calibration.js';
import type { Vec2 } from '../geometry.js';
import type { PlacedStamp } from '../stamp.js';
import { polygonContainsPoint, roomBounds, roomLabelPoint, type Room } from './room.js';
import { roomMinBoundingRect } from './room-values.js';
import {
  calculateRooms,
  REQUIREMENT_WARNING_TEXT,
  type CoverageLimits,
  type GridStyle,
  type PlacementRule,
  type RoomCalculationRow,
  type RoomRequirement,
  type RequirementWarning,
} from './placement-rule.js';
import { areaToM2, lengthToM } from './placement-units.js';
import type { RoomValues } from './room-values.js';
import type { RoomPolygon } from './types.js';

export type LayoutWarning =
  /** No point of the room is far enough from the walls; the stamp is at the label point. */
  | 'noFit'
  /** Points of the grid fell outside the room (or too near a wall) and moved to the nearest valid point. */
  | 'movedInside'
  /** Center got more than one element: Grid was used. */
  | 'layoutFallback'
  /** By coverage: part of the room is farther than the coverage radius from every stamp (the max count, the wall offset or the layout stops it). */
  | 'coverageNotMet'
  /** Two stamps are closer than the min distance between stamps. */
  | 'tooClose';

export const LAYOUT_WARNING_TEXT: Record<LayoutWarning, string> = {
  noFit: 'does not fit: placed at the label point',
  movedInside: 'points moved inside the room',
  layoutFallback: 'grid layout used',
  coverageNotMet: 'coverage not met in part of the room',
  tooClose: 'stamps closer than the min distance',
};

export interface LayoutResult {
  points: Vec2[];
  warnings: LayoutWarning[];
  /** A rotation per point, in degrees, when the layout gives one (Along the walls). */
  rotations?: number[];
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from the point to the nearest wall: an edge of the outer ring or of a hole. */
export function distanceToWalls(polygon: RoomPolygon, p: Vec2): number {
  let best = Infinity;
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0; i < ring.length; i++) best = Math.min(best, segmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return best;
}

/** True when the point is inside the room and at least `offsetPt` from every wall. */
export function isValidPlacementPoint(polygon: RoomPolygon, p: Vec2, offsetPt: number): boolean {
  return polygonContainsPoint(polygon, p) && distanceToWalls(polygon, p) >= offsetPt - 1e-9;
}

const SAMPLES = 48;

/**
 * Points in square cells of size `cell`, to find the points near a position without a scan of all
 * points. A query radius must be at most the cell size.
 */
export class PointHash {
  private readonly cells = new Map<string, Vec2[]>();
  constructor(private readonly cell: number) {}
  private key(ix: number, iy: number): string {
    return `${ix},${iy}`;
  }
  add(p: Vec2): void {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell));
    const list = this.cells.get(k);
    if (list) list.push(p);
    else this.cells.set(k, [p]);
  }
  /** True when a point of the hash is closer than `r` to `q`. */
  hasWithin(q: Vec2, r: number): boolean {
    const ix = Math.floor(q.x / this.cell);
    const iy = Math.floor(q.y / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const t of this.cells.get(this.key(ix + dx, iy + dy)) ?? []) if (Math.hypot(t.x - q.x, t.y - q.y) < r) return true;
      }
    }
    return false;
  }
}

// The valid samples of nearestValidPoint per room polygon and offset: a layout asks for many points of the same room.
const validSampleCache = new WeakMap<RoomPolygon, Map<number, Vec2[]>>();

/** The samples of a (SAMPLES + 1)² grid over the room's bounds that are valid placement points, in grid order. */
function validGridSamples(room: Pick<Room, 'polygon'>, offsetPt: number): Vec2[] {
  let byOffset = validSampleCache.get(room.polygon);
  if (!byOffset) validSampleCache.set(room.polygon, (byOffset = new Map()));
  const cached = byOffset.get(offsetPt);
  if (cached) return cached;
  const b = roomBounds(room);
  const out: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    for (let j = 0; j <= SAMPLES; j++) {
      const q = { x: b.minX + ((b.maxX - b.minX) * i) / SAMPLES, y: b.minY + ((b.maxY - b.minY) * j) / SAMPLES };
      if (isValidPlacementPoint(room.polygon, q, offsetPt)) out.push(q);
    }
  }
  byOffset.set(offsetPt, out);
  return out;
}

/**
 * The valid point nearest to `p`: a sample of a grid over the room's bounds, at least `minGapPt`
 * from each point in `taken` when possible. Null when no sample is valid (the room is too small for
 * the offset). A caller that asks for many points passes `taken` as a PointHash with cells of `minGapPt`.
 */
export function nearestValidPoint(room: Pick<Room, 'polygon'>, p: Vec2, offsetPt: number, taken: readonly Vec2[] | PointHash = [], minGapPt = 0): Vec2 | null {
  let hash: PointHash | null = null;
  if (minGapPt > 0) {
    if (taken instanceof PointHash) hash = taken;
    else if (taken.length > 0) {
      hash = new PointHash(minGapPt);
      for (const t of taken) hash.add(t);
    }
  }
  let best: Vec2 | null = null;
  let bestD = Infinity;
  let crowded: Vec2 | null = null;
  let crowdedD = Infinity;
  for (const q of validGridSamples(room, offsetPt)) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d >= bestD && d >= crowdedD) continue;
    if (hash?.hasWithin(q, minGapPt)) {
      if (d < crowdedD) [crowded, crowdedD] = [q, d];
      continue;
    }
    if (d < bestD) [best, bestD] = [q, d];
  }
  return best ?? crowded;
}

/** One point: the label point of the room, moved to the nearest valid point when it is too near a wall. */
export function layoutCenter(room: Pick<Room, 'polygon'>, offsetPt: number): LayoutResult {
  const label = roomLabelPoint(room);
  if (isValidPlacementPoint(room.polygon, label, offsetPt)) return { points: [label], warnings: [] };
  const moved = nearestValidPoint(room, label, offsetPt);
  return moved ? { points: [moved], warnings: [] } : { points: [label], warnings: ['noFit'] };
}

/**
 * Columns (along the length) and rows (across the width) for `count` elements: the fewest cells,
 * then cells closest to a square. The last row may hold fewer elements than the others.
 */
export function chooseGridShape(count: number, lengthPt: number, widthPt: number): { along: number; across: number } {
  let best = { along: count, across: 1 };
  let bestScore = Infinity;
  for (let along = 1; along <= count; along++) {
    const across = Math.ceil(count / along);
    const cellRatio = lengthPt / along / Math.max(widthPt / across, 1e-9);
    const score = Math.abs(Math.log(Math.max(cellRatio, 1e-9))) + 0.3 * (along * across - count);
    if (score < bestScore - 1e-9) [best, bestScore] = [{ along, across }, score];
  }
  return best;
}

/**
 * `count` points in a grid along the main axis of the room (its smallest bounding rectangle). Each
 * point is the center of its cell in the rectangle minus `offsetPt` on every side. A point outside
 * the room, or nearer a wall than `offsetPt`, moves to the nearest valid point. `style` sets how a
 * short last row is filled (gridCells).
 */
export function layoutGrid(room: Pick<Room, 'polygon'>, count: number, offsetPt: number, style: GridStyle = 'spread'): LayoutResult {
  if (count <= 0) return { points: [], warnings: [] };
  const cells = gridCells(room, count, offsetPt, style);
  if (!cells) return layoutCenter(room, offsetPt);
  const { ideal, minGap } = cells;
  const points: Vec2[] = [];
  const warnings: LayoutWarning[] = [];
  const outside: Vec2[] = [];
  for (const p of ideal) (isValidPlacementPoint(room.polygon, p, offsetPt) ? points : outside).push(p);
  const taken = new PointHash(Math.max(minGap, 1e-6));
  for (const p of points) taken.add(p);
  for (const p of outside) {
    const moved = nearestValidPoint(room, p, offsetPt, taken, minGap);
    if (moved) {
      points.push(moved);
      taken.add(moved);
      if (!warnings.includes('movedInside')) warnings.push('movedInside');
    } else {
      points.push(roomLabelPoint(room));
      if (!warnings.includes('noFit')) warnings.push('noFit');
    }
  }
  return { points, warnings };
}

/**
 * The cell centers of the grid (layoutGrid) before any point moves, and half the smaller cell side.
 * Null for a room without a bounding rectangle. The style sets the columns of a short last row with
 * k of the `cols` stamps: 'spread' spreads the k stamps over the full length; 'aligned' puts stamp i
 * in column round((i + 0.5) × cols ÷ k − 0.5), so the columns stay in line and a cell can stay empty;
 * 'staggered' uses the aligned columns and moves each row a quarter cell (even rows back, odd rows
 * forward), so two rows are half a cell apart. All in the frame of the room's main axis.
 */
function gridCells(room: Pick<Room, 'polygon'>, count: number, offsetPt: number, style: GridStyle = 'spread'): { ideal: Vec2[]; minGap: number } | null {
  const rect = roomMinBoundingRect(room);
  if (!rect) return null;
  const grid = chooseGridShape(count, rect.lengthPt, rect.widthPt);
  const a = (rect.angleDeg * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const v = { x: -Math.sin(a), y: Math.cos(a) };
  const usableL = Math.max(0, rect.lengthPt - 2 * offsetPt);
  const usableW = Math.max(0, rect.widthPt - 2 * offsetPt);
  const cols = grid.along;
  const cellL = usableL / cols;
  const rows = Math.ceil(count / cols);
  const ideal: Vec2[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = row < rows - 1 ? cols : count - cols * (rows - 1);
    const across = -usableW / 2 + ((row + 0.5) * usableW) / rows;
    const shift = style === 'staggered' && rows > 1 ? (row % 2 === 0 ? -0.25 : 0.25) * cellL : 0;
    for (let i = 0; i < inRow; i++) {
      const at = ((i + 0.5) * cols) / inRow - 0.5;
      const col = style === 'spread' ? at : Math.round(at);
      const along = -usableL / 2 + (col + 0.5) * cellL + shift;
      ideal.push({ x: rect.center.x + u.x * along + v.x * across, y: rect.center.y + u.y * along + v.y * across });
    }
  }
  return { ideal, minGap: Math.min(cellL, usableW / rows) / 2 };
}

/** Samples of a room on a square grid over its bounds: `all` inside the room, `valid` also at least the offset from every wall. */
export interface RoomSamples {
  all: Vec2[];
  /** True for each sample of `all` that is also in `valid`. */
  isValid: boolean[];
  valid: Vec2[];
  /** The distance between two samples, points. */
  step: number;
}

const ROOM_SAMPLES = 1200;
const RELAX_ITERATIONS = 30;
/** The most stamps By coverage puts in one room when the rule has no max count. */
const MAX_COVERAGE_COUNT = 200;

/** About `target` samples of the room, on a square grid over its bounds. */
export function roomSamples(room: Pick<Room, 'polygon'>, offsetPt: number, target = ROOM_SAMPLES): RoomSamples {
  const b = roomBounds(room);
  const step = Math.sqrt(Math.max((b.maxX - b.minX) * (b.maxY - b.minY), 1e-9) / target);
  const all: Vec2[] = [];
  const isValid: boolean[] = [];
  const valid: Vec2[] = [];
  for (let x = b.minX + step / 2; x < b.maxX; x += step) {
    for (let y = b.minY + step / 2; y < b.maxY; y += step) {
      const p = { x, y };
      if (!polygonContainsPoint(room.polygon, p)) continue;
      const ok = distanceToWalls(room.polygon, p) >= offsetPt - 1e-9;
      all.push(p);
      isValid.push(ok);
      if (ok) valid.push(p);
    }
  }
  return { all, isValid, valid, step };
}

function nearestIndex(points: readonly Vec2[], p: Vec2): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i]!.x - p.x) ** 2 + (points[i]!.y - p.y) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/**
 * Lloyd relaxation: each point moves to the centroid of the room samples that are nearest to it
 * (its own part of the room), repeated until the points stop moving. A centroid that is not a valid
 * point goes to the nearest valid sample of the same part, so two points never share a position.
 */
export function relaxPoints(points: readonly Vec2[], samples: RoomSamples, room: Pick<Room, 'polygon'>, offsetPt: number, iterations = RELAX_ITERATIONS): Vec2[] {
  let pts = points.map((p) => ({ ...p }));
  if (pts.length === 0 || samples.all.length === 0) return pts;
  for (let it = 0; it < iterations; it++) {
    const parts: number[][] = pts.map(() => []);
    samples.all.forEach((q, k) => parts[nearestIndex(pts, q)]!.push(k));
    let maxMove = 0;
    pts = pts.map((p, i) => {
      const part = parts[i]!;
      if (part.length === 0) return p;
      let c = { x: part.reduce((sum, k) => sum + samples.all[k]!.x, 0) / part.length, y: part.reduce((sum, k) => sum + samples.all[k]!.y, 0) / part.length };
      if (!isValidPlacementPoint(room.polygon, c, offsetPt)) {
        const own = part.filter((k) => samples.isValid[k]).map((k) => samples.all[k]!);
        const pool = own.length > 0 ? own : samples.valid;
        const at = nearestIndex(pool, c);
        c = at >= 0 ? pool[at]! : p;
      }
      maxMove = Math.max(maxMove, Math.hypot(c.x - p.x, c.y - p.y));
      return c;
    });
    if (maxMove < samples.step / 20) break;
  }
  return pts;
}

/** `count` points spread evenly over the room: the grid, then Lloyd relaxation (relaxPoints). Works in L-shaped rooms and rooms with holes. */
export function layoutEvenSpread(room: Pick<Room, 'polygon'>, count: number, offsetPt: number, samples: RoomSamples = roomSamples(room, offsetPt)): LayoutResult {
  if (count <= 0) return { points: [], warnings: [] };
  const cells = gridCells(room, count, offsetPt);
  if (!cells || samples.valid.length === 0) return layoutGrid(room, count, offsetPt);
  return { points: relaxPoints(cells.ideal, samples, room, offsetPt), warnings: [] };
}

/**
 * The coverage radius of the limits, m: every point of the room must be this near a stamp. A square
 * grid with spacing s reaches s ÷ √2 (half the cell diagonal); a wall distance d reaches d × √2 in
 * the corner; an area A per element reaches √(A ÷ 2) (half the diagonal of a square of area A).
 * The smallest one wins. The limits are in the rule's length unit (m or ft). Null without limits.
 */
export function coverageRadiusM(coverage: CoverageLimits): number | null {
  const radii: number[] = [];
  const unit = coverage.lengthUnit;
  if (coverage.maxSpacing !== undefined) radii.push(lengthToM(coverage.maxSpacing, unit) / Math.SQRT2);
  if (coverage.maxWallDistance !== undefined) radii.push(lengthToM(coverage.maxWallDistance, unit) * Math.SQRT2);
  if (coverage.maxAreaPerElement !== undefined) radii.push(Math.sqrt(areaToM2(coverage.maxAreaPerElement, unit) / 2));
  return radii.length > 0 ? Math.min(...radii) : null;
}

/** The count By coverage starts from: area ÷ max area per element (rounded up), at least the min count and 1. */
export function coverageStartCount(rule: Pick<PlacementRule, 'coverage'> & Partial<Pick<PlacementRule, 'minCount'>>, areaM2: number): number {
  const maxArea = rule.coverage.maxAreaPerElement;
  const byArea = maxArea !== undefined ? Math.ceil(areaM2 / areaToM2(maxArea, rule.coverage.lengthUnit) - 1e-9) : 0;
  return Math.max(byArea, rule.minCount ?? 0, 1);
}

/** The points that must be within the coverage radius: the room samples, and the corners (the sample grid misses them, and they are often the farthest points). */
const coverageTargets = (room: Pick<Room, 'polygon'>, samples: RoomSamples): Vec2[] => [...samples.all, ...room.polygon.outer, ...room.polygon.holes.flat()];

/** True when a coverage target of the room is farther than `radiusPt` from every point. */
export function hasCoverageGap(room: Pick<Room, 'polygon'>, points: readonly Vec2[], radiusPt: number, samples: RoomSamples): boolean {
  if (points.length === 0) return true;
  return coverageTargets(room, samples).some((q) => {
    const i = nearestIndex(points, q);
    return Math.hypot(points[i]!.x - q.x, points[i]!.y - q.y) > radiusPt + 1e-6;
  });
}

/**
 * By coverage: starts with `startCount` points (Even spread), then adds a point at the room sample
 * farthest from every point and relaxes again, until every sample is within `radiusPt`. Samples
 * that no valid point can reach (the wall offset is too large) do not count, and give a warning.
 * `maxCount` stops it; `limited` tells that it stopped there.
 */
export function layoutCoverage(
  room: Pick<Room, 'polygon'>,
  startCount: number,
  offsetPt: number,
  radiusPt: number,
  maxCount?: number,
  samples: RoomSamples = roomSamples(room, offsetPt),
): LayoutResult & { limited: boolean } {
  const first = Math.max(1, Math.min(startCount, maxCount ?? Infinity));
  if (samples.valid.length === 0) return { ...layoutGrid(room, first, offsetPt), limited: false };
  const warnings: LayoutWarning[] = [];
  const targets = coverageTargets(room, samples);
  const reachable = targets.filter((q) => samples.valid.some((v) => Math.hypot(v.x - q.x, v.y - q.y) <= radiusPt));
  if (reachable.length < targets.length) warnings.push('coverageNotMet');
  let points = layoutEvenSpread(room, first, offsetPt, samples).points;
  const limit = Math.min(maxCount ?? MAX_COVERAGE_COUNT, MAX_COVERAGE_COUNT);
  let limited = false;
  for (;;) {
    let worst: Vec2 | null = null;
    let worstD = radiusPt;
    for (const q of reachable) {
      const i = nearestIndex(points, q);
      const d = Math.hypot(points[i]!.x - q.x, points[i]!.y - q.y);
      if (d > worstD + 1e-9) [worst, worstD] = [q, d];
    }
    if (!worst) break;
    if (points.length >= limit) {
      limited = maxCount !== undefined && points.length >= maxCount;
      if (!warnings.includes('coverageNotMet')) warnings.push('coverageNotMet');
      break;
    }
    points = relaxPoints([...points, samples.valid[nearestIndex(samples.valid, worst)]!], samples, room, offsetPt, 10);
  }
  return { points, warnings, limited };
}

/** One straight run of the Along-the-walls layout: a wall of the outer ring, moved into the room by the offset and shortened by the offset at each end. */
export interface WallRun {
  start: Vec2;
  end: Vec2;
  /** Unit vector from the wall into the room. */
  inward: Vec2;
  length: number;
}

/** The wall runs of the outer ring at `offsetPt`. A wall shorter than twice the offset gives no run. Holes are not used. */
export function wallRuns(room: Pick<Room, 'polygon'>, offsetPt: number): WallRun[] {
  const ring = room.polygon.outer;
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  const side = twiceArea >= 0 ? 1 : -1;
  const runs: WallRun[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= 2 * offsetPt + 1e-9) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const inward = { x: -u.y * side, y: u.x * side };
    runs.push({
      start: { x: a.x + u.x * offsetPt + inward.x * offsetPt, y: a.y + u.y * offsetPt + inward.y * offsetPt },
      end: { x: b.x - u.x * offsetPt + inward.x * offsetPt, y: b.y - u.y * offsetPt + inward.y * offsetPt },
      inward,
      length: len - 2 * offsetPt,
    });
  }
  return runs;
}

/**
 * Along the walls: `count` points at equal distances along the wall runs (the first and the last
 * are half a distance from the ends). Each point faces into the room: its rotation turns the
 * stamp's local +y axis to the inward direction. A point too near another wall moves to the
 * nearest valid point.
 */
export function layoutPerimeter(room: Pick<Room, 'polygon'>, count: number, offsetPt: number): LayoutResult {
  if (count <= 0) return { points: [], warnings: [] };
  const runs = wallRuns(room, offsetPt);
  const total = runs.reduce((sum, run) => sum + run.length, 0);
  if (total <= 0) return layoutCenter(room, offsetPt);
  const points: Vec2[] = [];
  const rotations: number[] = [];
  const warnings: LayoutWarning[] = [];
  const gap = total / count / 2;
  const taken = new PointHash(Math.max(gap, 1e-6));
  for (let i = 0; i < count; i++) {
    let t = ((i + 0.5) * total) / count;
    let k = 0;
    while (k < runs.length - 1 && t > runs[k]!.length) t -= runs[k++]!.length;
    const run = runs[k]!;
    const f = Math.min(1, t / run.length);
    let p: Vec2 = { x: run.start.x + (run.end.x - run.start.x) * f, y: run.start.y + (run.end.y - run.start.y) * f };
    if (!isValidPlacementPoint(room.polygon, p, offsetPt)) {
      const moved = nearestValidPoint(room, p, offsetPt, taken, gap);
      if (moved) {
        p = moved;
        if (!warnings.includes('movedInside')) warnings.push('movedInside');
      } else {
        p = roomLabelPoint(room);
        if (!warnings.includes('noFit')) warnings.push('noFit');
      }
    }
    points.push(p);
    taken.add(p);
    const deg = (Math.atan2(run.inward.y, run.inward.x) * 180) / Math.PI - 90;
    rotations.push(((deg % 360) + 360) % 360);
  }
  return { points, warnings, rotations };
}

export interface PlannedStamp {
  position: Vec2;
  rotationDegrees: number;
}

export interface RoomLayout {
  stamps: PlannedStamp[];
  warnings: LayoutWarning[];
  /** By coverage: the count that the coverage layout found, and whether the max count stopped it. */
  layoutCount?: { count: number; limited: boolean };
  /** With 'tooClose': about how many stamps fit in the room at the min distance between stamps. */
  fitEstimate?: number;
}

/** The indexes of the points that have another point closer than `minPt`. */
export function closePointIndexes(points: readonly Vec2[], minPt: number): Set<number> {
  const close = new Set<number>();
  if (!(minPt > 0)) return close;
  const cell = minPt;
  const cells = new Map<string, number[]>();
  points.forEach((p, i) => {
    const ix = Math.floor(p.x / cell);
    const iy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(`${ix + dx},${iy + dy}`) ?? []) {
          if (Math.hypot(points[j]!.x - p.x, points[j]!.y - p.y) < minPt - 1e-6) close.add(i).add(j);
        }
      }
    }
    const k = `${ix},${iy}`;
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  });
  return close;
}

/** True when two of the points are closer than `minPt`. */
function hasCloserPair(points: readonly Vec2[], minPt: number): boolean {
  const hash = new PointHash(minPt);
  for (const p of points) {
    if (hash.hasWithin(p, minPt - 1e-6)) return true;
    hash.add(p);
  }
  return false;
}

/** About how many stamps fit at `minPt` from each other: a greedy pass over the valid samples keeps a sample that is at least `minPt` from every kept sample. */
export function estimateFitCount(samples: RoomSamples, minPt: number): number {
  const kept = new PointHash(minPt);
  let n = 0;
  for (const q of samples.valid) {
    if (kept.hasWithin(q, minPt - 1e-6)) continue;
    kept.add(q);
    n++;
  }
  return n;
}

/**
 * The stamps of one rule in one room: positions from the rule's layout, each stamp center at least
 * the wall offset from every wall, and the rotation (the room's main axis, the wall direction for
 * Along the walls, or the rule's fixed angle). `stampSizePt` is the placed size of the stamp; it
 * does not change the positions.
 *
 * The layouts place `count` stamps. By coverage (preset 'coverage'): `count` is the start count
 * (coverageStartCount), and layoutCoverage adds stamps until the room is covered, at most the max
 * count. Even spread then uses the coverage positions; another layout places its own pattern with
 * that count, and a part of the room out of reach gives 'coverageNotMet'.
 *
 * With a min distance between stamps, two stamps closer than it give 'tooClose' and a fit estimate.
 * The check never changes the count or the positions.
 */
export function layoutRoomStamps(
  rule: Pick<PlacementRule, 'layout' | 'coverage'> & Partial<Pick<PlacementRule, 'preset' | 'minCount' | 'maxCount'>>,
  room: Pick<Room, 'polygon'>,
  count: number,
  calibration: Calibration,
  stampSizePt: { width: number; height: number },
): RoomLayout {
  const ptPerM = 1000 * calibration.pageUnitsPerRealUnit;
  const offsetPt = rule.layout.wallOffsetM * ptPerM;
  const warnings: LayoutWarning[] = [];
  const strategy = rule.layout.strategy;
  let samples: RoomSamples | undefined;
  const samplesOf = () => (samples ??= roomSamples(room, offsetPt));
  const radiusM = rule.preset === 'coverage' ? coverageRadiusM(rule.coverage) : null;
  let n = count;
  let result: LayoutResult | null = null;
  let layoutCount: RoomLayout['layoutCount'];
  if (radiusM !== null) {
    const out = layoutCoverage(room, count, offsetPt, radiusM * ptPerM, rule.maxCount, samplesOf());
    layoutCount = { count: out.points.length, limited: out.limited };
    n = out.points.length;
    if (strategy === 'evenSpread') result = out;
  }
  if (!result) {
    if (n <= 0) {
      result = { points: [], warnings: [] };
    } else if (strategy === 'center' && n === 1) {
      result = layoutCenter(room, offsetPt);
    } else if (strategy === 'evenSpread') {
      result = layoutEvenSpread(room, n, offsetPt, samplesOf());
    } else if (strategy === 'perimeter') {
      result = layoutPerimeter(room, n, offsetPt);
    } else {
      if (strategy === 'center') warnings.push('layoutFallback');
      result = layoutGrid(room, n, offsetPt, rule.layout.gridStyle);
    }
    if (radiusM !== null && !result.warnings.includes('coverageNotMet') && hasCoverageGap(room, result.points, radiusM * ptPerM, samplesOf())) warnings.push('coverageNotMet');
  }
  const minPt = (rule.layout.minSpacingM ?? 0) * ptPerM;
  let fitEstimate: number | undefined;
  if (minPt > 0 && hasCloserPair(result.points, minPt) && samplesOf().valid.length > 0) {
    warnings.push('tooClose');
    fitEstimate = estimateFitCount(samplesOf(), minPt);
  }
  const axis = roomMinBoundingRect(room)?.angleDeg ?? 0;
  const rotations = result.rotations;
  const rotationOf = (i: number) => (rule.layout.rotation === 'fixed' ? (rule.layout.fixedAngleDeg ?? 0) : (rotations?.[i] ?? axis));
  return {
    stamps: result.points.map((position, i) => ({ position, rotationDegrees: rotationOf(i) })),
    warnings: [...warnings, ...result.warnings],
    ...(layoutCount ? { layoutCount } : {}),
    ...(fitEstimate !== undefined ? { fitEstimate } : {}),
  };
}

export type PlacementRowWarning = RequirementWarning | LayoutWarning | 'noStamp' | 'stampNotFound' | 'roomChanged' | 'tooMany';

/** The most stamps that auto-placement lays out in one room. A larger count gets 'tooMany' and no stamps: such a count is almost always a typing error, and its layout takes minutes. */
export const MAX_ROOM_STAMPS = 1000;

export const PLACEMENT_WARNING_TEXT: Record<PlacementRowWarning, string> = {
  ...REQUIREMENT_WARNING_TEXT,
  ...LAYOUT_WARNING_TEXT,
  noStamp: 'the rule has no stamp',
  stampNotFound: 'the stamp of the rule is not found',
  roomChanged: 'the room changed after the last placement',
  tooMany: `more than ${MAX_ROOM_STAMPS} stamps: too many to place, check the values`,
};

/**
 * The shape and the type of a room, as one text: auto-placement writes it on each stamp, and a
 * different text later means the room changed after the placement. Coordinates are rounded to 0.01 pt.
 */
export function roomPlacementKey(room: Pick<Room, 'polygon' | 'roomTypeId'>): string {
  const ring = (points: readonly Vec2[]) => points.map((p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`).join(' ');
  return [ring(room.polygon.outer), ...room.polygon.holes.map(ring), `type:${room.roomTypeId ?? ''}`].join('|');
}

/** The auto-placed stamps of a drawing that already belong to one row. */
export interface ExistingRowStamps {
  /** Moved by the user: they stay and count toward the row's count. */
  keep: string[];
  /** Not moved: a new placement removes them. */
  replace: string[];
}

export interface PlacementRow extends RoomCalculationRow {
  /** Where the new stamps go. Empty when the row cannot be placed (see warnings). */
  stamps: PlannedStamp[];
  existing: ExistingRowStamps;
  warnings: PlacementRowWarning[];
  /** With 'tooClose': about how many stamps fit at the min distance between stamps. */
  fitEstimate?: number;
}

/** The auto-placed stamps already in the drawing, for a re-run. */
export interface ExistingAutoPlaced {
  /** Every stamp of the drawing; only stamps with `autoPlaced` are used. */
  stamps: readonly PlacedStamp[];
  /** The ids of every room of the drawing. A stamp whose room id is not here (the room was detected again) belongs to the room that contains it. */
  roomIds: ReadonlySet<string>;
}

/** Auto-placed stamps of a rule in a room that the rule no longer applies to (for example after a room type change). */
export interface StaleAutoPlaced extends ExistingRowStamps {
  room: Room;
  ruleId: string;
}

/** The `count` planned stamps minus, for each kept stamp, the planned stamp nearest to it. */
function withoutNearest(planned: readonly PlannedStamp[], kept: readonly Vec2[]): PlannedStamp[] {
  const left = [...planned];
  for (const k of kept) {
    if (left.length === 0) break;
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (Math.hypot(left[i]!.position.x - k.x, left[i]!.position.y - k.y) < Math.hypot(left[best]!.position.x - k.x, left[best]!.position.y - k.y)) best = i;
    }
    left.splice(best, 1);
  }
  return left;
}

/** A By coverage requirement with the count that the coverage layout found. */
function withLayoutCount(requirement: RoomRequirement, layoutCount: { count: number; limited: boolean }): RoomRequirement {
  const warnings: RequirementWarning[] = layoutCount.limited ? [...requirement.warnings, 'maxCountReached'] : requirement.warnings;
  return { ...requirement, count: layoutCount.count, warnings };
}

/**
 * The plan for auto-placement: the dry run (calculateRooms) plus the stamp positions of each row.
 * `stampSizeOf` gives the placed size of a stamp definition in page points, or null when the
 * definition is not found. A row without a stamp, a count or a calibration places nothing.
 *
 * With `existing` the plan is a re-run: each row finds its auto-placed stamps (same rule, same room).
 * Moved stamps stay and count toward the row's count, so the row places the count minus the moved
 * stamps, at the layout points that are not nearest to a moved stamp. The other stamps are replaced.
 * `stale` lists the auto-placed stamps of a given rule in a given room that the rule no longer applies to.
 */
export function planAutoPlacement(
  rules: readonly PlacementRule[],
  rooms: readonly Room[],
  valuesOf: (room: Room) => RoomValues,
  calibrationOf: (pageIndex: number) => Calibration | null,
  stampSizeOf: (definitionId: string) => { width: number; height: number } | null,
  existing?: ExistingAutoPlaced,
): { rows: PlacementRow[]; unmatched: Room[]; stale: StaleAutoPlaced[] } {
  const { rows, unmatched } = calculateRooms(rules, rooms, valuesOf);
  const placedStamps = (existing?.stamps ?? []).filter((s) => s.autoPlaced);
  const stampsOf = (ruleId: string, room: Room) =>
    placedStamps.filter(
      (s) =>
        s.autoPlaced!.ruleId === ruleId &&
        (s.autoPlaced!.roomId === room.id || (!existing!.roomIds.has(s.autoPlaced!.roomId) && polygonContainsPoint(room.polygon, s.transform.position))),
    );
  const split = (own: readonly PlacedStamp[]): ExistingRowStamps => ({
    keep: own.filter((s) => s.autoPlaced!.moved).map((s) => s.id),
    replace: own.filter((s) => !s.autoPlaced!.moved).map((s) => s.id),
  });
  const rowKeys = new Set(rows.map((row) => `${row.rule.id}\n${row.room.id}`));
  const stale: StaleAutoPlaced[] = [];
  if (placedStamps.length > 0) {
    for (const room of rooms) {
      for (const rule of rules) {
        if (rowKeys.has(`${rule.id}\n${room.id}`)) continue;
        const own = stampsOf(rule.id, room);
        if (own.length > 0) stale.push({ room, ruleId: rule.id, ...split(own) });
      }
    }
  }
  return {
    unmatched,
    stale,
    rows: rows.map((row): PlacementRow => {
      const warnings: PlacementRowWarning[] = [...row.requirement.warnings];
      const own = stampsOf(row.rule.id, row.room);
      const kept = own.filter((s) => s.autoPlaced!.moved);
      const ownExisting = split(own);
      const key = roomPlacementKey(row.room);
      if (own.some((s) => s.autoPlaced!.roomId !== row.room.id || (s.autoPlaced!.roomKey !== undefined && s.autoPlaced!.roomKey !== key))) warnings.push('roomChanged');
      const base = { ...row, existing: ownExisting };
      const calibration = calibrationOf(row.room.pageIndex);
      const count = row.requirement.count;
      const byCoverage = row.requirement.countSource === 'coverage';
      if (!row.rule.stampDefinitionId) return { ...base, stamps: [], warnings: [...warnings, 'noStamp'] };
      const size = stampSizeOf(row.rule.stampDefinitionId);
      if (!size) return { ...base, stamps: [], warnings: [...warnings, 'stampNotFound'] };
      if (!calibration || (byCoverage ? row.values.areaM2 === null : count === null || count === 0)) {
        if (!calibration && !warnings.includes('noCalibration')) warnings.push('noCalibration');
        return { ...base, stamps: [], warnings };
      }
      if (!byCoverage && count! > MAX_ROOM_STAMPS) return { ...base, stamps: [], warnings: [...warnings, 'tooMany'] };
      const layout = layoutRoomStamps(row.rule, row.room, byCoverage ? coverageStartCount(row.rule, row.values.areaM2!) : count!, calibration, size);
      const stamps = withoutNearest(layout.stamps, kept.map((s) => s.transform.position));
      const fit = layout.fitEstimate !== undefined ? { fitEstimate: layout.fitEstimate } : {};
      if (!layout.layoutCount) return { ...base, stamps, warnings: [...warnings, ...layout.warnings], ...fit };
      const requirement = withLayoutCount(row.requirement, layout.layoutCount);
      if (layout.layoutCount.limited) warnings.push('maxCountReached');
      return { ...base, requirement, stamps, warnings: [...warnings, ...layout.warnings], ...fit };
    }),
  };
}

/** The ids of every auto-placed stamp of the rows and of the stale entries, moved or not (Remove auto-placed stamps). */
export function autoPlacedStampIds(rows: readonly Pick<PlacementRow, 'existing'>[], stale: readonly ExistingRowStamps[] = []): string[] {
  return [...new Set([...rows.map((row) => row.existing), ...stale].flatMap((e) => [...e.keep, ...e.replace]))];
}
