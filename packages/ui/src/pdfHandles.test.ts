import { describe, expect, it, vi } from 'vitest';
import type { BuildingSheet } from '@mepapp/core';
import type { FileTarget } from '@mepapp/platform';
import {
  asFileHandle,
  openStoredHandle,
  pickerBlockedNotice,
  removedKeys,
  shouldDeleteHandle,
  sheetHasFile,
  sheetKeySet,
  storableHandle,
  storedOpenNotice,
  pickedOtherFileNotice,
  type StoredOpenOutcome,
} from './pdfHandles.js';
import { SheetFileCache } from './sheetFileCache.js';

const sheetOf = (fileName: string, sizeBytes?: number, pageIndex = 0): BuildingSheet =>
  ({
    id: `s-${fileName}-${pageIndex}`,
    levelId: 'L1',
    projectUuid: null,
    pageIndex,
    displayName: fileName,
    location: { fileName, sizeBytes },
  }) as BuildingSheet;

const fileOf = (size: number, name = 'a.pdf') => new File(['x'.repeat(size)], name);

describe('openStoredHandle', () => {
  it('opens at once when the permission is granted and does not request it', async () => {
    const file = fileOf(3);
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => file),
      queryPermission: vi.fn(async () => 'granted'),
      requestPermission: vi.fn(async () => 'granted'),
    };
    const outcome = await openStoredHandle(handle, 3);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('opened');
    if (outcome.kind !== 'opened') return;
    expect(outcome.opened.target).toBe(handle);
    expect(outcome.opened.file.size).toBe(3);
  });

  it('requests the permission before getFile when the query answer is prompt', async () => {
    const file = fileOf(3);
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => file),
      queryPermission: vi.fn(async () => 'prompt'),
      requestPermission: vi.fn(async () => 'granted'),
    };
    const outcome = await openStoredHandle(handle, 3);
    expect(handle.requestPermission).toHaveBeenCalledTimes(1);
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(handle.requestPermission.mock.invocationCallOrder[0]).toBeLessThan(
      handle.getFile.mock.invocationCallOrder[0],
    );
    expect(outcome.kind).toBe('opened');
  });

  it('gives denied and keeps the handle when the request is denied', async () => {
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => fileOf(3)),
      queryPermission: vi.fn(async () => 'prompt'),
      requestPermission: vi.fn(async () => 'denied'),
    };
    const outcome = await openStoredHandle(handle, 3);
    expect(outcome.kind).toBe('denied');
    expect(handle.getFile).not.toHaveBeenCalled();
    expect(shouldDeleteHandle(outcome)).toBe(false);
  });

  it('gives denied when the query and the request are both denied', async () => {
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => fileOf(3)),
      queryPermission: vi.fn(async () => 'denied'),
      requestPermission: vi.fn(async () => 'denied'),
    };
    expect((await openStoredHandle(handle, 3)).kind).toBe('denied');
  });

  it('gives denied when requestPermission throws', async () => {
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => fileOf(3)),
      queryPermission: vi.fn(async () => 'prompt'),
      requestPermission: vi.fn(async () => {
        throw new DOMException('no gesture', 'NotAllowedError');
      }),
    };
    expect((await openStoredHandle(handle, 3)).kind).toBe('denied');
    expect(handle.getFile).not.toHaveBeenCalled();
  });

  it('counts a handle without queryPermission and requestPermission as granted', async () => {
    const file = fileOf(3);
    const handle = { name: 'a.pdf', getFile: vi.fn(async () => file) };
    const outcome = await openStoredHandle(handle, 3);
    expect(outcome.kind).toBe('opened');
    if (outcome.kind !== 'opened') return;
    expect(outcome.opened.file).toBe(file);
  });

  it('gives gone for a NotFoundError from getFile and deletes the handle', async () => {
    const handle = {
      name: 'a.pdf',
      getFile: vi.fn(async () => {
        throw new DOMException('missing', 'NotFoundError');
      }),
    };
    const outcome = await openStoredHandle(handle, 3);
    expect(outcome.kind).toBe('gone');
    expect(shouldDeleteHandle(outcome)).toBe(true);
  });

  it('gives denied for a NotAllowedError from getFile and failed for a plain Error', async () => {
    const denied = {
      name: 'a.pdf',
      getFile: vi.fn(async () => {
        throw new DOMException('no', 'NotAllowedError');
      }),
    };
    expect((await openStoredHandle(denied, 3)).kind).toBe('denied');
    const failing = {
      name: 'a.pdf',
      getFile: vi.fn(async () => {
        throw new Error('read error');
      }),
    };
    const outcome = await openStoredHandle(failing, 3);
    expect(outcome.kind).toBe('failed');
    expect(shouldDeleteHandle(outcome)).toBe(false);
  });

  it('gives changed and deletes the handle when the size differs', async () => {
    const handle = { name: 'a.pdf', getFile: vi.fn(async () => fileOf(6)) };
    const outcome = await openStoredHandle(handle, 3);
    expect(outcome.kind).toBe('changed');
    expect(shouldDeleteHandle(outcome)).toBe(true);
  });

  it('opens when the size is equal', async () => {
    const handle = { name: 'a.pdf', getFile: vi.fn(async () => fileOf(3)) };
    const outcome = await openStoredHandle(handle, 3);
    expect(outcome.kind).toBe('opened');
    expect(shouldDeleteHandle(outcome)).toBe(false);
  });

  it('gives gone for a value that is not a file handle', async () => {
    expect((await openStoredHandle({}, 3)).kind).toBe('gone');
    expect((await openStoredHandle(null, 3)).kind).toBe('gone');
    expect((await openStoredHandle('a.pdf', 3)).kind).toBe('gone');
  });
});

