import type { FileAccess, FileAccessCapabilities, FileTarget, FileTypeFilter, LibraryFolderRef, OpenedFile, SavedFile } from '@mepapp/platform';

// The File System Access API (showOpenFilePicker/showSaveFilePicker) is what
// lets "Save" write straight back to the file the user opened, with no
// download prompt — it's Chromium-only today (not in Firefox/Safari), so
// every method below feature-detects it and falls back to the old
// download-a-copy behavior where it's missing. That fallback is never a
// regression: it's exactly what this app already did before Save/Save As existed.
function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function pickerTypes(types: FileTypeFilter[]) {
  return types.map((t) => ({ description: t.description, accept: { [t.mimeType]: t.extensions.map((ext) => `.${ext}`) } }));
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// The fallback path for browsers without the File System Access API: a
// classic <input type="file">, added for the one pick. click() runs before
// any await, so it still counts as the user's click.
function pickWithFileInput(types: FileTypeFilter[]): Promise<File | undefined> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = types.flatMap((t) => t.extensions.map((ext) => `.${ext}`)).join(',');
  input.style.display = 'none';
  document.body.appendChild(input);
  return new Promise((resolve) => {
    const finish = (file: File | undefined) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => finish(undefined), { once: true });
    input.click();
  });
}

function hasExtension(name: string, extensions: string[]): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && extensions.includes(name.slice(dot + 1).toLowerCase());
}

/** Top level of the folder only: files with one of the extensions, sorted by name. Subfolders are skipped. */
export async function scanDirectoryHandle(dir: FileSystemDirectoryHandle, extensions: string[]): Promise<File[]> {
  const files: File[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== 'file' || !hasExtension(handle.name, extensions)) continue;
    files.push(await (handle as FileSystemFileHandle).getFile());
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function dirHandleOf(folder: LibraryFolderRef): FileSystemDirectoryHandle {
  if (!('dirHandle' in folder)) throw new Error('This folder was added in the desktop app and cannot be read in the browser.');
  return folder.dirHandle;
}

export class WebFileAccess implements FileAccess {
  get capabilities(): FileAccessCapabilities {
    return { writeBack: supportsFileSystemAccess(), folders: supportsDirectoryPicker() };
  }

  async openFile(types: FileTypeFilter[]): Promise<OpenedFile | undefined> {
    if (!supportsFileSystemAccess()) {
      const file = await pickWithFileInput(types);
      return file ? { file } : undefined;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker!({ types: pickerTypes(types) });
      return { file: await fileHandle.getFile(), target: fileHandle };
    } catch (err) {
      if (isAbortError(err)) return undefined;
      throw err;
    }
  }

  async writeFile(target: FileTarget, data: Blob): Promise<void> {
    const writable = await (target as FileSystemFileHandle).createWritable();
    await writable.write(data);
    await writable.close();
  }

  async saveFileAs(suggestedName: string, types: FileTypeFilter[], data: Blob): Promise<SavedFile | undefined> {
    if (!supportsFileSystemAccess()) {
      downloadBlob(data, suggestedName);
      return { name: suggestedName };
    }
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await window.showSaveFilePicker!({ suggestedName, types: pickerTypes(types) });
    } catch (err) {
      if (isAbortError(err)) return undefined;
      throw err;
    }
    await this.writeFile(fileHandle, data);
    return { name: fileHandle.name, target: fileHandle };
  }

  async pickFolder(): Promise<{ name: string; folder: LibraryFolderRef } | undefined> {
    try {
      const dirHandle = await window.showDirectoryPicker!({ id: 'mepapp-stamp-library', mode: 'read' });
      return { name: dirHandle.name, folder: { dirHandle } };
    } catch (err) {
      if (isAbortError(err)) return undefined;
      throw new Error(`The browser refused this folder (${err instanceof Error ? err.message : String(err)}). Pick a subfolder instead.`);
    }
  }

  async requestFolderAccess(folder: LibraryFolderRef): Promise<boolean> {
    const handle = dirHandleOf(folder);
    if (!handle.queryPermission || !handle.requestPermission) return true;
    if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'read' })) === 'granted';
  }

  readFolder(folder: LibraryFolderRef, extensions: string[]): Promise<File[]> {
    return scanDirectoryHandle(dirHandleOf(folder), extensions);
  }
}
