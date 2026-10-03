export const STORAGE_KEY_PREFIX = 'mepapp.';

export function assertStorageKey(key: string): void {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    throw new Error(`Storage key "${key}" must start with "${STORAGE_KEY_PREFIX}"`);
  }
}
