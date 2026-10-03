import { describe, expect, it } from 'vitest';
import { assertStorageKey, STORAGE_KEY_PREFIX } from './keys.js';

describe('assertStorageKey', () => {
  it('accepts a key with the prefix', () => {
    expect(() => assertStorageKey(`${STORAGE_KEY_PREFIX}x`)).not.toThrow();
  });

  it('throws for a key without the prefix', () => {
    expect(() => assertStorageKey('x')).toThrow();
  });
});
