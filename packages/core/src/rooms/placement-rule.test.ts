import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_NEEDS,
  calculateRoomRequirement,
  calculateRooms,
  CAPACITY_UNITS,
  EXAMPLE_UF_TABLE,
  hasOldPlacementRules,
  manualRoom,
  M2_PER_FT2,
  M3H_PER_CFM,
  M_PER_FT,
  moveOldRuleNumbers,
  NEED_ROUTING_TARGET_DEFAULTS,
  parsePlacementRules,
  parseRoomDemands,
  PLACEMENT_RULE_EXAMPLES,
  ROOM_TYPE_DEMAND_EXAMPLES,
  ruleAppliesToRoom,
  ruleRoutingTargets,
  routingTargetDefaultOf,
  ruleUnitOf,
  ufAtRoomIndex,
  validatePlacementRule,
  type PlacementRule,
  type RoomDemands,
  type RoomNeed,
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
const NO_SCALE = { areaM2: null, perimeterM: null, lengthM: null, widthM: null, volumeM3: null, people: null };
const withDemands = (demands: RoomDemands, patch: Partial<RoomValues> = {}) => values({ demands, ...patch });

const rule = (patch: Partial<PlacementRule> = {}): PlacementRule => ({
  id: 'r',
  name: 'Rule',
  discipline: 'ventilation',
  roomTypeIds: [],
  stampDefinitionId: null,
  countBy: 'need',
  needId: 'supplyAir',
  coverage: {},
  layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' },
  writeCapacity: true,
  ...patch,
});

const supply7: RoomDemands = { supplyAir: { terms: [{ basis: 'person', value: 7 }] } };
const office = ROOM_TYPE_DEMAND_EXAMPLES.office!.demands;

