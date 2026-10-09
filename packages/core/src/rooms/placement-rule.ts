// Placement rules (room-auto-placement.md §4.4, Phase 3): one form per kind of element that says
// which rooms get it, how much a room needs, what one element gives, and the coverage limits.
// MepApp holds no national rules: the user enters the numbers. Pure functions, no I/O.

import type { Discipline } from '../network.js';
import type { Room } from './room.js';
import type { RoomValues } from './room-values.js';

/** A preset fills and shows the amount fields of one common calculation. 'custom' shows every field. */
export type PlacementPreset = 'perArea' | 'perPersonArea' | 'airChanges' | 'fixed' | 'lighting' | 'custom';

export type LayoutStrategy = 'center' | 'grid' | 'evenSpread' | 'coverage' | 'perimeter';

export interface PlacementAmount {
  /** Amount per room. */
  fixed?: number;
  /** Amount per m² floor area. */
  perM2?: number;
  /** Amount per person. */
  perPerson?: number;
  /** Amount per m³ room volume (air changes per hour with the unit m³/h). */
  perM3?: number;
  /** The lowest amount a room gets. */
  minimum?: number;
  /** Free text, for example "dm³/s", "m³/h", "W" or "lm". MepApp does not convert units. */
  unit: string;
}

export interface LightingInputs {
  /** Design illuminance E, lux. */
  lux: number;
  /** Utilisation factor UF, above 0 and at most 1. */
  utilisationFactor: number;
  /** Maintenance factor MF, above 0 and at most 1. */
  maintenanceFactor: number;
}

export interface CoverageLimits {
  /** Largest distance between two elements, m. */
  maxSpacingM?: number;
  /** Largest floor area one element serves, m². */
  maxAreaPerElementM2?: number;
  /** Largest distance from an element to a wall, m. Absent = half the spacing. */
  maxWallDistanceM?: number;
}

export interface PlacementLayout {
  /** How the stamps are spread over the room (placement-layout.ts). */
  strategy: LayoutStrategy;
  /** Distance from the walls to the stamps, m. */
  wallOffsetM: number;
  /** 'room' = turn the stamps to the main axis of the room; 'fixed' = use fixedAngleDeg. */
  rotation: 'room' | 'fixed';
  fixedAngleDeg?: number;
}

export interface PlacementRule {
  id: string;
  name: string;
  discipline: Discipline;
  /** RoomType ids the rule applies to. Empty = every room. */
  roomTypeIds: string[];
  /** Also only rooms whose name contains this text (case-insensitive). Absent = no name filter. */
  nameContains?: string;
  /** The stamp to place. Null = not chosen yet (the dry run works without one). */
  stampDefinitionId: string | null;
  preset: PlacementPreset;
  amount: PlacementAmount;
  /** Lighting (lumen method): adds E × area ÷ (UF × MF) to the amount, in lm. */
  lighting?: LightingInputs;
  /** What one element gives, in the unit of the amount. Absent = no count from the amount. */
  capacityPerElement?: number;
  coverage: CoverageLimits;
  minCount?: number;
  maxCount?: number;
  layout: PlacementLayout;
  /** Each placed stamp gets required ÷ count as its capacity (ProjectDocument.terminalCapacities). */
  writeCapacity: boolean;
}

export const PLACEMENT_PRESET_LABELS: Record<PlacementPreset, string> = {
  perArea: 'Per area',
  perPersonArea: 'Per person + per area',
  airChanges: 'Air changes per hour',
  fixed: 'Fixed per room',
  lighting: 'Lighting (lumen method)',
  custom: 'Custom',
};

/** The amount fields each preset shows. */
export const PRESET_AMOUNT_FIELDS: Record<PlacementPreset, (keyof Omit<PlacementAmount, 'unit'>)[]> = {
  perArea: ['perM2', 'minimum'],
  perPersonArea: ['perPerson', 'perM2', 'minimum'],
  airChanges: ['perM3', 'minimum'],
  fixed: ['fixed'],
  lighting: [],
  custom: ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum'],
};

