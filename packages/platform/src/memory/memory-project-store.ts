import { checkRevision } from '../revision.js';
import type { ProjectKey, ProjectStore } from '../project-store.js';
import type { StoreStatus } from '../store.js';
import { MEMORY_CAPABILITIES } from './memory-capabilities.js';

function keyId(key: ProjectKey): string {
  return JSON.stringify([key.pdfName, key.locationId ?? null]);
}

export class MemoryProjectStore implements ProjectStore {
  readonly capabilities = MEMORY_CAPABILITIES;
  private counter = 0;
  private readonly entries = new Map<string, { json: string; revision: string }>();

  async status(): Promise<StoreStatus> {
    return 'ready';
  }

  async requestAccess(): Promise<StoreStatus> {
    return 'ready';
  }

  async read(key: ProjectKey): Promise<{ json: string; revision: string } | undefined> {
    const entry = this.entries.get(keyId(key));
    return entry === undefined ? undefined : { ...entry };
  }

  async write(key: ProjectKey, json: string, expectedRevision?: string): Promise<{ revision: string }> {
    const id = keyId(key);
    checkRevision(id, expectedRevision, this.entries.get(id)?.revision);
    this.counter += 1;
    const revision = String(this.counter);
    this.entries.set(id, { json, revision });
    return { revision };
  }
}
