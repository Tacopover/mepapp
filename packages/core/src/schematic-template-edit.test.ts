import { describe, expect, it } from 'vitest';
import { generateSchematic } from './schematic-generator.js';
import {
  SCHEMATIC_BINDING_FIELDS,
  addBlock,
  addGroup,
  addSymbolBlock,
  buildSampleSchematicInput,
  copyTemplate,
  detachBlockSymbol,
  setBlockSymbol,
  duplicateBlock,
  duplicateGroup,
  findBlock,
  formatNumberList,
  getBindingFieldsForScope,
  getBlocksBounds,
  normalizeRotation,
  parseNumberList,
  removeBlock,
  removeGroup,
  reorderBlock,
  reorderGroup,
  resizeKeepingCorner,
  rotationFromPointer,
  setTemplateDirection,
  snapToGrid,
  toBlockAxes,
  updateBlock,
  updateGroup,
} from './schematic-template-edit.js';
import { SCHEMATIC_TEMPLATE_LIBRARY } from './schematic-template-library.js';
import { SCHEMATIC_BLOCK_CATALOGUE, validateSchematicTemplate, type SchematicTemplate } from './schematic-template.js';

const base = SCHEMATIC_TEMPLATE_LIBRARY[0];
const clone = () => structuredClone(base);

describe('updateBlock', () => {
  it('changes a layout block and leaves the input untouched', () => {
    const before = clone();
    const frame = before.layoutBlocks.find((b) => b.type === 'frame')!;
    const after = updateBlock(before, { blockId: frame.id }, { x: 99, binding: 'hello' });
    expect(findBlock(after, { blockId: frame.id })).toMatchObject({ x: 99, binding: 'hello' });
    expect(findBlock(before, { blockId: frame.id })!.x).toBe(frame.x);
  });

  it('changes a block inside a group', () => {
    const group = base.groups[1];
    const block = group.blocks[0];
    const after = updateBlock(clone(), { groupId: group.id, blockId: block.id }, { y: 7.5 });
    expect(findBlock(after, { groupId: group.id, blockId: block.id })!.y).toBe(7.5);
  });

  it('removes a field when the patch sets it to undefined', () => {
    const template = updateBlock(clone(), { blockId: 'bus' }, { width: 300 });
    expect(findBlock(template, { blockId: 'bus' })!.width).toBe(300);
    const cleared = updateBlock(template, { blockId: 'bus' }, { width: undefined });
    expect('width' in findBlock(cleared, { blockId: 'bus' })!).toBe(false);
  });

  it('never changes the id or the type', () => {
    const after = updateBlock(clone(), { blockId: 'bus' }, { id: 'other', type: 'frame' } as never);
    expect(findBlock(after, { blockId: 'bus' })!.type).toBe('busbar');
  });
});

describe('addBlock', () => {
  it('puts a circuit-scope block in the chosen group with a fresh id', () => {
    const groupId = base.groups[0].id;
    const result = addBlock(clone(), 'description', { groupId, at: { x: 3, y: 4 } })!;
    expect(result.ref.groupId).toBe(groupId);
    expect(findBlock(result.template, result.ref)).toMatchObject({ type: 'description', x: 3, y: 4, rotation: 0 });
    const again = addBlock(result.template, 'description', { groupId })!;
    expect(again.ref.blockId).not.toBe(result.ref.blockId);
  });

  it('puts every other scope in the layout, even when a group is named', () => {
    const result = addBlock(clone(), 'legend', { groupId: base.groups[0].id })!;
    expect(result.ref.groupId).toBeUndefined();
    expect(result.template.layoutBlocks.at(-1)!.id).toBe(result.ref.blockId);
  });

  it('refuses a circuit-scope block without a real group', () => {
    expect(addBlock(clone(), 'description')).toBeUndefined();
    expect(addBlock(clone(), 'description', { groupId: 'nope' })).toBeUndefined();
  });

  it('gives a new totals table starter rows', () => {
    const result = addBlock(clone(), 'totalsTable')!;
    expect(findBlock(result.template, result.ref)!.tableRows!.length).toBeGreaterThan(0);
    expect(validateSchematicTemplate(result.template)).toEqual([]);
  });

  it('creates a valid template for every catalogue type', () => {
    for (const type of Object.keys(SCHEMATIC_BLOCK_CATALOGUE) as (keyof typeof SCHEMATIC_BLOCK_CATALOGUE)[]) {
      const result = addBlock(clone(), type, { groupId: base.groups[0].id })!;
      expect(validateSchematicTemplate(result.template), type).toEqual([]);
    }
  });
});

