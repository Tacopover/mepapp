import {
  BASES_OF_KIND,
  EVERY_BASES,
  kindHasEvery,
  needUnitOne,
  parseDecimal,
  type DemandBasis,
  type DemandResult,
  type DemandTerm,
  type NeedKind,
  type RoomDemand,
  type RoomNeed,
} from '@mepapp/core';

// The demands of a room type as text and as a draft (room-type-calculations.md §5.1): the short
// cell of the table, the calculation list of the editor, the result line of a room, and the text
// boxes of the editor.

/** A calculation of the editor list: a basis, with "1 per N" or not. */
export interface DemandCalc {
  basis: DemandBasis;
  every: boolean;
}

export const calcKey = (calc: DemandCalc): string => (calc.every ? `${calc.basis}:every` : calc.basis);

export function calcOfKey(key: string): DemandCalc {
  const [basis, every] = key.split(':');
  return { basis: basis as DemandBasis, every: every === 'every' };
}

/** The calculations that a kind offers, in list order: each basis, then its "1 per N". */
export function calcsOfKind(kind: NeedKind): DemandCalc[] {
  return BASES_OF_KIND[kind].flatMap((basis) => [{ basis, every: false }, ...(kindHasEvery(kind) && EVERY_BASES.includes(basis) ? [{ basis, every: true }] : [])]);
}

const BASIS_LABELS: Record<DemandBasis, string> = {
  person: 'per person',
  area: 'per m² floor area',
  room: 'per room',
  length: 'per m room length',
  volume: 'air changes per hour',
  illuminance: 'illuminance',
};

/** What "1 per N" counts: "1 socket per 15 m room length". */
export const EVERY_OF: Partial<Record<DemandBasis, string>> = { person: 'persons', area: 'm² floor area', length: 'm room length' };

export const calcLabel = (calc: DemandCalc): string => (calc.every ? `1 per N ${EVERY_OF[calc.basis]}` : BASIS_LABELS[calc.basis]);

/** A number as the card shows it. */
export const fmtNum = (n: number, digits = 3): string => n.toLocaleString('en', { maximumFractionDigits: digits });

/** A total: 2 decimals below 10, else 1. */
export const fmtTotal = (n: number): string => fmtNum(n, Math.abs(n) < 10 ? 2 : 1);

const plural = (n: number, word: string) => `${fmtNum(n)} ${word}${n === 1 ? '' : 's'}`;

function shortTerm(term: DemandTerm): string {
  if (term.every !== undefined) return `1 per ${fmtNum(term.every)} ${{ person: 'persons', area: 'm²', length: 'm' }[term.basis as 'person' | 'area' | 'length']}`;
  const n = fmtNum(term.value ?? 0);
  return { person: `${n}/person`, area: `${n}/m²`, room: `${n}/room`, length: `${n}/m`, volume: `${n} air changes/h`, illuminance: `${n} lx` }[term.basis];
}

/** The short text of a demand for a cell of the table: "6.5/person", "1 per 15 m", "0.5 air changes/h", "500 lx", with "≥ 7" for a minimum. */
export function demandShort(demand: RoomDemand): string {
  const terms = demand.terms.map(shortTerm).join(' + ');
  return demand.minimum !== undefined ? `${terms} ≥ ${fmtNum(demand.minimum)}` : terms;
}

/** The unit of a total in words: Light gives lm on the working plane. */
export const totalUnit = (need: Pick<RoomNeed, 'kind' | 'unit'>): string => (need.kind === 'light' ? 'lm on the working plane' : need.unit);

function partText(need: Pick<RoomNeed, 'unit' | 'unitOne'>, part: DemandResult['parts'][number]): string {
  const { term, base = 1 } = part;
  const value = term.value ?? 0;
  // The room values with 2 decimals, so the product of the shown numbers is close to the shown total.
  const of = { person: plural(base, 'person'), area: `${fmtNum(base, 2)} m²`, length: `${fmtNum(base, 2)} m`, volume: `${fmtNum(base, 2)} m³`, illuminance: `${fmtNum(base, 2)} m²`, room: '' }[term.basis];
  if (term.basis === 'room') return `${fmtTotal(value)} ${need.unit} per room`;
  if (term.every !== undefined) return `${of} ÷ ${fmtNum(term.every)}`;
  if (term.basis === 'volume') return `${fmtNum(value)} × ${of} = ${fmtNum(value * base, 1)} m³/h`;
  if (term.basis === 'illuminance') return `${fmtNum(value)} lx × ${of}`;
  return `${fmtNum(value)} × ${of}`;
}

/** The sum of a demand for one room, without the total: "6.5 × 3 persons + 0.7 × 32.5 m²". */
export function demandSumText(need: Pick<RoomNeed, 'unit' | 'unitOne'>, result: DemandResult): string {
  return result.parts.map((part) => partText(need, part)).join(' + ');
}

/** The text boxes of one term: the calculation key and the number as typed. */
export interface TermDraft {
  key: string;
  text: string;
}

/** The text boxes of one demand. `minimum` null = the "At least" row is closed. */
export interface DemandDraft {
  terms: TermDraft[];
  minimum: string | null;
  workingPlane: string;
}

const text = (n: number | undefined) => (n === undefined ? '' : String(n));

export function demandDraftOf(demand: RoomDemand): DemandDraft {
  return {
    terms: demand.terms.map((t) => ({ key: calcKey({ basis: t.basis, every: t.every !== undefined }), text: text(t.every ?? t.value) })),
    minimum: demand.minimum !== undefined ? String(demand.minimum) : null,
    workingPlane: text(demand.workingPlaneM),
  };
}

/** A new demand of the need: Light gets the illuminance, another need its first calculation. */
export function newDemandDraft(need: Pick<RoomNeed, 'kind'>): DemandDraft {
  return { terms: [{ key: calcKey(calcsOfKind(need.kind)[0]!), text: '' }], minimum: null, workingPlane: '' };
}

export class DemandTextError extends Error {}

/** A typed number; undefined for an empty box. Throws a DemandTextError for text that is not a number. */
function numberOf(value: string, label: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = parseDecimal(value.trim());
  if (parsed === null) throw new DemandTextError(`${label}: "${value.trim()}" is not a number.`);
  return parsed;
}

/** The demand of the boxes. An empty number box stays empty, so validateRoomTypeFields asks for it. Throws a DemandTextError for text that is not a number. */
export function demandOfDraft(need: Pick<RoomNeed, 'kind' | 'name'>, draft: DemandDraft): RoomDemand {
  const terms = draft.terms.map((t): DemandTerm => {
    const calc = calcOfKey(t.key);
    const value = numberOf(t.text, need.name);
    if (calc.every) return { basis: calc.basis, every: value ?? Number.NaN };
    return value === undefined ? { basis: calc.basis } : { basis: calc.basis, value };
  });
  const demand: RoomDemand = { terms };
  const minimum = draft.minimum !== null ? numberOf(draft.minimum, `${need.name}, at least`) : undefined;
  if (minimum !== undefined && need.kind !== 'light') demand.minimum = minimum;
  const workingPlane = numberOf(draft.workingPlane, `${need.name}, working plane`);
  if (workingPlane !== undefined && need.kind === 'light') demand.workingPlaneM = workingPlane;
  return demand;
}

/** "1 socket per", the words before the box of a "1 per N" term. */
export const everyBefore = (need: Pick<RoomNeed, 'unit' | 'unitOne'>): string => `1 ${needUnitOne(need)} per`;
