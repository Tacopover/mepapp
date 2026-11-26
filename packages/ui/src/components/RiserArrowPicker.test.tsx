import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RiserArrowPair } from '@mepapp/core';
import { RiserArrowIcon } from './RiserArrowIcon.js';
import { RiserArrowPicker, type RiserArrowPickerProps } from './RiserArrowPicker.js';

// The geometry itself is tested in packages/render (riserArrowShapes.test.ts); this stub avoids loading PixiJS in node.
vi.mock('@mepapp/render', () => ({
  riserArrowShapes: (pair?: { below: string; above: string }, ..._rest: unknown[]) =>
    (['below', 'above'] as const)
      .filter((side) => pair !== undefined && pair[side] !== 'none')
      .map(() => ({ shaftTail: { x: 1, y: 1 }, shaftEnd: { x: 2, y: 2 }, head: { tip: { x: 3, y: 3 }, baseA: { x: 4, y: 4 }, baseB: { x: 5, y: 5 } } })),
}));

function count(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

function iconMarkup(pair: RiserArrowPair): string {
  return renderToStaticMarkup(createElement(RiserArrowIcon, { pair }));
}

describe('RiserArrowIcon', () => {
  it('draws a ring with two arrows for pictogram 7', () => {
    const markup = iconMarkup({ below: 'down', above: 'up' });
    expect(count(markup, /<circle /g)).toBe(1);
    expect(count(markup, /<line /g)).toBe(2);
    expect(count(markup, /<polygon /g)).toBe(2);
  });

  it('draws a ring with one arrow for pictogram 2', () => {
    const markup = iconMarkup({ below: 'none', above: 'up' });
    expect(count(markup, /<circle /g)).toBe(1);
    expect(count(markup, /<line /g)).toBe(1);
    expect(count(markup, /<polygon /g)).toBe(1);
  });

  it('draws only the ring for no arrows', () => {
    const markup = iconMarkup({ below: 'none', above: 'none' });
    expect(count(markup, /<circle /g)).toBe(1);
    expect(count(markup, /<line /g)).toBe(0);
    expect(count(markup, /<polygon /g)).toBe(0);
  });
});

function picker(overrides: Partial<RiserArrowPickerProps> = {}): string {
  const props: RiserArrowPickerProps = {
    pair: { below: 'none', above: 'none' },
    handSet: false,
    variant: 'menu',
    onChoose: () => {},
    onUseSolve: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(createElement(RiserArrowPicker, props));
}

function openTag(markup: string, testId: string): string {
  const tag = markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`));
  if (tag === null) throw new Error(`no button ${testId}`);
  return tag[0];
}

describe('RiserArrowPicker with no hand-set arrows', () => {
  const markup = picker();

  it('shows the group with its label', () => {
    expect(markup).toContain('role="radiogroup" aria-label="Riser arrows"');
  });

  it('shows nine radio items (eight pictograms and No arrows)', () => {
    expect(count(markup, /role="radio"/g)).toBe(9);
    for (const title of [
      'Comes up, goes up',
      'Goes up',
      'Comes up',
      'Comes down, goes down',
      'Comes down',
      'Goes down',
      'Goes up, goes down',
      'Comes up, comes down',
    ]) {
      expect(markup).toContain(`title="${title}"`);
    }
  });

  it('shows the no arrows choice and the flow solve link', () => {
    expect(markup).toContain('No arrows');
    expect(markup).toContain('Use the flow solve');
    expect(openTag(markup, 'riser-arrow-solve')).toContain('aria-disabled="true"');
    expect(markup).toContain('✓');
  });

  it('marks no choice as checked', () => {
    expect(markup).not.toContain('aria-checked="true"');
  });

  it('takes the flow solve link out of the tab order only while it is dim', () => {
    expect(openTag(markup, 'riser-arrow-solve')).toContain('tabindex="-1"');
    const handSetMarkup = picker({ pair: { below: 'down', above: 'down' }, handSet: true });
    expect(openTag(handSetMarkup, 'riser-arrow-solve')).toContain('tabindex="0"');
  });

  it('gives tab focus to the first radio only', () => {
    expect(count(markup, /tabindex="0"/g)).toBe(1);
    expect(openTag(markup, 'riser-arrow-p1')).toContain('tabindex="0"');
  });
});

describe('RiserArrowPicker with hand-set arrows', () => {
  it('marks pictogram 4 and gives it tab focus', () => {
    const markup = picker({ pair: { below: 'down', above: 'down' }, handSet: true, variant: 'menu' });
    expect(openTag(markup, 'riser-arrow-p4')).toContain('aria-checked="true"');
    expect(openTag(markup, 'riser-arrow-p4')).toContain('tabindex="0"');
    expect(openTag(markup, 'riser-arrow-solve')).not.toContain('aria-disabled');
    expect(markup).toContain('mep-arrow-picker--menu');
  });

  it('uses the panel variant class when given', () => {
    const markup = picker({ pair: { below: 'down', above: 'down' }, handSet: true, variant: 'panel' });
    expect(markup).toContain('mep-arrow-picker--panel');
    expect(markup).not.toContain('mep-arrow-picker--menu');
  });

  it('marks no arrows when the pair is none and none', () => {
    const markup = picker({ pair: { below: 'none', above: 'none' }, handSet: true });
    expect(openTag(markup, 'riser-arrow-none')).toContain('aria-checked="true"');
  });
});
