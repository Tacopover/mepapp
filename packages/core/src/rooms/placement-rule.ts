// Placement rules (room-auto-placement.md §4.4, Phase 3; room-placement-guide.md Phase A): one form
// per kind of element that says which rooms get it and how the count is calculated: from an amount
// and the capacity of one element, or by coverage. MepApp holds no national rules: the user enters
// the numbers. Pure functions, no I/O.

import type { Discipline } from '../network.js';
import type { Room } from './room.js';
import type { RoomValues } from './room-values.js';
import { ROOM_DEMAND_FIELDS, type RoomDemandKey, type RoomDemands } from './room-type.js';
import { areaInUnit, flowInUnit, isAirChangeUnit, M3H_PER_DM3S, type AreaUnit, type IlluminanceUnit, type LengthUnit } from './placement-units.js';

/** A preset fills and shows the amount fields of one common calculation. 'custom' shows every field. 'coverage' has no amount: the count comes from the coverage limits. */
export type PlacementPreset = 'perArea' | 'perPerson' | 'perPersonArea' | 'airChanges' | 'fixed' | 'lighting' | 'coverage' | 'custom';

export type LayoutStrategy = 'center' | 'grid' | 'evenSpread' | 'perimeter';

/** How the Grid layout fills a short row: spread over the full length, keep the columns, or keep the columns and move each second row half a cell. */
export type GridStyle = 'spread' | 'aligned' | 'staggered';

/** Where the Grid layout puts the outer stamps: half the spacing from the wall (the cell centers), or at the min distance to the walls. */
export type GridEdge = 'halfSpacing' | 'wall';

/** The ceiling grid sizes that the guide lists, mm. */
export const CEILING_GRID_SIZES_MM: readonly number[] = [300, 600, 900, 1200, 1500, 1800, 2100, 2400];

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
  /** The area that perM2 uses. Absent = 'm2'. A term from a room-type demand always uses m². */
  areaUnit?: AreaUnit;
  /**
   * Terms that take their number from a demand of the room type (room-placement-followup.md Phase F).
   * The number of the term in the rule is then the fallback for a room type without the demand.
   */
  from?: Partial<Record<AmountTermKey, RoomDemandKey>>;
}

/** The amount terms that a room-type demand can fill. */
export type AmountTermKey = 'fixed' | 'perM2' | 'perPerson' | 'perM3';

/** One point of a utilisation factor table: the UF of the luminaire at room index k. */
export interface UfTablePoint {
  k: number;
  uf: number;
}

