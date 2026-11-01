import { describe, expect, it } from 'vitest';
import { emptyBuilding, serializeProject, type BuildingFile, type BuildingSheet, type ProjectDocument } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import { MemoryBuildingStore } from '@mepapp/platform';
import { rebuildSummaries } from './rebuildSummaries.js';

const projectJson = (projectUuid: string): string =>
  JSON.stringify(
    serializeProject({
      projectUuid,
      networkTypes: [],
      segments: [],
      fittings: [],
      stamps: [],
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
      calibrations: {},
      roomTypes: [],
      roomNeeds: [],
      ceilingHeightMm: 2900,
      roomTypeCeilingHeightsMm: {},
    } as unknown as Omit<ProjectDocument, 'schemaVersion'>),
  );

const sheetOf = (id: string, path: string, pageIndex: number, projectUuid: string | null = null): BuildingSheet => ({
  id,
  levelId: 'L1',
  projectUuid,
  pageIndex,
  displayName: `Sheet ${id}`,
  location: { fileName: path.split('/').pop() ?? path, path, sizeBytes: 1000 },
});

const buildingOf = (sheets: BuildingSheet[]): BuildingFile => ({ ...emptyBuilding('b1', 'Block'), sheets });

/** The document text is the key of its embedded project and page count. */
const documents: Record<string, { pages: number; embedded: string | null }> = {
  A: { pages: 2, embedded: projectJson('uuid-a') },
  B: { pages: 1, embedded: projectJson('uuid-b') },
  C: { pages: 1, embedded: null },
  D: { pages: 1, embedded: '{not json' },
  E: { pages: 1, embedded: projectJson('uuid-e') },
};

function stubEngine() {
  const state = { opened: 0, closed: 0, active: 0, maxActive: 0 };
  const engine = {
    async openDocument(bytes: Uint8Array) {
      const doc = documents[new TextDecoder().decode(bytes)]!;
      state.opened += 1;
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      return {
        getPageCount: () => doc.pages,
        getPageInfo: () => ({ widthPt: 595, heightPt: 842, rotationDegrees: 0 }),
        getEmbeddedFile: async (name: string) => {
          expect(name).toBe('mepapp-project.json');
          return doc.embedded === null ? null : new TextEncoder().encode(doc.embedded);
        },
        close: () => {
          state.closed += 1;
          state.active -= 1;
        },
      };
    },
  };
  return { engine: engine as unknown as PdfEngine, state };
}

const stampNames = () => ({ stampTypeName: () => null, stampImageName: () => null });

const progressCalls = (): { calls: [number, number, string][]; onProgress: (done: number, total: number, name: string) => void } => {
  const calls: [number, number, string][] = [];
  return { calls, onProgress: (done, total, name) => calls.push([done, total, name]) };
};

/** Files by path. A missing path reads as undefined. */
const readerOf = (files: Record<string, string>, reads: string[] = []) => async (sheet: BuildingSheet) => {
  const path = sheet.location.path!;
  reads.push(sheet.id);
  const text = files[path];
  return text === undefined ? undefined : new File([text], sheet.location.fileName, { lastModified: 5000 });
};

describe('rebuildSummaries', () => {
  it('writes one summary per document, one document at a time, and closes every handle', async () => {
    const { engine, state } = stubEngine();
    const store = new MemoryBuildingStore();
    const progress = progressCalls();
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/a.pdf', 0), sheetOf('s2', 'C:/b.pdf', 0)]),
      engine,
      read: readerOf({ 'C:/a.pdf': 'A', 'C:/b.pdf': 'B' }),
      stampNames,
      store,
      onProgress: progress.onProgress,
      signal: new AbortController().signal,
      now: () => new Date('2026-11-01T10:00:00.000Z'),
    });
    expect(result).toEqual({ ok: 2, failed: [] });
    expect(await store.listSummaries()).toEqual(['uuid-a', 'uuid-b']);
    expect(progress.calls[0]).toEqual([0, 2, 'a.pdf']);
    expect(progress.calls[progress.calls.length - 1]).toEqual([2, 2, '']);
    expect(state.maxActive).toBe(1);
    expect(state.opened).toBe(2);
    expect(state.closed).toBe(2);
  });

  it('reads the file once for two sheets of one document', async () => {
    const { engine, state } = stubEngine();
    const reads: string[] = [];
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/a.pdf', 0), sheetOf('s2', 'C:/a.pdf', 1)]),
      engine,
      read: readerOf({ 'C:/a.pdf': 'A' }, reads),
      stampNames,
      store: new MemoryBuildingStore(),
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);
    expect(reads).toEqual(['s1']);
    expect(state.closed).toBe(1);
  });

  it('records the unreadable document with the whyUnreadable text and continues', async () => {
    const { engine, state } = stubEngine();
    const store = new MemoryBuildingStore();
    const missing = sheetOf('s1', 'C:/missing.pdf', 0);
    const result = await rebuildSummaries({
      building: buildingOf([missing, sheetOf('s2', 'C:/b.pdf', 0)]),
      engine,
      read: readerOf({ 'C:/b.pdf': 'B' }),
      whyUnreadable: async () => 'PDF not found',
      stampNames,
      store,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([{ sheet: missing, reason: 'PDF not found' }]);
    expect(await store.listSummaries()).toEqual(['uuid-b']);
    expect(state.closed).toBe(state.opened);
  });

  it('fails a document with no embedded project and closes its handle', async () => {
    const { engine, state } = stubEngine();
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/c.pdf', 0)]),
      engine,
      read: readerOf({ 'C:/c.pdf': 'C' }),
      stampNames,
      store: new MemoryBuildingStore(),
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(0);
    expect(result.failed.map((failure) => failure.reason)).toEqual(['never saved in MepApp']);
    expect(state.closed).toBe(1);
  });

  it('fails a document whose embedded project does not load and closes its handle', async () => {
    const { engine, state } = stubEngine();
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/d.pdf', 0)]),
      engine,
      read: readerOf({ 'C:/d.pdf': 'D' }),
      stampNames,
      store: new MemoryBuildingStore(),
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(state.closed).toBe(1);
  });

  it('fails a sheet whose projectUuid differs from the embedded one', async () => {
    const { engine } = stubEngine();
    const store = new MemoryBuildingStore();
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/e.pdf', 0, 'uuid-other')]),
      engine,
      read: readerOf({ 'C:/e.pdf': 'E' }),
      stampNames,
      store,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(0);
    expect(result.failed.map((failure) => failure.reason)).toEqual(['the file holds another document id']);
    expect(await store.listSummaries()).toEqual([]);
  });

  it('stops before the second document when the signal is aborted', async () => {
    const { engine, state } = stubEngine();
    const controller = new AbortController();
    const store = new MemoryBuildingStore();
    const read = readerOf({ 'C:/a.pdf': 'A', 'C:/b.pdf': 'B' });
    const result = await rebuildSummaries({
      building: buildingOf([sheetOf('s1', 'C:/a.pdf', 0), sheetOf('s2', 'C:/b.pdf', 0)]),
      engine,
      read: async (sheet) => {
        const file = await read(sheet);
        controller.abort();
        return file;
      },
      stampNames,
      store,
      onProgress: () => undefined,
      signal: controller.signal,
    });
    expect(result.ok).toBe(1);
    expect(await store.listSummaries()).toEqual(['uuid-a']);
    expect(state.opened).toBe(1);
  });
});
