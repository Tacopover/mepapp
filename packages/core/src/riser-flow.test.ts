import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel } from './building.js';
import type { NetworkType } from './network.js';
import type { Riser, RiserMember } from './riser.js';
import { deriveRiserFlow, type PerSheetRiserFittingFlow } from './riser-flow.js';

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

const levels: BuildingLevel[] = [
  { id: 'l0', name: 'Basement', elevationMm: 0 },
  { id: 'l1', name: 'Ground', elevationMm: 3000 },
  { id: 'l2', name: 'First', elevationMm: 6000 },
];

function fileWith(risers: Riser[], levelList: BuildingLevel[] = levels): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: levelList,
    sheets: levelList.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: null,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function member(index: number, extra: Partial<RiserMember> = {}): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId: 'f', ...extra };
}

function makeRiser(id: string, members: RiserMember[]): Riser {
  return {
    id,
    name: id,
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

describe('deriveRiserFlow', () => {
  it('gives up when the source is on the bottom level', () => {
    const file = fileWith([makeRiser('r', [member(0), member(1), member(2)])]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'up', sourceLevelId: 'l0', fromSolve: true });
  });

  it('gives down when the source is on the top level', () => {
    const file = fileWith([makeRiser('r', [member(0), member(1), member(2)])]);
    const perLevel: PerSheetRiserFittingFlow = { s2: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'down', sourceLevelId: 'l2', fromSolve: true });
  });

  it('gives both when the source is in the middle with consumers above and below', () => {
    const file = fileWith([makeRiser('r', [member(0), member(1), member(2)])]);
    const perLevel: PerSheetRiserFittingFlow = { s1: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'both', sourceLevelId: 'l1', fromSolve: true });
  });

  it('gives unknown with no source level when no fitting is out', () => {
    const file = fileWith([makeRiser('r', [member(0), member(1), member(2)])]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'in' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'unknown', fromSolve: false });
    expect('sourceLevelId' in result.r!).toBe(false);
  });

  it('keeps a hand-set flow over a derived direction', () => {
    const file = fileWith([{ ...makeRiser('r', [member(0), member(1), member(2)]), flow: 'down' }]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'down', sourceLevelId: 'l0', fromSolve: false });
  });

  it('uses a hand-set sourceLevelId as the source', () => {
    const file = fileWith([{ ...makeRiser('r', [member(0), member(1), member(2)]), sourceLevelId: 'l1' }]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'both', sourceLevelId: 'l1', fromSolve: false });
  });

  it('ignores a member on a level that is not in the file', () => {
    const file = fileWith([
      makeRiser('r', [member(0), member(1), { levelId: 'lX', sheetId: 's0', pageIndex: 0, fittingId: 'g' }]),
    ]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out', g: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'up', sourceLevelId: 'l0', fromSolve: true });
  });

  it('gives unknown for a riser with one member', () => {
    const file = fileWith([makeRiser('r', [member(0)])]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'unknown', sourceLevelId: 'l0', fromSolve: false });
  });

  it('gives both with the lower source when two levels are out', () => {
    const file = fileWith([makeRiser('r', [member(0), member(1), member(2)])]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' }, s2: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'both', sourceLevelId: 'l0', fromSolve: true });
  });

  it('keeps a hand-set sourceLevelId with no member on that level as unknown', () => {
    const file = fileWith([{ ...makeRiser('r', [member(0), member(2)]), sourceLevelId: 'l1' }]);
    const perLevel: PerSheetRiserFittingFlow = { s0: { f: 'out' } };

    const result = deriveRiserFlow(file, perLevel);
    expect(result.r).toEqual({ flow: 'unknown', sourceLevelId: 'l1', fromSolve: false });
  });
});