describe('calculateRoomRequirement: need ÷ capacity', () => {
  it('supply air 7 × 4 persons = 28 dm³/s, 10 per grille gives 3', () => {
    const r = calculateRoomRequirement(rule({ capacityPerElement: 10 }), withDemands(supply7));
    expect(r).toMatchObject({ required: 28, capacity: 10, quantityCount: 3, count: 3, countSource: 'amount', warnings: [] });
    expect(r.perElement).toBeCloseTo(28 / 3);
    expect(r.demand?.result.parts.map((p) => p.amount)).toEqual([28]);
  });

  it('counts in the unit of the rule: m³/h, l/s, cfm', () => {
    const inM3h = calculateRoomRequirement(rule({ capacityPerElement: 50, unit: 'm³/h' }), withDemands(supply7));
    expect(inM3h.required).toBeCloseTo(100.8);
    expect(inM3h.count).toBe(3);
    expect(calculateRoomRequirement(rule({ unit: 'l/s' }), withDemands(supply7)).required).toBeCloseTo(28);
    expect(calculateRoomRequirement(rule({ unit: 'cfm' }), withDemands(supply7)).required).toBeCloseTo((28 * 3.6) / M3H_PER_CFM, 6);
    expect(ruleUnitOf(rule({ unit: 'kW' }), BUILT_IN_NEEDS[1]!)).toBe('dm³/s');
  });

  it('air changes from the room type: 4 × 108 m³ = 432 m³/h; 300 m³/h per grille gives 2', () => {
    const r = calculateRoomRequirement(rule({ needId: 'returnAir', capacityPerElement: 300, unit: 'm³/h' }), withDemands({ returnAir: { terms: [{ basis: 'volume', value: 4 }] } }));
    expect(r.required).toBeCloseTo(432);
    expect(r.count).toBe(2);
  });

  it('a power: 40 W/m² × 40 m² = 1.6 kW; 1 kW per radiator gives 2', () => {
    const r = calculateRoomRequirement(rule({ needId: 'heating', capacityPerElement: 1, unit: 'kW' }), withDemands(office));
    expect(r.required).toBeCloseTo(1.6);
    expect(r.count).toBe(2);
  });

  it('the minimum of the room type: 0.5 × 10 m² = 5 < 7', () => {
    const r = calculateRoomRequirement(rule({ capacityPerElement: 10 }), withDemands({ supplyAir: { terms: [{ basis: 'area', value: 0.5 }], minimum: 7 } }, { areaM2: 10 }));
    expect(r.required).toBe(7);
    expect(r.demand?.result.minimumApplied).toBe(true);
    expect(r.count).toBe(1);
  });

  it('sockets: an Office with only 4 per person gets a count (the socket case of §2), a double socket holds 2', () => {
    const r = calculateRoomRequirement(rule({ needId: 'sockets', capacityPerElement: 2 }), withDemands(office));
    expect(r).toMatchObject({ required: 16, count: 8, warnings: [] });
    expect(calculateRoomRequirement(rule({ needId: 'sockets' }), withDemands(office)).count).toBe(16);
  });

  it('1 socket per 15 m room length: 8 m gives 0.53, so 1 stamp', () => {
    const r = calculateRoomRequirement(rule({ needId: 'sockets', capacityPerElement: 2 }), withDemands({ sockets: { terms: [{ basis: 'length', every: 15 }] } }));
    expect(r.required).toBeCloseTo(8 / 15);
    expect(r.count).toBe(1);
  });

  it('does not round 2.0000001 elements up to 3', () => {
    expect(calculateRoomRequirement(rule({ capacityPerElement: 6 }), withDemands({ supplyAir: { terms: [{ basis: 'area', value: 0.1 + 0.2 }] } })).count).toBe(2);
  });

  it('places one element per room for a flow without a capacity, and gives it the whole need', () => {
    const r = calculateRoomRequirement(rule(), withDemands(supply7));
    expect(r).toMatchObject({ required: 28, capacity: null, quantityCount: null, count: 1, countSource: 'onePerRoom', perElement: 28 });
  });

  it('an own need of the user', () => {
    const data: RoomNeed = { id: 'need-data', name: 'Data outlets', kind: 'count', unit: 'outlets', own: true };
    const r = calculateRoomRequirement(rule({ needId: 'need-data', capacityPerElement: 2 }), withDemands({ 'need-data': { terms: [{ basis: 'person', every: 1 }] } }), [...BUILT_IN_NEEDS, data]);
    expect(r.count).toBe(2);
    expect(calculateRoomRequirement(rule({ needId: 'need-data' }), withDemands({ 'need-data': { terms: [{ basis: 'room', value: 1 }] } })).warnings).toEqual(['needNotFound']);
  });

  it('a room type without the need gives no count, also without a capacity', () => {
    expect(calculateRoomRequirement(rule({ capacityPerElement: 10 }), withDemands({ heating: { terms: [{ basis: 'area', value: 40 }] } }))).toMatchObject({ count: null, warnings: ['noDemand'] });
    expect(calculateRoomRequirement(rule(), values())).toMatchObject({ count: null, warnings: ['noDemand'] });
    // A need id that every object has finds no demand (it does not read the prototype).
    const odd: RoomNeed = { id: 'constructor', name: 'Odd', kind: 'count', unit: 'things', own: true };
    expect(calculateRoomRequirement(rule({ needId: 'constructor' }), withDemands(supply7), [...BUILT_IN_NEEDS, odd])).toMatchObject({ count: null, warnings: ['noDemand'] });
  });

  it('cannot calculate without a calibration or persons; without a capacity it still places one', () => {
    expect(calculateRoomRequirement(rule({ capacityPerElement: 5 }), withDemands({ supplyAir: { terms: [{ basis: 'area', value: 1 }] } }, NO_SCALE))).toMatchObject({ required: null, count: null, warnings: ['noCalibration'] });
    expect(calculateRoomRequirement(rule({ capacityPerElement: 5 }), withDemands(supply7, { people: null }))).toMatchObject({ count: null, warnings: ['noPeople'] });
    expect(calculateRoomRequirement(rule(), withDemands(supply7, { people: null }))).toMatchObject({ required: null, count: 1, warnings: ['noPeople'] });
  });

  it('the min count and the max count', () => {
    expect(calculateRoomRequirement(rule({ capacityPerElement: 100, minCount: 2 }), withDemands(supply7)).count).toBe(2);
    const capped = calculateRoomRequirement(rule({ capacityPerElement: 5, maxCount: 3 }), withDemands(supply7));
    expect(capped.count).toBe(3);
    expect(capped.warnings).toEqual(['maxCountReached']);
  });

  it('warns when a number above 0 gives a need of 0 (0 persons); a demand of only 0 says "needs none"', () => {
    const nobody = { people: { count: 0, source: 'roomType' as const } };
    expect(calculateRoomRequirement(rule({ capacityPerElement: 50 }), withDemands(supply7, nobody))).toMatchObject({ required: 0, count: 0, warnings: ['zeroNeed'] });
    expect(calculateRoomRequirement(rule({ capacityPerElement: 50, minCount: 1 }), withDemands(supply7, nobody))).toMatchObject({ count: 1, warnings: [] });
    expect(calculateRoomRequirement(rule({ needId: 'sockets' }), withDemands({ sockets: { terms: [{ basis: 'room', value: 0 }] } }))).toMatchObject({ count: 0, warnings: [] });
  });

  it('ignores the coverage limits without alsoCoverage', () => {
    const r = calculateRoomRequirement(rule({ capacityPerElement: 40, coverage: { maxSpacing: 4 } }), withDemands(supply7));
    expect(r.count).toBe(1);
    expect(r.warnings).toEqual([]);
  });
});

