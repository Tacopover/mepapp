import { describe, expect, it } from 'vitest';
import {
  calculateRoomRequirement,
  calculateRooms,
  manualRoom,
  M2_PER_FT2,
  M3H_PER_CFM,
  M_PER_FT,
  parsePlacementRules,
  PLACEMENT_PRESET_HELP,
  PLACEMENT_PRESET_LABELS,
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

  it('per person: 7 × 4 = 28, capacity 10 gives 3', () => {
    const r = calculateRoomRequirement(rule({ preset: 'perPerson', amount: { perPerson: 7, unit: 'dm³/s' }, capacityPerElement: 10 }), values());
    expect(r.required).toBeCloseTo(28);
    expect(r.count).toBe(3);
    expect(r.countSource).toBe('amount');
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
    expect(r.countSource).toBe('onePerRoom');
    expect(r.perElement).toBe(25);
  });

  it('By coverage leaves the count to the layout', () => {
    const r = calculateRoomRequirement(rule({ preset: 'coverage', amount: { perM2: 1, unit: 'x' }, capacityPerElement: 5, coverage: { maxSpacing: 4 } }), values());
    expect(r).toEqual({ required: null, quantityCount: null, count: null, countSource: 'coverage', perElement: null, warnings: [] });
    expect(calculateRoomRequirement(rule({ preset: 'coverage', coverage: { maxSpacing: 4 } }), NO_SCALE).warnings).toEqual(['noCalibration']);
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
  it('ignores the coverage limits of an amount rule: the count comes from the amount only', () => {
    const r = calculateRoomRequirement(rule({ amount: { perM2: 1, unit: 'x' }, capacityPerElement: 40, coverage: { maxSpacing: 4 } }), values());
    expect(r.quantityCount).toBe(1);
    expect(r.count).toBe(1);
    expect(r.perElement).toBeCloseTo(40);
    expect(r.warnings).toEqual([]);
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

  it('places one element per room without a capacity, also when an input is missing', () => {
    const r = calculateRoomRequirement(rule({ amount: { perPerson: 7, unit: 'x' } }), values({ people: null }));
    expect(r.count).toBe(1);
    expect(r.required).toBeNull();
    expect(r.warnings).toEqual(['noPeople']);
  });
});

describe('units', () => {
  it('has the exact factors', () => {
    expect(M_PER_FT).toBe(0.3048);
    expect(M2_PER_FT2).toBeCloseTo(0.09290304, 12);
    expect(M3H_PER_CFM).toBe(1.69901082);
  });

  it('air changes in cfm: 4 × 108 m³/h ÷ 1.69901082 = 254.27 cfm', () => {
    const r = calculateRoomRequirement(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'cfm' }, capacityPerElement: 100 }), values());
    expect(r.required).toBeCloseTo(432 / 1.69901082, 6);
    expect(r.count).toBe(3);
  });

  it('air changes in dm³/s and l/s: 432 m³/h = 120 dm³/s', () => {
    expect(calculateRoomRequirement(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'dm³/s' } }), values()).required).toBeCloseTo(120, 9);
    expect(calculateRoomRequirement(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'l/s' } }), values()).required).toBeCloseTo(120, 9);
    expect(calculateRoomRequirement(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'm³/s' } }), values()).required).toBeCloseTo(0.12, 9);
  });

  it('per area in ft²: 40 m² = 430.56 ft², 0.1 cfm per ft² gives 43.06 cfm', () => {
    const r = calculateRoomRequirement(rule({ preset: 'perArea', amount: { perM2: 0.1, unit: 'cfm', areaUnit: 'ft2' } }), values());
    expect(r.required).toBeCloseTo((0.1 * 40) / 0.09290304, 6);
  });

  it('lighting in fc uses the area in ft²: 50 fc × 430.56 ft² ÷ 0.48', () => {
    const r = calculateRoomRequirement(
      rule({ preset: 'lighting', amount: { unit: 'lm' }, lighting: { lux: 50, utilisationFactor: 0.6, maintenanceFactor: 0.8, illuminanceUnit: 'fc' } }),
      values(),
    );
    expect(r.required).toBeCloseTo((50 * 40) / 0.09290304 / 0.48, 4);
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

describe('presets', () => {
  it('has a label and an explanation for each preset', () => {
    for (const preset of Object.keys(PLACEMENT_PRESET_LABELS) as (keyof typeof PLACEMENT_PRESET_LABELS)[]) {
      expect(PLACEMENT_PRESET_HELP[preset].formula).not.toBe('');
      expect(PLACEMENT_PRESET_HELP[preset].symbols.length).toBeGreaterThan(0);
    }
    expect(PLACEMENT_PRESET_HELP.perPersonArea.symbols.map((s) => s.symbol)).toEqual(['a', 'b', 'persons']);
  });
});

describe('validatePlacementRule', () => {
  it('accepts every example rule', () => {
    for (const example of PLACEMENT_RULE_EXAMPLES) expect(validatePlacementRule(example, [])).toBeNull();
  });

  it('needs a coverage limit for By coverage, and a flow unit for air changes', () => {
    expect(validatePlacementRule(rule({ preset: 'coverage' }), [])).toMatch(/By coverage needs/);
    expect(validatePlacementRule(rule({ preset: 'coverage', coverage: { maxAreaPerElement: 60 } }), [])).toBeNull();
    expect(validatePlacementRule(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'W' } }), [])).toMatch(/flow unit/);
    expect(validatePlacementRule(rule({ preset: 'airChanges', amount: { perM3: 4, unit: 'cfm' } }), [])).toBeNull();
    expect(validatePlacementRule(rule({ layout: { strategy: 'grid', wallOffsetM: 0, minSpacingM: -1, rotation: 'room' } }), [])).toMatch(/between stamps/);
  });

  it('rejects bad values', () => {
    expect(validatePlacementRule(rule({ name: ' ' }), [])).toBe('Enter a name.');
    expect(validatePlacementRule(rule(), [rule({ id: 'other', name: 'rule' })])).toMatch(/already called/);
    expect(validatePlacementRule(rule({ capacityPerElement: 0 }), [])).toMatch(/capacity/);
    expect(validatePlacementRule(rule({ amount: { perM2: -1, unit: '' } }), [])).toMatch(/amount/);
    expect(validatePlacementRule(rule({ lighting: { lux: 500, utilisationFactor: 1.2, maintenanceFactor: 0.8 } }), [])).toMatch(/factors/);
    expect(validatePlacementRule(rule({ minCount: 3, maxCount: 2 }), [])).toMatch(/min count/);
    expect(validatePlacementRule(rule({ minCount: 1.5 }), [])).toMatch(/whole number/);
    expect(validatePlacementRule(rule({ coverage: { maxSpacing: 0 } }), [])).toMatch(/coverage/);
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

  it('reads the new layout and unit fields', () => {
    const r = rule({
      amount: { perM2: 0.1, unit: 'cfm', areaUnit: 'ft2' },
      coverage: { maxSpacing: 20, lengthUnit: 'ft' },
      layout: { strategy: 'grid', wallOffsetM: 0.5, minSpacingM: 1.5, gridStyle: 'staggered', rotation: 'room' },
      lighting: { lux: 50, utilisationFactor: 0.6, maintenanceFactor: 0.8, illuminanceUnit: 'fc' },
    });
    expect(parsePlacementRules([JSON.parse(JSON.stringify(r))])).toEqual([r]);
  });
});

describe('parsePlacementRules migrates rules from before the guide', () => {
  // Stored entries as Phase 6 wrote them.
  const old = (patch: Record<string, unknown>) => ({ ...JSON.parse(JSON.stringify(rule())), ...patch });

  it('the Coverage layout with no amount becomes By coverage with Even spread (the old smoke detector)', () => {
    const [r] = parsePlacementRules([old({ preset: 'fixed', amount: { unit: '' }, coverage: { maxAreaPerElementM2: 60, maxSpacingM: 7.5, maxWallDistanceM: 3.5 }, layout: { strategy: 'coverage', wallOffsetM: 0.5, rotation: 'room' } })])!;
    expect(r!.preset).toBe('coverage');
    expect(r!.layout.strategy).toBe('evenSpread');
    expect(r!.coverage).toEqual({ maxAreaPerElement: 60, maxSpacing: 7.5, maxWallDistance: 3.5 });
  });

  it('the Coverage layout with an amount keeps the preset, and gets Even spread', () => {
    const [r] = parsePlacementRules([old({ preset: 'perArea', amount: { perM2: 1, unit: 'dm³/s' }, capacityPerElement: 20, coverage: { maxSpacingM: 4 }, layout: { strategy: 'coverage', wallOffsetM: 0.5, rotation: 'room' } })])!;
    expect(r!.preset).toBe('perArea');
    expect(r!.layout.strategy).toBe('evenSpread');
  });

  it('keeps the coverage limits of an amount rule in the data (the old supply air example)', () => {
    const [r] = parsePlacementRules([old({ preset: 'perPersonArea', amount: { perPerson: 7, perM2: 0.7, unit: 'dm³/s' }, capacityPerElement: 50, coverage: { maxSpacingM: 4 }, layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' } })])!;
    expect(r!.coverage).toEqual({ maxSpacing: 4 });
    expect(r!.layout).toEqual({ strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' });
    expect(calculateRoomRequirement(r!, values()).count).toBe(2);
  });

  it('an air-changes rule without a flow unit becomes Custom, with the same numbers', () => {
    const [r] = parsePlacementRules([old({ preset: 'airChanges', amount: { perM3: 4, unit: 'm3/h' }, capacityPerElement: 300 })])!;
    expect(r!.preset).toBe('custom');
    expect(calculateRoomRequirement(r!, values()).required).toBeCloseTo(432);
  });
});

describe('calculateRooms', () => {
  it('gives one row per room and applying rule, and lists the rooms no rule applies to', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const office = { ...manualRoom(0, square), id: 'a', name: 'Kantoor', roomTypeId: 'office' };
    const hall = { ...manualRoom(0, square), id: 'b', name: 'Hal', roomTypeId: 'entrance' };
    const air = rule({ id: 'air', roomTypeIds: ['office'], amount: { perM2: 1, unit: 'x' }, capacityPerElement: 15 });
    const smoke = rule({ id: 'smoke', name: 'Smoke', preset: 'coverage', coverage: { maxAreaPerElement: 60 } });
    const result = calculateRooms([air, smoke], [office, hall], () => values());
    expect(result.rows.map((r) => [r.room.id, r.rule.id, r.requirement.count])).toEqual([['a', 'air', 3], ['a', 'smoke', null], ['b', 'smoke', null]]);
    expect(calculateRooms([air], [office, hall], () => values()).unmatched.map((r) => r.id)).toEqual(['b']);
  });
});
