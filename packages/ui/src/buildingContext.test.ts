import { describe, expect, it } from 'vitest';
import { emptyBuilding, parseBuildingFile, parseSheetSummary, serializeBuildingFile, type BuildingSheet, type ProjectDocument, type StampDefinition } from '@mepapp/core';
import { MemoryBuildingStore, StoreConflictError, type BuildingStore } from '@mepapp/platform';
import { displayedPageInfos, stampNameLookups, summaryAfterSave } from './buildingContext.js';

const PATH = 'C:/work/plan.pdf';

const sheetOf = (overrides: Partial<BuildingSheet> = {}): BuildingSheet => ({
  id: 's1',
  levelId: 'L1',
  projectUuid: null,
  pageIndex: 0,
  displayName: 'Plan',
  location: { fileName: 'plan.pdf', path: PATH, sizeBytes: 1000 },
  ...overrides,
});

const buildingJson = (sheets: BuildingSheet[]): string => {
  const file = emptyBuilding('b1', 'Block');
  return serializeBuildingFile({ ...file, levels: [{ id: 'L1', name: 'Ground', elevationMm: 0 }], sheets });
};

const projectOf = (projectUuid: string | undefined) =>
  ({
    schemaVersion: 22,
    projectUuid,
    networkTypes: [],
    segments: [],
    fittings: [],
    stamps: [],
    portGroups: [],
    terminalCapacities: {},
    panels: [],
    circuits: [],
    calibrations: {},
  }) as unknown as ProjectDocument;

const document = { fileName: 'plan.pdf', path: PATH, sizeBytes: 1000, modifiedMs: 5000 };

const args = (store: BuildingStore, project: ProjectDocument = projectOf('proj-1'), overrides: Partial<Parameters<typeof summaryAfterSave>[0]> = {}) => ({
  store,
  project,
  document,
  pageInfos: [{ widthPt: 595, heightPt: 842, rotationDegrees: 0 as const }],
  stampTypeName: () => null,
  stampImageName: () => null,
  now: () => new Date('2026-11-01T10:00:00.000Z'),
  ...overrides,
});

describe('summaryAfterSave', () => {
  it('reports no-building when the store holds no building file', async () => {
    const store = new MemoryBuildingStore();
    expect(await summaryAfterSave(args(store))).toEqual({ state: 'no-building' });
  });

  it('writes the summary of a sheet matched by id', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf({ projectUuid: 'proj-1' })]) });
    const result = await summaryAfterSave(args(store));
    expect(result).toEqual({ state: 'written', projectUuid: 'proj-1', patchedSheets: 0 });
    const summary = parseSheetSummary(JSON.parse((await store.readSummary('proj-1')) ?? 'null'));
    expect(summary.projectUuid).toBe('proj-1');
    expect(summary.sourceSizeBytes).toBe(1000);
    expect(summary.sourceModifiedMs).toBe(5000);
    expect(summary.savedAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('links an unlinked sheet matched by path and patches the building file', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf()]) });
    const result = await summaryAfterSave(args(store));
    expect(result).toEqual({ state: 'written', projectUuid: 'proj-1', patchedSheets: 1 });
    const stored = await store.read();
    expect(parseBuildingFile(JSON.parse(stored?.json ?? 'null')).sheets[0]?.projectUuid).toBe('proj-1');
    expect(await store.readSummary('proj-1')).toBeDefined();
  });

  it('reports no-match and writes no summary when the sheet belongs to another document', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf({ projectUuid: 'other-uuid', location: { fileName: 'other.pdf', path: 'C:/work/other.pdf', sizeBytes: 9 } })]) });
    expect(await summaryAfterSave(args(store))).toEqual({ state: 'no-match' });
    expect(await store.listSummaries()).toEqual([]);
  });

  it('ignores a weak match (same file name and size, different path)', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf({ location: { fileName: 'plan.pdf', path: 'D:/elsewhere/plan.pdf', sizeBytes: 1000 } })]) });
    expect(await summaryAfterSave(args(store))).toEqual({ state: 'no-match' });
    expect(await store.listSummaries()).toEqual([]);
  });

  it('retries once after a conflict on the building file write', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf()]) });
    const original = store.write.bind(store);
    let writes = 0;
    store.write = async (json, expectedRevision) => {
      writes += 1;
      if (writes === 1) throw new StoreConflictError('building', expectedRevision, '99');
      return original(json, expectedRevision);
    };
    const result = await summaryAfterSave(args(store));
    expect(result).toEqual({ state: 'written', projectUuid: 'proj-1', patchedSheets: 1 });
    expect(writes).toBe(2);
    const stored = await store.read();
    expect(parseBuildingFile(JSON.parse(stored?.json ?? 'null')).sheets[0]?.projectUuid).toBe('proj-1');
  });

  it('rejects with StoreConflictError when the retry after a conflict also conflicts', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf()]) });
    store.write = async (_json, expectedRevision) => {
      throw new StoreConflictError('building', expectedRevision, '99');
    };
    await expect(summaryAfterSave(args(store))).rejects.toBeInstanceOf(StoreConflictError);
  });

  it('reports no-match when the document has no projectUuid', async () => {
    const store = new MemoryBuildingStore({ json: buildingJson([sheetOf()]) });
    expect(await summaryAfterSave(args(store, projectOf(undefined)))).toEqual({ state: 'no-match' });
  });
});

