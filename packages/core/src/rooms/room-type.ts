// Room types (room-auto-placement.md Phase 1): what a room is used for, found from its name.
// The list lives in the user library; a project keeps a copy of the types its rooms use.
// Pure and headless.

import type { Room } from './room.js';

export interface RoomType {
  id: string;
  name: string;
  /** Dutch name, for the Dutch label language. */
  nameNl?: string;
  /** Lower-case keywords. See matchRoomType for how a keyword matches. */
  keywords: string[];
  /** Floor area per person, m². Used to calculate the number of people (Phase 2). Absent = no people. */
  areaPerPersonM2?: number;
}

/** Built-in room types: the starting user library. Dutch and English keywords, because most test drawings are Dutch. No design values: those differ per country. */
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
export function validateRoomTypeFields(fields: Pick<RoomType, 'name' | 'areaPerPersonM2'>, others: readonly RoomType[]): string | null {
  const name = fields.name.trim();
  if (!name) return 'Enter a name.';
  if (others.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) return `Another room type is already called "${name}".`;
  if (fields.areaPerPersonM2 !== undefined && !(Number.isFinite(fields.areaPerPersonM2) && fields.areaPerPersonM2 > 0)) return 'The area per person must be a number above 0.';
  return null;
}

function toRoomType(value: unknown): RoomType | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !Array.isArray(v.keywords)) return null;
  const type: RoomType = { id: v.id, name: v.name, keywords: v.keywords.filter((k): k is string => typeof k === 'string') };
  if (typeof v.nameNl === 'string' && v.nameNl) type.nameNl = v.nameNl;
  if (typeof v.areaPerPersonM2 === 'number' && Number.isFinite(v.areaPerPersonM2) && v.areaPerPersonM2 > 0) type.areaPerPersonM2 = v.areaPerPersonM2;
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
