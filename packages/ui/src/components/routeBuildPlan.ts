import { routeText } from './routePlan.js';
import type { RoutePlanWarning, RoutePlanWarningCode, RouteStats } from '@mepapp/core';

export const TEXTS = {
  buildTitle: 'Route',
  buildPending: 'Calculating the route…',
  buildSizeAfter: 'Size the network after routing',
  buildPlace: 'Place route',
  buildRooms: 'Rooms to serve',
  buildDraft: 'Draft in 2D. Check height, clashes, clearances and slope yourself.',
  buildSummary: '{segments}, {fittings}, {length} m. {rooms}, {ports}.',
  nSegments: '{n} segments',
  nSegments_one: '1 segment',
  nFittings: '{n} fittings',
  nFittings_one: '1 fitting',
  nRooms: '{n} rooms',
  nRooms_one: '1 room',
  nPorts: '{n} ports',
  nPorts_one: '1 port',
  buildBends: '{b90} and {b45}.',
  bend90: '{n} bends of 90 degrees',
  bend90_one: '1 bend of 90 degrees',
  bend45: '{n} bends of 45 degrees',
  bend45_one: '1 bend of 45 degrees',
  buildRemove: 'Place route first removes {segments} and {fittings} of the earlier run. Hand-drawn segments stay.',
  buildExtends: 'The route starts at the end of a hand-drawn segment. That segment stays.',
  buildPortsAfter: 'After the removal, {n} ports are open for this run.',
  buildPortsAfter_one: 'After the removal, 1 port is open for this run.',
  buildPlaced: 'Placed {segments} and {fittings}.',
  buildPlaceFailed: 'The route could not be placed. Nothing changed. Try again.',
  'w_multi-page': 'This file has more than one page. Route one page at a time.',
  'w_no-calibration': 'The drawing has no scale. Set the scale first.',
  'w_area-empty': 'The route area is empty. Add a room type or detect rooms.',
  'w_gravity-not-routed': 'Drains need a slope. This command does not route drains.',
  'w_start-error': 'The start has a problem. Read the lines above.',
  'w_foreign-start': 'The start joins a network of another type. Nothing is placed.',
  'w_no-targets': 'No open port is left to connect.',
  'w_start-unreachable': 'The start cannot join the route area.',
  'w_internal-join': 'The route would join another network. Nothing is placed.',
  'w_free-angle': '{count} places need a free angle. The places are marked.',
  'w_free-angle_one': '1 place needs a free angle. The place is marked.',
  'w_wall-crossings': '{count} walls are crossed by the route. The places are marked.',
  'w_wall-crossings_one': '1 wall is crossed by the route. The place is marked.',
  hintFireWalls: 'Corridor and shaft walls are often fire rated. Check them. A duct needs a fire damper there. A pipe or cable tray needs a firestop.',
  'w_shaft-crossing': 'The route crosses the wall of the shaft {room} {times}.',
  nTimes: '{n} times',
  nTimes_one: '1 time',
  'w_room-off-graph': '{count} rooms are outside the route area. The route serves them anyway: {rooms}.',
  'w_room-off-graph_one': '1 room is outside the route area. The route serves it anyway: {rooms}.',
  moreRooms: ', and {n} more',
  'w_ports-left': '{count} ports could not be reached. They stay open.',
  'w_ports-left_one': '1 port could not be reached. It stays open.',
  'w_existing-crossings': 'The route crosses {count} existing segments. Check the clearances.',
  'w_existing-crossings_one': 'The route crosses 1 existing segment. Check the clearances.',
  'w_existing-overlap': 'The route runs on top of {count} existing segments.',
  'w_existing-overlap_one': 'The route runs on top of 1 existing segment.',
  'w_same-type-join': 'The start network is joined through a port group of the same type.',
  'w_short-leg': '{count} legs are shorter than 2 diameters. Check the fittings.',
  'w_short-leg_one': '1 leg is shorter than 2 diameters. Check the fittings.',
  'w_capacity-over': 'The ports total {total} {unit}. The start has {cap} {unit}.',
  'w_capacity-unit': 'The ports total {total}. The start has {cap}. The unit is not set, so the numbers are not compared.',
  'w_no-limits': 'Segments are not sized. Sizes shown are placeholders. Use Size network… after you place.',
  'w_rooms-skipped': '{count} rooms would join another network: {rooms}. Their ports stay open.',
  'w_rooms-skipped_one': '1 room would join another network: {rooms}. Its ports stay open.',
  'w_shares-lane': 'This route runs on top of {count} segments of earlier runs. Move one run by hand.',
  'w_shares-lane_one': 'This route runs on top of 1 segment of an earlier run. Move one run by hand.',
  'w_hand-kept-size': '{count} hand-drawn segments of this network keep their size.',
  'w_hand-kept-size_one': '1 hand-drawn segment of this network keeps its size.',
  'w_multi-port-stamps': 'Stamps with several open ports: {stamps}. Flow and return depend on the run order.',
  'w_multi-port-stamps_one': 'A stamp with several open ports: {stamps}. Flow and return depend on the run order.',
  'w_held-by-hand':'{count} routed segments stay joined to the start through hand-edited items. They are not removed.',
  'w_held-by-hand_one': '1 routed segment stays joined to the start through hand-edited items. It is not removed.',
} as const;

