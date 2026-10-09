// Folder scan, native sizing, sync and materialisation for the user's custom stamp library.
// Pure-ish (no React): the image decoder is a parameter so vitest can run it in Node.

import {
  applyScannedFile,
  buildUserStampDefinition,
  diffFolderScan,
  parseSvgIntrinsicSize,
  rasterNativeSize,
  SAVED_STAMPS_SOURCE_ID,
  svgNativeSize,
  toUserStampEdits,
  userStampId,
  usesUserStampFile,
  type Discipline,
  type StampDefinition,
} from '@mepapp/core';
import { libraryFolderOf, type FileAccess, type LibraryCategory, type LibraryFolderRef, type LibrarySourceRecord, type LibraryStampMimeType, type LibraryStampRecord, type LibraryStore } from '@mepapp/platform';

export type ImageSizeDecoder = (file: Blob) => Promise<{ width: number; height: number }>;

export interface LibrarySyncSummary {
  added: number;
  updated: number;
  unchanged: number;
  missing: number;
}

/** The extensions libraryMimeTypeFor accepts: what a folder scan keeps. */
export const LIBRARY_FILE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg'];

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

export async function createLibrarySource(
  store: LibraryStore,
  input: { name: string; category: LibraryCategory; discipline: Discipline; folder: LibraryFolderRef },
): Promise<LibrarySourceRecord> {
  const { folder, ...rest } = input;
  const source: LibrarySourceRecord = { id: crypto.randomUUID(), ...rest, ...folder };
  const { revision } = await store.putSource(source);
  return { ...source, revision };
}

/** Syncs one source with its folder. Permission is the caller's job. Never removes a stamp; handles one file at a time. */
export async function syncLibrarySource(
  store: LibraryStore,
  source: LibrarySourceRecord,
  opts: { decode: ImageSizeDecoder; files?: File[]; fileAccess?: FileAccess },
): Promise<LibrarySyncSummary> {
  let files = opts.files;
  if (!files) {
    const folder = libraryFolderOf(source);
    if (!folder || !opts.fileAccess) throw new Error(`Library source "${source.name}" has no folder handle and no files were given.`);
    files = await opts.fileAccess.readFolder(folder, LIBRARY_FILE_EXTENSIONS);
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
  if (!source) return undefined;
  if (!blob) return usesUserStampFile(record.edits) ? undefined : buildUserStampDefinition(record, source, undefined);
  return buildUserStampDefinition(record, source, await blobToDataUrl(blob));
}

async function findStampRecord(store: LibraryStore, stampId: string): Promise<LibraryStampRecord> {
  const record = (await store.listStamps()).find((candidate) => candidate.id === stampId);
  if (!record) throw new Error(`Unknown library stamp "${stampId}".`);
  return record;
}

/** Hides (or unhides) a stamp in the panel. The file stays in its folder and a sync keeps the flag. */
export async function setUserStampHidden(store: LibraryStore, stampId: string, hidden: boolean): Promise<void> {
  const record = await findStampRecord(store, stampId);
  const { hidden: _previous, ...rest } = record;
  await store.putStamp(hidden ? { ...rest, hidden: true } : rest);
}

/** Clears the hidden flag on every stamp of one source. */
export async function showHiddenStamps(store: LibraryStore, sourceId: string): Promise<void> {
  for (const record of await store.listStamps(sourceId)) {
    if (record.hidden) await setUserStampHidden(store, record.id, false);
  }
}

/** Removes a "Saved stamps" stamp for good. A folder stamp can only be hidden. */
export async function deleteSavedStamp(store: LibraryStore, stampId: string): Promise<void> {
  const record = await findStampRecord(store, stampId);
  if (record.sourceId !== SAVED_STAMPS_SOURCE_ID) {
    throw new Error(`Stamp "${stampId}" comes from a library folder and can only be hidden, not deleted.`);
  }
  await store.removeStamp(stampId);
}

/** Save from the Element Editor: stores the edited definition in the record's edits. Returns the materialized definition. */
export async function saveUserStampEdits(store: LibraryStore, stampId: string, definition: StampDefinition): Promise<StampDefinition | undefined> {
  const record = await findStampRecord(store, stampId);
  const blob = await store.getStampBlob(stampId);
  const fileDataUrl = blob ? await blobToDataUrl(blob) : undefined;
  await store.putStamp({ ...record, edits: toUserStampEdits(definition, fileDataUrl) });
  return materializeUserStamp(store, stampId);
}

/** Save as: creates a new stamp in the "Saved stamps" source. Returns the materialized definition. */
export async function saveUserStampAs(store: LibraryStore, fromStampId: string, definition: StampDefinition): Promise<StampDefinition | undefined> {
  const category: LibraryCategory = definition.category === 'equipment' ? 'equipment' : 'terminal';
  if (!(await store.listSources()).some((source) => source.id === SAVED_STAMPS_SOURCE_ID)) {
    await store.putSource({ id: SAVED_STAMPS_SOURCE_ID, name: 'Saved stamps', category, discipline: definition.discipline });
  }
  const records = await store.listStamps();
  const from = records.find((candidate) => candidate.id === fromStampId);
  const blob = await store.getStampBlob(fromStampId);
  const fileDataUrl = blob ? await blobToDataUrl(blob) : undefined;
  const id = userStampId(SAVED_STAMPS_SOURCE_ID, definition.label, new Set(records.map((record) => record.id)));
  const edits = { ...toUserStampEdits(definition, fileDataUrl), category };
  await store.putStamp(
    {
      id,
      sourceId: SAVED_STAMPS_SOURCE_ID,
      fileName: definition.label,
      mimeType: from?.mimeType ?? 'image/png',
      fileSize: 0,
      fileModified: Date.now(),
      missingFromFolder: false,
      nativeWidth: definition.nativeWidth,
      nativeHeight: definition.nativeHeight,
      edits,
    },
    usesUserStampFile(edits) ? blob : undefined,
  );
  return materializeUserStamp(store, id);
}

/** True when a library, custom or user definition already has this label (or Dutch label), ignoring case and outer spaces. */
export function userStampLabelTaken(label: string, definitions: StampDefinition[]): boolean {
  const wanted = label.trim().toLowerCase();
  return definitions.some((definition) => definition.label.trim().toLowerCase() === wanted || definition.labelNl?.trim().toLowerCase() === wanted);
}