export const LAYOUT_STRATEGY_LABELS: Record<LayoutStrategy, string> = {
  center: 'Center',
  grid: 'Grid',
  evenSpread: 'Even spread',
  coverage: 'Coverage',
  perimeter: 'Along the walls',
};

/** True when the rule applies to the room: its type is in the list (or the list is empty), and its name contains the text (when set). */
export function ruleAppliesToRoom(rule: Pick<PlacementRule, 'roomTypeIds' | 'nameContains'>, room: Pick<Room, 'roomTypeId' | 'name'>): boolean {
  if (rule.roomTypeIds.length > 0 && (room.roomTypeId === undefined || !rule.roomTypeIds.includes(room.roomTypeId))) return false;
  const text = rule.nameContains?.trim().toLowerCase();
  if (text && !(room.name ?? '').toLowerCase().includes(text)) return false;
  return true;
}

// A count is a whole number: 2.0000000001 elements must not become 3.
const ceilCount = (x: number): number => Math.max(0, Math.ceil(x - 1e-9));

/** Elements along one side of length `lengthM`, so that two elements are at most `spacingM` apart and the outer ones at most `wallM` from a wall. */
function countAlong(lengthM: number, spacingM: number | undefined, wallM: number): number {
  if (lengthM <= 2 * wallM + 1e-9) return 1;
  if (spacingM === undefined) return 2;
  return ceilCount((lengthM - 2 * wallM) / spacingM) + 1;
}

/** True when the rule has a coverage limit. */
export const hasCoverageLimit = (coverage: CoverageLimits): boolean =>
  coverage.maxSpacingM !== undefined || coverage.maxAreaPerElementM2 !== undefined || coverage.maxWallDistanceM !== undefined;

/**
 * The smallest count that meets the coverage limits: area ÷ max area per element, and a grid over
 * the room's bounding rectangle (length × width) with the max spacing and wall distance. The larger
 * one wins. Null when the room values that a limit needs are not known (no calibration).
 */
export function coverageCount(values: Pick<RoomValues, 'areaM2' | 'lengthM' | 'widthM'>, coverage: CoverageLimits): number | null {
  if (!hasCoverageLimit(coverage)) return null;
  let count = 1;
  if (coverage.maxAreaPerElementM2 !== undefined) {
    if (values.areaM2 === null) return null;
    count = Math.max(count, ceilCount(values.areaM2 / coverage.maxAreaPerElementM2));
  }
  if (coverage.maxSpacingM !== undefined || coverage.maxWallDistanceM !== undefined) {
    const grid = coverageGridShape(values, coverage);
    if (!grid) return null;
    count = Math.max(count, grid.along * grid.across);
  }
  return count;
}

/** The grid that the spacing and wall-distance limits need: elements along the length and across the width. Null without those limits or without length and width. */
export function coverageGridShape(values: Pick<RoomValues, 'lengthM' | 'widthM'>, coverage: CoverageLimits): { along: number; across: number } | null {
  if (coverage.maxSpacingM === undefined && coverage.maxWallDistanceM === undefined) return null;
  if (values.lengthM === null || values.widthM === null) return null;
  const wall = coverage.maxWallDistanceM ?? coverage.maxSpacingM! / 2;
  return { along: countAlong(values.lengthM, coverage.maxSpacingM, wall), across: countAlong(values.widthM, coverage.maxSpacingM, wall) };
}

export type RequirementWarning =
  /** The room's page has no scale, and the rule needs area, volume, length or width. */
  | 'noCalibration'
  /** The rule needs a number of people, and the room has none (no type with an area per person, no value of its own). */
  | 'noPeople'
  /** The max count limited the count. */
  | 'maxCountReached'
  /** The coverage limits give more elements than the amount needs. */
  | 'countByCoverage';

export const REQUIREMENT_WARNING_TEXT: Record<RequirementWarning, string> = {
  noCalibration: 'no calibration',
  noPeople: 'no number of people',
  maxCountReached: 'max count reached',
  countByCoverage: 'count set by coverage',
};

