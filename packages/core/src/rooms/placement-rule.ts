// Placement rules (room-auto-placement.md §4.4, Phase 3; room-placement-guide.md Phase A;
// room-type-calculations.md §3.3): one form per kind of element that says which rooms get it and how
// the count is calculated. A rule serves a need of the room types: the room type gives the need of a
// room (its demand), and the rule gives what one stamp gives (the capacity). A rule can also place
// the same number in each room, or count by coverage. MepApp holds no national rules: the user enters
// the numbers. Pure functions, no I/O.

import type { Discipline } from '../network.js';
import type { Room } from './room.js';
import type { RoomValues } from './room-values.js';
import { demandTotal, matchRoomType, oldDemandFieldTerm, type DemandResult, type DemandTerm, type RoomDemand, type RoomDemands } from './room-type.js';
import { BUILT_IN_NEEDS, type DemandBasis, type NeedKind, type RoomNeed } from './room-need.js';
import { AIR_CHANGE_UNITS, isAirChangeUnit, M2_PER_FT2, M3H_PER_DM3S, STAMP_COUNT_UNIT, type LengthUnit } from './placement-units.js';

export type LayoutStrategy = 'center' | 'grid' | 'evenSpread' | 'perimeter';

/** How the Grid layout fills a short row: spread over the full length, keep the columns, or keep the columns and move each second row half a cell. */
export type GridStyle = 'spread' | 'aligned' | 'staggered';

/** Where the Grid layout puts the outer stamps: half the spacing from the wall (the cell centers), or at the min distance to the walls. */
export type GridEdge = 'halfSpacing' | 'wall';

/** The ceiling grid sizes that the guide lists, mm. */
export const CEILING_GRID_SIZES_MM: readonly number[] = [300, 600, 900, 1200, 1500, 1800, 2100, 2400];

/** How MepApp counts the stamps: the need of the room types ÷ the capacity, the same number in each room, or coverage. */
export type PlacementCountMode = 'need' | 'perRoom' | 'coverage';

/** One point of a utilisation factor table: the UF of the luminaire at room index k. */
export interface UfTablePoint {
  k: number;
  uf: number;
}

/** The luminaire side of the lumen method. The room type gives the illuminance and the working plane. */
export interface LuminaireInputs {
  /** Utilisation factor UF, above 0 and at most 1. Not used with a UF table. */
  utilisationFactor: number;
  /** UF from the room index k = 2 × area ÷ (h_m × perimeter): linear between the points, the end value outside them. Absent = the fixed UF. */
  ufTable?: UfTablePoint[];
  /** The length of the suspension below the ceiling, m. Absent = 0 (recessed or surface). */
  suspensionM?: number;
  /** Maintenance factor MF, above 0 and at most 1. */
  maintenanceFactor: number;
}

/** The limits of the By coverage calculation. A rule that counts by coverage, or that also meets coverage, uses them. */
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
  /** RoomType ids. Empty = every room whose type has the need (countBy 'need'), else every room. */
  roomTypeIds: string[];
  /** Also only rooms whose name contains this text (case-insensitive). Absent = no name filter. */
  nameContains?: string;
  /** The stamp to place. Null = not chosen yet (the dry run works without one). */
  stampDefinitionId: string | null;
  countBy: PlacementCountMode;
  /** countBy 'need': the need that the stamp serves. */
  needId?: string;
  /** countBy 'need': what one stamp gives, in `unit`. Light: the lm of one luminaire. Count need: absent = 1. Flow, power, amount: absent = one stamp per room. */
  capacityPerElement?: number;
  /** A flow or power need: the unit of the capacity and of the written capacity (dm³/s, l/s, m³/h, m³/s, cfm; W, kW). Absent = the unit of the need. */
  unit?: string;
  /** The need Light: UF or the UF table, the suspension, MF. */
  luminaire?: LuminaireInputs;
  /** countBy 'perRoom': the stamps in each room. Absent = 1. */
  perRoomCount?: number;
  /** Used by countBy 'coverage', and by a rule with alsoCoverage. Another rule keeps old limits here, and they change nothing. */
  coverage: CoverageLimits;
  /** A rule that also meets the coverage limits: the count is the larger of its count and the coverage count. */
  alsoCoverage?: boolean;
  minCount?: number;
  maxCount?: number;
  layout: PlacementLayout;
  /** Each placed stamp gets required ÷ count as its capacity (ProjectDocument.terminalCapacities). */
  writeCapacity: boolean;
}

