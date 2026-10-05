import { describe, expect, it } from 'vitest';
import { STAMP_LIBRARY, type StampDefinition } from '@mepapp/core';
import { getVisibleStampDefinitions } from './stampVisibility.js';

function stamp(overrides: Partial<StampDefinition> & Pick<StampDefinition, 'id' | 'source'>): StampDefinition {
  return {
    label: overrides.id,
    discipline: 'electrical',
    category: 'terminal',
    nativeWidth: 20,
    nativeHeight: 20,
    ports: [],
    iconRef: 'data:image/png;base64,AAAA',
    ...overrides,
  };
}

const ids = (defs: StampDefinition[]) => defs.map((d) => d.id);

describe('getVisibleStampDefinitions with user stamps', () => {
  const userTerminal = stamp({ id: 'user:src:zz-terminal', source: 'user', label: 'ZZ user terminal', iconRef: 'blob:http://x/1' });
  const userEquipment = stamp({ id: 'user:src:zz-equipment', source: 'user', label: 'ZZ user equipment', category: 'equipment', discipline: 'plumbing' });

  it('shows a user stamp under its category and discipline group', () => {
    expect(ids(getVisibleStampDefinitions([], 'electrical', 'terminal', 'en', '', [userTerminal, userEquipment]))).toContain(userTerminal.id);
    expect(ids(getVisibleStampDefinitions([], 'electrical', 'equipment', 'en', '', [userTerminal, userEquipment]))).not.toContain(userEquipment.id);
    expect(ids(getVisibleStampDefinitions([], 'plumbing', 'equipment', 'en', '', [userTerminal, userEquipment]))).toContain(userEquipment.id);
    expect(ids(getVisibleStampDefinitions([], 'hvac', 'terminal', 'en', '', [userTerminal]))).not.toContain(userTerminal.id);
    expect(ids(getVisibleStampDefinitions([], null, 'terminal', 'en', '', [userTerminal]))).toContain(userTerminal.id);
  });

  it('finds a user stamp by its label in the search box', () => {
    expect(ids(getVisibleStampDefinitions([], null, 'terminal', 'en', 'zz user', [userTerminal]))).toEqual([userTerminal.id]);
    expect(getVisibleStampDefinitions([], null, 'terminal', 'en', 'no such label', [userTerminal])).toEqual([]);
  });

  it('shows one tile, the user stamp, when a project copy has the same id', () => {
    const projectCopy = stamp({ id: userTerminal.id, source: 'user', label: 'ZZ user terminal', iconRef: 'data:image/png;base64,BBBB' });
    const visible = getVisibleStampDefinitions([projectCopy], null, 'terminal', 'en', '', [userTerminal]).filter((d) => d.id === userTerminal.id);
    expect(visible).toEqual([userTerminal]);
  });

  it('keeps an orphan project copy that has no library entry', () => {
    const orphan = stamp({ id: 'user:gone:orphan', source: 'user', label: 'ZZ orphan' });
    const visible = getVisibleStampDefinitions([orphan], null, 'terminal', 'en', '', [userTerminal]);
    expect(ids(visible)).toContain(orphan.id);
    expect(ids(visible)).toContain(userTerminal.id);
  });

  it('keeps a custom stamp with a source of custom even when its id matches nothing in the library folders', () => {
    const custom = stamp({ id: 'custom-1', source: 'custom', label: 'ZZ custom' });
    expect(ids(getVisibleStampDefinitions([custom], null, 'terminal', 'en', '', [userTerminal]))).toContain('custom-1');
  });

  it('still lets a custom override shadow a library stamp', () => {
    const library = STAMP_LIBRARY.find((def) => def.category === 'terminal')!;
    const override = { ...library, source: 'custom' as const, label: 'ZZ override' };
    const visible = getVisibleStampDefinitions([override], null, 'terminal', 'en', '', [userTerminal]);
    expect(visible.filter((d) => d.id === library.id)).toEqual([override]);
  });
});

describe('getVisibleStampDefinitions options', () => {
  const userTerminal = stamp({ id: 'user-src-zz', source: 'user', label: 'ZZ user terminal' });

  it('drops the built-in library when showBuiltIn is false but keeps overrides, custom and user stamps', () => {
    const library = STAMP_LIBRARY.find((def) => def.category === 'terminal')!;
    const override = { ...library, source: 'custom' as const, label: 'ZZ override' };
    const custom = stamp({ id: 'custom-1', source: 'custom', label: 'ZZ custom' });
    const visible = getVisibleStampDefinitions([override, custom], null, 'terminal', 'en', '', [userTerminal], { showBuiltIn: false });
    expect(ids(visible).sort()).toEqual([library.id, 'custom-1', userTerminal.id].sort());
    expect(getVisibleStampDefinitions([], null, 'terminal', 'en', '', [], { showBuiltIn: false })).toEqual([]);
    expect(getVisibleStampDefinitions([], null, 'terminal', 'en', '', [], {}).length).toBeGreaterThan(0);
  });

  it('skips a project copy whose id is in libraryRecordIds even when the stamp is hidden', () => {
    const copy = stamp({ id: 'user-src-hidden', source: 'user', label: 'ZZ hidden copy' });
    const orphan = stamp({ id: 'user-src-orphan', source: 'user', label: 'ZZ orphan' });
    const visible = getVisibleStampDefinitions([copy, orphan], null, 'terminal', 'en', '', [], { libraryRecordIds: new Set(['user-src-hidden']) });
    expect(ids(visible)).not.toContain(copy.id);
    expect(ids(visible)).toContain(orphan.id);
  });
});
