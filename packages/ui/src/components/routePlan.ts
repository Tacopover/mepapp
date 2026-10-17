import { getStampPorts, openPortsOf, routingTargetOf, type Room, type RouteLanguage, type RoutePortsResult, type RouteStamp, type StartProblem, type StartProblemCode, type StartSeverity } from '@mepapp/core';

/** Network types that the type select does not list. */
export const GRAVITY_TYPE_IDS: readonly string[] = ['sanitary-waste'];

export interface StartCandidate<S> {
  stamp: S;
  likelySource: boolean;
}

/**
 * Equipment stamps only (category 'equipment'). likelySource = no port of the stamp has a routing target
 * (check every port id in stamp.ports, with routingTargetOf(stamp, portId)). Sources first; order inside each group = order of `stamps`.
 */
export function startCandidates<S extends RouteStamp & { definitionId?: string }>(stamps: readonly S[]): StartCandidate<S>[] {
  const candidates = stamps
    .filter((stamp) => stamp.category === 'equipment')
    .map((stamp) => ({ stamp, likelySource: getStampPorts(stamp).every((port) => routingTargetOf(stamp, port.id) === undefined) }));
  return [...candidates.filter((c) => c.likelySource), ...candidates.filter((c) => !c.likelySource)];
}

/** True when one of the stamp's own ports has routing target === networkTypeId (open or with a segment). */
export function looksLikeLoad(stamp: RouteStamp, networkTypeId: string): boolean {
  return getStampPorts(stamp).some((port) => routingTargetOf(stamp, port.id) === networkTypeId);
}

/** Id of the only equipment stamp in the selection; else null (zero, two or more equipment stamps; terminal only). */
export function presetStart(selection: readonly RouteStamp[]): string | null {
  const equipment = selection.filter((stamp) => stamp.category === 'equipment');
  return equipment.length === 1 ? equipment[0]!.id : null;
}

/**
 * Open ports (use openPortsOf) counted per networkTypeId, gravity types (GRAVITY_TYPE_IDS) left out,
 * largest count first, a tie sorted by networkTypeId (plain < compare).
 */
