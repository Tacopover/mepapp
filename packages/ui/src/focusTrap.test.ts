import { describe, expect, it } from 'vitest';
import { isTopDialog, nextTabIndex, pushDialog, removeDialog } from './focusTrap.js';

describe('nextTabIndex', () => {
  it('wraps forward from the last element to the first', () => {
    expect(nextTabIndex(3, 2, false)).toBe(0);
  });

  it('wraps backward from the first element to the last', () => {
    expect(nextTabIndex(3, 0, true)).toBe(2);
  });

  it('moves forward and backward inside the list', () => {
    expect(nextTabIndex(3, 0, false)).toBe(1);
    expect(nextTabIndex(3, 2, true)).toBe(1);
  });

  it('goes to the first element forward and the last backward when the focus is outside the list', () => {
    expect(nextTabIndex(3, -1, false)).toBe(0);
    expect(nextTabIndex(3, -1, true)).toBe(2);
  });

  it('returns -1 when the list is empty', () => {
    expect(nextTabIndex(0, -1, false)).toBe(-1);
    expect(nextTabIndex(0, -1, true)).toBe(-1);
  });

  it('stays on the only element in a one-element list', () => {
    expect(nextTabIndex(1, 0, false)).toBe(0);
    expect(nextTabIndex(1, 0, true)).toBe(0);
  });
});

describe('dialog stack', () => {
  it('makes the last pushed dialog the top one', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    pushDialog(a);
    pushDialog(b);
    expect(isTopDialog(b)).toBe(true);
    expect(isTopDialog(a)).toBe(false);
    removeDialog(b);
    expect(isTopDialog(a)).toBe(true);
    removeDialog(a);
    expect(isTopDialog(a)).toBe(false);
    expect(isTopDialog(b)).toBe(false);
  });

  it('ignores the removal of an unknown dialog', () => {
    const a = Symbol('a');
    const unknown = Symbol('unknown');
    pushDialog(a);
    removeDialog(unknown);
    expect(isTopDialog(a)).toBe(true);
    removeDialog(a);
  });

  it('counts a dialog pushed twice once', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    pushDialog(a);
    pushDialog(a);
    pushDialog(b);
    removeDialog(b);
    expect(isTopDialog(a)).toBe(true);
    removeDialog(a);
    expect(isTopDialog(a)).toBe(false);
  });
});
