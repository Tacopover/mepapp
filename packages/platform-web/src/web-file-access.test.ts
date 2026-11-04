import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanDirectoryHandle, WebFileAccess } from './web-file-access.js';

const pdfTypes = [{ description: 'PDF', mimeType: 'application/pdf', extensions: ['pdf'] }];

function fakeHandle(name: string) {
  return { name, getFile: async () => new File(['x'], name) };
}

describe('WebFileAccess.openFiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes multiple: true to the picker and returns one entry per handle in order', async () => {
    const picker = vi.fn(async () => [fakeHandle('a.pdf'), fakeHandle('b.pdf')]);
    vi.stubGlobal('window', { showOpenFilePicker: picker });
    const opened = await new WebFileAccess().openFiles(pdfTypes);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
    expect(opened.map((o) => o.file.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(opened.map((o) => o.target?.name)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('returns an empty array when the user cancels the picker', async () => {
    vi.stubGlobal('window', {
      showOpenFilePicker: async () => {
        throw new DOMException('x', 'AbortError');
      },
    });
    expect(await new WebFileAccess().openFiles(pdfTypes)).toEqual([]);
  });

  it('keeps openFile single-select and returns the first handle', async () => {
    const picker = vi.fn(async () => [fakeHandle('a.pdf'), fakeHandle('b.pdf')]);
    vi.stubGlobal('window', { showOpenFilePicker: picker });
    const opened = await new WebFileAccess().openFile(pdfTypes);
    expect(picker.mock.calls[0][0]).toEqual({ types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
    expect(opened?.file.name).toBe('a.pdf');
  });
});

describe('scanDirectoryHandle', () => {
  it('keeps top-level files with a listed extension sorted by name and skips folders and other extensions', async () => {
    const file = (name: string) => ({ kind: 'file', name, getFile: async () => new File(['x'], name) });
    const entries = [
      { kind: 'directory', name: 'sub.svg' },
      file('notes.txt'),
      file('b.PNG'),
      file('a.svg'),
      file('README'),
    ];
    const dir = {
      async *values() {
        yield* entries;
      },
    } as unknown as FileSystemDirectoryHandle;
    const files = await scanDirectoryHandle(dir, ['svg', 'png']);
    expect(files.map((f) => f.name)).toEqual(['a.svg', 'b.PNG']);
  });
});
