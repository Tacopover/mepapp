import { describe, expect, it } from 'vitest';
import { scanDirectoryHandle } from './web-file-access.js';

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
