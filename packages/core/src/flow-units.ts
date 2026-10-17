import { AIR_CHANGE_UNITS } from './rooms/placement-units.js';

// Units of a flow (volume per time, or power). The base of a volume unit is m³/s, the base of a power unit is W.

export type FlowUnitKind = 'volume' | 'power';
export type FlowUnitId = 'dm³/s' | 'l/s' | 'm³/s' | 'm³/h' | 'cfm' | 'l/min' | 'US gpm' | 'W' | 'kW';

export interface FlowUnit {
  id: FlowUnitId;
  kind: FlowUnitKind;
  /** Value of 1 unit in m³/s (volume) or in W (power). */
  base: number;
}

/** One US gallon in l. */
const L_PER_US_GAL = 3.785411784;

export const FLOW_UNITS: readonly FlowUnit[] = [
  { id: 'dm³/s', kind: 'volume', base: 1 / (3600 * AIR_CHANGE_UNITS['dm³/s']) },
  { id: 'l/s', kind: 'volume', base: 1 / (3600 * AIR_CHANGE_UNITS['l/s']) },
  { id: 'm³/s', kind: 'volume', base: 1 / (3600 * AIR_CHANGE_UNITS['m³/s']) },
  { id: 'm³/h', kind: 'volume', base: 1 / (3600 * AIR_CHANGE_UNITS['m³/h']) },
  { id: 'cfm', kind: 'volume', base: 1 / (3600 * AIR_CHANGE_UNITS.cfm) },
  { id: 'l/min', kind: 'volume', base: 1 / 60000 },
  { id: 'US gpm', kind: 'volume', base: L_PER_US_GAL / 1000 / 60 },
  { id: 'W', kind: 'power', base: 1 },
  { id: 'kW', kind: 'power', base: 1000 },
];

/** True when the value is the id of a flow unit in FLOW_UNITS. */
export const isFlowUnitId = (value: unknown): value is FlowUnitId =>
  typeof value === 'string' && FLOW_UNITS.some((unit) => unit.id === value);

/** The flow unit with the id. Throws when the id is not in FLOW_UNITS. */
export function flowUnitOf(id: FlowUnitId): FlowUnit {
  const unit = FLOW_UNITS.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`Unknown flow unit: ${id}`);
  return unit;
}

/** The value in the base unit of its kind (m³/s or W). */
export function toBaseFlow(value: number, unit: FlowUnitId): number {
  return value * flowUnitOf(unit).base;
}

/** The value in another unit of the same kind, or null when the kinds differ. */
export function convertFlow(value: number, from: FlowUnitId, to: FlowUnitId): number | null {
  const source = flowUnitOf(from);
  const target = flowUnitOf(to);
  if (source.kind !== target.kind) return null;
  return (value * source.base) / target.base;
}
