import type { Discipline } from '@mepapp/core';

export type NoSourceState = 'highest' | 'loop';
export const NEUTRAL_SOURCE_WORD = 'source equipment';

/** One word for a source, the same for every network type (D-B-113). This function is the one place to make it type specific later. */
export function sourceWordOf(_type: { id: string; discipline: Discipline } | undefined): string {
  return NEUTRAL_SOURCE_WORD;
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
