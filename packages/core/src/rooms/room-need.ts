// Needs (room-type-calculations.md §3.1): what a room requires, as one total in one unit. A room
// type holds one demand for each need it has (room-type.ts), and a placement rule serves one need.
// The built-in needs come with MepApp; own needs are the user's. Pure and headless.

/** The kind of a need sets its unit, the calculations it offers, and the units of a rule's capacity. */
export type NeedKind = 'light' | 'flow' | 'power' | 'count' | 'amount';

/** What one term of a demand grows with. 'volume' = air changes per hour; 'illuminance' = Em in lx. */
export type DemandBasis = 'room' | 'person' | 'area' | 'length' | 'volume' | 'illuminance';

export interface RoomNeed {
  /** A built-in id ('light', 'supplyAir', …) or the id of an own need. */
  id: string;
  name: string;
  nameNl?: string;
  kind: NeedKind;
  /** The unit of a total: 'lm', 'dm³/s', 'W', or the text of a count or amount need ('sockets', 'outlets'). */
  unit: string;
  /** A count need: the word for one ("socket"), for "1 socket per 5 m²". Absent = the unit. */
  unitOne?: string;
  /** True for a need of the user. */
  own?: boolean;
}

export const BUILT_IN_NEEDS: readonly RoomNeed[] = [
  { id: 'light', name: 'Light', nameNl: 'Verlichting', kind: 'light', unit: 'lm' },
  { id: 'supplyAir', name: 'Supply air', nameNl: 'Toevoerlucht', kind: 'flow', unit: 'dm³/s' },
  { id: 'returnAir', name: 'Return air', nameNl: 'Retourlucht', kind: 'flow', unit: 'dm³/s' },
  { id: 'heating', name: 'Heating', nameNl: 'Verwarming', kind: 'power', unit: 'W' },
  { id: 'cooling', name: 'Cooling', nameNl: 'Koeling', kind: 'power', unit: 'W' },
  { id: 'sockets', name: 'Sockets', nameNl: 'Wandcontactdozen', kind: 'count', unit: 'sockets', unitOne: 'socket' },
];

export const NEED_KIND_LABELS: Record<NeedKind, string> = {
  light: 'Light',
  flow: 'An air flow',
  power: 'A power',
  count: 'A number of things',
  amount: 'Another amount',
};

/** The kinds of an own need. Light is built in only. */
export const OWN_NEED_KINDS: readonly NeedKind[] = ['count', 'flow', 'power', 'amount'];

/** The unit of a total of each kind. Null = the user types it (count, amount). */
export const NEED_KIND_UNITS: Record<NeedKind, string | null> = { light: 'lm', flow: 'dm³/s', power: 'W', count: null, amount: null };

/** The bases that a kind offers, in the order of the calculation list. */
export const BASES_OF_KIND: Record<NeedKind, readonly DemandBasis[]> = {
  light: ['illuminance'],
  flow: ['person', 'area', 'room', 'volume'],
  power: ['area', 'room', 'person'],
  count: ['person', 'room', 'area', 'length'],
  amount: ['person', 'room', 'area', 'length'],
};

/** The bases that also offer "1 per N" in a count or amount need. */
export const EVERY_BASES: readonly DemandBasis[] = ['person', 'area', 'length'];

/** True when the kind offers "1 per N": a number of things or another amount. */
export const kindHasEvery = (kind: NeedKind): boolean => kind === 'count' || kind === 'amount';

const BUILT_IN_IDS = new Set(BUILT_IN_NEEDS.map((n) => n.id));

/** True for the id of a built-in need. */
export const isBuiltInNeedId = (id: string): boolean => BUILT_IN_IDS.has(id);

/** The built-in needs, then the own needs (an own need with a built-in id is left out). */
export function allNeeds(own: readonly RoomNeed[]): RoomNeed[] {
  return [...BUILT_IN_NEEDS, ...own.filter((n) => !BUILT_IN_IDS.has(n.id))];
}

/** The word for one of the need: "socket" for "1 socket per 5 m²". */
export const needUnitOne = (need: Pick<RoomNeed, 'unit' | 'unitOne'>): string => need.unitOne ?? need.unit;

/** Why the own need cannot be saved, or null when it can. `others` are the other needs, built-in and own. */
export function validateRoomNeed(need: RoomNeed, others: readonly RoomNeed[]): string | null {
  const name = need.name.trim();
  if (!name) return 'Enter a name.';
  if ([...BUILT_IN_NEEDS, ...others].some((n) => n.id !== need.id && n.name.trim().toLowerCase() === name.toLowerCase())) return `Another need is already called "${name}".`;
  if (!need.id || BUILT_IN_IDS.has(need.id)) return 'A built-in need cannot be changed.';
  if (!OWN_NEED_KINDS.includes(need.kind)) return 'Choose what the need is.';
  const unit = NEED_KIND_UNITS[need.kind];
  if (unit !== null ? need.unit !== unit : !need.unit.trim()) return 'Enter the unit.';
  return null;
}

/** Reads a stored or imported list of own needs. Unreadable entries, built-in ids and repeated ids are left out. Null when `raw` is not a list. */
export function parseRoomNeeds(raw: unknown): RoomNeed[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const needs: RoomNeed[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const v = entry as Record<string, unknown>;
    if (typeof v.id !== 'string' || !v.id || BUILT_IN_IDS.has(v.id) || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim()) continue;
    if (!OWN_NEED_KINDS.includes(v.kind as NeedKind)) continue;
    const kind = v.kind as NeedKind;
    const unit = NEED_KIND_UNITS[kind] ?? (typeof v.unit === 'string' ? v.unit.trim() : '');
    if (!unit) continue;
    const need: RoomNeed = { id: v.id, name: v.name, kind, unit, own: true };
    if (typeof v.nameNl === 'string' && v.nameNl) need.nameNl = v.nameNl;
    if (kindHasEvery(kind) && typeof v.unitOne === 'string' && v.unitOne.trim()) need.unitOne = v.unitOne.trim();
    ids.add(need.id);
    needs.push(need);
  }
  return needs;
}
