// Units of the placement rules (room-placement-guide.md A5, room-type-calculations.md §3.3). Room
// geometry stays in metres; MepApp converts the coverage lengths (m or ft) and the flow units of a
// rule's capacity (AIR_CHANGE_UNITS). The room types hold a flow in dm³/s.

/** 1 ft in m (exact). */
export const M_PER_FT = 0.3048;
/** 1 ft² in m² (exact). */
export const M2_PER_FT2 = M_PER_FT * M_PER_FT;
/** 1 cfm in m³/h. */
export const M3H_PER_CFM = 1.69901082;
/** 1 dm³/s (= 1 l/s) in m³/h. */
export const M3H_PER_DM3S = 3.6;

export type LengthUnit = 'm' | 'ft';

export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = { m: 'm', ft: 'ft' };

/** The amount unit of an old rule that counted stamps: one stamp gave 1. An own need that MepApp makes from such a rule uses it as its unit. */
export const STAMP_COUNT_UNIT = 'stamps';

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

/** A length of the unit, in m. */
export const lengthToM = (value: number, unit: LengthUnit | undefined): number => (unit === 'ft' ? value * M_PER_FT : value);

/** An area of the unit that goes with the length unit (m² or ft²), in m². */
export const areaToM2 = (value: number, unit: LengthUnit | undefined): number => (unit === 'ft' ? value * M2_PER_FT2 : value);
