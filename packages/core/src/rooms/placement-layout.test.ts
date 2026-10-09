import { describe, expect, it } from 'vitest';
import {
  chooseGridShape,
  distanceToWalls,
  isValidPlacementPoint,
  layoutCenter,
  layoutGrid,
  layoutRoomStamps,
  manualRoom,
  planAutoPlacement,
  type PlacementRule,
  type RoomPolygon,
} from './index.js';
import type { Vec2 } from '../geometry.js';

const rect = (x: number, y: number, w: number, h: number): Vec2[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const rotate = (ring: Vec2[], deg: number): Vec2[] => {
  const a = (deg * Math.PI) / 180;
  return ring.map((p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));
};
const room = (outer: Vec2[], holes: Vec2[][] = []) => ({ polygon: { outer, holes } as RoomPolygon });
const sortPts = (ps: Vec2[]) => ps.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
const L_SHAPE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 600, y: 0 },
  { x: 600, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 600 },
  { x: 0, y: 600 },
];

describe('chooseGridShape', () => {
  it('picks the fewest cells, then cells closest to a square', () => {
    expect(chooseGridShape(4, 8, 5)).toEqual({ along: 2, across: 2 });
    expect(chooseGridShape(3, 12, 4)).toEqual({ along: 3, across: 1 });
    expect(chooseGridShape(6, 10, 5)).toEqual({ along: 3, across: 2 });
    expect(chooseGridShape(1, 10, 5)).toEqual({ along: 1, across: 1 });
  });
});

