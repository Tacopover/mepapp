import { ROUTE_GRAVITY_TYPE_IDS, type Discipline } from '@mepapp/core';

export type NoSourceState = 'highest' | 'loop';
export const NEUTRAL_SOURCE_WORD = 'a source equipment';

/** The words for a source, by discipline. A drain (id in ROUTE_GRAVITY_TYPE_IDS) is tested first. An unknown type gets the neutral word. */
export function sourceWordOf(type: { id: string; discipline: Discipline } | undefined): string {
  if (!type) return NEUTRAL_SOURCE_WORD;
  if (ROUTE_GRAVITY_TYPE_IDS.includes(type.id)) return 'an outlet or a pump';
  switch (type.discipline) {
    case 'ventilation':
      return 'an air handling unit or a fan';
    case 'heatingAndCooling':
    case 'plumbing':
      return 'a pump or a boiler';
    case 'electrical':
      return 'a panel';
    case 'fireProtection':
      return 'a pump';
    default:
      return NEUTRAL_SOURCE_WORD;
  }
}

/** One word for a selection: the word of the types when all agree, else the neutral word. */
export function commonSourceWord(types: ReadonlyArray<{ id: string; discipline: Discipline } | undefined>): string {
  if (types.length === 0) return NEUTRAL_SOURCE_WORD;
  const first = sourceWordOf(types[0]);
  return types.every((type) => sourceWordOf(type) === first) ? first : NEUTRAL_SOURCE_WORD;
}

/** The state that every item has, or undefined when the items differ or one has none. Empty list: undefined. */
export function commonNoSourceState(items: ReadonlyArray<{ solvedNoSource?: NoSourceState }>): NoSourceState | undefined {
  if (items.length === 0) return undefined;
  const first = items[0].solvedNoSource;
  if (first === undefined) return undefined;
  return items.every((item) => item.solvedNoSource === first) ? first : undefined;
}

/** The hint under the field. Exact texts: */
export function noSourceHintOf(state: NoSourceState, sourceWord: string): string {
  if (state === 'highest') {
    return `No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place ${sourceWord} to set the source.`;
  }
  return `This network has a loop and no source. The numbers use one start point. Place ${sourceWord} to set the source.`;
}
