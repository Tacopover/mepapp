import { describe, expect, it, vi } from 'vitest';
import {
  FOLDER_MAX_DEPTH,
  FOLDER_MAX_ITEMS,
  FOLDER_PICKER_ID,
  asFolderHandle,
  bandView,
  ensureFolderAccess,
  folderDeniedNotice,
  folderErrorKind,
  folderGoneNotice,
  folderResultNotice,
  scanPdfFolder,
  type BandInput,
  type FolderEntry,
} from './pdfFolder.js';
import type { PdfNeed } from './reconnectPdfs.js';

type Spec = { file: string; size: number; time?: number } | { dir: string; items: Spec[] };

function fileEntry(name: string, size: number, time = 1): FolderEntry {
  return { kind: 'file', name, getFile: async () => new File(['x'.repeat(size)], name, { lastModified: time }) };
}

function dirOf(name: string, items: Spec[]): FolderEntry {
  return {
    kind: 'directory',
    name,
    values: async function* () {
      for (const item of items) yield 'dir' in item ? dirOf(item.dir, item.items) : fileEntry(item.file, item.size, item.time);
    },
  };
}

const wanted = (...list: [string, number][]) => list.map(([fileName, sizeBytes]) => ({ fileName, sizeBytes }));
const needOf = (fileName: string, sizeBytes: number): PdfNeed => ({
  fileName,
  sizeBytes,
  sheet: { id: fileName, levelId: 'L1', projectUuid: null, pageIndex: 0, displayName: fileName, location: { fileName, sizeBytes } },
});

describe('constants', () => {
  it('uses depth 3, a cap of 5000 and a picker id of its own', () => {
    expect(FOLDER_MAX_DEPTH).toBe(3);
    expect(FOLDER_MAX_ITEMS).toBe(5000);
    expect(FOLDER_PICKER_ID).toBe('mepapp-building-pdfs');
    expect(FOLDER_PICKER_ID).not.toBe('mepapp-stamp-library');
  });
});

