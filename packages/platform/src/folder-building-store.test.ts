import { describe, expect, it } from 'vitest';
import { runBuildingStoreContract } from './contract/building-store.contract.js';
import { FolderBuildingStore, type FolderFiles, summaryFileName } from './folder-building-store.js';

function createFakeFiles(): FolderFiles {
  const texts = new Map<string, string>();
  const times = new Map<string, number>();
  let clock = 1000;
  return {
    async read(name) {
      const text = texts.get(name);
      if (text === undefined) return undefined;
      return { text, modifiedMs: times.get(name) ?? 0, sizeBytes: text.length };
    },
    async write(name, text) {
      clock += 1;
      texts.set(name, text);
      times.set(name, clock);
    },
    async list() {
      return [...texts.keys()];
    },
  };
}

const BUILDING_FILE = 'building.mepbuilding.json';

runBuildingStoreContract(
  'FolderBuildingStore',
  () => new FolderBuildingStore(createFakeFiles(), BUILDING_FILE),
);

describe('FolderBuildingStore', () => {
  it('lists only summary files, without the suffix, sorted', async () => {
    const files = createFakeFiles();
    const store = new FolderBuildingStore(files, BUILDING_FILE);
    await store.write('{}');
    await files.write('notes.txt', 'x');
    await store.writeSummary('p-b', '"b"');
    await store.writeSummary('p-a', '"a"');
    expect(await store.listSummaries()).toEqual(['p-a', 'p-b']);
  });

  it('reports the revision as modifiedMs and sizeBytes', async () => {
    const store = new FolderBuildingStore(createFakeFiles(), BUILDING_FILE);
    const { revision } = await store.write('abc');
    expect(revision).toBe('1001:3');
    expect(await store.read()).toEqual({ json: 'abc', revision: '1001:3' });
  });

  it('gives a new revision for a same-length rewrite', async () => {
    const store = new FolderBuildingStore(createFakeFiles(), BUILDING_FILE);
    const first = await store.write('aaa');
    const second = await store.write('bbb', first.revision);
    expect(second.revision).not.toBe(first.revision);
  });

  it('rejects summary uuids that are not safe file names', () => {
    expect(() => summaryFileName('../x')).toThrow();
    expect(() => summaryFileName('a/b')).toThrow();
    expect(() => summaryFileName('')).toThrow();
  });
});
