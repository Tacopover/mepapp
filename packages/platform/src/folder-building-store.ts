import type { BuildingStore } from './building-store.js';
import { checkRevision } from './revision.js';
import type { StoreCapabilities, StoreStatus } from './store.js';

/** The files of one folder, as the folder adapter of a platform exposes them. */
export interface FolderFiles {
  read(name: string): Promise<{ text: string; modifiedMs: number; sizeBytes: number } | undefined>;
  write(name: string, text: string): Promise<void>;
  list(): Promise<string[]>;
}

export const SUMMARY_SUFFIX = '.summary.json';

const SAFE_PROJECT_UUID = /^[A-Za-z0-9_-]+$/;

export function summaryFileName(projectUuid: string): string {
  if (!SAFE_PROJECT_UUID.test(projectUuid)) {
    throw new Error(`Project uuid "${projectUuid}" cannot be used as a file name`);
  }
  return `${projectUuid}${SUMMARY_SUFFIX}`;
}

const FOLDER_CAPABILITIES: StoreCapabilities = {
  persistent: true,
  needsUserGesture: false,
  shareable: true,
  worksOffline: true,
};

export class FolderBuildingStore implements BuildingStore {
  readonly capabilities = FOLDER_CAPABILITIES;
  private readonly files: FolderFiles;
  private readonly buildingFileName: string;

  constructor(files: FolderFiles, buildingFileName: string) {
    this.files = files;
    this.buildingFileName = buildingFileName;
  }

  async status(): Promise<StoreStatus> {
    return 'ready';
  }

  async requestAccess(): Promise<StoreStatus> {
    return 'ready';
  }

  async read(): Promise<{ json: string; revision: string } | undefined> {
    const file = await this.files.read(this.buildingFileName);
    // Two writes within one ms with equal size give equal revisions; accepted.
    return file === undefined
      ? undefined
      : { json: file.text, revision: `${file.modifiedMs}:${file.sizeBytes}` };
  }

  async write(json: string, expectedRevision?: string): Promise<{ revision: string }> {
    const current = await this.read();
    checkRevision(this.buildingFileName, expectedRevision, current?.revision);
    await this.files.write(this.buildingFileName, json);
    const written = await this.read();
    if (written === undefined) {
      throw new Error(`Building file "${this.buildingFileName}" is missing after a write`);
    }
    return { revision: written.revision };
  }

  async readSummary(projectUuid: string): Promise<string | undefined> {
    const file = await this.files.read(summaryFileName(projectUuid));
    return file?.text;
  }

  async writeSummary(projectUuid: string, json: string): Promise<void> {
    await this.files.write(summaryFileName(projectUuid), json);
  }

  async listSummaries(): Promise<string[]> {
    const names = await this.files.list();
    return names
      .filter((name) => name.endsWith(SUMMARY_SUFFIX))
      .map((name) => name.slice(0, -SUMMARY_SUFFIX.length))
      .sort();
  }
}
