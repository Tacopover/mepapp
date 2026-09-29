// Built-in schematic templates (electrical-schematic-templates.md §8, "Suggested
// built-in templates: one with circuits as columns (like OV) and one with
// circuits as rows (like E60)"). Built from the Phase 0 mockup seeds, in sheet
// mm on an A1 landscape sheet, the size of the OV example (E60 is A0), so 40 circuits fit. Positions are a first layout, not final art:
// the schematic view (Phase 4) shows them and the template editor (Phase 5)
// is where they get tuned. Where a template will live once a user can edit it
// (per installation or per document) is plan open question 1.

import type { CircuitGroupDefinition, SchematicBlock, SchematicFieldDefinition, SchematicBlockType, SchematicTemplate, TotalsTableRow } from './schematic-template.js';

function block(id: string, type: SchematicBlockType, x: number, y: number, extra: Partial<SchematicBlock> = {}): SchematicBlock {
  return { id, type, x, y, rotation: 0, ...extra };
}

const TOTALS_ROWS: TotalsTableRow[] = [
  { label: 'Circuits', formula: 'count(circuit)' },
  { label: 'Total VA', formula: 'sum(circuit.capacity)' },
  { label: 'Diversified VA', formula: 'sum(circuit.diversifiedCapacity)' },
  { label: 'L1 VA', formula: 'sum(circuit.capacityL1)' },
  { label: 'L2 VA', formula: 'sum(circuit.capacityL2)' },
  { label: 'L3 VA', formula: 'sum(circuit.capacityL3)' },
];

const NL_NUMBER_FORMAT = { decimalSeparator: ',' } as const;

const NL_FIELDS: SchematicFieldDefinition[] = [
  { id: 'projectName', label: 'Project name', type: 'text', scope: 'project' },
  { id: 'client', label: 'Client', type: 'text', scope: 'project' },
  { id: 'title', label: 'Drawing title', type: 'text', scope: 'schematic', defaultBinding: 'Distribution board {panel.name}' },
  { id: 'author', label: 'Drawn by', type: 'text', scope: 'schematic' },
  { id: 'date', label: 'Date', type: 'date', scope: 'schematic', defaultToday: true },
  { id: 'revision', label: 'Revision', type: 'text', scope: 'schematic', defaultBinding: '0' },
];

const TITLE_BINDING = '{field.projectName}\n{field.title}\n[Client: {field.client}\n][Drawn by: {field.author}   ][Date: {field.date}   ][Rev: {field.revision}]';

/** Circuits as rows, like the E60 example: the busbar runs down the left and each circuit is one line to its right. */
const ROWS_TEMPLATE: SchematicTemplate = (() => {
  const standardBlocks: SchematicBlock[] = [
    block('num', 'circuitNumber', 0, 1),
    block('device', 'protectiveDevice', 14, 0, { height: 8 }),
    block('conductor', 'conductor', 26, 1.5),
    block('cable', 'cableText', 40, 0, { height: 8 }),
    block('desc', 'description', 88, 1),
    block('load', 'loadSymbol', 132, 0),
    block('count', 'countCell', 144, 0.5),
    block('derived', 'derivedCell', 168, 0.5),
  ];
  const groups: CircuitGroupDefinition[] = [
    { id: 'spare', name: 'Spare', rule: { kind: 'spare' }, direction: 'column', pitch: 8, blocks: [standardBlocks[0], standardBlocks[1]] },
    { id: 'standard', name: 'Standard', rule: { kind: 'any' }, direction: 'column', pitch: 8, blocks: standardBlocks },
  ];
  return {
    id: 'builtin-rows-nl',
    name: 'Rows (NL)',
    description: 'Distribution board schedule with one line per circuit, busbar on the left.',
    locale: 'NL',
    sheet: { widthMm: 841, heightMm: 594 },
    numberFormat: NL_NUMBER_FORMAT,
    layoutBlocks: [
      block('frame', 'frame', 6, 6, { width: 829, height: 582, style: { strokeWidthMm: 0.5, dash: 'dashed' } }),
      block('title', 'titleBlock', 735, 546, { binding: TITLE_BINDING }),
      block('feed', 'feedCable', 12, 14),
      block('main', 'mainDevice', 14, 26),
      block('bus', 'busbar', 30, 40, { width: 2 }),
      block('section', 'section', -4, 0, { width: 198 }),
      block('totals', 'totalsTable', 12, 546, { tableRows: TOTALS_ROWS }),
    ],
    groupAnchor: { x: 40, y: 44 },
    groups,
    fields: NL_FIELDS.map((f) => ({ ...f })),
  };
})();

/** Circuits as columns, like the OV example: the busbar runs across the top and each circuit hangs below it. Text is rotated 90°. */
const COLUMNS_TEMPLATE: SchematicTemplate = (() => {
  // A rotated block turns on its centre, so x/y here place the unrotated box such that the turned box's top-left lands at (visualX, visualY).
  const turned = (id: string, type: SchematicBlockType, visualX: number, visualY: number, width: number, height: number): SchematicBlock =>
    block(id, type, visualX + height / 2 - width / 2, visualY + width / 2 - height / 2, { width, height, rotation: 90 });
  const standardBlocks: SchematicBlock[] = [
    block('device', 'protectiveDevice', 2, 0),
    block('phase', 'phaseLabel', 3, 11),
    turned('cable', 'cableText', 1, 18, 45, 8),
    turned('desc', 'description', 1, 66, 40, 8),
    block('num', 'circuitNumber', 1, 108, { width: 12 }),
    block('count', 'countCell', 1, 116, { width: 12, binding: '{count(terminals)}' }),
    block('derived', 'derivedCell', 1, 124, { width: 12, binding: '{circuit.diversifiedCapacity}' }),
  ];
  const groups: CircuitGroupDefinition[] = [
    { id: 'spare', name: 'Spare', rule: { kind: 'spare' }, direction: 'row', pitch: 14, blocks: [standardBlocks[0], standardBlocks[4]] },
    { id: 'standard', name: 'Standard', rule: { kind: 'any' }, direction: 'row', pitch: 14, blocks: standardBlocks },
  ];
  return {
    id: 'builtin-columns-nl',
    name: 'Columns (NL)',
    description: 'Distribution board schedule with one column per circuit, busbar across the top.',
    locale: 'NL',
    sheet: { widthMm: 841, heightMm: 594 },
    numberFormat: NL_NUMBER_FORMAT,
    layoutBlocks: [
      block('frame', 'frame', 6, 6, { width: 829, height: 582, style: { strokeWidthMm: 0.5, dash: 'dashed' } }),
      block('title', 'titleBlock', 735, 546, { binding: TITLE_BINDING }),
      block('feed', 'feedCable', 12, 14),
      block('main', 'mainDevice', 14, 26),
      block('bus', 'busbar', 30, 42, { height: 2 }),
      block('section', 'section', 0, -2, { height: 140 }),
      block('totals', 'totalsTable', 12, 546, { tableRows: TOTALS_ROWS }),
    ],
    groupAnchor: { x: 34, y: 46 },
    groups,
    fields: NL_FIELDS.map((f) => ({ ...f })),
  };
})();

export const SCHEMATIC_TEMPLATE_LIBRARY: SchematicTemplate[] = [ROWS_TEMPLATE, COLUMNS_TEMPLATE];

export function getSchematicTemplateFromLibrary(id: string): SchematicTemplate | undefined {
  return SCHEMATIC_TEMPLATE_LIBRARY.find((t) => t.id === id);
}
