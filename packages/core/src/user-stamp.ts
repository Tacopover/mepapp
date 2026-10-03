// Pure logic for stamps built from files in the user's library folders:
// id/label derivation, native sizing, StampDefinition building, and the
// folder-scan diff. No I/O — @mepapp/platform's LibraryStore records satisfy
// the *Like shapes below structurally, so core never imports platform.

import type { PortSpec } from './geometry.js';
import type { Discipline } from './network.js';
import type { StampDefinition } from './stamp-library.js';
import type { SymbolShapeStyle } from './symbol-shapes.js';

export const USER_STAMP_ID_PREFIX = 'user-';

/** Longer side, in PDF points, of a raster stamp with no edited size. */
export const USER_RASTER_DEFAULT_LONG_SIDE_PT = 40;

/** PDF points per SVG user unit. Must match SVG_UNIT_TO_PT in scripts/generate-stamp-library.mjs. */
export const SVG_UNIT_TO_PT = 0.18;

export type UserStampCategory = 'terminal' | 'equipment';

export interface UserStampEdits {
  label?: string;
  discipline?: Discipline;
  ports?: PortSpec[];
  nativeWidth?: number;
  nativeHeight?: number;
}

export interface UserStampRecordLike {
  id: string;
  fileName: string;
  nativeWidth: number;
  nativeHeight: number;
  edits: UserStampEdits;
}

export interface UserStampSourceLike {
  category: UserStampCategory;
  discipline: Discipline;
}

export interface ScannedLibraryFile {
  fileName: string;
  fileSize: number;
  fileModified: number;
}

export interface UserStampScanRecordLike extends UserStampRecordLike, ScannedLibraryFile {
  missingFromFolder: boolean;
}

// Equal to the Element Editor's DEFAULT_STYLE in packages/ui.
const IMAGE_SHAPE_STYLE: SymbolShapeStyle = { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null };

function splitExtension(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { stem: fileName, ext: '' };
  return { stem: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
}

/** Lower-case ASCII slug of a file name without its extension; 'stamp' when nothing is left. */
export function userStampSlug(fileName: string): string {
  const slug = splitExtension(fileName)
    .stem.toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'stamp' : slug;
}

/** `user-<sourceId>-<slug>`; on a clash appends the extension, then `-2`, `-3`, ... until free. */
export function userStampId(sourceId: string, fileName: string, takenIds: ReadonlySet<string>): string {
  const base = `${USER_STAMP_ID_PREFIX}${sourceId}-${userStampSlug(fileName)}`;
  if (!takenIds.has(base)) return base;
  const ext = splitExtension(fileName).ext.toLowerCase();
  const candidate = ext === '' ? base : `${base}-${ext}`;
  if (!takenIds.has(candidate)) return candidate;
  for (let n = 2; ; n++) {
    const numbered = `${candidate}-${n}`;
    if (!takenIds.has(numbered)) return numbered;
  }
}

/** A readable default label from a file name: extension dropped, `_` and `-` become spaces. */
export function humanizeFileName(fileName: string): string {
  const label = splitExtension(fileName).stem.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  return label === '' ? fileName : label;
}

function readAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2];
}

const UNIT_TO_USER_UNITS: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

function parseLength(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(value);
  if (!match) return undefined;
  const factor = UNIT_TO_USER_UNITS[match[2]!.toLowerCase()];
  if (factor === undefined) return undefined;
  return Number(match[1]) * factor;
}

