// Room types (room-auto-placement.md Phase 1): what a room is used for, found from its name.
// The list lives in the user library; a project keeps a copy of the types its rooms use.
// A room type holds its demands: for each need, the calculation and its numbers
// (room-type-calculations.md §3.2). Pure and headless.

import type { Room } from './room.js';
import { BASES_OF_KIND, BUILT_IN_NEEDS, EVERY_BASES, kindHasEvery, type DemandBasis, type NeedKind, type RoomNeed } from './room-need.js';
import { M3H_PER_DM3S } from './placement-units.js';
import type { RoomValues } from './room-values.js';

/** One term of a demand. Exactly one of `value` and `every`. */
export interface DemandTerm {
  basis: DemandBasis;
  /** Per room, per person, per m² floor area, per m room length; air changes per hour (volume); Em in lx (illuminance). */
  value?: number;
  /** "1 per N": one unit of the need per N persons, m² or m. Count and amount needs; bases person, area and length. */
  every?: number;
}

/** What a room type needs of one need: the terms add up, then the minimum applies. */
export interface RoomDemand {
  /** 1 or more. Light: one illuminance term. */
  terms: DemandTerm[];
  /** The total is at least this, in the unit of the need. Not for Light. */
  minimum?: number;
  /** Light only: the working plane above the floor, m. Absent = 0.75 (DEFAULT_WORKING_PLANE_HEIGHT_M). */
  workingPlaneM?: number;
}

/** The demands of a room type, by need id. One demand for each need. */
export type RoomDemands = Record<string, RoomDemand>;

/**
 * The number fields of a room type before room-type-calculations.md (the library and project schema
 * 16), and the need and the term that each became (§3.5). The working-plane height
 * (workingPlaneHeightM) became `light.workingPlaneM`.
 */
const OLD_DEMAND_FIELDS: Readonly<Record<string, { needId: string; basis: DemandBasis }>> = {
  illuminanceLx: { needId: 'light', basis: 'illuminance' },
  supplyPerPersonDm3s: { needId: 'supplyAir', basis: 'person' },
  supplyPerM2Dm3s: { needId: 'supplyAir', basis: 'area' },
  exhaustFixedDm3s: { needId: 'returnAir', basis: 'room' },
  airChangesPerH: { needId: 'returnAir', basis: 'volume' },
  heatingLoadWm2: { needId: 'heating', basis: 'area' },
  coolingLoadWm2: { needId: 'cooling', basis: 'area' },
  socketsPerPerson: { needId: 'sockets', basis: 'person' },
  socketsFixed: { needId: 'sockets', basis: 'room' },
};

/** The need and the term of an old demand field, or undefined for another text. An old placement rule names these fields in `amount.from`. */
export const oldDemandFieldTerm = (key: string): { needId: string; basis: DemandBasis } | undefined =>
  Object.prototype.hasOwnProperty.call(OLD_DEMAND_FIELDS, key) ? OLD_DEMAND_FIELDS[key] : undefined;

const light = (lux: number, workingPlaneM: number): RoomDemand => ({ terms: [{ basis: 'illuminance', value: lux }], workingPlaneM });
const per = (basis: DemandBasis, value: number): RoomDemand => ({ terms: [{ basis, value }] });

/**
 * Example demands for some built-in room types (room-demands-research.md §8, and §1.4 and §2 for the
 * canteen, the entrance, the stairs and the changing room): Dutch new build, Bbl for the air,
 * NEN-EN 12464-1 for the light, design practice for the rest. Examples only: the user must check them
 * against the rules of the project. The area per person is included. Office: 5 m² per person for the
 * tests of the user (EN 16798-1 gives 10), so small offices get persons.
 */
export const ROOM_TYPE_DEMAND_EXAMPLES: Readonly<Record<string, { areaPerPersonM2?: number; demands: RoomDemands }>> = {
  office: { areaPerPersonM2: 5, demands: { light: light(500, 0.75), supplyAir: per('person', 6.5), heating: per('area', 40), cooling: per('area', 70), sockets: per('person', 4) } },
  meeting: { areaPerPersonM2: 2, demands: { light: light(500, 0.75), supplyAir: per('person', 6.5), heating: per('area', 40), cooling: per('area', 100), sockets: per('room', 6) } },
  classroom: { areaPerPersonM2: 2, demands: { light: light(500, 0.75), supplyAir: per('person', 8.5), heating: per('area', 40), cooling: per('area', 80), sockets: per('room', 8) } },
  corridor: { demands: { light: light(100, 0), heating: per('area', 30), sockets: { terms: [{ basis: 'length', every: 15 }] } } },
  toilet: { demands: { light: light(200, 0), returnAir: per('room', 7), heating: per('area', 40), sockets: per('room', 0) } },
  bathroom: { demands: { light: light(200, 0), returnAir: per('room', 14) } },
  storage: { demands: { light: light(100, 0), returnAir: per('volume', 0.5), heating: per('area', 20), sockets: per('room', 1) } },
  kitchen: { demands: { light: light(200, 0.85), returnAir: per('room', 21), heating: per('area', 30), cooling: per('area', 60), sockets: per('room', 8) } },
  technical: { demands: { light: light(200, 0), returnAir: per('volume', 2), heating: per('area', 0), sockets: per('room', 4) } },
  canteen: { areaPerPersonM2: 1.5, demands: { light: light(200, 0.75), supplyAir: per('person', 6.5), heating: per('area', 40), sockets: per('room', 4) } },
  entrance: { demands: { light: light(100, 0), heating: per('area', 30) } },
  stairs: { demands: { light: light(100, 0) } },
  changing: { demands: { light: light(200, 0), heating: per('area', 40) } },
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
  /** What a room of this type needs, by need id. Absent = no demands. */
  demands?: RoomDemands;
}

