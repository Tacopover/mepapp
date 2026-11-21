import type { BuildingFile, NetworkType, Riser, RiserMember } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { risersOfNetwork, segmentRiserHint } from './riserSegmentHint.js';

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply air',
  discipline: 'ventilation',
  units: 'm³/h',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
  flowUnit: 'm³/h',
};

function fileWith(risers: Riser[]): BuildingFile {
  return { schemaVersion: 1, id: 'b1', name: 'Building', levels: [], sheets: [], risers };
}

function memberOf(sheetId: string, fittingId: string): RiserMember {
  return { levelId: 'l0', sheetId, pageIndex: 0, fittingId };
}

function riserOf(name: string, members: RiserMember[]): Riser {
  return {
    id: name,
    name,
    networkTypeId: vent.id,
    networkType: vent,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
  };
}

describe('risersOfNetwork', () => {
  it('returns the one riser with a member on the sheet and a fitting of the network', () => {
    const r1 = riserOf('R1', [memberOf('s0', 'a')]);
    const r2 = riserOf('R2', [memberOf('s0', 'b')]);
    expect(risersOfNetwork(fileWith([r1, r2]), 's0', ['a'])).toEqual([r1]);
  });

  it('returns two risers in file order', () => {
    const r1 = riserOf('R1', [memberOf('s0', 'a')]);
    const r2 = riserOf('R2', [memberOf('s0', 'b')]);
    expect(risersOfNetwork(fileWith([r1, r2]), 's0', ['b', 'a'])).toEqual([r1, r2]);
  });

  it('returns each riser once when two of its members match', () => {
    const r1 = riserOf('R1', [memberOf('s0', 'a'), memberOf('s0', 'b')]);
    expect(risersOfNetwork(fileWith([r1]), 's0', ['a', 'b'])).toEqual([r1]);
  });

  it('does not match a member on another sheet', () => {
    const r1 = riserOf('R1', [memberOf('s1', 'a')]);
    expect(risersOfNetwork(fileWith([r1]), 's0', ['a'])).toEqual([]);
  });

  it('does not match a fitting id that is not in the list', () => {
    const r1 = riserOf('R1', [memberOf('s0', 'a')]);
    expect(risersOfNetwork(fileWith([r1]), 's0', ['z'])).toEqual([]);
  });

  it('returns [] when the file has no risers', () => {
    expect(risersOfNetwork(fileWith([]), 's0', ['a'])).toEqual([]);
  });
});

describe('segmentRiserHint', () => {
  it('returns null for no name', () => {
    expect(segmentRiserHint([])).toBeNull();
  });

  it('names the one riser', () => {
    expect(segmentRiserHint(['R1'])).toBe('This segment is on the network of riser R1. Select the riser fitting to see the connected total.');
  });

  it('names the several risers', () => {
    expect(segmentRiserHint(['R1', 'R2'])).toBe('This segment is on the network of risers R1, R2. Select a riser fitting to see the connected total.');
  });
});
