import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingLevel } from './building.js';
import { solveBuildingFlow, type BuildingFlowResult } from './building-flow.js';
import type { RiserFittingFlow } from './flow.js';
import type { NetworkType } from './network.js';
import type { Riser, RiserArrowDirection, RiserMember } from './riser.js';
import { riserRingArrows, riserSpanDirections, type RiserNetworkTypeOf } from './riser-arrows.js';
import type { RiserNetworkSummary, SheetSummary } from './sheet-summary.js';

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

function fileWith(risers: Riser[]): BuildingFile {
  const levelList = LEVELS.slice(0, 3);
  return {
    schemaVersion: 1,
    id: 'b1',
    name: 'Building',
    levels: levelList,
    sheets: levelList.map((level, index) => ({
      id: `s${index}`,
      levelId: level.id,
      projectUuid: `p${index}`,
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

function open(terminals: [number, number, number], openEnds: [number | undefined, number | undefined, number | undefined]) {
  const file = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
  const entryOf = (index: 0 | 1 | 2) =>
    entry(['f'], terminals[index], false, openEnds[index] === undefined ? {} : { openEnds: openEnds[index] });
  const summaries = summariesOf(summary('p0', [entryOf(0)]), summary('p1', [entryOf(1)]), summary('p2', [entryOf(2)]));
  return { file, summaries };
}

const supplyOf: RiserNetworkTypeOf = (riser) => riser.networkType;
const ret = { ...vent, id: 'vent-return', flowSense: 'return' as const };
const returnOf: RiserNetworkTypeOf = () => ret;

function ring(below: RiserArrowDirection, above: RiserArrowDirection, pictogram: number | null, handSet = false) {
  return { pair: { below, above }, pictogram, handSet };
}

function solvedRings(file: BuildingFile, summaries: ReadonlyMap<string, SheetSummary>, typeOf: RiserNetworkTypeOf = supplyOf) {
  return riserRingArrows(file, solveBuildingFlow(file, summaries), typeOf);
}

describe('riserRingArrows with the solved flow', () => {
  it('source on L0: the spans point up and the rings take pictograms 2, 1 and 3', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('up', 'up', 1),
      l2: ring('up', 'none', 3),
    });
  });

  it('source on L2: the spans point down and the rings take pictograms 5, 4 and 6', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, true]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'down', 5),
      l1: ring('down', 'down', 4),
      l2: ring('down', 'none', 6),
    });
  });

  it('source on L1: the lower span points down and the upper span points up', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, true, false]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'down', 5),
      l1: ring('down', 'up', 7),
      l2: ring('up', 'none', 3),
    });
  });

  it('a source set by hand on L2 with no equipment gives the same rings as a source on L2', () => {
    const { summaries } = threeLevels([100, 500, 150], [false, false, false]);
    const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { sourceLevelId: 'l2' })]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'down', 5),
      l1: ring('down', 'down', 4),
      l2: ring('down', 'none', 6),
    });
  });

  it('no source: every ring has no arrow and the spans are unknown', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [false, false, false]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'none', null),
      l2: ring('none', 'none', null),
    });
    const flow = solveBuildingFlow(file, summaries);
    expect(riserSpanDirections(file, flow, supplyOf).R).toEqual([
      { fromLevelId: 'l0', toLevelId: 'l1', direction: 'unknown' },
      { fromLevelId: 'l1', toLevelId: 'l2', direction: 'unknown' },
    ]);
  });

  it('a group with atMost (Example 2) and a group with an open end and no sourceLevelId (Example 3) have no arrows', () => {
    const example2 = open([100, 0, 0], [0, 1, 1]);
    expect(solvedRings(example2.file, example2.summaries).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'none', null),
      l2: ring('none', 'none', null),
    });
    // In a real solve towardSource is absent here too. The gate on group.sourceLevelId alone is tested by the hand-made flow result below.
    const example3 = open([100, 0, 50], [0, 1, 0]);
    const flow = solveBuildingFlow(example3.file, example3.summaries);
    expect(flow.groups[0]!.sourceLevelId).toBeUndefined();
    expect(flow.risers.R!.spans[0]!.state).toBe('ok');
    expect(solvedRings(example3.file, example3.summaries).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'none', null),
      l2: ring('none', 'none', null),
    });
  });

  it('two sources: no arrows', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, true]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'none', null),
      l2: ring('none', 'none', null),
    });
  });

  it('a riser with two levels gives one arrow on each ring, and a riser with one member gives (none, none)', () => {
    const file = fileWith([makeRiser('R', [member(0), member(1)])]);
    const summaries = summariesOf(summary('p0', [entry(['f'], 100, true)]), summary('p1', [entry(['f'], 500)]));
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('up', 'none', 3),
    });

    const single = fileWith([makeRiser('S', [member(0)])]);
    const singleSummaries = summariesOf(summary('p0', [entry(['f'], 100, true)]));
    expect(solvedRings(single, singleSummaries).S).toEqual({ l0: ring('none', 'none', null) });
  });

  it('two risers that share one network: each riser gets its own arrows', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, true)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150)]),
    );
    const rings = solvedRings(file, summaries);
    expect(rings.A).toEqual({ l0: ring('none', 'up', 2), l1: ring('up', 'none', 3) });
    expect(rings.B).toEqual({ l1: ring('none', 'up', 2), l2: ring('up', 'none', 3) });
  });

  it('two risers that share one network with the source on another riser: both point toward the lower level', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'a'), member(1, 'a')]),
      makeRiser('B', [member(1, 'b'), member(2, 'b')]),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['a'], 100, false)]),
      summary('p1', [entry(['a', 'b'], 500)]),
      summary('p2', [entry(['b'], 150, true)]),
    );
    const rings = solvedRings(file, summaries);
    expect(rings.A).toEqual({ l0: ring('none', 'down', 5), l1: ring('down', 'none', 6) });
    expect(rings.B).toEqual({ l1: ring('none', 'down', 5), l2: ring('down', 'none', 6) });
  });

  it('a hand-set riser flow (up, down or both) does not change the rings', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    for (const flow of ['up', 'down', 'both'] as const) {
      const file = fileWith([makeRiser('R', [member(0), member(1), member(2)], { flow })]);
      expect(solvedRings(file, summaries).R).toEqual({
        l0: ring('none', 'up', 2),
        l1: ring('up', 'up', 1),
        l2: ring('up', 'none', 3),
      });
    }
  });

  it('a hand-set arrow pair on L1 wins over the derived pair and does not change the neighbors', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([
      makeRiser('R', [member(0), member(1, 'f', { arrows: { below: 'down', above: 'down' } }), member(2)]),
    ]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('down', 'down', 4, true),
      l2: ring('up', 'none', 3),
    });
  });

  it('a hand-set (none, none) on L1 gives no arrow on that ring and does not change the neighbors', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([
      makeRiser('R', [member(0), member(1, 'f', { arrows: { below: 'none', above: 'none' } }), member(2)]),
    ]);
    expect(solvedRings(file, summaries).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('none', 'none', null, true),
      l2: ring('up', 'none', 3),
    });
  });

  it('a return type points the spans toward the source, and a supply type on the same numbers gives pictogram 7', () => {
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, false, { networkTypeId: ret.id })]),
      summary('p1', [entry(['f'], 500, true, { networkTypeId: ret.id })]),
      summary('p2', [entry(['f'], 150, false, { networkTypeId: ret.id })]),
    );
    const returnFile = fileWith([
      makeRiser('R', [member(0), member(1), member(2)], { networkTypeId: ret.id, networkType: ret }),
    ]);
    expect(solvedRings(returnFile, summaries, returnOf).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('up', 'down', 8),
      l2: ring('down', 'none', 6),
    });

    const supplyFile = fileWith([makeRiser('R', [member(0), member(1), member(2)])]);
    expect(solvedRings(supplyFile, summaries, supplyOf).R!.l1).toEqual(ring('down', 'up', 7));
  });

  it('one network with two risers of different types: each span points away from or toward the main level', () => {
    const file = fileWith([
      makeRiser('A', [member(0, 'f'), member(1, 'f')]),
      makeRiser('B', [member(1, 'f'), member(2, 'f')], { networkTypeId: ret.id, networkType: ret }),
    ]);
    const summaries = summariesOf(
      summary('p0', [entry(['f'], 100, true)]),
      summary('p1', [entry(['f'], 500)]),
      summary('p2', [entry(['f'], 150)]),
    );
    const flow = solveBuildingFlow(file, summaries);
    expect(flow.groups).toHaveLength(1);
    expect(flow.groups[0]).toMatchObject({ riserIds: ['A', 'B'], sourceLevelId: 'l0' });
    const rings = solvedRings(file, summaries, supplyOf);
    expect(rings.A).toEqual({ l0: ring('none', 'up', 2), l1: ring('up', 'none', 3) });
    expect(rings.B).toEqual({ l1: ring('none', 'down', 5), l2: ring('down', 'none', 6) });
    expect(riserSpanDirections(file, flow, supplyOf).A).toEqual([{ fromLevelId: 'l0', toLevelId: 'l1', direction: 'up' }]);
    expect(riserSpanDirections(file, flow, supplyOf).B).toEqual([{ fromLevelId: 'l1', toLevelId: 'l2', direction: 'down' }]);
  });

  it('equal elevations: the span between them is unknown and the next span keeps its arrow', () => {
    const base = threeLevels([100, 500, 150], [true, false, false]);
    const file: BuildingFile = {
      ...base.file,
      levels: [
        { id: 'l0', name: 'L0', elevationMm: 0 },
        { id: 'l1', name: 'L1', elevationMm: 0 },
        { id: 'l2', name: 'L2', elevationMm: 6000 },
      ],
    };
    expect(solvedRings(file, base.summaries).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'up', 2),
      l2: ring('up', 'none', 3),
    });
    const flow = solveBuildingFlow(file, base.summaries);
    expect(riserSpanDirections(file, flow, supplyOf).R).toEqual([
      { fromLevelId: 'l0', toLevelId: 'l1', direction: 'unknown' },
      { fromLevelId: 'l1', toLevelId: 'l2', direction: 'up' },
    ]);
  });

  it('a member on a level that is not in the file has no ring, and the other rings do not change', () => {
    const { summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const file = fileWith([
      makeRiser('R', [member(0), member(1), member(2), { levelId: 'lx', sheetId: 's1', pageIndex: 0, fittingId: 'g' }]),
    ]);
    const rings = solvedRings(file, summaries);
    expect(rings.R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('up', 'up', 1),
      l2: ring('up', 'none', 3),
    });
    expect('lx' in rings.R!).toBe(false);
  });

  it('the network type comes from the callback, not from the riser', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    expect(file.risers[0]!.networkType).toEqual(vent);
    expect(solvedRings(file, summaries, returnOf).R).toEqual({
      l0: ring('none', 'down', 5),
      l1: ring('down', 'down', 4),
      l2: ring('down', 'none', 6),
    });
  });

  it('the flow sense comes from the library when the type has no flowSense', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    expect(riserRingArrows(file, flow, () => ({ id: 'return-air' })).R).toEqual({
      l0: ring('none', 'down', 5),
      l1: ring('down', 'down', 4),
      l2: ring('down', 'none', 6),
    });
    expect(riserRingArrows(file, flow, () => ({ id: 'something-else' })).R).toEqual({
      l0: ring('none', 'up', 2),
      l1: ring('up', 'up', 1),
      l2: ring('up', 'none', 3),
    });
  });
});