/** An SVG's intrinsic size in user units from its root <svg> tag (viewBox first, then width/height), or undefined when it has none. */
export function parseSvgIntrinsicSize(svgText: string): { width: number; height: number } | undefined {
  const tagMatch = /<svg(?=[\s>/])((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(svgText);
  if (!tagMatch) return undefined;
  const tag = tagMatch[1]!;
  const valid = (width: number, height: number) =>
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;

  const viewBox = readAttribute(tag, 'viewBox');
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      const size = valid(parts[2]!, parts[3]!);
      if (size) return size;
    }
  }
  const width = parseLength(readAttribute(tag, 'width'));
  const height = parseLength(readAttribute(tag, 'height'));
  if (width === undefined || height === undefined) return undefined;
  return valid(width, height);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Native size in PDF points of an SVG of the given intrinsic size. */
export function svgNativeSize(size: { width: number; height: number }): { nativeWidth: number; nativeHeight: number } {
  return { nativeWidth: round2(size.width * SVG_UNIT_TO_PT), nativeHeight: round2(size.height * SVG_UNIT_TO_PT) };
}

/** Native size in PDF points of a raster image: its longer side is USER_RASTER_DEFAULT_LONG_SIDE_PT. */
export function rasterNativeSize(pixelWidth: number, pixelHeight: number): { nativeWidth: number; nativeHeight: number } {
  const long = USER_RASTER_DEFAULT_LONG_SIDE_PT;
  if (pixelWidth >= pixelHeight) {
    return { nativeWidth: long, nativeHeight: round2((long * pixelHeight) / pixelWidth) };
  }
  return { nativeWidth: round2((long * pixelWidth) / pixelHeight), nativeHeight: long };
}

/** The StampDefinition for one user-library stamp; `imageUrl` is the already-resolved URL of its file (blob: or data:). */
export function buildUserStampDefinition(record: UserStampRecordLike, source: UserStampSourceLike, imageUrl: string): StampDefinition {
  const { edits } = record;
  return {
    id: record.id,
    label: edits.label ?? humanizeFileName(record.fileName),
    discipline: edits.discipline ?? source.discipline,
    category: source.category,
    nativeWidth: edits.nativeWidth ?? record.nativeWidth,
    nativeHeight: edits.nativeHeight ?? record.nativeHeight,
    ports: [...(edits.ports ?? [])],
    iconRef: imageUrl,
    source: 'user',
    shapes: [
      { id: `${record.id}-image`, kind: 'image', dataUrl: imageUrl, x: 0, y: 0, width: 1, height: 1, style: { ...IMAGE_SHAPE_STYLE } },
    ],
  };
}

export interface FolderScanDiff<R extends UserStampScanRecordLike> {
  added: ScannedLibraryFile[];
  updated: { record: R; file: ScannedLibraryFile }[];
  unchanged: R[];
  missing: R[];
}

/** Compares a source's stored records with a fresh folder scan, matching by exact file name. */
export function diffFolderScan<R extends UserStampScanRecordLike>(existing: R[], scanned: ScannedLibraryFile[]): FolderScanDiff<R> {
  const byName = new Map(existing.map((record) => [record.fileName, record]));
  const scannedNames = new Set(scanned.map((file) => file.fileName));
  const added: ScannedLibraryFile[] = [];
  const updated: { record: R; file: ScannedLibraryFile }[] = [];
  const unchanged: R[] = [];
  for (const file of scanned) {
    const record = byName.get(file.fileName);
    if (!record) {
      added.push(file);
    } else if (record.missingFromFolder || record.fileSize !== file.fileSize || record.fileModified !== file.fileModified) {
      updated.push({ record, file });
    } else {
      unchanged.push(record);
    }
  }
  added.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  const missing = existing.filter((record) => !scannedNames.has(record.fileName));
  return { added, updated, unchanged, missing };
}

/** The record after its file was (re)read: new size/modified time/native size, no longer missing, edits kept. */
export function applyScannedFile<R extends UserStampScanRecordLike>(
  record: R,
  file: ScannedLibraryFile,
  nativeSize: { nativeWidth: number; nativeHeight: number },
): R {
  return {
    ...record,
    fileSize: file.fileSize,
    fileModified: file.fileModified,
    nativeWidth: nativeSize.nativeWidth,
    nativeHeight: nativeSize.nativeHeight,
    missingFromFolder: false,
    edits: { ...record.edits },
  };
}
