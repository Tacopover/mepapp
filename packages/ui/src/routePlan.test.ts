import { describe, expect, it } from 'vitest';
import type { RouteArea, RouteAreaWarning, RouteLanguage, RoomType, RoutePortsResult, RouteStamp, StartProblem } from '@mepapp/core';
import {
  includeOutsideText, looksLikeLoad, presetStart, roomLabel, routeAreaLines, routeAreaSummaryLine, routeAreaTypeChoices, routeSummaryLines, routeText, startCandidates, startCheckLines, startPortChoices, typeChoices, typeNameInText, typeOptionText,
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
  'scopeStampsHint', 'roomsColRoom', 'roomsColType', 'roomsColPorts', 'noChoice', 'scopeStampsNote', 'roomsColPortsTitle',
  'checkUnknownStart', 'checkNotEquipment', 'checkPortSegments', 'checkPortSegmentsHint', 'checkPortForeignType', 'checkPortForeignTypeHint',
  'checkGroupOtherType', 'checkGroupSameType', 'checkSecondEquipment', 'checkSecondEquipmentHint', 'selectionNotEquipment', 'selectionRiserNote',
  'severityError', 'severityWarning', 'severityInfo',
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
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'rooms', 'Supply Air', 1, 'en')).toEqual(['1 open port of Supply Air in 1 checked room.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(15) }), 'rooms', 'Supply Air', 9, 'en')).toEqual(['15 open ports of Supply Air in 9 checked rooms.']);
    expect(routeSummaryLines(routeResult(), 'rooms', 'Supply Air', 0, 'en')).toEqual(['0 open ports of Supply Air in 0 checked rooms.']);
  });

  it('writes the room line in Dutch with singular and plural', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1) }), 'rooms', 'toevoerlucht', 1, 'nl')).toEqual(['1 open aansluiting voor toevoerlucht in 1 aangevinkte ruimte.']);
    expect(routeSummaryLines(routeResult({ ports: routePorts(15) }), 'rooms', 'toevoerlucht', 9, 'nl')).toEqual(['15 open aansluitingen voor toevoerlucht in 9 aangevinkte ruimtes.']);
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
      .toBe('1 stamp has more than 1 port of the same type. Only 1 port of each is used.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 2 }), 'rooms', 'Supply Air', 1, 'en')[1])
      .toBe('2 stamps have more than 1 port of the same type. Only 1 port of each is used.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'toevoerlucht', 1, 'nl')[1])
      .toBe('1 stempel heeft meer dan 1 aansluiting van hetzelfde type. Van elk wordt 1 aansluiting gebruikt.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 2 }), 'rooms', 'toevoerlucht', 1, 'nl')[1])
      .toBe('2 stempels hebben meer dan 1 aansluiting van hetzelfde type. Van elk wordt 1 aansluiting gebruikt.');
  });

  it('writes the multi-port line in mode all', () => {
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'Supply Air', 1, 'en', { portsPerStamp: 'all' })[1])
      .toBe('1 stamp has more than 1 port of the same type. All ports are used.');
    expect(routeSummaryLines(routeResult({ ports: routePorts(1), multiPortStamps: 1 }), 'rooms', 'toevoerlucht', 1, 'nl', { portsPerStamp: 'all' })[1])
      .toBe('1 stempel heeft meer dan 1 aansluiting van hetzelfde type. Alle aansluitingen worden gebruikt.');
  });

  it('never writes finder or zoeker in a summary line', () => {
    for (const line of allSummaryLines()) expect(line).not.toMatch(/finder|zoeker/i);
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) expect(routeText(language, key)).not.toMatch(/finder|zoeker/i);
      for (const count of [0, 1, 2]) expect(includeOutsideText(language, count)).not.toMatch(/finder|zoeker/i);
    }
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

