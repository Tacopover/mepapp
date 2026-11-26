import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel } from './building.js';
import { riserFlowInputsOf, solveBuildingFlow, type RiserNetworksLive } from './building-flow.js';
import type { BuildingFlowResult } from './building-flow.js';
import type { RiserFittingFlow } from './flow.js';
import type { NetworkType } from './network.js';
import type { Riser, RiserMember } from './riser.js';
import { deriveRiserFlow, type PerSheetRiserFittingFlow } from './riser-flow.js';
import { RISER_WARNING, type RiserNetworkSummary, type SheetSummary } from './sheet-summary.js';

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

const LEVELS: BuildingLevel[] = [
  { id: 'l0', name: 'L0', elevationMm: 0 },
  { id: 'l1', name: 'L1', elevationMm: 3000 },
  { id: 'l2', name: 'L2', elevationMm: 6000 },
  { id: 'l3', name: 'L3', elevationMm: 9000 },
];

function fileWith(risers: Riser[], opts: { projectUuids?: (string | null)[]; levelCount?: number } = {}): BuildingFile {
  const levelList = LEVELS.slice(0, opts.levelCount ?? 3);
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: levelList,
    sheets: levelList.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: opts.projectUuids === undefined ? `p${index}` : (opts.projectUuids[index] ?? null),
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
    risers,
  };
}

function member(index: number, fittingId = 'f', extra: Partial<RiserMember> = {}): RiserMember {
  return { levelId: `l${index}`, sheetId: `s${index}`, pageIndex: 0, fittingId, ...extra };
}

function makeRiser(id: string, members: RiserMember[], extra: Partial<Riser> = {}): Riser {
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
    ...extra,
  };
}

function entry(
  fittingIds: string[],
  terminalCapacity: number,
  hasSource = false,
  extra: Partial<RiserNetworkSummary> = {},
): RiserNetworkSummary {
  return { networkTypeId: vent.id, fittingIds, terminalCapacity, hasSource, ...extra };
}

function summary(projectUuid: string, entries?: RiserNetworkSummary[]): SheetSummary {
  const base: SheetSummary = {
    version: 2,
    projectUuid,
    savedAt: '2026-01-01T00:00:00Z',
    sourceSizeBytes: 0,
    sourceModifiedMs: 0,
    pages: {},
    tables: [],
    warnings: [],
  };
  if (entries === undefined) return base;
  const riserFittingFlow: Record<string, RiserFittingFlow> = {};
  for (const item of entries) {
    for (const fittingId of item.fittingIds) riserFittingFlow[fittingId] = item.hasSource ? 'out' : 'in';
  }
  return { ...base, riserNetworks: entries, riserFittingFlow };
}

function summariesOf(...list: SheetSummary[]): Map<string, SheetSummary> {
  return new Map(list.map((item) => [item.projectUuid, item] as const));
}

function threeLevels(terminals: [number, number, number], sources: [boolean, boolean, boolean]) {
  const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
  const summaries = summariesOf(
    summary('p0', [entry(['f'], terminals[0], sources[0])]),
    summary('p1', [entry(['f'], terminals[1], sources[1])]),
    summary('p2', [entry(['f'], terminals[2], sources[2])]),
  );
  return { file, summaries };
}

function hasWarning(warnings: string[], pattern: RegExp, ...mentions: string[]): boolean {
  return warnings.some((warning) => pattern.test(warning) && mentions.every((mention) => warning.includes(mention)));
}

function warningsMatching(warnings: string[], pattern: RegExp): string[] {
  return warnings.filter((warning) => pattern.test(warning));
}

function perLevelFlowOf(summaries: ReadonlyMap<string, SheetSummary>): PerSheetRiserFittingFlow {
  const flow: PerSheetRiserFittingFlow = {};
  for (let index = 0; index < 3; index++) {
    flow[`s${index}`] = summaries.get(`p${index}`)?.riserFittingFlow ?? {};
  }
  return flow;
}

function expectDerivedSourceAgrees(sources: [boolean, boolean, boolean], levelId: string): void {
  const { file, summaries } = threeLevels([100, 500, 150], sources);
  const result = solveBuildingFlow(file, summaries);
  const derived = deriveRiserFlow(file, perLevelFlowOf(summaries));
  expect(result.groups[0]!.sourceLevelId).toBe(levelId);
  expect(derived.R!.sourceLevelId).toBe(levelId);
}

