import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { BuildingRef } from '@mepapp/platform';
import { runBuildingStoreContract } from '../../platform/src/contract/building-store.contract.js';
import { createWebBuildingStores } from './web-building-store.js';

const REF: BuildingRef = { id: 'b1', name: 'B', location: 'B.json' };

// Own data fields only: IndexedDB clones the handle, and a clone keeps no prototype methods.
class FakeFileHandle {
  readonly name: string;
  content = '';
  lastModified = 0;
  permission: PermissionState = 'granted';
  answer: PermissionState = 'granted';
  missing = false;

  constructor(name: string) {
    this.name = name;
  }

  async getFile(): Promise<File> {
    if (this.missing) {
      throw Object.assign(new Error('The requested file could not be found.'), {
        name: 'NotFoundError',
      });
    }
    return new File([this.content], this.name, { lastModified: this.lastModified });
  }

  async createWritable() {
    return {
      write: async (data: string) => {
        this.content = data;
        this.lastModified += 1;
      },
      close: async () => {},
    };
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.permission = this.answer;
    return this.permission;
  }
}

function fileStores(factory: IDBFactory = new IDBFactory()) {
  return createWebBuildingStores({ indexedDB: factory, fileSystemAccess: true });
}

function browserStores(factory: IDBFactory = new IDBFactory()) {
  return createWebBuildingStores({ indexedDB: factory, fileSystemAccess: false });
}

runBuildingStoreContract('WebBuildingStore (file kind)', () =>
  fileStores().make(REF, new FakeFileHandle('B.json')),
);

runBuildingStoreContract('WebBuildingStore (browser kind)', () => browserStores().make(REF));

describe('WebBuildingStore (file kind specifics)', () => {
  it('reports needs-permission when the permission is a prompt', async () => {
    const handle = new FakeFileHandle('B.json');
    handle.permission = 'prompt';
    const store = fileStores().make(REF, handle);
    expect(await store.status()).toBe('needs-permission');
  });

  it('becomes ready after requestAccess is granted', async () => {
    const handle = new FakeFileHandle('B.json');
    handle.permission = 'prompt';
    handle.answer = 'granted';
    const store = fileStores().make(REF, handle);
    expect(await store.requestAccess()).toBe('ready');
  });

  it('stays needs-permission when requestAccess is denied', async () => {
    const handle = new FakeFileHandle('B.json');
    handle.permission = 'prompt';
    handle.answer = 'denied';
    const store = fileStores().make(REF, handle);
    expect(await store.requestAccess()).toBe('needs-permission');
  });

  it('finds the saved handle by ref.id from a new registry', async () => {
    const factory = new IDBFactory();
    const first = fileStores(factory).make(REF, new FakeFileHandle('B.json'));
    expect(await first.status()).toBe('ready');
    const second = fileStores(factory).make(REF);
    expect(await second.status()).toBe('ready');
  });

  it('is unavailable with no saved handle and no target', async () => {
    const store = fileStores().make(REF);
    expect(await store.status()).toBe('unavailable');
    expect(await store.read()).toBeUndefined();
  });

  it('reads undefined when getFile reports NotFoundError', async () => {
    const handle = new FakeFileHandle('B.json');
    handle.missing = true;
    const store = fileStores().make(REF, handle);
    expect(await store.read()).toBeUndefined();
  });

  it('raises the revision with every write', async () => {
    const store = fileStores().make(REF, new FakeFileHandle('B.json'));
    const first = await store.write('1');
    const second = await store.write('2', first.revision);
    const third = await store.write('3', second.revision);
    const lastModified = (revision: string) => Number(revision.split(':')[0]);
    expect(lastModified(second.revision)).toBeGreaterThan(lastModified(first.revision));
    expect(lastModified(third.revision)).toBeGreaterThan(lastModified(second.revision));
  });
});

describe('WebBuildingStore (browser kind specifics)', () => {
  it('keeps the building across a new registry on the same database', async () => {
    const factory = new IDBFactory();
    await browserStores(factory).make(REF).write('{"a":1}');
    const read = await browserStores(factory).make(REF).read();
    expect(read?.json).toBe('{"a":1}');
  });

  it('raises the revision with every write', async () => {
    const store = browserStores().make(REF);
    const first = await store.write('1');
    const second = await store.write('2', first.revision);
    const third = await store.write('3', second.revision);
    expect(Number(second.revision)).toBeGreaterThan(Number(first.revision));
    expect(Number(third.revision)).toBeGreaterThan(Number(second.revision));
  });

  it('keeps summaries of two buildings with one projectUuid apart', async () => {
    const stores = browserStores();
    const first = stores.make({ id: 'b1', name: 'One', location: 'One.json' });
    const second = stores.make({ id: 'b2', name: 'Two', location: 'Two.json' });
    await first.writeSummary('p-1', '"one"');
    expect(await first.readSummary('p-1')).toBe('"one"');
    expect(await second.readSummary('p-1')).toBeUndefined();
    expect(await second.listSummaries()).toEqual([]);
  });
});

describe('createWebBuildingStores storage kind', () => {
  it('reports file, browser and blocked', () => {
    expect(
      createWebBuildingStores({ indexedDB: new IDBFactory(), fileSystemAccess: true }).storage,
    ).toBe('file');
    expect(
      createWebBuildingStores({ indexedDB: new IDBFactory(), fileSystemAccess: false }).storage,
    ).toBe('browser');
    expect(createWebBuildingStores({ indexedDB: null, fileSystemAccess: false }).storage).toBe(
      'blocked',
    );
  });

  it('rejects every operation when blocked', async () => {
    const store = createWebBuildingStores({ indexedDB: null, fileSystemAccess: false }).make(REF);
    expect(await store.status()).toBe('unavailable');
    await expect(store.read()).rejects.toThrow(
      'This browser does not let MepApp keep a building.',
    );
  });
});
