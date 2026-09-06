import { describe, expect, it } from 'vitest';
import { getStampDefinition, stampDefinitionsForDiscipline, STAMP_LIBRARY } from './stamp-library.js';

describe('stamp library', () => {
  it('has at least one entry per represented discipline', () => {
    expect(STAMP_LIBRARY.length).toBeGreaterThan(0);
    for (const def of STAMP_LIBRARY) {
      expect(def.id).toBeTruthy();
      expect(def.iconRef).toBeTruthy();
    }
  });

  it('finds a definition by id', () => {
    expect(getStampDefinition('fire-hose-reel')?.label).toBe('Fire Hose Reel');
    expect(getStampDefinition('does-not-exist')).toBeUndefined();
  });

  it('filters by discipline', () => {
    const electrical = stampDefinitionsForDiscipline('electricalCircuits');
    expect(electrical.length).toBeGreaterThan(0);
    expect(electrical.every((def) => def.discipline === 'electricalCircuits')).toBe(true);
    expect(stampDefinitionsForDiscipline('plumbing')).toEqual([]);
  });

  it('returns the full library when discipline is null', () => {
    expect(stampDefinitionsForDiscipline(null)).toEqual(STAMP_LIBRARY);
  });
});
