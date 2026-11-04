import {
  addLevel,
  emptyBuilding,
  parseBuildingFile,
  renameBuilding,
  serializeBuildingFile,
  setLevelElevation,
  type BuildingFile,
  type BuildingSheet,
} from '@mepapp/core';
import { MemoryBuildingStore, type BuildingRef, type BuildingStore, type FileAccess } from '@mepapp/platform';
import { describe, expect, it, vi } from 'vitest';
import { IMPORTED_OLD_BUILDINGS_KEY, type Building } from './buildings.js';
import { BuildingController } from './buildingController.js';
import { RECENT_BUILDINGS_KEY } from './recentBuildings.js';

const CONFLICT = 'The building file changed on disk. Your last change was not saved.';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

function setup(options: { saveFileAs?: () => Promise<unknown>; openFile?: () => Promise<unknown> } = {}) {
  const storage = fakeStorage();
  const stores = new Map<string, MemoryBuildingStore>();
  let counter = 0;
  const fileAccess = {
    saveFileAs: vi.fn(options.saveFileAs ?? (async () => undefined)),
    openFile: vi.fn(options.openFile ?? (async () => undefined)),
  } as unknown as FileAccess & { saveFileAs: ReturnType<typeof vi.fn>; openFile: ReturnType<typeof vi.fn> };
  const makeStore = (ref: BuildingRef): BuildingStore => {
    let store = stores.get(ref.id);
    if (store === undefined) {
      store = new MemoryBuildingStore();
      stores.set(ref.id, store);
    }
    return store;
  };
  const controller = new BuildingController({
    fileAccess,
    makeStore,
    storage,
    newId: () => `b-${++counter}`,
  });
  return { controller, fileAccess, storage, stores, makeStore };
}

function savedAs(name: string) {
  return async () => ({ name, target: undefined });
}

describe('BuildingController create', () => {
  it('writes the new file through saveFileAs with a suggested name', async () => {
    const { controller, fileAccess } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    expect(fileAccess.saveFileAs).toHaveBeenCalledTimes(1);
    const [suggested, , blob] = fileAccess.saveFileAs.mock.calls[0] as [string, unknown, Blob];
    expect(suggested).toBe('Tower.building.json');
    const written = JSON.parse(await blob.text()) as { id: string; name: string };
    expect(written.id).toBe('b-1');
    expect(written.name).toBe('Tower');
  });

  it('opens the new building with the name and no levels', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const building = controller.getState().building;
    expect(building?.file.name).toBe('Tower');
    expect(building?.file.levels).toEqual([]);
    expect(building?.ref.location).toBe('Tower.building.json');
    expect(building?.dirty).toBe(false);
  });

  it('adds the building to the recent list and saves the list', async () => {
    const { controller, storage } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const entry = { id: 'b-1', name: 'Tower', location: 'Tower.building.json' };
    expect(controller.getState().recent).toEqual([entry]);
    expect(JSON.parse(storage.data.get(RECENT_BUILDINGS_KEY) ?? '[]')).toEqual([entry]);
  });

  it('uses New building for a blank name', async () => {
    const { controller, fileAccess } = setup({ saveFileAs: savedAs('New building.building.json') });
    await controller.create('   ');
    expect(fileAccess.saveFileAs.mock.calls[0][0]).toBe('New building.building.json');
    expect(controller.getState().building?.file.name).toBe('New building');
  });

  it('replaces the characters that a file name cannot hold', async () => {
    const { controller, fileAccess } = setup({ saveFileAs: savedAs('a-b.building.json') });
    await controller.create('a/b:c');
    expect(fileAccess.saveFileAs.mock.calls[0][0]).toBe('a-b-c.building.json');
  });

  it('leaves the state unchanged when the user cancels', async () => {
    const { controller } = setup({ saveFileAs: async () => undefined });
    const before = controller.getState();
    await controller.create('Tower');
    expect(controller.getState()).toBe(before);
    expect(controller.getState().building).toBeNull();
  });
});