describe('solveBuildingFlow', () => {
  it('solves the worked example with the source on level 0', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(riser.spans).toHaveLength(2);
    expect(riser.spans[0]).toMatchObject({ fromLevelId: 'l0', toLevelId: 'l1', capacity: 650, state: 'ok', complete: true });
    expect(riser.spans[1]).toMatchObject({ fromLevelId: 'l1', toLevelId: 'l2', capacity: 150, state: 'ok', complete: true });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ riserIds: ['R'], total: 750, complete: true, state: 'ok', sourceLevelId: 'l0' });
    expect(riser.members[0]).toMatchObject({ levelId: 'l0', role: 'source', capacityIn: 0, demandBeyond: 650 });
    expect(riser.members[1]).toMatchObject({ levelId: 'l1', role: 'entry', capacityIn: 650, demandBeyond: 150 });
    expect(riser.members[2]).toMatchObject({ levelId: 'l2', role: 'entry', capacityIn: 150, demandBeyond: 0 });
    expect(result.warnings).toEqual([]);
  });

  it('solves the worked example with the source on level 2', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, true]);
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(riser.spans[0]).toMatchObject({ fromLevelId: 'l0', toLevelId: 'l1', capacity: 100, state: 'ok', complete: true });
    expect(riser.spans[1]).toMatchObject({ fromLevelId: 'l1', toLevelId: 'l2', capacity: 600, state: 'ok', complete: true });
    expect(result.groups[0]).toMatchObject({ riserIds: ['R'], total: 750, complete: true, state: 'ok', sourceLevelId: 'l2' });
    expect(riser.members[2]).toMatchObject({ levelId: 'l2', role: 'source', demandBeyond: 600 });
    expect(riser.members[1]).toMatchObject({ levelId: 'l1', role: 'entry', capacityIn: 600, demandBeyond: 100 });
    expect(riser.members[0]).toMatchObject({ levelId: 'l0', role: 'entry', capacityIn: 100, demandBeyond: 0 });
  });

  it('solves the worked example with the source on level 1', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, true, false]);
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(riser.spans[0]).toMatchObject({ capacity: 100, state: 'ok', complete: true });
    expect(riser.spans[1]).toMatchObject({ capacity: 150, state: 'ok', complete: true });
    expect(result.groups[0]).toMatchObject({ riserIds: ['R'], total: 750, complete: true, state: 'ok', sourceLevelId: 'l1' });
    expect(riser.members[1]).toMatchObject({ levelId: 'l1', role: 'source', capacityIn: 0, demandBeyond: 250 });
    expect(riser.members[0]).toMatchObject({ levelId: 'l0', role: 'entry', capacityIn: 100, demandBeyond: 0 });
    expect(riser.members[2]).toMatchObject({ levelId: 'l2', role: 'entry', capacityIn: 150, demandBeyond: 0 });
  });

  it('skips a level with no member and joins the spans across the gap', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(3)])], { levelCount: 4 });
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['f'], 200)]),
      summary('p3', [entry(['f'], 300)]),
    );
    const result = solveBuildingFlow(file, summaries);
    const spans = result.risers.R!.spans;
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ fromLevelId: 'l0', toLevelId: 'l1', capacity: 500 });
    expect(spans[1]).toMatchObject({ fromLevelId: 'l1', toLevelId: 'l3', capacity: 300 });
  });

  it('joins two risers that share one network on a level', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ riserIds: ['A', 'B'], total: 750 });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: 650 });
    expect(result.risers.B!.spans[0]).toMatchObject({ capacity: 150 });
    expect(result.risers.A!.members[1]).toMatchObject({ levelId: 'l1', role: 'entry', capacityIn: 650, demandBeyond: 0 });
    expect(result.risers.B!.members[0]).toMatchObject({ levelId: 'l1', role: 'exit', capacityIn: 0, demandBeyond: 150 });
    expect(result.risers.B!.members[1]).toMatchObject({ levelId: 'l2', role: 'entry', capacityIn: 150 });
  });

  it('marks a loop of two risers as unknown and warns about the loop', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(0, 'b'), member(1, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a', 'b'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 600 });
    for (const riserId of ['A', 'B']) {
      const spans = result.risers[riserId]!.spans;
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({ capacity: null, state: 'unknown' });
    }
    expect(hasWarning(result.warnings, /loop/i)).toBe(true);
  });

  it('reports two sources as unknown and names both levels', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, true]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    const group = result.groups[0]!;
    expect(group).toMatchObject({ state: 'unknown', total: 750 });
    expect(group.sourceLevelId).toBeUndefined();
    const spans = result.risers.R!.spans;
    expect(spans).toHaveLength(2);
    for (const span of spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    for (const item of result.risers.R!.members) {
      expect(item).toMatchObject({ role: 'none', capacityIn: null, demandBeyond: null });
    }
    expect(hasWarning(result.warnings, /source/i, 'L0', 'L2')).toBe(true);
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });

  it('reports no source as unknown and warns that there is no source', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, false]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 750 });
    expect(result.groups[0]!.sourceLevelId).toBeUndefined();
    const spans = result.risers.R!.spans;
    expect(spans).toHaveLength(2);
    for (const span of spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    for (const item of result.risers.R!.members) {
      expect(item).toMatchObject({ role: 'none', capacityIn: null, demandBeyond: null });
    }
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
  });

  it('uses a hand-set source level and notes the equipment levels it overrides', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l1' })]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['f'], 500)]),
      summary('p2', [entry(['f'], 150, true)]),
    );
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(result.groups[0]).toMatchObject({ state: 'ok', sourceLevelId: 'l1' });
    expect(riser.spans[0]).toMatchObject({ capacity: 100, state: 'ok' });
    expect(riser.spans[1]).toMatchObject({ capacity: 150, state: 'ok' });
    expect(riser.members[1]).toMatchObject({ levelId: 'l1', role: 'source' });
    expect(warningsMatching(result.warnings, /set by hand/i)).toHaveLength(2);
    expect(hasWarning(result.warnings, /set by hand/i, 'L0')).toBe(true);
    expect(hasWarning(result.warnings, /set by hand/i, 'L2')).toBe(true);
  });

  it('solves a hand-set source level above the equipment', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l2' })]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: 100 });
    expect(result.risers.R!.spans[1]).toMatchObject({ capacity: 600 });
    expect(result.groups[0]).toMatchObject({ sourceLevelId: 'l2' });
  });

  it('ignores a hand-set source level that has no member and uses the equipment', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l9' })]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'ok', sourceLevelId: 'l0' });
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: 650, state: 'ok' });
    expect(result.risers.R!.spans[1]).toMatchObject({ capacity: 150, state: 'ok' });
    expect(hasWarning(result.warnings, /main level|hand/i)).toBe(true);
  });

  it('treats a level with equipment and hasSource false as a demand', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'ok', sourceLevelId: 'l0', total: 750 });
    expect(result.risers.R!.members[2]).toMatchObject({ levelId: 'l2', role: 'entry', capacityIn: 150, demandBeyond: 0 });
  });

  it('counts a missing summary as zero capacity and marks the spans incomplete', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    summaries.delete('p2');
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(riser.spans[0]).toMatchObject({ capacity: 500, complete: false });
    expect(riser.spans[1]).toMatchObject({ capacity: 0, complete: false });
    expect(result.groups[0]).toMatchObject({ complete: false, total: 600 });
    expect(hasWarning(result.warnings, /summar/i, 'L2')).toBe(true);
    expect(riser.members[2]).toMatchObject({ levelId: 'l2', role: 'none', capacityIn: null });
  });

  it('treats a summary without riser data as a node with zero capacity', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    summaries.set('p1', summary('p1'));
    const result = solveBuildingFlow(file, summaries);
    const riser = result.risers.R!;
    expect(hasWarning(result.warnings, /no riser data/i, 'L1')).toBe(true);
    expect(riser.spans[0]).toMatchObject({ capacity: 150, complete: false });
    expect(riser.spans[1]).toMatchObject({ capacity: 150, complete: true });
  });

  it('names the level once in the warnings of a missing summary', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    summaries.delete('p2');
    summaries.set('p1', summary('p1'));
    const { warnings } = solveBuildingFlow(file, summaries);
    expect(warnings).toContain('L2 has no saved summary. Read the summaries.');
    expect(warnings).toContain('The summary of L1 has no riser data. Read the summaries.');
  });

  it('warns that a member sheet is not linked to a project', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])], { projectUuids: ['p0', null, 'p2'] });
    const summaries = summariesOf(summary('p0', [entry(['f'], 100, true)]), summary('p2', [entry(['f'], 150)]));
    const result = solveBuildingFlow(file, summaries);
    expect(hasWarning(result.warnings, /not linked/i, 'L1')).toBe(true);
  });

  it('warns that a riser fitting is in no segment network and counts that level as zero', () => {
    const { file } = threeLevels([100, 500, 150], [true, false, false]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['other'], 500)]),
      summary('p2', [entry(['f'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(hasWarning(result.warnings, /no segment/i, 'L1')).toBe(true);
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: 150 });
    expect(result.risers.R!.spans[1]).toMatchObject({ capacity: 150 });
  });

  it('ignores the end rows and solves the same numbers', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([
      makeRiser('R', [member(0), member(1), member(2)], { topEnd: 'open', bottomEnd: 'capped', endAllowanceMm: 500 }),
    ]);
    const result = solveBuildingFlow(file, summaries);
    const spans = result.risers.R!.spans;
    expect(spans.map((span) => span.toLevelId)).toEqual(['l1', 'l2']);
    expect(spans[0]).toMatchObject({ capacity: 650 });
    expect(spans[1]).toMatchObject({ capacity: 150 });
    expect(result.groups[0]).toMatchObject({ total: 750, state: 'ok', sourceLevelId: 'l0' });
  });

  it('solves without any riser data and warns once for each level', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(summary('p0'), summary('p1'), summary('p2'));
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 0, complete: false });
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    expect(warningsMatching(result.warnings, /no riser data/i)).toHaveLength(3);
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });

  it('counts a project once when two of its sheets share one entry', () => {
    const file = fileWith(
      [makeRiser('A', [member(0, 'a'), member(1, 'f')]), makeRiser('B', [member(2, 'b'), member(3, 'c')])],
      { levelCount: 4, projectUuids: ['p0', 'p1', 'p0', 'p3'] },
    );
    const summaries = summariesOf(
      summary('p0', [entry(['a', 'b'], 100)]),
      summary('p1', [entry(['f'], 500, true)]),
      summary('p3', [entry(['c'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ riserIds: ['A', 'B'], total: 750, state: 'ok', sourceLevelId: 'l1' });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: 250, state: 'ok' });
    expect(result.risers.B!.spans[0]).toMatchObject({ capacity: 150, state: 'ok' });
    expect(result.risers.A!.members[0]).toMatchObject({ levelId: 'l0', role: 'entry', capacityIn: 250, demandBeyond: 0 });
    expect(result.risers.B!.members[0]).toMatchObject({ levelId: 'l2', role: 'exit', capacityIn: 0, demandBeyond: 150 });
    expect(result.risers.A!.members[1]).toMatchObject({ levelId: 'l1', role: 'source', demandBeyond: 250 });
  });

  it('replaces the stored summary of the live project and counts it once', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const live: RiserNetworksLive = { projectUuid: 'p1', riserNetworks: [entry(['f'], 800)] };
    const result = solveBuildingFlow(file, summaries, live);
    const spans = result.risers.R!.spans;
    expect(spans[0]).toMatchObject({ capacity: 950 });
    expect(spans[1]).toMatchObject({ capacity: 150 });
    expect(result.groups[0]).toMatchObject({ total: 1050 });
  });

  it('uses the live data when the stored summary of its project is missing', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    summaries.delete('p1');
    const live: RiserNetworksLive = { projectUuid: 'p1', riserNetworks: [entry(['f'], 800)] };
    const result = solveBuildingFlow(file, summaries, live);
    const spans = result.risers.R!.spans;
    expect(spans[0]).toMatchObject({ capacity: 950 });
    expect(spans[1]).toMatchObject({ capacity: 150 });
    expect(result.groups[0]).toMatchObject({ total: 1050 });
    expect(result.warnings.some((warning) => warning.includes('L1'))).toBe(false);
  });

  it('keeps the numbers when the live data belongs to a project that no member uses', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const live: RiserNetworksLive = { projectUuid: 'p9', riserNetworks: [entry(['f'], 999)] };
    const result = solveBuildingFlow(file, summaries, live);
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: 650 });
    expect(result.risers.R!.spans[1]).toMatchObject({ capacity: 150 });
    expect(result.groups[0]).toMatchObject({ total: 750 });
  });

  it('warns when a linked entry has another network type', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [{ ...entry(['f'], 500), networkTypeId: 'other' }]),
      summary('p2', [entry(['f'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(hasWarning(result.warnings, /another network type/i, 'L1', 'R')).toBe(true);
  });

  it('copies the warnings of a linked entry and names the level', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [{ ...entry(['f'], 500), warnings: ['Riser fitting is not an open end.'] }]),
      summary('p2', [entry(['f'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(hasWarning(result.warnings, /not an open end/i, 'L1')).toBe(true);
  });

  it('solves a riser with one member without spans and without a group', () => {
    const file = fileWith([makeRiser('R', [member(0)])]);
    const summaries = summariesOf(summary('p0', [entry(['f'], 100, true)]));
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.R!.spans).toEqual([]);
    expect(result.risers.R!.members).toHaveLength(1);
    expect(result.risers.R!.members[0]).toMatchObject({ role: 'none', capacityIn: null });
    expect(result.groups).toEqual([]);
  });

  it('solves a riser with no members to empty lists', () => {
    const file = fileWith([makeRiser('R', [])]);
    const result = solveBuildingFlow(file, summariesOf());
    expect(result.risers.R).toEqual({ spans: [], members: [] });
  });

  it('ignores a member on a level that the file does not have', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([
      makeRiser('R', [member(0), member(1), { levelId: 'zz', sheetId: 's0', pageIndex: 0, fittingId: 'f' }, member(2)]),
    ]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.R!.spans).toHaveLength(2);
    expect(result.risers.R!.members).toHaveLength(3);
  });

  it('agrees with deriveRiserFlow on the source level for the source on level 0', () => {
    expectDerivedSourceAgrees([true, false, false], 'l0');
  });

  it('agrees with deriveRiserFlow on the source level for the source on level 2', () => {
    expectDerivedSourceAgrees([false, false, true], 'l2');
  });

  it('agrees with deriveRiserFlow on the source level for the source on level 1', () => {
    expectDerivedSourceAgrees([false, true, false], 'l1');
  });

  it('agrees with deriveRiserFlow on a hand-set source level', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l1' })]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['f'], 500)]),
      summary('p2', [entry(['f'], 150, true)]),
    );
    const result = solveBuildingFlow(file, summaries);
    const derived = deriveRiserFlow(file, perLevelFlowOf(summaries));
    expect(result.groups[0]!.sourceLevelId).toBe('l1');
    expect(derived.R!.sourceLevelId).toBe('l1');
  });

  it('documents the intended disagreement: two sources', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, true]);
    const result = solveBuildingFlow(file, summaries);
    const derived = deriveRiserFlow(file, perLevelFlowOf(summaries));
    expect(derived.R!.sourceLevelId).toBe('l0');
    expect(derived.R!.flow).toBe('both');
    expect(result.groups[0]!.state).toBe('unknown');
    expect(result.groups[0]!.sourceLevelId).toBeUndefined();
  });

  it('two levels with no data and the same fitting id make no loop', () => {
    const { file } = threeLevels([100, 500, 150], [true, false, false]);
    const result = solveBuildingFlow(file, new Map());
    expect(warningsMatching(result.warnings, /loop/i)).toEqual([]);
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ state: 'unknown' });
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
  });

  it('risers that meet on a level with no data stay in one group', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(summary('p0', [entry(['a'], 100, true)]), summary('p2', [entry(['b'], 150)]));
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      riserIds: ['A', 'B'],
      state: 'ok',
      total: 250,
      complete: false,
      sourceLevelId: 'l0',
    });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: 150, complete: false });
    expect(result.risers.B!.spans[0]).toMatchObject({ capacity: 150, complete: true });
    expect(hasWarning(result.warnings, /no saved summary/i, 'L1')).toBe(true);
  });

  it('two networks of one level that use two different risers', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, true)]),
      summary('p1', [entry(['a'], 200), entry(['b'], 300)]),
      summary('p2', [entry(['b'], 150, true)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({ riserIds: ['A'], total: 300, state: 'ok', sourceLevelId: 'l0' });
    expect(result.groups[1]).toMatchObject({ riserIds: ['B'], total: 450, state: 'ok', sourceLevelId: 'l2' });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: 200 });
    expect(result.risers.B!.spans[0]).toMatchObject({ capacity: 300 });
    expect(result.risers.B!.members[0]).toMatchObject({ levelId: 'l1', role: 'entry', capacityIn: 300, demandBeyond: 0 });
  });

  it('a span with both ends in one network is a loop', () => {
    const file = fileWith([makeRiser('R', [member(0, 'a'), member(1, 'b')])], {
      levelCount: 2,
      projectUuids: ['p0', 'p0'],
    });
    const summaries = summariesOf(summary('p0', [entry(['a', 'b'], 100, true)]));
    expect(() => solveBuildingFlow(file, summaries)).not.toThrow();
    const result = solveBuildingFlow(file, summaries);
    expect(hasWarning(result.warnings, /loop/i)).toBe(true);
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: null, state: 'unknown' });
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 100 });
  });

  it('takes the live data of several projects from a list', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const lives: RiserNetworksLive[] = [
      { projectUuid: 'p1', riserNetworks: [entry(['f'], 400)] },
      { projectUuid: 'p2', riserNetworks: [entry(['f'], 250)] },
    ];
    const result = solveBuildingFlow(file, summaries, lives);
    const spans = result.risers.R!.spans;
    expect(spans[0]).toMatchObject({ capacity: 650, state: 'ok', complete: true });
    expect(spans[1]).toMatchObject({ capacity: 250, state: 'ok', complete: true });
    expect(result.groups[0]).toMatchObject({ total: 750, state: 'ok', sourceLevelId: 'l0' });
  });

  it('uses the live data of a list when the stored summary of its project is missing', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    summaries.delete('p2');
    const lives: RiserNetworksLive[] = [{ projectUuid: 'p2', riserNetworks: [entry(['f'], 250)] }];
    const result = solveBuildingFlow(file, summaries, lives);
    const spans = result.risers.R!.spans;
    expect(spans[0]).toMatchObject({ capacity: 750, state: 'ok', complete: true });
    expect(spans[1]).toMatchObject({ capacity: 250, state: 'ok', complete: true });
    expect(result.groups[0]).toMatchObject({ total: 850, state: 'ok', sourceLevelId: 'l0' });
    expect(result.warnings.some((warning) => warning.includes('L2'))).toBe(false);
  });

  it('lets the first of two live entries with the same project id win', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const lives: RiserNetworksLive[] = [
      { projectUuid: 'p1', riserNetworks: [entry(['f'], 800)] },
      { projectUuid: 'p1', riserNetworks: [entry(['f'], 300)] },
    ];
    const result = solveBuildingFlow(file, summaries, lives);
    expect(result.risers.R!.spans[0]).toMatchObject({ capacity: 950 });
    expect(result.groups[0]).toMatchObject({ total: 1050 });
    expect(result).toEqual(solveBuildingFlow(file, summaries, [lives[0]!]));
  });

  it('solves an empty list the same as no live data', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    expect(solveBuildingFlow(file, summaries, [])).toEqual(solveBuildingFlow(file, summaries));
  });

  it('solves a single live object the same as a list with that object', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const live: RiserNetworksLive = { projectUuid: 'p1', riserNetworks: [entry(['f'], 800)] };
    expect(solveBuildingFlow(file, summaries, [live])).toEqual(solveBuildingFlow(file, summaries, live));
  });
});

