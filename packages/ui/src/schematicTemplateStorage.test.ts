import { describe, expect, it } from 'vitest';
import { SCHEMATIC_TEMPLATE_LIBRARY } from '@mepapp/core';
import { SCHEMATIC_TEMPLATES_STORAGE_KEY, loadCustomTemplates, saveCustomTemplates, type StorageLike } from './schematicTemplateStorage.js';

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

const template = { ...structuredClone(SCHEMATIC_TEMPLATE_LIBRARY[0]), id: 'custom-1', name: 'Mine' };

describe('custom template storage', () => {
  it('round-trips a template', () => {
    const storage = fakeStorage();
    saveCustomTemplates(storage, [template]);
    expect(loadCustomTemplates(storage)).toEqual([template]);
  });

  it('returns an empty list for missing, broken or non-array data', () => {
    expect(loadCustomTemplates(fakeStorage())).toEqual([]);
    expect(loadCustomTemplates(fakeStorage('{not json'))).toEqual([]);
    expect(loadCustomTemplates(fakeStorage('{"a":1}'))).toEqual([]);
    expect(loadCustomTemplates(undefined)).toEqual([]);
  });

  it('drops entries that are not objects with an id and a name, or that fail validation', () => {
    const broken = structuredClone(template);
    broken.id = 'custom-2';
    broken.layoutBlocks[0].binding = '{oops';
    const noName = { id: 'x' };
    const storage = fakeStorage(JSON.stringify([template, broken, noName, 5, null, 'text']));
    expect(loadCustomTemplates(storage).map((t) => t.id)).toEqual(['custom-1']);
  });

  it('does not throw when the storage does', () => {
    const throwing: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('full');
      },
    };
    expect(loadCustomTemplates(throwing)).toEqual([]);
    expect(() => saveCustomTemplates(throwing, [template])).not.toThrow();
  });

  it('uses the documented key', () => {
    const storage = fakeStorage();
    saveCustomTemplates(storage, []);
    expect(SCHEMATIC_TEMPLATES_STORAGE_KEY).toBe('mepapp.schematicTemplates');
    expect(storage.value).toBe('[]');
  });
});
