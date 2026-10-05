// @ts-ignore -- ui has no @types/node; vitest runs this file in Node
import { readFileSync as nodeReadFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryLibraryStore } from '@mepapp/platform';
import type { LibrarySourceRecord } from '@mepapp/platform';
import { parseSvgIntrinsicSize, SAVED_STAMPS_SOURCE_ID, SVG_UNIT_TO_PT, USER_STAMP_FILE_REF, type StampDefinition, type SymbolShape } from '@mepapp/core';
import {
  libraryMimeTypeFor,
  deleteSavedStamp,
  materializeUserStamp,
  saveUserStampAs,
  saveUserStampEdits,
  scanLibraryFolder,
  setUserStampHidden,
  showHiddenStamps,
  syncLibrarySource,
  userStampLabelTaken,
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

describe('hide, save and delete', () => {
  const style = { stroke: '#000', strokeWidth: 1, fill: null };
  const line: SymbolShape = { id: 'trace-1', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style };

  async function syncedSetup() {
    const { store, source } = await setup();
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles() });
    const record = (await store.listStamps('src1')).find((r) => r.fileName === SVG_A)!;
    return { store, source, id: record.id };
  }

  it('keeps hidden through a sync update and does not re-add the stamp; showHiddenStamps clears it', async () => {
    const { store, source, id } = await syncedSetup();
    await setUserStampHidden(store, id, true);
    expect((await store.listStamps('src1')).find((r) => r.id === id)!.hidden).toBe(true);
    const summary = await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles(2000) });
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(4);
    const records = await store.listStamps('src1');
    expect(records).toHaveLength(4);
    expect(records.find((r) => r.id === id)!.hidden).toBe(true);
    await showHiddenStamps(store, 'src1');
    expect((await store.listStamps('src1')).every((r) => r.hidden === undefined)).toBe(true);
  });

  it('saveUserStampEdits stores the marker instead of the file data URL and materializes the file back', async () => {
    const { store, id } = await syncedSetup();
    const def = (await materializeUserStamp(store, id))!;
    const fileUrl = (def.shapes![0] as { dataUrl: string }).dataUrl;
    const saved = (await saveUserStampEdits(store, id, { ...def, label: 'Traced', category: 'equipment', shapes: [...def.shapes!, line], iconRef: 'data:image/png;base64,PREVIEW' }))!;
    const record = (await store.listStamps()).find((r) => r.id === id)!;
    expect(record.edits.shapes!.map((s) => (s.kind === 'image' ? s.dataUrl : s.kind))).toEqual([USER_STAMP_FILE_REF, 'line']);
    expect(JSON.stringify(record.edits)).not.toContain(fileUrl);
    expect(saved.label).toBe('Traced');
    expect(saved.category).toBe('equipment');
    expect(saved.iconRef).toBe('data:image/png;base64,PREVIEW');
    expect(saved.shapes).toHaveLength(2);
    expect((saved.shapes![0] as { dataUrl: string }).dataUrl).toBe(fileUrl);
  });

  it('with the image deleted stores no marker, and a later file update keeps the edits', async () => {
    const { store, source, id } = await syncedSetup();
    const def = (await materializeUserStamp(store, id))!;
    const saved = (await saveUserStampEdits(store, id, { ...def, shapes: [line] }))!;
    expect(saved.shapes).toEqual([line]);
    expect((await store.listStamps()).find((r) => r.id === id)!.edits.shapes).toEqual([line]);
    await syncLibrarySource(store, source, { decode: pngHeaderDecoder, files: makeFiles(5000) });
    const after = (await materializeUserStamp(store, id))!;
    expect(after.shapes).toEqual([line]);
  });

  it('materializes a stamp whose blob is missing only when it does not use the file', async () => {
    const { store } = await setup();
    await store.putStamp({ id: 'user-src1-x', sourceId: 'src1', fileName: 'x.png', mimeType: 'image/png', fileSize: 0, fileModified: 1, missingFromFolder: false, nativeWidth: 10, nativeHeight: 10, edits: {} });
    expect(await materializeUserStamp(store, 'user-src1-x')).toBeUndefined();
    await store.putStamp({ id: 'user-src1-x', sourceId: 'src1', fileName: 'x.png', mimeType: 'image/png', fileSize: 0, fileModified: 1, missingFromFolder: false, nativeWidth: 10, nativeHeight: 10, edits: { shapes: [line] } });
    expect((await materializeUserStamp(store, 'user-src1-x'))!.shapes).toEqual([line]);
  });

  it('saveUserStampAs creates the saved source once and copies the blob only when the marker is used', async () => {
    const { store, id } = await syncedSetup();
    const def = (await materializeUserStamp(store, id))!;
    const first = (await saveUserStampAs(store, id, { ...def, label: 'My Copy' }))!;
    expect(first.id).toBe('user-saved-my-copy');
    expect(first.source).toBe('user');
    expect(first.category).toBe('terminal');
    expect(await store.getStampBlob('user-saved-my-copy')).toBeDefined();
    const traced = (await saveUserStampAs(store, id, { ...def, label: 'Traced Only', category: 'equipment', shapes: [line] }))!;
    expect(traced.id).toBe('user-saved-traced-only');
    expect(traced.category).toBe('equipment');
    expect(await store.getStampBlob('user-saved-traced-only')).toBeUndefined();
    expect(traced.shapes).toEqual([line]);
    expect((await store.listSources()).filter((s) => s.id === SAVED_STAMPS_SOURCE_ID)).toHaveLength(1);
    const second = (await saveUserStampAs(store, id, { ...def, label: 'My Copy' }))!;
    expect(second.id).not.toBe(first.id);
  });

  it('deleteSavedStamp removes a saved stamp and rejects a folder stamp', async () => {
    const { store, id } = await syncedSetup();
    const def = (await materializeUserStamp(store, id))!;
    await saveUserStampAs(store, id, { ...def, label: 'Gone' });
    await expect(deleteSavedStamp(store, id)).rejects.toThrow(/folder/);
    await deleteSavedStamp(store, 'user-saved-gone');
    expect((await store.listStamps()).some((r) => r.id === 'user-saved-gone')).toBe(false);
  });
});

describe('userStampLabelTaken', () => {
  const defs = [{ label: 'Fan Coil', labelNl: 'Ventilatorconvector' }] as StampDefinition[];
  it('compares case-insensitively on trimmed label and labelNl', () => {
    expect(userStampLabelTaken('  fan coil ', defs)).toBe(true);
    expect(userStampLabelTaken('VENTILATORCONVECTOR', defs)).toBe(true);
    expect(userStampLabelTaken('Fan', defs)).toBe(false);
  });
});
