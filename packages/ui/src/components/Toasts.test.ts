import { describe, expect, it } from 'vitest';
import { addToast, type Toast } from './Toasts.js';

const note = (message: string, extra: Partial<Toast> = {}) => ({ message, kind: 'info' as const, ...extra });

describe('addToast', () => {
  it('drops the oldest transient toast above 4', () => {
    let list: Toast[] = [];
    for (let i = 0; i < 5; i++) list = addToast(list, note(`n${i}`), i);
    expect(list.map((t) => t.message)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('never drops a persistent toast', () => {
    let list = addToast([], note('lost', { kind: 'error', persistent: true, key: 'k' }), 0);
    for (let i = 1; i <= 6; i++) list = addToast(list, note(`n${i}`), i);
    expect(list.some((t) => t.message === 'lost')).toBe(true);
    expect(list.filter((t) => !t.persistent)).toHaveLength(4);
  });

  it('replaces a toast with the same key', () => {
    let list = addToast([], note('first', { persistent: true, key: 'k' }), 0);
    list = addToast(list, note('second', { persistent: true, key: 'k' }), 1);
    expect(list.map((t) => t.message)).toEqual(['second']);
  });
});
