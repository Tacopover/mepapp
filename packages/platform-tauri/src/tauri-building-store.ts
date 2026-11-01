import { FolderBuildingStore } from '@mepapp/platform';
import type { FolderFiles } from '@mepapp/platform';
import { join } from '@tauri-apps/api/path';
import { readDir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';
import { pathStateOfError } from './path-state.js';

export function createTauriBuildingStore(folderPath: string, buildingFileName: string): FolderBuildingStore {
  const files: FolderFiles = {
    async read(name) {
      const path = await join(folderPath, name);
      try {
        const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
        return { text: new TextDecoder().decode(bytes), modifiedMs: info.mtime?.getTime() ?? 0, sizeBytes: info.size };
      } catch (err) {
        if (pathStateOfError(err) === 'missing') return undefined;
        throw err;
      }
    },
    async write(name, text) {
      await writeFile(await join(folderPath, name), new TextEncoder().encode(text));
    },
    async list() {
      const entries = await readDir(folderPath);
      return entries.filter((entry) => entry.isFile).map((entry) => entry.name);
    },
  };
  return new FolderBuildingStore(files, buildingFileName);
}
