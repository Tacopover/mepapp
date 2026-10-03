import { assertStorageKey } from '../keys.js';
import type { SettingsStore } from '../settings-store.js';
import type { StoreStatus } from '../store.js';
import { MEMORY_CAPABILITIES } from './memory-capabilities.js';

export class MemorySettingsStore implements SettingsStore {
  readonly capabilities = MEMORY_CAPABILITIES;
  private readonly values = new Map<string, string>();

  async status(): Promise<StoreStatus> {
    return 'ready';
  }

  async requestAccess(): Promise<StoreStatus> {
    return 'ready';
  }

  async get(key: string): Promise<string | undefined> {
    assertStorageKey(key);
    return this.values.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    assertStorageKey(key);
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    assertStorageKey(key);
    this.values.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => prefix === undefined || key.startsWith(prefix));
  }
}
