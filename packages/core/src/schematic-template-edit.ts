// Pure edit operations for the schematic template editor (electrical-schematic-
// templates.md Phase 5). Every function returns a new template and leaves its
// input untouched, so the editor can keep a history of snapshots. No rendering
// and no I/O.

import { CIRCUIT_TYPE_LIBRARY } from './circuit-type-library.js';
import type { Circuit, CircuitType, Panel, PanelSection } from './circuit.js';
import { circuitMatchesRule, type ResolvedBlock, type SchematicInput, type SchematicTerminalInfo } from './schematic-generator.js';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  type CircuitGroupDefinition,
  type CircuitGroupRule,
  type SchematicBlock,
  type SchematicBlockScope,
  type SchematicBlockType,
  type SchematicTemplate,
} from './schematic-template.js';

/** Points at one template block. `groupId` undefined means a layout block. */
export interface BlockRef {
  blockId: string;
  groupId?: string;
}

export function findBlock(template: SchematicTemplate, ref: BlockRef): SchematicBlock | undefined {
  const blocks = ref.groupId === undefined ? template.layoutBlocks : template.groups.find((g) => g.id === ref.groupId)?.blocks;
  return blocks?.find((b) => b.id === ref.blockId);
}

function mapCollection(template: SchematicTemplate, groupId: string | undefined, change: (blocks: SchematicBlock[]) => SchematicBlock[]): SchematicTemplate {
  if (groupId === undefined) return { ...template, layoutBlocks: change(template.layoutBlocks) };
  return { ...template, groups: template.groups.map((g) => (g.id === groupId ? { ...g, blocks: change(g.blocks) } : g)) };
}

function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    if (!used.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
  }
}

/** Rounds `value` to the nearest multiple of `grid`. A grid of 0 or less leaves the value alone. Avoids -0. */
export function snapToGrid(value: number, grid: number): number {
  if (!(grid > 0)) return value;
  return Math.round(value / grid) * grid + 0;
}

/** Turns an angle into the range 0 up to 360 degrees. */
export function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360 + 0;
}

/**
 * Applies `patch` to a block. A patch key set to `undefined` removes the field, so
 * `{ width: undefined }` returns the block to its catalogue width.
 */
export function updateBlock(template: SchematicTemplate, ref: BlockRef, patch: Partial<SchematicBlock>): SchematicTemplate {
  return mapCollection(template, ref.groupId, (blocks) =>
    blocks.map((block) => {
      if (block.id !== ref.blockId) return block;
      const next: Record<string, unknown> = { ...block, ...patch, id: block.id, type: block.type };
      for (const key of Object.keys(patch)) {
        if ((patch as Record<string, unknown>)[key] === undefined) delete next[key];
      }
      return next as unknown as SchematicBlock;
    }),
  );
}

const DEFAULT_TABLE_ROWS = [
  { label: 'Circuits', formula: 'count(circuits)' },
  { label: 'Total VA', formula: 'sum(circuit.capacity)' },
];

/**
 * Adds a block of `type` at the end of the draw order. A circuit-scope block goes into the group
 * `groupId` (returns undefined when that group does not exist); every other scope goes into the layout.
 * A drawing goes into the group when `groupId` is given, and into the layout when it is not.
 */
export function addBlock(template: SchematicTemplate, type: SchematicBlockType, options: { groupId?: string; at?: { x: number; y: number } } = {}): { template: SchematicTemplate; ref: BlockRef } | undefined {
  const inGroup = SCHEMATIC_BLOCK_CATALOGUE[type].scope === 'circuit' || (type === 'drawing' && options.groupId !== undefined);
  const groupId = inGroup ? options.groupId : undefined;
  if (inGroup && !template.groups.some((g) => g.id === groupId)) return undefined;
  const taken = (groupId === undefined ? template.layoutBlocks : (template.groups.find((g) => g.id === groupId)?.blocks ?? [])).map((b) => b.id);
  const block: SchematicBlock = { id: nextId(type, taken), type, x: options.at?.x ?? 0, y: options.at?.y ?? 0, rotation: 0 };
  if (type === 'totalsTable') block.tableRows = DEFAULT_TABLE_ROWS.map((row) => ({ ...row }));
  if (type === 'drawing') block.shapes = [];
  return { template: mapCollection(template, groupId, (blocks) => [...blocks, block]), ref: { blockId: block.id, groupId } };
}

export function removeBlock(template: SchematicTemplate, ref: BlockRef): SchematicTemplate {
  return mapCollection(template, ref.groupId, (blocks) => blocks.filter((b) => b.id !== ref.blockId));
}