export interface LightingInputs {
  /** Design illuminance E, lux. With luxFromRoomType, the fallback for a room type without an illuminance. */
  lux?: number;
  /** E comes from the illuminance demand of the room type (in lx). */
  luxFromRoomType?: boolean;
  /** Utilisation factor UF, above 0 and at most 1. Not used with a UF table. */
  utilisationFactor: number;
  /** UF from the room index k = 2 × area ÷ (h_m × perimeter): linear between the points, the end value outside them. Absent = the fixed UF. */
  ufTable?: UfTablePoint[];
  /** The length of the suspension below the ceiling, m. Absent = 0 (recessed or surface). */
  suspensionM?: number;
  /** The working-plane height when the room type has none, m. Absent = 0.75. */
  workingPlaneHeightM?: number;
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
  /** Largest distance from a point of the room to the nearest element, in the length unit (for example NEN 2535 D). */
  maxRadius?: number;
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
  /** Grid only. Absent = 'halfSpacing'. */
  edge?: GridEdge;
  /** Each stamp moves to the center of a tile of a square ceiling grid of this size, mm. Not used by Along the walls. Absent = no ceiling grid. */
  ceilingGridMm?: number;
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
  /** Used by the preset 'coverage', and by an amount rule with alsoCoverage. Another rule keeps old limits here, and they change nothing. */
  coverage: CoverageLimits;
  /** An amount rule that also meets the coverage limits: the count is the larger of the amount count and the coverage count. */
  alsoCoverage?: boolean;
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
export const PRESET_AMOUNT_FIELDS: Record<PlacementPreset, (keyof Omit<PlacementAmount, 'unit' | 'areaUnit' | 'from'>)[]> = {
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

export const GRID_EDGE_LABELS: Record<GridEdge, string> = {
  halfSpacing: 'Half the spacing from the wall',
  wall: 'At the min distance to the walls',
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

/** The working-plane height when the rule and the room type have none, m. */
export const DEFAULT_WORKING_PLANE_HEIGHT_M = 0.75;

/** An example UF table for a recessed LED panel, reflectances 0.7 / 0.5 / 0.2 (room-demands-research.md §1.1). Illustrative: use the table of the product. */
export const EXAMPLE_UF_TABLE: readonly UfTablePoint[] = [
  { k: 0.6, uf: 0.45 },
  { k: 0.8, uf: 0.53 },
  { k: 1, uf: 0.59 },
  { k: 1.25, uf: 0.64 },
  { k: 1.5, uf: 0.68 },
  { k: 2, uf: 0.74 },
  { k: 2.5, uf: 0.78 },
  { k: 3, uf: 0.81 },
  { k: 4, uf: 0.85 },
  { k: 5, uf: 0.87 },
];

/** The UF at room index k: linear between two points of the table, the end value outside them. */
export function ufAtRoomIndex(table: readonly UfTablePoint[], k: number): number {
  const points = [...table].sort((a, b) => a.k - b.k);
  if (k <= points[0]!.k) return points[0]!.uf;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (k <= b.k) return a.uf + ((b.uf - a.uf) * (k - a.k)) / (b.k - a.k);
  }
  return points[points.length - 1]!.uf;
}

/** A demand value in the unit of the rule: a flow (dm³/s) in the flow unit, a power (W) in W or kW. Other demands stay as they are. */
export function demandInUnit(key: RoomDemandKey, value: number, unit: string): number {
  const kind = ROOM_DEMAND_FIELDS.find((f) => f.key === key)?.kind;
  if (kind === 'flow') return isAirChangeUnit(unit) ? flowInUnit(value * M3H_PER_DM3S, unit) : value;
  if (kind === 'power') return unit === 'kW' ? value / 1000 : value;
  return value;
}

/** True when the demand works with the unit of the rule (the guide lists only those). */
export function demandFitsUnit(key: RoomDemandKey, unit: string): boolean {
  const kind = ROOM_DEMAND_FIELDS.find((f) => f.key === key)?.kind;
  if (kind === 'flow') return isAirChangeUnit(unit);
  if (kind === 'power') return unit === 'W' || unit === 'kW';
  if (kind === 'count') return !isAirChangeUnit(unit) && unit !== 'W' && unit !== 'kW';
  return true;
}

/** The demands that can fill the term. */
export const demandsForTerm = (term: AmountTermKey | 'lighting'): RoomDemandKey[] => ROOM_DEMAND_FIELDS.filter((f) => f.term === term).map((f) => f.key);

/** True when the rule has a coverage limit. */
export const hasCoverageLimit = (coverage: CoverageLimits): boolean =>
  coverage.maxSpacing !== undefined || coverage.maxAreaPerElement !== undefined || coverage.maxWallDistance !== undefined || coverage.maxRadius !== undefined;

/** True when the coverage limits change the count of the rule: By coverage, or an amount rule with alsoCoverage and a limit. */
export const usesCoverage = (rule: Pick<PlacementRule, 'coverage'> & Partial<Pick<PlacementRule, 'preset' | 'alsoCoverage'>>): boolean =>
  rule.preset === 'coverage' || (rule.alsoCoverage === true && hasCoverageLimit(rule.coverage));

export type RequirementWarning =
  /** The room's page has no scale, and the rule needs area, volume, length or width. */
  | 'noCalibration'
  /** The rule needs a number of people, and the room has none (no type with an area per person, no value of its own). */
  | 'noPeople'
  /** The max count limited the count. */
  | 'maxCountReached'
  /** A term takes its number from the room type, and the room type has no value (and the rule no fallback). */
  | 'noDemand'
  /** The UF table needs the room index, and the luminaire is not above the working plane (or the room has no perimeter). */
  | 'noRoomIndex';

export const REQUIREMENT_WARNING_TEXT: Record<RequirementWarning, string> = {
  noCalibration: 'no calibration',
  noPeople: 'no number of people',
  maxCountReached: 'max count reached',
  noDemand: 'the room type has no value',
  noRoomIndex: 'no room index: the luminaire is not above the working plane',
};

/** The number one term of the amount used, and where it came from. */
export interface TermValue {
  value: number;
  source: 'rule' | 'roomType';
}

/** The lighting numbers one room used. */
export interface LightingUsed {
  lux: number;
  luxSource: 'rule' | 'roomType';
  uf: number;
  /** With a UF table: the room index, h_m and the working-plane height (m), and where the height came from. */
  roomIndex?: { k: number; hmM: number; workingPlaneM: number; workingPlaneSource: 'rule' | 'roomType' | 'default' };
}

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
  /** The number each term used, when it has one. */
  terms?: Partial<Record<AmountTermKey, TermValue>>;
  /** Lighting: the numbers the lumen method used. */
  lighting?: LightingUsed;
}

/** The number of a term for a room: the room-type demand when the rule says so and the room type has it, else the rule's number. Undefined when neither has one. */
export function amountTermValue(amount: PlacementAmount, key: AmountTermKey, demands: RoomDemands | undefined): TermValue | undefined {
  const demand = amount.from?.[key];
  const fromType = demand !== undefined ? demands?.[demand] : undefined;
  if (demand !== undefined && fromType !== undefined) return { value: demandInUnit(demand, fromType, amount.unit), source: 'roomType' };
  const own = amount[key];
  return own !== undefined ? { value: own, source: 'rule' } : undefined;
}

/** The illuminance of a room: the room-type demand (lx) when the rule says so and the type has it, else the rule's number. */
export function lightingLux(lighting: LightingInputs, demands: RoomDemands | undefined): { lux: number; source: 'rule' | 'roomType' } | undefined {
  const fromType = lighting.luxFromRoomType ? demands?.illuminanceLx : undefined;
  if (fromType !== undefined) return { lux: fromType, source: 'roomType' };
  return lighting.lux !== undefined ? { lux: lighting.lux, source: 'rule' } : undefined;
}

/** True when the rule has an amount: an amount field or lighting inputs. A By coverage rule has no amount. */
export function hasAmount(rule: Pick<PlacementRule, 'amount' | 'lighting'> & Partial<Pick<PlacementRule, 'preset'>>): boolean {
  if (rule.preset === 'coverage') return false;
  const a = rule.amount;
  return termUsed(a, 'fixed') || termUsed(a, 'perM2') || termUsed(a, 'perPerson') || termUsed(a, 'perM3') || a.minimum !== undefined || rule.lighting !== undefined;
}

/** True when the term has a number in the rule or takes one from the room type. */
const termUsed = (a: PlacementAmount, key: AmountTermKey) => a[key] !== undefined || a.from?.[key] !== undefined;

/**
 * The required amount and the count of elements for one room:
 * required = fixed + perM2 × area + perPerson × people + perM3 × volume + lighting, at least the minimum;
 * count = ceil(required ÷ capacity), or 1 without a capacity; then at least the min count and at most the max count.
 * The area is in the rule's area unit (m² for a term from the room type), perM3 × volume (m³/h) is
 * converted to the amount unit, and lighting in fc uses ft². A term can take its number from the
 * room type (amountTermValue). Lighting: E × area ÷ (UF × MF), with UF from the room index when the
 * rule has a UF table. By coverage: the count needs the room geometry, so it is null here.
 */
export function calculateRoomRequirement(rule: PlacementRule, values: RoomValues): RoomRequirement {
  const warnings: RequirementWarning[] = [];
  if (rule.preset === 'coverage') {
    if (values.areaM2 === null) warnings.push('noCalibration');
    return { required: null, quantityCount: null, count: null, countSource: 'coverage', perElement: null, warnings };
  }
  const a = rule.amount;
  let required: number | null = null;
  const terms: Partial<Record<AmountTermKey, TermValue>> = {};
  let lightingUsed: LightingUsed | undefined;
  if (hasAmount(rule)) {
    const needsArea = termUsed(a, 'perM2') || rule.lighting !== undefined;
    let missing = false;
    if ((needsArea && values.areaM2 === null) || (termUsed(a, 'perM3') && values.volumeM3 === null)) {
      warnings.push('noCalibration');
      missing = true;
    }
    if (termUsed(a, 'perPerson') && values.people === null) {
      warnings.push('noPeople');
      missing = true;
    }
    for (const key of ['fixed', 'perM2', 'perPerson', 'perM3'] as const) {
      if (!termUsed(a, key)) continue;
      const term = amountTermValue(a, key, values.demands);
      if (term) terms[key] = term;
      else if (!warnings.includes('noDemand')) warnings.push('noDemand');
    }
    let light: number | null = 0;
    if (rule.lighting) {
      const L = rule.lighting;
      const lux = lightingLux(L, values.demands);
      let uf: number | null = L.utilisationFactor;
      let roomIndex: LightingUsed['roomIndex'];
      if (L.ufTable && L.ufTable.length > 0) {
        const typeWp = values.demands?.workingPlaneHeightM;
        const workingPlaneM = typeWp ?? L.workingPlaneHeightM ?? DEFAULT_WORKING_PLANE_HEIGHT_M;
        const hmM = values.ceilingHeight.mm / 1000 - (L.suspensionM ?? 0) - workingPlaneM;
        if (hmM > 0 && values.areaM2 !== null && values.perimeterM !== null && values.perimeterM > 0) {
          const k = (2 * values.areaM2) / (hmM * values.perimeterM);
          uf = ufAtRoomIndex(L.ufTable, k);
          roomIndex = { k, hmM, workingPlaneM, workingPlaneSource: typeWp !== undefined ? 'roomType' : L.workingPlaneHeightM !== undefined ? 'rule' : 'default' };
        } else {
          uf = null;
          if (values.areaM2 !== null) warnings.push('noRoomIndex');
        }
      }
      if (!lux) {
        if (!warnings.includes('noDemand')) warnings.push('noDemand');
        light = null;
      } else if (uf === null) {
        light = null;
      } else {
        // An illuminance from the room type is in lx, with the area in m².
        const inFc = lux.source === 'rule' && L.illuminanceUnit === 'fc';
        light = (lux.lux * areaInUnit(values.areaM2 ?? 0, inFc ? 'ft2' : 'm2')) / (uf * L.maintenanceFactor);
        lightingUsed = { lux: lux.lux, luxSource: lux.source, uf, ...(roomIndex ? { roomIndex } : {}) };
      }
    }
    if (!missing && light !== null && !warnings.includes('noDemand')) {
      const area = values.areaM2 ?? 0;
      const t = (key: AmountTermKey) => terms[key]?.value ?? 0;
      const perM2Area = terms.perM2?.source === 'roomType' ? area : areaInUnit(area, a.areaUnit);
      const sum = t('fixed') + t('perM2') * perM2Area + t('perPerson') * (values.people?.count ?? 0) + flowInUnit(t('perM3') * (values.volumeM3 ?? 0), a.unit) + light;
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
  return {
    required,
    quantityCount,
    count,
    countSource: quantityCount !== null || blocked ? 'amount' : 'onePerRoom',
    perElement,
    warnings,
    ...(Object.keys(terms).length > 0 ? { terms } : {}),
    ...(lightingUsed ? { lighting: lightingUsed } : {}),
  };
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
  for (const [key, demand] of Object.entries(a.from ?? {}) as [AmountTermKey, RoomDemandKey][]) {
    if (!demandsForTerm(key).includes(demand)) return 'A term takes a room-type value that does not fit it.';
  }
  if (rule.lighting) {
    const L = rule.lighting;
    if (L.lux === undefined ? !L.luxFromRoomType : !(Number.isFinite(L.lux) && L.lux > 0)) return 'The illuminance must be a number above 0.';
    if (!isFactor(L.utilisationFactor) || !isFactor(L.maintenanceFactor)) return 'The utilisation and maintenance factors must be above 0 and at most 1.';
    if (L.ufTable && (L.ufTable.length < 2 || L.ufTable.some((pt) => !(Number.isFinite(pt.k) && pt.k > 0) || !isFactor(pt.uf)) || new Set(L.ufTable.map((pt) => pt.k)).size < L.ufTable.length))
      return 'The UF table needs 2 or more points, each with a different room index above 0 and a UF above 0 and at most 1.';
    if (!isNonNegative(L.suspensionM) || !isNonNegative(L.workingPlaneHeightM)) return 'The suspension and the working-plane height must be numbers of 0 or more.';
  }
  if (!isPositive(rule.capacityPerElement)) return 'The capacity per element must be a number above 0.';
  if (!isPositive(rule.coverage.maxSpacing) || !isPositive(rule.coverage.maxAreaPerElement) || !isPositive(rule.coverage.maxWallDistance) || !isPositive(rule.coverage.maxRadius)) return 'A coverage limit must be a number above 0.';
  if (rule.preset === 'coverage' && !hasCoverageLimit(rule.coverage)) return 'By coverage needs a max radius, a max spacing, a max area per element or a max distance to a wall.';
  if (rule.alsoCoverage && rule.preset !== 'coverage' && !hasCoverageLimit(rule.coverage)) return 'Enter a coverage limit, or turn off "Also cover each point of the room".';
  if (rule.preset === 'airChanges' && !isAirChangeUnit(rule.amount.unit)) return 'Air changes need a flow unit: m³/h, dm³/s, l/s, m³/s or cfm.';
  if (!isCount(rule.minCount) || !isCount(rule.maxCount)) return 'A count must be a whole number of 0 or more.';
  if (rule.minCount !== undefined && rule.maxCount !== undefined && rule.minCount > rule.maxCount) return 'The min count is larger than the max count.';
  if (!(Number.isFinite(rule.layout.wallOffsetM) && rule.layout.wallOffsetM >= 0)) return 'The min distance to the walls must be a number of 0 or more.';
  if (!isNonNegative(rule.layout.minSpacingM)) return 'The min distance between stamps must be a number of 0 or more.';
  if (!isPositive(rule.layout.ceilingGridMm)) return 'The ceiling grid size must be a number above 0.';
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
  const maxRadius = num(c.maxRadius);
  if (maxRadius !== undefined) coverage.maxRadius = maxRadius;
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
  if (v.alsoCoverage === true && rule.preset !== 'coverage') rule.alsoCoverage = true;
  if (amount.areaUnit === 'ft2') rule.amount.areaUnit = 'ft2';
  const angle = num(layout.fixedAngleDeg);
  if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  const minSpacing = num(layout.minSpacingM);
  if (minSpacing !== undefined) rule.layout.minSpacingM = minSpacing;
  if (GRID_STYLES.includes(layout.gridStyle as GridStyle) && layout.gridStyle !== 'spread') rule.layout.gridStyle = layout.gridStyle as GridStyle;
  if (layout.edge === 'wall') rule.layout.edge = 'wall';
  const ceilingGrid = num(layout.ceilingGridMm);
  if (ceilingGrid !== undefined) rule.layout.ceilingGridMm = ceilingGrid;
  const lux = num(lighting.lux);
  const uf = num(lighting.utilisationFactor);
  const mf = num(lighting.maintenanceFactor);
  const luxFromRoomType = lighting.luxFromRoomType === true;
  if ((lux !== undefined || luxFromRoomType) && uf !== undefined && mf !== undefined) {
    rule.lighting = { utilisationFactor: uf, maintenanceFactor: mf };
    if (lux !== undefined) rule.lighting.lux = lux;
    if (luxFromRoomType) rule.lighting.luxFromRoomType = true;
    if (lighting.illuminanceUnit === 'fc') rule.lighting.illuminanceUnit = 'fc';
    const table = Array.isArray(lighting.ufTable) ? lighting.ufTable.map((pt) => ({ k: num(rec(pt).k), uf: num(rec(pt).uf) })).filter((pt): pt is UfTablePoint => pt.k !== undefined && pt.uf !== undefined) : [];
    if (table.length >= 2) rule.lighting.ufTable = table;
    withNumbers(rule.lighting, lighting, ['suspensionM', 'workingPlaneHeightM']);
  }
  const from = rec(amount.from);
  for (const key of ['fixed', 'perM2', 'perPerson', 'perM3'] as const) {
    const demand = from[key];
    if (typeof demand === 'string' && demandsForTerm(key).includes(demand as RoomDemandKey)) (rule.amount.from ??= {})[key] = demand as RoomDemandKey;
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
    amount: { fixed: 7, unit: 'dm³/s', from: { fixed: 'exhaustFixedDm3s' } },
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
    coverage: { maxAreaPerElement: 60, maxRadius: 5.8 },
    layout: layout('evenSpread'),
    writeCapacity: false,
  },
];
