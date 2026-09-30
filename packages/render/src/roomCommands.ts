import type { Command, Room } from '@mepapp/core';
import type { DrawingState } from './document.js';

function withoutKeys<T>(record: Record<string, T>, keys: readonly string[]): Record<string, T> {
  const rest = { ...record };
  for (const key of keys) delete rest[key];
  return rest;
}

const byId = (rooms: readonly Room[]): Record<string, Room> => Object.fromEntries(rooms.map((r) => [r.id, r]));

export function createRoomCommand(room: Room): Command<DrawingState> {
  return replaceRoomsCommand(`Create room ${room.id}`, [], [room]);
}

export function deleteRoomsCommand(rooms: readonly Room[]): Command<DrawingState> {
  return replaceRoomsCommand(rooms.length === 1 ? `Delete room ${rooms[0]!.id}` : `Delete ${rooms.length} rooms`, rooms, []);
}

/** One room changes: `before` is the room as it was, `after` as it becomes (same id). */
export function updateRoomCommand(before: Room, after: Room): Command<DrawingState> {
  return {
    description: `Edit room ${before.id}`,
    execute: (state) => ({ ...state, rooms: { ...state.rooms, [after.id]: after } }),
    undo: (state) => ({ ...state, rooms: { ...state.rooms, [before.id]: before } }),
  };
}

/** Removes some rooms and adds others as ONE undo step (re-running detect-all on a page). */
export function replaceRoomsCommand(description: string, remove: readonly Room[], add: readonly Room[]): Command<DrawingState> {
  return {
    description,
    execute: (state) => ({ ...state, rooms: { ...withoutKeys(state.rooms, remove.map((r) => r.id)), ...byId(add) } }),
    undo: (state) => ({ ...state, rooms: { ...withoutKeys(state.rooms, add.map((r) => r.id)), ...byId(remove) } }),
  };
}
