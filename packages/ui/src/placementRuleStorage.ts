import { hasOldPlacementRules, moveOldRuleNumbers, parsePlacementRules, PLACEMENT_RULE_EXAMPLES, type PlacementRule } from '@mepapp/core';
import { loadRoomNeeds, ROOM_NEEDS_STORAGE_KEY } from './roomNeedStorage.js';
import { loadRoomTypes, ROOM_TYPES_STORAGE_KEY } from './roomTypeStorage.js';
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
    if (hasOldPlacementRules(value) && !storage?.getItem(PLACEMENT_RULES_BACKUP_KEY)) write(storage, PLACEMENT_RULES_BACKUP_KEY, raw);
    return parsePlacementRules(value)?.rules ?? examplesCopy();
  } catch {
    return examplesCopy();
  }
}

/** The report of the one-time move of the old rule numbers, shown in Auto-place until the user closes it. */
export const RULE_MOVE_REPORT_KEY = 'mepapp.placementRules.moveReport.v1';

/** Writes one value; false when the storage refuses it (full or blocked). */
function write(storage: StorageLike | undefined, key: string, value: string): boolean {
  try {
    storage?.setItem(key, value);
    return storage?.getItem(key) === value;
  } catch {
    return false;
  }
}

/** The first line of the report when the move could not write to the storage. */
export const RULE_MOVE_FAILED =
  'MepApp could not move the numbers of your placement rules to the room types: the storage of this browser is full. Your stored rules stay as they are, and MepApp tries again at the next start. Until then, MepApp does not keep changes to the rules.';

/**
 * Moves the own numbers of stored rules of the old shape to the stored room types, once
 * (room-type-calculations.md §4 question 11). It writes the backup of the old rules, then the room
 * types and the own needs, then the rules in the new shape, then the report. When a write fails, it
 * stops: the stored old rules stay (they hold the numbers until the room types have them), and the
 * report says so. It does nothing when the stored rules are not old, so a second call is safe.
 * Returns the report, or null.
 */
export function moveStoredOldRules(storage: StorageLike | undefined): string[] | null {
  let raw: string | null | undefined;
  let value: unknown;
  try {
    raw = storage?.getItem(PLACEMENT_RULES_STORAGE_KEY);
    if (!storage || !raw) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!hasOldPlacementRules(value)) return null;
  const parsed = parsePlacementRules(value);
  if (!parsed) return null;
  const moved = moveOldRuleNumbers(loadRoomTypes(storage), loadRoomNeeds(storage), parsed.oldNumbers);
  const written =
    (storage.getItem(PLACEMENT_RULES_BACKUP_KEY) !== null || write(storage, PLACEMENT_RULES_BACKUP_KEY, raw)) &&
    write(storage, ROOM_TYPES_STORAGE_KEY, JSON.stringify(moved.types)) &&
    write(storage, ROOM_NEEDS_STORAGE_KEY, JSON.stringify(moved.needs)) &&
    write(storage, PLACEMENT_RULES_STORAGE_KEY, JSON.stringify(parsed.rules));
  if (!written) return [RULE_MOVE_FAILED];
  const report = [
    `MepApp changed ${parsed.rules.length === 1 ? 'your placement rule' : `your ${parsed.rules.length} placement rules`}: the room types now hold the calculations. A copy of the old rules is in this browser (${PLACEMENT_RULES_BACKUP_KEY}).`,
    ...moved.report,
  ];
  write(storage, RULE_MOVE_REPORT_KEY, JSON.stringify(report));
  return report;
}

/** The report of the move, or null when there is none (or the user closed it). */
export function loadRuleMoveReport(storage: StorageLike | undefined): string[] | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RULE_MOVE_REPORT_KEY) ?? 'null');
    return Array.isArray(value) && value.length > 0 ? value.filter((line): line is string => typeof line === 'string') : null;
  } catch {
    return null;
  }
}

export function clearRuleMoveReport(storage: StorageLike | undefined): void {
  try {
    storage?.setItem(RULE_MOVE_REPORT_KEY, '[]');
  } catch {
    // Storage can be blocked; the report then shows again at the next start.
  }
}

/** Saves the rules. It does not write over stored rules of the old shape: their numbers did not move yet (moveStoredOldRules failed). */
export function savePlacementRules(storage: StorageLike | undefined, rules: readonly PlacementRule[]): void {
  try {
    const raw = storage?.getItem(PLACEMENT_RULES_STORAGE_KEY);
    if (raw && hasOldPlacementRules(JSON.parse(raw))) return;
  } catch {
    // An unreadable stored value holds nothing to keep.
  }
  write(storage, PLACEMENT_RULES_STORAGE_KEY, JSON.stringify(rules));
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
