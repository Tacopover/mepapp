import { describe, expect, it } from 'vitest';
import {
  applyRoomTypeMatch,
  matchRoomType,
  parseRoomTypeKeywords,
  parseRoomTypes,
  ROOM_DEMAND_FIELDS,
  ROOM_TYPE_DEMAND_EXAMPLES,
  ROOM_TYPE_LIBRARY,
  roomTextWords,
  validateRoomTypeFields,
  type RoomType,
} from './room-type.js';

const typeOf = (name: string | null, details?: string[]) => matchRoomType(name, details, ROOM_TYPE_LIBRARY)?.id ?? null;

describe('matchRoomType', () => {
  // Room names as readRoomLabels reads them from the fixture PDFs (10A, 00_arch_ground_floor_w_rooms, Example_2, Example_3, 01_arch_first_floor).
  it.each([
    ['toiletruimte', undefined, 'toilet'],
    ['Miva-toilet', undefined, 'toilet'],
    ['vluchttrappenhuis (TR-A-02)', undefined, 'stairs'],
    ['hoofdtrappenhuis (TR-A-01)', undefined, 'stairs'],
    ['lifthal', undefined, 'entrance'],
    ['cargo lift (LI-A-01)', undefined, 'lift'],
    ['installatieruimte NSA 1', undefined, 'technical'],
    ['SER-ruimte', undefined, 'technical'],
    ['Kast MER/SER', undefined, 'technical'],
    ['midden spanningsruimte 1', undefined, 'technical'],
    ['Plenum bg NSA ruimte 1', undefined, 'shaft'],
    ['Invoerkasten', undefined, 'technical'],
    ['Opslag pantry', undefined, 'storage'],
    ['Opslag onderwijsmateriaal', ['Overige ruimten'], 'storage'],
    ['Lockers-garderobe', undefined, 'changing'],
    ['Werkplek', ['sup.+servicepunt'], 'office'],
    ['Individuele werkplekken', ['Studielandschap'], 'office'],
    ['Overleg', undefined, 'meeting'],
    ['Lokaal 30p', ['Onderwijsruimten'], 'classroom'],
    ['Vlakke vloerzaal 100p', ['Onderwijsruimten'], 'classroom'],
    ['Verkeersruimte', ['Redundant', 'Space'], 'corridor'],
    ['Tochtsluis', undefined, 'entrance'],
    ['Werkkasten', ['Schoonmaak'], 'cleaning'],
    ['Afvalruimte', ['Afvalverzameling'], 'waste'],
    ['Keuken', ['Horeca'], 'kitchen'],
  ])('%s -> %s', (name, details, expected) => {
    expect(typeOf(name, details)).toBe(expected);
  });

  it('falls back to the label details when the name does not match', () => {
    expect(typeOf('Ec212', ['toiletgroep H', 'Toiletten'])).toBe('toilet');
    expect(typeOf('(Ec.02.01.09a)', ['Gang'])).toBe('corridor');
    expect(typeOf('computervloer op vijzels', ['laagspanningsruimte 1'])).toBe('technical');
  });

  it('does not match a keyword inside a word, or a short keyword in a longer word', () => {
    expect(typeOf('Reservering Covid effect', ['Overig'])).toBeNull(); // "server" is inside "reservering"
    expect(typeOf('Kamer 3')).toBeNull(); // "mer" is a short keyword
    expect(typeOf('Werkplek', ['sup.+servicepunt'])).toBe('office'); // "ser" is not a whole word
  });

  it('gives null for names nothing matches', () => {
    expect(typeOf('Casco')).toBeNull();
    expect(typeOf('EHBO/kolf')).toBeNull();
    expect(typeOf(null)).toBeNull();
    expect(typeOf('', [])).toBeNull();
  });

  it('ignores case and accents, and matches a keyword of several words as words in a row', () => {
    const types: RoomType[] = [{ id: 'plant', name: 'Plant room', keywords: ['plant room'] }, { id: 'cafe', name: 'Café', keywords: ['cafe'] }];
    expect(matchRoomType('Main PLANT ROOM', undefined, types)?.id).toBe('plant');
    expect(matchRoomType('Plant', undefined, types)).toBeNull();
    expect(matchRoomType('Grand Café', undefined, types)?.id).toBe('cafe');
  });
});