describe('includeOutsideText', () => {
  it('gives the English count with singular and plural', () => {
    expect(includeOutsideText('en', 0)).toBe('Include ports outside rooms: 0 ports');
    expect(includeOutsideText('en', 1)).toBe('Include ports outside rooms: 1 port');
    expect(includeOutsideText('en', 2)).toBe('Include ports outside rooms: 2 ports');
  });

  it('gives the Dutch count with singular and plural', () => {
    expect(includeOutsideText('nl', 0)).toBe('Aansluitingen buiten ruimtes meenemen: 0 aansluitingen');
    expect(includeOutsideText('nl', 1)).toBe('Aansluitingen buiten ruimtes meenemen: 1 aansluiting');
    expect(includeOutsideText('nl', 2)).toBe('Aansluitingen buiten ruimtes meenemen: 2 aansluitingen');
  });
});

describe('typeOptionText', () => {
  it('gives the English port count with singular and plural', () => {
    expect(typeOptionText('en', 'Supply Air', 27)).toBe('Supply Air (27 open ports)');
    expect(typeOptionText('en', 'Supply Air', 1)).toBe('Supply Air (1 open port)');
  });

  it('gives the Dutch aansluiting count with singular and plural', () => {
    expect(typeOptionText('nl', 'toevoerlucht', 27)).toBe('toevoerlucht (27 open)');
    expect(typeOptionText('nl', 'toevoerlucht', 1)).toBe('toevoerlucht (1 open)');
  });
});

describe('routeText', () => {
  it('gives the Dutch open ports column and its title', () => {
    expect(routeText('nl', 'roomsColPorts')).toBe('Open');
    expect(routeText('nl', 'roomsColPortsTitle')).toBe('Open aansluitingen');
  });

  it('gives the start stamp note in English and Dutch', () => {
    expect(routeText('en', 'scopeStampsNote')).toContain('start stamp');
    expect(routeText('nl', 'scopeStampsNote')).toContain('startstempel');
  });

  it('has a text in English and Dutch for all 41 keys', () => {
    expect(ROUTE_TEXT_KEYS).toHaveLength(41);
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) expect(routeText(language, key).length).toBeGreaterThan(0);
    }
  });

  it('writes the severity labels in English and Dutch without the word network', () => {
    expect(routeText('en', 'severityError')).toBe('Error');
    expect(routeText('en', 'severityWarning')).toBe('Warning');
    expect(routeText('en', 'severityInfo')).toBe('Note');
    expect(routeText('nl', 'severityError')).toBe('Fout');
    expect(routeText('nl', 'severityWarning')).toBe('Waarschuwing');
    expect(routeText('nl', 'severityInfo')).toBe('Opmerking');
    for (const language of LANGUAGES) {
      for (const key of ['severityError', 'severityWarning', 'severityInfo'] as const) {
        expect(routeText(language, key)).not.toMatch(/netwerk|network/i);
      }
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
    const params = {
      type: 'Supply Air', target: 'Exhaust Air', count: '2 segments', types: 'Supply Air, Return Air',
      ports: 'in, out', stamps: 'Fan coil unit, Pump', stamp: 'Air handling unit AHU-01',
    };
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) {
        expect(routeText(language, key, params).length).toBeLessThanOrEqual(140);
      }
    }
  });

  it('never writes CFM or GPM in a text', () => {
    for (const language of LANGUAGES) {
      for (const key of ROUTE_TEXT_KEYS) expect(routeText(language, key)).not.toMatch(/CFM|GPM/);
    }
  });
});