export const COUNT_MODE_LABELS: Record<PlacementCountMode, string> = {
  need: 'A need of the room types',
  perRoom: 'The same number in each room',
  coverage: 'By coverage',
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

/** The units of a capacity for each kind of need: a flow or a power has a choice, another kind uses the unit of the need. */
export const CAPACITY_UNITS: Record<NeedKind, readonly string[]> = {
  light: [],
  flow: Object.keys(AIR_CHANGE_UNITS).sort((a, b) => (a === 'dm³/s' ? -1 : b === 'dm³/s' ? 1 : 0)),
  power: ['W', 'kW'],
  count: [],
  amount: [],
};

/** The unit of the rule's capacity, required amount and written capacity: the rule's unit when the kind of the need offers it, else the unit of the need. */
export function ruleUnitOf(rule: Pick<PlacementRule, 'unit'>, need: Pick<RoomNeed, 'kind' | 'unit'>): string {
  return rule.unit !== undefined && CAPACITY_UNITS[need.kind].includes(rule.unit) ? rule.unit : need.unit;
}

/** An amount of the need (dm³/s, W, …) in the unit of the rule: a flow in m³/h or l/s, a power in kW. */
export function inRuleUnit(value: number, need: Pick<RoomNeed, 'kind'>, unit: string): number {
  if (need.kind === 'flow' && isAirChangeUnit(unit) && unit !== 'dm³/s' && unit !== 'l/s') return value * M3H_PER_DM3S * AIR_CHANGE_UNITS[unit]!;
  if (need.kind === 'power' && unit === 'kW') return value / 1000;
  return value;
}

/** The demand for the need, when the room type has one. An id such as "constructor" finds no demand. */
const demandFor = (demands: RoomDemands | undefined, needId: string): RoomDemand | undefined =>
  demands && Object.prototype.hasOwnProperty.call(demands, needId) ? demands[needId] : undefined;

/** True when the rule applies to the room: its type is in the list (or the list is empty), and its name contains the text (when set). A need rule with an empty list applies to the rooms whose type has the need (`demands` of the room). */
export function ruleAppliesToRoom(
  rule: Pick<PlacementRule, 'roomTypeIds' | 'nameContains'> & Partial<Pick<PlacementRule, 'countBy' | 'needId'>>,
  room: Pick<Room, 'roomTypeId' | 'name'>,
  demands?: RoomDemands,
): boolean {
  if (rule.roomTypeIds.length > 0) {
    if (room.roomTypeId === undefined || !rule.roomTypeIds.includes(room.roomTypeId)) return false;
  } else if (rule.countBy === 'need' && (rule.needId === undefined || demandFor(demands, rule.needId) === undefined)) return false;
  const text = rule.nameContains?.trim().toLowerCase();
  if (text && !(room.name ?? '').toLowerCase().includes(text)) return false;
  return true;
}

// A count is a whole number: 2.0000000001 elements must not become 3.
const ceilCount = (x: number): number => Math.max(0, Math.ceil(x - 1e-9));

/** The working-plane height when the room type has none, m. */
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

/** True when the rule has a coverage limit. */
export const hasCoverageLimit = (coverage: CoverageLimits): boolean =>
  coverage.maxSpacing !== undefined || coverage.maxAreaPerElement !== undefined || coverage.maxWallDistance !== undefined || coverage.maxRadius !== undefined;

/** True when the coverage limits change the count of the rule: By coverage, or another rule with alsoCoverage and a limit. */
export const usesCoverage = (rule: Pick<PlacementRule, 'coverage'> & Partial<Pick<PlacementRule, 'countBy' | 'alsoCoverage'>>): boolean =>
  rule.countBy === 'coverage' || (rule.alsoCoverage === true && hasCoverageLimit(rule.coverage));

export type RequirementWarning =
  /** The room's page has no scale, and the demand needs area, volume or length. */
  | 'noCalibration'
  /** The demand needs a number of people, and the room has none (no type with an area per person, no value of its own). */
  | 'noPeople'
  /** The max count limited the count. */
  | 'maxCountReached'
  /** The room type has no demand for the need of the rule. */
  | 'noDemand'
  /** The need of the rule is not found: an own need was deleted. */
  | 'needNotFound'
  /** The UF table needs the room index, and the luminaire is not above the working plane (or the room has no perimeter). */
  | 'noRoomIndex'
  /** The need of the room is 0, although the room type has a number above 0 (for example 0 persons in a small room): the room gets no stamp. */
  | 'zeroNeed';

export const REQUIREMENT_WARNING_TEXT: Record<RequirementWarning, string> = {
  noCalibration: 'no calibration',
  noPeople: 'no number of people',
  maxCountReached: 'max count reached',
  noDemand: 'the room type does not have the need',
  needNotFound: 'the need of the rule was deleted',
  noRoomIndex: 'no room index: the luminaire is not above the working plane',
  zeroNeed: 'no stamp: the need of the room is 0',
};

/** The UF that one room used. */
export interface LightingUsed {
  uf: number;
  /** With a UF table: the room index, h_m and the working-plane height (m), and where the height came from. */
  roomIndex?: { k: number; hmM: number; workingPlaneM: number; workingPlaneSource: 'roomType' | 'default' };
}

/** Which calculation gave the count: the need ÷ the capacity, the coverage layout, the same number in each room, or one element per room (no capacity). */
export type CountSource = 'amount' | 'coverage' | 'perRoom' | 'onePerRoom';

export interface RoomRequirement {
  /** The need of the room in the unit of the rule (Light: lm on the working plane). Null when the rule does not count by a need, or a value is missing. */
  required: number | null;
  /** What one stamp gives in the unit of the rule. Light: Φ × UF × MF in this room. Null without a capacity. */
  capacity: number | null;
  /** ceil(required ÷ capacity). Null without a capacity or a required amount. */
  quantityCount: number | null;
  /** The number of elements to place. Null when it cannot be calculated. By coverage: null here; the layout gives it (planAutoPlacement). */
  count: number | null;
  countSource: CountSource;
  /** required ÷ count: the capacity each placed element gets. */
  perElement: number | null;
  warnings: RequirementWarning[];
  /** The demand of the room type and its total in the unit of the need: the "Why" chain shows it. */
  demand?: { needId: string; demand: RoomDemand; result: DemandResult };
  /** Light: the UF that the room used. */
  lighting?: LightingUsed;
}

/** The count with the min count and the max count. */
function limitCount(rule: Pick<PlacementRule, 'minCount' | 'maxCount'>, count: number, warnings: RequirementWarning[]): number {
  let n = Math.max(count, rule.minCount ?? 0);
  if (rule.maxCount !== undefined && n > rule.maxCount) {
    n = rule.maxCount;
    warnings.push('maxCountReached');
  }
  return n;
}

/**
 * The need and the count of elements for one room:
 * need = the demand of the room type for the need of the rule (demandTotal), in the unit of the rule;
 * count = ceil(need ÷ capacity), or 1 without a capacity (a count need has capacity 1);
 * then at least the min count and at most the max count. Light: need = Em × floor area, and one
 * luminaire gives Φ × UF × MF, with UF from the room index when the rule has a UF table.
 * The same number in each room: perRoomCount. By coverage: the count needs the room geometry, so it
 * is null here. A room type without the need, or a deleted need, gives no count. A count of 0
 * from a demand with a number above 0 (0 persons) gives the warning 'zeroNeed'.
 */
export function calculateRoomRequirement(rule: PlacementRule, values: RoomValues, needs: readonly RoomNeed[] = BUILT_IN_NEEDS): RoomRequirement {
  const warnings: RequirementWarning[] = [];
  const none = { required: null, capacity: null, quantityCount: null, perElement: null };
  if (rule.countBy === 'coverage') {
    if (values.areaM2 === null) warnings.push('noCalibration');
    return { ...none, count: null, countSource: 'coverage', warnings };
  }
  if (rule.countBy === 'perRoom') return { ...none, count: limitCount(rule, rule.perRoomCount ?? 1, warnings), countSource: 'perRoom', warnings };
  const need = needs.find((n) => n.id === rule.needId);
  const demand = need ? demandFor(values.demands, need.id) : undefined;
  if (!need || !demand) return { ...none, count: null, countSource: 'amount', warnings: [need ? 'noDemand' : 'needNotFound'] };
  const result = demandTotal(need, demand, values);
  for (const p of result.problems) warnings.push(p === 'notFit' ? 'noDemand' : p);
  const unit = ruleUnitOf(rule, need);
  const required = result.total === null ? null : inRuleUnit(result.total, need, unit);
  let capacity: number | null = null;
  let capacityMissing = false;
  let lighting: LightingUsed | undefined;
  if (need.kind === 'light') {
    const L = rule.luminaire;
    if (L && rule.capacityPerElement !== undefined) {
      let uf: number | null = L.utilisationFactor;
      let roomIndex: LightingUsed['roomIndex'];
      if (L.ufTable && L.ufTable.length > 0) {
        const workingPlaneM = demand.workingPlaneM ?? DEFAULT_WORKING_PLANE_HEIGHT_M;
        const hmM = values.ceilingHeight.mm / 1000 - (L.suspensionM ?? 0) - workingPlaneM;
        if (hmM > 0 && values.areaM2 !== null && values.perimeterM !== null && values.perimeterM > 0) {
          const k = (2 * values.areaM2) / (hmM * values.perimeterM);
          uf = ufAtRoomIndex(L.ufTable, k);
          roomIndex = { k, hmM, workingPlaneM, workingPlaneSource: demand.workingPlaneM !== undefined ? 'roomType' : 'default' };
        } else {
          uf = null;
          if (values.areaM2 !== null) warnings.push('noRoomIndex');
        }
      }
      if (uf === null) capacityMissing = true;
      else {
        capacity = rule.capacityPerElement * uf * L.maintenanceFactor;
        lighting = { uf, ...(roomIndex ? { roomIndex } : {}) };
      }
    }
  } else if (need.kind === 'count') capacity = rule.capacityPerElement ?? 1;
  else capacity = rule.capacityPerElement ?? null;
  const blocked = warnings.includes('noDemand') || capacityMissing || (capacity !== null && required === null);
  const quantityCount = !blocked && capacity !== null && capacity > 0 && required !== null ? ceilCount(required / capacity) : null;
  const count = blocked ? null : limitCount(rule, quantityCount ?? 1, warnings);
  // A demand of only 0 says "needs none"; a demand with a number above 0 that gives 0 (0 persons) is a surprise.
  if (count === 0 && quantityCount === 0 && demand.terms.some((t) => t.every !== undefined || (t.value ?? 0) > 0)) warnings.push('zeroNeed');
  return {
    required,
    capacity,
    quantityCount,
    count,
    countSource: quantityCount !== null || blocked ? 'amount' : 'onePerRoom',
    perElement: required !== null && count !== null && count > 0 ? required / count : null,
    warnings,
    demand: { needId: need.id, demand, result },
    ...(lighting ? { lighting } : {}),
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

/** The dry run (Phase 3): the requirement of each rule in each room it applies to. No geometry yet. `needs`: the built-in needs and the own needs. */
export function calculateRooms(rules: readonly PlacementRule[], rooms: readonly Room[], valuesOf: (room: Room) => RoomValues, needs: readonly RoomNeed[] = BUILT_IN_NEEDS): RoomCalculation {
  const rows: RoomCalculationRow[] = [];
  const unmatched: Room[] = [];
  for (const room of rooms) {
    const values = valuesOf(room);
    const applying = rules.filter((rule) => ruleAppliesToRoom(rule, room, values.demands));
    if (applying.length === 0) {
      unmatched.push(room);
      continue;
    }
    for (const rule of applying) rows.push({ room, rule, values, requirement: calculateRoomRequirement(rule, values, needs) });
  }
  return { rows, unmatched };
}

const isNonNegative = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0);
const isPositive = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n > 0);
const isCount = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);
const isFactor = (n: number) => Number.isFinite(n) && n > 0 && n <= 1;
const CAPACITY_UNIT_LIST = [...CAPACITY_UNITS.flow, ...CAPACITY_UNITS.power];

