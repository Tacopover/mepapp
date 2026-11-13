import type { BuildingSheet } from '@mepapp/core';
import type { FileTarget, OpenedFile } from '@mepapp/platform';

type GettableTarget = FileTarget & { getFile?: () => Promise<File> };

/** PDFs the user gave the app in this tab (Add PDFs, Add folder, Open). In memory only. No file bytes are read. */
export class SheetFileCache {
  private readonly entries = new Map<string, OpenedFile>();
  /** Keys with two different files (different lastModified) under one name and size. Such a key is never used. */
  private readonly ambiguous = new Set<string>();

  static key(fileName: string, sizeBytes: number): string {
    return `${fileName}:${sizeBytes}`;
  }

  remember(opened: OpenedFile): void {
    const key = SheetFileCache.key(opened.file.name, opened.file.size);
    const previous = this.entries.get(key);
    if (previous !== undefined && previous.file.lastModified !== opened.file.lastModified) this.ambiguous.add(key);
    this.entries.set(key, opened);
  }

  has(sheet: BuildingSheet): boolean {
    const size = sheet.location.sizeBytes;
    if (size === undefined) return false;
    const key = SheetFileCache.key(sheet.location.fileName, size);
    return this.entries.has(key) && !this.ambiguous.has(key);
  }

  /** True when the key of the sheet has two different files. False for a sheet with no size and for an unknown file. */
  isAmbiguous(sheet: BuildingSheet): boolean {
    const size = sheet.location.sizeBytes;
    if (size === undefined) return false;
    return this.ambiguous.has(SheetFileCache.key(sheet.location.fileName, size));
  }

  /** The file of the sheet, or undefined. With a target that has getFile(): calls it again; if it throws or the size differs from sheet.location.sizeBytes, drops the entry and returns undefined. Without such a target: returns the stored file when its size equals sheet.location.sizeBytes. An ambiguous key returns undefined. */
  async take(sheet: BuildingSheet): Promise<OpenedFile | undefined> {
    const size = sheet.location.sizeBytes;
    if (size === undefined) return undefined;
    const key = SheetFileCache.key(sheet.location.fileName, size);
    if (this.ambiguous.has(key)) return undefined;
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    const target = entry.target as GettableTarget | undefined;
    if (typeof target?.getFile === 'function') {
      const file = await target.getFile().catch(() => undefined);
      if (file?.size === size) return { file, target: entry.target };
      if (this.entries.get(key) === entry) this.entries.delete(key);
      return undefined;
    }
    return entry.file.size === size ? entry : undefined;
  }

  clear(): void {
    this.entries.clear();
    this.ambiguous.clear();
  }
}
