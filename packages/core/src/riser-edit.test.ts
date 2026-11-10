import { describe, expect, it } from 'vitest';
import { calibrationFromScale } from './calibration.js';
import type { BuildingFile } from './building.js';
import type { NetworkType } from './network.js';
import type { Riser, RiserMember } from './riser.js';
import {
  attachMember,
  clearRiserFlowOverride,
  deleteRiser,
  detachMember,
  makeRiser,
  moveRiser,
  nextRiserLabel,
  setMemberConnectionHeight,
  setRiserProps,
  takePendingOps,
  type PageFrame,
  type RiserError,
} from './riser-edit.js';

const ppmm = calibrationFromScale(100).pageUnitsPerRealUnit;
const frame: PageFrame = { widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: ppmm };

const vent: NetworkType = {
  id: 'vent',
  name: 'Supply',
  discipline: 'ventilation',
  units: 'CFM',
  defaultCapacity: 100,
  color: '#2196f3',
  lineWidthPt: 1,
  linePattern: 'solid',
};

const water: NetworkType = { ...vent, id: 'water', name: 'Cold water', discipline: 'plumbing' };

function baseFile(): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: [
      { id: 'l0', name: 'Basement', elevationMm: 0 },
      { id: 'l1', name: 'Ground', elevationMm: 3000 },
      { id: 'l2', name: 'First', elevationMm: 6000 },
    ],
    sheets: [0, 1, 2].map((index) => ({
      id: `s${index}`,
      levelId: `l${index}`,
      projectUuid: null,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers: [],
  };
}

function ok<T>(value: T | RiserError): T {
  if (typeof value === 'string') throw new Error(`unexpected riser error ${value}`);
  return value;
}

function riserOf(file: BuildingFile, riserId: string): Riser {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) throw new Error(`no riser ${riserId}`);
  return riser;
}

function member(levelIndex: number): RiserMember {
  return { levelId: `l${levelIndex}`, sheetId: `s${levelIndex}`, pageIndex: 0, fittingId: `f${levelIndex}` };
}

function fileWithRiser(): BuildingFile {
  return ok(
    makeRiser(baseFile(), {
      id: 'r1',
      name: 'R1',
      networkType: vent,
      sheetId: 's0',
      fittingId: 'f0',
      fittingPt: { x: 0, y: 842 },
      frame,
    }),
  );
}

describe('makeRiser', () => {
  it('places the anchor from the point and takes the level and page of the sheet', () => {
    const file = ok(
      makeRiser(baseFile(), {
        id: 'r1',
        name: 'R1',
        networkType: vent,
        sheetId: 's1',
        fittingId: 'f1',
        fittingPt: { x: 0, y: 842 },
        frame,
      }),
    );
    const riser = riserOf(file, 'r1');
    expect(riser.anchorMm).toEqual({ xMm: 0, yMm: 0 });
    expect(riser.members).toEqual([{ levelId: 'l1', sheetId: 's1', pageIndex: 0, fittingId: 'f1' }]);
    expect(riser.flow).toBe('unknown');
    expect(riser.topEnd).toBe('member');
    expect(riser.bottomEnd).toBe('member');
    expect(riser.endAllowanceMm).toBe(0);
    expect(riser.pending).toEqual([]);
    expect(riser.networkTypeId).toBe('vent');
    expect(riser.networkType).toEqual(vent);
  });

  it('gives a large y for a point at the top of the page', () => {
    const file = ok(
      makeRiser(baseFile(), {
        id: 'r1',
        name: 'R1',
        networkType: vent,
        sheetId: 's0',
        fittingId: 'f0',
        fittingPt: { x: 0, y: 0 },
        frame,
      }),
    );
    expect(riserOf(file, 'r1').anchorMm.yMm).toBeGreaterThan(20000);
  });

  it('refuses a page without a scale', () => {
    const args = { id: 'r1', name: 'R1', networkType: vent, sheetId: 's0', fittingId: 'f0', fittingPt: { x: 0, y: 842 } };
    expect(makeRiser(baseFile(), { ...args, frame: { ...frame, pageUnitsPerRealUnit: null } })).toBe('scale-unknown');
    expect(makeRiser(baseFile(), { ...args, frame: { ...frame, pageUnitsPerRealUnit: 0 } })).toBe('scale-unknown');
  });

  it('refuses an unknown sheet', () => {
    expect(
      makeRiser(baseFile(), { id: 'r1', name: 'R1', networkType: vent, sheetId: 'nope', fittingId: 'f0', fittingPt: { x: 0, y: 0 }, frame }),
    ).toBe('unknown-sheet');
  });

  it('refuses a riser id that is already used', () => {
    const args = { id: 'r1', name: 'R1', networkType: vent, sheetId: 's0', fittingId: 'f0', fittingPt: { x: 0, y: 0 }, frame };
    const file = ok(makeRiser(baseFile(), args));
    expect(makeRiser(file, args)).toBe('duplicate-id');
  });
});