describe('stampNameLookups', () => {
  const definitions = [
    { id: 'd-label', label: 'D2 Sink', iconRef: 'stamps/sink.svg' },
    { id: 'd-data', label: 'Custom', iconRef: 'data:image/png;base64,AAAA' },
  ] as unknown as StampDefinition[];

  it('returns the label and the file name of a stamp with a file iconRef', () => {
    const lookups = stampNameLookups(definitions);
    expect(lookups.stampTypeName('d-label')).toBe('D2 Sink');
    expect(lookups.stampImageName('d-label')).toBe('sink.svg');
  });

  it('returns no image name for a data: iconRef and null for an unknown id', () => {
    const lookups = stampNameLookups(definitions);
    expect(lookups.stampTypeName('d-data')).toBe('Custom');
    expect(lookups.stampImageName('d-data')).toBeNull();
    expect(lookups.stampTypeName('unknown-id')).toBeNull();
  });
});

describe('displayedPageInfos', () => {
  type Page = { widthPt: number; heightPt: number; rotationDegrees: 0 | 90 | 180 | 270 };
  const handleOf = (pages: Page[]) => ({
    getPageCount: () => pages.length,
    getPageInfo: (index: number) => pages[index] as Page,
  });

  it('swaps width and height of a page rotated by 90 degrees', () => {
    const handle = handleOf([{ widthPt: 300, heightPt: 200, rotationDegrees: 90 }]);
    expect(displayedPageInfos(handle)).toEqual([{ widthPt: 200, heightPt: 300, rotationDegrees: 90 }]);
  });

  it('keeps width and height of pages rotated by 0 or 180 degrees', () => {
    const handle = handleOf([
      { widthPt: 300, heightPt: 200, rotationDegrees: 0 },
      { widthPt: 300, heightPt: 200, rotationDegrees: 180 },
    ]);
    expect(displayedPageInfos(handle)).toEqual([
      { widthPt: 300, heightPt: 200, rotationDegrees: 0 },
      { widthPt: 300, heightPt: 200, rotationDegrees: 180 },
    ]);
  });

  it('returns one entry per page in page order', () => {
    const handle = handleOf([
      { widthPt: 300, heightPt: 200, rotationDegrees: 270 },
      { widthPt: 595, heightPt: 842, rotationDegrees: 0 },
    ]);
    expect(displayedPageInfos(handle)).toEqual([
      { widthPt: 200, heightPt: 300, rotationDegrees: 270 },
      { widthPt: 595, heightPt: 842, rotationDegrees: 0 },
    ]);
  });
});