/** Why the rule cannot be saved, or null when it can. `others` are the other rules of the list. `needs`: the built-in needs and the own needs; the unit must fit the need when the list has it. */
export function validatePlacementRule(rule: PlacementRule, others: readonly PlacementRule[], needs: readonly RoomNeed[] = BUILT_IN_NEEDS): string | null {
  const name = rule.name.trim();
  if (!name) return 'Enter a name.';
  if (others.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) return `Another rule is already called "${name}".`;
  if (rule.countBy === 'need' && !rule.needId) return 'Choose the need that the stamp serves.';
  if (!isPositive(rule.capacityPerElement)) return 'What one stamp gives must be a number above 0.';
  if (rule.unit !== undefined && !CAPACITY_UNIT_LIST.includes(rule.unit)) return `The unit ${rule.unit} is not a unit of a flow or a power.`;
  const need = rule.countBy === 'need' ? needs.find((n) => n.id === rule.needId) : undefined;
  if (rule.unit !== undefined && need && !CAPACITY_UNITS[need.kind].includes(rule.unit)) return `The unit ${rule.unit} is not a unit of ${need.name}.`;
  if (rule.luminaire) {
    const L = rule.luminaire;
    if (!isFactor(L.utilisationFactor) || !isFactor(L.maintenanceFactor)) return 'The utilisation and maintenance factors must be above 0 and at most 1.';
    if (L.ufTable && (L.ufTable.length < 2 || L.ufTable.some((pt) => !(Number.isFinite(pt.k) && pt.k > 0) || !isFactor(pt.uf)) || new Set(L.ufTable.map((pt) => pt.k)).size < L.ufTable.length))
      return 'The UF table needs 2 or more points, each with a different room index above 0 and a UF above 0 and at most 1.';
    if (!isNonNegative(L.suspensionM)) return 'The suspension must be a number of 0 or more.';
  }
  if (!isCount(rule.perRoomCount)) return 'The number of stamps in each room must be a whole number of 0 or more.';
  if (!isPositive(rule.coverage.maxSpacing) || !isPositive(rule.coverage.maxAreaPerElement) || !isPositive(rule.coverage.maxWallDistance) || !isPositive(rule.coverage.maxRadius)) return 'A coverage limit must be a number above 0.';
  if (rule.countBy === 'coverage' && !hasCoverageLimit(rule.coverage)) return 'By coverage needs a max radius, a max spacing, a max area per element or a max distance to a wall.';
  if (rule.alsoCoverage && rule.countBy !== 'coverage' && !hasCoverageLimit(rule.coverage)) return 'Enter a coverage limit, or turn off "Also cover each point of the room".';
  if (!isCount(rule.minCount) || !isCount(rule.maxCount)) return 'A count must be a whole number of 0 or more.';
  if (rule.minCount !== undefined && rule.maxCount !== undefined && rule.minCount > rule.maxCount) return 'The min count is larger than the max count.';
  if (!(Number.isFinite(rule.layout.wallOffsetM) && rule.layout.wallOffsetM >= 0)) return 'The min distance to the walls must be a number of 0 or more.';
  if (!isNonNegative(rule.layout.minSpacingM)) return 'The min distance between stamps must be a number of 0 or more.';
  if (!isPositive(rule.layout.ceilingGridMm)) return 'The ceiling grid size must be a number above 0.';
  if (rule.layout.rotation === 'fixed' && !Number.isFinite(rule.layout.fixedAngleDeg ?? Number.NaN)) return 'Enter the fixed angle.';
  return null;
}