/** True when the term works with the kind of the need: a calculation that the kind offers, and "1 per N" only for a count or amount need. */
export const termFitsKind = (term: DemandTerm, kind: NeedKind): boolean =>
  BASES_OF_KIND[kind].includes(term.basis) && (term.every === undefined || (kindHasEvery(kind) && EVERY_BASES.includes(term.basis)));

/** A copy of the demands that shares no object with them. */
export const copyRoomDemands = (demands: RoomDemands): RoomDemands =>
  Object.fromEntries(Object.entries(demands).map(([id, d]) => [id, { ...d, terms: d.terms.map((t) => ({ ...t })) }]));

/** Why a room value is missing for a demand: the page has no scale, or the room has no number of persons. 'notFit': a term does not work with the need. */
export type DemandProblem = 'noCalibration' | 'noPeople' | 'notFit';

export interface DemandPart {
  term: DemandTerm;
  /** The room value that the term uses: persons, m² (also Light), m or m³. Absent for 'room'. */
  base?: number;
  /** What the term adds to the total, in the unit of the need. */
  amount: number;
}

export interface DemandResult {
  /** The total in the unit of the need (Light: lm on the working plane). Null when a room value is missing or a term does not fit the need. */
  total: number | null;
  parts: DemandPart[];
  /** True when the minimum raised the total. */
  minimumApplied: boolean;
  problems: DemandProblem[];
}

/**
 * The total of one demand for one room: the terms add up, then the total is at least the minimum.
 * A term multiplies its number by the room value (per room: by 1), or "1 per N" divides the room
 * value by N. Air changes: n × volume gives m³/h, converted to dm³/s. Light: Em × floor area, in lm.
 */
export function demandTotal(need: Pick<RoomNeed, 'kind'>, demand: RoomDemand, values: Pick<RoomValues, 'areaM2' | 'lengthM' | 'volumeM3' | 'people'>): DemandResult {
  const parts: DemandPart[] = [];
  const problems: DemandProblem[] = [];
  const problem = (p: DemandProblem) => {
    if (!problems.includes(p)) problems.push(p);
  };
  for (const term of demand.terms) {
    if (!termFitsKind(term, need.kind)) {
      problem('notFit');
      continue;
    }
    const base =
      term.basis === 'room' ? 1 : term.basis === 'person' ? (values.people?.count ?? null) : term.basis === 'length' ? values.lengthM : term.basis === 'volume' ? values.volumeM3 : values.areaM2;
    if (base === null) {
      problem(term.basis === 'person' ? 'noPeople' : 'noCalibration');
      continue;
    }
    let amount = term.every !== undefined ? base / term.every : (term.value ?? 0) * base;
    if (term.basis === 'volume') amount /= M3H_PER_DM3S;
    parts.push(term.basis === 'room' ? { term, amount } : { term, base, amount });
  }
  if (problems.length > 0) return { total: null, parts, minimumApplied: false, problems };
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  const minimumApplied = need.kind !== 'light' && demand.minimum !== undefined && sum < demand.minimum;
  return { total: minimumApplied ? demand.minimum! : sum, parts, minimumApplied, problems };
}

