// Stamp positions in a room (room-auto-placement.md Phases 4 and 6): the Center, Grid, Even spread,
// Coverage and Along-the-walls layouts. All
// geometry is in displayed page space (points, y down), the space of the room polygon and of placed
// stamps. Pure functions, no I/O.

import type { Calibration } from '../calibration.js';
import type { Vec2 } from '../geometry.js';
import type { PlacedStamp } from '../stamp.js';
import { polygonContainsPoint, roomBounds, roomLabelPoint, type Room } from './room.js';
import { roomMinBoundingRect } from './room-values.js';
import {
  calculateRooms,
  coverageGridShape,
  REQUIREMENT_WARNING_TEXT,
  type CoverageLimits,
  type PlacementRule,
  type RoomCalculationRow,
  type RoomRequirement,
  type RequirementWarning,
} from './placement-rule.js';
import type { RoomValues } from './room-values.js';
import type { RoomPolygon } from './types.js';

export type LayoutWarning =
  /** No point of the room is far enough from the walls; the stamp is at the label point. */
  | 'noFit'
  /** Points of the grid fell outside the room (or too near a wall) and moved to the nearest valid point. */
  | 'movedInside'
  /** Center got more than one element: Grid was used. */
  | 'layoutFallback'
  /** Coverage: part of the room is farther than the coverage radius from every stamp (the max count, or the wall offset, stops it). */
  | 'coverageNotMet';

