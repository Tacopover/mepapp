import { MemoryBuildingStore, type BuildingStore } from '@mepapp/platform';

export interface DevBuildingStore extends BuildingStore {
  /** Replaces the held building and summaries. Revision restarts. */
  load(json: string, summaries?: Record<string, string>): void;
}

export function createDevBuildingStore(): DevBuildingStore {
  let inner = new MemoryBuildingStore();
  return {
    get capabilities() {
      return inner.capabilities;
    },
    status: () => inner.status(),
    requestAccess: () => inner.requestAccess(),
    read: () => inner.read(),
    write: (json, expectedRevision) => inner.write(json, expectedRevision),
    readSummary: (projectUuid) => inner.readSummary(projectUuid),
    writeSummary: (projectUuid, json) => inner.writeSummary(projectUuid, json),
    listSummaries: () => inner.listSummaries(),
    load: (json, summaries) => {
      inner = new MemoryBuildingStore({ json, summaries });
    },
  };
}