const DISCIPLINES: readonly Discipline[] = ['heatingAndCooling', 'ventilation', 'plumbing', 'fireProtection', 'electrical', 'other'];
const STRATEGIES = Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[];
const GRID_STYLES = Object.keys(GRID_STYLE_LABELS) as GridStyle[];
const COUNT_MODES = Object.keys(COUNT_MODE_LABELS) as PlacementCountMode[];

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

function toLuminaire(value: unknown): LuminaireInputs | undefined {
  const l = rec(value);
  const uf = num(l.utilisationFactor);
  const mf = num(l.maintenanceFactor);
  if (uf === undefined || mf === undefined) return undefined;
  const luminaire: LuminaireInputs = { utilisationFactor: uf, maintenanceFactor: mf };
  const table = Array.isArray(l.ufTable) ? l.ufTable.map((pt) => ({ k: num(rec(pt).k), uf: num(rec(pt).uf) })).filter((pt): pt is UfTablePoint => pt.k !== undefined && pt.uf !== undefined) : [];
  if (table.length >= 2) luminaire.ufTable = table;
  return withNumbers(luminaire, l, ['suspensionM']);
}

/**
 * The numbers of an old rule (before room-type-calculations.md) that move to the room types of the
 * rule as a demand (§3.5, §4 question 11): moveOldRuleNumbers does the move.
 */
