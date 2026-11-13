import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { pdfHandleFileKey } from '@mepapp/platform';
import { createWebBuildingStores } from './web-building-store.js';
import { createWebPdfHandleStore } from './web-pdf-handle-store.js';

function store(factory: IDBFactory = new IDBFactory()) {
  return createWebPdfHandleStore({ indexedDB: factory, handleSupport: true });
}

// Own data fields only: IndexedDB clones the handle.
const fileHandle = (name: string) => ({ kind: 'file', name });
const dirHandle = (name: string) => ({ kind: 'directory', name });

function openV1(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open('mepapp-buildings', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('handles');
      req.result.createObjectStore('files');
      req.result.createObjectStore('summaries');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putOld(db: IDBDatabase, storeName: string, value: unknown, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('pdfHandleFileKey', () => {
  it('joins the file name and the size', () => {
    expect(pdfHandleFileKey('A.pdf', 12)).toBe('A.pdf:12');
  });
});

describe('WebPdfHandleStore', () => {
  it('puts, gets, lists and deletes a file handle', async () => {
    const s = store();
    expect(s.available).toBe(true);
    await s.putFile('b1', 'A.pdf:1', fileHandle('A.pdf'));
    await s.putFile('b1', 'B.pdf:2', fileHandle('B.pdf'));
    expect(await s.getFile('b1', 'A.pdf:1')).toEqual(fileHandle('A.pdf'));
    expect(await s.getFile('b1', 'C.pdf:3')).toBeUndefined();
    expect(await s.listFiles('b1')).toEqual(['A.pdf:1', 'B.pdf:2']);
    await s.deleteFile('b1', 'A.pdf:1');
    expect(await s.getFile('b1', 'A.pdf:1')).toBeUndefined();
    expect(await s.listFiles('b1')).toEqual(['B.pdf:2']);
  });

  it('replaces a handle that has the same key', async () => {
    const s = store();
    await s.putFile('b1', 'A.pdf:1', fileHandle('old'));
    await s.putFile('b1', 'A.pdf:1', fileHandle('new'));
    expect(await s.getFile('b1', 'A.pdf:1')).toEqual(fileHandle('new'));
    expect(await s.listFiles('b1')).toEqual(['A.pdf:1']);
  });

  it('keeps the same file key in two buildings apart', async () => {
    const s = store();
    await s.putFile('b1', 'A.pdf:1', fileHandle('one'));
    await s.putFile('b2', 'A.pdf:1', fileHandle('two'));
    await s.putFile('b1:x', 'A.pdf:1', fileHandle('three'));
    expect(await s.getFile('b1', 'A.pdf:1')).toEqual(fileHandle('one'));
    expect(await s.getFile('b2', 'A.pdf:1')).toEqual(fileHandle('two'));
    expect(await s.listFiles('b1')).toEqual(['A.pdf:1']);
    await s.deleteFile('b1', 'A.pdf:1');
    expect(await s.getFile('b2', 'A.pdf:1')).toEqual(fileHandle('two'));
    expect(await s.getFile('b1:x', 'A.pdf:1')).toEqual(fileHandle('three'));
  });

  it('puts, gets and deletes one folder handle for each building', async () => {
    const s = store();
    expect(await s.getFolder('b1')).toBeUndefined();
    await s.putFolder('b1', dirHandle('one'));
    await s.putFolder('b2', dirHandle('two'));
    await s.putFolder('b1', dirHandle('one-b'));
    expect(await s.getFolder('b1')).toEqual(dirHandle('one-b'));
    await s.deleteFolder('b1');
    expect(await s.getFolder('b1')).toBeUndefined();
    expect(await s.getFolder('b2')).toEqual(dirHandle('two'));
  });

  it('deleteBuilding removes the files and the folder of that building only', async () => {
    const s = store();
    await s.putFile('b1', 'A.pdf:1', fileHandle('A'));
    await s.putFile('b1', 'B.pdf:2', fileHandle('B'));
    await s.putFile('b2', 'A.pdf:1', fileHandle('other'));
    await s.putFolder('b1', dirHandle('f1'));
    await s.putFolder('b2', dirHandle('f2'));
    await s.deleteBuilding('b1');
    expect(await s.listFiles('b1')).toEqual([]);
    expect(await s.getFolder('b1')).toBeUndefined();
    expect(await s.listFiles('b2')).toEqual(['A.pdf:1']);
    expect(await s.getFolder('b2')).toEqual(dirHandle('f2'));
  });

  it('keeps the handles after a new store opens the same database', async () => {
    const factory = new IDBFactory();
    await store(factory).putFile('b1', 'A.pdf:1', fileHandle('A'));
    expect(await store(factory).getFile('b1', 'A.pdf:1')).toEqual(fileHandle('A'));
  });

  it('reports unavailable and does nothing without handle support', async () => {
    const s = createWebPdfHandleStore({ indexedDB: new IDBFactory(), handleSupport: false });
    expect(s.available).toBe(false);
    await s.putFile('b1', 'A.pdf:1', fileHandle('A'));
    await s.putFolder('b1', dirHandle('f'));
    expect(await s.getFile('b1', 'A.pdf:1')).toBeUndefined();
    expect(await s.getFolder('b1')).toBeUndefined();
    expect(await s.listFiles('b1')).toEqual([]);
    await s.deleteFile('b1', 'A.pdf:1');
    await s.deleteFolder('b1');
    await s.deleteBuilding('b1');
  });

  it('reports unavailable and does nothing without IndexedDB', async () => {
    const s = createWebPdfHandleStore({ indexedDB: null, handleSupport: true });
    expect(s.available).toBe(false);
    await s.putFile('b1', 'A.pdf:1', fileHandle('A'));
    expect(await s.getFile('b1', 'A.pdf:1')).toBeUndefined();
    expect(await s.listFiles('b1')).toEqual([]);
  });

  it('reports unavailable without window.showOpenFilePicker (detection)', () => {
    const s = createWebPdfHandleStore({ indexedDB: new IDBFactory() });
    expect(s.available).toBe(false);
  });
});

describe('upgrade from database version 1', () => {
  it('keeps handles, files and summaries and adds the new stores', async () => {
    const factory = new IDBFactory();
    const old = await openV1(factory);
    await putOld(old, 'handles', fileHandle('B.json'), 'b1');
    await putOld(old, 'files', { json: '{"a":1}', counter: 3 }, 'b1');
    await putOld(old, 'summaries', '{"s":1}', 'b1:11111111-1111-4111-8111-111111111111');
    old.close();

    const s = store(factory);
    await s.putFile('b1', 'A.pdf:1', fileHandle('A'));
    expect(await s.getFile('b1', 'A.pdf:1')).toEqual(fileHandle('A'));
    await s.putFolder('b1', dirHandle('f'));
    expect(await s.getFolder('b1')).toEqual(dirHandle('f'));

    const building = createWebBuildingStores({
      indexedDB: factory,
      fileSystemAccess: false,
    }).make({ id: 'b1', name: 'B', location: 'B.json' });
    expect(await building.read()).toEqual({ json: '{"a":1}', revision: '3' });
    expect(await building.listSummaries()).toEqual(['11111111-1111-4111-8111-111111111111']);

    const check = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open('mepapp-buildings');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(check.version).toBe(2);
    expect([...check.objectStoreNames].sort()).toEqual([
      'files',
      'handles',
      'pdfFolders',
      'pdfHandles',
      'summaries',
    ]);
    const tx = check.transaction('handles');
    const kept = await new Promise<unknown>((resolve, reject) => {
      const req = tx.objectStore('handles').get('b1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(kept).toEqual(fileHandle('B.json'));
    check.close();
  });

  it('does not block when another connection holds an older version', async () => {
    const factory = new IDBFactory();
    const old = await openV1(factory);
    old.onversionchange = () => old.close();
    const s = store(factory);
    await s.putFile('b1', 'A.pdf:1', fileHandle('A'));
    expect(await s.listFiles('b1')).toEqual(['A.pdf:1']);
  });
});
