import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import type { ResolvedBlock, SymbolShape } from '@mepapp/core';
import { SchematicBlockSvg } from './schematicBlockSvg.js';
import { SymbolShapesSvg } from './symbolShapeSvg.js';

// SchematicBlockSvg is a plain function component, so calling it returns the element tree that
// these tests search, without a DOM.

const shape: SymbolShape = { id: 's1', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style: { stroke: '#000000', strokeWidth: 0.02, fill: null } };

function block(type: ResolvedBlock['type'], extra: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return { id: 'b', templateBlockId: 'b', type, scope: 'circuit', x: 0, y: 0, width: 10, height: 14, rotation: 0, text: 'B16', panelId: 'p', ...extra };
}

function collect(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => collect(n, found));
  else if (node && typeof node === 'object' && 'props' in node) {
    const element = node as ReactElement<{ children?: unknown }>;
    found.push(element);
    collect(element.props.children, found);
  }
  return found;
}

const symbolElements = (element: ReactElement) => collect(element).filter((e) => e.type === SymbolShapesSvg);
const tagCount = (element: ReactElement, tag: string) => collect(element).filter((e) => e.type === tag).length;

describe('SchematicBlockSvg symbols on device blocks', () => {
  it.each(['mainDevice', 'protectiveDevice', 'accessoryDevice', 'loadSymbol'] as const)('draws the symbol for a %s block and keeps its text', (type) => {
    const element = SchematicBlockSvg({ block: block(type, { symbolId: 'sym' }), symbolShapes: [shape] });
    const symbols = symbolElements(element);
    expect(symbols).toHaveLength(1);
    expect((symbols[0].props as { shapes: SymbolShape[] }).shapes).toEqual([shape]);
    if (type !== 'loadSymbol') expect(collect(element).some((e) => (e.props as { children?: unknown }).children === 'B16')).toBe(true);
  });

  it('gives the protective device symbol the area of the built-in mark', () => {
    const element = SchematicBlockSvg({ block: block('protectiveDevice', { symbolId: 'sym' }), symbolShapes: [shape] });
    const props = symbolElements(element)[0].props as { widthPx: number; heightPx: number; minStrokePx: number };
    expect(props.widthPx).toBe(10);
    expect(props.heightPx).toBeCloseTo(Math.max(14 - 2.6 - 1, 7));
    expect(props.minStrokePx).toBeLessThan(0.3);
  });

  it('draws the built-in mark when the block has no symbol', () => {
    const element = SchematicBlockSvg({ block: block('protectiveDevice') });
    expect(symbolElements(element)).toHaveLength(0);
    expect(tagCount(element, 'rect')).toBe(1);
    expect(tagCount(element, 'line')).toBe(3);
  });

  it('falls back to the built-in mark when the symbol no longer exists', () => {
    const element = SchematicBlockSvg({ block: block('protectiveDevice', { symbolId: 'gone' }), symbolShapes: undefined });
    expect(symbolElements(element)).toHaveLength(0);
    expect(tagCount(element, 'rect')).toBe(1);
  });

  it('a load symbol with a symbol id ignores the stamp art', () => {
    const stamp: SymbolShape = { ...shape, id: 'stamp' };
    const element = SchematicBlockSvg({ block: block('loadSymbol', { symbolId: 'sym' }), symbolShapes: [shape], loadShapes: [stamp] });
    const symbols = symbolElements(element);
    expect(symbols).toHaveLength(1);
    expect((symbols[0].props as { shapes: SymbolShape[] }).shapes[0].id).toBe('s1');
  });
});
