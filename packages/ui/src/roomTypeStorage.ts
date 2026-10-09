import { parseRoomTypes, ROOM_TYPE_LIBRARY, type RoomType } from '@mepapp/core';
import type { StorageLike } from './schematicTemplateStorage.js';

// Per-installation user library of room types (room-auto-placement.md Phase 1). Moves to SettingsStore when that store is wired up.

export const ROOM_TYPES_STORAGE_KEY = 'mepapp.roomTypes.v1';

const builtInCopy = (): RoomType[] => ROOM_TYPE_LIBRARY.map((t) => ({ ...t, keywords: [...t.keywords] }));

/** The stored room types. The built-in list when nothing is stored yet or the stored value is unreadable. An empty stored list stays empty. */
export function loadRoomTypes(storage: StorageLike | undefined): RoomType[] {
  try {
    const raw = storage?.getItem(ROOM_TYPES_STORAGE_KEY);
    if (!raw) return builtInCopy();
    return parseRoomTypes(JSON.parse(raw)) ?? builtInCopy();
  } catch {
    return builtInCopy();
  }
}

export function saveRoomTypes(storage: StorageLike | undefined, types: readonly RoomType[]): void {
  try {
    storage?.setItem(ROOM_TYPES_STORAGE_KEY, JSON.stringify(types));
  } catch {
    // Storage can be full or blocked; the room types then last only for this session.
  }
}