describe('handle helpers', () => {
  it('asFileHandle returns undefined for a value that is not a file handle', () => {
    expect(asFileHandle({})).toBeUndefined();
    expect(asFileHandle(null)).toBeUndefined();
    expect(asFileHandle('a.pdf')).toBeUndefined();
  });

  it('storableHandle returns only a target with getFile', () => {
    const handle = { name: 'a.pdf', getFile: async () => fileOf(3) } as FileTarget;
    expect(storableHandle(undefined)).toBeUndefined();
    expect(storableHandle({ name: 'a.pdf' })).toBeUndefined();
    expect(storableHandle(handle)).toBe(handle);
  });
});

describe('notices', () => {
  it('gives the notice for a picked file of another size', () => {
    expect(pickedOtherFileNotice()).toEqual({
      text: 'This file is not the one the sheet knows (the size is different). Use Relink on the sheet to update it.',
      error: false,
    });
  });

  it('gives the exact text of each failed outcome', () => {
    const opened: StoredOpenOutcome = { kind: 'opened', opened: { file: fileOf(3) } };
    expect(storedOpenNotice(opened, 'a.pdf')).toBeNull();
    expect(storedOpenNotice({ kind: 'denied' }, 'a.pdf')).toEqual({
      text: 'Could not open a.pdf. Access was not allowed. Choose the file again.',
      error: true,
    });
    expect(storedOpenNotice({ kind: 'gone' }, 'a.pdf')).toEqual({
      text: 'Could not open a.pdf. Choose the file again.',
      error: false,
    });
    expect(storedOpenNotice({ kind: 'failed' }, 'a.pdf')).toEqual({
      text: 'Could not open a.pdf. Choose the file again.',
      error: false,
    });
    expect(storedOpenNotice({ kind: 'changed' }, 'a.pdf')).toEqual({
      text: 'a.pdf is not the same file any more. Choose the file again.',
      error: false,
    });
  });

  it('gives the denied text for the picker notice after a denied outcome', () => {
    expect(pickerBlockedNotice({ kind: 'denied' }, 'a.pdf')).toEqual(
      storedOpenNotice({ kind: 'denied' }, 'a.pdf'),
    );
    expect(pickerBlockedNotice({ kind: 'gone' }, 'a.pdf')).toEqual({
      text: 'Could not open a.pdf. Choose the file again.',
      error: true,
    });
    expect(pickerBlockedNotice({ kind: 'changed' }, 'a.pdf')).toEqual({
      text: 'Could not open a.pdf. Choose the file again.',
      error: true,
    });
  });
});

describe('sheet keys and file presence', () => {
  it('reports a sheet as having a file from the cache or from the stored keys', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: fileOf(3) });
    expect(sheetHasFile(cache, new Set(), sheetOf('a.pdf', 3))).toBe(true);
    expect(sheetHasFile(new SheetFileCache(), new Set(['b.pdf:4']), sheetOf('b.pdf', 4))).toBe(true);
  });

  it('reports no file for an ambiguous key that is only in the stored keys', () => {
    const cache = new SheetFileCache();
    cache.remember({ file: new File(['abc'], 'a.pdf', { lastModified: 1 }) });
    cache.remember({ file: new File(['xyz'], 'a.pdf', { lastModified: 2 }) });
    expect(cache.has(sheetOf('a.pdf', 3))).toBe(false);
    expect(cache.isAmbiguous(sheetOf('a.pdf', 3))).toBe(true);
    expect(sheetHasFile(cache, new Set(['a.pdf:3']), sheetOf('a.pdf', 3))).toBe(false);
  });

  it('reports no file for a sheet without a size or an unknown file', () => {
    expect(sheetHasFile(new SheetFileCache(), new Set(['a.pdf:3']), sheetOf('a.pdf'))).toBe(false);
    expect(sheetHasFile(new SheetFileCache(), new Set(['a.pdf:3']), sheetOf('c.pdf', 9))).toBe(false);
  });

  it('gives one key for a PDF with two pages', () => {
    const keys = sheetKeySet([sheetOf('a.pdf', 3, 0), sheetOf('a.pdf', 3, 1)]);
    expect(Array.from(keys)).toEqual(['a.pdf:3']);
  });

  it('gives only the keys that disappear', () => {
    const previous = sheetKeySet([sheetOf('a.pdf', 3, 0), sheetOf('a.pdf', 3, 1), sheetOf('b.pdf', 4)]);
    const next = sheetKeySet([sheetOf('a.pdf', 3, 1)]);
    expect(removedKeys(previous, next)).toEqual(['b.pdf:4']);
  });
});
