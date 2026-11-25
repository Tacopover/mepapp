import { describe, expect, it } from 'vitest';
import { calibrationFromScale, scaleDenominatorFromCalibration } from './calibration.js';
import { countOpenEnds, solveFlow } from './flow.js';
import { computeNetworks } from './network.js';
import type { ProjectDocument } from './project.js';
import { buildRiserNetworks, buildSheetSummary, parseSheetSummary, RISER_WARNING as EXPORTED_RISER_WARNING, SHEET_SUMMARY_VERSION, SheetSummaryError, type RiserNetworkSummary } from './sheet-summary.js';

const type = { id: 't', name: 'Supply air', discipline: 'hvac', units: 'l/s', defaultCapacity: 0, color: '#000', lineWidthPt: 1, linePattern: 'solid' } as never;

const segment = (id: string, pageIndex: number, geometry: { x: number; y: number }[]) =>
  ({
    id,
    pageIndex,
    networkTypeId: 't',
    shape: 'round',
    diameter: 200,
    endpointA: { kind: 'free', position: geometry[0]! } as never,
    endpointB: { kind: 'free', position: geometry[geometry.length - 1]! } as never,
    geometry,
  }) as never;

const terminal = (id: string, pageIndex: number) =>
  ({
    id,
    category: 'terminal',
    pageIndex,
    transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth: 1,
    nativeHeight: 1,
    ports: [],
  }) as never;

const projectOf = (overrides: Partial<Record<string, unknown>> = {}): ProjectDocument =>
  ({
    schemaVersion: 23,
    projectUuid: 'proj-1',
    networkTypes: [type],
    segments: [segment('s0', 0, [{ x: 0, y: 0 }, { x: 500, y: 0 }]), segment('s1', 1, [{ x: 0, y: 0 }, { x: 300, y: 0 }])],
    fittings: [],
    stamps: [terminal('t0', 0)],
    portGroups: [],
    annotations: [],
    customStampDefinitions: [],
    terminalCapacities: {},
    networkSizing: [],
    circuits: [],
    panels: [],
    panelSections: [],
    circuitTypes: [],
    stampLabelLayouts: {},
    schematics: [],
    schematicProjectFields: {},
    rooms: [],
    calibrations: { '0': calibrationFromScale(100) },
    roomTypes: [],
    roomNeeds: [],
    roomTypeCeilingHeightsMm: {},
    ...overrides,
  }) as unknown as ProjectDocument;

const summaryArgs = (project: ProjectDocument, pageInfos: { widthPt: number; heightPt: number; rotationDegrees: number }[]) => ({
  project,
  savedAt: '2026-11-01T10:00:00.000Z',
  sourceSizeBytes: 12345,
  sourceModifiedMs: 1700000000000,
  pageInfos,
  stampTypeName: () => 'Sink',
  stampImageName: () => null,
});

const portrait = { widthPt: 595, heightPt: 842, rotationDegrees: 0 };

const linked = (id: string, endpointA: unknown, endpointB: unknown) =>
  ({ id, pageIndex: 0, networkTypeId: 't', shape: 'round', diameter: 200, endpointA, endpointB, geometry: [{ x: 0, y: 0 }, { x: 300, y: 0 }] }) as never;

const fitting = (id: string) => ({ id, pageIndex: 0, position: { x: 0, y: 0 }, kind: 'tee' }) as never;

const stamp = (id: string, category: string) =>
  ({ id, category, pageIndex: 0, transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 1, nativeHeight: 1, ports: [] }) as never;

const port = (elementId: string) => ({ kind: 'port', elementId, portId: 'p1' });

const fittingEnd = (fittingId: string) => ({ kind: 'fitting', fittingId });

