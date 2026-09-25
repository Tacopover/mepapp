import { describe, expect, it } from 'vitest';
import type { ResolvedBlock, ResolvedField } from '@mepapp/core';
import { describeFieldDefault, findExtraBlockAt, findTextBlockAt, groupResolvedFields, isTextEditableType } from './schematicTextEdit.js';

const block = (id: string, type: ResolvedBlock['type'], x: number, y: number, width: number, height: number, rotation = 0): ResolvedBlock =>
  ({ id, templateBlockId: id, type, scope: 'once', x, y, width, height, rotation, panelId: 'p' }) as ResolvedBlock;

describe('isTextEditableType', () => {
  it('excludes blocks that draw no editable text', () => {
    for (const type of ['frame', 'busbar', 'drawing', 'totalsTable', 'loadSymbol'] as const) expect(isTextEditableType(type)).toBe(false);
    for (const type of ['titleBlock', 'description', 'cableText', 'circuitNumber', 'freeItem'] as const) expect(isTextEditableType(type)).toBe(true);
  });
});

describe('findTextBlockAt', () => {
  it('finds the top-most text block and skips blocks that are not editable', () => {
    const blocks = [block('a', 'description', 0, 0, 20, 10), block('frame', 'frame', 0, 0, 100, 100), block('b', 'freeItem', 10, 0, 20, 10)];
    expect(findTextBlockAt(blocks, { x: 15, y: 5 })!.id).toBe('b');
    expect(findTextBlockAt(blocks, { x: 5, y: 5 })!.id).toBe('a');
    expect(findTextBlockAt(blocks, { x: 50, y: 50 })).toBeUndefined();
  });

  it('tests a rotated block in its own axes', () => {
    // 20 wide by 4 high, turned 90 degrees about its centre (10,2): it now covers x 8..12, y -8..12.
    const turned = [block('r', 'description', 0, 0, 20, 4, 90)];
    expect(findTextBlockAt(turned, { x: 10, y: 10 })!.id).toBe('r');
    expect(findTextBlockAt(turned, { x: 18, y: 2 })).toBeUndefined();
  });
});

describe('field form helpers', () => {
  const field = (over: Partial<ResolvedField>): ResolvedField => ({ id: 'f', label: 'F', type: 'text', scope: 'schematic', defaultText: '', value: '', ...over });

  it('splits fields by scope', () => {
    const groups = groupResolvedFields([field({ id: 'a', scope: 'project' }), field({ id: 'b' })]);
    expect(groups.shared.map((f) => f.id)).toEqual(['a']);
    expect(groups.schematic.map((f) => f.id)).toEqual(['b']);
  });

  it('names the default, marks an intentional empty value and says nothing otherwise', () => {
    expect(describeFieldDefault(field({ defaultText: 'Board A' }))).toBe('Default: Board A');
    expect(describeFieldDefault(field({ type: 'date', defaultText: '2026-09-25' }))).toBe('Default: today (2026-09-25)');
    expect(describeFieldDefault(field({ stored: '', defaultText: 'Board A' }))).toContain('Empty on purpose');
    expect(describeFieldDefault(field({ stored: 'x', defaultText: 'Board A' }))).toBeUndefined();
    expect(describeFieldDefault(field({}))).toBeUndefined();
  });
});

describe('extra blocks', () => {
  const extra = (id: string, type: ResolvedBlock['type'], x: number, y: number): ResolvedBlock => ({ ...block(id, type, x, y, 20, 10), extraId: id });

  it('skips extras when looking for text to type over, and finds only extras when asked', () => {
    const blocks = [block('a', 'description', 0, 0, 20, 10), extra('e1', 'freeItem', 5, 0)];
    expect(findTextBlockAt(blocks, { x: 10, y: 5 })!.id).toBe('a');
    expect(findExtraBlockAt(blocks, { x: 10, y: 5 })!.id).toBe('e1');
    expect(findExtraBlockAt(blocks, { x: 100, y: 5 })).toBeUndefined();
  });
});
