import { describe, expect, it } from 'vitest';
import { effectiveLevelId } from './QuantitiesScopeDialog.js';

describe('effectiveLevelId', () => {
  const levels = [{ id: 'l1' }, { id: 'l2' }];

  it('keeps the chosen level when it still exists', () => {
    expect(effectiveLevelId(levels, 'l2')).toBe('l2');
  });

  it('falls back to the first level when the chosen level is not in the list', () => {
    expect(effectiveLevelId(levels, '')).toBe('l1');
    expect(effectiveLevelId(levels, 'gone')).toBe('l1');
  });

  it('returns an empty string when the building has no levels', () => {
    expect(effectiveLevelId([], 'l1')).toBe('');
  });
});
