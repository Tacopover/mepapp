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
  roomPlacementKey,
  autoPlacedStampIds,
  coverageRadiusM,
  layoutCoverage,
  layoutEvenSpread,
  layoutPerimeter,
  roomSamples,
  wallRuns,
  type PlacementRule,
  type RoomPolygon,
} from './index.js';
import type { Vec2 } from '../geometry.js';
import { markAutoPlacedMoved, type PlacedStamp } from '../stamp.js';

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

  it('uses the grid for Center with more than one stamp, and says so', () => {
    const out = layoutRoomStamps(rule({ strategy: 'center' }), room(rect(0, 0, 400, 200)), values, 3, CAL, { width: 10, height: 10 });
    expect(out.stamps).toHaveLength(3);
    expect(out.warnings).toEqual(['layoutFallback']);
  });

  it('Along the walls with a max spacing chooses the count from the wall run length', () => {
    // 0.5 m = 20 pt + 5 pt half stamp = 25 pt offset. Runs: 2 × (400 − 50) + 2 × (200 − 50) = 1000 pt = 25 m. Spacing 3 m → ceil(25 ÷ 3) = 9.
    const out = layoutRoomStamps(rule({ strategy: 'perimeter' }, { maxSpacingM: 3 }), room(rect(0, 0, 400, 200)), values, 1, CAL, { width: 10, height: 10 }, { quantityCount: null });
    expect(out.layoutCount).toEqual({ count: 9, limited: false });
    expect(out.stamps).toHaveLength(9);
    const capped = layoutRoomStamps({ ...rule({ strategy: 'perimeter' }, { maxSpacingM: 3 }), maxCount: 4 }, room(rect(0, 0, 400, 200)), values, 1, CAL, { width: 10, height: 10 }, { quantityCount: null });
    expect(capped.layoutCount).toEqual({ count: 4, limited: true });
  });

  it('Along the walls turns each stamp to face into the room, or uses the fixed angle', () => {
    const out = layoutRoomStamps(rule({ strategy: 'perimeter', wallOffsetM: 0 }), room(rect(0, 0, 400, 200)), values, 4, CAL, { width: 0, height: 0 });
    for (const s of out.stamps) {
      const a = (s.rotationDegrees * Math.PI) / 180;
      const localY = { x: -Math.sin(a), y: Math.cos(a) };
      expect(isValidPlacementPoint(room(rect(0, 0, 400, 200)).polygon, { x: s.position.x + localY.x * 10, y: s.position.y + localY.y * 10 }, 9.99)).toBe(true);
    }
    const fixed = layoutRoomStamps(rule({ strategy: 'perimeter', rotation: 'fixed', fixedAngleDeg: 30 }), room(rect(0, 0, 400, 200)), values, 4, CAL, { width: 0, height: 0 });
    expect(fixed.stamps.every((s) => s.rotationDegrees === 30)).toBe(true);
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
  const placedStamp = (id: string, position: Vec2, auto: PlacedStamp['autoPlaced']): PlacedStamp => ({
    id, category: 'terminal', transform: { position, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 10, nativeHeight: 10, ports: [], definitionId: 'grille', ...(auto ? { autoPlaced: auto } : {}),
  });
  const plan = (stamps: PlacedStamp[], roomIds = new Set(['room-1'])) =>
    planAutoPlacement([base], [r], () => values, () => CAL, () => ({ width: 10, height: 10 }), { stamps, roomIds }).rows[0]!;

  it('replaces the unmoved stamps of the same rule and room on a re-run', () => {
    const key = roomPlacementKey(r);
    const row = plan([
      placedStamp('a', { x: 50, y: 100 }, { ruleId: 'r', roomId: 'room-1', moved: false, roomKey: key }),
      placedStamp('b', { x: 60, y: 100 }, { ruleId: 'other', roomId: 'room-1', moved: false }),
      placedStamp('c', { x: 70, y: 100 }, { ruleId: 'r', roomId: 'room-2', moved: false }),
      placedStamp('d', { x: 80, y: 100 }, undefined),
    ], new Set(['room-1', 'room-2']));
    expect(row.existing).toEqual({ keep: [], replace: ['a'] });
    expect(row.stamps).toHaveLength(3);
    expect(row.warnings).toEqual([]);
  });

  it('keeps moved stamps, counts them, and leaves out the planned point nearest to each', () => {
    const full = plan([]).stamps.map((s) => s.position);
    const nearFirst = { x: full[0]!.x + 5, y: full[0]!.y };
    const row = plan([placedStamp('m', nearFirst, { ruleId: 'r', roomId: 'room-1', moved: true })]);
    expect(row.existing).toEqual({ keep: ['m'], replace: [] });
    expect(row.stamps.map((s) => s.position)).toEqual(full.slice(1));
  });

  it('places nothing when the moved stamps already reach the count', () => {
    const moved = ['m1', 'm2', 'm3', 'm4'].map((id, i) => placedStamp(id, { x: 50 + i * 50, y: 100 }, { ruleId: 'r', roomId: 'room-1', moved: true }));
    expect(plan(moved).stamps).toEqual([]);
  });

  it('warns when the room shape or type changed after the placement', () => {
    const old = roomPlacementKey({ ...r, polygon: { outer: rect(0, 0, 300, 200), holes: [] } });
    expect(plan([placedStamp('a', { x: 50, y: 100 }, { ruleId: 'r', roomId: 'room-1', moved: false, roomKey: old })]).warnings).toEqual(['roomChanged']);
    expect(roomPlacementKey({ ...r, roomTypeId: 'office' })).not.toBe(roomPlacementKey(r));
  });

  it('gives a stamp of a room that no longer exists to the room that contains it, and warns', () => {
    const row = plan([
      placedStamp('inside', { x: 50, y: 100 }, { ruleId: 'r', roomId: 'gone', moved: false }),
      placedStamp('outside', { x: 900, y: 900 }, { ruleId: 'r', roomId: 'gone', moved: false }),
    ]);
    expect(row.existing.replace).toEqual(['inside']);
    expect(row.warnings).toEqual(['roomChanged']);
  });

  it('lists the stamps of a rule that no longer applies to the room as stale', () => {
    const toiletOnly = { ...base, roomTypeIds: ['toilet'] };
    const out = planAutoPlacement([toiletOnly], [{ ...r, roomTypeId: 'office' }], () => values, () => CAL, () => ({ width: 10, height: 10 }), {
      stamps: [placedStamp('a', { x: 50, y: 100 }, { ruleId: 'r', roomId: 'room-1', moved: false }), placedStamp('m', { x: 90, y: 100 }, { ruleId: 'r', roomId: 'room-1', moved: true })],
      roomIds: new Set(['room-1']),
    });
    expect(out.rows).toEqual([]);
    expect(out.stale.map((e) => ({ room: e.room.id, rule: e.ruleId, keep: e.keep, replace: e.replace }))).toEqual([{ room: 'room-1', rule: 'r', keep: ['m'], replace: ['a'] }]);
    expect(autoPlacedStampIds(out.rows, out.stale)).toEqual(['m', 'a']);
  });

  it('takes the count of a Coverage row from the layout, and the amount per stamp follows it', () => {
    // 10 × 5 m room; the grid count for spacing 4 m is 3 × 2 = 6, but a radius of 4 ÷ √2 = 2.83 m needs fewer.
    const coverageRule: PlacementRule = { ...base, capacityPerElement: undefined, coverage: { maxSpacingM: 4 }, layout: { strategy: 'coverage', wallOffsetM: 0, rotation: 'room' } };
    const row = planAutoPlacement([coverageRule], [r], () => values, () => CAL, () => ({ width: 0, height: 0 })).rows[0]!;
    expect(row.stamps.length).toBe(row.requirement.count);
    expect(row.requirement.count).toBeLessThanOrEqual(8);
    expect(row.requirement.perElement).toBeCloseTo(30 / row.requirement.count!, 9);
    expect(worstDistance(r, row.stamps.map((s) => s.position))).toBeLessThanOrEqual((4 / Math.SQRT2) * 40 + 3);
  });

  it('lists every auto-placed stamp of the rows for Remove', () => {
    expect(autoPlacedStampIds([{ existing: { keep: ['m'], replace: ['a', 'b'] } }, { existing: { keep: [], replace: ['b', 'c'] } }])).toEqual(['m', 'a', 'b', 'c']);
  });
});

describe('markAutoPlacedMoved', () => {
  const stamp: PlacedStamp = { id: 's', category: 'terminal', transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 1, nativeHeight: 1, ports: [] };

  it('sets moved on an auto-placed stamp and leaves other stamps alone', () => {
    expect(markAutoPlacedMoved({ ...stamp, autoPlaced: { ruleId: 'r', roomId: 'x', moved: false } }).autoPlaced).toEqual({ ruleId: 'r', roomId: 'x', moved: true });
    expect(markAutoPlacedMoved(stamp)).toBe(stamp);
  });
});

/** The largest distance from a sample of the room to its nearest point: how well the points cover the room. */
const worstDistance = (r: { polygon: RoomPolygon }, points: Vec2[]) =>
  Math.max(...roomSamples(r, 0, 2000).all.map((q) => Math.min(...points.map((p) => Math.hypot(p.x - q.x, p.y - q.y)))));
const minGap = (points: Vec2[]) => Math.min(...points.flatMap((p, i) => points.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
const WITH_HOLE = room(rect(0, 0, 400, 400), [rect(150, 150, 100, 100)]);

describe('layoutEvenSpread', () => {
  it('spreads the points of a rectangle like the grid', () => {
    const r = layoutEvenSpread(room(rect(0, 0, 400, 200)), 4, 10);
    expect(r.points).toHaveLength(4);
    for (const p of r.points) expect([100, 300].some((x) => Math.abs(p.x - x) < 8) && [50, 150].some((y) => Math.abs(p.y - y) < 8)).toBe(true);
  });

  it('covers an L-shaped room better than the grid, with every point valid', () => {
    const l = room(L_SHAPE);
    const even = layoutEvenSpread(l, 3, 20);
    const grid = layoutGrid(l, 3, 20);
    expect(even.points.every((p) => isValidPlacementPoint(l.polygon, p, 20))).toBe(true);
    expect(worstDistance(l, even.points)).toBeLessThan(worstDistance(l, grid.points));
    expect(minGap(even.points)).toBeGreaterThan(150);
  });

  it('puts the points around a hole, one on each side', () => {
    const r = layoutEvenSpread(WITH_HOLE, 4, 10);
    expect(r.points.every((p) => isValidPlacementPoint(WITH_HOLE.polygon, p, 10))).toBe(true);
    const quadrants = new Set(r.points.map((p) => `${p.x < 200 ? 'w' : 'e'}${p.y < 200 ? 'n' : 's'}`));
    expect(quadrants.size).toBe(4);
  });

  it('moves one point to the middle of the room, also in an L-shape', () => {
    const l = room(L_SHAPE);
    const r = layoutEvenSpread(l, 1, 20);
    expect(r.points).toHaveLength(1);
    expect(isValidPlacementPoint(l.polygon, r.points[0]!, 20)).toBe(true);
  });
});

describe('coverageRadiusM', () => {
  it('takes the smallest radius of the limits', () => {
    expect(coverageRadiusM({})).toBeNull();
    expect(coverageRadiusM({ maxSpacingM: 4 })).toBeCloseTo(2.828, 3);
    expect(coverageRadiusM({ maxWallDistanceM: 1 })).toBeCloseTo(1.414, 3);
    expect(coverageRadiusM({ maxAreaPerElementM2: 50 })).toBeCloseTo(5, 6);
    expect(coverageRadiusM({ maxAreaPerElementM2: 60, maxSpacingM: 7.5, maxWallDistanceM: 3.5 })).toBeCloseTo(3.5 * Math.SQRT2, 6);
  });
});

describe('layoutCoverage', () => {
  it('adds points until every point of a rectangle is within the radius', () => {
    const r = room(rect(0, 0, 400, 200));
    const out = layoutCoverage(r, 1, 0, 80);
    expect(worstDistance(r, out.points)).toBeLessThanOrEqual(80 + 3);
    expect(out.limited).toBe(false);
    expect(out.warnings).toEqual([]);
    // A 3 × 2 grid of 133 × 100 cells reaches 83 pt, so a 4 × 2 grid (8) is enough; coverage needs no more.
    expect(out.points.length).toBeLessThanOrEqual(8);
  });

  it('needs fewer points in an L-shape than a grid over its bounding rectangle', () => {
    const l = room(L_SHAPE);
    const out = layoutCoverage(l, 1, 10, 120);
    expect(worstDistance(l, out.points)).toBeLessThanOrEqual(120 + 4);
    expect(out.points.every((p) => isValidPlacementPoint(l.polygon, p, 10))).toBe(true);
    // The bounding square 600 × 600 with spacing 120 × √2 = 170 needs a 4 × 4 grid.
    expect(out.points.length).toBeLessThan(16);
  });

  it('covers a room with a hole and keeps the points out of the hole', () => {
    const out = layoutCoverage(WITH_HOLE, 1, 10, 110);
    expect(worstDistance(WITH_HOLE, out.points)).toBeLessThanOrEqual(110 + 3);
    expect(out.points.every((p) => isValidPlacementPoint(WITH_HOLE.polygon, p, 10))).toBe(true);
  });

  it('stops at the max count and warns', () => {
    const out = layoutCoverage(room(L_SHAPE), 1, 10, 60, 3);
    expect(out.points).toHaveLength(3);
    expect(out.limited).toBe(true);
    expect(out.warnings).toEqual(['coverageNotMet']);
  });

  it('warns when the wall offset leaves the corners out of reach', () => {
    const out = layoutCoverage(room(rect(0, 0, 400, 200)), 1, 90, 100);
    expect(out.warnings).toContain('coverageNotMet');
    expect(out.limited).toBe(false);
  });
});

describe('layoutPerimeter', () => {
  it('puts the points at the offset from the walls, at equal distances along them', () => {
    const r = room(rect(0, 0, 400, 200));
    const out = layoutPerimeter(r, 4, 20);
    // Runs 360 + 160 + 360 + 160 = 1040 pt; points at 130, 390, 650, 910.
    expect(sortPts(out.points)).toEqual(sortPts([{ x: 150, y: 20 }, { x: 380, y: 50 }, { x: 250, y: 180 }, { x: 20, y: 150 }]));
    expect(out.warnings).toEqual([]);
  });

  it('gives the same runs for either ring direction', () => {
    const forward = wallRuns(room(L_SHAPE), 20).map((run) => Math.round(run.length));
    const backward = wallRuns(room([...L_SHAPE].reverse()), 20).map((run) => Math.round(run.length));
    expect([...backward].sort()).toEqual([...forward].sort());
    for (const run of wallRuns(room([...L_SHAPE].reverse()), 20)) {
      expect(isValidPlacementPoint(room(L_SHAPE).polygon, { x: (run.start.x + run.end.x) / 2, y: (run.start.y + run.end.y) / 2 }, 19.99)).toBe(true);
    }
  });

  it('keeps every point valid in an L-shaped room', () => {
    const l = room(L_SHAPE);
    const out = layoutPerimeter(l, 12, 20);
    expect(out.points).toHaveLength(12);
    expect(out.points.every((p) => isValidPlacementPoint(l.polygon, p, 20))).toBe(true);
    expect(out.rotations).toHaveLength(12);
  });

  it('uses the outer walls only, and keeps the points out of a hole', () => {
    const out = layoutPerimeter(WITH_HOLE, 8, 10);
    expect(out.points.every((p) => isValidPlacementPoint(WITH_HOLE.polygon, p, 10))).toBe(true);
    for (const p of out.points) expect(Math.min(p.x, p.y, 400 - p.x, 400 - p.y)).toBeCloseTo(10, 6);
  });

  it('falls back to the label point when the walls are too short for the offset', () => {
    expect(layoutPerimeter(room(rect(0, 0, 40, 40)), 2, 30).warnings).toEqual(['noFit']);
  });
});