export interface OldRuleNumbers {
  ruleId: string;
  ruleName: string;
  /** The need of the rule. When no built-in need fits, a new own need that is named after the rule. */
  need: RoomNeed;
  /** The numbers of the old rule as a demand, in the unit of the need. Null = the rule has no own numbers: only its notes go to the report. */
  demand: RoomDemand | null;
  /** The room types of the old rule. Empty = every room type. */
  roomTypeIds: string[];
  /** The text that the room names of the old rule contain, when it has one. */
  nameContains?: string;
  /** What the conversion could not keep, and the guess of the need, for the report. */
  notes: string[];
}

const needOf = (id: string): RoomNeed => BUILT_IN_NEEDS.find((n) => n.id === id)!;
const nameHas = (name: string, words: readonly string[]) => words.some((w) => name.toLowerCase().includes(w));
/** The basis of the room-type value that each old term could take (the old demandsForTerm). */
const OLD_TERM_BASIS: Record<'fixed' | 'perM2' | 'perPerson' | 'perM3', DemandBasis> = { fixed: 'room', perM2: 'area', perPerson: 'person', perM3: 'volume' };
/** A rule for these needs writes the capacity to its stamps (the guide clears it for Light and a number of things). */
const writesCapacity = (kind: NeedKind) => kind === 'flow' || kind === 'power' || kind === 'amount';

/** An old amount in the unit of the rule, in the unit of the need: dm³/s for a flow, W for a power. */
function oldInNeedUnit(value: number, kind: NeedKind, unit: string): number {
  if (kind === 'flow' && isAirChangeUnit(unit) && unit !== 'dm³/s' && unit !== 'l/s') return value / AIR_CHANGE_UNITS[unit]! / M3H_PER_DM3S;
  if (kind === 'power' && unit === 'kW') return value * 1000;
  return value;
}

/**
 * The rule of an old stored rule (with `preset`, `amount` and `lighting`), and the own numbers that must move to the room types.
 * Null for numbers that the old validator refused (below 0, an illuminance of 0). A link to a room-type value that does not fit its term goes, as in the old parse.
 */
