import { describe, expect, it } from 'vitest';
import { calibrationFromScale, scaleDenominatorFromCalibration } from './calibration.js';
import type { ProjectDocument } from './project.js';
import { buildSheetSummary, parseSheetSummary, SheetSummaryError } from './sheet-summary.js';

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
    schemaVersion: 22,
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