describe('calculateRoomRequirement: Light', () => {
  const lightRule = (patch: Partial<PlacementRule> = {}) => rule({ needId: 'light', capacityPerElement: 3600, luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8 }, ...patch });
  const lit = (lux: number, workingPlaneM?: number): RoomDemands => ({ light: { terms: [{ basis: 'illuminance', value: lux }], ...(workingPlaneM !== undefined ? { workingPlaneM } : {}) } });

  it('500 lx × 40 m² = 20 000 lm; one luminaire gives 3600 × 0.6 × 0.8 = 1728 lm; 12 luminaires (as the lumen method)', () => {
    const r = calculateRoomRequirement(lightRule(), withDemands(lit(500)));
    expect(r).toMatchObject({ required: 20000, count: 12, lighting: { uf: 0.6 } });
    expect(r.capacity).toBeCloseTo(1728);
    expect(Math.ceil((500 * 40) / (0.6 * 0.8) / 3600)).toBe(12);
  });

  it('UF from the room index k = 2A ÷ (h_m × P), with the working plane of the room type', () => {
    // h_m = 2.7 − 0 − 0.75 = 1.95 m; k = 80 ÷ (1.95 × 26) = 1.578; UF between 0.68 (1.5) and 0.74 (2).
    const table = lightRule({ luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [...EXAMPLE_UF_TABLE] } });
    const r = calculateRoomRequirement(table, withDemands(lit(500)));
    const k = 80 / (1.95 * 26);
    const uf = 0.68 + (0.06 * (k - 1.5)) / 0.5;
    expect(r.lighting?.roomIndex).toMatchObject({ k: expect.closeTo(k, 6), hmM: expect.closeTo(1.95, 6), workingPlaneM: 0.75, workingPlaneSource: 'default' });
    expect(r.capacity).toBeCloseTo(3600 * uf * 0.8);
    const suspended = calculateRoomRequirement(lightRule({ luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [...EXAMPLE_UF_TABLE], suspensionM: 0.5 } }), withDemands(lit(300, 0)));
    expect(suspended.lighting?.roomIndex).toMatchObject({ hmM: expect.closeTo(2.2, 6), workingPlaneM: 0, workingPlaneSource: 'roomType' });
  });

  it('no room index when the luminaire is not above the working plane', () => {
    const r = calculateRoomRequirement(lightRule({ luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [...EXAMPLE_UF_TABLE], suspensionM: 2 } }), withDemands(lit(500)));
    expect(r.warnings).toContain('noRoomIndex');
    expect(r.count).toBeNull();
  });

  it('without a luminaire capacity: one luminaire per room', () => {
    expect(calculateRoomRequirement(lightRule({ capacityPerElement: undefined }), withDemands(lit(500)))).toMatchObject({ required: 20000, count: 1, countSource: 'onePerRoom' });
  });

  it('ufAtRoomIndex: linear between the points, the end values outside them', () => {
    const table = [{ k: 2, uf: 0.7 }, { k: 1, uf: 0.5 }];
    expect(ufAtRoomIndex(table, 0.4)).toBe(0.5);
    expect(ufAtRoomIndex(table, 1.5)).toBeCloseTo(0.6);
    expect(ufAtRoomIndex(table, 9)).toBe(0.7);
  });
});

describe('calculateRoomRequirement: the same number in each room, and coverage', () => {
  it('the same number in each room, with the count limits', () => {
    expect(calculateRoomRequirement(rule({ countBy: 'perRoom', needId: undefined }), values())).toMatchObject({ count: 1, countSource: 'perRoom', required: null });
    expect(calculateRoomRequirement(rule({ countBy: 'perRoom', perRoomCount: 3, maxCount: 2 }), values())).toMatchObject({ count: 2, warnings: ['maxCountReached'] });
  });

  it('By coverage leaves the count to the layout', () => {
    const r = calculateRoomRequirement(rule({ countBy: 'coverage', capacityPerElement: 5, coverage: { maxSpacing: 4 } }), values());
    expect(r).toEqual({ required: null, capacity: null, quantityCount: null, perElement: null, count: null, countSource: 'coverage', warnings: [] });
    expect(calculateRoomRequirement(rule({ countBy: 'coverage', coverage: { maxSpacing: 4 } }), values(NO_SCALE)).warnings).toEqual(['noCalibration']);
  });
});

describe('units', () => {
  it('has the exact factors and the capacity units', () => {
    expect(M_PER_FT).toBe(0.3048);
    expect(M2_PER_FT2).toBeCloseTo(0.09290304, 12);
    expect(M3H_PER_CFM).toBe(1.69901082);
    expect(CAPACITY_UNITS.flow[0]).toBe('dm³/s');
    expect([...CAPACITY_UNITS.flow].sort()).toEqual(['cfm', 'dm³/s', 'l/s', 'm³/h', 'm³/s']);
    expect(CAPACITY_UNITS.power).toEqual(['W', 'kW']);
  });
});

describe('ruleAppliesToRoom', () => {
  it('filters by room type and name text', () => {
    const r = rule({ roomTypeIds: ['office'], nameContains: 'Kantoor' });
    expect(ruleAppliesToRoom(r, { roomTypeId: 'office', name: 'kantoor 1' })).toBe(true);
    expect(ruleAppliesToRoom(r, { roomTypeId: 'office', name: 'Werkplek' })).toBe(false);
    expect(ruleAppliesToRoom(r, { roomTypeId: 'toilet', name: 'Kantoor' })).toBe(false);
    expect(ruleAppliesToRoom(rule({ roomTypeIds: ['office'] }), { name: 'x' })).toBe(false);
  });

  it('a need rule without room types applies to the rooms whose type has the need', () => {
    expect(ruleAppliesToRoom(rule(), { roomTypeId: 'office', name: 'x' }, supply7)).toBe(true);
    expect(ruleAppliesToRoom(rule(), { roomTypeId: 'corridor', name: 'x' }, { heating: { terms: [{ basis: 'area', value: 30 }] } })).toBe(false);
    expect(ruleAppliesToRoom(rule(), { name: 'x' })).toBe(false);
    expect(ruleAppliesToRoom(rule({ needId: 'constructor' }), { roomTypeId: 'office', name: 'x' }, supply7)).toBe(false);
    expect(ruleAppliesToRoom(rule({ roomTypeIds: ['corridor'] }), { roomTypeId: 'corridor', name: 'x' })).toBe(true);
    expect(ruleAppliesToRoom(rule({ countBy: 'perRoom' }), { name: null })).toBe(true);
    expect(ruleAppliesToRoom(rule({ countBy: 'coverage' }), { name: null })).toBe(true);
  });
});

