// Units of the placement rules (room-placement-guide.md A5). Room geometry stays in metres; MepApp
// converts only where a rule multiplies a room value: floor area, room volume, lighting area and
// the coverage lengths. The amount unit itself is a label: the capacity per stamp uses the same unit.

/** 1 ft in m (exact). */
export const M_PER_FT = 0.3048;
/** 1 ft² in m² (exact). */
export const M2_PER_FT2 = M_PER_FT * M_PER_FT;
/** 1 cfm in m³/h. */
export const M3H_PER_CFM = 1.69901082;
/** 1 dm³/s (= 1 l/s) in m³/h. */
export const M3H_PER_DM3S = 3.6;

export type AreaUnit = 'm2' | 'ft2';
export type LengthUnit = 'm' | 'ft';
export type IlluminanceUnit = 'lx' | 'fc';

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = { m2: 'm²', ft2: 'ft²' };
export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = { m: 'm', ft: 'ft' };
export const ILLUMINANCE_UNIT_LABELS: Record<IlluminanceUnit, string> = { lx: 'lx', fc: 'fc' };

/** The amount units the UI lists. A rule can also hold free text (an older rule, or "Other"). */
export const AMOUNT_UNITS: readonly string[] = ['dm³/s', 'l/s', 'm³/h', 'm³/s', 'cfm', 'W', 'kW'];

/** The flow units of an air-changes rule: one m³/h in each unit. */
export const AIR_CHANGE_UNITS: Readonly<Record<string, number>> = {
  'm³/h': 1,
  'dm³/s': 1 / M3H_PER_DM3S,
  'l/s': 1 / M3H_PER_DM3S,
  'm³/s': 1 / 3600,
  cfm: 1 / M3H_PER_CFM,
};

/** True when the unit is in AIR_CHANGE_UNITS. */
export const isAirChangeUnit = (unit: string): boolean => Object.prototype.hasOwnProperty.call(AIR_CHANGE_UNITS, unit);

/** A floor area in m², given in the unit. */
export const areaInUnit = (m2: number, unit: AreaUnit | undefined): number => (unit === 'ft2' ? m2 / M2_PER_FT2 : m2);

/** A length of the unit, in m. */
export const lengthToM = (value: number, unit: LengthUnit | undefined): number => (unit === 'ft' ? value * M_PER_FT : value);

/** An area of the unit that goes with the length unit (m² or ft²), in m². */
export const areaToM2 = (value: number, unit: LengthUnit | undefined): number => (unit === 'ft' ? value * M2_PER_FT2 : value);

/** A flow in m³/h, given in the unit. A unit that is not a flow unit gets the number unchanged. */
export const flowInUnit = (m3h: number, unit: string): number => m3h * (isAirChangeUnit(unit) ? AIR_CHANGE_UNITS[unit]! : 1);
