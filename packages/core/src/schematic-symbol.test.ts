import { describe, expect, it } from 'vitest';
import { SCHEMATIC_TEMPLATE_LIBRARY } from './schematic-template-library.js';
import { countSymbolUses, validateSchematicSymbol, type SchematicSymbol } from './schematic-symbol.js';
import type { SymbolShape } from './symbol-shapes.js';

const line: SymbolShape = { id: 's1', kind: 'line', x1: 0, y1: 0.5, x2: 1, y2: 0.5, style: { stroke: '#000', strokeWidth: 1, fill: null } };

function symbol(extra: Partial<SchematicSymbol> = {}): SchematicSymbol {
  return { id: 'sym', name: 'Contactor', widthMm: 8, heightMm: 6, shapes: [line], ports: [], ...extra };
}

describe('validateSchematicSymbol', () => {
  it('accepts a symbol with a shape and no ports', () => {
    expect(validateSchematicSymbol(symbol())).toEqual([]);
  });

  it('accepts ports and a link group that names them', () => {
    const ports = [
      { id: 'a', name: 'In', fractionX: 0, fractionY: 0.5 },
      { id: 'b', name: 'Out', fractionX: 1, fractionY: 0.5 },
    ];
    expect(validateSchematicSymbol(symbol({ ports, portGroups: [['a', 'b']] }))).toEqual([]);
  });

  it('rejects a blank name, a bad size and an empty drawing', () => {
    expect(validateSchematicSymbol(symbol({ name: '  ' }))).toEqual(['The symbol needs a name.']);
    expect(validateSchematicSymbol(symbol({ widthMm: 0 }))).toEqual(['The symbol size must be positive.']);
    expect(validateSchematicSymbol(symbol({ heightMm: Number.NaN }))).toEqual(['The symbol size must be positive.']);
    expect(validateSchematicSymbol(symbol({ shapes: [] }))).toEqual(['Draw at least one shape.']);
  });

  it('rejects a repeated port id and a link to a missing port', () => {
    const p = { id: 'a', name: 'In', fractionX: 0, fractionY: 0 };
    expect(validateSchematicSymbol(symbol({ ports: [p, p] }))).toEqual(['Port "a" reuses an id.']);
    expect(validateSchematicSymbol(symbol({ ports: [p], portGroups: [['a', 'gone']] }))).toEqual(['A linked group names a port that does not exist.']);
  });
});

describe('countSymbolUses', () => {
  it('counts blocks in the layout and in groups, across templates', () => {
    const a = structuredClone(SCHEMATIC_TEMPLATE_LIBRARY[0]);
    const b = structuredClone(SCHEMATIC_TEMPLATE_LIBRARY[0]);
    a.layoutBlocks.push({ id: 'x1', type: 'drawing', x: 0, y: 0, rotation: 0, symbolId: 'sym' });
    a.groups[0].blocks.push({ id: 'x2', type: 'drawing', x: 0, y: 0, rotation: 0, symbolId: 'sym' });
    b.groups[0].blocks.push({ id: 'x3', type: 'drawing', x: 0, y: 0, rotation: 0, symbolId: 'other' });
    a.groups[1].blocks.push({ id: 'x4', type: 'protectiveDevice', x: 0, y: 0, rotation: 0, symbolId: 'sym' });
    a.layoutBlocks.push({ id: 'x5', type: 'mainDevice', x: 0, y: 0, rotation: 0, symbolId: 'sym' });
    expect(countSymbolUses([a, b], 'sym')).toBe(4);
    expect(countSymbolUses([a, b], 'other')).toBe(1);
    expect(countSymbolUses([a, b], 'none')).toBe(0);
  });
});