function fromOldRule(v: Record<string, unknown>, base: PlacementRule, oldCoverageLayout: boolean): { rule: PlacementRule; old: OldRuleNumbers | null } | null {
  const amount = rec(v.amount);
  const lighting = rec(v.lighting);
  const unit = typeof amount.unit === 'string' ? amount.unit.trim() : '';
  const own = { fixed: num(amount.fixed), perM2: num(amount.perM2), perPerson: num(amount.perPerson), perM3: num(amount.perM3) };
  const minimum = num(amount.minimum);
  const from = rec(amount.from);
  const links = (['fixed', 'perM2', 'perPerson', 'perM3'] as const).flatMap((key) => {
    const term = typeof from[key] === 'string' ? oldDemandFieldTerm(from[key] as string) : undefined;
    return term && term.basis === OLD_TERM_BASIS[key] ? [{ key, term }] : [];
  });
  const lux = num(lighting.lux);
  const luxFromRoomType = lighting.luxFromRoomType === true;
  if ([own.fixed, own.perM2, own.perPerson, own.perM3, minimum, num(lighting.workingPlaneHeightM)].some((n) => n !== undefined && n < 0) || (lux !== undefined && lux <= 0)) return null;
  const luminaire = toLuminaire(lighting);
  const isLighting = luminaire !== undefined && (lux !== undefined || luxFromRoomType);
  const usedTerms = (['fixed', 'perM2', 'perPerson', 'perM3'] as const).filter((key) => own[key] !== undefined || links.some((l) => l.key === key));
  const hasAmount = usedTerms.length > 0 || minimum !== undefined || isLighting;
  const rule: PlacementRule = { ...base };
  if (v.preset === 'coverage' || (oldCoverageLayout && !hasAmount && hasCoverageLimit(base.coverage))) return { rule: { ...rule, countBy: 'coverage' }, old: null };
  const capacity = num(v.capacityPerElement);
  const oldOf = (need: RoomNeed, demand: RoomDemand | null, notes: string[]): OldRuleNumbers | null =>
    demand || notes.length > 0 ? { ruleId: base.id, ruleName: base.name, need, demand, roomTypeIds: base.roomTypeIds, ...(base.nameContains ? { nameContains: base.nameContains } : {}), notes } : null;
  if (isLighting) {
    rule.countBy = 'need';
    rule.needId = 'light';
    rule.luminaire = luminaire;
    if (capacity !== undefined) rule.capacityPerElement = capacity;
    const notes: string[] = [];
    if (num(lighting.workingPlaneHeightM) !== undefined && luxFromRoomType) notes.push('The working-plane height of the rule goes: a room type without one uses 0.75 m.');
    if (rule.writeCapacity) {
      rule.writeCapacity = false;
      notes.push('The rule no longer writes a capacity to its stamps: a rule for Light does not write one.');
    }
    if (lux === undefined) return { rule, old: oldOf(needOf('light'), null, notes) };
    const lx = lighting.illuminanceUnit === 'fc' ? lux / M2_PER_FT2 : lux;
    const demand: RoomDemand = { terms: [{ basis: 'illuminance', value: lx }] };
    const wp = num(lighting.workingPlaneHeightM);
    if (wp !== undefined) demand.workingPlaneM = wp;
    return { rule, old: oldOf(needOf('light'), demand, notes) };
  }
  if (!hasAmount) return { rule: { ...rule, countBy: 'perRoom', perRoomCount: 1 }, old: null };
  if (unit === STAMP_COUNT_UNIT && usedTerms.length === 1 && usedTerms[0] === 'fixed' && links.length === 0 && minimum === undefined) {
    return { rule: { ...rule, countBy: 'perRoom', perRoomCount: ceilCount(own.fixed!) }, old: null };
  }
  // The need: the need of the links, else a guess from the unit and the rule name.
  const notes: string[] = [];
  const linkNeeds = [...new Set(links.map((l) => l.term.needId))];
  const onlyAirChanges = usedTerms.length === 1 && usedTerms[0] === 'perM3';
  let need: RoomNeed;
  if (linkNeeds.length > 0) {
    need = needOf(linkNeeds[0]!);
    if (linkNeeds.length > 1) notes.push(`The rule took values of more than one need; it now serves ${need.name}.`);
  } else if (unit === 'W' || unit === 'kW') need = needOf(nameHas(base.name, ['cool', 'koel']) ? 'cooling' : 'heating');
  // Only air changes: the room types keep air changes as Return air too (airChangesPerH).
  else if (isAirChangeUnit(unit)) need = needOf(nameHas(base.name, ['return', 'retour', 'exhaust', 'extract', 'afzuig', 'afvoer', 'toilet']) || onlyAirChanges ? 'returnAir' : 'supplyAir');
  else if (unit.toLowerCase() === 'sockets' || unit.toLowerCase() === 'socket') need = needOf('sockets');
  else {
    const name = base.name.replace(/\s*\(example\)\s*$/i, '').trim() || unit || 'Old rule';
    need = { id: `need-from-${base.id}`, name, kind: unit === STAMP_COUNT_UNIT || unit === '' ? 'count' : 'amount', unit: unit || STAMP_COUNT_UNIT, own: true };
  }
  if (linkNeeds.length === 0 && !need.own) notes.push(onlyAirChanges && need.id === 'returnAir' ? 'MepApp chose Return air, because the rule has only air changes.' : `MepApp chose the need ${need.name} from the unit ${unit || '(none)'} and the rule name.`);
  rule.countBy = 'need';
  rule.needId = need.id;
  if (CAPACITY_UNITS[need.kind].includes(unit)) rule.unit = unit;
  // The old count: with the unit "stamps" one stamp gave 1, and without a capacity the rule placed 1 stamp in each room.
  if (unit === STAMP_COUNT_UNIT) {
    if (need.kind !== 'count') {
      rule.capacityPerElement = 1;
      notes.push(`The unit of the rule was stamps, so one stamp now gives 1 ${need.unit}. The count stays the same.`);
    }
  } else if (capacity !== undefined) rule.capacityPerElement = capacity;
  else if (need.kind === 'count')
    notes.push('The rule had no capacity, so it placed 1 stamp in each room. Now one stamp gives 1, so a room gets 1 stamp for each 1 of its need. To change this, enter what one stamp gives in step 3 of the rule.');
  if (rule.writeCapacity && !writesCapacity(need.kind)) {
    rule.writeCapacity = false;
    notes.push(`The rule no longer writes a capacity to its stamps: a rule for ${need.name} does not write one.`);
  }
  // The own numbers of the rule (also the fallbacks of the links) become a demand in the unit of the need.
  const terms: DemandTerm[] = [];
  const perM2 = own.perM2 !== undefined && amount.areaUnit === 'ft2' ? own.perM2 / M2_PER_FT2 : own.perM2;
  if (own.fixed !== undefined) terms.push({ basis: 'room', value: oldInNeedUnit(own.fixed, need.kind, unit) });
  if (own.perPerson !== undefined) terms.push({ basis: 'person', value: oldInNeedUnit(own.perPerson, need.kind, unit) });
  if (perM2 !== undefined) terms.push({ basis: 'area', value: oldInNeedUnit(perM2, need.kind, unit) });
  if (own.perM3 !== undefined) {
    if (need.kind === 'flow') terms.push({ basis: 'volume', value: own.perM3 });
    else notes.push(`The amount per m³ (${own.perM3}) goes: only an air flow has air changes.`);
  }
  if (terms.length === 0 && minimum === undefined) return { rule, old: oldOf(need, null, notes) };
  const demand: RoomDemand = { terms: terms.length > 0 ? terms : [{ basis: 'room', value: 0 }] };
  if (minimum !== undefined) demand.minimum = oldInNeedUnit(minimum, need.kind, unit);
  return { rule, old: oldOf(need, demand, notes) };
}

