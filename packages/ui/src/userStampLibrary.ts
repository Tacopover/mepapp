// Folder scan, native sizing, sync and materialisation for the user's custom stamp library.
// Pure-ish (no React): the image decoder is a parameter so vitest can run it in Node.

import {
  applyScannedFile,
  buildUserStampDefinition,
  diffFolderScan,
  parseSvgIntrinsicSize,
  rasterNativeSize,
  svgNativeSize,
  userStampId,
  type Discipline,
  type StampDefinition,
} from '@mepapp/core';
import type { LibraryCategory, LibrarySourceRecord, LibraryStampMimeType, LibraryStore } from '@mepapp/platform';

export type ImageSizeDecoder = (file: Blob) => Promise<{ width: number; height: number }>;

export interface LibrarySyncSummary {
  added: number;
  updated: number;
  unchanged: number;
  missing: number;
}

export function supportsLibraryFolders(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function libraryMimeTypeFor(fileName: string): LibraryStampMimeType | undefined {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return undefined;
  switch (fileName.slice(dot + 1).toLowerCase()) {
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return undefined;
  }
}

/** Top level of the folder only: files with a supported extension, sorted by name. Subfolders are skipped. */
export async function scanLibraryFolder(dir: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== 'file' || libraryMimeTypeFor(handle.name) === undefined) continue;
    files.push(await (handle as FileSystemFileHandle).getFile());
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Decodes the pixel/intrinsic size in the browser. Never inserts an SVG as markup: it loads through an <img>. */
export const browserImageSizeDecoder: ImageSizeDecoder = async (file) => {
  if (file.type === 'image/svg+xml' || (file instanceof File && libraryMimeTypeFor(file.name) === 'image/svg+xml')) {
    const url = URL.createObjectURL(file.type === 'image/svg+xml' ? file : new Blob([file], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
};

export async function readNativeSize(
  file: File,
  mimeType: LibraryStampMimeType,
  decode: ImageSizeDecoder,
): Promise<{ nativeWidth: number; nativeHeight: number }> {
  if (mimeType === 'image/svg+xml') {
    const intrinsic = parseSvgIntrinsicSize(await file.text());
    if (intrinsic) return svgNativeSize(intrinsic);
  }
  const { width, height } = await decode(file);
  // An SVG with no size at all can decode to 0 x 0: fall back to the square raster default.
  if (!(width > 0 && height > 0)) return rasterNativeSize(1, 1);
  return mimeType === 'image/svg+xml' ? svgNativeSize({ width, height }) : rasterNativeSize(width, height);
}

/** The file with its type set from the extension: getFile() can return an empty type, and the stored blob's type becomes the data: URL's type. */
function typedBlob(file: File, mimeType: LibraryStampMimeType): Blob {
  return file.type === mimeType ? file : new Blob([file], { type: mimeType });
}

/** Must run inside a click handler: requestPermission needs a user gesture. */
export async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

export async function createLibrarySource(
  store: LibraryStore,
  input: { name: string; category: LibraryCategory; discipline: Discipline; dirHandle: FileSystemDirectoryHandle },
): Promise<LibrarySourceRecord> {
  const source: LibrarySourceRecord = { id: crypto.randomUUID(), ...input };
  const { revision } = await store.putSource(source);
  return { ...source, revision };
}

/** Syncs one source with its folder. Permission is the caller's job. Never removes a stamp; handles one file at a time. */
export async function syncLibrarySource(
  store: LibraryStore,
  source: LibrarySourceRecord,
  opts: { decode: ImageSizeDecoder; files?: File[] },
): Promise<LibrarySyncSummary> {
  let files = opts.files;
  if (!files) {
    if (!source.dirHandle) throw new Error(`Library source "${source.name}" has no folder handle and no files were given.`);
    files = await scanLibraryFolder(source.dirHandle);
  }
  const filesByName = new Map(files.map((file) => [file.name, file]));
  const existing = await store.listStamps(source.id);
  const taken = new Set((await store.listStamps()).map((record) => record.id));
  const diff = diffFolderScan(
    existing,
    files.map((file) => ({ fileName: file.name, fileSize: file.size, fileModified: file.lastModified })),
  );

  for (const scanned of diff.added) {
    const file = filesByName.get(scanned.fileName)!;
    const mimeType = libraryMimeTypeFor(file.name)!;
    const id = userStampId(source.id, scanned.fileName, taken);
    taken.add(id);
    const size = await readNativeSize(file, mimeType, opts.decode);
    await store.putStamp(
      {
        id,
        sourceId: source.id,
        fileName: scanned.fileName,
        mimeType,
        fileSize: scanned.fileSize,
        fileModified: scanned.fileModified,
        missingFromFolder: false,
        ...size,
        edits: {},
      },
      typedBlob(file, mimeType),
    );
  }
  for (const { record, file: scanned } of diff.updated) {
    const file = filesByName.get(scanned.fileName)!;
    const size = await readNativeSize(file, record.mimeType, opts.decode);
    await store.putStamp(applyScannedFile(record, scanned, size), typedBlob(file, record.mimeType));
  }
  for (const record of diff.missing) {
    if (!record.missingFromFolder) await store.putStamp({ ...record, missingFromFolder: true });
  }

  const current = (await store.listSources()).find((candidate) => candidate.id === source.id) ?? source;
  await store.putSource({ ...current, lastSyncedAt: Date.now() });
  return { added: diff.added.length, updated: diff.updated.length, unchanged: diff.unchanged.length, missing: diff.missing.length };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** The full definition with a `data:` URL, safe to put in a project document. Undefined when the stamp, source or blob is missing. */
export async function materializeUserStamp(store: LibraryStore, stampId: string): Promise<StampDefinition | undefined> {
  const record = (await store.listStamps()).find((candidate) => candidate.id === stampId);
  if (!record) return undefined;
  const source = (await store.listSources()).find((candidate) => candidate.id === record.sourceId);
  const blob = await store.getStampBlob(stampId);
  if (!source || !blob) return undefined;
  return buildUserStampDefinition(record, source, await blobToDataUrl(blob));
}