export type BuildTextKey = keyof typeof TEXTS;

/** Replaces each {name} in the text with String(params[name]). A {name} with no param stays as it is. */
export function buildText(key: BuildTextKey, params?: Record<string, string | number>): string {
  const text: string = TEXTS[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

export interface RouteBuildLine {
  code: RoutePlanWarningCode;
  severity: 'error' | 'warning' | 'info';
  text: string;
  hint: string;
}

export interface RouteBuildNames {
  room: (roomId: string) => string;
  /** The name of a stamp for the line multi-port-stamps. Default: the stamp id. */
  stamp?: (stampId: string) => string;
  /** The flow unit text. May be ''. */
  unit: string;
}

/** A count with its noun: '3 segments', or '1 segment' for a count of 1. */
export function countPhrase(key: 'nSegments' | 'nFittings' | 'nRooms' | 'nPorts' | 'bend90' | 'bend45', n: number): string {
  return n === 1 ? buildText(`${key}_one` as BuildTextKey) : buildText(key, { n });
}

/** The summary line and the bends line of a planned route. */
export function routeBuildSummary(stats: RouteStats): string[] {
  const summary = buildText('buildSummary', {
    segments: countPhrase('nSegments', stats.segments),
    fittings: countPhrase('nFittings', stats.fittings),
    length: Math.round(stats.lengthMm / 1000),
    rooms: countPhrase('nRooms', stats.rooms),
    ports: countPhrase('nPorts', stats.ports),
  });
  const bends = buildText('buildBends', { b90: countPhrase('bend90', stats.bends90), b45: countPhrase('bend45', stats.bends45) });
  return [summary, bends];
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Up to 2 room names, each cut to 20 characters (a cut name ends with '…'), then ', and {n} more'. */
function roomList(roomIds: readonly string[], names: RouteBuildNames): string {
  const shown = roomIds
    .slice(0, 2)
    .map((roomId) => {
      const name = names.room(roomId);
      return name.length > 20 ? `${name.slice(0, 19)}…` : name;
    })
    .join(', ');
  const more = roomIds.length - 2;
  return more > 0 ? `${shown}${buildText('moreRooms', { n: more })}` : shown;
}

function warningText(warning: RoutePlanWarning, names: RouteBuildNames): { text: string; hint: string } {
  const count = warning.count ?? warning.ids?.length ?? 0;
  const one = count === 1;
  const numberOf = (key: string): number => warning.numbers?.[key] ?? 0;
  const plain = (key: BuildTextKey): { text: string; hint: string } => ({ text: buildText(key), hint: '' });
  switch (warning.code) {
    case 'multi-page':
      return plain('w_multi-page');
    case 'no-calibration':
      return plain('w_no-calibration');
    case 'area-empty':
      return plain('w_area-empty');
    case 'gravity-not-routed':
      return plain('w_gravity-not-routed');
    case 'start-error':
      return plain('w_start-error');
    case 'foreign-start':
      return plain('w_foreign-start');
    case 'no-targets':
      return plain('w_no-targets');
    case 'start-unreachable':
      return plain('w_start-unreachable');
    case 'internal-join':
      return plain('w_internal-join');
    case 'free-angle':
      return { text: buildText(one ? 'w_free-angle_one' : 'w_free-angle', { count }), hint: '' };
    case 'wall-crossings':
      return { text: buildText(one ? 'w_wall-crossings_one' : 'w_wall-crossings', { count }), hint: buildText('hintFireWalls') };
    case 'shaft-crossing': {
      const room = roomList(warning.ids ?? [], names);
      const times = one ? buildText('nTimes_one') : buildText('nTimes', { n: count });
      return { text: buildText('w_shaft-crossing', { room, times }), hint: buildText('hintFireWalls') };
    }
    case 'room-off-graph': {
      const rooms = roomList(warning.ids ?? [], names);
      return { text: buildText(one ? 'w_room-off-graph_one' : 'w_room-off-graph', { count, rooms }), hint: '' };
    }
    case 'ports-left':
      return { text: buildText(one ? 'w_ports-left_one' : 'w_ports-left', { count }), hint: '' };
    case 'existing-crossings':
      return { text: buildText(one ? 'w_existing-crossings_one' : 'w_existing-crossings', { count }), hint: '' };
    case 'existing-overlap':
      return { text: buildText(one ? 'w_existing-overlap_one' : 'w_existing-overlap', { count }), hint: '' };
    case 'same-type-join':
      return plain('w_same-type-join');
    case 'short-leg':
      return { text: buildText(one ? 'w_short-leg_one' : 'w_short-leg', { count }), hint: '' };
    case 'capacity-over':
      return {
        text: buildText('w_capacity-over', { total: roundOne(numberOf('total')), cap: roundOne(numberOf('cap')), unit: names.unit }),
        hint: '',
      };
    case 'capacity-unit':
      return { text: buildText('w_capacity-unit', { total: roundOne(numberOf('total')), cap: roundOne(numberOf('cap')) }), hint: '' };
    case 'no-limits':
      return plain('w_no-limits');
    case 'removes-routed':
      return {
        text: buildText('buildRemove', { segments: countPhrase('nSegments', numberOf('segments')), fittings: countPhrase('nFittings', numberOf('fittings')) }),
        hint: '',
      };
    case 'extends-stub':
      return plain('buildExtends');
    case 'rooms-skipped':
      return { text: buildText(one ? 'w_rooms-skipped_one' : 'w_rooms-skipped', { count, rooms: roomList(warning.ids ?? [], names) }), hint: '' };
    case 'shares-lane':
      return { text: buildText(one ? 'w_shares-lane_one' : 'w_shares-lane', { count }), hint: '' };
    case 'hand-kept-size':
      return { text: buildText(one ? 'w_hand-kept-size_one' : 'w_hand-kept-size', { count }), hint: '' };
    case 'multi-port-stamps': {
      const [first] = warning.stamps ?? [];
      const name = first ? (names.stamp ? names.stamp(first.id) : first.id) : '';
      const entry = first ? `${name.length > 14 ? `${name.slice(0, 13)}…` : name} (port ${first.used} of ${first.open})` : '';
      const more = count - 1;
      const stamps = more > 0 ? `${entry}${buildText('moreRooms', { n: more })}` : entry;
      return { text: buildText(one ? 'w_multi-port-stamps_one' : 'w_multi-port-stamps', { stamps }), hint: '' };
    }
    case 'held-by-hand':
      return { text: buildText(one ? 'w_held-by-hand_one' : 'w_held-by-hand', { count }), hint: '' };
    case 'draft-2d':
      return plain('buildDraft');
  }
}

/** One line per warning, in the order of plan.warnings. */
export function routeBuildLines(plan: { warnings: readonly RoutePlanWarning[] }, names: RouteBuildNames): RouteBuildLine[] {
  return plan.warnings.map((warning): RouteBuildLine => {
    const { text, hint } = warningText(warning, names);
    return { code: warning.code, severity: warning.severity, text, hint };
  });
}

/** The English label of a severity: 'Error', 'Warning' or 'Note'. */
export function routeBuildSeverityLabel(severity: 'error' | 'warning' | 'info'): string {
  if (severity === 'error') return routeText('severityError');
  if (severity === 'warning') return routeText('severityWarning');
  return routeText('severityInfo');
}