describe('startCheckLines', () => {
  const typeNames: Record<string, string> = { 'supply-air': 'Supply Air', 'return-air': 'Return Air' };
  const stampNames: Record<string, string> = { fcu: 'Fan coil unit', pump: 'Pump' };
  const english = {
    type: (typeId: string) => typeNames[typeId] ?? typeId,
    stamp: (stampId: string) => stampNames[stampId] ?? stampId,
    port: (portId: string) => portId,
  };
  const dutch = { ...english, type: (typeId: string) => typeNameInText(typeId, typeNames[typeId] ?? typeId, 'nl') };
  const problem = (patch: Partial<StartProblem> & Pick<StartProblem, 'code'>): StartProblem => ({ severity: 'warning', ...patch });

  it('fills the count, types, ports and stamps', () => {
    const lines = startCheckLines([
      problem({ code: 'port-segments', count: 2 }),
      problem({ code: 'port-foreign-type', typeIds: ['return-air'] }),
      problem({ code: 'group-other-type', portIds: ['in', 'out'], typeIds: ['return-air'] }),
      problem({ code: 'second-equipment', stampIds: ['fcu', 'pump'] }),
    ], english, 'en');
    expect(lines.map((line) => line.text)).toEqual([
      'The start port has 2 segments.',
      'The start port already has a segment of Return Air.',
      'in, out is in one port group with this port. Its segment has type Return Air. It stays a separate network.',
      'The network at this port has more equipment: Fan coil unit, Pump.',
    ]);
  });

  it('joins several ids with ", "', () => {
    const [line] = startCheckLines([problem({ code: 'group-same-type', portIds: ['in', 'out', 'drain'] })], english, 'en');
    expect(line!.text).toBe('in, out, drain is in one port group with this port. Its segment has the same type, so the run joins that network.');
  });

  it('uses the Dutch air words through names.type', () => {
    const [line] = startCheckLines([problem({ code: 'port-foreign-type', typeIds: ['supply-air'] })], dutch, 'nl');
    expect(line!.text).toBe('De startaansluiting heeft al een segment van toevoerlucht.');
  });

  it('keeps the order of the problems', () => {
    const lines = startCheckLines([
      problem({ code: 'second-equipment', stampIds: ['pump'] }),
      problem({ code: 'unknown-start' }),
      problem({ code: 'port-segments', count: 1 }),
    ], english, 'en');
    expect(lines.map((line) => line.code)).toEqual(['second-equipment', 'unknown-start', 'port-segments']);
  });

  it('gives an empty hint where a code has none', () => {
    const lines = startCheckLines([
      problem({ code: 'unknown-start' }),
      problem({ code: 'not-equipment' }),
      problem({ code: 'group-other-type', portIds: ['in'], typeIds: ['return-air'] }),
      problem({ code: 'group-same-type', portIds: ['in'] }),
    ], english, 'en');
    for (const line of lines) expect(line.hint).toBe('');
  });

  it('gives a hint where a code has one', () => {
    const lines = startCheckLines([
      problem({ code: 'port-segments', count: 2 }),
      problem({ code: 'port-foreign-type', typeIds: ['return-air'] }),
      problem({ code: 'second-equipment', stampIds: ['pump'] }),
    ], english, 'en');
    expect(lines.map((line) => line.hint)).toEqual([
      routeText('en', 'checkPortSegmentsHint'),
      routeText('en', 'checkPortForeignTypeHint'),
      routeText('en', 'checkSecondEquipmentHint'),
    ]);
  });

  it('gives the English and Dutch plural for count 1 and 2', () => {
    expect(startCheckLines([problem({ code: 'port-segments', count: 1 })], english, 'en')[0]!.text).toBe('The start port has 1 segment.');
    expect(startCheckLines([problem({ code: 'port-segments', count: 2 })], english, 'en')[0]!.text).toBe('The start port has 2 segments.');
    expect(startCheckLines([problem({ code: 'port-segments', count: 1 })], dutch, 'nl')[0]!.text).toBe('De startaansluiting heeft 1 segment.');
    expect(startCheckLines([problem({ code: 'port-segments', count: 2 })], dutch, 'nl')[0]!.text).toBe('De startaansluiting heeft 2 segmenten.');
  });

  it('gives the not-equipment text with the word for this stamp', () => {
    expect(startCheckLines([problem({ code: 'not-equipment' })], english, 'en')[0]!.text).toBe('This stamp has a category other than equipment. Only equipment can start a network.');
    expect(startCheckLines([problem({ code: 'not-equipment' })], dutch, 'nl')[0]!.text).toBe('Dit stempel heeft een andere categorie dan apparaat. Alleen een apparaat kan een netwerk starten.');
  });

  it('copies the code and the severity', () => {
    const [line] = startCheckLines([problem({ code: 'port-segments', severity: 'error', count: 2 })], english, 'en');
    expect(line!.code).toBe('port-segments');
    expect(line!.severity).toBe('error');
  });

  it('gives 0 segments when the count is missing', () => {
    expect(startCheckLines([problem({ code: 'port-segments' })], english, 'en')[0]!.text).toBe('The start port has 0 segments.');
  });

  it('gives no leading space when a group text has no ports or types', () => {
    for (const language of LANGUAGES) {
      const names = language === 'nl' ? dutch : english;
      const lines = startCheckLines([
        problem({ code: 'group-other-type' }),
        problem({ code: 'group-same-type' }),
      ], names, language);
      for (const line of lines) expect(line.text.startsWith(' ')).toBe(false);
    }
  });

  it('keeps the Dutch group texts within 140 characters with Dutch air words', () => {
    const airNames = {
      type: (typeId: string) => typeNameInText(typeId, typeId, 'nl'),
      stamp: (stampId: string) => ({ fcu: 'Ventilatorconvector', pump: 'Pomp' })[stampId] ?? stampId,
      port: (portId: string) => portId,
    };
    const lines = startCheckLines([
      problem({ code: 'group-other-type', portIds: ['in', 'out'], typeIds: ['supply-air', 'exhaust-air'] }),
      problem({ code: 'group-same-type', portIds: ['in', 'out'] }),
      problem({ code: 'second-equipment', stampIds: ['fcu', 'pump'] }),
    ], airNames, 'nl');
    expect(lines[0]!.text).toBe('in, out staat met deze aansluiting in één groep. Het segment heeft type toevoerlucht, afzuiglucht. Het blijft een apart netwerk.');
    for (const line of lines) {
      expect(line.text.length).toBeLessThanOrEqual(140);
      expect(line.hint.length).toBeLessThanOrEqual(140);
    }
  });
});

