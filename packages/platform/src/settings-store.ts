import type { BaseStore } from './store.js';

export interface SettingsStore extends BaseStore {
  /** Keys must pass assertStorageKey; values are opaque JSON strings. */
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}
