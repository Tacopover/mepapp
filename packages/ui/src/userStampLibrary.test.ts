// @ts-ignore -- ui has no @types/node; vitest runs this file in Node
import { readFileSync as nodeReadFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryLibraryStore } from '@mepapp/platform';
import type { LibrarySourceRecord } from '@mepapp/platform';
import { parseSvgIntrinsicSize, SVG_UNIT_TO_PT } from '@mepapp/core';
import {
  libraryMimeTypeFor,
  materializeUserStamp,
  scanLibraryFolder,
  syncLibrarySource,
  type ImageSizeDecoder,
} from './userStampLibrary.js';

const readFileSync = nodeReadFileSync as (path: URL) => Uint8Array<ArrayBuffer>;

// Real files only (CLAUDE.md fixtures policy). fixtures/stamps has no PNGs, so the PNGs are the
// real Tauri app icons that are checked in under apps/desktop.
const SVG_DIR = new URL('../../../fixtures/stamps/Terminals-english/', import.meta.url);
const PNG_DIR = new URL('../../../apps/desktop/src-tauri/icons/', import.meta.url);

function realFile(dir: URL, name: string, lastModified: number, type = ''): File {
  return new File([readFileSync(new URL(name, dir))], name, { lastModified, type });
}

const SVG_A = 'D2_Bath.svg';
const SVG_B = 'D2_Floor_drain.svg';
const PNG_A = '128x128.png';
const PNG_B = '32x32.png';

function makeFiles(modified = 1000): File[] {
  return [
    realFile(SVG_DIR, SVG_A, modified, 'image/svg+xml'),
    realFile(SVG_DIR, SVG_B, modified, 'image/svg+xml'),
    realFile(PNG_DIR, PNG_A, modified, 'image/png'),
    realFile(PNG_DIR, PNG_B, modified, 'image/png'),
  ];
}

// Reads width/height from the PNG IHDR chunk (bytes 16-23, big-endian) of the real file.
const pngHeaderDecoder: ImageSizeDecoder = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

async function setup() {
  const store = new MemoryLibraryStore();
  const { revision } = await store.putSource({ id: 'src1', name: 'Mine', category: 'terminal', discipline: 'plumbing' });
  const source: LibrarySourceRecord = { id: 'src1', name: 'Mine', category: 'terminal', discipline: 'plumbing', revision };
  return { store, source };
}

describe('libraryMimeTypeFor', () => {
  it('maps supported extensions case-insensitively', () => {
    expect(libraryMimeTypeFor('a.svg')).toBe('image/svg+xml');
    expect(libraryMimeTypeFor('a.SVG')).toBe('image/svg+xml');
    expect(libraryMimeTypeFor('a.png')).toBe('image/png');
    expect(libraryMimeTypeFor('a.Jpg')).toBe('image/jpeg');
    expect(libraryMimeTypeFor('a.JPEG')).toBe('image/jpeg');
  });
  it('rejects other names', () => {
    expect(libraryMimeTypeFor('a.gif')).toBeUndefined();
    expect(libraryMimeTypeFor('a.mepshapes.json')).toBeUndefined();
    expect(libraryMimeTypeFor('svg')).toBeUndefined();
  });
});