const AREA_TEXT_KEYS: RouteTextKey[] = [
  'areaTitle', 'areaTypes', 'areaAdd', 'areaRemove', 'areaReset', 'areaShow', 'areaTypesHint', 'areaCalculating',
  'areaSummary', 'areaSummaryOne', 'areaSummaryEntryOne', 'areaLegend', 'areaLegendGuide',
  'warnNoCalibration', 'warnNoRooms', 'warnNoTypes', 'warnNoRouteRooms', 'warnOpenRoom', 'warnOpenRoomOne', 'warnParts',
  'warnWallCrossings', 'warnWallCrossingsOne', 'warnWallCrossingsHint', 'warnShaftCrossing', 'warnShaftCrossingHint',
  'warnUnreached', 'warnUnreachedOne', 'warnStairName', 'warnDraft2d',
];
const AREA_SAMPLE_PARAMS = { count: '12', room: 'Corridor 1', type: 'Office', rooms: '40', entries: '25' };

describe('route area texts', () => {
  it('has an English text for every area key, and the Dutch text is the same English text', () => {
    for (const key of AREA_TEXT_KEYS) {
      expect(routeText('en', key).length).toBeGreaterThan(0);
      expect(routeText('nl', key)).toBe(routeText('en', key));
    }
  });

  it('keeps every English area text within 140 characters', () => {
    for (const key of AREA_TEXT_KEYS) expect(routeText('en', key, AREA_SAMPLE_PARAMS).length).toBeLessThanOrEqual(140);
  });

  it('keeps the wall-crossing hint and the 2D draft text within 140 characters', () => {
    expect(routeText('en', 'warnWallCrossingsHint', AREA_SAMPLE_PARAMS).length).toBeLessThanOrEqual(140);
    expect(routeText('en', 'warnDraft2d', AREA_SAMPLE_PARAMS).length).toBeLessThanOrEqual(140);
  });

  it('writes no CFM, GPM, door or crossing word in an English area text', () => {
    for (const key of AREA_TEXT_KEYS) {
      const text = routeText('en', key, AREA_SAMPLE_PARAMS);
      expect(text).not.toMatch(/CFM|GPM/);
      expect(text).not.toMatch(/\bdoors?\b|crossing/i);
    }
  });

  it('names the fire walls in every text that mentions them', () => {
    for (const key of AREA_TEXT_KEYS) {
      const text = routeText('en', key, AREA_SAMPLE_PARAMS);
      if (text.includes('fire walls')) expect(text).toContain('which of these walls are fire walls');
    }
  });
});