describe('attachMember', () => {
  const second = member(1);
  const sameFrames = { first: frame, this: frame };

  it('adds the member to the riser', () => {
    const result = ok(attachMember(fileWithRiser(), 'r1', second, sameFrames));
    expect(riserOf(result.file, 'r1').members.map((item) => item.levelId)).toEqual(['l0', 'l1']);
    expect(result.warnings).toEqual([]);
  });

  it('refuses a level that a member already uses', () => {
    expect(attachMember(fileWithRiser(), 'r1', member(0), sameFrames)).toBe('level-taken');
  });

  it('refuses a segment of another network type', () => {
    expect(attachMember(fileWithRiser(), 'r1', second, sameFrames, { segmentNetworkTypeId: 'water' })).toBe('type-differs');
    const result = attachMember(fileWithRiser(), 'r1', second, sameFrames, { segmentNetworkTypeId: 'vent' });
    expect(typeof result).toBe('object');
  });

  it('refuses a page without a scale on either side', () => {
    const unscaled: PageFrame = { ...frame, pageUnitsPerRealUnit: null };
    expect(attachMember(fileWithRiser(), 'r1', second, { first: frame, this: null })).toBe('scale-unknown');
    expect(attachMember(fileWithRiser(), 'r1', second, { first: frame, this: unscaled })).toBe('scale-unknown');
    expect(attachMember(fileWithRiser(), 'r1', second, { first: null, this: frame })).toBe('scale-unknown');
  });

  it('refuses an unknown riser', () => {
    expect(attachMember(fileWithRiser(), 'nope', second, sameFrames)).toBe('unknown-riser');
  });

  it('warns when the page is 2 % taller in mm', () => {
    const taller: PageFrame = { ...frame, heightPt: frame.heightPt * 1.02 };
    const result = ok(attachMember(fileWithRiser(), 'r1', second, { first: frame, this: taller }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Page sizes differ by 0 x 594.1 mm');
  });

  it('gives no warning when the page is 1 % taller in mm', () => {
    const taller: PageFrame = { ...frame, heightPt: frame.heightPt * 1.005 };
    const result = ok(attachMember(fileWithRiser(), 'r1', second, { first: frame, this: taller }));
    expect(result.warnings).toEqual([]);
  });

  it('gives no warning for pages of equal mm size at different scales', () => {
    const first: PageFrame = { widthPt: 595, heightPt: 842, pageUnitsPerRealUnit: calibrationFromScale(100).pageUnitsPerRealUnit };
    const this50: PageFrame = { widthPt: 1190, heightPt: 1684, pageUnitsPerRealUnit: calibrationFromScale(50).pageUnitsPerRealUnit };
    const result = ok(attachMember(fileWithRiser(), 'r1', second, { first, this: this50 }));
    expect(result.warnings).toEqual([]);
  });
});

describe('nextRiserLabel', () => {
  function withRiserNames(names: string[]): BuildingFile {
    let file = baseFile();
    names.forEach((name, index) => {
      file = ok(
        makeRiser(file, {
          id: `r${index}`,
          name,
          networkType: vent,
          sheetId: 's0',
          fittingId: 'f0',
          fittingPt: { x: 0, y: 0 },
          frame,
        }),
      );
    });
    return file;
  }

  it('gives number 1 for an empty file', () => {
    expect(nextRiserLabel(baseFile(), 'Supply air')).toBe('Supply air riser 1');
  });

  it('gives the number after the highest used number', () => {
    expect(nextRiserLabel(withRiserNames(['Supply air riser 1', 'Supply air riser 2']), 'Supply air')).toBe('Supply air riser 3');
  });

  it('gives the smallest unused number', () => {
    expect(nextRiserLabel(withRiserNames(['Supply air riser 2']), 'Supply air')).toBe('Supply air riser 1');
  });

  it('ignores a riser of another type', () => {
    expect(nextRiserLabel(withRiserNames(['Extract air riser 1']), 'Supply air')).toBe('Supply air riser 1');
  });

  it('works with a type name that holds regex characters', () => {
    expect(nextRiserLabel(withRiserNames(['Pipe (cold) [A+] riser 1']), 'Pipe (cold) [A+]')).toBe('Pipe (cold) [A+] riser 2');
  });

  it('ignores names that do not match the pattern', () => {
    const file = withRiserNames(['Supply air riser 1b', 'Supply air riser 01', 'Supply air riser', 'Supply air riser 0']);
    expect(nextRiserLabel(file, 'Supply air')).toBe('Supply air riser 1');
  });

  it('trims the spaces of the type name', () => {
    expect(nextRiserLabel(withRiserNames(['Supply air riser 1']), '  Supply air ')).toBe('Supply air riser 2');
  });
});

describe('setRiserProps', () => {
  it('changes each listed field', () => {
    const file = setRiserProps(fileWithRiser(), 'r1', {
      name: '  R2 ',
      shaftName: 'S1',
      flow: 'up',
      sourceLevelId: 'l1',
      topEnd: 'open',
      bottomEnd: 'capped',
      endAllowanceMm: 300,
    });
    expect(riserOf(file, 'r1')).toMatchObject({
      name: 'R2',
      shaftName: 'S1',
      flow: 'up',
      sourceLevelId: 'l1',
      topEnd: 'open',
      bottomEnd: 'capped',
      endAllowanceMm: 300,
    });
  });

  it('ignores a blank name', () => {
    const file = fileWithRiser();
    expect(setRiserProps(file, 'r1', { name: '   ' })).toBe(file);
  });

  it('ignores a negative end allowance', () => {
    const file = fileWithRiser();
    expect(setRiserProps(file, 'r1', { endAllowanceMm: -5 })).toBe(file);
  });

  it('returns the same file for an unknown riser', () => {
    const file = fileWithRiser();
    expect(setRiserProps(file, 'nope', { flow: 'up' })).toBe(file);
  });
});

describe('detachMember', () => {
  it('removes the member and the pending operations of its sheet', () => {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame }));
    const moved = moveRiser(attached.file, 'r1', { xMm: 1, yMm: 2 }, 's0', new Set());
    const file = detachMember(moved.file, 'r1', 's1');
    expect(riserOf(file, 'r1').members.map((item) => item.sheetId)).toEqual(['s0']);
    expect(riserOf(file, 'r1').pending).toEqual([]);
  });

  it('clears the source level when its member is removed', () => {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame }));
    const withSource = setRiserProps(attached.file, 'r1', { sourceLevelId: 'l1' });
    expect(riserOf(detachMember(withSource, 'r1', 's1'), 'r1').sourceLevelId).toBeUndefined();
  });

  it('returns the same file for a sheet that is not a member', () => {
    const file = fileWithRiser();
    expect(detachMember(file, 'r1', 's2')).toBe(file);
  });
});

