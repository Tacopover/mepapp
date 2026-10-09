import { describe, expect, it } from 'vitest';
import {
  calculateRoomRequirement,
  calculateRooms,
  manualRoom,
  coverageCount,
  parsePlacementRules,
  PLACEMENT_RULE_EXAMPLES,
  ruleAppliesToRoom,
  validatePlacementRule,
  type PlacementRule,
  type RoomValues,
} from './index.js';

// A room of 8 × 5 m = 40 m², 2.7 m high (108 m³), 4 people.
const values = (patch: Partial<RoomValues> = {}): RoomValues => ({
  areaM2: 40,
  perimeterM: 26,
  lengthM: 8,
  widthM: 5,
  axisDeg: 0,
  ceilingHeight: { mm: 2700, level: 'global' },
  volumeM3: 108,
  people: { count: 4, source: 'roomType' },
  ...patch,
});
const NO_SCALE = values({ areaM2: null, perimeterM: null, lengthM: null, widthM: null, volumeM3: null, people: null });

const rule = (patch: Partial<PlacementRule> = {}): PlacementRule => ({
  id: 'r',
  name: 'Rule',
  discipline: 'ventilation',
  roomTypeIds: [],
  stampDefinitionId: null,
  preset: 'custom',
  amount: { unit: 'dm³/s' },
  coverage: {},
  layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' },
  writeCapacity: true,
  ...patch,
});

describe('calculateRoomRequirement, one case per preset', () => {
  it('per area: 1.5 × 40 = 60, capacity 25 gives 3', () => {
    const r = calculateRoomRequirement(rule({ preset: 'perArea', amount: { perM2: 1.5, unit: 'dm³/s' }, capacityPerElement: 25 }), values());
    expect(r.required).toBeCloseTo(60);
    expect(r.quantityCount).toBe(3);
    expect(r.count).toBe(3);
    expect(r.perElement).toBeCloseTo(20);
  });

  it('per person + per area: 7 × 4 + 0.7 × 40 = 56, capacity 50 gives 2', () => {
    const r = calculateRoomRequirement(rule({ preset: 'perPersonArea', amount: { perPerson: 7, perM2: 0.7, unit: 'dm³/s' }, capacityPerElement: 50 }), values());
    expect(r.required).toBeCloseTo(56);
    expect(r.count).toBe(2);
    expect(r.perElement).toBeCloseTo(28);
  });

  it('air changes: 4 × 108 m³ = 432 m³/h, capacity 300 gives 2', () => {
    const r = calculateRoomRequirement(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'm³/h' }, capacityPerElement: 300 }), values());
    expect(r.required).toBeCloseTo(432);
    expect(r.count).toBe(2);
  });

  it('fixed per room: 25 in one element', () => {
    const r = calculateRoomRequirement(rule({ preset: 'fixed', amount: { fixed: 25, unit: 'dm³/s' } }), values());
    expect(r.required).toBe(25);
    expect(r.quantityCount).toBeNull();
    expect(r.count).toBe(1);
    expect(r.perElement).toBe(25);
  });

  it('lighting: 500 × 40 ÷ (0.6 × 0.8) = 41 667 lm, 3600 lm per luminaire gives 12', () => {
    const r = calculateRoomRequirement(
      rule({ preset: 'lighting', amount: { unit: 'lm' }, lighting: { lux: 500, utilisationFactor: 0.6, maintenanceFactor: 0.8 }, capacityPerElement: 3600 }),
      values(),
    );
    expect(r.required).toBeCloseTo(41666.67, 1);
    expect(r.count).toBe(12);
  });

  it('uses the minimum when the calculated amount is lower: 0.5 × 10 = 5 < 7', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 0.5, minimum: 7, unit: 'dm³/s' }, capacityPerElement: 10 }), values({ areaM2: 10 }));
    expect(r.required).toBe(7);
    expect(r.count).toBe(1);
  });

  it('does not round 2.0000001 elements up to 3', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 0.1 + 0.2, unit: 'x' }, capacityPerElement: 6 }), values({ areaM2: 40 }));
    expect(r.count).toBe(2);
  });
});

describe('counts and warnings', () => {
  it('takes the coverage count when it is larger, and says so', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 1, unit: 'x' }, capacityPerElement: 40, coverage: { maxSpacingM: 4 } }), values());
    expect(r.quantityCount).toBe(1);
    expect(r.coverageCount).toBe(4);
    expect(r.count).toBe(4);
    expect(r.perElement).toBeCloseTo(10);
    expect(r.warnings).toEqual(['countByCoverage']);
  });

  it('limits the count to the max count', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 1, unit: 'x' }, capacityPerElement: 5, maxCount: 3 }), values());
    expect(r.count).toBe(3);
    expect(r.warnings).toEqual(['maxCountReached']);
  });

  it('raises the count to the min count', () => {
    expect(calculateRoomRequirement(rule({ amount: { perM2: 1, unit: 'x' }, capacityPerElement: 100, minCount: 2 }), values()).count).toBe(2);
  });

  it('places one element per room for a rule with no capacity and no coverage', () => {
    expect(calculateRoomRequirement(rule(), values()).count).toBe(1);
  });

  it('cannot calculate without a calibration', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 1, unit: 'x' }, capacityPerElement: 5 }), NO_SCALE);
    expect(r.required).toBeNull();
    expect(r.count).toBeNull();
    expect(r.warnings).toEqual(['noCalibration']);
  });

  it('cannot calculate a per-person amount without people', () => {
    const r = calculateRoomRequirement(rule({ amount: { perPerson: 7, unit: 'x' }, capacityPerElement: 5 }), values({ people: null }));
    expect(r.count).toBeNull();
    expect(r.warnings).toEqual(['noPeople']);
  });

  it('needs the scale for a coverage limit, also without an amount', () => {
    const r = calculateRoomRequirement(rule({ coverage: { maxAreaPerElementM2: 60 } }), NO_SCALE);
    expect(r.count).toBeNull();
    expect(r.warnings).toEqual(['noCalibration']);
  });
});