function toPlacementRule(value: unknown): { rule: PlacementRule; old: OldRuleNumbers | null } | null {
  const v = rec(value);
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null;
  const layout = rec(v.layout);
  // The Coverage layout of Phase 6 is now the By coverage calculation with the Even spread layout.
  const oldCoverageLayout = layout.strategy === 'coverage';
  const rule: PlacementRule = {
    id: v.id,
    name: v.name,
    discipline: DISCIPLINES.includes(v.discipline as Discipline) ? (v.discipline as Discipline) : 'other',
    roomTypeIds: Array.isArray(v.roomTypeIds) ? v.roomTypeIds.filter((id): id is string => typeof id === 'string') : [],
    stampDefinitionId: typeof v.stampDefinitionId === 'string' && v.stampDefinitionId ? v.stampDefinitionId : null,
    countBy: 'need',
    coverage: toCoverageLimits(v.coverage),
    layout: {
      strategy: oldCoverageLayout ? 'evenSpread' : STRATEGIES.includes(layout.strategy as LayoutStrategy) ? (layout.strategy as LayoutStrategy) : 'center',
      wallOffsetM: num(layout.wallOffsetM) ?? 0,
      rotation: layout.rotation === 'fixed' ? 'fixed' : 'room',
    },
    writeCapacity: v.writeCapacity === true,
  };
  if (typeof v.nameContains === 'string' && v.nameContains.trim()) rule.nameContains = v.nameContains;
  const angle = num(layout.fixedAngleDeg);
  if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  const minSpacing = num(layout.minSpacingM);
  if (minSpacing !== undefined) rule.layout.minSpacingM = minSpacing;
  if (GRID_STYLES.includes(layout.gridStyle as GridStyle) && layout.gridStyle !== 'spread') rule.layout.gridStyle = layout.gridStyle as GridStyle;
  if (layout.edge === 'wall') rule.layout.edge = 'wall';
  const ceilingGrid = num(layout.ceilingGridMm);
  if (ceilingGrid !== undefined) rule.layout.ceilingGridMm = ceilingGrid;
  withNumbers(rule, v, ['minCount', 'maxCount']);
  let result: { rule: PlacementRule; old: OldRuleNumbers | null } | null;
  if (COUNT_MODES.includes(v.countBy as PlacementCountMode)) {
    rule.countBy = v.countBy as PlacementCountMode;
    if (typeof v.needId === 'string' && v.needId && rule.countBy === 'need') rule.needId = v.needId;
    if (typeof v.unit === 'string' && v.unit) rule.unit = v.unit;
    const luminaire = toLuminaire(v.luminaire);
    if (luminaire) rule.luminaire = luminaire;
    withNumbers(rule, v, ['capacityPerElement', 'perRoomCount']);
    result = { rule, old: null };
  } else result = fromOldRule(v, rule, oldCoverageLayout);
  if (!result) return null;
  if (v.alsoCoverage === true && result.rule.countBy !== 'coverage') result.rule.alsoCoverage = true;
  return validatePlacementRule(result.rule, []) === null ? result : null;
}

/**
 * Reads a stored or imported list of rules. Unreadable or invalid entries and repeated ids are left out. Null when `raw` is not a list.
 * Older rules are migrated: the old coverage field names, the Coverage layout (now Even spread; By coverage when the rule has no amount),
 * and the rules before room-type-calculations.md (§3.5): their calculation goes, and their own numbers come back in `oldNumbers`.
 */
export function parsePlacementRules(raw: unknown): { rules: PlacementRule[]; oldNumbers: OldRuleNumbers[] } | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const rules: PlacementRule[] = [];
  const oldNumbers: OldRuleNumbers[] = [];
  for (const entry of raw) {
    const parsed = toPlacementRule(entry);
    if (!parsed || ids.has(parsed.rule.id)) continue;
    ids.add(parsed.rule.id);
    rules.push(parsed.rule);
    if (parsed.old) oldNumbers.push(parsed.old);
  }
  return { rules, oldNumbers };
}

/** True when a stored list holds a rule of the shape before room-type-calculations.md (it has no `countBy`). */
export const hasOldPlacementRules = (raw: unknown): boolean => Array.isArray(raw) && raw.some((r) => r && typeof r === 'object' && !('countBy' in r));

