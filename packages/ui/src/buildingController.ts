import { BuildingFileError, emptyBuilding, parseBuildingFile, serializeBuildingFile, type BuildingFile, type SheetSummary } from '@mepapp/core';
import {
  StoreConflictError,
  type BuildingRef,
  type BuildingStore,
  type FileAccess,
  type FileTarget,
  type FileTypeFilter,
  type OpenedFile,
  type SavedFile,
} from '@mepapp/platform';
import { sheetStatusOf, sheetSummaryInfo, type SheetProbe, type SheetStatus, type SheetSummaryInfo } from './buildingStatus.js';
import {
  addRecentBuilding,
  loadRecentBuildings,
  removeRecentBuilding,
  saveRecentBuildings,
  type RecentBuilding,
} from './recentBuildings.js';
import { readSummaries, statSheets, type SheetStat } from './quantitiesScope.js';
import { importOldRegistry, markOldImported, type Building } from './buildings.js';

export type { SheetStatus } from './buildingStatus.js';
export type { SheetSummaryInfo } from './buildingStatus.js';

export interface OpenBuilding {
  file: BuildingFile;
  revision: string;
  store: BuildingStore;
  ref: BuildingRef;
  /** True while a write is queued or running. */
  dirty: boolean;
  sheetStatus: Record<string, SheetStatus>;
  /** Only the sheets that have a saved summary, by sheet id. */
  sheetSummary: Record<string, SheetSummaryInfo>;
}

export interface BuildingState {
  building: OpenBuilding | null;
  recent: RecentBuilding[];
  /** A sentence for the user (a failure or a lost change), or null. */
  message: string | null;
  /** True while create/open/openRecent runs. */
  busy: boolean;
}

export interface BuildingControllerArgs {
  fileAccess: FileAccess;
  makeStore: (ref: BuildingRef) => BuildingStore;
  /** Storage for the recent list; defaults to localStorage (see recentBuildings.ts). */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Defaults to crypto.randomUUID. */
  newId?: () => string;
}

export const BUILDING_FILE_TYPES: FileTypeFilter[] = [
  { description: 'Building file', mimeType: 'application/json', extensions: ['json'] },
];

const CONFLICT_MESSAGE = 'The building file changed on disk. Your last change was not saved.';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStoreConflict(error: unknown): boolean {
  return error instanceof StoreConflictError || (error instanceof Error && error.name === 'StoreConflictError');
}

function isInvalidFile(error: unknown): boolean {
  return error instanceof BuildingFileError || error instanceof SyntaxError;
}

function locationOf(target: FileTarget | undefined, fallbackName: string): string {
  const path = (target as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? path : fallbackName;
}

/** True when a patch changes at least one field of the current object. */
function changes<T extends object>(current: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as Array<keyof T>).some((key) => !Object.is(current[key], patch[key]));
}

export class BuildingController {
  private state: BuildingState;
  private readonly listeners = new Set<() => void>();
  private readonly fileAccess: FileAccess;
  private readonly makeStore: (ref: BuildingRef) => BuildingStore;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  private readonly newId: () => string;
  /** Advances when the open building changes or a conflict drops the queued writes. */
  private generation = 0;
  private pendingWrites = 0;
  private writeChain: Promise<void> = Promise.resolve();
  /** The JSON that the store holds, or that the open building was loaded from. */
  private lastJson = '';

  constructor(args: BuildingControllerArgs) {
    this.fileAccess = args.fileAccess;
    this.makeStore = args.makeStore;
    this.storage = args.storage;
    this.newId = args.newId ?? (() => crypto.randomUUID());
    this.state = { building: null, recent: loadRecentBuildings(args.storage), message: null, busy: false };
  }

  getState(): BuildingState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async create(name: string): Promise<void> {
    const title = name.trim() || 'New building';
    const file = emptyBuilding(this.newId(), title);
    const json = serializeBuildingFile(file);
    const suggested = `${title.replace(/[\\/:*?"<>|]/g, '-')}.building.json`;
    try {
      const saved: SavedFile | undefined = await this.fileAccess.saveFileAs(
        suggested,
        BUILDING_FILE_TYPES,
        new Blob([json], { type: 'application/json' }),
      );
      if (saved === undefined) return;
      const ref: BuildingRef = { id: file.id, name: title, location: locationOf(saved.target, saved.name) };
      await this.busy(() => this.loadInto(this.makeStore(ref), ref, json));
    } catch (error) {
      this.setState({ message: `Could not create the building: ${messageOf(error)}` });
    }
  }

