import type { BuildingFile, BuildingLevel, NetworkType, Riser, RiserMember, RiserNetworkSummary, SheetSummary } from '@mepapp/core';
import { describe, expect, it, vi } from 'vitest';
import { computeRiserFlow, RiserFlowSender, sameRiserFlowInputs, type RiserFlowInputs } from './riserFlowSync.js';

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

/** One riser R1 with a member on each of the three levels, fitting f. Stored terminals 100 (source), 500, 150. */
function threeLevelsSetup(): { file: BuildingFile; summaries: Map<string, SheetSummary> } {
  const file = fileWith([riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)])]);
  const summaries = summariesOf(
    summaryOf('p0', [entryOf(['f'], 100, true)]),
    summaryOf('p1', [entryOf(['f'], 500)]),
    summaryOf('p2', [entryOf(['f'], 150)]),
  );
  return { file, summaries };
}

describe('computeRiserFlow', () => {
  it('gives the inputs of the open sheet from the stored summaries', () => {
    const { file, summaries } = threeLevelsSetup();
    const onP1 = computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 500)] });
    expect(onP1?.sheetId).toBe('s1');
    expect(onP1?.inputs).toEqual({ f: { role: 'entry', demandBeyond: 150 } });
    const onP0 = computeRiserFlow({ file, projectUuid: 'p0', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 100, true)] });
    expect(onP0?.inputs).toEqual({ f: { role: 'exit', demandBeyond: 650 } });
    const onP2 = computeRiserFlow({ file, projectUuid: 'p2', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 150)] });
    expect(onP2?.inputs).toEqual({ f: { role: 'entry', demandBeyond: 0 } });
  });

  it('replaces the stored summary of the open project with the live data', () => {
    const { file, summaries } = threeLevelsSetup();
    const liveNetworksOf = vi.fn((): RiserNetworkSummary[] => [entryOf(['f'], 700)]);
    const result = computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf });
    expect(result?.flow.groups[0]?.total).toBe(100 + 700 + 150);
    expect(liveNetworksOf).toHaveBeenCalledTimes(1);
    expect(liveNetworksOf).toHaveBeenCalledWith(['f']);
  });

  it('returns null and does not call liveNetworksOf when there is nothing to send', () => {
    const { file, summaries } = threeLevelsSetup();
    const cases: { file: BuildingFile | null; projectUuid: string | null; pageIndex: number }[] = [
      { file: null, projectUuid: 'p1', pageIndex: 0 },
      { file: fileWith([]), projectUuid: 'p1', pageIndex: 0 },
      { file, projectUuid: null, pageIndex: 0 },
      { file, projectUuid: 'p9', pageIndex: 0 },
      { file, projectUuid: 'p1', pageIndex: 1 },
      { file: fileWith([riserOf('R1', [memberOf(0)])]), projectUuid: 'p1', pageIndex: 0 },
    ];
    for (const item of cases) {
      const liveNetworksOf = vi.fn((): RiserNetworkSummary[] => []);
      expect(computeRiserFlow({ ...item, summaries, liveNetworksOf })).toBeNull();
      expect(liveNetworksOf).not.toHaveBeenCalled();
    }
  });
});

describe('sameRiserFlowInputs', () => {
  const base: RiserFlowInputs = { f: { role: 'entry', demandBeyond: 150 }, g: { role: 'exit', demandBeyond: 0 } };

  it('is true for equal inputs and false for each difference', () => {
    expect(sameRiserFlowInputs(base, { f: { role: 'entry', demandBeyond: 150 }, g: { role: 'exit', demandBeyond: 0 } })).toBe(true);
    expect(sameRiserFlowInputs(base, { f: { role: 'exit', demandBeyond: 150 }, g: { role: 'exit', demandBeyond: 0 } })).toBe(false);
    expect(sameRiserFlowInputs(base, { f: { role: 'entry', demandBeyond: 151 }, g: { role: 'exit', demandBeyond: 0 } })).toBe(false);
    expect(sameRiserFlowInputs(base, { ...base, h: { role: 'exit', demandBeyond: 0 } })).toBe(false);
    expect(sameRiserFlowInputs(base, { f: { role: 'entry', demandBeyond: 150 } })).toBe(false);
  });

  it('ignores the key order', () => {
    expect(sameRiserFlowInputs(base, { g: { role: 'exit', demandBeyond: 0 }, f: { role: 'entry', demandBeyond: 150 } })).toBe(true);
  });
});

describe('RiserFlowSender', () => {
  const a: RiserFlowInputs = { f: { role: 'entry', demandBeyond: 150 } };
  const b: RiserFlowInputs = { f: { role: 'exit', demandBeyond: 650 } };

  it('sends a change once and sends {} once to clear the scene', () => {
    const sender = new RiserFlowSender();
    expect(sender.next({})).toBeNull();
    expect(sender.next(a)).toEqual(a);
    expect(sender.next({ f: { role: 'entry', demandBeyond: 150 } })).toBeNull();
    expect(sender.next(b)).toEqual(b);
    expect(sender.next({})).toEqual({});
    expect(sender.next({})).toBeNull();
  });

  it('sends the inputs again after a reset of the scene', () => {
    const sender = new RiserFlowSender();
    expect(sender.next(a)).toEqual(a);
    sender.reset();
    expect(sender.next(a)).toEqual(a);
  });

  it('sends nothing after a reset when the inputs were cleared', () => {
    const sender = new RiserFlowSender();
    expect(sender.next(a)).toEqual(a);
    sender.reset();
    expect(sender.next({})).toBeNull();
  });
});
