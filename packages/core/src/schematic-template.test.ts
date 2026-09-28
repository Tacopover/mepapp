import { describe, expect, it } from 'vitest';
import { SCHEMATIC_TEMPLATE_LIBRARY } from './schematic-template-library.js';
import { SCHEMATIC_BLOCK_CATALOGUE, SYMBOL_CAPABLE_BLOCK_TYPES, getBlockBindingSource, getBlockHeight, getBlockWidth, validateSchematicTemplate, type SchematicBlock, type SchematicTemplate } from './schematic-template.js';

const base = SCHEMATIC_TEMPLATE_LIBRARY[0];

function copy(mutate: (t: SchematicTemplate) => void): SchematicTemplate {
  const t = structuredClone(base);
  mutate(t);
  return t;
}

const b = (id: string, type: SchematicBlock['type'], extra: Partial<SchematicBlock> = {}): SchematicBlock => ({ id, type, x: 0, y: 0, rotation: 0, ...extra });

describe('block defaults', () => {
  it('falls back to the catalogue for size and binding', () => {
    expect(getBlockWidth(b('x', 'cableText'))).toBe(SCHEMATIC_BLOCK_CATALOGUE.cableText.width);
    expect(getBlockHeight(b('x', 'cableText', { height: 12 }))).toBe(12);
    expect(getBlockBindingSource(b('x', 'description'))).toBe('{circuit.customName}');
  });

  it('treats an explicit empty binding as no text, not as the default', () => {
    expect(getBlockBindingSource(b('x', 'description', { binding: '' }))).toBe('');
  });
});

describe('validateSchematicTemplate', () => {
  it.each(SCHEMATIC_TEMPLATE_LIBRARY.map((t) => [t.name, t] as const))('accepts the built-in %s template', (_name, template) => {
    expect(validateSchematicTemplate(template)).toEqual([]);
  });

  it('accepts a template that survives a JSON round trip', () => {
    expect(validateSchematicTemplate(JSON.parse(JSON.stringify(base)))).toEqual([]);
  });

  it('flags a circuit-scope block in the layout and a panel-scope block in a group', () => {
    const issues = validateSchematicTemplate(
      copy((t) => {
        t.layoutBlocks.push(b('stray', 'circuitNumber'));
        t.groups[0].blocks.push(b('stray2', 'frame'));
      }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('circuit scope');
    expect(issues[1]).toContain('panel scope');
  });

  it('flags a duplicate block id within one collection, but not across groups', () => {
    expect(validateSchematicTemplate(copy((t) => t.layoutBlocks.push(b('frame', 'frame'))))).toHaveLength(1);
    expect(validateSchematicTemplate(copy((t) => t.groups[1].blocks.push(t.groups[1].blocks[0])))).toHaveLength(1);
    expect(validateSchematicTemplate(copy((t) => (t.groups[1].blocks = [...t.groups[0].blocks])))).toEqual([]);
  });

  it('flags a binding or table formula that does not parse', () => {
    const issues = validateSchematicTemplate(
      copy((t) => {
        t.groups[1].blocks[3].binding = '{circuit.number';
        t.layoutBlocks.push(b('table', 'totalsTable', { tableRows: [{ label: 'Bad', formula: 'sum(' }] }));
      }),
    );
    expect(issues).toHaveLength(2);
  });

  it('flags a group with a pitch of zero and groups that disagree on direction', () => {
    const issues = validateSchematicTemplate(
      copy((t) => {
        t.groups[0].pitch = 0;
        t.groups[1].direction = t.groups[0].direction === 'row' ? 'column' : 'row';
      }),
    );
    expect(issues.some((i) => i.includes('pitch'))).toBe(true);
    expect(issues.some((i) => i.includes('direction'))).toBe(true);
  });

  it('flags a bad sheet size, a non-numeric position and a non-positive block size', () => {
    const issues = validateSchematicTemplate(
      copy((t) => {
        t.sheet.widthMm = 0;
        t.layoutBlocks[0].x = Number.NaN;
        t.layoutBlocks[1].width = -4;
      }),
    );
    expect(issues).toHaveLength(3);
  });

  it('flags table fields on a block that is not a totals table', () => {
    expect(validateSchematicTemplate(copy((t) => (t.layoutBlocks[0].tableColumns = 'circuits')))).toHaveLength(1);
  });

  it('accepts a symbol on a drawing block and flags one on any other block', () => {
    expect(validateSchematicTemplate(copy((t) => t.layoutBlocks.push(b('sym', 'drawing', { symbolId: 'my-symbol' }))))).toEqual([]);
    expect(validateSchematicTemplate(copy((t) => (t.layoutBlocks[0].symbolId = 'my-symbol')))).toHaveLength(1);
    expect(validateSchematicTemplate(copy((t) => t.layoutBlocks.push(b('sym', 'drawing', { symbolId: ' ' }))))).toHaveLength(1);
  });

  it('accepts a symbol on every symbol-capable type and flags one on any other type', () => {
    for (const type of SYMBOL_CAPABLE_BLOCK_TYPES) {
      const groupBlock = SCHEMATIC_BLOCK_CATALOGUE[type].scope === 'circuit';
      const template = copy((t) => (groupBlock ? t.groups[1].blocks : t.layoutBlocks).push(b('sym', type, { symbolId: 'my-symbol' })));
      expect(validateSchematicTemplate(template), type).toEqual([]);
    }
    const bad = validateSchematicTemplate(copy((t) => t.layoutBlocks.push(b('sym', 'legend', { symbolId: 'my-symbol' }))));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot show one');
  });

  it('flags a duplicate group id and a missing name', () => {
    const issues = validateSchematicTemplate(
      copy((t) => {
        t.groups[1].id = t.groups[0].id;
        t.name = ' ';
      }),
    );
    expect(issues).toHaveLength(2);
  });
});