  async open(): Promise<void> {
    try {
      const opened: OpenedFile | undefined = await this.fileAccess.openFile(BUILDING_FILE_TYPES);
      if (opened === undefined) return;
      await this.busy(async () => {
        const text = await opened.file.text();
        const parsed = parseBuildingFile(JSON.parse(text));
        const ref: BuildingRef = { id: parsed.id, name: parsed.name, location: locationOf(opened.target, opened.file.name) };
        await this.loadInto(this.makeStore(ref), ref, text);
      });
    } catch (error) {
      const prefix = isInvalidFile(error) ? 'This is not a valid building file' : 'Could not open the building';
      this.setState({ message: `${prefix}: ${messageOf(error)}` });
    }
  }

  /** Saves each old building as a building file; the user picks the place for each one (saveFileAs). A cancelled picker skips that building (not marked). A saved one is added to the recent list and marked imported. A failure of one building does not stop the others. Does not open any building. */
  async importOldBuildings(buildings: Building[]): Promise<{ saved: number; cancelled: number; failed: string[] }> {
    const result = { saved: 0, cancelled: 0, failed: [] as string[] };
    await this.busy(async () => {
      for (const building of buildings) {
        try {
          const file = importOldRegistry([building])[0];
          const json = serializeBuildingFile(file);
          const suggested = `${building.name.replace(/[\\/:*?"<>|]/g, '-')}.building.json`;
          const saved: SavedFile | undefined = await this.fileAccess.saveFileAs(
            suggested,
            BUILDING_FILE_TYPES,
            new Blob([json], { type: 'application/json' }),
          );
          if (saved === undefined) {
            result.cancelled += 1;
            continue;
          }
          const entry: RecentBuilding = { id: file.id, name: file.name, location: locationOf(saved.target, saved.name) };
          this.setState({ recent: this.remember(entry) });
          markOldImported([building.id], this.storage);
          result.saved += 1;
        } catch (error) {
          result.failed.push(`${building.name}: ${messageOf(error)}`);
        }
      }
    });
    return result;
  }

  async openRecent(entry: RecentBuilding): Promise<void> {
    try {
      await this.busy(async () => {
        const store = this.makeStore(entry);
        const stored = await store.read();
        if (stored === undefined || (JSON.parse(stored.json) as { id?: unknown }).id !== entry.id) {
          this.setState({ message: `The building file "${entry.name}" was not found. Use Open building… to find it.` });
          return;
        }
        await this.loadInto(store, entry, stored.json);
      });
    } catch (error) {
      this.setState({ message: `Could not open the building: ${messageOf(error)}` });
    }
  }

  forgetRecent(id: string): void {
    const list = removeRecentBuilding(this.state.recent, id);
    saveRecentBuildings(list, this.storage);
    this.setState({ recent: list });
  }

  async adopt(store: BuildingStore, location = 'dev'): Promise<void> {
    try {
      await this.writeChain;
      const stored = await store.read();
      if (stored === undefined) {
        this.setState({ message: 'The store holds no building.' });
        return;
      }
      const file = parseBuildingFile(JSON.parse(stored.json));
      this.showBuilding({
        file,
        revision: stored.revision,
        store,
        ref: { id: file.id, name: file.name, location },
        dirty: false,
        sheetStatus: {},
        sheetSummary: {},
      });
      void this.refreshSheetStatus();
    } catch (error) {
      this.setState({ message: `Could not open the building: ${messageOf(error)}` });
    }
  }

  async update(change: (file: BuildingFile) => BuildingFile): Promise<void> {
    const current = this.state.building;
    if (current === null) return;
    const next = change(current.file);
    if (next === current.file) return;
    this.setBuilding({ file: next, dirty: true });
    this.pendingWrites += 1;
    const generation = this.generation;
    const write = this.writeChain.then(() => this.writeLatest(generation));
    this.writeChain = write;
    return write;
  }

  async close(): Promise<void> {
    await this.writeChain;
    this.generation += 1;
    this.setState({ building: null, message: null });
  }

  async reload(): Promise<void> {
    if (this.state.building === null) return;
    if (this.pendingWrites > 0) await this.writeChain;
    const building = this.state.building;
    if (building === null) return;
    const generation = this.generation;
    try {
      const stored = await building.store.read();
      if (this.generation !== generation) return;
      if (stored === undefined || stored.revision === building.revision) return;
      const file = parseBuildingFile(JSON.parse(stored.json));
      this.lastJson = serializeBuildingFile(file);
      this.setBuilding({ file, revision: stored.revision });
      void this.refreshSheetStatus();
    } catch (error) {
      if (this.generation !== generation) return;
      this.setState({ message: `Could not read the building: ${messageOf(error)}` });
    }
  }