describe('removeBlock, duplicateBlock, reorderBlock', () => {
  it('removes a block', () => {
    const after = removeBlock(clone(), { blockId: 'bus' });
    expect(findBlock(after, { blockId: 'bus' })).toBeUndefined();
    expect(after.layoutBlocks.length).toBe(base.layoutBlocks.length - 1);
  });

  it('duplicates a block right after the original, offset, with a new id', () => {
    const result = duplicateBlock(clone(), { blockId: 'bus' })!;
    const original = findBlock(base, { blockId: 'bus' })!;
    const copy = findBlock(result.template, result.ref)!;
    expect(copy.id).not.toBe('bus');
    expect(copy.x).toBe(original.x + 4);
    const ids = result.template.layoutBlocks.map((b) => b.id);
    expect(ids.indexOf(copy.id)).toBe(ids.indexOf('bus') + 1);
    copy.rotation = 45;
    expect(findBlock(result.template, { blockId: 'bus' })!.rotation).toBe(original.rotation);
  });

  it('does not duplicate a block that does not exist', () => {
    expect(duplicateBlock(clone(), { blockId: 'nope' })).toBeUndefined();
  });

  it('moves a block in the draw order and clamps at the ends', () => {
    const ids = (t: SchematicTemplate) => t.layoutBlocks.map((b) => b.id);
    const first = base.layoutBlocks[0].id;
    expect(ids(reorderBlock(clone(), { blockId: first }, 1))[1]).toBe(first);
    expect(ids(reorderBlock(clone(), { blockId: first }, -3))).toEqual(ids(base));
    expect(ids(reorderBlock(clone(), { blockId: first }, 999)).at(-1)).toBe(first);
  });
});

describe('groups', () => {
  it('adds a group that matches every circuit and copies the direction and pitch of the first', () => {
    const { template, groupId } = addGroup(clone());
    const group = template.groups.find((g) => g.id === groupId)!;
    expect(group.rule).toEqual({ kind: 'any' });
    expect(group.direction).toBe(base.groups[0].direction);
    expect(group.pitch).toBe(base.groups[0].pitch);
    expect(validateSchematicTemplate(template)).toEqual([]);
  });

  it('adds a group to a template that has none', () => {
    const { template } = addGroup({ ...clone(), groups: [] });
    expect(template.groups).toHaveLength(1);
    expect(validateSchematicTemplate(template)).toEqual([]);
  });

  it('validates a template with no groups', () => {
    expect(validateSchematicTemplate({ ...clone(), groups: [] })).toEqual([]);
  });

  it('duplicates a group with its blocks and gives the copy the rule any', () => {
    const source = base.groups[0];
    const { template, groupId } = duplicateGroup(clone(), source.id)!;
    const copy = template.groups.find((g) => g.id === groupId)!;
    expect(copy.blocks).toEqual(source.blocks);
    expect(copy.rule).toEqual({ kind: 'any' });
    expect(template.groups.indexOf(copy)).toBe(1);
    expect(validateSchematicTemplate(template)).toEqual([]);
  });

  it('removes and updates a group', () => {
    const id = base.groups[0].id;
    expect(removeGroup(clone(), id).groups.map((g) => g.id)).not.toContain(id);
    const updated = updateGroup(clone(), id, { pitch: 12, name: 'Renamed', rule: { kind: 'circuitNumber', numbers: [1, 2] } });
    expect(updated.groups[0]).toMatchObject({ pitch: 12, name: 'Renamed', rule: { kind: 'circuitNumber', numbers: [1, 2] } });
  });

  it('reorders groups and clamps at the ends', () => {
    const ids = (t: SchematicTemplate) => t.groups.map((g) => g.id);
    const first = base.groups[0].id;
    expect(ids(reorderGroup(clone(), first, 1))[1]).toBe(first);
    expect(ids(reorderGroup(clone(), first, -1))).toEqual(ids(base));
  });

  it('sets one direction on every group', () => {
    const template = setTemplateDirection(clone(), base.groups[0].direction === 'row' ? 'column' : 'row');
    expect(new Set(template.groups.map((g) => g.direction)).size).toBe(1);
    expect(validateSchematicTemplate(template)).toEqual([]);
  });
});

