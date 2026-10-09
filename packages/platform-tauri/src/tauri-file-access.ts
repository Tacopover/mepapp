import type { FileAccess, FileAccessCapabilities, FileTarget, FileTypeFilter, LibraryFolderRef, OpenedFile, SavedFile } from '@mepapp/platform';
import { dirname, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';

interface PathTarget extends FileTarget {
  readonly path: string;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function dialogFilters(types: FileTypeFilter[]) {
  return types.map((t) => ({ name: t.description, extensions: t.extensions }));
}

function mimeTypeFor(name: string, types: FileTypeFilter[]): string {
  return types.find((t) => hasExtension(name, t.extensions))?.mimeType ?? '';
}

// lastModified comes from the file itself, as on the web: the app keys an open document on name, size and lastModified.
async function readAsFile(path: string, type: string): Promise<File> {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
  return new File([bytes], baseName(path), { type, lastModified: info.mtime?.getTime() ?? Date.now() });
}

function folderPathOf(folder: LibraryFolderRef): string {
  if (!('folderPath' in folder)) throw new Error('This folder was added in the browser and cannot be read in the desktop app.');
  return folder.folderPath;
}

function hasExtension(name: string, extensions: string[]): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && extensions.includes(name.slice(dot + 1).toLowerCase());
}

// The dialog plugin adds each picked path to the fs plugin's scope, and the
// persisted-scope plugin (src-tauri/src/lib.rs) keeps it across restarts. So
// the app can read and write only what the user picked in a dialog.
export class TauriFileAccess implements FileAccess {
  readonly capabilities: FileAccessCapabilities = { writeBack: true, folders: true };
  // The folder of the last opened or saved file: Save As starts there instead of the app's working folder.
  private lastDirectory: string | undefined;

  async openFile(types: FileTypeFilter[]): Promise<OpenedFile | undefined> {
    const path = await open({ multiple: false, directory: false, filters: dialogFilters(types) });
    if (path === null) return undefined;
    this.lastDirectory = await dirname(path);
    const target: PathTarget = { name: baseName(path), path };
    return { file: await readAsFile(path, mimeTypeFor(path, types)), target };
  }

  async writeFile(target: FileTarget, data: Blob): Promise<void> {
    await writeFile((target as PathTarget).path, new Uint8Array(await data.arrayBuffer()));
  }

  async saveFileAs(suggestedName: string, types: FileTypeFilter[], data: Blob): Promise<SavedFile | undefined> {
    const defaultPath = this.lastDirectory ? await join(this.lastDirectory, suggestedName) : suggestedName;
    const path = await save({ defaultPath, filters: dialogFilters(types) });
    if (path === null) return undefined;
    this.lastDirectory = await dirname(path);
    const target: PathTarget = { name: baseName(path), path };
    await this.writeFile(target, data);
    return { name: target.name, target };
  }

  async pickFolder(): Promise<{ name: string; folder: LibraryFolderRef } | undefined> {
    const path = await open({ directory: true, multiple: false, recursive: false });
    if (path === null) return undefined;
    return { name: baseName(path), folder: { folderPath: path } };
  }

  async requestFolderAccess(folder: LibraryFolderRef): Promise<boolean> {
    folderPathOf(folder);
    return true;
  }

  async readFolder(folder: LibraryFolderRef, extensions: string[]): Promise<File[]> {
    const dir = folderPathOf(folder);
    const names = (await readDir(dir))
      .filter((entry) => entry.isFile && hasExtension(entry.name, extensions))
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const files: File[] = [];
    // The type stays empty, as getFile() can return on the web: the caller sets it from the extension.
    for (const name of names) files.push(await readAsFile(await join(dir, name), ''));
    return files;
  }
}
