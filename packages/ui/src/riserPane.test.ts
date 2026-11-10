import type { BuildingFile, BuildingLevel, NetworkType, Riser, RiserMember } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { nextSelection, orderedRisers, parseMm } from './components/BuildingRisersPane.js';

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply air',
  discipline: 'ventilation',
  units: 'CFM',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
};

const drain: NetworkType = {
  id: 'drain',
  name: 'Drainage',
  discipline: 'plumbing',
  units: 'l/s',
  defaultCapacity: 1,
  color: '#795548',
  lineWidthPt: 1,
  linePattern: 'dashed',
};

const levels: BuildingLevel[] = [
  { id: 'l0', name: 'Basement', elevationMm: 0 },
  { id: 'l1', name: 'Level 1', elevationMm: 3000 },
  { id: 'l2', name: 'Level 2', elevationMm: 6000 },
];

function member(index: number): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId: 'f' };
}

function makeRiser(id: string, name: string, networkType: NetworkType, members: RiserMember[]): Riser {
  return {
    id,
    name,
    networkTypeId: networkType.id,
    networkType,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
  };
}

function fileWith(risers: Riser[]): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels,
    sheets: levels.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: `uuid-${index}`,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

describe('orderedRisers', () => {
  it('orders by type name, then by the number at the end of the name', () => {
    const file = fileWith([
      makeRiser('a', 'Supply air riser 10', vent, [member(0)]),
      makeRiser('b', 'Drainage riser 2', drain, [member(0)]),
      makeRiser('c', 'Supply air riser 2', vent, [member(0)]),
    ]);
    expect(orderedRisers(file, new Set()).map((riser) => riser.id)).toEqual(['b', 'c', 'a']);
  });

  it('leaves out the risers of hidden types', () => {
    const file = fileWith([
      makeRiser('a', 'Supply air riser 1', vent, [member(0)]),
      makeRiser('b', 'Drainage riser 1', drain, [member(0)]),
    ]);
    expect(orderedRisers(file, new Set(['drain'])).map((riser) => riser.id)).toEqual(['a']);
  });

  it('returns no riser when every type is hidden', () => {
    const file = fileWith([makeRiser('a', 'Supply air riser 1', vent, [member(0)])]);
    expect(orderedRisers(file, new Set(['vent']))).toEqual([]);
  });

  it('keeps a riser without a lane at the end', () => {
    const file = fileWith([
      makeRiser('gone', 'Supply air riser 1', vent, [{ levelId: 'missing', sheetId: 'x', pageIndex: 0, fittingId: 'f' }]),
      makeRiser('a', 'Supply air riser 2', vent, [member(0)]),
    ]);
    expect(orderedRisers(file, new Set()).map((riser) => riser.id)).toEqual(['a', 'gone']);
  });
});

describe('nextSelection', () => {
  it('keeps the current riser while it is still shown', () => {
    expect(nextSelection(['a', 'b'], 'b', ['a', 'b', 'c'])).toBe('b');
  });

  it('takes the riser at the same index when the current riser is gone', () => {
    expect(nextSelection(['a', 'c'], 'b', ['a', 'b', 'c'])).toBe('c');
  });

  it('takes the last riser when the old index is past the end', () => {
    expect(nextSelection(['a'], 'c', ['a', 'b', 'c'])).toBe('a');
    expect(nextSelection(['a', 'b'], 'c', ['a', 'b', 'c'])).toBe('b');
  });

  it('takes the first riser when there is no current riser', () => {
    expect(nextSelection(['a', 'b'], null, [])).toBe('a');
  });

  it('returns null when the list is empty', () => {
    expect(nextSelection([], 'a', ['a'])).toBeNull();
  });
});

describe('parseMm', () => {
  it('returns undefined for an empty text', () => {
    expect(parseMm('')).toBeUndefined();
    expect(parseMm('   ')).toBeUndefined();
  });

  it('returns the number for a finite value of 0 or more', () => {
    expect(parseMm('0')).toBe(0);
    expect(parseMm(' 250 ')).toBe(250);
    expect(parseMm('12.5')).toBe(12.5);
  });

  it('returns invalid for a negative, a non-number or an infinite value', () => {
    expect(parseMm('-1')).toBe('invalid');
    expect(parseMm('abc')).toBe('invalid');
    expect(parseMm('Infinity')).toBe('invalid');
    expect(parseMm('NaN')).toBe('invalid');
  });
});
