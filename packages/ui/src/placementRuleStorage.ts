import { hasOldPlacementRules, parsePlacementRules, PLACEMENT_RULE_EXAMPLES, type PlacementRule } from '@mepapp/core';
import type { StorageLike } from './schematicTemplateStorage.js';

// Per-installation user library of placement rules (room-auto-placement.md Phase 3). Moves to SettingsStore when that store is wired up.

export const PLACEMENT_RULES_STORAGE_KEY = 'mepapp.placementRules.v1';

const examplesCopy = (): PlacementRule[] => JSON.parse(JSON.stringify(PLACEMENT_RULE_EXAMPLES)) as PlacementRule[];

/** The copy of the rules before room-type-calculations.md, written once before the first save in the new shape. */
export const PLACEMENT_RULES_BACKUP_KEY = 'mepapp.placementRules.v1.before-needs';

/** The stored rules. The example rules when nothing is stored yet or the stored value is unreadable. An empty stored list stays empty. A stored list of the old shape is copied once to PLACEMENT_RULES_BACKUP_KEY. */
export function loadPlacementRules(storage: StorageLike | undefined): PlacementRule[] {
  try {
    const raw = storage?.getItem(PLACEMENT_RULES_STORAGE_KEY);
    if (!raw) return examplesCopy();
    const value: unknown = JSON.parse(raw);
    if (hasOldPlacementRules(value) && !storage?.getItem(PLACEMENT_RULES_BACKUP_KEY)) storage?.setItem(PLACEMENT_RULES_BACKUP_KEY, raw);
    return parsePlacementRules(value)?.rules ?? examplesCopy();
  } catch {
    return examplesCopy();
  }
}

export function savePlacementRules(storage: StorageLike | undefined, rules: readonly PlacementRule[]): void {
  try {
    storage?.setItem(PLACEMENT_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Storage can be full or blocked; the rules then last only for this session.
  }
}

/** A new copy of the example rules (Add the example rules). */
export const examplePlacementRules = examplesCopy;

export const UNCHECKED_RULES_STORAGE_KEY = 'mepapp.placementRules.unchecked.v1';

/** The ids of the rules that Place all does not use. A rule that is not in the list is checked. */
export function loadUncheckedRuleIds(storage: StorageLike | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(UNCHECKED_RULES_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveUncheckedRuleIds(storage: StorageLike | undefined, ids: readonly string[]): void {
  try {
    storage?.setItem(UNCHECKED_RULES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be full or blocked; the checkboxes then last only for this session.
  }
}
