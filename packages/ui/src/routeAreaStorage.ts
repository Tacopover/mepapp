import { DEFAULT_ROUTE_AREA_TYPE_IDS } from '@mepapp/core';
import type { StorageLike } from './schematicTemplateStorage.js';

// Per-installation list of the room types that the route area counts as route room types.

export const ROUTE_ROOM_TYPES_STORAGE_KEY = 'mepapp.routeRoomTypes.v1';

/** The ids of the room types that the route area uses. The default ids when nothing is stored or the stored value is not a list. An empty stored list stays empty. */
export function loadRouteRoomTypeIds(storage: StorageLike | undefined): string[] {
  try {
    const raw = storage?.getItem(ROUTE_ROOM_TYPES_STORAGE_KEY);
    if (raw === null || raw === undefined) return [...DEFAULT_ROUTE_AREA_TYPE_IDS];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [...DEFAULT_ROUTE_AREA_TYPE_IDS];
    const ids = value.filter((id): id is string => typeof id === 'string');
    return [...new Set(ids)];
  } catch {
    return [...DEFAULT_ROUTE_AREA_TYPE_IDS];
  }
}

export function saveRouteRoomTypeIds(storage: StorageLike | undefined, ids: readonly string[]): void {
  try {
    storage?.setItem(ROUTE_ROOM_TYPES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be full or blocked; the list then lasts only for this session.
  }
}
