// Undo/redo over immutable snapshots for the schematic template editor. Pure: the editor keeps
// the returned object in React state.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** The key of the last commit, while its gesture is still open. */
  gestureKey: string | null;
}

export const MAX_HISTORY = 100;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [], gestureKey: null };
}

/** A commit with the same non-null key as the one before it replaces the present, so one drag or one typed field is one undo step. */
export function commit<T>(history: History<T>, next: T, gestureKey: string | null = null): History<T> {
  if (next === history.present) return history;
  if (gestureKey !== null && gestureKey === history.gestureKey) return { ...history, present: next, future: [] };
  return { past: [...history.past, history.present].slice(-MAX_HISTORY), present: next, future: [], gestureKey };
}

/** Closes the open gesture, so the next commit with the same key starts a new undo step. */
export function endGesture<T>(history: History<T>): History<T> {
  return history.gestureKey === null ? history : { ...history, gestureKey: null };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future], gestureKey: null };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1), gestureKey: null };
}
