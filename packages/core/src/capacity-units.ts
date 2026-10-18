import { convertFlow, isFlowUnitId, type FlowUnitId } from './flow-units.js';

/** An element with a stored capacity and the network type ids that tie it to a network: the types of its port segments and of its routing targets. */
export interface CapacityElement {
  id: string;
  typeIds: Iterable<string>;
}

/**
 * Sorts the elements that have the network type into `convertible` (the type is their only type) and
 * `mixed` (they also have another type, so a conversion of this type would be wrong for them).
 * An element without the type is in neither list.
 */
export function classifyCapacityElements(typeId: string, elements: Iterable<CapacityElement>): { convertible: string[]; mixed: string[] } {
  const convertible: string[] = [];
  const mixed: string[] = [];
  for (const element of elements) {
    const types = new Set(element.typeIds);
    if (!types.has(typeId)) continue;
    if (types.size === 1) convertible.push(element.id);
    else mixed.push(element.id);
  }
  return { convertible, mixed };
}

/** Why Auto-place kept the unit of the rule: no routing target has a flow unit, the targets disagree, or the unit of the target is of another kind. */
export type AutoPlaceUnitNoteReason = 'noTargetUnit' | 'targetUnitsDiffer' | 'unitKindDiffers';

export interface AutoPlaceCapacity {
  value: number;
  /** The unit of `value`: the flow unit of the routing targets, or the unit of the rule when it was kept. */
  unit: FlowUnitId | undefined;
  /** Set when the unit of the rule was kept although the rule has a flow unit and the stamp has routing targets. */
  note?: AutoPlaceUnitNoteReason;
}

/**
 * The capacity that Auto-place stores on a stamp. The rule gives `value` in `ruleUnit`. The flow units of
 * the routing target types (`undefined` = the type has none) decide the stored unit: when all targets that
 * have a unit agree and the unit is of the kind of the rule unit, the value is converted to it. Otherwise the
 * value and the rule unit stay, and `note` says why. A stamp with no routing targets has no note.
 */
export function resolveAutoPlaceCapacity(value: number, ruleUnit: unknown, targetUnits: readonly (FlowUnitId | undefined)[]): AutoPlaceCapacity {
  if (!isFlowUnitId(ruleUnit)) return { value, unit: undefined };
  if (targetUnits.length === 0) return { value, unit: ruleUnit };
  const units = [...new Set(targetUnits.filter((unit): unit is FlowUnitId => unit !== undefined))];
  if (units.length === 0) return { value, unit: ruleUnit, note: 'noTargetUnit' };
  if (units.length > 1) return { value, unit: ruleUnit, note: 'targetUnitsDiffer' };
  const converted = convertFlow(value, ruleUnit, units[0]);
  if (converted === null) return { value, unit: ruleUnit, note: 'unitKindDiffers' };
  return { value: converted, unit: units[0] };
}