describe('buildSheetSummary', () => {
  it('builds the tables and warns about the page without a scale', () => {
    const summary = buildSheetSummary(summaryArgs(projectOf(), [portrait, portrait]));
    expect(summary.version).toBe(2);
    expect(summary.projectUuid).toBe('proj-1');
    expect(summary.tables.map((t) => t.name)).toEqual(['Segments', 'Terminals']);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain('Page 2');
    expect(summary.pages['0']).toEqual({ calibrated: true, pageUnitsPerRealUnit: calibrationFromScale(100).pageUnitsPerRealUnit, widthPt: 595, heightPt: 842, rotationDegrees: 0 });
    expect(summary.pages['1']).toEqual({ calibrated: false, pageUnitsPerRealUnit: null, widthPt: 595, heightPt: 842, rotationDegrees: 0 });
  });

  it('keeps the calibration of a page that has no page info', () => {
    const summary = buildSheetSummary(summaryArgs(projectOf({ calibrations: { '0': calibrationFromScale(100), '5': calibrationFromScale(50) } }), [portrait]));
    expect(summary.pages['5']).toEqual({ calibrated: true, pageUnitsPerRealUnit: calibrationFromScale(50).pageUnitsPerRealUnit, widthPt: 0, heightPt: 0, rotationDegrees: 0 });
  });

  it('stores the page unit factor as PDF points per mm for the scale', () => {
    const summary = buildSheetSummary(summaryArgs(projectOf(), [portrait]));
    const factor = summary.pages['0']!.pageUnitsPerRealUnit!;
    expect(factor).toBeCloseTo(72 / 25.4 / 100, 10);
    expect(scaleDenominatorFromCalibration({ pageUnitsPerRealUnit: factor })).toBeCloseTo(100, 10);
  });

  it('stores the displayed size of a rotated page and a swapped page', () => {
    const rotated = { widthPt: 842, heightPt: 595, rotationDegrees: 90 };
    const swapped = { widthPt: 595, heightPt: 842, rotationDegrees: 0 };
    const summary = buildSheetSummary(summaryArgs(projectOf(), [rotated, swapped]));
    expect(summary.pages['0']).toMatchObject({ widthPt: 842, heightPt: 595, rotationDegrees: 90 });
    expect(summary.pages['1']).toMatchObject({ widthPt: 595, heightPt: 842, rotationDegrees: 0 });
  });

  it('throws when the project has no projectUuid', () => {
    const project = projectOf({ projectUuid: undefined });
    expect(() => buildSheetSummary(summaryArgs(project, [portrait]))).toThrow(SheetSummaryError);
    expect(() => buildSheetSummary(summaryArgs(project, [portrait]))).toThrow('project has no projectUuid');
  });
});

