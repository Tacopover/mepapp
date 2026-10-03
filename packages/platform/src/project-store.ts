import type { BaseStore } from './store.js';

// Provisional: the shape may change when the project store gets a real implementation.
export interface ProjectKey {
  pdfName: string;
  locationId?: string;
}

export interface ProjectStore extends BaseStore {
  /** Returns the stored JSON (opaque string) and its revision, or undefined when the key is absent. */
  read(key: ProjectKey): Promise<{ json: string; revision: string } | undefined>;
  /** No expectedRevision = unconditional; otherwise throws StoreConflictError on mismatch or absent key. */
  write(key: ProjectKey, json: string, expectedRevision?: string): Promise<{ revision: string }>;
}
