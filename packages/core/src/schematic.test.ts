import { describe, expect, it } from 'vitest';
import { bundleSymbols, collectTemplateSymbolIds, createSchematic, generateFromSchematic, getSchematicTemplateStatus, isSameData, refreshSchematicFromTemplate, uniqueSchematicName, type Schematic } from './schematic.js';
import type { SchematicSymbol } from './schematic-symbol.js';
import { buildSampleSchematicInput, addBlock, updateBlock } from './schematic-template-edit.js';
import { SCHEMATIC_TEMPLATE_LIBRARY } from './schematic-template-library.js';
import type { SchematicExtra } from './schematic-template.js';

const base = SCHEMATIC_TEMPLATE_LIBRARY[0];
const symbol = (id: string): SchematicSymbol => ({ id, name: id, widthMm: 10, heightMm: 10, shapes: [], ports: [] });
const library = [symbol('s1'), symbol('s2')];

function make(): Schematic {
  const input = buildSampleSchematicInput(base);
  return createSchematic({ id: 'sch1', name: 'Board', panelId: input.panel.id, source: base, library });
}

describe('createSchematic and updates', () => {
  it('copies the template and bundles only the symbols it uses', () => {
    const withSymbol = updateBlock(structuredClone(base), { blockId: 'main' }, { symbolId: 's2' });
    expect(collectTemplateSymbolIds(withSymbol)).toEqual(['s2']);
    const schematic = createSchematic({ id: 'x', name: 'n', panelId: 'p', source: withSymbol, library });
    expect(schematic.symbols.map((s) => s.id)).toEqual(['s2']);
    expect(schematic.symbols[0]).not.toBe(library[1]);
    expect(schematic.template).not.toBe(withSymbol);
    expect(schematic).toMatchObject({ sourceTemplateId: base.id, fieldValues: {}, textOverrides: {}, extras: [] });
  });

  it('leaves out a symbol that the library no longer has', () => {
    const withSymbol = updateBlock(structuredClone(base), { blockId: 'main' }, { symbolId: 'gone' });
    expect(bundleSymbols(withSymbol, library)).toEqual([]);
  });

  it('gives an unused name as it is and numbers a used one', () => {
    const one = make();
    expect(uniqueSchematicName('Board', [])).toBe('Board');
    expect(uniqueSchematicName('board', [one])).toBe('board 2');
    expect(uniqueSchematicName('Board', [one, { ...one, name: 'Board 2' }])).toBe('Board 3');
  });

  it('reports current, changed and missing-source', () => {
    const schematic = make();
    expect(getSchematicTemplateStatus(schematic, base, library)).toBe('current');
    const edited = updateBlock(structuredClone(base), { blockId: 'bus' }, { x: 99 });
    expect(getSchematicTemplateStatus(schematic, edited, library)).toBe('changed');
    expect(getSchematicTemplateStatus(schematic, undefined, library)).toBe('missing-source');
    const withSymbol = updateBlock(structuredClone(base), { blockId: 'main' }, { symbolId: 's1' });
    const copy = createSchematic({ id: 'x', name: 'n', panelId: 'p', source: withSymbol, library });
    expect(getSchematicTemplateStatus(copy, withSymbol, library)).toBe('current');
    expect(getSchematicTemplateStatus(copy, withSymbol, [{ ...symbol('s1'), name: 'renamed' }])).toBe('changed');
  });

  it('ignores the order of object keys when comparing', () => {
    expect(isSameData({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(isSameData({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('refreshes the template and symbols and keeps the entered data', () => {
    const schematic = { ...make(), fieldValues: { author: 'Kim' }, textOverrides: { k: 'v' } };
    const edited = updateBlock(structuredClone(base), { blockId: 'bus' }, { x: 99 });
    const next = refreshSchematicFromTemplate(schematic, edited, library);
    expect(next.template.layoutBlocks.find((b) => b.id === 'bus')!.x).toBe(99);
    expect(next.fieldValues).toEqual({ author: 'Kim' });
    expect(next.textOverrides).toEqual({ k: 'v' });
    expect(getSchematicTemplateStatus(next, edited, library)).toBe('current');
  });
});

describe('generateFromSchematic', () => {
  const input = buildSampleSchematicInput(base);

  it('uses the schematic field values, the shared project values and today', () => {
    const schematic = { ...make(), fieldValues: { author: 'Kim' } };
    const generated = generateFromSchematic(schematic, { ...input, projectFieldValues: { projectName: 'Tower' }, today: '2026-09-25' });
    const title = generated.blocks.find((b) => b.templateBlockId === 'title')!.text!;
    expect(title).toContain('Tower');
    expect(title).toContain('Drawn by: Kim');
    expect(title).toContain('25-09-2026');
  });

  it('replaces a block text with the typed-over text and marks it', () => {
    const plain = generateFromSchematic(make(), input);
    const target = plain.blocks.find((b) => b.templateBlockId === 'desc')!;
    const generated = generateFromSchematic({ ...make(), textOverrides: { [target.id]: 'My {text}' } }, input);
    const changed = generated.blocks.find((b) => b.id === target.id)!;
    expect(changed).toMatchObject({ text: 'My {text}', overridden: true });
    expect(generated.blocks.filter((b) => b.overridden)).toHaveLength(1);
    expect(generated.diagnostics.filter((d) => d.kind === 'orphan-override')).toEqual([]);
  });

  it('reports a typed-over text whose block is gone', () => {
    const generated = generateFromSchematic({ ...make(), textOverrides: { 'nope/-/gone': 'x' } }, input);
    expect(generated.diagnostics).toContainEqual({ kind: 'orphan-override', blockId: 'nope/-/gone' });
  });

  it('draws a sheet extra at its sheet position', () => {
    const drawing = addBlock(structuredClone(base), 'drawing')!;
    const extra: SchematicExtra = { ...drawing.template.layoutBlocks.at(-1)!, id: 'e1', x: 50, y: 60, shapes: [] };
    const generated = generateFromSchematic({ ...make(), extras: [extra] }, input);
    const block = generated.blocks.find((b) => b.extraId === 'e1')!;
    expect(block).toMatchObject({ x: 50, y: 60, scope: 'once', id: `${input.panel.id}/extra/e1` });
  });

  it('makes an extra follow its circuit, and reports one whose circuit is not laid out', () => {
    const extraBase: SchematicExtra = { id: 'e2', type: 'freeItem', x: 3, y: 4, rotation: 0, binding: 'N{circuit.number}' };
    const plain = generateFromSchematic(make(), input);
    const circuitId = plain.circuitOrder[1];
    const origin = plain.circuitOrigins[circuitId];
    const followed = generateFromSchematic({ ...make(), extras: [{ ...extraBase, circuitId }] }, input).blocks.find((b) => b.extraId === 'e2')!;
    expect(followed).toMatchObject({ x: origin.x + 3, y: origin.y + 4, scope: 'circuit', circuitId });
    expect(followed.text).toBe(`N${input.circuits.find((c) => c.id === circuitId)!.number}`);
    const orphan = generateFromSchematic({ ...make(), extras: [{ ...extraBase, circuitId: 'missing' }] }, input);
    expect(orphan.diagnostics).toContainEqual({ kind: 'orphan-extra', extraId: 'e2' });
    expect(orphan.blocks.some((b) => b.extraId === 'e2')).toBe(false);
  });
});

import { addSchematicExtra, removeSchematicExtra, setSchematicFieldValue, setTextOverride, updateSchematicExtra } from './schematic.js';

describe('schematic edits', () => {
  it('sets and clears a field value and a text override without changing the input', () => {
    const schematic = make();
    const withValue = setSchematicFieldValue(schematic, 'author', 'Kim');
    expect(withValue.fieldValues).toEqual({ author: 'Kim' });
    expect(schematic.fieldValues).toEqual({});
    expect(setSchematicFieldValue(withValue, 'author', undefined).fieldValues).toEqual({});
    expect(setSchematicFieldValue(schematic, 'author', '').fieldValues).toEqual({ author: '' });
    expect(setTextOverride(setTextOverride(schematic, 'b', 't'), 'b', undefined).textOverrides).toEqual({});
  });

  it('adds, updates and removes extras, and refuses a type that is not allowed', () => {
    const one = addSchematicExtra(make(), 'drawing', { at: { x: 5, y: 6 } })!;
    expect(one.schematic.extras[0]).toMatchObject({ id: 'drawing-1', type: 'drawing', x: 5, y: 6, shapes: [] });
    expect('circuitId' in one.schematic.extras[0]).toBe(false);
    const two = addSchematicExtra(one.schematic, 'drawing', { circuitId: 'c1' })!;
    expect(two.extraId).toBe('drawing-2');
    expect(two.schematic.extras[1].circuitId).toBe('c1');
    const text = addSchematicExtra(two.schematic, 'freeItem')!;
    expect(text.schematic.extras[2].binding).toBe('Text');
    const moved = updateSchematicExtra(text.schematic, 'drawing-1', { x: 9, rotation: 90 });
    expect(moved.extras[0]).toMatchObject({ x: 9, rotation: 90, type: 'drawing' });
    expect(removeSchematicExtra(moved, 'drawing-1').extras.map((e) => e.id)).toEqual(['drawing-2', 'freeItem-1']);
    expect(addSchematicExtra(make(), 'busbar')).toBeUndefined();
  });
});

import { addSchematicSymbolExtra } from './schematic.js';

describe('extras that use a symbol', () => {
  it('copies the symbol into the schematic once and sizes the extra like the symbol', () => {
    const one = addSchematicSymbolExtra(make(), symbol('s1'), { at: { x: 5, y: 6 } });
    expect(one.schematic.symbols.map((s) => s.id)).toEqual(['s1']);
    expect(one.schematic.extras[0]).toMatchObject({ type: 'drawing', symbolId: 's1', width: 10, height: 10, x: 5, y: 6 });
    expect('shapes' in one.schematic.extras[0]).toBe(false);
    const two = addSchematicSymbolExtra(one.schematic, symbol('s1'));
    expect(two.schematic.symbols).toHaveLength(1);
  });

  it('keeps those symbol copies when the template is refreshed, and does not call the schematic changed because of them', () => {
    const one = addSchematicSymbolExtra(make(), symbol('s2'));
    expect(getSchematicTemplateStatus(one.schematic, base, library)).toBe('current');
    const edited = updateBlock(structuredClone(base), { blockId: 'bus' }, { x: 99 });
    const refreshed = refreshSchematicFromTemplate(one.schematic, edited, library);
    expect(refreshed.symbols.map((s) => s.id)).toEqual(['s2']);
    expect(getSchematicTemplateStatus(refreshed, edited, library)).toBe('current');
  });
});