export const LAYOUT_WARNING_TEXT: Record<LayoutWarning, string> = {
  noFit: 'does not fit: placed at the label point',
  movedInside: 'points moved inside the room',
  layoutFallback: 'grid layout used',
  coverageNotMet: 'coverage not met in part of the room',
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
 * The valid point nearest to `p`: a sample of a grid over the room's bounds, at least `minGapPt`
 * from each point in `taken` when possible. Null when no sample is valid (the room is too small for the offset).
 */
export function nearestValidPoint(room: Pick<Room, 'polygon'>, p: Vec2, offsetPt: number, taken: readonly Vec2[] = [], minGapPt = 0): Vec2 | null {
  const b = roomBounds(room);
  let best: Vec2 | null = null;
  let bestD = Infinity;
  let crowded: Vec2 | null = null;
  let crowdedD = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    for (let j = 0; j <= SAMPLES; j++) {
      const q = { x: b.minX + ((b.maxX - b.minX) * i) / SAMPLES, y: b.minY + ((b.maxY - b.minY) * j) / SAMPLES };
      if (!isValidPlacementPoint(room.polygon, q, offsetPt)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (taken.some((t) => Math.hypot(t.x - q.x, t.y - q.y) < minGapPt)) {
        if (d < crowdedD) [crowded, crowdedD] = [q, d];
        continue;
      }
      if (d < bestD) [best, bestD] = [q, d];
    }
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
 * the room, or nearer a wall than `offsetPt`, moves to the nearest valid point. `shape` sets the grid
 * (for example the grid the coverage limits need); without it chooseGridShape picks one.
 */
export function layoutGrid(room: Pick<Room, 'polygon'>, count: number, offsetPt: number, shape?: { along: number; across: number }): LayoutResult {
  if (count <= 0) return { points: [], warnings: [] };
  const cells = gridCells(room, count, offsetPt, shape);
  if (!cells) return layoutCenter(room, offsetPt);
  const { ideal, minGap } = cells;
  const points: Vec2[] = [];
  const warnings: LayoutWarning[] = [];
  const outside: Vec2[] = [];
  for (const p of ideal) (isValidPlacementPoint(room.polygon, p, offsetPt) ? points : outside).push(p);
  for (const p of outside) {
    const moved = nearestValidPoint(room, p, offsetPt, points, minGap);
    if (moved) {
      points.push(moved);
      if (!warnings.includes('movedInside')) warnings.push('movedInside');
    } else {
      points.push(roomLabelPoint(room));
      if (!warnings.includes('noFit')) warnings.push('noFit');
    }
  }
  return { points, warnings };
}

/** The cell centers of the grid (layoutGrid) before any point moves, and half the smaller cell side. Null for a room without a bounding rectangle. */
function gridCells(room: Pick<Room, 'polygon'>, count: number, offsetPt: number, shape?: { along: number; across: number }): { ideal: Vec2[]; minGap: number } | null {
  const rect = roomMinBoundingRect(room);
  if (!rect) return null;
  const grid = shape && shape.along * shape.across >= count ? shape : chooseGridShape(count, rect.lengthPt, rect.widthPt);
  const a = (rect.angleDeg * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const v = { x: -Math.sin(a), y: Math.cos(a) };
  const usableL = Math.max(0, rect.lengthPt - 2 * offsetPt);
  const usableW = Math.max(0, rect.widthPt - 2 * offsetPt);
  const rows = Math.ceil(count / grid.along);
  const ideal: Vec2[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = row < rows - 1 ? grid.along : count - grid.along * (rows - 1);
    const across = -usableW / 2 + ((row + 0.5) * usableW) / rows;
    for (let col = 0; col < inRow; col++) {
      const along = -usableL / 2 + ((col + 0.5) * usableL) / inRow;
      ideal.push({ x: rect.center.x + u.x * along + v.x * across, y: rect.center.y + u.y * along + v.y * across });
    }
  }
  return { ideal, minGap: Math.min(usableL / grid.along, usableW / rows) / 2 };
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
/** The most stamps the Coverage layout puts in one room when the rule has no max count. */
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
 * The smallest one wins. Null without limits.
 */
export function coverageRadiusM(coverage: CoverageLimits): number | null {
  const radii: number[] = [];
  if (coverage.maxSpacingM !== undefined) radii.push(coverage.maxSpacingM / Math.SQRT2);
  if (coverage.maxWallDistanceM !== undefined) radii.push(coverage.maxWallDistanceM * Math.SQRT2);
  if (coverage.maxAreaPerElementM2 !== undefined) radii.push(Math.sqrt(coverage.maxAreaPerElementM2 / 2));
  return radii.length > 0 ? Math.min(...radii) : null;
}

/**
 * Coverage: starts with `startCount` points (Even spread), then adds a point at the room sample
 * farthest from every point and relaxes again, until every sample is within `radiusPt`. Samples
 * that no valid point can reach (the wall offset is too large) do not count, and give a warning.
 * `maxCount` stops it; `limited` tells that it stopped there.
 */
export function layoutCoverage(room: Pick<Room, 'polygon'>, startCount: number, offsetPt: number, radiusPt: number, maxCount?: number): LayoutResult & { limited: boolean } {
  const first = Math.max(1, Math.min(startCount, maxCount ?? Infinity));
  const samples = roomSamples(room, offsetPt);
  if (samples.valid.length === 0) return { ...layoutGrid(room, first, offsetPt), limited: false };
  const warnings: LayoutWarning[] = [];
  // The corners are often the points farthest from every stamp, and the sample grid misses them.
  const targets = [...samples.all, ...room.polygon.outer, ...room.polygon.holes.flat()];
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

/** The total length of the wall runs, points. */
export function wallRunLengthPt(room: Pick<Room, 'polygon'>, offsetPt: number): number {
  return wallRuns(room, offsetPt).reduce((sum, run) => sum + run.length, 0);
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
  for (let i = 0; i < count; i++) {
    let t = ((i + 0.5) * total) / count;
    let k = 0;
    while (k < runs.length - 1 && t > runs[k]!.length) t -= runs[k++]!.length;
    const run = runs[k]!;
    const f = Math.min(1, t / run.length);
    let p: Vec2 = { x: run.start.x + (run.end.x - run.start.x) * f, y: run.start.y + (run.end.y - run.start.y) * f };
    if (!isValidPlacementPoint(room.polygon, p, offsetPt)) {
      const moved = nearestValidPoint(room, p, offsetPt, points, gap);
      if (moved) {
        p = moved;
        if (!warnings.includes('movedInside')) warnings.push('movedInside');
      } else {
        p = roomLabelPoint(room);
        if (!warnings.includes('noFit')) warnings.push('noFit');
      }
    }
    points.push(p);
    const deg = (Math.atan2(run.inward.y, run.inward.x) * 180) / Math.PI - 90;
    rotations.push(((deg % 360) + 360) % 360);
  }
  return { points, warnings, rotations };
}

export interface PlannedStamp {
  position: Vec2;
  rotationDegrees: number;
}

/** What a layout that chooses its own count starts from. */
export interface LayoutCountInput {
  /** ceil(required ÷ capacity), or null without a capacity. */
  quantityCount: number | null;
  /** ceil(area ÷ max area per element), or null. */
  areaCount?: number | null;
}

export interface RoomLayout {
  stamps: PlannedStamp[];
  warnings: LayoutWarning[];
  /** Set when the layout chose the count itself (Coverage with limits, Along the walls with a max spacing). */
  layoutCount?: { count: number; limited: boolean };
}

/**
 * The stamps of one rule in one room: positions from the rule's layout, the wall offset plus half
 * the stamp size from every wall, and the rotation (the room's main axis, the wall direction for
 * Along the walls, or the rule's fixed angle). `stampSizePt` is the placed size of the stamp.
 *
 * Center, Grid and Even spread place `count` stamps. With `countInput`, Coverage (with coverage
 * limits) and Along the walls (with a max spacing) choose the count themselves, from the amount
 * count, the area count and the min count, at most the max count: Coverage adds stamps until the
 * room is covered; Along the walls uses ceil(wall run length ÷ spacing).
 */
export function layoutRoomStamps(
  rule: Pick<PlacementRule, 'layout' | 'coverage'> & Partial<Pick<PlacementRule, 'minCount' | 'maxCount'>>,
  room: Pick<Room, 'polygon'>,
  values: Pick<RoomValues, 'lengthM' | 'widthM'>,
  count: number,
  calibration: Calibration,
  stampSizePt: { width: number; height: number },
  countInput?: LayoutCountInput,
): RoomLayout {
  const ptPerM = 1000 * calibration.pageUnitsPerRealUnit;
  const offsetPt = rule.layout.wallOffsetM * ptPerM + Math.max(stampSizePt.width, stampSizePt.height) / 2;
  const warnings: LayoutWarning[] = [];
  const startCount = () => Math.max(countInput?.quantityCount ?? 0, countInput?.areaCount ?? 0, rule.minCount ?? 0, 1);
  const strategy = rule.layout.strategy;
  const radiusM = strategy === 'coverage' ? coverageRadiusM(rule.coverage) : null;
  const spacingM = strategy === 'perimeter' ? rule.coverage.maxSpacingM : undefined;
  let result: LayoutResult;
  let layoutCount: RoomLayout['layoutCount'];
  if (strategy === 'coverage' && radiusM !== null && countInput) {
    const out = layoutCoverage(room, startCount(), offsetPt, radiusM * ptPerM, rule.maxCount);
    result = out;
    layoutCount = { count: out.points.length, limited: out.limited };
  } else if (strategy === 'perimeter' && spacingM !== undefined && countInput) {
    let n = Math.max(startCount(), Math.ceil(wallRunLengthPt(room, offsetPt) / (spacingM * ptPerM) - 1e-9));
    const limited = rule.maxCount !== undefined && n > rule.maxCount;
    if (limited) n = rule.maxCount!;
    result = layoutPerimeter(room, n, offsetPt);
    layoutCount = { count: n, limited };
  } else if (count <= 0) {
    result = { points: [], warnings: [] };
  } else if (strategy === 'center' && count === 1) {
    result = layoutCenter(room, offsetPt);
  } else if (strategy === 'evenSpread' || strategy === 'coverage') {
    result = layoutEvenSpread(room, count, offsetPt);
  } else if (strategy === 'perimeter') {
    result = layoutPerimeter(room, count, offsetPt);
  } else {
    if (strategy === 'center') warnings.push('layoutFallback');
    const coverage = coverageGridShape(values, rule.coverage);
    result = layoutGrid(room, count, offsetPt, coverage && coverage.along * coverage.across === count ? coverage : undefined);
  }
  const axis = roomMinBoundingRect(room)?.angleDeg ?? 0;
  const rotationOf = (i: number) => (rule.layout.rotation === 'fixed' ? (rule.layout.fixedAngleDeg ?? 0) : (result.rotations?.[i] ?? axis));
  return {
    stamps: result.points.map((position, i) => ({ position, rotationDegrees: rotationOf(i) })),
    warnings: [...warnings, ...result.warnings],
    ...(layoutCount ? { layoutCount } : {}),
  };
}

/** The requirement with the count that the layout chose: the amount per element, the coverage count and the warnings follow it. */
function withLayoutCount(requirement: RoomRequirement, layoutCount: { count: number; limited: boolean }): RoomRequirement {
  const { count, limited } = layoutCount;
  const warnings: RequirementWarning[] = requirement.warnings.filter((w) => w !== 'countByCoverage' && w !== 'maxCountReached');
  if (requirement.quantityCount !== null && count > requirement.quantityCount && !limited) warnings.push('countByCoverage');
  if (limited) warnings.push('maxCountReached');
  return { ...requirement, count, coverageCount: count, perElement: requirement.required !== null && count > 0 ? requirement.required / count : null, warnings };
}

export type PlacementRowWarning = RequirementWarning | LayoutWarning | 'noStamp' | 'stampNotFound' | 'roomChanged';

export const PLACEMENT_WARNING_TEXT: Record<PlacementRowWarning, string> = {
  ...REQUIREMENT_WARNING_TEXT,
  ...LAYOUT_WARNING_TEXT,
  noStamp: 'the rule has no stamp',
  stampNotFound: 'the stamp of the rule is not found',
  roomChanged: 'the room changed after the last placement',
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
      if (!row.rule.stampDefinitionId) return { ...base, stamps: [], warnings: [...warnings, 'noStamp'] };
      const size = stampSizeOf(row.rule.stampDefinitionId);
      if (!size) return { ...base, stamps: [], warnings: [...warnings, 'stampNotFound'] };
      if (count === null || count === 0 || !calibration) {
        if (!calibration && !warnings.includes('noCalibration')) warnings.push('noCalibration');
        return { ...base, stamps: [], warnings };
      }
      const areaCount =
        row.rule.coverage.maxAreaPerElementM2 !== undefined && row.values.areaM2 !== null ? Math.ceil(row.values.areaM2 / row.rule.coverage.maxAreaPerElementM2 - 1e-9) : null;
      const layout = layoutRoomStamps(row.rule, row.room, row.values, count, calibration, size, { quantityCount: row.requirement.quantityCount, areaCount });
      const stamps = withoutNearest(layout.stamps, kept.map((s) => s.transform.position));
      if (!layout.layoutCount) return { ...base, stamps, warnings: [...warnings, ...layout.warnings] };
      const requirement = withLayoutCount(row.requirement, layout.layoutCount);
      return { ...base, requirement, stamps, warnings: [...requirement.warnings, ...layout.warnings] };
    }),
  };
}

/** The ids of every auto-placed stamp of the rows and of the stale entries, moved or not (Remove auto-placed stamps). */
export function autoPlacedStampIds(rows: readonly Pick<PlacementRow, 'existing'>[], stale: readonly ExistingRowStamps[] = []): string[] {
  return [...new Set([...rows.map((row) => row.existing), ...stale].flatMap((e) => [...e.keep, ...e.replace]))];
}
