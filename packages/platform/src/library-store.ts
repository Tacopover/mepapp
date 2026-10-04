import type { Discipline, PortSpec, SymbolShape } from '@mepapp/core';
import type { BaseStore } from './store.js';

export type LibraryCategory = 'terminal' | 'equipment';
export type LibraryStampMimeType = 'image/svg+xml' | 'image/png' | 'image/jpeg';

export interface LibrarySourceRecord {
  id: string;
  name: string;
  category: LibraryCategory;
  discipline: Discipline;
  dirHandle?: FileSystemDirectoryHandle;
  lastSyncedAt?: number;
  revision?: string;
}

export interface LibraryStampEdits {
  label?: string;
  discipline?: Discipline;
  ports?: PortSpec[];
  nativeWidth?: number;
  nativeHeight?: number;
  category?: LibraryCategory;
  definitionPortGroups?: string[][];
  shapes?: SymbolShape[];
  iconRef?: string;
}

export interface LibraryStampRecord {
  id: string;
  sourceId: string;
  fileName: string;
  mimeType: LibraryStampMimeType;
  fileSize: number;
  fileModified: number;
  missingFromFolder: boolean;
  nativeWidth: number;
  nativeHeight: number;
  edits: LibraryStampEdits;
  hidden?: boolean;
  revision?: string;
}

export interface LibraryStore extends BaseStore {
  /** Returns all sources; each record carries the store's current revision. */
  listSources(): Promise<LibrarySourceRecord[]>;
  /** Throws StoreConflictError on a stale revision; no revision = unconditional. Returns the new revision. */
  putSource(source: LibrarySourceRecord): Promise<{ revision: string }>;
  /** Also removes the source's stamps and their blobs. */
  removeSource(sourceId: string): Promise<void>;
  /** Returns stamps (all, or one source's) with current revisions; never loads blob bytes. */
  listStamps(sourceId?: string): Promise<LibraryStampRecord[]>;
  /** Returns the stamp's blob, or undefined when there is none. */
  getStampBlob(stampId: string): Promise<Blob | undefined>;
  /** Same revision rule as putSource; omitted blob keeps the existing blob; throws if sourceId is unknown. */
  putStamp(record: LibraryStampRecord, blob?: Blob): Promise<{ revision: string }>;
  /** Also removes the stamp's blob. */
  removeStamp(stampId: string): Promise<void>;
}