describe('copyTemplate', () => {
  it('gives a new id and a name that is not taken', () => {
    const first = copyTemplate(base, SCHEMATIC_TEMPLATE_LIBRARY);
    expect(first.name).toBe(`${base.name} (copy)`);
    expect(SCHEMATIC_TEMPLATE_LIBRARY.some((t) => t.id === first.id)).toBe(false);
    const second = copyTemplate(first, [...SCHEMATIC_TEMPLATE_LIBRARY, first]);
    expect(second.name).toBe(`${base.name} (copy 2)`);
    expect(second.id).not.toBe(first.id);
  });

  it('is a deep copy', () => {
    const copy = copyTemplate(base, SCHEMATIC_TEMPLATE_LIBRARY);
    copy.layoutBlocks[0].x = 12345;
    expect(base.layoutBlocks[0].x).not.toBe(12345);
  });
});

describe('geometry helpers', () => {
  it('snaps to a grid and ignores a grid of zero', () => {
    expect(snapToGrid(12.6, 1)).toBe(13);
    expect(snapToGrid(12.6, 5)).toBe(15);
    expect(snapToGrid(12.6, 0)).toBe(12.6);
    expect(Object.is(snapToGrid(-0.2, 1), 0)).toBe(true);
  });

  it('normalizes a rotation', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
  });

  it('turns a sheet distance into block axes', () => {
    const v = toBlockAxes(10, 0, 90);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-10);
  });

  it('keeps the position when an unrotated block is resized from its corner', () => {
    expect(resizeKeepingCorner({ x: 10, y: 20, rotation: 0 }, { width: 8, height: 4 }, { width: 20, height: 9 })).toEqual({ x: 10, y: 20 });
  });

  it('keeps the top-left corner still on the sheet when a rotated block is resized', () => {
    const block = { x: 10, y: 20, rotation: 90 };
    const oldSize = { width: 8, height: 4 };
    const newSize = { width: 20, height: 9 };
    const moved = resizeKeepingCorner(block, oldSize, newSize);
    // Rotation 90 turns the block, so the rotated top-left corner is the top-right of the bounds.
    const before = getBlocksBounds([{ ...block, ...oldSize }])!;
    const after = getBlocksBounds([{ ...block, ...moved, ...newSize }])!;
    expect(after.x + after.width).toBeCloseTo(before.x + before.width);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('points the rotate handle at the pointer', () => {
    const center = { x: 50, y: 50 };
    expect(rotationFromPointer(center, { x: 50, y: 10 })).toBeCloseTo(0);
    expect(rotationFromPointer(center, { x: 90, y: 50 })).toBeCloseTo(90);
    expect(rotationFromPointer(center, { x: 50, y: 90 })).toBeCloseTo(180);
    expect(rotationFromPointer(center, { x: 10, y: 50 })).toBeCloseTo(270);
    expect(rotationFromPointer(center, { x: 90, y: 47 }, 15)).toBe(90);
  });

  it('measures the bounds of rotated blocks', () => {
    expect(getBlocksBounds([])).toBeUndefined();
    const plain = getBlocksBounds([{ x: 10, y: 10, width: 20, height: 10, rotation: 0 }])!;
    expect(plain).toEqual({ x: 10, y: 10, width: 20, height: 10 });
    const turned = getBlocksBounds([{ x: 10, y: 10, width: 20, height: 10, rotation: 90 }])!;
    expect(turned.width).toBeCloseTo(10);
    expect(turned.height).toBeCloseTo(20);
    expect(turned.x).toBeCloseTo(15);
    expect(turned.y).toBeCloseTo(5);
  });
});

