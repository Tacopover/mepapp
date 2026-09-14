import { describe, expect, it } from 'vitest';
import { getStampDefinition, stampDefinitionsForDiscipline, STAMP_LIBRARY, type StampDefinition } from './stamp-library.js';

const customDef: StampDefinition = {
  id: 'custom-1',
  label: 'My Custom Terminal',
  discipline: 'plumbing',
  category: 'terminal',
  nativeWidth: 40,
  nativeHeight: 40,
  ports: [],
  iconRef: 'data:image/png;base64,AAAA',
  source: 'custom',
};

describe('stamp library', () => {
  it('has at least one entry per represented discipline', () => {
    expect(STAMP_LIBRARY.length).toBeGreaterThan(0);
    for (const def of STAMP_LIBRARY) {
      expect(def.id).toBeTruthy();
      expect(def.iconRef).toBeTruthy();
      expect(def.source).toBe('library');
    }
  });

  it('finds a definition by id', () => {
    expect(getStampDefinition('fire-hose-reel')?.label).toBe('Fire Hose Reel');
    expect(getStampDefinition('does-not-exist')).toBeUndefined();
  });

  it('filters by discipline', () => {
    const electrical = stampDefinitionsForDiscipline('electrical');
    expect(electrical.length).toBeGreaterThan(0);
    expect(electrical.every((def) => def.discipline === 'electrical')).toBe(true);
    const plumbing = stampDefinitionsForDiscipline('plumbing');
    expect(plumbing.length).toBeGreaterThan(0); // fixture-generated entries (Terminals-english/Equipment-english)
    expect(plumbing.every((def) => def.discipline === 'plumbing')).toBe(true);
  });

  it('returns the full library when discipline is null', () => {
    expect(stampDefinitionsForDiscipline(null)).toEqual(STAMP_LIBRARY);
  });

  it('searches the custom-definitions list too, once given one', () => {
    expect(getStampDefinition('custom-1', [customDef])).toBe(customDef);
    expect(getStampDefinition('custom-1')).toBeUndefined(); // no custom list given — library-only, same as before
    expect(stampDefinitionsForDiscipline('plumbing', [customDef])).toContain(customDef);
    expect(stampDefinitionsForDiscipline(null, [customDef])).toEqual([...STAMP_LIBRARY, customDef]);
  });

  it('every id is unique across the merged library', () => {
    const ids = STAMP_LIBRARY.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fixture-generated entries carry a Dutch label; the hand-typed fire-hose-reel does not', () => {
    const pump = getStampDefinition('pump-plumbing');
    expect(pump?.labelNl).toBe('Pomp');
    expect(getStampDefinition('fire-hose-reel')?.labelNl).toBeUndefined();
  });

  it('a multi-discipline fixture item (Pump) gets one entry per discipline, same art and ports', () => {
    const hvac = getStampDefinition('pump-hvac');
    const plumbing = getStampDefinition('pump-plumbing');
    expect(hvac?.discipline).toBe('heatingAndCooling');
    expect(plumbing?.discipline).toBe('plumbing');
    expect(hvac?.iconRef).toBe(plumbing?.iconRef);
    expect(hvac?.ports).toEqual(plumbing?.ports);
  });
});
