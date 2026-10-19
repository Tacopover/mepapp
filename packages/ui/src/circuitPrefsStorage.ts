import type { StorageLike } from './schematicTemplateStorage.js';

// Per-installation preferences for Make circuits: the wet room types and the own-circuit threshold.

export const CIRCUIT_PREFS_STORAGE_KEY = 'mepapp.circuitPrefs.v1';
export const DEFAULT_WET_ROOM_TYPE_IDS: readonly string[] = ['toilet', 'bathroom'];
export const DEFAULT_OWN_CIRCUIT_THRESHOLD = 2000;

export interface CircuitPrefs {
  wetRoomTypeIds: string[];
  ownCircuitThreshold: number;
}

function defaultPrefs(): CircuitPrefs {
  return { wetRoomTypeIds: [...DEFAULT_WET_ROOM_TYPE_IDS], ownCircuitThreshold: DEFAULT_OWN_CIRCUIT_THRESHOLD };
}

/** The stored preferences. Each field falls back to its default when the stored value is not valid. */
export function loadCircuitPrefs(storage: StorageLike | undefined): CircuitPrefs {
  try {
    const raw = storage?.getItem(CIRCUIT_PREFS_STORAGE_KEY);
    if (raw === null || raw === undefined) return defaultPrefs();
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return defaultPrefs();
    const record = value as { wetRoomTypeIds?: unknown; ownCircuitThreshold?: unknown };
    const prefs = defaultPrefs();
    if (Array.isArray(record.wetRoomTypeIds)) {
      const ids = record.wetRoomTypeIds.filter((id): id is string => typeof id === 'string');
      prefs.wetRoomTypeIds = [...new Set(ids)];
    }
    if (typeof record.ownCircuitThreshold === 'number' && Number.isFinite(record.ownCircuitThreshold) && record.ownCircuitThreshold > 0) {
      prefs.ownCircuitThreshold = record.ownCircuitThreshold;
    }
    return prefs;
  } catch {
    return defaultPrefs();
  }
}

export function saveCircuitPrefs(storage: StorageLike | undefined, prefs: CircuitPrefs): void {
  try {
    storage?.setItem(CIRCUIT_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be full or blocked; the preferences then last only for this session.
  }
}