describe('parseSheetSummary', () => {
  const summary = () => buildSheetSummary(summaryArgs(projectOf(), [portrait, portrait]));

  it('returns the same summary after a JSON round trip', () => {
    const built = summary();
    expect(parseSheetSummary(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it('refuses a summary from a newer version', () => {
    const raw = { ...JSON.parse(JSON.stringify(summary())), version: 99 };
    expect(() => parseSheetSummary(raw)).toThrow(SheetSummaryError);
  });

  it('migrates a version 0 summary to version 2', () => {
    const raw = { ...JSON.parse(JSON.stringify(summary())), version: 0 };
    expect(parseSheetSummary(raw).version).toBe(2);
  });

  it('refuses a summary whose pages are malformed', () => {
    const raw = { ...JSON.parse(JSON.stringify(summary())), pages: { '0': { calibrated: 'yes' } } };
    expect(() => parseSheetSummary(raw)).toThrow(SheetSummaryError);
  });
});

describe('sheet summary version 2', () => {
  const riserProject = (overrides: Partial<Record<string, unknown>> = {}) =>
    projectOf({
      fittings: [fitting('m')],
      stamps: [stamp('ahu', 'equipment'), stamp('diffuser', 'terminal')],
      segments: [linked('trunk', fittingEnd('m'), port('ahu')), linked('branch', port('diffuser'), fittingEnd('m'))],
      terminalCapacities: { diffuser: 100 },
      ...overrides,
    });
  const riserSummary = (project: ProjectDocument, riserFittingIds?: string[]) =>
    buildSheetSummary({ ...summaryArgs(project, [portrait]), riserFittingIds });

  it('lists the start and end fitting of each segment in the Segments table', () => {
    const project = riserProject({ segments: [linked('s', fittingEnd('m'), { kind: 'free', position: { x: 300, y: 0 } })] });
    const table = riserSummary(project).tables.find((t) => t.name === 'Segments')!;
    expect(table.headers.slice(-2)).toEqual(['Start fitting', 'End fitting']);
    expect(table.rows[0]!.slice(-2)).toEqual(['m', null]);
  });

  it('leaves the flow out when no riser id is given', () => {
    const project = riserProject();
    const summary = riserSummary(project);
    const without = riserSummary(project, []);
    expect(summary.riserFittingFlow).toBeUndefined();
    expect(without.riserFittingFlow).toBeUndefined();
    expect(without.tables).toEqual(summary.tables);
    expect(without.pages).toEqual(summary.pages);
    expect(without.warnings).toEqual(summary.warnings);
  });

  it('marks a riser fitting out when equipment feeds its network', () => {
    expect(riserSummary(riserProject(), ['m']).riserFittingFlow).toEqual({ m: 'out' });
  });

  it('marks a riser fitting in when a terminal has demand and no equipment is present', () => {
    const project = riserProject({ segments: [linked('branch', port('diffuser'), fittingEnd('m'))], stamps: [stamp('diffuser', 'terminal')] });
    expect(riserSummary(project, ['m']).riserFittingFlow).toEqual({ m: 'in' });
  });

  it('marks a riser fitting none when the demand is 0', () => {
    const project = riserProject({
      segments: [linked('branch', port('diffuser'), fittingEnd('m'))],
      stamps: [stamp('diffuser', 'terminal')],
      terminalCapacities: { diffuser: 0 },
    });
    expect(riserSummary(project, ['m']).riserFittingFlow).toEqual({ m: 'none' });
  });

  it('does not take equipment of another network as the source', () => {
    const project = riserProject({
      fittings: [fitting('m'), fitting('n')],
      segments: [linked('branch', port('diffuser'), fittingEnd('m')), linked('far', port('ahu'), fittingEnd('n'))],
    });
    expect(riserSummary(project, ['m']).riserFittingFlow?.m).toBe('in');
  });

  it('leaves out a riser id that is not a fitting of the project', () => {
    expect(riserSummary(riserProject(), ['m', 'ghost']).riserFittingFlow).toEqual({ m: 'out' });
  });

  it('keeps only the riser fittings in the riser flow', () => {
    const project = riserProject({ fittings: [fitting('m'), fitting('n')] });
    const flow = riserSummary(project, ['m']).riserFittingFlow;
    expect(Object.keys(flow ?? {})).toEqual(['m']);
    expect(flow).toEqual({ m: 'out' });
  });

  it('parses a version 1 summary with no riser flow', () => {
    const raw = { ...JSON.parse(JSON.stringify(riserSummary(riserProject(), ['m']))), version: 1 };
    delete raw.riserFittingFlow;
    const parsed = parseSheetSummary(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.riserFittingFlow).toBeUndefined();
  });

  it('returns the same flow after a JSON round trip', () => {
    const built = riserSummary(riserProject(), ['m']);
    expect(parseSheetSummary(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it('refuses a riser flow with a value that is not out, in or none', () => {
    const raw = { ...JSON.parse(JSON.stringify(riserSummary(riserProject(), ['m']))), riserFittingFlow: { m: 'sideways' } };
    expect(() => parseSheetSummary(raw)).toThrow(SheetSummaryError);
  });
});

describe('riser networks of the sheet summary', () => {
  const RISER_WARNING = 'Riser fitting is not an open end. The terminals behind it may not be counted.';
  type RawChange = (raw: Record<string, unknown>) => Record<string, unknown>;

  const networkProject = (overrides: Partial<Record<string, unknown>> = {}) => projectOf({ ...overrides });
  const planProject = (overrides: Partial<Record<string, unknown>> = {}) =>
    networkProject({
      fittings: [fitting('m'), fitting('tee')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [
        linked('a', fittingEnd('m'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), port('d1')),
        linked('c', fittingEnd('tee'), port('d2')),
      ],
      terminalCapacities: { d1: 300, d2: 200 },
      ...overrides,
    });
  const rawWithRiser = () =>
    JSON.parse(JSON.stringify(buildSheetSummary({ ...summaryArgs(planProject(), [portrait]), riserFittingIds: ['m'] }))) as Record<string, unknown>;
  const entryOf = (raw: Record<string, unknown>) => (raw.riserNetworks as Record<string, unknown>[])[0]!;

  it('sums the terminals of a riser network into its terminal capacity', () => {
    const expected: RiserNetworkSummary[] = [{ networkTypeId: 't', fittingIds: ['m'], terminalCapacity: 500, hasSource: false, openEnds: 0 }];
    const result = buildRiserNetworks(planProject(), ['m']);
    expect(result).toEqual(expected);
    expect('warnings' in result[0]!).toBe(false);
  });

  it('accepts a Set or an array of riser ids and gives no entry for an id that is not a fitting', () => {
    const project = planProject();
    expect(buildRiserNetworks(project, new Set(['m']))).toEqual(buildRiserNetworks(project, ['m']));
    expect(buildRiserNetworks(project, ['ghost'])).toEqual([]);
    expect(buildRiserNetworks(project, [])).toEqual([]);
  });

  it('sorts the entries by their first riser fitting id', () => {
    const project = networkProject({
      fittings: [fitting('z'), fitting('a')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [linked('x', fittingEnd('z'), port('d1')), linked('y', fittingEnd('a'), port('d2'))],
      terminalCapacities: { d1: 10, d2: 20 },
    });
    expect(buildRiserNetworks(project, ['z', 'a'])).toEqual([
      { networkTypeId: 't', fittingIds: ['a'], terminalCapacity: 20, hasSource: false, openEnds: 0 },
      { networkTypeId: 't', fittingIds: ['z'], terminalCapacity: 10, hasSource: false, openEnds: 0 },
    ]);
  });

  it('gives one entry with the sorted riser fittings of a network and no warning for one segment each', () => {
    const project = networkProject({
      fittings: [fitting('m2'), fitting('m1'), fitting('tee')],
      stamps: [stamp('d1', 'terminal')],
      segments: [
        linked('a', fittingEnd('m1'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), fittingEnd('m2')),
        linked('c', fittingEnd('tee'), port('d1')),
      ],
      terminalCapacities: { d1: 300 },
    });
    const result = buildRiserNetworks(project, ['m2', 'm1']);
    expect(result).toEqual([{ networkTypeId: 't', fittingIds: ['m1', 'm2'], terminalCapacity: 300, hasSource: false, openEnds: 0 }]);
    expect('warnings' in result[0]!).toBe(false);
  });

  it('gives one entry per network, each with its own network type', () => {
    const project = networkProject({
      fittings: [fitting('a'), fitting('b')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [linked('x', fittingEnd('a'), port('d1')), { ...linked('y', fittingEnd('b'), port('d2')), networkTypeId: 'u' } as never],
      terminalCapacities: { d1: 10, d2: 20 },
    });
    expect(buildRiserNetworks(project, ['a', 'b'])).toEqual([
      { networkTypeId: 't', fittingIds: ['a'], terminalCapacity: 10, hasSource: false, openEnds: 0 },
      { networkTypeId: 'u', fittingIds: ['b'], terminalCapacity: 20, hasSource: false, openEnds: 0 },
    ]);
  });

  it('gives no entry for a riser fitting that has no segment', () => {
    const project = networkProject({ fittings: [fitting('orphan')], segments: [] });
    expect(buildRiserNetworks(project, ['orphan'])).toEqual([]);
  });

  it('gives one entry for a fitting with segments of two types, with the type that computeNetworks gives', () => {
    // Known hole, .claude/roadmap/rules.md section 3 rule 2: a fitting shared by two segments of different types joins them into one network.
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [linked('a', fittingEnd('m'), port('d1')), { ...linked('b', fittingEnd('m'), port('d2')), networkTypeId: 'u' } as never],
      terminalCapacities: { d1: 1, d2: 2 },
    });
    const network = computeNetworks({ segments: project.segments, fittings: project.fittings, portGroups: project.portGroups }).find((n) =>
      n.fittingIds.includes('m'),
    );
    const result = buildRiserNetworks(project, ['m']);
    expect(result).toHaveLength(1);
    expect(result[0]?.fittingIds).toEqual(['m']);
    expect(result[0]?.networkTypeId).toBe(network?.networkTypeId);
  });

  it('takes an equipment without a capacity key as the source', () => {
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('ahu', 'equipment')],
      segments: [linked('trunk', fittingEnd('m'), port('ahu'))],
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.hasSource).toBe(true);
  });

  it('takes an equipment with capacity 0 as the source', () => {
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('ahu', 'equipment')],
      segments: [linked('trunk', fittingEnd('m'), port('ahu'))],
      terminalCapacities: { ahu: 0 },
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.hasSource).toBe(true);
  });

  it('does not take an equipment with capacity as the source and counts its capacity', () => {
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('fcu', 'equipment')],
      segments: [linked('branch', fittingEnd('m'), port('fcu'))],
      terminalCapacities: { fcu: 150 },
    });
    expect(buildRiserNetworks(project, ['m'])).toEqual([{ networkTypeId: 't', fittingIds: ['m'], terminalCapacity: 150, hasSource: false, openEnds: 0 }]);
  });

  it('takes the source of a network with an equipment without capacity and a fan coil unit', () => {
    const project = networkProject({
      fittings: [fitting('m'), fitting('tee')],
      stamps: [stamp('ahu', 'equipment'), stamp('fcu', 'equipment')],
      segments: [
        linked('a', fittingEnd('m'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), port('ahu')),
        linked('c', fittingEnd('tee'), port('fcu')),
      ],
      terminalCapacities: { fcu: 150 },
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.hasSource).toBe(true);
  });

  it('gives no source for a terminal only', () => {
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('d1', 'terminal')],
      segments: [linked('branch', fittingEnd('m'), port('d1'))],
      terminalCapacities: { d1: 100 },
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.hasSource).toBe(false);
  });

  it('does not take an equipment of another network as the source', () => {
    const project = networkProject({
      fittings: [fitting('m'), fitting('n')],
      stamps: [stamp('ahu', 'equipment'), stamp('d1', 'terminal')],
      segments: [linked('branch', port('d1'), fittingEnd('m')), linked('far', port('ahu'), fittingEnd('n'))],
      terminalCapacities: { d1: 100 },
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.hasSource).toBe(false);
  });

  it('warns when a riser fitting is mid-run and counts the terminals of the entry root', () => {
    const project = networkProject({
      fittings: [fitting('m')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [linked('a', port('d1'), fittingEnd('m')), linked('b', fittingEnd('m'), port('d2'))],
      terminalCapacities: { d1: 300, d2: 200 },
    });
    expect(buildRiserNetworks(project, ['m'])).toEqual([
      { networkTypeId: 't', fittingIds: ['m'], terminalCapacity: 500, hasSource: false, openEnds: 0, warnings: [RISER_WARNING] },
    ]);
  });

  it('counts only the terminals in front of a mid-run riser fitting and warns once', () => {
    const project = networkProject({
      fittings: [fitting('m1'), fitting('m2'), fitting('tee')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal')],
      segments: [
        linked('a', fittingEnd('m1'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), fittingEnd('m2')),
        linked('c', fittingEnd('m2'), port('d2')),
        linked('d', fittingEnd('tee'), port('d1')),
      ],
      terminalCapacities: { d1: 300, d2: 200 },
    });
    expect(buildRiserNetworks(project, ['m1', 'm2'])).toEqual([
      { networkTypeId: 't', fittingIds: ['m1', 'm2'], terminalCapacity: 300, hasSource: false, openEnds: 0, warnings: [RISER_WARNING] },
    ]);
  });

  it('keeps one warning when a network has two mid-run riser fittings', () => {
    const project = networkProject({
      fittings: [fitting('m1'), fitting('m2'), fitting('m3'), fitting('tee')],
      stamps: [stamp('d1', 'terminal'), stamp('d2', 'terminal'), stamp('d3', 'terminal')],
      segments: [
        linked('a', fittingEnd('m1'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), fittingEnd('m2')),
        linked('c', fittingEnd('m2'), port('d2')),
        linked('d', fittingEnd('tee'), port('d1')),
        linked('e', fittingEnd('tee'), fittingEnd('m3')),
        linked('f', fittingEnd('m3'), port('d3')),
      ],
      terminalCapacities: { d1: 300, d2: 200, d3: 100 },
    });
    const result = buildRiserNetworks(project, ['m1', 'm2', 'm3']);
    expect(result).toEqual([{ networkTypeId: 't', fittingIds: ['m1', 'm2', 'm3'], terminalCapacity: 300, hasSource: false, openEnds: 0, warnings: [RISER_WARNING] }]);
    expect(result[0]!.warnings).toHaveLength(1);
  });

  it('gives the terminal capacity of the solve total for the network', () => {
    const project = planProject();
    const network = computeNetworks({ segments: project.segments, fittings: project.fittings, portGroups: project.portGroups }).find((n) =>
      n.fittingIds.includes('m'),
    );
    const solved = solveFlow({
      network: network!,
      segments: project.segments,
      fittings: project.fittings,
      portGroups: project.portGroups,
      terminalCapacities: project.terminalCapacities,
      riserFittingIds: new Set(['m']),
      entryFittingId: 'm',
    });
    expect(solved.totalCapacity).toBe(500);
    expect(buildRiserNetworks(project, ['m'])[0]?.terminalCapacity).toBe(solved.totalCapacity);
  });

  const openEndProject = () =>
    networkProject({
      fittings: [fitting('m'), fitting('tee'), fitting('o')],
      stamps: [stamp('d1', 'terminal')],
      segments: [
        linked('a', fittingEnd('m'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), port('d1')),
        linked('c', fittingEnd('tee'), fittingEnd('o')),
      ],
      terminalCapacities: { d1: 300 },
    });

  it('counts the open end of a level that has one and gives 0 for a level that has none', () => {
    expect(buildRiserNetworks(openEndProject(), ['m'])[0]?.openEnds).toBe(1);
    expect(buildRiserNetworks(planProject(), ['m'])[0]?.openEnds).toBe(0);
    expect('openEnds' in buildRiserNetworks(planProject(), ['m'])[0]!).toBe(true);
  });

  it('counts two open ends and does not count a riser fitting', () => {
    const project = networkProject({
      fittings: [fitting('m'), fitting('tee'), fitting('o1'), fitting('o2')],
      segments: [
        linked('a', fittingEnd('m'), fittingEnd('tee')),
        linked('b', fittingEnd('tee'), fittingEnd('o1')),
        linked('c', fittingEnd('tee'), fittingEnd('o2')),
      ],
    });
    expect(buildRiserNetworks(project, ['m'])[0]?.openEnds).toBe(2);
    expect(buildRiserNetworks(project, ['m', 'o2'])[0]?.openEnds).toBe(1);
  });

  it('gives the same number as countOpenEnds with the same input', () => {
    const project = openEndProject();
    const network = computeNetworks({ segments: project.segments, fittings: project.fittings, portGroups: project.portGroups }).find((n) =>
      n.fittingIds.includes('m'),
    );
    const count = countOpenEnds({
      network: network!,
      segments: project.segments,
      fittings: project.fittings,
      portGroups: project.portGroups,
      terminalCapacities: project.terminalCapacities,
      riserFittingIds: new Set(['m']),
      entryFittingId: 'm',
    });
    expect(count).toBe(buildRiserNetworks(project, ['m'])[0]?.openEnds);
  });

  it('writes openEnds in the sheet summary and keeps it after a JSON round trip', () => {
    const summary = buildSheetSummary({ ...summaryArgs(openEndProject(), [portrait]), riserFittingIds: ['m'] });
    expect(summary.riserNetworks?.[0]?.openEnds).toBe(1);
    expect(summary.version).toBe(SHEET_SUMMARY_VERSION);
    expect(SHEET_SUMMARY_VERSION).toBe(2);
    expect(parseSheetSummary(JSON.parse(JSON.stringify(summary))).riserNetworks?.[0]?.openEnds).toBe(1);
  });

  it('parses a v2 summary whose entry has no openEnds (no data)', () => {
    const raw = rawWithRiser();
    delete entryOf(raw).openEnds;
    const parsed = parseSheetSummary(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.riserNetworks?.[0]?.openEnds).toBeUndefined();
  });

  it('accepts openEnds 0 and a whole number above 0', () => {
    const zero = rawWithRiser();
    zero.riserNetworks = [{ ...entryOf(zero), openEnds: 0 }];
    expect(parseSheetSummary(zero).riserNetworks?.[0]?.openEnds).toBe(0);
    const three = rawWithRiser();
    three.riserNetworks = [{ ...entryOf(three), openEnds: 3 }];
    expect(parseSheetSummary(three).riserNetworks?.[0]?.openEnds).toBe(3);
  });

  it('exports the riser warning text', () => {
    expect(EXPORTED_RISER_WARNING).toBe(RISER_WARNING);
  });

  it('needs only the project and the riser ids, and does not throw without a projectUuid', () => {
    expect(buildRiserNetworks.length).toBe(2);
    expect(() => buildRiserNetworks(planProject({ projectUuid: undefined }), ['m'])).not.toThrow();
    expect(buildRiserNetworks(planProject({ projectUuid: undefined }), ['m'])).toEqual(buildRiserNetworks(planProject(), ['m']));
  });

  it('adds the riser networks to the sheet summary only when riser ids are given', () => {
    const project = planProject();
    const summary = buildSheetSummary({ ...summaryArgs(project, [portrait]), riserFittingIds: ['m'] });
    expect(summary.version).toBe(2);
    expect(summary.riserNetworks).toEqual(buildRiserNetworks(project, ['m']));
    expect(summary.riserFittingFlow).toEqual({ m: 'in' });
    expect('riserNetworks' in buildSheetSummary(summaryArgs(project, [portrait]))).toBe(false);
    expect('riserNetworks' in buildSheetSummary({ ...summaryArgs(project, [portrait]), riserFittingIds: [] })).toBe(false);
  });

  it('gives the same riser networks after a JSON round trip', () => {
    const built = buildSheetSummary({ ...summaryArgs(planProject(), [portrait]), riserFittingIds: ['m'] });
    expect(parseSheetSummary(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it('parses a v2 summary without riser networks', () => {
    const raw = rawWithRiser();
    delete raw.riserNetworks;
    const parsed = parseSheetSummary(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.riserNetworks).toBeUndefined();
  });

  it('parses a v1 summary without riser networks to version 2', () => {
    const raw = { ...rawWithRiser(), version: 1 };
    delete raw.riserNetworks;
    const parsed = parseSheetSummary(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.riserNetworks).toBeUndefined();
  });

  it('accepts a riser network with warnings and a riser network without', () => {
    const withWarnings = rawWithRiser();
    withWarnings.riserNetworks = [{ ...entryOf(withWarnings), warnings: ['text'] }];
    expect(parseSheetSummary(withWarnings).riserNetworks?.[0]?.warnings).toEqual(['text']);
    expect(() => parseSheetSummary(rawWithRiser())).not.toThrow();
  });

  it.each<[string, RawChange, string]>([
    ['riserNetworks is not an array', (raw) => ({ ...raw, riserNetworks: 'x' }), 'riserNetworks'],
    ['an entry is not an object', (raw) => ({ ...raw, riserNetworks: ['x'] }), 'riserNetworks[0]'],
    ['networkTypeId is not a string', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), networkTypeId: 5 }] }), 'riserNetworks[0].networkTypeId'],
    ['fittingIds is not an array', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), fittingIds: 'm' }] }), 'riserNetworks[0].fittingIds'],
    ['fittingIds has a value that is not a string', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), fittingIds: [1] }] }), 'riserNetworks[0].fittingIds'],
    ['terminalCapacity is not a number', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), terminalCapacity: 'x' }] }), 'riserNetworks[0].terminalCapacity'],
    ['hasSource is not a boolean', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), hasSource: 'yes' }] }), 'riserNetworks[0].hasSource'],
    ['openEnds is negative', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), openEnds: -1 }] }), 'riserNetworks[0].openEnds'],
    ['openEnds is not a whole number', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), openEnds: 1.5 }] }), 'riserNetworks[0].openEnds'],
    ['openEnds is not a number', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), openEnds: '1' }] }), 'riserNetworks[0].openEnds'],
    ['warnings has a value that is not a string', (raw) => ({ ...raw, riserNetworks: [{ ...entryOf(raw), warnings: [1] }] }), 'riserNetworks[0].warnings'],
  ])('refuses a riser network where %s', (_label, change, path) => {
    const raw = change(rawWithRiser());
    let caught: unknown;
    try {
      parseSheetSummary(raw);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SheetSummaryError);
    expect((caught as SheetSummaryError).issues.map((issue) => issue.path)).toContain(path);
  });
});
