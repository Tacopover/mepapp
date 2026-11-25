import { describe, expect, it } from 'vitest';
import { migrateConcurrencyNames, migrateTemplateConcurrencyNames, renameConcurrencyInBinding, renameConcurrencyInExpression } from './concurrency-rename.js';
import { parseBinding, parseExpression, renderBinding } from './schematic-expression.js';

describe('renameConcurrencyInExpression', () => {
  it('renames the two old circuit paths', () => {
    expect(renameConcurrencyInExpression('circuit.diversityPercent')).toBe('circuit.concurrencyPercent');
    expect(renameConcurrencyInExpression('sum(circuit.diversifiedCapacity) / 2')).toBe('sum(circuit.concurrentCapacity) / 2');
    expect(renameConcurrencyInExpression('circuit.diversityPercent + circuit.diversityPercent')).toBe('circuit.concurrencyPercent + circuit.concurrencyPercent');
  });

  it('renames the indexed and the quoted path forms, and the renamed text still parses', () => {
    expect(renameConcurrencyInExpression('sum(circuit[*].diversityPercent)')).toBe('sum(circuit[*].concurrencyPercent)');
    expect(renameConcurrencyInExpression('circuit."diversifiedCapacity"')).toBe('circuit."concurrentCapacity"');
    expect(renameConcurrencyInExpression('circuit."diversityPercent')).toBe('circuit."diversityPercent');
    expect(() => parseExpression(renameConcurrencyInExpression('sum(circuit[*].diversityPercent)'))).not.toThrow();
    expect(() => parseExpression(renameConcurrencyInExpression('circuit."diversifiedCapacity"'))).not.toThrow();
    expect(() => parseBinding(renameConcurrencyInBinding('{circuit[*].diversityPercent} · {circuit."diversifiedCapacity"}'))).not.toThrow();
  });

  it('keeps a path that only looks similar and the new names', () => {
    expect(renameConcurrencyInExpression('x.circuit.diversityPercent')).toBe('x.circuit.diversityPercent');
    expect(renameConcurrencyInExpression('circuit.diversityPercentage')).toBe('circuit.diversityPercentage');
    expect(renameConcurrencyInExpression('circuit.concurrencyPercent')).toBe('circuit.concurrencyPercent');
    expect(renameConcurrencyInExpression('circuit.concurrentCapacity')).toBe('circuit.concurrentCapacity');
  });
});

describe('renameConcurrencyInBinding', () => {
  it('renames only the text inside the braces', () => {
    expect(renameConcurrencyInBinding('{circuit.diversifiedCapacity} · {circuit.diversityPercent}%')).toBe('{circuit.concurrentCapacity} · {circuit.concurrencyPercent}%');
    expect(renameConcurrencyInBinding('{circuit.diversityPercent:1}')).toBe('{circuit.concurrencyPercent:1}');
  });

  it('keeps a literal double brace and the text outside the braces', () => {
    expect(renameConcurrencyInBinding('{{circuit.diversityPercent}}')).toBe('{{circuit.diversityPercent}}');
    expect(renameConcurrencyInBinding('Note: circuit.diversityPercent')).toBe('Note: circuit.diversityPercent');
  });

  it('keeps an unclosed brace unchanged and does not throw', () => {
    expect(renameConcurrencyInBinding('{circuit.diversityPercent')).toBe('{circuit.diversityPercent');
  });
});

describe('migrateTemplateConcurrencyNames', () => {
  const oldTemplate = {
    id: 'old-plan',
    name: 'Diversified plan',
    description: 'A table with diversity',
    layoutBlocks: [{ id: 'title', type: 'titleBlock', x: 0, y: 0, binding: '{circuit.diversityPercent}' }],
    groups: [{ id: 'standard', name: 'Standard', blocks: [{ id: 'derived', type: 'derivedCell', x: 0, y: 0, binding: '{circuit.diversifiedCapacity}' }] }],
    fields: [{ id: 'note', label: 'Note', type: 'text', scope: 'schematic', defaultBinding: '{circuit.diversityPercent}%' }],
  };
  const totals = {
    id: 'totals',
    type: 'totalsTable',
    x: 0,
    y: 0,
    tableRows: [
      { label: 'Diversified VA', formula: 'sum(circuit.diversifiedCapacity)' },
      { label: 'Diversified VA', formula: 'sum(circuit.capacity)' },
      { label: 'My diversity note', formula: 'sum(circuit.diversifiedCapacity)' },
    ],
  };

  it('renames the bindings, the table rows and the field defaults, and keeps the names and labels the user typed', () => {
    const template = { ...oldTemplate, layoutBlocks: [...oldTemplate.layoutBlocks, totals] };
    expect(migrateTemplateConcurrencyNames(template)).toEqual({
      id: 'old-plan',
      name: 'Diversified plan',
      description: 'A table with diversity',
      layoutBlocks: [
        { id: 'title', type: 'titleBlock', x: 0, y: 0, binding: '{circuit.concurrencyPercent}' },
        {
          id: 'totals',
          type: 'totalsTable',
          x: 0,
          y: 0,
          tableRows: [
            { label: 'Concurrent VA', formula: 'sum(circuit.concurrentCapacity)' },
            { label: 'Diversified VA', formula: 'sum(circuit.capacity)' },
            { label: 'My diversity note', formula: 'sum(circuit.concurrentCapacity)' },
          ],
        },
      ],
      groups: [{ id: 'standard', name: 'Standard', blocks: [{ id: 'derived', type: 'derivedCell', x: 0, y: 0, binding: '{circuit.concurrentCapacity}' }] }],
      fields: [{ id: 'note', label: 'Note', type: 'text', scope: 'schematic', defaultBinding: '{circuit.concurrencyPercent}%' }],
    });
  });

  it('passes a non-object through and keeps a template without blocks', () => {
    expect(migrateTemplateConcurrencyNames(5)).toBe(5);
    expect(migrateTemplateConcurrencyNames(null)).toBeNull();
    expect(migrateTemplateConcurrencyNames({ id: 'empty', name: 'Empty' })).toEqual({ id: 'empty', name: 'Empty' });
  });

  it('does not change the input', () => {
    const before = structuredClone(oldTemplate);
    migrateTemplateConcurrencyNames(oldTemplate);
    expect(oldTemplate).toEqual(before);
  });
});