describe('routeAreaLines', () => {
  const names = { room: (roomId: string) => ({ shaft1: 'Shaft 1', stair1: 'Stair A', stair2: 'Stair B' })[roomId] ?? roomId };
  const warning = (patch: Partial<RouteAreaWarning> & Pick<RouteAreaWarning, 'code'>): RouteAreaWarning => ({ severity: 'warning', ...patch });

  it('fills the count and the room name', () => {
    const lines = routeAreaLines([
      warning({ code: 'open-room', count: 12 }),
      warning({ code: 'shaft-crossing', roomIds: ['shaft1'], count: 3 }),
    ], names, 'en');
    expect(lines[0]!.text).toBe('12 rooms of the route area may have a wrong outline (no closed wall found). The center line can be wrong.');
    expect(lines[1]!.text).toBe('The shaft Shaft 1 has 3 possible places for a branch through its wall.');
  });

  it('keeps the order of the warnings', () => {
    const lines = routeAreaLines([
      warning({ code: 'draft-2d', severity: 'info' }),
      warning({ code: 'no-rooms', severity: 'error' }),
      warning({ code: 'parts', count: 2 }),
    ], names, 'en');
    expect(lines.map((line) => line.code)).toEqual(['draft-2d', 'no-rooms', 'parts']);
  });

  it('copies the severity from the warning', () => {
    const [line] = routeAreaLines([warning({ code: 'no-calibration', severity: 'error' })], names, 'en');
    expect(line!.severity).toBe('error');
  });

  it('gives an empty hint for codes without a hint', () => {
    const lines = routeAreaLines([
      warning({ code: 'no-calibration' }),
      warning({ code: 'no-rooms' }),
      warning({ code: 'no-types' }),
      warning({ code: 'no-route-rooms' }),
      warning({ code: 'open-room', count: 2 }),
      warning({ code: 'parts', count: 2 }),
      warning({ code: 'unreached', count: 2 }),
      warning({ code: 'stair-name', roomIds: ['stair1'] }),
      warning({ code: 'draft-2d' }),
    ], names, 'en');
    for (const line of lines) expect(line.hint).toBe('');
  });

  it('gives the wall-crossing hint for wall-crossings and shaft-crossing', () => {
    const lines = routeAreaLines([
      warning({ code: 'wall-crossings', count: 4 }),
      warning({ code: 'shaft-crossing', roomIds: ['shaft1'], count: 2 }),
    ], names, 'en');
    expect(lines.map((line) => line.hint)).toEqual([routeText('en', 'warnWallCrossingsHint'), routeText('en', 'warnWallCrossingsHint')]);
  });

  it('gives one line per stair-name room', () => {
    const lines = routeAreaLines([warning({ code: 'stair-name', roomIds: ['stair1', 'stair2'], count: 2 })], names, 'en');
    expect(lines.map((line) => line.text)).toEqual([
      'Stair A may be a stairwell. Check if a branch can go there.',
      'Stair B may be a stairwell. Check if a branch can go there.',
    ]);
  });

  it('gives one stair-name line with an empty room name when there are no roomIds', () => {
    const lines = routeAreaLines([warning({ code: 'stair-name' })], names, 'en');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe(routeText('en', 'warnStairName', { room: '' }));
  });

  it('uses the singular text for a count of 1', () => {
    const lines = routeAreaLines([
      warning({ code: 'wall-crossings', count: 1 }),
      warning({ code: 'open-room', count: 1 }),
      warning({ code: 'unreached', count: 1 }),
    ], names, 'en');
    expect(lines.map((line) => line.text)).toEqual([
      routeText('en', 'warnWallCrossingsOne'),
      routeText('en', 'warnOpenRoomOne'),
      routeText('en', 'warnUnreachedOne'),
    ]);
  });

  it('maps every code to its English text', () => {
    const lines = routeAreaLines([
      warning({ code: 'no-calibration' }),
      warning({ code: 'no-rooms' }),
      warning({ code: 'no-types' }),
      warning({ code: 'no-route-rooms' }),
      warning({ code: 'parts', count: 3 }),
      warning({ code: 'draft-2d' }),
    ], names, 'en');
    expect(lines.map((line) => line.text)).toEqual([
      routeText('en', 'warnNoCalibration'),
      routeText('en', 'warnNoRooms'),
      routeText('en', 'warnNoTypes'),
      routeText('en', 'warnNoRouteRooms'),
      routeText('en', 'warnParts', { count: 3 }),
      routeText('en', 'warnDraft2d'),
    ]);
  });
});