describe('riserFlowInputsOf', () => {
  it('maps the source sheet to an exit with the demand beyond it', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's0')).toEqual({ f: { role: 'exit', demandBeyond: 650 } });
    expect(riserFlowInputsOf(result, 's1')).toEqual({ f: { role: 'entry', demandBeyond: 150 } });
    expect(riserFlowInputsOf(result, 's2')).toEqual({ f: { role: 'entry', demandBeyond: 0 } });
  });

  it('maps the source on level 1 to an exit with its demand beyond', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, true, false]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's1')).toEqual({ f: { role: 'exit', demandBeyond: 250 } });
  });

  it('keys the entries by fitting id when two risers share a level', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's1')).toEqual({
      a: { role: 'entry', demandBeyond: 0 },
      b: { role: 'exit', demandBeyond: 150 },
    });
  });

  it('returns no entries when the solve is unknown', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, true]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's0')).toEqual({});
  });

  it('returns no entries for a sheet with no member', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(3)])], { levelCount: 4 });
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['f'], 200)]),
      summary('p3', [entry(['f'], 300)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's2')).toEqual({});
  });

  it('returns an exit for the second sheet of one project', () => {
    const file = fileWith(
      [makeRiser('A', [member(0, 'a'), member(1, 'f')]), makeRiser('B', [member(2, 'b'), member(3, 'c')])],
      { levelCount: 4, projectUuids: ['p0', 'p1', 'p0', 'p3'] },
    );
    const summaries = summariesOf(
      summary('p0', [entry(['a', 'b'], 100)]),
      summary('p1', [entry(['f'], 500, true)]),
      summary('p3', [entry(['c'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's2')).toEqual({ b: { role: 'exit', demandBeyond: 150 } });
  });

  it('adds the demand of two members that share one fitting id', () => {
    const exitAndEntry: BuildingFlowResult = {
      risers: {
        A: {
          spans: [],
          members: [
            { riserId: 'A', levelId: 'l0', sheetId: 's0', fittingId: 'f', role: 'exit', capacityIn: 0, demandBeyond: 100 },
          ],
        },
        B: {
          spans: [],
          members: [
            { riserId: 'B', levelId: 'l0', sheetId: 's0', fittingId: 'f', role: 'entry', capacityIn: 50, demandBeyond: 20 },
          ],
        },
      },
      groups: [],
      warnings: [],
    };
    expect(riserFlowInputsOf(exitAndEntry, 's0')).toEqual({ f: { role: 'entry', demandBeyond: 120 } });
    const twoExits: BuildingFlowResult = {
      risers: {
        A: {
          spans: [],
          members: [
            { riserId: 'A', levelId: 'l0', sheetId: 's0', fittingId: 'f', role: 'exit', capacityIn: 0, demandBeyond: 100 },
          ],
        },
        B: {
          spans: [],
          members: [
            { riserId: 'B', levelId: 'l0', sheetId: 's0', fittingId: 'f', role: 'exit', capacityIn: 0, demandBeyond: 30 },
          ],
        },
      },
      groups: [],
      warnings: [],
    };
    expect(riserFlowInputsOf(twoExits, 's0')).toEqual({ f: { role: 'exit', demandBeyond: 130 } });
  });
});

describe('solveBuildingFlow with no source (the highest rule)', () => {
  function open(terminals: [number, number, number], openEnds: [number | undefined, number | undefined, number | undefined]) {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const entryOf = (index: 0 | 1 | 2) =>
      entry(['f'], terminals[index], false, openEnds[index] === undefined ? {} : { openEnds: openEnds[index] });
    const summaries = summariesOf(summary('p0', [entryOf(0)]), summary('p1', [entryOf(1)]), summary('p2', [entryOf(2)]));
    return { file, summaries };
  }

  it('Example 2: one terminal on L0, an open end on L1 and L2', () => {
    const { file, summaries } = open([100, 0, 0], [0, 1, 1]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toEqual([{ riserIds: ['R'], total: 100, complete: true, state: 'ok', atMost: true }]);
    const spans = result.risers.R!.spans;
    expect(spans).toHaveLength(2);
    for (const span of spans) expect(span).toMatchObject({ capacity: 100, state: 'ok', complete: true, atMost: true });
    const [m0, m1, m2] = result.risers.R!.members;
    expect(m0).toMatchObject({ levelId: 'l0', role: 'open', capacityIn: null, demandBeyond: 0, sides: [{ demand: 0, openEnds: 2 }] });
    expect(m1).toMatchObject({
      levelId: 'l1',
      role: 'open',
      capacityIn: null,
      demandBeyond: 100,
      sides: [
        { demand: 100, openEnds: 0 },
        { demand: 0, openEnds: 1 },
      ],
    });
    expect(m2).toMatchObject({ levelId: 'l2', role: 'open', demandBeyond: 100, sides: [{ demand: 100, openEnds: 1 }] });
    expect(result.warnings).toEqual([]);
  });

  it('Example 3: one open end on L1 (K = 1) gives plain numbers', () => {
    const { file, summaries } = open([100, 0, 50], [0, 1, 0]);
    const result = solveBuildingFlow(file, summaries);
    const group = result.groups[0]!;
    expect(group).toMatchObject({ state: 'ok', total: 150, complete: true });
    expect('atMost' in group).toBe(false);
    expect(group.sourceLevelId).toBeUndefined();
    const spans = result.risers.R!.spans;
    expect(spans.map((span) => span.capacity)).toEqual([100, 50]);
    for (const span of spans) {
      expect(span).toMatchObject({ state: 'ok', complete: true });
      expect('atMost' in span).toBe(false);
    }
    expect(result.risers.R!.members[1]).toMatchObject({
      role: 'open',
      demandBeyond: 150,
      sides: [
        { demand: 100, openEnds: 0 },
        { demand: 50, openEnds: 0 },
      ],
    });
  });

  it('Example 5: three levels with one open end each give 650 and 600', () => {
    const { file, summaries } = open([100, 500, 150], [1, 1, 1]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'ok', total: 750, complete: true, atMost: true });
    expect(result.groups[0]!.sourceLevelId).toBeUndefined();
    const spans = result.risers.R!.spans;
    expect(spans.map((span) => span.capacity)).toEqual([650, 600]);
    for (const span of spans) expect(span).toMatchObject({ state: 'ok', complete: true, atMost: true });
    expect(result.risers.R!.members[1]).toMatchObject({
      role: 'open',
      sides: [
        { demand: 100, openEnds: 1 },
        { demand: 150, openEnds: 1 },
      ],
    });
  });

  it('two risers in one tree: each span follows the rule', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, false, { openEnds: 0 })]),
      summary('p1', [entry(['a', 'b'], 300, false, { openEnds: 1 })]),
      summary('p2', [entry(['b'], 50, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ state: 'ok', total: 450, atMost: true });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: 100, state: 'ok', atMost: true });
    expect(result.risers.B!.spans[0]).toMatchObject({ capacity: 400, state: 'ok', atMost: true });
    expect(result.risers.A!.members[1]).toMatchObject({ role: 'open', sides: [{ demand: 100, openEnds: 0 }] });
    expect(result.risers.B!.members[0]).toMatchObject({ role: 'open', sides: [{ demand: 50, openEnds: 1 }] });
  });

  it('a missing level keeps the group unknown with the old warning', () => {
    const { file } = open([100, 500, 150], [1, 1, 1]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { openEnds: 1 })]),
      summary('p1', [entry(['f'], 500, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', complete: false });
    expect('atMost' in result.groups[0]!).toBe(false);
    for (const span of result.risers.R!.spans) {
      expect(span).toMatchObject({ capacity: null, state: 'unknown' });
      expect('atMost' in span).toBe(false);
    }
    for (const item of result.risers.R!.members) expect(item.role).toBe('none');
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
  });

  it('a loop keeps the old result', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(0, 'b'), member(1, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a', 'b'], 100, false, { openEnds: 1 })]),
      summary('p1', [entry(['a', 'b'], 500, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 600 });
    expect(result.risers.A!.spans[0]).toMatchObject({ capacity: null, state: 'unknown' });
    expect(hasWarning(result.warnings, /loop/i)).toBe(true);
  });

  it('two sources keep the group unknown', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true, { openEnds: 1 })]),
      summary('p1', [entry(['f'], 500, false, { openEnds: 1 })]),
      summary('p2', [entry(['f'], 150, true, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 750 });
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    expect(hasWarning(result.warnings, /more than one source/i)).toBe(true);
  });

  it('no open end anywhere keeps the group unknown with the old warning', () => {
    const { file, summaries } = open([100, 500, 150], [0, 0, 0]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 750 });
    expect('atMost' in result.groups[0]!).toBe(false);
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    for (const item of result.risers.R!.members) expect(item.role).toBe('none');
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
    expect(hasWarning(result.warnings, /open-end data/i)).toBe(false);
  });

  it('a hand-set level with no equipment uses the old rule and is not at most', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l1' })]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { openEnds: 1 })]),
      summary('p1', [entry(['f'], 500, false, { openEnds: 1 })]),
      summary('p2', [entry(['f'], 150, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    const group = result.groups[0]!;
    expect(group).toMatchObject({ state: 'ok', sourceLevelId: 'l1', total: 750 });
    expect('atMost' in group).toBe(false);
    const spans = result.risers.R!.spans;
    expect(spans.map((span) => span.capacity)).toEqual([100, 150]);
    for (const span of spans) expect('atMost' in span).toBe(false);
    expect(result.risers.R!.members.map((item) => item.role)).toEqual(['entry', 'source', 'entry']);
  });

  it('a node with the riser warning turns the mode off', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { openEnds: 1 })]),
      summary('p1', [entry(['f'], 500, false, { openEnds: 1, warnings: [RISER_WARNING] })]),
      summary('p2', [entry(['f'], 150, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 750 });
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
    expect(hasWarning(result.warnings, /not an open end/i, 'L1')).toBe(true);
  });

  it('a summary with no open-end count keeps the group unknown and adds one note for that level', () => {
    const { file, summaries } = open([100, 500, 150], [1, undefined, 1]);
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'unknown', total: 750 });
    for (const span of result.risers.R!.spans) expect(span).toMatchObject({ capacity: null, state: 'unknown' });
    expect(hasWarning(result.warnings, /no source/i)).toBe(true);
    expect(warningsMatching(result.warnings, /open-end data/i)).toEqual([
      'The summary of L1 has no open-end data. Read the summaries.',
    ]);
  });

  it('a drain riser uses the rule like any other type', () => {
    const drain: NetworkType = { ...vent, id: 'sanitary-waste', name: 'Waste' };
    const file = fileWith([
      makeRiser('R', [member(0), member(1), member(2)], { networkTypeId: drain.id, networkType: drain }),
    ]);
    const drainEntry = (terminal: number) =>
      entry(['f'], terminal, false, { openEnds: 1, networkTypeId: drain.id });
    const summaries = summariesOf(
      summary('p0', [drainEntry(100)]),
      summary('p1', [drainEntry(500)]),
      summary('p2', [drainEntry(150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.groups[0]).toMatchObject({ state: 'ok', atMost: true });
    expect(result.risers.R!.spans.map((span) => span.capacity)).toEqual([650, 600]);
  });

  it('settle: an equipment on L0 turns the mode off and gives 650 and 150', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true, { openEnds: 1 })]),
      summary('p1', [entry(['f'], 500, false, { openEnds: 1 })]),
      summary('p2', [entry(['f'], 150, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    const group = result.groups[0]!;
    expect(group).toMatchObject({ state: 'ok', sourceLevelId: 'l0', total: 750 });
    expect('atMost' in group).toBe(false);
    const spans = result.risers.R!.spans;
    expect(spans.map((span) => span.capacity)).toEqual([650, 150]);
    for (const span of spans) expect('atMost' in span).toBe(false);
    expect(result.risers.R!.members.map((item) => item.role)).toEqual(['source', 'entry', 'entry']);
    expect(result.risers.R!.members.some((item) => 'sides' in item)).toBe(false);
  });

  it('riserFlowInputsOf gives role open, the sum of the sides and the sides for an open member (Example 5)', () => {
    const { file, summaries } = open([100, 500, 150], [1, 1, 1]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's1')).toEqual({
      f: {
        role: 'open',
        demandBeyond: 250,
        sides: [
          { demand: 100, openEnds: 1 },
          { demand: 150, openEnds: 1 },
        ],
      },
    });
  });

  it('riserFlowInputsOf for Example 2 gives exact sides on each level', () => {
    const { file, summaries } = open([100, 0, 0], [0, 1, 1]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's0')).toEqual({
      f: { role: 'open', demandBeyond: 0, sides: [{ demand: 0, openEnds: 2 }] },
    });
    expect(riserFlowInputsOf(result, 's1')).toEqual({
      f: {
        role: 'open',
        demandBeyond: 100,
        sides: [
          { demand: 100, openEnds: 0 },
          { demand: 0, openEnds: 1 },
        ],
      },
    });
    expect(riserFlowInputsOf(result, 's2')).toEqual({
      f: { role: 'open', demandBeyond: 100, sides: [{ demand: 100, openEnds: 1 }] },
    });
  });

  it('riserFlowInputsOf for Example 3 gives exact sides on level 1', () => {
    const { file, summaries } = open([100, 0, 50], [0, 1, 0]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's1')).toEqual({
      f: {
        role: 'open',
        demandBeyond: 150,
        sides: [
          { demand: 100, openEnds: 0 },
          { demand: 50, openEnds: 0 },
        ],
      },
    });
  });

  it('riserFlowInputsOf gives no key for a member of a group that is not solved', () => {
    const { file, summaries } = open([100, 500, 150], [0, 0, 0]);
    const result = solveBuildingFlow(file, summaries);
    expect(riserFlowInputsOf(result, 's1')).toEqual({});
  });

  it('riserFlowInputsOf joins the sides and adds the demands when two open members share one fitting id', () => {
    const base = { sheetId: 's1', levelId: 'l1', fittingId: 'f', role: 'open' as const, capacityIn: null };
    const result = {
      risers: {
        A: { spans: [], members: [{ ...base, riserId: 'A', demandBeyond: 100, sides: [{ demand: 100, openEnds: 0 }] }] },
        B: { spans: [], members: [{ ...base, riserId: 'B', demandBeyond: 30, sides: [{ demand: 20, openEnds: 1 }, { demand: 10, openEnds: 0 }] }] },
      },
      groups: [],
      warnings: [],
    };
    expect(riserFlowInputsOf(result, 's1')).toEqual({
      f: {
        role: 'open',
        demandBeyond: 130,
        sides: [
          { demand: 100, openEnds: 0 },
          { demand: 20, openEnds: 1 },
          { demand: 10, openEnds: 0 },
        ],
      },
    });
  });
});