describe('migrateConcurrencyNames', () => {
  const oldTemplate = {
    id: 'old-plan',
    name: 'Old plan',
    layoutBlocks: [{ id: 'title', type: 'titleBlock', x: 0, y: 0, binding: '{circuit.diversityPercent}' }],
    groups: [],
    fields: [],
  };
  const document = {
    networkTypes: [{ id: 'supply-air' }],
    stampLabelLayouts: {},
    circuits: [
      { id: 'c1', number: 1, panelId: 'p1', diversityPercent: 80 },
      { id: 'c2', number: 2, panelId: 'p1' },
      { id: 'c3', number: 3, panelId: 'p1', diversityPercent: 60, concurrencyPercent: 70 },
      null,
      5,
    ],
    panels: [
      { id: 'p1', circuitDefaults: { prefix: 'A', diversityPercent: 90 } },
      { id: 'p2' },
    ],
    schematics: [
      {
        id: 's1',
        panelId: 'p1',
        template: oldTemplate,
        extras: [{ id: 'freeItem-1', type: 'freeItem', x: 0, y: 0, rotation: 0, binding: '{circuit.diversityPercent}' }],
      },
    ],
  };

  it('renames the circuit and panel default fields', () => {
    const migrated = migrateConcurrencyNames(document);
    expect(migrated.circuits).toEqual([
      { id: 'c1', number: 1, panelId: 'p1', concurrencyPercent: 80 },
      { id: 'c2', number: 2, panelId: 'p1' },
      { id: 'c3', number: 3, panelId: 'p1', concurrencyPercent: 70 },
      null,
      5,
    ]);
    expect('diversityPercent' in (migrated.circuits as object[])[0]!).toBe(false);
    expect('diversityPercent' in (migrated.circuits as object[])[2]!).toBe(false);
    expect(migrated.panels).toEqual([
      { id: 'p1', circuitDefaults: { prefix: 'A', concurrencyPercent: 90 } },
      { id: 'p2' },
    ]);
  });

  it('renames the template copy and the extras of a saved schematic', () => {
    const migrated = migrateConcurrencyNames(document);
    expect(migrated.schematics).toEqual([
      {
        id: 's1',
        panelId: 'p1',
        template: { ...oldTemplate, layoutBlocks: [{ id: 'title', type: 'titleBlock', x: 0, y: 0, binding: '{circuit.concurrencyPercent}' }] },
        extras: [{ id: 'freeItem-1', type: 'freeItem', x: 0, y: 0, rotation: 0, binding: '{circuit.concurrencyPercent}' }],
      },
    ]);
  });

  it('adds no key to a document without circuits, panels or schematics', () => {
    const bare = { networkTypes: [], segments: [] };
    const migrated = migrateConcurrencyNames(bare);
    expect(migrated).toEqual(bare);
    expect(Object.keys(migrated)).toEqual(['networkTypes', 'segments']);
  });

  it('keeps the other fields of the document', () => {
    const migrated = migrateConcurrencyNames(document);
    expect(migrated.networkTypes).toEqual(document.networkTypes);
    expect(migrated.stampLabelLayouts).toEqual(document.stampLabelLayouts);
  });

  it('does not change the input', () => {
    const before = structuredClone(document);
    migrateConcurrencyNames(document);
    expect(document).toEqual(before);
  });

  it('gives the same result when it runs a second time', () => {
    expect(migrateConcurrencyNames(migrateConcurrencyNames(document))).toEqual(migrateConcurrencyNames(document));
  });
});

describe('an old expression name that is not migrated', () => {
  it('renders blank, because the parser has no list of known names', () => {
    // The parser has no list of known names. A name it does not know shows blank, so the migration is what keeps old templates working.
    expect(renderBinding(parseBinding('{circuit.diversityPercent}'), { circuit: { concurrencyPercent: 80 } }, { decimalSeparator: '.' })).toBe('');
  });
});
