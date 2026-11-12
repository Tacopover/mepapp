import { describe, expect, it } from 'vitest';
import {
  BUILDING_SCHEMA_VERSION,
  BuildingFileError,
  emptyBuilding,
  levelWarnings,
  parseBuildingFile,
  riserWarnings,
  serializeBuildingFile,
  type BuildingFile,
} from './building.js';

function sample(): BuildingFile {
  return {
    ...emptyBuilding('b-1', 'Tower'),
    levels: [
      { id: 'l0', name: 'Basement', elevationMm: -3000 },
      { id: 'l1', name: 'Ground', elevationMm: 0 },
    ],
    sheets: [
      { id: 's0', levelId: 'l0', projectUuid: 'u-1', pageIndex: 0, displayName: 'Plan p1', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } },
      { id: 's1', levelId: 'l1', projectUuid: 'u-1', pageIndex: 1, displayName: 'Plan p2', location: { fileName: 'plan.pdf', path: '/a/plan.pdf' } },
    ],
  };
}

function issuesOf(raw: unknown): string[] {
  try {
    parseBuildingFile(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(BuildingFileError);
    return (error as BuildingFileError).issues.map((issue) => issue.path);
  }
  throw new Error('parse did not throw');
}

describe('building file', () => {
  it('makes an empty building at the current version', () => {
    const file = emptyBuilding('b', 'Name');
    expect(file).toEqual({ schemaVersion: BUILDING_SCHEMA_VERSION, id: 'b', name: 'Name', levels: [], sheets: [], risers: [] });
  });

  it('round-trips through serialize and parse', () => {
    const file = sample();
    expect(parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).toEqual(file);
  });

  it('upgrades a file with no version through the identity step', () => {
    const { schemaVersion, ...rest } = sample();
    expect(schemaVersion).toBe(1);
    expect(parseBuildingFile(rest).schemaVersion).toBe(1);
  });

  it('keeps a field that it does not know', () => {
    const raw = { ...sample(), futureField: { a: 1 } };
    const parsed = parseBuildingFile(raw) as unknown as Record<string, unknown>;
    expect(parsed.futureField).toEqual({ a: 1 });
  });

  it('refuses a newer version', () => {
    expect(issuesOf({ ...sample(), schemaVersion: BUILDING_SCHEMA_VERSION + 1 })).toEqual(['schemaVersion']);
  });

  it('refuses a value that is not an object', () => {
    expect(issuesOf('text')).toEqual(['']);
    expect(issuesOf(null)).toEqual(['']);
  });

  it('refuses a sheet whose levelId does not exist', () => {
    const file = sample();
    file.sheets[0]!.levelId = 'nope';
    expect(issuesOf(file)).toEqual(['sheets[0].levelId']);
  });

  it('refuses two sheets for one document page', () => {
    const file = sample();
    file.sheets[1]!.pageIndex = 0;
    expect(issuesOf(file)).toEqual(['sheets[1]']);
  });

  it('refuses two sheets for one path and page when there is no id', () => {
    const file = sample();
    for (const sheet of file.sheets) {
      sheet.projectUuid = null;
      sheet.pageIndex = 0;
    }
    expect(issuesOf(file)).toEqual(['sheets[1]']);
  });

  it('allows the same page of two documents', () => {
    const file = sample();
    file.sheets[1] = { ...file.sheets[1]!, projectUuid: 'u-2', pageIndex: 0 };
    expect(() => parseBuildingFile(file)).not.toThrow();
  });

  it('refuses a page index that is negative or not whole', () => {
    const negative = sample();
    negative.sheets[0]!.pageIndex = -1;
    expect(issuesOf(negative)).toEqual(['sheets[0].pageIndex']);
    const fraction = sample();
    fraction.sheets[0]!.pageIndex = 0.5;
    expect(issuesOf(fraction)).toEqual(['sheets[0].pageIndex']);
  });

  it('refuses an elevation that is not finite and allows a negative one', () => {
    const file = sample();
    file.levels[1]!.elevationMm = Number.NaN;
    expect(issuesOf(JSON.parse(JSON.stringify({ ...file, levels: [{ id: 'l1', name: 'x', elevationMm: 'high' }] })))).toContain('levels[0].elevationMm');
    expect(issuesOf({ ...file, levels: [{ id: 'l1', name: 'x', elevationMm: Number.POSITIVE_INFINITY }], sheets: [] })).toEqual(['levels[0].elevationMm']);
    expect(() => parseBuildingFile(sample())).not.toThrow();
  });

  it('refuses two levels with one id', () => {
    const file = sample();
    file.levels[1]!.id = 'l0';
    file.sheets = [];
    expect(issuesOf(file)).toEqual(['levels[1].id']);
  });

  it('refuses a missing array', () => {
    const { sheets, ...rest } = sample();
    expect(sheets.length).toBe(2);
    expect(issuesOf(rest)).toContain('sheets');
  });

  it('warns about two levels with the same elevation and not otherwise', () => {
    expect(levelWarnings(sample())).toEqual([]);
    const file = sample();
    file.levels[0]!.elevationMm = 0;
    const warnings = levelWarnings(file);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Basement');
    expect(warnings[0]).toContain('Ground');
  });

  it('round-trips a riser with members and a pending operation', () => {
    const file = riserFile(
      riserRecord({
        members: [member('l0', 's0', 0), member('l1', 's1', 1)],
        sourceLevelId: 'l1',
        pending: [{ seq: 1, sheetId: 's0', kind: 'move', toMm: { xMm: 10, yMm: 20 } }, { seq: 2, sheetId: 's1', kind: 'retag', networkTypeId: 'vent' }],
      }),
    );
    expect(parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).toEqual(file);
  });

  it('accepts a riser with no members', () => {
    expect(() => parseBuildingFile(riserFile(riserRecord({ topEnd: 'open', endAllowanceMm: 2000 })))).not.toThrow();
  });

  it('loads a version 1 file with an empty risers list', () => {
    expect(() => parseBuildingFile({ ...sample(), schemaVersion: 1, risers: [] })).not.toThrow();
  });

  it('round-trips a riser with a setScale operation', () => {
    const file = riserFile(riserRecord({ members: [member('l0', 's0', 0)], pending: [setScale(1, 's0', 2.5)] }));
    expect(parseBuildingFile(JSON.parse(serializeBuildingFile(file)))).toEqual(file);
  });

  it('loads a version 1 file with only move and retag operations', () => {
    const pending = [{ seq: 1, sheetId: 's0', kind: 'move', toMm: { xMm: 1, yMm: 2 } }, retag(2, 's0')];
    expect(() => parseBuildingFile(riserFile(riserRecord({ members: [member('l0', 's0', 0)], pending })))).not.toThrow();
  });

  it('loads a version 0 file with no pending operations', () => {
    const parsed = parseBuildingFile({ ...sample(), schemaVersion: 0, risers: [riserRecord({ members: [member('l0', 's0', 0)] })] });
    expect(parsed.schemaVersion).toBe(1);
  });

  it('refuses a riser with an empty id, and a duplicate id', () => {
    expect(riserIssues({ id: '' })).toContain('risers[0].id');
    expect(issuesOf(riserFile(riserRecord(), riserRecord()))).toEqual(['risers[1].id']);
  });

  it('refuses a riser name that is not a string and a shaftName that is not a string', () => {
    expect(riserIssues({ name: 5 })).toContain('risers[0].name');
    expect(riserIssues({ shaftName: 5 })).toContain('risers[0].shaftName');
  });

  it('refuses an empty networkTypeId and a networkType whose id differs', () => {
    expect(riserIssues({ networkTypeId: '' })).toContain('risers[0].networkTypeId');
    expect(riserIssues({ networkType: { ...riserRecord().networkType as object, id: 'other' } })).toContain('risers[0].networkType');
  });

  it('refuses an anchor that is not finite', () => {
    expect(riserIssues({ anchorMm: { xMm: Number.NaN, yMm: 0 } })).toContain('risers[0].anchorMm.xMm');
    expect(riserIssues({ anchorMm: { xMm: 0, yMm: 'high' } })).toContain('risers[0].anchorMm.yMm');
  });

  it('refuses a flow that is not one of the four values', () => {
    expect(riserIssues({ flow: 'sideways' })).toContain('risers[0].flow');
  });

  it('refuses an end kind that is not member, open or capped', () => {
    expect(riserIssues({ topEnd: 'roof' })).toContain('risers[0].topEnd');
    expect(riserIssues({ bottomEnd: 'roof' })).toContain('risers[0].bottomEnd');
  });

  it('refuses an end allowance that is negative or not finite', () => {
    expect(riserIssues({ endAllowanceMm: -1 })).toContain('risers[0].endAllowanceMm');
    expect(riserIssues({ endAllowanceMm: Number.POSITIVE_INFINITY })).toContain('risers[0].endAllowanceMm');
  });

  it('refuses members that are not an array', () => {
    expect(riserIssues({ members: 'x' })).toContain('risers[0].members');
  });

  it('refuses a member level that does not exist', () => {
    expect(riserIssues({ members: [member('nope', 's0', 0)] })).toContain('risers[0].members[0].levelId');
  });

  it('refuses two members on one level', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0), member('l0', 's0', 0)] })).toEqual(['risers[0].members[1].levelId']);
  });

  it('refuses a member sheet that does not exist', () => {
    expect(riserIssues({ members: [member('l0', 'nope', 0)] })).toContain('risers[0].members[0].sheetId');
  });

  it('refuses a member whose level is not the level of its sheet', () => {
    expect(riserIssues({ members: [member('l1', 's0', 0)] })).toContain('risers[0].members[0].levelId');
  });

  it('refuses a member whose pageIndex is not the pageIndex of its sheet', () => {
    expect(riserIssues({ members: [member('l0', 's0', 5)] })).toContain('risers[0].members[0].pageIndex');
  });

  it('refuses a member with an empty fittingId', () => {
    expect(riserIssues({ members: [{ ...member('l0', 's0', 0), fittingId: '' }] })).toContain('risers[0].members[0].fittingId');
  });

  it('refuses a connection height that is negative', () => {
    expect(riserIssues({ members: [{ ...member('l0', 's0', 0), connectionHeightMm: -1 }] })).toContain('risers[0].members[0].connectionHeightMm');
  });

  it('refuses a sourceLevelId that is not the level of a member', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0)], sourceLevelId: 'l1' })).toContain('risers[0].sourceLevelId');
  });

  it('refuses pending operations that are not an array', () => {
    expect(riserIssues({ pending: 'x' })).toContain('risers[0].pending');
  });

  it('refuses a pending sequence that does not grow', () => {
    const pending = [retag(2, 's0'), retag(2, 's0')];
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending })).toEqual(['risers[0].pending[1].seq']);
  });

  it('refuses a pending sequence number that is not a whole number', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending: [retag(1.5, 's0')] })).toContain('risers[0].pending[0].seq');
  });

  it('refuses a pending operation whose sheet is not a member sheet', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending: [retag(1, 's1')] })).toContain('risers[0].pending[0].sheetId');
  });

  it('refuses a move without a finite target', () => {
    const pending = [{ seq: 1, sheetId: 's0', kind: 'move', toMm: { xMm: 1 } }];
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending })).toContain('risers[0].pending[0].toMm');
  });

  it('refuses a retag without a network type id', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending: [{ seq: 1, sheetId: 's0', kind: 'retag' }] })).toContain(
      'risers[0].pending[0].networkTypeId',
    );
  });

  it('refuses an operation kind other than move, retag or setScale', () => {
    expect(riserIssues({ members: [member('l0', 's0', 0)], pending: [{ seq: 1, sheetId: 's0', kind: 'spin' }] })).toContain(
      'risers[0].pending[0].kind',
    );
  });

  it('accepts a setScale operation with a positive value', () => {
    expect(() => parseBuildingFile(riserFile(riserRecord({ members: [member('l0', 's0', 0)], pending: [setScale(1, 's0', 2.5)] })))).not.toThrow();
  });

  it('refuses a setScale operation with no value, zero or NaN', () => {
    const pending = (value: unknown) => [{ seq: 1, sheetId: 's0', kind: 'setScale', pageUnitsPerRealUnit: value }];
    for (const value of [undefined, 0, Number.NaN]) {
      expect(riserIssues({ members: [member('l0', 's0', 0)], pending: pending(value) })).toEqual(['risers[0].pending[0].pageUnitsPerRealUnit']);
    }
  });

  it('warns about a riser with one member', () => {
    expect(riserWarnings(riserFile(riserRecord({ members: [member('l0', 's0', 0)] })))).toEqual(['R1 has one level.']);
  });

  it('warns about an open or capped end with no end allowance', () => {
    const open = riserWarnings(riserFile(riserRecord({ topEnd: 'open', bottomEnd: 'member' })));
    expect(open).toEqual(['R1 has an open or capped end and no end allowance.']);
    const capped = riserWarnings(riserFile(riserRecord({ topEnd: 'member', bottomEnd: 'capped' })));
    expect(capped).toEqual(['R1 has an open or capped end and no end allowance.']);
  });

  it('warns about an end allowance when both ends are members', () => {
    expect(riserWarnings(riserFile(riserRecord({ endAllowanceMm: 300 })))).toEqual([
      'R1 has an end allowance but both ends continue on a level.',
    ]);
  });

  it('gives no warning for an open end with an end allowance', () => {
    expect(riserWarnings(riserFile(riserRecord({ topEnd: 'open', endAllowanceMm: 300 })))).toEqual([]);
  });

  it('warns about two risers closer than 150 mm on each shared level', () => {
    const members = [member('l0', 's0', 0), member('l1', 's1', 1)];
    const warnings = riserWarnings(
      riserFile(riserRecord({ members }), riserRecord({ id: 'r2', name: 'R2', anchorMm: { xMm: 100, yMm: 0 }, members })),
    );
    expect(warnings).toEqual([
      'R1 and R2 are closer than 150 mm on level Basement.',
      'R1 and R2 are closer than 150 mm on level Ground.',
    ]);
  });

  it('does not warn about two risers 200 mm apart', () => {
    const members = [member('l0', 's0', 0), member('l1', 's1', 1)];
    expect(
      riserWarnings(riserFile(riserRecord({ members }), riserRecord({ id: 'r2', name: 'R2', anchorMm: { xMm: 200, yMm: 0 }, members }))),
    ).toEqual([]);
  });

  it('does not pair a riser with itself', () => {
    const members = [member('l0', 's0', 0), member('l0', 's0', 0)];
    expect(riserWarnings(riserFile(riserRecord({ members })))).toEqual([]);
  });
});

function riserRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r1',
    name: 'R1',
    networkTypeId: 'vent',
    networkType: { id: 'vent', name: 'Supply', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#2196f3', lineWidthPt: 1, linePattern: 'solid' },
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'down',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members: [],
    pending: [],
    ...overrides,
  };
}

function riserFile(...risers: Record<string, unknown>[]): BuildingFile {
  return { ...sample(), risers } as unknown as BuildingFile;
}

function riserIssues(overrides: Record<string, unknown>): string[] {
  return issuesOf(riserFile(riserRecord(overrides)));
}

function member(levelId: string, sheetId: string, pageIndex: number): Record<string, unknown> {
  return { levelId, sheetId, pageIndex, fittingId: `f-${sheetId}` };
}

function retag(seq: number, sheetId: string): Record<string, unknown> {
  return { seq, sheetId, kind: 'retag', networkTypeId: 'vent' };
}

function setScale(seq: number, sheetId: string, pageUnitsPerRealUnit: number): Record<string, unknown> {
  return { seq, sheetId, kind: 'setScale', pageUnitsPerRealUnit };
}