describe('layoutGrid', () => {
  it('puts each point in the center of its cell in a rectangle', () => {
    const r = layoutGrid(room(rect(0, 0, 400, 200)), 4, 0);
    expect(sortPts(r.points)).toEqual([[100, 50], [100, 150], [300, 50], [300, 150]]);
    expect(r.warnings).toEqual([]);
  });

  it('uses the usable rectangle inside the wall offset', () => {
    const r = layoutGrid(room(rect(0, 0, 400, 200)), 2, 50);
    expect(sortPts(r.points)).toEqual([[125, 100], [275, 100]]);
  });

  it('spreads a short last row evenly', () => {
    const r = layoutGrid(room(rect(0, 0, 300, 200)), 5, 0);
    expect(r.points).toHaveLength(5);
    const lastRow = r.points.filter((p) => Math.abs(p.y - 150) < 1e-6);
    expect(sortPts(lastRow)).toEqual([[75, 150], [225, 150]]);
  });

  it('follows the main axis of a rotated room', () => {
    const plain = layoutGrid(room(rect(0, 0, 400, 200)), 4, 10);
    const turned = layoutGrid(room(rotate(rect(0, 0, 400, 200), 30)), 4, 10);
    const gaps = (ps: Vec2[]) => ps.flatMap((p, i) => ps.slice(i + 1).map((q) => Math.round(Math.hypot(p.x - q.x, p.y - q.y) * 1000) / 1000)).sort((a, b) => a - b);
    expect(gaps(turned.points)).toEqual(gaps(plain.points));
    expect(turned.points.every((p) => isValidPlacementPoint(room(rotate(rect(0, 0, 400, 200), 30)).polygon, p, 10))).toBe(true);
  });

  it('moves points that fall outside an L-shaped room inside, and keeps them apart', () => {
    const l = room(L_SHAPE);
    const r = layoutGrid(l, 4, 20);
    expect(r.points).toHaveLength(4);
    expect(r.points.every((p) => isValidPlacementPoint(l.polygon, p, 20))).toBe(true);
    expect(r.warnings).toEqual(['movedInside']);
    const minGap = Math.min(...r.points.flatMap((p, i) => r.points.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
    expect(minGap).toBeGreaterThan(50);
  });

  it('moves a point out of a hole', () => {
    const withHole = room(rect(0, 0, 300, 300), [rect(100, 100, 100, 100)]);
    const r = layoutGrid(withHole, 1, 10);
    expect(r.points).toHaveLength(1);
    expect(isValidPlacementPoint(withHole.polygon, r.points[0]!, 10)).toBe(true);
    expect(r.warnings).toEqual(['movedInside']);
  });

  it('places at the label point and warns when the room is too small for the offset', () => {
    const r = layoutGrid(room(rect(0, 0, 40, 40)), 2, 30);
    expect(r.points).toHaveLength(2);
    expect(r.warnings).toContain('noFit');
  });
});

describe('layoutCenter', () => {
  it('uses the label point when it is far enough from the walls', () => {
    expect(layoutCenter(room(rect(0, 0, 400, 200)), 20).points).toEqual([{ x: 200, y: 100 }]);
  });

  it('moves the point away from a wall, inside an L-shaped room', () => {
    const l = room(L_SHAPE);
    const r = layoutCenter(l, 60);
    expect(isValidPlacementPoint(l.polygon, r.points[0]!, 60)).toBe(true);
  });

  it('warns when nothing fits', () => {
    expect(layoutCenter(room(rect(0, 0, 40, 40)), 30).warnings).toEqual(['noFit']);
  });
});

describe('distanceToWalls', () => {
  it('measures to the outer ring and to a hole', () => {
    const p = room(rect(0, 0, 300, 300), [rect(100, 100, 100, 100)]).polygon;
    expect(distanceToWalls(p, { x: 50, y: 150 })).toBeCloseTo(50);
    expect(distanceToWalls(p, { x: 90, y: 150 })).toBeCloseTo(10);
  });
});

describe('layoutRoomStamps', () => {
  // 1 pt = 25 mm.
  const CAL = { pageUnitsPerRealUnit: 0.04 };
  const rule = (layout: Partial<PlacementRule['layout']> = {}, coverage: PlacementRule['coverage'] = {}): Pick<PlacementRule, 'layout' | 'coverage'> => ({
    layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room', ...layout },
    coverage,
  });
  const values = { lengthM: 10, widthM: 5 };

  it('keeps the wall offset plus half the stamp from every wall', () => {
    // 0.5 m = 20 pt, stamp 20 pt → 30 pt from each wall: usable length 340 pt, cell centers at 30 + 85 and 30 + 255.
    const out = layoutRoomStamps(rule(), room(rect(0, 0, 400, 200)), values, 2, CAL, { width: 20, height: 10 });
    expect(sortPts(out.stamps.map((s) => s.position))).toEqual([[115, 100], [285, 100]]);
  });

  it('turns the stamps to the main axis, or to the fixed angle', () => {
    const vertical = room(rect(0, 0, 200, 400));
    expect(layoutRoomStamps(rule(), vertical, values, 1, CAL, { width: 0, height: 0 }).stamps[0]!.rotationDegrees).toBeCloseTo(90);
    expect(layoutRoomStamps(rule({ rotation: 'fixed', fixedAngleDeg: 45 }), vertical, values, 1, CAL, { width: 0, height: 0 }).stamps[0]!.rotationDegrees).toBe(45);
  });

  it('places one stamp at the center for the Center layout', () => {
    const out = layoutRoomStamps(rule({ strategy: 'center' }), room(rect(0, 0, 400, 200)), values, 1, CAL, { width: 10, height: 10 });
    expect(out.stamps.map((s) => s.position)).toEqual([{ x: 200, y: 100 }]);
    expect(out.warnings).toEqual([]);
  });

  it('uses the grid for a layout that is not available yet, and says so', () => {
    const out = layoutRoomStamps(rule({ strategy: 'perimeter' }), room(rect(0, 0, 400, 200)), values, 3, CAL, { width: 10, height: 10 });
    expect(out.stamps).toHaveLength(3);
    expect(out.warnings).toEqual(['layoutFallback']);
  });

  it('uses the coverage grid when it gave the count', () => {
    // Coverage on 10 × 5 m: along ceil((10 − 5) ÷ 2) + 1 = 4, across 1 (5 m ≤ 2 × 2.5 m), so 4 × 1. chooseGridShape(4) alone gives 2 × 2.
    expect(chooseGridShape(4, 400, 200)).toEqual({ along: 2, across: 2 });
    const out = layoutRoomStamps(rule({ wallOffsetM: 0 }, { maxSpacingM: 2, maxWallDistanceM: 2.5 }), room(rect(0, 0, 400, 200)), { lengthM: 10, widthM: 5 }, 4, CAL, { width: 0, height: 0 });
    expect(new Set(out.stamps.map((s) => Math.round(s.position.y))).size).toBe(1);
    expect(out.stamps).toHaveLength(4);
  });

  it('places nothing for a count of 0', () => {
    expect(layoutRoomStamps(rule({ strategy: 'center' }), room(rect(0, 0, 400, 200)), values, 0, CAL, { width: 0, height: 0 }).stamps).toEqual([]);
  });
});

describe('planAutoPlacement', () => {
  const CAL = { pageUnitsPerRealUnit: 0.04 };
  const base: PlacementRule = {
    id: 'r', name: 'R', discipline: 'ventilation', roomTypeIds: [], stampDefinitionId: 'grille', preset: 'fixed', amount: { fixed: 30, unit: 'dm³/s' },
    capacityPerElement: 10, coverage: {}, layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' }, writeCapacity: true,
  };
  const r = { ...manualRoom(0, rect(0, 0, 400, 200)), id: 'room-1', name: 'A' };
  const values = { areaM2: 50, perimeterM: 30, lengthM: 10, widthM: 5, axisDeg: 0, ceilingHeight: { mm: 2700, level: 'global' as const }, volumeM3: 135, people: null };

  it('gives the stamp positions of each row', () => {
    const plan = planAutoPlacement([base], [r], () => values, () => CAL, () => ({ width: 10, height: 10 }));
    expect(plan.rows[0]!.stamps).toHaveLength(3);
    expect(plan.rows[0]!.requirement.perElement).toBe(10);
    expect(plan.rows[0]!.warnings).toEqual([]);
  });

  it('places nothing without a stamp, an unknown stamp, or a calibration', () => {
    expect(planAutoPlacement([{ ...base, stampDefinitionId: null }], [r], () => values, () => CAL, () => ({ width: 1, height: 1 })).rows[0]!.warnings).toEqual(['noStamp']);
    expect(planAutoPlacement([base], [r], () => values, () => CAL, () => null).rows[0]!.warnings).toEqual(['stampNotFound']);
    const noCal = planAutoPlacement([base], [r], () => values, () => null, () => ({ width: 1, height: 1 })).rows[0]!;
    expect(noCal.stamps).toEqual([]);
    expect(noCal.warnings).toEqual(['noCalibration']);
  });
});
