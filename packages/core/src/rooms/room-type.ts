// Room types (room-auto-placement.md Phase 1): what a room is used for, found from its name.
// The list lives in the user library; a project keeps a copy of the types its rooms use.
// Pure and headless.

import type { Room } from './room.js';

/** The demands of a room type that a placement rule can use (room-placement-followup.md Phase F). */
export type RoomDemandKey =
  | 'illuminanceLx'
  | 'workingPlaneHeightM'
  | 'supplyPerPersonDm3s'
  | 'supplyPerM2Dm3s'
  | 'exhaustFixedDm3s'
  | 'airChangesPerH'
  | 'heatingLoadWm2'
  | 'coolingLoadWm2'
  | 'socketsPerPerson'
  | 'socketsFixed';

/** What a room type needs, independent of the product. Each value is a number of 0 or more. Absent = not known. */
export type RoomDemands = Partial<Record<RoomDemandKey, number>>;

/** The kind of a demand sets the units it works with: a flow (dm³/s) converts to each flow unit, a power (W) to W and kW, a count to any other unit. */
export type RoomDemandKind = 'illuminance' | 'height' | 'flow' | 'airChanges' | 'power' | 'count';

/** The amount term of a placement rule that a demand fills. 'lighting' = the lumen method. */
export type RoomDemandTerm = 'fixed' | 'perM2' | 'perPerson' | 'perM3' | 'lighting';

export interface RoomDemandField {
  key: RoomDemandKey;
  label: string;
  unit: string;
  kind: RoomDemandKind;
  term: RoomDemandTerm;
}

export const ROOM_DEMAND_FIELDS: readonly RoomDemandField[] = [
  { key: 'illuminanceLx', label: 'Illuminance (Em)', unit: 'lx', kind: 'illuminance', term: 'lighting' },
  { key: 'workingPlaneHeightM', label: 'Working-plane height', unit: 'm', kind: 'height', term: 'lighting' },
  { key: 'supplyPerPersonDm3s', label: 'Supply air per person', unit: 'dm³/s per person', kind: 'flow', term: 'perPerson' },
  { key: 'supplyPerM2Dm3s', label: 'Supply air per m²', unit: 'dm³/s per m²', kind: 'flow', term: 'perM2' },
  { key: 'exhaustFixedDm3s', label: 'Exhaust air per room', unit: 'dm³/s', kind: 'flow', term: 'fixed' },
  { key: 'airChangesPerH', label: 'Air changes', unit: 'per hour', kind: 'airChanges', term: 'perM3' },
  { key: 'heatingLoadWm2', label: 'Heating load', unit: 'W/m²', kind: 'power', term: 'perM2' },
  { key: 'coolingLoadWm2', label: 'Cooling load', unit: 'W/m²', kind: 'power', term: 'perM2' },
  { key: 'socketsPerPerson', label: 'Sockets per person', unit: 'per person', kind: 'count', term: 'perPerson' },
  { key: 'socketsFixed', label: 'Sockets per room', unit: 'per room', kind: 'count', term: 'fixed' },
];

/**
 * Example demands for some built-in room types (room-demands-research.md §8): Dutch new build, Bbl
 * for the air, NEN-EN 12464-1 for the light, design practice for the rest. Examples only: the user
 * must check them against the rules of the project. The area per person is included.
 */
