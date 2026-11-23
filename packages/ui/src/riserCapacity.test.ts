import { solveBuildingFlow, type BuildingFile, type BuildingLevel, type BuildingSheet, type NetworkType, type Riser, type RiserMember, type RiserNetworksLive, type RiserNetworkSummary, type SheetSummary } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { capacityNumberText, capacityViewOf, fittingRiserLinesOf, isNotDesignFlow, needsSummaryRead, rebuildNoticeText, riserFlowUnit, unknownReasonOf, type CapacityView } from './riserCapacity.js';
import type { RebuildResult } from './rebuildSummaries.js';

const DESIGN_FLOW_TEXT = 'These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type.';
const INCOMPLETE_TEXT = 'Some levels have no data, so some numbers read "at least". The warnings above name each level.';
const UNKNOWN_TEXT = 'Click Set by hand and choose a source level.';
const NO_UNIT_TEXT = 'This network type has no flow unit, so the numbers have no unit.';
const ONE_MEMBER_TEXT = 'This riser has one level. A capacity needs two levels.';
const RISER_INCOMPLETE_TEXT = 'Some levels have no data, so a number reads "at least". Solved capacity counts only the levels that have data. Open Manage Buildings, tab Risers, to see which levels.';
const RISER_UNKNOWN_TEXT = 'Solved capacity counts this level only until the main level is known. Open Manage Buildings, tab Risers, to set it.';
const RISER_LOOP_TEXT = 'Solved capacity counts this level only. The risers make a loop. Open Manage Buildings, tab Risers, for details.';
const SHARED_R2_TEXT = 'The total also covers R2. It shares a network with this riser.';

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

const LEVELS: BuildingLevel[] = [
  { id: 'l0', name: 'Level 0', elevationMm: 0 },
  { id: 'l1', name: 'Level 1', elevationMm: 3000 },
  { id: 'l2', name: 'Level 2', elevationMm: 6000 },
];

function networkTypeOf(overrides: Partial<NetworkType> = {}): NetworkType {
  return { ...vent, ...overrides };
}

function fileWith(risers: Riser[], projectUuids: (string | null)[] = ['p0', 'p1', 'p2']): BuildingFile {
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: LEVELS,
    sheets: LEVELS.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: projectUuids[index] ?? null,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function memberOf(index: number, fittingId = 'f'): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId };
}

function riserOf(name: string, members: RiserMember[], type: NetworkType = vent, extra: Partial<Riser> = {}): Riser {
  return {
    id: name,
    name,
    networkTypeId: type.id,
    networkType: type,
    anchorMm: { xMm: 0, yMm: 0 },
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members,
    pending: [],
    ...extra,
  };
}

function entryOf(fittingIds: string[], terminalCapacity: number, hasSource = false, networkTypeId = vent.id): RiserNetworkSummary {
  return { networkTypeId, fittingIds, terminalCapacity, hasSource };
}

function summaryOf(projectUuid: string, entries?: RiserNetworkSummary[]): SheetSummary {
  return {
    version: 2,
    projectUuid,
    savedAt: '2026-01-01T00:00:00Z',
    sourceSizeBytes: 0,
    sourceModifiedMs: 0,
    pages: {},
    tables: [],
    warnings: [],
    ...(entries === undefined ? {} : { riserNetworks: entries }),
  };
}

function summariesOf(...list: SheetSummary[]): Map<string, SheetSummary> {
  return new Map(list.map((item) => [item.projectUuid, item] as const));
}

/** One riser R1 with a member on each of the three levels, fitting f. Terminals 100, 500, 150. */
function worked(sources: [boolean, boolean, boolean], terminals: [number, number, number] = [100, 500, 150], type: NetworkType = vent) {
  const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)], type);
  const file = fileWith([riser]);
  const summaries = summariesOf(
    summaryOf('p0', [entryOf(['f'], terminals[0], sources[0], type.id)]),
    summaryOf('p1', [entryOf(['f'], terminals[1], sources[1], type.id)]),
    summaryOf('p2', [entryOf(['f'], terminals[2], sources[2], type.id)]),
  );
  return { file, riser, summaries };
}

