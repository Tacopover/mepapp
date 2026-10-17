import { describe, expect, it } from 'vitest';
import { PIPE_DN_SERIES_MM, ROUND_DUCT_SERIES_MM, nextSize, roundUpTo } from './index.js';

describe('ROUND_DUCT_SERIES_MM', () => {
  it('is strictly increasing from 63 to 1250 with 14 entries', () => {
    expect(ROUND_DUCT_SERIES_MM).toHaveLength(14);
    expect(ROUND_DUCT_SERIES_MM[0]).toBe(63);
    expect(ROUND_DUCT_SERIES_MM[ROUND_DUCT_SERIES_MM.length - 1]).toBe(1250);
    ROUND_DUCT_SERIES_MM.slice(1).forEach((size, index) => {
      expect(size).toBeGreaterThan(ROUND_DUCT_SERIES_MM[index]);
    });
  });
});

describe('PIPE_DN_SERIES_MM', () => {
  it('is strictly increasing with 14 entries', () => {
    expect(PIPE_DN_SERIES_MM).toHaveLength(14);
    PIPE_DN_SERIES_MM.slice(1).forEach((size, index) => {
      expect(size).toBeGreaterThan(PIPE_DN_SERIES_MM[index]);
    });
  });
});

describe('nextSize', () => {
  it('returns the first size at least the minimum', () => {
    expect(nextSize(ROUND_DUCT_SERIES_MM, 200)).toBe(200);
    expect(nextSize(ROUND_DUCT_SERIES_MM, 201)).toBe(250);
    expect(nextSize(ROUND_DUCT_SERIES_MM, 0)).toBe(63);
  });

  it('returns null when the series ends below the minimum', () => {
    expect(nextSize(ROUND_DUCT_SERIES_MM, 1251)).toBeNull();
  });
});

describe('roundUpTo', () => {
  it('rounds up to the next multiple of the step', () => {
    expect(roundUpTo(201, 10)).toBe(210);
    expect(roundUpTo(200, 10)).toBe(200);
    expect(roundUpTo(0.0001, 50)).toBe(50);
  });
});