describe('riserSpanDirections and riserRingArrows with a hand-made flow result', () => {
  it('a group with no sourceLevelId gives unknown even when the span is ok and has towardSource', () => {
    const file = fileWith([
      makeRiser('R', [member(0), member(1)]),
      makeRiser('Q', [member(1), member(2)]),
      makeRiser('P', [member(0)]),
    ]);
    const flow: BuildingFlowResult = {
      risers: {
        R: {
          spans: [
            {
              riserId: 'R',
              fromLevelId: 'l0',
              toLevelId: 'l1',
              fromFittingId: 'f',
              toFittingId: 'f',
              capacity: 100,
              state: 'ok',
              complete: true,
              towardSource: 'from',
            },
          ],
          members: [],
        },
        Q: {
          spans: [
            {
              riserId: 'Q',
              fromLevelId: 'l1',
              toLevelId: 'l2',
              fromFittingId: 'f',
              toFittingId: 'f',
              capacity: 50,
              state: 'ok',
              complete: true,
              towardSource: 'from',
            },
          ],
          members: [],
        },
      },
      groups: [{ riserIds: ['R'], total: 100, complete: true, state: 'ok' }],
      warnings: [],
    };
    const directions = riserSpanDirections(file, flow, supplyOf);
    expect(directions.R).toEqual([{ fromLevelId: 'l0', toLevelId: 'l1', direction: 'unknown' }]);
    expect(directions.Q).toEqual([{ fromLevelId: 'l1', toLevelId: 'l2', direction: 'unknown' }]);
    expect(directions.P).toEqual([]);
    expect(Object.keys(directions).sort()).toEqual(['P', 'Q', 'R']);
    expect(riserRingArrows(file, flow, supplyOf).R).toEqual({
      l0: ring('none', 'none', null),
      l1: ring('none', 'none', null),
    });
  });
});

describe('riserSpanDirections', () => {
  it('gives the direction of each span of a source on L0', () => {
    const { file, summaries } = threeLevels([100, 500, 150], [true, false, false]);
    const flow = solveBuildingFlow(file, summaries);
    expect(riserSpanDirections(file, flow, supplyOf).R).toEqual([
      { fromLevelId: 'l0', toLevelId: 'l1', direction: 'up' },
      { fromLevelId: 'l1', toLevelId: 'l2', direction: 'up' },
    ]);
  });
});
