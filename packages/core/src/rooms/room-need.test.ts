import { describe, expect, it } from 'vitest';
import { allNeeds, BASES_OF_KIND, BUILT_IN_NEEDS, isBuiltInNeedId, needUnitOne, parseRoomNeeds, validateRoomNeed, type RoomNeed } from './room-need.js';

const data: RoomNeed = { id: 'need-data', name: 'Data outlets', kind: 'count', unit: 'outlets', unitOne: 'outlet', own: true };

describe('room needs', () => {
  it('has the built-in needs with unique ids, Return air included', () => {
    expect(BUILT_IN_NEEDS.map((n) => n.id)).toEqual(['light', 'supplyAir', 'returnAir', 'heating', 'cooling', 'sockets']);
    expect(BUILT_IN_NEEDS.find((n) => n.id === 'returnAir')).toMatchObject({ name: 'Return air', kind: 'flow', unit: 'dm³/s' });
    expect(isBuiltInNeedId('sockets')).toBe(true);
    expect(isBuiltInNeedId('need-data')).toBe(false);
    expect(BASES_OF_KIND.flow).toContain('volume');
    expect(BASES_OF_KIND.count).not.toContain('volume');
  });

  it('lists the built-in needs, then the own needs', () => {
    expect(allNeeds([data, { ...data, id: 'light', name: 'Fake light' }]).map((n) => n.id)).toEqual([...BUILT_IN_NEEDS.map((n) => n.id), 'need-data']);
    expect(needUnitOne(data)).toBe('outlet');
    expect(needUnitOne({ unit: 'kg' })).toBe('kg');
  });

  it('validates an own need', () => {
    expect(validateRoomNeed(data, [])).toBeNull();
    expect(validateRoomNeed({ ...data, name: ' ' }, [])).toBe('Enter a name.');
    expect(validateRoomNeed({ ...data, name: 'sockets' }, [])).toMatch(/already called "sockets"/);
    expect(validateRoomNeed({ ...data, name: 'Data' }, [{ ...data, id: 'need-2', name: 'data' }])).toMatch(/already/);
    expect(validateRoomNeed(data, [data])).toBeNull();
    expect(validateRoomNeed({ ...data, id: 'heating' }, [])).toMatch(/built-in/);
    expect(validateRoomNeed({ ...data, kind: 'light', unit: 'lm' }, [])).toMatch(/what the need is/);
    expect(validateRoomNeed({ ...data, unit: ' ' }, [])).toBe('Enter the unit.');
    expect(validateRoomNeed({ ...data, kind: 'flow', unit: 'm³/h' }, [])).toBe('Enter the unit.');
    expect(validateRoomNeed({ ...data, kind: 'flow', unit: 'dm³/s' }, [])).toBeNull();
  });

  it('reads stored own needs and leaves out bad entries, built-in ids and repeated ids', () => {
    const raw = [
      data,
      { ...data, name: 'Again' },
      { id: 'light', name: 'Light', kind: 'count', unit: 'x' },
      { id: 'need-air', name: 'Kitchen hood', kind: 'flow', unit: 'm³/h', unitOne: 'x' },
      { id: 'need-water', name: 'Water', kind: 'amount', unit: ' l/s ' },
      { id: 'need-bad', name: 'Bad', kind: 'light', unit: 'lm' },
      { id: 'need-empty', name: 'Empty', kind: 'count', unit: '' },
      { id: '', name: 'No id', kind: 'count', unit: 'x' },
      null,
    ];
    expect(parseRoomNeeds(raw)).toEqual([
      data,
      { id: 'need-air', name: 'Kitchen hood', kind: 'flow', unit: 'dm³/s', own: true },
      { id: 'need-water', name: 'Water', kind: 'amount', unit: 'l/s', own: true },
    ]);
    expect(parseRoomNeeds({})).toBeNull();
  });
});