describe('number lists', () => {
  it('formats and parses', () => {
    expect(formatNumberList([1, 2, 5])).toBe('1, 2, 5');
    expect(parseNumberList('1, 2 5;2, x, 0, -3, 4.5')).toEqual([1, 2, 5]);
    expect(parseNumberList('')).toEqual([]);
  });
});

describe('sample data', () => {
  it('fills the built-in templates: every circuit gets a group and nothing errors', () => {
    for (const template of SCHEMATIC_TEMPLATE_LIBRARY) {
      const input = buildSampleSchematicInput(template);
      const generated = generateSchematic(input, template);
      expect(generated.diagnostics, template.name).toEqual([]);
      expect(generated.circuitOrder).toHaveLength(input.circuits.length);
    }
  });

  it('adds a circuit for a circuit-type group and a circuit-number group', () => {
    let template = clone();
    const a = addGroup(template);
    template = updateGroup(a.template, a.groupId, { rule: { kind: 'circuitType', circuitTypeIds: ['ev-charger'] } });
    const b = addGroup(template);
    template = updateGroup(b.template, b.groupId, { rule: { kind: 'circuitNumber', numbers: [12] } });
    const input = buildSampleSchematicInput(template);
    expect(input.circuits.some((c) => c.circuitTypeId === 'ev-charger')).toBe(true);
    expect(input.circuits.some((c) => c.number === 12)).toBe(true);
    const numbers = input.circuits.map((c) => c.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('does not add a circuit for a rule that a sample circuit already matches', () => {
    const { template: withGroup, groupId } = addGroup(clone());
    const template = updateGroup(withGroup, groupId, { rule: { kind: 'circuitType', circuitTypeIds: ['lighting'] } });
    expect(buildSampleSchematicInput(template).circuits).toHaveLength(buildSampleSchematicInput(clone()).circuits.length);
  });
});

describe('binding fields', () => {
  const scopes = ['once', 'panel', 'section', 'circuit', 'aggregate'] as const;

  it('lists fields for every scope', () => {
    for (const scope of scopes) expect(getBindingFieldsForScope(scope).length).toBeGreaterThan(0);
  });

  it('gives a non-blank value on the sample data for every listed field, in every scope it names', () => {
    // A field with a typo or a wrong scope would render blank without any error, so check each one.
    const blank: string[] = [];
    for (const scope of scopes) {
      if (scope === 'once') continue; // a once block reads no data: the generator gives it an empty context
      for (const field of getBindingFieldsForScope(scope)) {
        if (field.expression.includes('"Name of property"')) continue;
        const template = clone();
        const groupId = template.groups[1].id;
        const added = addBlock(template, scope === 'circuit' ? 'description' : scope === 'section' ? 'section' : scope === 'aggregate' ? 'aggregateCell' : 'feedCable', { groupId });
        const patched = updateBlock(added!.template, added!.ref, { binding: `{${field.expression}}` });
        const generated = generateSchematic(buildSampleSchematicInput(patched), patched);
        expect(generated.diagnostics.filter((d) => d.kind === 'binding-error'), field.expression).toEqual([]);
        const texts = generated.blocks.filter((b) => b.templateBlockId === added!.ref.blockId).map((b) => b.text ?? '');
        if (!texts.some((t) => t !== '')) blank.push(`${scope}: ${field.expression}`);
      }
    }
    expect(blank).toEqual([]);
  });

  it('has only expressions that parse', () => {
    expect(SCHEMATIC_BINDING_FIELDS.every((f) => f.expression.length > 0)).toBe(true);
  });
});

describe('drawing blocks', () => {
  const shape = { id: 's1', kind: 'line' as const, x1: 0, y1: 0, x2: 1, y2: 1, style: { stroke: '#000000', strokeWidth: 0.02, fill: null } };

  it('goes into the layout without a group and into the group with one', () => {
    const inLayout = addBlock(clone(), 'drawing')!;
    expect(inLayout.ref.groupId).toBeUndefined();
    expect(findBlock(inLayout.template, inLayout.ref)!.shapes).toEqual([]);
    const groupId = base.groups[0].id;
    const inGroup = addBlock(clone(), 'drawing', { groupId })!;
    expect(inGroup.ref.groupId).toBe(groupId);
    expect(addBlock(clone(), 'drawing', { groupId: 'nope' })).toBeUndefined();
    expect(validateSchematicTemplate(inLayout.template)).toEqual([]);
    expect(validateSchematicTemplate(inGroup.template)).toEqual([]);
  });

  it('carries its shapes into every generated instance and keeps them when duplicated', () => {
    const groupId = base.groups[1].id;
    const added = addBlock(clone(), 'drawing', { groupId })!;
    const drawn = updateBlock(added.template, added.ref, { shapes: [shape] });
    const generated = generateSchematic(buildSampleSchematicInput(drawn), drawn);
    const instances = generated.blocks.filter((b) => b.type === 'drawing');
    expect(instances.length).toBeGreaterThan(1);
    expect(instances.every((b) => b.shapes?.length === 1 && b.scope === 'circuit')).toBe(true);
    const copy = duplicateBlock(drawn, added.ref)!;
    expect(findBlock(copy.template, copy.ref)!.shapes).toEqual([shape]);
    expect(findBlock(copy.template, copy.ref)!.shapes).not.toBe(findBlock(drawn, added.ref)!.shapes);
  });

  it('rejects shapes on a block that is not a drawing', () => {
    const bad = updateBlock(clone(), { blockId: 'bus' }, { shapes: [shape] });
    expect(validateSchematicTemplate(bad).join(' ')).toContain('not a drawing');
  });

  it('is the only type that a group accepts besides circuit-scope types', () => {
    const groupId = base.groups[0].id;
    const misplaced = mapGroup(clone(), groupId, { id: 'x', type: 'legend', x: 0, y: 0, rotation: 0 });
    expect(validateSchematicTemplate(misplaced).join(' ')).toContain('does not belong');
  });
});

describe('symbol blocks', () => {
  const symbol = {
    id: 'sym-1',
    widthMm: 12,
    heightMm: 7,
    shapes: [{ id: 's1', kind: 'line' as const, x1: 0, y1: 0, x2: 1, y2: 1, style: { stroke: '#000000', strokeWidth: 0.02, fill: null } }],
  };

  it('adds a drawing block that points at the symbol and takes its size', () => {
    const added = addSymbolBlock(clone(), symbol, { at: { x: 5, y: 6 } })!;
    const block = findBlock(added.template, added.ref)!;
    expect(block).toMatchObject({ type: 'drawing', symbolId: 'sym-1', width: 12, height: 7, x: 5, y: 6 });
    expect(block.shapes).toBeUndefined();
    expect(validateSchematicTemplate(added.template)).toEqual([]);
  });

  it('goes into a group so it repeats for every circuit, and carries the symbol id into each instance', () => {
    const groupId = base.groups[1].id;
    const added = addSymbolBlock(clone(), symbol, { groupId })!;
    expect(added.ref.groupId).toBe(groupId);
    const generated = generateSchematic(buildSampleSchematicInput(added.template), added.template);
    const instances = generated.blocks.filter((b) => b.type === 'drawing');
    expect(instances.length).toBeGreaterThan(1);
    expect(instances.every((b) => b.symbolId === 'sym-1' && b.width === 12)).toBe(true);
    expect(addSymbolBlock(clone(), symbol, { groupId: 'nope' })).toBeUndefined();
  });

  it('detaching keeps a copy of the shapes and drops the symbol id', () => {
    const added = addSymbolBlock(clone(), symbol)!;
    const detached = detachBlockSymbol(added.template, added.ref, symbol);
    const block = findBlock(detached, added.ref)!;
    expect(block.symbolId).toBeUndefined();
    expect(block.shapes).toEqual(symbol.shapes);
    expect(block.shapes).not.toBe(symbol.shapes);
    expect(validateSchematicTemplate(detached)).toEqual([]);
  });
});

function mapGroup(template: SchematicTemplate, groupId: string, block: SchematicTemplate['layoutBlocks'][number]): SchematicTemplate {
  return { ...template, groups: template.groups.map((g) => (g.id === groupId ? { ...g, blocks: [...g.blocks, block] } : g)) };
}

describe('setBlockSymbol', () => {
  const symbol = { id: 'sym-2' };
  const protective = { blockId: base.groups[1].blocks.find((b) => b.type === 'protectiveDevice')!.id, groupId: base.groups[1].id };

  it('points a device block at a symbol without changing its size or text', () => {
    const before = findBlock(clone(), protective)!;
    const after = findBlock(setBlockSymbol(clone(), protective, symbol), protective)!;
    expect(after.symbolId).toBe('sym-2');
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.binding).toBe(before.binding);
  });

  it('clears the symbol so the block returns to its built-in mark', () => {
    const set = setBlockSymbol(clone(), protective, symbol);
    const cleared = findBlock(setBlockSymbol(set, protective, undefined), protective)!;
    expect('symbolId' in cleared).toBe(false);
    expect(validateSchematicTemplate(setBlockSymbol(set, protective, undefined))).toEqual([]);
  });

  it('works for the main device in the layout and validates', () => {
    const main = { blockId: base.layoutBlocks.find((b) => b.type === 'mainDevice')!.id };
    const template = setBlockSymbol(clone(), main, symbol);
    expect(findBlock(template, main)!.symbolId).toBe('sym-2');
    expect(validateSchematicTemplate(template)).toEqual([]);
  });

  it('carries the symbol id into every generated instance', () => {
    const template = setBlockSymbol(clone(), protective, symbol);
    const generated = generateSchematic(buildSampleSchematicInput(template), template);
    const instances = generated.blocks.filter((b) => b.templateBlockId === protective.blockId && b.groupId === protective.groupId);
    expect(instances.length).toBeGreaterThan(1);
    expect(instances.every((b) => b.symbolId === 'sym-2')).toBe(true);
  });

  it('on a drawing it drops the drawing shapes', () => {
    const added = addBlock(clone(), 'drawing')!;
    const drawn = updateBlock(added.template, added.ref, { shapes: [{ id: 's', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style: { stroke: '#000000', strokeWidth: 0.02, fill: null } }] });
    const block = findBlock(setBlockSymbol(drawn, added.ref, symbol), added.ref)!;
    expect(block.symbolId).toBe('sym-2');
    expect('shapes' in block).toBe(false);
  });

  it('leaves a block that cannot show a symbol alone', () => {
    const template = clone();
    expect(setBlockSymbol(template, { blockId: 'nope' }, symbol)).toBe(template);
    const frame = { blockId: base.layoutBlocks.find((b) => b.type === 'frame')!.id };
    expect(setBlockSymbol(template, frame, symbol)).toBe(template);
  });
});
