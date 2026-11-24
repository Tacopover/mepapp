import { describe, expect, it } from 'vitest';
import { commonNoSourceState, commonSourceWord, noSourceHintOf, sourceWordOf, NEUTRAL_SOURCE_WORD } from './sourceWord.js';

describe('noSourceHintOf', () => {
  it('gives the full Hint A for each source word', () => {
    expect(noSourceHintOf('highest', 'an air handling unit or a fan')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place an air handling unit or a fan to set the source.',
    );
    expect(noSourceHintOf('highest', 'a pump or a boiler')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place a pump or a boiler to set the source.',
    );
    expect(noSourceHintOf('highest', 'a panel')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place a panel to set the source.',
    );
    expect(noSourceHintOf('highest', 'a pump')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place a pump to set the source.',
    );
    expect(noSourceHintOf('highest', 'an outlet or a pump')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place an outlet or a pump to set the source.',
    );
    expect(noSourceHintOf('highest', 'a source equipment')).toBe(
      'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place a source equipment to set the source.',
    );
  });

  it('gives the full Hint L for each source word', () => {
    expect(noSourceHintOf('loop', 'an air handling unit or a fan')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place an air handling unit or a fan to set the source.',
    );
    expect(noSourceHintOf('loop', 'a pump or a boiler')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place a pump or a boiler to set the source.',
    );
    expect(noSourceHintOf('loop', 'a panel')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place a panel to set the source.',
    );
    expect(noSourceHintOf('loop', 'a pump')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place a pump to set the source.',
    );
    expect(noSourceHintOf('loop', 'an outlet or a pump')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place an outlet or a pump to set the source.',
    );
    expect(noSourceHintOf('loop', 'a source equipment')).toBe(
      'This network has a loop and no source. The numbers use one start point. Place a source equipment to set the source.',
    );
  });
});

describe('sourceWordOf', () => {
  it('gives the word of each discipline', () => {
    expect(sourceWordOf({ id: 'vent', discipline: 'ventilation' })).toBe('an air handling unit or a fan');
    expect(sourceWordOf({ id: 'hvac', discipline: 'heatingAndCooling' })).toBe('a pump or a boiler');
    expect(sourceWordOf({ id: 'x', discipline: 'plumbing' })).toBe('a pump or a boiler');
    expect(sourceWordOf({ id: 'elec', discipline: 'electrical' })).toBe('a panel');
    expect(sourceWordOf({ id: 'fire', discipline: 'fireProtection' })).toBe('a pump');
    expect(sourceWordOf({ id: 'other', discipline: 'other' })).toBe('a source equipment');
  });

  it('tests a drain first', () => {
    expect(sourceWordOf({ id: 'sanitary-waste', discipline: 'plumbing' })).toBe('an outlet or a pump');
  });

  it('gives the neutral word for an unknown type', () => {
    expect(sourceWordOf(undefined)).toBe('a source equipment');
    expect(NEUTRAL_SOURCE_WORD).toBe('a source equipment');
  });
});

describe('commonSourceWord', () => {
  it('gives the word when all types have one discipline', () => {
    expect(
      commonSourceWord([
        { id: 'a', discipline: 'ventilation' },
        { id: 'b', discipline: 'ventilation' },
      ]),
    ).toBe('an air handling unit or a fan');
  });

  it('gives the neutral word for two disciplines', () => {
    expect(
      commonSourceWord([
        { id: 'a', discipline: 'ventilation' },
        { id: 'b', discipline: 'electrical' },
      ]),
    ).toBe('a source equipment');
  });

  it('gives the neutral word for a drain and a plain plumbing type', () => {
    expect(
      commonSourceWord([
        { id: 'sanitary-waste', discipline: 'plumbing' },
        { id: 'x', discipline: 'plumbing' },
      ]),
    ).toBe('a source equipment');
  });

  it('gives the neutral word for an empty list', () => {
    expect(commonSourceWord([])).toBe('a source equipment');
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