describe('coverageCount', () => {
  it('8 × 5 m with 4 m spacing (2 m to the wall) needs 2 × 2', () => {
    expect(coverageCount(values(), { maxSpacingM: 4 })).toBe(4);
  });

  it('a separate wall distance: 7.5 m spacing, 3.5 m to the wall gives 2 × 1', () => {
    expect(coverageCount(values(), { maxSpacingM: 7.5, maxWallDistanceM: 3.5 })).toBe(2);
  });

  it('area per element: 40 ÷ 15 gives 3', () => {
    expect(coverageCount(values(), { maxAreaPerElementM2: 15 })).toBe(3);
  });

  it('the larger of area and grid wins', () => {
    expect(coverageCount(values(), { maxAreaPerElementM2: 15, maxSpacingM: 10 })).toBe(3);
  });

  it('is null without limits', () => {
    expect(coverageCount(values(), {})).toBeNull();
  });
});

describe('ruleAppliesToRoom', () => {
  it('filters by room type and name text', () => {
    const r = rule({ roomTypeIds: ['office'], nameContains: 'Kantoor' });
    expect(ruleAppliesToRoom(r, { roomTypeId: 'office', name: 'kantoor 1' })).toBe(true);
    expect(ruleAppliesToRoom(r, { roomTypeId: 'office', name: 'Werkplek' })).toBe(false);
    expect(ruleAppliesToRoom(r, { roomTypeId: 'toilet', name: 'Kantoor' })).toBe(false);
    expect(ruleAppliesToRoom(rule(), { name: null })).toBe(true);
    expect(ruleAppliesToRoom(rule({ roomTypeIds: ['office'] }), { name: 'x' })).toBe(false);
  });
});

describe('validatePlacementRule', () => {
  it('accepts every example rule', () => {
    for (const example of PLACEMENT_RULE_EXAMPLES) expect(validatePlacementRule(example, [])).toBeNull();
  });

  it('rejects bad values', () => {
    expect(validatePlacementRule(rule({ name: ' ' }), [])).toBe('Enter a name.');
    expect(validatePlacementRule(rule(), [rule({ id: 'other', name: 'rule' })])).toMatch(/already called/);
    expect(validatePlacementRule(rule({ capacityPerElement: 0 }), [])).toMatch(/capacity/);
    expect(validatePlacementRule(rule({ amount: { perM2: -1, unit: '' } }), [])).toMatch(/amount/);
    expect(validatePlacementRule(rule({ lighting: { lux: 500, utilisationFactor: 1.2, maintenanceFactor: 0.8 } }), [])).toMatch(/factors/);
    expect(validatePlacementRule(rule({ minCount: 3, maxCount: 2 }), [])).toMatch(/min count/);
    expect(validatePlacementRule(rule({ minCount: 1.5 }), [])).toMatch(/whole number/);
    expect(validatePlacementRule(rule({ coverage: { maxSpacingM: 0 } }), [])).toMatch(/coverage/);
  });
});

describe('parsePlacementRules', () => {
  it('reads the examples back unchanged', () => {
    expect(parsePlacementRules(JSON.parse(JSON.stringify(PLACEMENT_RULE_EXAMPLES)))).toEqual(PLACEMENT_RULE_EXAMPLES);
  });

  it('leaves out invalid entries and repeated ids', () => {
    const good = rule();
    expect(parsePlacementRules([good, { ...good, name: 'Again' }, { id: 'x' }, { ...good, id: 'bad', capacityPerElement: -1 }, 'text'])).toEqual([good]);
  });

  it('is null for something that is not a list', () => {
    expect(parsePlacementRules({})).toBeNull();
  });
});

describe('calculateRooms', () => {
  it('gives one row per room and applying rule, and lists the rooms no rule applies to', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const office = { ...manualRoom(0, square), id: 'a', name: 'Kantoor', roomTypeId: 'office' };
    const hall = { ...manualRoom(0, square), id: 'b', name: 'Hal', roomTypeId: 'entrance' };
    const air = rule({ id: 'air', roomTypeIds: ['office'], amount: { perM2: 1, unit: 'x' }, capacityPerElement: 15 });
    const smoke = rule({ id: 'smoke', name: 'Smoke', coverage: { maxAreaPerElementM2: 60 } });
    const result = calculateRooms([air, smoke], [office, hall], () => values());
    expect(result.rows.map((r) => [r.room.id, r.rule.id, r.requirement.count])).toEqual([['a', 'air', 3], ['a', 'smoke', 1], ['b', 'smoke', 1]]);
    expect(calculateRooms([air], [office, hall], () => values()).unmatched.map((r) => r.id)).toEqual(['b']);
  });
});