  /** Probes every sheet (statPath) and reads the summaries; stores the result in building.sheetStatus. Does nothing when no building is open. Ignores a result that a newer open of a building overtook (generation). Never throws: a failure leaves the old statuses and sets no message. */
  async refreshSheetStatus(): Promise<void> {
    const building = this.state.building;
    if (building === null) return;
    const generation = this.generation;
    const { file } = building;
    const withPath = file.sheets.filter((sheet) => sheet.location.path !== undefined);
    const statPath = this.fileAccess.statPath?.bind(this.fileAccess);
    const stats: Map<string, SheetStat> = statPath === undefined ? new Map() : await statSheets(withPath, statPath);
    let summaries = new Map<string, SheetSummary>();
    try {
      summaries = (await readSummaries(building.store)).summaries;
    } catch {
      summaries = new Map();
    }
    if (this.generation !== generation) return;
    const sheetStatus: Record<string, SheetStatus> = {};
    const sheetSummary: Record<string, SheetSummaryInfo> = {};
    for (const sheet of file.sheets) {
      const stat = statPath === undefined ? undefined : stats.get(sheet.id);
      const probe: SheetProbe = stat === undefined ? { state: 'unknown' } : { state: stat.state, sizeBytes: stat.sizeBytes };
      const summary = sheet.projectUuid !== null ? summaries.get(sheet.projectUuid) : undefined;
      sheetStatus[sheet.id] = sheetStatusOf(sheet, probe, summary);
      const info = sheetSummaryInfo(sheet, summary);
      if (info !== undefined) sheetSummary[sheet.id] = info;
    }
    const current = this.state.building;
    if (
      current?.file !== file ||
      (JSON.stringify(current.sheetStatus) === JSON.stringify(sheetStatus) && JSON.stringify(current.sheetSummary) === JSON.stringify(sheetSummary))
    ) {
      return;
    }
    this.setBuilding({ sheetStatus, sheetSummary });
  }

  dismissMessage(): void {
    this.setState({ message: null });
  }

  private setState(patch: Partial<BuildingState>): void {
    if (!changes(this.state, patch)) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setBuilding(patch: Partial<OpenBuilding>): void {
    const current = this.state.building;
    if (current === null || !changes(current, patch)) return;
    this.setState({ building: { ...current, ...patch } });
  }

  private showBuilding(building: OpenBuilding, recent?: RecentBuilding[]): void {
    this.generation += 1;
    this.lastJson = serializeBuildingFile(building.file);
    this.setState({ building, message: null, recent: recent ?? this.state.recent });
  }

  private async busy(task: () => Promise<void>): Promise<void> {
    this.setState({ busy: true });
    try {
      await task();
    } finally {
      this.setState({ busy: false });
    }
  }

  private async loadInto(store: BuildingStore, ref: BuildingRef, json: string): Promise<void> {
    await this.writeChain;
    if (!store.capabilities.persistent) await store.write(json);
    let stored = await store.read();
    if (stored === undefined) {
      await store.write(json);
      stored = await store.read();
    }
    if (stored === undefined) throw new Error('The building file could not be written.');
    const file = parseBuildingFile(JSON.parse(stored.json));
    const entry: RecentBuilding = { id: ref.id, name: ref.name, location: ref.location };
    this.showBuilding(
      { file, revision: stored.revision, store, ref: { id: file.id, name: file.name, location: ref.location }, dirty: false, sheetStatus: {}, sheetSummary: {} },
      this.remember(entry),
    );
    void this.refreshSheetStatus();
  }

  private remember(entry: RecentBuilding): RecentBuilding[] {
    const list = addRecentBuilding(this.state.recent, entry);
    saveRecentBuildings(list, this.storage);
    return list;
  }

  private async writeLatest(generation: number): Promise<void> {
    try {
      await this.writeNewest(generation);
    } catch (error) {
      if (generation === this.generation) {
        const store = this.state.building?.store;
        if (isStoreConflict(error) && store !== undefined) {
          await this.recoverFromConflict(store);
        } else {
          this.setState({ message: `Could not save the building: ${messageOf(error)}` });
          this.setBuilding({ dirty: false });
        }
      }
    } finally {
      this.pendingWrites -= 1;
      if (this.pendingWrites === 0) {
        this.setBuilding({ dirty: false });
        void this.refreshSheetStatus();
      }
    }
  }

  private async writeNewest(generation: number): Promise<void> {
    const building = this.state.building;
    if (generation !== this.generation || building === null) return;
    const json = serializeBuildingFile(building.file);
    if (json === this.lastJson) return;
    const result = await building.store.write(json, building.revision);
    if (generation !== this.generation) return;
    this.lastJson = json;
    this.setBuilding({ revision: result.revision });
  }

  private async recoverFromConflict(store: BuildingStore): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    let message = CONFLICT_MESSAGE;
    try {
      const stored = await store.read();
      if (this.generation !== generation) return;
      if (stored !== undefined) {
        const file = parseBuildingFile(JSON.parse(stored.json));
        this.lastJson = serializeBuildingFile(file);
        this.setBuilding({ file, revision: stored.revision });
        void this.refreshSheetStatus();
      }
    } catch (error) {
      if (this.generation !== generation) return;
      message =`Could not save the building: ${messageOf(error)}`;
    }
    this.setState({ message });
    this.setBuilding({ dirty: false });
  }
}