export const ROOM_TYPE_DEMAND_EXAMPLES: Readonly<Record<string, { areaPerPersonM2?: number; demands: RoomDemands }>> = {
  office: { areaPerPersonM2: 10, demands: { illuminanceLx: 500, workingPlaneHeightM: 0.75, supplyPerPersonDm3s: 6.5, supplyPerM2Dm3s: 0, heatingLoadWm2: 40, coolingLoadWm2: 70, socketsPerPerson: 4 } },
  meeting: { areaPerPersonM2: 2, demands: { illuminanceLx: 500, workingPlaneHeightM: 0.75, supplyPerPersonDm3s: 6.5, supplyPerM2Dm3s: 0, heatingLoadWm2: 40, coolingLoadWm2: 100, socketsFixed: 6 } },
  classroom: { areaPerPersonM2: 2, demands: { illuminanceLx: 500, workingPlaneHeightM: 0.75, supplyPerPersonDm3s: 8.5, supplyPerM2Dm3s: 0, heatingLoadWm2: 40, coolingLoadWm2: 80, socketsFixed: 8 } },
  corridor: { demands: { illuminanceLx: 100, workingPlaneHeightM: 0, heatingLoadWm2: 30 } },
  toilet: { demands: { illuminanceLx: 200, workingPlaneHeightM: 0, exhaustFixedDm3s: 7, heatingLoadWm2: 40, socketsFixed: 0 } },
  bathroom: { demands: { illuminanceLx: 200, workingPlaneHeightM: 0, exhaustFixedDm3s: 14 } },
  storage: { demands: { illuminanceLx: 100, workingPlaneHeightM: 0, airChangesPerH: 0.5, heatingLoadWm2: 20, socketsFixed: 1 } },
  kitchen: { demands: { illuminanceLx: 200, workingPlaneHeightM: 0.85, exhaustFixedDm3s: 21, heatingLoadWm2: 30, coolingLoadWm2: 60, socketsFixed: 8 } },
  technical: { demands: { illuminanceLx: 200, workingPlaneHeightM: 0, airChangesPerH: 2, heatingLoadWm2: 0, socketsFixed: 4 } },
};

export interface RoomType {
  id: string;
  name: string;
  /** Dutch name, for the Dutch label language. */
  nameNl?: string;
  /** Lower-case keywords. See matchRoomType for how a keyword matches. */
  keywords: string[];
  /** Floor area per person, m². Used to calculate the number of people (Phase 2). Absent = no people. */
  areaPerPersonM2?: number;
  /** What a room of this type needs. Absent = no demands. */
  demands?: RoomDemands;
}

