import type { BaseStore } from './store.js';

export interface BuildingRef {
  id: string;
  name: string;
  location: string;
}

/** 'file': the building is a file the user picked (Chrome, Edge, desktop). 'browser': kept inside the browser (no File System Access API). 'blocked': neither works. */
export type BuildingStorageKind = 'file' | 'browser' | 'blocked';

export interface BuildingStore extends BaseStore {
  /** The building file as an opaque JSON string with its revision, or undefined when absent. */
  read(): Promise<{ json: string; revision: string } | undefined>;
  /** No expectedRevision = unconditional; otherwise throws StoreConflictError on mismatch or when the file is absent. */
  write(json: string, expectedRevision?: string): Promise<{ revision: string }>;
  readSummary(projectUuid: string): Promise<string | undefined>;
  writeSummary(projectUuid: string, json: string): Promise<void>;
  /** The projectUuid of each stored summary, sorted. */
  listSummaries(): Promise<string[]>;
}