export interface RoomRequirement {
  /** Required amount in the rule's unit. Null when the rule has no amount, or an input is missing. */
  required: number | null;
  /** ceil(required ÷ capacity). Null without a capacity or a required amount. */
  quantityCount: number | null;
  /** The count that the coverage limits need. Null without limits or without the room values. */
  coverageCount: number | null;
  /** The number of elements to place. Null when it cannot be calculated. */
  count: number | null;
  /** required ÷ count: the capacity each placed element gets. */
  perElement: number | null;
  warnings: RequirementWarning[];
}

/** True when the rule has an amount: an amount field or lighting inputs. */
export function hasAmount(rule: Pick<PlacementRule, 'amount' | 'lighting'>): boolean {
  const a = rule.amount;
  return a.fixed !== undefined || a.perM2 !== undefined || a.perPerson !== undefined || a.perM3 !== undefined || a.minimum !== undefined || rule.lighting !== undefined;
}

/**
 * The required amount and the count of elements for one room (§4.4):
 * required = fixed + perM2 × area + perPerson × people + perM3 × volume + lighting, at least the minimum;
 * count = max(ceil(required ÷ capacity), coverage count, min count), at most the max count.
 * A rule without a capacity and without coverage limits places one element per room (or min count).
 */
export function calculateRoomRequirement(rule: PlacementRule, values: RoomValues): RoomRequirement {
  const warnings: RequirementWarning[] = [];
  const a = rule.amount;
  let required: number | null = null;
  if (hasAmount(rule)) {
    const needsArea = a.perM2 !== undefined || rule.lighting !== undefined;
    let missing = false;
    if ((needsArea && values.areaM2 === null) || (a.perM3 !== undefined && values.volumeM3 === null)) {
      warnings.push('noCalibration');
      missing = true;
    }
    if (a.perPerson !== undefined && values.people === null) {
      warnings.push('noPeople');
      missing = true;
    }
    if (!missing) {
      const area = values.areaM2 ?? 0;
      let sum = (a.fixed ?? 0) + (a.perM2 ?? 0) * area + (a.perPerson ?? 0) * (values.people?.count ?? 0) + (a.perM3 ?? 0) * (values.volumeM3 ?? 0);
      if (rule.lighting) sum += (rule.lighting.lux * area) / (rule.lighting.utilisationFactor * rule.lighting.maintenanceFactor);
      required = Math.max(sum, a.minimum ?? 0);
    }
  }
  const quantityCount = required !== null && rule.capacityPerElement !== undefined && rule.capacityPerElement > 0 ? ceilCount(required / rule.capacityPerElement) : null;
  const limited = hasCoverageLimit(rule.coverage);
  const coverage = limited ? coverageCount(values, rule.coverage) : null;
  if (limited && coverage === null && !warnings.includes('noCalibration')) warnings.push('noCalibration');

  let count: number | null = null;
  const blocked = (hasAmount(rule) && rule.capacityPerElement !== undefined && required === null) || (limited && coverage === null);
  if (!blocked) {
    count = Math.max(quantityCount ?? 0, coverage ?? 0, rule.minCount ?? 0);
    if (quantityCount === null && !limited) count = Math.max(count, 1);
    if (coverage !== null && quantityCount !== null && coverage > quantityCount && count === coverage) warnings.push('countByCoverage');
    if (rule.maxCount !== undefined && count > rule.maxCount) {
      count = rule.maxCount;
      warnings.push('maxCountReached');
    }
  }
  const perElement = required !== null && count !== null && count > 0 ? required / count : null;
  return { required, quantityCount, coverageCount: coverage, count, perElement, warnings };
}

export interface RoomCalculationRow {
  room: Room;
  rule: PlacementRule;
  values: RoomValues;
  requirement: RoomRequirement;
}

export interface RoomCalculation {
  /** One row per room and rule that applies to it, in the order of `rooms`, then of `rules`. */
  rows: RoomCalculationRow[];
  /** Rooms that no rule applies to. */
  unmatched: Room[];
}