/** Built-in room types: the starting user library. Dutch and English keywords, because most test drawings are Dutch. No design values: those differ per country (see ROOM_TYPE_DEMAND_EXAMPLES). */
export const ROOM_TYPE_LIBRARY: RoomType[] = [
  { id: 'office', name: 'Office', nameNl: 'Kantoor', keywords: ['kantoor', 'werkplek', 'werkplekken', 'concentratie', 'belplek', 'studielandschap', 'office', 'workplace'] },
  { id: 'meeting', name: 'Meeting room', nameNl: 'Vergaderruimte', keywords: ['vergader', 'overleg', 'brainstorm', 'spreekkamer', 'meeting'] },
  { id: 'classroom', name: 'Classroom', nameNl: 'Lokaal', keywords: ['lokaal', 'onderwijs', 'groepsruimte', 'collegezaal', 'vloerzaal', 'classroom'] },
  { id: 'corridor', name: 'Corridor', nameNl: 'Gang', keywords: ['gang', 'circulatie', 'verkeersruimte', 'beddenroute', 'corridor'] },
  { id: 'entrance', name: 'Entrance and hall', nameNl: 'Entree en hal', keywords: ['entree', 'ingang', 'hal', 'lifthal', 'tochtsluis', 'ontvangst', 'lobby', 'entrance', 'foyer'] },
  { id: 'stairs', name: 'Stairs', nameNl: 'Trappenhuis', keywords: ['trappenhuis', 'trap', 'stair', 'stairs'] },
  { id: 'lift', name: 'Lift', nameNl: 'Lift', keywords: ['lift', 'elevator'] },
  { id: 'toilet', name: 'Toilet', nameNl: 'Toilet', keywords: ['toilet', 'toiletten', 'wc', 'miva', 'sanitair'] },
  { id: 'bathroom', name: 'Bathroom', nameNl: 'Badkamer', keywords: ['badkamer', 'douche', 'bathroom', 'shower'] },
  { id: 'kitchen', name: 'Kitchen and pantry', nameNl: 'Keuken en pantry', keywords: ['keuken', 'pantry', 'uitgifte', 'kitchen'] },
  { id: 'canteen', name: 'Canteen', nameNl: 'Kantine', keywords: ['kantine', 'ontmoeting', 'horeca', 'restaurant', 'canteen'] },
  { id: 'storage', name: 'Storage', nameNl: 'Berging en opslag', keywords: ['berging', 'opslag', 'archief', 'storage'] },
  { id: 'cleaning', name: 'Cleaning cupboard', nameNl: 'Werkkast', keywords: ['werkkast', 'schoonmaak', 'janitor'] },
  { id: 'waste', name: 'Waste room', nameNl: 'Afvalruimte', keywords: ['afval', 'waste'] },
  { id: 'technical', name: 'Technical room', nameNl: 'Technische ruimte', keywords: ['techniek', 'technisch', 'technische', 'installatie', 'server', 'mer', 'ser', 'invoerkast', 'spanningsruimte', 'laagspanning', 'middenspanning', 'sprinkler', 'nsa', 'gasblus', 'watermeter', 'technical', 'plant'] },
  { id: 'shaft', name: 'Shaft', nameNl: 'Schacht', keywords: ['schacht', 'plenum', 'shaft'] },
  { id: 'meter-cupboard', name: 'Meter cupboard', nameNl: 'Meterkast', keywords: ['meterkast'] },
  { id: 'changing', name: 'Changing room', nameNl: 'Kleedruimte', keywords: ['kleedruimte', 'kleedkamer', 'garderobe', 'locker', 'lockers', 'changing'] },
  { id: 'living', name: 'Living room', nameNl: 'Woonkamer', keywords: ['woonkamer', 'living'] },
  { id: 'bedroom', name: 'Bedroom', nameNl: 'Slaapkamer', keywords: ['slaapkamer', 'bedroom'] },
];

/** Lower case, accents removed, split into words of letters and digits. */
export function roomTextWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/** Keywords of 3 characters or less must be a whole word; "mer" must not match "kamer". */
const SHORT_KEYWORD = 3;

/**
 * Where the keyword matches in `words`, as a word index, or -1. A keyword of one word matches
 * a word that starts or ends with it, so Dutch compounds match: "toilet" matches "toiletruimte"
 * and "trappenhuis" matches "vluchttrappenhuis", but "server" does not match "reservering".
 * A short keyword (3 characters or less) must be the whole word. A keyword of several words
 * matches those words in a row, each as a whole word.
 */
function keywordPosition(keyword: string, words: readonly string[]): number {
  const parts = roomTextWords(keyword);
  if (parts.length === 0) return -1;
  if (parts.length > 1) {
    for (let i = 0; i + parts.length <= words.length; i++) if (parts.every((p, k) => words[i + k] === p)) return i;
    return -1;
  }
  const kw = parts[0]!;
  return words.findIndex((w) => (kw.length <= SHORT_KEYWORD ? w === kw : w.startsWith(kw) || w.endsWith(kw)));
}

function bestMatch(text: string, types: readonly RoomType[]): RoomType | null {
  const words = roomTextWords(text);
  if (words.length === 0) return null;
  let best: { type: RoomType; length: number; position: number } | null = null;
  for (const type of types) {
    for (const keyword of type.keywords) {
      const position = keywordPosition(keyword, words);
      if (position < 0) continue;
      const length = keyword.trim().length;
      if (!best || position < best.position || (position === best.position && length > best.length)) best = { type, length, position };
    }
  }
  return best?.type ?? null;
}

/**
 * The room type whose keyword matches the room name; when nothing matches the name, the
 * label details (for example the function group "Toiletten"). The keyword that matches the
 * earliest word wins, because the first word usually says what the room is ("Opslag
 * onderwijsmateriaal" is storage). In the same word the longest keyword wins ("lifthal" is a
 * hall, not a lift), then the type that comes first in `types`. Null when nothing matches.
 */