describe('calculateRooms', () => {
  it('gives one row per room and applying rule, and lists the rooms no rule applies to', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const officeRoom = { ...manualRoom(0, square), id: 'a', name: 'Kantoor', roomTypeId: 'office' };
    const hall = { ...manualRoom(0, square), id: 'b', name: 'Hal', roomTypeId: 'entrance' };
    const air = rule({ id: 'air', capacityPerElement: 15 });
    const smoke = rule({ id: 'smoke', name: 'Smoke', countBy: 'coverage', coverage: { maxAreaPerElement: 60 } });
    const valuesOf = (room: { id: string }) => (room.id === 'a' ? withDemands(office) : values());
    const result = calculateRooms([air, smoke], [officeRoom, hall], valuesOf);
    expect(result.rows.map((r) => [r.room.id, r.rule.id, r.requirement.count])).toEqual([['a', 'air', 2], ['a', 'smoke', null], ['b', 'smoke', null]]);
    expect(calculateRooms([air], [officeRoom, hall], valuesOf).unmatched.map((r) => r.id)).toEqual(['b']);
  });
});

describe('validatePlacementRule', () => {
  it('accepts every example rule', () => {
    for (const example of PLACEMENT_RULE_EXAMPLES) expect(validatePlacementRule(example, [])).toBeNull();
  });

  it('rejects bad values', () => {
    expect(validatePlacementRule(rule({ name: ' ' }), [])).toBe('Enter a name.');
    expect(validatePlacementRule(rule(), [rule({ id: 'other', name: 'rule' })])).toMatch(/already called/);
    expect(validatePlacementRule(rule({ needId: undefined }), [])).toMatch(/Choose the demand type/);
    expect(validatePlacementRule(rule({ capacityPerElement: 0 }), [])).toMatch(/one stamp gives/);
    expect(validatePlacementRule(rule({ unit: 'lm' }), [])).toMatch(/not a unit of a flow or a power/);
    expect(validatePlacementRule(rule({ unit: 'kW' }), [])).toBe('The unit kW is not a unit of Supply air.');
    expect(validatePlacementRule(rule({ needId: 'heating', unit: 'kW' }), [])).toBeNull();
    const own: RoomNeed = { id: 'need-x', name: 'Extract', kind: 'flow', unit: 'dm³/s', own: true };
    expect(validatePlacementRule(rule({ needId: 'need-x', unit: 'W' }), [], [...BUILT_IN_NEEDS, own])).toBe('The unit W is not a unit of Extract.');
    expect(validatePlacementRule(rule({ luminaire: { utilisationFactor: 1.2, maintenanceFactor: 0.8 } }), [])).toMatch(/factors/);
    expect(validatePlacementRule(rule({ luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [{ k: 1, uf: 0.5 }] } }), [])).toMatch(/UF table/);
    expect(validatePlacementRule(rule({ countBy: 'perRoom', perRoomCount: 1.5 }), [])).toMatch(/each room/);
    expect(validatePlacementRule(rule({ minCount: 3, maxCount: 2 }), [])).toMatch(/min count/);
    expect(validatePlacementRule(rule({ minCount: 1.5 }), [])).toMatch(/whole number/);
    expect(validatePlacementRule(rule({ coverage: { maxSpacing: 0 } }), [])).toMatch(/coverage/);
    expect(validatePlacementRule(rule({ alsoCoverage: true }), [])).toMatch(/Also cover/);
    expect(validatePlacementRule(rule({ layout: { strategy: 'grid', wallOffsetM: 0, minSpacingM: -1, rotation: 'room' } }), [])).toMatch(/between stamps/);
    expect(validatePlacementRule(rule({ layout: { strategy: 'grid', wallOffsetM: 0, ceilingGridMm: 0, rotation: 'room' } }), [])).toMatch(/ceiling grid/);
  });

  it('By coverage needs a coverage limit', () => {
    expect(validatePlacementRule(rule({ countBy: 'coverage' }), [])).toMatch(/By coverage needs/);
    expect(validatePlacementRule(rule({ countBy: 'coverage', coverage: { maxAreaPerElement: 60 } }), [])).toBeNull();
  });
});

