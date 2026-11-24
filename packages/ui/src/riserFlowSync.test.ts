import type { BuildingFile, BuildingLevel, NetworkType, Riser, RiserMember, RiserNetworkSummary, RiserNetworksLive, SheetSummary } from '@mepapp/core';
import { describe, expect, it, vi } from 'vitest';
import { computeRiserFlow, LiveRiserOverlay, RiserFlowSender, sameRiserFlowInputs, type RiserFlowInputs } from './riserFlowSync.js';

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

  it('counts the live networks of the other open documents', () => {
    const { file, summaries } = threeLevelsSetup();
    const others: RiserNetworksLive[] = [{ projectUuid: 'p2', riserNetworks: [entryOf(['f'], 250)] }];
    const result = computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 500)], others });
    expect(result?.inputs).toEqual({ f: { role: 'entry', demandBeyond: 250 } });
    expect(result?.flow.groups[0]?.total).toBe(100 + 500 + 250);
  });

  it('counts the other documents of the building on the source level', () => {
    const { file, summaries } = threeLevelsSetup();
    const others: RiserNetworksLive[] = [
      { projectUuid: 'p1', riserNetworks: [entryOf(['f'], 600)] },
      { projectUuid: 'p2', riserNetworks: [entryOf(['f'], 250)] },
    ];
    const result = computeRiserFlow({ file, projectUuid: 'p0', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 100, true)], others });
    expect(result?.inputs).toEqual({ f: { role: 'exit', demandBeyond: 850 } });
    expect(result?.flow.groups[0]?.total).toBe(100 + 600 + 250);
  });

  it('ignores the other entry of the open project', () => {
    const { file, summaries } = threeLevelsSetup();
    const others: RiserNetworksLive[] = [
      { projectUuid: 'p1', riserNetworks: [entryOf(['f'], 9999)] },
      { projectUuid: 'p2', riserNetworks: [entryOf(['f'], 250)] },
    ];
    const result = computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 500)], others });
    expect(result?.inputs).toEqual({ f: { role: 'entry', demandBeyond: 250 } });
    expect(result?.flow.groups[0]?.total).toBe(100 + 500 + 250);
  });

  it('counts a live document that has no stored summary, with no warning about a saved summary', () => {
    const { file } = threeLevelsSetup();
    const summaries = summariesOf(summaryOf('p0', [entryOf(['f'], 100, true)]), summaryOf('p1', [entryOf(['f'], 500)]));
    const others: RiserNetworksLive[] = [{ projectUuid: 'p2', riserNetworks: [entryOf(['f'], 150)] }];
    const result = computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf: () => [entryOf(['f'], 500)], others });
    expect(result?.inputs).toEqual({ f: { role: 'entry', demandBeyond: 150 } });
    expect(result?.flow.groups[0]?.total).toBe(100 + 500 + 150);
    expect(result?.flow.warnings.some((text) => text.includes('no saved summary'))).toBe(false);
  });
});

