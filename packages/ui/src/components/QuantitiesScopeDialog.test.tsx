import { describe, expect, it } from 'vitest';
import { effectiveKind, effectiveLevelId } from './QuantitiesScopeDialog.js';

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

describe('effectiveKind', () => {
  it('keeps every kind when the building is enabled', () => {
    expect(effectiveKind('sheet', false)).toBe('sheet');
    expect(effectiveKind('document', false)).toBe('document');
    expect(effectiveKind('level', false)).toBe('level');
    expect(effectiveKind('building', false)).toBe('building');
  });

  it('gives document for Level and Building when the building is disabled', () => {
    expect(effectiveKind('level', true)).toBe('document');
    expect(effectiveKind('building', true)).toBe('document');
  });

  it('keeps Sheet and Document when the building is disabled', () => {
    expect(effectiveKind('sheet', true)).toBe('sheet');
    expect(effectiveKind('document', true)).toBe('document');
  });
});
