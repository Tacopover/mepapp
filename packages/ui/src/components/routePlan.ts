import { getStampPorts, openPortsOf, routingTargetOf, type Room, type RoomType, roomTypeLabel, type RouteArea, type RouteAreaWarning, type RouteAreaWarningCode, type RoutePortsResult, type RouteStamp, type StartProblem, type StartProblemCode, type StartSeverity } from '@mepapp/core';

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
 * A type in routedTypeIds (the types of routed runs) with no open port is added with a count of 0, so a run can be routed again.
 */
export function typeChoices(stamps: readonly RouteStamp[], routedTypeIds: readonly string[] = []): { networkTypeId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const port of openPortsOf(stamps)) {
    if (GRAVITY_TYPE_IDS.includes(port.networkTypeId)) continue;
    counts.set(port.networkTypeId, (counts.get(port.networkTypeId) ?? 0) + 1);
  }
  for (const id of routedTypeIds) {
    if (GRAVITY_TYPE_IDS.includes(id) || counts.has(id)) continue;
    counts.set(id, 0);
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

/** Label of a room in the list: name (trimmed, if not empty), else number (trimmed, if not empty), else "Room <index+1>". */
export function roomLabel(room: Pick<Room, 'id' | 'name' | 'number'>, index: number): string {
  const name = room.name?.trim();
  if (name) return name;
  const number = room.number?.trim();
  if (number) return number;
  return `Room ${index + 1}`;
}

export const ROUTE_TEXT_KEYS = [
  'title', 'close', 'noEquipment', 'startStamp', 'groupSources', 'groupWaiting', 'startWarning',
  'startPort', 'portNote', 'networkType', 'noOpenPorts', 'scope', 'scopeRooms', 'scopeStamps',
  'roomsAll', 'roomsNone', 'noRooms', 'includeOutside', 'useAllPorts',
  'scopeStampsHint', 'roomsColRoom', 'roomsColType', 'roomsColPorts', 'noChoice', 'scopeStampsNote', 'roomsColPortsTitle',
  'checkUnknownStart', 'checkNotEquipment', 'checkPortSegments', 'checkPortSegmentsHint', 'checkPortForeignType', 'checkPortForeignTypeHint',
  'checkGroupOtherType', 'checkGroupSameType', 'checkSecondEquipment', 'checkSecondEquipmentHint', 'selectionNotEquipment', 'selectionRiserNote', 'severityError', 'severityWarning', 'severityInfo',
  'areaTitle', 'areaTypes', 'areaAdd', 'areaRemove', 'areaReset', 'areaShow', 'areaTypesHint', 'areaCalculating',
  'areaSummary', 'areaSummaryOne', 'areaSummaryEntryOne', 'areaLegend', 'areaLegendGuide',
  'warnNoCalibration', 'warnNoRooms', 'warnNoTypes', 'warnNoRouteRooms', 'warnOpenRoom', 'warnOpenRoomOne', 'warnParts',
  'warnWallCrossings', 'warnWallCrossingsOne', 'warnWallCrossingsHint', 'warnShaftCrossing', 'warnShaftCrossingOne', 'warnShaftCrossingHint',
  'warnUnreached', 'warnUnreachedOne', 'warnStairName', 'warnDraft2d',
] as const;

export type RouteTextKey = typeof ROUTE_TEXT_KEYS[number];

const TEXTS: Record<RouteTextKey, string> = {
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
  areaTitle: 'Route area',
  areaTypes: 'Room types in the route area',
  areaAdd: 'Add a room type…',
  areaRemove: 'Remove {type}',
  areaReset: 'Use Corridor and Shaft',
  areaShow: 'Show the route area on the plan',
  areaTypesHint: 'Entrance and hall can carry a main.',
  areaCalculating: 'Calculating the route area…',
  areaSummary: '{rooms} rooms in the route area. {entries} rooms have a wall with it.',
  areaSummaryOne: '1 room in the route area.',
  areaSummaryEntryOne: '{rooms} rooms in the route area. 1 room has a wall with it.',
  areaLegend: 'Route area, center line, possible place for a branch, shaft place',
  areaLegendGuide: 'The center line is a guide.',
  warnNoCalibration: 'The drawing has no scale. Set the scale first.',
  warnNoRooms: 'The drawing has no rooms. Run Detect rooms in Auto-place.',
  warnNoTypes: 'No room type is in the list. Add a room type.',
  warnNoRouteRooms: 'No room has a room type of the list. Add a room type, or change the room type of a room in the Rooms tab.',
  warnOpenRoom: '{count} rooms of the route area may have a wrong outline (no closed wall found). The center line can be wrong.',
  warnOpenRoomOne: '1 room of the route area may have a wrong outline (no closed wall found). The center line can be wrong.',
  warnParts: 'The route area has {count} separate parts. A branch between them passes rooms that are not in the route area.',
  warnWallCrossings: '{count} rooms can be reached through a wall of the route area. The places are marked.',
  warnWallCrossingsOne: '1 room can be reached through a wall of the route area. The place is marked.',
  warnWallCrossingsHint: 'Check which of these walls are fire walls. A duct needs a fire damper there. A pipe or cable tray needs a firestop.',
  warnShaftCrossing: 'The shaft {room} has {count} possible places for a branch through its wall.',
  warnShaftCrossingOne: 'The shaft {room} has 1 possible place for a branch through its wall.',
  warnShaftCrossingHint: 'Check which of these walls are fire walls. A duct needs a fire damper there. A pipe or cable tray needs a firestop.',
  warnUnreached: '{count} rooms have no wall with the route area. A branch to them passes more than one wall or room.',
  warnUnreachedOne: '1 room has no wall with the route area. A branch to it passes more than one wall or room.',
  warnStairName: '{room} may be a stairwell. Check if a branch can go there.',
  warnDraft2d: 'Draft in 2D. Check height, clashes, clearances and slope yourself.',
};

export function includeOutsideText(count: number): string {
  return `${routeText('includeOutside')}: ${count} ${count === 1 ? 'port' : 'ports'}`;
}

export function typeOptionText(name: string, count: number): string {
  return `${name} (${count} open ${count === 1 ? 'port' : 'ports'})`;
}

/** Replaces each {name} in the text with String(params[name]). A {name} with no param stays as it is. */
export function routeText(key: RouteTextKey, params?: Record<string, string | number>): string {
  const text = TEXTS[key];
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
): StartCheckLine[] {
  return problems.map((problem): StartCheckLine => {
    const { code, severity } = problem;
    const types = (problem.typeIds ?? []).map((typeId) => names.type(typeId)).join(', ');
    const ports = (problem.portIds ?? []).map((portId) => names.port(portId)).join(', ');
    const stamps = (problem.stampIds ?? []).map((stampId) => names.stamp(stampId)).join(', ');
    const count = problem.count ?? 0;
    const countText = `${count} ${count === 1 ? 'segment' : 'segments'}`;
    switch (code) {
      case 'unknown-start':
        return { code, severity, text: routeText('checkUnknownStart'), hint: '' };
      case 'not-equipment':
        return { code, severity, text: routeText('checkNotEquipment', { stamp: 'This stamp' }), hint: '' };
      case 'port-segments':
        return { code, severity, text: routeText('checkPortSegments', { count: countText }), hint: routeText('checkPortSegmentsHint') };
      case 'port-foreign-type':
        return { code, severity, text: routeText('checkPortForeignType', { types }), hint: routeText('checkPortForeignTypeHint') };
      case 'group-other-type':
        return { code, severity, text: routeText('checkGroupOtherType', { ports, types }).trim(), hint: '' };
      case 'group-same-type':
        return { code, severity, text: routeText('checkGroupSameType', { ports }).trim(), hint: '' };
      case 'second-equipment':
        return { code, severity, text: routeText('checkSecondEquipment', { stamps }), hint: routeText('checkSecondEquipmentHint') };
    }
  });
}

export interface RouteAreaLine {
  code: RouteAreaWarningCode;
  severity: 'error' | 'warning' | 'info';
  text: string;
  /** Empty when the code has no hint. */
  hint: string;
}

/**
 * One line per warning, in the order of `warnings`. Exception: a `stair-name` warning gives one line per id in its roomIds (text uses names.room(id)); with no roomIds it gives one line with names.room('').
 * `shaft-crossing` uses names.room(roomIds[0] ?? ''). {count} is warning.count ?? 0. hint is '' for every other code.
 */
export function routeAreaLines(
  warnings: readonly RouteAreaWarning[],
  names: { room: (roomId: string) => string },
): RouteAreaLine[] {
  const lines: RouteAreaLine[] = [];
  for (const warning of warnings) {
    const { code, severity } = warning;
    const count = warning.count ?? 0;
    const add = (text: string, hint = ''): void => {
      lines.push({ code, severity, text, hint });
    };
    switch (code) {
      case 'no-calibration':
        add(routeText('warnNoCalibration'));
        break;
      case 'no-rooms':
        add(routeText('warnNoRooms'));
        break;
      case 'no-types':
        add(routeText('warnNoTypes'));
        break;
      case 'no-route-rooms':
        add(routeText('warnNoRouteRooms'));
        break;
      case 'open-room':
        add(count === 1 ? routeText('warnOpenRoomOne') : routeText('warnOpenRoom', { count }));
        break;
      case 'parts':
        add(routeText('warnParts', { count }));
        break;
      case 'wall-crossings':
        add(
          count === 1 ? routeText('warnWallCrossingsOne') : routeText('warnWallCrossings', { count }),
          routeText('warnWallCrossingsHint'),
        );
        break;
      case 'shaft-crossing':
        add(
          count === 1
            ? routeText('warnShaftCrossingOne', { room: names.room(warning.roomIds?.[0] ?? '') })
            : routeText('warnShaftCrossing', { room: names.room(warning.roomIds?.[0] ?? ''), count }),
          routeText('warnShaftCrossingHint'),
        );
        break;
      case 'unreached':
        add(count === 1 ? routeText('warnUnreachedOne') : routeText('warnUnreached', { count }));
        break;
      case 'stair-name': {
        const roomIds = warning.roomIds?.length ? warning.roomIds : [''];
        for (const roomId of roomIds) add(routeText('warnStairName', { room: names.room(roomId) }));
        break;
      }
      case 'draft-2d':
        add(routeText('warnDraft2d'));
        break;
    }
  }
  return lines;
}

/** rooms = area.rooms.length; entries = number of DISTINCT roomId in area.entries. rooms 1 -> areaSummaryOne (nothing else); rooms 0 -> areaSummary with rooms 0 and entries 0; rooms >= 2: entries 1 -> areaSummaryEntryOne, else areaSummary. */
export function routeAreaSummaryLine(area: RouteArea): string {
  const rooms = area.rooms.length;
  if (rooms === 1) return routeText('areaSummaryOne');
  if (rooms === 0) return routeText('areaSummary', { rooms: 0, entries: 0 });
  const entries = new Set(area.entries.map((entry) => entry.roomId)).size;
  if (entries === 1) return routeText('areaSummaryEntryOne', { rooms });
  return routeText('areaSummary', { rooms, entries });
}

/**
 * One item per library type in the library order: { id: type.id, label: roomTypeLabel(type), inList: ids.includes(type.id) }.
 * Then one item per id in `ids` that matches no library type, in the order of `ids` with doubles removed: { id, label: id, inList: true }.
 */
export function routeAreaTypeChoices(
  roomTypes: readonly RoomType[],
  ids: readonly string[],
): { id: string; label: string; inList: boolean }[] {
  const libraryIds = new Set(roomTypes.map((type) => type.id));
  const libraryChoices = roomTypes.map((type) => ({ id: type.id, label: roomTypeLabel(type), inList: ids.includes(type.id) }));
  const unknownChoices = [...new Set(ids)].filter((id) => !libraryIds.has(id)).map((id) => ({ id, label: id, inList: true }));
  return [...libraryChoices, ...unknownChoices];
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
  options?: RouteSummaryOptions,
): string[] {
  const portsPerStamp = options?.portsPerStamp ?? 'one';
  const includeOutsideRooms = options?.includeOutsideRooms ?? true;
  const ports = result.ports.length;
  const lines: string[] = [];

  if (scope === 'rooms') {
    lines.push(`${ports} open ${ports === 1 ? 'port' : 'ports'} of ${typeName} in ${roomCount} checked ${roomCount === 1 ? 'room' : 'rooms'}.`);
  } else {
    const stamps = new Set(result.ports.map((port) => port.stampId)).size;
    lines.push(`${ports} open ${ports === 1 ? 'port' : 'ports'} of ${typeName} on ${stamps} selected ${stamps === 1 ? 'stamp' : 'stamps'}.`);
  }

  const outside = result.outsideRooms;
  if (scope === 'rooms' && outside > 0) {
    const one = outside === 1;
    const included = includeOutsideRooms;
    lines.push(`${one ? '1 port is' : `${outside} ports are`} outside every room. ${included ? (one ? 'It is included.' : 'They are included.') : (one ? 'It is not included.' : 'They are not included.')}`);
  }

  if (result.leftOut > 0) {
    const n = result.leftOut;
    lines.push(`${n} ${n === 1 ? 'port is' : 'ports are'} left out by the scope.`);
  }

  if (result.equipmentPorts > 0) {
    const n = result.equipmentPorts;
    lines.push(`${n} ${n === 1 ? 'port of equipment is not a target' : 'ports of equipment are not targets'}.`);
  }

  if (result.startStampPorts > 0) {
    const n = result.startStampPorts;
    lines.push(`${n} ${n === 1 ? 'port of the start stamp is not a target' : 'ports of the start stamp are not targets'}.`);
  }

  if (result.multiPortStamps > 0) {
    const m = result.multiPortStamps;
    const first = `${m} ${m === 1 ? 'stamp has' : 'stamps have'} more than 1 port of the same type.`;
    const second = portsPerStamp === 'all' ? 'All ports are used.' : 'Only 1 port of each is used.';
    lines.push(`${first} ${second}`);
  }

  return lines;
}
