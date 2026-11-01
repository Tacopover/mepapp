// Per-installation list of the buildings that the user opened most recently, newest first.

export interface RecentBuilding {
  id: string;
  name: string;
  location: string;
}

export const RECENT_BUILDINGS_KEY = 'mepapp.buildings.v2';
export const RECENT_BUILDINGS_MAX = 20;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isRecentBuilding(value: unknown): value is RecentBuilding {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Partial<RecentBuilding>;
  return typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.location === 'string';
}

/** Bad JSON, a non-array, or entries without string id/name/location give [] / drop the entry. */
export function loadRecentBuildings(storage?: StorageLike): RecentBuilding[] {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(RECENT_BUILDINGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentBuilding);
  } catch {
    return [];
  }
}

export function saveRecentBuildings(list: RecentBuilding[], storage?: StorageLike): void {
  try {
    (storage ?? globalThis.localStorage).setItem(RECENT_BUILDINGS_KEY, JSON.stringify(list));
  } catch {
    // Storage can be full or blocked; the list then lasts only for this session.
  }
}

/** Puts entry first; removes an older entry with the same id; keeps at most RECENT_BUILDINGS_MAX. Pure. */
export function addRecentBuilding(list: RecentBuilding[], entry: RecentBuilding): RecentBuilding[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, RECENT_BUILDINGS_MAX);
}

export function removeRecentBuilding(list: RecentBuilding[], id: string): RecentBuilding[] {
  return list.filter((item) => item.id !== id);
}
