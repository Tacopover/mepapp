import { describe, expect, it } from 'vitest';
import { iconButtonClass, iconToggleClass } from './iconButtonClass.js';

describe('iconButtonClass', () => {
  it('returns the base class when nothing is set', () => {
    expect(iconButtonClass()).toBe('mep-icon-button');
  });

  it('adds the on class when pressed', () => {
    expect(iconButtonClass(true)).toBe('mep-icon-button on');
  });

  it('appends the extra class after the state class', () => {
    expect(iconButtonClass(true, 'wide')).toBe('mep-icon-button on wide');
    expect(iconButtonClass(false, 'wide')).toBe('mep-icon-button wide');
  });
});

describe('iconToggleClass', () => {
  it('returns the base class when unchecked and enabled', () => {
    expect(iconToggleClass(false)).toBe('mep-icon-toggle');
  });

  it('adds the on class when checked', () => {
    expect(iconToggleClass(true)).toBe('mep-icon-toggle on');
  });

  it('adds the disabled class when disabled, with or without checked', () => {
    expect(iconToggleClass(false, true)).toBe('mep-icon-toggle disabled');
    expect(iconToggleClass(true, true)).toBe('mep-icon-toggle on disabled');
  });
});