/** Copies a block, offset by `offset` mm on both axes, right after the original in the draw order. */
export function duplicateBlock(template: SchematicTemplate, ref: BlockRef, offset = 4): { template: SchematicTemplate; ref: BlockRef } | undefined {
  const source = findBlock(template, ref);
  if (!source) return undefined;
  const collection = ref.groupId === undefined ? template.layoutBlocks : (template.groups.find((g) => g.id === ref.groupId)?.blocks ?? []);
  const copy: SchematicBlock = { ...structuredClone(source), id: nextId(source.type, collection.map((b) => b.id)), x: source.x + offset, y: source.y + offset };
  const next = mapCollection(template, ref.groupId, (blocks) => {
    const index = blocks.findIndex((b) => b.id === ref.blockId);
    return [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)];
  });
  return { template: next, ref: { blockId: copy.id, groupId: ref.groupId } };
}

/** Moves a block `steps` places in the draw order (positive = later = drawn on top). */
export function reorderBlock(template: SchematicTemplate, ref: BlockRef, steps: number): SchematicTemplate {
  return mapCollection(template, ref.groupId, (blocks) => {
    const from = blocks.findIndex((b) => b.id === ref.blockId);
    if (from < 0) return blocks;
    const to = Math.min(Math.max(from + steps, 0), blocks.length - 1);
    if (to === from) return blocks;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

function rotateVector(x: number, y: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** A sheet-space distance turned into the block's own axes, so a resize handle on a rotated block grows the block along its own edges. */
export function toBlockAxes(dx: number, dy: number, rotation: number): { x: number; y: number } {
  return rotateVector(dx, dy, -rotation);
}

/**
 * The block's `x` and `y` after a resize, chosen so its top-left corner stays where it is on the
 * sheet. A rotation pivots on the block centre, so changing the size moves the corner unless the
 * position compensates; at rotation 0 the position does not change.
 */
export function resizeKeepingCorner(block: { x: number; y: number; rotation: number }, oldSize: { width: number; height: number }, newSize: { width: number; height: number }): { x: number; y: number } {
  const shift = rotateVector((newSize.width - oldSize.width) / 2, (newSize.height - oldSize.height) / 2, block.rotation);
  const centerX = block.x + oldSize.width / 2 + shift.x;
  const centerY = block.y + oldSize.height / 2 + shift.y;
  return { x: centerX - newSize.width / 2, y: centerY - newSize.height / 2 };
}

/** The rotation that points the block's rotate handle (drawn straight above the block) at `pointer`. Snaps to `step` degrees when given. */
export function rotationFromPointer(center: { x: number; y: number }, pointer: { x: number; y: number }, step?: number): number {
  const degrees = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;
  return normalizeRotation(step && step > 0 ? Math.round(degrees / step) * step : degrees);
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest sheet rectangle that holds every block, including the corners of rotated blocks. undefined for an empty list. */
export function getBlocksBounds(blocks: Pick<ResolvedBlock, 'x' | 'y' | 'width' | 'height' | 'rotation'>[]): Bounds | undefined {
  if (blocks.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    for (const [cx, cy] of [
      [-b.width / 2, -b.height / 2],
      [b.width / 2, -b.height / 2],
      [b.width / 2, b.height / 2],
      [-b.width / 2, b.height / 2],
    ]) {
      const corner = rotateVector(cx, cy, b.rotation);
      const x = b.x + b.width / 2 + corner.x;
      const y = b.y + b.height / 2 + corner.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function addGroup(template: SchematicTemplate, name?: string): { template: SchematicTemplate; groupId: string } {
  const groupId = nextId('group', template.groups.map((g) => g.id));
  const first = template.groups[0];
  const group: CircuitGroupDefinition = { id: groupId, name: name ?? `Group ${template.groups.length + 1}`, rule: { kind: 'any' }, direction: first?.direction ?? 'column', pitch: first?.pitch ?? 10, blocks: [] };
  return { template: { ...template, groups: [...template.groups, group] }, groupId };
}

/** Copies a group, with its blocks, right after the original. The copy's rule is `any`, so it changes nothing until the user sets a rule. */
export function duplicateGroup(template: SchematicTemplate, groupId: string): { template: SchematicTemplate; groupId: string } | undefined {
  const index = template.groups.findIndex((g) => g.id === groupId);
  if (index < 0) return undefined;
  const source = template.groups[index];
  const copy: CircuitGroupDefinition = { ...structuredClone(source), id: nextId('group', template.groups.map((g) => g.id)), name: `${source.name} (copy)`, rule: { kind: 'any' } };
  return { template: { ...template, groups: [...template.groups.slice(0, index + 1), copy, ...template.groups.slice(index + 1)] }, groupId: copy.id };
}

export function removeGroup(template: SchematicTemplate, groupId: string): SchematicTemplate {
  return { ...template, groups: template.groups.filter((g) => g.id !== groupId) };
}

export function updateGroup(template: SchematicTemplate, groupId: string, patch: Partial<Pick<CircuitGroupDefinition, 'name' | 'rule' | 'pitch'>>): SchematicTemplate {
  return { ...template, groups: template.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) };
}

/** Moves a group `steps` places in the list. The first group whose rule matches a circuit wins, so the order matters. */
export function reorderGroup(template: SchematicTemplate, groupId: string, steps: number): SchematicTemplate {
  const from = template.groups.findIndex((g) => g.id === groupId);
  if (from < 0) return template;
  const to = Math.min(Math.max(from + steps, 0), template.groups.length - 1);
  if (to === from) return template;
  const groups = [...template.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);
  return { ...template, groups };
}

/** All groups of a template share one direction, so this sets it on every group. */
export function setTemplateDirection(template: SchematicTemplate, direction: 'row' | 'column'): SchematicTemplate {
  return { ...template, groups: template.groups.map((g) => ({ ...g, direction })) };
}

/** A copy with a new id and a name that no other template uses. */
export function copyTemplate(template: SchematicTemplate, others: SchematicTemplate[]): SchematicTemplate {
  const names = new Set(others.map((t) => t.name.toLowerCase()));
  const base = template.name.replace(/ \(copy( \d+)?\)$/, '');
  let name = `${base} (copy)`;
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} (copy ${n})`;
  return { ...structuredClone(template), id: nextId('custom', others.map((t) => t.id)), name };
}

/** Text form of a rule's number list for an input box, for example "1, 2, 5". */
export function formatNumberList(numbers: number[]): string {
  return numbers.join(', ');
}

/** The whole numbers in a "1, 2, 5" style text; anything else is ignored. */
export function parseNumberList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => Number(part))
    .filter((n, i, all) => Number.isInteger(n) && n > 0 && all.indexOf(n) === i);
}

export function describeRule(rule: CircuitGroupRule): string {
  switch (rule.kind) {
    case 'any':
      return 'Any circuit';
    case 'spare':
      return 'Spare circuits';
    case 'circuitType':
      return rule.circuitTypeIds.length === 0 ? 'Circuit type (none chosen)' : `Circuit type: ${rule.circuitTypeIds.join(', ')}`;
    case 'circuitNumber':
      return rule.numbers.length === 0 ? 'Circuit number (none chosen)' : `Circuit number: ${formatNumberList(rule.numbers)}`;
  }
}

export interface SchematicBindingField {
  /** A bare expression; a binding wraps it in braces. */
  expression: string;
  description: string;
  scopes: SchematicBlockScope[];
}

const CIRCUIT: SchematicBlockScope[] = ['circuit'];
const PANEL_LEVEL: SchematicBlockScope[] = ['once', 'panel', 'section', 'circuit', 'aggregate'];

/** What a binding can read, per block scope. The editor shows this list in its "Insert field" menu. */
export const SCHEMATIC_BINDING_FIELDS: SchematicBindingField[] = [
  { expression: 'circuit.prefix', description: 'Circuit prefix, for example A', scopes: CIRCUIT },
  { expression: 'circuit.number', description: 'Circuit number', scopes: CIRCUIT },
  { expression: 'circuit.customName', description: 'Circuit name', scopes: CIRCUIT },
  { expression: 'circuit.phase', description: 'Phase, for example L1 or L1L2L3', scopes: CIRCUIT },
  { expression: 'circuit.capacity', description: 'Capacity of the circuit (sum of its terminals)', scopes: CIRCUIT },
  { expression: 'circuit.diversityPercent', description: 'Diversity in percent', scopes: CIRCUIT },
  { expression: 'circuit.diversifiedCapacity', description: 'Capacity times diversity', scopes: CIRCUIT },
  { expression: 'circuit.capacityL1', description: 'The capacity on phase L1 (a three-phase circuit splits it equally)', scopes: CIRCUIT },
  { expression: 'circuit.capacityL2', description: 'The capacity on phase L2', scopes: CIRCUIT },
  { expression: 'circuit.capacityL3', description: 'The capacity on phase L3', scopes: CIRCUIT },
  { expression: 'circuit.properties."Name of property"', description: 'A custom circuit property', scopes: CIRCUIT },
  { expression: 'device.label', description: 'Protective device, for example B16/30mA', scopes: CIRCUIT },
  { expression: 'device.curve', description: 'Device curve', scopes: CIRCUIT },
  { expression: 'device.ratingA', description: 'Device rating in amperes', scopes: CIRCUIT },
  { expression: 'device.rcdMilliamps', description: 'Residual-current trip level in mA', scopes: CIRCUIT },
  { expression: 'cable.type', description: 'Cable type', scopes: CIRCUIT },
  { expression: 'cable.coreCount', description: 'Number of cores', scopes: CIRCUIT },
  { expression: 'cable.crossSectionMm2', description: 'Cross section in mm²', scopes: CIRCUIT },
  { expression: 'cable.lengthM', description: 'Cable length in metres', scopes: CIRCUIT },
  { expression: 'circuitType.name', description: 'Circuit type name', scopes: CIRCUIT },
  { expression: 'circuitType.abbreviation', description: 'Circuit type abbreviation', scopes: CIRCUIT },
  { expression: 'section.name', description: 'Section name', scopes: ['section', 'circuit'] },
  { expression: 'terminal.label', description: 'Names of the circuit terminals (a list)', scopes: CIRCUIT },
  { expression: 'terminal.capacity', description: 'Capacity of each terminal (a list)', scopes: ['circuit', 'aggregate'] },
  { expression: 'count(terminals)', description: 'Number of terminals', scopes: ['circuit', 'aggregate'] },
  { expression: 'sum(terminal.capacity)', description: 'Total capacity of the terminals', scopes: ['circuit', 'aggregate'] },
  { expression: 'circuit.capacity', description: 'Capacity of every circuit (a list)', scopes: ['aggregate'] },
  { expression: 'count(circuits)', description: 'Number of circuits, without spares', scopes: ['aggregate'] },
  { expression: 'count(spares)', description: 'Number of spare circuits', scopes: ['aggregate'] },
  { expression: 'sum(circuit.capacity)', description: 'Total capacity of the circuits', scopes: ['aggregate'] },
  { expression: 'sum(circuit.diversifiedCapacity)', description: 'Total diversified capacity', scopes: ['aggregate'] },
  { expression: 'sum(circuit.capacityL1)', description: 'Total capacity on phase L1', scopes: ['aggregate'] },
  { expression: 'sum(circuit.capacityL2)', description: 'Total capacity on phase L2', scopes: ['aggregate'] },
  { expression: 'sum(circuit.capacityL3)', description: 'Total capacity on phase L3', scopes: ['aggregate'] },
  { expression: 'panel.name', description: 'Panel name', scopes: PANEL_LEVEL },
  { expression: 'panel.mainDevice.label', description: 'Main device label', scopes: PANEL_LEVEL },
  { expression: 'panel.mainDevice.ratingA', description: 'Main device rating in amperes', scopes: PANEL_LEVEL },
  { expression: 'panel.feederCable.type', description: 'Feeder cable type', scopes: PANEL_LEVEL },
  { expression: 'panel.feederCable.crossSectionMm2', description: 'Feeder cable cross section in mm²', scopes: PANEL_LEVEL },
  { expression: 'panel.feederCable.lengthM', description: 'Feeder cable length in metres', scopes: PANEL_LEVEL },
  { expression: 'panel.accessories.label', description: 'Panel accessory names (a list)', scopes: PANEL_LEVEL },
  { expression: 'panel.capacity', description: 'Total capacity of the panel', scopes: PANEL_LEVEL },
  { expression: 'panel.circuitCount', description: 'Number of circuits, without spares', scopes: PANEL_LEVEL },
  { expression: 'panel.spareCount', description: 'Number of spare circuits', scopes: PANEL_LEVEL },
];

export function getBindingFieldsForScope(scope: SchematicBlockScope): SchematicBindingField[] {
  return SCHEMATIC_BINDING_FIELDS.filter((field) => field.scopes.includes(scope));
}

/**
 * Made-up panel data for editing a template when no real panel has circuits: two sections, a spare,
 * one three-phase circuit, and one extra circuit for each `circuitType` or `circuitNumber` group rule
 * that no other sample circuit matches, so every group shows something.
 */
export function buildSampleSchematicInput(template: SchematicTemplate, circuitTypes: CircuitType[] = CIRCUIT_TYPE_LIBRARY): SchematicInput {
  const panel: Panel = {
    id: 'sample-panel',
    equipmentStampId: 'sample-stamp',
    name: 'Sample board',
    sortDirection: 'ascending',
    mainDevice: { label: '4x40A/300mA', ratingA: 40 },
    feederCable: { type: 'XMvK', crossSectionMm2: 10, lengthM: 12 },
    accessories: [{ id: 'sample-acc', kind: 'meter', label: 'kWh' }],
    sectionIds: ['sample-s1', 'sample-s2'],
    circuitDefaults: { prefix: 'A', phase: 'L1', device: { kind: 'breaker', curve: 'B', ratingA: 16 }, cable: { type: 'YMvK', coreCount: 3, crossSectionMm2: 2.5 }, diversityPercent: 100 },
  };
  const sections: PanelSection[] = [
    { id: 'sample-s1', panelId: panel.id, name: 'Ground floor', order: 0 },
    { id: 'sample-s2', panelId: panel.id, name: 'First floor', order: 1 },
  ];
  const terminals: Record<string, SchematicTerminalInfo> = {
    t1: { label: 'Luminaire 1', capacity: 60, loadType: 'light' },
    t2: { label: 'Luminaire 2', capacity: 60, loadType: 'light' },
    t3: { label: 'Wall socket', capacity: 2500, loadType: 'socket' },
    t4: { label: 'Oven', capacity: 3500, loadType: 'appliance' },
    t5: { label: 'Heat pump', capacity: 4500, loadType: 'hvac' },
    t6: { label: 'Luminaire 3', capacity: 60, loadType: 'light' },
    t7: { label: 'Wall socket', capacity: 2500, loadType: 'socket' },
    t8: { label: 'Wall socket', capacity: 2500, loadType: 'socket' },
  };
  const circuit = (number: number, sectionId: string, extra: Partial<Circuit>): Circuit => ({ id: `sample-c${number}`, number, panelId: panel.id, sectionId, terminalIds: [], isSpare: false, ...extra });
  const circuits: Circuit[] = [
    circuit(1, 'sample-s1', { terminalIds: ['t1', 't2'], circuitTypeId: 'lighting', customName: 'Hall lighting', cable: { lengthM: 14 } }),
    circuit(2, 'sample-s1', { terminalIds: ['t3'], circuitTypeId: 'sockets', phase: 'L2', customName: 'Hall sockets', cable: { lengthM: 22 } }),
    circuit(3, 'sample-s1', { terminalIds: ['t4'], circuitTypeId: 'kitchen-appliance', phase: 'L3', customName: 'Oven', device: { kind: 'breaker', curve: 'B', ratingA: 20, rcdMilliamps: 30 }, cable: { coreCount: 3, crossSectionMm2: 4, lengthM: 9 } }),
    circuit(4, 'sample-s1', { isSpare: true }),
    circuit(5, 'sample-s2', { terminalIds: ['t5'], circuitTypeId: 'hvac', phase: 'L1L2L3', customName: 'Heat pump', device: { kind: 'breaker', curve: 'C', ratingA: 25 }, cable: { coreCount: 5, crossSectionMm2: 4, lengthM: 18 } }),
    circuit(6, 'sample-s2', { terminalIds: ['t6'], circuitTypeId: 'lighting', phase: 'L2', customName: 'Landing lighting', cable: { lengthM: 11 } }),
    circuit(7, 'sample-s2', { terminalIds: ['t7', 't8'], circuitTypeId: 'sockets', phase: 'L3', customName: 'Bedroom sockets', diversityPercent: 80, cable: { lengthM: 26 } }),
  ];
  let extraNumber = 8;
  for (const group of template.groups) {
    const { rule } = group;
    if (rule.kind !== 'circuitType' && rule.kind !== 'circuitNumber') continue;
    if (circuits.some((c) => circuitMatchesRule(rule, c, c.circuitTypeId))) continue;
    if (rule.kind === 'circuitType') {
      const typeId = rule.circuitTypeIds.find((id) => circuitTypes.some((t) => t.id === id)) ?? rule.circuitTypeIds[0];
      if (typeId === undefined) continue;
      circuits.push(circuit(extraNumber++, 'sample-s2', { terminalIds: ['t6'], circuitTypeId: typeId, customName: `Sample ${typeId}` }));
    } else {
      const number = rule.numbers.find((n) => !circuits.some((c) => c.number === n));
      if (number === undefined) continue;
      circuits.push(circuit(number, 'sample-s2', { terminalIds: ['t6'], customName: `Sample circuit ${number}` }));
    }
  }
  return { panel, circuits, sections, terminals, circuitTypes };
}
