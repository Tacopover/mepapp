import { describe, expect, it } from 'vitest';
import { calibrationFromScale } from './calibration.js';
import type { BuildingFile } from './building.js';
import type { NetworkType } from './network.js';
import type { Riser, RiserMember } from './riser.js';
import {
  attachMember,
  clearRiserFlowOverride,
  deleteRiser,
  deleteRisers,
  detachMember,
  makeRiser,
  moveRiser,
  nextRiserLabel,
  pendingScaleOf,
  rescaleRisers,
  riserSheetGroup,
  setMemberConnectionHeight,
  setPendingScale,
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

describe('riserSheetGroup', () => {
  it('follows a chain of risers', () => {
    let file = fileWithRiser();
    file = ok(attachMember(file, 'r1', member(1), { first: frame, this: frame })).file;
    file = ok(makeRiser(file, { id: 'r2', name: 'R2', networkType: water, sheetId: 's1', fittingId: 'f1', fittingPt: { x: 0, y: 0 }, frame }));
    file = ok(attachMember(file, 'r2', member(2), { first: frame, this: frame })).file;
    expect(riserSheetGroup(file, 's0')).toEqual(['s0', 's1', 's2']);
    expect(riserSheetGroup(file, 's2')).toEqual(['s2', 's0', 's1']);
  });

  it('returns only the sheet when no riser has it', () => {
    expect(riserSheetGroup(fileWithRiser(), 's2')).toEqual(['s2']);
  });
});

describe('setPendingScale', () => {
  function withMoveOp(): BuildingFile {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    return moveRiser(attached, 'r1', { xMm: 1, yMm: 2 }, 's0', new Set()).file;
  }

  it('appends one setScale op for each sheet after the existing ops', () => {
    const file = setPendingScale(withMoveOp(), ['s0', 's1'], 2.5);
    expect(riserOf(file, 'r1').pending).toEqual([
      { seq: 1, sheetId: 's1', kind: 'move', toMm: { xMm: 1, yMm: 2 } },
      { seq: 2, sheetId: 's0', kind: 'setScale', pageUnitsPerRealUnit: 2.5 },
      { seq: 3, sheetId: 's1', kind: 'setScale', pageUnitsPerRealUnit: 2.5 },
    ]);
  });

  it('replaces the value of a sheet and keeps one setScale op for it', () => {
    const first = setPendingScale(withMoveOp(), ['s0', 's1'], 2.5);
    const second = setPendingScale(first, ['s0', 's1'], 3);
    const scaleOps = riserOf(second, 'r1').pending.filter((op) => op.kind === 'setScale');
    expect(scaleOps).toHaveLength(2);
    expect(pendingScaleOf(second, 's0')).toBe(3);
    expect(pendingScaleOf(second, 's1')).toBe(3);
    expect(riserOf(second, 'r1').pending.some((op) => op.kind === 'move')).toBe(true);
  });

  it('returns the same file for a value that is zero, negative, NaN or infinite', () => {
    const file = withMoveOp();
    expect(setPendingScale(file, ['s0'], 0)).toBe(file);
    expect(setPendingScale(file, ['s0'], -1)).toBe(file);
    expect(setPendingScale(file, ['s0'], Number.NaN)).toBe(file);
    expect(setPendingScale(file, ['s0'], Number.POSITIVE_INFINITY)).toBe(file);
  });

  it('returns the same file for a sheet that no riser has', () => {
    const file = withMoveOp();
    expect(setPendingScale(file, ['s2'], 2.5)).toBe(file);
  });
});

describe('pendingScaleOf', () => {
  it('returns null when the sheet has no setScale op', () => {
    expect(pendingScaleOf(fileWithRiser(), 's0')).toBeNull();
  });

  it('returns the value of the setScale op with the largest seq over all risers', () => {
    const scaled = setPendingScale(fileWithRiser(), ['s0'], 2.5);
    const second = ok(
      makeRiser(scaled, { id: 'r2', name: 'R2', networkType: water, sheetId: 's0', fittingId: 'f0', fittingPt: { x: 0, y: 0 }, frame }),
    );
    const withLater: BuildingFile = {
      ...second,
      risers: second.risers.map((riser) =>
        riser.id === 'r2' ? { ...riser, pending: [{ seq: 5, sheetId: 's0', kind: 'setScale', pageUnitsPerRealUnit: 4 }] } : riser,
      ),
    };
    expect(pendingScaleOf(withLater, 's0')).toBe(4);
    expect(pendingScaleOf(withLater, 's1')).toBeNull();
  });
});

describe('setScale ops with other ops', () => {
  it('takePendingOps returns a setScale op with the move ops of its sheet in seq order', () => {
    let file = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    file = moveRiser(file, 'r1', { xMm: 1, yMm: 2 }, 's0', new Set()).file;
    file = setPendingScale(file, ['s1'], 2.5);
    const taken = takePendingOps(file, 's1');
    expect(taken.ops.map((op) => op.kind)).toEqual(['move', 'setScale']);
    expect(taken.ops.map((op) => op.seq)).toEqual([1, 2]);
  });

  it('detachMember drops the setScale op of the detached sheet only', () => {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    const scaled = setPendingScale(attached, ['s0', 's1'], 2.5);
    const file = detachMember(scaled, 'r1', 's1');
    expect(pendingScaleOf(file, 's1')).toBeNull();
    expect(pendingScaleOf(file, 's0')).toBe(2.5);
  });
});

describe('deleteRisers', () => {
  it('removes the listed risers and ignores unknown ids', () => {
    const second = ok(
      makeRiser(fileWithRiser(), { id: 'r2', name: 'R2', networkType: water, sheetId: 's2', fittingId: 'f2', fittingPt: { x: 0, y: 0 }, frame }),
    );
    const file = deleteRisers(second, ['r1', 'nope']);
    expect(file.risers.map((riser) => riser.id)).toEqual(['r2']);
  });

  it('returns the same file when no listed riser exists', () => {
    const file = fileWithRiser();
    expect(deleteRisers(file, ['nope'])).toBe(file);
    expect(deleteRisers(file, [])).toBe(file);
  });
});

describe('rescaleRisers', () => {
  function anchored(xMm: number, yMm: number): BuildingFile {
    return moveRiser(fileWithRiser(), 'r1', { xMm, yMm }, 's0', new Set()).file;
  }

  it('multiplies the anchor by the ratio and rounds to 0.01 mm', () => {
    expect(riserOf(rescaleRisers(anchored(1000, 2000), new Map([['r1', 2]])), 'r1').anchorMm).toEqual({ xMm: 2000, yMm: 4000 });
    expect(riserOf(rescaleRisers(anchored(1000, 3), new Map([['r1', 0.5]])), 'r1').anchorMm).toEqual({ xMm: 500, yMm: 1.5 });
    expect(riserOf(rescaleRisers(anchored(10, 10), new Map([['r1', 1 / 3]])), 'r1').anchorMm).toEqual({ xMm: 3.33, yMm: 3.33 });
  });

  it('scales the toMm of pending move ops and keeps their other fields', () => {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    const moved = moveRiser(attached, 'r1', { xMm: 100, yMm: 200 }, 's0', new Set()).file;
    const file = rescaleRisers(moved, new Map([['r1', 2]]));
    expect(riserOf(file, 'r1').pending).toEqual([{ seq: 1, sheetId: 's1', kind: 'move', toMm: { xMm: 200, yMm: 400 } }]);
    expect(riserOf(file, 'r1').anchorMm).toEqual({ xMm: 200, yMm: 400 });
  });

  it('leaves the setScale ops unchanged', () => {
    const attached = ok(attachMember(fileWithRiser(), 'r1', member(1), { first: frame, this: frame })).file;
    const scaled = setPendingScale(attached, ['s0', 's1'], 2.5);
    const before = riserOf(scaled, 'r1').pending.filter((op) => op.kind === 'setScale');
    const file = rescaleRisers(scaled, new Map([['r1', 2]]));
    expect(riserOf(file, 'r1').pending.filter((op) => op.kind === 'setScale')).toEqual(before);
  });

  it('returns the same file when nothing changes', () => {
    const file = anchored(1000, 2000);
    expect(rescaleRisers(file, new Map())).toBe(file);
    expect(rescaleRisers(file, new Map([['r1', 1]]))).toBe(file);
    expect(rescaleRisers(file, new Map([['r1', 0]]))).toBe(file);
    expect(rescaleRisers(file, new Map([['r1', -1]]))).toBe(file);
    expect(rescaleRisers(file, new Map([['r1', Number.NaN]]))).toBe(file);
    expect(rescaleRisers(file, new Map([['r1', Number.POSITIVE_INFINITY]]))).toBe(file);
    expect(rescaleRisers(file, new Map([['nope', 2]]))).toBe(file);
  });

  it('changes only the listed risers', () => {
    const file = ok(
      makeRiser(anchored(1000, 2000), { id: 'r2', name: 'R2', networkType: water, sheetId: 's2', fittingId: 'f2', fittingPt: { x: 0, y: 0 }, frame }),
    );
    const next = rescaleRisers(file, new Map([['r1', 2]]));
    expect(riserOf(next, 'r1').anchorMm).toEqual({ xMm: 2000, yMm: 4000 });
    expect(riserOf(next, 'r2')).toEqual(riserOf(file, 'r2'));
    expect(riserOf(next, 'r2')).toBe(riserOf(file, 'r2'));
  });
});
