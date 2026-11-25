import { describe, expect, it } from 'vitest';
import { commonNoSourceState, commonSourceWord, noSourceHintOf, sourceWordOf, NEUTRAL_SOURCE_WORD } from './sourceWord.js';

describe('noSourceHintOf', () => {
  it('gives the full Hint A for the neutral source word', () => {
    expect(noSourceHintOf('highest', NEUTRAL_SOURCE_WORD)).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place source equipment to set the source.',
    );
  });

  it('gives the full Hint L for the neutral source word', () => {
    expect(noSourceHintOf('loop', NEUTRAL_SOURCE_WORD)).toBe(
      'This network has a loop and no source. The numbers use one start point. Place source equipment to set the source.',
    );
  });
});

describe('sourceWordOf', () => {
  it('gives the same word for every network type, a drain included, and for an unknown type', () => {
    const types = [
      { id: 'vent', discipline: 'ventilation' as const },
      { id: 'hvac', discipline: 'heatingAndCooling' as const },
      { id: 'x', discipline: 'plumbing' as const },
      { id: 'elec', discipline: 'electrical' as const },
      { id: 'fire', discipline: 'fireProtection' as const },
      { id: 'other', discipline: 'other' as const },
      { id: 'sanitary-waste', discipline: 'plumbing' as const },
    ];
    for (const type of types) {
      expect(sourceWordOf(type)).toBe('source equipment');
    }
    expect(sourceWordOf(undefined)).toBe('source equipment');
    expect(commonSourceWord(types)).toBe('source equipment');
    expect(NEUTRAL_SOURCE_WORD).toBe('source equipment');
  });
});

describe('commonSourceWord', () => {
  it('gives the word when all types have one discipline', () => {
    expect(
      commonSourceWord([
        { id: 'a', discipline: 'ventilation' },
        { id: 'b', discipline: 'ventilation' },
      ]),
    ).toBe('source equipment');
  });

  it('gives the same word for two disciplines', () => {
    expect(
      commonSourceWord([
        { id: 'a', discipline: 'ventilation' },
        { id: 'b', discipline: 'electrical' },
      ]),
    ).toBe('source equipment');
  });

  it('gives the same word for a drain and a plain plumbing type', () => {
    expect(
      commonSourceWord([
        { id: 'sanitary-waste', discipline: 'plumbing' },
        { id: 'x', discipline: 'plumbing' },
      ]),
    ).toBe('source equipment');
  });

  it('gives the same word for an empty list', () => {
    expect(commonSourceWord([])).toBe('source equipment');
  });
});

describe('commonNoSourceState', () => {
  it('gives highest when all items are highest', () => {
    expect(commonNoSourceState([{ solvedNoSource: 'highest' }, { solvedNoSource: 'highest' }])).toBe('highest');
  });

  it('gives loop when all items are loop', () => {
    expect(commonNoSourceState([{ solvedNoSource: 'loop' }, { solvedNoSource: 'loop' }])).toBe('loop');
  });

  it('gives undefined for a mixed set', () => {
    expect(commonNoSourceState([{ solvedNoSource: 'highest' }, { solvedNoSource: 'loop' }])).toBeUndefined();
  });

  it('gives undefined when one item has no state', () => {
    expect(commonNoSourceState([{ solvedNoSource: 'highest' }, {}])).toBeUndefined();
  });

  it('gives undefined for an empty list', () => {
    expect(commonNoSourceState([])).toBeUndefined();
  });
});