describe('BuildingController open', () => {
  it('opens a valid file with levels', async () => {
    const file = addLevel(addLevel(emptyBuilding('b-2', 'Tower'), 'Ground', 0, 'L1'), 'First', 3000, 'L2');
    const json = serializeBuildingFile(file);
    const { controller } = setup({
      openFile: async () => ({ file: new File([json], 'Tower.building.json') }),
    });
    await controller.open();
    const building = controller.getState().building;
    expect(building?.file.name).toBe('Tower');
    expect(building?.file.levels.map((level) => level.name)).toEqual(['Ground', 'First']);
    expect(building?.ref.location).toBe('Tower.building.json');
    expect(controller.getState().message).toBeNull();
  });

  it('shows the levels of a file that is not in elevation order sorted by elevation', async () => {
    const file = addLevel(addLevel(emptyBuilding('b-2', 'Tower'), 'First', 3000, 'L2'), 'Ground', 0, 'L1');
    const json = serializeBuildingFile(file);
    const { controller } = setup({
      openFile: async () => ({ file: new File([json], 'Tower.building.json') }),
    });
    await controller.open();
    expect(controller.getState().building?.file.levels.map((level) => level.name)).toEqual(['Ground', 'First']);
  });

  it('gives a message for invalid JSON', async () => {
    const { controller } = setup({ openFile: async () => ({ file: new File(['{not json'], 'bad.building.json') }) });
    await controller.open();
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toMatch(/^This is not a valid building file: /);
  });

  it('gives a message for a file that fails validation', async () => {
    const json = JSON.stringify({ id: '', name: 'x', levels: [], sheets: [], risers: [] });
    const { controller } = setup({ openFile: async () => ({ file: new File([json], 'bad.building.json') }) });
    await controller.open();
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toMatch(/^This is not a valid building file: /);
  });

  it('leaves the state unchanged when the user cancels', async () => {
    const { controller } = setup();
    const before = controller.getState();
    await controller.open();
    expect(controller.getState()).toBe(before);
  });
});

describe('BuildingController openRecent', () => {
  it('opens a found building and moves its entry to the front', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('First.building.json') });
    await controller.create('First');
    await controller.close();
    await controller.create('Second');
    const first = controller.getState().recent.find((entry) => entry.name === 'First');
    expect(first).toBeDefined();
    await controller.close();
    expect(stores.size).toBe(2);
    await controller.openRecent(first!);
    expect(controller.getState().building?.file.name).toBe('First');
    expect(controller.getState().recent[0]).toEqual(first);
  });

  it('gives the not-found message when the store is empty', async () => {
    const { controller } = setup();
    await controller.openRecent({ id: 'missing', name: 'Old', location: 'Old.building.json' });
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toBe('The building file "Old" was not found. Use Open building… to find it.');
  });

  it('gives the not-found message when the stored id differs', async () => {
    const { controller, stores } = setup();
    stores.set('b-9', new MemoryBuildingStore({ json: serializeBuildingFile(emptyBuilding('b-1', 'Other')) }));
    await controller.openRecent({ id: 'b-9', name: 'Other', location: 'x.building.json' });
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toBe('The building file "Other" was not found. Use Open building… to find it.');
  });
});

describe('BuildingController importOldBuildings', () => {
  const oldTower: Building = { id: 'old-1', name: 'Tower', levels: [{ id: 'lvl-1', name: 'Ground', documentFileName: null }] };
  const oldAnnex: Building = { id: 'old-2', name: 'Annex', levels: [{ id: 'lvl-2', name: 'First', documentFileName: 'first.pdf' }] };

  it('skips a cancelled picker, saves the other building, and marks only the saved one', async () => {
    const { controller, fileAccess, storage } = setup({
      saveFileAs: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ name: 'Annex.building.json', target: undefined }),
    });
    const result = await controller.importOldBuildings([oldTower, oldAnnex]);
    expect(result).toEqual({ saved: 1, cancelled: 1, failed: [] });
    const [suggested, , blob] = fileAccess.saveFileAs.mock.calls[1] as [string, unknown, Blob];
    expect(suggested).toBe('Annex.building.json');
    const written = parseBuildingFile(JSON.parse(await blob.text()));
    expect(written.id).toBe('old-2');
    expect(written.levels).toEqual([{ id: 'lvl-2', name: 'First', elevationMm: 0 }]);
    expect(controller.getState().recent).toEqual([{ id: 'old-2', name: 'Annex', location: 'Annex.building.json' }]);
    expect(JSON.parse(storage.data.get(IMPORTED_OLD_BUILDINGS_KEY) ?? '[]')).toEqual(['old-2']);
    expect(controller.getState().building).toBeNull();
  });

  it('reports the failure of one building and still saves the next one', async () => {
    const { controller, storage } = setup({
      saveFileAs: vi
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValueOnce({ name: 'Annex.building.json', target: undefined }),
    });
    const result = await controller.importOldBuildings([oldTower, oldAnnex]);
    expect(result).toEqual({ saved: 1, cancelled: 0, failed: ['Tower: disk full'] });
    expect(JSON.parse(storage.data.get(IMPORTED_OLD_BUILDINGS_KEY) ?? '[]')).toEqual(['old-2']);
  });
});

