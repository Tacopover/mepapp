// Placement rules (room-auto-placement.md §4.4, Phase 3; room-placement-guide.md Phase A): one form
// per kind of element that says which rooms get it and how the count is calculated: from an amount
// and the capacity of one element, or by coverage. MepApp holds no national rules: the user enters
// the numbers. Pure functions, no I/O.

import type { Discipline } from '../network.js';
import type { Room } from './room.js';
import type { RoomValues } from './room-values.js';
import { areaInUnit, flowInUnit, isAirChangeUnit, type AreaUnit, type IlluminanceUnit, type LengthUnit } from './placement-units.js';

/** A preset fills and shows the amount fields of one common calculation. 'custom' shows every field. 'coverage' has no amount: the count comes from the coverage limits. */
export type PlacementPreset = 'perArea' | 'perPerson' | 'perPersonArea' | 'airChanges' | 'fixed' | 'lighting' | 'coverage' | 'custom';

export type LayoutStrategy = 'center' | 'grid' | 'evenSpread' | 'perimeter';

/** How the Grid layout fills a short row: spread over the full length, keep the columns, or keep the columns and move each second row half a cell. */
export type GridStyle = 'spread' | 'aligned' | 'staggered';

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
  /** For example "dm³/s", "m³/h", "W" (AMOUNT_UNITS) or free text. The capacity uses the same unit. perM3 gives m³/h, converted to a flow unit (AIR_CHANGE_UNITS). */
  unit: string;
  /** The area that perM2 uses. Absent = 'm2'. */
  areaUnit?: AreaUnit;
}

export interface LightingInputs {
  /** Design illuminance E, lux. */
  lux: number;
  /** Utilisation factor UF, above 0 and at most 1. */
  utilisationFactor: number;
  /** Maintenance factor MF, above 0 and at most 1. */
  maintenanceFactor: number;
  /** The unit of `lux`: lx (with the area in m²) or fc (with the area in ft²). Absent = 'lx'. */
  illuminanceUnit?: IlluminanceUnit;
}

/** The limits of the By coverage calculation. Only a rule with the preset 'coverage' uses them. */
export interface CoverageLimits {
  /** Largest distance between two elements, in the length unit. */
  maxSpacing?: number;
  /** Largest floor area one element serves, in m² or ft² (the length unit squared). */
  maxAreaPerElement?: number;
  /** Largest distance from an element to a wall, in the length unit. */
  maxWallDistance?: number;
  /** Absent = 'm'. */
  lengthUnit?: LengthUnit;
}

export interface PlacementLayout {
  /** How the stamps are spread over the room (placement-layout.ts). */
  strategy: LayoutStrategy;
  /** Min distance from the walls to the stamps, m. */
  wallOffsetM: number;
  /** Min distance between two stamp centers, m. A check only: it never changes the count or the positions. */
  minSpacingM?: number;
  /** Grid only. Absent = 'spread'. */
  gridStyle?: GridStyle;
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
  /** What one element gives, in the unit of the amount. Absent = one element per room. */
  capacityPerElement?: number;
  /** Used by the preset 'coverage' only. A rule of another preset keeps old limits here, and they change nothing. */
  coverage: CoverageLimits;
  minCount?: number;
  maxCount?: number;
  layout: PlacementLayout;
  /** Each placed stamp gets required ÷ count as its capacity (ProjectDocument.terminalCapacities). */
  writeCapacity: boolean;
}

export const PLACEMENT_PRESET_LABELS: Record<PlacementPreset, string> = {
  perArea: 'Per area',
  perPerson: 'Per person',
  perPersonArea: 'Per person + per area',
  airChanges: 'Air changes per hour',
  fixed: 'Fixed per room',
  lighting: 'Lighting (lumen method)',
  coverage: 'By coverage',
  custom: 'Custom',
};

