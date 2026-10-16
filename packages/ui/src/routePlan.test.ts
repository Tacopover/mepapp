import { describe, expect, it } from 'vitest';
import type { RouteLanguage, RoutePortsResult, RouteStamp } from '@mepapp/core';
import {
  looksLikeLoad, presetStart, roomLabel, routeSummaryLines, routeText, startCandidates, startPortChoices, typeChoices, typeNameInText,
  type RouteTextKey,
} from './components/routePlan.js';

const stamp = (patch: Partial<RouteStamp> & { id: string }): RouteStamp => ({
  category: 'equipment',
  transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
  nativeWidth: 10,
  nativeHeight: 10,
  ports: [],
  ...patch,
});
const port = (id: string, name = id) => ({ id, name, fractionX: 0.5, fractionY: 0.5 });

describe('startCandidates', () => {
  it('keeps equipment and drops terminal and fitting', () => {
    const result = startCandidates([
      stamp({ id: 'diffuser', category: 'terminal' }),
      stamp({ id: 'valve', category: 'fitting' }),
      stamp({ id: 'fan', category: 'equipment' }),
    ]);
    expect(result.map((c) => c.stamp.id)).toEqual(['fan']);
  });

  it('puts a source (boiler, no targets) before a load (fan coil unit, heating-water target)', () => {
    const fcu = stamp({ id: 'fcu', ports: [port('hw')], routingTargets: { hw: 'heating-water' } });
    const boiler = stamp({ id: 'boiler', ports: [port('out')] });
    const result = startCandidates([fcu, boiler]);
    expect(result).toEqual([
      { stamp: boiler, likelySource: true },
      { stamp: fcu, likelySource: false },
    ]);
  });

  it('keeps the input order inside each group', () => {
    const a = stamp({ id: 'a' });
    const b = stamp({ id: 'b' });
    const c = stamp({ id: 'c', ports: [port('p')], routingTargets: { p: 'supply-air' } });
    const d = stamp({ id: 'd', ports: [port('p')], routingTargets: { p: 'supply-air' } });
    expect(startCandidates([c, b, d, a]).map((x) => x.stamp.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('checks the center port of a stamp with no own port', () => {
    const fan = stamp({ id: 'fan', ports: [], routingTargets: { __center__: 'supply-air' } });
    expect(startCandidates([fan])).toEqual([{ stamp: fan, likelySource: false }]);
  });
});

describe('looksLikeLoad', () => {
  const fcu = stamp({ id: 'fcu', ports: [port('hw'), port('cw')], routingTargets: { hw: 'heating-water', cw: 'chilled-water' } });

  it('is true for a port with the chosen type', () => {
    expect(looksLikeLoad(fcu, 'heating-water')).toBe(true);
  });

  it('is true when that port has a segment', () => {
    const connected = { ...fcu, portSegmentTypes: { hw: 'heating-water' } };
    expect(looksLikeLoad(connected, 'heating-water')).toBe(true);
  });

  it('is false for another type', () => {
    expect(looksLikeLoad(fcu, 'supply-air')).toBe(false);
  });

  it('is false for no target', () => {
    expect(looksLikeLoad(stamp({ id: 'boiler', ports: [port('out')] }), 'heating-water')).toBe(false);
  });

  it('checks the center port of a stamp with no own port', () => {
    expect(looksLikeLoad(stamp({ id: 'fan', ports: [], routingTargets: { __center__: 'supply-air' } }), 'supply-air')).toBe(true);
  });
});

describe('presetStart', () => {
  it('returns the id of the only equipment stamp', () => {
    expect(presetStart([stamp({ id: 'fan' })])).toBe('fan');
  });

  it('returns null for two equipment stamps', () => {
    expect(presetStart([stamp({ id: 'fan' }), stamp({ id: 'boiler' })])).toBeNull();
  });

  it('returns null for no stamp', () => {
    expect(presetStart([])).toBeNull();
  });

  it('returns null for a terminal only', () => {
    expect(presetStart([stamp({ id: 'diffuser', category: 'terminal' })])).toBeNull();
  });

  it('returns the equipment id beside a terminal', () => {
    expect(presetStart([stamp({ id: 'diffuser', category: 'terminal' }), stamp({ id: 'fan' })])).toBe('fan');
  });
});

describe('typeChoices', () => {
  const stamps: RouteStamp[] = [
    stamp({
      id: 's1',
      ports: [port('a'), port('b'), port('c')],
      routingTargets: { a: 'supply-air', b: 'supply-air', c: 'return-air' },
      portSegmentTypes: { c: 'return-air' },
    }),
    stamp({
      id: 's2',
      ports: [port('d'), port('e')],
      routingTargets: { d: 'chilled-water', e: 'sanitary-waste' },
    }),
    stamp({ id: 's3', ports: [port('f')], routingTargets: { f: 'chilled-water' } }),
    stamp({ id: 's4', ports: [port('g')], routingTargets: { g: 'heating-water' } }),
  ];

  it('counts open ports, largest first, a tie sorted by id', () => {
    expect(typeChoices(stamps)).toEqual([
      { networkTypeId: 'chilled-water', count: 2 },
      { networkTypeId: 'supply-air', count: 2 },
      { networkTypeId: 'heating-water', count: 1 },
    ]);
  });

  it('does not count a port with a segment', () => {
    expect(typeChoices(stamps).some((choice) => choice.networkTypeId === 'return-air')).toBe(false);
  });

  it('leaves out sanitary-waste', () => {
    expect(typeChoices(stamps).some((choice) => choice.networkTypeId === 'sanitary-waste')).toBe(false);
  });
});

describe('startPortChoices', () => {
  it('lists the matching ports first, then the others, with their routing target', () => {
    const fcu = stamp({
      id: 'fcu',
      ports: [port('cw', 'Chilled water'), port('hw', 'Heating water'), port('drain', 'Drain')],
      routingTargets: { cw: 'chilled-water', hw: 'heating-water' },
    });
    expect(startPortChoices(fcu, 'heating-water')).toEqual([
      { portId: 'hw', name: 'Heating water', routingTarget: 'heating-water', matches: true },
      { portId: 'cw', name: 'Chilled water', routingTarget: 'chilled-water', matches: false },
      { portId: 'drain', name: 'Drain', routingTarget: null, matches: false },
    ]);
  });

  it('gives one Center entry for a stamp with no own port', () => {
    expect(startPortChoices(stamp({ id: 'fan' }), 'supply-air')).toEqual([
      { portId: '__center__', name: 'Center', routingTarget: null, matches: false },
    ]);
  });
});

describe('roomLabel', () => {
  it('uses the name', () => {
    expect(roomLabel({ id: 'r1', name: 'Office', number: '101' }, 2, 'en')).toBe('Office');
  });

  it('uses the number when the name is missing', () => {
    expect(roomLabel({ id: 'r1', name: null, number: '101' }, 2, 'en')).toBe('101');
  });

  it('falls back to Room 3 in English and Ruimte 3 in Dutch', () => {
    expect(roomLabel({ id: 'r1', name: null, number: null }, 2, 'en')).toBe('Room 3');
    expect(roomLabel({ id: 'r1', name: null, number: null }, 2, 'nl')).toBe('Ruimte 3');
  });

  it('falls to the number when the name is empty or whitespace', () => {
    expect(roomLabel({ id: 'r1', name: '', number: '101' }, 0, 'en')).toBe('101');
    expect(roomLabel({ id: 'r1', name: '   ', number: ' 102 ' }, 0, 'en')).toBe('102');
  });
});

describe('typeNameInText', () => {
  it('keeps the library name in English', () => {
    expect(typeNameInText('supply-air', 'Supply Air', 'en')).toBe('Supply Air');
  });

  it('gives the Dutch air words', () => {
    expect(typeNameInText('supply-air', 'Supply Air', 'nl')).toBe('toevoerlucht');
    expect(typeNameInText('return-air', 'Return Air', 'nl')).toBe('retourlucht');
    expect(typeNameInText('exhaust-air', 'Exhaust Air', 'nl')).toBe('afzuiglucht');
  });

  it('keeps the library name for heating-water in Dutch', () => {
    expect(typeNameInText('heating-water', 'Heating Water', 'nl')).toBe('Heating Water');
  });
});

const routeResult = (patch: Partial<RoutePortsResult> = {}): RoutePortsResult => ({
  ports: [],
  perRoom: [],
  outsideRooms: 0,
  leftOut: 0,
  startStampPorts: 0,
  equipmentPorts: 0,
  multiPortStamps: 0,
  droppedExtraPorts: 0,
  ...patch,
});
const routePorts = (count: number, stampCount = count) =>
  Array.from({ length: count }, (_, index) => ({
    stampId: `s${index % stampCount}`,
    portId: `p${index}`,
    networkTypeId: 'supply-air',
    world: { x: 0, y: 0 },
    roomId: null,
  }));

const ROUTE_TEXT_KEYS: RouteTextKey[] = [
  'title', 'close', 'noEquipment', 'startStamp', 'groupSources', 'groupWaiting', 'startWarning',
  'startPort', 'portNote', 'networkType', 'noOpenPorts', 'scope', 'scopeRooms', 'scopeStamps',
  'roomsAll', 'roomsNone', 'noRooms', 'includeOutside', 'useAllPorts',
];
const LANGUAGES: RouteLanguage[] = ['en', 'nl'];

const allSummaryLines = (): string[] => {
  const full = routeResult({ ports: routePorts(15), outsideRooms: 2, leftOut: 4, equipmentPorts: 3, startStampPorts: 2, multiPortStamps: 2 });
  return [
    ...routeSummaryLines(full, 'rooms', 'Supply Air', 9, 'en', { portsPerStamp: 'all', includeOutsideRooms: false }),
    ...routeSummaryLines(full, 'rooms', 'toevoerlucht', 9, 'nl'),
    ...routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 1, multiPortStamps: 1 }), 'rooms', 'Supply Air', 1, 'en'),
    ...routeSummaryLines(routeResult({ ports: routePorts(3) }), 'stamps', 'Supply Air', 0, 'en'),
    ...routeSummaryLines(routeResult({ ports: routePorts(1) }), 'stamps', 'toevoerlucht', 0, 'nl'),
  ];
};

describe('routeSummaryLines', () => {
  it('writes the room line in English with singular and plural', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'rooms', 'Supply Air', 1, 'en')).toEqual(['1 open port of Supply Air in 1 room.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(15) }), 'rooms', 'Supply Air', 9, 'en')).toEqual(['15 open ports of Supply Air in 9 rooms.']);
    expect(routeSummaryLines(routeResult(), 'rooms', 'Supply Air', 0, 'en')).toEqual(['0 open ports of Supply Air in 0 rooms.']);
  });

  it('writes the room line in Dutch with singular and plural', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'rooms', 'toevoerlucht', 1, 'nl')).toEqual(['1 open aansluiting voor toevoerlucht in 1 ruimte.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(15) }), 'rooms', 'toevoerlucht', 9, 'nl')).toEqual(['15 open aansluitingen voor toevoerlucht in 9 ruimtes.']);
  });

  it('writes the stamps line in English', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(3) }), 'stamps', 'Supply Air', 0, 'en')).toEqual(['3 open ports of Supply Air on 3 selected stamps.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'stamps', 'Supply Air', 0, 'en')).toEqual(['1 open port of Supply Air on 1 selected stamp.']);
  });

  it('counts one stamp when all ports belong to the same stamp', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(3, 1) }), 'stamps', 'Supply Air', 0, 'en')).toEqual(['3 open ports of Supply Air on 1 selected stamp.']);
  });

  it('writes the stamps line in Dutch', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(3) }), 'stamps', 'toevoerlucht', 0, 'nl')).toEqual(['3 open aansluitingen voor toevoerlucht op 3 geselecteerde stempels.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'stamps', 'toevoerlucht', 0, 'nl')).toEqual(['1 open aansluiting voor toevoerlucht op 1 geselecteerd stempel.']);
  });

  it('writes no room word in the stamps scope', () => {
    for (const line of routeSummaryLines(routeResult({ ports: routePorts(3) }), 'stamps', 'Supply Air', 0, 'en')) expect(line).not.toMatch(/room/i);
    for (const line of routeSummaryLines(routeResult({ ports: routePorts(1) }), 'stamps', 'toevoerlucht', 0, 'nl')) expect(line).not.toMatch(/ruimte/i);
  });

  it('writes the outside-rooms line in English', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 1 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('1 port is outside every room. It is included.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 2 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('2 ports are outside every room. They are included.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 1 }), 'rooms', 'Supply Air', 1, 'en', { includeOutsideRooms: false })[1]).toBe('1 port is outside every room. It is not included.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 2 }), 'rooms', 'Supply Air', 1, 'en', { includeOutsideRooms: false })[1]).toBe('2 ports are outside every room. They are not included.');
  });

  it('writes the outside-rooms line in Dutch', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('1 aansluiting ligt buiten alle ruimtes. Deze wordt meegenomen.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 2 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('2 aansluitingen liggen buiten alle ruimtes. Deze worden meegenomen.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 1 }), 'rooms', 'toevoerlucht', 1, 'nl', { includeOutsideRooms: false })[1]).toBe('1 aansluiting ligt buiten alle ruimtes. Deze wordt niet meegenomen.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 2 }), 'rooms', 'toevoerlucht', 1, 'nl', { includeOutsideRooms: false })[1]).toBe('2 aansluitingen liggen buiten alle ruimtes. Deze worden niet meegenomen.');
  });

  it('drops the outside-rooms line in the stamps scope', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), outsideRooms: 2 }), 'stamps', 'Supply Air', 0, 'en')).toHaveLength(1);
  });

  it('writes the left-out line in English and Dutch', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), leftOut: 1 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('1 port is left out by the scope.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), leftOut: 4 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('4 ports are left out by the scope.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), leftOut: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('1 aansluiting valt buiten het bereik.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), leftOut: 4 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('4 aansluitingen vallen buiten het bereik.');
  });

  it('writes the equipment line in English and Dutch', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), equipmentPorts: 1 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('1 port of equipment is not a target.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), equipmentPorts: 3 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('3 ports of equipment are not targets.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), equipmentPorts: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('1 aansluiting van een apparaat is geen doel.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), equipmentPorts: 3 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('3 aansluitingen van apparaten zijn geen doelen.');
  });

  it('writes the start stamp line in English and Dutch', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), startStampPorts: 1 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('1 port of the start stamp is not a target.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), startStampPorts: 2 }), 'rooms', 'Supply Air', 1, 'en')[1]).toBe('2 ports of the start stamp are not targets.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), startStampPorts: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('1 aansluiting van het startstempel is geen doel.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), startStampPorts: 2 }), 'rooms', 'toevoerlucht', 1, 'nl')[1]).toBe('2 aansluitingen van het startstempel zijn geen doelen.');
  });

  it('writes the multi-port line in mode one', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'Supply Air', 1, 'en')[1])
      .toBe('1 stamp has more than 1 port of the same type. The finder uses 1 port of each.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 2 }), 'rooms', 'Supply Air', 1, 'en')[1])
      .toBe('2 stamps have more than 1 port of the same type. The finder uses 1 port of each.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1])
      .toBe('1 stempel heeft meer dan 1 aansluiting van hetzelfde type. De zoeker gebruikt 1 aansluiting van elk.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 2 }), 'rooms', 'toevoerlucht', 1, 'nl')[1])
      .toBe('2 stempels hebben meer dan 1 aansluiting van hetzelfde type. De zoeker gebruikt 1 aansluiting van elk.');
  });

  it('writes the multi-port line in mode all', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'Supply Air', 1, 'en', { portsPerStamp: 'all' })[1])
      .toBe('1 stamp has more than 1 port of the same type. The finder uses all ports.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'toevoerlucht', 1, 'nl', { portsPerStamp: 'all' })[1])
      .toBe('1 stempel heeft meer dan 1 aansluiting van hetzelfde type. De zoeker gebruikt alle aansluitingen.');
  });

  it('keeps only the first line when no count is above 0', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'rooms', 'Supply Air', 1, 'en')).toHaveLength(1);
    expect(routeSummaryLines(routeResult(), 'rooms', 'Supply Air', 0, 'en')).toHaveLength(1);
  });

  it('never writes a flow figure or a unit', () => {
    for (const line of allSummaryLines()) expect(line).not.toMatch(/CFM|GPM|dm³/);
  });

  it('keeps every summary line within 140 characters', () => {
    for (const line of allSummaryLines()) expect(line.length).toBeLessThanOrEqual(140);
  });
});