/** The dry run (Phase 3): the requirement of each rule in each room it applies to. No geometry yet. */
export function calculateRooms(rules: readonly PlacementRule[], rooms: readonly Room[], valuesOf: (room: Room) => RoomValues): RoomCalculation {
  const rows: RoomCalculationRow[] = [];
  const unmatched: Room[] = [];
  for (const room of rooms) {
    const applying = rules.filter((rule) => ruleAppliesToRoom(rule, room));
    if (applying.length === 0) {
      unmatched.push(room);
      continue;
    }
    const values = valuesOf(room);
    for (const rule of applying) rows.push({ room, rule, values, requirement: calculateRoomRequirement(rule, values) });
  }
  return { rows, unmatched };
}

const isNonNegative = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0);
const isPositive = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n > 0);
const isCount = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);
const isFactor = (n: number) => Number.isFinite(n) && n > 0 && n <= 1;

/** Why the rule cannot be saved, or null when it can. `others` are the other rules of the list. */
export function validatePlacementRule(rule: PlacementRule, others: readonly PlacementRule[]): string | null {
  const name = rule.name.trim();
  if (!name) return 'Enter a name.';
  if (others.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) return `Another rule is already called "${name}".`;
  const a = rule.amount;
  if (![a.fixed, a.perM2, a.perPerson, a.perM3, a.minimum].every(isNonNegative)) return 'An amount must be a number of 0 or more.';
  if (rule.lighting) {
    if (!(Number.isFinite(rule.lighting.lux) && rule.lighting.lux > 0)) return 'The illuminance must be a number above 0.';
    if (!isFactor(rule.lighting.utilisationFactor) || !isFactor(rule.lighting.maintenanceFactor)) return 'The utilisation and maintenance factors must be above 0 and at most 1.';
  }
  if (!isPositive(rule.capacityPerElement)) return 'The capacity per element must be a number above 0.';
  if (!isPositive(rule.coverage.maxSpacingM) || !isPositive(rule.coverage.maxAreaPerElementM2) || !isPositive(rule.coverage.maxWallDistanceM)) return 'A coverage limit must be a number above 0.';
  if (!isCount(rule.minCount) || !isCount(rule.maxCount)) return 'A count must be a whole number of 0 or more.';
  if (rule.minCount !== undefined && rule.maxCount !== undefined && rule.minCount > rule.maxCount) return 'The min count is larger than the max count.';
  if (!(Number.isFinite(rule.layout.wallOffsetM) && rule.layout.wallOffsetM >= 0)) return 'The offset from walls must be a number of 0 or more.';
  if (rule.layout.rotation === 'fixed' && !Number.isFinite(rule.layout.fixedAngleDeg ?? Number.NaN)) return 'Enter the fixed angle.';
  return null;
}