/** The amount fields each preset shows. */
export const PRESET_AMOUNT_FIELDS: Record<PlacementPreset, (keyof Omit<PlacementAmount, 'unit' | 'areaUnit'>)[]> = {
  perArea: ['perM2', 'minimum'],
  perPerson: ['perPerson', 'minimum'],
  perPersonArea: ['perPerson', 'perM2', 'minimum'],
  airChanges: ['perM3', 'minimum'],
  fixed: ['fixed'],
  lighting: [],
  coverage: [],
  custom: ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum'],
};

/** The explanation of one preset: the formula, and one line per symbol of the formula. */
export interface PresetHelp {
  formula: string;
  symbols: { symbol: string; text: string }[];
  note?: string;
}

export const PLACEMENT_PRESET_HELP: Record<PlacementPreset, PresetHelp> = {
  perArea: {
    formula: 'Amount = a × floor area',
    symbols: [
      { symbol: 'a', text: 'The amount for each m² (or ft²) of floor area, for example 1.2 dm³/s per m².' },
      { symbol: 'area', text: 'MepApp measures it from the room outline and the scale of the page.' },
    ],
  },
  perPerson: {
    formula: 'Amount = a × persons',
    symbols: [
      { symbol: 'a', text: 'The amount for each person, for example 7 dm³/s per person.' },
      { symbol: 'persons', text: 'The number of the room, or floor area ÷ area per person of the room type, rounded down.' },
    ],
  },
  perPersonArea: {
    formula: 'Amount = a × persons + b × floor area',
    symbols: [
      { symbol: 'a', text: 'The amount for each person, for example 7 dm³/s per person.' },
      { symbol: 'b', text: 'The amount for each m² (or ft²) of floor area, for example 0.7 dm³/s per m². It removes the pollution from the building itself.' },
      { symbol: 'persons', text: 'The number of the room, or floor area ÷ area per person of the room type, rounded down.' },
    ],
  },
  airChanges: {
    formula: 'Amount = n × room volume',
    symbols: [
      { symbol: 'n', text: 'The air changes per hour: how many times in one hour the full air volume of the room is replaced.' },
      { symbol: 'volume', text: 'Floor area × ceiling height.' },
    ],
  },
  fixed: {
    formula: 'Amount = a',
    symbols: [{ symbol: 'a', text: 'The same amount for each room, for example 25 dm³/s for each toilet. Without a capacity per stamp, each room gets one stamp.' }],
  },
  lighting: {
    formula: 'Light = E × floor area ÷ (UF × MF), in lumen (lm)',
    symbols: [
      { symbol: 'E', text: 'The illuminance on the work plane, in lux (lx) or foot-candle (fc). With fc, MepApp uses the floor area in ft².' },
      { symbol: 'UF', text: 'Utilisation factor: the part of the lamp light that reaches the work plane, from 0 to 1.' },
      { symbol: 'MF', text: 'Maintenance factor: the part of the light that stays after dirt and lamp ageing, from 0 to 1.' },
    ],
  },
  coverage: {
    formula: 'Count = the stamps that cover each point of the room',
    symbols: [{ symbol: 'r', text: 'Each stamp covers a circle with radius r. The smallest of these sets r: max spacing ÷ √2, max distance to a wall × √2, √(max area per stamp ÷ 2).' }],
    note: 'Use it for smoke detectors, sprinklers and loudspeakers.',
  },
  custom: {
    formula: 'Amount = fixed + a × floor area + b × persons + n × volume',
    symbols: [
      { symbol: 'fixed', text: 'The same amount for each room.' },
      { symbol: 'a', text: 'The amount for each m² (or ft²) of floor area.' },
      { symbol: 'b', text: 'The amount for each person.' },
      { symbol: 'n', text: 'The air changes per hour. MepApp converts n × volume (m³/h) to the amount unit when it is a flow unit.' },
    ],
    note: 'The room gets at least the minimum amount.',
  },
};

