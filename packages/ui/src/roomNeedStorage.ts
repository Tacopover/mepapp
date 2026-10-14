import { parseRoomNeeds, type RoomNeed } from '@mepapp/core';
import type { StorageLike } from './schematicTemplateStorage.js';

// Per-installation own needs of the user (room-type-calculations.md §3.4). The built-in needs are in core.

export const ROOM_NEEDS_STORAGE_KEY = 'mepapp.roomNeeds.v1';

/** The stored own needs. None when nothing is stored yet or the stored value is unreadable. */
export function loadRoomNeeds(storage: StorageLike | undefined): RoomNeed[] {
  try {
    const raw = storage?.getItem(ROOM_NEEDS_STORAGE_KEY);
    return raw ? (parseRoomNeeds(JSON.parse(raw)) ?? []) : [];
  } catch {
    return [];
  }
}

export function saveRoomNeeds(storage: StorageLike | undefined, needs: readonly RoomNeed[]): void {
  try {
    storage?.setItem(ROOM_NEEDS_STORAGE_KEY, JSON.stringify(needs));
  } catch {
    // Storage can be full or blocked; the needs then last only for this session.
  }
}