const DISCIPLINES: readonly Discipline[] = ['heatingAndCooling', 'ventilation', 'plumbing', 'fireProtection', 'electrical', 'other'];
const PRESETS = Object.keys(PLACEMENT_PRESET_LABELS) as PlacementPreset[];
const STRATEGIES = Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[];

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function withNumbers<T extends object>(target: T, source: Record<string, unknown>, keys: readonly (keyof T & string)[]): T {
  for (const key of keys) {
    const value = num(source[key]);
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

function toPlacementRule(value: unknown): PlacementRule | null {
  const v = rec(value);
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null;
  const amount = rec(v.amount);
  const layout = rec(v.layout);
  const lighting = rec(v.lighting);
  const rule: PlacementRule = {
    id: v.id,
    name: v.name,
    discipline: DISCIPLINES.includes(v.discipline as Discipline) ? (v.discipline as Discipline) : 'other',
    roomTypeIds: Array.isArray(v.roomTypeIds) ? v.roomTypeIds.filter((id): id is string => typeof id === 'string') : [],
    stampDefinitionId: typeof v.stampDefinitionId === 'string' && v.stampDefinitionId ? v.stampDefinitionId : null,
    preset: PRESETS.includes(v.preset as PlacementPreset) ? (v.preset as PlacementPreset) : 'custom',
    amount: withNumbers<PlacementAmount>({ unit: typeof amount.unit === 'string' ? amount.unit : '' }, amount, ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum']),
    coverage: withNumbers<CoverageLimits>({}, rec(v.coverage), ['maxSpacingM', 'maxAreaPerElementM2', 'maxWallDistanceM']),
    layout: {
      strategy: STRATEGIES.includes(layout.strategy as LayoutStrategy) ? (layout.strategy as LayoutStrategy) : 'center',
      wallOffsetM: num(layout.wallOffsetM) ?? 0,
      rotation: layout.rotation === 'fixed' ? 'fixed' : 'room',
    },
    writeCapacity: v.writeCapacity === true,
  };
  if (typeof v.nameContains === 'string' && v.nameContains.trim()) rule.nameContains = v.nameContains;
  const angle = num(layout.fixedAngleDeg);
  if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  const lux = num(lighting.lux);
  const uf = num(lighting.utilisationFactor);
  const mf = num(lighting.maintenanceFactor);
  if (lux !== undefined && uf !== undefined && mf !== undefined) rule.lighting = { lux, utilisationFactor: uf, maintenanceFactor: mf };
  withNumbers(rule, v, ['capacityPerElement', 'minCount', 'maxCount']);
  return validatePlacementRule(rule, []) === null ? rule : null;
}

/** Reads a stored or imported list of rules. Unreadable or invalid entries and repeated ids are left out. Null when `raw` is not a list. */
export function parsePlacementRules(raw: unknown): PlacementRule[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const rules: PlacementRule[] = [];
  for (const entry of raw) {
    const rule = toPlacementRule(entry);
    if (!rule || ids.has(rule.id)) continue;
    ids.add(rule.id);
    rules.push(rule);
  }
  return rules;
}

const layout = (strategy: LayoutStrategy, wallOffsetM = 0.5): PlacementLayout => ({ strategy, wallOffsetM, rotation: 'room' });

/**
 * Example rules that MepApp ships. They show the shape of each preset. Their numbers are
 * examples, not a standard: the user must check them against the rules of the country.
 */
export const PLACEMENT_RULE_EXAMPLES: readonly PlacementRule[] = [
  {
    id: 'example-supply-air',
    name: 'Supply air per person + area (example)',
    discipline: 'ventilation',
    roomTypeIds: ['office', 'meeting', 'classroom'],
    stampDefinitionId: null,
    preset: 'perPersonArea',
    amount: { perPerson: 7, perM2: 0.7, unit: 'dm³/s' },
    capacityPerElement: 50,
    coverage: { maxSpacingM: 4 },
    layout: layout('grid'),
    writeCapacity: true,
  },
  {
    id: 'example-toilet-exhaust',
    name: 'Toilet exhaust fixed per room (example)',
    discipline: 'ventilation',
    roomTypeIds: ['toilet', 'bathroom'],
    stampDefinitionId: null,
    preset: 'fixed',
    amount: { fixed: 25, unit: 'dm³/s' },
    coverage: {},
    minCount: 1,
    maxCount: 1,
    layout: layout('center', 0),
    writeCapacity: true,
  },
  {
    id: 'example-air-changes',
    name: 'Technical room 4 air changes per hour (example)',
    discipline: 'ventilation',
    roomTypeIds: ['technical'],
    stampDefinitionId: null,
    preset: 'airChanges',
    amount: { perM3: 4, unit: 'm³/h' },
    capacityPerElement: 300,
    coverage: {},
    layout: layout('grid'),
    writeCapacity: true,
  },
  {
    id: 'example-lighting',
    name: 'Lighting 500 lx (example)',
    discipline: 'electrical',
    roomTypeIds: ['office', 'meeting', 'classroom'],
    stampDefinitionId: null,
    preset: 'lighting',
    amount: { unit: 'lm' },
    lighting: { lux: 500, utilisationFactor: 0.6, maintenanceFactor: 0.8 },
    capacityPerElement: 3600,
    coverage: { maxSpacingM: 3.6 },
    layout: layout('grid', 0.6),
    writeCapacity: false,
  },
  {
    id: 'example-smoke-detector',
    name: 'Smoke detector coverage (example)',
    discipline: 'fireProtection',
    roomTypeIds: [],
    stampDefinitionId: null,
    preset: 'fixed',
    amount: { unit: '' },
    coverage: { maxAreaPerElementM2: 60, maxSpacingM: 7.5, maxWallDistanceM: 3.5 },
    layout: layout('coverage'),
    writeCapacity: false,
  },
];