describe('clearRiserFlowOverride', () => {
  it('removes the flow and the source level and keeps the other risers', () => {
    const withOverride = setRiserProps(fileWithRiser(), 'r1', { flow: 'up', sourceLevelId: 'l1' });
    const other = ok(
      makeRiser(withOverride, {
        id: 'r2',
        name: 'R2',
        networkType: water,
        sheetId: 's2',
        fittingId: 'f2',
        fittingPt: { x: 0, y: 0 },
        frame,
      }),
    );
    const file = clearRiserFlowOverride(other, 'r1');
    expect(riserOf(file, 'r1')).toMatchObject({ flow: 'unknown' });
    expect(riserOf(file, 'r1')).not.toHaveProperty('sourceLevelId');
    expect(file.risers[1]).toBe(other.risers[1]);
  });

  it('returns the same file for a riser without an override', () => {
    const file = fileWithRiser();
    expect(clearRiserFlowOverride(file, 'r1')).toBe(file);
  });

  it('returns the same file for an unknown riser', () => {
    const file = setRiserProps(fileWithRiser(), 'r1', { flow: 'up' });
    expect(clearRiserFlowOverride(file, 'nope')).toBe(file);
  });

  it('clears a source level when the flow is unknown', () => {
    const withSource = setRiserProps(fileWithRiser(), 'r1', { sourceLevelId: 'l1' });
    expect(riserOf(clearRiserFlowOverride(withSource, 'r1'), 'r1')).not.toHaveProperty('sourceLevelId');
  });
});

