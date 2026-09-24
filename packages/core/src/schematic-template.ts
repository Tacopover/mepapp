// Schematic template schema (electrical-schematic-templates.md §8) — pure
// data, no rendering, no I/O. Every property a template holds is saved; the
// old app lost rotation, scale and colors on reload (plan §4).
//
// Coordinates are sheet millimetres. A block's x/y is its top-left corner and
// its rotation (degrees, clockwise) pivots on the block's centre, the same
// convention as the Phase 0 mockup.

import { parseBinding, parseExpression, ExpressionError, type NumberFormat } from './schematic-expression.js';

/**
 * once = one instance on the sheet. panel = one per panel. section = one per
 * panel section that has circuits. circuit = repeats in the circuit group.
 * aggregate = sums or counts over the panel's circuits.
 */
export type SchematicBlockScope = 'once' | 'panel' | 'section' | 'circuit' | 'aggregate';

export type SchematicBlockType =
  | 'legend'
  | 'titleBlock'
  | 'freeItem'
  | 'feedCable'
  | 'mainDevice'
  | 'accessoryDevice'
  | 'busbar'
  | 'section'
  | 'frame'
  | 'circuitNumber'
  | 'protectiveDevice'
  | 'phaseLabel'
  | 'conductor'
  | 'cableText'
  | 'loadSymbol'
  | 'description'
  | 'customAnnotation'
  | 'countCell'
  | 'derivedCell'
  | 'aggregateCell'
  | 'totalsTable';

export interface SchematicBlockTypeInfo {
  label: string;
  scope: SchematicBlockScope;
  /** Default size in sheet mm, used when a block leaves width/height unset. */
  width: number;
  height: number;
  /** Binding used when a block leaves `binding` undefined. An explicit '' means "no text". */
  defaultBinding?: string;
}

export const SCHEMATIC_BLOCK_CATALOGUE: Record<SchematicBlockType, SchematicBlockTypeInfo> = {
  legend: { label: 'Table header / legend symbol', scope: 'once', width: 30, height: 8 },
  titleBlock: { label: 'Title block', scope: 'once', width: 100, height: 40 },
  freeItem: { label: 'Free text', scope: 'once', width: 30, height: 6 },
  feedCable: { label: 'Feed cable', scope: 'panel', width: 60, height: 8, defaultBinding: '[{panel.feederCable.type} {panel.feederCable.crossSectionMm2} mm²][  l={panel.feederCable.lengthM} m]' },
  mainDevice: { label: 'Main device', scope: 'panel', width: 12, height: 14, defaultBinding: '{panel.mainDevice.label}' },
  accessoryDevice: { label: 'Accessory device', scope: 'panel', width: 10, height: 10, defaultBinding: '{panel.accessories.label}' },
  /** The generator stretches a busbar along the repeat direction to cover every circuit, unless its size is set on that axis. */
  busbar: { label: 'Busbar', scope: 'panel', width: 250, height: 2 },
  section: { label: 'Section box and label', scope: 'section', width: 60, height: 20, defaultBinding: '{section.name}' },
  frame: { label: 'Frame', scope: 'panel', width: 400, height: 270 },
  circuitNumber: { label: 'Circuit number label', scope: 'circuit', width: 10, height: 6, defaultBinding: '{circuit.prefix}{circuit.number}' },
  protectiveDevice: { label: 'Protective device', scope: 'circuit', width: 10, height: 10, defaultBinding: '{device.label}' },
  phaseLabel: { label: 'Phase label', scope: 'circuit', width: 8, height: 5, defaultBinding: '{circuit.phase}' },
  conductor: { label: 'Cable line and conductor mark', scope: 'circuit', width: 12, height: 5, defaultBinding: '{cable.coreCount}x' },
  cableText: { label: 'Cable text', scope: 'circuit', width: 45, height: 10, defaultBinding: '[{cable.type} {cable.coreCount}G{cable.crossSectionMm2} mm²][  l={cable.lengthM} m]' },
  loadSymbol: { label: 'Load symbol', scope: 'circuit', width: 8, height: 8 },
  description: { label: 'Description text', scope: 'circuit', width: 40, height: 6, defaultBinding: '{circuit.customName}' },
  customAnnotation: { label: 'Custom annotation', scope: 'circuit', width: 32, height: 5, defaultBinding: '' },
  countCell: { label: 'Table cell: count and VA', scope: 'circuit', width: 22, height: 7, defaultBinding: '{count(terminals)} ({sum(terminal.capacity)}VA)' },
  derivedCell: { label: 'Table cell: derived value', scope: 'circuit', width: 22, height: 7, defaultBinding: '{circuit.diversifiedCapacity} · {circuit.diversityPercent}%' },
  aggregateCell: { label: 'Aggregate cell (sum, count)', scope: 'aggregate', width: 24, height: 8, defaultBinding: 'Σ {sum(circuit.capacity)} VA' },
  totalsTable: { label: 'Totals table', scope: 'aggregate', width: 90, height: 30 },
};