/**
 * Moves the own numbers of old rules to the room types (room-type-calculations.md §4 question 11):
 * each room type of the rule (every type when the rule has none) that does not have the need yet
 * gets the numbers as its demand. A rule without room types that chose rooms by a text of the name
 * gives the numbers only to the room type whose keywords match that text. A type that has the need
 * keeps its own numbers. A new own need is added to `needs`. The report says what happened, one
 * line for each rule. A rule without own numbers moves nothing: its line gives only the notes.
 */
export function moveOldRuleNumbers<T extends { id: string; name: string; keywords?: readonly string[]; demands?: RoomDemands }>(
  types: readonly T[],
  needs: readonly RoomNeed[],
  oldNumbers: readonly OldRuleNumbers[],
): { types: T[]; needs: RoomNeed[]; report: string[] } {
  const nextTypes = types.map((t) => ({ ...t }));
  const nextNeeds = [...needs];
  const report: string[] = [];
  for (const entry of oldNumbers) {
    if (entry.need.own && !nextNeeds.some((n) => n.id === entry.need.id)) nextNeeds.push(entry.need);
    const demand = entry.demand;
    if (!demand) {
      report.push([`${entry.ruleName}: now serves ${entry.need.name}${entry.need.own ? ' (a new own need)' : ''}.`, ...entry.notes].join(' '));
      continue;
    }
    const nameText = entry.roomTypeIds.length === 0 ? entry.nameContains?.trim() : undefined;
    const byName = nameText ? matchRoomType(nameText, undefined, nextTypes.map((t) => ({ id: t.id, name: t.name, keywords: [...(t.keywords ?? [])] }))) : null;
    const targets = nextTypes.filter((t) => (nameText ? t.id === byName?.id : entry.roomTypeIds.length === 0 || entry.roomTypeIds.includes(t.id)));
    const moved: string[] = [];
    const kept: string[] = [];
    for (const type of targets) {
      if (type.demands?.[entry.need.id]) {
        kept.push(type.name);
        continue;
      }
      type.demands = { ...type.demands, [entry.need.id]: { ...demand, terms: demand.terms.map((t) => ({ ...t })) } };
      moved.push(type.name);
    }
    const parts = [
      `${entry.ruleName}: now serves ${entry.need.name}${entry.need.own ? ' (a new own need)' : ''}.`,
      moved.length > 0 ? `Its numbers moved to ${moved.join(', ')}.` : 'Its numbers moved to no room type.',
      kept.length > 0 ? `${kept.join(', ')} kept ${kept.length === 1 ? 'its' : 'their'} own numbers.` : '',
      nameText ? (byName ? `The rule chose rooms with "${nameText}" in the name: only ${byName.name} matches this text.` : `The rule chose rooms with "${nameText}" in the name, and no room type matches this text.`) : '',
      entry.roomTypeIds.length === 0 ? 'Rooms without a room type no longer get stamps from this rule.' : '',
      ...entry.notes,
    ];
    report.push(parts.filter(Boolean).join(' '));
  }
  return { types: nextTypes, needs: nextNeeds, report };
}

const layout = (strategy: LayoutStrategy, wallOffsetM = 0.5): PlacementLayout => ({ strategy, wallOffsetM, rotation: 'room' });

/**
 * Example rules that MepApp ships. Their numbers are examples, not a standard: the user must check
 * them against the rules of the country. The room types give the needs (ROOM_TYPE_DEMAND_EXAMPLES).
 */
export const PLACEMENT_RULE_EXAMPLES: readonly PlacementRule[] = [
  {
    id: 'example-supply-air',
    name: 'Supply air grille 50 dm³/s (example)',
    discipline: 'ventilation',
    roomTypeIds: [],
    stampDefinitionId: null,
    countBy: 'need',
    needId: 'supplyAir',
    capacityPerElement: 50,
    unit: 'dm³/s',
    coverage: {},
    layout: layout('grid'),
    writeCapacity: true,
  },
  {
    id: 'example-toilet-exhaust',
    name: 'Return air valve toilet (example)',
    discipline: 'ventilation',
    roomTypeIds: ['toilet', 'bathroom'],
    stampDefinitionId: null,
    countBy: 'need',
    needId: 'returnAir',
    unit: 'dm³/s',
    coverage: {},
    minCount: 1,
    maxCount: 1,
    layout: layout('center', 0),
    writeCapacity: true,
  },
  {
    id: 'example-air-changes',
    name: 'Return air grille technical room 300 m³/h (example)',
    discipline: 'ventilation',
    roomTypeIds: ['technical'],
    stampDefinitionId: null,
    countBy: 'need',
    needId: 'returnAir',
    capacityPerElement: 300,
    unit: 'm³/h',
    coverage: {},
    layout: layout('grid'),
    writeCapacity: true,
  },
  {
    id: 'example-lighting',
    name: 'Luminaire 3600 lm (example)',
    discipline: 'electrical',
    roomTypeIds: ['office', 'meeting', 'classroom'],
    stampDefinitionId: null,
    countBy: 'need',
    needId: 'light',
    capacityPerElement: 3600,
    luminaire: { utilisationFactor: 0.6, maintenanceFactor: 0.8 },
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
    countBy: 'coverage',
    coverage: { maxAreaPerElement: 60, maxRadius: 5.8 },
    layout: layout('evenSpread'),
    writeCapacity: false,
  },
];
