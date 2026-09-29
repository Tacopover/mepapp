import { describe, expect, it } from 'vitest';
import { STAMP_LIBRARY, type StampDefinition } from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { buildSchematicTerminals } from './schematicTerminals.js';

function stamp(id: string, overrides: Partial<StampInfo> = {}): StampInfo {
  return { id, category: 'terminal', transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 10, nativeHeight: 10, ports: [], linkedPortIds: null, capacity: 0, ...overrides };
}

describe('buildSchematicTerminals', () => {
  it('maps each stamp to its capacity, load type and definition', () => {
    const library = STAMP_LIBRARY[0];
    const result = buildSchematicTerminals([stamp('a', { capacity: 250, definitionId: library.id })], []);
    expect(result.a).toEqual({ label: library.label, capacity: 250, loadType: library.id, stampDefinitionId: library.id });
  });

  it('falls back to the category as load type for a stamp with no definition', () => {
    const result = buildSchematicTerminals([stamp('b', { category: 'equipment', capacity: 5 })], []);
    expect(result.b).toEqual({ label: undefined, capacity: 5, loadType: 'equipment', stampDefinitionId: undefined });
  });

  it('finds a custom definition by id', () => {
    const custom = { ...STAMP_LIBRARY[0], id: 'my-stamp', label: 'Mine', source: 'custom' } as StampDefinition;
    expect(buildSchematicTerminals([stamp('c', { definitionId: 'my-stamp' })], [custom]).c.label).toBe('Mine');
  });
});
