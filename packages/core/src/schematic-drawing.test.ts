import { describe, expect, it } from 'vitest';
import { drawnShapeToBlock } from './schematic-drawing.js';
import type { SymbolShape } from './symbol-shapes.js';

const sheet = { widthMm: 841, heightMm: 594 };
const style = { stroke: '#111111', strokeWidth: 0.001, fill: null };

/** Where a point lands on the sheet in mm after the shape sits in its block box. */
const toSheet = (block: { x: number; y: number; width: number; height: number }, fx: number, fy: number) => ({ x: block.x + fx * block.width, y: block.y + fy * block.height });

describe('drawnShapeToBlock', () => {
  it('keeps a line in the same place on the sheet', () => {
    const line: SymbolShape = { id: 'l', kind: 'line', x1: 100 / 841, y1: 50 / 594, x2: 160 / 841, y2: 110 / 594, style };
    const placed = drawnShapeToBlock(line, sheet, 0.3);
    if (placed.shape.kind !== 'line') throw new Error('kind');
    const a = toSheet(placed, placed.shape.x1, placed.shape.y1);
    const b = toSheet(placed, placed.shape.x2, placed.shape.y2);
    expect(a.x).toBeCloseTo(100);
    expect(a.y).toBeCloseTo(50);
    expect(b.x).toBeCloseTo(160);
    expect(b.y).toBeCloseTo(110);
    expect(placed.width).toBeCloseTo(60.3);
    expect(placed.height).toBeCloseTo(60.3);
  });

  it('gives a horizontal line a box that is thick enough and centres the line in it', () => {
    const line: SymbolShape = { id: 'l', kind: 'line', x1: 100 / 841, y1: 50 / 594, x2: 200 / 841, y2: 50 / 594, style };
    const placed = drawnShapeToBlock(line, sheet, 0.3);
    expect(placed.height).toBeGreaterThanOrEqual(1);
    if (placed.shape.kind !== 'line') throw new Error('kind');
    expect(placed.shape.y1).toBeCloseTo(0.5);
    expect(placed.shape.y2).toBeCloseTo(0.5);
  });

  it('keeps a rectangle and its line width in mm', () => {
    const rect: SymbolShape = { id: 'r', kind: 'rect', x: 20 / 841, y: 30 / 594, width: 40 / 841, height: 10 / 594, style };
    const placed = drawnShapeToBlock(rect, sheet, 0.5);
    if (placed.shape.kind !== 'rect') throw new Error('kind');
    const corner = toSheet(placed, placed.shape.x, placed.shape.y);
    expect(corner.x).toBeCloseTo(20);
    expect(corner.y).toBeCloseTo(30);
    expect(placed.shape.width * placed.width).toBeCloseTo(40);
    expect(placed.shape.height * placed.height).toBeCloseTo(10);
    expect(placed.shape.style.strokeWidth * Math.min(placed.width, placed.height)).toBeCloseTo(0.5);
  });

  it('keeps a circle round: the radius is the same in mm', () => {
    const minSide = Math.min(sheet.widthMm, sheet.heightMm);
    const circle: SymbolShape = { id: 'c', kind: 'circle', cx: 300 / 841, cy: 200 / 594, radius: 25 / minSide, style };
    const placed = drawnShapeToBlock(circle, sheet, 0.3);
    if (placed.shape.kind !== 'circle') throw new Error('kind');
    expect(placed.shape.radius * Math.min(placed.width, placed.height)).toBeCloseTo(25);
    const center = toSheet(placed, placed.shape.cx, placed.shape.cy);
    expect(center.x).toBeCloseTo(300);
    expect(center.y).toBeCloseTo(200);
    expect(placed.width).toBeCloseTo(placed.height);
  });

  it('keeps an ellipse, a polygon and a text in place', () => {
    const ellipse: SymbolShape = { id: 'e', kind: 'ellipse', cx: 400 / 841, cy: 300 / 594, radiusX: 30 / 841, radiusY: 10 / 594, style };
    const e = drawnShapeToBlock(ellipse, sheet, 0.3);
    if (e.shape.kind !== 'ellipse') throw new Error('kind');
    expect(e.shape.radiusX * e.width).toBeCloseTo(30);
    expect(e.shape.radiusY * e.height).toBeCloseTo(10);

    const polygon: SymbolShape = { id: 'p', kind: 'polygon', points: [{ x: 10 / 841, y: 10 / 594 }, { x: 50 / 841, y: 10 / 594 }, { x: 30 / 841, y: 40 / 594 }], style };
    const p = drawnShapeToBlock(polygon, sheet, 0.3);
    if (p.shape.kind !== 'polygon') throw new Error('kind');
    const tip = toSheet(p, p.shape.points[2].x, p.shape.points[2].y);
    expect(tip.x).toBeCloseTo(30);
    expect(tip.y).toBeCloseTo(40);
    expect(p.shape.points.every((pt) => pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1)).toBe(true);

    const text: SymbolShape = { id: 't', kind: 'text', x: 10 / 841, y: 10 / 594, text: 'Hello', fontSize: 4 / 594, style };
    const t = drawnShapeToBlock(text, sheet, 0.3);
    if (t.shape.kind !== 'text') throw new Error('kind');
    expect(t.shape.fontSize * t.height).toBeCloseTo(4);
  });

  it('leaves the input shape unchanged', () => {
    const line: SymbolShape = { id: 'l', kind: 'line', x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2, style };
    const before = structuredClone(line);
    drawnShapeToBlock(line, sheet, 0.3);
    expect(line).toEqual(before);
  });
});