describe('routeAreaSummaryLine', () => {
  const area = (rooms: number, entryRoomIds: string[]) => ({
    rooms: Array.from({ length: rooms }, (_, index) => ({ roomId: `r${index}` })),
    entries: entryRoomIds.map((roomId) => ({ roomId })),
  }) as unknown as RouteArea;

  it('gives the zero-room line', () => {
    expect(routeAreaSummaryLine(area(0, []), 'en')).toBe('0 rooms in the route area. 0 rooms have a wall with it.');
  });

  it('gives the one-room line with nothing else', () => {
    expect(routeAreaSummaryLine(area(1, ['r0']), 'en')).toBe('1 room in the route area.');
  });

  it('gives the single-entry line for two or more rooms with one entry room', () => {
    expect(routeAreaSummaryLine(area(2, ['r0']), 'en')).toBe('2 rooms in the route area. 1 room has a wall with it.');
    expect(routeAreaSummaryLine(area(3, ['r0', 'r0', 'r0']), 'en')).toBe('3 rooms in the route area. 1 room has a wall with it.');
  });

  it('gives the entry count for two or more rooms with many entry rooms', () => {
    expect(routeAreaSummaryLine(area(4, ['r0', 'r1', 'r1', 'r2']), 'en')).toBe('4 rooms in the route area. 3 rooms have a wall with it.');
  });
});

describe('routeAreaTypeChoices', () => {
  const roomTypes = [
    { id: 'office', name: 'Office', nameNl: 'Kantoor', keywords: [] },
    { id: 'corridor', name: 'Corridor', keywords: [] },
  ] as unknown as RoomType[];

  it('marks the types in the list', () => {
    expect(routeAreaTypeChoices(roomTypes, ['corridor'], 'en')).toEqual([
      { id: 'office', label: 'Office', inList: false },
      { id: 'corridor', label: 'Corridor', inList: true },
    ]);
  });

  it('uses the room type label in English', () => {
    expect(routeAreaTypeChoices(roomTypes, [], 'en')[0]!.label).toBe('Office');
  });

  it('keeps the library order', () => {
    expect(routeAreaTypeChoices(roomTypes, ['corridor', 'office'], 'en').map((choice) => choice.id)).toEqual(['office', 'corridor']);
  });

  it('adds an unknown id at the end with its id as label, once', () => {
    expect(routeAreaTypeChoices(roomTypes, ['ghost', 'corridor', 'ghost'], 'en')).toEqual([
      { id: 'office', label: 'Office', inList: false },
      { id: 'corridor', label: 'Corridor', inList: true },
      { id: 'ghost', label: 'ghost', inList: true },
    ]);
  });
});