describe('capacityNumberText', () => {
  it('writes the number with the unit and the "at least" word', () => {
    expect(capacityNumberText(650, 'm³/h', false)).toBe('650 m³/h');
    expect(capacityNumberText(150, 'm³/h', true)).toBe('at least 150 m³/h');
    expect(capacityNumberText(650, undefined, false)).toBe('650');
    expect(capacityNumberText(12.345, 'l/s', false)).toBe('12.35 l/s');
  });
});

describe('riserFlowUnit and isNotDesignFlow', () => {
  it('reads the unit of the network type of the riser', () => {
    expect(riserFlowUnit(riserOf('R1', []))).toBe('m³/h');
    expect(riserFlowUnit(riserOf('R1', [], networkTypeOf({ flowUnit: undefined })))).toBeUndefined();
  });

  it('marks a drain, a fire protection type and an electrical type as not a design flow', () => {
    expect(isNotDesignFlow({ id: 'sanitary-waste', discipline: 'plumbing' })).toBe(true);
    expect(isNotDesignFlow({ id: 'sprinkler', discipline: 'fireProtection' })).toBe(true);
    expect(isNotDesignFlow({ id: 'power', discipline: 'electrical' })).toBe(true);
    expect(isNotDesignFlow({ id: 'vent', discipline: 'ventilation' })).toBe(false);
  });
});

