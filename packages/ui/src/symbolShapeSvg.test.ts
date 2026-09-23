import { describe, expect, it } from 'vitest';
import type { SymbolShape, SymbolShapeStyle } from '@mepapp/core';
import { renderSymbolShapeSvg } from './symbolShapeSvg.js';

// React elements are plain objects before rendering — .type/.props can be asserted on directly
// without a DOM/jsdom or a test renderer, since these tests only need to check which SVG tag
// and attributes renderSymbolShapeSvg produces, not how a browser paints them.

const STYLE: SymbolShapeStyle = { stroke: '#112233', strokeWidth: 0.01, fill: null };
const FILLED_STYLE: SymbolShapeStyle = { stroke: '#112233', strokeWidth: 0.01, fill: '#ff0000' };
const W = 100;
const H = 200;

describe('renderSymbolShapeSvg', () => {
  it('renders a line shape as an <line> with fraction-space coords scaled to px', () => {
    const shape: SymbolShape = { id: '1', kind: 'line', x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('line');
    expect(el.props.x1).toBeCloseTo(10);
    expect(el.props.y1).toBeCloseTo(40);
    expect(el.props.x2).toBeCloseTo(50);
    expect(el.props.y2).toBeCloseTo(120);
    expect(el.props.stroke).toBe('#112233');
    expect(el.props.transform).toBeUndefined();
  });

  it('applies a strokeWidth of at least 1px, matching drawSymbolShapes', () => {
    const shape: SymbolShape = { id: '1', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style: { ...STYLE, strokeWidth: 0.0001 } };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.props.strokeWidth).toBeGreaterThanOrEqual(1);
  });

  it('renders a rect shape with fill "none" when style.fill is null', () => {
    const shape: SymbolShape = { id: '1', kind: 'rect', x: 0.1, y: 0.1, width: 0.2, height: 0.3, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('rect');
    expect(el.props.fill).toBe('none');
    expect(el.props.width).toBeCloseTo(20);
    expect(el.props.height).toBeCloseTo(60);
  });

  it('renders a rect shape with the shape fill color when set', () => {
    const shape: SymbolShape = { id: '1', kind: 'rect', x: 0, y: 0, width: 0.5, height: 0.5, style: FILLED_STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.props.fill).toBe('#ff0000');
  });

  it('scales a circle radius by the shorter of widthPx/heightPx', () => {
    const shape: SymbolShape = { id: '1', kind: 'circle', cx: 0.5, cy: 0.5, radius: 0.25, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('circle');
    expect(el.props.r).toBeCloseTo(0.25 * Math.min(W, H));
  });

  it('renders a partial arc as a <path> with an SVG arc command', () => {
    const shape: SymbolShape = { id: '1', kind: 'arc', cx: 0.5, cy: 0.5, radius: 0.25, startAngle: 0, endAngle: Math.PI / 2, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('path');
    expect(el.props.d).toMatch(/^M .* A /);
    expect(el.props.fill).toBe('none');
  });

  it('falls back to a full <circle> when an arc sweeps (near) a full turn', () => {
    const shape: SymbolShape = { id: '1', kind: 'arc', cx: 0.5, cy: 0.5, radius: 0.25, startAngle: 0, endAngle: Math.PI * 2 - 1e-9, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('circle');
  });

  it('renders a text shape as a hanging-baseline <text> with the shape text as children', () => {
    const shape: SymbolShape = { id: '1', kind: 'text', x: 0.1, y: 0.1, text: 'Label', fontSize: 0.08, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('text');
    expect(el.props.children).toBe('Label');
    expect(el.props.dominantBaseline).toBe('hanging');
    expect(el.props.fontSize).toBeCloseTo(0.08 * H);
  });

  it('renders an arrow as a <g> containing a line and an arrowhead polygon', () => {
    const shape: SymbolShape = { id: '1', kind: 'arrow', x1: 0, y1: 0, x2: 1, y2: 0, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('g');
    const children = el.props.children as ReturnType<typeof renderSymbolShapeSvg>[];
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe('line');
    expect(children[1].type).toBe('polygon');
  });

  it('scales ellipse radii independently per axis (not by the shorter dimension)', () => {
    const shape: SymbolShape = { id: '1', kind: 'ellipse', cx: 0.5, cy: 0.5, radiusX: 0.2, radiusY: 0.1, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('ellipse');
    expect(el.props.rx).toBeCloseTo(0.2 * W);
    expect(el.props.ry).toBeCloseTo(0.1 * H);
  });

  it('renders a polygon as a <polygon> with a space-separated points string', () => {
    const shape: SymbolShape = {
      id: '1',
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
      ],
      style: STYLE,
    };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('polygon');
    expect(el.props.points).toBe(`0,0 ${W},0 ${W / 2},${H}`);
  });

  it('renders an image shape as an <image> referencing the dataUrl directly, stretched via preserveAspectRatio none', () => {
    const shape: SymbolShape = { id: '1', kind: 'image', dataUrl: 'data:image/png;base64,AAAA', x: 0, y: 0, width: 1, height: 1, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.type).toBe('image');
    expect(el.props.href).toBe('data:image/png;base64,AAAA');
    expect(el.props.preserveAspectRatio).toBe('none');
  });

  it('applies a rotate() transform about the shape center when rotation is set', () => {
    const shape: SymbolShape = { id: '1', kind: 'rect', x: 0, y: 0, width: 1, height: 1, rotation: Math.PI / 2, style: STYLE };
    const el = renderSymbolShapeSvg(shape, W, H);
    expect(el.props.transform).toBe(`rotate(90 ${W / 2} ${H / 2})`);
  });
});