describe('parsePlacementRules', () => {
  it('reads the examples back unchanged', () => {
    expect(parsePlacementRules(JSON.parse(JSON.stringify(PLACEMENT_RULE_EXAMPLES)))).toEqual({ rules: PLACEMENT_RULE_EXAMPLES, oldNumbers: [] });
  });

  it('reads every field of the new shape', () => {
    const r = rule({
      needId: 'light',
      capacityPerElement: 3600,
      luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [{ k: 1, uf: 0.5 }, { k: 2, uf: 0.7 }], suspensionM: 0.3 },
      coverage: { maxSpacing: 20, lengthUnit: 'ft' },
      alsoCoverage: true,
      layout: { strategy: 'grid', wallOffsetM: 0.5, minSpacingM: 1.5, gridStyle: 'staggered', edge: 'wall', ceilingGridMm: 600, rotation: 'room' },
    });
    expect(parsePlacementRules([JSON.parse(JSON.stringify(r))])!.rules).toEqual([r]);
    const perRoom = rule({ countBy: 'perRoom', needId: undefined, perRoomCount: 2, unit: 'kW' });
    expect(parsePlacementRules([JSON.parse(JSON.stringify(perRoom))])!.rules).toEqual([perRoom]);
  });

  it('leaves out invalid entries and repeated ids, and is null for something that is not a list', () => {
    const good = rule();
    expect(parsePlacementRules([good, { ...good, name: 'Again' }, { id: 'x' }, { ...good, id: 'bad', capacityPerElement: -1 }, 'text'])!.rules).toEqual([good]);
    expect(parsePlacementRules({})).toBeNull();
  });

  it('leaves out the default grid edge and an unknown edge', () => {
    const r = rule({ layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' } });
    const [a] = parsePlacementRules([{ ...JSON.parse(JSON.stringify(r)), layout: { ...r.layout, edge: 'halfSpacing' } }])!.rules;
    const [b] = parsePlacementRules([{ ...JSON.parse(JSON.stringify(r)), layout: { ...r.layout, edge: 'side' } }])!.rules;
    expect(a!.layout).toEqual(r.layout);
    expect(b!.layout).toEqual(r.layout);
  });
});

describe('old rules (before room-type-calculations.md §3.5)', () => {
  // A stored entry as the guide wrote it before the needs.
  const old = (patch: Record<string, unknown>) => ({
    id: 'old',
    name: 'Old rule',
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
  const one = (patch: Record<string, unknown>) => {
    const parsed = parsePlacementRules([old(patch)])!;
    expect(parsed.rules).toHaveLength(1);
    return { rule: parsed.rules[0]!, old: parsed.oldNumbers[0] };
  };

  it('knows an old list', () => {
    expect(hasOldPlacementRules([old({})])).toBe(true);
    expect(hasOldPlacementRules(JSON.parse(JSON.stringify(PLACEMENT_RULE_EXAMPLES)))).toBe(false);
    expect(hasOldPlacementRules({})).toBe(false);
  });

  it('By coverage, the old Coverage layout and the old coverage names', () => {
    expect(one({ preset: 'coverage', coverage: { maxRadius: 5.8 } }).rule.countBy).toBe('coverage');
    const { rule: r } = one({ preset: 'fixed', amount: { unit: '' }, coverage: { maxAreaPerElementM2: 60, maxSpacingM: 7.5, maxWallDistanceM: 3.5 }, layout: { strategy: 'coverage', wallOffsetM: 0.5, rotation: 'room' } });
    expect(r.countBy).toBe('coverage');
    expect(r.layout.strategy).toBe('evenSpread');
    expect(r.coverage).toEqual({ maxAreaPerElement: 60, maxSpacing: 7.5, maxWallDistance: 3.5 });
  });

  it('no amount, or a number of stamps per room, becomes the same number in each room', () => {
    expect(one({ amount: { unit: 'dm³/s' }, minCount: 1 }).rule).toMatchObject({ countBy: 'perRoom', perRoomCount: 1, minCount: 1 });
    expect(one({ preset: 'fixed', amount: { fixed: 2, unit: 'stamps' } })).toMatchObject({ rule: { countBy: 'perRoom', perRoomCount: 2 }, old: undefined });
  });

  it('links to one need without own numbers convert without a loss (the socket rule of §2)', () => {
    const { rule: r, old: o } = one({ name: 'Double socket', amount: { unit: 'sockets', from: { perPerson: 'socketsPerPerson', fixed: 'socketsFixed' } }, capacityPerElement: 2 });
    expect(r).toMatchObject({ countBy: 'need', needId: 'sockets', capacityPerElement: 2, writeCapacity: false });
    expect(r.unit).toBeUndefined();
    expect(o).toMatchObject({ demand: null, notes: ['The rule no longer writes a capacity to its stamps: a rule for Sockets does not write one.'] });
    expect(calculateRoomRequirement(r, withDemands(office)).count).toBe(8);
    expect(one({ amount: { unit: 'sockets', from: { perPerson: 'socketsPerPerson' } }, capacityPerElement: 2, writeCapacity: false }).old).toBeUndefined();
  });

  it('the count of a rule without a capacity, and of a rule in stamps, is the same as before or the report says so', () => {
    // Before: no capacity, so 1 stamp in each room. Now one stamp gives 1 socket: 4 × 4 persons = 16 stamps.
    const sockets = one({ amount: { unit: 'sockets', from: { perPerson: 'socketsPerPerson' } }, writeCapacity: false });
    expect(sockets.rule.capacityPerElement).toBeUndefined();
    expect(sockets.old).toMatchObject({ demand: null, notes: [expect.stringMatching(/^The rule had no capacity, so it placed 1 stamp in each room\./)] });
    expect(calculateRoomRequirement(sockets.rule, withDemands(office)).count).toBe(16);
    // Before: the unit stamps gave each stamp 1, so 6.5 × 4 persons = 26 stamps. Now one stamp gives 1 dm³/s: still 26.
    const stamps = one({ amount: { unit: 'stamps', from: { perPerson: 'supplyPerPersonDm3s' } }, writeCapacity: false });
    expect(stamps.rule).toMatchObject({ needId: 'supplyAir', capacityPerElement: 1 });
    expect(stamps.old!.notes).toEqual(['The unit of the rule was stamps, so one stamp now gives 1 dm³/s. The count stays the same.']);
    expect(calculateRoomRequirement(stamps.rule, withDemands(office)).count).toBe(26);
  });

  it('leaves out the numbers that the old validator refused, and a link that does not fit its term', () => {
    expect(parsePlacementRules([old({ amount: { perPerson: -5, unit: 'dm³/s' } })])!.rules).toEqual([]);
    expect(parsePlacementRules([old({ amount: { fixed: 7, minimum: -1, unit: 'dm³/s' } })])!.rules).toEqual([]);
    expect(parsePlacementRules([old({ preset: 'lighting', lighting: { lux: 0, utilisationFactor: 0.6, maintenanceFactor: 0.8 } })])!.rules).toEqual([]);
    // perM2 cannot take the illuminance: the link goes, and the rule has no amount (1 in each room, as before).
    expect(one({ amount: { unit: 'lm', from: { perM2: 'illuminanceLx' } } }).rule).toMatchObject({ countBy: 'perRoom', perRoomCount: 1 });
  });

  it('the old supply air example: own numbers move as a Supply air demand of its room types', () => {
    const { rule: r, old: o } = one({ name: 'Supply air per person + area (example)', roomTypeIds: ['office', 'meeting'], preset: 'perPersonArea', amount: { perPerson: 7, perM2: 0.7, unit: 'dm³/s' }, capacityPerElement: 50 });
    expect(r).toMatchObject({ countBy: 'need', needId: 'supplyAir', unit: 'dm³/s', capacityPerElement: 50, roomTypeIds: ['office', 'meeting'] });
    expect(o).toMatchObject({ need: { id: 'supplyAir' }, roomTypeIds: ['office', 'meeting'], demand: { terms: [{ basis: 'person', value: 7 }, { basis: 'area', value: 0.7 }] } });
    // The same count as before for a room type that gets the numbers: 7 × 4 + 0.7 × 40 = 56, 2 grilles.
    expect(calculateRoomRequirement(r, withDemands({ supplyAir: o!.demand })).count).toBe(2);
  });

  it('the old toilet example: the fallback 7 of the link moves as Return air per room', () => {
    const { rule: r, old: o } = one({ name: 'Toilet exhaust fixed per room (example)', roomTypeIds: ['toilet'], preset: 'fixed', amount: { fixed: 7, unit: 'dm³/s', from: { fixed: 'exhaustFixedDm3s' } }, minCount: 1, maxCount: 1 });
    expect(r).toMatchObject({ countBy: 'need', needId: 'returnAir' });
    expect(o!.demand).toEqual({ terms: [{ basis: 'room', value: 7 }] });
  });

  it('guesses the need from the unit and the name, and converts to the unit of the need', () => {
    const changes = one({ name: 'Technical room 4 air changes per hour', preset: 'airChanges', amount: { perM3: 4, unit: 'm³/h' }, capacityPerElement: 300 });
    expect(changes.rule).toMatchObject({ needId: 'returnAir', unit: 'm³/h', capacityPerElement: 300 });
    expect(changes.old!.demand).toEqual({ terms: [{ basis: 'volume', value: 4 }] });
    expect(changes.old!.notes).toEqual(['MepApp chose Return air, because the rule has only air changes.']);
    expect(calculateRoomRequirement(changes.rule, withDemands({ returnAir: changes.old!.demand })).count).toBe(2);
    expect(one({ name: 'Exhaust kitchen', amount: { fixed: 72, unit: 'm³/h' } }).old!.demand.terms[0]!.value).toBeCloseTo(20);
    const heat = one({ name: 'Radiators', amount: { perM2: 0.04, unit: 'kW' }, capacityPerElement: 1 });
    expect(heat.rule).toMatchObject({ needId: 'heating', unit: 'kW' });
    expect(heat.old!.demand.terms[0]!.value).toBeCloseTo(40);
    expect(one({ name: 'Koeling', amount: { perM2: 70, unit: 'W' } }).rule.needId).toBe('cooling');
    const ft = one({ name: 'Air', amount: { perM2: 0.1, unit: 'cfm', areaUnit: 'ft2' } });
    expect(calculateRoomRequirement(ft.rule, withDemands({ supplyAir: ft.old!.demand })).required).toBeCloseTo((0.1 * 40) / M2_PER_FT2, 6);
  });

  it('a unit that no built-in need has becomes an own need named after the rule', () => {
    const boxes = one({ name: 'Floor boxes (example)', preset: 'perArea', amount: { perM2: 0.2, unit: 'stamps' } });
    expect(boxes.old!.need).toEqual({ id: 'need-from-old', name: 'Floor boxes', kind: 'count', unit: 'stamps', own: true });
    expect(boxes.rule).toMatchObject({ needId: 'need-from-old', writeCapacity: false });
    expect(boxes.old!.notes).toEqual(['The rule no longer writes a capacity to its stamps: a rule for Floor boxes does not write one.']);
    // 0.2 × 35.8 = 7.16, 8 stamps as before.
    expect(calculateRoomRequirement(boxes.rule, withDemands({ 'need-from-old': boxes.old!.demand }, { areaM2: 35.8 }), [...BUILT_IN_NEEDS, boxes.old!.need]).count).toBe(8);
    expect(one({ amount: { perM2: 1, unit: 'kg' } }).old!.need).toMatchObject({ kind: 'amount', unit: 'kg' });
    expect(one({ name: 'Heat', amount: { perM3: 1, perM2: 2, unit: 'W' } }).old!.notes).toContain('The amount per m³ (1) goes: only an air flow has air changes.');
  });

  it('lighting: the luminaire stays with the rule, an own illuminance moves (fc in lx)', () => {
    const fromType = one({ preset: 'lighting', amount: { unit: 'lm' }, lighting: { luxFromRoomType: true, utilisationFactor: 0.6, maintenanceFactor: 0.8, ufTable: [{ k: 1, uf: 0.5 }, { k: 2, uf: 0.7 }], suspensionM: 0.3 }, capacityPerElement: 3600 });
    expect(fromType.rule).toMatchObject({ needId: 'light', capacityPerElement: 3600, luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8, suspensionM: 0.3, ufTable: [{ k: 1, uf: 0.5 }, { k: 2, uf: 0.7 }] } });
    expect(fromType.rule.writeCapacity).toBe(false);
    expect(fromType.old).toMatchObject({ demand: null, notes: ['The rule no longer writes a capacity to its stamps: a rule for Light does not write one.'] });
    expect(one({ preset: 'lighting', amount: { unit: 'lm' }, lighting: { luxFromRoomType: true, utilisationFactor: 0.6, maintenanceFactor: 0.8 }, writeCapacity: false }).old).toBeUndefined();
    const own = one({ preset: 'lighting', amount: { unit: 'lm' }, lighting: { lux: 50, illuminanceUnit: 'fc', workingPlaneHeightM: 0.8, utilisationFactor: 0.6, maintenanceFactor: 0.8 }, capacityPerElement: 3600 });
    expect(own.old!.demand.terms[0]!.value).toBeCloseTo(50 / M2_PER_FT2);
    expect(own.old!.demand.workingPlaneM).toBe(0.8);
  });

  it('moveOldRuleNumbers: to the types without the need, a type with the need keeps its own, a new own need is added', () => {
    const parsed = parsePlacementRules([
      old({ id: 'a', name: 'Supply', roomTypeIds: ['office', 'meeting'], amount: { perPerson: 7, unit: 'dm³/s' } }),
      old({ id: 'b', name: 'Floor boxes', amount: { perM2: 0.2, unit: 'stamps' } }),
    ])!;
    const types = [
      { id: 'office', name: 'Office', demands: { supplyAir: { terms: [{ basis: 'person' as const, value: 6.5 }] } } },
      { id: 'meeting', name: 'Meeting room' },
      { id: 'hall', name: 'Hall' },
    ];
    const moved = moveOldRuleNumbers(types, [], parsed.oldNumbers);
    expect(moved.types.find((t) => t.id === 'office')!.demands!.supplyAir!.terms[0]!.value).toBe(6.5);
    expect(moved.types.find((t) => t.id === 'meeting')!.demands!.supplyAir).toEqual({ terms: [{ basis: 'person', value: 7 }] });
    expect(moved.types.find((t) => t.id === 'hall')!.demands!['need-from-b']).toEqual({ terms: [{ basis: 'area', value: 0.2 }] });
    expect(moved.needs.map((n) => n.id)).toEqual(['need-from-b']);
    expect(moved.report[0]).toBe('Supply: now serves Supply air. Its numbers moved to Meeting room. Office kept its own numbers. MepApp chose the demand type Supply air from the unit dm³/s and the rule name.');
    expect(types[1]).toEqual({ id: 'meeting', name: 'Meeting room' });
  });

  it('moveOldRuleNumbers: a rule without room types that chose rooms by name gives its numbers only to the type that matches the text', () => {
    const parsed = parsePlacementRules([
      old({ id: 'a', name: 'Supply', nameContains: 'Kantoor', amount: { perPerson: 7, unit: 'dm³/s' } }),
      old({ id: 'b', name: 'Supply attic', nameContains: 'Zolder', amount: { perPerson: 7, unit: 'dm³/s' } }),
    ])!;
    const types = [
      { id: 'office', name: 'Office', keywords: ['kantoor'] },
      { id: 'lift', name: 'Lift', keywords: ['lift'] },
    ];
    const moved = moveOldRuleNumbers(types, [], parsed.oldNumbers);
    expect(moved.types.map((t) => [t.id, t.demands?.supplyAir !== undefined])).toEqual([
      ['office', true],
      ['lift', false],
    ]);
    expect(moved.report[0]).toBe(
      'Supply: now serves Supply air. Its numbers moved to Office. The rule chose rooms with "Kantoor" in the name: only Office matches this text. Rooms without a room type no longer get stamps from this rule. MepApp chose the demand type Supply air from the unit dm³/s and the rule name.',
    );
    expect(moved.report[1]).toContain('Its numbers moved to no room type. The rule chose rooms with "Zolder" in the name, and no room type matches this text.');
    expect(parsed.rules[0]!.nameContains).toBe('Kantoor');
  });

  it('moveOldRuleNumbers: a rule without own numbers moves nothing, and its line gives the notes', () => {
    const parsed = parsePlacementRules([old({ name: 'Light', preset: 'lighting', amount: { unit: 'lm' }, lighting: { luxFromRoomType: true, utilisationFactor: 0.6, maintenanceFactor: 0.8 } })])!;
    const types = [{ id: 'office', name: 'Office' }];
    const moved = moveOldRuleNumbers(types, [], parsed.oldNumbers);
    expect(moved.types).toEqual(types);
    expect(moved.report).toEqual(['Light: now serves Light. The rule no longer writes a capacity to its stamps: a rule for Light does not write one.']);
  });
});

describe('the examples', () => {
  it('count with the example room types', () => {
    const supply = PLACEMENT_RULE_EXAMPLES.find((x) => x.id === 'example-supply-air')!;
    // Office: 6.5 × 4 persons = 26 dm³/s, one grille of 50.
    expect(calculateRoomRequirement(supply, withDemands(office)).count).toBe(1);
    const toilet = PLACEMENT_RULE_EXAMPLES.find((x) => x.id === 'example-toilet-exhaust')!;
    expect(calculateRoomRequirement(toilet, withDemands(parseRoomDemands({ exhaustFixedDm3s: 14 })!)).required).toBe(14);
    const smoke = PLACEMENT_RULE_EXAMPLES.find((x) => x.id === 'example-smoke-detector')!;
    expect(smoke.coverage).toEqual({ maxAreaPerElement: 60, maxRadius: 5.8 });
  });

  it('give a routing target to the air rules only (auto-routing.md §4.5)', () => {
    expect(Object.fromEntries(PLACEMENT_RULE_EXAMPLES.map((x) => [x.id, x.routingTarget]))).toEqual({
      'example-supply-air': 'supply-air',
      'example-toilet-exhaust': 'exhaust-air',
      'example-air-changes': 'return-air',
      'example-lighting': undefined,
      'example-smoke-detector': undefined,
    });
    expect(parsePlacementRules(JSON.parse(JSON.stringify(PLACEMENT_RULE_EXAMPLES)))!.rules).toEqual(PLACEMENT_RULE_EXAMPLES);
  });
});

describe('routing targets of a rule (auto-routing.md §4.2)', () => {
  const center = [{ id: '__center__' }];
  const fcu = [{ id: 'cw' }, { id: 'hw' }];
  const copy = { id: 'nt-7f3a2c', name: 'Supply Air 2', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#1565c0', lineWidthPt: 2, linePattern: 'solid' } as const;

  it('ruleRoutingTargets gives each port the rule target, a port entry wins, and null gives none', () => {
    expect(ruleRoutingTargets(rule({ routingTarget: 'supply-air' }), center)).toEqual({ __center__: 'supply-air' });
    expect(ruleRoutingTargets(rule({ routingTarget: 'supply-air' }), fcu)).toEqual({ cw: 'supply-air', hw: 'supply-air' });
    expect(ruleRoutingTargets(rule({ portRoutingTargets: { cw: 'chilled-water', hw: 'heating-water' } }), fcu)).toEqual({ cw: 'chilled-water', hw: 'heating-water' });
    expect(ruleRoutingTargets(rule({ routingTarget: 'chilled-water', portRoutingTargets: { hw: null, other: 'return-air' } }), fcu)).toEqual({ cw: 'chilled-water' });
    expect(ruleRoutingTargets(rule(), fcu)).toBeUndefined();
    expect(ruleRoutingTargets(rule({ portRoutingTargets: { cw: null } }), [{ id: 'cw' }])).toBeUndefined();
  });

  it('the defaults of the built-in demand types', () => {
    expect(BUILT_IN_NEEDS.map((n) => [n.id, routingTargetDefaultOf(n.id) ?? null])).toEqual([
      ['light', null],
      ['supplyAir', 'supply-air'],
      ['returnAir', 'return-air'],
      ['heating', 'heating-water'],
      ['cooling', 'chilled-water'],
      ['sockets', null],
    ]);
    expect(NEED_ROUTING_TARGET_DEFAULTS.supplyAir).toBe('supply-air');
    expect(routingTargetDefaultOf('constructor')).toBeUndefined();
    expect(routingTargetDefaultOf(undefined)).toBeUndefined();
  });

  it('the parse keeps the fields and drops the bad values', () => {
    const stored = JSON.parse(
      JSON.stringify([
        {
          ...rule({ id: 'a', routingTarget: 'supply-air', networkTypeCopies: [copy] }),
          portRoutingTargets: { cw: 'chilled-water', hw: null, bad: 3, empty: '' },
        },
        { ...rule({ id: 'b', name: 'B' }), routingTarget: 7, portRoutingTargets: 'x', networkTypeCopies: [{ ...copy, linePattern: 'wavy' }, { ...copy, id: '' }, copy, copy] },
      ]),
    );
    const [a, b] = parsePlacementRules(stored)!.rules;
    expect(a).toMatchObject({ routingTarget: 'supply-air', portRoutingTargets: { cw: 'chilled-water', hw: null }, networkTypeCopies: [copy] });
    expect(b!.routingTarget).toBeUndefined();
    expect(b!.portRoutingTargets).toBeUndefined();
    expect(b!.networkTypeCopies).toEqual([copy]);
    expect(parsePlacementRules([rule({ id: 'c' })])!.rules[0]).not.toHaveProperty('routingTarget');
  });

  it('validatePlacementRule refuses an empty network type id', () => {
    expect(validatePlacementRule(rule({ routingTarget: 'supply-air', portRoutingTargets: { cw: null } }), [])).toBeNull();
    expect(validatePlacementRule(rule({ routingTarget: '' }), [])).toMatch(/routing target/);
    expect(validatePlacementRule(rule({ portRoutingTargets: { cw: '' } }), [])).toMatch(/routing target/);
  });
});