describe('capacityViewOf', () => {
  it('shows the rows, the main level and the total when all numbers are known', () => {
    const { file, riser, summaries } = worked([true, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, riser, flow);
    expect(view.kind).toBe('solved');
    expect(view.rows.map((row) => [row.key, row.levelsText, row.valueText])).toEqual([
      ['l0|l1|0', 'Level 0 to Level 1', '650 m³/h'],
      ['l1|l2|1', 'Level 1 to Level 2', '150 m³/h'],
    ]);
    expect(view.rows[0]).toMatchObject({ known: true, ariaLabel: 'Level 0 to Level 1: 650 m³/h' });
    expect(view.mainLine).toBe('Main level: Level 0');
    expect(view.totalLine).toBe('Connected total: 750 m³/h (no concurrency factor)');
    expect(view.hints).toEqual([]);
    expect(view.sharedLine).toBeNull();
    expect(view.notDesignFlow).toBe(false);
    expect(view.designFlowHint).toBeNull();
    expect(needsSummaryRead(file, riser, flow, summaries)).toBe(false);
  });

  it('gives the spans of a source on level 2', () => {
    const { file, riser, summaries } = worked([false, false, true]);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(view.rows.map((row) => row.valueText)).toEqual(['100 m³/h', '600 m³/h']);
    expect(view.mainLine).toBe('Main level: Level 2');
    expect(view.totalLine).toBe('Connected total: 750 m³/h (no concurrency factor)');
  });

  it('reads "at least" for a span behind a level with no summary, and asks for the summary', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p2', [entryOf(['f'], 150)]));
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, riser, flow);
    expect(view.rows.map((row) => row.valueText)).toEqual(['at least 150 m³/h', '150 m³/h']);
    expect(view.rows[0]).toMatchObject({ known: true });
    expect(view.totalLine).toBe('Connected total: at least 250 m³/h (no concurrency factor)');
    expect(view.hints[0]).toBe(INCOMPLETE_TEXT);
    expect(needsSummaryRead(file, riser, flow, summaries)).toBe(true);
  });

  it('does not ask for the summary of the sheet that the live data covers', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p2', [entryOf(['f'], 150)]));
    const live: RiserNetworksLive = { projectUuid: 'p1', riserNetworks: [entryOf(['f'], 500)] };
    const flow = solveBuildingFlow(file, summaries, live);
    const view = capacityViewOf(file, riser, flow);
    expect(view.rows.map((row) => row.valueText)).toEqual(['650 m³/h', '150 m³/h']);
    expect(view.totalLine).toBe('Connected total: 750 m³/h (no concurrency factor)');
    expect(view.hints).toEqual([]);
    expect(needsSummaryRead(file, riser, flow, summaries, [live])).toBe(false);
  });

  it('does not ask for a summary when the live data covers every sheet without one', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]));
    const live: RiserNetworksLive[] = [
      { projectUuid: 'p1', riserNetworks: [entryOf(['f'], 500)] },
      { projectUuid: 'p2', riserNetworks: [entryOf(['f'], 150)] },
    ];
    const flow = solveBuildingFlow(file, summaries, live);
    expect(needsSummaryRead(file, riser, flow, summaries, live)).toBe(false);
    expect(needsSummaryRead(file, riser, flow, summaries, live.slice(0, 1))).toBe(true);
  });

  it('asks for the summary when the stored summary has no riser data', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p1'), summaryOf('p2', [entryOf(['f'], 150)]));
    const flow = solveBuildingFlow(file, summaries);
    expect(needsSummaryRead(file, riser, flow, summaries)).toBe(true);
    expect(capacityViewOf(file, riser, flow).hints[0]).toBe(INCOMPLETE_TEXT);
  });

  it('does not ask for the summary of a sheet that has no projectUuid', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser], ['p0', 'p1', null]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p1', [entryOf(['f'], 500)]));
    const flow = solveBuildingFlow(file, summaries);
    expect(needsSummaryRead(file, riser, flow, summaries)).toBe(false);
  });

  it('shows no known numbers and the total when no level is the source', () => {
    const { file, riser, summaries } = worked([false, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, riser, flow);
    expect(view.rows.map((row) => [row.valueText, row.known])).toEqual([
      ['not known yet (no source level)', false],
      ['not known yet (no source level)', false],
    ]);
    expect(view.rows[0]!.ariaLabel).toBe('Level 0 to Level 1: not known yet (no source level)');
    expect(view.mainLine).toBe('Main level: not known yet');
    expect(view.totalLine).toBe('Connected total: 750 m³/h (no concurrency factor)');
    expect(view.hints).toEqual([UNKNOWN_TEXT]);
    expect(unknownReasonOf(file, flow.groups[0]!, flow.warnings)).toBe('no-source');
  });

  it('asks to choose in the list "Source level" when the selects are shown, and not for a loop', () => {
    const { file, riser, summaries } = worked([false, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    expect(capacityViewOf(file, riser, flow, { selectsShown: true }).hints).toEqual(['Choose a level in the list "Source level".']);
    expect(capacityViewOf(file, riser, flow, { selectsShown: false }).hints).toEqual([UNKNOWN_TEXT]);
    expect(capacityViewOf(file, riser, flow).hints).toEqual([UNKNOWN_TEXT]);
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')]);
    const r2 = riserOf('R2', [memberOf(0, 'b'), memberOf(1, 'b')]);
    const loopFile = fileWith([r1, r2]);
    const loopFlow = solveBuildingFlow(loopFile, summariesOf(summaryOf('p0', [entryOf(['a', 'b'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b'], 500)])));
    expect(capacityViewOf(loopFile, r1, loopFlow, { selectsShown: true }).hints).toEqual(['See the warnings above.']);
  });

  it('gives the reason "more than one source level" when two levels are sources', () => {
    const { file, riser, summaries } = worked([true, false, true]);
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, riser, flow);
    expect(view.rows.map((row) => row.valueText)).toEqual([
      'not known yet (more than one source level)',
      'not known yet (more than one source level)',
    ]);
    expect(view.hints).toEqual([UNKNOWN_TEXT]);
    expect(unknownReasonOf(file, flow.groups[0]!, flow.warnings)).toBe('many-sources');
  });

  it('gives the reason "the risers make a loop" and the hint to read the warnings', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')]);
    const r2 = riserOf('R2', [memberOf(0, 'b'), memberOf(1, 'b')]);
    const file = fileWith([r1, r2]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a', 'b'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b'], 500)]));
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, r1, flow);
    expect(view.rows.map((row) => row.valueText)).toEqual(['not known yet (the risers make a loop)']);
    expect(view.totalLine).toBe('Connected total: 600 m³/h (no concurrency factor)');
    expect(view.hints).toEqual(['See the warnings above.']);
    expect(view.sharedLine).toBe('The total also covers R2. It shares a network with this riser.');
    expect(unknownReasonOf(file, flow.groups[0]!, flow.warnings)).toBe('loop');
  });

  it('shows the main level that is set by hand', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)], vent, { sourceLevelId: 'l1' });
    const file = fileWith([riser]);
    const summaries = summariesOf(
      summaryOf('p0', [entryOf(['f'], 100, true)]),
      summaryOf('p1', [entryOf(['f'], 500)]),
      summaryOf('p2', [entryOf(['f'], 150, true)]),
    );
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(view.mainLine).toBe('Main level: Level 1');
    expect(view.rows.map((row) => row.valueText)).toEqual(['100 m³/h', '150 m³/h']);
    expect(view.hints).toEqual([]);
  });

  it('gives the reason "two main levels set by hand" when two risers of one group set different levels', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')], vent, { sourceLevelId: 'l0' });
    const r2 = riserOf('R2', [memberOf(1, 'b'), memberOf(2, 'b')], vent, { sourceLevelId: 'l2' });
    const file = fileWith([r1, r2]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a'], 100)]), summaryOf('p1', [entryOf(['a', 'b'], 500)]), summaryOf('p2', [entryOf(['b'], 150)]));
    const flow = solveBuildingFlow(file, summaries);
    expect(unknownReasonOf(file, flow.groups[0]!, flow.warnings)).toBe('hand-conflict');
    const view = capacityViewOf(file, r1, flow);
    expect(view.mainLine).toBe('Main level: not known yet');
    expect(view.rows.map((row) => row.valueText)).toEqual(['not known yet (two main levels set by hand)']);
  });

  it('shows the total without a unit and the hint when the network type has no flow unit', () => {
    const bare = networkTypeOf();
    delete bare.flowUnit;
    const { file, riser, summaries } = worked([true, false, false], [100, 500, 150], bare);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(view.totalLine).toBe('Connected total: 750 (no concurrency factor)');
    expect(view.rows.map((row) => row.valueText)).toEqual(['650', '150']);
    expect(view.hints).toEqual([NO_UNIT_TEXT]);
  });

  it('gives the design flow hint for a drain, a fire protection type and an electrical type only', () => {
    const types: NetworkType[] = [
      networkTypeOf({ id: 'sanitary-waste', name: 'Waste', discipline: 'plumbing', flowUnit: 'l/s' }),
      networkTypeOf({ id: 'sprinkler', name: 'Sprinkler', discipline: 'fireProtection', flowUnit: 'l/s' }),
      networkTypeOf({ id: 'power', name: 'Power', discipline: 'electrical', flowUnit: 'W' }),
    ];
    for (const type of types) {
      const { file, riser, summaries } = worked([true, false, false], [100, 500, 150], type);
      const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
      expect(view.notDesignFlow).toBe(true);
      expect(view.designFlowHint).toBe(DESIGN_FLOW_TEXT);
    }
    const { file, riser, summaries } = worked([true, false, false]);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(view.notDesignFlow).toBe(false);
    expect(view.designFlowHint).toBeNull();
  });

  it('gives one-member view for a riser with one level', () => {
    const riser = riserOf('R1', [memberOf(0)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]));
    const flow = solveBuildingFlow(file, summaries);
    const view = capacityViewOf(file, riser, flow);
    expect(view).toMatchObject({ kind: 'one-member', mainLine: '', totalLine: null, rows: [], sharedLine: null, designFlowHint: null });
    expect(view.hints).toEqual([ONE_MEMBER_TEXT]);
    expect(needsSummaryRead(file, riser, flow, summaries)).toBe(false);
  });

  it('names the other riser of the group in the shared line', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')]);
    const r2 = riserOf('R2', [memberOf(1, 'b'), memberOf(2, 'b')]);
    const file = fileWith([r1, r2]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b'], 500)]), summaryOf('p2', [entryOf(['b'], 150)]));
    const flow = solveBuildingFlow(file, summaries);
    const view1 = capacityViewOf(file, r1, flow);
    const view2 = capacityViewOf(file, r2, flow);
    expect(view1.rows.map((row) => row.valueText)).toEqual(['650 m³/h']);
    expect(view1.sharedLine).toBe('The total also covers R2. It shares a network with this riser.');
    expect(view2.rows.map((row) => row.valueText)).toEqual(['150 m³/h']);
    expect(view2.sharedLine).toBe('The total also covers R1. It shares a network with this riser.');
  });

  it('names two other risers of the group in the shared line', () => {
    const fittings = ['a', 'b', 'c'];
    const risers = ['R1', 'R2', 'R3'].map((name, index) => riserOf(name, [memberOf(0, fittings[index]!), memberOf(1, fittings[index]!)]));
    const file = fileWith(risers);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a', 'b', 'c'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b', 'c'], 500)]));
    const flow = solveBuildingFlow(file, summaries);
    expect(flow.groups[0]!.riserIds).toEqual(['R1', 'R2', 'R3']);
    expect(capacityViewOf(file, risers[0]!, flow).sharedLine).toBe('The total also covers R2, R3. They share a network with this riser.');
  });

  it('shows the id of a level that the file does not name', () => {
    const { file, riser, summaries } = worked([true, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    const fileWithoutL1: BuildingFile = { ...file, levels: file.levels.filter((level) => level.id !== 'l1') };
    const view = capacityViewOf(fileWithoutL1, riser, flow);
    expect(view.rows.map((row) => row.levelsText)).toEqual(['Level 0 to l1', 'l1 to Level 2']);
    expect(view.rows[0]!.ariaLabel).toBe('Level 0 to l1: 650 m³/h');
  });

  it('returns no reason for a group that is solved', () => {
    const { file, summaries } = worked([true, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    expect(unknownReasonOf(file, flow.groups[0]!, flow.warnings)).toBeUndefined();
  });

  it('gives each row of a riser of three levels a different key when all members use one fitting id', () => {
    const { file, riser, summaries } = worked([true, false, false]);
    const keys = capacityViewOf(file, riser, solveBuildingFlow(file, summaries)).rows.map((row) => row.key);
    expect(keys).toEqual(['l0|l1|0', 'l1|l2|1']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each riser of two separate groups its own reason', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a'), memberOf(2, 'a')]);
    const r10 = riserOf('R10', [memberOf(0, 'b'), memberOf(1, 'b'), memberOf(2, 'b')]);
    const file = fileWith([r1, r10]);
    const summaries = summariesOf(
      summaryOf('p0', [entryOf(['a'], 100), entryOf(['b'], 300, true)]),
      summaryOf('p1', [entryOf(['a'], 500), entryOf(['b'], 700)]),
      summaryOf('p2', [entryOf(['a'], 150), entryOf(['b'], 200, true)]),
    );
    const flow = solveBuildingFlow(file, summaries);
    expect(flow.groups).toHaveLength(2);
    const group1 = flow.groups.find((group) => group.riserIds.includes('R1'))!;
    const group10 = flow.groups.find((group) => group.riserIds.includes('R10'))!;
    expect(unknownReasonOf(file, group1, flow.warnings)).toBe('no-source');
    expect(unknownReasonOf(file, group10, flow.warnings)).toBe('many-sources');
    expect(capacityViewOf(file, r1, flow).rows.map((row) => row.valueText)).toEqual([
      'not known yet (no source level)',
      'not known yet (no source level)',
    ]);
    expect(capacityViewOf(file, r10, flow).rows.map((row) => row.valueText)).toEqual([
      'not known yet (more than one source level)',
      'not known yet (more than one source level)',
    ]);
  });
});

