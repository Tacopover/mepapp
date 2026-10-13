import { describe, expect, it } from 'vitest';
import { BUILT_IN_NEEDS } from './room-need.js';
import {
  applyRoomTypeMatch,
  demandTotal,
  matchRoomType,
  oldDemandValue,
  parseRoomDemands,
  parseRoomTypeKeywords,
  parseRoomTypes,
  ROOM_DEMAND_FIELDS,
  ROOM_TYPE_DEMAND_EXAMPLES,
  ROOM_TYPE_LIBRARY,
  roomTextWords,
  validateRoomTypeFields,
  withOldDemandValue,
  type RoomDemand,
  type RoomType,
} from './room-type.js';
import type { RoomValues } from './room-values.js';

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

  it('validates the demands against their need', () => {
    const ok = { light: { terms: [{ basis: 'illuminance' as const, value: 500 }], workingPlaneM: 0 }, sockets: { terms: [{ basis: 'length' as const, every: 15 }], minimum: 1 } };
    expect(validateRoomTypeFields({ name: 'Lab', demands: ok }, [])).toBeNull();
    expect(validateRoomTypeFields({ name: 'Lab', demands: { light: { terms: [{ basis: 'illuminance', value: -1 }] } } }, [])).toBe('Light: each number must be 0 or more.');
    expect(validateRoomTypeFields({ name: 'Lab', demands: { returnAir: { terms: [{ basis: 'volume', value: Number.NaN }] } } }, [])).toMatch(/^Return air: each number/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { heating: { terms: [] } } }, [])).toMatch(/^Heating: enter a number/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { heating: { terms: [{ basis: 'length', value: 3 }] } } }, [])).toMatch(/does not work/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { supplyAir: { terms: [{ basis: 'area', every: 5 }] } } }, [])).toMatch(/does not work/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { sockets: { terms: [{ basis: 'area', every: 0 }] } } }, [])).toMatch(/N above 0/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { sockets: { terms: [{ basis: 'room', value: 2 }], minimum: -1 } } }, [])).toMatch(/minimum/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { light: { terms: [{ basis: 'illuminance', value: 300 }], minimum: 10 } } }, [])).toMatch(/no minimum/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { sockets: { terms: [{ basis: 'room', value: 2 }], workingPlaneM: 1 } } }, [])).toMatch(/working plane/);
    expect(validateRoomTypeFields({ name: 'Lab', demands: { 'need-x': { terms: [{ basis: 'room', value: 2 }] } } }, [])).toMatch(/does not exist/);
    const own = [...BUILT_IN_NEEDS, { id: 'need-x', name: 'Data', kind: 'count' as const, unit: 'outlets', own: true }];
    expect(validateRoomTypeFields({ name: 'Lab', demands: { 'need-x': { terms: [{ basis: 'person', every: 2 }] } } }, [], own)).toBeNull();
  });

  it('reads the old number fields of a stored type as demands (room-type-calculations.md §3.5)', () => {
    const raw = [
      { id: 'a', name: 'A', keywords: [], demands: { illuminanceLx: 500, supplyPerM2Dm3s: 0, unknown: 3, exhaustFixedDm3s: -2, socketsFixed: '4' } },
      { id: 'b', name: 'B', keywords: [], demands: { unknown: 3, workingPlaneHeightM: 0.8 } },
    ];
    expect(parseRoomTypes(raw)).toEqual([
      { id: 'a', name: 'A', keywords: [], demands: { light: { terms: [{ basis: 'illuminance', value: 500 }] }, supplyAir: { terms: [{ basis: 'area', value: 0 }] } } },
      { id: 'b', name: 'B', keywords: [] },
    ]);
  });

  it('maps each old field to its need and term, and drops a term of 0 next to another term', () => {
    expect(
      parseRoomDemands({
        illuminanceLx: 300, workingPlaneHeightM: 0, supplyPerPersonDm3s: 6.5, supplyPerM2Dm3s: 0, exhaustFixedDm3s: 7, airChangesPerH: 2,
        heatingLoadWm2: 40, coolingLoadWm2: 70, socketsPerPerson: 0, socketsFixed: 0,
      }),
    ).toEqual({
      light: { terms: [{ basis: 'illuminance', value: 300 }], workingPlaneM: 0 },
      supplyAir: { terms: [{ basis: 'person', value: 6.5 }] },
      returnAir: { terms: [{ basis: 'room', value: 7 }, { basis: 'volume', value: 2 }] },
      heating: { terms: [{ basis: 'area', value: 40 }] },
      cooling: { terms: [{ basis: 'area', value: 70 }] },
      sockets: { terms: [{ basis: 'person', value: 0 }] },
    });
    expect(parseRoomDemands({ unknown: 3 })).toBeNull();
    expect(parseRoomDemands([1])).toBeNull();
    expect(parseRoomDemands(null)).toBeNull();
  });

  it('reads the new shape and leaves out terms that do not fit', () => {
    const raw = {
      light: { terms: [{ basis: 'illuminance', value: 500 }, { basis: 'illuminance', value: 300 }], workingPlaneM: 0.8, minimum: 4 },
      supplyAir: { terms: [{ basis: 'person', value: 7 }, { basis: 'length', value: 1 }, { basis: 'area', every: 4 }, { basis: 'nothing', value: 1 }], minimum: 7, workingPlaneM: 1 },
      sockets: { terms: [{ basis: 'length', every: 15 }, { basis: 'room', every: 2 }, { basis: 'room', value: 1, every: 2 }] },
      heating: { terms: [{ basis: 'area', value: -1 }] },
      'need-data': { terms: [{ basis: 'person', every: 2 }, { basis: 'illuminance', value: 3 }], minimum: 1 },
    };
    const withProto = JSON.stringify(raw).replace(/^{/, '{"__proto__":{"terms":[{"basis":"room","value":1}]},');
    expect(parseRoomDemands(JSON.parse(withProto))).toEqual({
      light: { terms: [{ basis: 'illuminance', value: 500 }], workingPlaneM: 0.8 },
      supplyAir: { terms: [{ basis: 'person', value: 7 }], minimum: 7 },
      sockets: { terms: [{ basis: 'length', every: 15 }] },
      'need-data': { terms: [{ basis: 'person', every: 2 }], minimum: 1 },
    });
  });

  it('has example demands only for built-in types, with valid values, the same as the old examples plus sockets in the corridor', () => {
    const ids = new Set(ROOM_TYPE_LIBRARY.map((t) => t.id));
    for (const [id, example] of Object.entries(ROOM_TYPE_DEMAND_EXAMPLES)) {
      expect(ids.has(id)).toBe(true);
      expect(validateRoomTypeFields({ name: 'X', ...example }, [])).toBeNull();
    }
    expect(ROOM_TYPE_DEMAND_EXAMPLES.office!.demands).toEqual(
      parseRoomDemands({ illuminanceLx: 500, workingPlaneHeightM: 0.75, supplyPerPersonDm3s: 6.5, supplyPerM2Dm3s: 0, heatingLoadWm2: 40, coolingLoadWm2: 70, socketsPerPerson: 4 }),
    );
    expect(ROOM_TYPE_DEMAND_EXAMPLES.technical!.demands).toEqual(parseRoomDemands({ illuminanceLx: 200, workingPlaneHeightM: 0, airChangesPerH: 2, heatingLoadWm2: 0, socketsFixed: 4 }));
    expect(ROOM_TYPE_DEMAND_EXAMPLES.corridor!.demands.sockets).toEqual({ terms: [{ basis: 'length', every: 15 }] });
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

describe('demandTotal', () => {
  // The sample rooms of the mockup: 1.20 Office 31.4 m² (3 persons, 5.8 m long), 1.01A Corridor 23.7 m² (13.2 m long), both 2.7 m high.
  const office: Pick<RoomValues, 'areaM2' | 'lengthM' | 'volumeM3' | 'people'> = { areaM2: 31.4, lengthM: 5.8, volumeM3: 31.4 * 2.7, people: { count: 3, source: 'roomType' } };
  const corridor = { ...office, areaM2: 23.7, lengthM: 13.2, volumeM3: 23.7 * 2.7, people: null };
  const need = (id: string) => BUILT_IN_NEEDS.find((n) => n.id === id)!;
  const d = (...terms: RoomDemand['terms']): RoomDemand => ({ terms });

  it('adds the terms: per person, per m², per room', () => {
    const r = demandTotal(need('supplyAir'), d({ basis: 'person', value: 6.5 }, { basis: 'area', value: 0.7 }, { basis: 'room', value: 5 }), office);
    expect(r.total).toBeCloseTo(19.5 + 21.98 + 5);
    expect(r.parts.map((p) => p.base)).toEqual([3, 31.4, undefined]);
    expect(r.problems).toEqual([]);
  });

  it('"1 per 15 m room length" in the corridor gives 0.88 sockets, and per m length multiplies', () => {
    expect(demandTotal(need('sockets'), d({ basis: 'length', every: 15 }), corridor).total).toBeCloseTo(13.2 / 15);
    expect(demandTotal(need('sockets'), d({ basis: 'length', value: 0.5 }), corridor).total).toBeCloseTo(6.6);
    expect(demandTotal(need('sockets'), d({ basis: 'person', every: 2 }), office).total).toBeCloseTo(1.5);
  });

  it('air changes: n × volume in m³/h, converted to dm³/s', () => {
    expect(demandTotal(need('returnAir'), d({ basis: 'volume', value: 2 }), office).total).toBeCloseTo((2 * 31.4 * 2.7) / 3.6);
  });

  it('the minimum raises a smaller total, and says so', () => {
    const r = demandTotal(need('supplyAir'), { terms: [{ basis: 'area', value: 0.1 }], minimum: 7 }, office);
    expect(r.total).toBe(7);
    expect(r.minimumApplied).toBe(true);
    expect(demandTotal(need('supplyAir'), { terms: [{ basis: 'area', value: 1 }], minimum: 7 }, office)).toMatchObject({ total: 31.4, minimumApplied: false });
  });

  it('Light: Em × floor area in lm', () => {
    expect(demandTotal(need('light'), { terms: [{ basis: 'illuminance', value: 500 }], workingPlaneM: 0.75 }, office).total).toBeCloseTo(15700);
  });

  it('gives no total when a room value is missing or a term does not fit', () => {
    expect(demandTotal(need('sockets'), d({ basis: 'person', value: 4 }), corridor)).toMatchObject({ total: null, problems: ['noPeople'] });
    expect(demandTotal(need('heating'), d({ basis: 'area', value: 40 }, { basis: 'room', value: 100 }), { ...office, areaM2: null })).toMatchObject({ total: null, problems: ['noCalibration'] });
    expect(demandTotal(need('heating'), d({ basis: 'volume', value: 2 }), office)).toMatchObject({ total: null, problems: ['notFit'] });
    expect(demandTotal(need('heating'), d({ basis: 'room', value: 500 }), { ...office, areaM2: null }).total).toBe(500);
  });
});

describe('the old demand fields on the new demands (phase 1 adapter)', () => {
  const office = parseRoomDemands({ illuminanceLx: 500, workingPlaneHeightM: 0.75, supplyPerPersonDm3s: 6.5, supplyPerM2Dm3s: 0, socketsPerPerson: 4 })!;

  it('reads a field; a demand without the term gives 0 only on request', () => {
    expect(oldDemandValue(office, 'supplyPerPersonDm3s')).toBe(6.5);
    expect(oldDemandValue(office, 'supplyPerM2Dm3s')).toBeUndefined();
    expect(oldDemandValue(office, 'supplyPerM2Dm3s', true)).toBe(0);
    expect(oldDemandValue(office, 'socketsFixed', true)).toBe(0);
    expect(oldDemandValue(office, 'exhaustFixedDm3s', true)).toBeUndefined();
    expect(oldDemandValue(office, 'workingPlaneHeightM')).toBe(0.75);
    expect(oldDemandValue({ sockets: { terms: [{ basis: 'person', every: 4 }] } }, 'socketsPerPerson')).toBe(0.25);
    expect(oldDemandValue(undefined, 'illuminanceLx')).toBeUndefined();
  });

  it('writes a field and keeps the rest of the demand', () => {
    const withArea = withOldDemandValue({ ...office, supplyAir: { terms: [{ basis: 'person', value: 6.5 }], minimum: 10 } }, 'supplyPerM2Dm3s', 0.7);
    expect(withArea.supplyAir).toEqual({ terms: [{ basis: 'person', value: 6.5 }, { basis: 'area', value: 0.7 }], minimum: 10 });
    expect(withOldDemandValue(office, 'supplyPerM2Dm3s', 0).supplyAir).toEqual({ terms: [{ basis: 'person', value: 6.5 }] });
    expect(withOldDemandValue(office, 'socketsPerPerson', null).sockets).toBeUndefined();
    expect(withOldDemandValue(office, 'workingPlaneHeightM', null).light).toEqual({ terms: [{ basis: 'illuminance', value: 500 }] });
    expect(withOldDemandValue({}, 'workingPlaneHeightM', 0.8)).toEqual({});
    expect(withOldDemandValue(undefined, 'exhaustFixedDm3s', 7)).toEqual({ returnAir: { terms: [{ basis: 'room', value: 7 }] } });
    expect(office.supplyAir).toEqual({ terms: [{ basis: 'person', value: 6.5 }] });
  });
});
