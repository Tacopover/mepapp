import { describe, expect, it } from 'vitest';
import { RISER_ARROW_PICTOGRAMS, isRiserArrowPair, riserPictogramOf, type RiserArrowPair } from './riser.js';

describe('RISER_ARROW_PICTOGRAMS', () => {
  it('has 8 entries numbered 1 to 8 in order', () => {
    expect(RISER_ARROW_PICTOGRAMS).toHaveLength(8);
    expect(RISER_ARROW_PICTOGRAMS.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('has 8 different pairs', () => {
    const keys = new Set(RISER_ARROW_PICTOGRAMS.map((p) => `${p.below}/${p.above}`));
    expect(keys.size).toBe(8);
  });

  it('does not contain the pair (none, none)', () => {
    expect(RISER_ARROW_PICTOGRAMS.some((p) => p.below === 'none' && p.above === 'none')).toBe(false);
  });

  it('has the exact pairs of the plan, as below/above', () => {
    expect(RISER_ARROW_PICTOGRAMS.map((p) => [p.number, p.below, p.above])).toEqual([
      [1, 'up', 'up'],
      [2, 'none', 'up'],
      [3, 'up', 'none'],
      [4, 'down', 'down'],
      [5, 'none', 'down'],
      [6, 'down', 'none'],
      [7, 'down', 'up'],
      [8, 'up', 'down'],
    ]);
  });
});

describe('riserPictogramOf', () => {
  it('gives back the own number of each table entry', () => {
    for (const entry of RISER_ARROW_PICTOGRAMS) {
      expect(riserPictogramOf({ below: entry.below, above: entry.above })).toBe(entry.number);
    }
  });

  it('gives null for the pair (none, none)', () => {
    expect(riserPictogramOf({ below: 'none', above: 'none' })).toBeNull();
  });
});

describe('isRiserArrowPair', () => {
  it('is true for the nine pairs of the directions up, down and none', () => {
    const dirs = ['up', 'down', 'none'] as const;
    for (const below of dirs) {
      for (const above of dirs) {
        const pair: RiserArrowPair = { below, above };
        expect(isRiserArrowPair(pair)).toBe(true);
      }
    }
  });

  it('is false for values that are not a pair', () => {
    expect(isRiserArrowPair(null)).toBe(false);
    expect(isRiserArrowPair('up')).toBe(false);
    expect(isRiserArrowPair({})).toBe(false);
    expect(isRiserArrowPair({ below: 'up' })).toBe(false);
    expect(isRiserArrowPair({ below: 'up', above: 'left' })).toBe(false);
    expect(isRiserArrowPair({ below: 1, above: 'up' })).toBe(false);
    expect(isRiserArrowPair(['up', 'down'])).toBe(false);
  });

  it('allows extra keys', () => {
    expect(isRiserArrowPair({ below: 'up', above: 'none', extra: true })).toBe(true);
  });
});
