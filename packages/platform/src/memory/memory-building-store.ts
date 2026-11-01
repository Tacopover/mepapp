import { checkRevision } from '../revision.js';
import type { BuildingStore } from '../building-store.js';
import type { StoreStatus } from '../store.js';
import { MEMORY_CAPABILITIES } from './memory-capabilities.js';

export class MemoryBuildingStore implements BuildingStore {
  readonly capabilities = MEMORY_CAPABILITIES;
  private counter = 0;
  private file: { json: string; revision: string } | undefined;
  private readonly summaries = new Map<string, string>();

  constructor(initial?: { json: string; summaries?: Record<string, string> }) {
    if (initial !== undefined) {
      this.counter += 1;
      this.file = { json: initial.json, revision: String(this.counter) };
      for (const [projectUuid, json] of Object.entries(initial.summaries ?? {})) {
        this.summaries.set(projectUuid, json);
      }
    }
  }

  async status(): Promise<StoreStatus> {
    return 'ready';
  }

  async requestAccess(): Promise<StoreStatus> {
    return 'ready';
  }

  async read(): Promise<{ json: string; revision: string } | undefined> {
    return this.file === undefined ? undefined : { ...this.file };
  }

  async write(json: string, expectedRevision?: string): Promise<{ revision: string }> {
    checkRevision('building', expectedRevision, this.file?.revision);
    this.counter += 1;
    const revision = String(this.counter);
    this.file = { json, revision };
    return { revision };
  }

  async readSummary(projectUuid: string): Promise<string | undefined> {
    return this.summaries.get(projectUuid);
  }

  async writeSummary(projectUuid: string, json: string): Promise<void> {
    this.summaries.set(projectUuid, json);
  }

  async listSummaries(): Promise<string[]> {
    return [...this.summaries.keys()].sort();
  }
}
