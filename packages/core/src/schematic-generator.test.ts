import { describe, expect, it } from 'vitest';
import type { Circuit, Panel, PanelSection } from './circuit.js';
import { circuitMatchesRule, generateSchematic, orderPanelCircuits, type ResolvedBlock, type SchematicInput } from './schematic-generator.js';
import { SCHEMATIC_TEMPLATE_LIBRARY, getSchematicTemplateFromLibrary } from './schematic-template-library.js';
import type { CircuitGroupDefinition, SchematicBlock, SchematicTemplate } from './schematic-template.js';

const panel: Panel = {
  id: 'panel-1',
  equipmentStampId: 'stamp-1',
  name: 'HKantoor',
  sortDirection: 'ascending',
  mainDevice: { label: 'Q1A/160A', ratingA: 160 },
  feederCable: { type: 'B2CA', crossSectionMm2: 25, lengthM: 23 },
  accessories: [{ id: 'acc-1', kind: 'currentTransformer', label: 'CT-L1' }],
  sectionIds: ['sec-a', 'sec-b'],
  circuitDefaults: { prefix: 'A', phase: 'L1', diversityPercent: 100, cable: { type: 'B2CA', coreCount: 3, crossSectionMm2: 2.5 } },
};

const sections: PanelSection[] = [
  { id: 'sec-b', panelId: 'panel-1', name: 'Preferent B', order: 2 },
  { id: 'sec-a', panelId: 'panel-1', name: 'Preferent A', order: 1 },
  { id: 'sec-other', panelId: 'panel-2', name: 'Elsewhere', order: 1 },
];

function circuit(id: string, number: number, overrides: Partial<Circuit> = {}): Circuit {
  return { id, number, panelId: 'panel-1', terminalIds: [], isSpare: false, ...overrides };
}

const circuits: Circuit[] = [
  circuit('c3', 3, { sectionId: 'sec-b', isSpare: true }),
  circuit('c1', 1, { sectionId: 'sec-a', terminalIds: ['t1', 't2'], customName: 'Verlichting', circuitTypeId: 'lighting', device: { kind: 'breaker', curve: 'B', ratingA: 16, rcdMilliamps: 30 }, cable: { lengthM: 33 } }),
  circuit('c2', 2, { sectionId: 'sec-a', terminalIds: ['t3'], diversityPercent: 50, phase: 'L1L2L3', device: { kind: 'breaker', curve: 'C', ratingA: 20 }, cable: { lengthM: 12 } }),
  circuit('c4', 4, { terminalIds: ['t4'] }),
  circuit('elsewhere', 1, { panelId: 'panel-2' }),
];

const input: SchematicInput = {
  panel,
  circuits,
  sections,
  terminals: {
    t1: { capacity: 100, loadType: 'light', stampDefinitionId: 'luminaire' },
    t2: { capacity: 60, loadType: 'light' },
    t3: { capacity: 300, loadType: 'socket', stampDefinitionId: 'socket' },
    t4: { capacity: 10, loadType: 'socket' },
  },
  circuitTypes: [{ id: 'lighting', name: 'Lighting', abbreviation: 'LGT', description: '', units: 'W', defaultCapacity: 200 }],
};

function block(id: string, type: SchematicBlock['type'], x: number, y: number, extra: Partial<SchematicBlock> = {}): SchematicBlock {
  return { id, type, x, y, rotation: 0, ...extra };
}

function template(overrides: Partial<SchematicTemplate> = {}, groups?: CircuitGroupDefinition[]): SchematicTemplate {
  return {
    id: 't',
    name: 'Test',
    description: '',
    locale: 'NL',
    sheet: { widthMm: 420, heightMm: 297 },
    numberFormat: { decimalSeparator: ',' },
    layoutBlocks: [],
    groupAnchor: { x: 10, y: 20 },
    groups: groups ?? [
      { id: 'spare', name: 'Spare', rule: { kind: 'spare' }, direction: 'row', pitch: 5, blocks: [block('num', 'circuitNumber', 0, 0)] },
      { id: 'std', name: 'Standard', rule: { kind: 'any' }, direction: 'row', pitch: 10, blocks: [block('num', 'circuitNumber', 0, 0), block('dev', 'protectiveDevice', 1, 2)] },
    ],
    ...overrides,
  };
}

const byId = (blocks: ResolvedBlock[], suffix: string) => blocks.find((b) => b.id.endsWith(suffix));