describe('routeText', () => {
  it('has a text in English and Dutch for all 19 keys', () => {
    expect(ROUTE_TEXT_KEYS).toHaveLength(19);
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) expect(routeText(language, key).length).toBeGreaterThan(0);
    }
  });

  it('replaces the params', () => {
    expect(routeText('en', 'startWarning', { type: 'Supply Air' })).toBe('This stamp has ports that wait for Supply Air. It can be a load, not a source. You can still use it.');
    expect(routeText('nl', 'portNote', { target: 'Exhaust Air', type: 'Supply Air' })).toBe('Deze aansluiting wacht op Exhaust Air, niet op Supply Air.');
  });

  it('keeps a param that has no value', () => {
    expect(routeText('en', 'startWarning')).toContain('{type}');
  });

  it('gives the Dutch equipment and open port words', () => {
    expect(routeText('nl', 'noEquipment')).toContain('luchtbehandelingskast');
    expect(routeText('nl', 'noOpenPorts')).toContain('open aansluiting');
  });

  it('gives the English open port words', () => {
    expect(routeText('en', 'noOpenPorts')).toContain('No open port');
  });

  it('keeps every text within 140 characters', () => {
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) {
        expect(routeText(language, key, { type: 'Supply Air', target: 'Exhaust Air' }).length).toBeLessThanOrEqual(140);
      }
    }
  });
});