describe('CapacityView parts', () => {
  it('gives the value parts of the known state, and the two lines are built from them', () => {
    const { file, riser, summaries } = worked([true, false, false]);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(view).toMatchObject({
      mainValue: 'Level 0',
      totalValue: '750 m³/h (no concurrency factor)',
      unknownReasonText: null,
      complete: true,
      unknown: false,
      loop: false,
      noUnit: false,
    });
    expect(view.mainLine).toBe('Main level: Level 0');
    expect(view.totalLine).toBe('Connected total: 750 m³/h (no concurrency factor)');
  });

  it('gives empty value parts and false flags for a one-member riser', () => {
    const riser = riserOf('R1', [memberOf(0)]);
    const file = fileWith([riser]);
    const flow = solveBuildingFlow(file, summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)])));
    expect(capacityViewOf(file, riser, flow)).toMatchObject({
      mainValue: '',
      totalValue: null,
      unknownReasonText: null,
      complete: false,
      unknown: false,
      loop: false,
      noUnit: false,
    });
  });
});

describe('fittingRiserLinesOf', () => {
  it('gives the heading, the two rows and no hint for the known state', () => {
    const { file, riser, summaries } = worked([true, false, false]);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(fittingRiserLinesOf(view, 'R1')).toEqual({
      heading: 'Riser R1',
      tag: null,
      rows: [
        { label: 'Main level', value: 'Level 0', title: 'Main level: Level 0' },
        { label: 'Connected total', value: '750 m³/h (no concurrency factor)', title: 'Connected total: 750 m³/h (no concurrency factor)' },
      ],
      hints: [],
    });
  });

  it('gives "at least" for the total when a level has no summary, and the hint E only', () => {
    const riser = riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)]);
    const file = fileWith([riser]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p2', [entryOf(['f'], 150)]));
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(fittingRiserLinesOf(view, 'R1')).toEqual({
      heading: 'Riser R1',
      tag: null,
      rows: [
        { label: 'Main level', value: 'Level 0', title: 'Main level: Level 0' },
        { label: 'Connected total', value: 'at least 250 m³/h (no concurrency factor)', title: 'Connected total: at least 250 m³/h (no concurrency factor)' },
      ],
      hints: [RISER_INCOMPLETE_TEXT],
    });
  });

  it('gives the reason in the main level row and keeps the total when no level is the source', () => {
    const { file, riser, summaries } = worked([false, false, false]);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(fittingRiserLinesOf(view, 'R1')).toEqual({
      heading: 'Riser R1',
      tag: null,
      rows: [
        { label: 'Main level', value: 'not known yet (no source level)', title: 'Main level: not known yet (no source level)' },
        { label: 'Connected total', value: '750 m³/h (no concurrency factor)', title: 'Connected total: 750 m³/h (no concurrency factor)' },
      ],
      hints: [RISER_UNKNOWN_TEXT],
    });
  });

  it('gives the loop text for the hint when the risers make a loop', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')]);
    const r2 = riserOf('R2', [memberOf(0, 'b'), memberOf(1, 'b')]);
    const file = fileWith([r1, r2]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a', 'b'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b'], 500)]));
    const view = capacityViewOf(file, r1, solveBuildingFlow(file, summaries));
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.rows[0]).toEqual({ label: 'Main level', value: 'not known yet (the risers make a loop)', title: 'Main level: not known yet (the risers make a loop)' });
    expect(lines?.rows[1]?.value).toBe('600 m³/h (no concurrency factor)');
    expect(lines?.hints).toEqual([SHARED_R2_TEXT, RISER_LOOP_TEXT]);
  });

  it('gives the total without a unit and the hint G when the network type has no flow unit', () => {
    const bare = networkTypeOf();
    delete bare.flowUnit;
    const { file, riser, summaries } = worked([true, false, false], [100, 500, 150], bare);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    expect(fittingRiserLinesOf(view, 'R1')?.rows[1]).toEqual({ label: 'Connected total', value: '750 (no concurrency factor)', title: 'Connected total: 750 (no concurrency factor)' });
    expect(fittingRiserLinesOf(view, 'R1')?.hints).toEqual([NO_UNIT_TEXT]);
  });

  it('gives the tag and the hint H after the other hints for a drain', () => {
    const drain = networkTypeOf({ id: 'sanitary-waste', name: 'Waste', discipline: 'plumbing', flowUnit: 'l/s' });
    const { file, riser, summaries } = worked([false, false, false], [100, 500, 150], drain);
    const view = capacityViewOf(file, riser, solveBuildingFlow(file, summaries));
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.tag).toBe('Not a design flow');
    expect(lines?.hints).toEqual([RISER_UNKNOWN_TEXT, DESIGN_FLOW_TEXT]);
  });

  it('gives the shared line as the first hint for a riser in a shared network', () => {
    const r1 = riserOf('R1', [memberOf(0, 'a'), memberOf(1, 'a')]);
    const r2 = riserOf('R2', [memberOf(1, 'b'), memberOf(2, 'b')]);
    const file = fileWith([r1, r2]);
    const summaries = summariesOf(summaryOf('p0', [entryOf(['a'], 100, true)]), summaryOf('p1', [entryOf(['a', 'b'], 500)]), summaryOf('p2', [entryOf(['b'], 150)]));
    const view = capacityViewOf(file, r1, solveBuildingFlow(file, summaries));
    expect(fittingRiserLinesOf(view, 'R1')?.hints).toEqual([SHARED_R2_TEXT]);
  });

  it('returns null for a one-member riser', () => {
    const riser = riserOf('R1', [memberOf(0)]);
    const file = fileWith([riser]);
    const flow = solveBuildingFlow(file, summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)])));
    expect(fittingRiserLinesOf(capacityViewOf(file, riser, flow), 'R1')).toBeNull();
  });

  it('gives the hints in the order D, E, F, G, H when all apply', () => {
    const view: CapacityView = {
      kind: 'solved',
      notDesignFlow: true,
      mainLine: 'Main level: not known yet',
      totalLine: 'Connected total: at least 750 m³/h (no concurrency factor)',
      rows: [],
      sharedLine: SHARED_R2_TEXT,
      hints: [],
      designFlowHint: DESIGN_FLOW_TEXT,
      mainValue: 'not known yet',
      totalValue: 'at least 750 m³/h (no concurrency factor)',
      unknownReasonText: 'more than one source level',
      complete: false,
      unknown: true,
      loop: false,
      noUnit: true,
    };
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.tag).toBe('Not a design flow');
    expect(lines?.rows[0]?.value).toBe('not known yet (more than one source level)');
    expect(lines?.hints).toEqual([SHARED_R2_TEXT, RISER_INCOMPLETE_TEXT, RISER_UNKNOWN_TEXT, NO_UNIT_TEXT, DESIGN_FLOW_TEXT]);
  });

  it('gives "a level has no data" for the main level and no hint F when a level has no data and no source is known', () => {
    const view: CapacityView = {
      kind: 'solved',
      notDesignFlow: false,
      mainLine: 'Main level: not known yet',
      totalLine: 'Connected total: at least 250 m³/h (no concurrency factor)',
      rows: [],
      sharedLine: null,
      hints: [],
      designFlowHint: null,
      mainValue: 'not known yet',
      totalValue: 'at least 250 m³/h (no concurrency factor)',
      unknownReasonText: 'no source level',
      complete: false,
      unknown: true,
      loop: false,
      noUnit: false,
    };
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.rows[0]).toEqual({ label: 'Main level', value: 'not known yet (a level has no data)', title: 'Main level: not known yet (a level has no data)' });
    expect(lines?.hints).toContain(RISER_INCOMPLETE_TEXT);
    expect(lines?.hints).not.toContain(RISER_UNKNOWN_TEXT);
  });

  it('keeps "no source level" and hint F when every level has data', () => {
    const view: CapacityView = {
      kind: 'solved',
      notDesignFlow: false,
      mainLine: 'Main level: not known yet',
      totalLine: 'Connected total: 750 m³/h (no concurrency factor)',
      rows: [],
      sharedLine: null,
      hints: [],
      designFlowHint: null,
      mainValue: 'not known yet',
      totalValue: '750 m³/h (no concurrency factor)',
      unknownReasonText: 'no source level',
      complete: true,
      unknown: true,
      loop: false,
      noUnit: false,
    };
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.rows[0]).toEqual({ label: 'Main level', value: 'not known yet (no source level)', title: 'Main level: not known yet (no source level)' });
    expect(lines?.hints).toEqual([RISER_UNKNOWN_TEXT]);
  });

  it('keeps the reason of more than one source level and both hints E and F when a level has no data', () => {
    const view: CapacityView = {
      kind: 'solved',
      notDesignFlow: false,
      mainLine: 'Main level: not known yet',
      totalLine: 'Connected total: at least 250 m³/h (no concurrency factor)',
      rows: [],
      sharedLine: null,
      hints: [],
      designFlowHint: null,
      mainValue: 'not known yet',
      totalValue: 'at least 250 m³/h (no concurrency factor)',
      unknownReasonText: 'more than one source level',
      complete: false,
      unknown: true,
      loop: false,
      noUnit: false,
    };
    const lines = fittingRiserLinesOf(view, 'R1');
    expect(lines?.rows[0]).toEqual({ label: 'Main level', value: 'not known yet (more than one source level)', title: 'Main level: not known yet (more than one source level)' });
    expect(lines?.hints).toEqual([RISER_INCOMPLETE_TEXT, RISER_UNKNOWN_TEXT]);
  });
});