export interface SchematicBlockStyle {
  strokeWidthMm?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
  /** 0xRRGGBB. */
  color?: number;
  fontFamily?: string;
  fontSizeMm?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TotalsTableRow {
  label: string;
  /** A bare expression (no braces), evaluated in aggregate scope unless the table's `tableColumns` is 'circuits'. */
  formula: string;
}

export interface SchematicBlock {
  id: string;
  type: SchematicBlockType;
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
  /** Text with {expression} segments. undefined = the block type's default binding; '' = no text. */
  binding?: string;
  style?: SchematicBlockStyle;
  /** A symbol-library id that replaces the block's default vector art (mockup Round 3). */
  symbolId?: string;
  /** totalsTable only. */
  tableRows?: TotalsTableRow[];
  /** totalsTable only. 'panel' = one value per row; 'circuits' = one value per row and circuit, in circuit order. Default 'panel'. */
  tableColumns?: 'panel' | 'circuits';
  /** Circuit and aggregate scope: narrows `terminals` and `terminal.*` to terminals of this load type (plan §3: count and VA per load type). */
  loadTypeFilter?: string;
}

/**
 * Which circuits a group definition applies to. A spare circuit matches only a
 * `spare` or `any` rule. `circuitType` and `circuitNumber` never match a spare,
 * and `any` matches every circuit, so it works as a fallback.
 */
export type CircuitGroupRule =
  | { kind: 'any' }
  | { kind: 'spare' }
  | { kind: 'circuitType'; circuitTypeIds: string[] }
  | { kind: 'circuitNumber'; numbers: number[] };

export interface CircuitGroupDefinition {
  id: string;
  name: string;
  rule: CircuitGroupRule;
  /** row = each circuit sits to the right of the previous one; column = below it. */
  direction: 'row' | 'column';
  /** Distance in sheet mm from one circuit of this group to the next circuit. */
  pitch: number;
  /** Positions are relative to the group instance's origin. Every block here has circuit scope. */
  blocks: SchematicBlock[];
}

export interface SchematicTemplate {
  id: string;
  name: string;
  description: string;
  /** Free label such as "NL". Informational: the number format below is what the generator uses. */
  locale: string;
  sheet: { widthMm: number; heightMm: number };
  numberFormat: NumberFormat;
  /** Blocks of scope once, panel, section and aggregate, positioned on the sheet. */
  layoutBlocks: SchematicBlock[];
  /** Sheet position of the first circuit group instance. */
  groupAnchor: { x: number; y: number };
  /** Ordered: the first group whose rule matches a circuit is used for it. */
  groups: CircuitGroupDefinition[];
}

export function getBlockWidth(block: SchematicBlock): number {
  return block.width ?? SCHEMATIC_BLOCK_CATALOGUE[block.type].width;
}

export function getBlockHeight(block: SchematicBlock): number {
  return block.height ?? SCHEMATIC_BLOCK_CATALOGUE[block.type].height;
}

export function getBlockBindingSource(block: SchematicBlock): string | undefined {
  return block.binding ?? SCHEMATIC_BLOCK_CATALOGUE[block.type].defaultBinding;
}

function bindingIssue(where: string, source: string, kind: 'binding' | 'formula'): string | null {
  try {
    if (kind === 'binding') parseBinding(source);
    else parseExpression(source);
    return null;
  } catch (error) {
    if (error instanceof ExpressionError) return `${where}: ${error.message}`;
    throw error;
  }
}

function validateBlock(block: SchematicBlock, where: string, expectedScopes: SchematicBlockScope[], seenIds: Set<string>, issues: string[]): void {
  const info = SCHEMATIC_BLOCK_CATALOGUE[block.type];
  const name = `${where} block "${block.id}"`;
  if (!info) {
    issues.push(`${name} has unknown type "${String(block.type)}".`);
    return;
  }
  if (seenIds.has(block.id)) issues.push(`${name} reuses an id.`);
  seenIds.add(block.id);
  if (!expectedScopes.includes(info.scope)) issues.push(`${name} (${block.type}) has ${info.scope} scope and does not belong in ${where}.`);
  if (![block.x, block.y, block.rotation].every(Number.isFinite)) issues.push(`${name} has a position or rotation that is not a number.`);
  for (const [field, value] of [['width', block.width], ['height', block.height]] as const) {
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) issues.push(`${name} has a ${field} that is not a positive number.`);
  }
  const source = getBlockBindingSource(block);
  if (source) {
    const issue = bindingIssue(name, source, 'binding');
    if (issue) issues.push(issue);
  }
  for (const row of block.tableRows ?? []) {
    const issue = bindingIssue(`${name} row "${row.label}"`, row.formula, 'formula');
    if (issue) issues.push(issue);
  }
  if (block.type !== 'totalsTable' && (block.tableRows || block.tableColumns)) issues.push(`${name} sets table fields but is not a totalsTable.`);
}

/** The reasons a template cannot be generated from; an empty list means it is valid. Checks structure and that every binding parses. */
export function validateSchematicTemplate(template: SchematicTemplate): string[] {
  const issues: string[] = [];
  if (template.id.trim() === '') issues.push('The template needs an id.');
  if (template.name.trim() === '') issues.push('The template needs a name.');
  if (!(template.sheet.widthMm > 0 && template.sheet.heightMm > 0)) issues.push('The sheet size must be positive.');
  if (!Number.isFinite(template.groupAnchor.x) || !Number.isFinite(template.groupAnchor.y)) issues.push('The group anchor must be a position.');
  const seenIds = new Set<string>();
  for (const block of template.layoutBlocks) {
    validateBlock(block, 'the layout', ['once', 'panel', 'section', 'aggregate'], seenIds, issues);
  }
  const groupIds = new Set<string>();
  for (const group of template.groups) {
    if (groupIds.has(group.id)) issues.push(`Group "${group.id}" reuses an id.`);
    groupIds.add(group.id);
    if (!(Number.isFinite(group.pitch) && group.pitch > 0)) issues.push(`Group "${group.id}" needs a pitch above zero.`);
    if (group.direction !== template.groups[0]?.direction) issues.push(`Group "${group.id}" has direction "${group.direction}" but the first group has "${template.groups[0]?.direction}". All groups must have the same direction.`);
    const groupBlockIds = new Set<string>();
    for (const block of group.blocks) validateBlock(block, `group "${group.id}"`, ['circuit'], groupBlockIds, issues);
  }
  return issues;
}