describe('applyRoomTypeMatch', () => {
  const room = (patch: Record<string, unknown> = {}) => ({ name: 'Toiletten', details: [] as string[], ...patch }) as { name: string | null; details?: string[]; roomTypeId?: string; roomTypeSource?: 'matched' | 'user' };

  it('sets a matched type', () => {
    expect(applyRoomTypeMatch(room(), ROOM_TYPE_LIBRARY)).toMatchObject({ roomTypeId: 'toilet', roomTypeSource: 'matched' });
  });

  it('keeps a type the user chose, also "no type"', () => {
    const chosen = room({ roomTypeId: 'storage', roomTypeSource: 'user' });
    expect(applyRoomTypeMatch(chosen, ROOM_TYPE_LIBRARY)).toBe(chosen);
    const none = room({ roomTypeSource: 'user' });
    expect(applyRoomTypeMatch(none, ROOM_TYPE_LIBRARY)).toBe(none);
  });

  it('removes a matched type when the name no longer matches', () => {
    const next = applyRoomTypeMatch(room({ name: 'Casco', roomTypeId: 'toilet', roomTypeSource: 'matched' }), ROOM_TYPE_LIBRARY);
    expect('roomTypeId' in next).toBe(false);
    expect('roomTypeSource' in next).toBe(false);
  });

  it('returns the same object when nothing changes', () => {
    const matched = room({ roomTypeId: 'toilet', roomTypeSource: 'matched' });
    expect(applyRoomTypeMatch(matched, ROOM_TYPE_LIBRARY)).toBe(matched);
    const unmatched = room({ name: 'Casco' });
    expect(applyRoomTypeMatch(unmatched, ROOM_TYPE_LIBRARY)).toBe(unmatched);
  });
});

describe('room type fields', () => {
  it('splits words without accents', () => {
    expect(roomTextWords('Café-Toilet (1.02)')).toEqual(['cafe', 'toilet', '1', '02']);
  });

  it('parses a keyword list as the user types it', () => {
    expect(parseRoomTypeKeywords(' WC, toilet ,,\nsanitair; wc ')).toEqual(['wc', 'toilet', 'sanitair']);
  });

  it('validates the name and the area per person', () => {
    expect(validateRoomTypeFields({ name: ' ' }, [])).toMatch(/name/);
    expect(validateRoomTypeFields({ name: 'toilet' }, ROOM_TYPE_LIBRARY)).toMatch(/already/);
    expect(validateRoomTypeFields({ name: 'Lab', areaPerPersonM2: 0 }, [])).toMatch(/per person/);
    expect(validateRoomTypeFields({ name: 'Lab', areaPerPersonM2: 10 }, ROOM_TYPE_LIBRARY)).toBeNull();
  });

  it('validates the demands: each a number of 0 or more', () => {
    expect(validateRoomTypeFields({ name: 'Lab', demands: { illuminanceLx: 500, supplyPerM2Dm3s: 0 } }, [])).toBeNull();
    expect(validateRoomTypeFields({ name: 'Lab', demands: { illuminanceLx: -1 } }, [])).toMatch(/Illuminance/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { airChangesPerH: Number.NaN } }, [])).toMatch(/Air changes/);
  });

  it('reads the demands of a stored type: known keys with a number of 0 or more', () => {
    const raw = [
      { id: 'a', name: 'A', keywords: [], demands: { illuminanceLx: 500, supplyPerM2Dm3s: 0, unknown: 3, exhaustFixedDm3s: -2, socketsFixed: '4' } },
      { id: 'b', name: 'B', keywords: [], demands: { unknown: 3 } },
    ];
    expect(parseRoomTypes(raw)).toEqual([{ id: 'a', name: 'A', keywords: [], demands: { illuminanceLx: 500, supplyPerM2Dm3s: 0 } }, { id: 'b', name: 'B', keywords: [] }]);
  });

  it('has example demands only for built-in types, with valid values', () => {
    const ids = new Set(ROOM_TYPE_LIBRARY.map((t) => t.id));
    for (const [id, example] of Object.entries(ROOM_TYPE_DEMAND_EXAMPLES)) {
      expect(ids.has(id)).toBe(true);
      expect(validateRoomTypeFields({ name: 'X', ...example }, [])).toBeNull();
    }
    expect(new Set(ROOM_DEMAND_FIELDS.map((f) => f.key)).size).toBe(ROOM_DEMAND_FIELDS.length);
  });

  it('reads a stored list and drops bad entries and repeated ids', () => {
    const raw = [{ id: 'a', name: 'A', keywords: ['x', 3], areaPerPersonM2: -1 }, { id: 'a', name: 'Again', keywords: [] }, { name: 'no id', keywords: [] }, null, { id: 'b', name: 'B', nameNl: 'Bé', keywords: [], areaPerPersonM2: 8 }];
    expect(parseRoomTypes(raw)).toEqual([{ id: 'a', name: 'A', keywords: ['x'] }, { id: 'b', name: 'B', nameNl: 'Bé', keywords: [], areaPerPersonM2: 8 }]);
    expect(parseRoomTypes({})).toBeNull();
  });

  it('has unique ids and lower-case keywords in the built-in list', () => {
    expect(new Set(ROOM_TYPE_LIBRARY.map((t) => t.id)).size).toBe(ROOM_TYPE_LIBRARY.length);
    for (const type of ROOM_TYPE_LIBRARY) for (const keyword of type.keywords) expect(keyword).toBe(keyword.toLowerCase());
  });
});