describe('BuildingController forgetRecent', () => {
  it('removes the entry and saves the list', async () => {
    const { controller, storage } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    controller.forgetRecent('b-1');
    expect(controller.getState().recent).toEqual([]);
    expect(JSON.parse(storage.data.get(RECENT_BUILDINGS_KEY) ?? '[]')).toEqual([]);
  });
});

describe('BuildingController update', () => {
  it('applies the new file at once and gives a new revision after the write', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const revision = controller.getState().building!.revision;
    const promise = controller.update((file) => ({ ...file, name: 'Renamed' }));
    expect(controller.getState().building?.file.name).toBe('Renamed');
    expect(controller.getState().building?.dirty).toBe(true);
    await promise;
    expect(controller.getState().building?.dirty).toBe(false);
    expect(controller.getState().building?.revision).not.toBe(revision);
  });

  it('writes two quick updates in order with no conflict', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const first = controller.update((file) => addLevel(file, 'Ground', 0, 'L1'));
    const second = controller.update((file) => addLevel(file, 'First', 3000, 'L2'));
    await Promise.all([first, second]);
    expect(controller.getState().message).toBeNull();
    expect(controller.getState().building?.dirty).toBe(false);
    const stored = JSON.parse((await stores.get('b-1')!.read())!.json) as { levels: unknown[] };
    expect(stored.levels).toHaveLength(2);
  });

  it('reloads the file and gives the message on a conflict', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const outside = serializeBuildingFile(emptyBuilding('b-1', 'Outside'));
    await stores.get('b-1')!.write(outside);
    await controller.update((file) => ({ ...file, name: 'Mine' }));
    const building = controller.getState().building;
    expect(building?.file.name).toBe('Outside');
    expect(building?.dirty).toBe(false);
    expect(controller.getState().message).toBe(CONFLICT);
  });

  it('returns without a write for a change that returns the same file', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const before = controller.getState();
    await controller.update((file) => file);
    expect(controller.getState()).toBe(before);
  });

  it('re-sorts the levels after a change of elevation', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    await controller.update((file) => addLevel(addLevel(file, 'Ground', 0, 'L1'), 'First', 3000, 'L2'));
    await controller.update((file) => setLevelElevation(file, 'L1', 6000));
    expect(controller.getState().building?.file.levels.map((level) => level.name)).toEqual(['First', 'Ground']);
  });

  it('resolves with no open building', async () => {
    const { controller } = setup();
    await expect(controller.update((file) => ({ ...file, name: 'x' }))).resolves.toBeUndefined();
    expect(controller.getState().building).toBeNull();
  });

  it('renames the building in the recent list and in the ref, and stores the list', async () => {
    const { controller, storage } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    await controller.update((file) => renameBuilding(file, 'New name'));
    const entry = { id: 'b-1', name: 'New name', location: 'Tower.building.json' };
    expect(controller.getState().recent).toEqual([entry]);
    expect(controller.getState().building?.ref.name).toBe('New name');
    expect(JSON.parse(storage.data.get(RECENT_BUILDINGS_KEY) ?? '[]')).toEqual([entry]);
  });
});

describe('BuildingController close and adopt', () => {
  it('close clears the building and the message', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    await controller.close();
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toBeNull();
  });

  it('adopt opens the building of a store without touching the recent list', async () => {
    const { controller } = setup();
    const store = new MemoryBuildingStore({ json: serializeBuildingFile(emptyBuilding('b-7', 'Adopted')) });
    await controller.adopt(store);
    const building = controller.getState().building;
    expect(building?.file.name).toBe('Adopted');
    expect(building?.ref).toEqual({ id: 'b-7', name: 'Adopted', location: 'dev' });
    expect(controller.getState().recent).toEqual([]);
  });

  it('adopt gives a message for an empty store', async () => {
    const { controller } = setup();
    await controller.adopt(new MemoryBuildingStore());
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toBe('The store holds no building.');
  });
});