const sheetNamed = (fileName: string): BuildingSheet => ({
  id: fileName,
  levelId: 'l0',
  projectUuid: null,
  pageIndex: 0,
  displayName: fileName,
  location: { fileName },
});

function rebuildOf(ok: number, failedNames: string[]): RebuildResult {
  return {
    ok,
    failed: failedNames.map((name) => ({ sheet: sheetNamed(name), reason: 'the PDF could not be read' })),
    linked: 0,
    total: ok + failedNames.length,
    skipped: 0,
    cancelled: false,
  };
}

describe('rebuildNoticeText', () => {
  it('says that the rebuild did not run when there is no result', () => {
    expect(rebuildNoticeText(undefined)).toEqual({ text: 'The rebuild did not run. See the message in the header.', error: false });
  });

  it('gives the count and no error when every summary is read', () => {
    expect(rebuildNoticeText(rebuildOf(2, []))).toEqual({ text: 'Read 2 of 2 summaries.', error: false });
  });

  it('names the file and the reason of one failure, as an error', () => {
    expect(rebuildNoticeText(rebuildOf(1, ['plan-b.pdf']))).toEqual({
      text: 'Read 1 of 2 summaries. Failed: plan-b.pdf: the PDF could not be read.',
      error: true,
    });
  });

  it('names three failures and counts the rest', () => {
    expect(rebuildNoticeText(rebuildOf(0, ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']))).toEqual({
      text: 'Read 0 of 4 summaries. Failed: a.pdf: the PDF could not be read; b.pdf: the PDF could not be read; c.pdf: the PDF could not be read and 1 more.',
      error: true,
    });
  });
});