export const LAYOUT_STRATEGY_LABELS: Record<LayoutStrategy, string> = {
  center: 'Center',
  grid: 'Grid',
  evenSpread: 'Even spread',
  perimeter: 'Along the walls',
};

export const GRID_STYLE_LABELS: Record<GridStyle, string> = {
  spread: 'Spread last row',
  aligned: 'Aligned columns',
  staggered: 'Staggered',
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

/** True when the rule has a coverage limit. */
export const hasCoverageLimit = (coverage: CoverageLimits): boolean =>
  coverage.maxSpacing !== undefined || coverage.maxAreaPerElement !== undefined || coverage.maxWallDistance !== undefined;

export type RequirementWarning =
  /** The room's page has no scale, and the rule needs area, volume, length or width. */
  | 'noCalibration'
  /** The rule needs a number of people, and the room has none (no type with an area per person, no value of its own). */
  | 'noPeople'
  /** The max count limited the count. */
  | 'maxCountReached';

export const REQUIREMENT_WARNING_TEXT: Record<RequirementWarning, string> = {
  noCalibration: 'no calibration',
  noPeople: 'no number of people',
  maxCountReached: 'max count reached',
};

/** Which calculation gave the count: the amount ÷ capacity, the coverage layout, or one element per room (no capacity). */
export type CountSource = 'amount' | 'coverage' | 'onePerRoom';

export interface RoomRequirement {
  /** Required amount in the rule's unit. Null when the rule has no amount, or an input is missing. */
  required: number | null;
  /** ceil(required ÷ capacity). Null without a capacity or a required amount. */
  quantityCount: number | null;
  /** The number of elements to place. Null when it cannot be calculated. By coverage: null here; the layout gives it (planAutoPlacement). */
  count: number | null;
  countSource: CountSource;
  /** required ÷ count: the capacity each placed element gets. */
  perElement: number | null;
  warnings: RequirementWarning[];
}

/** True when the rule has an amount: an amount field or lighting inputs. A By coverage rule has no amount. */
export function hasAmount(rule: Pick<PlacementRule, 'amount' | 'lighting'> & Partial<Pick<PlacementRule, 'preset'>>): boolean {
  if (rule.preset === 'coverage') return false;
  const a = rule.amount;
  return a.fixed !== undefined || a.perM2 !== undefined || a.perPerson !== undefined || a.perM3 !== undefined || a.minimum !== undefined || rule.lighting !== undefined;
}

/**
 * The required amount and the count of elements for one room:
 * required = fixed + perM2 × area + perPerson × people + perM3 × volume + lighting, at least the minimum;
 * count = ceil(required ÷ capacity), or 1 without a capacity; then at least the min count and at most the max count.
 * The area is in the rule's area unit, perM3 × volume (m³/h) is converted to the amount unit, and
 * lighting in fc uses ft². By coverage: the count needs the room geometry, so it is null here.
 */
export function calculateRoomRequirement(rule: PlacementRule, values: RoomValues): RoomRequirement {
  const warnings: RequirementWarning[] = [];
  if (rule.preset === 'coverage') {
    if (values.areaM2 === null) warnings.push('noCalibration');
    return { required: null, quantityCount: null, count: null, countSource: 'coverage', perElement: null, warnings };
  }
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
      let sum = (a.fixed ?? 0) + (a.perM2 ?? 0) * areaInUnit(area, a.areaUnit) + (a.perPerson ?? 0) * (values.people?.count ?? 0) + flowInUnit((a.perM3 ?? 0) * (values.volumeM3 ?? 0), a.unit);
      if (rule.lighting) {
        const lightingArea = areaInUnit(area, rule.lighting.illuminanceUnit === 'fc' ? 'ft2' : 'm2');
        sum += (rule.lighting.lux * lightingArea) / (rule.lighting.utilisationFactor * rule.lighting.maintenanceFactor);
      }
      required = Math.max(sum, a.minimum ?? 0);
    }
  }
  const hasCapacity = rule.capacityPerElement !== undefined && rule.capacityPerElement > 0;
  const quantityCount = required !== null && hasCapacity ? ceilCount(required / rule.capacityPerElement!) : null;

  let count: number | null = null;
  const blocked = hasAmount(rule) && hasCapacity && required === null;
  if (!blocked) {
    count = Math.max(quantityCount ?? 1, rule.minCount ?? 0);
    if (rule.maxCount !== undefined && count > rule.maxCount) {
      count = rule.maxCount;
      warnings.push('maxCountReached');
    }
  }
  const perElement = required !== null && count !== null && count > 0 ? required / count : null;
  return { required, quantityCount, count, countSource: quantityCount !== null || blocked ? 'amount' : 'onePerRoom', perElement, warnings };
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
  if (!isPositive(rule.coverage.maxSpacing) || !isPositive(rule.coverage.maxAreaPerElement) || !isPositive(rule.coverage.maxWallDistance)) return 'A coverage limit must be a number above 0.';
  if (rule.preset === 'coverage' && !hasCoverageLimit(rule.coverage)) return 'By coverage needs a max spacing, a max area per element or a max distance to a wall.';
  if (rule.preset === 'airChanges' && !isAirChangeUnit(rule.amount.unit)) return 'Air changes need a flow unit: m³/h, dm³/s, l/s, m³/s or cfm.';
  if (!isCount(rule.minCount) || !isCount(rule.maxCount)) return 'A count must be a whole number of 0 or more.';
  if (rule.minCount !== undefined && rule.maxCount !== undefined && rule.minCount > rule.maxCount) return 'The min count is larger than the max count.';
  if (!(Number.isFinite(rule.layout.wallOffsetM) && rule.layout.wallOffsetM >= 0)) return 'The min distance to the walls must be a number of 0 or more.';
  if (!isNonNegative(rule.layout.minSpacingM)) return 'The min distance between stamps must be a number of 0 or more.';
  if (rule.layout.rotation === 'fixed' && !Number.isFinite(rule.layout.fixedAngleDeg ?? Number.NaN)) return 'Enter the fixed angle.';
  return null;
}