export function matchRoomType(name: string | null, details: readonly string[] | undefined, types: readonly RoomType[]): RoomType | null {
  return bestMatch(name ?? '', types) ?? bestMatch((details ?? []).join(' '), types);
}

/** The room with the type that name matching gives. A type the user chose (roomTypeSource 'user') stays. Returns the same object when nothing changes. */
export function applyRoomTypeMatch<T extends Pick<Room, 'name' | 'details' | 'roomTypeId' | 'roomTypeSource'>>(room: T, types: readonly RoomType[]): T {
  if (room.roomTypeSource === 'user') return room;
  const id = matchRoomType(room.name, room.details, types)?.id;
  if (id === room.roomTypeId && (id === undefined || room.roomTypeSource === 'matched')) return room;
  const next = { ...room };
  if (id === undefined) {
    delete next.roomTypeId;
    delete next.roomTypeSource;
  } else {
    next.roomTypeId = id;
    next.roomTypeSource = 'matched';
  }
  return next;
}

/** A keyword list as the user types it: comma or line separated, trimmed, lower case, no empty or double entries. */
export function parseRoomTypeKeywords(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[,\n;]/)) {
    const keyword = part.trim().toLowerCase().replace(/\s+/g, ' ');
    if (keyword) seen.add(keyword);
  }
  return [...seen];
}

/** Why the fields cannot be saved, or null when they can. `others` are the other types of the list. */
export function validateRoomTypeFields(fields: Pick<RoomType, 'name' | 'areaPerPersonM2' | 'demands'>, others: readonly RoomType[]): string | null {
  const name = fields.name.trim();
  if (!name) return 'Enter a name.';
  if (others.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) return `Another room type is already called "${name}".`;
  if (fields.areaPerPersonM2 !== undefined && !(Number.isFinite(fields.areaPerPersonM2) && fields.areaPerPersonM2 > 0)) return 'The area per person must be a number above 0.';
  for (const field of ROOM_DEMAND_FIELDS) {
    const value = fields.demands?.[field.key];
    if (value !== undefined && !isDemandValue(value)) return `${field.label} must be a number of 0 or more.`;
  }
  return null;
}

const isDemandValue = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** The demands of a stored room type: known keys with a number of 0 or more. Null when none is left. */
function toRoomDemands(value: unknown): RoomDemands | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const demands: RoomDemands = {};
  for (const field of ROOM_DEMAND_FIELDS) if (isDemandValue(v[field.key])) demands[field.key] = v[field.key] as number;
  return Object.keys(demands).length > 0 ? demands : null;
}

function toRoomType(value: unknown): RoomType | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !Array.isArray(v.keywords)) return null;
  const type: RoomType = { id: v.id, name: v.name, keywords: v.keywords.filter((k): k is string => typeof k === 'string') };
  if (typeof v.nameNl === 'string' && v.nameNl) type.nameNl = v.nameNl;
  if (typeof v.areaPerPersonM2 === 'number' && Number.isFinite(v.areaPerPersonM2) && v.areaPerPersonM2 > 0) type.areaPerPersonM2 = v.areaPerPersonM2;
  const demands = toRoomDemands(v.demands);
  if (demands) type.demands = demands;
  return type;
}

/** Reads a stored or imported list of room types. Unreadable entries and repeated ids are left out. Null when `raw` is not a list. */
export function parseRoomTypes(raw: unknown): RoomType[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const types: RoomType[] = [];
  for (const entry of raw) {
    const type = toRoomType(entry);
    if (!type || ids.has(type.id)) continue;
    ids.add(type.id);
    types.push(type);
  }
  return types;
}

/** The name to show in the label language. */
export function roomTypeLabel(type: RoomType, language: 'en' | 'nl' = 'en'): string {
  return language === 'nl' && type.nameNl ? type.nameNl : type.name;
}