export function typeChoices(stamps: readonly RouteStamp[]): { networkTypeId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const port of openPortsOf(stamps)) {
    if (GRAVITY_TYPE_IDS.includes(port.networkTypeId)) continue;
    counts.set(port.networkTypeId, (counts.get(port.networkTypeId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([networkTypeId, count]) => ({ networkTypeId, count }))
    .sort((a, b) => b.count - a.count || (a.networkTypeId < b.networkTypeId ? -1 : a.networkTypeId > b.networkTypeId ? 1 : 0));
}

/**
 * Ports of the stamp for the start port select: ports whose routing target === networkTypeId first (matches: true),
 * then the others, both in port order. routingTarget = routingTargetOf(stamp, portId) ?? null.
 * A stamp with no own port gives one entry { portId: '__center__', name: 'Center', routingTarget: null, matches: false } (use getStampPorts; the name comes from the port).
 */
export function startPortChoices(stamp: RouteStamp, networkTypeId: string): { portId: string; name: string; routingTarget: string | null; matches: boolean }[] {
  const choices = getStampPorts(stamp).map((port) => {
    const routingTarget = routingTargetOf(stamp, port.id) ?? null;
    return { portId: port.id, name: port.name, routingTarget, matches: routingTarget === networkTypeId };
  });
  return [...choices.filter((c) => c.matches), ...choices.filter((c) => !c.matches)];
}

/** Label of a room in the list: name (trimmed, if not empty), else number (trimmed, if not empty), else "Room <index+1>" (en) / "Ruimte <index+1>" (nl). */
export function roomLabel(room: Pick<Room, 'id' | 'name' | 'number'>, index: number, language: RouteLanguage): string {
  const name = room.name?.trim();
  if (name) return name;
  const number = room.number?.trim();
  if (number) return number;
  return language === 'nl' ? `Ruimte ${index + 1}` : `Room ${index + 1}`;
}

/** English: libraryName. Dutch: 'toevoerlucht' for supply-air, 'retourlucht' for return-air, 'afzuiglucht' for exhaust-air, else libraryName. */
export function typeNameInText(typeId: string, libraryName: string, language: RouteLanguage): string {
  if (language === 'en') return libraryName;
  if (typeId === 'supply-air') return 'toevoerlucht';
  if (typeId === 'return-air') return 'retourlucht';
  if (typeId === 'exhaust-air') return 'afzuiglucht';
  return libraryName;
}

export type RouteTextKey =
  | 'title' | 'close' | 'noEquipment' | 'startStamp' | 'groupSources' | 'groupWaiting' | 'startWarning'
  | 'startPort' | 'portNote' | 'networkType' | 'noOpenPorts' | 'scope' | 'scopeRooms' | 'scopeStamps'
  | 'roomsAll' | 'roomsNone' | 'noRooms' | 'includeOutside' | 'useAllPorts'
  | 'scopeStampsHint' | 'roomsColRoom' | 'roomsColType' | 'roomsColPorts' | 'noChoice' | 'scopeStampsNote' | 'roomsColPortsTitle'
  | 'checkUnknownStart' | 'checkNotEquipment' | 'checkPortSegments' | 'checkPortSegmentsHint' | 'checkPortForeignType' | 'checkPortForeignTypeHint'
  | 'checkGroupOtherType' | 'checkGroupSameType' | 'checkSecondEquipment' | 'checkSecondEquipmentHint' | 'selectionNotEquipment' | 'selectionRiserNote' | 'severityError' | 'severityWarning' | 'severityInfo';

const TEXTS: Record<RouteLanguage, Record<RouteTextKey, string>> = {
  en: {
    title: 'Route network',
    close: 'Close',
    noEquipment: 'Place an equipment stamp first, for example an air handling unit, a fan, a boiler or a chiller.',
    startStamp: 'Start stamp',
    groupSources: 'Likely sources',
    groupWaiting: 'Has ports that wait for routing',
    startWarning: 'This stamp has ports that wait for {type}. It can be a load, not a source. You can still use it.',
    startPort: 'Start port',
    portNote: 'This port waits for {target}, not {type}.',
    networkType: 'Network type',
    noOpenPorts: 'No open port waits for routing. Run Auto-place or set a routing target in Properties.',
    scope: 'Scope',
    scopeRooms: 'Rooms',
    scopeStamps: 'Selected stamps',
    roomsAll: 'All',
    roomsNone: 'None',
    noRooms: 'No rooms yet. Run Detect rooms in Auto-place, or use the selected stamps.',
    includeOutside: 'Include ports outside rooms',
    useAllPorts: 'Use all ports of stamps with 2 ports of the same type',
    scopeStampsHint: 'Select other stamps on the plan first.',
    roomsColRoom: 'Room',
    roomsColType: 'Type',
    roomsColPorts: 'Open ports',
    noChoice: 'None available',
    scopeStampsNote: 'The start stamp itself is not counted.',
    roomsColPortsTitle: 'Open ports',
    checkUnknownStart: 'The start stamp or the start port does not exist.',
    checkNotEquipment: '{stamp} has a category other than equipment. Only equipment can start a network.',
    checkPortSegments: 'The start port has {count}.',
    checkPortSegmentsHint: 'Many segments are normal for a shaft, a riser or a manifold. For one run, use a port with 0 or 1.',
    checkPortForeignType: 'The start port already has a segment of {types}.',
    checkPortForeignTypeHint: 'The segment sets the network type. Choose that type, or use another port.',
    checkGroupOtherType: '{ports} is in one port group with this port. Its segment has type {types}. It stays a separate network.',
    checkGroupSameType: '{ports} is in one port group with this port. Its segment has the same type, so the run joins that network.',
    checkSecondEquipment: 'The network at this port has more equipment: {stamps}.',
    checkSecondEquipmentHint: 'Many networks have more than one equipment stamp. The flow is counted from your start stamp. Check that you want one network.',
    selectionNotEquipment: 'The selected stamp {stamp} is not equipment. Only equipment starts a network. Change the category in the Element Editor.',
    selectionRiserNote: 'A riser across floors is not one start stamp yet.',
    severityError: 'Error',
    severityWarning: 'Warning',
    severityInfo: 'Note',
  },
  nl: {
    title: 'Netwerk routeren',
    close: 'Sluiten',
    noEquipment: 'Plaats eerst een apparaat, bijvoorbeeld een luchtbehandelingskast, een ventilator, een ketel of een koelmachine.',
    startStamp: 'Startstempel',
    groupSources: 'Waarschijnlijke bronnen',
    groupWaiting: 'Heeft aansluitingen die op routering wachten',
    startWarning: 'Dit stempel heeft aansluitingen die op {type} wachten. Het kan een verbruiker zijn, geen bron. U kunt het toch gebruiken.',
    startPort: 'Startaansluiting',
    portNote: 'Deze aansluiting wacht op {target}, niet op {type}.',
    networkType: 'Netwerktype',
    noOpenPorts: 'Geen open aansluiting wacht op routering. Gebruik Auto-plaatsen of stel een routeringsdoel in bij Eigenschappen.',
    scope: 'Bereik',
    scopeRooms: 'Ruimtes',
    scopeStamps: 'Geselecteerde stempels',
    roomsAll: 'Alles',
    roomsNone: 'Geen',
    noRooms: 'Nog geen ruimtes. Gebruik Ruimtes detecteren in Auto-plaatsen, of gebruik de geselecteerde stempels.',
    includeOutside: 'Aansluitingen buiten ruimtes meenemen',
    useAllPorts: 'Gebruik alle aansluitingen van stempels met 2 aansluitingen van hetzelfde type',
    scopeStampsHint: 'Selecteer eerst andere stempels op het plan.',
    roomsColRoom: 'Ruimte',
    roomsColType: 'Type',
    roomsColPorts: 'Open',
    noChoice: 'Niet beschikbaar',
    scopeStampsNote: 'Het startstempel zelf wordt niet meegeteld.',
    roomsColPortsTitle: 'Open aansluitingen',
    checkUnknownStart: 'Het startstempel of de startaansluiting bestaat niet.',
    checkNotEquipment: '{stamp} heeft een andere categorie dan apparaat. Alleen een apparaat kan een netwerk starten.',
    checkPortSegments: 'De startaansluiting heeft {count}.',
    checkPortSegmentsHint: 'Meerdere segmenten zijn normaal voor een schacht, een stijgleiding of een verdeler. Gebruik voor één netwerk een aansluiting met 0 of 1.',
    checkPortForeignType: 'De startaansluiting heeft al een segment van {types}.',
    checkPortForeignTypeHint: 'Het segment bepaalt het netwerktype. Kies dat type of gebruik een andere aansluiting.',
    checkGroupOtherType: '{ports} staat met deze aansluiting in één groep. Het segment heeft type {types}. Het blijft een apart netwerk.',
    checkGroupSameType: '{ports} staat met deze aansluiting in één groep. Het segment heeft hetzelfde type, dus het sluit aan op dat netwerk.',
    checkSecondEquipment: 'Het netwerk bij deze aansluiting heeft meer apparaten: {stamps}.',
    checkSecondEquipmentHint: 'Veel netwerken hebben meer dan één apparaat. De debieten worden geteld vanaf uw startstempel. Controleer of u één netwerk wilt.',
    selectionNotEquipment: 'Het stempel {stamp} is geen apparaat. Alleen een apparaat start een netwerk. Wijzig de categorie in de Element Editor.',
    selectionRiserNote: 'Een stijgleiding over verdiepingen is nog niet één startstempel.',
    severityError: 'Fout',
    severityWarning: 'Waarschuwing',
    severityInfo: 'Opmerking',
  },
};

export function includeOutsideText(language: RouteLanguage, count: number): string {
  if (language === 'nl') return `${routeText(language, 'includeOutside')}: ${count} ${count === 1 ? 'aansluiting' : 'aansluitingen'}`;
  return `${routeText(language, 'includeOutside')}: ${count} ${count === 1 ? 'port' : 'ports'}`;
}

export function typeOptionText(language: RouteLanguage, name: string, count: number): string {
  if (language === 'nl') return `${name} (${count} open)`;
  return `${name} (${count} open ${count === 1 ? 'port' : 'ports'})`;
}

/** Replaces each {name} in the text with String(params[name]). A {name} with no param stays as it is. */
export function routeText(language: RouteLanguage, key: RouteTextKey, params?: Record<string, string | number>): string {
  const text = TEXTS[language][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

export interface StartCheckLine {
  code: StartProblemCode;
  severity: StartSeverity;
  /** The problem. */
  text: string;
  /** Empty when the code has no hint. */
  hint: string;
}

/** One line per problem, in the order of `problems`. names maps a type, stamp or port id to its text. */
export function startCheckLines(
  problems: readonly StartProblem[],
  names: { type: (typeId: string) => string; stamp: (stampId: string) => string; port: (portId: string) => string },
  language: RouteLanguage,
): StartCheckLine[] {
  const nl = language === 'nl';
  return problems.map((problem): StartCheckLine => {
    const { code, severity } = problem;
    const types = (problem.typeIds ?? []).map((typeId) => names.type(typeId)).join(', ');
    const ports = (problem.portIds ?? []).map((portId) => names.port(portId)).join(', ');
    const stamps = (problem.stampIds ?? []).map((stampId) => names.stamp(stampId)).join(', ');
    const count = problem.count ?? 0;
    const countText = `${count} ${count === 1 ? 'segment' : nl ? 'segmenten' : 'segments'}`;
    switch (code) {
      case 'unknown-start':
        return { code, severity, text: routeText(language, 'checkUnknownStart'), hint: '' };
      case 'not-equipment':
        return { code, severity, text: routeText(language, 'checkNotEquipment', { stamp: nl ? 'Dit stempel' : 'This stamp' }), hint: '' };
      case 'port-segments':
        return { code, severity, text: routeText(language, 'checkPortSegments', { count: countText }), hint: routeText(language, 'checkPortSegmentsHint') };
      case 'port-foreign-type':
        return { code, severity, text: routeText(language, 'checkPortForeignType', { types }), hint: routeText(language, 'checkPortForeignTypeHint') };
      case 'group-other-type':
        return { code, severity, text: routeText(language, 'checkGroupOtherType', { ports, types }).trim(), hint: '' };
      case 'group-same-type':
        return { code, severity, text: routeText(language, 'checkGroupSameType', { ports }).trim(), hint: '' };
      case 'second-equipment':
        return { code, severity, text: routeText(language, 'checkSecondEquipment', { stamps }), hint: routeText(language, 'checkSecondEquipmentHint') };
    }
  });
}

export interface RouteSummaryOptions {
  /** Default 'one'. */
  portsPerStamp?: 'one' | 'all';
  /** Default true. Only used for the "outside every room" line. */
  includeOutsideRooms?: boolean;
}

/** roomCount = number of checked rooms (rooms scope only; ignored for the stamps scope). */
export function routeSummaryLines(
  result: RoutePortsResult, scope: 'rooms' | 'stamps', typeName: string, roomCount: number,
  language: RouteLanguage, options?: RouteSummaryOptions,
): string[] {
  const nl = language === 'nl';
  const portsPerStamp = options?.portsPerStamp ?? 'one';
  const includeOutsideRooms = options?.includeOutsideRooms ?? true;
  const ports = result.ports.length;
  const lines: string[] = [];

  if (scope === 'rooms') {
    lines.push(nl
      ? `${ports} open ${ports === 1 ? 'aansluiting' : 'aansluitingen'} voor ${typeName} in ${roomCount} aangevinkte ${roomCount === 1 ? 'ruimte' : 'ruimtes'}.`
      : `${ports} open ${ports === 1 ? 'port' : 'ports'} of ${typeName} in ${roomCount} checked ${roomCount === 1 ? 'room' : 'rooms'}.`);
  } else {
    const stamps = new Set(result.ports.map((port) => port.stampId)).size;
    lines.push(nl
      ? `${ports} open ${ports === 1 ? 'aansluiting' : 'aansluitingen'} voor ${typeName} op ${stamps} ${stamps === 1 ? 'geselecteerd stempel' : 'geselecteerde stempels'}.`
      : `${ports} open ${ports === 1 ? 'port' : 'ports'} of ${typeName} on ${stamps} selected ${stamps === 1 ? 'stamp' : 'stamps'}.`);
  }

  const outside = result.outsideRooms;
  if (scope === 'rooms' && outside > 0) {
    const one = outside === 1;
    const included = includeOutsideRooms;
    lines.push(nl
      ? `${one ? '1 aansluiting ligt' : `${outside} aansluitingen liggen`} buiten alle ruimtes. ${one ? (included ? 'Deze wordt meegenomen.' : 'Deze wordt niet meegenomen.') : (included ? 'Deze worden meegenomen.' : 'Deze worden niet meegenomen.')}`
      : `${one ? '1 port is' : `${outside} ports are`} outside every room. ${included ? (one ? 'It is included.' : 'They are included.') : (one ? 'It is not included.' : 'They are not included.')}`);
  }

  if (result.leftOut > 0) {
    const n = result.leftOut;
    lines.push(nl
      ? `${n} ${n === 1 ? 'aansluiting valt' : 'aansluitingen vallen'} buiten het bereik.`
      : `${n} ${n === 1 ? 'port is' : 'ports are'} left out by the scope.`);
  }

  if (result.equipmentPorts > 0) {
    const n = result.equipmentPorts;
    lines.push(nl
      ? `${n} ${n === 1 ? 'aansluiting van een apparaat is' : 'aansluitingen van apparaten zijn'} geen ${n === 1 ? 'doel' : 'doelen'}.`
      : `${n} ${n === 1 ? 'port of equipment is not a target' : 'ports of equipment are not targets'}.`);
  }

  if (result.startStampPorts > 0) {
    const n = result.startStampPorts;
    lines.push(nl
      ? `${n} ${n === 1 ? 'aansluiting van het startstempel is geen doel' : 'aansluitingen van het startstempel zijn geen doelen'}.`
      : `${n} ${n === 1 ? 'port of the start stamp is not a target' : 'ports of the start stamp are not targets'}.`);
  }

  if (result.multiPortStamps > 0) {
    const m = result.multiPortStamps;
    const first = nl
      ? `${m} ${m === 1 ? 'stempel heeft' : 'stempels hebben'} meer dan 1 aansluiting van hetzelfde type.`
      : `${m} ${m === 1 ? 'stamp has' : 'stamps have'} more than 1 port of the same type.`;
    const second = nl
      ? (portsPerStamp === 'all' ? 'Alle aansluitingen worden gebruikt.' : 'Van elk wordt 1 aansluiting gebruikt.')
      : (portsPerStamp === 'all' ? 'All ports are used.' : 'Only 1 port of each is used.');
    lines.push(`${first} ${second}`);
  }

  return lines;
}