describe('orderPanelCircuits', () => {
  it('keeps only the panel circuits, ordered by section then number, circuits without a section last', () => {
    expect(orderPanelCircuits(panel, circuits, sections).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('reverses the numbers inside each section for a descending panel, but not the sections', () => {
    const descending = { ...panel, sortDirection: 'descending' as const };
    expect(orderPanelCircuits(descending, circuits, sections).map((c) => c.id)).toEqual(['c2', 'c1', 'c3', 'c4']);
  });

  it('does not change the input arrays', () => {
    const before = circuits.map((c) => c.id);
    orderPanelCircuits(panel, circuits, sections);
    expect(circuits.map((c) => c.id)).toEqual(before);
  });
});

describe('circuitMatchesRule', () => {
  const normal = circuit('a', 5);
  const spare = circuit('b', 6, { isSpare: true });

  it('lets a spare match only spare and any rules', () => {
    expect(circuitMatchesRule({ kind: 'any' }, spare, undefined)).toBe(true);
    expect(circuitMatchesRule({ kind: 'spare' }, spare, undefined)).toBe(true);
    expect(circuitMatchesRule({ kind: 'circuitType', circuitTypeIds: ['x'] }, spare, 'x')).toBe(false);
    expect(circuitMatchesRule({ kind: 'circuitNumber', numbers: [6] }, spare, undefined)).toBe(false);
  });

  it('matches a normal circuit by type or number', () => {
    expect(circuitMatchesRule({ kind: 'spare' }, normal, undefined)).toBe(false);
    expect(circuitMatchesRule({ kind: 'circuitType', circuitTypeIds: ['x', 'y'] }, normal, 'y')).toBe(true);
    expect(circuitMatchesRule({ kind: 'circuitType', circuitTypeIds: ['x'] }, normal, undefined)).toBe(false);
    expect(circuitMatchesRule({ kind: 'circuitNumber', numbers: [1, 5] }, normal, undefined)).toBe(true);
  });
});

describe('generateSchematic layout', () => {
  it('advances each circuit by its own group pitch, from the anchor plus origin', () => {
    const result = generateSchematic(input, template(), { origin: { x: 100, y: 0 } });
    expect(result.circuitOrder).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(result.circuitOrigins).toEqual({ c1: { x: 110, y: 20 }, c2: { x: 120, y: 20 }, c3: { x: 130, y: 20 }, c4: { x: 135, y: 20 } });
  });

  it('advances downward for a column direction', () => {
    const groups: CircuitGroupDefinition[] = [{ id: 'g', name: 'g', rule: { kind: 'any' }, direction: 'column', pitch: 8, blocks: [block('num', 'circuitNumber', 3, 1)] }];
    const result = generateSchematic(input, template({}, groups));
    expect(result.circuitOrigins.c2).toEqual({ x: 10, y: 28 });
    expect(byId(result.blocks, 'c2/num')).toMatchObject({ x: 13, y: 29 });
  });

  it('offsets a group block by its own x and y', () => {
    const result = generateSchematic(input, template());
    expect(byId(result.blocks, 'c2/dev')).toMatchObject({ x: 10 + 10 + 1, y: 22, groupId: 'std', circuitId: 'c2', scope: 'circuit' });
  });

  it('picks the first group whose rule matches, so a spare uses the spare group', () => {
    const result = generateSchematic(input, template());
    expect(result.blocks.filter((b) => b.circuitId === 'c3').map((b) => b.groupId)).toEqual(['spare']);
    expect(result.blocks.filter((b) => b.circuitId === 'c1').map((b) => b.groupId)).toEqual(['std', 'std']);
  });

  it('reports a circuit no group matches and lays out the rest', () => {
    const groups: CircuitGroupDefinition[] = [{ id: 'g', name: 'g', rule: { kind: 'circuitNumber', numbers: [1] }, direction: 'row', pitch: 10, blocks: [block('num', 'circuitNumber', 0, 0)] }];
    const result = generateSchematic(input, template({}, groups));
    expect(result.circuitOrder).toEqual(['c1']);
    expect(result.diagnostics.filter((d) => d.kind === 'no-matching-group').map((d) => (d as { circuitId: string }).circuitId)).toEqual(['c2', 'c3', 'c4']);
  });

  it('uses the circuit type a panel default supplies when matching a rule', () => {
    const withDefaultType: SchematicInput = { ...input, panel: { ...panel, circuitDefaults: { ...panel.circuitDefaults, circuitTypeId: 'lighting' } } };
    const groups: CircuitGroupDefinition[] = [
      { id: 'lit', name: 'lit', rule: { kind: 'circuitType', circuitTypeIds: ['lighting'] }, direction: 'row', pitch: 10, blocks: [block('num', 'circuitNumber', 0, 0)] },
      { id: 'spare', name: 'spare', rule: { kind: 'spare' }, direction: 'row', pitch: 10, blocks: [] },
    ];
    expect(generateSchematic(withDefaultType, template({}, groups)).circuitOrder).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('gives every block a stable id built from panel, scope owner and template block id', () => {
    const first = generateSchematic(input, template());
    const second = generateSchematic(input, template());
    expect(first.blocks.map((b) => b.id)).toEqual(second.blocks.map((b) => b.id));
    expect(byId(first.blocks, 'c1/num')?.id).toBe('panel-1/c1/num');
  });

  it('lays out nothing for a panel without circuits', () => {
    const result = generateSchematic({ ...input, circuits: [] }, template());
    expect(result.blocks).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('generateSchematic bindings', () => {
  const groups: CircuitGroupDefinition[] = [
    {
      id: 'g',
      name: 'g',
      rule: { kind: 'any' },
      direction: 'row',
      pitch: 10,
      blocks: [
        block('num', 'circuitNumber', 0, 0),
        block('dev', 'protectiveDevice', 0, 0),
        block('cable', 'cableText', 0, 0),
        block('conductor', 'conductor', 0, 0),
        block('phase', 'phaseLabel', 0, 0),
        block('name', 'description', 0, 0),
        block('count', 'countCell', 0, 0),
        block('div', 'derivedCell', 0, 0),
        block('l1', 'customAnnotation', 0, 0, { binding: 'L1={circuit.capacityL1:1} L2={circuit.capacityL2:1} L3={circuit.capacityL3:1}' }),
        block('type', 'customAnnotation', 0, 0, { binding: '{circuitType.abbreviation}' }),
        block('sec', 'customAnnotation', 0, 0, { binding: '{section.name}' }),
        block('light', 'countCell', 0, 0, { loadTypeFilter: 'light', binding: '{count(terminals)}/{sum(terminal.capacity)}' }),
      ],
    },
  ];
  const result = generateSchematic(input, template({}, groups));
  const text = (circuitId: string, blockId: string) => byId(result.blocks, `${circuitId}/${blockId}`)?.text;

  it('resolves a panel default prefix, phase and cable, and a circuit override', () => {
    expect(text('c1', 'num')).toBe('A1');
    expect(text('c1', 'phase')).toBe('L1');
    expect(text('c1', 'conductor')).toBe('3x');
    expect(text('c2', 'phase')).toBe('L1L2L3');
  });

  it('formats the device label with the RCD sensitivity', () => {
    expect(text('c1', 'dev')).toBe('B16/30mA');
    expect(text('c2', 'dev')).toBe('C20');
  });

  it('formats cable text with the template decimal separator and the typed length', () => {
    expect(text('c1', 'cable')).toBe('B2CA 3G2,5 mm²  l=33 m');
    expect(text('c2', 'cable')).toBe('B2CA 3G2,5 mm²  l=12 m');
  });

  it('sums terminal capacity, and applies the diversity factor', () => {
    expect(text('c1', 'count')).toBe('2 (160VA)');
    expect(text('c1', 'div')).toBe('160 · 100%');
    expect(text('c2', 'div')).toBe('150 · 50%');
  });

  it('splits capacity across phases', () => {
    expect(text('c1', 'l1')).toBe('L1=160,0 L2=0,0 L3=0,0');
    expect(text('c2', 'l1')).toBe('L1=100,0 L2=100,0 L3=100,0');
  });

  it('narrows the terminals a cell sees with the load type filter', () => {
    expect(text('c1', 'light')).toBe('2/160');
    expect(text('c2', 'light')).toBe('0/0');
  });

  it('exposes the circuit type and section, and blank for a circuit with none', () => {
    expect(text('c1', 'type')).toBe('LGT');
    expect(text('c2', 'type')).toBe('');
    expect(text('c1', 'sec')).toBe('Preferent A');
    expect(text('c4', 'sec')).toBe('');
  });

  it('gives a block with no default binding and no binding no text', () => {
    const loose = generateSchematic(input, template({}, [{ id: 'g', name: 'g', rule: { kind: 'any' }, direction: 'row', pitch: 10, blocks: [block('load', 'loadSymbol', 0, 0)] }]));
    expect(byId(loose.blocks, 'c1/load')?.text).toBeUndefined();
  });

  it('names the stamp definition of the first assigned terminal that has one, for a load symbol', () => {
    const loads = generateSchematic(input, template({}, [{ id: 'g', name: 'g', rule: { kind: 'any' }, direction: 'row', pitch: 10, blocks: [block('load', 'loadSymbol', 0, 0)] }]));
    expect(byId(loads.blocks, 'c1/load')?.loadStampDefinitionId).toBe('luminaire');
    expect(byId(loads.blocks, 'c3/load')?.loadStampDefinitionId).toBeUndefined();
  });

  it('reports a bad binding for every circuit it is resolved for and renders blank text', () => {
    const bad = generateSchematic(input, template({}, [{ id: 'g', name: 'g', rule: { kind: 'any' }, direction: 'row', pitch: 10, blocks: [block('oops', 'description', 0, 0, { binding: '{1 +}' })] }]));
    expect(byId(bad.blocks, 'c1/oops')?.text).toBe('');
    expect(bad.diagnostics.filter((d) => d.kind === 'binding-error').length).toBe(4);
  });
});

describe('generateSchematic layout blocks', () => {
  const layoutTemplate = template({
    layoutBlocks: [
      block('frame', 'frame', 6, 6, { width: 400, height: 250 }),
      block('feed', 'feedCable', 12, 14),
      block('main', 'mainDevice', 14, 26),
      block('acc', 'accessoryDevice', 30, 26),
      block('sec', 'section', -2, -3, { height: 40 }),
      block('sum', 'aggregateCell', 0, 200),
      block('spares', 'aggregateCell', 30, 200, { binding: '{count(circuit)} circuits, {count(spares)} spare, {panel.spareCount}' }),
      block('light', 'aggregateCell', 60, 200, { loadTypeFilter: 'light', binding: '{count(terminals)}' }),
      block('title', 'titleBlock', 300, 250, { binding: 'Project {panel.name}' }),
    ],
  });
  const result = generateSchematic(input, layoutTemplate, { origin: { x: 5, y: 5 } });

  it('positions once, panel and aggregate blocks from the origin and resolves panel bindings', () => {
    expect(byId(result.blocks, '/-/frame')).toMatchObject({ x: 11, y: 11, width: 400, height: 250, scope: 'panel' });
    expect(byId(result.blocks, '/-/feed')?.text).toBe('B2CA 25 mm²  l=23 m');
    expect(byId(result.blocks, '/-/main')?.text).toBe('Q1A/160A');
    expect(byId(result.blocks, '/-/acc')?.text).toBe('CT-L1');
    expect(byId(result.blocks, '/-/title')?.text).toBe('Project HKantoor');
  });

  it('sums over the non-spare circuits for an aggregate cell', () => {
    expect(byId(result.blocks, '/-/sum')?.text).toBe('Σ 470 VA');
    expect(byId(result.blocks, '/-/spares')?.text).toBe('3 circuits, 1 spare, 1');
    expect(byId(result.blocks, '/-/light')?.text).toBe('2');
  });

  it('draws one section block per section that has circuits, spanning its circuits along the repeat direction', () => {
    const sectionBlocks = result.blocks.filter((b) => b.type === 'section');
    expect(sectionBlocks.map((b) => [b.id, b.text])).toEqual([
      ['panel-1/sec-a/sec', 'Preferent A'],
      ['panel-1/sec-b/sec', 'Preferent B'],
    ]);
    // Section A holds c1 and c2 (pitch 10 each, from the anchor at x=15); section B holds only the spare c3 (pitch 5).
    expect(sectionBlocks[0]).toMatchObject({ x: 15 - 2, y: 25 - 3, width: 20, height: 40, sectionId: 'sec-a' });
    expect(sectionBlocks[1]).toMatchObject({ x: 35 - 2, width: 5 });
  });

  it('spans a section along y for a column direction', () => {
    const columnGroups: CircuitGroupDefinition[] = [{ id: 'g', name: 'g', rule: { kind: 'any' }, direction: 'column', pitch: 8, blocks: [] }];
    const columns = generateSchematic(input, template({ layoutBlocks: [block('sec', 'section', 0, 0, { width: 50 })] }, columnGroups));
    expect(columns.blocks[0]).toMatchObject({ width: 50, height: 16, y: 20 });
  });

  it('draws no section block for a panel without sections', () => {
    const noSections = generateSchematic({ ...input, circuits: [circuit('c9', 1)] }, layoutTemplate);
    expect(noSections.blocks.some((b) => b.type === 'section')).toBe(false);
  });
});

describe('generateSchematic totals table', () => {
  const rows = [
    { label: 'Count', formula: 'count(terminals)' },
    { label: 'Total VA', formula: 'sum(circuit.capacity)' },
    { label: 'Bad', formula: '1 +' },
  ];

  it('evaluates each row once, in aggregate scope, by default', () => {
    const result = generateSchematic(input, template({ layoutBlocks: [block('t', 'totalsTable', 0, 0, { tableRows: rows })] }));
    const table = result.blocks.find((b) => b.type === 'totalsTable')?.table;
    expect(table).toEqual({ columns: 'panel', rows: [{ label: 'Count', values: ['4'] }, { label: 'Total VA', values: ['470'] }, { label: 'Bad', values: [''] }] });
    expect(result.diagnostics).toHaveLength(1);
  });

  it('evaluates each row once per circuit, in layout order, for circuit columns', () => {
    const result = generateSchematic(input, template({ layoutBlocks: [block('t', 'totalsTable', 0, 0, { tableRows: rows.slice(0, 2), tableColumns: 'circuits' })] }));
    const table = result.blocks.find((b) => b.type === 'totalsTable')?.table;
    expect(table?.rows[0].values).toEqual(['2', '1', '0', '1']);
    expect(table?.rows[1].values).toEqual(['160', '300', '0', '10']);
  });
});

describe('built-in templates', () => {
  it('ships a rows and a columns template with unique ids', () => {
    expect(SCHEMATIC_TEMPLATE_LIBRARY.map((t) => t.id)).toEqual(['builtin-rows-nl', 'builtin-columns-nl']);
    expect(getSchematicTemplateFromLibrary('builtin-rows-nl')?.groups[0].direction).toBe('column');
    expect(getSchematicTemplateFromLibrary('builtin-columns-nl')?.groups[0].direction).toBe('row');
    expect(getSchematicTemplateFromLibrary('nope')).toBeUndefined();
  });

  it.each(SCHEMATIC_TEMPLATE_LIBRARY.map((t) => [t.name, t] as const))('generates the %s template for a panel with sections, spares and a mixed circuit', (_name, builtIn) => {
    const result = generateSchematic(input, builtIn);
    expect(result.diagnostics).toEqual([]);
    expect(result.circuitOrder).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(result.blocks.filter((b) => b.type === 'busbar')).toHaveLength(1);
    expect(result.blocks.filter((b) => b.type === 'section').map((b) => b.text)).toEqual(['Preferent A', 'Preferent B']);
    const standardCircuitBlocks = result.blocks.filter((b) => b.circuitId === 'c1').length;
    const spareCircuitBlocks = result.blocks.filter((b) => b.circuitId === 'c3').length;
    expect(spareCircuitBlocks).toBeGreaterThan(0);
    expect(spareCircuitBlocks).toBeLessThan(standardCircuitBlocks);
    expect(result.blocks.find((b) => b.circuitId === 'c1' && b.type === 'circuitNumber')?.text).toBe('A1');
    expect(result.blocks.find((b) => b.circuitId === 'c1' && b.type === 'protectiveDevice')?.text).toBe('B16/30mA');
    const totals = result.blocks.find((b) => b.type === 'totalsTable')?.table;
    expect(totals?.rows.find((r) => r.label === 'Total VA')?.values).toEqual(['470']);
    expect(totals?.rows.find((r) => r.label === 'L1 VA')?.values).toEqual(['270']);
    expect(totals?.rows.find((r) => r.label === 'L2 VA')?.values).toEqual(['100']);
  });

  it.each(SCHEMATIC_TEMPLATE_LIBRARY.map((t) => [t.name, t] as const))('fits a 40-circuit board, the size of the OV example, on the %s sheet', (_name, builtIn) => {
    const many: Circuit[] = Array.from({ length: 40 }, (_, i) => circuit(`n${i + 1}`, i + 1, { terminalIds: ['t4'] }));
    const result = generateSchematic({ ...input, circuits: many }, builtIn);
    expect(result.diagnostics).toEqual([]);
    expect(result.circuitOrder).toHaveLength(40);
    for (const b of result.blocks) {
      expect(b.x + b.width, `${b.id} right edge`).toBeLessThanOrEqual(builtIn.sheet.widthMm);
      expect(b.y + b.height, `${b.id} bottom edge`).toBeLessThanOrEqual(builtIn.sheet.heightMm);
    }
  });
});