describe('solveBuildingFlow towardSource', () => {
  it('points both spans to the source on level 0', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const spans = solveBuildingFlow(file, summaries).risers.R!.spans;
    expect(spans[0]!.towardSource).toBe('from');
    expect(spans[1]!.towardSource).toBe('from');
  });

  it('points both spans to the source on level 2', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, true]);
    const spans = solveBuildingFlow(file, summaries).risers.R!.spans;
    expect(spans[0]!.towardSource).toBe('to');
    expect(spans[1]!.towardSource).toBe('to');
  });

  it("has towardSource 'to' on the lower span and 'from' on the upper span for the source on level 1", () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, true, false]);
    const spans = solveBuildingFlow(file, summaries).risers.R!.spans;
    expect(spans[0]!.towardSource).toBe('to');
    expect(spans[1]!.towardSource).toBe('from');
  });

  it('matches the source on level 1 for a hand-set source level with no equipment', () => {
    const { summaries } = threeLevels([100, 500, 150], [false, false, false]);
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l1' })]);
    const spans = solveBuildingFlow(file, summaries).risers.R!.spans;
    expect(spans[0]!.towardSource).toBe('to');
    expect(spans[1]!.towardSource).toBe('from');
  });

  it('points to the source of another riser of the group', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.A!.spans[0]!.towardSource).toBe('from');
    expect(result.risers.B!.spans[0]!.towardSource).toBe('from');
  });

  it('points to the source of another riser of the group when the source moves to the other riser', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150, true)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.A!.spans[0]!.towardSource).toBe('to');
    expect(result.risers.B!.spans[0]!.towardSource).toBe('to');
  });

  it('leaves towardSource undefined when the group has no source', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, false]);
    for (const span of solveBuildingFlow(file, summaries).risers.R!.spans) {
      expect(span.towardSource).toBeUndefined();
    }
  });

  it('leaves towardSource undefined when the group has two sources', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, true]);
    for (const span of solveBuildingFlow(file, summaries).risers.R!.spans) {
      expect(span.towardSource).toBeUndefined();
    }
  });

  it('leaves towardSource undefined on the spans of the highest rule', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { openEnds: 0 })]),
      summary('p1', [entry(['f'], 0, false, { openEnds: 1 })]),
      summary('p2', [entry(['f'], 0, false, { openEnds: 1 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.R!.spans.map((span) => span.atMost)).toEqual([true, true]);
    for (const span of result.risers.R!.spans) expect(span.towardSource).toBeUndefined();
  });

  it('leaves towardSource undefined on the spans of the highest rule with one open end on L1', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { openEnds: 0 })]),
      summary('p1', [entry(['f'], 0, false, { openEnds: 1 })]),
      summary('p2', [entry(['f'], 50, false, { openEnds: 0 })]),
    );
    const result = solveBuildingFlow(file, summaries);
    for (const span of result.risers.R!.spans) expect(span.towardSource).toBeUndefined();
  });

  it('leaves towardSource undefined on the spans of a loop', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(0, 'b'), member(1, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a', 'b'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
    );
    const result = solveBuildingFlow(file, summaries);
    expect(result.risers.A!.spans[0]!.towardSource).toBeUndefined();
    expect(result.risers.B!.spans[0]!.towardSource).toBeUndefined();
  });
});
