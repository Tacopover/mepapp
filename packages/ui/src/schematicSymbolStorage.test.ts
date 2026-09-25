import { describe, expect, it } from 'vitest';
import type { SchematicSymbol } from '@mepapp/core';
import { loadCustomSymbols, saveCustomSymbols } from './schematicSymbolStorage.js';
import type { StorageLike } from './schematicTemplateStorage.js';

function fakeStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

const symbol: SchematicSymbol = {
  id: 'sym-1',
  name: 'Contactor',
  widthMm: 8,
  heightMm: 6,
  shapes: [{ id: 's1', kind: 'line', x1: 0, y1: 0.5, x2: 1, y2: 0.5, style: { stroke: '#000', strokeWidth: 1, fill: null } }],
  ports: [{ id: 'p1', name: 'In', fractionX: 0, fractionY: 0.5 }],
};

describe('custom symbol storage', () => {
  it('round-trips a symbol with its ports', () => {
    const storage = fakeStorage();
    saveCustomSymbols(storage, [symbol]);
    expect(loadCustomSymbols(storage)).toEqual([symbol]);
  });

  it('returns an empty list for missing, broken or non-array data', () => {
    expect(loadCustomSymbols(fakeStorage())).toEqual([]);
    expect(loadCustomSymbols(fakeStorage('{not json'))).toEqual([]);
    expect(loadCustomSymbols(fakeStorage('{"a":1}'))).toEqual([]);
    expect(loadCustomSymbols(undefined)).toEqual([]);
  });

  it('drops entries that fail validation or are not symbols', () => {
    const noShapes = { ...symbol, id: 'sym-2', shapes: [] };
    const storage = fakeStorage(JSON.stringify([symbol, noShapes, { id: 'x' }, 5, null]));
    expect(loadCustomSymbols(storage).map((s) => s.id)).toEqual(['sym-1']);
  });
});
