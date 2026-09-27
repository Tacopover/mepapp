import { describe, expect, it } from 'vitest';
import { buildSampleSchematicInput, generateSchematic, getSchematicTemplateFromLibrary, type ResolvedBlock } from '@mepapp/core';
import { blockDetail, blockLabel, buildTemplateOutline, groupRepeatBoxes, repeatAtPoint } from './templateOutline.js';

const template = getSchematicTemplateFromLibrary('builtin-rows-nl')!;

function block(id: string, groupId: string | undefined, circuitId: string | undefined, x: number, y: number, extra: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return { id, templateBlockId: id, groupId, circuitId, type: 'description', scope: 'circuit', x, y, width: 10, height: 4, rotation: 0, panelId: 'p', ...extra };
}

describe('template outline', () => {
  it('names blocks as the palette does and tells drawings apart', () => {
    expect(blockLabel({ type: 'mainDevice' })).toBe('Main device');
    expect(blockLabel({ type: 'drawing', shapes: [] })).toBe('Drawing (empty)');
    expect(blockLabel({ type: 'drawing', shapes: [{ id: 'r', kind: 'rect', x: 0, y: 0, width: 1, height: 1, style: { stroke: '#000', strokeWidth: 0.01, fill: null }, rotation: 0 }] })).toBe('Drawing: rectangle');
    expect(blockLabel({ type: 'drawing', symbolId: 's1' }, [{ id: 's1', name: 'Breaker' } as never])).toBe('Symbol: Breaker');
    expect(blockLabel({ type: 'drawing', symbolId: 'gone' })).toBe('Symbol (missing)');
  });

  it('shows the first words of a free text, not of a data block', () => {
    expect(blockDetail({ type: 'freeItem', binding: 'Notes about the board\nsecond line' })).toBe('Notes about the board');
    expect(blockDetail({ type: 'freeItem', binding: 'A very long free text that goes on and on' })).toBe('A very long free text t…');
    expect(blockDetail({ type: 'description', binding: '{circuit.customName}' })).toBeUndefined();
  });

  it('lists the sheet blocks and each group with its blocks, in order', () => {
    const outline = buildTemplateOutline(template);
    expect(outline.sheet.map((b) => b.id)).toEqual(template.layoutBlocks.map((b) => b.id));
    expect(outline.sheet.every((b) => b.ref.groupId === undefined)).toBe(true);
    expect(outline.groups.map((g) => `${g.name} · ${g.rule}`)).toEqual(['Spare · Spare circuits', 'Standard · Any circuit']);
    expect(outline.groups[1].blocks[1]).toMatchObject({ label: 'Protective device', id: 'device', ref: { blockId: 'device', groupId: 'standard' } });
  });
});

describe('circuit repeats on the sheet', () => {
  it('gives one box per circuit that a group draws', () => {
    const generated = generateSchematic(buildSampleSchematicInput(template), template);
    const boxes = groupRepeatBoxes(generated.blocks, 'standard');
    const standardCircuits = new Set(generated.blocks.filter((b) => b.groupId === 'standard').map((b) => b.circuitId));
    expect(boxes).toHaveLength(standardCircuits.size);
    expect(boxes.every((b) => b.width > 0 && b.height > 0)).toBe(true);
  });

  it('leaves extras out of the boxes', () => {
    const boxes = groupRepeatBoxes([block('a', 'g', 'c1', 0, 0), block('x', 'g', 'c1', 100, 100, { extraId: 'x' })], 'g');
    expect(boxes).toEqual([{ circuitId: 'c1', x: 0, y: 0, width: 10, height: 4 }]);
  });

  it('finds the repeat under a point, and the nearest when two overlap', () => {
    const blocks = [block('a', 'g', 'c1', 0, 0), block('b', 'g', 'c2', 0, 8), block('c', 'h', 'c3', 50, 0)];
    const origins = { c1: { x: 0, y: 0 }, c2: { x: 0, y: 8 }, c3: { x: 50, y: 0 } };
    expect(repeatAtPoint(blocks, origins, { x: 5, y: 9 })).toEqual({ groupId: 'g', circuitId: 'c2', origin: { x: 0, y: 8 } });
    expect(repeatAtPoint(blocks, origins, { x: 5, y: 5.5 })).toMatchObject({ circuitId: 'c1' });
    expect(repeatAtPoint(blocks, origins, { x: 61, y: 2 })).toMatchObject({ groupId: 'h' });
    expect(repeatAtPoint(blocks, origins, { x: 30, y: 30 })).toBeUndefined();
  });
});