describe('BuildingController state and subscribers', () => {
  it('getState returns the same object until a change', async () => {
    const { controller } = setup();
    const first = controller.getState();
    expect(controller.getState()).toBe(first);
    controller.dismissMessage();
    expect(controller.getState()).toBe(first);
  });

  it('notifies a subscriber and stops after unsubscribe', async () => {
    const { controller } = setup({ saveFileAs: savedAs('Tower.building.json') });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.create('Tower');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await controller.close();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('BuildingController save failures, reload and close', () => {
  it('keeps the file and gives a message when the write throws an error', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    stores.get('b-1')!.write = async () => {
      throw new Error('disk full');
    };
    await controller.update((file) => ({ ...file, name: 'Mine' }));
    expect(controller.getState().message).toBe('Could not save the building: disk full');
    expect(controller.getState().building?.file.name).toBe('Mine');
    expect(controller.getState().building?.dirty).toBe(false);
  });

  it('drops the writes queued behind a conflict and keeps the other writer file', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    await stores.get('b-1')!.write(serializeBuildingFile(emptyBuilding('b-1', 'Outside')));
    const first = controller.update((file) => ({ ...file, name: 'First' }));
    const second = controller.update((file) => ({ ...file, name: 'Second' }));
    await Promise.all([first, second]);
    expect(controller.getState().building?.file.name).toBe('Outside');
    expect(controller.getState().message).toBe(CONFLICT);
    const stored = JSON.parse((await stores.get('b-1')!.read())!.json) as { name: string };
    expect(stored.name).toBe('Outside');
  });

  it('picks up a file written behind the controller on reload with no message', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    await stores.get('b-1')!.write(serializeBuildingFile(emptyBuilding('b-1', 'Outside')));
    await controller.reload();
    expect(controller.getState().building?.file.name).toBe('Outside');
    expect(controller.getState().message).toBeNull();
    await controller.update((file) => ({ ...file, name: 'Mine' }));
    expect(controller.getState().message).toBeNull();
    const stored = JSON.parse((await stores.get('b-1')!.read())!.json) as { name: string };
    expect(stored.name).toBe('Mine');
  });

  it('waits for a queued write in close so the store holds the edit', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const pending = controller.update((file) => addLevel(file, 'Ground', 0, 'L1'));
    await controller.close();
    await pending;
    const stored = JSON.parse((await stores.get('b-1')!.read())!.json) as { levels: unknown[] };
    expect(stored.levels).toHaveLength(1);
  });

  it('ends with no building and no message when closed during a conflict re-read', async () => {
    const { controller, stores } = setup({ saveFileAs: savedAs('Tower.building.json') });
    await controller.create('Tower');
    const store = stores.get('b-1')!;
    await store.write(serializeBuildingFile(emptyBuilding('b-1', 'Outside')));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = store.read.bind(store);
    store.read = async () => {
      await gate;
      return read();
    };
    const updating = controller.update((file) => ({ ...file, name: 'Mine' }));
    const closing = controller.close();
    release();
    await Promise.all([updating, closing]);
    expect(controller.getState().building).toBeNull();
    expect(controller.getState().message).toBeNull();
  });
});

