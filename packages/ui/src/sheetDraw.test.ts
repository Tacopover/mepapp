import { describe, expect, it } from 'vitest';
import { buildSampleSchematicInput, generateSchematic, SCHEMATIC_TEMPLATE_LIBRARY } from '@mepapp/core';
import { addCorner, firstCircuitOrigin, roundMm, drawStyle, finishShape, growDraft, isDragTool, polygonFromCorners, snapPoint, startDraft, textBlockSize } from './sheetDraw.js';

const sheet = { widthMm: 841, heightMm: 594 };
const style = drawStyle(0.35, false, sheet);

describe('sheet drawing helpers', () => {
  it('tells drag tools from click tools', () => {
    expect(['line', 'arrow', 'rect', 'circle', 'ellipse', 'arc'].every((t) => isDragTool(t as never))).toBe(true);
    expect(['select', 'polygon', 'text', 'symbol'].some((t) => isDragTool(t as never))).toBe(false);
  });

  it('snaps a point to the grid', () => {
    expect(snapPoint({ x: 10.4, y: 20.6 }, 1)).toEqual({ x: 10, y: 21 });
    expect(snapPoint({ x: 10.4, y: 20.6 }, 0)).toEqual({ x: 10.4, y: 20.6 });
  });

  it('draws a rectangle by dragging and turns it into a block at the same place', () => {
    const start = { x: 100, y: 50 };
    const draft = growDraft(startDraft('rect', 'r', start, sheet, style), start, { x: 140, y: 60 }, sheet);
    const item = finishShape(draft, sheet, 0.35);
    if (item?.kind !== 'shape') throw new Error('expected a shape');
    expect(item.box.x).toBeCloseTo(100 - 0.175);
    expect(item.box.y).toBeCloseTo(50 - 0.175);
    expect(item.box.width).toBeCloseTo(40.35);
    expect(item.box.height).toBeCloseTo(10.35);
  });

  it('gives a circle the pointer distance as its radius, on a sheet that is not square', () => {
    const start = { x: 200, y: 200 };
    const draft = growDraft(startDraft('circle', 'c', start, sheet, style), start, { x: 230, y: 200 }, sheet);
    const item = finishShape(draft, sheet, 0.35);
    if (item?.kind !== 'shape' || item.shape.kind !== 'circle') throw new Error('expected a circle');
    expect(item.shape.radius * Math.min(item.box.width, item.box.height)).toBeCloseTo(30);
  });

  it('treats a click without a drag as nothing', () => {
    const start = { x: 100, y: 50 };
    expect(finishShape(growDraft(startDraft('line', 'l', start, sheet, style), start, { x: 100.2, y: 50.2 }, sheet), sheet, 0.35)).toBeUndefined();
  });

  it('accepts a thin line that is long on one axis', () => {
    const start = { x: 10, y: 10 };
    const item = finishShape(growDraft(startDraft('line', 'l', start, sheet, style), start, { x: 60, y: 10 }, sheet), sheet, 0.35);
    expect(item?.kind).toBe('shape');
  });

  it('builds a polygon from three or more corners and skips a repeated corner', () => {
    let corners = addCorner([], { x: 10, y: 10 });
    corners = addCorner(corners, { x: 10.1, y: 10.1 });
    expect(corners).toHaveLength(1);
    corners = addCorner(addCorner(corners, { x: 50, y: 10 }), { x: 30, y: 40 });
    expect(polygonFromCorners('p', corners.slice(0, 2), sheet, style)).toBeUndefined();
    const polygon = polygonFromCorners('p', corners, sheet, style);
    expect(polygon?.kind).toBe('polygon');
    const item = polygon ? finishShape(polygon, sheet, 0.35) : undefined;
    expect(item?.kind).toBe('shape');
  });

  it('sizes a text block from its text', () => {
    expect(textBlockSize('Hi').width).toBeGreaterThanOrEqual(8);
    expect(textBlockSize('A much longer line of text').width).toBeGreaterThan(textBlockSize('Hi').width);
    expect(textBlockSize('a\nb\nc').height).toBeGreaterThan(textBlockSize('a').height);
  });
});

describe('firstCircuitOrigin', () => {
  const template = SCHEMATIC_TEMPLATE_LIBRARY[0];
  const input = buildSampleSchematicInput(template);
  const generated = generateSchematic(input, template);

  it('finds the origin of the first circuit that a group draws', () => {
    const standard = firstCircuitOrigin(template, input, generated, 'standard');
    expect(standard).toEqual(generated.circuitOrigins[generated.circuitOrder[0]]);
    const spare = firstCircuitOrigin(template, input, generated, 'spare');
    expect(spare).toEqual(generated.circuitOrigins['sample-c4']);
  });

  it('gives undefined for a group that draws no circuit, and for an unknown group', () => {
    const noSpares = { ...input, circuits: input.circuits.filter((c) => !c.isSpare) };
    expect(firstCircuitOrigin(template, noSpares, generateSchematic(noSpares, template), 'spare')).toBeUndefined();
    expect(firstCircuitOrigin(template, input, generated, 'nope')).toBeUndefined();
  });

  it('rounds to three decimals', () => {
    expect(roundMm(1.23456)).toBe(1.235);
  });
});
