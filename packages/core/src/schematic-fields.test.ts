import { describe, expect, it } from 'vitest';
import { formatDateValue, fieldExpressionValue, resolveFields, todayIso } from './schematic-fields.js';
import { generateSchematic } from './schematic-generator.js';
import { buildSampleSchematicInput, updateBlock } from './schematic-template-edit.js';
import { SCHEMATIC_TEMPLATE_LIBRARY } from './schematic-template-library.js';
import { validateSchematicTemplate, type SchematicFieldDefinition, type SchematicTemplate } from './schematic-template.js';

const base = SCHEMATIC_TEMPLATE_LIBRARY[0];
const clone = () => structuredClone(base);
const withFields = (fields: SchematicFieldDefinition[]): SchematicTemplate => ({ ...clone(), fields });

describe('resolveFields', () => {
  const template = withFields([
    { id: 'projectName', label: 'Project', type: 'text', scope: 'project' },
    { id: 'author', label: 'Author', type: 'text', scope: 'schematic' },
    { id: 'title', label: 'Title', type: 'text', scope: 'schematic', defaultBinding: 'Board {panel.name}' },
    { id: 'date', label: 'Date', type: 'date', scope: 'schematic', defaultToday: true },
    { id: 'rev', label: 'Revision', type: 'number', scope: 'schematic', defaultBinding: '1' },
  ]);
  const panel = { panel: { name: 'A' } };

  it('reads a project field from the project values and a schematic field from the schematic values', () => {
    const { values, fields } = resolveFields(template, { projectValues: { projectName: 'Tower' }, schematicValues: { author: 'Kim', projectName: 'ignored' } }, panel);
    expect(values.projectName).toBe('Tower');
    expect(values.author).toBe('Kim');
    expect(fields.find((f) => f.id === 'projectName')!.stored).toBe('Tower');
  });

  it('uses the default when no value is stored, and keeps an explicit empty value', () => {
    expect(resolveFields(template, {}, panel).values.title).toBe('Board A');
    const cleared = resolveFields(template, { schematicValues: { title: '' } }, panel);
    expect(cleared.values.title).toBe('');
    expect(cleared.fields.find((f) => f.id === 'title')).toMatchObject({ stored: '', defaultText: 'Board A', value: '' });
  });

  it('defaults a date to today, formatted, and to empty without a date', () => {
    expect(resolveFields(template, { today: '2026-09-25' }, panel).values.date).toBe('25-09-2026');
    expect(resolveFields(template, {}, panel).values.date).toBe('');
    expect(resolveFields({ ...template, dateFormat: 'yyyy-mm-dd' }, { today: '2026-09-25' }, panel).values.date).toBe('2026-09-25');
  });

  it('gives a number field a number so an expression can calculate with it', () => {
    expect(resolveFields(template, { schematicValues: { rev: '2,5' } }, panel).values.rev).toBe(2.5);
    expect(fieldExpressionValue('number', 'x', undefined)).toBe('x');
    expect(fieldExpressionValue('number', '', undefined)).toBe('');
  });

  it('does not read inherited members as stored values', () => {
    expect(resolveFields(template, { schematicValues: {} }, panel).fields.find((f) => f.id === 'author')!.stored).toBeUndefined();
  });

  it('formats dates and leaves other text alone', () => {
    expect(formatDateValue('2026-01-05')).toBe('05-01-2026');
    expect(formatDateValue('soon')).toBe('soon');
    expect(todayIso(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('field validation', () => {
  const ok: SchematicFieldDefinition = { id: 'a_1', label: 'A', type: 'text', scope: 'project' };

  it('accepts the built-in templates and a template without fields', () => {
    for (const t of SCHEMATIC_TEMPLATE_LIBRARY) expect(validateSchematicTemplate(t)).toEqual([]);
    const legacy = clone();
    delete legacy.fields;
    expect(validateSchematicTemplate(legacy)).toEqual([]);
  });

  it('rejects a bad id, a repeated id, a missing label, a today default on a text field and a bad default binding', () => {
    const issues = (fields: SchematicFieldDefinition[]) => validateSchematicTemplate(withFields(fields)).join(' | ');
    expect(issues([{ ...ok, id: '1x' }])).toContain('id');
    expect(issues([{ ...ok, id: 'has space' }])).toContain('id');
    expect(issues([ok, ok])).toContain('reuses an id');
    expect(issues([{ ...ok, label: ' ' }])).toContain('needs a label');
    expect(issues([{ ...ok, defaultToday: true }])).toContain('not a date');
    expect(issues([{ ...ok, defaultBinding: '{oops' }])).toContain('Missing');
  });
});

describe('fields in the generator', () => {
  it('lets every block scope read {field.x}', () => {
    let template = withFields([{ id: 'x', label: 'X', type: 'text', scope: 'schematic' }]);
    template = updateBlock(template, { blockId: 'title' }, { binding: 'T:{field.x}' });
    template = updateBlock(template, { blockId: 'totals' }, { tableRows: [{ label: 'x', formula: 'count(circuit)' }] });
    template = updateBlock(template, { blockId: 'desc', groupId: 'standard' }, { binding: 'D:{field.x}' });
    template = updateBlock(template, { blockId: 'section' }, { binding: 'S:{field.x}' });
    const generated = generateSchematic(buildSampleSchematicInput(template), template, { fieldSources: { schematicValues: { x: 'hello' } } });
    const text = (id: string) => generated.blocks.filter((b) => b.templateBlockId === id).map((b) => b.text);
    expect(text('title')).toEqual(['T:hello']);
    expect(text('desc').every((t) => t === 'D:hello')).toBe(true);
    expect(text('section').every((t) => t === 'S:hello')).toBe(true);
    expect(generated.fields.map((f) => f.id)).toEqual(['x']);
  });

  it('fills the built-in title block from the fields and collapses empty optional lines', () => {
    const generated = generateSchematic(buildSampleSchematicInput(base), base, {
      fieldSources: { projectValues: { projectName: 'Tower' }, schematicValues: { author: 'Kim' }, today: '2026-09-25' },
    });
    const title = generated.blocks.find((b) => b.templateBlockId === 'title')!.text!;
    expect(title.split('\n')[0]).toBe('Tower');
    expect(title).toContain('Distribution board Sample board');
    expect(title).toContain('Drawn by: Kim');
    expect(title).toContain('Date: 25-09-2026');
    expect(title).not.toContain('Client');
  });
});

import { addField, removeField, reorderField, updateField } from './schematic-template-edit.js';

describe('field edits', () => {
  it('adds a valid field with a new id, updates, reorders and removes it', () => {
    const first = addField(clone());
    const second = addField(first.template);
    expect(second.fieldId).not.toBe(first.fieldId);
    expect(validateSchematicTemplate(second.template)).toEqual([]);
    const withDate = updateField(second.template, second.fieldId, { type: 'date', defaultToday: true, label: 'When' });
    expect(withDate.fields!.find((f) => f.id === second.fieldId)).toMatchObject({ type: 'date', defaultToday: true, label: 'When' });
    const backToText = updateField(withDate, second.fieldId, { type: 'text' });
    expect('defaultToday' in backToText.fields!.find((f) => f.id === second.fieldId)!).toBe(false);
    const cleared = updateField(backToText, second.fieldId, { defaultBinding: undefined });
    expect('defaultBinding' in cleared.fields!.find((f) => f.id === second.fieldId)!).toBe(false);
    const ids = (t: SchematicTemplate) => t.fields!.map((f) => f.id);
    const last = ids(second.template).at(-1)!;
    expect(ids(reorderField(second.template, last, -1)).at(-2)).toBe(last);
    expect(ids(reorderField(second.template, ids(second.template)[0], -1))).toEqual(ids(second.template));
    expect(ids(removeField(second.template, second.fieldId))).not.toContain(second.fieldId);
  });

  it('adds a field to a template that had none', () => {
    const legacy = clone();
    delete legacy.fields;
    expect(addField(legacy).template.fields).toHaveLength(1);
  });
});

import { findFieldUses } from './schematic-template-edit.js';

describe('findFieldUses', () => {
  it('finds the built-in title block for the fields it reads and nothing for a field it does not', () => {
    expect(findFieldUses(clone(), 'projectName')).toEqual(['layout block "title"']);
    expect(findFieldUses(clone(), 'nothing')).toEqual([]);
  });

  it('finds a use in a group block and in a table formula, and does not match a longer id', () => {
    let template = updateBlock(clone(), { blockId: 'desc', groupId: 'standard' }, { binding: '{field.rev2} x' });
    template = updateBlock(template, { blockId: 'totals' }, { tableRows: [{ label: 'r', formula: 'field.rev + 1' }] });
    expect(findFieldUses(template, 'rev2')).toEqual(['group "Standard" block "desc"']);
    expect(findFieldUses(template, 'rev')).toEqual(['layout block "totals"']);
  });
});