/** A term of 0 adds nothing: it goes when the demand has another term. A demand of only 0 keeps one term, because it says "needs none". */
function withoutZeroTerms(terms: DemandTerm[]): DemandTerm[] {
  const kept = terms.filter((t) => t.every !== undefined || t.value !== 0);
  return kept.length > 0 ? kept : terms.slice(0, 1);
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

/** Why the demand cannot be saved, or null when it can. The text follows the name of the need. */
function demandProblem(need: RoomNeed, demand: RoomDemand): string | null {
  const isLight = need.kind === 'light';
  if (demand.terms.length === 0) return 'enter a number, or remove the demand.';
  if (isLight && demand.terms.length > 1) return 'enter one illuminance.';
  for (const term of demand.terms) {
    if (!termFitsKind(term, need.kind)) return 'a calculation does not work with this demand type.';
    if (term.every !== undefined) {
      if (!(Number.isFinite(term.every) && term.every > 0) || term.value !== undefined) return '"1 per N" needs an N above 0.';
    } else if (term.value === undefined) return 'enter a number in each term.';
    else if (!isDemandValue(term.value)) return 'each number must be 0 or more.';
  }
  if (demand.minimum !== undefined && (isLight || !isDemandValue(demand.minimum))) return isLight ? 'Light has no minimum.' : 'the minimum must be a number of 0 or more.';
  if (demand.workingPlaneM !== undefined && (!isLight || !isDemandValue(demand.workingPlaneM))) return isLight ? 'the working-plane height must be a number of 0 or more.' : 'only Light has a working plane.';
  return null;
}

/** Why the fields cannot be saved, or null when they can. `others` are the other types of the list; `needs` are the needs that the demands can use. */
export function validateRoomTypeFields(fields: Pick<RoomType, 'name' | 'areaPerPersonM2' | 'demands'>, others: readonly RoomType[], needs: readonly RoomNeed[] = BUILT_IN_NEEDS): string | null {
  const name = fields.name.trim();
  if (!name) return 'Enter a name.';
  if (others.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) return `Another room type is already called "${name}".`;
  if (fields.areaPerPersonM2 !== undefined && !(Number.isFinite(fields.areaPerPersonM2) && fields.areaPerPersonM2 > 0)) return 'The area per person must be a number above 0.';
  for (const [needId, demand] of Object.entries(fields.demands ?? {})) {
    const need = needs.find((n) => n.id === needId);
    if (!need) return 'A demand uses a demand type that does not exist.';
    const problem = demandProblem(need, demand);
    if (problem) return `${need.name}: ${problem}`;
  }
  return null;
}

const isDemandValue = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

const DEMAND_BASES: readonly DemandBasis[] = ['room', 'person', 'area', 'length', 'volume', 'illuminance'];

function toDemandTerm(value: unknown): DemandTerm | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!DEMAND_BASES.includes(v.basis as DemandBasis)) return null;
  const basis = v.basis as DemandBasis;
  if (v.every === undefined) return isDemandValue(v.value) ? { basis, value: v.value } : null;
  return v.value === undefined && EVERY_BASES.includes(basis) && typeof v.every === 'number' && Number.isFinite(v.every) && v.every > 0 ? { basis, every: v.every } : null;
}

/** One stored demand of the new shape. A term that does not fit a built-in need is left out. Null when no term is left. */
function toRoomDemand(needId: string, value: unknown): RoomDemand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const kind = BUILT_IN_NEEDS.find((n) => n.id === needId)?.kind;
  const terms = (Array.isArray(v.terms) ? v.terms : [])
    .map(toDemandTerm)
    .filter((t): t is DemandTerm => t !== null && (kind === undefined ? t.basis !== 'illuminance' : termFitsKind(t, kind)));
  if (terms.length === 0) return null;
  if (kind === 'light') return { terms: terms.slice(0, 1), ...(isDemandValue(v.workingPlaneM) ? { workingPlaneM: v.workingPlaneM } : {}) };
  return { terms, ...(isDemandValue(v.minimum) ? { minimum: v.minimum } : {}) };
}

/**
 * The demands of a stored room type, in the new shape (room-type-calculations.md §3.5). The old
 * number fields become terms of their need: a term of 0 goes when the demand has another term,
 * and a working-plane height without an illuminance goes. Null when no demand is left.
 */
export function parseRoomDemands(raw: unknown): RoomDemands | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const demands: RoomDemands = {};
  for (const [key, field] of Object.entries(OLD_DEMAND_FIELDS)) {
    const value = v[key];
    if (isDemandValue(value)) (demands[field.needId] ??= { terms: [] }).terms.push({ basis: field.basis, value });
  }
  for (const demand of Object.values(demands)) demand.terms = withoutZeroTerms(demand.terms);
  if (demands.light && isDemandValue(v.workingPlaneHeightM)) demands.light.workingPlaneM = v.workingPlaneHeightM;
  for (const [needId, value] of Object.entries(v)) {
    if (needId === '__proto__' || needId === 'workingPlaneHeightM' || Object.prototype.hasOwnProperty.call(OLD_DEMAND_FIELDS, needId)) continue;
    const demand = toRoomDemand(needId, value);
    if (demand) demands[needId] = demand;
  }
  return Object.keys(demands).length > 0 ? demands : null;
}

function toRoomType(value: unknown): RoomType | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !Array.isArray(v.keywords)) return null;
  const type: RoomType = { id: v.id, name: v.name, keywords: v.keywords.filter((k): k is string => typeof k === 'string') };
  if (typeof v.nameNl === 'string' && v.nameNl) type.nameNl = v.nameNl;
  if (typeof v.areaPerPersonM2 === 'number' && Number.isFinite(v.areaPerPersonM2) && v.areaPerPersonM2 > 0) type.areaPerPersonM2 = v.areaPerPersonM2;
  const demands = parseRoomDemands(v.demands);
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