describe('syncLibrarySource', () => {
  it('adds every file with user-<sourceId>- ids and native sizes', async () => {
    const { store, source } = await setup();
    const files = makeFiles();
    const summary = await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files });
    expect(summary).toEqual({ added: 4, updated: 0, unchanged: 0, missing: 0 });
    const records = await store.listStamps('src1');
    expect(records).toHaveLength(4);
    for (const record of records) {
      expect(record.id.startsWith('user-src1-')).toBe(true);
      expect(record.missingFromFolder).toBe(false);
      expect(await store.getStampBlob(record.id)).toBeDefined();
    }
    const bath = records.find((r) => r.fileName === SVG_A)!;
    const intrinsic = parseSvgIntrinsicSize(await files[0]!.text())!;
    expect(bath.mimeType).toBe('image/svg+xml');
    expect(bath.nativeWidth).toBeCloseTo(intrinsic.width * SVG_UNIT_TO_PT, 1);
    expect(bath.nativeHeight).toBeCloseTo(intrinsic.height * SVG_UNIT_TO_PT, 1);
    for (const name of [PNG_A, PNG_B]) {
      const png = records.find((r) => r.fileName === name)!;
      expect(png.mimeType).toBe('image/png');
      expect(Math.max(png.nativeWidth, png.nativeHeight)).toBe(40);
    }
    const [updatedSource] = await store.listSources();
    expect(updatedSource!.lastSyncedAt).toBeTypeOf('number');
  });

  it('reports everything unchanged on a second sync', async () => {
    const { store, source } = await setup();
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles() });
    const [fresh] = await store.listSources();
    const summary = await syncLibrarySource(store, fresh!, { decode: pngHeaderDecoder, files: makeFiles() });
    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 4, missing: 0 });
  });

  it('updates a changed file and keeps edits', async () => {
    const { store, source } = await setup();
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles(1000) });
    const bath = (await store.listStamps('src1')).find((r) => r.fileName === SVG_A)!;
    const ports = [{ id: 'p1', x: 0.5, y: 0 }] as never;
    await store.putStamp({ ...bath, edits: { label: 'Bathtub', ports } });
    const [fresh] = await store.listSources();
    const summary = await syncLibrarySource(store, fresh!, { decode: pngHeaderDecoder, files: makeFiles(2000) });
    expect(summary).toEqual({ added: 0, updated: 4, unchanged: 0, missing: 0 });
    const after = (await store.listStamps('src1')).find((r) => r.fileName === SVG_A)!;
    expect(after.fileModified).toBe(2000);
    expect(after.edits.label).toBe('Bathtub');
    expect(after.edits.ports).toEqual(ports);
  });

  it('flags a removed file as missing without deleting it, and clears the flag when it returns', async () => {
    const { store, source } = await setup();
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles() });
    const [fresh] = await store.listSources();
    const without = makeFiles().filter((f) => f.name !== SVG_B);
    const summary = await syncLibrarySource(store, fresh!, { decode: pngHeaderDecoder, files: without });
    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 3, missing: 1 });
    const flagged = (await store.listStamps('src1')).find((r) => r.fileName === SVG_B)!;
    expect(flagged.missingFromFolder).toBe(true);
    expect(await store.getStampBlob(flagged.id)).toBeDefined();

    const [fresh2] = await store.listSources();
    const back = await syncLibrarySource(store, fresh2!, { decode: pngHeaderDecoder, files: makeFiles() });
    expect(back).toEqual({ added: 0, updated: 1, unchanged: 3, missing: 0 });
    const restored = (await store.listStamps('src1')).find((r) => r.fileName === SVG_B)!;
    expect(restored.missingFromFolder).toBe(false);
  });

  it('throws without a folder handle and without files', async () => {
    const { store, source } = await setup();
    await expect(syncLibrarySource(store, source, { decode: pngHeaderDecoder })).rejects.toThrow(/no folder handle/);
  });
});

describe('materializeUserStamp', () => {
  it('builds a definition with data: URLs', async () => {
    const { store, source } = await setup();
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles() });
    const records = await store.listStamps('src1');
    const svg = await materializeUserStamp(store, records.find((r) => r.fileName === SVG_A)!.id);
    expect(svg!.source).toBe('user');
    expect(svg!.iconRef.startsWith('data:image/svg+xml')).toBe(true);
    const shape = svg!.shapes![0]!;
    expect(shape.kind === 'image' && shape.dataUrl.startsWith('data:image/svg+xml')).toBe(true);
    const png = await materializeUserStamp(store, records.find((r) => r.fileName === PNG_A)!.id);
    expect(png!.iconRef.startsWith('data:image/png')).toBe(true);
  });

  it('stores the type from the extension when the file has no type', async () => {
    const { store, source } = await setup();
    const files = [realFile(SVG_DIR, SVG_A, 1000), realFile(PNG_DIR, PNG_A, 1000)];
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files });
    const records = await store.listStamps('src1');
    const svg = await materializeUserStamp(store, records.find((r) => r.fileName === SVG_A)!.id);
    expect(svg!.iconRef.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const png = await materializeUserStamp(store, records.find((r) => r.fileName === PNG_A)!.id);
    expect(png!.iconRef.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns undefined for an unknown stamp', async () => {
    const { store } = await setup();
    expect(await materializeUserStamp(store, 'nope')).toBeUndefined();
  });
});

describe('scanLibraryFolder', () => {
  it('keeps top-level supported files sorted by name and skips folders and other extensions', async () => {
    const svg = realFile(SVG_DIR, SVG_B, 1);
    const png = realFile(PNG_DIR, PNG_A, 2);
    const entries = [
      { kind: 'directory', name: 'sub.svg' },
      { kind: 'file', name: 'notes.txt', getFile: async () => new File(['x'], 'notes.txt') },
      { kind: 'file', name: PNG_A, getFile: async () => png },
      { kind: 'file', name: SVG_B, getFile: async () => svg },
    ];
    const dir = {
      async *values() {
        yield* entries;
      },
    } as unknown as FileSystemDirectoryHandle;
    const files = await scanLibraryFolder(dir);
    expect(files.map((f) => f.name)).toEqual([PNG_A, SVG_B]);
  });
});