describe('setMemberConnectionHeight', () => {
  function withMembers(): BuildingFile {
    return ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
  }

  it('sets the connection height of the member', () => {
    const file = setMemberConnectionHeight(withMembers(), 'r1', 's1', 250);
    expect(riserOf(file, 'r1').members.find((item) => item.sheetId === 's1')?.connectionHeightMm).toBe(250);
  });

  it('accepts zero', () => {
    const file = setMemberConnectionHeight(withMembers(), 'r1', 's1', 0);
    expect(riserOf(file, 'r1').members.find((item) => item.sheetId === 's1')?.connectionHeightMm).toBe(0);
  });

  it('removes the field for undefined', () => {
    const withHeight = setMemberConnectionHeight(withMembers(), 'r1', 's1', 250);
    const file = setMemberConnectionHeight(withHeight, 'r1', 's1', undefined);
    const removed = riserOf(file, 'r1').members.find((item) => item.sheetId === 's1');
    expect(removed !== undefined && 'connectionHeightMm' in removed).toBe(false);
  });

  it('returns the same file for a value that is negative, NaN or infinite', () => {
    const file = withMembers();
    expect(setMemberConnectionHeight(file, 'r1', 's1', -1)).toBe(file);
    expect(setMemberConnectionHeight(file, 'r1', 's1', Number.NaN)).toBe(file);
    expect(setMemberConnectionHeight(file, 'r1', 's1', Number.POSITIVE_INFINITY)).toBe(file);
  });

  it('returns the same file for an unknown riser or sheet', () => {
    const file = withMembers();
    expect(setMemberConnectionHeight(file, 'nope', 's1', 250)).toBe(file);
    expect(setMemberConnectionHeight(file, 'r1', 's2', 250)).toBe(file);
  });

  it('returns the same file when the value is already equal', () => {
    const withHeight = setMemberConnectionHeight(withMembers(), 'r1', 's1', 250);
    expect(setMemberConnectionHeight(withHeight, 'r1', 's1', 250)).toBe(withHeight);
  });

  it('leaves the other members unchanged', () => {
    const file = ok(attachMember(withMembers(), 'r1', member(2), { first: frame, this: frame })).file;
    const next = setMemberConnectionHeight(file, 'r1', 's1', 250);
    expect(riserOf(next, 'r1').members[0]).toBe(riserOf(file, 'r1').members[0]);
    expect(riserOf(next, 'r1').members[2]).toBe(riserOf(file, 'r1').members[2]);
  });
});

describe('deleteRiser', () => {
  it('removes the riser and keeps the others', () => {
    const second = ok(
      makeRiser(fileWithRiser(), {
        id: 'r2',
        name: 'R2',
        networkType: water,
        sheetId: 's2',
        fittingId: 'f2',
        fittingPt: { x: 0, y: 0 },
        frame,
      }),
    );
    const file = deleteRiser(second, 'r1');
    expect(file.risers.map((riser) => riser.id)).toEqual(['r2']);
  });

  it('returns the same file for an unknown riser', () => {
    const file = fileWithRiser();
    expect(deleteRiser(file, 'nope')).toBe(file);
  });
});

describe('moveRiser', () => {
  function threeMembers(): BuildingFile {
    let file = fileWithRiser();
    file = ok(attachMember(file, 'r1', member(1), { first: frame, this: frame })).file;
    return ok(attachMember(file, 'r1', member(2), { first: frame, this: frame })).file;
  }

  it('applies the open member now and queues the closed member in mm', () => {
    const file = threeMembers();
    const before = structuredClone(file);
    const first = moveRiser(file, 'r1', { xMm: 100.006, yMm: 50 }, 's0', new Set(['s1']));
    expect(first.applyNow).toEqual([{ sheetId: 's1', toMm: { xMm: 100.01, yMm: 50 } }]);
    expect(riserOf(first.file, 'r1').anchorMm).toEqual({ xMm: 100.01, yMm: 50 });
    expect(riserOf(first.file, 'r1').pending).toEqual([{ seq: 1, sheetId: 's2', kind: 'move', toMm: { xMm: 100.01, yMm: 50 } }]);
    expect(file).toEqual(before);

    const second = moveRiser(first.file, 'r1', { xMm: 1, yMm: 2 }, 's0', new Set(['s1']));
    expect(riserOf(second.file, 'r1').pending.map((op) => op.seq)).toEqual([1, 2]);
    expect(riserOf(second.file, 'r1').pending[1]).toEqual({ seq: 2, sheetId: 's2', kind: 'move', toMm: { xMm: 1, yMm: 2 } });
  });

  it('returns no entries for an unknown riser', () => {
    const file = threeMembers();
    const result = moveRiser(file, 'nope', { xMm: 1, yMm: 2 }, 's0', new Set());
    expect(result).toEqual({ file, applyNow: [] });
  });
});

describe('takePendingOps', () => {
  it('returns the ops of one sheet in seq order and removes them', () => {
    let file = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    file = ok(attachMember(file, 'r1', member(2), { first: frame, this: frame })).file;
    file = moveRiser(file, 'r1', { xMm: 1, yMm: 2 }, 's0', new Set()).file;
    file = moveRiser(file, 'r1', { xMm: 3, yMm: 4 }, 's0', new Set()).file;

    const taken = takePendingOps(file, 's1');
    expect(taken.ops.map((op) => op.seq)).toEqual([1, 3]);
    expect(taken.ops.every((op) => op.sheetId === 's1')).toBe(true);
    expect(riserOf(taken.file, 'r1').pending.map((op) => op.sheetId)).toEqual(['s2', 's2']);

    const again = takePendingOps(taken.file, 's1');
    expect(again.ops).toEqual([]);
    expect(again.file).toBe(taken.file);
  });
});
