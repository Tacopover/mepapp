// Stamp positions in a room (room-auto-placement.md Phase 4): the Center and Grid layouts. All
// geometry is in displayed page space (points, y down), the space of the room polygon and of placed
// stamps. Pure functions, no I/O.

import type { Calibration } from '../calibration.js';
import type { Vec2 } from '../geometry.js';
import { polygonContainsPoint, roomBounds, roomLabelPoint, type Room } from './room.js';
import { roomMinBoundingRect } from './room-values.js';
import { calculateRooms, coverageGridShape, REQUIREMENT_WARNING_TEXT, type PlacementRule, type RoomCalculationRow, type RequirementWarning } from './placement-rule.js';
import type { RoomValues } from './room-values.js';
import type { RoomPolygon } from './types.js';

export type LayoutWarning =
  /** No point of the room is far enough from the walls; the stamp is at the label point. */
  | 'noFit'
  /** Points of the grid fell outside the room (or too near a wall) and moved to the nearest valid point. */
  | 'movedInside'
  /** The rule's layout is not available yet, or Center got more than one element: Grid was used. */
  | 'layoutFallback';

export const LAYOUT_WARNING_TEXT: Record<LayoutWarning, string> = {
  noFit: 'does not fit: placed at the label point',
  movedInside: 'points moved inside the room',
  layoutFallback: 'grid layout used',
};

export interface LayoutResult {
  points: Vec2[];
  warnings: LayoutWarning[];
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
  const rect = roomMinBoundingRect(room);
  if (!rect) return layoutCenter(room, offsetPt);
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
  const minGap = Math.min(usableL / grid.along, usableW / rows) / 2;
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

export interface PlannedStamp {
  position: Vec2;
  rotationDegrees: number;
}

export interface RoomLayout {
  stamps: PlannedStamp[];
  warnings: LayoutWarning[];
}

/**
 * The stamps of one rule in one room: `count` positions from the rule's layout, the wall offset
 * plus half the stamp size from every wall, and the rotation (the room's main axis, or the rule's
 * fixed angle). `stampSizePt` is the placed size of the stamp. Phase 4 has Center and Grid; another
 * layout uses Grid and says so.
 */
export function layoutRoomStamps(
  rule: Pick<PlacementRule, 'layout' | 'coverage'>,
  room: Pick<Room, 'polygon'>,
  values: Pick<RoomValues, 'lengthM' | 'widthM'>,
  count: number,
  calibration: Calibration,
  stampSizePt: { width: number; height: number },
): RoomLayout {
  const offsetPt = rule.layout.wallOffsetM * 1000 * calibration.pageUnitsPerRealUnit + Math.max(stampSizePt.width, stampSizePt.height) / 2;
  const warnings: LayoutWarning[] = [];
  let result: LayoutResult;
  if (rule.layout.strategy === 'center' && count <= 1) {
    result = count === 1 ? layoutCenter(room, offsetPt) : { points: [], warnings: [] };
  } else {
    if (rule.layout.strategy !== 'grid') warnings.push('layoutFallback');
    const coverage = coverageGridShape(values, rule.coverage);
    result = layoutGrid(room, count, offsetPt, coverage && coverage.along * coverage.across === count ? coverage : undefined);
  }
  const rotationDegrees = rule.layout.rotation === 'fixed' ? (rule.layout.fixedAngleDeg ?? 0) : (roomMinBoundingRect(room)?.angleDeg ?? 0);
  return { stamps: result.points.map((position) => ({ position, rotationDegrees })), warnings: [...warnings, ...result.warnings] };
}

export type PlacementRowWarning = RequirementWarning | LayoutWarning | 'noStamp' | 'stampNotFound';

export const PLACEMENT_WARNING_TEXT: Record<PlacementRowWarning, string> = {
  ...REQUIREMENT_WARNING_TEXT,
  ...LAYOUT_WARNING_TEXT,
  noStamp: 'the rule has no stamp',
  stampNotFound: 'the stamp of the rule is not found',
};

export interface PlacementRow extends RoomCalculationRow {
  /** Where the stamps go. Empty when the row cannot be placed (see warnings). */
  stamps: PlannedStamp[];
  warnings: PlacementRowWarning[];
}

/**
 * The plan for auto-placement: the dry run (calculateRooms) plus the stamp positions of each row.
 * `stampSizeOf` gives the placed size of a stamp definition in page points, or null when the
 * definition is not found. A row without a stamp, a count or a calibration places nothing.
 */
export function planAutoPlacement(
  rules: readonly PlacementRule[],
  rooms: readonly Room[],
  valuesOf: (room: Room) => RoomValues,
  calibrationOf: (pageIndex: number) => Calibration | null,
  stampSizeOf: (definitionId: string) => { width: number; height: number } | null,
): { rows: PlacementRow[]; unmatched: Room[] } {
  const { rows, unmatched } = calculateRooms(rules, rooms, valuesOf);
  return {
    unmatched,
    rows: rows.map((row): PlacementRow => {
      const warnings: PlacementRowWarning[] = [...row.requirement.warnings];
      const calibration = calibrationOf(row.room.pageIndex);
      const count = row.requirement.count;
      if (!row.rule.stampDefinitionId) return { ...row, stamps: [], warnings: [...warnings, 'noStamp'] };
      const size = stampSizeOf(row.rule.stampDefinitionId);
      if (!size) return { ...row, stamps: [], warnings: [...warnings, 'stampNotFound'] };
      if (count === null || count === 0 || !calibration) {
        if (!calibration && !warnings.includes('noCalibration')) warnings.push('noCalibration');
        return { ...row, stamps: [], warnings };
      }
      const layout = layoutRoomStamps(row.rule, row.room, row.values, count, calibration, size);
      return { ...row, stamps: layout.stamps, warnings: [...warnings, ...layout.warnings] };
    }),
  };
}