describe('scanPdfFolder', () => {
  it('matches by file name and size and ignores other files', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 3 }, { file: 'b.pdf', size: 5 }, { file: 'c.pdf', size: 4 }, { file: 'a.txt', size: 3 }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3], ['b.pdf', 4], ['c.pdf', 4]));
    expect(result.matches.map((m) => m.key).sort()).toEqual(['a.pdf:3', 'c.pdf:4']);
    expect(result.ambiguousKeys).toEqual([]);
    expect(result.capped).toBe(false);
  });

  it('finds files in subfolders down to level 3 and not deeper', async () => {
    const root = dirOf('Plans', [
      {
        dir: 'l1',
        items: [{ file: 'one.pdf', size: 1 }, { dir: 'l2', items: [{ file: 'two.pdf', size: 2 }, { dir: 'l3', items: [{ file: 'three.pdf', size: 3 }, { dir: 'l4', items: [{ file: 'four.pdf', size: 4 }] }] }] }],
      },
    ]);
    const result = await scanPdfFolder(root, wanted(['one.pdf', 1], ['two.pdf', 2], ['three.pdf', 3], ['four.pdf', 4]));
    expect(result.matches.map((m) => m.key).sort()).toEqual(['one.pdf:1', 'three.pdf:3', 'two.pdf:2']);
  });

  it('keeps the file handle of each match', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 3 }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3]));
    expect(result.matches[0]?.handle.name).toBe('a.pdf');
    expect(result.matches[0]?.file.size).toBe(3);
  });

  it('stops after the item limit and reports capped, shallow items first', async () => {
    const root = dirOf('Plans', [
      { file: 'a.pdf', size: 1 },
      { file: 'x1.txt', size: 1 },
      { file: 'x2.txt', size: 1 },
      { dir: 'deep', items: [{ file: 'b.pdf', size: 1 }] },
    ]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 1], ['b.pdf', 1]), { maxItems: 3 });
    expect(result.capped).toBe(true);
    expect(result.matches.map((m) => m.key)).toEqual(['a.pdf:1']);
    expect(result.scanned).toBe(3);
  });

  it('is not capped when the number of items equals the limit', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 1 }, { file: 'b.pdf', size: 1 }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 1]), { maxItems: 2 });
    expect(result.capped).toBe(false);
    expect(result.matches).toHaveLength(1);
  });

  it('reports a name and size with two different time stamps as ambiguous', async () => {
    const root = dirOf('Plans', [
      { dir: 'one', items: [{ file: 'c.pdf', size: 2, time: 10 }] },
      { dir: 'two', items: [{ file: 'c.pdf', size: 2, time: 20 }] },
    ]);
    const result = await scanPdfFolder(root, wanted(['c.pdf', 2]));
    expect(result.ambiguousKeys).toEqual(['c.pdf:2']);
    expect(result.matches).toHaveLength(2);
  });

  it('counts two copies with the same time stamp once', async () => {
    const root = dirOf('Plans', [
      { dir: 'one', items: [{ file: 'c.pdf', size: 2, time: 10 }] },
      { dir: 'two', items: [{ file: 'c.pdf', size: 2, time: 10 }] },
    ]);
    const result = await scanPdfFolder(root, wanted(['c.pdf', 2]));
    expect(result.ambiguousKeys).toEqual([]);
    expect(result.matches).toHaveLength(1);
  });

  it('skips a file that cannot be read', async () => {
    const broken: FolderEntry = { kind: 'file', name: 'a.pdf', getFile: async () => Promise.reject(new Error('gone')) };
    const root: FolderEntry = { kind: 'directory', name: 'Plans', values: async function* () { yield broken; yield fileEntry('b.pdf', 2); } };
    const result = await scanPdfFolder(root, wanted(['a.pdf', 1], ['b.pdf', 2]));
    expect(result.matches.map((m) => m.key)).toEqual(['b.pdf:2']);
  });

  it('throws an error of the root folder and skips an error inside a subfolder', async () => {
    const failing = (name: string): FolderEntry => ({
      kind: 'directory',
      name,
      values: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' })) }) }),
    });
    await expect(scanPdfFolder(failing('Plans'), wanted(['a.pdf', 1]))).rejects.toMatchObject({ name: 'NotFoundError' });
    const root: FolderEntry = { kind: 'directory', name: 'Plans', values: async function* () { yield failing('bad'); yield fileEntry('a.pdf', 1); } };
    const result = await scanPdfFolder(root, wanted(['a.pdf', 1]));
    expect(result.matches.map((m) => m.key)).toEqual(['a.pdf:1']);
  });
});

describe('scanPdfFolder changed files', () => {
  it('collects a file with the name of a wanted PDF and another size', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 5 }, { file: 'b.pdf', size: 4 }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3], ['b.pdf', 4]));
    expect(result.changed.map((m) => m.key)).toEqual(['a.pdf:5']);
    expect(result.changed[0]?.handle.name).toBe('a.pdf');
    expect(result.changedAmbiguousNames).toEqual([]);
    expect(result.matches.map((m) => m.key)).toEqual(['b.pdf:4']);
  });

  it('lets an exact match win over a changed file of the same name', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 5 }, { dir: 'old', items: [{ file: 'a.pdf', size: 3 }] }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3]));
    expect(result.changed).toEqual([]);
    expect(result.changedAmbiguousNames).toEqual([]);
    expect(result.matches.map((m) => m.key)).toEqual(['a.pdf:3']);
  });

  it('names a PDF with two different changed files and does not list it', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 5 }, { file: 'a.pdf', size: 6 }, { file: 'b.pdf', size: 7, time: 1 }, { file: 'b.pdf', size: 7, time: 2 }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3], ['b.pdf', 4]));
    expect(result.changed).toEqual([]);
    expect(result.changedAmbiguousNames.sort()).toEqual(['a.pdf', 'b.pdf']);
  });

  it('counts two copies of a changed file with the same size and time stamp once', async () => {
    const root = dirOf('Plans', [{ file: 'a.pdf', size: 5, time: 4 }, { dir: 'copy', items: [{ file: 'a.pdf', size: 5, time: 4 }] }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3]));
    expect(result.changed).toHaveLength(1);
    expect(result.changedAmbiguousNames).toEqual([]);
  });

  it('finds a changed file in a subfolder', async () => {
    const root = dirOf('Plans', [{ dir: 'sub', items: [{ file: 'a.pdf', size: 5 }] }]);
    const result = await scanPdfFolder(root, wanted(['a.pdf', 3]));
    expect(result.changed.map((m) => m.key)).toEqual(['a.pdf:5']);
  });
});