describe('LiveRiserOverlay', () => {
  it('reports a change only when the networks differ from the stored value', () => {
    const overlay = new LiveRiserOverlay();
    expect(overlay.set('p1', [entryOf(['f'], 500)])).toBe(true);
    expect(overlay.set('p1', [entryOf(['f'], 500)])).toBe(false);
    expect(overlay.set('p1', [entryOf(['f'], 700)])).toBe(true);
  });

  it('bumps the version only on a change', () => {
    const overlay = new LiveRiserOverlay();
    overlay.set('p1', [entryOf(['f'], 500)]);
    const first = overlay.version;
    overlay.set('p1', [entryOf(['f'], 500)]);
    expect(overlay.version).toBe(first);
    overlay.set('p1', [entryOf(['f'], 700)]);
    expect(overlay.version).toBe(first + 1);
  });

  it('returns whether delete, retain and clear removed an entry', () => {
    const overlay = new LiveRiserOverlay();
    overlay.set('p0', [entryOf(['f'], 100, true)]);
    overlay.set('p1', [entryOf(['f'], 500)]);
    overlay.set('p2', [entryOf(['f'], 150)]);
    expect(overlay.delete('p9')).toBe(false);
    expect(overlay.delete('p2')).toBe(true);
    expect(overlay.retain(new Set(['p0', 'p1']))).toBe(false);
    expect(overlay.retain(new Set(['p0']))).toBe(true);
    expect(overlay.clear()).toBe(true);
    expect(overlay.clear()).toBe(false);
  });

  it('lists the entries sorted by projectUuid', () => {
    const overlay = new LiveRiserOverlay();
    overlay.set('p2', [entryOf(['f'], 150)]);
    overlay.set('p0', [entryOf(['f'], 100, true)]);
    overlay.set('p1', [entryOf(['f'], 500)]);
    expect(overlay.list()).toEqual([
      { projectUuid: 'p0', riserNetworks: [entryOf(['f'], 100, true)] },
      { projectUuid: 'p1', riserNetworks: [entryOf(['f'], 500)] },
      { projectUuid: 'p2', riserNetworks: [entryOf(['f'], 150)] },
    ]);
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

  describe('sides', () => {
    const open = (sides?: { demand: number; openEnds: number }[]): RiserFlowInputs => ({
      f: { role: 'open', demandBeyond: 100, ...(sides === undefined ? {} : { sides }) },
    });
    const two = [
      { demand: 100, openEnds: 0 },
      { demand: 0, openEnds: 1 },
    ];

    it('is true for equal sides', () => {
      expect(sameRiserFlowInputs(open(two), open(two.map((side) => ({ ...side }))))).toBe(true);
    });

    it('is false when only the sides differ', () => {
      expect(sameRiserFlowInputs(open(two), open([two[0]!, { demand: 0, openEnds: 2 }]))).toBe(false);
      expect(sameRiserFlowInputs(open(two), open([two[0]!, { demand: 5, openEnds: 1 }]))).toBe(false);
      expect(sameRiserFlowInputs(open(two), open([two[1]!, two[0]!]))).toBe(false);
      expect(sameRiserFlowInputs(open(two), open([two[0]!]))).toBe(false);
    });

    it('is false when one has sides and the other has none', () => {
      expect(sameRiserFlowInputs(open(two), open())).toBe(false);
      expect(sameRiserFlowInputs(open(), open(two))).toBe(false);
      expect(sameRiserFlowInputs(open(), open())).toBe(true);
    });
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

describe('the chain of Example 2 (no source, an open end on Level 1 and Level 2)', () => {
  const openEnd = (terminal: number, openEnds: number): RiserNetworkSummary => ({ ...entryOf(['f'], terminal), openEnds });

  function level1Inputs(level1OpenEnds: number): RiserFlowInputs | undefined {
    const file = fileWith([riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)])]);
    const summaries = summariesOf(summaryOf('p0', [openEnd(100, 0)]), summaryOf('p1', [openEnd(0, 1)]), summaryOf('p2', [openEnd(0, 1)]));
    return computeRiserFlow({ file, projectUuid: 'p1', pageIndex: 0, summaries, liveNetworksOf: () => [openEnd(0, level1OpenEnds)] })?.inputs;
  }

  it('gives Level 1 an open input with both sides, and the sender sends it once', () => {
    const inputs = level1Inputs(1);
    expect(inputs).toEqual({
      f: {
        role: 'open',
        demandBeyond: 100,
        sides: [
          { demand: 100, openEnds: 0 },
          { demand: 0, openEnds: 1 },
        ],
      },
    });
    const sender = new RiserFlowSender();
    expect(sender.next(inputs!)).toEqual(inputs);
    expect(sender.next(level1Inputs(1)!)).toBeNull();
  });

  it('sends again when only the open ends on the far side change', () => {
    const sender = new RiserFlowSender();
    const first = level1Inputs(1)!;
    expect(sender.next(first)).toEqual(first);
    const stored2 = computeRiserFlow({
      file: fileWith([riserOf('R1', [memberOf(0), memberOf(1), memberOf(2)])]),
      projectUuid: 'p1',
      pageIndex: 0,
      summaries: summariesOf(summaryOf('p0', [openEnd(100, 0)]), summaryOf('p1', [openEnd(0, 1)]), summaryOf('p2', [openEnd(0, 2)])),
      liveNetworksOf: () => [openEnd(0, 1)],
    })?.inputs;
    expect(stored2?.f?.demandBeyond).toBe(100);
    expect(stored2?.f?.sides).toEqual([
      { demand: 100, openEnds: 0 },
      { demand: 0, openEnds: 2 },
    ]);
    expect(sender.next(stored2!)).toEqual(stored2);
  });
});