describe('BuildingController refreshSheetStatus', () => {
  const summaryJson = (projectUuid: string, sourceSizeBytes: number) =>
    JSON.stringify({ version: 1, projectUuid, savedAt: '2026-10-01T09:00:00.000Z', sourceSizeBytes, sourceModifiedMs: 5000, pages: {}, tables: [], warnings: [] });

  const sheetAt = (id: string, path: string | undefined, projectUuid: string | null): BuildingSheet => ({
    id,
    levelId: 'L1',
    projectUuid,
    pageIndex: 0,
    displayName: id,
    location: { fileName: `${id}.pdf`, path },
  });

  const buildingWith = (sheets: BuildingSheet[]): BuildingFile => ({ ...addLevel(emptyBuilding('b-8', 'Tower'), 'Ground', 0, 'L1'), sheets });

  const controllerWith = (fileAccess: Partial<FileAccess>) =>
    new BuildingController({ fileAccess: fileAccess as FileAccess, makeStore: () => new MemoryBuildingStore(), storage: fakeStorage(), newId: () => 'b-8' });

  it('gives the status of each sheet from its probe and its summary', async () => {
    const statPath = async (path: string) => {
      if (path === '/plans/missing.pdf') return { state: 'missing' as const };
      if (path === '/plans/locked.pdf') return { state: 'no-access' as const };
      return { state: 'ok' as const, sizeBytes: 500 };
    };
    const store = new MemoryBuildingStore({
      json: serializeBuildingFile(
        buildingWith([
          sheetAt('s-missing', '/plans/missing.pdf', 'p-missing'),
          sheetAt('s-locked', '/plans/locked.pdf', 'p-locked'),
          sheetAt('s-ok', '/plans/ok.pdf', 'p-ok'),
        ]),
      ),
      summaries: { 'p-ok': summaryJson('p-ok', 500) },
    });
    const controller = controllerWith({ statPath });
    await controller.adopt(store);
    await controller.refreshSheetStatus();
    expect(controller.getState().building?.sheetStatus).toEqual({ 's-missing': 'pdf-missing', 's-locked': 'no-access', 's-ok': 'ok' });
  });

  it('gives not-stamped for a sheet with no path and no projectUuid', async () => {
    const store = new MemoryBuildingStore({ json: serializeBuildingFile(buildingWith([sheetAt('s-1', undefined, null)])) });
    const controller = controllerWith({ statPath: async () => ({ state: 'ok' as const }) });
    await controller.adopt(store);
    await controller.refreshSheetStatus();
    expect(controller.getState().building?.sheetStatus).toEqual({ 's-1': 'not-stamped' });
  });

  it('gives the summary info of each sheet that has a summary and no entry for the others', async () => {
    const store = new MemoryBuildingStore({
      json: serializeBuildingFile(buildingWith([sheetAt('s-sum', '/plans/a.pdf', 'p-1'), sheetAt('s-none', '/plans/b.pdf', 'p-2')])),
      summaries: { 'p-1': summaryJson('p-1', 500) },
    });
    const controller = controllerWith({ statPath: async () => ({ state: 'ok' as const, sizeBytes: 500 }) });
    await controller.adopt(store);
    await controller.refreshSheetStatus();
    const sheetSummary = controller.getState().building?.sheetSummary;
    expect(sheetSummary?.['s-sum']).toEqual({ savedAt: '2026-10-01T09:00:00.000Z', scale: null });
    expect(sheetSummary).not.toHaveProperty('s-none');
  });

  it('treats every sheet as unknown and gives no throw when there is no statPath', async () => {
    const store = new MemoryBuildingStore({
      json: serializeBuildingFile(buildingWith([sheetAt('s-1', '/plans/a.pdf', 'p-1')])),
      summaries: { 'p-1': summaryJson('p-1', 500) },
    });
    const controller = controllerWith({});
    await controller.adopt(store);
    await expect(controller.refreshSheetStatus()).resolves.toBeUndefined();
    expect(controller.getState().building?.sheetStatus).toEqual({ 's-1': 'ok' });
  });

  it('does nothing when no building is open', async () => {
    const statPath = vi.fn(async () => ({ state: 'ok' as const }));
    const controller = controllerWith({ statPath });
    const before = controller.getState();
    await controller.refreshSheetStatus();
    expect(statPath).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(before);
  });

  it('drops a result that a close and a newer open overtook', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const statPath = async () => {
      await gate;
      return { state: 'missing' as const };
    };
    const controller = controllerWith({ statPath });
    await controller.adopt(new MemoryBuildingStore({ json: serializeBuildingFile(buildingWith([sheetAt('s-a', '/plans/a.pdf', 'p-a')])) }));
    const pending = controller.refreshSheetStatus();
    await controller.close();
    await controller.adopt(new MemoryBuildingStore({ json: serializeBuildingFile(buildingWith([sheetAt('s-b', '/plans/b.pdf', 'p-b')])) }));
    release();
    await pending;
    expect(controller.getState().building?.sheetStatus).not.toHaveProperty('s-a');
  });

  it('drops a result whose file an update replaced while the probe ran', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const statPath = async (path: string) => {
      if (hold && path === '/plans/old.pdf') await gate;
      return path === '/plans/old.pdf' ? { state: 'missing' as const } : { state: 'ok' as const, sizeBytes: 500 };
    };
    const controller = controllerWith({ statPath });
    await controller.adopt(new MemoryBuildingStore({ json: serializeBuildingFile(buildingWith([sheetAt('s-old', '/plans/old.pdf', null)])) }));
    hold = true;
    const pending = controller.refreshSheetStatus();
    const updating = controller.update((file) => ({ ...file, sheets: [sheetAt('s-new', '/plans/new.pdf', null)] }));
    await updating;
    release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(controller.getState().building?.sheetStatus).toEqual({ 's-new': 'not-stamped' });
  });
});