describe('asFolderHandle and folderErrorKind', () => {
  it('accepts a value with values() only', () => {
    expect(asFolderHandle({ values: () => [] })).toBeDefined();
    expect(asFolderHandle({ getFile: () => 1 })).toBeUndefined();
    expect(asFolderHandle(null)).toBeUndefined();
    expect(asFolderHandle('x')).toBeUndefined();
  });

  it('maps error names', () => {
    expect(folderErrorKind({ name: 'NotAllowedError' })).toBe('denied');
    expect(folderErrorKind({ name: 'SecurityError' })).toBe('denied');
    expect(folderErrorKind({ name: 'NotFoundError' })).toBe('gone');
    expect(folderErrorKind(new Error('x'))).toBe('failed');
    expect(folderErrorKind(null)).toBe('failed');
  });
});

describe('ensureFolderAccess', () => {
  it('does not ask when the folder is granted', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    const folder: FolderEntry = { kind: 'directory', name: 'P', queryPermission: async () => 'granted', requestPermission };
    expect(await ensureFolderAccess(folder)).toBe('granted');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks once with mode read when the answer of the query is prompt', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    const folder: FolderEntry = { kind: 'directory', name: 'P', queryPermission: async () => 'prompt', requestPermission };
    expect(await ensureFolderAccess(folder)).toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('gives denied on a denial and on a thrown error', async () => {
    expect(await ensureFolderAccess({ kind: 'directory', name: 'P', queryPermission: async () => 'prompt', requestPermission: async () => 'denied' })).toBe('denied');
    expect(
      await ensureFolderAccess({ kind: 'directory', name: 'P', queryPermission: async () => { throw new Error('x'); } }),
    ).toBe('denied');
    expect(await ensureFolderAccess({ kind: 'directory', name: 'P', queryPermission: async () => 'prompt' })).toBe('denied');
  });

  it('counts a handle without permission methods as granted', async () => {
    expect(await ensureFolderAccess({ kind: 'directory', name: 'P' })).toBe('granted');
  });
});

const base: BandInput = {
  canStore: true,
  checked: true,
  busy: false,
  folderName: null,
  folderAccess: 'prompt',
  savedNeedAllow: 0,
  needFile: 0,
  changedPdfs: 0,
};
const CHANGED_2 = '2 PDFs changed after they were added. Click Reconnect PDFs… and choose the new files.';
const FILES_MENU = { action: 'files', label: 'Choose files…', help: 'Pick the PDF files yourself. Press Ctrl+A in the picker to pick all.', testId: 'pdf-files-pick' };
const NO_FOLDER_MENU = [
  {
    action: 'pick',
    label: 'Choose a folder…',
    help: 'The app finds the PDFs of this building in the folder and the folders inside it.',
    testId: 'pdf-folder-pick',
  },
  FILES_MENU,
];
const PICK_ANOTHER = { action: 'pick', label: 'Choose another folder…', help: 'The app uses it instead of Plans.', testId: 'pdf-folder-pick' };

describe('bandView', () => {
  it('Firefox and Safari: the T01 hint, no menu', () => {
    expect(bandView({ ...base, canStore: false, needFile: 0 })).toBeNull();
    const view = bandView({ ...base, canStore: false, needFile: 2 });
    expect(view).toEqual({
      hint: '2 PDFs need a file before they open. Choose them all in one step.',
      menu: null,
      reconnectDisabled: false,
      hasMenu: false,
    });
    expect(bandView({ ...base, canStore: false, needFile: 1 })?.hint).toBe('1 PDF needs a file before it opens. Choose it again.');
  });

  it('Firefox and Safari: the changed hint when no PDF needs a file', () => {
    expect(bandView({ ...base, canStore: false, changedPdfs: 1 })).toBeNull();
    expect(bandView({ ...base, canStore: false, changedPdfs: 2 })).toEqual({
      hint: CHANGED_2,
      menu: null,
      reconnectDisabled: false,
      hasMenu: false,
    });
    expect(bandView({ ...base, canStore: false, changedPdfs: 2, needFile: 1 })?.hint).toBe(
      '1 PDF needs a file before it opens. Choose it again.',
    );
  });

  it('shows nothing until the access check ends', () => {
    expect(bandView({ ...base, checked: false, savedNeedAllow: 3 })).toBeNull();
  });

  it('shows nothing when nothing is to do', () => {
    expect(bandView(base)).toBeNull();
    expect(bandView({ ...base, folderName: 'Plans', folderAccess: 'granted' })).toBeNull();
    expect(bandView({ ...base, changedPdfs: 1 })).toBeNull();
  });

  it('no folder, nothing saved: choose the folder or the files', () => {
    const one = bandView({ ...base, needFile: 1 });
    expect(one?.hint).toBe('1 PDF needs a file before it opens. Click Reconnect PDFs… to choose the folder or the file.');
    expect(one?.menu).toEqual(NO_FOLDER_MENU);
    expect(one?.hasMenu).toBe(true);
    expect(one?.reconnectDisabled).toBe(false);
    expect(bandView({ ...base, needFile: 4 })?.hint).toBe(
      '4 PDFs need a file before they open. Click Reconnect PDFs… to choose the folder or the files.',
    );
  });

  it('no folder, saved PDFs', () => {
    expect(bandView({ ...base, savedNeedAllow: 1 })?.hint).toBe('1 PDF is saved in this browser. Click Reconnect PDFs… to open it.');
    expect(bandView({ ...base, savedNeedAllow: 9 })?.hint).toBe('9 PDFs are saved in this browser. Click Reconnect PDFs… to open them all.');
    expect(bandView({ ...base, savedNeedAllow: 9, needFile: 1 })?.hint).toBe(
      '9 PDFs are saved in this browser. Click Reconnect PDFs… to open them all. 1 PDF needs a file before it opens.',
    );
    expect(bandView({ ...base, savedNeedAllow: 2, needFile: 3 })?.hint).toBe(
      '2 PDFs are saved in this browser. Click Reconnect PDFs… to open them all. 3 PDFs need a file before they open.',
    );
    expect(bandView({ ...base, savedNeedAllow: 1 })?.menu).toEqual(NO_FOLDER_MENU);
  });

  it('folder stored, access prompt, saved PDFs: menu starts with Use the folder', () => {
    const view = bandView({ ...base, folderName: 'Plans', savedNeedAllow: 9 });
    expect(view?.hint).toBe('9 PDFs are saved in this browser. Click Reconnect PDFs… and use the folder Plans to open them.');
    expect(view?.menu).toEqual([
      { action: 'use', label: 'Use the folder Plans', help: 'The browser asks you once to allow access.', testId: 'pdf-folder-use' },
      PICK_ANOTHER,
      FILES_MENU,
    ]);
    expect(bandView({ ...base, folderName: 'Plans', savedNeedAllow: 1 })?.hint).toBe(
      '1 PDF is saved in this browser. Click Reconnect PDFs… and use the folder Plans to open it.',
    );
    expect(bandView({ ...base, folderName: 'Plans', savedNeedAllow: 1, needFile: 2 })?.hint).toBe(
      '1 PDF is saved in this browser. Click Reconnect PDFs… and use the folder Plans to open it. 2 PDFs need a file before they open.',
    );
  });

  it('folder stored, access prompt, nothing saved: Use the folder, hint of the missing PDFs', () => {
    const view = bandView({ ...base, folderName: 'Plans', needFile: 1 });
    expect(view?.hint).toBe('1 PDF is not in the folder Plans. Click Reconnect PDFs… to choose the file or another folder.');
    expect(view?.menu?.[0]?.label).toBe('Use the folder Plans');
  });

  it('folder granted, some PDFs not in it: menu starts with Look in again', () => {
    const one = bandView({ ...base, folderName: 'Plans', folderAccess: 'granted', needFile: 1 });
    expect(one?.hint).toBe('1 PDF is not in the folder Plans. Click Reconnect PDFs… to choose the file or another folder.');
    expect(one?.menu).toEqual([
      { action: 'use', label: 'Look in Plans again', help: 'The app searches the folder and the folders inside it again.', testId: 'pdf-folder-use' },
      PICK_ANOTHER,
      FILES_MENU,
    ]);
    expect(bandView({ ...base, folderName: 'Plans', folderAccess: 'granted', needFile: 2 })?.hint).toBe(
      '2 PDFs are not in the folder Plans. Click Reconnect PDFs… to choose the files or another folder.',
    );
  });

  it('busy: no menu, the button is off', () => {
    const view = bandView({ ...base, busy: true, folderName: 'Plans', savedNeedAllow: 9 });
    expect(view).toEqual({ hint: 'Looking for PDFs in Plans…', menu: null, reconnectDisabled: true, hasMenu: false });
    expect(bandView({ ...base, busy: true, needFile: 1 })?.hint).toBe('Looking for PDFs in the folder…');
  });

  it('the changed hint shows with the menu of the folder state when nothing else is to do', () => {
    const none = bandView({ ...base, changedPdfs: 2 });
    expect(none?.hint).toBe(CHANGED_2);
    expect(none?.menu).toEqual(NO_FOLDER_MENU);
    const granted = bandView({ ...base, folderName: 'Plans', folderAccess: 'granted', changedPdfs: 5 });
    expect(granted?.hint).toBe('5 PDFs changed after they were added. Click Reconnect PDFs… and choose the new files.');
    expect(granted?.menu?.[0]?.label).toBe('Look in Plans again');
  });

  it('a need hint wins over the changed hint', () => {
    expect(bandView({ ...base, needFile: 1, changedPdfs: 3 })?.hint).toBe(
      '1 PDF needs a file before it opens. Click Reconnect PDFs… to choose the folder or the file.',
    );
  });
});

describe('folderResultNotice', () => {
  const needed = [needOf('a.pdf', 1), needOf('b.pdf', 2), needOf('c.pdf', 3), needOf('d.pdf', 4)];
  const keys = (...list: string[]) => new Set(list);

  it('all found', () => {
    expect(folderResultNotice({ folderName: 'Plans', needed, foundKeys: keys('a.pdf:1', 'b.pdf:2', 'c.pdf:3', 'd.pdf:4'), ambiguousKeys: keys(), capped: false })).toEqual({
      text: 'Found all 4 PDFs in Plans.',
      error: false,
    });
    expect(folderResultNotice({ folderName: 'Plans', needed: [needOf('a.pdf', 1)], foundKeys: keys('a.pdf:1'), ambiguousKeys: keys(), capped: false })?.text).toBe(
      'Found the PDF in Plans.',
    );
  });

  it('partial: names the missing PDFs, with and more after 3', () => {
    expect(folderResultNotice({ folderName: 'Plans', needed, foundKeys: keys('a.pdf:1', 'b.pdf:2', 'c.pdf:3'), ambiguousKeys: keys(), capped: false })).toEqual({
      text: 'Found 3 of 4 PDFs in Plans. Missing: d.pdf.',
      error: false,
    });
    const nine = Array.from({ length: 9 }, (_, i) => needOf(`${String.fromCharCode(97 + i)}.pdf`, i + 1));
    const found = new Set(['a.pdf:1', 'b.pdf:2', 'c.pdf:3', 'd.pdf:4']);
    expect(folderResultNotice({ folderName: 'Plans', needed: nine, foundKeys: found, ambiguousKeys: keys(), capped: false })?.text).toBe(
      'Found 4 of 9 PDFs in Plans. Missing: e.pdf, f.pdf, g.pdf and 2 more.',
    );
  });

  it('zero found is an error and tells the search depth', () => {
    const nine = Array.from({ length: 9 }, (_, i) => needOf(`${String.fromCharCode(97 + i)}.pdf`, i + 1));
    expect(folderResultNotice({ folderName: 'Plans', needed: nine, foundKeys: keys(), ambiguousKeys: keys(), capped: false })).toEqual({
      text: 'Found 0 of 9 PDFs in Plans. The app looked in the folder and in the folders inside it, 3 levels deep. Missing: a.pdf, b.pdf, c.pdf and 6 more.',
      error: true,
    });
    expect(folderResultNotice({ folderName: 'Plans', needed: [needOf('a.pdf', 1)], foundKeys: keys(), ambiguousKeys: keys(), capped: false })?.text).toBe(
      'Found 0 of 1 PDF in Plans. The app looked in the folder and in the folders inside it, 3 levels deep. Missing: a.pdf.',
    );
  });

  it('two files with one name and size', () => {
    const result = folderResultNotice({ folderName: 'Plans', needed: [needOf('a.pdf', 1), needOf('c.pdf', 3)], foundKeys: keys('a.pdf:1', 'c.pdf:3'), ambiguousKeys: keys('c.pdf:3'), capped: false });
    expect(result?.text).toBe(
      'Found 1 of 2 PDFs in Plans. Missing: c.pdf. For c.pdf the folder has two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.',
    );
    expect(result?.error).toBe(false);
  });

  it('too many items is an error when a PDF is missing, and silent when all are found', () => {
    const partial = folderResultNotice({ folderName: 'Plans', needed, foundKeys: keys('a.pdf:1', 'b.pdf:2', 'c.pdf:3'), ambiguousKeys: keys(), capped: true });
    expect(partial?.text).toBe('Found 3 of 4 PDFs in Plans. Missing: d.pdf. The app stopped looking after 5000 items in Plans. Choose a folder that holds fewer files.');
    expect(partial?.error).toBe(true);
    const all = folderResultNotice({ folderName: 'Plans', needed, foundKeys: keys('a.pdf:1', 'b.pdf:2', 'c.pdf:3', 'd.pdf:4'), ambiguousKeys: keys(), capped: true });
    expect(all).toEqual({ text: 'Found all 4 PDFs in Plans.', error: false });
  });

  it('is null when nothing was looked for', () => {
    expect(folderResultNotice({ folderName: 'Plans', needed: [], foundKeys: keys(), ambiguousKeys: keys(), capped: false })).toBeNull();
  });

  it('counts a changed PDF as found in mode found', () => {
    const result = folderResultNotice({
      folderName: 'Plans',
      needed: [needOf('a.pdf', 1), needOf('b.pdf', 2)],
      foundKeys: keys('a.pdf:1'),
      ambiguousKeys: keys(),
      capped: false,
      changedNames: new Set(['b.pdf']),
      changedMode: 'found',
    });
    expect(result).toEqual({ text: 'Found all 2 PDFs in Plans.', error: false });
  });

  it('leaves a changed PDF out of the counts in mode excluded', () => {
    const base = { folderName: 'Plans', foundKeys: keys('a.pdf:1'), ambiguousKeys: keys(), capped: false, changedNames: new Set(['b.pdf']), changedMode: 'excluded' as const };
    expect(folderResultNotice({ ...base, needed: [needOf('a.pdf', 1), needOf('b.pdf', 2)] })?.text).toBe('Found 1 of 2 PDFs in Plans.');
    expect(folderResultNotice({ ...base, needed: [needOf('b.pdf', 2)] })).toBeNull();
  });

  it('uses the form Found X of N and no Missing list for changed PDFs when 3 of 9 are changed', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((letter) => `${letter}.pdf`);
    const result = folderResultNotice({
      folderName: 'Plans',
      needed: names.map((name) => needOf(name, 1)),
      foundKeys: keys(...names.slice(0, 6).map((name) => `${name}:1`)),
      ambiguousKeys: keys(),
      capped: false,
      changedNames: new Set(names.slice(6)),
      changedMode: 'excluded',
    });
    expect(result?.text).toBe('Found 6 of 9 PDFs in Plans.');
  });

  it('adds the text of two changed files after the two-files part', () => {
    const result = folderResultNotice({
      folderName: 'Plans',
      needed: [needOf('a.pdf', 1), needOf('c.pdf', 3)],
      foundKeys: keys('a.pdf:1', 'c.pdf:3'),
      ambiguousKeys: keys('c.pdf:3'),
      capped: false,
      changedAmbiguousNames: ['b.pdf'],
    });
    expect(result?.text).toBe(
      'Found 1 of 2 PDFs in Plans. Missing: c.pdf. For c.pdf the folder has two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row. For b.pdf the folder has two different files with another size. The app cannot tell which one to use. Use Choose file… on its row.',
    );
  });
});

describe('fixed notices', () => {
  it('has the texts of the spec', () => {
    expect(folderDeniedNotice()).toEqual({
      text: 'Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser.',
      error: true,
    });
    expect(folderGoneNotice('Plans')).toEqual({
      text: 'The folder Plans is not there any more. Click Reconnect PDFs… and choose the folder again.',
      error: true,
    });
  });
});
