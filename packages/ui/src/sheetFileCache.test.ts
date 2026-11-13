import { describe, expect, it, vi } from 'vitest';
import type { BuildingSheet } from '@mepapp/core';
import type { FileTarget } from '@mepapp/platform';
import { SheetFileCache } from './sheetFileCache.js';

const sheetOf = (fileName: string, sizeBytes?: number): BuildingSheet => ({
  id: `s-${fileName}`,
  levelId: 'L1',
  projectUuid: null,
  pageIndex: 0,
  displayName: fileName,
  location: { fileName, sizeBytes },
});

describe('SheetFileCache', () => {
  it('has a sheet with the same file name and size as a remembered file', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf') });
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(true);
    expect(cache.has(sheetOf('a.pdf', 4))).toBe(false);
    expect(cache.has(sheetOf('a.pdf'))).toBe(false);
  });

  it('takes a remembered file without a target', async () => {
    const cache = new SheetFileCache();
    const file = new File(['abc'], 'a.pdf');
    cache.remember({ file });
    const taken = await cache.take(sheetOf('a.pdf', 3));
    expect(taken?.file).toBe(file);
    expect(taken?.target).toBeUndefined();
  });

  it('calls getFile of the target each time and returns the new file when the size matches', async () => {
    const cache = new SheetFileCache();
    const target = { name: 'a.pdf', getFile: vi.fn(async () => new File(['abc'], 'a.pdf')) };
    cache.remember({ file: new File(['abc'], 'a.pdf'), target: target as FileTarget });
    const first = await cache.take(sheetOf('a.pdf', 3));
    const second = await cache.take(sheetOf('a.pdf', 3));
    expect(first?.file.size).toBe(3);
    expect(second?.file.size).toBe(3);
    expect(first?.target).toBe(target);
    expect(target.getFile).toHaveBeenCalledTimes(2);
  });

  it('drops the entry when getFile throws', async () => {
    const cache = new SheetFileCache();
    const target = { name: 'a.pdf', getFile: vi.fn(async () => { throw new Error('gone'); }) };
    cache.remember({ file: new File(['abc'], 'a.pdf'), target: target as FileTarget });
    expect(await cache.take(sheetOf('a.pdf', 3))).toBeUndefined();
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(false);
  });

  it('drops the entry when getFile returns another size', async () => {
    const cache = new SheetFileCache();
    const target = { name: 'a.pdf', getFile: async () => new File(['abcdef'], 'a.pdf') };
    cache.remember({ file: new File(['abc'], 'a.pdf'), target: target as FileTarget });
    expect(await cache.take(sheetOf('a.pdf', 3))).toBeUndefined();
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(false);
  });

  it('clears all entries', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf') });
    cache.clear();
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(false);
  });

  it('never reads the file body', async () => {
    const cache = new SheetFileCache();
    const file = new File(['abc'], 'a.pdf');
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');
    const text = vi.spyOn(file, 'text');
    cache.remember({ file });
    cache.has(sheetOf('a.pdf', 3));
    await cache.take(sheetOf('a.pdf', 3));
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('marks two different files with the same name and size as ambiguous', async () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 1 }) });
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 2 }) });
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(false);
    expect(await cache.take(sheetOf('a.pdf', 3))).toBeUndefined();
  });

  it('reports an ambiguous key for two different files with the same name and size', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 1 }) });
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 2 }) });
    expect(cache.isAmbiguous(sheetOf('a.pdf', 3))).toBe(true);
  });

  it('reports no ambiguous key for a normal file', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf') });
    expect(cache.isAmbiguous(sheetOf('a.pdf', 3))).toBe(false);
  });

  it('reports no ambiguous key for a sheet without a size', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 1 }) });
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 2 }) });
    expect(cache.isAmbiguous(sheetOf('a.pdf'))).toBe(false);
  });

  it('reports no ambiguous key for an unknown file', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 1 }) });
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 2 }) });
    expect(cache.isAmbiguous(sheetOf('b.pdf', 3))).toBe(false);
  });

  it('does not mark the same file remembered twice as ambiguous', () => {
    const cache = new SheetFileCache();
    const file = new File(['abc'], 'a.pdf', { lastModified: 1 });
    cache.remember({ file });
    cache.remember({ file });
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(true);
  });

  it('has no file and takes no file for a sheet without a size', async () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf') });
    expect(cache.has(sheetOf('a.pdf'))).toBe(false);
    expect(await cache.take(sheetOf('a.pdf'))).toBeUndefined();
  });

  it('keeps an entry that remember wrote while getFile was pending', async () => {
    const cache = new SheetFileCache();
    let resolveFile!: (file: File) => void;
    const pending = new Promise<File>((resolve) => {
      resolveFile = resolve;
    });
    const target = { name: 'a.pdf', getFile: vi.fn(() => pending) };
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 5 }), target: target as FileTarget });
    const taken = cache.take(sheetOf('a.pdf', 3));
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 5 }) });
    resolveFile(new File(['abcdef'], 'a.pdf'));
    expect(await taken).toBeUndefined();
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(true);
  });
});