const DISCIPLINES: readonly Discipline[] = ['heatingAndCooling', 'ventilation', 'plumbing', 'fireProtection', 'electrical', 'other'];
const PRESETS = Object.keys(PLACEMENT_PRESET_LABELS) as PlacementPreset[];
const STRATEGIES = Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[];
const GRID_STYLES = Object.keys(GRID_STYLE_LABELS) as GridStyle[];

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function withNumbers<T extends object>(target: T, source: Record<string, unknown>, keys: readonly (keyof T & string)[]): T {
  for (const key of keys) {
    const value = num(source[key]);
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

/** The coverage limits of a stored rule. Rules before room-placement-guide.md Phase A use the names maxSpacingM, maxAreaPerElementM2 and maxWallDistanceM. */
function toCoverageLimits(value: unknown): CoverageLimits {
  const c = rec(value);
  const coverage: CoverageLimits = {};
  const maxSpacing = num(c.maxSpacing) ?? num(c.maxSpacingM);
  const maxAreaPerElement = num(c.maxAreaPerElement) ?? num(c.maxAreaPerElementM2);
  const maxWallDistance = num(c.maxWallDistance) ?? num(c.maxWallDistanceM);
  if (maxSpacing !== undefined) coverage.maxSpacing = maxSpacing;
  if (maxAreaPerElement !== undefined) coverage.maxAreaPerElement = maxAreaPerElement;
  if (maxWallDistance !== undefined) coverage.maxWallDistance = maxWallDistance;
  if (c.lengthUnit === 'ft') coverage.lengthUnit = 'ft';
  return coverage;
}

function toPlacementRule(value: unknown): PlacementRule | null {
  const v = rec(value);
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null;
  const amount = rec(v.amount);
  const layout = rec(v.layout);
  const lighting = rec(v.lighting);
  // The Coverage layout of Phase 6 is now the By coverage calculation with the Even spread layout.
  const oldCoverageLayout = layout.strategy === 'coverage';
  const rule: PlacementRule = {
    id: v.id,
    name: v.name,
    discipline: DISCIPLINES.includes(v.discipline as Discipline) ? (v.discipline as Discipline) : 'other',
    roomTypeIds: Array.isArray(v.roomTypeIds) ? v.roomTypeIds.filter((id): id is string => typeof id === 'string') : [],
    stampDefinitionId: typeof v.stampDefinitionId === 'string' && v.stampDefinitionId ? v.stampDefinitionId : null,
    preset: PRESETS.includes(v.preset as PlacementPreset) ? (v.preset as PlacementPreset) : 'custom',
    amount: withNumbers<PlacementAmount>({ unit: typeof amount.unit === 'string' ? amount.unit : '' }, amount, ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum']),
    coverage: toCoverageLimits(v.coverage),
    layout: {
      strategy: oldCoverageLayout ? 'evenSpread' : STRATEGIES.includes(layout.strategy as LayoutStrategy) ? (layout.strategy as LayoutStrategy) : 'center',
      wallOffsetM: num(layout.wallOffsetM) ?? 0,
      rotation: layout.rotation === 'fixed' ? 'fixed' : 'room',
    },
    writeCapacity: v.writeCapacity === true,
  };
  if (typeof v.nameContains === 'string' && v.nameContains.trim()) rule.nameContains = v.nameContains;
  if (amount.areaUnit === 'ft2') rule.amount.areaUnit = 'ft2';
  const angle = num(layout.fixedAngleDeg);
  if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  const minSpacing = num(layout.minSpacingM);
  if (minSpacing !== undefined) rule.layout.minSpacingM = minSpacing;
  if (GRID_STYLES.includes(layout.gridStyle as GridStyle) && layout.gridStyle !== 'spread') rule.layout.gridStyle = layout.gridStyle as GridStyle;
  const lux = num(lighting.lux);
  const uf = num(lighting.utilisationFactor);
  const mf = num(lighting.maintenanceFactor);
  if (lux !== undefined && uf !== undefined && mf !== undefined) {
    rule.lighting = { lux, utilisationFactor: uf, maintenanceFactor: mf };
    if (lighting.illuminanceUnit === 'fc') rule.lighting.illuminanceUnit = 'fc';
  }
  withNumbers(rule, v, ['capacityPerElement', 'minCount', 'maxCount']);
  if (oldCoverageLayout && !hasAmount(rule) && hasCoverageLimit(rule.coverage)) rule.preset = 'coverage';
  // An older air-changes rule with a unit that is not a flow unit keeps its numbers as a Custom rule.
  if (rule.preset === 'airChanges' && !isAirChangeUnit(rule.amount.unit)) rule.preset = 'custom';
  return validatePlacementRule(rule, []) === null ? rule : null;
}

/**
 * Reads a stored or imported list of rules. Unreadable or invalid entries and repeated ids are left out. Null when `raw` is not a list.
 * Older rules are migrated: the old coverage field names, and the Coverage layout (now Even spread; By coverage when the rule has no amount).
 */
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
    coverage: {},
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
    coverage: {},
    layout: layout('grid', 0.6),
    writeCapacity: false,
  },
  {
    id: 'example-smoke-detector',
    name: 'Smoke detector coverage (example)',
    discipline: 'fireProtection',
    roomTypeIds: [],
    stampDefinitionId: null,
    preset: 'coverage',
    amount: { unit: '' },
    coverage: { maxAreaPerElement: 60, maxSpacing: 7.5, maxWallDistance: 3.5 },
    layout: layout('evenSpread'),
    writeCapacity: false,
  },
];
